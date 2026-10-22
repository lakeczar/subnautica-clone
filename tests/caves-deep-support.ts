// CA-3 deep-cave checks, generic over every cave (not a test file itself).
// Each check returns a list of problems (empty = pass) so the tests assert
// `[]` and print what broke, and the dev loop can call the same code.
import { CAVE_SOURCES, EXTERIOR, MIN_ROCK, type CaveDef, type CavePortal } from "../src/content/regions/caves.js";
import { buildCave, caveShell, caveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { CRAFT_PROFILES, type CraftProfileId } from "../src/content/regions/passages.js";
import { DEEP_CAVES, sampleDeepHazards } from "../src/content/regions/caves/deep.js";
import type { DeepCave } from "../src/content/regions/caves/deepKit.js";
import { caveOwner, createCaveWorldQueries, SOLIDS, surfaceHeight, type Solid } from "../src/sim/world.js";
import type { Capsule, Vec3, WorldQueries } from "../src/sim/types.js";
import { boxDistance } from "../src/world/frame.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import { caveDaylight, caveLightField, sampleLightField, type CaveLightField } from "../src/render/caves/lightField.js";
import { EXPOSURE, UNPROTECTED } from "../src/content/ecology/hazards.js";
import { stepExposure } from "../src/sim/ecology/hazards.js";
import { ECOLOGY_DT, MAX_WARNING_AGE } from "../src/sim/ecology/types.js";
import { SUIT_OXYGEN_DRAIN_PER_SECOND } from "../src/sim/survival.js";

export const DIVER: Capsule = CRAFT_PROFILES.diver;
export const profile = (p: CraftProfileId): Capsule => CRAFT_PROFILES[p];
/** Ordinary (unsprinted) swim speed, step.ts. */
export const SWIM_SPEED = 3.4;
const ROOT_IDS = new Set(CAVE_SOURCES.map(s => s.id));

// --- Built caves and the world with them -----------------------------------------

const defs = new Map<string, CaveDef>();
export function defOf(c: DeepCave): CaveDef {
  let d = defs.get(c.source.id);
  if (!d) defs.set(c.source.id, d = buildCave(c.source, worldFloor));
  return d;
}
export const deepDefs = (): CaveDef[] => DEEP_CAVES.map(defOf);
let deep: WorldQueries | null = null;
/** The exterior world as it will be once registered: every solid, the shared
 * floor, root's caves and these caves owning their footprints. */
export function deepWorld(): WorldQueries {
  if (!deep) {
    const root = CAVE_SOURCES.filter(s => !DEEP_CAVES.some(c => c.source.id === s.id)).map(s => buildCave(s, worldFloor));
    deep = createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight, caves: [...root, ...deepDefs()].map(caveOwner) });
  }
  return deep;
}
/** A one-cave world with extra exterior solids, for negative controls. */
export function worldWith(c: DeepCave, extra: readonly Solid[]): WorldQueries {
  return createCaveWorldQueries({ solids: [...SOLIDS, ...extra], floor: surfaceHeight, caves: [caveOwner(defOf(c))] });
}
export const rootCaveIds = (): ReadonlySet<string> => ROOT_IDS;

// --- Per-cave spatial helpers ------------------------------------------------------

