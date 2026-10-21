/** LC large-cave lab (dev only): the Canopy root caves, streamed through S1
 * residency, lit by the cave pass, with real collision for a diver and two
 * craft. Run under Vite on your own port:
 *   npx vite --port <port> --strictPort --host 127.0.0.1
 *   open http://127.0.0.1:<port>/tools/large-cave-lab.html
 * It loads tools/large-cave-lab.local/canopy_roots.bin.z (bake it with
 * tools/large-cave-lab.bake.mjs), or builds live with ?live=1 (~30 s).
 * Keys: WASD move, Q/E down/up (craft: pitch with drag), Shift boost, L lamp,
 * 1 diver, 2 Dart, 3 Creel, 4 free camera. Drag to look (no pointer lock).
 * URL: ?view=<bookmark>&mode=diver|dart|creel|free&lamp=0|1&hud=0&budget=<MiB>&live=1
 * `window.lcLab` exposes the scene, state and helpers for scripted runs. */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation.js";
import "@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery.js";
import "@babylonjs/core/Engines/Extensions/engine.query.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { createAtmosphere } from "../src/render/atmosphere.js";
import { createCelMaterial, updateOpticalUniforms } from "../src/render/materials.js";
import { CANOPY_ROOT_CAVES as S } from "../src/content/caves/canopyRootCaves.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { createWorldQueries, SOLIDS, surfaceHeight } from "../src/sim/world.js";
import { actorBox } from "../src/sim/ribCollision.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { encodeCave, loadCaveBake, prepareCave, type LoadedCave } from "../src/render/caves/large/pipeline.js";
import { createLargeCaveMaterial, LampWindow } from "../src/render/caves/large/caveMaterial.js";
import { seabedColor } from "../src/render/caves/large/art.js";
import { createCaveLoader } from "../src/render/caves/large/loader.js";
import { createLargeCave } from "../src/world/caves/large/build.js";
import { collisionBytes } from "../src/world/caves/large/collision.js";
import { composeCaveWorld, hullFloorFromSupport, largeCaveCollider } from "../src/world/caves/large/compose.js";
import { caveArtMinimum, caveWorldMap, CaveGate, CavePins, COVERAGE_REACH, coverageProblems, shownLods } from "../src/world/caves/large/streaming.js";
import { WINDOW_BYTES } from "../src/world/caves/large/lampWindow.js";
import { chunkKey } from "../src/world/caves/large/mesh.js";
import { createResidency } from "../src/world/residency.js";
import type { LodLevel } from "../src/world/types.js";

const params = new URLSearchParams(location.search);
const note = document.getElementById("note")!;
const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
engine.setHardwareScalingLevel(Number(params.get("scale") ?? 1));
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = Color4.FromHexString("#0b3048ff");
const camera = new FreeCamera("lc.camera", new Vector3(760, -66, -60), scene);
camera.minZ = 0.07; camera.maxZ = 450; camera.fov = 1.02;
camera.inputs.clear();
const gpuTimer = new EngineInstrumentation(engine);
try { gpuTimer.captureGPUFrameTime = true; } catch { /* no timer queries: GPU time reads 0 */ }
const instrumentation = new SceneInstrumentation(scene);

// --- Load the cave ------------------------------------------------------------
async function loadBytes(): Promise<{ bytes: Uint8Array; source: string; packed: number }> {
  if (params.get("live") !== "1") {
    const res = await fetch("./large-cave-lab.local/canopy_roots.bin.z", { cache: "no-store" });
    if (res.ok) {
      const packed = new Uint8Array(await res.arrayBuffer());
      const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate"));
      return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), source: "bake", packed: packed.byteLength };
    }
  }
  note.textContent = "No bake found: building the cave live (about 30 s)…";
  await new Promise(r => setTimeout(r, 30));
  const bytes = encodeCave(prepareCave(S, worldFloor));
  return { bytes, source: "live", packed: 0 };
}
const t0 = performance.now();
const loadedBytes = await loadBytes();
const tFetched = performance.now();
const loaded: LoadedCave = loadCaveBake(S, loadedBytes.bytes);
const tCollision = performance.now();
// The map from the bake's own layout: one seabed lattice, no field-wide pass.
const cave = createLargeCave(S, worldFloor, loaded.layout);
const cm = caveWorldMap(cave);
const tMap = performance.now();

