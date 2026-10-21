# Mirror Divide

Content bible, region file. Area `brine_divide`. Data: [`src/content/proposals/divide.ts`](../../../src/content/proposals/divide.ts) (typed, not wired). Index: [BIBLE](../BIBLE.md).

Coordinates are metres (x east, y up with water at 0, z north). ⟂ marks a point that needs new terrain or cave rock first, so it is not checked against today's floor. Everything else is checked against `worldFloor` by `tests/content-proposals.test.ts`.

## 1. Identity

- **Mood:** a boundary you learn to read. Calm and clear above, a mirror of dense water below, and tall human gateworks standing across it all.
- **Palette:** lavender and shell crystal above, petrol and black below the mirror. Current streaks and the absence of fans mark the boundary, never hue alone.
- **Sound:** a high glassy ring from crystal in the current, the crest's downwelling rush, and the mirror's deep silence. Turbines hum faintly through the gateworks.
- **First view:** coming out of the seam's cold end, or over the lee shelf, the gateworks' towers and lintel stand over a shimmering horizontal surface (C06 / station-ledger lead).

## 2. Landmarks

**Anchors (3)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `divide.gateworks_anchor` | existing | 600, -365, -1262 | site `divide.gateworks` | Two tall towers and a lintel across the ridge's notch, reflected in the mirror below. | The Divide's silhouette and the way to the deep. |
| `divide.overlook_anchor` | existing | 470, -349.7, -1268 | site `divide.mirror_overlook` | A crest viewpoint over the shimmering interface 80 m below, a long lateral view to both flushed ledges. | Read the whole region, sails and skate dimples included, before committing. |
| `divide.crystal_sill` | new | 668, -363, -1218 | site `divide.service_dock` | Stepped lavender crystal terraces beside the upper dock, catching the dock's lamps. | A near landmark for the dock; the crystal here is too thin to work. |

**Discovery clusters (9; 12 with the anchors)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `divide.lee_shelf` | existing | 560, -390, -1120 | site `divide.lee_mooring` | A broad flat shelf in the ridge's northern lee, above any brine. | The carrier's Divide home (390 m). |
| `divide.west_ledge` | existing | 336.5, -366, -1188.5 | site `divide_lattice_ledge_west`, site `divide.ledge_sampler` | Rinsed crystals on clear ledges, a sampler rack, the seam's mouth below. | A first rinsed crystal and the sampler's boundary scan; workable lattice is on the 450 m east flank. |
| `divide.east_ledge` | existing | 749, -375, -1191 | site `divide_lattice_ledge_east` | Sails trace the clear lane over this ledge. | A second rinsed crystal under the sails' lane. |
| `divide.upper_dock` | existing | 632, -365, -1238 | site `divide.service_dock`, story site `divide_upper_dock` | A restored service stop with a docking collar; an empty cradle at the foot of a launch rail. | C07, the access log and the forward stop. |
| `divide.service_ledge_end` | existing | 620, -412, -1324 | site `divide.service_ledge` | A narrow cut bench above the mirror. | The small-craft route to Meridian's lower terraces. |
| `divide.fissure_ledge` | existing | 520, -480, -1360 | site `divide_lattice_fissure` | Rich crystal deep in a fissure below the mirror. | Optional brine-protected yield. |
| `divide.turbine_approach` | extend | 600, -427.5, -1310 | story site `divide_turbine_hall` | The lee face below the dock where turbine housings vent a steady flow. | The way down to the turbine hall (C12). |
| `divide.mixing_station` | new | 880, -379.2, -1150 | site `divide_lattice_ledge_east` | A buoy chain anchored to a squat sensor house on the east flank, half its sensors fouled with crystal. | The Divide's lost site, above the 450 m flank ledges where workable lattice is. |
| `divide.picker_rocks` | new | 420, -358.3, -1205 | site `divide_lattice_ledge_west` | Rinsed boulders crawling with seam pickers between the west ledge and the overlook. | Peaceful life on the clear side of the boundary. |

