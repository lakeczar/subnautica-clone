#!/usr/bin/env node
// LC: bake the Canopy root caves for the large-cave lab (CPU-heavy: run it
// through scripts/heavy-check.sh).
//
//   scripts/heavy-check.sh --deadline 900 node tools/large-cave-lab.bake.mjs [--verify]
//
// Bundles the Babylon-free pipeline with esbuild, builds every chunk (fine
// and coarse meshes, collision, life, light, art), and writes
// tools/large-cave-lab.local/canopy_roots.bin.z (zlib) plus manifest.json
// with sizes and timings. Output is gitignored (*.local). --verify rebuilds,
// decodes the file and requires every baked collider to equal the live one.
import { build } from "esbuild";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "tools", "large-cave-lab.local");
const work = join(process.env.TMPDIR ?? tmpdir(), `lc-bake-${process.pid}`);
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
const entry = join(work, "entry.ts");
writeFileSync(entry, `
export { prepareCave, encodeCave, loadCaveBake, sourceHash } from ${JSON.stringify(join(root, "src/render/caves/large/pipeline.ts"))};
export { CANOPY_ROOT_CAVES } from ${JSON.stringify(join(root, "src/content/caves/canopyRootCaves.ts"))};
export { worldFloor } from ${JSON.stringify(join(root, "src/content/regions/worldFloor.ts"))};
export { collisionBytes } from ${JSON.stringify(join(root, "src/world/caves/large/collision.ts"))};
`);
const bundle = join(work, "bake.mjs");
await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: bundle, logLevel: "warning" });
const m = await import(pathToFileURL(bundle).href);

const started = Date.now();
const prepared = m.prepareCave(m.CANOPY_ROOT_CAVES, m.worldFloor, s => process.stderr.write(`  ${s}\n`));
const raw = m.encodeCave(prepared), packed = deflateSync(raw, { level: 9 });
writeFileSync(join(out, "canopy_roots.bin.z"), packed);
const count = (lod) => prepared.art.reduce((n, a) => n + a[lod].mesh.indices.length / 3, 0);
const life = prepared.art.reduce((n, a) => n + (a.life ? a.life.mesh.indices.length / 3 : 0), 0);
const manifest = {
  cave: m.CANOPY_ROOT_CAVES.id, sourceHash: m.sourceHash(m.CANOPY_ROOT_CAVES), chunks: prepared.cave.chunks.length,
  bytes: { raw: raw.byteLength, zlib: packed.byteLength }, collisionBytes: m.collisionBytes(prepared.cave.collision),
  triangles: { fine: count("fine"), coarse: count("coarse"), life }, lifePlacements: prepared.life.length,
  ms: { ...prepared.ms, total: Date.now() - started },
};
if (process.argv.includes("--verify")) {
  const t = Date.now(), loaded = m.loadCaveBake(m.CANOPY_ROOT_CAVES, inflateSync(readFileSync(join(out, "canopy_roots.bin.z"))));
  let mismatches = 0;
  prepared.cave.collision.colliders.forEach((live, i) => {
    const baked = loaded.collision.colliders[i];
    if (!live) { if (baked) mismatches++; return; }
    if (!baked || baked.positions.length !== live.positions.length || baked.tris.length !== live.tris.length) { mismatches++; return; }
    for (let k = 0; k < live.positions.length; k++) if (live.positions[k] !== baked.positions[k]) { mismatches++; return; }
    for (let k = 0; k < live.tris.length; k++) if (live.tris[k] !== baked.tris[k]) { mismatches++; return; }
  });
  manifest.verify = { colliderMismatches: mismatches, loadMs: loaded.ms, verifyMs: Date.now() - t };
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify(manifest, null, 2));
process.exit(manifest.verify?.colliderMismatches ? 1 : 0);
