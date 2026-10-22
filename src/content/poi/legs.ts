import type { Vec3 } from "../../world/types.js";
import { ROUTES, type RouteDef } from "../regions/passages.js";

/** The deep legs (M2 audit #3): the authored routes a player crosses between
 * the deep regions' stops, and the speed of the best craft normally flown on
 * each (audit: Creel 5 m/s; the Mantle 4 and the carrier 3 are slower). The
 * pacing rule is about 90 s of empty travel at that speed. */
export interface DeepLeg {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  /** m/s of the best craft you'd normally fly here. */
  readonly speed: number;
}
export const DEEP_LEGS: readonly DeepLeg[] = [
  { id: "basin_rift", label: "Basin ↔ Rift", route: "route.basin.rift", speed: 5 },
  { id: "basin_divide", label: "Basin ↔ Divide", route: "route.basin.divide", speed: 5 },
  { id: "divide_meridian", label: "Divide ↔ Meridian", route: "route.divide.meridian_broad", speed: 5 },
  { id: "service_ledge", label: "Divide → service ledge", route: "route.divide.service_ledge", speed: 5 },
];
/** The empty-travel rule, seconds. */
export const EMPTY_TRAVEL_LIMIT = 90;

export const legRoute = (leg: DeepLeg): RouteDef => {
  const r = ROUTES.find(x => x.id === leg.route);
  if (!r) throw new Error(`deep leg ${leg.id}: unknown route ${leg.route}`);
  return r;
};

/** Distance along a polyline to the point nearest `p` in plan, and how far
 * off the line it lies (horizontal metres). */
export function alongRoute(path: readonly Readonly<Vec3>[], p: { readonly x: number; readonly z: number }): { s: number; off: number; length: number } {
  let s = 0, best = Infinity, at = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
    const d = Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t), seg = Math.hypot(dx, b.y - a.y, dz);
    if (d < best) { best = d; at = s + seg * t; }
    s += seg;
  }
  return { s: at, off: best, length: s };
}

/** Something a pilot on the route notices: where it stands, and from how far
 * off the line it can be seen (a lit point of interest further than an unlit
 * site in deep water). */
export interface Noticeable { readonly id: string; readonly x: number; readonly z: number; readonly reach: number }

/** The longest stretch of the route with nothing noticeable beside it, in
 * metres, and where it starts. The route's two ends are its stops. */
export function longestEmpty(path: readonly Readonly<Vec3>[], marks: readonly Noticeable[]): { gap: number; from: number; seen: { id: string; s: number }[] } {
  const seen = marks.map(m => ({ id: m.id, ...alongRoute(path, m), reach: m.reach })).filter(m => m.off <= m.reach)
    .map(m => ({ id: m.id, s: m.s })).sort((a, b) => a.s - b.s);
  const length = alongRoute(path, path[0]!).length, stops = [0, ...seen.map(m => m.s), length];
  let gap = 0, from = 0;
  for (let i = 1; i < stops.length; i++) if (stops[i]! - stops[i - 1]! > gap) { gap = stops[i]! - stops[i - 1]!; from = stops[i - 1]!; }
  return { gap, from, seen };
}
