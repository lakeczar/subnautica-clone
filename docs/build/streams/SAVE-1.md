# SAVE-1: the shared save library (handoff)

Opus 5.5 high. Branch `t3/save-1-shared-library`, on root `009b244` (CR-1, UX-1, TT-1 and SCHED-1 merged). Head: see the report; each check names the commit it ran on. Story-neutral; `docs/spoilers/*` not read.

## Outcome
After a root merge, **`scripts/saves-export.sh`** plays every playthrough scenario on siltwake-alickers and publishes every save the bot made, read-only, to **`/work/tmp/siltwake-saves/<sha>/`** on factory-worker: the export at the branch head `1d4d2c3` (after the SCHED-2a root merge) holds 73 saves, about 2.5 MB. So does a bootstrap export at `0a464bc`. Tests, reviews, GPU drivers, soaks and MEM-1 start from any of them with one call (`saves.js pick KIND`, or `librarySave(KIND)` in code). Branch scenarios start from the library instead of replaying their parent (TST-21).

Every save is **earned by the bot** through `stepGame` and `executeCommand`; no state is edited. Each records the scenario, phase, branch point, minutes of play and the accepted commands since New Game, and was saved through the real `SaveRepository`, reloaded by a fresh one and matched to its state hash. The manifest records the commit, schema 6 and `expedition.7`.

| Kind | Save | Bytes | Earned in (play, commands) | State, from the manifest |
| --- | --- | ---: | --- | --- |
| `pod-start` | `creel@opening` | 19 KiB | 0 min, 4 | ashore at the pod |
| `dart` | `creel@isles` | 24 KiB | 3.7 min, 60 | 180 m Dart at the workshop |
| `creel-basin-frames` | `creel@basin-frames` | 31 KiB | 35.1 min, 216 | creel-loss branches here |
| `creel-350` | `creel@refits` | 31 KiB | 41.3 min, 240 | the carrier route branches here |
| `rift-450` | `creel@rift` | 34 KiB | 58.2 min, 336 | at the forward outpost |
| `creel-800` | `creel@divide` | 35 KiB | 78.9 min, 387 | home; tour and over-geared branch here |
| `carrier-fitout` | `carrier@hearthline` | 36 KiB | 91.7 min, 403 | |
| `pre-ending` | `creel@works` | 39 KiB | 179.6 min, 502 | |
| `pre-ending-carrier` | `carrier@works` | 44 KiB | 326.9 min, 825 | |
| `low-air` | `low-air@low-air` | 22 KiB | 5.1 min, 44 | swimming 6 m down at the reef, oxygen 20%, suit air |
| `hull-damaged` | `creel-loss@hull-damaged` (capture) | 32 KiB | 38.7 min, 218 | piloting the 240 m Creel at 257 m, hull 50%, charge 76% |
| `craft-lost` | `creel-loss@craft-lost` (capture) | 32 KiB | 40.4 min, 221 | Creel disabled below; the diver at the surface on suit air, oxygen 49% |
| `battery-depleted` | `tour@depleted` | 36 KiB | 129.8 min, 420 | piloting the tour Dart at 0% charge, on emergency air |
| `canopy-min-gear` | `creel@canopy-entry` (capture) | 25 KiB | 4.1 min, 61 | entering the Canopy in the 180 m Dart, 150 m suit |
| `canopy-over-geared` | `over-geared@canopy-entry` (capture) | 35 KiB | 79.5 min, 388 | entering the Canopy in the 800 m Creel, 800 m suit |
| `tour-ready` | `tour@tour-fit` | 35 KiB | 83.5 min, 418 | at the cradle, piloting the 350 m Dart: full, both upgrades, two full cells aboard |

Every save is also its own kind, `scenario@label`: all milestones of all eight scenarios (`creel@meridian`, `reverse@canopy`, …).

## How it works
- **Export:** `scripts/saves-export.sh` runs `run.js --export --commit SHA` (`run.ts`, `library.ts`) from an archive build of the pinned SHA (R1 fix, below). Children write their saves into a staging directory inside the library root. The parent decodes each with this build, re-hashes it, checks each kind's facts, and publishes with one rename only if every scenario completes. A re-export of the same commit must be byte-identical, and a different one is an error. The bot is deterministic: see Checks. A partial or dirty export may only go to a private `--library-root`.
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
- **SAV-03 (end-game sizes):** the largest save of the whole campaign is `carrier@works`, **45,466 bytes: 4.3% of the 1 MiB import limit**. The largest journal record seen after a commit (current plus previous) is 102,169 bytes. With all three generations at the largest save, as the journal escapes them, it would be 154,071 bytes: 1.8% of the 8 MiB journal ceiling and about 3% of a 5 M-character localStorage quota (the quota is documented, not measured here). Sizes grow about 1 KiB per 10 minutes of play. **No compaction is needed.** Each export's manifest records these numbers, so growth stays visible.
- **TST-21 (no hidden parent replays):**
  - `--from-library` starts every branch whose parent isn't requested from the library, and each becomes its own `--jobs` group. With it, `low-air`, `tour` and `over-geared` ran together in under a minute each (`tour` 40 s, `over-geared` 8 s, `low-air` 2 s) without replaying the Creel run (job at `f1a48de`, library `1333460`).
  - **Consumer adopted:** `docs/build/streams/enc1/derive.mjs`, the ENC-1 3090 driver's save. It replayed three phases headless; it now takes `dart` from the library and flies `dart_out`: 6 s, the same `canopy-head` pose class (charge 98.6%, cells in the pod locker).
  - Planner and earned evidence stay distinct: the library holds only earned saves.
