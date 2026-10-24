/** SIM-05: the play timeline in local storage, kept like the save slot: one
 * journal record (current and previous heads) is the commit point, commits run
 * inside the writer lock with observed-record conflict detection, and no note
 * is lost (SIM-1 R1–R4). */
import test from "node:test";
import assert from "node:assert/strict";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";
import { addNote, createRecorder, exportTimeline, exportTimelineText, recordEvent, resumeRecorder, rotateOldest, TIMELINE_CHUNK_EVENTS,
  TIMELINE_RETAINED_CHUNKS, TIMELINE_STORAGE_KEY } from "../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import { analyseTimeline, parseTimeline, serializeTimeline, summarizeChunk } from "../src/sim/timeline/report.js";
import type { TimelineEvent } from "../src/sim/timeline/report.js";
import { TIMELINE_JOURNAL_KEY, TimelineJournal } from "../src/sim/timeline/store.js";
import type { TimelineCommit, TimelineRecords, TimelineStoragePort } from "../src/sim/timeline/store.js";
import type { WriterLockPort } from "../src/save/writer-lock.js";
import { deferred, TestWriterLock } from "./persistence-support.js";

const STARTED = "2026-10-23T10:00:00.000Z";
/** localStorage: a byte quota (UTF-16 code units, like the browser's), key
 * enumeration, read and write fault injection and a copy after every mutation. */
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
  failFrom(at: number, persistent: boolean, name = "QuotaExceededError"): void { this.failAt = at; this.failing = persistent; this.failName = name; this.writeCalls = 0; }
  private readFailAt = -1;
  private readFailing = false;
  readCalls = 0;
  failReadsFrom(at: number, persistent: boolean): void { this.readFailAt = at; this.readFailing = persistent; this.readCalls = 0; }
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
    if (this.failAt >= 0 && (call === this.failAt || (this.failing && call > this.failAt))) { const e = new Error("injected"); e.name = this.failName; throw e; }
    if (this.used - this.size(key) + key.length + value.length > this.quota) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; }
    this.used += key.length + value.length - this.size(key);
    this.data.set(key, value);
    this.writes.set(key, (this.writes.get(key) ?? 0) + 1);
    this.images?.push(new Map(this.data));
  }
  removeItem(key: string): void { this.used -= this.size(key); this.data.delete(key); this.images?.push(new Map(this.data)); }
}
function session(id = "A"): { s: GameState; rec: TimelineRecorder; add(n: number): void; notes: string[] } {
  const s = createGame();
  completeOpening(s);
  const rec = createRecorder({ id, started: STARTED }), notes: string[] = [];
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
  return [...(x.rotated ?? []).flatMap((r) => notesOf(r.kept)), ...notesOf(x.events)].sort();
};
const once = (notes: readonly string[], label = "") => assert.equal(new Set(notes).size, notes.length, `${label}: a note repeats`);
/** A tab's journal for `id`, already loaded. */
function tab(storage: Storage | null, id = "A", lock: WriterLockPort | null = new TestWriterLock()): TimelineJournal {
  const j = new TimelineJournal(storage, lock, id);
  j.load();
  return j;
}
const commit = (j: TimelineJournal, rec: TimelineRecorder, s: GameState, signal = new AbortController().signal): Promise<TimelineCommit> => j.commit(rec, s, signal);
const loaded = (storage: Storage, id: string, label: string): TimelineRecorder => {
  const l = new TimelineJournal(storage, new TestWriterLock(), id).load();
  assert.equal(l.kind, "loaded", `${label}: a fresh reader finds the timeline (${l.kind === "protected" ? l.error : l.kind})`);
  return (l as { recorder: TimelineRecorder }).recorder;
};
/** After a successful commit: a fresh reader reloads every note once, with matching analysis totals. */
function reloadsWhole(storage: Storage, rec: TimelineRecorder, s: GameState, label: string): TimelineRecorder {
  const back = loaded(storage, rec.session.id, label), notes = allNotes(back, s);
  once(notes, label);
  assert.deepEqual(notes, allNotes(rec, s), `${label}: every note`);
  const a = analyseTimeline(exportTimeline(back, s)), b = analyseTimeline(exportTimeline(rec, s));
  for (const key of ["newCount", "gathering", "deaths", "travel", "idle"] as const) assert.deepEqual(a[key], b[key], `${label}: ${key}`);
  return back;
}
function keepsCommitted(storage: Storage, id: string, committed: readonly string[], s: GameState, label: string): void {
  const notes = allNotes(loaded(storage, id, label), s);
  once(notes, label);
  for (const n of committed) assert.ok(notes.includes(n), `${label}: committed ${n} survives`);
}
/** Every chunk key is named by the journal's current or previous head (nothing orphaned). */
function noOrphans(storage: Storage, label: string): void {
  const j = JSON.parse(storage.data.get(TIMELINE_JOURNAL_KEY) ?? "null") as { current: { session: { id: string }; chunks: number[] } | null; previous: { session: { id: string }; chunks: number[] } | null } | null;
  const live = new Set([j?.current, j?.previous].flatMap((h) => h ? h.chunks.map((n) => `siltwake.timeline.v2|${encodeURIComponent(h.session.id)}|${n}`) : []));
  for (const key of storage.data.keys()) if (key.startsWith("siltwake.timeline.v2|")) assert.ok(live.has(key), `${label}: orphan ${key}`);
}

test("each chunk is written once, and once more as its summary when it rotates; a commit rewrites only the journal", async () => {
  const storage = new Storage(), j = tab(storage), { s, rec, add } = session();
  for (let k = 0; k < 30; k++) { add(TIMELINE_CHUNK_EVENTS); assert.equal((await commit(j, rec, s)).ok, true); }
  const chunks = [...storage.writes].filter(([key]) => key.startsWith("siltwake.timeline.v2|"));
  assert.equal(chunks.length, 30, "one key per chunk");
  const summaries = chunks.filter(([key]) => !storage.data.get(key)!.startsWith("["));
  assert.equal(summaries.length, rec.rotated.length);
  for (const [key, n] of chunks) assert.equal(n, summaries.some(([k]) => k === key) ? 2 : 1, `${key}: events once, then its summary once`);
  assert.equal(storage.writes.get(TIMELINE_JOURNAL_KEY), 30);
  const size = storage.data.get(TIMELINE_JOURNAL_KEY)!.length, whole = serializeTimeline(exportTimeline(rec, s)).length;
  assert.ok(size < whole / 5, `the journal (${size}) is a fraction of the whole timeline (${whole})`);
  reloadsWhole(storage, rec, s, "30 commits");
  noOrphans(storage, "30 commits");
});

test("a reload resumes exactly, and its next commit writes only the journal", async () => {
  const storage = new Storage(), { s, rec, add } = session();
  add(TIMELINE_CHUNK_EVENTS * (TIMELINE_RETAINED_CHUNKS + 3) + 123);
  assert.ok((await commit(tab(storage), rec, s)).ok);
  const j = new TimelineJournal(storage, new TestWriterLock(), "A"), l = j.load();
  assert.equal(l.kind, "loaded");
  const back = (l as { recorder: TimelineRecorder }).recorder;
  assert.deepEqual(exportTimeline(back, s), exportTimeline(rec, s));
  const before = new Map(storage.writes);
  assert.ok((await commit(j, back, s)).ok);
  for (const [key, n] of storage.writes) if (key !== TIMELINE_JOURNAL_KEY) assert.equal(n, before.get(key), `${key} not rewritten`);
});

