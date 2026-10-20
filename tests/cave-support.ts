// Shared fixtures for the cave tests (not a test file itself).
import { caveDef, withCaveFloors, type CaveDef, type CavePortal } from "../src/content/regions/caves.js";
import { caveShell, caveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { createWorldQueries, type Solid } from "../src/sim/world.js";
import { caveOwner, createCaveWorldQueries } from "../src/sim/caveWorld.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { boxDistance } from "../src/world/frame.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import type { Rect } from "../src/world/types.js";

export const def = caveDef("fanvault", worldFloor);
export const source = def.source;
export const DIVER: Capsule = CRAFT_PROFILES.diver;
export const SMALL: Capsule = CRAFT_PROFILES.small;
export const fine = caveShell(def, "fine"), coarse = caveShell(def, "coarse");
// The baseline's WORLD_BOUNDS still ends at the legacy route rectangle; C3
// widens it to the S1 envelope. Until then the physical checks run in a frame
// shifted into it. Sweeps, support and clearance are translation-invariant.
export const SHIFT = { x: 300, y: 0, z: 90 };
export const shift = (p: Readonly<Vec3>): Vec3 => ({ x: p.x + SHIFT.x, y: p.y, z: p.z + SHIFT.z });
export const shiftSolid = (s: Solid): Solid => ({ id: s.id, min: shift(s.min), max: shift(s.max) });
export const shiftRect = (r: Rect): Rect => ({ minX: r.minX + SHIFT.x, maxX: r.maxX + SHIFT.x, minZ: r.minZ + SHIFT.z, maxZ: r.maxZ + SHIFT.z });
export const shiftedFloor = (x: number, z: number): number => worldFloor(x - SHIFT.x, z - SHIFT.z);
/** The prototype ownership adapter over the shifted cave, plus `extra`
 * exterior solids (given in world coordinates). */
export function worldWith(extra: readonly Solid[] = []) {
  const owner = caveOwner(def);
  return createCaveWorldQueries({ solids: extra.map(shiftSolid), floor: shiftedFloor, guards: [shiftRect(LEGACY_PRESERVE)],
    caves: [{ ...owner, footprint: shiftRect(owner.footprint), rock: owner.rock.map(shiftSolid) }] });
}
export const world = worldWith();
/** The R1 floor-wrapper-only world, kept to show what it misses. */
export const caveFloor = withCaveFloors(worldFloor);
export const wrapperWorld = createWorldQueries(def.rock.map(shiftSolid), (x, z) => caveFloor(x - SHIFT.x, z - SHIFT.z));

// The rock on a 2 m X/Z bucket grid, for the many point queries below.
const BUCKET = 2, buckets = new Map<number, Solid[]>();
const bucketKey = (i: number, k: number): number => (i + 10000) * 20000 + (k + 10000);
for (const s of def.rock)
  for (let i = Math.floor(s.min.x / BUCKET); i <= Math.floor(s.max.x / BUCKET); i++)
    for (let k = Math.floor(s.min.z / BUCKET); k <= Math.floor(s.max.z / BUCKET); k++)
      (buckets.get(bucketKey(i, k)) ?? buckets.set(bucketKey(i, k), []).get(bucketKey(i, k))!).push(s);
export function nearRock(p: Readonly<Vec3>, reach: number, visit: (s: Solid) => boolean | void): void {
  const seen = new Set<Solid>();
  for (let i = Math.floor((p.x - reach) / BUCKET); i <= Math.floor((p.x + reach) / BUCKET); i++)
    for (let k = Math.floor((p.z - reach) / BUCKET); k <= Math.floor((p.z + reach) / BUCKET); k++)
      for (const s of buckets.get(bucketKey(i, k)) ?? []) if (!seen.has(s)) { seen.add(s); if (visit(s)) return; }
}

export const inside = (p: Readonly<Vec3>, s: Solid, margin = 1e-9): boolean =>
  p.x > s.min.x + margin && p.x < s.max.x - margin && p.y > s.min.y + margin && p.y < s.max.y - margin &&
  p.z > s.min.z + margin && p.z < s.max.z - margin;
export const inRock = (p: Readonly<Vec3>): boolean => { let hit = false; nearRock(p, 0, s => (hit = inside(p, s))); return hit; };
export const rockDistance = (p: Readonly<Vec3>, reach = 1): number => {
  let best = Infinity;
  nearRock(p, reach, s => { best = Math.min(best, boxDistance(s, p)); return best === 0; });
  return best;
};
export const vertex = (m: MeshRecipe, v: number): Vec3 => ({ x: m.positions[v * 3]!, y: m.positions[v * 3 + 1]!, z: m.positions[v * 3 + 2]! });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const area = (m: MeshRecipe): number => {
  let total = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = vertex(m, m.indices[t]!), n = cross(sub(vertex(m, m.indices[t + 1]!), a), sub(vertex(m, m.indices[t + 2]!), a));
    total += Math.hypot(n.x, n.y, n.z) / 2;
  }
  return total;
};
/** Segment p→q against a triangle (Möller–Trumbore), inclusive. */
export function segmentHitsTriangle(p: Vec3, q: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const s = sub(p, a), u = dot(s, h) / det;
  if (u < 0 || u > 1) return false;
  const r = cross(s, e1), v = dot(d, r) / det;
  if (v < 0 || u + v > 1) return false;
  const t = dot(e2, r) / det;
  return t >= 0 && t <= 1;
}
/** Closest distance from a point to a triangle (Ericson, Real-Time Collision Detection 5.1.5). */
export function pointTriangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const at = (u: number, v: number): number => {
    const x = { x: a.x + ab.x * u + ac.x * v, y: a.y + ab.y * u + ac.y * v, z: a.z + ab.z * u + ac.z * v };
    return Math.hypot(p.x - x.x, p.y - x.y, p.z - x.z);
  };
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return at(1 - w, w); }
  const denom = 1 / (va + vb + vc);
  return at(vb * denom, vc * denom);
}
/** Triangles bucketed on a 2 m grid, for local queries against a whole shell. */
export function triangleGrid(m: MeshRecipe): (p: Vec3, reach: number) => [Vec3, Vec3, Vec3][] {
  const cell = 2, buckets = new Map<string, number[]>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const vs = [0, 1, 2].map(k => vertex(m, m.indices[t + k]!));
    const lo = (a: "x" | "y" | "z"): number => Math.floor(Math.min(...vs.map(v => v[a])) / cell);
    const hi = (a: "x" | "y" | "z"): number => Math.floor(Math.max(...vs.map(v => v[a])) / cell);
    for (let i = lo("x"); i <= hi("x"); i++) for (let j = lo("y"); j <= hi("y"); j++) for (let k = lo("z"); k <= hi("z"); k++) {
      const key = `${i},${j},${k}`;
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(t);
    }
  }
  return (p, reach) => {
    const seen = new Set<number>(), out: [Vec3, Vec3, Vec3][] = [];
    for (let i = Math.floor((p.x - reach) / cell); i <= Math.floor((p.x + reach) / cell); i++)
      for (let j = Math.floor((p.y - reach) / cell); j <= Math.floor((p.y + reach) / cell); j++)
        for (let k = Math.floor((p.z - reach) / cell); k <= Math.floor((p.z + reach) / cell); k++)
          for (const t of buckets.get(`${i},${j},${k}`) ?? []) if (!seen.has(t)) {
            seen.add(t); out.push([vertex(m, m.indices[t]!), vertex(m, m.indices[t + 1]!), vertex(m, m.indices[t + 2]!)]);
          }
    return out;
  };
}
export const shells = { fine, coarse };
export const grids = { fine: triangleGrid(fine), coarse: triangleGrid(coarse) };
/** Points over a portal's clear rectangle, inset by `inset`, every 0.25 m. */
export function aperture(p: CavePortal, inset = 0): Vec3[] {
  const out: Vec3[] = [], w = p.clear.width / 2 - inset, h = p.clear.height / 2 - inset;
  for (let a = -w; a <= w + 1e-9; a += 0.25) for (let b = -h; b <= h + 1e-9; b += 0.25)
    out.push(p.normal.y !== 0 ? { x: p.center.x + a, y: p.center.y, z: p.center.z + b }
      : p.normal.z !== 0 ? { x: p.center.x + a, y: p.center.y + b, z: p.center.z } : { x: p.center.x, y: p.center.y + b, z: p.center.z + a });
  return out;
}
export const loop = def.routes.find(r => r.role === "loop")!;
export const insideFootprint = (p: Vec3): boolean => {
  const f = def.replacementFootprints[0]!;
  return p.x > f.minX && p.x < f.maxX && p.z > f.minZ && p.z < f.maxZ;
};
export const skylight = source.carves.find(c => c.kind === "shaft")!;
/** Within 2.5 m of a mouth's plane: the lintel and sill zone, open by design. */
export const nearMouth = (p: Vec3): boolean => def.portals.some(m => m.kind === "mouth" &&
  Math.abs((p.z - m.center.z) * m.normal.z + (p.x - m.center.x) * m.normal.x) < 2.5);
