# Campaign acquisition curve and living-source renewal (SPACE-1)

Claude Opus 5.5 / high, 2026-10-19. Parent `dae17fcf38ae2e08cb778ebb4c0a04df92eeb072`, production `35c2d22`. Brief: [SPACE-PROGRESSION-OPUS](../tasks/SPACE-PROGRESSION-OPUS.md). Evidence and checks: [SPACE-1-OPUS](../evidence/SPACE-1-OPUS.md).

This is a design record, not acceptance. **Implemented** rows are verified against runtime rules by `tests/progression-curve.test.ts` and `scripts/check-progression-curve.mjs`. **Planned** rows use the existing IDs in [economy-candidate.json](economy-candidate.json), the [integration contract](../../EXPEDITION_INTEGRATION.md), [world](../../WORLD_PROGRESSION.md) and [fleet](../../FLEET_AND_SURVIVAL.md) specifications; they are not built, and this file is not a competing registry. Clue IDs name physical placements only. Measured minimum travel and staged rule checks are not human pacing; the ten-hour target and enjoyment remain unverified.

## 1. Living-source renewal — implemented

Siltwake design choice, separate from the [Subnautica research](../../research/05-subnautica-space-and-renewal.md): ordinary minerals and salvage stay finite, as that game's developers describe its inorganic resources. Only living outputs renew here.

| Source | Output | Rate (active expedition time) | Cap | Empty → cap | Finite reserve |
| --- | --- | --- | --- | --- | --- |
| `reef_ribbon_catch_north`, `reef_ribbon_catch_south` | `flex_membrane` | 2 per 6 min each | 12 (original exposed stock) | 36 min | 12 each, never refilled |
| `canopy_resin_lee_upper`, `canopy_resin_lee_lower` | `buoyant_resin` | 2 per 10 min each | 12 | 60 min | 8 each, never refilled |

Everything else keeps its rule: island drift resin, alloy/glass/crust and Basin salvage are finite first-access stock plus a finite sortable reserve; food is actively tended; rescue stock is a recovery-only allocation. Regrowth counts integer fixed steps only during post-opening expedition simulation, in or out of rendered regions. Pause, menus, export/import, Continue, wall-clock absence and the seeded carrier fixture add nothing. Progress is held at zero while exposed stock is at or above the cap, so a full source never banks time, and stock that sorting lifted above the cap is kept rather than trimmed. The visible work face uses the same authoritative stock. The Notebook labels each known source **Living shed · regrows to 12 ready**, **Finite** or tended food, with no countdown. An empty living shed reports **Empty · regrowing** when the player interacts with it.

**Rate disposition: root's baseline is kept.** Two expedition cycles motivate it:

- *Return after a Canopy or Basin outing.* A 30-minute absence regrows each reef catch by 10 and each resin pocket by 6. Coming home gets you seal material for the next refit without hauling reserves; it does not replace leaving home.
- *Regional gate.* Membrane is starter-tier and reef-local, so renewal there erases no gate. Resin renews only inside the Canopy (≤150 m personal protection), so it rewards revisits to that habitat; the island drift coves stay finite.

No evidence required a change. The current scripted earned route reaches C06 in 39,125 steps (~11 active minutes), far faster than human play. That leaves renewal at most a minor supplement on any measured path today.

**Solvency with zero renewal.** Implemented recipes need 14 membrane and 6 resin against 48 and 64 finite units; all three existing economies and the staged New Game sequence credit no renewal. **Planned risk:** the candidate routes need 45 (Creel) / 48 (carrier) membrane, or 53 / 59 with optional purchases, against 48 finite membrane currently placed. Before M2-B/C claims finite solvency, place the specified second membrane family (clear-water Canopy margins, [world table](../../WORLD_PROGRESSION.md)) or reduce quantities. Renewal must not be counted toward that budget.

## 2. Gate audit of the current build

Runtime verification: fresh New Game, all 120 orders of C02–C06, direct `craft` commands without knowledge, the fabricator, Notebook and Cargo panels.

- Before the opening ends, every recipe refuses with `opening`. Afterwards only the `bp_pod_checklist` ladder appears: `pod_repair` is attemptable, `essential_tools`/`suit_150`/`reserve_cells` show their missing predecessor, and everything else refuses as `blueprint`. With every material supplied at either bench, the other nine recipes still refuse, and the command commits no draft.
- Clue unlocks are bounded and order-independent. C02 unlocks buoy and Bobbin. C03 unlocks workshop restoration and the Dart. C04 unlocks the trim and the 350 m refit. C05 and C06 unlock research plans only, shown as "construction not available yet", and add no fabricator row.
- Prerequisites are acyclic. Every material has at least two patches within the personal protection that must already exist (60 m before the 150 m suit, then 150 m). Exposed stock alone covers each recipe.
- Both clue orders (reef-first and island-first) craft all ten recipes from New Game using only finite exposed stock, with no sorting and no renewal.

