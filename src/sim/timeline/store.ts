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
 *   previous goes (said when it held notes). On a full quota this
 *   expedition's oldest chunks fold first, then previous is dropped (said, by
 *   start date and play time), then the commit fails.
 * - Reads are tri-state: an unreadable journal, head, chunk or version 1
 *   record makes the timeline protected (no writes; memory and export only).
 * - The version 1 record migrates into current or previous by its session and
 *   goes only once a committed journal names its replacement.
 * - Each note is also written at once, without the lock, to this tab's outbox
 *   (`siltwake.timeline.v2.notes|<session>|<tab>`); a load merges outbox notes
 *   not yet committed, so a note outlives a close before its commit. */
import { closingEvents, exportHead, restoreEvent, resumeRecorder, retainedEvents, rotateOldest, TIMELINE_STORAGE_KEY, timelineSince } from "./recorder.js";
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
const CHUNKS = "siltwake.timeline.v2|", NOTES = "siltwake.timeline.v2.notes|";
const chunkKey = (session: string, n: number): string => `${CHUNKS}${encodeURIComponent(session)}|${n}`;
const notesPrefix = (session: string): string => `${NOTES}${encodeURIComponent(session)}|`;
/** An export without summaries, whose `events` are the open chunk (open spans
 * closed as of the commit); `chunks` names its chunk keys oldest first and
 * `folded` those holding summaries. */
export type TimelineHead = Omit<TimelineExport, "rotated"> & { chunks: number[]; folded: number[]; nextChunk: number; commit: string; notes: number };
interface Journal { format: "siltwake.timeline.journal"; version: 1; current: TimelineHead | null; previous: TimelineHead | null }
type Read<T> = { kind: "absent" } | { kind: "present"; value: T } | { kind: "unreadable"; error: string };
/** A previous expedition's timeline a commit removed. */
export interface DroppedTimeline { label: string; notes: number; reason: "replaced" | "room" }

export type TimelineLoad =
  | { kind: "empty" }
  | { kind: "loaded"; recorder: TimelineRecorder; from: "current" | "previous" | "v1" }
  | { kind: "protected"; error: string };
export type TimelineCommitFailure = "conflict" | "protected" | "cancelled" | "lock-unavailable" | "lock-failed" | "storage-unavailable" | "write-refused" | "invalid";
/** `dropped`: previous expeditions' timelines this commit removed (said to the player). */
export type TimelineCommit =
  | { ok: true; rotated: boolean; dropped: DroppedTimeline[] }
  | { ok: false; code: TimelineCommitFailure; error: string; dropped: DroppedTimeline[] };

/** One expedition's timeline in storage, for one tab's session generation. */
export class TimelineJournal {
  /** The journal text as this tab last saw it. */
  private observed: string | null = null;
  /** This tab's last commit, and the sequence it made durable. */
  private lastCommit: string | null = null;
  private committedSeq = 0;
  private protectedReason: string | null = null;
  /** Outbox keys merged at load: removed once a commit holds their notes. */
  private merged: string[] = [];
  private readonly tab = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  constructor(private readonly storage: TimelineStoragePort | null, private readonly lock: WriterLockPort | null, readonly session: string) {}
  get canWrite(): boolean { return this.storage !== null && this.lock !== null && this.protectedReason === null; }

  /** This expedition's stored timeline, with any outbox notes not yet committed. */
  load(options: RecorderOptions = {}): TimelineLoad {
    if (!this.storage) return { kind: "empty" };
    const raw = this.read<string>(TIMELINE_JOURNAL_KEY, false);
    if (raw.kind === "unreadable") return this.protect(`the timeline journal can't be read (${raw.error})`);
    this.observed = raw.kind === "present" ? raw.value : null;
    const j = this.observed === null ? empty() : journal(this.observed);
    if (!j) return this.protect("the timeline journal is unreadable");
    const v1 = this.legacy();
    if (v1.kind === "unreadable") return this.protect(`the version 1 timeline is unreadable (${v1.error})`);
    const head = [j.current, j.previous].find((h) => h?.session.id === this.session) ?? null;
    let out: TimelineLoad = { kind: "empty" };
    if (head) {
      const recorder = this.resume(head, options);
      if (typeof recorder === "string") return this.protect(recorder);
      out = { kind: "loaded", recorder, from: head === j.current ? "current" : "previous" };
    } else if (v1.kind === "present" && v1.value.session.id === this.session) out = { kind: "loaded", recorder: resumeRecorder(v1.value, options), from: "v1" };
    if (out.kind === "loaded") {
      // What loaded is durable; outbox notes merged now are not, until the next commit.
      this.committedSeq = out.recorder.seq;
      this.mergeOutbox(out.recorder);
    }
    return out;
  }
  /** Outbox notes for a new recorder of this expedition (when `load` was empty). */
  adopt(rec: TimelineRecorder): void { this.mergeOutbox(rec); }

