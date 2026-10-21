# Ember Rift

Content bible, region file. Area `thermal_rift`. Data: [`src/content/proposals/rift.ts`](../../../src/content/proposals/rift.ts) (typed, not wired). Index: [BIBLE](../BIBLE.md).

Coordinates are metres (x east, y up with water at 0, z north). ⟂ marks a point that needs new terrain or cave rock first, so it is not checked against today's floor. Everything else is checked against `worldFloor` by `tests/content-proposals.test.ts`.

## 1. Identity

- **Mood:** hot vertical spectacle with cool, workable edges. Everything you need is on the quiet shoulders; the danger is visible, loud and avoidable.
- **Palette:** orange inside active splits, shell-white layers marking cool stock, petrol rock between them. Lava tubes are black glass with cracks of ember light. There is no uniform red fog: the safe shelves stay readable.
- **Sound:** the chimney's roar building before each vent, crackle in warm rock, silence on the cool shoulders. Tube walls tick as they breathe heat.
- **First view:** from the Rift head or the hub crown, the split chimney's twin columns glow on the far side of the trench. From the shoulder balcony, the whole plume cycle can be read in safety.

## 2. Landmarks

**Anchors (3)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `rift.split_anchor` | existing | -165, -420, -1065 | site `rift.split_chimney` | An active twin-column chimney rising 240 m from the trench floor, warm glow in the split. | The Rift's silhouette and its danger: plume, warm passage, glare stalkers. |
| `rift.cool_chimneys_anchor` | existing | 40, -250, -1030 | site `rift.cool_chimneys`, site `rift_ceramic_lip_north` | Five extinct pale stubs of different heights, fans open on their lips. | First ceramic, and the terrace you read the Rift from. |
| `rift.station_anchor` | existing | 135.6, -262, -920 | site `rift.materials_station`, site `rift.station_log` | A compact pressure station on the cool flank, test racks outside, warm light in its window. | The Rift's restored stop and its ledger. |

**Discovery clusters (9; 12 with the anchors)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `rift.head_shelf` | existing | 172, -256, -606 | site `rift.head` | Where the Basin's west rim breaks into the Rift; the shoulders fall away south. | The way in, and the hub crown visible behind you. |
| `rift.north_shoulder` | existing | -97.6, -290, -747.7 | site `rift_core_shoulder_north`, site `rift.shoulder_post` | Still water, no shimmer; thin dark core nodes in the rock and a survey post. | Learn what core looks like; the workable seam is the 350 m lower ledge down the wall. |
| `rift.cool_mooring_shelf` | existing | 91.4, -300, -887.5 | site `rift.cool_mooring` | A broad lower ledge with mooring fittings. | The carrier's Rift home (300 m). |
| `rift.gauge_post` | existing | -102, -305, -1114.4 | site `rift.chimney_gauge` | A gauge post on the shoulder edge facing the split. | Reads the plume clock; the mites' lip is in view. |
| `rift.west_shoulder` | existing | -307.1, -289, -1043.2 | site `rift_core_shoulder_west` | A second inactive shoulder across the trench, fans open. | The west tube, and the second 350 m core ledge below. |
| `rift.plume_seam_ledge` | existing | -126, -430, -1084 | site `rift_core_plume_seam` | Rich core beside the active chimney. | Optional risk for yield: time the plume or bring protection. |
| `rift.balcony` | new | -60, -306, -1050 | site `rift.split_chimney` | A safe lip on the cool shoulder from which the split reads clearly: glow, shimmer, the mites leaving before each vent. | Learn the plume and the stalkers' warm water before you ever enter it. |
| `rift.borehole_rig` | new | -420, -251.4, -900 | site `rift_core_shoulder_west` | A drilling tripod over a capped borehole on the west plateau, a field hut beside it with its own vent pipe. | The Rift's lost site and a third ceramic patch. |
| `rift.flank_gate_shelf` | existing | 150, -320, -1170 | site `rift.flank_gate` | The cooled flank exit toward the Divide, the seam's tube mouth glowing beside it. | Two ways on: the open flank or the seam. |

