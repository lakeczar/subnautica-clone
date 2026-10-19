import test from "node:test";
import assert from "node:assert/strict";
import { HULL_COLLIDERS, THREAT_HOME } from "../src/content/registry.js";
import { fixtureGame } from "../src/sim/carrier.js";
import { RECOVERY_NOTICES } from "../src/sim/recovery.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { airSupply, exposure, SUIT_OXYGEN_DRAIN_PER_SECOND, updateSurvival, updateThreat } from "../src/sim/survival.js";
import { createWorldQueries, RIB_SEGMENTS, SOLIDS, WORLD_BOUNDS } from "../src/sim/world.js";
import type { GameCommand, GameEvent, GameState, Vec3, VehicleState, WorldQueries } from "../src/sim/types.js";

const empty = createWorldQueries([], () => -200);
const up: GameCommand = { type: "move", forward: 0, right: 0, vertical: 1, sprint: false };
const near = (a: number, b: number, tolerance = 1e-10): void => {
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
};
function swimmer(position: Vec3 = { x: -55, y: -10, z: 30 }): GameState {
  const s = createGame(); s.opening.phase = 4; s.player.mode = "swimming";
  s.player.pose.position = { ...position }; s.player.pose.pitch = 0; return s;
}
function pilot(hull: VehicleState["hull"] = "dart", position?: Vec3): GameState {
  const s = swimmer(position), v = makeVehicle("signal-hull", hull, s.player.pose.position, "signal-hold");
  s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id; s.player.mode = "piloting";
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", capacity: 32, ownerId: v.id });
  return s;
}
type Ascent = Extract<GameEvent, { type: "ascent-sample" }>;
function samples(events: GameEvent[]): Ascent[] {
  return events.filter((e): e is Ascent => e.type === "ascent-sample");
}
function sample(events: GameEvent[]): Ascent {
  const all = samples(events); assert.equal(all.length, 1); const a = all[0]!;
  for (const value of [a.requestedRise, a.actualRise, a.solidLimitedRise, a.surfaceLimitedRise])
    assert.ok(Number.isFinite(value));
  assert.ok(a.requestedRise > 0 && a.solidLimitedRise >= 0 && a.surfaceLimitedRise >= 0); return a;
}
function freeze(s: object): void {
  for (const value of Object.values(s)) if (value !== null && typeof value === "object") freeze(value);
  Object.freeze(s);
}

test("command refusals and results are action notices, even when error is true", () => {
  const s = swimmer();
  for (const run of [() => executeCommand(s, { type: "scan" }, empty), () => stepGame(s, [{ type: "scan" }], empty)]) {
    const n = run().events.find(e => e.type === "notice"); assert.ok(n?.type === "notice");
    assert.equal(n.channel, "action"); assert.equal(n.error, true); assert.equal(n.context, undefined);
  }
  const n = executeCommand(s, { type: "hint" }, empty).events.find(e => e.type === "notice");
  assert.ok(n?.type === "notice"); assert.equal(n.channel, "action"); assert.equal(n.error, undefined);
});

test("warn/pursue transitions alone mark a copied emitted threat-call position, preceding the hunter's movement", () => {
  for (const mode of ["idle", "investigate"] as const) {
    const s = swimmer({ x: 133, y: -112, z: -113 });
    Object.assign(s.world.threat, { mode, interest: mode === "idle" ? 0.7 : 4, modeSeconds: 5 });
    const emitted = { ...s.world.threat.position }, events: GameEvent[] = [];
    updateThreat(s, 1, events, empty);
    assert.equal(s.world.threat.mode, mode === "idle" ? "warn" : "pursue");
    assert.equal(events[0]?.type, "notice"); const n = events[0];
    assert.ok(n?.type === "notice"); assert.equal(n.channel, "hazard"); assert.equal(n.context, "threat");
    const call = events[1]; assert.ok(call?.type === "sound");
    assert.equal(call.cue, "warning"); assert.equal(call.source, "threat-call"); assert.deepEqual(call.origin, emitted);
    assert.notEqual(call.origin, s.world.threat.position);
    if (mode === "investigate") assert.notDeepEqual(s.world.threat.position, emitted);
    s.world.threat.position.x += 9; assert.deepEqual(call.origin, emitted);
    const next: GameEvent[] = []; updateThreat(s, 1, next, empty);
    assert.ok(next.every(e => e.type !== "sound" || e.source === undefined));
  }
});