## 3. Caves

**Cave style:** Brine pockets: pale fractured cavities where dense water pools inside, each with its own small mirror floor. Lavender crystal on the rims, black water below the sheen, skimmers marking the edge.

**Cave resident:** `brine_skimmer` (Brine skimmers). Flat fish that skate just above trapped brine pools inside pockets. Where they skim, dense water lies below, so the pool's edge is visible even without its shimmer.

Brine pockets: small caves with their own trapped mirror floor. Inside a cave, the boundary rule is at its most legible, since a pocket is the whole lesson in 15 m. The **west-flank** network is the mirror pocket, which drops into the seam's brine galleries. The lintel galleries give a sheltered crest crossing, and the brine cistern is a lake inside a cave.

**Small caves (5)**: diver-only; every water extent 25 m or less. Footprint is the replacement rock the cave owns; water is length × width × height of what it carves.

| ID | Mouth (x, y, z) | Footprint | Water m | Depth m | Exits | Network | Layout | Contents | Links |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `divide_mirror_pocket` | 400, -358.9, -1240 | 388..412 × -1252..-1228 | 18 × 10 × 16 | 356–372 | ledge mouth | west_flank | An 18 m pocket whose floor is a small trapped brine pool; a crack at its back drops into the seam's brine galleries. | Mirror cress; A pool rim to read | `rift_divide_seam.pocket_drop` **back entrance → `rift_divide_seam`** |
| `divide_crest_hollow` | 690, -366.3, -1210 | 678..702 × -1222..-1198 | 14 × 8 × 12 | 360–372 | crest mouth | — | A 14 m hollow behind the crest; the downwelling roars past its mouth while inside is still. | Shelter from the crest current | — |
| `divide_east_pocket` | 810, -398.9, -1235 | 798..822 × -1247..-1223 | 15 × 9 × 12 | 392–404 | flank mouth | — | A 15 m pocket with two pools at different levels: two mirrors, one above the other. | A scan that explains layering | — |
| `divide_lee_burrow` | 470, -390.6, -1085 | 458..482 × -1097..-1073 | 12 × 5 × 10 | 386–396 | shelf mouth | — | A 12 m burrow in the lee shelf, picker tracks on its floor. | Quiet rest pocket beside the mooring | — |
| `divide_fissure_window` | 545, -429.2, -1330 | 533..557 × -1342..-1318 | 14 × 7 × 14 | 424–438 | fissure mouth, window | — | A 14 m cave in the fissure's upper wall, just above the interface, with a window down onto the protected fissure. | View of the skate's water from safety | — |

**Medium caves (2)**: water 30–80 m, 2–5 named chambers joined so that the chambers form a loop (a way round inside the cave, not only a way through), and two or more exits; the main hall takes the craft listed. ↺ marks the passage that closes the loop.

| ID | Mouth (x, y, z) | Footprint | Water m | Depth m | Hall admits | Chambers | Passages | Exits | Layout | Contents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `divide_lintel_galleries` | 720, -355.5, -1265 | 690..750 × -1295..-1240 | 55 × 12 × 50 | 350–400 | small | west gallery, service bay, east gallery | crest mouth – west gallery; south-face mouth – east gallery; west gallery – service bay; service bay – east gallery; east gallery – west gallery ↺ | crest mouth, south-face mouth | 55 m inside the ridge east of the gateworks: the crest mouth into a natural west gallery, a cut service bay, an east gallery and out the south-face mouth. A cable crawl behind the service bay joins the two galleries directly. | Dock-service frame (cache); A sheltered crest crossing |
| `divide_brine_cistern` | 880, -422.6, -1290 | 850..910 × -1320..-1260 | 60 × 40 × 50 | 400–450 | small | west landing, north rim, south rim, back gallery | crest mouth – west landing; south-face mouth – back gallery; west landing – north rim; north rim – south rim; south rim – west landing ↺; south rim – back gallery | crest mouth, south-face mouth | 60 m: a single great lake chamber whose floor is a brine pool, ringed by a craft-wide ledge. From the west landing under the crest mouth the ledge runs along the north rim, round the lake's east end and back along the south rim, a loop round the lake. A diver back gallery leaves the south rim for the south-face mouth. | Rich lattice on the lake rim; A lake inside a cave |

