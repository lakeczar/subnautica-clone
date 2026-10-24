import test from "node:test";
import assert from "node:assert/strict";
import { createEnvelope, decodeSave, encodeSave, MAX_SAVE_BYTES, SAVE_SCHEMA_VERSION } from "../src/save/codec.js";
import { CARRIER_LAYOUT, carrierCommand, fixtureGame, localToWorld } from "../src/sim/carrier.js";
import { createWorldQueries } from "../src/sim/world.js";
import { WORLD_VERTICAL_BOUNDS } from "../src/content/routes.js";
import type { SaveEnvelope } from "../src/save/codec.js";
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import type { CommitResult } from "../src/save/repository.js";
import { SAVE_WRITER_LOCK } from "../src/save/writer-lock.js";
import { browserWriterLock } from "../src/runtime/browserLock.js";
import {
  MemoryStorage,
  TestWriterLock,
  deferred,
  encoded,
  sample,
} from "./persistence-support.js";

test("save round trip preserves pose, fixed tick and all explicit extension boundaries", () => {
  const save = sample(86400);
  save.state.player.pose = {
    frame: "world",
    position: { x: 25.42, y: -6.9, z: -33.1 },
    yaw: 3.2,
    pitch: 0.6,
  };
  save.state.player.mode = "swimming";
  save.state.player.velocity = { x: 1.1, y: -0.2, z: 0.8 };
  const result = decodeSave(encoded(save));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, save);
  assert.doesNotMatch(encoded(save), /Babylon|Vector3|Mesh/);
});

test("invalid JSON, unrecognized format, unsafe numeric ranges and nonempty future systems fail closed", () => {
  const cases: unknown[] = [
    null,
    [],
    { format: "other" },
    { ...sample(), state: null },
  ];
  for (const mutate of [
    (s: SaveEnvelope) => {
      s.state.player.pose.position.x = 1e9;
    },
    (s: SaveEnvelope) => {
      s.state.tick = 0.1;
    },
    (s: SaveEnvelope) => {
      s.state.player.pose.position.y = WORLD_VERTICAL_BOUNDS.minY - 1;
    },
    (s: SaveEnvelope) => {
      s.state.player.vitals.food = -1;
    },
    (s: SaveEnvelope) => {
      s.state.player.pose.pitch = 90;
    },
    (s: SaveEnvelope) => {
      Object.assign(s.state.player, { mode: ["walking"] });
    },
    (s: SaveEnvelope) => {
      Object.assign(s.state.knowledge, { evidence: ["C01"] });
    },
    (s: SaveEnvelope) => {
      Object.assign(s.state.fleet, { vehicles: [{}] });
    },
    (s: SaveEnvelope) => {
      Object.assign(s.state.player.pose, { unrecognized: true });
    },
  ]) {
    const s = sample();
    mutate(s);
    cases.push(s);
  }
  assert.equal(decodeSave("{").ok, false);
  for (const value of cases)
    assert.equal(
      decodeSave(JSON.stringify(value)).ok,
      false,
      JSON.stringify(value),
    );
  const bad = sample();
  bad.state.player.velocity.y = Infinity;
  assert.equal(encodeSave(bad).ok, false);
});

test("unsupported schema and different content are rejected without rewriting data", () => {
  for (const version of [0, SAVE_SCHEMA_VERSION + 1, 100, "1", null, ["1"], { toString: {} }]) {
    const result = decodeSave(
      JSON.stringify({ ...sample(), schemaVersion: version }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /unsupported/);
  }
  assert.equal(
    decodeSave(JSON.stringify({ ...sample(), contentVersion: "future.9" })).ok,
    false,
  );
});

test("oversized files and malformed dates fail before entering the session", () => {
  assert.equal(decodeSave(" ".repeat(MAX_SAVE_BYTES + 1)).ok, false);
  for (const savedAt of [
    "yesterday",
    "2026-02-30T00:00:00.000Z",
    "2020-10-17T12:00:00.000Z",
  ]) {
    assert.equal(
      decodeSave(
        JSON.stringify({ ...sample(), meta: { ...sample().meta, savedAt } }),
      ).ok,
      false,
    );
  }
});

test("one atomic journal commit retains the previous valid generation and survives a failed replacement", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage(),
    repo = new SaveRepository(storage, lock);
  assert.equal(repo.load().kind, "empty");
  assert.equal((await repo.commit(sample(10))).ok, true);
  assert.equal((await repo.commit(sample(20))).ok, true);
  assert.equal(repo.status.backup?.state.tick, 10);
  const before = storage.getItem(LOCAL_SAVE_KEY);
  storage.failWrite = true;
  assert.equal((await repo.commit(sample(30))).ok, false);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
  storage.failWrite = false;
  const restarted = new SaveRepository(storage, lock);
  assert.equal(restarted.load().save?.state.tick, 20);
  assert.equal(restarted.status.backup?.state.tick, 10);
});