test("oxygen/food/body warnings and positional attack sounds do not acquire threat-call metadata", () => {
  const s = swimmer(); s.tick = 300; s.player.graceSeconds = 0;
  s.player.vitals.oxygen = 35.001; s.player.vitals.food = 20.0001;
  const events: GameEvent[] = []; updateSurvival(s, events);
  assert.deepEqual(events.filter(e => e.type === "notice").map(e => [e.channel, e.context]),
    [["hazard", "oxygen"], ["hazard", "food"]]);
  for (const e of events) if (e.type === "sound") { assert.equal(e.source, undefined); assert.equal(e.origin, undefined); }
  const attack = swimmer({ x: THREAT_HOME.x + 1, y: THREAT_HOME.y, z: THREAT_HOME.z });
  attack.tick = 60; Object.assign(attack.world.threat, { mode: "pursue", interest: 4 });
  const attacked: GameEvent[] = []; updateThreat(attack, 1, attacked, empty);
  const damage = attacked.find(e => e.type === "sound" && e.cue === "damage");
  assert.ok(damage?.type === "sound" && damage.origin); assert.equal(damage.source, undefined);
  assert.notEqual(damage.origin, attack.world.threat.position);
});

test("hull disable and incapacity use hazard contexts without changing recovery", () => {
  const s = pilot(); s.fleet.vehicles[0]!.health = 0;
  const events: GameEvent[] = []; updateSurvival(s, events);
  assert.ok(events.some(e => e.type === "notice" && e.channel === "hazard" && e.context === "hull"));
  const exhausted = swimmer(); exhausted.player.vitals.oxygen = 0; exhausted.player.vitals.health = 0.01;
  const out = stepGame(exhausted, [up], empty);
  assert.equal(out.state.metrics.failures, 1); assert.equal(out.state.player.mode, "walking");
  assert.equal(samples(out.events).length, 0);
  assert.ok(out.events.some(e => e.type === "notice" && e.channel === "hazard" && e.context === "recovery"));
});

test("automatic recovery results are tagged only at step composition, distinguishing progress from errors", () => {
  const ready = pilot(), v = ready.fleet.vehicles[0]!; v.disabled = true; v.health = 0;
  ready.player.controlledVehicleId = null; ready.player.mode = "swimming";
  ready.recovery.operation = { vehicleId: v.id, routeId: "canopy", method: "tow", phase: "approach", waypoint: 3,
    position: { ...v.pose.position, y: v.pose.position.y + 1 } };
  const out = stepGame(ready, [], empty), notice = out.events.find(e => e.type === "notice");
  assert.ok(notice?.type === "notice");
  assert.deepEqual(notice, { type: "notice", message: RECOVERY_NOTICES.ready, channel: "action", context: "recovery" });
  ready.player.controlledVehicleId = v.id; ready.player.mode = "piloting";
  const occupied = stepGame(ready, [], empty).events.find(e => e.type === "notice");
  assert.ok(occupied?.type === "notice");
  assert.equal(occupied.channel, "hazard"); assert.equal(occupied.context, "recovery"); assert.equal(occupied.error, true);
});

