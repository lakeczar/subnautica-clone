import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpeditionSession } from '../src/runtime/session.js';
import { decodeSave, MAX_SAVE_BYTES } from '../src/save/codec.js';
import { LOCAL_SAVE_KEY, SaveRepository } from '../src/save/repository.js';
import { MemoryStorage, TestWriterLock, deferred, encoded, sample, settled } from './persistence-support.js';

function fixture(storage = new MemoryStorage(), lock: TestWriterLock | null = new TestWriterLock()) {
  const notices: string[] = [];
  const events = { changes: 0, entries: 0, pauses: 0 };
  const repository = new SaveRepository(storage, lock);
  const session = new ExpeditionSession(repository, {
    changed: () => { events.changes++; }, entered: () => { events.entries++; }, pause: () => { events.pauses++; },
    notify: message => { notices.push(message); },
  });
  return { session, repository, storage, lock, events, notices };
}
const file = (text: string) => ({ size: new TextEncoder().encode(text).byteLength, text: async () => text });
function stateOf(session: ExpeditionSession) { const state = session.state; assert.ok(state); return state; }
async function seeded(tick = 10) {
  const storage = new MemoryStorage(), lock = new TestWriterLock(), repo = new SaveRepository(storage, lock);
  repo.load(); await repo.commit(sample(tick));
  return fixture(storage, lock);
}

test('readable empty storage with refused first write offers an exportable session only after explicit choice', async () => {
  const f = fixture(); f.storage.failWrite = true;
  const before = new Map(f.storage.data);
  assert.equal(f.repository.status.kind, 'empty');
  f.session.newGame(); assert.equal(f.session.busy, true); await settled();
  assert.equal(f.session.state, null); assert.equal(f.session.busy, false);
  assert.match(f.session.confirmation?.accept ?? '', /without local saving/);
  assert.equal(f.session.envelope(), null); assert.deepEqual(f.storage.data, before);
  f.session.confirm();
  const exported = f.session.envelope(); assert.ok(exported);
  const decoded = decodeSave(encoded(exported)); assert.equal(decoded.ok, true);
  assert.deepEqual(exported.state, stateOf(f.session)); assert.equal(exported.state.tick, 0);
  assert.equal(f.session.autoSaveAllowed, false); assert.match(f.session.persistenceMessage, /Export save/);
  const attempts = f.storage.writes;
  stateOf(f.session).tick = 5000; for (let i = 0; i < 10; i++) f.session.autosave(); await settled();
  assert.equal(f.storage.writes, attempts); assert.deepEqual(f.storage.data, before);
});

test('validated import survives write refusal, cancellation retains the old session and acceptance exports the chosen import', async () => {
  const f = await seeded(); f.session.continueGame();
  const old = f.session.envelope()!, before = f.storage.getItem(LOCAL_SAVE_KEY);
  f.storage.failWrite = true;
  await f.session.importFile(file(encoded(sample(600))));
  assert.match(f.session.confirmation?.title ?? '', /Import this/);
  assert.equal(f.session.state?.tick, 10); assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
  f.session.confirm(); await settled();
  assert.match(f.session.confirmation?.title ?? '', /without local saving/);
  assert.equal(f.session.state?.tick, 10); assert.equal(f.session.envelope()?.meta.sessionId, old.meta.sessionId);
  f.session.cancel(); assert.equal(f.session.state?.tick, 10); assert.equal(f.session.confirmation, null);
  await f.session.importFile(file(encoded(sample(600)))); f.session.confirm(); await settled(); f.session.confirm();
  assert.equal(f.session.state?.tick, 600); assert.equal(f.session.envelope()?.state.tick, 600);
  assert.equal(f.session.autoSaveAllowed, false); assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
  f.session.state!.tick = 5000; f.session.autosave(); await settled();
  assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
});

