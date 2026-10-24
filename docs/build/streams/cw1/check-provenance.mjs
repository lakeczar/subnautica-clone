// CW-1 composed-bake provenance (R4, CW-1 merging after COL-1): the fresh bake's manifests
// and collision pack, and the built game, all carry the source hash of the tree they came
// from. Run after `bake-terrain.mjs --force`, `--verify` and `npm run build`.
//   usage (repo root): node docs/build/streams/cw1/check-provenance.mjs [dist]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { bakeSourceHash } from "../../../../scripts/bake-source-hash.mjs";

const dist = process.argv[2] ?? "dist", fail = [];
const want = await bakeSourceHash(process.cwd());
const terrain = JSON.parse(readFileSync(path.join(dist, "terrain/manifest.json"), "utf8"));
const caves = JSON.parse(readFileSync(path.join(dist, "caves/manifest.json"), "utf8"));
if (terrain.sourceHash !== want) fail.push(`terrain manifest ${terrain.sourceHash} ≠ source ${want}`);
if (caves.sourceHash !== want) fail.push(`cave manifest ${caves.sourceHash} ≠ source ${want}`);
// The collision pack's own header (KCP1, then the hash): a pack from other sources is refused at load.
const pack = inflateSync(readFileSync(path.join(dist, "caves/collision.bin")));
const head = pack.subarray(0, 4).toString("latin1"), packHash = Buffer.from(pack.subarray(4, 36)).toString("hex");
if (head !== "KCP1" || packHash !== want) fail.push(`collision pack ${head} ${packHash} ≠ source ${want}`);
// The build's expected hash (vite define) is the fresh one.
const bundles = readdirSync(path.join(dist, "assets")).filter(f => f.endsWith(".js"));
if (!bundles.some(f => readFileSync(path.join(dist, "assets", f), "utf8").includes(want))) fail.push(`no bundle carries ${want}`);
// Every file the manifests list is in the build with the listed bytes (sha-256).
const listed = [...Object.values(terrain.chunks).map(f => ({ file: path.join("terrain", f.file), sha256: f.sha256 })),
  ...terrain.caves.files.map(f => ({ file: path.join("caves", f.file), sha256: f.sha256 }))];
const sha = (f) => createHash("sha256").update(readFileSync(path.join(dist, f))).digest("hex");
const bad = listed.filter(f => !existsSync(path.join(dist, f.file)) || sha(f.file) !== f.sha256);
if (bad.length) fail.push(`${bad.length} listed file(s) missing or changed in ${dist}: ${bad.slice(0, 5).map(f => f.file).join(", ")}`);
if (Object.keys(caves.light).length !== 55) fail.push(`${Object.keys(caves.light).length} cave light fields, expected 55`);
console.log(JSON.stringify({ sourceHash: want, terrainChunks: Object.keys(terrain.chunks).length, caveFiles: terrain.caves.files.length, lightFields: Object.keys(caves.light).length,
  listedVerified: listed.length - bad.length, bundles: bundles.length }));
if (fail.length) { console.error(`provenance FAIL: ${fail.join("; ")}`); process.exit(1); }
console.log(`provenance ok: bake, pack, manifests and build all carry ${want}`);
