// Shared checks for the CA-1 Reef and Isles caves (not a test file itself).
// Every check takes cave ids and returns its failures, so the region tests
// assert an empty list and print what broke, by name.
import { AUTHORED_CAVE_SOURCES, caveDef, MIN_ROCK, type CaveDef, type CavePortal, type CaveSource } from "../src/content/regions/caves.js";
import { caveNeighbours, caveSampler, caveShell, caveVolume, sharedSpans, type CaveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { CRAFT_PROFILES, ROUTES } from "../src/content/regions/passages.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURE_SOLIDS } from "../src/content/regions/structures.js";
import { VISTA_SOLIDS } from "../src/content/vistas.js";
import type { Solid } from "../src/sim/world.js";
import { SOLIDS, surfaceHeight, WORLD_BOUNDS } from "../src/sim/world.js";
import { caveOwner, createCaveWorldQueries } from "../src/sim/caveWorld.js";
import type { Capsule, Vec3, WorldQueries } from "../src/sim/types.js";
import { boxDistance } from "../src/world/frame.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import type { Rect } from "../src/world/types.js";
import { caveDaylight, caveLightField, sampleLightField, type CaveLightField } from "../src/render/caves/lightField.js";

// Geometry helpers, as in tests/cave-support.ts (which builds the Fanvault on import).
export const vertex = (m: MeshRecipe, v: number): Vec3 => ({ x: m.positions[v * 3]!, y: m.positions[v * 3 + 1]!, z: m.positions[v * 3 + 2]! });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
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
function triangleGrid(m: MeshRecipe): (p: Vec3, reach: number) => [Vec3, Vec3, Vec3][] {
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

export const DIVER: Capsule = CRAFT_PROFILES.diver;
export const SMALL: Capsule = CRAFT_PROFILES.small;
export const sourceOf = (id: string): CaveSource => {
  const s = AUTHORED_CAVE_SOURCES.find(c => c.id === id);
  if (!s) throw new Error(`unknown cave ${id}`);
  return s;
};

// --- Per-cave kit, built once -----------------------------------------------

export interface CaveKit {
  readonly def: CaveDef;
  readonly volume: CaveVolume;
  readonly shells: { readonly fine: MeshRecipe; readonly coarse: MeshRecipe };
  readonly grids: { readonly fine: ReturnType<typeof triangleGrid>; readonly coarse: ReturnType<typeof triangleGrid> };
  readonly field: CaveLightField;
}
const kits = new Map<string, CaveKit>();
/** Built once per cave; shells, triangle grids and the light field only on
 * first use, so a suite that needs none of them stays small. */
export function kit(id: string): CaveKit {
  let k = kits.get(id);
  if (!k) {
    const def = caveDef(id, worldFloor);
    let shells: CaveKit["shells"] | undefined, grids: CaveKit["grids"] | undefined, field: CaveLightField | undefined;
    const made: CaveKit = {
      def, volume: caveVolume(def),
      get shells() { return shells ??= { fine: caveShell(def, "fine"), coarse: caveShell(def, "coarse") }; },
      get grids() { return grids ??= { fine: triangleGrid(made.shells.fine), coarse: triangleGrid(made.shells.coarse) }; },
      get field() { return field ??= caveLightField(def, worldFloor); },
    };
    kits.set(id, k = made);
  }
  return k;
}
const owns = (r: Rect, x: number, z: number): boolean => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ;
/** The cave owning (x, z), if any. */
export function ownerAt(x: number, z: number): CaveSource | undefined {
  return AUTHORED_CAVE_SOURCES.find(s => owns(s.footprint, x, z));
}
function cell(v: CaveVolume, p: Vec3): number {
  const g = v.grid;
  const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
  return i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz ? -1 : i + g.nx * (j + g.ny * k);
}
/** The room holding a point ("" outside every cave's inside water). */
export function roomAt(p: Vec3): string {
  const o = ownerAt(p.x, p.z);
  if (!o) return "";
  const v = kit(o.id).volume, at = cell(v, p);
  if (at < 0) return "";
  const r = v.room[at]!;
  return r ? v.roomIds[r - 1]! : "";
}
/** Rock as collided and drawn, by the owner's voxels; the heightfield outside. */
export function solidAt(p: Vec3): boolean {
  const o = ownerAt(p.x, p.z);
  if (!o) return p.y < worldFloor(p.x, p.z);
  const v = kit(o.id).volume, at = cell(v, p);
  return at < 0 ? p.y < o.baseY : v.solid[at] === 1;
}
/** Lamp-off glow: the owner's path-length daylight; open water reads 1. */
export function glow(p: Vec3): number {
  const o = ownerAt(p.x, p.z);
  if (!o) return 1;
  const c = sampleLightField(kit(o.id).field, p);
  return caveDaylight(c.r, 0, c.a);
}
export const head = (p: Vec3): Vec3 => ({ ...p, y: p.y + 0.6 });

// Rock solids of every cave on a 2 m bucket grid.
const BUCKET = 2, buckets = new Map<number, Solid[]>(), bucketed = new Set<string>();
const bucketKey = (i: number, k: number): number => (i + 10000) * 20000 + (k + 10000);
function bucketRock(id: string): void {
  if (bucketed.has(id)) return;
  bucketed.add(id);
  for (const s of kit(id).def.rock)
    for (let i = Math.floor(s.min.x / BUCKET); i <= Math.floor(s.max.x / BUCKET); i++)
      for (let k = Math.floor(s.min.z / BUCKET); k <= Math.floor(s.max.z / BUCKET); k++)
        (buckets.get(bucketKey(i, k)) ?? buckets.set(bucketKey(i, k), []).get(bucketKey(i, k))!).push(s);
}
const visited = new WeakMap<Solid, number>();
let visitStamp = 0;
function nearRock(p: Vec3, reach: number, visit: (s: Solid) => boolean | void): void {
  for (const s of AUTHORED_CAVE_SOURCES) {
    const f = s.footprint;
    if (p.x + reach >= f.minX && p.x - reach <= f.maxX && p.z + reach >= f.minZ && p.z - reach <= f.maxZ) bucketRock(s.id);
  }
  const stamp = ++visitStamp;
  for (let i = Math.floor((p.x - reach) / BUCKET); i <= Math.floor((p.x + reach) / BUCKET); i++)
    for (let k = Math.floor((p.z - reach) / BUCKET); k <= Math.floor((p.z + reach) / BUCKET); k++)
      for (const s of buckets.get(bucketKey(i, k)) ?? []) if (visited.get(s) !== stamp) { visited.set(s, stamp); if (visit(s)) return; }
}
const insideBox = (p: Vec3, s: Solid): boolean => p.x > s.min.x && p.x < s.max.x && p.y > s.min.y && p.y < s.max.y && p.z > s.min.z && p.z < s.max.z;
export const inRock = (p: Vec3): boolean => { let hit = false; nearRock(p, 0, s => (hit = insideBox(p, s))); return hit; };
export function rockDistance(p: Vec3, reach = 1): number {
  let best = Infinity;
  nearRock(p, reach, s => { best = Math.min(best, boxDistance(s, p)); return best === 0; });
  return best;
}

// --- Frames: a network in the game world ------------------------------------

/** Each network is checked in its own frame: its caves (and any within
 * 40 m) in the game world. `shift` is always zero since C3; `at` and `back`
 * are kept so the checks read in world coordinates either way. */
export interface Frame {
  readonly ids: readonly string[];
  /** Identity of the frame (caves, extra solids, index). */
  readonly key: string;
  readonly shift: { readonly x: number; readonly z: number };
  readonly world: WorldQueries;
  /** World point to the frame. */
  at(p: Vec3): Vec3;
  /** Frame point back to the world. */
  back(p: Vec3): Vec3;
}
/** Every cave within `reach` of the given ones, so links resolve. */
export function withNeighbourhood(ids: readonly string[], reach = 40): string[] {
  const fs = ids.map(id => sourceOf(id).footprint);
  return AUTHORED_CAVE_SOURCES.filter(s => ids.includes(s.id) || fs.some(f => s.footprint.minX < f.maxX + reach && s.footprint.maxX > f.minX - reach &&
    s.footprint.minZ < f.maxZ + reach && s.footprint.maxZ > f.minZ - reach)).map(s => s.id);
}
const frames = new Map<string, Frame>();
/** The network's caves in the game world as `gameWorld()` composes it (C4):
 * every solid (`SOLIDS`, plus `extra`) on the shared floor, with these caves
 * owning their footprints, at their real coordinates. (Before C3 the frame
 * was shifted into the legacy bounds; that hid a mouth facing the world's
 * edge, so the contract now requires every footprint and its collar band
 * inside WORLD_BOUNDS instead.) */
export function frame(ids: readonly string[], extra: readonly Solid[] = []): Frame {
  const all = withNeighbourhood(ids);
  const key = `${all.join(",")}|${extra.map(s => s.id).join(",")}`;
  const cached = frames.get(key);
  if (cached) return cached;
  const world = createCaveWorldQueries({ solids: [...SOLIDS, ...extra], floor: surfaceHeight, caves: all.map(id => caveOwner(kit(id).def)) });
  const f: Frame = { ids: all, key, shift: { x: 0, z: 0 }, world, at: p => ({ ...p }), back: p => ({ ...p }) };
  frames.set(key, f);
  return f;
}
const dist = (a: Vec3, b: Vec3): number => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

// --- Contract ---------------------------------------------------------------

/** Footprint placement, thick rock and names. */
export function contractFailures(id: string): string[] {
  const out: string[] = [], { def } = kit(id), s = def.source, f = s.footprint;
  // The cave adapter's collar band for a medium hull (2 x 4.5 + 0.5 + 0.5).
  const band = 10;
  const p = LEGACY_PRESERVE;
  if (!(f.maxX + band <= p.minX || f.minX - band >= p.maxX || f.maxZ + band <= p.minZ || f.minZ - band >= p.maxZ))
    out.push(`${id}: footprint and collar band reach the legacy preserve`);
  // The world ends at WORLD_BOUNDS: the footprint, its collar band and every
  // route (mouth approaches included) stay inside it.
  const W = WORLD_BOUNDS;
  if (!(f.minX - band >= W.minX && f.maxX + band <= W.maxX && f.minZ - band >= W.minZ && f.maxZ + band <= W.maxZ))
    out.push(`${id}: footprint and collar band reach the world's edge`);
  for (const r of def.routes) for (const q of r.path)
    if (!(q.x - 2 >= W.minX && q.x + 2 <= W.maxX && q.z - 2 >= W.minZ && q.z + 2 <= W.maxZ)) { out.push(`${r.id}: leaves the world at ${q.x}, ${q.z}`); break; }
  for (const [x, z] of [[f.minX, f.minZ], [f.maxX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.maxZ]] as const)
    if (regionAtPoint(x, z) !== def.region) out.push(`${id}: corner ${x}, ${z} is in ${regionAtPoint(x, z)}`);
  if (!(def.rock.length > 0)) out.push(`${id}: no rock`);
  for (const r of def.rock) {
    for (const a of ["x", "y", "z"] as const) if (r.max[a] - r.min[a] < MIN_ROCK - 1e-9) out.push(`${r.id} is thinner than ${MIN_ROCK} m on ${a}`);
    if (!(r.min.x >= f.minX && r.max.x <= f.maxX && r.min.z >= f.minZ && r.max.z <= f.maxZ)) out.push(`${r.id} leaves the footprint`);
    if (!(r.min.y >= s.baseY && r.max.y <= s.topY)) out.push(`${r.id} leaves the envelope`);
  }
  // Thin rock dropped from art and collision together: next to the cave's
  // water it must stay as rare as the Fanvault's; seabed relief is reported.
  const dropped = droppedVoxels(id);
  if (dropped.wall > dropped.rock * 0.002) out.push(`${id}: ${dropped.wall} thin wall and roof voxels dropped`);
  if (def.bounds.max.y > s.topY - 0.5) out.push(`${id}: rock reaches topY ${s.topY}; raise it`);
  // The base sits well under the lowest seabed, so no owned column is rock
  // thinner than a 2 m cube (which the opening would drop to a hole).
  let lowest = Infinity;
  for (let x = f.minX; x <= f.maxX; x += 0.5) for (let z = f.minZ; z <= f.maxZ; z += 0.5) lowest = Math.min(lowest, worldFloor(x, z));
  if (s.baseY > lowest - 2.5) out.push(`${id}: baseY ${s.baseY} is within 2.5 m of the seabed (${lowest.toFixed(2)})`);
  for (const r of ROUTES) for (const q of r.path) {
    const d = Math.hypot(Math.max(f.minX - q.x, 0, q.x - f.maxX), Math.max(f.minZ - q.z, 0, q.z - f.maxZ));
    if (!(d > r.minHalfWidth + 4)) out.push(`${id}: route ${r.id} passes ${d.toFixed(1)} m from the footprint`);
  }
  for (const site of SITES) if (site.at.x >= f.minX && site.at.x <= f.maxX && site.at.z >= f.minZ && site.at.z <= f.maxZ) out.push(`${id}: site ${site.id} is inside`);
  for (const { id: sid, bounds: b } of [...STRUCTURE_SOLIDS, ...VISTA_SOLIDS])
    if (!(b.max.x < f.minX || b.min.x > f.maxX || b.max.z < f.minZ || b.min.z > f.maxZ)) out.push(`${id}: ${sid} overlaps`);
  const rooms = new Set([...def.rooms.map(r => r.id), "exterior"]);
  for (const q of def.portals) for (const r of q.between) if (!rooms.has(r)) out.push(`${q.id} names ${r}`);
  for (const r of def.rooms) if (!r.id.startsWith(`${id}.`)) out.push(`${r.id} is not namespaced to ${id}`);
  for (const q of [...def.portals, ...def.routes, ...def.staging]) if (!q.id.startsWith(`${id}.`)) out.push(`${q.id} is not namespaced to ${id}`);
  for (const q of def.portals) if (Math.abs(Math.hypot(q.normal.x, q.normal.y, q.normal.z) - 1) > 1e-9 ||
    [q.normal.x, q.normal.y, q.normal.z].filter(v => v !== 0).length !== 1) out.push(`${q.id}: normal is not a unit axis`);
  return out;
}

/** Rock voxels the 2 m opening removed (from art and collision together):
 * `wall` touch the cave's own water within 1 m (thin walls and roofs, which
 * must stay rare); `relief` are seabed bumps narrower than a 2 m cube away
 * from the cave or in a mouth's zone, most of them in the collar band
 * (bounded by COLLAR_STEP). */
export function droppedVoxels(id: string): { wall: number; relief: number; rock: number } {
  const { def, volume: v } = kit(id), g = v.grid;
  let wall = 0, relief = 0;
  for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const at = i + g.nx * (j + g.ny * k);
    if (!v.owned[at] || v.solid[at] || !(v.field[at]! < 0)) continue;
    let touches = false;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (mouthZone(def, p)) { relief++; continue; } // a mouth's sill and lintel meet the seabed's relief
    for (let dk = -2; dk <= 2 && !touches; dk++) for (let dj = -2; dj <= 2 && !touches; dj++) for (let di = -2; di <= 2; di++) {
      const b = at + di + g.nx * (dj + g.ny * dk);
      if (b >= 0 && b < v.room.length && v.room[b] && !(v.field[b]! < 0)) { touches = true; break; }
    }
    if (touches) wall++; else relief++;
  }
  return { wall, relief, rock: def.stats.rockVoxels };
}

// --- Shell and rock agree ----------------------------------------------------

/** Measured shell-to-rock facts per cave, for the handoff. */
export const shellStats = new Map<string, { worst: number; worstCollar: number; buried: number; points: number }>();
/** `stride` samples every nth shell vertex and triangle (1 = all). */
export function shellRockFailures(id: string, stride = 1): string[] {
  const out: string[] = [], { def, volume: v, shells } = kit(id), m = shells.fine, f0 = def.replacementFootprints[0]!;
  // The collar band: within 1 m of an edge facing the heightfield, the shell
  // is snapped to the floor while thin relief may have dropped from the rock,
  // so it is held to the collar step instead (COLLAR_STEP).
  const spans = sharedSpans(f0, caveNeighbours(def));
  const collar = (p: Vec3): boolean => ([["x", f0.minX, p.z], ["x", f0.maxX, p.z], ["z", f0.minZ, p.x], ["z", f0.maxZ, p.x]] as const)
    .some(([axis, at, along]) => Math.abs((axis === "x" ? p.x : p.z) - at) < 1 &&
      !spans.some(s => s.axis === axis && s.at === at && along >= s.lo && along <= s.hi));
  let worst = 0, worstCollar = 0, buried = 0, points = 0, worstAt: Vec3 | null = null;
  const check = (p: Vec3, n: Vec3): void => {
    points++;
    let d = rockDistance(p, 0.5);
    if (d > 0.5) d = rockDistance(p, 2.5);
    if (collar(p)) { worstCollar = Math.max(worstCollar, d); return; }
    if (d > worst) { worst = d; worstAt = p; }
    if (inRock({ x: p.x + n.x * 0.36, y: p.y + n.y * 0.36, z: p.z + n.z * 0.36 })) buried++;
  };
  for (let i = 0; i < m.positions.length / 3; i += stride)
    check(vertex(m, i), { x: m.normals[i * 3]!, y: m.normals[i * 3 + 1]!, z: m.normals[i * 3 + 2]! });
  for (let t = 0; t < m.indices.length; t += 3 * stride) {
    const [a, b, c] = [0, 1, 2].map(k => vertex(m, m.indices[t + k]!)) as [Vec3, Vec3, Vec3];
    const n = cross(sub(b, a), sub(c, a)), l = Math.hypot(n.x, n.y, n.z) || 1;
    check({ x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 }, { x: n.x / l, y: n.y / l, z: n.z / l });
  }
  if (worst > 0.35) out.push(`${id}: shell point ${worst.toFixed(3)} m outside its solids at ${JSON.stringify(worstAt)}`);
  if (worstCollar > COLLAR_STEP) out.push(`${id}: collar shell point ${worstCollar.toFixed(3)} m outside its solids`);
  // W1-pre holds 0.1%; battered terrace faces add voxel-staircase corners, so 0.3%.
  if (buried > Math.max(1, points * 0.003)) out.push(`${id}: ${buried} of ${points} shell points face rock within 0.36 m`);
  shellStats.set(id, { worst, worstCollar, buried, points });
  const g = v.grid;
  let cells = 0;
  for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const at = i + g.nx * (j + g.ny * k);
    if (!v.room[at] || !v.owned[at]) continue;
    cells++;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (inRock(p)) { out.push(`${id}: room cell ${JSON.stringify(p)} is inside rock`); break; }
  }
  if (cells < 400) out.push(`${id}: only ${cells} room cells`);
  // Independently of the voxels: clearly carved source water is never rock,
  // clearly solid source rock (almost) always is.
  const sampler = caveSampler(def.source, worldFloor, caveNeighbours(def)), f = def.replacementFootprints[0]!;
  let water = 0, rock = 0, covered = 0;
  for (let x = f.minX + 0.3; x < f.maxX; x += 0.9) for (let z = f.minZ + 0.3; z < f.maxZ; z += 0.9)
    for (let y = def.source.baseY + 0.3; y < def.source.topY; y += 0.9) {
      const e = sampler.exterior(x, y, z), w = sampler.water(x, y, z).distance;
      if (e < -0.6 && w < -0.6) { water++; if (inRock({ x, y, z })) { out.push(`${id}: carved water at ${x}, ${y}, ${z} is inside rock`); return out; } }
      if (e < -0.6 && w > 0.6) { rock++; if (inRock({ x, y, z })) covered++; }
    }
  if (water < 40) out.push(`${id}: ${water} carved samples`);
  if (covered < rock * 0.995) out.push(`${id}: ${rock - covered} of ${rock} rock samples uncovered`);
  return out;
}

