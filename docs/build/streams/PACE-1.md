# PACE-1: late-game pacing (design plan, stage 0)

Opus 5.5 high, design authority for the stream. Branch `t3/pace-1-late-game` from root `37a1c5a6`. **Docs only: no code stage starts until the coordinator approves this plan.** Spoiler-safe. Canon notes for the lore owner are in `docs/spoilers/PACE-1-NOTES.md`.

**Evidence.**
- **Source:** LS-1's acceptance runs at code `4b89164b` (ticket `261024-184819-d93f`, 4070 sandbox). That is the four judged timelines plus `playthrough.json`, which has every leg's phase, label, ticks and metres.
- **Method:** read with the analyzer's own rules (first-occurrence beats, travel pieces).
- **Code read:**
  - `scripts/playthrough/later.ts` (every late phase);
  - `sim/story/works.ts`, `sim/storyLink.ts`, `sim/story/resolution.ts`;
  - `sim/progression.ts` (recipe sites), `content/stops.ts`;
  - the composed source tables, `sim/renewal.ts`, `sim/campaignEconomy.ts`.
- **No new runs.** Factory-worker held an exclusive run. The existing exports answer every question here, read with sub-second scripts.

**Player outcome.** The ending is played where it happens:
- **The district is one self-contained final expedition.** You read it, gather its repair stock from habitats you learned to read at the start, fabricate the two works assemblies at the staging office, and work the gate and the hall in one visit.
- **Home is a choice, not a haul.** Going home before the end is for the pod's record and a resupply, never to haul 42 CU of commons 3.5 km.
- **The carrier stays parked at the shelf,** the base it was meant to be.

## Design calls (taste decisions, argued from the evidence below)

1. **Most of the recorded debt is the bot. The part that is the game is the ending's worst moment.**
   - About half of the Creel works gap (25 of 51 min, plus the 15-minute trailing gap after it) and more than half of the carrier's four long gaps (about 110 of 202 min) are bot ordering.
   - What remains is structural. Every need of the works is revealed in the district and can only be met at home.
2. **Fabricate where you work.** The district's staging office is already a working stop (air, rest, charge). It gets a works bench for the two assemblies.
   - It's one row in the existing stop-recipe table (beside the Divide dock's 800 m refits and the crown's bench), not a new bench system.
3. **The frontier supplies the commons it consumes.**
   - **Three new district sources:** glass, membrane and crust, placed by the habitat rules the player learned at home.
   - **Resin is swapped out:** in the hall and food restorations it becomes pressure ceramic from the district's own cut.
   - This is GAME-DIRECTION's "the reliable supply is at the frontier" applied to the last frontier.
4. **The carrier is a base, not a ferry.** WORLD-LAYOUT's research says it plainly: relocate the carrier for a group of sorties, never shuttle home after each pickup. The bot shuttles nine times.
5. **One purposeful return, never a forced one.** The pod record (C14) stays at the pod. It's a chosen backtrack paying off a lead read at the Divide. The ending never needs it, and the district corroborates its fact.
6. **Count what the player does.** Staging power and air, opening the gate, restoring the hall and the food bay, routing power and the ending are story beats. Today the recorder sees none of them.
7. **No padding and no timer changes.** The 90 s equalize, craft speeds and recipe quantities all stay.
   - **The bot's total time falls by a third or more** as roughly 70 (Creel) and 170 (carrier) bot-minutes of hauling and crossing go.
   - **The 10-hour floor rests on content.** Other streams are adding it; this plan adds nothing to make up the difference.

## 1. Diagnosis

### 1.1 Where the late game's time goes (bot minutes)

| | Creel | Carrier |
| --- | --- | --- |
| Late game (the Rift to the end) | 162 | 331 |
| Craft travel in the whole run | 153 of 202 play-minutes | 232 of 371 |
| … of which in stretches over 90 s | 142 | 223 |
| Gathering calls (`procure`), late game | 23 | 96 |
| Works and ending phases | 70, with 4 beats | 131, with 4 beats |
| District visits | 3 | 3 |
| Carrier crossings between the yard and the Divide or the shelf | – | 9 (110 min) |

