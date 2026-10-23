import type { Aabb, Vec3 } from "../types.js";
import {
  boxBoxSeparation, createHit, createSeparation, earlier, segmentBox, sweepBoxBox, takeHit, type Separation, type SweepHit,
} from "./boxTriangle.js";
import { buildBvh, isLeaf, leafCount, leafFirst } from "./bvh.js";
import {
  deepestHeightfieldContact, overlapsHeightfield, segmentClearHeightfield, supportHeightfield, sweepHeightfield,
  type StaticHeightfield,
} from "./heightfield.js";
import {
  crossesShape, crossingsAbove, deepestShapeContact, insideShape, nearestSurface, segmentClearShape, supportShape, sweepShape,
  type StaticShape,
} from "./shape.js";

/** The static collider: every baked shape of a place behind one query
 * interface (COL-1). Each surface uses the primitive that fits it:
 * - **triangle shapes** (`shape.ts`) for authored art: hulls, arches, dish
 *   bowls, cave shells, biome chunks;
 * - **heightfields** (`heightfield.ts`) for seabed collars and seams;
 * - **boxes** only for what really is a box (gantry beams, markers, huts).
 *
 * A top-level hierarchy over the members, and one per member, keep cost
 * with what is near the query. Queries take the world's fixed-axis actor
 * box as centre and half extents, with LC's semantics: sweeps with a skin,
 * start contacts blocked only while closing, slides clipped against every
 * contact plane and along a crease, and support from below. */

export interface StaticBoxes {
  readonly kind: "boxes";
  readonly id: string;
  /** 6 doubles per box (min xyz, max xyz), in hierarchy leaf order. */
  readonly boxes: Float64Array;
  /** Stable id per box, in the same order (line-of-sight `ignore`). */
  readonly ids: readonly string[];
  readonly nodes: Float64Array;
  readonly links: Uint32Array;
  readonly bounds: Aabb;
  readonly bytes: number;
}
export type StaticMember = StaticShape | StaticHeightfield | StaticBoxes;

export function buildBoxes(id: string, boxes: readonly { readonly id: string; readonly min: Vec3; readonly max: Vec3 }[]): StaticBoxes {
  const raw = new Float64Array(boxes.length * 6);
  boxes.forEach((b, i) => {
    if (![b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite) || b.min.x > b.max.x || b.min.y > b.max.y || b.min.z > b.max.z)
      throw new Error(`boxes ${id}: invalid box ${b.id}`);
    raw.set([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z], i * 6);
  });
  const bvh = buildBvh(raw, 4), sorted = new Float64Array(raw.length), ids: string[] = [];
  for (let i = 0; i < boxes.length; i++) { const p = bvh.order[i]!; sorted.set(raw.subarray(p * 6, p * 6 + 6), i * 6); ids.push(boxes[p]!.id); }
  const b = bvh.bounds;
  return {
    kind: "boxes", id, boxes: sorted, ids, nodes: bvh.bounds, links: bvh.links,
    bounds: boxes.length ? { min: { x: b[0]!, y: b[1]!, z: b[2]! }, max: { x: b[3]!, y: b[4]!, z: b[5]! } } : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
    bytes: sorted.byteLength + bvh.bounds.byteLength + bvh.links.byteLength,
  };
}

const BSTACK = new Int32Array(128);
/** Boxes (leaf-order indices) meeting the box, via `visit`; stops on true. */
function forBoxes(s: StaticBoxes, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, visit: (i: number) => boolean): boolean {
  if (!s.links.length) return false;
  const N = s.nodes, L = s.links;
  let sp = 0;
  BSTACK[sp++] = 0;
  while (sp) {
    const id = BSTACK[--sp]!, n = id * 6;
    if (N[n]! > maxX || N[n + 3]! < minX || N[n + 1]! > maxY || N[n + 4]! < minY || N[n + 2]! > maxZ || N[n + 5]! < minZ) continue;
    const l = L[id]!;
    if (isLeaf(l)) {
      for (let i = leafFirst(l), e = i + leafCount(l); i < e; i++) {
        const o = i * 6, B = s.boxes;
        if (B[o]! > maxX || B[o + 3]! < minX || B[o + 1]! > maxY || B[o + 4]! < minY || B[o + 2]! > maxZ || B[o + 5]! < minZ) continue;
        if (visit(i)) return true;
      }
      continue;
    }
    BSTACK[sp++] = l; BSTACK[sp++] = id + 1;
  }
  return false;
}