  /** Writes this recorder's uncommitted notes to this tab's outbox, at once and without the lock. */
  stash(rec: TimelineRecorder): void {
    if (!this.storage) return;
    const notes = timelineSince(rec, this.committedSeq).events.filter((e) => e.kind === "note"), key = notesPrefix(this.session) + this.tab;
    try { if (notes.length) this.storage.setItem(key, JSON.stringify(notes)); else this.storage.removeItem(key); }
    catch { /* best effort: the next commit carries every note */ }
  }

  /** Commits the recorder's timeline, like `SaveRepository.commit`. */
  async commit(rec: TimelineRecorder, s: GameState, signal: AbortSignal): Promise<TimelineCommit> {
    if (rec.session.id !== this.session) return failed("invalid", "this recorder belongs to another expedition");
    if (signal.aborted) return failed("cancelled", "the expedition was replaced");
    if (this.protectedReason) return failed("protected", this.protectedReason);
    if (!this.storage) return failed("storage-unavailable", "local storage is unavailable");
    if (!this.lock) return failed("lock-unavailable", "this browser can't coordinate timeline saves between tabs");
    try {
      return await this.lock.runExclusive(TIMELINE_WRITER_LOCK, signal, () =>
        signal.aborted ? failed("cancelled", "the expedition was replaced") : this.write(rec, s));
    } catch {
      return signal.aborted ? failed("cancelled", "the expedition was replaced") : failed("lock-failed", "timeline-save coordination failed; nothing was written");
    }
  }

  /** Inside the writer lock: synchronous, so no other writer interleaves. */
  private write(rec: TimelineRecorder, s: GameState): TimelineCommit {
    const storage = this.storage!;
    const now = this.read<string>(TIMELINE_JOURNAL_KEY, false);
    if (now.kind === "unreadable") return failed("storage-unavailable", `the timeline journal can't be read (${now.error}); nothing was written`);
    const raw = now.kind === "present" ? now.value : null;
    let j = raw === null ? empty() : journal(raw);
    if (!j) return failed("protected", "the timeline journal is unreadable");
    if (raw !== this.observed && (this.lastCommit === null || j.current?.commit !== this.lastCommit))
      return failed("conflict", "the play timeline changed in another tab");
    this.observed = raw;
    const numbers = [...rec.rotated.map((r) => r.n), ...rec.sealed.map((c) => c.n)];
    if (numbers.some((n) => n === undefined) || new Set(numbers).size !== numbers.length) return failed("invalid", "timeline chunk numbers collide");
    const v1 = this.legacy();
    if (v1.kind === "unreadable") return failed("protected", `the version 1 timeline is unreadable (${v1.error})`);
    const own = [j.current, j.previous].find((h) => h?.session.id === this.session) ?? null;
    const others = [j.current, j.previous].filter((h): h is TimelineHead => !!h && h.session.id !== this.session);
    let previous: TimelineHead | null = others[0] ?? null;
    const displaced = others[1] ?? null;
    const dropped: DroppedTimeline[] = displaced?.notes ? [label(displaced, "replaced")] : [];
    let rotated = false;
    // Another expedition's version 1 timeline, before any journal: it migrates into previous.
    let migrate = v1.kind === "present" && !j.current && !j.previous && v1.value.session.id !== this.session ? resumeRecorder(v1.value) : null;
    for (;;) {
      try {
        this.writeChunks(rec, own);
        if (migrate) { this.writeChunks(migrate, null); previous = headOf(migrate, migrate.events.at(-1)?.tick ?? 0, [], this.newCommit()); }
        const closing = closingEvents(rec, s), commit = this.newCommit();
        const next: Journal = { format: "siltwake.timeline.journal", version: 1, current: headOf(rec, s.tick, closing, commit), previous };
        const text = JSON.stringify(next);
        storage.setItem(TIMELINE_JOURNAL_KEY, text);
        this.observed = text;
        this.lastCommit = commit;
        this.committedSeq = rec.seq;
        this.collect(next);
        // Every note is now in a committed head: this tab's outbox, and the outboxes merged at load, go.
        for (const key of [...this.merged.splice(0), notesPrefix(this.session) + this.tab]) this.remove(key);
        return { ok: true, rotated, dropped };
      } catch (error) {
        if (!quota(error)) return failed("write-refused", `browser storage refused the timeline (${error instanceof Error ? error.message : String(error)}); the stored timeline is unchanged`, dropped);
      }
      this.collect(j);   // this attempt's keys that the stored journal doesn't name
      if (migrate) { migrate = null; previous = null; continue; }   // the version 1 record then stays as it is
      if (rotateOldest(rec)) { rotated = true; continue; }
      if (!previous) return failed("write-refused", "the play timeline doesn't fit the browser's storage", dropped);
      // Drop previous: a smaller journal first (the commit point), then its keys.
      const smaller: Journal = { ...j, current: own === j.current ? j.current : null, previous: own === j.previous ? j.previous : null };
      const text = JSON.stringify(smaller);
      try { storage.setItem(TIMELINE_JOURNAL_KEY, text); } catch { return failed("write-refused", "the play timeline doesn't fit the browser's storage", dropped); }
      this.observed = text;
      dropped.push(label(previous, "room"));
      previous = null;
      j = smaller;
      this.collect(j);
    }
  }

