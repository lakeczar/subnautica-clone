# TST-16: clean exclusive measurements (what DISTURBED means, and CPU priority for exclusive runs)

Builder: Opus 5.5, branch `t3/tst-16-light-slice`, from root `9ac573ec`, with root `91dc1ab` (SCHED-2b and SAVE-1) merged in. It touches `scripts/heavy`, so it's checked with the full SCHED-1, SCHED-2 and SCHED-2b suites. Asked for by the coordinator after CW-1's 3090 frame gate. That gate failed on 24 frames, mostly in runs labelled `DISTURBED`, and one quiet run was labelled `DISTURBED` too.

## Decision (R4): static priority by placement, no runtime mutation

Four review rounds each found another lifetime race in one mechanism: changing a shared CPUWeight at runtime, owned across processes and across installed versions. Per "Root fixes over workarounds", R4 removes that mutation instead of adding a fifth ownership layer.
- **The design:** exclusive jobs run in their own top-level user slice, `siltwake_exclusive.slice`. Its `CPUWeight=10000` is fixed in its unit file, which `install.sh` writes once with the heavy slice's caps (`CPUQuota`, `MemoryMax`, `MemorySwapMax=0`, from `sliceLimits` for this machine).
  - **When the priority exists:** only while an exclusive job's processes are in that slice. There is nothing to apply, reset, journal, freeze, certify or hand over.
  - **Older versions** never place jobs there, so a rollback needs no cleanup. A job already running there keeps its priority until it ends.
  - **Uninstall** leaves the inert unit; `--remove-exclusive-slice` removes it only when no ticket runs and the slice is empty (R5).
- **The name has no dash.** A dash would nest the slice under `siltwake.slice`, where its weight would compete only with its siblings. Top-level, it competes with `app.slice` (T3, weight 100). This is the comparison measured in R1 (a pinned probe waited 14–21% at weight 100, 0% at 10000).
- **Against R1's constraints:**
  - **R1-F2 and F3 were about moving builders' processes** out of their T3 tree and copying their limits: callers' containment. Queue payloads have never lived in the caller's tree. Since SCHED-1 they run in our own `siltwake-heavy.slice`, with per-scope hard limits that `scope-run.sh` verifies before the command runs (MemoryMax at the reservation, no swap). An exclusive scope in another of our own slices keeps exactly those per-scope limits.
  - **The aggregate caps carry over:** the slice has the heavy slice's memory, swap and CPU caps, and an exclusive job runs alone in the lane anyway. So nothing escapes, no caller is moved or re-limited, and T3's slices are never touched.
  - Leaving the caller's tree was never the objection, because queue jobs already leave it by design.
- **If the slice isn't ready** (missing, or not configured as expected; checked read-only before launch), the job runs in the lane's slice. It is recorded as `boost.status: unavailable` with the reason, and is `DISTURBED`: not boosted evidence. Since R5, the priority is judged on the kernel's own reading of the slice the job ran in, before and after the payload, not on its path.
- **Deleted:** `handover.mjs`, the boost journal (`state.boost`), the freeze (`state.frozen`), the backstop, the runtime setter and read-back, `install.sh --rollback` and the thaw. Rollback is back to its pre-TST-16 form.
- **R4's findings** (F1 freeze ownership across installer operations, F2 a reset outliving a killed handover, F3 freeze visibility) concern only that machinery, so they are removed with it. The diff is much smaller.

## R8 review responses

