// Shared checks for the Canopy and Basin caves (CA-2). Not a test file.
// Every check returns failure strings so a test asserts an empty list and a
// failure names the cave, room or portal and the point.
import { caves, EXTERIOR, MIN_ROCK, type CaveDef, type CavePortal } from "../src/content/regions/caves.js";
import { caveShell, caveVolume, caveSampler } from "../src/content/regions/caveGeometry.js";
import { caveFloor, EDGE_LIP, EDGE_SHELF, groupDef, type CaveGroup } from "../src/content/regions/caves/authored.js";
import { CANOPY_BASIN_GROUPS } from "../src/content/regions/caves/index.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { CRAFT_PROFILES, type CraftProfileId } from "../src/content/regions/passages.js";
import { caveOwner, createCaveWorldQueries, SOLIDS, surfaceHeight, type CaveOwner, type Solid } from "../src/sim/world.js";
import type { Capsule, Vec3, WorldQueries } from "../src/sim/types.js";
import { boxDistance } from "../src/world/frame.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import { caveDaylight, caveLightField, sampleLightField, type CaveLightField } from "../src/render/caves/lightField.js";

export const DIVER: Capsule = CRAFT_PROFILES.diver;
export const groups = CANOPY_BASIN_GROUPS;
export const defOf = (g: CaveGroup): CaveDef => groupDef(g, worldFloor);
const floors = new WeakMap<CaveGroup, (x: number, z: number) => number>();
/** The floor a group is built on (its uphill-edge shelves inside the footprint). */
export const floorOf = (g: CaveGroup): ((x: number, z: number) => number) => {
  let f = floors.get(g);
  if (!f) floors.set(g, f = caveFloor(g.source, worldFloor));
  return f;
};
export const groupById = (id: string): CaveGroup => {
  const g = groups.find(g => g.source.id === id);
  if (!g) throw new Error(`no cave group ${id}`);
  return g;
};

// --- The world ----------------------------------------------------------------
// The game's composed world (`sim/world.ts` `createCaveWorldQueries`, the C4
// adapter with its 8 m cave index) over every exterior solid, the kit's
// caves and every Canopy and Basin cave: what `gameWorld()` becomes once
// these sources are composed. Coordinates are the real ones (`shift` is
// zero; kept so the checks read the same as the W1 tests).
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
export interface Frame {
  readonly def: CaveDef;
  readonly shift: Vec3;
  readonly world: WorldQueries;
  to(p: Readonly<Vec3>): Vec3;
  from(p: Readonly<Vec3>): Vec3;
}
/** Every cave owner the composed world holds: the kit's and ours. */
export const allOwners = (): CaveOwner[] => [...caves(worldFloor), ...groups.map(defOf)].map(caveOwner);
let shared: WorldQueries | null = null;
/** The composed world with every cave, built once. */
export function composedWorld(extra: readonly Solid[] = []): WorldQueries {
  if (!extra.length && shared) return shared;
  const world = createCaveWorldQueries({ solids: [...SOLIDS, ...extra], floor: surfaceHeight, caves: allOwners() });
  if (!extra.length) shared = world;
  return world;
}
const copy = (p: Readonly<Vec3>): Vec3 => ({ x: p.x, y: p.y, z: p.z });
/** The composed world seen from one cave, plus `extra` exterior solids. */
export function frameOf(def: CaveDef, extra: readonly Solid[] = []): Frame {
  return { def, shift: ZERO, world: composedWorld(extra), to: copy, from: copy };
}

// --- Rock lookups --------------------------------------------------------------
const BUCKET = 2;
const rockGrids = new WeakMap<CaveDef, Map<number, Solid[]>>();
const key = (i: number, k: number): number => (i + 100000) * 200000 + (k + 100000);
function rockGrid(def: CaveDef): Map<number, Solid[]> {
  let g = rockGrids.get(def);
  if (g) return g;
  g = new Map();
  for (const s of def.rock)
    for (let i = Math.floor(s.min.x / BUCKET); i <= Math.floor(s.max.x / BUCKET); i++)
      for (let k = Math.floor(s.min.z / BUCKET); k <= Math.floor(s.max.z / BUCKET); k++)
        (g.get(key(i, k)) ?? g.set(key(i, k), []).get(key(i, k))!).push(s);
  rockGrids.set(def, g);
  return g;
}
export function nearRock(def: CaveDef, p: Readonly<Vec3>, reach: number, visit: (s: Solid) => boolean | void): void {
  const g = rockGrid(def), seen = new Set<Solid>();
  for (let i = Math.floor((p.x - reach) / BUCKET); i <= Math.floor((p.x + reach) / BUCKET); i++)
    for (let k = Math.floor((p.z - reach) / BUCKET); k <= Math.floor((p.z + reach) / BUCKET); k++)
      for (const s of g.get(key(i, k)) ?? []) if (!seen.has(s)) { seen.add(s); if (visit(s)) return; }
}
export const insideBox = (p: Readonly<Vec3>, s: Solid, margin = 1e-9): boolean =>
  p.x > s.min.x + margin && p.x < s.max.x - margin && p.y > s.min.y + margin && p.y < s.max.y - margin &&
  p.z > s.min.z + margin && p.z < s.max.z - margin;
export const inRock = (def: CaveDef, p: Readonly<Vec3>): boolean => { let hit = false; nearRock(def, p, 0, s => (hit = insideBox(p, s))); return hit; };
export const rockDistance = (def: CaveDef, p: Readonly<Vec3>, reach = 1): number => {
  let best = Infinity;
  nearRock(def, p, reach, s => { best = Math.min(best, boxDistance(s, p)); return best === 0; });
  return best;
};

