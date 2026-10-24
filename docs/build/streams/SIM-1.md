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

## SIM-1b: the incremental play-timeline journal

Branch `t3/sim-1b-timeline-journal`, rebuilt on root `96255382` (SIM-1a, SIG-1, STEW-1, TST-16) from the parked `f6fee338` (kept as `backup/sim-1b-f6fee338`). The spec is contract v2, plus the coordinator's R5 decisions and R6 rulings. It replaces SIM-1a's whole-export save; the compromise SIM-1a filed is closed by this.

**What a save costs now:** `scripts/timeline-save-bench.mjs`, run at `989c3786` via the queue on `--machine 4070` (RTX 4070 Laptop, alickers, a shared desktop host, so the times are indicative). The bench fills the full 20,000-event window (22,595 events recorded: 20 sealed chunks, 595 open, 2 folded), then saves 60 times about 10 s of play apart. Character counts are exact.

| | Characters written per save | Time per save |
| --- | --- | --- |
| Root model (whole export) | 2,956,608 | stringify median 9.36 ms, max 14.04 ms |
| Journal, steady commit | 63,959, the journal only (the head with its open chunk) | median 0.80 ms, max 3.93 ms |
| Journal, a commit that seals a chunk | 208,263 in 3 keys (the journal, the new chunk, one fold) | 2.80 ms |

A steady save now writes about 2% of what root's model wrote, and costs about 0.8 ms against 9–14 ms. That meets the bar: the head plus any new sealed chunk, not the whole history.

**Design** (`src/sim/timeline/store.ts`, `src/runtime/liveTimeline.ts`):
- **The commit point:** one journal record, `siltwake.timeline.v2.journal = { current, previous, v1Superseded }`. Each head names its chunk keys (`siltwake.timeline.v2|<session>|<n>`). A chunk is written once when it seals and once more as its summary when it rotates.
- **Each commit runs inside one `runExclusive`** on `siltwake.timeline.v2.writer`. The generation's `AbortSignal` is checked inside the lock before anything is written.
- **Planned before it writes (R6 F1):** each commit, with no cache:
  - reads the journal afresh, and treats a text different from the one this tab last saw as a conflict;
  - parses it and both heads through a total reader;
  - lists the chunk keys once, to check that every chunk either head names exists;
  - reads a head about to be displaced whole, chunks included;
  - reads a chunk a fold would overwrite first; a damaged one protects. The fold itself always comes from the recorder's own loaded events.

  Under quota, previous is read whole before anything is folded for room. Collection removes only keys the journal just committed doesn't name.
- **Total reader (R6 F2):** every head field is checked before anything spreads or reads it. Events go through the one parser (`parseTimeline`). Any malformed shape, in either position and from any expedition, is `protected` and never thrown.
- **Protection** (unreadable or malformed journal, head, chunk or v1, including a journal read failing mid-commit, R6 F5) stays until a replacement commits (R6 F3). The menu's **Repair play timeline** exports the raw records, confirms, and replaces them inside the lock. If the records changed since the export, the repair is a conflict. A refused repair stays offered.
- **v1:** migrated into current or previous by its session. The first committed journal holding that session sets `v1Superseded`, after which a leftover v1 record is garbage, never a veto, and is removed after the commit (R6 F4).
- **Retention:** current plus previous. Under quota, this expedition's oldest chunks fold first, then previous is dropped (reported with an ID-free label once committed), then the commit fails.
- **Notes commit like game saves:**
  - "Saving note…" at once, then "Note saved to the play timeline." only once a commit holding the note returns;
  - "Waiting to save the play timeline…" after about 2 s pending, re-armed for a note queued behind a pending commit (R6 F7);
  - closing during a pending note commit can lose that note, and the notices never claimed it saved.
- **Failure policy (R6 F6 ruling, an amendment to R5):**
  - a **rejected lock** or a **full quota**: the note is in memory only *for now*, and the next scheduled save tries again;
  - a **conflict**, **protection** or **no lock API**: memory only with export, and no retry.

