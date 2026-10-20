/** Story state proposed for persistence (see docs/build/streams/S5.md). Only stable
 * IDs, ticks, flags and counters are saved; facts, readings and text are derived. */
import { DISCOVERY_IDS, STORY_REPAIRS, UNLOCKED_BY } from "../../content/story/evidence.js";
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
const PHASES: readonly ResolutionState["phase"][] = ["none", "first", "complete"];
const isBool = (x: unknown): x is boolean => typeof x === "boolean";
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const isStr = (x: unknown): x is string => typeof x === "string";
const ownKey = (table: object, k: unknown): boolean => isStr(k) && Object.hasOwn(table, k);
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
const isTick = (x: unknown, now: number): x is number => Number.isSafeInteger(x) && (x as number) >= 0 && (x as number) <= now;

/** Strict guard for the proposed persisted story field: exact shapes, known IDs
 * of the right type, no duplicates, prerequisites present, machinery flags that
 * agree, and ticks that are safe integers no later than `now` (the enclosing
 * game tick when composed). */
export function validStory(x: unknown, now: number = Number.MAX_SAFE_INTEGER): x is StoryState {
  if (!isObj(x) || !exactKeys(x, ["discoveries", "hints", "works", "resolution"])) return false;
  if (!Array.isArray(x.discoveries) || !isObj(x.hints) || !isObj(x.works) || !isObj(x.resolution)) return false;
  const ids = new Set<string>();
  for (const d of x.discoveries) {
    if (!isObj(d) || !exactKeys(d, ["id", "tick"]) || !isStr(d.id) || !(DISCOVERY_IDS as readonly string[]).includes(d.id)) return false;
    if (ids.has(d.id) || !isTick(d.tick, now)) return false;
    ids.add(d.id);
  }
  for (const [k, v] of Object.entries(x.hints))
    if (!(ownKey(LEADS, k) || ownKey(WORKS_HINTS, k)) || (v !== 1 && v !== 2 && v !== 3)) return false;
  const w = x.works;
  if (!exactKeys(w, ["power", "air", "gate", "equalizeSteps", "hall", "food", "hallPower", "repairs"])) return false;
  if (![w.power, w.air, w.hall, w.food, w.hallPower].every(isBool)) return false;
  if (!isStr(w.gate) || !(GATE_STAGES as readonly string[]).includes(w.gate) || !Number.isSafeInteger(w.equalizeSteps)) return false;
  if (!Array.isArray(w.repairs) || !w.repairs.every((r) => isStr(r) && (STORY_REPAIRS as readonly string[]).includes(r))) return false;
  if (new Set(w.repairs).size !== w.repairs.length) return false;
  for (const [id, repair] of Object.entries(UNLOCKED_BY)) if (ids.has(id) && !w.repairs.includes(repair)) return false;
  const stage = GATE_STAGES.indexOf(w.gate as GateStage), steps = w.equalizeSteps as number;
  if (stage >= 1 && !(w.power && w.air)) return false;
  if (steps < 0 || steps > EQUALIZE_STEPS) return false;
  if (stage <= 1 ? steps !== 0 : stage === 2 ? steps >= EQUALIZE_STEPS : steps !== EQUALIZE_STEPS) return false;
  if ((w.food && !w.hall) || (w.hallPower && !(w.hall && stage === 4))) return false;
  const r = x.resolution;
  if (!exactKeys(r, ["phase", "first"]) || !isStr(r.phase) || !(PHASES as readonly string[]).includes(r.phase)) return false;
  if (r.phase === "none" ? r.first !== null : !ownKey(RESOLUTION_ROSTER, r.first)) return false;
  if (r.phase !== "none" && !(w.hall && w.food && w.hallPower)) return false;
  return true;
}
