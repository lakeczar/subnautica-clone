import test from "node:test";
import assert from "node:assert/strict";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { SOURCES as CURRENT_SOURCES } from "../src/content/registry.js";
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import { encoded, MemoryStorage, sample, settled, TestWriterLock } from "./persistence-support.js";
import { RECIPES } from "../src/content/registry.js";
import type { ItemKind } from "../src/content/registry.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening, craft, discover } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { createWorldQueries } from "../src/sim/world.js";
import { fixtureGame, updateBerth } from "../src/sim/carrier.js";
import { validState } from "../src/save/validation.js";
import { validExpedition2Domain, validState as validLegacyState } from "../src/save/legacy/validation.js";
import type { GameState as LegacyState } from "../src/save/legacy/types.js";
import { schema2Fixture, schema3Expected } from "./legacy-fixture-support.js";
import { ExpeditionSession } from "../src/runtime/session.js";
const foundation = () => ({
  format: "siltwake.save",
  schemaVersion: 1,
  contentVersion: "foundation.1",
  meta: {
    sessionId: "foundation-session",
    createdAt: "2026-10-17T12:00:00.000Z",
    savedAt: "2026-10-17T12:01:00.000Z",
  },
  state: {
    tick: 444,
    player: {
      pose: {
        frame: "world",
        position: { x: 0, y: 0.18, z: 14 },
        yaw: 0.25,
        pitch: -0.1,
      },
      velocity: { x: 0, y: 0, z: 0 },
      mode: "walking",
      vitals: { health: 83, oxygen: 90, food: 72 },
      refugeId: "home_pod",
      controlledVehicleId: null,
      interiorId: null,
    },
    inventory: { items: [], containers: [] },
    knowledge: {
      blueprints: [],
      scans: [],
      evidence: [],
      journals: [],
      markers: [],
    },
    world: { resources: [], facilities: [] },
    fleet: { vehicles: [], docking: null },
    recovery: { caches: [] },
  },
});
test("actual foundation schema1 migrates safe pose/vitals once with feedback and explicit current schema content version", () => {
  const old = foundation(),
    d = decodeSave(JSON.stringify(old));
  assert.equal(d.ok, true);
  if (!d.ok) return;
  assert.equal(d.value.schemaVersion, 4);
  assert.equal(d.value.contentVersion, "expedition.5");
  assert.deepEqual(d.value.state.player.pose, old.state.player.pose);
  assert.deepEqual(d.value.state.player.vitals, old.state.player.vitals);
  assert.equal(d.value.state.tick, 444);
  assert.equal(d.value.state.opening.phase, 4);
  assert.ok(d.value.state.migration);
  const expected = createGame(); completeOpening(expected);
  expected.tick = old.state.tick;
  expected.player.pose = { ...structuredClone(old.state.player.pose), frame: "world" };
  expected.player.velocity = { ...old.state.player.velocity };
  expected.player.mode = "walking";
  expected.player.vitals = { ...old.state.player.vitals };
  expected.metrics.minOxygen = old.state.player.vitals.oxygen;
  expected.migration = "Foundation progress imported. Your prior safe position and vitals were preserved; M1 facilities and source stock were initialized once.";
  expected.feedback = expected.migration;
  assert.deepEqual(d.value, createEnvelope(expected, old.meta), "full foundation conversion, including every initialized field");
  const e = encodeSave(d.value);
  assert.equal(e.ok, true);
  if (e.ok) {
    const again = decodeSave(e.value);
    assert.equal(again.ok, true);
    if (again.ok) assert.deepEqual(again.value, d.value);
  }
});
test("geometry-covered foundation pose relocates to actual refuge; malformed legacy/future data is never silently discarded", () => {
  const old = foundation();
  old.state.player.pose.position = { x: 0, y: 3.8, z: 21 };
  const d = decodeSave(JSON.stringify(old));
  assert.equal(d.ok, true);
  if (d.ok) assert.match(d.value.state.migration!, /moved/);
  if (d.ok) assert.doesNotMatch(d.value.state.migration!, /journal|backup/);
  for (const mutate of [
    (s: ReturnType<typeof foundation>) => {
      Reflect.set(s.state.knowledge.scans, 0, "invented");
    },
    (s: ReturnType<typeof foundation>) => {
      s.schemaVersion = 3;
    },
    (s: ReturnType<typeof foundation>) => {
      Reflect.set(s.state.player, "mode", ["walking"]);
    },
    (s: ReturnType<typeof foundation>) => {
      s.contentVersion = "foundation.2";
    },
  ]) {
    const f = foundation();
    mutate(f);
    assert.equal(decodeSave(JSON.stringify(f)).ok, false);
  }
});
test("journal migration reads without writing and preserves exact original generation on the first explicit save", async () => {
  const original = JSON.stringify(foundation()),
    storage = new MemoryStorage();
  storage.setItem(
    LOCAL_SAVE_KEY,
    JSON.stringify({
      format: "siltwake.local",
      version: 1,
      current: original,
      previous: null,
      preserved: null,
    }),
  );
  const raw = storage.getItem(LOCAL_SAVE_KEY);
  const repo = new SaveRepository(storage, new TestWriterLock());
  const loaded = repo.load();
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), raw);
  assert.ok(loaded.save);
  assert.equal((await repo.commit(loaded.save!)).ok, true);
  assert.equal(repo.backupText, original);
});