test("R1-F1: committing at the full window with 998 or 999 open events and open travel or idle keeps every note exactly once", async () => {
  for (const open of [998, 999]) for (const spans of [["idle"], ["travel"], ["travel", "idle"]]) {
    const label = `${open} open, closing ${spans.join("+")}`;
    const s = createGame(); completeOpening(s);
    const rec = createRecorder({ id: "A", started: STARTED }), storage = new Storage();
    addNote(rec, s, "old note");
    for (let i = 1; i < TIMELINE_CHUNK_EVENTS * TIMELINE_RETAINED_CHUNKS + open - 1; i++) { s.tick += 3; rec.playTicks += 3; recordEvent(rec, s, { kind: "gather", what: "silica_glass", id: "src", quantity: 1 }); }
    addNote(rec, s, "recent note");
    if (spans.includes("travel")) rec.travel = { hull: "dart", vehicleId: "dart_1", last: { x: 0, y: 0, z: 0 }, piece: { tick: s.tick - 600, play: 1, movingTicks: 600, stationaryTicks: 30, metres: 120 } };
    if (spans.includes("idle")) rec.idle = { tick: s.tick - 900, play: 2, waiting: new Set(["decode"]) };
    assert.ok((await commit(tab(storage), rec, s)).ok, label);
    assert.deepEqual([rec.sealed.length, rec.events.length], [TIMELINE_RETAINED_CHUNKS, open], `${label}: the live partition is untouched`);
    assert.deepEqual(allNotes(reloadsWhole(storage, rec, s, label), s), ["old note", "recent note"], label);
  }
});

test("a full quota folds this expedition's oldest chunks first, never dropping a note", async () => {
  const storage = new Storage(), j = tab(storage), { s, rec, add, notes } = session();
  add(TIMELINE_CHUNK_EVENTS * 8 + 50);
  assert.ok((await commit(j, rec, s)).ok);
  storage.quota = storage.used + 20_000;
  let last: TimelineCommit | null = null;
  for (let k = 0; k < 6; k++) { add(TIMELINE_CHUNK_EVENTS); last = await commit(j, rec, s); assert.ok(last.ok, last.ok ? "" : last.error); }
  assert.ok(last?.ok && last.rotated);
  assert.deepEqual(allNotes(rec, s), [...notes].sort());
  reloadsWhole(storage, rec, s, "after folding for quota");
  noOrphans(storage, "after folding for quota");
});

/** Two committed generations of A: the first stored, then more events (sealing chunks) to commit. */
async function twoGenerations() {
  const storage = new Storage(), j = tab(storage), x = session();
  x.add(TIMELINE_CHUNK_EVENTS * 3 + 400);
  assert.ok((await commit(j, x.rec, x.s)).ok);
  const committed = [...x.notes];
  x.add(TIMELINE_CHUNK_EVENTS * 2 + 300);
  return { storage, j, ...x, committed };
}

test("R1-F2: a write failing at any point of a commit leaves the committed timeline readable, every note once (crash images too)", async () => {
  const probe = await twoGenerations();
  probe.storage.failFrom(Infinity, false);
  assert.ok((await commit(probe.j, probe.rec, probe.s)).ok);
  const writes = probe.storage.writeCalls;
  for (const persistent of [false, true]) for (const name of ["QuotaExceededError", "SecurityError"]) for (let at = 0; at < writes + 2; at++) {
    const label = `${persistent ? "every write" : "one write"} failing from write ${at} (${name})`;
    const g = await twoGenerations();
    g.storage.images = [];
    g.storage.failFrom(at, persistent, name);
    const r = await commit(g.j, g.rec, g.s);
    g.storage.failFrom(-1, false);
    keepsCommitted(g.storage, "A", g.committed, g.s, label);
    if (r.ok) reloadsWhole(g.storage, g.rec, g.s, label);
    for (const [k, image] of g.storage.images.entries()) keepsCommitted(Storage.of(image), "A", g.committed, g.s, `${label}, crash image ${k}`);
    assert.ok((await commit(g.j, g.rec, g.s)).ok, `${label}: storage recovered`);
    reloadsWhole(g.storage, g.rec, g.s, `${label}: after recovery`);
    noOrphans(g.storage, `${label}: after recovery`);
  }
});

test("R3-F2: a read failing at any point of a commit never deletes or overwrites committed history (crash images too)", async () => {
  const probe = await twoGenerations();
  probe.storage.failReadsFrom(Infinity, false);
  assert.ok((await commit(probe.j, structuredClone(probe.rec), probe.s)).ok);
  const reads = probe.storage.readCalls;
  assert.ok(reads >= 2, `${reads} reads in a commit`);
  for (const persistent of [false, true]) for (let at = 0; at < reads + 1; at++) {
    const label = `${persistent ? "every read" : "one read"} failing from read ${at}`;
    const g = await twoGenerations();
    g.storage.images = [];
    g.storage.failReadsFrom(at, persistent);
    const r = await commit(g.j, g.rec, g.s);
    g.storage.failReadsFrom(-1, false);
    keepsCommitted(g.storage, "A", g.committed, g.s, label);
    if (r.ok) reloadsWhole(g.storage, g.rec, g.s, label);
    for (const [k, image] of g.storage.images.entries()) keepsCommitted(Storage.of(image), "A", g.committed, g.s, `${label}, crash image ${k}`);
  }
});

test("R2-F2: a rotated export round-trips through resume, commit and load with one numbering, then keeps committing", async () => {
  const s = createGame(), rec = createRecorder({ id: "A", started: STARTED });
  for (let i = 0; i < 23_000; i++) addNote(rec, s, `note ${i}`);
  const parsed = parseTimeline(exportTimelineText(rec, s));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const restored = resumeRecorder(parsed.value), storage = new Storage(), j = tab(storage);
  const numbers = [...restored.rotated.map((r) => r.n), ...restored.sealed.map((c) => c.n)];
  assert.equal(new Set(numbers).size, numbers.length);
  assert.ok((await commit(j, restored, s)).ok);
  assert.equal(allNotes(reloadsWhole(storage, restored, s, "restored"), s).length, 23_000);
  for (let i = 0; i < 1500; i++) addNote(restored, s, `later ${i}`);
  assert.ok((await commit(j, restored, s)).ok);
  reloadsWhole(storage, restored, s, "restored, then appended");
  noOrphans(storage, "restored");
});

// ---- Contract v2 (SIM-1 R4) -------------------------------------------------

test("R4: another expedition moves this one to previous; the older previous goes, said when it held notes; returning swaps back", async () => {
  const storage = new Storage(), a = session("A"), b = session("B"), c = session("C");
  a.add(TIMELINE_CHUNK_EVENTS + 100);
  assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
  b.add(TIMELINE_CHUNK_EVENTS + 100);
  const rb = await commit(tab(storage, "B"), b.rec, b.s);
  assert.deepEqual(rb.dropped, [], "A moves to previous; nothing goes");
  reloadsWhole(storage, a.rec, a.s, "A from previous");
  // Importing A back: A is current again, B previous.
  const ja = new TimelineJournal(storage, new TestWriterLock(), "A"), la = ja.load();
  assert.deepEqual([la.kind, (la as { from?: string }).from], ["loaded", "previous"]);
  const back = (la as { recorder: TimelineRecorder }).recorder;
  addNote(back, a.s, "A again");
  assert.ok((await commit(ja, back, a.s)).ok);
  reloadsWhole(storage, back, a.s, "A current again");
  reloadsWhole(storage, b.rec, b.s, "B now previous");
  // A third expedition: B (previous) goes, and it is said, by its start and play time.
  c.add(50);
  const rc = await commit(tab(storage, "C"), c.rec, c.s);
  assert.equal(rc.ok, true);
  assert.equal(rc.dropped.length, 1);
  assert.equal(rc.dropped[0]!.reason, "replaced");
  assert.equal(rc.dropped[0]!.notes, b.notes.length);
  assert.match(rc.dropped[0]!.label, /^the expedition started .*2026 \(\d+ (h \d+ )?min of play\)$/);
  assert.doesNotMatch(rc.dropped[0]!.label, /\bB\b/, "no IDs");
  assert.equal(new TimelineJournal(storage, new TestWriterLock(), "B").load().kind, "empty");
  reloadsWhole(storage, back, a.s, "A previous");
  noOrphans(storage, "three expeditions");
});

