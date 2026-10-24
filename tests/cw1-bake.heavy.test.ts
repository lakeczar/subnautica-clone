// CW-1, heavy: the terrain bake with every kit cave registered (CA-1's probe,
// adopted for all 55 caves). Every chunk a footprint touches: no heightfield
// inside a footprint, each shell inside its footprint and column, Y bounds
// covering the cave, the codec round trip, no scatter in a footprint, and
// identical terrain edges with each neighbour at all four LOD pairings (the
// union-of-cuts border rule, now meeting every new cave edge).
import assert from "node:assert/strict";
import test from "node:test";
import { CAVE_SOURCES } from "../src/content/regions/caves.js";
import { worldLayout } from "../src/content/regions/layout.js";
import { seededStream } from "../src/content/regions/noise.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { bakeChunkBytes } from "../src/render/biomes/bake.js";
import { scatterFactory } from "../src/render/biomes/scatter.js";
import { liveTerrain } from "../src/render/biomes/terrain.js";
import { decodeTerrain } from "../src/render/biomes/terrainCodec.js";
import type { ChunkRecipe, MeshRecipe } from "../src/render/kit/types.js";
import type { ChunkDescriptor, LodLevel, Rect } from "../src/world/types.js";

const layout = worldLayout();
const drain = <T>(g: Generator<void, T>): T => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
const rectOf = (c: ChunkDescriptor): Rect => ({ minX: c.bounds.min.x, maxX: c.bounds.max.x, minZ: c.bounds.min.z, maxZ: c.bounds.max.z });
const ctx = { floor: worldFloor, random: seededStream, due: () => false };
const touches = (f: Rect, r: Rect): boolean => f.minX <= r.maxX && f.maxX >= r.minX && f.minZ <= r.maxZ && f.maxZ >= r.minZ;
const caveChunks = layout.chunks.filter(c => CAVE_SOURCES.some(s => touches(s.footprint, rectOf(c))));
/** A border of a chunk: the terrain's vertices on it, outside any pit span on that line. */
const inPitSpan = (axis: 0 | 2, at: number, u: number): boolean => CAVE_SOURCES.some(({ footprint: f }) => axis === 0
  ? (Math.abs(f.minX - at) < 1e-6 || Math.abs(f.maxX - at) < 1e-6) && u >= f.minZ - 1e-6 && u <= f.maxZ + 1e-6
  : (Math.abs(f.minZ - at) < 1e-6 || Math.abs(f.maxZ - at) < 1e-6) && u >= f.minX - 1e-6 && u <= f.maxX + 1e-6);
const edge = (m: readonly MeshRecipe[], axis: 0 | 2, at: number): string => {
  const out: string[] = [];
  for (const mesh of m) if (mesh.name.endsWith(".terrain"))
    for (let i = 0; i < mesh.positions.length; i += 3) if (Math.abs(mesh.positions[i + axis]! - at) < 1e-6 && !inPitSpan(axis, at, mesh.positions[i + (2 - axis)]!))
      out.push(`${mesh.positions[i + (2 - axis)]},${mesh.positions[i + 1]}`);
  return [...new Set(out)].sort().join(" ");
};
/** Border signatures per chunk and LOD (kept instead of meshes, for memory). */
const borders = new Map<string, string>();
const sides = (c: ChunkDescriptor): [0 | 2, number][] => [[0, c.bounds.min.x], [0, c.bounds.max.x], [2, c.bounds.min.z], [2, c.bounds.max.z]];
const record = (c: ChunkDescriptor, lod: LodLevel, meshes: readonly MeshRecipe[]): void => {
  for (const [axis, at] of sides(c)) borders.set(`${c.id}|${lod}|${axis}|${at}`, edge(meshes, axis, at));
};

