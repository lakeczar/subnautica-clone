/** CY cycles lab (dev only): currents and the four candidate cycles in a flat
 * sandbox with placeholder art, run by the same Babylon-free stepper the tests
 * use (src/sim/currents/sandbox.ts). Run under Vite on your own port:
 *   npx vite --port <port> --strictPort --host 127.0.0.1
 *   open http://127.0.0.1:<port>/tools/cycles-lab.html
 * Drag to look. WASD swim/drive, Space/C up/down, Shift boost, Z quiet,
 * H hold (station keeping) on/off, G grapple (Creel), E pick, T turbine stub,
 * 1–7 diver/dart/creel/hush/spindle/mantle/hearthline, [ ] time ×1/×4, P plan view.
 * URL: ?station=a|b|c|d|edge|start&actor=<id>&jump=<cycle>:<phase>&view=plan&streaks=0&hud=0&loop=message
 * `window.cyclesLab` exposes the state and helpers for scripted runs. */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder.js";
import { ACTORS } from "../src/content/currents/actors.js";
import type { ActorId } from "../src/content/currents/actors.js";
import { CYCLE_BY_ID } from "../src/content/currents/cycles.js";
import { BLOOM, CANDIDATES, LAB_SOLIDS, LAB_START, LAB_VOLUMES, VENT_COLUMN, WARDEN } from "../src/content/currents/lab.js";
import { FixedStepClock } from "../src/sim/clock.js";
import { period, secondsAt, secondsUntil, TICKS_PER_SECOND } from "../src/sim/cycles/cycle.js";
import { journalEntry } from "../src/sim/cycles/observe.js";
import { shapeBounds } from "../src/sim/currents/flow.js";
import { createSandbox, initialSandbox, stepSandbox } from "../src/sim/currents/sandbox.js";
import type { SandboxInput, SandboxReadout } from "../src/sim/currents/sandbox.js";
import type { Vec3 } from "../src/sim/types.js";

const params = new URLSearchParams(location.search);
const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.05, 0.2, 0.26, 1);
scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = 0.006; scene.fogColor = new Color3(0.05, 0.2, 0.26);
const camera = new FreeCamera("cy.camera", new Vector3(LAB_START.x, LAB_START.y + 6, LAB_START.z + 14), scene);
camera.minZ = 0.1; camera.maxZ = 700; camera.fov = 1;
new HemisphericLight("cy.light", new Vector3(0.3, 1, 0.2), scene).intensity = 0.95;

const lab = createSandbox();
const v3 = (p: Vec3): Vector3 => new Vector3(p.x, p.y, p.z);
const material = (name: string, color: string, alpha = 1, emissive = 0.15): StandardMaterial => {
  const m = new StandardMaterial(`cy.${name}`, scene), c = Color3.FromHexString(color);
  m.diffuseColor = c; m.emissiveColor = c.scale(emissive); m.specularColor = Color3.Black(); m.alpha = alpha;
  return m;
};
const box = (name: string, min: Vec3, max: Vec3, m: StandardMaterial): Mesh => {
  const b = CreateBox(name, { width: max.x - min.x, height: max.y - min.y, depth: max.z - min.z }, scene);
  b.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2); b.material = m; b.isPickable = false;
  return b;
};

// --- Placeholder world --------------------------------------------------------
const rockColors: Record<string, string> = { gully: "#6f6a5c", vent: "#5d4a44", pocket: "#4f5f52", edge: "#6a6470", floor: "#3c4c4a" };
for (const s of LAB_SOLIDS) box(s.id, s.min, s.max, material(s.id, rockColors[s.id.split(".")[1]!] ?? "#666666"));
const surface = box("cy.surface", { x: -76, y: -0.05, z: -320 }, { x: 248, y: 0, z: 66 }, material("surface", "#8fd3d8", 0.18, 0.4));
surface.renderingGroupId = 1;

