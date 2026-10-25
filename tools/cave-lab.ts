/** Cave lab (dev only): every authored kit cave beside its seabed, with cave
 * light, a lamp, LOD, overlays and the diver's own collision. W1-pre built it
 * for the Fanvault; CA-1 adds a cave list and every Reef and Isles cave.
 * Run under Vite on your own port:
 *   npx vite --port <port> --strictPort --host 127.0.0.1
 *   open http://127.0.0.1:<port>/tools/cave-lab.html?cave=<id>
 * Drag to look, WASD/QE to swim, Shift for speed. L lamp, K LOD, C collision,
 * [ and ] previous and next cave.
 * URL: ?cave=<id>&view=<name>&lamp=0|1&lod=fine|coarse&overlay=solids,portals,routes,rooms,contents&shell=0&slice=<y>
 *      &collide=0&hud=0&loop=message
 * The selected cave loads with its network (every cave within 40 m), so
 * crawls can be swum through. `window.caveLab` exposes the scene, camera and
 * helpers for scripted runs. */
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
import { CAVE_LIGHT_SHADER } from "../src/render/caves/caveLight.js";
import { caveLightField, caveDaylight, sampleLightField, type CaveLightField } from "../src/render/caves/lightField.js";
import { opticsAt } from "../src/render/biomes/optics.js";
import { geologyColor } from "../src/render/biomes/geology.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import { AUTHORED_CAVE_SOURCES, caveDef, EXTERIOR, type CaveDef } from "../src/content/regions/caves.js";
import { CAVE_CONTENTS } from "../src/content/regions/caves/contents.js";
import { caveShell, caveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { emptyMasks, terrainMasks } from "../src/content/regions/terrain.js";
import { caveOwner, createCaveWorldQueries, SOLIDS, surfaceHeight } from "../src/sim/world.js";

type View = { pos: [number, number, number]; at: [number, number, number]; label: string };
/** The Fanvault's hand-set bookmarks (W1-pre); other caves get generated ones. */
const FANVAULT_VIEWS: Record<string, View> = {
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
const caveId = AUTHORED_CAVE_SOURCES.some(s => s.id === params.get("cave")) ? params.get("cave")! : "fanvault";
const main = AUTHORED_CAVE_SOURCES.find(s => s.id === caveId)!;
/** The selected cave and every cave within 40 m: its network. */
const near = (r: typeof main.footprint, pad: number): boolean =>
  r.minX < main.footprint.maxX + pad && r.maxX > main.footprint.minX - pad && r.minZ < main.footprint.maxZ + pad && r.maxZ > main.footprint.minZ - pad;
const loaded = AUTHORED_CAVE_SOURCES.filter(s => s === main || near(s.footprint, 40));

const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
engine.setHardwareScalingLevel(Number(params.get("scale") ?? 1));
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
const camera = new FreeCamera("lab.camera", new Vector3(0, -10, 0), scene);
camera.minZ = 0.1; camera.maxZ = 450; camera.fov = 1.02;
camera.keysUp = [87]; camera.keysDown = [83]; camera.keysLeft = [65]; camera.keysRight = [68];
camera.keysUpward = [69]; camera.keysDownward = [81];
camera.speed = 0.35; camera.angularSensibility = 1800; camera.inertia = 0.6;
camera.attachControl(canvas, true);
const instrumentation = new SceneInstrumentation(scene);

// --- The caves, each built from its one source ---------------------------------
const started = performance.now();
const defs: CaveDef[] = loaded.map(s => caveDef(s.id, worldFloor));
const def = defs[loaded.indexOf(main)]!;
const shellsOf = new Map(defs.map(d => [d.id, { fine: caveShell(d, "fine"), coarse: caveShell(d, "coarse") }]));
const fields = new Map(defs.map(d => [d.id, caveLightField(d, worldFloor)]));
const field: CaveLightField = fields.get(def.id)!;
const buildMs = performance.now() - started;
// The game's world as `gameWorld()` composes it (C4): every solid on the
// shared floor, with the loaded caves owning their footprints, so a cave
// that is authored but not yet in CAVE_SOURCES swims as it will in the game.
const world = createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight, caves: defs.map(caveOwner) });