Review `39ac5fb6` on `review/tst-16-r8`, on `1d1a1bfe`: two P2s and two P3s, all in the installer's systemd calls and in counter parsing.
- **F1 and F2 (P2): unbounded and unchecked systemd calls under the lock.** One checked helper, `scripts/heavy/exclusive-unit.mjs`, now does both install's write and the removal.
  - **In one queue transaction:** refuse while busy, save the previous file, change it, reload.
  - **Bounded and checked:** every `systemctl` call there (`state.mjs` `systemctlBounded`, and `unitPopulated`'s query) has a 10 s bound, well under the 30 s queue clients wait for the lock, with exit status, spawn error, timeout and signal all checked.
  - **All-or-nothing:** if the reload fails or times out, the previous file is restored (a new one removed) and reloaded before the lock is released. It exits 4 before any other switch (version, mode, guard), so a retry starts clean, and an unchanged file can never stand for an unfinished reload.
  - **S25:**
    - a reload held past the bound: a queue submission during it is admitted and runs; install exits 4 within the bound with the file and mode unchanged;
    - a failed reload: the same;
    - a retry with systemd answering installs the unit (systemd has it) and applies the mode;
    - removal: the same failure and retry pair.
  - **On `1d1a1bfe`,** S25's submission during the held reload fails with 70, as the reviewer found.
- **F3 (P3): prefixes parsed as counters.** `parseCounters` takes a counter only as its whole raw value, a nonnegative safe integer (`0garbage`, `0e3`, `0 23`, `-1`, `1.5` and overflow are null). Uptime keeps its decimal form, and `host_stat` must be eight or more such integers. **Unit tests:** cover each.
- **F4 (P3): an invalid throttle measurement still said `measured: true`.** It now joins `missing`, so `measured` is false and the fields agree. **Unit test:** covers it.

## R7 review responses

Review `4aa06738` on `review/tst-16-r7`, on `2ada5062`: two P2s and one P3, all mechanical. No design change.
- **F1 (P2): the install refusal wasn't atomic with admission, and skipped slices with no unit file.**
  - **One transaction:** the check, the write and the reload now happen inside one queue transaction, the lock admission takes. It refuses while any ticket runs (exactly as removal does), and while the slice holds processes or that can't be established, also when there is no unit file.
  - **Still first:** it stays before every other switch, so a refusal changes nothing.
  - **S24:** a populated slice with no unit file, and a running ticket with the slice empty, both refuse. On `2ada5062` the fileless case was installed.
- **F2 (P2): missing throttle counters certified clean.** `sliceThrottle(start, end)` in `contention.mjs` requires both counters at both readings to be nonnegative integers that didn't go backwards. Anything missing, invalid or reset is `unmeasured` and `DISTURBED`, and either positive delta counts as throttling. **Unit tests:** absent fields at either end, a time-only delta, a reset, and no snapshot.
- **F3 (P3): any events text without "populated 1" counted as empty.** `populatedFromEvents()` in `state.mjs` is true or false only for an explicit `populated 1` or `populated 0`; anything else is unknown, so `unitPopulated` counts it as in use. **Unit test:** covers all three.

## R6 review responses

Review `867fd6e9` on `review/tst-16-r6`, on `b10aa825`: one P2, one P3.
- **F1 (P2): removal took a failed query for an empty slice.** `install.sh` discarded the status of `systemctl show -p ControlGroup`.
  - **One check, reused:** `state.mjs`'s fail-closed population logic, generalised as `unitPopulated(name)` (`scopePopulated` now calls it). A failed query, or an active unit whose cgroup can't be read, counts as in use; only a conclusive not-found or an empty cgroup counts as empty. `--remove-exclusive-slice` uses it, and refuses with "holds processes, or that could not be established".
  - **S24:** with a process in the slice and no ticket running, the normal query refuses, and so does a query a `systemctl` shim makes fail. On `b10aa825` the failing query removed the unit.
- **F2 (P3): two endpoint readings can't see a property changed and restored mid-run.**
  - **Docs scoped:** properties are verified at the payload's start and end. A change restored in between can be missed, so no config change or reinstall during a measurement.
  - **The supported path is closed** (coordinator's addition 1): `install.sh` refuses to rewrite the exclusive unit while that slice is populated, using the same fail-closed check, before anything else is switched, so a refusal changes nothing. **S24:** a reinstall with another pool size is refused while the slice is in use, leaving the unit unchanged, and also when the query fails; once idle, the reinstall rewrites it.
  - **Corroboration** (coordinator's addition 2): `scope-run.sh` records the slice's `cpu.stat` `nr_throttled` and `throttled_usec` at both readings. The result carries the deltas (`boost.throttled`), and any throttling of the exclusive slice is `DISTURBED`, with the reason. A unit test covers the reason; S17 and S22 record zero throttling on ordinary runs.

## R5 review responses

Review `430a2ec0` on `review/tst-16-r5`, on `40fdc202`: one P2. The static design was confirmed.
- **F1, uninstall could remove the unit after a holder's readiness check and before its launch.** `systemd-run --slice` then created a default slice (weight 100, no caps), and the result still claimed `applied`, because only the path name was checked. Two fixes, no new protocol:
  - **The unit's lifetime:** `--uninstall` now leaves the inert unit file; it does nothing without jobs. A separate `--remove-exclusive-slice` removes it, and refuses unless no ticket is running and the slice is empty. It checks and removes inside one state transaction, so no admission can come between them.
  - **The live slice, not the path:** `scope-run.sh` reads the slice its scope actually runs in from `/sys/fs/cgroup` (`cpu.weight`, `cpu.max`, `memory.max`, `memory.swap.max`) just before the payload starts and again after it ends, into the counter snapshots. The holder compares both readings with the unit's properties (the same `sliceLimits` computation `install.sh` uses). Any mismatch means `unavailable` and `DISTURBED`, with the reason. So the evidence rests on the kernel's real properties at the payload's start and end, corroborated by the slice's throttle counters between them (R6).
- **S23:** the reviewer's interleaving. A `systemctl` shim lets the readiness check pass, then removes the unit and stops the slice before the launch. The job's path still names the slice, but it ran at weight 100 with no caps and no swap limit, so it's `unavailable` and `DISTURBED`, and the final line says so. A slice with the right weight but a 4 GiB memory cap is a mismatch too. On `40fdc202`, S23 fails with `applied`.
- **S22:** uninstall leaves the unit. `--remove-exclusive-slice` refuses while a ticket runs, and removes the unit once it's done.
- **Unit test:** `sliceMismatch` covers the default slice, wrong caps, the wrong slice and a missing reading.

## Why a quiet run was labelled DISTURBED

- **The old rule** (SCHED-1, `holder.mjs`): `DISTURBED` if host-wide `/proc/pressure/cpu` "some" ≥ 10%, or `/proc/pressure/memory` "full" ≥ 1%, taking the maximum of the avg10 values sampled every 15 s, or if the GPU was shared.
- **CW-1's quiet run** was tour segment 7 (ticket `261023-084038-fa4a`), with run-wide maxima of load 5.69, CPU PSI 6.45% and **memory full 32%**. Memory full alone set the label. CW-1's lower figures (load ≤ 2.65, PSI ≤ 0.54%) are probably host samples joined at the spike frames, not the run-wide maxima the label used.
- **Where that memory stall came from:** T3's agents slice is capped (MemoryHigh 9.6 GiB, MemoryMax 11.7 GiB, a runtime drop-in). A builder's test or build that reaches it stalls on memory. Host-wide memory "full" counts the time when *every* non-idle task is stalled, and a game idles between frames, so another slice's throttling counts as "full" while the game never waits.
- **So the label measured the host, not the job.** And sampling avg10 every 15 s missed or smeared short stalls.

## What changed

- **The judgement** (`scripts/heavy/contention.mjs`) is on the exclusive job's **own cgroup**:
  - **Pressure:** `cpu.pressure` and `memory.pressure` stall totals (µs).
  - **Swap:** `memory.stat` `pgmajfault` and `workingset_refault_anon`, its swap-ins; the kernel keeps no per-cgroup `pswpin`.
  - **Host, from `/proc/stat` and `/proc/vmstat`:** steal, CPU busy outside the job, swap-in, swap-out and major faults.
- **Coverage (R1-F4):**
  - **The ends:** `scope-run.sh` snapshots the counters just before the payload starts and just after it ends, while the scope still exists. The holder reads them every second in between.
  - **One clock:** every point carries `/proc/uptime`, which is monotonic and the same in every process.
  - **Windows** are 5 s. The last, shorter stretch is merged into the window before it, so every observed delta counts.
  - **Missing coverage is never clean.** A missing baseline or final snapshot, a stretch over 3 s without readable counters (at either end too), or a recovered job counts as unmeasured, and so `DISTURBED`.
  - **Unreadable counters are null,** never zero.
  - **For audit:** raw points go to the job's `contention.jsonl`, and the windows into its `context`.
- **`DISTURBED`, each with its `reason`:** in the worst window,
  - the job waited for a CPU ≥ 5% of the time;
  - stalled on memory ≥ 1%;
  - took ≥ 1 major fault or ≥ 1 swap-in in its own cgroup;
  - steal ≥ 5% of the machine's CPU;
  - the GPU was shared outside the lease, scanned every 15 s and **always at the first and last observation** (R1-F5);
  - or it was unmeasured.

  Host load and PSI, host swap and CPU used outside the job are recorded, never judged. Thresholds: config.json `disturbed`.
- **Swap (fleet's host audit, 2026-10-23):** the vCPUs are pinned to dedicated host cores, so steal comes from Unraid's own work on those cores. The guest swaps (about 700 MB out), and a swap-in can stall a thread 50–100 ms without showing as steal. A live 14-minute playthrough scope had 0 major faults and 0 refaults, so any major fault in a job is a sign its memory or cache was evicted.
- **CPU priority (R4 design, above):** exclusive jobs run in `siltwake_exclusive.slice`, which has a fixed `CPUWeight=10000` (config `exclusiveSlice`, `exclusiveCpuWeight`). R1–R3 raised `siltwake.slice`'s weight at runtime instead; that design and its lifetime machinery are superseded (their review responses below are history).
- **Removed:** `scripts/light-run.sh`, the shared `siltwake-light.slice` and the package.json changes, which caused R1-F2 and F3. The npm scripts are back to root's.
- **Install:** `contention.mjs` is in both the version and the GPU guard manifests, alongside SCHED-2b's remote modules.

## R1 review responses (history; R4 supersedes the boost parts)

Review `81d6d83` on `review/tst-16-r1`, on `312b1bed`: two P1s, three P2s.
- **F1 (P1): crash-safe ownership.** Journal before applying; keep the record until a verified reset; recover with no tickets; serialise against the next exclusive job. **S18** proves both crash boundaries (a fault-injecting `systemctl` kills the holder just before and just after applying), a reset failing in the holder and then in reconcile, and the next exclusive job taking over a pending record without being reset under it.
- **F2 (P1) and F3 (P2): containment.** Fixed by removing the design: no light work is moved or re-limited, and the shared slice is gone. Small-to-large, large-to-small and simultaneous callers no longer apply, because no caller's process or limits are touched. The boost is a CPU weight on our own slice.
- **F4 (P2): coverage.**
  - **Unit tests:** the reviewer's two probes (an unreadable tail is unmeasured; a 0.9 s tail with 900 ms of CPU wait now disturbs), a missing baseline or end, gaps (also at either end), recovery, and nulls.
  - **S17:** the baseline before the payload's first line and the end after it, on one clock; raw points kept.
  - **S18:** recovered results are unmeasured.
- **F5 (P2): the GPU scan** is forced on the first and final observation. **S20**: a client opened after admission and outlasting the job is in `gpuShared` and the reasons.
- **Composition with SCHED-2b:** merged root `91dc1ab`. The holder keeps 2b's machine and artifact fields and the v2 context together. `cpuContext` is gone. Reconcile keeps 2b's remote-recovery branch separate from the local boost, which is keyed to its own exclusive ticket, so a remote ticket's death can't release it. `install.sh` carries `contention.mjs` and 2b's modules and transport. The acceptance lib keeps 2b's sandbox seams.

## R2 review responses (history; superseded by R4: the runtime boost is gone)

Review `b3ecb670` on `review/tst-16-r2`, on `ddd814da`: two P2s, plus one P3. The redesign held.
- **F1, a surviving apply could re-boost after recovery deleted the record.**
  - **The fix:** the boost record names its owner's holder scope. Reconcile resets and forgets a dead owner's boost only once that scope is empty, which is the same boundary as the ticket's lifetime. An apply still in flight therefore lands before the reset, never after it.
  - **S21** (the reviewer's reproduction): the apply is held, the holder killed, and the record kept while the setter lives. Once released, the late apply lands, the scope empties, and the weight is reset. On `ddd814da` it fails at "kept while the holder's scope still holds the setter".
- **F2, rollback abandoned pending cleanup.**
  - **Guarded commands:** `install.sh --rollback <version>` (new) and `--uninstall` first run `handover.mjs`. It refuses, changing nothing, while an exclusive job runs or while a boost record remains or the weight doesn't read back as the default after reconcile.
  - **Always available:** `install.sh` and `handover.mjs` are now in every installed version, so the guarded path runs from `current/install.sh`.
  - **Documented:** WORKER_RESOURCE_LIMITS "Operating it" and SCHED-2's rollback step say: never roll back by running an older tree's `install.sh`.
  - **S22:** a pending reset with no tickets makes rollback and uninstall refuse with the reason, leaving `current` unchanged; once the fault clears, rollback succeeds with a verified reset. An exclusive job running makes rollback refuse; after its holder dies and it's recovered, uninstall succeeds.
- **Backstop (the coordinator's suggestion, adopted):** with no boost record and no exclusive job running, reconcile resets our slice's weight whenever it reads non-default.
  - **Cost:** a cheap `cpu.weight` read when the slice's cgroup exists; an idle slice is checked through systemd at most once a minute.
  - **Coverage:** `recover()` runs on that check too, so any queue command repairs a stray boost, for example after a bypassed rollback once this version is reinstalled.
  - **Safe** because the weight is ours alone. **S22** sets a stray weight and a queue command resets it (`boost-reset`, `by: backstop`).
- **P3, a failed read-back counted as verified:** fixed. A reset or apply is verified only when systemd's read-back succeeds and shows the expected value.

## R3 review responses (history; superseded by R4: the handover is gone)

Review `ee0bee6d` on `review/tst-16-r3`, on `ef037871`: one P2.
- **F1, handover was not atomic with admission.** Its checks, weight read/reset and final check were separate unlocked steps, so a refusing handover could reset a live boost, and work submitted or queued across the handover could be boosted on an old install and stranded.
- **Fix: one protocol through the switch.**
  - **Freeze:** `handover.mjs` sets `state.frozen` in `transaction()`. A holder decides whether to boost in the same transaction as its journal, so no boost starts once the freeze is set.
  - **Admission continues, unboosted.** Supervisors keep admitting, including this version's already-running and queued ones, pinned to their install, after a rollback. Refusing admission instead would strand those queued tickets forever, because the old version never lifts the mark.
  - **Wait:** the handover waits (`SILTWAKE_HANDOVER_WAIT`, 1,800 s) until no boost is owned. A running exclusive releases its own; a dead owner's is reset by reconcile once its scope is empty.
  - **Certify:** inside one transaction, reconcile, no boost record, and the weight verified at its default through the shared backstop. That backstop is now `boostBackstop()`, used by reconcile and handover alike. Under the freeze, an unboosted exclusive doesn't stop it resetting a stray weight.
  - **No own setter:** the handover has no setter or read/check/reset sequence of its own (the duplication the reviewer flagged). Every reset happens in reconcile, with its ownership checks, under `state.lock`. A holder that never applied a boost never resets one.
  - **The switch:** `install.sh` switches or removes `current` with the freeze still in place; installing an aware version lifts it (`--thaw`). On refusal the handover lifts the freeze, and `current` is unchanged.
- **S22, rewritten:** the old version is the exact live `95f340380c25`, installed from root `91dc1ab`'s own tree, and its later operation is verified (a quick job, `status`, an exclusive job of its own, the weight untouched). It covers:
  - a reset pending with no tickets: refused, then handed over;
  - a refusal beside a live boost: the weight, record and ticket are untouched;
  - admission between certification and the switch: the job runs unboosted, and the weight never reaches 10,000 while it runs;
  - an exclusive queued behind a quick job, then a guarded rollback: its pinned supervisor admits it on the old install, unboosted;
  - holder death mid-handover: the handover waits, then uninstalls after recovery;
  - the backstop.
- **Unboosted runs are never clean evidence** (coordinator's condition for admitting unboosted).
  - **Recorded:** the result's `context.boost.status` is `withheld-frozen` (or `failed`, if the apply failed), and the final line shows `CPU boost withheld-frozen`.
  - **Labelled:** the run is `DISTURBED` with the reason "the exclusive CPU boost was withheld (…): not boosted evidence", so its timings don't count.
  - **Tested:** S22's admitted-during-handover and queued-exclusive cases assert the status, `DISTURBED` and the reason (the final line too), and a unit test covers withheld, failed and applied.
- **Negative control:** S22's queued-exclusive part, run on `ef037871`, fails at "was boosted during a handover".

## Checks

- **Unit tests** (`tests/heavy-contention.test.ts`, 9, including a run without the slice's priority, throttling with strict counters, explicit population and the live-slice mismatch):
  - the CW-1 case (host memory "full" 32% with the job unstalled is clean, and recorded);
  - every reason with its value, and host swap and other CPU recorded but not judged;
  - the tail merge;
  - missing coverage of every kind, recovery, and nulls;
  - snapshot parsing and the exclusive-slice selection.
- **Acceptance (SCHED-2 suite), re-derived for R4:**
  - **S17:** an exclusive job runs in the exclusive slice: its cgroup path, the static weight, `boost.status: applied`, the final line. It is measured from before its payload to after it, with raw points kept. The slice's weight is unchanged afterwards and it holds nothing; no runtime boost state exists.
  - **S18:** a missing slice, or one with CPUWeight 100, means the job runs in the lane's slice, `unavailable`, `DISTURBED` with the reason.
  - **S19:** no slice named, none used.
  - **S20:** the late GPU client.
  - **S21:** a holder killed while its exclusive job runs. The job stops with it, the slice empties, the result is unmeasured, and there's nothing to clean.
  - **S22:** install, rollback and uninstall:
    - install writes the slice's unit once, with the heavy slice's caps (a runtime unit for private state);
    - an exclusive job runs in it while the **real live version `95f340380c25`** is reinstalled from root `91dc1ab`'s own tree (a plain rollback);
    - the job keeps its priority to its end;
    - the old version then runs its own exclusive job in the lane's slice, with nothing left over;
    - uninstall leaves the inert unit; `--remove-exclusive-slice` refuses while a ticket runs, and removes it once done (R5).
  - **S23 (R5-F1):** a unit removed between readiness and launch (a default slice under the right name), and a wrong memory cap: `unavailable`, `DISTURBED`, judged on the live slice reading.
  - **S24 (R6, R7):** neither removal nor a changing reinstall happens while the slice holds processes, also when systemd can't be asked or there's no unit file, nor while a ticket runs.
  - **S25 (R8):** the unit changes all-or-nothing under bounded systemd calls: held and failed reloads, retry, removal.
  - **SCHED-1 test 7** checks the job's own measurement.
- **Full suites** after R8 at `2fe7aef1`: SCHED-1 **23/23**, SCHED-2 **25/25** (S25 new), SCHED-2b **27/27**, all local and sequential.
  - **Fast tier:** passed through the queue on alickers (`--machine 4070`, ticket `261023-224619-c8b8`, exit 0, 138 files, evidence for `2fe7aef1`), not locally, during CW-1's 3090 exclusive window.
  - No units, slices, unit files or drop-ins left behind.

## Validation (CW-1 segment 7, run A)

Run A (no priority boost; it ran before R1, on the live holder with the old rule). Approved scope: nothing on T3's slices; a boosted run waits for the install.
- **Setup:** CW-1 tour segment 7, the "quiet" run labelled `DISTURBED`. CW-1's own dist, saves and harness at `cb8ae86`, exported to `/work/tmp/tst16/cw1run`, so CW-1's worktree is untouched.
- **The run:** live-queue `exclusive` ticket `261023-133903-4bcd`, 323 s (the original took 678 s).
- **Sampling:** a read-only sampler (`/work/tmp/tst16/sampler.mjs`) read the job's own cgroup pressure, `/proc/stat` and T3's agents slice every second. It also ran the new `contention.mjs` beside the installed holder, which still has the old rule. Evidence is in `/work/tmp/tst16/runA/`.
- **Frames:** 19,449; p50 16.7 ms, p99 16.8 ms, max 100 ms; 13 over 33 ms, 1 of them in streaming parts. CW-1's gate fails on that one.
- **Old label (installed):** `DISTURBED`, host CPU PSI 47%, load 11.1.
- **New label (v2 context):** `DISTURBED`, "the job waited for a CPU 11.76% of its worst 5 s".
  - Whole run: job CPU wait 2.71%, memory stall 0.
  - Steal: 0.36% overall, 3.18% in the worst 5 s.
  - CPU used outside the job: 39% of the machine on average, 85% at worst.
- **Each second of the run** (median / p95 / max):
  - job CPU wait 0.2 / 11.2 / 17.1%;
  - job memory stall 0 / 0 / 0;
  - steal 0.1 / 1.3 / 7.6%;
  - CPU outside the job 2.3 / 6.7 / 6.9 CPUs (of 8), almost all of it T3's agents slice (1.2 / 6.7 / 6.9).
- **Timing caveat:** this harness version records no page origin, so frames are aligned to the job's admission plus 0.6 s, ±1 s. Each frame below shows the worst 1 s window within that span.

| frame at (s) | gap ms | streaming | thread on-CPU / waiting ms | job CPU wait % | job mem stall % | steal % | job CPUs | other CPUs | agents CPUs | host CPU PSI % | host mem full % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 117.5 | 66.6 |  | 68.6 / 0 | 0.7 | 0 | 2.8 | 1.06 | 2.82 | 1.32 | 3.2 | 0 |
| 162.0 | 66.7 |  | 0.2 / 0.2 | 0.4 | 0 | 6.4 | 1.02 | 2.72 | 1.49 | 1.6 | 0 |
| 164.1 | 100 |  | 13.5 / 0.2 | 2.1 | 0 | 7.3 | 1.57 | 2.44 | 1.13 | 2.2 | 0 |
| 169.2 | 83.4 |  | 10.5 / 0.1 | 6.2 | 0 | 7.1 | 1.44 | 4.4 | 4.02 | 27.5 | 0 |
| 170.2 | 100 |  | 92.9 / 1.5 | 6.2 | 0 | 7.1 | 1.44 | 4.89 | 4.02 | 27.5 | 0 |
| 174.0 | 66.6 |  | 7.9 / 0.2 | 5.5 | 0 | 7.6 | 1.09 | 6.41 | 5.46 | 45.7 | 0 |
| 174.1 | 66.7 |  | 59.2 / 0.3 | 5.5 | 0 | 7.6 | 1.09 | 6.41 | 5.46 | 45.7 | 0 |
| 179.4 | 66.6 |  | 20.5 / 5.1 | 7.7 | 0 | 4 | 1.25 | 6.52 | 5.53 | 45 | 0 |
| 184.5 | 50 |  | 54 / 0.5 | 7.1 | 0 | 2.8 | 1.18 | 6.46 | 5.49 | 44.1 | 0 |
| 203.2 | 50 |  | 23.1 / 31.2 | 13.1 | 0 | 0.1 | 1.36 | 6.57 | 6.58 | 46.7 | 0 |
| 219.1 | 50 | yes | 20.7 / 32.2 | 15.1 | 0 | 0.5 | 1.24 | 6.87 | 6.79 | 53.6 | 0 |
| 250.3 | 50.1 |  | 17 / 34.7 | 8.7 | 0 | 0 | 1.28 | 6.67 | 5.68 | 51.4 | 0 |
| 260.3 | 33.4 |  | 26.2 / 9.7 | 6.5 | 0 | 0.6 | 1.3 | 4.87 | 4.73 | 12.5 | 0.3 |

- **Measured facts:**
  - **4 late frames (203–260 s), including the only streaming one:** the renderer thread spent 10–35 ms of the sampled span *waiting for a CPU*. The spans are 38–59 ms; they bound the frame gaps rather than matching them. The job's cgroup waited 9–15% of those seconds, and T3's agents slice used 5.7–6.8 of the 8 CPUs. Each of these frames also contains a 24–50 ms V8 GC pause.
  - **5 frames (117.5–184.5 s):** the thread was on-CPU for most of the span. The job's own wait was low (0.4–7.7%). Machine-wide steal in those ±1 s windows reached 2.8–7.6%, against a run median of 0.1%.
  - **4 frames (162.0, 164.1, 169.2, 174.0 s):** the thread was off-CPU without waiting (0.2–13.5 ms on-CPU), and machine steal was elevated around them too.
  - **The renderer main thread took 0 major faults in all 13 long frames.**
- **Hypotheses, not conclusions:**
  - CPU contention probably contributed to the 4 late frames. Which agents' work it was, and which frames a boost would remove, isn't known.
  - Steal is machine-wide and aligned to ±1 s, so it doesn't locate stolen time on the renderer's vCPU.
  - The off-CPU frames may be blocking on the GPU or IPC, or something else; this run can't tell.
- **What would settle it:** a boosted run with exact page-to-host clock alignment, after the install. CW-1 is profiling the frames.
- **The new label agrees with the old one here, for a reason that can be checked:** the job's own CPU wait, not host-wide PSI.

## Compromises, limits and missing evidence

- **A boosted CW-1 run is missing until this is installed.** Then rerun CW-1's segment, with exact clock alignment.
- **The priority favours exclusive jobs over all other user work,** not only light work.
  - **When it matters:** only when they contend, and only for what the job uses.
  - **What T3's agents feel:** their tools may run a little slower during an exclusive run. A priority aimed only at light work would need a CPU controller inside T3's slices, which is T3's call.
- **The exclusive slice's caps are fixed at install,** from this machine's CPUs and the pool config. The heavy slice is corrected at runtime when they change; the exclusive slice is corrected when `install.sh` next runs.
- **The thresholds (5%, 1%, 1 fault, 1 swap-in, 5%) are first values,** and they are config.
  - **Major faults include cold file reads:** a run after page-cache eviction is marked `DISTURBED` for them, deliberately, because its timings include disk reads.
- **Steal is machine-wide.** Fleet's audit found the vCPUs pinned, so steal is host work (Kopia, ZFS writes, the proxy, interrupts) waking on those cores. The root fix is fleet's: keep host work off them.