// --- Geometry helpers ---------------------------------------------------------
export const vertex = (m: MeshRecipe, v: number): Vec3 => ({ x: m.positions[v * 3]!, y: m.positions[v * 3 + 1]!, z: m.positions[v * 3 + 2]! });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
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
/** Closest distance from a point to a triangle (Ericson 5.1.5). */
export function pointTriangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const at = (u: number, v: number): number => dist(p, { x: a.x + ab.x * u + ac.x * v, y: a.y + ab.y * u + ac.y * v, z: a.z + ab.z * u + ac.z * v });
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
type Tri = [Vec3, Vec3, Vec3];
/** Triangles bucketed on a 2 m grid, for local queries against a whole shell. */
export function triangleGrid(m: MeshRecipe): (p: Vec3, reach: number) => Tri[] {
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
    const seen = new Set<number>(), out: Tri[] = [];
    for (let i = Math.floor((p.x - reach) / cell); i <= Math.floor((p.x + reach) / cell); i++)
      for (let j = Math.floor((p.y - reach) / cell); j <= Math.floor((p.y + reach) / cell); j++)
        for (let k = Math.floor((p.z - reach) / cell); k <= Math.floor((p.z + reach) / cell); k++)
          for (const t of buckets.get(`${i},${j},${k}`) ?? []) if (!seen.has(t)) {
            seen.add(t); out.push([vertex(m, m.indices[t]!), vertex(m, m.indices[t + 1]!), vertex(m, m.indices[t + 2]!)]);
          }
    return out;
  };
}
const shellGrids = new WeakMap<CaveDef, { fine: ReturnType<typeof triangleGrid>; coarse: ReturnType<typeof triangleGrid> }>();
export function shellGrid(def: CaveDef) {
  let g = shellGrids.get(def);
  if (!g) shellGrids.set(def, g = { fine: triangleGrid(caveShell(def, "fine")), coarse: triangleGrid(caveShell(def, "coarse")) });
  return g;
}
/** Points over a portal's clear rectangle, inset by `inset`, every 0.25 m. */
export function aperture(p: CavePortal, inset = 0): Vec3[] {
  const out: Vec3[] = [], w = p.clear.width / 2 - inset, h = p.clear.height / 2 - inset;
  for (let a = -w; a <= w + 1e-9; a += 0.25) for (let b = -h; b <= h + 1e-9; b += 0.25)
    out.push(p.normal.y !== 0 ? { x: p.center.x + a, y: p.center.y, z: p.center.z + b }
      : p.normal.z !== 0 ? { x: p.center.x + a, y: p.center.y + b, z: p.center.z } : { x: p.center.x, y: p.center.y + b, z: p.center.z + a });
  return out;
}

// --- Voxel lookups ------------------------------------------------------------
export function voxelAt(def: CaveDef, p: Readonly<Vec3>): number {
  const g = caveVolume(def).grid;
  const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return -1;
  return i + g.nx * (j + g.ny * k);
}
/** The room holding a point, from the generated voxels ("" outside the cave). */
export function roomAt(def: CaveDef, p: Readonly<Vec3>): string {
  const at = voxelAt(def, p), v = caveVolume(def);
  if (at < 0) return "";
  const r = v.room[at]!;
  return r ? v.roomIds[r - 1]! : "";
}
export const insideFootprint = (def: CaveDef, p: Readonly<Vec3>): boolean => {
  const f = def.replacementFootprints[0]!;
  return p.x > f.minX && p.x < f.maxX && p.z > f.minZ && p.z < f.maxZ;
};
/** Rooms with a vertical opening to open water (a skylight or a slot door). */
const openTop = (def: CaveDef): Set<number> => new Set(def.portals.filter(p => p.normal.y !== 0 && p.between.includes(EXTERIOR))
  .map(p => def.rooms.findIndex(r => r.id === p.between[0]) + 1));
/** Within a horizontal mouth's lintel and sill zone (open by design): the
 * W1 tests' 2.5 m either side of the mouth plane, or a third of the mouth's
 * width for a craft mouth cut into a steep face. */
function mouthZone(def: CaveDef, p: Vec3): boolean {
  return def.portals.some(m => m.kind === "mouth" && m.normal.y === 0 &&
    Math.abs((p.z - m.center.z) * m.normal.z + (p.x - m.center.x) * m.normal.x) < Math.max(2.5, m.clear.width / 3) &&
    Math.abs(m.normal.z !== 0 ? p.x - m.center.x : p.z - m.center.z) < m.clear.width / 2 + 2.5 && p.y < m.center.y + m.clear.height / 2 + 2.5);
}
/** Cave water that meets open water straight above it, outside vertical
 * openings and the mouths' lintel zones: roof holes. */
export function roofHoles(def: CaveDef): Vec3[] {
  const v = caveVolume(def), g = v.grid, open = openTop(def), holes: Vec3[] = [];
  for (let k = 0; k < g.nz; k++) for (let j = 0; j + 1 < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const at = i + g.nx * (j + g.ny * k), up = at + g.nx, r = v.room[at]!;
    if (!r || v.solid[up] || v.room[up] || open.has(r)) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (!mouthZone(def, p)) holes.push(p);
  }
  return holes;
}

/** Room adjacency in the generated voxels (face neighbours), and which rooms
 * touch open exterior water. */
export function roomGraph(def: CaveDef): { pairs: Set<string>; open: Set<string> } {
  const v = caveVolume(def), g = v.grid, pairs = new Set<string>(), open = new Set<string>();
  const ids = v.roomIds;
  for (let k = 1; k < g.nz - 1; k++) for (let j = 1; j < g.ny - 1; j++) for (let i = 1; i < g.nx - 1; i++) {
    const at = i + g.nx * (j + g.ny * k), r = v.room[at]!;
    if (!r || v.solid[at]) continue;
    for (const d of [1, g.nx, g.nx * g.ny, -1, -g.nx, -g.nx * g.ny]) {
      const n = at + d;
      if (v.solid[n]) continue;
      const s = v.room[n]!;
      if (!s) open.add(ids[r - 1]!);
      else if (s !== r) pairs.add([ids[r - 1]!, ids[s - 1]!].sort().join("|"));
    }
  }
  return { pairs, open };
}

