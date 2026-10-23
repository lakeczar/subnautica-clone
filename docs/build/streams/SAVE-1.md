# SAVE-1: the shared save library (handoff)

Opus 5.5 high. Branch `t3/save-1-shared-library`, on root `009b244` (CR-1, UX-1, TT-1 and SCHED-1 merged). Head: see the report; each check names the commit it ran on. Story-neutral; `docs/spoilers/*` not read.

## Outcome
After a root merge, **`scripts/saves-export.sh`** plays every playthrough scenario on siltwake-alickers and publishes every save the bot made, read-only, to **`/work/tmp/siltwake-saves/<sha>/`** on factory-worker: SHA_EXPORT_SUMMARY. Tests, reviews, GPU drivers, soaks and MEM-1 start from any of them with one call (`saves.js pick KIND`, or `librarySave(KIND)` in code). Branch scenarios start from the library instead of replaying their parent (TST-21).

Every save is **earned by the bot** through `stepGame` and `executeCommand`; no state is edited. Each records the scenario, phase, branch point, minutes of play and the accepted commands since New Game, and was saved through the real `SaveRepository`, reloaded by a fresh one and matched to its state hash. The manifest records the commit, schema 6 and `expedition.7`.

KINDS_TABLE

Every save is also its own kind, `scenario@label`: all milestones of all eight scenarios (`creel@meridian`, `reverse@canopy`, …).

## How it works
- **Export:** `npm run playthrough -- --export` (`run.ts`, `library.ts`). It refuses a dirty tree. Children write their saves into a staging directory inside the library root. The parent decodes each with this build, re-hashes it, checks each kind's facts, and publishes with one rename only if every scenario completes. A re-export of the same commit must be byte-identical (it is: the bot is deterministic), and a different one is an error. A partial or dirty export may only go to a private `--library-root`.
- **Captures:** `Driver.watchers` run after every tick and command. A scenario's `captures` take the first state where a condition holds (the Creel at ≤ 50% hull, the lost Creel with the diver surfaced, first entry into the Canopy). They are queued, then saved and reloaded through their own fresh slot at the phase end. Play goes on from the live state.
- **Three new scenarios** (`libraryplay.ts`), each a short branch, all in a plain `npm run playthrough`:
  - **`low-air`** from `creel@reef`: the diver swims to the reef ridge and stays there until the game's 20% oxygen warning, which is saved and reloaded. Then straight up and home.
  - **`tour`** from `creel@divide`:
    - The tour Dart is made: the crust is gathered by Dart at the Canopy fins, and the core cell bank and core drive controller are made and fitted.
    - Both reserve cells are recharged into its hold, and it is serviced (`tour-ready`).
    - It flies the pump-house run out and back on its battery alone until the helm dies (`battery-depleted`). Both cells go in, and it flies home and is serviced.
  - **`over-geared`** from `creel@divide`: the 800 m Creel to the outer-crown mooring and home.
- **Picking:** described below.
- **Second worker:** `scripts/saves-export.sh` runs the export through `alickers-job.sh` into the sandbox's own `/work/tmp/siltwake-saves/<sha>`, so jobs there find it too. It tars the directory back and `saves.js import` checks every file's SHA-256 against the manifest. It then decodes every save at that commit on factory-worker and publishes it. Exit 75 or 255 runs it on factory-worker's queue (`--class playthrough`); `--here` goes straight there. SCHED-2b's `--machine any --artifact <dir>` replaces `remote_export` when it lands.

### Compatibility (`pickSave`)
A save suits a commit when four things hold:
- its library commit **is that commit or an ancestor** (`git merge-base --is-ancestor`);
- its **schema and content versions are this build's**, or schema 5 / `expedition.6`, which `bridge5.ts` converts;
- the file matches its manifest's **SHA-256**;
- **this build's own `decodeSave` accepts it**.

The nearest such commit wins. The result says how it matched: `same-commit`, `same-version` or `bridged`, the distance in commits, and `migrated` if additive content was filled in on load.

Everything else is **refused** (exit 3), listing every candidate and why:
- another branch's commit;
- a newer or older schema;
- a damaged file;
- an unknown kind;
- `--exact` at a commit with no export.

If the nearest compatible save fails to load, that is refused too: an older one is never tried in its place.

