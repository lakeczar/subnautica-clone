import test from "node:test";
import assert from "node:assert/strict";
import { BASIN_GEOMETRY, BASIN_SOURCE_IDS, RECOVERY_ROUTES, RECOVERY_SURFACE_OPERATOR, STARTER_RESCUE_APPROACH } from "../src/content/routes.js";
import { HULL_COLLIDERS, PLACES, RECIPES, SOURCES } from "../src/content/registry.js";
import type { MaterialId, RecipeId } from "../src/content/registry.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening, craft, discover, toggleBuoy } from "../src/sim/progression.js";
import { addItem, distance, transfer } from "../src/sim/inventory.js";
import { installModule, removeModule } from "../src/sim/modules.js";
import { BOBBIN_COLLIDER, disableVehicle, incapacitate, RECOVERY_MOORING, recoveryCommand, recoveryTowPath, rescueWaypoints, updateRecovery } from "../src/sim/recovery.js";
import { exposure } from "../src/sim/survival.js";
import { aimedInteraction, interactionHost } from "../src/sim/targeting.js";
import { interactions } from "../src/sim/progression.js";
import { executeCommand } from "../src/sim/step.js";
import { createWorldQueries, SOLIDS, sweptHullClearance } from "../src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import type { GameCommand, GameState, Vec3, WorldQueries } from "../src/sim/types.js";
const world = createWorldQueries(), meta = { sessionId: "m2-rescue-diagnostic", createdAt: "2026-10-18T00:00:00.000Z", savedAt: "2026-10-18T00:01:00.000Z" };
function roundTrip(s: GameState): GameState {
  assert.ok(validState(s)); const encoded = encodeSave(createEnvelope(s, meta)); assert.ok(encoded.ok, encoded.ok ? "" : encoded.error);
  const decoded = decodeSave(encoded.value); assert.ok(decoded.ok); assert.deepEqual(decoded.value.state, s); return decoded.value.state;
}
// Seed inputs, then pay the production transactions. Travel and losses remain diagnostics.
function prepared(): GameState {
  const s = createGame(); completeOpening(s); for (const id of ["C02", "C03", "C04"] as const) discover(s, id);
  for (const id of ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit", "restore_workshop", "dart_base", "dart_acoustic_trim"] as RecipeId[]) {
    const r = RECIPES[id]; s.player.pose.position = { ...PLACES[r.site === "island_workshop" ? "island_workshop" : "home_pod"].position };
    if (!r.maintenance) for (const [k, q] of Object.entries(r.cost)) addItem(s, k as MaterialId, q, "diver");
    assert.equal(craft(s, id, world), null, id);
  }
  const v = s.fleet.vehicles[0]!, module = s.inventory.items.find(i => i.kind === "dart_acoustic_trim")!;
  assert.equal(installModule(s, v.id, module.id), null); addItem(s, "meal", 2, v.cargoId); addItem(s, "silica_glass", 3, v.cargoId);
  s.player.mode = "swimming"; s.player.pose.position = { ...RECOVERY_SURFACE_OPERATOR }; return roundTrip(s);
}
function cmd(s: GameState, c: GameCommand, w: WorldQueries = world): GameState {
  const r = executeCommand(s, c, w); assert.ok(!r.events.some(e => e.type === "notice" && e.error), JSON.stringify(r.events)); return roundTrip(r.state);
}
function advance(s: GameState, stopAtReady: boolean): { state: GameState; seen: Set<string>; ticks: number } {
  const seen = new Set<string>(); let ticks = 0;
  while (s.recovery.operation && !(stopAtReady && s.recovery.operation.phase === "ready")) {
    const op = s.recovery.operation; seen.add(`${op.phase}:${op.waypoint}`);
    const oldPhase = op.phase, oldWaypoint = op.waypoint;
    assert.equal(op.routeId, "basin");
    const notice = updateRecovery(s, world); assert.ok(!(notice?.type === "notice" && notice.error), JSON.stringify(notice));
    if (ticks++ % 120 === 0 || oldPhase !== s.recovery.operation?.phase || oldWaypoint !== s.recovery.operation?.waypoint) s = roundTrip(s);
    assert.ok(ticks < 12000, "bounded complete route");
  }
  return { state: roundTrip(s), seen, ticks };
}