test("R4: under quota, folding comes first, then previous is dropped (with its label), then the commit fails", async () => {
  const storage = new Storage(), a = session("A"), b = session("B");
  a.add(TIMELINE_CHUNK_EVENTS * 2 + 100);
  assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
  const jb = tab(storage, "B");
  b.add(100);
  assert.ok((await commit(jb, b.rec, b.s)).ok);
  storage.quota = storage.used + 5_000;
  b.add(TIMELINE_CHUNK_EVENTS * 3);
  const r = await commit(jb, b.rec, b.s);
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.deepEqual(r.dropped.map((d) => d.reason), ["room"]);
  assert.match(r.dropped[0]!.label, /^the expedition started /);
  assert.equal(r.dropped[0]!.notes, a.notes.length);
  assert.equal(new TimelineJournal(storage, new TestWriterLock(), "A").load().kind, "empty");
  reloadsWhole(storage, b.rec, b.s, "B after dropping A");
  noOrphans(storage, "after dropping A");
  // Nothing left to drop: the commit fails, and B's last commit stands.
  storage.quota = storage.used + 10;
  const committed = allNotes(b.rec, b.s);
  b.add(TIMELINE_CHUNK_EVENTS * 2);
  const f = await commit(jb, b.rec, b.s);
  assert.equal(f.ok, false);
  assert.equal(f.ok ? "" : f.code, "write-refused");
  keepsCommitted(storage, "B", committed, b.s, "B's last commit");
});

test("R4-F1: a tab that loaded before another tab's newer commit conflicts instead of overwriting it", async () => {
  const storage = new Storage(), lock = new TestWriterLock(), x = session("A");
  x.add(200);
  const first = new TimelineJournal(storage, lock, "A");
  first.load();
  assert.ok((await commit(first, x.rec, x.s)).ok);
  // A second tab Continues the same expedition, then the first tab commits newer history.
  const second = new TimelineJournal(storage, lock, "A"), l = second.load();
  const stale = (l as { recorder: TimelineRecorder }).recorder;
  x.add(300);
  assert.ok((await commit(first, x.rec, x.s)).ok);
  addNote(stale, x.s, "stale tab note");
  const r = await commit(second, stale, x.s);
  assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "conflict"]);
  reloadsWhole(storage, x.rec, x.s, "the newer history stands");
  // The first tab keeps committing.
  x.add(100);
  assert.ok((await commit(first, x.rec, x.s)).ok);
});

test("R4-F2: a replaced or disposed writer still waiting for the lock never writes", async () => {
  const storage = new Storage(), lock = new TestWriterLock(), x = session("A");
  x.add(100);
  const j = new TimelineJournal(storage, lock, "A");
  j.load();
  assert.ok((await commit(j, x.rec, x.s)).ok);
  const gate = deferred();
  lock.gate = gate.promise;
  const generation = new AbortController();
  x.add(200);
  const pending = commit(j, x.rec, x.s, generation.signal);
  generation.abort();
  const before = new Map(storage.data);
  gate.resolve(); lock.gate = null;
  const r = await pending;
  assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "cancelled"]);
  assert.deepEqual(new Map(storage.data), before, "nothing mutated");
});

test("R4-F2: a same-session replacement mid-save: the old generation never writes", async () => {
  const storage = new Storage(), lock = new TestWriterLock(), x = session("A");
  x.add(100);
  const old = new TimelineJournal(storage, lock, "A");
  old.load();
  assert.ok((await commit(old, x.rec, x.s)).ok);
  const gate = deferred();
  lock.gate = gate.promise;
  const generation = new AbortController();
  addNote(x.rec, x.s, "old pending note");
  const pending = commit(old, x.rec, x.s, generation.signal);
  // The same expedition is imported: the old generation ends before the new one loads.
  generation.abort();
  const before = new Map(storage.data);
  gate.resolve(); lock.gate = null;
  assert.deepEqual([(await pending).ok], [false]);
  assert.deepEqual(new Map(storage.data), before, "the old generation wrote nothing");
  const fresh = new TimelineJournal(storage, lock, "A"), l = fresh.load(), rec = (l as { recorder: TimelineRecorder }).recorder;
  addNote(rec, x.s, "new recorder note");
  const r = await commit(fresh, rec, x.s);
  assert.ok(r.ok && r.seq === rec.seq, "the commit says which sequence it made durable");
  const back = reloadsWhole(storage, rec, x.s, "after the replacement");
  assert.equal(allNotes(back, x.s).filter((m) => m === "new recorder note").length, 1);
});

test("R4-F5: a lock that rejects or stays pending is reported, and nothing is written; no lock API means read-only", async () => {
  const storage = new Storage(), x = session("A");
  x.add(100);
  const rejecting: WriterLockPort = { runExclusive: () => Promise.reject(new Error("lock refused")) };
  const r = await commit(tab(storage, "A", rejecting), x.rec, x.s);
  assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "lock-failed"]);
  assert.equal(storage.data.size, 0);
  const none = await commit(tab(storage, "A", null), x.rec, x.s);
  assert.deepEqual([none.ok, none.ok ? "" : none.code], [false, "lock-unavailable"]);
  let settledCommit = false;
  const pendingLock: WriterLockPort = { runExclusive: () => new Promise(() => {}) };
  void commit(tab(storage, "A", pendingLock), x.rec, x.s).then(() => { settledCommit = true; });
  await new Promise((done) => setImmediate(done));
  assert.equal(settledCommit, false, "a pending lock stays pending (the app says it is waiting)");
  assert.equal(storage.data.size, 0);
});

test("R4-F4: an unreadable or malformed journal, chunk or version 1 record is protected, never absent", async () => {
  const x = session("A");
  x.add(TIMELINE_CHUNK_EVENTS + 10);
  for (const [label, damage] of [
    ["journal not JSON", (st: Storage) => st.data.set(TIMELINE_JOURNAL_KEY, "{not json")],
    ["journal of another shape", (st: Storage) => st.data.set(TIMELINE_JOURNAL_KEY, JSON.stringify({ format: "other" }))],
    ["chunk missing", (st: Storage) => { for (const k of [...st.data.keys()]) if (k.startsWith("siltwake.timeline.v2|")) st.data.delete(k); }],
    ["version 1 malformed", (st: Storage) => st.data.set(TIMELINE_STORAGE_KEY, "{\"format\":\"siltwake.timeline\",\"version\":1,\"session\":{\"id\":\"A\"")],
  ] as const) {
    const storage = new Storage();
    assert.ok((await commit(tab(storage, "A"), x.rec, x.s)).ok);
    damage(storage);
    const before = new Map(storage.data), j = new TimelineJournal(storage, new TestWriterLock(), "A"), l = j.load();
    assert.equal(l.kind, "protected", label);
    const r = await commit(j, x.rec, x.s);
    assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"], label);
    assert.deepEqual(new Map(storage.data), before, `${label}: nothing written`);
    if (label !== "chunk missing") assert.equal(new TimelineJournal(storage, new TestWriterLock(), "B").load().kind, "protected", `${label}: B too`);
  }
});

