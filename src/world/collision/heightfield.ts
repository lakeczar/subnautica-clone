import type { Aabb, Rect, Vec3 } from "../types.js";
import {
  boxOverlapsTriangle, boxTriangleSeparation, mergeHit, segmentTriangle, sweepBoxTriangle, type Separation, type SweepHit,
} from "./boxTriangle.js";

/** A baked heightfield: exterior seabed as collision, for cave collars and
 * terrain seams (COL-1). It replaces collar column boxes (CA-1: 125,852 of
 * its 152,548 boxes) with four Float32 corner heights per cell.
 *
 * - **Surface.** Cell (i, k) spans `x0 + i * cell` to `x0 + (i + 1) * cell`
 *   (and the same in Z) and owns its four corners, a (i, k), b (i + 1, k),
 *   c (i, k + 1), d (i + 1, k + 1), split along a-d into two triangles, so
 *   collision is piecewise linear and the box sweep is the same 13-axis test
 *   as every triangle. Below the surface is solid. Neighbouring cells
 *   usually agree along their shared edge; where they don't (a crease or
 *   cliff baked as a flat column top, see `sampleHeightfield`), the step
 *   between them is a wall.
 * - **Holes.** A cell is a hole when its bit is set in `holes` (a cave's
 *   own footprint, where the cave answers: the old collar rule, by cell
 *   centre) or a corner is NaN. Outside the lattice, and in holes, the
 *   heightfield answers nothing; ownership is the composer's job.
 * - **Culling.** Tiles of `TILE` x `TILE` cells keep their lowest and
 *   highest corner, so a box above a tile skips all of its cells. Storage
 *   and cost follow the lattice size: no 3D grid, no per-cell objects.
 *
 * **A volume, not a sheet.** Below the surface of every solid cell is solid,
 * so where a solid cell's edge stands above what lies across it (a hole or
 * the lattice's edge: the bounds' bottom; a lower neighbour: its edge), that
 * part is a vertical **wall**. Sweeps meet the tops and the walls
 * **oriented**: a contact with a face counts only while the box moves
 * against that face's outward normal (the only way into the solid through
 * it). So a buried actor may rise or leave through a wall, monotonically,
 * but never sinks deeper or enters. Sight is blocked wherever a segment is
 * under a solid cell's surface, entered from above or through a wall.
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
  /** Cells along X and Z. */
  readonly nx: number;
  readonly nz: number;
  /** Four corner heights per cell (i + nx * k): a, b, c, d (see above). */
  readonly corners: Float32Array;
  /** One bit per cell (i + nx * k), set for a hole; null when there are none. */
  readonly holes: Uint8Array | null;
  readonly tx: number;
  readonly tz: number;
  /** Lowest and highest finite corner per tile (+/-Infinity when all holes). */
  readonly tileMin: Float32Array;
  readonly tileMax: Float32Array;
  readonly bounds: Aabb;
  readonly bytes: number;
  /** Largest conservative lift of a sloped cell, metres (at most `CREASE`; 0 when not lifted). */
  readonly lift: number;
  /** Cells baked as a flat column top because their floor creases (`sampleHeightfield`). */
  readonly flatCells: number;
  /** Most the sampled floor stands above the surface between the
   * conservative points (`SampleOptions.measure`; 0 when not measured). */
  readonly residual: number;
}

export const TILE = 8;
/** Below the surface is solid all the way down: bounds reach this far under
 * the lowest sample, so a broad phase never skips a buried query. */
export const SOLID_DEPTH = 10000;

/** The most a sloped cell is lifted, metres: the old collar columns' pad. A
 * cell whose floor creases more under its chords is baked as a flat column
 * top instead (`sampleHeightfield`). */
export const CREASE = 0.02;

export interface SampleOptions {
  /** Given a cell's centre, true makes the cell a hole. */
  readonly hole?: (cx: number, cz: number) => boolean;
  /** Keep each cell on or above `floor` at a 5 x 5 grid of quarter-cell
   * points (which contains the nine half-cell points the old collar columns
   * took their maximum of), **cell by cell**:
   * - a cell whose floor sags under its chords by at most `CREASE` there is
   *   lifted by its own sag only (its corners are its own, so a neighbour's
   *   crease never raises it), so it never stands above its old column top
   *   (the nine-point maximum plus `CREASE`);
   * - a cell that creases more (a cliff, a step, a ridge) is baked flat at
   *   its 25-point maximum plus `CREASE`: the old column, raised only where
   *   the floor stood above that column between its own nine points.
   * Between the construction points a floor that curves within a cell can
   * still stand above the surface: `residual` measures that, elsewhere. */
  readonly conservative?: boolean;
  /** Measure `residual`: the most the floor stands above the stored surface
   * at an 8 x 8 grid of interior points per cell (offsets 1/16 .. 15/16),
   * none of them a construction point. */
  readonly measure?: boolean;
}