export interface Probe {
  readonly cave: DeepCave;
  readonly def: CaveDef;
  inRock(p: Vec3): boolean;
  rockDistance(p: Vec3, reach?: number): number;
  roomAt(p: Vec3): string;
  inside(p: Vec3): boolean;
  shell(lod: "fine" | "coarse"): MeshRecipe;
  triangles(lod: "fine" | "coarse", p: Vec3, reach: number): [Vec3, Vec3, Vec3][];
}
const probes = new Map<string, Probe>();
export function probeOf(c: DeepCave): Probe {
  const cached = probes.get(c.source.id);
  if (cached) return cached;
  const def = defOf(c), BUCKET = 2, buckets = new Map<number, Solid[]>();
  const key = (i: number, k: number): number => (i + 20000) * 40000 + (k + 20000);
  for (const s of def.rock)
    for (let i = Math.floor(s.min.x / BUCKET); i <= Math.floor(s.max.x / BUCKET); i++)
      for (let k = Math.floor(s.min.z / BUCKET); k <= Math.floor(s.max.z / BUCKET); k++)
        (buckets.get(key(i, k)) ?? buckets.set(key(i, k), []).get(key(i, k))!).push(s);
  const near = (p: Vec3, reach: number, visit: (s: Solid) => boolean | void): void => {
    const seen = new Set<Solid>();
    for (let i = Math.floor((p.x - reach) / BUCKET); i <= Math.floor((p.x + reach) / BUCKET); i++)
      for (let k = Math.floor((p.z - reach) / BUCKET); k <= Math.floor((p.z + reach) / BUCKET); k++)
        for (const s of buckets.get(key(i, k)) ?? []) if (!seen.has(s)) { seen.add(s); if (visit(s)) return; }
  };
  const within = (p: Vec3, s: Solid): boolean => p.x > s.min.x && p.x < s.max.x && p.y > s.min.y && p.y < s.max.y && p.z > s.min.z && p.z < s.max.z;
  const vol = caveVolume(def), g = vol.grid, f = def.replacementFootprints[0]!;
  const lazy: Partial<Record<"fine" | "coarse", { mesh: MeshRecipe; grid: Map<string, number[]> }>> = {};
  const shellOf = (lod: "fine" | "coarse") => {
    let s = lazy[lod];
    if (!s) {
      const mesh = caveShell(def, lod), grid = new Map<string, number[]>();
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const vs = [0, 1, 2].map(k => vertex(mesh, mesh.indices[t + k]!));
        const lo = (a: "x" | "y" | "z"): number => Math.floor(Math.min(...vs.map(q => q[a])) / 2);
        const hi = (a: "x" | "y" | "z"): number => Math.floor(Math.max(...vs.map(q => q[a])) / 2);
        for (let i = lo("x"); i <= hi("x"); i++) for (let j = lo("y"); j <= hi("y"); j++) for (let k = lo("z"); k <= hi("z"); k++) {
          const id = `${i},${j},${k}`;
          (grid.get(id) ?? grid.set(id, []).get(id)!).push(t);
        }
      }
      s = lazy[lod] = { mesh, grid };
    }
    return s;
  };
  const probe: Probe = {
    cave: c, def,
    inRock: p => { let hit = false; near(p, 0, s => (hit = within(p, s))); return hit; },
    rockDistance: (p, reach = 1) => { let best = Infinity; near(p, reach, s => { best = Math.min(best, boxDistance(s, p)); return best === 0; }); return best; },
    roomAt: p => {
      const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
      if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return "";
      const r = vol.room[i + g.nx * (j + g.ny * k)]!;
      return r ? vol.roomIds[r - 1]! : "";
    },
    inside: p => p.x > f.minX && p.x < f.maxX && p.z > f.minZ && p.z < f.maxZ,
    shell: lod => shellOf(lod).mesh,
    triangles: (lod, p, reach) => {
      const { mesh, grid } = shellOf(lod), seen = new Set<number>(), out: [Vec3, Vec3, Vec3][] = [];
      for (let i = Math.floor((p.x - reach) / 2); i <= Math.floor((p.x + reach) / 2); i++)
        for (let j = Math.floor((p.y - reach) / 2); j <= Math.floor((p.y + reach) / 2); j++)
          for (let k = Math.floor((p.z - reach) / 2); k <= Math.floor((p.z + reach) / 2); k++)
            for (const t of grid.get(`${i},${j},${k}`) ?? []) if (!seen.has(t)) {
              seen.add(t); out.push([vertex(mesh, mesh.indices[t]!), vertex(mesh, mesh.indices[t + 1]!), vertex(mesh, mesh.indices[t + 2]!)]);
            }
      return out;
    },
  };
  probes.set(c.source.id, probe);
  return probe;
}

// --- Geometry helpers ----------------------------------------------------------------

export const vertex = (m: MeshRecipe, i: number): Vec3 => ({ x: m.positions[i * 3]!, y: m.positions[i * 3 + 1]!, z: m.positions[i * 3 + 2]! });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const fmt = (p: Vec3): string => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
export function segmentHitsTriangle(p: Vec3, q: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const s = sub(p, a), u = dot(s, h) / det;
  if (u < 0 || u > 1) return false;
  const r = cross(s, e1), w = dot(d, r) / det;
  if (w < 0 || u + w > 1) return false;
  const t = dot(e2, r) / det;
  return t >= 0 && t <= 1;
}
export function pointTriangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  const at = (u: number, w: number): number => dist(p, { x: a.x + ab.x * u + ac.x * w, y: a.y + ab.y * u + ac.y * w, z: a.z + ab.z * u + ac.z * w });
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
  const den = 1 / (va + vb + vc);
  return at(vb * den, vc * den);
}
/** Points over a portal's clear rectangle, inset by `inset`, every 0.25 m. */
export function aperture(p: CavePortal, inset = 0): Vec3[] {
  const out: Vec3[] = [], w = p.clear.width / 2 - inset, h = p.clear.height / 2 - inset;
  for (let a = -w; a <= w + 1e-9; a += 0.25) for (let b = -h; b <= h + 1e-9; b += 0.25)
    out.push(p.normal.y !== 0 ? { x: p.center.x + a, y: p.center.y, z: p.center.z + b }
      : p.normal.z !== 0 ? { x: p.center.x + a, y: p.center.y + b, z: p.center.z } : { x: p.center.x, y: p.center.y + b, z: p.center.z + a });
  return out;
}
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

// --- Checks --------------------------------------------------------------------------

/** The rock solids cover exactly the owned rock voxels: every owned voxel is
 * rock in the volume iff some solid contains its centre. With that, rock
 * distance and containment can be read from the voxels. */
