/** The return gate and upper hall as a small authored state graph. Each action
 * checks physical preconditions and returns a readable refusal instead of acting.
 * The coordinator supplies presence, carried assemblies and stock, and removes
 * whatever `consume` names when `ok` is true. */
import { STORY_RECIPES } from "../../content/story/evidence.js";
import type { StoryBlueprintId, StoryRecipeId, StorySiteId } from "../../content/story/evidence.js";
import { EQUALIZE_STEPS, GALLERY_BAR, GATE_STAGE_TEXT, WORKS_TEXT } from "../../content/story/works.js";
import type { GateStage, WorksAction } from "../../content/story/works.js";
import type { AnyBlueprint } from "../../content/story/strategies.js";
import type { StoryState, WorksState } from "./state.js";

export type Assembly = "service_power_assembly" | "service_air_assembly";
export interface WorksContext {
  site: StorySiteId | null;
  /** Whether the player carries one fabricated assembly of this kind. */
  carries: (assembly: Assembly) => boolean;
  /** Whether accessible stock covers a story recipe's cost at this site. */
  canPay: (recipe: StoryRecipeId) => boolean;
  blueprints: ReadonlySet<AnyBlueprint>;
}
export interface WorksOutcome {
  ok: boolean;
  message: string;
  consume: Assembly | StoryRecipeId | null;
}

const ACTION_SITE = {
  install_power: "meridian_gate_hall",
  install_air: "meridian_gate_hall",
  isolate: "meridian_gate_hall",
  equalize: "meridian_gate_hall",
  open: "meridian_gate_hall",
  route_power: "meridian_gate_hall",
  restore_hall: "meridian_upper_hall",
  restore_food: "meridian_upper_hall",
} as const satisfies Record<WorksAction, StorySiteId>;

export const gateOpen = (w: WorksState): boolean => w.gate === "open";

export function worksAction(s: StoryState, action: WorksAction, ctx: WorksContext): WorksOutcome {
  const w = s.works;
  const no = (message: string): WorksOutcome => ({ ok: false, message, consume: null });
  const yes = (message: string, consume: WorksOutcome["consume"] = null): WorksOutcome => ({ ok: true, message, consume });
  if (ctx.site !== ACTION_SITE[action]) return no(WORKS_TEXT.site);
  switch (action) {
    case "install_power":
      if (w.power) return no(WORKS_TEXT.install_power.done);
      if (!ctx.carries("service_power_assembly")) return no(WORKS_TEXT.install_power.missing);
      w.power = true;
      return yes(WORKS_TEXT.install_power.ok, "service_power_assembly");
    case "install_air":
      if (w.air) return no(WORKS_TEXT.install_air.done);
      if (!ctx.carries("service_air_assembly")) return no(WORKS_TEXT.install_air.missing);
      w.air = true;
      return yes(WORKS_TEXT.install_air.ok, "service_air_assembly");
    case "isolate":
      if (w.gate !== "sealed") return no(WORKS_TEXT.isolate.done);
      if (!w.power || !w.air) return no(WORKS_TEXT.isolate.blocked);
      w.gate = "isolated";
      return yes(WORKS_TEXT.isolate.ok);
    case "equalize":
      if (w.gate === "sealed") return no(WORKS_TEXT.equalize.blocked);
      if (w.gate !== "isolated") return no(WORKS_TEXT.equalize.done);
      w.gate = "equalizing";
      return yes(WORKS_TEXT.equalize.ok);
    case "open":
      if (w.gate === "open") return no(WORKS_TEXT.open.done);
      if (w.gate === "equalizing") return no(WORKS_TEXT.open.waiting);
      if (w.gate !== "equalized") return no(WORKS_TEXT.open.blocked);
      w.gate = "open";
      return yes(WORKS_TEXT.open.ok);
    case "restore_hall":
      return restore(s, "hall", "restore_upper_hall", "bp_works_hall", WORKS_TEXT.restore_hall, ctx);
    case "restore_food":
      if (!w.food && !w.hall) return no(WORKS_TEXT.restore_food.hall);
      return restore(s, "food", "restore_food_module", "bp_food_module", WORKS_TEXT.restore_food, ctx);
    case "route_power":
      if (w.hallPower) return no(WORKS_TEXT.route_power.done);
      if (!gateOpen(w)) return no(WORKS_TEXT.route_power.route);
      if (!w.hall) return no(WORKS_TEXT.route_power.hall);
      w.hallPower = true;
      return yes(WORKS_TEXT.route_power.ok);
  }
}

function restore(
  s: StoryState, flag: "hall" | "food", recipe: StoryRecipeId, bp: StoryBlueprintId,
  text: { ok: string; plans: string; stock: string; done: string }, ctx: WorksContext,
): WorksOutcome {
  if (s.works[flag]) return { ok: false, message: text.done, consume: null };
  if (!ctx.blueprints.has(bp)) return { ok: false, message: text.plans, consume: null };
  if (!ctx.canPay(recipe)) return { ok: false, message: text.stock, consume: null };
  s.works[flag] = true;
  return { ok: true, message: text.ok, consume: recipe };
}

/** Advance machinery by active simulation steps. The pipe keeps draining while the
 * player is away; progress is saved, so interrupted visits resume where they left. */
export function advanceWorks(s: StoryState, steps: number): void {
  const w = s.works;
  if (w.gate !== "equalizing") return;
  w.equalizeSteps = Math.min(EQUALIZE_STEPS, w.equalizeSteps + Math.max(0, Math.floor(steps)));
  if (w.equalizeSteps >= EQUALIZE_STEPS) w.gate = "equalized";
}

export function galleryBar(w: WorksState): number {
  const done: Record<GateStage, number> = {
    sealed: 0, isolated: 0, equalizing: w.equalizeSteps / EQUALIZE_STEPS, equalized: 1, open: 1,
  };
  return Math.round(GALLERY_BAR.flooded - (GALLERY_BAR.flooded - GALLERY_BAR.dry) * done[w.gate]);
}

/** The live panel: the procedure is always readable here, with or without any record. */
export function gatePanel(w: WorksState): { status: string; lines: string[] } {
  return {
    status: GATE_STAGE_TEXT[w.gate],
    lines: [
      `Power · diversion${w.power ? " + staged assembly" : " only"}`,
      `Air · ${w.air ? "staged assembly coupled" : "diversion only"}`,
      `Gallery · ${galleryBar(w)} bar`,
      "Procedure · stage power · stage air · isolate · equalize · open",
    ],
  };
}

/** Recipe costs the coordinator registers; repeated here for adapters. */
export const worksCost = (recipe: StoryRecipeId) => STORY_RECIPES[recipe].cost;