const cel = createCaveCelMaterial(scene);
const { water, sky } = createAtmosphere(scene);
const materials: ShaderMaterial[] = [cel, water, sky];
const lighting = new CaveLighting(scene, [cel]);
let lit: string | null = null;
/** One cave is lit as dark at a time: the one owning the camera's column, else the nearest. */
function lightNearest(p: Vector3): void {
  let best = def, bestD = Infinity;
  for (const d of defs) {
    const f = d.replacementFootprints[0]!, dx = Math.max(f.minX - p.x, 0, p.x - f.maxX), dz = Math.max(f.minZ - p.z, 0, p.z - f.maxZ);
    if (Math.hypot(dx, dz) < bestD) { bestD = Math.hypot(dx, dz); best = d; }
  }
  if (best.id !== lit) { lit = best.id; lighting.setField(fields.get(best.id)!); }
}

function meshOf(recipe: MeshRecipe, name = recipe.name): Mesh {
  const mesh = new Mesh(name, scene), data = new VertexData();
  data.positions = recipe.positions; data.normals = recipe.normals; data.colors = recipe.colors; data.indices = recipe.indices;
  data.applyToMesh(mesh, false);
  // The renderer draws world meshes in group 1, with the water surface.
  mesh.material = cel; mesh.isPickable = false; mesh.renderingGroupId = 1; mesh.freezeWorldMatrix();
  return mesh;
}
const shellMeshes = defs.map(d => ({ fine: meshOf(shellsOf.get(d.id)!.fine), coarse: meshOf(shellsOf.get(d.id)!.coarse) }));

/** The loaded network's footprints plus 60 m: the seabed drawn round them. */
const box = { minX: Math.min(...loaded.map(s => s.footprint.minX)) - 60, maxX: Math.max(...loaded.map(s => s.footprint.maxX)) + 60,
  minZ: Math.min(...loaded.map(s => s.footprint.minZ)) - 60, maxZ: Math.max(...loaded.map(s => s.footprint.maxZ)) + 60 };
// --- Surrounding seabed: the shared floor on a 0.5 m grid, skipping every
// cave-owned cell (the bake will cut the same holes; see W1-PRE).
const owned = (x: number, z: number): boolean => AUTHORED_CAVE_SOURCES.some(s => x >= s.footprint.minX && x < s.footprint.maxX && z >= s.footprint.minZ && z < s.footprint.maxZ);
function seabed(): MeshRecipe {
  const step = 0.5, x0 = box.minX + 20, x1 = box.maxX - 20, z0 = box.minZ + 20, z1 = box.maxZ - 20;
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step), positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const masks = emptyMasks();
  for (let k = 0; k <= nz; k++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * step, z = z0 + k * step, y = worldFloor(x, z);
    const gx = (worldFloor(x + 0.25, z) - y) / 0.25, gz = (worldFloor(x, z + 0.25) - y) / 0.25, len = Math.hypot(gx, 1, gz);
    positions.push(x, y, z); normals.push(-gx / len, 1 / len, -gz / len);
    terrainMasks(x, z, masks);
    geologyColor(x, y, z, Math.hypot(gx, gz), regionAtPoint(x, z) ?? "refuge_reef", masks, colors);
  }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (owned(x0 + (i + 0.5) * step, z0 + (k + 0.5) * step)) continue;
    const a = i + (nx + 1) * k, b = a + 1, c = a + nx + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return { name: "lab.seabed", positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors),
    indices: new Uint32Array(indices) };
}
const terrain = seabed();
meshOf(terrain);
const terrainVertices = terrain.positions.length / 3;

const DIVER = { radius: 0.34, height: 0.95 }, EYE = 0.6;

// --- Bookmarks ----------------------------------------------------------------
/** Generated views for a kit cave: outside and inside each mouth, every room,
 * an overview and a plan. */
