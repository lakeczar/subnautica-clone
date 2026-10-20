import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createCelMaterial } from "../materials.js";
import { ArtBatch } from "../geometry.js";
import { PALETTE as P } from "../palette.js";
import { createCreatureLayer } from "./layer.js";
import { Display } from "./kit.js";
import { CUE_SPECIES, THREATS } from "../../content/ecology/species.js";
import type { Deterrent, ThreatAgentId } from "../../content/ecology/species.js";
import { createEcology, ecologyView, stepEcology } from "../../sim/ecology/ecology.js";
import { homeOf, layerY, speciesOf } from "../../sim/ecology/agents.js";
import { cueHome } from "../../sim/ecology/cues.js";
import { openWater } from "../../sim/ecology/adapter.js";
import { protectionFor, sampleHazards } from "../../sim/ecology/hazards.js";
import type { AgentMode, EcologyCommand, EcologyEvent, EcologyState, Stimulus } from "../../sim/ecology/types.js";
import type { HullId } from "../../content/registry.js";
import type { Vec3 } from "../../sim/types.js";

/** Dev-only creature viewer (tools/creature-viewer.html, port 5197). It runs
 * the real pure ecology step against open water with a controllable player
 * marker, or poses one animal in a chosen mode. URL parameters make every
 * frame reproducible: ?scenario=stalker&at=9.4&lamp=1&noise=0.48&move=hold. */
interface Scenario {
  label: string;
  focus: ThreatAgentId | null;
  look: Vec3;
  player: Vec3;
  hull: HullId | null;
  noise: number;
  lamp: boolean;
  /** Direction the "approach" control moves the player. */
  toward: Vec3;
  velocity?: Vec3;
  start?: number;
  camera: [radius: number, alpha: number, beta: number];
}
const add = (a: Vec3, x = 0, y = 0, z = 0): Vec3 => ({ x: a.x + x, y: a.y + y, z: a.z + z });
const SCENARIOS: Record<string, Scenario> = {
  stalker: {
    label: "Glare stalker · Ember Rift warm passage", focus: "rift_stalker_passage", look: add(homeOf("rift_stalker_passage"), 9, 0, 0),
    player: add(homeOf("rift_stalker_passage"), 18, 0, 0), hull: "dart", noise: 0.48, lamp: true, toward: { x: -1, y: 0, z: 0 }, camera: [22, -2.2, 1.25],
  },
  skate: {
    label: "Layer skate · Mirror Divide saddle", focus: "divide_skate_saddle", look: add(homeOf("divide_skate_saddle"), 3, 3, 0),
    player: { ...add(homeOf("divide_skate_saddle"), 6, 0, 0), y: layerY("divide_dense_layer") }, hull: null, noise: 0.14, lamp: true,
    toward: { x: 0, y: -1, z: 0 }, velocity: { x: 0, y: -1.2, z: 0 }, camera: [20, -1.9, 1.38],
  },
  choir: {
    label: "Hollow choir · Meridian service gallery", focus: "district_choir_gallery", look: add(homeOf("district_choir_gallery"), 4, 3, 0),
    player: add(homeOf("district_choir_gallery"), 12, 4, 0), hull: "creel", noise: 0.62, lamp: false, toward: { x: -1, y: 0, z: 0 }, camera: [30, -2.3, 1.2],
  },
  plume: {
    label: "Ember mites and the split chimney plume", focus: null, look: add(cueHome("rift_mites_lip"), -4, 14, 0),
    player: add(cueHome("rift_mites_lip"), 30, 8, 10), hull: null, noise: 0.03, lamp: false, toward: { x: -1, y: 0, z: 0 }, start: 60 * 18, camera: [58, -2.0, 1.32],
  },
  sails: {
    label: "Brine sails above the mirror layer", focus: null, look: add(homeOf("divide_skate_saddle"), -10, 20, -40),
    player: add(homeOf("divide_skate_saddle"), -40, 40, -10), hull: "hush", noise: 0.08, lamp: false, toward: { x: 1, y: 0, z: 0 }, camera: [70, -1.4, 1.25],
  },
};
const NOISE: Record<string, number> = { quiet: 0.03, swim: 0.14, sprint: 0.6, cruise: 0.62, boost: 1 };

