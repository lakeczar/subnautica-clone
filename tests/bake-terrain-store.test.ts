// test-tier: allow-escape the bake driver runs as a child process in tiny fixture worktrees whose one-byte recipe has no Babylon.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

// The shared terrain store (scripts/bake-terrain.mjs) must never hand out bytes
// baked by another script or toolchain under the current key (SCHED-1 R1 F4).
// The real bake driver runs on a one-chunk fixture recipe; "versions" of the
// driver differ in what they add to each raw byte, which changes the script
// hash (and so the key) but not the bundled sources.
const root = resolve(".");
const base = mkdtempSync(join(tmpdir(), "siltwake-terrain-store-"));
after(() => rmSync(base, { recursive: true, force: true }));
const store = join(base, "store");
const driver = readFileSync(join(root, "scripts", "bake-terrain.mjs"), "utf8");
const marker = "const raw = mod.bakeChunkBytes(byId.get(id));";
assert.ok(driver.includes(marker));
const version = (add: number) => add === 0 ? driver
  : driver.replace(marker, `const raw = Uint8Array.from(mod.bakeChunkBytes(byId.get(id)), (v) => v + ${add});`);
const recipe = "export const bakeTargets = () => [{ id: 'one' }];\n" +
  "export const terrainFileName = (id) => id + '.bin';\nexport const bakeChunkBytes = () => new Uint8Array([1]);\n";
let n = 0;
function worktree(add: number): string {
  const dir = join(base, `wt${n++}`);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "src", "render", "biomes"), { recursive: true });
  writeFileSync(join(dir, "src", "render", "biomes", "bake.ts"), recipe);
  writeFileSync(join(dir, "scripts", "bake-terrain.mjs"), version(add));
  // The bake asks the local-run guard (STEW-2) first.
  for (const f of ["local-guard.mjs", "cgroup-scope.mjs"]) writeFileSync(join(dir, "scripts", f), readFileSync(join(root, "scripts", f)));
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}
function bake(dir: string, ...args: string[]): string {
  const r = spawnSync(process.execPath, [join(dir, "scripts", "bake-terrain.mjs"), ...args],
    { cwd: dir, encoding: "utf8", env: { ...process.env, SILTWAKE_TERRAIN_STORE: store, BAKE_WORKERS: "1" } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout + r.stderr;
}
const byte = (dir: string) => [...inflateSync(readFileSync(join(dir, "public", "terrain", "one.bin")))];
const entries = () => readdirSync(store).filter((e) => /^[0-9a-f]{32}$/.test(e));

test("a fresh worktree restores a bake by the same driver and tools", () => {
  const a = worktree(0);
  assert.match(bake(a), /1 chunks in/);
  const b = worktree(0);
  assert.match(bake(b), /restored 1 chunks from the shared store/);
  assert.deepEqual(byte(b), [1]);
});

test("after a driver change, local output is stale and old bytes never reach the new key", () => {
  const a = worktree(0);
  bake(a);
  writeFileSync(join(a, "scripts", "bake-terrain.mjs"), version(1)); // same sources, new driver
  assert.match(bake(a), /1 chunks in/, "rebaked, not 'up to date'");
  assert.deepEqual(byte(a), [2]);
  const fresh = worktree(1);
  assert.match(bake(fresh), /restored/);
  assert.deepEqual(byte(fresh), [2], "the new key holds the new driver's bytes");
});

test("a manifest from before the store (sourceHash only) stays locally fresh but is never published", () => {
  const old = worktree(2);
  bake(old); // builds and publishes [3] under version 2's key; now make it a legacy manifest with other bytes
  const keysBefore = entries().length;
  writeFileSync(join(old, "scripts", "bake-terrain.mjs"), version(5));
  const manifestPath = join(old, "public", "terrain", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  delete manifest.fingerprint;
  writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.match(bake(old), /up to date/);
  assert.equal(entries().length, keysBefore, "nothing published under version 5's key");
  const fresh = worktree(5);
  assert.match(bake(fresh), /1 chunks in/, "a fresh worktree bakes rather than restoring legacy bytes");
  assert.deepEqual(byte(fresh), [6]);
});

test("a damaged store entry is a cache miss, and --verify and --force never use the store", () => {
  const a = worktree(7);
  bake(a);
  const [entry] = entries().filter((e) => readFileSync(join(store, e, "manifest.json"), "utf8").includes(JSON.parse(
    readFileSync(join(a, "public", "terrain", "manifest.json"), "utf8")).fingerprint));
  appendFileSync(join(store, entry!, "one.bin"), "x");
  const b = worktree(7);
  const out = bake(b);
  assert.match(out, /unusable \(checksum mismatch\); baking/);
  assert.deepEqual(byte(b), [8]);
  assert.match(bake(b, "--verify"), /verified 1\/1/);
  assert.match(bake(b, "--force"), /1 chunks in/);
});
