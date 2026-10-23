import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { seededStream } from "../src/content/regions/noise.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { bakeChunkBytes, bakeTargets } from "../src/render/biomes/bake.js";
import { setTerrainStore, terrainFactory } from "../src/render/biomes/terrain.js";
import { createTerrainStore, terrainFileName } from "../src/render/biomes/terrainAssets.js";
import { decodeTerrain } from "../src/render/biomes/terrainCodec.js";
import type { ChunkRecipe, MeshRecipe } from "../src/render/kit/types.js";
import type { ChunkDescriptor, LodLevel } from "../src/world/types.js";
import { assertDecodedMatchesLive, drain, layout, live, pick, rectOf, SAMPLE } from "./regions-bake-support.js";

/** Baked terrain against the live recipe (the oracle). Fast tier; the full
 * every-chunk byte comparison is `regions-bake.heavy.test.ts`. */
test("smoke: decoded baked recipes equal the live recipe at the legacy seam's skirt and the Divide brine's mirror mesh", () => {
  // All six sample chunks: tests/regions-bake-decode.heavy.test.ts (TT-1).
  for (const c of [SAMPLE[4]!, SAMPLE[3]!]) assertDecodedMatchesLive(c);
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
    // The decode is split across steps (deterministic); the wall-clock bound only
    // catches a decode that stops yielding, with headroom for a loaded host.
    assert.ok(fine.steps > 2, `decode yields across steps (${fine.steps})`);
    assert.ok(fine.maxMs < 40, `decode step ${fine.maxMs.toFixed(2)} ms`);
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
