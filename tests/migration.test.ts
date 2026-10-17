import test from "node:test";
import assert from "node:assert/strict";
import { decodeSave, encodeSave } from "../src/save/codec.js";
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import { MemoryStorage, TestWriterLock } from "./persistence-support.js";
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
test("actual foundation schema1 migrates safe pose/vitals once with feedback and explicit schema2 content version", () => {
  const old = foundation(),
    d = decodeSave(JSON.stringify(old));
  assert.equal(d.ok, true);
  if (!d.ok) return;
  assert.equal(d.value.schemaVersion, 2);
  assert.equal(d.value.contentVersion, "expedition.2");
  assert.deepEqual(d.value.state.player.pose, old.state.player.pose);
  assert.deepEqual(d.value.state.player.vitals, old.state.player.vitals);
  assert.equal(d.value.state.tick, 444);
  assert.equal(d.value.state.opening.phase, 4);
  assert.ok(d.value.state.migration);
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
  for (const mutate of [
    (s: ReturnType<typeof foundation>) => {
      s.state.knowledge.scans.push("invented" as never);
    },
    (s: ReturnType<typeof foundation>) => {
      s.schemaVersion = 3;
    },
    (s: ReturnType<typeof foundation>) => {
      s.state.player.mode = ["walking"] as unknown as string;
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