function viewsFor(d: CaveDef): Record<string, View> {
  if (d.id === "fanvault") return FANVAULT_VIEWS;
  const out: Record<string, View> = {}, b = d.bounds, c = { x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2 };
  const roomsY = Math.min(...d.rooms.map(r => r.bounds.min.y));
  // A camera pose a diver could hold that sees its target.
  const usable = (pos: [number, number, number], at: [number, number, number]): boolean =>
    world.clearance({ x: pos[0], y: pos[1] - EYE, z: pos[2] }, DIVER) && world.lineOfSight({ x: pos[0], y: pos[1], z: pos[2] }, { x: at[0], y: at[1], z: at[2] });
  for (const m of d.portals.filter(p => p.kind === "mouth")) {
    const key = m.id.slice(d.id.length + 1).replace(/\./g, "_"), o = m.center, n = m.normal, far = Math.max(10, m.clear.width * 1.6);
    const at: [number, number, number] = [o.x, o.y, o.z];
    let pos: [number, number, number] = [o.x + n.x * far, o.y + 1.5, o.z + n.z * far];
    search: for (const k of [1, 0.7, 0.5, 1.4, 1.8]) for (const up of [1.5, 3.5, 6, 0.5]) {
      const cand: [number, number, number] = [o.x + n.x * far * k, o.y + up, o.z + n.z * far * k];
      if (usable(cand, at)) { pos = cand; break search; }
    }
    out[key] = { label: `${m.label} (outside)`, pos, at };
    out[`${key}_in`] = { label: `${m.label} (inside)`, pos: [o.x - n.x * 2, o.y + 0.5, o.z - n.z * 2], at: [o.x - n.x * 12, o.y - 1, o.z - n.z * 12] };
  }
  const v = caveVolume(d), g = v.grid;
  d.rooms.forEach((r, ri) => {
    const rb = r.bounds, alongX = rb.max.x - rb.min.x > rb.max.z - rb.min.z, reach = (alongX ? rb.max.x - rb.min.x : rb.max.z - rb.min.z) * 0.4;
    // From the room's own clear water nearest its middle, a diver's height
    // over its floor and below the waterline, looking along its long axis.
    const want = { x: (rb.min.x + rb.max.x) / 2 - (alongX ? reach : 0), y: rb.min.y + 1.6, z: (rb.min.z + rb.max.z) / 2 - (alongX ? 0 : reach) };
    let pos: [number, number, number] = [want.x, Math.min(want.y, -1), want.z], best = Infinity;
    for (let k = 0; k < g.nz; k += 2) for (let j = 0; j < g.ny; j += 2) for (let i = 0; i < g.nx; i += 2) {
      const at = i + g.nx * (j + g.ny * k);
      if (v.room[at] !== ri + 1 || v.solid[at]) continue;
      const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel + EYE, z: g.origin.z + (k + 0.5) * g.voxel };
      const dist = Math.hypot(p.x - want.x, (p.y - want.y) * 2, p.z - want.z);
      if (p.y < -0.8 && dist < best && world.clearance({ x: p.x, y: p.y - EYE, z: p.z }, DIVER)) { best = dist; pos = [p.x, p.y, p.z]; }
    }
    const look: [number, number, number] = [pos[0] + (alongX ? 2 * reach : 0), pos[1] - 0.5, pos[2] + (alongX ? 0 : 2 * reach)];
    out[r.id.slice(d.id.length + 1)] = { label: r.label, pos, at: look };
  });
  const span = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  out.overview = { label: "Overview", pos: [c.x + span * 0.7, b.max.y + span * 0.35, c.z - span * 0.7], at: [c.x, roomsY + 4, c.z] };
  out.plan = { label: "Plan (above)", pos: [c.x, b.max.y + span * 1.2, c.z + 0.01], at: [c.x, roomsY, c.z] };
  return out;
}
const VIEWS = viewsFor(def);

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
const CONTENT_COLORS = { resource: new Color3(0.2, 1, 0.5), resident: new Color3(0.6, 0.9, 1), find: new Color3(1, 0.85, 0.3) } as const;
function overlay(kind: string): LinesMesh {
  const lines: Vector3[][] = [], colors: Color4[][] = [];
  const add = (l: Vector3[], c: Color3): void => { lines.push(l); colors.push(l.map(() => new Color4(c.r, c.g, c.b, 1))); };
  for (const d of defs) {
    // The rock as a plan slice: every box crossing one height (`?slice=`, else
    // the camera's), drawn at that height. Hide the shell to read the cave plan.
    if (kind === "solids") {
      const y = Number(params.get("slice") ?? camera.position.y);
      for (const s of d.rock) if (s.min.y <= y && s.max.y >= y) {
        const a = new Vector3(s.min.x, y, s.min.z), b = new Vector3(s.max.x, y, s.min.z), c = new Vector3(s.max.x, y, s.max.z), e = new Vector3(s.min.x, y, s.max.z);
        add([a, b, c, e, a], new Color3(1, 0.55, 0.15));
      }
    }
    if (kind === "rooms") for (const r of d.rooms) for (const l of boxLines(r.bounds.min, r.bounds.max)) add(l, new Color3(0.4, 0.6, 1));
    if (kind === "routes") for (const r of d.routes)
      add(r.path.map(v3), r.profile !== "diver" ? new Color3(1, 0.55, 0.1) : r.role === "exit" ? new Color3(0.9, 0.9, 0.3) : new Color3(1, 0.3, 0.9));
    if (kind === "portals") for (const p of d.portals) {
      const c = p.kind === "mouth" ? new Color3(0.3, 1, 0.4) : p.kind === "skylight" ? new Color3(1, 0.95, 0.3) : new Color3(0.3, 0.9, 1);
      const w = p.clear.width / 2, h = p.clear.height / 2, o = p.center;
      const corners = p.normal.y !== 0
        ? [[-w, 0, -h], [w, 0, -h], [w, 0, h], [-w, 0, h]]
        : p.normal.z !== 0 ? [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]] : [[0, -h, -w], [0, -h, w], [0, h, w], [0, h, -w]];
      const pts = corners.map(([x, y, z]) => new Vector3(o.x + x!, o.y + y!, o.z + z!));
      add([...pts, pts[0]!], c);
      add([v3(o), new Vector3(o.x + p.normal.x * 2, o.y + p.normal.y * 2, o.z + p.normal.z * 2)], c);
    }
    if (kind === "contents") for (const c of CAVE_CONTENTS.filter(x => x.cave === d.id)) {
      const o = c.at, s = 0.6, col = CONTENT_COLORS[c.kind];
      add([new Vector3(o.x - s, o.y, o.z), new Vector3(o.x + s, o.y, o.z)], col);
      add([new Vector3(o.x, o.y - s, o.z), new Vector3(o.x, o.y + s, o.z)], col);
      add([new Vector3(o.x, o.y, o.z - s), new Vector3(o.x, o.y, o.z + s)], col);
    }
  }
  const mesh = CreateLineSystem(`lab.overlay.${kind}`, { lines, colors }, scene);
  // Rock boxes are depth-tested with the art; the paths and markers draw on top.
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
function applyLod(): void {
  for (const m of shellMeshes) { m.fine.setEnabled(state.shell && state.lod === "fine"); m.coarse.setEnabled(state.shell && state.lod === "coarse"); }
}
applyLod();

