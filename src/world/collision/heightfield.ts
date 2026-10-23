import type { Aabb, Rect, Vec3 } from "../types.js";
import {
  boxOverlapsTriangle, boxTriangleSeparation, segmentTriangle, sweepBoxTriangle, type Separation, type SweepHit,
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
 * A box with no crossing triangle lies wholly above or wholly below the
 * surface in each cell under it, so a buried box is found by its bottom
 * centre per cell. A sweep that starts buried keeps a contact facing up:
 * it may rise or slide, never sink deeper. */

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
}

export const TILE = 8;

/** Sample `floor` on a lattice over `rect` (snapped outwards to `cell`).
 * `hole(cx, cz)`, given a cell's centre, marks it a hole. */
export function sampleHeightfield(id: string, rect: Rect, cell: number, floor: (x: number, z: number) => number,
  hole?: (cx: number, cz: number) => boolean): StaticHeightfield {
  const x0 = Math.floor(rect.minX / cell) * cell, z0 = Math.floor(rect.minZ / cell) * cell;
  const nx = Math.max(1, Math.ceil((rect.maxX - x0) / cell - 1e-9)), nz = Math.max(1, Math.ceil((rect.maxZ - z0) / cell - 1e-9));
  const heights = new Float32Array((nx + 1) * (nz + 1));
  for (let k = 0; k <= nz; k++) for (let i = 0; i <= nx; i++) heights[i + (nx + 1) * k] = floor(x0 + i * cell, z0 + k * cell);
  let holes: Uint8Array | null = null;
  if (hole) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (!hole(x0 + (i + 0.5) * cell, z0 + (k + 0.5) * cell)) continue;
    holes ??= new Uint8Array(Math.ceil(nx * nz / 8));
    const b = i + nx * k;
    holes[b >> 3] = holes[b >> 3]! | (1 << (b & 7));
  }
  return createHeightfield(id, x0, z0, cell, nx, nz, heights, holes);
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
    bounds: { min: { x: x0, y: lo, z: z0 }, max: { x: x0 + nx * cell, y: hi, z: z0 + nz * cell } },
    bytes: heights.byteLength + (holes?.byteLength ?? 0) + tileMin.byteLength + tileMax.byteLength,
  };
}

/** The surface height at (x, z), or NaN outside the lattice or in a hole. */
export function heightAt(h: StaticHeightfield, x: number, z: number): number {
  const fx = (x - h.x0) / h.cell, fz = (z - h.z0) / h.cell;
  if (!(fx >= 0 && fz >= 0 && fx <= h.nx && fz <= h.nz)) return NaN;
  const i = Math.min(h.nx - 1, Math.floor(fx)), k = Math.min(h.nz - 1, Math.floor(fz)), u = fx - i, w = fz - k;
  if (isHole(h, i, k)) return NaN;
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
      if (dy < -1e-12 && (!found || out.t > 0)) { out.t = 0; out.nx = 0; out.ny = 1; out.nz = 0; out.start = true; found = true; }
      return false;
    }
    for (const o of [0, 9]) {
      if (!sweepBoxTriangle(cx, cy, cz, ex, ey, ez, dx, dy, dz, T, o, o + 3, o + 6, skin, HIT)) continue;
      if (!found || HIT.t < out.t) { out.t = HIT.t; out.nx = HIT.nx; out.ny = HIT.ny; out.nz = HIT.nz; out.start = HIT.start; found = true; }
    }
    return false;
  });
  return found;
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

/** True when segment a -> b neither crosses the surface nor starts under it.
 * Walks the cells under the segment's X/Z projection (2D DDA). */
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
    if (!(yLow > cellTop) && cellTriangles(h, i, k) &&
      (segmentTriangle(a.x, a.y, a.z, dx, dy, dz, T, 0, 3, 6) >= 0 || segmentTriangle(a.x, a.y, a.z, dx, dy, dz, T, 9, 12, 15) >= 0)) return false;
    if (tEnd >= t1) break;
    t = tEnd;
    if (tx <= tz) { i += si; tx = nextX(); } else { k += sk; tz = nextZ(); }
    if (i < 0 || k < 0 || i >= h.nx || k >= h.nz) break;
  }
  return true;
}
