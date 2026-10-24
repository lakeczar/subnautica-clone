import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SOURCES } from "../src/content/registry.js";
import { createEnvelope, decodeSave, encodeSave, type SaveEnvelope } from "../src/save/codec.js";
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import { validState } from "../src/save/validation.js";
import { ExpeditionSession } from "../src/runtime/session.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { executeCommand } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameState } from "../src/sim/types.js";
import { encoded, MemoryStorage, sample, settled, TestWriterLock } from "./persistence-support.js";
import { creelFirst } from "./b1-support.js";
import { craftingBlock, readTechRecord } from "../src/sim/progression.js";
import { installModule } from "../src/sim/systems/hosts.js";
import { plant } from "../src/sim/systems/cultivation.js";
import { legacyRow, legacySourceHeld } from "../src/save/legacyGrants.js";

// Save policy (DIRECTION): schema 8 loads; schema 7 / expedition.7 is the one bridged
// predecessor (LS-1 1b); schemas 1–6 are refused as older development builds.
const world = createWorldQueries();
const meta = { sessionId: "save-bridge-test-01", createdAt: "2026-10-18T00:00:00.000Z", savedAt: "2026-10-19T00:00:00.000Z" };
const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Depleted, investigated progress with accumulated living-shed progress. */
function progressed(): GameState {
  const s = createGame(); completeOpening(s);
  for (const id of ["C02", "C03", "C04"] as const) discover(s, id);
  s.tick = 48_000;
  const set = (id: keyof typeof SOURCES, stock: number, reserve: number) =>
    Object.assign(s.world.resources.find((n) => n.id === id)!, { stock, reserve });
  set("reef_ribbon_catch_north", 0, 6); set("canopy_resin_lee_lower", 0, 0); set("reef_service_scraps_east", 0, 0);
  s.world.renewal.find((r) => r.id === "reef_ribbon_catch_north")!.progress = 777;
  addItem(s, "flex_membrane", 6, "pod_locker"); addItem(s, "buoyant_resin", 4, "diver");
  s.player.vitals = { health: 61, oxygen: 72.5, food: 44 };
  s.metrics.collections = 19;
  return s;
}
const older = (schemaVersion: number, contentVersion: string) =>
  JSON.stringify({ ...createEnvelope(createGame(), meta), schemaVersion, contentVersion });

/** A real schema 7 export: today's state without the schema 8 fields, under the
 * schema 7 / expedition.7 tags (what the previous build wrote). */
function schema7(state: GameState): string {
  const s = structuredClone(state) as unknown as Record<string, any>;
  delete s.systems.opened;
  delete s.knowledge.legacyGrants;
  return JSON.stringify({ ...createEnvelope(state, meta), schemaVersion: 7, contentVersion: "expedition.7", state: s });
}
/** A schema 7 player who read the workshop's outpost sheet while it still granted the
 * planter plan, optionally with a planter socketed at the pod and a crop growing. */
function earnedPlanter(withCrop: boolean): GameState {
  const s = creelFirst();
  readTechRecord(s, "workshop_outpost_sheet");
  if (!s.knowledge.blueprints.includes("bp_cultivation" as never)) s.knowledge.blueprints.push("bp_cultivation" as never);
  if (withCrop) {
    s.player.pose.position = { x: 0, y: 0.18, z: 21.2 }; s.player.mode = "swimming";
    const planter = addItem(s, "mod_planter", 1, "diver").id;
    assert.equal(installModule(s, s.systems, "home_pod", "s0", planter), null);
    addItem(s, "seed_staple_cup", 1, "diver");
    assert.equal(plant(s, s.systems, "home_pod", "s0", "seed_staple_cup"), null);
    s.systems.planters[0]!.progress = 120;
  }
  return s;
}

test("a schema 7 save bridges once: no doors opened, and no legacy grant it did not earn", () => {
  const s = creelFirst();
  const out = decodeSave(schema7(s));
  assert.ok(out.ok, out.ok ? "" : out.error);
  const b = out.value.state;
  assert.deepEqual(b.systems.opened, []);
  assert.deepEqual(b.knowledge.legacyGrants, []);
  assert.deepEqual(Object.keys(b.systems), Object.keys(s.systems), "in New Game's key order");
  assert.deepEqual(Object.keys(b.knowledge), Object.keys(s.knowledge));
  assert.equal(out.value.schemaVersion, 8);
  assert.deepEqual(b, s, "nothing else changes");
  const written = encoded(out.value), again = decodeSave(written);
  assert.ok(again.ok); assert.deepEqual(again.value, out.value);
});

