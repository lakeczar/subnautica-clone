// CW-1: light selection's own cost at deep 2's two failing frames (r13), on a quiet
// non-exclusive run: the composed world art streamed headless (NullEngine) at each recorded
// camera pose with the deep save's state, the real SceneLights settled, then selection timed
// over many updates (stats.selectMs, the browser's `lightSelect` part) with process CPU.
// The browser frames also held one moving creature mesh (1,201 lights), not in world art:
// selection is timed again over synthetic candidates at the frame's recorded count.
// usage (repo root, after the test build): node select-replay.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const B = path.resolve(".test-build") + "/", NM = path.resolve("node_modules/@babylonjs/core") + "/";
const { NullEngine } = await import(NM + "Engines/nullEngine.js");
const { Scene } = await import(NM + "scene.js");
const { Vector3 } = await import(NM + "Maths/math.vector.js");
const { createRegionalArt, NEAR_WORLD } = await import(B + "src/render/renderer.js");
const { createCelMaterial, createGlassMaterial } = await import(B + "src/render/materials.js");
const { createSceneLights } = await import(B + "src/render/lighting/sceneLights.js");
const { selectLights } = await import(B + "src/render/lighting/localLights.js");
const { decodeSave } = await import(B + "src/save/codec.js");
class TextCanvas { width = 512; height = 128; getContext() { return { fillStyle: "", font: "", textAlign: "", textBaseline: "", clearRect() {}, fillRect() {}, fillText() {}, measureText(t) { return { width: t.length * 24 }; } }; } }
Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: TextCanvas });
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const file = execFileSync(process.execPath, [B + "scripts/playthrough/saves.js", "pick", "canopy-over-geared"], { encoding: "utf8" }).trim().split("\n").at(-1);
const state = decodeSave(readFileSync(file, "utf8")).value.state;
// deep 2's two streaming frames in r13 (runs/r13/deep/segment-2.json): camera, candidates in the browser frame.
const FRAMES = [{ at: 372329, camera: [655.98, -310.354, -1215.498], browserMs: 63.7, lightsIn: 9305 },
  { at: 377462, camera: [639.563, -323.19, -1221.142], browserMs: 102.4, lightsIn: 9092 }];
let t = 0; const workClock = () => (t += 0.01);
console.log(`# light selection replay at ${commit}; save ${path.basename(file)}`);
for (const f of FRAMES) {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
  const art = createRegionalArt(scene, cel, glass, { now: workClock });
  const eye = new Vector3(...f.camera), p = { x: eye.x, y: eye.y, z: eye.z };
  state.player.pose.position = { ...p };
  art.update(state);
  let s = art.stream(p, { nearRadius: NEAR_WORLD });
  for (let i = 0; i < 6000 && !s.settled; i++) s = art.stream(p);
  const lights = createSceneLights(scene, cel, [cel]);
  for (let i = 0; i < 4000 && !lights.stats.settled; i++) { await new Promise(r => setImmediate(r)); lights.update(state, eye, 0, 0); }
  for (let i = 0; i < 50; i++) lights.update(state, eye, 0, 0); // warm (JIT)
  const sel = [], cpu0 = process.cpuUsage(), w0 = performance.now(), N = 500;
  for (let i = 0; i < N; i++) { lights.update(state, eye, 0, 0); sel.push(lights.stats.selectMs); }
  const wall = performance.now() - w0, cpu = process.cpuUsage(cpu0);
  sel.sort((a, b) => a - b);
  const considered = lights.stats.considered;
  // At the browser frame's count: synthetic candidates spread round the eye (the replay lacks the
  // creature mesh's 1,201), timed with the same selection, so the count itself is covered.
  const probe = [];
  for (let i = 0; i < f.lightsIn; i++) probe.push({ x: eye.x + ((i * 37) % 400) - 200, y: eye.y + ((i * 13) % 60) - 30, z: eye.z + ((i * 53) % 400) - 200, radius: 2 + (i % 9), strength: 0.3 + (i % 5) * 0.1, r: 1, g: 0.8, b: 0.5 });
  for (let i = 0; i < 50; i++) selectLights(probe, eye);
  const ps = []; for (let i = 0; i < 500; i++) { const a = performance.now(); selectLights(probe, eye); ps.push(performance.now() - a); }
  ps.sort((a, b) => a - b);
  console.log(JSON.stringify({ frame: f.at, camera: f.camera, browserSelectMs: f.browserMs, browserCandidates: f.lightsIn,
    replayCandidates: considered, settled: lights.stats.settled, chunksSettled: s.settled,
    selectMs: { p50: +sel[N >> 1].toFixed(3), p99: +sel[Math.floor(N * 0.99)].toFixed(3), max: +sel.at(-1).toFixed(3) },
    updateMsEach: +(wall / N).toFixed(3), cpuMsEach: +(((cpu.user + cpu.system) / 1000) / N).toFixed(3),
    atBrowserCount: { candidates: probe.length, p50: +ps[250].toFixed(3), p99: +ps[495].toFixed(3), max: +ps.at(-1).toFixed(3) } }));
  lights.dispose(); art.dispose?.(); scene.dispose(); engine.dispose();
}
