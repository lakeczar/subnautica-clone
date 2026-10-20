/** SYS-1 upgrade catalogue: what each craft can be fitted with, in two layers.
 *
 * - **Common pool:** fits every craft where it physically fits (`fits`).
 * - **Signature:** fits exactly one hull and gives that craft its distinct use
 *   (GAME-DIRECTION's signature table).
 *
 * Every cost uses the shared materials (plus intact tagged frames): there is no
 * per-vessel currency. Slot limits (HULL_SLOTS) keep signatures as choices: they
 * compete with the common pool for the same sockets and bays. Quantities and
 * effect sizes are tuning proposals; `scripts/upgrade-economy.mjs` checks every
 * cost against the sources reachable at its tier.
 *
 * Nothing here is read by the simulation yet. `docs/build/streams/SYS-1.md` says
 * how the coordinator composes it into the registry, modules, step and survival. */
import type { CostKind, HullId } from "../registry.js";

/** Where an upgrade sits on a hull.
 * - `socket`: small equipment socket; the module stays a hold item and counts in cargo (the M1 trim contract).
 * - `hull`: structural or thermal bay (plating, linings, exchanger, arrays); outside cargo.
 * - `major`: the one major mount (Creel mount, Mantle jaw, Spindle deck); outside cargo.
 * - `tool`: a work hardpoint (Creel tool arms, Spindle bow); outside cargo.
 * - `system`: a powered Hearthline system socket (decoder, survey, planters, charging dock…).
 * - `structure`: the Hearthline's structural retrofits (berths, system bay).
 * - `refit`: a paid, permanent pressure refit recorded in `VehicleState.rating`; never removed. */
export type SlotKind = "socket" | "hull" | "major" | "tool" | "system" | "structure" | "refit";
export type UpgradeLayer = "common" | "signature";
/** The reach a player has when buying it. 1: 150 m suit and a first craft;
 * 2: 350 m suit and refits; 3: 450 m suit and refits (see REACH_TIERS). */
export type ReachTier = 1 | 2 | 3;
/** Actions a fitted upgrade grants. Rules live in `sim/upgrades/tools.ts`. */
export type ToolKind =
  | "overdrive" | "flare" | "ballast" | "cutting_arm" | "grapple" | "deck_crane" | "service_head"
  | "drop_pod" | "salvage_clamp" | "mooring_anchor" | "shore_ramp" | "specimen_bay";
/** Complex upgrades with a defined contract and minimal rules; full behaviour is wired later. */
export type ContractKind = "wide_sonar" | "range_tagger" | "listening_array" | "scout_drone" | "radio_mast";

/** Effects fold in catalogue order: multipliers (×, default 1), then additions
 * (+, default 0), then caps. All are relative to the hull's base profile. */
export interface UpgradeEffect {
  /** × quiet, cruise and boost speed. */
  readonly speed?: number;
  readonly quietAdd?: number;
  readonly boostAdd?: number;
  /** Boost is capped at cruise speed (silent running). */
  readonly noBoost?: true;
  /** × loudness in every mode (the value wildlife reads as `noise`). */
  readonly noise?: number;
  /** × lamp output (the value wildlife reads as `light`). */
  readonly lamp?: number;
  /** + stock-battery percent per second while the lamp is lit. */
  readonly lampDrain?: number;
  /** × motive drain. */
  readonly drain?: number;
  /** × battery capacity (stock = 1). */
  readonly capacity?: number;
  /** + metres of pressure margin above the paid hull rating. */
  readonly ratingAdd?: number;
  /** × incoming hull damage (collision, bites, exposure harm). */
  readonly damage?: number;
  /** + heat tolerance (S4's 0..1 field scale). */
  readonly heat?: number;
  /** × heat-load accumulation while heat exceeds tolerance. */
  readonly heatLoad?: number;
  /** Ambient heat is ignored; plume cores and active bursts never are. */
  readonly ambientHeatImmune?: true;
  /** + brine tolerance. */
  readonly brine?: number;
  /** + current authority (S4's 0..0.95 scale). */
  readonly current?: number;
  /** + hold CU (negative: the fitting takes deck or hold space). */
  readonly holdCu?: number;
  /** × the hull's solar charge at the surface. */
  readonly solar?: number;
  /** Charges in warm water near vents (`sim/power`). */
  readonly thermalCharge?: true;
  /** Diver air line from the hull; `hull` is the Mantle's long-reach line. */
  readonly airLine?: "hull";
  /** + powered Hearthline system sockets. */
  readonly systemSockets?: number;
  /** The carrier may hold one medium and one compact craft at once. */
  readonly mixedBerths?: true;
  readonly tool?: ToolKind;
  readonly contract?: ContractKind;
}

