/** Pure rules for the actions upgrades grant, and the contracts of the complex
 * ones (sonar, tagger, listening array, scout drone, radio mast) whose full
 * behaviour is wired later. Times are simulation ticks (60 per second) so a
 * saved runtime resumes exactly. Nothing here reads or writes GameState. */
import type { CostKind } from "../../content/registry.js";
import type { Vec3, WorldQueries } from "../types.js";
import { ARM_CHARGE, ARM_LIFT_SECONDS } from "../fleet.js";
import type { CraftProfile, Motion } from "./effects.js";

export const TICKS_PER_SECOND = 60;
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const has = (p: CraftProfile, tool: CraftProfile["tools"][number]): boolean => p.tools.includes(tool);

/** Per-vehicle upgrade runtime: the proposed saved `VehicleState.upgrades` state. */
export interface UpgradeRuntime {
  /** Flares left in the launcher. */
  flares: number;
  ballastArmed: boolean;
  /** Ballast ascent in progress: metres of rise left. */
  ascent: number | null;
  overdrive: { activeUntil: number; readyAt: number };
  grapple: GrappleLine | null;
  /** The cargo pod while it is dropped; its 16 CU container keeps its contents. */
  pod: { position: Vec3 } | null;
  anchored: boolean;
}
export const initialRuntime = (): UpgradeRuntime => ({
  flares: FLARE.magazine, ballastArmed: true, ascent: null,
  overdrive: { activeUntil: 0, readyAt: 0 }, grapple: null, pod: null, anchored: false,
});
/** Any supported dock refills flares and rearms the ballast; no material is spent. */
export function rearm(rt: UpgradeRuntime, p: CraftProfile, docked: boolean): { runtime: UpgradeRuntime; refusal: string | null } {
  if (!docked) return { runtime: rt, refusal: "Rearm flares and ballast at a supported dock." };
  if (!has(p, "flare") && !has(p, "ballast")) return { runtime: rt, refusal: "No flare launcher or ballast is fitted." };
  return { runtime: { ...rt, flares: has(p, "flare") ? FLARE.magazine : rt.flares, ballastArmed: has(p, "ballast") || rt.ballastArmed }, refusal: null };
}

// ---------------------------------------------------------------- Dart overdrive
export const OVERDRIVE = { speed: 14, seconds: 4, cooldown: 10, loudness: 1, selfHeat: 0.35, drain: 3, minCharge: 5 } as const;
export function overdriveRefusal(p: CraftProfile, rt: UpgradeRuntime, tick: number, charge: number): string | null {
  if (!has(p, "overdrive")) return "No overdrive is fitted.";
  if (tick < rt.overdrive.activeUntil) return "Overdrive is already running.";
  if (tick < rt.overdrive.readyAt) return `Overdrive is cooling: ${Math.ceil((rt.overdrive.readyAt - tick) / TICKS_PER_SECOND)} s.`;
  if (charge < OVERDRIVE.minCharge) return `Overdrive needs ${OVERDRIVE.minCharge}% charge.`;
  return null;
}
export function startOverdrive(rt: UpgradeRuntime, tick: number): UpgradeRuntime {
  const until = tick + OVERDRIVE.seconds * TICKS_PER_SECOND;
  return { ...rt, overdrive: { activeUntil: until, readyAt: until + OVERDRIVE.cooldown * TICKS_PER_SECOND } };
}
export const overdriveActive = (rt: UpgradeRuntime, tick: number): boolean => tick < rt.overdrive.activeUntil;
/** Motion while the burst runs: top speed and noise, triple cruise drain, and a
 * self-heat that feeds `heatExposure(…, selfHeat)`. */
export function overdriveMotion(p: CraftProfile, rt: UpgradeRuntime, tick: number, base: Motion): Motion & { selfHeat: number } {
  if (!overdriveActive(rt, tick)) return { ...base, selfHeat: 0 };
  return { speed: OVERDRIVE.speed, loudness: OVERDRIVE.loudness, drain: (p.drain * OVERDRIVE.drain) / p.capacity, selfHeat: OVERDRIVE.selfHeat };
}

