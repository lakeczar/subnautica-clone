#!/usr/bin/env node
// Bakes S2's terrain recipes into public/terrain/ (one zlib file per chunk,
// both LODs) for `s2.terrain` to fetch at runtime. Cached: the manifest
// records a hash of every bundled source, and an unchanged hash skips work.
//
//   node scripts/bake-terrain.mjs            bake if sources changed
//   node scripts/bake-terrain.mjs --force    rebake everything
//   node scripts/bake-terrain.mjs --verify   rebake in memory and require every
//                                            file to equal the live recipe bytes
//
// Shared store: a finished bake is published, immutable, to
// $SILTWAKE_TERRAIN_STORE (default /work/tmp/siltwake-terrain-store; "off"
// disables it) under a key covering the bundled sources (relative paths), this
// script, the codec and the Node, zlib and esbuild versions. A fresh worktree
// with the same inputs restores by copy instead of baking (about 3 minutes);
// every restored file is checked against the stored manifest's sha256 first.
// Only a manifest carrying this exact key (a bake by this script and these
// tools) is ever published or restored.
// --force and --verify never use the store; the composed gate's --verify still
// compares the restored files with the live recipe.
import { build, version as esbuildVersion } from "esbuild";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { deflateSync, inflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (!isMainThread) {
  const { bundle, ids } = workerData;
  const mod = await import(pathToFileURL(bundle).href);
  const byId = new Map(mod.bakeTargets().map(c => [c.id, c]));
  for (const id of ids) {
    const raw = mod.bakeChunkBytes(byId.get(id));
    parentPort.postMessage({ id, file: mod.terrainFileName(id), raw });
  }
  process.exit(0);
}

const args = new Set(process.argv.slice(2));
const out = join(root, "public", "terrain");
const work = join(process.env.TMPDIR ?? tmpdir(), `siltwake-bake-${process.pid}`);
mkdirSync(work, { recursive: true });
const bundle = join(work, "bake.mjs");
const result = await build({
  entryPoints: [join(root, "src/render/biomes/bake.ts")], bundle: true, platform: "node", format: "esm",
  outfile: bundle, metafile: true, logLevel: "warning", absWorkingDir: root,
});
const hash = createHash("sha256");
for (const input of Object.keys(result.metafile.inputs).sort()) hash.update(input).update(readFileSync(join(root, input)));
const sourceHash = hash.digest("hex");
const manifestPath = join(out, "manifest.json");
const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const storeRoot = process.env.SILTWAKE_TERRAIN_STORE ?? "/work/tmp/siltwake-terrain-store";
const useStore = storeRoot !== "off" && !args.has("--force") && !args.has("--verify");
const storeKey = createHash("sha256").update(JSON.stringify({ codec: 1, sourceHash, script: createHash("sha256")
  .update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"), node: process.version, zlib: process.versions.zlib, esbuild: esbuildVersion }))
  .digest("hex").slice(0, 32);
const entry = join(storeRoot, storeKey);
// The manifest records the full fingerprint (storeKey): output baked by another
// script or toolchain is stale even when the sources match. A manifest from
// before the store has only sourceHash; it stays locally fresh, as it always
// was, but is never published, so it cannot seed a newer key with old bytes.
const fresh = old?.sourceHash === sourceHash && (old.fingerprint == null || old.fingerprint === storeKey) &&
  Object.values(old.chunks).every(c => existsSync(join(out, c.file)));
/** Every file the manifest names exists in `dir` with its recorded sha256. */
const intact = (dir, manifest) => Object.values(manifest.chunks).every((c) =>
  existsSync(join(dir, c.file)) && createHash("sha256").update(readFileSync(join(dir, c.file))).digest("hex") === c.sha256);
/** Publishes `dir` (a complete bake) to the store unless the key is there; atomic, never overwritten. */
function publish(dir, manifest) {
  if (!useStore || existsSync(entry)) return;
  try {
    const tmp = `${entry}.tmp-${process.pid}`;
    mkdirSync(tmp, { recursive: true });
    for (const c of Object.values(manifest.chunks)) copyFileSync(join(dir, c.file), join(tmp, c.file));
    writeFileSync(join(tmp, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
    try { renameSync(tmp, entry); } catch { rmSync(tmp, { recursive: true, force: true }); } // another worktree won
    // Keep the 20 newest entries.
    const entries = readdirSync(storeRoot).filter((n) => /^[0-9a-f]{32}$/.test(n))
      .map((n) => ({ n, t: statSync(join(storeRoot, n)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const { n } of entries.slice(20)) rmSync(join(storeRoot, n), { recursive: true, force: true });
  } catch (err) { console.warn(`bake-terrain: could not publish to the shared store (${err.message})`); }
}

if (fresh && !args.has("--force") && !args.has("--verify")) {
  console.log(`bake-terrain: up to date (${Object.keys(old.chunks).length} chunks, ${(old.totalBytes / 1048576).toFixed(2)} MiB)`);
  if (useStore && old.fingerprint === storeKey && !existsSync(entry) && intact(out, old)) publish(out, old);
  rmSync(work, { recursive: true, force: true });
  process.exit(0);
}
const stored = useStore ? (() => { try { return JSON.parse(readFileSync(join(entry, "manifest.json"), "utf8")); } catch { return null; } })() : null;
if (stored?.fingerprint === storeKey && stored.sourceHash === sourceHash) {
  // Pin the entry against pruning, then check and copy it. Any failure (a
  // concurrent prune, a bad file) is a cache miss: the bake below runs, and the
  // manifest is written only after a complete restore or bake.
  try {
    utimesSync(entry, new Date(), new Date());
    if (!intact(entry, stored)) throw new Error("checksum mismatch");
    mkdirSync(out, { recursive: true });
    for (const c of Object.values(stored.chunks)) copyFileSync(join(entry, c.file), join(out, c.file));
    if (!intact(out, stored)) throw new Error("copy differs");
    writeFileSync(manifestPath, JSON.stringify(stored, null, 1) + "\n");
    console.log(`bake-terrain: restored ${Object.keys(stored.chunks).length} chunks from the shared store (${storeKey.slice(0, 12)}), no bake needed`);
    rmSync(work, { recursive: true, force: true });
    process.exit(0);
  } catch (err) {
    console.warn(`bake-terrain: shared store entry ${storeKey.slice(0, 12)} unusable (${err.message}); baking`);
  }
}

const { bakeTargets } = await import(pathToFileURL(bundle).href);
const ids = bakeTargets().map(c => c.id);
const n = Math.max(1, Math.min(Number(process.env.BAKE_WORKERS ?? 4), availableParallelism()));
const started = Date.now(), baked = new Map();
await Promise.all(Array.from({ length: n }, (_, w) => new Promise((done, fail) => {
  const mine = ids.filter((_, i) => i % n === w);
  const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { bundle, ids: mine } });
  worker.on("message", m => baked.set(m.id, m));
  worker.on("error", fail);
  worker.on("exit", code => code === 0 ? done() : fail(new Error(`bake worker exited ${code}`)));
})));
rmSync(work, { recursive: true, force: true });

if (args.has("--verify")) {
  let bad = 0;
  for (const id of ids) {
    const { file, raw } = baked.get(id), path = join(out, file);
    const disk = existsSync(path) ? inflateSync(readFileSync(path)) : null;
    if (!disk || Buffer.compare(disk, Buffer.from(raw)) !== 0) { bad++; console.error(`bake-terrain: ${file} differs from the live recipe`); }
  }
  console.log(`bake-terrain: verified ${ids.length - bad}/${ids.length} chunk files equal the live recipe bytes`);
  process.exit(bad ? 1 : 0);
}

mkdirSync(out, { recursive: true });
const chunks = {};
let totalBytes = 0, rawBytes = 0;
for (const id of ids) {
  const { file, raw } = baked.get(id), packed = deflateSync(Buffer.from(raw), { level: 9 });
  writeFileSync(join(out, file), packed);
  chunks[id] = { file, bytes: packed.length, rawBytes: raw.byteLength, sha256: createHash("sha256").update(packed).digest("hex") };
  totalBytes += packed.length; rawBytes += raw.byteLength;
}
const manifest = { codec: 1, sourceHash, fingerprint: storeKey, totalBytes, rawBytes, chunks };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
publish(out, manifest);
console.log(`bake-terrain: ${ids.length} chunks in ${((Date.now() - started) / 1000).toFixed(1)} s, ` +
  `${(totalBytes / 1048576).toFixed(2)} MiB compressed (${(rawBytes / 1048576).toFixed(2)} MiB raw) -> public/terrain/`);
