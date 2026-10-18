import test from "node:test";
import assert from "node:assert/strict";
import { ExpeditionSession } from "../src/runtime/session.js";
import { MAX_SAVE_BYTES } from "../src/save/codec.js";
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import type { NoticeOptions } from "../src/sim/types.js";
import { MemoryStorage, TestWriterLock, deferred, encoded, sample, settled } from "./persistence-support.js";

interface Notice { message: string; error: boolean | undefined; options: NoticeOptions | undefined }
function fixture(storage = new MemoryStorage(), lock: TestWriterLock | null = new TestWriterLock()) {
  const notices: Notice[] = [], order: string[] = [];
  const repository = new SaveRepository(storage, lock);
  const session = new ExpeditionSession(repository, {
    changed: () => { order.push("changed"); },
    pause: () => { order.push("pause"); },
    entered: () => { order.push("entered"); },
    notify(message, error, options) {
      notices.push({ message, error, options }); order.push(`notice:${options?.channel}`);
    },
  });
  return { session, repository, storage, lock, notices, order };
}
async function seeded() {
  const storage = new MemoryStorage(), lock = new TestWriterLock(), repo = new SaveRepository(storage, lock);
  repo.load(); assert.ok((await repo.commit(sample(10))).ok);
  return fixture(storage, lock);
}
const file = (text: string) => ({ size: new TextEncoder().encode(text).byteLength, text: async () => text });
function last(f: ReturnType<typeof fixture>, channel: NoticeOptions["channel"], error: boolean | undefined): Notice {
  const n = f.notices.at(-1); assert.ok(n);
  assert.deepEqual(n.options, { channel }); assert.equal(n.error, error); return n;
}

test("new, successful manual save and import acknowledge persistence after the existing entry/change sequence", async () => {
  const f = fixture(); f.session.newGame(); await settled();
  assert.deepEqual(f.order, ["changed", "pause", "changed", "changed", "entered", "notice:persistence"]);
  assert.match(last(f, "persistence", false).message, /^Expedition saved/);
  f.order.length = 0; f.session.manualSave(); await settled();
  assert.deepEqual(f.order, ["changed", "changed", "notice:persistence"]);
  assert.equal(last(f, "persistence", false).message, "Saved locally. The previous valid save is retained as a backup.");
  await f.session.importFile(file(encoded(sample(123))));
  assert.equal(f.notices.length, 2, "reading and asking do not add acknowledgements");
  f.order.length = 0; f.session.confirm(); await settled();
  assert.deepEqual(f.order, ["changed", "changed", "pause", "changed", "changed", "entered", "notice:persistence"]);
  assert.equal(last(f, "persistence", false).message, "Imported and saved locally.");
  assert.equal(f.session.state?.tick, 123);
});

test("real refused manual and autosave writes are persistence errors and cannot add retries or lose exportable state", async () => {
  for (const automatic of [false, true]) {
    const f = await seeded(); f.session.continueGame(); f.session.state!.tick = 1810;
    const before = f.storage.getItem(LOCAL_SAVE_KEY); f.storage.failWrite = true;
    if (automatic) f.session.autosave(); else f.session.manualSave(); await settled();
    assert.match(last(f, "persistence", true).message, /storage refused.*Automatic saving is disabled/);
    assert.equal(f.session.envelope()?.state.tick, 1810);
    assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
    assert.equal(f.session.autoSaveAllowed, false);
    const count = f.notices.length, writes = f.storage.writes;
    f.session.state!.tick += 1800; f.session.autosave(); await settled();
    assert.equal(f.notices.length, count); assert.equal(f.storage.writes, writes);
    f.storage.failWrite = false; f.session.manualSave(); await settled();
    last(f, "persistence", false); assert.equal(f.session.autoSaveAllowed, true);
  }
});

test("a successful automatic save remains silent", async () => {
  const f = await seeded(); f.session.continueGame(); f.session.state!.tick += 1800;
  f.session.autosave(); await settled();
  assert.equal(f.repository.status.save?.state.tick, 1810); assert.deepEqual(f.notices, []);
});

test("protected Continue stays inert; recovered Continue reports the unsaved persistence boundary without writing", async () => {
  const storage = new MemoryStorage(); storage.setItem(LOCAL_SAVE_KEY, "{");
  const protectedSession = fixture(storage), before = storage.getItem(LOCAL_SAVE_KEY), writes = storage.writes;
  protectedSession.session.continueGame();
  assert.equal(protectedSession.repository.status.kind, "protected");
  assert.equal(protectedSession.session.state, null); assert.deepEqual(protectedSession.notices, []);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), before); assert.equal(storage.writes, writes);
  storage.setItem(LOCAL_SAVE_KEY, JSON.stringify({ format: "siltwake.local", version: 1,
    current: "{", previous: encoded(sample(77)), preserved: null }));
  const recovered = fixture(storage), recoveredWrites = storage.writes;
  recovered.session.continueGame();
  assert.equal(recovered.repository.status.kind, "recovered");
  assert.equal(recovered.session.state?.tick, 77); assert.equal(recovered.session.autoSaveAllowed, false);
  assert.match(last(recovered, "persistence", true).message, /previous valid save/);
  assert.deepEqual(recovered.order, ["changed", "entered", "notice:persistence"]);
  assert.equal(storage.writes, recoveredWrites);
  recovered.session.manualSave(); assert.ok(recovered.session.confirmation); recovered.session.confirm(); await settled();
  last(recovered, "persistence", false);
});