function boxLines(min: Vec3, max: Vec3): Vector3[][] {
  const c = (x: number, y: number, z: number) => new Vector3(x ? max.x : min.x, y ? max.y : min.y, z ? max.z : min.z);
  return ([[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const)
    .map(([a, b]) => [c(a & 1, (a >> 1) & 1, a >> 2), c(b & 1, (b >> 1) & 1, b >> 2)]);
}
const outline: Vector3[][] = [];
for (const vol of LAB_VOLUMES) {
  if (vol.shape.kind === "box" && !vol.shape.yaw) {
    const c = vol.shape.center, h = vol.shape.half;
    outline.push(...boxLines({ x: c.x - h.x, y: c.y - h.y, z: c.z - h.z }, { x: c.x + h.x, y: c.y + h.y, z: c.z + h.z }));
  } else {
    const b = shapeBounds(vol.shape);
    outline.push(...boxLines(b.min, b.max));
  }
  for (const lee of vol.lees ?? []) outline.push(...boxLines(lee.min, lee.max));
}
const outlines = CreateLineSystem("cy.volumes", { lines: outline }, scene);
outlines.color = new Color3(0.45, 0.8, 0.95); outlines.alpha = 0.35; outlines.isPickable = false;

// Candidate props.
const ventMat = material("vent", "#ff7a2a", 0.3, 1);
const vent = box("cy.vent", VENT_COLUMN.min, VENT_COLUMN.max, ventMat); vent.renderingGroupId = 1;
const bed = (name: string, at: Vec3, color: string) => {
  const m = CreateCylinder(name, { diameter: 6, height: 1.2 }, scene); m.position.set(at.x, at.y - 1.2, at.z); m.material = material(name, color, 1, 0.3); return m;
};
const bloomBed = bed("cy.bloom", BLOOM.bed, "#3fe0c0"), bloomMat = bloomBed.material as StandardMaterial;
bed("cy.ordinary", BLOOM.ordinary, "#7f8f88"); bed("cy.node", WARDEN.node, "#d8c060"); bed("cy.flatbed", WARDEN.ordinary, "#7f8f88");
const warden = CreateSphere("cy.warden", { diameter: 5 }, scene); warden.material = material("warden", "#e0704a", 1, 0.4);
const ring: Vector3[] = [];
for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; ring.push(new Vector3(WARDEN.den.x + Math.cos(a) * WARDEN.territory, WARDEN.den.y, WARDEN.den.z + Math.sin(a) * WARDEN.territory)); }
const routes: Vector3[][] = [ring];
const routeColors: Color4[][] = [ring.map(() => new Color4(1, 0.5, 0.3, 1))];
for (const c of CANDIDATES) {
  routes.push(c.direct.map(v3)); routeColors.push(c.direct.map(() => new Color4(1, 0.9, 0.3, 1)));
  routes.push(c.alternative.map(v3)); routeColors.push(c.alternative.map(() => new Color4(0.4, 1, 0.5, 1)));
}
const routeLines = CreateLineSystem("cy.routes", { lines: routes, colors: routeColors }, scene); routeLines.renderingGroupId = 2;

// --- The actor -----------------------------------------------------------------
let state = initialSandbox((params.get("actor") as ActorId | null) ?? "diver");
let actorMesh: Mesh | null = null;
function buildActor(): void {
  actorMesh?.dispose();
  const a = ACTORS[state.actor], s = a.shape;
  actorMesh = state.actor === "diver"
    ? CreateBox("cy.actor", { width: 0.6, height: s.height, depth: 1.6 }, scene)
    : CreateBox("cy.actor", { width: s.radius * 1.4, height: s.height - (s.bottom ?? 0), depth: s.radius * 2 }, scene);
  actorMesh.material = material(`actor.${state.actor}`, state.actor === "diver" ? "#f2d25c" : "#e8e4d8", 1, 0.35);
}
buildActor();
let grappleLine: LinesMesh | null = null;

// --- Flow streaks ---------------------------------------------------------------
const STREAKS = params.get("streaks") === "0" ? 0 : 700;
const seeds = LAB_VOLUMES.map(vol => shapeBounds(vol.shape));
let rng = 12345;
const random = (): number => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const streaks = Array.from({ length: STREAKS }, () => ({ p: { x: 0, y: 0, z: 0 }, age: 0 }));
const reseed = (s: { p: Vec3; age: number }): void => {
  const b = seeds[Math.floor(random() * seeds.length)]!;
  s.p = { x: b.min.x + random() * (b.max.x - b.min.x), y: Math.min(-1, b.min.y + random() * (b.max.y - b.min.y)), z: b.min.z + random() * (b.max.z - b.min.z) };
  s.age = Math.floor(random() * 90);
};
streaks.forEach(reseed);
let streakMesh: LinesMesh | null = null;
function updateStreaks(dt: number): void {
  if (!STREAKS || !ui.streaks) { streakMesh?.setEnabled(false); return; }
  const lines: Vector3[][] = [];
  for (const s of streaks) {
    const f = lab.field.sample(s.p, state.tick).flow, speed = Math.hypot(f.x, f.y, f.z);
    s.p = { x: s.p.x + f.x * dt, y: s.p.y + f.y * dt, z: s.p.z + f.z * dt }; s.age++;
    if (speed < 0.05 || s.age > 150) reseed(s);
    lines.push([v3(s.p), new Vector3(s.p.x - f.x * 0.35, s.p.y - f.y * 0.35, s.p.z - f.z * 0.35)]);
  }
  streakMesh = streakMesh ? CreateLineSystem("cy.streaks", { lines, instance: streakMesh }, scene)
    : CreateLineSystem("cy.streaks", { lines, updatable: true }, scene);
  streakMesh.color = new Color3(0.85, 0.97, 1); streakMesh.setEnabled(true); streakMesh.isPickable = false;
}

// --- Controls -----------------------------------------------------------------
const ui = { hold: true, streaks: true, scale: 1, plan: params.get("view") === "plan", yaw: 0, pitch: -0.15 };
const keys = new Set<string>();
const edges = new Set<string>();
window.addEventListener("keydown", e => {
  if (!keys.has(e.code)) edges.add(e.code);
  keys.add(e.code);
  const digit = /^Digit[1-7]$/.test(e.code) ? Number(e.code.slice(5)) - 1 : -1;
  if (digit >= 0) setActor((Object.keys(ACTORS) as ActorId[])[digit]!);
  if (e.code === "KeyH") ui.hold = !ui.hold;
  if (e.code === "KeyT") state.turbine = !state.turbine;
  if (e.code === "BracketLeft") ui.scale = 1;
  if (e.code === "BracketRight") ui.scale = 4;
  if (e.code === "KeyP") ui.plan = !ui.plan;
  sync();
});
window.addEventListener("keyup", e => keys.delete(e.code));
let drag: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; });
window.addEventListener("pointerup", () => { drag = null; });
window.addEventListener("pointermove", e => {
  if (!drag) return;
  ui.yaw += (e.clientX - drag.x) * 0.005; ui.pitch = Math.max(-1.3, Math.min(1.3, ui.pitch - (e.clientY - drag.y) * 0.005));
  drag = { x: e.clientX, y: e.clientY };
});
const axis = (plus: string, minus: string): number => (keys.has(plus) ? 1 : 0) - (keys.has(minus) ? 1 : 0);
function input(): SandboxInput {
  const out: SandboxInput = {
    forward: axis("KeyW", "KeyS"), right: axis("KeyD", "KeyA"), vertical: axis("Space", "KeyC"),
    yaw: ui.yaw, pitch: state.actor === "diver" ? ui.pitch : 0,
    sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"), quiet: keys.has("KeyZ"), hold: ui.hold ? "station" : "off",
    grapple: edges.has("KeyG"), pick: edges.has("KeyE"),
  };
  edges.clear();
  return out;
}

