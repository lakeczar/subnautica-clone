import test from 'node:test';
import assert from 'node:assert/strict';
import { DART_BUILD_POSE, DART_BUILD_YAW, HULL_COLLIDERS, RECIPES, type ItemKind } from '../src/content/registry.js';
import { createWorldQueries, hullClearance, moveHull, sweptHullClearance } from '../src/sim/world.js';
import { craft, discover } from '../src/sim/progression.js';
import { makeVehicle } from '../src/sim/state.js';
import { addItem } from '../src/sim/inventory.js';
import { disableVehicle } from '../src/sim/recovery.js';
import { executeCommand, stepGame } from '../src/sim/step.js';
import { createEnvelope, decodeSave, encodeSave } from '../src/save/codec.js';
import { faceTarget, readyState } from './targeting-support.js';
import type { GameState } from '../src/sim/types.js';

/** Paid recipe fixture, distinct from the ordinary imported-prefab play in 1B. */
function fabricated(): GameState {
  const s = readyState(), world = createWorldQueries(); discover(s, "C03");
  for (const id of ["pod_repair", "essential_tools", "suit_150", "restore_workshop", "dart_base"] as const) {
    const r = RECIPES[id];
    if (r.site === "island_workshop") { s.player.pose.position = { x: 10, y: 1.2, z: -36 }; s.player.mode = "walking"; }
    for (const [kind, n] of Object.entries(r.cost)) addItem(s, kind as ItemKind, n, id === "restore_workshop" ? "diver" : r.site === "island_workshop" ? "workshop_locker" : "pod_locker");
    assert.equal(craft(s, id, world), null);
  }
  return s;
}

function piloting(): GameState {
  const s = fabricated(), world = createWorldQueries(), v = s.fleet.vehicles[0]!;
  s.player.pose.position = { x: 20, y: -0.5, z: -18.5 }; s.player.mode = "swimming";
  assert.ok(world.clearance(s.player.pose.position, { radius: 0.34, height: 0.95 }));
  faceTarget(s, v.id);
  const out = executeCommand(s, { type: "interact" }, world);
  assert.equal(out.state.player.controlledVehicleId, v.id);
  return out.state;
}

test('Dart construction, cradle rail obstruction and sea approach use its full shared footprint', () => {
  const world = createWorldQueries(), shape = HULL_COLLIDERS.dart;
  assert.equal(hullClearance(world, DART_BUILD_POSE, shape), true);
  assert.equal(hullClearance(world, { ...DART_BUILD_POSE, x: 22 }, shape), false);
  const exit = moveHull(world, DART_BUILD_POSE, { x: 0, y: 0, z: 10 }, shape);
  assert.equal(exit.hitSolid, false);
  assert.ok(exit.position.z > -12.01);
  const side = moveHull(world, DART_BUILD_POSE, { x: 12, y: 0, z: 0 }, shape);
  assert.equal(side.hitSolid, true);
  assert.ok(side.position.x < 20.71);
});

test('a clear centre cannot authorize hull launch or travel through a raised footprint edge', () => {
  const base = createWorldQueries([]), world = { ...base, groundHeight: (x: number) => x > 2 ? -1 : -20 };
  const shape = HULL_COLLIDERS.dart, start = { x: -4, y: -8, z: 0 };
  assert.equal(hullClearance(world, start, shape), true);
  assert.equal(hullClearance(world, { x: 0, y: -8, z: 0 }, shape), false);
  const result = moveHull(world, start, { x: 10, y: 0, z: 0 }, shape);
  assert.equal(result.hitSolid, true);
  assert.ok(result.position.x < -1.59);
});

