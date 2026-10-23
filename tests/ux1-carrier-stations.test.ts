/** UX-1: the Hearthline used through its stations; looking around at the helm
 * does not steer; launch refusals say what to do; developer tools stay behind ?dev. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BERTH_LOCAL, CARRIER_LAYOUT, carrierCommand, carrierHull, corridorRemedy, fixtureGame, launchPoint, localToWorld, updateBerth,
} from "../src/sim/carrier.js";
import { aboardCarrier, atCarrierHelm, CARRIER_STATIONS, carrierInteractions, launchCorridor } from "../src/sim/carrierStations.js";
import { interactions } from "../src/sim/progression.js";
import { aimedInteraction } from "../src/sim/targeting.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { eyeHeight } from "../src/sim/state.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameCommand, GameEvent, GameState, Vec3, WorldQueries } from "../src/sim/types.js";
import { HelmControl, HELM_LOOK, HELM_RUDDER } from "../src/runtime/helm.js";
import { HELM_EYE, playerView } from "../src/render/camera.js";
import { corridorDrawing, corridorLines } from "../src/render/corridorView.js";
import { helmGuidance, helmReading, HELM_CONTROLS } from "../src/ui/helmHud.js";
import { PanelView } from "../src/ui/panels.js";

const open = createWorldQueries([], () => -200);
const notices = (events: readonly GameEvent[]) => events.flatMap((e) => e.type === "notice" ? [e] : []);

/** The fixture, opening done, the player standing at `local` aboard and facing `at`. */
function aboard(local: Vec3, at: Vec3): GameState {
  const s = fixtureGame();
  s.opening.phase = 4;
  const h = carrierHull(s)!;
  s.player.interiorPose = { frame: "carrier-local", position: { ...local } };
  s.player.pose.position = localToWorld(local, h);
  const eye = { x: local.x, y: local.y + eyeHeight(s), z: local.z };
  const dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z;
  s.player.pose.yaw = h.pose.yaw + Math.atan2(dx, -dz);
  s.player.pose.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return s;
}
/** At the helm of the fixture carrier, under way or holding. */
function atHelm(): GameState {
  const s = fixtureGame();
  s.opening.phase = 4;
  assert.equal(carrierCommand(s, "helm", undefined, open), null);
  return s;
}
/** A rock just to port of the launch point at heading 0 (the fixture carrier). */
function rockWorld(s: GameState): WorldQueries {
  const p = launchPoint(carrierHull(s)!, s.fleet.vehicles.find((v) => v.hull === "dart")!);
  return createWorldQueries([{ id: "rock", min: { x: p.x - 7, y: p.y - 6, z: p.z - 4 }, max: { x: p.x + 1, y: p.y + 2, z: p.z + 4 } }], () => -200);
}

test("aboard, only the carrier's stations are in reach; the hatch is offered on the vestibule floor", () => {
  const bridge = aboard(CARRIER_LAYOUT.helm, CARRIER_STATIONS["carrier:helm"].center);
  assert.ok(aboardCarrier(bridge));
  assert.deepEqual(interactions(bridge).map((t) => t.id).sort(), ["carrier:berths", "carrier:helm", "carrier:lock", "carrier:stores"]);
  const vestibule = aboard(CARRIER_LAYOUT.vestibule, CARRIER_STATIONS["carrier:hatch"].center);
  assert.ok(carrierInteractions(vestibule).some((t) => t.id === "carrier:hatch"));
  // Adverse: the walls stand between the bridge and the vestibule hatch.
  const blind = aboard(CARRIER_LAYOUT.helm, CARRIER_STATIONS["carrier:berths"].center);
  assert.notEqual(aimedInteraction(blind, open)?.id, "carrier:berths", "the berth panel is aft, behind bulkheads and berth rooms");
});

