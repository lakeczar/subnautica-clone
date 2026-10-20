/** S2 region viewer (dev only). Streams S2 chunk recipes around a free
 * camera with fine/coarse LOD, plus today's terrain mesh for seam checks.
 * Drag to look, WASD/QE to move, Shift for speed. No pointer lock.
 * URL: ?view=<bookmark>&overlay=routes,hazards,tethers&hud=0 */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import { createCelMaterial } from "../src/render/materials.js";
import { createAtmosphere } from "../src/render/atmosphere.js";
import { createEnvironment } from "../src/render/environment.js";
import { createKitMaterial } from "../src/render/kit/material.js";
import { createKitLoader, TemplateLibrary } from "../src/render/kit/loader.js";
import { KIT_FACTORIES } from "../src/render/kit/factories.js";
import { templateRecipes } from "../src/render/kit/templates.js";
import { createWorldMap } from "../src/world/map.js";
import { createResidency } from "../src/world/residency.js";
import { worldLayout } from "../src/content/regions/layout.js";
import { spatialEntries } from "../src/content/regions/spatial.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { HAZARDS } from "../src/content/regions/hazards.js";
import { ROUTES } from "../src/content/regions/passages.js";
import { RESCUE_PLANS } from "../src/content/regions/rescue.js";
import { S2_FACTORIES, S2_TEMPLATE_LIBRARY, opticsAt, s2BuildContext } from "../src/render/biomes/index.js";

export const VIEWS: Record<string, { pos: [number, number, number]; at: [number, number, number]; label: string }> = {
  stack: { label: "Isles: split stack", pos: [560, 18, 0], at: [470, 26, 95] },
  ramp: { label: "Isles: stack ramp", pos: [430, 14, 40], at: [456, 40, 104] },
  headland: { label: "Isles: headland", pos: [890, 26, -90], at: [1060, 46, 60] },
  crowns: { label: "Canopy: east crowns", pos: [585, -140, -245], at: [700, -112, -150] },
  dishes: { label: "Basin: dish field", pos: [418, -236, -488], at: [508, -262, -580] },
  wrecks: { label: "Basin: wreck ridge", pos: [720, -232, -470], at: [782, -250, -545] },
  chimney: { label: "Rift: split chimney", pos: [-88, -296, -1128], at: [-165, -352, -1065] },
  ledges: { label: "Rift: cool ledges", pos: [140, -242, -985], at: [40, -258, -1050] },
  gate: { label: "Divide: gateworks", pos: [596, -372, -1176], at: [600, -352, -1262] },
  mirror: { label: "Divide: mirror", pos: [712, -398, -1342], at: [560, -436, -1300] },
  meridian: { label: "Meridian: terraces", pos: [1150, -586, -1372], at: [1262, -548, -1160] },
  works: { label: "Meridian: deep works", pos: [1340, -742, -1480], at: [1440, -760, -1582] },
  escarp: { label: "Escarpment", pos: [1290, -462, -800], at: [1350, -478, -660] },
  drop: { label: "Reef: Hearth drop", pos: [-196, -22, -52], at: [-240, -80, -190] },
  seam: { label: "Seam: legacy edge", pos: [300, -120, -120], at: [250, -175, -200] },
};

const params = new URLSearchParams(location.search);
const MiB = 1024 * 1024;
const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
engine.setHardwareScalingLevel(Number(params.get("scale") ?? 1));
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
const camera = new FreeCamera("viewer.camera", new Vector3(560, 18, 0), scene);
camera.minZ = 0.1; camera.maxZ = 450; camera.fov = 1.02;
camera.keysUp = [87]; camera.keysDown = [83]; camera.keysLeft = [65]; camera.keysRight = [68];
camera.keysUpward = [69]; camera.keysDownward = [81];
camera.speed = 2.5; camera.angularSensibility = 1800;
camera.attachControl(canvas, true);
const instrumentation = new SceneInstrumentation(scene);

// The production cel fragment through S1's kit material, loader and
// byte-budgeted residency: the same path the game will use.
const cel = createCelMaterial(scene);
const kit = createKitMaterial(scene, cel);
const { water, sky } = createAtmosphere(scene);
const materials = [cel, kit, water, sky];
// Today's terrain mesh, for seam checks against S2 chunks.
createEnvironment(scene, cel, "terrain");
for (const mesh of scene.meshes) if (mesh.name === "island.terrain") mesh.renderingGroupId = 1;

const layout = worldLayout();
const map = createWorldMap(layout, spatialEntries());
const templates = new TemplateLibrary([...templateRecipes(), ...S2_TEMPLATE_LIBRARY]);
const loader = createKitLoader({ scene, material: kit, templates, factories: [...KIT_FACTORIES, ...S2_FACTORIES], context: s2BuildContext() });
const residency = createResidency({ map, loader, budget: {
  cpuBytes: Number(params.get("budget") ?? 160) * MiB, gpuBytes: Number(params.get("budget") ?? 160) * MiB,
  uploadBytesPerFrame: 4 * MiB, buildMsPerFrame: Number(params.get("build") ?? 8), maxInFlight: 2, retainedUnits: 48,
} });
engine.onContextLostObservable.add(() => residency.discardHidden());

