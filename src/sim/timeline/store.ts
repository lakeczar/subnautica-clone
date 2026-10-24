/** The play timeline in local storage (SIM-05, SIM-1b), kept like the save slot
 * (`src/save/repository.ts`): one journal record is the commit point, holding
 * the current expedition's head and one previous expedition's. Each head names
 * its chunk keys (`siltwake.timeline.v2|<session>|<n>`): a chunk is written
 * once when sealed; when it rotates, the same key is overwritten with its
 * summary (notes, new things, deaths, recoveries and system events kept
 * verbatim). A commit writes the journal plus any new or folded chunk, never
 * the whole history.
 *
 * - Every commit runs inside one exclusive writer lock and is planned before
 *   it writes: the journal and both heads are parsed afresh by a total reader,
 *   one key listing checks that every chunk they name exists, a head about to
 *   be displaced is read whole, and a chunk a fold will overwrite is checked by
 *   the one chunk validator. A journal changed since this tab last saw it is a
 *   conflict: a stale base is never written over it.
 * - A steady commit changes no committed chunk before its journal: it writes
 *   new chunks, then the journal (the commit point), then its folds. A fold
 *   left unwritten is harmless: a chunk's key holds either its events or its
 *   summary, the same history.
 * - On a full quota, everything the quota plan may fold or drop (this
 *   expedition's committed chunks, the previous head) is read whole before the
 *   first fold. Then this expedition's oldest chunks fold, then previous is
 *   dropped, then the commit fails. A dropped timeline is reported once a
 *   committed journal no longer names it.
 * - Cleanup after a failed attempt removes only keys this attempt created that
 *   the committed journal doesn't name; it never touches the version 1 record.
 *   After a commit, it removes what that journal doesn't name.
 * - Reads are tri-state: an unreadable or malformed journal, head, chunk or
 *   version 1 record makes the store protected (no writes; memory and export
 *   only) until `repair` commits a replacement. A repair stages its chunks
 *   under new numbers, so a failed one leaves the protected records intact.
 * - The version 1 record migrates into current or previous by its session.
 *   The first committed journal holding that session marks it superseded, so
 *   a leftover record is garbage, never a veto, and it is removed after. */
import { closingEvents, exportHead, resumeRecorder, rotateOldest, TIMELINE_CHUNK_EVENTS, TIMELINE_STORAGE_KEY } from "./recorder.js";
import type { RecorderOptions, TimelineRecorder } from "./recorder.js";
import { parseTimeline, tooDeep, validTimeline } from "./report.js";
import type { ChunkSummary, TimelineEvent, TimelineExport } from "./report.js";
import type { WriterLockPort } from "../../save/writer-lock.js";
import type { GameState } from "../types.js";

