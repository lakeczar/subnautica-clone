/** C3: S5's later story sites placed at S2's sites (C1's placement table), and
 * the hosts each holds. Positions are fixed data, each resting on S2's floor or
 * structure; `tests/story-placed.test.ts` checks every one against the composed
 * world and gives it a collision-checked normal view. Spoiler-free: labels and
 * text stay in S5's evidence data. */
import type { DiscoveryId, StorySiteId } from "./evidence.js";

interface Point { readonly x: number; readonly y: number; readonly z: number }
/** Each newly placed S5 site, the S2 site that hosts it and its real depths. */
export const STORY_PLACEMENTS = {
  /** At the split stack's foot below its damaged mast (S2 has no headland gantry). */
  splitspine_headland_gantry: { s2: "isles.stack_mast", depth: 7, exit: 7 },
  /** Beside the existing lower fin source, as S5 describes. */
  canopy_lower_fins: { s2: "legacy:canopy_grounding_fins_lower", depth: 135, exit: 135 },
  /** Beside the northern ridge salvage on the first Basin shelf. */
  basin_service_rack: { s2: "legacy:basin_ridge_salvage_north", depth: 167, exit: 167 },
  rift_materials_station: { s2: "rift.station_log", depth: 262, exit: 262 },
  divide_upper_dock: { s2: "divide.service_dock", depth: 365, exit: 365 },
  /** S2's gate control room, at the gateworks' deep end. */
  divide_turbine_hall: { s2: "divide.gate_control", depth: 395, exit: 395 },
  splitspine_field_shelter: { s2: "isles.headland_records", depth: 0, exit: null },
  meridian_shelf: { s2: "meridian.staging_shelf", depth: 520, exit: null },
  meridian_upper_hall: { s2: "meridian.gallery_north", depth: 600, exit: 600 },
  meridian_transfer_hall: { s2: "meridian.gallery_south", depth: 599, exit: 599 },
  meridian_medical_annex: { s2: "meridian.archive_terrace", depth: 680, exit: 680 },
  /** S2's gate hall beside the works machinery: 769 m, not S5's proposed 700 m. */
  meridian_gate_hall: { s2: "meridian.gate_hall", depth: 769, exit: 769 },
  /** The district's lowest point: the works hatch on the 770 m floor. */
  meridian_service_window: { s2: "meridian.works_hatch", depth: 770, exit: 770 },
  /** Behind the return gate, along the works block's south face. */
  meridian_inner_hall: { s2: "meridian.machinery_boundary", depth: 770, exit: null },
} as const satisfies Partial<Record<StorySiteId, { s2: string; depth: number; exit: number | null }>>;
export type PlacedStorySiteId = keyof typeof STORY_PLACEMENTS;

/** Where each placed discovery's record, console or object stands. */
export const PLACED_HOSTS = {
  gantry_plates: { x: 465, y: -6.24, z: 102 },
  fin_survey_post: { x: 137.4, y: -134.65, z: -135.8 },
  basin_service_rack: { x: 163, y: -166.54, z: -206 },
  rift_station_ledger: { x: 137, y: -261, z: -913.6 },
  C07: { x: 628, y: -364.9, z: -1236 },
  ren_access_log: { x: 630.5, y: -364.9, z: -1244 },
  C12: { x: 570, y: -394.52, z: -1252 },
  C11: { x: 984.5, y: 11, z: -6.4 },
  mara_last_page: { x: 983.3, y: 11, z: -6.4 },
  C08: { x: 1000, y: -598.94, z: -1406 },
  C10: { x: 1279, y: -679.07, z: -1396 },
  iona_ledger_note: { x: 1281.5, y: -679.08, z: -1396 },
  C09: { x: 1396, y: -767.8, z: -1595.4 },
  gate_panel: { x: 1402.6, y: -767.6, z: -1588 },
  C13: { x: 1430, y: -769.06, z: -1560 },
  district_controller: { x: 1433, y: -769.07, z: -1560 },
  C15: { x: 1425, y: -769.3, z: -1601 },
  inner_roster: { x: 1427.5, y: -770.52, z: -1602 },
  outside_names: { x: 1430, y: -771.03, z: -1602 },
} as const satisfies Partial<Record<DiscoveryId, Point>>;
export type PlacedHostId = keyof typeof PLACED_HOSTS;

/** The upper hall's two restoration work faces (S5 works actions). */
export const WORKS_FACES = {
  "works:hall": { position: { x: 1294, y: -599.32, z: -1145 }, action: "restore_hall", label: "Upper hall frame" },
  "works:food": { position: { x: 1302, y: -599.3, z: -1146 }, action: "restore_food", label: "Food module bay" },
} as const;
export type WorksFaceId = keyof typeof WORKS_FACES;