test("the helm station takes the helm at the carrier's own heading, and leaving says something true", () => {
  // The carrier is turned 0.7 rad; the player faces the console in its frame.
  const again = aboard(CARRIER_LAYOUT.helm, CARRIER_STATIONS["carrier:helm"].center);
  carrierHull(again)!.pose.yaw = 0.7;
  again.player.pose.yaw += 0.7;
  updateBerth(again, open);
  assert.equal(aimedInteraction(again, open)?.id, "carrier:helm");
  const took = executeCommand(again, { type: "interact" }, open);
  assert.ok(atCarrierHelm(took.state));
  assert.equal(took.state.player.pose.yaw, 0.7, "the helm takes the carrier's heading");
  assert.equal(took.state.player.pose.pitch, 0, "level");
  // A step with no input leaves the carrier where it pointed (no swing to the old view).
  const stepped = stepGame(took.state, [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false }], open).state;
  assert.ok(Math.abs(carrierHull(stepped)!.pose.yaw - 0.7) < 1e-12);
  // X at the helm: hold station and leave; the notice is the new state, not a stale line.
  const left = executeCommand(stepped, { type: "exit" }, open);
  assert.equal(left.state.player.mode, "interior");
  assert.equal(left.state.fleet.docking!.stationKeeping, true);
  assert.deepEqual(notices(left.events).map((n) => n.message), ["You leave the helm. The Hearthline holds station."]);
});

test("X at the helm under way is refused with what to do; nothing changes", () => {
  const s = atHelm(), h = carrierHull(s)!;
  h.velocity = { x: 0, y: 0, z: -2 };
  const out = executeCommand(s, { type: "exit" }, open);
  assert.equal(out.state, s);
  const [n] = notices(out.events);
  assert.match(n!.message, /making 2\.0 m\/s\. Ease off/);
  assert.deepEqual(n!.refusal, { kind: "exit", vehicleId: h.id, code: "carrier" });
  assert.match(helmGuidance(s)!, /Ease off to leave the helm/);
});

test("the lock console opens the Hearthline console; the stores open cargo; hatch and board use the vestibule", () => {
  const lock = aboard({ x: 4.4, y: 4, z: -9.3 }, CARRIER_STATIONS["carrier:lock"].center);
  assert.equal(aimedInteraction(lock, open)?.id, "carrier:lock");
  assert.deepEqual(executeCommand(lock, { type: "interact" }, open).events.find((e) => e.type === "interaction-panel"),
    { type: "interaction-panel", panel: "carrier", targetId: "carrier:lock" });
  const stores = aboard({ x: 4.6, y: 4, z: -5.2 }, CARRIER_STATIONS["carrier:stores"].center);
  assert.equal(aimedInteraction(stores, open)?.id, "carrier:stores");
  const hatch = aboard(CARRIER_LAYOUT.vestibule, CARRIER_STATIONS["carrier:hatch"].center);
  assert.equal(aimedInteraction(hatch, open)?.id, "carrier:hatch");
  const out = executeCommand(hatch, { type: "interact" }, open).state;
  assert.equal(out.player.mode, "swimming");
  assert.match(out.feedback, /Out through the vestibule/);
  // Outside, the hatch on the hull side boards (the carrier holds station).
  const h = carrierHull(out)!, hatchAt = localToWorld(CARRIER_STATIONS["carrier:board"].center, h);
  const p = out.player.pose.position, eye = { ...p, y: p.y + eyeHeight(out) };
  out.player.pose.yaw = Math.atan2(hatchAt.x - eye.x, -(hatchAt.z - eye.z));
  out.player.pose.pitch = Math.atan2(hatchAt.y - eye.y, Math.hypot(hatchAt.x - eye.x, hatchAt.z - eye.z));
  assert.equal(aimedInteraction(out, open)?.id, "carrier:board");
  const back = executeCommand(out, { type: "interact" }, open).state;
  assert.ok(aboardCarrier(back));
  assert.match(back.feedback, /Aboard the Hearthline/);
});

