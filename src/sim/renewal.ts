import { RENEWABLE_SOURCE_IDS, renewable, SOURCE_RENEWAL, SOURCES } from "../content/registry.js";
import type { RenewableSourceId, SourceId } from "../content/registry.js";
import type { GameState } from "./types.js";

/** Fresh progress for New Game and migration: no catch-up, refill or free materials. */
export function initialRenewal(): GameState["world"]["renewal"] {
  return RENEWABLE_SOURCE_IDS.map((id) => ({ id, progress: 0 }));
}

/** Regrowth stops at the source's original exposed stock. Sorted reserve above it is kept. */
export const renewalCap = (id: RenewableSourceId): number => SOURCES[id].stock;

/** Progress counts only while exposed stock is below the cap. Called after any
 * stock increase in the same transaction so a full source never banks time. */
export function settleRenewal(s: GameState, id: SourceId): void {
  if (!renewable(id)) return;
  const node = s.world.resources.find((n) => n.id === id)!;
  if (node.stock >= renewalCap(id)) s.world.renewal.find((r) => r.id === id)!.progress = 0;
}

/** One active expedition step. Constant cost per source, independent of elapsed real
 * time; only the caller's fixed step advances it, never menus, saves or rendering. */
export function advanceRenewal(s: GameState): void {
  if (s.scenario !== "expedition" || s.opening.phase < 4) return;
  for (const r of s.world.renewal) {
    const node = s.world.resources.find((n) => n.id === r.id)!, cap = renewalCap(r.id);
    if (node.stock >= cap) {
      r.progress = 0;
      continue;
    }
    if (++r.progress < SOURCE_RENEWAL[r.id].intervalSteps) continue;
    node.stock = Math.min(cap, node.stock + SOURCE_RENEWAL[r.id].quantity);
    r.progress = 0;
  }
}
