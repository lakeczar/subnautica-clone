/** CA-2 cave lab (dev only): one Lantern Canopy or Pale Basin cave group in
 * its region style, beside its live terrain, with cave light, the lamp,
 * collision in the composed world and the Basin's glowing wake. It reuses the
 * W1 lab's modules (cave material and lighting, atmosphere, optics, the
 * terrain tessellator) by import. Run under Vite on your own port:
 *   npx vite --port <port> --strictPort --host 127.0.0.1
 *   open http://127.0.0.1:<port>/tools/cave-lab-canopy-basin.html?cave=<group id>
 * Drag to look, WASD/QE to swim, Shift for speed. L lamp, K LOD, C collision.
 * URL: ?cave=<id>&view=<name>&lamp=0|1&lod=fine|coarse&overlay=routes,portals,rooms&collide=0&hud=0&loop=message
 * `window.caveLab` exposes show(), settle(), layWake(), the camera and the cave. */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import { createAtmosphere } from "../src/render/atmosphere.js";
import { createCaveCelMaterial, CaveLighting } from "../src/render/caves/caveMaterial.js";
import { caveDaylight, sampleLightField } from "../src/render/caves/lightField.js";
import { opticsAt } from "../src/render/biomes/optics.js";
import { tessellate, FINE, BORDER_STEP } from "../src/render/biomes/tessellate.js";
import { geologyColor } from "../src/render/biomes/geology.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import { caves, EXTERIOR } from "../src/content/regions/caves.js";
import { caveVolume } from "../src/content/regions/caveGeometry.js";
import { CANOPY_BASIN_GROUPS, groupDef } from "../src/content/regions/caves/index.js";
import { styledShell } from "../src/content/regions/caves/style.js";
import { caveLightFieldFixed } from "../src/content/regions/caves/lightFix.js";
import { layWake, wakeGlow, wakeTrail, WAKE_STRENGTH } from "../src/content/regions/caves/wakeglow.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { emptyMasks, terrainMasks } from "../src/content/regions/terrain.js";
import { caveOwner, createCaveWorldQueries, SOLIDS, surfaceHeight } from "../src/sim/world.js";
import type { Rect } from "../src/world/types.js";

const params = new URLSearchParams(location.search);
const group = CANOPY_BASIN_GROUPS.find(g => g.source.id === params.get("cave")) ?? CANOPY_BASIN_GROUPS[0]!;
const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
engine.setHardwareScalingLevel(Number(params.get("scale") ?? 1));
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
const camera = new FreeCamera("lab.camera", new Vector3(0, -100, 0), scene);
camera.minZ = 0.1; camera.maxZ = 450; camera.fov = 1.02;
camera.keysUp = [87]; camera.keysDown = [83]; camera.keysLeft = [65]; camera.keysRight = [68];
camera.keysUpward = [69]; camera.keysDownward = [81];
camera.speed = 0.35; camera.angularSensibility = 1800; camera.inertia = 0.6;
camera.attachControl(canvas, true);

// --- The cave, from its one source --------------------------------------------
const started = performance.now();
const def = groupDef(group, worldFloor);
const shells = { fine: styledShell(def, "fine", group.style), coarse: styledShell(def, "coarse", group.style) };
const field = caveLightFieldFixed(def, worldFloor);
// The composed world, holding the kit's caves and this one (every Canopy and
// Basin cave together costs ~40 s of collar building; one is enough here).
const world = createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight, caves: [...caves(worldFloor), def].map(caveOwner) });
const buildMs = performance.now() - started;

const cel = createCaveCelMaterial(scene);
const { water, sky } = createAtmosphere(scene);
const materials: ShaderMaterial[] = [cel, water, sky];
const lighting = new CaveLighting(scene, [cel]);
lighting.setField(field);

function meshOf(recipe: MeshRecipe, name = recipe.name): Mesh {
  const mesh = new Mesh(name, scene), data = new VertexData();
  data.positions = recipe.positions; data.normals = recipe.normals; data.colors = recipe.colors; data.indices = recipe.indices;
  data.applyToMesh(mesh, true);
  mesh.material = cel; mesh.isPickable = false; mesh.renderingGroupId = 1; mesh.freezeWorldMatrix();
  return mesh;
}
const shellMeshes = { fine: meshOf(shells.fine), coarse: meshOf(shells.coarse) };

