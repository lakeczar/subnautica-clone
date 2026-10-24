# PACE-1: late-game pacing (design plan, stage 0, revision 1)

Opus 5.5 high, design authority for the stream. Branch `t3/pace-1-late-game`, with root `3ed91bc0` merged. **Docs only: no code stage starts until the coordinator approves this plan.** Spoiler-safe. Canon notes for the lore owner are in `docs/spoilers/PACE-1-NOTES.md`.

This revision answers:
- Sol's R1 (`review/pace-1-r1`, `0891ed9e`);
- the owner's answers on the 90 s rule and carrier hold-course;
- the owner's amendment that late-game needs are inferred from evidence;
- the coordinator's rulings.

The dispositions are in *Review responses* at the end.

**Evidence.**
- **Source:** LS-1's acceptance runs at code `4b89164b` (ticket `261024-184819-d93f`, 4070 sandbox, functional evidence). That is the four judged timelines plus `playthrough.json`, which has every leg's phase, label, ticks and metres.
- **Method:** read with the analyzer's own rules. Sol reproduced every figure with the exact `analyseTimeline`.
- **Code read:**
  - `scripts/playthrough/later.ts` (every late phase);
  - `sim/story/works.ts`, `sim/storyLink.ts`, `sim/story/resolution.ts`;
  - `sim/progression.ts` (recipe sites), `content/stops.ts`;
  - the composed source tables, `sim/renewal.ts`, `sim/campaignEconomy.ts`.
- **Measured versus inferred:** measured legs come from the run. Savings and best-play figures are estimates, marked as such, and stage 1 measures them.

**Player outcome.** The ending is played where it happens:
- **The district is one self-contained final expedition.** You read it, gather its repair stock from habitats you learned to read at the start, fabricate the two works assemblies at the staging office (or aboard the carrier), and work the gate and the hall in one visit.
- **Preparation is read, not told.** What the works will need from behind you is something you can infer from what you've seen on the way.
- **Home is a choice, not a haul:** going home is for the pod's record and a resupply.

## Design calls (taste decisions, argued from the evidence below)

1. **Much of the recorded debt is the bot. The part that is the game is the ending's worst moment.**
   - **The estimated split:** about half the Creel works gap (25 of 51 min, plus the 15-minute trailing gap after it) and more than half of the carrier's four long gaps (about 110 of 202 min) are bot ordering.
   - **What remains is structural.** The air, hall and food plans are revealed only in the district. The power plan comes earlier, at C07 on the Divide. The assemblies and four of their commons can be made or found only behind you: the island workshop, or the crown once restored.
2. **Fabricate where you work.** Both routes get a forward bench, and neither discharges the other:
   - **Independent route:** the district's staging office, already a working stop (air, rest, charge), gets a works bench for the two assemblies. It is one row in the existing stop-recipe table, not a new bench system.
   - **Carrier route:** the Hearthline's fabricator socket gets S9's designed fabrication, which today runs nothing.
3. **The frontier supplies the commons it consumes.**
   - **Three district sources:** glass, membrane and crust, placed by habitat rules the player learned at home.
   - **Resin is swapped out:** in the hall and food restorations it becomes pressure ceramic from the district's own cut.
   - This is GAME-DIRECTION's "the reliable supply is at the frontier" applied to the last frontier.
4. **What must come from behind is inferred from evidence, never listed** (owner, 2026-10-24).
   - **The two materials:** only thermal core (Rift) and brine lattice (Divide) have no district source.
   - **Where the evidence sits:** each has physical evidence where it's found, before you leave.
   - **Fair in hindsight:** a player who misses a clue pays at most one measured return, never a dead end.
5. **The carrier is a base, not a ferry.** WORLD-LAYOUT's research: relocate it for a group of sorties, don't shuttle home after each pickup. The bot shuttles nine times.
6. **One purposeful return, never a forced one.** The pod record (C14) stays at the pod, and the ending never needs it. Where its lead sits is the coordinator's call as lore owner.
7. **Count what the player does.** Staging power and air, opening the gate, restoring the hall and the food bay, routing power and the ending are story beats. Today the recorder sees none of them.
8. **No padding and no timer changes.** The 90 s equalize, craft speeds and recipe quantities all stay.
   - **The bot's total time falls** by roughly 70 (Creel) and 170 (carrier) bot-minutes of hauling and crossing.
   - **Accepted** (coordinator, 2026-10-24): the main path is about an hour shorter, and the floor rests on content.

## 1. Diagnosis

### 1.1 Where the late game's time goes (bot minutes, measured)

