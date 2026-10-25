import type { Solid } from "../../../sim/world.js";
import type { Capsule, MoveResult, MovementOptions, Vec3, WorldQueries } from "../../../sim/types.js";
import type { Aabb } from "../../types.js";
import { createSpatialIndex } from "../../spatialIndex.js";
import { solidEntries } from "../../queries.js";
import {
  boxOverlapsTriangle, caveRockAt, caveSegmentClear, caveSupport, createCandidates, gatherTriangles,
  sweepBoxBox, sweepBoxTriangle, type CaveCollision, type SweepHit,
} from "./collision.js";
import { boxTouchesOwned, capAt, collarAt, owns } from "./ownership.js";

/** One world-query interface for every cave (proposal for `sim/world.ts`).
 *
 * A `CaveCollider` answers for the space a cave owns: sweeps, overlap,
 * sight and support against its rock, plus the exterior ground it models
 * round its openings (the band). Small and medium caves (the W1 kit's thick
 * boxes) and cave biomes (triangle meshes) both implement it; the composer
 * below does not care which.
 *
 * `composeCaveWorld` wraps the exterior world:
 * - **Ownership per sub-sweep, slides included.** A move whose envelope
 *   touches no cave is the exterior's, unchanged (legacy guards and all).
 *   Otherwise it advances in sub-sweeps of at most `CAVE_SUB_SWEEP`; each
 *   sub-sweep whose own envelope (grown by its length, which bounds its
 *   slides) touches a cave runs against that cave's rock and every exterior
 *   solid near it; every other sub-sweep goes back to the exterior.
 * - **Slides** clip the remaining travel against every contact plane met in
 *   the move, then along the crease of two planes; a third plane stops it.
 * - **Nothing exterior is dropped:** exterior solids are swept as boxes in
 *   cave sub-sweeps and tested in sight lines; the exterior floor is sampled
 *   along sight lines wherever no cave owns the point.
 * - **Support from below** inside a cave; `groundHeight` steps aside only in
 *   a cave's collar columns (where the cave owns the seabed itself). In deep
 *   owned space `groundHeight` is still the seabed ABOVE the cave, so floor
 *   corrections there must read `supportHeight` (see `hullFloorFromSupport`).
 * - Shapes wider than `maxHalfExtent` are refused at a cave (no move). */

export interface CaveCollider {
  readonly id: string;
  /** True when the box reaches space this cave answers for. */
  touches(box: Aabb): boolean;
  /** Earliest contact of a box (centre, half extents) moving by `d`. */
  sweep(c: Vec3, e: Vec3, d: Vec3, skin: number, out: SweepHit): boolean;
  /** True when the box crosses cave rock or sits inside it. */
  blocked(c: Vec3, e: Vec3): boolean;
  /** True when no cave rock lies on the segment. */
  segmentClear(a: Vec3, b: Vec3): boolean;
  /** Highest upward-facing cave surface at (x, z) at or below `fromY`, or -Infinity. */
  support(x: number, z: number, fromY: number): number;
  /** Whether the heightfield steps aside at (x, z) (the cave owns the seabed). */
  masksGround(x: number, z: number): boolean;
  /** Whether the point is owned by this cave (sight lines skip the exterior floor there). */
  ownsPoint(p: Vec3): boolean;
  /** The Y interval of column (x, z) this cave owns, or null. Inside it the
   * cave alone says what is rock; outside it the exterior floor does. */
  ownedSpan(x: number, z: number): readonly [number, number] | null;
  readonly baseY: number;
}

export const CAVE_SUB_SWEEP = 0.5;
export const CAVE_SKIN = 0.004;
const SLIDES = 6;

