/** Voluntary graduated hints. Each request raises one subject's tier by one:
 * restate what is known, then sharpen the region or landmark, then name the
 * approach and preparation. Hints never record a discovery or complete a step.
 * Once the final question is open, practical works steps come before leads. */
import type { StorySiteId } from "../../content/story/evidence.js";
import { LEADS } from "../../content/story/leads.js";
import type { LeadId } from "../../content/story/leads.js";
import { NOTHING_PRESSING, WORKS_HINTS, WORKS_STEP_PLANS } from "../../content/story/works.js";
import type { WorksStep } from "../../content/story/works.js";
import { blueprints, learned, openLeads } from "./knowledge.js";
import type { HintSubject, StoryState } from "./state.js";

export interface HintContext {
  /** Optional physical check from the coordinator; reachable leads are preferred. */
  reachable?: (site: StorySiteId) => boolean;
}
export interface Hint {
  subject: HintSubject | null;
  tier: 0 | 1 | 2 | 3;
  text: string;
}

export function nextWorksStep(s: StoryState): WorksStep | null {
  const known = learned(s.discoveries), w = s.works;
  const reveal = known.has("F17");
  if (s.resolution.phase !== "none") return null;
  if (reveal || known.has("F13")) {
    if (!w.power) return "w_power";
    if (!w.air) return "w_air";
    if (w.gate === "sealed") return "w_isolate";
    if (w.gate === "isolated") return "w_equalize";
    if (w.gate === "equalizing") return "w_wait";
    if (w.gate === "equalized") return "w_open";
  }
  if (!reveal) return null;
  if (!w.hall) return "w_hall";
  if (!w.food) return "w_food";
  if (!w.hallPower) return "w_route";
  return "w_begin";
}

export function hintSubject(s: StoryState, ctx: HintContext = {}): HintSubject | null {
  const leads = openLeads(s);
  const reachableLead = ctx.reachable ? leads.find((id) => ctx.reachable!(LEADS[id].site)) : undefined;
  const lead: LeadId | undefined = reachableLead ?? leads[0];
  const step = nextWorksStep(s);
  if (learned(s.discoveries).has("F17")) return step ?? lead ?? null;
  return lead ?? step;
}

export function hintText(s: StoryState, subject: HintSubject, tier: 1 | 2 | 3): string {
  if (Object.hasOwn(LEADS, subject)) return LEADS[subject as LeadId].hints[tier - 1]!;
  const step = subject as WorksStep, h = WORKS_HINTS[step];
  const bp = Object.hasOwn(WORKS_STEP_PLANS, step) ? WORKS_STEP_PLANS[step as keyof typeof WORKS_STEP_PLANS] : null;
  if (tier > 1 && bp && "plans" in h && !blueprints(s.discoveries).has(bp)) return h.plans;
  return h.tiers[tier - 1]!;
}

export function requestHint(s: StoryState, ctx: HintContext = {}): Hint {
  const subject = hintSubject(s, ctx);
  if (!subject) return { subject: null, tier: 0, text: NOTHING_PRESSING };
  const tier = Math.min(3, (s.hints[subject] ?? 0) + 1) as 1 | 2 | 3;
  s.hints[subject] = tier;
  return { subject, tier, text: hintText(s, subject, tier) };
}
