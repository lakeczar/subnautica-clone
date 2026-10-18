import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS, RECIPES, RECOVERY_STAGE } from "../src/content/registry.js";
import type { ItemKind } from "../src/content/registry.js";
import type { GameCommand, GameState } from "../src/sim/types.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening, craft, discover, toggleBuoy } from "../src/sim/progression.js";
import { addItem, materialStoragePreview, transfer, usedCapacity } from "../src/sim/inventory.js";
import { dartPerformance, installModule, installModuleRefusal, removeModule, removeModuleRefusal } from "../src/sim/modules.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { board, service } from "../src/sim/vehicles.js";
import { createWorldQueries } from "../src/sim/world.js";
import { disableVehicle, incapacitate, recoveryCommand, RECOVERY_MOORING, updateRecovery } from "../src/sim/recovery.js";
import { BERTH_LOCAL, CARRIER_LAYOUT, carrierCommand, fixtureGame, localToWorld, updateBerth } from "../src/sim/carrier.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";

const world = createWorldQueries();
const meta = { sessionId: "module-rules-test", createdAt: "2026-10-17T12:00:00.000Z", savedAt: "2026-10-17T12:00:00.000Z" };
function prepared(): GameState {
  const s = createGame(); completeOpening(s); discover(s, "C02"); discover(s, "C03");
  for (const id of ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit", "restore_workshop", "dart_base"] as const) {
    const r = RECIPES[id];
    if (r.site === "island_workshop") s.player.pose.position = { x: 10, y: 1.2, z: -34 };
    for (const [k, n] of Object.entries(r.cost)) if (!r.maintenance)
      addItem(s, k as ItemKind, n, id === "restore_workshop" ? "diver" : r.site === "island_workshop" ? "workshop_locker" : "pod_locker");
    assert.equal(craft(s, id, world), null);
  }
  return s;
}
function trimGame(installed = false): GameState {
  const s = prepared(); discover(s, "C04");
  addItem(s, "conductive_crust", 4, "workshop_locker"); addItem(s, "buoyant_resin", 4, "workshop_locker");
  assert.equal(craft(s, "dart_acoustic_trim", world), null);
  if (installed) assert.equal(installModule(s, s.fleet.vehicles[0]!.id, trim(s).id), null);
  roundTrip(s); return s;
}
const trim = (s: GameState) => s.inventory.items.find((i) => i.kind === "dart_acoustic_trim")!;
function roundTrip(s: GameState): GameState {
  const encoded = encodeSave(createEnvelope(s, meta)); assert.ok(encoded.ok, encoded.ok ? "" : encoded.error);
  const decoded = decodeSave(encoded.value); assert.ok(decoded.ok, decoded.ok ? "" : decoded.error);
  assert.deepEqual(decoded.value.state, JSON.parse(JSON.stringify(s)));
  return decoded.value.state;
}
function refused(s: GameState, c: GameCommand, pattern: RegExp): void {
  const before = structuredClone(s), result = executeCommand(s, c, world);
  assert.equal(result.state, s); assert.deepEqual(s, before);
  assert.ok(result.events.some((e) => e.type === "notice" && e.error && pattern.test(e.message)));
  assert.deepEqual(stepGame(s, [c], world).state, stepGame(s, [], world).state);
}

test("C04's once-only optional trim consumes 2+2 of the first 4+4 return and capacity-checks its public 2 CU output", () => {
  const s = prepared();
  addItem(s, "conductive_crust", 4, "workshop_locker"); addItem(s, "buoyant_resin", 4, "workshop_locker");
  refused(s, { type: "craft", recipeId: "dart_acoustic_trim" }, /Blueprint unknown/);
  discover(s, "C04");
  addItem(s, "silica_glass", 10, "diver"); assert.equal(usedCapacity(s, "diver"), 16);
  refused(s, { type: "craft", recipeId: "dart_acoustic_trim" }, /Output would not fit/);
  const glass = s.inventory.items.find((i) => i.kind === "silica_glass")!;
  assert.equal(transfer(s, glass.id, "workshop_locker", glass.quantity), null);
  const before = structuredClone(s);
  assert.equal(craft(s, "dart_acoustic_trim", world), null);
  assert.deepEqual(RECIPES.dart_acoustic_trim.cost, { conductive_crust: 2, buoyant_resin: 2 });
  assert.deepEqual(trim(s), { id: trim(s).id, kind: "dart_acoustic_trim", quantity: 1, containerId: "diver", fitted: null, charge: null, provenance: "public" });
  for (const kind of ["conductive_crust", "buoyant_resin"]) assert.equal(s.inventory.items.find((i) => i.kind === kind)!.quantity, 2);
  assert.deepEqual(s.world, before.world); assert.deepEqual(s.fleet, before.fleet);
  assert.equal(ITEMS.dart_acoustic_trim.cu, 2); assert.equal(usedCapacity(s, "diver"), 8);
  refused(s, { type: "craft", recipeId: "dart_acoustic_trim" }, /Already/);
  roundTrip(s);
});