// --- Collision: the production exterior world, composed with the cave ---------
const world = composeCaveWorld({ exterior: createWorldQueries(), solids: SOLIDS, floor: surfaceHeight, caves: [largeCaveCollider(loaded.collision)] });

// --- Materials, atmosphere and the exterior seabed ----------------------------
const caveMaterial = createLargeCaveMaterial(scene);
const terrainMaterial = createCelMaterial(scene);
const { water, sky } = createAtmosphere(scene);
const optics: ShaderMaterial[] = [caveMaterial, terrainMaterial, water, sky];
const lampWindow = new LampWindow(scene, [caveMaterial], { collision: loaded.collision, cells: cave.lattice.cells, occupancy: k => loaded.occupancy(k) });

/** The exterior heightfield round the cave (lab stand-in for the S2 terrain
 * bake), 1 m cells, with the collars cut out: there the cave owns the seabed. */
function seabed(): Mesh {
  const d = S.domain, x0 = d.min.x - 48, x1 = d.max.x + 48, z0 = d.min.z - 48, z1 = d.max.z + 48;
  const nx = x1 - x0 + 1, positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let k = 0; k <= z1 - z0; k++) for (let i = 0; i < nx; i++) {
    const x = x0 + i, z = z0 + k, y = worldFloor(x, z);
    const gx = (worldFloor(x + 0.5, z) - worldFloor(x - 0.5, z)), gz = (worldFloor(x, z + 0.5) - worldFloor(x, z - 0.5)), l = Math.hypot(gx, 1, gz);
    positions.push(x, y, z); normals.push(-gx / l, 1 / l, -gz / l);
    colors.push(...seabedColor(x, z, 1 / l));
  }
  const inCollar = (x: number, z: number): boolean => S.collars.some(r => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ);
  for (let k = 0; k < z1 - z0; k++) for (let i = 0; i < nx - 1; i++) {
    if (inCollar(x0 + i + 0.5, z0 + k + 0.5)) continue;
    const a = i + nx * k;
    indices.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
  }
  const mesh = new Mesh("lc.seabed", scene), data = new VertexData();
  data.positions = positions; data.normals = normals; data.colors = colors; data.indices = indices;
  data.applyToMesh(mesh, false);
  mesh.material = terrainMaterial; mesh.isPickable = false; mesh.renderingGroupId = 1; mesh.freezeWorldMatrix();
  return mesh;
}
const seabedMesh = seabed();

// --- Streaming ----------------------------------------------------------------
const budgetMiB = Number(params.get("budget") ?? 256);
const pins = new CavePins(cm);
const loader = createCaveLoader({ scene, material: caveMaterial, source: {
  art(chunk, lod: LodLevel) {
    const ref = cm.byId(chunk.id)!, baked = loaded.chunk(loaded.index.get(chunkKey(ref.coord))!);
    return { rock: baked[lod], life: lod === "fine" ? baked.life : null };
  },
} });
const residency = createResidency({ map: pins.view, loader, budget: { cpuBytes: budgetMiB * 1048576, gpuBytes: budgetMiB * 1048576 } });
const residentCollision = collisionBytes(loaded.collision);
// Fixed bytes, counted before any art is admitted (LC-03): every buffer the
// loaded cave keeps, plus the lamp window shown and staged (CPU) and bound (GPU).
const fixed = { cpu: loaded.retainedBytes + 2 * WINDOW_BYTES, gpu: WINDOW_BYTES };
// Other owners' share (a URL knob and `lcLab.reserveOther` for pressure tests).
let other = Number(params.get("other") ?? 0) * 1048576;
const external = (): void => residency.setExternalBytes({ cpu: fixed.cpu + other, gpu: fixed.gpu + other });
external();
const artCost = (id: string): { fine: number; coarse: number } => loaded.artCost[loaded.index.get(chunkKey(cm.byId(id)!.coord))!]!;
const artMinimum = caveArtMinimum(cm, artCost);
const gate = new CaveGate(cm);
const shareOk = (): boolean => budgetMiB * 1048576 - fixed.cpu - other >= artMinimum && budgetMiB * 1048576 - fixed.gpu - other >= artMinimum;

