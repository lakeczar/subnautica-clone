# Splitspine Isles

Content bible, region file. Area `island_chain`. Data: [`src/content/proposals/isles.ts`](../../../src/content/proposals/isles.ts) (typed, not wired). Index: [BIBLE](../BIBLE.md).

Coordinates are metres (x east, y up with water at 0, z north). ⟂ marks a point that needs new terrain or cave rock first, so it is not checked against today's floor. Everything else is checked against `worldFloor` by `tests/content-proposals.test.ts`.

## 1. Identity

- **Mood:** surf, shelter and human work. The most human region on the surface: cradles, landings, a torn mast, a lit hut on a cliff. Walking on land after diving should feel like coming up for air.
- **Palette:** ochre rock and pale surf outside; jade coves and amber service lamps inside. Basalt goes black-green under water, and the undercroft is dark slate lit sideways by the sea.
- **Sound:** wind and surf on land, mast cables humming in the wind, waves booming in caves. In the undercroft the clappers' rippling clap runs ahead of each surge.
- **First view:** from the workshop landing, the split stack stands on the horizon with its torn mast. From the yard, the undercroft's square mouth sits in the stack's dark west wall.

## 2. Landmarks

**Anchors (3)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `isles.stack_and_mast` | existing | 452, 46, 102 | site `isles.stack`, site `isles.stack_mast` | Twin basalt halves either side of a water cleft, the torn mast on the west summit. | The surface bearing for the whole north rim; the mast is an optional repair with a long payoff. |
| `isles.workshop_yard` | existing | 10, 1.2, -36 | place `island_workshop`, place `splitspine_shore` | The low workshop, its landing and cradles above the shore crops. | C03, first fabrication, the decoder rack and the first craft. |
| `isles.storm_headland` | existing | 1112, 88, 106 | site `isles.headland_summit`, site `isles.headland` | The highest land in the basin, its north and east faces sheared by storms. | The field shelter (C11), the storm arch and the back stair into the Canopy rootways. |

**Discovery clusters (9; 12 with the anchors)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `isles.gantry_spill` | existing | 32, -18.3, -36 | story site `splitspine_headland_gantry`, source `island_headland_scraps` | A damaged gantry housing below the waterline with tagged panels spilled down the slope. | The yard's second plan copies and the second alloy patch. |
| `isles.landing_post` | existing | 449, 5.1, 62 | site `isles.stack_landing` | A walk-on landing with a rig plate on its post and pod plants in the rocks. | The optional tender plans and the ramp up to the mast. |
| `isles.split_cleft` | existing | 470, -5, 95 | site `isles.stack_cleft` | A 12 m water cleft through the stack, the undercroft's window glowing in its west wall. | Small-craft shortcut and the undercroft's third exit. |
| `isles.yard_berth` | existing | 470, -12, -6 | site `isles.stack_yard` | Two tall cradles in the dredged lee of the stack, the undercroft's yard mouth in the west wall. | Where the carrier is built; the front door of the tidal caves. |
| `isles.slump_scar` | new | 330, -84, 40 | `isles.strain_gauges` | A raw bite out of the stack's west flank, fresh basalt faces and a fan of debris down to the Canopy edge. | The physical trace of an old slope failure; the gauge line that watched it is the region's lost site. |
| `isles.field_shelter` | existing | 983.5, 10, -5.6 | site `isles.headland_shelter`, story site `splitspine_field_shelter` | A small hut high on the headland with survey stakes running downhill. | C11, rest and charging, and the crop plots in its lee. |
| `isles.south_cove` | existing | 964.4, -3, -37.9 | site `isles_headland_resin_cove`, site `isles.headland_landing` | A quiet eddy collecting resin from the Canopy lee; an undercut in its east wall. | Resin, the beach landing and the cove undercut with resin on its ceiling. |
| `isles.button_ledges` | new | 1150, -13.5, 70 | site `isles.headland` | Surf ledges crowded with shore buttons that clamp shut in waves as you pass. | The Isles' own animal, a quiet place between the storm arch and the cliff-foot glass. |
| `isles.cliff_foot` | existing | 1120.3, -1.5, 117 | site `isles_headland_glass_ledge` | Surf below the storm cliff keeps glass nodules scoured clean. | A second glass patch and the storm arch's north mouth beside it. |

## 3. Caves

**Cave style:** Tidal undercuts: wave-cut basalt galleries with flat wet floors, ceilings polished by surge, light coming sideways from the sea. Floating resin lodges on their ceilings; glass is scoured clean on their floors.