export function startCreatureViewer(canvas: HTMLCanvasElement, panel: HTMLElement): void {
  const params = new URLSearchParams(location.search);
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const fog = Color3.FromHexString("#123f55");
  scene.clearColor = Color4.FromColor3(fog, 1);
  const cel = createCelMaterial(scene);
  cel.setFloat("underwater", 1);
  cel.setColor3("waterFogColor", fog);
  cel.setFloat("fogDensity", 0.011);
  const camera = new ArcRotateCamera("viewer.camera", -2, 1.25, 24, Vector3.Zero(), scene);
  camera.minZ = 0.1; camera.maxZ = 600; camera.wheelDeltaPercentage = 0.02;
  camera.attachControl(canvas, true);
  const layer = createCreatureLayer(scene, cel);
  const marker = playerMarker(scene, cel);

  let scenarioId = params.get("scenario") ?? "stalker";
  let sc = SCENARIOS[scenarioId] ?? SCENARIOS.stalker!;
  let state: EcologyState = createEcology(), tick = 0, player = { ...sc.player }, move: "hold" | "approach" | "retreat" | "climb" = "hold";
  let lamp = sc.lamp, noise = sc.noise, pose: AgentMode | null = null, speed = 1, accumulator = 0;
  const pending: EcologyCommand[] = [], log: string[] = [];
  const reset = (id: string): void => {
    scenarioId = id; sc = SCENARIOS[id] ?? SCENARIOS.stalker!;
    state = createEcology(); tick = sc.start ?? 0; player = { ...sc.player }; lamp = sc.lamp; noise = sc.noise; move = "hold"; log.length = 0;
    camera.setTarget(new Vector3(sc.look.x, sc.look.y, sc.look.z));
    [camera.radius, camera.alpha, camera.beta] = sc.camera;
    render();
  };
  const stimulus = (): Stimulus => {
    const v = move === "approach" ? sc.toward : move === "retreat" ? { x: -sc.toward.x, y: -sc.toward.y, z: -sc.toward.z } : move === "climb" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 0 };
    const velocity = move === "hold" ? sc.velocity ?? { x: 0, y: 0, z: 0 } : { x: v.x * 2, y: v.y * 2, z: v.z * 2 };
    return { position: { ...player }, velocity, noise, light: lamp ? (sc.hull ? 0.9 : 0.6) : 0, disturbance: 0, hull: sc.hull, radius: sc.hull ? 3.6 : 0.4, inRefuge: false };
  };
  const step = (): void => {
    const s = stimulus();
    if (move !== "hold") player = { x: player.x + s.velocity.x / 60, y: player.y + s.velocity.y / 60, z: player.z + s.velocity.z / 60 };
    const r = stepEcology(state, { tick, stimulus: s, protection: protectionFor(sc.hull, []), vehicleId: sc.hull ? "viewer-hull" : null, commands: pending.splice(0) }, openWater());
    for (const e of r.events) note(e, tick);
    tick++;
  };
  const note = (e: EcologyEvent, at: number): void => {
    const time = (at / 60).toFixed(1).padStart(5);
    if (e.type === "ecology-cue") log.unshift(`${time}s  ${THREATS[e.species].label} · ${e.cue}${e.sense ? ` (${e.sense})` : ""}: ${e.caption}`);
    else if (e.type === "ecology-strike") log.unshift(`${time}s  ${THREATS[e.species].label} strikes the ${e.target}: −${e.loss}`);
    else log.unshift(`${time}s  ${e.caption}`);
    log.length = Math.min(log.length, 14);
  };
  const deploy = (kind: Deterrent): void => {
    const side = { x: sc.toward.z, y: 0, z: -sc.toward.x };
    const position = kind === "ink" ? { ...player } : kind === "lure" ? add(player, side.x * 10 + sc.toward.x * 6, 0, side.z * 10 + sc.toward.z * 6) : add(player, side.x * 20, 0, side.z * 20);
    pending.push({ type: "deploy", kind, position });
  };

  panel.innerHTML = "";
  const row = (label: string, buttons: [string, () => void][]): void => {
    const div = document.createElement("div"); div.className = "row";
    const l = document.createElement("span"); l.textContent = label; div.append(l);
    for (const [text, fn] of buttons) { const b = document.createElement("button"); b.textContent = text; b.onclick = () => { fn(); render(); }; div.append(b); }
    panel.append(div);
  };
  row("Scene", Object.entries(SCENARIOS).map(([id, s]) => [s.label.split(" · ")[0]!, () => reset(id)]));
  row("Lamp", [["On", () => { lamp = true; }], ["Off", () => { lamp = false; }]]);
  row("Noise", Object.entries(NOISE).map(([k, v]) => [k, () => { noise = v; }]));
  row("Move", [["Hold", () => { move = "hold"; }], ["Approach", () => { move = "approach"; }], ["Retreat", () => { move = "retreat"; }], ["Climb", () => { move = "climb"; }]]);
  row("Deploy", [["Glow lure", () => deploy("lure")], ["Ink", () => deploy("ink")], ["Acoustic", () => deploy("acoustic")]]);
  row("Pose", [["Live", () => { pose = null; }], ...(["rest", "alert", "investigate", "commit", "withdraw"] as const).map(m => [m, () => { pose = m; }] as [string, () => void])]);
  row("Time", [["Pause", () => { speed = 0; }], ["1×", () => { speed = 1; }], ["4×", () => { speed = 4; }], ["Reset", () => reset(scenarioId)]]);
  const info = document.createElement("div"); info.className = "info"; panel.append(info);
  const captions = document.createElement("pre"); captions.className = "captions"; captions.setAttribute("aria-live", "polite"); panel.append(captions);

  // Deterministic fast-forward for screenshots.
  reset(scenarioId);
  if (params.has("lamp")) lamp = params.get("lamp") === "1";
  if (params.has("noise")) noise = Number(params.get("noise"));
  if (params.has("move")) move = params.get("move") as typeof move;
  if (params.has("pose")) pose = params.get("pose") as AgentMode;
  for (const d of (params.get("deploy") ?? "").split(",").filter(Boolean)) {
    const [kind, at] = d.split("@");
    while (tick < Number(at) * 60) step();
    deploy(kind as Deterrent);
  }
  const until = Number(params.get("at") ?? 0) * 60;
  while (tick < until) step();
  if (params.get("paused") === "1") speed = 0;
  if (params.has("cam")) [camera.radius, camera.alpha, camera.beta] = params.get("cam")!.split(",").map(Number) as [number, number, number];

  function render(): void {
    const view = ecologyView(state, tick, stimulus());
    if (pose && sc.focus) {
      const focus = view.threats.find(t => t.id === sc.focus)!;
      focus.mode = pose; focus.modeSeconds = (tick / 60) % 2; focus.position = homeOf(sc.focus); focus.yaw = Math.atan2(player.x - focus.position.x, -(player.z - focus.position.z));
    }
    layer.update(view, tick / 60, camera.position);
    marker.update(player, lamp, tick / 60, sc.hull);
    cel.setVector3("cameraPosition", camera.position);
    cel.setFloat("time", tick / 60);
    canvas.dataset.tick = String(tick);
    status();
  }
  function status(): void {
    const focus = sc.focus ? state.agents.find(a => a.id === sc.focus) : null;
    const h = sampleHazards(player, tick);
    const lines = [
      `<b>${sc.label}</b>`, `t ${(tick / 60).toFixed(1)} s · lamp ${lamp ? "on" : "off"} · noise ${noise.toFixed(2)} · ${move}${pose ? ` · pose ${pose}` : ""}`,
      focus ? `${THREATS[speciesOf(focus.id)].label}: <b>${focus.mode}</b> · awareness ${focus.awareness.toFixed(2)} · refractory ${focus.refractory.toFixed(0)} s · cycles ${focus.cycles}` : "",
      `At the player: heat ${h.heat.toFixed(2)} · brine ${h.brine.toFixed(2)} · current ${Math.hypot(h.flow.x, h.flow.y, h.flow.z).toFixed(2)} m/s · light ${h.ambient.toFixed(2)} · exposure heat ${(sc.hull ? state.hulls["viewer-hull"]?.heat ?? 0 : state.diver.heat).toFixed(0)}`,
      scenarioId === "plume" ? `${CUE_SPECIES.ember_mites.label}: scatter ${ecologyView(state, tick, null).mites.scatter.toFixed(2)} · vent in ${ecologyView(state, tick, null).mites.secondsToVent.toFixed(1)} s` : "",
    ].filter(Boolean);
    info.innerHTML = lines.join("<br>");
    captions.textContent = log.join("\n");
  }

  let lastFrame = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    accumulator += dt * speed;
    while (accumulator >= 1 / 60) { step(); accumulator -= 1 / 60; }
    render();
    scene.render();
  });
  addEventListener("resize", () => engine.resize());
}