// --- Surrounding terrain: the live recipe with the footprint as a pit ----------
const footprint = def.replacementFootprints[0]!;
function terrain(rect: Rect): MeshRecipe | null {
  const g = tessellate(worldFloor, rect, { ...FINE, base: BORDER_STEP, pits: [footprint] });
  let r = g.next();
  while (!r.done) r = g.next();
  const t = r.value, positions = t.positions, normals: number[] = [], colors: number[] = [], indices = [...t.triangles], masks = emptyMasks();
  for (let v = 0; v < positions.length; v += 3) {
    const x = positions[v]!, y = positions[v + 1]!, z = positions[v + 2]!;
    const gx = (worldFloor(x + 0.25, z) - y) / 0.25, gz = (worldFloor(x, z + 0.25) - y) / 0.25, len = Math.hypot(gx, 1, gz);
    normals.push(-gx / len, 1 / len, -gz / len);
    terrainMasks(x, z, masks);
    geologyColor(x, y, z, Math.hypot(gx, gz), regionAtPoint(x, z) ?? group.source.region, masks, colors);
  }
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
const snap = (v: number, up: boolean): number => (up ? Math.ceil : Math.floor)(v / 16) * 16;
const around = { minX: snap(footprint.minX - 48, false), maxX: snap(footprint.maxX + 48, true), minZ: snap(footprint.minZ - 48, false), maxZ: snap(footprint.maxZ + 48, true) };
const terrainRecipe = terrain(around);
if (terrainRecipe) meshOf(terrainRecipe);

// --- Views, generated from the cave's own portals and rooms -----------------------
type P = { x: number; y: number; z: number };
const v3 = (p: P): Vector3 => new Vector3(p.x, p.y, p.z);
const VIEWS: Record<string, { pos: P; at: P; label: string }> = {};
const centre = { x: (footprint.minX + footprint.maxX) / 2, z: (footprint.minZ + footprint.maxZ) / 2 };
VIEWS.overview = { label: "Overview", pos: { x: footprint.maxX + 22, y: def.bounds.max.y + 14, z: footprint.minZ - 22 }, at: { x: centre.x, y: def.bounds.min.y + 18, z: centre.z } };
VIEWS.plan = { label: "Plan (above)", pos: { x: centre.x, y: def.bounds.max.y + 60, z: centre.z - 0.01 }, at: { x: centre.x, y: def.bounds.min.y, z: centre.z } };
for (const m of def.portals.filter(p => p.kind === "mouth")) {
  const out = m.normal.y !== 0 ? { x: 6, y: 9, z: 6 } : { x: m.normal.x * 11, y: 2.5, z: m.normal.z * 11 };
  VIEWS[`${m.id}.out`] = { label: `${m.label} (outside)`, pos: { x: m.center.x + out.x, y: m.center.y + out.y, z: m.center.z + out.z }, at: m.center };
}
for (const r of def.rooms) {
  const b = r.bounds, eye = { x: (b.min.x + b.max.x) / 2, y: b.min.y + 1.6, z: (b.min.z + b.max.z) / 2 };
  const way = def.portals.filter(p => p.between.includes(r.id)).sort((a, c) => Number(c.between.includes(EXTERIOR)) - Number(a.between.includes(EXTERIOR)))[0];
  VIEWS[r.id] = { label: r.label, pos: eye, at: way ? way.center : { ...eye, x: eye.x + 1 } };
}

// --- Wake (Pale Basin) ------------------------------------------------------------
const trail = wakeTrail(), clockStart = performance.now();
const clock = (): number => (performance.now() - clockStart) / 1000;
const stillWater = (p: P): boolean => roomAt(p) !== EXTERIOR;
let wakeMesh: Mesh | null = null;
function drawWake(now: number): void {
  wakeMesh?.dispose(); wakeMesh = null;
  if (group.style !== "silt_vault" || !trail.points.length) return;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [], s = 0.06, eye = camera.position;
  for (const p of trail.points) {
    const g = wakeGlow(p, now) * (state.lamp ? 0.2 : 1);
    // The wake right at the diver is behind the mask; draw it from 2 m out.
    if (g <= 0.02 || Math.hypot(p.at.x - eye.x, p.at.y + 0.6 - eye.y, p.at.z - eye.z) < 2) continue;
    const base = positions.length / 3;
    for (const [dx, dy, dz] of [[s, 0, 0], [-s, 0, 0], [0, s, 0], [0, -s, 0], [0, 0, s], [0, 0, -s]] as const) {
      positions.push(p.at.x + dx, p.at.y + 0.6 + dy, p.at.z + dz);
      colors.push(0.55 * g, 0.95 * g, 0.85 * g, -1);
    }
    for (const [a, b, c] of [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]] as const) indices.push(base + a, base + b, base + c);
  }
  if (!indices.length) return;
  const mesh = new Mesh("lab.wake", scene), data = new VertexData();
  data.positions = positions; data.colors = colors; data.indices = indices; data.normals = positions.map(() => 0).map((_, i) => i % 3 === 1 ? 1 : 0);
  data.applyToMesh(mesh); mesh.material = cel; mesh.isPickable = false; mesh.renderingGroupId = 1;
  wakeMesh = mesh;
}
/** Lay a wake along `path` as if swum `age` seconds ago at diver speed. */
function seedWake(path: readonly P[], age: number, speed = 3.4): void {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y, path[i]!.z - path[i - 1]!.z);
  let t = clock() - age - length / speed;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.25));
    for (let k = 0; k <= n; k++) layWake(trail, { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, z: a.z + (b.z - a.z) * k / n }, t + d / speed * k / n, WAKE_STRENGTH.diver, stillWater);
    t += d / speed;
  }
}