**Cave resident:** `tide_clapper` (Tide clappers). Hinged wall shells in tidal undercuts. They clap shut in a rippling run about 6 s before each surge, a sound you hear before you see the surge.

Isles caves are wave-cut: flat wet floors, polished ceilings and light from the side. Two networks link small caves. The **scar** network on the stack's west flank is the undercroft's back entrance. The **cove** network under the headland's south cove leads down the root stair into the Canopy's optional rootways. The storm arch and the west sea cave are the medium caves; the west sea cave's waterline mouth is a Spindle-sized surprise.

**Small caves (7)**: diver-only; every water extent 25 m or less. Footprint is the replacement rock the cave owns; water is length × width × height of what it carves.

| ID | Mouth (x, y, z) | Footprint | Water m | Depth m | Exits | Network | Layout | Contents | Links |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `isles_scar_crawl` | 360, -25.1, 45 | 348..372 × 33..57 | 20 × 8 × 12 | 22–34 | scar mouth | scar | Two 8 m pockets in the slump scar joined by a squeeze; the upper pocket opens into the undercroft's scar mouth zone. | Fresh basalt with no growth yet; The quiet way into the undercroft | `isles_undercroft.scar_mouth` **back entrance → `isles_undercroft`** |
| `isles_surf_cave` | 556, -14.2, 112 | 548..568 × 104..124 | 12 × 8 × 10 | 6–16 | surf mouth | — | A 12 m wave cave under the stack's east surf ledge; surge washes in and out over a pale floor. | Cave-scoured glass; Clapper colony on the ceiling | — |
| `isles_cove_undercut` | 968, -16.9, -54 | 956..980 × -66..-44 | 14 × 10 × 12 | 8–20 | cove mouth | cove | A 14 m undercut in the cove's east wall; drift resin floats up and lodges in its ceiling pockets. | Renewable resin on the ceiling | `isles_cove_crawl` |
| `isles_cove_crawl` | 992, -20.5, -64 | 982..1002 × -74..-54 | 16 × 3 × 10 | 14–24 | undercut end, slope mouth | cove | A 16 m crawl from the undercut south under the beach rocks, emerging on the slope. | A sealed float tin (two nav beacons) | `isles_cove_undercut`, `isles_headland_root` |
| `isles_headland_root` | 1012, -31.8, -72 | 1004..1028 × -79..-55 | 20 × 4 × 17 | 28–45 | slope mouth | cove | A 20 m sloping crack where Canopy root ends break through basalt; it drops into the back stair of the rootways. | Root tips glowing with rootglow buds | `isles_cove_crawl`, `canopy_rootways.back_stair` **back entrance → `canopy_rootways`** |
| `isles_east_ledge_cave` | 1160, -22.5, 40 | 1148..1172 × 28..52 | 18 × 10 × 10 | 16–26 | ledge mouth | — | An 18 m flat-floored undercut below the button ledges; shore buttons line its lip. | A storm-tossed survey float wedged at the back | — |
| `isles_blowhole` | 1090, -14.5, 130 | 1080..1100 × 120..140 | 15 × 5 × 14 | 2–16 | cliff-foot mouth, chimney top | — | A 15 m surge cave from the north cliff foot up a chimney to a dry ledge (waterline walking support must be validated first). | Dry ledge stash; View along the north cliff | — |

**Medium caves (2)**: water 30–80 m, 2–5 named chambers joined so that the chambers form a loop (a way round inside the cave, not only a way through), and two or more exits; the main hall takes the craft listed. ↺ marks the passage that closes the loop.

