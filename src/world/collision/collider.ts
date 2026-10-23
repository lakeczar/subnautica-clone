import type { Aabb, Vec3 } from "../types.js";
import {
  boxOverlapsTriangle, boxTriangleSeparation, segmentTriangle,
  boxBoxSeparation, createHit, createSeparation, mergeHit, segmentBox, sweepBoxBox, type Separation, type SweepHit,
} from "./boxTriangle.js";
import { buildBvh, isLeaf, leafCount, leafFirst } from "./bvh.js";
import {
  deepestHeightfieldContact, heightfieldPushes, overlapsHeightfield, segmentClearHeightfield, supportHeightfield, sweepHeightfield,
  type StaticHeightfield,
} from "./heightfield.js";
import {
  candidate, candidates, crossesShape, crossingsAbove, deepestShapeContact, insideShape, nearestSurface, partsAt,
  segmentClearShape, supportShape, sweepShape, triangleNormal, triangleVertex,
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
  // Recovery's parts (`depenetrate`), for worlds that compose this collider.
  /** `sweep`, ignoring only the triangles of the `exempt` parts. */
  sweepExcept(c: Vec3, e: Vec3, d: Vec3, skin: number, out: SweepHit, exempt?: readonly PartRef[]): boolean;
  /** The closed parts whose interior holds p (watertight parity, per part and per split group). */
  containing(p: Vec3): PartRef[];
  /** Escape candidates (see `DepenetrationQueries.candidates`). */
  escapeCandidates(c: Vec3, e: Vec3, inside: readonly PartRef[], reach: number, push: (x: number, y: number, z: number, distance: number) => void): void;
  /** First parameter in (0, 1] where segment a -> b crosses the part's surface, or Infinity. */
  leaves(part: PartRef, a: Vec3, b: Vec3): number;
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
  const hasSolids = members.some(m => m.kind === "shape" && m.interior === "solid");
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

  /** One member's earliest contact, into `hit` (triangles `skip` rejects left out). */
  function sweepMember(m: StaticMember, c: Vec3, e: Vec3, d: Vec3, skin: number, skip?: (t: number) => boolean): boolean {
    if (m.kind === "shape") return sweepShape(m, c.x, c.y, c.z, e.x, e.y, e.z, d.x, d.y, d.z, skin, hit, skip);
    if (m.kind === "heightfield") return sweepHeightfield(m, c.x, c.y, c.z, e.x, e.y, e.z, d.x, d.y, d.z, skin, hit);
    const r = skin + 0.02, one = createHit();
    let found = false;
    forBoxes(m, c.x - e.x + Math.min(0, d.x) - r, c.y - e.y + Math.min(0, d.y) - r, c.z - e.z + Math.min(0, d.z) - r,
      c.x + e.x + Math.max(0, d.x) + r, c.y + e.y + Math.max(0, d.y) + r, c.z + e.z + Math.max(0, d.z) + r, i => {
        const B = m.boxes, o = i * 6;
        if (sweepBoxBox(c.x, c.y, c.z, e.x, e.y, e.z, d.x, d.y, d.z, B[o]!, B[o + 1]!, B[o + 2]!, B[o + 3]!, B[o + 4]!, B[o + 5]!, skin, one))
          found = mergeHit(one, hit, found, d.x, d.y, d.z);
        return false;
      });
    return found;
  }
  const sweptGather = (c: Vec3, e: Vec3, d: Vec3, skin: number): StaticMember[] => {
    const r = skin + 0.02;
    return gather(c.x - e.x + Math.min(0, d.x) - r, c.y - e.y + Math.min(0, d.y) - r, c.z - e.z + Math.min(0, d.z) - r,
      c.x + e.x + Math.max(0, d.x) + r, c.y + e.y + Math.max(0, d.y) + r, c.z + e.z + Math.max(0, d.z) + r);
  };
  function sweep(c: Vec3, e: Vec3, d: Vec3, skin: number, out: SweepHit): boolean {
    let found = false;
    for (const m of sweptGather(c, e, d, skin)) if (sweepMember(m, c, e, d, skin)) found = mergeHit(hit, out, found, d.x, d.y, d.z);
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
    return hasSolids && solidAt(c) !== null;
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
    const solid = hasSolids ? solidAt(a) : null;
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
    depenetrate: (c, e, maxDistance) => depenetrate({ sweep: sweepExcept, blocked: (p, x) => overlaps(p, x), containing, candidates: escapeCandidates, leaves }, c, e, maxDistance),
    sweepExcept, containing, escapeCandidates, leaves,
    contact: (c, e, tolerance) => deepest(c, e, tolerance),
    solidAt: p => hasSolids ? solidAt(p) : null,
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

  /** `sweep` with the triangles of the exempt parts left out. */
  function sweepExcept(c: Vec3, e: Vec3, d: Vec3, skin: number, out: SweepHit, exempt: readonly PartRef[] = []): boolean {
    if (!exempt.length) return sweep(c, e, d, skin, out);
    let found = false;
    for (const m of sweptGather(c, e, d, skin).slice()) {
      const refs = m.kind === "shape" ? exempt.filter(x => x.shapes.includes(m)) : [];
      if (refs.some(x => x.part === null)) continue;
      const skip = refs.length && m.kind === "shape" ? ((parts, set) => (t: number) => set.has(parts ? parts[t]! : 0))(m.parts, new Set(refs.map(x => x.part!))) : undefined;
      if (sweepMember(m, c, e, d, skin, skip)) found = mergeHit(hit, out, found, d.x, d.y, d.z);
    }
    return found;
  }

  /** Closed parts holding p: per part of standalone solid shapes, per group for split meshes. */
  function containing(p: Vec3): PartRef[] {
    if (!hasSolids) return [];
    const out: PartRef[] = [], done = new Set<string>(), parts: number[] = [];
    for (const m of gather(p.x, p.y, p.z, p.x, 1e6, p.z).slice()) {
      if (m.kind !== "shape" || m.interior !== "solid") continue;
      if (m.group === null) {
        for (const k of partsAt(m, p.x, p.y, p.z, parts)) out.push({ key: `${m.id}#${k}`, shapes: [m], part: m.parts ? k : null });
        continue;
      }
      if (done.has(m.group)) continue;
      done.add(m.group);
      const g = groups.get(m.group)!;
      let n = 0;
      for (const s of g) n += crossingsAbove(s, p.x, p.y, p.z, s.bounds.max.y + 1);
      if (n % 2 === 1) out.push({ key: `group:${m.group}`, shapes: g, part: null });
    }
    return out;
  }

  const N3 = { x: 0, y: 0, z: 0 };
  const supportOf = (e: Vec3, n: Vec3): number => e.x * Math.abs(n.x) + e.y * Math.abs(n.y) + e.z * Math.abs(n.z);
  function escapeCandidates(c: Vec3, e: Vec3, inside: readonly PartRef[], reach: number,
    push: (x: number, y: number, z: number, distance: number) => void): void {
    const along = (n: Vec3, d: number): void => push(c.x + n.x * d, c.y + n.y * d, c.z + n.z * d, d);
    // Exits through each face of the parts holding the centre: past the
    // face's plane by the box's reach along its outward normal.
    const ext = Math.max(e.x, e.y, e.z);
    for (const ref of inside) for (const s of ref.shapes) {
      const n = candidates(s, c.x - reach - ext, c.y - reach - ext, c.z - reach - ext, c.x + reach + ext, c.y + reach + ext, c.z + reach + ext);
      const ts = Array.from({ length: n }, (_, i) => candidate(i));
      for (const t of ts) {
        if (ref.part !== null && s.parts && s.parts[t] !== ref.part) continue;
        if (!triangleNormal(s, t, N3)) continue;
        const v = triangleVertex(s, t), P = s.positions;
        const plane = N3.x * (P[v]! - c.x) + N3.y * (P[v + 1]! - c.y) + N3.z * (P[v + 2]! - c.z);
        if (plane >= 0) along(N3, plane + supportOf(e, N3) + SKIN);
      }
    }
    // Push-outs from what the box overlaps.
    for (const m of gather(c.x - e.x, c.y - e.y, c.z - e.z, c.x + e.x, c.y + e.y, c.z + e.z).slice()) {
      if (m.kind === "heightfield") { heightfieldPushes(m, c.x, c.y, c.z, e.x, e.y, e.z, SKIN, push); continue; }
      if (m.kind === "boxes") {
        forBoxes(m, c.x - e.x, c.y - e.y, c.z - e.z, c.x + e.x, c.y + e.y, c.z + e.z, i => {
          const B = m.boxes, o = i * 6;
          boxPushes(c, e, B[o]!, B[o + 1]!, B[o + 2]!, B[o + 3]!, B[o + 4]!, B[o + 5]!, push);
          return false;
        });
        continue;
      }
      const n = candidates(m, c.x - e.x, c.y - e.y, c.z - e.z, c.x + e.x, c.y + e.y, c.z + e.z);
      const ts = Array.from({ length: n }, (_, i) => candidate(i)), P = m.positions;
      for (const t of ts) {
        const a = m.indices[t * 3]! * 3, b = m.indices[t * 3 + 1]! * 3, d = m.indices[t * 3 + 2]! * 3;
        if (!boxOverlapsTriangle(c.x, c.y, c.z, e.x, e.y, e.z, P, a, b, d, OVERLAP_TOLERANCE)) continue;
        // Its best separating axis, and clear of its plane (out of a
        // solid; either way for skin).
        boxTriangleSeparation(c.x, c.y, c.z, e.x, e.y, e.z, P, a, b, d, sep);
        along({ x: sep.nx, y: sep.ny, z: sep.nz }, -sep.s + SKIN);
        if (!triangleNormal(m, t, N3)) continue;
        const plane = N3.x * (P[a]! - c.x) + N3.y * (P[a + 1]! - c.y) + N3.z * (P[a + 2]! - c.z), sup = supportOf(e, N3) + SKIN;
        along(N3, plane + sup);
        if (m.facing === 0) along({ x: -N3.x, y: -N3.y, z: -N3.z }, -plane + sup);
      }
    }
  }

  function leaves(part: PartRef, a: Vec3, b: Vec3): number {
    let best = Infinity;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const s of part.shapes) {
      const n = candidates(s, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
      for (let i = 0; i < n; i++) {
        const t = candidate(i);
        if (part.part !== null && s.parts && s.parts[t] !== part.part) continue;
        const u = segmentTriangle(a.x, a.y, a.z, dx, dy, dz, s.positions, s.indices[t * 3]! * 3, s.indices[t * 3 + 1]! * 3, s.indices[t * 3 + 2]! * 3);
        if (u > 0 && u < best) best = u;
      }
    }
    return best;
  }
  return collider;
}

/** The six push-outs of a box (centre c, half extents e) from a box obstacle. */
export function boxPushes(c: Vec3, e: Vec3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  push: (x: number, y: number, z: number, distance: number) => void): void {
  const s = SKIN;
  push(x0 - e.x - s, c.y, c.z, c.x - (x0 - e.x - s)); push(x1 + e.x + s, c.y, c.z, x1 + e.x + s - c.x);
  push(c.x, y0 - e.y - s, c.z, c.y - (y0 - e.y - s)); push(c.x, y1 + e.y + s, c.z, y1 + e.y + s - c.y);
  push(c.x, c.y, z0 - e.z - s, c.z - (z0 - e.z - s)); push(c.x, c.y, z1 + e.z + s, z1 + e.z + s - c.z);
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

/** One closed part of the collider: the triangles of part `part` of the
 * shapes (every triangle when `part` is null: a single-part shape, or a
 * closed mesh split into a group). */
export interface PartRef { readonly key: string; readonly shapes: readonly StaticShape[]; readonly part: number | null }

export interface DepenetrationQueries {
  /** Earliest contact, ignoring only the triangles of the `exempt` parts. */
  sweep(c: Vec3, e: Vec3, d: Vec3, skin: number, out: SweepHit, exempt?: readonly PartRef[]): boolean;
  /** Whether a box at this centre is not an acceptable pose. */
  blocked(c: Vec3, e: Vec3): boolean;
  /** The closed parts whose interior holds p. */
  containing(p: Vec3): PartRef[];
  /** Candidate centres within `reach` of c: the exits through each face of
   * the `inside` parts, and push-outs from every surface, box and wall the
   * box overlaps. `push(x, y, z, distance)` each. */
  candidates(c: Vec3, e: Vec3, inside: readonly PartRef[], reach: number, push: (x: number, y: number, z: number, distance: number) => void): void;
  /** The first parameter in (0, 1] at which segment a -> b crosses the part's surface, or Infinity. */
  leaves(part: PartRef, a: Vec3, b: Vec3): number;
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

/** The shortest **validated** escape within `maxDistance`: a centre where
 * the box is a legal pose, reached from c by **continuous escape**.
 * - **Candidates**, tried shortest first: the exit through each face of every
 *   closed part holding the centre (the face plane's distance plus the box's
 *   reach along its normal: exact for leaving a convex part through a face),
 *   push-outs from every overlapped surface, box and heightfield wall, and 26
 *   directions at growing radii.
 * - **Validation.** The endpoint must be a legal pose. The way there is swept:
 *   while the centre is still inside the parts that held it, against
 *   everything except those parts; from where it leaves them, against
 *   everything. A contact the box starts in may only separate (sweeps block
 *   closing start contacts), and nothing else may be met on the way. So the
 *   box leaves what it was caught in and never passes through anything else.
 *
 * Best-effort, not a proof of the nearest pose: a shorter escape off every
 * candidate is not found. Returns null when no candidate validates: the
 * caller rescues (a save pose deep in new rock, a box wedged between walls).
 * Never a teleport. */
export function depenetrate(q: DepenetrationQueries, c: Vec3, e: Vec3, maxDistance: number): Depenetration | null {
  if (!q.blocked(c, e)) return { ...c, distance: 0 };
  const inside = q.containing(c), hit = createHit();
  const legal = (p: Vec3): boolean => {
    if (q.blocked(p, e)) return false;
    if (!inside.length) return !q.sweep(c, e, { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }, 0, hit);
    // Where the centre has left every part that held it.
    let t = 0;
    for (const part of inside) { const u = q.leaves(part, c, p); if (!(u <= 1)) return false; t = Math.max(t, u); }
    const m = { x: c.x + (p.x - c.x) * t, y: c.y + (p.y - c.y) * t, z: c.z + (p.z - c.z) * t };
    return !q.sweep(c, e, { x: m.x - c.x, y: m.y - c.y, z: m.z - c.z }, 0, hit, inside) &&
      !q.sweep(m, e, { x: p.x - m.x, y: p.y - m.y, z: p.z - m.z }, 0, hit);
  };
  const found: { x: number; y: number; z: number; distance: number }[] = [], seen = new Set<string>();
  const push = (x: number, y: number, z: number, distance: number): void => {
    if (!(distance > 0 && distance <= maxDistance)) return;
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    if (!seen.has(key)) { seen.add(key); found.push({ x, y, z, distance }); }
  };
  q.candidates(c, e, inside, maxDistance, push);
  for (let r = 0.02; r <= maxDistance + 1e-9; r = r < 0.2 ? r + 0.02 : r * 1.25)
    for (const u of DIRECTIONS) push(c.x + u.x * r, c.y + u.y * r, c.z + u.z * r, r);
  // Shortest first; the sort is stable, so ties keep candidates' order.
  found.sort((a, b) => a.distance - b.distance);
  for (const p of found) if (legal(p)) return { x: p.x, y: p.y, z: p.z, distance: p.distance };
  return null;
}