/** The parts of `Storage` (localStorage) the timeline uses, enumeration included. */
export interface TimelineStoragePort {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const TIMELINE_JOURNAL_KEY = "siltwake.timeline.v2.journal";
/** All timeline writers on an origin use this lock name. */
export const TIMELINE_WRITER_LOCK = "siltwake.timeline.v2.writer";
export const TIMELINE_CHUNK_PREFIX = "siltwake.timeline.v2|";
const chunkKey = (session: string, n: number): string => `${TIMELINE_CHUNK_PREFIX}${encodeURIComponent(session)}|${n}`;
/** An export without summaries, whose `events` are the open chunk (open spans
 * closed as of the commit); `chunks` names its chunk keys oldest first and
 * `folded` (a prefix of them) those holding summaries. */
export type TimelineHead = Omit<TimelineExport, "rotated"> & { chunks: number[]; folded: number[]; nextChunk: number; commit: string; notes: number };
/** `v1Superseded`: a head of the version 1 record's session is (or was) committed here. */
export interface TimelineJournalRecord { format: "siltwake.timeline.journal"; version: 1; current: TimelineHead | null; previous: TimelineHead | null; v1Superseded: boolean }
type Journal = TimelineJournalRecord;
type Read<T> = { kind: "absent" } | { kind: "present"; value: T } | { kind: "unreadable"; error: string };
/** One stored chunk: its events, or its summary. */
type Chunk = { kind: "events"; events: TimelineEvent[] } | { kind: "summary"; summary: ChunkSummary };
/** A previous expedition's timeline a committed journal no longer names. */
export interface DroppedTimeline { label: string; notes: number; reason: "replaced" | "room" }
/** The raw records a repair replaces, exported first: the journal, the version 1 record and every chunk key. */
export interface TimelineRecords { journal: string | null; v1: string | null; chunks: Record<string, string> }

export type TimelineLoad =
  | { kind: "empty" }
  | { kind: "loaded"; recorder: TimelineRecorder; from: "current" | "previous" | "v1" }
  | { kind: "protected"; error: string };
export type TimelineCommitFailure = "conflict" | "protected" | "cancelled" | "lock-unavailable" | "lock-failed" | "write-refused" | "invalid";
/** `seq`: the recorder's sequence the commit made durable (every event before it is stored). */
export type TimelineCommit =
  | { ok: true; seq: number; rotated: boolean; dropped: DroppedTimeline[] }
  | { ok: false; code: TimelineCommitFailure; error: string; dropped: DroppedTimeline[] };

/** One expedition's timeline in storage, for one tab's session generation. */
export class TimelineJournal {
  /** The journal text as this tab last saw it. */
  private observed: string | null = null;
  private protectedReason: string | null = null;

  constructor(private readonly storage: TimelineStoragePort | null, private readonly lock: WriterLockPort | null, readonly session: string) {}
  /** Why the store is protected (null: it isn't). Only a committed repair clears it. */
  get protection(): string | null { return this.protectedReason; }

  /** This expedition's stored timeline. Both retained heads are read whole first. Total: never throws. */
  load(options: RecorderOptions = {}): TimelineLoad {
    try { return this.loadWhole(options); } catch { return this.protect("the stored timeline is malformed"); }
  }
  private loadWhole(options: RecorderOptions): TimelineLoad {
    if (!this.storage) return { kind: "empty" };
    const raw = this.read(TIMELINE_JOURNAL_KEY);
    if (raw.kind === "unreadable") return this.protect(`the journal can't be read (${raw.error})`);
    const j = raw.kind === "present" ? parseJournal(raw.value) : empty();
    if (typeof j === "string") return this.protect(j);
    this.observed = raw.kind === "present" ? raw.value : null;
    let mine: { head: TimelineHead; whole: Whole } | null = null;
    for (const head of [j.current, j.previous]) {
      if (!head) continue;
      const whole = this.readWhole(head);
      if (typeof whole === "string") return this.protect(whole);
      if (head.session.id === this.session) mine = { head, whole };
    }
    const v1 = j.v1Superseded ? { kind: "absent" as const } : this.legacy();
    if (v1.kind === "unreadable") return this.protect(`the version 1 record is unreadable (${v1.error})`);
    if (mine) {
      const recorder = resumeRecorder({ ...mine.whole.parsed, events: mine.head.events }, options,
        { sealed: mine.whole.sealed, nextChunk: mine.head.nextChunk });
      const bad = partitionProblem(recorder);
      return bad ? this.protect(bad) : { kind: "loaded", recorder, from: mine.head === j.current ? "current" : "previous" };
    }
    if (v1.kind === "present" && v1.value.session.id === this.session) {
      const recorder = resumeRecorder(v1.value, options), bad = partitionProblem(recorder);
      return bad ? this.protect(bad) : { kind: "loaded", recorder, from: "v1" };
    }
    return { kind: "empty" };
  }

