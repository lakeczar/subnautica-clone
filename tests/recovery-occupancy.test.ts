import test from "node:test";
import assert from "node:assert/strict";
import { HULL_COLLIDERS, RECIPES, RECOVERY_STAGE } from "../src/content/registry.js";
import type { MaterialId, RecipeId } from "../src/content/registry.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { addItem, available, distance } from "../src/sim/inventory.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { disableVehicle, RECOVERY_MOORING, updateRecovery } from "../src/sim/recovery.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import type { GameCommand, GameState } from "../src/sim/types.js";
import { createWorldQueries, hullClearance, SOLIDS, sweptHullClearance } from "../src/sim/world.js";

const world = createWorldQueries();
const meta = {
  sessionId: "recovery-occupancy-test",
  createdAt: "2026-10-17T12:00:00.000Z",
  savedAt: "2026-10-17T12:00:00.000Z",
};
function roundTrip(s: GameState): GameState {
  const encoded = encodeSave(createEnvelope(s, meta));
  assert.equal(encoded.ok, true, encoded.ok ? "" : encoded.error);
  const decoded = decodeSave(encoded.value);
  assert.equal(decoded.ok, true, decoded.ok ? "" : decoded.error);
  assert.deepEqual(decoded.value.state, s);
  return decoded.value.state;
}
function command(s: GameState, c: GameCommand): GameState {
  const result = executeCommand(s, c, world);
  assert.ok(!result.events.some((e) => e.type === "notice" && e.error), JSON.stringify(result.events));
  assert.equal(result.state.tick, s.tick);
  return roundTrip(result.state);
}
/** Synthetic staging: fund only required gear, then place one disabled Dart.
 * Acquisition/travel evidence comes from the separately retained earned export. */
function fixture(extras: RecipeId[] = []): GameState {
  let s = createGame();
  completeOpening(s);
  discover(s, "C02");
  for (const id of ["pod_repair", "essential_tools", "suit_150", "bobbin_kit", ...extras] as RecipeId[]) {
    if (!RECIPES[id].maintenance)
      for (const [kind, quantity] of Object.entries(RECIPES[id].cost))
        addItem(s, kind as MaterialId, quantity, "pod_locker");
    s = command(s, { type: "craft", recipeId: id });
  }
  const v = makeVehicle("occupancy-dart", "dart", { x: 80, y: -48, z: -89 }, "occupancy-hold");
  v.investment = { ...RECIPES.dart_base.cost };
  v.charge = 28.5;
  v.emergencyAir = 37.5;
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  disableVehicle(s, v.id);
  s.player.controlledVehicleId = v.id;
  s.player.mode = "piloting";
  s.player.pose = structuredClone(v.pose);
  return roundTrip(s);
}

test("occupied tow initiation and ready attachment refuse atomically and remain immediately saveable", () => {
  for (const phase of [null, "ready", "approach", "tow"] as const) {
    const s = fixture(), v = s.fleet.vehicles[0]!;
    addItem(s, "meal", 2, v.cargoId);
    if (phase) s.recovery.operation = { vehicleId: v.id, method: "tow", phase, waypoint: 2, position: { ...v.pose.position } };
    roundTrip(s);
    const before = structuredClone(s);
    const result = executeCommand(s, { type: "recover", vehicleId: v.id, method: "tow" }, world);
    assert.deepEqual(result.state, before, `refusal must retain even an existing ${phase} operation`);
    assert.deepEqual(s, before, "the original command input remains untouched");
    assert.match(JSON.stringify(result.events), /occupied.*exit.*safely.*exterior collar/i);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]!.type === "notice" && result.events[0]!.error, true);
    roundTrip(result.state);
  }
});

test("occupied empty-frame salvage refuses before returning investment, stock or removing ownership", () => {
  let s = fixture(["salvage_buoy"]);
  s = command(s, { type: "buoy" });
  const v = s.fleet.vehicles[0]!;
  v.boundRepairs = 2;
  s.world.maintenance.alloy -= 4;
  s.world.maintenance.membrane -= 2;
  s.recovery.operation = { vehicleId: v.id, method: "tow", phase: "ready", waypoint: 3, position: { ...v.pose.position } };
  const before = structuredClone(roundTrip(s));
  const result = executeCommand(s, { type: "recover", vehicleId: v.id, method: "salvage" }, world);
  assert.deepEqual(result.state, before);
  assert.match(JSON.stringify(result.events), /occupied.*exit.*safely.*exterior collar/i);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]!.type === "notice" && result.events[0]!.error, true);
  roundTrip(result.state);
});

