# Lantern Canopy

Content bible, region file. Area `suspended_garden`. Data: [`src/content/proposals/canopy.ts`](../../../src/content/proposals/canopy.ts) (typed, not wired). Index: [BIBLE](../BIBLE.md).

Coordinates are metres (x east, y up with water at 0, z north). ⟂ marks a point that needs new terrain or cave rock first, so it is not checked against today's floor. Everything else is checked against `worldFloor` by `tests/content-proposals.test.ts`.

## 1. Identity

- **Mood:** wonder with a watcher. Open crowns are beautiful and exposed; the lower roots are quiet, dim and safe if you are patient. The region teaches choosing a route.
- **Palette:** jade and amber crowns lit from within at their bladders. The root shade below is petrol and violet, and root tips glow mint inside the hollows.
- **Sound:** a slow creak of tethers, bladders popping softly, the Lantern school's flicker-hiss. Far off, the hunter's call is the one sound that makes you stop.
- **First view:** cresting the reef edge, the crowns rise east of Splitspine like lanterns on strings, and the laboratory hangs beside the tall rib (C03 lead). On the east shelf, the holdfast ring around the rootways' mouth glows from below.

## 2. Landmarks

**Anchors (3)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `canopy.upper_lab` | existing | 116, -118, -126 | place `canopy_lab` | A small laboratory hanging beside the tall rib, the Lantern school in the clear water above it. | C04, the specimen tray, and the first real choice between open crowns and quiet roots. |
| `canopy.lantern_crowns` | existing | 700, -105, -150 | site `canopy.east_crowns` | Tall tethered crowns east of the mooring bowl, lit amber from within at their bladders. | The east Canopy's silhouette from the Isles and the Basin edge. |
| `canopy.root_arch` | extend | 1300, -224.8, -300 | site `canopy.escarpment_head` | A single colossal root arching over the escarpment head, its far foot lost in the deep east arm. | The last link in the lure chain: it marks the deep return from Meridian. |

**Discovery clusters (9; 12 with the anchors)**

| ID | Status | At (x, y, z) | Merges with | What you see | Why you go |
| --- | --- | --- | --- | --- | --- |
| `canopy.lower_fins` | existing | 136, -130, -135 | story site `canopy_lower_fins`, source `canopy_grounding_fins_lower` | Crust-coated grounding fins with a survey post among them. | Crust, and the fin survey post's copy of the reinforcement plans. |
| `canopy.outer_mooring` | existing | 212, -138, -150 | place `canopy_stop` | A dark mooring ring below the crown edge. | The first restored stop: charging and a locker. |
| `canopy.margin_nets` | existing | 223.6, -122, -130 | source `canopy_ribbon_margin_north`, source `canopy_ribbon_margin_south` | Tether nets holding old ribbon shed on two mineral ribs. | The second membrane family. |
| `canopy.mooring_bowl` | existing | 620, -160, -200 | site `canopy.east_mooring`, site `canopy_east_fins`, site `canopy_east_resin_lee` | Ribs part around a clear turning bowl with pylons. | The carrier's Canopy mooring and second crust and resin patches. |
| `canopy.survey_plaque` | existing | 646, -165.3, -178 | site `canopy.east_marker` | A survey plaque clipped to a marker with a log case. | The optional Hush plans. |
| `canopy.floater_nursery` | new | 820, -84.6, -60 | `canopy_bladder_pocket` | A shallow bowl where floater clusters tend young bladders; cured resin rolls into its lee. | The Canopy's benign big life, a resin patch and the bladder pocket cave. |
| `canopy.tether_basket` | new | 760, -108.6, -100 | `canopy_quiet_crawl` | An inspection basket that fell from a crown tether, its sample bins still latched, a log unit in its frame. | The Canopy's lost site and a small cache. |
| `canopy.quiet_lane` | new | 760, -168.3, -200 | site `canopy.east_crowns` | A low route between holdfasts under the east crowns, roofed by fronds, filter ribbons leaning along it. | The quiet alternative to crossing the open crowns, with its own crust fins. |
| `canopy.rootways_ring` | new | 900, -151, -176 | `canopy_rootways.front_mouth` | A ring of holdfasts around a dark opening, glowing root tips running down into it. | The way into the Lantern Rootways. |

## 3. Caves

**Cave style:** Root hollows: caves whose walls are living holdfast roots braided over mineral ribs. Ribbed, organic, warm amber at the mouths and black inside, with glowing root tips as the only landmarks.

**Cave resident:** `resin_weaver` (Resin weavers). Spindly crabs that pack shed resin into ceiling nests in root hollows. Abandoned nests are cured resin; collecting them harms nothing.