// --- Checks -------------------------------------------------------------------

export function checkRock(g: CaveGroup): string[] {
  const def = defOf(g), f = def.replacementFootprints[0]!, out: string[] = [];
  for (const s of def.rock) {
    for (const a of ["x", "y", "z"] as const) if (s.max[a] - s.min[a] < MIN_ROCK - 1e-9) out.push(`${s.id} thinner than ${MIN_ROCK} m on ${a}`);
    if (s.min.x < f.minX || s.max.x > f.maxX || s.min.z < f.minZ || s.max.z > f.maxZ) out.push(`${s.id} leaves the footprint`);
    if (s.min.y < g.source.baseY || s.max.y > g.source.topY) out.push(`${s.id} leaves the envelope`);
  }
  if (def.stats.droppedVoxels > def.stats.rockVoxels * 0.002) out.push(`${def.id}: ${def.stats.droppedVoxels} thin voxels dropped of ${def.stats.rockVoxels}`);
  // The heightfield the cave replaces never pokes under the base.
  for (let x = f.minX + 0.25; x < f.maxX; x += 1) for (let z = f.minZ + 0.25; z < f.maxZ; z += 1)
    if (worldFloor(x, z) < g.source.baseY + MIN_ROCK + 0.5) { out.push(`${def.id}: floor ${worldFloor(x, z).toFixed(1)} at ${x}, ${z} is within ${MIN_ROCK} m of the base`); return out; }
  return out;
}

/** Edge band plus lip (`caveFloor`), where the shell is pulled onto the floor. */
export const SEAM_BAND = EDGE_SHELF + EDGE_LIP;
/** Shell and rock agree: every shell point within 0.35 m of a solid and
 * facing water; no room voxel in rock; carved water never in rock and rock
 * samples covered. */
export function checkShellAgrees(g: CaveGroup): string[] {
  const def = defOf(g), out: string[] = [], fine = caveShell(def, "fine");
  let worst = 0, buried = 0, seam = 0, points = 0, where: Vec3 | null = null, firstBuried: Vec3 | null = null;
  const f0 = def.replacementFootprints[0]!;
  const edgeDistance = (p: Vec3): number => Math.min(p.x - f0.minX, f0.maxX - p.x, p.z - f0.minZ, f0.maxZ - p.z);
  const check = (p: Vec3, n: Vec3): void => {
    points++;
    const d = rockDistance(def, p);
    if (d > worst) { worst = d; where = p; }
    // Facing rock: the seam band (the shell pulled down onto the floor over a
    // raised edge band, see caveFloor) is counted apart and bounded on its own.
    if (inRock(def, { x: p.x + n.x * 0.36, y: p.y + n.y * 0.36, z: p.z + n.z * 0.36 })) { if (edgeDistance(p) < SEAM_BAND) seam++; else { buried++; firstBuried ??= p; } }
  };
  for (let v = 0; v < fine.positions.length / 3; v++)
    check(vertex(fine, v), { x: fine.normals[v * 3]!, y: fine.normals[v * 3 + 1]!, z: fine.normals[v * 3 + 2]! });
  for (let t = 0; t < fine.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map(k => vertex(fine, fine.indices[t + k]!)) as Tri;
    const n = cross(sub(b, a), sub(c, a)), l = Math.hypot(n.x, n.y, n.z) || 1;
    check({ x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 }, { x: n.x / l, y: n.y / l, z: n.z / l });
  }
  if (worst > 0.35) out.push(`${def.id}: shell point ${worst.toFixed(3)} m from rock at ${JSON.stringify(where)}`);
  if (buried > points * 0.001) out.push(`${def.id}: ${buried} of ${points} shell points face rock within 0.36 m, first ${JSON.stringify(firstBuried)}`);
  if (seam > points * 0.005) out.push(`${def.id}: ${seam} of ${points} seam-band shell points face rock within 0.36 m`);
  const v = caveVolume(def), grid = v.grid;
  let cells = 0;
  for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    if (!v.room[i + grid.nx * (j + grid.ny * k)]) continue;
    cells++;
    const p = { x: grid.origin.x + (i + 0.5) * grid.voxel, y: grid.origin.y + (j + 0.5) * grid.voxel, z: grid.origin.z + (k + 0.5) * grid.voxel };
    if (inRock(def, p)) { out.push(`${def.id}: room cell ${JSON.stringify(p)} is inside rock`); break; }
  }
  if (cells < 500) out.push(`${def.id}: only ${cells} room cells`);
  const sampler = caveSampler(g.source, floorOf(g)), f = def.replacementFootprints[0]!;
  // Rock deeper than one cube below the surface must all be collision; the
  // skin above it may be rounded off where the ground is convex (a crest
  // loses what no 2 m cube fits in, from art and collision together).
  let water = 0, deep = 0, deepCovered = 0, skin = 0, skinCovered = 0;
  for (let x = f.minX + 0.3; x < f.maxX - 0.05; x += 0.9) for (let z = f.minZ + 0.3; z < f.maxZ - 0.05; z += 0.9)
    for (let y = g.source.baseY + 0.3; y < g.source.topY; y += 0.9) {
      const e = sampler.exterior(x, y, z), w = sampler.water(x, y, z).distance;
      if (e < -0.6 && w < -0.6) { water++; if (inRock(def, { x, y, z })) { out.push(`${def.id}: carved water at ${x}, ${y}, ${z} in rock`); return out; } }
      if (e < -0.6 && w > 0.6) {
        const hit = inRock(def, { x, y, z });
        if (e < -2.25 && w > 2.25) { deep++; if (hit) deepCovered++; } else { skin++; if (hit) skinCovered++; }
      }
    }
  if (water < 50) out.push(`${def.id}: only ${water} carved samples`);
  if (deepCovered < deep * 0.998) out.push(`${def.id}: ${deep - deepCovered} of ${deep} deep rock samples uncovered`);
  if (skinCovered < skin * 0.9) out.push(`${def.id}: ${skin - skinCovered} of ${skin} near-surface rock samples uncovered`);
  return out;
}

