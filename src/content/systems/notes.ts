/** CB-2's found notes (docs/content/FIELD-GUIDE.md), lifted into the game by LS-1:
 * survey notes, season logs, spawning and tide records, a cook's notebook and a
 * trapper's tally. Player text, practical hint first. Every note is dated
 * before the disaster.
 *
 * Readability: an `always` note is posted at a main-path place and reads once
 * you have been there (its chart cell is explored). A `decode` note is one of
 * its lost site's gated records and reads once that decode is done. A note at
 * a deferred site waits with it. The proposal file (`proposals/fieldNotes.ts`)
 * adds each note's hint targets for CB-2's tests; the text lives only here. */
export type NoteKind = "cook" | "trapper" | "season_log" | "spawning_record" | "survey" | "crew_log" | "board";
export type NoteHost =
  | { kind: "place"; id: string }      // registry PLACES
  | { kind: "site"; id: string }       // regions/sites.ts SITES
  | { kind: "lost-site"; id: string }  // lostSites.ts CB_LOST_SITES
  | { kind: "deferred"; id: string };  // lostSites.ts DEFERRED_LOST_SITES
export type NoteReadable = { readonly kind: "always" } | { readonly kind: "decode"; readonly decode: string };
export interface FoundNoteText {
  readonly id: string;
  readonly label: string;
  readonly kind: NoteKind;
  /** A region, or `hub_spur` for the crown. */
  readonly area: string;
  readonly host: NoteHost;
  readonly readable: NoteReadable;
  readonly author: string;
  /** Always before the disaster: a season number or a D− day. */
  readonly dated: string;
  readonly text: string;
}

const always = { kind: "always" } as const;
const decode = (id: string) => ({ kind: "decode", decode: id }) as const;

