/** A capability-level model of the campaign for checking the story graph against
 * each fleet strategy. It is not physics: it asks whether some craft rated for a
 * site's depth can be staged there and whether the suit covers the diver's exit.
 * The planner runs the real story rules (discovery, works, resolution) on top. */
import type { HullId } from "../../content/registry.js";
import { DISCOVERY_IDS, isOptional, siteOf, STORY_RECIPES, UNLOCKED_BY } from "../../content/story/evidence.js";
import type { DiscoveryId, StoryRecipeId } from "../../content/story/evidence.js";
import { STORY_SITES } from "../../content/story/sites.js";
import type { StorySite } from "../../content/story/sites.js";
import {
  CAMPAIGN_STEPS, CARRIER_SHELF_DEPTH, EXTERNAL_GRANTS, FLEET_STRATEGIES, MATERIAL_SHELVES, SORTIE_HULLS, SWIM_DEPTH,
} from "../../content/story/strategies.js";
import type { AnyBlueprint, CampaignStep, StopId, StrategyId } from "../../content/story/strategies.js";
import { EQUALIZE_STEPS } from "../../content/story/works.js";
import type { WorksAction } from "../../content/story/works.js";
import { blueprints, found, recordDiscovery } from "./knowledge.js";
import { beginResolution, completeResolution } from "./resolution.js";
import { createStory } from "./state.js";
import type { StoryState } from "./state.js";
import { advanceWorks, gateOpen, worksAction } from "./works.js";
import type { Assembly } from "./works.js";

export interface Capabilities {
  suit: number;
  hulls: Partial<Record<HullId, number>>;
  stops: ReadonlySet<StopId>;
}
type Place = Pick<StorySite, "depth" | "exit" | "zone"> & { afterGate?: true };

export function reachable(site: Place, caps: Capabilities, gateIsOpen = false): boolean {
  if (site.afterGate && (!gateIsOpen || !reachable(STORY_SITES.meridian_gate_hall, caps))) return false;
  if (site.exit !== null && site.exit > Math.max(SWIM_DEPTH, caps.suit)) return false;
  const sortie = SORTIE_HULLS.some((h) => (caps.hulls[h] ?? 0) >= site.depth);
  const carrier = caps.hulls.hearthline ?? 0;
  if (site.zone === "near") return site.depth <= SWIM_DEPTH || sortie || carrier >= site.depth;
  const stopRoute = caps.stops.has("stop_divide_lee") && sortie;
  const carrierRoute = carrier >= CARRIER_SHELF_DEPTH && (sortie || carrier >= site.depth);
  return stopRoute || carrierRoute;
}

export const materialReachable = (m: keyof typeof MATERIAL_SHELVES, caps: Capabilities): boolean =>
  reachable({ ...MATERIAL_SHELVES[m], zone: "near" }, caps);
const recipeReachable = (r: StoryRecipeId, caps: Capabilities): boolean =>
  Object.keys(STORY_RECIPES[r].cost).every((m) => materialReachable(m as keyof typeof MATERIAL_SHELVES, caps));

export interface PlanOptions {
  /** Discoveries treated as damaged or missed. */
  skip?: readonly DiscoveryId[];
  /** Also collect optional journals and evidence when reachable. */
  optional?: boolean;
  /** Visit reachable discoveries in reverse ID order within each pass. */
  reverse?: boolean;
  /** Replace the proposal tables, e.g. with steps derived from the composed recipe
   * registry: `steps` keyed by step ID, `order` the strategy's step IDs, `grants`
   * non-story plan sources. Defaults come from content/story/strategies.ts. */
  model?: Partial<CampaignModel>;
}
export interface CampaignModel {
  steps: Readonly<Record<string, CampaignStep>>;
  order: readonly string[];
  grants: Readonly<Record<string, { depth: number; exit: number | null; grants: readonly AnyBlueprint[] }>>;
}
export const proposalModel = (strategy: StrategyId): CampaignModel => ({
  steps: CAMPAIGN_STEPS, order: FLEET_STRATEGIES[strategy].steps, grants: EXTERNAL_GRANTS,
});
export interface CampaignPlan {
  ending: boolean;
  story: StoryState;
  steps: string[];
  caps: Capabilities;
  /** Discoveries in the order the plan found them. */
  order: DiscoveryId[];
}