export interface MoveOutcome { x: number; y: number; z: number; hit: boolean }
export interface Depenetration { x: number; y: number; z: number; distance: number }

export interface StaticCollider {
  readonly id: string;
  readonly members: readonly StaticMember[];
  readonly bounds: Aabb;
  /** Whether any member's bounds meet the box. */
  touches(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean;
  /** Earliest contact of a box (centre c, half extents e) moving by d. */
  sweep(c: Vec3, e: Vec3, d: Vec3, skin: number, out: SweepHit): boolean;
  /** True when the box crosses a surface by more than `tolerance` or sits
   * inside a solid (a closed shape, under a heightfield, in a box). */
  overlaps(c: Vec3, e: Vec3, tolerance?: number): boolean;
  /** Highest surface at (x, z) at or below `fromY` an actor can rest on, or -Infinity. */
  support(x: number, z: number, fromY: number): number;
  /** True when the segment crosses no surface; boxes whose id is in `ignore` are skipped. */
  segmentClear(a: Vec3, b: Vec3, ignore?: readonly string[]): boolean;
  /** Swept movement with slides (see `slideMove`). */
  move(c: Vec3, e: Vec3, d: Vec3, skin?: number): MoveOutcome;
  /** The nearest clear centre reachable by continuous escape (see `depenetrate`). */
  depenetrate(c: Vec3, e: Vec3, maxDistance: number): Depenetration | null;
  /** The deepest surface overlap of the box beyond `tolerance`, or null. */
  contact(c: Vec3, e: Vec3, tolerance: number): Separation | null;
  /** The closed solid whose interior holds p, or null. */
  solidAt(p: Vec3): StaticShape | null;
  /** Nearest surface point of a solid (its whole group) to p within `reach`. */
  surfaceNear(solid: StaticShape, p: Vec3, reach: number): { point: Vec3; distance: number } | null;
  /** Triangle surfaces the vertical segment from (x, y, z) up to `top` crosses,
   * over every shape (for owners with their own interior rule: a biome's cap). */
  crossings(x: number, y: number, z: number, top: number): number;
  readonly triangles: number;
  readonly boxCount: number;
  readonly samples: number;
  readonly bytes: number;
  readonly sharedBytes: number;
}

export const SKIN = 0.004;
export const OVERLAP_TOLERANCE = 0.001;

export function createStaticCollider(id: string, members: readonly StaticMember[]): StaticCollider {
  const raw = new Float64Array(members.length * 6);
  members.forEach((m, i) => raw.set([m.bounds.min.x, m.bounds.min.y, m.bounds.min.z, m.bounds.max.x, m.bounds.max.y, m.bounds.max.z], i * 6));
  // Member bounds grow by a centimetre: sweeps and support read a hair past them.
  for (let i = 0; i < raw.length; i++) raw[i] = raw[i]! + (i % 6 < 3 ? -0.01 : 0.01);
  const top = buildBvh(raw, 2), order = Array.from(top.order, i => members[i]!);
  const N = top.bounds, L = top.links, stack = new Int32Array(64);
  const hit = createHit(), sep = createSeparation();
  /** Members (in top-level leaf order) whose bounds meet the box. */
  const near: StaticMember[] = [];
  const gather = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): StaticMember[] => {
    near.length = 0;
    if (!L.length) return near;
    let sp = 0;
    stack[sp++] = 0;
    while (sp) {
      const nid = stack[--sp]!, n = nid * 6;
      if (N[n]! > maxX || N[n + 3]! < minX || N[n + 1]! > maxY || N[n + 4]! < minY || N[n + 2]! > maxZ || N[n + 5]! < minZ) continue;
      const l = L[nid]!;
      if (isLeaf(l)) {
        for (let i = leafFirst(l), e = i + leafCount(l); i < e; i++) {
          const m = order[i]!, o = top.order[i]! * 6;
          if (raw[o]! > maxX || raw[o + 3]! < minX || raw[o + 1]! > maxY || raw[o + 4]! < minY || raw[o + 2]! > maxZ || raw[o + 5]! < minZ) continue;
          near.push(m);
        }
        continue;
      }
      stack[sp++] = l; stack[sp++] = nid + 1;
    }
    return near;
  };
  // No query gathers again while it walks `near`, so it is reused.