test("a blocked launch says which way to turn; after the turn it launches, and the craft is recovered", () => {
  const s = atHelm(), world = rockWorld(s);
  assert.equal(carrierCommand(s, "station-keep", undefined, world), null);
  const dart = s.fleet.vehicles.find((v) => v.hull === "dart")!;
  const refusal = carrierCommand(s, "launch", dart.id, world)!;
  assert.match(refusal, /^The lock corridor under the bow is obstructed\. Turn about \d+° to starboard for clear water, then launch the Dart\.$/);
  const status = launchCorridor(s, world)!;
  assert.equal(status.clear, false);
  assert.equal(status.advice, refusal);
  const remedy = corridorRemedy(s, dart, world);
  assert.ok(remedy && "turn" in remedy && remedy.turn > 0);
  // Turn at the helm as the hint says (through the sim), hold station and launch.
  const turned = carrierHull(s)!;
  turned.pose.yaw = (remedy as { turn: number }).turn;
  s.player.pose.yaw = turned.pose.yaw;
  updateBerth(s, world);
  assert.equal(launchCorridor(s, world)!.clear, true);
  assert.equal(carrierCommand(s, "launch", dart.id, world), null);
  assert.match(s.feedback, /Lock cycling: the Dart moves down to the gate/);
  for (let i = 0; i < 35; i++) updateBerth(s, world);
  assert.equal(dart.berth, null);
  assert.match(s.feedback, /^Dart launched under the bow/);
  // The pilot brings it back: the guide shows the lock mouth, and the console recovers it.
  s.player.controlledVehicleId = dart.id;
  s.player.mode = "piloting";
  const guide = corridorDrawing(s, world);
  assert.equal(guide?.mode, "guide");
  s.player.controlledVehicleId = null;
  s.player.mode = "interior";
  s.player.interiorId = turned.id;
  s.player.interiorPose = { frame: "carrier-local", position: { ...CARRIER_LAYOUT.vestibule } };
  assert.equal(carrierCommand(s, "capture", dart.id, world), null);
  for (let i = 0; i < 35; i++) updateBerth(s, world);
  assert.equal(s.fleet.vehicles.find((v) => v.id === dart.id)!.berth?.slot, 0);
  assert.match(s.feedback, /^Dart recovered\. Clamps locked/);
});

test("a recovery from too far says how far, and a launch with no clear heading says to find open water", () => {
  const s = atHelm(), h = carrierHull(s)!, creel = s.fleet.vehicles.find((v) => v.hull === "creel")!;
  assert.equal(carrierCommand(s, "station-keep", undefined, open), null);
  // Compact berths take compact craft; the Creel is told what it needs.
  assert.match(carrierCommand(s, "capture", creel.id, open)!, /the Creel is \d+ m from the lock mouth|needs/i);
  const dart = s.fleet.vehicles.find((v) => v.hull === "dart")!;
  const walled = createWorldQueries([{ id: "box", min: { x: h.pose.position.x - 40, y: h.pose.position.y - 30, z: h.pose.position.z - 40 },
    max: { x: h.pose.position.x + 40, y: h.pose.position.y - 1.2, z: h.pose.position.z + 40 } }], () => -200);
  assert.match(carrierCommand(s, "launch", dart.id, walled)!, /no nearby heading clears it|Rise about/);
});

