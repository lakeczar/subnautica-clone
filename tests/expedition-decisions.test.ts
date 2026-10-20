import test from "node:test";
import assert from "node:assert/strict";
import { DART_BUILD_POSE, ITEMS, MATERIALS, RECIPES } from "../src/content/registry.js";
import type { ItemKind, RecipeId } from "../src/content/registry.js";
import type { GameCommand, GameState } from "../src/sim/types.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening, craft, craftingRefusal, discover, toggleBuoy } from "../src/sim/progression.js";
import { addItem, available, containerAccessible, distance, fabricationContainers, materialStoragePreview, supportedServiceSite, transfer, usedCapacity } from "../src/sim/inventory.js";
import { board, cellRechargePreview, distractionPreview, reserve, service } from "../src/sim/vehicles.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { createWorldQueries, WORLD_BOUNDS } from "../src/sim/world.js";
import { disableVehicle } from "../src/sim/recovery.js";
import { fixtureGame } from "../src/sim/carrier.js";
import { validState } from "../src/save/validation.js";
import { behindCover } from "../src/sim/survival.js";

const world = createWorldQueries();
// Funded rule fixtures with real recipe receipts, never historical/ordinary-play evidence.
function prepared(dart = true): GameState {
  const s = createGame(); completeOpening(s); discover(s, "C02"); discover(s, "C03");
  const ids: RecipeId[] = ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit",
    ...(dart ? ["restore_workshop", "dart_base"] as const : [])];
  for (const id of ids) {
    const r = RECIPES[id];
    if (r.site === "island_workshop") s.player.pose.position = { x: 10, y: 1.2, z: -34 };
    for (const [k, n] of Object.entries(r.cost)) if (!r.maintenance)
      addItem(s, k as ItemKind, n, id === "restore_workshop" ? "diver" : r.site === "island_workshop" ? "workshop_locker" : "pod_locker");
    assert.equal(craft(s, id, world), null);
  }
  assert.ok(validState(s));
  return s;
}
function refused(s: GameState, c: GameCommand, pattern: RegExp): void {
  const before = structuredClone(s), result = executeCommand(s, c, world);
  assert.equal(result.state, s);
  assert.deepEqual(s, before);
  assert.ok(result.events.some((e) => e.type === "notice" && e.error && pattern.test(e.message)));
  assert.deepEqual(stepGame(s, [c], world).state, stepGame(s, [], world).state,
    "refused step effects must equal ordinary no-input tick advance");
}

test("paid pulse selects diver before controlled cargo and stable cell IDs before array order", () => {
  const s = prepared(), cells = s.inventory.items.filter((i) => i.kind === "reserve_cell").sort((a, b) => a.id < b.id ? -1 : 1);
  cells[0]!.charge = 25; cells[1]!.charge = 70;
  s.inventory.items.reverse();
  const before = structuredClone(s), p = distractionPreview(s);
  assert.equal(p.refusal, null); assert.equal(p.cellId, cells[0]!.id); assert.equal(p.remainingCharge, 0);
  assert.deepEqual(s, before, "preview is read-only");
  const out = executeCommand(s, { type: "distraction" }, world);
  const expected = structuredClone(before);
  expected.inventory.items.find((i) => i.id === p.cellId)!.charge = 0;
  expected.world.threat.distraction = p.target; expected.world.threat.distractionSeconds = 12;
  // S4: the paid pulse is also the acoustic deterrent at its real target.
  expected.world.ecology.deterrents = [{ kind: "acoustic", position: { ...p.target! }, seconds: 12 }];
  expected.feedback = out.state.feedback;
  assert.deepEqual(out.state, expected);
  assert.match(out.state.feedback, /25 charge points.*0\.00 remain/);
  assert.deepEqual(out.events.filter((e) => e.type === "sound"), [{ type: "sound", cue: "collect" }], "existing body-origin cue semantics stay intact");

  const v = s.fleet.vehicles[0]!;
  cells[0]!.charge = 35; cells[1]!.containerId = v.cargoId;
  s.player.pose.position = { ...v.pose.position }; assert.equal(board(s, v.id), null);
  assert.equal(distractionPreview(s).cellId, cells[0]!.id, "carried cell wins over a craft cell");
  cells[0]!.charge = 24;
  assert.equal(distractionPreview(s).cellId, cells[1]!.id);
  const piloted = executeCommand(s, { type: "distraction" }, world).state;
  assert.equal(piloted.inventory.items.find((i) => i.id === cells[1]!.id)!.charge, 45);
  assert.equal(piloted.inventory.items.find((i) => i.id === cells[0]!.id)!.charge, 24);
  assert.ok(validState(piloted));
});