| | Creel | Carrier |
| --- | --- | --- |
| Late game (the Rift to the end) | 162 | 331 |
| Craft travel in the whole run | 153 of 202 play-minutes | 232 of 371 |
| … of which in stretches over 90 s | 142 | 223 |
| Gathering calls (`procure`), late game | 23.4 | 95.7 |
| Works and ending phases | 70, with 4 beats | 131, with 4 beats |
| District visits | 3 | 3 |
| Hearthline travel | – | 109.6, of which about 101.5 in 9 crossings between the yard and the Divide or the shelf, and 8.1 local Divide movement |

Craft speed is not the artefact. The bot averages 3.7–4.2 m/s on authored Creel legs (cruise 5, with turns) and 2.85 m/s on the carrier (cruise 3).

### 1.2 The failing stretches

**Gaps over 20 min, with all four routes kept visible:**

| | Creel | No-optional | Carrier | No-optional carrier |
| --- | --- | --- | --- | --- |
| Longest gap | 50.9 | 51.1 | 94.5 | 87.4 |
| Gaps over 20 min | 1 | 1 | 4 | 4 |

- **No-optional Creel** matches its parent within 0.3 min.
- **No-optional carrier:**
  - its works gap is 7.1 min shorter than its parent's;
  - its controller-to-power gap is 24.1 min, 2.4 less than the parent's.

The bot-artefact and remainder columns below are **estimates** from the measured legs.

| Stretch | Measured: what fills it | Hauled, distance, trips | The player has | Bot artefact (estimate) | Left on today's game (estimate) |
| --- | --- | --- | --- | --- | --- |
| **G1 Creel works**, 136.7→187.5 (51) | <ul><li>Gathers the hall and food stock (452 s; glass from the isles stack, 545 m out)</li><li>Hauls to the gate hall (850 s)</li><li>Works the gate and the hall, with a 75 s idle at the panel and a second terrace descent</li><li>Sails home (756 s) and gathers 2 glass and 2 crust (424 s)</li><li>Fits the pod buffer and sails back for the ending (849 s)</li></ul> | <ul><li>42 CU in one Creel load (two 6 CU assemblies, 22 CU hall, 8 CU food), then 4 items</li><li>3.5, then 3.1, then 3.5 km</li></ul> | <ul><li>800 m Creel and rack, 800 m suit, Dart</li><li>Canopy, Rift and Divide stops; the district office (air, charge); a packed outpost kit</li><li>No crown</li></ul> | **~25 min:** the pod-buffer round trip (the ending needs only the works); gathering per recipe; the extra descent. The 15-minute trailing gap after it is artefact too. | **~22 min measured** (the 452 s gathering and the 850 s haul before the first works step). Whether a player must spend it depends on where they fabricate (below). ~4 min are uncounted works (M2). |
| **G2 carrier works and ending**, 257.5→352.0 (95) | <ul><li>Gathers the hall stock (1,820 s; glass from the headland, 1.1 km out)</li><li>Creel to the carrier, then sails to the shelf (753 s)</li><li>Two Mantle trips (42 CU > its 32 CU hold)</li><li>Sails back to the yard; gathers 2 glass and 1 crust (858 s); fits the buffer; sails out again</li></ul> | <ul><li>42 CU through the carrier stores into the Mantle</li><li>2.1 km at 3 m/s, three times</li></ul> | <ul><li>Hearthline 550 (192 CU stores), Mantle, Creel 350, Dart, 800 m suit</li><li>The crown (power and dock)</li></ul> | **~50 min:** the pod-buffer round trip (29 min, plus a 19-minute trailing gap); the hall-stock gathering, which batching makes about 12 | **~25–30 min:** the same question as G1. ~13 min are uncounted works and Mantle sorties (M2). |
| **G3 carrier Hearthline → Divide**, 89.4→140.2 (51) | <ul><li>A Creel trip to the Rift's deep seam for 2 ceramic (959 s)</li><li>Gathers 8 alloy, 3 glass and 4 crust (1,160 s, four Dart transits)</li><li>Eats at the workshop, ferries stock to the yard, sails to the Divide (639 s)</li></ul> | <ul><li>2 ceramic and 15 commons</li><li>3.8 km by Creel, about 2 km by Dart, 2.3 km by carrier</li></ul> | Hearthline 400 | **~37 min:** the Rift lips hold 16 sortable reserve; batching; eating where you are | ~11–14 min: passes |
| **G4 carrier C12 → C08**, 190.4→220.2 (30) | After C12 by Mantle: sails the carrier back to the yard, eats at the workshop, sails out to the shelf | 1.6 + 2.1 km by carrier | As G2 | **~24 min:** the shelf is 0.5 km from the Divide lee | ~6 min |
| **G5 carrier controller → power assembly**, 224.9→251.4 (26.5; 24.1 no-optional) | Mantle home, carrier 2.1 km to the yard, gather, craft | 2.1 km | As G2 | – | All: the same question as G1 |