/** Float32 at or above `want`: storage never lowers a conservative height. */
const roundUp = (want: number): number => {
  const f = Math.fround(want);
  return f >= want ? f : f + Math.max(Math.abs(f) * 2 ** -23, 1e-30);
};
/** Construction points per cell: a 5 x 5 grid at quarter cells, containing the old columns' nine half-cell points. */
const GRID: readonly (readonly [number, number])[] = Array.from({ length: 25 }, (_, n) => [(n % 5) / 4, Math.floor(n / 5) / 4] as const);

/** Sample `floor` over `rect` (snapped outwards to `cell`). */
export function sampleHeightfield(id: string, rect: Rect, cell: number, floor: (x: number, z: number) => number,
  options: SampleOptions = {}): StaticHeightfield {
  const x0 = Math.floor(rect.minX / cell) * cell, z0 = Math.floor(rect.minZ / cell) * cell;
  const nx = Math.max(1, Math.ceil((rect.maxX - x0) / cell - 1e-9)), nz = Math.max(1, Math.ceil((rect.maxZ - z0) / cell - 1e-9));
  const r = nx + 1, raw = new Float64Array(r * (nz + 1)), hole = options.hole;
  for (let k = 0; k <= nz; k++) for (let i = 0; i <= nx; i++) raw[i + r * k] = floor(x0 + i * cell, z0 + k * cell);
  const corners = new Float32Array(nx * nz * 4);
  let lift = 0, flatCells = 0;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const a = raw[i + r * k]!, b = raw[i + 1 + r * k]!, c = raw[i + r * (k + 1)]!, d = raw[i + 1 + r * (k + 1)]!, o = (i + nx * k) * 4;
    let q = [a, b, c, d];
    if (options.conservative && !hole?.(x0 + (i + 0.5) * cell, z0 + (k + 0.5) * cell)) {
      let deficit = 0, top = -Infinity;
      for (const [u, w] of GRID) {
        const f = floor(x0 + (i + u) * cell, z0 + (k + w) * cell), lattice = u >= w ? a + (b - a) * u + (d - b) * w : a + (d - c) * u + (c - a) * w;
        deficit = Math.max(deficit, f - lattice); top = Math.max(top, f);
      }
      // Raising all four corners by the deficit raises the whole cell by it.
      if (deficit <= CREASE) { q = q.map(v => v + deficit); lift = Math.max(lift, deficit); }
      else { q = [top + CREASE, top + CREASE, top + CREASE, top + CREASE]; flatCells++; }
      q = q.map(roundUp);
    }
    corners.set(q, o);
  }
  let holes: Uint8Array | null = null;
  if (hole) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (!hole(x0 + (i + 0.5) * cell, z0 + (k + 0.5) * cell)) continue;
    holes ??= new Uint8Array(Math.ceil(nx * nz / 8));
    const b = i + nx * k;
    holes[b >> 3] = holes[b >> 3]! | (1 << (b & 7));
  }
  const field = createCellHeightfield(id, x0, z0, cell, nx, nz, corners, holes);
  let residual = 0;
  if (options.measure) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (!solidCell(field, i, k)) continue;
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
      const x = x0 + (i + (2 * a + 1) / 16) * cell, z = z0 + (k + (2 * b + 1) / 16) * cell;
      residual = Math.max(residual, floor(x, z) - cellHeightAt(field, i, k, x, z));
    }
  }
  return { ...field, lift, flatCells, residual };
}

/** A heightfield from shared lattice samples ((nx + 1) x (nz + 1), X fastest):
 * every cell takes its corners from them, so neighbours agree everywhere. */
export function createHeightfield(id: string, x0: number, z0: number, cell: number, nx: number, nz: number, heights: Float32Array,
  holes: Uint8Array | null = null): StaticHeightfield {
  if (heights.length !== (nx + 1) * (nz + 1)) throw new Error(`heightfield ${id}: ${heights.length} samples for ${nx} x ${nz} cells`);
  const r = nx + 1, corners = new Float32Array(nx * nz * 4);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++)
    corners.set([heights[i + r * k]!, heights[i + 1 + r * k]!, heights[i + r * (k + 1)]!, heights[i + 1 + r * (k + 1)]!], (i + nx * k) * 4);
  return createCellHeightfield(id, x0, z0, cell, nx, nz, corners, holes);
}

