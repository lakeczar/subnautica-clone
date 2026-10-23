/** The play timeline in local storage, append-only (SIM-05).
 *
 * Every key lives under one owned prefix, `siltwake.timeline.v2|<session>|…`:
 * a session's head (`|head`) and its chunk keys (`|<n>`). A chunk is written
 * once when sealed; when it rotates, the same key is overwritten with its
 * summary (its notes, new things, deaths and recoveries kept verbatim). A save
 * rewrites only the small head: the session, the open chunk and the chunk keys.
 *
 * Retention (SIM-1 R3, the coordinator's contract):
 * - a committed timeline belongs to its session and is never collected for age;
 * - only when a save can't fit, unreferenced committed timelines are evicted,
 *   least recently written first: never the save repository's Continue or
 *   backup session, never a session live in another tab; each eviction is
 *   named in the save result and recorded in the saving timeline;
 * - the version 1 record goes once a complete version 2 head for that same
 *   session is stored.
 *
 * Commits: each save reads the session's durable head first and trusts only
 * what it names. A session with no head first gets a provisional head, so its
 * keys are discoverable; readers ignore it. The head is the commit point,
 * written after the chunks it names; then the session's keys that head doesn't
 * name are removed. Reads are tri-state: an unreadable value never authorises a
 * delete, a reclaim or a provisional overwrite.
 *
 * Coordination: the caller holds its session's lock (`timelineLock`) while the
 * session is live. Another session's uncommitted keys are reclaimed, or its
 * timeline evicted, only while holding that session's lock, taken only if
 * free. Without a lock API, only this session's own work is reclaimed. */
import { closingEvents, exportHead, recordEvent, resumeRecorder, rotateOldest, TIMELINE_STORAGE_KEY } from "./recorder.js";
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
/** Cross-tab locks (the Web Locks API). */
export interface TimelineLockPort {
  /** Holds `name` until the returned release is called; resolves once granted. */
  hold(name: string): Promise<() => void>;
  /** Runs `work` holding `name`, only if no one holds it now; undefined otherwise. */
  ifFree<T>(name: string, work: () => T): Promise<T | undefined>;
}
/** `navigator.locks` as a lock port, or null without it. */
export function webLocks(): TimelineLockPort | null {
  const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks;
  if (!locks) return null;
  return {
    hold: (name) => new Promise((granted) => { void locks.request(name, () => new Promise<void>((release) => granted(release))); }),
    ifFree: async (name, work) => { let out: ReturnType<typeof work> | undefined; await locks.request(name, { ifAvailable: true }, (lock) => { if (lock) out = work(); }); return out; },
  };
}
interface LockManagerLike {
  request(name: string, callback: (lock: unknown) => unknown): Promise<unknown>;
  request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => unknown): Promise<unknown>;
}
export const TIMELINE_PREFIX = "siltwake.timeline.v2|";
export const timelineLock = (session: string): string => `siltwake.timeline|${session}`;
const sessionPrefix = (session: string): string => `${TIMELINE_PREFIX}${encodeURIComponent(session)}|`;
export const headKey = (session: string): string => `${sessionPrefix(session)}head`;
const chunkKey = (session: string, n: number): string => `${sessionPrefix(session)}${n}`;
/** An export without its summaries, whose `events` are the open chunk (open
 * spans closed as of the save); `chunks` names every chunk key in order, oldest
 * first, and `folded` those holding summaries. */
type Head = Omit<TimelineExport, "rotated"> & { chunks: number[]; folded: number[]; nextChunk: number; writtenAt: number };
type Provisional = { provisional: true };
type Read<T> = { kind: "absent" } | { kind: "present"; value: T } | { kind: "unreadable"; error: string };

export type TimelineLoad = { kind: "absent" } | { kind: "loaded"; recorder: TimelineRecorder } | { kind: "unreadable"; error: string };
/** `rotated`: saved after folding own old chunks into summaries to fit the quota.
 * `failed`: nothing new committed (the last committed timeline is intact, and
 * everything lives on in memory). `evicted`: other sessions' timelines removed
 * to make room. */
