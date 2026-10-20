/** The decoder and lost-site framework. Sites are found by visiting them; their
 * data then decodes in the background on a powered decoder module. Without a
 * relay a decoder works only while the player is near its host. */
import { DECODABLE_IDS, DECODABLES, DECODE_MINUTES, DECODER_LOCAL_RANGE } from "../../content/systems/decodes.js";
import type { DecodableDefinition, DecodableId, MainPathStep } from "../../content/systems/decodes.js";
import { moduleOfItem } from "../../content/systems/hosts.js";
import type { BlueprintId } from "../../content/registry.js";
import { distance } from "../inventory.js";
import type { GameState } from "../types.js";
import { hostById, hostLocal, hostServices, installedAt, locationPower } from "./hosts.js";
import type { HostPower, SocketHost } from "./hosts.js";
import type { DecodeJob, SystemsState } from "./state.js";

export interface DecoderContext {
  power?: HostPower;
  /** SYS-1's decoder upgrade: work multiplier for one decoder module (default 1). */
  decoderSpeed?: (moduleId: string) => number;
}
export const decodeSeconds = (id: DecodableId): number => DECODE_MINUTES[DECODABLES[id].size] * 60;

/** Visiting a lost site or landmark finds its decodables. Returns the new ones. */
export function discoverSite(sys: SystemsState, siteId: string): DecodableId[] {
  const fresh = DECODABLE_IDS.filter((d) => DECODABLES[d].site === siteId && !sys.found.includes(d));
  sys.found.push(...fresh);
  return fresh;
}
/** A gated record (log, terminal, recipe) reads only once its decode is done. */
export function recordReadable(sys: SystemsState, recordId: string): boolean {
  return DECODABLE_IDS.every((d) => !(DECODABLES[d].gates as readonly string[]).includes(recordId) || sys.decoded.includes(d));
}
/** Sites known on the chart: found by visiting, or revealed by a decoded map. */
export function knownSites(sys: SystemsState): string[] {
  const found = sys.found.map((d) => DECODABLES[d].site);
  const revealed = sys.decoded.flatMap((d) => DECODABLES[d].reveals.filter((r) => r.category === "site").map((r) => r.id));
  return [...new Set([...found, ...revealed])];
}

export type DecodeStatus = "running" | "unpowered" | "out-of-range" | "not-installed" | "host-unavailable";
export interface DecodeView {
  decodable: DecodableId;
  moduleId: string;
  hostId: string | null;
  status: DecodeStatus;
  progress: number;
  required: number;
  /** Play seconds left at the current speed while running. */
  remaining: number;
}
function relayed(host: SocketHost): boolean {
  return hostServices(host).includes("relay");
}
export function decodeStatus(s: GameState, sys: SystemsState, job: DecodeJob, ctx: DecoderContext = {}): { status: DecodeStatus; host: SocketHost | null } {
  const at = installedAt(sys, job.moduleId);
  const host = at ? hostById(s, sys, at.hostId) : null;
  if (!host) return { status: "not-installed", host: null };
  if (!host.available) return { status: "host-unavailable", host };
  if (!(ctx.power ?? locationPower)(host, s)) return { status: "unpowered", host };
  if (!relayed(host) && !hostLocal(s, host) && distance(s.player.pose.position, host.position) > DECODER_LOCAL_RANGE)
    return { status: "out-of-range", host };
  return { status: "running", host };
}
export function decodeViews(s: GameState, sys: SystemsState, ctx: DecoderContext = {}): DecodeView[] {
  return sys.decodes.map((j) => {
    const { status, host } = decodeStatus(s, sys, j, ctx), required = decodeSeconds(j.decodable);
    const speed = Math.max(0.01, ctx.decoderSpeed?.(j.moduleId) ?? 1);
    return { decodable: j.decodable, moduleId: j.moduleId, hostId: host?.id ?? null, status, progress: j.progress, required,
      remaining: Math.max(0, (required - j.progress) / speed) };
  });
}

