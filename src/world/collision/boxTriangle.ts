/** Box-against-triangle primitives for the static collider (Babylon-free).
 *
 * Generalised from LC's cave-biome collider (`caves/large/collision.ts`),
 * with the same semantics, so a cave biome, a dish and a wreck answer the
 * same way:
 * - Actors are the world's fixed-axis boxes (centre, half extents).
 * - A swept box meets a triangle at the first time every one of the 13
 *   separating axes overlaps (box faces, triangle normal, box-edge x
 *   triangle-edge), with the box grown by a `skin` sphere, so an accepted
 *   pose keeps that gap.
 * - A box that starts within the skin is blocked only while its best
 *   separation is closing: separation under translation is convex, so
 *   non-closing travel never deepens a contact and tangential slides run free.
 *
 * Vertices are read in place from a positions array (`a`, `b`, `c` are float
 * offsets, vertex * 3), so no candidate triangles are copied. The kernels
 * keep their state in module scope: they are hot and never re-entered. */

/** The earliest contact of a sweep: `t` in [0, 1] of the delta, the unit
 * contact normal (from the obstacle towards the box), whether it was a
 * closing contact that started within the skin (`t` = 0), and whether the
 * normal is the obstacle's own face (a triangle's plane, a box's side)
 * rather than an edge or the box's own axis. LC's hits carry no `face`. */
export interface SweepHit { t: number; nx: number; ny: number; nz: number; start: boolean; face?: boolean }
export const createHit = (): SweepHit => ({ t: 0, nx: 0, ny: 0, nz: 0, start: false, face: false });

/** Contacts within this of the same time are a tie. */
export const TIE = 1e-12;
/** Whether contact `h` should replace `best` for a sweep by d: the earlier
 * wins. At a tie (a box meeting a mesh along shared edges) a face wins over
 * an edge or box axis (the edge of a coplanar neighbour is no wall), then
 * the more head-on normal (most opposed to d), then the smaller normal in
 * x, y, z order. The answer never depends on the order contacts were found
 * in, so re-chunking, a new hierarchy or a rebake cannot change a slide. */
export function earlier(h: SweepHit, best: SweepHit, dx: number, dy: number, dz: number): boolean {
  if (h.t < best.t - TIE) return true;
  if (h.t > best.t + TIE) return false;
  if ((h.face ?? false) !== (best.face ?? false)) return h.face === true;
  const a = h.nx * dx + h.ny * dy + h.nz * dz, b = best.nx * dx + best.ny * dy + best.nz * dz;
  if (a !== b) return a < b;
  return h.nx !== best.nx ? h.nx < best.nx : h.ny !== best.ny ? h.ny < best.ny : h.nz < best.nz;
}
/** Merge contact `h` into the best so far (`out`, valid when `found`):
 * the winner by `earlier` supplies the normal, and the time is always the
 * earliest of the two, so a tie never moves a contact later. Returns true. */
export function mergeHit(h: SweepHit, out: SweepHit, found: boolean, dx: number, dy: number, dz: number): true {
  if (!found) { out.t = h.t; out.nx = h.nx; out.ny = h.ny; out.nz = h.nz; out.start = h.start; out.face = h.face ?? false; return true; }
  const t = Math.min(out.t, h.t);
  if (earlier(h, out, dx, dy, dz)) { out.nx = h.nx; out.ny = h.ny; out.nz = h.nz; out.start = h.start; out.face = h.face ?? false; }
  out.t = t;
  return true;
}

/** Signed separation of a box from an obstacle along its best separating
 * axis (negative when they overlap), and that axis as a unit normal from the
 * obstacle towards the box. Moving the box by `-s` along the normal makes it
 * touch; that is the minimum push out of this one obstacle. */
export interface Separation { s: number; nx: number; ny: number; nz: number }
export const createSeparation = (): Separation => ({ s: 0, nx: 0, ny: 0, nz: 0 });

type Positions = Float32Array | Float64Array;

let tEnter = 0, tExit = 0, eNx = 0, eNy = 0, eNz = 0;
let sBest = 0, sDer = 0, sNx = 0, sNy = 0, sNz = 0;
// Which axis call this is (0: the triangle's own normal), and whether the
// entering and best-separating axes were that face.
let axisNo = 0, eFace = false, sFace = false;
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
  const face = axisNo++ === 0;
  if (s > sBest + 1e-9) { sBest = s; sDer = der; const k = (loSide ? -1 : 1) / len; sNx = lx * k; sNy = ly * k; sNz = lz * k; sFace = face; }
  else if (s >= sBest - 1e-9 && der > sDer) sDer = der;
  if (Math.abs(v) < 1e-14) return lo < 0 && hi > 0;
  let t0 = lo / v, t1 = hi / v;
  if (t0 > t1) { const q = t0; t0 = t1; t1 = q; }
  if (t0 > tEnter) { tEnter = t0; const k = (v > 0 ? -1 : 1) / len; eNx = lx * k; eNy = ly * k; eNz = lz * k; eFace = face; }
  if (t1 < tExit) tExit = t1;
  return tEnter <= tExit;
}

