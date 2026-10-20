/** Dev viewer for S3 fleet art: tools/fleet-viewer.html under Vite dev.
 * Query parameters make every view reproducible for screenshots, e.g.
 * ?hull=mantle&view=three-quarter&overlay=contact&depth=deep&panel=0 */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
import { createCelMaterial, createGlassMaterial, updateOpticalUniforms } from "../materials.js";
import { createAtmosphere } from "../atmosphere.js";
import { LabelMaterials } from "../landmarks.js";
import { CARRIER_LAYOUT } from "../../sim/carrier.js";
import { S3_HULLS, contactParts, type Box, type HullSpec, type S3HullId } from "../../content/fleet/hulls.js";
import { HEARTHLINE_FIXTURES, HEARTHLINE_SOCKETS, type InteriorSolid } from "../../content/fleet/hearthlineInterior.js";
import { fleetContactPose, fleetHullArt, hearthlineShellArt, setFleetPose, type FleetPose } from "./index.js";
import { formatFit, hullFit } from "./fit.js";

type Overlay = "none" | "collider" | "berth" | "contact" | "solids";
type Depth = "surface" | "deep";
interface ViewState {
  hull: S3HullId;
  view: string;
  overlay: Overlay;
  depth: Depth;
  cockpit: boolean;
  fold: number;
  cargo: boolean;
  ramp: number;
  configuration: "compact" | "medium";
  openSlot: -1 | 0 | 1;
  sockets: boolean;
  panel: boolean;
}

const params = new URLSearchParams(location.search);
const state: ViewState = {
  hull: (params.get("hull") as S3HullId) ?? "hush",
  view: params.get("view") ?? "three-quarter",
  overlay: (params.get("overlay") as Overlay) ?? "none",
  depth: (params.get("depth") as Depth) ?? "deep",
  cockpit: params.get("cockpit") === "1",
  fold: Number(params.get("fold") ?? 0),
  cargo: params.get("cargo") === "1",
  ramp: Number(params.get("ramp") ?? 0),
  configuration: params.get("config") === "medium" ? "medium" : "compact",
  openSlot: (Number(params.get("slot") ?? -1) as -1 | 0 | 1),
  sockets: params.get("sockets") === "1",
  panel: params.get("panel") !== "0",
};

/** Camera presets: orbit (alpha, beta, radius scale) or an interior eye point. */
const ORBITS: Record<string, readonly [number, number, number]> = {
  "three-quarter": [-2.2, 1.12, 1], side: [Math.PI, 1.5, 1], front: [-Math.PI / 2, 1.35, .95],
  rear: [Math.PI / 2, 1.3, .95], top: [-Math.PI / 2, .12, 1.1], below: [-2.4, 2.35, 1],
  "rear-quarter": [.9, 1.15, 1],
};
/** Carrier-local standing eyes (y = deck 4 + 1.62) and look targets. */
const ROOMS: Record<string, readonly [readonly [number, number, number], readonly [number, number, number]]> = {
  bridge: [[0, 5.62, -6.2], [0, 5.6, -12]],
  "bridge-aft": [[0, 5.62, -10.6], [0, 5.2, -5]],
  fabrication: [[-2.4, 5.62, -4.4], [-6.2, 5.0, -6.2]],
  stores: [[2.4, 5.62, -4.2], [6.2, 5.2, -6.0]],
  passage: [[.05, 5.62, -4.6], [.05, 5.4, 6]],
  galley: [[-.4, 5.62, 6.4], [-6, 4.9, 8.4]],
  cabin: [[-1.2, 5.62, 8.2], [-5.2, 5.0, 11.8]],
  vestibule: [[2.2, 5.62, 6.6], [6.2, 5.0, 10.4]],
  "vestibule-hatch": [[3.4, 5.62, 9.4], [6.3, 5.1, 9]],
};

const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
const { water, sky } = createAtmosphere(scene);
const labels = new LabelMaterials(scene);
const instrumentation = new SceneInstrumentation(scene);
const orbit = new ArcRotateCamera("viewer.orbit", -2.2, 1.1, 14, Vector3.Zero(), scene);
orbit.minZ = .05; orbit.maxZ = 450; orbit.fov = 1.02; orbit.wheelPrecision = 20; orbit.lowerRadiusLimit = 1;
const eye = new FreeCamera("viewer.eye", Vector3.Zero(), scene);
eye.minZ = .05; eye.maxZ = 450; eye.fov = 1.02; eye.speed = .15;
orbit.attachControl(canvas, true);