## 3. Caves

**Cave style:** Lava tubes: round black-glass tunnels with ropy floors, cracked where old heat escaped. Cool tubes on the shoulders are safe and silent; warm ones glow through their cracks and breathe heat.

**Cave resident:** `kiln_crawler` (Kiln crawlers). Pale isopods on warm tube walls. They file into cracks just before a tube's heat breath and come out as it fades.

Lava tubes: cool on the shoulders, warm near the split. The **north-shoulder** network joins the shoulder crawl to the north tube's ceramic laminae. The mite tube is a safe place to learn the heat-breath cue before the seam asks it of you. The kiln tube's end vent is where the thermal exchanger first charges.

**Small caves (5)**: diver-only; every water extent 25 m or less. Footprint is the replacement rock the cave owns; water is length × width × height of what it carves.

| ID | Mouth (x, y, z) | Footprint | Water m | Depth m | Exits | Network | Layout | Contents | Links |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rift_tube_north` | -60, -314.2, -790 | -72..-48 × -802..-778 | 20 × 5 × 12 | 308–320 | shoulder mouth | north_shoulder | A 20 m cool lava tube under the north shoulder, ropy floor, pale laminae and thin core nodes in its walls. | Cave-favoured ceramic; Thin core nodes to scan | `rift_shoulder_crawl` |
| `rift_shoulder_crawl` | -110, -287.4, -800 | -122..-98 × -812..-788 | 15 × 3 × 14 | 282–296 | ledge mouth | north_shoulder | A 15 m crawl from the shoulder post's ledge into the north tube. | Cooling-fin crate wedged at its mouth (cache) | `rift_tube_north` |
| `rift_tube_mites` | -120, -306, -1125 | -132..-108 × -1137..-1113 | 14 × 5 × 12 | 300–312 | shoulder mouth, split crack | — | A 14 m warm tube at the shoulder edge; cracks glow and crawlers file in before each breath. | Safe practice for the heat-breath cue; Glimpse of the split through a crack | — |
| `rift_stub_hollow` | 20, -264.4, -1125 | 8..32 × -1137..-1113 | 12 × 8 × 12 | 258–270 | stub mouth | — | A 12 m hollow under a fallen chimney stub; pale laminae on the ceiling. | Ceramic laminae to scan (the pale-vs-dark rule) | — |
| `rift_west_blister` | -380, -259.8, -960 | -392..-368 × -972..-948 | 16 × 16 × 12 | 254–266 | blister mouth, skylight crack | — | A 16 m lava blister on the west plateau, a dome with a cracked skylight. | Kiln tuber cuttings growing in the warm floor | — |

**Medium caves (2)**: water 30–80 m, 2–5 named chambers joined so that the chambers form a loop (a way round inside the cave, not only a way through), and two or more exits; the main hall takes the craft listed. ↺ marks the passage that closes the loop.

| ID | Mouth (x, y, z) | Footprint | Water m | Depth m | Hall admits | Chambers | Passages | Exits | Layout | Contents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rift_kiln_tube` | 150, -306, -800 | 118..178 × -830..-770 | 60 × 12 × 30 | 300–330 | small | upper tube, vent chamber, return tube, ceramic gallery | plateau mouth – upper tube; rim mouth – return tube; upper tube – vent chamber; vent chamber – return tube; return tube – upper tube ↺; vent chamber – ceramic gallery | plateau mouth, rim mouth | 60 m: the plateau mouth opens into a cool upper tube a Dart can run to a warm vent chamber; a parallel return tube climbs back and rejoins the upper tube at a junction under the plateau lip, with a second mouth on the rim. A diver-only ceramic gallery leaves the vent chamber. | Rich ceramic lining; Thermal exchanger field charge at the end vent |
| `rift_west_tube` | -300, -287.5, -1000 | -330..-270 × -1025..-975 | 50 × 12 × 38 | 282–320 | small | north arm, fork chamber, south arm | north mouth – north arm; south mouth – south arm; north arm – fork chamber; fork chamber – south arm; south arm – north arm ↺ | north mouth, south mouth | 50 m under the west shoulder: two mouths joined by a north arm and a south arm meeting in a central fork chamber, and an outer bypass tube between the two arms that closes a loop round the fork. | Sheltered approach to the west core patch |

