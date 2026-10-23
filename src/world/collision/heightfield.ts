import type { Aabb, Rect, Vec3 } from "../types.js";
import {
  boxOverlapsTriangle, boxTriangleSeparation, mergeHit, segmentTriangle, sweepBoxTriangle, type Separation, type SweepHit,
} from "./boxTriangle.js";

/** A baked heightfield: exterior seabed as collision, for cave collars and
 * terrain seams (COL-1). It replaces collar column boxes (CA-1: 125,852 of
 * its 152,548 boxes) with one Float32 sample per lattice point.
 *
 * - **Surface.** Samples at `x0 + i * cell`, `z0 + k * cell` (X fastest).
 *   Each cell is two triangles split along its (i, k)-(i+1, k+1) diagonal, so
 *   collision is the lattice's piecewise-linear surface and the box sweep
 *   is the same 13-axis test as every triangle. Below the surface is solid.
 * - **Holes.** A cell is a hole when its bit is set in `holes` (a cave's
 *   own footprint, where the cave answers: the old collar rule, by cell
 *   centre) or a corner sample is NaN. Outside the lattice, and in holes,
 *   the heightfield answers nothing; ownership is the composer's job.
 * - **Culling.** Tiles of `TILE` x `TILE` cells keep their lowest and
 *   highest sample, so a box above a tile skips all of its cells. Storage
 *   and cost follow the lattice size: no 3D grid, no per-cell objects.
 *
 * **A volume, not a sheet.** Below the surface of every solid cell is solid,
 * so a solid cell's edge that borders a hole or the lattice's edge is a
 * vertical **wall**, from the surface down to the bounds' bottom. Sweeps
 * meet the top triangles and the walls **oriented**: a contact with a face
 * counts only while the box moves against that face's outward normal (the
 * only way into the solid through it). So a buried actor may rise or leave
 * through a wall, monotonically, but never sinks deeper or enters. Sight is blocked wherever a segment is under
 * a solid cell's surface, entered from above or through a wall.
 *
 * A box with no crossing triangle lies wholly above or wholly below the
 * surface in each cell under it, so a buried box is found by its bottom
 * centre per cell. */

export interface StaticHeightfield {
  readonly kind: "heightfield";
  readonly id: string;
  readonly x0: number;
  readonly z0: number;
  readonly cell: number;
  /** Cells along X and Z (samples are one more). */
  readonly nx: number;
  readonly nz: number;
  readonly heights: Float32Array;
  /** One bit per cell (i + nx * k), set for a hole; null when there are none. */
  readonly holes: Uint8Array | null;
  readonly tx: number;
  readonly tz: number;
  /** Lowest and highest finite sample per tile (+/-Infinity when all holes). */
  readonly tileMin: Float32Array;
  readonly tileMax: Float32Array;
  readonly bounds: Aabb;
  readonly bytes: number;
  /** Largest conservative lift of any sample, metres (0 when not lifted). */
  readonly lift: number;
  /** Most the sampled floor stands above the surface between the
   * conservative points (`SampleOptions.measure`; 0 when not measured). */
  readonly residual: number;
}

export const TILE = 8;
/** Below the surface is solid all the way down: bounds reach this far under
 * the lowest sample, so a broad phase never skips a buried query. */
export const SOLID_DEPTH = 10000;

export interface SampleOptions {
  /** Given a cell's centre, true makes the cell a hole. */
  readonly hole?: (cx: number, cz: number) => boolean;
  /** Lift each sample so the surface is never below `floor` at any cell's
   * nine half-cell points (corners, edge midpoints, centre: the points the
   * old collar columns took their maximum of). A curved floor sags under
   * its chords; this keeps the lattice on or above the floor the exterior
   * world tests clearance against at those points. Between them a floor
   * that curves within a cell can still stand above the lattice: `residual`
   * measures that. */
  readonly conservative?: boolean;
  /** Measure `residual`: the most the floor stands above the stored surface
   * at a 4 x 4 grid of interior points per cell (offsets 1/8 .. 7/8). */
  readonly measure?: boolean;
}

