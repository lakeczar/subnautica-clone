// TT-1: the build cache. The game installs no store; the test tiers preload a
// disk store keyed by the code an entry derives from. A cached entry must equal
// a fresh build, an unnamed floor must never be cached, and a code change must miss.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cachedBuild, dataKey, floorKey, nameFloor, withoutBuildCache, type BuildCacheStore } from "../src/content/buildCache.js";
import { AUTHORED_CAVE_SOURCES, caveDef } from "../src/content/regions/caves.js";
import { buildCave, caveShell, caveVolume, sharesEdge } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { caveLightField } from "../src/render/caves/lightField.js";

const root = resolve(".");
type StoreModule = { closureHash(modules: readonly string[], runtime?: string): string; createStore(root: string): BuildCacheStore };
const storeModule = await import(pathToFileURL(join(root, "scripts", "test-build-cache.mjs")).href) as StoreModule;
const scratch = mkdtempSync(join(root, process.env.SILTWAKE_TEST_BUILD || ".test-build", "build-cache-probe-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Runs `fn` with `store` installed in place of the preloaded one. */
function withStore<T>(store: BuildCacheStore | undefined, fn: () => T): T {
  const g = globalThis as { __siltwakeBuildCache?: BuildCacheStore }, before = g.__siltwakeBuildCache;
  if (store) g.__siltwakeBuildCache = store; else delete g.__siltwakeBuildCache;
  try { return fn(); } finally { if (before) g.__siltwakeBuildCache = before; else delete g.__siltwakeBuildCache; }
}
function memoryStore(): BuildCacheStore & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return { entries, get: (key) => entries.get(key), set: (key, _modules, value) => { entries.set(key, value); } };
}

test("without a store every call builds; with one, a keyed build is stored once and served after", () => {
  let builds = 0;
  const key = { key: "probe", modules: [import.meta.url] }, build = () => ++builds;
  withStore(undefined, () => { cachedBuild(key, build); cachedBuild(key, build); });
  assert.equal(builds, 2, "the game path builds every time");
  const store = memoryStore();
  withStore(store, () => {
    assert.equal(cachedBuild(key, build), 3);
    assert.equal(cachedBuild(key, build), 3, "served from the store");
    assert.equal(cachedBuild(undefined, build), 4, "no key, no cache");
    assert.equal(withoutBuildCache(() => cachedBuild(key, build)), 5, "withoutBuildCache builds fresh");
    assert.throws(() => cachedBuild({ key: "throws", modules: [] }, () => { throw new Error("bad source"); }), /bad source/);
  });
  assert.deepEqual([...store.entries.keys()], ["probe"], "a build that throws stores nothing");
});

test("only named floors and plain data make keys, and only with a store; the key names the floor and its modules", () => {
  const unnamed = (x: number, z: number): number => x + z;
  const named = nameFloor((x: number, z: number): number => x - z, "probe-floor", ["file:///probe-floor.js"]);
  withStore(undefined, () => assert.equal(floorKey("probe", named, { a: 1 }, import.meta.url), undefined, "the game serialises nothing"));
  withStore(memoryStore(), () => {
    assert.equal(floorKey("probe", unnamed, { a: 1 }, import.meta.url), undefined, "an unnamed floor is never cached");
    assert.deepEqual(floorKey("probe", named, { a: 1 }, import.meta.url),
      { key: 'probe:probe-floor:{"a":1}', modules: [import.meta.url, "file:///probe-floor.js"] });
    assert.equal(floorKey("probe", named, { f: () => 1 }, import.meta.url), undefined, "data holding a function is uncacheable");
  });
  assert.equal(dataKey({ x: Infinity }), '{"x":"Infinity"}', "non-finite numbers keep distinct keys");
});

test("the disk store round-trips typed arrays, refuses a mismatched key, and misses after its code changes", () => {
  const dir = mkdtempSync(join(scratch, "code-")), a = join(dir, "a.js"), b = join(dir, "b.js"), c = join(dir, "c.js");
  writeFileSync(a, `import { b } from "./b.js";\nexport const a = b;\n`);
  writeFileSync(b, `export const b = 1;\n`);
  writeFileSync(c, `export const c = 1;\n`);
  const modules = [pathToFileURL(a).href], hash = storeModule.closureHash(modules);
  writeFileSync(c, `export const c = 2;\n`);
  assert.equal(storeModule.closureHash(modules), hash, "a module outside the closure changes nothing");
  assert.notEqual(storeModule.closureHash(modules, "another node/v8/platform"), hash, "another runtime is another namespace");
  const store = storeModule.createStore(join(scratch, "cache"));
  const value = { grid: { nx: 2 }, solid: new Uint8Array([1, 0, 1]), field: new Float32Array([0.5, -1]) };
  store.set("cave:probe", modules, value);
  assert.deepEqual(store.get("cave:probe", modules), value);
  assert.equal(store.get("cave:other", modules), undefined);
  writeFileSync(b, `export const b = 2;\n`);
  assert.notEqual(storeModule.closureHash(modules), hash, "an imported module's change is a new code hash");
  assert.equal(storeModule.createStore(join(scratch, "cache")).get("cave:probe", modules), undefined, "so the entry misses");
});

test("a cached cave equals a fresh build: definition, volume, both shells and the light field", () => {
  const source = AUTHORED_CAVE_SOURCES.find(s => s.id === "hub_apron_hollow")!;
  const neighbours = AUTHORED_CAVE_SOURCES.filter(s => s !== source && sharesEdge(s.footprint, source.footprint));
  caveDef(source.id, worldFloor); // make sure the entry exists
  const cached = buildCave(source, worldFloor, neighbours); // served by the store when one is installed
  const fresh = withoutBuildCache(() => buildCave(source, worldFloor, neighbours));
  const plain = (d: typeof fresh) => ({ ...d, stats: { ...d.stats, ms: 0 } });
  assert.deepEqual(plain(cached), plain(fresh));
  assert.equal(cached.source, source, "the definition refers to its own source");
  assert.deepEqual(caveVolume(cached), caveVolume(fresh));
  for (const lod of ["fine", "coarse"] as const)
    assert.deepEqual(caveShell(cached, lod), withoutBuildCache(() => caveShell(fresh, lod)), `${lod} shell`);
  assert.deepEqual(caveLightField(cached, worldFloor), withoutBuildCache(() => caveLightField(fresh, worldFloor)));
});
