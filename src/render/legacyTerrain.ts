// FORK(legacy-terrain): B1's accepted opening terrain (island, reef, Canopy and
// Basin benchmark), live and owned: it is not dead code. Kept until the
// bigger-map re-evaluation (TER-09) migrates it into the authored terrain (CORE-HELPERS).
import { fractureDepth, legacyWorldHeight as terrainHeight } from "../sim/terrain.js";
import { PALETTE as P } from "./palette.js";
import type { ChunkArtFactory, MeshRecipe } from "./kit/types.js";
import { terrainSurfaceSteps, type TerrainSurface, type TerrainWindow } from "./terrainSurface.js";

/** Factory ID of today's refined route terrain, cut into chunks. */
export const LEGACY_TERRAIN_FACTORY = "legacy.terrain";

type Rgb = readonly [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const unit = (n: number): number => Math.max(0, Math.min(1, n));
const HEX = new Map<string, Rgb>();
const rgb = (h: string): Rgb => {
  let c = HEX.get(h);
  if (!c) HEX.set(h, c = hex(h));
  return c;
};

/** Normals and colours for the refined surface, from the physical floor.
 * The same formulas and the same float order as the former single terrain
 * mesh, so every submitted vertex is bit-identical to it. Alpha 0 marks
 * ground for the shared cel pass. */
export function* legacyTerrainRecipe(surface: TerrainSurface, name: string,
  due: () => boolean = () => false): Generator<void, MeshRecipe> {
  const { positions } = surface, count = positions.length / 3;
  const normals = new Float32Array(count * 3), colors = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    const px = positions[v * 3]!, py = positions[v * 3 + 1]!, pz = positions[v * 3 + 2]!;
    const dx = (terrainHeight(px + 0.1, pz) - terrainHeight(px - 0.1, pz)) / 0.2;
    const dz = (terrainHeight(px, pz + 0.1) - terrainHeight(px, pz - 0.1)) / 0.2;
    const length = Math.hypot(dx, 1, dz);
    normals[v * 3] = -dx / length; normals[v * 3 + 1] = 1 / length; normals[v * 3 + 2] = -dz / length;
    const patch = Math.sin(px * 0.2 + pz * 0.12) * Math.cos(pz * 0.16);
    let tone: string = py > 13 ? P.basalt : py > 3.3 ? (patch > 0.1 ? "#81966e" : "#76947b")
      : py > -1.2 ? P.shore : patch > 0.44 ? "#789c94" : P.sand;
    if (Math.hypot(dx, dz) > 1.15) tone = py > 0 ? "#5c7f7e" : "#669894";
    // Upper Canopy sediment is cooler and lower in value than reef sand.
    // Blend on the same physical height field; no extra shelf or false floor.
    const canopy = unit((px - 60) / 30) * unit((-py - 35) / 40);
    const c = lerp(rgb(tone), rgb(patch > .3 ? "#4b807a" : "#2e616c"), canopy);
    const basin = unit((-pz - 180) / 30) * unit((px - 85) / 25);
    // Two sediment lanes have different widths/values. They are a surface
    // pattern on the real slope, not a current/visibility simulation.
    const lane = Math.sin((px - 170) * .14 + pz * .08 + Math.sin(pz * .07) * 1.2);
    const sediment = rgb(lane > .3 ? "#638d8b" : "#335e70");
    // The boundary fracture darkens with its own extra depth: fresh, unsorted slope.
    const fracture = unit(fractureDepth(px, pz) / 30);
    const color = lerp(lerp(c, sediment, basin), rgb("#203f52"), fracture * .8);
    colors[v * 4] = color[0]; colors[v * 4 + 1] = color[1]; colors[v * 4 + 2] = color[2]; colors[v * 4 + 3] = 0;
    if ((v & 255) === 255 && due()) yield;
  }
  return {
    name, positions: new Float32Array(positions), normals, colors,
    indices: count > 65535 ? new Uint32Array(surface.indices) : new Uint16Array(surface.indices),
  };
}

/** Today's refined route terrain for one chunk: exactly the whole surface's
 * triangles whose centroid lies in the chunk's cell, with the closed walls of
 * its discontinuities (see `terrainSurfaceSteps`). Neighbouring chunks share
 * the surface's own vertices, so they meet without cracks. The surface has no
 * coarse form: both LODs are the same recipe.
 *
 * Optional params `minX`/`maxX`/`minZ`/`maxZ` clip it to an extent, by the
 * same centroid rule (half-open), so a region pack can own the rest. An edge
 * on a terrain grid line (`terrainGridLines`) clips straight; elsewhere the
 * cut follows the cells it crosses. Default: the whole `TERRAIN_EXTENT`. */
export const legacyTerrainFactory: ChunkArtFactory = {
  id: LEGACY_TERRAIN_FACTORY,
  *build(ctx, chunk, ref) {
    const clip = (key: "minX" | "maxX" | "minZ" | "maxZ", own: number, pick: (a: number, b: number) => number): number => {
      const v = ref.params?.[key];
      return typeof v === "number" ? pick(own, v) : own;
    };
    const window: TerrainWindow = { minX: clip("minX", chunk.bounds.min.x, Math.max), maxX: clip("maxX", chunk.bounds.max.x, Math.min),
      minZ: clip("minZ", chunk.bounds.min.z, Math.max), maxZ: clip("maxZ", chunk.bounds.max.z, Math.min) };
    if (!(window.minX < window.maxX && window.minZ < window.maxZ)) return { meshes: [], instances: [] };
    const surface = yield* terrainSurfaceSteps({ window, due: ctx.due });
    if (!surface.indices.length) return { meshes: [], instances: [] };
    return { meshes: [yield* legacyTerrainRecipe(surface, LEGACY_TERRAIN_FACTORY, ctx.due)], instances: [] };
  },
};

function finish<T>(steps: Generator<void, T>): T {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** The whole refined surface as one recipe, built synchronously (tests and
 * the complete environment; the renderer streams it per chunk instead). */
export function legacyTerrainWhole(name = "island.terrain"): MeshRecipe {
  return finish(legacyTerrainRecipe(finish(terrainSurfaceSteps()), name));
}
