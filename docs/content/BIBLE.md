# Siltwake content bible

**Status:** CB proposal, 2026-10-20, for builders to author from. It sits under [GAME-DIRECTION](../build/GAME-DIRECTION.md) (owner-confirmed), which wins on any conflict. It is not wired into the game.

**Data:** every coordinate, ID, cave, resource, lost site and decode below is typed data in [`src/content/proposals/`](../../src/content/proposals/). It is Babylon-free and shaped for lifting: decodes match SYS-2's in-progress `DecodableDefinition`, sources follow the `SiteDef` stock convention, and caves carry W1-kit footprints.

**Checks:** [`tests/content-proposals.test.ts`](../../tests/content-proposals.test.ts) runs in `npm test`. It holds the data to today's world:
- every reference resolves against the registry, S2 sites, story sites, vistas and W1 caves;
- floor-anchored points sit on `worldFloor`, in the right region;
- cave footprints are disjoint, outside the opening's legacy preserve and clear of existing datums;
- each area meets the density targets below;
- the adverse-case ledger holds;
- this directory and the proposals stay spoiler-free;
- every proposal ID appears in its document;
- the game never imports the proposals.

**Spoilers:** none here. Lore owners and integration workers read the [spoiler appendix](../spoilers/CONTENT_BIBLE_LORE.md) for how each lost site fits the canon.

## How to read a region file

Each [region file](regions/) follows the same eight sections:
1. identity;
2. landmarks: 2–3 anchors and 8–12 discovery clusters, anchors included;
3. caves: 4–8 small, 2–4 medium, the region's cave style and resident;
4. creatures;
5. resources;
6. side rewards and the lost site;
7. cycle candidates;
8. pacing.

Every row has a stable ID. Status is `existing` (already in game data, named in "merges with"), `extend` (existing, given a new purpose) or `new`. The hub spur is smaller by design: a crossroads, not a region.

| Area | Region file | Main path min | With optional min | Anchors | Clusters | Small caves | Medium caves | Creatures | Lost sites |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hearth Reef | [hearth-reef.md](regions/hearth-reef.md) | 35 | 75 | 3 | 10 | 8 | 2 | 4 | 1 |
| Splitspine Isles | [splitspine-isles.md](regions/splitspine-isles.md) | 70 | 110 | 3 | 12 | 7 | 2 | 4 | 2 |
| Lantern Canopy | [lantern-canopy.md](regions/lantern-canopy.md) | 75 | 120 | 3 | 12 | 6 | 2 | 6 | 2 |
| Hub spur | [hub-spur.md](regions/hub-spur.md) | 20 | 40 | 1 | 6 | 3 | 1 | 4 | 1 |
| Pale Basin | [pale-basin.md](regions/pale-basin.md) | 85 | 125 | 3 | 11 | 5 | 2 | 4 | 2 |
| Ember Rift | [ember-rift.md](regions/ember-rift.md) | 70 | 105 | 3 | 12 | 5 | 2 | 4 | 1 |
| Mirror Divide | [mirror-divide.md](regions/mirror-divide.md) | 70 | 105 | 3 | 12 | 5 | 2 | 5 | 1 |
| Meridian | [meridian.md](regions/meridian.md) | 100 | 135 | 3 | 12 | 5 | 2 | 4 | 1 |

**Totals:** about **525 minutes (8.8 h) on the main path alone** and **815 minutes (13.6 h) with everything optional**. A blind first-timer can't tell optional from required, so expect roughly the main path plus half the rest: **about 670 minutes (11.2 h)**. That clears the 10-hour floor through content, not padding.

These are hypotheses, not measurements. The floor is measured on a blind first playthrough (coordinator, R1), and the estimate assumes about half the optional content is visited. Calibrate travel, gathering and discovery gaps with the composed play timeline before claiming the floor is met. The bot catches structural slog; the owner's playtests decide feel.

## Decisions this bible makes

