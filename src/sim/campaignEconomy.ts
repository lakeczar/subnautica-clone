/** S9 finite-stock ledger for the whole campaign, both fleet strategies. Every
 * price, deposit, depth, hold and protection comes from the registry. It walks a
 * strategy's purchases in order and draws each material only from deposits the
 * equipment owned *before* that purchase can work: a diver needs the suit for the
 * deposit's depth and a craft rated to it (beyond swim depth), and a protected
 * deposit needs its protection. Exposed stock is drawn first, then finite host
 * reserves (sorting). Living sheds never regrow here: zero renewal.
 *
 * It is arithmetic, not play: no route time, oxygen or power margin. Runtime
 * commands for the B1 prefix are proved by scripts/check-m2-b1-economy.mjs. */
import { CAMPAIGN_SOURCE_SITES } from "../content/campaign/index.js";
import {
  HULL_HOLD_CU, HULLS, ITEMS, MATERIALS, MODULES, RECIPES, REFIT_TIERS, SOURCES, SUIT_RATINGS,
} from "../content/registry.js";
import type { CostKind, HullId, RecipeId, SourceId } from "../content/registry.js";
import { STORY_RECIPES } from "../content/story/evidence.js";
import { CANISTER_CU } from "./recovery.js";

export type EconomyStrategy = "independent" | "carrier";
/** Works costs are paid on site at the district from carried stock. */
export type WorksCost = "restore_upper_hall" | "restore_food_module";
export type Act =
  | { kind: "craft"; recipe: RecipeId; optional?: true }
  | { kind: "works"; cost: WorksCost }
  /** The sortie hull is lost at `depth` with this cargo; the cargo is written
   * off (stricter than the rules, which keep hold cargo with the hull), the hull
   * is salvaged in place into a canister and rebuilt from that return alone. */
  | { kind: "loss"; hull: HullId; depth: number; cargo: readonly (RecipeId | WorksCost)[] };

const PREFIX: readonly RecipeId[] = [
  "pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit", "restore_workshop",
  "dart_base", "suit_350", "creel_base", "creel_cargo_rack", "restore_canopy_stop", "creel_350", "dart_350",
  "suit_450", "bobbin_deep_tether",
];
const STORY_TAIL: readonly Act[] = [
  { kind: "craft", recipe: "pod_buffer" },
  { kind: "craft", recipe: "service_power_assembly" }, { kind: "craft", recipe: "service_air_assembly" },
  { kind: "works", cost: "restore_upper_hall" }, { kind: "works", cost: "restore_food_module" },
];
const craft = (recipe: RecipeId): Act => ({ kind: "craft", recipe });
const extra = (recipe: RecipeId): Act => ({ kind: "craft", recipe, optional: true });

/** Required purchases per strategy, in a credible order: each after the plans
 * and equipment that reach its materials. */
export const REQUIRED: Record<EconomyStrategy, readonly Act[]> = {
  independent: [...PREFIX.map(craft), ...["creel_450", "restore_rift_station", "restore_divide_stop", "creel_800", "suit_800"]
    .map((r) => craft(r as RecipeId)), ...STORY_TAIL],
  // C4: core now opens the carrier (CB), and lattice lies at 450 m, past the
  // carrier's 400 m: the Dart's 450 m refit is the scout that fetches it.
  carrier: [...PREFIX.map(craft), ...["hearthline_keel", "hearthline_base", "dart_450", "hearthline_550", "mantle_base", "suit_800"]
    .map((r) => craft(r as RecipeId)), ...STORY_TAIL],
};
/** One credible optional spend per strategy, placed where a player would buy it. */
export const OPTIONAL: Record<EconomyStrategy, readonly { after: RecipeId; recipe: RecipeId }[]> = {
  independent: [
    { after: "creel_cargo_rack", recipe: "creel_cabin" }, { after: "dart_base", recipe: "dart_acoustic_trim" },
    { after: "restore_canopy_stop", recipe: "hush_base" }, { after: "bobbin_deep_tether", recipe: "glow_lures" },
    { after: "bobbin_deep_tether", recipe: "startle_ink" }, { after: "creel_450", recipe: "heat_shroud" },
    { after: "creel_450", recipe: "trim_vanes" },
  ],
  carrier: [
    { after: "creel_cargo_rack", recipe: "creel_cabin" }, { after: "restore_canopy_stop", recipe: "spindle_base" },
    { after: "bobbin_deep_tether", recipe: "glow_lures" }, { after: "bobbin_deep_tether", recipe: "startle_ink" },
    { after: "hearthline_base", recipe: "galley_planter" }, { after: "mantle_base", recipe: "brine_seals" },
  ],
};
/** The failed rescue: the deepest sortie hull is lost on its first works sortie. */
export const FAILURE: Record<EconomyStrategy, Extract<Act, { kind: "loss" }>> = {
  // The 800 m Creel carries the whole works load in its rack.
  independent: { kind: "loss", hull: "creel", depth: 768,
    cargo: ["service_power_assembly", "service_air_assembly", "restore_upper_hall", "restore_food_module"] },
  // The Mantle's 32 CU hold: both assemblies and the food module stock.
  carrier: { kind: "loss", hull: "mantle", depth: 768,
    cargo: ["service_power_assembly", "service_air_assembly", "restore_food_module"] },
};

