/** W1-pre cave lab (dev only): the Fanvault loop beside its reef terrain,
 * with cave light, a lamp and collision. Run under Vite on your own port:
 *   npx vite --port <port> --strictPort --host 127.0.0.1
 *   open http://127.0.0.1:<port>/tools/cave-lab.html
 * Drag to look, WASD/QE to swim, Shift for speed. L lamp, K LOD, C collision.
 * URL: ?view=<name>&lamp=0|1&lod=fine|coarse&overlay=solids,portals,routes,rooms&shell=0&slice=<y>&collide=0&hud=0&loop=message
 * `window.caveLab` exposes the scene, camera and helpers for scripted runs. */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import { createAtmosphere } from "../src/render/atmosphere.js";
import { createCaveCelMaterial, CaveLighting } from "../src/render/caves/caveMaterial.js";
import { caveLightField, caveDaylight, sampleLightField } from "../src/render/caves/lightField.js";
import { opticsAt } from "../src/render/biomes/optics.js";
import { tessellate, FINE, BORDER_STEP } from "../src/render/biomes/tessellate.js";
import { geologyColor } from "../src/render/biomes/geology.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import { caveDef, withCaveFloors, EXTERIOR } from "../src/content/regions/caves.js";
import { caveShell, caveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { emptyMasks, terrainMasks } from "../src/content/regions/terrain.js";
import { createWorldQueries } from "../src/sim/world.js";
import { columnRect } from "../src/world/frame.js";
import type { Rect } from "../src/world/types.js";

const VIEWS: Record<string, { pos: [number, number, number]; at: [number, number, number]; label: string }> = {
  approach: { label: "North approach", pos: [-268, -14.5, -27], at: [-279, -16, -46] },
  north: { label: "North mouth (in)", pos: [-279.6, -16.6, -45], at: [-287, -22.5, -59] },
  vault: { label: "Vault", pos: [-285, -21.5, -60], at: [-291, -24.5, -69.5] },
  skylight: { label: "Under skylight", pos: [-293.5, -24.6, -70], at: [-289.5, -10, -63] },
  exit: { label: "Vault to south exit", pos: [-290.5, -23.5, -64], at: [-297, -24.5, -90] },
  south: { label: "South passage", pos: [-293.6, -24.2, -76], at: [-297.5, -24, -96] },
  pocket: { label: "Catch pocket", pos: [-305.2, -23.2, -64.8], at: [-290, -23.5, -66] },
  outside: { label: "South approach", pos: [-299, -23.5, -109], at: [-297, -24, -88] },
  terrace: { label: "Terraces", pos: [-262, -7, -90], at: [-290, -13, -62] },
  overview: { label: "Overview", pos: [-236, -4, -112], at: [-290, -17, -63] },
  plan: { label: "Plan (above)", pos: [-290, 52, -65.5], at: [-290, -22, -66] },
};

const params = new URLSearchParams(location.search);
const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
engine.setHardwareScalingLevel(Number(params.get("scale") ?? 1));
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
const camera = new FreeCamera("lab.camera", new Vector3(-268, -15, -27), scene);
camera.minZ = 0.1; camera.maxZ = 450; camera.fov = 1.02;
camera.keysUp = [87]; camera.keysDown = [83]; camera.keysLeft = [65]; camera.keysRight = [68];
camera.keysUpward = [69]; camera.keysDownward = [81];
camera.speed = 0.35; camera.angularSensibility = 1800; camera.inertia = 0.6;
camera.attachControl(canvas, true);
const instrumentation = new SceneInstrumentation(scene);

// --- The cave, built from its one source ------------------------------------
const started = performance.now();
const def = caveDef("fanvault", worldFloor);
const shells = { fine: caveShell(def, "fine"), coarse: caveShell(def, "coarse") };
const field = caveLightField(def, worldFloor);
const buildMs = performance.now() - started;
// The baseline's WORLD_BOUNDS still ends at the legacy route rectangle (C3
// widens it to the envelope), so the lab sweeps the diver in a frame shifted
// into it. Sweeps are translation-invariant; drop SHIFT once C3 lands.
const SHIFT = { x: 300, z: 90 };
const caveFloor = withCaveFloors(worldFloor);
const world = createWorldQueries(def.rock.map(s => ({ id: s.id, min: { ...s.min, x: s.min.x + SHIFT.x, z: s.min.z + SHIFT.z },
  max: { ...s.max, x: s.max.x + SHIFT.x, z: s.max.z + SHIFT.z } })), (x, z) => caveFloor(x - SHIFT.x, z - SHIFT.z));

const cel = createCaveCelMaterial(scene);
const { water, sky } = createAtmosphere(scene);
const materials: ShaderMaterial[] = [cel, water, sky];
const lighting = new CaveLighting(scene, [cel]);
lighting.setField(field);

function meshOf(recipe: MeshRecipe, name = recipe.name): Mesh {
  const mesh = new Mesh(name, scene), data = new VertexData();
  data.positions = recipe.positions; data.normals = recipe.normals; data.colors = recipe.colors; data.indices = recipe.indices;
  data.applyToMesh(mesh, false);
  // The renderer draws world meshes in group 1, with the water surface.
  mesh.material = cel; mesh.isPickable = false; mesh.renderingGroupId = 1; mesh.freezeWorldMatrix();
  return mesh;
}
const shellMeshes = { fine: meshOf(shells.fine), coarse: meshOf(shells.coarse) };

// --- Surrounding reef: the live terrain recipe with the footprint as a hole --
const footprint = def.replacementFootprints[0]!;
function terrainColumn(rect: Rect): MeshRecipe | null {
  const cut = rect.minX < footprint.maxX && rect.maxX > footprint.minX && rect.minZ < footprint.maxZ && rect.maxZ > footprint.minZ;
  const g = tessellate(worldFloor, rect, { ...FINE, base: cut ? BORDER_STEP : FINE.base, ...(cut ? { hole: footprint } : {}) });
  let r = g.next();
  while (!r.done) r = g.next();
  const t = r.value, positions = t.positions, normals: number[] = [], colors: number[] = [], indices = [...t.triangles];
  const masks = emptyMasks();
  for (let v = 0; v < positions.length; v += 3) {
    const x = positions[v]!, y = positions[v + 1]!, z = positions[v + 2]!;
    const gx = (worldFloor(x + 0.25, z) - y) / 0.25, gz = (worldFloor(x, z + 0.25) - y) / 0.25, len = Math.hypot(gx, 1, gz);
    normals.push(-gx / len, 1 / len, -gz / len);
    terrainMasks(x, z, masks);
    geologyColor(x, y, z, Math.hypot(gx, gz), regionAtPoint(x, z) ?? "refuge_reef", masks, colors);
  }
  // The same short skirt the bake hangs at a hole edge.
  for (let e = 0; e < t.skirtEdges.length; e += 2) {
    const a = t.skirtEdges[e]!, b = t.skirtEdges[e + 1]!, base = positions.length / 3;
    for (const k of [a, b]) {
      positions.push(positions[k * 3]!, positions[k * 3 + 1]! - 1.5, positions[k * 3 + 2]!);
      normals.push(normals[k * 3]!, normals[k * 3 + 1]!, normals[k * 3 + 2]!);
      colors.push(colors[k * 4]! * 0.8, colors[k * 4 + 1]! * 0.8, colors[k * 4 + 2]! * 0.8, 1);
    }
    indices.push(a, b, base + 1, a, base + 1, base);
  }
  if (!indices.length) return null;
  return { name: `lab.terrain.${rect.minX}.${rect.minZ}`, positions: new Float32Array(positions), normals: new Float32Array(normals),
    colors: new Float32Array(colors), indices: new Uint32Array(indices) };
}
let terrainVertices = 0;
for (const ix of [1, 2, 3]) for (const iz of [11, 12]) {
  const recipe = terrainColumn(columnRect(ix, iz));
  if (recipe) { meshOf(recipe); terrainVertices += recipe.positions.length / 3; }
}

// --- Overlays ---------------------------------------------------------------
const overlays = new Map<string, LinesMesh>();
type P = { x: number; y: number; z: number };
const v3 = (p: P): Vector3 => new Vector3(p.x, p.y, p.z);
function boxLines(min: P, max: P): Vector3[][] {
  const c = (x: number, y: number, z: number): Vector3 => new Vector3(x ? max.x : min.x, y ? max.y : min.y, z ? max.z : min.z);
  const out: Vector3[][] = [];
  for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const)
    out.push([c(a & 1, (a >> 1) & 1, a >> 2), c(b & 1, (b >> 1) & 1, b >> 2)]);
  return out;
}
function overlay(kind: string): LinesMesh {
  const lines: Vector3[][] = [], colors: Color4[][] = [];
  const add = (l: Vector3[], c: Color3): void => { lines.push(l); colors.push(l.map(() => new Color4(c.r, c.g, c.b, 1))); };
  // The rock as a plan slice: every box crossing one height (`?slice=`, else
  // the camera's), drawn at that height. Hide the shell to read the cave plan.
  if (kind === "solids") {
    const y = Number(params.get("slice") ?? camera.position.y);
    for (const s of def.rock) if (s.min.y <= y && s.max.y >= y) {
      const a = new Vector3(s.min.x, y, s.min.z), b = new Vector3(s.max.x, y, s.min.z), c = new Vector3(s.max.x, y, s.max.z), d = new Vector3(s.min.x, y, s.max.z);
      add([a, b, c, d, a], new Color3(1, 0.55, 0.15));
    }
  }
  if (kind === "rooms") for (const r of def.rooms) for (const l of boxLines(r.bounds.min, r.bounds.max)) add(l, new Color3(0.4, 0.6, 1));
  if (kind === "routes") for (const r of def.routes) add(r.path.map(v3), r.role === "loop" ? new Color3(1, 0.3, 0.9) : new Color3(0.9, 0.9, 0.3));
  if (kind === "portals") for (const p of def.portals) {
    const c = p.kind === "mouth" ? new Color3(0.3, 1, 0.4) : p.kind === "skylight" ? new Color3(1, 0.95, 0.3) : new Color3(0.3, 0.9, 1);
    const w = p.clear.width / 2, h = p.clear.height / 2, o = p.center;
    const corners = p.normal.y !== 0
      ? [[-w, 0, -h], [w, 0, -h], [w, 0, h], [-w, 0, h]]
      : p.normal.z !== 0 ? [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]] : [[0, -h, -w], [0, -h, w], [0, h, w], [0, h, -w]];
    const pts = corners.map(([x, y, z]) => new Vector3(o.x + x!, o.y + y!, o.z + z!));
    add([...pts, pts[0]!], c);
    add([v3(o), new Vector3(o.x + p.normal.x * 2, o.y + p.normal.y * 2, o.z + p.normal.z * 2)], c);
  }
  const mesh = CreateLineSystem(`lab.overlay.${kind}`, { lines, colors }, scene);
  // Rock boxes are depth-tested with the art; the paths draw on top.
  mesh.renderingGroupId = kind === "solids" || kind === "rooms" ? 1 : 2; mesh.isPickable = false;
  return mesh;
}
function setOverlay(kind: string, on: boolean): void {
  if (on && !overlays.has(kind)) overlays.set(kind, overlay(kind));
  if (!on) { overlays.get(kind)?.dispose(); overlays.delete(kind); }
}