export interface UpgradeDefinition {
  readonly label: string;
  readonly layer: UpgradeLayer;
  /** Tiers of one upgrade share a line: one per craft, and a higher tier replaces a lower one in place. */
  readonly line: string;
  readonly tier: ReachTier;
  /** Hulls it physically fits, and the slot it uses on each. */
  readonly fits: Partial<Record<HullId, SlotKind>>;
  readonly cost: Partial<Record<CostKind, number>>;
  /** Carried size of the intact module, CU. */
  readonly cu: number;
  /** Existing plan that unlocks the recipe; no new grant chain. */
  readonly plan: string;
  readonly effect: UpgradeEffect;
  readonly benefit: string;
  /** What you give up beyond the slot itself. */
  readonly tradeoff: string;
  /** A paid pressure refit: raises a hull rated `from` to `rating`. */
  readonly refit?: { readonly from: number; readonly rating: number };
  /** The existing registry recipe/item this entry describes. Its cost must match. */
  readonly registry?: string;
}

const SMALL = { dart: "socket", creel: "socket", hush: "socket", spindle: "socket", mantle: "socket" } as const;
const SUBMERSIBLE_BAY = { dart: "hull", creel: "hull", hush: "hull", mantle: "hull", hearthline: "hull" } as const;
const EVERY_BAY = { ...SUBMERSIBLE_BAY, spindle: "hull" } as const;
/** Small craft take power and handling gear in a socket; the carrier in a hull module bay. */
const SOCKET_OR_CARRIER_BAY = { ...SMALL, hearthline: "hull" } as const;

/** Slots per hull. Small craft keep the two equipment sockets (FLEET_AND_SURVIVAL);
 * bays and hardpoints follow S3's authored mounts (content/fleet/hulls.ts). */
export const HULL_SLOTS = {
  dart: { socket: 2, hull: 1, major: 0, tool: 0, system: 0, structure: 0 },
  creel: { socket: 2, hull: 2, major: 1, tool: 1, system: 0, structure: 0 },
  hush: { socket: 2, hull: 1, major: 0, tool: 0, system: 0, structure: 0 },
  spindle: { socket: 2, hull: 1, major: 1, tool: 1, system: 0, structure: 0 },
  mantle: { socket: 2, hull: 2, major: 1, tool: 0, system: 0, structure: 0 },
  // Four dorsal/keel hull-module mounts; two powered system sockets before the system bay.
  hearthline: { socket: 0, hull: 4, major: 0, tool: 0, system: 2, structure: 2 },
} as const satisfies Record<HullId, Record<Exclude<SlotKind, "refit">, number>>;

