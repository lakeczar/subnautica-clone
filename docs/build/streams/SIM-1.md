# SIM-1: the simulation steps in place

Branch `t3/sim-1-inplace-step`, from root `feat/siltwake-first-expedition`. It was resumed on 2026-10-23 and merged with root at `887df90c` (SCHED-2a). It covers SIM-01, SIM-02 and SIM-05 from the compromise audit.

**Source SHA:** `bebc19a4` (evidence below). **No save schema change.** The timeline storage format changed from v1 to v2 and includes a bridge (below).

## What changed

**`stepGameInPlace(s, commands, world): GameEvent[]`** (`src/sim/step.ts`) is the step, and it mutates `s`.
- The old step read the pre-step `state` after mutating its draft:
  - the actor and mode checks;
  - the tick for the current cue;
  - the `stepUpgrades` moved set;
  - the ascent and thrust guards.

  These now read a `PreStep` taken at entry (primitives plus a copy of each vehicle's position).
- `stepGame` keeps its old pure contract, now implemented as `structuredClone` followed by the in-place step.

**Design change from the verdict.** `stepGame` stays pure; it does not mutate in place.
- **Why:** about 240 test call sites fork one state twice and compare the results. For example, `os2-refinements.test.ts:56` and `expedition-decisions.test.ts:38` compare `stepGame(s,[c]).state` with `stepGame(s,[]).state`, and `rib-surface-trap.test.ts:21` does the same with `deepEqual(original, still)`. With an in-place `stepGame`, each of these would compare an object with itself and pass while checking nothing.
- **Where the clone is gone:**
  - the app;
  - the playthrough driver;
  - the heavy test loops, through `tests/step-support.ts` `play()`, which copies once and then steps in place;
  - the differential.

**Atomicity: `StepGuard`** (`src/sim/stepGuard.ts`).
- **Cost:** one checkpoint (`structuredClone`) every 60 steps, plus a journal of the steps and commands since then (flat command copies).
- **On a throw:** the journal replays onto the checkpoint and the result is written into the same state object, so the state is exactly what it was before the failed step. The guard then throws `StepFault {tick, restored, cause}`.
- **If the replay itself fails** (it shouldn't; the step is deterministic), the guard restores the checkpoint, at most 1 s earlier.
- **A different state object** (a load, an import, a command's result, or CW-1's `relocateForCave`) starts a fresh checkpoint.
- **Development builds** also verify every 10th checkpoint: the journal's replay must equal the live state, or the guard throws `StepGuardDrift` before stepping. This catches nondeterminism and anything that writes the live state outside the guard. The audit found no such writer: `session.enter` + `resumeEcology` runs before the first guarded step.

**The app** (`src/runtime/app.ts`) steps and runs commands through the guard.
- **Fault handling:** a fault pauses the game with a notice ("the expedition was restored to the moment before the fault; saving and export are safe") and logs to `console.error`. In development it is also rethrown in a microtask.
- **Before:** a throw killed the `requestAnimationFrame` loop and the game froze.

**Aliasing fixes:**
- **Corridor search:** the multi-frame corridor search (`launchCorridorView`) now searches a copy of the state it describes, taken at most once a second. Before, it would have read a live state that changes mid-search.
- **Playthrough driver:** its gathering diff compared the state with itself. It now reads a pre-step stock buffer and steps through the same guard as the app.

The audit checked these and found them safe:
- the renderer and creature renderer;
- `helm.ts`, notices, HUD, panels and audio;
- the session and saves (they clone synchronously).

Every other identity-keyed cache is keyed by content.

**SIM-02:**
- **Roster lookups:** `rowById` (`src/sim/rows.ts`) is a self-validating ID index. Every hit is checked against the row itself, and any change to the roster rebuilds the index. Renewal no longer scans all resources for every renewal row on every step.
- **Chart cells:** `hasMember` is an append-only index for chart cells. `visitChart` was a scan of every explored cell on every step, and it grows with exploration.
- **Timeline recorder:** observation is diff-based. Exposed stock goes into a reused buffer, and cache contents are read only when a death or an open recovery ledger needs them.

**SIM-05: the timeline is now chunked and append-only.**
- **Chunks:** 1,000 events each. The newest 20 sealed chunks plus the open chunk stay whole, the same 20k window as before.
- **Rotation:** an older chunk rotates into a `ChunkSummary` that keeps **notes, new things, deaths and recoveries verbatim**. Everything else becomes totals, and empty-travel and idle stretches are listed at the report's default thresholds.
- **Analysis:** the analysis merges the summaries. The test shows a 26-chunk session analyses the same as its unrotated event list.
- **`TimelineStore`** (`src/sim/timeline/store.ts`):
  - It writes each sealed chunk to localStorage once.
  - Each 10-second save rewrites only a small head; before, it re-serialised the whole history, up to about 2.4 MB.
  - On a full quota it rotates more and retries.
  - If even the head can't be written, the app says so once and the notes stay in memory until exported.
- **Bridge:** the v1 single-key timeline migrates at the first save, and v1 export files still parse.

## Contracts for other streams

- **New sim code** steps through `stepGameInPlace`, or through `StepGuard` wherever a state is live. Use `stepGame` only for forks and comparisons.
- **Nothing outside the guard may write a live state.** To replace it, hand the guard the new object.
- **`DriverObserver`/`driverHooks`** in the playthrough driver is the differential's seam.
- **CW-1 merge:** CW-1 changes `flowAt(old, state.tick)` to `flowHere(…)` on the line SIM-1 changed to `pre.tick`. Whichever merges second writes `flowHere(world, old, pre.tick)`. `relocateForCave` keeps its clone, and the guard treats its result as a new state.
- **SIG-1:** add per-step work inside `stepGameInPlace` and read the pre-step values from `pre`, never from a reference taken before mutation.

## Evidence

Unless noted otherwise, everything below was tested at `bebc19a4`. The base is root `887df90c`.

**Determinism.** The differential is `scripts/sim-differential.sh 887df90c` on alickers at `bebc19a4`; the job exited 0 after 1,813 s, with results in `/work/results/sim1-diff-bebc19a4.json`.
- **What it does:** each scenario's real command stream is fed to two sims side by side, the new in-place sim and the base commit's own compiled cloning sim (separate module instances and world).
- **Coverage:**

  | Scenario | Ticks | Commands | State checks | Timeline checks | Result |
  | --- | --- | --- | --- | --- | --- |
  | creel | 725,952 | 520 | 12,634 | 217 | identical |
  | carrier | 1,158,144 | 616 | 19,921 | 325 | identical |
  | creel-loss | 628,280 | 311 | 10,788 | 181 | identical |
  | reverse | 744,078 | 522 | 12,938 | 222 | identical |
  | no-optional | 723,107 | 509 | 12,575 | 216 | identical |

  The branch scenarios count only their own ticks.
- **What was compared:**
  - **State:** compared structurally every 60 ticks, after every command and on the first step after every save reload. All 68,856 checks were equal.
  - **Events:** every tick's events were equal.
  - **Timeline:** the base and new timeline recorders were observed as the app does, and their timelines (events and death and recovery ledgers) matched at all 1,161 checks.
- **Cross-commit milestones:** the plain playthroughs before (`887df90c`) and after (`bebc19a4`) were run on alickers, both with `--jobs 3`.
  - In all 5 scenarios, every milestone's label, tick and state hash is identical (82 saves), and every reload matched.
  - The whole run records (phases, legs, gathered and spent counts, hazards, discoveries) are identical apart from wall time, so the bots made the same decisions.

**Full five-scenario playthrough wall time** (alickers, RTX 4070 Laptop on a shared desktop host; indicative):

| | Total | creel | carrier | creel-loss | reverse | no-optional |
| --- | --- | --- | --- | --- | --- | --- |
| Before (`887df90c`) | **13 min 04 s** (user 21 min 05 s) | 226 s | 378 s | 172 s | 232 s | 225 s |
| After (`bebc19a4`) | **6 min 04 s** | 101 s | 181 s | 74 s | 103 s | 101 s |

That is about 2.2× faster.

**Per-tick cost.** These numbers come from `scripts/sim-bench.mjs` with the base and new trees interleaved in one job:
- **Workload:** 600 ticks of held swim or pilot controls from each of the 16 creel milestone saves, 7 rounds, taking the median.
- **The run:** `--class exclusive` at `c77979ab` (sources as at `bebc19a4`), results in `/work/tmp/sim1-bench-exclusive-c77979ab.json`.
- **Missing: the exclusive evidence.** The queue flagged this run as "DISTURBED by work outside the lane" (CPU pressure some ≤ 19%), so these numbers are indicative only. A clean `--class exclusive` rerun is pending after SCHED-2b's queue switch-over.

| µs per tick (mean of 16 states; range across states) | Base (`887df90c`) | New |
| --- | --- | --- |
| `stepGame` (pure: clone + step) | **254** (175–373) | 274 (172–476) |
| `stepGameInPlace` | n/a | **39** (25–91) |
| `StepGuard.step` (the app's and driver's path) | n/a | **40** (24–88) |
| Clone alone | 149 (85–252) | n/a |
| The app's timeline observation | 6.1 (4.5–8.8) | **2.0** (0.7–4.3) |

**Reading the table:**
- **The clone costs more than its own time.** The base step costs about 103 µs more than the clone alone, while the in-place step costs 39 µs. Stepping a freshly allocated graph every tick is itself slower (cold shapes and GC), so removing the clone saves more than the clone's own time.
- **The pure `stepGame`** stays at its old cost, as intended: it is for forks only.

**Atomicity.** `tests/step-guard.test.ts` (fast tier) injects a throw at each of the faulting step's world queries, and at 8 fields only later parts of the step touch:
- renewal progress;
- the works gate;
- decodes;
- ecology;
- threat interest;
- the recovery operation;
- food and oxygen.

Each throw lands after `tick++` and movement have already mutated the state. Every case restores the exact pre-step state in the same object, raises `StepFault "exact"`, and resumes to the same next state as an untouched run. The other guard tests cover:
- a failed replay falling back to the checkpoint;
- journaled and refused commands;
- a new state object;
- drift detection when something writes outside the guard.

**Checks:**
- **Fast tier:** passed, 136 files (`npm test`, exit 0).
- **Heavy tier:** passed on alickers at `bebc19a4` (fail 0 in every file; 894 s of file time in 329 s).
- **Build:** `npm run build` passed.
- **Economy scripts:** all five passed (`check-campaign-economy`, `check-m1-economy`, `check-m2-a-economy`, `check-m2-b1-economy`, `upgrade-economy`).

**Where test time went** (attribution only, from the fast tier under its 5-way concurrency): 60,481 `stepGame` calls spent 18.5 s cloning and 33.3 s stepping, so cloning was about 6% of the tier's CPU. The converted loops remove most of it. The larger win is the playthrough and bots, above.

## Compromises and follow-ups

- **World terrain sampling is now the largest per-step cost:** about 25% of the in-place step in the attribution profile (`nearestOnPolyline`, `sampleAuthored`, noise inside `groundHeight`/`supportHeight`). It's out of this stream's scope. The root fix is a baked or cached height lookup for the sim's world queries, M. Owner: the world stream.
- **Systems host views are rebuilt every step** (`listHosts` → `plainSockets`), about 6% in the attribution profile. The cost is bounded by the number of hosts, so it doesn't grow with play. The root fix is to cache host views between changes to systems state, S/M.
- **Rotation keeps listed stretches only at the default thresholds** (90 s empty travel, 60 s idle). A report run with lower thresholds can't list stretches inside rotated chunks below those floors; their totals are still exact. The root fix, if it's ever needed, is to keep every travel and idle event (small), S.
- **Test loops:** only the heaviest fast-tier loops moved to in-place. The other single-step forks keep the clone on purpose, for their pure contract.