- **Main-path cave biomes.** GAME-DIRECTION names three cave biomes as main path. The bible reads that as: the leads route the player through them, and they hold main-path beats (the first decode, the Basin's stop, the late Rift–Divide crossing). **None of them is the only source of a required material, plan or clue.** The adverse-case guarantee is therefore stronger than the brief asks: it covers every cave, not only the optional ones. A player who never enters a cave can still finish both routes.
- **No new materials.** The eight shared materials, seeds, plans and caches carry every reward. Rejected candidates and why are listed below. Higher tiers use more of the common materials plus the frontier one, as GAME-DIRECTION requires.
- **The tier rule is checked per transition, with no tolerance.** Every craft and suit transition needs a frontier material whose shallowest source anywhere (exterior, cave or cache; tastes excepted) is at or beyond the previous access tier's limit, with an exterior patch reachable before the transition. That puts each frontier exactly at the edge of the current rating: frames at 150 m, core at 350 m, lattice at 450 m. See [the tier rule](#the-tier-rule-per-transition).
- **Rare early samples are tastes, not bypasses.** Summed across the whole world, the samples and caches of every rare material stay below what any transition needs. That means one ceramic lamina in the Isles undercroft, two ceramic liners in the Basin vaults, one lattice crystal in the Canopy rootways and one on each Divide flushed ledge, plus crust on the reef's old intake (crust is common). There are no core samples at all. Each is enough to scan, so the player meets the material before its use is known.
- **One threat per region at most,** and none in the Reef, Isles, Basin or hub. Knot eels are a den animal (they warn, never chase), counted apart from the Canopy's roaming hunter.
- **Every region has its own cave resident** with a real cue: glimmers point to the nearest mouth, clappers warn of the surge, weavers make resin, wakeglow lights your trail, crawlers warn of heat, skimmers mark dense water, and tenders trace live lines.
- **Crawlway links are proposals, not proof.** A link between two small caves' separate footprints is a design intent. When it is lifted, the builder must author who owns the connecting rock (one footprint, or an explicit union), and a rescue or turning route for the diver through it. A static link does not prove an underground connection.
- **Lost sites never gate the story.** Every decode is `story: false`. Lost sites give plans for convenience, safety and reach (SYS-1/SYS-2 shapes), map reveals and logs.

## Cave biomes

| Cave biome | Path | Stage | File |
| --- | --- | --- | --- |
| `isles_undercroft` Splitstack Undercroft | main | early | [isles-tidal-caves.md](caves/isles-tidal-caves.md) |
| `canopy_rootways` Lantern Rootways | optional | mid | [canopy-root-caves.md](caves/canopy-root-caves.md) |
| `basin_ridge_vaults` Ridge vaults | main | mid | [basin-vault-complex.md](caves/basin-vault-complex.md) |
| `rift_divide_seam` The seam | main | late | [rift-divide-seam.md](caves/rift-divide-seam.md) |

## Creatures

Each region has 3–6 types, usually at most one threat and at least two benign or cue animals. Every roster is in its region file.

| Species | Label | Status | Role | Cave-dweller | Areas | Build cost | Defined in |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ledge_grazer` | Ledge grazer | existing | cue | no | Hearth Reef, Splitspine Isles, Hub spur | cheap | render/ecology.ts grazers; registry glass contexts |
| `filter_ribbon` | Filter-ribbon colony | existing | cue | no | Hearth Reef, Lantern Canopy, Ember Rift, Mirror Divide, Hub spur | cheap | registry ribbons asset; render/ecology.ts |
| `reef_school` | Reef school | existing | benign | no | Hearth Reef, Splitspine Isles, Hub spur, Pale Basin | cheap | render/ecology.ts decorative schools |
| `canopy_sound_hunter` | Canopy sound hunter | existing | threat | no | Lantern Canopy | cheap | sim/hunter.ts; registry THREAT_HOME |
| `canopy_school` | Lantern school | existing | cue | no | Lantern Canopy | cheap | S4 ecology (src/content/ecology/species.ts, composed on C3) |
| `basin_scavengers` | Basin scavengers | existing | cue | no | Pale Basin, Meridian | cheap | S4 ecology (src/content/ecology/species.ts, composed on C3) |
| `ember_mites` | Ember mites | existing | cue | no | Ember Rift | cheap | S4 ecology (src/content/ecology/species.ts, composed on C3) |
| `glare_stalker` | Glare stalker | existing | threat | no | Ember Rift | cheap | S4 ecology (src/content/ecology/species.ts, composed on C3) |
| `brine_sails` | Brine sails | existing | cue | no | Mirror Divide | cheap | S4 ecology (src/content/ecology/species.ts, composed on C3) |
| `layer_skate` | Layer skate | existing | threat | no | Mirror Divide | cheap | S4 ecology (src/content/ecology/species.ts, composed on C3) |
| `hollow_choir` | Hollow choir | existing | threat | no | Meridian | cheap | S4 ecology (src/content/ecology/species.ts, composed on C3) |
| `canopy_floaters` | Canopy floaters | research | benign | no | Lantern Canopy | art | this bible |
| `shore_buttons` | Shore buttons | research | benign | no | Splitspine Isles | art + behaviour | this bible |
| `silt_combs` | Silt combs | research | cue | no | Pale Basin, Meridian | art | this bible |
| `seam_pickers` | Seam pickers | research | benign | no | Mirror Divide | art | this bible |
| `vault_glimmer` | Vault glimmers | new | cue | yes | Hearth Reef, Hub spur | cheap + behaviour | this bible |
| `tide_clapper` | Tide clappers | new | cue | yes | Splitspine Isles | art + behaviour | this bible |
| `resin_weaver` | Resin weavers | new | benign | yes | Lantern Canopy | art | this bible |
| `knot_eel` | Knot eels | new | den | yes | Lantern Canopy | art + behaviour | this bible |
| `wakeglow_drift` | Wakeglow drift | new | cue | yes | Pale Basin | cheap + behaviour | this bible |
| `kiln_crawler` | Kiln crawlers | new | cue | yes | Ember Rift | art + behaviour | this bible |
| `brine_skimmer` | Brine skimmers | new | cue | yes | Mirror Divide | art | this bible |
| `cable_tender` | Cable tenders | new | cue | yes | Meridian | art + behaviour | this bible |
| `crown_rays` | Crown rays | new | benign | no | Hub spur | art | this bible |

Build order: the cheap ones first (existing placements, glimmers and wakeglow, which are particles plus one rule). Then the cave residents that carry a cycle cue (clappers, crawlers). The research's four expensive animals come last; each region still works without them.

## Materials, seeds and plans

**Materials:** the eight registry IDs only.

Rejected new materials:
- **Cave pearl / glowstone:** Would be a cave-only currency for optional items. Cave rewards use the eight materials, seeds, plans and caches instead.
- **Lamp oil or bio-luminescent paste:** A single-purpose intermediate (EXPEDITION_INTEGRATION forbids those). The lamp filter uses glass and membrane.
- **Deep endgame alloy:** The canon and the integration contract both forbid a new final resource; Meridian uses earlier families.

**Seeds** (regional, for SYS-2's planters):

| Seed | Status | Role | Produce | Sampling | Note |
| --- | --- | --- | --- | --- | --- |
| `seed_staple_cup` | elsewhere | food | `meal` | hand | SYS-2: reef nursery. |
| `seed_ribbon_fan` | elsewhere | material | `flex_membrane` | hand | SYS-2: reef. |
| `seed_salve_frond` | elsewhere | medicine | `field_salve` | hand | SYS-2: workshop pool; a richer patch in the undercroft. |
| `seed_lumen_bulb` | elsewhere | power | `bio_cell` | hand | SYS-2: upper Canopy. |
| `seed_pale_spore` | elsewhere | material | `conductive_crust` | specimen | SYS-2: Basin survey fins. |
| `seed_rootglow` | new | power | `bio_cell` | specimen | Canopy rootways exclusive. Two bio-cells per harvest at the lumen bulb's growth time: the better power crop for players who went in. |
| `seed_kiln_tuber` | new | food | `meal` | hand | Ember Rift warm-ledge tuber; three meals per harvest. Grows only in a planter on a thermal outpost or the carrier. |
| `seed_mirror_cress` | new | medicine | `field_salve` | specimen | Mirror Divide pocket-rim cress; two salves per harvest. |

**Plans** named by lost sites. New ones are optional and use shared materials:

| Plan | Status | Owner | Label | Purpose |
| --- | --- | --- | --- | --- |
| `bp_locker_extension` | new | SYS-2 | Locker extension | +50% capacity for one pod, stop or outpost locker. Light storage progression (GAME-DIRECTION). |
| `bp_ping_lens` | new | SYS-2 | Ping lens | Handheld ping range 40 → 70 m; it also outlines cave mouths it touches. |
| `bp_chart_fix` | new | SYS-2 | Chart position fix | Live position on the personal chart (the GAME-DIRECTION chart upgrade), from a relay-linked chart buoy. |
| `bp_lamp_filter` | new | SYS-1 | Shaded lamp filter | Common-pool lamp fitting: half the light the glare stalker reads at full forward visibility. Canopy rootways exclusive. |
| `bp_outpost_thermal_tap` | new | SYS-2 | Outpost thermal tap | Outposts deployed beside a vent charge from it (location power, GAME-DIRECTION). |
| `bp_current_turbine` | new | SYS-1 | Current turbine | The optional current turbine power source; prototype in the sandbox before wiring. |
| `bp_decoder_cooling` | new | SYS-2 | Decoder cooling rack | Decoder upgrade: decodes 25% faster. |
| `bp_air_line_reel` | new | SYS-1 | Air-line reel | Diver air line from a parked craft 28 → 40 m: useful for caves. |
| `bp_beacon_array` | new | SYS-2 | Beacon array | Restored crown station service: decoded landmark beacons switch on as one regional set. |
| `bp_field_outpost` | elsewhere | SYS-2 | Field outpost kit · basic | Early stopgap outpost. |
| `bp_outpost_standard` | elsewhere | SYS-2 | Field outpost kit · standard | Leapfrog outposts with two sockets. |
| `bp_outpost_advanced` | elsewhere | SYS-2 | Field outpost kit · advanced | Deep outposts. |
| `bp_decoder` | elsewhere | SYS-2 | Decoder module | Main-path decoder (workshop signal rack). |
| `bp_signal_relay` | elsewhere | SYS-2 | Signal relay | Remote decoding. |
| `bp_survey_station` | elsewhere | SYS-2 | Survey station | Marks scanned materials nearby. |
| `bp_cultivation` | elsewhere | SYS-2 | Planters | Cultivation. |
| `bp_small_fabricator` | elsewhere | SYS-2 | Small fabricator | Outpost fabrication. |
| `bp_hush_survey` | elsewhere | S9 | Hush survey glider plans | Optional quiet glider (crown survey marker log). |
| `bp_spindle_tender` | elsewhere | S9 | Spindle island tender plans | Optional surface tender (yard tender plate). |

## Cross-region progression

How materials, tiers, upgrades, outposts and decodes pull the player outward on both routes.

| Step | Reach | Areas | Builds | Independent route | Carrier route | Pulls outward |
| --- | --- | --- | --- | --- | --- | --- |
| **A place to breathe** | `starter` | Hearth Reef, Splitspine Isles | `pod_repair`, `essential_tools`, `suit_150`, `salvage_buoy`, `reserve_cells`, `bobbin_kit` | Short dives from the pod; the workshop landing on foot. | Identical: both routes share the opening. | Crowns visible east of Splitspine; the C03 lead names the Canopy laboratory. |
| **First craft and the decoder** | `early` | Splitspine Isles, Hearth Reef, Lantern Canopy | `restore_workshop`, `dart_base`, `creel_base`, `creel_cargo_rack`, `creel_cabin` | Dart first for reach, or Creel first for cargo. A basic outpost at the Canopy's upper edge is the stopgap stop. | Same; the carrier is not yet available. | C04 reinforcement plans need crust and resin at the 150 m suit's frontier; the dishes mark the Basin edge. |
| **Reinforced to 350 m** | `reinforced` | Lantern Canopy, Pale Basin, Hub spur | `suit_350`, `dart_350`, `creel_350`, `restore_canopy_stop`, `dart_acoustic_trim`, `strip_frame` | Restore the outer-crown mooring and the spur crown station; leapfrog a standard outpost to the Basin anchorage terrace. | Gather frames and the five early materials for the Hearthline; it is laid down once the 350 m core ledge is reached (next step). | C06 points to pale open fans on the Rift shoulder; the spur crown overlooks the Rift head. |
| **Ceramic and core: 450 m service** | `service` | Ember Rift, Pale Basin | `suit_450`, `creel_450`, `hush_450`, `hearthline_keel`, `hearthline_base`, `service_power_assembly` | The materials station is the fixed stop; a thermal outpost on the north shoulder charges at the vents. | Lay down the Hearthline (400 m) at the yard berth with core from the 350 m ledges; moor at the Canopy (160 m), Basin (240 m) and cool flank (300 m). | The Divide's shimmer and the upper dock (lead from C06/station ledger); the seam's Rift mouth sits beside the flank gate. |
| **Lattice and the deep package** | `deep` | Mirror Divide, Ember Rift | `suit_800`, `creel_800`, `mantle_base`, `service_air_assembly`, `hearthline_550` | The upper service dock is the forward stop; outposts leapfrog onto the Divide lee shelf. | Moor in the Divide lee (390 m); the 550 refit opens the district shelf at 520 m. | C07 and the gateworks point past the ridge to the Meridian terraces. |
| **Meridian: repairs from what you know** | `deep` | Meridian | `restore_upper_hall`, `restore_food_module`, `pod_buffer` | The staging office is the last stop; an advanced outpost on the second terrace shortens deep sorties. | The upgraded carrier stages on the district shelf and launches the deep craft. | The investigation itself; the escarpment ledge returns toward the Canopy. |

| Step | Optional upgrades (SYS-1) | Outposts and systems (SYS-2) | Lost-site decodes that pay off | Tier rule |
| --- | --- | --- | --- | --- |
| **A place to breathe** | `cell_bank_1`, `flare_launcher`, `emergency_ballast` | — | `reef_pumphouse_log` | Baseline (approved): the 150 m suit is built from shore stock before any craft (see TRANSITIONS). |
| **First craft and the decoder** | `plating_alloy`, `drive_tuning_1`, `floodlights_1`, `dart_overdrive` | `bp_field_outpost`, `bp_decoder`, `bp_survey_station`, `bp_cultivation` | `isles_tide_store_fragment`, `isles_strain_gauge_log` | The Dart is the baseline first craft (coordinator). The Creel, Hush and Spindle each need one tagged frame from the 150 m rim stack, at the early tier's limit. |
| **Reinforced to 350 m** | `silent_running`, `dart_range_tagger`, `dart_wide_sonar`, `creel_cutting_arm`, `creel_grapple` | `bp_outpost_standard` | `canopy_basket_log`, `canopy_roots_store_archive`, `basin_pumphead_log`, `hub_beacon_archive` | Every 350 m transition needs a tagged frame; the shallowest frames are the 150 m rim stack, at the early tier's limit. No frame is shallower. |
| **Ceramic and core: 450 m service** | `plating_ceramic`, `hull_heat_lining`, `thermal_exchanger`, `cell_bank_2`, `floodlights_2`, `drive_tuning_2` | `bp_outpost_advanced`, `bp_outpost_thermal_tap` | `rift_borehole_log`, `basin_vault_archive` | Workable core is first found at the 350 m lower ledges, at the reinforced tier's limit; the 290 m shoulders show inclusions too thin to work. Ceramic (258 m) is the step's other rare material, not its frontier. |
| **Lattice and the deep package** | `hull_brine_seals`, `mantle_thermal_shroud`, `mantle_hull_air_line`, `mantle_drone_bay` | — | `divide_mixing_log` | Workable lattice is first found on the 450 m east-flank ledges, at the service tier's limit (and beyond the carrier's 400 m). The 366/375 m ledges hold one rinsed crystal each: a taste. |
| **Meridian: repairs from what you know** | — | — | `meridian_allotment_log` | No new material (canon and integration contract): repairs use alloy, glass, membrane, resin, crust, core and lattice. |

**How each route pulls outward:**
- **Independent:**
  - a basic outpost at the Canopy's upper edge;
  - the outer-crown mooring and the hub crown station;
  - the Basin pump hall;
  - the Rift materials station with a thermal outpost;
  - the Divide upper dock;
  - Meridian's staging office.

  Outposts leapfrog between restored stops.
- **Carrier:**
  - the Hearthline is laid down at the yard berth once the 350 m core ledges are reached;
  - moorings at the Canopy (160 m), Basin (240 m), Rift (300 m) and Divide (390 m);
  - the district shelf (520 m) after the 550 refit.

  Small craft and divers do the cave work from each mooring.

Both routes reach every system. The cave biomes sit within one short sortie of a carrier mooring or a stop.

## The tier rule, per transition

**GAME-DIRECTION:** each new craft or depth tier needs at least one material found at or beyond the previous tier's limit. The coordinator's reading (R1) is the preceding configuration's limit, taken from `ACCESS_TIERS`:

| Access tier | Limit |
| --- | --- |
| `starter` | 60 m |
| `early` | 150 m |
| `reinforced` | 350 m |
| `service` | 450 m |
| `deep` | 800 m |
| `carrier` | 400 m |
| `carrier_upgraded` | 550 m |

For each transition:
- **Previous tier:** a suit or hull refit uses the tier below the one it produces. A new craft uses the tier it is built from.
- **Reach:** the tier held while building, from the recipe's prerequisites.
- **Frontier:** the frontier material's shallowest source anywhere (samples and caches excepted) is at depth ≥ the previous limit. At least one exterior patch is at depth ≤ reach. Where reach equals the previous tier, that means exactly at the limit: a push to the edge of the rating you hold.
- **Samples:** summed samples of every rare material in the cost stay below what the transition needs.

`tests/content-proposals.test.ts` checks this with no tolerance. It uses the registry's live `RECIPES` and a checked snapshot of S9 (`a67c76a`) and SYS-1 (`40f60fb`) costs, compared with the composed files whenever they are present.

| Transition | Recipe owner | Produces | Previous tier (limit) | Reach while building | Frontier material × needed | First found at | Proposed recipe change | Exception |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `suit_150` | registry | `early` | `starter` (60 m) | `starter` (60 m) | — | — | — | coordinator-2026-10-20: Built from shore stock before any craft exists; nothing is workable below 60 m without it. Approved as a baseline alongside the Dart (coordinator, R2). |
| `dart_base` | registry | `early` | `early` (150 m) | `early` (150 m) | — | — | — | coordinator-2026-10-20: The Dart is the first craft and the tier rule's baseline. |
| `creel_base` | registry | `early` | `early` (150 m) | `early` (150 m) | `tagged_frame` × 1 | canopy_rim_frames (150 m) | +1 `tagged_frame`, -8 `structural_alloy` | — |
| `hush_base` | S9 | `early` | `early` (150 m) | `early` (150 m) | `tagged_frame` × 1 | canopy_rim_frames (150 m) | +1 `tagged_frame`, -4 `structural_alloy` | — |
| `spindle_base` | S9 | `early` | `early` (150 m) | `early` (150 m) | `tagged_frame` × 1 | canopy_rim_frames (150 m) | +1 `tagged_frame`, -4 `structural_alloy` | — |
| `suit_350` | registry | `reinforced` | `early` (150 m) | `early` (150 m) | `tagged_frame` × 1 | canopy_rim_frames (150 m) | +1 `tagged_frame`, -2 `structural_alloy` | — |
| `dart_350` | registry | `reinforced` | `early` (150 m) | `early` (150 m) | `tagged_frame` × 1 | canopy_rim_frames (150 m) | — | — |
| `creel_350` | registry | `reinforced` | `early` (150 m) | `early` (150 m) | `tagged_frame` × 2 | canopy_rim_frames (150 m) | — | — |
| `hush_350` | SYS-1 | `reinforced` | `early` (150 m) | `early` (150 m) | `tagged_frame` × 1 | canopy_rim_frames (150 m) | — | — |
| `suit_450` | S9 | `service` | `reinforced` (350 m) | `reinforced` (350 m) | `thermal_core` × 1 | rift_core_lower_north, rift_core_lower_west (350 m) | +1 `thermal_core` | — |
| `creel_450` | S9 | `service` | `reinforced` (350 m) | `reinforced` (350 m) | `thermal_core` × 2 | rift_core_lower_north, rift_core_lower_west (350 m) | — | — |
| `hush_450` | SYS-1 | `service` | `reinforced` (350 m) | `reinforced` (350 m) | `thermal_core` × 1 | rift_core_lower_north, rift_core_lower_west (350 m) | +1 `thermal_core` | — |
| `hearthline` (hearthline_keel + hearthline_base) | S9 | `carrier` | `reinforced` (350 m) | `reinforced` (350 m) | `thermal_core` × 2 | rift_core_lower_north, rift_core_lower_west (350 m) | +2 `thermal_core` | — |
| `suit_800` | S9 | `deep` | `service` (450 m) | `service` (450 m) | `brine_lattice` × 4 | divide_lattice_flank_north, divide_lattice_flank_south (450 m) | — | — |
| `creel_800` | S9 | `deep` | `service` (450 m) | `service` (450 m) | `brine_lattice` × 5 | divide_lattice_flank_north, divide_lattice_flank_south (450 m) | — | — |
| `mantle_base` | S9 | `deep` | `service` (450 m) | `service` (450 m) | `brine_lattice` × 5 | divide_lattice_flank_north, divide_lattice_flank_south (450 m) | — | — |
| `hearthline_550` | S9 | `carrier_upgraded` | `carrier` (400 m) | `service` (450 m) | `brine_lattice` × 6 | divide_lattice_flank_north, divide_lattice_flank_south (450 m) | — | — |

**Existing sources this changes** (S2 sites / S9 sources; coordinator):

| Existing source | Change | Stock after | Why |
| --- | --- | --- | --- |
| `rift_core_shoulder_north` | scan-only | 0 | Core inclusions show on the 290 m shoulder but are too thin to work; the seam thickens down the wall to the 350 m lower ledge. |
| `rift_core_shoulder_west` | scan-only | 0 | As the north shoulder: a teaching site; workable core at the west lower ledge (350 m). |
| `divide_lattice_ledge_west` | sample | 1 | One rinsed crystal: the first sight of lattice; thick fans grow on the 450 m east flank. |
| `divide_lattice_ledge_east` | sample | 1 | As the west ledge. |

**Every sample in the world:** `reef_pumphouse_crust` 2 `conductive_crust`; `isles_undercroft_kiln_ceramic` 1 `pressure_ceramic`; `canopy_rootways_lattice` 1 `brine_lattice`; `basin_vault_liner_ceramic` 2 `pressure_ceramic`; plus one rinsed crystal on each Divide flushed ledge (above). Cache contents are declared per region and hold no ceramic, core or lattice.

**What it costs the current plan:**
- Workable core moves from 290 m to 350 m, and lattice from 366/375 m to 450 m on the Divide's east flank (north of the brine field). Both mean a push to the edge of the current rating, which is the owner's intent.
- The Hearthline needs core, so the carrier comes after the first Rift trip instead of before it. It is still mid-campaign.
- The Creel, Hush, Spindle and 350 m suit each need one tagged frame, taken from the 150 m rim stack before deeper frames are in reach. Each swaps out alloy, so their bulk barely changes.
- These are recipe and source proposals for their owners: the registry, S9 and SYS-1 recipes, and S2/S9 sources. The P1 playthrough route and the economy scripts (SYS-1 `upgrade-economy.mjs`, C3's campaign economy) must be rerun once composed.
- SYS-1's economy treats a frontier as first found within (previous reach, this reach]. Under the moved sources it still passes, but frames at exactly 150 m become "common base" in its arithmetic; SYS-1 should check its tier-line results at composition.
- **Exceptions:** two approved baselines (coordinator): the Dart, the first craft (R1), and the 150 m suit, built from shore stock before any craft with nothing reachable at 60 m (R2).

## Adverse case: skip every optional cave and lost site

A player who never enters a cave or decodes a lost site can still finish both routes. Every required material has at least two exterior first-access patches, none inside any cave footprint or cave-biome domain (test-enforced):

| Required item | First needed by | Exterior sources (no cave) |
| --- | --- | --- |
| `structural_alloy` | pod_repair | source `reef_service_scraps_east`, source `reef_service_scraps_west`, source `island_workshop_scraps`, source `island_headland_scraps`, source `basin_ridge_salvage_north`, source `basin_ridge_salvage_south`, site `basin_wreck_panels_south`, site `basin_wreck_frames_north`, site `meridian_service_cache` |
| `silica_glass` | pod_repair | source `reef_glass_ridge_north`, source `reef_glass_ridge_south`, source `island_glass_ledge_east`, source `island_glass_ledge_west`, site `isles_stack_glass_east`, site `isles_headland_glass_ledge` |
| `flex_membrane` | pod_repair | source `reef_ribbon_catch_north`, source `reef_ribbon_catch_south`, source `canopy_ribbon_margin_north`, source `canopy_ribbon_margin_south` |
| `conductive_crust` | creel_base / suit_350 | source `canopy_grounding_fins_upper`, source `canopy_grounding_fins_lower`, source `basin_survey_fins_east`, source `basin_survey_fins_west`, site `canopy_east_fins`, site `basin_dish_fins` |
| `buoyant_resin` | creel_base / suit_350 | source `canopy_resin_lee_upper`, source `canopy_resin_lee_lower`, source `island_resin_cove_east`, source `island_resin_cove_west`, site `isles_stack_resin_cove`, site `isles_headland_resin_cove`, site `canopy_east_resin_lee` |
| `tagged_frame` | creel_base / suit_350 | `canopy_rim_frames`, source `basin_frame_ridge`, source `basin_frame_terrace`, source `basin_frame_fracture` |
| `pressure_ceramic` | suit_450 / creel_450 | site `rift_ceramic_lip_north`, site `rift_ceramic_lip_south` |
| `thermal_core` | suit_450 / creel_450 / hearthline_keel | `rift_core_lower_north`, `rift_core_lower_west` |
| `brine_lattice` | suit_800 / creel_800 / service_air_assembly | `divide_lattice_flank_north`, `divide_lattice_flank_south` |
| `meal` | food meter | source `reef_edible_school_north`, source `reef_edible_school_south`, source `island_shore_crop_east`, source `island_shore_crop_west`, site `isles_headland_crops` |

Every clue sits at an existing story site outside all caves. C15 is optional by canon.

| Clue | Home | Optional |
| --- | --- | --- |
| C01 | place `home_pod` | no |
| C02 | place `reef_ribs` | no |
| C03 | place `island_workshop` | no |
| C04 | place `canopy_lab` | no |
| C05 | place `basin_dormitory` | no |
| C06 | place `basin_boundary_station` | no |
| C07 | story site `divide_upper_dock` | no |
| C08 | story site `meridian_transfer_hall` | no |
| C09 | story site `meridian_gate_hall` | no |
| C10 | story site `meridian_medical_annex` | no |
| C11 | story site `splitspine_field_shelter` | no |
| C12 | story site `divide_turbine_hall` | no |
| C13 | story site `meridian_service_window` | no |
| C14 | place `home_pod` | no |
| C15 | story site `meridian_inner_hall` | yes |

Plans: every required recipe's plan comes from evidence and technical records already on the main path (registry `EVIDENCE_BLUEPRINTS`, S9's campaign plan sources, SYS-2's workshop records). Lost-site plans are optional extras. Where a lost site holds an SYS-2 kit plan (`bp_outpost_standard`, `bp_outpost_advanced`), SYS-2 should keep a main-path copy. The independent route stays viable on the basic kit and restored stops alone.

## Lost sites

| Area | Lost site | Decode | Plans | Where |
| --- | --- | --- | --- | --- |
| Hearth Reef | `reef.pumphouse_site` Old intake pump house | `reef_pumphouse_log` (log) | `bp_locker_extension` | exterior |
| Splitspine Isles | `isles.strain_gauges` Strain gauge line | `isles_strain_gauge_log` (log) | `bp_ping_lens` | exterior |
| Splitspine Isles | `isles.tide_store` Yard tide store | `isles_tide_store_fragment` (fragment) | `bp_air_line_reel` | in `isles_undercroft` |
| Lantern Canopy | `canopy.basket_site` Fallen tether basket | `canopy_basket_log` (log) | `bp_outpost_standard` | exterior |
| Lantern Canopy | `canopy.root_specimen_store` Root specimen store | `canopy_roots_store_archive` (archive) | `bp_lamp_filter`, `bp_decoder_cooling` | in `canopy_rootways` |
| Hub spur | `hub.beacon_house` Beacon house | `hub_beacon_archive` (archive) | `bp_beacon_array` | exterior |
| Pale Basin | `basin.pump_heads_site` Pump-head field | `basin_pumphead_log` (log) | `bp_chart_fix` | exterior |
| Pale Basin | `basin.instrument_vault` Sealed instrument vault | `basin_vault_archive` (archive) | `bp_outpost_advanced` | in `basin_ridge_vaults` |
| Ember Rift | `rift.borehole_site` Core borehole rig | `rift_borehole_log` (log) | `bp_outpost_thermal_tap` | exterior |
| Mirror Divide | `divide.mixing_site` Mixing-line station | `divide_mixing_log` (log) | `bp_current_turbine` | exterior |
| Meridian | `meridian.allotments_site` Terrace allotments | `meridian_allotment_log` (log) | — | exterior |

## Who lifts what

| Stream | Takes from this bible |
| --- | --- |
| **W1** (small and medium caves, cave kit) | Every `CaveProposal`: footprint, mouth, depth, admits, layout, network links. The Fanvault is already built. |
| **LC** (large-cave technology), then the cave-biome builders | `CAVE_BIOMES`: domain, zones, entrances, residents. The rootways are LC's proof. |
| **W2** (hub and loops, terrain) | `hub.ts`: every ⟂ point, the spur pinnacles, the crown, the shaft. Also terrain needs flagged ⟂ in regions (the Colonnade arches, cave rock). |
| **W3** (density pass) | Landmarks, exterior resources, creature placements, side rewards. |
| **SYS-1** (upgrades, power) | `NEW_PLANS` owned by SYS-1: the lamp filter, current turbine and air-line reel. Also the thermal exchanger's charging points (kiln tube, seam). |
| **SYS-2** (outposts, decoder, cultivation, survey, chart, journal) | `LostSiteProposal` / `DecodeProposal` (their shape), `SEEDS`, and the SYS-2-owned `NEW_PLANS`. Also the cycle IDs for the journal. |
| **Coordinator** | Registry changes: new sources, sites and seeds; `strip_frame` at the Basin pump hall; any composed stock. One schema change at integration (additive content needs no bump). |

## Decisions received (R1) and what is still open

- **Pacing:** measured on a blind first playthrough; the estimates here stay hypotheses until calibrated with the timeline.
- **Tier-rule baseline:** the Dart, the first craft (R1), and the 150 m suit alongside it (R2).
- **Outpost-kit plans:** main-path copies are required; SYS-2 is handling them.
- **Hub crown versus apron:** decided later with W2.
- **Still open, for owners:** the recipe deltas (registry, S9, SYS-1) and source changes (S2/S9) in [the tier rule](#the-tier-rule-per-transition). The turbine hall (C12) and Meridian's interiors still have no world placement; the bible marks only their exterior approaches.
