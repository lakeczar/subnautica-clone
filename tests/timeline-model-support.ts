/** A model-based fault harness for the play-timeline journal (SIM-1b R1). A seeded
 * run plays random operations over a few expeditions and tabs (notes, events and
 * rotation, commits, quota pressure, repair, re-entry, another tab's commit),
 * injects faults at random storage reads and writes, and corrupts the journal,
 * its heads, chunks and the version 1 record with random malformed JSON. After
 * every step it checks the invariants:
 * - nothing throws;
 * - a fresh reader of each expedition loads exactly the notes of its last
 *   successful commit, each once, or (only when something was corrupted)
 *   reports protected;
 * - a refused commit (protected, conflict, cancelled, coordination) changes no
 *   stored byte, and a failed repair leaves the exported records as they were;
 * - collection never removes a key the stored journal names, nor the version 1
 *   record before a stored journal supersedes it;
 * - "saved" means durable: a successful commit's notes reload at once. */
import { addNote, createRecorder, exportTimeline, parseTimeline, recordEvent, serializeTimeline, TIMELINE_STORAGE_KEY } from "../src/sim/timeline/index.js";
import type { TimelineRecorder } from "../src/sim/timeline/index.js";
import { parseJournal, TIMELINE_CHUNK_PREFIX, TIMELINE_JOURNAL_KEY, TimelineJournal } from "../src/sim/timeline/store.js";
import type { TimelineCommit, TimelineStoragePort } from "../src/sim/timeline/store.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import type { GameState } from "../src/sim/types.js";
import { TestWriterLock } from "./persistence-support.js";

/** mulberry32: small, fast and seedable. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** localStorage with a quota, read and write faults armed for one operation, and a removal guard. */
class FuzzStorage implements TimelineStoragePort {
  readonly data = new Map<string, string>();
  quota = Infinity;
  private used = 0;
  writeFault: { at: number; name: string } | null = null;
  readFault: number | null = null;
  private writes = 0;
  private reads = 0;
  readonly violations: string[] = [];
  arm(write: { at: number; name: string } | null, read: number | null): void { this.writeFault = write; this.readFault = read; this.writes = 0; this.reads = 0; }
  get length(): number { return this.data.size; }
  key(i: number): string | null { return [...this.data.keys()][i] ?? null; }
  getItem(key: string): string | null {
    if (this.readFault !== null && this.reads++ === this.readFault) throw Object.assign(new Error("injected read"), { name: "SecurityError" });
    return this.data.get(key) ?? null;
  }
  private size(key: string): number { const v = this.data.get(key); return v === undefined ? 0 : key.length + v.length; }
  setItem(key: string, value: string): void {
    if (this.writeFault && this.writes++ === this.writeFault.at) throw Object.assign(new Error("injected write"), { name: this.writeFault.name });
    if (this.used - this.size(key) + key.length + value.length > this.quota) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    this.used += key.length + value.length - this.size(key);
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    // The guard: never a key the stored journal names, never v1 before a stored journal supersedes it.
    const raw = this.data.get(TIMELINE_JOURNAL_KEY), j = raw === undefined ? null : parseJournal(raw);
    if (j && typeof j !== "string") {
      const named = [j.current, j.previous].flatMap((h) => h ? h.chunks.map((n) => `${TIMELINE_CHUNK_PREFIX}${encodeURIComponent(h.session.id)}|${n}`) : []);
      if (named.includes(key)) this.violations.push(`removed ${key}, named by the stored journal`);
      if (key === TIMELINE_STORAGE_KEY && !j.v1Superseded) this.violations.push("removed the version 1 record before a stored journal superseded it");
    } else if (key === TIMELINE_STORAGE_KEY) this.violations.push("removed the version 1 record with no readable journal");
    this.used -= this.size(key);
    this.data.delete(key);
  }
  get usedChars(): number { return this.used; }
  /** Outside the guards and faults: seeding and corruption. */
  force(key: string, value: string | null): void {
    this.used -= this.size(key);
    if (value === null) this.data.delete(key); else { this.data.set(key, value); this.used += key.length + value.length; }
  }
  snapshot(): Map<string, string> { return new Map(this.data); }
}

