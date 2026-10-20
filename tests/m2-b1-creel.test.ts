import test from "node:test";
import assert from "node:assert/strict";
import { CREEL_BUILD_POSE, DART_BUILD_POSE, FRAME_ALLOY, HULL_COLLIDERS, ITEMS, MODULES, RECIPES, SOURCES } from "../src/content/registry.js";
import { CANOPY_STOP } from "../src/content/routes.js";
import { validState } from "../src/save/validation.js";
import {
  ARM_CHARGE, ARM_LIFT_SECONDS, armTarget, cabinHull, CREEL_CABIN, CREEL_HANDLING, fittedCabin, fittedMount,
  holdCapacity, hullToWorld, mobileRefugeBlock,
} from "../src/sim/fleet.js";
import { addItem, cabinLockerId, containerAccessible, supportedServiceSite, usedCapacity } from "../src/sim/inventory.js";
import { installModule, mountChangePreview, removeModule } from "../src/sim/modules.js";
import { craft, craftingBlock } from "../src/sim/progression.js";
import { disableVehicle, incapacitate, recoveryCommand, updateRecovery } from "../src/sim/recovery.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { exposure, airSupply } from "../src/sim/survival.js";
import type { GameCommand, GameEvent, GameState } from "../src/sim/types.js";
import { hullClearance } from "../src/sim/world.js";
import { at, creelFirst, creelOf, fund, parkCreel, pilotCreel, saveable, world, WORKSHOP_BENCH } from "./b1-support.js";

const idle: GameCommand = { type: "move", forward: 0, right: 0, vertical: 0, sprint: false };
const run = (s: GameState, commands: GameCommand[], steps: number): GameState => {
  for (let i = 0; i < steps; i++) s = stepGame(s, commands, world).state;
  return s;
};
const stock = (s: GameState, id: keyof typeof SOURCES): number => s.world.resources.find((n) => n.id === id)!.stock;
const message = (events: GameEvent[]): string => events.map((e) => e.type === "notice" ? e.message : "").join(" ");
/** Face a world point exactly as an ordinary look would. */
function face(s: GameState, p: { x: number; y: number; z: number }): void {
  const o = s.player.pose.position, eye = s.player.mode === "swimming" ? 0.65 : 1.62;
  const x = p.x - o.x, y = p.y - o.y - eye, z = p.z - o.z;
  s.player.pose.yaw = (Math.atan2(x, -z) + Math.PI * 2) % (Math.PI * 2);
  s.player.pose.pitch = Math.max(-1.35, Math.min(1.35, Math.atan2(y, Math.hypot(x, z))));
}
function fitFromDiver(s: GameState, kind: "creel_cargo_rack" | "creel_cabin"): string {
  const item = s.inventory.items.find((i) => i.kind === kind)!;
  item.containerId = "diver";
  at(s, { x: -6, y: -1, z: -21 });
  assert.equal(installModule(s, creelOf(s).id, item.id), null);
  return item.id;
}

test("Creel-first: C05 builds a Creel in the medium slip without any Dart, at the real cradle", () => {
  const s = creelFirst();
  const v = creelOf(s);
  assert.deepEqual(v.pose.position, CREEL_BUILD_POSE);
  assert.equal(v.rating, 240);
  assert.deepEqual(v.investment, RECIPES.creel_base.cost);
  assert.equal(s.inventory.containers.find((c) => c.id === v.cargoId)!.capacity, 64);
  assert.ok(hullClearance(world, v.pose.position, HULL_COLLIDERS.creel), "slip clears the full medium sweep");
  assert.equal(supportedServiceSite(s, v), "island_workshop");
  assert.ok(!(RECIPES.creel_base.needs as readonly string[]).includes("dart_base"), "no recipe requires buying a Dart");
  saveable(s);
  at(s, WORKSHOP_BENCH);
  for (const [k, q] of Object.entries(RECIPES.creel_base.cost)) addItem(s, k as keyof typeof ITEMS, q, "workshop_locker");
  const refused = executeCommand(s, { type: "craft", recipeId: "creel_base" }, world);
  assert.equal(refused.state, s); assert.match(message(refused.events), /A Creel already exists/);
});