// --- Player -------------------------------------------------------------------
type Mode = "diver" | "dart" | "creel" | "free";
const SHAPES: Record<Exclude<Mode, "free">, Capsule> = {
  diver: { radius: 0.34, height: 0.95 }, dart: { radius: 3.6, height: 2.1 }, creel: { radius: 3.9, height: 3.6 },
};
const SPEED: Record<Exclude<Mode, "free">, [number, number]> = { diver: [3.4, 5.2], dart: [8, 11], creel: [5, 6.5] };
const EYE: Record<Mode, number> = { diver: 0.8, dart: 1.4, creel: 2.6, free: 0 };
const state = {
  mode: (params.get("mode") ?? "diver") as Mode,
  position: { x: 758, y: -72, z: -66 } as Vec3,
  velocity: { x: 0, y: 0, z: 0 } as Vec3,
  // Facing down into the Crown hollow from the shelf.
  yaw: -0.32, pitch: -0.9,
  lamp: params.get("lamp") !== "0",
  input: { forward: 0, right: 0, vertical: 0, boost: false },
  autopilot: null as null | { path: Vec3[]; index: number; speed: number | null },
  /** Cold-entry gate: control waits until the cave round the player is drawn. */
  held: true,
};
const DT = 1 / 60;
const keys = new Set<string>();
addEventListener("keydown", e => {
  keys.add(e.key.toLowerCase());
  const k = e.key.toLowerCase();
  if (k === "l") state.lamp = !state.lamp;
  if (k === "1" || k === "2" || k === "3" || k === "4") setMode((["diver", "dart", "creel", "free"] as const)[Number(k) - 1]!);
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
let drag: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; canvas.focus(); });
addEventListener("pointerup", () => { drag = null; });
addEventListener("pointermove", e => {
  if (!drag) return;
  state.yaw += (e.clientX - drag.x) * 0.004; state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - (e.clientY - drag.y) * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
function setMode(m: Mode): void {
  if (m !== "free") {
    const shape = SHAPES[m];
    // Keep the pose when it is clear for the new shape; else stay as before.
    if (!world.clearance(state.position, shape)) return;
  }
  state.mode = m; state.velocity = { x: 0, y: 0, z: 0 };
}

const stepCost = { calls: 0, us: 0, maxUs: 0 };
/** One 60 Hz step through the same input as the keys (and the autopilot). */
function step(): void {
  const inp = state.input;
  if (!state.autopilot) {
    inp.forward = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
    inp.right = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
    inp.vertical = (keys.has("e") ? 1 : 0) - (keys.has("q") ? 1 : 0);
    inp.boost = keys.has("shift");
  } else steerAutopilot();
  if (state.mode === "free") {
    const sp = inp.boost ? 24 : 8, f = { x: Math.sin(state.yaw) * Math.cos(state.pitch), y: Math.sin(state.pitch), z: -Math.cos(state.yaw) * Math.cos(state.pitch) };
    state.position = { x: state.position.x + (f.x * inp.forward + Math.cos(state.yaw) * inp.right) * sp * DT, y: state.position.y + (f.y * inp.forward + inp.vertical) * sp * DT,
      z: state.position.z + (f.z * inp.forward + Math.sin(state.yaw) * inp.right) * sp * DT };
    return;
  }
  const t = performance.now(), before = { ...state.position }, velocity = { ...state.velocity };
  if (state.mode === "diver") swim(); else pilot(SHAPES[state.mode], state.mode);
  const us = (performance.now() - t) * 1000;
  stepCost.calls++; stepCost.us += us; stepCost.maxUs = Math.max(stepCost.maxUs, us);
  // The gate (LC-02), against what this frame will draw: a move whose
  // destination is not covered is refused and the craft stops. Cold entry,
  // zone changes, turns and a shrinking share all land here.
  state.held = !gate.allows(shown, actorBox(state.position, SHAPES[state.mode]));
  if (state.held) {
    state.position = before; state.velocity = { x: 0, y: 0, z: 0 }; void velocity;
    gated++;
  } else moved = Math.hypot(state.position.x - before.x, state.position.y - before.y, state.position.z - before.z);
}
/** The diver as `step.ts` swims: speed, slices of 0.12 m, support snap. */
function swim(): void {
  const inp = state.input, shape = SHAPES.diver, speed = state.autopilot?.speed ?? (inp.boost ? 5.2 : 3.4);
  const n = Math.max(1, Math.hypot(inp.forward, inp.right)), f = inp.forward / n, r = inp.right / n;
  let vx = (Math.sin(state.yaw) * f * Math.cos(state.pitch) + Math.cos(state.yaw) * r) * speed;
  let vz = (-Math.cos(state.yaw) * f * Math.cos(state.pitch) + Math.sin(state.yaw) * r) * speed;
  let vy = inp.vertical * 2.8 + Math.sin(state.pitch) * f * speed;
  const m = Math.hypot(vx, vy, vz);
  if (m > speed) { vx *= speed / m; vy *= speed / m; vz *= speed / m; }
  let p = { ...state.position };
  const slices = Math.max(1, Math.ceil(m * DT / 0.12));
  for (let i = 0; i < slices; i++) {
    const d = { x: vx * DT / slices, y: vy * DT / slices, z: vz * DT / slices };
    // Cave cliff guard: SUPPORT, not groundHeight (which is the seabed above).
    const support = world.supportHeight(p.x + d.x, p.z + d.z, p.y);
    if (support <= p.y + 0.22 && p.y + d.y < support) d.y = support - p.y;
    p = world.moveCapsule(p, d, shape).position;
    const floor = world.supportHeight(p.x, p.z, p.y);
    if (p.y < floor && floor - p.y < 0.25 && world.clearance({ ...p, y: floor }, shape)) p.y = floor;
  }
  state.velocity = { x: vx, y: vy, z: vz };
  state.position = { ...p, y: Math.min(p.y, -0.5) };
}
/** A craft as `step.ts` pilots one: response, slices of 0.2 m, then the
 * keel lifted onto support (proposed `hullFloor` near caves). */
function pilot(shape: Capsule, mode: "dart" | "creel"): void {
  const inp = state.input, [cruise, boost] = SPEED[mode], speed = state.autopilot?.speed ?? (inp.boost ? boost : cruise);
  const n = Math.max(1, Math.hypot(inp.forward, inp.right, inp.vertical));
  const f = inp.forward / n, r = inp.right / n, v = inp.vertical / n;
  const target = { x: (Math.sin(state.yaw) * f * Math.cos(state.pitch) + Math.cos(state.yaw) * r) * speed,
    y: (v + Math.sin(state.pitch) * f) * speed * 0.75, z: (-Math.cos(state.yaw) * f * Math.cos(state.pitch) + Math.sin(state.yaw) * r) * speed };
  const response = mode === "creel" ? 1.7 : 2.8;
  for (const a of ["x", "y", "z"] as const) state.velocity[a] += (target[a] - state.velocity[a]) * Math.min(1, DT * response);
  const delta = { x: state.velocity.x * DT, y: state.velocity.y * DT, z: state.velocity.z * DT };
  const slices = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y, delta.z) / 0.2));
  let p = { ...state.position }, hit = false;
  for (let i = 0; i < slices; i++) {
    const r2 = world.moveCapsule(p, { x: delta.x / slices, y: delta.y / slices, z: delta.z / slices }, shape);
    hit ||= r2.hitSolid; p = r2.position;
    const floor = hullFloorFromSupport(world, p, shape);
    if (p.y < floor + 0.05 && world.clearance({ ...p, y: floor + 0.05 }, shape)) p.y = floor + 0.05;
  }
  if (hit) { state.velocity.x *= 0.5; state.velocity.z *= 0.5; }
  state.position = { ...p, y: Math.min(p.y, -0.9) };
}
function steerAutopilot(): void {
  const ap = state.autopilot!, inp = state.input;
  const g = ap.path[ap.index];
  if (!g) { state.autopilot = null; inp.forward = 0; return; }
  const eye = { x: state.position.x, y: state.position.y + 0.4, z: state.position.z };
  const dx = g.x - eye.x, dy = g.y - eye.y, dz = g.z - eye.z, l = Math.hypot(dx, dy, dz);
  if (l < (state.mode === "diver" ? 1.2 : 3)) { ap.index++; return; }
  state.yaw = Math.atan2(dx, -dz); state.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  inp.forward = 1; inp.right = 0; inp.vertical = 0; inp.boost = true;
}