test("pulse refuses fractional pooling, remote/buoy/locker cells, absent tool, active pulse and outward boundary without debit", () => {
  for (const location of ["partial", "empty", "pod_locker", "workshop_locker", "buoy_hold", "uncontrolled"] as const) {
    const s = prepared(), v = s.fleet.vehicles[0]!, cells = s.inventory.items.filter((i) => i.kind === "reserve_cell");
    if (location === "partial") { cells[0]!.charge = 24; cells[1]!.charge = 1; }
    else if (location === "empty") for (const cell of cells) cell.charge = 0;
    else {
      if (location === "buoy_hold") assert.equal(toggleBuoy(s), null);
      for (const cell of cells) cell.containerId = location === "uncontrolled" ? v.cargoId : location;
    }
    assert.ok(validState(s));
    const p = distractionPreview(s); assert.ok(p.refusal);
    refused(s, { type: "distraction" }, /25 charge points/);
  }
  const bare = createGame(); completeOpening(bare);
  refused(bare, { type: "distraction" }, /service tool/);
  const active = executeCommand(prepared(), { type: "distraction" }, world).state;
  refused(active, { type: "distraction" }, /already active/);
  const edge = prepared(); edge.player.pose.position = { x: WORLD_BOUNDS.maxX, y: -2, z: 0 };
  edge.player.pose.yaw = Math.PI / 2; edge.player.mode = "swimming";
  refused(edge, { type: "distraction" }, /Face into/);
  // Pulse charge still competes with the existing 35%-hull-power use.
  const s = prepared(), v = s.fleet.vehicles[0]!, cell = s.inventory.items.find((i) => i.kind === "reserve_cell")!;
  s.player.pose.position = { ...v.pose.position }; v.charge = 65;
  const paid = executeCommand(s, { type: "distraction" }, world).state;
  assert.equal(reserve(paid, v.id), null);
  assert.equal(paid.fleet.vehicles[0]!.charge, 91.25);
  assert.equal(paid.inventory.items.find((i) => i.id === cell.id)!.charge, 0);
});

test("explicit local cell recharge works before vessel ownership and changes only depleted charges and feedback", () => {
  const s = prepared(false), cells = s.inventory.items.filter((i) => i.kind === "reserve_cell");
  cells[0]!.charge = 0; cells[1]!.charge = 33.5; cells[1]!.containerId = "pod_locker";
  const before = structuredClone(s), preview = cellRechargePreview(s);
  assert.equal(preview.refusal, null); assert.deepEqual(preview.cellIds.sort(), cells.map((i) => i.id).sort());
  const out = executeCommand(s, { type: "recharge-cells" }, world).state, expected = structuredClone(before);
  for (const i of expected.inventory.items) if (i.kind === "reserve_cell") i.charge = 100;
  expected.feedback = out.feedback;
  assert.deepEqual(out, expected); assert.deepEqual(s, before); assert.equal(out.fleet.vehicles.length, 0);
  refused(out, { type: "recharge-cells" }, /already full/);
  const away = structuredClone(s); away.player.pose.position = { x: 70, y: -10, z: -60 }; away.player.mode = "swimming";
  refused(away, { type: "recharge-cells" }, /restored.*bench/);
  const early = createGame(); completeOpening(early);
  refused(early, { type: "recharge-cells" }, /restored/);
  const empty = prepared(false); for (const i of empty.inventory.items) if (i.kind === "reserve_cell") i.containerId = "workshop_locker";
  refused(empty, { type: "recharge-cells" }, /No reserve cells/);
});