let last = camera.position.clone();
function go(name: string): void {
  const v = VIEWS[name]; if (!v) return;
  camera.position.set(...v.pos);
  camera.setTarget(new Vector3(...v.at));
  last = camera.position.clone();
  for (const b of document.querySelectorAll<HTMLButtonElement>("#views button")) b.classList.toggle("on", b.dataset.view === name);
}
const views = document.getElementById("views")!, toggles = document.getElementById("toggles")!, status = document.getElementById("status")!;
// The cave list: every authored kit cave by region; picking one reloads the lab on it.
const picker = document.createElement("select");
picker.id = "cave";
for (const region of [...new Set(AUTHORED_CAVE_SOURCES.map(s => s.region))]) {
  const group = document.createElement("optgroup"); group.label = region;
  for (const s of AUTHORED_CAVE_SOURCES.filter(x => x.region === region)) {
    const o = document.createElement("option"); o.value = s.id; o.textContent = `${s.label} (${s.id})`; o.selected = s.id === caveId;
    group.appendChild(o);
  }
  picker.appendChild(group);
}
function select(id: string): void {
  const next = new URLSearchParams(params); next.set("cave", id); next.delete("view");
  location.search = `?${next}`;
}
picker.onchange = () => select(picker.value);
views.appendChild(picker);
views.appendChild(document.createElement("br"));
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
for (const kind of ["solids", "portals", "routes", "rooms", "contents"]) {
  let on = requested.includes(kind);
  if (on) setOverlay(kind, true);
  toggle(kind, () => on, () => { on = !on; setOverlay(kind, on); });
}
window.addEventListener("keydown", e => {
  camera.speed = e.shiftKey ? 1.2 : 0.35;
  if (e.code === "KeyL") buttons["lamp (L)"]!.click();
  if (e.code === "KeyK") buttons["coarse (K)"]!.click();
  if (e.code === "KeyC") buttons["collide (C)"]!.click();
  const at = AUTHORED_CAVE_SOURCES.findIndex(s => s.id === caveId);
  if (e.code === "BracketRight") select(AUTHORED_CAVE_SOURCES[(at + 1) % AUTHORED_CAVE_SOURCES.length]!.id);
  if (e.code === "BracketLeft") select(AUTHORED_CAVE_SOURCES[(at + AUTHORED_CAVE_SOURCES.length - 1) % AUTHORED_CAVE_SOURCES.length]!.id);
});
window.addEventListener("keyup", e => { camera.speed = e.shiftKey ? 1.2 : 0.35; });
document.getElementById("hide")!.onclick = () => document.getElementById("panel")!.classList.toggle("hidden");
if (params.get("hud") === "0") document.getElementById("panel")!.classList.add("hidden");
go(params.get("view") ?? Object.keys(VIEWS)[0]!);