let built: Mesh[] = [], overlays: LinesMesh[] = [], origin = new Vector3();

function boxLines(b: Box, color: string): LinesMesh {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, p = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const lines = [[p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1), p(x0, y0, z0)],
    [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1), p(x0, y1, z0)],
    [p(x0, y0, z0), p(x0, y1, z0)], [p(x1, y0, z0), p(x1, y1, z0)], [p(x1, y0, z1), p(x1, y1, z1)], [p(x0, y0, z1), p(x0, y1, z1)]];
  const mesh = CreateLineSystem("viewer.overlay", { lines }, scene);
  mesh.color = Color3.FromHexString(color); mesh.renderingGroupId = 2; mesh.isPickable = false;
  return mesh;
}
function circleLines(radius: number, y: number, color: string): LinesMesh {
  const ring = Array.from({ length: 65 }, (_, i) => new Vector3(Math.cos(i / 32 * Math.PI) * radius, y, Math.sin(i / 32 * Math.PI) * radius));
  const mesh = CreateLineSystem("viewer.overlay", { lines: [ring] }, scene);
  mesh.color = Color3.FromHexString(color); mesh.renderingGroupId = 2;
  return mesh;
}
const solidBox = (s: InteriorSolid): Box => ({ min: [s.min.x, s.min.y, s.min.z], max: [s.max.x, s.max.y, s.max.z] });

function spec(): HullSpec { return S3_HULLS[state.hull]; }
function pose(): FleetPose {
  return { fold: state.fold, ramp: state.ramp, cargo: state.cargo, cockpit: state.cockpit, occupied: state.sockets ? HEARTHLINE_SOCKETS.map((k) => k.id) : [] };
}

function rebuild(): void {
  for (const m of built) m.dispose(false, false);
  for (const o of overlays) o.dispose();
  built = []; overlays = [];
  const s = spec(), deep = state.depth === "deep";
  // Spindle rides the surface; the others are shown at 30 m or awash.
  origin = new Vector3(0, state.hull === "spindle" ? -.4 : deep ? -30 : state.hull === "hearthline" ? -2.6 : .25, 0);
  const id = `viewer.${state.hull}`, root = fleetHullArt(scene, cel, glass, id, state.hull, labels);
  const roots = [root];
  if (state.hull === "hearthline")
    roots.push(hearthlineShellArt(scene, cel, glass, id, state.configuration, state.openSlot < 0 ? undefined : state.openSlot as 0 | 1, labels));
  for (const r of roots) { r.position.copyFrom(origin); r.computeWorldMatrix(true); }
  built = roots;
  setFleetPose(root, state.hull, id, pose());
  const add = (o: LinesMesh): void => { o.position.copyFrom(origin); overlays.push(o); };
  const c = s.collider;
  if (state.overlay === "collider") {
    add(boxLines({ min: [-c.radius, c.bottom ?? 0, -c.radius], max: [c.radius, c.height, c.radius] }, "#ff6b5a"));
    add(circleLines(c.radius, c.bottom ?? 0, "#ffb08a"));
  } else if (state.overlay === "berth" && s.berth) {
    const e = s.berth.envelope;
    add(boxLines({ min: [-e.halfWidth, 0, -e.halfLength], max: [e.halfWidth, e.height, e.halfLength] }, "#f2b94d"));
  } else if (state.overlay === "contact") {
    for (const part of contactParts(state.hull, fleetContactPose(root))) add(boxLines(part, "#7df0c8"));
  } else if (state.overlay === "solids" && s.id === "hearthline") {
    for (const f of HEARTHLINE_FIXTURES) add(boxLines(solidBox(f), "#7df0c8"));
    for (const k of HEARTHLINE_SOCKETS) add(boxLines(solidBox(k.footprint), "#f2b94d"));
  }
  const report = hullFit(roots, s, describe(), {
    berth: !!s.berth && (s.id !== "spindle" || state.fold >= 1),
    pose: fleetContactPose(root),
  });
  (document.getElementById("report") as HTMLPreElement).textContent = formatFit(report);
  canvas.dataset.fitIssues = String(report.issues.length);
  aim();
}