export function rockUnionProblems(c: DeepCave): string[] {
  const def = defOf(c), v = caveVolume(def), g = v.grid, covered = new Uint8Array(v.solid.length);
  for (const s of def.rock) {
    const i0 = Math.round((s.min.x - g.origin.x) / g.voxel), i1 = Math.round((s.max.x - g.origin.x) / g.voxel);
    const j0 = Math.round((s.min.y - g.origin.y) / g.voxel), j1 = Math.round((s.max.y - g.origin.y) / g.voxel);
    const k0 = Math.round((s.min.z - g.origin.z) / g.voxel), k1 = Math.round((s.max.z - g.origin.z) / g.voxel);
    for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) covered[i + g.nx * (j + g.ny * k)] = 1;
  }
  let extra = 0, missing = 0;
  for (let at = 0; at < covered.length; at++) {
    const rock = v.owned[at]! && v.solid[at]!;
    if (covered[at] && !rock) extra++;
    if (rock && !covered[at]) missing++;
  }
  return extra || missing ? [`${c.source.id}: solids cover ${extra} non-rock voxels and miss ${missing} rock voxels`] : [];
}
/** Distance from a point to the nearest owned rock voxel, up to `reach`. */
function voxelRockDistance(def: CaveDef, p: Vec3, reach: number): number {
  const v = caveVolume(def), g = v.grid, r = Math.ceil(reach / g.voxel);
  const ci = Math.floor((p.x - g.origin.x) / g.voxel), cj = Math.floor((p.y - g.origin.y) / g.voxel), ck = Math.floor((p.z - g.origin.z) / g.voxel);
  let best = Infinity;
  for (let k = ck - r; k <= ck + r; k++) for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
    if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) continue;
    const at = i + g.nx * (j + g.ny * k);
    if (!v.owned[at] || !v.solid[at]) continue;
    const x0 = g.origin.x + i * g.voxel, y0 = g.origin.y + j * g.voxel, z0 = g.origin.z + k * g.voxel;
    const dx = Math.max(x0 - p.x, 0, p.x - x0 - g.voxel), dy = Math.max(y0 - p.y, 0, p.y - y0 - g.voxel), dz = Math.max(z0 - p.z, 0, p.z - z0 - g.voxel);
    best = Math.min(best, Math.hypot(dx, dy, dz));
  }
  return best;
}
function voxelInRock(def: CaveDef, p: Vec3): boolean {
  const v = caveVolume(def), g = v.grid;
  const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return false;
  const at = i + g.nx * (j + g.ny * k);
  return !!(v.owned[at] && v.solid[at]);
}

/** Shell and rock agree: the solids are exactly the owned rock voxels, every
 * fine shell point lies within 0.35 m of rock and seldom faces rock, no room
 * cell is rock, and no solid is thinner than MIN_ROCK. */
export function shellProblems(c: DeepCave): string[] {
  const pr = probeOf(c), def = pr.def, out: string[] = [...rockUnionProblems(c)], m = pr.shell("fine");
  let worst = 0, worstAt: Vec3 | null = null, buried = 0, points = 0;
  const f = def.replacementFootprints[0]!;
  const check = (p: Vec3, n: Vec3): void => {
    // The collar band is held to the floor by collarProblems: there the
    // nearest rock may be the exterior heightfield, not owned rock.
    if (Math.min(p.x - f.minX, f.maxX - p.x, p.z - f.minZ, f.maxZ - p.z) < 1) return;
    points++;
    const d = voxelRockDistance(def, p, 0.5);
    if (d > worst) { worst = d; worstAt = p; }
    if (voxelInRock(def, { x: p.x + n.x * 0.36, y: p.y + n.y * 0.36, z: p.z + n.z * 0.36 })) buried++;
  };
  for (let i = 0; i < m.positions.length / 3; i++) check(vertex(m, i), { x: m.normals[i * 3]!, y: m.normals[i * 3 + 1]!, z: m.normals[i * 3 + 2]! });
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, q] = [0, 1, 2].map(k => vertex(m, m.indices[t + k]!)) as [Vec3, Vec3, Vec3];
    const n = cross(sub(b, a), sub(q, a)), l = Math.hypot(n.x, n.y, n.z) || 1;
    check({ x: (a.x + b.x + q.x) / 3, y: (a.y + b.y + q.y) / 3, z: (a.z + b.z + q.z) / 3 }, { x: n.x / l, y: n.y / l, z: n.z / l });
  }
  if (worst > 0.35) out.push(`${c.source.id}: shell point ${worst.toFixed(3)} m from rock at ${fmt(worstAt!)}`);
  if (buried > points * 0.001) out.push(`${c.source.id}: ${buried} of ${points} shell points face rock within 0.36 m`);
  const v = caveVolume(def), g = v.grid;
  let cells = 0, inside = 0;
  for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    if (!v.room[i + g.nx * (j + g.ny * k)]) continue;
    cells++;
    if (voxelInRock(def, { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel })) inside++;
  }
  if (inside) out.push(`${c.source.id}: ${inside} of ${cells} room cells inside rock`);
  if (cells < 500) out.push(`${c.source.id}: only ${cells} room cells`);
  for (const s of def.rock) for (const a of ["x", "y", "z"] as const)
    if (s.max[a] - s.min[a] < MIN_ROCK - 1e-9) { out.push(`${s.id} thinner than ${MIN_ROCK} m on ${a}`); break; }
  // Thin rock is dropped from art and collision together; keep it rare.
  if (def.stats.droppedVoxels > def.stats.rockVoxels * 0.01) out.push(`${c.source.id}: ${def.stats.droppedVoxels} of ${def.stats.rockVoxels} rock voxels dropped as thin`);
  return out;
}

/** Every portal's clear rectangle is free of rock and of both shells. Diver
 * mouths are narrower than the smallest hull and stop it; craft mouths pass
 * their largest profile. */
