# Hearth Reef

Content bible, region file. Area `refuge_reef`. Data: [`src/content/proposals/reef.ts`](../../../src/content/proposals/reef.ts) (typed, not wired). Index: [BIBLE](../BIBLE.md).

Coordinates are metres (x east, y up with water at 0, z north). ⟂ marks a point that needs new terrain or cave rock first, so it is not checked against today's floor. Everything else is checked against `worldFloor` by `tests/content-proposals.test.ts`.

## 1. Identity

- **Mood:** comfort and learning. Safe enough to make mistakes, rich enough that every short swim finds something. It stays useful all game: food, membrane and the pod.
- **Palette:** mint and jade water, warm shell-coloured ribs, coral and amber fans, pale banded limestone on the west shelf. At the shelf break the water turns blue, then petrol below 60 m.
- **Sound:** surf hush overhead, the fans' soft ticking, schools turning; a low hum from the dead intake. The gully below carries a deeper, colder drone: the only hint of something larger.
- **First view:** the opening sequence's window clears onto the twin ribs framing a luminous reef, the island silhouette behind (canon). The second first view is the Colonnade: five leaning limestone arches across the west shelf, pointing back home.

## 2. Landmarks

**Anchors (3)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `reef.pod_ribs` | existing | 0, 0, 14 | place `home_pod`, place `reef_ribs` | The pod on its reef ramp framed by two curved basalt ribs; the island silhouette behind. | Home: storage, crafting, healing, and the bearing every early trip returns to. |
| `reef.colonnade` | new | -450, -22, 70 | `reef_archlet`, `reef_bellhole` | Five limestone arches in a curving line across the west shelf, the tallest 14 m, all leaning the same way like a frozen wave. Their line points back east to the pod. | The west shelf's silhouette and a natural bearing line. Three small caves sit in its feet. |
| `reef.drop_overlook` | existing | -236, -40, -100 | site `reef.hearth_drop`, vista `drop.arch` | Marker posts and the rock arch at the head of the gully; the water darkens below. | The first sight of something deep: the gully leads down to the Basin's west lobe. |

**Discovery clusters (7; 10 with the anchors)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `reef.intake_apron` | existing | -17, -7, -8 | place `reef_ribs`, source `reef_ribbon_catch_north` | Open fans thriving beside the abandoned intake pipes; ribbons collecting in the lee. | C02 and the first resource grammar: membrane collects downstream of fans. |
| `reef.fan_terraces` | extend | -290, -11, -61 ⟂ | cave `fanvault` | Stepped limestone terraces with a skylight beam falling into the Fanvault. | The first cave: roof contact, lamp, and an exit you recognise from inside. |
| `reef.nursery_flats` | new | -200, -17, 40 | site `reef.hearth_drop` | A sandy flat covered in staple cups, reef schools turning over it in the afternoon light. | A second food field away from the pod, and cuttings for the first planter. |
| `reef.grazer_lookout` | new | -160, -14, -20 | source `reef_glass_ridge_south` | A low ridge where grazers work in a line, leaving bright scars with glass in them. | A third glass patch, and the place a scan names the scar-search rule. |
| `reef.pumphouse` | new | -380, -23.5, -20 | `reef_pumphouse_undercut` | A squat concrete pump house half-swallowed by fans, its door hanging, a dead console inside. | The reef's lost site: the decoder's first worthwhile log, and a bearing to the hub crown. |
| `reef.wrack_garden` | new | -520, -23, 130 | `reef_wrackhollow` | Ribbon sheds piled in slow drifts by the north-west current, swaying like a field of grass. | Where the current dumps membrane: an easy bulk patch and the way into the Wrackhollow. |
| `reef.gully` | new | -228, -97, -200 | site `basin.west_gate`, `reef_drop_cathedral` | A steep limestone gully; the Drop Cathedral's lower mouth glows faintly in its west wall. | The shortcut down to the Basin, and the early view of a place you cannot stay in yet. |

## 3. Caves