function describe(): string {
  const bits = [state.hull === "spindle" ? (state.fold >= 1 ? "folded" : state.fold <= 0 ? "deployed" : `fold ${state.fold}`) : "",
    state.hull === "spindle" && state.ramp > 0 ? "ramp open" : "",
    state.hull === "hearthline" ? `${state.configuration}${state.openSlot >= 0 ? ` slot ${state.openSlot} open` : ""}` : "",
    state.cockpit ? "cockpit" : ""].filter(Boolean);
  return bits.join(", ") || "default";
}

let sheet: (ArcRotateCamera | FreeCamera)[] = [];
const ROOM_SHEETS: Record<string, readonly string[]> = {
  "rooms-fore": ["bridge", "bridge-aft", "fabrication", "stores"],
  "rooms-aft": ["passage", "galley", "cabin", "vestibule"],
};
function aim(): void {
  for (const c of sheet) c.dispose();
  sheet = []; scene.activeCameras = [];
  const s = spec(), room = ROOMS[state.view];
  const rooms = ROOM_SHEETS[state.view];
  if (rooms && s.id === "hearthline") {
    for (const [k, name] of rooms.entries()) {
      const [p, t] = ROOMS[name]!;
      const c = new FreeCamera(`viewer.sheet.${name}`, new Vector3(...p).add(origin), scene);
      c.setTarget(new Vector3(...t).add(origin));
      c.minZ = .05; c.maxZ = 450; c.fov = 1.1;
      c.viewport = new Viewport((k % 2) * .5, k < 2 ? .5 : 0, .5, .5);
      sheet.push(c);
    }
    orbit.detachControl(); eye.detachControl();
    scene.activeCameras = sheet;
    return;
  }
  if (state.view === "sheet") {
    // Four orbit views in quadrants: one screenshot per hull.
    const size = Math.max(s.dimensions.length, s.dimensions.beam);
    const target = origin.add(new Vector3(0, s.dimensions.height * .45 + (s.collider.bottom ?? 0), 0));
    for (const [k, name] of ["three-quarter", "rear-quarter", "side", "top"].entries()) {
      const [alpha, beta, f] = ORBITS[name]!;
      const c = new ArcRotateCamera(`viewer.sheet.${name}`, alpha, beta, size * f * 1.05, target, scene);
      c.minZ = .05; c.maxZ = 450; c.fov = .9;
      c.viewport = new Viewport((k % 2) * .5, k < 2 ? .5 : 0, .5, .5);
      sheet.push(c);
    }
    orbit.detachControl(); eye.detachControl();
    scene.activeCameras = sheet;
    return;
  }
  if (room && s.id === "hearthline") {
    scene.activeCamera = eye; orbit.detachControl(); eye.attachControl(true);
    eye.position = new Vector3(...room[0]).add(origin);
    eye.setTarget(new Vector3(...room[1]).add(origin));
    return;
  }
  if (state.view === "pilot") {
    scene.activeCamera = eye; orbit.detachControl(); eye.attachControl(true);
    eye.position = new Vector3(...s.seat).add(origin);
    eye.setTarget(eye.position.add(new Vector3(0, -.12, -1)));
    return;
  }
  eye.detachControl(); orbit.attachControl(canvas, true); scene.activeCamera = orbit;
  const [alpha, beta, k] = ORBITS[state.view] ?? ORBITS["three-quarter"]!;
  const size = Math.max(s.dimensions.length, s.dimensions.beam);
  orbit.target = origin.add(new Vector3(0, s.dimensions.height * .45 + (s.collider.bottom ?? 0), 0));
  orbit.alpha = alpha; orbit.beta = beta; orbit.radius = size * 1.05 * k;
}