/** A cave biome's collision as a `CaveCollider`. */
export function largeCaveCollider(col: CaveCollision): CaveCollider {
  const cand = createCandidates(), hit: SweepHit = { t: 0, nx: 0, ny: 0, nz: 0, start: false }, o = col.ownership;
  return {
    id: col.id,
    baseY: o.domain.min.y,
    touches: box => boxTouchesOwned(o, box),
    sweep(c, e, d, skin, out) {
      const r = Math.hypot(d.x, d.y, d.z) + skin + 0.01;
      gatherTriangles(col, { min: { x: c.x - e.x - r, y: c.y - e.y - r, z: c.z - e.z - r }, max: { x: c.x + e.x + r, y: c.y + e.y + r, z: c.z + e.z + r } }, cand);
      let found = false;
      for (let t = 0; t < cand.count; t++) {
        if (!sweepBoxTriangle(c.x, c.y, c.z, e.x, e.y, e.z, d.x, d.y, d.z, cand.v, t * 9, skin, hit)) continue;
        if (!found || hit.t < out.t) { out.t = hit.t; out.nx = hit.nx; out.ny = hit.ny; out.nz = hit.nz; out.start = hit.start; found = true; }
      }
      return found;
    },
    blocked(c, e) {
      gatherTriangles(col, { min: { x: c.x - e.x - 0.01, y: c.y - e.y - 0.01, z: c.z - e.z - 0.01 }, max: { x: c.x + e.x + 0.01, y: c.y + e.y + 0.01, z: c.z + e.z + 0.01 } }, cand);
      for (let t = 0; t < cand.count; t++) if (boxOverlapsTriangle(c.x, c.y, c.z, e.x, e.y, e.z, cand.v, t * 9, 0.001)) return true;
      // No surface crosses the box, so each owned part of it is wholly rock
      // or wholly water: test the centre and the (slightly inset) corners
      // that this cave owns. The unowned part is the composer's to check.
      for (let q = -1; q < 8; q++) {
        const p = q < 0 ? c : { x: c.x + ((q & 1) ? 1 : -1) * (e.x - 0.01), y: c.y + ((q & 2) ? 1 : -1) * (e.y - 0.01), z: c.z + ((q & 4) ? 1 : -1) * (e.z - 0.01) };
        if (owns(o, p.x, p.y, p.z) && caveRockAt(col, p)) return true;
      }
      return false;
    },
    segmentClear: (a, b) => caveSegmentClear(col, a, b),
    support: (x, z, fromY) => caveSupport(col, x, z, fromY),
    masksGround: (x, z) => collarAt(o, x, z) !== null,
    ownsPoint: p => owns(o, p.x, p.y, p.z),
    ownedSpan(x, z) {
      const d = o.domain;
      if (x < d.min.x || x > d.max.x || z < d.min.z || z > d.max.z) return null;
      return [d.min.y, capAt(o, x, z)];
    },
  };
}

const boxOf = (p: Vec3, s: Capsule): { c: Vec3; e: Vec3; box: Aabb } => {
  const ex = s.halfWidth ?? s.radius, ez = s.halfLength ?? s.radius, bottom = s.bottom ?? 0;
  const ey = (s.height - bottom) / 2, c = { x: p.x, y: p.y + bottom + ey, z: p.z };
  return { c, e: { x: ex, y: ey, z: ez }, box: { min: { x: p.x - ex, y: p.y + bottom, z: p.z - ez }, max: { x: p.x + ex, y: p.y + s.height, z: p.z + ez } } };
};
const grow = (b: Aabb, d: Vec3, r: number): Aabb => ({
  min: { x: Math.min(b.min.x, b.min.x + d.x) - r, y: Math.min(b.min.y, b.min.y + d.y) - r, z: Math.min(b.min.z, b.min.z + d.z) - r },
  max: { x: Math.max(b.max.x, b.max.x + d.x) + r, y: Math.max(b.max.y, b.max.y + d.y) + r, z: Math.max(b.max.z, b.max.z + d.z) + r },
});
const finite = (p: Vec3): boolean => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

export interface CaveWorldOptions {
  readonly exterior: WorldQueries;
  /** Exterior solids, swept as boxes inside cave sub-sweeps. */
  readonly solids: readonly Solid[];
  /** The exterior floor, sampled along sight lines outside caves. */
  readonly floor: (x: number, z: number) => number;
  readonly caves: readonly CaveCollider[];
  /** Largest horizontal half-extent admitted at a cave (a medium hull is 4.5). */
  readonly maxHalfExtent?: number;
}