// ---------------------------------------------------------------- flares
export const FLARE = { magazine: 4, range: 14, seconds: 20, fadeSeconds: 3, intensity: 1.2, sinkRate: 0.15 } as const;
/** A burning flare: a timed light source that ecology reads like a lamp. */
export interface FlareState { readonly position: Vec3; readonly litAt: number; readonly until: number }
const PROBE = { radius: 0.08, height: 0.16 } as const;
/** Fire one flare along `direction`; it stops at the first rock within range. */
export function fireFlare(p: CraftProfile, rt: UpgradeRuntime, origin: Vec3, direction: Vec3, tick: number,
  world: Pick<WorldQueries, "moveCapsule">): { runtime: UpgradeRuntime; flare: FlareState } | { refusal: string } {
  if (!has(p, "flare")) return { refusal: "No flare launcher is fitted." };
  if (rt.flares <= 0) return { refusal: "The flare launcher is empty. Rearm at a supported dock." };
  const n = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const delta = { x: (direction.x / n) * FLARE.range, y: (direction.y / n) * FLARE.range, z: (direction.z / n) * FLARE.range };
  const moved = world.moveCapsule(origin, delta, PROBE);
  return { runtime: { ...rt, flares: rt.flares - 1 },
    flare: { position: moved.position, litAt: tick, until: tick + FLARE.seconds * TICKS_PER_SECOND } };
}
/** Light output at a tick: full while burning, fading over the last seconds, then out. */
export function flareLight(f: FlareState, tick: number): number {
  if (tick < f.litAt || tick >= f.until) return 0;
  const left = (f.until - tick) / TICKS_PER_SECOND;
  return FLARE.intensity * Math.min(1, left / FLARE.fadeSeconds);
}
/** The flare sinks slowly while it burns, never below `floorY`. */
export function flarePosition(f: FlareState, tick: number, floorY = -Infinity): Vec3 {
  const t = Math.max(0, Math.min(tick, f.until) - f.litAt) / TICKS_PER_SECOND;
  return { ...f.position, y: Math.max(floorY, f.position.y - FLARE.sinkRate * t) };
}

// ---------------------------------------------------------------- emergency ballast
/** One mechanical ascent that needs no power: rise up to `budget` metres at `rise` m/s. */
export const BALLAST = { rise: 4, budget: 40, loudness: 0.9 } as const;
export function ballastRefusal(p: CraftProfile, rt: UpgradeRuntime, depth: number): string | null {
  if (!has(p, "ballast")) return "No emergency ballast is fitted.";
  if (rt.ascent !== null) return "The ballast is already released.";
  if (!rt.ballastArmed) return "The ballast is spent. Rearm it at a supported dock.";
  if (depth <= 0.5) return "Already at the surface.";
  return null;
}
export const blowBallast = (rt: UpgradeRuntime): UpgradeRuntime => ({ ...rt, ballastArmed: false, ascent: BALLAST.budget });
/** Rise this step; the ascent ends at the surface or when its budget is spent.
 * Composition applies it as an upward move through the ordinary hull sweep. */
export function ballastStep(rt: UpgradeRuntime, depth: number, dt: number): { runtime: UpgradeRuntime; rise: number } {
  if (rt.ascent === null) return { runtime: rt, rise: 0 };
  const rise = Math.max(0, Math.min(BALLAST.rise * dt, rt.ascent, depth));
  const left = rt.ascent - rise;
  return { runtime: { ...rt, ascent: left <= 1e-9 || depth - rise <= 1e-9 ? null : left }, rise };
}

// ---------------------------------------------------------------- tool arms and cutting arm
/** What a host is, for powered handling: living sources always stay hand work. */
export type HostKind = "salvage" | "frame" | "mineral" | "living";
export function hostKind(item: CostKind | "meal"): HostKind {
  if (item === "tagged_frame") return "frame";
  if (item === "structural_alloy") return "salvage";
  if (item === "flex_membrane" || item === "buoyant_resin" || item === "meal") return "living";
  return "mineral";
}
export const CUTTING_ARM = { seconds: 4, yield: 1.5, extraCharge: 2 } as const;
export interface ArmWork { refusal: string | null; seconds: number; charge: number; bundle: number }
/** The Creel's arms on a host: bulk salvage and frames by default; the cutting arm
 * adds mineral hosts, cuts faster and yields half again (a frame stays one frame). */