**Cave biome:** the [seam](../caves/rift-divide-seam.md) (`rift_divide_seam`) is the main-path late cave from the Rift's cool flank to the west flushed ledge.

## 4. Creatures

| Species | Role | Status | Cave-dweller | Where | Noise | Light |
| --- | --- | --- | --- | --- | --- | --- |
| `layer_skate` Layer skate | threat | existing | no | Below the mirror layer (existing territory) | Feels vibration at the layer's surface. | Indifferent. |
| `brine_sails` Brine sails | cue | existing | no | Clear lanes well above the layer | None. | None. |
| `seam_pickers` Seam pickers | benign | research | no | Picker rocks and both flushed ledges | Scatter into cracks at a boosting craft. | Indifferent. |
| `filter_ribbon` Filter-ribbon colony | cue | existing | no | Crest: all leaning south and down with the downwelling | None. | None. Its posture, not its glow, is the cue. |
| `brine_skimmer` Brine skimmers | cue | new | yes | Every brine pocket and the seam's galleries. Cave resident; marks dense water. | Scatter in a fan, then resettle on the same pool. | Indifferent. |

The layer skate stays the one threat, below the layer. Sails, pickers and ribbons give three independent calm-lane and habitat cues, so a missing sail never hides the safe route (WORLD_PROGRESSION).

## 5. Resources

- **Required here, outside caves:** **first workable lattice on two east-flank ledges at exactly 450 m** (`divide_lattice_flank_north`, `divide_lattice_flank_south`), north of the brine field: the service tier's limit, required by every 800 m transition and the carrier's 550 refit.
- **Changed (proposal to S2/S9):** the 366/375 m flushed ledges keep one rinsed crystal each, a taste and a scan. With the rootways crystal that is three lattice in the world above 450 m, below any recipe's need.
- **Cave-favoured (Divide and seam):** cistern rim lattice at 450 m, seam pool-rim lattice at 465 m, and seam kiln-tube ceramic. No cave holds lattice above 450 m.
- **Seeds:** mirror cress in the mirror pocket (new, optional medicine; specimen sampling).

| ID | Kind | Item | At (x, y, z) | Stock / bundle / reserve | Renews | Cave | How you read it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `divide_cistern_lattice` | cave favoured | `brine_lattice` | 880, -450, -1290 ⟂ | 16 / 2 / 0 | no | `divide_brine_cistern` | A rim of crystal fans round the lake at 450 m, where the cistern's clear water meets the pool. |
| `divide_lattice_flank_north` | exterior | `brine_lattice` | 958, -450, -1128 | 12 / 2 / 8 | no | — | Clear water falls past the ridge's east end into the deep; thick crystal fans line the 450 m ledge. No brine field this far north. |
| `divide_lattice_flank_south` | exterior | `brine_lattice` | 914, -450, -1244 | 12 / 2 / 8 | no | — | A second 450 m flank ledge, north of the brine field's edge; sails cross above it. |
| `divide_pocket_cress` | seed | `seed_mirror_cress` | 404, -360, -1236 ⟂ | 3 / 1 / 0 | no | `divide_mirror_pocket` | Cress on the pool rim; it tears unless sampled gently. |
| `seam_kiln_ceramic` | cave favoured | `pressure_ceramic` | 205, -385, -1185 ⟂ | 16 / 2 / 0 | no | `rift_divide_seam` | Thick lining in the kiln tubes. |
| `seam_pool_lattice` | cave favoured | `brine_lattice` | 360, -465, -1300 ⟂ | 14 / 2 / 0 | no | `rift_divide_seam` | Crystal on every pool rim the skimmers circle. |

