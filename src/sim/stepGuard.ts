/** Exception atomicity for the in-place step (SIM-1). The live state is
 * mutated in place, so a throw part-way through a step would leave it
 * half-applied. The guard keeps a checkpoint (one copy about once a second)
 * and a journal of everything applied since. On a throw it replays the
 * journal onto the checkpoint and writes the result back into the same state
 * object, so the state is exactly what it was before the failed step, then
 * throws a `StepFault`. The step is deterministic in (state, commands, world),
 * so the replay is exact; if it ever is not, the guard falls back to the
 * checkpoint itself, which is always a real, consistent state.
 *
 * The guard must be the only writer of the state it tracks: anything that
 * writes the state outside `step`/`command` must hand the guard the new state
 * (a different object starts a fresh checkpoint). `verifyEvery` makes that
 * checkable: every Nth checkpoint, the journal's replay must equal the live
 * state, or the guard throws `StepGuardDrift` before stepping. */
import { executeCommand, stepGameInPlace } from "./step.js";
import { firstDifference } from "./stateDiff.js";
import type { GameCommand, GameEvent, GameState, WorldQueries } from "./types.js";

/** One checkpoint per second of play at the fixed 60 Hz step. */
export const CHECKPOINT_TICKS = 60;

type Entry =
  | { kind: "step"; commands: readonly GameCommand[]; world: WorldQueries }
  | { kind: "command"; command: GameCommand; world: WorldQueries };

export interface StepGuardOptions {
  /** Journal entries between checkpoints. */
  interval?: number;
  /** Verify the replay against the live state at every Nth checkpoint (0: never). */
  verifyEvery?: number;
}

/** A step threw. `state` has been restored: `exact` is its pre-step contents;
 * `checkpoint` is the last checkpoint (at most `interval` entries earlier). */
export class StepFault extends Error {
  constructor(readonly tick: number, readonly restored: "exact" | "checkpoint", readonly cause: unknown) {
    super(`Simulation fault at tick ${tick + 1} (restored to ${restored === "exact" ? `tick ${tick}` : "the last checkpoint"}): ` +
      (cause instanceof Error ? cause.message : String(cause)), { cause });
    this.name = "StepFault";
  }
}
/** The journal's replay no longer matches the live state: something wrote the
 * state outside the guard, or the step is not deterministic. */
export class StepGuardDrift extends Error {
  constructor(readonly tick: number, readonly difference: string) {
    super(`Step guard drift at tick ${tick}: ${difference}`);
    this.name = "StepGuardDrift";
  }
}

export class StepGuard {
  private live: GameState | null = null;
  private checkpoint: GameState | null = null;
  private journal: Entry[] = [];
  private checkpoints = 0;
  private readonly interval: number;
  private readonly verifyEvery: number;
  constructor(options: StepGuardOptions = {}) {
    this.interval = Math.max(1, options.interval ?? CHECKPOINT_TICKS);
    this.verifyEvery = Math.max(0, options.verifyEvery ?? 0);
  }

  /** One fixed step of `state`, in place. */
  step(state: GameState, commands: readonly GameCommand[], world: WorldQueries): GameEvent[] {
    this.track(state);
    const tick = state.tick;
    let events: GameEvent[];
    try {
      events = stepGameInPlace(state, commands, world);
    } catch (cause) {
      throw this.restore(state, tick, cause);
    }
    // Commands are flat records; copies keep the journal independent of the caller.
    this.journal.push({ kind: "step", commands: commands.map((c) => ({ ...c })), world });
    return events;
  }

  /** A menu or key command (`executeCommand`, which keeps its own clone, so a
   * throw there never touches `state`). An accepted command returns a new state,
   * which the guard keeps tracking without a new checkpoint. */
  command(state: GameState, command: GameCommand, world: WorldQueries): { state: GameState; events: GameEvent[] } {
    this.track(state);
    const result = executeCommand(state, command, world);
    if (result.state !== state) {
      this.journal.push({ kind: "command", command: { ...command }, world });
      this.live = result.state;
    }
    return result;
  }

  private track(state: GameState): void {
    if (state === this.live && this.checkpoint && this.journal.length < this.interval) return;
    if (state === this.live && this.checkpoint && this.verifyEvery && ++this.checkpoints % this.verifyEvery === 0) {
      const difference = firstDifference(this.replay(), state);
      if (difference) throw new StepGuardDrift(state.tick, difference);
    }
    this.checkpoint = structuredClone(state);
    this.journal = [];
    this.live = state;
  }

  private replay(): GameState {
    let s = structuredClone(this.checkpoint!);
    for (const e of this.journal)
      if (e.kind === "step") stepGameInPlace(s, e.commands, e.world);
      else s = executeCommand(s, e.command, e.world).state;
    return s;
  }

  private restore(state: GameState, tick: number, cause: unknown): StepFault {
    let restored: GameState | null = null;
    try {
      const replayed = this.replay();
      if (replayed.tick === tick) restored = replayed;
    } catch { /* the checkpoint below is still a real state */ }
    const exact = restored !== null;
    overwrite(state, restored ?? structuredClone(this.checkpoint!));
    // The restored state is the new baseline: checkpoint it, so the journal
    // never replays past a point the live state did not reach.
    this.checkpoint = structuredClone(state);
    this.journal = [];
    this.live = state;
    return new StepFault(tick, exact ? "exact" : "checkpoint", cause);
  }
}

/** Replaces `target`'s contents with `source`'s, keeping `target`'s identity. */
function overwrite(target: GameState, source: GameState): void {
  const t = target as unknown as Record<string, unknown>;
  for (const k of Object.keys(t)) if (!Object.hasOwn(source, k)) delete t[k];
  Object.assign(target, source);
}