- **TST-23 (a natural battery depletion):** the `tour` scenario's `depleted` phase:
  - **Ordinary drain:** the tour Dart flies the pump-house laps at cruise, lamp lit, with no reserve cell, for 46 min of play and 21.3 km (26 laps) until the charge is 0.
  - **Warning:** 139 power warning cues, the first at 25%.
  - **Disable:** the helm is dead (speed 0) and the cabin is on emergency air. That state is the `battery-depleted` milestone, saved and reloaded to its identical hash, and play continues from the reload.
  - **Recovery:** `power-recovery` inserts both reserve cells (+17.5% each into the doubled bank), flies home on them and is serviced to 100%.
  - **Where it runs:** in every `npm run playthrough`. That covers PT-0 item 7's "natural battery depletion from SAVE-1's adverse set".

## The tour save and 27 km
Measured headless in the `tour` scenario (`manifest.measurements.tour`, at `0a464bc`):
- **The Dart:** the 350 m Dart with the core cell bank (capacity ×2) and core drive controller (drain ×0.65), its two sockets. The materials were earned: crust from the Canopy fins by Dart, glass at the reef, cores from the campaign's Rift harvest.
- **Range:** **21.30 km on a full battery** at cruise with the lamp lit (2,777 s). Each reserve cell adds 17.5%, so **with both cells about 28.8 km**: enough for CW-1's 27.2 km lap, with a 1.5 km (6%) margin.
- **Boost is out:** boost drains ×1.7 at 11 m/s against 8, which is about 0.81× the range, so a boost lap doesn't fit.
- **Oxygen:** a powered Dart supplies air, so oxygen stays at 100% throughout.
- **How the tour uses it:** CW-1's tour can start from `tour-ready` at the cradle and insert a cell (the `reserve` command) when the charge runs low. The stock Dart (7.2 km per charge, 2.5 km per cell) could not do a lap without a service stop.

## Checks
- **Fast:** `npm test` passes 1,328 of 1,328 at `0a464bc`. After the root merge, `save-library`, `playthrough` and `playthrough-parallel` pass 22 of 22 at the head. `tests/save-library.test.ts` takes 0.9 s CPU and covers:
  - picking the nearest ancestor, with provenance;
  - every refusal: unknown kind, `--exact`, outside the history, a newer schema, a damaged file (no fallback to an older commit) and a damaged import;
  - an identical re-export versus a different one;
  - a kind refused on its facts, and on its hash;
  - each adverse, gear and tour predicate against New Game and against its own state;
  - a capture's save, reload, hash and command count;
  - a branch blocked with the library's reason.
- **Typecheck:** `npm run typecheck` is clean.
- **Full export on siltwake-alickers** (`scripts/saves-export.sh`, tested `0a464bc`, exit 0):
  - 8 of 8 scenarios complete with no blockers, every milestone and capture reload matched;
  - 73 saves published and imported to factory-worker;
  - every save then decoded by a build of `0a464bc` (compiled from `git archive`) to its recorded hash, with every kind's facts holding.
- **At the head, after merging root `a536775` (SCHED-2a):** `scripts/saves-export.sh` at `1d4d2c3`, exit 0. All 8 scenarios complete, 73 saves, imported and decoded on factory-worker by the head's own build; `saves.js verify HEAD` is clean. **All 73 are byte-identical to the `0a464bc` export.** `pick tour-ready` → `1d4d2c3`, same-commit.
- **Deterministic:** all 66 saves that the partial export at `1333460` also made are byte-identical (SHA-256) in the `0a464bc` export: two runs, two commits, the same bytes.
- **TST-21 path:** `--from-library` at `f1a48de` and `062d2b6` ran `low-air`, `tour` and `over-geared` from the `1333460` library.
- **CLI at the head:** `saves.js pick tour-ready` → `0a464bc` (same-version, 40 commits back, after the root merge). `pick nope` → exit 3, listing the kinds. `pick dart --exact` → exit 3, "not the exact commit asked for".
- **ENC-1 derive** from the library: 6 s; `canopy-head` written to a private `OUT`.

## One adverse case
The first `tour` run, at `f1a48de`, flew the depletion laps with no meals aboard. At 38 min of play the diver starved into an incapacity, and the helper relocated them. The stall catch then read a null craft and the run **blocked as a harness error**; the export would have published nothing.
- **Fix:** the tour now provisions three meals and eats between laps.
- **Tighter catch:** it accepts only a travel stall with the piloted craft at 0% charge, and rethrows anything else.

The library's own refusals are covered in the fast tests: a damaged nearest save is refused outright, never answered by an older one.

## Compromises (each with its root fix and cost)
1. **The export's critical path is serial inside the Creel group.** `creel`, `carrier`, `creel-loss` and the three library branches share one `--jobs` child, because a branch needs its parent's milestone, which only exists in the parent's process. That is 826 s (about 14 min) on alickers at `0a464bc`; the other groups take about 4 min.
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
- **The library grows** by about 2.5 MB per export. Nothing prunes it yet; old commit directories can be removed by hand (`chmod -R u+w` first).
- **A crashed export** (a killed process) can leave a `.staging-*` directory in the root. Readers ignore it, and it's safe to delete.
- **`low-air` overstays 6 m down** on the reef ridge: a deliberate overstay, like `creel-loss`'s greedy hull, not a deep-water emergency.
- **The depletion run's way home is short.** The battery happened to die about 10 m from the cradle mouth, near the end of a lap, so the run proves the cells restore a dead helm, not a long limp home.
- **Finding for UI/survival (not changed here):** the only warning before a battery dies is a sound cue every 5 s below 25% (`survival.ts`). There is no hazard notice, unlike oxygen at 35, 20 and 10%.