export function apertureProblems(c: DeepCave, world: WorldQueries = deepWorld()): string[] {
  const pr = probeOf(c), out: string[] = [];
  for (const p of pr.def.portals) {
    const rock = aperture(p).find(q => pr.inRock(q));
    if (rock) out.push(`${p.id}: rock at ${fmt(rock)} inside its ${p.clear.width} x ${p.clear.height} m opening`);
    for (const lod of ["fine", "coarse"] as const) for (const q of aperture(p, 0.45)) {
      const a = sub(q, { x: p.normal.x * 0.3, y: p.normal.y * 0.3, z: p.normal.z * 0.3 }), b = { x: q.x + p.normal.x * 0.3, y: q.y + p.normal.y * 0.3, z: q.z + p.normal.z * 0.3 };
      if (pr.triangles(lod, q, 0.5).some(([u, w, x]) => segmentHitsTriangle(a, b, u, w, x))) { out.push(`${p.id}: ${lod} shell crosses the opening at ${fmt(q)}`); break; }
    }
    if (p.kind !== "mouth" || p.normal.y !== 0) continue;
    const craft = p.admits.filter(a => a !== "diver");
    if (!craft.length) {
      if (p.clear.width >= CRAFT_PROFILES.small.radius * 2) out.push(`${p.id}: a diver mouth ${p.clear.width} m wide would admit a small hull`);
      const keel = { x: p.center.x, y: p.center.y - p.clear.height / 2 + 0.1, z: p.center.z };
      const from = { x: keel.x + p.normal.x * 8, y: keel.y, z: keel.z + p.normal.z * 8 };
      if (!world.moveCapsule(from, { x: -p.normal.x * 16, y: 0, z: -p.normal.z * 16 }, CRAFT_PROFILES.small).hitSolid) out.push(`${p.id}: a small hull swept through a diver mouth`);
    } else for (const a of craft) {
      const s = profile(a);
      if (p.clear.width < s.radius * 2 + 0.6 || p.clear.height < s.height + 0.4) out.push(`${p.id}: ${p.clear.width} x ${p.clear.height} m is tight for ${a}`);
    }
  }
  return out;
}

/** Every route clears at each pose and sweeps segment by segment with its
 * own profile, arriving exactly. */
export function routeProblems(c: DeepCave, world: WorldQueries = deepWorld()): string[] {
  const out: string[] = [];
  for (const r of c.source.routes) {
    const s = profile(r.profile);
    for (const p of r.path) if (!world.clearance(p, s)) { out.push(`${r.id}: ${r.profile} blocked at ${fmt(p)}`); break; }
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!, b = r.path[i]!, m = world.moveCapsule(a, sub(b, a), s);
      if (m.hitSolid || m.hitBoundary || dist(m.position, b) > 1e-6) { out.push(`${r.id}: segment ${i} stops at ${fmt(m.position)} short of ${fmt(b)}`); break; }
    }
  }
  return out;
}

/** Roof holes: cave water meeting open water straight above it, outside
 * shaft rooms and the mouths' lintel zones. */
export function roofHoles(def: CaveDef): Vec3[] {
  const v = caveVolume(def), g = v.grid, holes: Vec3[] = [];
  const shafts = new Set(def.rooms.map((r, i) => r.role === "shaft" ? i + 1 : 0).filter(Boolean));
  const mouths = def.portals.filter(m => m.kind === "mouth" || m.kind === "skylight");
  const mouthZone = (p: Vec3): boolean => mouths.some(m => {
    if (m.normal.y !== 0) return Math.abs(p.x - m.center.x) < m.clear.width / 2 + 2.5 && Math.abs(p.z - m.center.z) < m.clear.height / 2 + 2.5;
    return Math.abs((p.z - m.center.z) * m.normal.z + (p.x - m.center.x) * m.normal.x) < 5 &&
      Math.abs(m.normal.z !== 0 ? p.x - m.center.x : p.z - m.center.z) < m.clear.width / 2 + 2 && p.y < m.center.y + m.clear.height / 2 + 2.5;
  });
  for (let k = 0; k < g.nz; k++) for (let j = 0; j + 1 < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const at = i + g.nx * (j + g.ny * k), up = at + g.nx, r = v.room[at]!;
    if (!r || v.solid[up] || v.room[up] || shafts.has(r)) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (!mouthZone(p)) holes.push(p);
  }
  return holes;
}

/** Roof support: over probe columns inside the cave (route poses and room
 * centres away from mouths and shafts), the roof is real rock at least
 * MIN_ROCK thick, a diver can stand on it and cannot sink through, and both
 * shells draw its top. No roof holes anywhere. */