Craft speed is not the artefact. The bot averages 3.7–4.2 m/s on authored Creel legs (cruise 5, with turns) and 2.85 m/s on the carrier (cruise 3).

### 1.2 The failing stretches

- **Gaps over 20 min:** there are five in the four judged runs. The debt file records only each route's longest, and the carrier has four. The no-optional runs match their parents within 2 min.
- **Bot artefact:** minutes a sensible player wouldn't spend with today's game.
- **Structural:** minutes they would.

| Stretch | What fills it | Hauled, distance, trips | The player has | Artefact | Structural |
| --- | --- | --- | --- | --- | --- |
| **G1 Creel works**, 136.7→187.5 (51) | <ul><li>Gathers the hall and food stock (7.5 min; glass from the isles stack, 545 m out)</li><li>Hauls everything to the gate hall (850 s)</li><li>Works the gate and the hall, including a 75 s idle at the panel and a second terrace descent</li><li>Sails home (756 s) and gathers 2 glass and 2 crust (7 min)</li><li>Fits the pod buffer, then sails back for the ending (849 s)</li></ul> | <ul><li>42 CU in one Creel load (two 6 CU assemblies, 22 CU hall, 8 CU food), then 4 items</li><li>3.5, then 3.1, then 3.5 km</li></ul> | <ul><li>800 m Creel with the cargo rack, 800 m suit, Dart</li><li>Restored Canopy, Rift and Divide stops; the district office (air, charge); a packed outpost kit</li><li>No crown</li></ul> | **~25 min:** the home-and-back for the pod buffer (the plan is known from C07 at 68 min; the ending needs only the works); gathering per recipe; the extra descent. The 15-minute trailing gap after it is artefact too. | **~22 min:** gathering and the haul before the first works step. The other ~4 min are the uncounted works (M2). |
| **G2 carrier works and ending**, 257.5→352.0 (95) | <ul><li>Gathers the hall stock (30 min; glass from the headland, 1.1 km out)</li><li>Creel to the carrier, then sails to the shelf (753 s)</li><li>Two Mantle trips (42 CU > the Mantle's 32 CU hold)</li><li>Sails back to the yard; gathers 2 glass and 1 crust (14 min); fits the buffer; sails out again</li></ul> | <ul><li>42 CU through the carrier stores into the Mantle</li><li>2.1 km at 3 m/s, three times</li></ul> | <ul><li>Hearthline 550 (192 CU stores), Mantle, Creel 350, Dart, 800 m suit</li><li>The crown (power and dock)</li></ul> | **~50 min:** the pod-buffer round trip (29 min, plus a 19-minute trailing gap); the 30-minute hall-stock gathering that batching makes about 12 | **~25–30 min:** the same as G1. The other ~13 min are the uncounted works and Mantle sorties (M2). |
| **G3 carrier Hearthline → Divide**, 89.4→140.2 (51) | <ul><li>A Creel trip to the Rift's deep seam for 2 ceramic (3.8 km, 16 min)</li><li>Gathers 8 alloy, 3 glass and 4 crust (19 min, four Dart transits)</li><li>Eats at the workshop, ferries stock to the yard, sails to the Divide (11 min)</li></ul> | <ul><li>2 ceramic and 15 commons</li><li>3.8 km by Creel, about 2 km by Dart, 2.3 km by carrier</li></ul> | Hearthline 400 | **~37 min:** the Rift lips hold 16 sortable reserve; batching; eating where you are | **~11–14 min:** passes |
| **G4 carrier C12 → C08**, 190.4→220.2 (30) | After C12 by Mantle at the Divide: sails the carrier back to the yard, eats at the workshop, sails out to the shelf | 1.6 + 2.1 km by carrier | As G2 | **~24 min:** the shelf is 0.5 km from the Divide lee | ~6 min |
| **G5 carrier controller → power assembly**, 224.9→251.4 (26.5) | Mantle home, carrier 2.1 km to the yard, gather, craft | 2.1 km | As G2 | – | **All:** the same as G1 |

**Passing, but artefact:** Creel C12 → the air plan, 94.5→112.8 (18.4). C12 is read in its own home-to-Divide round trip, yet it is about 70 m from the Divide dock the bot restored at 68 min.

**Would a competent player face G1?** Yes, on today's game.
- **The best ordering leaves a 41-minute loop:** 12.6 min home, about 14 min gathering and crafting, 14.2 min back. Its only beats are the two assembly crafts, so at best two gaps of about 20 min sit inside it.
- **The rule fails narrowly; the feel fails clearly.** This is GAME-DIRECTION's "a chore just to fill time", and the owner's rule that purposeful backtracking is never empty-travel padding.
- **It gets worse:** OP-1's move of the workshop to the island cove adds about 200 m to every home trip.

### 1.3 Bot artefacts, ranked by minutes

| # | Artefact | Evidence | Cost |
| --- | --- | --- | --- |
| B1 | **The carrier is used as a ferry:** it goes back to the yard after every sortie. | 9 crossings, 109.6 min of Hearthline travel; at most 3 are needed (plus 2 forced until stage 2). | ~50 min |
| B2 | **The pod buffer comes last,** as a separate home-and-back after the works. | The resolution needs only the four works flags (`resolution.ts`), and the buffer plan is known from C07. | Creel ~34 min, carrier ~44 |
| B3 | **Gathering per recipe, after arriving.** | `procure` calls take 23 min (Creel) and 96 min (carrier) in the late game. | 30–60 min |
| B4 | **Creel phase order.** | It goes home after the Divide for 800 m refits the restored dock already offers (`REFIT_STOP_SITES`), and defers C12 into a separate round trip. | ~30 min |
| B5 | **`provision()` goes to the workshop to eat** at the start of every later phase, from the carrier too. | The carrier has a galley; LS-1's allotments feed you in the district (live from LS-1 1b). | 2–12 min a phase |
| B6 | **The deep-seam trip for 2 ceramic.** | Both Rift lips hold 8 sortable reserve each, which the bot's harvest of them doesn't sort. | 16 min |
| B7 | **The works aren't interleaved.** | It idles 75 s at the panel while the galleries drain (the drain continues while you're away), then descends the terraces again for route power. | ~6 min |
| B8 | **The Creel route never restores the crown,** a hub it passes on every deep trip. | Its bench runs every workshop recipe, the assemblies included. | Realism; a nearer bench before stage 2 |

