import test from "node:test";
import assert from "node:assert/strict";
import { BERTH_LOCAL, CARRIER_LAYOUT, fixtureGame, localToWorld, updateBerth } from "../src/sim/carrier.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { createWorldQueries, moveHull, WORLD_BOUNDS } from "../src/sim/world.js";
import { BERTH_ENVELOPES, HULL_COLLIDERS } from "../src/content/registry.js";
import { disableVehicle } from "../src/sim/recovery.js";
import type { Vec3 } from "../src/sim/types.js";
import { bounds, coherent, command, edges, meta, move, NORTH_X, roundTrip, staged, world, worldMove } from "./carrier-boundary-support.js";
import { play } from "./step-support.js";

/** B1's edge cases, re-anchored on the full envelope: B1's north edge sat at
 * z 66 beside the reef; the envelope's is z 160, deep enough at NORTH_X. */
const NZ = WORLD_BOUNDS.maxZ;

// Explicit diagnostic staging for combinations not reached by the bounded route.
test("the existing carrier proxy encloses both berth layouts, interior and vestibules through a full turn", () => {
  const radius = HULL_COLLIDERS.hearthline.radius;
  const points: Vec3[] = [CARRIER_LAYOUT.helm, CARRIER_LAYOUT.vestibule, CARRIER_LAYOUT.exteriorVestibule,
    ...[-1, 1].flatMap((x) => [-1, 1].map((z) => ({ x: x * CARRIER_LAYOUT.interior.maxX, y: 4,
      z: z < 0 ? CARRIER_LAYOUT.interior.minZ : CARRIER_LAYOUT.interior.maxZ })))];
  for (const shape of Object.values(BERTH_ENVELOPES)) for (const berth of BERTH_LOCAL)
    for (const x of [-1, 1]) for (const z of [-1, 1]) points.push({ x: berth.x + x * shape.halfWidth,
      y: berth.y, z: berth.z + z * shape.halfLength });
  assert.ok(points.every((p) => Math.hypot(p.x, p.z) + 0.34 < radius));
  assert.deepEqual(bounds, { minX: WORLD_BOUNDS.minX + radius, maxX: WORLD_BOUNDS.maxX - radius,
    minZ: WORLD_BOUNDS.minZ + radius, maxZ: WORLD_BOUNDS.maxZ - radius });
});

test("retained valid near-edge saves neither snap to the new margin nor rotate attachments out of the world", () => {
  for (const configuration of ["compact", "medium"] as const) {
    let s = staged(configuration, { x: NORTH_X, y: -1.5, z: NZ - 1 }, 0);
    const before = { ...s.fleet.vehicles[0]!.pose.position };
    s = roundTrip(s);
    for (let i = 0; i < 30; i++) {
      s = stepGame(s, [{ type: "look", yawDelta: 0.8, pitchDelta: 0 }], world).state;
      coherent(s);
      assert.deepEqual(s.fleet.vehicles[0]!.pose.position, before);
    }
    // Compact's starboard attachment is at the edge: an outward turn stops at
    // contact. Medium's port-only occupancy can turn farther without corruption.
    if (configuration === "compact") assert.ok(s.player.pose.yaw < 1e-10);
    s = command(s, "station-keep");
    s = command(s, "helm");
    for (let i = 0; i < 40; i++) {
      s = stepGame(s, [worldMove(s, 0, -1)], world).state;
      coherent(s);
    }
    assert.ok(s.fleet.vehicles[0]!.pose.position.z < before.z - 0.5);
    assert.ok(s.fleet.vehicles[0]!.pose.position.z > bounds.maxZ, "inward motion is not a relocation to the margin");
  }
});