export function planCampaign(strategy: StrategyId, opts: PlanOptions = {}): CampaignPlan {
  const s = createStory();
  const caps = { suit: 0, hulls: {} as Partial<Record<HullId, number>>, stops: new Set<StopId>() };
  const model = { ...proposalModel(strategy), ...opts.model };
  const steps: string[] = [], external = new Set<AnyBlueprint>(), skip = new Set(opts.skip ?? []);
  let tick = 0;
  const plans = (): Set<AnyBlueprint> => new Set([...blueprints(s.discoveries), ...external]);
  const ids = opts.reverse ? [...DISCOVERY_IDS].reverse() : DISCOVERY_IDS;
  for (let progress = true; progress;) {
    progress = false;
    for (const id of ids) {
      if (found(s, id) || skip.has(id) || (isOptional(id) && !opts.optional)) continue;
      const unlock = UNLOCKED_BY[id as keyof typeof UNLOCKED_BY];
      if (unlock && !s.works.repairs.includes(unlock)) continue;
      if (!reachable(STORY_SITES[siteOf(id)], caps, gateOpen(s.works))) continue;
      recordDiscovery(s, id, ++tick);
      progress = true;
    }
    for (const g of Object.values(model.grants))
      if (reachable({ ...g, zone: "near" }, caps)) for (const bp of g.grants) if (!external.has(bp)) { external.add(bp); progress = true; }
    if (!s.works.repairs.includes("pod_buffer") && plans().has("bp_pod_buffer") && recipeReachable("pod_buffer", caps)) {
      s.works.repairs.push("pod_buffer");
      progress = true;
    }
    for (const id of model.order) {
      const step = model.steps[id];
      if (!step) throw new Error(`Campaign step ${id} is not defined`);
      if (steps.includes(id) || !step.needs.every((n) => steps.includes(n))) continue;
      if (!step.blueprints.every((bp) => plans().has(bp))) continue;
      if (!step.materials.every((m) => materialReachable(m, caps))) continue;
      steps.push(id);
      if (step.suit) caps.suit = Math.max(caps.suit, step.suit);
      if (step.hull) caps.hulls[step.hull[0]] = Math.max(caps.hulls[step.hull[0]] ?? 0, step.hull[1]);
      if (step.stop) caps.stops.add(step.stop);
      progress = true;
    }
    if (works(s, caps, plans())) progress = true;
  }
  let ending = false;
  if (reachable(STORY_SITES.meridian_inner_hall, caps, gateOpen(s.works)) && beginResolution(s, "meridian_inner_hall", ++tick).ok)
    ending = completeResolution(s, { mastRestored: false }).ok;
  return { ending, story: s, steps, caps, order: s.discoveries.map((d) => d.id) };
}

/** Tries each works action from where it is done, carrying freshly fabricated
 * assemblies and stock whenever their plans and materials are reachable. */
function works(s: StoryState, caps: Capabilities, plans: ReadonlySet<AnyBlueprint>): boolean {
  const recipeFor: Record<Assembly, StoryRecipeId> = {
    service_power_assembly: "service_power_assembly", service_air_assembly: "service_air_assembly",
  };
  const can = (r: StoryRecipeId) => plans.has(STORY_RECIPES[r].bp) && recipeReachable(r, caps);
  let changed = false;
  const at = (action: WorksAction, site: "meridian_gate_hall" | "meridian_upper_hall") => {
    if (!reachable(STORY_SITES[site], caps)) return;
    const ok = worksAction(s, action, { site, carries: (a) => can(recipeFor[a]), canPay: can, blueprints: plans }).ok;
    changed ||= ok;
  };
  at("install_power", "meridian_gate_hall");
  at("install_air", "meridian_gate_hall");
  at("isolate", "meridian_gate_hall");
  at("equalize", "meridian_gate_hall");
  if (s.works.gate === "equalizing") { advanceWorks(s, EQUALIZE_STEPS); changed = true; }
  at("open", "meridian_gate_hall");
  at("restore_hall", "meridian_upper_hall");
  at("restore_food", "meridian_upper_hall");
  at("route_power", "meridian_gate_hall");
  return changed;
}
