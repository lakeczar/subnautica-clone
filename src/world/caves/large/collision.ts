import type { Aabb, Vec3 } from "../../types.js";
import { capAt, collarAt, owns, type CaveOwnership } from "./ownership.js";

/** Cave-biome collision: the fine chunk meshes as triangles (Babylon-free).
 *
 * Each chunk's fine mesh (plus its collision-only seabed band) becomes a
 * `ChunkCollider` with its own BVH. The store keeps every collider resident
 * for as long as the cave is active; art residency never touches it.
 *
 * Actors are the world's fixed-axis boxes (`actorBox`). A swept box meets a
 * triangle at the first time every one of the 13 separating axes overlaps
 * (box faces, triangle normal, box-edge x triangle-edge), with the box
 * grown by a `skin` sphere so an accepted pose keeps that gap. A box that
 * starts within the skin is blocked only while its best separation is
 * closing: separation under translation is convex, so non-closing travel
 * can never deepen a contact, and tangential slides run free.
 *
 * Containment is exact for collision: a box is clear when it crosses no
 * triangle and its centre is in water, read by the parity of a vertical ray
 * to the owned top (the cap is rock, a collar top is water). */

// --- Colliders and BVH -----------------------------------------------------------

export interface ChunkCollider {
  readonly key: string;
  readonly index: number;
  /** World xyz per vertex (the art's own Float32 positions, then band). */
  readonly positions: Float32Array;
  /** Vertex indices, 3 per triangle, in BVH leaf order. */
  readonly tris: Uint32Array;
  /** Per triangle: 1 for the collision-only band (exterior seabed). */
  readonly band: Uint8Array;
  /** 6 floats per BVH node: min xyz, max xyz. */
  readonly nodes: Float32Array;
  /** 2 ints per node: internal (left, right) or leaf (-1 - first, count). */
  readonly meta: Int32Array;
  readonly bounds: Aabb;
  readonly bytes: number;
}

const LEAF = 4;