test("R4-F6: version 1 migrates into current or previous by its session, and goes only once a committed journal names its replacement", async () => {
  const legacy = session("OLD");
  for (let i = 0; i < 200; i++) addNote(legacy.rec, legacy.s, `legacy ${i}`);
  const v1 = serializeTimeline({ ...exportTimeline(legacy.rec, legacy.s), version: 1 });
  {
    // Its own expedition: into current.
    const storage = new Storage();
    storage.setItem(TIMELINE_STORAGE_KEY, v1);
    const j = new TimelineJournal(storage, new TestWriterLock(), "OLD"), l = j.load();
    assert.deepEqual([l.kind, (l as { from?: string }).from], ["loaded", "v1"]);
    const rec = (l as { recorder: TimelineRecorder }).recorder;
    storage.failFrom(0, true, "SecurityError");
    assert.equal((await commit(j, rec, legacy.s)).ok, false);
    storage.failFrom(-1, false);
    assert.ok(storage.data.get(TIMELINE_STORAGE_KEY), "a failed migration keeps the record");
    assert.equal(allNotes(loaded(storage, "OLD", "still from v1"), legacy.s).length, 200);
    assert.ok((await commit(j, rec, legacy.s)).ok);
    assert.equal(storage.data.get(TIMELINE_STORAGE_KEY), undefined);
    reloadsWhole(storage, rec, legacy.s, "migrated into current");
  }
  {
    // Another expedition starts first: the record migrates into previous.
    const storage = new Storage(), b = session("B");
    storage.setItem(TIMELINE_STORAGE_KEY, v1);
    b.add(50);
    assert.ok((await commit(tab(storage, "B"), b.rec, b.s)).ok);
    assert.equal(storage.data.get(TIMELINE_STORAGE_KEY), undefined);
    assert.equal(allNotes(loaded(storage, "OLD", "migrated into previous"), legacy.s).length, 200);
    reloadsWhole(storage, b.rec, b.s, "B");
  }
  {
    // Under quota, a record that can't migrate stays where it is: never deleted unreplaced.
    const storage = new Storage(), b = session("B");
    storage.setItem(TIMELINE_STORAGE_KEY, v1);
    storage.quota = storage.used + 3_000;
    b.add(10);
    const r = await commit(tab(storage, "B"), b.rec, b.s);
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.equal(storage.data.get(TIMELINE_STORAGE_KEY), v1);
    assert.equal(allNotes(loaded(storage, "OLD", "still in v1"), legacy.s).length, 200);
  }
});

// ---- SIM-1 R5 regressions -------------------------------------------------

test("R5-F4: another expedition's unreadable head or chunk protects the store: never replaced or dropped, through the third-expedition transition", async () => {
  for (const [label, damage] of [
    ["malformed head events", (st: Storage) => { const j = JSON.parse(st.data.get(TIMELINE_JOURNAL_KEY)!); j.current.events = [{ kind: "teleport" }]; st.data.set(TIMELINE_JOURNAL_KEY, JSON.stringify(j)); }],
    ["malformed head chunk list", (st: Storage) => { const j = JSON.parse(st.data.get(TIMELINE_JOURNAL_KEY)!); j.current.chunks = ["x"]; st.data.set(TIMELINE_JOURNAL_KEY, JSON.stringify(j)); }],
    ["malformed chunk JSON", (st: Storage) => { for (const k of st.data.keys()) if (k.startsWith("siltwake.timeline.v2|A|")) st.data.set(k, "[{not json"); }],
    ["missing chunk", (st: Storage) => { for (const k of [...st.data.keys()]) if (k.startsWith("siltwake.timeline.v2|A|")) st.data.delete(k); }],
  ] as const) {
    const storage = new Storage(), a = session("A"), b = session("B"), c = session("C");
    a.add(TIMELINE_CHUNK_EVENTS + 100);
    assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
    damage(storage);
    const before = new Map(storage.data);
    // B, a different expedition, loads protected and writes nothing.
    const jb = new TimelineJournal(storage, new TestWriterLock(), "B");
    assert.equal(jb.load().kind, "protected", `${label}: B loads protected`);
    b.add(50);
    const rb = await commit(jb, b.rec, b.s);
    assert.deepEqual([rb.ok, rb.ok ? "" : rb.code], [false, "protected"], `${label}: B`);
    // C, a third expedition, the same: A is never dropped.
    const jc = new TimelineJournal(storage, new TestWriterLock(), "C");
    assert.equal(jc.load().kind, "protected", `${label}: C loads protected`);
    c.add(10);
    assert.equal((await commit(jc, c.rec, c.s)).ok, false, `${label}: C`);
    assert.deepEqual(new Map(storage.data), before, `${label}: nothing written`);
  }
});

test("R5-F4: a head damaged after it was verified is read whole again before it can be dropped", async () => {
  // Displacement (a third expedition), and a quota drop.
  for (const how of ["displaced", "quota"] as const) {
    const storage = new Storage(), a = session("A"), b = session("B"), c = session("C");
    a.add(TIMELINE_CHUNK_EVENTS + 100);
    assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
    b.add(100);   // nothing of B's own to fold: only dropping A could make room
    const jb = tab(storage, "B");
    assert.ok((await commit(jb, b.rec, b.s)).ok);
    const jc = tab(storage, "C");
    // A's chunk is damaged after B's and C's loads verified it.
    for (const k of storage.data.keys()) if (k.startsWith("siltwake.timeline.v2|A|")) storage.data.set(k, "[{not json");
    const before = new Map(storage.data);
    if (how === "displaced") {
      c.add(10);
      const r = await commit(jc, c.rec, c.s);
      assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"], "C would displace A");
    } else {
      storage.quota = storage.used + 500;
      for (let i = 0; i < 600; i++) addNote(b.rec, b.s, `B note ${i}`);
      const r = await commit(jb, b.rec, b.s);
      assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"], "B would drop A for room");
    }
    assert.deepEqual(new Map(storage.data), before, `${how}: nothing written`);
  }
});

test("R5-F6: a replaced timeline is reported only once a committed journal stops naming it; a quota drop is reported even if the final commit fails", async () => {
  const storage = new Storage(), a = session("A"), b = session("B"), c = session("C");
  a.add(TIMELINE_CHUNK_EVENTS + 50);
  assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
  b.add(TIMELINE_CHUNK_EVENTS + 50);
  assert.ok((await commit(tab(storage, "B"), b.rec, b.s)).ok);
  // C's first write fails: nothing changed, so nothing is reported dropped.
  c.add(50);
  const jc = tab(storage, "C"), before = new Map(storage.data);
  storage.failFrom(0, false, "SecurityError");
  const failedCommit = await commit(jc, c.rec, c.s);
  assert.deepEqual([failedCommit.ok, failedCommit.dropped], [false, []]);
  assert.deepEqual(new Map(storage.data), before);
  reloadsWhole(storage, a.rec, a.s, "A unchanged");
  // Under a quota where only dropping B (previous after A goes) makes the smaller journal fit, and then
  // C still can't: both drops committed, so both are reported, though C's commit fails.
  storage.quota = storage.used + 1_000;
  for (let i = 0; i < 5_000; i++) addNote(c.rec, c.s, `C note ${i}`);   // notes fold into summaries no smaller
  const r = await commit(jc, c.rec, c.s);
  assert.equal(r.ok, false);
  assert.deepEqual(r.dropped.map((d) => d.reason).sort(), ["replaced", "room"]);
  assert.equal(new TimelineJournal(storage, new TestWriterLock(), "A").load().kind, "empty");
  assert.equal(new TimelineJournal(storage, new TestWriterLock(), "B").load().kind, "empty");
});