**Passing, but artefact:** Creel C12 → the air plan, 94.5→112.8 (18.4). C12 is read in its own home-to-Divide round trip, yet it is about 70 m from the Divide dock the bot restored at 68 min.

**What remains on today's game (estimated, unverified).** The structural fact holds:
- the air, hall and food plans arrive only in the district;
- the assemblies and their commons can be met only behind you.

How much a skilled player pays for that depends on their choices. These scenarios bound it but don't establish a best-play minimum:

| Scenario | Assumptions | Measured parts | Estimated loop between the last district record and the first works step |
| --- | --- | --- | --- |
| **A: workshop return** (the bot's route, reordered) | <ul><li>No advance stock beyond known recipes</li><li>Fabrication at the island workshop</li><li>Near-home glass already spent</li></ul> | District→home 755 s; home→gate 850 s | **~41 min,** whose only beats are the two crafts (gathering and crafting ~14 min, inferred from the bot's 452 s gathering call and its craft legs) |
| **B: crown return** (`crownBenchRecipe`; the carrier already restores it; R8 for the Creel) | <ul><li>Fabrication at the crown</li><li>Alloy and crust near it, glass 685 m off, membrane about 400 m off</li></ul> | none: the district↔crown legs (about 1.5–1.8 km each way) aren't in the run | **~25–30 min** |
| **C: advance preparation** | The power plan is known at C07, so its 6 CU of stock can travel. The air, hall and food plans can't be known before the district, so their 30+ CU can't be prepared without a speculative surplus | – | Takes about 5 min off A or B |

**Stage 1 measures B** (R8, and the carrier route's crown) and reports the real figure. Until then the best-play minimum stays unverified.

All three scenarios are a haul-and-gather loop with two crafts in it. That's GAME-DIRECTION's "a chore just to fill time", and it breaks the owner's rule that purposeful backtracking is never empty-travel padding. OP-1's move of the workshop to the island cove adds about 200 m to scenario A.

### 1.3 Bot artefacts, ranked by minutes (estimates)

| # | Artefact | Evidence | Cost |
| --- | --- | --- | --- |
| B1 | **The carrier is used as a ferry:** it goes back to the yard after every sortie. | 9 crossings, about 101.5 min. Three are needed, plus two forced until stage 2. | ~45–50 min |
| B2 | **The pod buffer comes last,** as a separate home-and-back. | The resolution needs only the four works flags (`resolution.ts`). | Creel ~34 min, carrier ~44 |
| B3 | **Gathering per recipe, after arriving.** | `procure`: 23.4 min (Creel) and 95.7 min (carrier) in the late game. | 30–60 min |
| B4 | **Creel phase order.** | It goes home after the Divide for 800 m refits the restored dock offers (`REFIT_STOP_SITES`), and defers C12. | ~30 min |
| B5 | **`provision()` goes to the workshop to eat** at every later phase, from the carrier too. | The carrier has a galley, and LS-1's allotments feed you in the district (from LS-1 1b). | 2–12 min a phase |
| B6 | **The deep-seam trip for 2 ceramic.** | The two Rift lips hold 8 sortable reserve each, unsorted. | 16 min |
| B7 | **The works aren't interleaved.** | It idles 75 s at the panel while the galleries drain (`advanceWorks` drains while you're away), then descends again for route power. | ~6 min |
| B8 | **The Creel route never restores the crown.** | Its bench runs every workshop recipe, the assemblies included. | Realism; scenario B |
| B9 | **Lattice is budgeted before its use is known.** | `later.ts:415` reserves the future air assembly's lattice, and `:432` harvests 14 flank lattice, before the plan exists. That hides the preparation question (Sol F1). | Masks a structural cost |

### 1.4 What the measure misses (measurement, not game)

