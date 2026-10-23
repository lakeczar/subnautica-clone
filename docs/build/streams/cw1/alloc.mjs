// CW-1 allocation profile (Node, no browser): bytes allocated per operation
// on the streaming paths, by allocating function, with V8's sampling heap
// profiler counting objects GC has already collected (the allocation rate,
// not the live set). The renderer's per-frame Babylon work is not runnable
// here; its pure parts (light selection and uniforms) are.
// usage: node alloc.mjs <repo>   (after npm run test:build)
import { Session } from "node:inspector/promises";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
const B = path.resolve(process.argv[2] ?? ".", ".test-build") + "/";
const { gameWorld } = await import(B + "src/sim/world.js");
const { CAVE_SOURCES } = await import(B + "src/content/regions/caves.js");
const { decodeTerrain } = await import(B + "src/render/biomes/terrainCodec.js");
const { selectLights, lightUniforms } = await import(B + "src/render/lighting/localLights.js");
const { createGame } = await import(B + "src/sim/state.js");
const { completeOpening } = await import(B + "src/sim/progression.js");
const { stepGame } = await import(B + "src/sim/step.js");

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
  console.log(`\n## ${name}: ${(total / 1048576).toFixed(1)} MiB over ${units} ${units === 1 ? "run" : "units"} = ${(per / 1024).toFixed(1)} KiB each (${(ms / units).toFixed(2)} ms each)`);
  for (const [k, v] of top) console.log(`  ${(v / total * 100).toFixed(0).padStart(3)}%  ${(v / units / 1024).toFixed(1).padStart(8)} KiB  ${k}`);
}

// 1. Kit cave cluster construction from records (what the streamer slices).
const w = gameWorld(), ks = w.kitCaves;
const reef = ks.clusters.filter(c => c.caves.some(id => /^reef_/.test(id))).slice(0, 4).map(c => c.index);
for (const i of reef) { ks.step([i], Infinity, () => performance.now()); ks.evict(i); } // warm records (live generation is not the browser's path)
await profile("kit cave cluster build (records → composite)", reef.length, () => { for (const i of reef) { ks.step([i], Infinity, () => performance.now()); } });
const boxes = ks.stats.residentBoxes; console.log(`  (${boxes} boxes resident: ${(boxes ? 1 : 0) && ""}per cluster ≈ ${(boxes / reef.length).toFixed(0)} boxes)`);
for (const i of reef) ks.evict(i);

// 2. Chunk terrain decode from the bake (the browser's path), fine and coarse.
const manifest = JSON.parse(readFileSync(path.join(process.argv[2] ?? ".", "public/terrain/manifest.json"), "utf8"));
const ids = Object.keys(manifest.chunks).slice(40, 52);
const files = ids.map(id => ({ id, bytes: new Uint8Array(inflateSync(readFileSync(path.join(process.argv[2] ?? ".", "public/terrain", manifest.chunks[id].file)))) }));
const rectOf = (id) => { const [, ix, iz] = id.split(":").map(Number); return { minX: -576 + ix * 64, maxX: -512 + ix * 64, minZ: -1632 + iz * 64, maxZ: -1568 + iz * 64 }; };
await profile("chunk terrain decode (baked, fine)", files.length, () => {
  for (const f of files) { const g = decodeTerrain(f.bytes, rectOf(f.id), f.id, "fine", () => false); let r = g.next(); while (!r.done) r = g.next(); }
});

// 3. Light selection and uniforms: one frame's steady work over 5,000 lights.
const lights = Array.from({ length: 5000 }, (_, i) => ({ x: (i % 70) * 6 - 200, y: -40 - (i % 13), z: Math.floor(i / 70) * 6 - 200,
  radius: 2 + (i % 9), strength: 0.3 + (i % 5) * 0.1, r: 1, g: 0.8, b: 0.5 }));
await profile("light selection + uniforms (5,000 lights, per frame)", 600, () => {
  for (let f = 0; f < 600; f++) { const eye = { x: (f % 60) - 30, y: -45, z: 0 }; lightUniforms(selectLights(lights, eye)); }
});

// 4. The simulation: one fixed step (the sim's own allocation, for comparison).
let s = createGame(); completeOpening(s); s.player.mode = "swimming"; s.player.pose.position = { x: -300, y: -12, z: -100 };
for (let i = 0; i < 60; i++) s = stepGame(s, [], w).state;
await profile("simulation step (stepGame, per tick)", 600, () => { for (let i = 0; i < 600; i++) s = stepGame(s, [], w).state; });
session.disconnect();