test("invalid writes and rejected corrupt/future imports leave current AND backup byte-for-byte intact", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage(),
    repo = new SaveRepository(storage, lock);
  repo.load();
  await repo.commit(sample(10));
  await repo.commit(sample(20));
  const before = storage.getItem(LOCAL_SAVE_KEY);
  const invalid = sample(30);
  invalid.state.player.pose.yaw = NaN;
  assert.equal((await repo.commit(invalid)).ok, false);
  // The runtime only offers import confirmation if decode succeeds.
  for (const text of [
    "{bad json}",
    JSON.stringify({ ...sample(99), schemaVersion: SAVE_SCHEMA_VERSION + 1 }),
  ]) {
    const result = decodeSave(text);
    if (result.ok) await repo.commit(result.value);
    assert.equal(result.ok, false);
    assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
  }
});

test("corrupt current recovers previous, blocks autosave and preserves raw record during explicit repair", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage(),
    repo = new SaveRepository(storage, lock);
  repo.load();
  await repo.commit(sample(10));
  await repo.commit(sample(20));
  const record = JSON.parse(storage.getItem(LOCAL_SAVE_KEY)!) as Record<
    string,
    unknown
  >;
  record.current = "{corrupt";
  storage.setItem(LOCAL_SAVE_KEY, JSON.stringify(record));
  const restarted = new SaveRepository(storage, lock),
    loaded = restarted.load();
  assert.equal(loaded.kind, "recovered");
  assert.equal(loaded.save?.state.tick, 10);
  const before = storage.getItem(LOCAL_SAVE_KEY);
  assert.equal((await restarted.commit(sample(15))).ok, false);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
  assert.equal((await restarted.commit(sample(15), true)).ok, true);
  const repaired = JSON.parse(storage.getItem(LOCAL_SAVE_KEY)!) as {
    preserved: string;
    previous: string;
  };
  assert.equal(repaired.preserved, before);
  const backup = decodeSave(repaired.previous);
  assert.equal(backup.ok, true);
  if (backup.ok) assert.equal(backup.value.state.tick, 10);
});

test("unsupported local current is protected, even with a valid previous save", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage();
  const future = JSON.stringify({ ...sample(999), schemaVersion: 8 });
  storage.setItem(
    LOCAL_SAVE_KEY,
    JSON.stringify({
      format: "siltwake.local",
      version: 1,
      current: future,
      previous: encoded(sample(12)),
      preserved: null,
    }),
  );
  const before = storage.getItem(LOCAL_SAVE_KEY),
    repo = new SaveRepository(storage, lock);
  assert.equal(repo.load().kind, "recovered");
  assert.match(repo.status.message, /unsupported/);
  assert.equal((await repo.commit(sample(13))).ok, false);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
});

test("a stale tab cannot overwrite a newer tab, and explicit reload makes the conflict visible", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage(),
    tabA = new SaveRepository(storage, lock),
    tabB = new SaveRepository(storage, lock);
  tabA.load();
  tabB.load();
  await tabA.commit(sample(10));
  const result = await tabB.commit(sample(20));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /another tab/);
  assert.equal(tabB.load().save?.state.tick, 10);
});

test("unavailable storage and malformed outer journals do not erase progress", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage();
  storage.failRead = true;
  const repo = new SaveRepository(storage, lock);
  assert.equal(repo.load().kind, "unavailable");
  assert.equal((await repo.commit(sample())).ok, false);
  assert.equal(new SaveRepository(null, lock).load().kind, "unavailable");
  storage.failRead = false;
  storage.setItem(LOCAL_SAVE_KEY, "old-format");
  const protectedRepo = new SaveRepository(storage, lock);
  assert.equal(protectedRepo.load().kind, "protected");
  assert.equal((await protectedRepo.commit(sample())).ok, false);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), "old-format");
});

test("competing independent repositories cannot lose a successful generation in the read/write gap", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage();
  const initial = new SaveRepository(storage, lock);
  initial.load();
  await initial.commit(sample(10));
  const a = new SaveRepository(storage, lock),
    b = new SaveRepository(storage, lock);
  a.load();
  b.load();
  let competing!: Promise<CommitResult>;
  // Queue B AFTER A obtained the old comparison value but BEFORE A writes.
  // B must wait for exclusivity and compare again, rather than use that old value.
  storage.afterRead = () => {
    competing = b.commit(sample(20));
  };
  const resultA = await a.commit(sample(30)),
    resultB = await competing;
  assert.equal(resultA.ok, true);
  assert.equal(resultB.ok, false);
  if (!resultB.ok) assert.equal(resultB.code, "conflict");
  const current = new SaveRepository(storage, lock).load();
  assert.equal(current.save?.state.tick, 30);
  assert.equal(current.backup?.state.tick, 10);
  assert.deepEqual([...lock.names], [SAVE_WRITER_LOCK]);
});

