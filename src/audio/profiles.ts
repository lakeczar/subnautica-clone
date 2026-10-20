/** S6 continuous layers: regional ambience, refuge beds, hull engines and the
 * threat layer. Pure data keyed by stable content IDs. */
import type { HullId, RegionId } from "../content/registry.js";

/** A sparse texture grain scheduled at random intervals with random pan. */
export type DetailKind =
  | "crackle" | "bubble" | "pebble" | "creak" | "floater" | "silt" | "dish"
  | "vent" | "groan" | "glass" | "knock" | "mast";
export interface Detail { kind: DetailKind; perMinute: number; level: number }

export interface AmbienceProfile {
  label: string;
  /** Water bed: looped noise through a lowpass that also closes with depth. */
  bed: { color: "pink" | "brown"; cutoff: number; level: number };
  /** Slow swell on the bed, Hz and depth 0..1. */
  swell: { rate: number; depth: number };
  /** Very quiet tonal floor; two or three detuned partials. */
  drone: { hz: readonly number[]; level: number; wave: OscillatorType };
  details: readonly Detail[];
  /** Reverb send for the region's space. */
  wet: number;
}

/** Levels are dBFS at full volume, measured in tools/audio-lab.html. */
export const REGION_AMBIENCE: Readonly<Record<RegionId, AmbienceProfile>> = {
  refuge_reef: {
    label: "Hearth Reef · bright shallows, snapping fauna",
    bed: { color: "pink", cutoff: 950, level: -31 },
    swell: { rate: 0.09, depth: 0.35 },
    drone: { hz: [73.4, 110.2], level: -44, wave: "sine" },
    details: [{ kind: "crackle", perMinute: 140, level: -38 }, { kind: "bubble", perMinute: 10, level: -36 }],
    wet: 0.25,
  },
  island_chain: {
    label: "Splitspine Isles · surf-washed ledges",
    bed: { color: "pink", cutoff: 1150, level: -30 },
    swell: { rate: 0.12, depth: 0.5 },
    drone: { hz: [82.4, 123.7], level: -46, wave: "sine" },
    details: [{ kind: "pebble", perMinute: 40, level: -38 }, { kind: "bubble", perMinute: 14, level: -36 }],
    wet: 0.2,
  },
  suspended_garden: {
    label: "Lantern Canopy · tethered fronds, floater schools",
    bed: { color: "pink", cutoff: 680, level: -32 },
    swell: { rate: 0.06, depth: 0.3 },
    drone: { hz: [82.4, 123.5, 164.6], level: -43, wave: "triangle" },
    details: [{ kind: "creak", perMinute: 9, level: -33 }, { kind: "floater", perMinute: 12, level: -38 }],
    wet: 0.35,
  },
  silt_basin: {
    label: "Pale Basin · muffled bowl, fallen dishes",
    bed: { color: "brown", cutoff: 420, level: -30 },
    swell: { rate: 0.04, depth: 0.25 },
    drone: { hz: [65.4, 98.1], level: -42, wave: "sine" },
    details: [{ kind: "silt", perMinute: 6, level: -36 }, { kind: "dish", perMinute: 2, level: -33 }],
    wet: 0.45,
  },
  thermal_rift: {
    label: "Ember Rift · rumbling chimneys, vent bursts",
    bed: { color: "brown", cutoff: 260, level: -27 },
    swell: { rate: 0.05, depth: 0.4 },
    drone: { hz: [41.2, 82.4], level: -38, wave: "sine" },
    details: [{ kind: "vent", perMinute: 8, level: -32 }, { kind: "groan", perMinute: 4, level: -34 }],
    wet: 0.4,
  },
  brine_divide: {
    label: "Mirror Divide · glassy layers, beating tones",
    bed: { color: "brown", cutoff: 520, level: -32 },
    swell: { rate: 0.03, depth: 0.2 },
    drone: { hz: [87.3, 87.9, 130.8], level: -41, wave: "sine" },
    details: [{ kind: "glass", perMinute: 10, level: -38 }],
    wet: 0.55,
  },
  deep_district: {
    label: "Meridian District · settlement machinery, long halls",
    bed: { color: "brown", cutoff: 320, level: -30 },
    swell: { rate: 0.025, depth: 0.15 },
    drone: { hz: [46, 92, 138], level: -38, wave: "triangle" },
    details: [{ kind: "knock", perMinute: 5, level: -33 }, { kind: "groan", perMinute: 2, level: -36 }],
    wet: 0.6,
  },
};

/** Above the waterline: wind and surf replace the water bed. */
export const SURFACE_AMBIENCE: AmbienceProfile = {
  label: "Surface · wind and surf",
  bed: { color: "pink", cutoff: 2400, level: -31 },
  swell: { rate: 0.14, depth: 0.6 },
  drone: { hz: [], level: -60, wave: "sine" },
  details: [{ kind: "mast", perMinute: 3, level: -38 }],
  wet: 0.05,
};

