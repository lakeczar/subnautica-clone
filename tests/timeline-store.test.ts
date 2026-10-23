/** SIM-05: the timeline in local storage is append-only and never loses a note,
 * through failures, restarts and session changes (SIM-1 R1, R2). */
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
import { headKey, STALE_MS, TIMELINE_PREFIX, TimelineStore } from "../src/sim/timeline/store.js";
import type { TimelineStoragePort } from "../src/sim/timeline/store.js";

const SESSION = { id: "store-session", started: "2026-10-23T10:00:00.000Z", build: "test" };
/** localStorage: a byte quota (UTF-16 code units, like the browser's), key
 * enumeration, write fault injection and a copy of itself after every mutation. */
class Storage implements TimelineStoragePort {
  readonly data = new Map<string, string>();
  readonly writes = new Map<string, number>();
  used = 0;
  constructor(public quota = Infinity) {}
  /** The `failAt`th write from now throws; with `failing`, so does every later one. */
  private failAt = -1;
  private failing = false;
  private failName = "QuotaExceededError";
  writeCalls = 0;
  failFrom(at: number, persistent: boolean, name = "QuotaExceededError"): void {
    this.failAt = at; this.failing = persistent; this.failName = name; this.writeCalls = 0;
  }
  /** When set, receives a copy of the storage after each successful mutation. */
  images: Map<string, string>[] | null = null;
  static of(image: ReadonlyMap<string, string>): Storage {
    const s = new Storage();
    for (const [k, v] of image) s.setItem(k, v);
    s.writes.clear();
    return s;
  }
  get length(): number { return this.data.size; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
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
    this.images?.push(new Map(this.data));
  }
  removeItem(key: string): void {
    this.used -= this.size(key);
    this.data.delete(key);
    this.images?.push(new Map(this.data));
  }
  /** Keys of one session's timeline. */
  sessionKeys(id: string): string[] { return [...this.data.keys()].filter((k) => k.startsWith(`${TIMELINE_PREFIX}${encodeURIComponent(id)}|`)); }
}
/** A clock the tests move by hand. */
const clock = (): { now: () => number; advance(ms: number): void } => {
  let t = Date.parse("2026-10-23T12:00:00.000Z");
  return { now: () => t, advance: (ms) => { t += ms; } };
};
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
/** After a successful save: a fresh store reloads every note once, with matching analysis totals. */
function reloadsWhole(storage: Storage, rec: TimelineRecorder, s: GameState, label: string): TimelineRecorder {
  const loaded = new TimelineStore(storage).load(rec.session.id);
  assert.ok(loaded, `${label}: a fresh reader finds the timeline`);
  const notes = allNotes(loaded!, s);
  once(notes, label);
  assert.deepEqual(notes, allNotes(rec, s), `${label}: every note`);
  const a = analyseTimeline(exportTimeline(loaded!, s)), b = analyseTimeline(exportTimeline(rec, s));
  for (const key of ["newCount", "gathering", "notes", "deaths", "travel", "idle"] as const) assert.deepEqual(a[key], b[key], `${label}: ${key}`);
  const numbers = [...loaded!.rotated.map((r) => r.n), ...loaded!.sealed.map((c) => c.n)];
  assert.equal(new Set(numbers).size, numbers.length, `${label}: unique chunk numbers`);
  return loaded!;
}
/** Every key under a session's prefix is its head or a chunk the head names (nothing orphaned). */
function noOrphans(storage: Storage, id: string, label: string): void {
  const head = JSON.parse(storage.getItem(headKey(id)) ?? "null") as { chunks?: number[] } | null;
  const named = new Set((head?.chunks ?? []).map((n) => `${TIMELINE_PREFIX}${encodeURIComponent(id)}|${n}`));
  for (const key of storage.sessionKeys(id)) assert.ok(key === headKey(id) || named.has(key), `${label}: orphan ${key}`);
}

test("each chunk is written once, and once more as its summary when it rotates; a save rewrites only the small head", () => {
  const storage = new Storage(), store = new TimelineStore(storage), { s, rec, add } = session();
  for (let k = 0; k < 30; k++) { add(TIMELINE_CHUNK_EVENTS); assert.notEqual(store.save(rec, s), "failed"); }
  const head = headKey(SESSION.id), chunks = [...storage.writes].filter(([key]) => key !== head);
  assert.equal(chunks.length, 30, "one key per chunk");
  const summaries = [...storage.data].filter(([k, v]) => k !== head && !v.startsWith("["));
  assert.equal(summaries.length, rec.rotated.length);
  assert.equal(storage.data.size - 1 - summaries.length, TIMELINE_RETAINED_CHUNKS, "the retained window in full");
  for (const [key, n] of chunks) assert.equal(n, summaries.some(([k]) => k === key) ? 2 : 1, `${key}: events once, then its summary once`);
  assert.equal(storage.writes.get(head), 31, "a provisional head, then one per save");
  const size = storage.getItem(head)!.length, whole = serializeTimeline(exportTimeline(rec, s)).length;
  assert.ok(size < whole / 5, `the head (${size}) is a fraction of the whole timeline (${whole})`);
  reloadsWhole(storage, rec, s, "30 saves");
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
  for (const [key, n] of storage.writes) if (key !== headKey(SESSION.id)) assert.equal(n, before.get(key), `${key} not rewritten`);
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
  reloadsWhole(storage, rec, s, "after rotating for quota");
  noOrphans(storage, SESSION.id, "after rotating for quota");
});