test("starter equipment reaches the local surface operator and complete submerged staging/tether path", () => {
  assert.ok(sweptHullClearance(world, STARTER_RESCUE_APPROACH, { radius: .34, height: .95 }));
  for (const p of STARTER_RESCUE_APPROACH) assert.ok(-(p.y + .4) <= 60);
  const s = prepared(); s.inventory.items = s.inventory.items.filter(i => i.kind !== "suit_150");
  assert.equal(exposure(s).breathable, true); assert.equal(exposure(s).airwayY, .35);
  assert.equal(distance(RECOVERY_SURFACE_OPERATOR, RECOVERY_ROUTES.basin.stage), 11.5);
  const v = s.fleet.vehicles[0]!; v.pose.position = { ...BASIN_GEOMETRY.station.parking }; disableVehicle(s, v.id);
  assert.ok(sweptHullClearance(world, rescueWaypoints(s, v.id, "basin"), BOBBIN_COLLIDER));
  const starter = createGame(); completeOpening(starter); starter.player.mode = "swimming";
  starter.player.pose.position = { ...RECOVERY_SURFACE_OPERATOR, z: RECOVERY_SURFACE_OPERATOR.z + 2.5 };
  const target = interactions(starter).find(t => t.id === "rescue_staging")!, host = interactionHost(starter, target);
  assert.deepEqual(target.position, RECOVERY_SURFACE_OPERATOR);
  starter.player.pose.yaw = 0;
  starter.player.pose.pitch = Math.atan2(host.center.y - starter.player.pose.position.y - .65, 2.5);
  assert.equal(aimedInteraction(starter, world)?.id, "rescue_staging");
  const opened = executeCommand(starter, { type: "interact", target: "rescue_staging" }, world);
  assert.ok(opened.events.some(e => e.type === "interaction-panel" && e.panel === "inventory" && e.targetId === "rescue_staging"));
  assert.equal(exposure(opened.state).breathable, true); roundTrip(opened.state);
  starter.player.pose.position = { ...RECOVERY_ROUTES.canopy.stage };
  assert.deepEqual(interactions(starter).find(t => t.id === "rescue_staging")!.position, RECOVERY_ROUTES.canopy.stage,
    "the original submerged work face is retained");
});

test("smoke: the first and last loss endpoints tow through every guide and turn with save/reload and exact cargo/module/frame retention", () => {
  // Every endpoint: tests/m2-route-recovery.heavy.test.ts (TT-1).
  const sites: Vec3[] = [...BASIN_SOURCE_IDS.map(id => ({ ...SOURCES[id].position, y: SOURCES[id].position.y + 2 })),
    { x: 178, y: -163.5, z: -219 }, { x: 216, y: -169, z: -241 },
    { x: 240, y: -189, z: -252 }, { x: 40, y: -4, z: -250 }];
  for (const site of [sites[0]!, sites.at(-1)!]) {
    let s = prepared(), v = s.fleet.vehicles[0]!; v.pose.position = { ...site }; v.charge = 0; disableVehicle(s, v.id);
    assert.ok(sweptHullClearance(world, rescueWaypoints(s, v.id, "basin"), BOBBIN_COLLIDER), JSON.stringify(site));
    assert.ok(sweptHullClearance(world, recoveryTowPath(s, v.id, "basin"), HULL_COLLIDERS.dart));
    const inventory = structuredClone(s.inventory), investment = structuredClone(v.investment), modules = [...v.modules];
    s = cmd(s, { type: "recover", vehicleId: v.id, method: "tow" }); assert.equal(s.recovery.operation!.routeId, "basin");
    let run = advance(s, true); s = run.state; assert.equal(s.recovery.operation!.phase, "ready");
    assert.deepEqual(s.fleet.vehicles[0]!.pose.position, site, "approach never moves a hull");
    for (const i of [1, 2, 3, 4, 5]) assert.ok(run.seen.has(`approach:${i}`));
    s = cmd(s, { type: "recover", vehicleId: v.id, method: "tow" });
    run = advance(s, false); s = run.state; v = s.fleet.vehicles[0]!;
    for (const i of [0, 1, 2, 3, 4]) assert.ok(run.seen.has(`tow:${i}`));
    assert.deepEqual(v.pose.position, RECOVERY_MOORING); assert.deepEqual(s.inventory, inventory);
    assert.deepEqual(v.modules, modules); assert.deepEqual(v.investment, investment); assert.equal(v.charge, 0); assert.equal(v.health, 0);
    assert.equal(s.recovery.losses.length, 1); assert.deepEqual(s.recovery.losses[0]!.position, RECOVERY_MOORING);
    assert.equal(s.metrics.rescues, 1);
  }
});

