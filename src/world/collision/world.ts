import type { Solid } from "../../sim/world.js";
import type { Capsule, MoveResult, MovementOptions, Vec3, WorldQueries } from "../../sim/types.js";
import type { CaveCollider } from "../caves/large/compose.js";
import type { Aabb, Rect } from "../types.js";
import { createSpatialIndex } from "../spatialIndex.js";
import { solidEntries } from "../queries.js";
import { boxBoxSeparation, createHit, createSeparation, mergeHit, sweepBoxBox, type Separation, type SweepHit } from "./boxTriangle.js";
import { depenetrate, OVERLAP_TOLERANCE, SKIN, slideMove, type Depenetration, type StaticCollider } from "./collider.js";

/** Static colliders in the world's query interface (COL-1 stage A; the
 * coordinator wires them in stage B). Two seams:
 * - `staticCaveCollider`: a cave as LC's `CaveCollider`, for
 *   `composeCaveWorld`. W1 kit caves keep their ownership (the footprint's
 *   whole column) and answer with a static collider: rock boxes or the shell
 *   itself, and the collar as a heightfield instead of column boxes.
 * - `composeStaticWorld`: authored structures (vistas, dishes, lost sites)
 *   over the exterior world. Away from the collider every query is the
 *   exterior's, unchanged; near it, moves advance in sub-sweeps with slides
 *   against the collider and every exterior solid near it, and clearance,
 *   support and sight add the collider to the exterior's answer.
 * Both add `depenetrate` for save loads (ART-07). */

const boxOf = (p: Vec3, s: Capsule): { c: Vec3; e: Vec3; box: Aabb } => {
  const ex = s.halfWidth ?? s.radius, ez = s.halfLength ?? s.radius, bottom = s.bottom ?? 0;
  const ey = (s.height - bottom) / 2, c = { x: p.x, y: p.y + bottom + ey, z: p.z };
  return { c, e: { x: ex, y: ey, z: ez }, box: { min: { x: p.x - ex, y: p.y + bottom, z: p.z - ez }, max: { x: p.x + ex, y: p.y + s.height, z: p.z + ez } } };
};
const poseOf = (c: Vec3, s: Capsule): Vec3 => ({ x: c.x, y: c.y - (s.bottom ?? 0) - (s.height - (s.bottom ?? 0)) / 2, z: c.z });
const finite = (p: Vec3): boolean => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

// --- Caves -------------------------------------------------------------------------

export interface StaticCaveOptions {
  readonly id: string;
  readonly footprint: Rect;
  /** The heightfield steps aside below this inside the footprint. */
  readonly baseY: number;
  /** Rock (shell or boxes) and collar (heightfield), answering for the
   * footprint's whole column and the band round it. */
  readonly collider: StaticCollider;
}
/** A W1 kit cave as LC's `CaveCollider`, with `boxCaveCollider`'s ownership. */
export function staticCaveCollider(o: StaticCaveOptions): CaveCollider {
  const f = o.footprint, col = o.collider;
  const inFoot = (x: number, z: number): boolean => x >= f.minX && x < f.maxX && z >= f.minZ && z < f.maxZ;
  return {
    id: o.id,
    baseY: o.baseY,
    touches: b => b.min.x < f.maxX && b.max.x > f.minX && b.min.z < f.maxZ && b.max.z > f.minZ,
    sweep: (c, e, d, skin, out) => col.sweep(c, e, d, skin, out),
    blocked: (c, e) => col.overlaps(c, e),
    segmentClear: (a, b) => col.segmentClear(a, b),
    support: (x, z, fromY) => col.support(x, z, fromY),
    masksGround: inFoot,
    ownedSpan: (x, z) => inFoot(x, z) ? [-Infinity, Infinity] : null,
    ownsPoint: p => inFoot(p.x, p.z),
  };
}

// --- Structures --------------------------------------------------------------------