/** Every portal keeps its clear rectangle in rock and in both shells. */
export function checkPortals(g: CaveGroup): string[] {
  const def = defOf(g), grids = shellGrid(def), out: string[] = [];
  for (const p of def.portals) {
    for (const q of aperture(p)) if (inRock(def, q)) { out.push(`${p.id}: rock at ${JSON.stringify(q)} in its ${p.clear.width} x ${p.clear.height} m opening`); break; }
    for (const lod of ["fine", "coarse"] as const) for (const q of aperture(p, 0.45)) {
      const a = { x: q.x - p.normal.x * 0.3, y: q.y - p.normal.y * 0.3, z: q.z - p.normal.z * 0.3 };
      const b = { x: q.x + p.normal.x * 0.3, y: q.y + p.normal.y * 0.3, z: q.z + p.normal.z * 0.3 };
      if (grids[lod](q, 0.5).some(([u, v, w]) => segmentHitsTriangle(a, b, u, v, w))) { out.push(`${p.id}: ${lod} shell crosses the opening at ${JSON.stringify(q)}`); break; }
    }
  }
  return out;
}

/** A shape centred in a mouth, level with its sill, swept straight through. */
export function mouthSweep(fr: Frame, m: CavePortal, shape: Capsule): boolean {
  const keel = { x: m.center.x, y: m.center.y - m.clear.height / 2 + 0.1, z: m.center.z };
  const from = { x: keel.x + m.normal.x * 10, y: keel.y, z: keel.z + m.normal.z * 10 };
  return fr.world.moveCapsule(fr.to(from), { x: -m.normal.x * 20, y: 0, z: -m.normal.z * 20 }, shape).hitSolid;
}

/** Mouth sizes and who fits: every horizontal mouth is at least 3.5 x 3 m;
 * a diver-only mouth stops the smallest hull, a craft mouth admits it. */
export function checkMouths(g: CaveGroup): string[] {
  const def = defOf(g), fr = frameOf(def), out: string[] = [];
  for (const m of def.portals.filter(p => p.kind === "mouth")) {
    if (m.clear.width < 3.5 || m.clear.height < 3) out.push(`${m.id}: ${m.clear.width} x ${m.clear.height} m is below the diver mouth target`);
    const largest = (["medium", "small", "diver"] as const).find(p => m.admits.includes(p))!;
    if (m.normal.y !== 0) continue;
    if (largest === "diver") {
      if (m.clear.width >= CRAFT_PROFILES.small.radius * 2) out.push(`${m.id}: diver-only but ${m.clear.width} m wide`);
      if (!mouthSweep(fr, m, CRAFT_PROFILES.small)) out.push(`${m.id}: a small hull swept through a diver-only mouth`);
    }
  }
  return out;
}

const PROFILE = (p: CraftProfileId): Capsule => CRAFT_PROFILES[p];
/** Every route clears its profile at each pose and sweeps segment by segment. */
export function checkRoutes(g: CaveGroup): string[] {
  const def = defOf(g), fr = frameOf(def), out: string[] = [];
  for (const r of def.routes) {
    const shape = PROFILE(r.profile), path = r.path.map(fr.to);
    path.forEach((p, i) => { if (!fr.world.clearance(p, shape)) out.push(`${r.id}: ${r.profile} blocked at pose ${i} ${JSON.stringify(r.path[i])}`); });
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!, move = fr.world.moveCapsule(a, sub(b, a), shape);
      if (move.hitSolid || move.hitBoundary || dist(move.position, b) > 1e-6)
        out.push(`${r.id}: segment ${i} stops at ${JSON.stringify(fr.from(move.position))}`);
    }
  }
  return out;
}

/** Probe columns: inside route poses, plus the lowest clear diver pose of
 * every room column on a 2 m grid (shafts and open-topped rooms excepted). */
export function probes(g: CaveGroup): Vec3[] {
  const def = defOf(g), fr = frameOf(def), open = openTop(def), out: Vec3[] = [];
  const underOpen = (p: Vec3): boolean => def.rooms.some((r, i) => open.has(i + 1) &&
    p.x > r.bounds.min.x - 1.5 && p.x < r.bounds.max.x + 1.5 && p.z > r.bounds.min.z - 1.5 && p.z < r.bounds.max.z + 1.5);
  const keep = (p: Vec3): boolean => roomAt(def, { ...p, y: p.y + 0.5 }) !== "" && !underOpen(p) && !mouthZone(def, p) && fr.world.clearance(fr.to(p), DIVER);
  for (const p of def.routes.flatMap(r => r.path).filter(p => insideFootprint(def, p))) {
    const q = { ...p, x: Math.floor(p.x * 2) / 2 + 0.25, z: Math.floor(p.z * 2) / 2 + 0.25 };
    if (keep(q)) out.push(q);
  }
  for (const [i, r] of def.rooms.entries()) {
    if (r.role === "shaft" || open.has(i + 1)) continue;
    for (let x = Math.floor(r.bounds.min.x) + 1.25; x < r.bounds.max.x - 0.5; x += 2) for (let z = Math.floor(r.bounds.min.z) + 1.25; z < r.bounds.max.z - 0.5; z += 2)
      for (let y = r.bounds.min.y + 0.05; y < r.bounds.max.y - 1; y += 0.25) {
        const p = { x, y, z };
        if (roomAt(def, { ...p, y: y + 0.5 }) !== r.id) continue;
        if (keep(p)) out.push(p);
        break;
      }
  }
  return out;
}