## Folded findings
- **SAV-03 (end-game sizes):** SIZES_LINE
- **TST-21 (no hidden parent replays):**
  - `--from-library` starts every branch whose parent isn't requested from the library, and each becomes its own `--jobs` group. With it, `low-air`, `tour` and `over-geared` ran together in JOBB_WALL without replaying the Creel run (job at `f1a48de`, library `1333460`).
  - **Consumer adopted:** `docs/build/streams/enc1/derive.mjs`, the ENC-1 3090 driver's save. It replayed three phases headless; it now takes `dart` from the library and flies `dart_out`: 6 s, the same `canopy-head` pose class (charge 98.6%, cells in the pod locker).
  - Planner and earned evidence stay distinct: the library holds only earned saves.
- **TST-23 (a natural battery depletion):** TST23_LINE

## The tour save and 27 km
TOUR_LINE

## Checks
CHECKS

## One adverse case
ADVERSE

## Compromises (each with its root fix and cost)
1. **The export's critical path is serial inside the Creel group.** `creel`, `carrier`, `creel-loss` and the three library branches share one `--jobs` child, because a branch needs its parent's milestone, which only exists in the parent's process. That is about 14 min on alickers; the other groups finish in about 4.
   - **Root fix:** the parent child writes each milestone as it is made, and each branch runs in its own child once its milestone file appears. The critical path becomes `creel` plus the carrier's own phases, about 7.5 min.
   - **Cost:** S/M (`parallel.ts` scheduling, a `--branch-save` child flag, and the parent's shared phase records handed over too).
2. **The tour range is measured on the pump-house laps, not on CW-1's tour.** The laps are 400 m legs of swept water near home at 3–18 m, with a stop at each end. CW-1's plan isn't on root. Drain depends on mode, speed and currents, not depth, so the number transfers, but CW-1's turns and currents are not in it.
   - **Missing:** one lap of CW-1's own plan, flown from `tour-ready`.
   - **Root fix:** once CW-1 merges, a `tour-lap` phase flies its plan from `tour-ready` with ordinary travel and records charge per segment. **Cost:** S.
3. **CW-1's derive still hand-places its craft.** `cw1/derive.mjs`, on CW-1's branch (not root, so not edited here), replays the Creel run and then moves a full Dart to each segment's start.
   - **Root fix:** start from `tour-ready` and fly to the segment starts (and refill at the pod between segments), so CW-1's saves are earned.
   - **Cost:** S for CW-1 after it merges. Until then, CW-1 can at least replace its replay with `librarySave("creel-350")` (its `refits` snapshot).
4. **Cross-commit compatibility trusts the schema and content versions.** A save from an ancestor with the same versions loads, but gameplay changed since then may mean the bot would now reach a different state.
   - **Mitigation:** the result names the distance; `--exact` asks for the exact commit; export at every root merge (distance 0 on root).
   - **Root fix:** none needed beyond exporting every merge. **Cost:** about 15 min of the second worker per merge.

## Missing evidence
- **The ENC-1 3090 play from the library save** was not rerun. It needs the GPU lease, and the queue was in CW-1's exclusive series; the derive was run headless only.
- **No factory-worker fallback export was run end to end.** The queue was busy all session; the `--here` path is the same command `heavy-check` already classes as a playthrough.
- **No browser import of a library save in this stream.** Loading uses the game's own `decodeSave` and repository, exactly as Import and Continue do.

## Known limits
- **The library grows** by about LIB_SIZE per export. Nothing prunes it yet; old commit directories can be removed by hand (`chmod -R u+w` first).
- **A crashed export** (a killed process) can leave a `.staging-*` directory in the root. Readers ignore it, and it's safe to delete.
- **`low-air` overstays 6 m down** on the reef ridge: a deliberate overstay, like `creel-loss`'s greedy hull, not a deep-water emergency.
- **The depletion run's way home is short.** The battery happened to die about 10 m from the cradle mouth, near the end of a lap, so the run proves the cells restore a dead helm, not a long limp home.
- **Finding for UI/survival (not changed here):** the only warning before a battery dies is a sound cue every 5 s below 25% (`survival.ts`). There is no hazard notice, unlike oxygen at 35, 20 and 10%.