  /** The raw records as stored now (for export before a repair); a string when they can't be read. */
  records(): TimelineRecords | string {
    const journal = this.read(TIMELINE_JOURNAL_KEY), v1 = this.read(TIMELINE_STORAGE_KEY), keys = this.keys();
    if (journal.kind === "unreadable" || v1.kind === "unreadable" || keys === null) return "browser storage can't be read now";
    const chunks: Record<string, string> = {};
    for (const key of keys) {
      const c = this.read(key);
      if (c.kind === "unreadable") return "browser storage can't be read now";
      if (c.kind === "present") chunks[key] = c.value;
    }
    return { journal: journal.kind === "present" ? journal.value : null, v1: v1.kind === "present" ? v1.value : null, chunks };
  }

  /** Commits the recorder's timeline, like `SaveRepository.commit`. */
  commit(rec: TimelineRecorder, s: GameState, signal: AbortSignal): Promise<TimelineCommit> {
    return this.locked(rec, signal, false, () => this.write(rec, s, false));
  }
  /** Replaces a protected store with this recorder's timeline, only while the raw records are
   * exactly `exported` (otherwise a conflict). Protection stays until the replacement commits. */
  repair(rec: TimelineRecorder, s: GameState, signal: AbortSignal, exported: TimelineRecords): Promise<TimelineCommit> {
    return this.locked(rec, signal, true, () => {
      const now = this.records();
      if (typeof now === "string") return failed("write-refused", `${now}; nothing was replaced`);
      if (!sameRecords(now, exported)) return failed("conflict", "the play-timeline store changed since it was exported");
      const r = this.write(rec, s, true);
      if (r.ok) this.protectedReason = null;
      return r;
    });
  }

  private async locked(rec: TimelineRecorder, signal: AbortSignal, repairing: boolean, work: () => TimelineCommit): Promise<TimelineCommit> {
    if (rec.session.id !== this.session) return failed("invalid", "this recorder belongs to another expedition");
    if (signal.aborted) return failed("cancelled", "the expedition was replaced");
    if (this.protectedReason && !repairing) return failed("protected", this.protectedReason);
    if (!this.storage || !this.lock) return failed("lock-unavailable", this.storage ? "this browser can't coordinate timeline saves between tabs" : "local storage is unavailable");
    try {
      return await this.lock.runExclusive(TIMELINE_WRITER_LOCK, signal, () => {
        if (signal.aborted) return failed("cancelled", "the expedition was replaced");
        try { return work(); } catch { return failed("write-refused", "the play timeline couldn't be written; the stored timeline is unchanged"); }
      });
    } catch {
      return signal.aborted ? failed("cancelled", "the expedition was replaced") : failed("lock-failed", "timeline-save coordination failed; nothing was written");
    }
  }

