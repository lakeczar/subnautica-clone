/** UX-1: the Hearthline used through its own stations.
 *
 * Aboard, the player aims at the bridge helm, the bridge lock console, the
 * vestibule berth panel, the stores and the vestibule hatch, like the Creel
 * cabin's fixtures; outside, at the starboard vestibule hatch to board. Every
 * station issues the existing carrier commands, so the transfer, berth,
 * recovery and station-keeping rules stay in sim/carrier.ts. */
import { BERTH_ENVELOPES, HULLS } from "../content/registry.js";
import { HEARTHLINE } from "../content/fleet/hulls.js";
import { LINING } from "../content/fleet/hearthlineInterior.js";
import type { Interaction } from "./progression.js";
import type { InteractionHost } from "./targeting.js";
import type { GameEvent, GameState, Vec3, VehicleState, WorldQueries } from "./types.js";
import {
  CARRIER_LAYOUT, carrierCommand, carrierHull, carrierInteriorSolids, launchPoint, localToWorld, transferAdvice,
  transferBlock, worldToLocal,
} from "./carrier.js";
import { createWorldQueries } from "./world.js";

export type CarrierStationId = "carrier:helm" | "carrier:lock" | "carrier:berths" | "carrier:stores" | "carrier:hatch" | "carrier:board";

interface StationSpec {
  readonly label: string;
  /** Carrier-local host centre and radius: the fixture the player looks at. */
  readonly center: Vec3;
  readonly radius: number;
  /** Walking solid of the fixture, excluded from its own line of sight. */
  readonly solid?: string;
}
const hatch = HEARTHLINE.access.find((a) => a.kind === "side_hatch")!;

export const CARRIER_STATIONS: Readonly<Record<CarrierStationId, StationSpec>> = {
  "carrier:helm": { label: "Helm", center: { x: 0, y: 4.95, z: -8.0 }, radius: 0.9, solid: "hl.bridge.helm" },
  "carrier:lock": { label: "Lock console", center: { x: 4.9, y: 4.85, z: -10.6 }, radius: 0.85, solid: "hl.bridge.launch" },
  "carrier:berths": { label: "Berth panel", center: { x: 5.35, y: 5.0, z: 6.1 }, radius: 0.6, solid: "hl.vestibule.launch" },
  "carrier:stores": { label: "Stores lockers", center: { x: 5.6, y: 5.3, z: -5.2 }, radius: 0.85, solid: "hl.stores.lockers" },
  "carrier:hatch": { label: "Vestibule hatch", center: { x: LINING.x - 0.05, y: 5.2, z: hatch.at[2] }, radius: 0.85 },
  // Outside: the hatch on the hull side. Reach is measured to the swimmer's
  // approach point (the exterior vestibule), where boarding is accepted.
  "carrier:board": { label: "Hearthline vestibule hatch", center: { x: hatch.at[0] + 0.1, y: hatch.at[1], z: hatch.at[2] }, radius: 1.1 },
};
export const isCarrierStation = (id: string): id is CarrierStationId => Object.hasOwn(CARRIER_STATIONS, id);

/** Aboard the carrier's dry rooms (not at its helm). */
export function aboardCarrier(s: GameState): VehicleState | undefined {
  const h = carrierHull(s);
  return h && s.player.interiorId === h.id && s.player.interiorPose?.frame === "carrier-local" ? h : undefined;
}
/** At the Hearthline's helm. */
export function atCarrierHelm(s: GameState): VehicleState | undefined {
  const h = carrierHull(s);
  return h && s.player.controlledVehicleId === h.id && s.player.mode === "piloting" ? h : undefined;
}

/** Aboard: only the carrier's own stations are in reach, as in a Creel cabin.
 * The vestibule hatch is offered once the player stands on its yellow floor. */
export function carrierInteractions(s: GameState): Interaction[] {
  const h = aboardCarrier(s);
  if (!h) return [];
  const aft = (s.player.interiorPose?.position.z ?? 0) >= 7;
  return (Object.keys(CARRIER_STATIONS) as CarrierStationId[])
    .filter((id) => id !== "carrier:board" && (id !== "carrier:hatch" || aft))
    .map((id) => station(id, h));
}
/** Outside: the exterior vestibule hatch of a carrier holding station. */
export function carrierExteriorInteractions(s: GameState): Interaction[] {
  const h = carrierHull(s);
  if (!h || !s.fleet.docking?.stationKeeping || s.player.interiorId || s.player.controlledVehicleId) return [];
  return [station("carrier:board", h)];
}
function station(id: CarrierStationId, h: VehicleState): Interaction {
  const spec = CARRIER_STATIONS[id];
  // CARRIER_LAYOUT is read here, not at module load: carrier.ts and
  // progression.ts import each other.
  const reach = id === "carrier:board" ? CARRIER_LAYOUT.exteriorVestibule : spec.center;
  return { id, label: spec.label, position: localToWorld(reach, h), kind: "service" };
}
export function carrierStationHost(s: GameState, id: CarrierStationId): InteractionHost {
  const h = carrierHull(s)!, spec = CARRIER_STATIONS[id];
  return { center: localToWorld(spec.center, h), radius: spec.radius, solidIds: spec.solid ? [spec.solid] : [] };
}