// --- Openings and routes ---------------------------------------------------

/** Points over a portal's clear rectangle, inset by `inset`, every 0.25 m. */
export function aperture(p: CavePortal, inset = 0): Vec3[] {
  const out: Vec3[] = [], w = p.clear.width / 2 - inset, h = p.clear.height / 2 - inset;
  for (let a = -w; a <= w + 1e-9; a += 0.25) for (let b = -h; b <= h + 1e-9; b += 0.25)
    out.push(p.normal.y !== 0 ? { x: p.center.x + a, y: p.center.y, z: p.center.z + b }
      : p.normal.z !== 0 ? { x: p.center.x + a, y: p.center.y + b, z: p.center.z } : { x: p.center.x, y: p.center.y + b, z: p.center.z + a });
  return out;
}
/** The smallest opening each profile is promised (W1-pre mouth target for
 * divers; crawl throats and squeezes may be tighter but never below a
 * diver's box plus a body width). */
export const MOUTH_MIN = { diver: { width: 2.5, height: 2 }, throat: { width: 1.6, height: 1.5 } } as const;

export function openingFailures(id: string): string[] {
  const out: string[] = [], { def } = kit(id), fr = frame([id]);
  const grids = (lod: "fine" | "coarse") => kit(ownerAt(def.portals[0]!.center.x, def.portals[0]!.center.z)?.id ?? id).grids[lod];
  for (const p of def.portals) {
    for (const q of aperture(p)) if (inRock(q)) { out.push(`${p.id}: rock at ${JSON.stringify(q)} inside its ${p.clear.width} x ${p.clear.height} m opening`); break; }
    const owner = ownerAt(p.center.x, p.center.z)?.id;
    for (const lod of ["fine", "coarse"] as const) for (const q of aperture(p, 0.45)) {
      const a = { x: q.x - p.normal.x * 0.3, y: q.y - p.normal.y * 0.3, z: q.z - p.normal.z * 0.3 };
      const b = { x: q.x + p.normal.x * 0.3, y: q.y + p.normal.y * 0.3, z: q.z + p.normal.z * 0.3 };
      const shellIds = owner ? [owner] : [id];
      if (shellIds.some(s => kit(s).grids[lod](q, 0.5).some(([u, v, w]) => segmentHitsTriangle(a, b, u, v, w)))) {
        out.push(`${p.id}: ${lod} shell crosses the opening`); break;
      }
    }
    const min = p.kind === "throat" ? MOUTH_MIN.throat : MOUTH_MIN.diver;
    if (p.kind !== "skylight" && (p.clear.width < min.width || p.clear.height < min.height)) out.push(`${p.id} is below the ${p.kind} minimum`);
    // A mouth that admits only divers must stop the smallest hull.
    if (p.kind === "mouth" && !p.admits.includes("small")) {
      if (p.clear.width >= SMALL.radius * 2 && p.clear.height >= SMALL.height) out.push(`${p.id} would admit a small hull`);
      const keel = { x: p.center.x, y: p.center.y - p.clear.height / 2 + 0.1, z: p.center.z };
      const from = { x: keel.x + p.normal.x * 8, y: keel.y, z: keel.z + p.normal.z * 8 };
      const move = fr.world.moveCapsule(fr.at(from), { x: -p.normal.x * 16, y: 0, z: -p.normal.z * 16 }, SMALL);
      if (!move.hitSolid) out.push(`${p.id}: a small hull swept through`);
    }
  }
  void grids;
  return out;
}

