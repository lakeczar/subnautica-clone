import test from "node:test";
import assert from "node:assert/strict";
import { RENEWABLE_SOURCE_IDS, SOURCE_RENEWAL, SOURCES } from "../src/content/registry.js";
import { createEnvelope, decodeSave, encodeSave, type SaveEnvelope } from "../src/save/codec.js";
import { validExpedition4State } from "../src/save/expedition4/validation.js";
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import { validState } from "../src/save/validation.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { stepGame } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameState } from "../src/sim/types.js";
import { historicalSchema3, schema2Fixture, stripCreelAdditions, withCreel, type Schema3Envelope } from "./legacy-fixture-support.js";
import { MemoryStorage, TestWriterLock } from "./persistence-support.js";

const world = createWorldQueries();
const meta = { sessionId: "renewal-migration-01", createdAt: "2026-10-18T00:00:00.000Z", savedAt: "2026-10-19T00:00:00.000Z" };
const zero = () => RENEWABLE_SOURCE_IDS.map((id) => ({ id, progress: 0 }));
/** A schema3/expedition.4 record exactly as that build wrote it: the current state
 * without the renewal field. Only pristine progress may be removed. */
function schema3(s: GameState): Schema3Envelope {
  assert.deepEqual(s.world.renewal, zero());
  const current = stripCreelAdditions(s);
  const { renewal: _renewal, ...world } = structuredClone(current.world);
  const old = { format: "siltwake.save", schemaVersion: 3, contentVersion: "expedition.4", meta: { ...meta },
    state: { ...structuredClone(current), world } } as Schema3Envelope;
  assert.ok(validExpedition4State(old.state), "fixture belongs to the frozen expedition.4 domain");
  return old;
}
/** Depleted, partly sorted, investigated progress with collected living sheds. */
function progressed(): GameState {
  const s = createGame(); completeOpening(s);
  for (const id of ["C02", "C03", "C04"] as const) discover(s, id);
  s.tick = 48_000;
  const set = (id: keyof typeof SOURCES, stock: number, reserve: number) =>
    Object.assign(s.world.resources.find((n) => n.id === id)!, { stock, reserve });
  set("reef_ribbon_catch_north", 0, 6); set("reef_ribbon_catch_south", 4, 12);
  set("canopy_resin_lee_upper", 14, 6); set("canopy_resin_lee_lower", 0, 0);
  set("island_resin_cove_east", 0, 2); set("reef_service_scraps_east", 0, 0);
  addItem(s, "flex_membrane", 6, "pod_locker"); addItem(s, "buoyant_resin", 4, "diver");
  s.player.vitals = { health: 61, oxygen: 72.5, food: 44 };
  s.metrics.collections = 19;
  return s;
}
function expectedCurrent(old: Schema3Envelope): SaveEnvelope {
  const { resources, ...rest } = structuredClone(old.state.world);
  return withCreel({ ...old, schemaVersion: 4, contentVersion: "expedition.5", meta: { ...old.meta },
    state: { ...structuredClone(old.state), world: { resources, renewal: zero(), ...rest } } });
}

test("schema3 / expedition.4 migrates by adding only zero renewal progress; depletion and every field are retained", () => {
  for (const state of [createGame(), progressed()]) {
    const old = schema3(state), raw = JSON.stringify(old), result = decodeSave(raw);
    assert.ok(result.ok, result.ok ? "" : result.error);
    assert.deepEqual(result.value, expectedCurrent(old), "no catch-up, refill, materials or other field change");
    assert.equal(JSON.stringify(old), raw, "decoding never mutates its input");
    assert.deepEqual(Object.keys(result.value.state.world), ["resources", "renewal", "facilities", "maintenance", "threat", "action"]);
    // Idempotent: the migrated record writes and reads back identically.
    const written = encodeSave(result.value); assert.ok(written.ok);
    const again = decodeSave(written.value); assert.ok(again.ok); assert.deepEqual(again.value, result.value);
  }
});

test("schema2 composes its existing migration with renewal initialization", () => {
  const s = progressed();
  const two = schema2Fixture(s, meta), three = historicalSchema3(two);
  assert.ok(validExpedition4State(three.state), "the composed intermediate is a valid expedition.4 state");
  const viaTwo = decodeSave(JSON.stringify(two)), viaThree = decodeSave(JSON.stringify(three));
  assert.ok(viaTwo.ok && viaThree.ok);
  assert.deepEqual(viaTwo.value, viaThree.value, "schema2 → 4 equals schema2 → 3 → 4");
  assert.deepEqual(viaTwo.value.state, s, "a pristine-progress source state round-trips through both historical schemas");
});