// Free swim with the diver's own collision: the camera proposes a move and
// the world sweeps the diver box from the last accepted pose.
function swim(): void {
  if (!state.collide) { last = camera.position.clone(); return; }
  const from = { x: last.x, y: last.y - EYE, z: last.z }, to = camera.position;
  const moved = world.moveCapsule(from, { x: to.x - last.x, y: to.y - last.y, z: to.z - last.z }, DIVER);
  camera.position.set(moved.position.x, moved.position.y + EYE, moved.position.z);
  // A blocked swim stops: no inertia keeps pressing the camera into rock.
  if (moved.hitSolid) camera.cameraDirection.setAll(0);
  last = camera.position.clone();
}
// After the camera applies its input and before it draws, so no frame is
// ever drawn from an unswept pose.
scene.onBeforeCameraRenderObservable.add(swim);

const roomAt = (): string => {
  const p = camera.position;
  const owner = defs.find(d => { const f = d.replacementFootprints[0]!; return p.x >= f.minX && p.x < f.maxX && p.z >= f.minZ && p.z < f.maxZ; });
  if (!owner) return EXTERIOR;
  const v = caveVolume(owner), g = v.grid;
  const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - EYE - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return EXTERIOR;
  const r = v.room[i + g.nx * (j + g.ny * k)]!;
  return r ? v.roomIds[r - 1]! : EXTERIOR;
};