/** Warm refuge bed: D add9 on soft triangles with a slow tremolo, plus ventilation. */
export const REFUGE_BED = {
  chord: [146.8, 220, 329.6] as readonly number[],
  level: -34,
  tremolo: 0.22,
  vent: { cutoff: 380, level: -40 },
  /** Outside ambience heard through the hull. */
  outsideDuck: 0.25,
  outsideCutoff: 500,
} as const;
/** Inhabited interiors (Hearthline, Creel cabin): a smaller, quieter room. */
export const INTERIOR_BED = { ...REFUGE_BED, level: -37, vent: { cutoff: 300, level: -37 }, hum: [60, 120] as readonly number[], humLevel: -44 } as const;

/** Depth layer: pressure rumble added as the listener descends. */
export const DEPTH_LAYER = { cutoff: 110, levelAt780: -32, closeBedTo: 0.45 } as const;

export interface HullLayer {
  label: string;
  /** Ordinary and boosted speeds in m/s that map to throttle 1 and boost. */
  cruise: number;
  boost: number | null;
  motor: { wave: OscillatorType; idle: number; full: number; lowpass: number; level: number };
  /** Propeller or water wash: band-passed noise opening with throttle. */
  wash: { idle: number; full: number; q: number; level: number };
  /** Idle electrical hum, always on while piloted. */
  hum: { hz: number; level: number };
  /** Amplitude flutter: mechanical tremolo rate and depth. */
  flutter: { rate: number; depth: number };
  /** Optional boost whine (Dart's audible boost). */
  boostWhine?: { from: number; to: number; level: number };
  /** Hush's passive listening raises threat and detail layers, in dB. */
  listening?: number;
}

export const HULL_LAYERS: Readonly<Record<HullId, HullLayer>> = {
  dart: {
    label: "Dart · quick needle, audible boost",
    cruise: 8, boost: 11,
    motor: { wave: "triangle", idle: 110, full: 260, lowpass: 1400, level: -33 },
    wash: { idle: 700, full: 2200, q: 1.2, level: -34 },
    hum: { hz: 220, level: -44 },
    flutter: { rate: 0, depth: 0 },
    boostWhine: { from: 520, to: 880, level: -33 },
  },
  creel: {
    label: "Creel · workboat drone, mechanical clatter",
    cruise: 4, boost: null,
    motor: { wave: "sawtooth", idle: 55, full: 96, lowpass: 420, level: -28 },
    wash: { idle: 300, full: 900, q: 1, level: -31 },
    hum: { hz: 110, level: -40 },
    flutter: { rate: 9, depth: 0.35 },
  },
  hush: {
    label: "Hush · near-silent glide, listening",
    cruise: 6, boost: null,
    motor: { wave: "sine", idle: 180, full: 210, lowpass: 800, level: -46 },
    wash: { idle: 3000, full: 4200, q: 0.8, level: -46 },
    hum: { hz: 360, level: -52 },
    flutter: { rate: 0, depth: 0 },
    listening: 4,
  },
  spindle: {
    label: "Spindle · surface slap, solar whine",
    cruise: 7, boost: null,
    motor: { wave: "triangle", idle: 90, full: 150, lowpass: 900, level: -34 },
    wash: { idle: 500, full: 1300, q: 1.4, level: -30 },
    hum: { hz: 1180, level: -50 },
    flutter: { rate: 1.3, depth: 0.5 },
  },
  mantle: {
    label: "Mantle · armoured bell, cooling fans",
    cruise: 4, boost: null,
    motor: { wave: "sawtooth", idle: 41, full: 70, lowpass: 260, level: -29 },
    wash: { idle: 1300, full: 1700, q: 2, level: -36 },
    hum: { hz: 82, level: -38 },
    flutter: { rate: 17, depth: 0.25 },
  },
  hearthline: {
    label: "Hearthline · carrier throb, ventilation",
    cruise: 3, boost: null,
    motor: { wave: "sawtooth", idle: 46, full: 58, lowpass: 200, level: -27 },
    wash: { idle: 150, full: 320, q: 0.8, level: -30 },
    hum: { hz: 92, level: -37 },
    flutter: { rate: 0.7, depth: 0.3 },
  },
};

/** Bobbin, the tethered recovery tool: reel whine while a tow is under way. */
export const BOBBIN_LAYER = {
  label: "Bobbin · tether reel",
  whine: { from: 700, to: 1050, level: -40 },
  motor: { hz: 160, level: -42 },
} as const;

/** Encounter layer: a pulse for tension plus a breathing presence at the hunter's bearing. */
export const THREAT_LAYER = {
  pulse: { hz: 55, bpmIdle: 52, bpmPursue: 92, level: -30 },
  presence: { cutoff: 260, q: 2, level: -32, audibleWithin: 80 },
  /** Bus ducks while the hunter pursues. Linear multipliers. */
  pursueDuck: { ambience: 0.5, music: 0.25 },
} as const;
