/** The play timeline in local storage, append-only (SIM-05).
 *
 * Each chunk lives under its own key, written once when sealed. When it
 * rotates, the same key is overwritten with its summary (which keeps its
 * notes, new things, deaths and recoveries verbatim). A save rewrites only
 * the small head: the session, the open chunk and the chunk keys in order.
 *
 * Every failure leaves a readable, complete committed timeline (SIM-1 R1 F2):
 * - the head is the commit point, written after the chunks it names;
 * - a chunk key is only ever replaced by its own summary, a single atomic
 *   write that shrinks it, so a head naming it reads the same history;
 * - keys a new head no longer names (another session's timeline, the version 1
 *   record, chunks written by a commit that never landed) are removed only
 *   after that head is stored.
 * When the quota is full, the recorder rotates its oldest chunk, the store
 * folds that key in place (which frees space) and the save retries. */
import { closingEvents, exportHead, resumeRecorder, rotateOldest, TIMELINE_STORAGE_KEY } from "./recorder.js";
import type { RecorderOptions, TimelineRecorder } from "./recorder.js";
import { parseTimeline } from "./report.js";
import type { ChunkSummary, TimelineEvent, TimelineExport } from "./report.js";
import type { GameState } from "../types.js";

export interface TimelineStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const TIMELINE_HEAD_KEY = "siltwake.timeline.v2";
/** Chunk keys carry their session, so no session ever writes over another's history. */
const chunkKey = (session: string, n: number): string => `${TIMELINE_HEAD_KEY}.${session}.${n}`;
/** An export without its summaries, whose `events` are the open chunk (open spans
 * closed as of the save); `chunks` names every chunk key in order, oldest first. */
type Head = Omit<TimelineExport, "rotated"> & { chunks: number[]; nextChunk: number };
type Stored = "events" | "summary";

/** What a save achieved: `rotated` saved after folding old chunks into summaries
 * to fit the quota; `failed` could not commit (the last committed timeline is
 * intact, and everything lives on in memory). */
export type TimelineSave = "saved" | "rotated" | "failed";

export class TimelineStore {
  /** The chunk numbers the last committed head named. */
  private committed: number[] = [];
  /** What each of this session's chunk keys holds. */
  private onDisk = new Map<number, Stored>();
  /** Keys the next committed head supersedes: removed only after it is stored. */
  private superseded: string[] = [];
  constructor(private readonly storage: TimelineStoragePort) {}

  /** The stored timeline for `sessionId`, resumed; null if there is none (or it belongs to another session). */
  load(sessionId: string, options: RecorderOptions = {}): TimelineRecorder | null {
    const head = this.read<Head>(TIMELINE_HEAD_KEY);
    if (head && Array.isArray(head.chunks) && head.session?.id === sessionId) {
      const stored = head.chunks.map((n) => ({ n, value: this.read<TimelineEvent[] | ChunkSummary>(chunkKey(sessionId, n)) }));
      const rotated = stored.flatMap((c) => isSummary(c.value) ? [{ ...c.value, n: c.n }] : []);
      const sealed = stored.flatMap((c) => Array.isArray(c.value) && c.value.length ? [{ n: c.n, events: c.value }] : []);
      // Validate the whole stored timeline as one export before trusting it.
      const parsed = rotated.length + sealed.length === stored.length
        ? parseTimeline(JSON.stringify({ ...head, rotated, events: [...sealed.flatMap((c) => c.events), ...head.events] })) : null;
      if (parsed?.ok) {
        this.committed = [...head.chunks];
        this.onDisk = new Map(stored.map((c) => [c.n, isSummary(c.value) ? "summary" : "events"]));
        return resumeRecorder({ ...parsed.value, events: head.events }, options, { sealed, nextChunk: head.nextChunk });
      }
      // A damaged store: start again rather than resume a partial history.
      this.superseded.push(...head.chunks.map((n) => chunkKey(sessionId, n)));
      return null;
    }
    if (head && Array.isArray(head.chunks) && typeof head.session?.id === "string")
      this.superseded.push(...head.chunks.map((n) => chunkKey(head.session.id, n)));
    // The single-key version 1 timeline: replaced once a version 2 head is stored.
    const legacy = this.storage.getItem(TIMELINE_STORAGE_KEY), parsed = legacy ? parseTimeline(legacy) : null;
    if (legacy) this.superseded.push(TIMELINE_STORAGE_KEY);
    return parsed?.ok && parsed.value.session.id === sessionId ? resumeRecorder(parsed.value, options) : null;
  }

  /** Commits the recorder's timeline; on a full quota, rotates its oldest chunk and retries. */
  save(rec: TimelineRecorder, s: GameState): TimelineSave {
    let rotated = false;
    for (;;) {
      try {
        this.commit(rec, s);
        return rotated ? "rotated" : "saved";
      } catch (error) {
        if (!quota(error)) return "failed";
      }
      // Chunks of the failed attempt no committed head names: free their space.
      this.drop(rec.session.id, new Set(this.committed));
      if (!rotateOldest(rec)) return "failed";
      rotated = true;
    }
  }

  /** Summaries (folded in place), new chunks, then the head (the commit), then what it supersedes. */
  private commit(rec: TimelineRecorder, s: GameState): void {
    const id = rec.session.id;
    // A summary carried from an older export has no chunk yet: give it one.
    for (const r of rec.rotated) r.n ??= rec.nextChunk++;
    for (const r of rec.rotated) if (this.onDisk.get(r.n!) !== "summary") {
      this.storage.setItem(chunkKey(id, r.n!), JSON.stringify(r));
      this.onDisk.set(r.n!, "summary");
    }
    for (const c of rec.sealed) if (!this.onDisk.has(c.n)) {
      this.storage.setItem(chunkKey(id, c.n), JSON.stringify(c.events));
      this.onDisk.set(c.n, "events");
    }
    // Summaries live in their chunk keys, so the head stays small however many notes accumulate.
    const closing = closingEvents(rec, s);
    const { rotated: _summaries, ...rest } = exportHead(rec, s, closing.length);
    const head: Head = { ...rest, events: [...rec.events, ...closing],
      chunks: [...rec.rotated.map((r) => r.n!), ...rec.sealed.map((c) => c.n)], nextChunk: rec.nextChunk };
    this.storage.setItem(TIMELINE_HEAD_KEY, JSON.stringify(head));
    this.committed = head.chunks;
    this.drop(id, new Set(head.chunks));
    for (const key of this.superseded.splice(0)) if (key !== TIMELINE_HEAD_KEY) this.storage.removeItem(key);
  }

  /** Removes this session's chunk keys outside `keep`. */
  private drop(id: string, keep: ReadonlySet<number>): void {
    for (const n of [...this.onDisk.keys()]) if (!keep.has(n)) { this.storage.removeItem(chunkKey(id, n)); this.onDisk.delete(n); }
  }

  private read<T>(key: string): T | null {
    try { const text = this.storage.getItem(key); return text ? JSON.parse(text) as T : null; } catch { return null; }
  }
}
const isSummary = (v: unknown): v is ChunkSummary => typeof v === "object" && v !== null && !Array.isArray(v) && Array.isArray((v as ChunkSummary).kept);
const quota = (error: unknown): boolean => error instanceof Error &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || (error as { code?: number }).code === 22);