/** Player stand-in: a diver capsule or a small hull block, with a lit lamp lens. */
function playerMarker(scene: Scene, cel: ReturnType<typeof createCelMaterial>) {
  const build = (name: string, craft: boolean): { mesh: Mesh; lamp: Display } => {
    const b = new ArtBatch(name, scene, cel);
    if (craft) { b.ellipsoid([0, 0.9, 0], [1.6, 0.9, 3.2], P.porcelain, 10); b.box([0, 0.4, 0.4], [2.8, 0.5, 4.4], P.ochre); }
    else { b.ellipsoid([0, 0.9, 0], [0.32, 0.9, 0.32], P.ochre, 8); b.ellipsoid([0, 1.55, -0.1], [0.26, 0.26, 0.26], P.porcelain, 8); }
    b.glow(b.ellipsoid([0, craft ? 1 : 1.55, craft ? -3.2 : -0.36], [craft ? 0.4 : 0.12, craft ? 0.3 : 0.1, 0.08], P.warm, 7));
    const mesh = b.finish(0.6); mesh.unfreezeWorldMatrix();
    return { mesh, lamp: new Display(mesh) };
  };
  const diver = build("viewer.player.diver", false), craft = build("viewer.player.craft", true);
  return {
    update(p: Vec3, lit: boolean, seconds: number, hull: HullId | null) {
      for (const [m, on] of [[diver, !hull], [craft, !!hull]] as const) {
        m.mesh.setEnabled(on);
        m.mesh.position.set(p.x, p.y + Math.sin(seconds * 1.4) * 0.05, p.z);
        m.lamp.set(lit ? 1.4 : 0.3, lit);
      }
    },
  };
}