export function roofProblems(c: DeepCave, world: WorldQueries = deepWorld()): string[] {
  const pr = probeOf(c), def = pr.def, out: string[] = [];
  const shafts = def.source.carves.filter(k => k.kind === "shaft");
  const open = (p: Vec3): boolean => shafts.some(s => s.kind === "shaft" && Math.hypot(p.x - s.center[0], p.z - s.center[1]) <= s.radius + s.flare + s.wobble + 1)
    || def.portals.some(m => (m.kind === "mouth" || m.kind === "skylight") && (m.normal.y !== 0
      ? Math.hypot(p.x - m.center.x, p.z - m.center.z) < Math.max(m.clear.width, m.clear.height) / 2 + 2
      : Math.abs((p.z - m.center.z) * m.normal.z + (p.x - m.center.x) * m.normal.x) < 3));
  const columns = [
    ...def.routes.flatMap(r => r.path),
    ...def.rooms.filter(r => r.role !== "shaft").map(r => ({ x: (r.bounds.min.x + r.bounds.max.x) / 2, y: r.bounds.min.y + 1, z: (r.bounds.min.z + r.bounds.max.z) / 2 })),
  ].map(p => ({ ...p, x: Math.floor(p.x * 2) / 2 + 0.25, z: Math.floor(p.z * 2) / 2 + 0.25 }))
    .filter(p => pr.inside(p) && pr.roomAt({ ...p, y: p.y + 0.5 }) !== "" && !open(p) && world.clearance(p, DIVER));
  if (columns.length < 2) out.push(`${c.source.id}: only ${columns.length} roof probe columns`);
  for (const p of columns) {
    const top = world.supportHeight(p.x, p.z, 1000);
    const stand = Math.max(...[-1, 1].flatMap(a => [-1, 1].map(b => world.supportHeight(p.x + a * DIVER.radius, p.z + b * DIVER.radius, 1000))));
    if (world.supportHeight(p.x, p.z, p.y) > p.y + 1e-9) { out.push(`${c.source.id}: support below ${fmt(p)} reads the roof`); continue; }
    const over = def.rock.filter(s => p.x > s.min.x && p.x < s.max.x && p.z > s.min.z && p.z < s.max.z && s.min.y >= p.y + DIVER.height);
    const ceiling = Math.min(...over.map(s => s.min.y));
    if (!Number.isFinite(ceiling) || top - ceiling < MIN_ROCK - 1e-9) { out.push(`${c.source.id}: roof over ${fmt(p)} is ${(top - ceiling).toFixed(2)} m`); continue; }
    const above = { x: p.x, y: stand + 0.01, z: p.z };
    if (!world.clearance(above, DIVER)) { out.push(`${c.source.id}: no room on the roof over ${fmt(p)}`); continue; }
    const sink = world.moveCapsule({ ...above, y: stand + 1 }, { x: 0, y: -3, z: 0 }, DIVER);
    if (!sink.hitSolid || sink.position.y < stand - 1e-6) { out.push(`${c.source.id}: a diver sinks through the roof over ${fmt(p)}`); continue; }
    // On a steep roof a shell vertex's 0.2–0.3 m sideways clamp is several
    // times that vertically, so the window grows with the local slope.
    const slope = Math.max(...[[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].map(([dx, dz]) => Math.abs(world.supportHeight(p.x + dx!, p.z + dz!, 1000) - top) / 0.5));
    for (const lod of ["fine", "coarse"] as const) {
      const a = { x: p.x, y: top + 0.6, z: p.z }, b = { x: p.x, y: top - (lod === "fine" ? 0.8 + 0.3 * slope : 1.6 + 0.6 * slope), z: p.z };
      if (!pr.triangles(lod, { x: p.x, y: top, z: p.z }, 1.8).some(([u, w, x]) => segmentHitsTriangle(a, b, u, w, x)))
        out.push(`${c.source.id}: ${lod} shell has no roof top over ${fmt(p)}`);
    }
  }
  const holes = roofHoles(def);
  if (holes.length) out.push(`${c.source.id}: ${holes.length} roof holes, first ${fmt(holes[0]!)}`);
  return out;
}

/** Coarse LOD keeps every opening: neither shell comes within 0.6 m of any
 * diver route (lifted to mid-body), and craft routes keep their box clear of
 * both shells; coarse is a real simplification. */
export function lodProblems(c: DeepCave): string[] {
  const pr = probeOf(c), out: string[] = [], f = pr.def.replacementFootprints[0]!;
  const interior = (p: Vec3): boolean => Math.min(p.x - f.minX, f.maxX - p.x, p.z - f.minZ, f.maxZ - p.z) > 1;
  for (const r of c.source.routes) {
    // Diver: no shell within 0.6 m of mid-body (W1). Craft: no shell vertex
    // inside the hull box shrunk by the kit's 0.35 m shell-to-rock bound.
    const s = profile(r.profile), lift = r.profile === "diver" ? 0.45 : s.height / 2, keep = r.profile === "diver" ? 0.6 : -0.35;
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!, b = r.path[i]!, steps = Math.ceil(dist(a, b) / 0.25);
      for (let k = 0; k <= steps; k++) {
        const q = lerp3(a, b, k / steps), p = { ...q, y: q.y + lift };
        if (!interior(q)) continue;
        for (const lod of ["fine", "coarse"] as const) {
          if (r.profile === "diver") {
            const hit = pr.triangles(lod, p, 0.8).find(([u, w, x]) => pointTriangleDistance(p, u, w, x) < keep);
            if (hit) { out.push(`${r.id}: ${lod} shell within ${keep} m at ${fmt(p)}`); k = steps; i = r.path.length; break; }
          } else {
            const half = { x: s.radius + keep, y: s.height / 2 + keep, z: s.radius + keep };
            const inBox = (u: Vec3): boolean => Math.abs(u.x - p.x) < half.x && Math.abs(u.y - p.y) < half.y && Math.abs(u.z - p.z) < half.z;
            if (pr.triangles(lod, p, s.radius + 1).some(t => t.some(inBox))) { out.push(`${r.id}: ${lod} shell inside the ${r.profile} box at ${fmt(q)}`); k = steps; i = r.path.length; break; }
          }
        }
      }
    }
  }
  if (pr.shell("coarse").positions.length >= pr.shell("fine").positions.length / 3) out.push(`${c.source.id}: coarse is not coarser`);
  return out;
}