/** Inside the skylight's actual top aperture (shaft radius, flare and
 * wobble), plus `margin`: the only columns allowed to see the sky. */
export const underSkylight = (p: Vec3, margin = 0.5): boolean => skylight.kind === "shaft" &&
  Math.hypot(p.x - skylight.center[0], p.z - skylight.center[1]) <= skylight.radius + skylight.flare + skylight.wobble + margin;
/** Interfaces where cave water meets open water straight above it, outside
 * the skylight shaft's own water and the mouths' lintel zones: roof holes. */
export function roofHoles(d: CaveDef): Vec3[] {
  const v = caveVolume(d), g = v.grid, shaft = d.rooms.findIndex(r => r.role === "shaft") + 1, holes: Vec3[] = [];
  const mouthZone = (p: Vec3): boolean => d.portals.some(m => m.kind === "mouth" &&
    Math.abs((p.z - m.center.z) * m.normal.z + (p.x - m.center.x) * m.normal.x) < 2.5 &&
    Math.abs(m.normal.z !== 0 ? p.x - m.center.x : p.z - m.center.z) < m.clear.width / 2 + 2 && p.y < m.center.y + m.clear.height / 2 + 2.5);
  for (let k = 0; k < g.nz; k++) for (let j = 0; j + 1 < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const at = i + g.nx * (j + g.ny * k), up = at + g.nx;
    const r = v.room[at]!;
    if (!r || v.solid[up] || v.room[up] || r === shaft) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (!mouthZone(p)) holes.push(p);
  }
  return holes;
}
/** The room holding a point, from the generated voxels ("" outside the cave). */
export function roomAt(p: Vec3): string {
  const v = caveVolume(def), g = v.grid;
  const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return "";
  const r = v.room[i + g.nx * (j + g.ny * k)]!;
  return r ? v.roomIds[r - 1]! : "";
}
/** Probe columns over the cave: the loop's inside points and every room's centre. */
export const probes: Vec3[] = [
  ...def.routes.flatMap(r => r.path).filter(insideFootprint),
  ...def.rooms.filter(r => r.role !== "shaft").map(r => ({ x: (r.bounds.min.x + r.bounds.max.x) / 2,
    y: r.bounds.min.y + 1.2, z: (r.bounds.min.z + r.bounds.max.z) / 2 })),
].map(p => ({ ...p, x: Math.floor(p.x * 2) / 2 + 0.25, z: Math.floor(p.z * 2) / 2 + 0.25 })) // voxel column centres, off the box lattice
  .filter(p => roomAt({ ...p, y: p.y + 0.5 }) !== "" && !underSkylight(p) && !nearMouth(p) && world.clearance(shift(p), DIVER));

