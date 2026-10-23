/** SIM-05: the timeline in local storage is append-only and never loses a note. */
import test from "node:test";
import assert from "node:assert/strict";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";
import { addNote, createRecorder, exportTimeline, recordEvent, TIMELINE_CHUNK_EVENTS, TIMELINE_RETAINED_CHUNKS,
  TIMELINE_STORAGE_KEY } from "../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import { analyseTimeline, serializeTimeline } from "../src/sim/timeline/report.js";
import type { TimelineEvent } from "../src/sim/timeline/report.js";
import { TIMELINE_HEAD_KEY, TimelineStore } from "../src/sim/timeline/store.js";
import type { TimelineStoragePort } from "../src/sim/timeline/store.js";

const SESSION = { id: "store-session", started: "2026-10-23T10:00:00.000Z", build: "test" };
/** localStorage with a byte quota (UTF-16 code units, like the browser's). */
class Storage implements TimelineStoragePort {
  readonly data = new Map<string, string>();
  readonly writes = new Map<string, number>();
  written = 0;
  constructor(public quota = Infinity) {}
  /** Fault injection: the `failAt`th write from now throws (a quota error by default);
   * with `failing` set, so does every later one. */
  failAt = -1;
  failing = false;
  failName = "QuotaExceededError";
  private calls = 0;
  failFrom(at: number, persistent: boolean, name = "QuotaExceededError"): void { this.failAt = at; this.failing = persistent; this.failName = name; this.calls = 0; }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  used = 0;
  private size(key: string): number { const v = this.data.get(key); return v === undefined ? 0 : key.length + v.length; }
  setItem(key: string, value: string): void {
    const call = this.calls++;
    if (this.failAt >= 0 && (call === this.failAt || (this.failing && call > this.failAt))) {
      const e = new Error("injected"); e.name = this.failName; throw e;
    }
    if (this.used - this.size(key) + key.length + value.length > this.quota) {
      const e = new Error("quota"); e.name = "QuotaExceededError"; throw e;
    }
    this.used += key.length + value.length - this.size(key);
    this.data.set(key, value);
    this.writes.set(key, (this.writes.get(key) ?? 0) + 1);
    this.written += value.length;
  }
  removeItem(key: string): void { this.used -= this.size(key); this.data.delete(key); }
}
function session(): { s: GameState; rec: TimelineRecorder; add(n: number): void; notes: string[] } {
  const s = createGame();
  completeOpening(s);
  const rec = createRecorder(SESSION), notes: string[] = [];
  let i = 0;
  const add = (n: number): void => {
    for (const end = i + n; i < end; i++) {
      s.tick += 30;
      rec.playTicks += 30;
      if (i % 37 === 0) { addNote(rec, s, `note ${i}`); notes.push(`note ${i}`); }
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

test("each chunk is written once, and once more as its summary when it rotates; a save rewrites only the small head", () => {
  const storage = new Storage(), store = new TimelineStore(storage), { s, rec, add } = session();
  for (let k = 0; k < 30; k++) { add(TIMELINE_CHUNK_EVENTS); assert.notEqual(store.save(rec, s), "failed"); }
  const chunks = [...storage.writes].filter(([key]) => key !== TIMELINE_HEAD_KEY);
  assert.equal(chunks.length, 30, "one key per chunk");
  const summaries = [...storage.data].filter(([k, v]) => k !== TIMELINE_HEAD_KEY && !v.startsWith("["));
  assert.equal(summaries.length, rec.rotated.length);
  assert.equal([...storage.data.keys()].length - 1 - summaries.length, TIMELINE_RETAINED_CHUNKS, "the retained window in full");
  for (const [key, n] of chunks) assert.equal(n, summaries.some(([k]) => k === key) ? 2 : 1, `${key}: events once, then its summary once`);
  assert.equal(storage.writes.get(TIMELINE_HEAD_KEY), 30);
  const head = storage.getItem(TIMELINE_HEAD_KEY)!.length, whole = serializeTimeline(exportTimeline(rec, s)).length;
  assert.ok(head < whole / 5, `the head (${head}) is a fraction of the whole timeline (${whole})`);
});

test("a reload resumes exactly, keeps the chunk keys, and the next save writes only the head", () => {
  const storage = new Storage(), { s, rec, add } = session();
  add(TIMELINE_CHUNK_EVENTS * (TIMELINE_RETAINED_CHUNKS + 3) + 123);
  assert.equal(new TimelineStore(storage).save(rec, s), "saved");
  const store = new TimelineStore(storage), loaded = store.load(SESSION.id)!;
  assert.ok(loaded);
  assert.deepEqual(exportTimeline(loaded, s), exportTimeline(rec, s));
  const before = new Map(storage.writes);
  assert.equal(store.save(loaded, s), "saved");
  for (const [key, n] of storage.writes) if (key !== TIMELINE_HEAD_KEY) assert.equal(n, before.get(key), `${key} not rewritten`);
});

test("a full quota rotates old chunks into summaries, never dropping a note", () => {
  const storage = new Storage(), store = new TimelineStore(storage), { s, rec, add, notes } = session();
  add(TIMELINE_CHUNK_EVENTS * 8 + 50);
  assert.equal(store.save(rec, s), "saved");
  storage.quota = storage.used + 20_000;
  let outcome = "saved";
  for (let k = 0; k < 6; k++) { add(TIMELINE_CHUNK_EVENTS); outcome = store.save(rec, s); assert.notEqual(outcome, "failed"); }
  assert.equal(outcome, "rotated");
  assert.ok(rec.rotated.length > 0 && rec.sealed.length < 8);
  assert.deepEqual(allNotes(rec, s), notes, "every note, in memory");
  const loaded = new TimelineStore(storage).load(SESSION.id)!;
  assert.deepEqual(allNotes(loaded, s), notes, "every note, after a reload");
});

test("when even the head cannot be stored, the save says so and the timeline stays whole in memory", () => {
  const storage = new Storage(10), store = new TimelineStore(storage), { s, rec, add, notes } = session();
  add(500);
  assert.equal(store.save(rec, s), "failed");
  assert.deepEqual(allNotes(rec, s), notes);
});

test("a version 1 timeline migrates at the first save; another session's timeline is replaced", () => {
  const storage = new Storage(), { s, rec, add } = session();
  add(700);
  storage.setItem(TIMELINE_STORAGE_KEY, serializeTimeline({ ...exportTimeline(rec, s), version: 1 }));
  const store = new TimelineStore(storage), migrated = store.load(SESSION.id)!;
  assert.deepEqual(exportTimeline(migrated, s).events, exportTimeline(rec, s).events);
  assert.equal(store.save(migrated, s), "saved");
  assert.equal(storage.getItem(TIMELINE_STORAGE_KEY), null, "the old key is gone once the new store holds the timeline");
  // A different session: nothing resumes, and its first save clears the old chunks.
  for (let i = 0; i < TIMELINE_CHUNK_EVENTS * 2; i++) recordEvent(migrated, s, { kind: "poi", what: "source", id: "src" });
  store.save(migrated, s);
  assert.ok([...storage.data.keys()].length > 2, "chunks on disk");
  const other = new TimelineStore(storage);
  assert.equal(other.load("another-session"), null);
  const fresh = createRecorder({ ...SESSION, id: "another-session" });
  assert.equal(other.save(fresh, s), "saved");
  assert.deepEqual([...storage.data.keys()], [TIMELINE_HEAD_KEY]);
});

// ---- SIM-1 R1 regressions -------------------------------------------------

/** Each note exactly once, oldest first (SIM-05). */
const once = (notes: readonly string[]) => assert.equal(new Set(notes).size, notes.length, `a note repeats: ${notes.join(", ")}`);

test("R1-F1: saving at the full window with 998 or 999 open events and open travel or idle keeps every note exactly once", () => {
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
    const before = exportTimeline(rec, s);
    assert.equal(new TimelineStore(storage).save(rec, s), "saved", label);
    // Saving leaves the live partition alone; the closing spans join only the stored open chunk.
    assert.equal(rec.sealed.length, TIMELINE_RETAINED_CHUNKS, label);
    assert.equal(rec.events.length, open, label);
    assert.ok(rec.travel || !spans.includes("travel"));
    const loaded = new TimelineStore(storage).load(SESSION.id)!;
    assert.ok(loaded, label);
    const notes = allNotes(loaded, s);
    assert.deepEqual(notes, ["old note", "recent note"], label);
    once(notes);
    const a = analyseTimeline(exportTimeline(loaded, s)), b = analyseTimeline(before);
    for (const key of ["newCount", "gathering", "notes", "deaths"] as const) assert.deepEqual(a[key], b[key], `${label}: ${key}`);
    assert.deepEqual([a.travel.count, a.travel.minutes, a.idle.count, a.idle.minutes], [b.travel.count, b.travel.minutes, b.idle.count, b.idle.minutes], label);
  }
});

/** Two committed generations' worth of a session: the first saved, then more events (sealing chunks) to save. */
function twoGenerations(): { storage: Storage; store: TimelineStore; s: GameState; rec: TimelineRecorder; add(n: number): void; notes: string[]; committed: string[] } {
  const storage = new Storage(), store = new TimelineStore(storage), x = session();
  x.add(TIMELINE_CHUNK_EVENTS * 3 + 400);
  assert.equal(store.save(x.rec, x.s), "saved");
  const committed = [...x.notes];
  x.add(TIMELINE_CHUNK_EVENTS * 2 + 300);
  return { storage, store, ...x, committed };
}

test("R1-F2: a write failing at any point of a save leaves the committed timeline readable, every note once", () => {
  const probe = twoGenerations();
  probe.storage.failFrom(Infinity, false);
  assert.equal(probe.store.save(probe.rec, probe.s), "saved");
  const writes = (probe.storage as unknown as { calls: number }).calls;
  assert.ok(writes >= 3, `${writes} writes in the save`);
  for (const persistent of [false, true]) for (const name of ["QuotaExceededError", "SecurityError"]) for (let at = 0; at < writes + 2; at++) {
    const label = `${persistent ? "every write" : "one write"} failing from write ${at} (${name})`;
    const g = twoGenerations();
    g.storage.failFrom(at, persistent, name);
    const result = g.store.save(g.rec, g.s);
    const loaded = new TimelineStore(g.storage).load(SESSION.id);
    assert.ok(loaded, `${label}: a fresh reader finds a timeline`);
    const notes = allNotes(loaded!, g.s);
    once(notes);
    for (const n of g.committed) assert.ok(notes.includes(n), `${label}: committed ${n} survives`);
    if (result !== "failed") assert.deepEqual(notes, g.notes, `${label}: a successful save holds every note`);
    // Memory never loses a note either way.
    assert.deepEqual(allNotes(g.rec, g.s), g.notes, label);
    // And once the storage recovers, the next save commits everything.
    g.storage.failFrom(-1, false);
    assert.notEqual(g.store.save(g.rec, g.s), "failed", label);
    assert.deepEqual(allNotes(new TimelineStore(g.storage).load(SESSION.id)!, g.s), g.notes, `${label}: after recovery`);
  }
});

test("R1-F2: a quota too small for new notes fails the save but keeps every committed note (the review's case)", () => {
  const s = createGame(), rec = createRecorder(SESSION), storage = new Storage(), store = new TimelineStore(storage);
  for (let i = 0; i < 1000; i++) addNote(rec, s, `previously saved note ${i}`);
  assert.equal(store.save(rec, s), "saved");
  storage.quota = storage.used + 100;
  for (let i = 0; i < 1000; i++) addNote(rec, s, `new note ${i}`);
  assert.equal(store.save(rec, s), "failed");
  const notes = allNotes(new TimelineStore(storage).load(SESSION.id)!, s);
  assert.equal(notes.length, 1000);
  assert.ok(notes.every((n) => n.startsWith("previously saved note")));
  assert.equal(allNotes(rec, s).length, 2000, "every note in memory, for export");
});

test("R1-F2: a failed version 1 migration keeps the version 1 record, and a later one replaces it", () => {
  const s = createGame(), rec = createRecorder(SESSION), storage = new Storage();
  for (let i = 0; i < 1000; i++) addNote(rec, s, `legacy note ${i}`);
  storage.setItem(TIMELINE_STORAGE_KEY, serializeTimeline({ ...exportTimeline(rec, s), version: 1 }));
  storage.quota = storage.used;
  const store = new TimelineStore(storage), loaded = store.load(SESSION.id)!;
  for (let i = 0; i < 1000; i++) addNote(loaded, s, `new note ${i}`);
  assert.equal(store.save(loaded, s), "failed");
  assert.ok(storage.getItem(TIMELINE_STORAGE_KEY), "the version 1 record stays until a version 2 head is stored");
  assert.equal(allNotes(new TimelineStore(storage).load(SESSION.id)!, s).length, 1000);
  storage.quota = Infinity;
  assert.equal(store.save(loaded, s), "saved");
  assert.equal(storage.getItem(TIMELINE_STORAGE_KEY), null);
  assert.equal(allNotes(new TimelineStore(storage).load(SESSION.id)!, s).length, 2000);
});
