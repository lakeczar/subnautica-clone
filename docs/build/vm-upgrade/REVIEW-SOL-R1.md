# Factory-worker RAM upgrade — independent Sol R1

**Verdict: CHANGES-REQUIRED.** Five substantiated findings prevent READY-FOR-STAGING on this candidate. This is a review of the infrastructure bundle, not an upgrade-completed or real-host acceptance report. The owner-selected timing/reserve defaults and Unraid notification choice need no further decision.

## Reviewer and frozen source

- Fresh non-author reviewer: **GPT-6.1 Sol, `gpt-6.1-sol`, `reasoningEffort: xhigh`, provider instance `codex`**. T3 `t3_thread_configuration` explicitly returned these effective settings; the live catalog also offers the requested model/effort. No substitution or child delegation occurred.
- T3-owned isolated subagent thread: `thread:delegated-task:command%3Amcp%3Aa0ea5750-ee35-4cb7-a2fc-48f13695e559%3Adelegate-task%3Asiltwake-vm-upgrade-sol-xhigh-r1-9987231`; parent `9604e156-62da-418c-98f6-73a49ed8de4d`. T3 reports relationship `subagent`, run ordinal 1, branch `t3/review-ram-upgrade`, and worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-82d7c251`.
- Initial HEAD was exactly **`99872314628302333f4b467f19b82a673bd8652b`**, with empty `git status --short`. The bundle has no diff against author **`7ad1f49e96d811dfb9e2b64adc67d503159170e9`**. Author identity/effort is attributed to the brief and EVIDENCE.md; I did not independently inspect the author's runtime.
- Reviewed main script SHA-256: **`89cce673e35663fb73a68eb5217c92a7fd78545fc07474c8aada9dd74fd3d1d4`**. The other three script hashes match EVIDENCE.md. Production scripts were not edited.

Read the entire runbook, evidence, four operational scripts and all three test files, VM handoff/model policy, build checkpoint/plan/contracts and independent-review gate. Infrastructure attribution: Fleet `/work/repos/fleet` at `678cc2d25a9698c70276a0e6025fbbc654de7890`, its AGENTS.md/STATE.md, and `origin/t3/unraid-full-access` at **`1d6cf7ed729302f4ba58923128c31da9b2e921f3`**, especially `fleet-admin.sh`, `approve.sh` and `approve-listener.php`. That branch is source evidence, not proof of the installed host implementation.

## Blocking findings

### SOL-R1-01 — P1: An unreadable definition bypasses recovery capacity protection

`vm-ram-upgrade.sh:93–105,154–160,337–343,364–366`.

After shutdown, a failed `virsh dumpxml --inactive` leaves `CFG_CUR` empty. `check_identity` rejects it, but the caller enters `start_as_is`, which observes again and calls `have_room "${CFG_CUR:-0}"`. Thus an unknown RAM requirement becomes zero. `recover_old` has a related unchecked empty argument to the same arithmetic. A transient libvirt read failure must not permit an unbudgeted start, especially with Hermes sharing a host without swap.

**Reproduced:** valid re-entry state, persistent 16 GiB/running 12 GiB; inject inactive-XML read failures once off and leave 15 GiB MemAvailable. The script logs `needs 0 KiB plus the 2097152 KiB reserve`, issues `virsh start`, and returns `started-as-is`/21 with a 16 GiB configuration. The required 18 GiB check was skipped. The fake demonstrates the command decision, not a real host OOM.

**Smallest correction:** propagate observation/read failures, reject missing/malformed capacity operands, and require an authoritative positive configured-memory value before every start/recovery capacity decision. Retry reads within a bound; if still unknown, record/alert `left-off` rather than treating unknown as zero. Add this failure test.

### SOL-R1-02 — P2: The Fleet lock protects writes but not the decisions authorizing them

`vm-ram-upgrade.sh:220–246,348–366,513–532`; Fleet branch `fleet-admin.sh:515–543`.

The post-shutdown state/identity observation happens **before** waiting up to 120 s for Fleet's lock. Inside the lock, `set_memory` takes a new XML snapshot without comparing it with the validated one or rechecking that the VM is still off. Its before/after diff therefore accepts an intervening edit as the new baseline. Recovery similarly observes outside the lock.

**Reproduced:** hold Fleet's lock, let the script reach the change and wait, then change pins and release the lock. The script writes 16 GiB and starts with the changed pins (`started-unverified`/22), rather than leaving memory untouched as promised for an intervening identity edit. In a second probe, start the VM at 12 GiB before releasing the lock: the script still writes persistent 16 GiB and only afterwards returns `restarted-elsewhere`/21, leaving live 12/persistent 16. The non-memory edit itself is preserved; this finding does not allege that memory-only virsh calls overwrite it.

The inspected Fleet source takes this lock for `vm define`/snapshot/revert, but **not `vm start`, `vm shutdown` or `vm resize`**. A lock around `set_memory` cannot alone support the broader serialization claim. The runbook already excludes owner UI edits during the window, which is useful but does not close this cooperating-lock race.

**Smallest correction:** after acquiring the lock, freshly validate off state, allowed memory state and the relevant previously validated non-memory snapshot before changing memory; make the same checks in recovery. Keep the mutation/start decision in a coherent guarded section. Explicitly account for helper operations that do not share the lock through the operational exclusion window; do not imply the existing lock controls them. Add the two interleavings above. No broader SSH route is needed.

### SOL-R1-03 — P2: Evidence-write failures do not stop disruption or invalidate success

`vm-ram-upgrade.sh:165–174,177–198,223–238,450–464,494–503`.

`set_phase` masks write/rename errors with its final log command, and callers do not check it. Several definition-evidence writes are unchecked. `finish` sets `FINISHED=1` before publishing `result.json`, ignores publication failure, and still sends the requested success notification and exit code. These are control-flow problems independent of whether the volume usually has space.

**Reproduced:** make `.state.json.tmp` and `.result.json.tmp` unwritable as files by placing directories at those names in a fresh run folder. Despite repeated redirection errors, the unchanged script shuts down, changes memory, starts, logs `RESULT upgraded`, and exits **0 with no `result.json`**. A full/read-only volume can fail the same write operations. This defeats the persisted evidence/result contract and makes launcher/status interpretation unreliable.

**Smallest correction:** make bookkeeping helpers return actual I/O status and check critical writes/renames. Before shutdown, refuse disruption if the durable log/state/backup path cannot be used. After shutdown, retain the VM recovery path while reporting evidence failure through a checked alternate host alert/log and a nonzero outcome. Never report exit-0 success when the result was not published. Add pre-shutdown and post-shutdown write-failure cases; adding `set -e` alone is not a recovery strategy.

### SOL-R1-04 — P2: Live-state validation accepts states the re-entry contract excludes

`vm-ram-upgrade.sh:139–151,470–477,497–505`.

For any running VM with old persistent memory, `classify` returns `full` without validating live memory. With new persistent memory, every other live combination becomes `restart`. This accepts more than the documented 12/16 GiB states. The `done`/`already-upgraded` path also skips `verify_running_target`; persistent identity checks cannot establish live pins/topology/disks.

**Reproduced:** persistent 12 GiB with live maximum/current **8 GiB** is shut down and upgraded successfully, although the runbook says other memory states are refused. Separately, 16 GiB configured/live with the fake's divergent live pins returns **`already-upgraded`/0**, without detecting those pins. The existing new-boot pin test covers a different path.

**Smallest correction:** implement the explicit permitted live/persistent memory matrix and refuse every other combination before shutdown. Validate the live fixed-target invariants as well as persistent ones, including the no-op and post-arm `done` paths. Reuse an appropriate read-only verification helper; do not shut down a mismatched already-running target just to make it match.

### SOL-R1-05 — P2: Restore can report success without restoring, and enters a concurrent directory

`restore-tmp-links.sh:58–78`.

A failed `ln -s` does not increment any failure counter; the final status tests only missing extraction entries. Also, GNU `ln -s source target` treats an existing target directory as a container. If another process creates that directory after the existence test, this script writes a nested link inside the new entry despite its collision-preservation promise.

**Reproduced:** with a missing destination directory, `ln` fails, no requested link exists, but the script returns **0**, `linked now: 0, missing: 0`. With a wrapper that creates the target directory immediately before the real GNU `ln`, the script returns **0** and adds `file-a/file-a` inside that concurrent directory. Its existing owner data remains, but the directory was modified.

**Smallest correction:** use the no-target-directory form (`ln -sT` on this Debian worker), count/report link-creation failures, and recheck a raced collision without entering or replacing it. Return nonzero for unresolved linking failures. Add failure and directory-race coverage; keep the current behavior of preserving existing entries.

## Actual verification and evidence

All executions were offline, with real target paths redirected by bubblewrap to private disk-backed scratch and a fake virsh/notify. Focused probes additionally unshared the network. The operational scripts were byte-identical copies; only private fake wrappers/harnesses and timing overrides supplied faults/interleavings.

- Independently reran `bash docs/build/vm-upgrade/tests/run.sh`: **131 passed, 0 failed**. This includes four `bash -n` checks and the approval-runner process-group timeout/SIGHUP survival case. I did not independently rerun the author's six repetitions or twelve mutation trials; those remain author evidence. Shellcheck is unavailable.
- Ten focused probe scenarios: unknown post-shutdown XML/capacity; pin edit while awaiting the lock; concurrent start while awaiting the lock; evidence-write failure; unexpected live 8 GiB; divergent live pins on the no-op path; direct TERM after power-off; failed symlink creation; partial extraction/retry; concurrent directory collision. The findings above reproduce; TERM confirms the documented manual limitation below. Injected tar failure exits 1, retains its owned partial marker, and the next apply successfully extracts/links from the same verified fixture archive.
- Private receipts and reproducible harness: `/work/tmp/sol-vmu-r1-9987231/`. `runtime-configuration.json` records effective settings; `author-suite.txt`, `probes.sh`, `run-probes.sh`, `probes-output.txt`, individual result JSONs and I/O logs retain the observations. Main probe transcript SHA-256 `2f36635d477e55f1e9bb108fb11afc18d7f89626929ad996d0ebc1ee14e476db`; suite transcript `22f4a5bfdda6bd3c13a147438a700ef160901f24e8d961f61eff7dd4bb519251`.

The fake models libvirt memory clamping; this review does **not** establish that behavior on the installed Unraid version. The inspected Fleet branch confirms the stated `timeout 3600 bash -c` approval runner and listener `setsid`, but installed-source parity remains unproved. The prescribed **real, read-only detached rehearsal is mandatory before a disruptive launch**. It must demonstrate its actual session/launcher separation and completed durable result, not merely a submitted/done ask request.

## Documented manual limitations and useful follow-ups

**Signals and late shutdown:** I reproduced direct TERM after the VM is off: `aborted`/31, VM still off, no `start`. This is outside the tested caller-disconnect boundary: `setsid`, closed stdin/output redirection and ignored HUP correctly address that boundary offline. The explicit `aborted` outcome and owner-side relaunch procedure provide manual recovery; I do not count arbitrary termination of the host runner as an additional automatic-recovery blocker. Narrow the broad “every failure once off” wording to reflect this exception. Likewise, a timeout does not cancel an ACPI shutdown already underway: the VM may power off later. Treat that as an owner-console/relaunch condition, rather than promising it remains running. A coordinator in the powered-off guest cannot perform re-entry. No force-off or blanket backup redefine should be added to hide this limitation.

**Dependencies:** `cmd_run` does not call `cmd_preflight`; its rehearsal exercises many, but not all, operational commands. The separate preflight only checks five dependencies and the rehearsal never exercises the memory-only diff. Consolidating nonmutating dependency/writability checks, including required evidence tools and the selected Unraid notification path, into the real run and rehearsal is a useful small follow-up. In contrast, missing `flock` currently refuses acquisition and missing `setsid` prevents launch; these are not demonstrated unguarded shutdowns.

**Post-boot acceptance:** `worker-check.sh post` checks 15–16 GiB guest MemTotal, six CPUs, host resource information, active T3/fleet services, :9110/:9101 HTTP responses, archive hash and actual cgroup values. A missing/mismatched agent slice is intentionally only a WARN. That is acceptable as an explicit manual checkpoint, not proof the ceilings increased. Inspect those WARNs before acceptance. Adding the :9100 HTTP check and enabled/linger checks would better mirror the full service inventory. The script's fixed-target/live checks still need SOL-R1-04; host `vm info` obtains configured pins/disks in the inspected helper. I did not rehash/extract the real 4.137 GB checkpoint or change any actual `/tmp` evidence.

No live host query, staging write, ask submission, shutdown/start, service/resource change, credential read, browser, push or PR occurred. The shared Fleet checkout was not edited; its pre-existing untracked `docs/mini-pc-buying-research.md` remains. Game construction stays paused and production unchanged. Only this report is authored in the repository.

The next step is author correction of SOL-R1-01 through SOL-R1-05, with refreshed pinned script hashes and a fresh independent review of the frozen candidate. Even a later READY-FOR-STAGING verdict cannot accept the real-host upgrade before its rehearsal and actual post-boot resource/service/cgroup/archive checks exist.
