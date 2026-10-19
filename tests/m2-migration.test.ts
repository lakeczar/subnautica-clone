import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createEnvelope, decodeSave, encodeSave, MAX_SAVE_BYTES } from "../src/save/codec.js";
import { SOURCES as OLD_SOURCES } from "../src/save/legacy/registry.js";
import { validState as validOld, validExpedition2Domain } from "../src/save/legacy/validation.js";
import type { GameState as LegacyState } from "../src/save/legacy/types.js";
import { BASIN_SOURCE_IDS } from "../src/content/routes.js";
import { PLACES, RECIPES, SOURCES } from "../src/content/registry.js";
import type { MaterialId, RecipeId } from "../src/content/registry.js";
import { createGame } from "../src/sim/state.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening, craft, discover } from "../src/sim/progression.js";
import { disableVehicle } from "../src/sim/recovery.js";
import { installModule } from "../src/sim/modules.js";
import { BERTH_LOCAL, CARRIER_LAYOUT, carrierCommand, fixtureGame, localToWorld, updateBerth } from "../src/sim/carrier.js";
import { createWorldQueries } from "../src/sim/world.js";
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import { MemoryStorage, TestWriterLock } from "./persistence-support.js";
import type { GameState } from "../src/sim/types.js";
const meta = { sessionId: "m2-migration-test", createdAt: "2026-10-17T00:00:00.000Z", savedAt: "2026-10-18T00:00:00.000Z" }, world = createWorldQueries();
function legacy(s: GameState): LegacyState {
  const old = JSON.parse(JSON.stringify(s)) as LegacyState;
  old.world.resources = old.world.resources.filter(r => Object.hasOwn(OLD_SOURCES, r.id));
  if (old.recovery.operation) delete (old.recovery.operation as unknown as Record<string, unknown>).routeId;
  assert.ok(validOld(old)); return old;
}
function envelope(s: LegacyState, contentVersion = "expedition.3") {
  return { format: "siltwake.save", schemaVersion: 2, contentVersion, meta, state: s };
}
function verify(raw: string): ReturnType<typeof createEnvelope> {
  const original = JSON.parse(raw) as ReturnType<typeof envelope>, out = decodeSave(raw); assert.ok(out.ok, out.ok ? "" : out.error);
  assert.equal(out.value.schemaVersion, 3); assert.equal(out.value.contentVersion, "expedition.4");
  const expected = structuredClone(original.state) as unknown as GameState;
  expected.world.resources.push(...BASIN_SOURCE_IDS.map(id => ({ id, stock: SOURCES[id].stock, reserve: SOURCES[id].reserve })));
  if (expected.recovery.operation) expected.recovery.operation.routeId = "canopy";
  assert.deepEqual(out.value.state, expected, "EVERY pre-existing state field remains identical");
  assert.deepEqual(out.value.meta, original.meta);
  const encoded = encodeSave(out.value); assert.ok(encoded.ok); assert.ok(Buffer.byteLength(encoded.value) < MAX_SAVE_BYTES);
  const again = decodeSave(encoded.value); assert.ok(again.ok); assert.deepEqual(again.value, out.value);
  assert.equal(JSON.stringify(JSON.parse(raw)), JSON.stringify(original)); return out.value;
}
// Paid seeded fixture, not a retained earned export. The real archived import is below.
function invested(trim = false): GameState {
  const s = createGame(); completeOpening(s); for (const id of ["C02", "C03", "C04"] as const) discover(s, id);
  for (const id of ["pod_repair", "essential_tools", "suit_150", "bobbin_kit", "restore_workshop", "dart_base", ...(trim ? ["dart_acoustic_trim"] : [])] as RecipeId[]) {
    const r = RECIPES[id]; s.player.pose.position = { ...PLACES[r.site === "island_workshop" ? "island_workshop" : "home_pod"].position };
    if (!r.maintenance) for (const [k, q] of Object.entries(r.cost)) addItem(s, k as MaterialId, q, "diver");
    assert.equal(craft(s, id, world), null);
  }
  if (trim) assert.equal(installModule(s, s.fleet.vehicles[0]!.id, s.inventory.items.find(i => i.kind === "dart_acoustic_trim")!.id), null);
  return s;
}

test("real retained expedition.3 trap export migrates with exact investment, stock, module, pose and feedback identity", () => {
  const path = "tests/fixtures/reef-rib-trap-expedition3.json", raw = readFileSync(path, "utf8"), hash = createHash("sha256").update(raw).digest("hex");
  verify(raw); assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), hash);
});

