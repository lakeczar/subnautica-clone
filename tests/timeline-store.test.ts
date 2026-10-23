/** SIM-05: the play timeline in local storage, kept like the save slot: one
 * journal record (current and previous heads) is the commit point, commits run
 * inside the writer lock with observed-record conflict detection, and no note
 * is lost (SIM-1 R1–R4). */
import test from "node:test";
import assert from "node:assert/strict";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";
import { addNote, createRecorder, exportTimeline, exportTimelineText, recordEvent, resumeRecorder, TIMELINE_CHUNK_EVENTS,
  TIMELINE_RETAINED_CHUNKS, TIMELINE_STORAGE_KEY } from "../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import { analyseTimeline, parseTimeline, serializeTimeline } from "../src/sim/timeline/report.js";
import type { TimelineEvent } from "../src/sim/timeline/report.js";
import { TIMELINE_JOURNAL_KEY, TimelineJournal } from "../src/sim/timeline/store.js";
import type { TimelineCommit, TimelineStoragePort } from "../src/sim/timeline/store.js";
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

test("R4-F2: a same-session replacement mid-save: the old generation never writes, and its notes come back from the outbox", async () => {
  const storage = new Storage(), lock = new TestWriterLock(), x = session("A");
  x.add(100);
  const old = new TimelineJournal(storage, lock, "A");
  old.load();
  assert.ok((await commit(old, x.rec, x.s)).ok);
  const gate = deferred();
  lock.gate = gate.promise;
  const generation = new AbortController();
  addNote(x.rec, x.s, "old pending note");
  old.stash(x.rec);
  const pending = commit(old, x.rec, x.s, generation.signal);
  // The same expedition is imported: the old generation ends; a new one loads.
  generation.abort();
  gate.resolve(); lock.gate = null;
  assert.equal((await pending).ok, false);
  const fresh = new TimelineJournal(storage, lock, "A"), l = fresh.load(), rec = (l as { recorder: TimelineRecorder }).recorder;
  assert.ok(allNotes(rec, x.s).includes("old pending note"), "the outbox note is merged");
  addNote(rec, x.s, "new recorder note");
  assert.ok((await commit(fresh, rec, x.s)).ok);
  const back = reloadsWhole(storage, rec, x.s, "after the replacement");
  for (const n of ["old pending note", "new recorder note"]) assert.equal(allNotes(back, x.s).filter((m) => m === n).length, 1, n);
  assert.deepEqual([...storage.data.keys()].filter((k) => k.startsWith("siltwake.timeline.v2.notes|")), [], "outboxes cleared once committed");
});

test("R4-F2: a note outlives a close before its commit (the outbox)", async () => {
  const storage = new Storage(), x = session("A"), j = tab(storage, "A");
  x.add(100);
  assert.ok((await commit(j, x.rec, x.s)).ok);
  addNote(x.rec, x.s, "written, then the page closed");
  j.stash(x.rec);
  // No commit: the page is gone. The next load has the note.
  assert.ok(allNotes(loaded(storage, "A", "after the close"), x.s).includes("written, then the page closed"));
  // So does a load where the expedition never committed at all.
  const y = session("B"), jy = tab(storage, "B");
  addNote(y.rec, y.s, "B's only note");
  jy.stash(y.rec);
  const fresh = createRecorder({ id: "B", started: STARTED });
  new TimelineJournal(storage, new TestWriterLock(), "B").adopt(fresh);
  assert.deepEqual(allNotes(fresh, y.s), ["B's only note"]);
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
  assert.equal(settledCommit, false, "a pending lock stays pending (the app says so once saves queue behind it)");
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
