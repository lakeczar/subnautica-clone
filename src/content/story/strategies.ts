/** The two viable fleet strategies from EXPEDITION_INTEGRATION, written as
 * capability steps so the story graph can be checked for completion against each.
 * These are proposals mirroring the planned recipes, not the recipe registry:
 * the coordinator replaces step IDs with real recipe IDs when composing. */
import type { BlueprintId, HullId, MaterialId } from "../registry.js";
import type { StoryBlueprintId } from "./evidence.js";

export type AnyBlueprint = BlueprintId | StoryBlueprintId | "bp_keel_survey";
export type StopId = "stop_canopy" | "stop_divide_lee";

export interface CampaignStep {
  label: string;
  blueprints: readonly AnyBlueprint[];
  /** Step IDs that must be done first. */
  needs: readonly string[];
  materials: readonly MaterialId[];
  suit?: number;
  hull?: readonly [HullId, number];
  stop?: StopId;
}

export const CAMPAIGN_STEPS = {
  suit_150: { label: "150 m suit", blueprints: ["bp_pod_checklist"], needs: [], materials: ["structural_alloy", "flex_membrane"], suit: 150 },
  dart: { label: "Dart 180 m", blueprints: ["bp_island_workshop"], needs: ["suit_150"], materials: ["structural_alloy", "silica_glass", "flex_membrane"], hull: ["dart", 180] },
  suit_350: { label: "Suit refit 350 m", blueprints: ["bp_canopy_reinforcement"], needs: ["suit_150"], materials: ["conductive_crust", "buoyant_resin"], suit: 350 },
  dart_350: { label: "Dart keel refit 350 m", blueprints: ["bp_keel_survey"], needs: ["dart", "suit_350"], materials: ["conductive_crust", "buoyant_resin"], hull: ["dart", 350] },
  creel: { label: "Creel 240 m", blueprints: ["bp_creel_service"], needs: ["dart"], materials: ["structural_alloy", "silica_glass", "conductive_crust"], hull: ["creel", 240] },
  creel_350: { label: "Creel refit 350 m", blueprints: ["bp_rift_pressure"], needs: ["creel", "suit_350"], materials: ["conductive_crust", "buoyant_resin"], hull: ["creel", 350] },
  stop_canopy: { label: "Canopy service stop", blueprints: ["bp_canopy_reinforcement"], needs: ["creel"], materials: ["silica_glass", "conductive_crust"], stop: "stop_canopy" },
  suit_450: { label: "Suit refit 450 m", blueprints: ["bp_rift_pressure"], needs: ["suit_350"], materials: ["pressure_ceramic"], suit: 450 },
  creel_450: { label: "Creel refit 450 m", blueprints: ["bp_rift_pressure"], needs: ["creel_350"], materials: ["pressure_ceramic", "thermal_core"], hull: ["creel", 450] },
  stop_divide_lee: {
    label: "Divide lee service stop", blueprints: ["bp_deep_service"], needs: ["creel_450"],
    materials: ["structural_alloy", "silica_glass", "conductive_crust", "brine_lattice"], stop: "stop_divide_lee",
  },
  creel_800: { label: "Creel deep service package 800 m", blueprints: ["bp_deep_service"], needs: ["creel_450"], materials: ["pressure_ceramic", "thermal_core", "brine_lattice"], hull: ["creel", 800] },
  suit_800: { label: "Suit refit 800 m", blueprints: ["bp_deep_service"], needs: ["suit_450"], materials: ["pressure_ceramic", "brine_lattice"], suit: 800 },
  hearthline_400: {
    label: "Hearthline 400 m", blueprints: ["bp_carrier_workshop", "bp_carrier_basin"], needs: ["creel"],
    materials: ["structural_alloy", "silica_glass", "flex_membrane", "conductive_crust", "buoyant_resin"], hull: ["hearthline", 400],
  },
  hearthline_550: { label: "Hearthline refit 550 m", blueprints: ["bp_rift_pressure"], needs: ["hearthline_400"], materials: ["pressure_ceramic", "brine_lattice"], hull: ["hearthline", 550] },
  mantle: { label: "Mantle 800 m", blueprints: ["bp_deep_service"], needs: ["hearthline_400"], materials: ["pressure_ceramic", "thermal_core", "brine_lattice"], hull: ["mantle", 800] },
} as const satisfies Record<string, CampaignStep>;
export type StepId = keyof typeof CAMPAIGN_STEPS;

const COMMON = ["suit_150", "dart", "suit_350", "creel", "dart_350", "creel_350", "stop_canopy", "suit_450"] as const;
export const FLEET_STRATEGIES = {
  /** Upgraded Creel with restored service stops. No carrier. */
  independent: { label: "Creel and service stops", steps: [...COMMON, "creel_450", "stop_divide_lee", "creel_800", "suit_800"] },
  /** Hearthline carrying a Mantle; the Creel is never refitted past 350 m. */
  carrier: { label: "Hearthline and Mantle", steps: [...COMMON, "hearthline_400", "hearthline_550", "mantle", "suit_800"] },
} as const satisfies Record<string, { label: string; steps: readonly StepId[] }>;
export type StrategyId = keyof typeof FLEET_STRATEGIES;

/** Hulls that can work a site directly, and hulls the carrier can berth and launch. */
export const SORTIE_HULLS = ["dart", "creel", "hush", "mantle"] as const satisfies readonly HullId[];
/** Carrier moorings by zone: the carrier works as a dive platform where moored. */
export const CARRIER_SHELF_DEPTH = 520;
/** Unprotected and starter gear swim range, metres. Deeper sites need a craft. */
export const SWIM_DEPTH = 60;

/** First-access shelves for each material: craft depth and diver exit, metres. */
export const MATERIAL_SHELVES = {
  structural_alloy: { depth: 0, exit: null },
  silica_glass: { depth: 0, exit: null },
  flex_membrane: { depth: 10, exit: 10 },
  buoyant_resin: { depth: 10, exit: 10 },
  conductive_crust: { depth: 90, exit: 90 },
  pressure_ceramic: { depth: 265, exit: 265 },
  thermal_core: { depth: 300, exit: 300 },
  brine_lattice: { depth: 385, exit: 385 },
} as const satisfies Record<MaterialId, { depth: number; exit: number | null }>;

/** Non-story records owned elsewhere that the strategies depend on (B1 in progress). */
export const EXTERNAL_GRANTS = {
  basin_keel_plate: { depth: 170, exit: 200, grants: ["bp_keel_survey"] },
} as const satisfies Record<string, { depth: number; exit: number | null; grants: readonly AnyBlueprint[] }>;
