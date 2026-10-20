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
/** Build context whose `due()` turns true `stepMs` after `startStep()`; the
 * kit loader starts the clock before resuming each factory step. */
export function defaultContext(floor: (x: number, z: number) => number, stepMs = 0.75,
  now: () => number = () => performance.now(), biomeAt?: (x: number, z: number) => string,
): ChunkBuildContext & { startStep(): void } {
  let deadline = Infinity;
  return {
    floor, random: seededRandom, ...(biomeAt ? { biomeAt } : {}),
    due: () => now() >= deadline,
    startStep() { deadline = now() + stepMs; },
  };
}

const GROUND: Record<string, readonly [string, string]> = {
  reef_shelf: [P.sand, P.stoneLight], island_shoal: [P.shore, P.sand], canopy_crown: [P.stoneLight, P.deep],
  silt_bowl: [P.shell, P.shade], thermal_fracture: [P.basalt, P.ink], brine_saddle: [P.deep, P.petrol],
  research_terrace: [P.stoneLight, P.basalt],
};

/** Heightfield terrain on the chunk cell, sampled from the physical floor.
 * Every LOD shares one border: the floor sampled at the FINE spacing along
 * all four edges (heights, normals and colours from the same samples). Fine
 * terrain is a full fine grid; coarse terrain is a coarse interior lattice
 * zipped to that fine border ring. Two chunks therefore meet on identical
 * edge polylines whatever LOD either shows, on both axes: no cracks and no
 * skirts. Alpha 0 marks ground for the cel shader's sediment relief. */
