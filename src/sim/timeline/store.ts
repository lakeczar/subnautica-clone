/** The play timeline in local storage, append-only (SIM-05).
 *
 * Every key lives under one owned prefix, `siltwake.timeline.v2|<session>|…`:
 * each session has a head (`|head`) and chunk keys (`|<n>`). A chunk is
 * written once when sealed; when it rotates, the same key is overwritten with
 * its summary (which keeps its notes, new things, deaths and recoveries
 * verbatim). A save rewrites only the small head: the session, the open chunk
 * and the chunk keys in order.
 *
 * The store trusts nothing it remembers about storage (SIM-1 R2): it holds no
 * state between saves. Each save reads the session's durable head first and
 * treats only what that head names as committed. Then:
 * - the head is the commit point, written after the chunks it names; a
 *   session with no head first gets a provisional one, so its keys are always
 *   discoverable, and readers ignore it;
 * - a chunk key is only ever replaced by its own summary, one atomic write, so
 *   a head naming it reads the same history;
 * - after a head is stored, the session's own prefix is enumerated and every
 *   key that head doesn't name is removed (keys of an interrupted transaction,
 *   rotated or cleanup leftovers, found after any restart);
 * - another session's keys are removed only once its head is older than
 *   `STALE_MS` (a live game saves its timeline every 10 s of play; a paused
 *   game whose keys go is rewritten whole from memory at its next save), and
 *   the version 1 record once any version 2 head is stored.
 * On a full quota, the recorder rotates its oldest chunk, the store folds that
 * key in place and the save retries. One writer per session is assumed. */
import { closingEvents, exportHead, resumeRecorder, rotateOldest, TIMELINE_STORAGE_KEY } from "./recorder.js";
import type { RecorderOptions, TimelineRecorder } from "./recorder.js";
import { parseTimeline } from "./report.js";
import type { ChunkSummary, TimelineEvent, TimelineExport } from "./report.js";
import type { GameState } from "../types.js";

/** The parts of `Storage` (localStorage) the store uses, enumeration included. */
export interface TimelineStoragePort {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const TIMELINE_PREFIX = "siltwake.timeline.v2|";
/** Another session's timeline is collected once its head is this old. */
export const STALE_MS = 10 * 60_000;
const sessionPrefix = (session: string): string => `${TIMELINE_PREFIX}${encodeURIComponent(session)}|`;
export const headKey = (session: string): string => `${sessionPrefix(session)}head`;
const chunkKey = (session: string, n: number): string => `${sessionPrefix(session)}${n}`;
/** An export without its summaries, whose `events` are the open chunk (open
 * spans closed as of the save); `chunks` names every chunk key in order, oldest
 * first, and `folded` those holding summaries. A provisional head commits
 * nothing: it only makes a session's keys discoverable before its first commit. */
type Head = Omit<TimelineExport, "rotated"> & { chunks: number[]; folded: number[]; nextChunk: number; writtenAt: number };
type Provisional = { provisional: true; writtenAt: number };

/** What a save achieved: `rotated` saved after folding old chunks into summaries
 * to fit the quota; `failed` could not commit (the last committed timeline is
 * intact, and everything lives on in memory). */
export type TimelineSave = "saved" | "rotated" | "failed";

export class TimelineStore {
  constructor(private readonly storage: TimelineStoragePort, private readonly now: () => number = Date.now) {}

  /** The stored timeline for `sessionId`, resumed; null if there is none. */
  load(sessionId: string, options: RecorderOptions = {}): TimelineRecorder | null {
    const head = this.head(sessionId);
    if (head && !("provisional" in head)) {
      const stored = head.chunks.map((n) => ({ n, value: this.read<TimelineEvent[] | ChunkSummary>(chunkKey(sessionId, n)) }));
      const rotated = stored.flatMap((c) => isSummary(c.value) ? [{ ...c.value, n: c.n }] : []);
      const sealed = stored.flatMap((c) => Array.isArray(c.value) && c.value.length ? [{ n: c.n, events: c.value }] : []);
      // Validate the whole stored timeline as one export before trusting it.
      const parsed = rotated.length + sealed.length === stored.length
        ? parseTimeline(JSON.stringify({ ...head, rotated, events: [...sealed.flatMap((c) => c.events), ...head.events] })) : null;
      // A damaged store starts again; its keys go at this session's next commit.
      return parsed?.ok ? resumeRecorder({ ...parsed.value, events: head.events }, options, { sealed, nextChunk: head.nextChunk }) : null;
    }
    // The single-key version 1 timeline, until a version 2 head replaces it.
    const legacy = this.storage.getItem(TIMELINE_STORAGE_KEY), parsed = legacy ? parseTimeline(legacy) : null;
    return parsed?.ok && parsed.value.session.id === sessionId ? resumeRecorder(parsed.value, options) : null;
  }

