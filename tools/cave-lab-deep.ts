/** CA-3 deep cave lab (dev only): the Ember Rift, Mirror Divide and Meridian
 * small and medium caves beside their real terrain, with cave light, a lamp,
 * collision and the typed layer the kit has no art for yet (lamp-off cues,
 * heat fields, brine pools). Run under Vite on your own port:
 *   npx vite --port <port> --strictPort --host 127.0.0.1
 *   open http://127.0.0.1:<port>/tools/cave-lab-deep.html?cave=rift_kiln_tube
 * Drag to look, WASD/QE to swim, Shift for speed. L lamp, K LOD, C collision.
 * URL: ?cave=<id>&view=approach|inside|plan|mouth:<portal id>&lamp=0|1&lod=fine|coarse
 *      &overlay=solids,portals,routes,rooms,cues,hazards&shell=0&slice=<y>&collide=0&hud=0&loop=message
 * `window.caveLab` exposes the scene, camera and helpers for scripted runs. */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder.js";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
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
import { CAVE_SOURCES, EXTERIOR } from "../src/content/regions/caves.js";
import { buildCave, caveShell, caveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { emptyMasks, terrainMasks } from "../src/content/regions/terrain.js";
import { DEEP_CAVES, sampleDeepHazards } from "../src/content/regions/caves/deep.js";
import { caveOwner, createCaveWorldQueries, SOLIDS, surfaceHeight } from "../src/sim/world.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { columnAt, columnRect } from "../src/world/frame.js";
import type { Rect, Vec3 } from "../src/world/types.js";

const params = new URLSearchParams(location.search);
const cave = DEEP_CAVES.find(c => c.source.id === params.get("cave")) ?? DEEP_CAVES[0]!;
const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
engine.setHardwareScalingLevel(Number(params.get("scale") ?? 1));
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
const camera = new FreeCamera("lab.camera", new Vector3(0, 0, 0), scene);
camera.minZ = 0.1; camera.maxZ = 450; camera.fov = 1.02;
camera.keysUp = [87]; camera.keysDown = [83]; camera.keysLeft = [65]; camera.keysRight = [68];
camera.keysUpward = [69]; camera.keysDownward = [81];
camera.speed = 0.35; camera.angularSensibility = 1800; camera.inertia = 0.6;
camera.attachControl(canvas, true);
const instrumentation = new SceneInstrumentation(scene);

// --- The cave, built from its one source --------------------------------------
const started = performance.now();
const def = buildCave(cave.source, worldFloor);
const shells = { fine: caveShell(def, "fine"), coarse: caveShell(def, "coarse") };
const field = caveLightField(def, worldFloor);
const buildMs = performance.now() - started;
// The composed world for this cave: every solid, the shared floor, root's
// caves and this one (the others are hundreds of metres away).
const world = createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight,
  caves: [...CAVE_SOURCES.map(s => buildCave(s, worldFloor)), def].map(caveOwner) });

const cel = createCaveCelMaterial(scene);
const { water, sky } = createAtmosphere(scene);
const materials: ShaderMaterial[] = [cel, water, sky];
const lighting = new CaveLighting(scene, [cel]);
lighting.setField(field);

function meshOf(recipe: MeshRecipe, name = recipe.name): Mesh {
  const mesh = new Mesh(name, scene), data = new VertexData();
  data.positions = recipe.positions; data.normals = recipe.normals; data.colors = recipe.colors; data.indices = recipe.indices;
  data.applyToMesh(mesh, false);
  mesh.material = cel; mesh.isPickable = false; mesh.renderingGroupId = 1; mesh.freezeWorldMatrix();
  return mesh;
}
const shellMeshes = { fine: meshOf(shells.fine), coarse: meshOf(shells.coarse) };

// --- Surrounding terrain: the live recipe with the footprint as a hole ----------
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
    geologyColor(x, y, z, Math.hypot(gx, gz), regionAtPoint(x, z) ?? cave.source.region, masks, colors);
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
let terrainVertices = 0;
const centre = columnAt((footprint.minX + footprint.maxX) / 2, (footprint.minZ + footprint.maxZ) / 2)!;
for (let ix = centre.ix - 1; ix <= centre.ix + 1; ix++) for (let iz = centre.iz - 1; iz <= centre.iz + 1; iz++) {
  const recipe = terrainColumn(columnRect(ix, iz));
  if (recipe) { meshOf(recipe); terrainVertices += recipe.positions.length / 3; }
}