test("legacy stationary/disabled/unpowered turns keep actual hull/view headings coherent and preserve ordinary drains", () => {
  for (const mode of ["stationary", "station-keep", "unpowered", "disabled"] as const) {
    let s = staged("compact", { x: WORLD_BOUNDS.maxX, y: -24, z: 0 }, Math.PI / 2);
    const h = s.fleet.vehicles[0]!;
    if (mode === "unpowered") h.charge = 0;
    if (mode === "disabled") disableVehicle(s, h.id);
    if (mode === "station-keep") s = command(s, "station-keep");
    s.player.graceSeconds = 0;
    coherent(s);
    const initial = structuredClone(s), original = { ...s.fleet.vehicles[0]!.pose.position };
    for (let i = 0; i < 60; i++) {
      s = stepGame(s, [{ type: "look", yawDelta: 0.8, pitchDelta: 0 }], world).state;
      coherent(s);
      assert.deepEqual(s.fleet.vehicles[0]!.pose.position, original);
      assert.equal(s.player.pose.yaw, s.fleet.vehicles[0]!.pose.yaw);
    }
    assert.ok(Math.abs(s.player.vitals.food - (initial.player.vitals.food - 70 / 2100)) < 1e-10);
    assert.deepEqual(s.inventory.items, initial.inventory.items);
    assert.equal(s.fleet.vehicles[1]!.charge, initial.fleet.vehicles[1]!.charge);
    assert.equal(s.fleet.vehicles[1]!.health, initial.fleet.vehicles[1]!.health);
    if (mode === "unpowered" || mode === "disabled") {
      assert.equal(s.fleet.vehicles[0]!.charge, initial.fleet.vehicles[0]!.charge);
      assert.ok(Math.abs(s.fleet.vehicles[0]!.emergencyAir - 119) < 1e-10);
    } else assert.ok(Math.abs(s.fleet.vehicles[0]!.charge - (initial.fleet.vehicles[0]!.charge - 0.015)) < 1e-10);
    s = command(s, "station-keep");
    s = command(s, "leave-helm");
    assert.deepEqual(s.fleet.vehicles[0]!.pose.position, original);
    assert.equal(s.player.mode, "interior");
    assert.ok(world.clearance(s.player.pose.position, { radius: 0.34, height: 1.75 }));
    assert.match(s.feedback, /World edge/);
    coherent(s);
  }
});

test("legacy medium corner access either uses a physically clear dry passage or refuses atomically until a safe turn", () => {
  let s = staged("medium", { x: WORLD_BOUNDS.maxX, y: -24, z: WORLD_BOUNDS.maxZ }, 50 * Math.PI / 180);
  s.fleet.vehicles[0]!.charge = 0;
  s = command(s, "station-keep");
  const before = structuredClone(s);
  const refusal = executeCommand(s, { type: "carrier", action: "leave-helm" }, world);
  assert.ok(refusal.events.some((e) => e.type === "notice" && e.error));
  assert.deepEqual(refusal.state, before);
  coherent(refusal.state);
  s = stepGame(s, [{ type: "look", yawDelta: -5 * Math.PI / 180, pitchDelta: 0 }], world).state;
  coherent(s);
  s = command(s, "leave-helm");
  assert.equal(s.player.mode, "interior");
  assert.deepEqual(s.fleet.vehicles[0]!.pose.position, before.fleet.vehicles[0]!.pose.position);
  assert.equal(s.fleet.vehicles[0]!.charge, 0);
  assert.ok(world.clearance(s.player.pose.position, { radius: 0.34, height: 1.75 }));
});

test("old overhanging interiors stop at the world plane while safe local walking and helm transitions remain available", () => {
  let s = staged("compact", { x: NORTH_X, y: -24, z: NZ - 1 }, 0);
  s = command(s, "station-keep");
  s = command(s, "leave-helm");
  for (let i = 0; i < 200; i++) {
    s = stepGame(s, [move(-1)], world).state;
    coherent(s);
  }
  assert.ok(s.player.pose.position.z <= WORLD_BOUNDS.maxZ);
  const contact = structuredClone(s.player.interiorPose);
  s = stepGame(s, [move(-1)], world).state;
  assert.deepEqual(s.player.interiorPose, contact);
  s = stepGame(s, [move(0, 1)], world).state;
  assert.ok(s.player.interiorPose!.position.x > contact!.position.x);
  s = stepGame(s, [move(1)], world).state;
  assert.ok(s.player.interiorPose!.position.z < contact!.position.z);
  s = command(s, "helm");
  s = command(s, "station-keep");
  s = command(s, "leave-helm");
  coherent(s);
});