test('empty valid import can enter a session under write refusal without any local record', async () => {
  const f = fixture(); f.storage.failWrite = true;
  await f.session.importFile(file(encoded(sample(420)))); f.session.confirm(); await settled();
  assert.equal(f.session.state, null); assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), null);
  f.session.confirm(); assert.equal(stateOf(f.session).tick, 420);
  assert.deepEqual(f.session.envelope()?.state, sample(420).state); assert.equal(f.session.autoSaveAllowed, false);
  assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), null);
});

test('new-game replacement retains current progress on both ordinary and unsaved-choice cancellation', async () => {
  const f = await seeded(); f.session.continueGame(); f.session.state!.tick = 77;
  const before = f.storage.getItem(LOCAL_SAVE_KEY); f.storage.failWrite = true;
  f.session.newGame(); assert.equal(f.session.state?.tick, 77); f.session.cancel();
  assert.equal(f.storage.writes, 1);
  f.session.newGame(); f.session.confirm(); await settled();
  assert.equal(f.session.state?.tick, 77); f.session.cancel();
  assert.equal(f.session.envelope()?.state.tick, 77); assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
});

test('failed manual and automatic saves retain active exportable progress and disable automatic retries', async () => {
  for (const automatic of [false, true]) {
    const f = await seeded(); f.session.continueGame(); f.session.state!.tick = 1810;
    const before = f.storage.getItem(LOCAL_SAVE_KEY); f.storage.failWrite = true;
    if (automatic) f.session.autosave(); else f.session.manualSave(); await settled();
    assert.equal(f.session.busy, false); assert.equal(f.session.state?.tick, 1810);
    assert.equal(f.session.envelope()?.state.tick, 1810); assert.equal(f.session.autoSaveAllowed, false);
    const writes = f.storage.writes; f.session.state!.tick += 1800; f.session.autosave(); await settled();
    assert.equal(f.storage.writes, writes); assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
    f.storage.failWrite = false; f.session.manualSave(); await settled();
    assert.equal(f.session.autoSaveAllowed, true); assert.equal(f.repository.status.save?.state.tick, 3610);
  }
});

test('autosave deduplicates frames and conflicting UI actions while a consistent snapshot waits for the lock', async () => {
  const f = await seeded(); f.session.continueGame(); f.session.state!.tick = 1810;
  const gate = deferred(); f.lock!.gate = gate.promise;
  const requests = f.lock!.requests;
  for (let i = 0; i < 20; i++) f.session.autosave();
  f.session.manualSave(); f.session.newGame(); await f.session.importFile(file(encoded(sample(999))));
  assert.equal(f.lock!.requests, requests + 1); assert.equal(f.session.confirmation, null);
  f.session.state!.tick = 1820; gate.resolve(); await settled();
  assert.equal(f.session.busy, false); assert.equal(f.session.state?.tick, 1820);
  assert.equal(f.repository.status.save?.state.tick, 1810);
  f.session.autosave(); await settled(); assert.equal(f.lock!.requests, requests + 1);
});

test('cancelled slow import cannot replace or prompt over a newer expedition', async () => {
  const f = await seeded(); f.session.continueGame(); const read = deferred<string>();
  const pending = f.session.importFile({ size: 50, text: () => read.promise });
  assert.equal(f.session.busy, true); f.session.cancel(); assert.equal(f.session.busy, false);
  f.session.newGame(); f.session.confirm(); await settled();
  const next = f.session.envelope()!; assert.equal(next.state.tick, 0);
  read.resolve(encoded(sample(999))); await pending;
  assert.equal(f.session.confirmation, null); assert.equal(f.session.envelope()?.meta.sessionId, next.meta.sessionId);
  assert.equal(f.session.state?.tick, 0);
});