/** Roof support: over every probe the roof is solid rock at least MIN_ROCK
 * thick, a diver stands on it and cannot sink through, the support below is
 * the cave floor, both shells draw the roof top, and no roof hole exists. */
export function checkRoof(g: CaveGroup): string[] {
  const def = defOf(g), fr = frameOf(def), grids = shellGrid(def), out: string[] = [], ps = probes(g);
  if (ps.length < 1) out.push(`${def.id}: only ${ps.length} roof probes`);
  for (const p of ps) {
    const q = fr.to(p), top = fr.world.supportHeight(q.x, q.z, 1e4);
    const stand = Math.max(...[-1, 1].flatMap(a => [-1, 1].map(b => fr.world.supportHeight(q.x + a * DIVER.radius, q.z + b * DIVER.radius, 1e4))));
    if (fr.world.supportHeight(q.x, q.z, q.y) > q.y + 1e-9) out.push(`${def.id}: support below ${JSON.stringify(p)} is the roof`);
    const over = def.rock.filter(s => p.x > s.min.x && p.x < s.max.x && p.z > s.min.z && p.z < s.max.z && s.min.y >= p.y + DIVER.height);
    const ceiling = Math.min(...over.map(s => s.min.y)) + fr.shift.y;
    if (!Number.isFinite(ceiling) || top - ceiling < MIN_ROCK - 1e-9) out.push(`${def.id}: roof over ${JSON.stringify(p)} is ${(top - ceiling).toFixed(2)} m`);
    const above = { x: q.x, y: stand + 0.01, z: q.z };
    if (!fr.world.clearance(above, DIVER)) out.push(`${def.id}: no room on the roof over ${JSON.stringify(p)}`);
    const sink = fr.world.moveCapsule({ ...above, y: stand + 1 }, { x: 0, y: -3, z: 0 }, DIVER);
    if (!sink.hitSolid || sink.position.y < stand - 1e-6) out.push(`${def.id}: a diver sinks through the roof over ${JSON.stringify(p)}`);
    const roofTop = top - fr.shift.y;
    for (const lod of ["fine", "coarse"] as const) {
      // The window grows with the ground's slope: a voxel-wide step of shell on a steep roof.
      const slope = Math.hypot(fr.world.supportHeight(q.x + 0.5, q.z, 1e4) - fr.world.supportHeight(q.x - 0.5, q.z, 1e4),
        fr.world.supportHeight(q.x, q.z + 0.5, 1e4) - fr.world.supportHeight(q.x, q.z - 0.5, 1e4));
      const a = { x: p.x, y: roofTop + 0.6, z: p.z }, b = { x: p.x, y: roofTop - (lod === "fine" ? 0.8 : 1.6) - (lod === "fine" ? 0.5 : 1) * slope, z: p.z };
      if (!grids[lod]({ x: p.x, y: roofTop, z: p.z }, 1.8).some(([u, v, w]) => segmentHitsTriangle(a, b, u, v, w)))
        out.push(`${def.id}: ${lod} shell has no roof top over ${JSON.stringify(p)}`);
    }
  }
  const holes = roofHoles(def);
  if (holes.length) out.push(`${def.id}: ${holes.length} roof holes, first ${JSON.stringify(holes[0])}`);
  return out;
}

/** Coarse LOD never closes an opening or bridges a passage: every route
 * point is at least 0.6 m from both shells, and coarse is coarser. */
export function checkLod(g: CaveGroup): string[] {
  const def = defOf(g), grids = shellGrid(def), out: string[] = [];
  for (const r of def.routes) {
    const lift = r.profile === "diver" ? 0.45 : 1;
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!, b = r.path[i]!, steps = Math.ceil(dist(a, b) / 0.25);
      for (let s = 0; s <= steps; s++) {
        const p = { x: a.x + (b.x - a.x) * s / steps, y: a.y + lift + (b.y - a.y) * s / steps, z: a.z + (b.z - a.z) * s / steps };
        for (const lod of ["fine", "coarse"] as const) for (const [u, v, w] of grids[lod](p, 0.8))
          if (pointTriangleDistance(p, u, v, w) < 0.6) { out.push(`${r.id}: ${lod} shell within 0.6 m at ${JSON.stringify(p)}`); s = steps; break; }
      }
    }
  }
  const fine = caveShell(def, "fine"), coarse = caveShell(def, "coarse");
  if (coarse.positions.length >= fine.positions.length / 2.5) out.push(`${def.id}: coarse is not coarser`);
  return out;
}

/** Footprint corners. The kit's 2 m cube cannot lean past a corner, so
 * where a corner is a high point the cave's edge band (`caveFloor`) stands
 * level with it and so above the ground falling away along the other edge.
 * `bound` is the most it may stand above the terrain within `CORNER_ZONE` of
 * the corner: the corner's own relief (highest edge point within the band
 * minus lowest within the zone) plus the kit's 0.5 m voxel and collar
 * allowance. A flat corner keeps the plain 0.75 m. */
export const CORNER_ZONE = 4;
export interface Corner { corner: [number, number]; relief: number; bound: number }
export function corners(def: CaveDef): Corner[] {
  const f = def.replacementFootprints[0]!, out: Corner[] = [];
  for (const cx of [f.minX, f.maxX]) for (const cz of [f.minZ, f.maxZ]) {
    const ix = cx === f.minX ? 1 : -1, iz = cz === f.minZ ? 1 : -1;
    let hi = -Infinity, lo = Infinity;
    for (let t = 0; t <= CORNER_ZONE + 1e-9; t += 0.25) for (const [x, z] of [[cx + ix * t, cz], [cx, cz + iz * t]] as const) {
      const h = worldFloor(x, z);
      if (t <= EDGE_SHELF + 0.25) hi = Math.max(hi, h);
      lo = Math.min(lo, h);
    }
    out.push({ corner: [cx, cz], relief: hi - lo, bound: Math.max(0.75, hi - lo + 0.5) });
  }
  return out;
}
/** The collar meets the heightfield at the footprint edge: along every
 * edge, a quarter metre inside, the cave's ground stands within 0.75 m of
 * the terrain it replaces (compared at the same point, so a steep slope
 * across the seam is not read as a step; half a voxel plus the slope over
 * one voxel where that is more), except next to
 * corners, which keep their relief bound; `residuals` lists the largest
 * departure at each such corner. Shell vertices on every edge lie on the
 * floor. */