// --- Views --------------------------------------------------------------------
let xray = false;
const VIEWS: Record<string, { label: string; pos: [number, number, number]; at: [number, number, number]; mode?: Mode }> = {
  approach: { label: "Crown hollow from the shelf", pos: [779, -76, -48], at: [756, -88, -74], mode: "free" },
  hollow: { label: "Down the Crown hollow", pos: [757, -84, -70], at: [752, -118, -94], mode: "free" },
  hall: { label: "Root hall", pos: [766, -125, -101], at: [722, -127, -100], mode: "free" },
  gallery: { label: "Collapsed gallery", pos: [714, -127.5, -100], at: [684, -133, -113], mode: "free" },
  garden: { label: "Glow garden", pos: [694, -148, -132], at: [668, -153, -145], mode: "free" },
  lowrun: { label: "Low run to the hub", pos: [744, -149, -152], at: [800, -149, -150], mode: "free" },
  hub: { label: "Hub and its great root", pos: [802, -146, -136], at: [821, -146, -147], mode: "free" },
  pool: { label: "Deep pool", pos: [848, -158, -154], at: [864, -185, -163], mode: "free" },
  scarp: { label: "Scarp mouth from the terrace", pos: [792, -148, -222], at: [795, -150, -186], mode: "free" },
  crawl: { label: "Knoll crawl", pos: [841, -133, -118], at: [846, -122, -104], mode: "free" },
  overview: { label: "Plan (x-ray: seabed hidden, no haze)", pos: [752, -20, -128], at: [752, -140, -127.5], mode: "free" },
};
function show(name: string, lamp?: boolean): void {
  const v = VIEWS[name]; if (!v) return;
  state.autopilot = null;
  state.mode = v.mode ?? state.mode; state.position = { x: v.pos[0], y: v.pos[1], z: v.pos[2] };
  const d = { x: v.at[0] - v.pos[0], y: v.at[1] - v.pos[1], z: v.at[2] - v.pos[2] };
  state.yaw = Math.atan2(d.x, -d.z); state.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  if (lamp !== undefined) state.lamp = lamp;
  // The plan view hides the seabed: the cave's rock reads from outside.
  xray = name === "overview";
  seabedMesh.setEnabled(!xray);
}

