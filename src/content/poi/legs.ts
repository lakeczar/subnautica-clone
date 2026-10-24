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

/** Something a pilot on the route notices: where it shows (its lights, or
 * the thing itself when unlit) and from how far it can be seen in 3D (a lit
 * point of interest further than an unlit site in deep water). One mark is
 * one thing noticed, however many lights it has. */
export interface Noticeable { readonly id: string; readonly points: readonly Readonly<Vec3>[]; readonly reach: number }
type Floor = (x: number, z: number) => number;

/** Clear water from `a` to `b` over the terrain (sampled every 2 m; the last
 * 3 m before `b` are its own footing). */
export function lineOfSight(a: Readonly<Vec3>, b: Readonly<Vec3>, floor: Floor): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.ceil(len / 2);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (len * (1 - t) < 3) break;
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    if (floor(x, z) > y + 0.5) return false;
  }
  return true;
}
/** The route sampled every `step` metres of 3D length. */
export function routeSamples(path: readonly Readonly<Vec3>[], step = 5): { s: number; p: Vec3 }[] {
  const out: { s: number; p: Vec3 }[] = [];
  let acc = 0, next = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    for (; next <= acc + l; next += step) { const t = l ? (next - acc) / l : 0; out.push({ s: next, p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t } }); }
    acc += l;
  }
  const end = path[path.length - 1]!;
  if (!out.length || out[out.length - 1]!.s < acc) out.push({ s: acc, p: { ...end } });
  return out;
}

/** The longest stretch of the route between two things noticed, in metres,
 * and where it starts. A mark is noticed where the route passes nearest to
 * it, among the route samples from which one of its points is within its
 * reach (3D) and in line of sight over the terrain; a mark never in reach and
 * sight is not noticed at all. The route's two ends are its stops. */
export function longestEmpty(path: readonly Readonly<Vec3>[], marks: readonly Noticeable[], floor: Floor, step = 5): { gap: number; from: number; seen: { id: string; s: number }[] } {
  const samples = routeSamples(path, step), seen: { id: string; s: number }[] = [];
  for (const m of marks) {
    let best = Infinity, at = -1;
    for (const { s, p } of samples) for (const q of m.points) {
      const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      if (d <= m.reach && d < best && lineOfSight(p, q, floor)) { best = d; at = s; }
    }
    if (at >= 0) seen.push({ id: m.id, s: at });
  }
  seen.sort((a, b) => a.s - b.s);
  const stops = [0, ...seen.map(m => m.s), samples[samples.length - 1]!.s];
  let gap = 0, from = 0;
  for (let i = 1; i < stops.length; i++) if (stops[i]! - stops[i - 1]! > gap) { gap = stops[i]! - stops[i - 1]!; from = stops[i - 1]!; }
  return { gap, from, seen };
}