  /** Inside the writer lock: synchronous, so no other writer interleaves. `replacing`: a repair,
   * whose journal holds this timeline alone. */
  private write(rec: TimelineRecorder, s: GameState, replacing: boolean): TimelineCommit {
    const storage = this.storage!;
    // ---- The plan: everything this commit keeps, folds or drops is read afresh before the first write.
    /** The journal as committed now; null for a repair (its records are protected and kept until replaced). */
    let committed: Journal | null = null;
    if (!replacing) {
      const now = this.read(TIMELINE_JOURNAL_KEY);
      if (now.kind === "unreadable") return this.refuse(`the journal can't be read (${now.error})`);
      const raw = now.kind === "present" ? now.value : null;
      if (raw !== this.observed) return failed("conflict", "the play timeline changed in another tab");
      const parsed = raw === null ? empty() : parseJournal(raw);
      if (typeof parsed === "string") return this.refuse(parsed);
      committed = parsed;
    }
    const keys = this.keys();
    if (keys === null) return this.refuse("browser storage can't be listed");
    const present = new Set(keys);
    const base = committed ?? { ...empty(), v1Superseded: true };
    for (const h of [base.current, base.previous]) if (h && !h.chunks.every((n) => present.has(chunkKey(h.session.id, n))))
      return this.refuse("a stored timeline chunk is missing");
    const v1 = base.v1Superseded ? { kind: "absent" as const } : this.legacy();
    if (v1.kind === "unreadable") return this.refuse(`the version 1 record is unreadable (${v1.error})`);
    // A repair stages its chunks under numbers no stored key uses, so failing leaves the protected records whole.
    if (replacing) renumber(rec, keys, chunkKey(this.session, 0).slice(0, -1));
    const numbers = [...rec.rotated.map((r) => r.n), ...rec.sealed.map((c) => c.n)];
    if (numbers.some((n) => n === undefined) || new Set(numbers).size !== numbers.length) return failed("invalid", "timeline chunk numbers collide");
    const own = [base.current, base.previous].find((h) => h?.session.id === this.session) ?? null;
    const others = [base.current, base.previous].filter((h): h is TimelineHead => !!h && h.session.id !== this.session);
    let previous: TimelineHead | null = others[0] ?? null;
    const displaced = others[1] ?? null;
    if (displaced) { const whole = this.readWhole(displaced); if (typeof whole === "string") return this.refuse(whole); }
    const named = new Set(own?.chunks ?? []), ownFolded = new Set(own?.folded ?? []);
    // Chunks a fold will overwrite: read through the one chunk validator first.
    const stored = new Map<number, Chunk["kind"]>();
    for (const r of rec.rotated) {
      if (!named.has(r.n!) || ownFolded.has(r.n!)) continue;
      const c = this.chunk(this.session, r.n!);
      if (typeof c === "string") return this.refuse(c);
      stored.set(r.n!, c.kind);
    }
    // Another expedition's version 1 timeline, before any journal: it migrates into previous.
    let migrate = v1.kind === "present" && !base.current && !base.previous && v1.value.session.id !== this.session ? resumeRecorder(v1.value) : null;
    const v1Session = v1.kind === "present" ? v1.value.session.id : null;
    const dropped: DroppedTimeline[] = [];
    const written = new Set<string>();
    const put = (key: string, value: unknown): void => { written.add(key); storage.setItem(key, JSON.stringify(value)); };
    /** Keys this attempt created that the committed journal doesn't name (never the version 1 record). */
    const undo = (): void => {
      const live = liveKeys(committed);
      for (const key of written) if (!present.has(key) && !live.has(key)) this.remove(key);
      written.clear();
    };
    const folds = (): ChunkSummary[] => rec.rotated.filter((r) => named.has(r.n!) && stored.get(r.n!) === "events");
    let rotated = false, displacedGone = false, quotaMode = false;
    for (;;) {
      try {
        // A quota retry folds first (that frees room, and its chunks are already read whole);
        // a steady commit changes no committed chunk before the journal.
        if (quotaMode) for (const r of folds()) { put(chunkKey(this.session, r.n!), r); stored.set(r.n!, "summary"); }
        for (const r of rec.rotated) if (!named.has(r.n!)) put(chunkKey(this.session, r.n!), r);
        for (const c of rec.sealed) if (!named.has(c.n)) put(chunkKey(this.session, c.n), c.events);
        if (migrate) {
          for (const r of migrate.rotated) put(chunkKey(migrate.session.id, r.n!), r);
          for (const c of migrate.sealed) put(chunkKey(migrate.session.id, c.n), c.events);
          previous = headOf(migrate, migrate.events.at(-1)?.tick ?? 0, [], newCommit());
        }
        const next: Journal = { format: "siltwake.timeline.journal", version: 1,
          current: headOf(rec, s.tick, closingEvents(rec, s), newCommit()), previous, v1Superseded: false };
        next.v1Superseded = base.v1Superseded || (v1Session !== null && [next.current, next.previous].some((h) => h?.session.id === v1Session));
        const text = JSON.stringify(next);
        storage.setItem(TIMELINE_JOURNAL_KEY, text);
        this.observed = text;
        committed = next;
        // Folds after the commit point: one left unwritten keeps that chunk's events, the same history.
        for (const r of folds()) try { put(chunkKey(this.session, r.n!), r); } catch { break; }
        if (displaced?.notes && !displacedGone) dropped.unshift(label(displaced, "replaced"));
        this.collect(next, [...present, ...written]);
        return { ok: true, seq: rec.seq, rotated, dropped };
      } catch (error) {
        undo();
        if (!quota(error)) return failed("write-refused", `browser storage refused the timeline (${error instanceof Error ? error.message : String(error)}); the stored timeline is unchanged`, dropped);
      }
      if (migrate) { migrate = null; previous = null; continue; }   // the version 1 record then stays as it is
      if (!quotaMode) {
        // Quota pressure: what the plan may fold or drop is read whole before the first fold.
        quotaMode = true;
        if (previous) { const whole = this.readWhole(previous); if (typeof whole === "string") return this.refuse(whole); }
        for (const n of own?.chunks ?? []) {
          if (stored.has(n)) continue;
          const c = this.chunk(this.session, n);
          if (typeof c === "string") return this.refuse(c);
          stored.set(n, c.kind);
        }
        if (rec.rotated.some((r) => named.has(r.n!) && stored.get(r.n!) === "events")) continue;   // the planned folds first
      }
      if (rotateOldest(rec)) { rotated = true; continue; }
      if (!previous || replacing) return failed("write-refused", "the play timeline doesn't fit the browser's storage", dropped);
      // Drop previous: a smaller journal first (the commit point), then its keys.
      const smaller: Journal = { ...base, current: own === base.current ? base.current : null, previous: own === base.previous ? base.previous : null };
      const text = JSON.stringify(smaller);
      try { storage.setItem(TIMELINE_JOURNAL_KEY, text); } catch { return failed("write-refused", "the play timeline doesn't fit the browser's storage", dropped); }
      this.observed = text;
      committed = smaller;
      if (displaced && !displacedGone && displaced.notes) dropped.push(label(displaced, "replaced"));
      displacedGone = true;
      dropped.push(label(previous, "room"));
      previous = null;
      this.collect(smaller, [...present]);
    }
  }

