# VM upgrade R1 correction — author report, 2026-10-19

Author: **Claude Opus 5.5 (`claude-opus-5-5`), effort high**, T3 delegated task; `t3_thread_configuration` returned exactly that selection. Binding: T3 worktree `t3-a396d37c`, branch `t3/fix-vm-upgrade-safety`, starting clean at `c8707a3c369b2f84f5f9bdf3cd5c7355799b960a`. No child agents. Fleet `/work/repos/fleet` (`678cc2d`) and `origin/t3/unraid-full-access` (`1d6cf7e`) were read only; its untracked `docs/mini-pc-buying-research.md` was left alone.

**No host query, staging write, ask submission, shutdown/start, VM/service/resource change, credential read, browser, push or PR occurred.** Worker-local read-only checks only: user unit enablement/ports and linger, to complete `worker-check.sh post`. No game source or game test was touched or run. This report does not claim real-host acceptance or any VM change.

[REVIEW-SOL-R1.md](REVIEW-SOL-R1.md), [COORDINATOR-R1.md](COORDINATOR-R1.md), [EVIDENCE.md](EVIDENCE.md) and [evidence/offline-tests.txt](evidence/offline-tests.txt) are unchanged historical records.

## Frozen candidate

Source commit **`d2998888c15148b93144f3e21f375b6a90aede46`** (scripts, tests, current [RUNBOOK](RUNBOOK.md)).

| File | SHA-256 |
| --- | --- |
| `vm-ram-upgrade.sh` | **`b9e14335e5027ed122686117ae69c34f4d674c2715696757a63048fcccab59d5`** (was `89cce673…`) |
| `ask-command.sh` | `5ad70fc380656fc865f6c249872b62d0b72bac17cfac7b0131031a01e8504f21` (unchanged; it pins the hash above) |
| `worker-check.sh` | `8d9e9d684ae37d30f72080a328e1723e5a96ee8983a2c775d50c8208f06217b1` |
| `restore-tmp-links.sh` | `61fce7467ad2f50e3d5e9a5484f30db24beac53d9cabe126e0ec82739f3ad580` |
| `tests/run.sh` | `55e8533f1dd14d57342a4082dde7105a4bbd1b132aeb4b28d0aa0d5345c2830e` |
| `tests/checks.sh` | `47bb908c551f0f45fa79f47499c3e3e6710c3f3e57d2f47a1477f8c59b8bd556` |
| `tests/fake-virsh.sh` | `e81ed3f1418d702673f93ad7b52dbe9f824afe770708fd3ac80f9f73728a1602` |

The approval text now printed by `bash ask-command.sh` pins `b9e14335…`. Any further script change changes the hash and needs review again.

## Findings and their handling

### SOL-R1-01 (P1) — unknown memory authorized a start

- `observe` now fails, with `READ_ERR`, if the state or either definition cannot be read or any memory field is not a positive KiB number. `domstate` returns failure instead of an empty string, and all `virsh` calls go through `timeout` (120 s), so a hung call counts as a failed read.
- `read_vm`/`examine` repeat failed reads up to 5 tries, 3 s apart. Identity reads that fail are retried too; if they still fail they count as a mismatch, never as a match.
- Every start (`upgrade_offline`, `start_as_is`, `recover_old`) uses the defined **maximum** from a successful fresh read. `have_room` itself also rejects a non-numeric operand or unreadable `MemAvailable`. If memory stays unknown, the run ends `left-off` (30), alert, without `virsh start`.
- Tests: the review's exact case (16 GiB defined, definition unreadable once off, 15 GiB free) → `left-off`, no start, alert and syslog. The same through the start-as-is branch. Two failed reads then success → upgraded, with retries logged. `MemAvailable` unreadable once off → rolled back to 12 GiB, left off, never started. Malformed defined memory → refused, and preflight reports it.

### SOL-R1-02 (P2) — decisions made before the lock

- Before the shutdown the run records the definition without its memory lines (`definition-reference.xml`, `REF`). At the end of the arm window that must still match; any edit stops the run before the shutdown.
- `upgrade_offline` takes Fleet's lock in the main shell (fd 9) **first**, then re-reads and decides: running → `restarted-elsewhere`, no write; anything besides memory differs from `REF`, identity mismatch, or memory outside the expected states → no write, start as is (`changed-while-off.txt`). `set_memory` additionally checks its own pre-write snapshot against the reference (returns 4 without writing on mismatch) and its post-write snapshot (returns 3). Capacity check and start happen while the lock is still held; the lock is released before verification and the guest-agent wait.
- Recovery runs only inside that locked section. It re-reads first: running → `restarted-elsewhere` without writing 12 GiB; it only rolls back memory this run set (16/16 or 16/12), using the fresh definition as reference, so a concurrent edit is kept and recorded (`changed-besides-memory.txt`).
- Lock busy for 120 s → memory unchanged, start as is (formerly a rollback label).
- The RUNBOOK's **exclusion window** now states that Fleet's `vm start/shutdown/resize/force-off` and the Unraid UI do not take the lock, and lists what the owner must not do from submission until the result arrives. No total-serialization claim remains.
- Tests: the review's two interleavings under a held Fleet lock (pin edit → `started-as-is`, no memory call, pins kept; concurrent start → `restarted-elsewhere`, 12/12 defined and running), plus a non-identity definition edit during the lock wait, a start by someone else during recovery (no 12 GiB write) and a pin edit during the change (memory rolled back, pins kept, never redefined). Also a definition edit and a running topology change during the arm window.