export interface StaticWorldOptions {
  /** The world without the solids the collider replaces. */
  readonly exterior: WorldQueries;
  /** That world's solids, swept as boxes beside the collider. */
  readonly solids: readonly Solid[];
  readonly collider: StaticCollider;
  /** Horizontal bounds static moves clamp to (the exterior's own clamp). */
  readonly bounds?: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
}
export interface StaticWorld extends WorldQueries {
  /** The nearest clear pose reachable by continuous escape within
   * `maxDistance` (ART-07: a save pose overlapping new art), or null when
   * there is none (the caller rescues). */
  depenetrate(origin: Vec3, shape: Capsule, maxDistance: number): (Vec3 & { distance: number }) | null;
  readonly counters: { staticSweeps: number; exteriorSweeps: number };
}

export const STATIC_SUB_SWEEP = 0.5;
/** Support reads tops up to this far above `fromY`, as `createWorldQueries` does. */
export const SUPPORT_REACH = 0.25;

export function composeStaticWorld(options: StaticWorldOptions): StaticWorld {
  const { exterior, solids, collider } = options;
  const counters = { staticSweeps: 0, exteriorSweeps: 0 };
  const index = createSpatialIndex(solidEntries(solids));
  const nearSolids = (b: Aabb): Solid[] => index.inBox(b, ["solid"]).map(e => e.data!);
  const touches = (b: Aabb): boolean => collider.touches(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z);
  const hit = createHit();
  const envelope = (p: Vec3, d: Vec3, s: Capsule): Aabb => {
    const b = boxOf(p, s).box, r = Math.hypot(d.x, d.y, d.z);
    return { min: { x: Math.min(b.min.x, b.min.x + d.x) - r, y: Math.min(b.min.y, b.min.y + d.y) - r, z: Math.min(b.min.z, b.min.z + d.z) - r },
      max: { x: Math.max(b.max.x, b.max.x + d.x) + r, y: Math.max(b.max.y, b.max.y + d.y) + r, z: Math.max(b.max.z, b.max.z + d.z) + r } };
  };
  /** Earliest contact against the collider and the solids in `local`. */
  const sweepBoth = (local: readonly Solid[], e: Vec3) => (c: Vec3, d: Vec3, out: SweepHit): boolean => {
    let found = collider.sweep(c, e, d, SKIN, out);
    for (const s of local) if (sweepBoxBox(c.x, c.y, c.z, e.x, e.y, e.z, d.x, d.y, d.z, s.min.x, s.min.y, s.min.z, s.max.x, s.max.y, s.max.z, SKIN, hit))
      found = mergeHit(hit, out, found, d.x, d.y, d.z);
    return found;
  };
  const clamp = (p: Vec3): { p: Vec3; clipped: boolean } => {
    const b = options.bounds;
    if (!b) return { p, clipped: false };
    const x = Math.max(b.minX, Math.min(b.maxX, p.x)), z = Math.max(b.minZ, Math.min(b.maxZ, p.z));
    return { p: { x, y: p.y, z }, clipped: x !== p.x || z !== p.z };
  };
  const world: StaticWorld = {
    counters,
    waterHeight: exterior.waterHeight,
    groundHeight: exterior.groundHeight,
    supportHeight(x, z, fromY) {
      const h = exterior.supportHeight(x, z, fromY);
      return Math.max(h, collider.support(x, z, fromY + SUPPORT_REACH));
    },
    clearance(origin, shape) {
      if (!exterior.clearance(origin, shape)) return false;
      const { c, e } = boxOf(origin, shape);
      return !collider.overlaps(c, e, OVERLAP_TOLERANCE);
    },
    lineOfSight(a, b, ignore = []) {
      return exterior.lineOfSight(a, b, ignore) && (!finite(a) || !finite(b) || collider.segmentClear(a, b, ignore));
    },
    moveCapsule(origin: Vec3, delta: Vec3, shape: Capsule, opts?: MovementOptions): MoveResult {
      if (!finite(origin) || !finite(delta) || !touches(envelope(origin, delta, shape))) {
        counters.exteriorSweeps++;
        return exterior.moveCapsule(origin, delta, shape, opts);
      }
      const n = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y, delta.z) / STATIC_SUB_SWEEP));
      if (n > 100000) return { position: { ...origin }, hitSolid: true, hitBoundary: false };
      const d = { x: delta.x / n, y: delta.y / n, z: delta.z / n }, len = Math.hypot(d.x, d.y, d.z);
      let position = { ...origin }, hitSolid = false, hitBoundary = false;
      for (let i = 0; i < n; i++) {
        if (!touches(envelope(position, d, shape))) {
          counters.exteriorSweeps++;
          const r = exterior.moveCapsule(position, d, shape, opts);
          position = r.position; hitSolid ||= r.hitSolid; hitBoundary ||= r.hitBoundary;
          continue;
        }
        counters.staticSweeps++;
        const { c, e, box } = boxOf(position, shape);
        const local = nearSolids({ min: { x: box.min.x - len - 0.1, y: box.min.y - len - 0.1, z: box.min.z - len - 0.1 },
          max: { x: box.max.x + len + 0.1, y: box.max.y + len + 0.1, z: box.max.z + len + 0.1 } });
        const r = slideMove(sweepBoth(local, e), c, d), next = clamp(poseOf(r, shape));
        position = next.p; hitSolid ||= r.hit; hitBoundary ||= next.clipped;
      }
      return { position, hitSolid, hitBoundary };
    },
    depenetrate(origin, shape, maxDistance) {
      const { c, e } = boxOf(origin, shape);
      const sep = createSeparation();
      const r: Depenetration | null = depenetrate({
        sweep: (cc, ee, dd, skin, out) => {
          const b = { min: { x: cc.x - ee.x - 0.1, y: cc.y - ee.y - 0.1, z: cc.z - ee.z - 0.1 }, max: { x: cc.x + ee.x + 0.1, y: cc.y + ee.y + 0.1, z: cc.z + ee.z + 0.1 } };
          const reach = Math.hypot(dd.x, dd.y, dd.z);
          const local = nearSolids({ min: { x: b.min.x - reach, y: b.min.y - reach, z: b.min.z - reach }, max: { x: b.max.x + reach, y: b.max.y + reach, z: b.max.z + reach } });
          let found = collider.sweep(cc, ee, dd, skin, out);
          for (const s of local) if (sweepBoxBox(cc.x, cc.y, cc.z, ee.x, ee.y, ee.z, dd.x, dd.y, dd.z, s.min.x, s.min.y, s.min.z, s.max.x, s.max.y, s.max.z, skin, hit))
            found = mergeHit(hit, out, found, dd.x, dd.y, dd.z);
          return found;
        },
        blocked: cc => !world.clearance(poseOf(cc, shape), shape),
        deepest(cc, ee, tolerance) {
          let best: Separation | null = collider.contact(cc, ee, tolerance);
          const b = { min: { x: cc.x - ee.x, y: cc.y - ee.y, z: cc.z - ee.z }, max: { x: cc.x + ee.x, y: cc.y + ee.y, z: cc.z + ee.z } };
          for (const s of nearSolids(b)) {
            boxBoxSeparation(cc.x, cc.y, cc.z, ee.x, ee.y, ee.z, s.min.x, s.min.y, s.min.z, s.max.x, s.max.y, s.max.z, sep);
            if (sep.s < -tolerance && (!best || sep.s < best.s)) best = { ...sep };
          }
          return best;
        },
        inside: p => collider.solidAt(p),
        surfaceNear: (solid, p, reach) => collider.surfaceNear(solid, p, reach),
      }, c, e, maxDistance);
      return r ? { ...poseOf(r, shape), distance: r.distance } : null;
    },
  };
  return world;
}