test("a schema 7 save holding any schema 8 field, or mixed tags, is refused before bridging", () => {
  const base = JSON.parse(schema7(creelFirst()));
  const withDoors = structuredClone(base); withDoors.state.systems.opened = [];
  const withGrants = structuredClone(base); withGrants.state.knowledge.legacyGrants = [];
  for (const [raw, pattern] of [[withDoors, /only schema 8 writes/], [withGrants, /only schema 8 writes/],
    [{ ...base, contentVersion: "expedition.6" }, /another content version/]] as const) {
    const out = decodeSave(JSON.stringify(raw));
    assert.equal(out.ok, false); if (!out.ok) assert.match(out.error, pattern);
  }
});

test("earned planter knowledge survives the plan's move: post-workshop with a planter and crop, and without a planter", () => {
  for (const withCrop of [true, false]) {
    const s = earnedPlanter(withCrop);
    const out = decodeSave(schema7(s));
    assert.ok(out.ok, out.ok ? "" : out.error);
    const b = out.value.state;
    assert.deepEqual(b.knowledge.legacyGrants, [{ blueprint: "bp_cultivation", source: { kind: "scan", id: "workshop_outpost_sheet" } }]);
    assert.ok(b.knowledge.blueprints.includes("bp_cultivation" as never), "the plan is kept");
    assert.ok(validState(b));
    assert.notEqual(craftingBlock(b, "mod_planter", world)?.code, "blueprint", "another planter can still be built");
    if (withCrop) assert.deepEqual(b.systems.planters, s.systems.planters, "the growing crop is kept");
  }
});

test("a fresh schema 8 game gets the planter plan only from the keeper's racks; an unheld legacy source is refused", () => {
  const s = creelFirst();
  readTechRecord(s, "workshop_outpost_sheet");
  assert.ok(!s.knowledge.blueprints.includes("bp_cultivation" as never), "the workshop sheet no longer grants it");
  readTechRecord(s, "hub_racks_card");
  assert.ok(s.knowledge.blueprints.includes("bp_cultivation" as never), "the racks' card does");
  assert.deepEqual(s.knowledge.legacyGrants, []);
  assert.ok(validState(s));
  const forged = structuredClone(creelFirst());
  forged.knowledge.blueprints.push("bp_cultivation" as never);
  forged.knowledge.legacyGrants = [{ blueprint: "bp_cultivation" as never, source: { kind: "scan", id: "workshop_outpost_sheet" } }];
  assert.equal(validState(forged), false, "a legacy entry whose scan was never read is refused");
  readTechRecord(forged, "workshop_outpost_sheet");
  assert.ok(validState(forged), "with its source held it is accepted");
  const notARow = structuredClone(forged);
  notARow.knowledge.legacyGrants = [{ blueprint: "bp_cultivation" as never, source: { kind: "scan", id: "canopy_lab_outpost_sheet" } }];
  assert.equal(validState(notARow), false, "only LEGACY_GRANTS rows are legal");
  // The discovery source kind (PACE-1's row, until it lands, through a stand-in row).
  const row = { blueprint: "bp_pod_buffer" as never, source: { kind: "discovery" as const, id: "C07" }, reason: "stand-in" };
  assert.ok(legacyRow(row, [row]));
  assert.equal(legacySourceHeld(row, ["C07"], []), false, "a discovery is not a scan");
  assert.equal(legacySourceHeld(row, [], ["C07"]), true);
  assert.equal(legacySourceHeld(row, [], []), false);
});

