# TST-16: clean exclusive measurements (the light-work slice, and what DISTURBED means)

Builder: Opus 5.5, branch `t3/tst-16-light-slice`, from root `9ac573ec`. It doesn't depend on SCHED-2b, but it touches `scripts/heavy`, so it was checked with the full SCHED-1 and SCHED-2 suites. Asked for by the coordinator after CW-1's 3090 frame gate. That gate failed on 24 frames, mostly in runs labelled `DISTURBED`, and one quiet run was labelled `DISTURBED` too.

## Why a quiet run was labelled DISTURBED

- **The old rule** (SCHED-1, `holder.mjs`): `DISTURBED` if host-wide `/proc/pressure/cpu` "some" ≥ 10%, or `/proc/pressure/memory` "full" ≥ 1%, taking the maximum of the avg10 values sampled every 15 s, or if the GPU was shared.
- **CW-1's quiet run** was tour segment 7 (ticket `261023-084038-fa4a`), with run-wide maxima of load 5.69, CPU PSI 6.45% and **memory full 32%**. Memory full alone set the label. CW-1's lower figures (load ≤ 2.65, PSI ≤ 0.54%) are probably host samples joined at the spike frames, not the run-wide maxima the label used.
- **Where that memory stall came from:** T3's agents slice is capped (MemoryHigh 9.6 GiB, MemoryMax 11.7 GiB, a runtime drop-in). A builder's test or build that reaches it stalls on memory. Host-wide memory "full" counts the time when *every* non-idle task is stalled, and a game idles between frames, so another slice's throttling counts as "full" while the game never waits.
- **So the label measured the host, not the job.** And sampling avg10 every 15 s missed or smeared short stalls.

## What changed