test("looking around at the helm does not steer; A/D turn with an eased rudder; the hull stays level", () => {
  let s = atHelm();
  s.fleet.docking!.stationKeeping = false;
  s.player.pose.pitch = 0.3;
  const helm = new HelmControl(), yaw0 = carrierHull(s)!.pose.yaw;
  const look: GameCommand = { type: "look", yawDelta: 0.5, pitchDelta: -0.2 };
  const idle: GameCommand = { type: "move", forward: 0, right: 0, vertical: 0, sprint: false };
  const out = helm.apply(s, [look, idle]);
  assert.deepEqual(out[0], { type: "look", yawDelta: 0, pitchDelta: -0.3 }, "no steering; level the hull");
  assert.deepEqual(helm.look, { yaw: 0.5, pitch: -0.2 });
  s = stepGame(s, out, open).state;
  assert.ok(Math.abs(carrierHull(s)!.pose.yaw - yaw0) < 1e-12, "the head look did not turn the carrier");
  assert.equal(s.player.pose.pitch, 0);
  for (let i = 0; i < 10; i++) helm.apply(s, [{ type: "look", yawDelta: 1, pitchDelta: 1 }]);
  assert.deepEqual(helm.look, { yaw: HELM_LOOK.yaw, pitch: HELM_LOOK.up }, "the head look is clamped");
  // One second of starboard rudder: eased in, bounded by the rudder rate, no slide.
  const x0 = carrierHull(s)!.pose.position.x;
  for (let i = 0; i < 60; i++) s = stepGame(s, helm.apply(s, [{ type: "look", yawDelta: 0, pitchDelta: 0 }, { ...idle, right: 1 }]), open).state;
  const turned = carrierHull(s)!.pose.yaw - yaw0;
  assert.ok(turned > 0.15 && turned < HELM_RUDDER.rate, `turned ${turned} rad`);
  assert.ok(Math.abs(carrierHull(s)!.pose.position.x - x0) < 1e-9, "A/D no longer slide the carrier");
  // The camera stands at the bridge console and looks with the head look.
  const view = playerView(s, null, null, { x: 0, y: 0, z: 0 }, { yaw: 0.4, pitch: 0 });
  const eye = localToWorld(HELM_EYE, carrierHull(s)!);
  assert.deepEqual(view.eye, eye);
  assert.ok(Math.abs(Math.atan2(view.forward.x, -view.forward.z) - (s.player.pose.yaw + 0.4)) < 1e-9);
});

test("throttle while holding station takes the helm back; leaving hands the head look to the walking view", () => {
  let s = atHelm();
  assert.equal(carrierCommand(s, "station-keep", undefined, open), null);
  const helm = new HelmControl();
  const out = helm.apply(s, [{ type: "look", yawDelta: 0.3, pitchDelta: 0 }, { type: "move", forward: 1, right: 0, vertical: 0, sprint: false }]);
  assert.deepEqual(out[0], { type: "carrier", action: "helm" });
  s = stepGame(s, out, open).state;
  assert.equal(s.fleet.docking!.stationKeeping, false);
  assert.match(s.feedback, /Station keeping released/);
  assert.ok(carrierHull(s)!.velocity.z < 0, "under way, ahead");
  // Ease off, X, and the walking view picks up the head look (0.3 rad to starboard).
  carrierHull(s)!.velocity = { x: 0, y: 0, z: 0 };
  s = executeCommand(s, { type: "exit" }, open).state;
  const yaw = s.player.pose.yaw;
  s = stepGame(s, helm.apply(s, [{ type: "look", yawDelta: 0, pitchDelta: 0 }]), open).state;
  assert.ok(Math.abs(s.player.pose.yaw - yaw - 0.3) < 1e-9);
});

test("the helm readout shows heading, way and the corridor; the corridor is drawn at the helm", () => {
  const s = atHelm(), r = helmReading(s, open)!;
  assert.equal(r.heading, "000° N");
  assert.equal(r.way, "Stopped");
  assert.deepEqual(r.corridor, { clear: true, text: "Lock corridor clear under the bow for the Dart." });
  assert.match(HELM_CONTROLS, /A\/D turn/);
  const d = corridorDrawing(s, open)!;
  assert.equal(d.mode, "launch");
  assert.deepEqual(d.from, CARRIER_LAYOUT.railTurn);
  assert.ok(corridorLines(d).length > 6);
  const blocked = corridorDrawing(s, rockWorld(s));
  assert.equal(blocked?.clear, false);
  // Walking the passage, away from the lock stations, nothing is drawn.
  const passage = aboard({ x: 0.05, y: 4, z: 1 }, { x: 0, y: 5, z: -5 });
  assert.equal(corridorDrawing(passage, open), null);
});

