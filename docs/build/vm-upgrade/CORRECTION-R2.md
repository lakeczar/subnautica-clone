# VM upgrade R2 correction — author report, 2026-10-19

Author: **Claude Opus 5.5 (`claude-opus-5-5`), effort high**, T3 delegated task. `t3_thread_configuration` returned exactly that selection, `full-access`, default interaction. Binding: T3 worktree `t3-bfbe2fe7`, branch `t3/vm-finalization-correction`, which started clean at `c94199dea7c45c5c58aa286f9ddc6f76c95ce3b5`. No child agents.

**No host query, staging write, ask submission, shutdown/start, VM/service/resource change, credential read, SSH alias, browser, push or PR occurred.** No game source or test was touched or run. Shared Fleet was not read or edited. This report does not claim real-host acceptance or any VM change.

[REVIEW-SOL-R1.md](REVIEW-SOL-R1.md), [COORDINATOR-R1.md](COORDINATOR-R1.md), [CORRECTION-R1.md](CORRECTION-R1.md), [REVIEW-SOL-R2.md](REVIEW-SOL-R2.md), [EVIDENCE.md](EVIDENCE.md) and the earlier `evidence/` transcripts are unchanged historical records. The reviewer's private directory `/work/tmp/sol-vmu-r2-1424b78/` was only read and copied from. Its `targeted-output.txt` still hashes to `4888d4b9…`.

## Frozen candidate

Source commit **`63303b2e305800d780374beae1cea00b7e0a55c6`**. It changes `vm-ram-upgrade.sh`, `tests/checks.sh` and the current [RUNBOOK](RUNBOOK.md).

| File | SHA-256 |
| --- | --- |
| `vm-ram-upgrade.sh` | **`226d89df08dbf50eeac0d80b6ad85f60db9d32139fd4792d884e09e42b272bd1`** (was `b9e14335…`) |
| `tests/checks.sh` | `86e2a7536090e01ace2971846b6a7529d805efbb6b02d60f69b92cc2030d8374` (was `47bb908c…`) |
| `ask-command.sh` | `5ad70fc380656fc865f6c249872b62d0b72bac17cfac7b0131031a01e8504f21` (unchanged; it computes the pin, now `226d89df…`) |
| `worker-check.sh` | `8d9e9d684ae37d30f72080a328e1723e5a96ee8983a2c775d50c8208f06217b1` (unchanged) |
| `restore-tmp-links.sh` | `61fce7467ad2f50e3d5e9a5484f30db24beac53d9cabe126e0ec82739f3ad580` (unchanged) |
| `tests/run.sh` | `55e8533f1dd14d57342a4082dde7105a4bbd1b132aeb4b28d0aa0d5345c2830e` (unchanged) |
| `tests/fake-virsh.sh` | `e81ed3f1418d702673f93ad7b52dbe9f824afe770708fd3ac80f9f73728a1602` (unchanged) |

## SOL-R2-01 (P2): final record failures after the result was published

**Change, in `finish` only.** The order is now:

1. Release the lock, observe, check the launcher (as before).
2. Write the final `state.json` (`finished`, the VM outcome), `VM now: …` and the `all VMs at the end` listing. The listing's `sed` write is now checked too; previously its failure was not recorded anywhere.
3. Derive the outcome, exit and message from `EVIDENCE_ERRORS`, then log the `RESULT` line. If that line itself fails, derive again so that `run.log` is counted. This happens at most twice, because `note_failed_write` deduplicates entries.
4. Publish `result.json`. If that fails, exit 32 with the unchanged message, plus a best-effort `RESULT NOT PUBLISHED` log line.
5. Notification level and subject come from the final code and errors, as before. The Unraid notification and syslog line follow (best effort, unchanged).

Nothing required is written after `result.json`. A failure in any final state/log record therefore yields `evidence-incomplete`/23 with the record listed, at `alert` level. The 32 path still uses the alternate notify/syslog channels. VM operations, recovery paths, the lock and the shutdown are untouched, and no new shutdown or rollback was added for a reporting fault. The `state.json` message on finish is now the VM outcome. The authoritative outcome is in `result.json`, and nothing in the bundle reads that message.

**Regression (14 new assertions, `# SOL-R2-01` in `tests/checks.sh`).** A temporary `mktemp` is placed ahead of the real one for these cases only. It treats the first record made while `state.json` still says `guest-check` as finish's final state write. In the corrected order, that write is the first operation in `finish`.

