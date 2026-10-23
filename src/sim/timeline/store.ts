/** The play timeline in local storage (SIM-05), kept like the save slot
 * (`src/save/repository.ts`): one journal record is the commit point, holding
 * the current expedition's head and one previous expedition's. Each head names
 * its chunk keys (`siltwake.timeline.v2|<session>|<n>`): a chunk is written
 * once when sealed; when it rotates, the same key is overwritten with its
 * summary (notes, new things, deaths, recoveries and system events kept
 * verbatim). A commit rewrites the journal, never the whole history.
 *
 * - Every commit runs inside one exclusive writer lock: chunk writes, the
 *   journal write, then removal of the chunk keys no head names. A journal
 *   changed since this tab observed it, whose current head isn't this tab's
 *   last commit, is a conflict: a stale base is never written over it.
 * - Entering a different expedition moves current to previous; the older
 *   previous goes. On a full quota this expedition's oldest chunks fold
 *   first, then previous is dropped, then the commit fails. A dropped timeline
 *   is reported (by start date and play time) once a committed journal no
 *   longer names it.
 * - Both retained heads, with their chunks, pass the one validator `load`
 *   uses before anything may replace or drop them; an unreadable journal,
 *   head, chunk or version 1 record makes the store protected: no writes,
 *   memory and export only, until an explicit `repair`.
 * - The version 1 record migrates into current or previous by its session and
 *   goes only once a committed journal names its replacement. */
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
interface Journal { format: "siltwake.timeline.journal"; version: 1; current: TimelineHead | null; previous: TimelineHead | null }
type Read<T> = { kind: "absent" } | { kind: "present"; value: T } | { kind: "unreadable"; error: string };
/** A previous expedition's timeline a committed journal no longer names. */
export interface DroppedTimeline { label: string; notes: number; reason: "replaced" | "room" }
/** The raw records a repair replaces, exported first. */
export interface TimelineRecords { journal: string | null; v1: string | null }

export type TimelineLoad =
  | { kind: "empty" }
  | { kind: "loaded"; recorder: TimelineRecorder; from: "current" | "previous" | "v1" }
  | { kind: "protected"; error: string };
export type TimelineCommitFailure = "conflict" | "protected" | "cancelled" | "lock-unavailable" | "lock-failed" | "storage-unavailable" | "write-refused" | "invalid";
/** `seq`: the recorder's sequence the commit made durable (every event before it is stored). */
export type TimelineCommit =
  | { ok: true; seq: number; rotated: boolean; dropped: DroppedTimeline[] }
  | { ok: false; code: TimelineCommitFailure; error: string; dropped: DroppedTimeline[] };

/** One expedition's timeline in storage, for one tab's session generation. */
export class TimelineJournal {
  /** The records as this tab last saw them. */
  private observed: string | null = null;
  private lastCommit: string | null = null;
  private protectedReason: string | null = null;
  /** Heads (by commit) already read whole through the validator. */
  private readonly verified = new Set<string>();

  constructor(private readonly storage: TimelineStoragePort | null, private readonly lock: WriterLockPort | null, readonly session: string) {}
  /** Why the store is protected (null: it isn't). */
  get protection(): string | null { return this.protectedReason; }

  /** This expedition's stored timeline. Both retained heads are read whole first. */
  load(options: RecorderOptions = {}): TimelineLoad {
    if (!this.storage) return { kind: "empty" };
    const raw = this.read(TIMELINE_JOURNAL_KEY);
    if (raw.kind === "unreadable") return this.protect(`the journal can't be read (${raw.error})`);
    this.observed = raw.kind === "present" ? raw.value : null;
    const j = this.observed === null ? empty() : journal(this.observed);
    if (!j) return this.protect("the journal is malformed");
    // Both retained heads are read whole, whichever expedition this is.
    let mine: { head: TimelineHead; r: Exclude<ReturnType<TimelineJournal["readHead"]>, string> } | null = null;
    for (const head of [j.current, j.previous]) {
      if (!head) continue;
      const r = this.readHead(head);
      if (typeof r === "string") return this.protect(r);
      this.verified.add(head.commit);
      if (head.session.id === this.session) mine = { head, r };
    }
    const v1 = this.legacy();
    if (v1.kind === "unreadable") return this.protect(`the version 1 record is unreadable (${v1.error})`);
    if (mine) return { kind: "loaded", recorder: resumeRecorder({ ...mine.r.parsed, events: mine.head.events }, options,
      { sealed: mine.r.sealed, nextChunk: mine.head.nextChunk }), from: mine.head === j.current ? "current" : "previous" };
    return v1.kind === "present" && v1.value.session.id === this.session ? { kind: "loaded", recorder: resumeRecorder(v1.value, options), from: "v1" } : { kind: "empty" };
  }