test("old records are validated against the original expedition.4 domain before migration", () => {
  const clean = schema3(progressed());
  assert.ok(decodeSave(JSON.stringify(clean)).ok);
  const mutations: ((d: Schema3Envelope) => void)[] = [
    (d) => { Reflect.set(d.state.world, "renewal", zero()); },
    (d) => { Reflect.set(d.state.world.resources[4]!, "progress", 0); },
    (d) => { d.state.world.resources[4]!.stock = SOURCES.reef_ribbon_catch_north.stock + SOURCES.reef_ribbon_catch_north.reserve + 1; },
    (d) => { d.state.world.resources[4]!.reserve = SOURCES.reef_ribbon_catch_north.reserve + 1; },
    (d) => { d.state.world.resources.pop(); },
    (d) => { Reflect.set(d.state.world.resources[0]!, "id", "rift_ceramic_lip"); },
    (d) => { (d.state.knowledge.blueprints as string[]).push("bp_divide_service"); },
    (d) => { d.state.inventory.containers[0]!.capacity++; },
    (d) => { d.contentVersion = "expedition.5" as never; },
    (d) => { Reflect.set(d.state, "renewal", []); },
  ];
  for (const [i, mutate] of mutations.entries()) {
    const bad = structuredClone(clean); mutate(bad);
    assert.equal(decodeSave(JSON.stringify(bad)).ok, false, `mutation ${i}`);
  }
  // The current schema cannot borrow the old content tag, and vice versa.
  const current = createEnvelope(progressed(), meta);
  assert.equal(decodeSave(JSON.stringify({ ...current, contentVersion: "expedition.4" })).ok, false);
  assert.equal(decodeSave(JSON.stringify({ ...current, schemaVersion: 3 })).ok, false);
});

test("malformed current renewal state refuses atomically on decode and encode, without normalization", () => {
  const base = progressed();
  base.world.renewal.find((r) => r.id === "reef_ribbon_catch_north")!.progress = 777;
  const good = createEnvelope(base, meta);
  assert.ok(validState(good.state)); assert.ok(encodeSave(good).ok);
  const interval = SOURCE_RENEWAL.reef_ribbon_catch_north.intervalSteps;
  const mutations: ((s: GameState) => void)[] = [
    (s) => { Reflect.deleteProperty(s.world, "renewal"); },
    (s) => { s.world.renewal.pop(); },
    (s) => { s.world.renewal.push({ id: "reef_ribbon_catch_north", progress: 0 }); },
    (s) => { s.world.renewal.reverse(); },
    (s) => { Reflect.set(s.world.renewal[0]!, "id", "island_resin_cove_east"); },
    (s) => { Reflect.set(s.world.renewal[0]!, "id", "reef_service_scraps_east"); },
    (s) => { Reflect.set(s.world.renewal[0]!, "stock", 2); },
    (s) => { s.world.renewal[0]!.progress = -1; },
    (s) => { s.world.renewal[0]!.progress = 1.5; },
    (s) => { s.world.renewal[0]!.progress = interval; },
    (s) => { Reflect.set(s.world.renewal[0]!, "progress", "7"); },
    // Progress is impossible while the source is at or above its cap.
    (s) => { s.world.renewal[2]!.progress = 1; },
    (s) => { s.world.resources.find((n) => n.id === "reef_ribbon_catch_north")!.stock = 12; },
    (s) => { s.scenario = "carrier-fixture"; },
  ];
  for (const [i, mutate] of mutations.entries()) {
    const bad = structuredClone(good); mutate(bad.state);
    const snapshot = JSON.stringify(bad);
    assert.equal(validState(bad.state), false, `mutation ${i}`);
    assert.equal(decodeSave(snapshot).ok, false, `decode ${i}`);
    assert.equal(encodeSave(bad).ok, false, `encode ${i}`);
    assert.equal(JSON.stringify(bad), snapshot, `refusal ${i} does not normalize`);
  }
});

test("Continue from a stored schema3 journal reads without writing; first save keeps the original as previous", async () => {
  const old = schema3(progressed()), original = JSON.stringify(old), storage = new MemoryStorage();
  storage.setItem(LOCAL_SAVE_KEY, JSON.stringify({ format: "siltwake.local", version: 1, current: original, previous: null, preserved: null }));
  const raw = storage.getItem(LOCAL_SAVE_KEY), writes = storage.writes;
  const repo = new SaveRepository(storage, new TestWriterLock());
  const loaded = repo.load();
  assert.ok(loaded.save);
  assert.deepEqual(loaded.save, expectedCurrent(old));
  assert.equal(storage.writes, writes, "reading never writes");
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), raw);
  const committed = await repo.commit(loaded.save);
  assert.ok(committed.ok);
  const journal = JSON.parse(storage.getItem(LOCAL_SAVE_KEY)!);
  assert.equal(journal.previous, original, "the original expedition.4 generation remains byte-identical");
  assert.equal(JSON.parse(journal.current).schemaVersion, 5);
});

test("migrated state and its save → decode produce identical future execution with zero catch-up", () => {
  const migrated = decodeSave(JSON.stringify(schema3(progressed())));
  assert.ok(migrated.ok);
  let direct = migrated.value.state;
  direct.player.pose.position = { ...SOURCES.reef_ribbon_catch_north.position }; direct.player.mode = "swimming";
  const written = encodeSave({ ...migrated.value, state: direct }); assert.ok(written.ok);
  const reread = decodeSave(written.value); assert.ok(reread.ok);
  let resumed = reread.value.state;
  const idle = [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false } as const];
  for (let i = 0; i < 90; i++) {
    direct = stepGame(direct, idle, world).state;
    resumed = stepGame(resumed, idle, world).state;
  }
  assert.deepEqual(JSON.parse(JSON.stringify(resumed)), JSON.parse(JSON.stringify(direct)), "JSON canonicalizes -0");
  const north = direct.world.renewal.find((r) => r.id === "reef_ribbon_catch_north")!;
  assert.equal(north.progress, 90, "progress starts at zero and counts only executed steps");
  assert.equal(direct.world.resources.find((n) => n.id === "reef_ribbon_catch_north")!.stock, 0);
  assert.equal(direct.world.renewal.find((r) => r.id === "canopy_resin_lee_upper")!.progress, 0, "sorted stock above the cap accrues nothing");
});
