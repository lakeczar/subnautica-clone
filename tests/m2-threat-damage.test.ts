import test from "node:test";
import assert from "node:assert/strict";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { updateSurvival, updateThreat } from "../src/sim/survival.js";
import { disableVehicle } from "../src/sim/recovery.js";
import { stepGame } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameEvent, GameState } from "../src/sim/types.js";
import { hunterStandOff } from "../src/sim/hunter.js";
const world = createWorldQueries();
type Bite = Extract<GameEvent, { type: "threat-damage" }>;
const bites = (events: GameEvent[]): Bite[] => events.filter((e): e is Bite => e.type === "threat-damage");
// Explicit hunter/actor mechanics fixtures. These are not earned encounter evidence.
function fixture(pilot: boolean, health = 100): GameState {
  const s = createGame(); completeOpening(s); s.tick = 16;
  addItem(s, "suit_150", 1, "equipment", "suit");
  s.player.pose.position = { x: 132, y: -110, z: -112 }; s.player.vitals.health = pilot ? 100 : health;
  s.player.mode = pilot ? "piloting" : "swimming";
  if (pilot) {
    const v = makeVehicle("diagnostic_dart", "dart", s.player.pose.position, "diagnostic_hold");
    v.health = health; s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id;
    if (health === 0) disableVehicle(s, v.id);
  }
  s.world.threat = { mode: "pursue", position: { x: 147, y: -110, z: -112 },
    interest: 5, modeSeconds: 0, distraction: null, distractionSeconds: 0 };
  s.world.threat.position = hunterStandOff(s);
  return s;
}
const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test("a single non-sound-phase hull bite emits the frozen transient identity and actual raw health math", () => {
  const s = fixture(true), before = structuredClone(s), result = stepGame(s, [], world);
  assert.equal(result.state.tick, 17);
  const hits = bites(result.events); assert.equal(hits.length, 1);
  assert.deepEqual(hits[0], { type: "threat-damage", source: "hunter", target: { kind: "vehicle", vehicleId: "diagnostic_dart" },
    loss: 100 - (100 - 12 / 60), healthAfter: 100 - 12 / 60 });
  assert.equal(result.state.fleet.vehicles[0]!.health, 100 - 12 / 60);
  assert.ok(!result.events.some(e => e.type === "sound" && e.cue === "damage"));
  assert.ok(!result.events.some(e => e.type === "impact")); assert.deepEqual(s, before);
  assert.deepEqual(Object.keys(hits[0]!).sort(), ["healthAfter", "loss", "source", "target", "type"]);
  assert.doesNotMatch(JSON.stringify(result.state), /threat-damage|healthAfter|biteLoss|lastBite/);
});

test("0.1 hull clamp emits only available health before disable; a disabled zero hull emits no loss", () => {
  const result = stepGame(fixture(true, .1), [], world), hit = bites(result.events)[0]!;
  assert.equal(hit.loss, .1); assert.equal(hit.healthAfter, 0);
  assert.equal(result.state.fleet.vehicles[0]!.disabled, true);
  const damageIndex = result.events.findIndex(e => e.type === "threat-damage"),
    disableIndex = result.events.findIndex(e => e.type === "notice" && /Hull disabled/.test(e.message));
  assert.ok(damageIndex >= 0 && disableIndex > damageIndex);
  assert.equal(result.state.player.controlledVehicleId, hit.target.kind === "vehicle" ? hit.target.vehicleId : "invalid");
  const zero = stepGame(fixture(true, 0), [], world); assert.equal(bites(zero.events).length, 0);
});

test("diver raw mutation is unchanged; a lethal 0.1 bite precedes generic incapacity and keeps the bitten identity", () => {
  const ordinary = stepGame(fixture(false), [], world), hit = bites(ordinary.events)[0]!;
  near(hit.loss, 10 / 60); assert.equal(hit.healthAfter, 100 - 10 / 60);
  assert.deepEqual(hit.target, { kind: "diver" }); assert.equal(ordinary.state.player.vitals.health, 100 - 10 / 60);
  const lethal = stepGame(fixture(false, .1), [], world), last = bites(lethal.events)[0]!;
  assert.equal(last.loss, .1); assert.equal(last.healthAfter, 0); assert.deepEqual(last.target, { kind: "diver" });
  assert.equal(lethal.state.player.vitals.health, 65); assert.equal(lethal.state.player.mode, "walking");
  assert.equal(lethal.state.metrics.failures, 1);
  assert.ok(lethal.events.findIndex(e => e.type === "threat-damage") < lethal.events.findIndex(e => e.type === "sound" && e.cue === "recovery"));
  assert.ok(lethal.events.some(e => e.type === "notice" && /Exposure or injury/.test(e.message)));
  const zero = fixture(false, 0), events: GameEvent[] = []; updateThreat(zero, 0, events, world);
  assert.equal(zero.player.vitals.health, -10 / 60, "preserve unclamped diver state mutation"); assert.equal(bites(events).length, 0);
});