  /** Commits the recorder's timeline; on a full quota, rotates its oldest chunk and retries. */
  save(rec: TimelineRecorder, s: GameState): TimelineSave {
    const id = rec.session.id;
    try { this.collectStale(id); } catch { /* collection only frees space; the commit still decides */ }
    let rotated = false;
    for (;;) {
      try {
        this.commit(rec, s);
        return rotated ? "rotated" : "saved";
      } catch (error) {
        if (!quota(error)) return "failed";
      }
      // Keys of the failed attempt that the durable head doesn't name: free their space.
      try { this.collect(id); } catch { return "failed"; }
      if (!rotateOldest(rec)) return "failed";
      rotated = true;
    }
  }

  /** Summaries (folded in place), new chunks, then the head (the commit), then what it no longer names. */
  private commit(rec: TimelineRecorder, s: GameState): void {
    const id = rec.session.id, numbers = [...rec.rotated.map((r) => r.n), ...rec.sealed.map((c) => c.n)];
    if (numbers.some((n) => n === undefined) || new Set(numbers).size !== numbers.length)
      throw new Error(`timeline chunk numbers collide or are missing: ${numbers.join(",")}`);
    const durable = this.head(id);
    if (!durable) this.storage.setItem(headKey(id), JSON.stringify({ provisional: true, writtenAt: this.now() } satisfies Provisional));
    const committed = durable && !("provisional" in durable) ? durable : null;
    const named = new Set(committed?.chunks ?? []), folded = new Set(committed?.folded ?? []);
    for (const r of rec.rotated) if (!folded.has(r.n!)) this.storage.setItem(chunkKey(id, r.n!), JSON.stringify(r));
    for (const c of rec.sealed) if (!named.has(c.n) || folded.has(c.n)) this.storage.setItem(chunkKey(id, c.n), JSON.stringify(c.events));
    const closing = closingEvents(rec, s);
    // Summaries live in their chunk keys, so the head stays small however many notes accumulate.
    const { rotated: _summaries, ...rest } = exportHead(rec, s, closing.length);
    const head: Head = { ...rest, events: [...rec.events, ...closing], chunks: numbers as number[],
      folded: rec.rotated.map((r) => r.n!), nextChunk: rec.nextChunk, writtenAt: this.now() };
    this.storage.setItem(headKey(id), JSON.stringify(head));
    this.collect(id);
    this.storage.removeItem(TIMELINE_STORAGE_KEY);
  }

  /** Removes this session's chunk keys its durable head doesn't name. */
  private collect(id: string): void {
    const head = this.head(id), keep = new Set(head && !("provisional" in head) ? head.chunks.map(String) : []);
    for (const key of this.keys(sessionPrefix(id)))
      if (key !== headKey(id) && !keep.has(key.slice(sessionPrefix(id).length))) this.storage.removeItem(key);
  }

  /** Removes other sessions' timelines whose head is stale or missing: chunks first, the head last. */
  private collectStale(id: string): void {
    const sessions = new Set(this.keys(TIMELINE_PREFIX).map((k) => k.slice(TIMELINE_PREFIX.length).split("|")[0]!));
    for (const encoded of sessions) {
      const other = decodeURIComponent(encoded);
      if (other === id) continue;
      const head = this.head(other);
      if (head && head.writtenAt >= this.now() - STALE_MS) continue;
      for (const key of this.keys(sessionPrefix(other))) if (key !== headKey(other)) this.storage.removeItem(key);
      this.storage.removeItem(headKey(other));
    }
  }

  /** Keys under `prefix`, listed before any is removed. */
  private keys(prefix: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.storage.length; i++) { const k = this.storage.key(i); if (k?.startsWith(prefix)) out.push(k); }
    return out;
  }
  private head(session: string): Head | Provisional | null {
    const h = this.read<Head | Provisional>(headKey(session));
    if (!h || typeof h !== "object" || typeof h.writtenAt !== "number") return null;
    return "provisional" in h ? h : Array.isArray(h.chunks) && Array.isArray(h.folded) && h.session?.id === session ? h : null;
  }
  private read<T>(key: string): T | null {
    try { const text = this.storage.getItem(key); return text ? JSON.parse(text) as T : null; } catch { return null; }
  }
}
const isSummary = (v: unknown): v is ChunkSummary => typeof v === "object" && v !== null && !Array.isArray(v) && Array.isArray((v as ChunkSummary).kept);
const quota = (error: unknown): boolean => error instanceof Error &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || (error as { code?: number }).code === 22);