  function sweep(c: Vec3, e: Vec3, d: Vec3, skin: number, out: SweepHit): boolean {
    const r = skin + 0.02;
    const ms = gather(c.x - e.x + Math.min(0, d.x) - r, c.y - e.y + Math.min(0, d.y) - r, c.z - e.z + Math.min(0, d.z) - r,
      c.x + e.x + Math.max(0, d.x) + r, c.y + e.y + Math.max(0, d.y) + r, c.z + e.z + Math.max(0, d.z) + r);
    let found = false;
    const take = (): void => { if (!found || earlier(hit, out, d.x, d.y, d.z)) { takeHit(hit, out, found); found = true; } };
    for (const m of ms) {
      if (m.kind === "shape") { if (sweepShape(m, c.x, c.y, c.z, e.x, e.y, e.z, d.x, d.y, d.z, skin, hit)) take(); }
      else if (m.kind === "heightfield") { if (sweepHeightfield(m, c.x, c.y, c.z, e.x, e.y, e.z, d.x, d.y, d.z, skin, hit)) take(); }
      else forBoxes(m, c.x - e.x + Math.min(0, d.x) - r, c.y - e.y + Math.min(0, d.y) - r, c.z - e.z + Math.min(0, d.z) - r,
        c.x + e.x + Math.max(0, d.x) + r, c.y + e.y + Math.max(0, d.y) + r, c.z + e.z + Math.max(0, d.z) + r, i => {
          const B = m.boxes, o = i * 6;
          if (sweepBoxBox(c.x, c.y, c.z, e.x, e.y, e.z, d.x, d.y, d.z, B[o]!, B[o + 1]!, B[o + 2]!, B[o + 3]!, B[o + 4]!, B[o + 5]!, skin, hit)) take();
          return false;
        });
    }
    return found;
  }

  function overlaps(c: Vec3, e: Vec3, tolerance = OVERLAP_TOLERANCE): boolean {
    const t = tolerance;
    for (const m of gather(c.x - e.x, c.y - e.y, c.z - e.z, c.x + e.x, c.y + e.y, c.z + e.z)) {
      if (m.kind === "shape") { if (crossesShape(m, c.x, c.y, c.z, e.x, e.y, e.z, t)) return true; }
      else if (m.kind === "heightfield") { if (overlapsHeightfield(m, c.x, c.y, c.z, e.x, e.y, e.z, t)) return true; }
      else if (forBoxes(m, c.x - e.x, c.y - e.y, c.z - e.z, c.x + e.x, c.y + e.y, c.z + e.z, i => {
        const B = m.boxes, o = i * 6;
        return c.x + e.x > B[o]! + t && c.x - e.x < B[o + 3]! - t && c.y + e.y > B[o + 1]! + t && c.y - e.y < B[o + 4]! - t &&
          c.z + e.z > B[o + 2]! + t && c.z - e.z < B[o + 5]! - t;
      })) return true;
    }
    // No surface crosses the box: inside a closed solid wholly or not at all.
    return solidAt(c) !== null;
  }