- **Final state fails first** (that one `mktemp` fails): the VM is upgraded, the result is `evidence-incomplete`/23 with `evidence_errors` = `state.json`, `run.log` says `RESULT evidence-incomplete (exit 23) … could not write: state.json`, and the alert and syslog both report records incomplete. Exactly one fault was injected, and no record was made after `result.json`.
- **Disk full from the final state write until `result.json`'s turn** (16 MiB tmpfs). `run.log` is padded to the end of its last page, because otherwise a full tmpfs still accepts small appends; that padding is truncated afterwards. Result: `evidence-incomplete`/23 with `state.json run.log`, an alert, and no record after `result.json`.
- **Ordinary upgrade:** no run-folder record is made once `result.json` exists, and `state.json` says `finished`/`upgraded`. Sol's trigger therefore has nothing left to hit.

**Small test cleanup (nonblocking R2 note).** The approval-runner group-kill case now parses the result's `exit_code` instead of setting `RC=0`.

## Actual checks (all offline, bwrap, fake `virsh`/`notify`/`logger`, scratch under `/work/tmp`)

- `bash docs/build/vm-upgrade/tests/run.sh` on `63303b2`: **225 passed, 0 failed** (50 s), one run after the last change. That is the 211 existing checks plus 14 new ones. [Transcript](evidence/offline-tests-r2.txt). Two earlier runs during development failed on test defects, not script defects. First, a `result.json` read came after the case's own tmpfs cleanup. Second, the full-disk case did not fail `run.log` because of tmpfs page slack. Both were fixed in the test before the recorded run.
- **The same suite against the R1 script** (`b9e14335…`, from `c94199d`): **215 passed, 10 failed**. The 10 failures are exactly the SOL-R2-01 checks (both injected cases and the after-result check). The R1 script reports `upgraded`/0 there and writes `state.json` after `result.json`. [Transcript](evidence/r2-r1-script-vs-new-tests.txt).
- **Sol's unchanged targeted harness** on a copy (`/work/tmp/vmu-r2-fix-c94199d/sol-r2-targeted-copy/`). `targeted.sh`, `probe-setup.sh` and the sandbox `mktemp`/`virsh`/`logger` are byte-identical; `run-targeted.sh` differs only in its own path. On `226d89df…` its trigger fires **zero** times: no `state.json` temporary file is made once `result.json` exists. Its three defect-confirming assertions fail, and the run is a true clean `upgraded`/0 with `state.json` `finished`. The capacity case still ends `left-off`/30 with no start or memory write. [Output](evidence/r2-sol-targeted-rerun.txt).
- `shellcheck` is not installed on this worker, so it was not run. The old mutation campaign and the archive hash were not rerun (out of scope, per the brief).

Evidence SHA-256: `offline-tests-r2.txt` `230193c058f01c343ffae8ae7d6099a19aa3655a755f1b46dcc0ff0b97619d41`, `r2-r1-script-vs-new-tests.txt` `1d9201120f785f37d65c39d6fd94eae07d5943cdcbdee43cec9bf7f34ccd114e`, `r2-sol-targeted-rerun.txt` `79edaf90e762760c26c5298f4536499af0d473f606803851a8e32420eb468e15`.

## Count history

The historical **131/131** (first candidate) included six compound assertions that judged only their first condition, as documented in CORRECTION-R1. The author's **211/211** on `d299888` came after that repair, and root and Sol R2 also passed 211/211 independently. **225/225** here is author-attributed, pending the next review.

## Unchanged limits

Owner-side recovery is still needed when the independent runner is killed after power-off, or when a guest powers off after `shutdown-timeout`. The exclusion window still covers helper/UI actions that ignore Fleet's lock, and there is no automatic whole-definition restore. Notification delivery remains best effort, and a `notify` failure leaves syslog and the run folder. Everything RUNBOOK lists as unproved on the real host remains unproved.

## Next safe actions

1. Root inspects `63303b2` and this report, then dispatches a **fresh non-author Sol 6.1/xhigh affected review** of the finalization change. Include the R2 brief, REVIEW-SOL-R2 and this report.
2. Only after a READY-FOR-STAGING verdict: stage the script and confirm hash `226d89df…` (or a re-reviewed successor). Then submit the native-approval **detached rehearsal** and accept it only against the RUNBOOK criteria.
3. Then the real run with the owner's exclusion window, followed by `worker-check.sh post` and the post-boot resource/service/cgroup/archive checks. Siltwake stays paused until the owner asks to resume.
