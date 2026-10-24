/** S5's campaign planner over the composed registry. Each fleet-strategy step
 * takes its plan, materials and outcome from RECIPES, HULLS, REFIT_TIERS and
 * SUIT_RATINGS; material reach comes from the real first-access deposits in
 * SOURCES; plan sources come from the story grants and the real TECH_RECORDS.
 * The audit says, per step, what real content it still lacks. */
import { HULLS, MATERIALS, RECIPES, REFIT_TIERS, SOURCES, SUIT_RATINGS, TECH_RECORDS } from "../content/registry.js";
import type { CostKind, HullId, MaterialId, RecipeId, SourceId } from "../content/registry.js";
import { CAMPAIGN_SOURCE_SITES } from "../content/campaign/index.js";
import { CAMPAIGN_STEPS, FLEET_STRATEGIES, MATERIAL_SHELVES, SWIM_DEPTH } from "../content/story/strategies.js";
import type { AnyBlueprint, CampaignStep, StepId, StrategyId } from "../content/story/strategies.js";
import { OUTPOST_TIER_ORDER, OUTPOST_TIERS } from "../content/systems/hosts.js";
import { MAIN_PATH_PLANS } from "../content/systems/decodes.js";
import type { OutpostTier } from "../content/systems/hosts.js";
import { planCampaign } from "./story/index.js";
import type { CampaignModel, CampaignPlan, Shelves } from "./story/index.js";

/** Strategy steps and the real recipe that performs each. */
export const STEP_RECIPES = {
  suit_150: "suit_150", dart: "dart_base", suit_350: "suit_350", dart_350: "dart_350",
  creel: "creel_base", creel_350: "creel_350", stop_canopy: "restore_canopy_stop",
  suit_450: "suit_450", creel_450: "creel_450", stop_divide_lee: "restore_divide_stop",
  creel_800: "creel_800", suit_800: "suit_800",
  hearthline_400: "hearthline_base", hearthline_550: "hearthline_550", mantle: "mantle_base",
} as const satisfies Record<StepId, RecipeId>;

export interface StepAudit {
  step: StepId;
  recipe: RecipeId | null;
  /** Empty when the step is fully backed by real content. */
  blocked: string[];
}

const isMaterial = (k: string): k is MaterialId => Object.hasOwn(MATERIALS, k);
/** Deposits that need no protection beyond pressure: the ones first access may use. */
const unprotected = (id: string): boolean =>
  !Object.hasOwn(CAMPAIGN_SOURCE_SITES, id) || CAMPAIGN_SOURCE_SITES[id as keyof typeof CAMPAIGN_SOURCE_SITES].protection === null;
const sourcesOf = (kind: CostKind) => (Object.keys(SOURCES) as SourceId[]).filter((id) => SOURCES[id].item === kind);
const depthOf = (id: SourceId): number => Math.max(0, -SOURCES[id].position.y);
const shallowest = (kind: CostKind): number => Math.min(...sourcesOf(kind).filter(unprotected).map(depthOf));

/** First-access shelf per material from the real registry: the shallowest
 * deposit workable without protection. A diver works every source. */
export function registryShelves(): Shelves {
  return Object.fromEntries((Object.keys(MATERIAL_SHELVES) as MaterialId[]).map((m) => {
    const depth = shallowest(m);
    return [m, { depth, exit: depth }];
  })) as unknown as Shelves;
}

const isHull = (k: string): k is HullId => Object.hasOwn(HULLS, k);
const isSuit = (k: string): k is keyof typeof SUIT_RATINGS => Object.hasOwn(SUIT_RATINGS, k);

/** Real-recipe step: the recipe's plan and materials, its real rating outcome,
 * and the strategy's ordering. Prerequisite recipes outside the strategy add
 * their own plans and materials. */
function recipeStep(id: StepId, recipeId: RecipeId): CampaignStep {
  const proposal: CampaignStep = CAMPAIGN_STEPS[id];
  const chain = new Set<RecipeId>();
  const walk = (r: RecipeId): void => { if (chain.has(r)) return; chain.add(r); for (const n of RECIPES[r].needs as readonly RecipeId[]) walk(n); };
  walk(recipeId);
  const blueprints = [...new Set([...chain].map((r) => RECIPES[r].bp as AnyBlueprint))];
  const materials = [...new Set([...chain].flatMap((r) => Object.keys(RECIPES[r].cost)).filter(isMaterial))];
  const r = RECIPES[recipeId];
  const tier = Object.hasOwn(REFIT_TIERS, recipeId) ? REFIT_TIERS[recipeId as keyof typeof REFIT_TIERS] : null;
  const hull: CampaignStep["hull"] = tier ? [tier.hull, tier.rating]
    : isHull(r.output) ? [r.output, HULLS[r.output].initialDepth] : undefined;
  const suit = isSuit(r.output) ? SUIT_RATINGS[r.output] : undefined;
  return { label: r.label, blueprints, needs: proposal.needs, materials,
    ...(suit ? { suit } : {}), ...(hull ? { hull } : {}), ...(proposal.stop ? { stop: proposal.stop } : {}) };
}