test('cancelled queued replacement never writes or overwrites the newer imported session', async () => {
  const f = await seeded(); f.session.continueGame(); const gate = deferred(); f.lock!.gate = gate.promise;
  const before = f.storage.getItem(LOCAL_SAVE_KEY);
  f.session.newGame(); f.session.confirm(); assert.equal(f.session.busy, true);
  f.session.cancel(); assert.equal(f.session.state?.tick, 10); assert.equal(f.session.busy, false);
  await f.session.importFile(file(encoded(sample(444)))); f.session.confirm();
  assert.equal(f.session.busy, true); assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
  gate.resolve(); await settled();
  assert.equal(f.session.state?.tick, 444); assert.equal(f.repository.status.backup?.state.tick, 10);
  assert.equal(f.storage.writes, 2); assert.equal(f.session.busy, false);
});

test('disposing queued writes and slow file reads prevents storage changes and presentation resurrection', async () => {
  for (const source of ['save', 'import'] as const) {
    const f = await seeded(); f.session.continueGame(); const gate = deferred(); f.lock!.gate = gate.promise;
    const read = deferred<string>(), before = f.storage.getItem(LOCAL_SAVE_KEY);
    const pending = source === 'import' ? f.session.importFile({ size: 50, text: () => read.promise }) : Promise.resolve();
    if (source === 'save') { f.session.newGame(); f.session.confirm(); }
    f.session.dispose(); const events = { ...f.events }, noticeCount = f.notices.length;
    gate.resolve(); read.resolve(encoded(sample(999))); await pending; await settled();
    f.session.confirm(); f.session.newGame(); f.session.manualSave();
    assert.equal(f.session.busy, false); assert.equal(f.session.state?.tick, 10);
    assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before); assert.deepEqual(f.events, events);
    assert.equal(f.notices.length, noticeCount);
  }
});

test('invalid/future/oversized/unreadable imports clear busy and preserve the active session and journal', async () => {
  const f = await seeded(); f.session.continueGame(); const before = f.storage.getItem(LOCAL_SAVE_KEY);
  for (const candidate of [file('{'), file(JSON.stringify({ ...sample(), schemaVersion: 99 })),
    { size: MAX_SAVE_BYTES + 1, text: async () => { throw new Error('must not read'); } },
    { size: 1, text: async () => { throw new Error('read denied'); } }]) {
    await f.session.importFile(candidate);
    assert.equal(f.session.busy, false); assert.equal(f.session.confirmation, null);
    assert.equal(f.session.state?.tick, 10); assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
  }
});

test('conflict and oversized protection refusals never offer a session-replacement fallback', async () => {
  const f = await seeded(); f.session.continueGame();
  const other = new SaveRepository(f.storage, f.lock); other.load(); await other.commit(sample(20));
  const before = f.storage.getItem(LOCAL_SAVE_KEY);
  f.session.newGame(); f.session.confirm(); await settled();
  assert.equal(f.session.confirmation, null); assert.equal(f.session.state?.tick, 10);
  assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before); assert.match(f.notices.at(-1) ?? '', /another tab/);
  const storage = new MemoryStorage(); storage.setItem(LOCAL_SAVE_KEY, 'x'.repeat(MAX_SAVE_BYTES * 4 + 1));
  const protectedFixture = fixture(storage);
  await protectedFixture.session.importFile(file(encoded(sample()))); protectedFixture.session.confirm(); await settled();
  assert.equal(protectedFixture.session.confirmation, null); assert.equal(protectedFixture.session.state, null);
  assert.match(protectedFixture.notices.at(-1) ?? '', /too large to preserve/);
});

test('missing exclusion still supports explicit unsaved New Game and read/export Continue without writes', async () => {
  const f = fixture(new MemoryStorage(), null); f.session.newGame(); await settled(); f.session.confirm();
  assert.ok(f.session.envelope()); assert.equal(f.session.autoSaveAllowed, false); assert.equal(f.storage.writes, 0);
  const seededFixture = await seeded(), continued = fixture(seededFixture.storage, null), writes = seededFixture.storage.writes;
  continued.session.continueGame(); assert.equal(continued.session.envelope()?.state.tick, 10);
  continued.session.state!.tick = 5000; continued.session.autosave(); await settled();
  assert.equal(continued.session.autoSaveAllowed, false); assert.equal(continued.storage.writes, writes);
});
