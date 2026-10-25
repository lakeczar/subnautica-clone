/** Whether one step's sampled controls are player activity for the play timeline
 * (C4B-06). The runtime samples a `look` and a `move` every step, so their mere
 * presence is not input: a zero look and a zero move (sprint or quiet held with no
 * movement) are no activity. Any other command is. */
import type { GameCommand } from "../types.js";

export function controlsActive(controls: readonly GameCommand[]): boolean {
  return controls.some((c) =>
    c.type === "look" ? c.yawDelta !== 0 || c.pitchDelta !== 0
    : c.type === "move" ? c.forward !== 0 || c.right !== 0 || c.vertical !== 0
    : true);
}