  function support(x: number, z: number, fromY: number): number {
    let best = -Infinity;
    for (const m of gather(x, -1e6, z, x, fromY, z)) {
      if (m.kind === "shape") best = Math.max(best, supportShape(m, x, z, fromY));
      else if (m.kind === "heightfield") best = Math.max(best, supportHeightfield(m, x, z, fromY));
      else forBoxes(m, x, -1e6, z, x, fromY, z, i => { const top = m.boxes[i * 6 + 4]!; if (top <= fromY) best = Math.max(best, top); return false; });
    }
    return best;
  }

  function segmentClear(a: Vec3, b: Vec3, ignore: readonly string[] = []): boolean {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const m of gather(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z))) {
      if (ignore.includes(m.id)) continue;
      if (m.kind === "shape") { if (!segmentClearShape(m, a, b)) return false; }
      else if (m.kind === "heightfield") { if (!segmentClearHeightfield(m, a, b)) return false; }
      else if (forBoxes(m, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z), i => {
        if (ignore.length && ignore.includes(m.ids[i]!)) return false;
        const B = m.boxes, o = i * 6;
        return segmentBox(a.x, a.y, a.z, dx, dy, dz, B[o]!, B[o + 1]!, B[o + 2]!, B[o + 3]!, B[o + 4]!, B[o + 5]!);
      })) return false;
    }
    // A segment crossing no surface is wholly inside a solid or outside it.
    const solid = solidAt(a);
    return solid === null || ignore.includes(solid.id);
  }

  /** Deepest contact of the box over every member, or null. */
  function deepest(c: Vec3, e: Vec3, tolerance: number): Separation | null {
    let best: Separation | null = null;
    const keep = (s: Separation | null): void => { if (s && (!best || s.s < best.s)) best = { ...s }; };
    for (const m of gather(c.x - e.x, c.y - e.y, c.z - e.z, c.x + e.x, c.y + e.y, c.z + e.z)) {
      if (m.kind === "shape") keep(deepestShapeContact(m, c.x, c.y, c.z, e.x, e.y, e.z, tolerance, sep));
      else if (m.kind === "heightfield") keep(deepestHeightfieldContact(m, c.x, c.y, c.z, e.x, e.y, e.z, tolerance, sep));
      else forBoxes(m, c.x - e.x, c.y - e.y, c.z - e.z, c.x + e.x, c.y + e.y, c.z + e.z, i => {
        const B = m.boxes, o = i * 6;
        const s = boxBoxSeparation(c.x, c.y, c.z, e.x, e.y, e.z, B[o]!, B[o + 1]!, B[o + 2]!, B[o + 3]!, B[o + 4]!, B[o + 5]!, sep);
        if (s.s < -tolerance) keep(s);
        return false;
      });
    }
    return best;
  }

  const collider: StaticCollider = {
    id, members, bounds: members.length
      ? { min: { x: N[0]!, y: N[1]!, z: N[2]! }, max: { x: N[3]!, y: N[4]!, z: N[5]! } }
      : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
    touches: (minX, minY, minZ, maxX, maxY, maxZ) => gather(minX, minY, minZ, maxX, maxY, maxZ).length > 0,
    sweep, overlaps, support, segmentClear,
    move: (c, e, d, skin = SKIN) => slideMove((cc, rem, out) => sweep(cc, e, rem, skin, out), c, d),
    depenetrate: (c, e, maxDistance) => depenetrate({ sweep, blocked: (p, x) => overlaps(p, x), deepest, inside: p => solidAt(p), surfaceNear }, c, e, maxDistance),
    contact: (c, e, tolerance) => deepest(c, e, tolerance),
    solidAt: p => solidAt(p),
    surfaceNear: (solid, p, reach) => surfaceNear(solid, p, reach),
    crossings(x, y, z, top) {
      let n = 0;
      for (const m of gather(x, y, z, x, top, z)) if (m.kind === "shape") n += crossingsAbove(m, x, y, z, top);
      return n;
    },
    triangles: members.reduce((n, m) => n + (m.kind === "shape" ? m.triangles : 0), 0),
    boxCount: members.reduce((n, m) => n + (m.kind === "boxes" ? m.ids.length : 0), 0),
    samples: members.reduce((n, m) => n + (m.kind === "heightfield" ? m.heights.length : 0), 0),
    bytes: members.reduce((n, m) => n + m.bytes, 0) + raw.byteLength + N.byteLength + L.byteLength,
    sharedBytes: members.reduce((n, m) => n + (m.kind === "shape" ? m.sharedBytes : 0), 0),
  };
  /** The solid shape whose interior holds p, if any. A grouped shape (one
   * closed mesh split for `Uint16` indices) counts parity over its group. */
  const groups = new Map<string, StaticShape[]>();
  for (const m of members) if (m.kind === "shape" && m.group !== null) (groups.get(m.group) ?? groups.set(m.group, []).get(m.group)!).push(m);
  function solidAt(p: Vec3): StaticShape | null {
    // The whole column above p: the surface over it may lie in a member above.
    const ms = gather(p.x, p.y, p.z, p.x, 1e6, p.z).slice();
    for (const m of ms) {
      if (m.kind !== "shape" || m.interior !== "solid") continue;
      if (m.group === null) { if (insideShape(m, p.x, p.y, p.z)) return m; continue; }
      let n = 0;
      for (const g of groups.get(m.group)!) n += crossingsAbove(g, p.x, p.y, p.z, g.bounds.max.y + 1);
      if (n % 2 === 1) return m;
    }
    return null;
  }
  /** Nearest surface point of a solid (its whole group) to p. */
  function surfaceNear(solid: StaticShape, p: Vec3, reach: number): { point: Vec3; distance: number } | null {
    let best: { point: Vec3; distance: number } | null = null;
    for (const g of solid.group === null ? [solid] : groups.get(solid.group)!) {
      const n = nearestSurface(g, p, reach);
      if (n && (!best || n.distance < best.distance)) best = n;
    }
    return best;
  }
  return collider;
}