// Overlays: passages (carrier gold, small craft cyan), hazards, rescue tethers.
const overlays = new Map<string, LinesMesh[]>();
function overlay(kind: string): LinesMesh[] {
  const out: LinesMesh[] = [];
  const line = (pts: { x: number; y: number; z: number }[], color: Color3, name: string): void => {
    const m = CreateLines(name, { points: pts.map(p => new Vector3(p.x, p.y, p.z)), colors: pts.map(() => new Color4(color.r, color.g, color.b, 1)) }, scene);
    m.renderingGroupId = 2; m.isPickable = false; out.push(m);
  };
  if (kind === "routes") for (const r of ROUTES) if (r.role !== "walk") line([...r.path], r.carrier ? new Color3(1, 0.75, 0.2) : new Color3(0.4, 0.95, 1), r.id);
  if (kind === "tethers") for (const p of RESCUE_PLANS) for (const b of p.tethers) line([...b], new Color3(1, 0.4, 0.8), p.id);
  if (kind === "hazards") for (const h of HAZARDS) {
    const a = h.bounds.min, b = h.bounds.max, c = h.kind === "heat" ? new Color3(1, 0.35, 0.1) : h.kind === "brine" ? new Color3(0.7, 0.6, 1) : new Color3(0.8, 0.9, 0.7);
    const P = (x: number, y: number, z: number): { x: number; y: number; z: number } => ({ x, y, z });
    line([P(a.x, a.y, a.z), P(b.x, a.y, a.z), P(b.x, a.y, b.z), P(a.x, a.y, b.z), P(a.x, a.y, a.z), P(a.x, b.y, a.z), P(b.x, b.y, a.z), P(b.x, b.y, b.z), P(a.x, b.y, b.z), P(a.x, b.y, a.z)], c, h.id);
  }
  return out;
}
function setOverlay(kind: string, on: boolean): void {
  if (on && !overlays.has(kind)) overlays.set(kind, overlay(kind));
  if (!on) { overlays.get(kind)?.forEach(m => m.dispose()); overlays.delete(kind); }
}

function go(name: string): void {
  const v = VIEWS[name]; if (!v) return;
  camera.position.set(v.pos[0], Math.max(v.pos[1], worldFloor(v.pos[0], v.pos[2]) + 3), v.pos[2]);
  camera.setTarget(new Vector3(...v.at));
  for (const b of document.querySelectorAll<HTMLButtonElement>("#views button")) b.classList.toggle("on", b.dataset.view === name);
}
const views = document.getElementById("views")!, toggles = document.getElementById("toggles")!, status = document.getElementById("status")!;
for (const [k, v] of Object.entries(VIEWS)) {
  const b = document.createElement("button"); b.textContent = v.label; b.dataset.view = k; b.onclick = () => { go(k); history.replaceState(null, "", `?view=${k}`); };
  views.appendChild(b);
}
for (const kind of ["routes", "hazards", "tethers"]) {
  const b = document.createElement("button"); b.textContent = kind;
  b.onclick = () => { const on = !overlays.has(kind); setOverlay(kind, on); b.classList.toggle("on", on); };
  toggles.appendChild(b);
  if ((params.get("overlay") ?? "").split(",").includes(kind)) { setOverlay(kind, true); b.classList.add("on"); }
}
document.getElementById("hide")!.onclick = () => document.getElementById("panel")!.classList.toggle("hidden");
if (params.get("hud") === "0") document.getElementById("panel")!.classList.add("hidden");
window.addEventListener("keydown", e => { camera.speed = e.shiftKey ? 9 : 2.5; });
window.addEventListener("keyup", e => { camera.speed = e.shiftKey ? 9 : 2.5; });
go(params.get("view") ?? "stack");

let frame = 0, peakGpu = 0;
function tick(): void {
  const p = camera.position;
  const st = residency.update({ x: p.x, y: p.y, z: p.z });
  peakGpu = Math.max(peakGpu, st.gpuBytes);
  const o = opticsAt(p.x, p.y, p.z), underwater = p.y < -0.08 ? 1 : 0;
  const wf = Color3.Lerp(Color3.FromHexString(o.water), Color3.FromHexString(o.deep), o.depthMix);
  scene.clearColor = underwater ? new Color4(wf.r, wf.g, wf.b, 1) : Color4.FromHexString("#96c5b9ff");
  for (const m of materials) {
    m.setVector3("cameraPosition", p); m.setColor3("fogColor", Color3.FromHexString("#a5ccd1"));
    m.setColor3("waterFogColor", wf); m.setFloat("fogDensity", o.density);
    for (const k of ["carrierPresent", "carrierYaw"]) m.setFloat(k, 0);
  }
  for (const m of [cel, kit]) { m.setFloat("underwater", underwater); m.setFloat("time", frame / 60); }
  water.setFloat("time", frame / 60);
  scene.render();
  frame++;
  const ready = residency.isReady(250);
  canvas.dataset.pending = ready || st.settled ? "false" : "true";
  if (frame % 10 === 0) status.textContent =
    `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}  ${map.regionAt(p) ?? "outside"}  depth ${Math.max(0, -p.y).toFixed(0)} m\n` +
    `shown ${st.shown} hidden ${st.hidden} building ${st.building}  ${ready ? "ready" : "loading"}\n` +
    `gpu ${(st.gpuBytes / MiB).toFixed(1)} MiB (peak ${(peakGpu / MiB).toFixed(1)})  draws ${instrumentation.drawCallsCounter.current}\n` +
    `built ${st.totals.built} evicted ${st.totals.evicted}  step max ${st.maxStepMs.toFixed(1)} ms`;
}
// Background preview tabs throttle rAF; `loop=message` drives frames directly.
if (params.get("loop") === "message") {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { engine.beginFrame(); tick(); engine.endFrame(); setTimeout(() => channel.port2.postMessage(0), 0); };
  channel.port2.postMessage(0);
} else engine.runRenderLoop(tick);
window.addEventListener("resize", () => engine.resize());
Object.assign(window, { s2viewer: { go, camera, residency, scene, map } });
