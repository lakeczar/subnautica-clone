import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { HULLS, SOURCES } from "../src/content/registry.js";
import { createEnvelope, decodeSave, encodeSave, type SaveEnvelope } from "../src/save/codec.js";
import { validExpedition5State } from "../src/save/expedition5/validation.js";
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import { validState } from "../src/save/validation.js";
import { ExpeditionSession } from "../src/runtime/session.js";
import { BERTH_LOCAL, carrierCommand, emptySockets, fixtureGame, updateBerth } from "../src/sim/carrier.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameState } from "../src/sim/types.js";
import { encoded, MemoryStorage, sample, settled, TestWriterLock, withComposedFields } from "./persistence-support.js";
import { CREEL_SOURCE_IDS, schema4Fixture, withCreel, type Schema4Envelope } from "./schema4-support.js";

// Save policy (docs/build/streams/S7.md): schema 5 loads; schema 4 / expedition.5 is the
// one bridged predecessor; schemas 1–3 are refused as older development builds.
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

test("a schema4 / expedition.5 export validates against the frozen predecessor, then gains only the declared expedition.6 additions", () => {
  const raw = fixture("diagnostic-depleted-expedition5.json"), old = JSON.parse(raw) as Schema4Envelope;
  assert.equal(old.schemaVersion, 4); assert.ok(validExpedition5State(old.state));
  const out = decodeSave(raw); assert.ok(out.ok, out.ok ? "" : out.error);
  assert.deepEqual(out.value, withCreel(old), "depleted stock, renewal progress and every old field retained");
  assert.equal(JSON.stringify(JSON.parse(raw)), JSON.stringify(old), "decoding never mutates its input");
  const s = out.value.state;
  assert.equal(s.player.mobileRefuge, null, "no mobile refuge is auto-registered");
  for (const v of s.fleet.vehicles) assert.equal(v.rating, HULLS[v.hull].initialDepth);
  assert.ok(!s.world.facilities.find((f) => f.id === "canopy_stop")!.repaired, "nothing restored for free");
  for (const id of CREEL_SOURCE_IDS)
    assert.deepEqual(s.world.resources.find((n) => n.id === id), { id, stock: SOURCES[id].stock, reserve: SOURCES[id].reserve });
  const written = encodeSave(out.value); assert.ok(written.ok, "the bridged game is immediately saveable");
  const again = decodeSave(written.value); assert.ok(again.ok); assert.deepEqual(again.value, out.value);
});

test("a seeded schema4 game with depletion and living-shed progress bridges exactly and resumes identically", () => {
  const s = progressed(), old = schema4Fixture(s, meta), raw = JSON.stringify(old);
  const out = decodeSave(raw); assert.ok(out.ok, out.ok ? "" : out.error);
  assert.deepEqual(out.value, withCreel(old));
  assert.deepEqual(out.value.state, s, "the pristine-Creel source state round-trips through the bridge");
  // Zero catch-up: the bridged state and its save → decode execute identically.
  let direct = out.value.state;
  direct.player.pose.position = { ...SOURCES.reef_ribbon_catch_north.position }; direct.player.mode = "swimming";
  const reread = decodeSave(encoded({ ...out.value, state: direct })); assert.ok(reread.ok);
  let resumed = reread.value.state;
  const idle = [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false } as const];
  for (let i = 0; i < 90; i++) { direct = stepGame(direct, idle, world).state; resumed = stepGame(resumed, idle, world).state; }
  assert.deepEqual(JSON.parse(JSON.stringify(resumed)), JSON.parse(JSON.stringify(direct)), "JSON canonicalizes -0");
  assert.equal(direct.world.renewal.find((r) => r.id === "reef_ribbon_catch_north")!.progress, 777 + 90);
});

test("the frozen predecessor refuses current-only fields and cross-version tags before bridging", () => {
  const clean = schema4Fixture(progressed(), meta);
  assert.ok(decodeSave(JSON.stringify(clean)).ok);
  const mutations: ((d: Schema4Envelope) => void)[] = [
    (d) => { Object.assign(d.state.player, { mobileRefuge: null }); },
    (d) => { (d.state.world.facilities as unknown[]).push({ id: "canopy_stop", repaired: true }); },
    (d) => { (d.state.world.resources as unknown[]).push({ id: "basin_frame_ridge", stock: 3, reserve: 0 }); },
    (d) => { (d.state.inventory.items as unknown[]).push({ id: "item_99", kind: "tagged_frame", quantity: 1, containerId: "diver", fitted: null, charge: null, provenance: "public" }); },
    (d) => { d.state.world.resources[4]!.reserve = SOURCES.reef_ribbon_catch_north.reserve + 1; },
    (d) => { d.state.world.renewal.pop(); },
    (d) => { d.state.inventory.containers[0]!.capacity++; },
    (d) => { Reflect.set(d.state, "renewal", []); },
    (d) => { d.contentVersion = "expedition.6" as never; },
  ];
  for (const [i, mutate] of mutations.entries()) {
    const bad = structuredClone(clean); mutate(bad);
    assert.equal(decodeSave(JSON.stringify(bad)).ok, false, `mutation ${i}`);
  }
  const current = createEnvelope(progressed(), meta);
  for (const contentVersion of ["expedition.5", "expedition.4", "foundation.1"])
    assert.equal(decodeSave(JSON.stringify({ ...current, contentVersion })).ok, false, contentVersion);
  assert.equal(decodeSave(JSON.stringify({ ...current, schemaVersion: 4 })).ok, false, "a current state cannot borrow the bridge");
});

