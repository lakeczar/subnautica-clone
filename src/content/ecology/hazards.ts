import type { HullId, MaterialId, RegionId } from "../registry.js";
import { at } from "./sites.js";
import type { SiteOffset } from "./sites.js";

/** Later-region hazards as authored fields, not a fluid simulation. Each field
 * has a readable cue in the world and a counter that is reachable beforehand.
 * Intensities are 0..1 for heat, brine, sediment and darkness; m/s for current. */
export type HazardKind = "heat" | "brine" | "current" | "sediment" | "darkness";
export type HazardShape =
  | { readonly kind: "cylinder"; readonly center: SiteOffset; readonly radius: number; readonly bottom: number; readonly top: number }
  | { readonly kind: "box"; readonly center: SiteOffset; readonly min: Vec; readonly max: Vec }
  /** Everything below `center.y + y` inside the horizontal box. */
  | { readonly kind: "layer"; readonly center: SiteOffset; readonly y: number; readonly min: Vec; readonly max: Vec };
interface Vec { readonly x: number; readonly y: number; readonly z: number }
export interface HazardCycle {
  /** Seconds of one full cycle, keyed to the saved simulation tick. */
  readonly period: number;
  readonly start: number;
  readonly duration: number;
  /** Seconds of rise and fall on each side of the active window. */
  readonly ramp: number;
}
export interface HazardFieldDefinition {
  readonly label: string;
  readonly kind: HazardKind;
  readonly region: RegionId;
  readonly shape: HazardShape;
  readonly intensity: number;
  /** Metres beyond the shape over which the field fades to zero. */
  readonly edge: number;
  /** Fraction of intensity that remains while a cycled field is quiet. */
  readonly baseline?: number;
  readonly cycle?: HazardCycle;
  /** Unit direction for current and sediment drift. */
  readonly flow?: Vec;
  /** What the player can observe before harm, never color alone. */
  readonly cue: string;
}

export const HAZARD_FIELDS = {
  rift_split_plume: {
    label: "Split chimney plume", kind: "heat", region: "thermal_rift",
    shape: { kind: "cylinder", center: at("rift_split_chimney"), radius: 10, bottom: -2, top: 72 },
    intensity: 1, edge: 6, baseline: 0.3,
    cycle: { period: 75, start: 30, duration: 18, ramp: 3 },
    cue: "Ember mites leave the chimney lip, the water above it shimmers and a low roar builds before each vent.",
  },
  rift_warm_passage: {
    label: "Warm passage", kind: "heat", region: "thermal_rift",
    shape: { kind: "box", center: at("rift_split_chimney"), min: { x: -45, y: -6, z: -14 }, max: { x: -9, y: 24, z: 14 } },
    intensity: 0.36, edge: 4,
    cue: "Pale fans close and the rock darkens; the suit reports a steady warm load.",
  },
  rift_passage_dark: {
    label: "Unlit rift passage", kind: "darkness", region: "thermal_rift",
    shape: { kind: "box", center: at("rift_split_chimney"), min: { x: -48, y: -6, z: -16 }, max: { x: 12, y: 40, z: 16 } },
    intensity: 0.85, edge: 6,
    cue: "Light from above ends at the passage mouth; only plume glow and animal lights remain.",
  },
  divide_dense_layer: {
    label: "Dense brine layer", kind: "brine", region: "brine_divide",
    // S2's brine volume: X 180..950, Z -1632..-1280, interface at BRINE_Y -440.
    shape: { kind: "layer", center: at("divide_saddle"), y: 10, min: { x: -385, y: 0, z: -176 }, max: { x: 385, y: 0, z: 176 } },
    intensity: 1, edge: 1,
    cue: "A mirror-bright surface lies across the saddle; sails drift above it and nothing lives below.",
  },
  divide_downwelling: {
    label: "Saddle downwelling", kind: "current", region: "brine_divide",
    // S2's `hazard.divide.crest_current` over the crest: X 200..960, Y -372..-330, Z -1282..-1215.
    shape: { kind: "box", center: at("divide_saddle"), min: { x: -365, y: 78, z: 174 }, max: { x: 395, y: 120, z: 241 } },
    intensity: 1.1, edge: 6, flow: { x: 0, y: -0.6, z: -0.8 },
    cue: "Filter ribbons on the crest all lean south and down toward the mirror layer; suspended grains streak past.",
  },
  basin_sediment_lane: {
    label: "Basin plume lane", kind: "sediment", region: "silt_basin",
    // S2's `hazard.basin.plume_south` lane off the fractured south slope.
    shape: { kind: "box", center: at("basin_wreck_ridge"), min: { x: -163, y: -136, z: -328 }, max: { x: 117, y: -64, z: -88 } },
    intensity: 0.8, edge: 4, baseline: 0.08, flow: { x: 0, y: 0, z: 1 },
    cycle: { period: 100, start: 50, duration: 16, ramp: 4 },
    cue: "Scavengers back into their burrows and the lane's floor lifts in a slow grey wall.",
  },
  district_gallery_dark: {
    label: "Unlit service gallery", kind: "darkness", region: "deep_district",
    shape: { kind: "box", center: at("district_gallery"), min: { x: -40, y: -5, z: -40 }, max: { x: 40, y: 26, z: 40 } },
    intensity: 0.9, edge: 8,
    cue: "Gallery lamps are dead; the choir's pale bells are the only landmarks.",
  },
} as const satisfies Record<string, HazardFieldDefinition>;
export type HazardFieldId = keyof typeof HAZARD_FIELDS;