export function buildCollider(key: string, index: number, art: { positions: Float32Array; indices: Uint32Array },
  band: { positions: Float32Array; indices: Uint32Array } | null): ChunkCollider {
  const nArt = art.indices.length / 3, nBand = band ? band.indices.length / 3 : 0, n = nArt + nBand;
  const vArt = art.positions.length / 3;
  const positions = new Float32Array(art.positions.length + (band?.positions.length ?? 0));
  positions.set(art.positions);
  if (band) positions.set(band.positions, art.positions.length);
  const raw = new Uint32Array(n * 3);
  raw.set(art.indices);
  if (band) for (let i = 0; i < band.indices.length; i++) raw[art.indices.length + i] = band.indices[i]! + vArt;
  const cent = new Float64Array(n * 3), tb = new Float64Array(n * 6);
  for (let t = 0; t < n; t++) {
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let k = 0; k < 3; k++) {
      const v = raw[t * 3 + k]! * 3, x = positions[v]!, y = positions[v + 1]!, z = positions[v + 2]!;
      mnx = Math.min(mnx, x); mny = Math.min(mny, y); mnz = Math.min(mnz, z); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); mxz = Math.max(mxz, z);
    }
    tb[t * 6] = mnx; tb[t * 6 + 1] = mny; tb[t * 6 + 2] = mnz; tb[t * 6 + 3] = mxx; tb[t * 6 + 4] = mxy; tb[t * 6 + 5] = mxz;
    cent[t * 3] = (mnx + mxx) / 2; cent[t * 3 + 1] = (mny + mxy) / 2; cent[t * 3 + 2] = (mnz + mxz) / 2;
  }
  const order = Array.from({ length: n }, (_, i) => i);
  const nodes: number[] = [], meta: number[] = [];
  const build = (start: number, end: number): number => {
    const id = meta.length / 2;
    meta.push(0, 0);
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let i = start; i < end; i++) {
      const t = order[i]! * 6;
      mnx = Math.min(mnx, tb[t]!); mny = Math.min(mny, tb[t + 1]!); mnz = Math.min(mnz, tb[t + 2]!);
      mxx = Math.max(mxx, tb[t + 3]!); mxy = Math.max(mxy, tb[t + 4]!); mxz = Math.max(mxz, tb[t + 5]!);
    }
    nodes.push(mnx, mny, mnz, mxx, mxy, mxz);
    if (end - start <= LEAF) { meta[id * 2] = -1 - start; meta[id * 2 + 1] = end - start; return id; }
    const ex = mxx - mnx, ey = mxy - mny, ez = mxz - mnz, axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const part = order.slice(start, end).sort((a, b) => cent[a * 3 + axis]! - cent[b * 3 + axis]! || a - b);
    for (let i = 0; i < part.length; i++) order[start + i] = part[i]!;
    const mid = (start + end) >> 1;
    const left = build(start, mid), right = build(mid, end);
    meta[id * 2] = left; meta[id * 2 + 1] = right;
    return id;
  };
  if (n) build(0, n);
  const tris = new Uint32Array(n * 3), bandFlags = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = order[i]!;
    tris[i * 3] = raw[t * 3]!; tris[i * 3 + 1] = raw[t * 3 + 1]!; tris[i * 3 + 2] = raw[t * 3 + 2]!;
    bandFlags[i] = t >= nArt ? 1 : 0;
  }
  const nodeArray = new Float32Array(nodes);
  // Float32 node bounds round outwards so no triangle escapes its box.
  for (let i = 0; i < nodeArray.length; i += 6) for (let k = 0; k < 3; k++) {
    nodeArray[i + k] = Math.fround(nodeArray[i + k]!) > nodes[i + k]! ? nodeArray[i + k]! - 1e-4 : nodeArray[i + k]!;
    nodeArray[i + 3 + k] = Math.fround(nodeArray[i + 3 + k]!) < nodes[i + 3 + k]! ? nodeArray[i + 3 + k]! + 1e-4 : nodeArray[i + 3 + k]!;
  }
  const bounds: Aabb = n ? { min: { x: nodes[0]!, y: nodes[1]!, z: nodes[2]! }, max: { x: nodes[3]!, y: nodes[4]!, z: nodes[5]! } }
    : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  const metaArray = new Int32Array(meta);
  return { key, index, positions, tris, band: bandFlags, nodes: nodeArray, meta: metaArray, bounds,
    bytes: positions.byteLength + tris.byteLength + bandFlags.byteLength + nodeArray.byteLength + metaArray.byteLength };
}

/** Calls `visit(triangle)` for every triangle whose leaf box meets `box`. */
function forTriangles(c: ChunkCollider, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
  visit: (t: number) => void): void {
  if (!c.meta.length) return;
  const N = c.nodes, M = c.meta, stack = STACK;
  let sp = 0;
  stack[sp++] = 0;
  while (sp) {
    const id = stack[--sp]!, o = id * 6;
    if (N[o]! > maxX || N[o + 3]! < minX || N[o + 1]! > maxY || N[o + 4]! < minY || N[o + 2]! > maxZ || N[o + 5]! < minZ) continue;
    const a = M[id * 2]!, b = M[id * 2 + 1]!;
    if (a < 0) { for (let t = -1 - a, e = -1 - a + b; t < e; t++) visit(t); continue; }
    stack[sp++] = a; stack[sp++] = b;
  }
}
const STACK = new Int32Array(256);

// --- Store -----------------------------------------------------------------------

export interface CaveCollision {
  readonly id: string;
  readonly ownership: CaveOwnership;
  readonly origin: Vec3;
  readonly chunk: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** Collision-only seabed band round collars, metres. */
  readonly band: number;
  readonly colliders: (ChunkCollider | undefined)[];
  /** Chunk indices that must hold a collider before the cave is complete. */
  readonly expected: readonly number[];
}
export function createCollision(id: string, ownership: CaveOwnership, chunk: number, band: number, expected: readonly number[]): CaveCollision {
  const d = ownership.domain;
  const nx = Math.round((d.max.x - d.min.x) / chunk), ny = Math.round((d.max.y - d.min.y) / chunk), nz = Math.round((d.max.z - d.min.z) / chunk);
  return { id, ownership, origin: d.min, chunk, nx, ny, nz, band, colliders: new Array(nx * ny * nz), expected };
}
export const chunkIndex = (c: CaveCollision, cx: number, cy: number, cz: number): number => cx + c.nx * (cy + c.ny * cz);
export function collisionComplete(c: CaveCollision): boolean { return c.expected.every(i => c.colliders[i] !== undefined); }
export function collisionBytes(c: CaveCollision): number {
  let n = c.ownership.ground.byteLength;
  for (const k of c.colliders) if (k) n += k.bytes;
  return n;
}

