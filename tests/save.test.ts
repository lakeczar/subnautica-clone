import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/state.js';
import { createEnvelope, decodeSave, encodeSave, MAX_SAVE_BYTES } from '../src/save/codec.js';
import type { SaveEnvelope } from '../src/save/codec.js';
import { LOCAL_SAVE_KEY, SaveRepository } from '../src/save/repository.js';
import type { StoragePort } from '../src/save/repository.js';

const meta = { sessionId: 'test-session-001', createdAt: '2026-10-17T12:00:00.000Z', savedAt: '2026-10-17T12:05:00.000Z' };
const sample = (tick = 150): SaveEnvelope => { const state = createGame(); state.tick = tick; return createEnvelope(state, meta); };
function encoded(save: SaveEnvelope): string { const result = encodeSave(save); if (!result.ok) throw new Error(result.error); return result.value; }
class MemoryStorage implements StoragePort {
  data = new Map<string, string>();
  failWrite = false;
  failRead = false;
  getItem(key: string): string | null { if (this.failRead) throw new Error('denied'); return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { if (this.failWrite) throw new Error('quota'); this.data.set(key, value); }
}

test('save round trip preserves pose, fixed tick and all explicit extension boundaries', () => {
  const save = sample(86400);
  save.state.player.pose = { frame: 'world', position: { x: 25.42, y: -6.9, z: -33.1 }, yaw: 3.2, pitch: 0.6 };
  save.state.player.mode = 'swimming'; save.state.player.velocity = { x: 1.1, y: -0.2, z: 0.8 };
  const result = decodeSave(encoded(save)); assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, save);
  assert.doesNotMatch(encoded(save), /Babylon|Vector3|Mesh/);
});

test('invalid JSON, unrecognized format, unsafe numeric ranges and nonempty future systems fail closed', () => {
  const cases: unknown[] = [null, [], { format: 'other' }, { ...sample(), state: null }];
  for (const mutate of [
    (s: SaveEnvelope) => { s.state.player.pose.position.x = 1e9; },
    (s: SaveEnvelope) => { s.state.tick = 0.1; },
    (s: SaveEnvelope) => { s.state.player.vitals.food = -1; },
    (s: SaveEnvelope) => { s.state.player.pose.pitch = 90; },
    (s: SaveEnvelope) => { Object.assign(s.state.player, { mode: ['walking'] }); },
    (s: SaveEnvelope) => { Object.assign(s.state.knowledge, { evidence: ['C01'] }); },
    (s: SaveEnvelope) => { Object.assign(s.state.fleet, { vehicles: [{}] }); },
    (s: SaveEnvelope) => { Object.assign(s.state.player.pose, { unrecognized: true }); },
  ]) { const s = sample(); mutate(s); cases.push(s); }
  assert.equal(decodeSave('{').ok, false);
  for (const value of cases) assert.equal(decodeSave(JSON.stringify(value)).ok, false, JSON.stringify(value));
  const bad = sample(); bad.state.player.velocity.y = Infinity;
  assert.equal(encodeSave(bad).ok, false);
});

test('future / old schema and different content are rejected without attempted migration', () => {
  for (const version of [0, 2, 100, '1', null, ['1'], { toString: {} }]) {
    const result = decodeSave(JSON.stringify({ ...sample(), schemaVersion: version }));
    assert.equal(result.ok, false); if (!result.ok) assert.match(result.error, /unsupported/);
  }
  assert.equal(decodeSave(JSON.stringify({ ...sample(), contentVersion: 'future.9' })).ok, false);
});

test('oversized files and malformed dates fail before entering the session', () => {
  assert.equal(decodeSave(' '.repeat(MAX_SAVE_BYTES + 1)).ok, false);
  for (const savedAt of ['yesterday', '2026-02-30T00:00:00.000Z', '2020-10-17T12:00:00.000Z']) {
    assert.equal(decodeSave(JSON.stringify({ ...sample(), meta: { ...meta, savedAt } })).ok, false);
  }
});