test("install and remove move only an existing item/container reference; fitted stays null and cargo always counts its 2 CU", () => {
  const s = trimGame(), v = s.fleet.vehicles[0]!, item = structuredClone(trim(s)), before = structuredClone(s);
  assert.equal(installModuleRefusal(s, v.id, item.id), null);
  assert.deepEqual(s, before, "refusal/eligibility is read-only");
  assert.equal(installModule(s, v.id, item.id), null);
  const expected = structuredClone(before);
  expected.inventory.items.find((i) => i.id === item.id)!.containerId = v.cargoId;
  expected.fleet.vehicles[0]!.modules = [item.id]; expected.feedback = s.feedback;
  assert.deepEqual(s, expected); assert.equal(usedCapacity(s, v.cargoId), 2);
  refused(s, { type: "transfer", itemId: item.id, to: "diver", quantity: 1 }, /Remove.*installed module/);
  const p = materialStoragePreview(s, v.cargoId, "workshop_locker"); assert.equal(p.items.length, 0); assert.equal(p.totalCu, 0);
  const installed = structuredClone(s);
  assert.equal(removeModuleRefusal(s, v.id, item.id, world), null);
  assert.equal(removeModule(s, v.id, item.id, world), null);
  const removed = structuredClone(installed); removed.fleet.vehicles[0]!.modules = []; removed.feedback = s.feedback;
  assert.deepEqual(s, removed); assert.equal(usedCapacity(s, v.cargoId), 2);
  assert.equal(transfer(s, item.id, "diver", 1), null);
  assert.deepEqual(trim(s), item); assert.equal(s.sequence, before.sequence);
  roundTrip(s);
});

test("install refuses insufficient relocation space but installing an item already in a full hold needs no extra CU", () => {
  const s = trimGame(), v = s.fleet.vehicles[0]!;
  const cargo = addItem(s, "silica_glass", 31, v.cargoId);
  refused(s, { type: "install-module", vehicleId: v.id, itemId: trim(s).id }, /2 CU room/);
  cargo.quantity = 30;
  assert.equal(transfer(s, trim(s).id, v.cargoId, 1), null);
  assert.equal(usedCapacity(s, v.cargoId), 32);
  assert.equal(installModule(s, v.id, trim(s).id), null);
  assert.equal(usedCapacity(s, v.cargoId), 32); roundTrip(s);
  refused(s, { type: "install-module", vehicleId: v.id, itemId: trim(s).id }, /already installed/);
});

test("installation/removal require supported, unoccupied local access and no recovery or berth transaction", () => {
  const s = trimGame(), v = s.fleet.vehicles[0]!;
  v.pose.position = { x: 70, y: -20, z: -60 };
  refused(s, { type: "install-module", vehicleId: v.id, itemId: trim(s).id }, /local cradle/);
  s.player.pose.position = { x: 74, y: -20, z: -60 }; s.player.mode = "swimming";
  refused(s, { type: "install-module", vehicleId: v.id, itemId: trim(s).id }, /supported|cradle/);
  assert.equal(board(s, v.id), null);
  refused(s, { type: "install-module", vehicleId: v.id, itemId: trim(s).id }, /Exit.*occupied/);
  const active = trimGame(true), av = active.fleet.vehicles[0]!;
  disableVehicle(active, av.id);
  active.recovery.operation = { vehicleId: av.id, method: "tow", phase: "ready", position: { ...av.pose.position }, waypoint: 3 };
  refused(active, { type: "remove-module", vehicleId: av.id, itemId: trim(active).id }, /Finish recovery/);
  const item = trim(s); item.containerId = "pod_locker";
  s.player.controlledVehicleId = null; s.player.mode = "walking"; s.player.pose.position = { x: 10, y: 1.2, z: -34 };
  v.pose.position = { x: 20, y: -1.6, z: -22 };
  refused(s, { type: "install-module", vehicleId: v.id, itemId: item.id }, /locally accessible/);
});