// --- Per-frame ------------------------------------------------------------------
const frames: { frame: number; dt: number; cpu: number; gpu: number; residencyMs: number; lampMs: number }[] = [];
/** failures: frames that moved while the drawn frame left the actor uncovered. */
const coverage = { frames: 0, failures: 0, unsafeMetres: 0, exposedStill: 0, first: "" };
let lastFrame = performance.now(), accumulator = 0, frame = 0, readyAt = 0, moved = 0, gated = 0;
let shown: ReadonlyMap<string, LodLevel> = new Map();
function zoneOf(p: Vec3): number { return cave.field.owned(p.x, p.y, p.z) && p.y < worldFloor(p.x, p.z) ? cave.field.zoneAt(p.x, p.y, p.z) : -1; }
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
function frameUpdate(): void {
  const now = performance.now(), dt = now - lastFrame; lastFrame = now;
  // 1. Residency for this frame first, round the current pose and its look-ahead.
  const eye0 = { x: state.position.x, y: state.position.y + EYE[state.mode], z: state.position.z };
  const r0 = performance.now();
  if (state.mode !== "free") pins.update(eye0, actorBox(state.position, SHAPES[state.mode]), Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z) * 0.5);
  else pins.update(eye0);
  const stats = residency.update(eye0);
  shown = shownLods(residency.units());
  const r1 = performance.now();
  // 2. Gated steps against what this frame draws.
  accumulator = Math.min(accumulator + dt / 1000, 0.25);
  moved = 0;
  while (accumulator >= DT) { step(); accumulator -= DT; }
  if (state.mode !== "free" && !state.held && !readyAt && frame > 2) readyAt = performance.now();
  const eye = { x: state.position.x, y: state.position.y + EYE[state.mode], z: state.position.z };
  camera.position.set(eye.x, eye.y, eye.z);
  const dir = new Vector3(Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch));
  camera.setTarget(camera.position.add(dir));
  const r1b = performance.now();
  lampWindow.update(eye);
  const r2 = performance.now();
  // 3. The invariant on the frame about to be drawn: no metre moved while uncovered.
  if (state.mode !== "free" && readyAt) {
    const problems = coverageProblems(cm, shown, actorBox(state.position, SHAPES[state.mode]), COVERAGE_REACH, pins.current.zone);
    coverage.frames++;
    if (problems.length && moved > 0) { coverage.failures++; coverage.unsafeMetres += moved; coverage.first ||= `${frame}: ${problems[0]}`; }
    else if (problems.length) coverage.exposedStill++;
  }
  // Optics: exterior water from the shared optics; the cave tint from the zone.
  updateOpticalUniforms(optics, camera.position, null);
  const zone = zoneOf(eye), z = zone >= 0 ? S.zones[zone]! : null;
  const fogTint = z ? hex(z.fog.color) : [1, 1, 1] as [number, number, number];
  // Inside, the zone's own haze; outside, the shared optics (so a collar's
  // seabed, drawn by the cave material, hazes exactly like the heightfield).
  if (z) caveMaterial.setFloat("fogDensity", z.fog.density);
  const base = hex("#0b3048"), tint: [number, number, number] = z ? [fogTint[0] / base[0], fogTint[1] / base[1], fogTint[2] / base[2]].map(v => Math.min(2, v)) as [number, number, number] : [1, 1, 1];
  lampWindow.apply({ on: state.lamp, position: { x: eye.x + dir.x * 0.3, y: eye.y - 0.15, z: eye.z + dir.z * 0.3 }, direction: { x: dir.x, y: dir.y, z: dir.z } }, tint, z ? 1 : 0);
  if (xray) for (const m of optics) m.setFloat("fogDensity", 0.0015);
  scene.clearColor = z ? new Color4(fogTint[0] * 0.6, fogTint[1] * 0.6, fogTint[2] * 0.6, 1) : Color4.FromHexString("#0b3048ff");
  const c0 = performance.now();
  scene.render();
  const cpu = performance.now() - c0;
  frames.push({ frame, dt, cpu, gpu: gpuTimer.gpuFrameTimeCounter.lastSecAverage / 1e6, residencyMs: r1 - r0, lampMs: r2 - r1b });
  if (frames.length > 20000) frames.splice(0, 10000);
  frame++;
  canvas.dataset.frame = String(frame);
  canvas.dataset.held = String(state.held);
  canvas.dataset.settled = String(stats.settled);
  if (frame % 10 === 0) hud(stats, zone);
}
function hud(stats: ReturnType<typeof residency.update>, zone: number): void {
  const el = document.getElementById("status")!;
  if (params.get("hud") === "0") { document.getElementById("panel")!.style.display = "none"; return; }
  const units = residency.units().filter(u => u.state === "shown"), fine = units.filter(u => u.lod === "fine").length;
  const recent = frames.slice(-120), p = (k: "dt" | "cpu", q: number) => [...recent.map(f => f[k])].sort((a, b) => a - b)[Math.floor(q * (recent.length - 1))] ?? 0;
  el.textContent = [
    `${state.mode}${state.held ? ` (held: ${shareOk() ? "cave streaming in" : "cave art share below its minimum"})` : ""}  ${zone >= 0 ? S.zones[zone]!.label : "outside"}  depth ${(-state.position.y).toFixed(1)} m`,
    `speed ${Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z).toFixed(1)} m/s  lamp ${state.lamp ? "on" : "off"} (L)`,
    `frame p50 ${p("dt", 0.5).toFixed(1)} p95 ${p("dt", 0.95).toFixed(1)} ms  cpu ${p("cpu", 0.5).toFixed(1)} ms  draws ${instrumentation.drawCallsCounter.current}`,
    `chunks shown ${units.length} (fine ${fine})  pending ${stats.pending}  ${stats.settled ? "settled" : "streaming"}`,
    `accounted cpu ${(stats.cpuBytes / 1048576).toFixed(1)} / gpu ${(stats.gpuBytes / 1048576).toFixed(1)} MiB of ${budgetMiB} (fixed ${(fixed.cpu / 1048576).toFixed(1)} cpu, art minimum ${(artMinimum / 1048576).toFixed(1)})`,
    `collision ${(residentCollision / 1048576).toFixed(1)} MiB resident  step ${(stepCost.us / Math.max(1, stepCost.calls)).toFixed(0)} µs (max ${stepCost.maxUs.toFixed(0)})`,
    `lamp window builds ${lampWindow.stats.built}  gated ${gated}  unsafe moves ${coverage.failures}/${coverage.frames}`,
    `load: ${loadedBytes.source} ${(loadedBytes.packed / 1048576).toFixed(1)} MiB packed, collision ${(tCollision - tFetched).toFixed(0)} ms`,
  ].join("\n");
}

