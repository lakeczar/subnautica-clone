import { INTERACTION_HOSTS, SOURCES, type SourceId } from "../content/registry.js";
import { distance } from "./inventory.js";
import { interactions, type Interaction } from "./progression.js";
import { eyeHeight } from "./state.js";
import type { GameState, Vec3, WorldQueries } from "./types.js";
import type { DiscoveryId } from "../content/story/evidence.js";
import { storyHost, storyKnown } from "./storyLink.js";
import { aboardCarrier, carrierAimWorld, carrierStationHost, isCarrierStation } from "./carrierStations.js";

export interface AimRay { origin: Vec3; dir: Vec3 }
export interface InteractionHost { center: Vec3; radius: number; solidIds: readonly string[] }
export type InteractionVerb =
  | "collect" | "gather" | "sort" | "inspect" | "review" | "read"
  | "board" | "recover" | "open" | "use" | "empty";
export interface AimedTarget extends Interaction {
  host: InteractionHost;
  verb: InteractionVerb;
  known: boolean;
}
export const INTERACTION_REACH = 4;
export const PREVIEW_REACH = 8;
export interface ReachPreview {
  id: string;
  kind: Interaction["kind"];
  host: InteractionHost;
  label: string | null;
}
interface Candidate { target: AimedTarget; angle: number; reach: number; fresh: boolean }

const finite = (v: Vec3): boolean => [v.x, v.y, v.z].every(Number.isFinite);
const AIM_SLACK = 0.18;
const MAX_ANGLE = Math.PI / 6;
const NEAR_TIE = 0.003;
const CENTERED = 1e-6;

export function aimRay(s: GameState): AimRay | null {
  const { pose, mode, controlledVehicleId, interiorId } = s.player;
  // A Creel cabin and the Hearthline's rooms are dry rooms with aimable fixtures (UX-1).
  const cabin = s.player.interiorPose?.frame === "hull-local" || !!aboardCarrier(s);
  if (s.opening.phase < 4 || controlledVehicleId || (interiorId && !cabin) ||
      mode === "piloting" || (mode === "interior" && !cabin) ||
      !finite(pose.position) || !Number.isFinite(pose.yaw) || !Number.isFinite(pose.pitch)) return null;
  const cp = Math.cos(pose.pitch);
  return {
    origin: { ...pose.position, y: pose.position.y + eyeHeight(s) },
    dir: { x: Math.sin(pose.yaw) * cp, y: Math.sin(pose.pitch), z: -Math.cos(pose.yaw) * cp },
  };
}

export function interactionHost(s: GameState, t: Interaction): InteractionHost {
  if (isCarrierStation(t.id)) return carrierStationHost(s, t.id);
  const m = INTERACTION_HOSTS[t.id];
  // Source clusters extend just below their terrain datum. A vehicle interaction
  // already includes its +0.6 m access datum; do not add that offset twice.
  const offset = m?.offset ?? { x: 0, y: t.kind === "source" ? -0.2 : t.kind === "cache" ? 0.3 : 0, z: 0 };
  const radii = { source: 1.15, evidence: 0.7, record: 0.6, vehicle: 2.2, cache: 0.65, service: 0.85 };
  return {
    center: { x: t.position.x + offset.x, y: t.position.y + offset.y + (m?.renderOffsetY ?? 0), z: t.position.z + offset.z },
    radius: m?.radius ?? radii[t.kind],
    solidIds: [...(m?.solidIds ?? [])],
  };
}