test("air supply precedence and exposure remain read-only across actual refuges, surfaces and craft", () => {
  const cases: [string, GameState, ReturnType<typeof airSupply>][] = [];
  const add = (label: string, s: GameState, kind: ReturnType<typeof airSupply>["kind"], remainingSeconds: number | null = null): void => {
    cases.push([label, s, { kind, remainingSeconds }]);
  };
  const pod = createGame(); add("pod", pod, "refuge");
  const workshop = swimmer({ x: 10, y: 1.2, z: -34 });
  workshop.player.mode = "walking"; workshop.world.facilities.find(f => f.id === "island_workshop")!.repaired = true;
  add("restored workshop", workshop, "refuge");
  const lab = swimmer({ x: 116, y: -117, z: -126 }); add("actual lab air", lab, "refuge");
  add("station-kept interior", fixtureGame(), "refuge");
  const healthy = pilot("dart", { x: 116, y: -117, z: -126 });
  add("healthy craft overlapping lab volume", healthy, "craft");
  assert.equal(exposure(healthy).refuge, false, "existing refuge volumes exclude a controlled craft");
  for (const disabled of [false, true]) for (const reserve of [0, 17.25]) {
    const s = pilot(), v = s.fleet.vehicles[0]!;
    v.disabled = disabled; v.charge = 0; v.emergencyAir = reserve; s.player.vitals.oxygen = 25;
    add(`empty/disabled ${disabled}, reserve ${reserve}`, s, reserve ? "emergency" : "suit", reserve || 45);
  }
  const disabledCharged = pilot(); disabledCharged.fleet.vehicles[0]!.disabled = true;
  disabledCharged.fleet.vehicles[0]!.emergencyAir = 12.5; add("disabled with charge", disabledCharged, "emergency", 12.5);
  const disabledExhausted = structuredClone(disabledCharged); disabledExhausted.fleet.vehicles[0]!.emergencyAir = 0;
  disabledExhausted.player.vitals.oxygen = 25; add("disabled charged craft with no reserve", disabledExhausted, "suit", 45);
  const powerlessInterior = fixtureGame(); powerlessInterior.fleet.vehicles[0]!.charge = 0;
  add("external station-kept interior air with powerless carrier", powerlessInterior, "refuge");
  const surfaceCraft = pilot("dart", { x: -55, y: -0.9, z: 30 });
  surfaceCraft.fleet.vehicles[0]!.charge = 0; add("powerless surface craft", surfaceCraft, "surface");
  const beforeAir = swimmer({ x: -55, y: -0.850001, z: 30 }); beforeAir.player.vitals.oxygen = 37.5;
  add("submerged swimmer", beforeAir, "suit", 67.5);
  add("actual swimming airway transition", swimmer({ x: -55, y: -0.85, z: 30 }), "surface");
  for (const [label, s, expected] of cases) {
    const before = structuredClone(s), exposureBefore = exposure(s); freeze(s);
    assert.deepEqual(airSupply(s), expected, label); assert.deepEqual(airSupply(s), expected, label);
    assert.deepEqual(s, before, label); assert.deepEqual(exposure(s), exposureBefore, label);
    assert.equal(exposure(s).breathable, expected.kind !== "suit", label);
  }
});

test("unrepaired and occupied refuge volumes do not broaden air rules, and interior air needs station keeping", () => {
  const workshop = swimmer({ x: 10, y: 1.2, z: -34 }); workshop.player.mode = "walking";
  assert.equal(airSupply(workshop).kind, "surface", "unrestored workshop has only its actual surface airway");
  const labCraft = pilot("dart", { x: 116, y: -117, z: -126 });
  labCraft.fleet.vehicles[0]!.charge = 0; labCraft.fleet.vehicles[0]!.emergencyAir = 9;
  assert.deepEqual(airSupply(labCraft), { kind: "emergency", remainingSeconds: 9 });
  const interior = fixtureGame(); interior.fleet.docking!.stationKeeping = false;
  assert.equal(airSupply(interior).kind, "suit");
});