**Cave biome:** the [seam](../caves/rift-divide-seam.md) (`rift_divide_seam`) starts at the flank gate and runs east under the Divide's west ridge. It is filed under the Divide because most of it lies there.

## 4. Creatures

| Species | Role | Status | Cave-dweller | Where | Noise | Light |
| --- | --- | --- | --- | --- | --- | --- |
| `glare_stalker` Glare stalker | threat | existing | no | Warm passage and the split (existing territory); never on cool ledges | Secondary sense, short range. | Primary sense: lamps draw it from 48 m. Dim, go still or leave the warm water. |
| `ember_mites` Ember mites | cue | existing | no | The split chimney's lip | None. | None. |
| `filter_ribbon` Filter-ribbon colony | cue | existing | no | Permanently cool ledges and chimney lips (open = cool) | None. | None. Its posture, not its glow, is the cue. |
| `kiln_crawler` Kiln crawlers | cue | new | yes | Warm walls of every lava tube. Cave resident; warns of heat breath. | None. | Indifferent. |

The glare stalker is the one threat and stays in warm water. Kiln crawlers are the cave cue. Filter ribbons on cool ledges answer the research's call for a quiet resident on the cool shoulders.

## 5. Resources

- **Required here, outside caves:** first ceramic on the two cool chimney lips (258/266 m, unchanged), and **first workable core on two cut lower ledges at exactly 350 m** (`rift_core_lower_north`, `rift_core_lower_west`): the reinforced tier's limit, which the tier rule requires for every 450 m transition and the carrier.
- **Changed (proposal to S2/S9):** the 290 m shoulders keep their look (thin dark inclusions, open fans) as scan-only teaching sites with no workable stock. You learn core where it is safe, then push down the cool wall to the ledge.
- **New exterior patch:** borehole spoil ceramic on the west plateau, a third ceramic patch.
- **Cave-favoured:** rich kiln-tube ceramic and north-tube ceramic. No cave or cache holds core above 350 m, so nothing bypasses the frontier.
- **Seeds:** kiln tubers on the balcony (new, optional; three meals per harvest on a thermal outpost or the carrier).