/** Colliders whose chunk box (grown by 1 m: border vertices overhang) meets the box. */
function collidersIn(c: CaveCollision, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: ChunkCollider[]): void {
  out.length = 0;
  const o = c.origin, C = c.chunk;
  const x0 = Math.max(0, Math.floor((minX - 1 - o.x) / C)), x1 = Math.min(c.nx - 1, Math.floor((maxX + 1 - o.x) / C));
  const y0 = Math.max(0, Math.floor((minY - 1 - o.y) / C)), y1 = Math.min(c.ny - 1, Math.floor((maxY + 1 - o.y) / C));
  const z0 = Math.max(0, Math.floor((minZ - 1 - o.z) / C)), z1 = Math.min(c.nz - 1, Math.floor((maxZ + 1 - o.z) / C));
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = c.colliders[x + c.nx * (y + c.ny * z)];
    if (k) out.push(k);
  }
}

// --- Candidate gathering ---------------------------------------------------------

/** Triangles near a box, as world-space float64 corners (9 per triangle). */
export interface Candidates { count: number; v: Float64Array; band: Uint8Array }
export function createCandidates(): Candidates { return { count: 0, v: new Float64Array(9 * 512), band: new Uint8Array(512) }; }
const COLLIDERS: ChunkCollider[] = [];
export function gatherTriangles(c: CaveCollision, box: Aabb, out: Candidates): Candidates {
  out.count = 0;
  collidersIn(c, box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z, COLLIDERS);
  for (const k of COLLIDERS) {
    const P = k.positions, T = k.tris;
    forTriangles(k, box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z, t => {
      if (out.count * 9 >= out.v.length) {
        const v = new Float64Array(out.v.length * 2); v.set(out.v); out.v = v;
        const b = new Uint8Array(out.band.length * 2); b.set(out.band); out.band = b;
      }
      const o = out.count * 9;
      for (let q = 0; q < 3; q++) {
        const p = T[t * 3 + q]! * 3;
        out.v[o + q * 3] = P[p]!; out.v[o + q * 3 + 1] = P[p + 1]!; out.v[o + q * 3 + 2] = P[p + 2]!;
      }
      out.band[out.count] = k.band[t]!;
      out.count++;
    });
  }
  return out;
}

// --- Swept box against a triangle -------------------------------------------------

/** Result of a sweep: `t` in [0, 1] of the delta, the contact normal (unit,
 * from the obstacle towards the box) and whether it was a closing contact
 * that started within the skin (`t` = 0). */
export interface SweepHit { t: number; nx: number; ny: number; nz: number; start: boolean }

let tEnter = 0, tExit = 0, eNx = 0, eNy = 0, eNz = 0;
let sBest = 0, sDer = 0, sNx = 0, sNy = 0, sNz = 0;
let hx = 0, hy = 0, hz = 0, mdx = 0, mdy = 0, mdz = 0, skinR = 0;
let p0x = 0, p0y = 0, p0z = 0, p1x = 0, p1y = 0, p1z = 0, p2x = 0, p2y = 0, p2z = 0;