test('only new Dart fabrication turns to the clear lane; ordinary simulated W departure clears the actual world', () => {
  const world = createWorldQueries(), s = piloting(), v = s.fleet.vehicles[0]!;
  assert.equal(v.pose.yaw, Math.PI); assert.equal(v.pose.yaw, DART_BUILD_YAW);
  assert.equal(makeVehicle("neutral", "dart", DART_BUILD_POSE, "hold").pose.yaw, 0);
  assert.equal(makeVehicle("other", "creel", DART_BUILD_POSE, "hold").pose.yaw, 0);
  assert.ok(sweptHullClearance(world, [DART_BUILD_POSE, { ...DART_BUILD_POSE, z: 3 }], HULL_COLLIDERS.dart));
  const oldContact = moveHull(world, DART_BUILD_POSE, { x: 0, y: 0, z: -25 }, HULL_COLLIDERS.dart);
  assert.ok(oldContact.hitSolid); assert.ok(Math.abs(oldContact.position.z - DART_BUILD_POSE.z) < 5);
  let current = s;
  for (let i = 0; i < 180; i++) {
    const out = stepGame(current, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], world);
    assert.ok(!out.events.some(e => e.type === "impact")); current = out.state;
  }
  const departed = current.fleet.vehicles[0]!;
  assert.equal(departed.health, 100); assert.ok(departed.pose.position.z > -1);
  assert.ok(current.metrics.pilotMetres > 20); assert.ok(departed.charge < 100);
});

test('legacy yaw-zero headings and shapes survive save decoding and boarding without reorientation', () => {
  const s = fabricated(), v = s.fleet.vehicles[0]!; v.pose.yaw = 0; v.pose.pitch = 0.2;
  const encoded = encodeSave(createEnvelope(s, { sessionId: "legacy-heading", createdAt: "2026-10-18T06:00:00.000Z", savedAt: "2026-10-18T06:00:00.000Z" }));
  assert.ok(encoded.ok);
  const decoded = decodeSave(encoded.value); assert.ok(decoded.ok); assert.deepEqual(decoded.value.state, s);
  const loaded = decoded.value.state;
  loaded.player.pose.position = { x: 20, y: -0.5, z: -18.5 }; loaded.player.mode = "swimming"; faceTarget(loaded, v.id);
  const out = executeCommand(loaded, { type: "interact" }, createWorldQueries());
  assert.equal(out.state.player.controlledVehicleId, v.id); assert.equal(out.state.player.pose.yaw, 0);
  assert.equal(out.state.player.pose.pitch, 0.2); assert.deepEqual(out.state.fleet.vehicles[0]!.pose, v.pose);
});

test('real damaging contacts emit positive detached actual hull loss, clipped at zero, without changing the damage rule', () => {
  const world = createWorldQueries();
  for (const health of [100, 0.01, 0]) {
    const s = piloting(), v = s.fleet.vehicles[0]!;
    v.health = health; v.pose.position.x = 20.6;
    if (health === 0) disableVehicle(s, v.id);
    v.velocity.x = 11;
    s.player.pose.position = { ...v.pose.position }; s.player.velocity = { ...v.velocity };
    const out = stepGame(s, [{ type: "move", forward: 0, right: -1, vertical: 0, sprint: true }], world);
    const after = out.state.fleet.vehicles[0]!, impacts = out.events.filter(e => e.type === "impact");
    assert.equal(impacts.length, health > 0 ? 1 : 0);
    if (health > 0) {
      const e = impacts[0]!; assert.equal(e.hullLoss, health - after.health); assert.equal(e.speed, 11);
      assert.ok(Math.abs(e.hullLoss - Math.min(health, (11 - 4) / 60 * 10)) < 1e-12);
      assert.deepEqual(e.origin, after.pose.position); assert.notStrictEqual(e.origin, after.pose.position);
      e.origin.x = 999; assert.notEqual(after.pose.position.x, 999);
    }
    assert.equal(s.fleet.vehicles[0]!.health, health, "input is immutable");
    const encoded = encodeSave(createEnvelope(out.state, { sessionId: "impact-save", createdAt: "2026-10-18T06:00:00.000Z", savedAt: "2026-10-18T06:00:00.000Z" }));
    assert.ok(encoded.ok, encoded.ok ? "" : encoded.error);
    assert.ok(decodeSave(encoded.value).ok);
  }
});

test('low-speed contact and fast unobstructed movement emit no impact events', () => {
  for (const contact of [true, false]) {
    const s = piloting(), v = s.fleet.vehicles[0]!;
    v.pose.position = contact ? { ...DART_BUILD_POSE, x: 20.69 } : { x: 20, y: -5, z: 0 };
    v.velocity = { x: contact ? 3.9 : 11, y: 0, z: 0 };
    s.player.pose.position = { ...v.pose.position }; s.player.velocity = { ...v.velocity };
    const out = stepGame(s, [], createWorldQueries());
    assert.equal(out.state.fleet.vehicles[0]!.health, 100);
    assert.ok(!out.events.some(e => e.type === "impact"));
  }
});