export interface ScenarioOptions {
  optional?: boolean;
  failure?: boolean;
  /** Deposits treated as absent (adverse checks). */
  without?: readonly SourceId[];
  /** Draw only exposed stock; never sort reserves. */
  exposedOnly?: boolean;
}

export function scenarioActs(strategy: EconomyStrategy, opts: ScenarioOptions = {}): Act[] {
  const acts: Act[] = [];
  for (const a of REQUIRED[strategy]) {
    if (opts.failure && a.kind === "craft" && a.recipe === "pod_buffer") acts.push(FAILURE[strategy]);
    acts.push(a);
    if (opts.optional && a.kind === "craft")
      for (const o of OPTIONAL[strategy]) if (o.after === a.recipe) acts.push(extra(o.recipe));
  }
  return acts;
}

interface Caps { suit: number; hulls: Partial<Record<HullId, number>>; heat: boolean; brine: boolean; rack: boolean }
const SWIM = 60;
const workable = (id: SourceId, caps: Caps): boolean => {
  const depth = Math.max(0, -SOURCES[id].position.y);
  if (depth > Math.max(SWIM, caps.suit)) return false;
  if (depth > SWIM && !Object.values(caps.hulls).some((r) => (r ?? 0) >= depth)) return false;
  const protection = Object.hasOwn(CAMPAIGN_SOURCE_SITES, id) ? CAMPAIGN_SOURCE_SITES[id as keyof typeof CAMPAIGN_SOURCE_SITES].protection : null;
  return protection === null || (protection === "heat" ? caps.heat || (caps.hulls.mantle ?? 0) >= depth : caps.brine);
};
/** Best single-trip carrying capacity for a deposit: a craft rated to it, or the diver. */
const haul = (depth: number, caps: Caps): number => Math.max(16, ...(Object.entries(caps.hulls) as [HullId, number][])
  .filter(([h, r]) => r >= depth && h !== "spindle").map(([h]) => h === "creel" && caps.rack ? MODULES.creel_cargo_rack.holdCu : HULL_HOLD_CU[h]));

const costOf = (a: RecipeId | WorksCost): Partial<Record<CostKind, number>> =>
  a === "restore_upper_hall" || a === "restore_food_module" ? STORY_RECIPES[a].cost : RECIPES[a].cost;
const cuOf = (kind: CostKind, n: number): number => ITEMS[kind].cu * n;

export interface Shortfall { act: string; kind: CostKind; short: number }
export interface ScenarioResult {
  strategy: EconomyStrategy;
  solvent: boolean;
  shortfalls: Shortfall[];
  acts: string[];
  spent: Record<string, number>;
  /** Units sorted out of finite host reserves, by material. */
  reserveUsed: Record<string, number>;
  remaining: Record<string, { exposed: number; reserve: number }>;
  /** Deposits each purchase drew from. */
  drawn: Record<string, SourceId[]>;
  /** Hauling trips per purchase with the best craft owned at the time. */
  trips: Record<string, number>;
  /** Units written off in the failed rescue. */
  lost: Record<string, number>;
  rebuild: { hull: HullId; investmentCu: number; canisterCu: number; fits: boolean; chain: RecipeId[] } | null;
  renewalCredited: 0;
  finalCaps: { suit: number; hulls: Partial<Record<HullId, number>> };
}

/** Recipes that built and refitted a hull, oldest first, from the purchase log. */
function hullChain(hull: HullId, crafted: readonly RecipeId[]): RecipeId[] {
  return crafted.filter((r) => RECIPES[r].output === hull ||
    (Object.hasOwn(REFIT_TIERS, r) && REFIT_TIERS[r as keyof typeof REFIT_TIERS].hull === hull) ||
    (hull === "hearthline" && r === "hearthline_keel"));
}