/** One separating axis; false when the box and triangle never overlap on it. */
function axis(lx: number, ly: number, lz: number): boolean {
  const len2 = lx * lx + ly * ly + lz * lz;
  if (len2 < 1e-18) return true;
  const len = Math.sqrt(len2);
  const r = hx * Math.abs(lx) + hy * Math.abs(ly) + hz * Math.abs(lz) + skinR * len;
  const a = p0x * lx + p0y * ly + p0z * lz, b = p1x * lx + p1y * ly + p1z * lz, c = p2x * lx + p2y * ly + p2z * lz;
  const lo = Math.min(a, b, c) - r, hi = Math.max(a, b, c) + r, v = mdx * lx + mdy * ly + mdz * lz;
  // Separation at t = 0 along the unit axis, and its rate.
  const loSide = lo >= -hi, s = (loSide ? lo : -hi) / len, der = (loSide ? -v : v) / len;
  if (s > sBest + 1e-9) { sBest = s; sDer = der; const k = (loSide ? -1 : 1) / len; sNx = lx * k; sNy = ly * k; sNz = lz * k; }
  else if (s >= sBest - 1e-9 && der > sDer) sDer = der;
  if (Math.abs(v) < 1e-14) return lo < 0 && hi > 0;
  let t0 = lo / v, t1 = hi / v;
  if (t0 > t1) { const q = t0; t0 = t1; t1 = q; }
  if (t0 > tEnter) { tEnter = t0; const k = (v > 0 ? -1 : 1) / len; eNx = lx * k; eNy = ly * k; eNz = lz * k; }
  if (t1 < tExit) tExit = t1;
  return tEnter <= tExit;
}

/** Sweep a box (centre c, half extents e) by d against triangle (a, b, c).
 * Writes `out` and returns true on a contact within [0, 1]. */
export function sweepBoxTriangle(cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  dx: number, dy: number, dz: number, tri: Float64Array, o: number, skin: number, out: SweepHit): boolean {
  hx = ex; hy = ey; hz = ez; mdx = dx; mdy = dy; mdz = dz; skinR = skin;
  p0x = tri[o]! - cx; p0y = tri[o + 1]! - cy; p0z = tri[o + 2]! - cz;
  p1x = tri[o + 3]! - cx; p1y = tri[o + 4]! - cy; p1z = tri[o + 5]! - cz;
  p2x = tri[o + 6]! - cx; p2y = tri[o + 7]! - cy; p2z = tri[o + 8]! - cz;
  tEnter = -Infinity; tExit = Infinity; sBest = -Infinity; sDer = -Infinity; eNx = eNy = eNz = 0; sNx = sNy = sNz = 0;
  const e0x = p1x - p0x, e0y = p1y - p0y, e0z = p1z - p0z, e1x = p2x - p1x, e1y = p2y - p1y, e1z = p2z - p1z;
  const e2x = p0x - p2x, e2y = p0y - p2y, e2z = p0z - p2z;
  if (!axis(e0y * -e2z - e0z * -e2y, e0z * -e2x - e0x * -e2z, e0x * -e2y - e0y * -e2x)) return false;
  if (!axis(1, 0, 0) || !axis(0, 1, 0) || !axis(0, 0, 1)) return false;
  if (!axis(0, e0z, -e0y) || !axis(-e0z, 0, e0x) || !axis(e0y, -e0x, 0)) return false;
  if (!axis(0, e1z, -e1y) || !axis(-e1z, 0, e1x) || !axis(e1y, -e1x, 0)) return false;
  if (!axis(0, e2z, -e2y) || !axis(-e2z, 0, e2x) || !axis(e2y, -e2x, 0)) return false;
  return finish(dx, dy, dz, out);
}
function finish(dx: number, dy: number, dz: number, out: SweepHit): boolean {
  if (tExit < 0 || tEnter > 1) return false;
  if (tEnter >= 0) { out.t = tEnter; out.nx = eNx; out.ny = eNy; out.nz = eNz; out.start = false; return true; }
  // Starting inside the skin: blocked only while the best separation closes.
  const tau = 1e-9 * Math.hypot(dx, dy, dz) + 1e-15;
  if (sDer >= -tau) return false;
  out.t = 0; out.nx = sNx; out.ny = sNy; out.nz = sNz; out.start = true;
  return true;
}