test("paid occupied patch and reserve transfer keep their costs and identity without requiring exit", () => {
  let s = fixture(["reserve_cells"]);
  addItem(s, "meal", 2, s.fleet.vehicles[0]!.cargoId);
  const before = structuredClone(s), v = before.fleet.vehicles[0]!;
  s.recovery.operation = { vehicleId: v.id, method: "tow", phase: "tow", waypoint: 2, position: { ...v.pose.position } };
  s = command(s, { type: "recover", vehicleId: v.id, method: "repair" });
  assert.equal(s.player.controlledVehicleId, v.id);
  assert.deepEqual(s.player, before.player);
  assert.deepEqual(s.fleet.vehicles[0], { ...v, health: 65, disabled: false, emergencyAir: 120, boundRepairs: v.boundRepairs + 1 });
  assert.deepEqual(s.inventory, before.inventory);
  assert.deepEqual(s.world.maintenance, { ...before.world.maintenance, alloy: before.world.maintenance.alloy - 2, membrane: before.world.maintenance.membrane - 1 });
  assert.equal(s.recovery.operation, null);
  assert.deepEqual(s.recovery.losses, []);
  s = command(s, { type: "reserve", vehicleId: v.id });
  assert.equal(s.fleet.vehicles[0]!.charge, v.charge + 35);
  assert.deepEqual(s.inventory.items.filter((i) => i.kind === "reserve_cell").map((i) => i.charge), [0, 100]);
  const afterReserve = structuredClone(s);
  s = stepGame(s, [], world).state;
  assert.ok(s.fleet.vehicles[0]!.charge < afterReserve.fleet.vehicles[0]!.charge, "ordinary powered survival drain still applies");
  roundTrip(s);
});

test("valid old occupied approach, ready and tow snapshots cancel once before movement without service", () => {
  for (const phase of ["approach", "ready", "tow"] as const) {
    let s = fixture();
    const v = s.fleet.vehicles[0]!;
    addItem(s, "meal", 2, v.cargoId);
    s.player.graceSeconds = 0;
    s.player.vitals.food = 70;
    s.recovery.operation = { vehicleId: v.id, method: "tow", phase, waypoint: 2, position: { ...v.pose.position, y: v.pose.position.y + 1 } };
    s = roundTrip(s); // This is a valid legacy save, never an invalid-import repair.
    const before = structuredClone(s), detached = structuredClone(s);
    const event = updateRecovery(detached, world);
    assert.deepEqual(detached, { ...before, recovery: { ...before.recovery, operation: null }, feedback: detached.feedback });
    assert.match(detached.feedback, /stopped.*occupied.*exit.*safely.*exterior collar/i);
    assert.deepEqual(event, { type: "notice", message: detached.feedback, error: true });
    assert.equal(updateRecovery(detached, world), null);
    const control = structuredClone(before);
    control.recovery.operation = null;
    const normal = stepGame(control, [], world);
    const result = stepGame(s, [], world);
    assert.equal(result.state.recovery.operation, null, phase);
    assert.deepEqual(result.state, { ...normal.state, feedback: result.state.feedback }, "only cancellation/report differ from the same normal survival step");
    assert.deepEqual(result.state.fleet.vehicles[0], { ...v, emergencyAir: v.emergencyAir - 1 / 60 });
    assert.deepEqual(result.state.player.pose, before.player.pose);
    assert.ok(result.state.player.vitals.food < before.player.vitals.food);
    assert.deepEqual(result.events.filter((e) => e.type === "notice"), [{ ...event, channel: "hazard", context: "recovery" }]);
    s = roundTrip(result.state);
    for (let i = 0; i < 5; i++) {
      const next = stepGame(s, [], world);
      assert.equal(next.events.filter((e) => e.type === "notice").length, 0);
      s = roundTrip(next.state);
    }
  }
});

test("cancelling an occupied old tow with exhausted cabin air does not refill air, charge or diver oxygen", () => {
  let s = fixture();
  const v = s.fleet.vehicles[0]!;
  v.emergencyAir = 0;
  v.charge = 0;
  s.player.vitals.oxygen = 50;
  s.recovery.operation = { vehicleId: v.id, method: "tow", phase: "tow", waypoint: 2, position: { ...v.pose.position } };
  s = roundTrip(s);
  const result = stepGame(s, [], world);
  assert.equal(result.state.recovery.operation, null);
  assert.equal(result.state.fleet.vehicles[0]!.emergencyAir, 0);
  assert.equal(result.state.fleet.vehicles[0]!.charge, 0);
  assert.equal(result.state.fleet.vehicles[0]!.health, 0);
  assert.ok(result.state.player.vitals.oxygen < s.player.vitals.oxygen);
  roundTrip(result.state);
});