**Note save reference (owner, 2026-10-24; for REC-2):** a note event can carry `saveRef: string`, a reference to the game state saved with that note. REC-2 owns the save itself and where it is kept; the timeline only carries the reference.
- **Bound:** at most 200 characters (`SAVE_REF_MAX`), so a 1,000-event chunk stays bounded.
- **API:** `addNote(rec, s, text, wall?, saveRef?)` and `LiveTimeline.note(s, text, saveRef?)`. `parseTimeline` rejects a malformed `saveRef`.
- **Retention:** kept verbatim through rotation like the note itself.
- **REC-2's side:** drop its save when the note's expedition leaves the journal; a committed journal naming neither head is the signal.

**Contracts changed:**
- `exportTimeline` and `exportTimelineText` lose SIM-1a's `whole` fold argument (the journal folds for quota now), and `TIMELINE_WHOLE_FLOOR` is gone.
- The recorder exports `closingEvents`, `exportHead`, `rotateOldest` and `retainedEvents` again for the store, and `resumeRecorder` takes the stored partition.
- `ExpeditionSession.ask` is public, for the repair's confirmation.

**Tests** (`tests/timeline-store.test.ts`, `tests/timeline-app.test.ts`, `tests/timeline-recorder.test.ts`):
- **Kept from R1–R5:**
  - the boundary matrix and fault injection at every write and read, with crash images;
  - the export round trip, folds and retention swaps;
  - conflicts, aborted and replaced generations, malformed records, v1 migration, repair and note notices;
  - R3's app flows (A, B, import A, and session-only B then Continue).
- **New for R6:** F1 paths 1–3 (a removed chunk; a damaged chunk about to fold; a journal edited with commit IDs kept; quota with a damaged previous), each with zero mutations. Also:
  - F2: seven malformed head shapes, in both positions, for three expeditions, plus Continue onto `events: null` offering the repair;
  - F3: a refused repair (quota and permission) retried in-session, with notes kept;
  - F4: v1 removal refused after the repair, plus the crash image right after the journal write;
  - F5: an unreadable journal mid-commit, then a repair after reads recover;
  - F6: a rejected lock and a full quota, each saved by the next scheduled save;
  - F7: a queued note's own waiting notice.
- **Also:** every browser quota form (QuotaExceededError, NS_ERROR_DOM_QUOTA_REACHED, codes 22 and 1014) against a non-quota refusal; the `saveRef` round trip; and "a steady commit writes the journal only".
- **Checked against the reviewed code:** the R6 store tests (F1, F2, F3/F4, F5) fail against `f6fee338`'s store, and the R6 app tests for F3, F6 and F7 fail against its live timeline. All pass here.

### SIM-1b R1 (Sol 6.1 xhigh, `docs/build/reviews/SIM-1B-SOL-XHIGH-R1.md` on `review/sim-1b-r1`)

- **F1 (P1), a failed repair deleted protected data:** a repair now stages its chunks under numbers no stored key uses, so it never overwrites the protected chunks. Cleanup after a failed attempt removes only keys that attempt created, and never the version 1 record. v1 goes only after a committed journal supersedes it. The repair's export now includes every chunk key's raw value as well as the journal and v1, and its conflict check compares all of them.
  - Regression: a refusal at each of the first six writes, with quota and permission errors, for a valid v1 and for this expedition's own chunks. The exported records stay identical, protection holds, every crash image is either the protected records or the repaired store, and a retry repairs.
  - App regression: the v1 record is kept, and the notice "Nothing was changed" is now true.
