import { THREAT_AGENT_IDS } from "../../content/ecology/species.js";
import type { Deterrent, Sense } from "../../content/ecology/species.js";
import { DETERRENT_SECONDS, MAX_DETERRENTS, MAX_HULL_EXPOSURES, VEHICLE_ID } from "./ecology.js";
import { MAX_AWARENESS } from "./agents.js";
import { DIVER_ACTOR, MAX_WARNING_AGE, NO_ACTOR } from "./types.js";
import { EXPOSURE } from "../../content/ecology/hazards.js";
import type { AgentMode, EcologyState, Exposure } from "./types.js";

/** Proposed persisted block `world.ecology`. Strict: unknown keys, missing
 * roster entries, out-of-range numbers and foreign IDs are all rejected. */
const MODES: readonly AgentMode[] = ["rest", "alert", "investigate", "commit", "withdraw"];
const SENSES: readonly Sense[] = ["noise", "light", "disturbance", "layer"];
const KINDS: readonly Deterrent[] = ["acoustic", "lure", "ink"];

type Raw = Record<string, unknown>;
const record = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);
// Own properties only: `__proto__`, `constructor` and other inherited names never count.
const keys = (x: Raw, allowed: readonly string[]): boolean => Object.keys(x).length === allowed.length && allowed.every(k => Object.hasOwn(x, k));
const num = (x: unknown, min: number, max: number): x is number => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
const point = (x: unknown): boolean => record(x) && keys(x, ["x", "y", "z"]) && [x.x, x.y, x.z].every(c => num(c, -1e5, 1e5));
const EXPOSURE_KEYS = ["heat", "brine", "heatWarned", "brineWarned"] as const;
// A warning age exists only inside an episode: below the first threshold it must be 0.
const age = (load: unknown, warned: unknown): boolean =>
  num(warned, 0, MAX_WARNING_AGE) && (warned === 0 || (num(load, 0, 100) && load >= EXPOSURE.warnings[0]));
const loads = (x: Raw): boolean => num(x.heat, 0, 100) && num(x.brine, 0, 100) && age(x.heat, x.heatWarned) && age(x.brine, x.brineWarned);
const exposureOk = (x: unknown): x is Exposure => record(x) && keys(x, EXPOSURE_KEYS) && loads(x);

/** `vehicleIds`, when given, is the composed save's fleet: every hull exposure
 * must belong to a vehicle that exists in the same save. */
export function parseEcology(raw: unknown, options: { vehicleIds?: readonly string[] } = {}): EcologyState | string {
  if (!record(raw) || !keys(raw, ["agents", "deterrents", "diver", "hulls", "controlled"])) return "ecology: expected agents, deterrents, diver, hulls, controlled";
  const { agents, deterrents, diver, hulls, controlled } = raw;
  if (!Array.isArray(agents) || agents.length !== THREAT_AGENT_IDS.length) return "ecology.agents: must list the whole roster";
  for (const [i, a] of agents.entries()) {
    const id = THREAT_AGENT_IDS[i]!;
    if (!record(a) || !keys(a, ["id", "mode", "position", "yaw", "awareness", "modeSeconds", "cycles", "refractory", "cue", "struck"]))
      return `ecology.agents[${i}]: malformed`;
    if (a.id !== id) return `ecology.agents[${i}]: expected ${id}`;
    if (!MODES.includes(a.mode as AgentMode)) return `ecology.agents[${i}].mode`;
    if (!point(a.position) || !num(a.yaw, -1e3, 1e3) || !num(a.awareness, 0, MAX_AWARENESS) || !num(a.modeSeconds, 0, 1e7) ||
        !Number.isInteger(a.cycles) || !num(a.cycles, 0, 10) || !num(a.refractory, 0, 600) || typeof a.struck !== "boolean")
      return `ecology.agents[${i}]: value out of range`;
    if (a.cue !== null && !SENSES.includes(a.cue as Sense)) return `ecology.agents[${i}].cue`;
  }
  if (!Array.isArray(deterrents) || deterrents.length > MAX_DETERRENTS) return "ecology.deterrents";
  for (const [i, d] of deterrents.entries())
    if (!record(d) || !keys(d, ["kind", "position", "seconds"]) || !KINDS.includes(d.kind as Deterrent) || !point(d.position) ||
        !num(d.seconds, 1e-9, DETERRENT_SECONDS[d.kind as Deterrent]))
      return `ecology.deterrents[${i}]`;
  if (!exposureOk(diver)) return "ecology.diver";
  if (!Array.isArray(hulls) || hulls.length > MAX_HULL_EXPOSURES) return "ecology.hulls";
  const seen = new Set<string>(), fleet = options.vehicleIds ? new Set(options.vehicleIds) : null;
  for (const [i, h] of hulls.entries()) {
    if (!record(h) || !keys(h, ["id", ...EXPOSURE_KEYS]) || typeof h.id !== "string" || !VEHICLE_ID.test(h.id) || !loads(h) ||
        seen.has(h.id) || (fleet && !fleet.has(h.id)))
      return `ecology.hulls[${i}]`;
    seen.add(h.id);
  }
  if (typeof controlled !== "string" || !(controlled === NO_ACTOR || controlled === DIVER_ACTOR || (VEHICLE_ID.test(controlled) && (!fleet || fleet.has(controlled)))))
    return "ecology.controlled";
  return structuredClone(raw as unknown as EcologyState);
}
/** Plain JSON copy; the state already holds only stable IDs and numbers. */
export const serializeEcology = (s: EcologyState): unknown => structuredClone(s);

