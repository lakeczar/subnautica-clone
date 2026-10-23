/** CB-2 found notes: survey notes, season logs, spawning and tide records, a
 * cook's notebook and a trapper's tally. Each hints where roe, moults and
 * sheds, fish-trap spots, carcass falls and the threats' natural windows are,
 * by landmark and observable condition, never by map marker or coordinate.
 *
 * Player text. Practical hint first, flavour after (owner rule). Every note
 * is dated before the disaster; no human entry is dated after it.
 *
 * Readability: `always` notes sit on the main path (the threat windows are
 * always among them). `decode` notes are records gated by a lost site's
 * decode, and appear in that decode's `gates` list. */
import { place, prop, site } from "./refs.js";
import type { AreaId, Ref } from "./types.js";

export type NoteKind = "cook" | "trapper" | "season_log" | "spawning_record" | "survey" | "crew_log" | "board";

export interface NoteHint {
  /** A `FAUNA_SITES` ID, or a CR-1 cycle ID for a threat's natural window. */
  readonly target: string;
  /** The landmark the note names. Fauna targets lie within `HINT_RADIUS` of it. */
  readonly via: Ref;
  /** The words in the text that carry the hint. */
  readonly words: string;
}

export interface FoundNote {
  readonly id: string;
  /** Journal title (player text). */
  readonly label: string;
  readonly kind: NoteKind;
  readonly area: AreaId;
  /** Where it is found: a registry place, a world site or a lost-site proposal. */
  readonly host: Ref;
  readonly readable: { readonly kind: "always" } | { readonly kind: "decode"; readonly decode: string };
  /** Signature line as written. */
  readonly author: string;
  /** Always before the disaster: a season number or a D− day. */
  readonly dated: string;
  readonly text: string;
  readonly hints: readonly NoteHint[];
}

/** Metres from the named landmark to what the note hints at. */
export const HINT_RADIUS = 200;

const always = { kind: "always" } as const;
const decode = (id: string) => ({ kind: "decode", decode: id }) as const;

