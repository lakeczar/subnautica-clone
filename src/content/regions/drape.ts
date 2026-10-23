import type { Vec3 } from "../../world/types.js";
import type { FloorFunction } from "./terrain.js";
import { cachedBuild, floorKey } from "../buildCache.js";
import { worldFloor } from "./worldFloor.js";

/** Highest floor under a circular footprint: centre, rim and an inner ring
 * (a superset of the eight rim samples sim `hullFloor` uses). */
export function footprintFloor(floor: FloorFunction, x: number, z: number, radius: number): number {
  let h = floor(x, z);
  if (radius < 0.5) return h;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    h = Math.max(h, floor(x + Math.cos(a) * radius, z + Math.sin(a) * radius));
    const b = (i + 0.5) * Math.PI / 4;
    h = Math.max(h, floor(x + Math.cos(b) * radius * 0.6, z + Math.sin(b) * radius * 0.6));
  }
  return h;
}

/** Lay an authored keel line over the shared floor: densify to `step` m and
 * raise (never lower) each point to `clearance` above the highest floor
 * within `radius` of it and its neighbours. Authored waypoints keep their
 * X/Z and their depth wherever the water is already deep enough, so moorings
 * and parking pockets stay exact. Deterministic: same floor, same line. */
export function drape(path: readonly Readonly<Vec3>[], radius: number, clearance: number,
  floor: FloorFunction = worldFloor, step = 6): Vec3[] {
  return cachedBuild(floorKey("drape", floor, [path, radius, clearance, step], import.meta.url),
    () => drapeOver(path, radius, clearance, floor, step));
}

function drapeOver(path: readonly Readonly<Vec3>[], radius: number, clearance: number,
  floor: FloorFunction, step: number): Vec3[] {
  const dense: Vec3[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!, b = path[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  if (path.length) dense.push({ ...path.at(-1)! });
  const ground = dense.map((p, i) => {
    let h = footprintFloor(floor, p.x, p.z, radius);
    for (const j of [i - 1, i + 1]) {
      const q = dense[j];
      if (!q) continue;
      h = Math.max(h, footprintFloor(floor, (p.x + q.x) / 2, (p.z + q.z) / 2, radius));
    }
    return h;
  });
  return dense.map((p, i) => ({ x: p.x, y: Math.max(p.y, ground[i]! + clearance), z: p.z }));
}
