# SIM-1: the simulation steps in place

Branch `t3/sim-1-inplace-step`, from root `feat/siltwake-first-expedition` at `f025bf6`.

## Paused (2026-10-23, coordinator request: slot to REC-1)

**Done:** reading and design only. No source changes yet.

**In flight when paused:** nothing left running.
- The "before" playthrough on alickers (`--sha f025bf6`, `pt-sim1-before-f025bf6.json`) was stopped. Rerun it at resume. Check `/work/results/` on alickers first in case it finished.
- The read-only aliasing audit completed; its results are folded into the findings below, so it doesn't need rerunning.

**Exact next step:** implement step 1 of the plan (`stepGameInPlace` plus the pure `stepGame` wrapper in `src/sim/step.ts`), then work through the list in order.

## Design (decided; argue changes in the handoff)

1. **`stepGameInPlace(state, commands, world): GameEvent[]`** mutates in place.
   - Today the step reads the pre-step `state` at `step.ts` 593–594, 999, 1004, 1023 and 1044–1056. These become captured values:
     - `player.controlledVehicleId`, `mode` and `interiorId`;
     - the tick before the step;
     - `opening.phase` and `metrics.failures`;
     - a `{x,y,z}` copy of each vehicle position, by ID, for `stepUpgrades`' moved set.
   - **`stepGame` stays pure**: `structuredClone` plus in-place. About 240 test call sites fork one state twice. For example, `os2-refinements.test.ts:56` and `expedition-decisions.test.ts:38` compare `stepGame(s,[c]).state` with `stepGame(s,[]).state`. With an in-place `stepGame` those would compare an object with itself and **pass vacuously**. The hot paths switch explicitly: the app, the playthrough driver, test-loop helpers (`journey-support`, `ecology-composed-support`, `c4-systems-support` …), bots and soaks.
   - `executeCommand` keeps its clone.
2. **`StepGuard`** (new `src/sim/stepGuard.ts`):
   - It takes a checkpoint (`structuredClone`) every 60 ticks and keeps a journal of `{commands, world}` steps and `executeCommand` entries since then.
   - **On a throw:** it replays the journal onto a copy of the checkpoint and copies the result into `state`. This keeps object identity and restores exactly the pre-step contents. Then it throws `StepFault {tick, cause, restored: "exact" | "checkpoint"}`.
   - If the replay throws or its tick is wrong, it falls back to the checkpoint.
   - If the guard sees a different object from the last one it handled (a load, an import or a new game), it takes a fresh checkpoint.
   - Optionally, in dev builds, it checks every 10th checkpoint that the replay equals the live state. That catches nondeterminism or state written from outside.
   - Sound because the runtime and UI never write the live state outside `stepGame`/`executeCommand`. The only exception is `session.enter` plus `resumeEcology` on load, which happens before the first guarded step.
3. **App** (`app.ts` ~361 and 662): guarded in-place step.
   - **On `StepFault`:** `console.error`, pause, and a persistent notice that the expedition was restored to before the fault and saving is safe. Dev builds also rethrow in a microtask so the error is loud.
   - **Today**, a throw kills the `requestAnimationFrame` loop: the game freezes, but the save stays clean.
   - **Commands:** `command()` goes through `guard.command`.
4. **Driver** (`scripts/playthrough/driver.ts`):
   - Use the guarded in-place step, the same as the app.
   - **Bug to fix:** `accept(before, after)` diffs `before.world.resources[i].stock` against `after`. In place, these are the same object, so gathering would silently count 0. Capture the pre-step stocks first (or use a gather event; see 6). `where(before)` needs a position copy.
5. **Differential harness:**
   - `git archive f025bf6` into `/work/tmp/sim1-base`, symlink `node_modules`, and compile with its playthrough tsconfig.
   - The Driver gets a pluggable step and exec hook. A shadow pipeline runs the old `stepGame`/`executeCommand`, from the base tree's own module instances (its own `loadCampaign` and `gameWorld`), on a shadow state with the same commands.
   - **Comparison:** canonical hashes every 60 ticks, after every command and at every milestone, plus each tick's events. Report the first differing path on a mismatch.
   - **Coverage:** all 5 scenarios. Optionally, run the base and new timeline recorders in lockstep and compare their exports.
   - **Cross-commit check:** `run.saves[].hash` in the playthrough JSON already gives milestone hashes per scenario. Compare the before and after JSON.
   - **Poison-audit mode** for converted call sites: the in-place entry runs clone-then-poison-input (throwing getters). Every reuse of a pre-step reference in the suite then throws and gets listed.