test("the legacy grant is permanent: 7 → 8, saved again without the racks, then the next transition still keeps plan and crop", () => {
  const first = decodeSave(schema7(earnedPlanter(true)));
  assert.ok(first.ok, first.ok ? "" : first.error);
  // Saved again as schema 8, never having visited the racks.
  const resaved = decodeSave(encoded(first.value));
  assert.ok(resaved.ok, resaved.ok ? "" : resaved.error);
  assert.ok(!resaved.value.state.knowledge.scans.includes("hub_racks_card"));
  // A stand-in for the next bridge (8 → 9): it carries the field and the table unchanged.
  const next = structuredClone(resaved.value.state);
  assert.ok(validState(next));
  assert.deepEqual(next.knowledge.legacyGrants, first.value.state.knowledge.legacyGrants);
  assert.ok(next.knowledge.blueprints.includes("bp_cultivation" as never));
  assert.deepEqual(next.systems.planters, first.value.state.systems.planters);
});

test("Continue from a stored schema 7 journal reads without writing; the first save keeps the original as previous", async () => {
  const original = schema7(progressed()), storage = new MemoryStorage();
  storage.setItem(LOCAL_SAVE_KEY, JSON.stringify({ format: "siltwake.local", version: 1, current: original, previous: null, preserved: null }));
  const raw = storage.getItem(LOCAL_SAVE_KEY), writes = storage.writes;
  const repo = new SaveRepository(storage, new TestWriterLock());
  const loaded = repo.load();
  assert.ok(loaded.save);
  assert.equal(storage.writes, writes, "reading never writes");
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), raw);
  assert.ok((await repo.commit(loaded.save)).ok);
  const journal = JSON.parse(storage.getItem(LOCAL_SAVE_KEY)!);
  assert.equal(journal.previous, original, "the original schema 7 generation remains byte-identical");
  assert.equal(JSON.parse(journal.current).schemaVersion, 8);
});

test("schemas 1–6 are refused as older development builds, including the archived real exports", () => {
  const sources = [
    older(1, "foundation.1"), older(2, "expedition.2"), older(2, "expedition.3"), older(3, "expedition.4"), older(5, "expedition.6"), older(6, "expedition.7"),
    readFileSync("tests/fixtures/archive/reef-rib-trap-expedition3.json", "utf8"),
    readFileSync("tests/fixtures/archive/earned-c06-expedition4.json", "utf8"),
    readFileSync("tests/fixtures/archive/diagnostic-depleted-expedition5.schema4.json", "utf8"),
    readFileSync("tests/fixtures/archive/earned-c06.schema5.json", "utf8"),
    readFileSync("tests/fixtures/archive/reef-rib-trap.schema5.json", "utf8"),
    readFileSync("tests/fixtures/archive/earned-c06.schema6.json", "utf8"),
  ];
  for (const raw of sources) {
    const out = decodeSave(raw);
    assert.equal(out.ok, false);
    if (!out.ok) assert.match(out.error, /older development build.*schema [123456]\).*Keep the original file/);
  }
  for (const schemaVersion of [0, 9, 99]) {
    const out = decodeSave(older(schemaVersion, "expedition.7"));
    assert.equal(out.ok, false); if (!out.ok) assert.match(out.error, /unsupported/);
  }
});

test("an older-build local slot is protected or recovered from its valid previous generation, never overwritten silently", async () => {
  const raw = older(3, "expedition.4");
  for (const previous of [null, encoded(sample(123))]) {
    const journal = JSON.stringify({ format: "siltwake.local", version: 1, current: raw, previous, preserved: "retained" });
    const storage = new MemoryStorage(), lock = new TestWriterLock();
    storage.data.set(LOCAL_SAVE_KEY, journal);
    const repo = new SaveRepository(storage, lock);
    const session = new ExpeditionSession(repo, { changed() {}, pause() {}, entered() {}, notify() {} });
    try {
      assert.equal(repo.status.kind, previous === null ? "protected" : "recovered");
      assert.match(repo.status.message, /older development build/);
      session.continueGame();
      assert.equal(session.state?.tick ?? null, previous === null ? null : 123);
      assert.equal(session.autoSaveAllowed, false);
      session.autosave();
      const commit = await repo.commit(sample(5));
      assert.equal(commit.ok, false);
      if (!commit.ok) assert.equal(commit.code, "protected", "replacing needs the explicit repair action");
      assert.equal(storage.writes, 0);
      assert.equal(storage.getItem(LOCAL_SAVE_KEY), journal);
    } finally { session.dispose(); }
  }
});