/** Every route: each pose clears for its profile and each segment sweeps
 * through the ownership adapter exactly, with every nearby cave loaded. */
export function routeFailures(id: string): string[] {
  const out: string[] = [], { def } = kit(id), fr = frame([id]);
  for (const r of def.routes) {
    const shape = CRAFT_PROFILES[r.profile], path = r.path.map(p => fr.at(p));
    for (const p of path) if (!fr.world.clearance(p, shape)) out.push(`${r.id}: ${r.profile} blocked at ${JSON.stringify(fr.back(p))}`);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!, move = fr.world.moveCapsule(a, sub(b, a), shape);
      if (move.hitSolid || move.hitBoundary || dist(move.position, b) > 1e-6)
        out.push(`${r.id}: segment ${i} stops at ${JSON.stringify(fr.back(move.position))}`);
    }
    if (r.role !== "exit") {
      const [a, b] = [r.path[0]!, r.path[r.path.length - 1]!];
      if (roomAt(a) !== "" || roomAt(b) !== "") out.push(`${r.id}: a ${r.role} route must start and end in open water`);
    } else if (roomAt(r.path[r.path.length - 1]!) !== "" && r.path[r.path.length - 1]!.y + AIRWAY < 0) out.push(`${r.id}: an exit route must end in open water or air`);
  }
  return out;
}

