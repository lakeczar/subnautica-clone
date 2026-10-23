#!/usr/bin/env node
// Bakes S2's terrain recipes into public/terrain/ (one zlib file per chunk,
// both LODs) for `s2.terrain` to fetch at runtime, and (CW-1) the kit caves'
// collision and light into public/caves/ (one collision pack, one light field
// per cave) for the cave streamer. Cached: the manifest
// records a hash of every bundled source, and an unchanged hash skips work.
//
//   node scripts/bake-terrain.mjs            bake if sources changed
//   node scripts/bake-terrain.mjs --force    rebake everything
//   node scripts/bake-terrain.mjs --verify   rebake in memory and require every
//                                            file to equal the live bytes
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
import { BAKE_ENTRY, sourceHashOf } from "./bake-source-hash.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (!isMainThread) {
  const { bundle, ids, caveIds } = workerData;
  const mod = await import(pathToFileURL(bundle).href);
  const byId = new Map(mod.bakeTargets().map(c => [c.id, c]));
  for (const id of ids) {
    const raw = mod.bakeChunkBytes(byId.get(id));
    parentPort.postMessage({ kind: "chunk", id, file: mod.terrainFileName(id), raw });
  }
  for (const id of caveIds) {
    const { collision, light } = mod.bakeCaveBytes(id);
    parentPort.postMessage({ kind: "cave", id, collision, light });
  }
  process.exit(0);
}

const args = new Set(process.argv.slice(2));
const pub = join(root, "public"), out = join(pub, "terrain"), caveOut = join(pub, "caves");
const work = join(process.env.TMPDIR ?? tmpdir(), `siltwake-bake-${process.pid}`);
mkdirSync(work, { recursive: true });
const bundle = join(work, "bake.mjs");
const result = await build({
  entryPoints: [join(root, BAKE_ENTRY)], bundle: true, platform: "node", format: "esm",
  outfile: bundle, metafile: true, logLevel: "warning", absWorkingDir: root,
});
const sourceHash = sourceHashOf(root, result.metafile);
const manifestPath = join(out, "manifest.json"), caveManifestPath = join(caveOut, "manifest.json");
const read = (path) => existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
const old = read(manifestPath);
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
// The terrain manifest also lists the cave files (CW-1), so one fingerprint,
// one freshness check and one store entry cover both.
/** Every baked file a manifest names, relative to `public/`, with its sha256. */
const files = (m) => [...Object.values(m.chunks).map(c => ({ path: join("terrain", c.file), sha256: c.sha256 })),
  ...(m.caves?.files ?? []).map(f => ({ path: join("caves", f.file), sha256: f.sha256 })),
  ...(m.caves ? [{ path: join("caves", "manifest.json"), sha256: m.caves.manifest }] : [])];
const fresh = old?.sourceHash === sourceHash && (old.fingerprint == null || old.fingerprint === storeKey) && !!old.caves &&
  files(old).every(f => existsSync(join(pub, f.path)));
/** Every file the manifest names exists under `dir` with its recorded sha256. */
const intact = (dir, manifest) => files(manifest).every((f) =>
  existsSync(join(dir, f.path)) && createHash("sha256").update(readFileSync(join(dir, f.path))).digest("hex") === f.sha256);