| ID | Mouth (x, y, z) | Footprint | Water m | Depth m | Hall admits | Chambers | Passages | Exits | Layout | Contents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `isles_storm_arch` | 1130, -14.3, 134 | 1124..1184 × 64..140 | 70 × 16 × 20 | 8–28 | small | north hall, skylight hall, glass gallery | cliff-foot mouth – north hall; east mouth – skylight hall; skylight crack – skylight hall; north hall – skylight hall; skylight hall – glass gallery; glass gallery – north hall ↺ | cliff-foot mouth, east mouth, skylight crack | 70 m sea cave through the headland's north-east point: the cliff-foot mouth opens into a Dart-wide north hall, then a skylight hall under a diver-sized skylight crack, and out the east mouth over the button ledges. A diver-only glass gallery leaves the skylight hall and runs back behind the west wall into the north hall. | Cave-favoured glass; Storm-wrecked float (cache) |
| `isles_headland_west` | 912, -20.7, 30 | 900..950 × 0..50 | 45 × 14 × 20 | 10–30 | small | waterline hall, shingle chamber, drip room | waterline mouth – waterline hall; south-beach mouth – shingle chamber; waterline hall – shingle chamber; shingle chamber – drip room; drip room – waterline hall ↺ | waterline mouth, south-beach mouth | 45 m through the headland's west foot: a waterline mouth a Spindle can nose into, a waterline hall, a shingle chamber with a dry-looking shelf and a lower mouth toward the south beach. A diver passage from the shingle chamber climbs to a drip room that opens back into the waterline hall. | Shingle shelf (outpost-suitable ledge, solar through the mouth) |

**Cave biome:** the [Splitstack Undercroft](../caves/isles-tidal-caves.md) (`isles_undercroft`) runs under the stack from the yard to the slump scar, with a window onto the split. It is the main-path early cave: it teaches darkness, the lamp and exits, and it holds the first decodable.

## 4. Creatures

| Species | Role | Status | Cave-dweller | Where | Noise | Light |
| --- | --- | --- | --- | --- | --- | --- |
| `ledge_grazer` Ledge grazer | cue | existing | no | Surf ledges on the stack's east face and the cliff foot | Drifts off a ledge when a craft boosts within 10 m; returns after it passes. | Indifferent. |
| `reef_school` Reef school | benign | existing | no | Sheltered channels: the split, the yard lee and the south cove | Tightens and turns away from a boosting craft. | Gathers loosely at the edge of a lamp cone at night. |
| `shore_buttons` Shore buttons | benign | research | no | Button ledges and the east ledge cave's lip | Clamp at footsteps within 4 m, reopen after 20 s of stillness. | Indifferent. |
| `tide_clapper` Tide clappers | cue | new | yes | Ceilings and walls of every tidal cave. Cave resident; warns of the surge. | A diver's touch shuts one shell, nothing more. | Indifferent. |

No threat. Shore buttons are the Isles' signature animal (research-named, expensive art). If they slip, ledge grazers and schools still cover the benign roles, and the clappers carry the cave role on their own.

## 5. Resources

- **Required here, outside caves:** workshop and gantry alloy, east and west wave-washed glass, drift resin in the coves, and shore crops. All are existing sources; the S2 stack and headland patches add second patches.
- **Rare early sample:** one ceramic lamina in the undercroft's cold vent (the stack was a chimney once). It is enough to scan and learn the look of ceramic hours early, never enough to pay for anything.
- **Cave-favoured:** ceiling resin in the cove undercut (resin floats, so look up) and scoured glass in the surf cave and storm arch.
- **Seeds:** salve fronds in the undercroft's yard sump, a richer second patch of SYS-2's island seed.

| ID | Kind | Item | At (x, y, z) | Stock / bundle / reserve | Renews | Cave | How you read it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `isles_undercroft_kiln_ceramic` | frontier sample | `pressure_ceramic` | 440, -20, 88 ⟂ | 1 / 1 / 0 | no | `isles_undercroft` | One pale lamina around a dead vent in the lamp hall's floor: the stack was a chimney once. A taste, enough to scan. |
| `isles_undercroft_salve` | seed | `seed_salve_frond` | 438, -26, 30 ⟂ | 4 / 1 / 0 | no | `isles_undercroft` | Salve fronds rooted where the yard's runoff pools. |
| `isles_cove_ceiling_resin` | cave favoured | `buoyant_resin` | 970, -14, -58 ⟂ | 10 / 2 / 0 | yes | `isles_cove_undercut` | Resin floats: look up. It lodges in ceiling pockets where the eddy brings it. |
| `isles_surf_cave_glass` | cave favoured | `silica_glass` | 560, -13, 116 ⟂ | 8 / 2 / 0 | no | `isles_surf_cave` | Surge scours the floor clean; nodules lie loose. |
| `isles_arch_glass` | cave favoured | `silica_glass` | 1150, -18, 100 ⟂ | 12 / 2 / 0 | no | `isles_storm_arch` | The gallery wall weathers out large clear nodules. |
| `isles_landing_pods` | exterior | `meal` | 452, 4.9, 66 | 6 / 2 / 0 | no | — | Low pod plants in the landing's rock cracks. |
| `isles_scar_debris` | exterior | `structural_alloy` | 330, -83.8, 40 | 10 / 4 / 6 | no | — | Tagged footing plates that slid down with the slope. |

