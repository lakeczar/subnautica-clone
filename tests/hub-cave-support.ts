// Shared fixtures for the W2 hub cave tests (not a test file itself): the
// W1 kit's Fanvault checks, generalised over any built cave.
import { caveDef, EXTERIOR, type CaveDef, type CavePortal } from "../src/content/regions/caves.js";
import { caveShell, caveVolume, type CaveVolume } from "../src/content/regions/caveGeometry.js";
import { HUB_CAVE_SOURCES } from "../src/content/regions/hubCaves.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { caveDaylight, caveLightField, sampleLightField, type CaveLightField } from "../src/render/caves/lightField.js";
import type { Solid } from "../src/sim/world.js";
import type { Capsule, Vec3, WorldQueries } from "../src/sim/types.js";
import { boxDistance } from "../src/world/frame.js";
import type { MeshRecipe } from "../src/render/kit/types.js";

export const DIVER: Capsule = CRAFT_PROFILES.diver;
export const SMALL: Capsule = CRAFT_PROFILES.small;
export const HUB_CAVES: readonly CaveDef[] = HUB_CAVE_SOURCES.map(s => caveDef(s.id, worldFloor));

/** Point queries over one cave's rock, bucketed on a 2 m X/Z grid. */
export interface RockIndex {
  inRock(p: Readonly<Vec3>): boolean;
  distance(p: Readonly<Vec3>, reach?: number): number;
}
export function rockIndex(def: CaveDef): RockIndex {
  const BUCKET = 2, buckets = new Map<number, Solid[]>();
  const key = (i: number, k: number): number => (i + 10000) * 20000 + (k + 10000);
  for (const s of def.rock)
    for (let i = Math.floor(s.min.x / BUCKET); i <= Math.floor(s.max.x / BUCKET); i++)
      for (let k = Math.floor(s.min.z / BUCKET); k <= Math.floor(s.max.z / BUCKET); k++)
        (buckets.get(key(i, k)) ?? buckets.set(key(i, k), []).get(key(i, k))!).push(s);
  const near = (p: Readonly<Vec3>, reach: number, visit: (s: Solid) => boolean | void): void => {
    const seen = new Set<Solid>();
    for (let i = Math.floor((p.x - reach) / BUCKET); i <= Math.floor((p.x + reach) / BUCKET); i++)
      for (let k = Math.floor((p.z - reach) / BUCKET); k <= Math.floor((p.z + reach) / BUCKET); k++)
        for (const s of buckets.get(key(i, k)) ?? []) if (!seen.has(s)) { seen.add(s); if (visit(s)) return; }
  };
  const inside = (p: Readonly<Vec3>, s: Solid): boolean => p.x > s.min.x && p.x < s.max.x && p.y > s.min.y && p.y < s.max.y &&
    p.z > s.min.z && p.z < s.max.z;
  return {
    inRock: p => { let hit = false; near(p, 0, s => (hit = inside(p, s))); return hit; },
    distance: (p, reach = 1) => { let best = Infinity; near(p, reach, s => { best = Math.min(best, boxDistance(s, p)); return best === 0; }); return best; },
  };
}

export const vertex = (m: MeshRecipe, v: number): Vec3 => ({ x: m.positions[v * 3]!, y: m.positions[v * 3 + 1]!, z: m.positions[v * 3 + 2]! });
export const fineShell = (def: CaveDef): MeshRecipe => caveShell(def, "fine");

/** Voxel lookups on the generated occupancy. */
export function voxelAt(v: CaveVolume, p: Readonly<Vec3>): number {
  const g = v.grid;
  const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return -1;
  return i + g.nx * (j + g.ny * k);
}
/** The room holding a point ("" outside the cave's water). */
export function roomAt(def: CaveDef, p: Readonly<Vec3>): string {
  const v = caveVolume(def), at = voxelAt(v, p);
  return at < 0 || !v.room[at] ? "" : v.roomIds[v.room[at]! - 1]!;
}
export const solidAt = (def: CaveDef, p: Readonly<Vec3>): boolean => {
  const v = caveVolume(def), at = voxelAt(v, p);
  return at >= 0 && !!v.solid[at];
};