test("carrier prepared/lock transactions bridge with identity, and a fixture cannot launder into campaign ownership", () => {
  for (const configuration of ["compact", "medium"] as const) for (const phase of ["prepared", "lock"] as const) {
    const s = fixtureGame(), h = s.fleet.vehicles[0]!;
    s.fleet.docking!.sockets = emptySockets(); // A schema 4 carrier had no socket occupants.
    if (configuration === "medium") {
      for (const [i, v] of s.fleet.vehicles.entries()) if (v.berth) { v.berth = null; v.pose.position = { x: 100 + i * 10, y: -1, z: -60 }; }
      s.fleet.docking!.configuration = "medium";
      s.fleet.vehicles[3]!.berth = { carrierId: h.id, slot: 0, pose: { frame: "carrier-local", position: { ...BERTH_LOCAL[0]! }, yaw: 0 } };
      updateBerth(s, world);
    }
    assert.equal(carrierCommand(s, "launch", configuration === "compact" ? "fixture_dart" : "fixture_creel", world), null);
    s.fleet.docking!.transaction!.phase = phase; s.fleet.docking!.transaction!.ticks = phase === "lock" ? 10 : 0;
    const out = decodeSave(JSON.stringify(schema4Fixture(s, meta))); assert.ok(out.ok, out.ok ? "" : out.error);
    assert.deepEqual(out.value.state, s);
    out.value.state.scenario = "expedition";
    assert.equal(encodeSave(out.value).ok, false, "fixture cannot launder into campaign ownership");
  }
});

test("Continue from a stored schema4 journal reads without writing; the first save keeps the original as previous", async () => {
  const old = schema4Fixture(progressed(), meta), original = JSON.stringify(old), storage = new MemoryStorage();
  storage.setItem(LOCAL_SAVE_KEY, JSON.stringify({ format: "siltwake.local", version: 1, current: original, previous: null, preserved: null }));
  const raw = storage.getItem(LOCAL_SAVE_KEY), writes = storage.writes;
  const repo = new SaveRepository(storage, new TestWriterLock());
  const loaded = repo.load();
  assert.ok(loaded.save);
  assert.deepEqual(loaded.save, withCreel(old));
  assert.equal(storage.writes, writes, "reading never writes");
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), raw);
  assert.ok((await repo.commit(loaded.save)).ok);
  const journal = JSON.parse(storage.getItem(LOCAL_SAVE_KEY)!);
  assert.equal(journal.previous, original, "the original expedition.5 generation remains byte-identical");
  assert.equal(JSON.parse(journal.current).schemaVersion, 5);
});

test("schemas 1–3 are refused as older development builds, including the archived real exports", () => {
  const sources = [
    older(1, "foundation.1"), older(2, "expedition.2"), older(2, "expedition.3"), older(3, "expedition.4"),
    readFileSync("tests/fixtures/archive/reef-rib-trap-expedition3.json", "utf8"),
    readFileSync("tests/fixtures/archive/earned-c06-expedition4.json", "utf8"),
  ];
  for (const raw of sources) {
    const out = decodeSave(raw);
    assert.equal(out.ok, false);
    if (!out.ok) assert.match(out.error, /older development build.*schema [123]\).*Keep the original file/);
  }
  for (const schemaVersion of [0, 6, 99]) {
    const out = decodeSave(older(schemaVersion, "expedition.6"));
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

test("converted earned fixtures load as current saves, gaining only C1's additive fields, and keep the archived player, knowledge and fleet", () => {
  for (const [name, archived] of [["earned-c06.json", "earned-c06-expedition4.json"], ["reef-rib-trap.json", "reef-rib-trap-expedition3.json"]] as const) {
    const raw = fixture(name), out = decodeSave(raw);
    assert.ok(out.ok, out.ok ? "" : out.error);
    // Written before C1's additive fields: loading adds exactly those, in New Game's order.
    assert.deepEqual(out.value, withComposedFields(JSON.parse(raw)), `${name} gains only the additive fields`);
    const written = encoded(out.value);
    assert.equal(JSON.stringify(JSON.parse(written)), JSON.stringify(withComposedFields(JSON.parse(raw))), `${name} writes in canonical order`);
    const again = decodeSave(written); assert.ok(again.ok); assert.equal(encoded(again.value), written, "the completed save is canonical");
    const original = JSON.parse(readFileSync(`tests/fixtures/archive/${archived}`, "utf8")) as { meta: unknown; state: GameState };
    const { mobileRefuge: _r, ...player } = out.value.state.player;
    assert.deepEqual(player, original.state.player, "no relocation, vitals or ownership change");
    assert.deepEqual(out.value.meta, original.meta);
    assert.equal(out.value.state.tick, original.state.tick);
    assert.deepEqual(out.value.state.knowledge.evidence, original.state.knowledge.evidence);
    assert.deepEqual(out.value.state.inventory.items, original.state.inventory.items);
    assert.deepEqual(out.value.state.fleet.vehicles.map(({ rating: _rating, ...v }) => v), original.state.fleet.vehicles);
  }
  // The archived originals are evidence; they are never rewritten.
  assert.equal(sha(readFileSync("tests/fixtures/archive/earned-c06-expedition4.json", "utf8")), "45840e6659e9aed6a98d0c0eed67761f5af8dfaab8d9c32ea051f48d652b4e44");
  assert.equal(sha(readFileSync("tests/fixtures/archive/reef-rib-trap-expedition3.json", "utf8")), "012982eae770e9c7cce3ba8df06bf567db32c57afa51261d87e4db289f236d55");
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
