// CW-1 allocation profile (Node, no browser): bytes allocated per operation
// on the streaming paths, by allocating function, with V8's sampling heap
// profiler counting objects GC has already collected (the allocation rate,
// not the live set). Bound to its evidence: the commit it ran at and a SAVE-1
// library save (earned, not edited), whose craft, pose and world it uses.
// The renderer's Babylon work runs on a NullEngine (the scene lights); the GPU
// upload itself is not runnable here.
// usage: node alloc.mjs <repo> [save kind]   (after npm run test:build)
import { Session } from "node:inspector/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import path from "node:path";
const REPO = path.resolve(process.argv[2] ?? "."), B = path.join(REPO, ".test-build") + "/", SAVE = process.argv[3] ?? "tour-ready";
const { gameWorld } = await import(B + "src/sim/world.js");
const { CAVE_SOURCES } = await import(B + "src/content/regions/caves.js");
const { decodeTerrain } = await import(B + "src/render/biomes/terrainCodec.js");
const { selectLights, lightUniforms } = await import(B + "src/render/lighting/localLights.js");
const { createKitStreamer } = await import(B + "src/world/caves/kitStream.js");
const { decodeSave } = await import(B + "src/save/codec.js");
const { stepGameInPlace } = await import(B + "src/sim/step.js");
const { createSceneLights } = await import(B + "src/render/lighting/sceneLights.js");
const { createCaveCelMaterial } = await import(B + "src/render/caves/caveMaterial.js");
const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
const { Scene } = await import("@babylonjs/core/scene.js");
const { Mesh } = await import("@babylonjs/core/Meshes/mesh.js");
const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");

const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: REPO, encoding: "utf8" }).trim();
const picked = execFileSync(process.execPath, [B + "scripts/playthrough/saves.js", "pick", SAVE], { cwd: REPO, encoding: "utf8" }).trim().split("\n");
const save = decodeSave(readFileSync(picked.at(-1), "utf8"));
if (!save.ok) throw new Error(`${SAVE}: ${save.error}`);
console.log(`# CW-1 allocation profile at ${commit}${dirty ? " (UNCOMMITTED CHANGES: not evidence)" : ""}`);
console.log(`save: ${picked.join(" | ")}`);

const session = new Session(); session.connect();
await session.post("HeapProfiler.enable");
async function profile(name, units, run) {
  globalThis.gc?.();
  await session.post("HeapProfiler.startSampling", { samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const t0 = performance.now(); run(); const ms = performance.now() - t0;
  const { profile: p } = await session.post("HeapProfiler.stopSampling");
  const byFn = new Map(); let total = 0;
  const walk = (n) => {
    const self = n.selfSize ?? 0; total += self;
    if (self) { const f = n.callFrame; const k = `${f.functionName || "(anonymous)"} ${f.url.split("/").slice(-2).join("/")}:${f.lineNumber + 1}`; byFn.set(k, (byFn.get(k) ?? 0) + self); }
    for (const c of n.children ?? []) walk(c);
  };
  walk(p.head);
  const per = total / units, top = [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`\n## ${name}: ${(total / 1048576).toFixed(2)} MiB over ${units} ${units === 1 ? "run" : "units"} = ${(per / 1024).toFixed(2)} KiB each (${(ms / units).toFixed(3)} ms each)`);
  for (const [k, v] of top) console.log(`  ${(v / total * 100).toFixed(0).padStart(3)}%  ${(v / units / 1024).toFixed(2).padStart(8)} KiB  ${k}`);
}

// 1. The save's world and craft: the streamer's tick over a pass that crosses caves.
const state = save.value.state, w = gameWorld(), ks = w.kitCaves;
const craft = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId);
const start = craft?.pose.position ?? state.player.pose.position;
const streamer = createKitStreamer(ks, new Map(CAVE_SOURCES.map(c => [c.id, c.footprint])));
// A pass from the craft to the three nearest caves' centres and back, at Dart boost (11 m/s, 60 Hz).
const centre = (c) => ({ x: (c.footprint.minX + c.footprint.maxX) / 2, y: -12, z: (c.footprint.minZ + c.footprint.maxZ) / 2 });
const near = [...CAVE_SOURCES].sort((a, b) => Math.hypot(centre(a).x - start.x, centre(a).z - start.z) - Math.hypot(centre(b).x - start.x, centre(b).z - start.z)).slice(0, 3);
const corners = [start, ...near.map(centre), start], poses = [];
for (let i = 1; i < corners.length; i++) {
  const a = corners[i - 1], b = corners[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (11 / 60)));
  for (let k = 0; k < n; k++) poses.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, z: a.z + (b.z - a.z) * k / n, vx: (b.x - a.x) / n * 60, vz: (b.z - a.z) / n * 60 });
}
console.log(`\npass: ${poses.length} frames from the save's craft at ${[start.x, start.y, start.z].map(v => v.toFixed(0)).join(",")} via ${near.map(c => c.id).join(", ")}`);
const tick = (p) => streamer.update(p, { x: p.vx, y: 0, z: p.vz });
// The first pass builds the clusters (sliced, its own allocation); the second is the steady tick over resident clusters.
await profile("cave streamer tick, first pass (sliced builds included)", poses.length, () => { for (const p of poses) tick(p); });
console.log(`  (${ks.resident.length} clusters resident, ${ks.stats.residentBoxes} boxes)`);
await profile("cave streamer tick, steady (clusters resident)", poses.length, () => { for (const p of poses) tick(p); });