- **The job's own contention** (`scripts/heavy/contention.mjs`):
  - **What is sampled:** the exclusive job's own cgroup `cpu.pressure` and `memory.pressure`, using their cumulative stall totals in µs, so nothing between samples is lost.
  - **How often:** every second, judged in 5 s windows (worst window and whole run). A run shorter than one window counts as one window.
  - **Added from `/proc/stat`:** hypervisor steal (a VM's vCPU taken away underneath the guest, invisible to PSI) and the CPU used outside the job.
- **Swap (fleet's host audit, 2026-10-23).** The vCPUs are pinned to dedicated host cores, so steal comes from Unraid's own work on those cores. The guest swaps (about 700 MB out), and a swap-in can stall a thread 50–100 ms without showing as steal.
  - **Recorded:** `/proc/vmstat` `pswpin`, `pswpout` and `pgmajfault`, plus the job cgroup's own `memory.stat` `pgmajfault` and `workingset_refault_anon`. The kernel keeps no per-cgroup `pswpin`, so the anonymous refaults are the job's swap-ins.
  - **Warm cache means zero:** a live 14-minute playthrough scope had 0 major faults and 0 refaults. Any major fault is therefore a sign the job's memory or cache was evicted.
- **`DISTURBED`, with `reasons`:** in the worst window,
  - the job waited for a CPU ≥ 5% of the time;
  - stalled on memory ≥ 1%;
  - took ≥ 1 major fault or ≥ 1 swap-in in its own cgroup;
  - steal ≥ 5% of the machine's CPU;
  - or the GPU was shared outside the lease.

  A run whose own counters couldn't be read is `DISTURBED` too, because unmeasured is never clean. Thresholds: config.json `disturbed`.
- **Recorded for audit** (`context` v2 in the result and the ledger; summarised in the final line): job values (whole run and worst window), steal, CPU used outside the job, host load and host PSI (the old fields stay, for older readers), and the light slice's CPU during the run.
- **The light-work slice:**
  - **`scripts/light-run.sh`** runs `npm test`, `typecheck`, `build` and `test:build` (package.json) in `siltwake-light.slice`. Inside a queue job or the sandbox's job it runs in place, so nothing is ever moved out of a job's limits; it also runs in place without a user manager.
  - **Memory:** the slice inherits the caller's nearest memory caps (for an agent, its T3 slice's), so moving work there never escapes that budget.
- **The clamp:**
  - **While an exclusive job runs,** its holder sets the light slice to `CPUQuota=100%` (one of 8 CPUs) and `CPUWeight=idle`, runtime only, and releases it with the result.
  - **If the holder dies,** reconcile releases the clamp once the job is gone (ledger `light-unclamped`).
  - **Private state** (tests) never touches the real slice; it clamps only a slice its environment names.
- **Install:** `install.sh` carries `contention.mjs` in both the version and the GPU guard. The first full run caught the guard breaking without it.

## Checks

- **Unit tests** (`tests/heavy-contention.test.ts`, 5): the CW-1 case (host memory "full" 32% with the job unstalled is clean, and recorded); each reason with its value; values just under the thresholds; configured thresholds; unmeasured is disturbed; the light-slice selection for production and private state.
- **Acceptance:**
  - **S17:** an exclusive job clamps the private light slice (1 s quota, idle weight). Light work started meanwhile lands in it. The context is v2, with the job measured and the clamp recorded. The clamp is released at the result, and also after a holder death, via reconcile.
  - **S18:** private state without a named slice clamps nothing, and the real slice is untouched.
  - **SCHED-1 test 7** now checks the job's own measurement.
- **Full suites** at `a9a10ffb`: SCHED-1 **23/23**, SCHED-2 **18/18**, fast tier **1,364/1,364** (run through `light-run.sh` into a private slice).

## Validation (CW-1 segment 7, run A)

Run A (unclamped). Approved scope: no clamp on T3's slice; run B waits for the merge.
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

- **What the long frames show** (one run; three different causes):
  - **GC pauses lengthened by CPU contention, 4 frames (203–260 s), including the only streaming frame.** Each contains a V8 GC pause of 24–50 ms (the harness's `gcShaped`), and during it the renderer thread *waited for a CPU* 10–35 ms of the gap. The job's cgroup waited 9–15% of those seconds, while T3's agents slice used 5.7–6.8 of the 8 CPUs. The clamp addresses the waiting part once builders' work goes through `light-run.sh`; the pauses themselves are the game's.
  - **Likely steal, 5 frames (117.5–184.5 s).** The thread was on-CPU for most of the gap (or off it without waiting), its own cgroup barely waited (0.4–7.7%), and steal in those seconds was 2.8–7.6% against a run median of 0.1%. This matches CW-1's "vCPU descheduled underneath the guest". Per fleet's audit, that's host work (Unraid) waking on the pinned cores. Nothing inside the VM can clamp it.
  - **Neither contention nor steal, 4 frames (162.0, 164.1, 169.2, 174.0 s).** The thread was off-CPU without waiting (0.2–13.5 ms on-CPU of a 67–100 ms gap): blocked on something else. Fleet suggested swap-ins. The harness's per-frame counters show **0 major faults on the renderer main thread in all 13 long frames**, these 4 included, so the main thread didn't swap in. A swap-in in a process it waits on (the GPU process, say) can't be ruled out, because run A didn't sample `/proc/vmstat` (the context does now). Otherwise it's GPU or IPC: CW-1's profiling, which agrees with its reviewer's join (22 of 24 spikes with the renderer on-CPU and low PSI).
- **So the clamp alone won't clear CW-1's gate,** as the coordinator expected. In this run it would have addressed the one frame that fails the gate, and 3 others. The rest are steal (fleet: keep host work off the pinned cores), GC pauses, or the game's own blocking (CW-1).
- **The new label agrees with the old one here, for a reason that can be checked:** the job's own CPU wait, not host-wide PSI. On CW-1's quiet run it would have been driven by the job's own counters, not by another slice's memory stall. Run B (clamped) follows the merge.

## Compromises, limits and missing evidence

- **Run B (light work clamped) is missing until this is merged and installed.**
  - **Why:** the live queue's holder doesn't have the clamp yet, and builders' work goes through `light-run.sh` only after the merge. Until then it runs in T3's `app-t3code-agents.slice`, which we don't own and must not clamp (coordinator, 2026-10-23).
  - **Then:** rerun CW-1's segment with the real clamp on `siltwake-light.slice`.
- **Only the npm scripts are clamped.**
  - **What escapes:** commands builders start directly (`npx tsc`, `node --test`, dev servers, previews) run in their T3 slices, unclamped.
  - **Root fix:** T3 runs each agent's tool commands in a slice we may clamp, or exposes a hook to clamp its agents' slices during exclusive runs.
  - **Cost:** a T3/fleet change, the owners' call.
- **The thresholds (5%, 1%, 5%) are first values.** They are config, and run A's numbers (above) are the first real calibration. Tune them as more exclusive runs record v2 contexts.
- **Steal is machine-wide.** A VM's steal can't be attributed to one cgroup. Fleet's audit found the vCPUs already pinned to dedicated host cores, so steal is Unraid's own work (Kopia, ZFS writes, the proxy, interrupts) waking on them. The root fix is fleet's: keep host work off those cores.
- **Major faults include cold file reads,** not only swap. A run whose page cache was evicted (by memory pressure, or after a reboot) is marked `DISTURBED` for them. That's deliberate: its timings then include disk reads. The threshold is config (`disturbed.jobMajorFaults`).
