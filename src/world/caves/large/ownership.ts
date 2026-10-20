import type { Aabb, Rect } from "../../types.js";

/** Which space a cave biome owns (Babylon-free; shared by the field, the
 * collision store and the world-query composer).
 *
 * Inside its domain the cave owns every point of a collar rectangle, and
 * every point below the cap elsewhere: the lowest of the four lattice
 * seabed samples round (x, z), less `roofMin`. Everywhere else the exterior
 * heightfield rules. The seabed lattice is plain data (a bake can store it),
 * so collision answers ownership without the authored field. */
export interface CaveOwnership {
  readonly domain: Aabb;
  readonly collars: readonly Rect[];
  readonly roofMin: number;
  /** Lattice spacing of `ground`, metres. */
  readonly voxel: number;
  readonly gx: number;
  readonly gz: number;
  /** Seabed at domain.min + (i, k) * voxel, X fastest. */
  readonly ground: Float32Array;
}

export function createOwnership(domain: Aabb, collars: readonly Rect[], roofMin: number, voxel: number,
  floor: (x: number, z: number) => number): CaveOwnership {
  const gx = Math.round((domain.max.x - domain.min.x) / voxel) + 1, gz = Math.round((domain.max.z - domain.min.z) / voxel) + 1;
  const ground = new Float32Array(gx * gz);
  for (let k = 0; k < gz; k++) for (let i = 0; i < gx; i++) ground[i + gx * k] = floor(domain.min.x + i * voxel, domain.min.z + k * voxel);
  return { domain, collars, roofMin, voxel, gx, gz, ground };
}

export const inRect = (r: Rect, x: number, z: number): boolean => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ;
export function collarAt(o: CaveOwnership, x: number, z: number): Rect | null {
  for (const r of o.collars) if (inRect(r, x, z)) return r;
  return null;
}
/** Owned top at (x, z): the domain top in a collar, else the cap. */
export function capAt(o: CaveOwnership, x: number, z: number): number {
  const d = o.domain;
  if (collarAt(o, x, z)) return d.max.y;
  const fi = Math.max(0, Math.min(o.gx - 2, Math.floor((x - d.min.x) / o.voxel)));
  const fk = Math.max(0, Math.min(o.gz - 2, Math.floor((z - d.min.z) / o.voxel)));
  const g = o.ground, at = fi + o.gx * fk;
  return Math.min(d.max.y, Math.min(g[at]!, g[at + 1]!, g[at + o.gx]!, g[at + o.gx + 1]!) - o.roofMin);
}
export function owns(o: CaveOwnership, x: number, y: number, z: number): boolean {
  const d = o.domain;
  if (x < d.min.x || y < d.min.y || z < d.min.z || x > d.max.x || y > d.max.y || z > d.max.z) return false;
  return y <= capAt(o, x, z);
}
/** Whether a box reaches owned space. Exact for collars; for the deep part
 * it compares the box bottom with the highest cap at its corners and centre
 * (caps vary slowly; actors are small against the 4 m roof margin). */
export function boxTouchesOwned(o: CaveOwnership, b: Aabb): boolean {
  const d = o.domain;
  if (b.max.x < d.min.x || b.min.x > d.max.x || b.max.y < d.min.y || b.min.y > d.max.y || b.max.z < d.min.z || b.min.z > d.max.z) return false;
  for (const r of o.collars) if (b.min.x < r.maxX && b.max.x > r.minX && b.min.z < r.maxZ && b.max.z > r.minZ) return true;
  const xs = [b.min.x, (b.min.x + b.max.x) / 2, b.max.x], zs = [b.min.z, (b.min.z + b.max.z) / 2, b.max.z];
  let cap = -Infinity;
  for (const x of xs) for (const z of zs) cap = Math.max(cap, capAt(o, Math.max(d.min.x, Math.min(d.max.x, x)), Math.max(d.min.z, Math.min(d.max.z, z))));
  return b.min.y <= cap;
}