export function collarSteps(g: CaveGroup): { failures: string[]; residuals: { corner: [number, number]; step: number; bound: number }[] } {
  const def = defOf(g), fr = frameOf(def), f = def.replacementFootprints[0]!, failures: string[] = [];
  const cs = corners(def), residuals = cs.map(c => ({ corner: c.corner, step: 0, bound: c.bound }));
  // A rock column is level across its half-metre voxel while the terrain
  // slopes across it: half a voxel of rounding plus the slope over one voxel.
  const tolerance = (x: number, z: number): number => Math.max(0.75, 0.5 + 0.5 * Math.hypot(
    (worldFloor(x + 0.25, z) - worldFloor(x - 0.25, z)) / 0.5, (worldFloor(x, z + 0.25) - worldFloor(x, z - 0.25)) / 0.5));
  const edge: [number, number, number, number][] = [];
  for (let u = f.minX + 0.5; u < f.maxX; u += 0.5) edge.push([u, f.minZ + 0.25, u, f.minZ - 0.25], [u, f.maxZ - 0.25, u, f.maxZ + 0.25]);
  for (let u = f.minZ + 0.5; u < f.maxZ; u += 0.5) edge.push([f.minX + 0.25, u, f.minX - 0.25, u], [f.maxX - 0.25, u, f.maxX + 0.25, u]);
  for (const [x, z] of edge) {
    const q = fr.to({ x, y: 0, z }), top = fr.world.supportHeight(q.x, q.z, 1e4) - fr.shift.y, step = top - worldFloor(x, z);
    const zone = cs.findIndex(c => Math.abs(x - c.corner[0]) <= CORNER_ZONE && Math.abs(z - c.corner[1]) <= CORNER_ZONE);
    if (zone >= 0) {
      residuals[zone]!.step = Math.max(residuals[zone]!.step, Math.abs(step));
      if (Math.abs(step) > cs[zone]!.bound) failures.push(`${def.id}: corner step ${step.toFixed(2)} m at ${x}, ${z} over its ${cs[zone]!.bound.toFixed(2)} m bound`);
    } else if (Math.abs(step) > tolerance(x, z)) failures.push(`${def.id}: collar step ${step.toFixed(2)} m at ${x}, ${z}`);
  }
  for (const m of [caveShell(def, "fine"), caveShell(def, "coarse")]) for (let v = 0; v < m.positions.length / 3; v++) {
    const p = vertex(m, v);
    if (Math.abs(p.x - f.minX) > 1e-6 && Math.abs(p.x - f.maxX) > 1e-6 && Math.abs(p.z - f.minZ) > 1e-6 && Math.abs(p.z - f.maxZ) > 1e-6) continue;
    if (Math.abs(p.y - worldFloor(p.x, p.z)) >= 1e-4) { failures.push(`${def.id}: collar vertex ${p.y.toFixed(2)} vs floor ${worldFloor(p.x, p.z).toFixed(2)}`); break; }
  }
  return { failures: failures.slice(0, 8), residuals: residuals.filter(r => r.step > 0.75) };
}
export const checkCollar = (g: CaveGroup): string[] => collarSteps(g).failures;

/** The generated rooms touch exactly as the portals say: every throat joins
 * its two rooms, no two rooms touch without a throat, and a room meets open
 * water only where it has a mouth or skylight. */
export function checkTopology(g: CaveGroup): string[] {
  const def = defOf(g), out: string[] = [], { pairs, open } = roomGraph(def);
  const planned = new Set(def.portals.filter(p => !p.between.includes(EXTERIOR)).map(p => [...p.between].sort().join("|")));
  for (const p of planned) if (!pairs.has(p)) out.push(`${def.id}: throat ${p} does not connect in the voxels`);
  for (const p of pairs) if (!planned.has(p)) out.push(`${def.id}: rooms ${p} touch without a portal`);
  const mouthRooms = new Set(def.portals.filter(p => p.between.includes(EXTERIOR)).map(p => p.between.find(r => r !== EXTERIOR)!));
  for (const r of mouthRooms) if (!open.has(r)) out.push(`${def.id}: ${r} has a mouth but meets no open water`);
  for (const r of open) if (!mouthRooms.has(r)) out.push(`${def.id}: ${r} meets open water without a mouth`);
  return out;
}

/** Water extent of a bible cave's rooms: [x, y, z] spans from the voxels. */
export function caveExtent(def: CaveDef, rooms: readonly string[]): { min: Vec3; max: Vec3 } {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const r of def.rooms.filter(r => rooms.includes(r.id)))
    for (const a of ["x", "y", "z"] as const) { min[a] = Math.min(min[a], r.bounds.min[a]); max[a] = Math.max(max[a], r.bounds.max[a]); }
  return { min, max };
}

/** Does the chamber graph (chambers as nodes, inter-chamber passages as
 * edges, mouths left out) contain a cycle? */
export function hasCycle(nodes: readonly string[], edges: readonly (readonly [string, string])[]): boolean {
  const parent = new Map(nodes.map(n => [n, n]));
  const find = (n: string): string => { while (parent.get(n) !== n) n = parent.get(n)!; return n; };
  for (const [a, b] of edges) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return true;
    parent.set(ra, rb);
  }
  return false;
}