function describe(s: GameState, t: Interaction, host: InteractionHost): AimedTarget {
  let known = false, verb: InteractionVerb;
  switch (t.kind) {
    case "source": {
      const id = t.id as SourceId, d = SOURCES[id];
      const node = s.world.resources.find(n => n.id === id);
      known = s.knowledge.scans.includes(id);
      const recoveryNeeded = d.region === "refuge_reef" &&
        (s.world.maintenance.alloy < 2 || s.world.maintenance.membrane < 1);
      // C4 (CB): a never-stocked site is there to be inspected, not "empty".
      verb = node && node.stock > 0 ? d.item === "meal" ? "gather" : "collect"
        : node && (d.item === "meal" || node.reserve > 0 || recoveryNeeded) ? "sort"
        : d.stock === 0 && d.reserve === 0 ? "inspect" : "empty";
      break;
    }
    case "evidence":
      known = storyKnown(s, t.id as DiscoveryId);
      verb = known ? "review" : "inspect";
      break;
    case "record":
      known = storyHost(t.id) || t.id === "mara_reef_note" ? storyKnown(s, t.id as DiscoveryId) : false;
      verb = "read";
      break;
    case "vehicle": {
      const v = s.fleet.vehicles.find(v => v.id === t.id)!;
      verb = v.disabled || v.charge <= 0 ? "recover" : "board";
      break;
    }
    case "cache": verb = "open"; break;
    case "service": verb = "use"; break;
  }
  return { ...t, position: { ...t.position }, host, verb, known };
}

function aimCandidates(s: GameState, world: WorldQueries, ray: AimRay, maxReach: number): Candidate[] {
  const candidates: Candidate[] = [];
  for (const t of interactions(s)) {
    const reach = distance(s.player.pose.position, t.position);
    if (!Number.isFinite(reach) || reach >= maxReach) continue;
    const host = interactionHost(s, t);
    if (!finite(host.center) || !Number.isFinite(host.radius) || host.radius <= 0) continue;
    const x = host.center.x - ray.origin.x, y = host.center.y - ray.origin.y, z = host.center.z - ray.origin.z;
    const along = x * ray.dir.x + y * ray.dir.y + z * ray.dir.z;
    if (along <= 1e-8) continue;
    const miss = Math.hypot(x - along * ray.dir.x, y - along * ray.dir.y, z - along * ray.dir.z);
    const angle = Math.atan2(miss, along);
    if (miss > host.radius + AIM_SLACK || angle > MAX_ANGLE ||
        !world.lineOfSight(ray.origin, host.center, host.solidIds)) continue;
    const target = describe(s, t, host);
    const fresh = t.kind === "evidence" ? !target.known
      : t.kind === "source" && (target.verb === "collect" || target.verb === "gather");
    candidates.push({ target, angle, reach, fresh });
  }
  return candidates;
}
function pick(candidates: Candidate[]): AimedTarget | null {
  candidates.sort((a, b) => a.angle - b.angle || a.reach - b.reach || a.target.id.localeCompare(b.target.id));
  const first = candidates[0];
  if (!first) return null;
  // Exact centered intent wins. New stock/evidence only breaks an ambiguous
  // angular tie; it cannot steal a deliberately centered known record.
  const tie = first.angle <= CENTERED ? CENTERED : first.angle + NEAR_TIE;
  return candidates.filter(c => c.angle <= tie).sort((a, b) =>
    Number(b.fresh) - Number(a.fresh) || a.angle - b.angle || a.reach - b.reach ||
    a.target.id.localeCompare(b.target.id))[0]!.target;
}
/** Pure, current-state selection. Reach uses the existing body datum; visibility
 * always reaches the actual host center, even when the eye is inside its sphere. */
export function aimedInteraction(s: GameState, world: WorldQueries): AimedTarget | null {
  const ray = aimRay(s);
  world = carrierAimWorld(s, world) ?? world;
  return ray ? pick(aimCandidates(s, world, ray, INTERACTION_REACH)) : null;
}
/** Presentation only: never an executable Interaction, and never reveals unknown records. */
export function reachPreview(s: GameState, world: WorldQueries): ReachPreview | null {
  const ray = aimRay(s);
  world = carrierAimWorld(s, world) ?? world;
  if (!ray || pick(aimCandidates(s, world, ray, INTERACTION_REACH))) return null;
  const target = pick(aimCandidates(s, world, ray, PREVIEW_REACH)
    .filter(c => c.reach >= INTERACTION_REACH && c.target.verb !== "empty"));
  if (!target) return null;
  return { id: target.id, kind: target.kind, host: target.host,
    label: target.kind === "record" || (target.kind === "evidence" && !target.known) ? null : target.label };
}