**Cave style:** Limestone arches: pale banded rock, rounded vaults, skylights and ceiling mats of glimmers. Caves open off the west shelf and the shelf break; nothing dark is more than one turn from daylight.

**Cave resident:** `vault_glimmer` (Vault glimmers). Pin-sized glowing shrimp in mats on limestone ceilings. Mats lean toward the moving water of the nearest mouth, so a lamp-off diver can read the way out.

Reef caves teach the cave grammar before anything is at stake. The **Colonnade network** (`reef_archlet`, `reef_bellhole`, `reef_wrackhollow`) is three short caves joined by crawlways in the arches' feet. The **Fanvault network** adds `reef_fan_crawl` and `reef_shelf_lip` to the accepted Fanvault loop, carrying the first cave on down to the shelf break. Two medium caves give the Dart its first underground hall: the Lantern grotto on the west shelf break, and the Drop Cathedral, which turns the open gully into a sheltered descent toward the Basin.

**Small caves (7, plus the existing Fanvault loop (W1-pre, diver-only teaching cave))**: diver-only, 10–25 m of water.

| ID | Mouth (x, y, z) | Footprint | Depth m | Network | Layout | Contents | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `reef_archlet` | -452, -20.4, 100 | -466..-438 × 88..112 | 17–23 | colonnade | A 14 m tunnel through the foot of the north arch; a crawlway leaves its west wall toward the Wrackhollow. | Glimmer mats on the low ceiling; A dive-school slate with depth marks | `reef_wrackhollow`, `reef_bellhole` |
| `reef_bellhole` | -446, -23, 60 | -460..-432 × 46..74 | 19–26 | colonnade | An 18 m dome under the middle arch with a single mouth and a high bell-shaped ceiling; a crawl joins the Archlet. | Densest glimmer mats on the reef; Dive-school locker (side reward) | `reef_archlet` |
| `reef_wrackhollow` | -505, -22.8, 118 | -522..-490 × 104..134 | 20–27 | colonnade | A 22 m catch cave whose mouth faces the current: sheds pile inside against the back wall. Crawlway east to the Archlet. | Renewable rich membrane catch; Ribbon fan cuttings outside the mouth | `reef_archlet` |
| `reef_pumphouse_undercut` | -366, -23, -28 | -378..-354 × -44..-24 | 21–27 | — | A 12 m undercut beneath the pump house's foundation slab; the old intake pipe runs through it. | Intake pipe grating with crust fins (frontier sample) | `reef.pumphouse` |
| `reef_fan_crawl` | -310, -31, -104 | -322..-298 × -116..-92 | 26–34 | fanvault | A 20 m crawl from the Fanvault's south mouth down to the shelf edge; one squeeze, lit at both ends. | A short practice for the lamp-off retreat | cave `fanvault`, `reef_shelf_lip` |
| `reef_shelf_lip` | -350, -43, -125 | -364..-336 × -138..-112 | 38–47 | fanvault | A 15 m cave under the shelf break overhang, opening onto blue water and the first view of the slope. | Glass nodules scoured by the down-slope current | `reef_fan_crawl` |
| `reef_gully_window` | -205, -59.5, -165 | -218..-192 × -180..-152 | 55–66 | — | A 16 m cave on the gully's east wall with a round window looking down into the Basin's dark. | A survey bolt line pointing south (map hint to the hub spur) | `reef_drop_cathedral` |

**Medium caves (2)**: 30–80 m, a loop with two or more exits; the main hall takes the craft listed.

| ID | Mouth (x, y, z) | Footprint | Depth m | Hall admits | Layout | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| `reef_lantern_grotto` | -470, -43.5, -110 | -510..-440 × -150..-90 | 32–62 | small | 60 m, three chambers in a loop: shelf mouth at 34 m into a glimmer hall big enough to turn a Dart, a diver-only side gallery of glass, and a slope mouth at 58 m. | Cave-favoured glass; Glimmer hall; Parked-Dart turning bay |
| `reef_drop_cathedral` | -262, -64, -150 | -300..-240 × -200..-130 | 55–100 | small | 70 m: a tall chamber in the gully's west wall entered beside the arch, a Dart-wide ramp spiralling down, and a lower mouth onto the gully at 95 m. Diver crawl east to the Gully window. | The quick way down to the Basin west gate; First lamp-only chamber |