// Funded diagnostic only; actual earned old exports are checked separately in author artifacts.
function compatibleRuleFixture() {
  const s = createGame(); completeOpening(s); discover(s, "C02"); discover(s, "C03");
  for (const id of ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit", "restore_workshop", "dart_base"] as const) {
    const r = RECIPES[id];
    if (r.site === "island_workshop") s.player.pose.position = { x: 10, y: 1.2, z: -34 };
    for (const [k, n] of Object.entries(r.cost)) if (!r.maintenance)
      addItem(s, k as ItemKind, n, id === "restore_workshop" ? "diver" : r.site === "island_workshop" ? "workshop_locker" : "pod_locker");
    assert.equal(craft(s, id, createWorldQueries()), null);
  }
  discover(s, "C04");
  s.player.vitals = { health: 43, oxygen: 59, food: 61 };
  s.inventory.items.find((i) => i.kind === "reserve_cell")!.charge = 37.25;
  s.fleet.vehicles[0]!.charge = 0;
  return schema2Fixture(s, foundation().meta, "expedition.2");
}
const foundationOldNotice = "Foundation progress imported. Revised habitat geometry covered the old position, so you were moved to the valid home-pod deck. The original save remains in the journal backup.";
const carrierOldNotice = "Carrier compartment geometry now seals the dry berths. Your previous walking position intersected a closed compartment, so you were moved to a clear dry passage. Vessels and cargo were preserved; the original record remains in the journal backup after saving.";

test("validated expedition.2 migrates only declared schema3 additions, retaining crafted receipts, empty battery, charge, IDs, metadata and every prior gameplay field", () => {
  const old = compatibleRuleFixture(), current = schema3Expected(old);
  const source = JSON.stringify(old), decoded = decodeSave(source);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.error);
  assert.deepEqual(decoded.value, JSON.parse(JSON.stringify(current)));
  assert.equal(JSON.stringify(old), source);
  assert.equal(encodeSave(decoded.value).ok, true);
  assert.deepEqual(decodeSave(encoded(decoded.value)), decoded);
  // Exercise the public JavaScript boundary with an explicitly typed legacy envelope.
  assert.equal(Reflect.apply(encodeSave, undefined, [old]).ok, false, "writes require current schema/content explicitly");
});