test("a refused older-build Import preserves the active session, journal and source file", async () => {
  const source = older(2, "expedition.3"), file = Object.freeze({ size: new TextEncoder().encode(source).byteLength, async text() { return source; } });
  const current = encoded(sample(90)), previous = encoded(sample(40));
  const raw = JSON.stringify({ format: "siltwake.local", version: 1, current, previous, preserved: null });
  const storage = new MemoryStorage(), lock = new TestWriterLock();
  storage.data.set(LOCAL_SAVE_KEY, raw);
  const repo = new SaveRepository(storage, lock), notices: { message: string; error?: boolean }[] = [];
  const session = new ExpeditionSession(repo, { changed() {}, pause() {}, entered() {},
    notify(message, error) { notices.push({ message, ...(error === undefined ? {} : { error }) }); } });
  try {
    session.continueGame();
    const active = session.state, snapshot = structuredClone(active), slot = structuredClone(repo.status);
    await session.importFile(file);
    assert.equal(session.confirmation, null, "a refused file never reaches confirmation");
    session.confirm(); await settled();
    assert.equal(session.state, active); assert.deepEqual(session.state, snapshot);
    assert.equal(session.autoSaveAllowed, true);
    assert.deepEqual(repo.status, slot);
    assert.equal(storage.getItem(LOCAL_SAVE_KEY), raw);
    assert.equal(storage.writes, 0); assert.equal(lock.requests, 0);
    assert.equal(await file.text(), source);
    assert.ok(notices.some((n) => n.error && /older development build/.test(n.message)));
  } finally { session.dispose(); }
});

test("named fixtures were converted once to schema 8; the archived originals are evidence, never rewritten", () => {
  for (const [name, archived] of [["earned-c06.json", "earned-c06.schema7.json"], ["reef-rib-trap.json", "reef-rib-trap.schema7.json"],
    ["diagnostic-depleted.json", "diagnostic-depleted.schema7.json"]] as const) {
    const raw = fixture(name), out = decodeSave(raw);
    assert.ok(out.ok, out.ok ? "" : out.error);
    assert.equal(JSON.parse(raw).schemaVersion, 8);
    const written = encoded(out.value);
    assert.equal(JSON.stringify(JSON.parse(written)), JSON.stringify(JSON.parse(raw)), `${name} is already canonical`);
    // The archived schema 7 original still bridges to exactly this save.
    const bridged = decodeSave(readFileSync(`tests/fixtures/archive/${archived}`, "utf8"));
    assert.ok(bridged.ok, bridged.ok ? "" : bridged.error); assert.deepEqual(bridged.value, out.value);
  }
  assert.equal(sha(readFileSync("tests/fixtures/archive/earned-c06.schema5.json", "utf8")), "7729a4a2132890d207647120d650126eaf7f6e0806b44988c4a887c686f4286f");
  assert.equal(sha(readFileSync("tests/fixtures/archive/reef-rib-trap.schema5.json", "utf8")), "eee910ad3ebcf775b77ad068e986c68818211059d4c35b784ae3e174cf9891bf");
  assert.equal(sha(readFileSync("tests/fixtures/archive/earned-c06-expedition4.json", "utf8")), "45840e6659e9aed6a98d0c0eed67761f5af8dfaab8d9c32ea051f48d652b4e44");
  // The earned game is directly playable: its Notebook and fabricator list the C05 workboat.
  const earned = decodeSave(fixture("earned-c06.json")); assert.ok(earned.ok);
  assert.ok(earned.value.state.knowledge.markers.includes("canopy_stop"), "a found C04 names the mooring");
  assert.ok(earned.value.state.knowledge.blueprints.includes("bp_creel_service"));
  assert.ok(validState(executeCommand(earned.value.state, { type: "hint" }, world).state));
});

test("evidence provenance is a recorded fact, not bound to current registry prose", () => {
  const s = progressed(), envelope: SaveEnvelope = createEnvelope(s, meta);
  envelope.state.knowledge.evidence[0]!.provenance = "Text shown by an earlier wording of the field sheet";
  assert.ok(decodeSave(encoded(envelope)).ok, "editing registry wording cannot invalidate a save");
  envelope.state.knowledge.evidence[0]!.provenance = "x".repeat(201);
  assert.equal(encodeSave(envelope).ok, false, "still bounded");
});