  /** New chunks and folds for `rec`, given its stored head `own` (null: none). */
  private writeChunks(rec: TimelineRecorder, own: TimelineHead | null): void {
    const id = rec.session.id, named = new Set(own?.chunks ?? []), folded = new Set(own?.folded ?? []);
    for (const r of rec.rotated) if (!folded.has(r.n!)) this.storage!.setItem(chunkKey(id, r.n!), JSON.stringify(r));
    for (const c of rec.sealed) if (!named.has(c.n) || folded.has(c.n)) this.storage!.setItem(chunkKey(id, c.n), JSON.stringify(c.events));
  }

  /** Removes chunk keys no head of the stored journal `j` names, and the version 1 record once `j` replaces it. */
  private collect(j: Journal): void {
    const live = new Set([j.current, j.previous].flatMap((h) => h ? h.chunks.map((n) => chunkKey(h.session.id, n)) : []));
    for (const key of this.keys(CHUNKS)) if (!live.has(key) && !this.remove(key)) return;
    const v1 = this.legacy();
    if (v1.kind === "present" && [j.current, j.previous].some((h) => h?.session.id === v1.value.session.id)) this.remove(TIMELINE_STORAGE_KEY);
  }

  private resume(head: TimelineHead, options: RecorderOptions): TimelineRecorder | string {
    const rotated: ChunkSummary[] = [], sealed: { n: number; events: TimelineEvent[] }[] = [];
    for (const n of head.chunks) {
      const c = this.read<TimelineEvent[] | ChunkSummary>(chunkKey(head.session.id, n));
      if (c.kind !== "present") return `chunk ${n} of the stored timeline is ${c.kind === "absent" ? "missing" : "unreadable"}`;
      if (isSummary(c.value)) rotated.push({ ...c.value, n });
      else if (Array.isArray(c.value) && c.value.length) sealed.push({ n, events: c.value });
      else return `chunk ${n} of the stored timeline is malformed`;
    }
    const parsed = parseTimeline(JSON.stringify({ ...head, rotated, events: [...sealed.flatMap((c) => c.events), ...head.events] }));
    if (!parsed.ok) return `the stored timeline is malformed (${parsed.error})`;
    return resumeRecorder({ ...parsed.value, events: head.events }, options, { sealed, nextChunk: head.nextChunk });
  }