**Defect fixed (misleading plan presentation).** All three recovery methods require the Bobbin kit, whose plan comes only from C02, yet the Dart can be built without visiting C02. Cargo's recovery card told such a player "fabricate at the pod" for a plan they did not have. It now reads "plans at the reef intake" until C02 is known. No softlock existed: C02 is shallow and starter-reachable, and the hint ladder routes there first. Regression: `tests/preparation-panels.test.ts`.

The Notebook's "When none are ready, sort the reserve here" also appeared for exhausted reserves. The lifecycle label above replaces it.

**Not defects, recorded for M2:** finding C04 before C03 lists the 350 m refit as needing workshop restoration, accurately, since the workshop ledger is at that bench. `dart_acoustic_trim` remains craftable after salvaging the Dart (`needs` is a receipt) and stays useful once rebuilt. After the 350 m refit, Basin alloy and crust have no executable sink: a **reward drought** that M2-B must close (see §4).

## 3. Acquisition matrix

Status: **I** implemented and runtime-checked; **P** planned in the candidate registry or specification, not built; **U** specified role with no candidate recipe yet. "Mission" is the useful job before the next improvement; "Retained" is why earlier gear still matters.

### Personal pressure tiers

| Tier | Plan / clue | Preceding capability | Materials (tier) | Bench | New capability | Mission before next | Retained |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 60 m unprotected | start | — | — | — | reef, island shallows | C01–C03, starter stock | short dives forever |
| `suit_150` **I** | `bp_pod_checklist` / C01 | tools | alloy, membrane (reef ≤60) | pod fabricator | exits to 150 m | Canopy lab C04 (crust/resin), Dart exits | fitted instance is upgraded in place |
| `suit_350` **I** | `bp_canopy_reinforcement` / C04 | suit 150 | +crust/resin (Canopy ≤150) | workshop | exits to 350 m | Basin C05/C06 and survey salvage at 160–175 m | same item ID; pod/workshop services |
| `suit_450` **P** | `bp_rift_pressure` / C06 lead, Rift C07 | suit 350, 350-rated hull | ceramic 250–285, core 280–320 | supported dock | exits to 450 m | Divide lattice 360–390 m | thermal set optional |
| `suit_800` + `personal_service_seals` **P** | `bp_divide_service` / C09/C12 | suit 450 | lattice 360–390 | supported dock | deep exits, district service | District C08/C10/C13/C15 repairs | earlier materials in seals |

### Hulls (six roles) and remote tool

| Item | Plan / clue | Preceding | Materials | Bench / service | New capability | Mission before next | Retained |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dart `dart_base` **I** | `bp_island_workshop` / C03 | workshop restored, suit 150 | early five (≤60) | workshop cradle | 180 m scout, 32 CU | Canopy lab, first Basin shelf | fast local scouting all game |
| Dart trim **I** | C04 | Dart | crust, resin | workshop | quiet 4.2 m/s | quiet Canopy/Basin approaches | module identity survives loss |
| `dart_350` **P** | currently `bp_canopy_reinforcement` | Dart | crust/resin | supported dock | Dart to 350 | deeper Basin ridges, first Rift lip visit | Dart never reaches the Divide |
| Creel `creel_base` **P** | runtime `bp_creel_service` / C05 (candidate lists `bp_island_workshop`) | workshop, suit 150 | early five | workshop | 240 m bulk work, 64 CU | haul Basin tagged frames | Creel route to the ending |
| `creel_cargo_rack` / `creel_cabin` **P** | C03 / C04 plans | Creel | early five | supported dock | 96 CU, or first mobile refuge | multi-site Basin trip; overnight staging | mounts swap without loss |
| `creel_350/450/800`, `powered_service_head` **P** | C04 / C06·C07 / C09·C12 | prior refit | tier materials | supported dock | Rift, Divide, District reach | independent-expedition ending | cabin and rack stay |
| Hush `hush_base`, `hush_450` **P** | `bp_quiet_survey` / Canopy | workshop, suit 150 | early five | workshop | quiet survey, 220–450 m | lower-channel and brine-edge observation | optional; never a key |
| Spindle `spindle_base` **P** | candidate `bp_island_workshop` | workshop | early five | workshop | surface tender, 96 CU, solar | island supply runs, field shelter C11 | dry carrier berth; optional |
| Hearthline `hearthline_base` **P** | `bp_carrier_workshop` C03 + `bp_carrier_basin` C05 | workshop (+ candidate buoy) | 32 alloy, 8 glass, 10 membrane, 12 crust, 12 resin | workshop berth | 400 m home, 256 CU, two compact or one medium berth | Basin 240 m / Rift 300 m moorings, several outings | small craft deploy onward |
| `hearthline_550` **P** | `bp_divide_service` | carrier | ceramic, lattice | supported dock | District 520 m shelf | Mantle staging | optional |
| Mantle `mantle_base` **P** | `bp_divide_service` / C09/C12 | workshop | all eight families | workshop | 800 m protected work | District repairs | carrier-route ending |
| Bobbin `bobbin_kit` **I** | `bp_reef_recovery` / C02 | tools | rescue stock only | pod fabricator | local tow/patch/salvage | recover any loss-capable Dart site | reusable; shallow-built |

### Mobile homes, service stops and survival conveniences