test("validated expedition.2 and .3 retain depletion, trim, fitted IDs, bound repair investment and all active old waypoint meanings", () => {
  for (const content of ["expedition.2", "expedition.3"]) {
    const s = invested(content === "expedition.3"), v = s.fleet.vehicles[0]!;
    s.world.resources[0]!.stock = 0; s.world.resources[0]!.reserve = 3;
    v.pose.position = { x: 140, y: -139, z: -142 }; v.boundRepairs = 2;
    s.world.maintenance.alloy -= 4; s.world.maintenance.membrane -= 2; disableVehicle(s, v.id);
    for (const phase of ["approach", "ready", "tow"] as const) for (let waypoint = 0; waypoint <= 3; waypoint++) {
      const old = legacy(s); old.recovery.operation = { vehicleId: v.id, method: "tow", phase, waypoint,
        position: { ...v.pose.position, y: v.pose.position.y + 1 } };
      assert.ok(validOld(old)); if (content === "expedition.2") assert.ok(validExpedition2Domain(old));
      verify(JSON.stringify(envelope(old, content)));
    }
  }
});

test("closed legacy validation rejects cross-version content and field injection before initializing new stock", () => {
  const clean = envelope(legacy(invested()));
  for (const mutate of [
    (d: typeof clean) => { (d.state.world.resources as unknown[]).push({ id: BASIN_SOURCE_IDS[0], stock: 0, reserve: 0 }); },
    (d: typeof clean) => { d.state.player.pose.position.x = 200; },
    (d: typeof clean) => { d.state.player.pose.position.y = -201; },
    (d: typeof clean) => { (d.state.knowledge.evidence as unknown[]).push({ id: "C05", tick: 0, provenance: "invented" }); },
    (d: typeof clean) => { (d.state.knowledge.blueprints as string[]).push("bp_rift_pressure"); },
    (d: typeof clean) => { (d.state.knowledge.crafted as string[]).push("suit_350"); },
    (d: typeof clean) => { d.state.inventory.items[0]!.kind = "suit_350" as never; },
    (d: typeof clean) => { (d.state as unknown as Record<string, unknown>).activeRegion = "silt_basin"; },
    (d: typeof clean) => { d.state.inventory.containers[0]!.capacity++; },
  ]) { const bad = structuredClone(clean); mutate(bad); assert.equal(decodeSave(JSON.stringify(bad)).ok, false); }
  const current = createEnvelope(createGame(), meta);
  for (const schemaVersion of [1, 2, 4, 99]) assert.equal(decodeSave(JSON.stringify({ ...current, schemaVersion })).ok, false);
  for (const contentVersion of ["expedition.2", "expedition.3", "expedition.5", "foundation.1"]) assert.equal(decodeSave(JSON.stringify({ ...current, contentVersion })).ok, false);
  assert.equal(decodeSave(JSON.stringify({ ...clean, contentVersion: "expedition.4" })).ok, false);
  const trimmed = envelope(legacy(invested(true)), "expedition.2"); assert.equal(decodeSave(JSON.stringify(trimmed)).ok, false);
  const old = legacy(invested()), v = old.fleet.vehicles[0]!; v.health = 0; v.disabled = true;
  old.recovery.losses.push({ vehicleId: v.id, position: { ...v.pose.position }, visited: true });
  old.recovery.operation = { vehicleId: v.id, method: "tow", phase: "ready", waypoint: 3, position: { ...v.pose.position } };
  Object.assign(old.recovery.operation, { routeId: "canopy" }); assert.equal(decodeSave(JSON.stringify(envelope(old))).ok, false);
});

test("all compact/medium carrier prepared/lock transactions retain identity and the decoder never writes the journal", () => {
  for (const configuration of ["compact", "medium"] as const) for (const phase of ["prepared", "lock"] as const) {
    const s = fixtureGame(), h = s.fleet.vehicles[0]!;
    if (configuration === "medium") {
      for (const [i, v] of s.fleet.vehicles.entries()) if (v.berth) { v.berth = null; v.pose.position = { x: 100 + i * 10, y: -1, z: -60 }; }
      s.fleet.docking!.configuration = "medium";
      s.fleet.vehicles[3]!.berth = { carrierId: h.id, slot: 0, pose: { frame: "carrier-local", position: { ...BERTH_LOCAL[0]! }, yaw: 0 } };
      updateBerth(s, world);
    }
    assert.equal(carrierCommand(s, "launch", configuration === "compact" ? "fixture_dart" : "fixture_creel", world), null);
    s.fleet.docking!.transaction!.phase = phase; s.fleet.docking!.transaction!.ticks = phase === "lock" ? 10 : 0;
    const raw = JSON.stringify(envelope(legacy(s))), storage = new MemoryStorage();
    storage.data.set(LOCAL_SAVE_KEY, JSON.stringify({ format: "siltwake.local", version: 1, current: raw, previous: null, preserved: null }));
    const bytes = storage.getItem(LOCAL_SAVE_KEY), writes = storage.writes, repo = new SaveRepository(storage, new TestWriterLock());
    assert.ok(repo.load().save); assert.equal(storage.writes, writes); assert.equal(storage.getItem(LOCAL_SAVE_KEY), bytes);
    const migrated = verify(raw); assert.deepEqual(repo.status.save, migrated); assert.equal(migrated.state.scenario, "carrier-fixture");
    migrated.state.scenario = "expedition"; assert.equal(encodeSave(migrated).ok, false, "fixture cannot launder into campaign ownership");
  }
});