// --- Slides --------------------------------------------------------------------------

export const SLIDES = 6;
/** How far past the skin a slide leaves each contact, metres. */
export const CLEAR = 1e-5;
/** One swept move with slides (LC's composer semantics): advance to the
 * earliest contact, clip the remaining travel against every contact plane
 * met so far (keeping the first clip that respects all of them), else run
 * along the crease of the last two planes; a third plane stops it.
 * `sweep(centre, delta, out)` reports the earliest contact of the actor's
 * box at that centre. Several worlds share this loop: a collider alone, or
 * a collider plus exterior solids (`world.ts`). */
export function slideMove(sweep: (c: Vec3, d: Vec3, out: SweepHit) => boolean, c: Vec3, d: Vec3): MoveOutcome {
  const best = createHit();
  let px = c.x, py = c.y, pz = c.z, rx = d.x, ry = d.y, rz = d.z, any = false;
  const planes: Vec3[] = [];
  for (let i = 0; i < SLIDES; i++) {
    if (!sweep({ x: px, y: py, z: pz }, { x: rx, y: ry, z: rz }, best)) { px += rx; py += ry; pz += rz; break; }
    any = true;
    // To the contact, then a hair past the skin along its normal: resting
    // at exactly the skin, a slide along a flat mesh would meet the edges of
    // the coplanar triangles beside it as walls (ghost contacts).
    px += rx * best.t + best.nx * CLEAR; py += ry * best.t + best.ny * CLEAR; pz += rz * best.t + best.nz * CLEAR;
    const left = { x: rx * (1 - best.t), y: ry * (1 - best.t), z: rz * (1 - best.t) };
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
        const crease = { x: k.x * s, y: k.y * s, z: k.z * s };
        if (planes.length <= 2 && planes.every(q => crease.x * q.x + crease.y * q.y + crease.z * q.z >= -1e-9)) next = crease;
      }
    }
    if (!next || Math.hypot(next.x, next.y, next.z) < 1e-9) break;
    rx = next.x; ry = next.y; rz = next.z;
    if (planes.length >= 3) break;
  }
  return { x: px, y: py, z: pz, hit: any };
}