test("trim changes only piloted Dart quiet/boost targets, preserving normal speed, input precedence and power per second", () => {
  const clear = createWorldQueries([], () => -190);
  for (const mode of ["quiet", "normal", "boost", "quiet+sprint"] as const) {
    const speeds: number[] = [], drains: number[] = [], distances: number[] = [];
    for (const installed of [false, true]) {
      const s = trimGame(installed), v = s.fleet.vehicles[0]!;
      v.pose.position = { x: -50, y: -20, z: 20 }; v.pose.pitch = 0;
      s.player.pose.position = { ...v.pose.position }; assert.equal(board(s, v.id), null);
      const speed = mode.startsWith("quiet") ? installed ? 4.2 : 3 : mode === "boost" ? installed ? 9 : 11 : 8;
      v.velocity = { x: 0, y: 0, z: -speed }; s.player.velocity = { ...v.velocity };
      const c: GameCommand = { type: "move", forward: 1, right: 0, vertical: 0, quiet: mode.startsWith("quiet"), sprint: mode === "boost" || mode === "quiet+sprint" };
      const out = stepGame(s, [c], clear).state;
      assert.ok(Math.abs(out.fleet.vehicles[0]!.velocity.z + speed) < 1e-12);
      assert.equal(out.fleet.vehicles[0]!.velocity.y, 0);
      speeds.push(speed); drains.push(out.metrics.powerUsed - s.metrics.powerUsed);
      distances.push(out.metrics.pilotMetres - s.metrics.pilotMetres);
      const first = structuredClone(s); first.fleet.vehicles[0]!.velocity.z = 0; first.player.velocity.z = 0;
      assert.ok(Math.abs(stepGame(first, [c], clear).state.fleet.vehicles[0]!.velocity.z + speed * 2.8 / 60) < 1e-12, "existing acceleration is unchanged");
    }
    assert.equal(drains[0], drains[1]);
    assert.ok(Math.abs(distances[1]! / distances[0]! - speeds[1]! / speeds[0]!) < 1e-11);
    if (mode.startsWith("quiet")) assert.deepEqual(speeds, [3, 4.2]);
    else if (mode === "boost") assert.deepEqual(speeds, [11, 9]);
    else assert.deepEqual(speeds, [8, 8]);
  }
  const s = trimGame(), v = s.fleet.vehicles[0]!;
  assert.equal(dartPerformance(s, v.id)!.acousticTrim, false, "carrying trim grants no benefit");
  assert.equal(installModule(s, v.id, trim(s).id), null);
  assert.equal(dartPerformance(s, v.id)!.quietSpeed, 4.2);
  assert.equal(dartPerformance(s, v.id)!.socketsUsed, 1);
  assert.equal(dartPerformance(s, v.id)!.cargoCu, 2);
  assert.match(dartPerformance(s, v.id)!.description, /Noise and power use per second stay the same/);
});

test("strict module validation rejects forged relationships/attributes, duplicate ownership and lost/duplicated once-only receipts", () => {
  const mutations: [string, (s: GameState) => void][] = [
    ["dangling", (s) => { s.fleet.vehicles[0]!.modules = ["missing"]; }],
    ["unknown kind", (s) => { trim(s).kind = "unknown_module" as ItemKind; }],
    ["quantity", (s) => { trim(s).quantity = 2; }],
    ["provenance", (s) => { trim(s).provenance = "maintenance"; }],
    ["charge", (s) => { trim(s).charge = 0; }],
    ["fitted", (s) => { trim(s).fitted = "tools"; trim(s).containerId = "equipment"; }],
    ["wrong container", (s) => { trim(s).containerId = "diver"; }],
    ["duplicate reference", (s) => { s.fleet.vehicles[0]!.modules.push(trim(s).id); }],
    ["third socket", (s) => { s.fleet.vehicles[0]!.modules.push("extra_one", "extra_two"); }],
    ["wrong hull", (s) => { s.scenario = "carrier-fixture"; s.fleet.vehicles[0]!.hull = "hush"; }],
    ["non-module item", (s) => { s.fleet.vehicles[0]!.modules = [s.inventory.items.find((i) => i.kind === "reserve_cell")!.id]; }],
    ["missing receipt", (s) => { s.knowledge.crafted = s.knowledge.crafted.filter((r) => r !== "dart_acoustic_trim"); }],
    ["deleted item", (s) => { s.fleet.vehicles[0]!.modules = []; s.inventory.items = s.inventory.items.filter((i) => i.id !== trim(s).id); }],
    ["duplicate item/kind", (s) => { addItem(s, "dart_acoustic_trim", 1, "diver"); }],
    ["cross-owner reuse", (s) => {
      s.scenario = "carrier-fixture";
      const other = makeVehicle("another_dart", "dart", { x: 65, y: -20, z: -50 }, "another_hold");
      other.modules = [trim(s).id]; s.fleet.vehicles.push(other);
      s.inventory.containers.push({ id: other.cargoId, kind: "vehicle", capacity: 32, ownerId: other.id });
    }],
  ];
  for (const [label, mutate] of mutations) {
    const s = trimGame(true); mutate(s);
    assert.equal(validState(s), false, label);
    assert.equal(decodeSave(JSON.stringify(createEnvelope(s, meta))).ok, false, label);
    assert.equal(encodeSave(createEnvelope(s, meta)).ok, false, label);
  }
});

