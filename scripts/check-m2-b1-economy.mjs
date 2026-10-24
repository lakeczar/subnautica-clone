// Run after `npm test` (compiled production modules). M2-B1 runtime economy: every price,
// yield and capacity comes from the registry and real commands. Positions are staged
// (diagnostic), never ordinary input; ordinary routes and margins live in the browser report.
// Optional: --out <result.json>
import assert from "node:assert/strict";
import fs from "node:fs";
import { CONTENT_VERSION, CREEL_BUILD_POSE, DART_BUILD_POSE, FRAME_ALLOY, ITEMS, MATERIALS, RECIPES, SOURCE_RENEWAL, SOURCES } from "../.test-build/src/content/registry.js";
import { CANOPY_STOP } from "../.test-build/src/content/routes.js";
import { createGame } from "../.test-build/src/sim/state.js";
import { collectWithOutcome, completeOpening, craft, craftingBlock, discover, readTechRecord } from "../.test-build/src/sim/progression.js";
import { addItem, available, fabricationContainers, hasRoom, storeMaterials, transfer, usedCapacity } from "../.test-build/src/sim/inventory.js";
import { installModule } from "../.test-build/src/sim/modules.js";
import { disableVehicle, recoveryCommand } from "../.test-build/src/sim/recovery.js";
import { executeCommand, stepGame } from "../.test-build/src/sim/step.js";
import { personalLimit } from "../.test-build/src/sim/capabilities.js";
import { createWorldQueries } from "../.test-build/src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from "../.test-build/src/save/codec.js";
import { validState } from "../.test-build/src/save/validation.js";
import { guardLocalRun } from "./local-guard.mjs";

guardLocalRun();

const args = process.argv.slice(2), out = args[args.indexOf("--out") + 1];
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--out"), "only --out is supported");
const world = createWorldQueries();
const meta = { sessionId: "m2-b1-economy", createdAt: "2026-10-19T00:00:00.000Z", savedAt: "2026-10-19T00:01:00.000Z" };
const WORKSHOP = { x: 10, y: 1.2, z: -34 }, POD = { x: 0, y: 0.18, z: 21.2 }, SLIP_WATER = { x: -6, y: -1, z: -21 };
const idle = { type: "move", forward: 0, right: 0, vertical: 0, sprint: false };