test("a parked craft in the slip blocks the Creel without spending; the separate scout cradle does not", () => {
  const s = creelFirst();
  s.fleet.vehicles = []; s.inventory.containers = s.inventory.containers.filter((c) => c.kind !== "vehicle");
  at(s, WORKSHOP_BENCH);
  for (const [k, q] of Object.entries(RECIPES.creel_base.cost)) addItem(s, k as keyof typeof ITEMS, q, "workshop_locker");
  fund(s, "dart_base");
  s.fleet.vehicles[0]!.pose.position = { ...CREEL_BUILD_POSE };
  at(s, WORKSHOP_BENCH);
  const before = structuredClone(s);
  assert.equal(craftingBlock(s, "creel_base", world)?.code, "clearance");
  assert.equal(executeCommand(s, { type: "craft", recipeId: "creel_base" }, world).state, s); assert.deepEqual(s, before);
  s.fleet.vehicles[0]!.pose.position = { ...DART_BUILD_POSE };
  assert.equal(craftingBlock(s, "creel_base", world), null);
});

test("Creel handling: slower cruise, bounded turn rate and higher power use than the Dart", () => {
  const s = creelFirst(), v = parkCreel(s, { x: 30, y: -3, z: 0 }, 0); pilotCreel(s);
  let t = s;
  for (let i = 0; i < 240; i++)
    t = stepGame(t, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: false }, { type: "look", yawDelta: 0.5, pitchDelta: 0 }], world).state;
  const after = t.fleet.vehicles.find((a) => a.id === v.id)!;
  const speed = Math.hypot(after.velocity.x, after.velocity.z);
  assert.ok(speed <= CREEL_HANDLING.cruise + 1e-9 && speed > 3, `cruise ${speed}`);
  assert.ok(Math.min(after.pose.yaw, Math.PI * 2 - after.pose.yaw) <= CREEL_HANDLING.turnRate * 4 + 1e-6, "bounded heading rate");
  // Four seconds at cruise: 100/700 % per second, versus the Dart's 100/900.
  assert.ok(Math.abs(after.charge - (100 - 4 * CREEL_HANDLING.drain)) < 0.05, `charge ${after.charge}`);
  saveable(t);
});

test("rack and cabin compete for one mount; swaps keep item identity and refuse over-capacity changes atomically", () => {
  const s = creelFirst(["creel_cargo_rack", "creel_cabin"]), v = creelOf(s);
  const rack = s.inventory.items.find((i) => i.kind === "creel_cargo_rack")!, cabin = s.inventory.items.find((i) => i.kind === "creel_cabin")!;
  assert.equal(rack.containerId, "workshop_locker"); assert.equal(cabin.containerId, "workshop_locker");
  assert.ok(s.inventory.containers.some((c) => c.id === cabinLockerId(cabin.id) && c.capacity === 16));
  // The bench reaches the slip cargo; packages travel by hand to the slip water.
  at(s, WORKSHOP_BENCH);
  let t = s;
  const take = (id: string): void => {
    at(t, WORKSHOP_BENCH);
    const moved = executeCommand(t, { type: "transfer", itemId: id, to: "diver", quantity: 1 }, world);
    assert.notEqual(moved.state, t, message(moved.events)); t = moved.state;
    at(t, { x: -6, y: -1, z: -21 });
  };
  take(rack.id);
  const fit = executeCommand(t, { type: "install-module", vehicleId: v.id, itemId: rack.id }, world);
  assert.notEqual(fit.state, t, message(fit.events)); t = fit.state;
  take(cabin.id);
  assert.equal(fittedMount(t, creelOf(t))!.id, rack.id);
  assert.equal(t.inventory.containers.find((c) => c.id === v.cargoId)!.capacity, 96);
  saveable(t);
  addItem(t, "structural_alloy", 25, v.cargoId); // 50 CU: above the cabin's 40 CU hold
  const before = structuredClone(t);
  const swap = executeCommand(t, { type: "install-module", vehicleId: v.id, itemId: cabin.id }, world);
  assert.equal(swap.state, t, "over-capacity swap refused without a draft");
  assert.match(message(swap.events), /would need 50 CU .* leaves 40 CU\. Store 10 CU first/);
  assert.deepEqual(t, before);
  t.inventory.items.find((i) => i.containerId === v.cargoId && i.kind === "structural_alloy")!.quantity = 20;
  const swapped = executeCommand(t, { type: "install-module", vehicleId: v.id, itemId: cabin.id }, world);
  assert.notEqual(swapped.state, t); t = swapped.state;
  assert.equal(fittedCabin(t, creelOf(t))!.id, cabin.id, "same cabin instance");
  assert.equal(t.inventory.items.find((i) => i.id === rack.id)!.containerId, "diver", "rack stowed where the cabin came from");
  assert.equal(t.inventory.containers.find((c) => c.id === v.cargoId)!.capacity, 40);
  saveable(t);
  addItem(t, "meal", 2, cabinLockerId(cabin.id));
  assert.match(mountChangePreview(t, v.id, null).refusal!, /Empty the cabin locker/);
  saveable(t);
});