test("old content tags cannot smuggle new items, module references/receipts or bypass prior strict relationships", () => {
  const current = schema3Expected(compatibleRuleFixture());
  for (const [k, n] of Object.entries(RECIPES.dart_acoustic_trim.cost)) addItem(current.state, k as ItemKind, n, "workshop_locker");
  assert.equal(craft(current.state, "dart_acoustic_trim", createWorldQueries()), null);
  assert.ok(validState(current.state));
  const oldTrim = schema2Fixture(current.state, current.meta);
  assert.ok(validLegacyState(oldTrim.state)); assert.equal(validExpedition2Domain(oldTrim.state), false);
  assert.ok(decodeSave(JSON.stringify(current)).ok, "the new domain is valid with its actual tag");
  assert.equal(decodeSave(JSON.stringify({ ...oldTrim, contentVersion: "expedition.2" })).ok, false);
  const item = current.state.inventory.items.find((i) => i.kind === "dart_acoustic_trim")!;
  item.containerId = current.state.fleet.vehicles[0]!.cargoId; current.state.fleet.vehicles[0]!.modules = [item.id];
  assert.ok(validState(current.state));
  const installedTrim = schema2Fixture(current.state, current.meta);
  assert.ok(decodeSave(JSON.stringify(installedTrim)).ok, "trim is legitimate schema2/expedition.3 content");
  assert.equal(decodeSave(JSON.stringify({ ...installedTrim, contentVersion: "expedition.2" })).ok, false);
  for (const mutate of [
    (s: LegacyState) => { s.knowledge.crafted.push("dart_acoustic_trim"); },
    (s: LegacyState) => { s.fleet.vehicles[0]!.modules = ["unknown_ref"]; },
    (s: LegacyState) => { s.inventory.items.find((i) => i.kind === "reserve_cell")!.charge = -1; },
    (s: LegacyState) => { s.knowledge.blueprints = []; },
    (s: LegacyState) => { Reflect.set(s.inventory.items[0]!, "kind", "unknown_old_item"); },
  ]) {
    const f = compatibleRuleFixture(); mutate(f.state);
    assert.equal(decodeSave(JSON.stringify({ ...f, contentVersion: "expedition.2" })).ok, false);
  }
  assert.equal(decodeSave(JSON.stringify({ ...compatibleRuleFixture(), contentVersion: "expedition.4" })).ok, false, "schema2 cannot borrow the current content tag");
  for (const contentVersion of ["expedition.5", "expedition.999", "foundation.1", "expedition.2x"])
    assert.equal(decodeSave(JSON.stringify({ ...compatibleRuleFixture(), contentVersion })).ok, false);
  // Start with a legitimate closed-domain fixture for each corruption. These
  // failures cannot be explained by an unrelated current resource roster.
  for (const version of ["expedition.2", "expedition.3"] as const) for (const mutate of [
    (s: LegacyState) => { Reflect.set(s.inventory.items.find(i => i.kind === "suit_150")!, "kind", "suit_350"); },
    (s: LegacyState) => { Reflect.set(s.knowledge.crafted, s.knowledge.crafted.length, "suit_350"); },
    (s: LegacyState) => { Reflect.set(s.world.resources, s.world.resources.length,
      { id: "basin_ridge_salvage_north", stock: CURRENT_SOURCES.basin_ridge_salvage_north.stock, reserve: CURRENT_SOURCES.basin_ridge_salvage_north.reserve }); },
    (s: LegacyState) => { Reflect.set(s.knowledge.evidence, s.knowledge.evidence.length, { id: "C05", tick: s.tick, provenance: "injected" }); },
    (s: LegacyState) => { s.player.pose.position.x = 248; },
    (s: LegacyState) => { s.player.pose.position.y = -240; },
  ]) {
    const f = compatibleRuleFixture(); f.contentVersion = version;
    assert.ok(validLegacyState(f.state)); assert.ok(validExpedition2Domain(f.state));
    assert.ok(decodeSave(JSON.stringify(f)).ok);
    mutate(f.state);
    assert.equal(decodeSave(JSON.stringify(f)).ok, false, version + ": current content cannot enter the frozen domain");
  }
});

