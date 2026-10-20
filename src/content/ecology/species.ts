import type { RegionId } from "../registry.js";
import { at } from "./sites.js";
import type { SiteOffset } from "./sites.js";

/** Senses are separate on purpose: every predator need not share one hearing rule. */
export type Sense = "noise" | "light" | "disturbance" | "layer";
export type Deterrent = "acoustic" | "lure" | "ink";
export interface SenseDefinition {
  /** Metres at which the cue falls to zero. */
  readonly range: number;
  /** Awareness per second from a full-strength cue at zero distance. */
  readonly weight: number;
}
/** Where an animal will go. Outside it, the animal stops and loses interest. */
export type Habitat =
  | { readonly kind: "warm"; readonly minHeat: number }
  | { readonly kind: "below-layer"; readonly field: "divide_dense_layer"; readonly above: number }
  | { readonly kind: "territory" };
export interface ThreatDefinition {
  readonly label: string;
  readonly region: RegionId;
  readonly senses: Partial<Record<Sense, SenseDefinition>>;
  /** Fraction of a sound or vibration that passes solid cover. Light never does. */
  readonly coverPass: number;
  readonly awareness: { readonly alert: number; readonly investigate: number; readonly commit: number; readonly decay: number };
  /** Minimum seconds in each warning stage before the next one. */
  readonly timing: { readonly alert: number; readonly investigate: number; readonly commit: number; readonly withdraw: number; readonly refractory: number };
  readonly maxCycles: number;
  readonly speed: { readonly investigate: number; readonly commit: number; readonly withdraw: number };
  readonly territory: number;
  readonly standOff: number;
  /** Contact reach, or pulse radius for a sessile colony. */
  readonly reach: number;
  readonly strike: { readonly kind: "contact" | "pulse"; readonly diver: number; readonly hull: number };
  readonly habitat: Habitat;
  readonly attractedBy: readonly Deterrent[];
  readonly repelledBy: readonly Deterrent[];
  /** Captions that name the cue and the way out. Never color alone. */
  readonly captions: { readonly alert: Readonly<Partial<Record<Sense, string>>>; readonly investigate: string; readonly commit: string; readonly withdraw: string; readonly leash: string; readonly lure: string; readonly ink: string };
  readonly scan: string;
}

export const THREATS = {
  glare_stalker: {
    label: "Glare stalker",
    region: "thermal_rift",
    senses: { light: { range: 48, weight: 1.3 }, noise: { range: 22, weight: 0.5 } },
    coverPass: 0.3,
    awareness: { alert: 1, investigate: 2.4, commit: 4, decay: 0.3 },
    timing: { alert: 3, investigate: 4, commit: 3.5, withdraw: 6, refractory: 45 },
    maxCycles: 2,
    speed: { investigate: 2.6, commit: 7.5, withdraw: 4 },
    territory: 40, standOff: 9, reach: 2.2,
    strike: { kind: "contact", diver: 14, hull: 9 },
    habitat: { kind: "warm", minHeat: 0.2 },
    attractedBy: ["lure"], repelledBy: ["ink"],
    captions: {
      alert: {
        light: "Rippling lights run along a long shape in the warm passage. It has seen your lamp. Dim it, or climb to the pale cool ledges.",
        noise: "A long shape in the warm passage turns its head toward your noise. Slow down, dim your lamp or leave the warm water.",
      },
      investigate: "The glare stalker drifts closer, its lights pulsing in pairs. Dark and still, or out of the warm water, it loses you.",
      commit: "Its lights go dark and it straightens to lunge. Turn away, release ink or reach cool water.",
      withdraw: "The stalker coils back into the warm passage; its lights slow.",
      leash: "The stalker stops at the edge of the cool water and will not follow.",
      lure: "The stalker turns to follow the drifting lure.",
      ink: "The ink cloud blinds the stalker; it breaks off.",
    },
    scan: "Hunts light inside warm, dark passages and will not enter cool water. Paired pulses mean it is closing; dark lights mean a lunge. A drifting lure draws it; ink blinds it.",
  },
  layer_skate: {
    label: "Layer skate",
    region: "brine_divide",
    senses: { layer: { range: 36, weight: 1.6 }, noise: { range: 18, weight: 0.35 } },
    coverPass: 0.5,
    awareness: { alert: 1, investigate: 2.2, commit: 3.6, decay: 0.35 },
    timing: { alert: 2.5, investigate: 4, commit: 3, withdraw: 7, refractory: 56 },
    maxCycles: 1,
    speed: { investigate: 2.2, commit: 8, withdraw: 3.5 },
    territory: 48, standOff: 7, reach: 3.2,
    strike: { kind: "contact", diver: 18, hull: 12 },
    habitat: { kind: "below-layer", field: "divide_dense_layer", above: 0.3 },
    attractedBy: [], repelledBy: ["ink"],
    captions: {
      alert: {
        layer: "The mirror layer dimples below you: something wide is rising under it. Move slowly away from the surface of the layer, or climb.",
        noise: "A wide shadow turns beneath the mirror layer toward your noise. Climb away from the layer.",
      },
      investigate: "The skate's edge ripples just beneath the mirror surface, tracking you. It cannot reach more than a few metres above the layer.",
      commit: "The mirror layer bulges as the skate surges upward. Climb now.",
      withdraw: "The skate sinks back into the dense water; the mirror smooths over.",
      leash: "You are above the layer's reach. The skate's ripple fades.",
      lure: "The skate ignores the lure.",
      ink: "Ink spreads across the layer; the skate drops away.",
    },
    scan: "Lives inside the dense brine and feels vibration at the layer's surface. It surges no more than about three metres above the layer. Cross slowly where sails drift, or keep above it.",
  },
  hollow_choir: {
    label: "Hollow choir",
    region: "deep_district",
    senses: { noise: { range: 42, weight: 1.6 }, light: { range: 18, weight: 0.3 } },
    coverPass: 0.45,
    awareness: { alert: 1, investigate: 2.6, commit: 4.4, decay: 0.35 },
    timing: { alert: 3, investigate: 5, commit: 2, withdraw: 8, refractory: 50 },
    maxCycles: 2,
    speed: { investigate: 0, commit: 0, withdraw: 0 },
    territory: 30, standOff: 0, reach: 16,
    strike: { kind: "pulse", diver: 9, hull: 7 },
    habitat: { kind: "territory" },
    attractedBy: ["acoustic"], repelledBy: ["ink"],
    captions: {
      alert: {
        noise: "The pale bells along the gallery start to hum with your noise. Quiet your movement or leave the bells' reach.",
        light: "The bells nearest your lamp start to hum. Dim the lamp or move away.",
      },
      investigate: "The choir's hum rises and its bells swell together. A pressure pulse is coming; go quiet or leave the reach.",
      commit: "The choir releases a pressure pulse.",
      withdraw: "The bells fall silent and slowly close.",
      leash: "Outside the bells' reach the hum fades.",
      lure: "The choir answers the acoustic pulse instead and spends its chorus there.",
      ink: "The ink muffles the nearest bells.",
    },
    scan: "A sessile colony that answers sustained noise with a pressure pulse after a rising hum. It cannot move. Quiet coasting, leaving its reach or an acoustic pulse elsewhere all spend or calm it.",
  },
} as const satisfies Record<string, ThreatDefinition>;
export type ThreatSpeciesId = keyof typeof THREATS;