export function audit(strategy: StrategyId): StepAudit[] {
  return FLEET_STRATEGIES[strategy].steps.map((step) => {
    const recipe: RecipeId = STEP_RECIPES[step];
    const blocked: string[] = [];
    for (const [kind, n] of Object.entries(RECIPES[recipe].cost) as [CostKind, number][]) {
      const found = sourcesOf(kind);
      if (!found.length) { blocked.push(`no ${kind} source`); continue; }
      const stock = found.reduce((sum, s) => sum + SOURCES[s].stock + SOURCES[s].reserve, 0);
      if (stock < n) blocked.push(`${kind} stock ${stock} < ${n}`);
      // S5's proposal shelves are the design target; the real first deposit must not be deeper.
      if (isMaterial(kind) && shallowest(kind) > Math.max(SWIM_DEPTH, MATERIAL_SHELVES[kind].depth))
        blocked.push(`${kind} first source at ${shallowest(kind)} m, past its ${MATERIAL_SHELVES[kind].depth} m shelf`);
      // Frames are lifted by a Creel's arms or a suited diver: the initial Creel must reach one.
      if (kind === "tagged_frame" && shallowest(kind) > HULLS.creel.initialDepth) blocked.push(`tagged frames past ${HULLS.creel.initialDepth} m`);
    }
    return { step, recipe, blocked };
  });
}

/** Real plan sources outside the story: the technical records. */
const REAL_GRANTS: CampaignModel["grants"] = Object.fromEntries(Object.entries(TECH_RECORDS).map(([id, r]) => {
  const depth = Math.max(0, -r.position.y);
  return [id, { depth, exit: depth, grants: r.blueprints as readonly AnyBlueprint[] }];
}));

/** The composed model: every step from its real recipe, shelves from real deposits. */
export function registryModel(strategy: StrategyId): CampaignModel {
  const steps: Record<string, CampaignStep> = {};
  const order: StepId[] = [...FLEET_STRATEGIES[strategy].steps];
  for (const step of order) steps[step] = recipeStep(step, STEP_RECIPES[step]);
  return { steps, order, grants: REAL_GRANTS, shelves: registryShelves() };
}
export const planRegistryCampaign = (strategy: StrategyId): CampaignPlan =>
  planCampaign(strategy, { model: registryModel(strategy) });

/** One main-path plan on the route: the shallowest real record that grants it and
 * the first strategy step after which a diver reaches it. Records only: a lost
 * site's decoded copy never counts (LS-1). */
export interface PlanStop {
  readonly plan: string;
  readonly record: string | null;
  readonly depth: number;
  /** Index into the strategy's steps; -1 before any step, null when unreachable. */
  readonly after: number | null;
}
function planStops(strategy: StrategyId, plans: readonly string[]): PlanStop[] {
  const order = FLEET_STRATEGIES[strategy].steps as readonly StepId[];
  // Personal reach after each step: the deepest suit fitted so far.
  const reach = order.map((_, i) => Math.max(SWIM_DEPTH, ...order.slice(0, i + 1)
    .map((id) => (CAMPAIGN_STEPS[id] as CampaignStep).suit ?? 0)));
  return plans.map((plan) => {
    const found = Object.entries(REAL_GRANTS).filter(([, g]) => (g.grants as readonly string[]).includes(plan))
      .sort(([, a], [, b]) => a.depth - b.depth)[0];
    if (!found) return { plan, record: null, depth: Infinity, after: null };
    const depth = found[1].depth, i = reach.findIndex((r) => r >= depth);
    return { plan, record: found[0], depth, after: depth <= SWIM_DEPTH ? -1 : i < 0 ? null : i };
  });
}
/** LS-1: every plan both routes depend on (`MAIN_PATH_PLANS`: the decoder, the three
 * kits, planters) on this strategy's real route. */
export const mainPathPlanRoute = (strategy: StrategyId): PlanStop[] => planStops(strategy, MAIN_PATH_PLANS);
/** Problems with the main-path plans: one with no real record, or beyond every step. */
export const mainPathPlanProblems = (strategy: StrategyId): string[] => mainPathPlanRoute(strategy).flatMap((p) =>
  p.after === null ? [`${p.plan} ${p.record ? `at ${p.depth} m is beyond every ${strategy} step` : "has no main-path record"}`] : []);

/** One outpost tier's plan on the route (the kit view of `planStops`). */
export interface KitPlanStop {
  readonly tier: OutpostTier;
  readonly record: string | null;
  readonly depth: number;
  /** Index into the strategy's steps; -1 before any step, null when unreachable. */
  readonly after: number | null;
}
/** CB (C4): the main-path outpost-kit plans stay reachable in tier order. Lost-site
 * copies are optional extras and never count here. */
export function kitPlanRoute(strategy: StrategyId): KitPlanStop[] {
  const stops = planStops(strategy, OUTPOST_TIER_ORDER.map((tier) => OUTPOST_TIERS[tier].bp));
  return OUTPOST_TIER_ORDER.map((tier, i) => ({ tier, record: stops[i]!.record, depth: stops[i]!.depth, after: stops[i]!.after }));
}
/** Problems with the kit route: a missing or unreachable plan, or tiers out of order. */
export function kitPlanProblems(strategy: StrategyId): string[] {
  const route = kitPlanRoute(strategy), out: string[] = [];
  route.forEach((k, i) => {
    if (k.after === null) out.push(`${k.tier} kit plan ${k.record ? `at ${k.depth} m is beyond every ${strategy} step` : "has no main-path record"}`);
    const prev = route[i - 1];
    if (prev && prev.after !== null && k.after !== null && k.after < prev.after) out.push(`${k.tier} kit plan comes before the ${prev.tier} plan`);
  });
  return out;
}
