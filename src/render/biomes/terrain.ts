import type { ChunkArtFactory, ChunkRecipe, MeshRecipe } from "../kit/types.js";
import { regionAtPoint } from "../../content/regions/layout.js";
import { fbm } from "../../content/regions/noise.js";
import { BRINE_Y, emptyMasks, terrainMasks } from "../../content/regions/terrain.js";
import { TERRAIN_EXTENT } from "../terrainSurface.js";
import { geologyColor } from "./geology.js";
import { hex } from "./recipe.js";

/** `s2.terrain`: the shared floor as one mesh per chunk, sampled only from
 * `ctx.floor`. Fine LOD samples every 2 m, coarse every 8 m. Where the chunk
 * overlaps today's terrain mesh (TERRAIN_EXTENT) the grid gains lines exactly
 * on that mesh's edge, cells inside it are left to the existing renderer, and
 * a short skirt closes any sub-centimetre crack along the seam. Brine chunks
 * also get the mirror sheet at the dense interface. */
const LEGACY = TERRAIN_EXTENT;
const SKIRT = 1.5;
const MIRROR = hex("#a9b8dc"), MIRROR2 = hex("#c7d0ea");

const insideLegacy = (x0: number, x1: number, z0: number, z1: number): boolean =>
  x0 >= LEGACY.minX - 1e-9 && x1 <= LEGACY.maxX + 1e-9 && z0 >= LEGACY.minZ - 1e-9 && z1 <= LEGACY.maxZ + 1e-9;

function axis(lo: number, hi: number, step: number, cuts: readonly number[]): number[] {
  const v: number[] = [];
  for (let t = lo; t < hi - 1e-9; t += step) v.push(t);
  v.push(hi);
  for (const c of cuts) if (c > lo + 1e-6 && c < hi - 1e-6) v.push(c);
  return [...new Set(v.map(n => Math.round(n * 1e6) / 1e6))].sort((a, b) => a - b);
}

export const terrainFactory: ChunkArtFactory = {
  id: "s2.terrain",
  *build(ctx, chunk, _ref, lod) {
    const step = lod === "fine" ? 2 : 8;
    const { min, max } = chunk.bounds;
    const xs = axis(min.x, max.x, step, [LEGACY.minX, LEGACY.maxX]);
    const zs = axis(min.z, max.z, step, [LEGACY.minZ, LEGACY.maxZ]);
    const nx = xs.length, nz = zs.length;
    const h = new Float64Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) { h[j * nx + i] = ctx.floor(xs[i]!, zs[j]!); if (i % 48 === 47) yield; }
      yield;
    }
    const at = (i: number, j: number): number => h[j * nx + i]!;
    const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
    const masks = emptyMasks();
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = xs[i]!, z = zs[j]!, y = at(i, j);
        const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nz - 1, j + 1);
        const gx = (at(i1, j) - at(i0, j)) / (xs[i1]! - xs[i0]!), gz = (at(i, j1) - at(i, j0)) / (zs[j1]! - zs[j0]!);
        const len = Math.hypot(gx, 1, gz);
        positions.push(x, y, z);
        normals.push(-gx / len, 1 / len, -gz / len);
        terrainMasks(x, z, masks);
        geologyColor(x, y, z, Math.hypot(gx, gz), regionAtPoint(x, z) ?? "refuge_reef", masks, colors);
        if (i % 6 === 5) yield;
      }
      yield;
    }
    const skipped = (i: number, j: number): boolean => insideLegacy(xs[i]!, xs[i + 1]!, zs[j]!, zs[j + 1]!);
    const v = (i: number, j: number): number => j * nx + i;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (skipped(i, j)) continue;
      // Alternate the diagonal so long slopes do not facet in one direction.
      if ((i + j) % 2) indices.push(v(i, j), v(i, j + 1), v(i + 1, j), v(i + 1, j), v(i, j + 1), v(i + 1, j + 1));
      else indices.push(v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i + 1, j));
    }
    // Seam skirt: a short wall below each kept cell edge that borders the
    // legacy mesh, sharing the edge's own vertices on top.
    const skirt = (a: number, b: number): void => {
      const base = positions.length / 3;
      for (const k of [a, b]) {
        positions.push(positions[k * 3]!, positions[k * 3 + 1]! - SKIRT, positions[k * 3 + 2]!);
        normals.push(normals[k * 3]!, normals[k * 3 + 1]!, normals[k * 3 + 2]!);
        colors.push(colors[k * 4]! * 0.8, colors[k * 4 + 1]! * 0.8, colors[k * 4 + 2]! * 0.8, 1);
      }
      indices.push(a, b, base + 1, a, base + 1, base);
    };
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (skipped(i, j)) continue;
      if (i > 0 && skipped(i - 1, j)) skirt(v(i, j), v(i, j + 1));
      if (i < nx - 2 && skipped(i + 1, j)) skirt(v(i + 1, j), v(i + 1, j + 1));
      if (j > 0 && skipped(i, j - 1)) skirt(v(i, j), v(i + 1, j));
      if (j < nz - 2 && skipped(i, j + 1)) skirt(v(i, j + 1), v(i + 1, j + 1));
    }
    const meshes: MeshRecipe[] = [];
    if (indices.length) meshes.push({
      name: `${chunk.id}.terrain`, positions: new Float32Array(positions), normals: new Float32Array(normals),
      colors: new Float32Array(colors),
      indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
    });
    yield;
    const mirror = brineMirror(ctx.floor, chunk.bounds.min.x, chunk.bounds.min.z, chunk.bounds.max.x, chunk.bounds.max.z, chunk.id);
    if (mirror) meshes.push(mirror);
    return { meshes, instances: [] } satisfies ChunkRecipe;
  },
};

/** The dense brine's mirror: an unlit, softly varied sheet at BRINE_Y over
 * cells whose floor lies below it, south of the Divide crest. */
function brineMirror(floor: (x: number, z: number) => number, x0: number, z0: number, x1: number, z1: number, id: string): MeshRecipe | null {
  const step = 8, positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const m = emptyMasks();
  for (let z = z0; z < z1; z += step) for (let x = x0; x < x1; x += step) {
    const cx = x + step / 2, cz = z + step / 2;
    if (regionAtPoint(cx, cz) !== "brine_divide" || cx > 950) continue;
    terrainMasks(cx, cz, m);
    if (m.brineSide < 0.3) continue;
    if (Math.min(floor(x, z), floor(x + step, z), floor(x, z + step), floor(x + step, z + step)) > BRINE_Y + 0.5) continue;
    const base = positions.length / 3;
    for (const [px, pz] of [[x, z], [x + step, z], [x + step, z + step], [x, z + step]] as const) {
      const w = fbm(px, pz, 30, 2, 77), streak = fbm(px * 0.35, pz * 1.6, 18, 2, 78);
      positions.push(px, BRINE_Y + 0.25 * w, pz);
      const c = streak > 0.2 ? MIRROR2 : MIRROR, k = 0.68 + 0.12 * Math.max(0, w);
      colors.push(c[0] * k, c[1] * k, c[2] * k, -1);
    }
    indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }
  if (!indices.length) return null;
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  return { name: `${id}.brine-mirror`, positions: new Float32Array(positions), normals, colors: new Float32Array(colors),
    indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices) };
}
