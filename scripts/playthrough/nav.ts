/** Diver navigation between the dry refuges and open water, from authored legs:
 * the pod ramp and the workshop apron are the only land/water transitions the
 * harness uses; everything else is surface transit plus a vertical dive. */
import { inCanopyAir, nearPod, nearWorkshop } from "../../src/sim/inventory.js";
import { CANOPY_BASIN_ROUTE } from "../../src/content/routes.js";
import type { Vec3 } from "../../src/sim/types.js";
import { Blocked, Driver, where } from "./driver.js";
import { route, travel } from "./travel.js";
import type { Waypoint } from "./travel.js";

export type Refuge = "pod" | "workshop";

/** Authored legs, checked only by playing them (they are short and shallow). */
const POD_OUT: Waypoint[] = [{ x: 0, y: 0.18, z: 12, land: true }, { x: 0, y: 0, z: 5.5, land: true }, { x: 0, y: -0.5, z: 2.5 }];
const POD_IN: Waypoint[] = [{ x: 0, y: -0.5, z: 3 }, { x: 0, y: 0, z: 6.5, land: true }, { x: 0, y: 0.18, z: 12, land: true }];
const POD_BENCH: Waypoint = { x: 0.6, y: 0.18, z: 19.6, land: true, tolerance: 0.3 };
const WORKSHOP_OUT: Waypoint[] = [{ x: 10, y: 1.2, z: -31, land: true }, { x: 10, y: 0, z: -27.5, land: true }, { x: 10, y: -0.5, z: -25.5 }];
const WORKSHOP_IN: Waypoint[] = [{ x: 10, y: -0.5, z: -25.5 }, { x: 10, y: 0, z: -28.5, land: true }, { x: 10, y: 1.2, z: -32, land: true }];
const WORKSHOP_BENCH: Waypoint = { x: 10, y: 1.2, z: -35.2, land: true, tolerance: 0.3 };
/** S2's headland landing (isles.headland_landing) and the 0.55 m/m slope up to the
 * field shelter's terrace (C3): the only shore the harness walks besides the
 * pod ramp and the workshop apron. */
export const HEADLAND_IN: Waypoint[] = [{ x: 946, y: -0.5, z: -14 }, { x: 954.2, y: 0.71, z: -12.3, land: true },
  { x: 966.4, y: 6.89, z: -9.7, land: true }, { x: 976, y: 9.86, z: -11.5, land: true },
  // Round to the shelter hut's one door, in its south wall (x 982.6..984.4).
  { x: 983.5, y: 10, z: -11.5, land: true }, { x: 983.5, y: 10, z: -7.5, land: true }];
const HEADLAND_OUT: Waypoint[] = [...HEADLAND_IN].reverse().map((p, i, all) => i === all.length - 1 ? { ...p, land: false } : { ...p });
export const nearHeadland = (p: { x: number; z: number }): boolean => Math.hypot(p.x - 970, p.z + 8) < 40;

export const inPod = (d: Driver): boolean => nearPod(d.state);
export const atWorkshop = (d: Driver): boolean => nearWorkshop(d.state);
const ashore = (d: Driver): boolean => d.state.player.mode === "walking" && !d.state.player.controlledVehicleId;

/** Leave whichever refuge the diver stands in, ending afloat at the surface. */
export function toWater(d: Driver): void {
  if (d.state.player.mode !== "walking") return;
  const p = d.state.player.pose.position;
  if (inCanopyAir(d.state)) travel(d, route("laboratory out", "diver", "B1 lab entry reversed, played",
    [{ ...CANOPY_BASIN_ROUTE.labDiverInside, land: true }, { ...CANOPY_BASIN_ROUTE.labDiverEntry }]));
  else if (p.z > 4) travel(d, route("pod ramp out", "diver", "authored pod ramp, played", POD_OUT));
  else if (p.z < -24 && p.x > -5 && p.x < 25) travel(d, route("workshop apron out", "diver", "authored apron, played", WORKSHOP_OUT));
  else if (nearHeadland(p)) travel(d, route("headland landing out", "diver", "S2 headland landing, played", HEADLAND_OUT));
  else throw new Blocked("Walking somewhere with no authored water entry", where(d.state));
}

/** Rise to the surface straight up from where the diver is. */
export function surface(d: Driver): void {
  const p = d.state.player.pose.position;
  if (d.state.player.mode === "swimming" && p.y < -0.8)
    travel(d, route("ascend", "diver", "vertical ascent, played", [{ x: p.x, y: -0.5, z: p.z }]));
}

const SURFACE_Y = -0.5;
const SWIM = { radius: 0.34, height: 0.95 };
/** Open surface water: the swimming capsule clears every solid and rib, with water under it. */
const swimmable = (d: Driver, x: number, z: number): boolean =>
  [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]].every(([ox, oz]) =>
    d.world.groundHeight(x + ox!, z + oz!) < -1.3 && d.world.supportHeight(x + ox!, z + oz!, SURFACE_Y) < -1.9) &&
  d.world.clearance({ x, y: SURFACE_Y, z }, { radius: SWIM.radius + 0.4, height: SWIM.height });
/** A* over a horizontal grid of `cell` metres, then shortcut by straight clear
 * segments. `open(x, z)` is a read-only world query; the path is played afterwards. */
