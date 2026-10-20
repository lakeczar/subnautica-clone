#!/usr/bin/env node
// Bakes S2's terrain recipes into public/terrain/ (one zlib file per chunk,
// both LODs) for `s2.terrain` to fetch at runtime. Cached: the manifest
// records a hash of every bundled source, and an unchanged hash skips work.
//
//   node scripts/bake-terrain.mjs            bake if sources changed
//   node scripts/bake-terrain.mjs --force    rebake everything
//   node scripts/bake-terrain.mjs --verify   rebake in memory and require every
//                                            file to equal the live recipe bytes
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
  outfile: bundle, metafile: true, logLevel: "warning",
});
const hash = createHash("sha256");
for (const input of Object.keys(result.metafile.inputs).sort()) hash.update(input).update(readFileSync(join(root, input)));
const sourceHash = hash.digest("hex");
const manifestPath = join(out, "manifest.json");
const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const fresh = old?.sourceHash === sourceHash && Object.values(old.chunks).every(c => existsSync(join(out, c.file)));
if (fresh && !args.has("--force") && !args.has("--verify")) {
  console.log(`bake-terrain: up to date (${Object.keys(old.chunks).length} chunks, ${(old.totalBytes / 1048576).toFixed(2)} MiB)`);
  rmSync(work, { recursive: true, force: true });
  process.exit(0);
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
writeFileSync(manifestPath, JSON.stringify({ codec: 1, sourceHash, totalBytes, rawBytes, chunks }, null, 1) + "\n");
console.log(`bake-terrain: ${ids.length} chunks in ${((Date.now() - started) / 1000).toFixed(1)} s, ` +
  `${(totalBytes / 1048576).toFixed(2)} MiB compressed (${(rawBytes / 1048576).toFixed(2)} MiB raw) -> public/terrain/`);