  /** The raw records as stored now (for export before a repair); a string when they can't be read at all. */
  records(): TimelineRecords | string {
    const journal = this.read(TIMELINE_JOURNAL_KEY), v1 = this.read(TIMELINE_STORAGE_KEY);
    if (journal.kind === "unreadable" || v1.kind === "unreadable") return "browser storage can't be read now";
    return { journal: journal.kind === "present" ? journal.value : null, v1: v1.kind === "present" ? v1.value : null };
  }

  /** Commits the recorder's timeline, like `SaveRepository.commit`. */
  commit(rec: TimelineRecorder, s: GameState, signal: AbortSignal): Promise<TimelineCommit> {
    return this.locked(rec, signal, () => this.write(rec, s));
  }
  /** Replaces a protected store with this recorder's timeline: only while the records are
   * exactly `exported` (otherwise a conflict), and only through the writer lock. */
  repair(rec: TimelineRecorder, s: GameState, signal: AbortSignal, exported: TimelineRecords): Promise<TimelineCommit> {
    return this.locked(rec, signal, () => {
      const now = this.records();
      if (typeof now === "string") return failed("storage-unavailable", now);
      if (now.journal !== exported.journal || now.v1 !== exported.v1) return failed("conflict", "the play-timeline store changed since it was exported");
      this.protectedReason = null;
      this.observed = now.journal;
      this.lastCommit = null;
      return this.write(rec, s, { journal: empty(), replacing: true });
    }, true);
  }

  private async locked(rec: TimelineRecorder, signal: AbortSignal, work: () => TimelineCommit, repairing = false): Promise<TimelineCommit> {
    if (rec.session.id !== this.session) return failed("invalid", "this recorder belongs to another expedition");
    if (signal.aborted) return failed("cancelled", "the expedition was replaced");
    if (this.protectedReason && !repairing) return failed("protected", this.protectedReason);
    if (!this.storage) return failed("storage-unavailable", "local storage is unavailable");
    if (!this.lock) return failed("lock-unavailable", "this browser can't coordinate timeline saves between tabs");
    try {
      return await this.lock.runExclusive(TIMELINE_WRITER_LOCK, signal, () => signal.aborted ? failed("cancelled", "the expedition was replaced") : work());
    } catch {
      return signal.aborted ? failed("cancelled", "the expedition was replaced") : failed("lock-failed", "timeline-save coordination failed; nothing was written");
    }
  }

