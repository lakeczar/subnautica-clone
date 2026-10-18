import test from "node:test";
import assert from "node:assert/strict";
import { BERTH_LOCAL, CARRIER_LAYOUT, carrierInteriorSolids, fixtureGame, localToWorld, updateBerth } from "../src/sim/carrier.js";
import type { GameState, Vec3 } from "../src/sim/types.js";
import { createWorldQueries, WORLD_BOUNDS } from "../src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import type { SaveEnvelope } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import { ExpeditionSession } from "../src/runtime/session.js";
import { encoded, MemoryStorage, sample, settled, TestWriterLock } from "./persistence-support.js";

const world = createWorldQueries(), shape = { radius: 0.34, height: 1.75 };
const meta = { sessionId: "carrier-migration", createdAt: "2026-10-17T00:00:00.000Z", savedAt: "2026-10-17T00:01:00.000Z" };

// Staged compatibility diagnostics, not captured saves or earned routes. The exact
// maxX case, edge variants and refusal fixture were checked with historical
// c0aa5cb's codec AND local clearance (M1-MIGRATION-FIX evidence). The distinct
// Sol R3 maxZ case is retained as a reviewer-staged compatible-pose diagnostic.
function staged(configuration: "compact" | "medium", position: Vec3, yaw: number,
  local = { x: -3, y: 4, z: 4.5 }): SaveEnvelope {
  const s = fixtureGame(), h = s.fleet.vehicles[0]!;
  if (configuration === "medium") {
    for (const [i, v] of s.fleet.vehicles.entries()) if (v.berth) {
      v.berth = null;
      v.pose.position = { x: 100 + i * 10, y: -1, z: -60 };
    }
    s.fleet.docking!.configuration = "medium";
    s.fleet.vehicles[3]!.berth = { carrierId: h.id, slot: 0,
      pose: { frame: "carrier-local", position: { ...BERTH_LOCAL[0]! }, yaw: 0 } };
  }
  h.pose.position = { ...position };
  h.pose.yaw = yaw;
  s.player.interiorPose!.position = { ...local };
  s.player.pose.yaw = yaw;
  updateBerth(s, world);
  return createEnvelope(s, meta);
}
const historicalEdge = (): SaveEnvelope => staged("compact", { x: 188, y: -24, z: 0 }, Math.PI / 2);
const solEdge = (): SaveEnvelope => staged("compact", { x: 65, y: -24, z: 64 }, Math.PI, { x: -3, y: 4, z: 4.9 });
const noLanding = (): SaveEnvelope => staged("medium", { x: 188, y: -24, z: 66 }, 50 * Math.PI / 180, { x: -4.7, y: 4, z: 4.5 });

function assertClear(s: GameState): void {
  assert.ok(validState(s), "returned state must satisfy strict semantics immediately");
  assert.equal(s.player.mode, "interior");
  assert.equal(s.player.controlledVehicleId, null, "migration does not take the helm");
  assert.ok(createWorldQueries(carrierInteriorSolids(s), () => -200).clearance(s.player.interiorPose!.position, shape));
  assert.ok(world.clearance(s.player.pose.position, shape), "actual world terrain, solids and capsule bounds must clear");
  assert.deepEqual(s.player.pose.position, localToWorld(s.player.interiorPose!.position, s.fleet.vehicles[0]!));
}
function assertMigrates(input: SaveEnvelope): SaveEnvelope {
  assert.ok(validState(input.state), "incoming semantics must already be valid");
  assert.ok(world.clearance(input.state.player.pose.position, shape), "original historical-compatible player clears the world");
  assert.equal(createWorldQueries(carrierInteriorSolids(input.state), () => -200).clearance(input.state.player.interiorPose!.position, shape), false);
  const raw = JSON.stringify(input), result = decodeSave(raw);
  assert.ok(result.ok, result.ok ? "" : result.error);
  const output = result.value;
  assertClear(output.state);
  assert.match(output.state.migration!, /previous walking position.*moved.*clear dry passage/);
  assert.equal(output.state.feedback, output.state.migration);
  // These are the ONLY intended changes: walking local/world position, zeroed
  // player velocity and visible migration/feedback. This compares every other
  // field, including vitals, fleet/cargo, inventory, knowledge, tick and metadata.
  const expected = JSON.parse(raw) as SaveEnvelope;
  expected.state.player.interiorPose!.position = { ...output.state.player.interiorPose!.position };
  expected.state.player.pose.position = { ...output.state.player.pose.position };
  expected.state.player.velocity = { x: 0, y: 0, z: 0 };
  expected.state.migration = output.state.migration;
  expected.state.feedback = output.state.feedback;
  assert.deepEqual(output, expected);
  assert.equal(JSON.stringify(input), raw, "decoding must not mutate the source envelope");
  assert.equal(encodeSave(input).ok, false, "encoding an unmigrated blocked current pose must still refuse");
  const text = encoded(output), again = decodeSave(text);
  assert.ok(again.ok);
  assert.deepEqual(again.value, JSON.parse(JSON.stringify(output)), "migration is idempotent, including its visible notice");
  return output;
}
function journal(current: string, previous: string | null = null): string {
  return JSON.stringify({ format: "siltwake.local", version: 1, current, previous, preserved: "retained-original-record" });
}
function open(raw: string) {
  const storage = new MemoryStorage(), lock = new TestWriterLock();
  storage.data.set(LOCAL_SAVE_KEY, raw);
  const repo = new SaveRepository(storage, lock), notices: { message: string; error?: boolean }[] = [];
  const session = new ExpeditionSession(repo, { changed() {}, pause() {}, entered() {},
    notify(message, error) { notices.push({ message, ...(error === undefined ? {} : { error }) }); } });
  return { storage, lock, repo, session, notices };
}
const file = (text: string) => Object.freeze({ size: new TextEncoder().encode(text).byteLength, async text() { return text; } });