- **F2 (P1), the reader wasn't total:**
  - **One validator:** `validTimeline` (`report.ts`) validates an already-parsed value and never throws; `parseTimeline` is `JSON.parse` plus it, and diagnostics no longer stringify untrusted values.
  - **Depth limit:** untrusted JSON nesting deeper than 32 (real records nest about 7 deep) is refused, so no later clone or stringify can overflow the stack.
  - **Head checks:** the journal must have both head properties; chunk numbers, `nextChunk`, `seq` and `notes` must be non-negative safe integers; `folded` must be a prefix of `chunks`; and the open chunk can hold at most 1,001 events.
  - **Partition check:** after restoration, chunk numbers must be unique and below `nextChunk`, sealed chunks must be exactly 1,000 events, and summaries must come before events. Otherwise the result is `protected`, not `loaded`.
  - **`load()` is total by construction.**
  - Regressions: a v1 `version` with a null `toString` and one nested 4,000 deep, `nextChunk` set to −1 and to 2⁶⁰, a missing `current` or `previous`, and an event with a field nested 4,000 deep. Each is protected, with zero writes, and no commit lands over it. App: Continue onto the hostile v1 offers the repair.
- **F3 (P2):** one chunk validator, `parseChunk`, covers both representations (events, or a summary including its kept notes and their `saveRef`) through `validTimeline`. It is used for whole-head reads, fold checks and the quota plan alike. Regression: a fold target holding `{"kept":[]}` or a summary whose kept note has `saveRef: 7` is protected, with zero mutations.
- **F4 (P2):**
  - **Steady commits:** a steady commit now changes no committed chunk before its journal. It writes new chunks, then the journal (the commit point), then its folds. A fold left unwritten leaves the chunk holding its events, the same history, which the reader accepts.
  - **Quota pressure:** once quota pressure is known, everything the plan may fold or drop is read whole before the first fold: this expedition's committed chunks and the previous head. Then quota retries fold first, which frees room.
  - Regressions: a full-window rotation with a damaged previous, and damage beyond the first fold target; both are protected with storage unchanged. A refused post-journal fold still commits, and reloads whole.
- **F5 (P2):** the app opens the new timeline after resetting the outgoing presentation. Its entry notices are delivered once entry completes, after the session's own entry notices.
  - **Channel change:** a timeline storage failure is now a persistence warning (`channel: "persistence"`, new `NoticeContext` `"timeline"`). A system error could never be shown over the session-only persistence warning. A game save's success no longer resolves a timeline warning.
  - Regressions: the real `HudView` and `EncounterPresentation`, with DOM stubbed, show the warning after New, Continue, import and session-only entry. A unit test covers the resolution rule.
