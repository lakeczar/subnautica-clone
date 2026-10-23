import type { Aabb, Vec3 } from "../types.js";
import {
  boxOverlapsTriangle, boxTriangleSeparation, segmentTriangle, sweepBoxTriangle, triangleHeightAt, UP,
  type Separation, type SweepHit,
} from "./boxTriangle.js";
import { buildBvh, bvhDepth, isLeaf, leafCount, leafFirst, STACK_DEPTH } from "./bvh.js";

/** A baked static triangle shape: the compact collision format (COL-1).
 *
 * - **Positions** are world xyz as Float32, preferably the art's own buffer
 *   (`shared`, not counted in `bytes`), so art and collision are the same
 *   numbers. A shape holds at most 65,536 vertices; `bake.ts` splits larger
 *   meshes.
 * - **Indices** are `Uint16`, 3 per triangle, in BVH leaf order.
 * - **Nodes** are 16 bytes: bounds quantised to `Uint16` in the shape's box
 *   (rounded outwards, so no triangle escapes its node) and one `Uint32`
 *   link (see `bvh.ts`). LC's chunk collider spends 32 bytes per node, 12
 *   per triangle on indices and copies its positions.
 * - **Interior.** `"solid"` shapes are closed: a point is inside when a
 *   vertical ray up from it crosses an odd number of one part's triangles
 *   (`parts` tells overlapping closed pieces apart; inside any part is
 *   inside). `"none"` shapes are skin: plates, panels, open shells.
 * - **Facing.** `1` when (b - a) x (c - a) points out of the solid, `-1`
 *   when it points in, `0` for two-sided skin. Support reads only surfaces
 *   whose outward side faces up; skin is a floor from either side. */

export type Interior = "none" | "solid";
export type Facing = 1 | -1 | 0;

export interface StaticShape {
  readonly kind: "shape";
  readonly id: string;
  readonly interior: Interior;
  readonly facing: Facing;
  /** Shapes split from one closed mesh share a group: interior parity counts
   * over the whole group (`collider.ts`). Null for a shape that stands alone. */
  readonly group: string | null;
  readonly positions: Float32Array;
  /** `positions` is a view of the art's buffer, owned by the art. */
  readonly shared: boolean;
  readonly indices: Uint16Array;
  /** Closed part per triangle (leaf order), or null for one part. */
  readonly parts: Uint16Array | null;
  readonly partCount: number;
  /** Optional per-triangle flags (leaf order), for the owner's use. */
  readonly flags: Uint8Array | null;
  /** 6 per node: quantised min xyz, max xyz. */
  readonly nodes: Uint16Array;
  readonly links: Uint32Array;
  /** Quantisation: world = origin + q * scale, per axis. */
  readonly origin: Float64Array;
  readonly scale: Float64Array;
  readonly bounds: Aabb;
  readonly triangles: number;
  /** Bytes this shape owns (indices, parts, flags, nodes, links). */
  readonly bytes: number;
  /** Bytes of positions shared with the art (0 when the shape owns them). */
  readonly sharedBytes: number;
}

export interface ShapeOptions {
  readonly interior?: Interior;
  readonly facing?: Facing;
  /** Closed part per input triangle. */
  readonly parts?: ArrayLike<number> | null;
  readonly flags?: ArrayLike<number> | null;
  /** True when `positions` belongs to the art (counted as shared, not owned). */
  readonly shared?: boolean;
  readonly group?: string | null;
  readonly leafSize?: number;
}

export const MAX_SHAPE_VERTICES = 65536;
/** Triangles per leaf. 4 keeps leaf tests cheap; nodes stay half a triangle each. */
export const SHAPE_LEAF = 4;
const Q = 65535;
const PAD = 1e-3;