export const terrainFactory: ChunkArtFactory = {
  id: "terrain",
  *build(ctx, chunk, ref, lod) {
    const f = Number(ref.params?.fine ?? 2), S = lod === "fine" ? f : Number(ref.params?.coarse ?? 8);
    const { min, max } = chunk.bounds, m = Math.round((max.x - min.x) / f);
    // Coarse needs a whole number of fine steps per coarse step and at least
    // one interior lattice row; otherwise it is the fine layout.
    const r = Math.round(S / f), n = Math.round(m / r);
    const zipped = r > 1 && Math.abs(r * f - S) < 1e-9 && n * r === m && n >= 3;
    // Lazy floor samples on the fine lattice, with a one-sample margin.
    const side = m + 3, h = new Float64Array(side * side).fill(NaN);
    const H = (i: number, j: number): number => {
      const k = (j + 1) * side + (i + 1);
      let y = h[k]!;
      if (Number.isNaN(y)) h[k] = y = ctx.floor(min.x + i * f, min.z + j * f);
      return y;
    };
    // Ground palette blended on a 16 m world lattice: every lattice point
    // averages the biomes within 16 m, so chunks agree along shared edges.
    const LATTICE = 16;
    const palette = (biome: string): readonly [Rgba, Rgba] => {
      const [light, dark] = GROUND[biome] ?? [P.sand, P.stoneLight];
      return [rgba(light, 0), rgba(dark, 0)];
    };
    const lattice = new Map<string, readonly [Rgba, Rgba]>();
    const latticeAt = (lx: number, lz: number): readonly [Rgba, Rgba] => {
      const k = `${lx}:${lz}`, hit = lattice.get(k);
      if (hit) return hit;
      const acc = [0, 0, 0, 0, 0, 0];
      for (const ox of [-1, 0, 1]) for (const oz of [-1, 0, 1]) {
        const [l, d] = palette(ctx.biomeAt ? ctx.biomeAt(lx + ox * LATTICE, lz + oz * LATTICE) : chunk.biome);
        for (let c = 0; c < 3; c++) { acc[c]! += l[c]! / 9; acc[c + 3]! += d[c]! / 9; }
      }
      const out: readonly [Rgba, Rgba] = [[acc[0]!, acc[1]!, acc[2]!, 0], [acc[3]!, acc[4]!, acc[5]!, 0]];
      lattice.set(k, out);
      return out;
    };
    const colorAt = (x: number, z: number, y: number, slope: number): Rgba => {
      const lx = Math.floor(x / LATTICE) * LATTICE, lz = Math.floor(z / LATTICE) * LATTICE;
      const fx = (x - lx) / LATTICE, fz = (z - lz) / LATTICE;
      const c00 = latticeAt(lx, lz), c10 = latticeAt(lx + LATTICE, lz), c01 = latticeAt(lx, lz + LATTICE), c11 = latticeAt(lx + LATTICE, lz + LATTICE);
      const t = Math.min(1, Math.max(0, slope * 1.4 + Math.max(0, -y - 40) / 900));
      const out: number[] = [];
      for (let c = 0; c < 3; c++) {
        const mix = (k: 0 | 1) => (c00[k][c]! * (1 - fx) + c10[k][c]! * fx) * (1 - fz) + (c01[k][c]! * (1 - fx) + c11[k][c]! * fx) * fz;
        out.push(mix(0) + (mix(1) - mix(0)) * t);
      }
      return [out[0]!, out[1]!, out[2]!, 0];
    };
    const b = new RecipeBuilder();
    /** Vertex at fine-lattice (i, j); normals by central difference `d` steps. */
    const vertex = (i: number, j: number, d: number): number => {
      const y = H(i, j), dx = (H(i + d, j) - H(i - d, j)) / (2 * d * f), dz = (H(i, j + d) - H(i, j - d)) / (2 * d * f);
      const x = min.x + i * f, z = min.z + j * f;
      return b.vertex([x, y, z], [-dx, 1, -dz], colorAt(x, z, y, Math.hypot(dx, dz)));
    };
    if (!zipped) {
      const grid: number[] = [];
      for (let j = 0; j <= m; j++) {
        for (let i = 0; i <= m; i++) {
          grid.push(vertex(i, j, 1));
          if ((i & 7) === 7 && ctx.due()) yield;
        }
      }
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < m; i++) {
          const a = grid[j * (m + 1) + i]!, c = grid[(j + 1) * (m + 1) + i]!;
          b.triangle(a, c, a + 1); b.triangle(a + 1, c, c + 1);
        }
        if (ctx.due()) yield;
      }
    } else {
      // Fine border ring, shared by corners.
      const ring = new Map<string, number>();
      const border = (i: number, j: number): number => {
        const k = `${i},${j}`;
        let v = ring.get(k);
        if (v === undefined) ring.set(k, v = vertex(i, j, 1));
        return v;
      };
      // Coarse interior lattice I, J in 1..n-1 (fine units I*r, J*r).
      const inner: number[] = [];
      for (let J = 1; J <= n - 1; J++) {
        for (let I = 1; I <= n - 1; I++) {
          inner.push(vertex(I * r, J * r, r));
          if ((I & 3) === 3 && ctx.due()) yield;
        }
      }
      const at = (I: number, J: number): number => inner[(J - 1) * (n - 1) + (I - 1)]!;
      for (let J = 1; J < n - 1; J++) for (let I = 1; I < n - 1; I++) {
        const a = at(I, J), c = at(I, J + 1);
        b.triangle(a, c, at(I + 1, J)); b.triangle(at(I + 1, J), c, at(I + 1, J + 1));
      }
      // Zip each edge: fine outer points (param t) to the inner row (I*r).
      // The four strips meet on the corner diagonals and tile the frame.
      const edges: [(t: number) => number, (I: number) => number][] = [
        [t => border(t, 0), I => at(I, 1)], [t => border(t, m), I => at(I, n - 1)],
        [t => border(0, t), J => at(1, J)], [t => border(m, t), J => at(n - 1, J)],
      ];
      for (const [outer, row] of edges) {
        let t = 0, I = 1;
        while (t < m || I < n - 1) {
          if (I >= n - 1 || (t < m && t + 1 <= (I + 1) * r)) { b.triangle(outer(t), outer(t + 1), row(I)); t++; }
          else { b.triangle(outer(t), row(I + 1), row(I)); I++; }
          if (ctx.due()) yield;
        }
      }
    }
    yield;
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
      if ((k & 31) === 31 && ctx.due()) yield;
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
    yield;
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
      if (ctx.due()) yield;
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
    yield;
    const mesh: MeshRecipe = b.build(`setpiece.${lod}`);
    return { meshes: [mesh], instances: [] };
  },
};

export const KIT_FACTORIES: readonly ChunkArtFactory[] = [terrainFactory, scatterFactory, setPieceFactory];