test("historical covered carrier poses still use the old bounded checked landing and refuse when none exists", () => {
  const s = fixtureGame(), h = s.fleet.vehicles[0]!;
  assert.equal(carrierCommand(s, "launch", "fixture_dart", world), null);
  s.player.interiorPose!.position = { x: -3, y: 4, z: -3.1 }; s.player.pose.position = localToWorld(s.player.interiorPose!.position, h);
  const old = legacy(s), out = decodeSave(JSON.stringify(envelope(old))); assert.ok(out.ok);
  assert.deepEqual(out.value.state.player.interiorPose!.position, CARRIER_LAYOUT.helm);
  assert.deepEqual(out.value.state.fleet, s.fleet); assert.deepEqual(out.value.state.inventory, s.inventory);
  assert.match(out.value.state.migration!, /previous walking position.*clear dry passage/);
  const paid = encodeSave(out.value); assert.ok(paid.ok); assert.deepEqual(decodeSave(paid.value), { ok: true, value: out.value });
  const unrelocated = createEnvelope(s, meta); assert.equal(encodeSave(unrelocated).ok, false, "new current states cannot borrow a historical relocation");
  // Accepted historical no-landing case: enlarged M2 bounds must not manufacture
  // a landing that the old bounded transaction refused.
  const blocked = fixtureGame(), carrier = blocked.fleet.vehicles[0]!;
  for (const [i, v] of blocked.fleet.vehicles.entries()) if (v.berth) {
    v.berth = null; v.pose.position = { x: 100 + i * 10, y: -1, z: -60 };
  }
  blocked.fleet.docking!.configuration = "medium";
  blocked.fleet.vehicles[3]!.berth = { carrierId: carrier.id, slot: 0,
    pose: { frame: "carrier-local", position: { ...BERTH_LOCAL[0]! }, yaw: 0 } };
  carrier.pose.position = { x: 188, y: -24, z: 66 }; carrier.pose.yaw = 50 * Math.PI / 180;
  blocked.player.interiorPose!.position = { x: -4.7, y: 4, z: 4.5 };
  blocked.player.pose.yaw = carrier.pose.yaw; updateBerth(blocked, world);
  const raw = JSON.stringify(envelope(legacy(blocked))), refused = decodeSave(raw);
  assert.equal(refused.ok, false); if (!refused.ok) assert.match(refused.error, /migration.*clear dry passage/);
  assert.equal(JSON.stringify(JSON.parse(raw)), raw, "input bytes and state are untouched");
});

test("foundation closed-domain migration preserves real fields and initializes the new slice only once", () => {
  const old = { format: "siltwake.save", schemaVersion: 1, contentVersion: "foundation.1", meta,
    state: { tick: 444, player: { pose: { frame: "world", position: { x: 0, y: .18, z: 14 }, yaw: .25, pitch: -.1 },
      velocity: { x: 0, y: 0, z: 0 }, mode: "walking", vitals: { health: 83, oxygen: 90, food: 72 }, refugeId: "home_pod", controlledVehicleId: null, interiorId: null },
    inventory: { items: [], containers: [] }, knowledge: { blueprints: [], scans: [], evidence: [], journals: [], markers: [] },
    world: { resources: [], facilities: [] }, fleet: { vehicles: [], docking: null }, recovery: { caches: [] } } };
  const out = decodeSave(JSON.stringify(old)); assert.ok(out.ok);
  assert.deepEqual(out.value.state.player.pose, old.state.player.pose); assert.deepEqual(out.value.state.player.vitals, old.state.player.vitals);
  assert.equal(out.value.state.tick, old.state.tick); assert.equal(out.value.state.world.resources.length, Object.keys(SOURCES).length);
  const text = encodeSave(out.value); assert.ok(text.ok); assert.deepEqual(decodeSave(text.value), out);
  const injected = structuredClone(old); Object.assign(injected.state.knowledge, { blueprints: ["bp_rift_pressure"] });
  assert.equal(decodeSave(JSON.stringify(injected)).ok, false);
});
