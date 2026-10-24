/** Survey station and handheld ping: pure queries over SOURCES and the scan state.
 * A material is known once any source of it has been scanned or gathered; then
 * every source of that material in range is marked, including unvisited ones. */
import { SOURCE_RENEWAL, SOURCES } from "../../content/registry.js";
import { PING_RANGE, SURVEY_TIERS } from "../../content/systems/navigation.js";
import { distance, equipped } from "../inventory.js";
import type { GameState, Vec3 } from "../types.js";
import { hostById, hostServices, locationPower } from "./hosts.js";
import type { HostPower } from "./hosts.js";
import type { SystemsState } from "./state.js";

export interface SurveySource { item: string; position: Vec3; label: string; region: string; stock: number }
export type Regrowth = "regrown" | "regrowing" | "finite" | "exhausted";
export interface SurveyMark {
  sourceId: string;
  item: string;
  label: string;
  region: string;
  distance: number;
  /** Compass bearing in degrees, 0 = -Z (the game's yaw zero), clockwise. */
  bearing: number;
  ready: number;
  reserve: number;
  regrowth: Regrowth;
  /** Seconds of active play until the next regrowth, while regrowing. */
  nextRegrowth: number | null;
  /** Already scanned or gathered here. */
  visited: boolean;
}
export interface SurveyInput {
  origin: Vec3;
  range: number;
  scans: readonly string[];
  resources: GameState["world"]["resources"];
  renewal: GameState["world"]["renewal"];
  sources?: Readonly<Record<string, SurveySource>>;
  renewalPolicy?: Readonly<Record<string, { quantity: number; intervalSteps: number }>>;
}
const STEPS_PER_SECOND = 60;

export function knownMaterials(scans: readonly string[], sources: Readonly<Record<string, SurveySource>> = SOURCES): Set<string> {
  return new Set(scans.flatMap((id) => Object.hasOwn(sources, id) ? [sources[id]!.item] : []));
}
export function bearingDegrees(from: Vec3, to: Vec3): number {
  const deg = Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI;
  return (deg + 360) % 360;
}

export function surveyQuery(input: SurveyInput): SurveyMark[] {
  const sources: Readonly<Record<string, SurveySource>> = input.sources ?? SOURCES;
  const policy: Readonly<Record<string, { quantity: number; intervalSteps: number }>> = input.renewalPolicy ?? SOURCE_RENEWAL;
  const known = knownMaterials(input.scans, sources);
  const marks: SurveyMark[] = [];
  for (const [id, src] of Object.entries(sources)) {
    if (!known.has(src.item)) continue;
    const d = distance(input.origin, src.position);
    if (d > input.range) continue;
    const node = input.resources.find((r) => r.id === id);
    const ready = node?.stock ?? 0, reserve = node?.reserve ?? 0;
    const rule = Object.hasOwn(policy, id) ? policy[id]! : null;
    const progress = input.renewal.find((r) => r.id === id)?.progress ?? 0;
    const regrowth: Regrowth = rule ? (ready >= src.stock ? "regrown" : "regrowing") : ready + reserve > 0 ? "finite" : "exhausted";
    marks.push({
      sourceId: id, item: src.item, label: src.label, region: src.region, distance: d, bearing: bearingDegrees(input.origin, src.position),
      ready, reserve, regrowth, nextRegrowth: rule && regrowth === "regrowing" ? (rule.intervalSteps - progress) / STEPS_PER_SECOND : null,
      visited: input.scans.includes(id),
    });
  }
  return marks.sort((a, b) => a.distance - b.distance || a.sourceId.localeCompare(b.sourceId));
}

export const surveyRange = (tier: number): number =>
  SURVEY_TIERS[Math.max(0, Math.min(SURVEY_TIERS.length - 1, Math.floor(tier)))]!.range;

export interface StationResult { refusal: string | null; range: number; marks: SurveyMark[] }
/** A powered survey station at a host. `tier` comes from SYS-1's range upgrade. */
export function stationSurvey(s: GameState, sys: SystemsState, hostId: string, tier = 0, power: HostPower = locationPower): StationResult {
  const host = hostById(s, sys, hostId), range = surveyRange(tier);
  if (!host || !hostServices(host).includes("survey")) return { refusal: "No survey station here.", range, marks: [] };
  if (!host.available || !power(host, s)) return { refusal: `${host.label}'s survey station has no power.`, range, marks: [] };
  return { refusal: null, range, marks: surveyQuery({ origin: host.position, range, scans: s.knowledge.scans, resources: s.world.resources, renewal: s.world.renewal }) };
}
/** The scanner's short-range handheld ping from the diver or the craft they pilot. */
export function handheldPing(s: GameState): StationResult {
  if (!equipped(s, "essential_tools")) return { refusal: "The ping needs the scanner.", range: PING_RANGE, marks: [] };
  return { refusal: null, range: PING_RANGE, marks: surveyQuery({ origin: s.player.pose.position, range: PING_RANGE, scans: s.knowledge.scans, resources: s.world.resources, renewal: s.world.renewal }) };
}