test("unfitting stows the package in the hold only when it fits; a stale hold size is invalid", () => {
  const s = creelFirst(["creel_cargo_rack"]), v = creelOf(s), rack = fitFromDiver(s, "creel_cargo_rack");
  addItem(s, "structural_alloy", 30, v.cargoId);
  assert.match(removeModule(s, v.id, rack, world)!, /would need 66 CU but the bare mount leaves 64 CU/);
  s.inventory.items.find((i) => i.containerId === v.cargoId && i.kind === "structural_alloy")!.quantity = 29;
  assert.equal(removeModule(s, v.id, rack, world), null);
  assert.equal(s.inventory.items.find((i) => i.id === rack)!.containerId, v.cargoId);
  assert.equal(usedCapacity(s, v.cargoId), 64);
  saveable(s);
  const stale = structuredClone(s); stale.inventory.containers.find((c) => c.id === v.cargoId)!.capacity = 96;
  assert.equal(validState(stale), false);
});

test("a diver frame lift takes 10 s and needs tools; an alongside Creel's arms take the frame", () => {
  const s = creelFirst(), id = "basin_frame_ridge", p = SOURCES[id].position;
  at(s, { x: p.x, y: p.y + 1.4, z: p.z + 3 }); face(s, { x: p.x, y: p.y + 0.35, z: p.z });
  const r = executeCommand(s, { type: "interact", target: id }, world);
  assert.deepEqual(r.state.world.action, { sourceId: id, seconds: 10, kind: "lift" }, message(r.events));
  saveable(r.state);
  let t = run(r.state, [idle], 9 * 60);
  assert.equal(stock(t, id), 3, "nothing taken before completion");
  t = run(t, [idle], 70);
  assert.equal(stock(t, id), 2);
  assert.equal(t.inventory.items.find((i) => i.kind === "tagged_frame")!.containerId, "diver");
  saveable(t);
  const noTools = structuredClone(s); noTools.inventory.items = noTools.inventory.items.filter((i) => i.kind !== "essential_tools");
  noTools.knowledge.crafted = noTools.knowledge.crafted.filter((c) => c === "suit_150" || c === "pod_repair");
  assert.match(message(executeCommand(noTools, { type: "interact", target: id }, world).events), /service tool/);
  parkCreel(t, { x: p.x + 4, y: p.y + 5, z: p.z + 4 });
  const charge = creelOf(t).charge;
  t.world.action = { sourceId: id, seconds: 0.01, kind: "lift" };
  t = run(t, [idle], 2);
  assert.equal(t.inventory.items.find((i) => i.kind === "tagged_frame" && i.containerId === creelOf(t).cargoId)?.quantity, 1);
  assert.ok(Math.abs(creelOf(t).charge - (charge - ARM_CHARGE)) < 0.1);
  saveable(t);
});

test("piloted tool arms load Basin salvage from the cockpit; leaving the helm releases them", () => {
  const s = creelFirst(), p = SOURCES.basin_frame_ridge.position;
  const v = parkCreel(s, { x: p.x, y: p.y + 4.5, z: p.z + 5.5 }, 0); pilotCreel(s);
  const target = armTarget(s);
  assert.equal(target?.sourceId, "basin_frame_ridge"); assert.equal(target!.refusal, null);
  const started = executeCommand(s, { type: "arm-lift" }, world);
  assert.equal(started.state.world.action?.kind, "arm"); saveable(started.state);
  const t = run(started.state, [idle], ARM_LIFT_SECONDS * 60 + 2);
  assert.equal(t.inventory.items.find((i) => i.kind === "tagged_frame" && i.containerId === v.cargoId)?.quantity, 1);
  assert.equal(t.player.controlledVehicleId, v.id, "no exit, no diver exposure");
  saveable(t);
  const again = executeCommand(t, { type: "arm-lift" }, world).state;
  assert.equal(again.world.action?.kind, "arm");
  const left = executeCommand(again, { type: "exit" }, world);
  assert.notEqual(left.state, again, message(left.events));
  assert.equal(left.state.world.action, null); saveable(left.state);
});

