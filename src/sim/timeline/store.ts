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
 *   one key listing checks that every chunk they name exists, and a head about
 *   to be dropped is read whole. Collection removes only chunk keys the
 *   journal just committed doesn't name. A journal changed since this tab last
 *   saw it is a conflict: a stale base is never written over it.
 * - Entering a different expedition moves current to previous; the older
 *   previous goes. On a full quota this expedition's oldest chunks fold first
 *   (from its own loaded events), then previous is dropped, then the commit
 *   fails. A dropped timeline is reported once a committed journal no longer
 *   names it.
 * - Reads are tri-state: an unreadable or malformed journal, head, chunk or
 *   version 1 record makes the store protected (no writes; memory and export
 *   only) until `repair` commits a replacement.
 * - The version 1 record migrates into current or previous by its session.
 *   The first committed journal holding that session marks it superseded, so
 *   a leftover record is garbage, never a veto, and it is removed after. */
import { closingEvents, exportHead, resumeRecorder, rotateOldest, TIMELINE_STORAGE_KEY } from "./recorder.js";
import type { RecorderOptions, TimelineRecorder } from "./recorder.js";
import { parseTimeline } from "./report.js";
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
const CHUNKS = "siltwake.timeline.v2|";
const chunkKey = (session: string, n: number): string => `${CHUNKS}${encodeURIComponent(session)}|${n}`;
/** An export without summaries, whose `events` are the open chunk (open spans
 * closed as of the commit); `chunks` names its chunk keys oldest first and
 * `folded` those holding summaries. */