test("wrong route IDs, missing identity and illegal Basin waypoints refuse atomically", () => {
  let s = prepared(); const v = s.fleet.vehicles[0]!; v.pose.position = { ...BASIN_GEOMETRY.station.parking }; disableVehicle(s, v.id);
  s = cmd(s, { type: "recover", vehicleId: v.id, method: "tow" });
  for (const mutate of [
    (s: GameState) => { s.recovery.operation!.routeId = "canopy"; },
    (s: GameState) => { s.recovery.operation!.routeId = "district" as never; },
    (s: GameState) => { delete (s.recovery.operation as unknown as Record<string, unknown>).routeId; },
    (s: GameState) => { s.recovery.operation!.waypoint = 6; },
    (s: GameState) => { s.recovery.operation!.waypoint = 0; },
    (s: GameState) => { s.recovery.operation!.phase = "ready"; s.recovery.operation!.waypoint = 2; },
    (s: GameState) => { s.recovery.operation!.phase = "tow"; s.recovery.operation!.waypoint = 5; },
    (s: GameState) => { s.recovery.operation!.vehicleId = "unknown-hull"; },
  ]) { const bad = structuredClone(s); mutate(bad); assert.equal(encodeSave(createEnvelope(bad, meta)).ok, false); }
  const current = structuredClone(s); current.recovery.operation!.routeId = "basin";
  current.recovery.losses[0]!.position = { x: 140, y: -139, z: -142 }; assert.equal(validState(current), false);
});

test("occupied approach/ready/tow refuses before movement; occupied bound repair and local interruption retain investment", () => {
  let original = prepared(); const v = original.fleet.vehicles[0]!; v.pose.position = { ...BASIN_GEOMETRY.station.parking }; disableVehicle(original, v.id);
  original = cmd(original, { type: "recover", vehicleId: v.id, method: "tow" });
  for (const phase of ["approach", "ready", "tow"] as const) {
    const s = structuredClone(original), hull = s.fleet.vehicles[0]!;
    Object.assign(s.recovery.operation!, { phase, waypoint: phase === "ready" ? 5 : phase === "tow" ? 4 : 1 });
    s.player.controlledVehicleId = hull.id; s.player.mode = "piloting"; s.player.pose = structuredClone(hull.pose);
    const before = roundTrip(s);
    for (const method of ["tow", "salvage"] as const) {
      const r = executeCommand(s, { type: "recover", vehicleId: hull.id, method }, world);
      assert.deepEqual(r.state, before); assert.match(JSON.stringify(r.events), /occupied/); roundTrip(r.state);
    }
    const event = updateRecovery(s, world); assert.match(JSON.stringify(event), /occupied/);
    assert.deepEqual(s.fleet, before.fleet); assert.deepEqual(s.inventory, before.inventory); assert.equal(s.recovery.operation, null);
    const repaired = cmd(before, { type: "recover", vehicleId: hull.id, method: "repair" });
    assert.equal(repaired.recovery.operation, null); assert.equal(repaired.fleet.vehicles[0]!.health, 65);
    assert.equal(repaired.player.controlledVehicleId, hull.id); assert.deepEqual(repaired.inventory, before.inventory);
  }
  let s = original; s.player.pose.position = { ...s.fleet.vehicles[0]!.pose.position, x: s.fleet.vehicles[0]!.pose.position.x + 4 };
  const unsafe = structuredClone(s), denied = executeCommand(s, { type: "recover", vehicleId: v.id, method: "repair" }, world);
  assert.deepEqual(denied.state, unsafe); assert.match(JSON.stringify(denied.events), /safe personal depth/);
  s.player.pose.position = { ...PLACES.island_workshop.position };
  for (const [k, q] of Object.entries(RECIPES.suit_350.cost)) addItem(s, k as MaterialId, q, "workshop_locker");
  s = cmd(s, { type: "craft", recipeId: "suit_350" });
  s.player.pose.position = { ...s.fleet.vehicles[0]!.pose.position, x: s.fleet.vehicles[0]!.pose.position.x + 4 };
  s = cmd(s, { type: "recover", vehicleId: v.id, method: "repair" });
  assert.equal(s.recovery.operation, null); assert.equal(s.fleet.vehicles[0]!.charge, original.fleet.vehicles[0]!.charge);
});