test("finite seconds use the exact current suit drain and only the current emergency reserve", () => {
  const s = swimmer(); s.player.vitals.oxygen = 37.5;
  const before = airSupply(s).remainingSeconds!; updateSurvival(s, []);
  assert.equal(SUIT_OXYGEN_DRAIN_PER_SECOND, 100 / 180);
  assert.equal(s.player.vitals.oxygen, 37.5 - SUIT_OXYGEN_DRAIN_PER_SECOND / 60);
  near(before - airSupply(s).remainingSeconds!, 1 / 60);
  const failed = pilot(), v = failed.fleet.vehicles[0]!; v.charge = 0; v.emergencyAir = 6.25;
  failed.player.vitals.oxygen = 2;
  assert.deepEqual(airSupply(failed), { kind: "emergency", remainingSeconds: 6.25 }); updateSurvival(failed, []);
  near(airSupply(failed).remainingSeconds!, 6.25 - 1 / 60);
  const surface = pilot("dart", { x: -55, y: -0.9, z: 30 }); surface.fleet.vehicles[0]!.charge = 0;
  const reserve = surface.fleet.vehicles[0]!.emergencyAir; updateSurvival(surface, []);
  assert.equal(airSupply(surface).kind, "surface"); near(surface.fleet.vehicles[0]!.emergencyAir, reserve - 1 / 60);
});

test("free upward swimming and piloting report intended current-step travel, including aimed-forward rise", () => {
  for (const s of [swimmer(), pilot()]) {
    const before = structuredClone(s), out = stepGame(s, [up], empty), a = sample(out.events);
    assert.equal(a.actorId, s.player.controlledVehicleId); near(a.actualRise, a.requestedRise);
    assert.equal(a.solidLimitedRise, 0); assert.equal(a.surfaceLimitedRise, 0); assert.deepEqual(s, before);
    near(a.requestedRise, s.player.controlledVehicleId ? 6 * (2.8 / 60) / 60 : 2.8 / 60);
    s.player.pose.pitch = 0.6;
    const aimed = sample(stepGame(s, [{ ...up, vertical: 0, forward: 1 }], empty).events);
    near(aimed.actualRise, aimed.requestedRise);
  }
});

test("exact corrected A/B starts retain useful free rise without a solid-ascent shortfall", () => {
  for (const p of [{ x: -26.37, y: -9.620000000000001, z: -8.91 }, { x: -13.3, y: -1.6600000000000001, z: -5.84 }]) {
    let s = swimmer(p); const world = createWorldQueries();
    for (let i = 0; i < 6; i++) {
      const out = stepGame(s, [up], world), a = sample(out.events); s = out.state;
      assert.ok(a.actualRise > 0.04); assert.equal(a.solidLimitedRise, 0);
    }
    near(s.player.pose.position.y - p.y, 6 * 2.8 / 60);
  }
});

test("a real ceiling produces sustained positive shortfall while side contact preserves full Y travel", () => {
  const ceiling = { id: "test.ceiling", min: { x: -80, y: -8.99, z: 0 }, max: { x: -30, y: -8, z: 60 } };
  let s = swimmer(); const world = createWorldQueries([ceiling], () => -200);
  let limited = 0;
  for (let i = 0; i < 30; i++) {
    const out = stepGame(s, [up], world), a = sample(out.events); s = out.state;
    if (a.solidLimitedRise > 0.04) limited++;
    assert.equal(a.surfaceLimitedRise, 0);
  }
  assert.ok(limited >= 28);
  const wall = { id: "test.side", min: { x: -54.6, y: -20, z: 0 }, max: { x: -53, y: 0, z: 60 } };
  s = swimmer({ x: -54.95, y: -10, z: 30 });
  const out = stepGame(s, [{ ...up, right: 1 }], createWorldQueries([wall], () => -200)), a = sample(out.events);
  assert.ok(out.state.player.pose.position.x < -54.94, "the wall blocks lateral travel");
  near(a.actualRise, a.requestedRise); assert.equal(a.solidLimitedRise, 0);
});

test("real rib contact records sustained shortfall and a diagonal tangent retains useful Y progress", () => {
  const rib = RIB_SEGMENTS[0]!, solid = SOLIDS.find(s => s.id === "reef.rib.0")!;
  const world = createWorldQueries([solid], () => -200);
  let s = swimmer({ ...rib.a, y: rib.a.y - rib.radius - 0.95 - 0.001 });
  let limited = 0;
  for (let i = 0; i < 25; i++) {
    const out = stepGame(s, [up], world), a = sample(out.events); s = out.state;
    if (a.solidLimitedRise > a.requestedRise * 0.9) limited++;
  }
  assert.ok(limited > 20);
  s = swimmer({ x: rib.a.x + rib.radius + 0.34 + 0.001, y: rib.a.y - 0.475, z: rib.a.z });
  const out = stepGame(s, [{ ...up, right: -1 }], world), a = sample(out.events);
  assert.ok(out.state.player.pose.position.x > s.player.pose.position.x - 0.002, "real side contact removes inward travel");
  assert.ok(a.actualRise > 0.02); near(a.actualRise, a.requestedRise); assert.equal(a.solidLimitedRise, 0);
});