test("every chunk a cave touches: heightfield out of footprints, shells in them, Y bounds, codec", () => {
  assert.ok(caveChunks.length > 40, `${caveChunks.length} chunks`);
  const problems: string[] = [];
  for (const c of caveChunks) {
    const r = rectOf(c), mine = CAVE_SOURCES.filter(s => touches(s.footprint, r));
    for (const s of mine) {
      const overlapX = Math.min(s.footprint.maxX, r.maxX) - Math.max(s.footprint.minX, r.minX);
      const overlapZ = Math.min(s.footprint.maxZ, r.maxZ) - Math.max(s.footprint.minZ, r.minZ);
      if (overlapX > 0 && overlapZ > 0 && !(c.bounds.min.y <= s.baseY && c.bounds.max.y >= s.topY))
        problems.push(`${c.id}: Y bounds ${c.bounds.min.y}..${c.bounds.max.y} miss ${s.id} ${s.baseY}..${s.topY}`);
    }
    const bytes = bakeChunkBytes(c);
    for (const lod of ["fine", "coarse"] as const) {
      const meshes = drain(liveTerrain(ctx, c, lod)).meshes as MeshRecipe[];
      record(c, lod, meshes);
      const terrain = meshes.find(m => m.name.endsWith(".terrain"));
      if (terrain) for (let t = 0; t < terrain.indices.length; t += 3) {
        let x = 0, z = 0;
        for (let k = 0; k < 3; k++) { x += terrain.positions[terrain.indices[t + k]! * 3]! / 3; z += terrain.positions[terrain.indices[t + k]! * 3 + 2]! / 3; }
        const inside = mine.find(s => x > s.footprint.minX + 1e-6 && x < s.footprint.maxX - 1e-6 && z > s.footprint.minZ + 1e-6 && z < s.footprint.maxZ - 1e-6);
        if (inside) { problems.push(`${c.id} ${lod}: heightfield triangle in ${inside.id} at ${x.toFixed(2)}, ${z.toFixed(2)}`); break; }
      }
      for (const s of mine) {
        const overlapX = Math.min(s.footprint.maxX, r.maxX) - Math.max(s.footprint.minX, r.minX);
        const overlapZ = Math.min(s.footprint.maxZ, r.maxZ) - Math.max(s.footprint.minZ, r.minZ);
        if (overlapX <= 0 || overlapZ <= 0) continue;
        const shell = meshes.find(m => m.name === `${c.id}.cave-${s.id}`);
        if (!shell) { problems.push(`${c.id} ${lod}: no shell for ${s.id}`); continue; }
        for (let v = 0; v < shell.positions.length; v += 3) {
          const x = shell.positions[v]!, z = shell.positions[v + 2]!;
          if (!(x >= Math.max(s.footprint.minX, r.minX) - 1e-4 && x <= Math.min(s.footprint.maxX, r.maxX) + 1e-4 &&
            z >= Math.max(s.footprint.minZ, r.minZ) - 1e-4 && z <= Math.min(s.footprint.maxZ, r.maxZ) + 1e-4)) {
            problems.push(`${c.id} ${lod}: ${s.id} shell vertex outside its footprint/column at ${x}, ${z}`); break;
          }
        }
      }
      const decoded = drain(decodeTerrain(bytes, r, c.id, lod));
      if (JSON.stringify(decoded.map(m => m.name)) !== JSON.stringify(meshes.map(m => m.name))) problems.push(`${c.id} ${lod}: codec names differ`);
    }
    const ref = c.art.find(a => a.factory === "s2.scatter");
    if (ref) {
      const recipe = drain(scatterFactory.build(ctx, c, ref, "fine")) as ChunkRecipe;
      for (const batch of recipe.instances) for (let i = 0; i < batch.matrices.length; i += 16) {
        const x = batch.matrices[i + 12]!, z = batch.matrices[i + 14]!;
        const s = mine.find(s => x > s.footprint.minX && x < s.footprint.maxX && z > s.footprint.minZ && z < s.footprint.maxZ);
        if (s) { problems.push(`${c.id}: ${batch.template} scatter in ${s.id}`); break; }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("every cave chunk shares identical terrain edges with its neighbours, every LOD pair", () => {
  const problems: string[] = [];
  const border = (c: ChunkDescriptor, lod: LodLevel, axis: 0 | 2, at: number): string => {
    const k = `${c.id}|${lod}|${axis}|${at}`;
    if (!borders.has(k)) record(c, lod, drain(liveTerrain(ctx, c, lod)).meshes as MeshRecipe[]);
    return borders.get(k)!;
  };
  for (const home of caveChunks) {
    const b = home.bounds;
    const across = [
      { n: layout.chunks.find(c => c.bounds.max.x === b.min.x && c.bounds.min.z === b.min.z), axis: 0 as const, at: b.min.x },
      { n: layout.chunks.find(c => c.bounds.min.x === b.max.x && c.bounds.min.z === b.min.z), axis: 0 as const, at: b.max.x },
      { n: layout.chunks.find(c => c.bounds.max.z === b.min.z && c.bounds.min.x === b.min.x), axis: 2 as const, at: b.min.z },
      { n: layout.chunks.find(c => c.bounds.min.z === b.max.z && c.bounds.min.x === b.min.x), axis: 2 as const, at: b.max.z },
    ];
    for (const { n, axis, at } of across) {
      if (!n || !n.art.some(a => a.factory === "s2.terrain")) continue;
      for (const la of ["fine", "coarse"] as const) for (const lb of ["fine", "coarse"] as const)
        if (border(home, la, axis, at) !== border(n, lb, axis, at)) problems.push(`${home.id} ${la} / ${n.id} ${lb} (axis ${axis} at ${at})`);
    }
  }
  assert.deepEqual(problems, []);
});
