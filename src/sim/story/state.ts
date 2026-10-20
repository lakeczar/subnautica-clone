/** Story state proposed for persistence (see docs/build/streams/S5.md). Only stable
 * IDs, ticks, flags and counters are saved; facts, readings and text are derived. */
import type { DiscoveryId } from "../../content/story/evidence.js";
import type { LeadId } from "../../content/story/leads.js";
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