| ID | Kind | Item | At (x, y, z) | Stock / bundle / reserve | Renews | Cave | How you read it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rift_kiln_tube_ceramic` | cave favoured | `pressure_ceramic` | 140, -308, -810 ⟂ | 16 / 2 / 0 | no | `rift_kiln_tube` | Thick pale lining where the tube cooled slowly. |
| `rift_tube_north_ceramic` | cave favoured | `pressure_ceramic` | -60, -316, -792 ⟂ | 8 / 2 / 0 | no | `rift_tube_north` | Pale laminae where the tube cooled slowly; the dark core nodes here are too thin to work. |
| `rift_core_lower_north` | exterior | `thermal_core` | 12, -350, -744 ⟂ | 8 / 1 / 6 | no | — | The shoulder's thin inclusions thicken down the cool wall; at the 350 m ledge they are workable. Fans stay open: no heat. |
| `rift_core_lower_west` | exterior | `thermal_core` | -264, -350, -1130 ⟂ | 8 / 1 / 6 | no | — | A cut ledge on the west wall at 350 m, well outside the warm passage; dark nodes thick in still water. |
| `rift_borehole_ceramic` | exterior | `pressure_ceramic` | -420, -251.4, -900 | 6 / 2 / 4 | no | — | Pale laminated spoil heaped by the drill: a third ceramic patch. |
| `rift_balcony_tuber` | seed | `seed_kiln_tuber` | -60, -306, -1050 | 4 / 1 / 0 | no | — | Tubers on the warm side of the balcony, where the rock is warm but fans stay open. |

## 6. Side rewards and lost site

| ID | Kind | At (x, y, z) | Reward |
| --- | --- | --- | --- |
| `rift.fin_crate` | cache | -110, -287.4, -800 | Two reserve cells and a spare exchanger fin in a crate labelled for shipment south. |
| `rift.balcony_view` | view | -60, -306, -1050 | The whole plume cycle readable from safety, mites included. |
| `rift.kiln_vent_charge` | service | 150, -306, -800 | A vent where a tier-1 thermal exchanger charges: the first proof the power source works. |

**Lost site `rift.borehole_site`: Core borehole rig** at -420, -251.4, -900. A field hut by the rig, its logger dark and its vent pipe still warm. It is found without decoding; its records stay unreadable until decoded.

- Decode `rift_borehole_log` (log): unlocks `rift_borehole_logger`.
  - Plans: `bp_outpost_thermal_tap`.
  - Map reveals: West tube (site, `rift_west_tube`, 50 m); Tube mouth by the flank gate (site, `rift_divide_seam.rift_mouth`, 60 m).
  - Logs: Core sample depths and heat readings, shift by shift. How the crew piped vent heat into the field hut so they could stay out a week. A map sketch of a tube running east under the flank 'all the way to the cold'.

Canon fit: the borehole crew's logs are ordinary pre-disaster work, a crew living on vent heat. Their sketch of a tube running 'all the way to the cold' is the seam's first rumour. Details are in the [spoiler appendix](../../spoilers/CONTENT_BIBLE_LORE.md).

## 7. Cycle candidates

| ID | Cycle | Period / active s | What it is for | Alternative | Verdict | Honest note |
| --- | --- | --- | --- | --- | --- | --- |
| `rift.chimney_plume` | Chimney plume | 75 / 18 | Existing (C3 rift_split_plume): mites leave the lip, shimmer and a roar build before each vent. | The cool shoulders and the first ore never need the plume. | existing | Keep. The balcony makes it learnable before it matters. |
| `rift.kiln_breath` | Tube heat breath | 50 / 10 | Warm tubes exhale a pulse of heat; crawlers file into cracks 5 s before. | Wait in a side niche (under 50 s) or take the cool upper tube. | uncertain | Good teaching in the mite tube; in the seam it may feel like a toll gate. Prototype with and without the bypass. |

## 8. Pacing check

Skilled first-time play: **about 70 minutes on the main path, 105 with the optional content here**, summed over every visit.

| Minute | Something new | Kind |
| --- | --- | --- |
| 0 | Rift head: the shoulders fall away | area |
| 10 | Core inclusions on the inactive shoulder (scan) | discovery |
| 20 | First ceramic on the cool chimney lips | discovery |
| 30 | Materials station restored; the ledger | story |
| 40 | The 350 m lower ledge: first workable core, at the limit | discovery |
| 50 | 450 m refits and ceramic plating | tool |
| 60 | Shoulder balcony: the plume read from safety | discovery |
| 70 | Kiln tube: first thermal exchanger charge | tool |
| 80 | Borehole rig lost site | discovery |
| 90 | West tube and the west shoulder | area |
| 100 | Plume-side seam, timed | discovery |

About 70 minutes on the main path: shoulders, lips, station and refits. With the balcony, tubes, borehole and an optional timed run at the plume seam it comes to 105. The 350 m lower ledge (minute 40) is the push to the edge of the current rating that the tier rule asks for; the 450 m refits (50) are the payoff, and the kiln-tube charge (70) is the new power source.

## Builder notes

- Bind the mites, fans, captions and damage to C3's single chimney clock (75 s / 18 s).
- The kiln tube sits 90 m north-east of the cool mooring. Keep its footprint clear of the mooring pad and the station's park pose.
- The two 350 m core ledges are cut into steep walls (S2 pad convention, radius 7); the test checks the wall spans the datum. Keep them cool: outside the warm passage and plume fields.
- The lamp filter (Canopy rootways, optional) halves what the stalker reads. The Rift must stay fair without it.