// --- Roof ---------------------------------------------------------------------

const nearMouth = (d: CaveDef, p: Vec3): boolean => d.portals.some(m => m.kind === "mouth" &&
  Math.abs((p.z - m.center.z) * m.normal.z + (p.x - m.center.x) * m.normal.x) < 2.5 &&
  Math.abs(m.normal.z !== 0 ? p.x - m.center.x : p.z - m.center.z) < m.clear.width / 2 + 2.5);
const shaftRooms = (d: CaveDef): Set<number> => new Set(d.rooms.flatMap((r, i) => r.role === "shaft" ? [i + 1] : []));
const underShaft = (d: CaveDef, p: Vec3, margin = 0.5): boolean => d.source.carves.some(c => c.kind === "shaft" &&
  Math.hypot(p.x - c.center[0], p.z - c.center[1]) <= c.radius + c.flare + c.wobble + margin);
/** Cave water meeting open water straight above it, outside the shafts'
 * own water and the mouths' lintel zones: roof holes (owned columns only).
 * A mouth's zone reaches 2.5 m either side of it (W1-pre), or half its
 * width plus a metre for a hull mouth, whose wide tube leaves a longer sill
 * groove in the seabed. */
export function mouthZone(d: CaveDef, p: Vec3): boolean {
  const reach = (m: CavePortal): number => m.admits.some(a => a !== "diver") ? Math.max(2.5, m.clear.width / 2 + 1) : 2.5;
  return d.portals.some(m => m.kind === "mouth" &&
    Math.abs((p.z - m.center.z) * m.normal.z + (p.x - m.center.x) * m.normal.x) < reach(m) &&
    Math.abs(m.normal.z !== 0 ? p.x - m.center.x : p.z - m.center.z) < m.clear.width / 2 + 2 && p.y < m.center.y + m.clear.height / 2 + 2.5);
}
export function roofHoles(d: CaveDef): Vec3[] {
  const v = caveVolume(d), g = v.grid, shafts = shaftRooms(d), holes: Vec3[] = [];
  for (let k = 0; k < g.nz; k++) for (let j = 0; j + 1 < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const at = i + g.nx * (j + g.ny * k), up = at + g.nx, r = v.room[at]!;
    if (!r || !v.owned[at] || v.solid[up] || v.room[up] || shafts.has(r)) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (!mouthZone(d, p)) holes.push(p);
  }
  return holes;
}
export function roofFailures(id: string): string[] {
  const out: string[] = [], { def } = kit(id), fr = frame([id]), f = def.replacementFootprints[0]!;
  const inFoot = (p: Vec3): boolean => p.x > f.minX + 1 && p.x < f.maxX - 1 && p.z > f.minZ + 1 && p.z < f.maxZ - 1;
  const probes = [
    ...def.routes.filter(r => r.profile === "diver").flatMap(r => r.path).filter(inFoot),
    ...def.rooms.filter(r => r.role !== "shaft").map(r => ({ x: (r.bounds.min.x + r.bounds.max.x) / 2, y: r.bounds.min.y + 1.2, z: (r.bounds.min.z + r.bounds.max.z) / 2 })),
  ].map(p => ({ ...p, x: Math.floor(p.x * 2) / 2 + 0.25, z: Math.floor(p.z * 2) / 2 + 0.25 }))
    .filter(p => inFoot(p) && roomAt({ ...p, y: p.y + 0.5 }).startsWith(`${id}.`) && !underShaft(def, p) && !nearMouth(def, p) &&
      fr.world.clearance(fr.at(p), DIVER) && p.y < -2);
  if (probes.length < 2) out.push(`${id}: only ${probes.length} roof probes`);
  for (const p of probes) {
    const w = fr.at(p), top = fr.world.supportHeight(w.x, w.z, 1000);
    if (top > -0.3) continue; // a waterline roof: open air above is the island
    const stand = Math.max(...[-1, 1].flatMap(a => [-1, 1].map(b => fr.world.supportHeight(w.x + a * DIVER.radius, w.z + b * DIVER.radius, 1000))));
    if (!(fr.world.supportHeight(w.x, w.z, p.y) <= p.y + 1e-9)) out.push(`${id}: support below ${JSON.stringify(p)} is the roof`);
    const over = def.rock.filter(s => p.x > s.min.x && p.x < s.max.x && p.z > s.min.z && p.z < s.max.z && s.min.y >= p.y + DIVER.height);
    const ceiling = Math.min(...over.map(s => s.min.y));
    if (!(Number.isFinite(ceiling) && top - ceiling >= MIN_ROCK - 1e-9)) out.push(`${id}: roof over ${JSON.stringify(p)} is ${(top - ceiling).toFixed(2)} m`);
    const above = { x: w.x, y: stand + 0.01, z: w.z };
    if (!fr.world.clearance(above, DIVER)) out.push(`${id}: no room on the roof over ${JSON.stringify(p)}`);
    const sink = fr.world.moveCapsule({ ...above, y: stand + 1 }, { x: 0, y: -3, z: 0 }, DIVER);
    if (!(sink.hitSolid && sink.position.y >= stand - 1e-6)) out.push(`${id}: a diver sinks through the roof over ${JSON.stringify(p)}`);
    // Both LODs draw a surface across the roof top: fine at this column,
    // coarse (1 m voxels, may sit up to a voxel aside on a battered face)
    // within half a metre of it.
    for (const lod of ["fine", "coarse"] as const) {
      const offsets = lod === "fine" ? [[0, 0]] : [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]];
      const hit = offsets.some(([dx, dz]) => {
        const a = { x: p.x + dx!, y: top + 0.6, z: p.z + dz! }, b = { x: p.x + dx!, y: top - (lod === "fine" ? 0.8 : 1.6), z: p.z + dz! };
        return kit(id).grids[lod]({ x: p.x, y: top, z: p.z }, 2.3).some(([u, v, ww]) => segmentHitsTriangle(a, b, u, v, ww));
      });
      if (!hit) out.push(`${id}: ${lod} shell has no roof top over ${JSON.stringify(p)}`);
    }
  }
  const holes = roofHoles(def);
  if (holes.length) out.push(`${id}: ${holes.length} roof holes, first ${JSON.stringify(holes[0])}`);
  return out;
}

