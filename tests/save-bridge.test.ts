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
import { creelFirst, creelOf, fund } from "./b1-support.js";
import { createSystems } from "../src/sim/systems/state.js";
import { initialRuntime } from "../src/sim/upgrades/tools.js";
import { vehicleProfile } from "../src/sim/fittings.js";

// Save policy (DIRECTION): schema 6 loads; schema 5 / expedition.6 is the one bridged
// predecessor (C4); schemas 1–4 are refused as older development builds.
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

/** A real schema 5 export: today's state without the schema 6 fields, under the
 * schema 5 / expedition.6 tags (what the previous build wrote). */
function schema5(state: GameState): string {
  const s = structuredClone(state) as unknown as Record<string, any>;
  delete s.systems;
  delete s.world.flares;
  delete s.knowledge.cycles;
  for (const v of s.fleet.vehicles) { delete v.upgrades; delete v.bioFeed; }
  return JSON.stringify({ ...createEnvelope(state, meta), schemaVersion: 5, contentVersion: "expedition.6", state: s });
}

test("a schema 5 save bridges once: New Game's systems slice, carried trim vanes fitted, reduced stock clamped", () => {
  // A Creel carrying resin trim vanes in its hold: under schema 5 they protected it.
  const s = creelFirst();
  fund(s, "trim_vanes");
  const v = creelOf(s), vanes = s.inventory.items.find((i) => i.kind === "trim_vanes")!;
  vanes.containerId = v.cargoId;
  // A core shoulder still holding schema 5's stock (now a scan-only site).
  Object.assign(s.world.resources.find((r) => r.id === "rift_core_shoulder_north")!, { stock: 8, reserve: 6 });
  const out = decodeSave(schema5(s));
  assert.ok(out.ok, out.ok ? "" : out.error);
  const b = out.value.state, creel = b.fleet.vehicles.find((x) => x.id === v.id)!;
  assert.deepEqual(b.systems, createSystems());
  assert.deepEqual(b.world.flares, []);
  assert.deepEqual(creel.upgrades, initialRuntime());
  assert.equal(creel.bioFeed, null);
  assert.deepEqual(creel.modules, [vanes.id], "the carried vanes now sit in a socket");
  assert.equal(b.inventory.items.find((i) => i.id === vanes.id)!.fitted, null, "a socket module stays a hold item");
  assert.ok(Math.abs(vehicleProfile(b, creel).current - (vehicleProfile(b, { ...creel, modules: [] }).current + 0.25)) < 1e-9, "and it protects as before");
  assert.deepEqual(b.world.resources.find((r) => r.id === "rift_core_shoulder_north"), { id: "rift_core_shoulder_north", stock: 0, reserve: 0 });
  assert.equal(out.value.schemaVersion, 6);
  // Written once, it is a canonical schema 6 save that reads back unchanged.
  const written = encoded(out.value), again = decodeSave(written);
  assert.ok(again.ok); assert.deepEqual(again.value, out.value);
});

test("a schema 5 save holding any schema 6 field, or mixed tags, is refused before bridging", () => {
  const base = JSON.parse(schema5(progressed()));
  const withSystems = structuredClone(base); withSystems.state.systems = createSystems();
  const withFlares = structuredClone(base); withFlares.state.world.flares = [];
  for (const [raw, pattern] of [[withSystems, /only schema 6 writes/], [withFlares, /only schema 6 writes/],
    [{ ...base, contentVersion: "expedition.7" }, /another content version/], [{ ...base, schemaVersion: 6 }, /another content version/]] as const) {
    const out = decodeSave(JSON.stringify(raw));
    assert.equal(out.ok, false); if (!out.ok) assert.match(out.error, pattern);
  }
});

test("Continue from a stored schema 5 journal reads without writing; the first save keeps the original as previous", async () => {
  const original = schema5(progressed()), storage = new MemoryStorage();
  storage.setItem(LOCAL_SAVE_KEY, JSON.stringify({ format: "siltwake.local", version: 1, current: original, previous: null, preserved: null }));
  const raw = storage.getItem(LOCAL_SAVE_KEY), writes = storage.writes;
  const repo = new SaveRepository(storage, new TestWriterLock());
  const loaded = repo.load();
  assert.ok(loaded.save);
  assert.equal(storage.writes, writes, "reading never writes");
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), raw);
  assert.ok((await repo.commit(loaded.save)).ok);
  const journal = JSON.parse(storage.getItem(LOCAL_SAVE_KEY)!);
  assert.equal(journal.previous, original, "the original schema 5 generation remains byte-identical");
  assert.equal(JSON.parse(journal.current).schemaVersion, 6);
});

test("schemas 1–4 are refused as older development builds, including the archived real exports", () => {
  const sources = [
    older(1, "foundation.1"), older(2, "expedition.2"), older(2, "expedition.3"), older(3, "expedition.4"),
    readFileSync("tests/fixtures/archive/reef-rib-trap-expedition3.json", "utf8"),
    readFileSync("tests/fixtures/archive/earned-c06-expedition4.json", "utf8"),
    readFileSync("tests/fixtures/archive/diagnostic-depleted-expedition5.schema4.json", "utf8"),
  ];
  for (const raw of sources) {
    const out = decodeSave(raw);
    assert.equal(out.ok, false);
    if (!out.ok) assert.match(out.error, /older development build.*schema [1234]\).*Keep the original file/);
  }
  for (const schemaVersion of [0, 7, 99]) {
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

test("named fixtures were converted once to schema 6; the archived originals are evidence, never rewritten", () => {
  for (const [name, archived] of [["earned-c06.json", "earned-c06.schema5.json"], ["reef-rib-trap.json", "reef-rib-trap.schema5.json"]] as const) {
    const raw = fixture(name), out = decodeSave(raw);
    assert.ok(out.ok, out.ok ? "" : out.error);
    assert.equal(JSON.parse(raw).schemaVersion, 6);
    const written = encoded(out.value);
    assert.equal(JSON.stringify(JSON.parse(written)), JSON.stringify(JSON.parse(raw)), `${name} is already canonical`);
    // The archived schema 5 original still bridges to exactly this save.
    const bridged = decodeSave(readFileSync(`tests/fixtures/archive/${archived}`, "utf8"));
    assert.ok(bridged.ok); assert.deepEqual(bridged.value, out.value);
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
