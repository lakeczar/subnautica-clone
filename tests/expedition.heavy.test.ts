// M1 expedition, heavy tier (TT-1): the tow resumed from all thirteen saved operation cuts.
// tests/expedition.test.ts keeps the rest and a two-cut smoke.
import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES } from "../src/content/registry.js";
import type { RecipeId } from "../src/content/registry.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening,
  craft,
  discover } from "../src/sim/progression.js";
import { addItem,
  distance } from "../src/sim/inventory.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { createWorldQueries, hullClearance, sweptHullClearance } from "../src/sim/world.js";
import { HULL_COLLIDERS } from "../src/content/registry.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { disableVehicle,
  RECOVERY_MOORING,
  RECOVERY_NOTICES } from "../src/sim/recovery.js";
import type { GameEvent, GameState } from "../src/sim/types.js";

const world = createWorldQueries();
const ready = (): GameState => {
  const s = createGame();
  completeOpening(s);
  return s;
};
const roundTrip = (s: GameState): GameState => {
  const a = createEnvelope(s, {
      sessionId: "m1-test-session",
      createdAt: "2026-10-17T12:00:00.000Z",
      savedAt: "2026-10-17T12:00:00.000Z",
    }),
    encoded = encodeSave(a);
  assert.equal(encoded.ok, true, encoded.ok ? "" : encoded.error);
  const decoded = decodeSave(encoded.value);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.value.state, s);
  return decoded.value.state;
};
function fund(s: GameState, id: RecipeId): void {
  for (const [k, n] of Object.entries(RECIPES[id].cost))
    addItem(s, k as "structural_alloy", n, "pod_locker");
}
function prepare(): GameState {
  const s = ready();
  discover(s, "C02");
  for (const id of [
    "pod_repair",
    "essential_tools",
    "suit_150",
    "salvage_buoy",
    "reserve_cells",
    "bobbin_kit",
  ] as const) {
    if (id !== "bobbin_kit") fund(s, id);
    assert.equal(craft(s, id, world), null);
  }
  return s;
}
function dartGame(): GameState {
  const s = prepare();
  discover(s, "C03");
  s.player.pose.position = { x: 10, y: 1.2, z: -34 };
  for (const id of ["restore_workshop", "dart_base"] as const) {
    for (const [k, n] of Object.entries(RECIPES[id].cost))
      addItem(s, k as "structural_alloy", n, id === "restore_workshop" ? "diver" : "workshop_locker");
    assert.equal(craft(s, id, world), null);
  }
  return s;
}

test("saved operation phase cuts and attachment offsets resume a fully swept tow with immediately valid saves", () => {
  const deep = { x: 95.29085223262864, y: -91.62861156955663, z: -98.03837674249381 };
  const keel = [RECOVERY_MOORING, { x: 57, y: -10, z: -65 }, { x: 80, y: -48, z: -89 }, deep];
  const cuts: { phase: "approach" | "ready" | "tow"; waypoint: number; offset: number }[] = [
    ...[0, 1, 2, 3].map((waypoint) => ({ phase: "approach" as const, waypoint, offset: 1 })),
    { phase: "ready", waypoint: 3, offset: 1 },
    ...[0, 1, 2, 3].flatMap((waypoint) => [0, 1].map((offset) => ({ phase: "tow" as const, waypoint, offset }))),
  ];
  for (const cut of cuts) {
    let s = dartGame();
    const v = s.fleet.vehicles[0]!;
    v.pose.position = { ...(cut.phase === "tow" ? keel[Math.min(3, cut.waypoint + 1)]! : deep) };
    v.pose.yaw = 1.4;
    v.charge = 38.75;
    addItem(s, "meal", 2, v.cargoId);
    disableVehicle(s, v.id);
    s.player.pose.position = { x: 46, y: -12, z: -54 };
    s.player.mode = "swimming";
    const guide = cut.phase === "approach"
      ? [{ x: 46, y: -12, z: -54 }, { x: 46, y: -12, z: -54 }, { x: 57, y: -9, z: -65 }, { x: 80, y: -47, z: -89 }][cut.waypoint]!
      : { ...v.pose.position, y: v.pose.position.y + cut.offset };
    s.recovery.operation = { vehicleId: v.id, routeId: "canopy", method: "tow", phase: cut.phase, waypoint: cut.waypoint, position: { ...guide } };
    s = roundTrip(s);
    const before = structuredClone(s), notices: GameEvent[] = [];
    for (let i = 0; s.recovery.operation && i < 2500; i++) {
      if (s.recovery.operation.phase === "ready") {
        const tick = s.tick;
        s = executeCommand(s, { type: "recover", vehicleId: v.id, method: "tow" }, world).state;
        assert.equal(s.tick, tick, "paused attachment has no implicit tick");
        s = roundTrip(JSON.parse(JSON.stringify(s)) as GameState);
      }
      const previous = s;
      const result = stepGame(s, [], world);
      s = result.state;
      notices.push(...result.events.filter((e) => e.type === "notice"));
      const from = previous.fleet.vehicles[0]!.pose.position, to = s.fleet.vehicles[0]!.pose.position;
      assert.ok(distance(from, to) <= 7 / 60 + 1e-9, "no unchecked completion snap");
      assert.ok(sweptHullClearance(world, [from, to], HULL_COLLIDERS.dart), JSON.stringify({ cut, from, to }));
      if (previous.recovery.operation?.waypoint !== s.recovery.operation?.waypoint || i % 150 === 0)
        s = roundTrip(JSON.parse(JSON.stringify(s)) as GameState);
    }
    assert.equal(s.recovery.operation, null, JSON.stringify(cut));
    assert.deepEqual(s.fleet.vehicles[0], { ...before.fleet.vehicles[0]!, pose: { ...before.fleet.vehicles[0]!.pose, position: { ...RECOVERY_MOORING } } });
    assert.deepEqual(s.inventory, before.inventory);
    assert.deepEqual(s.knowledge, before.knowledge);
    assert.deepEqual(s.world.maintenance, before.world.maintenance);
    assert.deepEqual(s.world.resources, before.world.resources);
    assert.deepEqual(s.recovery.losses[0]!.position, RECOVERY_MOORING);
    assert.equal(s.metrics.rescues, before.metrics.rescues + 1);
    assert.equal(notices.filter((e) => e.type === "notice" && e.message === RECOVERY_NOTICES.completed).length, 1);
    assert.equal(notices.filter((e) => e.type === "notice" && e.message === RECOVERY_NOTICES.ready).length, cut.phase === "approach" ? 1 : 0);
    assert.equal(stepGame(s, [], world).state.metrics.rescues, s.metrics.rescues);
    assert.ok(hullClearance(world, s.fleet.vehicles[0]!.pose.position, HULL_COLLIDERS.dart));
  }
});
