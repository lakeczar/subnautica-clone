/** UX-1: what of the Hearthline's lock corridor to draw, Babylon-free (the
 * fast tests and the renderer share it; render/fleet/corridor.ts draws it).
 *
 * A ghost of the craft's envelope swept from the lock gate under the bow to the
 * launch point, with chevrons along it: mint when clear, amber when obstructed.
 * Shown at the helm and beside the lock consoles while a craft is berthed, and
 * to a pilot whose craft fits a free berth within 60 m of the lock mouth. */
import { BERTH_ENVELOPES, HULLS } from "../content/registry.js";
import { CARRIER_LAYOUT, carrierHull, launchPoint, worldToLocal } from "../sim/carrier.js";
import { aboardCarrier, atCarrierHelm, CARRIER_STATIONS, launchCorridorView } from "../sim/carrierStations.js";
import { distance } from "../sim/inventory.js";
import type { GameState, Vec3, WorldQueries } from "../sim/types.js";

export const CORRIDOR_COLORS = { clear: "#8af5d0", blocked: "#ffb44a", guide: "#9fe4ff" } as const;
/** How close to a lock station (metres, carrier-local) the corridor shows aboard. */
const STATION_REACH = 3.5;
/** Pilot distance from the lock mouth at which the recovery guide shows. */
const GUIDE_RANGE = 60;

export type CorridorMode = "launch" | "guide";
export interface CorridorDrawing {
  readonly mode: CorridorMode;
  readonly clear: boolean;
  /** Carrier-local corridor: gate-side start, launch point, envelope. */
  readonly from: Vec3;
  readonly to: Vec3;
  readonly halfWidth: number;
  readonly height: number;
}

/** What to draw for this state, if anything. Pure apart from the shared
 * corridor memo; the renderer and tests call it. */
export function corridorDrawing(s: GameState, world: WorldQueries): CorridorDrawing | null {
  const h = carrierHull(s), dock = s.fleet.docking;
  if (!h || !dock || s.opening.phase < 4) return null;
  const local = (p: Vec3): Vec3 => worldToLocal(p, h);
  const aboard = aboardCarrier(s);
  const nearStation = aboard && (["carrier:lock", "carrier:berths"] as const).some((id) =>
    Math.hypot(s.player.interiorPose!.position.x - CARRIER_STATIONS[id].center.x, s.player.interiorPose!.position.z - CARRIER_STATIONS[id].center.z) <= STATION_REACH);
  if (atCarrierHelm(s) || nearStation) {
    const status = launchCorridorView(s, world);
    if (!status) return null;
    const v = s.fleet.vehicles.find((a) => a.id === status.vehicleId)!;
    return { mode: "launch", clear: status.clear, from: CARRIER_LAYOUT.railTurn, to: local(launchPoint(h, v)), halfWidth: status.halfWidth, height: status.height };
  }
  // A pilot bringing a craft home: the lock mouth, if it has a berth for it.
  const v = s.fleet.vehicles.find((a) => a.id === s.player.controlledVehicleId);
  if (!v || v.hull === "hearthline" || v.berth || !dock.stationKeeping) return null;
  const free = ([0, 1] as const).find((n) => !s.fleet.vehicles.some((a) => a.berth?.carrierId === h.id && a.berth.slot === n));
  if (free === undefined || (dock.configuration === "medium" && free !== 0) || HULLS[v.hull].berth !== dock.configuration) return null;
  if (distance(v.pose.position, launchPoint(h, v)) > GUIDE_RANGE) return null;
  const shape = BERTH_ENVELOPES[v.hull as keyof typeof BERTH_ENVELOPES];
  return { mode: "guide", clear: true, from: CARRIER_LAYOUT.railTurn, to: local(launchPoint(h, v)), halfWidth: shape.halfWidth, height: shape.height };
}

/** Carrier-local line strips of a drawing: the envelope at each end, its long
 * edges, a keel line and chevrons pointing out (launch) or in (guide). */
export function corridorLines(d: CorridorDrawing): Vec3[][] {
  const w = d.halfWidth, hgt = d.height, lines: Vec3[][] = [];
  const at = (t: number, x: number, y: number): Vec3 => ({
    x: d.from.x + (d.to.x - d.from.x) * t + x, y: d.from.y + (d.to.y - d.from.y) * t + y, z: d.from.z + (d.to.z - d.from.z) * t,
  });
  for (const t of [0, 1]) lines.push([at(t, -w, 0), at(t, w, 0), at(t, w, hgt), at(t, -w, hgt), at(t, -w, 0)]);
  for (const [x, y] of [[-w, 0], [w, 0], [w, hgt], [-w, hgt]] as const) lines.push([at(0, x, y), at(1, x, y)]);
  lines.push([at(-0.15, 0, 0), at(1.4, 0, 0)]);
  // Chevrons on the corridor floor; the local corridor runs toward -Z.
  for (const t of [0.25, 0.55, 0.85, 1.15]) {
    const tip = d.mode === "launch" ? t + 0.07 : t - 0.07, back = d.mode === "launch" ? t - 0.05 : t + 0.05;
    lines.push([at(back, -w * 0.6, 0.02), at(tip, 0, 0.02), at(back, w * 0.6, 0.02)]);
  }
  return lines;
}
