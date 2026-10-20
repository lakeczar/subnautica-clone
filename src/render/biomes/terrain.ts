import type { ChunkArtFactory, ChunkBuildContext, ChunkRecipe, MeshRecipe } from "../kit/types.js";
import type { ChunkDescriptor } from "../../world/types.js";
import { decodeTerrain } from "./terrainCodec.js";
import type { TerrainStore } from "./terrainAssets.js";
import type { LodLevel, Rect } from "../../world/types.js";
import { BORDER_STEP, COARSE, FINE, tessellate, type TessellationOptions } from "./tessellate.js";
import { regionAtPoint } from "../../content/regions/layout.js";
import { fbm } from "../../content/regions/noise.js";
import { BRINE_Y, emptyMasks, terrainMasks } from "../../content/regions/terrain.js";
import { TERRAIN_EXTENT } from "../terrainSurface.js";
import { geologyColor } from "./geology.js";
import { hex } from "./recipe.js";

/** `s2.terrain`: the shared floor as one mesh per chunk, sampled only from
 * `ctx.floor` and tessellated to a bounded error (see `tessellate.ts`):
 * fine within 0.2 m and coarse within 1 m of the floor, measured to each
 * triangle's plane. Chunk edges are identical for every LOD and neighbour.
 * Cells inside today's terrain mesh (TERRAIN_EXTENT) are left to the existing
 * renderer, with a short skirt along that seam. Brine chunks also get the
 * mirror sheet at the dense interface. */
const LEGACY = TERRAIN_EXTENT;
const SKIRT = 1.5;
const MIRROR = hex("#a9b8dc"), MIRROR2 = hex("#c7d0ea");
const NORMAL_STEP = 0.25;

export function terrainOptions(rect: Rect, lod: LodLevel): TessellationOptions {
  const cut = rect.minX < LEGACY.maxX && rect.maxX > LEGACY.minX && rect.minZ < LEGACY.maxZ && rect.maxZ > LEGACY.minZ;
  const o = lod === "fine" ? FINE : COARSE;
  // Chunks cut by the legacy edge keep the border step as their base so the
  // edge's extra lines never split a cell off the shared border lattice.
  return { base: cut ? BORDER_STEP : o.base, tolerance: o.tolerance, min: o.min, ...(cut ? { hole: LEGACY } : {}) };
}

let store: TerrainStore | null = null;
/** Use baked terrain assets (null: always tessellate live, the dev fallback). */
export function setTerrainStore(next: TerrainStore | null): void { store = next; }
export function terrainStore(): TerrainStore | null { return store; }

/** `s2.terrain`: decodes the chunk's baked recipe when a store is set and has
 * the file (fetch and decode are async and sliced by `due()`), otherwise
 * builds it live. Both paths give the same recipe up to the codec's
 * quantization; the live path is the bake's source and the test oracle. */
export const terrainFactory: ChunkArtFactory = {
  id: "s2.terrain",
  *build(ctx, chunk, _ref, lod) {
    const { min, max } = chunk.bounds, rect = { minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z };
    if (store) {
      const file = store.request(chunk.id);
      // Usually cached already (neighbour and coarse-band prefetch); otherwise
      // each step only checks whether the fetch has landed.
      while (!file.settled) yield;
      if (file.bytes) return { meshes: yield* decodeTerrain(file.bytes, rect, chunk.id, lod, ctx.due), instances: [] };
    }
    return yield* liveTerrain(ctx, chunk, lod);
  },
};

/** The live recipe: error-bounded tessellation, normals, geology colours,
 * legacy-seam skirt and brine mirror. Deterministic for a chunk and LOD. */
export function* liveTerrain(ctx: ChunkBuildContext, chunk: ChunkDescriptor, lod: LodLevel): Generator<void, ChunkRecipe> {
  {
    const { min, max } = chunk.bounds, rect = { minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z };
    const t = yield* tessellate(ctx.floor, rect, { ...terrainOptions(rect, lod), due: ctx.due });
    const positions = t.positions, normals: number[] = [], colors: number[] = [], indices = [...t.triangles];
    const masks = emptyMasks();
    for (let v = 0; v < positions.length; v += 3) {
      const x = positions[v]!, y = positions[v + 1]!, z = positions[v + 2]!;
      // Forward differences from the vertex's own height: a function of the
      // point alone, so both chunks sharing an edge vertex agree.
      const gx = (ctx.floor(x + NORMAL_STEP, z) - y) / NORMAL_STEP, gz = (ctx.floor(x, z + NORMAL_STEP) - y) / NORMAL_STEP;
      const len = Math.hypot(gx, 1, gz);
      normals.push(-gx / len, 1 / len, -gz / len);
      terrainMasks(x, z, masks);
      geologyColor(x, y, z, Math.hypot(gx, gz), regionAtPoint(x, z) ?? "refuge_reef", masks, colors);
      if (ctx.due()) yield;
    }
    // Seam skirt below each edge facing the legacy mesh, sharing its top vertices.
    for (let e = 0; e < t.skirtEdges.length; e += 2) {
      const a = t.skirtEdges[e]!, b = t.skirtEdges[e + 1]!, base = positions.length / 3;
      for (const k of [a, b]) {
        positions.push(positions[k * 3]!, positions[k * 3 + 1]! - SKIRT, positions[k * 3 + 2]!);
        normals.push(normals[k * 3]!, normals[k * 3 + 1]!, normals[k * 3 + 2]!);
        colors.push(colors[k * 4]! * 0.8, colors[k * 4 + 1]! * 0.8, colors[k * 4 + 2]! * 0.8, 1);
      }
      indices.push(a, b, base + 1, a, base + 1, base);
    }
    const meshes: MeshRecipe[] = [];
    if (indices.length) meshes.push({
      name: `${chunk.id}.terrain`, positions: new Float32Array(positions), normals: new Float32Array(normals),
      colors: new Float32Array(colors),
      indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
    });
    if (ctx.due()) yield;
    const mirror = brineMirror(ctx.floor, min.x, min.z, max.x, max.z, chunk.id);
    if (mirror) meshes.push(mirror);
    return { meshes, instances: [] } satisfies ChunkRecipe;
  }
}

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
