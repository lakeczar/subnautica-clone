import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
import { createCelMaterial, updateOpticalUniforms } from "../src/render/materials.js";
import { createAtmosphere } from "../src/render/atmosphere.js";
import { PALETTE as P } from "../src/render/palette.js";
import { createKitMaterial } from "../src/render/kit/material.js";
import { createKitLoader, TemplateLibrary, uploadMesh } from "../src/render/kit/loader.js";
import { defaultContext, KIT_FACTORIES } from "../src/render/kit/factories.js";
import { templateRecipes } from "../src/render/kit/templates.js";
import { meshBytes, RecipeBuilder, rgba, type P3 } from "../src/render/kit/recipe.js";
import { createWorldMap } from "../src/world/map.js";
import { createResidency } from "../src/world/residency.js";
import { createSliceLayout, sliceEntries, sliceFloor } from "../src/world/sliceLayout.js";
import type { Vec3 } from "../src/world/types.js";

/** Scale-slice harness: the full-size provisional world through the S1
 * runtime, with the production cel fragment, fog and atmosphere. Movement is
 * frame-locked (metres per frame), so a slow software renderer covers the
 * same route in the same number of frames as a fast GPU. */
const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => (q.has(k) ? Number(q.get(k)) : d);
const MiB = 1024 * 1024;
const route = q.get("route") ?? "tour";
const speed = num("speed", route === "sprint" ? 4 : 1.5);
const stopAfter = num("frames", Infinity);

const canvas = document.getElementById("slice") as HTMLCanvasElement;
const hud = document.getElementById("hud")!;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false, powerPreference: "high-performance" }, true);
engine.setHardwareScalingLevel(num("scale", 1));
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
const camera = new FreeCamera("slice.camera", new Vector3(0, -3, 14), scene);
camera.inputs.clear();
camera.minZ = 0.07; camera.maxZ = 450; camera.fov = 1.02;
scene.activeCamera = camera;
const cel = createCelMaterial(scene);
const kit = createKitMaterial(scene, cel);
const { water, sky } = createAtmosphere(scene);
const instrumentation = new SceneInstrumentation(scene);

// World, residency and kit.
const layout = createSliceLayout({ density: num("density", 1), setPieces: num("setpieces", 0.25), parts: num("parts", 240) });
const map = createWorldMap(layout, sliceEntries());
const templates = new TemplateLibrary(templateRecipes());
const loader = createKitLoader({ scene, material: kit, templates, factories: KIT_FACTORIES, context: defaultContext(sliceFloor, 0.75, undefined, (x, z) => {
  const r = map.regionAt({ x, y: 0, z });
  return r ? map.region(r)!.biomes[0]! : "reef_shelf";
}) });
const residency = createResidency({
  map, loader,
  budget: {
    cpuBytes: num("budget", 160) * MiB, gpuBytes: num("budget", 160) * MiB,
    uploadBytesPerFrame: num("upload", 4) * MiB, buildMsPerFrame: num("build", 4),
    maxInFlight: num("inflight", 2), retainedUnits: num("retain", 48),
  },
});
engine.onContextLostObservable.add(() => residency.discardHidden());

