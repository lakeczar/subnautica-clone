/** What the player has seen of each cycle, for SYS-2's journal cycles tab.
 *
 * The journal only states a timing the player has actually watched: a phase's
 * duration is known once its start and its end were both seen without looking
 * away, and the period once every phase is known. `CycleObservation` is the
 * one record SYS-2 saves per cycle; it is plain JSON and changes only at phase
 * edges and when the player looks away, never per frame. */
import { period, sampleCycleAt } from "./cycle.js";
import type { CycleDef } from "./cycle.js";

export interface CycleObservation {
  readonly cycleId: string;
  /** Tick the player first saw the cycle. */
  readonly firstSeen: number;
  /** The phase in view and the tick it was seen to begin; `since` is null when
   * watching started part-way through it. Null while the player is away. */
  readonly watching: { readonly phase: string; readonly since: number | null } | null;
  /** Phases watched from start to end, in cycle order. */
  readonly measured: readonly string[];
}

export type ObservationEvent =
  | { readonly type: "cycle-seen"; readonly cycleId: string }
  | { readonly type: "cycle-measured"; readonly cycleId: string; readonly phase: string; readonly complete: boolean };

/** Advance one record by one step. `inView` is the content's own test (range
 * to the cue, line of sight, or a scanner); this module only keeps the log.
 * Returns the same record object when nothing changed. */
export function observeCycle(c: CycleDef, record: CycleObservation | null, tick: number, inView: boolean):
  { record: CycleObservation | null; event: ObservationEvent | null } {
  if (!inView) {
    if (!record || record.watching === null) return { record, event: null };
    return { record: { ...record, watching: null }, event: null };
  }
  const phase = sampleCycleAt(c, tick).phase;
  if (!record) {
    return { record: { cycleId: c.id, firstSeen: tick, watching: { phase, since: null }, measured: [] },
      event: { type: "cycle-seen", cycleId: c.id } };
  }
  const w = record.watching;
  if (w && w.phase === phase) return { record, event: null };
  if (!w) return { record: { ...record, watching: { phase, since: null } }, event: null };
  // A phase edge seen in view. The phase that just ended was measured if its
  // start was seen too.
  const done = w.since !== null && !record.measured.includes(w.phase);
  const measured = done ? c.phases.map(p => p.id).filter(id => id === w.phase || record.measured.includes(id)) : record.measured;
  const next: CycleObservation = { ...record, watching: { phase, since: tick }, measured };
  return {
    record: next,
    event: done ? { type: "cycle-measured", cycleId: c.id, phase: w.phase, complete: measured.length === c.phases.length } : null,
  };
}

/** One row of the journal's cycles tab. Unknown timings are null, never guessed. */
export interface CycleJournalEntry {
  readonly cycleId: string;
  readonly label: string;
  readonly firstSeen: number;
  readonly phases: readonly { readonly id: string; readonly label: string; readonly seconds: number | null }[];
  readonly periodS: number | null;
  /** Warning cues, shown once the phase they announce has been measured. */
  readonly cues: readonly { readonly phase: string; readonly cue: string; readonly leadS: number }[];
}
export function journalEntry(c: CycleDef, record: CycleObservation): CycleJournalEntry {
  const known = new Set(record.measured);
  return {
    cycleId: c.id, label: c.label, firstSeen: record.firstSeen,
    phases: c.phases.map(p => ({ id: p.id, label: p.label, seconds: known.has(p.id) ? p.seconds : null })),
    periodS: known.size === c.phases.length ? period(c) : null,
    cues: (c.warnings ?? []).filter(w => known.has(w.phase)).map(w => ({ phase: w.phase, cue: w.cue, leadS: w.leadS })),
  };
}

/** A save-loaded record is accepted only if it names this cycle and its
 * phases; anything else starts the log again rather than inventing timings. */
export function validObservation(c: CycleDef, value: unknown): value is CycleObservation {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>, ids = c.phases.map(p => p.id);
  if (r.cycleId !== c.id || !Number.isSafeInteger(r.firstSeen) || (r.firstSeen as number) < 0) return false;
  if (!Array.isArray(r.measured) || !r.measured.every(m => typeof m === "string" && ids.includes(m)) ||
      new Set(r.measured).size !== r.measured.length) return false;
  const w = r.watching as Record<string, unknown> | null;
  if (w === null) return true;
  return !!w && typeof w === "object" && typeof w.phase === "string" && ids.includes(w.phase) &&
    (w.since === null || (Number.isSafeInteger(w.since) && (w.since as number) >= (r.firstSeen as number)));
}