test("restricting travel before a sweep preserves real obstruction/terrain checks and never projects an old hull to the new margin", () => {
  const origin = { x: WORLD_BOUNDS.maxX - 8, y: -24, z: 0 }, shape = HULL_COLLIDERS.hearthline;
  const blocked = createWorldQueries([{ id: "legacy-inward-wall", min: { x: origin.x - 21, y: -30, z: -30 },
    max: { x: origin.x - 20, y: 0, z: 30 } }], () => -200);
  const still = moveHull(blocked, origin, { x: 0, y: 0, z: 0 }, shape, bounds);
  assert.deepEqual(still.position, origin);
  const inward = moveHull(blocked, origin, { x: -10, y: 0, z: 0 }, shape, bounds);
  assert.ok(inward.hitSolid);
  assert.ok(inward.position.x > origin.x - 3 && inward.position.x < origin.x);
  const terrain = createWorldQueries([], (x) => x < origin.x - 20 ? -1 : -200);
  const shelf = moveHull(terrain, origin, { x: -10, y: 0, z: 0 }, shape, bounds);
  assert.ok(shelf.hitSolid);
  assert.ok(shelf.position.x >= origin.x - 3);
  // Callers without the additive carrier bounds keep their existing origin
  // boundary semantics: no incidental swimmer/Dart movement change.
  const empty = createWorldQueries([], () => -200);
  assert.equal(empty.moveCapsule({ x: WORLD_BOUNDS.maxX - 1, y: -24, z: 0 }, { x: 5, y: 0, z: 0 }, { radius: 0.34, height: 0.95 }).position.x, WORLD_BOUNDS.maxX);
  assert.equal(moveHull(empty, { x: WORLD_BOUNDS.maxX - 1, y: -24, z: 0 }, { x: 5, y: 0, z: 0 }, HULL_COLLIDERS.dart).position.x, WORLD_BOUNDS.maxX);
});

test("an impossible outward boundary launch/exit refuses atomically; empty supported reconfiguration remains saveable", () => {
  let s = staged("compact", { x: 65, y: -0.9, z: bounds.minZ }, 0);
  s = command(s, "station-keep");
  const before = structuredClone(s);
  const result = executeCommand(s, { type: "carrier", action: "launch", vehicleId: "fixture_dart" }, world);
  assert.ok(result.events.some((e) => e.type === "notice" && e.error));
  assert.deepEqual(result.state, before);
  coherent(result.state);
  s = staged("compact", { x: NORTH_X, y: -0.9, z: NZ - 1 }, 0);
  s = command(s, "station-keep");
  s = command(s, "leave-helm");
  const denied = executeCommand(s, { type: "carrier", action: "leave-interior" }, world);
  assert.ok(denied.events.some((e) => e.type === "notice" && e.error));
  assert.deepEqual(denied.state, s);
  s = fixtureGame();
  s.fleet.vehicles[0]!.pose.position.y = -0.9;
  for (const v of s.fleet.vehicles) if (v.berth) {
    v.berth = null;
    v.pose.position = { x: v.hull === "dart" ? 120 : 140, y: -1, z: 40 };
  }
  updateBerth(s, world);
  for (let i = 0; i < 4; i++) s = command(s, "reconfigure");
  assert.equal(s.fleet.docking!.configuration, "compact");
});