// --- Views: generated from the cave's own portals and rooms --------------------
type View = { pos: [number, number, number]; at: [number, number, number]; label: string };
const VIEWS: Record<string, View> = {};
const mouths = def.portals.filter(p => p.kind === "mouth" || p.kind === "skylight");
const first = mouths[0]!;
{
  const n = first.normal, out = first.kind === "skylight" ? 10 : 14;
  VIEWS.approach = { label: "Approach", at: [first.center.x, first.center.y, first.center.z],
    pos: [first.center.x + n.x * out + (n.y !== 0 ? 8 : 0), first.center.y + 3 + n.y * out, first.center.z + n.z * out + (n.y !== 0 ? 8 : 0)] };
  // Inside: 10-14 m back along a route from where it leaves through an
  // opening, looking at that opening: the exit as a diver in the dark sees it.
  const inside = (() => {
    const v = caveVolume(def), g = v.grid;
    const inCave = (p: P): boolean => {
      const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y + 0.4 - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
      return i >= 0 && j >= 0 && k >= 0 && i < g.nx && j < g.ny && k < g.nz && v.room[i + g.nx * (j + g.ny * k)]! > 0;
    };
    let best: { at: P; target: P; depth: number } | null = null;
    for (const r of [...def.routes].sort((a, b) => (a.profile === "diver" ? 0 : 1) - (b.profile === "diver" ? 0 : 1)))
      for (const path of [r.path, r.path.slice().reverse()]) for (let out = 1; out < path.length; out++) {
        const q = path[out]!;
        if (!mouths.some(m => Math.hypot(q.x - m.center.x, q.y - m.center.y, q.z - m.center.z) < 7) || !inCave(path[out - 1]!)) continue;
        // Walk back inside the cave's own water up to 12 m.
        let walked = 0, at: P = path[out - 1]!;
        for (let i = out - 1; i > 0 && walked < 12; i--) {
          const a = path[i]!, c = path[i - 1]!, len = Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);
          if (!inCave(c)) break;
          const t = Math.min(1, (12 - walked) / len);
          at = { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, z: a.z + (c.z - a.z) * t }; walked += len * t;
        }
        if (!best || walked > best.depth) best = { at: { ...at, y: at.y + 0.9 }, target: q, depth: walked };
      }
    return best;
  })();
  if (inside) VIEWS.inside = { label: "Inside, toward the exit", pos: [inside.at.x, inside.at.y, inside.at.z], at: [inside.target.x, inside.target.y + 1, inside.target.z] };
  const f = footprint, cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
  VIEWS.plan = { label: "Plan (above)", pos: [cx, def.bounds.max.y + 55, cz - 0.01], at: [cx, def.bounds.min.y, cz] };
  VIEWS.overview = { label: "Overview", pos: [f.maxX + 25, def.bounds.max.y + 18, f.minZ - 25], at: [cx, (def.bounds.min.y + def.bounds.max.y) / 2, cz] };
  for (const m of mouths) {
    // Just inside the opening, looking out: the exit as an unlit diver sees it.
    const back = m.kind === "skylight" ? { x: 0, y: -4, z: 0 } : { x: -m.normal.x * 4, y: 0, z: -m.normal.z * 4 };
    VIEWS[`mouth:${m.id}`] = { label: `${m.label} (in)`, pos: [m.center.x + back.x, m.center.y + back.y, m.center.z + back.z],
      at: [m.center.x + m.normal.x * 6, m.center.y + m.normal.y * 6, m.center.z + m.normal.z * 6] };
  }
}

