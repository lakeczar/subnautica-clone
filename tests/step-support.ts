/** Test stepping without a copy per tick (SIM-1): one copy of `start`, then the
 * in-place step. `start` is left untouched, so callers keep `stepGame`'s pure
 * contract; only the returned state moves. */
import { stepGameInPlace } from "../src/sim/step.js";
import type { GameCommand, GameEvent, GameState, WorldQueries } from "../src/sim/types.js";

export function play(start: GameState, ticks: number, commands: readonly GameCommand[], world: WorldQueries,
  each?: (events: GameEvent[], s: GameState) => void): GameState {
  const s = structuredClone(start);
  for (let i = 0; i < ticks; i++) {
    const events = stepGameInPlace(s, commands, world);
    each?.(events, s);
  }
  return s;
}
