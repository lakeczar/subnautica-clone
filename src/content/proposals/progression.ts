/** Cross-region progression for both routes, the tier rule per craft and suit
 * transition, and the adverse-case ledger: every required material and clue
 * with sources a player reaches without entering any optional cave or lost
 * site. Plan IDs for upgrades are SYS-1's catalogue names; recipe and
 * evidence IDs are the registry's and S9's. */
import type { CostKind, MaterialId } from "../registry.js";
import type { AccessTierId } from "../regions/passages.js";
import { place, prop, site, source, story } from "./refs.js";
import type { AreaId, Ref } from "./types.js";

export interface TierStep {
  readonly id: string;
  readonly label: string;
  /** Reach the player has while gathering for this step. */
  readonly reach: AccessTierId;
  readonly areas: readonly AreaId[];
  /** What this step builds or refits. */
  readonly unlocks: readonly string[];
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
    upgrades: ["cell_bank_1", "flare_launcher", "emergency_ballast"], outposts: [],
    decodes: ["reef_pumphouse_log"],
    independent: "Short dives from the pod; the workshop landing on foot.",
    carrier: "Identical: both routes share the opening.",
    pull: "Crowns visible east of Splitspine; the C03 lead names the Canopy laboratory.",
    ruleNote: "Baseline (approved): the 150 m suit is built from shore stock before any craft (see TRANSITIONS)." },
  { id: "t1_first_craft", label: "First craft and the decoder", reach: "early", areas: ["island_chain", "refuge_reef", "suspended_garden"],
    unlocks: ["restore_workshop", "dart_base", "creel_base", "creel_cargo_rack", "creel_cabin"],
    upgrades: ["plating_alloy", "drive_tuning_1", "floodlights_1", "dart_overdrive"],
    outposts: ["bp_field_outpost", "bp_decoder", "bp_survey_station", "bp_cultivation"],
    decodes: ["isles_tide_store_fragment", "isles_strain_gauge_log"],
    independent: "Dart first for reach, or Creel first for cargo. A basic outpost at the Canopy's upper edge is the stopgap stop.",
    carrier: "Same; the carrier is not yet available.",
    pull: "C04 reinforcement plans need crust and resin at the 150 m suit's frontier; the dishes mark the Basin edge.",
    ruleNote: "The Dart is the baseline first craft (coordinator). The Creel, Hush and Spindle each need one tagged frame from the 150 m rim stack, at the early tier's limit." },
  { id: "t2_reinforced", label: "Reinforced to 350 m", reach: "reinforced", areas: ["suspended_garden", "silt_basin", "hub_spur"],
    unlocks: ["suit_350", "dart_350", "creel_350", "restore_canopy_stop", "dart_acoustic_trim", "strip_frame"],
    upgrades: ["silent_running", "dart_range_tagger", "dart_wide_sonar", "creel_cutting_arm", "creel_grapple"],
    outposts: ["bp_outpost_standard"],
    decodes: ["canopy_basket_log", "canopy_roots_store_archive", "basin_pumphead_log", "hub_beacon_archive"],
    independent: "Restore the outer-crown mooring and the spur crown station; leapfrog a standard outpost to the Basin anchorage terrace.",
    carrier: "Gather frames and the five early materials for the Hearthline; it is laid down once the 350 m core ledge is reached (next step).",
    pull: "C06 points to pale open fans on the Rift shoulder; the spur crown overlooks the Rift head.",
    ruleNote: "Every 350 m transition needs a tagged frame; the shallowest frames are the 150 m rim stack, at the early tier's limit. No frame is shallower." },
  { id: "t3_service", label: "Ceramic and core: 450 m service", reach: "service", areas: ["thermal_rift", "silt_basin"],
    unlocks: ["suit_450", "creel_450", "hush_450", "hearthline_keel", "hearthline_base", "service_power_assembly"],
    upgrades: ["plating_ceramic", "hull_heat_lining", "thermal_exchanger", "cell_bank_2", "floodlights_2", "drive_tuning_2"],
    outposts: ["bp_outpost_advanced", "bp_outpost_thermal_tap"],
    decodes: ["rift_borehole_log", "basin_vault_archive"],
    independent: "The materials station is the fixed stop; a thermal outpost on the north shoulder charges at the vents.",
    carrier: "Lay down the Hearthline (400 m) at the yard berth with core from the 350 m ledges; moor at the Canopy (160 m), Basin (240 m) and cool flank (300 m).",
    pull: "The Divide's shimmer and the upper dock (lead from C06/station ledger); the seam's Rift mouth sits beside the flank gate.",
    ruleNote: "Workable core is first found at the 350 m lower ledges, at the reinforced tier's limit; the 290 m shoulders show inclusions too thin to work. Ceramic (258 m) is the step's other rare material, not its frontier." },
  { id: "t4_deep", label: "Lattice and the deep package", reach: "deep", areas: ["brine_divide", "thermal_rift"],
    unlocks: ["suit_800", "creel_800", "mantle_base", "service_air_assembly", "hearthline_550"],
    upgrades: ["hull_brine_seals", "mantle_thermal_shroud", "mantle_hull_air_line", "mantle_drone_bay"],
    outposts: [],
    decodes: ["divide_mixing_log"],
    independent: "The upper service dock is the forward stop; outposts leapfrog onto the Divide lee shelf.",
    carrier: "Moor in the Divide lee (390 m); the 550 refit opens the district shelf at 520 m.",
    pull: "C07 and the gateworks point past the ridge to the Meridian terraces.",
    ruleNote: "Workable lattice is first found on the 450 m east-flank ledges, at the service tier's limit (and beyond the carrier's 400 m). The 366/375 m ledges hold one rinsed crystal each: a taste." },
  { id: "t5_meridian", label: "Meridian: repairs from what you know", reach: "deep", areas: ["deep_district"],
    unlocks: ["restore_upper_hall", "restore_food_module", "pod_buffer"],
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
  { item: "tagged_frame", firstNeed: "creel_base / suit_350", exterior: [prop("canopy_rim_frames"), source("basin_frame_ridge"), source("basin_frame_terrace"),
    source("basin_frame_fracture")] },
  { item: "pressure_ceramic", firstNeed: "suit_450 / creel_450", exterior: [site("rift_ceramic_lip_north"), site("rift_ceramic_lip_south")] },
  { item: "thermal_core", firstNeed: "suit_450 / creel_450 / hearthline_keel", exterior: [prop("rift_core_lower_north"), prop("rift_core_lower_west")] },
  { item: "brine_lattice", firstNeed: "suit_800 / creel_800 / service_air_assembly", exterior: [prop("divide_lattice_flank_north"), prop("divide_lattice_flank_south")] },
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

// ---------------------------------------------------------------- tier rule

/** GAME-DIRECTION: each new craft or depth tier needs at least one material
 * found at or beyond the previous tier's limit. Read per transition:
 *
 * - `previous`: the access tier whose limit must be met. A depth refit or suit
 *   uses the tier below the one it produces; a new craft uses the tier it is
 *   built from. The limit is ACCESS_TIERS[previous].depth.
 * - `reach`: the access tier the player holds while building (its depth is the
 *   deepest a diver can work), from the recipe's prerequisites.
 * - The frontier material must have every source (exterior, cave or cache;
 *   samples excepted) at depth >= the limit, and at least one ordinary exterior
 *   source at depth <= reach. With reach == previous that means exactly at the
 *   limit: a push to the edge of the current rating. No tolerance.
 * - Samples (finite tastes) of every rare material in the transition's cost,
 *   summed across the whole world, stay below what it needs.
 *
 * `delta` is the proposed change to the owner's recipe. */
export interface Transition {
  readonly id: string;
  readonly recipes: readonly string[];
  readonly owner: "registry" | "S9" | "SYS-1";
  readonly kind: "suit" | "hull_refit" | "new_craft";
  readonly produces: AccessTierId;
  readonly previous: AccessTierId;
  readonly reach: AccessTierId;
  readonly frontier: CostKind | null;
  readonly delta: Partial<Record<CostKind, number>>;
  /** Set only for an approved or pending exception to the rule. */
  readonly baseline?: { readonly decision: "coordinator-2026-10-20"; readonly why: string };
}

export const TRANSITIONS: readonly Transition[] = [
  { id: "suit_150", recipes: ["suit_150"], owner: "registry", kind: "suit", produces: "early", previous: "starter", reach: "starter",
    frontier: null, delta: {},
    baseline: { decision: "coordinator-2026-10-20", why: "Built from shore stock before any craft exists; nothing is workable below 60 m without it. Approved as a baseline alongside the Dart (coordinator, R2)." } },
  { id: "dart_base", recipes: ["dart_base"], owner: "registry", kind: "new_craft", produces: "early", previous: "early", reach: "early",
    frontier: null, delta: {}, baseline: { decision: "coordinator-2026-10-20", why: "The Dart is the first craft and the tier rule's baseline." } },
  { id: "creel_base", recipes: ["creel_base"], owner: "registry", kind: "new_craft", produces: "early", previous: "early", reach: "early",
    frontier: "tagged_frame", delta: { tagged_frame: 1, structural_alloy: -8 } },
  { id: "hush_base", recipes: ["hush_base"], owner: "S9", kind: "new_craft", produces: "early", previous: "early", reach: "early",
    frontier: "tagged_frame", delta: { tagged_frame: 1, structural_alloy: -4 } },
  { id: "spindle_base", recipes: ["spindle_base"], owner: "S9", kind: "new_craft", produces: "early", previous: "early", reach: "early",
    frontier: "tagged_frame", delta: { tagged_frame: 1, structural_alloy: -4 } },
  { id: "suit_350", recipes: ["suit_350"], owner: "registry", kind: "suit", produces: "reinforced", previous: "early", reach: "early",
    frontier: "tagged_frame", delta: { tagged_frame: 1, structural_alloy: -2 } },
  { id: "dart_350", recipes: ["dart_350"], owner: "registry", kind: "hull_refit", produces: "reinforced", previous: "early", reach: "early",
    frontier: "tagged_frame", delta: {} },
  { id: "creel_350", recipes: ["creel_350"], owner: "registry", kind: "hull_refit", produces: "reinforced", previous: "early", reach: "early",
    frontier: "tagged_frame", delta: {} },
  { id: "hush_350", recipes: ["hush_350"], owner: "SYS-1", kind: "hull_refit", produces: "reinforced", previous: "early", reach: "early",
    frontier: "tagged_frame", delta: {} },
  { id: "suit_450", recipes: ["suit_450"], owner: "S9", kind: "suit", produces: "service", previous: "reinforced", reach: "reinforced",
    frontier: "thermal_core", delta: { thermal_core: 1 } },
  { id: "creel_450", recipes: ["creel_450"], owner: "S9", kind: "hull_refit", produces: "service", previous: "reinforced", reach: "reinforced",
    frontier: "thermal_core", delta: {} },
  { id: "hush_450", recipes: ["hush_450"], owner: "SYS-1", kind: "hull_refit", produces: "service", previous: "reinforced", reach: "reinforced",
    frontier: "thermal_core", delta: { thermal_core: 1 } },
  { id: "hearthline", recipes: ["hearthline_keel", "hearthline_base"], owner: "S9", kind: "new_craft", produces: "carrier", previous: "reinforced", reach: "reinforced",
    frontier: "thermal_core", delta: { thermal_core: 2 } },
  { id: "suit_800", recipes: ["suit_800"], owner: "S9", kind: "suit", produces: "deep", previous: "service", reach: "service",
    frontier: "brine_lattice", delta: {} },
  { id: "creel_800", recipes: ["creel_800"], owner: "S9", kind: "hull_refit", produces: "deep", previous: "service", reach: "service",
    frontier: "brine_lattice", delta: {} },
  { id: "mantle_base", recipes: ["mantle_base"], owner: "S9", kind: "new_craft", produces: "deep", previous: "service", reach: "service",
    frontier: "brine_lattice", delta: {} },
  { id: "hearthline_550", recipes: ["hearthline_550"], owner: "S9", kind: "hull_refit", produces: "carrier_upgraded", previous: "carrier", reach: "service",
    frontier: "brine_lattice", delta: {} },
];

/** Costs of recipes that live outside this branch, as accepted. The test compares
 * them with the composed files whenever those are present, so they cannot drift.
 * Registry recipes are read live from RECIPES. */
export const RECIPE_SNAPSHOTS: { readonly provenance: string; readonly costs: Readonly<Record<string, Partial<Record<CostKind, number>>>> } = {
  provenance: "S9 a67c76a src/content/campaign/recipes.ts (CAMPAIGN_RECIPES); SYS-1 40f60fb src/content/upgrades/catalogue.ts (UPGRADES)",
  costs: {
    suit_450: { pressure_ceramic: 4, flex_membrane: 2, conductive_crust: 2 },
    suit_800: { pressure_ceramic: 4, brine_lattice: 4, thermal_core: 1, flex_membrane: 1 },
    creel_450: { pressure_ceramic: 6, thermal_core: 2, conductive_crust: 2, flex_membrane: 2 },
    creel_800: { pressure_ceramic: 8, brine_lattice: 5, thermal_core: 3, silica_glass: 2 },
    hearthline_keel: { tagged_frame: 2, structural_alloy: 16, buoyant_resin: 6 },
    hearthline_base: { structural_alloy: 6, silica_glass: 8, flex_membrane: 8, conductive_crust: 8, buoyant_resin: 4 },
    hearthline_550: { pressure_ceramic: 10, brine_lattice: 6 },
    mantle_base: { pressure_ceramic: 8, thermal_core: 4, brine_lattice: 5, structural_alloy: 8, silica_glass: 3, conductive_crust: 4 },
    hush_base: { structural_alloy: 4, silica_glass: 3, flex_membrane: 3, buoyant_resin: 3, conductive_crust: 2 },
    spindle_base: { structural_alloy: 6, buoyant_resin: 4, silica_glass: 2, flex_membrane: 2, conductive_crust: 2 },
    hush_350: { tagged_frame: 1, conductive_crust: 3, buoyant_resin: 3, silica_glass: 1 },
    hush_450: { pressure_ceramic: 4, conductive_crust: 3, buoyant_resin: 3, flex_membrane: 2 },
  },
};

/** Proposed changes to existing world sources (S2 sites / S9 sources; owner:
 * coordinator). `scan_only` keeps the site and its look, with no workable stock;
 * `sample` keeps a finite taste. */
export interface SourceChange {
  readonly ref: Ref;
  readonly role: "scan_only" | "sample";
  readonly stock: number;
  readonly note: string;
}
export const SOURCE_CHANGES: readonly SourceChange[] = [
  { ref: site("rift_core_shoulder_north"), role: "scan_only", stock: 0,
    note: "Core inclusions show on the 290 m shoulder but are too thin to work; the seam thickens down the wall to the 350 m lower ledge." },
  { ref: site("rift_core_shoulder_west"), role: "scan_only", stock: 0,
    note: "As the north shoulder: a teaching site; workable core at the west lower ledge (350 m)." },
  { ref: site("divide_lattice_ledge_west"), role: "sample", stock: 1,
    note: "One rinsed crystal: the first sight of lattice; thick fans grow on the 450 m east flank." },
  { ref: site("divide_lattice_ledge_east"), role: "sample", stock: 1, note: "As the west ledge." },
];

/** Story sites with a world position: the S2 site or registry place that hosts them,
 * or the source they are placed beside. The rest are unplaced (story structure). */
export const STORY_SITE_PLACEMENTS: Readonly<Record<string, Ref | null>> = {
  home_pod: place("home_pod"), reef_ribs: place("reef_ribs"), island_workshop: place("island_workshop"), splitspine_shore: place("splitspine_shore"),
  canopy_lab: place("canopy_lab"), canopy_stop: place("canopy_stop"), basin_dormitory: place("basin_dormitory"), basin_boundary_station: place("basin_boundary_station"),
  splitspine_headland_gantry: source("island_headland_scraps"), canopy_lower_fins: source("canopy_grounding_fins_lower"),
  basin_service_rack: source("basin_ridge_salvage_north"), rift_materials_station: site("rift.materials_station"),
  divide_upper_dock: site("divide.service_dock"), splitspine_field_shelter: site("isles.headland_shelter"),
  meridian_shelf: site("meridian.staging_shelf"), meridian_gate_hall: site("meridian.gate_hall"),
  divide_turbine_hall: null, meridian_upper_hall: null, meridian_transfer_hall: null, meridian_medical_annex: null,
  meridian_service_window: null, meridian_inner_hall: null,
};