/** Sample `floor` on a lattice over `rect` (snapped outwards to `cell`). */
export function sampleHeightfield(id: string, rect: Rect, cell: number, floor: (x: number, z: number) => number,
  options: SampleOptions = {}): StaticHeightfield {
  const x0 = Math.floor(rect.minX / cell) * cell, z0 = Math.floor(rect.minZ / cell) * cell;
  const nx = Math.max(1, Math.ceil((rect.maxX - x0) / cell - 1e-9)), nz = Math.max(1, Math.ceil((rect.maxZ - z0) / cell - 1e-9));
  const r = nx + 1, raw = new Float64Array(r * (nz + 1)), hole = options.hole;
  for (let k = 0; k <= nz; k++) for (let i = 0; i <= nx; i++) raw[i + r * k] = floor(x0 + i * cell, z0 + k * cell);
  const lift = new Float64Array(raw.length);
  if (options.conservative) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (hole?.(x0 + (i + 0.5) * cell, z0 + (k + 0.5) * cell)) continue;
    const a = raw[i + r * k]!, b = raw[i + 1 + r * k]!, c = raw[i + r * (k + 1)]!, d = raw[i + 1 + r * (k + 1)]!;
    let deficit = 0;
    for (const [u, w] of [[0.5, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0.5, 1]] as const) {
      const lattice = u >= w ? a + (b - a) * u + (d - b) * w : a + (d - c) * u + (c - a) * w;
      deficit = Math.max(deficit, floor(x0 + (i + u) * cell, z0 + (k + w) * cell) - lattice);
    }
    // Raising all four corners by the deficit raises the whole cell by it.
    for (const v of [i + r * k, i + 1 + r * k, i + r * (k + 1), i + 1 + r * (k + 1)]) lift[v] = Math.max(lift[v]!, deficit);
  }
  const heights = new Float32Array(raw.length);
  // Round up to Float32, so storage never lowers a sample.
  for (let v = 0; v < raw.length; v++) {
    const want = raw[v]! + lift[v]!, f = Math.fround(want);
    heights[v] = f >= want ? f : f + Math.max(Math.abs(f) * 2 ** -23, 1e-30);
  }
  let holes: Uint8Array | null = null;
  if (hole) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (!hole(x0 + (i + 0.5) * cell, z0 + (k + 0.5) * cell)) continue;
    holes ??= new Uint8Array(Math.ceil(nx * nz / 8));
    const b = i + nx * k;
    holes[b >> 3] = holes[b >> 3]! | (1 << (b & 7));
  }
  const field = createHeightfield(id, x0, z0, cell, nx, nz, heights, holes);
  let most = 0;
  for (const l of lift) most = Math.max(most, l);
  let residual = 0;
  if (options.measure) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (!solidCell(field, i, k)) continue;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      const x = x0 + (i + (2 * a + 1) / 8) * cell, z = z0 + (k + (2 * b + 1) / 8) * cell;
      residual = Math.max(residual, floor(x, z) - cellHeightAt(field, i, k, x, z));
    }
  }
  return { ...field, lift: most, residual };
}

