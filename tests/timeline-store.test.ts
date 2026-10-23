/** SIM-05: the timeline in local storage is append-only and never loses a note,
 * through failures, restarts, session changes and other tabs (SIM-1 R1–R3). */
import test from "node:test";
import assert from "node:assert/strict";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";
import { addNote, createRecorder, exportTimeline, exportTimelineText, recordEvent, resumeRecorder, rotateOldest, TIMELINE_CHUNK_EVENTS,
  TIMELINE_RETAINED_CHUNKS, TIMELINE_STORAGE_KEY } from "../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import { analyseTimeline, parseTimeline, serializeTimeline } from "../src/sim/timeline/report.js";
import type { TimelineEvent } from "../src/sim/timeline/report.js";
import { headKey, TIMELINE_PREFIX, timelineLock, TimelineStore } from "../src/sim/timeline/store.js";
import type { TimelineLockPort, TimelineStoragePort, TimelineStoreOptions } from "../src/sim/timeline/store.js";

const SESSION = { id: "store-session", started: "2026-10-23T10:00:00.000Z", build: "test" };
/** localStorage: a byte quota (UTF-16 code units, like the browser's), key
 * enumeration, read and write fault injection, a mutation hook and a copy of
 * itself after every mutation. */
class Storage implements TimelineStoragePort {
  readonly data = new Map<string, string>();
  readonly writes = new Map<string, number>();
  used = 0;
  constructor(public quota = Infinity) {}
  private failAt = -1;
  private failing = false;
  private failName = "QuotaExceededError";
  writeCalls = 0;
  /** The `at`th write from now throws; with `persistent`, so does every later one. */
  failFrom(at: number, persistent: boolean, name = "QuotaExceededError"): void {
    this.failAt = at; this.failing = persistent; this.failName = name; this.writeCalls = 0;
  }
  private readFailAt = -1;
  private readFailing = false;
  readCalls = 0;
  /** The `at`th read from now throws; with `persistent`, so does every later one. */
  failReadsFrom(at: number, persistent: boolean): void { this.readFailAt = at; this.readFailing = persistent; this.readCalls = 0; }
  /** Called after every successful mutation (another tab's work interleaves here). */
  onMutate: (() => void) | null = null;
  images: Map<string, string>[] | null = null;
  static of(image: ReadonlyMap<string, string>): Storage {
    const s = new Storage();
    for (const [k, v] of image) s.setItem(k, v);
    s.writes.clear();
    return s;
  }
  get length(): number { return this.data.size; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  getItem(key: string): string | null {
    const call = this.readCalls++;
    if (this.readFailAt >= 0 && (call === this.readFailAt || (this.readFailing && call > this.readFailAt))) {
      const e = new Error("injected read"); e.name = "SecurityError"; throw e;
    }
    return this.data.get(key) ?? null;
  }
  private size(key: string): number { const v = this.data.get(key); return v === undefined ? 0 : key.length + v.length; }
  setItem(key: string, value: string): void {
    const call = this.writeCalls++;
    if (this.failAt >= 0 && (call === this.failAt || (this.failing && call > this.failAt))) {
      const e = new Error("injected"); e.name = this.failName; throw e;
    }
    if (this.used - this.size(key) + key.length + value.length > this.quota) {
      const e = new Error("quota"); e.name = "QuotaExceededError"; throw e;
    }
    this.used += key.length + value.length - this.size(key);
    this.data.set(key, value);
    this.writes.set(key, (this.writes.get(key) ?? 0) + 1);
    this.mutated();
  }
  removeItem(key: string): void {
    this.used -= this.size(key);
    this.data.delete(key);
    this.mutated();
  }
  private mutated(): void {
    this.images?.push(new Map(this.data));
    const hook = this.onMutate;
    this.onMutate = null;
    hook?.();
    this.onMutate ??= hook;
  }
  /** Keys of one session's timeline. */
  sessionKeys(id: string): string[] { return [...this.data.keys()].filter((k) => k.startsWith(`${TIMELINE_PREFIX}${encodeURIComponent(id)}|`)); }
}
/** Web Locks for one origin: a tab holds a name; `ifFree` runs work at once when no one does. */
class Locks implements TimelineLockPort {
  readonly held = new Set<string>();
  async hold(name: string): Promise<() => void> {
    assert.ok(!this.held.has(name), `${name} is already held`);
    this.held.add(name);
    return () => { this.held.delete(name); };
  }
  ifFree<T>(name: string, work: () => T): Promise<T | undefined> {
    if (this.held.has(name)) return Promise.resolve(undefined);
    this.held.add(name);
    try { return Promise.resolve(work()); } finally { this.held.delete(name); }
  }
  /** Marks a session live in some tab. */
  live(id: string): void { this.held.add(timelineLock(id)); }
}
function session(id = SESSION.id): { s: GameState; rec: TimelineRecorder; add(n: number): void; notes: string[] } {
  const s = createGame();
  completeOpening(s);
  const rec = createRecorder({ ...SESSION, id }), notes: string[] = [];
  let i = 0;
  const add = (n: number): void => {
    for (const end = i + n; i < end; i++) {
      s.tick += 30;
      rec.playTicks += 30;
      if (i % 37 === 0) { addNote(rec, s, `${id} note ${i}`); notes.push(`${id} note ${i}`); }
      else recordEvent(rec, s, { kind: "gather", what: "silica_glass", id: "src", quantity: 1 });
    }
  };
  return { s, rec, add, notes };
}
const notesOf = (events: readonly TimelineEvent[]) => events.filter((e) => e.kind === "note").map((e) => e.text!);
const allNotes = (rec: TimelineRecorder, s: GameState) => {
  const x = exportTimeline(rec, s);
  return [...(x.rotated ?? []).flatMap((r) => notesOf(r.kept)), ...notesOf(x.events)];
};
/** Each note exactly once. */
const once = (notes: readonly string[], label = "") => assert.equal(new Set(notes).size, notes.length, `${label}: a note repeats`);
const loaded = (storage: Storage, id: string, label: string): TimelineRecorder => {
  const l = new TimelineStore(storage).load(id);
  assert.equal(l.kind, "loaded", `${label}: a fresh reader finds the timeline (${l.kind === "unreadable" ? l.error : l.kind})`);
  return (l as { recorder: TimelineRecorder }).recorder;
};
/** After a successful save: a fresh store reloads every note once, with matching analysis totals. */
function reloadsWhole(storage: Storage, rec: TimelineRecorder, s: GameState, label: string): TimelineRecorder {
  const back = loaded(storage, rec.session.id, label);
  const notes = allNotes(back, s);
  once(notes, label);
  assert.deepEqual(notes, allNotes(rec, s), `${label}: every note`);
  const a = analyseTimeline(exportTimeline(back, s)), b = analyseTimeline(exportTimeline(rec, s));
  for (const key of ["newCount", "gathering", "notes", "deaths", "travel", "idle"] as const) assert.deepEqual(a[key], b[key], `${label}: ${key}`);
  const numbers = [...back.rotated.map((r) => r.n), ...back.sealed.map((c) => c.n)];
  assert.equal(new Set(numbers).size, numbers.length, `${label}: unique chunk numbers`);
  return back;
}
/** A fresh reader still has every note of an earlier commit, each once. */
function keepsCommitted(storage: Storage, id: string, committed: readonly string[], s: GameState, label: string): void {
  const notes = allNotes(loaded(storage, id, label), s);
  once(notes, label);
  for (const n of committed) assert.ok(notes.includes(n), `${label}: committed ${n} survives`);
}
/** Every key under a session's prefix is its head or a chunk the head names (nothing orphaned). */
function noOrphans(storage: Storage, id: string, label: string): void {
  const head = JSON.parse(storage.data.get(headKey(id)) ?? "null") as { chunks?: number[] } | null;
  const named = new Set((head?.chunks ?? []).map((n) => `${TIMELINE_PREFIX}${encodeURIComponent(id)}|${n}`));
  for (const key of storage.sessionKeys(id)) assert.ok(key === headKey(id) || named.has(key), `${label}: orphan ${key}`);
}
const store = (storage: Storage, options: TimelineStoreOptions = {}) => new TimelineStore(storage, options);
/** A save as the app makes it: holding the session's timeline lock (when there are locks). */
async function liveSave(storage: Storage, options: TimelineStoreOptions & { locks: Locks }, rec: TimelineRecorder, s: GameState) {
  const release = await options.locks.hold(timelineLock(rec.session.id));
  try { return await store(storage, options).save(rec, s); } finally { release(); }
}

test("each chunk is written once, and once more as its summary when it rotates; a save rewrites only the small head", async () => {
  const storage = new Storage(), st = store(storage), { s, rec, add } = session();
  for (let k = 0; k < 30; k++) { add(TIMELINE_CHUNK_EVENTS); assert.notEqual((await st.save(rec, s)).outcome, "failed"); }
  const head = headKey(SESSION.id), chunks = [...storage.writes].filter(([key]) => key !== head);
  assert.equal(chunks.length, 30, "one key per chunk");
  const summaries = [...storage.data].filter(([k, v]) => k !== head && !v.startsWith("["));
  assert.equal(summaries.length, rec.rotated.length);
  assert.equal(storage.data.size - 1 - summaries.length, TIMELINE_RETAINED_CHUNKS, "the retained window in full");
  for (const [key, n] of chunks) assert.equal(n, summaries.some(([k]) => k === key) ? 2 : 1, `${key}: events once, then its summary once`);
  assert.equal(storage.writes.get(head), 31, "a provisional head, then one per save");
  const size = storage.data.get(head)!.length, whole = serializeTimeline(exportTimeline(rec, s)).length;
  assert.ok(size < whole / 5, `the head (${size}) is a fraction of the whole timeline (${whole})`);
  reloadsWhole(storage, rec, s, "30 saves");
});

test("a reload resumes exactly, keeps the chunk keys, and the next save writes only the head", async () => {
  const storage = new Storage(), { s, rec, add } = session();
  add(TIMELINE_CHUNK_EVENTS * (TIMELINE_RETAINED_CHUNKS + 3) + 123);
  assert.equal((await store(storage).save(rec, s)).outcome, "saved");
  const back = loaded(storage, SESSION.id, "reload");
  assert.deepEqual(exportTimeline(back, s), exportTimeline(rec, s));
  const before = new Map(storage.writes);
  assert.equal((await store(storage).save(back, s)).outcome, "saved");
  for (const [key, n] of storage.writes) if (key !== headKey(SESSION.id)) assert.equal(n, before.get(key), `${key} not rewritten`);
});

test("a full quota rotates this session's old chunks into summaries first, never dropping a note", async () => {
  const storage = new Storage(), st = store(storage), { s, rec, add, notes } = session();
  add(TIMELINE_CHUNK_EVENTS * 8 + 50);
  assert.equal((await st.save(rec, s)).outcome, "saved");
  storage.quota = storage.used + 20_000;
  let outcome = "saved";
  for (let k = 0; k < 6; k++) { add(TIMELINE_CHUNK_EVENTS); outcome = (await st.save(rec, s)).outcome; assert.notEqual(outcome, "failed"); }
  assert.equal(outcome, "rotated");
  assert.ok(rec.rotated.length > 0 && rec.sealed.length < 8);
  assert.deepEqual(allNotes(rec, s), notes, "every note, in memory");
  reloadsWhole(storage, rec, s, "after rotating for quota");
  noOrphans(storage, SESSION.id, "after rotating for quota");
});

test("when even the head cannot be stored, the save says so and the timeline stays whole in memory", async () => {
  const storage = new Storage(10), { s, rec, add, notes } = session();
  add(500);
  assert.equal((await store(storage).save(rec, s)).outcome, "failed");
  assert.deepEqual(allNotes(rec, s), notes);
});

// ---- SIM-1 R1 regressions -------------------------------------------------

test("R1-F1: saving at the full window with 998 or 999 open events and open travel or idle keeps every note exactly once", async () => {
  for (const open of [998, 999]) for (const spans of [["idle"], ["travel"], ["travel", "idle"]]) {
    const label = `${open} open, closing ${spans.join("+")}`;
    const s = createGame(); completeOpening(s);
    const rec = createRecorder(SESSION), storage = new Storage();
    addNote(rec, s, "old note");
    for (let i = 1; i < TIMELINE_CHUNK_EVENTS * TIMELINE_RETAINED_CHUNKS + open - 1; i++) {
      s.tick += 3; rec.playTicks += 3;
      recordEvent(rec, s, { kind: "gather", what: "silica_glass", id: "src", quantity: 1 });
    }
    addNote(rec, s, "recent note");
    assert.equal(rec.sealed.length, TIMELINE_RETAINED_CHUNKS, label);
    assert.equal(rec.events.length, open, label);
    if (spans.includes("travel")) rec.travel = { hull: "dart", vehicleId: "dart_1", last: { x: 0, y: 0, z: 0 },
      piece: { tick: s.tick - 600, play: 1, movingTicks: 600, stationaryTicks: 30, metres: 120 } };
    if (spans.includes("idle")) rec.idle = { tick: s.tick - 900, play: 2, waiting: new Set(["decode"]) };
    assert.equal((await store(storage).save(rec, s)).outcome, "saved", label);
    // Saving leaves the live partition alone; the closing spans join only the stored open chunk.
    assert.equal(rec.sealed.length, TIMELINE_RETAINED_CHUNKS, label);
    assert.equal(rec.events.length, open, label);
    const back = reloadsWhole(storage, rec, s, label);
    assert.deepEqual(allNotes(back, s), ["old note", "recent note"], label);
  }
});

/** Two committed generations' worth of a session: the first saved, then more events (sealing chunks) to save. */
async function twoGenerations(): Promise<{ storage: Storage; st: TimelineStore; s: GameState; rec: TimelineRecorder; add(n: number): void; notes: string[]; committed: string[] }> {
  const storage = new Storage(), st = store(storage), x = session();
  x.add(TIMELINE_CHUNK_EVENTS * 3 + 400);
  assert.equal((await st.save(x.rec, x.s)).outcome, "saved");
  const committed = [...x.notes];
  x.add(TIMELINE_CHUNK_EVENTS * 2 + 300);
  return { storage, st, ...x, committed };
}

test("R1-F2: a write failing at any point of a save leaves the committed timeline readable, every note once", async () => {
  const probe = await twoGenerations();
  probe.storage.failFrom(Infinity, false);
  assert.equal((await probe.st.save(probe.rec, probe.s)).outcome, "saved");
  const writes = probe.storage.writeCalls;
  assert.ok(writes >= 3, `${writes} writes in the save`);
  for (const persistent of [false, true]) for (const name of ["QuotaExceededError", "SecurityError"]) for (let at = 0; at < writes + 2; at++) {
    const label = `${persistent ? "every write" : "one write"} failing from write ${at} (${name})`;
    const g = await twoGenerations();
    g.storage.failFrom(at, persistent, name);
    const result = (await g.st.save(g.rec, g.s)).outcome;
    keepsCommitted(g.storage, SESSION.id, g.committed, g.s, label);
    if (result !== "failed") reloadsWhole(g.storage, g.rec, g.s, label);
    assert.deepEqual(allNotes(g.rec, g.s), g.notes, `${label}: memory never loses a note`);
    g.storage.failFrom(-1, false);
    assert.notEqual((await g.st.save(g.rec, g.s)).outcome, "failed", label);
    reloadsWhole(g.storage, g.rec, g.s, `${label}: after recovery`);
    noOrphans(g.storage, SESSION.id, `${label}: after recovery`);
  }
});

test("R1-F2: a quota too small for new notes fails the save but keeps every committed note", async () => {
  const s = createGame(), rec = createRecorder(SESSION), storage = new Storage(), st = store(storage);
  for (let i = 0; i < 1000; i++) addNote(rec, s, `previously saved note ${i}`);
  assert.equal((await st.save(rec, s)).outcome, "saved");
  storage.quota = storage.used + 100;
  for (let i = 0; i < 1000; i++) addNote(rec, s, `new note ${i}`);
  assert.equal((await st.save(rec, s)).outcome, "failed");
  const notes = allNotes(loaded(storage, SESSION.id, "after the failed save"), s);
  assert.equal(notes.length, 1000);
  assert.ok(notes.every((n) => n.startsWith("previously saved note")));
  assert.equal(allNotes(rec, s).length, 2000, "every note in memory, for export");
});

// ---- SIM-1 R2 regressions -------------------------------------------------

test("R2-F1: one store across sessions: A then B, and A then C then A with no C save, with a failure and retry", async () => {
  const storage = new Storage(), st = store(storage);
  const a = session("A");
  a.add(TIMELINE_CHUNK_EVENTS + 200);
  assert.equal((await st.save(a.rec, a.s)).outcome, "saved");
  assert.equal(st.load("B").kind, "absent");
  const b = session("B");
  b.add(TIMELINE_CHUNK_EVENTS + 100);
  assert.equal((await st.save(b.rec, b.s)).outcome, "saved");
  reloadsWhole(storage, b.rec, b.s, "B");
  reloadsWhole(storage, a.rec, a.s, "A");
  assert.equal(st.load("C").kind, "absent");
  const again = st.load("A");
  assert.equal(again.kind, "loaded");
  const resumed = (again as { recorder: TimelineRecorder }).recorder;
  for (let i = 0; i < TIMELINE_CHUNK_EVENTS; i++) addNote(resumed, a.s, `A again ${i}`);
  storage.failFrom(1, false, "SecurityError");
  assert.equal((await st.save(resumed, a.s)).outcome, "failed", "a failing write");
  reloadsWhole(storage, a.rec, a.s, "A's committed timeline survives the failure");
  storage.failFrom(-1, false);
  assert.equal((await st.save(resumed, a.s)).outcome, "saved", "and the retry commits");
  reloadsWhole(storage, resumed, a.s, "A again");
  noOrphans(storage, "A", "A again");
});

test("R2-F1: two store instances alternating sessions on one storage both reload whole", async () => {
  const storage = new Storage(), first = store(storage), second = store(storage);
  const a = session("A"), b = session("B");
  for (let round = 0; round < 4; round++) {
    a.add(TIMELINE_CHUNK_EVENTS - 300); assert.equal((await first.save(a.rec, a.s)).outcome, "saved");
    b.add(TIMELINE_CHUNK_EVENTS + 300); assert.equal((await second.save(b.rec, b.s)).outcome, "saved");
    if (round % 2) { assert.equal(first.load("B").kind, "loaded"); assert.equal(second.load("A").kind, "loaded"); }
    reloadsWhole(storage, a.rec, a.s, `A round ${round}`);
    reloadsWhole(storage, b.rec, b.s, `B round ${round}`);
  }
  noOrphans(storage, "A", "A"); noOrphans(storage, "B", "B");
});

test("R2-F2: a rotated export round-trips through resume, save and load with one numbering, then keeps saving", async () => {
  const s = createGame(), rec = createRecorder(SESSION);
  for (let i = 0; i < 23_000; i++) addNote(rec, s, `note ${i}`);
  assert.ok(rec.rotated.length >= 3);
  const parsed = parseTimeline(exportTimelineText(rec, s));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const restored = resumeRecorder(parsed.value);
  const numbers = [...restored.rotated.map((r) => r.n), ...restored.sealed.map((c) => c.n)];
  assert.equal(new Set(numbers).size, numbers.length, "unique numbers");
  assert.ok(numbers.every((n) => n! < restored.nextChunk), "nextChunk beyond every number");
  const storage = new Storage(), st = store(storage);
  assert.equal((await st.save(restored, s)).outcome, "saved");
  const back = reloadsWhole(storage, restored, s, "restored");
  assert.equal(allNotes(back, s).length, 23_000);
  for (let i = 0; i < 1500; i++) addNote(back, s, `later ${i}`);
  assert.equal((await st.save(back, s)).outcome, "saved");
  reloadsWhole(storage, back, s, "restored, then appended");
  noOrphans(storage, SESSION.id, "restored");
});

test("R2-F3: a restart after any write or cleanup step of a save loses no committed note and leaves nothing behind", async () => {
  const base = new Storage(), x = session();
  x.add(TIMELINE_CHUNK_EVENTS * 3 + 200);
  assert.equal((await store(base).save(x.rec, x.s)).outcome, "saved");
  const committed = [...x.notes];
  x.add(TIMELINE_CHUNK_EVENTS * 2 + 100);
  const live = Storage.of(base.data), images: Map<string, string>[] = [];
  live.images = images;
  const rotated = structuredClone(x.rec);
  assert.ok(rotateOldest(rotated));
  assert.equal((await store(live).save(rotated, x.s)).outcome, "saved");
  assert.ok(images.length >= 4, `${images.length} storage steps`);
  for (const [k, image] of images.entries()) {
    const label = `restart after step ${k + 1} of ${images.length}`;
    const restarted = Storage.of(image);
    keepsCommitted(restarted, SESSION.id, committed, x.s, label);
    const more = loaded(restarted, SESSION.id, label);
    for (let i = 0; i < 300; i++) addNote(more, x.s, `after restart ${i}`);
    assert.equal((await store(restarted).save(more, x.s)).outcome, "saved", label);
    reloadsWhole(restarted, more, x.s, label);
    noOrphans(restarted, SESSION.id, label);
  }
});

// ---- SIM-1 R3 regressions -------------------------------------------------

test("R3-F1: committed timelines are never collected without quota pressure, whatever their age or session", async () => {
  const storage = new Storage(), locks = new Locks(), others = ["old-1", "old-2", "old-3"].map((id) => session(id));
  for (const o of others) { o.add(TIMELINE_CHUNK_EVENTS + 50); assert.equal((await liveSave(storage, { locks }, o.rec, o.s)).outcome, "saved"); }
  const now = session("now");
  for (let k = 0; k < 5; k++) { now.add(TIMELINE_CHUNK_EVENTS); assert.deepEqual(await liveSave(storage, { locks, now: () => 1e15 }, now.rec, now.s), { outcome: "saved", evicted: [] }); }
  for (const o of others) reloadsWhole(storage, o.rec, o.s, `${o.rec.session.id} kept`);
});

test("R3-F1: only under quota pressure, unreferenced timelines are evicted oldest-written first; referenced and live ones never; each is named", async () => {
  const storage = new Storage(), locks = new Locks();
  let clock = 1000;
  const at = (t: number) => ({ locks, now: () => t, referenced: () => ["continue", "backup"] });
  const old = ["continue", "oldest", "backup", "middle", "live-tab", "newest"].map((id) => session(id));
  for (const o of old) { o.add(TIMELINE_CHUNK_EVENTS + 20); clock += 100; assert.equal((await liveSave(storage, at(clock), o.rec, o.s)).outcome, "saved"); }
  locks.live("live-tab");
  const me = session("me");
  locks.live("me");
  me.add(10);
  assert.equal((await store(storage, at(clock)).save(me.rec, me.s)).outcome, "saved");
  // Saves under a tight quota, until even eviction can't make room.
  const evicted: string[] = [];
  let last = { outcome: "saved" as string, evicted: [] as string[] };
  for (let k = 0; k < 12 && last.outcome !== "failed"; k++) {
    storage.quota = storage.used + 2_000;
    me.add(TIMELINE_CHUNK_EVENTS * 2 + 100);
    last = await store(storage, at(clock + k + 1)).save(me.rec, me.s);
    evicted.push(...last.evicted);
    if (last.outcome !== "failed") reloadsWhole(storage, me.rec, me.s, `the saving session, save ${k}`);
  }
  assert.equal(last.outcome, "failed", "in the end nothing evictable is left");
  assert.deepEqual(evicted, ["oldest", "middle", "newest"], "the oldest written first; never the referenced or the live");
  for (const id of evicted) assert.deepEqual(storage.sessionKeys(id), [], `${id} evicted whole`);
  for (const o of old.filter((x) => !evicted.includes(x.rec.session.id))) reloadsWhole(storage, o.rec, o.s, `${o.rec.session.id} kept`);
  // The saving timeline records each eviction, so its export names them.
  const x = exportTimeline(me.rec, me.s), kept = [...(x.rotated ?? []).flatMap((r) => r.kept), ...x.events];
  assert.deepEqual(kept.filter((e) => e.kind === "system" && e.what === "timeline-evicted").map((e) => e.id), evicted, "even after its chunks fold");
  // Without a lock API, other sessions are never evicted.
  const unlocked = session("unlocked");
  unlocked.add(TIMELINE_CHUNK_EVENTS * 3);
  assert.deepEqual((await store(storage, { referenced: () => [] }).save(unlocked.rec, unlocked.s)).evicted, []);
});

test("R3-F1: a version 1 record goes only when its own session stores a complete version 2 head", async () => {
  const storage = new Storage(), locks = new Locks(), a = session("A");
  for (let i = 0; i < 200; i++) addNote(a.rec, a.s, `legacy ${i}`);
  storage.setItem(TIMELINE_STORAGE_KEY, serializeTimeline({ ...exportTimeline(a.rec, a.s), version: 1 }));
  // A's migration is interrupted after its provisional head.
  const migrating = loaded(storage, "A", "A from version 1");
  storage.failFrom(1, false, "Crash");
  assert.equal((await liveSave(storage, { locks }, migrating, a.s)).outcome, "failed");
  storage.failFrom(-1, false);
  // Another session saves (several times): the record stays, and A still loads it.
  const b = session("B");
  for (let k = 0; k < 3; k++) { b.add(500); assert.equal((await liveSave(storage, { locks }, b.rec, b.s)).outcome, "saved"); }
  assert.ok(storage.data.get(TIMELINE_STORAGE_KEY), "B never removes A's record");
  assert.equal(allNotes(loaded(storage, "A", "A still from version 1"), a.s).length, 200);
  // A completes its migration: then the record goes.
  assert.equal((await liveSave(storage, { locks }, migrating, a.s)).outcome, "saved");
  assert.equal(storage.data.get(TIMELINE_STORAGE_KEY), undefined);
  reloadsWhole(storage, migrating, a.s, "A migrated");
  reloadsWhole(storage, b.rec, b.s, "B");
});

test("R3-F2: a read failing at any point of a save never deletes or overwrites committed history (crash images too)", async () => {
  const probe = await twoGenerations(), other = session("other");
  other.add(TIMELINE_CHUNK_EVENTS + 10);
  assert.equal((await store(probe.storage).save(other.rec, other.s)).outcome, "saved");
  probe.storage.failReadsFrom(Infinity, false);
  assert.equal((await liveSave(probe.storage, { locks: new Locks() }, structuredClone(probe.rec), probe.s)).outcome, "saved");
  const reads = probe.storage.readCalls;
  assert.ok(reads >= 2, `${reads} reads in the save`);
  for (const persistent of [false, true]) for (let at = 0; at < reads + 1; at++) {
    const label = `${persistent ? "every read" : "one read"} failing from read ${at}`;
    const g = await twoGenerations();
    assert.equal((await store(g.storage).save(other.rec, other.s)).outcome, "saved");
    g.storage.images = [];
    g.storage.failReadsFrom(at, persistent);
    const r = await liveSave(g.storage, { locks: new Locks() }, g.rec, g.s);
    g.storage.failReadsFrom(-1, false);
    keepsCommitted(g.storage, SESSION.id, g.committed, g.s, label);
    if (r.outcome !== "failed") reloadsWhole(g.storage, g.rec, g.s, label);
    reloadsWhole(g.storage, other.rec, other.s, `${label}: the other session is never touched`);
    for (const [k, image] of g.storage.images.entries()) keepsCommitted(Storage.of(image), SESSION.id, g.committed, g.s, `${label}, crash image ${k}`);
  }
});

test("R3-F2: an unreadable stored timeline loads as unreadable, never as absent", async () => {
  const storage = new Storage(), x = session();
  x.add(TIMELINE_CHUNK_EVENTS + 5);
  assert.equal((await store(storage).save(x.rec, x.s)).outcome, "saved");
  storage.failReadsFrom(0, true);
  assert.equal(store(storage).load(SESSION.id).kind, "unreadable");
  storage.failReadsFrom(-1, false);
  storage.data.set(headKey(SESSION.id), "{not json");
  assert.equal(store(storage).load(SESSION.id).kind, "unreadable");
  // And a save never writes over a head it can't read.
  const fresh = session();
  fresh.add(10);
  assert.equal((await store(storage).save(fresh.rec, fresh.s)).outcome, "failed");
  assert.equal(storage.data.get(headKey(SESSION.id)), "{not json");
});

test("R3-F3: another tab's collector never takes a live session's work, at any provisional, chunk or head boundary", async () => {
  for (const held of [true, false]) {
    const storage = new Storage(), locks = new Locks(), a = session("A"), b = session("B");
    // A's first save writes its provisional head and a chunk, then fails at its head.
    a.add(TIMELINE_CHUNK_EVENTS + 10);
    if (held) locks.live("A");
    storage.failFrom(held ? 2 : 0, false, "Crash");
    assert.equal((await store(storage, { locks }).save(a.rec, a.s)).outcome, "failed");
    storage.failFrom(-1, false);
    // A retries; at every storage step of the retry, B's collector runs.
    a.add(TIMELINE_CHUNK_EVENTS);
    b.add(50);
    let steps = 0;
    locks.live("B");
    storage.onMutate = () => { steps++; void store(storage, { locks }).save(b.rec, b.s); };
    const r = await store(storage, { locks }).save(a.rec, a.s);
    storage.onMutate = null;
    await new Promise((done) => setImmediate(done));
    if (held) {
      assert.ok(steps >= 3);
      assert.equal(r.outcome, "saved", "a live session's retry commits");
      reloadsWhole(storage, a.rec, a.s, "A, live through B's collection");
    } else {
      // A writer that doesn't hold its session's lock is refused before it writes anything,
      // and its abandoned work is another tab's to reclaim.
      assert.equal(r.outcome, "failed");
      assert.match(r.error ?? "", /lock/);
      assert.equal((await store(storage, { locks }).save(b.rec, b.s)).outcome, "saved");
      assert.deepEqual(storage.sessionKeys("A"), [], "A's abandoned work reclaimed");
    }
    reloadsWhole(storage, b.rec, b.s, "B");
  }
});

test("R3-F3: abandoned uncommitted work is reclaimed only under its free lock, and never without locks", async () => {
  const storage = new Storage(), locks = new Locks();
  for (let k = 0; k < 4; k++) {
    const g = session(`abandoned-${k}`);
    g.add(TIMELINE_CHUNK_EVENTS + 10);
    storage.failFrom(2, false, "Crash");
    assert.equal((await store(storage).save(g.rec, g.s)).outcome, "failed");
    storage.failFrom(-1, false);
  }
  locks.live("abandoned-3");
  const me = session("me");
  me.add(100);
  assert.equal((await store(storage).save(me.rec, me.s)).outcome, "saved");
  for (let k = 0; k < 4; k++) assert.ok(storage.sessionKeys(`abandoned-${k}`).length, `abandoned-${k} kept without locks`);
  const r = await liveSave(storage, { locks }, me.rec, me.s);
  assert.equal(r.outcome, "saved");
  assert.deepEqual(r.evicted, [], "reclaiming garbage is not eviction");
  for (let k = 0; k < 3; k++) assert.deepEqual(storage.sessionKeys(`abandoned-${k}`), [], `abandoned-${k} reclaimed`);
  assert.ok(storage.sessionKeys("abandoned-3").length, "a live session's work stays");
  reloadsWhole(storage, me.rec, me.s, "me");
});