test("ascent preserves a legitimate negative collision slide and aggregates only actual sweeps across slices", () => {
  const s = pilot(); s.fleet.vehicles[0]!.velocity = { x: 24, y: 4, z: 0 };
  const raw: { requested: number; actual: number }[] = [];
  const sliding: WorldQueries = { ...empty, moveCapsule(origin, delta, shape) {
    if (shape !== HULL_COLLIDERS.dart) return empty.moveCapsule(origin, delta, shape);
    raw.push({ requested: delta.y, actual: -0.01 });
    return { position: { x: origin.x + delta.x, y: origin.y - 0.01, z: origin.z + delta.z }, hitSolid: true, hitBoundary: false };
  } };
  const out = stepGame(s, [up], sliding), a = sample(out.events);
  assert.ok(raw.length > 1); near(a.actualRise, -0.01 * raw.length);
  near(a.solidLimitedRise, raw.reduce((sum, r) => sum + r.requested - r.actual, 0));
  assert.ok(a.solidLimitedRise > a.requestedRise);
});

test("a real oblique rib can slide downward despite upward intent; actual rise keeps its sign", () => {
  const s = swimmer({ x: -17.152861025206015, y: -2.4187806371092684, z: -13.4086105757921 });
  s.player.pose.yaw = 1.6972326644615783;
  const world = createWorldQueries(SOLIDS.filter(s => s.id.startsWith("reef.rib.")), () => -200);
  const out = stepGame(s, [{ ...up, vertical: 0.1, forward: 1, sprint: true }], world), a = sample(out.events);
  assert.ok(world.clearance(s.player.pose.position, { radius: 0.34, height: 0.95 }));
  assert.ok(a.actualRise < -0.007 && a.solidLimitedRise > a.requestedRise);
  near(a.actualRise, out.state.player.pose.position.y - s.player.pose.position.y);
  near(a.solidLimitedRise, a.requestedRise - a.actualRise);
});

test("a piloted hull measures genuine ceiling contact without treating a side-only impact as blocked ascent", () => {
  for (const ceiling of [false, true]) {
    const s = pilot(); s.fleet.vehicles[0]!.velocity = { x: ceiling ? 0 : 4, y: 3, z: 0 };
    const solid = ceiling
      ? { id: "test.hull-ceiling", min: { x: -90, y: -7.899, z: 0 }, max: { x: -20, y: -7, z: 60 } }
      : { id: "test.hull-side", min: { x: -51.39, y: -20, z: 0 }, max: { x: -50, y: 0, z: 60 } };
    const out = stepGame(s, [up], createWorldQueries([solid], () => -200)), a = sample(out.events);
    if (ceiling) { assert.ok(a.solidLimitedRise > 0.04); assert.ok(a.actualRise < 0.002); }
    else { near(a.actualRise, a.requestedRise); assert.equal(a.solidLimitedRise, 0); }
  }
});

test("surface caps are measured separately for swimming and piloting", () => {
  for (const s of [swimmer({ x: -55, y: -0.51, z: 30 }), pilot("dart", { x: -55, y: -0.901, z: 30 })]) {
    const out = stepGame(s, [up], empty), a = sample(out.events);
    assert.equal(a.solidLimitedRise, 0); assert.ok(a.surfaceLimitedRise > 0);
    near(a.actualRise + a.surfaceLimitedRise, a.requestedRise);
  }
});

