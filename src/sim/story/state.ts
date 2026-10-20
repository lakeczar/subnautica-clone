/** Story state proposed for persistence (see docs/build/streams/S5.md). Only stable
 * IDs, ticks, flags and counters are saved; facts, readings and text are derived. */
import { DISCOVERY_IDS, STORY_RECIPES } from "../../content/story/evidence.js";
import type { DiscoveryId } from "../../content/story/evidence.js";
import { LEADS } from "../../content/story/leads.js";
import type { LeadId } from "../../content/story/leads.js";
import { EQUALIZE_STEPS, RESOLUTION_ROSTER, WORKS_HINTS } from "../../content/story/works.js";
import type { GateStage, RosterId, WorksStep } from "../../content/story/works.js";

export interface Discovery {
  id: DiscoveryId;
  tick: number;
}
export interface WorksState {
  power: boolean;
  air: boolean;
  gate: GateStage;
  /** Active steps the hydraulic pipe has run, 0..EQUALIZE_STEPS. */
  equalizeSteps: number;
  hall: boolean;
  food: boolean;
  hallPower: boolean;
  /** Story repairs made outside the works, e.g. the pod buffer. */
  repairs: string[];
}
export interface ResolutionState {
  phase: "none" | "first" | "complete";
  first: RosterId | null;
}
export type HintSubject = LeadId | WorksStep;
export interface StoryState {
  /** Every story discovery in the order found: evidence, records and journals. */
  discoveries: Discovery[];
  /** Highest hint tier requested per subject, 1..3. */
  hints: Partial<Record<HintSubject, 1 | 2 | 3>>;
  works: WorksState;
  resolution: ResolutionState;
}

export function createStory(): StoryState {
  return {
    discoveries: [],
    hints: {},
    works: {
      power: false, air: false, gate: "sealed", equalizeSteps: 0,
      hall: false, food: false, hallPower: false, repairs: [],
    },
    resolution: { phase: "none", first: null },
  };
}

const GATE_STAGES: readonly GateStage[] = ["sealed", "isolated", "equalizing", "equalized", "open"];
const isBool = (x: unknown): x is boolean => typeof x === "boolean";
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Strict guard for the proposed persisted story field: known IDs only, no
 * duplicates, and machinery flags that agree with each other. */
export function validStory(x: unknown): x is StoryState {
  if (!isObj(x) || !Array.isArray(x.discoveries) || !isObj(x.hints) || !isObj(x.works) || !isObj(x.resolution)) return false;
  const ids = new Set<string>();
  for (const d of x.discoveries) {
    if (!isObj(d) || typeof d.id !== "string" || !(DISCOVERY_IDS as readonly string[]).includes(d.id) || ids.has(d.id)) return false;
    if (!Number.isInteger(d.tick) || (d.tick as number) < 0) return false;
    ids.add(d.id);
  }
  for (const [k, v] of Object.entries(x.hints))
    if (!(Object.hasOwn(LEADS, k) || Object.hasOwn(WORKS_HINTS, k)) || (v !== 1 && v !== 2 && v !== 3)) return false;
  const w = x.works;
  if (![w.power, w.air, w.hall, w.food, w.hallPower].every(isBool)) return false;
  if (!GATE_STAGES.includes(w.gate as GateStage) || !Number.isInteger(w.equalizeSteps)) return false;
  if (!Array.isArray(w.repairs) || !w.repairs.every((r) => Object.hasOwn(STORY_RECIPES, r))) return false;
  const stage = GATE_STAGES.indexOf(w.gate as GateStage), steps = w.equalizeSteps as number;
  if (stage >= 1 && !(w.power && w.air)) return false;
  if (steps < 0 || steps > EQUALIZE_STEPS) return false;
  if (stage <= 1 ? steps !== 0 : stage === 2 ? steps >= EQUALIZE_STEPS : steps !== EQUALIZE_STEPS) return false;
  if ((w.food && !w.hall) || (w.hallPower && !(w.hall && stage === 4))) return false;
  const r = x.resolution;
  if (!["none", "first", "complete"].includes(r.phase as string)) return false;
  if (r.phase === "none" ? r.first !== null : !Object.hasOwn(RESOLUTION_ROSTER, r.first as string)) return false;
  if (r.phase !== "none" && !(w.hall && w.food && w.hallPower)) return false;
  return true;
}
