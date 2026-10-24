/** A model-based fault harness for the play-timeline journal (SIM-1b R1, R2). A run
 * is a script of operations over a few expeditions and tabs: notes (repeated
 * text and save references too), varied events and open spans, pending
 * recoveries, commits, quota pressure, re-entry, another tab's commit, gated,
 * rejected, absent and aborted lock requests, a live timeline closed, disposed
 * or replaced mid-commit, corruption and repair. Faults hit any storage call
 * (`getItem`, `setItem`, `removeItem`, `length`, `key`), once or from a
 * position on. A seeded generator writes random scripts; `REGRESSIONS` are
 * fixed ones.
 *
 * The oracle is independent of the production parsers. It keeps its own model
 * of what is committed (which expedition each journal head holds, a pending
 * version 1 record, each expedition's notes and totals) and decodes the raw
 * stored JSON itself, leniently. Corruption is recorded as targeted damage:
 * the key, its damaged bytes and its original ones. After every step:
 * - nothing throws, and no read (a load, `records()`, a fresh reader) writes;
 * - while live damage remains, every fresh reader protects; the damaged bytes
 *   change, or leave the journal, only through a committed repair; a commit
 *   over a damaged journal, missing chunk or version 1 record, or one folding
 *   a damaged chunk, refuses;
 * - otherwise a fresh reader of each expedition loads exactly its committed
 *   notes and totals;
 * - the raw journal (damage undone) holds exactly the model's heads and notes,
 *   so a successful commit is durable, damage or not;
 * - a refused commit (conflict, cancelled, invalid, no or failed lock) makes
 *   no storage call that mutates; a protected one changes no byte; any other
 *   failure keeps the committed journal and its notes;
 * - a dropped expedition is reported, with its notes;
 * - removal never takes a key the stored journal names (read leniently), the
 *   version 1 record before a stored journal supersedes it, or a key that was
 *   there when the journal can't be read; before a journal write, a write never
 *   touches a damaged key;
 * - every crash image (the storage after each mutation) holds each
 *   expedition's notes as before or as after the operation, and loads unless
 *   something was damaged;
 * - a live timeline's "Note saved" is durable, and a disposed generation never
 *   writes. */
import { addNote, createRecorder, exportTimeline, recordEvent, serializeTimeline } from "../src/sim/timeline/index.js";
import type { TimelineRecorder } from "../src/sim/timeline/index.js";
import { analyseTimeline } from "../src/sim/timeline/report.js";
import type { TimelineEvent } from "../src/sim/timeline/report.js";
import { TimelineJournal } from "../src/sim/timeline/store.js";
import type { TimelineCommit, TimelineLoad, TimelineStoragePort } from "../src/sim/timeline/store.js";
import { LiveTimeline } from "../src/runtime/liveTimeline.js";
import type { WriterLockPort } from "../src/save/writer-lock.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import type { GameState } from "../src/sim/types.js";

// The storage contract, written out here rather than imported.
const JOURNAL = "siltwake.timeline.v2.journal", V1 = "siltwake.timeline.v1", PREFIX = "siltwake.timeline.v2|";
const LOCK = "siltwake.timeline.v2.writer";
const chunkKey = (session: string, n: number): string => `${PREFIX}${encodeURIComponent(session)}|${n}`;
const CHUNK = 1000;
/** The steps of every seeded sequence, fast and heavy, and of a seed's replay. */
export const MODEL_STEPS = 40;
/** The fast tier's seeds. */
export const FAST_SEEDS = Array.from({ length: 24 }, (_, i) => 101 + i * 7919);

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

type Call = "get" | "set" | "remove" | "length" | "key";
/** The `at`th call of its kind in the operation throws; with `persistent`, so does every later one. */
export interface Fault { call: Call; at: number; persistent: boolean; name?: string }
interface Damage { key: string; value: string | null; original: string | null; kind: "journal" | "chunk" | "missing" | "v1" }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function json(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}
const same = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const deep = (n: number): string => "[".repeat(n) + "]".repeat(n);

/** What a raw journal names, read leniently: a head whose session and chunk numbers can be read names its keys. */
interface RawJournal { present: boolean; readable: boolean; slots: [string | null, string | null]; named: Set<string>;
  folded: Map<string, number[]>; v1Superseded: unknown }
function rawJournal(text: string | undefined): RawJournal {
  const out: RawJournal = { present: text !== undefined, readable: text === undefined, slots: [null, null], named: new Set(), folded: new Map(), v1Superseded: undefined };
  if (text === undefined) return out;
  const v = json(text);
  if (!isObj(v)) return out;
  out.v1Superseded = v.v1Superseded;
  let readable = "current" in v && "previous" in v;
  for (const [i, h] of [v.current, v.previous].entries()) {
    if (h === null) continue;
    const session = isObj(h) && isObj(h.session) && typeof h.session.id === "string" ? h.session.id : null;
    const chunks = isObj(h) && Array.isArray(h.chunks) ? h.chunks : null;
    if (session !== null && chunks) for (const n of chunks) if (Number.isSafeInteger(n)) out.named.add(chunkKey(session, n as number));
    if (session === null || !chunks || !chunks.every(Number.isSafeInteger)) { readable = false; continue; }
    out.slots[i] = session;
    out.folded.set(session, isObj(h) && Array.isArray(h.folded) ? h.folded.filter(Number.isSafeInteger) as number[] : []);
  }
  out.readable = readable;
  return out;
}
const noteKey = (e: Record<string, unknown>): string => `${String(e.text)}${e.saveRef !== undefined ? ` @${String(e.saveRef)}` : ""}`;
const notesIn = (events: unknown): string[] | null => Array.isArray(events)
  ? events.flatMap((e) => isObj(e) && e.kind === "note" && typeof e.text === "string" ? [noteKey(e)] : []) : null;
/** The notes stored for `session`, decoded leniently from the raw records; null if they can't be decoded. */
function rawNotes(data: ReadonlyMap<string, string>, session: string): string[] | null {
  const j = json(data.get(JOURNAL));
  if (data.has(JOURNAL) && !isObj(j)) return null;
  if (isObj(j)) for (const h of [j.current, j.previous]) {
    if (!isObj(h) || !isObj(h.session) || h.session.id !== session) continue;
    const out = notesIn(h.events);
    if (!out || !Array.isArray(h.chunks)) return null;
    for (const n of h.chunks) {
      const c = json(data.get(chunkKey(session, n as number)));
      const notes = notesIn(Array.isArray(c) ? c : isObj(c) ? c.kept : null);
      if (!notes) return null;
      out.push(...notes);
    }
    return out.sort();
  }
  if (!(isObj(j) && j.v1Superseded === true)) {
    const v = json(data.get(V1));
    if (isObj(v) && isObj(v.session) && v.session.id === session) {
      const out = notesIn(v.events) ?? [];
      if (Array.isArray(v.rotated)) for (const r of v.rotated) out.push(...(isObj(r) ? notesIn(r.kept) ?? [] : []));
      return out.sort();
    }
  }
  return [];
}

/** localStorage with a quota, faults armed for one operation, a removal guard, a
 * mutation counter (refused calls included), crash images and a write trace. */
