/** SIM-05: the timeline in local storage is append-only and never loses a note. */
import test from "node:test";
import assert from "node:assert/strict";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";
import { addNote, createRecorder, exportTimeline, recordEvent, TIMELINE_CHUNK_EVENTS, TIMELINE_RETAINED_CHUNKS,
  TIMELINE_STORAGE_KEY } from "../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import { serializeTimeline } from "../src/sim/timeline/report.js";
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
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  used = 0;
  private size(key: string): number { const v = this.data.get(key); return v === undefined ? 0 : key.length + v.length; }
  setItem(key: string, value: string): void {
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

test("each sealed chunk is written once; a save rewrites only the small head", () => {
  const storage = new Storage(), store = new TimelineStore(storage), { s, rec, add } = session();
  for (let k = 0; k < 30; k++) { add(TIMELINE_CHUNK_EVENTS); assert.notEqual(store.save(rec, s), "failed"); }
  const chunks = [...storage.writes].filter(([key]) => key !== TIMELINE_HEAD_KEY);
  assert.ok(chunks.length >= TIMELINE_RETAINED_CHUNKS, `${chunks.length} chunks written`);
  assert.ok(chunks.every(([, n]) => n === 1), "append-only: no chunk is rewritten");
  assert.equal(storage.writes.get(TIMELINE_HEAD_KEY), 30);
  // Rotated chunks leave storage; what's left is the retained window.
  assert.equal([...storage.data.keys()].filter((k) => k !== TIMELINE_HEAD_KEY).length, TIMELINE_RETAINED_CHUNKS);
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