### SOL-R1-03 (P2) — record failures did not stop disruption or success

- `put_file` writes every record through a fresh `mktemp` file beside it, `chmod 644`, then `mv -fT`. It returns real failure and never writes inside a folder of the record's name. `set_phase`, `save` and `log` record failures in `EVIDENCE_ERRORS`.
- `ready_to_disrupt` runs immediately before the ACPI shutdown, or before any change when the VM was already off. It refuses with `preflight-failed` if any record so far (state, log, reference) failed, if the run folder has under 10 MiB free, or if something occupies `result.json`. The backup and the backup folder are checked as before.
- After the shutdown, failures are noted and the VM path continues. `finish` turns a would-be success into `evidence-incomplete` (23, `vm_outcome` kept, `evidence_errors` listed). If `result.json` cannot be published the exit is 32. Every finish sends the Unraid notification **and** a syslog line (`logger -t fleet-vm-upgrade`); the subject leads with the VM outcome and adds `records incomplete` / `result NOT written`. Exit 0 requires every record and the published result.
- `need_tools` (now also `logger`, `mktemp`, `df`, `diff`, … and the `notify` script) runs in `preflight`, `launch` and at the start of every run, including the rehearsal.
- Tests: the review's exact setup (folders at the old fixed temp names) now upgrades and publishes. `state.json`, the reference and the backups unwritable → refused before shutdown. `result.json` occupied before → refused, exit 32 with alert and syslog. A record fails after the shutdown → VM upgraded, `evidence-incomplete`/23. `result.json` blocked after the shutdown → VM upgraded, exit 32, alert says `upgraded, result NOT written`. A real full disk (16 MiB tmpfs) before the run → nothing called, exit 32. Full once off → VM upgraded, exit 32, alert says `upgraded, records incomplete, result NOT written`. `notify` missing → refused, outcome still in syslog.

### SOL-R1-04 (P2) — states outside the matrix accepted

- `classify` is now an explicit table (RUNBOOK "States it handles"): running 12/12 or 16/12 with live 12/12 → full; running 16/16 with live 12/12 → restart; running 16/16 with live 16/16 → done; off 12/12 or 16/12 → change; off 16/16 → start. Everything else is refused before anything is stopped.
- `check_live` verifies the running VM's vCPU count, `virsh vcpupin` pins, topology and disks whenever it runs. That covers the initial check, the end of the arm window, the no-op and post-arm `done` paths (refused, not `already-upgraded`, when they differ, and never stopped to make them match) and the post-start verification. That verification also requires the definition to equal `REF` apart from memory.
- Tests: the review's exact cases (defined 12/running 8 → refused, not stopped; 16 GiB with other running pins → refused, preflight reports it). Also defined 12/running 16, a ballooned 16/12 running VM, an upgrade by someone else during the arm window with other running pins, and a running topology that differs initially or changes while armed. The old post-boot pin test now sets its pins at the start, as it intended.

### SOL-R1-05 (P2) — restore reported success without restoring

- `ln -sT`, so a folder that appears between the check and `ln` makes `ln` fail instead of receiving a nested link. On failure the script re-checks: the expected link → counted as linked; any other entry → kept and reported; nothing → `failed`. The exit is 1 on any failure or missing extraction entry. A missing `/tmp` folder stops it before anything else.
- Tests: missing `/tmp` folder → exit 1; `ln` failing (wrapper) → exit 1 with `failed: 3`; a folder created just before `ln` → kept, no symlink anywhere inside, owner data intact.

## Additional changes

- `worker-check.sh`: `pre` requires the rehearsal's exit code 0; `post` requires `upgraded` **and** exit code 0, and adds :9100, `is-enabled` for `t3code`/`fleet-dashboard-v2`/`fleet-dashboard`/`fleet-status`, and linger. The cgroup check stays a WARN that must be inspected.
- The rehearsal now also takes and releases Fleet's lock, checks the backup folder can be written, requires its records to be written and re-reads the VM after the hold, comparing state, plan and the definition reference. It still writes no backup and changes nothing.
- New outcomes: `evidence-incomplete` (23), `needs-owner` (30, neither running nor off after the shutdown), and exit 32 for an unpublished result. A non-zero result that leaves the VM not running notifies at `alert`.
- **Test harness defect found and fixed.** `is "name" [ a ] && [ b ]` is parsed as `(is "name" [ a ]) && [ b ]`, so `is` only judged the first condition; six pre-existing checks had this form (wrong-hash launch, separate session, dry run, wrong archive hash, apply, collision untouched). All compound checks now use `is "name" all '<a> && <b>'`. The restore race case exposed it: before the fix it passed even against the original script.
- RUNBOOK rewritten as the current procedure. Broad "every failure recovers" wording is replaced by explicit start conditions and an owner-limitations section. The coordinator's timing/reserve/notification/no-force-off choices are recorded as decisions.

