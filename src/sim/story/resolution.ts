/** The ending: physical requirements, a short supervised scene and the epilogue.
 * No personal journal or optional record is ever a requirement; optional finds
 * only vary a line of dialogue. Starting the resolution guarantees the notebook
 * can answer every central question, from the controller's summary if need be. */
import type { StorySiteId } from "../../content/story/evidence.js";
import { FACT_IDS, FACTS } from "../../content/story/facts.js";
import {
  EPILOGUE, RESOLUTION_REQUIREMENTS, RESOLUTION_ROSTER, RESOLUTION_SCENES,
} from "../../content/story/works.js";
import type { RequirementId, RosterId, SceneLine } from "../../content/story/works.js";
import { found, learned, recordDiscovery } from "./knowledge.js";
import type { StoryState } from "./state.js";

export interface RequirementView { id: RequirementId; label: string; met: boolean }

export const resolutionVisible = (s: StoryState): boolean => learned(s.discoveries).has("F17");

export function requirements(s: StoryState): RequirementView[] {
  const w = s.works;
  const met: Record<RequirementId, boolean> = {
    route: w.gate === "open", hall: w.hall, power: w.hallPower, food: w.food,
  };
  return (Object.keys(RESOLUTION_REQUIREMENTS) as RequirementId[])
    .map((id) => ({ id, label: RESOLUTION_REQUIREMENTS[id], met: met[id] }));
}

export const RESOLUTION_SITES = ["meridian_service_window", "meridian_inner_hall"] as const satisfies readonly StorySiteId[];
export const defaultCandidate = (): RosterId =>
  (Object.keys(RESOLUTION_ROSTER) as RosterId[]).find((id) => RESOLUTION_ROSTER[id].default)!;

export function canBegin(s: StoryState, site: StorySiteId | null): { ok: boolean; message: string } {
  if (s.resolution.phase !== "none") return { ok: false, message: "The first waking has already begun." };
  if (!site || !(RESOLUTION_SITES as readonly string[]).includes(site))
    return { ok: false, message: "The district controller handles this, at the lower service window or the inner hall." };
  const missing = requirements(s).filter((r) => !r.met);
  if (missing.length) return { ok: false, message: `Not yet safe: ${missing.map((r) => r.label.toLowerCase()).join("; ")}.` };
  return { ok: true, message: "The controller clears one supervised bed." };
}

const sceneLines = (s: StoryState, lines: readonly SceneLine[]): string[] =>
  lines
    .filter((l) => (!l.if || l.if.every((id) => found(s, id))) && (!l.unless || !l.unless.some((id) => found(s, id))))
    .map((l) => l.text);

/** Starts the closing scene with a roster choice; the default is offered first. */
export function beginResolution(
  s: StoryState, site: StorySiteId | null, tick: number, candidate: RosterId = defaultCandidate(),
): { ok: boolean; message: string; lines: string[] } {
  const check = canBegin(s, site);
  if (!check.ok) return { ok: false, message: check.message, lines: [] };
  const known = learned(s.discoveries);
  if (FACT_IDS.some((f) => FACTS[f].critical && !known.has(f))) recordDiscovery(s, "district_controller", tick);
  s.resolution = { phase: "first", first: candidate };
  return { ok: true, message: check.message, lines: sceneLines(s, RESOLUTION_SCENES[candidate]) };
}

export function completeResolution(s: StoryState, ctx: { mastRestored: boolean }): { ok: boolean; lines: string[] } {
  if (s.resolution.phase !== "first") return { ok: false, lines: [] };
  s.resolution.phase = "complete";
  return { ok: true, lines: [...EPILOGUE.lines, ctx.mastRestored ? EPILOGUE.mastRestored : EPILOGUE.mastBroken, EPILOGUE.close] };
}
