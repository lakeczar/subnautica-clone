import { PALETTE as P } from "../palette.js";
import { RecipeBuilder, rgba, writeMatrix, type Rgba } from "./recipe.js";
import { BIOME_MIX } from "./templates.js";
import type { ChunkArtFactory, ChunkBuildContext, InstanceRecipe, MeshRecipe } from "./types.js";
import type { ChunkDescriptor } from "../../world/types.js";

/** Stable 32-bit seed for a chunk and a salt. */
export function chunkSeed(chunk: ChunkDescriptor, salt: number): number {
  let h = 2166136261 ^ salt;
  for (const v of [chunk.cell.ix, chunk.cell.iz, chunk.cell.layer]) { h = Math.imul(h ^ v, 16777619); h ^= h >>> 13; }
  return h >>> 0;
}
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
}
export const defaultContext = (floor: (x: number, z: number) => number): ChunkBuildContext => ({ floor, random: seededRandom });

const GROUND: Record<string, readonly [string, string]> = {
  reef_shelf: [P.sand, P.stoneLight], island_shoal: [P.shore, P.sand], canopy_crown: [P.stoneLight, P.deep],
  silt_bowl: [P.shell, P.shade], thermal_fracture: [P.basalt, P.ink], brine_saddle: [P.deep, P.petrol],
  research_terrace: [P.stoneLight, P.basalt],
};

/** Heightfield terrain on the chunk cell, sampled from the physical floor.
 * Fine 2 m, coarse 8 m spacing; a skirt hides cracks against a neighbour at
 * the other LOD. Alpha 0 marks ground for the cel shader's sediment relief. */
export const terrainFactory: ChunkArtFactory = {
  id: "terrain",
  *build(ctx, chunk, ref, lod) {
    const spacing = lod === "fine" ? Number(ref.params?.fine ?? 2) : Number(ref.params?.coarse ?? 8);
    const { min, max } = chunk.bounds, n = Math.round((max.x - min.x) / spacing);
    const side = n + 3, h = new Float64Array(side * side);
    // Heights with a one-sample border, so edge normals match the neighbour's.
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) h[j * side + i] = ctx.floor(min.x + (i - 1) * spacing, min.z + (j - 1) * spacing);
      if (j % 16 === 15) yield;
    }
    const at = (i: number, j: number): number => h[(j + 1) * side + (i + 1)]!;
    const [light, dark] = GROUND[chunk.biome] ?? [P.sand, P.stoneLight];
    const lightC = rgba(light, 0), darkC = rgba(dark, 0);
    const b = new RecipeBuilder();
    const colorAt = (y: number, slope: number): Rgba => {
      const t = Math.min(1, Math.max(0, slope * 1.4 + Math.max(0, -y - 40) / 900));
      return [lightC[0] + (darkC[0] - lightC[0]) * t, lightC[1] + (darkC[1] - lightC[1]) * t,
        lightC[2] + (darkC[2] - lightC[2]) * t, 0];
    };
    const grid: number[] = [];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const y = at(i, j), dx = (at(i + 1, j) - at(i - 1, j)) / (2 * spacing), dz = (at(i, j + 1) - at(i, j - 1)) / (2 * spacing);
        grid.push(b.vertex([min.x + i * spacing, y, min.z + j * spacing], [-dx, 1, -dz], colorAt(y, Math.hypot(dx, dz))));
      }
      if (j % 16 === 15) yield;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = grid[j * (n + 1) + i]!, c = grid[(j + 1) * (n + 1) + i]!;
      b.triangle(a, c, a + 1); b.triangle(a + 1, c, c + 1);
    }
    // Skirt: drop each border vertex by more than the coarse sampling error.
    const drop = Number(ref.params?.coarse ?? 8) * 1.5 + 2;
    const border = (k: number, edge: number): [number, number] =>
      edge === 0 ? [k, 0] : edge === 1 ? [n, k] : edge === 2 ? [n - k, n] : [0, n - k];
    for (let edge = 0; edge < 4; edge++) for (let k = 0; k < n; k++) {
      const [i0, j0] = border(k, edge), [i1, j1] = border(k + 1, edge);
      const top0 = grid[j0 * (n + 1) + i0]!, top1 = grid[j1 * (n + 1) + i1]!;
      const out: [number, number, number] = edge === 0 ? [0, 0, -1] : edge === 1 ? [1, 0, 0] : edge === 2 ? [0, 0, 1] : [-1, 0, 0];
      const lo0 = b.vertex([min.x + i0 * spacing, at(i0, j0) - drop, min.z + j0 * spacing], out, darkC);
      const lo1 = b.vertex([min.x + i1 * spacing, at(i1, j1) - drop, min.z + j1 * spacing], out, darkC);
      b.triangle(top0, lo0, top1); b.triangle(top1, lo0, lo1);
    }
    return { meshes: [b.build(`terrain.${lod}`)], instances: [] };
  },
};