/** Starts decoding at an idle decoder in this host. */
export function startDecode(s: GameState, sys: SystemsState, hostId: string, decodable: DecodableId): string | null {
  const def: DecodableDefinition | undefined = DECODABLES[decodable];
  if (!def) return "Nothing to decode.";
  if (!sys.found.includes(decodable)) return "Find the site first. Its data is captured when you get there.";
  if (sys.decoded.includes(decodable)) return `${def.label} is already decoded.`;
  if (sys.decodes.some((j) => j.decodable === decodable)) return `${def.label} is already decoding.`;
  const host = hostById(s, sys, hostId);
  if (!host) return "That host doesn't exist.";
  if (!host.available) return `${host.label} isn't working.`;
  const decoders = host.sockets.flatMap((k) => k.occupant?.module === "decoder" && k.occupant.itemId ? [k.occupant.itemId] : []);
  if (!decoders.length) return `${host.label} has no decoder module.`;
  if (!hostLocal(s, host)) return `Start decodes at ${host.label}'s decoder.`;
  const idle = decoders.find((m) => !sys.decodes.some((j) => j.moduleId === m));
  if (!idle) return "Every decoder here is busy. Decodes finish in the background.";
  sys.decodes.push({ moduleId: idle, decodable, progress: 0 });
  s.feedback = `Decoding ${def.label} · about ${DECODE_MINUTES[def.size]} min of play. It keeps running while you're nearby${relayed(host) ? " or anywhere, through the relay" : ""}.`;
  return null;
}

export interface DecodeCompletion { decodable: DecodableId; blueprints: string[]; readable: string[]; beacons: string[] }
/** Advances every running decode by `seconds` of active play. */
export function advanceDecodes(s: GameState, sys: SystemsState, seconds: number, ctx: DecoderContext = {}): DecodeCompletion[] {
  const done: DecodeCompletion[] = [];
  for (const job of [...sys.decodes]) {
    if (decodeStatus(s, sys, job, ctx).status !== "running") continue;
    job.progress += seconds * Math.max(0, ctx.decoderSpeed?.(job.moduleId) ?? 1);
    if (job.progress + 1e-9 < decodeSeconds(job.decodable)) continue;
    done.push(completeDecode(s, sys, job));
  }
  return done;
}
function completeDecode(s: GameState, sys: SystemsState, job: DecodeJob): DecodeCompletion {
  const def = DECODABLES[job.decodable];
  sys.decodes = sys.decodes.filter((j) => j !== job);
  sys.decoded.push(job.decodable);
  for (const bp of def.blueprints)
    if (!(s.knowledge.blueprints as string[]).includes(bp)) s.knowledge.blueprints.push(bp as BlueprintId);
  const beacons: string[] = [];
  for (const r of def.reveals)
    if (!sys.beacons.some((b) => b.id === r.id)) {
      sys.beacons.push({ id: r.id, name: r.label, category: r.category, position: { ...r.position }, source: "decode" });
      beacons.push(r.id);
    }
  // Background completion: reported through SystemsEvent, never over command feedback.
  return { decodable: job.decodable, blueprints: [...def.blueprints], readable: [...def.gates], beacons };
}
/** Is this item a decoder module (installed or carried)? */
export const isDecoderItem = (kind: string): boolean => moduleOfItem(kind) === "decoder";

/** The guarantee: decoder plans are granted on the main path by a step that needs
 * no decode, before any step that needs one. Returns the problems, empty when held. */
export function decoderPlanProblems(path: readonly MainPathStep[], decoderBlueprint = "bp_decoder",
  decodables: Readonly<Record<string, unknown>> = DECODABLES): string[] {
  const problems: string[] = [];
  const grant = path.findIndex((step) => step.grants.includes(decoderBlueprint));
  if (grant < 0) problems.push(`${decoderBlueprint} is not granted anywhere on the main path.`);
  else if (path[grant]!.needsDecoded.length) problems.push(`${decoderBlueprint} is granted at "${path[grant]!.id}", which itself needs a decode.`);
  path.forEach((step, n) => {
    if (step.needsDecoded.length && (grant < 0 || n < grant))
      problems.push(`"${step.id}" needs ${step.needsDecoded.join(", ")} before the decoder plans are reachable.`);
    for (const d of step.needsDecoded)
      if (!Object.hasOwn(decodables, d)) problems.push(`"${step.id}" needs an unknown decodable ${d}.`);
  });
  return problems;
}