export function createHeightfield(id: string, x0: number, z0: number, cell: number, nx: number, nz: number, heights: Float32Array,
  holes: Uint8Array | null = null): StaticHeightfield {
  if (holes && holes.length !== Math.ceil(nx * nz / 8)) throw new Error(`heightfield ${id}: hole mask of ${holes.length} bytes for ${nx} x ${nz} cells`);
  if (heights.length !== (nx + 1) * (nz + 1)) throw new Error(`heightfield ${id}: ${heights.length} samples for ${nx} x ${nz} cells`);
  if (!(cell > 0)) throw new Error(`heightfield ${id}: cell must be positive`);
  const tx = Math.ceil(nx / TILE), tz = Math.ceil(nz / TILE);
  const tileMin = new Float32Array(tx * tz).fill(Infinity), tileMax = new Float32Array(tx * tz).fill(-Infinity);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k <= nz; k++) for (let i = 0; i <= nx; i++) {
    const h = heights[i + (nx + 1) * k]!;
    if (Number.isNaN(h)) continue;
    if (!Number.isFinite(h)) throw new Error(`heightfield ${id}: infinite sample at ${i}, ${k}`);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    // A sample borders up to four cells, so up to four tiles.
    for (const ti of [Math.floor((i - 1) / TILE), Math.floor(i / TILE)]) for (const tk of [Math.floor((k - 1) / TILE), Math.floor(k / TILE)]) {
      if (ti < 0 || tk < 0 || ti >= tx || tk >= tz) continue;
      const t = ti + tx * tk;
      tileMin[t] = Math.min(tileMin[t]!, h); tileMax[t] = Math.max(tileMax[t]!, h);
    }
  }
  if (lo === Infinity) lo = hi = 0;
  return {
    kind: "heightfield", id, x0, z0, cell, nx, nz, heights, holes, tx, tz, tileMin, tileMax,
    bounds: { min: { x: x0, y: lo - SOLID_DEPTH, z: z0 }, max: { x: x0 + nx * cell, y: hi, z: z0 + nz * cell } },
    bytes: heights.byteLength + (holes?.byteLength ?? 0) + tileMin.byteLength + tileMax.byteLength, lift: 0, residual: 0,
  };
}

/** The surface height at (x, z), or NaN outside the lattice or in a hole. */
export function heightAt(h: StaticHeightfield, x: number, z: number): number {
  const fx = (x - h.x0) / h.cell, fz = (z - h.z0) / h.cell;
  if (!(fx >= 0 && fz >= 0 && fx <= h.nx && fz <= h.nz)) return NaN;
  const i = Math.min(h.nx - 1, Math.floor(fx)), k = Math.min(h.nz - 1, Math.floor(fz)), u = fx - i, w = fz - k;
  // The whole cell's ownership, as overlap and walls read it (a NaN corner
  // empties the cell, even on its triangle that doesn't use that corner).
  if (!solidCell(h, i, k)) return NaN;
  const H = h.heights, r = h.nx + 1, a = H[i + r * k]!, b = H[i + 1 + r * k]!, c = H[i + r * (k + 1)]!, d = H[i + 1 + r * (k + 1)]!;
  // Lower triangle (i,k) (i+1,k) (i+1,k+1) where u >= w; upper (i,k) (i+1,k+1) (i,k+1).
  return u >= w ? a + (b - a) * u + (d - b) * w : a + (d - c) * u + (c - a) * w;
}

export function isHole(h: StaticHeightfield, i: number, k: number): boolean {
  const b = i + h.nx * k;
  return h.holes !== null && (h.holes[b >> 3]! & (1 << (b & 7))) !== 0;
}

// Scratch triangle corners: [lower triangle 0..8, upper 9..17].
const T = new Float64Array(18);
/** Writes cell (i, k)'s two triangles into T; false for a hole. */
function cellTriangles(h: StaticHeightfield, i: number, k: number): boolean {
  if (isHole(h, i, k)) return false;
  const H = h.heights, r = h.nx + 1;
  const a = H[i + r * k]!, b = H[i + 1 + r * k]!, c = H[i + r * (k + 1)]!, d = H[i + 1 + r * (k + 1)]!;
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return false;
  const x = h.x0 + i * h.cell, z = h.z0 + k * h.cell, X = x + h.cell, Z = z + h.cell;
  // Wound so (b - a) x (c - a) faces up (+Y).
  T[0] = x; T[1] = a; T[2] = z; T[3] = X; T[4] = d; T[5] = Z; T[6] = X; T[7] = b; T[8] = z;
  T[9] = x; T[10] = a; T[11] = z; T[12] = x; T[13] = c; T[14] = Z; T[15] = X; T[16] = d; T[17] = Z;
  return true;
}
const cellMin = (h: StaticHeightfield, i: number, k: number): number => {
  const H = h.heights, r = h.nx + 1;
  return Math.min(H[i + r * k]!, H[i + 1 + r * k]!, H[i + r * (k + 1)]!, H[i + 1 + r * (k + 1)]!);
};

