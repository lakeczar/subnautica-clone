# SIM-PERF-1: the simulation's frame spikes, attributed and fixed

Branch `t3/sim-perf-1`, from root `168a5084` (merged with root's docs at `ee2e4450`). **Code: `36dabcf3`** (no game source has changed since; later commits are the harness's collection counters and this page). No save schema change. No intended change to any outcome: every fix gives the same answers (tests and the differential below).

## Outcome
Every simulation step over 8 ms in ordinary play now has a named cause. The game's own were the autosave, the hunter's sweeps and first use after a load, and they are fixed at the root. On the 3090, exclusive and headless, no step is over 8 ms bar one collection (p99 0.20 ms, from 0.28–0.30). In the 3090 browser test, two steps were over 8 ms (63 and 9.5 ms measured, both in the trivial `input` phase); host steal and canary stalls overlap them, but their attribution is **unproven** (review R1-F1, below). Every other long frame measured at most 0.4 ms of simulation. CW-1's 30–136 ms steps don't recur in the headless replays (below).

## How it was measured
- **The step meter** (`src/sim/stepCosts.ts`): each fixed step's time by phase (24 phases: the guard's checkpoint and journal, every part of `stepGameInPlace`, and the app's own work: input, events, timeline, timeline save, HUD presentation, autosave). Pulled, never pushed (convention 6): `SiltwakeApp.stepCosts()`, and `__siltwakeStepCosts()` for drivers (`FORK(step-costs-global)`, below). Recording allocates nothing per step (typed arrays); it is always on in the app, at about 25 clock reads a step.
- **The headless harness** (`scripts/playthrough/stepcost.ts`) runs each step as the app does: the guard's step, then timeline observation, its 600-tick export and the 1,800-tick autosave through the real repository (lock body included). Every scenario (4.19 M steps), or held travel from every SAVE-1 library kind. Options:
  - `--verify` re-executes every slow step three times from its own pre-step state (a checkpoint every 60 ticks plus a journal, as `StepGuard` keeps). Fast again means the step isn't inherently slow when warm: it doesn't clear the step, because a warm replay omits first-use costs (compilation, a first contact mesh) and the app's own phases (autosave, timeline). Those are judged separately: replaying the whole scenario in a fresh process to the same tick (`--capture`) reproduces first-use costs, and the app's phases are timed by the meter.
  - `--host` tags each slow step with per-vCPU steal and a canary thread's late wake-ups.
  - `--capture RUN:TICK` CPU-profiles one step in context and saves its pre-step save and controls.
  - `--heap` (allocation by phase) and `--alloc` (allocation by function, with callers).
- **The browser:** CW-1's traversal (`docs/build/streams/cw1/traverse.mjs`, CW-1's tree at `6ca73311`), one harness:
  - **The streamed trace** (`stream-trace.mjs`, written here, folded in by CW-1 at `4ea4d4a7`): CDP `Tracing.start` with `ReturnAsStream`, read in 4 MiB chunks and split into events as it arrives, restarted every 90 s so Chrome's buffer never fills. A materialised trace passed V8's 512 MiB string limit (CW-1's D2); streamed runs read 1.6–2.0 GB with no data loss. `CW1_TRACE=1` adds the `toplevel`, `gpu` and `devtools.timeline` categories and each long gap's longest slices.
  - **`SIMPERF_HOST=1`** (written here, folded in at `6ca73311`): a 1 ms `CLOCK_MONOTONIC` canary on its own thread, the renderer thread's state and syscall every 2 ms (`wchan` is hidden on this kernel), the GPU process's `__GL_*` settings, the step meter's snapshot, and a verdict for each step over 8 ms. The verdict used for the runs below (CW-1's `stolenBetween`: the larger of the renderer's and GPU process's steal over whole bracketing intervals) was too generous (R1-F1). Its replacement, `step-class.mjs`, is with CW-1 as a patch (below).
  - **The probe** (`probe/sim-perf-1-cw1`, local, not for merge): CW-1's branch merged with this one, plus the shader-cache wrappers and CW-1's `saves-t6` segments.