test('one atomic journal commit retains the previous valid generation and survives a failed replacement', () => {
  const storage = new MemoryStorage(), repo = new SaveRepository(storage);
  assert.equal(repo.load().kind, 'empty');
  assert.equal(repo.commit(sample(10)).ok, true);
  assert.equal(repo.commit(sample(20)).ok, true);
  assert.equal(repo.status.backup?.state.tick, 10);
  const before = storage.getItem(LOCAL_SAVE_KEY);
  storage.failWrite = true;
  assert.equal(repo.commit(sample(30)).ok, false);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
  storage.failWrite = false;
  const restarted = new SaveRepository(storage);
  assert.equal(restarted.load().save?.state.tick, 20);
  assert.equal(restarted.status.backup?.state.tick, 10);
});

test('invalid writes and rejected corrupt/future imports leave current AND backup byte-for-byte intact', () => {
  const storage = new MemoryStorage(), repo = new SaveRepository(storage); repo.load(); repo.commit(sample(10)); repo.commit(sample(20));
  const before = storage.getItem(LOCAL_SAVE_KEY);
  const invalid = sample(30); invalid.state.player.pose.yaw = NaN;
  assert.equal(repo.commit(invalid).ok, false);
  // The runtime only offers import confirmation if decode succeeds.
  for (const text of ['{bad json}', JSON.stringify({ ...sample(99), schemaVersion: 4 })]) {
    const result = decodeSave(text); if (result.ok) repo.commit(result.value);
    assert.equal(result.ok, false);
    assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
  }
});

test('corrupt current recovers previous, blocks autosave and preserves raw record during explicit repair', () => {
  const storage = new MemoryStorage(), repo = new SaveRepository(storage); repo.load(); repo.commit(sample(10)); repo.commit(sample(20));
  const record = JSON.parse(storage.getItem(LOCAL_SAVE_KEY)! ) as Record<string, unknown>;
  record.current = '{corrupt'; storage.setItem(LOCAL_SAVE_KEY, JSON.stringify(record));
  const restarted = new SaveRepository(storage), loaded = restarted.load();
  assert.equal(loaded.kind, 'recovered'); assert.equal(loaded.save?.state.tick, 10);
  const before = storage.getItem(LOCAL_SAVE_KEY);
  assert.equal(restarted.commit(sample(15)).ok, false); assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
  assert.equal(restarted.commit(sample(15), true).ok, true);
  const repaired = JSON.parse(storage.getItem(LOCAL_SAVE_KEY)!) as { preserved: string; previous: string };
  assert.equal(repaired.preserved, before);
  const backup = decodeSave(repaired.previous); assert.equal(backup.ok, true); if (backup.ok) assert.equal(backup.value.state.tick, 10);
});

test('unsupported local current is protected, even with a valid previous save', () => {
  const storage = new MemoryStorage();
  const future = JSON.stringify({ ...sample(999), schemaVersion: 8 });
  storage.setItem(LOCAL_SAVE_KEY, JSON.stringify({ format: 'siltwake.local', version: 1, current: future, previous: encoded(sample(12)), preserved: null }));
  const before = storage.getItem(LOCAL_SAVE_KEY), repo = new SaveRepository(storage);
  assert.equal(repo.load().kind, 'recovered'); assert.match(repo.status.message, /unsupported/);
  assert.equal(repo.commit(sample(13)).ok, false); assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
});

test('a stale tab cannot overwrite a newer tab, and explicit reload makes the conflict visible', () => {
  const storage = new MemoryStorage(), tabA = new SaveRepository(storage), tabB = new SaveRepository(storage);
  tabA.load(); tabB.load(); tabA.commit(sample(10));
  const result = tabB.commit(sample(20)); assert.equal(result.ok, false); if (!result.ok) assert.match(result.error, /another tab/);
  assert.equal(tabB.load().save?.state.tick, 10);
});

test('unavailable storage and malformed outer journals do not erase progress', () => {
  const storage = new MemoryStorage(); storage.failRead = true;
  const repo = new SaveRepository(storage); assert.equal(repo.load().kind, 'unavailable'); assert.equal(repo.commit(sample()).ok, false);
  assert.equal(new SaveRepository(null).load().kind, 'unavailable');
  storage.failRead = false; storage.setItem(LOCAL_SAVE_KEY, 'old-format');
  const protectedRepo = new SaveRepository(storage); assert.equal(protectedRepo.load().kind, 'protected');
  assert.equal(protectedRepo.commit(sample()).ok, false); assert.equal(storage.getItem(LOCAL_SAVE_KEY), 'old-format');
});