export function buildShape(id: string, positions: Float32Array, indices: ArrayLike<number>, options: ShapeOptions = {}): StaticShape {
  const nv = positions.length / 3, n = indices.length / 3;
  if (!Number.isInteger(nv) || !Number.isInteger(n)) throw new Error(`shape ${id}: positions or indices not in triples`);
  if (nv > MAX_SHAPE_VERTICES) throw new Error(`shape ${id}: ${nv} vertices exceed ${MAX_SHAPE_VERTICES}; split it (bake.ts)`);
  for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i]!)) throw new Error(`shape ${id}: non-finite position`);
  const boxes = new Float64Array(n * 6);
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let t = 0; t < n; t++) {
    let ax = Infinity, ay = Infinity, az = Infinity, bx = -Infinity, by = -Infinity, bz = -Infinity;
    for (let k = 0; k < 3; k++) {
      const vi = indices[t * 3 + k]!;
      if (!Number.isInteger(vi) || vi < 0 || vi >= nv) throw new Error(`shape ${id}: triangle ${t} index ${vi} out of range`);
      const x = positions[vi * 3]!, y = positions[vi * 3 + 1]!, z = positions[vi * 3 + 2]!;
      ax = Math.min(ax, x); ay = Math.min(ay, y); az = Math.min(az, z); bx = Math.max(bx, x); by = Math.max(by, y); bz = Math.max(bz, z);
    }
    boxes.set([ax, ay, az, bx, by, bz], t * 6);
    mnx = Math.min(mnx, ax); mny = Math.min(mny, ay); mnz = Math.min(mnz, az); mxx = Math.max(mxx, bx); mxy = Math.max(mxy, by); mxz = Math.max(mxz, bz);
  }
  if (!n) { mnx = mny = mnz = mxx = mxy = mxz = 0; }
  const bvh = buildBvh(boxes, options.leafSize ?? SHAPE_LEAF);
  if (bvhDepth(bvh.links) > STACK_DEPTH) throw new Error(`shape ${id}: hierarchy deeper than ${STACK_DEPTH}`);
  const origin = new Float64Array([mnx - PAD, mny - PAD, mnz - PAD]);
  const scale = new Float64Array([(mxx - mnx + 2 * PAD) / Q, (mxy - mny + 2 * PAD) / Q, (mxz - mnz + 2 * PAD) / Q]);
  const nodeCount = bvh.links.length, nodes = new Uint16Array(nodeCount * 6);
  for (let i = 0; i < nodeCount; i++) for (let k = 0; k < 3; k++) {
    const o = origin[k]!, s = scale[k]!;
    let lo = Math.max(0, Math.min(Q, Math.floor((bvh.bounds[i * 6 + k]! - o) / s)));
    while (lo > 0 && o + lo * s > bvh.bounds[i * 6 + k]!) lo--;
    let hi = Math.max(0, Math.min(Q, Math.ceil((bvh.bounds[i * 6 + 3 + k]! - o) / s)));
    while (hi < Q && o + hi * s < bvh.bounds[i * 6 + 3 + k]!) hi++;
    nodes[i * 6 + k] = lo; nodes[i * 6 + 3 + k] = hi;
  }
  const out = new Uint16Array(n * 3);
  const parts = options.parts ? new Uint16Array(n) : null, flags = options.flags ? new Uint8Array(n) : null;
  let partCount = 1;
  for (let i = 0; i < n; i++) {
    const t = bvh.order[i]!;
    out[i * 3] = indices[t * 3]!; out[i * 3 + 1] = indices[t * 3 + 1]!; out[i * 3 + 2] = indices[t * 3 + 2]!;
    if (parts) { const p = options.parts![t]!; parts[i] = p; partCount = Math.max(partCount, p + 1); }
    if (flags) flags[i] = options.flags![t]!;
  }
  const shared = options.shared ?? false;
  const owned = out.byteLength + (parts?.byteLength ?? 0) + (flags?.byteLength ?? 0) + nodes.byteLength + bvh.links.byteLength;
  return {
    kind: "shape", id, interior: options.interior ?? "none", facing: options.facing ?? 0, group: options.group ?? null, positions, shared, indices: out,
    parts, partCount, flags, nodes, links: bvh.links, origin, scale,
    bounds: { min: { x: mnx, y: mny, z: mnz }, max: { x: mxx, y: mxy, z: mxz } }, triangles: n,
    bytes: owned + (shared ? 0 : positions.byteLength), sharedBytes: shared ? positions.byteLength : 0,
  };
}

// --- Traversal --------------------------------------------------------------------