/** Points over a portal's clear rectangle, inset by `inset`, every 0.25 m. */
export function aperture(p: CavePortal, inset = 0): Vec3[] {
  const out: Vec3[] = [], w = p.clear.width / 2 - inset, h = p.clear.height / 2 - inset;
  for (let a = -w; a <= w + 1e-9; a += 0.25) for (let b = -h; b <= h + 1e-9; b += 0.25)
    out.push(p.normal.y !== 0 ? { x: p.center.x + a, y: p.center.y, z: p.center.z + b }
      : p.normal.z !== 0 ? { x: p.center.x + a, y: p.center.y + b, z: p.center.z } : { x: p.center.x, y: p.center.y + b, z: p.center.z + a });
  return out;
}
export const openings = (def: CaveDef): CavePortal[] => def.portals.filter(p => p.kind === "mouth" || p.kind === "skylight");

/** Within an opening's zone: under an upward mouth's disc, or in a side
 * mouth's lintel band (2.5 m either side of its plane). Open by design. */
function openingZone(def: CaveDef, p: Readonly<Vec3>): boolean {
  return openings(def).some(m => m.normal.y !== 0
    ? Math.hypot(p.x - m.center.x, p.z - m.center.z) < m.clear.width / 2 + 2.5
    : Math.abs((p.z - m.center.z) * m.normal.z + (p.x - m.center.x) * m.normal.x) < 3 &&
      Math.abs(m.normal.z !== 0 ? p.x - m.center.x : p.z - m.center.z) < m.clear.width / 2 + 2.5 &&
      p.y < m.center.y + m.clear.height / 2 + 3);
}
/** Cave water meeting open exterior water straight above it outside an
 * opening's zone: a hole in the roof. */
export function roofHoles(def: CaveDef): Vec3[] {
  const v = caveVolume(def), g = v.grid, holes: Vec3[] = [];
  for (let k = 0; k < g.nz; k++) for (let j = 0; j + 1 < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const at = i + g.nx * (j + g.ny * k), up = at + g.nx;
    if (!v.room[at] || v.solid[up] || v.room[up]) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (!openingZone(def, p)) holes.push(p);
  }
  return holes;
}

/** Rooms joined by throats and mouths: is there a cycle among the rooms? */
export function roomGraph(def: CaveDef): { exits: number; cycle: boolean; connected: boolean } {
  const rooms = def.rooms.map(r => r.id), parent = new Map(rooms.map(r => [r, r] as const));
  const find = (r: string): string => parent.get(r) === r ? r : find(parent.get(r)!);
  let cycle = false;
  for (const p of def.portals) {
    const [a, b] = p.between;
    if (a === EXTERIOR || b === EXTERIOR) continue;
    const ra = find(a), rb = find(b);
    if (ra === rb) cycle = true; else parent.set(ra, rb);
  }
  return { exits: openings(def).length, cycle, connected: new Set(rooms.map(find)).size === 1 };
}

/** The lamp-off retreat (W1's policy): from the current pose, among water
 * in clear sight within 7 m whose path-length glow is brighter, take the
 * brightest one the full diver can actually reach (it clears and the sweep
 * from the last accepted pose arrives). Success is clear lit exterior water
 * entered through a mouth. */
