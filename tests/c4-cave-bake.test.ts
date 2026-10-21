import assert from "node:assert/strict";
import test from "node:test";
import { caveDef } from "../src/content/regions/caves.js";
import { worldLayout } from "../src/content/regions/layout.js";
import { seededStream } from "../src/content/regions/noise.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { bakeChunkBytes } from "../src/render/biomes/bake.js";
import { scatterFactory } from "../src/render/biomes/scatter.js";
import { liveTerrain } from "../src/render/biomes/terrain.js";
import { decodeTerrain } from "../src/render/biomes/terrainCodec.js";
import type { ChunkRecipe, MeshRecipe } from "../src/render/kit/types.js";
import type { ChunkDescriptor, LodLevel } from "../src/world/types.js";

/** C4: the Fanvault in the baked world. Its chunk keeps the heightfield out
 * of the footprint, carries the cave shell, decodes to the same meshes, and
 * still shares every edge with its neighbours. */
const def = caveDef("fanvault", worldFloor), f = def.replacementFootprints[0]!;
const layout = worldLayout();
const drain = <T>(g: Generator<void, T>): T => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
const rectOf = (c: ChunkDescriptor) => ({ minX: c.bounds.min.x, maxX: c.bounds.max.x, minZ: c.bounds.min.z, maxZ: c.bounds.max.z });
const ctx = { floor: worldFloor, random: seededStream, due: () => false };
const live = (c: ChunkDescriptor, lod: LodLevel): MeshRecipe[] => drain(liveTerrain(ctx, c, lod)).meshes as MeshRecipe[];
const home = layout.chunks.find(c => c.bounds.min.x <= f.minX && c.bounds.max.x >= f.maxX && c.bounds.min.z <= f.minZ && c.bounds.max.z >= f.maxZ)!;

test("the Fanvault chunk: heightfield out of the footprint, cave shell in, bounds raised, codec round trip", () => {
  assert.ok(home, "one column holds the whole footprint");
  assert.ok(home.bounds.min.y <= def.source.baseY && home.bounds.max.y >= def.source.topY, JSON.stringify(home.bounds));
  const bytes = bakeChunkBytes(home);
  for (const lod of ["fine", "coarse"] as const) {
    const meshes = live(home, lod), terrain = meshes.find(m => m.name.endsWith(".terrain"))!;
    const shell = meshes.find(m => m.name === `${home.id}.cave-fanvault`);
    assert.ok(shell && shell.positions.length > 3000, `${lod}: the cave shell is part of the chunk`);
    for (let t = 0; t < terrain.indices.length; t += 3) {
      let x = 0, z = 0;
      for (let k = 0; k < 3; k++) { x += terrain.positions[terrain.indices[t + k]! * 3]! / 3; z += terrain.positions[terrain.indices[t + k]! * 3 + 2]! / 3; }
      assert.ok(!(x > f.minX + 1e-6 && x < f.maxX - 1e-6 && z > f.minZ + 1e-6 && z < f.maxZ - 1e-6), `${lod}: heightfield triangle at ${x}, ${z}`);
    }
    for (let v = 0; v < shell.positions.length; v += 3) {
      const x = shell.positions[v]!, z = shell.positions[v + 2]!;
      assert.ok(x >= f.minX - 1e-4 && x <= f.maxX + 1e-4 && z >= f.minZ - 1e-4 && z <= f.maxZ + 1e-4, "the shell stays in its footprint");
    }
    const decoded = drain(decodeTerrain(bytes, rectOf(home), home.id, lod));
    assert.deepEqual(decoded.map(m => m.name), meshes.map(m => m.name), `${lod}: decoded meshes keep their names`);
  }
});

test("the Fanvault chunk still shares identical edges with all four neighbours", () => {
  const edges = (m: readonly MeshRecipe[], axis: 0 | 2, at: number): string[] => {
    const out: string[] = [];
    for (const mesh of m) if (mesh.name.endsWith(".terrain"))
      for (let i = 0; i < mesh.positions.length; i += 3) if (Math.abs(mesh.positions[i + axis]! - at) < 1e-6)
        out.push(`${mesh.positions[i + (2 - axis)]},${mesh.positions[i + 1]}`);
    return [...new Set(out)].sort();
  };
  const b = home.bounds;
  const sides = [
    { n: layout.chunks.find(c => c.bounds.max.x === b.min.x && c.bounds.min.z === b.min.z), axis: 0 as const, at: b.min.x },
    { n: layout.chunks.find(c => c.bounds.min.x === b.max.x && c.bounds.min.z === b.min.z), axis: 0 as const, at: b.max.x },
    { n: layout.chunks.find(c => c.bounds.max.z === b.min.z && c.bounds.min.x === b.min.x), axis: 2 as const, at: b.min.z },
    { n: layout.chunks.find(c => c.bounds.min.z === b.max.z && c.bounds.min.x === b.min.x), axis: 2 as const, at: b.max.z },
  ];
  for (const la of ["fine", "coarse"] as const) for (const lb of ["fine", "coarse"] as const) for (const { n, axis, at } of sides) {
    assert.ok(n, "neighbour exists");
    const a = edges(live(home, la), axis, at), e = edges(live(n, lb), axis, at);
    assert.ok(a.length > 10);
    assert.deepEqual(a, e, `${home.id} ${la} / ${n.id} ${lb}`);
  }
});

test("no scatter grows on the heightfield inside the Fanvault footprint", () => {
  const ref = home.art.find(a => a.factory === "s2.scatter")!;
  const recipe = drain(scatterFactory.build(ctx, home, ref, "fine")) as ChunkRecipe;
  let checked = 0;
  for (const batch of recipe.instances) for (let i = 0; i < batch.matrices.length; i += 16) {
    const x = batch.matrices[i + 12]!, z = batch.matrices[i + 14]!;
    checked++;
    assert.ok(!(x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ), `${batch.template} at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
  assert.ok(checked > 50, `${checked} instances checked`);
});
