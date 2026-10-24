# SIM-PERF-1: the simulation's frame spikes, attributed and fixed

Branch `t3/sim-perf-1`, from root `168a5084` (merged with root's docs at `ee2e4450`). **Source SHA: PENDING.** No save schema change. No intended change to any outcome: every fix gives the same answers (tests and the differential below).

## Outcome
Every simulation step over 8 ms in ordinary play now has a named cause. The game's own causes are fixed at the root; what remains over 8 ms is collections and, per the attribution below, the host.

## How it was measured
- **The step meter** (`src/sim/stepCosts.ts`): each fixed step's time by phase (24 phases: the guard's checkpoint and journal, every part of `stepGameInPlace`, and the app's own work: input, events, timeline, timeline save, HUD presentation, autosave). Pulled, never pushed (convention 6): `SiltwakeApp.stepCosts()`, and `__siltwakeStepCosts()` for drivers (`FORK(step-costs-global)`, below). Recording allocates nothing per step (typed arrays); it is always on in the app, at about 25 clock reads a step.
- **The headless harness** (`scripts/playthrough/stepcost.ts`) runs each step as the app does: the guard's step, then timeline observation, its 600-tick export and the 1,800-tick autosave through the real repository (lock body included). Every scenario (4.19 M steps), or held travel from every SAVE-1 library kind. Options:
  - `--verify` re-executes every slow step three times from its own pre-step state (a checkpoint every 60 ticks plus a journal, as `StepGuard` keeps). Fast again means it wasn't the game's work.
  - `--host` tags each slow step with per-vCPU steal and a canary thread's late wake-ups.
  - `--capture RUN:TICK` CPU-profiles one step in context and saves its pre-step save and controls.
  - `--heap` (allocation by phase) and `--alloc` (allocation by function, with callers).
- **The browser** (probe only, not for merge: `probe/sim-perf-1-cw1`, this branch merged with CW-1 `3779f59c`): CW-1's traversal over its `saves-t6` plan, pulling the meter's snapshot and matching worst steps to long frames. Two opt-ins, for the coordinator's decisive host test: `SIMPERF_HOST=1` runs a worker (`simperf-host-worker.mjs`) with a 1 ms `CLOCK_MONOTONIC` canary, every vCPU's steal and the vCPU the renderer's main thread is on (every 10 ms), and that thread's state and syscall (every 2 ms; `wchan` is hidden on this kernel); `SIMPERF_TRACE=1` adds the `toplevel`, `gpu` and `ipc` trace categories, for short runs only (a whole segment's trace would pass V8's string limit).

## Attribution (causes, ranked)
Every slow step was re-executed from its own pre-step state (`--verify`), or its whole scenario replayed in a fresh process to the same tick (`--capture`), which also reproduces any first-use cost. A step that is slow again is the game's; one that isn't was a collection, the host, or (in the browser) the thread waiting.

1. **The 30–136 ms steps (CW-1's six, REC-1's 68.8 ms, and this stream's own) are not the game's work.** Headless on factory-worker, the 33.9, 38.8, 45.8 and 8.8 ms steps took about 1 ms when replayed to the same tick in a fresh process. In the browser (3090, profiled, `gpu` class), the one long simulation frame was a 61.7 ms step, all in movement, during which Chrome's 0.5 ms CPU sampler caught no movement code. On the 4070 (control), 87,845 browser steps over two segments had none over 8 ms. **What paused the 3090's thread is PENDING** the exclusive host test (*Missing evidence*): the 4070 run proved the instrument reads a blocked thread (`S futex`, canary clear, no steal) apart from a paused VM.
2. **Collections.** Node's major collections land 7–15 ms in whatever step allocates (up to 75 ms on CW-1's tree headless, where unstreamed cluster builds allocate about 18 MiB each). The step allocated 118 KiB a tick on root (124 on CW-1's tree); now FINAL-ALLOC.
3. **Autosave (every 1,800 ticks): 4–7 ms in a step, 10–17 ms on the first after a load.** Each commit decoded the record it had just written up to four times.
4. **Hunter encounters: over 1 ms on every encounter step, up to about 8 ms.** Each sweep slice (0.2 m, up to about 15 escape directions a step) re-validated all 11,415 world solids.
5. **First use after a load:** the first steps' compilation (5–8 ms), each hull's contact mesh at its first hunter contact (about 3 ms), the first autosave (above).
6. **Steady costs, not spikes:** terrain sampling (the largest per-step CPU and allocation: about 1 ms of a heavy 1.1 ms Divide step, 24 KiB a step), the systems host views (rebuilt every step), cycle sight lines near cycle fields (p99 0.4–0.6 ms), the HUD's per-step presentation (browser mean 90 µs, max 5.7 ms).
7. **The play-timeline save** grows with the session (13–21 ms at a full window): SIM-1b's, below.

## What changed (each with identical answers)
- **The roster check** (`sim/world.ts`): a separated sweep validates the immutable solids roster once per world, not on every call. Threat p99 1,117 → 21 µs and step p99 1.22 → 0.28 ms in held runs from `hull-damaged` and `carrier-fitout`.
- **The save commit** (`save/repository.ts`): the repository remembers the record it read or wrote, decoded, so a commit never parses or validates its own record again (decoding is a pure function of the text; slot envelopes are never mutated, the session clones). `repository.commit` 3.4 → 1.2 ms on a late save. Byte limits encode only when the length can't tell (`utf8Over`, `save/codec.ts`). It still validates what it writes.
- **Craft profiles** (`sim/upgrades/effects.ts`): memoized by their inputs (`hull|rating|fitted`), at most 128 entries, oldest first, frozen. They were the step's largest allocation (about 17 KiB).
- **Hazard sampling** (`sim/ecology/hazards.ts`, `sim/fittings.ts`): each field's centre is resolved once; `sampleHazards` keeps scalars, not a record and a vector per field; `hazardsAt` reads heat and brine in one pass (it read each heat field's level twice and ran a second whole `sampleHazards` for brine). `tests/hazard-sampling.test.ts` keeps the earlier algorithm as the exact reference.
- **The host power drain** (`sim/systemsLink.ts`, `listHosts(…, { occupied: true })`): views only hosts with something in a socket (every carrier, whose seeded fittings occupy sockets without an entry). The coordinator's suggested revision counter was not small: it would be a persisted field that every systems, facility, fleet and docking writer must bump.
- **Terrain polylines** (`content/regions/noise.ts` `nearestOnPolyline`): indexed instead of destructured; destructuring ran the iterator protocol for every segment of every sample (about 9 KiB a step). Same arithmetic. (World stream's module; a two-line allocation fix.)
- **Entry warm-up** (`sim/warmup.ts`, `save/repository.ts` `warmCommit`, `SiltwakeApp.warm`): when an expedition is entered, behind the pause, a copy of the state is stepped one second, every hull contact mesh is built (`hullContactPose`'s whole range) and a whole commit runs twice on a throwaway in-memory slot. The first autosave after a load: 9.1 → 1.6 ms and 10.1 → 1.3 ms (alickers). `tests/warmup.test.ts`: the state is untouched and play after warming equals play without it.
- **The step meter and harness** (above), and the driver's optional `DriverObserver.before`.

## Evidence
Each result names the SHA it ran at. "Before" is `a35da972` (root plus the step meter only; `probe/sim-perf-1-before` carries the same harness). Timings from alickers (RTX 4070 Laptop, a shared desktop host) and factory-worker shared runs are indicative; 3090 exclusive numbers are below.

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

**Browser, 4070 control** (`probe/sim-perf-1-cw1` at `99425bc4`: this branch at `9e6d3e99` with CW-1; segments 2 and 3 of CW-1's `saves-t6` plan, `SIMPERF_HOST=1`): 87,845 steps, **none over 8 ms**, p99 0.61 ms, p99.9 1.6–1.7 ms, max 4.6 ms (an autosave). The frame's own work p99 4.2–7 ms, max 9.9 ms; the gate passed and no long frame was the simulation's. Every long gap (GPU-bound, up to 200 ms) had the renderer's main thread **blocked** (`S futex` for 95–98% of the gap, 2–7 ms on CPU), the canary running through it and no steal.

**Browser, 3090** (profiled, `gpu` class, before-tree probe `81ee4a12`, segment 2): 52,969 steps, two over 8 ms: the 61.7 ms movement step (Chrome's sampler caught no movement code; the guest counted 86 ms of 100 on CPU) and a 12.2 ms step (presentation 5.7, upgrades 5.3). PENDING: the exclusive runs.

## Contracts and merge notes
- **New per-step work** marks its phase: add a `STEP_PHASES` entry and `meter?.mark(PHASE.x)` after it, or it is counted in the next phase.
- **`__siltwakeStepCosts()`** is `FORK(step-costs-global)` (CORE-HELPERS): whichever of REC-1 and SIM-PERF-1 merges second makes it `__siltwake.steps()`.
- **CW-1 merge (resolved once in `probe/sim-perf-1-cw1`; whichever merges second):**
  - `app.ts`: CW-1 splits the frame into `step(now)` and `present(now)`; the meter wraps `this.step(now)` beside CW-1's `__siltwakePerf` timing, and `this.warm()` sits beside CW-1's `warmRegions()` in `entered()`.
  - `world.ts`: CW-1's `nearInto`/`dataInBox` replaces `near`; keep `rosterInvalid` (no index shortcut: CW-1 hands cave composites a prebuilt index).
  - **A silent semantic conflict:** CW-1's deep-cave loop in `sampleHazards` writes the `out` record this stream removed. Merged, it must update the scalars (`heat`, `brine`, `sediment`, `darkness`), and `hazardsAt` must take cave brine pools into `brine` (it used `sampleHazards(p).brine`) beside CW-1's cave heat. Extend `tests/hazard-sampling.test.ts`' reference with `DEEP_CAVE_HAZARDS` in the same merge.
- **Determinism:** no saved field, outcome or ledger changes (below).

## Compromises and follow-ups
- **The play timeline's save (SIM-1b's motivating number).** Every 600 ticks the app serialises the whole timeline export and writes it to localStorage. At the full rotation window (20 sealed chunks, about 20k events, 2.7 M characters) the serialisation alone is **13–21 ms in Node** on factory-worker, before the browser's write of about 5 MB; a chunk seal or rotation costs up to 3.8 ms. It grows linearly with the session (1.7 ms at 2k events, 5.8 ms at 10k). The bot's timelines never reach it (212 events in 3.2 h of play), so only a human session shows it. Root fix: SIM-1b's incremental journal (assigned to its builder; no interim here, by the coordinator's decision).

## Missing evidence
PENDING
