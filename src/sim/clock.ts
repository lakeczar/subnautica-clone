export const FIXED_SECONDS = 1 / 60;
export const MAX_FRAME_SECONDS = 0.15;
export const MAX_STEPS_PER_FRAME = 8;
/** A duration for the player: whole seconds below 90 s, else whole minutes.
 * The one formatter (ui/format.ts re-exports it; sim text such as the journal uses it here). */
export const formatDuration = (seconds: number): string => seconds < 90 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;

/** Timestamp is monotonic milliseconds. An interruption resets accumulation;
 * at most eight updates happen per frame. Lost time is intentionally discarded. */
export class FixedStepClock {
  private previous: number | null = null;
  private accumulated = 0;

  reset(): void { this.previous = null; this.accumulated = 0; }

  advance(now: number, active: boolean, update: () => void): number {
    if (!Number.isFinite(now)) return 0;
    if (this.previous === null || !active) {
      this.previous = now;
      this.accumulated = 0;
      return 0;
    }
    const delta = Math.max(0, Math.min(MAX_FRAME_SECONDS, (now - this.previous) / 1000));
    this.previous = now;
    this.accumulated += delta;
    let steps = 0;
    while (this.accumulated + 1e-9 >= FIXED_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      update();
      this.accumulated -= FIXED_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulated = 0;
    return steps;
  }
}
