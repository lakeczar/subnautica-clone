# SYS-2 bases and knowledge: interface and handoff

Opus 5.5 high · branch `feat/sys-2-bases-knowledge` from `feat/siltwake-first-expedition` at `7519cfb` · new files only, story-neutral. These are rules, data and tests ready to compose. There is no final UI and no wiring. Revised for [Sol R1](../reviews/SYS-2-SOL-XHIGH-R1.md) (F1–F6 and both P3s) and [Sol R2](../reviews/SYS-2-SOL-XHIGH-R2.md) (R2-F1, R2-F2); see the fix tables below.

## What exists
| Area | Content (`src/content/systems/`) | Rules (`src/sim/systems/`) |
| --- | --- | --- |
| Socket hosts | `hosts.ts`: 7 modules, 3 outpost tiers, siting thresholds, pod and restored stops, Hearthline occupant map | `hosts.ts`: one `SocketHost` view for pod, stops, outposts and carrier; `installModule`, `removeModule`, `carrierOccupants`, `locationPower` |
| Field outposts | kits in `items.ts` | `outposts.ts`: `deployPreview`/`deployOutpost`, `packPreview`/`packOutpost`, `upgradePreview`/`upgradeOutpost`, `OutpostSiteQuery` seam |
| Decoder | `decodes.ts`: demo lost sites and decodables, `DEMO_MAIN_PATH` | `decoder.ts`: `discoverSite`, `startDecode`, `advanceDecodes`, `recordReadable`, `decoderPlanProblems` |
| Cultivation | `cultivation.ts`: 5 seeds | `cultivation.ts`: `plant`, `advanceGrowth`, `harvestPreview`/`harvest` |
| Survey | `navigation.ts`: tier ranges, ping | `survey.ts`: `surveyQuery`, `stationSurvey`, `handheldPing` (pure) |
| Beacons, chart | `navigation.ts` | `navigation.ts`: place, rename, collect, switch beacons; `visitChart`, `chartView` |
| Journal | — | `journal.ts`: `buildJournal`, `searchJournal` |
| Per step | — | `step.ts`: `advanceSystems` (chart, decodes, growth) |
| Identity | — | `instances.ts`: `retainsIdentity`, `incapacitateKeepingInstances`, `instanceProblems` |
| Timeline | — | `src/sim/timeline/`: `recorder.ts`, `report.ts`; `scripts/timeline-report.mjs` |

Proposed rows for the registry are in `content/systems/items.ts`: `SYS2_ITEMS`, `SYS2_BLUEPRINTS`, `SYS2_RECIPES`, `SYS2_SOURCES` (seed patches) and `SYS2_TECH_RECORDS`.

## Rules in one breath
- **Kits and tiers.** The basic kit is early: pod bench, reef and island materials. It gives a charger, a 24 CU locker and one socket. Standard gives 3 sockets and a 32 CU locker, and its in-place upgrade needs conductive crust. Advanced gives 5 sockets and a 48 CU locker, and its upgrade needs pressure ceramic.
- **Deploy.** A deploy needs a ledge, a cave floor, or firm ground within 30 m of a vent. It also needs a slope of at most 22°, a clear footprint, the diver's reach, and 40 m from any host.
- **Power** comes from the location: thermal within 25 m of a vent, solar above 30 m depth when uncovered, cells otherwise.
- **Limit:** 3 active outposts, plus `limitBonus` from SYS-1.
- **Pack and redeploy.** Packing spends the tier's anchor material: 1–2 units, paid from the outpost locker first, then the destination. It moves everything to one destination: the kit under its original item ID, every module, and the whole locker. The kit remembers its layout, and a redeploy refits the modules you carry.
- **In-progress work** is keyed to the module item that does it: a decode to its decoder, a crop to its planter. Packing or removing the module pauses the work, which travels with the module. It resumes wherever the module is socketed next, and nothing is copied.
- **Identity items** (socket modules and outpost kits) are never re-created under a new ID. They stay with the diver through incapacity, like the Dart trim and the Creel mounts. Installing a module removes it from every packed layout, so at most one place ever claims it.
- **Restored stops** are fixed hosts with 3 sockets and one unique service text. Their sockets work only once the facility is restored. The pod's 2 sockets work from the start.
- **Decoder.**
  - **Finding:** visiting a site finds its decodables. Their gated records stay unreadable until decoded.
  - **Timing:** decodes take 3, 6, 10 or 15 minutes of play.
  - **Power and range:** a decoder needs power. Without a relay on its host, it works only within 250 m of the player.
  - **Results:** a completed decode grants plans and adds decode beacons for revealed sites, landmarks and hints.
  - **Main-path check:** `decoderPlanProblems(path)` checks that `bp_decoder` is granted on the main path, by a step that needs no decode, before any step that does.