test("occupancy guidance does not bypass personal depth or blocked exit safety", () => {
  for (const blocked of [false, true]) {
    const s = fixture(), v = s.fleet.vehicles[0]!;
    if (!blocked) {
      v.pose.position.y = -160;
      s.player.pose.position = { ...v.pose.position };
    }
    const queries = blocked ? createWorldQueries([...SOLIDS, { id: "occupancy-exit-blocker", min: { x: 82.5, y: -49, z: -90 }, max: { x: 84, y: -46, z: -88 } }]) : world;
    roundTrip(s);
    const result = executeCommand(s, { type: "exit" }, queries);
    assert.deepEqual(result.state, s);
    assert.match(JSON.stringify(result.events), blocked ? /obstructed/ : /exceeds.*personal suit/);
    roundTrip(result.state);
  }
});

test("safe exit permits a complete unoccupied local tow with every step codec-valid and swept", () => {
  let s = fixture();
  const v = s.fleet.vehicles[0]!;
  addItem(s, "meal", 2, v.cargoId);
  s = command(s, { type: "exit" });
  assert.equal(s.player.controlledVehicleId, null);
  assert.equal(s.player.mode, "swimming");
  const before = structuredClone(s);
  s = command(s, { type: "recover", vehicleId: v.id, method: "tow" });
  const notices = [];
  let steps = 0;
  while (s.recovery.operation && steps < 1800) {
    const from = s.fleet.vehicles[0]!.pose.position;
    const next = stepGame(s, [], world);
    const to = next.state.fleet.vehicles[0]!.pose.position;
    assert.ok(distance(from, to) <= 7 / 60 + 1e-9);
    assert.ok(sweptHullClearance(world, [from, to], HULL_COLLIDERS.dart));
    s = roundTrip(next.state);
    notices.push(...next.events.filter((e) => e.type === "notice"));
    steps++;
  }
  assert.ok(steps > 100);
  assert.equal(s.recovery.operation, null);
  assert.deepEqual(s.fleet.vehicles[0], { ...before.fleet.vehicles[0]!, pose: { ...before.fleet.vehicles[0]!.pose, position: { ...RECOVERY_MOORING } } });
  assert.deepEqual(s.inventory, before.inventory);
  assert.deepEqual(s.world.maintenance, before.world.maintenance);
  assert.deepEqual(s.knowledge, before.knowledge);
  assert.deepEqual(s.recovery.losses, [{ vehicleId: v.id, visited: true, position: { ...RECOVERY_MOORING } }]);
  assert.equal(s.metrics.rescues, before.metrics.rescues + 1);
  assert.equal(notices.filter((e) => e.type === "notice" && /moored/.test(e.message)).length, 1);
  assert.ok(hullClearance(world, s.fleet.vehicles[0]!.pose.position, HULL_COLLIDERS.dart));
  assert.equal(stepGame(s, [], world).state.metrics.rescues, s.metrics.rescues);
});

test("unoccupied staged ready attachment remains available and salvage returns complete investment exactly once", () => {
  let s = fixture(["salvage_buoy"]);
  s = command(s, { type: "exit" });
  const id = s.fleet.vehicles[0]!.id;
  s.player.pose.position = { ...RECOVERY_STAGE }; // Synthetic staging, not travel evidence.
  s = command(s, { type: "recover", vehicleId: id, method: "tow" });
  for (let i = 0; s.recovery.operation?.phase === "approach" && i < 1000; i++)
    s = roundTrip(stepGame(s, [], world).state);
  assert.equal(s.recovery.operation?.phase, "ready");
  s = command(s, { type: "recover", vehicleId: id, method: "tow" });
  assert.equal(s.recovery.operation?.phase, "tow");
  for (let i = 0; s.recovery.operation && i < 1800; i++) s = roundTrip(stepGame(s, [], world).state);
  assert.equal(s.recovery.operation, null);
  const v = s.fleet.vehicles[0]!;
  v.boundRepairs = 2;
  s.world.maintenance.alloy -= 4;
  s.world.maintenance.membrane -= 2;
  s = command(s, { type: "buoy" });
  const before = structuredClone(s);
  s = command(s, { type: "recover", vehicleId: id, method: "salvage" });
  assert.equal(s.fleet.vehicles.length, 0);
  assert.ok(!s.inventory.containers.some((c) => c.id === v.cargoId));
  for (const [kind, quantity] of Object.entries(v.investment))
    assert.equal(available(s, kind as MaterialId, ["buoy_hold"]), available(before, kind as MaterialId, ["buoy_hold"]) + quantity);
  assert.deepEqual(s.world.maintenance, { ...before.world.maintenance, alloy: before.world.maintenance.alloy + 4, membrane: before.world.maintenance.membrane + 2 });
  assert.deepEqual(s.knowledge, before.knowledge);
  assert.equal(s.player.controlledVehicleId, null);
  assert.deepEqual(s.recovery.losses, []);
  const duplicate = executeCommand(s, { type: "recover", vehicleId: id, method: "salvage" }, world);
  assert.deepEqual(duplicate.state, s);
  assert.equal(duplicate.events[0]!.type === "notice" && duplicate.events[0]!.error, true);
  roundTrip(duplicate.state);
});
