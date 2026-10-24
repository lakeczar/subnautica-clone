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
- **The browser** (probe only, not for merge): CW-1's traversal (`traverse.mjs`) on a probe of this branch merged with CW-1, pulling the meter's snapshot and matching worst steps to long frames, with optional CPU profiling.

## Attribution (causes, ranked)
PENDING the decisive host test (coordinator, R1): see *Missing evidence*.

## What changed (each with identical answers)
PENDING

## Evidence
PENDING

## Contracts and merge notes
PENDING

## Compromises and follow-ups
- **The play timeline's save (SIM-1b's motivating number).** Every 600 ticks the app serialises the whole timeline export and writes it to localStorage. At the full rotation window (20 sealed chunks, about 20k events, 2.7 M characters) the serialisation alone is **13–21 ms in Node** on factory-worker, before the browser's write of about 5 MB; a chunk seal or rotation costs up to 3.8 ms. It grows linearly with the session (1.7 ms at 2k events, 5.8 ms at 10k). The bot's timelines never reach it (212 events in 3.2 h of play), so only a human session shows it. Root fix: SIM-1b's incremental journal (assigned to its builder; no interim here, by the coordinator's decision).

## Missing evidence
PENDING
