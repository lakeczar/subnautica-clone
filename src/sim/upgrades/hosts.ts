/** SYS-1's answers to SYS-2's upgrade hooks: `decoderSpeed(moduleId)`, the
 * survey `tier`, outpost `limitBonus`, `livePosition`, and the specimen bay
 * flag for `seedCollectable`. Pure: the coordinator passes the module upgrade
 * record and `knowledge.crafted`. */
import { HOST_UPGRADES, hostUpgrade, hostUpgradeId } from "../../content/upgrades/hosts.js";
import type { HostUpgradeId } from "../../content/upgrades/hosts.js";
import type { CraftProfile } from "./effects.js";
import { shortfalls } from "./fitting.js";
import type { Shortfall, Stock } from "./fitting.js";
import { sampleRefusal } from "./tools.js";

/** Module item ID → the highest host upgrade applied to it (proposed save field). */
export type ModuleUpgrades = Readonly<Record<string, HostUpgradeId>>;
const SURVEY_MAX_TIER = 3;

/** SYS-2 `DecoderContext.decoderSpeed`. */
export const decoderSpeed = (mods: ModuleUpgrades) => (moduleId: string): number => {
  const id = mods[moduleId];
  return (id && hostUpgrade(id).decoderSpeed) || 1;
};
/** SYS-2 `stationSurvey(…, tier)`. A surfaced Spindle's radio mast near the host adds a tier. */
export function surveyTier(mods: ModuleUpgrades, moduleId: string, mastNearby = false): number {
  const id = mods[moduleId], base = (id && hostUpgrade(id).surveyTier) || 0;
  return Math.min(SURVEY_MAX_TIER, base + (mastNearby ? 1 : 0));
}
/** The mast boosts a host while the Spindle is surfaced within this reach of it. */
export const MAST_REACH = 100;
export const mastNearby = (p: CraftProfile, surfaced: boolean, distanceToHost: number): boolean =>
  p.contracts.includes("radio_mast") && surfaced && distanceToHost <= MAST_REACH;
/** SYS-2 `OutpostRules.limitBonus`: the best network crafted (tiers do not stack). */
export const outpostLimitBonus = (crafted: readonly string[]): number =>
  Math.max(0, ...crafted.filter(hostUpgradeId).map((id) => hostUpgrade(id).outpostBonus ?? 0));
/** SYS-2 `chartView(…, { livePosition })`. */
export const livePosition = (crafted: readonly string[]): boolean =>
  crafted.filter(hostUpgradeId).some((id) => hostUpgrade(id).livePosition === true);
/** SYS-2 `seedCollectable(seed, specimenBay)`: a piloted Hush with room in its bay. */
export const specimenBayAvailable = (p: CraftProfile | null, held: number): boolean =>
  !!p && sampleRefusal(p, held, true) === null;

/** Applying a module upgrade to one decoder or survey module, in place. */
export function moduleUpgradePreview(mods: ModuleUpgrades, module: { itemId: string; kind: string }, id: HostUpgradeId,
  stock: Stock, plans: readonly string[]): { refusal: string | null; after: ModuleUpgrades; shortfalls: Shortfall[] } {
  const d = hostUpgrade(id), current = mods[module.itemId], missing = shortfalls(d.cost, stock);
  const result = (refusal: string | null) => ({ refusal, after: refusal ? mods : { ...mods, [module.itemId]: id }, shortfalls: missing });
  if (d.scope !== "module") return result(`${d.label} is crafted once, not fitted to a module.`);
  if (module.kind !== d.module) return result(`${d.label} fits a ${d.module} module.`);
  if (current && hostUpgrade(current).tier >= d.tier) return result(`This ${d.module} already has ${hostUpgrade(current).label}.`);
  if (!plans.includes(d.plan)) return result(`${d.label} needs its plans first.`);
  return result(missing.length ? `${d.label} needs ${missing.map((m) => `${m.need - m.have} more ${m.kind.replaceAll("_", " ")}`).join(", ")}. Nothing was used.` : null);
}
/** Crafting a knowledge upgrade once. */
export function knowledgeUpgradeRefusal(crafted: readonly string[], id: HostUpgradeId, stock: Stock, plans: readonly string[]): string | null {
  const d = hostUpgrade(id);
  if (d.scope !== "knowledge") return `${d.label} is fitted to a module.`;
  if (crafted.includes(id)) return `${d.label} is already built.`;
  const better = crafted.filter(hostUpgradeId).find((c) => HOST_UPGRADES[c].line === d.line && HOST_UPGRADES[c].tier > d.tier);
  if (better) return `${hostUpgrade(better).label} already does more.`;
  if (!plans.includes(d.plan)) return `${d.label} needs its plans first.`;
  const missing = shortfalls(d.cost, stock);
  return missing.length ? `${d.label} needs ${missing.map((m) => `${m.need - m.have} more ${m.kind.replaceAll("_", " ")}`).join(", ")}. Nothing was used.` : null;
}