export const UPGRADES = {
  // ================================================================== common pool
  // ------------------------------------------------------------ plating
  plating_alloy: {
    label: "Alloy hull plating", layer: "common", line: "plating", tier: 1, fits: EVERY_BAY,
    // Alloy plates over a crust bonding layer.
    cost: { structural_alloy: 4, conductive_crust: 2 }, cu: 4, plan: "bp_island_workshop",
    effect: { damage: 0.75, speed: 0.96 },
    benefit: "Hull damage from collisions, bites and exposure −25%.",
    tradeoff: "The extra mass costs 4% speed in every mode.",
  },
  plating_ceramic: {
    label: "Ceramic pressure plating", layer: "common", line: "plating", tier: 2, fits: SUBMERSIBLE_BAY,
    // Ceramic tiles carry pressure; alloy frames and crust bonding as tier 1.
    cost: { structural_alloy: 6, conductive_crust: 2, pressure_ceramic: 3 }, cu: 5, plan: "bp_rift_pressure",
    effect: { damage: 0.6, ratingAdd: 50, speed: 0.93 },
    benefit: "Hull damage −40% and 50 m of pressure margin above the hull's rating.",
    tradeoff: "7% slower in every mode; removing it at depth is refused while the margin is in use.",
  },
  // ------------------------------------------------------------ heat and brine (S4's hull items)
  hull_heat_lining: {
    label: "Hull heat lining", layer: "common", line: "heat", tier: 2, fits: SUBMERSIBLE_BAY,
    cost: { pressure_ceramic: 3, structural_alloy: 1 }, cu: 4, plan: "bp_rift_pressure", registry: "hull_heat_lining",
    effect: { heat: 0.4 },
    benefit: "Heat tolerance +0.4: steady warm water stops loading the hull.",
    tradeoff: "Uses a hull bay that plating or an exchanger could take.",
  },
  hull_brine_seals: {
    label: "Hull brine seals", layer: "common", line: "brine", tier: 3, fits: SUBMERSIBLE_BAY,
    cost: { brine_lattice: 3, flex_membrane: 1 }, cu: 4, plan: "bp_deep_service", registry: "hull_brine_seals",
    effect: { brine: 0.8 },
    benefit: "Brine tolerance +0.8: deliberate dense-layer descents.",
    tradeoff: "Uses a hull bay.",
  },
  // ------------------------------------------------------------ power
  cell_bank_1: {
    label: "Extended cell bank", layer: "common", line: "cells", tier: 1, fits: SOCKET_OR_CARRIER_BAY,
    // Alloy cradle, a glass separator, crust plates.
    cost: { structural_alloy: 3, silica_glass: 1, conductive_crust: 2 }, cu: 3, plan: "bp_pod_checklist",
    effect: { capacity: 1.5 },
    benefit: "Battery capacity ×1.5.",
    tradeoff: "A socket and 3 CU of hold on small craft.",
  },
  cell_bank_2: {
    label: "Core cell bank", layer: "common", line: "cells", tier: 2, fits: SOCKET_OR_CARRIER_BAY,
    // As tier 1 with a thermal-core regulator.
    cost: { structural_alloy: 4, silica_glass: 2, conductive_crust: 3, thermal_core: 1 }, cu: 4, plan: "bp_rift_pressure",
    effect: { capacity: 2 },
    benefit: "Battery capacity ×2.",
    tradeoff: "A socket and 4 CU of hold on small craft.",
  },
  drive_tuning_1: {
    label: "Efficient drive controller", layer: "common", line: "efficiency", tier: 1, fits: SOCKET_OR_CARRIER_BAY,
    cost: { structural_alloy: 1, silica_glass: 1, flex_membrane: 1, conductive_crust: 2 }, cu: 2, plan: "bp_island_workshop",
    effect: { drain: 0.8, boostAdd: -1 },
    benefit: "Motive drain −20%.",
    tradeoff: "A governor takes 1 m/s off boost.",
  },
  drive_tuning_2: {
    label: "Core drive controller", layer: "common", line: "efficiency", tier: 2, fits: SOCKET_OR_CARRIER_BAY,
    cost: { structural_alloy: 2, silica_glass: 2, flex_membrane: 2, conductive_crust: 2, thermal_core: 2 }, cu: 2, plan: "bp_rift_pressure",
    effect: { drain: 0.65, boostAdd: -1 },
    benefit: "Motive drain −35%.",
    tradeoff: "A governor takes 1 m/s off boost.",
  },
  thermal_exchanger: {
    label: "Thermal exchanger", layer: "common", line: "thermal", tier: 2, fits: SUBMERSIBLE_BAY,
    // Core exchange plates in an alloy housing; crust charge control.
    cost: { structural_alloy: 2, thermal_core: 2, conductive_crust: 2 }, cu: 4, plan: "bp_rift_pressure",
    effect: { thermalCharge: true, heatLoad: 0.6 },
    benefit: "Charges in warm water near vents; heat load builds 40% slower, so you last longer in heat.",
    tradeoff: "Charging means sitting in water warm enough to load the hull; it raises no tolerance.",
  },
  // ------------------------------------------------------------ lights and quiet
  floodlights_1: {
    label: "Floodlights", layer: "common", line: "lights", tier: 1, fits: SOCKET_OR_CARRIER_BAY,
    cost: { silica_glass: 3, conductive_crust: 2 }, cu: 2, plan: "bp_island_workshop",
    effect: { lamp: 1.6, lampDrain: 0.01 },
    benefit: "Lamp output ×1.6.",
    tradeoff: "Draws power while lit, and light-sensitive wildlife notices you sooner.",
  },
  floodlights_2: {
    label: "Ceramic floodlights", layer: "common", line: "lights", tier: 2, fits: SOCKET_OR_CARRIER_BAY,
    // Ceramic housings take the heat of the brighter lamps.
    cost: { silica_glass: 4, conductive_crust: 2, structural_alloy: 1, pressure_ceramic: 1 }, cu: 2, plan: "bp_rift_pressure",
    effect: { lamp: 2.2, lampDrain: 0.015 },
    benefit: "Lamp output ×2.2.",
    tradeoff: "Draws more power while lit; light-sensitive wildlife notices you from further away.",
  },
  silent_running: {
    label: "Silent running", layer: "common", line: "silent", tier: 1, fits: SOCKET_OR_CARRIER_BAY,
    // Membrane mounts and resin damping around the drive; crust motor control.
    cost: { flex_membrane: 2, buoyant_resin: 2, conductive_crust: 2 }, cu: 2, plan: "bp_canopy_reinforcement",
    effect: { noise: 0.55, speed: 0.9, noBoost: true },
    benefit: "Loudness −45% in every mode.",
    tradeoff: "10% slower and no boost.",
  },
  // ------------------------------------------------------------ emergency gear
  flare_launcher: {
    label: "Flare launcher", layer: "common", line: "flare", tier: 1, fits: SMALL,
    cost: { structural_alloy: 1, silica_glass: 2, conductive_crust: 2, buoyant_resin: 1 }, cu: 2, plan: "bp_reef_recovery",
    effect: { tool: "flare" },
    benefit: "Fires a flare that lights the water ahead for 20 s; 4 per load, rearmed at any supported dock.",
    tradeoff: "A socket; a flare is a bright light source that wildlife reads.",
  },
  emergency_ballast: {
    label: "Emergency ballast", layer: "common", line: "ballast", tier: 1,
    fits: { dart: "hull", creel: "hull", hush: "hull", mantle: "hull" },
    // Alloy drop weights on a resin-trimmed release.
    cost: { structural_alloy: 3, buoyant_resin: 2, conductive_crust: 1 }, cu: 3, plan: "bp_reef_recovery",
    effect: { tool: "ballast" },
    benefit: "One mechanical ascent of up to 40 m, even with no power. Rearm at a supported dock.",
    tradeoff: "Uses a hull bay; the release is loud.",
  },
  // ------------------------------------------------------------ pressure refits
  // Existing registry refits, mirrored for previews and the economy check; their
  // cost must equal the composed RECIPES entry. Hush refits are new.
  dart_350: {
    label: "Dart hull refit · 350 m", layer: "common", line: "depth", tier: 2, fits: { dart: "refit" },
    cost: { tagged_frame: 1, conductive_crust: 3, buoyant_resin: 2, silica_glass: 1 }, cu: 0, plan: "bp_keel_survey",
    refit: { from: 180, rating: 350 }, registry: "dart_350", effect: {},
    benefit: "Hull rating 180 → 350 m.", tradeoff: "Permanent; the materials stay in the hull.",
  },
  creel_350: {
    label: "Creel hull refit · 350 m", layer: "common", line: "depth", tier: 2, fits: { creel: "refit" },
    cost: { tagged_frame: 2, conductive_crust: 4, buoyant_resin: 2, flex_membrane: 2 }, cu: 0, plan: "bp_rift_pressure",
    refit: { from: 240, rating: 350 }, registry: "creel_350", effect: {},
    benefit: "Hull rating 240 → 350 m.", tradeoff: "Permanent; the materials stay in the hull.",
  },
  creel_450: {
    label: "Creel hull refit · 450 m", layer: "common", line: "depth", tier: 2, fits: { creel: "refit" },
    cost: { pressure_ceramic: 6, thermal_core: 2, conductive_crust: 2, flex_membrane: 2 }, cu: 0, plan: "bp_rift_pressure",
    refit: { from: 350, rating: 450 }, registry: "creel_450", effect: {},
    benefit: "Hull rating 350 → 450 m.", tradeoff: "Permanent; the materials stay in the hull.",
  },
  creel_800: {
    label: "Creel hull refit · 800 m", layer: "common", line: "depth", tier: 3, fits: { creel: "refit" },
    cost: { pressure_ceramic: 8, brine_lattice: 5, thermal_core: 3, silica_glass: 2 }, cu: 0, plan: "bp_deep_service",
    refit: { from: 450, rating: 800 }, registry: "creel_800", effect: {},
    benefit: "Hull rating 450 → 800 m.", tradeoff: "Permanent; the materials stay in the hull.",
  },
  hush_350: {
    label: "Hush hull refit · 350 m", layer: "common", line: "depth", tier: 2, fits: { hush: "refit" },
    // A tagged frame member for the spar ring; crust and resin as the Dart's refit; glass for the blister.
    cost: { tagged_frame: 1, conductive_crust: 3, buoyant_resin: 3, silica_glass: 1 }, cu: 0, plan: "bp_hush_survey",
    refit: { from: 220, rating: 350 }, effect: {},
    benefit: "Hull rating 220 → 350 m.", tradeoff: "Permanent; the materials stay in the hull.",
  },
  hush_450: {
    label: "Hush hull refit · 450 m", layer: "common", line: "depth", tier: 2, fits: { hush: "refit" },
    // Ceramic pressure ring; more of the tier-1 crust, resin and seals.
    cost: { pressure_ceramic: 4, conductive_crust: 3, buoyant_resin: 3, flex_membrane: 2 }, cu: 0, plan: "bp_rift_pressure",
    refit: { from: 350, rating: 450 }, effect: {},
    benefit: "Hull rating 350 → 450 m.", tradeoff: "Permanent; the materials stay in the hull.",
  },

  // ================================================================== signatures
  // ------------------------------------------------------------ Dart: fast scout
  dart_acoustic_trim: {
    label: "Dart acoustic trim", layer: "signature", line: "dart_trim", tier: 1, fits: { dart: "socket" },
    cost: { conductive_crust: 2, buoyant_resin: 2 }, cu: 2, plan: "bp_canopy_reinforcement", registry: "dart_acoustic_trim",
    // Absolute M1 values: quiet 3 → 4.2 m/s, boost 11 → 9 m/s.
    effect: { quietAdd: 1.2, boostAdd: -2 },
    benefit: "Quiet travel 3 → 4.2 m/s.", tradeoff: "Boost 11 → 9 m/s.",
  },
  dart_overdrive: {
    label: "Dart overdrive", layer: "signature", line: "dart_overdrive", tier: 1, fits: { dart: "socket" },
    cost: { conductive_crust: 3, buoyant_resin: 2, structural_alloy: 2 }, cu: 2, plan: "bp_island_workshop",
    effect: { tool: "overdrive" },
    benefit: "A 4 s burst at 14 m/s to break contact or cross a gap.",
    tradeoff: "Maximum noise, a heat load on the hull, triple drain, and a 10 s cooldown.",
  },
  dart_wide_sonar: {
    label: "Wide-sweep sonar", layer: "signature", line: "dart_sonar", tier: 2, fits: { dart: "socket" },
    cost: { silica_glass: 2, conductive_crust: 3, structural_alloy: 1, pressure_ceramic: 1 }, cu: 2, plan: "bp_keel_survey",
    effect: { contract: "wide_sonar" },
    benefit: "A sweep shows cave mouths and passages out to 180 m.",
    tradeoff: "Each sweep is a loud ping and costs power.",
  },
  dart_range_tagger: {
    label: "Range tagger", layer: "signature", line: "dart_tagger", tier: 1, fits: { dart: "socket" },
    cost: { silica_glass: 2, conductive_crust: 2, flex_membrane: 1, structural_alloy: 1 }, cu: 1, plan: "bp_canopy_reinforcement",
    effect: { contract: "range_tagger" },
    benefit: "Marks a creature or site into the journal from up to 60 m.",
    tradeoff: "A socket; tagging needs a steady 1.5 s aim.",
  },
  // ------------------------------------------------------------ Creel: work sub
  creel_cargo_rack: {
    label: "Creel cargo rack", layer: "signature", line: "creel_rack", tier: 1, fits: { creel: "major" },
    cost: { structural_alloy: 4, buoyant_resin: 2 }, cu: 6, plan: "bp_creel_service", registry: "creel_cargo_rack",
    effect: { holdCu: 32 },
    benefit: "Hold 64 → 96 CU.", tradeoff: "The major mount: no cabin or service head.",
  },
  creel_cabin: {
    label: "Creel refuge cabin", layer: "signature", line: "creel_cabin", tier: 1, fits: { creel: "major" },
    cost: { structural_alloy: 3, silica_glass: 3, flex_membrane: 4, conductive_crust: 1, buoyant_resin: 1 }, cu: 8,
    plan: "bp_creel_service", registry: "creel_cabin",
    effect: { holdCu: -24 },
    benefit: "A dry, powered refuge: bunk, cooker and a 16 CU locker.", tradeoff: "Hold 64 → 40 CU; the major mount.",
  },
  creel_service_head: {
    label: "Creel service head", layer: "signature", line: "creel_service_head", tier: 2, fits: { creel: "major" },
    // Alloy arm frame, crust controls, glass inspection port, a core-powered welder.
    cost: { structural_alloy: 4, conductive_crust: 3, silica_glass: 1, thermal_core: 1 }, cu: 6, plan: "bp_creel_service",
    effect: { tool: "service_head" },
    benefit: "Patches another craft's hull in the field and lets it change socket modules within 8 m.",
    tradeoff: "The major mount: no rack or cabin; each patch costs the Creel 6% charge.",
  },
  creel_cutting_arm: {
    label: "Cutting arm", layer: "signature", line: "creel_cutting_arm", tier: 2, fits: { creel: "tool" },
    // Ceramic cutting edges on an alloy arm; crust controls.
    cost: { structural_alloy: 3, pressure_ceramic: 2, conductive_crust: 2 }, cu: 4, plan: "bp_creel_service",
    effect: { tool: "cutting_arm" },
    benefit: "Arm lifts take 4 s instead of 6, yield half again, and work mineral hosts too.",
    tradeoff: "The tool hardpoint: no grapple; each cut costs 2% more charge.",
  },
  creel_grapple: {
    label: "Anchor-and-reel grapple", layer: "signature", line: "creel_grapple", tier: 2, fits: { creel: "tool" },
    // Membrane braid line, alloy anchor, a core-powered winch, resin float.
    cost: { structural_alloy: 3, flex_membrane: 3, thermal_core: 1, buoyant_resin: 1 }, cu: 4, plan: "bp_creel_service",
    effect: { tool: "grapple" },
    benefit: "Fires a 30 m line to rock: hold station in a current, or reel the hull or a frame in.",
    tradeoff: "The tool hardpoint: no cutting arm. The line releases if anything crosses it.",
  },
  creel_drop_pod: {
    label: "Cargo drop pod", layer: "signature", line: "creel_pod", tier: 1, fits: { creel: "socket" },
    cost: { structural_alloy: 3, buoyant_resin: 3, flex_membrane: 2, conductive_crust: 1 }, cu: 4, plan: "bp_creel_service",
    effect: { tool: "drop_pod" },
    benefit: "Leaves a 16 CU pod at a work site and collects it again.",
    tradeoff: "A socket and 4 CU of hold while carried.",
  },
  // ------------------------------------------------------------ Hush: quiet glider
  hush_listening_array: {
    label: "Listening array", layer: "signature", line: "hush_listening", tier: 1, fits: { hush: "socket" },
    // Crust hydrophones in glass housings on a membrane baffle.
    cost: { conductive_crust: 3, silica_glass: 2, flex_membrane: 1, structural_alloy: 1 }, cu: 2, plan: "bp_hush_survey",
    effect: { contract: "listening_array" },
    benefit: "Gives bearings to creatures and sound-making sites out to 220 m.",
    tradeoff: "Works only while the Hush itself is quiet.",
  },
  hush_specimen_bay: {
    label: "Specimen bay", layer: "signature", line: "hush_specimen", tier: 1, fits: { hush: "socket" },
    cost: { silica_glass: 2, flex_membrane: 3, buoyant_resin: 1, conductive_crust: 1 }, cu: 3, plan: "bp_hush_survey",
    effect: { tool: "specimen_bay" },
    benefit: "Takes seeds, spores and living samples without disturbing their hosts; holds 4.",
    tradeoff: "A socket and 3 CU of hold.",
  },
  hush_extended_glide: {
    label: "Extended glide", layer: "signature", line: "hush_glide", tier: 2, fits: { hush: "hull" },
    // Resin wing trim, membrane control skins, a core-trimmed buoyancy cell.
    cost: { buoyant_resin: 4, flex_membrane: 2, thermal_core: 1 }, cu: 3, plan: "bp_hush_survey",
    effect: { quietAdd: 1, drain: 0.75 },
    benefit: "Quiet glide 4 → 5 m/s and 25% less drain.",
    tradeoff: "The Hush's only hull bay: no plating, lining or ballast.",
  },
  // ------------------------------------------------------------ Spindle: surface tender
  spindle_solar_array: {
    label: "Expanded solar array", layer: "signature", line: "spindle_solar", tier: 1, fits: { spindle: "hull" },
    cost: { silica_glass: 4, conductive_crust: 2, structural_alloy: 1 }, cu: 4, plan: "bp_spindle_tender",
    effect: { solar: 2, holdCu: -8 },
    benefit: "Doubles solar charging at the surface.",
    tradeoff: "The hull bay, and 8 CU of deck space.",
  },
  spindle_shore_ramp: {
    label: "Shore ramp", layer: "signature", line: "spindle_ramp", tier: 1, fits: { spindle: "tool" },
    cost: { structural_alloy: 3, buoyant_resin: 2, conductive_crust: 1 }, cu: 3, plan: "bp_spindle_tender",
    effect: { tool: "shore_ramp" },
    benefit: "Lands on any beach up to 18° instead of authored shores only.",
    tradeoff: "The bow hardpoint.",
  },
  spindle_deck_crane: {
    label: "Deck crane", layer: "signature", line: "spindle_crane", tier: 1, fits: { spindle: "major" },
    cost: { structural_alloy: 4, conductive_crust: 2, flex_membrane: 1, buoyant_resin: 1 }, cu: 5, plan: "bp_spindle_tender",
    effect: { tool: "deck_crane", holdCu: -24 },
    benefit: "Lifts up to 10 CU from water within 12 m of the surface, including tagged frames.",
    tradeoff: "Takes 24 CU of deck; each lift costs 3% charge.",
  },
  spindle_radio_mast: {
    label: "Radio mast", layer: "signature", line: "spindle_mast", tier: 2, fits: { spindle: "socket" },
    // One tagged frame member for the mast; crust and glass for the antenna.
    cost: { tagged_frame: 1, conductive_crust: 2, silica_glass: 1, structural_alloy: 1 }, cu: 3, plan: "bp_spindle_tender",
    effect: { contract: "radio_mast" },
    benefit: "While surfaced: relay range ×1.5, and survey stations within 100 m reach one tier further (150 → 300 → 500 → 800 m).",
    tradeoff: "A socket and 3 CU of hold.",
  },
  // ------------------------------------------------------------ Mantle: deep service craft
  mantle_thermal_shroud: {
    label: "Thermal shroud", layer: "signature", line: "mantle_shroud", tier: 3, fits: { mantle: "socket" },
    // Ceramic shell, core cooling loop, lattice seals.
    cost: { pressure_ceramic: 4, thermal_core: 3, brine_lattice: 2, flex_membrane: 2 }, cu: 3, plan: "bp_deep_service",
    effect: { ambientHeatImmune: true, drain: 1.1 },
    benefit: "Immune to ambient heat. Plume cores and active bursts still load the hull.",
    tradeoff: "A socket; coolant pumps add 10% drain.",
  },
  mantle_salvage_clamp: {
    label: "Heavy salvage clamp", layer: "signature", line: "mantle_jaw", tier: 3, fits: { mantle: "major" },
    cost: { structural_alloy: 5, pressure_ceramic: 3, brine_lattice: 1 }, cu: 6, plan: "bp_deep_service",
    effect: { tool: "salvage_clamp" },
    benefit: "Lifts two tagged frames or one 20 CU wreck part per grip, and holds a disabled hull for tow.",
    tradeoff: "The jaw mount; each grip costs 4% charge.",
  },
  mantle_hull_air_line: {
    label: "Hull air line", layer: "signature", line: "mantle_air", tier: 3, fits: { mantle: "socket" },
    cost: { flex_membrane: 4, silica_glass: 2, brine_lattice: 2, conductive_crust: 1 }, cu: 2, plan: "bp_deep_service",
    effect: { airLine: "hull" },
    benefit: "Unlimited air out to 60 m, even while the Mantle holds station.",
    tradeoff: "A socket; feeding air costs the Mantle power.",
  },
  mantle_drone_bay: {
    label: "Scout drone bay", layer: "signature", line: "mantle_drone", tier: 3, fits: { mantle: "socket" },
    cost: { structural_alloy: 4, silica_glass: 2, conductive_crust: 2, brine_lattice: 2, thermal_core: 1 }, cu: 3,
    plan: "bp_deep_service",
    effect: { contract: "scout_drone" },
    benefit: "Launches the scout drone: maps caves, scans at range, reaches tight spaces.",
    tradeoff: "A socket that the shroud or air line could use.",
  },
  // ------------------------------------------------------------ Hearthline: carrier
  hearthline_berth_extension: {
    label: "Berth extension", layer: "signature", line: "hearthline_berths", tier: 3, fits: { hearthline: "structure" },
    // Alloy and a frame member for the extra bulkhead; lattice and membrane lock seals.
    cost: { structural_alloy: 8, tagged_frame: 1, brine_lattice: 2, flex_membrane: 4 }, cu: 0, plan: "bp_carrier_workshop",
    effect: { mixedBerths: true },
    benefit: "Carries one medium and one compact craft at once.",
    tradeoff: "Removal needs empty berths at a supported dock.",
  },
  hearthline_system_bay: {
    label: "System bay", layer: "signature", line: "hearthline_systems", tier: 2, fits: { hearthline: "structure" },
    cost: { structural_alloy: 5, conductive_crust: 3, silica_glass: 2, tagged_frame: 1 }, cu: 0, plan: "bp_carrier_workshop",
    effect: { systemSockets: 2 },
    benefit: "Powered system sockets 2 → 4: planters, decoder, survey station, fabricator, storage or a charging dock.",
    tradeoff: "Each occupant draws carrier power.",
  },
  hearthline_mooring_anchor: {
    label: "Mooring anchor", layer: "signature", line: "hearthline_anchor", tier: 2, fits: { hearthline: "hull" },
    cost: { structural_alloy: 9, buoyant_resin: 2, conductive_crust: 1 }, cu: 0, plan: "bp_carrier_workshop",
    effect: { tool: "mooring_anchor" },
    benefit: "Holds station in currents up to 1.5 m/s while anchored.",
    tradeoff: "A hull module bay; anchoring needs the floor within 80 m.",
  },
  hearthline_550: {
    label: "Hearthline hull refit · 550 m", layer: "signature", line: "depth", tier: 3, fits: { hearthline: "refit" },
    cost: { pressure_ceramic: 10, brine_lattice: 6 }, cu: 0, plan: "bp_rift_pressure", registry: "hearthline_550",
    refit: { from: 400, rating: 550 }, effect: {},
    benefit: "Hull rating 400 → 550 m: the district staging shelf.", tradeoff: "Permanent; the materials stay in the hull.",
  },
} as const satisfies Record<string, UpgradeDefinition>;
export type UpgradeId = keyof typeof UPGRADES;
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
export const upgradeId = (id: unknown): id is UpgradeId => typeof id === "string" && Object.hasOwn(UPGRADES, id);
export const upgrade = (id: UpgradeId): UpgradeDefinition => UPGRADES[id];