class FuzzStorage implements TimelineStoragePort {
  readonly data = new Map<string, string>();
  quota = Infinity;
  private used = 0;
  private faults: Fault[] = [];
  private calls: Record<Call, number> = { get: 0, set: 0, remove: 0, length: 0, key: 0 };
  mutations = 0;
  images: Map<string, string>[] | null = null;
  /** Successful mutations this operation, in order. */
  trace: string[] = [];
  /** Keys present when the operation began. */
  opening = new Set<string>();
  readonly violations: string[] = [];
  arm(faults: readonly Fault[]): void { this.faults = [...faults]; this.calls = { get: 0, set: 0, remove: 0, length: 0, key: 0 }; }
  private fault(call: Call): void {
    const n = this.calls[call]++;
    const f = this.faults.find((x) => x.call === call && (n === x.at || (x.persistent && n > x.at)));
    if (f) throw Object.assign(new Error(`injected ${call}`), { name: f.name ?? "SecurityError" });
  }
  get length(): number { this.fault("length"); return this.data.size; }
  key(i: number): string | null { this.fault("key"); return [...this.data.keys()][i] ?? null; }
  getItem(key: string): string | null { this.fault("get"); return this.data.get(key) ?? null; }
  private size(key: string): number { const v = this.data.get(key); return v === undefined ? 0 : key.length + v.length; }
  setItem(key: string, value: string): void {
    this.mutations++;
    this.fault("set");
    if (this.used - this.size(key) + key.length + value.length > this.quota) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    this.used += key.length + value.length - this.size(key);
    this.data.set(key, value);
    this.trace.push(`set ${key}`);
    this.images?.push(new Map(this.data));
  }
  removeItem(key: string): void {
    this.mutations++;
    this.fault("remove");
    const j = rawJournal(this.data.get(JOURNAL));
    if (j.named.has(key)) this.violations.push(`removed ${key}, named by the stored journal`);
    if (key === V1 && j.v1Superseded !== true) this.violations.push("removed the version 1 record before a stored journal superseded it");
    if (!j.readable && this.opening.has(key)) this.violations.push(`removed ${key} while the stored journal can't be read`);
    this.used -= this.size(key);
    this.data.delete(key);
    this.trace.push(`remove ${key}`);
    this.images?.push(new Map(this.data));
  }
  get usedChars(): number { return this.used; }
  /** Outside the guards and faults: seeding and corruption. */
  force(key: string, value: string | null): void {
    this.used -= this.size(key);
    if (value === null) this.data.delete(key); else { this.data.set(key, value); this.used += key.length + value.length; }
  }
  snapshot(): Map<string, string> { return new Map(this.data); }
  static of(image: ReadonlyMap<string, string>): FuzzStorage {
    const s = new FuzzStorage();
    for (const [k, v] of image) s.force(k, v);
    return s;
  }
}

/** One lock action: what storage held around it and what it returned. */
interface Action { owner: object; before: Map<string, string>; after: Map<string, string>; mutations: number; result: unknown; index: number }
/** The writer lock all tabs share: serial, with a gate, injected rejection, an action log and a hook after each action. */
class LockQueue {
  tail: Promise<void> = Promise.resolve();
  gate: Promise<void> | null = null;
  reject = false;
  log: Action[] = [];
  afterAction: ((a: Action) => void) | null = null;
  names = new Set<string>();
  constructor(readonly storage: FuzzStorage) {}
}
class HarnessLock implements WriterLockPort {
  constructor(private readonly q: LockQueue, private readonly owner: object) {}
  async runExclusive<T>(name: string, signal: AbortSignal, action: () => T): Promise<T> {
    this.q.names.add(name);
    if (this.q.reject) throw new Error("injected lock refusal");
    const predecessor = this.q.tail;
    let release!: () => void;
    this.q.tail = new Promise<void>((r) => { release = r; });
    await predecessor;
    try {
      if (this.q.gate) await this.q.gate;
      signal.throwIfAborted();
      const st = this.q.storage, before = st.snapshot(), m0 = st.mutations;
      const result = action();
      const a: Action = { owner: this.owner, before, after: st.snapshot(), mutations: st.mutations - m0, result, index: this.q.log.length };
      this.q.log.push(a);
      this.q.afterAction?.(a);
      return result;
    } finally { release(); }
  }
}
async function flush(q: LockQueue): Promise<void> {
  for (let round = 0; round < 6; round++) { await q.tail; for (let i = 0; i < 20; i++) await Promise.resolve(); }
}

type Target = "journal-raw" | "head" | "chunk" | "chunk-field" | "chunk-delete" | "v1";
interface Gated { notes: number; other: string | null; abort: boolean; afterAction: boolean }
export type Op =
  | { op: "note"; count: number; kind: "plain" | "duplicate" | "ref" | "long" }
  | { op: "events"; count: number; rich: boolean }
  | { op: "spans"; travel: boolean; idle: boolean; pending: boolean }
  | { op: "commit"; faults?: Fault[]; lock?: "ok" | "rejected" | "absent" | "aborted" | "invalid"; gated?: Gated; crash?: boolean }
  | { op: "quota"; room: number | null }
  | { op: "enter"; session: string; faults?: Fault[] }
  | { op: "other-tab"; session: string }
  /** `pick` and `value` in [0, 1) choose the record and the damage; `chunk` names one. */
  | { op: "corrupt"; target: Target; pick: number; value: number; chunk?: { session: string; n: number } }
  | { op: "repair"; faults?: Fault[]; crash?: boolean; stale?: boolean }
  | { op: "live"; session: string; notes: number; gate: boolean; queued: boolean; afterAction: boolean; end: "settle" | "final" | "dispose" | "replace" };
export interface Script { name: string; v1: "none" | "own" | "other" | "broken" | "hostile"; start: string; ops: Op[] }
export interface ModelResult { ok: boolean; name: string; steps: number; failure?: string; log: string[] }

const SESSIONS = ["A", "B", "C"];
const STARTED = "2026-10-24T08:00:00.000Z";
const HEAD_FIELDS = ["events", "chunks", "folded", "nextChunk", "notes", "seq", "session", "commit"];
const HEAD_VALUES: unknown[] = [null, {}, -1, 1e300, 2 ** 60, [-1], [1.5], "deep", { toString: null }, true, undefined];
const BAD_CHUNKS = ["{broken", '{"kept":[]}', "[]", JSON.stringify(Array.from({ length: CHUNK }, () => ({ kind: "teleport", tick: 0, play: 0 }))),
  JSON.stringify({ kept: [{ kind: "note", tick: 0, play: 0, text: "x", saveRef: 7 }], from: {}, to: {}, kinds: {} }), deep(5000),
  JSON.stringify(Array.from({ length: CHUNK - 1 }, () => ({ kind: "gather", tick: 0, play: 0 })))];
/** One wrong known field on an otherwise-valid event. */
const WRONG_FIELDS: ((e: Record<string, unknown>) => void)[] = [
  (e) => { e.text = { bad: "not text" }; }, (e) => { e.what = 3; }, (e) => { e.id = null; }, (e) => { e.quantity = "2"; },
  (e) => { e.region = 4; }, (e) => { e.seconds = null; }, (e) => { e.hull = 1; }, (e) => { e.waiting = ["decode", 1]; },
  (e) => { e.keys = "cache:x"; }, (e) => { e.of = "10"; }, (e) => { e.wall = 0; }, (e) => { e.at = [1, 2]; }, (e) => { e.saveRef = 7; },
  (e) => { e.saveRef = "x".repeat(201); }, (e) => { e.tick = "0"; },
];
const BAD_V1 = ['{"format":"siltwake.timeline","version":{"toString":null}}', `{"format":"siltwake.timeline","version":${deep(4000)}}`, "{bad v1",
  JSON.stringify({ format: "siltwake.timeline", version: 1, dropped: 0, session: { id: "A", started: STARTED, end: { tick: 1, play: 0, idle: 0 } },
    events: [{ kind: "note", tick: 0, play: 0, text: 7 }] })];