// --- LOD ----------------------------------------------------------------------

/** Neither shell comes within reach of any route: 0.6 m round a diver's
 * head line, or inside a hull's box, at either LOD (W1-pre's check, and
 * coarse water contains all fine water by construction). */
export function lodFailures(id: string): string[] {
  const out: string[] = [], { def, shells } = kit(id);
  for (const r of def.routes) for (let i = 1; i < r.path.length; i++) {
    const a = r.path[i - 1]!, b = r.path[i]!, steps = Math.ceil(dist(a, b) / 0.25), shape = CRAFT_PROFILES[r.profile];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      const owner = ownerAt(p.x, p.z)?.id;
      if (!owner) continue;
      for (const lod of ["fine", "coarse"] as const) {
        if (r.profile === "diver") {
          // Feet above a swimmer's surface line (-0.5) are a diver standing on
          // rock (a wading shelf, a dry ledge): clear the body above the floor.
          const q = { ...p, y: p.y + (p.y > -0.5 + 1e-6 ? 1.1 : 0.45) };
          if (kit(owner).grids[lod](q, 0.8).some(([u, v, w]) => pointTriangleDistance(q, u, v, w) < 0.6)) {
            out.push(`${r.id}: ${lod} shell within 0.6 m at ${JSON.stringify(q)}`); break;
          }
        } else {
          const c = { ...p, y: p.y + shape.height / 2 }, reach = Math.hypot(shape.radius, shape.height / 2);
          const hit = kit(owner).grids[lod](c, reach).some(tri => tri.some(q => Math.abs(q.x - p.x) < shape.radius - 0.25 &&
            Math.abs(q.z - p.z) < shape.radius - 0.25 && q.y > p.y + 0.25 && q.y < p.y + shape.height - 0.25));
          if (hit) { out.push(`${r.id}: ${lod} shell inside the ${r.profile} hull at ${JSON.stringify(p)}`); break; }
        }
      }
    }
  }
  if (!(shells.coarse.positions.length < shells.fine.positions.length / 2.5)) out.push(`${id}: coarse is not coarser`);
  return out;
}