// --- Overlays -------------------------------------------------------------------
const overlays = new Map<string, Mesh[]>();
type P = { x: number; y: number; z: number };
const v3 = (p: P): Vector3 => new Vector3(p.x, p.y, p.z);
function boxLines(min: P, max: P): Vector3[][] {
  const c = (x: number, y: number, z: number): Vector3 => new Vector3(x ? max.x : min.x, y ? max.y : min.y, z ? max.z : min.z);
  const out: Vector3[][] = [];
  for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const)
    out.push([c(a & 1, (a >> 1) & 1, a >> 2), c(b & 1, (b >> 1) & 1, b >> 2)]);
  return out;
}
function unlit(name: string, rgb: readonly [number, number, number], alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true; m.emissiveColor = new Color3(rgb[0], rgb[1], rgb[2]); m.alpha = alpha; m.backFaceCulling = false;
  return m;
}
function lineMesh(kind: string, lines: Vector3[][], colors: Color3[]): LinesMesh {
  const mesh = CreateLineSystem(`lab.overlay.${kind}`, { lines, colors: lines.map((l, i) => l.map(() => new Color4(colors[i]!.r, colors[i]!.g, colors[i]!.b, 1))) }, scene);
  mesh.renderingGroupId = kind === "solids" || kind === "rooms" ? 1 : 2; mesh.isPickable = false;
  return mesh;
}
function overlay(kind: string): Mesh[] {
  const lines: Vector3[][] = [], colors: Color3[] = [], add = (l: Vector3[], c: Color3): void => { lines.push(l); colors.push(c); };
  if (kind === "solids") {
    const y = Number(params.get("slice") ?? camera.position.y);
    for (const s of def.rock) if (s.min.y <= y && s.max.y >= y) {
      const a = new Vector3(s.min.x, y, s.min.z), b = new Vector3(s.max.x, y, s.min.z), c = new Vector3(s.max.x, y, s.max.z), d = new Vector3(s.min.x, y, s.max.z);
      add([a, b, c, d, a], new Color3(1, 0.55, 0.15));
    }
  }
  if (kind === "rooms") for (const r of def.rooms) for (const l of boxLines(r.bounds.min, r.bounds.max)) add(l, new Color3(0.4, 0.6, 1));
  if (kind === "routes") for (const r of def.routes) add(r.path.map(v3), r.profile !== "diver" ? new Color3(1, 0.3, 0.9) : r.role === "loop" ? new Color3(0.4, 1, 0.5) : new Color3(0.9, 0.9, 0.3));
  if (kind === "portals") for (const p of def.portals) {
    const c = p.kind === "mouth" ? new Color3(0.3, 1, 0.4) : p.kind === "skylight" ? new Color3(1, 0.95, 0.3) : new Color3(0.3, 0.9, 1);
    const w = p.clear.width / 2, h = p.clear.height / 2, o = p.center;
    const corners = p.normal.y !== 0 ? [[-w, 0, -h], [w, 0, -h], [w, 0, h], [-w, 0, h]]
      : p.normal.z !== 0 ? [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]] : [[0, -h, -w], [0, -h, w], [0, h, w], [0, h, -w]];
    const pts = corners.map(([x, y, z]) => new Vector3(o.x + x!, o.y + y!, o.z + z!));
    add([...pts, pts[0]!], c);
    add([v3(o), new Vector3(o.x + p.normal.x * 2, o.y + p.normal.y * 2, o.z + p.normal.z * 2)], c);
  }
  const meshes: Mesh[] = [];
  if (kind === "hazards") for (const h of cave.hazards) {
    const s = h.shape, c = h.kind === "heat" ? new Color3(1, 0.35, 0.1) : new Color3(0.75, 0.62, 1);
    if (s.kind === "layer") {
      // The trapped pool's mirror: a sheet at its surface, clipped to the box.
      const base = sampleBase(h);
      const min = { x: base.x + s.min.x, z: base.z + s.min.z }, max = { x: base.x + s.max.x, z: base.z + s.max.z };
      const sheet = CreateGround(`lab.brine.${h.id}`, { width: max.x - min.x, height: max.z - min.z }, scene);
      sheet.position.set((min.x + max.x) / 2, base.y + s.y, (min.z + max.z) / 2);
      sheet.material = unlit(`lab.brine.mat.${h.id}`, [0.78, 0.7, 0.98], 0.45); sheet.renderingGroupId = 1; sheet.isPickable = false;
      meshes.push(sheet);
    } else if (s.kind === "box") {
      const base = sampleBase(h);
      for (const l of boxLines({ x: base.x + s.min.x, y: base.y + s.min.y, z: base.z + s.min.z }, { x: base.x + s.max.x, y: base.y + s.max.y, z: base.z + s.max.z })) add(l, c);
    } else {
      const base = sampleBase(h);
      add([new Vector3(base.x, base.y + s.bottom, base.z), new Vector3(base.x, base.y + s.top, base.z)], c);
    }
  }
  if (kind === "cues") for (const q of cave.cues) {
    // Unlit cue animals and colonies: the lamp-off read. Cables and cracks
    // are lines along the rock; colonies, glimmers and skimmers are small
    // glowing clusters at each listed point.
    const mat = unlit(`lab.cue.mat.${q.id}`, q.color);
    if (q.kind === "live_line" || q.kind === "ember_crack") {
      const tube = CreateTube(`lab.cue.${q.id}`, { path: q.points.map(v3), radius: q.kind === "live_line" ? 0.035 : 0.03, tessellation: 5 }, scene);
      tube.material = mat; tube.renderingGroupId = 1; tube.isPickable = false; meshes.push(tube);
    } else for (const [i, p] of q.points.entries()) for (let k = 0; k < 7; k++) {
      const a = (i * 7 + k) * 2.39996, r = 0.12 + 0.18 * ((k * 37) % 7) / 7;
      const bead = CreateSphere(`lab.cue.${q.id}.${i}.${k}`, { diameter: q.kind === "pool_edge" ? 0.16 : 0.1, segments: 4 }, scene);
      bead.position.set(p.x + Math.cos(a) * r, p.y + ((k % 3) - 1) * 0.12, p.z + Math.sin(a) * r);
      bead.material = mat; bead.renderingGroupId = 1; bead.isPickable = false; meshes.push(bead);
    }
  }
  if (lines.length) meshes.push(lineMesh(kind, lines, colors));
  return meshes;
}
/** A field shape's origin in world space (fields are site-relative). */
const sampleBase = (h: (typeof cave.hazards)[number]): Vec3 => sitePosition(h.shape.center);
function setOverlay(kind: string, on: boolean): void {
  if (on && !overlays.has(kind)) overlays.set(kind, overlay(kind));
  if (!on) { for (const m of overlays.get(kind) ?? []) m.dispose(); overlays.delete(kind); }
}