test("floor support correction and horizontal world bounds cannot masquerade as a ceiling", () => {
  const s = pilot(); s.fleet.vehicles[0]!.velocity = { x: 4, y: 0, z: 0 };
  const out = stepGame(s, [up], createWorldQueries([], () => -9.9)), a = sample(out.events);
  assert.equal(a.actualRise, 0, "existing hull terrain correction discards horizontal movement");
  assert.equal(a.solidLimitedRise, 0); assert.equal(a.surfaceLimitedRise, 0);
  const edge = swimmer({ x: WORLD_BOUNDS.maxX, y: -10, z: 30 });
  const bounded = stepGame(edge, [{ ...up, right: 1 }], empty), b = sample(bounded.events);
  assert.ok(bounded.events.some(e => e.type === "foundation-boundary"));
  assert.equal(b.solidLimitedRise, 0); near(b.actualRise, b.requestedRise);
});

test("release, down, no intent, opening, walking/interior and actor/mode replacement have no retained sample", () => {
  const risen = stepGame(swimmer(), [up], empty); sample(risen.events);
  for (const commands of [[], [{ ...up, vertical: 0 }], [{ ...up, vertical: -1 }]] as GameCommand[][])
    assert.equal(samples(stepGame(risen.state, commands, empty).events).length, 0);
  const coasting = pilot(); coasting.fleet.vehicles[0]!.velocity.y = 4;
  for (const commands of [[], [{ ...up, vertical: -1 }]] as GameCommand[][]) {
    const out = stepGame(coasting, commands, empty);
    assert.ok(out.state.player.pose.position.y > coasting.player.pose.position.y);
    assert.equal(samples(out.events).length, 0, "inertia without upward intent");
  }
  for (const s of [createGame(), fixtureGame()]) assert.equal(samples(stepGame(s, [up], empty).events).length, 0);
  const changed = swimmer(); changed.player.mode = "walking";
  assert.equal(samples(stepGame(changed, [up], empty).events).length, 0, "walking to swimming resets");
  const landing = swimmer({ x: -55, y: -0.56, z: 30 });
  const landed = stepGame(landing, [{ ...up, right: 1 }], createWorldQueries([], x => -0.56 + (x + 55) * 0.5));
  assert.equal(landed.state.player.mode, "walking"); assert.equal(samples(landed.events).length, 0);
  const helm = fixtureGame();
  assert.equal(samples(stepGame(helm, [{ type: "carrier", action: "helm" }, up], empty).events).length, 0);
  const walking = createGame(); walking.opening.phase = 4;
  assert.equal(samples(stepGame(walking, [up], createWorldQueries()).events).length, 0);
});

test("Spindle, unpowered/disabled and station-kept craft emit no attempted-ascent sample", () => {
  const spindle = pilot("spindle", { x: -55, y: -0.4, z: 30 });
  const unpowered = pilot(); unpowered.fleet.vehicles[0]!.charge = 0;
  const disabled = pilot(); disabled.fleet.vehicles[0]!.disabled = true;
  const disabling = pilot(); disabling.fleet.vehicles[0]!.health = 0;
  const station = fixtureGame();
  const helm = executeCommand(station, { type: "carrier", action: "helm" }, empty).state;
  const kept = executeCommand(helm, { type: "carrier", action: "station-keep" }, empty).state;
  for (const s of [spindle, unpowered, disabled, disabling, kept]) {
    const out = stepGame(s, [up], empty); assert.equal(samples(out.events).length, 0);
  }
  assert.equal(stepGame(spindle, [up], empty).state.fleet.vehicles[0]!.pose.position.y, -0.4);
});

test("sample replay is deterministic and independent of prior calls, recovery and sessions", () => {
  const s = swimmer(), a = stepGame(s, [up], empty);
  const unrelated = pilot(); unrelated.player.vitals.health = 0; stepGame(unrelated, [up], empty);
  assert.deepEqual(stepGame(structuredClone(s), [up], empty), a);
  assert.deepEqual(stepGame(s, [], empty).events, []);
  assert.ok(empty.clearance(a.state.player.pose.position, { radius: 0.34, height: 0.95 }));
});