### 1.4 What the measure misses (measurement, not game)

- **M1, landmark passes** (routed to REC-2).
  - POI-1 measured the four deep legs at 59 s or less between marks at 5 m/s, which is about 80 s at the bot's speed.
  - The recorder breaks travel only at gathers and new things, so a home-to-district journey of six authored legs counts as one 850 s stretch.
- **M2, works and ending beats.**
  - The recorder diffs plans, scans, crafts and hulls, so none of these steps appears:
    - staging power and air;
    - opening the gate, which opens the inner hall;
    - restoring the hall and the food bay;
    - routing power;
    - the ending itself.
  - A dense finale therefore reads as a gap, and the run ends on a 15–19 min trailing gap.
- **M3, perceived threats.** 10 of the Creel's 31 long stretches come before minute 41: quiet runs through hunter territory (88–102 s quiet sections at 2–3 m/s) and the pump-house run. Whether sneaking past an animal you can hear is "empty" is the owner's call (Q1).

### 1.5 The long stretches by source

- **Creel (31):**
  - **Early, 10:** before minute 41. OP-1 rebuilds these legs; Q1 and REC-2 settle how they're measured.
  - **Mid, 9:** the Rift and Divide, on POI-1-marked deep legs plus local parking legs. Stage 1 removes the 2 home legs after the Divide.
  - **Late, 12:**
    - 5 are trips between the district and home (stage 1 removes 2; stage 2 swaps the forced pair for the chosen home visit);
    - 2 are C12's own round trip (stage 1 removes them);
    - 2 are the C11 Dart run;
    - 3 are inside the district.
- **Carrier (55):**
  - the same 10 early;
  - about 45 from the Rift on: 9 carrier crossings, about 12 Dart and Creel transits inside gathering calls, the seam trip, and the Mantle sorties in the district.
- **Expected effect:**
  - Bot fixes remove about 4 (Creel) and 20 (carrier).
  - M1 should split most of the rest.
  - Legs no one has measured are measured in stage 3: the carrier lanes at 3 m/s, the district terraces, the shelf approach and the isles surface.