function load(cx: number, cy: number, cz: number, P: Positions, a: number, b: number, c: number): void {
  p0x = P[a]! - cx; p0y = P[a + 1]! - cy; p0z = P[a + 2]! - cz;
  p1x = P[b]! - cx; p1y = P[b + 1]! - cy; p1z = P[b + 2]! - cz;
  p2x = P[c]! - cx; p2y = P[c + 1]! - cy; p2z = P[c + 2]! - cz;
  tEnter = -Infinity; tExit = Infinity; sBest = -Infinity; sDer = -Infinity; eNx = eNy = eNz = 0; sNx = sNy = sNz = 0;
  axisNo = 0; eFace = sFace = false;
}

/** All 13 axes, in LC's order; false as soon as one separates. */
function allAxes(): boolean {
  const e0x = p1x - p0x, e0y = p1y - p0y, e0z = p1z - p0z, e1x = p2x - p1x, e1y = p2y - p1y, e1z = p2z - p1z;
  const e2x = p0x - p2x, e2y = p0y - p2y, e2z = p0z - p2z;
  return axis(e0y * -e2z - e0z * -e2y, e0z * -e2x - e0x * -e2z, e0x * -e2y - e0y * -e2x) &&
    axis(1, 0, 0) && axis(0, 1, 0) && axis(0, 0, 1) &&
    axis(0, e0z, -e0y) && axis(-e0z, 0, e0x) && axis(e0y, -e0x, 0) &&
    axis(0, e1z, -e1y) && axis(-e1z, 0, e1x) && axis(e1y, -e1x, 0) &&
    axis(0, e2z, -e2y) && axis(-e2z, 0, e2x) && axis(e2y, -e2x, 0);
}

function finish(dx: number, dy: number, dz: number, out: SweepHit): boolean {
  if (tExit < 0 || tEnter > 1) return false;
  if (tEnter >= 0) { out.t = tEnter; out.nx = eNx; out.ny = eNy; out.nz = eNz; out.start = false; out.face = eFace; return true; }
  // Starting inside the skin: blocked only while the best separation closes.
  const tau = 1e-9 * Math.hypot(dx, dy, dz) + 1e-15;
  if (sDer >= -tau) return false;
  out.t = 0; out.nx = sNx; out.ny = sNy; out.nz = sNz; out.start = true; out.face = sFace;
  return true;
}

/** Sweep a box (centre c, half extents e) by d against triangle (a, b, c) of
 * `P`. Writes `out` and returns true on a contact within [0, 1]. */
export function sweepBoxTriangle(cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  dx: number, dy: number, dz: number, P: Positions, a: number, b: number, c: number, skin: number, out: SweepHit): boolean {
  hx = ex; hy = ey; hz = ez; mdx = dx; mdy = dy; mdz = dz; skinR = skin;
  load(cx, cy, cz, P, a, b, c);
  if (!allAxes()) return false;
  return finish(dx, dy, dz, out);
}

/** True when a box overlaps the triangle by more than `tolerance` on every
 * separating axis. */
export function boxOverlapsTriangle(cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  P: Positions, a: number, b: number, c: number, tolerance: number): boolean {
  // A zero-length sweep with a negative skin: overlap beyond the tolerance.
  hx = ex; hy = ey; hz = ez; mdx = 0; mdy = 0; mdz = 0; skinR = -tolerance;
  load(cx, cy, cz, P, a, b, c);
  return allAxes();
}

/** Best-axis separation of a box from a triangle (all 13 axes evaluated). */
export function boxTriangleSeparation(cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  P: Positions, a: number, b: number, c: number, out: Separation): Separation {
  hx = ex; hy = ey; hz = ez; mdx = 0; mdy = 0; mdz = 0; skinR = 0;
  load(cx, cy, cz, P, a, b, c);
  const e0x = p1x - p0x, e0y = p1y - p0y, e0z = p1z - p0z, e1x = p2x - p1x, e1y = p2y - p1y, e1z = p2z - p1z;
  const e2x = p0x - p2x, e2y = p0y - p2y, e2z = p0z - p2z;
  // `axis` records the best separation as a side effect; evaluate them all.
  axis(e0y * -e2z - e0z * -e2y, e0z * -e2x - e0x * -e2z, e0x * -e2y - e0y * -e2x);
  axis(1, 0, 0); axis(0, 1, 0); axis(0, 0, 1);
  axis(0, e0z, -e0y); axis(-e0z, 0, e0x); axis(e0y, -e0x, 0);
  axis(0, e1z, -e1y); axis(-e1z, 0, e1x); axis(e1y, -e1x, 0);
  axis(0, e2z, -e2y); axis(-e2z, 0, e2x); axis(e2y, -e2x, 0);
  out.s = sBest; out.nx = sNx; out.ny = sNy; out.nz = sNz;
  return out;
}

