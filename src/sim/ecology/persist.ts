import { THREAT_AGENT_IDS } from "../../content/ecology/species.js";
import type { Deterrent, Sense } from "../../content/ecology/species.js";
import { DETERRENT_SECONDS, MAX_DETERRENTS } from "./ecology.js";
import { MAX_AWARENESS } from "./agents.js";
import type { AgentMode, EcologyState, Exposure } from "./types.js";

/** Proposed persisted block `world.ecology`. Strict: unknown keys, missing
 * roster entries, out-of-range numbers and foreign IDs are all rejected. */
const MODES: readonly AgentMode[] = ["rest", "alert", "investigate", "commit", "withdraw"];
const SENSES: readonly Sense[] = ["noise", "light", "disturbance", "layer"];
const KINDS: readonly Deterrent[] = ["acoustic", "lure", "ink"];

type Raw = Record<string, unknown>;
const record = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);
const keys = (x: Raw, allowed: readonly string[]): boolean => Object.keys(x).length === allowed.length && allowed.every(k => k in x);
const num = (x: unknown, min: number, max: number): x is number => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
const point = (x: unknown): boolean => record(x) && keys(x, ["x", "y", "z"]) && [x.x, x.y, x.z].every(c => num(c, -1e5, 1e5));
const exposureOk = (x: unknown): x is Exposure => record(x) && keys(x, ["heat", "brine"]) && num(x.heat, 0, 100) && num(x.brine, 0, 100);

export function parseEcology(raw: unknown): EcologyState | string {
  if (!record(raw) || !keys(raw, ["agents", "deterrents", "diver", "hulls"])) return "ecology: expected agents, deterrents, diver, hulls";
  const { agents, deterrents, diver, hulls } = raw;
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
  if (!record(hulls) || Object.entries(hulls).some(([id, e]) => !/^[a-z0-9_-]{1,64}$/.test(id) || !exposureOk(e))) return "ecology.hulls";
  return structuredClone(raw as unknown as EcologyState);
}
/** Plain JSON copy; the state already holds only stable IDs and numbers. */
export const serializeEcology = (s: EcologyState): unknown => structuredClone(s);