/** The same sweep against an axis-aligned box obstacle (exterior solids). */
export function sweepBoxBox(cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  dx: number, dy: number, dz: number, min: Vec3, max: Vec3, skin: number, out: SweepHit): boolean {
  tEnter = -Infinity; tExit = Infinity; sBest = -Infinity; sDer = -Infinity;
  const ax = (lo: number, hi: number, v: number, k: number): boolean => {
    const s = Math.max(lo, -hi), der = lo >= -hi ? -v : v;
    if (s > sBest + 1e-9) { sBest = s; sDer = der; sNx = k === 0 ? (lo >= -hi ? -1 : 1) : 0; sNy = k === 1 ? (lo >= -hi ? -1 : 1) : 0; sNz = k === 2 ? (lo >= -hi ? -1 : 1) : 0; }
    else if (s >= sBest - 1e-9 && der > sDer) sDer = der;
    if (Math.abs(v) < 1e-14) return lo < 0 && hi > 0;
    let t0 = lo / v, t1 = hi / v;
    if (t0 > t1) { const q = t0; t0 = t1; t1 = q; }
    if (t0 > tEnter) { tEnter = t0; const sg = v > 0 ? -1 : 1; eNx = k === 0 ? sg : 0; eNy = k === 1 ? sg : 0; eNz = k === 2 ? sg : 0; }
    if (t1 < tExit) tExit = t1;
    return tEnter <= tExit;
  };
  if (!ax(min.x - cx - ex - skin, max.x - cx + ex + skin, dx, 0)) return false;
  if (!ax(min.y - cy - ey - skin, max.y - cy + ey + skin, dy, 1)) return false;
  if (!ax(min.z - cz - ez - skin, max.z - cz + ez + skin, dz, 2)) return false;
  return finish(dx, dy, dz, out);
}

/** True when a box (centre, half extents) overlaps the triangle by more than
 * `tolerance` on every separating axis. */
export function boxOverlapsTriangle(cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  tri: Float64Array, o: number, tolerance: number): boolean {
  const hit: SweepHit = SCRATCH;
  // A zero-length sweep with a negative skin: overlap beyond the tolerance.
  hx = ex; hy = ey; hz = ez; mdx = 0; mdy = 0; mdz = 0; skinR = -tolerance;
  p0x = tri[o]! - cx; p0y = tri[o + 1]! - cy; p0z = tri[o + 2]! - cz;
  p1x = tri[o + 3]! - cx; p1y = tri[o + 4]! - cy; p1z = tri[o + 5]! - cz;
  p2x = tri[o + 6]! - cx; p2y = tri[o + 7]! - cy; p2z = tri[o + 8]! - cz;
  tEnter = -Infinity; tExit = Infinity; sBest = -Infinity; sDer = -Infinity;
  const e0x = p1x - p0x, e0y = p1y - p0y, e0z = p1z - p0z, e1x = p2x - p1x, e1y = p2y - p1y, e1z = p2z - p1z;
  const e2x = p0x - p2x, e2y = p0y - p2y, e2z = p0z - p2z;
  void hit;
  return axis(e0y * -e2z - e0z * -e2y, e0z * -e2x - e0x * -e2z, e0x * -e2y - e0y * -e2x) &&
    axis(1, 0, 0) && axis(0, 1, 0) && axis(0, 0, 1) &&
    axis(0, e0z, -e0y) && axis(-e0z, 0, e0x) && axis(e0y, -e0x, 0) &&
    axis(0, e1z, -e1y) && axis(-e1z, 0, e1x) && axis(e1y, -e1x, 0) &&
    axis(0, e2z, -e2y) && axis(-e2z, 0, e2x) && axis(e2y, -e2x, 0);
}
const SCRATCH: SweepHit = { t: 0, nx: 0, ny: 0, nz: 0, start: false };

// --- Rays --------------------------------------------------------------------------

/** Segment a -> b crosses triangle (Moller-Trumbore, edges inclusive). */
export function segmentHitsTriangle(ax: number, ay: number, az: number, dx: number, dy: number, dz: number, tri: Float64Array | Float32Array,
  a: number, b: number, c: number): number {
  const e1x = tri[b]! - tri[a]!, e1y = tri[b + 1]! - tri[a + 1]!, e1z = tri[b + 2]! - tri[a + 2]!;
  const e2x = tri[c]! - tri[a]!, e2y = tri[c + 1]! - tri[a + 1]!, e2z = tri[c + 2]! - tri[a + 2]!;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return -1;
  const inv = 1 / det, sx = ax - tri[a]!, sy = ay - tri[a + 1]!, sz = az - tri[a + 2]!;
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 && t <= 1 ? t : -1;
}