export type TimelineHead = Omit<TimelineExport, "rotated"> & { chunks: number[]; folded: number[]; nextChunk: number; commit: string; notes: number };
/** `v1Superseded`: a head of the version 1 record's session is (or was) committed here. */
interface Journal { format: "siltwake.timeline.journal"; version: 1; current: TimelineHead | null; previous: TimelineHead | null; v1Superseded: boolean }
type Read<T> = { kind: "absent" } | { kind: "present"; value: T } | { kind: "unreadable"; error: string };
/** A previous expedition's timeline a committed journal no longer names. */
export interface DroppedTimeline { label: string; notes: number; reason: "replaced" | "room" }
/** The raw records a repair replaces, exported first. */
export interface TimelineRecords { journal: string | null; v1: string | null }

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

  /** This expedition's stored timeline. Both retained heads are read whole first, chunks included. */
  load(options: RecorderOptions = {}): TimelineLoad {
    if (!this.storage) return { kind: "empty" };
    const raw = this.read(TIMELINE_JOURNAL_KEY);
    if (raw.kind === "unreadable") return this.protect(`the journal can't be read (${raw.error})`);
    const j = raw.kind === "present" ? journal(raw.value) : empty();
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
    if (mine) return { kind: "loaded", recorder: resumeRecorder({ ...mine.whole.parsed, events: mine.head.events }, options,
      { sealed: mine.whole.sealed, nextChunk: mine.head.nextChunk }), from: mine.head === j.current ? "current" : "previous" };
    return v1.kind === "present" && v1.value.session.id === this.session ? { kind: "loaded", recorder: resumeRecorder(v1.value, options), from: "v1" } : { kind: "empty" };
  }

  /** The raw records as stored now (for export before a repair); a string when they can't be read. */
  records(): TimelineRecords | string {
    const journal = this.read(TIMELINE_JOURNAL_KEY), v1 = this.read(TIMELINE_STORAGE_KEY);
    if (journal.kind === "unreadable" || v1.kind === "unreadable") return "browser storage can't be read now";
    return { journal: journal.kind === "present" ? journal.value : null, v1: v1.kind === "present" ? v1.value : null };
  }

  /** Commits the recorder's timeline, like `SaveRepository.commit`. */
  commit(rec: TimelineRecorder, s: GameState, signal: AbortSignal): Promise<TimelineCommit> {
    return this.locked(rec, signal, false, () => this.write(rec, s, null));
  }
  /** Replaces a protected store with this recorder's timeline, only while the raw records are
   * exactly `exported` (otherwise a conflict). Protection stays until the replacement commits. */
  repair(rec: TimelineRecorder, s: GameState, signal: AbortSignal, exported: TimelineRecords): Promise<TimelineCommit> {
    return this.locked(rec, signal, true, () => {
      const now = this.records();
      if (typeof now === "string") return failed("write-refused", `${now}; nothing was replaced`);
      if (now.journal !== exported.journal || now.v1 !== exported.v1) return failed("conflict", "the play-timeline store changed since it was exported");
      const r = this.write(rec, s, now);
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
      return await this.lock.runExclusive(TIMELINE_WRITER_LOCK, signal, () => signal.aborted ? failed("cancelled", "the expedition was replaced") : work());
    } catch {
      return signal.aborted ? failed("cancelled", "the expedition was replaced") : failed("lock-failed", "timeline-save coordination failed; nothing was written");
    }
  }

  /** Inside the writer lock: synchronous, so no other writer interleaves. `replacing`: a repair's
   * exported records, replaced by a journal of this timeline alone. */
  private write(rec: TimelineRecorder, s: GameState, replacing: TimelineRecords | null): TimelineCommit {
    const storage = this.storage!;
    // Plan: everything this commit keeps or drops is read afresh before the first write.
    let j: Journal;
    if (replacing) j = { ...empty(), v1Superseded: true };
    else {
      const now = this.read(TIMELINE_JOURNAL_KEY);
      if (now.kind === "unreadable") return this.refuse(`the journal can't be read (${now.error})`);
      const raw = now.kind === "present" ? now.value : null;
      if (raw !== this.observed) return failed("conflict", "the play timeline changed in another tab");
      const parsed = raw === null ? empty() : journal(raw);
      if (typeof parsed === "string") return this.refuse(parsed);
      j = parsed;
    }
    const keys = this.keys();
    if (keys === null) return this.refuse("browser storage can't be listed");
    const present = new Set(keys);
    for (const h of [j.current, j.previous]) if (h && !h.chunks.every((n) => present.has(chunkKey(h.session.id, n))))
      return this.refuse("a stored timeline chunk is missing");
    const v1 = j.v1Superseded ? { kind: "absent" as const } : this.legacy();
    if (v1.kind === "unreadable") return this.refuse(`the version 1 record is unreadable (${v1.error})`);
    const numbers = [...rec.rotated.map((r) => r.n), ...rec.sealed.map((c) => c.n)];
    if (numbers.some((n) => n === undefined) || new Set(numbers).size !== numbers.length) return failed("invalid", "timeline chunk numbers collide");
    const own = [j.current, j.previous].find((h) => h?.session.id === this.session) ?? null;
    const others = [j.current, j.previous].filter((h): h is TimelineHead => !!h && h.session.id !== this.session);
    let previous: TimelineHead | null = others[0] ?? null;
    const displaced = others[1] ?? null;
    if (displaced) { const whole = this.readWhole(displaced); if (typeof whole === "string") return this.refuse(whole); }
    // Another expedition's version 1 timeline, before any journal: it migrates into previous.
    let migrate = v1.kind === "present" && !j.current && !j.previous && v1.value.session.id !== this.session ? resumeRecorder(v1.value) : null;
    const v1Session = v1.kind === "present" ? v1.value.session.id : null;
    const dropped: DroppedTimeline[] = [];
    const written = new Set<string>();
    let rotated = false, displacedGone = false, previousChecked = false;
    for (;;) {
      // A fold overwrites a committed chunk: that chunk is read first, and a damaged one protects.
      const damaged = this.checkFolds(rec, own);
      if (damaged) { this.collect(j, [...written]); return this.refuse(damaged); }
      try {
        this.writeChunks(rec, own, written);
        if (migrate) { this.writeChunks(migrate, null, written); previous = headOf(migrate, migrate.events.at(-1)?.tick ?? 0, [], newCommit()); }
        const next: Journal = { format: "siltwake.timeline.journal", version: 1,
          current: headOf(rec, s.tick, closingEvents(rec, s), newCommit()), previous, v1Superseded: false };
        next.v1Superseded = j.v1Superseded || (v1Session !== null && [next.current, next.previous].some((h) => h?.session.id === v1Session));
        const text = JSON.stringify(next);
        storage.setItem(TIMELINE_JOURNAL_KEY, text);
        this.observed = text;
        // Reported only now that the committed journal no longer names it.
        if (displaced?.notes && !displacedGone) dropped.unshift(label(displaced, "replaced"));
        this.collect(next, [...present, ...written]);
        return { ok: true, seq: rec.seq, rotated, dropped };
      } catch (error) {
        // This attempt's keys that the stored journal doesn't name go first, whatever follows.
        this.collect(j, [...written]);
        if (!quota(error)) return failed("write-refused", `browser storage refused the timeline (${error instanceof Error ? error.message : String(error)}); the stored timeline is unchanged`, dropped);
      }
      if (migrate) { migrate = null; previous = null; continue; }   // the version 1 record then stays as it is
      // Room may come to need dropping previous: it is read whole before anything is folded.
      if (previous && !previousChecked) {
        previousChecked = true;
        const whole = this.readWhole(previous);
        if (typeof whole === "string") return this.refuse(whole);
      }
      if (rotateOldest(rec)) { rotated = true; continue; }
      if (!previous || replacing) return failed("write-refused", "the play timeline doesn't fit the browser's storage", dropped);
      // Drop previous: a smaller journal first (the commit point), then its keys.
      const smaller: Journal = { ...j, current: own === j.current ? j.current : null, previous: own === j.previous ? j.previous : null };
      const text = JSON.stringify(smaller);
      try { storage.setItem(TIMELINE_JOURNAL_KEY, text); } catch { return failed("write-refused", "the play timeline doesn't fit the browser's storage", dropped); }
      this.observed = text;
      if (displaced && !displacedGone && displaced.notes) dropped.push(label(displaced, "replaced"));
      displacedGone = true;
      dropped.push(label(previous, "room"));
      previous = null;
      j = smaller;
      this.collect(j, [...present]);
    }
  }

  /** The first stored chunk this commit would fold that doesn't read as its own history, or null. */
  private checkFolds(rec: TimelineRecorder, own: TimelineHead | null): string | null {
    if (!own) return null;
    const named = new Set(own.chunks), folded = new Set(own.folded);
    for (const r of rec.rotated) {
      if (!named.has(r.n!) || folded.has(r.n!)) continue;
      const c = this.read(chunkKey(rec.session.id, r.n!));
      if (c.kind !== "present") return `a stored timeline chunk is ${c.kind === "absent" ? "missing" : "unreadable"}`;
      try {
        const v: unknown = JSON.parse(c.value);
        if (isSummary(v)) continue;
        if (!Array.isArray(v) || !v.length || !parseTimeline(JSON.stringify({ format: "siltwake.timeline", version: 2, dropped: 0,
          session: { id: rec.session.id, started: rec.session.started, end: { tick: 0, play: 0, idle: 0 } }, events: v })).ok)
          return "a stored timeline chunk is malformed";
      } catch { return "a stored timeline chunk does not parse"; }
    }
    return null;
  }

  /** New chunks and folds for `rec`, given its stored head `own` (null: none). */
  private writeChunks(rec: TimelineRecorder, own: TimelineHead | null, written: Set<string>): void {
    const id = rec.session.id, named = new Set(own?.chunks ?? []), folded = new Set(own?.folded ?? []);
    const put = (n: number, value: unknown): void => { const key = chunkKey(id, n); written.add(key); this.storage!.setItem(key, JSON.stringify(value)); };
    for (const r of rec.rotated) if (!folded.has(r.n!)) put(r.n!, r);
    for (const c of rec.sealed) if (!named.has(c.n) || folded.has(c.n)) put(c.n, c.events);
  }

  /** Removes the `candidates` that no head of the stored journal `j` names (best effort: a key
   * left is garbage for the next commit), and the version 1 record once `j` supersedes it. */
  private collect(j: Journal, candidates: readonly string[]): void {
    const live = new Set([j.current, j.previous].flatMap((h) => h ? h.chunks.map((n) => chunkKey(h.session.id, n)) : []));
    for (const key of candidates) if (key.startsWith(CHUNKS) && !live.has(key)) this.remove(key);
    if (j.v1Superseded) this.remove(TIMELINE_STORAGE_KEY);
  }

  /** A head's whole history, chunk contents included, through the one parser; a string names what is wrong. */
  private readWhole(head: TimelineHead): Whole | string {
    try {
      const rotated: ChunkSummary[] = [], sealed: { n: number; events: TimelineEvent[] }[] = [];
      for (const n of head.chunks) {
        const c = this.read(chunkKey(head.session.id, n));
        if (c.kind !== "present") return `a stored timeline chunk is ${c.kind === "absent" ? "missing" : "unreadable"}`;
        let v: unknown;
        try { v = JSON.parse(c.value); } catch { return "a stored timeline chunk does not parse"; }
        // A chunk key is only ever replaced by its own summary, so either form is the same
        // history (a crash between a fold and its journal leaves the summary).
        if (isSummary(v)) rotated.push({ ...v, n });
        else if (!head.folded.includes(n) && Array.isArray(v) && v.length) sealed.push({ n, events: v as TimelineEvent[] });
        else return "a stored timeline chunk is malformed";
      }
      const parsed = parseTimeline(JSON.stringify({ ...head, rotated, events: [...sealed.flatMap((c) => c.events), ...head.events] }));
      return parsed.ok ? { parsed: parsed.value, sealed } : `a stored timeline is malformed (${parsed.error})`;
    } catch { return "a stored timeline is malformed"; }
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
      for (let i = 0; i < this.storage!.length; i++) { const k = this.storage!.key(i); if (k?.startsWith(CHUNKS)) out.push(k); }
      return out;
    } catch { return null; }
  }
  private remove(key: string): void { try { this.storage!.removeItem(key); } catch { /* garbage for the next commit */ } }
  /** Absent, present (the raw text), or unreadable (storage threw). */
  private read(key: string): Read<string> {
    try { const text = this.storage!.getItem(key); return text === null ? { kind: "absent" } : { kind: "present", value: text }; }
    catch (e) { return { kind: "unreadable", error: e instanceof Error ? e.message : String(e) }; }
  }
}

