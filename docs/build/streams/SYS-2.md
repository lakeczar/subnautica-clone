# SYS-2 bases and knowledge: interface and handoff

Opus 5.5 high · branch `feat/sys-2-bases-knowledge` from `feat/siltwake-first-expedition` at `7519cfb` · new files only, story-neutral. These are rules, data and tests ready to compose. There is no final UI and no wiring.

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
| Timeline | — | `src/sim/timeline/`: `recorder.ts`, `report.ts`; `scripts/timeline-report.mjs` |

Proposed rows for the registry are in `content/systems/items.ts`: `SYS2_ITEMS`, `SYS2_BLUEPRINTS`, `SYS2_RECIPES`, `SYS2_SOURCES` (seed patches) and `SYS2_TECH_RECORDS`.

## Rules in one breath
- **Kits and tiers.** The basic kit is early: pod bench, reef and island materials. It gives a charger, a 24 CU locker and one socket. Standard gives 3 sockets and a 32 CU locker, and its in-place upgrade needs conductive crust. Advanced gives 5 sockets and a 48 CU locker, and its upgrade needs pressure ceramic.
- **Deploy.** A deploy needs a ledge, a cave floor, or firm ground within 30 m of a vent. It also needs a slope of at most 22°, a clear footprint, the diver's reach, and 40 m from any host.
- **Power** comes from the location: thermal within 25 m of a vent, solar above 30 m depth when uncovered, cells otherwise.
- **Limit:** 3 active outposts, plus `limitBonus` from SYS-1.
- **Pack and redeploy.** Packing spends the tier's anchor material: 1–2 units, paid from the outpost locker first, then the destination. It moves everything to one destination: the kit under its original item ID, every module, and the whole locker. The kit remembers its layout, and a redeploy refits the modules you carry.
- **In-progress work** is keyed to the module item that does it: a decode to its decoder, a crop to its planter. Packing or removing the module pauses the work, which travels with the module. It resumes wherever the module is socketed next, and nothing is copied.
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
  - **Harvest** returns the cutting, and by default replants it.
- **Survey.** A material is known once any of its sources is in `knowledge.scans`. The station and the ping then mark every source of that material in range, including unvisited ones.
  - **What each mark shows:** ready stock, reserve, and `regrown`/`regrowing` (with time to the next regrowth), `finite` or `exhausted`.
  - **Ranges:** station tiers 150/300/500/800 m, chosen by SYS-1's tier; the ping reaches 35 m.
- **Beacons and chart.**
  - **Player beacons:** placing one uses a carried `nav_beacon` item. Names are 1–24 characters; at most 16 can be placed.
  - **Derived beacons:** outposts and known stops appear automatically.
  - **Switches:** beacons can be turned off one by one or by category.
  - **Chart cells** are 50 m. Visited cells are stored. Scanned sources, found sites and decoded areas are derived. Live position is an option, set by SYS-1's upgrade.

## Adverse case (tested)
`tests/systems-outposts.test.ts`, "ADVERSE". A standard outpost runs a decode at 55% and a ribbon-fan crop at 23%, and its locker holds a reserve cell, alloy and meals.
- **Missing membrane:** the pack is refused with "Bring 1 × Flexible membrane … Nothing packed". State is byte-identical.
- **Not enough room:** refused with the exact numbers: "need 22 CU … it has 16 free". State is byte-identical.
- **With room:** the preview lists the exact loss lines, each locker stack, both modules, and one sentence per job saying it pauses and travels with its module.
- **After packing:** the conservation ledger (inventory plus installed modules plus kits) equals the before-totals minus exactly the shown loss. Every item ID is unique and in one place, and no running work advances.
- **Redeploy at a vent:** power is thermal and both modules are refitted. The decode completes, and the crop grows and is harvested.

## Proposed save fields (one schema change)
- **`GameState.systems: SystemsState`** (`sim/systems/state.ts`), holding `outposts`, `packed`, `sockets`, `found`, `decoded`, `decodes`, `planters`, `beacons`, `beaconsOff`, `categoriesOff` and `chart`. Start it with `createSystems()` and check its shape with `validSystems()`.
- **Composed validator:** cross-check `sockets[].itemId`, `packed[].layout`, `decodes[].moduleId` and `planters[].moduleId` against the inventory:
  - an installed module is not in `inventory.items`;
  - a loose module is;
  - a job's module exists in exactly one of the two.
- **Containers:**
  - outpost lockers `${outpostId}_locker`, owned by the outpost;
  - locker-module containers `${itemId}_locker`, owned by the item, which outlive installs like the cabin locker does.
- **`ItemKind` union:** add `SYS2_ITEMS` keys. `addItem` stacks only materials today; seeds, `nav_beacon` and `field_salve` should stack too (`stackable()` in `items.ts`). Cells start charged (`reserve_cell` and `bio_cell`).
- **Timeline:** not in the save. Persist it with `localStorage[TIMELINE_STORAGE_KEY]` (`siltwake.timeline.v1`) through `exportTimelineText` and `resumeRecorder`.

## How to compose
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
  - after install or remove, merge `carrierOccupants(sys, id)` into `docking.sockets` so the interior solids stay in step;
  - proposed: add `"decoder"` to a bridge socket's `accepts` (until then the decoder uses the fabrication benches' `sample_analyser` slot).
  - The fixture's two seeded occupants have no item instance and read as occupied.
- **`app.ts`:**
  - create the recorder with `regionAt` (S1's `WorldMap.regionAt` or `regionAtPoint`);
  - after each step, call `observe(rec, state, { input, waiting })`, where `waiting` is `["decode"]` or `["growth"]` while those run, and `recordSystemsEvents`;
  - a feedback key (proposed `N`) opens a one-line note: `addNote(rec, state, text, new Date().toISOString())`;
  - an export button saves `exportTimelineText` as a file.
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
- **`npm test`** (typecheck, test build, fast tier): **810/810 pass**. SYS-2 adds 56 tests in `tests/systems-*.test.ts` and `tests/timeline-*.test.ts`.
- **`npx tsc --noEmit -p tools/journal-lab.tsconfig.json`** is clean. The lab script was bundled with esbuild and run in Node against a DOM stub; it builds all 6 tabs, the chart and the pack preview.
- **Heavy tier:** not run. No SYS-2 file reaches Babylon, and the fast tier's import guard confirms that for every new test.
- **Browser:** no run, as briefed.
- **`timeline-report.mjs`:** run end to end by a test. It needs Node ≥ 22.18 for type stripping (engines say ≥ 22.12).
