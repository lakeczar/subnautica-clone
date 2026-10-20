/** Cross-region progression for both routes, and the adverse-case ledger: every
 * required material and clue with sources a player reaches without entering
 * any optional cave or lost site. Plan IDs for upgrades are SYS-1's catalogue
 * names (in flight); recipe and evidence IDs are the registry's. */
import type { MaterialId } from "../registry.js";
import type { AccessTierId } from "../regions/passages.js";
import { place, site, source, story } from "./refs.js";
import type { AreaId, Ref } from "./types.js";

export interface TierStep {
  readonly id: string;
  readonly label: string;
  /** Reach the player has while gathering for this step. */
  readonly reach: AccessTierId;
  readonly areas: readonly AreaId[];
  /** What this step builds or refits. */
  readonly unlocks: readonly string[];
  /** The material that had to be fetched at or beyond the previous tier's limit, and where. */
  readonly frontier: { readonly item: MaterialId | "tagged_frame"; readonly depth: number; readonly previousLimit: number } | null;
  /** Optional SYS-1 upgrades (catalogue IDs) and SYS-2 kits that become buildable here. */
  readonly upgrades: readonly string[];
  readonly outposts: readonly string[];
  /** Lost-site decodes (proposal IDs) that pay off at this stage. Never required. */
  readonly decodes: readonly string[];
  readonly independent: string;
  readonly carrier: string;
  /** What pulls the player outward next. */
  readonly pull: string;
  readonly ruleNote: string;
}

export const TIER_STEPS: readonly TierStep[] = [
  { id: "t0_refuge", label: "A place to breathe", reach: "starter", areas: ["refuge_reef", "island_chain"],
    unlocks: ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit"],
    frontier: null,
    upgrades: ["cell_bank_1", "flare_launcher", "emergency_ballast"], outposts: [],
    decodes: ["reef_pumphouse_log"],
    independent: "Short dives from the pod; the workshop landing on foot.",
    carrier: "Identical: both routes share the opening.",
    pull: "Crowns visible east of Splitspine; the C03 lead names the Canopy laboratory.",
    ruleNote: "Baseline tier: there is no previous limit to beat." },
  { id: "t1_first_craft", label: "First craft and the decoder", reach: "early", areas: ["island_chain", "refuge_reef", "suspended_garden"],
    unlocks: ["restore_workshop", "dart_base", "creel_base", "creel_cargo_rack", "creel_cabin"],
    frontier: { item: "conductive_crust", depth: 130, previousLimit: 150 },
    upgrades: ["plating_alloy", "drive_tuning_1", "floodlights_1", "dart_overdrive"],
    outposts: ["bp_field_outpost", "bp_decoder", "bp_survey_station", "bp_cultivation"],
    decodes: ["isles_tide_store_fragment", "isles_strain_gauge_log"],
    independent: "Dart first for reach, or Creel first for cargo. A basic outpost at the Canopy's upper edge is the stopgap stop.",
    carrier: "Same; the carrier is not yet available.",
    pull: "C04 reinforcement plans need crust and resin at the 150 m suit's frontier; the dishes mark the Basin edge.",
    ruleNote: "The Creel needs crust found at 90–130 m, at the edge of the 150 m suit. The Dart uses only shore materials: it is the first craft, and the bible proposes treating it as the baseline exception (owner decision)." },
  { id: "t2_reinforced", label: "Reinforced to 350 m", reach: "reinforced", areas: ["suspended_garden", "silt_basin", "hub_spur"],
    unlocks: ["suit_350", "dart_350", "creel_350", "restore_canopy_stop", "dart_acoustic_trim", "strip_frame"],
    frontier: { item: "tagged_frame", depth: 262, previousLimit: 240 },
    upgrades: ["silent_running", "dart_range_tagger", "dart_wide_sonar", "creel_cutting_arm", "creel_grapple"],
    outposts: ["bp_outpost_standard"],
    decodes: ["canopy_basket_log", "canopy_roots_store_archive", "basin_pumphead_log", "hub_beacon_archive"],
    independent: "Restore the outer-crown mooring and the spur crown station; leapfrog a standard outpost to the Basin anchorage terrace.",
    carrier: "Hearthline (400 m) from the five early materials plus tagged frames, at the yard berth. Moor at the Canopy (160 m) and the Basin (240 m).",
    pull: "C06 points to pale open fans on the Rift shoulder; the spur crown overlooks the Rift head.",
    ruleNote: "Tagged frames lie at 171–262 m: beyond the Dart's 180 m and, for the fracture spill, the Creel's 240 m starting ratings." },
  { id: "t3_service", label: "Ceramic and core: 450 m service", reach: "service", areas: ["thermal_rift", "silt_basin"],
    unlocks: ["creel_450", "hush_450", "service_power_assembly"],
    frontier: { item: "thermal_core", depth: 290, previousLimit: 240 },
    upgrades: ["plating_ceramic", "hull_heat_lining", "thermal_exchanger", "cell_bank_2", "floodlights_2", "drive_tuning_2"],
    outposts: ["bp_outpost_advanced", "bp_outpost_thermal_tap"],
    decodes: ["rift_borehole_log", "basin_vault_archive"],
    independent: "The materials station is the fixed stop; a thermal outpost on the north shoulder charges at the vents.",
    carrier: "Moor on the cool flank (300 m) and send the Creel or Dart to the shoulders.",
    pull: "The Divide's shimmer and the upper dock (lead from C06/station ledger); the seam's Rift mouth sits beside the flank gate.",
    ruleNote: "First ceramic at 258/266 m and core at 289/290 m: beyond every starting craft rating, inside the 350 m configuration." },
  { id: "t4_deep", label: "Lattice and the deep package", reach: "deep", areas: ["brine_divide", "thermal_rift"],
    unlocks: ["creel_800", "mantle", "service_air_assembly", "hearthline_550"],
    frontier: { item: "brine_lattice", depth: 375, previousLimit: 350 },
    upgrades: ["hull_brine_seals", "mantle_thermal_shroud", "mantle_hull_air_line", "mantle_drone_bay"],
    outposts: [],
    decodes: ["divide_mixing_log"],
    independent: "The upper service dock is the forward stop; outposts leapfrog onto the Divide lee shelf.",
    carrier: "Moor in the Divide lee (390 m); the 550 refit opens the district shelf at 520 m.",
    pull: "C07 and the gateworks point past the ridge to the Meridian terraces.",
    ruleNote: "First lattice at 366/375 m on flushed ledges: beyond the 350 m configuration that reaches them with a 450 m refit." },
  { id: "t5_meridian", label: "Meridian: repairs from what you know", reach: "deep", areas: ["deep_district"],
    unlocks: ["restore_upper_hall", "restore_food_module", "pod_buffer"],
    frontier: null,
    upgrades: [], outposts: [],
    decodes: ["meridian_allotment_log"],
    independent: "The staging office is the last stop; an advanced outpost on the second terrace shortens deep sorties.",
    carrier: "The upgraded carrier stages on the district shelf and launches the deep craft.",
    pull: "The investigation itself; the escarpment ledge returns toward the Canopy.",
    ruleNote: "No new material (canon and integration contract): repairs use alloy, glass, membrane, resin, crust, core and lattice." },
];