test("rejected write and stale writer release exclusion for subsequent commits", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage();
  const a = new SaveRepository(storage, lock),
    b = new SaveRepository(storage, lock);
  a.load();
  b.load();
  storage.failWrite = true;
  const refusal = await a.commit(sample(10));
  assert.equal(refusal.ok, false);
  if (!refusal.ok) assert.equal(refusal.code, "write-refused");
  storage.failWrite = false;
  assert.equal((await b.commit(sample(20))).ok, true);
  const conflict = await a.commit(sample(30));
  assert.equal(conflict.ok, false);
  assert.equal((await b.commit(sample(40))).ok, true);
  assert.equal(b.status.backup?.state.tick, 20);
});

test("unavailable exclusion permits read/export but never attempts a write", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage(),
    initial = new SaveRepository(storage, lock);
  initial.load();
  await initial.commit(sample(10));
  const before = storage.getItem(LOCAL_SAVE_KEY),
    writes = storage.writes;
  const repo = new SaveRepository(storage, null);
  assert.equal(repo.load().save?.state.tick, 10);
  assert.equal(repo.canWrite, false);
  assert.equal(repo.raw, before);
  assert.equal(encodeSave(repo.status.save!).ok, true);
  const result = await repo.commit(sample(20));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "lock-unavailable");
  assert.equal(storage.writes, writes);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
  assert.equal(browserWriterLock(null), null);
  assert.equal(browserWriterLock(undefined), null);
});

test("queued writes take an immutable snapshot and cancelled lock requests never write", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage(),
    repo = new SaveRepository(storage, lock);
  repo.load();
  const gate = deferred();
  lock.gate = gate.promise;
  const save = sample(10),
    pending = repo.commit(save);
  save.state.tick = 999;
  save.meta.savedAt = "2026-10-17T13:00:00.000Z";
  gate.resolve();
  assert.equal((await pending).ok, true);
  assert.equal(repo.status.save?.state.tick, 10);
  assert.equal(repo.status.save?.meta.savedAt, sample().meta.savedAt);
  const before = storage.getItem(LOCAL_SAVE_KEY),
    writes = storage.writes,
    abort = new AbortController();
  const cancelled = repo.commit(sample(20), false, abort.signal);
  abort.abort();
  const result = await cancelled;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "cancelled");
  assert.equal(storage.writes, writes);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
  assert.equal((await repo.commit(sample(30))).ok, true);
});

test("oversized protected raw records cannot be discarded even by explicit repair", async () => {
  const lock = new TestWriterLock(),
    storage = new MemoryStorage();
  storage.setItem(LOCAL_SAVE_KEY, "x".repeat(MAX_SAVE_BYTES * 4 + 1));
  const repo = new SaveRepository(storage, lock);
  repo.load();
  const before = storage.getItem(LOCAL_SAVE_KEY),
    writes = storage.writes;
  const result = await repo.commit(sample(), true);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "too-large");
  assert.equal(storage.writes, writes);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
});

test("carrier saves preserve all transforms; a walking pose inside a sealed compartment refuses on decode and encode", () => {
  const s = fixtureGame(), h = s.fleet.vehicles[0]!;
  assert.equal(carrierCommand(s, "launch", "fixture_dart", createWorldQueries()), null);
  const meta = sample().meta, envelope = createEnvelope(s, meta);
  const safe = decodeSave(JSON.stringify(envelope));
  assert.equal(safe.ok, true);
  assert.deepEqual(safe.value, envelope);
  const detached = structuredClone(envelope);
  detached.state.player.pose.position.x += 0.02;
  assert.equal(decodeSave(JSON.stringify(detached)).ok, false, "interior and world poses must agree");
  // Clear of the former craft proxy but inside the sealed fore wall.
  s.player.interiorPose!.position = { x: -3, y: 4, z: -3.1 };
  s.player.pose.position = localToWorld(s.player.interiorPose!.position, h);
  const raw = JSON.stringify(envelope), refused = decodeSave(raw);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.error, /sealed carrier compartment/);
  assert.equal(JSON.stringify(envelope), raw, "refusal never relocates or rewrites");
  const write = encodeSave(envelope);
  assert.equal(write.ok, false, "current commands must never save a pose inside the sealed shell");
  if (!write.ok) assert.match(write.error, /sealed carrier compartment/);
  s.player.interiorPose!.position = { ...CARRIER_LAYOUT.helm };
  s.player.pose.position = localToWorld(s.player.interiorPose!.position, h);
  assert.equal(encodeSave(envelope).ok, true, "the authored helm is clear");
});
