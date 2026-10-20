/** S5's campaign planner over the composed registry. Each fleet-strategy step
 * that has a real recipe takes its plan, materials and outcome from RECIPES,
 * HULLS and HULL_REFITS; plan sources come from the story grants and the real
 * TECH_RECORDS. The audit says, per step, what real content it still lacks. */
import { HULL_REFITS, HULLS, MATERIALS, RECIPES, SOURCES, TECH_RECORDS } from "../content/registry.js";
import type { CostKind, MaterialId, RecipeId } from "../content/registry.js";
import { CAMPAIGN_STEPS, FLEET_STRATEGIES, MATERIAL_SHELVES, SWIM_DEPTH } from "../content/story/strategies.js";
import type { AnyBlueprint, CampaignStep, StepId, StrategyId } from "../content/story/strategies.js";
import { planCampaign } from "./story/index.js";
import type { CampaignModel, CampaignPlan } from "./story/index.js";

/** Strategy steps and the real recipe that performs each. Steps absent here
 * have no recipe yet (later tiers and regions). */
export const STEP_RECIPES: Partial<Record<StepId, RecipeId>> = {
  suit_150: "suit_150", dart: "dart_base", suit_350: "suit_350", dart_350: "dart_350",
  creel: "creel_base", creel_350: "creel_350", stop_canopy: "restore_canopy_stop",
};

export interface StepAudit {
  step: StepId;
  recipe: RecipeId | null;
  /** Empty when the step is fully backed by real content. */
  blocked: string[];
}

const isMaterial = (k: string): k is MaterialId => Object.hasOwn(MATERIALS, k);
const sourcesOf = (kind: CostKind) => Object.values(SOURCES).filter((s) => s.item === kind);
const shallowest = (kind: CostKind): number => Math.min(...sourcesOf(kind).map((s) => Math.max(0, -s.position.y)));

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
  const refit = Object.entries(HULL_REFITS).find(([, f]) => f.recipe === recipeId);
  const hull: CampaignStep["hull"] = refit ? [refit[0] as keyof typeof HULL_REFITS, refit[1].rating]
    : r.output === "dart" || r.output === "creel" ? [r.output, HULLS[r.output].initialDepth] : undefined;
  const suit = r.output === "suit_150" ? 150 : r.output === "suit_350" ? 350 : undefined;
  return { label: r.label, blueprints, needs: proposal.needs, materials,
    ...(suit ? { suit } : {}), ...(hull ? { hull } : {}), ...(proposal.stop ? { stop: proposal.stop } : {}) };
}

export function audit(strategy: StrategyId): StepAudit[] {
  return FLEET_STRATEGIES[strategy].steps.map((step) => {
    const recipe = STEP_RECIPES[step] ?? null;
    if (!recipe) {
      const missing = CAMPAIGN_STEPS[step].materials.filter((m) => !sourcesOf(m).length);
      return { step, recipe, blocked: ["no recipe", ...missing.map((m) => `no ${m} source`)] };
    }
    const blocked: string[] = [];
    for (const [kind, n] of Object.entries(RECIPES[recipe].cost) as [CostKind, number][]) {
      const found = sourcesOf(kind);
      if (!found.length) { blocked.push(`no ${kind} source`); continue; }
      const stock = found.reduce((sum, s) => sum + s.stock + s.reserve, 0);
      if (stock < n) blocked.push(`${kind} stock ${stock} < ${n}`);
      // The planner reads S5's first-access shelves; the real shallowest source must not be deeper.
      if (isMaterial(kind) && shallowest(kind) > Math.max(SWIM_DEPTH, MATERIAL_SHELVES[kind].depth))
        blocked.push(`${kind} first source at ${shallowest(kind)} m, past its ${MATERIAL_SHELVES[kind].depth} m shelf`);
      // Frames are lifted by a Creel's arms or a suited diver: the initial Creel must reach one.
      if (kind === "tagged_frame" && shallowest(kind) > HULLS.creel.initialDepth) blocked.push(`tagged frames past ${HULLS.creel.initialDepth} m`);
    }
    return { step, recipe, blocked };
  });
}

/** Real plan sources outside the story: today's technical records. */
const REAL_GRANTS: CampaignModel["grants"] = Object.fromEntries(Object.entries(TECH_RECORDS).map(([id, r]) => {
  const depth = Math.max(0, -r.position.y);
  return [id, { depth, exit: depth, grants: r.blueprints as readonly AnyBlueprint[] }];
}));

/** The composed model. `fill: "proposal"` keeps S5's proposal for steps whose
 * content is not built yet, to show the chain completes once it is. */
export function registryModel(strategy: StrategyId, fill: "none" | "proposal" = "none"): CampaignModel {
  const steps: Record<string, CampaignStep> = {};
  const order: StepId[] = [];
  for (const step of FLEET_STRATEGIES[strategy].steps) {
    const recipe = STEP_RECIPES[step];
    if (recipe) steps[step] = recipeStep(step, recipe);
    else if (fill === "proposal") steps[step] = CAMPAIGN_STEPS[step];
    else continue;
    order.push(step);
  }
  return { steps, order, grants: REAL_GRANTS };
}
export const planRegistryCampaign = (strategy: StrategyId, fill: "none" | "proposal" = "none"): CampaignPlan =>
  planCampaign(strategy, { model: registryModel(strategy, fill) });