// --- Overlays -----------------------------------------------------------------------
const overlays = new Map<string, LinesMesh>();
function overlay(kind: string): LinesMesh {
  const lines: Vector3[][] = [], colors: Color4[][] = [];
  const add = (l: Vector3[], c: Color3): void => { lines.push(l); colors.push(l.map(() => new Color4(c.r, c.g, c.b, 1))); };
  if (kind === "routes") for (const r of def.routes) add(r.path.map(v3), r.profile === "diver" ? new Color3(1, 0.3, 0.9) : new Color3(0.3, 0.9, 1));
  if (kind === "rooms") for (const r of def.rooms) {
    const b = r.bounds, y = b.min.y + 0.1;
    add([new Vector3(b.min.x, y, b.min.z), new Vector3(b.max.x, y, b.min.z), new Vector3(b.max.x, y, b.max.z), new Vector3(b.min.x, y, b.max.z), new Vector3(b.min.x, y, b.min.z)], new Color3(0.4, 0.6, 1));
  }
  if (kind === "portals") for (const p of def.portals) {
    const c = p.kind === "mouth" ? new Color3(0.3, 1, 0.4) : new Color3(0.3, 0.9, 1), w = p.clear.width / 2, h = p.clear.height / 2, o = p.center;
    const corners = p.normal.y !== 0 ? [[-w, 0, -h], [w, 0, -h], [w, 0, h], [-w, 0, h]]
      : p.normal.z !== 0 ? [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]] : [[0, -h, -w], [0, -h, w], [0, h, w], [0, h, -w]];
    const pts = corners.map(([x, y, z]) => new Vector3(o.x + x!, o.y + y!, o.z + z!));
    add([...pts, pts[0]!], c);
  }
  const mesh = CreateLineSystem(`lab.overlay.${kind}`, { lines, colors }, scene);
  mesh.renderingGroupId = 2; mesh.isPickable = false;
  return mesh;
}
function setOverlay(kind: string, on: boolean): void {
  if (on && !overlays.has(kind)) overlays.set(kind, overlay(kind));
  if (!on) { overlays.get(kind)?.dispose(); overlays.delete(kind); }
}

// --- State and controls -------------------------------------------------------------
const state = { lamp: params.get("lamp") !== "0", lod: (params.get("lod") === "coarse" ? "coarse" : "fine") as "fine" | "coarse",
  collide: params.get("collide") !== "0" };
