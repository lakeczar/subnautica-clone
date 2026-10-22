import test from "node:test";
import assert from "node:assert/strict";
import { fixtureGame } from "../src/sim/carrier.js";
import { disableVehicle } from "../src/sim/recovery.js";
import { addItem } from "../src/sim/inventory.js";
import { craft, discover } from "../src/sim/progression.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import { RECIPES } from "../src/content/registry.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import type { GameCommand, GameState } from "../src/sim/types.js";

const world = createWorldQueries();
function snapshot(s: GameState): GameState {
  const encoded = encodeSave(createEnvelope(s, {
    sessionId: "a0-command-snapshot",
    createdAt: "2026-10-17T12:00:00.000Z",
    savedAt: "2026-10-17T12:00:00.000Z",
  }));
  assert.equal(encoded.ok, true, encoded.ok ? "" : encoded.error);
  const decoded = decodeSave(encoded.value);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.value.state, s);
  return decoded.value.state;
}
function command(s: GameState, c: GameCommand): GameState {
  const result = executeCommand(s, c, world);
  assert.ok(!result.events.some((e) => e.type === "notice" && e.error), result.state.feedback);
  assert.equal(result.state.tick, s.tick);
  return result.state;
}
function disabledDart(): GameState {
  const s = fixtureGame();
  // Seed the actual production fixture's Dart and earn the retained rescue kit.
  s.player.interiorId = null;
  s.player.interiorPose = null;
  s.player.mode = "walking";
  s.player.pose.position = { x: 0, y: 0.18, z: 14 };
  discover(s, "C02");
  for (const id of ["pod_repair", "essential_tools", "suit_150", "bobbin_kit"] as const) {
    for (const [kind, quantity] of Object.entries(RECIPES[id].cost))
      addItem(s, kind as "structural_alloy", quantity, "pod_locker");
    assert.equal(craft(s, id, world), null);
  }
  const v = s.fleet.vehicles[1]!;
  v.berth = null;
  v.pose.position = { x: 93, y: -88, z: -96 };
  disableVehicle(s, v.id);
  s.player.mode = "swimming";
  s.player.pose.position = { ...v.pose.position, x: v.pose.position.x + 5 };
  return snapshot(s);
}

test("paused carrier helm, station keeping and leave-helm commands each save immediately without a tick", () => {
  let s = snapshot(fixtureGame());
  s = snapshot(command(s, { type: "carrier", action: "helm" }));
  assert.deepEqual(s.player.pose.position, s.fleet.vehicles[0]!.pose.position);
  const refused = executeCommand(s, { type: "carrier", action: "leave-helm" }, world);
  assert.ok(refused.events.some((e) => e.type === "notice" && e.error && /station keeping/.test(e.message)));
  snapshot(refused.state);
  s = snapshot(command(s, { type: "carrier", action: "station-keep" }));
  s = snapshot(command(s, { type: "carrier", action: "leave-helm" }));
  assert.equal(s.player.mode, "interior");
});

test("field repair during a paused local tow closes its operation in the same saveable command", () => {
  let s = disabledDart();
  const before = structuredClone(s.fleet.vehicles[1]!);
  s = snapshot(command(s, { type: "recover", vehicleId: before.id, method: "tow" }));
  assert.equal(s.recovery.operation?.phase, "tow");
  s = snapshot(command(s, { type: "recover", vehicleId: before.id, method: "repair" }));
  assert.equal(s.recovery.operation, null);
  assert.equal(s.fleet.vehicles[1]!.disabled, false);
  const pose = structuredClone(s.fleet.vehicles[1]!.pose.position);
  s = stepGame(s, [], world).state;
  assert.deepEqual(s.fleet.vehicles[1]!.pose.position, pose);
  assert.equal(s.fleet.vehicles[1]!.cargoId, before.cargoId);
  // C4: the swimming diver breathes from the parked Dart's air line, a tiny draw.
  assert.ok(Math.abs(s.fleet.vehicles[1]!.charge - before.charge) < 0.001);
  snapshot(s);
});

test("refused repair is atomic and incapacity cancels a tow without moving or duplicating its target", () => {
  let s = disabledDart();
  const id = s.fleet.vehicles[1]!.id;
  s = snapshot(command(s, { type: "recover", vehicleId: id, method: "tow" }));
  s.world.maintenance.alloy = 0;
  const before = structuredClone(s);
  const refused = executeCommand(s, { type: "recover", vehicleId: id, method: "repair" }, world);
  assert.ok(refused.events.some((e) => e.type === "notice" && e.error));
  assert.deepEqual(refused.state, before);
  snapshot(refused.state);
  s = snapshot(command(s, { type: "carrier", action: "failure-drill" }));
  assert.equal(s.recovery.operation, null);
  assert.deepEqual(s.fleet.vehicles, before.fleet.vehicles);
  assert.equal(s.player.refugeId, "home_pod");
});