export const FOUND_NOTE_TEXTS: readonly FoundNoteText[] = [
  { id: "note_yard_galley", label: "Yard galley notebook", kind: "cook", area: "island_chain", host: { kind: "place", id: "island_workshop" }, readable: always,
    author: "Yard galley", dated: "Season 7",
    text: "Fish: the little reef ones round the ribs, where they stop in the shade. Don't chase, reach. A net does two. The split under the stack holds more on rough days. "
      + "Roe: the nursery flats, on the fattest cup beds. It cooks to near twice the portions a fish does, and the beds come back if you leave the edges. "
      + "Board says nobody touches the big rays. Good. Nobody asked." },
  { id: "note_lab_feeding_card", label: "Card by the laboratory hatch", kind: "board", area: "suspended_garden", host: { kind: "place", id: "canopy_lab" }, readable: always,
    author: "Canopy lab", dated: "D−96",
    text: "The singer goes east to feed on the lantern shoals and comes back the same way. While it's gone, work the home crowns. When it's on its way back, stop the motors and wait it out. "
      + "The school leaves its roe in the fronds right above this hatch, in the singer's own water. Take it while the singer is out east." },
  { id: "note_station_margin", label: "Ledger margin, materials station", kind: "board", area: "thermal_rift", host: { kind: "site", id: "rift.materials_station" }, readable: always,
    author: "Station shift", dated: "D−51",
    text: "Stalkers eat in the vent wash. When the chimney blows, both are up in it and the passage behind is empty; when it stops, they come down. "
      + "Grit: sweep the cool balcony on the shoulder, facing the split. Never the lip." },
  { id: "note_dock_board", label: "Chalk on the dock board", kind: "board", area: "brine_divide", host: { kind: "site", id: "divide.service_dock" }, readable: always,
    author: "Upper dock", dated: "D−30",
    text: "Slack on the crest means skates lying still under the mirror. Cross slow, in the slack. "
      + "Egg cases on the lee shelf by the west ledge: DO NOT TOUCH. Incident sheet pinned below." },
  { id: "note_office_board", label: "Staging office shift notes", kind: "board", area: "deep_district", host: { kind: "site", id: "meridian.staging_office" }, readable: always,
    author: "Staging office", dated: "D−12",
    text: "After the bells sing they close up, and you can walk a cart past them. Wait for the close. "
      + "Casts for the troughs: the scavenger ledge east of this office. Gloves." },
  { id: "note_reef_season", label: "Reef season log", kind: "season_log", area: "refuge_reef", host: { kind: "lost-site", id: "reef_pumphouse_site" }, readable: decode("reef_pumphouse_log"),
    author: "Mara Sen", dated: "Season 2",
    text: "Grazers moult in the lee of the lookout ridge, below their scar line; the skins make membrane as good as ribbon. "
      + "The school spawns on the nursery flats where the cups grow thickest. The beds refill whatever we take, if we leave the edges. "
      + "Nobody here believes I time this. I time this." },
  { id: "note_trapper_tally", label: "Trap tally, yard spares", kind: "trapper", area: "island_chain", host: { kind: "deferred", id: "isles_tide_store" }, readable: decode("isles_tide_store_fragment"),
    author: "T. Orr", dated: "Season 8",
    text: "West of the ribs, on the sand where the school turns back: 11. "
      + "The split's south-east mouth, on the ledge, at the turn of the tide: 14. Best. "
      + "Wreck ridge, north end, by the big frames: 6. Slow, but nothing else down there is worth the pot. "
      + "Pots don't need watching. They fill and stop." },
  { id: "note_tide_sheet", label: "Tide and spawning sheet", kind: "spawning_record", area: "island_chain", host: { kind: "lost-site", id: "isles_strain_gauges" }, readable: decode("isles_strain_gauge_log"),
    author: "Slope technicians", dated: "D−140",
    text: "South cove under the headland: roe on the eddy line, warm side, thickest after a long slack. "
      + "Clapper valves and button plates wash into the gully under the button ledges; crushed, the planters take them. "
      + "Gauge four still reading high. Logged." },
  { id: "note_tether_aside", label: "Tether crew aside", kind: "crew_log", area: "suspended_garden", host: { kind: "lost-site", id: "canopy_basket_site" }, readable: decode("canopy_basket_log"),
    author: "Tether crew", dated: "Season 6",
    text: "Weaver nests on the holdfast rims of the east crowns. The empty ones are just resin; take those. A weaver at the door means leave it. "
      + "Floaters: hands off. They keep the bladders up, and the bladders keep us up." },
  { id: "note_basin_tray", label: "Specimen tray note", kind: "season_log", area: "silt_basin", host: { kind: "deferred", id: "basin_instrument_vault" }, readable: decode("basin_vault_archive"),
    author: "Mara Sen", dated: "D−210",
    text: "Scavenger casts from outside the burrows on the wreck ridge's south end: a handful in the cup trays and they double in a week. The pump crew calls it muck. "
      + "The fish worth a net stay over the wreck ridge, above the silt line." },
  { id: "note_fall_survey", label: "Pump crew survey note", kind: "survey", area: "silt_basin", host: { kind: "lost-site", id: "basin_pump_heads_site" }, readable: decode("basin_pumphead_log"),
    author: "Pump crew", dated: "Season 8",
    text: "Two falls in the bowl. A drifter came down on the dish field, north of the great dish, this season; the scavengers are still on it. "
      + "The older one lies on the terrace north-west of the wreck ridge, half silted. "
      + "Hide off the new one makes fair seal stock. Bone goes to the gardens." },
  { id: "note_drill_crew", label: "Drill crew notes", kind: "crew_log", area: "thermal_rift", host: { kind: "lost-site", id: "rift_borehole_site" }, readable: decode("rift_borehole_log"),
    author: "Core drilling crew", dated: "D−77",
    text: "Crawler moults in the cracks of the kiln tube's upper wall, past the cool mooring. Good for the hut's tubers. "
      + "When the crawlers go into the cracks, get out of the tube's end." },
  { id: "note_mixing_aside", label: "Sensor crew aside", kind: "survey", area: "brine_divide", host: { kind: "lost-site", id: "divide_mixing_site" }, readable: decode("divide_mixing_log"),
    author: "Divide sensor crew", dated: "D−44",
    text: "A drifter fall on the lee shelf west of the mooring, toward the west ledge. All bone now, and the bone all crust. "
      + "Picker shells in the gaps of the picker rocks, between the west ledge and the overlook." },
  { id: "note_allotment_margin", label: "Rota margin", kind: "crew_log", area: "deep_district", host: { kind: "lost-site", id: "meridian_allotments_site" }, readable: decode("meridian_allotment_log"),
    author: "Allotment rota", dated: "D−3",
    text: "Casts for the troughs from the scavenger ledge east of the office: a bucket a week, no more, or the cups go rank. "
      + "And don't sing near the bells on your way down." },
  { id: "note_beacon_keeper", label: "Beacon keeper's log", kind: "season_log", area: "hub_spur", host: { kind: "lost-site", id: "hub_beacon_house" }, readable: decode("hub_beacon_archive"),
    author: "Beacon keeper", dated: "Season 5",
    text: "Rays laid on the crown again: cases in the south crevices. Nobody touches them. Keeper's order. "
      + "Little fish shelter on the west flank, out of the rays' circle. Enough for the keeper's pan." },
];