## 4. Creatures

| Species | Role | Status | Cave-dweller | Where | Noise | Light |
| --- | --- | --- | --- | --- | --- | --- |
| `ledge_grazer` Ledge grazer | cue | existing | no | Intake ridges, grazer lookout, shelf-lip glass | Drifts off a ledge when a craft boosts within 10 m; returns after it passes. | Indifferent. |
| `filter_ribbon` Filter-ribbon colony | cue | existing | no | Intake apron, fan terraces, wrack garden upstream face | None. | None. Its posture, not its glow, is the cue. |
| `reef_school` Reef school | benign | existing | no | Around the ribs, the Colonnade arches and the nursery flats | Tightens and turns away from a boosting craft. | Gathers loosely at the edge of a lamp cone at night. |
| `vault_glimmer` Vault glimmers | cue | new | yes | Ceilings of every reef cave. Cave resident; teaches the lamp switch. | None. | Dim to nothing inside a lamp cone; brighten again 3 s after it leaves. Teaches the lamp switch. |

No threat lives here, by design: nothing interrupts the first sanctuary (canon). Glimmers are the reef's own animal and the cheapest cave cue in the bible: lamp-off, their mats point to the moving water of the nearest mouth.

## 5. Resources

- **Required here, outside caves:** alloy (intake service scraps east and west), glass (grazer ledges north and south), membrane (ribbon catches north and south) and meals (staple cups). All are existing registry sources and unchanged.
- **Rare early sample:** two conductive crust on the old intake grating (`reef_pumphouse_crust`), so the player meets crust before its use is known.
- **Cave-favoured:** the Wrackhollow and the Fanvault pocket hold renewable membrane catches, and the Lantern grotto holds a glass gallery. These are richer, but never required.
- **Seeds:** staple cups from the nursery flats and ribbon fans from the wrack garden. These are SYS-2's reef seeds, given second, exterior patches.

| ID | Kind | Item | At (x, y, z) | Stock / bundle / reserve | Renews | Cave | How you read it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `reef_pumphouse_crust` | frontier sample | `conductive_crust` | -366, -24, -32 ⟂ | 2 / 1 / 0 | no | `reef_pumphouse_undercut` | Ridged crust on the grating fins, the only crust on the reef, where the old pipe still grounds to rock. |
| `reef_pumphouse_scraps` | exterior | `structural_alloy` | -384, -23.5, -14 | 8 / 4 / 8 | no | — | Tagged panels fallen from the pump house walls. |
| `reef_grazer_glass_west` | exterior | `silica_glass` | -160, -14, -20 | 8 / 2 / 8 | no | — | Grazers work the ridge in a line; clear nodules sit in the fresh scars. |
| `reef_wrackhollow_membrane` | cave favoured | `flex_membrane` | -512, -25, 124 ⟂ | 16 / 4 / 0 | yes | `reef_wrackhollow` | The mouth faces the current; sheds pile against the back wall. |
| `reef_fanvault_pocket_membrane` | cave favoured | `flex_membrane` | -304, -24, -64.5 ⟂ | 8 / 4 / 0 | yes | `fanvault` | Drifting sheds collect in the dark side pocket. |
| `reef_grotto_glass` | cave favoured | `silica_glass` | -485, -48, -125 ⟂ | 10 / 2 / 0 | no | `reef_lantern_grotto` | Glass nodules weather out of the gallery wall; no grazer needed in here. |
| `reef_nursery_meal` | exterior | `meal` | -205, -16.5, 45 | 8 / 2 / 0 | no | — | Staple cups by hand, like the pod's own nursery. |
| `reef_nursery_cuttings` | seed | `seed_staple_cup` | -198, -16.7, 36 | 4 / 1 / 0 | no | — | Mature cups with budding runners. |
| `reef_wrack_cuttings` | seed | `seed_ribbon_fan` | -516, -23, 126 | 4 / 1 / 0 | no | — | Young fans rooting in the drift's upstream edge. |