/** Whether cell (i, k) is solid below its surface: in the lattice, not a hole, every corner sampled. */
export function solidCell(h: StaticHeightfield, i: number, k: number): boolean {
  if (i < 0 || k < 0 || i >= h.nx || k >= h.nz || isHole(h, i, k)) return false;
  const H = h.heights, r = h.nx + 1;
  return !(Number.isNaN(H[i + r * k]!) || Number.isNaN(H[i + 1 + r * k]!) || Number.isNaN(H[i + r * (k + 1)]!) || Number.isNaN(H[i + 1 + r * (k + 1)]!));
}
/** Edges of a cell: west, east, south, north, as neighbour offset and outward normal. */
const EDGES = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
// Scratch wall triangles (0..8, 9..17).
const W = new Float64Array(18);
/** Writes the wall on edge `side` of solid cell (i, k) into W (two
 * triangles, from the surface edge down to the bounds' bottom); false when
 * the neighbour across it is solid too (no wall). */
function cellWall(h: StaticHeightfield, i: number, k: number, side: number): boolean {
  const [di, dk] = EDGES[side]!;
  if (solidCell(h, i + di, k + dk)) return false;
  const H = h.heights, r = h.nx + 1, c = h.cell, bottom = h.bounds.min.y;
  // The edge's two corners (lattice indices), in a fixed order.
  const [i0, k0, i1, k1] = side === 0 ? [i, k, i, k + 1] : side === 1 ? [i + 1, k, i + 1, k + 1] : side === 2 ? [i, k, i + 1, k] : [i, k + 1, i + 1, k + 1];
  const x0 = h.x0 + i0 * c, z0 = h.z0 + k0 * c, x1 = h.x0 + i1 * c, z1 = h.z0 + k1 * c, y0 = H[i0 + r * k0]!, y1 = H[i1 + r * k1]!;
  W[0] = x0; W[1] = bottom; W[2] = z0; W[3] = x1; W[4] = bottom; W[5] = z1; W[6] = x1; W[7] = y1; W[8] = z1;
  W[9] = x0; W[10] = bottom; W[11] = z0; W[12] = x1; W[13] = y1; W[14] = z1; W[15] = x0; W[16] = y0; W[17] = z0;
  return true;
}
/** Surface height of cell (i, k)'s own triangles at (x, z), clamped into the cell. */
function cellHeightAt(h: StaticHeightfield, i: number, k: number, x: number, z: number): number {
  const u = Math.max(0, Math.min(1, (x - h.x0) / h.cell - i)), w = Math.max(0, Math.min(1, (z - h.z0) / h.cell - k));
  const H = h.heights, r = h.nx + 1, a = H[i + r * k]!, b = H[i + 1 + r * k]!, c = H[i + r * (k + 1)]!, d = H[i + 1 + r * (k + 1)]!;
  return u >= w ? a + (b - a) * u + (d - b) * w : a + (d - c) * u + (c - a) * w;
}

/** Calls `visit(i, k)` for every cell under the X/Z box whose tile reaches
 * up to `topY` (the rest lie wholly below the box). Stops when it returns true. */
function forCells(h: StaticHeightfield, minX: number, minZ: number, maxX: number, maxZ: number, bottomY: number,
  visit: (i: number, k: number) => boolean): boolean {
  const i0 = Math.max(0, Math.floor((minX - h.x0) / h.cell)), i1 = Math.min(h.nx - 1, Math.floor((maxX - h.x0) / h.cell));
  const k0 = Math.max(0, Math.floor((minZ - h.z0) / h.cell)), k1 = Math.min(h.nz - 1, Math.floor((maxZ - h.z0) / h.cell));
  if (i0 > i1 || k0 > k1) return false;
  for (let tk = Math.floor(k0 / TILE); tk <= Math.floor(k1 / TILE); tk++) for (let ti = Math.floor(i0 / TILE); ti <= Math.floor(i1 / TILE); ti++) {
    if (h.tileMax[ti + h.tx * tk]! < bottomY) continue;
    for (let k = Math.max(k0, tk * TILE); k <= Math.min(k1, tk * TILE + TILE - 1); k++)
      for (let i = Math.max(i0, ti * TILE); i <= Math.min(i1, ti * TILE + TILE - 1); i++) if (visit(i, k)) return true;
  }
  return false;
}