export function retreat(def: CaveDef, q: WorldQueries, starts: readonly Vec3[]): { failures: string[]; exits: Record<string, number>; hops: number } {
  const field: CaveLightField = caveLightField(def, worldFloor), v = caveVolume(def), g = v.grid;
  const head = (p: Vec3): Vec3 => ({ ...p, y: p.y + 0.6 });
  const glow = (p: Vec3): number => { const c = sampleLightField(field, p); return caveDaylight(c.r, 0, c.a); };
  const exterior = (p: Vec3): boolean => roomAt(def, p) === "" && roomAt(def, head(p)) === "" && roomAt(def, { ...p, y: p.y + 0.95 }) === "";
  const rank = (p: Vec3): number => glow(head(p)) + (exterior(p) ? 0.01 : 0);
  const clearSight = (a: Vec3, b: Vec3): boolean => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.25);
    for (let s = 1; s < steps; s++) {
      const t = s / steps, at = voxelAt(v, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      if (at >= 0 && v.solid[at]) return false;
    }
    return true;
  };
  // Candidate spots: water voxels (every other one) a diver fits in.
  const spots: { p: Vec3; rank: number }[] = [];
  for (let k = 0; k < g.nz; k += 2) for (let j = 0; j < g.ny; j += 2) for (let i = 0; i < g.nx; i += 2) {
    if (v.solid[i + g.nx * (j + g.ny * k)]) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (p.y > worldFloor(p.x, p.z) + 12 && !v.room[i + g.nx * (j + g.ny * k)]) continue; // open water well above the rock
    if (q.clearance(p, DIVER)) spots.push({ p, rank: rank(p) });
  }
  const mouths = openings(def);
  const openingOf = (a: Vec3, b: Vec3): string | null => {
    for (let s = 0; s <= 40; s++) {
      const t = s / 40, w = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      if (roomAt(def, w) !== "") continue;
      return mouths.find(o => {
        const along = (w.x - o.center.x) * o.normal.x + (w.y - o.center.y) * o.normal.y + (w.z - o.center.z) * o.normal.z;
        const off = { x: w.x - o.center.x - o.normal.x * along, y: w.y - o.center.y - o.normal.y * along, z: w.z - o.center.z - o.normal.z * along };
        return Math.abs(along) < 3.5 && Math.hypot(off.x, off.y, off.z) < Math.hypot(o.clear.width, o.clear.height) / 2 + 1.5;
      })?.id ?? null;
    }
    return null;
  };
  // Spots on a 7 m grid, so each hop scans only its neighbourhood.
  const CELL = 7, cells = new Map<string, { p: Vec3; rank: number }[]>();
  const cellKey = (i: number, j: number, k: number): string => `${i},${j},${k}`;
  for (const o of spots) {
    const key = cellKey(Math.floor(o.p.x / CELL), Math.floor(o.p.y / CELL), Math.floor(o.p.z / CELL));
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(o);
  }
  const nearby = (p: Vec3): { p: Vec3; rank: number }[] => {
    const out: { p: Vec3; rank: number }[] = [], ci = Math.floor(p.x / CELL), cj = Math.floor(p.y / CELL), ck = Math.floor(p.z / CELL);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) out.push(...cells.get(cellKey(i, j, k)) ?? []);
    return out;
  };
  const failures: string[] = [], exits: Record<string, number> = {};
  let hops = 0;
  for (const start of starts) {
    if (!q.clearance(start, DIVER)) { failures.push(`start ${JSON.stringify(start)} is not a diver pose`); continue; }
    let at = start, exit: string | null = null, lost: string | null = null;
    for (let hop = 0; !exterior(at); hop++) {
      if (hop >= 60) { lost = `lost from ${JSON.stringify(start)} at ${JSON.stringify(at)}`; break; }
      const here = rank(at);
      const options = nearby(at).filter(o => o.rank > here + 1e-3 && Math.hypot(o.p.x - at.x, o.p.y - at.y, o.p.z - at.z) <= 7)
        .sort((x, y) => y.rank - x.rank || Math.hypot(x.p.x - at.x, x.p.z - at.z) - Math.hypot(y.p.x - at.x, y.p.z - at.z));
      let next: Vec3 | null = null;
      for (const o of options) {
        if (!clearSight(head(at), head(o.p))) continue;
        const r = q.moveCapsule(at, { x: o.p.x - at.x, y: o.p.y - at.y, z: o.p.z - at.z }, DIVER);
        if (r.hitSolid || r.hitBoundary || Math.hypot(r.position.x - o.p.x, r.position.y - o.p.y, r.position.z - o.p.z) > 1e-6) continue;
        next = o.p; break;
      }
      if (!next) { lost = `no brighter water a diver can reach from ${JSON.stringify(at)} (glow ${here.toFixed(3)})`; break; }
      if (exterior(next)) exit = openingOf(at, next);
      at = next; hops++;
    }
    if (lost) failures.push(lost);
    else if (!exit) failures.push(`left ${JSON.stringify(start)} without passing a mouth`);
    else if (!q.clearance(at, DIVER) || glow(head(at)) !== 1) failures.push(`arrival ${JSON.stringify(at)} is not clear lit water`);
    else exits[exit] = (exits[exit] ?? 0) + 1;
  }
  return { failures, exits, hops };
}

/** Diver starts every metre along a cave's routes, inside its water. */
export function retreatStarts(def: CaveDef, every = 1): Vec3[] {
  const f = def.replacementFootprints[0]!;
  return def.routes.flatMap(r => r.path.slice(1).flatMap((b, i) => {
    const a = r.path[i]!, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / every);
    // Craft routes are keel datums: a diver starts on the same line.
    return Array.from({ length: n }, (_, s) => ({ x: a.x + (b.x - a.x) * s / n, y: a.y + (b.y - a.y) * s / n, z: a.z + (b.z - a.z) * s / n }));
  })).filter(p => p.x > f.minX && p.x < f.maxX && p.z > f.minZ && p.z < f.maxZ && roomAt(def, { ...p, y: p.y + 0.6 }) !== "");
}