// --- Depenetration (ART-07) -----------------------------------------------------------

export interface DepenetrationQueries {
  sweep(c: Vec3, e: Vec3, d: Vec3, skin: number, out: SweepHit): boolean;
  /** Whether a box at this centre is not an acceptable pose. */
  blocked(c: Vec3, e: Vec3): boolean;
  deepest(c: Vec3, e: Vec3, tolerance: number): Separation | null;
  inside(p: Vec3): StaticShape | null;
  surfaceNear(solid: StaticShape, p: Vec3, reach: number): { point: Vec3; distance: number } | null;
}
const DIRECTIONS: readonly Vec3[] = (() => {
  const out: Vec3[] = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const l = Math.hypot(x, y, z);
    out.push({ x: x / l, y: y / l, z: z / l });
  }
  // Straight up first among equals: lifting off a floor is the usual escape.
  return out.sort((a, b) => b.y - a.y);
})();

/** The nearest centre within `maxDistance` that is clear and reachable from
 * c by **continuous escape**: a sweep from c to it that never closes on a
 * contact (the box may leave what it overlaps, never pass through anything
 * else). Candidates are the deepest contact's push-out, then 26 directions
 * at growing radii. A centre inside a closed solid first leaves along the
 * shortest way to its surface, inside the solid, and that distance counts.
 * Returns null when nothing qualifies: the caller rescues instead (a save
 * pose deep in new rock, a box wedged between walls). Never a teleport. */
export function depenetrate(q: DepenetrationQueries, c: Vec3, e: Vec3, maxDistance: number): Depenetration | null {
  if (!q.blocked(c, e)) return { ...c, distance: 0 };
  let from = { ...c }, spent = 0;
  const solid = q.inside(c);
  if (solid) {
    const ext = Math.max(e.x, e.y, e.z);
    const near = q.surfaceNear(solid, c, maxDistance + ext);
    if (!near || near.distance < 1e-9) return null;
    const ux = (near.point.x - c.x) / near.distance, uy = (near.point.y - c.y) / near.distance, uz = (near.point.z - c.z) / near.distance;
    // Past the surface by the box's reach along that way, plus a skin.
    const reach = e.x * Math.abs(ux) + e.y * Math.abs(uy) + e.z * Math.abs(uz) + SKIN;
    from = { x: near.point.x + ux * reach, y: near.point.y + uy * reach, z: near.point.z + uz * reach };
    spent = near.distance + reach;
    if (spent > maxDistance) return null;
    if (!q.blocked(from, e) && !q.inside(from)) return { ...from, distance: spent };
  }
  const hit = createHit();
  const ok = (p: Vec3): boolean => !q.blocked(p, e) && !q.inside(p) &&
    !q.sweep(from, e, { x: p.x - from.x, y: p.y - from.y, z: p.z - from.z }, 0, hit);
  const left = maxDistance - spent;
  // The deepest contact's own push-out, then rings of directions.
  const deep = q.deepest(from, e, OVERLAP_TOLERANCE);
  if (deep) {
    for (const extra of [SKIN, 4 * SKIN, 0.05]) {
      const k = -deep.s + extra;
      if (k > left) break;
      const p = { x: from.x + deep.nx * k, y: from.y + deep.ny * k, z: from.z + deep.nz * k };
      if (ok(p)) return { ...p, distance: spent + k };
    }
  }
  for (let r = 0.02; r <= left + 1e-9; r = r < 0.2 ? r + 0.02 : r * 1.25) {
    for (const u of DIRECTIONS) {
      const p = { x: from.x + u.x * r, y: from.y + u.y * r, z: from.z + u.z * r };
      if (ok(p)) return { ...p, distance: spent + r };
    }
  }
  return null;
}