const HIT: SweepHit = { t: 0, nx: 0, ny: 0, nz: 0, start: false };
/** One face of the solid (triangle `o` of `tri`, outward normal (ox, oy, oz),
 * unnormalised) against the swept box, **oriented**: the box can enter the
 * solid through this face only while moving against its outward normal, so
 * a contact with it counts only then, whether the box starts within its
 * skin or meets it later at an edge or vertex (where the kernel's contact
 * normal may be an edge axis that says nothing about entry). A start contact
 * reports the face normal; a later one the kernel's, so slides follow edges. */
function faceContact(tri: Float64Array, o: number, ox: number, oy: number, oz: number, cx: number, cy: number, cz: number,
  ex: number, ey: number, ez: number, dx: number, dy: number, dz: number, skin: number, out: SweepHit, found: boolean): boolean {
  const l = Math.hypot(ox, oy, oz);
  if (l < 1e-18) return found;
  const nx = ox / l, ny = oy / l, nz = oz / l, tau = 1e-9 * Math.hypot(dx, dy, dz) + 1e-15;
  if (dx * nx + dy * ny + dz * nz >= -tau) return found;
  if (boxOverlapsTriangle(cx, cy, cz, ex, ey, ez, tri, o, o + 3, o + 6, -skin)) {
    HIT.t = 0; HIT.nx = nx; HIT.ny = ny; HIT.nz = nz; HIT.start = true; HIT.face = true;
    return mergeHit(HIT, out, found, dx, dy, dz);
  }
  if (!sweepBoxTriangle(cx, cy, cz, ex, ey, ez, dx, dy, dz, tri, o, o + 3, o + 6, skin, HIT)) return found;
  return mergeHit(HIT, out, found, dx, dy, dz);
}

/** Earliest contact of a box (centre c, half extents e) moving by d. */
export function sweepHeightfield(h: StaticHeightfield, cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  dx: number, dy: number, dz: number, skin: number, out: SweepHit): boolean {
  const r = skin + 0.01, bottom = cy - ey + Math.min(0, dy) - r, top = cy + ey;
  let found = false;
  forCells(h, cx - ex + Math.min(0, dx) - r, cz - ez + Math.min(0, dz) - r, cx + ex + Math.max(0, dx) + r, cz + ez + Math.max(0, dz) + r, bottom, (i, k) => {
    if (!cellTriangles(h, i, k)) return false;
    // Buried under this cell at the start (the surface is wholly above the
    // box there): the contact faces up, so only sinking closes it.
    const x = h.x0 + i * h.cell, z = h.z0 + k * h.cell;
    if (cellMin(h, i, k) > top + skin && x < cx + ex && x + h.cell > cx - ex && z < cz + ez && z + h.cell > cz - ez) {
      const buried: SweepHit = { t: 0, nx: 0, ny: 1, nz: 0, start: true, face: true };
      if (dy < -1e-12) found = mergeHit(buried, out, found, dx, dy, dz);
    } else for (const o of [0, 9]) {
      // The top triangle's own up normal, (b - a) x (c - a).
      const ux = T[o + 3]! - T[o]!, uy = T[o + 4]! - T[o + 1]!, uz = T[o + 5]! - T[o + 2]!, vx = T[o + 6]! - T[o]!, vy = T[o + 7]! - T[o + 1]!, vz = T[o + 8]! - T[o + 2]!;
      found = faceContact(T, o, uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx, cx, cy, cz, ex, ey, ez, dx, dy, dz, skin, out, found);
    }
    // Walls where this solid cell meets a hole or the lattice's edge.
    for (let side = 0; side < 4; side++) {
      if (!cellWall(h, i, k, side)) continue;
      const [ox, oz] = EDGES[side]!;
      for (const o of [0, 9]) found = faceContact(W, o, ox, 0, oz, cx, cy, cz, ex, ey, ez, dx, dy, dz, skin, out, found);
    }
    return false;
  });
  return found;
}

