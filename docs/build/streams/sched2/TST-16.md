# TST-16: clean exclusive measurements (what DISTURBED means, and CPU priority for exclusive runs)

Builder: Opus 5.5, branch `t3/tst-16-light-slice`, from root `9ac573ec`, with root `91dc1ab` (SCHED-2b and SAVE-1) merged in. It touches `scripts/heavy`, so it's checked with the full SCHED-1, SCHED-2 and SCHED-2b suites. Asked for by the coordinator after CW-1's 3090 frame gate. That gate failed on 24 frames, mostly in runs labelled `DISTURBED`, and one quiet run was labelled `DISTURBED` too.

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
- **CPU priority (R1 redesign; replaces the light-work slice):** while an exclusive job runs, our own top-level slice `siltwake.slice` (the heavy slice's parent) gets `CPUWeight=10000`; config `exclusiveCpuWeight`.
  - **Why this lever:**
    - **Weight is shared at the top level:** CPU is divided by weight between the top-level user groups. `app.slice`, where T3 runs every agent and its tools, has 100.
    - **T3's slices can't be used:** they enable no CPU controller (`subtree_control` is `memory pids`), and T3's agent scope has its own `pids.max`. A CPU quota on any light unit inside them would make systemd enable the controller on T3's slices, and a sibling scope would escape the caller's `pids.max`.
    - **Process priority doesn't work here:** lowering nice or `SCHED_IDLE` can't be undone without privileges (`RLIMIT_NICE` is 0). It also doesn't act across cgroup groups: a group's share is its weight, whatever its tasks' policies.
  - **Measured** (`/work/tmp/tst16/weight-exp.sh`): a busy probe pinned to one CPU, in a private top-level slice, against four busy `app.slice` threads on that CPU. In three paired runs it waited **14–21%** of the time at weight 100 and **0%** at 10000, running 99–100%.
  - **What changes:** one property of our own slice, for the job's duration. No process moves. No caller's memory, swap or pids containment changes, and T3's slices are never touched. Other work only yields the CPU the exclusive job actually wants; run A's job used about 1.1–1.6 of the 8 CPUs.
  - **Crash-safe ownership (R1-F1):**
    - **Journalled first:** `state.boost` records the slice, ticket and owner before the weight is set. The holder marks it `releasing`, resets the weight and reads it back; the record goes only after a **verified** reset.
    - **Reconcile** resets a record whose owner is dead, whose job isn't running, or that is `releasing`, and keeps it until the reset is verified. `recover()` also reconciles with no tickets left.
    - **Takeover:** the next exclusive job takes ownership of a pending record under the state lock, so nothing resets the boost under it.
    - **Private state** boosts only a slice its environment names.
- **Removed:** `scripts/light-run.sh`, the shared `siltwake-light.slice` and the package.json changes, which caused R1-F2 and F3. The npm scripts are back to root's.
- **Install:** `contention.mjs` is in both the version and the GPU guard manifests, alongside SCHED-2b's remote modules.

## R1 review responses

Review `81d6d83` on `review/tst-16-r1`, on `312b1bed`: two P1s, three P2s.
- **F1 (P1): crash-safe ownership.** Journal before applying; keep the record until a verified reset; recover with no tickets; serialise against the next exclusive job. **S18** proves both crash boundaries (a fault-injecting `systemctl` kills the holder just before and just after applying), a reset failing in the holder and then in reconcile, and the next exclusive job taking over a pending record without being reset under it.
- **F2 (P1) and F3 (P2): containment.** Fixed by removing the design: no light work is moved or re-limited, and the shared slice is gone. Small-to-large, large-to-small and simultaneous callers no longer apply, because no caller's process or limits are touched. The boost is a CPU weight on our own slice.
- **F4 (P2): coverage.**
  - **Unit tests:** the reviewer's two probes (an unreadable tail is unmeasured; a 0.9 s tail with 900 ms of CPU wait now disturbs), a missing baseline or end, gaps (also at either end), recovery, and nulls.
  - **S17:** the baseline before the payload's first line and the end after it, on one clock; raw points kept.
  - **S18:** recovered results are unmeasured.
- **F5 (P2): the GPU scan** is forced on the first and final observation. **S20**: a client opened after admission and outlasting the job is in `gpuShared` and the reasons.
- **Composition with SCHED-2b:** merged root `91dc1ab`. The holder keeps 2b's machine and artifact fields and the v2 context together. `cpuContext` is gone. Reconcile keeps 2b's remote-recovery branch separate from the local boost, which is keyed to its own exclusive ticket, so a remote ticket's death can't release it. `install.sh` carries `contention.mjs` and 2b's modules and transport. The acceptance lib keeps 2b's sandbox seams.

## R2 review responses

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

## Checks

- **Unit tests** (`tests/heavy-contention.test.ts`, 6):
  - the CW-1 case (host memory "full" 32% with the job unstalled is clean, and recorded);
  - every reason with its value, and host swap and other CPU recorded but not judged;
  - the tail merge;
  - missing coverage of every kind, recovery, and nulls;
  - snapshot parsing and the boost-slice selection.
- **Acceptance (SCHED-2 suite):**
  - **S17:** boost applied and reset, measured from before the payload to after it, raw points kept.
  - **S18:** crash boundaries, reset failures, takeover.
  - **S19:** private state without a named slice boosts nothing.
  - **S20:** the late GPU client.
  - **S21:** an in-flight apply at holder death (R2-F1).
  - **S22:** guarded rollback and uninstall, and the backstop (R2-F2).
  - **SCHED-1 test 7** checks the job's own measurement.
- **Full suites** on the merged branch (root `91dc1ab` with this work): SCHED-1 **23/23**, SCHED-2 **22/22**, SCHED-2b **27/27**, fast tier **1,403/1,403**. No units, slices or drop-ins left behind.

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

- **A boosted CW-1 run is missing until this is installed.** The live holder doesn't boost. Then rerun CW-1's segment, with exact clock alignment.
- **The boost favours the exclusive job over all other user work,** not only light work.
  - **When it matters:** only when they contend, and only for what the job uses.
  - **What T3's agents feel:** their tools may run a little slower during an exclusive run. A boost that targets only light work would need a CPU controller inside T3's slices, which is T3's call.
- **The thresholds (5%, 1%, 1 fault, 1 swap-in, 5%) are first values,** and they are config.
  - **Major faults include cold file reads:** a run after page-cache eviction is marked `DISTURBED` for them, deliberately, because its timings include disk reads.
- **Steal is machine-wide.** Fleet's audit found the vCPUs pinned, so steal is host work (Kopia, ZFS writes, the proxy, interrupts) waking on those cores. The root fix is fleet's: keep host work off them.
