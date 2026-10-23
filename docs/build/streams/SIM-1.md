# SIM-1: the simulation steps in place

Branch `t3/sim-1-inplace-step`, from root `feat/siltwake-first-expedition`. It was resumed on 2026-10-23, merged with root at `887df90c` (SCHED-2a), then at `91dc1ab` (SCHED-2b, SAVE-1). It covers SIM-01, SIM-02 and SIM-05 from the compromise audit.

**Source SHA:** `950d8796`, the merge with root `91dc1ab`. Root changed nothing under `src` since `887df90c`, so the sim sources are those tested at `bebc19a4`. **No save schema change.** The timeline storage format changed from v1 to v2 and includes a bridge (below).

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
- **`TimelineStore`** (`src/sim/timeline/store.ts`, redesigned in R1):
  - **Keys:** each chunk has its own key, scoped by session, written once when sealed. When the chunk rotates, the same key is overwritten with its summary.
  - **The head:** each 10-second save rewrites only the head (the session, the open chunk with open spans closed as of the save, and the chunk keys in order). Before, the whole history was re-serialised, up to about 2.4 MB. Summaries live in their chunk keys, so the head stays small however many notes accumulate.
  - **Every failure leaves a readable, complete committed timeline:**
    - the head is the commit point, written after the chunks it names;
    - a chunk key is only ever replaced by its own summary, one atomic write that shrinks it, so a committed head naming it reads the same history;
    - anything a new head no longer names (another session's timeline, the v1 record, the chunks of a commit that never landed) is removed only after that head is stored.
  - **On a full quota,** the recorder rotates its oldest chunk, the store folds that key in place (freeing space) and the save retries. If nothing fits, the save fails, the app says so once, and every note stays in memory for export.
- **Bridge:** the v1 single-key timeline migrates at the first save, and the v1 key stays until a v2 head is stored. v1 export files still parse.
- **Spans:** exports and saves close the open travel and idle spans with `closingEvents`, the same pure helper the recorder uses to close them. They never seal or rotate the live history. That was the cause of R1 F1.

## Contracts for other streams

- **New sim code** steps through `stepGameInPlace`, or through `StepGuard` wherever a state is live. Use `stepGame` only for forks and comparisons.
- **Nothing outside the guard may write a live state.** To replace it, hand the guard the new object.
- **`DriverObserver`/`driverHooks`** in the playthrough driver is the differential's seam.
- **CW-1 merge:** CW-1 changes `flowAt(old, state.tick)` to `flowHere(…)` on the line SIM-1 changed to `pre.tick`. Whichever merges second writes `flowHere(world, old, pre.tick)`. `relocateForCave` keeps its clone, and the guard treats its result as a new state.
- **SIG-1:** add per-step work inside `stepGameInPlace` and read the pre-step values from `pre`, never from a reference taken before mutation.
- **Timeline consumers (changed contract, R1 C1):** `rec.events` is now only the open chunk, and it is replaced at every 1,000-event seal, so an array offset into it loses events at the boundary.
  - Read new events with `timelineSince(rec, cursor)` → `{ events, cursor, missed }`. The cursor is `rec.seq`, which never resets across seals, rotation or a reload. A read costs only the new events; `missed` counts events that rotated away unread.
  - **REC-1:** its app call `recordTimeline(recorder, timeline.events, offset)` becomes:

    ```ts
    const next = timelineSince(timeline, cursor);
    recordTimeline(recorder, next.events, 0);
    cursor = next.cursor;
    ```

    Whichever of SIM-1 and REC-1 merges second wires it.

## Evidence

Each result names the SHA it was tested at. The base is root `887df90c`, whose `src` is identical to root `91dc1ab`'s.

**Determinism.** The differential is `scripts/sim-differential.sh 887df90c`, run at `950d8796` over all 8 scenarios on factory-worker (the queue's `--machine any` route). It exited 0 after 2,530 s, with results in `/work/tmp/sim1-diff-950d8796.json`. An earlier run of the first 5 scenarios at `bebc19a4` on alickers was also identical.
- **What it does:** each scenario's real command stream is fed to two sims side by side, the new in-place sim and the base commit's own compiled cloning sim (separate module instances and world).
- **Coverage:**

  | Scenario | Ticks | Commands | State checks | Timeline checks | Result |
  | --- | --- | --- | --- | --- | --- |
  | creel | 725,952 | 520 | 12,634 | 217 | identical |
  | carrier | 1,158,144 | 616 | 19,921 | 325 | identical |
  | creel-loss | 628,280 | 311 | 10,788 | 181 | identical |
  | reverse | 744,078 | 522 | 12,938 | 222 | identical |
  | no-optional | 723,107 | 509 | 12,575 | 216 | identical |
  | low-air | 9,678 | 0 | 162 | 5 | identical |
  | tour | 183,602 | 37 | 3,098 | 53 | identical |
  | over-geared | 18,046 | 3 | 304 | 6 | identical |

  The branch scenarios count only their own ticks. In total: 4.19 M ticks and 2,518 commands.
- **What was compared:**
  - **State:** compared structurally every 60 ticks, after every command and on the first step after every save reload. All 72,420 checks were equal.
  - **Events:** every tick's events were equal.
  - **Timeline:** the base and new timeline recorders were observed as the app does, and their timelines (events and death and recovery ledgers) matched at all 1,225 checks.
- **Cross-commit milestones:** the plain playthroughs before (`887df90c`) and after (`bebc19a4`) were run on alickers, both with `--jobs 3`.
  - In all 5 scenarios, every milestone's label, tick and state hash is identical (82 saves), and every reload matched.
  - The whole run records (phases, legs, gathered and spent counts, hazards, discoveries) are identical apart from wall time, so the bots made the same decisions.

**Full five-scenario playthrough wall time** (alickers, RTX 4070 Laptop on a shared desktop host; indicative):

| | Total | creel | carrier | creel-loss | reverse | no-optional |
| --- | --- | --- | --- | --- | --- | --- |
| Before (`887df90c`) | **13 min 04 s** (user 21 min 05 s) | 226 s | 378 s | 172 s | 232 s | 225 s |
| After (`bebc19a4`) | **6 min 04 s** | 101 s | 181 s | 74 s | 103 s | 101 s |

That is about 2.2× faster. After the merge, all **8 scenarios** play in **7 min 19 s** on alickers at `950d8796`, with no blockers and every reload matched (`/work/tmp/261023-143349-ad64/pt-sim1-after-950d8796.json`). Root's README quotes about 14 min for the same eight at `0a464bc`; that is its figure, not a before-run of mine.

**Per-tick cost.** These numbers come from `scripts/sim-bench.mjs` with the base and new trees interleaved in one job:
- **Workload:** 600 ticks of held swim or pilot controls from each of the 16 creel milestone saves, 7 rounds, taking the median.
- **The run:** `--class exclusive` on the RTX 3090 at `950d8796`, results in `/work/tmp/sim1-bench-exclusive-950d8796.json`. It was **not disturbed** (CPU pressure some ≤ 0.56%).
- **An earlier run** at `c77979ab` was flagged DISTURBED; it agrees in shape (254 → 39 µs).

| µs per tick (mean of 16 states; range across states) | Base (`887df90c`) | New |
| --- | --- | --- |
| `stepGame` (pure: clone + step) | **209** (153–279) | 222 (152–301) |
| `stepGameInPlace` | n/a | **31** (22–65) |
| `StepGuard.step` (the app's and driver's path) | n/a | **33** (25–59) |
| Clone alone | 125 (85–149) | n/a |
| The app's timeline observation | 5.1 (3.9–5.9) | **1.7** (0.4–2.5) |

**Reading the table:**
- **The app's path is about 6.3× cheaper per tick** (209 → 33 µs). The guard's checkpoint and journal add about 2 µs.
- **The clone costs more than its own time.** The base step costs about 84 µs more than the clone alone, while the in-place step costs 31 µs. Stepping a freshly allocated graph every tick is itself slower (cold shapes and GC), so removing the clone saves more than the clone's own time.
- **The pure `stepGame`** is for forks only. It measures about 6% over the base; the likely cause is `preStep`'s small copy, which is not measured separately.

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
- **Fast tier:** passed at `950d8796`, 140 files (`npm test`, exit 0).
- **Heavy tier:** passed at `b509b949` (sources as at `950d8796`) on factory-worker: exit 0, 1,193 s of file time in 664 s. It also passed earlier on alickers at `bebc19a4`.
- **Build:** `npm run build` passed at `950d8796`.
- **Economy scripts:** all five passed at `950d8796` (`check-campaign-economy`, `check-m1-economy`, `check-m2-a-economy`, `check-m2-b1-economy`, `upgrade-economy`).

**Where test time went** (attribution only, from the fast tier under its 5-way concurrency): 60,481 `stepGame` calls spent 18.5 s cloning and 33.3 s stepping, so cloning was about 6% of the tier's CPU. The converted loops remove most of it. The larger win is the playthrough and bots, above.

## Review responses

**R1 (Sol 6.1 xhigh, `docs/build/reviews/SIM-1-SOL-XHIGH-R1.md` on `review/sim-1-r1`):**
- **F1 (P1), fixed at the root:** the export closed spans on a copy, which could seal and rotate, and the store then sliced that copy by the live partition. Exports and the store now take the live partition as it stands, plus `closingEvents`, the one shared helper. No copy remains and nothing seals behind the writer's back. The regression covers 998 and 999 open events at the full 20-chunk window, closing idle, travel and both. Every note comes back exactly once, the analysis totals match, and the live partition is unchanged.
- **F2 (P1), fixed at the root:** the store was redesigned as a commit protocol (above). Nothing a committed head names is ever deleted before a replacement head is stored. A rotated chunk is folded in place, which shrinks it, so compaction needs no free space. Regressions:
  - exhaustive fault injection at every write of a save that seals chunks: one failing write and all later writes failing, with both a quota error and a non-quota error;
  - the review's quota-plus-100 case;
  - a failed v1 migration.

  A fresh reader always recovers every committed note exactly once. After a successful or recovered save, it recovers every note.
- **Checked against the reviewed code:** all four regressions fail on `2b0b7d88`'s timeline modules and pass now.
- **C1:** `timelineSince` plus `rec.seq` (contracts, above). Regressions cover:
  - reading after every note across the first seal;
  - bursts of 700 crossing seals;
  - a reload, including an idle span that closes into the stored timeline;
  - a lagging reader's `missed` count.

**Performance conventions** (`t3/stew-1-guard-rails` DIRECTION):
- **#1:** the recorder's per-step stock copy uses a reused buffer, and `timelineSince` copies only the new events.
- **#7 and #8:** `rowById` and `hasMember` are keyed by roster identity, but nothing is trusted on identity. Every `rowById` hit is checked against the row itself, and `hasMember` validates length and tail. Each index is bounded by its roster's size and is collected with the roster array, which is state-owned rather than a long-lived root. If the steward wants them under a ledger, that is a small follow-up.
- **#9:** the per-tick numbers are `--class exclusive` on the 3090. No separate 4070 µs check was run. The 4070 evidence is the alickers playthrough wall times, which are indicative.

## Compromises and follow-ups

- **World terrain sampling is now the largest per-step cost:** about 25% of the in-place step in the attribution profile (`nearestOnPolyline`, `sampleAuthored`, noise inside `groundHeight`/`supportHeight`). It's out of this stream's scope. The root fix is a baked or cached height lookup for the sim's world queries, M. Owner: the world stream.
- **Systems host views are rebuilt every step** (`listHosts` → `plainSockets`), about 6% in the attribution profile. The cost is bounded by the number of hosts, so it doesn't grow with play. The root fix is to cache host views between changes to systems state, S/M.
- **Rotation keeps listed stretches only at the default thresholds** (90 s empty travel, 60 s idle). A report run with lower thresholds can't list stretches inside rotated chunks below those floors; their totals are still exact. The root fix, if it's ever needed, is to keep every travel and idle event (small), S.
- **Test loops:** only the heaviest fast-tier loops moved to in-place. The other single-step forks keep the clone on purpose, for their pure contract.