export function armWork(p: CraftProfile, item: CostKind | "meal", bundle: number): ArmWork {
  const kind = hostKind(item), cutting = has(p, "cutting_arm");
  const out = (refusal: string | null, seconds = ARM_LIFT_SECONDS, charge = ARM_CHARGE, n = bundle): ArmWork =>
    ({ refusal, seconds, charge, bundle: n });
  if (p.hull !== "creel") return out("Only a Creel's tool arms work hosts.");
  if (kind === "living") return out("Living sources stay hand work; the arms would tear the colony.");
  if (kind === "mineral" && !cutting) return out("Mineral hosts need the cutting arm. Gather by hand, or fit one.");
  if (!cutting) return out(null);
  return out(null, CUTTING_ARM.seconds, ARM_CHARGE + CUTTING_ARM.extraCharge, kind === "frame" ? 1 : Math.ceil(bundle * CUTTING_ARM.yield));
}

// ---------------------------------------------------------------- Creel grapple
/** A straight line from the hull to a rock anchor; no rope physics. */
export interface GrappleLine { readonly anchor: Vec3; readonly length: number }
export const GRAPPLE = { range: 30, reel: 2.5, minLength: 2 } as const;
export function fireGrapple(p: CraftProfile, origin: Vec3, direction: Vec3, world: Pick<WorldQueries, "moveCapsule">):
  { line: GrappleLine } | { refusal: string } {
  if (!has(p, "grapple")) return { refusal: "No grapple is fitted." };
  const n = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const moved = world.moveCapsule(origin, { x: (direction.x / n) * GRAPPLE.range, y: (direction.y / n) * GRAPPLE.range,
    z: (direction.z / n) * GRAPPLE.range }, PROBE);
  if (!moved.hitSolid) return { refusal: `No rock within ${GRAPPLE.range} m along that line.` };
  return { line: { anchor: moved.position, length: Math.max(GRAPPLE.minLength, dist(origin, moved.position)) } };
}
export interface GrappleStep { line: GrappleLine | null; position: Vec3; released: string | null }
/** One step of a held line. Reeling shortens it; a hull past the line's length is
 * pulled back onto it. If rock or a hull crosses the straight line it releases. */
export function grappleStep(line: GrappleLine, hull: Vec3, reel: boolean, dt: number,
  world: Pick<WorldQueries, "lineOfSight">, ignore: readonly string[] = []): GrappleStep {
  if (!world.lineOfSight(hull, line.anchor, ignore))
    return { line: null, position: hull, released: "Something crossed the line; the grapple released." };
  const length = reel ? Math.max(GRAPPLE.minLength, line.length - GRAPPLE.reel * dt) : line.length;
  const d = dist(hull, line.anchor);
  const position = d <= length ? hull : {
    x: line.anchor.x + ((hull.x - line.anchor.x) * length) / d,
    y: line.anchor.y + ((hull.y - line.anchor.y) * length) / d,
    z: line.anchor.z + ((hull.z - line.anchor.z) * length) / d,
  };
  return { line: { anchor: line.anchor, length }, position, released: null };
}

// ---------------------------------------------------------------- Spindle deck crane and shore ramp
export const DECK_CRANE = { reach: 8, depth: 12, maxCu: 10, seconds: 5, charge: 3 } as const;
export function craneLiftRefusal(p: CraftProfile, crane: { position: Vec3; charge: number; holdFreeCu: number },
  target: { position: Vec3; cu: number }): string | null {
  if (!has(p, "deck_crane")) return "No deck crane is fitted.";
  if (-target.position.y > DECK_CRANE.depth) return `The crane reaches ${DECK_CRANE.depth} m below the surface; this lies at ${Math.round(-target.position.y)} m.`;
  if (Math.hypot(target.position.x - crane.position.x, target.position.z - crane.position.z) > DECK_CRANE.reach)
    return `Bring the Spindle within ${DECK_CRANE.reach} m of the load.`;
  if (target.cu > DECK_CRANE.maxCu) return `The crane lifts up to ${DECK_CRANE.maxCu} CU at once.`;
  if (crane.charge < DECK_CRANE.charge) return `The crane needs ${DECK_CRANE.charge}% charge.`;
  if (target.cu > crane.holdFreeCu) return `The deck needs ${target.cu} CU free.`;
  return null;
}
export const SHORE_RAMP = { maxSlopeDeg: 18 } as const;
/** Authored landings always work; the ramp adds any beach up to its slope. */
export const landable = (p: CraftProfile, beach: { authored: boolean; slopeDeg: number }): boolean =>
  p.hull === "spindle" && (beach.authored || (has(p, "shore_ramp") && beach.slopeDeg <= SHORE_RAMP.maxSlopeDeg));