- **Cultivation.**
  - **Crops:** staple cups (meal), salve frond (`field_salve`, medicine), ribbon fan (flex membrane), lumen bulb (`bio_cell`, charge 100) and pale crust (conductive crust, `sampling: "specimen"` for the Hush bay).
  - **Growth** takes 6–10 minutes of play, only while the planter is socketed.
  - **Harvest** returns the cutting, and by default replants it. A returned cutting must fit the same destination as the produce, so a pantry refuses it and nothing changes.
- **Survey.** A material is known once any of its sources is in `knowledge.scans`. The station and the ping then mark every source of that material in range, including unvisited ones.
  - **What each mark shows:** ready stock, reserve, and `regrown`/`regrowing` (with time to the next regrowth), `finite` or `exhausted`.
  - **Ranges:** station tiers 150/300/500/800 m, chosen by SYS-1's tier; the ping reaches 35 m.
- **Beacons and chart.**
  - **Player beacons:** placing one uses a carried `nav_beacon` item. Names are 1–24 characters; at most 16 can be placed.
  - **Derived beacons:** outposts and known stops appear automatically.
  - **Switches:** beacons can be turned off one by one or by category.
  - **Chart cells** are 50 m. Visited cells are stored. Scanned sources, found sites and decoded areas are derived. Live position is an option, set by SYS-1's upgrade.

## Adverse case (tested)
`tests/systems-outposts.test.ts`, "ADVERSE". A standard outpost runs a decode at 55% and a ribbon-fan crop at 23%. Its locker is full, 32 of 32 CU: a reserve cell, alloy and 24 meals.
- **Missing membrane:** the pack is refused with "Bring 1 × Flexible membrane … Nothing packed". State is byte-identical.
- **Not enough room:** refused with the exact numbers: "need 44 CU … it has 16 free". State is byte-identical.
- **With room:** the preview lists the exact loss lines, each locker stack, both modules, and one sentence per job saying it pauses and travels with its module.
- **After packing:** the conservation ledger (inventory plus installed modules plus kits) equals the before-totals minus exactly the shown loss. Every item ID is unique and in one place, and no running work advances.
- **Redeploy at a vent:** power is thermal and both modules are refitted. The decode completes, and the crop grows and is harvested.

## Proposed save fields (one schema change)
- **`GameState.systems: SystemsState`** (`sim/systems/state.ts`), holding `outposts`, `packed`, `sockets`, `found`, `decoded`, `decodes`, `planters`, `beacons`, `beaconsOff`, `categoriesOff` and `chart`. Start it with `createSystems()` and check its shape with `validSystems()`.
- **`validSystems` row invariants** (already enforced):
  - outpost IDs and packed-kit IDs are all distinct;
  - a packed layout lists each socket and each module once, and only sockets `s0`… below its tier's count;
  - a module is remembered by at most one packed layout, and never while installed;
  - every socket entry names a real socket of a deployed outpost or a fixed host (`s0`… below its count), or a Hearthline system socket whose `accepts` takes that entry's module. Furniture-only sockets never hold a module.
- **Composed validator:** also call `instanceProblems(state, state.systems)` and require it to be empty. It checks that:
  - no item ID appears twice;
  - an installed module or a deployed outpost is not also an inventory item;
  - each packed kit has a matching kit item;
  - each decode or crop references a decoder or planter that exists exactly once, installed or loose;
  - every installed entry is serviceable where it sits (`socketProblems`, R2-F2): its host resolves through `hostById`, the socket is one that host exposes to modules, the item kind is a module that socket accepts, and on the Hearthline `docking.sockets` carries the matching occupant. A module that fails any of these would be out of the inventory and unremovable.
  - **Existence, not availability:** a disabled carrier or an unrestored stop still resolves, so its modules stay valid. They simply can't be removed until the host works again.
- **Containers:**
  - outpost lockers `${outpostId}_locker`, owned by the outpost;
  - locker-module containers `${itemId}_locker`, owned by the item, which outlive installs like the cabin locker does.
- **`ItemKind` union:** add `SYS2_ITEMS` keys. `addItem` stacks only materials today; seeds, `nav_beacon` and `field_salve` should stack too (`stackable()` in `items.ts`). Cells start charged (`reserve_cell` and `bio_cell`).
- **Timeline:** not in the save. Persist it with `localStorage[TIMELINE_STORAGE_KEY]` (`siltwake.timeline.v1`) through `exportTimelineText` and `resumeRecorder`.

