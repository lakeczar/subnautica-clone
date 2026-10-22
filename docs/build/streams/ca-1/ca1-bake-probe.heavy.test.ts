// PROBE (not committed): C4's bake path with every authored cave in CAVE_SOURCES.
import assert from "node:assert/strict";
import test from "node:test";
import { CAVE_SOURCES, caveDef } from "../src/content/regions/caves.js";
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
const sources = CAVE_SOURCES.filter(s => s.id !== "fanvault");
const chunks = layout.chunks.filter(c => sources.some(s => touches(s.footprint, rectOf(c))));
const memo = new Map<string, MeshRecipe[]>();
const live = (c: ChunkDescriptor, lod: LodLevel): MeshRecipe[] => {
  const k = `${c.id}|${lod}`;
  let m = memo.get(k);
  if (!m) { const t = performance.now(); m = drain(liveTerrain(ctx, c, lod)).meshes as MeshRecipe[]; memo.set(k, m);
    console.log(`  live ${k} ${(performance.now() - t).toFixed(0)} ms`); }
  return m;
};

test("probe: every CA-1 chunk — heightfield out of footprints, shells in and inside them, Y bounds, codec", () => {
  assert.equal(CAVE_SOURCES.length, 19);
  console.log(`  ${chunks.length} chunks touch a CA-1 footprint: ${chunks.map(c => c.id).join(" ")}`);
  const problems: string[] = [];
  for (const c of chunks) {
    const r = rectOf(c), mine = CAVE_SOURCES.filter(s => touches(s.footprint, r));
    for (const s of mine) {
      const d = caveDef(s.id, worldFloor);
      const overlapX = Math.min(s.footprint.maxX, r.maxX) - Math.max(s.footprint.minX, r.minX);
      const overlapZ = Math.min(s.footprint.maxZ, r.maxZ) - Math.max(s.footprint.minZ, r.minZ);
      if (overlapX > 0 && overlapZ > 0 && !(c.bounds.min.y <= d.source.baseY && c.bounds.max.y >= d.source.topY))
        problems.push(`${c.id}: Y bounds ${c.bounds.min.y}..${c.bounds.max.y} miss ${s.id} ${d.source.baseY}..${d.source.topY}`);
    }
    const bytes = bakeChunkBytes(c);
    for (const lod of ["fine", "coarse"] as const) {
      const meshes = live(c, lod), terrain = meshes.find(m => m.name.endsWith(".terrain"));
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
  }
  assert.deepEqual(problems, []);
});

test("probe: every CA-1 chunk shares identical terrain edges with its neighbours, every LOD pair", () => {
  // Along a border that is itself a pit's edge, the pit's side has no
  // terrain over the pit's span (its shell's collar meets the other side
  // there, as at any pit edge); compare the rest.
  const inPitSpan = (axis: 0 | 2, at: number, u: number): boolean => CAVE_SOURCES.some(({ footprint: f }) => axis === 0
    ? (Math.abs(f.minX - at) < 1e-6 || Math.abs(f.maxX - at) < 1e-6) && u >= f.minZ - 1e-6 && u <= f.maxZ + 1e-6
    : (Math.abs(f.minZ - at) < 1e-6 || Math.abs(f.maxZ - at) < 1e-6) && u >= f.minX - 1e-6 && u <= f.maxX + 1e-6);
  const edges = (m: readonly MeshRecipe[], axis: 0 | 2, at: number): string[] => {
    const out: string[] = [];
    for (const mesh of m) if (mesh.name.endsWith(".terrain"))
      for (let i = 0; i < mesh.positions.length; i += 3) if (Math.abs(mesh.positions[i + axis]! - at) < 1e-6 &&
        !inPitSpan(axis, at, mesh.positions[i + (2 - axis)]!))
        out.push(`${mesh.positions[i + (2 - axis)]},${mesh.positions[i + 1]}`);
    return [...new Set(out)].sort();
  };
  const problems: string[] = [];
  for (const home of chunks) {
    const b = home.bounds;
    const sides = [
      { n: layout.chunks.find(c => c.bounds.max.x === b.min.x && c.bounds.min.z === b.min.z), axis: 0 as const, at: b.min.x },
      { n: layout.chunks.find(c => c.bounds.min.x === b.max.x && c.bounds.min.z === b.min.z), axis: 0 as const, at: b.max.x },
      { n: layout.chunks.find(c => c.bounds.max.z === b.min.z && c.bounds.min.x === b.min.x), axis: 2 as const, at: b.min.z },
      { n: layout.chunks.find(c => c.bounds.min.z === b.max.z && c.bounds.min.x === b.min.x), axis: 2 as const, at: b.max.z },
    ];
    for (const la of ["fine", "coarse"] as const) for (const lb of ["fine", "coarse"] as const) for (const { n, axis, at } of sides) {
      if (!n) continue;
      const a = edges(live(home, la), axis, at), e = edges(live(n, lb), axis, at);
      if (JSON.stringify(a) !== JSON.stringify(e)) problems.push(`${home.id} ${la} / ${n.id} ${lb} (axis ${axis} at ${at}): ${a.length} vs ${e.length} vertices; only here ${a.filter(v => !e.includes(v)).join(" ")}; only there ${e.filter(v => !a.includes(v)).join(" ")}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("probe: no scatter on the heightfield inside a CA-1 footprint", () => {
  const problems: string[] = [];
  for (const home of chunks) {
    const ref = home.art.find(a => a.factory === "s2.scatter");
    if (!ref) continue;
    const recipe = drain(scatterFactory.build(ctx, home, ref, "fine")) as ChunkRecipe;
    for (const batch of recipe.instances) for (let i = 0; i < batch.matrices.length; i += 16) {
      const x = batch.matrices[i + 12]!, z = batch.matrices[i + 14]!;
      const s = sources.find(s => x > s.footprint.minX && x < s.footprint.maxX && z > s.footprint.minZ && z < s.footprint.maxZ);
      if (s) problems.push(`${home.id}: ${batch.template} in ${s.id}`);
    }
  }
  assert.deepEqual(problems, []);
});