/** A heightfield from per-cell corners (four per cell, a, b, c, d). */
export function createCellHeightfield(id: string, x0: number, z0: number, cell: number, nx: number, nz: number, corners: Float32Array,
  holes: Uint8Array | null = null): StaticHeightfield {
  if (holes && holes.length !== Math.ceil(nx * nz / 8)) throw new Error(`heightfield ${id}: hole mask of ${holes.length} bytes for ${nx} x ${nz} cells`);
  if (corners.length !== nx * nz * 4) throw new Error(`heightfield ${id}: ${corners.length} corners for ${nx} x ${nz} cells`);
  if (!(cell > 0)) throw new Error(`heightfield ${id}: cell must be positive`);
  const tx = Math.ceil(nx / TILE), tz = Math.ceil(nz / TILE);
  const tileMin = new Float32Array(tx * tz).fill(Infinity), tileMax = new Float32Array(tx * tz).fill(-Infinity);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) for (let q = 0; q < 4; q++) {
    const h = corners[(i + nx * k) * 4 + q]!;
    if (Number.isNaN(h)) continue;
    if (!Number.isFinite(h)) throw new Error(`heightfield ${id}: infinite corner at ${i}, ${k}`);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    const t = Math.floor(i / TILE) + tx * Math.floor(k / TILE);
    tileMin[t] = Math.min(tileMin[t]!, h); tileMax[t] = Math.max(tileMax[t]!, h);
  }
  if (lo === Infinity) lo = hi = 0;
  return {
    kind: "heightfield", id, x0, z0, cell, nx, nz, corners, holes, tx, tz, tileMin, tileMax,
    bounds: { min: { x: x0, y: lo - SOLID_DEPTH, z: z0 }, max: { x: x0 + nx * cell, y: hi, z: z0 + nz * cell } },
    bytes: corners.byteLength + (holes?.byteLength ?? 0) + tileMin.byteLength + tileMax.byteLength, lift: 0, flatCells: 0, residual: 0,
  };
}

/** Cell (i, k)'s corners a, b, c, d. */
export function cellCorners(h: StaticHeightfield, i: number, k: number): [number, number, number, number] {
  const o = (i + h.nx * k) * 4, C = h.corners;
  return [C[o]!, C[o + 1]!, C[o + 2]!, C[o + 3]!];
}

/** The surface height at (x, z), or NaN outside the lattice or in a hole. */
export function heightAt(h: StaticHeightfield, x: number, z: number): number {
  const fx = (x - h.x0) / h.cell, fz = (z - h.z0) / h.cell;
  if (!(fx >= 0 && fz >= 0 && fx <= h.nx && fz <= h.nz)) return NaN;
  const i = Math.min(h.nx - 1, Math.floor(fx)), k = Math.min(h.nz - 1, Math.floor(fz)), u = fx - i, w = fz - k;
  // The whole cell's ownership, as overlap and walls read it (a NaN corner
  // empties the cell, even on its triangle that doesn't use that corner).
  if (!solidCell(h, i, k)) return NaN;
  const o = (i + h.nx * k) * 4, C = h.corners, a = C[o]!, b = C[o + 1]!, c = C[o + 2]!, d = C[o + 3]!;
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
  const o = (i + h.nx * k) * 4, C = h.corners, a = C[o]!, b = C[o + 1]!, c = C[o + 2]!, d = C[o + 3]!;
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return false;
  const x = h.x0 + i * h.cell, z = h.z0 + k * h.cell, X = x + h.cell, Z = z + h.cell;
  // Wound so (b - a) x (c - a) faces up (+Y).
  T[0] = x; T[1] = a; T[2] = z; T[3] = X; T[4] = d; T[5] = Z; T[6] = X; T[7] = b; T[8] = z;
  T[9] = x; T[10] = a; T[11] = z; T[12] = x; T[13] = c; T[14] = Z; T[15] = X; T[16] = d; T[17] = Z;
  return true;
}
const cellMin = (h: StaticHeightfield, i: number, k: number): number => {
  const o = (i + h.nx * k) * 4, C = h.corners;
  return Math.min(C[o]!, C[o + 1]!, C[o + 2]!, C[o + 3]!);
};
const cellMax = (h: StaticHeightfield, i: number, k: number): number => {
  const o = (i + h.nx * k) * 4, C = h.corners;
  return Math.max(C[o]!, C[o + 1]!, C[o + 2]!, C[o + 3]!);
};