// ---------------------------------------------------------------- Creel service head and cargo pod
export const SERVICE_HEAD = { reach: 8, patch: 30, charge: 6 } as const;
/** Field patch on another craft. A disabled hull still needs the rescue collar. */
export function patchRefusal(p: CraftProfile, creel: { position: Vec3; charge: number },
  other: { position: Vec3; health: number; disabled: boolean; same: boolean }): string | null {
  if (!has(p, "service_head")) return "No service head is fitted.";
  if (other.same) return "The service head works on other craft.";
  if (dist(creel.position, other.position) > SERVICE_HEAD.reach) return `Hold within ${SERVICE_HEAD.reach} m of the other hull.`;
  if (other.disabled) return "A disabled hull needs the rescue collar first.";
  if (other.health >= 100) return "That hull is undamaged.";
  if (creel.charge < SERVICE_HEAD.charge) return `A patch needs ${SERVICE_HEAD.charge}% Creel charge.`;
  return null;
}
/** The service head is a socket-change dock for another craft within reach. */
export const serviceHeadDock = (p: CraftProfile, creel: Vec3, other: Vec3, same: boolean): boolean =>
  has(p, "service_head") && !same && dist(creel, other) <= SERVICE_HEAD.reach;
export const DROP_POD = { cu: 16, pickup: 8 } as const;
export function dropPodRefusal(p: CraftProfile, rt: UpgradeRuntime): string | null {
  if (!has(p, "drop_pod")) return "No cargo pod is fitted.";
  return rt.pod ? "The pod is already out. Collect it first." : null;
}
export function collectPodRefusal(p: CraftProfile, rt: UpgradeRuntime, at: Vec3): string | null {
  if (!has(p, "drop_pod")) return "No pod socket is fitted.";
  if (!rt.pod) return "The pod is aboard.";
  return dist(at, rt.pod.position) > DROP_POD.pickup ? `Hold within ${DROP_POD.pickup} m of the pod.` : null;
}

// ---------------------------------------------------------------- Mantle clamp, Hearthline anchor, Hush bay
export const SALVAGE_CLAMP = { frames: 2, partCu: 20, seconds: 6, charge: 4 } as const;
/** Frames per grip: two with the clamp, one with an ordinary jaw. */
export const clampFrames = (p: CraftProfile, stock: number): number =>
  Math.min(stock, has(p, "salvage_clamp") ? SALVAGE_CLAMP.frames : 1);
export const MOORING_ANCHOR = { floorWithin: 80, holds: 1.5, stoppedBelow: 0.6 } as const;
export function anchorRefusal(p: CraftProfile, floorBelow: number, speed: number): string | null {
  if (!has(p, "mooring_anchor")) return "No mooring anchor is fitted.";
  if (speed >= MOORING_ANCHOR.stoppedBelow) return "Stop before dropping the anchor.";
  return floorBelow > MOORING_ANCHOR.floorWithin ? `The anchor reaches ${MOORING_ANCHOR.floorWithin} m; the floor is ${Math.round(floorBelow)} m below.` : null;
}
/** Drift left after the anchor: none up to its hold, the excess above it. */
export function anchoredDrift(flow: Vec3, anchored: boolean): Vec3 {
  const speed = Math.hypot(flow.x, flow.y, flow.z);
  if (!anchored || speed === 0) return flow;
  const k = Math.max(0, speed - MOORING_ANCHOR.holds) / speed;
  return { x: flow.x * k, y: flow.y * k, z: flow.z * k };
}
export const SPECIMEN_BAY = { slots: 4, disturbance: 0 } as const;
/** Gentle sampling of living sources; SYS-2's cultivation consumes the samples. */
export function sampleRefusal(p: CraftProfile, held: number, living: boolean): string | null {
  if (!has(p, "specimen_bay")) return "No specimen bay is fitted.";
  if (!living) return "The specimen bay takes seeds, spores and living samples only.";
  return held >= SPECIMEN_BAY.slots ? `The bay holds ${SPECIMEN_BAY.slots} specimens. Unload at a base.` : null;
}

// ---------------------------------------------------------------- contracts (wired later)
const hasContract = (p: CraftProfile, c: CraftProfile["contracts"][number]): boolean => p.contracts.includes(c);
export interface SensedFeature { readonly id: string; readonly kind: string; readonly position: Vec3 }