| Item | Status | Plan | Preceding | New capability | Mission / retained value |
| --- | --- | --- | --- | --- | --- |
| Pod: air, healing, locker, emergency meal | I | start | — | dependable refuge | always the fallback refuge |
| `pod_repair`, `essential_tools` | I | C01 | — | fabricator, scanner, acoustic pulse | scans, distraction for the whole game |
| `reserve_cells` + bench recharge | I | C01 | tools | portable hull power, pulse charge | every expedition |
| `salvage_buoy` (24 CU) | I | C02 | tools | field cargo | early hauling, frame salvage returns |
| Workshop restoration | I | C03 | tools | second refuge, charging, hull bench | forward base for the Canopy and Basin |
| Canopy lab air pocket | I | C04 | — | mid-route respite | Canopy crust/resin trips |
| Food: staple patches, tending, emergency issue | I | start | — | food from an empty inventory | unchanged; no spoilage |
| `restore_canopy_stop` / `_rift_` / `_divide_` / `_district_` | P | C04 / C06·C07 / C09·C12 | essential tools | forward service, Creel-route staging | shorter solved returns |
| Creel cabin (bunk, cooker, locker) | P | C04 plan + Creel | Creel | first mobile refuge, quick cooking | before the carrier, Creel route |
| Hearthline galley and planters | U | — | carrier | crops as convenience only | never a gate |
| `marker_pair`, `extra_locker`, `field_spares`, `survey_array`, `thermal_work_set` | P | various | tools | convenience and options | optional purchases, never prerequisites |

## 4. Curve findings and required M2-B/C order

**Circular prerequisites:** none, implemented or candidate. The candidate graph is acyclic, and no hull needs its own handling tool.

**Unlock piles (candidate):**

- `bp_island_workshop` at C03 would unlock workshop, Dart, Creel, Spindle and cargo rack together.
- `bp_canopy_reinforcement` at C04 would unlock suit 350, trim, Dart 350, Creel 350, Creel cabin, Canopy stop and extra locker together.

Recommendation: keep C03 = workshop + Dart; keep runtime canon C05 = Creel and service plans. Move Creel 350 and cabin to C05/Basin, Dart 350 to a deeper Basin ridge observation, and Spindle to the island field shelter (C11 placement, reachable any time after C03). Keep C04 = suit 350, trim and Canopy stop.

**Obligatory optional purchase:** the candidate `hearthline_base.needs` includes `salvage_buoy`, coupling an unrelated optional purchase to the carrier route. Replace it with the actual frame-recovery requirement (Basin tagged frames) or drop it.

**Reward drought:** in the current build, C05/C06 yield research only, and Basin materials have no sink after the refit. Close it first with Creel (C05) and its frame-hauling mission.

**Early-material shortcut check:** island drift resin is reachable at ≤20 m but every resin recipe also needs Canopy crust and a C04 plan, so it is not a shortcut. Basin fins (≈170 m) need suit 350, whose crust comes from Canopy fins at ≤150 m: no cycle.

**Personal versus hull depth** stay separate fields. Dart 180/350 never reaches the Divide; Creel 240 needs 350 before the Rift lip at 250 m. Ending strategies: upgraded Creel + service stops, or Hearthline + Mantle. Hush and Spindle stay optional. The carrier remains mid-campaign: it needs only C03 + C05 and early materials.

**Implementation order** (each step: payload, route and service requirements):

1. **M2-B1 Creel.**
   - `creel_base` at C05 plus cargo rack. Basin tagged-frame salvage form (10 s actions, 8-unit chunks).
   - Medium cradle clearance at the workshop; Basin corridors clear the 4.5 m Creel collider.
   - 64/96 CU payload; tow/salvage recovery for the medium hull.
   - Place the second membrane family now.
2. **M2-B2 350 tier.**
   - `dart_350`, `creel_350`, Creel cabin as a registered mobile refuge with pod fallback, `restore_canopy_stop`.
   - Rift lip reachable with suit 350 and a 350-rated hull; rescue staging and tether before the route opens.
3. **M2-B3 Hearthline.**
   - Earned construction from C03 + C05 and frames at the workshop berth.
   - Canopy 160 m / Basin 240 m moorings, earned berth transactions, interior sockets, mobile-home loss fallback.
4. **M2-C1 Rift.**
   - Ceramic and core shelves at 250–320 m, C07 upper service dock, rift stop 280 m.
   - `suit_450`, `creel_450`, `powered_service_head`; optional `thermal_work_set`.
5. **M2-C2 Divide.**
   - Lattice 360–390 m on flushed ledges, C09/C12, divide stop 380 m.
   - `suit_800` and seals, `creel_800` or `mantle_base`, optional `hearthline_550`.
6. **M2-C3 District.**
   - Final repairs (`independent_support`, `bypass_repair`, `restoration_repair`) reached by both strategies.
   - Validated rescue staging; no new endgame material.

Optional Hush (Canopy) and Spindle (island) can join from step 2 onward.

Each step needs one useful mission before the next improvement, and an ordinary-input round trip with the recorded return margin. Renewal stays outside every solvency claim.