export interface TimelineSave { outcome: "saved" | "rotated" | "failed"; evicted: string[]; error?: string }
export interface TimelineStoreOptions {
  locks?: TimelineLockPort | null;
  /** Sessions the save repository still holds (Continue, backup): never evicted. */
  referenced?: () => Iterable<string>;
  now?: () => number;
}

export class TimelineStore {
  private readonly locks: TimelineLockPort | null;
  private readonly referenced: () => Iterable<string>;
  private readonly now: () => number;
  constructor(private readonly storage: TimelineStoragePort, options: TimelineStoreOptions = {}) {
    this.locks = options.locks ?? null;
    this.referenced = options.referenced ?? (() => []);
    this.now = options.now ?? Date.now;
  }

  /** The stored timeline for `sessionId`. `unreadable`: it may exist but can't be
   * read now; the caller must not save a replacement over it. */
  load(sessionId: string, options: RecorderOptions = {}): TimelineLoad {
    const head = this.head(sessionId);
    if (head.kind === "unreadable") return head;
    if (head.kind === "present" && !("provisional" in head.value)) {
      const h = head.value, rotated: ChunkSummary[] = [], sealed: { n: number; events: TimelineEvent[] }[] = [];
      for (const n of h.chunks) {
        const c = this.read<TimelineEvent[] | ChunkSummary>(chunkKey(sessionId, n));
        if (c.kind !== "present") return { kind: "unreadable", error: `chunk ${n} is ${c.kind === "absent" ? "missing" : "unreadable"}` };
        if (isSummary(c.value)) rotated.push({ ...c.value, n });
        else if (Array.isArray(c.value) && c.value.length) sealed.push({ n, events: c.value });
        else return { kind: "unreadable", error: `chunk ${n} is malformed` };
      }
      // Validate the whole stored timeline as one export before trusting it.
      const parsed = parseTimeline(JSON.stringify({ ...h, rotated, events: [...sealed.flatMap((c) => c.events), ...h.events] }));
      if (!parsed.ok) return { kind: "unreadable", error: parsed.error };
      return { kind: "loaded", recorder: resumeRecorder({ ...parsed.value, events: h.events }, options, { sealed, nextChunk: h.nextChunk }) };
    }
    // The single-key version 1 timeline, until this session's version 2 head replaces it.
    const legacy = this.read<string>(TIMELINE_STORAGE_KEY, false);
    if (legacy.kind === "unreadable") return legacy;
    if (legacy.kind === "absent") return { kind: "absent" };
    const parsed = parseTimeline(legacy.value);
    return parsed.ok && parsed.value.session.id === sessionId ? { kind: "loaded", recorder: resumeRecorder(parsed.value, options) } : { kind: "absent" };
  }

  /** Commits the recorder's timeline. The caller holds `timelineLock(rec.session.id)`.
   * On a full quota: this session's leftovers go, then its oldest chunks fold,
   * then unreferenced timelines are evicted, oldest written first. */
  async save(rec: TimelineRecorder, s: GameState): Promise<TimelineSave> {
    const evicted: string[] = [];
    // A free lock means the caller doesn't hold it: another tab could reclaim this save's work mid-write.
    if (this.locks && await this.locks.ifFree(timelineLock(rec.session.id), () => true))
      return { outcome: "failed", evicted, error: "this session's timeline lock isn't held" };
    await this.reclaimAbandoned(rec.session.id);
    let rotated = false;
    for (;;) {
      const r = this.attempt(rec, s);
      if (r === "saved") return { outcome: rotated ? "rotated" : "saved", evicted };
      if (r !== "quota") return { outcome: "failed", evicted, error: r.error };
      if (rotateOldest(rec)) { rotated = true; continue; }
      const gone = await this.evictOne(rec.session.id);
      if (!gone) return { outcome: "failed", evicted, error: "the timeline doesn't fit the browser's storage" };
      evicted.push(gone);
      recordEvent(rec, s, { kind: "system", what: "timeline-evicted", id: gone });
    }
  }