test("R5: repair replaces a protected store with this timeline, only while its records are exactly the exported ones", async () => {
  const x = session("A"), other = session("Z");
  other.add(TIMELINE_CHUNK_EVENTS + 20);
  for (const conflictFirst of [true, false]) {
    const storage = new Storage();
    assert.ok((await commit(tab(storage, "Z"), other.rec, other.s)).ok);
    storage.data.set(TIMELINE_JOURNAL_KEY, "{not json");
    storage.setItem(TIMELINE_STORAGE_KEY, "{also broken");
    const j = new TimelineJournal(storage, new TestWriterLock(), "A");
    assert.equal(j.load().kind, "protected");
    x.add(TIMELINE_CHUNK_EVENTS + 30);
    const exported = j.records();
    assert.ok(typeof exported !== "string");
    if (typeof exported === "string") return;
    assert.deepEqual([exported.journal, exported.v1], ["{not json", "{also broken"], "the raw bytes, exported first");
    assert.deepEqual(Object.keys(exported.chunks).sort(), [...storage.data.keys()].filter((k) => k.startsWith("siltwake.timeline.v2|")).sort(),
      "every chunk too");
    if (conflictFirst) {
      // Another tab changes the records after the export: the repair is a conflict and writes nothing.
      storage.data.set(TIMELINE_JOURNAL_KEY, "{changed elsewhere");
      const before = new Map(storage.data);
      const r = await j.repair(x.rec, x.s, new AbortController().signal, exported);
      assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "conflict"]);
      assert.deepEqual(new Map(storage.data), before);
      assert.notEqual(j.protection, null, "still protected");
      continue;
    }
    const r = await j.repair(x.rec, x.s, new AbortController().signal, exported);
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.equal(j.protection, null);
    assert.equal(storage.data.get(TIMELINE_STORAGE_KEY), undefined, "the exported version 1 record is gone");
    reloadsWhole(storage, x.rec, x.s, "the repaired store");
    noOrphans(storage, "the repaired store");
    // And it commits as usual from then on.
    x.add(100);
    assert.ok((await commit(j, x.rec, x.s)).ok);
    reloadsWhole(storage, x.rec, x.s, "after the repair");
  }
});

// ---- SIM-1b: the R6 regressions, under the coordinator's rulings --------------

const journalOf = (st: Storage) => JSON.parse(st.data.get(TIMELINE_JOURNAL_KEY)!);
const setJournal = (st: Storage, j: unknown) => st.data.set(TIMELINE_JOURNAL_KEY, JSON.stringify(j));
const chunkKeysOf = (st: Storage, id: string) => [...st.data.keys()].filter((k) => k.startsWith(`siltwake.timeline.v2|${id}|`));

test("R6-F1: a commit never trusts an earlier validation: each commit re-reads the journal and checks every named chunk exists", async () => {
  // (1) A's named chunk removed after A's journal loaded: the next commit protects and writes nothing.
  {
    const storage = new Storage(), a = session("A");
    a.add(TIMELINE_CHUNK_EVENTS + 200);
    const j = tab(storage, "A");
    assert.ok((await commit(j, a.rec, a.s)).ok);
    for (const k of chunkKeysOf(storage, "A")) storage.data.delete(k);
    addNote(a.rec, a.s, "after the damage");
    const before = new Map(storage.data);
    const r = await commit(j, a.rec, a.s);
    assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"]);
    assert.deepEqual(new Map(storage.data), before, "zero mutations");
  }
  // (1b) A chunk damaged in place is never overwritten or masked: a commit that would fold it protects first.
  {
    const storage = new Storage(), a = session("A");
    a.add(TIMELINE_CHUNK_EVENTS + 200);
    const j = tab(storage, "A");
    assert.ok((await commit(j, a.rec, a.s)).ok);
    const [k0] = chunkKeysOf(storage, "A");
    storage.data.set(k0!, "{broken");
    // Fill to the window so the next commit rotates (folds) the damaged chunk.
    a.add(TIMELINE_CHUNK_EVENTS * TIMELINE_RETAINED_CHUNKS);
    const before = new Map(storage.data);
    const r = await commit(j, a.rec, a.s);
    assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"], "folding a damaged chunk protects");
    assert.deepEqual(new Map(storage.data), before, "zero mutations");
  }
  // (2) The stored journal edited behind B's back, commit IDs kept: a conflict, and nothing is collected.
  {
    const storage = new Storage(), a = session("A"), b = session("B");
    a.add(TIMELINE_CHUNK_EVENTS + 50);
    assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
    const jb = tab(storage, "B");
    b.add(50);
    assert.ok((await commit(jb, b.rec, b.s)).ok);
    const edited = journalOf(storage);
    edited.previous.events = [{ kind: "teleport" }];
    edited.previous.chunks = [];
    setJournal(storage, edited);
    const before = new Map(storage.data);
    b.add(20);
    const r = await commit(jb, b.rec, b.s);
    assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "conflict"]);
    assert.deepEqual(new Map(storage.data), before, "A's chunk is not collected");
    assert.equal(new TimelineJournal(storage, new TestWriterLock(), "C").load().kind, "protected", "a fresh reader protects");
  }
  // (3) Quota pressure with a damaged previous: protected before any fold of B's own committed chunk.
  {
    const storage = new Storage(), a = session("A"), b = session("B");
    a.add(TIMELINE_CHUNK_EVENTS + 50);
    assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
    const jb = tab(storage, "B");
    b.add(TIMELINE_CHUNK_EVENTS + 50);   // B holds one sealed chunk of its own
    assert.ok((await commit(jb, b.rec, b.s)).ok);
    for (const k of chunkKeysOf(storage, "A")) storage.data.set(k, "[{not json");
    storage.quota = storage.used + 500;
    for (let i = 0; i < 950; i++) addNote(b.rec, b.s, `B large note ${i} ${"x".repeat(200)}`);
    const before = new Map(storage.data);
    const r = await commit(jb, b.rec, b.s);
    assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"]);
    assert.deepEqual(new Map(storage.data), before, "B's committed chunk was not folded");
  }
});

test("R6-F2: malformed head shapes are protected, never thrown, in either position and from any expedition", async () => {
  const shapes: [string, (h: Record<string, unknown>) => void][] = [
    ["events null", (h) => { h.events = null; }], ["events object", (h) => { h.events = {}; }],
    ["events missing", (h) => { delete h.events; }], ["events empty string", (h) => { h.events = ""; }],
    ["chunks null", (h) => { h.chunks = null; }], ["session missing", (h) => { delete h.session; }],
    ["head a number", () => { /* replaced below */ }],
  ];
  for (const position of ["current", "previous"] as const) for (const [label, damage] of shapes) {
    const storage = new Storage(), a = session("A"), b = session("B");
    a.add(TIMELINE_CHUNK_EVENTS + 20);
    assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
    b.add(20);
    assert.ok((await commit(tab(storage, "B"), b.rec, b.s)).ok);   // A is previous now
    const j = journalOf(storage);
    if (label === "head a number") j[position] = 7; else damage(j[position]);
    setJournal(storage, j);
    const before = new Map(storage.data);
    for (const id of ["A", "B", "C"]) {
      const reader = new TimelineJournal(storage, new TestWriterLock(), id);
      let kind = "";
      assert.doesNotThrow(() => { kind = reader.load().kind; }, `${position} ${label}: ${id} never throws`);
      assert.equal(kind, "protected", `${position} ${label}: ${id}`);
      const x = session(id);
      x.add(5);
      assert.equal((await commit(reader, x.rec, x.s)).ok, false);
    }
    assert.deepEqual(new Map(storage.data), before, `${position} ${label}: nothing written`);
  }
});

