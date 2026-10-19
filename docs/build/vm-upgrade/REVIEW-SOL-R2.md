# Factory-worker RAM upgrade — independent Sol R2

**Verdict: CHANGES-REQUIRED.** One remaining **P2 reporting-contract defect**, SOL-R2-01 below, prevents READY-FOR-STAGING. Four R1 findings close; R1-03 is substantially corrected but remains open for the finalization window. I found no additional VM-safety blocker in the reviewed scope. This is an infrastructure-bundle review, not real-host acceptance or evidence that the upgrade happened.

## Reviewer, binding and source

- Fresh non-author **GPT-6.1 Sol**, provider instance **`codex`**, model **`gpt-6.1-sol`**, **`reasoningEffort: xhigh`**. The live catalog offers this selection; `t3_thread_configuration` independently returned those exact effective settings, `full-access`, and default interaction mode. No model substitution or children.
- New T3-owned isolated subagent thread: `thread:delegated-task:command%3Amcp%3A46a88d84-da14-4706-b2d1-dcebfe5f916e%3Adelegate-task%3Asiltwake-vm-upgrade-sol-xhigh-r2-1424b78`. T3 reports parent `9604e156-62da-418c-98f6-73a49ed8de4d`, relationship `subagent`, original run ordinal **1**, branch `t3/factory-worker-ram-review`, worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-6fd14fd3`. This is not continuation of the R1 reviewer.
- Initial checkout was clean at **`1424b783e754d6218ed86cf300b3f21df7e5fba5`**. Current scripts, tests and RUNBOOK are byte-identical to correction source **`d2998888c15148b93144f3e21f375b6a90aede46`**; the entire bundle matches correction report commit **`dbb685b884a8062d16c27a8b914de189055e6c30`**.
- Main-script SHA-256: **`b9e14335e5027ed122686117ae69c34f4d674c2715696757a63048fcccab59d5`**. All other script/test hashes and four correction-evidence hashes match CORRECTION-R1.md. Operational scripts were not edited.

Read the entire `docs/build/vm-upgrade/` bundle: four scripts, three test files, current RUNBOOK, original EVIDENCE, R1 review/disposition, correction report and all five evidence transcripts. Also read the build checkpoint, VM handoff/model policy, plan/contracts and independent-review gate. Fleet source attribution: `/work/repos/fleet` at `678cc2d25a9698c70276a0e6025fbbc654de7890`, AGENTS.md/STATE.md, and relevant `fleet-admin.sh`, `approve.sh`, `approve-listener.php` from `origin/t3/unraid-full-access` **`1d6cf7ed729302f4ba58923128c31da9b2e921f3`**. Branch source still does not establish installed-host parity.

## Remaining blocker

### SOL-R2-01 — P2: A first record failure during finalization still publishes clean success

`vm-ram-upgrade.sh:314–343`, especially the result publication at **327** preceding `set_phase finished` at **331**; RUNBOOK's outcome/record contract; `worker-check.sh:86`.

`finish` decides whether evidence is incomplete and publishes `result.json` **before** writing the final state and remaining log records. A first I/O failure during those later writes updates `EVIDENCE_ERRORS` too late to change the published result, message or exit code. The notification subject consults the updated array, but its level still follows the earlier success code.

**Concrete reproduction, unchanged reviewed script:** run the normal fake upgrade, with a private `mktemp` wrapper that fails only creation of a state-record temporary file when that run's `result.json` already exists. Every earlier write succeeds; the wrapper records exactly one injected failure. This represents an ENOSPC/EIO at the first final-state operation, without changing any VM observation or operational code.

Observed:

- VM safely running with defined/live **16/16 GiB**, same target invariants.
- Process exit **0**; result **`outcome: upgraded`, `exit_code: 0`, `evidence_errors: ""`**.
- `state.json` remains at **`guest-check`**; `run.log` nevertheless says **`RESULT upgraded (exit 0)`** without identifying the failed state record.
- Notification **and syslog do record `records incomplete`** in their subject, so this is not an entirely invisible failure. Notification severity is still **`normal`**, and its body does not identify the missing record.

**Impact and severity:** the required result exists and the VM recovery/change succeeded; this is neither the old absent-result failure nor a demonstrated unsafe start. However, the authoritative result and process status assert clean success despite a known required-record failure. `worker-check.sh post`'s host-result check accepts that result. This violates the explicit correction contract that post-shutdown record failures produce `evidence-incomplete`/23 with the error listed, and that exit 0 requires all records. It warrants a small P2 correction before staging, not a broader recovery redesign.

**Minimal correction:** complete the checked terminal state/log operations before deriving final evidence status and publishing the authoritative result. Include any failure from those operations in the result and nonzero exit; preserve exit 32 and alternate alerts if publication fails. Leave no further *required* record writes outside that accounting boundary. Notification-delivery failures may retain the documented best-effort limitation. Add a regression with the **first** I/O failure at final state/log creation, rather than a failure already present when `finish` begins. No extra VM shutdown or rollback is appropriate for this reporting failure.

Receipt: `/work/tmp/sol-vmu-r2-1424b78/targeted-output.txt`, `targeted.sh`, `run-targeted.sh`, `sandbox/sbin/mktemp`, `final-state-{result.json,state.json,run.log,notify.txt,syslog.txt}`. Reproduce with `bash /work/tmp/sol-vmu-r2-1424b78/run-targeted.sh` in this checkout's environment. The eight assertions deliberately confirm both this defect and the separate safe maximum-memory capacity case; their passing count is not a claim that finalization meets its contract.

## R1 dispositions

| Finding | R2 disposition | Evidence and limits |
| --- | --- | --- |
| **SOL-R1-01, P1** — unknown memory becomes zero | **CLOSED** | Failed/malformed observations now fail closed, retry within a bound and never authorize zero-memory starts. Suite and copied R1 probe leave the unreadable 16 GiB definition off with 15 GiB available. Additional independent probe: defined max16/current12, changed pins and 15 GiB available takes the as-is branch but refuses the start using **max16**, not current12; no memory write or start. |
| **SOL-R1-02, P2** — decisions precede lock | **CLOSED** | Lock precedes fresh offline checks; reference comparison and recovery rechecks are present. Independent held-lock pin/start probes yield `started-as-is`/21 and `restarted-elsewhere`/21 with no memory writes. Suite additionally checks description edits, recovery restarts and preserved pin edits. Helper/UI operations that ignore the lock remain explicitly excluded operationally. |
| **SOL-R1-03, P2** — unchecked records/disruption/success | **PARTIALLY FIXED; OPEN as SOL-R2-01** | Atomic writes, pre-disruption gate, checked backup, full-disk recovery, evidence-incomplete/23 and unpublished-result/32 work in the covered cases. Original fixed-temp-name collision no longer blocks fresh atomic temporary names. A failure first arising after result publication remains misreported as clean success. |
| **SOL-R1-04, P2** — unlisted live states/no-op unchecked | **CLOSED** | Explicit matrix plus live count/pin/topology/disk checks cover initial, no-op, post-arm and post-start paths. Suite and copied R1 probes refuse defined12/live8 and already16 with divergent live pins without shutdown. Additional suite cases cover defined12/live16, ballooned live16/12 and post-arm mismatches. |
| **SOL-R1-05, P2** — failed/raced links report success | **CLOSED** | `ln -sT`, collision recheck and failure counter cover actual link failure and a directory appearing at creation. Suite checks failed `ln` with an existing destination folder. Copied R1 probes preserve concurrent owner data without a nested link, and show failed extraction followed by successful retry. |

## Independent checks and evidence credibility

All VM-operation tests were offline. The provided suite redirects operational paths and tools with bubblewrap. The targeted probes and copied R1 harness additionally unshare the network; fake notifications/syslog remain private. Actual production-script copies retain the reviewed hash. No real host command was needed.

- **Expanded suite independently rerun once: 211 passed, 0 failed**, including syntax, upgrade/re-entry, wrong-target/memory refusals, bounded ACPI timeout, recovery, capacity, held-lock interleavings, pre/post-disruption I/O failures, real sandbox full-filesystem cases, detached launch and approval-runner process-group timeout/SIGHUP survival. Transcript: `author-suite.txt` in the private directory below. Shellcheck remains unavailable.
- **Copied original ten-probe R1 harness independently rerun.** `probes.sh` is byte-identical to the preserved original, using current operational scripts, private fake logger and shorter read-retry timings. All nine correctable scenarios now behave safely; direct TERM after power-off still produces `aborted`/31 and leaves the VM off as documented. Its historical “Phase and result writes fail” title now exercises harmless obsolete temporary-name collisions; actual current write failures are covered separately by the expanded suite and new final-state probe. Original `/work/tmp/sol-vmu-r1-9987231/` was not modified.
- **Two additional targeted scenarios, eight assertions per run:** final-state I/O defect above; conservative maximum-versus-current capacity accounting on the as-is start path. Both produced the recorded expected observations, including a repeat from a reset sandbox (`targeted-recheck.txt`).
- **Real persistent checkpoint read only:** independently rehashed `tmp-siltwake.tar` under `/home/worker/.local/share/siltwake-checkpoints/vm-upgrade-20261019`. Size **4,137,226,240 bytes**, SHA-256 **`188e1a36213ddb7f8ae58af26f4d1ea48280d938835883c4f2a50f37b1c13b1a`**, NUL manifest **390 nonempty names**. No real extraction or `/tmp` linking was performed; this establishes the current saved archive, not its post-reboot survival.

The original **131/131** is historical evidence, with the six disclosed compound-assertion defects; it is not current complete coverage. I inspected the replacements: `is ... all '<a> && <b>'` now evaluates the full conditions. The current full result is the independent **211/211**, not an inherited assertion about the old suite. The group-kill case still sets its local `RC=0` rather than parsing the result's exit field: it establishes survival, resulting outcome name and RAM, but is not a separate check of the child's numeric exit field. Parsing that field would be a useful nonblocking test improvement.

The correction's committed evidence hashes match. I read the old-script **154 pass/57 fail** transcript and the **12/13 caught** mutation results, including the disclosed defense-in-depth miss and combined-layer catch. Those repetitions/mutation executions remain **author-attributed**; I did not independently rerun them or infer complete fault coverage from their counts. Current source inspection, regression execution and independent probes support the dispositions above.

Private reproducible artifacts: **`/work/tmp/sol-vmu-r2-1424b78/`**, including runtime configuration, byte-identical script copies, targeted harness/fault wrapper and `r1-rerun/`. SHA-256 receipts:

- `author-suite.txt`: `278d1f50dad500fd55fd8f37e1113dac3ab18c3688967c055b456e66d9dc2de7`
- `targeted-output.txt`: `4888d4b92b959d81a135a350e97d6509a56e763228e4b170caa57669b6dbf5bb`
- `r1-rerun/output.txt`: `c2a2cd3a87c033ffe8f9a15a557be7b629b13177a90491f45ae632ab07306f64`

## Full-scope assessment and acceptance boundary

The fixed UUID, six vCPUs, pins 0,1,8,9,10,11, 3-core/2-thread topology, existing two disks and autostart are checked. The reference comparison preserves all non-memory definition content, including the attached ISO. The mutation path addresses only factory-worker's UUID with memory-only persistent setters; no other VM/container/network or disk replacement is requested. Default preflight is nondisruptive. Host-local session detachment, verified script copies, closed stdin, ignored HUP and private logs address caller/SSH/approval-runner loss in the offline model. Backup and operator re-entry are explicit, without force-off or automatic whole-definition restore.

The 120 s arm window, 2 GiB reserve, 40-minute clean ACPI bound, mandatory nondisruptive rehearsal and Unraid notification choice remain settled. The maintenance exclusion window is necessary because helper start/shutdown/resize and the UI do not share Fleet's lock. Direct termination of the independent runner and late ACPI completion remain documented owner-side recovery limitations, **not additional blockers**. The guest coordinator cannot recover an off VM itself.

Guest postchecks now include active/enabled T3 and fleet units, linger, :9100, :9110/api/health, :9101/status, guest RAM/CPU, host pins/disks, archive hash and actual cgroup values. Cgroup differences/missing slice remain WARNs requiring manual inspection; exit 0 from that helper alone does not accept unchanged ceilings. The scripts do not change resource limits or discard home/.t3/repos. Existing checkpoint/hash evidence and the restore collision behavior support preservation, subject to post-boot verification.

After the small finalization correction and fresh affected review, **READY-FOR-STAGING would permit staging and rehearsal only**. It must not accept the actual upgrade before successful **real detached rehearsal** evidence (completed durable result, separate session, launcher gone, unchanged expected reads/plan) and actual **post-boot resource, service, cgroup, archive and retained-path/worktree checks**. Installed Unraid/libvirt tools, XML formatting/clamping, notification behavior and a 16 GiB boot remain unproved by fakes. A boot with broken guest services is caught by postchecks and remains separate from host-side `upgraded`.

No host query/write, ask submission, shutdown/start, resource/service change, credential read, broader alias, browser, game test, push, PR or child delegation occurred. Shared Fleet and game source were untouched; Fleet's existing untracked `docs/mini-pc-buying-research.md` was left alone. Siltwake remains paused. Only this report is authored in the repository.