  /** One synchronous commit attempt. */
  private attempt(rec: TimelineRecorder, s: GameState): "saved" | "quota" | { error: string } {
    const id = rec.session.id, numbers = [...rec.rotated.map((r) => r.n), ...rec.sealed.map((c) => c.n)];
    if (numbers.some((n) => n === undefined) || new Set(numbers).size !== numbers.length)
      return { error: `timeline chunk numbers collide or are missing: ${numbers.join(",")}` };
    const durable = this.head(id);
    if (durable.kind === "unreadable") return { error: `the stored timeline head can't be read: ${durable.error}` };
    const committed = durable.kind === "present" && !("provisional" in durable.value) ? durable.value : null;
    const named = new Set(committed?.chunks ?? []), folded = new Set(committed?.folded ?? []);
    let head: Head;
    try {
      if (durable.kind === "absent") this.storage.setItem(headKey(id), JSON.stringify({ provisional: true } satisfies Provisional));
      for (const r of rec.rotated) if (!folded.has(r.n!)) this.storage.setItem(chunkKey(id, r.n!), JSON.stringify(r));
      for (const c of rec.sealed) if (!named.has(c.n) || folded.has(c.n)) this.storage.setItem(chunkKey(id, c.n), JSON.stringify(c.events));
      const closing = closingEvents(rec, s);
      // Summaries live in their chunk keys, so the head stays small however many notes accumulate.
      const { rotated: _summaries, ...rest } = exportHead(rec, s, closing.length);
      head = { ...rest, events: [...rec.events, ...closing], chunks: numbers as number[],
        folded: rec.rotated.map((r) => r.n!), nextChunk: rec.nextChunk, writtenAt: this.now() };
      this.storage.setItem(headKey(id), JSON.stringify(head));
    } catch (error) {
      if (!quota(error)) return { error: error instanceof Error ? error.message : String(error) };
      // This attempt's keys (and older leftovers) that the committed head doesn't name: free their space.
      this.collect(id, committed?.chunks ?? []);
      return "quota";
    }
    // Against the manifest just written: never re-read, never an empty keep-set from a failed read.
    this.collect(id, head.chunks);
    const legacy = this.read<string>(TIMELINE_STORAGE_KEY, false);
    if (legacy.kind === "present" && legacySession(legacy.value) === id) this.remove(TIMELINE_STORAGE_KEY);
    return "saved";
  }

  /** Removes this session's chunk keys outside `keep`. A failure defers the rest to the next commit. */
  private collect(id: string, keep: readonly number[]): void {
    const names = new Set(keep.map(String)), prefix = sessionPrefix(id);
    for (const key of this.keys(prefix) ?? [])
      if (key !== headKey(id) && !names.has(key.slice(prefix.length)) && !this.remove(key)) return;
  }