// --- State and controls -----------------------------------------------------
const state = { lamp: params.get("lamp") !== "0", lod: (params.get("lod") === "coarse" ? "coarse" : "fine") as "fine" | "coarse",
  collide: params.get("collide") !== "0", shell: params.get("shell") !== "0" };
const DIVER = { radius: 0.34, height: 0.95 }, EYE = 0.6;
function applyLod(): void {
  shellMeshes.fine.setEnabled(state.shell && state.lod === "fine");
  shellMeshes.coarse.setEnabled(state.shell && state.lod === "coarse");
}
applyLod();

function go(name: string): void {
  const v = VIEWS[name]; if (!v) return;
  camera.position.set(...v.pos);
  camera.setTarget(new Vector3(...v.at));
  last = camera.position.clone();
  for (const b of document.querySelectorAll<HTMLButtonElement>("#views button")) b.classList.toggle("on", b.dataset.view === name);
}
const views = document.getElementById("views")!, toggles = document.getElementById("toggles")!, status = document.getElementById("status")!;
for (const [k, v] of Object.entries(VIEWS)) {
  const b = document.createElement("button"); b.textContent = v.label; b.dataset.view = k;
  b.onclick = () => { go(k); params.set("view", k); history.replaceState(null, "", `?${params}`); };
  views.appendChild(b);
}
const buttons: Record<string, HTMLButtonElement> = {};
function toggle(label: string, on: () => boolean, flip: () => void): void {
  const b = document.createElement("button"); b.textContent = label; buttons[label] = b;
  const sync = (): void => { b.classList.toggle("on", on()); };
  b.onclick = () => { flip(); sync(); }; sync();
  toggles.appendChild(b);
}
toggle("lamp (L)", () => state.lamp, () => { state.lamp = !state.lamp; });
toggle("coarse (K)", () => state.lod === "coarse", () => { state.lod = state.lod === "fine" ? "coarse" : "fine"; applyLod(); });
toggle("collide (C)", () => state.collide, () => { state.collide = !state.collide; });
toggle("shell", () => state.shell, () => { state.shell = !state.shell; applyLod(); });
const requested = (params.get("overlay") ?? "").split(",");
for (const kind of ["solids", "portals", "routes", "rooms"]) {
  let on = requested.includes(kind);
  if (on) setOverlay(kind, true);
  toggle(kind, () => on, () => { on = !on; setOverlay(kind, on); });
}
window.addEventListener("keydown", e => {
  camera.speed = e.shiftKey ? 1.2 : 0.35;
  if (e.code === "KeyL") buttons["lamp (L)"]!.click();
  if (e.code === "KeyK") buttons["coarse (K)"]!.click();
  if (e.code === "KeyC") buttons["collide (C)"]!.click();
});
window.addEventListener("keyup", e => { camera.speed = e.shiftKey ? 1.2 : 0.35; });
document.getElementById("hide")!.onclick = () => document.getElementById("panel")!.classList.toggle("hidden");
if (params.get("hud") === "0") document.getElementById("panel")!.classList.add("hidden");
let last = camera.position.clone();
go(params.get("view") ?? "approach");

