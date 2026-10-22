/** SYS-2 socket hosts: the modules every host can carry, the field-outpost tiers
 * and siting thresholds, the fixed hosts (pod and restored stops) and the map from
 * Hearthline socket occupants to module kinds. Proposed balance, not final. */
import { PLACES } from "../registry.js";
import { WORKING_STOPS } from "../stops.js";
import { CROWN_STATION } from "../hub/crownStation.js";
import type { MaterialId } from "../registry.js";
import type { Sys2ItemKind } from "./items.js";

export const MODULES = {
  charger: { label: "Cell charger", item: "mod_charger", needsPower: true },
  locker: { label: "Locker", item: "mod_locker", needsPower: false, lockerCu: 32 },
  planter: { label: "Planter", item: "mod_planter", needsPower: false },
  decoder: { label: "Decoder", item: "mod_decoder", needsPower: true },
  survey: { label: "Survey station", item: "mod_survey", needsPower: true },
  fabricator: { label: "Small fabricator", item: "mod_fabricator", needsPower: true },
  relay: { label: "Signal relay", item: "mod_relay", needsPower: true },
} as const satisfies Record<string, { label: string; item: Sys2ItemKind; needsPower: boolean; lockerCu?: number }>;
export type ModuleKind = keyof typeof MODULES;
export const MODULE_KINDS = Object.keys(MODULES) as ModuleKind[];
export const moduleOfItem = (kind: string): ModuleKind | null =>
  MODULE_KINDS.find((m) => MODULES[m].item === kind) ?? null;

export type OutpostTier = "basic" | "standard" | "advanced";
export const OUTPOST_TIER_ORDER: readonly OutpostTier[] = ["basic", "standard", "advanced"];
/** Every tier has a built-in charger and locker. `packLoss` is the anchor and seal
 * material spent each time a deployed outpost is packed. `upgrade` is the in-place
 * cost from the previous tier; each tier adds one frontier material. */
export const OUTPOST_TIERS = {
  basic: {
    label: "Basic field outpost", kit: "outpost_kit_basic", sockets: 1, lockerCu: 24,
    packLoss: { structural_alloy: 1 }, upgrade: null, bp: "bp_field_outpost",
  },
  standard: {
    label: "Standard field outpost", kit: "outpost_kit_standard", sockets: 3, lockerCu: 32,
    packLoss: { structural_alloy: 1, flex_membrane: 1 },
    upgrade: { structural_alloy: 3, silica_glass: 2, conductive_crust: 2 }, bp: "bp_outpost_standard",
  },
  advanced: {
    label: "Advanced field outpost", kit: "outpost_kit_advanced", sockets: 5, lockerCu: 48,
    packLoss: { structural_alloy: 1, conductive_crust: 1 },
    upgrade: { structural_alloy: 4, conductive_crust: 2, pressure_ceramic: 2 }, bp: "bp_outpost_advanced",
  },
} as const satisfies Record<OutpostTier, {
  label: string; kit: Sys2ItemKind; sockets: number; lockerCu: number;
  packLoss: Partial<Record<MaterialId, number>>; upgrade: Partial<Record<MaterialId, number>> | null; bp: string;
}>;
export const tierOfKit = (kind: string): OutpostTier | null =>
  OUTPOST_TIER_ORDER.find((t) => OUTPOST_TIERS[t].kit === kind) ?? null;
export const BUILT_IN_SERVICES = ["charger", "locker"] as const satisfies readonly ModuleKind[];

/** About three active at once. SYS-1's upgrade passes a bonus to raise it. */
export const OUTPOST_LIMIT = 3;
/** Siting rules for a deploy, in metres and degrees. */
export const OUTPOST_SITING = {
  maxSlope: 22,
  /** Surfaces that hold an anchor without a vent. */
  grounds: ["ledge", "cave_floor"],
  /** Any firm, level ground counts if a vent is this close. */
  ventSiteRange: 30,
  /** Distance from another outpost or a fixed host. */
  spacing: 40,
  /** The diver plants the kit within reach. */
  reach: 6,
  /** Solar works only in bright water, never in a cave. */
  solarDepth: 30,
  thermalRange: 25,
} as const;

/** Local service range for module installs and planting at any non-carrier host. */
export const HOST_REACH = 6;

/** Pod and restored stops: larger fixed hosts, each with one unique service an
 * outpost can't offer. `facility` must be restored before sockets work; the pod's
 * sockets work from the start. Power comes from the host's own plant. */
export const FIXED_HOSTS = {
  home_pod: {
    kind: "pod", label: PLACES.home_pod.label, position: PLACES.home_pod.position, facility: null, sockets: 2,
    unique: "Refuge air, healing and the emergency meal",
  },
  island_workshop: {
    kind: "stop", label: PLACES.island_workshop.label, position: PLACES.island_workshop.position, facility: "island_workshop", sockets: 3,
    unique: "Hull fabrication and refits",
  },
  canopy_stop: {
    kind: "stop", label: PLACES.canopy_stop.label, position: PLACES.canopy_stop.position, facility: "canopy_stop", sockets: 3,
    unique: "Major-mount changes and hull service at depth",
  },
  // C4: S9's restored service stops (content/stops.ts) host modules too.
  rift_station: {
    kind: "stop", label: WORKING_STOPS.rift_station.label, position: WORKING_STOPS.rift_station.work, facility: "rift_station", sockets: 3,
    unique: "450 m refits, air and hull service on the Rift shoulder",
  },
  divide_dock: {
    kind: "stop", label: WORKING_STOPS.divide_dock.label, position: WORKING_STOPS.divide_dock.work, facility: "divide_dock", sockets: 3,
    unique: "800 m refits, mount changes and the forward air stop",
  },
  // HUB-2: the crown station's sockets and its built-in survey array work with
  // the third stage; the survey reaches 300 m without a mast.
  crown_station: {
    kind: "stop", label: WORKING_STOPS.crown_station.label, position: WORKING_STOPS.crown_station.work, facility: "crown_survey",
    sockets: CROWN_STATION.sockets, unique: CROWN_STATION.unique, builtIn: ["survey"], surveyTier: CROWN_STATION.surveyTier,
  },
} as const satisfies Record<string, {
  kind: "pod" | "stop"; label: string; position: { x: number; y: number; z: number };
  facility: string | null; sockets: number; unique: string;
  /** Services without a socket (a built-in survey array), and that array's tier. */
  builtIn?: readonly ModuleKind[]; surveyTier?: number;
}>;
export type FixedHostId = keyof typeof FIXED_HOSTS;

/** Hearthline socket occupant names (HEARTHLINE_SOCKETS `accepts`) that are SYS-2
 * modules. The bridge survey socket takes the decoder (C4), as do the fabrication
 * benches' `sample_analyser` slots. Other occupants are furniture. */
export const CARRIER_OCCUPANTS: Readonly<Record<string, ModuleKind>> = {
  galley_planter: "planter",
  directional_survey: "survey",
  relay_receiver: "relay",
  fabricator_module: "fabricator",
  battery_charger: "charger",
  locker: "locker",
  sample_analyser: "decoder",
  decoder: "decoder",
};