  /** Adds outbox notes (from any tab) that the recorder doesn't hold yet. */
  private mergeOutbox(rec: TimelineRecorder): void {
    const seen = new Set(noteKeys(rec)), found: TimelineEvent[] = [];
    for (const key of this.keys(notesPrefix(this.session))) {
      const r = this.read<TimelineEvent[]>(key);
      if (r.kind !== "present" || !Array.isArray(r.value)) continue;
      for (const e of r.value) if (e?.kind === "note" && !seen.has(noteKey(e))) { seen.add(noteKey(e)); found.push(e); }
      this.merged.push(key);
    }
    for (const e of found.sort((a, b) => a.tick - b.tick)) restoreEvent(rec, e);
  }

  private newCommit(): string { return `${this.tab}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`; }
  private protect(reason: string): TimelineLoad { this.protectedReason = reason; return { kind: "protected", error: reason }; }
  /** The version 1 record: absent, present (parsed) or unreadable (a malformed record included). */
  private legacy(): Read<TimelineExport> {
    const r = this.read<string>(TIMELINE_STORAGE_KEY, false);
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
  /** Absent, present, or unreadable (storage threw, or the value doesn't parse). */
  private read<T>(key: string, json = true): Read<T> {
    let text: string | null;
    try { text = this.storage!.getItem(key); } catch (e) { return { kind: "unreadable", error: e instanceof Error ? e.message : String(e) }; }
    if (text === null) return { kind: "absent" };
    if (!json) return { kind: "present", value: text as T };
    try { return { kind: "present", value: JSON.parse(text) as T }; } catch { return { kind: "unreadable", error: `${key} does not parse` }; }
  }
}

const failed = (code: TimelineCommitFailure, error: string, dropped: DroppedTimeline[] = []): TimelineCommit => ({ ok: false, code, error, dropped });
const empty = (): Journal => ({ format: "siltwake.timeline.journal", version: 1, current: null, previous: null });
function journal(raw: string): Journal | null {
  try {
    const v = JSON.parse(raw) as Partial<Journal>;
    const head = (h: unknown): boolean => h === null || (typeof h === "object" && h !== null && Array.isArray((h as TimelineHead).chunks) &&
      Array.isArray((h as TimelineHead).folded) && typeof (h as TimelineHead).session?.id === "string" && typeof (h as TimelineHead).commit === "string");
    return v?.format === "siltwake.timeline.journal" && v.version === 1 && head(v.current ?? null) && head(v.previous ?? null)
      ? { format: v.format, version: 1, current: v.current ?? null, previous: v.previous ?? null } : null;
  } catch { return null; }
}
/** The recorder's head, ending at `tick`, its open spans closed by `closing`. */
function headOf(rec: TimelineRecorder, tick: number, closing: readonly TimelineEvent[], commit: string): TimelineHead {
  const { rotated: _summaries, ...rest } = exportHead(rec, tick, closing.length);
  return { ...rest, events: [...rec.events, ...closing], chunks: [...rec.rotated.map((r) => r.n!), ...rec.sealed.map((c) => c.n)],
    folded: rec.rotated.map((r) => r.n!), nextChunk: rec.nextChunk, commit, notes: noteKeys(rec).length };
}
const noteKey = (e: TimelineEvent): string => `${e.tick}|${e.wall ?? ""}|${e.text ?? ""}`;
/** Every note the recorder holds, rotated summaries' kept notes included. */
const noteKeys = (rec: TimelineRecorder): string[] =>
  [...rec.rotated.flatMap((r) => r.kept), ...retainedEvents(rec)].filter((e) => e.kind === "note").map(noteKey);
/** "the expedition started 23 Oct 2026 (2 h 14 min of play)". */
function label(h: TimelineHead, reason: DroppedTimeline["reason"]): DroppedTimeline {
  const started = new Date(h.session.started), play = Math.round(h.session.end.play / 60);
  const date = Number.isNaN(started.getTime()) ? "an earlier expedition" : `the expedition started ${started.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  return { label: `${date} (${play >= 60 ? `${Math.floor(play / 60)} h ${play % 60} min` : `${play} min`} of play)`, notes: h.notes, reason };
}
const isSummary = (v: unknown): v is ChunkSummary => typeof v === "object" && v !== null && !Array.isArray(v) && Array.isArray((v as ChunkSummary).kept);
const quota = (error: unknown): boolean => error instanceof Error &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || (error as { code?: number }).code === 22);
