# Factory-worker RAM upgrade — independent Sol R3 affected review

**Verdict: READY-FOR-STAGING. SOL-R2-01 is CLOSED; SOL-R1-03 therefore closes in full.** The other four R1 closures stand. No remaining substantiated blocker was found in the affected finalization change or its interactions. This permits preparation and the mandatory real detached nondisruptive rehearsal, subject to coordinator inspection. It does **not** establish a completed upgrade or real-host acceptance.

**Reviewer, runtime and frozen source.** Fresh non-author **GPT-6.1 Sol**, provider instance `codex`, model `gpt-6.1-sol`, **`reasoningEffort: xhigh`**. The live catalog offers that selection; T3 `t3_thread_configuration` returned those effective settings, `full-access`, default interaction mode. No substitution or child delegation occurred.

- T3-owned subagent thread: `thread:delegated-task:command%3Amcp%3A46a88d84-da14-4706-b2d1-dcebfe5f916e%3Adelegate-task%3Asiltwake-vm-upgrade-sol-xhigh-r3-219ed24`. T3 reports parent `9604e156-62da-418c-98f6-73a49ed8de4d`, relationship `subagent`, original run ordinal **1**. This is a fresh review, not continuation of R2.
- Binding: branch `t3/review-vm-upgrade-reporting`, worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-e8e38dd6`. Initial HEAD **`219ed247703da6892ec2436cc145d49da5e479c3`**, empty `git status --short`; T3 binding agrees with the shell checkout.
- Operational scripts, tests and RUNBOOK are byte-identical to source **`63303b2e305800d780374beae1cea00b7e0a55c6`**. The entire bundle matches report commit **`5b4e54ed909437e045ec6f7422eb0ee2594edc31`**. Opus5.5/high authorship is attributed to the brief and CORRECTION-R2, not a separate inspection of the author's runtime.
- Main-script SHA-256: **`226d89df08dbf50eeac0d80b6ad85f60db9d32139fd4792d884e09e42b272bd1`**. All seven script/test hashes and all three R2 evidence hashes match CORRECTION-R2. The production diff from `c94199d` changes only `finish`; the other three operational scripts, test runner and fake virsh are unchanged. The test diff adds the 14 regressions and parses the detached child's actual result exit code.

Read STATUS, VM_UPGRADE_HANDOFF, MODEL_POLICY, the independent-review gate, RUNBOOK, both prior reviews, COORDINATOR-R1, both correction reports, affected scripts/tests and correction evidence. Existing Fleet approval/lock behavior is retained from R2's accepted source assessment; no fresh installed-host parity claim is made or needed for this affected offline review.

**SOL-R2-01 disposition.** In `vm-ram-upgrade.sh:310–351`, final state, VM description and final VM-list writes now precede outcome derivation and result publication. The listing's `sed` failure is accounted for in the parent shell. `RESULT` is itself written before publication; if that write adds the first `run.log` error, the loop derives the outcome, exit and message again. Deduplicated `run.log` errors bound that loop to at most two attempts. Successful publication is followed only by the documented best-effort notification/syslog operations and their diagnostic notes.

A final record failure now changes a would-be success to `evidence-incomplete`/**23**, with the failed record in `evidence_errors` and the message, while preserving `vm_outcome`. Notification severity follows the final code and becomes **alert**. An existing nonzero VM outcome remains nonzero and gains the reporting error. Failed result publication still exits **32**, with alternate alerts and a `RESULT NOT PUBLISHED` log note when writable. The prepublication `RESULT` line on that path is a candidate whose publication failed; no authoritative result exists, and the process/alerts clearly report 32.

The final state's message now describes the VM outcome; `result.json` remains authoritative for evidence status. The unchanged worker postcheck reads the result's outcome/exit, so it rejects the corrected 23 outcome. No bundle consumer interprets the finished-state message as the result. No reporting failure adds a shutdown, restart or rollback.

**Independent execution.** All VM-operation executions were offline with fake virsh/notify/logger and redirected operational paths in bubblewrap. The focused harness also unshares the network. Production-script copies retain the reviewed hash; no production code was instrumented or edited.

- **Full provided suite: 225 passed, 0 failed**, independently run once with `bash docs/build/vm-upgrade/tests/run.sh`. This includes the current final-state/full-filesystem regressions, pre-disruption refusal, recovery, capacity, lock interleavings, live-state checks, detached rehearsal and approval-runner timeout/SIGHUP survival, and collision-preserving restore. The group-kill check now parses `exit_code` rather than assigning zero.
- **Private affected probes: 55 passed, 0 failed across ten scenarios**, from a reset sandbox. These use the byte-identical R2 setup, new private fault wrappers and a 16 MiB tmpfs for actual ENOSPC. They verify JSON/process-exit agreement, error names, alert severity, VM-command counts and record stability at successful publication.

| Focused scenario | Observed result |
| --- | --- |
| First failure at final-state temporary-file creation, while the preceding state is `guest-check` | Exactly one injected failure; VM safely upgraded; `evidence-incomplete`/23, `state.json` listed, matching RESULT and alert/syslog. This exercises the corrected sequence directly, without waiting for a result to exist. |
| Filesystem fills immediately after successful final state, before `VM now` | First final log failure counted as `run.log`; 23/alert; result published after space is released. |
| Final VM-list output alone fails through `/dev/full` | The pipeline failure reaches the parent; `run.log`, 23 and alert are authoritative. |
| First RESULT write fails, space returns before its second attempt | Every preceding final record succeeded; exactly two RESULT attempts; the second writes `evidence-incomplete`/23 with `run.log`; JSON, process exit and alert agree. No clean-success RESULT persists. |
| Both RESULT attempts fail; space returns only for result publication | Loop terminates after two attempts; neither RESULT line exists, but published JSON correctly reports `run.log`, 23 and alert. |
| Result publication itself fails | No result file; process exits 32; alert/syslog name the missing result; writable log says `RESULT NOT PUBLISHED`. VM stays upgraded. |
| RESULT first fails on `started-unverified` | Original outcome/exit22 retained, `run.log` added, alert describes both issues; no second shutdown or rollback. |
| Notification and syslog commands both fail after successful publication | Required-record result remains `upgraded`/0 with no evidence errors; diagnostic notes follow publication, consistent with the documented best-effort exception. |
| Ordinary upgrade | `upgraded`/0, no errors, normal notification; required records remain unchanged after publication. |
| Preserved maximum-memory capacity probe | Defined max16/current12 with 15 GiB available remains `left-off`/30, with no start or memory write. |

For every applicable successful-publication fault probe, the log and state are byte-identical at publication and after process exit; no further record temporary file is made. VM-call receipts show one shutdown/start and the original two memory setters, with no rollback or forbidden operation in response to reporting faults.

The first private harness run had three counter-only failures because its timestamp counter also counted JSON's `finished_at` timestamp. That measurement was corrected to count the two RESULT attempts; the final reset run is the 55/55 above. Both development and final receipts remain available. Shellcheck is unavailable. No additional broad testing was needed after the completed affected checks.

**Retained findings disposition.** These are preserved R2 closures supported by unchanged safety code and the passing current suite, not claims of a new real-host validation.

| Finding | R3 disposition |
| --- | --- |
| SOL-R1-01 — unknown memory becomes zero | **CLOSED, retained.** Observation/capacity guards unchanged; unreadable memory fails closed. Current maximum-versus-current probe remains safe. |
| SOL-R1-02 — stale decisions before lock | **CLOSED, retained.** Lock/revalidation/recovery code unchanged; held-lock regressions pass. Helper/UI operations ignoring the lock still require the exclusion window. |
| SOL-R1-03 — evidence failures allow disruption/success | **CLOSED.** Prior pre-disruption gates/recovery remain intact; its last open finalization window, SOL-R2-01, closes on the independent failures above. |
| SOL-R1-04 — unlisted live states/no-op unchecked | **CLOSED, retained.** Explicit matrix and live checks unchanged; current refusal/no-op/arm-window regressions pass. |
| SOL-R1-05 — failed/raced restore links | **CLOSED, retained.** Restore is byte-identical to R2; link-failure and concurrent-directory regressions pass. |

**Evidence attribution and receipts.** Private disk-backed directory: **`/work/tmp/sol-vmu-r3-219ed24/`**. `runtime-binding.json` and `source-identity.json` preserve the runtime/binding and complete bundle hashes. Reproduce focused checks with `bash /work/tmp/sol-vmu-r3-219ed24/run-probes.sh`; `probes.sh`, wrappers, original setup and individual `cases/` contain results, state, logs, notifications, fault events and VM calls.

- `author-suite.txt` SHA-256: `0653d13547699eceec76deb944eccd9d16e08a5eb2694dd9351f3bcd85a01c77`.
- `probes-output.txt` SHA-256: `c362c3888fb71d78641bf0980b7b12c3072ec2cb875f8379239b5d520546f584`.

The author's old-script 215-pass/10-fail run and old R2 trigger rerun remain author-attributed; I did not rerun either. The committed filtered old-script transcript omits two NUL-prefixed assertion lines. Reading the preserved raw transcript recovers both and corroborates 215/10, with the ten failures confined to the new defect checks; private `old-script-transcript-audit.json` records the details. The old trigger's zero injections merely confirms the old ordering disappeared; acceptance here rests on actual first-failure probes in the corrected ordering. Older mutation campaigns and the real 4.137 GB archive hash were not rerun; R2's evidence remains attributed to R2. Original probe/evidence directories were not overwritten.

**Acceptance boundary.** The fixed factory-worker identity, six vCPUs, 3-core/2-thread topology, pins 0,1,8,9,10,11, existing disks/ISO/autostart, memory-only setters, nondisruptive default, headroom checks, locks, checked backups, bounded clean ACPI, re-entry and owner recovery remain unchanged. No other VM, Hermes, container, network, disk or resource limit is addressed. The 120 s arm window, 2 GiB reserve, 40-minute clean timeout, Unraid notify/syslog choice and exclusion of helper/UI changes that ignore the lock remain settled. Direct termination of the independent runner and late ACPI completion remain documented owner-side recovery conditions; no automatic whole-definition restore is introduced.

Before disruption, the coordinator still needs a **successful actual detached nondisruptive rehearsal** through the restricted/native approval route: durable `rehearsal-ok`/0 result, launcher gone, separate session, expected repeated reads/plan, writable records and unchanged VM. Installed approval-source parity remains unproved; fakes cannot prove real Unraid tools, XML formats, memory clamping, notification delivery or a 16 GiB boot.

After boot, verify actual 16 GiB/6 CPUs and preserved host invariants, active/enabled services and linger, all three HTTP endpoints, actual agent cgroup limits with every WARN inspected, archive size/hash, retained home/.t3/repos/disks, and restored historical paths/worktree binding. Restore remains disk-backed and preserves collisions. READY-FOR-STAGING does not waive these checks or accept host `upgraded` as proof of guest service health. Siltwake construction stays paused.

No real host query/write, staging, ask submission, shutdown/start, resource/service change, credential access, broader SSH alias, browser, game check/change, push, PR or child delegation occurred. Shared Fleet and its unrelated research file were untouched. Only this review report is authored and committed in the repository.