test("the outer-crown mooring restores with a tagged frame, then services, charges and stores but gives no air", () => {
  const s = creelFirst();
  at(s, CANOPY_STOP.work);
  assert.equal(craftingBlock(s, "restore_canopy_stop", world)?.code, "materials");
  for (const [k, q] of Object.entries(RECIPES.restore_canopy_stop.cost)) addItem(s, k as keyof typeof ITEMS, q, "diver");
  assert.ok(!containerAccessible(s, "canopy_stop_locker"), "the dark mooring locker stays locked");
  const r = executeCommand(s, { type: "craft", recipeId: "restore_canopy_stop" }, world);
  assert.notEqual(r.state, s); const t = r.state; saveable(t);
  assert.ok(containerAccessible(t, "canopy_stop_locker"));
  const v = parkCreel(t, CANOPY_STOP.mooring); v.charge = 31; v.health = 70;
  at(t, { x: CANOPY_STOP.mooring.x, y: CANOPY_STOP.mooring.y + 2, z: CANOPY_STOP.mooring.z - 3 });
  assert.equal(supportedServiceSite(t, v), "canopy_stop");
  const served = executeCommand(t, { type: "service", vehicleId: v.id }, world);
  assert.equal(creelOf(served.state).charge, 100); assert.equal(creelOf(served.state).health, 100);
  saveable(served.state);
  assert.equal(exposure(served.state).refuge, false);
});

test("the fitted cabin is a dry powered refuge from a stopped helm; it registers, cooks and keeps finite emergency air", () => {
  const s = creelFirst(["creel_cabin"]), v = creelOf(s), cabin = fitFromDiver(s, "creel_cabin");
  parkCreel(s, { x: 30, y: -3, z: 0 }); pilotCreel(s);
  creelOf(s).velocity = { x: 2, y: 0, z: 0 };
  assert.match(message(executeCommand(s, { type: "cabin", action: "enter" }, world).events), /Slow to a stop/);
  creelOf(s).velocity = { x: 0, y: 0, z: 0 };
  let t = executeCommand(s, { type: "cabin", action: "enter" }, world).state;
  assert.equal(cabinHull(t)?.id, v.id); assert.equal(t.player.mode, "interior");
  assert.equal(exposure(t).refuge, true); assert.equal(airSupply(t).kind, "refuge");
  saveable(t);
  t.player.interiorPose!.position = { x: 0.3, y: CREEL_CABIN.floorY, z: 1.6 };
  t.player.pose.position = hullToWorld(t.player.interiorPose!.position, creelOf(t));
  const reg = executeCommand(t, { type: "register-refuge", vehicleId: v.id }, world);
  assert.notEqual(reg.state, t, message(reg.events)); t = reg.state;
  assert.deepEqual(t.player.mobileRefuge, { vehicleId: v.id, moduleId: cabin });
  saveable(t);
  addItem(t, "meal", 1, cabinLockerId(cabin)); t.player.vitals.food = 20;
  t.player.interiorPose!.position = { x: -0.6, y: CREEL_CABIN.floorY, z: 0.4 };
  t.player.pose.position = hullToWorld(t.player.interiorPose!.position, creelOf(t));
  const cooked = executeCommand(t, { type: "cabin", action: "cook" }, world);
  assert.equal(cooked.state.player.vitals.food, 100, message(cooked.events)); assert.equal(cooked.state.player.graceSeconds, 180);
  saveable(cooked.state);
  t = cooked.state; creelOf(t).charge = 0;
  assert.equal(exposure(t).refuge, false); assert.equal(airSupply(t).kind, "emergency");
  const later = run(t, [idle], 600);
  assert.ok(Math.abs(creelOf(later).emergencyAir - 110) < 0.1, `finite emergency air ${creelOf(later).emergencyAir}`);
  assert.equal(later.player.vitals.oxygen, 100);
  saveable(later);
  // Walking stays inside the fixed room; the hatch refuses an unsafe exit depth.
  const walked = run(t, [{ type: "move", forward: 1, right: 1, vertical: 0, sprint: false }], 240);
  const local = walked.player.interiorPose!.position;
  assert.ok(local.x >= CREEL_CABIN.walk.minX && local.x <= CREEL_CABIN.walk.maxX && local.z >= CREEL_CABIN.walk.minZ && local.z <= CREEL_CABIN.walk.maxZ);
  saveable(walked);
});

