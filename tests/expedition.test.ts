import test from "node:test";
import assert from "node:assert/strict";
import { EVIDENCE, RECIPES, SOURCES } from "../src/content/registry.js";
import type { RecipeId, SourceId } from "../src/content/registry.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import {
  completeOpening,
  craft,
  discover,
  collect,
  toggleBuoy,
} from "../src/sim/progression.js";
import {
  addItem,
  distance,
  transfer,
  usedCapacity,
} from "../src/sim/inventory.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { exposure, updateThreat } from "../src/sim/survival.js";
import { exitRefusal } from "../src/sim/vehicles.js";
import {
  disableVehicle,
  incapacitate,
  recoveryCommand,
  updateRecovery,
} from "../src/sim/recovery.js";
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
      addItem(s, k as "structural_alloy", n, "workshop_locker");
    assert.equal(craft(s, id, world), null);
  }
  return s;
}
export { ready, prepare, dartGame, roundTrip };

test("opening actions / skip are idempotent; unavailable control never drains survival", () => {
  let s = createGame();
  const original = structuredClone(s.player.vitals);
  for (let i = 0; i < 300; i++)
    s = stepGame(
      s,
      [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: true }],
      world,
    ).state;
  assert.deepEqual(s.player.vitals, original);
  assert.deepEqual(s.player.pose.position, { x: 0, y: 0.18, z: 21.2 });
  for (let i = 0; i < 4; i++)
    s = executeCommand(s, { type: "interact" }, world).state;
  assert.equal(s.opening.phase, 4);
  assert.equal(s.knowledge.evidence.length, 1);
  const snapshot = structuredClone(s);
  s = executeCommand(s, { type: "skip-opening" }, world).state;
  assert.deepEqual(s, snapshot);
  roundTrip(s);
});
test("reef-first and island-first preserve provenance, unlocks and optional-record independence", () => {
  for (const order of [
    ["C02", "C03"],
    ["C03", "C02"],
  ] as const) {
    const s = ready();
    for (const id of order) discover(s, id);
    assert.equal(s.knowledge.journals.length, 0);
    assert.ok(s.knowledge.blueprints.includes("bp_island_workshop"));
    assert.ok(s.knowledge.blueprints.includes("bp_reef_recovery"));
    assert.deepEqual(
      new Set(s.knowledge.evidence.map((e) => e.id)),
      new Set(["C01", "C02", "C03"]),
    );
    for (const f of s.knowledge.evidence)
      assert.equal(f.provenance, EVIDENCE[f.id].provenance);
    roundTrip(s);
  }
});
test("collection/craft/transfer refusals conserve stock, identity and inputs under capacity/location/knowledge/clearance failures", () => {
  const s = ready(),
    initial = structuredClone(s);
  assert.match(craft(s, "dart_base", world)!, /Blueprint/);
  assert.deepEqual(s, initial);
  const id: SourceId = "reef_service_scraps_east";
  s.player.pose.position = { ...SOURCES[id].position };
  addItem(s, "silica_glass", 16, "diver");
  const before = structuredClone(s);
  assert.match(collect(s, id)!, /No room/);
  assert.deepEqual(s, before);
  const item = s.inventory.items[0]!;
  assert.match(transfer(s, item.id, "workshop_locker", 1)!, /accessible/);
  assert.deepEqual(s, before);
  const funded = prepare();
  discover(funded, "C03");
  funded.player.pose.position = { x: 10, y: 1.2, z: -34 };
  for (const rid of ["restore_workshop", "dart_base"] as const)
    for (const [k, n] of Object.entries(RECIPES[rid].cost))
      addItem(funded, k as "structural_alloy", n, "workshop_locker");
  assert.equal(craft(funded, "restore_workshop", world), null);
  const snapshot = structuredClone(funded);
  assert.match(
    craft(funded, "dart_base", { ...world, clearance: () => false })!,
    /clearance/,
  );
  assert.deepEqual(funded, snapshot);
});
test("M1 package, reserve cells and first hull consume the accepted public budget exactly; source stock has two independent patches", () => {
  const s = dartGame();
  assert.deepEqual(s.world.maintenance, { alloy: 14, glass: 0, membrane: 7 });
  assert.equal(s.fleet.vehicles.length, 1);
  assert.deepEqual(s.fleet.vehicles[0]!.investment, {
    structural_alloy: 6,
    silica_glass: 3,
    flex_membrane: 2,
  });
  const totals = { structural_alloy: 0, silica_glass: 0, flex_membrane: 0 };
  for (const [id, r] of Object.entries(RECIPES))
    if (id !== "bobbin_kit")
      for (const [k, n] of Object.entries(r.cost))
        totals[k as keyof typeof totals] += n;
  assert.deepEqual(totals, {
    structural_alloy: 16,
    silica_glass: 11,
    flex_membrane: 13,
  });
  for (const kind of [
    "structural_alloy",
    "silica_glass",
    "flex_membrane",
    "conductive_crust",
    "buoyant_resin",
  ])
    assert.ok(
      Object.values(SOURCES).filter((p) => p.item === kind).length >= 2,
    );
  assert.equal(
    s.inventory.items.filter((i) => i.kind === "reserve_cell").length,
    2,
  );
  roundTrip(s);
});
test("transfer commands report their committed quantity and destination instead of stale collection or craft feedback", () => {
  const s = ready();
  const item = addItem(s, "silica_glass", 4, "diver");
  s.feedback = "Build Dart scout / 180 m complete.";
  const before = structuredClone(s);
  const partial = executeCommand(s, {
    type: "transfer", itemId: item.id, to: "pod_locker", quantity: 1,
  }, world);
  assert.deepEqual(s, before, "commands must leave their input snapshot unchanged");
  assert.equal(partial.state.feedback, "Transferred 1 × Silica glass to pod locker.");
  assert.deepEqual(partial.events, [
    { type: "notice", message: partial.state.feedback },
    { type: "sound", cue: "collect" },
  ]);
  assert.equal(partial.state.inventory.items.find((i) => i.id === item.id)!.quantity, 3);
  assert.equal(partial.state.inventory.items.find((i) => i.containerId === "pod_locker")!.provenance, item.provenance);
  roundTrip(partial.state);

  const full = stepGame(partial.state, [{
    type: "transfer", itemId: item.id, to: "pod_locker", quantity: 3,
  }], world);
  assert.equal(full.state.feedback, "Transferred 3 × Silica glass to pod locker.");
  assert.ok(full.events.some((e) => e.type === "notice" && e.message === full.state.feedback));
  assert.deepEqual(full.state.inventory.items.find((i) => i.id === item.id), {
    ...partial.state.inventory.items.find((i) => i.id === item.id)!, containerId: "pod_locker",
  });
  assert.equal(usedCapacity(full.state, "diver"), 0);
  roundTrip(full.state);
});
test("refused transfer preserves inventory and prior feedback and emits only the refusal", () => {
  const s = ready();
  const item = addItem(s, "silica_glass", 4, "diver");
  s.feedback = "4 × Silica glass → diver hold.";
  const before = structuredClone(s);
  const result = executeCommand(s, {
    type: "transfer", itemId: item.id, to: "workshop_locker", quantity: 2,
  }, world);
  assert.equal(result.state, s);
  assert.deepEqual(result.state, before);
  assert.deepEqual(result.events, [{
    type: "notice", message: "Both containers must be present and accessible.", error: true,
  }]);
});
test("transfer feedback identifies a local craft hold by its registry hull label", () => {
  const s = dartGame();
  const v = s.fleet.vehicles[0]!;
  s.player.pose.position = { ...v.pose.position };
  s.player.mode = "swimming";
  const item = addItem(s, "conductive_crust", 3, "diver");
  const result = executeCommand(s, {
    type: "transfer", itemId: item.id, to: v.cargoId, quantity: 3,
  }, world);
  assert.equal(result.state.feedback, "Transferred 3 × Conductive crust to Dart hold.");
  assert.deepEqual(result.state.inventory.items.find((i) => i.id === item.id), {
    ...item, containerId: v.cargoId,
  });
  roundTrip(result.state);
});
test("deployed buoy has one identity and a separate container; packing loaded or overflowing buoy refuses atomically", () => {
  const s = prepare();
  assert.equal(toggleBuoy(s), null);
  addItem(s, "structural_alloy", 10, "buoy_hold");
  assert.equal(usedCapacity(s, "buoy_hold"), 20);
  assert.equal(usedCapacity(s, "diver"), 4);
  const before = structuredClone(s);
  assert.match(toggleBuoy(s)!, /Empty/);
  assert.deepEqual(s, before);
  roundTrip(s);
  const duplicate = structuredClone(s);
  duplicate.inventory.items.push({
    ...duplicate.inventory.items.find((i) => i.kind === "salvage_buoy")!,
    id: "duplicate_buoy",
  });
  assert.equal(
    encodeSave(
      createEnvelope(duplicate, {
        sessionId: "test-duplicate",
        createdAt: "2026-10-17T12:00:00.000Z",
        savedAt: "2026-10-17T12:00:00.000Z",
      }),
    ).ok,
    false,
  );
});
test("stable airway/body/hull references and exit clearance distinguish personal protection from hull rating", () => {
  const s = ready();
  s.player.pose.position = { x: 100, y: -100, z: -90 };
  s.player.mode = "swimming";
  assert.equal(exposure(s).pressureDepth, 99.6);
  assert.equal(exposure(s).airwayY, -99.15);
  const v = makeVehicle(
    "depth_dart",
    "dart",
    { x: 100, y: -100, z: -90 },
    "depth_hold",
  );
  s.fleet.vehicles.push(v);
  s.player.controlledVehicleId = v.id;
  s.player.mode = "piloting";
  assert.match(exitRefusal(s, world)!, /60 m personal/);
  addItem(s, "suit_150", 1, "equipment", "suit");
  assert.equal(exitRefusal(s, world), null);
  assert.match(
    exitRefusal(s, { ...world, clearance: () => false })!,
    /obstructed/,
  );
});
test("food-empty restart preserves movement, has warned grace and grants accessible emergency food without tooling", () => {
  let s = ready();
  s.player.vitals.food = 0;
  s.player.graceSeconds = 0;
  const health = s.player.vitals.health;
  for (let i = 0; i < 60; i++) s = stepGame(s, [], world).state;
  assert.equal(s.player.vitals.health, health);
  assert.equal(s.player.starvationSeconds, 1.0000000000000013);
  s = executeCommand(s, { type: "emergency-meal" }, world).state;
  assert.equal(s.inventory.items[0]!.kind, "meal");
  s = executeCommand(s, { type: "eat" }, world).state;
  assert.equal(s.player.vitals.food, 70);
  assert.equal(s.knowledge.crafted.length, 0);
});
test("save validation rejects erased retained equipment, false research, excess source stock and unmarked disabled hulls", () => {
  for (const mutate of [
    (s: GameState) => { s.inventory.items = s.inventory.items.filter((i) => i.kind !== "essential_tools"); },
    (s: GameState) => { s.knowledge.blueprints.push("bp_canopy_reinforcement"); },
    (s: GameState) => { s.knowledge.crafted = s.knowledge.crafted.filter((id) => id !== "essential_tools"); },
    (s: GameState) => { s.world.resources[0]!.stock += 1; },
    (s: GameState) => { s.fleet.vehicles[0]!.disabled = true; s.fleet.vehicles[0]!.health = 0; },
  ]) {
    const s = dartGame();
    mutate(s);
    const result = encodeSave(createEnvelope(s, { sessionId: "invalid-m1-state", createdAt: "2026-10-17T12:00:00.000Z", savedAt: "2026-10-17T12:00:00.000Z" }));
    assert.equal(result.ok, false);
  }
});
test("sound hunter warns before pursuit; quiet/cover or a directional distraction permit disengagement", () => {
  const s = prepare();
  s.player.pose.position = { x: 123, y: -110, z: -105 };
  const events: GameEvent[] = [];
  for (let i = 0; i < 60; i++) updateThreat(s, 1, events);
  assert.equal(s.world.threat.mode, "warn");
  assert.ok(events.some((e) => e.type === "notice"));
  for (let i = 0; i < 500; i++) updateThreat(s, 1, events);
  assert.equal(s.world.threat.mode, "pursue");
  s.world.threat.distraction = { x: 145, y: -110, z: -105 };
  s.world.threat.distractionSeconds = 12;
  updateThreat(s, 0, events);
  assert.equal(s.world.threat.mode, "disengage");
});
test("physical laboratory air is safe before its field sheet is read", () => {
  let s = prepare();
  s.player.pose.position = { x: 116, y: -118, z: -126 };
  s.player.mode = "walking";
  s.world.threat.mode = "pursue";
  s.world.threat.interest = 10;
  s.world.threat.position = { x: 116, y: -117, z: -121 };
  assert.equal(s.knowledge.evidence.some((e) => e.id === "C04"), false);
  assert.equal(exposure(s).breathable, true);
  const health = s.player.vitals.health;
  s = stepGame(s, [], world).state;
  assert.equal(s.world.threat.mode, "disengage");
  assert.ok(s.player.vitals.health >= health);
});
test("pursuing hunter uses the same solid sweep instead of crossing a wall", () => {
  const barrier = createWorldQueries([{
    id: "test.threat-wall", min: { x: 128, y: -130, z: -130 }, max: { x: 128.1, y: -80, z: -90 },
  }]);
  let s = prepare();
  s.player.pose.position = { x: 145, y: -110, z: -110 };
  s.world.threat.position = { x: 124, y: -110, z: -110 };
  s.world.threat.mode = "pursue";
  s.world.threat.interest = 12;
  for (let i = 0; i < 90; i++) s = stepGame(s, [], barrier).state;
  assert.ok(s.world.threat.position.x <= 126.801, JSON.stringify(s.world.threat.position));
});
test("actual oxygen exhaustion causes refuge return, retained knowledge/tools and capped identified cargo without vessel duplication", () => {
  let s = dartGame();
  const v = s.fleet.vehicles[0]!;
  s.player.pose.position = { x: 70, y: -40, z: -72 };
  s.player.mode = "swimming";
  s.player.refugeId = "island_workshop";
  s.player.vitals.oxygen = 0.01;
  s.player.vitals.health = 0.1;
  addItem(s, "silica_glass", 10, "diver");
  for (let i = 0; i < 120; i++) s = stepGame(s, [], world).state;
  assert.equal(s.metrics.failures, 1);
  assert.equal(s.player.refugeId, "island_workshop");
  assert.ok(s.player.vitals.food >= 59);
  assert.ok(s.knowledge.crafted.includes("suit_150"));
  assert.equal(s.recovery.caches.length, 1);
  assert.equal(usedCapacity(s, s.recovery.caches[0]!.containerId), 8);
  assert.equal(s.fleet.vehicles[0]!.id, v.id);
  roundTrip(s);
});
test("repeated disable/field-repair/salvage conserves public investment and binds maintenance provenance across failures", () => {
  const s = dartGame(),
    v = s.fleet.vehicles[0]!;
  s.player.pose.position = { ...v.pose.position };
  for (let i = 0; i < 6; i++) {
    disableVehicle(s, v.id);
    assert.equal(recoveryCommand(s, v.id, "repair"), null);
    assert.equal(v.boundRepairs, i + 1);
    roundTrip(s);
  }
  assert.deepEqual(s.world.maintenance, { alloy: 2, glass: 0, membrane: 1 });
  disableVehicle(s, v.id);
  assert.equal(recoveryCommand(s, v.id, "repair"), null);
  disableVehicle(s, v.id);
  const before = structuredClone(s);
  assert.match(recoveryCommand(s, v.id, "repair")!, /unavailable/);
  assert.deepEqual(s, before);
  assert.equal(toggleBuoy(s), null);
  assert.equal(recoveryCommand(s, v.id, "salvage"), null);
  assert.equal(s.fleet.vehicles.length, 0);
  assert.equal(s.world.maintenance.alloy, 14);
  assert.equal(s.world.maintenance.membrane, 7);
  assert.equal(usedCapacity(s, "buoy_hold"), 17);
  assert.ok(s.knowledge.blueprints.includes("bp_island_workshop"));
  assert.ok(s.knowledge.crafted.includes("dart_base"));
  roundTrip(s);
});
test("local staged Bobbin traverses the production corridor before attachment and swept tow; interruption retains the same disabled hull", () => {
  const s = dartGame(),
    v = s.fleet.vehicles[0]!;
  v.pose.position = { x: 93, y: -88, z: -96 };
  disableVehicle(s, v.id);
  s.player.pose.position = { x: 46, y: -12, z: -54 };
  s.player.mode = "swimming";
  assert.equal(recoveryCommand(s, v.id, "tow"), null);
  for (let i = 0; i < 1500 && s.recovery.operation?.phase !== "ready"; i++)
    updateRecovery(s, world);
  assert.equal(s.recovery.operation?.phase, "ready");
  assert.ok(distance(v.pose.position, { x: 93, y: -88, z: -96 }) < 0.01);
  roundTrip(s);
  assert.equal(recoveryCommand(s, v.id, "tow"), null);
  for (let i = 0; i < 2000 && s.recovery.operation; i++)
    updateRecovery(s, world);
  assert.equal(s.recovery.operation, null);
  assert.ok(v.pose.position.y > -15, s.feedback);
  assert.equal(v.disabled, true);
  assert.equal(v.charge, 100);
  assert.equal(s.fleet.vehicles.length, 1);
  roundTrip(s);
  disableVehicle(s, v.id);
  incapacitate(s, "Second failure");
  assert.equal(s.fleet.vehicles.length, 1);
  assert.equal(s.knowledge.journals.length, 0);
  roundTrip(s);
});
test("duplicate ownership, capacity, resource IDs, future records and incoherent modes fail validation", () => {
  const source = dartGame();
  for (const mutate of [
    (s: GameState) => s.inventory.items.push({ ...s.inventory.items[0]! }),
    (s: GameState) => (s.inventory.containers[0]!.capacity = 17),
    (s: GameState) => (s.world.resources[1]!.id = s.world.resources[0]!.id),
    (s: GameState) => (s.player.mode = "piloting"),
    (s: GameState) => s.fleet.vehicles.push({ ...s.fleet.vehicles[0]! }),
    (s: GameState) => (s.world.facilities[1]!.repaired = false),
  ]) {
    const s = structuredClone(source);
    mutate(s);
    const e = createEnvelope(s, {
      sessionId: "reject-m1-data",
      createdAt: "2026-10-17T12:00:00.000Z",
      savedAt: "2026-10-17T12:00:00.000Z",
    });
    assert.equal(encodeSave(e).ok, false);
  }
});