test("a legacy turn stops at an intermediate arc extremum even when the requested endpoint fits", () => {
  let s = staged("medium", { x: NORTH_X, y: -24, z: NZ - 3.1 }, 4.7);
  const h = s.fleet.vehicles[0]!;
  const endpoint = localToWorld(BERTH_LOCAL[0]!, { ...h, pose: { ...h.pose, yaw: 5.5 } });
  assert.ok(endpoint.z < WORLD_BOUNDS.maxZ);
  s = stepGame(s, [{ type: "look", yawDelta: 0.8, pitchDelta: 0 }], world).state;
  coherent(s);
  assert.ok(s.player.pose.yaw > 4.7 && s.player.pose.yaw < 5.034);
  const contact = s.player.pose.yaw;
  for (let i = 0; i < 20; i++) {
    s = stepGame(s, [{ type: "look", yawDelta: 0.8, pitchDelta: 0 }], world).state;
    coherent(s);
    assert.ok(Math.abs(s.player.pose.yaw - contact) < 1e-10);
  }
  s = stepGame(s, [{ type: "look", yawDelta: -0.8, pitchDelta: 0 }], world).state;
  coherent(s);
  assert.ok(s.player.pose.yaw < contact - 0.7);
});

test("supported boundary vestibule transitions stay inside the world and a legacy impossible exterior exit is atomic", () => {
  for (const configuration of ["compact", "medium"] as const) for (const edge of edges)
    for (const yaw of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      let s = staged(configuration, { x: edge.x, y: -0.9, z: edge.z }, yaw);
      s = command(s, "station-keep");
      s = command(s, "leave-helm");
      // Labelled diagnostic walking destination; ordinary walking itself is
      // tested above and is not falsely claimed as this transition's route.
      s.player.interiorPose!.position = { ...CARRIER_LAYOUT.vestibule };
      s.player.pose.position = localToWorld(s.player.interiorPose!.position, s.fleet.vehicles[0]!);
      coherent(s);
      const before = structuredClone(s.fleet);
      s = command(s, "leave-interior");
      s = command(s, "enter-interior");
      assert.deepEqual(s.fleet, before);
    }
  let s = staged("medium", { x: WORLD_BOUNDS.maxX - 4, y: -24, z: 0 }, 0);
  s = command(s, "station-keep");
  s = command(s, "leave-helm");
  s.player.interiorPose!.position = { ...CARRIER_LAYOUT.vestibule };
  s.player.pose.position = localToWorld(s.player.interiorPose!.position, s.fleet.vehicles[0]!);
  coherent(s);
  const refusal = executeCommand(s, { type: "carrier", action: "leave-interior" }, world);
  assert.ok(refusal.events.some((e) => e.type === "notice" && e.error && /blocked/.test(e.message)));
  assert.deepEqual(refusal.state, s);
  coherent(refusal.state);
});

test("strict codec validation still rejects an out-of-world assembly instead of clamping individual attachments", () => {
  const s = staged("compact", { x: NORTH_X, y: -1.5, z: NZ - 1 }, 0);
  const h = s.fleet.vehicles[0]!;
  h.pose.position.z += 0.03;
  s.player.pose.position = { ...h.pose.position };
  updateBerth(s, world);
  const envelope = createEnvelope(s, meta);
  assert.equal(encodeSave(envelope).ok, false);
  assert.equal(decodeSave(JSON.stringify(envelope)).ok, false);
});

test("legacy corner contact uses the exact saved yaw representation without rounding an attached origin outside", () => {
  let s = staged("compact", { x: WORLD_BOUNDS.minX + 2.46602540478444, y: -0.9, z: WORLD_BOUNDS.minZ + 3.0980762123533 }, 2 * Math.PI / 3);
  for (let i = 0; i < 30; i++) {
    s = stepGame(s, [{ type: "look", yawDelta: -0.8, pitchDelta: 0 }], world).state;
    coherent(s);
  }
});