/** The rich event pattern, by index: every kind, with well-formed optional fields. */
function richEvent(i: number, tick: number): Omit<TimelineEvent, "tick" | "play"> {
  switch (i % 9) {
    case 0: return { kind: "gather", what: "silica_glass", id: "reef_glass", quantity: 1 + (i % 3) };
    case 1: return { kind: "poi", what: "wreck", id: `poi_${i % 5}` };
    case 2: return { kind: "travel", seconds: 40 + (i % 300), stationary: 2, metres: 120, hull: "dart", id: "dart_1" };
    case 3: return { kind: "idle", seconds: 50 + (i % 200), waiting: ["decode"] };
    case 4: return { kind: "new", what: "blueprint", id: `bp_${i % 7}`, label: "Blueprint" };
    case 5: return { kind: "death", keys: ["cache:c1"], at: [1, 2, 3] };
    case 6: return { kind: "recovery", keys: ["cache:c1"], of: Math.max(0, tick - 100), seconds: 30 };
    case 7: return { kind: "region", id: `region_${i % 4}` };
    default: return { kind: "system", what: "autosave-off", label: "Autosave off" };
  }
}

/** A random script of `steps` operations. */
export function generate(seed: number, steps: number): Script {
  const rand = prng(seed), pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1)), chance = (p: number): boolean => rand() < p;
  const faults = (calls: readonly Call[], p: number): Fault[] | undefined => {
    if (!chance(p)) return undefined;
    return Array.from({ length: int(1, 2) }, (): Fault => {
      const call = pick(calls);
      const at = call === "get" ? int(0, 40) : call === "set" ? int(0, 12) : call === "remove" ? int(0, 6) : call === "length" ? int(0, 2) : int(0, 60);
      return { call, at, persistent: chance(0.3), ...(call === "set" ? { name: pick(["QuotaExceededError", "SecurityError", "NS_ERROR_DOM_QUOTA_REACHED"]) } : {}) };
    });
  };
  const ops: Op[] = [];
  for (let step = 0; step < steps; step++) {
    const kind = pick(["note", "note", "events", "events", "spans", "commit", "commit", "commit", "commit", "quota", "enter", "other-tab", "corrupt", "repair", "live"] as const);
    if (kind === "note") ops.push({ op: "note", count: int(1, 4), kind: pick(["plain", "plain", "duplicate", "ref", "long"]) });
    else if (kind === "events") ops.push({ op: "events", count: chance(0.08) ? int(4000, 12000) : int(20, 900), rich: chance(0.5) });
    else if (kind === "spans") ops.push({ op: "spans", travel: chance(0.5), idle: chance(0.5), pending: chance(0.4) });
    else if (kind === "commit") {
      const r = rand();
      const lock = r < 0.06 ? "rejected" : r < 0.12 ? "absent" : r < 0.18 ? "aborted" : r < 0.21 ? "invalid" : "ok";
      const f = faults(["get", "get", "set", "set", "remove", "length", "key"], 0.35);
      const gated = lock === "ok" && chance(0.15) ? { notes: int(0, 3), other: chance(0.5) ? pick(SESSIONS) : null, abort: chance(0.25), afterAction: chance(0.3) } : undefined;
      ops.push({ op: "commit", lock, ...(f ? { faults: f } : {}), ...(gated ? { gated } : {}), crash: chance(0.25) });
    } else if (kind === "quota") ops.push({ op: "quota", room: chance(0.3) ? null : int(0, 200_000) });
    else if (kind === "enter") { const f = faults(["get", "length", "key"], 0.2); ops.push({ op: "enter", session: pick(SESSIONS), ...(f ? { faults: f } : {}) }); }
    else if (kind === "other-tab") ops.push({ op: "other-tab", session: pick(SESSIONS) });
    else if (kind === "corrupt") ops.push({ op: "corrupt", target: pick(["journal-raw", "head", "head", "chunk", "chunk-field", "chunk-field", "chunk-delete", "v1"]), pick: rand(), value: rand() });
    else if (kind === "repair") { const f = faults(["get", "set", "set", "remove", "length", "key"], 0.4); ops.push({ op: "repair", crash: chance(0.3), stale: chance(0.15), ...(f ? { faults: f } : {}) }); }
    else ops.push({ op: "live", session: pick(SESSIONS), notes: int(1, 3), gate: chance(0.5), queued: chance(0.4), afterAction: chance(0.3), end: pick(["settle", "settle", "final", "dispose", "replace"]) });
  }
  return { name: `seed ${seed}`, v1: pick(["none", "none", "own", "other", "broken", "hostile"]), start: pick(SESSIONS), ops };
}

/** Plays one seeded sequence of `steps` operations. */
export function runModel(seed: number, steps = MODEL_STEPS): Promise<ModelResult> { return runScript(generate(seed, steps)); }