// --- Seams and collar ---------------------------------------------------------

/** Linked caves meet exactly: identical shell vertices on the shared edge
 * at both LODs, and identical rock voxels within 3 m of it. */
export function seamFailures(id: string): string[] {
  const out: string[] = [], { def } = kit(id), f = def.replacementFootprints[0]!;
  for (const n of caveNeighbours(def)) for (const span of sharedSpans(f, [n])) {
    for (const lod of ["fine", "coarse"] as const) {
      const on = (m: MeshRecipe): string[] => {
        const keys: string[] = [];
        for (let v = 0; v < m.positions.length / 3; v++) {
          const p = vertex(m, v), u = span.axis === "x" ? p.x : p.z, w = span.axis === "x" ? p.z : p.x;
          if (Math.abs(u - span.at) < 1e-6 && w > span.lo + 1e-6 && w < span.hi - 1e-6) keys.push(`${w.toFixed(3)},${p.y.toFixed(3)}`);
        }
        return [...new Set(keys)].sort();
      };
      const mine = on(kit(id).shells[lod]), theirs = on(kit(n.id).shells[lod]);
      const a = new Set(mine), b = new Set(theirs), missing = mine.filter(k => !b.has(k)).concat(theirs.filter(k => !a.has(k)));
      if (missing.length) out.push(`${id}|${n.id} ${lod}: ${missing.length} of ${mine.length + theirs.length} seam vertices unmatched, first ${missing[0]}`);
      if (!mine.length) out.push(`${id}|${n.id} ${lod}: no shell on the shared edge`);
    }
    const va = kit(id).volume, vb = kit(n.id).volume;
    let differ = 0;
    for (let x = (span.axis === "x" ? span.at - 2.75 : span.lo + 0.25); x < (span.axis === "x" ? span.at + 3 : span.hi); x += 0.5)
      for (let z = (span.axis === "z" ? span.at - 2.75 : span.lo + 0.25); z < (span.axis === "z" ? span.at + 3 : span.hi); z += 0.5)
        for (let y = def.source.baseY + 0.25; y < def.source.topY; y += 0.5) {
          const p = { x, y, z }, ia = cell(va, p), ib = cell(vb, p);
          if (ia >= 0 && ib >= 0 && va.solid[ia] !== vb.solid[ib]) differ++;
        }
    if (differ) out.push(`${id}|${n.id}: ${differ} rock voxels near the seam disagree`);
  }
  return out;
}
/** Largest collision step where a cave's collar meets the heightfield. The
 * W1-pre Fanvault holds 0.75 m on a smooth shelf; on rougher seabed a 2 m
 * cube cannot fit a strip of micro-relief squeezed against the footprint
 * edge, so up to one more 0.5 m voxel layer drops there (art is snapped to
 * the floor at the edge either way). */