- **Model-based fault harness** (`tests/timeline-model-support.ts`; coordinator's ask):
  - **Operations:** seeded random sequences over three expeditions and a version 1 record (none, own, another's or broken): notes; events (rotation included); commits; faults at random write and read indices; quota pressure; re-entry; another tab's commit; repair (with faults); and random malformed corruption of the journal, heads, chunks and v1. The corruptions include shapes, wrong types, negative, huge and unsafe counters, and nesting 5,000 deep.
  - **Invariants, after every step:**
    - nothing throws;
    - a fresh reader of each expedition loads exactly its last successful commit's notes, each once, or, only when something was corrupted, reports protected;
    - a refused commit changes no byte, and a failed repair leaves the exported records and protection as they were;
    - storage's own guard fails on any removal of a key the stored journal names, or of v1 before a stored journal supersedes it;
    - an ok commit's `seq` is the recorder's, and its notes reload at once;
    - an expedition the store held before a commit and lost after it is reported dropped.
  - **Scale:** 24 fixed seeds in the fast tier (`timeline-model.test.ts`), and 2,000 sequences of 40 steps in the heavy tier (`timeline-model.heavy.test.ts`, `SILTWAKE_TIMELINE_SEQUENCES` to change). A failure prints its seed and the last 25 steps; `SILTWAKE_TIMELINE_SEED=<seed>` reruns one.
  - **Findings during development:**
    - **The store (seed 66769815):** a repair staged a chunk under a number the old journal still named, though that key itself was gone, so a crash image could pair the old journal with the repair's content. Staging now also avoids every number the old journal names. A targeted regression was added.
    - **The harness** (its own drop accounting): an expedition lost to a corrupted v1 record isn't a commit's drop.
  - **Runs:** 2,000 sequences pass at `d75de411` (156 s on factory-worker via the queue). `SILTWAKE_TIMELINE_SEED_BASE` selects another seed range for exploration.
- **Evidence at `b2aebd6d`, all on `--machine 4070` (RTX 4070 Laptop, alickers):**
  - `npm run gate -- --only fast,build,economy:…` (all six economy steps): partial gate passed, covering fast (76 s; the architecture guard and headless typecheck included), build and the six economy scripts;
  - the playthrough, all 8 scenarios: no blockers;
  - 5,000 more harness sequences on another seed range (`SILTWAKE_TIMELINE_SEED_BASE=77000017`): pass.

  Not run: the gate's bake step. The terrain bake's sources are unchanged.
- **Cancelled:** the 4070 gate tickets submitted at `5314f3ef` were still queued when R1 landed, and were cancelled so a changed tree couldn't run them locally. The gate is rerun at the R1 head.

### SIM-1b R2 (Sol 6.1 xhigh, on `b2aebd6d`)

- **F1 (P2), the shared validator accepted malformed payloads.** `validTimeline` stays the one validator. When present, it now checks every known optional event field:
  - strings: `what`, `id`, `label`, `hull`, `text`, `wall`;
  - numbers: `quantity`, `seconds`, `stationary`, `metres`, `of`;
  - `region` as a string or null; `waiting` and `keys` as string lists; `at` as three numbers; `saveRef` within its bound.

  It also checks every member of a summary's `travel.long` and `idle.long`. Repeated note text stays legitimate.
  - Regressions (`timeline-store.test.ts`): complete, otherwise-valid records with one wrong field, covering sixteen fields in an ordinary event and in a kept event, plus four bad stretch members. A fresh reader protects with zero mutations. The open writer's fold of a damaged event chunk refuses with zero mutations, and a commit that doesn't touch a damaged summary leaves it byte for byte.
  - Control: a timeline with every optional field well formed and a repeated note reloads whole.
- **F2 (P2), the harness wasn't independent and missed boundaries.** `tests/timeline-model-support.ts` is rewritten.
  - **An independent oracle, with two exceptions:** the harness keeps its own model of what is committed: which expedition each head holds, a pending v1 record, each expedition's notes (save references included), and its analysis totals and pending recoveries. It checks storage against its own lenient decoding of the raw JSON, never the production parsers. A commit's expected next state, drops and reports come from the model alone. The removal guard reads the stored journal leniently, so a head whose session and chunk numbers still read keeps its keys even when it is malformed.
    - **Exceptions:**
      - the analysis totals compared across a reload come from production `analyseTimeline` on both sides, so they check that a reload matches its commit, not that the analysis is right;
      - a reload's `seq` is checked only against the commit's result, as that `seq` plus zero to two closing spans (R3), not re-derived independently.

      The targeted store tests check `seq` exactly.
  - **Targeted damage:** corruption records its key, its damaged bytes and the original. While damage is live:
    - every fresh reader must protect;
    - the damaged bytes may change, or leave the journal, only through a committed repair;
    - a commit over a damaged journal, a missing chunk or v1 must refuse, as must a commit folding a damaged chunk;
    - nothing may write a damaged key before a journal write.

    The raw journal, with damage undone, must still hold exactly the model's heads and notes, so "saved implies durable" holds whether or not something was damaged. Corruptions now include the meaningful controls: one wrong field in an event, a kept event or a stretch; a valid summary with only a bad kept `saveRef`; and a valid summary with a deeply nested extra field.
  - **Reads write nothing:** every load, `records()` and fresh reader is bracketed by a storage snapshot and a mutation-call counter, so even a refused write inside a read fails the run. Refused commits (conflict, cancelled, invalid, no lock, failed lock) must make no mutating call at all, the other tab's included.
  - **Fault and lock families:**
    - any of `getItem`, `setItem`, `removeItem`, `length` and `key` can fail, once or from a position on, in commits, loads, `records()` and repairs;
    - crash images (the storage after every mutation) must hold each expedition's notes as before or as after, and load unless damaged;
    - gated commits with notes queued behind them, another tab's commit interleaved, an abort while waiting, and a note added right after the lock action, before the commit settles;
    - a refused lock, no lock, an aborted signal and a recorder of another expedition;
    - a live timeline (`LiveTimeline`) closed at page hide, disposed or replaced mid-commit. A disposed generation never writes, and every "Note saved" it says is committed.
  - **Events:** every kind, with its optional fields; open travel and idle spans closed by the commit; pending recoveries; repeated notes; save references. A reload's analysis totals and pending recoveries must equal the commit's.
  - **Replay:** seeds run `MODEL_STEPS` (40) steps in both tiers, so `SILTWAKE_TIMELINE_SEED=<seed>` replays the full original sequence.
  - **Regression scripts (fast tier):** fixed scripts in the same operation language, one or more per known defect:
    - a protected read; hostile and deep v1 records; five head counters;
    - one wrong field in events and summaries; a shallow summary about to fold;
    - both R1-F4 quota cases; a failed repair at each of four writes;
    - the missing-named-number repair (Sol's smaller replacement); a repair that claims success;
    - every storage call failing once or for good at three positions;
    - the lock and live boundaries.

    The targeted store tests are kept. The seed-66769815 store test now uses Sol's smaller replacement, which fails the number-reuse mutant.
  - **Self-check (heavy tier):** `timeline-model.heavy.test.ts` patches the real sources with the review's mutants (by text anchor), transpiles them into a private copy of the compiled tree, and requires the fast tier's scripts and seeds to catch each one. The unchanged copy must pass. Detection per mutant is below.
  - **Found by the new harness (heavy seed 29276833), a store defect:** a stored head's open events are up to 999 recorded events plus the commit's closing travel and idle events. `resumeRecorder` kept all of them open, so the first event recorded after a reload sealed a 1,001- or 1,002-event chunk. The chunk validator rightly rejects that, and the store became protected, with nothing damaged. A reload now seals a full chunk as recording would.
    - Regressions: a store test (999 open events, closing idle, and travel plus idle; reload, record, commit, reload whole), a fast-tier script, and a self-check mutant that restores the old resume. R1-F1's test reloaded this state but never recorded after the reload.
  - **Harness false positives, fixed in the harness:**
    - a second "stale" repair didn't change the exported records;
    - a failed quota commit legitimately folds stored chunks (the same history), which sums per-hull minutes in another order and lists tied stretches apart.

    Totals are now compared canonically.
- **F3 (P2), a timeline warning suppressed urgent hazards.** A timeline storage warning keeps its own identity (`persistence` channel, `timeline` context), but now ranks 2.5 (1.5 since R3): below hazard captions (3) and game-save warnings (4). When something more urgent takes the central caption, the warning moves to the status line, which already exists, for the rest of its 12-second lifetime, styled as a warning. One that arrives while a higher caption shows goes straight there. A routine confirmation doesn't push it off; it expires or is resolved.
  - Regressions (`timeline-app.test.ts`), using the real `EncounterPresentation`:
    - the chimney-lip ecology caption, before and after a timeline warning;
    - a game-save failure, before and after one;
    - in the app, the live cue: the game stepped at the chimney lip until the ecology module delivers it, in both orders, with a refused timeline commit.

    In every case the hazard or game-save warning is the central caption and the timeline warning is readable on the status line.
- **F4 (P3), a successful repair left its failure visible.** `LiveTimeline` now speaks in structured tones (`error`, `info`, `resolved`). The app maps `resolved` to a timeline-context persistence success, which resolves timeline warnings, central or on the status line, and nothing else.
  - **What resolves:** a repair that commits, a "Note saved", and a new "The play timeline is saved again." after a retryable failure.
  - **What doesn't:** a game save's success still never resolves a timeline warning, and a timeline success never resolves a game-save warning.
  - Regressions: both directions in the presentation, the success after a refused commit with the live cue showing, and a repair in the app that clears its protection warning.

- **R3 (Sol 6.1 xhigh, on `16961a67`), F1 (P2): a timeline warning (2.5) still hid general system errors.** A failed import ("This file is not valid JSON…", "could not be read…", "exceeds the 1 MiB save limit…") was dropped in both arrival orders. The warning now ranks 1.5, below general errors (2), hazards (3) and game-save warnings (4), and "Calls fading" replaces it too. Its own resolution identity is unchanged; when outranked, it waits on the status line.
  - Regressions (`timeline-app.test.ts`): all three real failed-import paths, in both arrival orders. A protected store's warning comes first, or a refused timeline commit comes after the import. The import error is the central caption and the timeline warning is on the status line. A presentation test covers each outranking kind in both orders.

**Mutant detection, at `80b11146`:** the self-check, via the queue on `--machine 4070`. The review's mutants are Sol's `mutations.mjs` patches, unchanged, on the same anchors. Three are new: a read that rewrites identical bytes, R2-F1's validator reverted, and the old resume.

| Mutant | Caught by fast-tier scripts | Fast seeds (24 × 40) | First heavy-range seed (of 300) |
| --- | --- | --- | --- |
| `load_mutates`: a protected read writes an unrelated key, catching a refusal | 60, first "a protected read writes nothing" | 17 | index 0 |
| `load_rewrites_same_bytes`: a protected read rewrites the journal's own bytes | 58, same first | 10 | index 0 |
| F1: repair reuses its numbers, cleanup against the proposed state | 4: "failed repair at write 0–3" (a write before the journal touches a damaged key) | 0 | index 29 |
| F2 version: unsafe version coercion, no totality or depth wrappers | 3: hostile and deep v1, a deep summary field (a load throws) | 5 | index 7 |
| F2 counters: finite-only counters, no partition check | 5: the five head-counter scripts (loads over the damaged journal) | 0 | index 8 |
| F3, shallow `kept` read as already folded | 2: "shallow summary folding" (a commit folded a damaged chunk) | 0 | none |
| F3, shallow `kept` overwritten | the same 2 | 0 | none |
| F4: folds before the journal, quota targets validated lazily | 1: "quota with a damaged previous" (a protected commit changed storage) | 0 | none |
| Seed 66769815: staging ignores absent old-journal names | 1: the missing-named-number repair (a write touches a damaged key) | 0 | none |
| `oracle_saved_protected`: a repair claims success, writing nothing | 36, first "failed repair at write 0" | 13 | index 0 |
| R2-F1 reverted: optional fields and stretch members unchecked | 4: one event field, three summary stretches | 0 | index 10 |
| The old resume (1,001-event chunks after a reload) | 1: "reload of a full open chunk" | 0 | index 270 |

Every mutant is caught by the fast tier, and the unchanged sources pass every script, all 24 fast seeds and all 300 heavy-range seeds. As Sol's R2 table showed, random sequences alone miss several of these within these budgets. The targeted scripts are what kill them, so they stay in the fast tier.

- **Sol's R2 baseline, for comparison** (24 × 30 fast, 2,000 × 40 heavy):
  - survived both tiers: F3 (both variants) and F4;
  - survived the fast tier: F2 counters and the seed-66769815 mutant;
  - the protect sentinel survived too.
- **One fast script that doesn't distinguish:** "quota with damage beyond the first fold" does not catch F4. There, the mutant's first fold frees enough room to commit without touching the damaged chunk, which leaves storage within the contract.

**Evidence, all via the queue on `--machine 4070`** (RTX 4070 Laptop, alickers, a shared desktop host). No local CPU work ran during CW-1's 3090 exclusive series.
- **At `80b11146`:**
  - `npm run typecheck`: passes;
  - focused suites (timeline store, app, recorder, recovery, report and fast model tier, plus presentation, session notices and encounter presentation): 204/204 pass;
  - heavy tier: 2,000 sequences of 40 steps, and the mutant self-check with 300 heavy-range seeds per mutant, in 7 min 25 s.
- **At `f60f6e6c`** (the same code with this handoff):
  - partial gate (`--only fast,build,economy:…`, all six economy steps) passed: fast in 72 s, build in 13 s, each economy step in 1–2 s;
  - playthrough: all 8 scenarios pass, with no blockers and every milestone reload matched.
- **Not run:**
  - the gate's bake step: the terrain bake's sources are unchanged;
  - a browser check of the status line's new warning style (`#system-status.error`, the toast's colours). Its behaviour is tested through the real `EncounterPresentation`; its look is not.

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
  - **Under quota pressure,** the stored copy folds before it fails.
    - **The folding:** on `QuotaExceededError` the one `setItem` is retried with fewer whole sealed chunks: all of them (up to 20), then 10, 5 and 2, plus the open chunk each time. The older ones are folded into summaries in the export only, the same `summarizeChunk` rotation uses. The timeline in memory keeps its full window.
    - **What the stored copy keeps:**
      - in full, at every step: every **note, new thing, death, recovery and system event**, plus the newest 2–20 chunks' events;
      - as exact totals: gathering by item, travel count, minutes, stationary time and time by hull, and idle count and minutes;
      - listed at the default thresholds: empty travel over 90 s and idle stretches of 60 s or more.
    - **What the analysis gives:** new things, gaps, gathering, deaths and notes analyse exactly as the unfolded timeline (tested).
    - **Below the floor** (the open chunk plus 2 sealed) the save says the note or timeline is in memory only, with export.
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
- **Quota fold** (coordinator's addition after the split), at `54bbae19`. Tests:
  - folded exports at 6, 3 and 2 whole chunks keep every note, analyse the same as the unfolded export, are smaller, and leave the live recorder's window untouched;
  - an app quota double set between the half-window and quarter-window export sizes forces two folds: "Note saved" appears, and Continue reloads every note with matching new-thing, gathering and death totals;
  - a limit below the floor says memory only.

  Fast tier on `--machine 4070` (the 3090 is in CW-1's exclusive window): 140 files including the typecheck, exit 0.
- **Checks at `68a2c5bd`:**
  - fast tier, 140 files;
  - focused suites, 281/281 (timeline, app, save, session, presentation, step guard, rows);
  - the queued `creel` playthrough on `--machine 4070` (RTX 4070 Laptop, alickers): complete, no blockers, all 17 milestone reloads matched (`/work/tmp/261023-224012-ea90/pt-sim1a-creel.json`).

**SIM-1a review (Sol 6.1 xhigh, `docs/build/reviews/SIM-1A-SOL-XHIGH.md` on `review/sim-1a`).** Fixed at `ff623989`.
- **F1 (P2):** `resumeRecorder` rebuilds known regions from the one restored partition: every restored summary, including a chunk the re-chunking just rotated, plus the retained events. Regression (Sol's boundary case): a region held only in the chunk resume rotates stays known, and revisiting it after the resume is not a new region.
- **F2 (P3):** the quota predicate also accepts Firefox's legacy code 1014. Regression: both names and both codes fold and retry; a non-quota refusal stops after one write; neither says "Note saved".
- **Checks:** fast tier via the queue on `--machine 4070`, 140 files including the typecheck, exit 0; both regressions ran and passed.

**Performance conventions** (`t3/stew-1-guard-rails` DIRECTION):
- **#1:** the recorder's per-step stock copy uses a reused buffer, and `timelineSince` copies only the new events.
- **#7 and #8: core helpers** (a note for the steward to fold into `CORE-HELPERS.md`): `rowById` and `hasMember` (`src/sim/rows.ts`) are identity-keyed, hit-validated, roster-bounded caches. Each is a `WeakMap` keyed by a state roster array. Every hit is checked against the row (or the length and tail for append-only rosters), so they never trust identity. Each is bounded by its roster's size and goes when the roster goes.
- **#9:** the target numbers are `--class exclusive` on the 3090; the 4070 check is the indicative bench above.

## Compromises and follow-ups

- **SIM-1a writes the whole timeline export on every save** (every 600 active ticks, and on each note), as root does today. This is no regression, but it is the cost SIM-05 named. A full quota now folds the stored copy rather than failing (above), so a long session's notes stay stored until even the folded floor doesn't fit.
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