test("a requested legacy turn endpoint stays saveable when its recomputed arc endpoint rounds differently", () => {
  // Adjacent doubles at the north edge, re-derived by bisection for the envelope.
  const position = { x: NORTH_X, y: -24, z: 156.83324334669499 };
  const before = staged("compact", position, 1.6680903988919056);
  const result = stepGame(before, [{ type: "look", yawDelta: -0.06564769841653488, pitchDelta: 0 }], world);
  coherent(result.state);
  const h = result.state.fleet.vehicles[0]!;
  assert.deepEqual(h.pose.position, position);
  assert.equal(result.state.player.pose.yaw, h.pose.yaw);
  assert.ok(h.pose.yaw < before.player.pose.yaw - 0.06, "the safe part of the requested turn remains available");
  assert.ok(result.state.fleet.vehicles[2]!.pose.position.z <= WORLD_BOUNDS.maxZ);
  assert.ok(result.events.some((e) => e.type === "foundation-boundary"));
});

test("a nearby safe legacy endpoint retains its exact requested heading", () => {
  const position = { x: NORTH_X, y: -24, z: 156.83324334669496 };
  const before = staged("compact", position, 1.6680903988919056);
  const result = stepGame(before, [{ type: "look", yawDelta: -0.06564769841653488, pitchDelta: 0 }], world);
  coherent(result.state);
  const h = result.state.fleet.vehicles[0]!;
  assert.deepEqual(h.pose.position, position);
  assert.equal(result.state.player.pose.yaw, h.pose.yaw);
  assert.equal(h.pose.yaw, 1.602442700475371);
  assert.equal(result.events.some((e) => e.type === "foundation-boundary"), false);
});

// --- Fast smokes (TT-1). The full 2000-tick route and every edge and
// configuration are in tests/carrier-boundary.heavy.test.ts.

test("smoke: the first 500 ticks of the carrier's ascent and reverse stay coherent and keep cargo and identities", () => {
  let s = roundTrip(fixtureGame());
  const items = structuredClone(s.inventory.items), identities = s.fleet.vehicles.map((v) => v.id);
  s = executeCommand(s, { type: "carrier", action: "helm" }, world).state;
  s = play(s, 300, [move(0, 0, 1)], world);
  coherent(s);
  for (let i = 0; i < 200; i++) {
    s = stepGame(s, [move(-1), { type: "look", yawDelta: 0, pitchDelta: -s.player.pose.pitch }], world).state;
    coherent(s);
  }
  assert.deepEqual(s.inventory.items, items);
  assert.deepEqual(s.fleet.vehicles.map((v) => v.id), identities);
});

test("smoke: a medium carrier at a corner edge launches and captures through prepared and lock interruptions with one vehicle", () => {
  const edge = edges[4]!, yaw = (Math.atan2(448 - edge.x, -(-736 - edge.z)) + Math.PI * 2) % (Math.PI * 2);
  let s = staged("medium", { x: edge.x, y: -0.9, z: edge.z }, yaw);
  s = command(s, "station-keep");
  s = command(s, "leave-helm");
  const ids = s.fleet.vehicles.map((v) => v.id), items = structuredClone(s.inventory.items);
  for (const type of ["launch", "capture"] as const) {
    s = command(s, type, "fixture_creel");
    for (const phase of ["prepared", "lock"]) {
      if (phase === "lock") s = stepGame(s, [], world).state;
      s = roundTrip(s);
      assert.equal(s.fleet.docking!.transaction!.phase, phase);
      let stopped = command(s, "interrupt");
      stopped = play(stopped, 35, [], world);
      coherent(stopped);
      assert.equal(!!stopped.fleet.vehicles.find((v) => v.id === "fixture_creel")!.berth, type === "launch");
    }
    for (let i = 0; i < 60; i++) { s = stepGame(s, [], world).state; coherent(s); }
    assert.equal(!!s.fleet.vehicles.find((v) => v.id === "fixture_creel")!.berth, type === "capture");
    assert.deepEqual(s.fleet.vehicles.map((v) => v.id), ids);
    assert.deepEqual(s.inventory.items, items);
  }
});