/** Centres that push the box out of the heightfield's solid, within
 * `reach`: up past the highest surface under it, and out through each wall
 * of the solid cells it overlaps. Each `push(x, y, z, distance)`. */
export function heightfieldPushes(h: StaticHeightfield, cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  skin: number, push: (x: number, y: number, z: number, distance: number) => void): void {
  let top = -Infinity;
  forCells(h, cx - ex, cz - ez, cx + ex, cz + ez, cy - ey, (i, k) => {
    if (!solidCell(h, i, k)) return false;
    const H = h.heights, r = h.nx + 1;
    top = Math.max(top, H[i + r * k]!, H[i + 1 + r * k]!, H[i + r * (k + 1)]!, H[i + 1 + r * (k + 1)]!);
    for (let side = 0; side < 4; side++) {
      const [di, dk] = EDGES[side]!;
      if (solidCell(h, i + di, k + dk)) continue;
      // Across the wall: the box wholly on the hole's side of the edge line.
      const edge = side === 0 ? h.x0 + i * h.cell : side === 1 ? h.x0 + (i + 1) * h.cell : side === 2 ? h.z0 + k * h.cell : h.z0 + (k + 1) * h.cell;
      if (side < 2) { const x = di < 0 ? edge - ex - skin : edge + ex + skin; push(x, cy, cz, Math.abs(x - cx)); }
      else { const z = dk < 0 ? edge - ez - skin : edge + ez + skin; push(cx, cy, z, Math.abs(z - cz)); }
    }
    return false;
  });
  const y = top + ey + skin;
  if (top > -Infinity && y > cy) push(cx, y, cz, y - cy);
}

/** True when the box crosses the surface by more than `tolerance`, or lies
 * under it in any cell it covers. */
export function overlapsHeightfield(h: StaticHeightfield, cx: number, cy: number, cz: number, ex: number, ey: number, ez: number, tolerance: number): boolean {
  const bottom = cy - ey;
  return forCells(h, cx - ex, cz - ez, cx + ex, cz + ez, bottom + tolerance, (i, k) => {
    if (!cellTriangles(h, i, k)) return false;
    if (boxOverlapsTriangle(cx, cy, cz, ex, ey, ez, T, 0, 3, 6, tolerance) || boxOverlapsTriangle(cx, cy, cz, ex, ey, ez, T, 9, 12, 15, tolerance)) return true;
    // No crossing here: wholly above or below; read the cell's covered centre.
    const x = Math.max(cx - ex, Math.min(cx + ex, h.x0 + (i + 0.5) * h.cell)), z = Math.max(cz - ez, Math.min(cz + ez, h.z0 + (k + 0.5) * h.cell));
    return heightAt(h, x, z) > bottom + tolerance;
  });
}

/** Deepest overlap with the surface (most negative separation below
 * `-tolerance`), or null. A buried box reports its depth facing up. */
export function deepestHeightfieldContact(h: StaticHeightfield, cx: number, cy: number, cz: number, ex: number, ey: number, ez: number,
  tolerance: number, out: Separation): Separation | null {
  let best = -tolerance, nx = 0, ny = 0, nz = 0, found = false;
  const bottom = cy - ey;
  forCells(h, cx - ex, cz - ez, cx + ex, cz + ez, bottom + tolerance, (i, k) => {
    if (!cellTriangles(h, i, k)) return false;
    let crossed = false;
    for (const o of [0, 9]) {
      boxTriangleSeparation(cx, cy, cz, ex, ey, ez, T, o, o + 3, o + 6, out);
      if (out.s < -tolerance) crossed = true;
      if (out.s < best) { best = out.s; nx = out.nx; ny = out.ny; nz = out.nz; found = true; }
    }
    if (!crossed) {
      // Buried under this cell: push straight up past its highest corner.
      const H = h.heights, r = h.nx + 1, top = Math.max(H[i + r * k]!, H[i + 1 + r * k]!, H[i + r * (k + 1)]!, H[i + 1 + r * (k + 1)]!);
      const x = Math.max(cx - ex, Math.min(cx + ex, h.x0 + (i + 0.5) * h.cell)), z = Math.max(cz - ez, Math.min(cz + ez, h.z0 + (k + 0.5) * h.cell));
      if (heightAt(h, x, z) > bottom + tolerance && bottom - top < best) { best = bottom - top; nx = 0; ny = 1; nz = 0; found = true; }
    }
    return false;
  });
  if (!found) return null;
  out.s = best; out.nx = nx; out.ny = ny; out.nz = nz;
  return out;
}