export function gridPath(from: Vec3, to: Vec3, y: number, cell: number, pad: number,
  open: (x: number, z: number) => boolean, label: string, pass?: (x: number, z: number) => boolean): Vec3[] {
  const a = { x: from.x, y, z: from.z }, b = { x: to.x, y, z: to.z };
  const clear = (p: Vec3, q: Vec3): boolean => {
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (cell / 4)));
    for (let i = 0; i <= n; i++) if (!open(p.x + (q.x - p.x) * i / n, p.z + (q.z - p.z) * i / n)) return false;
    return true;
  };
  const edge = (p: Vec3, q: Vec3): boolean => {
    for (let i = 1; i < 8; i++) if (!pass!(p.x + (q.x - p.x) * i / 8, p.z + (q.z - p.z) * i / 8)) return false;
    return true;
  };
  if (clear(a, b)) return [b];
  const minX = Math.min(a.x, b.x) - pad, minZ = Math.min(a.z, b.z) - pad;
  const w = Math.ceil((Math.abs(a.x - b.x) + 2 * pad) / cell) + 1, h = Math.ceil((Math.abs(a.z - b.z) + 2 * pad) / cell) + 1;
  const key = (i: number, j: number): number => j * w + i;
  const at = (i: number, j: number): Vec3 => ({ x: minX + i * cell, y, z: minZ + j * cell });
  const cache = new Map<number, boolean>();
  const ok = (i: number, j: number): boolean => {
    const k = key(i, j);
    if (!cache.has(k)) { const p = at(i, j); cache.set(k, open(p.x, p.z)); }
    return cache.get(k)!;
  };
  const snap = (p: Vec3): [number, number] => [Math.round((p.x - minX) / cell), Math.round((p.z - minZ) / cell)];
  const [si, sj] = snap(a), [ti, tj] = snap(b);
  const g = new Map<number, number>([[key(si, sj), 0]]), came = new Map<number, number>();
  const frontier: [number, number, number][] = [[Math.hypot(ti - si, tj - sj), si, sj]];
  let found = false;
  while (frontier.length && !found) {
    frontier.sort((p, q) => q[0] - p[0]);
    const [, i, j] = frontier.pop()!;
    if (i === ti && j === tj) { found = true; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h || !(ok(ni, nj) || (ni === ti && nj === tj))) continue;
      // Two open cells with a thin wall between (a cradle side) are not neighbours.
      if (pass && !edge(at(i, j), at(ni, nj))) continue;
      const cost = g.get(key(i, j))! + Math.hypot(di, dj);
      if (cost < (g.get(key(ni, nj)) ?? Infinity)) {
        g.set(key(ni, nj), cost); came.set(key(ni, nj), key(i, j));
        frontier.push([cost + Math.hypot(ti - ni, tj - nj), ni, nj]);
      }
    }
  }
  if (!found) throw new Blocked(`No open ${label} route to (${to.x.toFixed(1)}, ${to.z.toFixed(1)})`);
  const cells: Vec3[] = [];
  for (let k: number | undefined = key(ti, tj); k !== undefined; k = came.get(k)) cells.unshift(at(k % w, Math.floor(k / w)));
  cells[0] = a; cells[cells.length - 1] = b;
  const out: Vec3[] = [];
  let anchor = a;
  for (let i = 1; i < cells.length; i++)
    if (!clear(anchor, cells[i]!)) { anchor = cells[i - 1]!; out.push({ ...anchor }); }
  out.push(b);
  return out;
}

/** Surface route over open water (2 m grid). */
export function surfacePath(d: Driver, from: Vec3, to: Vec3): Waypoint[] {
  try {
    return gridPath(from, to, SURFACE_Y, 2, 40, (x, z) => swimmable(d, x, z), "surface",
      (x, z) => d.world.clearance({ x, y: SURFACE_Y, z }, { radius: SWIM.radius, height: SWIM.height }))
      .map((p, i, all) => i < all.length - 1 ? { ...p, tolerance: 0.6 } : p);
  } catch (e) {
    throw e instanceof Blocked ? new Blocked(e.message, where(d.state)) : e;
  }
}

/** Swim at the surface to above `point`. */
export function surfaceTo(d: Driver, point: Vec3): void {
  toWater(d);
  surface(d);
  const path = surfacePath(d, d.state.player.pose.position, point);
  path[path.length - 1]!.tolerance = 1;
  travel(d, route("surface transit", "diver", "surface A* over open water, played", path));
}

/** Back into a refuge and up to its bench. */
export function enter(d: Driver, refuge: Refuge): void {
  if (refuge === "pod" ? inPod(d) && ashore(d) : atWorkshop(d) && ashore(d)) {
    travel(d, route(`${refuge} bench`, "diver", "authored, played", [refuge === "pod" ? POD_BENCH : WORKSHOP_BENCH]));
    return;
  }
  const entry = refuge === "pod" ? POD_IN : WORKSHOP_IN;
  surfaceTo(d, entry[0]!);
  travel(d, route(`${refuge} entry`, "diver", "authored, played", entry));
  travel(d, route(`${refuge} bench`, "diver", "authored, played", [refuge === "pod" ? POD_BENCH : WORKSHOP_BENCH]));
}

/** Breathe at the surface until the suit is full. */
export function breathe(d: Driver): void {
  if (d.state.player.vitals.oxygen < 99.5) d.waitFor("air at the surface", 10, (s) => s.player.vitals.oxygen >= 99.5);
}