const STATIONS: Record<string, { label: string; at: Vec3; yaw: number }> = {
  start: { label: "Start", at: LAB_START, yaw: 0 },
  a: { label: "a · vent passage", at: { x: 186, y: -20, z: -64 }, yaw: 0 },
  b: { label: "b · gully spill", at: { x: 83, y: -24, z: -10 }, yaw: 0 },
  c: { label: "c · lantern bloom", at: { x: 20, y: -30, z: -84 }, yaw: 0 },
  d: { label: "d · warden pocket", at: { x: 100, y: -30, z: -163 }, yaw: 0 },
  edge: { label: "adverse · cliff race", at: { x: 16, y: -25, z: -142 }, yaw: Math.PI / 2 },
};
function go(name: string): void {
  const st = STATIONS[name]; if (!st) return;
  state.position = { ...st.at }; state.velocity = { x: 0, y: 0, z: 0 }; state.grapple = null; ui.yaw = st.yaw;
}
function setActor(id: ActorId): void {
  const keep = { tick: state.tick, observations: state.observations, position: state.position };
  state = { ...initialSandbox(id, keep.position), tick: keep.tick, observations: keep.observations };
  buildActor(); sync();
}
/** Jump time to the next start of a cycle's phase (all cycles move with it). */
function jump(cycleId: string, phase: string): void {
  const c = CYCLE_BY_ID.get(cycleId); if (!c) return;
  state.tick += Math.ceil(secondsUntil(c, secondsAt(state.tick), phase) * TICKS_PER_SECOND);
}