/** A panel port as in preparation-panels.test.ts, for one carrier render. */
function renderCarrier(t: test.TestContext, s: GameState, search = ""): { html: string; title: string; nav: boolean } {
  const ports = new Map<string, { innerHTML: string; textContent: string; hidden: boolean; scrollTop: number; classList: object; contains(): boolean; querySelectorAll(): unknown[]; setAttribute(): void }>();
  const get = (id: string) => {
    if (!ports.has(id)) ports.set(id, { innerHTML: "", textContent: "", hidden: false, scrollTop: 0, classList: { remove() {}, toggle() {} },
      contains: () => false, querySelectorAll: () => [], setAttribute() {} });
    return ports.get(id)!;
  };
  const saved = ["document", "window", "location"].map((k) => Object.getOwnPropertyDescriptor(globalThis, k));
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { clearTimeout() {} } });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search } });
  t.after(() => ["document", "window", "location"].forEach((k, i) => saved[i] ? Object.defineProperty(globalThis, k, saved[i]!) : Reflect.deleteProperty(globalThis, k)));
  const root = { querySelector: (selector: string) => get(selector.slice(1)), querySelectorAll: () => [] };
  new PanelView(root as unknown as HTMLElement, open).refresh("carrier", s);
  return { html: get("panel-content").innerHTML, title: get("panel-title").textContent, nav: !get("carrier-nav").hidden };
}

test("the console is player-facing; developer tools appear only with ?dev", (t) => {
  const s = aboard(CARRIER_LAYOUT.helm, CARRIER_STATIONS["carrier:lock"].center);
  const plain = renderCarrier(t, s);
  assert.equal(plain.title, "Hearthline");
  assert.ok(plain.nav, "the Hearthline is in the panel nav once the fleet has a carrier");
  // Visible text only: command keys in attributes carry the save's identities.
  const text = plain.html.replace(/<[^>]*>/g, " ");
  for (const banned of ["Developer", "fixture", "SEEDED", "Toggle", "dart_", "damage", "Identity", "obstruction"])
    assert.ok(!text.includes(banned), `no "${banned}" in ordinary play`);
  for (const wanted of ["Holding station", "Port berth · Dart", "Starboard berth · Spindle", "Launch Dart", "Take the helm", "Lock corridor clear"])
    assert.ok(plain.html.includes(wanted), wanted);
  const dev = renderCarrier(t, s, "?dev");
  assert.ok(dev.html.includes("Developer · carrier test") && dev.html.includes("Toggle test obstruction"));
  // Adverse: a launch the corridor refuses shows why, beside its disabled button.
  const far = structuredClone(s);
  far.player.interiorId = null; far.player.interiorPose = null; far.player.mode = "swimming";
  far.player.pose.position = { x: 200, y: -10, z: 200 };
  assert.match(renderCarrier(t, far).html, /consoles answer aboard/);
});

test("BERTH_LOCAL and the stations stay inside the walkable interior", () => {
  for (const id of ["carrier:helm", "carrier:lock", "carrier:berths", "carrier:stores"] as const) {
    const c = CARRIER_STATIONS[id].center;
    assert.ok(Math.abs(c.x) < 6.3 && c.z > -12 && c.z < 12, id);
  }
  assert.equal(BERTH_LOCAL.length, 2);
});

test("a lock cycle says how it ended: launched, then recovered", () => {
  let s = atHelm();
  assert.equal(carrierCommand(s, "station-keep", undefined, open), null);
  const dart = s.fleet.vehicles.find((v) => v.hull === "dart")!;
  assert.equal(carrierCommand(s, "launch", dart.id, open), null);
  const said: string[] = [];
  for (let i = 0; i < 35; i++) {
    const out = stepGame(s, [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false }], open);
    s = out.state; said.push(...notices(out.events).map((n) => n.message));
  }
  assert.deepEqual(said, ["Dart launched under the bow. Board it from the water."]);
  assert.equal(carrierCommand(s, "capture", dart.id, open), null);
  said.length = 0;
  for (let i = 0; i < 35; i++) {
    const out = stepGame(s, [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false }], open);
    s = out.state; said.push(...notices(out.events).map((n) => n.message));
  }
  assert.deepEqual(said, ["Dart recovered. Clamps locked; the berth is dry."]);
});