test("Continue migration is system; a missing writer separately reports the persistence reminder", async () => {
  const storage = new MemoryStorage(), lock = new TestWriterLock(), repo = new SaveRepository(storage, lock);
  const save = sample(22); save.state.migration = "Migration fixture retained for Continue.";
  repo.load(); assert.ok((await repo.commit(save)).ok);
  const f = fixture(storage, null), writes = storage.writes; f.session.continueGame();
  assert.deepEqual(f.notices.map(n => [n.message, n.error, n.options?.channel]), [
    [save.state.migration, undefined, "system"],
    ["Local saving is unavailable. Export this expedition before closing this page.", true, "persistence"],
  ]);
  assert.equal(storage.writes, writes);
});

test("explicit unsaved new/import choices add only their existing persistence reminder after acceptance", async () => {
  for (const source of ["new", "import"] as const) {
    const f = fixture(); f.storage.failWrite = true;
    if (source === "new") f.session.newGame();
    else { await f.session.importFile(file(encoded(sample(44)))); f.session.confirm(); }
    await settled();
    assert.equal(f.session.state, null); assert.ok(f.session.confirmation); assert.deepEqual(f.notices, []);
    f.session.confirm();
    assert.match(last(f, "persistence", true).message, /^Session only:/);
    assert.equal(f.session.autoSaveAllowed, false); assert.ok(f.session.envelope());
  }
});

test("import write conflicts are persistence errors while invalid, future, oversized and unreadable files are system errors", async () => {
  const f = await seeded(); f.session.continueGame();
  for (const candidate of [file("{"), file(JSON.stringify({ ...sample(), schemaVersion: 99 })),
    { size: MAX_SAVE_BYTES + 1, text: async () => { throw new Error("must not read"); } },
    { size: 1, text: async () => { throw new Error("denied"); } }]) {
    const before = f.storage.getItem(LOCAL_SAVE_KEY), count = f.notices.length;
    await f.session.importFile(candidate);
    last(f, "system", true); assert.equal(f.notices.length, count + 1);
    assert.equal(f.session.state?.tick, 10); assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
  }
  await f.session.importFile(file(encoded(sample(44))));
  const other = new SaveRepository(f.storage, f.lock); other.load(); assert.ok((await other.commit(sample(88))).ok);
  const before = f.storage.getItem(LOCAL_SAVE_KEY); f.session.confirm(); await settled();
  assert.match(last(f, "persistence", true).message, /another tab/);
  assert.equal(f.session.state?.tick, 10); assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before);
  assert.equal(f.session.confirmation, null);
});

test("cancellation is system and a stale import completion cannot append metadata or replace a newer session", async () => {
  const f = await seeded(); f.session.continueGame(); const read = deferred<string>();
  const pending = f.session.importFile({ size: 50, text: () => read.promise });
  f.session.cancel(); last(f, "system", undefined);
  f.session.newGame(); f.session.confirm(); await settled();
  const id = f.session.envelope()?.meta.sessionId, count = f.notices.length, order = [...f.order];
  read.resolve(encoded(sample(999))); await pending;
  assert.equal(f.session.envelope()?.meta.sessionId, id); assert.equal(f.session.state?.tick, 0);
  assert.equal(f.notices.length, count); assert.deepEqual(f.order, order); assert.equal(f.session.confirmation, null);
});

test("cancelled queued save and disposed completions remain silent after the system cancellation", async () => {
  for (const dispose of [false, true]) {
    const f = await seeded(); f.session.continueGame(); const gate = deferred(); f.lock!.gate = gate.promise;
    const before = f.storage.getItem(LOCAL_SAVE_KEY); f.session.manualSave();
    if (dispose) f.session.dispose(); else { f.session.cancel(); last(f, "system", undefined); }
    const count = f.notices.length, order = [...f.order]; gate.resolve(); await settled();
    assert.equal(f.storage.getItem(LOCAL_SAVE_KEY), before); assert.equal(f.notices.length, count);
    assert.deepEqual(f.order, order);
  }
});

test("legacy callbacks taking only message/error remain compatible", async () => {
  const received: [string, boolean | undefined][] = [];
  const session = new ExpeditionSession(new SaveRepository(new MemoryStorage(), new TestWriterLock()), {
    changed() {}, pause() {}, entered() {}, notify(message, error) { received.push([message, error]); },
  });
  session.newGame(); await settled(); assert.equal(received.length, 1); assert.equal(received[0]![1], false);
});
