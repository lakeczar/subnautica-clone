/** The one place a current moves an actor: drive + drift in a single sweep
 * through the world's own movement (`moveCapsule` slices for the diver,
 * `moveHull` for hulls), plus the contact rules a current needs. The
 * sandbox runs these exact functions; step.ts should call them (CY handoff).
 *
 * - Support: `moveHull` rejects a whole horizontal slice whose result dips
 *   into the 5 cm floor margin (its cliff/terrain protection). A downward
 *   current would therefore pin a hull resting on the floor. `supportedDrift`
 *   lets drift descend only as far as the margin under the hull's current
 *   footprint; the drive's own descent, and every terrain rule, are unchanged.
 * - Impact: only the drive closing into the face it hit counts. Travel the
 *   sweep refused is the face's direction; current-only contact and sliding
 *   along a face are never impacts, a drive into rock still is.
 * - Damping: only the drive into the face is damped, so a hull pressed onto
 *   rock by a current keeps its slide. */
import type { Capsule, Vec3, WorldQueries } from "../types.js";
import { hullFloor, moveHull } from "../world.js";
import type { HorizontalBounds } from "../world.js";

/** world.ts moveHull keeps a hull this far above its floor. */
export const SUPPORT_MARGIN = 0.05;
/** step.ts: hulls take (closing − 4) × 10 health per second of contact above 4 m/s. */
export const IMPACT = { above: 4, rate: 10 } as const;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export interface CurrentMove {
  readonly position: Vec3;
  readonly hitSolid: boolean;
  readonly hitBoundary: boolean;
  /** The delta asked of the sweep (drive + drift, after support and surface). */
  readonly requested: Vec3;
  /** Unit direction of the travel the sweep refused, null when none. */
  readonly refused: Vec3 | null;
  /** Drive speed into that face, m/s; 0 when the current alone made contact. */
  readonly closing: number;
}

/** Drift delta a hull may take this step without entering its floor margin. */
export function supportedDrift(world: WorldQueries, origin: Vec3, driveDelta: Vec3, driftDelta: Vec3, shape: Capsule): Vec3 {
  if (!(driftDelta.y < 0)) return driftDelta;
  const limit = hullFloor(world, origin, shape) + SUPPORT_MARGIN + 1e-6;
  const room = Math.max(0, origin.y + Math.min(0, driveDelta.y) - limit);
  return { ...driftDelta, y: Math.max(driftDelta.y, -room) };
}

function contact(requested: Vec3, achieved: Vec3, drive: Vec3, hitSolid: boolean): { refused: Vec3 | null; closing: number } {
  const lost = sub(requested, achieved), n = len(lost);
  if (!hitSolid || !(n > 1e-9)) return { refused: null, closing: 0 };
  const refused = scale(lost, 1 / n);
  return { refused, closing: Math.max(0, dot(drive, refused)) };
}

/** Impact loss for one step (step.ts's rule on the closing drive only). */
export const impactLoss = (closing: number, dt: number): number => Math.max(0, closing - IMPACT.above) * dt * IMPACT.rate;

/** Halve the drive into the face, keep the rest. */
export function dampIntoFace(drive: Vec3, refused: Vec3 | null): Vec3 {
  if (!refused) return drive;
  const into = dot(drive, refused);
  return into > 0 ? sub(drive, scale(refused, into * 0.5)) : drive;
}

/** The diver: one request swept in 0.12 m `moveCapsule` slices (step.ts's
 * slice length), held under the surface. */
export function moveDiverWithCurrent(world: WorldQueries, origin: Vec3, drive: Vec3, drift: Vec3, shape: Capsule, dt: number, surfaceY = -0.5): CurrentMove {
  const requested = scale(add(drive, drift), dt);
  if (origin.y + requested.y > surfaceY) requested.y = Math.min(requested.y, Math.max(0, surfaceY - origin.y));
  const slices = Math.max(1, Math.ceil(len(requested) / 0.12));
  let position = { ...origin }, hitSolid = false, hitBoundary = false;
  for (let i = 0; i < slices; i++) {
    const moved = world.moveCapsule(position, scale(requested, 1 / slices), shape);
    position = moved.position; hitSolid ||= moved.hitSolid; hitBoundary ||= moved.hitBoundary;
  }
  return { position, hitSolid, hitBoundary, requested, ...contact(requested, sub(position, origin), drive, hitSolid) };
}

/** A hull: support-limited drift, then one `moveHull` of drive + drift. */
export function moveHullWithCurrent(world: WorldQueries, origin: Vec3, drive: Vec3, drift: Vec3, shape: Capsule, dt: number,
  options: { surfaceY?: number; bounds?: HorizontalBounds } = {}): CurrentMove {
  const driveDelta = scale(drive, dt), requested = add(driveDelta, supportedDrift(world, origin, driveDelta, scale(drift, dt), shape));
  const top = options.surfaceY ?? -0.9;
  if (origin.y + requested.y > top) requested.y = Math.min(requested.y, Math.max(0, top - origin.y));
  const moved = moveHull(world, origin, requested, shape, options.bounds);
  return { position: moved.position, hitSolid: moved.hitSolid, hitBoundary: moved.hitBoundary, requested,
    ...contact(requested, sub(moved.position, origin), drive, moved.hitSolid) };
}
