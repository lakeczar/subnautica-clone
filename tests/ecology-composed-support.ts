// Shared by tests/ecology-composed.test.ts and its heavy tier file (TT-1); not a test file itself.
import { homeOf } from "../src/sim/ecology/agents.js";
import { recordStory } from "../src/sim/storyLink.js";
import type { GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { at, creelFirst, fund, world } from "./b1-support.js";
import { play } from "./step-support.js";

/** Rule-staged diver with an 800 m suit (real recipes), placed at a real Rift pose. */
export function riftDiver(p: Vec3): GameState {
  const s = creelFirst(["creel_350"]);
  recordStory(s, "C07");
  for (const id of ["suit_450", "suit_800"] as const) fund(s, id);
  at(s, p);
  s.player.vitals.health = 100;
  return s;
}

export const hold = (s: GameState, n: number, still = true): { state: GameState; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  const state = play(s, n, still ? [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false }] : [], world, (e) => { events.push(...e); });
  return { state, events };
};

export const near = homeOf("rift_stalker_passage");

export const start = { x: near.x + 8, y: near.y, z: near.z };