test("R6-F3/F4: a refused repair stays protected and can be tried again; the repaired journal supersedes v1, whether or not its removal succeeds", async () => {
  const x = session("A");
  for (let i = 0; i < 30; i++) addNote(x.rec, x.s, `in memory ${i}`);
  for (const refusal of ["QuotaExceededError", "SecurityError"]) {
    const storage = new Storage();
    storage.data.set(TIMELINE_JOURNAL_KEY, "{bad");
    const j = new TimelineJournal(storage, new TestWriterLock(), "A");
    assert.equal(j.load().kind, "protected");
    const exported = j.records() as TimelineRecords;
    storage.failFrom(0, true, refusal);
    const r = await j.repair(x.rec, x.s, new AbortController().signal, exported);
    storage.failFrom(-1, false);
    assert.equal(r.ok, false, refusal);
    assert.notEqual(j.protection, null, `${refusal}: still protected`);
    assert.equal(storage.data.get(TIMELINE_JOURNAL_KEY), "{bad", `${refusal}: nothing replaced`);
    assert.equal((await commit(j, x.rec, x.s)).ok, false, `${refusal}: ordinary commits still refused`);
    const again = await j.repair(x.rec, x.s, new AbortController().signal, exported);
    assert.ok(again.ok, `${refusal}: the retry repairs`);
    assert.equal(j.protection, null);
    reloadsWhole(storage, x.rec, x.s, `${refusal}: repaired`);
  }
  // A malformed v1 that can't be removed after the repair: garbage, not a veto.
  const storage = new Storage();
  storage.data.set(TIMELINE_JOURNAL_KEY, "{bad");
  storage.data.set(TIMELINE_STORAGE_KEY, "{also bad");
  const j = new TimelineJournal(storage, new TestWriterLock(), "A");
  assert.equal(j.load().kind, "protected");
  const exported = j.records() as TimelineRecords;
  const remove = storage.removeItem.bind(storage);
  storage.removeItem = (key: string) => { if (key === TIMELINE_STORAGE_KEY) throw new Error("refused"); remove(key); };
  storage.images = [];
  const r = await j.repair(x.rec, x.s, new AbortController().signal, exported);
  assert.ok(r.ok);
  assert.equal(storage.data.get(TIMELINE_STORAGE_KEY), "{also bad", "the record could not be removed");
  reloadsWhole(storage, x.rec, x.s, "a fresh reader ignores the superseded record");
  // The crash image right after the repair's journal write loads too.
  const afterJournal = storage.images.find((image) => image.get(TIMELINE_JOURNAL_KEY) !== "{bad")!;
  assert.equal(new TimelineJournal(Storage.of(afterJournal), new TestWriterLock(), "A").load().kind, "loaded");
  // A later ordinary commit removes the garbage once removal works.
  storage.removeItem = remove;
  addNote(x.rec, x.s, "after the repair");
  assert.ok((await commit(j, x.rec, x.s)).ok);
  assert.equal(storage.data.get(TIMELINE_STORAGE_KEY), undefined);
});

test("R6-F5: an unreadable journal during a live commit protects; once reads recover, the repair works without a new expedition", async () => {
  const storage = new Storage(), x = session("A"), j = tab(storage, "A");
  addNote(x.rec, x.s, "base");
  assert.ok((await commit(j, x.rec, x.s)).ok);
  addNote(x.rec, x.s, "second");
  storage.failReadsFrom(0, false);
  const r = await commit(j, x.rec, x.s);
  assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"]);
  assert.notEqual(j.protection, null);
  const records = j.records();
  assert.ok(typeof records !== "string", "reads have recovered");
  const fixed = await j.repair(x.rec, x.s, new AbortController().signal, records as TimelineRecords);
  assert.ok(fixed.ok);
  assert.deepEqual(allNotes(loaded(storage, "A", "repaired"), x.s), ["base", "second"]);
});

test("SIM-1b: a note can carry a reference to its saved game state, bounded, through commit, rotation and reload", async () => {
  const storage = new Storage(), x = session("A"), j = tab(storage, "A");
  assert.equal(addNote(x.rec, x.s, "with its save", undefined, "rec2.save|A|1"), null);
  assert.match(addNote(x.rec, x.s, "too long", undefined, "x".repeat(201)) ?? "", /malformed/);
  x.add(TIMELINE_CHUNK_EVENTS * (TIMELINE_RETAINED_CHUNKS + 1));   // the note rotates into a summary
  assert.ok((await commit(j, x.rec, x.s)).ok);
  const back = loaded(storage, "A", "with a save reference");
  const note = [...back.rotated.flatMap((r) => r.kept), ...back.events].find((e) => e.text === "with its save");
  assert.equal(note?.saveRef, "rec2.save|A|1", "kept verbatim through rotation and reload");
  // The parser refuses a malformed reference.
  const text = exportTimelineText(back, x.s).replace('"saveRef":"rec2.save|A|1"', '"saveRef":7');
  assert.equal(parseTimeline(text).ok, false);
});

test("SIM-1b: at the full window a steady commit writes the journal only, and a sealing commit adds one chunk", async () => {
  const storage = new Storage(), x = session("A"), j = tab(storage, "A");
  x.add(TIMELINE_CHUNK_EVENTS * TIMELINE_RETAINED_CHUNKS + 500);
  assert.ok((await commit(j, x.rec, x.s)).ok);
  const whole = exportTimelineText(x.rec, x.s).length;
  const original = storage.setItem.bind(storage);
  /** Records the keys and characters the next commit writes. */
  const written = (): { keys: string[]; chars: number } => {
    const w = { keys: [] as string[], chars: 0 };
    storage.setItem = (k: string, v: string) => { w.keys.push(k); w.chars += v.length; original(k, v); };
    return w;
  };
  let w = written();
  x.add(100);
  assert.ok((await commit(j, x.rec, x.s)).ok);
  assert.deepEqual(w.keys, [TIMELINE_JOURNAL_KEY], "a steady commit writes the journal only");
  assert.ok(w.chars < whole / 10, `a steady commit writes ${w.chars} of the whole export's ${whole} characters`);
  w = written();
  x.add(TIMELINE_CHUNK_EVENTS);
  assert.ok((await commit(j, x.rec, x.s)).ok);
  assert.ok(w.keys.length <= 3, `a sealing commit writes ${w.keys.join(", ")}`);
  assert.ok(w.chars < whole / 4, `a sealing commit writes ${w.chars} of ${whole}`);
});

test("every browser's quota error folds, then fails as write-refused; any other refusal stops after one attempt", async () => {
  const forms: [string, () => Error, boolean][] = [
    ["QuotaExceededError", () => Object.assign(new Error("full"), { name: "QuotaExceededError" }), true],
    ["NS_ERROR_DOM_QUOTA_REACHED", () => Object.assign(new Error("full"), { name: "NS_ERROR_DOM_QUOTA_REACHED" }), true],
    ["code 22", () => Object.assign(new Error("full"), { code: 22 }), true],
    ["code 1014", () => Object.assign(new Error("full"), { code: 1014 }), true],
    ["SecurityError", () => Object.assign(new Error("denied"), { name: "SecurityError" }), false],
  ];
  for (const [label, error, isQuota] of forms) {
    const storage = new Storage(), x = session("A"), j = tab(storage, "A");
    x.add(TIMELINE_CHUNK_EVENTS * 3 + 10);
    let journalWrites = 0;
    const set = storage.setItem.bind(storage);
    storage.setItem = (k: string, v: string) => { if (k === TIMELINE_JOURNAL_KEY) { journalWrites++; throw error(); } set(k, v); };
    const r = await commit(j, x.rec, x.s);
    assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "write-refused"], label);
    if (isQuota) assert.ok(journalWrites > 1 && x.rec.rotated.length > 0, `${label}: folded and retried`);
    else assert.equal(journalWrites, 1, `${label}: one attempt`);
    assert.deepEqual([...storage.data.keys()].filter((k) => k.startsWith("siltwake.timeline.v2|")), [], `${label}: no orphan chunk left`);
  }
});

// ---- SIM-1b R1 regressions ------------------------------------------------