export const FOUND_NOTES: readonly FoundNote[] = [
  // ---------------------------------------------------------------- always readable (main path)
  { id: "note_yard_galley", label: "Yard galley notebook", kind: "cook", area: "island_chain", host: place("island_workshop"), readable: always,
    author: "Yard galley", dated: "Season 7",
    text: "Fish: the little reef ones round the ribs, where they stop in the shade. Don't chase, reach. A net does two. The split under the stack holds more on rough days. "
      + "Roe: the nursery flats, on the fattest cup beds. It cooks to near twice the portions a fish does, and the beds come back if you leave the edges. "
      + "Board says nobody touches the big rays. Good. Nobody asked.",
    hints: [
      { target: "reef_fish_ribs", via: place("reef_ribs"), words: "round the ribs" },
      { target: "isles_fish_split", via: site("isles.stack_cleft"), words: "The split under the stack" },
      { target: "reef_roe_nursery", via: prop("reef.nursery_flats"), words: "the nursery flats" },
    ] },
  { id: "note_lab_feeding_card", label: "Card by the laboratory hatch", kind: "board", area: "suspended_garden", host: place("canopy_lab"), readable: always,
    author: "Canopy lab", dated: "D−96",
    text: "The singer goes east to feed on the lantern shoals and comes back the same way. While it's gone, work the home crowns. When it's on its way back, stop the motors and wait it out. "
      + "The school leaves its roe in the fronds right above this hatch, in the singer's own water. Take it while the singer is out east.",
    hints: [
      { target: "cycle.canopy.hunter_feeding", via: place("canopy_lab"), words: "goes east to feed" },
      { target: "canopy_roe_crowns", via: place("canopy_lab"), words: "the fronds right above this hatch" },
    ] },
  { id: "note_station_margin", label: "Ledger margin, materials station", kind: "board", area: "thermal_rift", host: site("rift.materials_station"), readable: always,
    author: "Station shift", dated: "D−51",
    text: "Stalkers eat in the vent wash. When the chimney blows, both are up in it and the passage behind is empty; when it stops, they come down. "
      + "Grit: sweep the cool balcony on the shoulder, facing the split. Never the lip.",
    hints: [
      { target: "cycle.rift.stalker_feeding", via: site("rift.split_chimney"), words: "When the chimney blows" },
      { target: "rift_mite_grit", via: prop("rift.balcony"), words: "the cool balcony on the shoulder" },
    ] },
  { id: "note_dock_board", label: "Chalk on the dock board", kind: "board", area: "brine_divide", host: site("divide.service_dock"), readable: always,
    author: "Upper dock", dated: "D−30",
    text: "Slack on the crest means skates lying still under the mirror. Cross slow, in the slack. "
      + "Egg cases on the lee shelf by the west ledge: DO NOT TOUCH. Incident sheet pinned below.",
    hints: [
      { target: "cycle.divide.skate_rest", via: site("divide.gateworks"), words: "Slack on the crest" },
      { target: "divide_skate_eggcases", via: site("divide_lattice_ledge_west"), words: "Egg cases on the lee shelf by the west ledge" },
    ] },
  { id: "note_office_board", label: "Staging office shift notes", kind: "board", area: "deep_district", host: site("meridian.staging_office"), readable: always,
    author: "Staging office", dated: "D−12",
    text: "After the bells sing they close up, and you can walk a cart past them. Wait for the close. "
      + "Casts for the troughs: the scavenger ledge east of this office. Gloves.",
    hints: [
      { target: "cycle.meridian.choir_rest", via: site("meridian.gallery_north"), words: "they close up" },
      { target: "meridian_scavenger_casts", via: site("meridian.staging_office"), words: "east of this office" },
    ] },
  // ---------------------------------------------------------------- readable after decoding
  { id: "note_reef_season", label: "Reef season log", kind: "season_log", area: "refuge_reef", host: prop("reef.pumphouse_site"),
    readable: decode("reef_pumphouse_log"), author: "Mara Sen", dated: "Season 2",
    text: "Grazers moult in the lee of the lookout ridge, below their scar line; the skins make membrane as good as ribbon. "
      + "The school spawns on the nursery flats where the cups grow thickest. The beds refill whatever we take, if we leave the edges. "
      + "Nobody here believes I time this. I time this.",
    hints: [
      { target: "reef_shed_moults", via: prop("reef.grazer_lookout"), words: "the lee of the lookout ridge" },
      { target: "reef_roe_nursery", via: prop("reef.nursery_flats"), words: "the nursery flats" },
    ] },
  { id: "note_trapper_tally", label: "Trap tally, yard spares", kind: "trapper", area: "island_chain", host: prop("isles.tide_store"),
    readable: decode("isles_tide_store_fragment"), author: "T. Orr", dated: "Season 8",
    text: "West of the ribs, on the sand where the school turns back: 11. "
      + "The split's south-east mouth, on the ledge, at the turn of the tide: 14. Best. "
      + "Wreck ridge, north end, by the big frames: 6. Slow, but nothing else down there is worth the pot. "
      + "Pots don't need watching. They fill and stop.",
    hints: [
      { target: "reef_trap_ribs_lee", via: place("reef_ribs"), words: "West of the ribs" },
      { target: "isles_trap_stack_east", via: site("isles.stack_cleft"), words: "south-east mouth" },
      { target: "basin_trap_ridge_north", via: site("basin_wreck_frames_north"), words: "Wreck ridge, north end" },
    ] },
  { id: "note_tide_sheet", label: "Tide and spawning sheet", kind: "spawning_record", area: "island_chain", host: prop("isles.strain_gauges"),
    readable: decode("isles_strain_gauge_log"), author: "Slope technicians", dated: "D−140",
    text: "South cove under the headland: roe on the eddy line, warm side, thickest after a long slack. "
      + "Clapper valves and button plates wash into the gully under the button ledges; crushed, the planters take them. "
      + "Gauge four still reading high. Logged.",
    hints: [
      { target: "isles_roe_cove", via: site("isles.headland_landing"), words: "South cove under the headland" },
      { target: "isles_shed_shells", via: prop("isles.button_ledges"), words: "under the button ledges" },
    ] },
  { id: "note_tether_aside", label: "Tether crew aside", kind: "crew_log", area: "suspended_garden", host: prop("canopy.basket_site"),
    readable: decode("canopy_basket_log"), author: "Tether crew", dated: "Season 6",
    text: "Weaver nests on the holdfast rims of the east crowns. The empty ones are just resin; take those. A weaver at the door means leave it. "
      + "Floaters: hands off. They keep the bladders up, and the bladders keep us up.",
    hints: [
      { target: "canopy_weaver_resin", via: site("canopy.east_crowns"), words: "the holdfast rims of the east crowns" },
    ] },
  { id: "note_basin_tray", label: "Specimen tray note", kind: "season_log", area: "silt_basin", host: prop("basin.instrument_vault"),
    readable: decode("basin_vault_archive"), author: "Mara Sen", dated: "D−210",
    text: "Scavenger casts from outside the burrows on the wreck ridge's south end: a handful in the cup trays and they double in a week. The pump crew calls it muck. "
      + "The fish worth a net stay over the wreck ridge, above the silt line.",
    hints: [
      { target: "basin_scavenger_casts", via: site("basin_wreck_panels_south"), words: "the burrows on the wreck ridge's south end" },
      { target: "basin_fish_ridge", via: site("basin.wreck_ridge"), words: "over the wreck ridge" },
    ] },
  { id: "note_fall_survey", label: "Pump crew survey note", kind: "survey", area: "silt_basin", host: prop("basin.pump_heads_site"),
    readable: decode("basin_pumphead_log"), author: "Pump crew", dated: "Season 8",
    text: "Two falls in the bowl. A drifter came down on the dish field, north of the great dish, this season; the scavengers are still on it. "
      + "The older one lies on the terrace north-west of the wreck ridge, half silted. "
      + "Hide off the new one makes fair seal stock. Bone goes to the gardens.",
    hints: [
      { target: "fall_basin_west", via: site("basin.dish_centre"), words: "on the dish field, north of the great dish" },
      { target: "fall_basin_east", via: site("basin_wreck_frames_north"), words: "the terrace north-west of the wreck ridge" },
    ] },
  { id: "note_drill_crew", label: "Drill crew notes", kind: "crew_log", area: "thermal_rift", host: prop("rift.borehole_site"),
    readable: decode("rift_borehole_log"), author: "Core drilling crew", dated: "D−77",
    text: "Crawler moults in the cracks of the kiln tube's upper wall, past the cool mooring. Good for the hut's tubers. "
      + "When the crawlers go into the cracks, get out of the tube's end.",
    hints: [
      { target: "rift_crawler_moults", via: site("rift.cool_mooring"), words: "the kiln tube's upper wall" },
    ] },
  { id: "note_mixing_aside", label: "Sensor crew aside", kind: "survey", area: "brine_divide", host: prop("divide.mixing_site"),
    readable: decode("divide_mixing_log"), author: "Divide sensor crew", dated: "D−44",
    text: "A drifter fall on the lee shelf west of the mooring, toward the west ledge. All bone now, and the bone all crust. "
      + "Picker shells in the gaps of the picker rocks, between the west ledge and the overlook.",
    hints: [
      { target: "fall_divide_lee", via: site("divide.lee_mooring"), words: "the lee shelf west of the mooring" },
      { target: "divide_picker_moults", via: prop("divide.picker_rocks"), words: "the picker rocks" },
    ] },
  { id: "note_allotment_margin", label: "Rota margin", kind: "crew_log", area: "deep_district", host: prop("meridian.allotments_site"),
    readable: decode("meridian_allotment_log"), author: "Allotment rota", dated: "D−3",
    text: "Casts for the troughs from the scavenger ledge east of the office: a bucket a week, no more, or the cups go rank. "
      + "And don't sing near the bells on your way down.",
    hints: [
      { target: "meridian_scavenger_casts", via: site("meridian.staging_office"), words: "east of the office" },
    ] },
  { id: "note_beacon_keeper", label: "Beacon keeper's log", kind: "season_log", area: "hub_spur", host: prop("hub.beacon_house"),
    readable: decode("hub_beacon_archive"), author: "Beacon keeper", dated: "Season 5",
    text: "Rays laid on the crown again: cases in the south crevices. Nobody touches them. Keeper's order. "
      + "Little fish shelter on the west flank, out of the rays' circle. Enough for the keeper's pan.",
    hints: [
      { target: "hub_ray_eggcases", via: site("hub.crown"), words: "the south crevices" },
      { target: "hub_fish_crown", via: site("hub.crown"), words: "the west flank" },
    ] },
];