test("historical maxX and independently staged Sol maxZ migrations return clear, immediately saveable states", () => {
  for (const input of [historicalEdge(), solEdge()]) {
    const output = assertMigrates(input);
    assert.notDeepEqual(output.state.player.interiorPose!.position, CARRIER_LAYOUT.helm, "out-of-world helm cannot be selected");
  }
});

test("compact/medium legacy edge headings preserve all unaffected fields and prefer a clear authored helm", () => {
  const edges = [
    { x: WORLD_BOUNDS.maxX, z: 0, yaw: Math.PI / 2 - 0.12 },
    { x: WORLD_BOUNDS.maxX, z: 0, yaw: Math.PI / 2 },
    { x: WORLD_BOUNDS.maxX, z: 0, yaw: Math.PI / 2 + 0.12 },
    { x: WORLD_BOUNDS.minX, z: 0, yaw: 3 * Math.PI / 2 },
    { x: 65, z: WORLD_BOUNDS.maxZ, yaw: Math.PI },
    { x: 65, z: WORLD_BOUNDS.minZ, yaw: 0 },
    { x: 65, z: 12, yaw: 0.31 },
  ];
  for (const configuration of ["compact", "medium"] as const) for (const edge of edges) {
    // The western edge has shallow terrain: stage at the surface so the source
    // and destination capsules both have real world clearance.
    const input = staged(configuration, { x: edge.x, y: edge.x === WORLD_BOUNDS.minX ? -0.9 : -24, z: edge.z }, edge.yaw);
    input.state.player.vitals = { health: 53, oxygen: 37, food: 42 };
    input.state.player.velocity = { x: 0.03, y: -0.01, z: 0.02 };
    input.state.player.graceSeconds = 0;
    input.state.metrics.minOxygen = 37;
    input.state.tick = 321;
    const output = assertMigrates(input);
    if (edge.z === 12) assert.deepEqual(output.state.player.interiorPose!.position, CARRIER_LAYOUT.helm);
  }
});

test("ordinary compatible carrier records stay unchanged and invalid local/world relationships still refuse", () => {
  const input = createEnvelope(fixtureGame(), meta), result = decodeSave(JSON.stringify(input));
  assert.ok(result.ok);
  assert.deepEqual(result.value, input);
  const broken = historicalEdge();
  broken.state.player.pose.position.x += 0.02;
  assert.equal(decodeSave(JSON.stringify(broken)).ok, false);
  assert.equal(encodeSave(broken).ok, false);
});

test("no supported dry landing refuses a historically clear, semantically valid source atomically", async () => {
  const input = noLanding(), raw = JSON.stringify(input);
  assert.ok(validState(input.state));
  assert.ok(world.clearance(input.state.player.pose.position, shape));
  const result = decodeSave(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /carrier.*(?:migration|compartment).*clear dry passage/i);
  assert.equal(encodeSave(input).ok, false);
  assert.equal(JSON.stringify(input), raw);
  // No previous generation: protected, no invalid Continue session. With a valid
  // previous generation: recover that generation with autosave paused, retaining
  // the exact current/previous/preserved bytes until explicit repair.
  for (const previous of [null, encoded(sample(123))]) {
    const rawJournal = journal(raw, previous), h = open(rawJournal);
    try {
      assert.equal(h.repo.status.kind, previous === null ? "protected" : "recovered");
      assert.match(h.repo.status.message, /clear dry passage/);
      h.session.continueGame();
      assert.equal(h.session.state?.tick ?? null, previous === null ? null : 123);
      assert.equal(h.session.autoSaveAllowed, false);
      h.session.autosave();
      if (previous) {
        h.session.manualSave();
        assert.ok(h.session.confirmation, "repair must still require an explicit choice");
        h.session.cancel();
      }
      const commit = await h.repo.commit(input, true);
      assert.equal(commit.ok, false);
      if (!commit.ok) assert.equal(commit.code, "invalid");
      assert.equal(h.lock.requests, 0);
      assert.equal(h.storage.writes, 0);
      assert.equal(h.storage.getItem(LOCAL_SAVE_KEY), rawJournal);
      assert.equal(h.repo.raw, rawJournal);
      assert.equal(h.repo.backupText, previous);
    } finally { h.session.dispose(); }
  }
});