test("carried reusable trim retains its exact ID through incapacity, while installed trim survives disable/patch/service", () => {
  const carried = trimGame(), original = structuredClone(trim(carried));
  addItem(carried, "silica_glass", 6, "diver");
  incapacitate(carried, "Module retention diagnostic.");
  assert.deepEqual(trim(carried), original);
  assert.ok(!carried.recovery.caches.some((c) => carried.inventory.items.some((i) => i.containerId === c.containerId && i.kind === "dart_acoustic_trim")));
  roundTrip(carried);
  const s = trimGame(true), v = s.fleet.vehicles[0]!, item = structuredClone(trim(s));
  v.charge = 0; disableVehicle(s, v.id); s.player.pose.position = { ...v.pose.position };
  assert.equal(recoveryCommand(s, v.id, "repair"), null);
  assert.deepEqual(trim(s), item); assert.equal(v.charge, 0); assert.equal(v.boundRepairs, 1);
  assert.equal(service(s, v.id), null); assert.deepEqual(trim(s), item); assert.deepEqual(v.modules, [item.id]);
  assert.equal(v.charge, 100); assert.equal(v.health, 100); roundTrip(s);
});

test("disabled exterior-collar removal requires retained tools, local safe depth/clearance and a finished operation", () => {
  const s = trimGame(true), v = s.fleet.vehicles[0]!;
  v.pose.position = { x: 80, y: -48, z: -89 }; disableVehicle(s, v.id);
  refused(s, { type: "remove-module", vehicleId: v.id, itemId: trim(s).id }, /local cradle|collar/);
  s.player.pose.position = { x: 84, y: -48, z: -89 }; s.player.mode = "swimming";
  assert.equal(removeModuleRefusal(s, v.id, trim(s).id, world), null);
  const blocked = { ...world, clearance: () => false }, before = structuredClone(s);
  assert.match(removeModule(s, v.id, trim(s).id, blocked)!, /safe personal/); assert.deepEqual(s, before);
  const deep = structuredClone(s); deep.fleet.vehicles[0]!.pose.position.y = -160; deep.player.pose.position.y = -160;
  refused(deep, { type: "remove-module", vehicleId: v.id, itemId: trim(deep).id }, /safe personal depth/);
  const missing = structuredClone(s); missing.inventory.items = missing.inventory.items.filter((i) => i.kind !== "bobbin_kit");
  assert.match(removeModuleRefusal(missing, v.id, trim(missing).id, world)!, /service tool and Bobbin/);
  assert.equal(removeModule(s, v.id, trim(s).id, world), null); roundTrip(s);
});