  /** Removes the `candidates` that no head of the committed journal `j` names (best effort: a key
   * left is garbage for the next commit), and the version 1 record once `j` supersedes it. */
  private collect(j: Journal, candidates: readonly string[]): void {
    const live = liveKeys(j);
    for (const key of candidates) if (key.startsWith(TIMELINE_CHUNK_PREFIX) && !live.has(key)) this.remove(key);
    if (j.v1Superseded) this.remove(TIMELINE_STORAGE_KEY);
  }

  /** One stored chunk, through the one chunk validator; a string names what is wrong. */
  private chunk(session: string, n: number): Chunk | string {
    const c = this.read(chunkKey(session, n));
    if (c.kind !== "present") return `a stored timeline chunk is ${c.kind === "absent" ? "missing" : "unreadable"}`;
    return parseChunk(c.value, session);
  }
  /** A head's whole history, chunks included; a string names what is wrong. A chunk's key may
   * hold its summary or (a fold not yet written) its events: summaries first, then events. */
  private readWhole(head: TimelineHead): Whole | string {
    const rotated: ChunkSummary[] = [], sealed: { n: number; events: TimelineEvent[] }[] = [];
    for (const n of head.chunks) {
      const c = this.chunk(head.session.id, n);
      if (typeof c === "string") return c;
      if (c.kind === "summary") {
        if (sealed.length) return "a stored timeline's chunks are out of order";
        rotated.push({ ...c.summary, n });
      } else sealed.push({ n, events: c.events });
    }
    return { parsed: { ...head, rotated, events: [...sealed.flatMap((c) => c.events), ...head.events] }, sealed };
  }