/** Whether cell (i, k) is solid below its surface: in the lattice, not a hole, every corner sampled. */
export function solidCell(h: StaticHeightfield, i: number, k: number): boolean {
  if (i < 0 || k < 0 || i >= h.nx || k >= h.nz || isHole(h, i, k)) return false;
  const o = (i + h.nx * k) * 4, C = h.corners;
  return !(Number.isNaN(C[o]!) || Number.isNaN(C[o + 1]!) || Number.isNaN(C[o + 2]!) || Number.isNaN(C[o + 3]!));
}
/** Edges of a cell: west, east, south, north, as neighbour offset and outward normal. */
const EDGES = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
// Scratch wall triangles (0..8, 9..17).
const W = new Float64Array(18);
/** Corner slots of each edge's two ends (first, second), and the neighbour's matching slots. */
const EDGE_SLOTS = [[0, 2, 1, 3], [1, 3, 0, 2], [0, 1, 2, 3], [2, 3, 0, 1]] as const;
/** Writes the wall on edge `side` of solid cell (i, k) into W: the part of
 * the cell's edge that stands above what lies across it (the bounds' bottom
 * past a hole or the lattice's edge, else the neighbour's own edge), down to
 * it. Returns the number of triangles written (0, 1 where the edges cross,
 * or 2). */
function cellWall(h: StaticHeightfield, i: number, k: number, side: number): number {
  const [di, dk] = EDGES[side]!, [s0, s1, n0, n1] = EDGE_SLOTS[side]!, C = h.corners, c = h.cell, o = (i + h.nx * k) * 4;
  const top0 = C[o + s0]!, top1 = C[o + s1]!;
  let low0 = h.bounds.min.y, low1 = h.bounds.min.y;
  if (solidCell(h, i + di, k + dk)) { const p = (i + di + h.nx * (k + dk)) * 4; low0 = C[p + n0]!; low1 = C[p + n1]!; }
  const g0 = top0 - low0, g1 = top1 - low1;
  if (g0 <= 0 && g1 <= 0) return 0;
  // The edge's two ends in X/Z.
  const xa = h.x0 + (side === 1 ? i + 1 : i) * c, za = h.z0 + (side === 3 ? k + 1 : k) * c;
  const xb = xa + (side >= 2 ? c : 0), zb = za + (side < 2 ? c : 0);
  const put = (n: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): void => {
    W[n] = ax; W[n + 1] = ay; W[n + 2] = az; W[n + 3] = bx; W[n + 4] = by; W[n + 5] = bz; W[n + 6] = cx; W[n + 7] = cy; W[n + 8] = cz;
  };
  if (g0 > 0 && g1 > 0) {
    put(0, xa, low0, za, xb, low1, zb, xb, top1, zb);
    put(9, xa, low0, za, xb, top1, zb, xa, top0, za);
    return 2;
  }
  // The edges cross at s along it: the wall is the triangle on the side where the cell stands higher.
  const t = g0 / (g0 - g1), xm = xa + (xb - xa) * t, zm = za + (zb - za) * t, ym = low0 + (low1 - low0) * t;
  if (g0 > 0) put(0, xa, low0, za, xm, ym, zm, xa, top0, za);
  else put(0, xm, ym, zm, xb, low1, zb, xb, top1, zb);
  return 1;
}
/** Surface height of cell (i, k)'s own triangles at (x, z), clamped into the cell. */
function cellHeightAt(h: StaticHeightfield, i: number, k: number, x: number, z: number): number {
  const u = Math.max(0, Math.min(1, (x - h.x0) / h.cell - i)), w = Math.max(0, Math.min(1, (z - h.z0) / h.cell - k));
  const o = (i + h.nx * k) * 4, C = h.corners, a = C[o]!, b = C[o + 1]!, c = C[o + 2]!, d = C[o + 3]!;
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
    // Walls where this solid cell stands above what lies across an edge.
    for (let side = 0; side < 4; side++) {
      const n = cellWall(h, i, k, side), [ox, oz] = EDGES[side]!;
      for (let w = 0; w < n; w++) found = faceContact(W, w * 9, ox, 0, oz, cx, cy, cz, ex, ey, ez, dx, dy, dz, skin, out, found);
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
    top = Math.max(top, cellMax(h, i, k));
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
      const top = cellMax(h, i, k);
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
    if (!(yLow > cellMax(h, i, k)) && cellTriangles(h, i, k)) {
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