/** The collar meets the heightfield at the footprint edge. */
export function collarProblems(c: DeepCave, world: WorldQueries = deepWorld()): string[] {
  const pr = probeOf(c), f = pr.def.replacementFootprints[0]!, out: string[] = [];
  // The rock top just inside the edge against the floor just outside it,
  // allowing for the floor's own fall over the 0.5 m between them, and for
  // the kit's 2 m-cube opening where the floor falls INTO the footprint: a
  // cube may not cross the edge, so it cannot fit under a surface that drops
  // inward, and up to that drop is eroded (a notch at the seam, not a gap).
  let worst = 0, at = "";
  const step = (x: number, z: number, ox: number, oz: number): void => {
    const fall = Math.max(...[-0.25, 0, 0.25].flatMap(a => [-0.25, 0, 0.25].map(b => Math.abs(worldFloor(x + a, z + b) - worldFloor(ox, oz)))));
    const ix = Math.sign(x - ox), iz = Math.sign(z - oz), here = worldFloor(x, z);
    let inward = 0;
    for (let s = 0.5; s <= 2.25; s += 0.25) for (const t of [-2, 0, 2]) {
      const fx = x + ix * s + (iz !== 0 ? t : 0), fz = z + iz * s + (ix !== 0 ? t : 0);
      inward = Math.max(inward, here - worldFloor(fx, fz));
    }
    const d = Math.abs(world.supportHeight(x, z, 1000) - worldFloor(ox, oz)) - fall - inward;
    if (d > worst) { worst = d; at = `(${x}, ${z})`; }
  };
  for (let u = f.minX + 0.5; u < f.maxX; u += 1) { step(u, f.minZ + 0.25, u, f.minZ - 0.25); step(u, f.maxZ - 0.25, u, f.maxZ + 0.25); }
  for (let u = f.minZ + 0.5; u < f.maxZ; u += 1) { step(f.minX + 0.25, u, f.minX - 0.25, u); step(f.maxX - 0.25, u, f.maxX + 0.25, u); }
  if (worst > 0.75) out.push(`${c.source.id}: collar step ${worst.toFixed(2)} m beyond the floor's own fall at ${at}`);
  for (const lod of ["fine", "coarse"] as const) {
    const m = pr.shell(lod);
    for (let i = 0; i < m.positions.length / 3; i++) {
      const p = vertex(m, i);
      if (Math.abs(p.x - f.minX) > 1e-6 && Math.abs(p.x - f.maxX) > 1e-6 && Math.abs(p.z - f.minZ) > 1e-6 && Math.abs(p.z - f.maxZ) > 1e-6) continue;
      if (Math.abs(p.y - worldFloor(p.x, p.z)) > 1e-4) { out.push(`${c.source.id}: ${lod} collar vertex off the floor at ${fmt(p)}`); break; }
    }
  }
  return out;
}

/** Craft park outside the footprint, near a mouth, with room for each profile. */
export function stagingProblems(c: DeepCave, world: WorldQueries = deepWorld()): string[] {
  const pr = probeOf(c), out: string[] = [], mouths = pr.def.portals.filter(p => p.kind === "mouth" || p.kind === "skylight");
  for (const s of pr.def.staging) {
    if (pr.inside(s.position)) out.push(`${s.id}: inside the footprint`);
    const d = Math.min(...mouths.map(m => Math.hypot(s.position.x - m.center.x, s.position.z - m.center.z)));
    if (d > 75) out.push(`${s.id}: ${d.toFixed(0)} m from the nearest mouth`);
    for (const p of s.profiles) if (!world.clearance(s.position, profile(p))) out.push(`${s.id}: no room for ${p}`);
  }
  return out;
}

/** Room adjacency from the generated water: two rooms touch where their
 * water voxels share a face. */
export function roomGraph(def: CaveDef): Map<string, Set<string>> {
  const v = caveVolume(def), g = v.grid, out = new Map<string, Set<string>>(def.rooms.map(r => [r.id, new Set<string>()]));
  for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const at = i + g.nx * (j + g.ny * k), r = v.room[at]!;
    if (!r || v.solid[at]) continue;
    for (const [d, ok] of [[1, i + 1 < g.nx], [g.nx, j + 1 < g.ny], [g.nx * g.ny, k + 1 < g.nz]] as const) {
      if (!ok) continue;
      const o = v.room[at + d]!;
      if (o && o !== r && !v.solid[at + d]) { out.get(v.roomIds[r - 1]!)!.add(v.roomIds[o - 1]!); out.get(v.roomIds[o - 1]!)!.add(v.roomIds[r - 1]!); }
    }
  }
  return out;
}
/** True when the undirected graph restricted to `nodes` has a cycle. */
export function hasCycle(graph: Map<string, Set<string>>, nodes: ReadonlySet<string>): boolean {
  const seen = new Set<string>();
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const stack: [string, string | null][] = [[start, null]];
    while (stack.length) {
      const [n, parent] = stack.pop()!;
      if (seen.has(n)) return true;
      seen.add(n);
      for (const m of graph.get(n) ?? []) if (nodes.has(m) && m !== parent) stack.push([m, n]);
    }
  }
  return false;
}

// --- Darkness and hazards ------------------------------------------------------------

const fields = new Map<string, CaveLightField>();
export function fieldOf(c: DeepCave): CaveLightField {
  let f = fields.get(c.source.id);
  if (!f) fields.set(c.source.id, f = caveLightField(defOf(c), worldFloor));
  return f;
}
/** The glow an unlit diver reads: path-length daylight only (W1 R1-01). */
export const glowOf = (c: DeepCave) => {
  const f = fieldOf(c);
  return (p: Vec3): number => { const s = sampleLightField(f, p); return caveDaylight(s.r, 0, s.a); };
};
const head = (p: Vec3): Vec3 => ({ x: p.x, y: p.y + 0.6, z: p.z });

