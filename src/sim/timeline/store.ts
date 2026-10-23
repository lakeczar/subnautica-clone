/** The play timeline in local storage, append-only (SIM-05). Each sealed chunk
 * is written once under its own key; a save rewrites only the small head (the
 * session, rotated summaries, the open chunk and which chunk keys hold the
 * rest), so a long session never re-serialises its whole history. When the
 * quota is full, the oldest chunk rotates into its summary (its notes, new
 * things, deaths and recoveries kept verbatim) and the save retries. */
import { exportTimeline, resumeRecorder, rotateOldest, TIMELINE_CHUNK_EVENTS, TIMELINE_STORAGE_KEY } from "./recorder.js";
import type { RecorderOptions, TimelineRecorder } from "./recorder.js";
import { parseTimeline } from "./report.js";
import type { TimelineEvent, TimelineExport } from "./report.js";
import type { GameState } from "../types.js";

export interface TimelineStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const TIMELINE_HEAD_KEY = "siltwake.timeline.v2";
const chunkKey = (n: number): string => `${TIMELINE_HEAD_KEY}.chunk.${n}`;
/** An export whose `events` are the open chunk; `chunks` names the sealed ones in between. */
type Head = TimelineExport & { chunks: number[]; nextChunk: number };

/** What a save achieved: `rotated` saved after folding old chunks into summaries
 * to fit the quota; `failed` could not save (the timeline lives on in memory). */
export type TimelineSave = "saved" | "rotated" | "failed";

export class TimelineStore {
  /** Chunk keys this session has on disk. */
  private written = new Set<number>();
  /** Keys of an earlier session's timeline, removed at this session's first save. */
  private stale: string[] = [];
  constructor(private readonly storage: TimelineStoragePort) {}

  /** The stored timeline for `sessionId`, resumed; null if there is none (or it belongs to another session). */
  load(sessionId: string, options: RecorderOptions = {}): TimelineRecorder | null {
    const head = this.read<Head>(TIMELINE_HEAD_KEY);
    if (head && Array.isArray(head.chunks)) {
      if (head.session.id !== sessionId) { this.stale = [TIMELINE_HEAD_KEY, ...head.chunks.map(chunkKey)]; return null; }
      const chunks = head.chunks.map((n) => this.read<TimelineEvent[]>(chunkKey(n)));
      if (chunks.every((c): c is TimelineEvent[] => Array.isArray(c) && c.length === TIMELINE_CHUNK_EVENTS)) {
        const parsed = parseTimeline(JSON.stringify({ ...head, events: [...chunks.flat(), ...head.events] }));
        if (parsed.ok) {
          const rec = resumeRecorder(parsed.value, options);
          // Whole chunks re-chunk into the same partition: keep their numbers and keys.
          if (rec.sealed.length === head.chunks.length && rec.events.length === head.events.length) {
            rec.sealed.forEach((c, i) => { c.n = head.chunks[i]!; });
            rec.nextChunk = head.nextChunk;
            this.written = new Set(head.chunks);
          } else this.stale = head.chunks.map(chunkKey);
          return rec;
        }
      }
      // A damaged store: start again rather than resume a partial history.
      this.stale = [TIMELINE_HEAD_KEY, ...head.chunks.map(chunkKey)];
      return null;
    }
    // The single-key version 1 timeline: migrated by this session's first save.
    const legacy = this.storage.getItem(TIMELINE_STORAGE_KEY), parsed = legacy ? parseTimeline(legacy) : null;
    if (legacy) this.stale = [TIMELINE_STORAGE_KEY];
    return parsed?.ok && parsed.value.session.id === sessionId ? resumeRecorder(parsed.value, options) : null;
  }

  /** Writes new sealed chunks and the head; removes chunks that rotated out. */
  save(rec: TimelineRecorder, s: GameState): TimelineSave {
    let rotated = false;
    for (;;) {
      try {
        const keep = new Set(rec.sealed.map((c) => c.n));
        for (const n of this.written) if (!keep.has(n)) { this.storage.removeItem(chunkKey(n)); this.written.delete(n); }
        for (const key of this.stale.splice(0)) if (key !== TIMELINE_HEAD_KEY) this.storage.removeItem(key);
        for (const c of rec.sealed) if (!this.written.has(c.n)) { this.storage.setItem(chunkKey(c.n), JSON.stringify(c.events)); this.written.add(c.n); }
        // The export closes open travel and idle spans as of now; they join the open chunk.
        const exported = exportTimeline(rec, s);
        const head: Head = { ...exported, events: exported.events.slice(rec.sealed.length * TIMELINE_CHUNK_EVENTS),
          chunks: rec.sealed.map((c) => c.n), nextChunk: rec.nextChunk };
        this.storage.setItem(TIMELINE_HEAD_KEY, JSON.stringify(head));
        return rotated ? "rotated" : "saved";
      } catch (error) {
        if (!quota(error) || !rotateOldest(rec)) return "failed";
        rotated = true;
      }
    }
  }

  private read<T>(key: string): T | null {
    try { const text = this.storage.getItem(key); return text ? JSON.parse(text) as T : null; } catch { return null; }
  }
}
const quota = (error: unknown): boolean => error instanceof Error &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || (error as { code?: number }).code === 22);