type Whole = { parsed: TimelineExport; sealed: { n: number; events: TimelineEvent[] }[] };
const failed = (code: TimelineCommitFailure, error: string, dropped: DroppedTimeline[] = []): TimelineCommit => ({ ok: false, code, error, dropped });
const empty = (): Journal => ({ format: "siltwake.timeline.journal", version: 1, current: null, previous: null, v1Superseded: false });
const newCommit = (): string => `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;

/** The journal from untrusted text: total (it never throws), a string names what is wrong. Each
 * head's own fields are checked before anything reads them, then its events go through the one parser. */
function journal(raw: string): Journal | string {
  try {
    const v: unknown = JSON.parse(raw);
    if (!obj(v) || v.format !== "siltwake.timeline.journal" || v.version !== 1) return "the journal is malformed";
    if (v.v1Superseded !== undefined && typeof v.v1Superseded !== "boolean") return "the journal is malformed";
    const current = head(v.current ?? null), previous = head(v.previous ?? null);
    if (typeof current === "string") return current;
    if (typeof previous === "string") return previous;
    if (current && previous && current.session.id === previous.session.id) return "the journal is malformed";
    return { format: "siltwake.timeline.journal", version: 1, current, previous, v1Superseded: v.v1Superseded === true };
  } catch { return "the journal is malformed"; }
}
function head(h: unknown): TimelineHead | null | string {
  if (h === null) return null;
  const bad = "a stored timeline head is malformed";
  if (!obj(h) || !obj(h.session) || typeof h.session.id !== "string" || typeof h.commit !== "string" || !num(h.notes)) return bad;
  const ints = (a: unknown): a is number[] => Array.isArray(a) && a.every((n) => Number.isInteger(n) && n >= 0) && new Set(a).size === a.length;
  if (!ints(h.chunks) || !ints(h.folded) || !h.folded.every((n) => (h.chunks as number[]).includes(n))) return bad;
  if (!Number.isInteger(h.nextChunk) || !h.chunks.every((n) => n < (h.nextChunk as number)) || !Array.isArray(h.events)) return bad;
  // The head's own events and session through the one parser (the chunks are checked when read whole).
  const parsed = parseTimeline(JSON.stringify({ ...h, rotated: [] }));
  return parsed.ok ? h as unknown as TimelineHead : `${bad} (${parsed.error})`;
}
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
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
const isSummary = (v: unknown): v is ChunkSummary => typeof v === "object" && v !== null && !Array.isArray(v) && Array.isArray((v as ChunkSummary).kept);
const quota = (error: unknown): boolean => error instanceof Error &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    (error as { code?: number }).code === 22 || (error as { code?: number }).code === 1014);