## 2. The structural problems, ranked

1. **The ending's needs are revealed at the far end and met only at home.**
   - **Plans:** the air assembly's plan comes only from district records (C08, C10, the gate panel).
   - **Fabrication:** both assemblies are made only at the island workshop, or at the crown once restored. S9's carrier fabrication is design text with no code (`content/campaign/fleet.ts`; `STORY_RECIPES` still says `workshop_or_carrier`).
   - **Materials:** four of the commons the works consume have no source beyond the Basin: glass, membrane, resin and crust.
   - **Result:** a 25–40 min forced loop on both routes.
2. **Late material geography points backward.**
   - **Finite near home:** glass near home is 36 units with no renewal. By the late game it is spent, so 2-glass top-ups mean Dart runs to the stack (545 m) and the headland (1.1 km).
   - **Nothing at the frontier:** the Divide and district hold only lattice, ceramic and one alloy cache.
   - **Against direction:** GAME-DIRECTION wants gathering to pull outward, with the reliable supply at the frontier.
3. **Some legs may be truly empty, and nobody has measured them.**
   - **The carrier needs denser marks:** at 3 m/s the carrier needs a mark about every 270 m. POI-1's Divide↔Meridian stretch is 295 m, which is 98 s at carrier speed.
   - **Unmeasured legs:** the district terraces (546 m), the shelf approach and the isles-to-Canopy-east carrier lanes were never in POI-1's set.
4. **The carrier's refit loop (Divide → yard → Divide) is by design and is kept.**
   - **Why it's forced:** the 550 m refit and the Mantle need Divide lattice and the yard's slips.
   - **Why it's kept:** there are new things at both ends, and after the bot fixes its gaps are 10–11 min.

## 3. Fixes (no padding)

| Fix | Player outcome | Systems and files | Owner | Pacing effect | Economy effect |
| --- | --- | --- | --- | --- | --- |
| **F1 Works bench at the staging office** | The two assemblies are made in the district, at the office where the works were first staged. The bench pays from the diver hold and a craft moored at the office (no new locker). | <ul><li>`content/stops.ts`: `meridian_office.fabrication`</li><li>`sim/progression.ts`: fold `REFIT_STOP_SITES` into one stop-recipe table and add the two assemblies at the office</li><li>`sim/story/reachability.ts`</li><li>The text in `content/proposals/progression.ts`</li></ul> | PACE-1 stage 2 | <ul><li>Removes the forced loop: G1, G2 and G5 lose 25–40 min</li><li>2 long stretches fewer per route</li><li>Creel's longest goes from 850 to about 610 s</li></ul> | <ul><li>`sim/campaignEconomy.ts`'s works acts and failure cargo model the office bench</li><li>No cost change</li></ul> |
| **F2 District habitat sources** | Three short sorties from the office, each found by a rule you learned at home:<ul><li>membrane from the filter colonies at the district's intakes (it regrows);</li><li>glass where the turbine outflow scours;</li><li>crust on the supply pylon's grounding fins clear of silt.</li></ul> | <ul><li>S2 rows in `content/regions/sites.ts`, lifted in `content/campaign/sources.ts`</li><li>One membrane renewal row, composed into `SOURCE_RENEWAL` by the one-line spread the fauna rows use (coordinator)</li><li>Rendered by the existing source assets (`render/expedition.ts`, no edit)</li></ul> | PACE-1 stage 2 | <ul><li>The district gathering is local, within the research's 2.4–3.8 min sortie budget from the shelf</li><li>Each find is a point of interest: it breaks empty travel, but isn't counted as new</li></ul> | <ul><li>Adds stock: the finale's need (glass about 10, membrane about 11, crust about 7) plus about half again</li><li>Glass and crust are finite with a reserve</li><li>Nothing is cave-only; all six scripts re-run</li></ul> |
| **F3 Hall and food from frontier materials** | Restoring the hall frame and the food bay uses the district's own ceramic (the terrace cut, 290 m from the office) instead of Canopy resin. | `STORY_RECIPES` in `content/story/evidence.ts`: resin 2 becomes pressure ceramic 2, in each of the hall and the food bay | PACE-1 stage 2 (lore note) | Nothing left to bring from home | <ul><li>Ceramic demand +4 against about 72 in the world (late demand is 30 or less)</li><li>Resin −4</li><li>Ledger re-run</li></ul> |
| **F4 The power plan at the Rift** | The Rift materials station's ledger also grants the power assembly's plan, so you see there that the works will need 2 thermal core, and carry them. | `STORY_GRANTS.rift_station_ledger` in `content/story/evidence.ts` | PACE-1 stage 2 (lore note) | Core has no source past the Rift. Without this, a player short of core goes back 1.2–1.5 km (straight line) from the district | None (a grant, not a cost) |
| **F5 Count the works beats (M2)** | None: it's measurement. | <ul><li>`sim/timeline/recorder.ts` diffs `story.works` and `story.resolution`</li><li>Emits `new` events with `what: "story"` and IDs `works:power`, `works:air`, `works:gate-open`, `works:hall`, `works:food`, `works:hall-power`, `resolution:complete`</li><li>First occurrence each; isolating and equalizing are steps, not beats</li></ul> | LS-1 if it fits its R1 fixes, else REC-2. PACE-1 supplies two fixtures: a full works sequence counts seven beats, a refused action counts none | <ul><li>G1 and G2 lose 4–8 min</li><li>The trailing gap goes to 0</li></ul> | None |
| **F6 Landmark passes (M1)** | None: it's measurement. | REC-2's lift of POI-1's noticeable marks into one content module, plus a recorder "point of interest passed" event | REC-2 (routed) | Most late long stretches split under 90 s | None |
| **F7 Marks where a leg is still empty** | Something to see on every leg you fly, at the speed you fly it | <ul><li>POI-1's kit: `content/poi/sets.ts`, `render/poi/dressing.ts`, `tests/poi.test.ts`</li><li>`content/poi/legs.ts` gains the carrier lanes and district legs with their craft speeds</li></ul> | PACE-1 stage 3 | The late stretches still over 90 s after F6 go to 0 | None |
| **F8 (optional) the outflow current** | The glass source sits in a turbine outflow you cross by reading the glimmers that lean into moving water: currents as route texture, with a helper creature | One authored flow volume, and only if CY's volumes are composed on root at stage 2; otherwise it's deferred | PACE-1 stage 2 | None (no figure depends on it) | None |