export interface CaveWorld extends WorldQueries {
  /** The cave answering for a box, if any (first match). */
  caveAt(box: Aabb): CaveCollider | null;
  /** Counters for cost measurement. */
  readonly counters: { caveSweeps: number; exteriorSweeps: number };
}

export function composeCaveWorld(options: CaveWorldOptions): CaveWorld {
  const { exterior, solids, floor, caves } = options, maxHalf = options.maxHalfExtent ?? 4.5;
  const counters = { caveSweeps: 0, exteriorSweeps: 0 };
  const touched = (box: Aabb): CaveCollider[] => caves.filter(c => c.touches(box));
  const hit: SweepHit = { t: 0, nx: 0, ny: 0, nz: 0, start: false }, best: SweepHit = { t: 0, nx: 0, ny: 0, nz: 0, start: false };
  // The same 32 m broad phase the exterior world uses (thousands of solids).
  const index = createSpatialIndex(solidEntries(solids));
  const nearSolids = (box: Aabb): Solid[] => index.inBox(box, ["solid"]).map(e => e.data!);

  /** One cave sub-sweep with slides against its caves and nearby solids. */
  function slide(origin: Vec3, delta: Vec3, shape: Capsule, owners: readonly CaveCollider[]): { position: Vec3; hit: boolean } {
    counters.caveSweeps++;
    const { e } = boxOf(origin, shape);
    const reach = Math.hypot(delta.x, delta.y, delta.z);
    const local = nearSolids(grow(boxOf(origin, shape).box, { x: 0, y: 0, z: 0 }, reach + 0.1));
    let pos = { ...origin }, rem = { ...delta }, any = false;
    const planes: Vec3[] = [];
    for (let i = 0; i < SLIDES; i++) {
      const c = boxOf(pos, shape).c;
      let found = false;
      for (const cave of owners) if (cave.sweep(c, e, rem, CAVE_SKIN, hit) && (!found || hit.t < best.t)) { Object.assign(best, hit); found = true; }
      for (const s of local) if (sweepBoxBox(c.x, c.y, c.z, e.x, e.y, e.z, rem.x, rem.y, rem.z, s.min, s.max, CAVE_SKIN, hit) && (!found || hit.t < best.t)) {
        Object.assign(best, hit); found = true;
      }
      if (!found) { pos = { x: pos.x + rem.x, y: pos.y + rem.y, z: pos.z + rem.z }; break; }
      any = true;
      pos = { x: pos.x + rem.x * best.t, y: pos.y + rem.y * best.t, z: pos.z + rem.z * best.t };
      const left = { x: rem.x * (1 - best.t), y: rem.y * (1 - best.t), z: rem.z * (1 - best.t) };
      planes.push({ x: best.nx, y: best.ny, z: best.nz });
      // Clip against each plane; keep the first that respects all of them.
      let next: Vec3 | null = null;
      for (const p of planes) {
        const into = left.x * p.x + left.y * p.y + left.z * p.z;
        const v = into < 0 ? { x: left.x - p.x * into, y: left.y - p.y * into, z: left.z - p.z * into } : left;
        if (planes.every(q => q === p || v.x * q.x + v.y * q.y + v.z * q.z >= -1e-12)) { next = v; break; }
      }
      if (!next && planes.length >= 2) {
        // Along the crease of the last two planes.
        const a = planes[planes.length - 2]!, b = planes[planes.length - 1]!;
        const k = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }, kl = Math.hypot(k.x, k.y, k.z);
        if (kl > 1e-9) {
          const s = (left.x * k.x + left.y * k.y + left.z * k.z) / (kl * kl);
          next = { x: k.x * s, y: k.y * s, z: k.z * s };
          if (planes.length > 2 || !planes.every(q => next!.x * q.x + next!.y * q.y + next!.z * q.z >= -1e-9)) next = null;
        }
      }
      if (!next || Math.hypot(next.x, next.y, next.z) < 1e-9) break;
      rem = next;
      if (planes.length >= 3) break;
    }
    return { position: pos, hit: any };
  }

  /** Full-shape ownership for the part of a box no cave owns: sample its
   * footprint (at most 0.5 m apart, edges included) and, in every column,
   * require the box below that column's exterior floor to lie inside some
   * cave's owned span. Deep cave water under an overhead seabed is owned, so
   * it passes; a box buried in exterior ground beside a collar does not. */
  function buriedInExterior(box: Aabb): boolean {
    const nx = Math.max(2, Math.ceil((box.max.x - box.min.x) / 0.5) + 1), nz = Math.max(2, Math.ceil((box.max.z - box.min.z) / 0.5) + 1);
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x = box.min.x + (box.max.x - box.min.x) * i / (nx - 1), z = box.min.z + (box.max.z - box.min.z) * k / (nz - 1);
      // Owned spans covering the whole box need no floor sample (deep caves).
      const spans = caves.map(cv => cv.ownedSpan(x, z)).filter((v): v is readonly [number, number] => v !== null);
      const covered = (lo: number, hi: number): boolean => spans.some(([a, b]) => a <= lo && hi <= b);
      if (covered(box.min.y, box.max.y)) continue;
      const top = Math.min(box.max.y, floor(x, z) - 0.02);
      if (box.min.y < top && !covered(box.min.y, top)) return true;
    }
    return false;
  }

  const world: CaveWorld = {
    counters,
    waterHeight: exterior.waterHeight,
    caveAt: box => caves.find(c => c.touches(box)) ?? null,
    groundHeight(x, z) {
      for (const c of caves) if (c.masksGround(x, z)) return c.baseY - 1;
      return exterior.groundHeight(x, z);
    },
    supportHeight(x, z, fromY) {
      const probe: Aabb = { min: { x, y: fromY - 0.5, z }, max: { x, y: fromY + 0.5, z } };
      const owners = touched(probe);
      if (!owners.length) return exterior.supportHeight(x, z, fromY);
      let h = -Infinity;
      for (const c of owners) h = Math.max(h, c.support(x, z, fromY + 0.25));
      for (const s of nearSolids({ min: { x, y: -1e5, z }, max: { x, y: 1e5, z } })) if (x >= s.min.x && x <= s.max.x && z >= s.min.z && z <= s.max.z && fromY >= s.max.y - 0.25) h = Math.max(h, s.max.y);
      return h === -Infinity ? Math.min(...owners.map(c => c.baseY)) - 1 : h;
    },
    clearance(origin, shape) {
      const { c, e, box } = boxOf(origin, shape);
      const owners = touched(box);
      if (!owners.length) return exterior.clearance(origin, shape);
      if (!finite(origin) || Math.max(e.x, e.z) > maxHalf) return false;
      if (owners.some(cave => cave.blocked(c, e))) return false;
      if (buriedInExterior(box)) return false;
      return !nearSolids(box).some(s => origin.x + e.x > s.min.x + 0.001 && origin.x - e.x < s.max.x - 0.001 &&
        origin.z + e.z > s.min.z + 0.001 && origin.z - e.z < s.max.z - 0.001 && box.max.y > s.min.y + 0.001 && box.min.y < s.max.y - 0.001);
    },
    lineOfSight(a, b, ignore = []) {
      const box: Aabb = { min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) } };
      const owners = touched(box);
      if (!owners.length) return exterior.lineOfSight(a, b, ignore);
      if (!finite(a) || !finite(b)) return false;
      if (!owners.every(c => c.segmentClear(a, b))) return false;
      for (const s of nearSolids(box)) if (!ignore.includes(s.id) && segmentHitsBox(a, b, s)) return false;
      // The exterior floor, wherever no cave owns the point or masks its column.
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.15));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
        if (caves.some(c => c.ownsPoint(p) || c.masksGround(p.x, p.z))) continue;
        if (p.y < floor(p.x, p.z) - 0.02) return false;
      }
      return true;
    },
    moveCapsule(origin: Vec3, delta: Vec3, shape: Capsule, opts?: MovementOptions): MoveResult {
      const start = boxOf(origin, shape);
      if (!touched(grow(start.box, delta, Math.hypot(delta.x, delta.y, delta.z))).length) {
        counters.exteriorSweeps++;
        return exterior.moveCapsule(origin, delta, shape, opts);
      }
      if (!finite(origin)) throw new RangeError("Movement origin must be finite.");
      if (!finite(delta) || Math.max(start.e.x, start.e.z) > maxHalf) return { position: { ...origin }, hitSolid: true, hitBoundary: false };
      const n = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y, delta.z) / CAVE_SUB_SWEEP));
      if (n > 100000) return { position: { ...origin }, hitSolid: true, hitBoundary: false };
      const d = { x: delta.x / n, y: delta.y / n, z: delta.z / n }, len = Math.hypot(d.x, d.y, d.z);
      let position = { ...origin }, hitSolid = false, hitBoundary = false;
      for (let i = 0; i < n; i++) {
        const owners = touched(grow(boxOf(position, shape).box, d, len));
        if (owners.length) {
          const r = slide(position, d, shape, owners);
          position = r.position; hitSolid ||= r.hit;
        } else {
          counters.exteriorSweeps++;
          const r = exterior.moveCapsule(position, d, shape, opts);
          position = r.position; hitSolid ||= r.hitSolid; hitBoundary ||= r.hitBoundary;
        }
      }
      return { position, hitSolid, hitBoundary };
    },
  };
  return world;
}