  private protect(reason: string): TimelineLoad { this.protectedReason = reason; return { kind: "protected", error: reason }; }
  private refuse(reason: string): TimelineCommit { this.protectedReason = reason; return failed("protected", reason); }
  /** The version 1 record: absent, present (parsed) or unreadable (a malformed record included). */
  private legacy(): Read<TimelineExport> {
    const r = this.read(TIMELINE_STORAGE_KEY);
    if (r.kind !== "present") return r;
    const p = parseTimeline(r.value);
    return p.ok ? { kind: "present", value: p.value } : { kind: "unreadable", error: p.error };
  }
  /** Chunk keys in storage; null if storage can't be listed now. */
  private keys(): string[] | null {
    try {
      const out: string[] = [];
      for (let i = 0; i < this.storage!.length; i++) { const k = this.storage!.key(i); if (k?.startsWith(TIMELINE_CHUNK_PREFIX)) out.push(k); }
      return out;
    } catch { return null; }
  }
  private remove(key: string): void { try { this.storage!.removeItem(key); } catch { /* garbage for the next commit */ } }
  /** Absent, present (the raw text), or unreadable (storage threw). */
  private read(key: string): Read<string> {
    try { const text = this.storage!.getItem(key); return text === null ? { kind: "absent" } : { kind: "present", value: text }; }
    catch (e) { return { kind: "unreadable", error: e instanceof Error ? e.message : "storage threw" }; }
  }
}

type Whole = { parsed: TimelineExport; sealed: { n: number; events: TimelineEvent[] }[] };
const failed = (code: TimelineCommitFailure, error: string, dropped: DroppedTimeline[] = []): TimelineCommit => ({ ok: false, code, error, dropped });
const empty = (): Journal => ({ format: "siltwake.timeline.journal", version: 1, current: null, previous: null, v1Superseded: false });
const newCommit = (): string => `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
const liveKeys = (j: Journal | null): Set<string> =>
  new Set(j ? [j.current, j.previous].flatMap((h) => h ? h.chunks.map((n) => chunkKey(h.session.id, n)) : []) : []);
const sameRecords = (a: TimelineRecords, b: TimelineRecords): boolean => a.journal === b.journal && a.v1 === b.v1 &&
  Object.keys(a.chunks).length === Object.keys(b.chunks).length && Object.entries(a.chunks).every(([k, v]) => b.chunks[k] === v);
/** Gives the recorder's chunks numbers above every stored key under `prefix` (one session's chunks). */
function renumber(rec: TimelineRecorder, keys: readonly string[], prefix: string): void {
  let next = Math.max(rec.nextChunk, ...keys.filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(prefix.length)) + 1).filter(Number.isSafeInteger));
  for (const r of rec.rotated) r.n = next++;
  for (const c of rec.sealed) c.n = next++;
  rec.nextChunk = next;
}
const safe = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;

/** One chunk from untrusted text, through the one timeline validator. Total. */
export function parseChunk(text: string, session: string): Chunk | string {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return "a stored timeline chunk does not parse"; }
  const isEvents = Array.isArray(v);
  if (!isEvents && !(typeof v === "object" && v !== null && Array.isArray((v as ChunkSummary).kept))) return "a stored timeline chunk is malformed";
  if (isEvents && (v as unknown[]).length !== TIMELINE_CHUNK_EVENTS) return "a stored timeline chunk is malformed";
  const shell = { format: "siltwake.timeline", version: 2, dropped: 0, session: { id: session, started: "", end: { tick: 0, play: 0, idle: 0 } } };
  const r = validTimeline(isEvents ? { ...shell, events: v } : { ...shell, rotated: [v], events: [] });
  if (!r.ok) return `a stored timeline chunk is malformed (${r.error})`;
  return isEvents ? { kind: "events", events: v as TimelineEvent[] } : { kind: "summary", summary: v as ChunkSummary };
}

/** The journal from untrusted text: total (it never throws); a string names what is wrong. */
export function parseJournal(raw: string): Journal | string {
  try {
    const v: unknown = JSON.parse(raw);
    if (tooDeep(v) || !obj(v) || v.format !== "siltwake.timeline.journal" || v.version !== 1 ||
      !Object.hasOwn(v, "current") || !Object.hasOwn(v, "previous") || typeof v.v1Superseded !== "boolean") return "the journal is malformed";
    const current = head(v.current), previous = head(v.previous);
    if (typeof current === "string") return current;
    if (typeof previous === "string") return previous;
    if (current && previous && current.session.id === previous.session.id) return "the journal is malformed";
    return { format: "siltwake.timeline.journal", version: 1, current, previous, v1Superseded: v.v1Superseded };
  } catch { return "the journal is malformed"; }
}
function head(h: unknown): TimelineHead | null | string {
  if (h === null) return null;
  const bad = "a stored timeline head is malformed";
  if (!obj(h) || !obj(h.session) || typeof h.session.id !== "string" || typeof h.commit !== "string" || !safe(h.notes)) return bad;
  const ints = (a: unknown): a is number[] => Array.isArray(a) && a.every(safe) && new Set(a).size === a.length;
  const chunks = h.chunks, folded = h.folded, next = h.nextChunk;
  if (!ints(chunks) || !ints(folded) || !folded.every((n, i) => chunks[i] === n)) return bad;
  if (!safe(next) || !chunks.every((n) => n < next) || !safe(h.seq)) return bad;
  if (!Array.isArray(h.events) || h.events.length > TIMELINE_CHUNK_EVENTS + 1) return bad;
  // The head's own events and session through the one validator (the chunks are checked when read).
  const parsed = validTimeline({ ...h, rotated: [] });
  return parsed.ok ? h as unknown as TimelineHead : `${bad} (${parsed.error})`;
}
/** What is wrong with a restored recorder's chunk partition, or null. */
function partitionProblem(rec: TimelineRecorder): string | null {
  const numbers = [...rec.rotated.map((r) => r.n), ...rec.sealed.map((c) => c.n)];
  if (!numbers.every(safe) || new Set(numbers).size !== numbers.length || !numbers.every((n) => n! < rec.nextChunk) || !safe(rec.seq))
    return "a stored timeline's chunk numbers are inconsistent";
  if (rec.sealed.some((c) => c.events.length !== TIMELINE_CHUNK_EVENTS) || rec.events.length > TIMELINE_CHUNK_EVENTS + 1)
    return "a stored timeline's chunks are the wrong size";
  return null;
}
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** The recorder's head, ending at `tick`, its open spans closed by `closing`. */
function headOf(rec: TimelineRecorder, tick: number, closing: readonly TimelineEvent[], commit: string): TimelineHead {
  const { rotated: _summaries, ...rest } = exportHead(rec, tick, closing.length);
  return { ...rest, events: [...rec.events, ...closing], chunks: [...rec.rotated.map((r) => r.n!), ...rec.sealed.map((c) => c.n)],
    folded: rec.rotated.map((r) => r.n!), nextChunk: rec.nextChunk, commit, notes: countNotes(rec) };
}
/** Notes the recorder holds, rotated summaries' kept notes included, without copying its history. */
function countNotes(rec: TimelineRecorder): number {
  let n = 0;
  for (const r of rec.rotated) for (const e of r.kept) if (e.kind === "note") n++;
  for (const c of rec.sealed) for (const e of c.events) if (e.kind === "note") n++;
  for (const e of rec.events) if (e.kind === "note") n++;
  return n;
}
/** "the expedition started 23 Oct 2026 (2 h 14 min of play)". */
function label(h: TimelineHead, reason: DroppedTimeline["reason"]): DroppedTimeline {
  const started = new Date(h.session.started), play = Math.round(h.session.end.play / 60);
  const date = Number.isNaN(started.getTime()) ? "an earlier expedition" : `the expedition started ${started.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  return { label: `${date} (${play >= 60 ? `${Math.floor(play / 60)} h ${play % 60} min` : `${play} min`} of play)`, notes: h.notes, reason };
}
const quota = (error: unknown): boolean => error instanceof Error &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    (error as { code?: number }).code === 22 || (error as { code?: number }).code === 1014);