const DIVER = { radius: 0.34, height: 0.95 }, EYE = 0.6;
const applyLod = (): void => { shellMeshes.fine.setEnabled(state.lod === "fine"); shellMeshes.coarse.setEnabled(state.lod === "coarse"); };
applyLod();
let last = camera.position.clone();
function go(name: string): void {
  const v = VIEWS[name]; if (!v) return;
  camera.position.copyFrom(v3(v.pos)); camera.setTarget(v3(v.at)); last = camera.position.clone();
}
const views = document.getElementById("views")!, toggles = document.getElementById("toggles")!, status = document.getElementById("status")!;
const pick = document.createElement("select");
for (const g of CANOPY_BASIN_GROUPS) { const o = document.createElement("option"); o.value = o.textContent = g.source.id; o.selected = g === group; pick.appendChild(o); }
pick.onchange = () => { params.set("cave", pick.value); params.delete("view"); location.search = `?${params}`; };
views.appendChild(pick);
for (const [k, v] of Object.entries(VIEWS)) {
  const b = document.createElement("button"); b.textContent = v.label;
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
const requested = (params.get("overlay") ?? "").split(",");
for (const kind of ["routes", "portals", "rooms"]) {
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
go(params.get("view") ?? "overview");

// Free swim with the diver's own collision, swept from the last accepted pose.
function swim(): void {
  if (state.collide) {
    const from = { x: last.x, y: last.y - EYE, z: last.z }, to = camera.position;
    const moved = world.moveCapsule(from, { x: to.x - last.x, y: to.y - last.y, z: to.z - last.z }, DIVER);
    camera.position.set(moved.position.x, moved.position.y + EYE, moved.position.z);
    if (moved.hitSolid) camera.cameraDirection.setAll(0);
  }
  last = camera.position.clone();
  layWake(trail, { x: last.x, y: last.y - EYE, z: last.z }, clock(), WAKE_STRENGTH.diver, stillWater);
}
scene.onBeforeCameraRenderObservable.add(swim);

function roomAt(p: P): string {
  const v = caveVolume(def), g = v.grid;
  const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return EXTERIOR;
  const r = v.room[i + g.nx * (j + g.ny * k)]!;
  return r ? v.roomIds[r - 1]! : EXTERIOR;
}

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
  const forward = camera.getDirection(Vector3.Forward(scene.useRightHandedSystem)).normalize();
  const right = camera.getDirection(Vector3.Right()).normalize();
  lighting.apply({ on: state.lamp, position: p.add(right.scale(0.25)).add(new Vector3(0, -0.2, 0)), direction: forward });
  if (frame % 10 === 0) drawWake(clock());
  scene.render();
  frame++;
  const now = performance.now();
  if (frame % 15 === 0) {
    timer.fps = 15000 / (now - timer.last); timer.last = now;
    const c = sampleLightField(field, { x: p.x, y: p.y, z: p.z });
    status.textContent =
      `${group.source.id}  ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  depth ${Math.max(0, -p.y).toFixed(1)} m  ${roomAt({ x: p.x, y: p.y - EYE, z: p.z })}\n` +
      `daylight ${caveDaylight(c.r, c.g, c.a).toFixed(2)}  lamp ${state.lamp ? "on" : "off"}  ${state.lod}  wake ${trail.points.length}\n` +
      `rock ${def.rock.length} boxes  shell ${shells[state.lod].positions.length / 3} verts\n` +
      `build ${buildMs.toFixed(0)} ms  ${timer.fps.toFixed(0)} fps  ${engine.webGLVersion > 1 ? "webgl2" : "webgl1"}`;
  }
  canvas.dataset.frame = String(frame);
}
if (params.get("loop") === "message") {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { engine.beginFrame(); tick(); engine.endFrame(); setTimeout(() => channel.port2.postMessage(0), Number(params.get("delay") ?? 0)); };
  channel.port2.postMessage(0);
} else engine.runRenderLoop(tick);
window.addEventListener("resize", () => engine.resize());
const settle = (n = 4): Promise<void> => new Promise(done => {
  const until = frame + n, poll = (): void => { if (frame >= until) done(); else setTimeout(poll, 50); };
  poll();
});
/** Scripted view: a bookmark or an explicit pose, lamp and LOD, then a few frames. */
async function show(view: string | { pos: P; at: P }, lamp = state.lamp, lod = state.lod): Promise<void> {
  state.lamp = lamp; state.lod = lod; applyLod();
  if (typeof view === "string") go(view);
  else { camera.position.copyFrom(v3(view.pos)); camera.setTarget(v3(view.at)); last = camera.position.clone(); }
  drawWake(clock());
  await settle();
}
Object.assign(window, { caveLab: { show, settle, seedWake, go, camera, scene, def, group, field, world, state, setOverlay, VIEWS, trail } });