test("obstructed extraction/tether never starts or moves the loss; remote summon from another region refuses", () => {
  const s = prepared(), v = s.fleet.vehicles[0]!; v.pose.position = { ...BASIN_GEOMETRY.station.parking }; disableVehicle(s, v.id);
  const obstruction = { id: "diagnostic.extraction", min: { x: 210, y: -150, z: -238 }, max: { x: 222, y: -149, z: -226 } };
  const blocked = createWorldQueries([...SOLIDS, obstruction]), before = structuredClone(s);
  const refused = executeCommand(s, { type: "recover", vehicleId: v.id, method: "tow" }, blocked);
  assert.deepEqual(refused.state, before); assert.match(JSON.stringify(refused.events), /blocked/);
  s.player.pose.position = { ...PLACES.home_pod.position }; const remote = structuredClone(s);
  assert.match(recoveryCommand(s, v.id, "tow", world)!, /Travel to the shallow rescue staging/); assert.deepEqual(s, remote);
});

test("an interrupted Basin tow restarts with its retained loss route after crossing the legacy rectangle", () => {
  let s = prepared(); const v = s.fleet.vehicles[0]!;
  v.pose.position = { ...BASIN_GEOMETRY.station.parking }; disableVehicle(s, v.id);
  s = cmd(s, { type: "recover", vehicleId: v.id, method: "tow" }); s = advance(s, true).state;
  s = cmd(s, { type: "recover", vehicleId: v.id, method: "tow" });
  for (let ticks = 0; s.fleet.vehicles[0]!.pose.position.z < -180; ticks++) {
    assert.ok(ticks < 10000); assert.equal(updateRecovery(s, world), null);
  }
  assert.equal(s.recovery.operation!.routeId, "basin");
  const before = roundTrip(s), stopped: WorldQueries = { ...world,
    moveCapsule(origin) { return { position: { ...origin }, hitSolid: true, hitBoundary: false }; } };
  assert.match(JSON.stringify(updateRecovery(s, stopped)), /blocked/); assert.equal(s.recovery.operation, null);
  assert.deepEqual(s.fleet, before.fleet); assert.deepEqual(s.recovery.losses, before.recovery.losses); roundTrip(s);
  s = cmd(s, { type: "recover", vehicleId: v.id, method: "tow" });
  assert.equal(s.recovery.operation!.routeId, "basin", "loss identity wins over current hull coordinates");
  s = advance(s, true).state; s = cmd(s, { type: "recover", vehicleId: v.id, method: "tow" }); s = advance(s, false).state;
  assert.deepEqual(s.fleet.vehicles[0]!.pose.position, RECOVERY_MOORING);
  assert.deepEqual(s.inventory, before.inventory); assert.equal(s.recovery.operation, null);
});

test("the preserved Canopy direct-tow obstruction has a local 150 m salvage route for cargo, trim and the whole paid frame", () => {
  for (const p of [{ x: 126, y: -118, z: -120 }, { x: 109, y: -114.4, z: -140 }, { x: 146, y: -142, z: -166 }]) {
    let s = prepared(); const v = s.fleet.vehicles[0]!, moduleId = v.modules[0]!, frame = structuredClone(v.investment);
    v.pose.position = { ...p }; disableVehicle(s, v.id);
    assert.equal(sweptHullClearance(world, recoveryTowPath(s, v.id), HULL_COLLIDERS.dart), false,
      "legacy waypoints retain their original meaning; a blocked direct tow is not represented as clear");
    s.player.pose.position = { ...p, x: p.x + 4.5 }; assert.ok(world.clearance(s.player.pose.position, { radius: .34, height: .95 }));
    assert.ok(-(p.y + .4) < 150); assert.equal(toggleBuoy(s), null);
    assert.equal(removeModule(s, v.id, moduleId, world), null); roundTrip(s);
    const retained = structuredClone(s.inventory.items.filter(i => i.containerId === v.cargoId));
    for (const i of retained) { assert.equal(transfer(s, i.id, "buoy_hold", i.quantity), null); roundTrip(s); }
    const stock = structuredClone(s.world.maintenance);
    s = cmd(s, { type: "recover", vehicleId: v.id, method: "salvage" });
    assert.equal(s.fleet.vehicles.length, 0); assert.equal(s.recovery.losses.length, 0);
    assert.deepEqual(s.world.maintenance, stock);
    for (const i of retained) assert.deepEqual(s.inventory.items.find(a => a.id === i.id),
      { ...i, quantity: i.quantity + (frame[i.kind as MaterialId] ?? 0), containerId: "buoy_hold" });
    for (const [kind, quantity] of Object.entries(frame)) {
      const cargo = retained.filter(i => i.kind === kind).reduce((n, i) => n + i.quantity, 0);
      assert.equal(s.inventory.items.filter(i => i.containerId === "buoy_hold" && i.kind === kind).reduce((n, i) => n + i.quantity, 0), quantity + cargo);
    }
    const before = structuredClone(s), refused = executeCommand(s, { type: "recover", vehicleId: v.id, method: "salvage" }, world);
    assert.deepEqual(refused.state, before); assert.ok(refused.events.some(e => e.type === "notice" && e.error)); roundTrip(refused.state);
  }
});