## 6. Side rewards and lost site

| ID | Kind | At (x, y, z) | Reward |
| --- | --- | --- | --- |
| `isles.cleft_window_route` | shortcut | 464, -7.6, 95 | A diver route from the yard to the split without surfacing, and a daylight exit from the lamp hall. |
| `isles.blowhole_stash` | cache | 1090, -14.5, 130 | Two meals, two navigation beacons and a view along the north cliff. |
| `isles.arch_float` | cache | 1160, -16, 90 ⟂ | Six alloy and a reserve cell in a float's equipment well. |

**Lost site `isles.strain_gauges`: Strain gauge line** at 345, -45.4, 70. Six anchored gauges in a row across the scar's edge, the last two bent over, a logger housing clamped to the first. It is found without decoding; its records stay unreadable until decoded.

- Decode `isles_strain_gauge_log` (log): unlocks `isles_gauge_logger`.
  - Plans: `bp_ping_lens`.
  - Map reveals: Storm arch (site, `isles_storm_arch`, 60 m); Root stair under the headland (hint, `isles_headland_root`, 60 m).
  - Logs: Two years of strain readings, flat and then climbing. Recalibration notes that call the climb instrument drift. A last technician's entry asking for a slope review, with no reply attached.

**Lost site `isles.tide_store`: Yard tide store** at 436, -24, 20 ⟂, inside `isles_undercroft`. A dry-lockered store room cut off the yard sump, manifests in a sealed sleeve. It is found without decoding; its records stay unreadable until decoded.

- Decode `isles_tide_store_fragment` (fragment): unlocks `isles_tide_store_sleeve`.
  - Plans: `bp_air_line_reel`.
  - Map reveals: Gauge line on the west flank (site, `isles.strain_gauges`, 50 m); West sea cave (site, `isles_headland_west`, 50 m).
  - Logs: Loads staged on the yard apron for a departure, then left where they stood; no departure signed. A shift note about the tide pump and the yard's own spares.

Canon fit: the strain gauge line records the slope that later failed, and its technicians called the warning drift. The tide store's manifests agree with C03's unspent supplies without explaining them. The [spoiler appendix](../../spoilers/CONTENT_BIBLE_LORE.md) holds the details.

## 7. Cycle candidates

| ID | Cycle | Period / active s | What it is for | Alternative | Verdict | Honest note |
| --- | --- | --- | --- | --- | --- | --- |
| `isles.tidal_surge` | Undercroft surge | 45 / 8 | In the clapper throat a surge pushes divers back toward the scar; clappers clap shut about 6 s before it. | Wait under 40 s in the side pocket, or go round through the lamp hall and the cleft window. | promising | Teaches reading a sound cue in the first cave biome. Prototype the push strength so it never pins a diver against rock. |

## 8. Pacing check

Skilled first-time play: **about 70 minutes on the main path, 110 with the optional content here**, summed over every visit.

| Minute | Something new | Kind |
| --- | --- | --- |
| 0 | Workshop landing and shore crops | area |
| 8 | Unspent departure supplies (C03) | story |
| 15 | Restore workshop services | tool |
| 25 | First craft: Dart or Creel | craft |
| 35 | Decoder module from the signal rack | tool |
| 45 | Stack landing, tender plate and the mast ramp | discovery |
| 55 | Undercroft: lamp hall, surge and the cleft window | area |
| 65 | Tide store decoded: first finished decode | discovery |
| 78 | Strain gauge line on the slump scar | discovery |
| 90 | Headland: storm arch and button ledges | area |
| 100 | Field shelter records on a later visit (C11) | story |

The workshop beats (C03, restore, first craft, decoder) are the opening's second act, about 35 minutes. The stack and undercroft follow on the first Dart trip, and the headland waits for the C11 lead on a later visit. A player who goes straight for the Canopy loses no story; the undercroft is where the decoder is taught, so the lead points there first.

## Builder notes

- The undercroft's yard mouth must stay outside the Hearthline's berth envelope at `isles.stack_yard`, and its cleft window must not narrow the 12 m small-craft cleft.
- `isles_blowhole` and `isles_headland_west` touch the waterline. Validate walking support and the surface/underwater transition before promising a dry ledge.
- Shore buttons are optional art. Ship the region without them if needed; never remove the clappers, which carry the surge cue.