// --- Panel --------------------------------------------------------------------
const viewsEl = document.getElementById("views")!;
for (const [k, v] of Object.entries(VIEWS)) {
  const b = document.createElement("button"); b.textContent = k; b.title = v.label; b.onclick = () => show(k); viewsEl.append(b);
}
const togglesEl = document.getElementById("toggles")!;
for (const m of ["diver", "dart", "creel", "free"] as const) {
  const b = document.createElement("button"); b.textContent = m; b.onclick = () => setMode(m); togglesEl.append(b);
}
document.getElementById("hide")!.onclick = () => document.getElementById("panel")!.classList.toggle("hidden");

if (params.get("view")) show(params.get("view")!);
if (params.get("mode")) state.mode = params.get("mode") as Mode;
note.remove();
engine.runRenderLoop(frameUpdate);
addEventListener("resize", () => engine.resize());

const percentile = (a: number[], q: number): number => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };
(window as unknown as { lcLab: unknown }).lcLab = {
  scene, engine, state, residency, world, cave, loaded, pins, lampWindow, coverage, frames, stepCost, show, setMode, VIEWS, gate,
  fixed, artMinimum, get gated() { return gated; }, shareOk,
  /** Another owner reserves (or releases) bytes of the shared budget. */
  reserveOther(bytes: number) { other = bytes; external(); },
  load: { source: loadedBytes.source, packedBytes: loadedBytes.packed, rawBytes: loadedBytes.bytes.byteLength, fetchMs: tFetched - t0,
    collisionMs: tCollision - tFetched, mapMs: tMap - tCollision, collisionBytes: residentCollision, retained: loaded.retained, retainedBytes: loaded.retainedBytes, fixedCpu: fixed.cpu, artMinimum },
  get readyMs() { return readyAt ? readyAt - t0 : null; },
  /** Drive a route through the same input path as the keys (boost on). */
  autopilot(routeId: string, mode: Exclude<Mode, "free">, speed: number | null = null) {
    const r = S.routes.find(x => x.id === routeId);
    if (!r) throw new Error(`no route ${routeId}`);
    state.mode = mode; state.position = { ...r.path[0]! }; state.velocity = { x: 0, y: 0, z: 0 };
    state.autopilot = { path: r.path.slice(1).map(p => ({ ...p })), index: 0, speed };
  },
  settle: (n: number) => new Promise<void>(res => { const end = frame + n; const tick = () => frame >= end ? res() : requestAnimationFrame(tick); tick(); }),
  report(fromFrame = 0) {
    const f = frames.filter(x => x.frame >= fromFrame), dt = f.map(x => x.dt), cpu = f.map(x => x.cpu), gpu = f.map(x => x.gpu).filter(x => x > 0);
    return { frames: f.length, dt: { p50: percentile(dt, 0.5), p95: percentile(dt, 0.95), p99: percentile(dt, 0.99), max: Math.max(...dt) },
      cpu: { p50: percentile(cpu, 0.5), p95: percentile(cpu, 0.95), max: Math.max(...cpu) }, gpuMs: gpu.length ? percentile(gpu, 0.5) : null,
      residencyMs: { p95: percentile(f.map(x => x.residencyMs), 0.95), max: Math.max(...f.map(x => x.residencyMs)) },
      lampMs: { p95: percentile(f.map(x => x.lampMs), 0.95), max: Math.max(...f.map(x => x.lampMs)) },
      step: { calls: stepCost.calls, meanUs: stepCost.us / Math.max(1, stepCost.calls), maxUs: stepCost.maxUs }, coverage: { ...coverage },
      residency: residency.stats, draws: instrumentation.drawCallsCounter.current };
  },
  frameCount: () => frame,
};