test("repeated losses retain earlier cargo markers; tow, remove, salvage and rebuild conserve original module and frame exactly once", () => {
  let s = prepared(); const id = s.fleet.vehicles[0]!.id, moduleId = s.fleet.vehicles[0]!.modules[0]!, frame = structuredClone(s.fleet.vehicles[0]!.investment);
  for (const site of [BASIN_GEOMETRY.dormitory.parking, BASIN_GEOMETRY.station.parking]) {
    const v = s.fleet.vehicles[0]!; v.pose.position = { ...site }; s.player.pose.position = { ...site }; addItem(s, "meal", 2, "diver");
    disableVehicle(s, id); incapacitate(s, "Seeded loss."); const caches = structuredClone(s.recovery.caches);
    s.player.pose.position = { ...RECOVERY_SURFACE_OPERATOR }; s.player.mode = "swimming";
    s = cmd(s, { type: "recover", vehicleId: id, method: "tow" }); s = advance(s, true).state;
    s = cmd(s, { type: "recover", vehicleId: id, method: "tow" }); s = advance(s, false).state;
    assert.deepEqual(s.recovery.caches, caches);
    s.player.pose.position = { x: 54, y: -11, z: -54 };
    s = cmd(s, { type: "recover", vehicleId: id, method: "repair" }); assert.equal(s.fleet.vehicles[0]!.modules[0], moduleId);
  }
  assert.equal(s.recovery.caches.length, 2); assert.equal(s.inventory.items.filter(i => i.kind === "dart_acoustic_trim").length, 1);
  const earlier = structuredClone(s.recovery.caches); disableVehicle(s, id);
  const hull = s.fleet.vehicles[0]!; assert.equal(removeModule(s, id, moduleId, world), null);
  for (const item of [...s.inventory.items].filter(i => i.containerId === hull.cargoId)) assert.equal(transfer(s, item.id, "diver", item.quantity), null);
  assert.equal(toggleBuoy(s), null);
  const amounts = Object.fromEntries(Object.keys(frame).map(k => [k, s.inventory.items.filter(i => i.kind === k).reduce((n, i) => n + i.quantity, 0)]));
  assert.equal(recoveryCommand(s, id, "salvage", world), null); s = roundTrip(s);
  for (const [k, q] of Object.entries(frame)) assert.equal(s.inventory.items.filter(i => i.kind === k).reduce((n, i) => n + i.quantity, 0), amounts[k]! + q);
  const salvaged = structuredClone(s); assert.ok(recoveryCommand(s, id, "salvage", world)); assert.deepEqual(s, salvaged);
  s.player.pose.position = { ...PLACES.island_workshop.position }; s.inventory.buoy.position = { ...s.player.pose.position };
  s = cmd(s, { type: "craft", recipeId: "dart_base" }); const rebuilt = s.fleet.vehicles[0]!;
  assert.notEqual(rebuilt.id, id); assert.deepEqual(rebuilt.investment, frame);
  assert.equal(installModule(s, rebuilt.id, moduleId), null); s = roundTrip(s);
  assert.deepEqual(s.recovery.caches, earlier); assert.equal(s.inventory.items.find(i => i.id === moduleId)!.containerId, rebuilt.cargoId);
  for (const k of Object.keys(frame)) assert.equal(s.inventory.items.filter(i => i.kind === k).reduce((n, i) => n + i.quantity, 0), amounts[k]);
  assert.equal(s.world.maintenance.alloy, 14); assert.equal(s.world.maintenance.membrane, 7);
});
