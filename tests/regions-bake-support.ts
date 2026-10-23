// Shared by tests/regions-bake.test.ts and tests/regions-bake-decode.heavy.test.ts (TT-1); not a test file itself.
import assert from "node:assert/strict";
import { worldLayout } from "../src/content/regions/layout.js";
import { seededStream } from "../src/content/regions/noise.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { bakeChunkBytes } from "../src/render/biomes/bake.js";
import { liveTerrain } from "../src/render/biomes/terrain.js";
import { decodeTerrain } from "../src/render/biomes/terrainCodec.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import type { ChunkDescriptor, LodLevel } from "../src/world/types.js";

export const layout = worldLayout();
export const pick = (x: number, z: number): ChunkDescriptor =>
  layout.chunks.find(c => x >= c.bounds.min.x && x < c.bounds.max.x && z >= c.bounds.min.z && z < c.bounds.max.z)!;
export const rectOf = (c: ChunkDescriptor) => ({ minX: c.bounds.min.x, maxX: c.bounds.max.x, minZ: c.bounds.min.z, maxZ: c.bounds.max.z });
export const drain = <T>(g: Generator<void, T>): T => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
export const live = (c: ChunkDescriptor, lod: LodLevel): MeshRecipe[] =>
  drain(liveTerrain({ floor: worldFloor, random: seededStream, due: () => false }, c, lod)).meshes as MeshRecipe[];
// Stack ramp, Meridian pair, Divide brine (mirror mesh), legacy seam (skirt), Rift.
export const SAMPLE = [pick(470, 95), pick(1000, -1400), pick(1000, -1360), pick(560, -1450), pick(300, -120), pick(-165, -1065)];

/** A chunk's bake is deterministic and decodes to its live recipe within the codec's quantization. */
export function assertDecodedMatchesLive(c: ChunkDescriptor): void {
  const bytes = bakeChunkBytes(c);
  assert.deepEqual(bakeChunkBytes(c), bytes, `${c.id}: bake is deterministic`);
  for (const lod of ["fine", "coarse"] as const) {
    const a = live(c, lod), b = drain(decodeTerrain(bytes, rectOf(c), c.id, lod));
    assert.deepEqual(b.map(m => m.name), a.map(m => m.name), `${c.id} ${lod}: meshes`);
    a.forEach((m, k) => {
      const d = b[k]!;
      assert.deepEqual([...d.indices], [...m.indices], `${m.name}: indices identical`);
      for (let i = 0; i < m.positions.length; i += 3) {
        assert.ok(Math.abs(d.positions[i]! - m.positions[i]!) <= 0.0011 && Math.abs(d.positions[i + 2]! - m.positions[i + 2]!) <= 0.0011 &&
          Math.abs(d.positions[i + 1]! - m.positions[i + 1]!) <= 0.0081, `${m.name}: vertex ${i / 3} moved`);
        const dot = d.normals[i]! * m.normals[i]! + d.normals[i + 1]! * m.normals[i + 1]! + d.normals[i + 2]! * m.normals[i + 2]!;
        assert.ok(dot > 0.998, `${m.name}: normal ${i / 3} (${dot})`);
      }
      for (let i = 0; i < m.colors.length; i++)
        assert.ok(i % 4 === 3 ? d.colors[i] === m.colors[i] : Math.abs(d.colors[i]! - m.colors[i]!) <= 0.0026, `${m.name}: colour ${i}`);
    });
  }
}
