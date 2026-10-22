#!/usr/bin/env node
// Bakes S2's terrain recipes into public/terrain/ (one zlib file per chunk,
// both LODs) for `s2.terrain` to fetch at runtime, and (CW-1) the kit caves'
// collision and light into public/caves/ (one collision pack, one light field
// per cave) for the cave streamer. Cached: each manifest records a hash of
// every bundled source, and an unchanged hash skips work.
//
//   node scripts/bake-terrain.mjs            bake if sources changed
//   node scripts/bake-terrain.mjs --force    rebake everything
//   node scripts/bake-terrain.mjs --verify   rebake in memory and require every
//                                            file to equal the live bytes
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { deflateSync, inflateSync } from "node:zlib";

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
const out = join(root, "public", "terrain"), caveOut = join(root, "public", "caves");
const work = join(process.env.TMPDIR ?? tmpdir(), `siltwake-bake-${process.pid}`);
mkdirSync(work, { recursive: true });
const bundle = join(work, "bake.mjs");
const result = await build({
  entryPoints: [join(root, "src/render/biomes/bake.ts")], bundle: true, platform: "node", format: "esm",
  outfile: bundle, metafile: true, logLevel: "warning",
});
const hash = createHash("sha256");
for (const input of Object.keys(result.metafile.inputs).sort()) hash.update(input).update(readFileSync(join(root, input)));
const sourceHash = hash.digest("hex");
const manifestPath = join(out, "manifest.json"), caveManifestPath = join(caveOut, "manifest.json");
const read = path => existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
const old = read(manifestPath), oldCaves = read(caveManifestPath);
const fresh = old?.sourceHash === sourceHash && Object.values(old.chunks).every(c => existsSync(join(out, c.file))) &&
  oldCaves?.sourceHash === sourceHash && existsSync(join(caveOut, oldCaves.collision.file)) &&
  Object.values(oldCaves.light).every(c => existsSync(join(caveOut, c.file)));
if (fresh && !args.has("--force") && !args.has("--verify")) {
  console.log(`bake-terrain: up to date (${Object.keys(old.chunks).length} chunks, ${(old.totalBytes / 1048576).toFixed(2)} MiB; ` +
    `${Object.keys(oldCaves.light).length} caves, ${(oldCaves.totalBytes / 1048576).toFixed(2)} MiB)`);
  rmSync(work, { recursive: true, force: true });
  process.exit(0);
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
const collisionRaw = packKitCaves(caveIds.map(id => caves.get(id).collision));
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
writeFileSync(manifestPath, JSON.stringify({ codec: 1, sourceHash, totalBytes, rawBytes, chunks }, null, 1) + "\n");

rmSync(caveOut, { recursive: true, force: true });
mkdirSync(join(caveOut, "light"), { recursive: true });
const collisionPacked = deflateSync(Buffer.from(collisionRaw), { level: 9 });
writeFileSync(join(caveOut, "collision.bin"), collisionPacked);
const light = {};
let caveBytes = collisionPacked.length, caveRaw = collisionRaw.byteLength;
for (const id of caveIds) {
  const raw = caves.get(id).light, packed = deflateSync(Buffer.from(raw), { level: 9 });
  writeFileSync(join(caveOut, lightFile(id)), packed);
  light[id] = { file: lightFile(id), bytes: packed.length, rawBytes: raw.byteLength };
  caveBytes += packed.length; caveRaw += raw.byteLength;
}
writeFileSync(caveManifestPath, JSON.stringify({ codec: 1, sourceHash, totalBytes: caveBytes, rawBytes: caveRaw,
  collision: { file: "collision.bin", bytes: collisionPacked.length, rawBytes: collisionRaw.byteLength }, light }, null, 1) + "\n");
console.log(`bake-terrain: ${ids.length} chunks and ${caveIds.length} caves in ${((Date.now() - started) / 1000).toFixed(1)} s, ` +
  `${(totalBytes / 1048576).toFixed(2)} MiB compressed (${(rawBytes / 1048576).toFixed(2)} MiB raw) -> public/terrain/, ` +
  `${(caveBytes / 1048576).toFixed(2)} MiB (${(caveRaw / 1048576).toFixed(2)} MiB raw) -> public/caves/`);