## How to compose
- **Transaction boundary.** These helpers mutate `GameState` and `SystemsState` in place and do not roll back on an exception. Keep `systems` inside the cloned `GameState` that `executeCommand`/`stepGame` already work on, so a throw mid-command leaves the original untouched (Sol R1 verified this). Each mutation runs its own preview first, so ordinary refusals change nothing.
- **`recovery.ts` (F1):** add `&& !retainsIdentity(i.kind)` to the cargo filter in `incapacitate`, beside the trim, rack and cabin exclusions. Then modules and kits stay in the diver hold with their IDs, and ordinary cargo (seeds and beacons included) still caches. Until then, `incapacitateKeepingInstances` wraps the real rule with the same result; the death → cache → retrieval → resume path is tested through it. Salvage already keeps item IDs (it moves `containerId`), and whole-stack transfers do too.
- **`registry.ts`:**
  - merge `SYS2_ITEMS` into `ITEMS`, `SYS2_RECIPES` into `RECIPES`, and `SYS2_SOURCES` into `SOURCES`;
  - widen the `SourceDefinition.item` union with the seeds;
  - add `SYS2_TECH_RECORDS` to `TECH_RECORDS`, and `SYS2_BLUEPRINTS` keys to `BlueprintId`/`BLUEPRINTS` (labels into `FUTURE_BLUEPRINTS` or a plan-label map).
  - Then `sim/systems/ledger.ts`'s `cuOf`/`addStack` can fall back to `inventory.ts`.
- **`step.ts`:**
  - call `advanceSystems(s, s.systems, ctx)` once per active step, next to `advanceRenewal`;
  - surface its `SystemsEvent`s as notices or sounds;
  - add commands that call the rules directly: `deploy-outpost`, `pack-outpost`, `upgrade-outpost`, `install-host-module`, `remove-host-module`, `start-decode`, `plant`, `harvest`, `place-beacon`, `collect-beacon`, `beacon-switch` and `ping`.
  - Previews are read-only and are what the panel shows.
- **`progression.ts`:**
  - add interactions for deployed outposts (`listHosts`), lost sites (`LOST_SITES`, calling `discoverSite` on first approach) and player beacons;
  - give gated records a "decode to read" refusal through `recordReadable`.
- **World query:** build an `OutpostSiteQuery` from terrain support height and slope, the W1 cave kit (`cave_floor`, `covered`), hazards or vents (`ventDistance`) and `hullClearance`.
- **SYS-1 seams:**
  - `HostPower` replaces `locationPower` (power and drain);
  - `decoderSpeed(moduleId)` (decoder upgrade), `limitBonus` (outpost limit), the survey `tier`, and `chartView(..., { livePosition })`;
  - `seedCollectable(seed, specimenBay)` (Hush specimen bay);
  - `bio_cell` is produced here, and SYS-1 defines what it powers.