interface Tab { session: string; journal: TimelineJournal; rec: TimelineRecorder; s: GameState }
const SESSIONS = ["A", "B", "C"];
const STARTED = "2026-10-24T08:00:00.000Z";
const notesOf = (rec: TimelineRecorder, s: GameState): string[] => {
  const x = exportTimeline(rec, s);
  return [...(x.rotated ?? []).flatMap((r) => r.kept), ...x.events].filter((e) => e.kind === "note").map((e) => e.text!).sort();
};
const same = (a: Map<string, string>, b: Map<string, string>): boolean => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const deep = (n: number): string => "[".repeat(n) + "]".repeat(n);

export interface ModelResult { ok: boolean; seed: number; steps: number; failure?: string; log: string[] }

/** Plays one seeded sequence of `steps` operations; returns the first broken invariant, if any. */
export async function runModel(seed: number, steps: number): Promise<ModelResult> {
  const rand = prng(seed), pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!, int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const storage = new FuzzStorage(), lock = new TestWriterLock(), log: string[] = [];
  const durable = new Map<string, string[]>();
  let damaged = false, counter = 0;
  const fail = (failure: string): ModelResult => ({ ok: false, seed, steps, failure, log });
  const game = (): GameState => { const s = createGame(); completeOpening(s); return s; };
  // A version 1 record to begin with, sometimes.
  const v1Kind = pick(["none", "none", "own", "other", "broken"] as const);
  if (v1Kind === "own" || v1Kind === "other") {
    const id = v1Kind === "own" ? "A" : "D", s = game(), rec = createRecorder({ id, started: STARTED });
    for (let i = 0; i < int(1, 40); i++) addNote(rec, s, `v1 ${id} ${i}`);
    for (let i = 0; i < int(0, 1500); i++) { s.tick += 5; recordEvent(rec, s, { kind: "gather", what: "silica_glass", quantity: 1 }); }
    storage.force(TIMELINE_STORAGE_KEY, serializeTimeline({ ...exportTimeline(rec, s), version: 1 }));
    durable.set(id, notesOf(rec, s));
  } else if (v1Kind === "broken") { storage.force(TIMELINE_STORAGE_KEY, "{broken v1"); damaged = true; }
  log.push(`seed ${seed}: v1 ${v1Kind}`);

  const tabs: Tab[] = [];
  const open = (session: string): Tab => {
    const journal = new TimelineJournal(storage, lock, session), l = journal.load(), s = game();
    const rec = l.kind === "loaded" ? l.recorder : createRecorder({ id: session, started: STARTED });
    const tab = { session, journal, rec, s };
    tabs.push(tab);
    return tab;
  };
  let active = open(pick(SESSIONS));
  /** The expeditions storage holds now: the journal's heads, and a readable version 1 record it hasn't superseded. */
  const holders = (): Set<string> => {
    const raw = storage.data.get(TIMELINE_JOURNAL_KEY), j = raw === undefined ? null : parseJournal(raw);
    const held = new Set<string>(), v1 = storage.data.get(TIMELINE_STORAGE_KEY);
    if (j && typeof j !== "string") for (const h of [j.current, j.previous]) if (h) held.add(h.session.id);
    if (v1 !== undefined && !(j && typeof j !== "string" && j.v1Superseded)) { const p = parseTimeline(v1); if (p.ok) held.add(p.value.session.id); }
    return held;
  };
  /** After a commit by `tab`: the model follows storage. An expedition held before the commit and gone
   * after it must be reported; one lost earlier (to corruption) just leaves the model. */
  const settle = (tab: Tab, r: TimelineCommit, heldBefore: Set<string>): string | null => {
    if (r.ok) {
      if (r.seq !== tab.rec.seq) return `ok commit seq ${r.seq} is not the recorder's ${tab.rec.seq}`;
      durable.set(tab.session, notesOf(tab.rec, tab.s));
    }
    const held = holders();
    let gone = 0;
    for (const [id, notes] of [...durable]) {
      if (held.has(id)) continue;
      durable.delete(id);
      if (heldBefore.has(id) && notes.length) gone++;
    }
    if (gone > r.dropped.length) return `${gone} timelines with notes left the store but ${r.dropped.length} were reported`;
    return null;
  };

  for (let step = 0; step < steps; step++) {
    const op = pick(["note", "note", "events", "events", "commit", "commit", "commit", "fault-commit", "quota", "enter", "other-tab", "corrupt", "repair"] as const);
    log.push(`${step}: ${op} (${active.session})`);
    try {
      if (op === "note") for (let i = int(1, 4); i > 0; i--) addNote(active.rec, active.s, `${active.session} note ${counter++}`);
      else if (op === "events") {
        const n = rand() < 0.08 ? int(4000, 12000) : int(20, 900);
        for (let i = 0; i < n; i++) { active.s.tick += 7; active.rec.playTicks += 7; recordEvent(active.rec, active.s, { kind: pick(["gather", "poi"]), what: "silica_glass", quantity: 1 }); }
      } else if (op === "commit" || op === "fault-commit") {
        if (op === "fault-commit") storage.arm(rand() < 0.7 ? { at: int(0, 6), name: pick(["QuotaExceededError", "SecurityError"]) } : null, rand() < 0.5 ? int(0, 12) : null);
        const before = storage.snapshot(), heldBefore = holders();
        const r = await active.journal.commit(active.rec, active.s, new AbortController().signal);
        storage.arm(null, null);
        log.push(`   -> ${r.ok ? `ok seq ${r.seq}` : r.code}${r.dropped.length ? ` dropped ${r.dropped.length}` : ""}`);
        if (!r.ok && ["protected", "conflict", "cancelled", "invalid", "lock-unavailable", "lock-failed"].includes(r.code) && !same(before, storage.data))
          return fail(`step ${step}: a ${r.code} commit changed storage`);
        const bad = settle(active, r, heldBefore);
        if (bad) return fail(`step ${step}: ${bad}`);
      } else if (op === "quota") storage.quota = rand() < 0.3 ? Infinity : storage.usedChars + int(0, 200_000);
      else if (op === "enter") active = open(pick(SESSIONS));
      else if (op === "other-tab") {
        const other = open(pick(SESSIONS));
        addNote(other.rec, other.s, `${other.session} other-tab note ${counter++}`);
        const heldBefore = holders();
        const r = await other.journal.commit(other.rec, other.s, new AbortController().signal);
        log.push(`   -> other tab ${other.session}: ${r.ok ? "ok" : r.code}`);
        const bad = settle(other, r, heldBefore);
        if (bad) return fail(`step ${step}: ${bad}`);
        if (rand() < 0.5) active = other;
      } else if (op === "corrupt") {
        damaged = true;
        const target = pick(["journal-raw", "head", "head", "chunk", "chunk-delete", "v1"] as const);
        const raw = storage.data.get(TIMELINE_JOURNAL_KEY);
        const chunks = [...storage.data.keys()].filter((k) => k.startsWith(TIMELINE_CHUNK_PREFIX));
        log.push(`   corrupt ${target}`);
        if (target === "journal-raw") storage.force(TIMELINE_JOURNAL_KEY, pick(["{bad", "null", "7", "[]", '""', deep(5000), '{"toString":null}',
          '{"format":"siltwake.timeline.journal","version":1}', '{"format":"siltwake.timeline.journal","version":1,"current":null,"v1Superseded":false}']));
        else if (target === "head" && raw) {
          try {
            const j = JSON.parse(raw) as Record<string, Record<string, unknown> | null>;
            const which = pick(["current", "previous"]), h = j[which];
            if (h && typeof h === "object") {
              const field = pick(["events", "chunks", "folded", "nextChunk", "notes", "seq", "session", "commit"]);
              // Malformed values only: a valid-looking edit (an empty list, a different string) can't be told from real data.
              const value = pick<unknown>([null, {}, -1, 1e300, 2 ** 60, [-1], [1.5], JSON.parse(deep(100)), { toString: null }, true, undefined]);
              if (value === undefined) delete h[field]; else h[field] = value;
              storage.force(TIMELINE_JOURNAL_KEY, JSON.stringify(j));
            }
          } catch { /* the journal is already unparseable */ }
        } else if (target === "chunk" && chunks.length) {
          const bad = pick(["{broken", '{"kept":[]}', "[]", JSON.stringify(Array.from({ length: 1000 }, () => ({ kind: "teleport", tick: 0, play: 0 }))),
            JSON.stringify({ kept: [{ kind: "note", tick: 0, play: 0, text: "x", saveRef: 7 }], from: {}, to: {}, kinds: {} }), deep(5000),
            JSON.stringify(Array.from({ length: 999 }, () => ({ kind: "gather", tick: 0, play: 0 })))]);
          storage.force(pick(chunks), bad);
        } else if (target === "chunk-delete" && chunks.length) storage.force(pick(chunks), null);
        else if (target === "v1") storage.force(TIMELINE_STORAGE_KEY, pick(['{"format":"siltwake.timeline","version":{"toString":null}}',
          `{"format":"siltwake.timeline","version":${deep(4000)}}`, "{bad v1"]));
      } else if (op === "repair") {
        const tab = tabs.find((t) => t.journal.protection !== null);
        if (tab) {
          const exported = tab.journal.records();
          if (typeof exported !== "string") {
            if (rand() < 0.4) storage.arm({ at: int(0, 4), name: pick(["QuotaExceededError", "SecurityError"]) }, null);
            const r = await tab.journal.repair(tab.rec, tab.s, new AbortController().signal, exported);
            storage.arm(null, null);
            log.push(`   -> repair ${tab.session}: ${r.ok ? "ok" : r.code}`);
            if (r.ok) {
              durable.clear();
              durable.set(tab.session, notesOf(tab.rec, tab.s));
              damaged = false;
              active = tab;
            } else {
              const now = tab.journal.records();
              if (typeof now === "string" || now.journal !== exported.journal || now.v1 !== exported.v1 ||
                JSON.stringify(now.chunks) !== JSON.stringify(exported.chunks)) return fail(`step ${step}: a failed repair changed the exported records`);
              if (tab.journal.protection === null) return fail(`step ${step}: a failed repair cleared protection`);
            }
          }
        }
      }
    } catch (error) {
      return fail(`step ${step}: ${op} threw: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }
    if (storage.violations.length) return fail(`step ${step}: ${storage.violations[0]}`);
    // A fresh reader of each expedition.
    for (const id of [...SESSIONS, "D"]) {
      let l;
      try { l = new TimelineJournal(storage, lock, id).load(); } catch (error) { return fail(`step ${step}: a fresh load of ${id} threw: ${String(error)}`); }
      if (l.kind === "protected") { if (!damaged) return fail(`step ${step}: ${id} protected with nothing damaged (${l.error})`); continue; }
      const want = durable.get(id) ?? [];
      const got = l.kind === "loaded" ? notesOf(l.recorder, game()) : [];
      if (new Set(got).size !== got.length) return fail(`step ${step}: ${id} reloads a note twice`);
      if (JSON.stringify(got) !== JSON.stringify(want)) return fail(`step ${step}: ${id} reloads ${got.length} notes, ${want.length} committed`);
    }
  }
  return { ok: true, seed, steps, log };
}