/** Line of sight aboard: the carrier's walls and fixtures, in its own frame.
 * Null outside the carrier (the exterior world answers then). */
export function carrierAimWorld(s: GameState, world: WorldQueries): WorldQueries | null {
  const h = aboardCarrier(s);
  if (!h) return null;
  const local = createWorldQueries(carrierInteriorSolids(s), () => -200);
  return { ...world, lineOfSight: (a, b, ignore) => local.lineOfSight(worldToLocal(a, h), worldToLocal(b, h), ignore) };
}

/** Use a station: the existing carrier commands, or the console panel. */
export function useCarrierStation(s: GameState, id: CarrierStationId, world: WorldQueries, events: GameEvent[]): string | null {
  switch (id) {
    case "carrier:helm": return carrierCommand(s, "helm", undefined, world);
    case "carrier:hatch": return carrierCommand(s, "leave-interior", undefined, world);
    case "carrier:board": return carrierCommand(s, "enter-interior", undefined, world);
    case "carrier:stores":
      events.push({ type: "interaction-panel", panel: "inventory", targetId: id });
      return null;
    case "carrier:lock": case "carrier:berths":
      events.push({ type: "interaction-panel", panel: "carrier", targetId: id });
      return null;
  }
}

/** Speed (m/s) below which the helm can simply hold station. */
export const HOLD_SPEED = 0.6;
export const carrierSpeed = (h: VehicleState): number => Math.hypot(h.velocity.x, h.velocity.y, h.velocity.z);

/** X at the helm: hold station if needed, then leave the helm into the bridge.
 * Refused while the carrier still makes way, so it never stops dead from speed. */
export function leaveCarrierHelm(s: GameState, world: WorldQueries): string | null {
  const h = atCarrierHelm(s), dock = s.fleet.docking;
  if (!h || !dock) return "You are not at the Hearthline's helm.";
  const speed = carrierSpeed(h);
  if (!dock.stationKeeping && speed > HOLD_SPEED)
    return `The Hearthline is making ${speed.toFixed(1)} m/s. Ease off (release W, or S astern), then X holds station and leaves the helm.`;
  if (!dock.stationKeeping) {
    const no = carrierCommand(s, "station-keep", undefined, world);
    if (no) return no;
  }
  return carrierCommand(s, "leave-helm", undefined, world);
}

export interface CorridorStatus {
  /** The berthed craft the status is for (the largest aboard). */
  readonly vehicleId: string;
  readonly label: string;
  /** World-space keel route from the lock's rail turn to the launch point. */
  readonly path: readonly Vec3[];
  /** Envelope of the craft along the route, metres. */
  readonly halfWidth: number;
  readonly height: number;
  readonly clear: boolean;
  /** Player-facing: "Lock corridor clear" or what to do. */
  readonly advice: string;
}
const BERTH_ORDER = { medium: 0, compact: 1 } as const;

/** Is the lock corridor under the bow clear for the largest berthed craft,
 * and if not, what would clear it. Read-only. */
export function launchCorridor(s: GameState, world: WorldQueries): CorridorStatus | null {
  const h = carrierHull(s), dock = s.fleet.docking;
  if (!h || !dock) return null;
  const berthed = s.fleet.vehicles.filter((v) => v.berth?.carrierId === h.id)
    .sort((a, b) => BERTH_ORDER[HULLS[a.hull].berth ?? "compact"] - BERTH_ORDER[HULLS[b.hull].berth ?? "compact"] || a.id.localeCompare(b.id));
  const v = berthed[0];
  if (!v?.berth || v.hull === "hearthline") return null;
  const surfaceOnly = v.hull === "spindle" && h.pose.position.y < -1;
  const block = surfaceOnly ? null : transferBlock(s, v, v.berth.slot, "launch", world);
  const craft = HULLS[v.hull].label, shape = BERTH_ENVELOPES[v.hull];
  const advice = surfaceOnly ? "The Spindle is a surface craft. Surface the Hearthline to launch it."
    : block ? transferAdvice(s, v, block, "launch", world) : `Lock corridor clear under the bow for the ${craft}.`;
  return { vehicleId: v.id, label: craft, path: [localToWorld(CARRIER_LAYOUT.railTurn, h), launchPoint(h, v)],
    halfWidth: shape.halfWidth, height: shape.height, clear: !surfaceOnly && !block, advice };
}