const panel = document.getElementById("panel")!, status = document.getElementById("status")!;
const buttons = document.getElementById("buttons")!;
const lit: [HTMLButtonElement, () => boolean][] = [];
const button = (label: string, act: () => void, on?: () => boolean): void => {
  const b = document.createElement("button"); b.textContent = label;
  b.onclick = () => { act(); sync(); };
  if (on) lit.push([b, on]);
  buttons.appendChild(b);
};
for (const [k, st] of Object.entries(STATIONS)) button(st.label, () => go(k));
buttons.appendChild(document.createElement("br"));
for (const id of Object.keys(ACTORS) as ActorId[]) button(id, () => setActor(id), () => state.actor === id);
buttons.appendChild(document.createElement("br"));
button("hold (H)", () => { ui.hold = !ui.hold; }, () => ui.hold);
button("turbine (T)", () => { state.turbine = !state.turbine; }, () => state.turbine);
button("streaks", () => { ui.streaks = !ui.streaks; }, () => ui.streaks);
button("time ×4", () => { ui.scale = ui.scale === 1 ? 4 : 1; }, () => ui.scale === 4);
button("plan (P)", () => { ui.plan = !ui.plan; }, () => ui.plan);
buttons.appendChild(document.createElement("br"));
for (const c of CANDIDATES) {
  const def = CYCLE_BY_ID.get(c.cycle)!;
  for (const p of def.phases.filter(p => p.level !== undefined)) button(`${c.letter}→${p.label}`, () => jump(def.id, p.id));
}
function sync(): void {
  for (const [b, on] of lit) b.classList.toggle("on", on());
}
sync();
document.getElementById("hide")!.onclick = () => panel.classList.toggle("hidden");
if (params.get("hud") === "0") panel.classList.add("hidden");
if (params.get("station")) go(params.get("station")!);
const jumpTo = params.get("jump")?.split(":");
if (jumpTo?.length === 2) jump(jumpTo[0]!, jumpTo[1]!);

