/** First-use costs paid behind the entry pause, never in play (SIM-PERF-1). The first
 * steps after a load compile the step's code (5–8 ms headless), and the first hunter
 * contact built its hull's contact mesh (about 3 ms). Entry steps a copy of the state
 * through both, then discards it: the live state, its saves and every later step are
 * exactly as without it (tests/warmup.test.ts). */
import { warmContactMeshes } from "./hunterQueries.js";
import { stepGameInPlace } from "./step.js";
import type { GameCommand, GameState, WorldQueries } from "./types.js";

/** One second of play: held travel, then idle. */
const WARM_STEPS = 60;
const TRAVEL: readonly GameCommand[] = [{ type: "look", yawDelta: 0.004, pitchDelta: 0.002 },
  { type: "move", forward: 1, right: 0, vertical: 0, sprint: false }];
const IDLE: readonly GameCommand[] = [];

export function warmSimulation(s: Readonly<GameState>, world: WorldQueries): void {
  warmContactMeshes();
  const copy = structuredClone(s) as GameState;
  for (let i = 0; i < WARM_STEPS; i++) stepGameInPlace(copy, i < WARM_STEPS / 2 ? TRAVEL : IDLE, world);
}