export function runScenario(strategy: EconomyStrategy, opts: ScenarioOptions = {}): ScenarioResult {
  const without = new Set(opts.without ?? []);
  const stock = new Map<SourceId, { exposed: number; reserve: number }>();
  for (const id of Object.keys(SOURCES) as SourceId[])
    if (SOURCES[id].item !== "meal" && !without.has(id)) stock.set(id, { exposed: SOURCES[id].stock, reserve: SOURCES[id].reserve });
  const caps: Caps = { suit: 60, hulls: {}, heat: false, brine: false, rack: false };
  const out: ScenarioResult = { strategy, solvent: true, shortfalls: [], acts: [], spent: {}, reserveUsed: {}, remaining: {},
    drawn: {}, trips: {}, lost: {}, rebuild: null, renewalCredited: 0, finalCaps: { suit: 0, hulls: {} } };
  const crafted: RecipeId[] = [];
  const add = (rec: Record<string, number>, k: string, n: number): void => { rec[k] = (rec[k] ?? 0) + n; };

  const pay = (label: string, cost: Partial<Record<CostKind, number>>): void => {
    let cu = 0, deepest = 0;
    for (const [kind, n] of Object.entries(cost) as [CostKind, number][]) {
      let need = n;
      const hosts = [...stock.keys()].filter((id) => SOURCES[id].item === kind && workable(id, caps))
        .sort((a, b) => SOURCES[b].position.y - SOURCES[a].position.y);
      for (const pass of opts.exposedOnly ? ["exposed"] as const : ["exposed", "reserve"] as const)
        for (const id of hosts) {
          if (need === 0) break;
          const node = stock.get(id)!, take = Math.min(need, node[pass]);
          if (!take) continue;
          node[pass] -= take; need -= take;
          if (pass === "reserve") add(out.reserveUsed, kind, take);
          if (!(out.drawn[label] ??= []).includes(id)) out.drawn[label].push(id);
          deepest = Math.max(deepest, -SOURCES[id].position.y);
        }
      if (need > 0) { out.solvent = false; out.shortfalls.push({ act: label, kind, short: need }); }
      add(out.spent, kind, n - need);
      cu += cuOf(kind, n);
    }
    out.trips[label] = (out.trips[label] ?? 0) + Math.ceil(cu / haul(deepest, caps));
  };
  const gain = (r: RecipeId): void => {
    const def = RECIPES[r], output: string = def.output;
    if (Object.hasOwn(SUIT_RATINGS, output)) caps.suit = Math.max(caps.suit, SUIT_RATINGS[output as keyof typeof SUIT_RATINGS]);
    if (Object.hasOwn(HULLS, output)) caps.hulls[output as HullId] = HULLS[output as HullId].initialDepth;
    if (Object.hasOwn(REFIT_TIERS, r)) { const t = REFIT_TIERS[r as keyof typeof REFIT_TIERS]; caps.hulls[t.hull] = t.rating; }
    if (r === "heat_shroud") caps.heat = true;
    if (r === "brine_seals") caps.brine = true;
    if (r === "creel_cargo_rack") caps.rack = true;
  };

  for (const act of scenarioActs(strategy, opts)) {
    if (act.kind === "craft") {
      const label = act.optional ? `${act.recipe} (optional)` : act.recipe;
      out.acts.push(label);
      // Rescue-stock kits draw on the replenished recovery allocation, never finite stock.
      if (!RECIPES[act.recipe].maintenance) pay(label, RECIPES[act.recipe].cost);
      crafted.push(act.recipe); gain(act.recipe);
    } else if (act.kind === "works") {
      out.acts.push(act.cost); pay(act.cost, STORY_RECIPES[act.cost].cost);
    } else {
      out.acts.push(`lose ${act.hull} at ${act.depth} m`);
      // The written-off cargo was paid once already; paying it again is the loss.
      for (const c of act.cargo) {
        for (const [k, n] of Object.entries(costOf(c)) as [CostKind, number][]) add(out.lost, k, n);
        pay(`replace ${c}`, costOf(c));
      }
      // Salvage: the canister returns the paid frame investment; the rebuild spends exactly it.
      const chain = hullChain(act.hull, crafted);
      const investmentCu = chain.reduce((n, r) => n + Object.entries(RECIPES[r].cost)
        .reduce((m, [k, q]) => m + cuOf(k as CostKind, q as number), 0), 0);
      const mount = act.hull === "creel" && caps.rack ? ITEMS.creel_cargo_rack.cu : 0;
      out.rebuild = { hull: act.hull, investmentCu, canisterCu: investmentCu + mount, fits: investmentCu + mount <= CANISTER_CU, chain };
      if (!out.rebuild.fits) { out.solvent = false; out.shortfalls.push({ act: `salvage ${act.hull}`, kind: "structural_alloy", short: 0 }); }
    }
  }
  for (const kind of [...Object.keys(MATERIALS), "tagged_frame"]) {
    let exposed = 0, reserve = 0;
    for (const [id, n] of stock) if (SOURCES[id].item === kind) { exposed += n.exposed; reserve += n.reserve; }
    out.remaining[kind] = { exposed, reserve };
  }
  out.finalCaps = { suit: caps.suit, hulls: { ...caps.hulls } };
  return out;
}

/** The solvency rule: required progression, a credible optional spend and a failed
 * rescue together, on finite stock with zero renewal. */
export const solvency = (strategy: EconomyStrategy, without: readonly SourceId[] = []): ScenarioResult =>
  runScenario(strategy, { optional: true, failure: true, without });
/** Total units each material contributes across the registry. */
export function finiteStock(kind: CostKind): { exposed: number; reserve: number } {
  const ids = (Object.keys(SOURCES) as SourceId[]).filter((id) => SOURCES[id].item === kind);
  return { exposed: ids.reduce((n, id) => n + SOURCES[id].stock, 0), reserve: ids.reduce((n, id) => n + SOURCES[id].reserve, 0) };
}