/** Current speed of the drift fields above, in m/s at full intensity. */
export const CURRENT_SPEED_SCALE = 1;

/** Exposure accumulates while a field exceeds the actor's tolerance. Loads run
 * 0..100; warnings at 40 and 70 name the protection, harm starts at 100. */
export const EXPOSURE = {
  heat: { rate: 20, recovery: 12, diverHarm: 8, hullHarm: 4 },
  // Brine is a slow equipment hazard (WORLD_PROGRESSION): warned, escapable by
  // climbing a metre, and slow enough that it never outpaces an encounter.
  brine: { rate: 14, recovery: 10, diverHarm: 1.5, hullHarm: 1 },
  warnings: [40, 70, 100] as const,
} as const;
export const UNPROTECTED = { heat: 0.3, brine: 0, current: 0.15 } as const;

export type ProtectionId = "heat_shroud" | "hull_heat_lining" | "brine_seals" | "hull_brine_seals" | "trim_vanes";
export interface ProtectionDefinition {
  readonly label: string;
  readonly fits: "suit" | "hull";
  /** Added tolerance (heat, brine) or added current authority. */
  readonly heat?: number;
  readonly brine?: number;
  readonly current?: number;
  /** Proposed recipe; quantities are untested tuning, functions are not. */
  readonly cost: Partial<Record<MaterialId, number>>;
  readonly counters: HazardKind;
  readonly why: string;
}
export const PROTECTION: Readonly<Record<ProtectionId, ProtectionDefinition>> = {
  heat_shroud: {
    label: "Ceramic heat shroud", fits: "suit", heat: 0.45, counters: "heat",
    cost: { pressure_ceramic: 2, flex_membrane: 2 },
    why: "Ceramic plates over membrane seals; the first plates come from the cool flank lip, outside any plume.",
  },
  hull_heat_lining: {
    label: "Hull heat lining", fits: "hull", heat: 0.4, counters: "heat",
    cost: { pressure_ceramic: 3, structural_alloy: 1 },
    why: "Lines the pressure hull; crossing a vent remains a timing decision.",
  },
  brine_seals: {
    label: "Lattice brine seals", fits: "suit", brine: 0.85, counters: "brine",
    cost: { brine_lattice: 2, flex_membrane: 2 },
    why: "Lattice filters rinsed above the layer protect suit joints below it.",
  },
  hull_brine_seals: {
    label: "Hull brine seals", fits: "hull", brine: 0.8, counters: "brine",
    cost: { brine_lattice: 3, flex_membrane: 1 },
    why: "Keeps hull seals from etching during a deliberate dense-layer descent.",
  },
  trim_vanes: {
    label: "Resin trim vanes", fits: "hull", current: 0.25, counters: "current",
    cost: { buoyant_resin: 2, structural_alloy: 1 },
    why: "Canopy resin trim gives small hulls authority against the saddle downwelling.",
  },
};

/** Inherent hull handling of the fields; suit values apply to a diver. */
export const HULL_TOLERANCE: Readonly<Record<HullId, { heat: number; brine: number; current: number }>> = {
  dart: { heat: 0.3, brine: 0, current: 0.5 },
  creel: { heat: 0.35, brine: 0.1, current: 0.6 },
  hush: { heat: 0.3, brine: 0, current: 0.25 },
  spindle: { heat: 0.3, brine: 0, current: 0.4 },
  mantle: { heat: 0.8, brine: 0.7, current: 0.85 },
  hearthline: { heat: 0.4, brine: 0.2, current: 0.9 },
};

/** The first deposit of each later material and the configuration that must
 * reach it before any recipe using the material is needed. */
export const FIRST_DEPOSITS = {
  pressure_ceramic: { at: at("rift_cool_flank"), configuration: 350, condition: "Pale lip layers on the cooled chimney flank" },
  thermal_core: { at: at("rift_inactive_shoulder"), configuration: 350, condition: "Stable inclusions on the inactive shoulder" },
  brine_lattice: { at: at("divide_outer_ledge"), configuration: 450, condition: "Rinsed crystals on the flushed outer ledge above the layer" },
} as const satisfies Partial<Record<MaterialId, { at: SiteOffset; configuration: number; condition: string }>>;

/** Pressure is already enforced by survival.ts. These bands only make the
 * warning legible: each names the next refit and where its material starts. */
export const PRESSURE_REFITS = [
  { limit: 60, next: "150 m pressure suit", materials: "alloy scraps and shed membrane", where: "Hearth Reef and the Splitspine shore" },
  { limit: 150, next: "350 m suit refit", materials: "conductive crust and cured resin", where: "the upper Lantern Canopy" },
  { limit: 350, next: "450 m pressure refit", materials: "pressure ceramic and thermal core", where: "the cool Ember Rift flank and its inactive shoulder" },
  { limit: 450, next: "800 m service package", materials: "brine lattice", where: "the flushed outer ledges of the Mirror Divide" },
] as const;
export const PRESSURE_BANDS = { creak: 0.85, stress: 0.95 } as const;