/** All the per-cave geometry checks, for the scratch runner and the tests. */
export function checkAll(g: CaveGroup): Record<string, string[]> {
  return { rock: checkRock(g), shell: checkShellAgrees(g), portals: checkPortals(g), mouths: checkMouths(g), routes: checkRoutes(g),
    roof: checkRoof(g), lod: checkLod(g), collar: checkCollar(g), topology: checkTopology(g) };
}

// --- Lamp-off retreat ------------------------------------------------------------
// The W1 policy (tests/cave-light.test.ts), for any cave: an unlit diver uses
// only what it sees. From the current pose it considers water in clear sight
// within 7 m whose path-length glow is brighter (open water outside ranks
// above any lit water inside) and takes the brightest one the full diver can
// actually reach: the destination clears and the sweep from the last
// accepted pose arrives exactly. Success is clear lit exterior water entered
// through a mouth or skylight.

export const head = (p: Vec3): Vec3 => ({ ...p, y: p.y + 0.6 });
const fields = new WeakMap<CaveDef, CaveLightField>();
export const fieldOf = (def: CaveDef): CaveLightField => {
  let f = fields.get(def);
  if (!f) fields.set(def, f = caveLightField(def, worldFloor));
  return f;
};
export const glow = (def: CaveDef, p: Vec3): number => { const c = sampleLightField(fieldOf(def), p); return caveDaylight(c.r, 0, c.a); };
/** Open water between two points: the fine voxels along it are not rock. */
export function clearSight(def: CaveDef, a: Vec3, b: Vec3): boolean {
  const v = caveVolume(def), g = v.grid, steps = Math.ceil(dist(a, b) / 0.25);
  for (let s = 1; s < steps; s++) {
    const t = s / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    const i = Math.floor((x - g.origin.x) / g.voxel), j = Math.floor((y - g.origin.y) / g.voxel), k = Math.floor((z - g.origin.z) / g.voxel);
    if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) continue;
    if (v.solid[i + g.nx * (j + g.ny * k)]) return false;
  }
  return true;
}
export const exteriorPose = (def: CaveDef, p: Vec3): boolean => roomAt(def, p) === "" && roomAt(def, head(p)) === "" && roomAt(def, { ...p, y: p.y + 0.95 }) === "";
const openings = (def: CaveDef): CavePortal[] => def.portals.filter(o => o.kind === "mouth" || o.kind === "skylight");

/** Diver spots on a 1 m lattice: cave water, and open water within 9 m of an
 * opening, where a diver clears. */
