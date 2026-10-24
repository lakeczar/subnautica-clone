import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { seededStream } from "../src/content/regions/noise.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { bakeChunkBytes, bakeTargets } from "../src/render/biomes/bake.js";
import { setTerrainStore, terrainFactory, terrainFallbackStats } from "../src/render/biomes/terrain.js";
import { createTerrainStore, terrainFileName } from "../src/render/biomes/terrainAssets.js";
import { decodeTerrain } from "../src/render/biomes/terrainCodec.js";
import type { ChunkRecipe, MeshRecipe } from "../src/render/kit/types.js";
import type { ChunkDescriptor, LodLevel } from "../src/world/types.js";
import { assertDecodedMatchesLive, drain, layout, live, pick, rectOf, SAMPLE } from "./regions-bake-support.js";
import { waitUntil } from "./shared-support.js";

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
    const start = terrainFallbackStats().builds, fine = await run(c, "fine");
    assert.equal(terrainFallbackStats().builds, start, "a decoded chunk is no live fallback");
    assert.equal(fine.recipe.meshes[0]!.positions.length, live(c, "fine")[0]!.positions.length, "baked fine recipe");
    // The decode is split across steps (deterministic); the wall-clock bound only
    // catches a decode that stops yielding, with headroom for a loaded host.
    assert.ok(fine.steps > 2, `decode yields across steps (${fine.steps})`);
    assert.ok(fine.maxMs < 40, `decode step ${fine.maxMs.toFixed(2)} ms`);
    // Cached across "eviction": a second build needs no fetch.
    const fetches = store.stats.fetches;
    await run(c, "coarse");
    assert.equal(store.stats.fetches, fetches, "coarse decodes from the cached file");
    // Decoded builds never count as the live fallback (COL-1 R8-2).
    const before = terrainFallbackStats().builds;
    // No file: the live tessellator is the fallback, counted and reported.
    const other = SAMPLE[0]!, warn = console.warn, said: string[] = [];
    console.warn = (...a: unknown[]) => { said.push(a.join(" ")); };
    let fallback: Awaited<ReturnType<typeof run>>;
    try { fallback = await run(other, "coarse"); } finally { console.warn = warn; }
    assert.equal(fallback.recipe.meshes[0]!.positions.length, live(other, "coarse")[0]!.positions.length);
    assert.equal(terrainFallbackStats().builds, before + 1);
    assert.deepEqual(terrainFallbackStats().recent.slice(-1), [`${other.id} coarse`]);
    assert.equal(said.filter(l => l.includes(`live build of ${other.id}`)).length, 1);
  } finally { setTerrainStore(null); }
});

test("the decompressed-file cache admits files, evicts least recently used past its byte bound, and serves what it keeps without a fetch", async () => {
  // Twelve chunks no two of which neighbour each other, so a request's neighbour
  // prefetch never touches another of the twelve. Only their files ever arrive; the
  // neighbour fetches stay pending, so they neither admit nor fail.
  const size = 300_000, ids: string[] = [];
  const near = (a: string, b: string): boolean => {
    const [, ax, az] = a.split(":").map(Number), [, bx, bz] = b.split(":").map(Number);
    return Math.abs(ax! - bx!) <= 1 && Math.abs(az! - bz!) <= 1;
  };
  for (const c of bakeTargets()) if (ids.length < 12 && !ids.some(id => near(id, c.id))) ids.push(c.id);
  assert.equal(ids.length, 12);
  const names = new Set(ids.map(terrainFileName)), file = deflateSync(new Uint8Array(size));
  const store = createTerrainStore({ cacheBytes: size * 4, fetchFile: name => names.has(name) ? Promise.resolve(file) : new Promise<null>(() => {}) });
  const jobs = ids.map(id => store.request(id));
  await waitUntil(() => jobs.every(j => j.settled), "every requested file to settle");
  // Every file arrived and decompressed: twelve admissions, no failures.
  assert.ok(jobs.every(j => j.bytes?.byteLength === size), "each file decompressed in full");
  assert.equal(store.stats.failures, 0);
  // Twelve admissions into four files' worth: eight were evicted, and the bound holds.
  assert.equal(store.stats.files, 4, `${store.stats.files} files kept`);
  assert.equal(store.stats.cachedBytes, size * 4);
  // The four kept are served at once, with no fetch; the eight evicted are fetched again.
  const fetches = store.stats.fetches;
  const served = ids.filter(id => store.request(id).settled);
  assert.equal(served.length, 4, `kept: ${served.join(", ")}`);
  assert.equal(store.stats.fetches, fetches + 8, "only the evicted eight are fetched again");
});

test("a chunk without a baked file is fetched once, then remembered as absent", async () => {
  let fetches = 0;
  const store = createTerrainStore({ fetchFile: async () => { fetches++; return null; } });
  const p = { x: -64, y: 0, z: -96 };
  store.prefetch(p, 200);
  await waitUntil(() => fetches > 0 && store.stats.failures === fetches, "every prefetched chunk to come back absent");
  const first = fetches;
  for (let i = 0; i < 5; i++) store.prefetch(p, 200);
  await new Promise(r => setImmediate(r));
  assert.ok(first > 0 && fetches === first, `refetched missing files: ${first} then ${fetches}`);
  assert.equal(store.request("chunk:4:11:0").settled, true);
});