const STACK = new Int32Array(STACK_DEPTH * 2);
let CAND = new Int32Array(1024);
/** Triangles (leaf-order indices) whose leaf boxes meet the box, into the
 * shared candidate buffer; returns the count. Read them before the next call. */
export function candidates(s: StaticShape, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): number {
  const b = s.bounds;
  if (!s.triangles || minX > b.max.x || maxX < b.min.x || minY > b.max.y || maxY < b.min.y || minZ > b.max.z || maxZ < b.min.z) return 0;
  const o = s.origin, k = s.scale, N = s.nodes, L = s.links;
  // The query box in node units, rounded outwards.
  const qx0 = Math.floor((minX - o[0]!) / k[0]!), qy0 = Math.floor((minY - o[1]!) / k[1]!), qz0 = Math.floor((minZ - o[2]!) / k[2]!);
  const qx1 = Math.ceil((maxX - o[0]!) / k[0]!), qy1 = Math.ceil((maxY - o[1]!) / k[1]!), qz1 = Math.ceil((maxZ - o[2]!) / k[2]!);
  let sp = 0, count = 0;
  STACK[sp++] = 0;
  while (sp) {
    const id = STACK[--sp]!, n = id * 6;
    if (N[n]! > qx1 || N[n + 3]! < qx0 || N[n + 1]! > qy1 || N[n + 4]! < qy0 || N[n + 2]! > qz1 || N[n + 5]! < qz0) continue;
    const l = L[id]!;
    if (isLeaf(l)) {
      const first = leafFirst(l), end = first + leafCount(l);
      if (count + 128 > CAND.length) { const g = new Int32Array(CAND.length * 2); g.set(CAND); CAND = g; }
      for (let t = first; t < end; t++) CAND[count++] = t;
      continue;
    }
    STACK[sp++] = l; STACK[sp++] = id + 1;
  }
  return count;
}
export const candidate = (i: number): number => CAND[i]!;

const vA = (s: StaticShape, t: number): number => s.indices[t * 3]! * 3;
const vB = (s: StaticShape, t: number): number => s.indices[t * 3 + 1]! * 3;
const vC = (s: StaticShape, t: number): number => s.indices[t * 3 + 2]! * 3;
const HIT: SweepHit = { t: 0, nx: 0, ny: 0, nz: 0, start: false };

/** Earliest contact of a box (centre c, half extents e) moving by d. */
export function sweepShape(s: StaticShape, cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  dx: number, dy: number, dz: number, skin: number, out: SweepHit): boolean {
  const r = skin + 0.01;
  const n = candidates(s, cx - ex + Math.min(0, dx) - r, cy - ey + Math.min(0, dy) - r, cz - ez + Math.min(0, dz) - r,
    cx + ex + Math.max(0, dx) + r, cy + ey + Math.max(0, dy) + r, cz + ez + Math.max(0, dz) + r);
  let found = false;
  const P = s.positions;
  for (let i = 0; i < n; i++) {
    const t = CAND[i]!;
    if (!sweepBoxTriangle(cx, cy, cz, ex, ey, ez, dx, dy, dz, P, vA(s, t), vB(s, t), vC(s, t), skin, HIT)) continue;
    if (!found || HIT.t < out.t) { out.t = HIT.t; out.nx = HIT.nx; out.ny = HIT.ny; out.nz = HIT.nz; out.start = HIT.start; found = true; }
  }
  return found;
}

/** True when the box crosses a triangle by more than `tolerance`. With no
 * crossing, a closed part holds the box wholly or not at all, so the
 * collider then reads the interior at the centre (`insideShape`). */
export function crossesShape(s: StaticShape, cx: number, cy: number, cz: number, ex: number, ey: number, ez: number, tolerance: number): boolean {
  const n = candidates(s, cx - ex, cy - ey, cz - ez, cx + ex, cy + ey, cz + ez);
  const P = s.positions;
  for (let i = 0; i < n; i++) {
    const t = CAND[i]!;
    if (boxOverlapsTriangle(cx, cy, cz, ex, ey, ez, P, vA(s, t), vB(s, t), vC(s, t), tolerance)) return true;
  }
  return false;
}