// --- State and controls -------------------------------------------------------
const state = { lamp: params.get("lamp") !== "0", lod: (params.get("lod") === "coarse" ? "coarse" : "fine") as "fine" | "coarse",
  collide: params.get("collide") !== "0", shell: params.get("shell") !== "0" };
const DIVER = { radius: 0.34, height: 0.95 }, EYE = 0.6;
function applyLod(): void {
  shellMeshes.fine.setEnabled(state.shell && state.lod === "fine");
  shellMeshes.coarse.setEnabled(state.shell && state.lod === "coarse");
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
const picker = document.getElementById("cave") as HTMLSelectElement;
for (const c of DEEP_CAVES) {
  const o = document.createElement("option"); o.value = c.source.id; o.textContent = `${c.source.label} (${c.size}, ${c.source.region})`;
  o.selected = c === cave; picker.appendChild(o);
}
picker.onchange = () => { params.set("cave", picker.value); params.delete("view"); location.search = `?${params}`; };
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
const requested = (params.get("overlay") ?? "cues,hazards").split(",");
for (const kind of ["cues", "hazards", "solids", "portals", "routes", "rooms"]) {
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
go(params.get("view") ?? "approach");

// Free swim with the diver's own collision, swept from the last accepted pose.
function swim(): void {
  if (!state.collide) { last = camera.position.clone(); return; }
  const from = { x: last.x, y: last.y - EYE, z: last.z }, to = camera.position;
  const moved = world.moveCapsule(from, { x: to.x - last.x, y: to.y - last.y, z: to.z - last.z }, DIVER);
  camera.position.set(moved.position.x, moved.position.y + EYE, moved.position.z);
  if (moved.hitSolid) camera.cameraDirection.setAll(0);
  last = camera.position.clone();
}
scene.onBeforeCameraRenderObservable.add(swim);

const roomAt = (): string => {
  const v = caveVolume(def), g = v.grid, p = camera.position;
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
  const forward = camera.getDirection(Vector3.Forward(scene.useRightHandedSystem)).normalize();
  const right = camera.getDirection(Vector3.Right()).normalize();
  lighting.apply({ on: state.lamp, position: p.add(right.scale(0.25)).add(new Vector3(0, -0.2, 0)), direction: forward });
  scene.render();
  frame++;
  const now = performance.now();
  if (frame % 15 === 0) {
    timer.fps = 15000 / (now - timer.last); timer.last = now;
    const c = sampleLightField(field, { x: p.x, y: p.y, z: p.z }), h = sampleDeepHazards({ x: p.x, y: p.y - EYE, z: p.z }, frame);
    status.textContent =
      `${cave.source.label}  ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  depth ${Math.max(0, -p.y).toFixed(1)} m  ${roomAt()}\n` +
      `daylight ${caveDaylight(c.r, c.g, c.a).toFixed(2)}  heat ${h.heat.toFixed(2)}  brine ${h.brine.toFixed(2)}  lamp ${state.lamp ? "on" : "off"}  ${state.lod}\n` +
      `rock ${def.rock.length} solids  shell ${shells[state.lod].positions.length / 3} verts  terrain ${terrainVertices}\n` +
      `build ${buildMs.toFixed(0)} ms  draws ${instrumentation.drawCallsCounter.current}  ${timer.fps.toFixed(0)} fps  ${engine.webGLVersion > 1 ? "webgl2" : "webgl1"}`;
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
async function show(name: string, lamp = state.lamp, lod = state.lod): Promise<void> {
  state.lamp = lamp; state.lod = lod; applyLod(); go(name);
  await settle();
}
Object.assign(window, { caveLab: { go, show, settle, camera, scene, def, field, world, state, setOverlay, applyLod, VIEWS, cave: cave.source.id } });