export const COLLAR_STEP = 2;
/** Worst collar step measured per cave, for the handoff. */
export const collarSteps = new Map<string, number>();
/** The collar meets the heightfield on every non-shared edge. */
export function collarFailures(id: string): string[] {
  const out: string[] = [], { def, shells } = kit(id), fr = frame([id]), f = def.replacementFootprints[0]!;
  const spans = sharedSpans(f, caveNeighbours(def));
  const shared = (axis: "x" | "z", at: number, along: number): boolean => spans.some(s => s.axis === axis && s.at === at && along >= s.lo - 0.5 && along <= s.hi + 0.5);
  const edge: [number, number, number, number][] = [];
  for (let u = f.minX + 0.5; u < f.maxX; u += 1) {
    if (!shared("z", f.minZ, u)) edge.push([u, f.minZ + 0.25, u, f.minZ - 0.25]);
    if (!shared("z", f.maxZ, u)) edge.push([u, f.maxZ - 0.25, u, f.maxZ + 0.25]);
  }
  for (let u = f.minZ + 0.5; u < f.maxZ; u += 1) {
    if (!shared("x", f.minX, u)) edge.push([f.minX + 0.25, u, f.minX - 0.25, u]);
    if (!shared("x", f.maxX, u)) edge.push([f.maxX - 0.25, u, f.maxX + 0.25, u]);
  }
  // Collision just inside the edge against the heightfield at the same
  // column (W1-pre compared a point 0.5 m outside, which on a steep flank
  // measures the slope, not the seam).
  let worstStep = 0;
  for (const [x, z, ox, oz] of edge) {
    if (ownerAt(ox, oz)) continue;
    const w = fr.at({ x, y: 0, z }), top = fr.world.supportHeight(w.x, w.z, 1000), floor = worldFloor(x, z);
    worstStep = Math.max(worstStep, Math.abs(top - floor));
    if (Math.abs(top - floor) > COLLAR_STEP) { out.push(`${id}: collar step ${(top - floor).toFixed(2)} m at ${x}, ${z}`); break; }
  }
  collarSteps.set(id, worstStep);
  for (const m of [shells.fine, shells.coarse]) for (let v = 0; v < m.positions.length / 3; v++) {
    const p = vertex(m, v);
    const sides: ["x" | "z", number, number][] = [["x", f.minX, p.z], ["x", f.maxX, p.z], ["z", f.minZ, p.x], ["z", f.maxZ, p.x]];
    if (!sides.some(([axis, at, along]) => Math.abs((axis === "x" ? p.x : p.z) - at) < 1e-6 && !shared(axis, at, along))) continue;
    if (spans.some(s => (s.axis === "x" ? Math.abs(p.x - s.at) : Math.abs(p.z - s.at)) < 1e-6 &&
      (s.axis === "x" ? p.z : p.x) >= s.lo - 1e-6 && (s.axis === "x" ? p.z : p.x) <= s.hi + 1e-6)) continue; // a seam vertex
    if (Math.abs(p.y - worldFloor(p.x, p.z)) >= 1e-4) { out.push(`${id}: collar vertex ${p.y.toFixed(2)} vs floor ${worldFloor(p.x, p.z).toFixed(2)}`); break; }
  }
  return out;
}

// --- Lamp-off retreat -------------------------------------------------------

/** Feet to airway when swimming (sim/survival.ts). */
export const AIRWAY = 0.85;
export interface Retreat { failures: string[]; exits: Record<string, number>; hops: number; paths: { start: Vec3; length: number; exit: string }[] }
const spotCache = new Map<string, { p: Vec3; rank: number }[]>();
/** Drop cached retreat spots (a long suite frees them between networks). */
export const clearRetreatCache = (): void => spotCache.clear();
/** The lamp-off retreat over a frame (W1-pre's policy, across linked
 * caves). An unlit diver uses only what it sees: from the current pose,
 * among water in clear sight within 7 m whose glow is brighter, it takes the
 * brightest the full diver can actually reach (destination clears, the
 * adapter sweep from the last accepted pose arrives). Open water outside
 * ranks above any lit water inside. Success is clear lit exterior water
 * entered through a mouth or skylight. Each path's swum length is kept. */