const copyAll = (from, to, manifest) => {
  for (const f of files(manifest)) { mkdirSync(dirname(join(to, f.path)), { recursive: true }); copyFileSync(join(from, f.path), join(to, f.path)); }
};
/** Publishes `dir` (a complete bake) to the store unless the key is there; atomic, never overwritten. */
function publish(dir, manifest) {
  if (!useStore || existsSync(entry)) return;
  try {
    const tmp = `${entry}.tmp-${process.pid}`;
    mkdirSync(tmp, { recursive: true });
    copyAll(dir, tmp, manifest);
    writeFileSync(join(tmp, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
    try { renameSync(tmp, entry); } catch { rmSync(tmp, { recursive: true, force: true }); } // another worktree won
    // Keep the 20 newest entries.
    const entries = readdirSync(storeRoot).filter((n) => /^[0-9a-f]{32}$/.test(n))
      .map((n) => ({ n, t: statSync(join(storeRoot, n)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const { n } of entries.slice(20)) rmSync(join(storeRoot, n), { recursive: true, force: true });
  } catch (err) { console.warn(`bake-terrain: could not publish to the shared store (${err.message})`); }
}

if (fresh && !args.has("--force") && !args.has("--verify")) {
  console.log(`bake-terrain: up to date (${Object.keys(old.chunks).length} chunks, ${(old.totalBytes / 1048576).toFixed(2)} MiB; ` +
    `${old.caves.files.length - 1} caves, ${(old.caves.totalBytes / 1048576).toFixed(2)} MiB)`);
  if (useStore && old.fingerprint === storeKey && !existsSync(entry) && intact(pub, old)) publish(pub, old);
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
    if (!stored.caves) throw new Error("no caves in the entry");
    rmSync(caveOut, { recursive: true, force: true });
    copyAll(entry, pub, stored);
    if (!intact(pub, stored)) throw new Error("copy differs");
    writeFileSync(manifestPath, JSON.stringify(stored, null, 1) + "\n");
    console.log(`bake-terrain: restored ${Object.keys(stored.chunks).length} chunks and ${stored.caves.files.length - 1} caves from the shared store (${storeKey.slice(0, 12)}), no bake needed`);
    rmSync(work, { recursive: true, force: true });
    process.exit(0);
  } catch (err) {
    console.warn(`bake-terrain: shared store entry ${storeKey.slice(0, 12)} unusable (${err.message}); baking`);
  }
}

const { bakeTargets, bakeCaveTargets, packKitCaves } = await import(pathToFileURL(bundle).href);
const ids = bakeTargets().map(c => c.id), caveIds = bakeCaveTargets();
const n = Math.max(1, Math.min(Number(process.env.BAKE_WORKERS ?? 4), availableParallelism()));
const started = Date.now(), baked = new Map(), caves = new Map();
await Promise.all(Array.from({ length: n }, (_, w) => new Promise((done, fail) => {
  const mine = ids.filter((_, i) => i % n === w), myCaves = caveIds.filter((_, i) => i % n === w);
  const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { bundle, ids: mine, caveIds: myCaves } });
  worker.on("message", m => (m.kind === "chunk" ? baked : caves).set(m.id, m));
  worker.on("error", fail);
  worker.on("exit", code => code === 0 ? done() : fail(new Error(`bake worker exited ${code}`)));
})));
rmSync(work, { recursive: true, force: true });

// One collision pack, in `CAVE_SOURCES` order; one light field per cave.
const collisionRaw = packKitCaves(caveIds.map(id => caves.get(id).collision), sourceHash);
const lightFile = id => `light/${id}.bin`;

if (args.has("--verify")) {
  let bad = 0;
  const same = (path, raw) => existsSync(path) && Buffer.compare(inflateSync(readFileSync(path)), Buffer.from(raw)) === 0;
  for (const id of ids) {
    const { file, raw } = baked.get(id);
    if (!same(join(out, file), raw)) { bad++; console.error(`bake-terrain: ${file} differs from the live recipe`); }
  }
  if (!same(join(caveOut, "collision.bin"), collisionRaw)) { bad++; console.error("bake-terrain: caves/collision.bin differs from the live records"); }
  for (const id of caveIds)
    if (!same(join(caveOut, lightFile(id)), caves.get(id).light)) { bad++; console.error(`bake-terrain: caves/${lightFile(id)} differs from the live field`); }
  const total = ids.length + 1 + caveIds.length;
  console.log(`bake-terrain: verified ${total - bad}/${total} files equal the live bytes (${ids.length} chunks, 1 collision pack, ${caveIds.length} light fields)`);
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
rmSync(caveOut, { recursive: true, force: true });
mkdirSync(join(caveOut, "light"), { recursive: true });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const collisionPacked = deflateSync(Buffer.from(collisionRaw), { level: 9 });
writeFileSync(join(caveOut, "collision.bin"), collisionPacked);
const light = {}, caveFiles = [{ file: "collision.bin", sha256: sha(collisionPacked) }];
let caveBytes = collisionPacked.length, caveRaw = collisionRaw.byteLength;
for (const id of caveIds) {
  const raw = caves.get(id).light, packed = deflateSync(Buffer.from(raw), { level: 9 });
  writeFileSync(join(caveOut, lightFile(id)), packed);
  light[id] = { file: lightFile(id), bytes: packed.length, rawBytes: raw.byteLength };
  caveFiles.push({ file: lightFile(id), sha256: sha(packed) });
  caveBytes += packed.length; caveRaw += raw.byteLength;
}
const caveManifest = JSON.stringify({ codec: 1, sourceHash, totalBytes: caveBytes, rawBytes: caveRaw,
  collision: { file: "collision.bin", bytes: collisionPacked.length, rawBytes: collisionRaw.byteLength }, light }, null, 1) + "\n";
writeFileSync(caveManifestPath, caveManifest);
const manifest = { codec: 1, sourceHash, fingerprint: storeKey, totalBytes, rawBytes, chunks,
  caves: { totalBytes: caveBytes, files: caveFiles, manifest: sha(caveManifest) } };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
publish(pub, manifest);
console.log(`bake-terrain: ${ids.length} chunks and ${caveIds.length} caves in ${((Date.now() - started) / 1000).toFixed(1)} s, ` +
  `${(totalBytes / 1048576).toFixed(2)} MiB compressed (${(rawBytes / 1048576).toFixed(2)} MiB raw) -> public/terrain/, ` +
  `${(caveBytes / 1048576).toFixed(2)} MiB (${(caveRaw / 1048576).toFixed(2)} MiB raw) -> public/caves/`);