**Not done, deliberately:**
- a shorter equalize, faster craft or smaller quantities;
- fast travel;
- district caches holding finished assemblies;
- a carrier autopilot (Q2).

**Related unfinished design, for the coordinator:**
- **The gap:** S9 designed carrier fabrication of the two assemblies, and the carrier's fabricator socket currently runs nothing.
- **What F1 changes:** pacing no longer depends on it.
- **What remains:** wiring it is the carrier route's identity ("carrying the systems"), and who does it is the coordinator's call. Until then, `STORY_RECIPES.site` and the S9 services text should say what is true.

## 4. Bot changes (separate from game changes)

**Rules:**
- Each rule is a general routing rule with its own fixture.
- No phase moves to put a beat inside a gap.
- The reviewer checks both.

| # | Rule | Replaces |
| --- | --- | --- |
| R1 | **Eat where you are:** from the diver hold, a craft or carrier pantry and galley, or the nearest food source. A phase never starts with a trip home to eat. | `provision()` |
| R2 | **Plan an expedition's stock once:** the sum of the known recipes it will make, gathered in one pass per region from the nearest sources with stock, before crafting. | per-recipe `stockUp`/`procure` |
| R3 | **Do a known task within reach:** on the current route, or within about 150 m of a stop. Examples: C12 at the Divide dock; refits where a restored stop offers them. | the deferred C12; the 800 m refits at home |
| R4 | **The carrier moves for a group of sorties.** It parks at the farthest mooring the next sorties need, and returns to the yard only for yard-only work. | yard returns after every sortie |
| R5 | **Interleave:** start draining machinery, do the next task, come back. Here: stage power and air, isolate, start equalizing → restore the hall and the food bay → open, route power → the ending. | the idle at the panel and the second descent |
| R6 | **Sort before travelling:** short on exposed stock where the source has a reserve, sort first. | the seam trip |
| R7 | **Charge at the stop you're at** (the office), not at a separate mooring. | the 75–139 s shelf detours |
| R8 | **Restore hubs you pass,** only where the ledger allows (optional within stage 1). Here: the crown's first two stages, on the Creel route's way to the Rift. | the Creel route skipping the crown |
| R9 | **Log every return home with its reason.** For example: `<item> fabricable only at <sites>`, or `no source of <item> with stock within <d> m`. The log, listed in the run notes, is the structural list by route after each stage. | nothing |