// Three ordinary hulls and a carrier-sized placeholder, station-kept in the
// Basin. Placeholders sized and tessellated like hull art, not final art.
function hull(kind: "dart" | "creel" | "mantle" | "carrier"): RecipeBuilder {
  const b = new RecipeBuilder();
  const dims = { dart: [4.2, 1.4, 2], creel: [8, 2.4, 3.2], mantle: [11, 3.4, 4.2], carrier: [64, 14, 18] }[kind];
  const [L, H, W] = dims as [number, number, number];
  const shell = rgba(P.porcelain, 1.6), seam = rgba(P.seam, 1), glass = rgba(P.glass, 1.4), warm = rgba(P.warm, -1);
  b.ellipsoid([0, 0, 0], [W / 2, H / 2, L / 2], shell, kind === "carrier" ? 48 : 28);
  const ribs = kind === "carrier" ? 36 : 10;
  for (let i = 0; i < ribs; i++) {
    const z = -L / 2 + (i + 0.5) * (L / ribs), s = Math.sqrt(Math.max(0, 1 - (2 * z / L) ** 2));
    const ring: P3[] = Array.from({ length: 13 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2;
      return [Math.cos(a) * (W / 2) * s * 1.02, Math.sin(a) * (H / 2) * s * 1.02, z];
    });
    b.tube(ring, kind === "carrier" ? 0.18 : 0.05, seam, 6);
  }
  b.ellipsoid([0, H * 0.35, -L * 0.3], [W * 0.28, H * 0.3, L * 0.14], glass, 20);
  for (const s of [-1, 1]) b.box([s * W * 0.55, 0, L * 0.3], [W * 0.25, H * 0.12, L * 0.22], seam, 0);
  if (kind === "carrier") {
    // Walkable interior kit stand-in: decks, rooms, furniture, berths.
    for (let deck = 0; deck < 2; deck++) {
      const y = -H * 0.25 + deck * 4.2;
      b.box([0, y, 0], [W * 0.7, 0.25, L * 0.8], rgba(P.shade, 1.2));
      for (let r = 0; r < 8; r++) {
        const z = -L * 0.35 + r * L * 0.1;
        b.box([-W * 0.2, y + 1.6, z], [0.15, 3, L * 0.09], rgba(P.shell, 1.2));
        for (let f = 0; f < 10; f++) b.box([-W * 0.25 + (f % 5) * 1.6, y + 0.6, z + (f > 4 ? 1.5 : -1.5)], [0.9, 1.1, 0.7], rgba(P.ochre, 1.3));
        b.ellipsoid([W * 0.2, y + 2.6, z], [0.3, 0.2, 0.3], warm, 10);
      }
    }
    for (const s of [-1, 1]) b.box([s * W * 0.32, -H * 0.3, L * 0.2], [5, 3.5, 12], rgba(P.metal, 1.3)); // dry berths
  }
  return b;
}
const station = { x: 360, y: -140, z: -520 };
const fleet: [Parameters<typeof hull>[0], P3, number][] = [
  ["carrier", [station.x, station.y, station.z], 0.4],
  ["dart", [station.x - 34, station.y - 8, station.z + 18], 1.2],
  ["creel", [station.x + 30, station.y - 4, station.z + 14], -0.6],
  ["mantle", [station.x - 6, station.y - 22, station.z - 40], 2.4],
];
let fleetBytes = 0;
for (const [kind, p, yaw] of fleet) {
  const recipe = hull(kind).build(`fleet.${kind}`);
  fleetBytes += meshBytes(recipe);
  const mesh = uploadMesh(recipe, `fleet.${kind}`, scene, kit);
  mesh.unfreezeWorldMatrix();
  mesh.position.set(...p); mesh.rotation.y = yaw;
  mesh.freezeWorldMatrix();
}

// Route: reef, isles, Canopy, Basin and the carrier station, Rift, Divide, a
// 500 m vertical drop into Meridian, the escarpment back to the Canopy, home.
const TOUR: Vec3[] = [
  { x: 0, y: -3, z: 14 }, { x: 10, y: -6, z: -36 }, { x: 90, y: -50, z: -90 }, { x: 140, y: -120, z: -150 },
  { x: 200, y: -160, z: -230 }, { x: 330, y: -150, z: -480 }, { x: 380, y: -230, z: -560 },
  { x: -200, y: -400, z: -860 }, { x: 380, y: -540, z: -1240 }, { x: 1080, y: -220, z: -1200 },
  { x: 1080, y: -730, z: -1200 }, { x: 900, y: -320, z: -460 }, { x: 300, y: -60, z: -100 }, { x: 0, y: -3, z: 14 },
];
const SPRINT: Vec3[] = [{ x: 0, y: -3, z: 14 }, { x: 780, y: -420, z: -1000 }];
const hold: Vec3 = { x: num("x", 0), y: num("y", -3), z: num("z", 14) };
const path = route === "sprint" ? SPRINT : route === "hold" ? [hold, hold] : TOUR;
const legs = path.slice(1).map((b, i) => ({ a: path[i]!, b, length: Math.hypot(b.x - path[i]!.x, b.y - path[i]!.y, b.z - path[i]!.z) }));
const total = legs.reduce((n, l) => n + l.length, 0);
function along(s: number): Vec3 {
  for (const l of legs) {
    if (s <= l.length || l === legs[legs.length - 1]) {
      const t = l.length ? Math.min(1, s / l.length) : 0;
      const p = { x: l.a.x + (l.b.x - l.a.x) * t, y: l.a.y + (l.b.y - l.a.y) * t, z: l.a.z + (l.b.z - l.a.z) * t };
      return { ...p, y: Math.max(p.y, sliceFloor(p.x, p.z) + 6) };
    }
    s -= l.length;
  }
  return path[0]!;
}