test("when even the head cannot be stored, the save says so and the timeline stays whole in memory", () => {
  const storage = new Storage(10), store = new TimelineStore(storage), { s, rec, add, notes } = session();
  add(500);
  assert.equal(store.save(rec, s), "failed");
  assert.deepEqual(allNotes(rec, s), notes);
});

test("a version 1 timeline migrates at the first save", () => {
  const storage = new Storage(), { s, rec, add } = session();
  add(700);
  storage.setItem(TIMELINE_STORAGE_KEY, serializeTimeline({ ...exportTimeline(rec, s), version: 1 }));
  const store = new TimelineStore(storage), migrated = store.load(SESSION.id)!;
  assert.deepEqual(exportTimeline(migrated, s).events, exportTimeline(rec, s).events);
  assert.equal(store.save(migrated, s), "saved");
  assert.equal(storage.getItem(TIMELINE_STORAGE_KEY), null, "the old key is gone once the new store holds the timeline");
  reloadsWhole(storage, migrated, s, "migrated");
});

// ---- SIM-1 R1 regressions -------------------------------------------------

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
    assert.equal(new TimelineStore(storage).save(rec, s), "saved", label);
    // Saving leaves the live partition alone; the closing spans join only the stored open chunk.
    assert.equal(rec.sealed.length, TIMELINE_RETAINED_CHUNKS, label);
    assert.equal(rec.events.length, open, label);
    assert.ok(rec.travel || !spans.includes("travel"));
    const loaded = reloadsWhole(storage, rec, s, label);
    assert.deepEqual(allNotes(loaded, s), ["old note", "recent note"], label);
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
  const writes = probe.storage.writeCalls;
  assert.ok(writes >= 3, `${writes} writes in the save`);
  for (const persistent of [false, true]) for (const name of ["QuotaExceededError", "SecurityError"]) for (let at = 0; at < writes + 2; at++) {
    const label = `${persistent ? "every write" : "one write"} failing from write ${at} (${name})`;
    const g = twoGenerations();
    g.storage.failFrom(at, persistent, name);
    const result = g.store.save(g.rec, g.s);
    const loaded = new TimelineStore(g.storage).load(SESSION.id);
    assert.ok(loaded, `${label}: a fresh reader finds a timeline`);
    const notes = allNotes(loaded!, g.s);
    once(notes, label);
    for (const n of g.committed) assert.ok(notes.includes(n), `${label}: committed ${n} survives`);
    if (result !== "failed") reloadsWhole(g.storage, g.rec, g.s, label);
    // Memory never loses a note either way.
    assert.deepEqual(allNotes(g.rec, g.s), g.notes, label);
    // And once the storage recovers, the next save commits everything.
    g.storage.failFrom(-1, false);
    assert.notEqual(g.store.save(g.rec, g.s), "failed", label);
    reloadsWhole(g.storage, g.rec, g.s, `${label}: after recovery`);
    noOrphans(g.storage, SESSION.id, `${label}: after recovery`);
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
  assert.equal(allNotes(new TimelineStore(storage).load(SESSION.id)!, s).length, 1000, "a provisional head never hides it");
  storage.quota = Infinity;
  assert.equal(store.save(loaded, s), "saved");
  assert.equal(storage.getItem(TIMELINE_STORAGE_KEY), null);
  reloadsWhole(storage, loaded, s, "migrated after a failure");
});

// ---- SIM-1 R2 regressions -------------------------------------------------

test("R2-F1: one store across sessions: A then B, and A then B then A with no B save, with a failure and retry", () => {
  const storage = new Storage(), t = clock(), store = new TimelineStore(storage, t.now);
  const a = session("A");
  a.add(TIMELINE_CHUNK_EVENTS + 200);
  assert.equal(store.save(a.rec, a.s), "saved");
  // A → B: B's first save writes B's own chunk 0.
  assert.equal(store.load("B"), null);
  const b = session("B");
  b.add(TIMELINE_CHUNK_EVENTS + 100);
  assert.equal(store.save(b.rec, b.s), "saved");
  reloadsWhole(storage, b.rec, b.s, "B");
  reloadsWhole(storage, a.rec, a.s, "A, within the stale window");
  // A → C → A, with no C save in between.
  assert.equal(store.load("C"), null);
  const resumed = store.load("A")!;
  assert.ok(resumed);
  for (let i = 0; i < TIMELINE_CHUNK_EVENTS; i++) addNote(resumed, a.s, `A again ${i}`);
  storage.failFrom(1, false, "SecurityError");
  assert.equal(store.save(resumed, a.s), "failed", "a failing write");
  reloadsWhole(storage, a.rec, a.s, "A's committed timeline survives the failure");
  storage.failFrom(-1, false);
  assert.equal(store.save(resumed, a.s), "saved", "and the retry commits");
  reloadsWhole(storage, resumed, a.s, "A again");
  noOrphans(storage, "A", "A again");
});

