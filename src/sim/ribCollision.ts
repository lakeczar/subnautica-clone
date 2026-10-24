import type { Capsule, Vec3 } from "./types.js";

/** Internal geometry only: actors keep their existing fixed-axis box extents. */
export interface BoxBounds { min: Vec3; max: Vec3 }
interface SegmentCapsule { a: Vec3; b: Vec3; radius: number }
const AXES = ["x", "y", "z"] as const;
// Retain the world's existing 1mm static tolerance: shrinking a capsule by this
// amount lies inside the old registration box shrunk by 1mm on every face, so
// every previously clear pose remains clear. New sweeps approach much more closely.
export const RIB_CONTACT_TOLERANCE = 0.001;
export const RIB_SWEEP_SEPARATION = 1e-6;
export const RIB_SWEEP_ITERATIONS = 64;
export const RIB_SLIDE_ITERATIONS = 8;
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function actorBox(p: Vec3, shape: Capsule): BoxBounds {
  const x = shape.halfWidth ?? shape.radius, z = shape.halfLength ?? shape.radius;
  return {
    min: { x: p.x - x, y: p.y + (shape.bottom ?? 0), z: p.z - z },
    max: { x: p.x + x, y: p.y + shape.height, z: p.z + z },
  };
}

/** Broadphase only; includes the entire linear translation, not just its endpoints. */
export function sweptBoxIntersects(box: BoxBounds, delta: Vec3, bounds: BoxBounds): boolean {
  return AXES.every(axis =>
    box.min[axis] + Math.min(0, delta[axis]) <= bounds.max[axis] + RIB_CONTACT_TOLERANCE &&
    box.max[axis] + Math.max(0, delta[axis]) >= bounds.min[axis] - RIB_CONTACT_TOLERANCE);
}

/** Exact segment/AABB minimum. Slab crossings partition s in [0,1] into at most
 * seven quadratic pieces of squared point/box distance. Check each piece's
 * endpoints and stationary point. Handles points, parallel axes and zero-size boxes.
 * The closest pair supplies a supporting normal from the rib axis toward the box. */
export function segmentBoxClosest(a: Vec3, b: Vec3, box: BoxBounds): {
  distance: number; segmentPoint: Vec3; boxPoint: Vec3; normal: Vec3;
} {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, cuts = [0, 1];
  for (const axis of AXES) if (u[axis] !== 0) {
    for (const boundary of [box.min[axis], box.max[axis]]) {
      const s = (boundary - a[axis]) / u[axis];
      if (s > 0 && s < 1) cuts.push(s);
    }
  }
  cuts.sort((x, y) => x - y);
  let best = Infinity, segmentPoint = { ...a }, boxPoint = { ...a };
  const consider = (s: number): void => {
    const p = { x: a.x + u.x * s, y: a.y + u.y * s, z: a.z + u.z * s };
    const q = { x: clamp(p.x, box.min.x, box.max.x), y: clamp(p.y, box.min.y, box.max.y), z: clamp(p.z, box.min.z, box.max.z) };
    const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
    if (d2 < best) { best = d2; segmentPoint = p; boxPoint = q; }
  };
  consider(0);
  for (let i = 1; i < cuts.length; i++) {
    const lo = cuts[i - 1]!, hi = cuts[i]!, mid = (lo + hi) / 2;
    let quadratic = 0, linear = 0;
    for (const axis of AXES) {
      const p = a[axis] + u[axis] * mid;
      const boundary = p < box.min[axis] ? box.min[axis] : p > box.max[axis] ? box.max[axis] : null;
      if (boundary !== null) { quadratic += u[axis] ** 2; linear += u[axis] * (a[axis] - boundary); }
    }
    if (quadratic > 0) consider(clamp(-linear / quadratic, lo, hi));
    consider(hi);
  }
  const distance = Math.sqrt(best);
  const normal = distance > 0 ? {
    x: (boxPoint.x - segmentPoint.x) / distance,
    y: (boxPoint.y - segmentPoint.y) / distance,
    z: (boxPoint.z - segmentPoint.z) / distance,
  } : { x: 0, y: 0, z: 0 };
  return { distance, segmentPoint, boxPoint, normal };
}

export interface RibSweepHit {
  t: number;
  normal: Vec3;
  /** Overlap, numerical no-progress or iteration exhaustion: discard unproved travel. */
  stop: boolean;
  iterations: number;
}