export interface Retreat {
  readonly start: Vec3;
  /** Poses from the start to the arrival, every accepted hop. */
  readonly path: readonly Vec3[];
  readonly exit: string | null;
  readonly failure: string | null;
}
/** The W1 lamp-off retreat, generic: from each start, among water in clear
 * sight within 7 m whose glow is brighter, take the brightest the full diver
 * can actually reach (destination clears, the sweep from the last accepted
 * pose arrives). Success is clear exterior water entered through a mouth or
 * skylight. Candidate water is the cave's own grid plus an 8 m band of open
 * water round the footprint. */
export function retreat(c: DeepCave, starts: readonly Vec3[], world: WorldQueries = deepWorld()): Retreat[] {
  const pr = probeOf(c), def = pr.def, glow = glowOf(c), v = caveVolume(def), g = v.grid, f = def.replacementFootprints[0]!;
  const exterior = (p: Vec3): boolean => pr.roomAt(p) === "" && pr.roomAt(head(p)) === "" && pr.roomAt({ ...p, y: p.y + 0.95 }) === "";
  const rank = (p: Vec3): number => glow(head(p)) + (exterior(p) ? 0.01 : 0);
  const clearSight = (a: Vec3, b: Vec3): boolean => {
    const steps = Math.ceil(dist(a, b) / 0.25);
    for (let s = 1; s < steps; s++) {
      const q = lerp3(a, b, s / steps);
      const i = Math.floor((q.x - g.origin.x) / g.voxel), j = Math.floor((q.y - g.origin.y) / g.voxel), k = Math.floor((q.z - g.origin.z) / g.voxel);
      if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) { if (q.y < worldFloor(q.x, q.z)) return false; continue; }
      if (v.solid[i + g.nx * (j + g.ny * k)]) return false;
    }
    return true;
  };
  // Candidate spots on a 1 m lattice, bucketed by 4 m cells.
  const BUCKET = 4, buckets = new Map<string, { p: Vec3; rank: number }[]>();
  const add = (p: Vec3): void => {
    if (!world.clearance(p, DIVER)) return;
    const key = `${Math.floor(p.x / BUCKET)},${Math.floor(p.y / BUCKET)},${Math.floor(p.z / BUCKET)}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push({ p, rank: rank(p) });
  };
  for (let k = 0; k < g.nz; k += 2) for (let j = 0; j < g.ny; j += 2) for (let i = 0; i < g.nx; i += 2)
    if (!v.solid[i + g.nx * (j + g.ny * k)]) add({ x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel });
  const yLo = def.bounds.min.y, yHi = def.bounds.max.y + 6;
  for (let x = f.minX - 8.25; x < f.maxX + 8; x += 1) for (let z = f.minZ - 8.25; z < f.maxZ + 8; z += 1) {
    if (x > f.minX - 1 && x < f.maxX + 1 && z > f.minZ - 1 && z < f.maxZ + 1) continue;
    const floor = worldFloor(x, z);
    for (let y = Math.max(yLo, floor + 0.25); y < yHi; y += 1) add({ x, y, z });
  }
  const nearby = (p: Vec3): { p: Vec3; rank: number }[] => {
    const out: { p: Vec3; rank: number }[] = [];
    for (let i = Math.floor((p.x - 7) / BUCKET); i <= Math.floor((p.x + 7) / BUCKET); i++)
      for (let j = Math.floor((p.y - 7) / BUCKET); j <= Math.floor((p.y + 7) / BUCKET); j++)
        for (let k = Math.floor((p.z - 7) / BUCKET); k <= Math.floor((p.z + 7) / BUCKET); k++) out.push(...(buckets.get(`${i},${j},${k}`) ?? []));
    return out;
  };
  const openings = def.portals.filter(o => o.kind === "mouth" || o.kind === "skylight");
  const openingOf = (a: Vec3, b: Vec3): string | null => {
    for (let s = 0; s <= 40; s++) {
      const w = lerp3(a, b, s / 40);
      if (pr.roomAt(w) !== "") continue;
      return openings.find(o => {
        const along = (w.x - o.center.x) * o.normal.x + (w.y - o.center.y) * o.normal.y + (w.z - o.center.z) * o.normal.z;
        const off = { x: w.x - o.center.x - o.normal.x * along, y: w.y - o.center.y - o.normal.y * along, z: w.z - o.center.z - o.normal.z * along };
        return Math.abs(along) < 4 && Math.hypot(off.x, off.y, off.z) < Math.hypot(o.clear.width, o.clear.height) / 2 + 2;
      })?.id ?? null;
    }
    return null;
  };
  return starts.map(start => {
    if (!world.clearance(start, DIVER)) return { start, path: [start], exit: null, failure: `start ${fmt(start)} is not a diver pose` };
    let at = start, exit: string | null = null;
    const path = [start];
    for (let hop = 0; !exterior(at); hop++) {
      if (hop >= 40) return { start, path, exit, failure: `lost from ${fmt(start)} at ${fmt(at)}` };
      const here = rank(at);
      const options = nearby(at).filter(o => o.rank > here + 1e-3 && dist(o.p, at) <= 7)
        .sort((x, y) => y.rank - x.rank || Math.hypot(x.p.x - at.x, x.p.z - at.z) - Math.hypot(y.p.x - at.x, y.p.z - at.z));
      let next: Vec3 | null = null;
      for (const o of options) {
        if (!clearSight(head(at), head(o.p))) continue;
        const r = world.moveCapsule(at, sub(o.p, at), DIVER);
        if (r.hitSolid || r.hitBoundary || dist(r.position, o.p) > 1e-6) continue;
        next = o.p; break;
      }
      if (!next) return { start, path, exit, failure: `no brighter water a diver can reach from ${fmt(at)} (glow ${here.toFixed(3)})` };
      if (exterior(next)) exit = openingOf(at, next);
      at = next; path.push(at);
    }
    if (!exit) return { start, path, exit, failure: `left ${fmt(start)} without passing a mouth or skylight` };
    if (glow(head(at)) < 0.999) return { start, path, exit, failure: `arrival ${fmt(at)} is not lit water` };
    return { start, path, exit, failure: null };
  });
}

/** Retreat starts: every metre along every route inside the cave, plus
 * every diver pose on a 2 m lattice of each room's water. */
export function retreatStarts(c: DeepCave, world: WorldQueries = deepWorld(), lattice = 2): Vec3[] {
  const pr = probeOf(c), def = pr.def, out: Vec3[] = [];
  for (const r of def.routes) for (let i = 1; i < r.path.length; i++) {
    const a = r.path[i - 1]!, b = r.path[i]!, n = Math.ceil(dist(a, b));
    for (let s = 0; s < n; s++) {
      const p = lerp3(a, b, s / n);
      if (pr.inside(p) && pr.roomAt(head(p)) !== "" && world.clearance(p, DIVER)) out.push(p);
    }
  }
  if (lattice > 0) {
    const v = caveVolume(def), g = v.grid, step = Math.round(lattice / g.voxel);
    for (let k = 1; k < g.nz; k += step) for (let j = 1; j < g.ny; j += step) for (let i = 1; i < g.nx; i += step) {
      const at = i + g.nx * (j + g.ny * k);
      if (!v.room[at] || v.solid[at]) continue;
      const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
      if (pr.roomAt(head(p)) !== "" && world.clearance(p, DIVER)) out.push(p);
    }
  }
  return out;
}

/** Hazard levels a diver body reads at a pose: feet, middle and head. */
export function bodyHazard(p: Vec3, tick: number): { heat: number; brine: number } {
  let heat = 0, brine = 0;
  for (const y of [0, 0.5, 0.95]) {
    const s = sampleDeepHazards({ x: p.x, y: p.y + y, z: p.z }, tick);
    heat = Math.max(heat, s.heat); brine = Math.max(brine, s.brine);
  }
  return { heat, brine };
}
export const safeWater = (p: Vec3, tick: number): boolean => {
  const h = bodyHazard(p, tick);
  return h.heat <= UNPROTECTED.heat + 1e-9 && h.brine <= UNPROTECTED.brine + 1e-9;
};

export interface Budget {
  /** Starting loads (0..100) and how long ago their warning was delivered. */
  readonly heat: number;
  readonly brine: number;
  /** Air left, seconds of suit drain. */
  readonly air: number;
}
/** 20% of a full suit (`SUIT_OXYGEN_DRAIN_PER_SECOND`). */
export const AIR_20 = 20 / SUIT_OXYGEN_DRAIN_PER_SECOND;
export interface Swim { readonly seconds: number; readonly peakHeat: number; readonly peakBrine: number; readonly harm: number; readonly safeAtEnd: boolean }
/** Swim a retreat path at `SWIM_SPEED` from `tick`, running S4's exposure
 * model each 1/60 s step for an unprotected diver. Warnings already delivered
 * long ago (no grace left). Ends `extra` seconds after arrival if the
 * arrival is not yet safe, swimming on along the last hop's direction. */
export function swim(path: readonly Vec3[], tick0: number, budget: Budget): Swim {
  const load = { heat: budget.heat, brine: budget.brine, heatWarned: budget.heat >= EXPOSURE.warnings[0] ? MAX_WARNING_AGE : 0,
    brineWarned: budget.brine >= EXPOSURE.warnings[0] ? MAX_WARNING_AGE : 0 };
  const protection = { heat: UNPROTECTED.heat, brine: UNPROTECTED.brine, current: UNPROTECTED.current };
  let t = 0, harm = 0, peakHeat = load.heat, peakBrine = load.brine, tick = tick0;
  const stepAt = (p: Vec3): void => {
    const h = bodyHazard(p, tick);
    const r = stepExposure(load, { heat: h.heat, brine: h.brine, sediment: 0, darkness: 0, flow: { x: 0, y: 0, z: 0 }, ambient: 0, visibility: 1, fields: [] },
      protection, true, false);
    harm += r.harm; peakHeat = Math.max(peakHeat, load.heat); peakBrine = Math.max(peakBrine, load.brine);
    t += ECOLOGY_DT; tick++;
  };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, n = Math.max(1, Math.ceil(dist(a, b) / SWIM_SPEED / ECOLOGY_DT));
    for (let s = 1; s <= n; s++) stepAt(lerp3(a, b, s / n));
  }
  const end = path[path.length - 1]!;
  return { seconds: t, peakHeat, peakBrine, harm, safeAtEnd: safeWater(end, tick) };
}
/** Simulation ticks per second (ECOLOGY_DT). */
export const TICKS = Math.round(1 / ECOLOGY_DT);
export { EXTERIOR };