test("R1-F1: a failed repair leaves the exported records whole (v1 and same-session chunks), at every write; a retry still repairs", async () => {
  // (a) A valid version 1 record and an unreadable journal.
  const legacy = session("OLD");
  for (let i = 0; i < 5; i++) addNote(legacy.rec, legacy.s, `legacy ${i}`);
  const v1 = serializeTimeline({ ...exportTimeline(legacy.rec, legacy.s), version: 1 });
  // (b) This expedition's own committed chunk, with a damaged head.
  const ownCase = async (): Promise<Storage> => {
    const storage = new Storage(), a = session("A");
    a.add(TIMELINE_CHUNK_EVENTS + 10);
    assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
    const j = journalOf(storage); j.current.events = null; setJournal(storage, j);
    return storage;
  };
  const cases: [string, () => Promise<Storage>][] = [
    ["v1", async () => { const st = new Storage(); st.data.set(TIMELINE_JOURNAL_KEY, "{bad"); st.setItem(TIMELINE_STORAGE_KEY, v1); return st; }],
    ["same-session chunks", ownCase],
  ];
  for (const [label, make] of cases) for (const name of ["SecurityError", "QuotaExceededError"]) for (let at = 0; at < 6; at++) {
    const storage = await make(), x = session("A");
    x.add(TIMELINE_CHUNK_EVENTS + 40);   // a sealed chunk of its own, numbered like the damaged A's
    const j = new TimelineJournal(storage, new TestWriterLock(), "A");
    assert.equal(j.load().kind, "protected", label);
    const exported = j.records() as TimelineRecords;
    storage.failFrom(at, false, name);
    storage.images = [];
    const r = await j.repair(x.rec, x.s, new AbortController().signal, exported);
    storage.failFrom(-1, false);
    const tag = `${label}, ${name} at write ${at}`;
    if (!r.ok) {
      assert.deepEqual(j.records(), exported, `${tag}: the exported records are untouched`);
      assert.notEqual(j.protection, null, `${tag}: still protected`);
    }
    // Every crash image is either the protected records as exported, or the repaired store.
    for (const image of storage.images) {
      const fresh = new TimelineJournal(Storage.of(image), new TestWriterLock(), "A"), l = fresh.load();
      if (l.kind === "loaded") assert.deepEqual(allNotes(l.recorder, x.s), allNotes(x.rec, x.s), `${tag}: a repaired image`);
      else assert.equal(image.get(TIMELINE_JOURNAL_KEY), exported.journal ?? undefined, `${tag}: an image before the commit point keeps the journal`);
    }
    if (!r.ok) assert.ok((await j.repair(x.rec, x.s, new AbortController().signal, exported)).ok, `${tag}: the retry repairs (no conflict with itself)`);
    reloadsWhole(storage, x.rec, x.s, tag);
    noOrphans(storage, tag);
  }
});

test("R1-F2: hostile and inconsistent records are protected, never thrown and never committed over", async () => {
  const deepArray = "[".repeat(4000) + "]".repeat(4000);
  const shapes: [string, (st: Storage) => void][] = [
    ["v1 version with a null toString", (st) => st.data.set(TIMELINE_STORAGE_KEY, '{"format":"siltwake.timeline","version":{"toString":null}}')],
    ["v1 version nested 4,000 deep", (st) => st.data.set(TIMELINE_STORAGE_KEY, `{"format":"siltwake.timeline","version":${deepArray}}`)],
    ["nextChunk -1", (st) => { const j = journalOf(st); j.current.nextChunk = -1; setJournal(st, j); }],
    ["a chunk number above 2^53", (st) => { const j = journalOf(st); j.current.nextChunk = 2 ** 60; setJournal(st, j); }],
    ["the current property missing", (st) => { const j = journalOf(st); delete j.current; setJournal(st, j); }],
    ["the previous property missing", (st) => { const j = journalOf(st); delete j.previous; setJournal(st, j); }],
    ["an event with a field nested 4,000 deep", (st) => {
      const [k] = chunkKeysOf(st, "A"), events = JSON.parse(st.data.get(k!)!);
      events[0].extra = "__DEEP__";
      st.data.set(k!, JSON.stringify(events).replace('"__DEEP__"', deepArray));
    }],
  ];
  for (const [label, damage] of shapes) {
    const storage = new Storage(), a = session("A");
    a.add(TIMELINE_CHUNK_EVENTS + 5);
    assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
    damage(storage);
    const before = new Map(storage.data);
    for (const id of ["A", "B"]) {
      const j = new TimelineJournal(storage, new TestWriterLock(), id);
      let kind = "";
      assert.doesNotThrow(() => { kind = j.load().kind; }, `${label}: ${id}`);
      assert.equal(kind, "protected", `${label}: ${id}`);
      const x = session(id);
      x.add(TIMELINE_CHUNK_EVENTS);
      assert.equal((await commit(j, x.rec, x.s)).ok, false, `${label}: ${id} never commits over it`);
    }
    assert.deepEqual(new Map(storage.data), before, `${label}: zero writes`);
  }
});

test("R1-F3: a malformed summary in a chunk about to fold is caught by the one chunk validator, with zero mutations", async () => {
  for (const [label, bad] of [["kept only", '{"kept":[]}'], ["a kept note's saveRef a number", ""]] as const) {
    const storage = new Storage(), a = session("A");
    a.add(TIMELINE_CHUNK_EVENTS * TIMELINE_RETAINED_CHUNKS + 10);
    const j = tab(storage, "A");
    assert.ok((await commit(j, a.rec, a.s)).ok);
    const [k0] = chunkKeysOf(storage, "A").sort((x, y) => Number(x.split("|")[2]) - Number(y.split("|")[2]));
    if (bad) storage.data.set(k0!, bad);
    else {
      const sum = summarizeChunk(JSON.parse(storage.data.get(k0!)!));
      sum.kept.push({ kind: "note", tick: 1, play: 0, text: "x", saveRef: 7 as unknown as string });
      storage.data.set(k0!, JSON.stringify(sum));
    }
    a.add(TIMELINE_CHUNK_EVENTS);   // rotates chunk 0: the commit would fold it
    const before = new Map(storage.data);
    const r = await commit(j, a.rec, a.s);
    assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"], label);
    assert.deepEqual(new Map(storage.data), before, `${label}: zero mutations`);
  }
});

test("R1-F4: under quota, every chunk the plan may fold and the previous head are read before the first committed-chunk change", async () => {
  // (1) A full-window B whose ordinary rotation is planned on entry, with a damaged previous A.
  {
    const storage = new Storage(), a = session("A"), b = session("B");
    a.add(TIMELINE_CHUNK_EVENTS + 10);
    assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
    const jb = tab(storage, "B");
    b.add(TIMELINE_CHUNK_EVENTS * TIMELINE_RETAINED_CHUNKS + 10);
    assert.ok((await commit(jb, b.rec, b.s)).ok);
    for (const k of chunkKeysOf(storage, "A")) storage.data.set(k, "[{not json");
    b.add(TIMELINE_CHUNK_EVENTS);
    storage.quota = storage.used + 500;
    const before = new Map(storage.data);
    const r = await commit(jb, b.rec, b.s);
    assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"], "full window");
    assert.deepEqual(new Map(storage.data), before, "full window: B's committed chunks unchanged");
  }
  // (2) Damage beyond the first fold target: chunk 1 of three.
  {
    const storage = new Storage(), a = session("A"), j = tab(storage, "A");
    a.add(TIMELINE_CHUNK_EVENTS * 3 + 10);
    assert.ok((await commit(j, a.rec, a.s)).ok);
    const keys = chunkKeysOf(storage, "A").sort((x, y) => Number(x.split("|")[2]) - Number(y.split("|")[2]));
    storage.data.set(keys[1]!, "[{not json");
    for (let i = 0; i < 900; i++) addNote(a.rec, a.s, `large ${i} ${"x".repeat(200)}`);
    storage.quota = storage.used + 100;
    const before = new Map(storage.data);
    const r = await commit(j, a.rec, a.s);
    assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"], "damage beyond the first fold");
    assert.deepEqual(new Map(storage.data), before, "damage beyond the first fold: zero mutations");
  }
});

