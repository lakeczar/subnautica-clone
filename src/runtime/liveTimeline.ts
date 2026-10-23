/** One expedition's play timeline while it is live in this tab (SIM-05): the
 * recorder, its storage journal, its saves and their lifecycle. Replacing the
 * expedition or disposing the app aborts this generation, so a save still
 * waiting for the writer lock never writes. Closing the page asks for a last
 * save without depending on it: the stored timeline never goes backwards, and
 * each note is already in the outbox. A commit that fails for good (another
 * tab's newer timeline, an unreadable store, no way to coordinate tabs) leaves
 * the timeline in memory only, with export, and says so once. */
import { addNote, createRecorder } from "../sim/timeline/recorder.js";
import type { RecorderOptions, TimelineRecorder } from "../sim/timeline/recorder.js";
import { TimelineJournal } from "../sim/timeline/store.js";
import type { TimelineCommit, TimelineStoragePort } from "../sim/timeline/store.js";
import type { WriterLockPort } from "../save/writer-lock.js";
import type { GameState } from "../sim/types.js";

export type Say = (message: string, error: boolean) => void;
const EXPORT = "Export it from the menu to keep it.";

export class LiveTimeline {
  private readonly abort = new AbortController();
  private saving = false;
  private again = false;
  private closed = false;
  private warned = new Set<string>();
  /** Why this timeline is no longer saved (null: it is). */
  private memoryOnly: string | null;

  private constructor(readonly recorder: TimelineRecorder, private readonly journal: TimelineJournal, private readonly say: Say, memoryOnly: string | null) {
    this.memoryOnly = memoryOnly;
  }

  /** The stored timeline of this expedition, or a new one. */
  static open(storage: TimelineStoragePort | null, lock: WriterLockPort | null, session: { id: string; started: string; build?: string },
    options: RecorderOptions, say: Say): LiveTimeline {
    const journal = new TimelineJournal(storage, lock, session.id), stored = journal.load(options);
    if (stored.kind === "loaded") return new LiveTimeline(stored.recorder, journal, say, null);
    const recorder = createRecorder(session, options);
    if (stored.kind === "protected") {
      say(`This expedition's stored play timeline can't be read (${stored.error}). It is left as it is, and this session's timeline is kept in memory only. ${EXPORT}`, true);
      return new LiveTimeline(recorder, journal, say, stored.error);
    }
    journal.adopt(recorder);
    return new LiveTimeline(recorder, journal, say, null);
  }

  /** A feedback note: in the outbox at once, then committed. */
  note(s: GameState, text: string): string | null {
    const no = addNote(this.recorder, s, text, new Date().toISOString());
    if (no) return no;
    this.journal.stash(this.recorder);
    this.save(s);
    return null;
  }

  /** Commits the timeline; saves never overlap, and one asked for meanwhile follows. */
  save(s: GameState): void {
    if (this.memoryOnly || this.abort.signal.aborted) return;
    if (this.saving) {
      if (this.again) this.once("waiting", "Saving the play timeline is waiting for another tab. It is kept in memory meanwhile.", false);
      this.again = true;
      return;
    }
    this.saving = true;
    void this.journal.commit(this.recorder, s, this.abort.signal).then((r) => this.settled(r)).finally(() => {
      this.saving = false;
      if (this.again && !this.abort.signal.aborted && !this.memoryOnly) { this.again = false; this.save(s); }
    });
  }

  /** `final`: the page is closing; ask for a last commit and let it run if it can. Otherwise this generation ends now. */
  close(s: GameState | null, final: boolean): void {
    if (this.closed) return;
    this.closed = true;
    if (final && s) this.save(s);
    else this.abort.abort();
  }

  private settled(r: TimelineCommit): void {
    // A closed generation (replaced, or the page gone) says nothing more.
    if (this.closed) return;
    for (const d of r.dropped) this.say(d.reason === "room"
      ? `To make room, the play timeline of ${d.label}${d.notes ? `, with ${d.notes} note${d.notes === 1 ? "" : "s"},` : ""} was removed.`
      : `The play timeline of ${d.label}, with ${d.notes} note${d.notes === 1 ? "" : "s"}, was replaced; only the last expedition's timeline is kept besides this one.`, false);
    if (r.ok || r.code === "cancelled") return;
    if (r.code === "conflict" || r.code === "protected" || r.code === "lock-unavailable" || r.code === "storage-unavailable") {
      this.memoryOnly = r.error;
      this.say(r.code === "conflict"
        ? `The play timeline changed in another tab, so this tab keeps its timeline in memory only. ${EXPORT}`
        : `The play timeline can't be saved here (${r.error}), so it is kept in memory only. ${EXPORT}`, true);
    } else this.once(r.code, `The play timeline couldn't be saved (${r.error}). It is kept in memory and saving is retried. ${EXPORT}`, true);
  }
  private once(key: string, message: string, error: boolean): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.say(message, error);
  }
}