test("only the two exact historical notices and equal feedback normalize; custom or unrelated text is preserved", () => {
  for (const [old, corrected] of [
    [foundationOldNotice, "Foundation progress imported. Revised habitat geometry covered the old position, so you were moved to the valid home-pod deck."],
    [carrierOldNotice, "Carrier compartment geometry now seals the dry berths. Your previous walking position intersected a closed compartment, so you were moved to a clear dry passage. Vessels and cargo were preserved."],
  ] as const) {
    // Both frozen notices have exactly one supported replacement.
    for (const contentVersion of ["expedition.2", "expedition.3"]) for (const feedback of [old, "Unrelated feedback, keep verbatim."]) {
      const s = compatibleRuleFixture(); s.state.migration = old; s.state.feedback = feedback;
      const decoded = decodeSave(JSON.stringify({ ...s, contentVersion })); assert.ok(decoded.ok);
      assert.doesNotMatch(decoded.value.state.migration!, /journal|backup/);
      assert.equal(decoded.value.state.migration, corrected);
      assert.equal(decoded.value.state.feedback, feedback === old ? decoded.value.state.migration : feedback);
      const expected = schema3Expected(s); expected.state.migration = corrected;
      expected.state.feedback = feedback === old ? corrected : feedback;
      assert.deepEqual(decoded.value, expected);
    }
    const near = compatibleRuleFixture(); near.state.migration = old + " Custom note."; near.state.feedback = near.state.migration;
    assert.deepEqual(decodeSave(JSON.stringify(near)), { ok: true, value: schema3Expected(near) });
  }
});

function relocatedCarrierSource(): string {
  // Same semantically valid historical-pose diagnostic as carrier-migration.test.ts's maxX case.
  const s = fixtureGame(), h = s.fleet.vehicles[0]!;
  h.pose.position = { x: 188, y: -24, z: 0 }; h.pose.yaw = Math.PI / 2;
  s.player.interiorPose!.position = { x: -3, y: 4, z: 4.5 };
  s.player.pose.yaw = h.pose.yaw; updateBerth(s, createWorldQueries());
  return JSON.stringify(schema2Fixture(s, foundation().meta, "expedition.2"));
}
test("import over another expedition then reopen/Continue keeps pre-import previous, immutable file and truthful new/persisted migration notices", async () => {
  const covered = foundation(); covered.state.player.pose.position = { x: 0, y: 3.8, z: 21 };
  const migrated = decodeSave(JSON.stringify(covered)); assert.ok(migrated.ok);
  const persisted = [foundationOldNotice, carrierOldNotice].map((notice) => {
    const save = structuredClone(migrated.value); save.state.migration = notice; save.state.feedback = notice;
    return JSON.stringify(schema2Fixture(save.state, save.meta, "expedition.2"));
  });
  for (const source of [JSON.stringify(covered), relocatedCarrierSource(), ...persisted]) {
    const expected = decodeSave(source); assert.ok(expected.ok);
    const current = encoded(sample(999)), previous = encoded(sample(777)), preserved = "preexisting preserved bytes";
    const storage = new MemoryStorage();
    storage.data.set(LOCAL_SAVE_KEY, JSON.stringify({ format: "siltwake.local", version: 1, current, previous, preserved }));
    const repo = new SaveRepository(storage, new TestWriterLock()), notices: string[] = [];
    const session = new ExpeditionSession(repo, { changed() {}, pause() {}, entered() {}, notify(message) { notices.push(message); } });
    const file = Object.freeze({ size: new TextEncoder().encode(source).byteLength, async text() { return source; } });
    try {
      session.continueGame(); await session.importFile(file); assert.ok(session.confirmation);
      session.confirm(); await settled();
      assert.equal(repo.backupText, current); assert.deepEqual(session.state, expected.value.state);
      const raw = storage.getItem(LOCAL_SAVE_KEY)!;
      assert.equal(JSON.parse(raw).previous, current); assert.equal(JSON.parse(raw).preserved, preserved);
      assert.equal(await file.text(), source); session.dispose();
      const againRepo = new SaveRepository(storage, new TestWriterLock());
      const again = new ExpeditionSession(againRepo, { changed() {}, pause() {}, entered() {}, notify(message) { notices.push(message); } });
      try {
        again.continueGame(); assert.deepEqual(again.state, expected.value.state);
        assert.equal(againRepo.backupText, current); assert.equal(storage.getItem(LOCAL_SAVE_KEY), raw, "Continue never writes");
        assert.equal(encodeSave(again.envelope()!).ok, true);
        assert.ok(notices.includes(again.state!.migration!)); assert.doesNotMatch(again.state!.migration!, /journal|backup/);
        assert.equal(await file.text(), source);
      } finally { again.dispose(); }
    } finally { session.dispose(); }
  }
});