  /** Inside the writer lock: synchronous, so no other writer interleaves. `base`: a repair's empty journal. */
  private write(rec: TimelineRecorder, s: GameState, base?: { journal: Journal; replacing: true }): TimelineCommit {
    const storage = this.storage!;
    let j: Journal;
    if (base) j = base.journal;
    else {
      const now = this.read(TIMELINE_JOURNAL_KEY);
      if (now.kind === "unreadable") return failed("storage-unavailable", `the journal can't be read (${now.error}); nothing was written`);
      const raw = now.kind === "present" ? now.value : null, parsed = raw === null ? empty() : journal(raw);
      if (raw !== this.observed && (this.lastCommit === null || parsed?.current?.commit !== this.lastCommit))
        return failed("conflict", "the play timeline changed in another tab");
      if (!parsed) return this.refuse("the journal is malformed");
      // Nothing may replace or drop a head (or the version 1 record) that its own load would protect.
      const bad = this.verify(parsed);
      if (bad) return this.refuse(bad);
      if (this.legacy().kind === "unreadable") return this.refuse("the version 1 record is unreadable");
      this.observed = raw;
      j = parsed;
    }
    const numbers = [...rec.rotated.map((r) => r.n), ...rec.sealed.map((c) => c.n)];
    if (numbers.some((n) => n === undefined) || new Set(numbers).size !== numbers.length) return failed("invalid", "timeline chunk numbers collide");
    const v1 = this.legacy();
    const own = [j.current, j.previous].find((h) => h?.session.id === this.session) ?? null;
    const others = [j.current, j.previous].filter((h): h is TimelineHead => !!h && h.session.id !== this.session);
    let previous: TimelineHead | null = others[0] ?? null;
    const displaced = others[1] ?? null, dropped: DroppedTimeline[] = [];
    let rotated = false, displacedGone = false;
    // Another expedition's version 1 timeline, before any journal: it migrates into previous.
    let migrate = !base && v1.kind === "present" && !j.current && !j.previous && v1.value.session.id !== this.session ? resumeRecorder(v1.value) : null;
    for (;;) {
      try {
        this.writeChunks(rec, own);
        if (migrate) { this.writeChunks(migrate, null); previous = headOf(migrate, migrate.events.at(-1)?.tick ?? 0, [], this.newCommit()); }
        const commit = this.newCommit();
        const next: Journal = { format: "siltwake.timeline.journal", version: 1, current: headOf(rec, s.tick, closingEvents(rec, s), commit), previous };
        const text = JSON.stringify(next);
        storage.setItem(TIMELINE_JOURNAL_KEY, text);
        this.observed = text;
        this.lastCommit = commit;
        this.verified.add(commit);
        if (previous) this.verified.add(previous.commit);
        // Reported only now that the committed journal no longer names it.
        if (displaced?.notes && !displacedGone) dropped.unshift(label(displaced, "replaced"));
        this.collect(next, base !== undefined);
        return { ok: true, seq: rec.seq, rotated, dropped };
      } catch (error) {
        if (!quota(error)) return failed("write-refused", `browser storage refused the timeline (${error instanceof Error ? error.message : String(error)}); the stored timeline is unchanged`, dropped);
      }
      if (!base) this.collect(j, false);   // this attempt's keys that the stored journal doesn't name
      if (migrate) { migrate = null; previous = null; continue; }   // the version 1 record then stays as it is
      if (rotateOldest(rec)) { rotated = true; continue; }
      if (!previous || base) return failed("write-refused", "the play timeline doesn't fit the browser's storage", dropped);
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
      this.collect(j, false);
    }
  }

  /** New chunks and folds for `rec`, given its stored head `own` (null: none). */
  private writeChunks(rec: TimelineRecorder, own: TimelineHead | null): void {
    const id = rec.session.id, named = new Set(own?.chunks ?? []), folded = new Set(own?.folded ?? []);
    for (const r of rec.rotated) if (!folded.has(r.n!)) this.storage!.setItem(chunkKey(id, r.n!), JSON.stringify(r));
    for (const c of rec.sealed) if (!named.has(c.n) || folded.has(c.n)) this.storage!.setItem(chunkKey(id, c.n), JSON.stringify(c.events));
  }

  /** Removes chunk keys no head of the stored journal `j` names, and the version 1 record once
   * `j` replaces it (or `replaced`, a repair: it was exported). */
  private collect(j: Journal, replaced: boolean): void {
    const live = new Set([j.current, j.previous].flatMap((h) => h ? h.chunks.map((n) => chunkKey(h.session.id, n)) : []));
    for (const key of this.keys(CHUNKS)) if (!live.has(key) && !this.remove(key)) return;
    const v1 = this.legacy();
    if (replaced ? v1.kind !== "absent" : v1.kind === "present" && [j.current, j.previous].some((h) => h?.session.id === v1.value.session.id))
      this.remove(TIMELINE_STORAGE_KEY);
  }