/** The same sweep against an axis-aligned box obstacle. */
export function sweepBoxBox(cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  dx: number, dy: number, dz: number, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
  skin: number, out: SweepHit): boolean {
  tEnter = -Infinity; tExit = Infinity; sBest = -Infinity; sDer = -Infinity; eFace = sFace = true;
  if (!boxAxis(minX - cx - ex - skin, maxX - cx + ex + skin, dx, 0)) return false;
  if (!boxAxis(minY - cy - ey - skin, maxY - cy + ey + skin, dy, 1)) return false;
  if (!boxAxis(minZ - cz - ez - skin, maxZ - cz + ez + skin, dz, 2)) return false;
  return finish(dx, dy, dz, out);
}
function boxAxis(lo: number, hi: number, v: number, k: number): boolean {
  const s = Math.max(lo, -hi), der = lo >= -hi ? -v : v;
  if (s > sBest + 1e-9) { sBest = s; sDer = der; const g = lo >= -hi ? -1 : 1; sNx = k === 0 ? g : 0; sNy = k === 1 ? g : 0; sNz = k === 2 ? g : 0; }
  else if (s >= sBest - 1e-9 && der > sDer) sDer = der;
  if (Math.abs(v) < 1e-14) return lo < 0 && hi > 0;
  let t0 = lo / v, t1 = hi / v;
  if (t0 > t1) { const q = t0; t0 = t1; t1 = q; }
  if (t0 > tEnter) { tEnter = t0; const g = v > 0 ? -1 : 1; eNx = k === 0 ? g : 0; eNy = k === 1 ? g : 0; eNz = k === 2 ? g : 0; }
  if (t1 < tExit) tExit = t1;
  return tEnter <= tExit;
}

/** Best-axis separation of a box from a box obstacle. */
export function boxBoxSeparation(cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: Separation): Separation {
  let s = -Infinity, nx = 0, ny = 0, nz = 0;
  // The obstacle grown by the box, relative to the box centre: [lo, hi].
  const side = (lo: number, hi: number, k: number): void => {
    const v = Math.max(lo, -hi);
    if (v > s) { s = v; const g = lo >= -hi ? -1 : 1; nx = k === 0 ? g : 0; ny = k === 1 ? g : 0; nz = k === 2 ? g : 0; }
  };
  side(minX - cx - ex, maxX - cx + ex, 0);
  side(minY - cy - ey, maxY - cy + ey, 1);
  side(minZ - cz - ez, maxZ - cz + ez, 2);
  out.s = s; out.nx = nx; out.ny = ny; out.nz = nz;
  return out;
}

/** Parameter in [0, 1] where segment a + t d crosses triangle (a, b, c) of
 * `P` (Moller-Trumbore, edges inclusive), or -1. */
export function segmentTriangle(ax: number, ay: number, az: number, dx: number, dy: number, dz: number, P: Positions,
  a: number, b: number, c: number): number {
  const e1x = P[b]! - P[a]!, e1y = P[b + 1]! - P[a + 1]!, e1z = P[b + 2]! - P[a + 2]!;
  const e2x = P[c]! - P[a]!, e2y = P[c + 1]! - P[a + 1]!, e2z = P[c + 2]! - P[a + 2]!;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return -1;
  const inv = 1 / det, sx = ax - P[a]!, sy = ay - P[a + 1]!, sz = az - P[a + 2]!;
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 && t <= 1 ? t : -1;
}

/** Whether segment a + t d, t in [0, 1], passes through the open box. */
export function segmentBox(ax: number, ay: number, az: number, dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
  let t0 = 0, t1 = 1;
  const slab = (s: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-12) return s > lo && s < hi;
    let u = (lo - s) / d, w = (hi - s) / d;
    if (u > w) { const q = u; u = w; w = q; }
    t0 = Math.max(t0, u); t1 = Math.min(t1, w);
    return t0 < t1;
  };
  return slab(ax, dx, minX, maxX) && slab(ay, dy, minY, maxY) && slab(az, dz, minZ, maxZ);
}

/** Height at (x, z) of the plane through triangle (a, b, c) if (x, z) lies in
 * its X/Z projection (edges inclusive), else NaN. `UP` receives the Y
 * component of (b - a) x (c - a), the winding normal's vertical sign. */
export const UP = { y: 0 };
export function triangleHeightAt(P: Positions, a: number, b: number, c: number, x: number, z: number): number {
  const ax = P[a]!, az = P[a + 2]!, bx = P[b]!, bz = P[b + 2]!, cx = P[c]!, cz = P[c + 2]!;
  const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(det) < 1e-12) return NaN;
  const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
  if (l1 < 0 || l2 < 0 || l3 < 0) return NaN;
  const ux = bx - ax, uz = bz - az, vx = cx - ax, vz = cz - az;
  UP.y = uz * vx - ux * vz;
  return l1 * P[a + 1]! + l2 * P[b + 1]! + l3 * P[c + 1]!;
}