function scenario(name, strategy) {
  let s = createGame(); completeOpening(s);
  const log = { name, strategy, crafts: [], collections: 0, transfers: 0, lifts: 0, armLifts: 0, codec: 0, gathered: {}, spent: {} };
  const check = () => {
    assert.ok(validState(s), `${name}: strict state after ${log.crafts.at(-1) ?? "start"}`);
    const e = encodeSave(createEnvelope(s, meta)); assert.ok(e.ok, e.ok ? "" : e.error);
    const d = decodeSave(e.value); assert.ok(d.ok); assert.deepEqual(d.value.state, s); log.codec++;
  };
  const at = (p) => { s.player.pose.position = { ...p }; s.player.mode = p.y < 0 ? "swimming" : "walking";
    s.player.controlledVehicleId = null; s.player.interiorId = null; s.player.interiorPose = null; s.player.velocity = { x: 0, y: 0, z: 0 }; s.world.action = null; };
  const bench = (site) => site === "island_workshop" ? WORKSHOP : site === "canopy_stop" ? CANOPY_STOP.work : POD;
  const locker = (site) => site === "island_workshop" ? "workshop_locker" : site === "canopy_stop" ? "canopy_stop_locker" : "pod_locker";
  const unload = (site) => {
    at(bench(site));
    const to = s.world.facilities.find((f) => f.id === (site === "island_workshop" ? "island_workshop" : site === "canopy_stop" ? "canopy_stop" : "home_pod"))?.repaired
      || site === "home_pod" || site === "pod_fabricator" ? locker(site) : null;
    if (!to) return;
    for (const i of [...s.inventory.items].filter((i) => i.containerId === "diver" && !i.fitted && (Object.hasOwn(MATERIALS, i.kind) || i.kind === "tagged_frame"))) {
      assert.equal(transfer(s, i.id, to, i.quantity), null); log.transfers++;
    }
  };
  // Gather one material from finite exposed stock within current protection; never sort reserves.
  const gather = (kind, need, site) => {
    const limit = personalLimit(s);
    for (const [id, src] of Object.entries(SOURCES).filter(([, d]) => d.item === kind).sort(([a], [b]) => (log.gathered[a] ?? 0) - (log.gathered[b] ?? 0))) {
      const node = s.world.resources.find((n) => n.id === id);
      while (need > 0 && node.stock > 0 && -src.position.y - 0.4 <= limit) {
        if (!hasRoom(s, "diver", ITEMS[kind].cu * src.bundle)) unload(site);
        at({ ...src.position, y: src.position.y + 0.5 });
        if (kind === "tagged_frame") {
          assert.equal(collectWithOutcome(s, id).refusal, null, id);
          for (let i = 0; i < 10 * 60 + 2 && s.world.action; i++) s = stepGame(s, [idle], world).state;
          log.lifts++; need -= 1; log.gathered[id] = (log.gathered[id] ?? 0) + 1;
        } else {
          const got = collectWithOutcome(s, id); assert.equal(got.refusal, null, `${id}: ${got.refusal}`);
          need -= got.pickup.quantity; log.gathered[id] = (log.gathered[id] ?? 0) + got.pickup.quantity;
        }
        log.collections++;
      }
    }
    assert.ok(need <= 0, `${name}: ${kind} exhausted with ${need} still needed`);
  };
  const make = (id) => {
    const r = RECIPES[id];
    // A shut site locker means carried stock pays: leave the buoy and cells at the pod first.
    const open = r.site === "island_workshop" ? s.world.facilities.find((f) => f.id === "island_workshop").repaired
      : r.site === "canopy_stop" ? s.world.facilities.find((f) => f.id === "canopy_stop").repaired : true;
    if (!open) {
      at(POD);
      for (const i of [...s.inventory.items].filter((x) => x.containerId === "diver" && !x.fitted && !Object.hasOwn(MATERIALS, x.kind) && x.kind !== "tagged_frame")) {
        assert.equal(transfer(s, i.id, "pod_locker", i.quantity), null); log.transfers++;
      }
    }
    unload(r.site);
    for (const [kind, q] of Object.entries(r.maintenance ? {} : r.cost)) {
      at(bench(r.site));
      const need = q - available(s, kind, fabricationContainers(s, r.site));
      if (need > 0) { gather(kind, need, r.site); at(bench(r.site)); }
      // Before its own restoration a site's locker is shut: carried stock pays.
    }
    at(bench(r.site));
    const no = craft(s, id, world); assert.equal(no, null, `${name}: ${id}: ${no}`);
    for (const [k, q] of Object.entries(r.maintenance ? {} : r.cost)) log.spent[k] = (log.spent[k] ?? 0) + q;
    log.crafts.push(id); check(); unload(r.site);
  };
  const fit = (kind) => {
    const item = s.inventory.items.find((i) => i.kind === kind);
    at(WORKSHOP); if (item.containerId !== "diver") { assert.equal(transfer(s, item.id, "diver", 1), null); log.transfers++; }
    at(SLIP_WATER); const v = s.fleet.vehicles.find((x) => x.hull === "creel");
    assert.equal(installModule(s, v.id, item.id), null); check();
  };
  discover(s, "C02"); discover(s, "C03");
  for (const id of ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit", "restore_workshop"]) make(id);
  if (strategy === "dart-first") make("dart_base");
  discover(s, "C04"); make("suit_350");
  discover(s, "C05"); discover(s, "C06");
  make("creel_base"); make("creel_cargo_rack"); fit("creel_cargo_rack");
  make("restore_canopy_stop"); make("creel_350");
  // Optional purchases: the second mount, and for the Dart route trim plus its 350 refit.
  make("creel_cabin");
  if (strategy === "dart-first") { make("dart_acoustic_trim"); readTechRecord(s, "basin_keel_plate"); make("dart_350"); }
  // Failed rescue: the refitted Creel is lost in the fracture with a full working load.
  const v = s.fleet.vehicles.find((x) => x.hull === "creel");
  const stowBefore = structuredClone(v.investment);
  v.pose.position = { x: 196, y: -258, z: -292 }; v.velocity = { x: 0, y: 0, z: 0 };
  addItem(s, "structural_alloy", 4, v.cargoId); disableVehicle(s, v.id);
  at({ x: 196, y: -254, z: -289 });
  assert.equal(recoveryCommand(s, v.id, "salvage", world), null, "in-place salvage at the fracture collar"); check();
  const canister = s.recovery.caches.find((c) => c.id.startsWith("canister_"));
  const returned = s.inventory.items.filter((i) => i.containerId === canister.containerId);
  const returnedCu = returned.reduce((n, i) => n + ITEMS[i.kind].cu * i.quantity, 0);
  // Haul the canister home in diver trips (no second hull), counting trips.
  let trips = 0;
  while (s.inventory.items.some((i) => i.containerId === canister.containerId)) {
    at({ ...canister.position });
    let moved = false;
    for (const i of [...s.inventory.items].filter((x) => x.containerId === canister.containerId)) {
      const fits = Math.floor((16 - usedCapacity(s, "diver")) / ITEMS[i.kind].cu);
      const n = Math.min(fits, i.quantity);
      if (n > 0) { assert.equal(transfer(s, i.id, "diver", n), null); log.transfers++; moved = true; }
    }
    assert.ok(moved, "every canister item fits the diver hold on some trip");
    trips++; unload("island_workshop");
    for (const i of [...s.inventory.items].filter((x) => x.containerId === "diver" && !x.fitted && !Object.hasOwn(MATERIALS, x.kind) && x.kind !== "tagged_frame")) {
      assert.equal(transfer(s, i.id, "workshop_locker", i.quantity), null); log.transfers++;
    }
  }
  // Rebuild from the salvage return alone: no gathering is allowed for these crafts.
  const before = structuredClone(log.gathered);
  for (const id of ["creel_base", "creel_350"]) {
    at(WORKSHOP); assert.equal(craftingBlock(s, id, world), null, `${name}: rebuild ${id} from returned stock`);
    assert.equal(craft(s, id, world), null); log.crafts.push(`${id} (rebuild)`); check();
  }
  assert.deepEqual(log.gathered, before, "rebuild used only salvage returns");
  const rebuilt = s.fleet.vehicles.find((x) => x.hull === "creel");
  assert.deepEqual(rebuilt.investment, stowBefore, "same frame investment restored");
  // Only timed lifts advance simulated time; it stays below one regrowth interval,
  // so no living shed added stock: solvency below credits zero renewal.
  const minInterval = Math.min(...Object.values(SOURCE_RENEWAL).map((r) => r.intervalSteps));
  assert.ok(s.tick < minInterval, `simulated ${s.tick} steps; no regrowth interval completed`);
  log.simulatedSteps = s.tick;
  for (const id of Object.keys(SOURCE_RENEWAL)) assert.ok((log.gathered[id] ?? 0) <= SOURCES[id].stock, `${id}: original exposed stock only`);
  const remaining = {};
  for (const kind of [...Object.keys(MATERIALS), "tagged_frame"]) {
    const sources = Object.entries(SOURCES).filter(([, d]) => d.item === kind);
    remaining[kind] = { exposed: sources.reduce((n, [id]) => n + s.world.resources.find((x) => x.id === id).stock, 0),
      reserve: sources.reduce((n, [id]) => n + s.world.resources.find((x) => x.id === id).reserve, 0) };
  }
  return { ...log, canister: { returnedCu, trips }, remaining, rescueStock: s.world.maintenance, finalCrafted: s.knowledge.crafted.length };
}

/** Hauling friction: deliver 3 tagged frames + 16 loose alloy from the Basin ridge to the
 * workshop with (a) a rack-fitted Creel's arms and (b) a Dart + deployed buoy by hand. */
function haul(kind) {
  let s = createGame(); completeOpening(s);
  for (const id of ["C02", "C03", "C04", "C05", "C06"]) discover(s, id);
  const fundCraft = (id) => {
    const r = RECIPES[id], bench = r.site === "island_workshop" ? WORKSHOP : POD;
    s.player.pose.position = { ...bench }; s.player.mode = "walking";
    for (const [k, q] of Object.entries(r.maintenance ? {} : r.cost)) addItem(s, k, q, r.site === "island_workshop" && id !== "restore_workshop" ? "workshop_locker" : "diver");
    assert.equal(craft(s, id, world), null, id);
  };
  for (const id of ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "restore_workshop", "suit_350", kind === "creel" ? "creel_base" : "dart_base"]) fundCraft(id);
  const counts = { actions: 0, transfers: 0, trips: 1, secondsWorking: 0 };
  const v = s.fleet.vehicles[0];
  const ridge = SOURCES.basin_frame_ridge.position, salvage = SOURCES.basin_ridge_salvage_south.position;
  if (kind === "creel") {
    fundCraft("creel_cargo_rack");
    const rack = s.inventory.items.find((i) => i.kind === "creel_cargo_rack");
    s.player.pose.position = { ...WORKSHOP }; assert.equal(transfer(s, rack.id, "diver", 1), null); counts.transfers++;
    s.player.pose.position = { ...SLIP_WATER }; s.player.mode = "swimming"; assert.equal(installModule(s, v.id, rack.id), null);
    const pilotAt = (p) => { const v = s.fleet.vehicles[0]; v.pose.position = { ...p }; v.pose.yaw = 0; v.velocity = { x: 0, y: 0, z: 0 }; s.player.controlledVehicleId = v.id;
      s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose); };
    for (const [host, offset] of [[ridge, 0], [ridge, 0], [ridge, 0], [salvage, 1], [salvage, 1], [salvage, 1], [salvage, 1]]) {
      pilotAt({ x: host.x, y: host.y + 4.5, z: host.z + 5.5 });
      const r = executeCommand(s, { type: "arm-lift" }, world); assert.notEqual(r.state, s, JSON.stringify(r.events)); s = r.state;
      for (let i = 0; i < 6 * 60 + 2 && s.world.action; i++) s = stepGame(s, [idle], world).state;
      counts.actions++; counts.secondsWorking += 6;
      void offset;
    }
    const hold = s.fleet.vehicles[0].cargoId;
    // Home at the slip: one bulk store for alloy, one transfer for the frame stack.
    s.fleet.vehicles[0].pose.position = { ...CREEL_BUILD_POSE }; s.player.controlledVehicleId = null; s.player.mode = "walking"; s.player.pose.position = { ...WORKSHOP };
    assert.equal(storeMaterials(s, hold, "workshop_locker"), null); counts.transfers++;
    const frames = s.inventory.items.find((i) => i.kind === "tagged_frame" && i.containerId === hold);
    assert.equal(transfer(s, frames.id, "workshop_locker", frames.quantity), null); counts.transfers++;
  } else {
    const dart = () => s.fleet.vehicles[0];
    // Dart parked on the ridge, buoy deployed beside the frames; the diver lifts and ferries.
    dart().pose.position = { x: ridge.x, y: ridge.y + 5, z: ridge.z + 6 };
    s.player.pose.position = { ...WORKSHOP }; const buoy = s.inventory.items.find((i) => i.kind === "salvage_buoy");
    if (buoy.containerId !== "diver") { assert.equal(transfer(s, buoy.id, "diver", 1), null); counts.transfers++; }
    s.player.pose.position = { x: ridge.x, y: ridge.y + 0.5, z: ridge.z + 1 }; s.player.mode = "swimming";
    const deployed = executeCommand(s, { type: "buoy" }, world); assert.notEqual(deployed.state, s); s = deployed.state;
    let delivered = 0, alloy = 0;
    while (delivered < 3) {
      s.player.pose.position = { x: ridge.x, y: ridge.y + 0.5, z: ridge.z + 1 };
      assert.equal(collectWithOutcome(s, "basin_frame_ridge").refusal, null);
      for (let i = 0; i < 10 * 60 + 2 && s.world.action; i++) s = stepGame(s, [idle], world).state;
      counts.actions++; counts.secondsWorking += 10;
      const frame = s.inventory.items.find((i) => i.kind === "tagged_frame" && i.containerId === "diver");
      const to = hasRoom(s, dart().cargoId, 10) ? dart().cargoId : "buoy_hold";
      s.player.pose.position = { x: dart().pose.position.x, y: dart().pose.position.y, z: dart().pose.position.z - 2 };
      if (to === "buoy_hold") s.inventory.buoy.position = { ...s.player.pose.position };
      assert.equal(transfer(s, frame.id, to, frame.quantity), null, to); counts.transfers++; delivered++;
    }
    while (alloy < 16) {
      s.player.pose.position = { x: salvage.x, y: salvage.y + 0.5, z: salvage.z + 1 };
      if (!hasRoom(s, "diver", 8)) throw new Error("diver full");
      const got = collectWithOutcome(s, "basin_ridge_salvage_south"); assert.equal(got.refusal, null, got.refusal ?? ""); counts.actions++;
      alloy += got.pickup.quantity;
      const item = s.inventory.items.find((i) => i.kind === "structural_alloy" && i.containerId === "diver");
      s.player.pose.position = { x: dart().pose.position.x, y: dart().pose.position.y, z: dart().pose.position.z - 2 };
      s.inventory.buoy.position = { ...s.player.pose.position };
      const to = hasRoom(s, dart().cargoId, ITEMS.structural_alloy.cu * item.quantity) ? dart().cargoId : hasRoom(s, "buoy_hold", ITEMS.structural_alloy.cu * item.quantity) ? "buoy_hold" : null;
      if (!to) { counts.overflow = (counts.overflow ?? 0) + item.quantity; break; }
      assert.equal(transfer(s, item.id, to, item.quantity), null); counts.transfers++;
    }
    // Unload Dart hold and buoy at the workshop.
    s.player.pose.position = { ...WORKSHOP }; s.player.mode = "walking"; dart().pose.position = { ...DART_BUILD_POSE };
    s.inventory.buoy.position = { ...WORKSHOP };
    for (const from of [dart().cargoId, "buoy_hold"]) {
      for (const i of [...s.inventory.items].filter((x) => x.containerId === from)) { assert.equal(transfer(s, i.id, "workshop_locker", i.quantity), null); counts.transfers++; }
    }
  }
  const delivered = { frames: s.inventory.items.filter((i) => i.kind === "tagged_frame" && i.containerId === "workshop_locker").reduce((n, i) => n + i.quantity, 0),
    alloy: s.inventory.items.filter((i) => i.kind === "structural_alloy" && i.containerId === "workshop_locker").reduce((n, i) => n + i.quantity, 0) };
  assert.ok(validState(s));
  return { kind, delivered, deliveredAlloyEquivalent: delivered.frames * FRAME_ALLOY + delivered.alloy, ...counts };
}

const strategies = [scenario("Dart first, then Creel", "dart-first"), scenario("Creel first, no Dart", "creel-first")];
const hauling = [haul("creel"), haul("dart")];
assert.ok(hauling[0].transfers < hauling[1].transfers, "the rack-fitted Creel needs fewer transfers for the same useful load");
assert.ok(hauling[0].delivered.frames >= hauling[1].delivered.frames);
const frameStock = Object.entries(SOURCES).filter(([, d]) => d.item === "tagged_frame").reduce((n, [, d]) => n + d.stock, 0);
const demand = (ids) => ids.reduce((n, id) => n + (RECIPES[id].cost.tagged_frame ?? 0), 0);
const result = { schema: SAVE_SCHEMA_VERSION, content: CONTENT_VERSION,
  scope: "Staged positions and real collection/lift/arm/craft/mount/transfer/salvage rules; zero renewal; no ordinary route or margin claim.",
  frames: { finite: frameStock, requiredB1: demand(["restore_canopy_stop", "creel_350"]), optionalB1: demand(["dart_350"]),
    leftForCarrier: frameStock - demand(["restore_canopy_stop", "creel_350", "dart_350"]) },
  strategies, hauling };
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