- **Carrier:**
  - `carrierHost()` exposes HEARTHLINE system sockets;
  - install and remove write straight through to `docking.sockets` (F3): an install sets the slot's occupant name and a removal clears exactly the slot it filled, so the interior solids follow at once. No merge step is needed; `carrierOccupants` is a read-only view, and merging it is idempotent;
  - proposed: add `"decoder"` to a bridge socket's `accepts` (until then the decoder uses the fabrication benches' `sample_analyser` slot).
  - Seeded fittings (the fixture's planter and survey occupants) have no item instance. They stay occupied, refuse installs, and can't be removed through SYS-2.
- **`app.ts`:**
  - create the recorder with `regionAt` (S1's `WorldMap.regionAt` or `regionAtPoint`);
  - after each step, call `observe(rec, state, { input, waiting })`, where `waiting` is `["decode"]` or `["growth"]` while those run, and `recordSystemsEvents`;
  - a feedback key (proposed `N`) opens a one-line note: `addNote(rec, state, text, new Date().toISOString())`;
  - an export button saves `exportTimelineText` as a file.
  - **Travel** (F5) counts only steps where the piloted craft moves at 0.5 m/s or faster. Each travel event is one stretch of motion between points of interest (new things, gathers, sources), with its stationary helm seconds alongside. Time at a still helm is ordinary play, and the report shows it separately.
  - **Deaths and recovery** (F6, R2-F1): each death records what it left behind as keys, `cache:<id>` for the cache it created and `loss:<vehicleId>` for any craft loss no other open death claims. Every open death is kept with its own play timestamp, and it closes when all its keys resolve: its cache is empty or gone, and its loss entry is gone. A towed craft therefore counts as recovered once it's patched or salvaged at the bench. The recovery event carries `of` (the death's tick) and the same keys. `resumeRecorder` rebuilds the open deaths from death events with no matching recovery, and their resolution is read from the game state, so any number of outstanding deaths survive a reload. Recovery time is play time, so idle is excluded. A death that left nothing behind closes at once as `nothing-lost`; the report counts it apart and keeps it out of the recovery times.
  - Nothing is sent anywhere, and a test enforces this.
- **UI:** render `buildJournal(s, s.systems, { creatures, cycles })`. The notebook tab carries S5's own `NotebookView`, so `ui/storyNotebook.ts` can keep rendering it.
  - **Slots:** the ecology owner fills `creatures`, and the cycles owner fills `cycles`.
  - **Lab:** `tools/journal-lab.html` mocks the tabs, search, a chart and the outpost pack preview. Run `npx vite --port 5199 --strictPort --host 127.0.0.1`, then open `/tools/journal-lab.html`.

## Stubbed or placeholder
- **Lost sites, decodables and main path:** all `demo_*` rows are placeholders. The lore owner supplies real sites and texts, and the coordinator feeds P1's route into `decoderPlanProblems`.
- **Power:** `locationPower` is a stand-in. A cell-powered host runs while any charged cell sits in its locker, with no drain modelled.
- **Not wired:** the charger and the small fabricator are listed as services (`hostServices`), but charging and bench recipes at outposts are not wired.
- **Proposed numbers:** `field_salve` has no healing effect yet. Seed patch positions and every balance number are proposals.
- **Interactions:** no world placement or interaction wiring exists, and no beacon or outpost art.

## Checks
- **`npm test`** (typecheck, test build, fast tier): **825/825 pass**. SYS-2 adds 71 tests in `tests/systems-*.test.ts` and `tests/timeline-*.test.ts` (56 at R1, 12 for its fixes, 3 for R2's).
- **`npx tsc --noEmit -p tools/journal-lab.tsconfig.json`** is clean. The lab script was bundled with esbuild and run in Node against a DOM stub; it builds all 6 tabs, the chart and the pack preview.
- **Heavy tier:** not run. No SYS-2 file reaches Babylon, and the fast tier's import guard confirms that for every new test.
- **Browser:** no run, as briefed.
- **`timeline-report.mjs`:** run end to end by a test. It needs type stripping (Node ≥ 22.18 or 23.6, while `package.json` engines say ≥ 22.12). The script checks `process.features.typescript` and exits 2 with a plain message otherwise. At composition, raise `engines` to `>=22.18.0` or document `--experimental-strip-types`.
- **Sol R1 probes** (`probes.mjs`, each block run separately): every finding's block now fails its bug-reproducing assertion, except F1's. That block calls the unchanged `recovery.incapacitate` directly, which needs the one-line composed filter above.
- **Sol R2 probes** (`r2/new-probes.mjs`, output redirected to `/work/tmp`): **9/9 pass**, including the four that reproduced R2-F1 and R2-F2. In `r2/r1-adapted-probes.mjs`, every block passes except the last. That block fakes a death with `failures++` and no cache or loss, then expects a timed recovery on `rescues++`. Under the R2-F1 rule such a death closes at once as `nothing-lost`, so `unrecovered` is 0 as asserted, but it has no recovery time. This is intended: there was nothing to recover.

## R1 fixes
| Finding | Fix | Test |
| --- | --- | --- |
| F1 recovery identity | `instances.ts`: modules and kits stay with the diver; adapter now, one-line filter at composition; `instanceProblems` | `systems-recovery`: unadapted rule orphans the job; death → cache → transfer back → reinstall → decode completes; packed kit survives |
| F2 returned cutting | harvest checks the destination accepts produce and cutting before changing anything | `systems-cultivation`: pantry refusal, byte-identical; replant puts meals alone in the pantry |
| F3 carrier occupants | install and remove write through to `docking.sockets`; seeded fittings untouched | `systems-content`: install → sync → remove → sync → reinstall, with interior solids; seeded planter stays |
| F4 duplicate layouts | `validSystems` invariants; `deployPreview` refuses an inconsistent layout before mutating; install drops the module from packed layouts | `systems-outposts`: four tampered imports refused byte-identical; valid refit installs exactly once |
| F5 stationary helm | travel time from craft motion only; stretches split at points of interest; stationary time reported apart | `timeline-recorder`: still helm, leg with a 70 s stop, leg split by a discovery |
| F6 reload death | resume restores the open death | `timeline-recorder`: death → export/reload → idle → rescue |
| P3 | Node guard in the script; adverse locker really full | — |

## R2 fixes
| Finding | Fix | Test |
| --- | --- | --- |
| R2-F1 two outstanding deaths | each open death is kept with its own keys (`cache:`, `loss:`) and play time; it closes when all its keys resolve; resume rebuilds them from unmatched death events; nothing-lost deaths close at once | `timeline-recorder`: two real caches, recover the second, export/reload, idle, recover the first, with both times exact; a partly emptied cache keeps its death open; nothing-lost |
| R2-F2 stranded carrier modules | `socketProblems` in `instanceProblems` resolves host, module socket, accepted kind and carrier occupant; `validSystems` also rejects furniture-only or incompatible Hearthline sockets | `systems-content`: missing carrier, furniture-only socket, planter on a fabrication bench, non-module kind, occupant mismatch; a disabled carrier stays valid |
