/** Authored craft routes for today's world, and the check that validates each one
 * before it is flown: the game's own swept hull clearance for the hull flying it.
 * A route that no longer sweeps clear in a later build is reported, not bent. */
import { CREEL_BUILD_POSE, DART_BUILD_POSE, HULL_COLLIDERS, THREAT_HOME } from "../../src/content/registry.js";
import type { HullId } from "../../src/content/registry.js";
import { CANOPY_BASIN_ROUTE, CANOPY_STOP } from "../../src/content/routes.js";
import { sweptHullClearance } from "../../src/sim/world.js";
import type { Capsule, Vec3 } from "../../src/sim/types.js";
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
  /** S2's western reef return (route.basin.reef_west ends beside the pod) → medium slip. */
  reef_to_slip: { id: "reef_to_slip", source: "harness: reef west return → medium slip", points: [p(-8, -2.5, 4), p(4, -3, 0), p(6, -3.4, -13), CREEL_SLIP_MOUTH, { ...CREEL_BUILD_POSE, z: CREEL_BUILD_POSE.z + 1 }] },
  /** Route head → outer-crown mooring along the clear return lane, outside the hunter's territory. */
  head_to_stop: { id: "head_to_stop", source: "harness: return lane → outer-crown mooring", points: [{ ...CANOPY_BASIN_ROUTE.upper[0] }, p(90, -18, -45), p(170, -55, -90), p(214, -120, -150), { ...CANOPY_STOP.mooring }] },
  stop_to_head: { id: "stop_to_head", source: "harness: outer-crown mooring → return lane", points: [{ ...CANOPY_STOP.mooring }, p(214, -120, -150), p(170, -55, -90), p(90, -18, -45), { ...CANOPY_BASIN_ROUTE.upper[0] }] },
} as const satisfies Record<string, CraftRoute>;
export type CraftRouteId = keyof typeof CRAFT_ROUTES;

/** Quiet on any segment that comes within the sound hunter's territory (72 m), with a 12 m margin. */
function nearTerritory(a: Vec3, b: Vec3): boolean {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, len2 = ab.x ** 2 + ab.y ** 2 + ab.z ** 2;
  const t = len2 ? Math.max(0, Math.min(1, ((THREAT_HOME.x - a.x) * ab.x + (THREAT_HOME.y - a.y) * ab.y + (THREAT_HOME.z - a.z) * ab.z) / len2)) : 0;
  return dist({ x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t }, THREAT_HOME) < 84;
}

/** Fly the piloted craft along a route, first proving the hull sweeps clear. The
 * route begins wherever the craft is; its first point need not be exact. */
export function fly(d: Driver, id: CraftRouteId | CraftRoute, options: { quiet?: boolean } = {}): void {
  const r: CraftRoute = typeof id === "string" ? CRAFT_ROUTES[id] : id;
  const v = d.occupied();
  if (!v || d.state.player.controlledVehicleId !== v.id) throw new Blocked(`Route ${r.id} needs a piloted craft`, where(d.state));
  const shape = HULL_COLLIDERS[v.hull as HullId];
  // Low on power before a leg: plug in a carried reserve cell (each adds up to 35%).
  if (v.charge < 35 && v.hull !== "hearthline") d.command({ type: "reserve", vehicleId: v.id }, { allowRefusal: true });
  // Join the route at the nearest point the hull can reach in a clear straight line.
  const here = v.pose.position;
  const nearest = r.points.map((q, i) => ({ i, d: dist(q, here) })).sort((a, b) => a.d - b.d);
  let join = nearest.find(({ i }) => sweptHullClearance(d.world, [here, r.points[i]!], shape))?.i;
  if (join === undefined) {
    // No point in a clear straight line (a ridge between): climb to the nearest first.
    join = nearest[0]!.i;
    pilotTo(d, `join ${r.id}`, r.points[join]!, options);
    return fly(d, { ...r, points: r.points.slice(join) }, options);
  }
  const rest = r.points.slice(join);
  const points = [{ ...here }, ...rest.filter((q, i) => i > 0 || dist(q, here) > 2)];
  for (let i = 0; i < points.length - 1; i++)
    if (!sweptHullClearance(d.world, [points[i]!, points[i + 1]!], shape))
      throw new Blocked(`Route ${r.id} (${r.source}) does not sweep clear for the ${v.hull} between ` +
        `(${points[i]!.x.toFixed(0)}, ${points[i]!.y.toFixed(0)}, ${points[i]!.z.toFixed(0)}) and point ${i + 1}`, where(d.state));
  // Split at the territory edge: quiet inside, cruise outside.
  const legs: { quiet: boolean; points: Waypoint[] }[] = [];
  for (const [k, q] of points.slice(1).entries()) {
    const quiet = options.quiet ?? nearTerritory(points[k]!, q);
    const last = legs.at(-1);
    if (last && last.quiet === quiet) last.points.push(q); else legs.push({ quiet, points: [q] });
  }
  legs.forEach((leg, i) => {
    const pts = leg.points.map((q, k) => k === leg.points.length - 1 && i < legs.length - 1 ? { ...q, tolerance: 3 } : q);
    travel(d, route(r.id, "craft", `${r.source}; swept clear for ${v.hull}`, pts, leg.quiet ? { quiet: true } : {}),
      `${r.id}${leg.quiet ? " (quiet)" : ""}`);
  });
}

/** Fly to a nearby point: straight if the hull sweeps clear, otherwise up, across
 * and down through open water above both ends. */
export function pilotTo(d: Driver, label: string, to: Vec3, options: { quiet?: boolean } = {}): void {
  const v = d.occupied();
  if (!v) throw new Blocked(`${label} needs a piloted craft`, where(d.state));
  const from = v.pose.position, shape = HULL_COLLIDERS[v.hull as HullId];
  // Prefer a 1.5 m margin: the craft's bounded turning wanders off a straight line,
  // so a leg that only just clears (a mooring pylon) climbs over when it can. With
  // no margin plan, the exact hull plans as before.
  const wide = { ...shape, radius: shape.radius + 1.5 };
  const plan = (hull: Capsule): Waypoint[] | null => {
    if (sweptHullClearance(d.world, [from, to], hull)) return [{ ...to }];
    for (const rise of [8, 16, 30, 50]) {
      const y = Math.min(-2, Math.max(from.y, to.y) + rise);
      const over = [{ ...from, y }, { ...to, y }, { ...to }];
      if (sweptHullClearance(d.world, [from, ...over.slice(0, 2)], hull) && sweptHullClearance(d.world, [over[1]!, to], shape)) return over;
    }
    return null;
  };
  const points: Waypoint[] = plan(wide) ?? plan(shape) ?? [{ ...to }];
  fly(d, { id: label, source: "harness: local leg, swept", points }, options);
}

/** Hold position and turn the craft to a heading with real look steps. */
export function turnTo(d: Driver, yaw: number): void {
  for (let i = 0; i < 8 * 60; i++) {
    const v = d.occupied()!;
    const err = ((yaw - v.pose.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(err) < 0.01) return;
    d.tick([{ type: "look", yawDelta: Math.max(-0.8, Math.min(0.8, err)), pitchDelta: -d.state.player.pose.pitch },
      { type: "move", forward: 0, right: 0, vertical: 0, sprint: false }]);
  }
  throw new Blocked(`Could not turn the craft to heading ${yaw.toFixed(2)}`, where(d.state));
}