## 6. Side rewards and lost site

| ID | Kind | At (x, y, z) | Reward |
| --- | --- | --- | --- |
| `reef.cathedral_shortcut` | shortcut | -262, -64, -150 | A sheltered 55→95 m descent that cuts the gully's open slope and points straight at the Basin west gate. |
| `reef.dive_school_locker` | cache | -446, -24, 66 ⟂ | Two reserve cells and a laminated cave-signals card (the scan explains glimmer mats lean toward moving water). |
| `reef.slope_view` | view | -350, -43, -125 | From inside the Shelf lip the slope falls away blue to black: the first framed view of depth. |

**Lost site `reef.pumphouse_site`: Old intake pump house** at -380, -23.5, -20. A dead console behind a hanging door; a pressure log cabinet sealed with fan growth. It is found without decoding; its records stay unreadable until decoded.

- Decode `reef_pumphouse_log` (log): unlocks `reef_pumphouse_terminal`.
  - Plans: `bp_locker_extension`.
  - Map reveals: Spur crown bearing (hint, `hub.crown`, 90 m); Lantern grotto (site, `reef_lantern_grotto`, 50 m).
  - Logs: Commissioning notes from the expedition's first year: the intake ran clean, and the crew was cheerful about it. A rota of complaints that fans keep colonising the intake mouth faster than anyone expected. A shorter later entry moving the intake east, to the ribs, 'where the water is better'.

Canon fit: the pump house is from the expedition's first year, before the intake moved to the ribs. Its log humanises the expedition and teaches the decoder on low stakes. Its tie-ins are in the [spoiler appendix](../../spoilers/CONTENT_BIBLE_LORE.md).

## 7. Cycle candidates

| ID | Cycle | Period / active s | What it is for | Alternative | Verdict | Honest note |
| --- | --- | --- | --- | --- | --- | --- |
| `reef.fan_shed_pulse` | Fan shed pulse | 240 / 20 | Wrack-garden fans release a visible plume of sheds; fresh sheds add 2 membrane to the nearest catch. | Catches already hold stock and regrow on the existing renewal rule. | likely cut | Pretty, but there is no decision in it. Keep as ambience on the renewal tick if anything. |

## 8. Pacing check

Skilled first-time play: **about 35 minutes on the main path, 75 with the optional content here**, summed over every visit.

| Minute | Something new | Kind |
| --- | --- | --- |
| 0 | Wake in the pod; damaged regulator | story |
| 8 | Repair the pod; scanner and service tool | tool |
| 14 | Intake and living filters (C02) | story |
| 22 | 150 m suit | tool |
| 30 | Fanvault: first cave, lamp, skylight exit | area |
| 45 | The Colonnade and its glimmer caves | discovery |
| 55 | Pump house lost site; first decode queued | discovery |
| 68 | Drop Cathedral: the way down and the first Basin view | area |

The main path here is the opening: pod, intake, suit, about 35 minutes. Optional reef content is spread across returns. The Colonnade and pump house suit a stop on the way to the workshop, and the Drop Cathedral is the natural first trip toward the Basin once the suit allows 100 m. The 20-minute gaps are the outer limit; most reef beats come every 10–15 minutes.

## Builder notes

- Keep the opening's legacy preserve untouched: every new cave is outside it (the test enforces this).
- The Colonnade arches are A1-style vista pieces (art and collision from one source). The caves in their feet are W1 kit caves; the arch solids must leave the cave mouths clear.
- `reef_drop_cathedral` sits beside the `drop.arch` vista. Its footprint stays south of the arch (z < -130).
- The Basin west-gate shortcut (`route.basin.reef_west`) stays the exterior route; the Cathedral is an alternative, never a replacement.