test("R2-F1: two store instances alternating sessions on one storage both reload whole", () => {
  const storage = new Storage(), t = clock(), first = new TimelineStore(storage, t.now), second = new TimelineStore(storage, t.now);
  const a = session("A"), b = session("B");
  for (let round = 0; round < 4; round++) {
    a.add(TIMELINE_CHUNK_EVENTS - 300); assert.equal(first.save(a.rec, a.s), "saved");
    b.add(TIMELINE_CHUNK_EVENTS + 300); assert.equal(second.save(b.rec, b.s), "saved");
    // Each instance also reloads the other's session at times, as a replacing tab would.
    if (round % 2) { assert.ok(first.load("B")); assert.ok(second.load("A")); }
    reloadsWhole(storage, a.rec, a.s, `A round ${round}`);
    reloadsWhole(storage, b.rec, b.s, `B round ${round}`);
  }
  noOrphans(storage, "A", "A"); noOrphans(storage, "B", "B");
});

test("R2-F2: a rotated export round-trips through resume, save and load with one numbering, then keeps saving", () => {
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
  const storage = new Storage(), store = new TimelineStore(storage);
  assert.equal(store.save(restored, s), "saved");
  const loaded = reloadsWhole(storage, restored, s, "restored");
  assert.equal(allNotes(loaded, s).length, 23_000);
  for (let i = 0; i < 1500; i++) addNote(loaded, s, `later ${i}`);
  assert.equal(store.save(loaded, s), "saved");
  reloadsWhole(storage, loaded, s, "restored, then appended");
  noOrphans(storage, SESSION.id, "restored");
});

test("R2-F3: a restart after any write or cleanup step of a save loses no committed note and leaves nothing behind", () => {
  // A committed generation; then a save that writes two chunks, folds one and collects.
  const base = new Storage(), t = clock(), x = session();
  x.add(TIMELINE_CHUNK_EVENTS * 3 + 200);
  assert.equal(new TimelineStore(base, t.now).save(x.rec, x.s), "saved");
  const committed = [...x.notes], baseImage = new Map(base.data);
  x.add(TIMELINE_CHUNK_EVENTS * 2 + 100);
  const live = Storage.of(baseImage);
  live.images = [];
  // Rotate one chunk too, as a full window would.
  const rotated = structuredClone(x.rec);
  assert.ok(rotateOldest(rotated));
  assert.equal(new TimelineStore(live, t.now).save(rotated, x.s), "saved");
  const images = live.images;
  assert.ok(images.length >= 5, `${images.length} storage steps`);
  for (const [k, image] of images.entries()) {
    const label = `restart after step ${k + 1} of ${images.length}`;
    const restarted = Storage.of(image);
    const store = new TimelineStore(restarted, t.now), loaded = store.load(SESSION.id);
    assert.ok(loaded, label);
    const notes = allNotes(loaded!, x.s);
    once(notes, label);
    for (const n of committed) assert.ok(notes.includes(n), `${label}: committed ${n}`);
    // The resumed game saves on: everything it holds reloads whole, and the
    // interrupted save's leftovers are gone.
    const more = structuredClone(loaded!);
    for (let i = 0; i < 300; i++) addNote(more, x.s, `after restart ${i}`);
    assert.equal(store.save(more, x.s), "saved", label);
    reloadsWhole(restarted, more, x.s, label);
    noOrphans(restarted, SESSION.id, label);
  }
});

test("R2-F3: abandoned sessions' keys are reclaimed once stale, so a later session's save succeeds; live ones are kept", () => {
  const storage = new Storage(), t = clock();
  // Four sessions each crash at their head write, after writing a chunk.
  for (let k = 0; k < 4; k++) {
    const g = session(`abandoned-${k}`);
    g.add(TIMELINE_CHUNK_EVENTS + 10);
    storage.failFrom(2, false, "Crash");
    assert.equal(new TimelineStore(storage, t.now).save(g.rec, g.s), "failed");
    storage.failFrom(-1, false);
    assert.ok(storage.sessionKeys(`abandoned-${k}`).length >= 2, "a provisional head and a chunk remain");
  }
  const live = session("live");
  live.add(100);
  assert.equal(new TimelineStore(storage, t.now).save(live.rec, live.s), "saved");
  for (let k = 0; k < 4; k++) assert.ok(storage.sessionKeys(`abandoned-${k}`).length, "inside the stale window, kept (it may be another tab)");
  // Past the stale window, and on a nearly full quota: the next save reclaims them and fits.
  t.advance(STALE_MS + 1);
  storage.quota = storage.used + 100;
  live.add(TIMELINE_CHUNK_EVENTS);
  assert.equal(new TimelineStore(storage, t.now).save(live.rec, live.s), "saved");
  for (let k = 0; k < 4; k++) assert.deepEqual(storage.sessionKeys(`abandoned-${k}`), [], `abandoned-${k} reclaimed`);
  reloadsWhole(storage, live.rec, live.s, "the later session");
  noOrphans(storage, "live", "the later session");
});