/** True when segment a -> b crosses no cave triangle (band included). */
export function caveSegmentClear(c: CaveCollision, a: Vec3, b: Vec3): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  collidersIn(c, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z), COLLIDERS);
  const inv = [dx !== 0 ? 1 / dx : Infinity, dy !== 0 ? 1 / dy : Infinity, dz !== 0 ? 1 / dz : Infinity];
  for (const k of COLLIDERS) {
    if (!k.meta.length) continue;
    const N = k.nodes, M = k.meta, P = k.positions, T = k.tris, stack = STACK;
    let sp = 0;
    stack[sp++] = 0;
    while (sp) {
      const id = stack[--sp]!, o = id * 6;
      // Slab test of the segment against the node box.
      let t0 = 0, t1 = 1, ok = true;
      for (let q = 0; q < 3 && ok; q++) {
        const s = q === 0 ? a.x : q === 1 ? a.y : a.z, iv = inv[q]!;
        if (iv === Infinity) { if (s < N[o + q]! || s > N[o + 3 + q]!) ok = false; continue; }
        let u = (N[o + q]! - s) * iv, w = (N[o + 3 + q]! - s) * iv;
        if (u > w) { const x = u; u = w; w = x; }
        t0 = Math.max(t0, u); t1 = Math.min(t1, w);
        if (t0 > t1) ok = false;
      }
      if (!ok) continue;
      const l = M[id * 2]!, r = M[id * 2 + 1]!;
      if (l < 0) {
        for (let t = -1 - l, e = -1 - l + r; t < e; t++)
          if (segmentHitsTriangle(a.x, a.y, a.z, dx, dy, dz, P, T[t * 3]! * 3, T[t * 3 + 1]! * 3, T[t * 3 + 2]! * 3) >= 0) return false;
        continue;
      }
      stack[sp++] = l; stack[sp++] = r;
    }
  }
  return true;
}

/** Visit triangles whose X/Z extent contains (x, z) and whose Y range meets
 * [y0, y1], with the height of the triangle's plane at (x, z) and its
 * upward normal component (from the winding: + faces up into water). */
function verticalHits(c: CaveCollision, x: number, z: number, y0: number, y1: number, visit: (y: number, up: number) => void): void {
  collidersIn(c, x, y0, z, x, y1, z, COLLIDERS);
  for (const k of COLLIDERS) {
    const P = k.positions, T = k.tris;
    forTriangles(k, x, y0, z, x, y1, z, t => {
      const a = T[t * 3]! * 3, b = T[t * 3 + 1]! * 3, d = T[t * 3 + 2]! * 3;
      const ax = P[a]!, az = P[a + 2]!, bx = P[b]!, bz = P[b + 2]!, cx = P[d]!, cz = P[d + 2]!;
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-12) return;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) return;
      const y = l1 * P[a + 1]! + l2 * P[b + 1]! + l3 * P[d + 1]!;
      if (y < y0 || y > y1) return;
      // Upward component of the winding normal (b - a) x (c - a).
      const ux = bx - ax, uz = bz - az, vx = cx - ax, vz = cz - az;
      visit(y, uz * vx - ux * vz);
    });
  }
}

/** Highest upward-facing cave surface under (x, z) at or below `fromY`
 * (or -Infinity). The band counts: it is the seabed round a collar. */
export function caveSupport(c: CaveCollision, x: number, z: number, fromY: number): number {
  let best = -Infinity;
  verticalHits(c, x, z, c.ownership.domain.min.y - 1, fromY, (y, up) => { if (up > 0 && y > best) best = y; });
  return best;
}

/** True when the point is in cave rock: owned, and an odd number of cave
 * surfaces lie between it and the owned top (the cap is rock; a collar's
 * top is open water). Unowned points are never cave rock. */
export function caveRockAt(c: CaveCollision, p: Vec3): boolean {
  const o = c.ownership;
  if (!owns(o, p.x, p.y, p.z)) return false;
  const collar = collarAt(o, p.x, p.z) !== null, top = collar ? o.domain.max.y + 1 : capAt(o, p.x, p.z);
  let crossings = 0;
  // A hair off the lattice so the ray never runs down a shared edge.
  verticalHits(c, p.x + 1.37e-7, p.z + 2.91e-7, p.y, top, () => { crossings++; });
  return collar ? crossings % 2 === 1 : crossings % 2 === 0;
}