## Attribution (causes, ranked)
Every slow step was re-executed from its own pre-step state (`--verify`), or its whole scenario replayed in a fresh process to the same tick (`--capture`), which also reproduces any first-use cost. A step that is slow again is the game's; one that isn't was a collection, the host, or (in the browser) the thread waiting.

1. **The 30–136 ms steps (CW-1's six, REC-1's 68.8 ms, and this stream's own): host disturbance is supported; complete attribution is not established.**
   - **Measured (headless):** on factory-worker the 33.9, 38.8, 45.8 and 8.8 ms steps took about 1 ms when their whole scenario was replayed in a fresh process to the same tick (which reproduces first-use costs). They were not the game's work at that tick in those runs.
   - **Measured (3090 browser):** two steps over 8 ms, **63 and 9.5 ms of wall time**, both in the `input` phase (sampling keys and the helm, normally microseconds). **Attribution unproven:** steal on the renderer's vCPU and canary stalls overlap them, but the canary overlap was only 7.6–8.7 ms, and the classifier that cleared them was too generous (R1-F1: it took the larger of renderer and GPU-process steal over whole bracketing intervals). The raw per-vCPU samples weren't saved, so they can't be re-judged; a stricter classifier that saves them is with CW-1, and a clean rerun is a follow-up.
   - **Frames (3090 browser):** of 35 frames over 34 ms, 30 are host by CW-1's frame rule and 4 more had VM-wide steal with canary stalls of 30–113 ms; one was render-side work in the GPU process (53 ms on CPU in `ExecuteDeferredRequest`). CW-1's frame rule has the same boundary over-count (below); 5 of the 30 sit within its margin.
   - On the 4070 (no host pauses), 273,249 browser steps over six segment runs had none over 8 ms; its long frames are the GPU-bound renderer blocked in `futex`, no steal and the canary clear.
2. **Collections.** Node's major collections land 7–15 ms in whatever step allocates (up to 75 ms on CW-1's tree headless, where unstreamed cluster builds allocate about 18 MiB each). The step allocated 118 KiB a tick on root (124 on CW-1's tree); now 76.1 (−36%).
3. **Autosave (every 1,800 ticks): 4–7 ms in a step, 10–17 ms on the first after a load.** Each commit decoded the record it had just written up to four times.
4. **Hunter encounters: over 1 ms on every encounter step, up to about 8 ms.** Each sweep slice (0.2 m, up to about 15 escape directions a step) re-validated all 11,415 world solids.
5. **First use after a load:** the first steps' compilation (5–8 ms), each hull's contact mesh at its first hunter contact (about 3 ms), the first autosave (above).
6. **Steady costs, not spikes:** terrain sampling (the largest per-step CPU and allocation: about 1 ms of a heavy 1.1 ms Divide step, 24 KiB a step), the systems host views (rebuilt every step), cycle sight lines near cycle fields (p99 0.4–0.6 ms), the HUD's per-step presentation (browser mean 90 µs, max 5.7 ms).
7. **The play-timeline save** grows with the session (13–21 ms at a full window): SIM-1b's, below.

## What changed (each with identical answers)
- **The roster check** (`sim/world.ts`): a separated sweep validates the immutable solids roster once per world, not on every call. Threat p99 1,117 → 21 µs and step p99 1.22 → 0.28 ms in held runs from `hull-damaged` and `carrier-fitout`.
- **The save commit** (`save/repository.ts`): the repository remembers the record it read or wrote, decoded, so a commit never parses or validates its own record again (decoding is a pure function of the text; slot envelopes are never mutated, the session clones). `repository.commit` 3.4 → 1.2 ms on a late save. Byte limits encode only when the length can't tell (`utf8Over`, `save/codec.ts`). It still validates what it writes.
- **Craft profiles** (`sim/upgrades/effects.ts`): memoized by their inputs' values (`hull|rating|fitted`), frozen, in a `BoundedMemo` (`sim/caches.ts`): at most 128 entries and 96 KiB (about 400 bytes a profile plus its key, documented), the oldest first, registered in the sim's cache ledger. They were the step's largest allocation (about 17 KiB).
- **The sim's cache ledger** (`sim/caches.ts`, review R1-F2, convention 8): `registerCache` and `simCaches()`. Each sim cache reports its owner, eviction rule, entries and bytes against its ceilings, hits, misses and evictions; the app reads it through `__siltwakeStepCosts()` with the step costs. CORE-HELPERS' "bounded cache" row names it.
- **Hazard sampling** (`sim/ecology/hazards.ts`, `sim/fittings.ts`): each world field's centre is resolved once, at load, into a fixed table (one entry a field, about 80 bytes each, never evicted, in the ledger; any other shape is resolved per call, uncached); `sampleHazards` keeps scalars, not a record and a vector per field; `hazardsAt` reads heat and brine in one pass (it read each heat field's level twice and ran a second whole `sampleHazards` for brine). `tests/hazard-sampling.test.ts` keeps the earlier algorithm as the exact reference.
- **The host power drain** (`sim/systemsLink.ts`, `listHosts(…, { occupied: true })`): views only hosts with something in a socket (every carrier, whose seeded fittings occupy sockets without an entry). The coordinator's suggested revision counter was not small: it would be a persisted field that every systems, facility, fleet and docking writer must bump.
- **Terrain polylines** (`content/regions/noise.ts` `nearestOnPolyline`): indexed instead of destructured; destructuring ran the iterator protocol for every segment of every sample (about 9 KiB a step). Same arithmetic. (World stream's module; a two-line allocation fix.)
- **Entry warm-up** (`sim/warmup.ts`, `save/repository.ts` `warmCommit`, `SiltwakeApp.warm`): when an expedition is entered, behind the pause, a copy of the state is stepped one second, every hull contact mesh is built (`hullContactPose`'s whole range) and a whole commit runs twice on a throwaway in-memory slot. The first autosave after a load: 9.1 → 1.6 ms and 10.1 → 1.3 ms (alickers). `tests/warmup.test.ts`: the state is untouched and play after warming equals play without it.
- **The step meter and harness** (above), and the driver's optional `DriverObserver.before`.

## Evidence
Each result names the SHA it ran at. "Before" is `a35da972` (root plus the step meter only; `probe/sim-perf-1-base` carries the same harness, without the warm-up its source lacks). Timings from alickers (RTX 4070 Laptop, a shared desktop host) and factory-worker shared runs are indicative; 3090 exclusive numbers are below.

**Determinism (final code `36dabcf3` against root `168a5084`, alickers):**
- **The differential** (`scripts/sim-differential.sh 168a5084`; root's own compiled simulation fed every scenario's real command stream beside this one): all 8 scenarios identical, 4.19 M ticks and 2,518 commands, 72,420 state checks, every tick's events and 1,225 timeline checks (1,821 s).
- **Cross-commit playthroughs** (`npm run playthrough -- --jobs 3`, root and head): all 8 complete, all 122 milestone hashes identical, every reload matched, and the run records (phases, legs, gathered and spent ledgers, hazards, discoveries, refusals) equal apart from wall time.

**Ordinary play, all 8 scenarios** (`stepcost --verify --host`, 4,190,887 steps, alickers):

| | p99 | p99.9 | max | steps over 8 ms |
|---|---|---|---|---|
| Before (`a35da972`) | 0.86 ms | 1.88 ms | 10.8 ms | 4: two collections, two not reproduced on re-execution |
| After (`36dabcf3`) | **0.43 ms** | **1.33 ms** | 12.5 ms | 3: two collections; one (12.5 ms, ecology) is 1.08 ms replayed to the same tick in a fresh process |

Phases over 1 ms, before → after: threat 2,423 → off the list; autosave 2,253 → 2,017, its maximum 6.3 → 3.6 ms and none over 4 ms (44 before).

**Held travel from all 16 library kinds** (576,000 steps, alickers, same inputs): p99 0.26 → **0.17 ms**, max 10.3 → **4.1 ms**, steps over 8 ms 1 → **0**; minor collections 1,139 (528 ms) → 634 (341 ms), majors 3 → 3. The creel scenario: p99 0.94 → 0.43 ms, max 9.1 → 6.0 ms; minor collections 4,042 (1,502 ms) → 1,784 (982 ms), majors 6 (21 ms) → 18 (52 ms; the harness re-warms at each of its 82 milestone reloads, the app once per entry), heap at the end 96 → 73 MiB.

**Allocation per step** (`stepcost --alloc`, five held kinds: `tour-ready`, `canopy-over-geared`, `creel-800`, `pre-ending-carrier`, `hull-damaged`): root 118.1 KiB, CW-1 `3779f59c` 124.2 KiB, this branch **76.1 KiB** (−36%). Biggest left: terrain sampling (`hypot`, `fbm`, `sampleAuthored`; the world stream's), `moveCapsule`'s per-call arrays (CW-1's `dataInBox` replaces them), host views.

**Focused costs:** threat p99 1,117 → 21 µs and step p99 1.22 → 0.28 ms (held, `hull-damaged` and `carrier-fitout`, factory-worker shared); `repository.commit` 3.4 → 1.2 ms on a 46 KB save; the first autosave after a load 9.1 → 1.6 ms (`pre-ending-carrier`) and 10.1 → 1.3 ms (`tour-ready`).

**3090 exclusive, headless** (ticket `261024-121720-fdb7`, not DISTURBED: the job's CPU wait 0.05% (worst window 0.14%), no faults or swap-ins, host steal 0.65% (worst window 4.0%), boosted slice applied, no throttling). Held travel from all 16 library kinds, 576,000 steps a run, before (`a35da972`, `probe/sim-perf-1-base`) and after (compiled at `c4406b84`; game sources as `2af18fa1`) interleaved over two rounds, with `--verify --host`:

| | p99 | p99.9 | max | steps over 8 ms | minor collections |
|---|---|---|---|---|---|
| Before, rounds 1 and 2 | 0.279, 0.304 ms | 1.33, 1.45 ms | 13.9, 14.7 ms | 1, 2 | 1,122, 1,144 |
| After, rounds 1 and 2 | **0.197, 0.197 ms** | **0.664, 0.664 ms** | **5.9, 8.7 ms** | **0, 1** (an 8.1 ms collection) | **631, 637** |

The before-tree's slow steps were the game's, and are gone after: `carrier-fitout` at tick 330,173 (13.9 and 14.7 ms, in both rounds, no steal on its vCPU; 0.63 ms re-executed warm: the first hunter contact's contact mesh and compilation, now warmed at entry), and `hull-damaged` at tick 158,546 (11.3 ms, threat 10.4 ms; still 4 ms re-executed warm: the per-sweep roster scan, now once per world).

**Browser, 4070 control** (`probe/sim-perf-1-cw1` at `99425bc4`: this branch at `9e6d3e99` with CW-1; segments 2 and 3 of CW-1's `saves-t6` plan, `SIMPERF_HOST=1`): 87,845 steps, **none over 8 ms**, p99 0.61 ms, p99.9 1.6–1.7 ms, max 4.6 ms (an autosave). The frame's own work p99 4.2–7 ms, max 9.9 ms; the gate passed and no long frame was the simulation's. Every long gap (GPU-bound, up to 200 ms) had the renderer's main thread **blocked** (`S futex` for 95–98% of the gap, 2–7 ms on CPU), the canary running through it and no steal.

**Browser, 4070, the shader-cache set** (`--class gpu --machine 4070`, indicative; probe `68d932bc`; segment 2 four times, `CW1_TRACE=1`, `SIMPERF_HOST=1`): **not a cold/warm comparison.** Chrome's GL there is ANGLE → Mesa's d3d12 driver; Mesa's shader cache (`MESA_SHADER_CACHE_DIR`, task-owned, emptied for "cold") stayed empty in all four runs (0 files before and after), and the Windows NVIDIA driver's own cache is outside the sandbox. The four runs are repeats under one condition:
- simulation 185,404 steps, **none over 8 ms**, p99 0.61 ms, max 3.8–7.2 ms;
- 260–316 frames over 34 ms a run, no steal; in 256–316 of them the renderer was blocked in `futex` or `ioctl` (GPU-bound at 1080p, as CW-1 found);
- no GPU shader compile in any long frame (the only "compile" slices are V8's background optimising compiler on a worker thread);
- the streamed trace read 1.6–2.0 GB a run with no data loss; every gate passed.

**Browser, 3090, the decisive test** (`--class exclusive`, probe `9c36c647`: CW-1 `4ea4d4a7` plus this branch's game at `2af18fa1`; segment 2 of CW-1's `saves-t6`; `CW1_TRACE=1`, `SIMPERF_HOST=1`; NVIDIA's shader disk cache on a task-owned path, emptied for the cold run). Both runs are labelled `DISTURBED` by the queue: host steal 5.4% and 7% in their worst 5 s windows, and 17 and 1 major faults. The steal is what is under test, so they classify frames; their frame times are not clean performance evidence.

| | Cold (`261024-123746-b92e`, 13:12:55–13:25:00 UTC) | Warm (`261024-123747-70a7`, 13:25:01–13:37:38 UTC) |
|---|---|---|
| Shader cache before → after | empty → 2 files, 847 KB | 847 KB → 1.02 MB |
| Simulation steps, over 8 ms | 42,637, **0** (max 5.1 ms, p99 0.72 ms) | 44,593, **2**: 63 and 9.5 ms measured, both in the `input` phase; the harness's adjusted estimate (remainder 0) came from the over-generous classifier (R1-F1), so their attribution is **unproven**; canary overlap 7.6–8.7 ms |
| Frames over 34 ms, CW-1's rule | 11: 10 host, 1 mixed | 24: 20 host, 2 mixed, 2 clean |
| Trace | 7 rotations, 1,716 MB streamed, no data loss | 7 rotations, 1,800 MB, no data loss |

- **The 5 frames that aren't plain host by the rule:** the 3 "mixed" and one "clean" had VM-wide steal of 80–470 ms inside them and the canary, on its own thread, stalled 30–113 ms: the VM paused, and the 10 ms jiffies charged other vCPUs. **One frame (warm, 50 ms) is not the host:** no steal anywhere, no canary stall, and the GPU process's main thread was on CPU for 53 ms in `GpuChannel::ExecuteDeferredRequest` (the renderer blocked in `futex` waiting for it). That is render-side work in the GPU process, not the simulation (0.3 ms in that frame).
- **The simulation's measured wall time in the long frames:** at most 0.4 ms in all but two (warm run): 63 ms in a 116.6 ms frame and 9.6 ms in another, the two steps above whose attribution is unproven.
- **Shader caches:** no compile or link slice appears in any long frame, cold or warm; the warm run had more long frames (24 against 11), all from host bursts. First-use shader compiles are not a cause on this route once the expedition has loaded (the loading screen compiles the scene first).
- **Power state:** the GPU stayed in P5 (450–555 MHz, 20–40% busy) through every long frame; P0 appeared in 110 of 5,829 samples. The one non-host frame had the GPU process busy on the CPU, not waiting for the GPU, so the data does not point at clock or power-state ramping. It can't exclude it either; a locked-clock A/B needs root and the owner.
- **Host bursts:** all 11 of the cold run's long frames came in one 18 s burst (13:16:37–13:16:55 UTC), with VM-wide steal of 230–870 ms per frame across the 8 vCPUs.
- **Overlap:** COL-1's local test compile (about 8.5 s of CPU, then a 1 s probe) at about 13:20 UTC fell inside the cold run. No frame over 34 ms is within minutes of it, so nothing is discounted.
- **The shader-cache settings:** the driver wrote its cache under the task-owned path in both runs, so they took effect; the harness's own reading of the GPU process's environment came back empty (it may read a different Chrome GPU child), which is unresolved.

**Browser, 3090, profiled** (`gpu` class, before-tree probe `81ee4a12`, segment 2): 52,969 steps, two over 8 ms: the 61.7 ms movement step (Chrome's sampler caught no movement code; the guest counted 86 ms of 100 on CPU) and a 12.2 ms step (presentation 5.7, upgrades 5.3).

**Harness equivalence (the 3090 decisive test).** The traversals ran on probe `9c36c647`: CW-1's `4ea4d4a7` (the streamed tracer, `stream-trace.mjs`, folded in from this stream) plus this stream's `SIMPERF_HOST` opt-ins as a private patch. CW-1 then folded those opt-ins into its tree at `6ca73311`, unchanged. `traverse.mjs`, `stream-trace.mjs` and `simperf-host-worker.mjs` are byte-identical between `9c36c647` and `6ca73311` (SHA-256 `39302a7d…`, `120d0925…`, `bde05d41…`), so these runs are the tree harness's. Later 3090 runs bind to `6ca73311` plus this branch's game merge, with no private patch.

## Contracts and merge notes
- **New per-step work** marks its phase: add a `STEP_PHASES` entry and `meter?.mark(PHASE.x)` after it, or it is counted in the next phase.
- **`__siltwakeStepCosts()`** is `FORK(step-costs-global)` (CORE-HELPERS): whichever of REC-1 and SIM-PERF-1 merges second makes it `__siltwake.steps()`.
- **CW-1 merge (whichever merges second): resolved and tested at `74f51bc6`** (the local branch `probe/sim-perf-1-cw1` points there; Sol R1 verified 35,175 exact `sampleHazards`/`hazardsAt` comparisons against CW-1's own functions):
  - `app.ts`: CW-1 splits the frame into `step(now)` and `present(now)`; the meter wraps `this.step(now)` beside CW-1's `__siltwakePerf` timing, and `this.warm()` sits beside CW-1's `warmRegions()` in `entered()`.
  - `world.ts`: CW-1's `nearInto`/`dataInBox` replaces `near`; keep `rosterInvalid` (no index shortcut: CW-1 hands cave composites a prebuilt index).
  - **A silent semantic conflict:** CW-1's deep-cave loop in `sampleHazards` writes the `out` record this stream removed. Merged, it must update the scalars (`heat`, `brine`, `sediment`, `darkness`), and `hazardsAt` must take cave brine pools into `brine` (it used `sampleHazards(p).brine`) beside CW-1's cave heat. Extend `tests/hazard-sampling.test.ts`' reference with `DEEP_CAVE_HAZARDS` in the same merge (`74f51bc6` has it), and add the deep-cave field shapes to the hazard centre table (`CENTERS` in `sim/ecology/hazards.ts`), so their centres are resolved once too; until then they are resolved per call, uncached, with the same answers.
- **Determinism:** no saved field, outcome or ledger changes (below).

## Compromises and follow-ups
- **Terrain sampling** is now the largest per-step CPU and allocation: about 1 ms of a 1.1 ms step in the Brine Divide, and about 15 KiB of the 76 KiB a step (`sampleAuthored`, `fbm`, `seaStack`, `hypot`). Root fix: SIM-1's filed baked or cached height lookup for the sim's world queries (M; the world stream).
- **The systems host views** are still rebuilt for each reader (`hostById`, `listHosts`); only the power drain's every-step rebuild of every host is gone. Root fix: an explicit revision on systems, facility, fleet and docking state, bumped by every writer and persisted or rebuilt on load (M; a systems stream, with a schema note).
- **Cycle sight lines:** each cycle field near the player casts a sight line of up to 40 m every step (p99 0.4–0.6 ms there), most of it terrain sampling (above).
- **COL-1's debt:** CW-1's kit cave clusters allocate about 18 MiB each (18k boxes as objects); headless, unstreamed builds drive collections of up to 75 ms. COL-1 stage B owns the collider.
- **The play timeline's save (SIM-1b's motivating number).** Every 600 ticks the app serialises the whole timeline export and writes it to localStorage. At the full rotation window (20 sealed chunks, about 20k events, 2.7 M characters) the serialisation alone is **13–21 ms in Node** on factory-worker, before the browser's write of about 5 MB; a chunk seal or rotation costs up to 3.8 ms. It grows linearly with the session (1.7 ms at 2k events, 5.8 ms at 10k). The bot's timelines never reach it (212 events in 3.2 h of play), so only a human session shows it. Root fix: SIM-1b's incremental journal (assigned to its builder; no interim here, by the coordinator's decision).

## Review responses
**R1 (Sol 6.1 xhigh, `review/sim-perf-1-r1` at `41a58c94`, on `9b668708`): request changes, one P2 and one P3.** The game-code fixes were verified independently: 36 focused tests, 10,800 differential steps, 18 milestone hashes, and 16,450 plus 35,175 exact hazard comparisons.
- **R1-F1 (P2), step attribution too generous:** fixed in the harness, as a patch for CW-1 to fold with its R3 fixes (coordinator's ruling; not pushed to CW-1's branch).
  - **Where:** `/work/tmp/simperf1/r1/sim-perf-1-r1-step-class.patch`, against CW-1's `c0b7d92e`, which it applies to cleanly. It adds `step-class.mjs` with `classifyStep`, a pure function, and `step-class.test.mjs` (9 tests, Sol's two counterexamples among them).
  - **The rule:**
    - only steal on the renderer main thread's vCPU, where the step runs;
    - only steal provably inside the step: whole intervals inside count; boundary intervals count only what can't fit outside; an interval where the thread changed vCPU counts nothing;
    - one jiffy is taken off for accounting lag and quantisation;
    - the excused time is at most the canary's stall overlapping the step;
    - doubt is `unresolved`, never `host`.
  - **Raw samples:** each verdict keeps them (the rows around the step with every vCPU's steal, the canary's wakes, the thread states).
  - **The instrument's limit:** with 10 ms jiffies, steal genuinely inside a step can't exceed its length, so after the margin a step reads `host` only when jiffy quantisation and accounting lag favour it (a pause that began before the step). Most stolen steps will read `unresolved`. This is stated, not hidden.
  - **This page:** measured wall time is separated from adjusted estimates; the 63 and 9.5 ms steps are marked unproven; the "fast again" rule is qualified.
  - **CW-1's frame gate** (`frame-class.mjs`) has the same boundary and jiffy over-count (up to about 20 ms). 5 of the 30 host frames in these runs are within that margin, all with large canary stalls. Reported to CW-1 with suggestions; its R3 decides.
- **R1-F2 (P3), memos without a byte budget or ledger:** the sim's cache ledger (`sim/caches.ts`). The profile memo is a `BoundedMemo` (value key and FIFO kept; 128 entries and 96 KiB). The hazard centres are a fixed table of the world's fields, registered with their bytes. Tests: `tests/sim-caches.test.ts`.
- **The merge receipt:** the hazard resolution is at `74f51bc6`, and the local probe branch now points there.

## Checks
- **Fast tier:** passed at `36dabcf3`, 148 files including the typecheck and the architecture guard (alickers, `261024-093422-d448`). New tests: `hazard-sampling` (the exact reference), `warmup` (no trace), the repository's record reuse and `warmCommit`, and the occupied hosts.
- **Determinism:** the differential and the cross-commit playthroughs above, at `36dabcf3`.
- **The rest of the merge gate's manifest** at `db1ef8a2` (game code as `36dabcf3`; alickers, `261024-141742-21a0`): the fast tier again (148 files), `npm run build` (typecheck, headless typecheck, terrain bake, production build), and all six economy checks (`check-campaign-economy`, `check-m1-economy`, `check-m2-a-economy`, `check-m2-b1-economy`, `check-progression-curve`, `upgrade-economy`): every one passed. The playthroughs are the eight above.

## Missing evidence
- **A clean attribution rerun of the browser steps over 8 ms** with the stricter classifier and saved raw samples: a follow-up once CW-1 has folded the patch and the fleet's host change is scheduled (the coordinator's ruling; it doesn't block this merge).
- **A clean 3090 browser frame-time run:** both exclusive traversals are `DISTURBED` (steal 5.4% and 7% in their worst windows); their frame times aren't performance evidence, only the classification is.
- **The 3090 repeat pair:** one cold and one warm run only (the coordinator moved the rest to the 4070). A second pair would test whether the warm run's extra long frames (24 against 11) are only host bursts, as their steal says.
- **A real shader-cache cold/warm on the 4070:** impossible from the sandbox (Mesa's cache unused, the Windows driver's cache out of reach). The 3090 pair is the only cold/warm evidence, and it shows no shader compile in a long frame.
- **The GPU process's own environment:** the harness read no `__GL_` settings from the process it takes for the GPU process, though the driver wrote its cache under the task-owned path in both runs.
- **The one render-side frame** (GPU process 53 ms on CPU in `ExecuteDeferredRequest`, no steal): not attributed further here; it's render work for CW-1 or the renderer, and power-state ramping isn't excluded without a locked-clock A/B (root and the owner).
- **Human-session timeline cost in the browser:** the 13–21 ms export at a full window is measured in Node only; the browser's localStorage write of about 5 MB is not measured (SIM-1b's).
