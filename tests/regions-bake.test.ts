import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { worldLayout } from "../src/content/regions/layout.js";
import { seededStream } from "../src/content/regions/noise.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { bakeChunkBytes, bakeTargets } from "../src/render/biomes/bake.js";
import { liveTerrain, setTerrainStore, terrainFactory } from "../src/render/biomes/terrain.js";
import { createTerrainStore, terrainFileName } from "../src/render/biomes/terrainAssets.js";
import { decodeTerrain } from "../src/render/biomes/terrainCodec.js";
import type { ChunkRecipe, MeshRecipe } from "../src/render/kit/types.js";
import type { ChunkDescriptor, LodLevel } from "../src/world/types.js";

/** Baked terrain against the live recipe (the oracle). Fast tier; the full
 * every-chunk byte comparison is `regions-bake.heavy.test.ts`. */
const layout = worldLayout();
const pick = (x: number, z: number): ChunkDescriptor =>
  layout.chunks.find(c => x >= c.bounds.min.x && x < c.bounds.max.x && z >= c.bounds.min.z && z < c.bounds.max.z)!;
const rectOf = (c: ChunkDescriptor) => ({ minX: c.bounds.min.x, maxX: c.bounds.max.x, minZ: c.bounds.min.z, maxZ: c.bounds.max.z });
const drain = <T>(g: Generator<void, T>): T => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
const live = (c: ChunkDescriptor, lod: LodLevel): MeshRecipe[] =>
  drain(liveTerrain({ floor: worldFloor, random: seededStream, due: () => false }, c, lod)).meshes as MeshRecipe[];
// Stack ramp, Meridian pair, Divide brine (mirror mesh), legacy seam (skirt), Rift.
const SAMPLE = [pick(470, 95), pick(1000, -1400), pick(1000, -1360), pick(560, -1450), pick(300, -120), pick(-165, -1065)];

test("decoded baked recipes equal the live recipe within the codec's quantization", () => {
  for (const c of SAMPLE) {
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
});

test("decoded neighbours still share identical edges at every LOD pairing", () => {
  const a = pick(1000, -1400), b = layout.chunks.find(q => q.bounds.min.z === a.bounds.max.z && q.bounds.min.x === a.bounds.min.x)!;
  const at = a.bounds.max.z, A = bakeChunkBytes(a), B = bakeChunkBytes(b);
  const edge = (m: MeshRecipe): string[] => {
    const out: string[] = [];
    for (let i = 0; i < m.positions.length; i += 3) if (Math.abs(m.positions[i + 2]! - at) < 1e-4) out.push(`${m.positions[i]},${m.positions[i + 1]}`);
    return [...new Set(out)].sort();
  };
  for (const la of ["fine", "coarse"] as const) for (const lb of ["fine", "coarse"] as const) {
    const ea = edge(drain(decodeTerrain(A, rectOf(a), a.id, la))[0]!), eb = edge(drain(decodeTerrain(B, rectOf(b), b.id, lb))[0]!);
    assert.ok(ea.length > 10);
    assert.deepEqual(ea, eb, `${a.id} ${la} / ${b.id} ${lb}`);
  }
});

test("s2.terrain decodes from the store in small steps and falls back to live without a file", async () => {
  const c = SAMPLE[1]!, packed = deflateSync(bakeChunkBytes(c));
  const files = new Map([[terrainFileName(c.id), new Uint8Array(packed)]]);
  const store = createTerrainStore({ fetchFile: async name => files.get(name) ?? null });
  setTerrainStore(store);
  try {
    const run = async (chunk: ChunkDescriptor, lod: LodLevel): Promise<{ recipe: ChunkRecipe; steps: number; maxMs: number }> => {
      let deadline = 0, steps = 0, maxMs = 0;
      const g = terrainFactory.build({ floor: worldFloor, random: seededStream, due: () => performance.now() >= deadline }, chunk, { factory: "s2.terrain" }, lod);
      for (;;) {
        const t = performance.now(); deadline = t + 0.75;
        const r = g.next(); steps++; maxMs = Math.max(maxMs, performance.now() - t);
        if (r.done) return { recipe: r.value, steps, maxMs };
        await new Promise(res => setImmediate(res)); // a frame boundary: lets the fetch land
      }
    };
    const fine = await run(c, "fine");
    assert.equal(fine.recipe.meshes[0]!.positions.length, live(c, "fine")[0]!.positions.length, "baked fine recipe");
    assert.ok(fine.maxMs < 8, `decode step ${fine.maxMs.toFixed(2)} ms`);
    // Cached across "eviction": a second build needs no fetch.
    const fetches = store.stats.fetches;
    await run(c, "coarse");
    assert.equal(store.stats.fetches, fetches, "coarse decodes from the cached file");
    // No file: the live tessellator is the fallback.
    const other = SAMPLE[0]!, fallback = await run(other, "coarse");
    assert.equal(fallback.recipe.meshes[0]!.positions.length, live(other, "coarse")[0]!.positions.length);
  } finally { setTerrainStore(null); }
});

test("the decompressed-file cache stays within its byte bound", async () => {
  const ids = bakeTargets().slice(0, 12).map(c => c.id), size = 300_000;
  const store = createTerrainStore({ cacheBytes: size * 4, fetchFile: async () => deflateSync(new Uint8Array(size)) });
  for (const id of ids) { store.request(id); await new Promise(r => setTimeout(r, 5)); }
  await new Promise(r => setTimeout(r, 50));
  assert.ok(store.stats.cachedBytes <= size * 4 && store.stats.files <= 4, `${store.stats.cachedBytes} bytes in ${store.stats.files} files`);
});

test("a chunk without a baked file is fetched once, then remembered as absent", async () => {
  let fetches = 0;
  const store = createTerrainStore({ fetchFile: async () => { fetches++; return null; } });
  const p = { x: -64, y: 0, z: -96 };
  store.prefetch(p, 200);
  await new Promise(r => setTimeout(r, 20));
  const first = fetches;
  for (let i = 0; i < 5; i++) { store.prefetch(p, 200); await new Promise(r => setTimeout(r, 5)); }
  assert.ok(first > 0 && fetches === first, `refetched missing files: ${first} then ${fetches}`);
  assert.equal(store.request("chunk:4:11:0").settled, true);
});