Root hollows are living caves: holdfast roots braided over mineral ribs. The **east-crown** network joins the bladder pocket to the quiet crawl above the tether basket. The headland root stair (an Isles small cave) is the rootways' back entrance. The Lantern hall is a sheltered pass toward the Basin, and the escarpment gallery is the first framed view of the deep return.

**Small caves (6)**: diver-only; every water extent 25 m or less. Footprint is the replacement rock the cave owns; water is length × width × height of what it carves.

| ID | Mouth (x, y, z) | Footprint | Water m | Depth m | Exits | Network | Layout | Contents | Links |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `canopy_knot_hollow` | 720, -121.4, -122 | 708..732 × -134..-110 | 16 × 8 × 12 | 116–128 | knot mouth | — | A 16 m hollow inside a holdfast knot; root fins line its back wall. | Crust on root fins | — |
| `canopy_bladder_pocket` | 800, -86.3, -45 | 788..812 × -57..-33 | 18 × 10 × 12 | 80–92 | rim mouth | eastcrown | An 18 m pocket under the nursery's rim; cured resin floats up and lodges in its ceiling. | Renewable ceiling resin; Weaver nests | `canopy_quiet_crawl` |
| `canopy_quiet_crawl` | 760, -85.2, -80 | 748..772 × -92..-68 | 20 × 3 × 14 | 82–96 | pocket end, slope mouth | eastcrown | A 20 m root-lined crawl joining the bladder pocket to the slope above the tether basket. | A diver's quiet path past the open crowns | `canopy_bladder_pocket` |
| `canopy_lee_hollow` | 690, -192.5, -255 | 678..702 × -267..-243 | 14 × 7 × 14 | 186–200 | lee mouth | — | A 14 m hollow behind the mooring lee's rib; resin piles at its back. | Extra resin beside the mooring's patch | — |
| `canopy_fin_cleft` | 560, -128.5, -150 | 548..572 × -162..-138 | 15 × 4 × 14 | 122–136 | north end, south end | — | A 15 m split in a mineral rib, both walls crusted with fins. | A sheltered crust pocket out of the open water | — |
| `canopy_arch_hollows` | 1250, -243.8, -280 | 1238..1262 × -292..-268 | 22 × 10 × 14 | 238–252 | arch-foot mouth, escarpment window | — | Two 10 m hollows in the root arch's foot, one with a window onto the escarpment. | Root-arch scan: how the arch grew | `canopy_escarp_gallery` |

**Medium caves (2)**: water 30–80 m, 2–5 named chambers joined so that the chambers form a loop (a way round inside the cave, not only a way through), and two or more exits; the main hall takes the craft listed. ↺ marks the passage that closes the loop.

| ID | Mouth (x, y, z) | Footprint | Water m | Depth m | Hall admits | Chambers | Passages | Exits | Layout | Contents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `canopy_lantern_hall` | 520, -175.8, -230 | 490..550 × -260..-200 | 60 × 20 × 40 | 160–200 | small | lit hall, root bend, weaver branch | mooring mouth – lit hall; terrace mouth – root bend; lit hall – root bend; root bend – weaver branch; weaver branch – lit hall ↺ | mooring mouth, terrace mouth | 60 m rib-side cave: the mooring mouth opens into a lit hall, which bends through roots to the terrace mouth toward the Basin. A diver-only weaver branch leaves the root bend and rejoins the lit hall along the nests. | Sheltered pass between the mooring bowl and the Basin; Weaver nests |
| `canopy_escarp_gallery` | 1280, -292.7, -240 | 1250..1310 × -265..-215 | 55 × 14 × 60 | 240–300 | small | arch-foot chamber, gallery, lip chamber | arch mouth – arch-foot chamber; escarpment lip – lip chamber; arch-foot chamber – gallery; gallery – lip chamber; lip chamber – arch-foot chamber ↺ | arch mouth, escarpment lip | 55 m under the root arch: an arch mouth into the arch-foot chamber (crawl to the arch hollows), down a long gallery to a lip chamber over the deep east arm. A root-wrapped diver chimney climbs from the lip chamber back to the arch-foot chamber. | The first framed view down the escarpment toward the deep district |

**Cave biome:** the [Lantern Rootways](../caves/canopy-root-caves.md) (`canopy_rootways`) is optional by design, with exclusive rewards: the shaded lamp filter and rootglow seed. It is also the LC large-cave proof.

## 4. Creatures