export function retreat(fr: Frame, starts: readonly Vec3[], world: WorldQueries = fr.world): Retreat {
  const exterior = (p: Vec3): boolean => roomAt(p) === "" && roomAt(head(p)) === "" && roomAt({ ...p, y: p.y + 0.95 }) === "";
  // The sim breathes wherever the airway (feet + 0.85 m) is above the water.
  // Surfacing under open sky (a chimney, a skylight) is a way out; an air
  // pocket under rock is breath, not an exit, so it only ranks by its glow.
  const openAbove = (p: Vec3): boolean => {
    for (let y = p.y + 1; y < 40; y += 0.5) if (solidAt({ ...p, y })) return false;
    return true;
  };
  const air = (p: Vec3): boolean => p.y + AIRWAY >= 0 && openAbove(p);
  const rank = (p: Vec3): number => air(p) ? 2 : glow(head(p)) + (exterior(p) ? 0.01 : 0);
  const clearSight = (a: Vec3, b: Vec3): boolean => {
    const steps = Math.ceil(dist(a, b) / 0.25);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (solidAt({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  };
  const key = fr.key + (world === fr.world ? "" : "|other world");
  let spots = spotCache.get(key);
  if (!spots) {
    const seen = new Set<string>();
    spots = [];
    for (const id of fr.ids) {
      const g = kit(id).volume.grid;
      for (let k = 0; k < g.nz; k += 2) for (let j = 0; j < g.ny; j += 2) for (let i = 0; i < g.nx; i += 2) {
        const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel }, s = `${p.x},${p.y},${p.z}`;
        if (seen.has(s) || p.y > 0.5) continue;
        seen.add(s);
        if (!solidAt(p) && world.clearance(fr.at(p), DIVER)) spots.push({ p, rank: rank(p) });
      }
    }
    spotCache.set(key, spots);
  }
  const grid = new Map<string, { p: Vec3; rank: number }[]>(), G = 7;
  const gk = (x: number, y: number, z: number): string => `${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`;
  for (const s of spots) { const k = gk(s.p.x, s.p.y, s.p.z); (grid.get(k) ?? grid.set(k, []).get(k)!).push(s); }
  const around = (p: Vec3): { p: Vec3; rank: number }[] => {
    const out: { p: Vec3; rank: number }[] = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++)
      out.push(...(grid.get(gk(p.x + a * G, p.y + b * G, p.z + c * G)) ?? []));
    return out;
  };
  const openings = fr.ids.flatMap(id => kit(id).def.portals.filter(o => o.kind === "mouth" || o.kind === "skylight"));
  const openingOf = (a: Vec3, b: Vec3): string | null => {
    for (let s = 0; s <= 40; s++) {
      const t = s / 40, w = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      if (roomAt(w) !== "") continue;
      return openings.find(o => {
        const along = (w.x - o.center.x) * o.normal.x + (w.y - o.center.y) * o.normal.y + (w.z - o.center.z) * o.normal.z;
        const off = { x: w.x - o.center.x - o.normal.x * along, y: w.y - o.center.y - o.normal.y * along, z: w.z - o.center.z - o.normal.z * along };
        return Math.abs(along) < 3 && Math.hypot(off.x, off.y, off.z) < Math.hypot(o.clear.width, o.clear.height) / 2 + 1.5;
      })?.id ?? null;
    }
    return null;
  };
  const result: Retreat = { failures: [], exits: {}, hops: 0, paths: [] };
  for (const start of starts) {
    if (!world.clearance(fr.at(start), DIVER)) { result.failures.push(`start ${JSON.stringify(start)} is not a diver pose`); continue; }
    let at = start, exit: string | null = null, lost: string | null = null, length = 0, lastFrom: Vec3 = start;
    // Out through an opening and on into fully lit water, or up into air.
    let left = air(at);
    if (left) exit = `air:${roomAt(at) || "exterior"}`; // already breathing
    for (let hop = 0; !air(at) && !(left && exterior(at) && glow(head(at)) === 1); hop++) {
      if (hop >= 40) { lost = `lost from ${JSON.stringify(start)} at ${JSON.stringify(at)}`; break; }
      const here = rank(at);
      const options = around(at).filter(o => o.rank > here + 1e-3 && dist(o.p, at) <= 7)
        .sort((x, y) => y.rank - x.rank || Math.hypot(x.p.x - at.x, x.p.z - at.z) - Math.hypot(y.p.x - at.x, y.p.z - at.z));
      let next: Vec3 | null = null;
      for (const o of options) {
        if (!clearSight(head(at), head(o.p))) continue;
        const r = world.moveCapsule(fr.at(at), sub(o.p, at), DIVER);
        if (r.hitSolid || r.hitBoundary || dist(fr.back(r.position), o.p) > 1e-6) continue;
        next = o.p; break;
      }
      if (!next) { lost = `no brighter water a diver can reach from ${JSON.stringify(at)} (glow ${here.toFixed(2)})`; break; }
      if (air(next) && !left) { exit = `air:${roomAt(at) || "exterior"}`; left = true; }
      else if (exterior(next) && !left) { exit = openingOf(at, next); lastFrom = at; left = true; }
      length += dist(at, next); at = next; result.hops++;
    }
    if (lost) result.failures.push(lost);
    else if (!exit) result.failures.push(`left ${JSON.stringify(start)} without passing a mouth or skylight (last hop ${JSON.stringify(lastFrom)} to ${JSON.stringify(at)})`);
    else if (!world.clearance(fr.at(at), DIVER) || (!air(at) && glow(head(at)) !== 1)) result.failures.push(`arrival ${JSON.stringify(at)} is not clear lit water or air`);
    else { result.exits[exit] = (result.exits[exit] ?? 0) + 1; result.paths.push({ start, length, exit }); }
  }
  return result;
}
/** Starts: every metre along a cave's diver routes inside it, and a floor
 * pose in every room it owns. */
export function retreatStarts(id: string): Vec3[] {
  const { def } = kit(id), fr = frame([id]), mine = (p: Vec3): boolean => roomAt(head(p)).startsWith(`${id}.`);
  const along = def.routes.filter(r => r.profile === "diver").flatMap(r => r.path.slice(1).flatMap((b, i) => {
    const a = r.path[i]!, n = Math.ceil(dist(a, b));
    return Array.from({ length: n }, (_, s) => ({ x: a.x + (b.x - a.x) * s / n, y: a.y + (b.y - a.y) * s / n, z: a.z + (b.z - a.z) * s / n }));
  })).filter(mine);
  return [...along, ...roomPoses(id)].filter(p => fr.world.clearance(fr.at(p), DIVER));
}
/** One clear diver pose per room, nearest the room's centre, on its water. */
export function roomPoses(id: string): Vec3[] {
  const { def, volume: v } = kit(id), fr = frame([id]), g = v.grid, out: Vec3[] = [];
  def.rooms.forEach((r, ri) => {
    const c = { x: (r.bounds.min.x + r.bounds.max.x) / 2, y: (r.bounds.min.y + r.bounds.max.y) / 2, z: (r.bounds.min.z + r.bounds.max.z) / 2 };
    let best: Vec3 | null = null, bestD = Infinity;
    for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const at = i + g.nx * (j + g.ny * k);
      if (v.room[at] !== ri + 1 || !v.owned[at]) continue;
      const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + j * g.voxel + 0.01, z: g.origin.z + (k + 0.5) * g.voxel };
      const d = dist(p, c);
      if (d < bestD && roomAt(head(p)) === r.id && fr.world.clearance(fr.at(p), DIVER)) { bestD = d; best = p; }
    }
    if (best) out.push(best);
  });
  return out;
}
/** Solids plugging every mouth and skylight of the given caves. */
export function plugs(ids: readonly string[]): Solid[] {
  return ids.flatMap(id => kit(id).def.portals.filter(o => o.kind === "mouth" || o.kind === "skylight").map((o, i) => {
    const w = o.clear.width / 2 + 2, h = o.clear.height / 2 + 2, t = 1;
    const half = o.normal.y !== 0 ? { x: w, y: t, z: h } : o.normal.z !== 0 ? { x: w, y: h, z: t } : { x: t, y: h, z: w };
    return { id: `test.plug.${id}.${i}`, min: { x: o.center.x - half.x, y: o.center.y - half.y, z: o.center.z - half.z },
      max: { x: o.center.x + half.x, y: o.center.y + half.y, z: o.center.z + half.z } };
  }));
}