/** Ecological cues have no saved state: they are pure functions of the tick,
 * the hazard fields and the player's emissions, so they cannot drift from the
 * rule they teach. */
export const CUE_SPECIES = {
  ember_mites: {
    label: "Ember mites", region: "thermal_rift",
    scan: "Graze the chimney lip and leave it a few seconds before every vent. When the lip is bare, the plume is coming.",
    lead: 7,
  },
  basin_scavengers: {
    label: "Basin scavengers", region: "silt_basin",
    scan: "Feed beside stable wreck ridges and back into burrows before a sediment surge, or when machinery is loud. An empty lane is a plume lane.",
    lead: 8, machinery: 0.45,
  },
  brine_sails: {
    label: "Brine sails", region: "brine_divide",
    scan: "Drift along clear lanes well above the dense layer, where the downwelling is weakest. Following them is the calm crossing.",
    speed: 1.1,
  },
  canopy_school: {
    label: "Lantern school", region: "suspended_garden",
    scan: "Scatters when nearby machinery is loud. If the school breaks, the sound hunter can probably hear you too.",
    threshold: 0.35, range: 30,
  },
} as const;
export type CueSpeciesId = keyof typeof CUE_SPECIES;

export interface ThreatSpawn { readonly species: ThreatSpeciesId; readonly home: SiteOffset }
/** Bounded roster. IDs are stable save keys; homes are site-relative. */
export const THREAT_ROSTER = {
  rift_stalker_passage: { species: "glare_stalker", home: at("rift_split_chimney", -26, 6, 0) },
  rift_stalker_chimney: { species: "glare_stalker", home: at("rift_split_chimney", -14, 12, 6) },
  divide_skate_saddle: { species: "layer_skate", home: at("divide_saddle", 0, 4, 0) },
  divide_skate_east: { species: "layer_skate", home: at("divide_saddle", 60, 4, 30) },
  district_choir_gallery: { species: "hollow_choir", home: at("district_gallery", 0, 2, 0) },
  district_choir_terrace: { species: "hollow_choir", home: at("district_gallery", 70, 8, -40) },
} as const satisfies Record<string, ThreatSpawn>;
export type ThreatAgentId = keyof typeof THREAT_ROSTER;
export const THREAT_AGENT_IDS = Object.keys(THREAT_ROSTER) as ThreatAgentId[];

export interface CueSpawn { readonly species: CueSpeciesId; readonly home: SiteOffset; readonly hazard?: "rift_split_plume" | "basin_sediment_lane"; readonly lane?: readonly SiteOffset[] }
export const CUE_ROSTER = {
  rift_mites_lip: { species: "ember_mites", home: at("rift_split_chimney", 8, 3, 2), hazard: "rift_split_plume" },
  basin_scavengers_ridge: { species: "basin_scavengers", home: at("basin_wreck_ridge", 4, 0, -10), hazard: "basin_sediment_lane" },
  divide_sails_lane: {
    species: "brine_sails", home: at("divide_outer_ledge", 0, 10, 0),
    lane: [at("divide_outer_ledge", 0, 10, 0), at("divide_saddle", -30, 32, -46), at("divide_saddle", 60, 34, -50), at("divide_saddle", 130, 28, -20)],
  },
  canopy_school_crown: { species: "canopy_school", home: at("canopy_crown") },
} as const satisfies Record<string, CueSpawn>;
export type CueAgentId = keyof typeof CUE_ROSTER;

/** At most this many threats simulate per step; others rest at home. */
export const MAX_ACTIVE_THREATS = 6;
export const ACTIVATION_RADIUS = 140;
/** The slowest unaided escape: a quiet swimming diver (step.ts quiet speed). */
export const DIVER_ESCAPE_SPEED = 2;
/** No animal approaches closer than this to a refuge boundary. */
export const REFUGE_MARGIN = 12;