function panel(): void {
  const el = document.getElementById("panel")!;
  el.classList.toggle("hidden", !state.panel);
  document.getElementById("report")!.classList.toggle("hidden", !state.panel);
  const group = (legend: string, items: [string, boolean, () => void][]): string => {
    const id = legend.replace(/\W/g, "");
    queueMicrotask(() => items.forEach(([, , f], i) => document.getElementById(`${id}${i}`)!.addEventListener("click", () => { f(); sync(); })));
    return `<fieldset><legend>${legend}</legend>${items.map(([label, on], i) =>
      `<button id="${id}${i}" aria-pressed="${on}">${label}</button>`).join("")}</fieldset>`;
  };
  const views = ["sheet", ...Object.keys(ORBITS), ...(state.hull === "hearthline" ? [...Object.keys(ROOM_SHEETS), ...Object.keys(ROOMS)] : ["pilot"])];
  el.innerHTML = `<h1>S3 FLEET VIEWER</h1>` +
    group("Hull", (Object.keys(S3_HULLS) as S3HullId[]).map((h) => [S3_HULLS[h].label, state.hull === h, () => { state.hull = h; state.view = "three-quarter"; }])) +
    group("View", views.map((v) => [v, state.view === v, () => { state.view = v; }])) +
    group("Overlay", (["none", "collider", "berth", "contact", "solids"] as Overlay[]).map((o) => [o, state.overlay === o, () => { state.overlay = o; }])) +
    group("Water", (["deep", "surface"] as Depth[]).map((d) => [d, state.depth === d, () => { state.depth = d; }])) +
    group("State", [
      ["cockpit", state.cockpit, () => { state.cockpit = !state.cockpit; }],
      ...(state.hull === "spindle" ? [["folded", state.fold >= 1, () => { state.fold = state.fold >= 1 ? 0 : 1; }],
        ["half-fold", state.fold === .5, () => { state.fold = .5; }],
        ["cargo", state.cargo, () => { state.cargo = !state.cargo; }],
        ["ramp", state.ramp > 0, () => { state.ramp = state.ramp > 0 ? 0 : 1; }]] as [string, boolean, () => void][] : []),
      ...(state.hull === "hearthline" ? [["compact", state.configuration === "compact", () => { state.configuration = "compact"; }],
        ["medium", state.configuration === "medium", () => { state.configuration = "medium"; }],
        ["open slot 0", state.openSlot === 0, () => { state.openSlot = state.openSlot === 0 ? -1 : 0; }],
        ["sockets full", state.sockets, () => { state.sockets = !state.sockets; }]] as [string, boolean, () => void][] : []),
    ]);
}

function sync(): void {
  const q = new URLSearchParams({ hull: state.hull, view: state.view, overlay: state.overlay, depth: state.depth,
    cockpit: state.cockpit ? "1" : "0", fold: String(state.fold), cargo: state.cargo ? "1" : "0", ramp: String(state.ramp), config: state.configuration,
    slot: String(state.openSlot), sockets: state.sockets ? "1" : "0", panel: state.panel ? "1" : "0" });
  history.replaceState(null, "", `?${q}`);
  rebuild(); panel();
}

let time = 0;
/** Optics follow each rendering camera (the sheet draws four per frame). */
function optics(p: Vector3): void {
  const hearth = state.hull === "hearthline";
  const local = p.subtract(origin);
  const dry = hearth && Math.abs(local.x) < 6.3 && local.y > 3.8 && local.y < 8.4 && Math.abs(local.z) < 12;
  const underwater = p.y < -.08 && !dry ? 1 : 0;
  const materials = [cel, glass, water, sky];
  updateOpticalUniforms(materials, p, null);
  for (const m of materials) {
    // The carrier's dry interval follows the displayed hull, as in play.
    m.setFloat("carrierPresent", hearth ? 1 : 0);
    m.setVector3("carrierPosition", origin);
    m.setFloat("carrierYaw", 0);
    m.setVector3("carrierAirMin", new Vector3(CARRIER_LAYOUT.deck.min.x, CARRIER_LAYOUT.deck.max.y, CARRIER_LAYOUT.deck.min.z));
    m.setVector3("carrierAirMax", new Vector3(CARRIER_LAYOUT.deck.max.x, CARRIER_LAYOUT.compact[0].max.y, CARRIER_LAYOUT.deck.max.z));
  }
  cel.setFloat("underwater", underwater);
  const fog = Color3.FromHexString(dry ? "#486e76" : underwater ? "#226e7e" : "#96c5b9");
  scene.clearColor = new Color4(fog.r, fog.g, fog.b, 1);
}
scene.onBeforeCameraRenderObservable.add((camera) => optics(camera.position));
engine.runRenderLoop(() => {
  time += engine.getDeltaTime() / 1000;
  cel.setFloat("time", time); water.setFloat("time", time);
  scene.render();
  canvas.dataset.draws = String(instrumentation.drawCallsCounter.current);
  canvas.dataset.meshes = String(scene.meshes.length);
  canvas.dataset.vertices = String(built.reduce((n, m) => n + m.getTotalVertices() + m.getChildMeshes(false).reduce((k, c) => k + c.getTotalVertices(), 0), 0));
  canvas.dataset.ready = "true";
});
addEventListener("resize", () => engine.resize());
sync();