/** Continuous conservative advancement, not travel sampling. At the closest pair,
 * d + n.delta*dt is a separating-plane lower bound on future distance. Thus
 * (d-radius)/(-n.delta) cannot pass the first contact. A non-closing plane proves
 * the whole remaining line clear. Return the first <=1um separation, conservatively.
 * Grazing contact has a distance tolerance, not a uniform time-error bound.
 * At most 64 distance calls; exhaustion/no-progress stops at the last verified pose.
 * A <=1e-12m inward projection over the entire displacement is numerical tangent. */
export function sweepBoxRib(box: BoxBounds, delta: Vec3, rib: SegmentCapsule,
  iterationLimit = RIB_SWEEP_ITERATIONS): RibSweepHit | null {
  // Internal callers may lower the budget; the production world always uses 64.
  const budget = Number.isFinite(iterationLimit)
    ? clamp(Math.floor(iterationLimit), 1, RIB_SWEEP_ITERATIONS) : RIB_SWEEP_ITERATIONS;
  let t = 0, normal = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < budget; i++) {
    const translated = {
      min: { x: box.min.x + delta.x * t, y: box.min.y + delta.y * t, z: box.min.z + delta.z * t },
      max: { x: box.max.x + delta.x * t, y: box.max.y + delta.y * t, z: box.max.z + delta.z * t },
    };
    const closest = segmentBoxClosest(rib.a, rib.b, translated);
    normal = closest.normal;
    const gap = closest.distance - rib.radius, closing = -dot(normal, delta);
    if (!Number.isFinite(gap) || !Number.isFinite(closing))
      return { t: 0, normal, stop: true, iterations: i + 1 };
    if (gap < -RIB_CONTACT_TOLERANCE) {
      // Distance between convex sets under translation is convex. A defined
      // separating normal with non-closing travel therefore proves this entire
      // straight remainder cannot deepen the starting overlap. Every slide is
      // queried anew; an axis inside the box has no such normal and stays closed.
      if (i > 0 || closest.distance <= 1e-9)
        return { t, normal, stop: true, iterations: i + 1 };
      if (closing > 1e-12 * Math.max(1, Math.hypot(delta.x, delta.y, delta.z)))
        return { t: 0, normal, stop: false, iterations: i + 1 };
      return null;
    }
    if (closing <= 0 || (gap >= 0 && closing <= 1e-12)) return null;
    if (gap <= RIB_SWEEP_SEPARATION) return { t, normal, stop: false, iterations: i + 1 };
    const advance = gap / closing;
    if (advance > 1 - t) return null; // supporting plane separates the entire remainder
    const next = t + advance;
    if (!Number.isFinite(next) || next <= t)
      return { t, normal, stop: true, iterations: i + 1 };
    t = next;
  }
  return { t, normal, stop: true, iterations: budget };
}

/** Upper intersection of an infinite vertical line and the union of radius-r
 * spheres along the segment. Maximize ay+uy*s+sqrt(r²-horizontalDistance(s)²)
 * on its feasible interval; the concave semicircle has one analytic stationary point.
 * Returns null outside the capsule's X/Z projection, including sloped endcaps. */
export function ribUpperHeight(x: number, z: number, rib: SegmentCapsule): number | null {
  const ux = rib.b.x - rib.a.x, uy = rib.b.y - rib.a.y, uz = rib.b.z - rib.a.z;
  const vx = x - rib.a.x, vz = z - rib.a.z, horizontal = ux * ux + uz * uz;
  if (horizontal === 0) {
    const h2 = rib.radius ** 2 - vx * vx - vz * vz;
    return h2 < 0 ? null : Math.max(rib.a.y, rib.b.y) + Math.sqrt(h2);
  }
  const centre = (vx * ux + vz * uz) / horizontal;
  const dx = vx - ux * centre, dz = vz - uz * centre;
  const heightSquared = rib.radius ** 2 - dx * dx - dz * dz;
  if (heightSquared < 0) return null;
  const span = Math.sqrt(heightSquared / horizontal);
  const lo = Math.max(0, centre - span), hi = Math.min(1, centre + span);
  if (lo > hi) return null;
  const s = clamp(centre + uy * Math.sqrt(heightSquared / (horizontal * (horizontal + uy * uy))), lo, hi);
  const hx = vx - ux * s, hz = vz - uz * s;
  return rib.a.y + uy * s + Math.sqrt(Math.max(0, rib.radius ** 2 - hx * hx - hz * hz));
}