/** The deepest triangle overlap of the box (most negative separation), or
 * null when no triangle overlaps it by more than `tolerance`. */
export function deepestShapeContact(s: StaticShape, cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  tolerance: number, out: Separation): Separation | null {
  const n = candidates(s, cx - ex, cy - ey, cz - ez, cx + ex, cy + ey, cz + ez);
  const P = s.positions;
  let best = -tolerance, found = false, nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const t = CAND[i]!;
    boxTriangleSeparation(cx, cy, cz, ex, ey, ez, P, vA(s, t), vB(s, t), vC(s, t), out);
    if (out.s < best) { best = out.s; nx = out.nx; ny = out.ny; nz = out.nz; found = true; }
  }
  if (!found) return null;
  out.s = best; out.nx = nx; out.ny = ny; out.nz = nz;
  return out;
}

// A hair off any lattice, so a vertical ray never runs down a shared edge.
const JX = 1.37e-7, JZ = 2.91e-7;
let PARITY = new Uint8Array(16);
/** Whether the point is inside a closed part of this shape alone (solid
 * shapes; a grouped shape's interior needs its whole group, see `collider.ts`). */
export function insideShape(s: StaticShape, x: number, y: number, z: number): boolean {
  if (s.interior !== "solid") return false;
  const b = s.bounds;
  if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z || y > b.max.y) return false;
  const px = x + JX, pz = z + JZ;
  const n = candidates(s, px, y, pz, px, b.max.y + 1, pz);
  if (PARITY.length < s.partCount) PARITY = new Uint8Array(s.partCount * 2);
  const P = s.positions, parts = s.parts;
  let odd = 0;
  for (let i = 0; i < n; i++) {
    const t = CAND[i]!, h = triangleHeightAt(P, vA(s, t), vB(s, t), vC(s, t), px, pz);
    if (!(h >= y)) continue;
    if (!parts) { odd ^= 1; continue; }
    const p = parts[t]!;
    PARITY[p] = PARITY[p]! ^ 1;
  }
  if (!parts) return odd === 1;
  let inside = false;
  for (let p = 0; p < s.partCount; p++) { if (PARITY[p]) inside = true; PARITY[p] = 0; }
  return inside;
}

/** Surfaces crossed by the vertical segment from y up to `top` at (x, z)
 * (jittered off the lattice). Owners with their own interior rule (a cave
 * biome's cap) count parity with this. */
export function crossingsAbove(s: StaticShape, x: number, y: number, z: number, top: number): number {
  const px = x + JX, pz = z + JZ;
  const n = candidates(s, px, y, pz, px, top, pz);
  const P = s.positions;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const t = CAND[i]!, h = triangleHeightAt(P, vA(s, t), vB(s, t), vC(s, t), px, pz);
    if (h >= y && h <= top) count++;
  }
  return count;
}

/** Highest surface at (x, z) at or below `fromY` that an actor can rest on
 * (outward side up; either side for skin), or -Infinity. */
export function supportShape(s: StaticShape, x: number, z: number, fromY: number): number {
  const n = candidates(s, x, s.bounds.min.y - 1, z, x, fromY, z);
  const P = s.positions, f = s.facing;
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    const t = CAND[i]!, h = triangleHeightAt(P, vA(s, t), vB(s, t), vC(s, t), x, z);
    if (!(h <= fromY) || h <= best) continue;
    if (f !== 0 && UP.y * f <= 0) continue;
    best = h;
  }
  return best;
}