test("cover, distance and the existing AI transitions suppress bites without changing pursuit rules", () => {
  for (const mode of ["idle", "warn", "investigate", "disengage"] as const) {
    const s = fixture(true); s.world.threat.mode = mode; s.world.threat.interest = mode === "idle" ? 0 : 5;
    const events: GameEvent[] = []; updateThreat(s, 0, events, world); assert.equal(bites(events).length, 0, mode);
  }
  for (const reason of ["distance", "cover", "interest", "outside", "distraction"] as const) {
    const s = fixture(true), t = s.world.threat;
    if (reason === "distance") t.position.x = s.player.pose.position.x + 15;
    if (reason === "cover") {
      s.player.pose.position = { x: 99, y: -100, z: -118 }; t.position = { x: 113, y: -100, z: -118 }; t.modeSeconds = 2;
    }
    if (reason === "interest") t.interest = .5;
    if (reason === "outside") { s.player.pose.position = { x: 70, y: -40, z: -70 }; t.position = { ...s.player.pose.position }; }
    if (reason === "distraction") { t.distraction = { x: 140, y: -110, z: -112 }; t.distractionSeconds = 12; }
    const events: GameEvent[] = []; updateThreat(s, 0, events, world); assert.equal(bites(events).length, 0, reason);
    assert.equal(s.fleet.vehicles[0]!.health, 100);
    if (reason !== "distance") assert.equal(t.mode, "disengage", reason);
  }
});

test("periodic spatial sound retains its tick cadence and bite totals remain raw over forty steps", () => {
  for (const tick of [59, 60, 61, 119, 120, 121]) {
    const s = fixture(true); s.tick = tick; const events: GameEvent[] = []; updateThreat(s, 0, events, world);
    assert.equal(bites(events).length, 1);
    const sounds = events.filter(e => e.type === "sound" && e.cue === "damage");
    assert.equal(sounds.length, tick % 60 === 0 ? 1 : 0);
    if (sounds.length) assert.deepEqual(sounds[0], { type: "sound", cue: "damage", origin: s.world.threat.position });
  }
  let s = fixture(true), total = 0;
  for (let i = 0; i < 40; i++) { const r = stepGame(s, [], world); s = r.state; total += bites(r.events).reduce((n, e) => n + e.loss, 0); }
  near(total, 8); near(s.fleet.vehicles[0]!.health, 92);
});

test("collision, personal/hull pressure, oxygen and starvation retain distinct damage with no bite event", () => {
  const contact = fixture(true); contact.world.threat.mode = "idle"; contact.world.threat.interest = 0;
  const v = contact.fleet.vehicles[0]!; v.pose.position = { x: 99.39, y: -100, z: -118.5 };
  v.pose.yaw = Math.PI / 2; v.velocity = { x: 8, y: 0, z: 0 }; contact.player.pose = structuredClone(v.pose);
  const collision = stepGame(contact, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], world);
  assert.ok(collision.events.some(e => e.type === "impact")); assert.equal(bites(collision.events).length, 0);
  for (const cause of ["hull-pressure", "diver-pressure", "oxygen", "food"] as const) {
    const s = fixture(cause === "hull-pressure"), events: GameEvent[] = [];
    if (cause === "hull-pressure") s.fleet.vehicles[0]!.pose.position.y = -190;
    if (cause === "diver-pressure") s.player.pose.position.y = -170;
    if (cause === "oxygen") s.player.vitals.oxygen = 0;
    if (cause === "food") { s.player.vitals.food = 0; s.player.starvationSeconds = 181; s.player.graceSeconds = 0; s.player.pose.position.y = -30; }
    const before = cause === "hull-pressure" ? s.fleet.vehicles[0]!.health : s.player.vitals.health;
    updateSurvival(s, events);
    assert.ok((cause === "hull-pressure" ? s.fleet.vehicles[0]!.health : s.player.vitals.health) < before, cause);
    assert.equal(bites(events).length, 0, cause);
  }
});

test("a same-step collision and bite retain separate loss accounting and event order", () => {
  const s = fixture(true), v = s.fleet.vehicles[0]!;
  v.pose.position = { x: 99.39, y: -100, z: -118.5 }; v.pose.yaw = Math.PI / 2;
  v.velocity = { x: 8, y: 0, z: 0 }; s.player.pose = structuredClone(v.pose);
  s.world.threat.position = { x: 84, y: -100, z: -118.5 };
  s.world.threat.position = hunterStandOff(s);
  const r = stepGame(s, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], world);
  const collision = r.events.find(e => e.type === "impact"), hit = bites(r.events)[0]!;
  assert.ok(collision?.type === "impact" && collision.hullLoss > 0);
  assert.equal(bites(r.events).length, 1); near(hit.loss, 12 / 60);
  assert.deepEqual(hit.target, { kind: "vehicle", vehicleId: v.id });
  near(hit.healthAfter, 100 - collision.hullLoss - hit.loss);
  near(r.state.fleet.vehicles[0]!.health, hit.healthAfter);
  assert.ok(r.events.indexOf(collision) < r.events.indexOf(hit));
});
