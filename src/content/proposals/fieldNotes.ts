/** CB-2 found notes: survey notes, season logs, spawning and tide records, a
 * cook's notebook and a trapper's tally. Each hints where roe, moults and
 * sheds, fish-trap spots, carcass falls and the threats' natural windows are,
 * by landmark and observable condition, never by map marker or coordinate.
 *
 * Player text. Practical hint first, flavour after (owner rule). Every note
 * is dated before the disaster; no human entry is dated after it.
 *
 * The text lives in `content/systems/notes.ts` (LS-1 lifted it into the game);
 * this file adds each note's proposal host and hint targets for CB-2's tests.
 *
 * Readability: `always` notes sit on the main path (the threat windows are
 * always among them). `decode` notes are records gated by a lost site's
 * decode, and appear in that decode's `gates` list. */
import { FOUND_NOTE_TEXTS } from "../systems/notes.js";
import type { NoteKind } from "../systems/notes.js";
import { place, prop, site } from "./refs.js";
import type { AreaId, Ref } from "./types.js";

export type { NoteKind };

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

/** Each note's proposal host and the hints its words carry, by note ID. */
const PROPOSAL: Readonly<Record<string, { host: Ref; hints: readonly NoteHint[] }>> = {
  note_yard_galley: { host: place("island_workshop"), hints: [
      { target: "reef_fish_ribs", via: place("reef_ribs"), words: "round the ribs" },
      { target: "isles_fish_split", via: site("isles.stack_cleft"), words: "The split under the stack" },
      { target: "reef_roe_nursery", via: prop("reef.nursery_flats"), words: "the nursery flats" },
  ] },
  note_lab_feeding_card: { host: place("canopy_lab"), hints: [
      { target: "cycle.canopy.hunter_feeding", via: place("canopy_lab"), words: "goes east to feed" },
      { target: "canopy_roe_crowns", via: place("canopy_lab"), words: "the fronds right above this hatch" },
  ] },
  note_station_margin: { host: site("rift.materials_station"), hints: [
      { target: "cycle.rift.stalker_feeding", via: site("rift.split_chimney"), words: "When the chimney blows" },
      { target: "rift_mite_grit", via: prop("rift.balcony"), words: "the cool balcony on the shoulder" },
  ] },
  note_dock_board: { host: site("divide.service_dock"), hints: [
      { target: "cycle.divide.skate_rest", via: site("divide.gateworks"), words: "Slack on the crest" },
      { target: "divide_skate_eggcases", via: site("divide_lattice_ledge_west"), words: "Egg cases on the lee shelf by the west ledge" },
  ] },
  note_office_board: { host: site("meridian.staging_office"), hints: [
      { target: "cycle.meridian.choir_rest", via: site("meridian.gallery_north"), words: "they close up" },
      { target: "meridian_scavenger_casts", via: site("meridian.staging_office"), words: "east of this office" },
  ] },
  note_reef_season: { host: prop("reef.pumphouse_site"), hints: [
      { target: "reef_shed_moults", via: prop("reef.grazer_lookout"), words: "the lee of the lookout ridge" },
      { target: "reef_roe_nursery", via: prop("reef.nursery_flats"), words: "the nursery flats" },
  ] },
  note_trapper_tally: { host: prop("isles.tide_store"), hints: [
      { target: "reef_trap_ribs_lee", via: place("reef_ribs"), words: "West of the ribs" },
      { target: "isles_trap_stack_east", via: site("isles.stack_cleft"), words: "south-east mouth" },
      { target: "basin_trap_ridge_north", via: site("basin_wreck_frames_north"), words: "Wreck ridge, north end" },
  ] },
  note_tide_sheet: { host: prop("isles.strain_gauges"), hints: [
      { target: "isles_roe_cove", via: site("isles.headland_landing"), words: "South cove under the headland" },
      { target: "isles_shed_shells", via: prop("isles.button_ledges"), words: "under the button ledges" },
  ] },
  note_tether_aside: { host: prop("canopy.basket_site"), hints: [
      { target: "canopy_weaver_resin", via: site("canopy.east_crowns"), words: "the holdfast rims of the east crowns" },
  ] },
  note_basin_tray: { host: prop("basin.instrument_vault"), hints: [
      { target: "basin_scavenger_casts", via: site("basin_wreck_panels_south"), words: "the burrows on the wreck ridge's south end" },
      { target: "basin_fish_ridge", via: site("basin.wreck_ridge"), words: "over the wreck ridge" },
  ] },
  note_fall_survey: { host: prop("basin.pump_heads_site"), hints: [
      { target: "fall_basin_west", via: site("basin.dish_centre"), words: "on the dish field, north of the great dish" },
      { target: "fall_basin_east", via: site("basin_wreck_frames_north"), words: "the terrace north-west of the wreck ridge" },
  ] },
  note_drill_crew: { host: prop("rift.borehole_site"), hints: [
      { target: "rift_crawler_moults", via: site("rift.cool_mooring"), words: "the kiln tube's upper wall" },
  ] },
  note_mixing_aside: { host: prop("divide.mixing_site"), hints: [
      { target: "fall_divide_lee", via: site("divide.lee_mooring"), words: "the lee shelf west of the mooring" },
      { target: "divide_picker_moults", via: prop("divide.picker_rocks"), words: "the picker rocks" },
  ] },
  note_allotment_margin: { host: prop("meridian.allotments_site"), hints: [
      { target: "meridian_scavenger_casts", via: site("meridian.staging_office"), words: "east of the office" },
  ] },
  note_beacon_keeper: { host: prop("hub.beacon_house"), hints: [
      { target: "hub_ray_eggcases", via: site("hub.crown"), words: "the south crevices" },
      { target: "hub_fish_crown", via: site("hub.crown"), words: "the west flank" },
  ] },
};

export const FOUND_NOTES: readonly FoundNote[] = FOUND_NOTE_TEXTS.map((n) => {
  const p = PROPOSAL[n.id];
  if (!p) throw new Error(`fieldNotes: no proposal host for ${n.id}`);
  return { id: n.id, label: n.label, kind: n.kind, area: n.area as AreaId, host: p.host, readable: n.readable,
    author: n.author, dated: n.dated, text: n.text, hints: p.hints };
});