/** Reach ladder: what a player can work when buying at each tier. The limit is
 * the deepest working depth that tier's suit and refits allow. */
export const REACH_TIERS = [
  { tier: 0, limit: 60, label: "unsuited swim" },
  { tier: 1, limit: 150, label: "150 m suit and a first craft" },
  { tier: 2, limit: 350, label: "350 m suit and refits" },
  { tier: 3, limit: 450, label: "450 m suit and refits" },
] as const;
export const reachLimit = (tier: 0 | ReachTier): number => REACH_TIERS[tier].limit;

/** Supported docks, and the slots each may change. The home pod and stops keep
 * today's mount rules; outposts and the Creel's service head take sockets only. */
export type DockKind = "home_pod" | "workshop" | "yard" | "service_stop" | "carrier_berth" | "carrier_mooring" | "outpost" | "service_head";
export const DOCK_SLOTS: Readonly<Record<DockKind, readonly SlotKind[]>> = {
  home_pod: ["socket", "major", "tool"],
  workshop: ["socket", "hull", "major", "tool"],
  yard: ["socket", "hull", "major", "tool", "system", "structure"],
  service_stop: ["socket", "hull", "major", "tool"],
  /** A craft berthed in the carrier's dry berth. */
  carrier_berth: ["socket", "hull", "major", "tool"],
  /** The carrier itself, station keeping at a supported mooring. */
  carrier_mooring: ["hull", "system", "structure"],
  outpost: ["socket"],
  service_head: ["socket"],
};
export const DOCK_LABELS: Readonly<Record<DockKind, string>> = {
  home_pod: "the pod", workshop: "the workshop", yard: "the yard berth", service_stop: "a restored service stop",
  carrier_berth: "a carrier berth", carrier_mooring: "a supported carrier mooring", outpost: "a field outpost",
  service_head: "a Creel service head",
};