- **M1, landmark passes** (REC-2, routed).
  - POI-1 measured the four deep legs at 59 s or less between marks at 5 m/s (about 80 s at the bot's speed).
  - The recorder breaks travel only at gathers and new things, so a six-leg journey counts as one 850 s stretch.
- **M2, works and ending beats** (REC-2; coordinator, 2026-10-24).
  - Staging power and air, opening the gate (which opens the inner hall), restoring the hall and the food bay, routing power and the ending never appear.
  - A dense finale reads as a gap, and each run ends on a 15–19 min trailing gap.
- **M3, perceived threats** (owner, 2026-10-24).
  - A predator you can hear counts only while its warning cue plays. REC-2 implements it.
  - It applies to most of the 10 early quiet-run stretches.

### 1.5 The long stretches by source

- **Creel (31):**
  - **Early, 10:** before minute 41. OP-1 rebuilds these legs, and M3 settles how they're measured.
  - **Mid, 9:** the Rift and Divide. Stage 1 removes the 2 home legs after the Divide.
  - **Late, 12:**
    - 5 are trips between the district and home (stage 1 removes 2; stage 2 swaps the forced pair for the chosen home visit);
    - 2 are C12's own round trip (stage 1);
    - 2 are the C11 Dart run;
    - 3 are inside the district.
- **Carrier (55):**
  - the same 10 early;
  - about 45 from the Rift on: 9 crossings, about 12 Dart and Creel transits inside gathering calls, the seam trip, and the Mantle sorties.
- **Expected effect:**
  - Bot fixes remove about 4 (Creel) and 20 (carrier).
  - M1 should split most of the rest.
  - What still reads long is reported for judgement (owner, 2026-10-24), not failed.

## 2. The structural problems, ranked

1. **The ending's needs are met only behind you.**
   - **Plans:** the air, hall and food plans come only from district records (C08, C10, the gate panel, the controller). The power plan comes from C07 on the Divide.
   - **Fabrication:** the assemblies are made only at the island workshop or the crown. The carrier's fabrication is S9 design text with no code.
   - **Materials:** four of their commons have no source beyond the Basin: glass, membrane, resin and crust.
   - **Result:** a haul-and-gather loop, estimated at 25–41 min (1.2).
2. **Late material geography points backward.**
   - **Finite near home:** glass near home is 36 units with no renewal. By the late game it's spent, so 2-glass top-ups mean runs to the stack (545 m) and the headland (1.1 km).
   - **Nothing at the frontier:** the Divide and district hold only lattice, ceramic and one alloy cache. GAME-DIRECTION wants the reliable supply at the frontier.
3. **Two late materials have no district source, and nothing tells you to bring them.**
   - **Core:** it's needed by the power assembly and found only at the Rift. Its plan is read at C07, after you've left the Rift.
   - **Lattice:** it's needed by the air assembly and found only on the Divide, though its east flanks lie about 190–260 m from the district office in a straight line. Its plan is read in the district.
   - **Why it matters:** this is the same backward pull as problem 1, at smaller scale. The bot hides it (B9).
4. **Some legs may be dull, unmeasured.**
   - **The carrier lanes** at 3 m/s: POI-1's Divide↔Meridian stretch is 98 s at carrier speed.
   - **The district terraces**, the shelf approach and the isles-to-Canopy-east lanes were never in POI-1's set.
   - **Under the owner's guide** these are judged, not failed.
5. **The carrier's refit loop (Divide → yard → Divide) is by design and is kept.**
   - **Why it's forced:** the 550 m refit and the Mantle need Divide lattice and the yard's slips.
   - **Why it's kept:** there are new things at both ends, and after the bot fixes its gaps are 10–11 min.

## 3. Fixes (no padding)

| Fix | Player outcome | Systems and files | Owner | Pacing effect | Economy effect |
| --- | --- | --- | --- | --- | --- |
| **F1 Works bench at the staging office** | The two assemblies are made in the district, at the office where the works were first staged. The bench pays from the diver hold and a craft moored at the office (no new locker). | <ul><li>`content/stops.ts`: `meridian_office.fabrication`</li><li>The office in the typed campaign fabrication-site authority (`FabricationSite` / `CampaignSiteId`)</li><li>`sim/progression.ts`: `REFIT_STOP_SITES` folded into one stop-recipe table with the assemblies at the office; payment through the existing `fabricationContainers` and SYS-1's `planSpend` / `applySpend`</li><li>`sim/story/reachability.ts`</li><li>The text in `content/proposals/progression.ts`</li></ul> | PACE-1 stage 2 | Removes the forced loop on the independent route (G1: −25 to −40 min). Creel's longest goes from 850 to about 610 s. | `sim/campaignEconomy.ts`'s works acts and failure cargo model the office bench. No cost change. |
| **F2 District habitat sources** | Short sorties from the office, each found by a rule you learned at home:<ul><li>membrane from the filter colonies at the district's intakes (it regrows);</li><li>glass where the turbine outflow scours;</li><li>crust on the supply pylon's grounding fins clear of silt.</li></ul> | <ul><li>S2 rows in `content/regions/sites.ts`, lifted in `content/campaign/sources.ts`</li><li>One membrane renewal row, composed into `SOURCE_RENEWAL` by the fauna rows' one-line spread (coordinator)</li><li>Existing source assets (`render/expedition.ts`, no edit)</li></ul> | PACE-1 stage 2 | Gathering is local, within the research's 2.4–3.8 min sortie budget from the shelf. Finds break empty travel; they aren't counted as new. | The finale's need (glass about 10, membrane about 11, crust about 7) plus about half again. Glass and crust are finite with a reserve; nothing is cave-only. |
| **F3 Hall and food from frontier materials** | The hall frame and the food bay use the district's own ceramic (the terrace cut, 290 m from the office) instead of Canopy resin. | `STORY_RECIPES` in `content/story/evidence.ts`: resin 2 becomes ceramic 2 in each | PACE-1 stage 2 (lore note) | Nothing to bring from home | <ul><li>Ceramic +4 against about 72 in the world (late demand is 30 or less); resin −4</li><li>Stock volume rises from 22 + 8 to **24 + 10 CU** (ceramic is 2 CU)</li><li>34 CU exceeds the Mantle's 32, so the two restorations take separate loads, as the moored-payment test does</li></ul> |
| **F4 Evidence for what comes from behind** | <ul><li>**Lattice:** the works' sealed air hardware is on show at the Divide's upper service dock (where both routes read C07): a staging air housing with lilac lattice seal rings and two empty seal seats, under a weathered works tag. A cryptic tag or an optional decoded log can add to it; there is no shopping list.</li><li>**Core:** the Rift materials station's core cradles, two tagged for the works' staging power, stand empty.</li><li>Each is found before you leave its region.</li></ul> | <ul><li>Two scannable fixtures in the story host table (`content/story/placements.ts`), drawn through the existing placed-host renderer</li><li>A box-shaped housing and a rack collide exactly (no COL-1 debt)</li><li>Scan lines in the story content</li><li>The optional decoded line through LS-1's notes table, by agreement</li><li>Detail in the spoiler notes</li></ul> | PACE-1 stage 2 (the coordinator checks story fit) | **With the clue:** one district visit. **Missed:** one measured return, about 190 m to the Divide's east flank for lattice; a Divide-to-Rift side trip of about 800–900 m for core, made after C07 reveals the plan. | None (fixtures, not stock) |
| **F5 Count the works beats (M2)** | None: it's measurement. | `sim/timeline/recorder.ts` diffs `story.works` and `story.resolution`, emitting `new` events with `what: "story"` (the fixtures are in section 5) | **REC-2** (coordinator, 2026-10-24). PACE-1 supplies the fixtures. | G1 and G2 lose 4–8 min; the trailing gap goes to 0. Reported apart from routing savings. | None |
| **F6 Landmark passes (M1)** | None: it's measurement. | REC-2's lift of POI-1's noticeable marks into one content module, plus a "point of interest passed" event | REC-2 (routed) | Most late long stretches split | None |
| **F7 Marks where a leg is genuinely dull** | Something worth seeing where a long leg is actually boring | POI-1's kit (`content/poi/sets.ts`, `content/poi/legs.ts`, `render/poi/dressing.ts`, `tests/poi.test.ts`) | PACE-1 stage 3, by judgement | No target number | None |
| **F8 (optional) the outflow current** | The glass source sits in a turbine outflow you cross by reading the glimmers leaning into moving water | One authored flow volume, only if CY's volumes are composed on root at stage 2 | PACE-1 stage 2 | None | None |
| **F9 Carrier fabrication** (coordinator, 2026-10-24) | Aboard the Hearthline, a powered fabricator module in a fabrication-bench socket runs S9's carrier list: the two assemblies, glow lures and startle ink. It pays from the diver hold and the carrier stores. | <ul><li>`sim/progression.ts`: the carrier joins the recipe-site table, valid aboard with a powered fabricator socketed</li><li>`sim/inventory.ts`: `fabricationContainers` for the carrier site</li><li>`sim/carrierStations.ts`: the bench interaction</li><li>`content/campaign/fleet.ts`: the services text reads from the one table, not a second list</li><li>`STORY_RECIPES.site` becomes true</li></ul> | PACE-1 stage 2 | Removes the forced loop on the carrier route (G2 and G5: −25 to −30 min). The carrier stays at the shelf. | Same costs; the ledger's carrier strategy fabricates aboard |

**F1 and F9 split the routes:**
- the office bench serves the independent route;
- the carrier's own bench serves the carrier route;
- a carrier player may use either.

Neither makes the other redundant: removing the office strands the independent route, and removing the carrier bench leaves the carrier's socket unused.

**Not done, deliberately:**
- a shorter equalize, faster craft or smaller quantities;
- fast travel;
- caches holding finished assemblies;
- a shopping-list lead.

## 4. Bot changes (separate from game changes)

**Rules:**
- Each rule is a general routing rule with its own fixture.
- No phase moves to put a beat inside a gap.
- The reviewer checks both.

| # | Rule | Replaces |
| --- | --- | --- |
| R1 | **Eat where you are:** the diver hold, a craft or carrier pantry and galley, or the nearest food. No phase starts with a trip home to eat. | `provision()` |
| R2 | **Plan an expedition's stock once,** from what the bot has *read*:<ul><li>known recipes;</li><li>needs implied by clues it has seen, from a bot-side table of clue fixture → item and count, each entry tested against a placed fixture, with the place it was seen logged.</li></ul>Gather in one pass per region, nearest stock first, before crafting. The pre-budget at `later.ts:415`/`:432` is deleted (B9). | per-recipe `stockUp`/`procure` |
| R3 | **Do a known task within reach:** on the current route, or within about 150 m of a stop. Examples: C12 at the Divide dock; refits where a restored stop offers them. | the deferred C12; the refits at home |
| R4 | **The carrier moves for a group of sorties.** It parks at the farthest mooring the next sorties need, and returns to the yard only for yard-only work. | yard returns after every sortie |
| R5 | **Interleave:** stage power and air, isolate, start equalizing → hall and food bay → open, route power → the ending. | the idle at the panel and the extra descent |
| R6 | **Sort before travelling** when exposed stock is short and the source has a reserve. | the seam trip |
| R7 | **Charge at the stop you're at.** | the 75–139 s shelf detours |
| R8 | **Restore hubs you pass,** where the ledger allows. Here: the crown's first two stages on the Creel route's way to the Rift. It measures scenario B. | the Creel route skipping the crown |
| R9 | **Log every return with its reason,** derived from the game's own authority:<ul><li>`recipeSites` / `craftingBlock` for where a recipe can run;</li><li>`fabricationContainers` / `planSpend` and the source table for accessible stock.</li></ul>For example: `service_air_assembly: brine_lattice 0/2 accessible; nearest stock divide_lattice_flank_north`. There is no hand-written explanation table. | nothing |

**The late sequence:**
- **Stage 1** (today's game):
  - **Creel:** the Rift (the crown, R8) → the Divide (lattice, C07, the dock, C12, the 800 m refits) → the district records → back, forced. It returns to the crown or the workshop for the assemblies and stock (lattice on the way, from the flank) and the pod record → then the district works and ending.
  - **Carrier:** the Rift and the crown → the Hearthline → the Divide (lattice, C07) → the yard (refit, Mantle, 800 m suit, pod record, C11, batched stock) → the Divide (C12) → the shelf and the records → the crown, forced (the assemblies and hall stock) → the shelf → the works and ending.
- **After stage 2:**
  - **Creel:** the Divide → home (the pod record, C11, resupply) → the district (records, office, works, ending), with no return.
  - **Carrier:** the yard visit → the Divide → the shelf, parked to the end, fabricating aboard.
  - **Both:** the coordinator may move the pod record's lead. If it moves, the stage 2 bot reads the record between the works and the ending, as one optional return of about 27 min.
- **Phase IDs are kept** (the library's milestones).

**Files:**
- **Owned by PACE-1:** `scripts/playthrough/later.ts`, a new pure `scripts/playthrough/stock.ts` (the stock plan and the clue table, unit-tested), and the late rows of `pacing-debt.ts`.
- **Not touched before LS-1 1a merges:** `live.ts`, `scenarios.ts`, `run.ts` and `driver.ts`.
- **After that merge, through `scenarios.ts`'s owner, in the same integrated stage candidate:**
  - **The branch moves:** `tour` and `over-geared` branch from `creel@deep-records` (home, with the 800 m Creel and the required stock). Today they branch from `creel@divide`, which will end at the Divide dock.
  - **The stage 2 adverse scenarios.**
- **Branch proof:** both branches are proved and the library is re-exported.

## 5. Stages

| Stage | Outcome | Files owned | Needs | Tests and evidence | Adverse case |
| --- | --- | --- | --- | --- | --- |
| **1: the bot plays like a sensible player** | <ul><li>R1–R9 on both routes</li><li>The ending lands in the same visit as the works</li><li>Every remaining return is logged with its reason</li><li>Scenario B is measured</li></ul> | `later.ts`, new `stock.ts`, the late rows of `pacing-debt.ts`; the branch moves through `scenarios.ts`'s owner | LS-1 1a merged (measured against that merged baseline, not the old ceilings) | <ul><li>Fast tier</li><li>Stock-plan and clue-table unit tests</li><li>A leg-log check that no later phase opens with a meal-only trip home</li><li>Queued playthrough `--machine any`: 9/9 with reloads matching, the acceptance figures, the R9 log, both branches proved</li><li>Save-library re-export</li><li>No images</li></ul> | A run whose lip reserve is already spent: R6 falls through to the seam, and R9 names the reason. |
| **2: stage the works where the works are** | <ul><li>F1–F4 and F9 (F8 if CY allows)</li><li>Both routes finish the district with no forced return when the clues were read</li></ul> | <ul><li>`content/stops.ts`, the fabrication-site types</li><li>`sim/progression.ts`, `sim/inventory.ts`, `sim/carrierStations.ts`</li><li>`content/campaign/fleet.ts`</li><li>`content/story/evidence.ts` (two recipe rows)</li><li>`content/story/placements.ts` and the story content (two clue fixtures)</li><li>Rows in `content/regions/sites.ts` and `content/campaign/sources.ts`</li><li>The renewal row (coordinator)</li><li>`sim/campaignEconomy.ts` (works model, carrier fabrication, and the crown stages as a credible optional spend on both routes)</li><li>`sim/story/reachability.ts`</li><li>`render/fieldKit.ts` (an office host offset, if needed)</li><li>`later.ts`, `stock.ts`</li></ul> | Stage 1. No CW-1 file. | <ul><li>`npm run gate` with all six economy scripts</li><li>Tests:<ul><li>the assemblies are made at the office, and aboard with a powered module, and are refused elsewhere, without the module, or without power;</li><li>the new datums sit on the floor;</li><li>the clue fixtures are placed and scannable before you leave their region;</li><li>the hall and food bay are paid from a Mantle moored at the bay in separate loads;</li><li>the ledger with ceramic</li></ul></li><li>2–4 images: a habitat, the office bench, the Divide housing</li><li>One 4070 district check</li></ul> | <ul><li>**A1, clue read:** from `creel@divide` and the carrier's Divide milestone, stock is trimmed to exactly what known recipes and seen clues justify (no inherited surplus, no optional rewards). One district visit to the ending, and R9 logs zero returns.</li><li>**A2, lattice clue missed:** as A1 without visiting the housing. Exactly one return, logged and measured (time and distance; expected about 190 m to the east flank, route confirmed here).</li><li>**A3, core clue missed:** exactly one Divide-to-Rift side trip after C07, measured.</li><li>The office bench without the air plan refuses, naming it, with nothing consumed.</li></ul> |
| **3: judged legs** | <ul><li>F7 by judgement: every late leg still reported long after F6 is looked at, at its craft's real speed (Dart 8, Creel 5, Mantle 4, carrier 3 m/s)</li><li>A mark goes in only where the leg is genuinely dull, and each decision (mark or none) is recorded with its reason</li><li>The stage may add nothing</li></ul> | `content/poi/sets.ts`, `content/poi/legs.ts`, `render/poi/dressing.ts`, `tests/poi.test.ts` | REC-2's F6 | <ul><li>The judgement table</li><li>For any mark: REC-1 fixed views tagged `poi`, 2–4 images, a 3090 `--class exclusive` frame check at the mark and a 4070 check</li></ul> | A Dart at full speed past a new mark shows no streaming hitch over 33 ms. |

**F5's fixtures for REC-2** (through the real commands and the real analyzer):
1. **Full works sequence:** power, air, isolate, equalize, open, hall, food, route power, begin, complete. It gives exactly seven `new` events, in order, each once: `works:power`, `works:air`, `works:gate-open`, `works:hall`, `works:food`, `works:hall-power`, `resolution:complete`. Isolate, equalize and begin give none.
2. **Refused actions** give no event: power without the assembly, the hall without stock, begin before the requirements.
3. **A reload after power and air** (`resumeRecorder` from the export) gives no repeat of either; later beats still fire.
4. **`newContent`** counts the seven once, and a repeated notice of any of them fills no gap.

**The ratchet** (`pacing-debt.ts`):
- **What's gated:** the longest gap and decode-only waiting stay hard gates (owner, 2026-10-24).
- **What's reported:**
  - Empty stretches are reported for judgement and kept as recorded figures.
  - Turning them from a failure into a report is a change to the acceptance (`sim/timeline/acceptance.ts`). That belongs to its owner, REC-2 after LS-1. Until it lands, PACE-1's rows keep them as ceilings.
- **Projections:** these are projected from LS-1's runs. Each merge records the measured figure, against LS-1's R1-fixed baseline.

| After | Longest gap, Creel / no-opt / carrier / no-opt carrier | Empty stretches over 90 s (reported) | Longest stretch (s) | Lowered by |
| --- | --- | --- | --- | --- |
| Today | 50.9 / 51.1 / 94.5 / 87.4 | 31 / 31 / 55 / 55 | 850 / 850 / 753 / 753 | – |
| Stage 1 | about 23 / 23 / 25 / 25 | about 26 / 26 / 32 / 32 | about 850 / 754: a forced haul remains | PACE-1 |
| F5 (REC-2) | about 15 / 15 / 18 / 18 | – | – | REC-2 |
| Stage 2 | 15 or less on all four | about 24 / 28 | about 610 / 600 | PACE-1 |
| F6 (REC-2) | – | late: only legs judged in stage 3 | – | REC-2 |

An entry is deleted when all four routes pass the hard gates.

**Coordination:**
- **CW-1:** no stage touches a CW-1 file.
- **LS-1:**
  - stage 1b's planter move in `live.ts` doesn't reach `later.ts`;
  - its allotments feed the finale, and the new sources keep at least 40 m clear of them;
  - the optional decoded line for F4 goes through its notes table by agreement.
- **REC-2:** F5 (with the fixtures above), F6, M3, and the acceptance's report-not-fail change.
- **OP-1:** the workshop relocation stays in the stage 1 and 2 measurements.
- **SAVE-1 library:** late milestones change at stages 1 and 2. Consumers re-derive after `saves-export.sh`.
- **Save schema:** none expected; the coordinator confirms at stage 2.
  - New sources are additive rows (S7).
  - The office bench and carrier fabrication add no container.
  - The clue fixtures are scan records derived from saved scans.

## 6. Owner answers (2026-10-24) and follow-ups

**Owner answers:**
1. **The 90 s rule is a spacing guide.** Empty legs are reported for judgement, while the new-content gap and decode-only waiting stay hard gates. A predator you can hear counts only while its warning cue plays. This revision applies both: the ratchet above, and stage 3's judgement.
2. **Carrier hold-course: yes,** for long journeys in the carrier along lanes already sailed; otherwise you always steer.

**Follow-ups:**
- **Hold-course stream:** a small stream of its own after stage 2.
- **Late-game needs are inferred from evidence** (owner, 2026-10-24): this is F4.
- **The pod record's lead:** the coordinator decides, as lore owner. The stage 2 bot follows that decision.

No owner questions are open.

## Known limits and compromises

- **The finale gets shorter** by about an hour of hauling on the main path. That's accepted, with no padding.
- **The figures are projections** until each stage measures them. The best-play minimum on today's game is unverified until stage 1 measures scenario B.
- **The early stretches** stay recorded until OP-1 rebuilds those legs and M3 lands.
- **The carrier's refit loop stays** (section 2, item 5).

## Review responses

**R1** (Sol, `review/pace-1-r1`, `0891ed9e`), plus the coordinator's rulings and the owner's amendment:

| Finding | Disposition | Where |
| --- | --- | --- |
| **F1 [P2]** lattice for the air assembly | **Fixed.** The owner's amendment applies: no shopping list. Physical evidence (the Divide housing with lattice seal seats; the Rift's empty tagged core cradles; an optional cryptic or decoded line) sits where each material is found, before you leave. The bot's secret pre-budget is deleted, and the planner reserves only for known recipes and seen clues, with each clue's place logged. A1 (clue read: one visit), A2 (lattice missed: one measured return) and A3 (core missed). No district lattice source: the Divide keeps its material, and its east flank lies about 190 m from the office, so a miss is never the old slog. The earlier Rift plan grant is withdrawn in favour of the evidence. | Design call 4; §2 item 3; F4; R2; B9; stage 2 adverse cases |
| **F2 [P2]** the 41-minute figure | **Fixed.** It is labelled as the workshop-return scenario with its assumptions, beside the crown scenario and advance preparation. Measured legs are separated from inferred savings, and the best-play minimum stays unverified until stage 1 measures scenario B. "Every need surfaces in the district" is corrected: power comes at C07. | §1.2 *What remains*; design call 1; §2 item 1 |
| **F3 [P3]** baseline summaries | **Fixed.** All four routes are shown: no-optional carrier 87.4 against 94.5, and its controller-to-power gap 24.1 against 26.5. The nine crossings take about 101.5 of 109.6 Hearthline minutes, the rest being 8.1 min of local Divide movement. | §1.1; §1.2; ratchet |
| Notes: ceramic CU, typed fabrication site, R9 from authority, branch proof, OP-1 in measurements, isolate and equalize not beats, the merged baseline | **Adopted.** | F1, F3, R9, §4 files, stages, F5 fixtures |
| Coordinator: carrier fabrication | **In stage 2 (F9),** with the office bench kept. Each serves one route. | F9 |
| Coordinator: crown ledger; `scenarios.ts` after the LS-1 merge; F5 to REC-2; pod lead; shorter path | **Adopted.** | Stage 2; §4 files; F5; §6; known limits |
| Owner: the 90 s guide, the predator cue, hold-course | **Adopted.** Empty stretches are reported, not gated; stage 3 is judgement only; hold-course is a follow-up stream. | Ratchet; stage 3; §6 |