test("zero cell charge leaves quiet movement and a covered retreat available without a pulse", () => {
  const s = prepared(false);
  s.player.pose.position = { x: 99, y: -110, z: -119 }; s.player.mode = "swimming";
  s.player.pose.yaw = Math.PI * 1.5; s.player.pose.pitch = 0;
  s.world.threat.mode = "pursue"; s.world.threat.modeSeconds = 2; s.world.threat.interest = 4;
  assert.ok(behindCover(s.player.pose.position, s.world.threat.position));
  assert.ok(world.clearance(s.player.pose.position, { radius: 0.34, height: 0.95 }));
  let charged = structuredClone(s), empty = structuredClone(s);
  for (const cell of empty.inventory.items) if (cell.kind === "reserve_cell") cell.charge = 0;
  for (let n = 0; n < 120; n++) {
    const move: GameCommand = { type: "move", forward: 1, right: 0, vertical: 0, sprint: false, quiet: true };
    empty = stepGame(empty, [move], world).state; charged = stepGame(charged, [move], world).state;
  }
  assert.equal(empty.world.threat.mode, "disengage"); assert.equal(empty.world.threat.interest, 0);
  assert.equal(empty.world.threat.distraction, null); assert.equal(empty.world.threat.distractionSeconds, 0);
  assert.ok(distance(empty.player.pose.position, s.player.pose.position) > 3.9);
  assert.equal(empty.player.vitals.health, s.player.vitals.health);
  for (const cell of charged.inventory.items) if (cell.kind === "reserve_cell") cell.charge = 0;
  assert.deepEqual(empty, charged, "reserve-cell charge gates only the paid pulse"); assert.ok(validState(empty));
});

test("bench recharge includes matching disabled hull cargo but leaves healthy empty batteries and disabled hulls recoverable separately", () => {
  for (const disabled of [false, true]) {
    const s = prepared(), v = s.fleet.vehicles[0]!;
    v.charge = 0; v.emergencyAir = 17;
    if (disabled) disableVehicle(s, v.id);
    for (const i of s.inventory.items) if (i.kind === "reserve_cell") { i.containerId = v.cargoId; i.charge = 0; }
    assert.ok(distance(s.player.pose.position, v.pose.position) > 7);
    const before = structuredClone(s), out = executeCommand(s, { type: "recharge-cells" }, world).state;
    assert.deepEqual(out.fleet, before.fleet); assert.deepEqual(out.recovery, before.recovery);
    assert.deepEqual(out.world, before.world); assert.equal(out.tick, s.tick);
    assert.equal(out.inventory.items.filter((i) => i.kind === "reserve_cell").every((i) => i.charge === 100), true);
    assert.ok(validState(out));
    // No service via the bench's cargo reach; physical local service still requires <7 m.
    refused(out, { type: "service", vehicleId: v.id }, /locally/);
    out.player.pose.position = { ...v.pose.position };
    if (disabled) assert.match(service(out, v.id)!, /rescue patch/);
    else {
      assert.equal(out.fleet.vehicles[0]!.disabled, false);
      assert.equal(reserve(out, v.id), null); assert.equal(out.fleet.vehicles[0]!.charge, 35);
    }
  }
});

test("fabrication, explicit transfers and bulk storage share only the actual bench's supported cradle cargo", () => {
  const s = prepared(), v = s.fleet.vehicles[0]!; discover(s, "C04");
  assert.ok(distance(s.player.pose.position, v.pose.position) > 6);
  assert.equal(supportedServiceSite(s, v), "island_workshop");
  assert.equal(containerAccessible(s, v.cargoId), true);
  assert.equal(toggleBuoy(s), null);
  addItem(s, "conductive_crust", 1, "diver"); addItem(s, "conductive_crust", 1, "workshop_locker");
  addItem(s, "buoyant_resin", 1, "buoy_hold"); const resin = addItem(s, "buoyant_resin", 1, v.cargoId);
  const bins = fabricationContainers(s, "island_workshop");
  assert.deepEqual(bins, ["diver", "workshop_locker", "buoy_hold", v.cargoId]);
  assert.equal(available(s, "buoyant_resin", bins), 2);
  assert.equal(transfer(s, resin.id, "diver", 1), null);
  assert.equal(transfer(s, resin.id, v.cargoId, 1), null);
  disableVehicle(s, v.id);
  assert.equal(craftingRefusal(s, "dart_acoustic_trim", world), null);
  assert.equal(craft(s, "dart_acoustic_trim", world), null);
  assert.ok(validState(s));
  assert.equal(s.inventory.items.filter((i) => i.kind === "dart_acoustic_trim").length, 1);

  const remote = prepared(), rv = remote.fleet.vehicles[0]!; discover(remote, "C04");
  rv.pose.position = { x: 0, y: -1, z: 8 };
  addItem(remote, "conductive_crust", 2, rv.cargoId); addItem(remote, "buoyant_resin", 2, rv.cargoId);
  assert.equal(supportedServiceSite(remote, rv), "home_pod");
  assert.equal(containerAccessible(remote, rv.cargoId), false);
  assert.ok(!fabricationContainers(remote, "island_workshop").includes(rv.cargoId));
  refused(remote, { type: "craft", recipeId: "dart_acoustic_trim" }, /Missing materials at this bench/);
  remote.player.pose.position = { x: 0, y: 0.18, z: 14 };
  assert.ok(fabricationContainers(remote, "pod_fabricator").includes(rv.cargoId));
  remote.player.pose.position = { x: 50, y: -10, z: -65 }; remote.player.mode = "swimming";
  assert.deepEqual(fabricationContainers(remote, "island_workshop"), []);
  assert.equal(containerAccessible(remote, rv.cargoId), false);
});