// 2. The simulation on the save: the craft driven forward, in place (SIM-1a), over the world above.
const s = structuredClone(state), move = [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: true }];
for (let i = 0; i < 60; i++) stepGameInPlace(s, move, w);
await profile(`simulation step on the save (${craft?.hull ?? "diver"} driven forward, per tick)`, 600, () => { for (let i = 0; i < 600; i++) stepGameInPlace(s, move, w); });

// 3. Scene lights, settled: 400 emissive meshes (single-vertex clusters) on a NullEngine, the viewer moving.
{
  const engine = new NullEngine(), scene = new Scene(engine), cel = createCaveCelMaterial(scene);
  const lights = createSceneLights(scene, cel, [{ setArray4() {}, setFloat() {} }]);
  for (let i = 0; i < 400; i++) {
    const m = new Mesh(`emissive-${i}`, scene);
    m.material = cel; m.setVerticesData("position", [(i % 20) * 6, -20 - (i % 7), Math.floor(i / 20) * 6]); m.setVerticesData("color", [0.5, 0.3, 1, -1]); m.setIndices([0, 0, 0]); m.freezeWorldMatrix();
  }
  for (let i = 0; i < 3; i++) await new Promise(r => setTimeout(r, 5));
  const eye = new Vector3(0, -22, 0);
  for (let f = 0; f < 120; f++) lights.update(null, eye, 1, 0);
  await profile("scene lights update, settled (400 emissive meshes, viewer moving)", 600, () => {
    for (let f = 0; f < 600; f++) { eye.set((f % 120) * 0.5, -22, (f % 60) * 0.5); lights.update(null, eye, 1, 0); }
  });
  lights.dispose(); scene.dispose(); engine.dispose();
}

// 4. Light selection and uniforms alone: one frame's steady work over 5,000 lights.
const many = Array.from({ length: 5000 }, (_, i) => ({ x: (i % 70) * 6 - 200, y: -40 - (i % 13), z: Math.floor(i / 70) * 6 - 200,
  radius: 2 + (i % 9), strength: 0.3 + (i % 5) * 0.1, r: 1, g: 0.8, b: 0.5 }));
await profile("light selection + uniforms (5,000 lights, per frame)", 600, () => {
  for (let f = 0; f < 600; f++) { const eye = { x: (f % 60) - 30, y: -45, z: 0 }; lightUniforms(selectLights(many, eye)); }
});

// 5. Chunk terrain decode from the bake (the browser's path), fine.
const manifest = JSON.parse(readFileSync(path.join(REPO, "public/terrain/manifest.json"), "utf8"));
const ids = Object.keys(manifest.chunks).slice(40, 52);
const files = ids.map(id => ({ id, bytes: new Uint8Array(inflateSync(readFileSync(path.join(REPO, "public/terrain", manifest.chunks[id].file)))) }));
const rectOf = (id) => { const [, ix, iz] = id.split(":").map(Number); return { minX: -576 + ix * 64, maxX: -512 + ix * 64, minZ: -1632 + iz * 64, maxZ: -1568 + iz * 64 }; };
await profile("chunk terrain decode (baked, fine)", files.length, () => {
  for (const f of files) { const g = decodeTerrain(f.bytes, rectOf(f.id), f.id, "fine", () => false); let r = g.next(); while (!r.done) r = g.next(); }
});
session.disconnect();