test("incapacity uses the registered cabin only when healthy, powered, clear and unthreatened; otherwise the home pod", () => {
  const base = creelFirst(["creel_cabin"]), v = creelOf(base), cabin = fitFromDiver(base, "creel_cabin");
  parkCreel(base, { x: 30, y: -3, z: 0 });
  base.player.mobileRefuge = { vehicleId: v.id, moduleId: cabin };
  at(base, { x: 60, y: -40, z: -60 });
  assert.equal(mobileRefugeBlock(base, world), null);
  const safe = structuredClone(base); incapacitate(safe, "Oxygen exhausted.", world);
  assert.equal(cabinHull(safe)?.id, v.id); assert.match(safe.feedback, /registered Creel cabin/);
  saveable(safe);
  const cases: [string, (s: GameState) => void, RegExp][] = [
    ["disabled", (s) => { disableVehicle(s, v.id); }, /hull is disabled/],
    ["unpowered", (s) => { creelOf(s).charge = 0; }, /no power for air/],
    ["obstructed", (s) => { creelOf(s).pose.position = { x: 0, y: -0.5, z: 15 }; }, /obstructed/],
    ["threat", (s) => { s.world.threat.mode = "pursue"; s.world.threat.position = { x: 33, y: -3, z: 2 }; }, /hunter/],
  ];
  for (const [name, mutate, reason] of cases) {
    const s = structuredClone(base); mutate(s);
    assert.ok(mobileRefugeBlock(s, world), name);
    incapacitate(s, "Oxygen exhausted.", world);
    assert.equal(s.player.interiorId, null, name); assert.equal(s.player.refugeId, "home_pod", name);
    assert.match(s.feedback, reason, name);
    assert.deepEqual(s.player.mobileRefuge, { vehicleId: v.id, moduleId: cabin }, `${name}: registration kept`);
    saveable(s);
  }
});

test("a disabled Creel tows home from the Basin with mount and cargo, or salvages in place into one canister", () => {
  const s = creelFirst(["creel_cargo_rack"]), v = creelOf(s), rack = fitFromDiver(s, "creel_cargo_rack");
  addItem(s, "tagged_frame", 3, v.cargoId); addItem(s, "conductive_crust", 6, v.cargoId);
  parkCreel(s, { x: 222, y: -164, z: -206 }); disableVehicle(s, v.id);
  const before = structuredClone(s.inventory.items.filter((i) => i.containerId === v.cargoId));
  const tow = structuredClone(s); at(tow, { x: 46, y: -0.5, z: -54 });
  assert.equal(recoveryCommand(tow, v.id, "tow", world), null); saveable(tow);
  let steps = 0;
  while (tow.recovery.operation?.phase !== "ready") { const e = updateRecovery(tow, world); assert.ok(!(e as { error?: boolean } | null)?.error); assert.ok(++steps < 20000); }
  assert.equal(recoveryCommand(tow, v.id, "tow", world), null);
  while (tow.recovery.operation) { const e = updateRecovery(tow, world); assert.ok(!(e as { error?: boolean } | null)?.error, JSON.stringify(e)); assert.ok(++steps < 40000); }
  assert.deepEqual(tow.inventory.items.filter((i) => i.containerId === v.cargoId), before, "mount and cargo intact");
  assert.ok(Math.abs(creelOf(tow).pose.position.x - 51) < 0.01); saveable(tow);
  const salvage = structuredClone(s); at(salvage, { x: 222, y: -160, z: -201 });
  assert.equal(recoveryCommand(salvage, v.id, "salvage", world), null);
  assert.equal(salvage.fleet.vehicles.length, 0);
  const canister = salvage.recovery.caches.find((c) => c.id.startsWith("canister_"))!;
  const inside = salvage.inventory.items.filter((i) => i.containerId === canister.containerId);
  assert.equal(inside.find((i) => i.id === rack)?.fitted, null, "the rack survives intact");
  for (const [k, q] of Object.entries(RECIPES.creel_base.cost))
    assert.ok(inside.filter((i) => i.kind === k).reduce((n, i) => n + i.quantity, 0) >= q, `${k} returned`);
  assert.equal(inside.filter((i) => i.kind === "tagged_frame").reduce((n, i) => n + i.quantity, 0), 3);
  saveable(salvage);
});