test("migrated local Continue can immediately Export and Save with its original generation retained", async () => {
  for (const input of [historicalEdge(), solEdge()]) {
    const source = JSON.stringify(input), raw = journal(source, encoded(sample(40))), h = open(raw);
    try {
      assert.equal(h.repo.status.kind, "ready");
      h.session.continueGame();
      assertClear(h.session.state!);
      assert.equal(h.session.autoSaveAllowed, true);
      assert.ok(h.notices.some((n) => n.message === h.session.state!.migration && !n.error));
      assert.equal(h.storage.writes, 0);
      assert.equal(h.storage.getItem(LOCAL_SAVE_KEY), raw);
      const exported = h.session.envelope()!;
      assert.ok(decodeSave(encoded(exported)).ok);
      h.session.manualSave();
      await settled();
      assert.equal(h.session.autoSaveAllowed, true);
      assert.equal(h.storage.writes, 1);
      assert.equal(h.repo.backupText, source);
      assert.deepEqual(h.repo.status.save!.state, exported.state);
      const saved = JSON.parse(h.storage.getItem(LOCAL_SAVE_KEY)!);
      assert.equal(saved.preserved, "retained-original-record");
      assert.equal(saved.previous, source);
      assert.deepEqual(decodeSave(saved.current), decodeSave(encoded(h.repo.status.save!)));
      assert.equal(h.session.state!.tick, input.state.tick, "no simulation tick repairs migration");
      assert.equal(h.notices.some((n) => n.error), false);
    } finally { h.session.dispose(); }
  }
});

test("confirmed legacy Import commits a saveable migration and retains the existing current generation", async () => {
  for (const input of [historicalEdge(), solEdge()]) {
    const source = JSON.stringify(input), sourceFile = file(source), current = encoded(sample(90));
    const raw = journal(current, encoded(sample(40))), h = open(raw);
    try {
      h.session.continueGame();
      const active = structuredClone(h.session.state);
      await h.session.importFile(sourceFile);
      assert.ok(h.session.confirmation);
      assert.deepEqual(h.session.state, active);
      assert.equal(h.storage.writes, 0);
      assert.equal(h.storage.getItem(LOCAL_SAVE_KEY), raw);
      h.session.confirm();
      await settled();
      assert.equal(h.session.confirmation, null);
      assertClear(h.session.state!);
      assert.equal(h.session.autoSaveAllowed, true);
      assert.equal(h.session.state!.tick, input.state.tick);
      assert.deepEqual(h.repo.status.save!.meta, input.meta);
      assert.deepEqual(h.session.state, assertMigrates(input).state);
      assert.ok(decodeSave(encoded(h.session.envelope()!)).ok);
      assert.equal(h.storage.writes, 1);
      assert.equal(h.repo.backupText, current);
      assert.equal(JSON.parse(h.storage.getItem(LOCAL_SAVE_KEY)!).preserved, "retained-original-record");
      assert.equal(await sourceFile.text(), source);
      assert.equal(h.notices.some((n) => n.error), false);
    } finally { h.session.dispose(); }
  }
});

test("refused legacy Import preserves the active session, current/backup journal and source file", async () => {
  const source = JSON.stringify(noLanding()), sourceFile = file(source);
  const current = encoded(sample(90)), previous = encoded(sample(40)), raw = journal(current, previous), h = open(raw);
  try {
    h.session.continueGame();
    const active = h.session.state, snapshot = structuredClone(active), slot = structuredClone(h.repo.status);
    await h.session.importFile(sourceFile);
    assert.equal(h.session.busy, false);
    assert.equal(h.session.confirmation, null, "unplaceable migration must fail before confirmation/commit");
    h.session.confirm();
    assert.equal(h.session.state, active);
    assert.deepEqual(h.session.state, snapshot);
    assert.equal(h.session.autoSaveAllowed, true);
    assert.deepEqual(h.repo.status, slot);
    assert.equal(h.repo.raw, raw);
    assert.equal(h.repo.backupText, previous);
    assert.equal(h.storage.getItem(LOCAL_SAVE_KEY), raw);
    assert.equal(h.storage.writes, 0);
    assert.equal(h.lock.requests, 0);
    assert.equal(await sourceFile.text(), source);
    assert.ok(h.notices.some((n) => n.error && /clear dry passage/.test(n.message)));
  } finally { h.session.dispose(); }
});
