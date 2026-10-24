/** One active expedition step of every SYS-2 background rule. Like renewal it
 * advances only from the fixed step, never from menus, saves or rendering. */
import { FIXED_SECONDS } from "../clock.js";
import type { GameState } from "../types.js";
import { advanceGrowth, growthRate } from "./cultivation.js";
import { advanceDecodes } from "./decoder.js";
import type { DecodeCompletion, DecoderContext } from "./decoder.js";
import { visitChart } from "./navigation.js";
import type { SystemsState } from "./state.js";
import type { SeedKind } from "../../content/systems/cultivation.js";

export type SystemsEvent =
  | { type: "decoded"; completion: DecodeCompletion }
  | { type: "crop-ready"; seed: SeedKind }
  | { type: "chart-explored"; cells: string[] };

export function advanceSystems(s: GameState, sys: SystemsState, ctx: DecoderContext = {}, seconds = FIXED_SECONDS): SystemsEvent[] {
  if (s.scenario !== "expedition" || s.opening.phase < 4) return [];
  const events: SystemsEvent[] = [];
  const cells = visitChart(sys, s.player.pose.position);
  if (cells.length) events.push({ type: "chart-explored", cells });
  for (const completion of advanceDecodes(s, sys, seconds, ctx)) events.push({ type: "decoded", completion });
  for (const seed of advanceGrowth(sys, seconds, (p) => growthRate(s, sys, p, ctx.power))) events.push({ type: "crop-ready", seed });
  return events;
}
