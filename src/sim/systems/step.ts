/** One active expedition step of every SYS-2 background rule. Like renewal it
 * advances only from the fixed step, never from menus, saves or rendering. */
import { FIXED_SECONDS } from "../clock.js";
import type { GameState } from "../types.js";
import { advanceGrowth, growthRateFor, hostPoweredNow } from "./cultivation.js";
import { advanceDecodes } from "./decoder.js";
import type { DecodeCompletion, DecoderContext } from "./decoder.js";
import { visitChart } from "./navigation.js";
import { openSiteCaches } from "./siteCaches.js";
import type { SystemsState } from "./state.js";
import type { SeedKind } from "../../content/systems/cultivation.js";
import type { LostSiteCacheId } from "../../content/systems/lostSites.js";

export type SystemsEvent =
  | { type: "decoded"; completion: DecodeCompletion }
  | { type: "crop-ready"; seed: SeedKind }
  | { type: "chart-explored"; cells: string[] }
  /** LS-1: a lost site's cache, found on first reach; its container opens. */
  | { type: "cache-found"; cache: LostSiteCacheId };

export function advanceSystems(s: GameState, sys: SystemsState, ctx: DecoderContext = {}, seconds = FIXED_SECONDS): SystemsEvent[] {
  if (s.scenario !== "expedition" || s.opening.phase < 4) return [];
  const events: SystemsEvent[] = [];
  const cells = visitChart(sys, s.player.pose.position);
  if (cells.length) events.push({ type: "chart-explored", cells });
  const caches = openSiteCaches(s);
  for (let i = 0; i < caches.length; i++) events.push({ type: "cache-found", cache: caches[i]! });
  for (const completion of advanceDecodes(s, sys, seconds, ctx)) events.push({ type: "decoded", completion });
  // LS-1: a bed's rate reads the step's own host power answer (`ctx.hostPowered`, one
  // lookup per host), never a host view rebuilt per crop.
  const powered = ctx.hostPowered ?? ((hostId: string) => hostPoweredNow(s, sys, hostId, ctx.power));
  for (const seed of advanceGrowth(sys, seconds, (p) => growthRateFor(sys, p, powered))) events.push({ type: "crop-ready", seed });
  return events;
}