const spotCache = new WeakMap<CaveDef, Vec3[]>();
export function spots(def: CaveDef): Vec3[] {
  let out = spotCache.get(def);
  if (out) return out;
  const fr = frameOf(def), v = caveVolume(def), g = v.grid, ops = openings(def);
  out = [];
  for (let k = 0; k < g.nz; k += 2) for (let j = 0; j < g.ny; j += 2) for (let i = 0; i < g.nx; i += 2) {
    const at = i + g.nx * (j + g.ny * k);
    if (v.solid[at]) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (!v.room[at] && !ops.some(o => dist(o.center, p) < 9)) continue;
    if (fr.world.clearance(fr.to(p), DIVER)) out.push(p);
  }
  spotCache.set(def, out);
  return out;
}
/** Which opening a hop from `a` (inside) to `b` (outside) left through. */
function openingOf(def: CaveDef, a: Vec3, b: Vec3): string | null {
  for (let s = 0; s <= 40; s++) {
    const t = s / 40, w = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    if (roomAt(def, w) !== "") continue;
    return openings(def).find(o => {
      const along = (w.x - o.center.x) * o.normal.x + (w.y - o.center.y) * o.normal.y + (w.z - o.center.z) * o.normal.z;
      const off = { x: w.x - o.center.x - o.normal.x * along, y: w.y - o.center.y - o.normal.y * along, z: w.z - o.center.z - o.normal.z * along };
      return Math.abs(along) < 3.5 && Math.hypot(off.x, off.y, off.z) < Math.hypot(o.clear.width, o.clear.height) / 2 + 2;
    })?.id ?? null;
  }
  return null;
}
/** A swept hop from `a` to `b` arrives exactly. */
export function reaches(fr: Frame, a: Vec3, b: Vec3): boolean {
  const r = fr.world.moveCapsule(fr.to(a), sub(b, a), DIVER);
  return !r.hitSolid && !r.hitBoundary && dist(fr.from(r.position), b) <= 1e-6;
}
export interface Retreat { failures: string[]; exits: Record<string, number>; hops: number; longest: number; paths: Vec3[][] }
/** Visible candidates a hop tries, brightest first, before it gives up. */
const TRIES = 400;
export function lightRetreat(def: CaveDef, fr: Frame, starts: readonly Vec3[]): Retreat {
  const rank = (p: Vec3): number => glow(def, head(p)) + (exteriorPose(def, p) ? 0.01 : 0);
  const ranked = spots(def).map(p => ({ p, rank: rank(p) })), CELL = 7, cells = new Map<string, typeof ranked>();
  const cellKey = (i: number, j: number, k: number): string => `${i},${j},${k}`;
  for (const o of ranked) {
    const key = cellKey(Math.floor(o.p.x / CELL), Math.floor(o.p.y / CELL), Math.floor(o.p.z / CELL));
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(o);
  }
  const near = (at: Vec3): typeof ranked => {
    const out: typeof ranked = [], i = Math.floor(at.x / CELL), j = Math.floor(at.y / CELL), k = Math.floor(at.z / CELL);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) for (let c = k - 1; c <= k + 1; c++) out.push(...cells.get(cellKey(a, b, c)) ?? []);
    return out;
  };
  const failures: string[] = [], exits: Record<string, number> = {}, paths: Vec3[][] = [];
  let hops = 0, longest = 0;
  for (const start of starts) {
    if (!fr.world.clearance(fr.to(start), DIVER)) { failures.push(`start ${JSON.stringify(start)} is not a diver pose`); continue; }
    let at = start, exit: string | null = null, lost: string | null = null, swum = 0;
    const path = [start];
    // Out means clear, fully lit open water: a hop or two past a mouth's own glow.
    for (let hop = 0; !(exteriorPose(def, at) && glow(def, head(at)) === 1); hop++) {
      if (hop >= 40) { lost = `lost from ${JSON.stringify(start)} at ${JSON.stringify(at)}`; break; }
      const here = rank(at);
      const options = near(at).filter(o => o.rank > here + 1e-3 && dist(o.p, at) <= 7)
        .sort((x, y) => y.rank - x.rank || Math.hypot(x.p.x - at.x, x.p.z - at.z) - Math.hypot(y.p.x - at.x, y.p.z - at.z));
      let next: Vec3 | null = null;
      // The brightest few in sight; a diver does not try every lit speck.
      let tried = 0;
      for (const o of options) {
        if (!clearSight(def, head(at), head(o.p))) continue;
        if (reaches(fr, at, o.p)) { next = o.p; break; }
        if (++tried >= TRIES) break;
      }
      if (!next) { lost = `no brighter water a diver can reach from ${JSON.stringify(at)} (glow ${here.toFixed(3)})`; break; }
      if (!exit && exteriorPose(def, next)) exit = openingOf(def, at, next);
      swum += dist(at, next); at = next; hops++; path.push(next);
    }
    if (lost) failures.push(lost);
    else if (!exit) failures.push(`left ${JSON.stringify(start)} without passing a mouth or skylight`);
    else if (!fr.world.clearance(fr.to(at), DIVER) || glow(def, head(at)) !== 1) failures.push(`arrival ${JSON.stringify(at)} is not clear lit water`);
    else { exits[exit] = (exits[exit] ?? 0) + 1; longest = Math.max(longest, swum); }
    paths.push(path);
  }
  return { failures, exits, hops, longest, paths };
}
/** Every metre along every route, inside the cave. */
export function retreatStarts(def: CaveDef): Vec3[] {
  return def.routes.filter(r => r.profile === "diver").flatMap(r => r.path.slice(1).flatMap((b, i) => {
    const a = r.path[i]!, n = Math.ceil(dist(a, b));
    return Array.from({ length: n }, (_, s) => ({ x: a.x + (b.x - a.x) * s / n, y: a.y + (b.y - a.y) * s / n, z: a.z + (b.z - a.z) * s / n }));
  })).filter(p => insideFootprint(def, p) && roomAt(def, head(p)) !== "" && frameOf(def).world.clearance(frameOf(def).to(p), DIVER));
}
/** Plugs over every opening, in cave coordinates, for the sealed control. */
export function plugs(def: CaveDef): Solid[] {
  return openings(def).map((o, i) => {
    const w = o.clear.width / 2 + 3, h = o.clear.height / 2 + 3, t = 1;
    const half = o.normal.y !== 0 ? { x: w, y: t, z: h } : o.normal.z !== 0 ? { x: w, y: h, z: t } : { x: t, y: h, z: w };
    return { id: `test.plug.${i}`, min: { x: o.center.x - half.x, y: o.center.y - half.y, z: o.center.z - half.z },
      max: { x: o.center.x + half.x, y: o.center.y + half.y, z: o.center.z + half.z } };
  });
}

// --- Geodesic distance to open water ---------------------------------------------
/** Metres through water (face steps of 0.5 m) from each voxel to open
 * exterior water, for cave water voxels; Infinity elsewhere. */
const geodesics = new WeakMap<CaveDef, Float32Array>();
export function waterDistance(def: CaveDef): Float32Array {
  let d = geodesics.get(def);
  if (d) return d;
  const v = caveVolume(def), g = v.grid, n = g.nx * g.ny * g.nz;
  d = new Float32Array(n).fill(Infinity);
  let frontier: number[] = [];
  for (let at = 0; at < n; at++) if (!v.solid[at] && !v.room[at]) { d[at] = 0; frontier.push(at); }
  const steps = [1, -1, g.nx, -g.nx, g.nx * g.ny, -g.nx * g.ny];
  while (frontier.length) {
    const next: number[] = [];
    for (const at of frontier) for (const s of steps) {
      const u = at + s;
      if (u < 0 || u >= n || v.solid[u] || d[u]! <= d[at]! + g.voxel) continue;
      d[u] = d[at]! + g.voxel; next.push(u);
    }
    frontier = next;
  }
  geodesics.set(def, d);
  return d;
}
export const distanceOut = (def: CaveDef, p: Vec3): number => { const at = voxelAt(def, p); return at < 0 ? 0 : waterDistance(def)[at]!; };

// --- Wake retreat (Pale Basin) ----------------------------------------------------
/** The deepest clear diver pose in a room: lowest feet whose body is in it. */
export function deepestPose(def: CaveDef, roomId: string): Vec3 | null {
  const fr = frameOf(def), r = def.rooms.find(r => r.id === roomId)!;
  let best: Vec3 | null = null;
  for (let y = r.bounds.min.y + 0.05; y < r.bounds.max.y - 0.5 && !best; y += 0.25)
    for (let x = r.bounds.min.x + 0.25; x < r.bounds.max.x && !best; x += 0.5) for (let z = r.bounds.min.z + 0.25; z < r.bounds.max.z && !best; z += 0.5) {
      const p = { x, y, z };
      if (roomAt(def, { ...p, y: y + 0.3 }) === roomId && roomAt(def, head(p)) === roomId && fr.world.clearance(fr.to(p), DIVER)) best = p;
    }
  return best;
}