test("R1-F4: a steady commit changes no committed chunk before its journal; a fold left unwritten is the same history", async () => {
  const storage = new Storage(), a = session("A"), j = tab(storage, "A");
  a.add(TIMELINE_CHUNK_EVENTS * TIMELINE_RETAINED_CHUNKS + 10);
  assert.ok((await commit(j, a.rec, a.s)).ok);
  a.add(TIMELINE_CHUNK_EVENTS);   // rotates chunk 0
  const order: string[] = [];
  const set = storage.setItem.bind(storage);
  // Refuse the fold itself: the journal is already committed.
  storage.setItem = (k: string, v: string) => { order.push(k); if (k.endsWith("|0") && !v.startsWith("[")) throw new Error("refused"); set(k, v); };
  const r = await commit(j, a.rec, a.s);
  assert.ok(r.ok, "the commit point is the journal");
  assert.ok(order.indexOf(TIMELINE_JOURNAL_KEY) < order.findIndex((k) => k.endsWith("|0")), "the fold comes after the journal");
  reloadsWhole(storage, a.rec, a.s, "a fold left unwritten");
});

test("R1-F1: a repair never stages a chunk under a number the old journal names, even when that key is gone (model seed 66769815)", async () => {
  // Two named chunks, the higher one gone; a one-chunk replacement would reuse its number if only existing keys were avoided.
  const storage = new Storage(), a = session("A");
  a.add(TIMELINE_CHUNK_EVENTS * 2);
  assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
  const named: number[] = journalOf(storage).current.chunks;
  storage.data.delete(chunkKeysOf(storage, "A").find((k) => k.endsWith(`|${Math.max(...named)}`))!);
  const j = new TimelineJournal(storage, new TestWriterLock(), "A");
  assert.equal(j.load().kind, "protected");
  const x = session("A");
  x.add(TIMELINE_CHUNK_EVENTS);
  const writes: string[] = [];
  const set = storage.setItem.bind(storage);
  storage.setItem = (k: string, v: string) => { writes.push(k); set(k, v); };
  assert.ok((await j.repair(x.rec, x.s, new AbortController().signal, j.records() as TimelineRecords)).ok);
  for (const n of named) assert.ok(!writes.includes(`siltwake.timeline.v2|A|${n}`), `staged under ${n}, which the old journal names`);
  reloadsWhole(storage, x.rec, x.s, "repaired");
});

/** One wrong known field on an otherwise-valid event (SIM-1b R2 F1). */
const WRONG_FIELD: [string, (e: Record<string, unknown>) => void][] = [
  ["text an object", (e) => { e.text = { bad: "not text" }; }],
  ["what a number", (e) => { e.what = 3; }],
  ["id null", (e) => { e.id = null; }],
  ["label a list", (e) => { e.label = ["x"]; }],
  ["quantity a string", (e) => { e.quantity = "2"; }],
  ["region a number", (e) => { e.region = 4; }],
  ["seconds null", (e) => { e.seconds = null; }],
  ["stationary a string", (e) => { e.stationary = "1"; }],
  ["metres an object", (e) => { e.metres = {}; }],
  ["hull a number", (e) => { e.hull = 1; }],
  ["waiting holding a number", (e) => { e.waiting = ["decode", 1]; }],
  ["keys a string", (e) => { e.keys = "cache:x"; }],
  ["of a string", (e) => { e.of = "10"; }],
  ["wall a number", (e) => { e.wall = 0; }],
  ["at two numbers", (e) => { e.at = [1, 2]; }],
  ["saveRef a number", (e) => { e.saveRef = 7; }],
];
/** One wrong member of a summary's stretch lists. */
const WRONG_STRETCH: [string, (sum: { travel: { long: unknown[] }; idle: { long: unknown[] } }) => void][] = [
  ["travel.long [null]", (sum) => { sum.travel.long = [null]; }],
  ["a travel stretch without its hull", (sum) => { sum.travel.long = [{ play: 1, seconds: 400, region: null }]; }],
  ["an idle stretch waiting on a number", (sum) => { sum.idle.long = [{ play: 1, tick: 60, seconds: 900, waiting: [3], region: null }]; }],
  ["idle.long a valid stretch then a string", (sum) => { sum.idle.long = [{ play: 1, tick: 60, seconds: 900, waiting: [], region: null }, "x"]; }],
];

test("SIM-1b R2-F1: one wrong known field in an ordinary or kept event, or one bad stretch, protects with stored bytes unchanged", async () => {
  const cases: { label: string; where: "events" | "kept" | "stretch"; damage(chunk: unknown): void }[] = [
    ...WRONG_FIELD.map(([label, f]) => ({ label, where: "events" as const, damage: (c: unknown) => f((c as Record<string, unknown>[]).find((e) => e.kind === "note")!) })),
    ...WRONG_FIELD.map(([label, f]) => ({ label, where: "kept" as const, damage: (c: unknown) => f((c as { kept: Record<string, unknown>[] }).kept.find((e) => e.kind === "note")!) })),
    ...WRONG_STRETCH.map(([label, f]) => ({ label, where: "stretch" as const, damage: (c: unknown) => f(c as never) })),
  ];
  for (const { label, where, damage } of cases) {
    const name = `${where}: ${label}`;
    const storage = new Storage(), a = session("A"), writer = tab(storage, "A");
    a.add(TIMELINE_CHUNK_EVENTS + 10);
    if (where !== "events") rotateOldest(a.rec);
    assert.ok((await commit(writer, a.rec, a.s)).ok, name);
    const key = chunkKeysOf(storage, "A").find((k) => k.endsWith("|0"))!;
    const chunk = JSON.parse(storage.data.get(key)!);
    assert.equal(Array.isArray(chunk), where === "events", `${name}: stored as ${where === "events" ? "events" : "a summary"}`);
    damage(chunk);
    storage.data.set(key, JSON.stringify(chunk));
    const before = new Map(storage.data);
    const fresh = new TimelineJournal(storage, new TestWriterLock(), "A").load();
    assert.equal(fresh.kind, "protected", `${name}: a fresh reader protects`);
    assert.deepEqual(new Map(storage.data), before, `${name}: the read changes nothing`);
    // The open writer folding a damaged chunk refuses; one never touching it leaves it as it is.
    if (where === "events") {
      rotateOldest(a.rec);
      const r = await commit(writer, a.rec, a.s);
      assert.deepEqual([r.ok, r.ok ? "" : r.code], [false, "protected"], `${name}: the fold refuses`);
      assert.deepEqual(new Map(storage.data), before, `${name}: zero mutations`);
    } else {
      a.add(5);
      await commit(writer, a.rec, a.s);
      assert.equal(storage.data.get(key), before.get(key), `${name}: the damaged summary is left as it is`);
    }
  }
});

test("SIM-1b R2-F1: legitimate records still load: repeated note text, null regions, every optional field well formed", async () => {
  const storage = new Storage(), a = session("A");
  addNote(a.rec, a.s, "same words"); addNote(a.rec, a.s, "same words", "2026-10-24T00:00:00.000Z", "save:ref");
  recordEvent(a.rec, a.s, { kind: "travel", seconds: 400, stationary: 2, metres: 900, hull: "dart", id: "dart_1" });
  recordEvent(a.rec, a.s, { kind: "idle", seconds: 900, waiting: ["decode"] });
  recordEvent(a.rec, a.s, { kind: "death", keys: ["cache:x"], at: [1, 2, 3] });
  a.add(TIMELINE_CHUNK_EVENTS + 10);
  rotateOldest(a.rec);
  assert.ok((await commit(tab(storage, "A"), a.rec, a.s)).ok);
  const back = reloadsWhole(storage, a.rec, a.s, "well formed");
  assert.equal(allNotes(back, a.s).filter((n) => n === "same words").length, 2);
});