test("tow -> remove -> intact transfer -> salvage -> rebuild -> reinstall preserves the one trim and exact frame/bound-patch ledger", () => {
  let s = trimGame(true); const vid = s.fleet.vehicles[0]!.id, itemId = trim(s).id;
  const v = s.fleet.vehicles[0]!; v.pose.position = { x: 80, y: -48, z: -89 }; v.charge = 12;
  v.boundRepairs = 1; s.world.maintenance.alloy -= 2; s.world.maintenance.membrane--;
  disableVehicle(s, vid); s.player.pose.position = { ...RECOVERY_STAGE }; s.player.mode = "swimming";
  assert.equal(recoveryCommand(s, vid, "tow"), null);
  for (let n = 0; s.recovery.operation?.phase === "approach" && n < 3000; n++) updateRecovery(s, world);
  assert.equal(s.recovery.operation?.phase, "ready");
  assert.equal(recoveryCommand(s, vid, "tow"), null);
  for (let n = 0; s.recovery.operation && n < 5000; n++) { updateRecovery(s, world); if (n % 120 === 0) roundTrip(s); }
  assert.equal(s.recovery.operation, null); assert.deepEqual(v.pose.position, RECOVERY_MOORING);
  assert.equal(v.charge, 12); assert.equal(v.health, 0); assert.deepEqual(v.modules, [itemId]);
  s.player.pose.position = { x: 55, y: -11, z: -54 };
  refused(s, { type: "recover", vehicleId: vid, method: "salvage" }, /Remove installed modules/);
  assert.equal(removeModule(s, vid, itemId, world), null); assert.equal(transfer(s, itemId, "diver", 1), null);
  const retained = structuredClone(trim(s)); assert.equal(toggleBuoy(s), null);
  const before = structuredClone(s.world.maintenance);
  assert.equal(recoveryCommand(s, vid, "salvage"), null);
  assert.equal(s.fleet.vehicles.length, 0); assert.deepEqual(trim(s), retained);
  assert.deepEqual(s.world.maintenance, { alloy: before.alloy + 2, glass: before.glass, membrane: before.membrane + 1 });
  const frame = s.inventory.items.filter((i) => i.containerId === "buoy_hold");
  assert.deepEqual(Object.fromEntries(frame.map((i) => [i.kind, i.quantity])), RECIPES.dart_base.cost);
  assert.equal(usedCapacity(s, "buoy_hold"), 17); roundTrip(s);
  // Two bounded local transport loads; source resources and module ingredients are never granted.
  for (const batch of [[ ["structural_alloy", 3], ["silica_glass", 3], ["flex_membrane", 1] ], [ ["structural_alloy", 3], ["flex_membrane", 1] ]] as const) {
    s.player.pose.position = { x: 55, y: -11, z: -54 };
    for (const [kind, n] of batch) assert.equal(transfer(s, s.inventory.items.find((i) => i.kind === kind && i.containerId === "buoy_hold")!.id, "diver", n), null);
    assert.ok(usedCapacity(s, "diver") <= 16);
    s.player.pose.position = { x: 10, y: 1.2, z: -34 };
    for (const i of [...s.inventory.items]) if (i.containerId === "diver" && ["structural_alloy", "silica_glass", "flex_membrane"].includes(i.kind))
      assert.equal(transfer(s, i.id, "workshop_locker", i.quantity), null);
  }
  s.player.pose.position = { x: 55, y: -11, z: -54 }; assert.equal(toggleBuoy(s), null);
  s.player.pose.position = { x: 10, y: 1.2, z: -34 };
  const resources = structuredClone(s.world.resources); assert.equal(craft(s, "dart_base", world), null);
  assert.equal(s.fleet.vehicles.length, 1); assert.notEqual(s.fleet.vehicles[0]!.id, vid);
  assert.deepEqual(s.fleet.vehicles[0]!.investment, RECIPES.dart_base.cost);
  assert.equal(installModule(s, s.fleet.vehicles[0]!.id, itemId), null);
  assert.equal(trim(s).id, itemId); assert.equal(s.inventory.items.filter((i) => i.kind === "dart_acoustic_trim").length, 1);
  assert.deepEqual(s.world.resources, resources); s = roundTrip(s);
  assert.deepEqual(s.fleet.vehicles[0]!.modules, [itemId]);
});

test("installed identity survives valid berth/launch transactions and immediate schema2 expedition.3 reload", () => {
  const s = trimGame(true), v = s.fleet.vehicles[0]!, fixture = fixtureGame(), h = fixture.fleet.vehicles[0]!;
  s.scenario = "carrier-fixture"; s.fleet.vehicles.push(h); s.fleet.docking = fixture.fleet.docking;
  s.inventory.containers.push({ id: h.cargoId, kind: "vehicle", capacity: 256, ownerId: h.id });
  v.berth = { carrierId: h.id, slot: 0, pose: { frame: "carrier-local", position: { ...BERTH_LOCAL[0]! }, yaw: 0 } };
  v.pose.position = localToWorld(v.berth.pose.position, h);
  s.player.mode = "interior"; s.player.interiorId = h.id;
  s.player.interiorPose = { frame: "carrier-local", position: { ...CARRIER_LAYOUT.helm } };
  s.player.pose.position = localToWorld(CARRIER_LAYOUT.helm, h);
  const item = structuredClone(trim(s)); roundTrip(s);
  refused(s, { type: "remove-module", vehicleId: v.id, itemId: item.id }, /occupied|unberthed/);
  assert.equal(carrierCommand(s, "launch", v.id, world), null); roundTrip(s);
  for (let n = 0; n < 32; n++) updateBerth(s, world);
  assert.equal(v.berth, null); assert.deepEqual(trim(s), item); assert.deepEqual(v.modules, [item.id]); roundTrip(s);
});
