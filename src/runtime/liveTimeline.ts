/** One expedition's play timeline while it is live in this tab (SIM-05): the
 * recorder, its storage journal, its saves and their lifecycle, kept like
 * game saves. Replacing the expedition or disposing the app aborts this
 * generation, so a save still waiting for the writer lock never writes.
 * Closing the page asks for a last save without depending on it.
 *
 * A note commits at once: "Saving note…", then "Note saved" only when a
 * commit holding it succeeds. A note is durable once that commit returns,
 * normally within milliseconds; closing the page while it is pending can lose
 * it, and the notices show that state. A commit that fails for good (another
 * tab's newer timeline, a protected store, no way to coordinate tabs) leaves
 * the timeline in memory only, with export, and says so. */
import { addNote, createRecorder } from "../sim/timeline/recorder.js";
import type { RecorderOptions, TimelineRecorder } from "../sim/timeline/recorder.js";
import { TimelineJournal } from "../sim/timeline/store.js";
import type { TimelineCommit, TimelineRecords, TimelineStoragePort } from "../sim/timeline/store.js";
import type { WriterLockPort } from "../save/writer-lock.js";
import type { GameState } from "../sim/types.js";

export type Say = (message: string, error: boolean) => void;
const EXPORT = "Export the timeline from the menu to keep it.";
/** A commit pending this long is said. */
const WAITING_MS = 2000;

export class LiveTimeline {
  private readonly abort = new AbortController();
  private saving = false;
  private again = false;
  private closed = false;
  private waiting: ReturnType<typeof setTimeout> | null = null;
  private warned = new Set<string>();
  /** Notes not yet in a committed journal, by the sequence that holds each. */
  private notes: number[] = [];
  /** Why this timeline is no longer saved (null: it is). */
  private memoryOnly: string | null;

  private constructor(readonly recorder: TimelineRecorder, private readonly journal: TimelineJournal, private readonly say: Say,
    private readonly changed: () => void, memoryOnly: string | null) {
    this.memoryOnly = memoryOnly;
  }

  /** The stored timeline of this expedition, or a new one. */
  static open(storage: TimelineStoragePort | null, lock: WriterLockPort | null, session: { id: string; started: string; build?: string },
    options: RecorderOptions, say: Say, changed: () => void): LiveTimeline {
    const journal = new TimelineJournal(storage, lock, session.id), stored = journal.load(options);
    if (stored.kind === "loaded") return new LiveTimeline(stored.recorder, journal, say, changed, null);
    if (stored.kind === "protected") say(`The local play-timeline store can't be read (${stored.error}). It is left as it is, and this session's timeline is kept in memory only. ${EXPORT} Repair play timeline, in the menu, replaces the store.`, true);
    return new LiveTimeline(createRecorder(session, options), journal, say, changed, stored.kind === "protected" ? stored.error : null);
  }
  /** The store is protected: the menu offers its repair. */
  get protected(): boolean { return this.journal.protection !== null; }
  /** The raw stored records, for export before a repair. */
  records(): TimelineRecords | string { return this.journal.records(); }

  /** A feedback note, committed at once. Returns a refusal (an empty note). */
  note(s: GameState, text: string): string | null {
    const no = addNote(this.recorder, s, text, new Date().toISOString());
    if (no) return no;
    if (this.memoryOnly) { this.say(`Note kept in memory only: ${this.memoryOnly}. ${EXPORT}`, true); return null; }
    this.notes.push(this.recorder.seq);
    this.say("Saving note…", false);
    this.save(s);
    return null;
  }

  /** Commits the timeline; saves never overlap, and one asked for meanwhile follows. */
  save(s: GameState): void {
    if (this.memoryOnly || this.abort.signal.aborted) return;
    if (this.saving) { this.again = true; return; }
    this.run(this.journal.commit(this.recorder, s, this.abort.signal), s);
  }

  /** Replaces a protected store with this timeline, while its records are exactly the exported ones. */
  repair(s: GameState, exported: TimelineRecords): void {
    if (!this.protected || this.saving || this.abort.signal.aborted) return;
    this.run(this.journal.repair(this.recorder, s, this.abort.signal, exported), s, true);
  }

  /** `final`: the page is closing; ask for a last commit and let it run if it can. Otherwise this generation ends now. */
  close(s: GameState | null, final: boolean): void {
    if (this.closed) return;
    this.closed = true;
    this.clearWaiting();
    if (final && s) this.save(s);
    else this.abort.abort();
  }

  private run(commit: Promise<TimelineCommit>, s: GameState, repairing = false): void {
    this.saving = true;
    this.waiting = setTimeout(() => {
      this.waiting = null;
      if (!this.closed) this.say(`Waiting to save the play timeline… It is kept in memory meanwhile.`, false);
    }, WAITING_MS);
    void commit.then((r) => this.settled(r, repairing)).finally(() => {
      this.clearWaiting();
      this.saving = false;
      if (this.again && !this.abort.signal.aborted && !this.memoryOnly) { this.again = false; this.save(s); }
    });
  }
  private clearWaiting(): void {
    if (this.waiting) clearTimeout(this.waiting);
    this.waiting = null;
  }

  private settled(r: TimelineCommit, repairing: boolean): void {
    // A closed generation (replaced, or the page gone) says nothing more.
    if (this.closed) return;
    for (const d of r.dropped) this.say(d.reason === "room"
      ? `To make room, the play timeline of ${d.label}${d.notes ? `, with ${d.notes} note${d.notes === 1 ? "" : "s"},` : ""} was removed.`
      : `The play timeline of ${d.label}, with ${d.notes} note${d.notes === 1 ? "" : "s"}, was replaced; only the last expedition's timeline is kept besides this one.`, false);
    if (r.ok) {
      if (repairing) {
        this.memoryOnly = null;
        this.changed();
        this.say("The local play-timeline store was replaced. This expedition's timeline is saved again.", false);
      }
      const saved = this.notes.filter((seq) => seq <= r.seq);
      this.notes = this.notes.filter((seq) => seq > r.seq);
      if (saved.length) this.say(saved.length === 1 ? "Note saved to the play timeline." : `${saved.length} notes saved to the play timeline.`, false);
      return;
    }
    if (r.code === "cancelled") return;
    const pending = this.notes.length ? ` ${this.notes.length === 1 ? "The note is" : `${this.notes.length} notes are`} in memory only.` : "";
    if (r.code === "conflict" || r.code === "protected" || r.code === "lock-unavailable" || r.code === "storage-unavailable") {
      this.memoryOnly = r.error;
      this.notes = [];
      this.changed();
      this.say(r.code === "conflict"
        ? `The play timeline changed in another tab, so this tab keeps its timeline in memory only.${pending} ${EXPORT}`
        : r.code === "protected"
          ? `The local play-timeline store can't be read (${r.error}), so this timeline is kept in memory only.${pending} ${EXPORT} Repair play timeline, in the menu, replaces the store.`
          : `The play timeline can't be saved here (${r.error}), so it is kept in memory only.${pending} ${EXPORT}`, true);
    } else if (pending || !this.warned.has(r.code)) {
      this.warned.add(r.code);
      this.say(`The play timeline couldn't be saved (${r.error}).${pending} Saving is retried. ${EXPORT}`, true);
    }
  }
}