## 6. Side rewards and lost site

| ID | Kind | At (x, y, z) | Reward |
| --- | --- | --- | --- |
| `divide.crest_shelter` | shortcut | 690, -366.3, -1210 | A still pocket to wait out the crest current, and the start of the lintel crossing. |
| `divide.dock_frame` | cache | 720, -360, -1265 ⟂ | Tagged repair stock: six alloy and two glass, and a view onto the small-craft service ledge. |
| `divide.cistern_lake` | view | 880, -422.6, -1290 | A mirror lake inside a cave, skimmers fanning over it. |

**Lost site `divide.mixing_site`: Mixing-line station** at 880, -379.2, -1150. A sensor house at the foot of a buoy chain, its logger sealed. It is found without decoding; its records stay unreadable until decoded.

- Decode `divide_mixing_log` (log): unlocks `divide_mixing_logger`.
  - Plans: `bp_current_turbine`.
  - Map reveals: Brine cistern (site, `divide_brine_cistern`, 60 m); Tube mouth under the west ledge (site, `rift_divide_seam.divide_mouth`, 60 m).
  - Logs: Brine profiles along the mixing line, with dense-water spikes flagged in red. Maintenance tickets replacing the 'faulty' sensors that kept reporting them. A diver's aside: the sails moved lanes that month.

Canon fit: the mixing-line station logged dense-water spikes and replaced its sensors as faulty, which is the canon's misread warnings, on the instruments themselves. Details are in the [spoiler appendix](../../spoilers/CONTENT_BIBLE_LORE.md).

## 7. Cycle candidates

| ID | Cycle | Period / active s | What it is for | Alternative | Verdict | Honest note |
| --- | --- | --- | --- | --- | --- | --- |
| `divide.crest_slack` | Crest slack water | 90 / 30 | The crest downwelling slackens for 30 s in 90: a cheap crossing for small craft. | Cross at any time under power, use the lintel galleries, or wait in the crest hollow. | promising | GAME-DIRECTION names slackening currents. Ribbons stand upright during slack: a posture cue, not a colour one. |
| `divide.sail_lane_shift` | Sail lane shift | 600 / 120 | Sails move to the east lane for a while. | Drift particles and ribbons show the same lanes. | likely cut | Risks teaching that sails are the only cue. Cut unless playtests miss it. |

## 8. Pacing check

Skilled first-time play: **about 70 minutes on the main path, 105 with the optional content here**, summed over every visit.

| Minute | Something new | Kind |
| --- | --- | --- |
| 0 | The seam's cold end: first sight of the mirror | area |
| 10 | West flushed ledge: a rinsed crystal | discovery |
| 20 | Mirror overlook: the whole boundary | discovery |
| 30 | Upper service dock: the empty cradle (C07) | story |
| 40 | East-flank ledges at 450 m: workable lattice, at the limit | discovery |
| 50 | Deep package: Creel 800 or the Mantle | craft |
| 58 | Crest current and its slack | discovery |
| 68 | Mixing-line station lost site | discovery |
| 78 | Lintel galleries crossing | area |
| 88 | Brine cistern | area |
| 98 | Turbine hall recorder (C12) | story |

About 70 minutes on the main path (ledges, dock, refits, turbine hall) and 105 with the pockets, cistern and lost site. The east-flank ledges at 450 m (minute 40) are the push to the edge; the deep-package refit (50) is the final craft beat before Meridian.

## Builder notes

- The turbine hall (`divide_turbine_hall`, C12) has no S2 placement yet. `divide.turbine_approach` marks the exterior lee face it is reached from; the story structure owns the hall.
- The crest slack cycle must keep a powered crossing possible at all times.
- The seam's brine exit is below the interface: brine protection only, and never the only way out.