test("paid 350 m refits are part of the frame: strict investment, refit receipt and the deeper damage threshold", () => {
  const s = creelFirst();
  at(s, WORKSHOP_BENCH);
  for (const [k, q] of Object.entries(RECIPES.creel_350.cost)) addItem(s, k as keyof typeof ITEMS, q, "workshop_locker");
  assert.equal(craft(s, "creel_350", world), null);
  const v = creelOf(s); assert.equal(v.rating, 350);
  assert.equal(v.investment.tagged_frame, 2);
  assert.equal(craftingBlock(s, "creel_350", world)?.code, "refit");
  saveable(s);
  const tampered = structuredClone(s); creelOf(tampered).investment.tagged_frame = 1;
  assert.equal(validState(tampered), false);
  const unpaid = structuredClone(s); unpaid.knowledge.crafted = unpaid.knowledge.crafted.filter((r) => r !== "creel_350");
  assert.equal(validState(unpaid), false);
  pilotCreel(s); creelOf(s).pose.position = { x: 196, y: -255, z: -292 }; s.player.pose.position = { ...creelOf(s).pose.position };
  assert.equal(creelOf(run(s, [idle], 60)).health, 100);
  const base = creelFirst(); pilotCreel(base); creelOf(base).pose.position = { x: 196, y: -255, z: -292 };
  base.player.pose.position = { ...creelOf(base).pose.position };
  assert.ok(creelOf(run(base, [idle], 60)).health < 100, "a 240 m Creel is damaged in the fracture");
});

test("the keel plate grants only the optional Dart 350 plan; stripping keeps frames as alloy", () => {
  const s = creelFirst(); at(s, { x: 172, y: -197.9, z: -253 }); face(s, { x: 172, y: -199.1, z: -256 });
  const t = executeCommand(s, { type: "interact", target: "basin_keel_plate" }, world).state;
  assert.ok(t.knowledge.blueprints.includes("bp_keel_survey")); assert.ok(t.knowledge.scans.includes("basin_keel_plate"));
  saveable(t);
  at(t, WORKSHOP_BENCH); addItem(t, "tagged_frame", 1, "workshop_locker");
  const alloy = (x: GameState) => x.inventory.items.filter((i) => i.kind === "structural_alloy" && i.containerId === "workshop_locker").reduce((n, i) => n + i.quantity, 0);
  const before = alloy(t);
  assert.equal(craft(t, "strip_frame", world), null);
  assert.equal(alloy(t) - before, FRAME_ALLOY);
  saveable(t);
});

test("validator rejects laundered mounts, lockers, refuges, ratings and campaign fleets", () => {
  const s = creelFirst(["creel_cabin"]), v = creelOf(s), cabin = fitFromDiver(s, "creel_cabin");
  saveable(s);
  const bad: [string, (t: GameState) => void][] = [
    ["mount outside its hold", (t) => { t.inventory.items.find((i) => i.id === cabin)!.containerId = "diver"; }],
    ["mount not referenced", (t) => { creelOf(t).modules = []; }],
    ["stowed cabin with locker contents", (t) => {
      t.inventory.items.find((x) => x.id === cabin)!.fitted = null; creelOf(t).modules = [];
      t.inventory.containers.find((c) => c.id === v.cargoId)!.capacity = 64; addItem(t, "meal", 1, cabinLockerId(cabin));
    }],
    ["refuge naming no cabin", (t) => { t.player.mobileRefuge = { vehicleId: v.id, moduleId: "item_9999" }; }],
    ["second Creel", (t) => { t.fleet.vehicles.push({ ...structuredClone(creelOf(t)), id: "creel_2", cargoId: "creel_2_hold", modules: [] });
      t.inventory.containers.push({ id: "creel_2_hold", kind: "vehicle", capacity: 64, ownerId: "creel_2" }); }],
    ["unpaid rating", (t) => { creelOf(t).rating = 350; }],
    ["frame with maintenance provenance", (t) => { addItem(t, "tagged_frame", 1, "diver", null, "maintenance"); }],
  ];
  for (const [name, mutate] of bad) { const t = structuredClone(s); mutate(t); assert.equal(validState(t), false, name); }
  assert.equal(holdCapacity(s, creelOf(s)), MODULES.creel_cabin.holdCu);
});