/** The surface at (x, z) if it is at or below `fromY`, else -Infinity. */
export function supportHeightfield(h: StaticHeightfield, x: number, z: number, fromY: number): number {
  const y = heightAt(h, x, z);
  return y <= fromY ? y : -Infinity;
}

/** True when segment a -> b is nowhere under a solid cell's surface. Walks
 * the cells under the segment's X/Z projection (2D DDA). */
export function segmentClearHeightfield(h: StaticHeightfield, a: Vec3, b: Vec3): boolean {
  const start = heightAt(h, a.x, a.z);
  if (start > a.y) return false;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const fx = (a.x - h.x0) / h.cell, fz = (a.z - h.z0) / h.cell, gx = dx / h.cell, gz = dz / h.cell;
  // Clip the segment to the lattice rectangle.
  let t0 = 0, t1 = 1;
  for (const [f, g, n] of [[fx, gx, h.nx], [fz, gz, h.nz]] as const) {
    if (Math.abs(g) < 1e-15) { if (f < 0 || f > n) return true; continue; }
    let u = (0 - f) / g, w = (n - f) / g;
    if (u > w) { const q = u; u = w; w = q; }
    t0 = Math.max(t0, u); t1 = Math.min(t1, w);
  }
  if (t0 > t1) return true;
  let i = Math.min(h.nx - 1, Math.max(0, Math.floor(fx + gx * t0))), k = Math.min(h.nz - 1, Math.max(0, Math.floor(fz + gz * t0)));
  const si = gx > 0 ? 1 : gx < 0 ? -1 : 0, sk = gz > 0 ? 1 : gz < 0 ? -1 : 0;
  const nextX = (): number => si === 0 ? Infinity : ((si > 0 ? i + 1 : i) - fx) / gx;
  const nextZ = (): number => sk === 0 ? Infinity : ((sk > 0 ? k + 1 : k) - fz) / gz;
  let tx = nextX(), tz = nextZ(), t = t0;
  for (let guard = 0; guard < 4 * (h.nx + h.nz) + 8; guard++) {
    const tEnd = Math.min(t1, tx, tz);
    // Lowest point of the segment over this cell against the cell's top.
    const yLow = Math.min(a.y + dy * t, a.y + dy * tEnd);
    const H = h.heights, r = h.nx + 1;
    const cellTop = Math.max(H[i + r * k]!, H[i + 1 + r * k]!, H[i + r * (k + 1)]!, H[i + 1 + r * (k + 1)]!);
    if (!(yLow > cellTop) && cellTriangles(h, i, k)) {
      // Under the surface where the segment enters this cell (from a hole,
      // the lattice's edge or its start), or crossing its top: in the solid.
      const px = a.x + dx * t, py = a.y + dy * t, pz = a.z + dz * t;
      if (py < cellHeightAt(h, i, k, px, pz)) return false;
      if (segmentTriangle(a.x, a.y, a.z, dx, dy, dz, T, 0, 3, 6) >= 0 || segmentTriangle(a.x, a.y, a.z, dx, dy, dz, T, 9, 12, 15) >= 0) return false;
    }
    if (tEnd >= t1) break;
    t = tEnd;
    if (tx <= tz) { i += si; tx = nextX(); } else { k += sk; tz = nextZ(); }
    if (i < 0 || k < 0 || i >= h.nx || k >= h.nz) break;
  }
  return true;
}