6. **SIM-02:**
   - **ID index:** a self-validating `byId(rows, id)` (a `WeakMap<array, Map<id, index>>`, checking `rows[i].id === id` and rebuilding when stale; IDs not in the array fall back to `find`).
   - **Renewal:** `renewal.ts:25` is O(R×N) per tick; the index removes the inner `find`.
   - **Profile first:** run `--cpu-prof` on the bench once the clone is gone, and fix what dominates.
   - **Recorder:** `snapshot()` builds a stocks Map over every source and nested cache Maps over all inventory items every active step. Replace it with a reused stocks array, and compute cache contents only when caches exist with pending deaths or new caches.
   - **Gather events:** stock decreases happen only at `progression.ts:238`, `step.ts:497`, `step.ts:524` and `fittings.ts:261`. Event-driven gathering would also have to be forwarded from `executeCommand` results to the recorder.
   - **Keep exact parity:** a gather is counted only when `collections` rises, and its amount is the net drop from the pre-step stock to the end-of-step stock.
7. **SIM-05:**
   - **Chunks:** sealed, append-only chunks of about 1,000 events, written once each (`siltwake.timeline.v2.<n>`). A head key holds the session, the pending ledger, the open chunk, summaries of rotated chunks and protected notes.
   - **Rotation:** past the retention budget (about 20 chunks), the oldest chunk is replaced by a summary: counts by kind, new things by kind, gathering by item, travel and idle seconds, deaths and the tick/play range. **Notes are kept verbatim, always.**
   - **Formats:** `parseTimeline` accepts v1 and v2. Analysis merges the summaries. A legacy `siltwake.timeline.v1` is migrated on resume.
   - **Bonus:** today the whole timeline (up to about 2.4 MB) is re-serialized every 10 s (`app.ts:463`), a growing main-thread hitch that this removes.
8. **Bench:**
   - `scripts/sim-bench.mjs --tree <compiled root> --states <dir>`.
   - **States:** milestone save texts generated once by running `runPhases` with a `SaveSlot`.
   - **Measures:** µs per tick for pure, in-place and guarded steps, plus clone-only time and bytes, with the median of several rounds.
   - **Evidence run:** one `--class exclusive` job benches the base and new trees back to back.

## Findings so far

- **Corridor search** (`carrierStations.ts` ~184–210): `launchCorridorSearch(s, world)` is a generator that holds the state across frames, and the HUD and `corridorView` advance it within a wall-time budget. In place, it would read a changing state mid-search. Fix: snapshot what it needs when it starts.
- **Saves are safe:** `session.envelope()` clones synchronously (`session.ts:189`), and `enter` clones the save in.
- **The aliasing audit confirmed these items to fix:**
  - the pre-step reads in item 1 of the design. Without the fix, an in-place step would lose `movement-mode-changed` (the audio transition cues), make the `stepUpgrades` moved set always empty (an economy change: solar's moving factor, Spindle deck charging, the turbine gate), and leak ascent and thrust samples;
  - the corridor generator (above);
  - the driver's `accept`/`where` (design item 4);
  - tests that would pass vacuously under in-place stepping: `rib-surface-trap.test.ts:21–22` and `os2-refinements.test.ts:55–56, 74, 81`. These stay correct while `stepGame` stays pure.
- **The audit found these safe:** presentation, audio, CR-1 creatures, `helm.ts`, notices, `threatCue` and the recorder. None of them keeps state references or compares state identity. `hud.current` and `view.latest` hold the live state, which is intended. `driver.legOf` holds `pose.position`, which the step replaces rather than mutates.
- **Shared mutable objects:** a grep of the sim for state fields assigned module constants, command objects or other shared objects found only primitives (`HULL_BUILD[hull].yaw`, a notice string, `NO_ACTOR`). Still to check:
  - `ballastStep`'s returned `runtime` (`step.ts:700`) must never be a shared constant;
  - nested command data stored into state.

  The differential covers the exercised paths, because the base modules are separate instances.
- **Caches:**
  - `world.ts:453` `broadPhases` is keyed by `Solid[]` identity. The audit confirmed every roster is a module constant or rebuilt per call; none is stored in `GameState`.
  - `ecology/hazards.ts:24` `adHoc` is keyed by authored cycles, so it's safe.

## Evidence (none yet)

All of it is still missing:
- per-tick cost before and after (`--class exclusive`);
- five-scenario wall time before and after (alickers);
- the differential;
- fast tier, heavy tier, build and the five economy scripts.