| Species | Role | Status | Cave-dweller | Where | Noise | Light |
| --- | --- | --- | --- | --- | --- | --- |
| `canopy_sound_hunter` Canopy sound hunter | threat | existing | no | Upper crowns around the laboratory (existing territory) | Investigates acceleration, active scans and heavy extraction. | Indifferent. |
| `canopy_school` Lantern school | cue | existing | no | Clear upper water at the lab and the east crowns | Scatters above its threshold. | Indifferent. |
| `filter_ribbon` Filter-ribbon colony | cue | existing | no | Clear-water margins and the quiet lane | None. | None. Its posture, not its glow, is the cue. |
| `canopy_floaters` Canopy floaters | benign | research | no | Floater nursery and the east crowns' bladders | Drift apart slowly from loud machinery and regroup after a minute. | Lobes brighten faintly in a lamp: a night bearing to resin lees. |
| `resin_weaver` Resin weavers | benign | new | yes | Every root hollow and the rootways. Cave resident. | Freeze in place at loud machinery. | Back into the nest under a direct lamp. |
| `knot_eel` Knot eels | den | new | yes | Rootways knot warren only. Den animal with clear warnings; counted apart from the one roaming threat. | Rattles sooner (10 m) at a fast swimmer. | A lamp held on the hole for 3 s makes it withdraw: a second way past. |

The sound hunter stays the one roaming threat. Knot eels are a den animal: they sit in holes, warn twice and never chase, so they are a cave-dweller's warning rather than a second hunter. Floaters (research-named) give the Canopy the benign big life the research found missing.

## 5. Resources