  /** The first problem reading either retained head whole, or null. Checked once per head commit. */
  private verify(j: Journal): string | null {
    for (const h of [j.current, j.previous]) {
      if (!h || this.verified.has(h.commit)) continue;
      const r = this.readHead(h);
      if (typeof r === "string") return r;
      this.verified.add(h.commit);
    }
    return null;
  }
  /** A head and its chunks, through the one parser; a string names what is wrong. */
  private readHead(head: TimelineHead): { parsed: TimelineExport; sealed: { n: number; events: TimelineEvent[] }[] } | string {
    const rotated: ChunkSummary[] = [], sealed: { n: number; events: TimelineEvent[] }[] = [];
    const numbers = (a: unknown): boolean => Array.isArray(a) && a.every((n) => Number.isInteger(n) && n >= 0);
    if (!numbers(head.chunks) || !numbers(head.folded) || !head.folded.every((n) => head.chunks.includes(n)) ||
      !Number.isInteger(head.nextChunk) || typeof head.notes !== "number") return `a stored timeline head is malformed`;
    for (const n of head.chunks) {
      const c = this.read(chunkKey(head.session.id, n));
      if (c.kind !== "present") return `a stored timeline chunk is ${c.kind === "absent" ? "missing" : "unreadable"}`;
      let v: unknown;
      try { v = JSON.parse(c.value); } catch { return "a stored timeline chunk does not parse"; }
      if (isSummary(v)) rotated.push({ ...v, n });
      else if (Array.isArray(v) && v.length) sealed.push({ n, events: v as TimelineEvent[] });
      else return "a stored timeline chunk is malformed";
    }
    const parsed = parseTimeline(JSON.stringify({ ...head, rotated, events: [...sealed.flatMap((c) => c.events), ...head.events] }));
    return parsed.ok ? { parsed: parsed.value, sealed } : `a stored timeline is malformed (${parsed.error})`;
  }

  private newCommit(): string { return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`; }
  private protect(reason: string): TimelineLoad { this.protectedReason = reason; return { kind: "protected", error: reason }; }
  private refuse(reason: string): TimelineCommit { this.protectedReason = reason; return failed("protected", reason); }
  /** The version 1 record: absent, present (parsed) or unreadable (a malformed record included). */
  private legacy(): Read<TimelineExport> {
    const r = this.read(TIMELINE_STORAGE_KEY);
    if (r.kind !== "present") return r;
    const p = parseTimeline(r.value);
    return p.ok ? { kind: "present", value: p.value } : { kind: "unreadable", error: p.error };
  }
  private keys(prefix: string): string[] {
    try {
      const out: string[] = [];
      for (let i = 0; i < this.storage!.length; i++) { const k = this.storage!.key(i); if (k?.startsWith(prefix)) out.push(k); }
      return out;
    } catch { return []; }
  }
  private remove(key: string): boolean {
    try { this.storage!.removeItem(key); return true; } catch { return false; }
  }
  /** Absent, present (the raw text), or unreadable (storage threw). */
  private read(key: string): Read<string> {
    try { const text = this.storage!.getItem(key); return text === null ? { kind: "absent" } : { kind: "present", value: text }; }
    catch (e) { return { kind: "unreadable", error: e instanceof Error ? e.message : String(e) }; }
  }
}

const failed = (code: TimelineCommitFailure, error: string, dropped: DroppedTimeline[] = []): TimelineCommit => ({ ok: false, code, error, dropped });
const empty = (): Journal => ({ format: "siltwake.timeline.journal", version: 1, current: null, previous: null });
/** The journal's envelope; its heads are then read whole by `readHead`. */
function journal(raw: string): Journal | null {
  try {
    const v = JSON.parse(raw) as Partial<Journal>;
    const head = (h: unknown): boolean => h === null || (typeof h === "object" && typeof (h as TimelineHead).session?.id === "string" && typeof (h as TimelineHead).commit === "string");
    return v?.format === "siltwake.timeline.journal" && v.version === 1 && head(v.current ?? null) && head(v.previous ?? null)
      ? { format: v.format, version: 1, current: v.current ?? null, previous: v.previous ?? null } : null;
  } catch { return null; }
}
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
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || (error as { code?: number }).code === 22);