/** Dart wide-sweep sonar. Contract: a sweep returns authored cave mouths and
 * passages within range, nearest first; it is a loud ping and costs charge.
 * Later: occlusion, a chart overlay and a sweep animation. */
export const WIDE_SONAR = { range: 180, cooldown: 8, charge: 2, loudness: 0.8, reveals: ["cave_mouth", "passage"] } as const;
export function sonarSweep(p: CraftProfile, origin: Vec3, features: readonly SensedFeature[]): SensedFeature[] {
  if (!hasContract(p, "wide_sonar")) return [];
  return features.filter((f) => (WIDE_SONAR.reveals as readonly string[]).includes(f.kind) && dist(origin, f.position) <= WIDE_SONAR.range)
    .sort((a, b) => dist(origin, a.position) - dist(origin, b.position) || a.id.localeCompare(b.id));
}
/** Dart range tagger. Contract: the nearest creature or site inside a narrow cone
 * and range; held steady for `aimSeconds`, it writes a journal mark (SYS-2). */
export const RANGE_TAGGER = { range: 60, coneDeg: 6, aimSeconds: 1.5 } as const;
export function tagCandidate(p: CraftProfile, origin: Vec3, aim: Vec3, candidates: readonly SensedFeature[]): SensedFeature | null {
  if (!hasContract(p, "range_tagger")) return null;
  const n = Math.hypot(aim.x, aim.y, aim.z) || 1, cos = Math.cos((RANGE_TAGGER.coneDeg * Math.PI) / 180);
  return candidates.map((c) => ({ c, d: dist(origin, c.position) }))
    .filter(({ c, d }) => d > 0 && d <= RANGE_TAGGER.range &&
      ((c.position.x - origin.x) * aim.x + (c.position.y - origin.y) * aim.y + (c.position.z - origin.z) * aim.z) / (d * n) >= cos)
    .sort((a, b) => a.d - b.d || a.c.id.localeCompare(b.c.id))[0]?.c ?? null;
}
/** Hush listening array. Contract: while the Hush is quiet, bearings (yaw, rad,
 * 0 = −Z, quantised) to sources loud enough to carry; a louder source carries further. */
export const LISTENING_ARRAY = { range: 220, quietBelow: 0.2, bearingStepDeg: 15 } as const;
export function listen(p: CraftProfile, origin: Vec3, ownLoudness: number,
  sources: readonly (SensedFeature & { loudness: number })[]): { id: string; bearing: number }[] {
  if (!hasContract(p, "listening_array") || ownLoudness > LISTENING_ARRAY.quietBelow) return [];
  const step = (LISTENING_ARRAY.bearingStepDeg * Math.PI) / 180;
  return sources.filter((s) => dist(origin, s.position) <= LISTENING_ARRAY.range * Math.max(0, Math.min(1, s.loudness)))
    .map((s) => ({ id: s.id, bearing: Math.round(Math.atan2(s.position.x - origin.x, -(s.position.z - origin.z)) / step) * step }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
/** Mantle scout drone, the tethered service tool's upgrade. Contract: launched from
 * a stopped, unberthed Mantle; small enough for diver-only passages; maps and scans
 * within its tether and battery, and is recalled when either runs out. */
export const SCOUT_DRONE = { tether: 60, speed: 2.5, radius: 0.35, height: 0.4, batterySeconds: 120, scanRange: 12 } as const;
export function droneLaunchRefusal(p: CraftProfile, mantle: { speed: number; berthed: boolean; charge: number }): string | null {
  if (!hasContract(p, "scout_drone")) return "No drone bay is fitted.";
  if (mantle.berthed) return "Launch the drone from open water.";
  if (mantle.speed >= 0.6) return "Hold station before launching the drone.";
  return mantle.charge < 5 ? "The drone bay needs 5% charge to launch." : null;
}
export const droneRecall = (drone: Vec3, mantle: Vec3, secondsOut: number): boolean =>
  dist(drone, mantle) > SCOUT_DRONE.tether || secondsOut >= SCOUT_DRONE.batterySeconds;
/** Spindle radio mast. Contract: SYS-2's relay and survey ranges ×1.5 while surfaced. */
export const RADIO_MAST = { factor: 1.5 } as const;
export const mastRangeFactor = (p: CraftProfile, surfaced: boolean): number =>
  hasContract(p, "radio_mast") && surfaced ? RADIO_MAST.factor : 1;