## Actual checks

All offline in bwrap (fake `virsh`, `notify` and now `logger`; scratch under `/work/tmp`; one 16 MiB tmpfs for the full-disk cases).

- `bash docs/build/vm-upgrade/tests/run.sh` on `d299888`: **211 passed, 0 failed**, three consecutive runs (49 s, 47 s, 52 s). Includes `bash -n` of all four scripts, the original upgrade, re-entry, arm-window, shutdown, change, start and kill cases, and the `approve.sh`-runner group-kill/SIGHUP and rehearsal-detachment cases. [Transcript](evidence/offline-tests-r1.txt).
- The same new suite against the **original** scripts (`89cce673…`, `411f5ee8…`): **154 passed, 57 failed**. Every reproduced review fault is among the failures. [Transcript](evidence/r1-original-vs-new-tests.txt).
- **Mutation trials**: 13 single mutations, each re-breaking one correction. **12 caught.** The miss is `have_room` accepting an unknown operand: it cannot be reached while `observe`/`read_vm` correctly refuse unreadable memory (defense in depth). A combined mutation breaking both layers is caught by the review's exact case and five others. [Results](evidence/r1-mutations.txt).
- **Reviewer's probe harness** rerun on a copy with byte-identical `probes.sh`, the corrected scripts, its own path and a fake `logger` (originals in `/work/tmp/sol-vmu-r1-9987231/` untouched). All nine correctable probes now end safely; TERM after power-off still gives `aborted`/31 with the VM off (documented limitation). [Output](evidence/r1-sol-probes-rerun.txt).
- `shellcheck` is not installed on this worker, so it was not run.

Evidence SHA-256: `offline-tests-r1.txt` `2564313a4f1f45bd34b16ae0a8317e15fa1dec6818f650d95ce3333fa3464e1e`, `r1-original-vs-new-tests.txt` `893950ef03891658128cbe6225f10f1786bc618d2dc6797fe4119e637cf46e0c`, `r1-mutations.txt` `e4a5988e2fc068994211402d9183fdd484ed8b1c576c2e31fd28abc3ce5254d9`, `r1-sol-probes-rerun.txt` `4f893ec23dd7305c3166f18c01baa6b66087cb4d896ce68409c9ed72b3b6ce3d`.

## Remaining limitations (honest)

- **Owner-side recovery remains for:** the run being killed after power-off (signal, host reboot, OOM kill), and a guest that powers off after `shutdown-timeout`. Both leave the VM off; the owner relaunches from the web terminal or starts it. Nothing inside the guest can do this. No force-off and no whole-definition restore were added.
- **Lock coverage.** Fleet's `vm start/shutdown/resize/force-off` and the Unraid UI do not take Fleet's lock; the run detects most interleavings by re-reading after it takes the lock, but only the owner's exclusion window prevents them. A non-cooperating edit landing between the final pre-write check and `setmaxmem` is caught by the post-write comparison (memory rolled back, edit kept), not prevented.
- **Unproved on the real host** (the rehearsal covers only the read-only parts): libvirt giving the same inactive definition text while running and once off (if not, the run safely ends `started-as-is` at 12 GiB, costing a window); running `dumpxml`/`vcpupin` formats; memory clamping; Unraid `logger`/`notify`/GNU `mv -T`/`mktemp` behaviour (checked present by the run, not exercised until a finish); a 16 GiB boot; post-boot services and cgroups. The live `approve.sh`/`fleet-admin.sh` are assumed to match the inspected branch.
- **Fakes.** The fake models libvirt reads, states and failures; it cannot prove real libvirt timing or error texts. The full-disk cases use a tmpfs, not Unraid's array/FUSE behaviour.
- If `notify` fails, the owner learns the outcome only from syslog, the run folder or by checking. That stays within the coordinator's "existing Unraid alert" choice.

## Next safe actions

1. Root inspects `d299888` and this report, then dispatches a **fresh non-author Sol 6.1/xhigh review** of the frozen candidate with the original brief, REVIEW-SOL-R1, COORDINATOR-R1 and this report.
2. Only after a READY-FOR-STAGING verdict: stage the script, confirm its hash is `b9e14335…` (or the re-reviewed successor), submit the **rehearsal** ask and accept it only against the RUNBOOK criteria.
3. With the owner's agreement to the exclusion window and the worker ready to go down, submit the real request. Afterwards run `worker-check.sh post`, inspect any WARN, and optionally `restore-tmp-links.sh`.
4. Then update Fleet `machines.yaml`/`docs/STATE.md` on a Fleet feature branch. Siltwake stays paused until the owner asks to resume.