// --- Loop -----------------------------------------------------------------------
const clock = new FixedStepClock();
let last: SandboxReadout | null = null, frame = 0;
const log: string[] = [];
function update(): void {
  for (let i = 0; i < ui.scale; i++) {
    last = stepSandbox(state, i === 0 ? input() : { ...input(), grapple: false, pick: false }, lab);
    for (const e of last.events) {
      const text = e.type === "cycle-seen" ? `Journal: ${CYCLE_BY_ID.get(e.cycleId)!.label} seen`
        : e.type === "cycle-measured" ? `Journal: ${CYCLE_BY_ID.get(e.cycleId)!.label} · ${e.phase} timed${e.complete ? " (full cycle)" : ""}`
        : e.type === "pick" ? `Picked ${e.units} at the ${e.bed} bed` : e.message;
      log.unshift(`${secondsAt(state.tick).toFixed(0)} s  ${text}`); log.length = Math.min(log.length, 6);
    }
  }
}
const f1 = (n: number) => n.toFixed(1), f2 = (n: number) => n.toFixed(2);
const vec = (p: Vec3) => `${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)}`;
function render(): void {
  clock.advance(performance.now(), document.visibilityState === "visible" || params.get("loop") === "message", update);
  const p = state.position, a = ACTORS[state.actor];
  actorMesh!.position.set(p.x, p.y + (a.shape.height + (a.shape.bottom ?? 0)) / 2, p.z);
  actorMesh!.rotation.y = -ui.yaw;
  if (ui.plan) { camera.position.set(p.x, 120, p.z + 0.01); camera.setTarget(new Vector3(p.x, -40, p.z)); }
  else {
    const back = state.actor === "diver" ? 7 : Math.max(12, a.shape.radius * 4);
    const dir = new Vector3(Math.sin(ui.yaw) * Math.cos(ui.pitch), Math.sin(ui.pitch), -Math.cos(ui.yaw) * Math.cos(ui.pitch));
    camera.position.copyFrom(v3(p).subtract(dir.scale(back)).add(new Vector3(0, back * 0.3, 0)));
    camera.setTarget(v3(p).add(new Vector3(0, a.shape.height * 0.6, 0)));
  }
  const tick = state.tick;
  const pulse = CYCLE_BY_ID.get(VENT_COLUMN.cycle)!, bloom = CYCLE_BY_ID.get(BLOOM.cycle)!;
  const ventLevel = last?.cycles[pulse.id]?.level ?? 0;
  ventMat.alpha = 0.12 + 0.55 * ventLevel; ventMat.emissiveColor = new Color3(1, 0.35 + 0.3 * ventLevel, 0.1).scale(0.4 + 0.6 * ventLevel);
  const bloomLevel = last?.cycles[bloom.id]?.level ?? 0;
  bloomMat.emissiveColor = new Color3(0.2, 0.9, 0.75).scale(0.1 + 1.2 * bloomLevel);
  bloomBed.scaling.set(1 + bloomLevel, 1 + 2 * bloomLevel, 1 + bloomLevel);
  if (last) warden.position.copyFrom(v3(last.warden));
  grappleLine?.dispose(); grappleLine = null;
  if (state.grapple) { grappleLine = CreateLineSystem("cy.line", { lines: [[v3(p), v3(state.grapple.anchor)]] }, scene); grappleLine.color = new Color3(1, 1, 0.6); }
  updateStreaks(1 / 60);
  scene.render();
  frame++;
  canvas.dataset.frame = String(frame);
  if (last && frame % 10 === 0) status.textContent = describe(last, tick);
}
function describe(r: SandboxReadout, tick: number): string {
  const a = ACTORS[state.actor], diver = state.actor === "diver";
  const lines = [
    `${state.actor}  ${vec(state.position)}  t ${f1(secondsAt(tick))} s ×${ui.scale}`,
    `flow ${f2(r.flowSpeed)} m/s (${vec(r.flow)})  drift ${f2(Math.hypot(r.response.drift.x, r.response.drift.y, r.response.drift.z))} m/s`,
    `effort ${(r.response.effort * 100).toFixed(0)}%  headwind ${f2(r.response.headwind)}  hold ${r.hold}${r.response.overpowered ? " (overpowered)" : ""}`,
    diver ? `air ${f1(state.oxygen)}%  health ${f1(state.health)}  heat ${f1(state.heat)}  (no battery: currents cost time, never health)`
      : `charge ${f2(state.charge)}%  drain ${(r.drain).toFixed(3)} %/s (+${r.response.extraDrain.toFixed(3)} current)  turbine ${state.turbine ? `+${r.turbine.toFixed(3)}` : "off"}  health ${f1(state.health)}`,
    `vent heat ${f2(r.ventHeat)} vs tolerance ${f2(a.heat)}  bloom picks left ${r.bloomLeft}  warden ${r.wardenShove ? "SHOOING YOU" : "calm"}  node ${r.nodeLeft}`,
    "",
  ];
  for (const c of CANDIDATES) {
    const def = CYCLE_BY_ID.get(c.cycle)!, s = r.cycles[def.id]!;
    const warn = s.warnings[0] ? `  ⚠ in ${f1(s.warnings[0].inS)} s: ${s.warnings[0].cue}` : "";
    lines.push(`${c.letter} ${def.label}: ${def.phases[s.index]!.label} ${(s.level * 100).toFixed(0)}% · ${f1(s.remaining)} s left of ${period(def)} s · ${r.open[c.id] ? "OPEN" : "closed"}${warn}`);
  }
  lines.push("", "Journal (cycles tab):");
  for (const c of CANDIDATES) {
    const rec = state.observations[c.cycle];
    if (!rec) continue;
    const j = journalEntry(CYCLE_BY_ID.get(c.cycle)!, rec);
    lines.push(`  ${j.label}: ${j.phases.map(p => `${p.label} ${p.seconds === null ? "?" : `${p.seconds} s`}`).join(", ")}${j.periodS ? ` · every ${j.periodS} s` : ""}`);
  }
  if (log.length) lines.push("", ...log);
  return lines.join("\n");
}
// Background preview tabs throttle rAF; `loop=message` drives frames directly.
if (params.get("loop") === "message") {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { engine.beginFrame(); render(); engine.endFrame(); setTimeout(() => channel.port2.postMessage(0), 16); };
  channel.port2.postMessage(0);
} else engine.runRenderLoop(render);
window.addEventListener("resize", () => engine.resize());
const settle = (n = 4): Promise<void> => new Promise(done => {
  const until = frame + n, poll = (): void => { if (frame >= until) done(); else setTimeout(poll, 30); };
  poll();
});
/** Scripted steps with a fixed input, outside the clock. */
function step(n: number, held: SandboxInput = {}): SandboxReadout {
  for (let i = 0; i < n; i++) last = stepSandbox(state, held, lab);
  return last!;
}
Object.assign(window, { cyclesLab: { get state() { return state; }, lab, ui, go, setActor, jump, step, settle, scene, camera } });