/** Deterministic instanced vegetation and rubble. Coarse instances are an
 * exact subset of fine ones at the same transforms, so a LOD swap never moves
 * an object; only small fine-only clutter disappears. */
export const scatterFactory: ChunkArtFactory = {
  id: "scatter",
  *build(ctx, chunk, ref, lod) {
    const density = Number(ref.params?.density ?? 1), keepCoarse = Number(ref.params?.coarseFraction ?? 0.35);
    const mix = BIOME_MIX[chunk.biome] ?? BIOME_MIX.reef_shelf!;
    const total = mix.reduce((n, [, w]) => n + w, 0);
    const { min, max } = chunk.bounds;
    const area = (max.x - min.x) * (max.z - min.z);
    const count = Math.round((density / 100) * area);
    const rand = ctx.random(chunkSeed(chunk, 0x5ca7));
    const batches = new Map<string, { m: number[]; t: number[] }>();
    const matrix = new Float32Array(16);
    for (let k = 0; k < count; k++) {
      // Fixed number of draws per candidate keeps fine and coarse in lockstep.
      const x = min.x + rand() * (max.x - min.x), z = min.z + rand() * (max.z - min.z);
      const pick = rand() * total, yaw = rand() * Math.PI * 2, s = 0.6 + rand() * 0.9, tone = 0.82 + rand() * 0.3;
      const keep = rand(), tilt = (rand() - 0.5) * 0.25;
      if (k % 256 === 255) yield;
      if (lod === "coarse" && keep > keepCoarse * (0.6 + s * 0.4)) continue;
      const y = ctx.floor(x, z);
      if (y > -1.2) continue; // underwater life only
      let acc = 0, template = mix[0]![0];
      for (const [id, w] of mix) { acc += w; if (pick < acc) { template = id; break; } }
      writeMatrix(matrix, 0, x, y - 0.05, z, yaw, [s, s * (0.8 + tone * 0.3), s], tilt, -tilt);
      const batch = batches.get(template) ?? { m: [], t: [] };
      batches.set(template, batch);
      for (let q = 0; q < 16; q++) batch.m.push(matrix[q]!);
      batch.t.push(tone, tone, tone, 1);
    }
    const instances: InstanceRecipe[] = [...batches].map(([template, b]) => ({
      template, matrices: new Float32Array(b.m), tints: new Float32Array(b.t),
    }));
    return { meshes: [], instances };
  },
};

/** Stand-in for an authored regional set piece (wreck, works, gallery): one
 * merged mesh of beams, plates and tanks, heavy at fine LOD. It exists so the
 * harness spends bytes the way S2's art will, not as final art. */
export const setPieceFactory: ChunkArtFactory = {
  id: "setpiece",
  *build(ctx, chunk, ref, lod) {
    const rand = ctx.random(chunkSeed(chunk, 0x5e7));
    const parts = Number(ref.params?.parts ?? 90);
    const fine = lod === "fine";
    const { min, max } = chunk.bounds;
    const cx = min.x + 32 + rand() * (max.x - min.x - 64), cz = min.z + 32 + rand() * (max.z - min.z - 64);
    const base = ctx.floor(cx, cz);
    const b = new RecipeBuilder();
    const metal = rgba(P.metal, 1.6), pale = rgba(P.porcelain, 1.4), seam = rgba(P.seam, 1);
    for (let k = 0; k < parts; k++) {
      // Same draws per part at every LOD; coarse keeps every third part.
      const a = rand() * Math.PI * 2, r = 4 + rand() * 22, kind = rand(), yaw = rand() * Math.PI;
      const u = rand(), v = rand(), w = rand();
      if (k % 24 === 23) yield;
      if (!fine && k % 3) continue;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = ctx.floor(x, z);
      if (kind < 0.45) {
        const h = 2 + u * 9;
        b.box([x, y + h / 2, z], [0.5 + v, h, 0.5 + w], k % 3 ? metal : seam, yaw);
      } else if (kind < 0.8) {
        b.box([x, y + 0.3 + u * 6, z], [3 + v * 6, 0.3, 2 + w * 4], pale, yaw);
      } else if (fine) {
        b.ellipsoid([x, y + 1.6, z], [1.6, 1.6, 2.6], pale, 16);
        b.tube([[x, y + 1.6, z], [x + 2, base + 4, z + 1], [x + (cx - x) * 0.5, base + 7, z + (cz - z) * 0.5], [cx, base + 6, cz]], 0.18, seam, 10);
      } else {
        b.box([x, y + 1.6, z], [3, 3, 5], pale, yaw);
      }
    }
    const mesh: MeshRecipe = b.build(`setpiece.${lod}`);
    return { meshes: [mesh], instances: [] };
  },
};

export const KIT_FACTORIES: readonly ChunkArtFactory[] = [terrainFactory, scatterFactory, setPieceFactory];