test("berthed craft and capture transactions never grant cargo access even at arm's reach", () => {
  const s = fixtureGame(), v = s.fleet.vehicles.find((v) => v.hull === "dart")!;
  assert.equal(containerAccessible(s, v.cargoId), false);
  v.berth = null;
  s.fleet.docking!.transaction = { id: "test_capture", type: "capture", vehicleId: v.id, slot: 0, phase: "prepared", ticks: 0 };
  assert.ok(validState(s));
  assert.equal(containerAccessible(s, v.cargoId), false);
  assert.equal(supportedServiceSite(s, v), null);
});

test("bulk stores all eight public material kinds as whole unchanged stacks and reports quantities/destination", () => {
  const s = prepared(), v = s.fleet.vehicles[0]!;
  // 12 CU of materials fits alongside the 4 CU cells and packed buoy in the Dart hold.
  for (const kind of Object.keys(MATERIALS)) addItem(s, kind as ItemKind, 1, v.cargoId);
  addItem(s, "meal", 2, v.cargoId);
  const snapshot = structuredClone(s), p = materialStoragePreview(s, v.cargoId, "workshop_locker");
  assert.equal(p.refusal, null); assert.equal(p.totalCu, 12); assert.equal(p.items.length, 8);
  p.items[0]!.quantity = 999;
  assert.deepEqual(s, snapshot, "preview owns detached summaries");
  const out = executeCommand(s, { type: "store-materials", from: v.cargoId, to: "workshop_locker" }, world).state;
  const expected = structuredClone(snapshot);
  for (const i of expected.inventory.items) if (i.containerId === v.cargoId && Object.hasOwn(MATERIALS, i.kind)) i.containerId = "workshop_locker";
  expected.feedback = out.feedback; assert.deepEqual(out, expected);
  assert.match(out.feedback, /1 × Structural alloy.*1 × Brine lattice.*workshop locker \(12 CU\)/);
  assert.equal(usedCapacity(out, v.cargoId), 2); assert.ok(validState(out));
  refused(out, { type: "store-materials", from: v.cargoId, to: "workshop_locker" }, /No public material/);
  // Existing same-kind destination stacks are not merged or recreated.
  const same = prepared(); const a = addItem(same, "silica_glass", 2, "diver"), b = addItem(same, "silica_glass", 3, "workshop_locker");
  const moved = executeCommand(same, { type: "store-materials", from: "diver", to: "workshop_locker" }, world).state;
  assert.equal(moved.inventory.items.find((i) => i.id === a.id)!.quantity, 2);
  assert.equal(moved.inventory.items.find((i) => i.id === b.id)!.quantity, 3);
  assert.equal(moved.sequence, same.sequence);
});

test("bulk refuses overflow, empty/excluded sets and inaccessible/equipment/identical destinations atomically", () => {
  const s = prepared(), v = s.fleet.vehicles[0]!;
  addItem(s, "structural_alloy", 4, v.cargoId);
  const full = addItem(s, "silica_glass", 157, "workshop_locker");
  assert.equal(usedCapacity(s, "workshop_locker"), 157); assert.ok(validState(s));
  const p = materialStoragePreview(s, v.cargoId, "workshop_locker"); assert.equal(p.totalCu, 8); assert.match(p.refusal!, /needs 8 CU/);
  refused(s, { type: "store-materials", from: v.cargoId, to: "workshop_locker" }, /needs 8 CU/);
  full.quantity = 160;
  for (const [from, to] of [["diver", "diver"], ["equipment", "diver"], ["diver", "equipment"], ["diver", "pod_locker"], ["missing", "diver"]])
    refused(s, { type: "store-materials", from: from!, to: to! }, /distinct|accessible/);
  refused(s, { type: "store-materials", from: "diver", to: v.cargoId }, /No public material/);
  assert.equal(s.inventory.items.filter((i) => i.provenance === "maintenance").length, 1);
  assert.equal(ITEMS.dart_acoustic_trim.cu, 2);
  assert.deepEqual(v.pose.position, DART_BUILD_POSE);
});