interface Note { text: string; ref?: string; seq: number }
interface Tab { session: string; journal: TimelineJournal; rec: TimelineRecorder; s: GameState; notes: Note[]; owner: object }
/** What is committed, by the model alone. */
interface Model {
  current: string | null; previous: string | null;
  /** The session of a version 1 record not yet superseded (its notes are in `durable`). */
  v1: string | null;
  superseded: boolean;
  durable: Map<string, string[]>;
  /** Analysis totals and pending recoveries at the last commit, as JSON. */
  totals: Map<string, string>;
}
const copyModel = (m: Model): Model => ({ ...m, durable: new Map(m.durable), totals: new Map(m.totals) });
const held = (m: Model): Set<string> => new Set([m.current, m.previous, m.v1].filter((x): x is string => x !== null));
const keyOf = (n: Note): string => `${n.text}${n.ref !== undefined ? ` @${n.ref}` : ""}`;
const game = (): GameState => { const s = createGame(); completeOpening(s); return s; };
function totalsOf(rec: TimelineRecorder, s: GameState): string {
  const a = analyseTimeline(exportTimeline(rec, s));
  return JSON.stringify([a.newCount, a.gathering, a.deaths, a.travel, a.idle, rec.pending]);
}
const recorderNotes = (rec: TimelineRecorder, s: GameState): string[] => {
  const x = exportTimeline(rec, s);
  return [...(x.rotated ?? []).flatMap((r) => r.kept), ...x.events].filter((e) => e.kind === "note").map((e) => noteKey(e as unknown as Record<string, unknown>)).sort();
};
const eq = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Plays one script; returns the first broken invariant, if any. */
export async function runScript(script: Script): Promise<ModelResult> {
  const storage = new FuzzStorage(), queue = new LockQueue(storage), log: string[] = [`${script.name}: v1 ${script.v1}, start ${script.start}`];
  let model: Model = { current: null, previous: null, v1: null, superseded: false, durable: new Map(), totals: new Map() };
  let damage: Damage[] = [];
  let counter = 0, step = -1;
  const fail = (failure: string): ModelResult => ({ ok: false, name: script.name, steps: script.ops.length, failure: `step ${step}: ${failure}`, log });
  /** `data` with each damage undone, where the damaged bytes are still there. */
  const restored = (data: ReadonlyMap<string, string>, ds: readonly Damage[] = damage): Map<string, string> => {
    const out = new Map(data);
    for (const d of ds) if ((data.get(d.key) ?? null) === d.value) { if (d.original === null) out.delete(d.key); else out.set(d.key, d.original); }
    return out;
  };
  const liveDamage = (d: Damage, data: ReadonlyMap<string, string>): boolean => {
    if (d.kind === "journal") return true;
    const j = rawJournal(restored(data).get(JOURNAL));
    return d.kind === "v1" ? j.v1Superseded !== true : j.named.has(d.key);
  };

  if (script.v1 === "own" || script.v1 === "other") {
    const id = script.v1 === "own" ? "A" : "D", s = game(), rec = createRecorder({ id, started: STARTED }), notes: string[] = [];
    for (let i = 0; i < 1 + (counter % 30); i++) { addNote(rec, s, `v1 ${id} ${i}`); notes.push(`v1 ${id} ${i}`); }
    for (let i = 0; i < 1200; i++) { s.tick += 5; rec.playTicks += 5; recordEvent(rec, s, richEvent(i, s.tick)); }
    storage.force(V1, serializeTimeline({ ...exportTimeline(rec, s), version: 1 }));
    model.v1 = id; model.durable.set(id, notes.sort()); model.totals.set(id, totalsOf(rec, s));
  } else if (script.v1 === "broken" || script.v1 === "hostile") {
    const value = script.v1 === "broken" ? "{broken v1" : BAD_V1[0]!;
    storage.force(V1, value);
    damage.push({ key: V1, value, original: null, kind: "v1" });
  }

  /** Runs a read; a string if it threw or touched storage. */
  const readOnly = <T>(what: string, read: () => T): { value: T } | string => {
    const m0 = storage.mutations, before = storage.snapshot();
    let value: T;
    try { value = read(); } catch (error) { return `${what} threw: ${error instanceof Error ? error.stack ?? error.message : String(error)}`; }
    if (storage.mutations !== m0 || !same(before, storage.data)) return `${what} wrote to storage`;
    return { value };
  };
  const tabs: Tab[] = [];
  const open = (session: string, faults: readonly Fault[] = []): Tab | string => {
    const owner = {}, journal = new TimelineJournal(storage, new HarnessLock(queue, owner), session);
    storage.arm(faults);
    const read = readOnly(`a load of ${session}`, () => journal.load());
    storage.arm([]);
    if (typeof read === "string") return read;
    const l: TimelineLoad = read.value, s = game();
    if (l.kind === "loaded" && !eq(recorderNotes(l.recorder, s), model.durable.get(session) ?? [])) return `${session} loads notes the model doesn't hold`;
    const rec = l.kind === "loaded" ? l.recorder : createRecorder({ id: session, started: STARTED });
    const notes = l.kind === "loaded" ? (model.durable.get(session) ?? []).map((text) => ({ text, seq: 0 })) : [];
    const tab: Tab = { session, journal, rec, s, notes, owner };
    tabs.push(tab);
    return tab;
  };
  const note = (tab: Tab, text: string, ref?: string): void => {
    if (!addNote(tab.rec, tab.s, text, undefined, ref)) tab.notes.push({ text, ...(ref !== undefined ? { ref } : {}), seq: tab.rec.seq });
  };
  const damagedKeys = (): Set<string> => new Set(damage.map((d) => d.key));

  /** The model after one settled commit (not a repair) by `tab`; a string if storage disagrees. */
  const settle = (tab: Tab, r: TimelineCommit, before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>, mutations: number,
    requestSeq: number, ran: boolean): string | null => {
    const M = model, S = tab.session;
    const others = [M.current, M.previous].filter((x): x is string => x !== null && x !== S);
    if (!r.ok) {
      if (["conflict", "cancelled", "invalid", "lock-unavailable", "lock-failed"].includes(r.code) && mutations) return `a ${r.code} commit made ${mutations} mutating calls`;
      if (r.code === "protected" && !same(before, after)) return "a protected commit changed storage";
      if (!r.dropped.length) {
        if (before.get(JOURNAL) !== after.get(JOURNAL)) return `a failed (${r.code}) commit changed the journal`;
        return null;
      }
      // Previous was dropped for room by a committed smaller journal, then the commit failed.
      const j = rawJournal(restored(after).get(JOURNAL));
      const want: [string | null, string | null] = [M.current === S ? S : null, M.previous === S ? S : null];
      if (j.slots[0] !== want[0] || j.slots[1] !== want[1]) return `after a room drop the journal holds ${j.slots.join(",")}, expected ${want.join(",")}`;
      const bad = reports(r.dropped, others[0] ?? null, others[1] ?? null);
      if (bad) return bad;
      model = copyModel(M);
      for (const id of others) { model.durable.delete(id); model.totals.delete(id); }
      model.current = want[0]; model.previous = want[1];
      return null;
    }
    if (!ran) return "a commit succeeded without running in the lock";
    const fatal = damage.find((d) => d.kind !== "chunk");
    if (fatal) return `a commit succeeded over a damaged ${fatal.kind} (${fatal.key})`;
    const folded = rawJournal(restored(before).get(JOURNAL)).folded.get(S) ?? [];
    const named = rawJournal(restored(before).get(JOURNAL)).named;
    for (const n of tab.rec.rotated.map((x) => x.n!)) {
      const key = chunkKey(S, n);
      if (named.has(key) && !folded.includes(n) && damagedKeys().has(key)) return `a commit folded the damaged ${key}`;
    }
    if (r.seq < requestSeq || r.seq > tab.rec.seq) return `ok commit seq ${r.seq} outside [${requestSeq}, ${tab.rec.seq}]`;
    const migrating = !M.current && !M.previous && M.v1 !== null && M.v1 !== S;
    const expected = others[0] ?? (migrating ? M.v1 : null), displaced = others[1] ?? null;
    const j = rawJournal(restored(after).get(JOURNAL));
    if (!j.readable || j.slots[0] !== S) return `the committed journal's current is ${j.slots[0]}, not ${S}`;
    const P = j.slots[1], room = r.dropped.filter((d) => d.reason === "room");
    if (P !== expected) {
      if (P !== null) return `previous is ${P}, expected ${expected}`;
      if (!migrating && room.length !== 1) return `previous ${expected} left the journal unreported`;
    } else if (room.length) return "a room drop was reported but previous is kept";
    const bad = reports(r.dropped, room.length ? expected : null, displaced);
    if (bad) return bad;
    model = copyModel(M);
    if (displaced) { model.durable.delete(displaced); model.totals.delete(displaced); }
    if (P === null && expected !== null && !migrating) { model.durable.delete(expected); model.totals.delete(expected); }
    if (M.v1 !== null && (M.v1 === S || P === M.v1)) model.v1 = null;
    model.superseded = M.superseded || (M.v1 !== null && (M.v1 === S || P === M.v1));
    model.current = S; model.previous = P;
    model.durable.set(S, tab.notes.filter((n) => n.seq <= r.seq).map(keyOf).sort());
    model.totals.set(S, totalsOf(tab.rec, tab.s));
    return null;
  };
  /** The drop reports match the expeditions that went: `room` dropped for space, `displaced` replaced. */
  const reports = (dropped: TimelineCommit["dropped"], room: string | null, displaced: string | null): string | null => {
    const notesOf = (id: string | null): number => id === null ? 0 : model.durable.get(id)?.length ?? 0;
    const want = [...(displaced !== null && notesOf(displaced) ? [`replaced ${notesOf(displaced)}`] : []), ...(room !== null ? [`room ${notesOf(room)}`] : [])];
    const got = dropped.map((d) => `${d.reason} ${d.notes}`);
    return eq(got, want) ? null : `drops reported [${got.join("; ")}], expected [${want.join("; ")}]`;
  };
  /** One commit through the shared lock: the result and the storage around its action. */
  const commitVia = async (tab: Tab, journal: TimelineJournal, rec: TimelineRecorder, signal: AbortSignal) => {
    const before = storage.snapshot(), m0 = storage.mutations, n0 = queue.log.length;
    const r = await journal.commit(rec, tab.s, signal);
    const a = queue.log.slice(n0).find((x) => x.result === r);
    return { r, before: a?.before ?? before, after: a?.after ?? storage.snapshot(), mutations: a?.mutations ?? storage.mutations - m0, ran: !!a };
  };
  /** Each crash image holds every expedition's notes as before or after, its damage intact before
   * its journal changes, and loads unless something was damaged. */
  const images = (pre: Model, preDamage: Damage[], session: string): string | null => {
    for (const [i, img] of (storage.images ?? []).entries()) {
      const r = restored(img, preDamage);
      for (const id of new Set([...held(pre), ...held(model), ...SESSIONS, "D"])) {
        const got = rawNotes(r, id);
        if (!got) return `crash image ${i}: ${id}'s records can't be decoded`;
        if (!eq(got, pre.durable.get(id) ?? []) && !eq(got, model.durable.get(id) ?? [])) return `crash image ${i}: ${id} holds ${got.length} notes, neither before (${pre.durable.get(id)?.length ?? 0}) nor after (${model.durable.get(id)?.length ?? 0})`;
      }
      if (!preDamage.length) {
        const l = new TimelineJournal(FuzzStorage.of(img), new HarnessLock(new LockQueue(new FuzzStorage()), {}), session).load();
        if (l.kind === "protected") return `crash image ${i} protects with nothing damaged (${l.error})`;
      }
    }
    return null;
  };
  /** Before its first journal write, an operation never touches a damaged key. */
  const traceProblem = (preDamage: readonly Damage[]): string | null => {
    const keys = new Set(preDamage.map((d) => d.key));
    for (const t of storage.trace) {
      if (t === `set ${JOURNAL}`) return null;
      const key = t.slice(t.indexOf(" ") + 1);
      if (keys.has(key)) return `${t} before any journal write: a damaged record`;
    }
    return null;
  };

  const first = open(script.start);
  if (typeof first === "string") return fail(first);
  let active: Tab = first;
  for (const op of script.ops) {
    step++;
    log.push(`${step}: ${JSON.stringify(op)} (${active.session})`);
    const pre = copyModel(model), preDamage = [...damage];
    storage.trace = []; storage.opening = new Set(storage.data.keys());
    try {
      if (op.op === "note") {
        for (let i = 0; i < op.count; i++) {
          const earlier = active.notes.at(-1 - (counter % Math.max(1, active.notes.length)));
          const text = op.kind === "duplicate" && earlier ? earlier.text : op.kind === "long" ? `${active.session} long ${counter} ${"x".repeat(400)}` : `${active.session} note ${counter}`;
          note(active, text, op.kind === "ref" ? `save:${counter}` : undefined);
          counter++;
        }
      } else if (op.op === "events") {
        for (let i = 0; i < op.count; i++) {
          active.s.tick += 7; active.rec.playTicks += 7;
          recordEvent(active.rec, active.s, op.rich ? richEvent(i, active.s.tick) : { kind: i % 2 ? "poi" : "gather", what: "silica_glass", quantity: 1 });
        }
      } else if (op.op === "spans") {
        const rec = active.rec, s = active.s;
        s.tick += 1200; rec.playTicks += 1200;
        if (op.travel && !rec.travel) rec.travel = { hull: "dart", vehicleId: "dart_1", last: { x: 0, y: 0, z: 0 },
          piece: { tick: s.tick - 600, play: rec.playTicks / 60 - 10, movingTicks: 600, stationaryTicks: 30, metres: 120 } };
        if (op.idle && !rec.idle) rec.idle = { tick: s.tick - 900, play: rec.playTicks / 60, waiting: new Set(["decode"]) };
        if (op.pending) rec.pending.push({ tick: s.tick, play: rec.playTicks / 60, keys: [`cache:p${counter}`], losses: ["loss:dart_1"],
          cargo: [{ cache: `p${counter++}`, item: "silica_glass", kind: "stores", quantity: 2, last: 0 }] });
      } else if (op.op === "commit") {
        const tab = active, lock = op.lock ?? "ok";
        if (op.crash) storage.images = [];
        storage.arm(op.faults ?? []);
        let bad: string | null = null;
        if (lock === "rejected") {
          queue.reject = true;
          const c = await commitVia(tab, tab.journal, tab.rec, new AbortController().signal);
          queue.reject = false;
          if (c.r.ok) bad = "a commit succeeded with the lock refused";
          else bad = settle(tab, c.r, c.before, c.after, c.mutations, tab.rec.seq, c.ran);
        } else if (lock === "absent") {
          const journal = new TimelineJournal(storage, null, tab.session);
          const read = readOnly(`a lockless load of ${tab.session}`, () => journal.load());
          if (typeof read === "string") bad = read;
          else {
            const c = await commitVia(tab, journal, tab.rec, new AbortController().signal);
            bad = c.r.ok ? "a commit succeeded without a lock" : settle(tab, c.r, c.before, c.after, c.mutations, tab.rec.seq, c.ran);
          }
        } else if (lock === "aborted" || lock === "invalid") {
          const ctl = new AbortController();
          if (lock === "aborted") ctl.abort();
          const other = tabs.find((t) => t.session !== tab.session);
          const rec = lock === "invalid" ? other?.rec ?? createRecorder({ id: `${tab.session}x`, started: STARTED }) : tab.rec;
          const c = await commitVia(tab, tab.journal, rec, ctl.signal);
          bad = c.r.ok ? `an ${lock} commit succeeded` : settle(tab, c.r, c.before, c.after, c.mutations, tab.rec.seq, c.ran);
        } else if (op.gated) {
          const g = op.gated;
          let release!: () => void;
          queue.gate = new Promise<void>((r) => { release = r; });
          const ctl = new AbortController(), requestSeq = tab.rec.seq;
          const n0 = queue.log.length, before = storage.snapshot();
          const pa = tab.journal.commit(tab.rec, tab.s, ctl.signal);
          for (let i = 0; i < g.notes; i++) note(tab, `${tab.session} queued note ${counter++}`);
          if (g.afterAction) queue.afterAction = (a) => { if (a.owner === tab.owner) { note(tab, `${tab.session} after-action note ${counter++}`); queue.afterAction = null; } };
          let b: Tab | null = null, pb: Promise<TimelineCommit> | null = null;
          if (g.other) {
            const t = open(g.other);
            if (typeof t === "string") bad = t;
            else { b = t; note(b, `${b.session} interleaved note ${counter++}`); pb = b.journal.commit(b.rec, b.s, new AbortController().signal); }
          }
          if (g.abort) ctl.abort();
          queue.gate = null; release();
          const ra = await pa, rb = pb ? await pb : null;
          queue.afterAction = null;
          const actions = queue.log.slice(n0), aa = actions.find((x) => x.result === ra), ab = actions.find((x) => x.result === rb);
          if (g.abort && ra.ok) bad ??= "an aborted commit succeeded";
          bad ??= settle(tab, ra, aa?.before ?? before, aa?.after ?? (ab?.before ?? storage.snapshot()), aa?.mutations ?? 0, requestSeq, !!aa);
          if (b && rb) bad ??= settle(b, rb, ab?.before ?? storage.snapshot(), ab?.after ?? storage.snapshot(), ab?.mutations ?? 0, 0, !!ab);
          if (b && rb?.ok && counter % 2) active = b;
        } else {
          const requestSeq = tab.rec.seq;
          const c = await commitVia(tab, tab.journal, tab.rec, new AbortController().signal);
          log.push(`   -> ${c.r.ok ? `ok seq ${c.r.seq}` : c.r.code}${c.r.dropped.length ? ` dropped ${c.r.dropped.length}` : ""}`);
          bad = settle(tab, c.r, c.before, c.after, c.mutations, requestSeq, c.ran);
        }
        storage.arm([]);
        bad ??= traceProblem(preDamage);
        if (!bad && op.crash) bad = images(pre, preDamage, tab.session);
        storage.images = null;
        if (bad) return fail(bad);
      } else if (op.op === "quota") storage.quota = op.room === null ? Infinity : storage.usedChars + op.room;
      else if (op.op === "enter") {
        const t = open(op.session, op.faults ?? []);
        if (typeof t === "string") return fail(t);
        active = t;
      } else if (op.op === "other-tab") {
        const other = open(op.session);
        if (typeof other === "string") return fail(other);
        note(other, `${other.session} other-tab note ${counter++}`);
        const c = await commitVia(other, other.journal, other.rec, new AbortController().signal);
        log.push(`   -> other tab ${other.session}: ${c.r.ok ? "ok" : c.r.code}`);
        const bad = settle(other, c.r, c.before, c.after, c.mutations, other.rec.seq, c.ran) ?? traceProblem(preDamage);
        if (bad) return fail(bad);
        if (counter % 2) active = other;
      } else if (op.op === "corrupt") {
        const bad = corrupt(op);
        if (bad) return fail(bad);
      } else if (op.op === "repair") {
        const tab = tabs.find((t) => t.journal.protection !== null);
        if (tab) {
          storage.arm(op.faults ?? []);
          const read = readOnly("records()", () => tab.journal.records());
          if (typeof read === "string") return fail(read);
          const exported = read.value;
          if (typeof exported !== "string") {
            if (op.stale) storage.force(chunkKey("Z", counter++), "garbage left by another tab");
            if (op.crash) storage.images = [];
            const m0 = storage.mutations;
            const r = await tab.journal.repair(tab.rec, tab.s, new AbortController().signal, exported);
            storage.arm([]);
            log.push(`   -> repair ${tab.session}: ${r.ok ? "ok" : r.code}`);
            if (op.stale && r.ok) return fail("a repair over records changed since their export succeeded");
            let bad = traceProblem(preDamage);
            if (r.ok) {
              model = { current: tab.session, previous: null, v1: null, superseded: true,
                durable: new Map([[tab.session, tab.notes.filter((n) => n.seq <= r.seq).map(keyOf).sort()]]), totals: new Map([[tab.session, totalsOf(tab.rec, tab.s)]]) };
              damage = [];
              active = tab;
            } else {
              if (r.code === "conflict" && storage.mutations !== m0) bad ??= "a conflicting repair wrote";
              if (tab.journal.protection === null) bad ??= "a failed repair cleared protection";
              if ((storage.data.get(JOURNAL) ?? null) !== exported.journal || (storage.data.get(V1) ?? null) !== exported.v1 ||
                Object.entries(exported.chunks).some(([k, v]) => storage.data.get(k) !== v)) bad ??= "a failed repair changed the exported records";
            }
            if (!bad && op.crash) bad = images(pre, preDamage, tab.session);
            storage.images = null;
            if (bad) return fail(bad);
          }
          storage.arm([]);
        }
      } else if (op.op === "live") {
        const bad = await live(op, preDamage);
        if (bad) return fail(bad);
      }
    } catch (error) {
      return fail(`${op.op} threw: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    } finally { storage.arm([]); queue.gate = null; queue.reject = false; queue.afterAction = null; storage.images = null; }
    const bad = check();
    if (bad) return fail(bad);
  }
  return { ok: true, name: script.name, steps: script.ops.length, log };

  /** Damages one record, chosen by `op`; recorded only when it is live. */
  function corrupt(op: Extract<Op, { op: "corrupt" }>): string | null {
    const raw = storage.data.get(JOURNAL), j = rawJournal(raw);
    const chunks = op.chunk ? [chunkKey(op.chunk.session, op.chunk.n)] : [...storage.data.keys()].filter((k) => k.startsWith(PREFIX)).sort();
    const at = <T>(xs: readonly T[], x: number): T | undefined => xs[Math.floor(x * xs.length)];
    const apply = (key: string, value: string | null, kind: Damage["kind"]): void => {
      const original = storage.data.get(key) ?? null;
      if (original === value) return;
      storage.force(key, value);
      const known = damage.find((d) => d.key === key);
      const d: Damage = { key, value, original: known ? known.original : original, kind };
      damage = [...damage.filter((x) => x.key !== key), d];
      if (!liveDamage(d, storage.data) && !known) damage = damage.filter((x) => x !== d);
      log.push(`   corrupt ${kind} ${key}${damage.includes(d) ? "" : " (not live)"}`);
    };
    if (op.target === "journal-raw") apply(JOURNAL, at(["{bad", "null", "7", "[]", '""', deep(5000), '{"toString":null}', '{"format":"siltwake.timeline.journal","version":1}',
      '{"format":"siltwake.timeline.journal","version":1,"current":null,"v1Superseded":false}'], op.value)!, "journal");
    else if (op.target === "head" && raw !== undefined) {
      const v = json(raw);
      if (!isObj(v)) return null;
      const slot = op.pick < 0.5 ? "current" : "previous", h = v[slot];
      if (!isObj(h)) return null;
      const k = Math.floor(op.value * HEAD_FIELDS.length * HEAD_VALUES.length);
      const field = HEAD_FIELDS[k % HEAD_FIELDS.length]!, value = HEAD_VALUES[Math.floor(k / HEAD_FIELDS.length)];
      if (value === undefined) delete h[field]; else h[field] = value === "deep" ? JSON.parse(deep(100)) : value;
      apply(JOURNAL, JSON.stringify(v), "journal");
    } else if (op.target === "chunk") { const key = at(chunks, op.pick); if (key) apply(key, at(BAD_CHUNKS, op.value)!, "chunk"); }
    else if (op.target === "chunk-field") {
      const key = at(chunks, op.pick), c = key ? json(storage.data.get(key)) : undefined;
      if (!key || c === undefined) return null;
      // In events, `pick` chooses the event and `value` the wrong field; in a summary, `value` chooses
      // a kept event's wrong field, a bad stretch, a deeply nested extra field or a bad note saveRef alone.
      const pickIn = <T>(xs: readonly T[]): T | undefined => xs[Math.floor(((op.pick * 7919) % 1) * xs.length)];
      if (Array.isArray(c)) {
        const e = pickIn(c);
        if (!isObj(e)) return null;
        at(WRONG_FIELDS, op.value)!(e);
      } else if (isObj(c)) {
        const kept = (Array.isArray(c.kept) ? c.kept : []).filter(isObj), notes = kept.filter((e) => e.kind === "note");
        const options: ((x: Record<string, unknown>) => boolean)[] = [
          ...WRONG_FIELDS.map((f) => () => { const e = pickIn(kept); if (e) f(e); return !!e; }),
          (x) => { if (!isObj(x.travel)) return false; x.travel.long = [null]; return true; },
          (x) => { if (!isObj(x.travel)) return false; x.travel.long = [{ play: 1, seconds: 400, region: null }]; return true; },
          (x) => { if (!isObj(x.idle)) return false; x.idle.long = [{ play: 1, tick: 60, seconds: 900, waiting: [3], region: null }]; return true; },
          (x) => { x.extra = JSON.parse(deep(100)); return true; },
          () => { const e = pickIn(notes); if (e) e.saveRef = 7; return !!e; },
        ];
        if (!at(options, op.value)!(c)) c.extra = JSON.parse(deep(100));
      } else return null;
      apply(key, JSON.stringify(c), "chunk");
    } else if (op.target === "chunk-delete") {
      const named = chunks.filter((k) => j.named.has(k) || op.chunk), key = at(named, op.pick);
      if (key && storage.data.has(key)) apply(key, null, "missing");
    } else if (op.target === "v1") apply(V1, at(BAD_V1, op.value)!, "v1");
    return null;
  }

  /** A live timeline over the same storage: notes, a commit maybe held at the gate, then closed, disposed or replaced. */
  async function live(op: Extract<Op, { op: "live" }>, preDamage: readonly Damage[]): Promise<string | null> {
    const S = op.session;
    type Gen = { live: LiveTimeline; owner: object; tab: Tab; said: string[]; disposedAt: number | null };
    const openLive = (): Gen | string => {
      const owner = {}, said: string[] = [];
      const read = readOnly(`a live open of ${S}`, () => LiveTimeline.open(storage, new HarnessLock(queue, owner), { id: S, started: STARTED }, {},
        (m) => said.push(m), () => {}));
      if (typeof read === "string") return read;
      const lt = read.value, s = game();
      const loaded = !lt.protected && held(model).has(S);
      if (loaded && !eq(recorderNotes(lt.recorder, s), model.durable.get(S) ?? [])) return `live ${S} opens notes the model doesn't hold`;
      const notes = loaded ? (model.durable.get(S) ?? []).map((text) => ({ text, seq: 0 })) : [];
      return { live: lt, owner, said, disposedAt: null, tab: { session: S, journal: new TimelineJournal(null, null, S), rec: lt.recorder, s, notes, owner } };
    };
    const liveNote = (g: Gen, text: string): void => {
      const refused = g.live.note(g.tab.s, text);
      if (refused === null && !g.live.protected) g.tab.notes.push({ text, seq: g.tab.rec.seq });
    };
    const first = openLive();
    if (typeof first === "string") return first;
    const gens = [first], n0 = queue.log.length;
    let release!: () => void;
    if (op.gate) queue.gate = new Promise<void>((r) => { release = r; });
    if (op.afterAction) queue.afterAction = (a) => { if (a.owner === first.owner) { liveNote(first, `${S} live after-action ${counter++}`); queue.afterAction = null; } };
    for (let i = 0; i < op.notes; i++) liveNote(first, `${S} live note ${counter++}`);
    if (op.queued) liveNote(first, `${S} live queued ${counter++}`);
    if (op.end === "final") first.live.close(first.tab.s, true);
    else if (op.end === "dispose" || op.end === "replace") { first.live.close(null, false); first.disposedAt = queue.log.length; }
    if (op.end === "replace") {
      const second = openLive();
      if (typeof second === "string") return second;
      gens.push(second);
      liveNote(second, `${S} replacement note ${counter++}`);
    }
    if (op.gate) { queue.gate = null; release(); }
    await flush(queue);
    queue.afterAction = null;
    for (const g of gens) g.live.close(null, false);
    // Each generation's commits, in lock order.
    for (const a of queue.log.slice(n0)) {
      const g = gens.find((x) => x.owner === a.owner);
      if (!g) return "a lock action from no live generation";
      if (g.disposedAt !== null && a.index >= g.disposedAt && a.mutations) return "a disposed live generation wrote";
      const bad = settle(g.tab, a.result as TimelineCommit, a.before, a.after, a.mutations, 0, true);
      if (bad) return `live ${S}: ${bad}`;
    }
    for (const g of gens) {
      let saved = 0;
      for (const m of g.said) { const k = m === "Note saved to the play timeline." ? 1 : Number(/^(\d+) notes saved to the play timeline\.$/.exec(m)?.[1] ?? 0); saved += k; }
      const durable = [...(model.durable.get(S) ?? [])];
      const added = g.tab.notes.filter((n) => n.seq > 0).slice(0, saved).map(keyOf);
      for (const k of added) { const i = durable.indexOf(k); if (i < 0) return `live ${S} said "${k}" was saved, but it isn't committed`; durable.splice(i, 1); }
    }
    return traceProblem(preDamage);
  }

  /** The step's invariants over storage, the model and fresh readers. */
  function check(): string | null {
    if (storage.violations.length) return storage.violations[0]!;
    if (!queue.names.has(LOCK) && queue.names.size) return `the lock is requested by ${[...queue.names].join(", ")}`;
    for (const d of damage) {
      if ((storage.data.get(d.key) ?? null) !== d.value) return `the damaged ${d.key} changed without a repair`;
      if (!liveDamage(d, storage.data)) return `the damaged ${d.key} left the journal without a repair`;
    }
    const data = restored(storage.data), j = rawJournal(data.get(JOURNAL));
    if (!j.readable) return "the committed journal (damage undone) can't be read";
    if (j.slots[0] !== model.current || j.slots[1] !== model.previous) return `the journal holds [${j.slots.join(", ")}], the model [${model.current}, ${model.previous}]`;
    if (j.present && (j.v1Superseded === true) !== model.superseded) return `v1Superseded is ${String(j.v1Superseded)}, the model ${model.superseded}`;
    for (const id of [...SESSIONS, "D"]) {
      const got = rawNotes(data, id), want = model.durable.get(id) ?? [];
      if (!got || !eq(got, want)) return `${id}'s stored notes are ${got ? got.length : "undecodable"}, ${want.length} committed`;
    }
    for (const id of [...SESSIONS, "D"]) {
      const read = readOnly(`a fresh load of ${id}`, () => new TimelineJournal(storage, new HarnessLock(queue, {}), id).load());
      if (typeof read === "string") return read;
      const l = read.value;
      if (damage.length) { if (l.kind !== "protected") return `${id} loads (${l.kind}) over the damaged ${damage[0]!.key}`; continue; }
      if (l.kind === "protected") return `${id} protected with nothing damaged (${l.error})`;
      if (held(model).has(id) !== (l.kind === "loaded")) return `${id} is ${l.kind}, but the model ${held(model).has(id) ? "holds" : "doesn't hold"} it`;
      if (l.kind !== "loaded") continue;
      const s = game(), got = recorderNotes(l.recorder, s), want = model.durable.get(id) ?? [];
      if (!eq(got, want)) return `${id} reloads ${got.length} notes, ${want.length} committed`;
      const totals = model.totals.get(id);
      if (totals !== undefined && totalsOf(l.recorder, s) !== totals) return `${id} reloads other totals or pending recoveries than it committed`;
    }
    return null;
  }
}

/** Fixed scripts, each the smallest found to catch one known defect (SIM-1b R1, R2). */
const C = (n: number): Op => ({ op: "events", count: n, rich: false });
const COMMIT: Op = { op: "commit" };
export const REGRESSIONS: Script[] = [
  // A protected read never writes, even a write it then catches (the protect sentinel).
  { name: "a protected read writes nothing", v1: "none", start: "A", ops: [{ op: "note", count: 2, kind: "plain" }, COMMIT,
    { op: "corrupt", target: "journal-raw", pick: 0, value: 0 }, { op: "enter", session: "A" }] },
  // R1-F2: a hostile version 1 record protects, never throws.
  { name: "hostile version 1", v1: "hostile", start: "A", ops: [{ op: "note", count: 1, kind: "plain" }, COMMIT, { op: "enter", session: "B" }] },
  { name: "deep version 1", v1: "none", start: "A", ops: [{ op: "corrupt", target: "v1", pick: 0, value: 0.3 }, { op: "enter", session: "A" }] },
  // R1-F2: negative and unsafe counters protect.
  // (`value` = (k + 0.5) / 88 picks field k % 8 with value k / 8: notes -1, seq -1, notes 1e300, seq 1e300, nextChunk 2^60.)
  ...[20, 21, 28, 29, 35].map((k) => (k + 0.5) / 88).map((value): Script => ({ name: `head counter ${value.toFixed(3)}`, v1: "none", start: "A",
    ops: [{ op: "note", count: 2, kind: "plain" }, C(1100), COMMIT, { op: "corrupt", target: "head", pick: 0, value }, { op: "enter", session: "A" }] })),
  // R2-F1 / R1-F3: one wrong field, a bad stretch, a shallow summary in a chunk about to fold.
  ...[0.0, 0.31, 0.47, 0.62, 0.9].map((value): Script => ({ name: `wrong field ${value}`, v1: "none", start: "A",
    ops: [{ op: "note", count: 3, kind: "ref" }, C(1100), COMMIT, { op: "corrupt", target: "chunk-field", pick: 0, value, chunk: { session: "A", n: 0 } }, { op: "enter", session: "A" }] })),
  // (`value` = (k + 0.5) / 20 picks summary damage k: a kept note's text, a kept saveRef, the stretches, a deep extra field, a note's saveRef alone.)
  ...[0, 12, 15, 16, 17, 18, 19].map((k) => (k + 0.5) / 20).map((value): Script => ({ name: `wrong summary field ${value.toFixed(3)}`, v1: "none", start: "A",
    ops: [{ op: "note", count: 3, kind: "ref" }, C(21_100), COMMIT, { op: "corrupt", target: "chunk-field", pick: 0, value, chunk: { session: "A", n: 0 } }, { op: "enter", session: "A" }] })),
  ...[1, 4].map((value): Script => ({ name: `shallow summary folding ${value}`, v1: "none", start: "A",
    ops: [{ op: "note", count: 3, kind: "plain" }, C(20_100), COMMIT, { op: "corrupt", target: "chunk", pick: 0, value: (value + 0.5) / 7, chunk: { session: "A", n: 0 } },
      C(1000), COMMIT] })),
  // R1-F4: under quota, damage beyond the first fold target is read before any fold.
  { name: "quota with damage beyond the first fold", v1: "none", start: "A", ops: [{ op: "note", count: 2, kind: "plain" }, C(3010), COMMIT,
    { op: "corrupt", target: "chunk", pick: 0, value: 0, chunk: { session: "A", n: 1 } }, { op: "note", count: 4, kind: "long" }, { op: "note", count: 4, kind: "long" },
    { op: "quota", room: 100 }, COMMIT] },
  { name: "quota with a damaged previous", v1: "none", start: "A", ops: [{ op: "note", count: 2, kind: "plain" }, C(1010), COMMIT,
    { op: "enter", session: "B" }, C(20_010), COMMIT, { op: "corrupt", target: "chunk", pick: 0, value: 0, chunk: { session: "A", n: 0 } }, C(1000),
    { op: "quota", room: 500 }, COMMIT] },
  // R1-F1: a failed repair (at each write) leaves the protected records whole; staging never reuses a named number.
  ...[0, 1, 2, 3].map((at): Script => ({ name: `failed repair at write ${at}`, v1: "none", start: "A", ops: [{ op: "note", count: 2, kind: "plain" }, C(2010), COMMIT,
    { op: "corrupt", target: "chunk", pick: 0, value: 0, chunk: { session: "A", n: 0 } }, { op: "enter", session: "A" }, C(2000),
    { op: "repair", crash: true, faults: [{ call: "set", at, persistent: false, name: "SecurityError" }] }, { op: "repair" }] })),
  { name: "repair staging avoids a missing named number (seed 66769815)", v1: "none", start: "A", ops: [{ op: "note", count: 2, kind: "plain" }, C(2000), COMMIT,
    { op: "corrupt", target: "chunk-delete", pick: 0, value: 0, chunk: { session: "A", n: 1 } }, { op: "enter", session: "A" }, C(1000), { op: "repair", crash: true }] },
  // A repair that claims success has written its journal.
  { name: "a successful repair is durable", v1: "none", start: "A", ops: [{ op: "note", count: 2, kind: "plain" }, COMMIT,
    { op: "corrupt", target: "journal-raw", pick: 0, value: 0 }, { op: "enter", session: "A" }, { op: "note", count: 1, kind: "plain" }, { op: "repair" }] },
  // Every storage call can fail, once or for good, in a commit, a load and a repair's export.
  ...(["get", "set", "remove", "length", "key"] as const).flatMap((call) => [0, 1, 3].flatMap((at) => [false, true].map((persistent): Script => ({
    name: `${call} fault at ${at}${persistent ? " onward" : ""}`, v1: "own", start: "B", ops: [{ op: "note", count: 2, kind: "plain" }, C(1010), COMMIT,
      { op: "enter", session: "C" }, { op: "note", count: 1, kind: "plain" }, { op: "commit", crash: true, faults: [{ call, at, persistent }] },
      { op: "enter", session: "B", faults: [{ call, at, persistent }] }, COMMIT,
      { op: "corrupt", target: "chunk", pick: 0, value: 0 }, { op: "enter", session: "A" },
      { op: "repair", faults: [{ call, at, persistent }] }, { op: "repair", crash: true }] })))),
  // Lock boundaries: gated with interleaved notes and another tab, aborted, refused, absent; a live timeline closed mid-commit.
  { name: "lock boundaries", v1: "none", start: "A", ops: [{ op: "note", count: 1, kind: "plain" },
    { op: "commit", gated: { notes: 2, other: "B", abort: false, afterAction: true } }, { op: "commit", gated: { notes: 1, other: "A", abort: true, afterAction: false } },
    { op: "commit", lock: "rejected" }, { op: "commit", lock: "absent" }, { op: "commit", lock: "aborted" }, { op: "commit", lock: "invalid" },
    ...(["settle", "final", "dispose", "replace"] as const).map((end): Op => ({ op: "live", session: "A", notes: 2, gate: true, queued: true, afterAction: true, end }))] },
];