// Measurement.
interface Sample { frame: number; s: number; region: string | null; y: number; residencyMs: number; renderMs: number;
  intervalMs: number; draws: number; activeMeshes: number; cpuMiB: number; gpuMiB: number; hiddenMiB: number;
  shown: number; hidden: number; building: number; prepared: number; uploads: number; buildMs: number;
  uploadMs: number; maxStepMs: number }
const samples: Sample[] = [];
const regionsShown = new Set<string>();
let frame = 0, distance = 0, lastStamp = performance.now(), done = false;
let worst = { residencyMs: 0, renderMs: 0, intervalMs: 0, frame: 0 };
let peak = { cpu: 0, gpu: 0, shownRegions: 0, residentRegions: 0 };
const fixedMiB = (templates.bytes + fleetBytes) / MiB;
const gl = engine.getGlInfo();

const summary = () => {
  const pct = (k: keyof Sample, p: number) => {
    const v = samples.map(s => s[k] as number).sort((a, b) => a - b);
    return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))]! : 0;
  };
  const st = residency.stats!;
  return {
    route, speed, frames: frame, metres: Math.round(distance), done, renderer: gl.renderer, layoutChunks: layout.chunks.length,
    budgetMiB: residency.budget.gpuBytes / MiB, fixedMiB: +fixedMiB.toFixed(2),
    residencyMs: { p50: pct("residencyMs", .5), p95: pct("residencyMs", .95), max: worst.residencyMs },
    renderMs: { p50: pct("renderMs", .5), p95: pct("renderMs", .95), max: worst.renderMs },
    buildMs: { p95: pct("buildMs", .95), max: Math.max(0, ...samples.filter(x => x.frame > 30).map(x => x.buildMs)) },
    uploadMs: { p95: pct("uploadMs", .95), max: Math.max(0, ...samples.filter(x => x.frame > 30).map(x => x.uploadMs)) },
    maxStepMs: { p95: pct("maxStepMs", .95), max: Math.max(0, ...samples.filter(x => x.frame > 30).map(x => x.maxStepMs)) },
    intervalMs: { p50: pct("intervalMs", .5), p95: pct("intervalMs", .95), max: worst.intervalMs },
    draws: { p50: pct("draws", .5), max: Math.max(0, ...samples.map(s => s.draws)) },
    peakMiB: { cpu: +(peak.cpu / MiB).toFixed(2), gpu: +(peak.gpu / MiB).toFixed(2) },
    endMiB: { cpu: +(st.cpuBytes / MiB).toFixed(2), gpu: +(st.gpuBytes / MiB).toFixed(2), hidden: +(st.hiddenGpuBytes / MiB).toFixed(2) },
    regionsShownEver: [...regionsShown], peakShownRegions: peak.shownRegions, peakResidentRegions: peak.residentRegions,
    totals: st.totals, sceneMeshes: scene.meshes.length, sceneGeometries: scene.geometries.length, liveUnits: loader.stats.live,
    heapMiB: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  };
};
(window as unknown as Record<string, unknown>).__slice = { summary, samples, residency, map, scene };