/** Required materials with first-access sources outside every cave. */
export interface RequiredSource {
  readonly item: MaterialId | "meal" | "tagged_frame";
  readonly firstNeed: string;
  readonly exterior: readonly Ref[];
}
export const REQUIRED_SOURCES: readonly RequiredSource[] = [
  { item: "structural_alloy", firstNeed: "pod_repair", exterior: [source("reef_service_scraps_east"), source("reef_service_scraps_west"),
    source("island_workshop_scraps"), source("island_headland_scraps"), source("basin_ridge_salvage_north"), source("basin_ridge_salvage_south"),
    site("basin_wreck_panels_south"), site("basin_wreck_frames_north"), site("meridian_service_cache")] },
  { item: "silica_glass", firstNeed: "pod_repair", exterior: [source("reef_glass_ridge_north"), source("reef_glass_ridge_south"),
    source("island_glass_ledge_east"), source("island_glass_ledge_west"), site("isles_stack_glass_east"), site("isles_headland_glass_ledge")] },
  { item: "flex_membrane", firstNeed: "pod_repair", exterior: [source("reef_ribbon_catch_north"), source("reef_ribbon_catch_south"),
    source("canopy_ribbon_margin_north"), source("canopy_ribbon_margin_south")] },
  { item: "conductive_crust", firstNeed: "creel_base / suit_350", exterior: [source("canopy_grounding_fins_upper"), source("canopy_grounding_fins_lower"),
    source("basin_survey_fins_east"), source("basin_survey_fins_west"), site("canopy_east_fins"), site("basin_dish_fins")] },
  { item: "buoyant_resin", firstNeed: "creel_base / suit_350", exterior: [source("canopy_resin_lee_upper"), source("canopy_resin_lee_lower"),
    source("island_resin_cove_east"), source("island_resin_cove_west"), site("isles_stack_resin_cove"), site("isles_headland_resin_cove"), site("canopy_east_resin_lee")] },
  { item: "tagged_frame", firstNeed: "creel_350 / restore_canopy_stop / Hearthline", exterior: [source("basin_frame_ridge"), source("basin_frame_terrace"),
    source("basin_frame_fracture")] },
  { item: "pressure_ceramic", firstNeed: "creel_450 / plating", exterior: [site("rift_ceramic_lip_north"), site("rift_ceramic_lip_south")] },
  { item: "thermal_core", firstNeed: "service_power_assembly", exterior: [site("rift_core_shoulder_north"), site("rift_core_shoulder_west")] },
  { item: "brine_lattice", firstNeed: "creel_800 / service_air_assembly", exterior: [site("divide_lattice_ledge_west"), site("divide_lattice_ledge_east")] },
  { item: "meal", firstNeed: "food meter", exterior: [source("reef_edible_school_north"), source("reef_edible_school_south"),
    source("island_shore_crop_east"), source("island_shore_crop_west"), site("isles_headland_crops")] },
];

/** Clues and their homes. None is in a cave; `optional` ones never gate. */
export interface RequiredClue { readonly id: string; readonly site: Ref; readonly optional: boolean }
export const REQUIRED_CLUES: readonly RequiredClue[] = [
  { id: "C01", site: place("home_pod"), optional: false },
  { id: "C02", site: place("reef_ribs"), optional: false },
  { id: "C03", site: place("island_workshop"), optional: false },
  { id: "C04", site: place("canopy_lab"), optional: false },
  { id: "C05", site: place("basin_dormitory"), optional: false },
  { id: "C06", site: place("basin_boundary_station"), optional: false },
  { id: "C07", site: story("divide_upper_dock"), optional: false },
  { id: "C08", site: story("meridian_transfer_hall"), optional: false },
  { id: "C09", site: story("meridian_gate_hall"), optional: false },
  { id: "C10", site: story("meridian_medical_annex"), optional: false },
  { id: "C11", site: story("splitspine_field_shelter"), optional: false },
  { id: "C12", site: story("divide_turbine_hall"), optional: false },
  { id: "C13", site: story("meridian_service_window"), optional: false },
  { id: "C14", site: place("home_pod"), optional: false },
  { id: "C15", site: story("meridian_inner_hall"), optional: true },
];
