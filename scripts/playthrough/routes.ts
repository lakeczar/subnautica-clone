/** Authored craft routes for today's world, and the check that validates each one
 * before it is flown: the game's own swept hull clearance for the hull flying it.
 * A route that no longer sweeps clear in a later build is reported, not bent. */
import { CREEL_BUILD_POSE, DART_BUILD_POSE, HULL_COLLIDERS, THREAT_HOME } from "../../src/content/registry.js";
import type { HullId } from "../../src/content/registry.js";
import { CANOPY_BASIN_ROUTE, CANOPY_STOP } from "../../src/content/routes.js";
import { sweptHullClearance } from "../../src/sim/world.js";
import type { Vec3 } from "../../src/sim/types.js";
import { Blocked, Driver, where } from "./driver.js";
import { dist, route, travel } from "./travel.js";
import type { Waypoint } from "./travel.js";

const p = (x: number, y: number, z: number): Waypoint => ({ x, y, z });
const DART_CRADLE_MOUTH = p(20, -1.6, -12);
const CREEL_SLIP_MOUTH = p(-6, -3.2, -16);
/** Leave the island waters toward the Canopy route head. */
export const ISLE_TO_ROUTE_HEAD = [p(40, -3, -14), p(50, -8, -40), { ...CANOPY_BASIN_ROUTE.upper[0] }];
const CREEL_ISLE_TO_HEAD = [p(6, -3.4, -13), p(32, -3.4, -11), p(46, -5, -30), { ...CANOPY_BASIN_ROUTE.upper[0] }];

export interface CraftRoute { id: string; points: readonly Waypoint[]; source: string }
export const CRAFT_ROUTES = {
  dart_out: { id: "dart_out", source: "harness: cradle → Canopy route head", points: [{ ...DART_BUILD_POSE }, DART_CRADLE_MOUTH, ...ISLE_TO_ROUTE_HEAD] },
  dart_home: { id: "dart_home", source: "harness: Canopy route head → cradle", points: [...[...ISLE_TO_ROUTE_HEAD].reverse(), DART_CRADLE_MOUTH, { ...DART_BUILD_POSE, z: DART_BUILD_POSE.z + 1 }] },
  creel_out: { id: "creel_out", source: "harness: medium slip → Canopy route head", points: [{ ...CREEL_BUILD_POSE }, CREEL_SLIP_MOUTH, ...CREEL_ISLE_TO_HEAD] },
  creel_home: { id: "creel_home", source: "harness: Canopy route head → medium slip", points: [...[...CREEL_ISLE_TO_HEAD].reverse(), CREEL_SLIP_MOUTH, { ...CREEL_BUILD_POSE, z: CREEL_BUILD_POSE.z + 1 }] },
  canopy_upper: { id: "canopy_upper", source: "B1 CANOPY_BASIN_ROUTE.upper", points: CANOPY_BASIN_ROUTE.upper.map((q) => ({ ...q })) },
  canopy_upper_back: { id: "canopy_upper_back", source: "B1 CANOPY_BASIN_ROUTE.upper reversed", points: [...CANOPY_BASIN_ROUTE.upper].reverse().map((q) => ({ ...q })) },
  canopy_basin: { id: "canopy_basin", source: "B1 CANOPY_BASIN_ROUTE.basin", points: CANOPY_BASIN_ROUTE.basin.map((q) => ({ ...q })) },
  basin_return: { id: "basin_return", source: "B1 CANOPY_BASIN_ROUTE.returnLoop", points: CANOPY_BASIN_ROUTE.returnLoop.map((q) => ({ ...q })) },
  basin_outbound: { id: "basin_outbound", source: "B1 CANOPY_BASIN_ROUTE.returnLoop reversed", points: [...CANOPY_BASIN_ROUTE.returnLoop].reverse().map((q) => ({ ...q })) },
  /** Basin station → outer-crown mooring, along the clear eastern margin. */
  basin_to_stop: { id: "basin_to_stop", source: "harness: Basin station → outer-crown mooring", points: [{ ...CANOPY_BASIN_ROUTE.returnLoop[0] }, { ...CANOPY_BASIN_ROUTE.returnLoop[1] }, p(214, -140, -170), { ...CANOPY_STOP.mooring }] },
  stop_to_return: { id: "stop_to_return", source: "harness: outer-crown mooring → return lane", points: [{ ...CANOPY_STOP.mooring }, p(214, -120, -150), { ...CANOPY_BASIN_ROUTE.returnLoop[2] }, ...CANOPY_BASIN_ROUTE.returnLoop.slice(3).map((q) => ({ ...q }))] },
} as const satisfies Record<string, CraftRoute>;
export type CraftRouteId = keyof typeof CRAFT_ROUTES;

/** Quiet inside the sound hunter's territory (72 m), with a 10 m margin. */
const inTerritory = (q: Vec3): boolean => dist(q, THREAT_HOME) < 82;

/** Fly the piloted craft along a route, first proving the hull sweeps clear. The
 * route begins wherever the craft is; its first point need not be exact. */
export function fly(d: Driver, id: CraftRouteId | CraftRoute, options: { quiet?: boolean } = {}): void {
  const r: CraftRoute = typeof id === "string" ? CRAFT_ROUTES[id] : id;
  const v = d.occupied();
  if (!v || d.state.player.controlledVehicleId !== v.id) throw new Blocked(`Route ${r.id} needs a piloted craft`, where(d.state));
  const shape = HULL_COLLIDERS[v.hull as HullId];
  const points = [{ ...v.pose.position }, ...r.points.filter((q, i) => i > 0 || dist(q, v.pose.position) > 2)];
  for (let i = 0; i < points.length - 1; i++)
    if (!sweptHullClearance(d.world, [points[i]!, points[i + 1]!], shape))
      throw new Blocked(`Route ${r.id} (${r.source}) does not sweep clear for the ${v.hull} between ` +
        `(${points[i]!.x.toFixed(0)}, ${points[i]!.y.toFixed(0)}, ${points[i]!.z.toFixed(0)}) and point ${i + 1}`, where(d.state));
  // Split at the territory edge: quiet inside, cruise outside.
  const legs: { quiet: boolean; points: Waypoint[] }[] = [];
  for (const q of points.slice(1)) {
    const quiet = options.quiet ?? inTerritory(q);
    const last = legs.at(-1);
    if (last && last.quiet === quiet) last.points.push(q); else legs.push({ quiet, points: [q] });
  }
  legs.forEach((leg, i) => {
    const pts = leg.points.map((q, k) => k === leg.points.length - 1 && i < legs.length - 1 ? { ...q, tolerance: 3 } : q);
    travel(d, route(r.id, "craft", `${r.source}; swept clear for ${v.hull}`, pts, leg.quiet ? { quiet: true } : {}),
      `${r.id}${leg.quiet ? " (quiet)" : ""}`);
  });
}

/** Fly straight to a nearby point if the hull sweeps clear there. */
export function pilotTo(d: Driver, label: string, to: Vec3, options: { quiet?: boolean } = {}): void {
  fly(d, { id: label, source: "harness: direct local leg", points: [{ ...to }] }, options);
}