const forward = new Vector3(0, 0, -1);
function tick(): void {
  if (done) return;
  const stamp = performance.now(), intervalMs = stamp - lastStamp;
  lastStamp = stamp;
  distance = Math.min(total, distance + (frame > 0 ? speed : 0));
  const p = along(distance), ahead = along(Math.min(total, distance + 12));
  camera.position.set(p.x, p.y, p.z);
  const dir = new Vector3(ahead.x - p.x, ahead.y - p.y, ahead.z - p.z);
  if (dir.lengthSquared() > 1e-6) {
    dir.normalize();
    // Look along travel, but never straight down a shaft: keep the horizon.
    const flat = new Vector3(dir.x, 0, dir.z);
    if (flat.lengthSquared() > 1e-4) forward.copyFrom(flat.normalize());
    forward.y = Math.max(-0.7, Math.min(0.5, dir.y));
  }
  camera.setTarget(camera.position.add(forward));

  const t0 = performance.now();
  const st = residency.update(p);
  const t1 = performance.now();
  const underwater = p.y < -0.08 ? 1 : 0;
  const fog = Color3.FromHexString(underwater ? "#226e7e" : "#96c5b9");
  scene.clearColor = new Color4(fog.r, fog.g, fog.b, 1);
  updateOpticalUniforms([cel, kit, water, sky], camera.position, null);
  for (const m of [cel, kit]) { m.setFloat("underwater", underwater); m.setFloat("time", frame / 60); }
  water.setFloat("time", frame / 60);
  scene.render();
  const t2 = performance.now();

  frame++;
  const shown = residency.shownRegions();
  for (const r of shown) regionsShown.add(r);
  const resident = new Set(residency.units().map(u => u.region)).size;
  peak = { cpu: Math.max(peak.cpu, st.cpuBytes), gpu: Math.max(peak.gpu, st.gpuBytes),
    shownRegions: Math.max(peak.shownRegions, shown.length), residentRegions: Math.max(peak.residentRegions, resident) };
  // The first frames compile shaders and fill the start area; record them
  // in samples but keep the worst-frame figures for steady traversal.
  if (frame > 30) worst = {
    residencyMs: Math.max(worst.residencyMs, t1 - t0), renderMs: Math.max(worst.renderMs, t2 - t1),
    intervalMs: Math.max(worst.intervalMs, intervalMs), frame: t1 - t0 > worst.residencyMs ? frame : worst.frame,
  };
  const region = map.regionAt(p);
  samples.push({ frame, s: Math.round(distance), region, y: Math.round(p.y), residencyMs: +(t1 - t0).toFixed(2),
    renderMs: +(t2 - t1).toFixed(2), intervalMs: +intervalMs.toFixed(1), draws: instrumentation.drawCallsCounter.current,
    activeMeshes: scene.getActiveMeshes().length, cpuMiB: +(st.cpuBytes / MiB).toFixed(2), gpuMiB: +(st.gpuBytes / MiB).toFixed(2),
    hiddenMiB: +(st.hiddenGpuBytes / MiB).toFixed(2), shown: st.shown, hidden: st.hidden, building: st.building,
    prepared: st.prepared, uploads: st.uploads, buildMs: +st.buildMs.toFixed(2), uploadMs: +st.uploadMs.toFixed(2),
    maxStepMs: +st.maxStepMs.toFixed(2) });
  if (samples.length > 20000) samples.splice(0, samples.length - 20000);

  if (frame % 4 === 0 || distance >= total) hud.textContent = [
    `route ${route}  ${Math.round(distance)}/${Math.round(total)} m  frame ${frame}`,
    `at ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}  ${region ?? "-"}  depth ${Math.max(0, -p.y).toFixed(0)} m`,
    `residency ${(t1 - t0).toFixed(1)} ms (build ${st.buildMs.toFixed(1)}, step ${st.maxStepMs.toFixed(1)}, upload ${st.uploadMs.toFixed(1)})  render ${(t2 - t1).toFixed(1)} ms  interval ${intervalMs.toFixed(0)} ms`,
    `draws ${instrumentation.drawCallsCounter.current}  active meshes ${scene.getActiveMeshes().length}`,
    `units shown ${st.shown}  hidden ${st.hidden}  building ${st.building}  prepared ${st.prepared}  pending ${st.pending}`,
    `resident cpu ${(st.cpuBytes / MiB).toFixed(1)} / gpu ${(st.gpuBytes / MiB).toFixed(1)} MiB (hidden ${(st.hiddenGpuBytes / MiB).toFixed(1)})  + fixed ${fixedMiB.toFixed(1)}`,
    `budget ${(residency.budget.gpuBytes / MiB).toFixed(0)} MiB  peak gpu ${(peak.gpu / MiB).toFixed(1)}`,
    `regions shown ${shown.join(" ")}`,
    `ever shown ${regionsShown.size}/7  evicted ${st.totals.evicted}  cancelled ${st.totals.cancelled}  built ${st.totals.built}`,
    `worst residency ${worst.residencyMs.toFixed(1)} ms  worst interval ${worst.intervalMs.toFixed(0)} ms`,
    `${gl.renderer}`,
  ].join("\n");
  if ((distance >= total && residency.isReady()) || frame >= stopAfter) {
    done = true;
    hud.textContent += `\nDONE`;
  }
}
// rAF is throttled in background tabs; `loop=message` drives frames through
// a MessageChannel instead, so the interval measures the frame's own work.
if (q.get("loop") === "message") {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    engine.beginFrame(); tick(); engine.endFrame();
    if (!done) channel.port2.postMessage(0);
  };
  channel.port2.postMessage(0);
} else engine.runRenderLoop(tick);
window.addEventListener("resize", () => engine.resize());