function segmentHitsBox(a: Vec3, b: Vec3, s: Solid): boolean {
  let t0 = 0, t1 = 1;
  for (const k of ["x", "y", "z"] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) { if (a[k] <= s.min[k] || a[k] >= s.max[k]) return false; continue; }
    let u = (s.min[k] - a[k]) / d, w = (s.max[k] - a[k]) / d;
    if (u > w) { const q = u; u = w; w = q; }
    t0 = Math.max(t0, u); t1 = Math.min(t1, w);
    if (t0 >= t1) return false;
  }
  return true;
}

/** Hull keel floor from SUPPORT under its footprint (proposed replacement
 * for `hullFloor` near caves): the highest surface at or below the keel at
 * the nine footprint points, never the seabed above a cave roof. */
export function hullFloorFromSupport(world: WorldQueries, origin: Vec3, shape: Capsule): number {
  const hx = shape.halfWidth ?? shape.radius, hz = shape.halfLength ?? shape.radius;
  let floor = -Infinity;
  for (const x of [-1, 0, 1]) for (const z of [-1, 0, 1])
    floor = Math.max(floor, world.supportHeight(origin.x + x * hx, origin.z + z * hz, origin.y + (shape.bottom ?? 0)));
  return floor - (shape.bottom ?? 0);
}

/** A world in another frame: queries at p answer `inner` at p + offset. */
export function translatedWorld(inner: WorldQueries, offset: Vec3): WorldQueries {
  const to = (p: Vec3): Vec3 => ({ x: p.x + offset.x, y: p.y + offset.y, z: p.z + offset.z });
  return {
    waterHeight: inner.waterHeight,
    groundHeight: (x, z) => inner.groundHeight(x + offset.x, z + offset.z) - offset.y,
    supportHeight: (x, z, fromY) => inner.supportHeight(x + offset.x, z + offset.z, fromY + offset.y) - offset.y,
    clearance: (p, s) => inner.clearance(to(p), s),
    lineOfSight: (a, b, ignore) => inner.lineOfSight(to(a), to(b), ignore),
    moveCapsule(p, d, s, o) {
      const r = inner.moveCapsule(to(p), d, s, o);
      return { ...r, position: { x: r.position.x - offset.x, y: r.position.y - offset.y, z: r.position.z - offset.z } };
    },
  };
}
