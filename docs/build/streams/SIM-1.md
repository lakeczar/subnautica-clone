# SIM-1: the simulation steps in place

**SIM-1a, for merge (coordinator's split at R6):** branch `t3/sim-1-inplace-step` at `68a2c5bd` and later docs. It holds:
- the in-place step and StepGuard;
- the SIM-02 indexes;
- the chunked recorder, with rotation that keeps notes verbatim;
- the `timelineSince` cursor;
- the writer-lock split.

Timeline persistence is root's own model: the whole export under one key, in one atomic write. The incremental journal is **parked on `t3/sim-1b-timeline-journal` (`f6fee338`)** for SIM-1b, after SIM-1a merges. Against `f6fee338`, SIM-1a only removes and restores the persistence path: 12 files, +117 −1,300.

Branch `t3/sim-1-inplace-step`, from root `feat/siltwake-first-expedition`. It was resumed on 2026-10-23, merged with root at `887df90c` (SCHED-2a), then at `91dc1ab` (SCHED-2b, SAVE-1). It covers SIM-01, SIM-02 and SIM-05 from the compromise audit.

**Source SHA:** `68a2c5bd` (SIM-1a). The stepping evidence below was tested at `bebc19a4`/`950d8796`; SIM-1a changes only timeline persistence since then. **No save schema change.** The timeline export format is now v2 (rotation summaries), and v1 still parses.

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
- **Persistence (SIM-1a): root's model.**
  - **The write:** the whole export under root's key (`siltwake.timeline.v1`), in one atomic `setItem`, on root's cadence (every 600 active ticks), plus an immediate write for a note.
  - **Notes:** "Note saved to the play timeline." appears only after `setItem` returns. A refused write says the note is in memory only, with export.
  - **Reloading:** v1 and v2 exports both parse.
  - **Retention and tabs:** as root. A new expedition replaces the stored timeline, and multiple tabs are last-writer-wins.
  - **What SIM-05 needed:** rotation now bounds the export and keeps every note verbatim. The old 20,000-event cap dropped later events, notes included.
  - **Known cost, a compromise:** each save still re-serialises the whole export (see "Compromises"; the root fix is SIM-1b).
- **Spans:** an export closes the open travel and idle spans with `closingEvents`, the same pure helper the recorder uses to close them, so it never seals or rotates the live history (R1 F1's cause).

## Contracts for other streams

- **New sim code** steps through `stepGameInPlace`, or through `StepGuard` wherever a state is live. Use `stepGame` only for forks and comparisons.
- **Nothing outside the guard may write a live state.** To replace it, hand the guard the new object.
- **`DriverObserver`/`driverHooks`** in the playthrough driver is the differential's seam.
- **CW-1 merge:** CW-1 changes `flowAt(old, state.tick)` to `flowHere(…)` on the line SIM-1 changed to `pre.tick`. Whichever merges second writes `flowHere(world, old, pre.tick)`. `relocateForCave` keeps its clone, and the guard treats its result as a new state.
- **SIG-1:** add per-step work inside `stepGameInPlace` and read the pre-step values from `pre`, never from a reference taken before mutation.
- **Writer lock (STEW-1 headless split, folded in at R5):** `src/save/writer-lock.ts` is portable: the `WriterLockPort` interface and `SAVE_WRITER_LOCK`, with no browser types. The `browserWriterLock` adapter (`LockManager`) is in `src/runtime/browserLock.ts`. sim imports only the port. `AbortSignal` comes from STEW-1's `scripts/headless-platform.d.ts`, and nothing declares `LockManager` globally.
- **Timeline consumers (changed contract, R1 C1):** `rec.events` is now only the open chunk, and it is replaced at every 1,000-event seal, so an array offset into it loses events at the boundary.
  - Read new events with `timelineSince(rec, cursor)` → `{ events, cursor, missed }`. The cursor is `rec.seq`, which never resets across seals, rotation or a reload. A read costs only the new events; `missed` counts events that rotated away unread.
  - **REC-1:** its app call `recordTimeline(recorder, timeline.events, offset)` becomes:

    ```ts
    const next = timelineSince(timeline, cursor);
    recordTimeline(recorder, next.events, 0);
    cursor = next.cursor;
    ```

    Whichever of SIM-1 and REC-1 merges second wires it.
  - **Cursor initialisation (R2 C1):** the cursor comes from `seq` at every entry into an expedition and at every replacement of the timeline (a load, a new game, an import): `cursor = timeline?.seq ?? 0`. An old cursor is never carried across sessions; `seq` is monotonic only within one session's history. REC-1's `570c63bc` satisfies this. Its `timelineHead(t)` is `timelineSince(t, MAX_SAFE_INTEGER).cursor`, which equals `seq`, and it is set at `entered()` and when a recording starts mid-session. Its reads go through the same seam. REC-1 is adding tests for re-entry past a seal and for replacement by a shorter session.

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

**RTX 4070 Laptop (alickers, shared desktop host; indicative):** the same bench at `3b797af3` via `--class gpu --machine 4070`. It exited 0 after 5 min 19 s, with results in `/work/tmp/261023-175203-8975/sim1-bench-4070.json`.
- **Inputs:** the job compiled both trees in its own checkout and regenerated the 16 milestone saves with the base tree. They match the 3090 run's inputs by size and tick, 16 of 16.
- **Results** (mean µs per tick):
  - base `stepGame` **197** (144–328) → `stepGameInPlace` **32** (20–66) and `StepGuard.step` **32** (20–61), about 6.1× cheaper;
  - the new pure `stepGame` 214;
  - clone alone 117;
  - timeline observation 5.0 → **1.6**.

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
- **F2 (P1), fixed at the root:** the store was redesigned as a commit protocol (above). Nothing a committed head names is ever deleted before a replacement head is stored. A rotated chunk is folded in place, which usually shrinks it, so compaction usually needs no free space (R2 corrected an overstatement here). Regressions:
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

**R2 (Sol 6.1 xhigh, `docs/build/reviews/SIM-1-SOL-XHIGH-R2.md` on `review/sim-1-r2`).** The common cause: the store trusted in-memory bookkeeping about durable storage. That whole class is gone. The store now holds no state between saves; it reads the durable head at each save and enumerates its owned prefix (store design, above).
- **F1 (P1):** with no remembered `onDisk`/`committed`/`superseded`, a load or another instance can't leave stale facts behind. Regressions:
  - one store: A then B, and A then C then A with no C save, with a failing write and its retry;
  - two store instances alternating sessions over four rounds, each loading the other's session in turn.
- **F2 (P2):** one collision-free restore numbering, plus a commit that refuses collisions. Regression: 23,000 notes, a rotated export, then parse, resume, save and load, then 1,500 more and save again. Numbers stay unique and every note comes back once.
- **F3 (P2):** everything is discoverable by prefix, and a provisional head makes a session's keys ageable from its first write. Regressions:
  - a restart after **every** storage step (writes and removals) of a save that writes two chunks, folds one and collects. Each restart reloads every committed note once; the resumed game then saves, reloads whole and leaves no orphan;
  - four sessions that crash at their head write. They are kept inside the stale window (they may be another tab). Past it, on a quota of usage plus 100, a later session's 1,000-event save reclaims them and succeeds.
- **C1 (P2):** the initialisation rule, above.
- **The "every fold shrinks" claim** is corrected in the store design above.
- **Every successful save in these tests** is checked by a fresh store that reloads every note exactly once, with matching analysis totals (new things, gathering, notes, deaths, travel, idle), unique chunk numbers and no orphaned keys.

**R3 (Sol 6.1 xhigh, `docs/build/reviews/SIM-1-SOL-XHIGH-R3.md` on `review/sim-1-r3`).** *Superseded in R4:* the coordinator replaced R3's retention contract with contract v2, and the store was rebuilt to it. Kept here as history. At the time, R3 was fixed under the coordinator's retention contract.
- **F1 (P1):** committed timelines are no longer collected for age; there is no age rule at all. Regressions:
  - Sol's two real-app flows (`tests/timeline-app.test.ts`), through the real app, session and repository, with the other expedition's saves an hour later:
    - New A, then New B, then B saves, then import A;
    - A, then a session-only B, then B saves, then dispose and Continue.

    Every A note comes back exactly once, and the stored A analyses exactly as A did at its last save. Both fail on `8eb5e374`.
  - Store-level checks:
    - three old committed sessions survive five saves "years" later;
    - a v1 record survives other sessions' saves, and an interrupted migration of its own session, until that session stores a complete v2 head.
- **F2 (P1):** tri-state reads (above). Regressions:
  - a read failing at every read index of a save, once and persistently: the committed history and the other session's timeline always survive, as does every crash image taken during those saves;
  - an unreadable head loads as `unreadable`, and a save never writes over it.
- **F3 (P2):** Web Locks coordination (above), and `save` refuses without its own lock. Regressions:
  - another tab's collector runs at every storage step (provisional, chunk, head) of a live session's retry, and the retry commits and reloads whole;
  - a writer without its lock is refused before writing, and its abandoned work is reclaimed;
  - abandoned uncommitted sessions are reclaimed only under free locks, never without locks, and never the live one.
- **Eviction order:** under repeated tight-quota saves, exactly the unreferenced, not-live timelines go, oldest written first (`oldest`, `middle`, `newest`). Continue, backup and a live tab remain, and the save fails rather than take them. Each eviction is in the result and in the timeline, even after its chunks fold.
- **The test harness's `navigator.locks` double** (`tests/app-browser-support.ts`) now models Web Locks: both call forms, `ifAvailable` and FIFO waiting. Save writer-lock requests still go to the gate-able writer lock.

*(Applies to the incremental store, now parked on `t3/sim-1b-timeline-journal`.)* **R4 (Sol 6.1 xhigh, `docs/build/reviews/SIM-1-SOL-XHIGH-R4.md` on `review/sim-1-r4`).** The coordinator replaced R3's multi-session contract with contract v2. The store was rebuilt to it (above), and everything R3 added was deleted.
- **F1** (a waiting tab overwrote newer history): observed-record conflict detection. Regression: a tab that loaded before another tab's newer commit gets `conflict`, and the newer history stands.
- **F2** (a released lease didn't stop a save; notes lost on pagehide): the generation `AbortSignal` is checked inside the lock, plus the outbox (removed in R5; see below). Regressions:
  - a commit aborted while waiting for the lock never mutates (journal and app level);
  - a same-session replacement mid-save: the old generation never writes, and its note comes back from the outbox exactly once (journal and app level);
  - a page closed while the lock never comes: Continue has the note.
- **F3** (evicting referenced timelines): eviction and references are gone. Retention mirrors the save slot.
- **F4** (malformed v1 treated as absent): it is now `protected`. Regressions: an unreadable or malformed journal, another-shaped journal, missing chunk or malformed v1 is protected and nothing is written. A damaged journal or v1 also protects other expeditions.
- **F5** (a rejected or pending lock silently disabled saves): a rejected lock is `lock-failed` and said, then retried. A pending lock is said once saves queue behind it. No lock API is `lock-unavailable` (read and export only).
- **F6** (quota eviction deleted v1): v1 is deleted only after a committed journal names its replacement. Regressions: migration into current, including a failed migration that keeps the record; migration into previous; and under quota, the record stays.
- **F7 and F8** (unreported or unrecognisable drops): every dropped timeline is in the commit result with a reason (`replaced` or `room`) and an ID-free label, and is said to the player.
- **Kept regressions:** the 998/999 boundary matrix, write faults at every write and read faults at every read (with crash images), the 23,000-note export round trip, and quota folding. Plus Sol's two R3 app flows, now via previous: A, then B, then import A; and session-only B, then Continue A.
- **Test harness:** the R3 `navigator.locks` double is reverted to the original minimal one, since the app no longer takes Web Locks directly.

*(Applies to the incremental store, now parked on `t3/sim-1b-timeline-journal`.)* **R5 (Sol 6.1 xhigh, `docs/build/reviews/SIM-1-SOL-XHIGH-R5.md` on `review/sim-1-r5`).** Fixed under the coordinator's R5 decisions.
- **F1, F2, F3, F7, F8 and F9 (the note outbox):** the outbox is removed entirely, and notes commit like game saves (above). Its tests are dropped, and the "close while the lock is pending" test is adapted to the honest bound: the notices showed "Saving note…" and never "Note saved", the committed note survives, and the pending one is gone.
- **F4:** the one shared validator (above). Regressions:
  - B and then C, a third expedition, load protected and write nothing over A, for each of a malformed head event, a malformed chunk list, malformed chunk JSON and a missing chunk;
  - a thrown chunk read protects, and nothing is deleted;
  - A's chunk damaged *after* B and C verified it: displacement by C, and a quota drop by B, both refuse as protected and write nothing.
- **F5:** notice correctness, with "Waiting to save the play timeline" and "the local play-timeline store" wording. Regressions: "Saving note…" then "Note saved" only after the commit; a pending commit is said within 2 s (mock timers) with no "Note saved" until it lands; a conflict says the note is in memory only, with export.
- **F6:** victims are reported only once a committed journal stops naming them. Regressions: C's failing first write reports nothing and changes nothing; under a quota where A and B must both go and C still doesn't fit, both drops are reported, though C fails.
- **Repair:** regressions at the journal level (repair, then normal commits; a conflict when the records change after export) and the app level (the menu shows it, the export downloads first, confirm, then replace; a change before confirming is a conflict and nothing is replaced).
- **Cleanups:** `TimelineJournal.canWrite` is removed. Notes are counted without allocating the history.
- **STEW-1 split** folded in (contracts, above).
- **Checks at `85266cd7`:**
  - fast tier, 141 files;
  - focused timeline, app, save, session and presentation suites, 295/295;
  - the `creel` playthrough on the queue (`--machine any`, run on alickers): complete, no blockers, all 17 milestone reloads matched (`/work/tmp/261023-220917-5751/pt-sim1-r5-creel.json`).

**R6 (Sol 6.1 xhigh, `docs/build/reviews/SIM-1-SOL-XHIGH-R6.md` on `review/sim-1-r6`).** The coordinator split the stream. SIM-1a (this branch) drops the incremental store and returns timeline persistence to root's model (above). R6's findings all concern that store, and go with it to SIM-1b with the coordinator's rulings (see "Compromises").
- **Tests kept or adapted:**
  - the 998/999 boundary matrix and the rotated 23,000-note round trip, now at the export level (export, parse, resume, append, export);
  - rotation equivalence and folds;
  - the cursor across seals, bursts and reloads;
  - "an export never seals".
- **New app tests:** "Note saved" only after the write returns (a refused write says memory only), and Continue resumes a rotated timeline whole.
- **No longer applicable:** R3's two app flows (returning to a previous expedition's timeline), since root's model keeps one timeline.
- **Checks at `68a2c5bd`:**
  - fast tier, 140 files;
  - focused suites, 281/281 (timeline, app, save, session, presentation, step guard, rows);
  - the queued `creel` playthrough on `--machine 4070` (RTX 4070 Laptop, alickers): complete, no blockers, all 17 milestone reloads matched (`/work/tmp/261023-224012-ea90/pt-sim1a-creel.json`).

**Performance conventions** (`t3/stew-1-guard-rails` DIRECTION):
- **#1:** the recorder's per-step stock copy uses a reused buffer, and `timelineSince` copies only the new events.
- **#7 and #8: core helpers** (a note for the steward to fold into `CORE-HELPERS.md`): `rowById` and `hasMember` (`src/sim/rows.ts`) are identity-keyed, hit-validated, roster-bounded caches. Each is a `WeakMap` keyed by a state roster array. Every hit is checked against the row (or the length and tail for append-only rosters), so they never trust identity. Each is bounded by its roster's size and goes when the roster goes.
- **#9:** the target numbers are `--class exclusive` on the 3090; the 4070 check is the indicative bench above.

## Compromises and follow-ups

- **SIM-1a writes the whole timeline export on every save** (every 600 active ticks, and on each note), as root does today. This is no regression, but it is the cost SIM-05 named.
  - **Size, measured (deterministic, not a timing):** a full rotation window (20 sealed chunks of 1,000 events: gathers, points of interest and a note every 50) exports to **2,854,214 UTF-16 code units**, about 5.4 MiB in localStorage terms. That is a large share of a ~5 M-character origin quota, which the save journal shares.
  - **Not measured:** the per-save stringify cost is not measured on the 3090 or the 4070; the earlier estimate was about 2.4 MB per save.
  - **Tabs:** multi-tab writes are last-writer-wins, as root.
  - **Root fix:** SIM-1b, the incremental journal parked on `t3/sim-1b-timeline-journal`. Commits there rewrite only a small head, inside the writer lock, with conflict detection. Before it merges it must carry R6's findings under the coordinator's rulings:
    - **F1:** no commit-ID cache; each commit re-parses the journal and heads and checks named chunks exist;
    - **F2:** a total reader;
    - **F3/F4:** protection persists until a replacement commits, and v1 is superseded;
    - **F5:** the same protection boundary for a live commit;
    - **F6:** a rejected lock or quota failure retries at the next save, while conflict or protection does not;
    - **F7:** the pending notice re-armed for a queued note.

  Cost: M.


- **World terrain sampling is now the largest per-step cost:** about 25% of the in-place step in the attribution profile (`nearestOnPolyline`, `sampleAuthored`, noise inside `groundHeight`/`supportHeight`). It's out of this stream's scope. The root fix is a baked or cached height lookup for the sim's world queries, M. Owner: the world stream.
- **Systems host views are rebuilt every step** (`listHosts` → `plainSockets`), about 6% in the attribution profile. The cost is bounded by the number of hosts, so it doesn't grow with play. The root fix is to cache host views between changes to systems state, S/M.
- **Rotation keeps listed stretches only at the default thresholds** (90 s empty travel, 60 s idle). A report run with lower thresholds can't list stretches inside rotated chunks below those floors; their totals are still exact. The root fix, if it's ever needed, is to keep every travel and idle event (small), S.
- **Test loops:** only the heaviest fast-tier loops moved to in-place. The other single-step forks keep the clone on purpose, for their pure contract.