**The late sequence:**
- **Stage 1** (today's game):
  - **Creel:** the Rift → the Divide (lattice, C07, the dock, C12, the 800 m refits at the dock) → the district records → home, forced (the assemblies and the batched stock, plus C14 and C11) → the district (the works, interleaved, and the ending).
  - **Carrier:** the Rift and the crown → the Hearthline → the Divide (lattice, C07) → the yard (550 m refit, Mantle, 800 m suit, C14 at the pod, C11, batched stock) → the Divide (C12 by Mantle) → the shelf and the district records → the crown or the yard, forced (the assemblies and hall stock) → the shelf → the works and the ending.
- **After stage 2:**
  - **Creel:** the Divide → home (C14, C11, resupply) → the district (records, office, works, ending), with no return.
  - **Carrier:** the yard visit as above → the Divide → the shelf, parked to the end.
- **Phase IDs are kept** (the library's milestones). Only their content and order change.

**Files:**
- **Owned by PACE-1:** `scripts/playthrough/later.ts`, a new pure `scripts/playthrough/stock.ts` (the expedition stock plan, unit-tested), and the late rows of `pacing-debt.ts`.
- **Not touched:** `live.ts`, `scenarios.ts`, `run.ts` or `driver.ts`. They are LS-1's until stage 1a merges, and then OP-1 has `live.ts` and `scenarios.ts`.
- **One change through their owner:**
  - `tour` and `over-geared` branch from `creel@divide`, which would now end at the Divide dock.
  - They branch from `creel@deep-records` (home, with the 800 m Creel) instead.

## 5. Stages

| Stage | Outcome | Files owned | Needs | Tests and evidence | Adverse case |
| --- | --- | --- | --- | --- | --- |
| **1: the bot plays like a sensible player** | R1–R9 on both routes. The ending lands in the same district visit as the works; every remaining return is logged with its reason. | `later.ts`, new `stock.ts`, the late rows of `pacing-debt.ts` | LS-1 1a merged | <ul><li>Fast tier</li><li>Stock-plan unit tests</li><li>A leg-log check that no later phase opens with a meal-only trip home</li><li>Queued playthrough `--machine any`: 9/9 with reloads matching, the acceptance figures, the R9 log</li><li>Save-library re-export</li><li>No images</li></ul> | A run whose lip reserve is already spent: R6 falls through to the seam, and R9 names the reason. |
| **2: stage the works where the works are** | F1–F4 (F8 if CY allows). Both routes finish the district without a forced return. | <ul><li>`content/stops.ts`</li><li>`sim/progression.ts` (the table)</li><li>`content/story/evidence.ts` (two recipe rows, one grant)</li><li>Rows in `content/regions/sites.ts` and `content/campaign/sources.ts`</li><li>The renewal row (composed by the coordinator)</li><li>`sim/campaignEconomy.ts` (the works model; the crown stages as a credible optional spend on both routes, since the ledger lacks them today)</li><li>`sim/story/reachability.ts`</li><li>`render/fieldKit.ts` (the office's host offset, if the bench needs one)</li><li>`later.ts`</li></ul> | Stage 1. No CW-1 file. | <ul><li>`npm run gate`, including all six economy scripts</li><li>Tests: the assemblies are made at the office and refused at sites off the table; the new datums sit on the floor; habitat scan lines; the hall is paid from a Mantle moored at the bay; the ledger with ceramic instead of resin</li><li>2–4 images: each habitat at its source, the office bench</li><li>One 4070 check in the district (new nodes)</li></ul> | The office bench without the air plan refuses, naming the plan, with nothing consumed. Stripped district membrane regrows, and a save reloaded mid-gather keeps its stock. |
| **3: no unmarked leg** | F7: every late leg has something to see within 90 s at its craft's speed. | `content/poi/sets.ts`, `content/poi/legs.ts`, `render/poi/dressing.ts`, `tests/poi.test.ts` | REC-2's landmark passes (F6) | <ul><li>POI-1's measure on every late leg at its real speed (Dart 8, Creel 5, Mantle 4, carrier 3 m/s; quiet where a threat dictates)</li><li>REC-1 fixed views tagged `poi`</li><li>2–4 images</li><li>A 3090 `--class exclusive` frame check at the densest new mark, plus a 4070 check</li></ul> | A Dart at full speed past a new mark shows no streaming hitch over 33 ms. |

**The ratchet** (`pacing-debt.ts`):
- **These are projections from LS-1's runs.** Each merge records the measured figure, and the ratchet fails when a route is better than its entry.
- **Each figure is shown as Creel / carrier.** The no-optional runs track their parents.

| After | Longest gap (bot-min) | Empty stretches over 90 s | Longest stretch (s) | Lowered by |
| --- | --- | --- | --- | --- |
| Today | 51 / 95 | 31 / 55 | 850 / 754 | – |
| Stage 1 | about 23 / 25 | about 26 / 32 | 850 / 754: the forced haul remains | PACE-1 |
| F5 (works beats) | about 15 / 18 | – | – | LS-1 or REC-2 |
| Stage 2 | 15 or less / 15 or less | about 24 / 28 | about 610 / 600 | PACE-1 |
| F6 (landmark passes) | – | late: only unmarked legs | under 200 | REC-2 |
| Stage 3 | – | late 0; early rows wait for OP-1 and Q1 | 90 or less | PACE-1 |

An entry is deleted when all four routes pass.

**Coordination:**
- **CW-1:** no stage touches a CW-1 file (`step.ts`, `world.ts`, `fittings.ts`, `renderer.ts`, `farLayer.ts`, `app.ts`, the cave files).
- **LS-1:**
  - owns the recorder and report now (F5);
  - stage 1b's planter move in `live.ts` doesn't reach `later.ts`;
  - its terrace allotments feed the district finale, and the new sources keep at least 40 m clear of them.
- **OP-1:** inherits `live.ts` and `scenarios.ts`, including the two branch points above.
- **REC-2:** F6, Q1's rule, and F5 if LS-1 passes it on.
- **SAVE-1 library:** the late milestone saves change at stages 1 and 2. Consumers re-derive after `saves-export.sh`.
- **Save schema:** no change expected; the coordinator confirms at stage 2.
  - New sources are additive rows (the S7 rule).
  - The office bench adds no container.
  - The recipe and grant edits are content.

## 6. Open questions for the owner

1. **Sneaking past an animal.** When you're running quiet past a predator you can hear, does that count as "something happening" for the 90-second travel rule?
   - **Recommendation:** yes, but only while its warning cue plays, so a quiet crawl through empty water still counts as empty.
   - **Who it affects:** REC-2 implements it, and it settles most of the early stretches.
2. **A hold-course helm for the Hearthline.** Should the carrier hold its course on lanes you've already sailed, stopping for any hazard, so you can tend planters, the decoder and the stores on the way?
   - **Recommendation:** yes, after stage 2, as a small stream of its own.
   - **Why:** it makes the carrier's 10–12-minute crossings feel like time at home.
   - **What it doesn't do:** it changes no pacing figure. Travel stays travel.

## Known limits and compromises

- **The finale gets shorter.**
  - **What goes:** roughly 70 (Creel) and 170 (carrier) bot-minutes of hauling and crossing. Human travel runs close to bot travel, so a player's main path loses roughly an hour or more.
  - **Why nothing replaces it:** removing slog is the point. The 10-hour floor rests on the content in the order of work, and nothing here pads it back.
- **The figures are projections** until each stage measures them.
- **The early stretches stay in the debt** until OP-1 rebuilds those legs and Q1 settles how they're counted. PACE-1 doesn't own them.
- **The crown is missing from the economy ledger** for both routes, although the carrier playthrough restores it. Stage 2 adds it.
- **The carrier's refit loop stays** (section 2, item 4).