let frame = 0;
const timer = { last: performance.now(), fps: 0 };
function tick(): void {
  const p = camera.position;
  lightNearest(p);
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
    const c = sampleLightField(fields.get(lit ?? def.id)!, { x: p.x, y: p.y, z: p.z });
    const shells = shellsOf.get(lit ?? def.id)!;
    status.textContent =
      `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  depth ${Math.max(0, -p.y).toFixed(1)} m  ${roomAt()}\n` +
      `daylight ${caveDaylight(c.r, c.g, c.a).toFixed(2)}  sun ${c.g.toFixed(2)}  lamp ${state.lamp ? "on" : "off"}  ${state.lod}  lit ${lit}\n` +
      `${loaded.length} caves  rock ${defs.reduce((n, d) => n + d.rock.length, 0)} solids  shell ${shells[state.lod].positions.length / 3} verts  seabed ${terrainVertices}\n` +
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
/** GPU control for lamp visibility: runs the production `lampVisible` GLSL
 * on its own WebGL2 context with this cave's textures, 64 rays per draw into
 * an offscreen target (one fragment per ray). Returns 0 (blocked) or 1 (lit)
 * per ray, to compare with the CPU walk. */
function lampProbe(rays: readonly { p: P; lamp: P }[]): { values: number[]; renderer: string; error: number } {
  const BATCH = 64, c = document.createElement("canvas"); c.width = BATCH; c.height = 1;
  const gl = c.getContext("webgl2", { antialias: false })!, program = gl.createProgram()!;
  const add = (type: number, source: string): void => {
    const sh = gl.createShader(type)!; gl.shaderSource(sh, source); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "compile");
    gl.attachShader(program, sh); gl.deleteShader(sh);
  };
  add(gl.VERTEX_SHADER, "#version 300 es\nvoid main(){vec2 p=gl_VertexID==0?vec2(-1,-1):gl_VertexID==1?vec2(3,-1):vec2(-1,3);gl_Position=vec4(p,0,1);}");
  add(gl.FRAGMENT_SHADER, "#version 300 es\nprecision highp float;\n" + CAVE_LIGHT_SHADER.split("vec3 caveLamp")[0] +
    `\nuniform vec3 testP[${BATCH}],testLamp[${BATCH}];out vec4 color;` +
    "void main(){int i=int(gl_FragCoord.x);color=vec4(lampVisible(testP[i],testLamp[i]),0,0,1);}");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
  gl.useProgram(program);
  const texture = (unit: number, w: number, h: number, d: number, data: Uint8Array, rgba: boolean): void => {
    const t = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_3D, t);
    const filter = rgba ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, k, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, rgba ? gl.RGBA8 : gl.R8, w, h, d, 0, rgba ? gl.RGBA : gl.RED, gl.UNSIGNED_BYTE, data);
  };
  const r = field.rock;
  texture(0, field.nx, field.ny, field.nz, field.data, true); texture(1, r.nx, r.ny, r.nz, r.data, false);
  const target = gl.createTexture()!; gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, target);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, BATCH, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  const u = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform1i(u("caveField"), 0); gl.uniform1i(u("caveRock"), 1); gl.uniform1f(u("caveActive"), 1);
  gl.uniform3f(u("caveFieldMin"), field.min.x, field.min.y, field.min.z); gl.uniform3f(u("caveFieldSize"), field.size.x, field.size.y, field.size.z);
  gl.uniform3f(u("caveRockMin"), r.min.x, r.min.y, r.min.z); gl.uniform1f(u("caveRockVoxel"), r.voxel); gl.uniform3f(u("caveRockDims"), r.nx, r.ny, r.nz);
  const values: number[] = [], pixels = new Uint8Array(BATCH * 4);
  for (let at = 0; at < rays.length; at += BATCH) {
    const batch = rays.slice(at, at + BATCH), ps = new Float32Array(BATCH * 3), ls = new Float32Array(BATCH * 3);
    batch.forEach((ray, i) => { ps.set([ray.p.x, ray.p.y, ray.p.z], i * 3); ls.set([ray.lamp.x, ray.lamp.y, ray.lamp.z], i * 3); });
    gl.uniform3fv(u("testP[0]"), ps); gl.uniform3fv(u("testLamp[0]"), ls);
    gl.viewport(0, 0, BATCH, 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, BATCH, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (let i = 0; i < batch.length; i++) values.push(pixels[i * 4]! / 255);
  }
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const result = { values, renderer: String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)), error: gl.getError() };
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return result;
}
/** Scripted capture (`?shots=<receiver URL>&queue=<id,id,...>`): shoots this
 * cave from outside a mouth in daylight and in its largest chamber with the
 * lamp off, POSTs both PNGs to the receiver, then moves on down the queue. */
async function captureQueue(base: string): Promise<void> {
  const keys = Object.keys(VIEWS), rooms = def.rooms.slice().sort((a, b) => Number(b.role === "chamber") - Number(a.role === "chamber") ||
    (b.bounds.max.x - b.bounds.min.x) * (b.bounds.max.z - b.bounds.min.z) - (a.bounds.max.x - a.bounds.min.x) * (a.bounds.max.z - a.bounds.min.z));
  const day = params.get("day") ?? keys.find(k => !k.endsWith("_in") && (k.startsWith("mouth") || k === "approach")) ?? keys[0]!;
  const dark = params.get("dark") ?? rooms.map(r => r.id.slice(def.id.length + 1)).find(k => keys.includes(k)) ?? keys[1]!;
  for (const [name, view, lamp] of [[`${def.id}-day.png`, day, true], [`${def.id}-dark.png`, dark, false]] as const) {
    await show(view, lamp, "fine");
    await settle(2);
    const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, "image/png"));
    if (blob) await fetch(`${base}/${name}`, { method: "POST", body: blob });
  }
  const queue = (params.get("queue") ?? "").split(",").filter(Boolean);
  if (queue.length) {
    const next = new URLSearchParams(params); next.set("cave", queue[0]!); next.set("queue", queue.slice(1).join(","));
    next.delete("view"); next.delete("day"); next.delete("dark");
    location.search = `?${next}`;
  }
}
if (params.get("shots")) void settle(4).then(() => captureQueue(params.get("shots")!));
Object.assign(window, { caveLab: { lampProbe, go, show, settle, select, camera, scene, def, defs, field, fields, world, state, setOverlay, applyLod, VIEWS,
  caves: AUTHORED_CAVE_SOURCES.map(s => s.id) } });