- **Required here, outside caves:** crust on the upper and lower grounding fins, cured resin in the upper and lower lee pockets, margin ribbon nets, and the east-mooring crust and resin patches. All stay at 150 m or shallower for first access (EXPEDITION_INTEGRATION).
- **Frontier source:** the tether-anchor frames on the Canopy's south rim (`canopy_rim_frames`) sit at exactly 150 m, the early tier's limit. They are the shallowest tagged frames in the basin, so every 350 m transition and every craft after the Dart is fetched from the edge of the 150 m suit (tier rule).
- **Rare early sample:** one brine lattice crystal in the rootways' salt-sweat hollow, where root colonies sweat out dense water. It is a readable glimpse of where the Divide's crystal comes from, a taste only.
- **Cave-favoured:** knot-hollow crust, bladder-pocket ceiling resin and weaver-nest resin. The last two are renewable.
- **Seeds:** lumen bulbs on the east crowns (a second patch of SYS-2's), and rootglow in the rootways (exclusive; specimen sampling).

| ID | Kind | Item | At (x, y, z) | Stock / bundle / reserve | Renews | Cave | How you read it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `canopy_knot_hollow_crust` | cave favoured | `conductive_crust` | 722, -123, -120 ⟂ | 10 / 2 / 0 | no | `canopy_knot_hollow` | Root fins grounded to the rib, out of drifting silt. |
| `canopy_bladder_ceiling_resin` | cave favoured | `buoyant_resin` | 800, -86, -47 ⟂ | 10 / 2 / 0 | yes | `canopy_bladder_pocket` | Cured resin floats into the ceiling pocket. |
| `canopy_rootways_weaver_resin` | cave favoured | `buoyant_resin` | 960, -185, -175 ⟂ | 14 / 2 / 0 | yes | `canopy_rootways` | Empty weaver nests are cured resin; occupied ones have a weaver at the door. |
| `canopy_rootways_lattice` | frontier sample | `brine_lattice` | 1060, -212, -250 ⟂ | 1 / 1 / 0 | no | `canopy_rootways` | Crystal crusts where root colonies sweat out dense water; fans closed around them. |
| `canopy_rootways_rootglow` | seed | `seed_rootglow` | 1010, -172, -130 ⟂ | 3 / 1 / 0 | no | `canopy_rootways` | Glowing buds on the gallery floor; they tear unless sampled gently (Hush specimen bay). |
| `canopy_floater_lee_resin` | exterior | `buoyant_resin` | 820, -84.6, -60 | 8 / 2 / 4 | no | — | Cured nodules roll into the lee of the floater clusters. |
| `canopy_quiet_lane_fins` | exterior | `conductive_crust` | 760, -168.3, -200 | 8 / 2 / 4 | no | — | Fins under the frond roof stay clean of silt. |
| `canopy_rim_frames` | exterior | `tagged_frame` | 370, -150, -192 | 4 / 1 / 0 | no | — | Tagged anchor frames dropped from a crown tether onto the Canopy's south rim, right at the 150 m suit's limit: the shallowest frames in the basin. |
| `canopy_crown_lumen` | seed | `seed_lumen_bulb` | 640, -111.8, -110 | 3 / 1 / 0 | no | — | Bulbs clustered on a holdfast's sunny side. |

## 6. Side rewards and lost site

| ID | Kind | At (x, y, z) | Reward |
| --- | --- | --- | --- |
| `canopy.lantern_pass` | shortcut | 520, -175.8, -230 | A sheltered 160–200 m pass from the east mooring bowl toward the Basin anchorage terrace. |
| `canopy.basket_bins` | cache | 760, -108.6, -100 | Six resin and four crust in the basket's latched bins. |
| `canopy.escarp_window` | view | 1280, -292.7, -240 | The escarpment falls away into the dark; far to the south a pin of light hangs where the spire is. |

**Lost site `canopy.basket_site`: Fallen tether basket** at 760, -108.6, -100. A log unit clamped in the basket frame, its screen dark. It is found without decoding; its records stay unreadable until decoded.

- Decode `canopy_basket_log` (log): unlocks `canopy_basket_unit`.
  - Plans: `bp_outpost_standard`.
  - Map reveals: Holdfast ring (site, `canopy_rootways.front_mouth`, 50 m); Lantern hall (site, `canopy_lantern_hall`, 50 m).
  - Logs: Tether inspections crown by crown, with a running joke about the hunter, which the crew call the singer. A note that the small fish have moved up out of the lower channel this season. A field-outpost layout the crew used on their longer inspection runs.

**Lost site `canopy.root_specimen_store`: Root specimen store** at 1050, -195, -215 ⟂, inside `canopy_rootways`. A sealed specimen locker bolted to a root beyond the knot warren, labels fogged, a pressure warning sticker on the door. It is found without decoding; its records stay unreadable until decoded.

- Decode `canopy_roots_store_archive` (archive): unlocks `canopy_roots_catalogue`.
  - Plans: `bp_lamp_filter`, `bp_decoder_cooling`.
  - Map reveals: Escarpment gallery (site, `canopy_escarp_gallery`, 60 m); Root arch (landmark, `canopy.root_arch`, 80 m).
  - Logs: A catalogue of root colonies and the crystal crusts they leave behind, with growth rates. A technician's note on fitting a shaded lamp so the knot eels stop rattling.

Canon fit: the tether crew noticed the small fish leaving the lower channel, the same change C04 records, as a passing aside. The specimen store catalogues root colonies concentrating crystal. Both are spoiler-safe corroboration; details are in the [spoiler appendix](../../spoilers/CONTENT_BIBLE_LORE.md).

## 7. Cycle candidates

| ID | Cycle | Period / active s | What it is for | Alternative | Verdict | Honest note |
| --- | --- | --- | --- | --- | --- | --- |
| `canopy.bladder_shed` | Bladder shed fall | 300 / 15 | Mature bladders drop a shower of cured nodules into the nursery lee. | The lees already hold stock and the upper pockets regrow. | likely cut | Lovely to watch, no decision in it. Keep as ambience only. |

## 8. Pacing check

Skilled first-time play: **about 75 minutes on the main path, 120 with the optional content here**, summed over every visit.

| Minute | Something new | Kind |
| --- | --- | --- |
| 0 | Upper crowns: the hunter's warning and the quiet roots | area |
| 10 | Quiet lower channel (C04) | story |
| 20 | Lower fins and the survey post | discovery |
| 32 | 350 m suit refit: crust, resin and a frame from the 150 m rim | tool |
| 42 | Restore the outer-crown service mooring | tool |
| 55 | East mooring bowl and the crown survey marker | discovery |
| 66 | Fallen tether basket (lost site) | discovery |
| 78 | Floater nursery and the quiet lane | discovery |
| 90 | Lantern Rootways: crown mouth to the nave | area |
| 104 | Knot warren and the specimen store | discovery |
| 114 | Escarpment gallery: the deep return in view | area |

The lab, fins, suit refit and outer mooring make the main path, about 75 minutes. The east shelf is reached once a craft can cross. The rim frames are a short push to the 150 m limit on the way to the suit refit. The rootways are a 30–40 minute optional expedition best done once 200 m is comfortable, and they pay for themselves in the Rift with the lamp filter.

## Builder notes

- The legacy Canopy (lab, fins, outer mooring, hunter territory) stays as accepted; every new cave is on the east shelf.
- LC builds the rootways in a sandbox first. The domain here is the content proposal; LC may move it as long as the back stair still meets the headland root stair.
- The escarpment gallery reaches 300 m, below Canopy's band, deliberately: it is the deep return's visible end, not an early route.