/** True when segment a -> b crosses no triangle (interiors are the collider's). */
export function segmentClearShape(s: StaticShape, a: Vec3, b: Vec3): boolean {
  const bb = s.bounds;
  if (Math.max(a.x, b.x) < bb.min.x || Math.min(a.x, b.x) > bb.max.x || Math.max(a.y, b.y) < bb.min.y || Math.min(a.y, b.y) > bb.max.y ||
    Math.max(a.z, b.z) < bb.min.z || Math.min(a.z, b.z) > bb.max.z || !s.triangles) return true;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const ix = dx !== 0 ? 1 / dx : Infinity, iy = dy !== 0 ? 1 / dy : Infinity, iz = dz !== 0 ? 1 / dz : Infinity;
  const o = s.origin, k = s.scale, N = s.nodes, L = s.links, P = s.positions;
  let sp = 0;
  STACK[sp++] = 0;
  while (sp) {
    const id = STACK[--sp]!, n = id * 6;
    // Slab test of the segment against the dequantised node box.
    let t0 = 0, t1 = 1, ok = true;
    for (let q = 0; q < 3 && ok; q++) {
      const lo = o[q]! + N[n + q]! * k[q]!, hi = o[q]! + N[n + 3 + q]! * k[q]!;
      const st = q === 0 ? a.x : q === 1 ? a.y : a.z, iv = q === 0 ? ix : q === 1 ? iy : iz;
      if (iv === Infinity) { if (st < lo || st > hi) ok = false; continue; }
      let u = (lo - st) * iv, w = (hi - st) * iv;
      if (u > w) { const x = u; u = w; w = x; }
      if (u > t0) t0 = u;
      if (w < t1) t1 = w;
      if (t0 > t1) ok = false;
    }
    if (!ok) continue;
    const l = L[id]!;
    if (isLeaf(l)) {
      for (let t = leafFirst(l), e = t + leafCount(l); t < e; t++)
        if (segmentTriangle(a.x, a.y, a.z, dx, dy, dz, P, vA(s, t), vB(s, t), vC(s, t)) >= 0) return false;
      continue;
    }
    STACK[sp++] = l; STACK[sp++] = id + 1;
  }
  return true;
}

/** Nearest point of the shape's surface to p, by brute force over the
 * triangles within `reach` (for depenetration out of a solid's interior). */
export function nearestSurface(s: StaticShape, p: Vec3, reach: number): { point: Vec3; distance: number } | null {
  const n = candidates(s, p.x - reach, p.y - reach, p.z - reach, p.x + reach, p.y + reach, p.z + reach);
  const P = s.positions;
  let best: { point: Vec3; distance: number } | null = null;
  for (let i = 0; i < n; i++) {
    const t = CAND[i]!, q = closestOnTriangle(p, P, vA(s, t), vB(s, t), vC(s, t));
    const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    if (!best || d < best.distance) best = { point: q, distance: d };
  }
  return best;
}

/** Closest point of triangle (a, b, c) to p (Ericson, RTCD 5.1.5). */
export function closestOnTriangle(p: Vec3, P: Float32Array | Float64Array, ia: number, ib: number, ic: number): Vec3 {
  const ax = P[ia]!, ay = P[ia + 1]!, az = P[ia + 2]!;
  const abx = P[ib]! - ax, aby = P[ib + 1]! - ay, abz = P[ib + 2]! - az, acx = P[ic]! - ax, acy = P[ic + 1]! - ay, acz = P[ic + 2]! - az;
  const at = (u: number, v: number): Vec3 => ({ x: ax + abx * u + acx * v, y: ay + aby * u + acy * v, z: az + abz * u + acz * v });
  const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
  if (nx * nx + ny * ny + nz * nz < 1e-24) {
    // Degenerate (a sliver from clipping or a repeated vertex): its edges.
    let best = at(0, 0), bd = Infinity;
    for (const [u0, v0, u1, v1] of [[0, 0, 1, 0], [0, 0, 0, 1], [1, 0, 0, 1]] as const) {
      const q0 = at(u0, v0), q1 = at(u1, v1), dx = q1.x - q0.x, dy = q1.y - q0.y, dz = q1.z - q0.z, l2 = dx * dx + dy * dy + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - q0.x) * dx + (p.y - q0.y) * dy + (p.z - q0.z) * dz) / l2)) : 0;
      const q = { x: q0.x + dx * t, y: q0.y + dy * t, z: q0.z + dz * t }, d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  const apx = p.x - ax, apy = p.y - ay, apz = p.z - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bpx = p.x - P[ib]!, bpy = p.y - P[ib + 1]!, bpz = p.z - P[ib + 2]!;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cpx = p.x - P[ic]!, cpy = p.y - P[ic + 1]!, cpz = p.z - P[ic + 2]!;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return at(1 - w, w); }
  const den = 1 / (va + vb + vc);
  return at(vb * den, vc * den);
}