  /** Other sessions' uncommitted keys (a provisional head, or none), under their lock if it is free. */
  private async reclaimAbandoned(id: string): Promise<void> {
    if (!this.locks) return;
    for (const other of this.sessions()) {
      if (other === id || !this.uncommitted(other)) continue;
      await this.locks.ifFree(timelineLock(other), () => { if (this.uncommitted(other)) this.drop(other); });
    }
  }
  /** Evicts the least recently written committed timeline that no one references or holds. */
  private async evictOne(id: string): Promise<string | null> {
    if (!this.locks) return null;
    const keep = new Set(this.referenced());
    const candidates = this.sessions().flatMap((other) => {
      if (other === id || keep.has(other)) return [];
      const h = this.head(other);
      return h.kind === "present" && !("provisional" in h.value) ? [{ other, at: h.value.writtenAt }] : [];
    }).sort((a, b) => a.at - b.at);
    // A version 1 record of an unreferenced session is the oldest history of all.
    const legacy = this.read<string>(TIMELINE_STORAGE_KEY, false), legacyId = legacy.kind === "present" ? legacySession(legacy.value) : null;
    if (legacyId !== null && legacyId !== id && !keep.has(legacyId)) candidates.unshift({ other: legacyId, at: -Infinity });
    for (const { other, at } of candidates) {
      const done = await this.locks.ifFree(timelineLock(other), () => {
        if (new Set(this.referenced()).has(other)) return false;
        if (at === -Infinity) return this.remove(TIMELINE_STORAGE_KEY);
        const h = this.head(other);
        if (h.kind !== "present" || "provisional" in h.value) return false;
        return this.drop(other);
      });
      if (done) return other;
    }
    return null;
  }
  /** Whether a session has keys but no committed head (a readable provisional head, or none). */
  private uncommitted(session: string): boolean {
    const h = this.head(session);
    return h.kind === "absent" || (h.kind === "present" && "provisional" in h.value);
  }
  /** Removes a session's keys: chunks first, the head last. False if storage refused (left for later). */
  private drop(session: string): boolean {
    const keys = this.keys(sessionPrefix(session));
    if (!keys) return false;
    for (const key of keys) if (key !== headKey(session) && !this.remove(key)) return false;
    return this.remove(headKey(session));
  }

  /** Sessions with keys under the prefix. */
  private sessions(): string[] {
    const out = new Set<string>();
    for (const k of this.keys(TIMELINE_PREFIX) ?? []) try { out.add(decodeURIComponent(k.slice(TIMELINE_PREFIX.length).split("|")[0]!)); } catch { /* not ours */ }
    return [...out];
  }
  /** Keys under `prefix`, listed before any is removed; null if storage can't be enumerated now. */
  private keys(prefix: string): string[] | null {
    try {
      const out: string[] = [];
      for (let i = 0; i < this.storage.length; i++) { const k = this.storage.key(i); if (k?.startsWith(prefix)) out.push(k); }
      return out;
    } catch { return null; }
  }
  private remove(key: string): boolean {
    try { this.storage.removeItem(key); return true; } catch { return false; }
  }
  private head(session: string): Read<Head | Provisional> {
    const h = this.read<Head | Provisional>(headKey(session));
    if (h.kind !== "present") return h;
    const v = h.value as Partial<Head> & Partial<Provisional>;
    if (typeof v !== "object" || v === null) return { kind: "unreadable", error: "the head is not an object" };
    if (v.provisional === true) return h;
    return Array.isArray(v.chunks) && Array.isArray(v.folded) && v.session?.id === session && typeof v.writtenAt === "number"
      ? h : { kind: "unreadable", error: "the head is malformed" };
  }
  /** Absent, present, or unreadable (storage threw, or the value doesn't parse). */
  private read<T>(key: string, json = true): Read<T> {
    let text: string | null;
    try { text = this.storage.getItem(key); } catch (e) { return { kind: "unreadable", error: e instanceof Error ? e.message : String(e) }; }
    if (text === null) return { kind: "absent" };
    if (!json) return { kind: "present", value: text as T };
    try { return { kind: "present", value: JSON.parse(text) as T }; } catch { return { kind: "unreadable", error: `${key} does not parse` }; }
  }
}
/** The session of a version 1 timeline, from its first line (`serializeTimeline` writes the head
 * first), without parsing the whole record; null when it can't be read (the record is then kept). */
function legacySession(text: string): string | null {
  const m = /"session":\{"id":("(?:[^"\\]|\\.)*")/.exec(text.slice(0, 4096));
  try { return m ? JSON.parse(m[1]!) as string : null; } catch { return null; }
}
const isSummary = (v: unknown): v is ChunkSummary => typeof v === "object" && v !== null && !Array.isArray(v) && Array.isArray((v as ChunkSummary).kept);
const quota = (error: unknown): boolean => error instanceof Error &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || (error as { code?: number }).code === 22);