// Free swim with the diver's own collision: the camera proposes a move and
// the world sweeps the diver box from the last accepted pose.
function swim(): void {
  if (!state.collide) { last = camera.position.clone(); return; }
  const from = { x: last.x + SHIFT.x, y: last.y - EYE, z: last.z + SHIFT.z }, to = camera.position;
  const moved = world.moveCapsule(from, { x: to.x - last.x, y: to.y - last.y, z: to.z - last.z }, DIVER);
  camera.position.set(moved.position.x - SHIFT.x, moved.position.y + EYE, moved.position.z - SHIFT.z);
  // A blocked swim stops: no inertia keeps pressing the camera into rock.
  if (moved.hitSolid) camera.cameraDirection.setAll(0);
  last = camera.position.clone();
}
// After the camera applies its input and before it draws, so no frame is
// ever drawn from an unswept pose.
scene.onBeforeCameraRenderObservable.add(swim);

const roomAt = (): string => {
  const g = caveVolume(def).grid, v = caveVolume(def), p = camera.position;
  const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - EYE - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return EXTERIOR;
  const r = v.room[i + g.nx * (j + g.ny * k)]!;
  return r ? v.roomIds[r - 1]! : EXTERIOR;
};

let frame = 0;
const timer = { last: performance.now(), fps: 0 };
function tick(): void {
  const p = camera.position;
  const o = opticsAt(p.x, p.y, p.z), underwater = p.y < -0.08 ? 1 : 0;
  const wf = Color3.Lerp(Color3.FromHexString(o.water), Color3.FromHexString(o.deep), o.depthMix);
  scene.clearColor = underwater ? new Color4(wf.r, wf.g, wf.b, 1) : Color4.FromHexString("#96c5b9ff");
  for (const m of materials) {
    m.setVector3("cameraPosition", p); m.setColor3("fogColor", Color3.FromHexString("#a5ccd1"));
    m.setColor3("waterFogColor", wf); m.setFloat("fogDensity", o.density);
    for (const k of ["carrierPresent", "carrierYaw"]) m.setFloat(k, 0);
  }
  cel.setFloat("underwater", underwater); cel.setFloat("time", frame / 60); water.setFloat("time", frame / 60);
  // Head lamp: slightly below and right of the eye, along the view.
  const forward = camera.getDirection(Vector3.Forward(scene.useRightHandedSystem)).normalize();
  const right = camera.getDirection(Vector3.Right()).normalize();
  lighting.apply({ on: state.lamp, position: p.add(right.scale(0.25)).add(new Vector3(0, -0.2, 0)), direction: forward });
  scene.render();
  frame++;
  const now = performance.now();
  if (frame % 15 === 0) {
    timer.fps = 15000 / (now - timer.last); timer.last = now;
    const c = sampleLightField(field, { x: p.x, y: p.y, z: p.z });
    status.textContent =
      `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  depth ${Math.max(0, -p.y).toFixed(1)} m  ${roomAt()}\n` +
      `daylight ${caveDaylight(c.r, c.g, c.a).toFixed(2)}  sun ${c.g.toFixed(2)}  lamp ${state.lamp ? "on" : "off"}  ${state.lod}\n` +
      `rock ${def.rock.length} solids  shell ${shells[state.lod].positions.length / 3} verts  terrain ${terrainVertices}\n` +
      `build ${buildMs.toFixed(0)} ms  draws ${instrumentation.drawCallsCounter.current}  ${timer.fps.toFixed(0)} fps  ${engine.webGLVersion > 1 ? "webgl2" : "webgl1"}`;
  }
  canvas.dataset.frame = String(frame);
}
// Background preview tabs throttle rAF; `loop=message` drives frames directly.
if (params.get("loop") === "message") {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { engine.beginFrame(); tick(); engine.endFrame(); setTimeout(() => channel.port2.postMessage(0), Number(params.get("delay") ?? 0)); };
  channel.port2.postMessage(0);
} else engine.runRenderLoop(tick);
window.addEventListener("resize", () => engine.resize());
/** Resolves after `n` more frames, for scripted screenshots. */
const settle = (n = 4): Promise<void> => new Promise(done => {
  const until = frame + n, poll = (): void => { if (frame >= until) done(); else setTimeout(poll, 50); };
  poll();
});
/** Scripted view: camera bookmark, lamp and LOD, then a few frames. */
async function show(name: string, lamp = state.lamp, lod = state.lod): Promise<void> {
  state.lamp = lamp; state.lod = lod; applyLod(); go(name);
  await settle();
}
Object.assign(window, { caveLab: { go, show, settle, camera, scene, def, field, world, state, setOverlay, applyLod, VIEWS } });
