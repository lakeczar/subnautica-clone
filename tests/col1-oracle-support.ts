// COL-1 oracle (not a test file): today's box queries against the static
// collider on existing scenes. `col1-oracle.heavy.test.ts` asserts on it and
// `col1-oracle-report.ts` measures speed and memory with it.
import { CANOPY_ROOT_CAVES } from "../src/content/caves/canopyRootCaves.js";
import { caveDef, type CaveDef } from "../src/content/regions/caves.js";
import { caveShell } from "../src/content/regions/caveGeometry.js";
import { parkPose, workPose } from "../src/content/regions/access.js";
import { CRAFT_PROFILES, ROUTES, type CraftProfileId } from "../src/content/regions/passages.js";
import { RESCUE_PLANS } from "../src/content/regions/rescue.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURES } from "../src/content/regions/structures.js";
import { LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { POI_SETS } from "../src/content/poi/sets.js";
import { VISTA_SETS } from "../src/content/vistas.js";
import type { Capsule, Vec3, WorldQueries } from "../src/sim/types.js";
import { caveOwner, createCaveWorldQueries, createWorldQueries, SOLIDS, surfaceHeight, type Solid } from "../src/sim/world.js";
import { buildCollision, chunksNear, createLargeCave, type LargeCave } from "../src/world/caves/large/build.js";
import { composeCaveWorld, largeCaveCollider, type CaveCollider } from "../src/world/caves/large/compose.js";
import { artMembers, collarHeightfield, meshFacing, meshShapes } from "../src/world/collision/bake.js";
import { compactBiome, compactBiomeCollider } from "../src/world/collision/biome.js";
import { buildBoxes, createStaticCollider, type StaticCollider, type StaticMember } from "../src/world/collision/collider.js";
import { composeStaticWorld, staticCaveCollider } from "../src/world/collision/world.js";
import type { Aabb } from "../src/world/types.js";

export const random = (seed: number) => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
const shapeOf = (p: CraftProfileId): Capsule => ({ radius: CRAFT_PROFILES[p].radius, height: CRAFT_PROFILES[p].height, bottom: CRAFT_PROFILES[p].bottom });
export const DIVER = shapeOf("diver"), SMALL = shapeOf("small"), MEDIUM = shapeOf("medium");
const boxOf = (p: Vec3, s: Capsule): { c: Vec3; e: Vec3 } => {
  const ex = s.halfWidth ?? s.radius, ez = s.halfLength ?? s.radius, bottom = s.bottom ?? 0, ey = (s.height - bottom) / 2;
  return { c: { x: p.x, y: p.y + bottom + ey, z: p.z }, e: { x: ex, y: ey, z: ez } };
};

export interface ProtectedPath { readonly id: string; readonly shape: Capsule; readonly path: readonly Vec3[] }
export interface ProtectedPose { readonly id: string; readonly shape: Capsule; readonly pose: Vec3 }
export interface OracleScene {
  readonly id: string;
  readonly label: string;
  /** Where probes go (several disjoint boxes for scattered sets). */
  readonly regions: readonly Aabb[];
  /** Today's world (the production query path for this content). */
  readonly old: WorldQueries;
  /** The static collider in the same place. */
  readonly neo: WorldQueries;
  /** The art itself as collision: the truth disagreements are judged by. */
  readonly art: StaticCollider;
  /** Surfaces to seed near-surface probes from (art triangles). */
  readonly seeds: readonly Vec3[];
  readonly shapes: readonly { readonly id: string; readonly shape: Capsule }[];
  readonly paths: readonly ProtectedPath[];
  readonly poses: readonly ProtectedPose[];
  /** What the old world spends on this content, and the new. */
  readonly before: { readonly boxes: number; readonly note: string };
  readonly after: StaticCollider;
  /** Old-world solids replaced (for memory measurement). */
  readonly oldSolids: readonly Solid[];
  /** Whether a pose is illegal by the new collider, in the space it answers
   * for (a structure collider everywhere, a cave inside what it owns). */
  readonly illegalEnd: (p: Vec3, shape: Capsule) => boolean;
}

const grow = (b: Aabb, r: number): Aabb => ({ min: { x: b.min.x - r, y: b.min.y - r, z: b.min.z - r }, max: { x: b.max.x + r, y: b.max.y + r, z: b.max.z + r } });
const meets = (b: Aabb, a: Vec3, c: Vec3): boolean =>
  Math.max(a.x, c.x) >= b.min.x && Math.min(a.x, c.x) <= b.max.x && Math.max(a.y, c.y) >= b.min.y && Math.min(a.y, c.y) <= b.max.y &&
  Math.max(a.z, c.z) >= b.min.z && Math.min(a.z, c.z) <= b.max.z;
const inside = (b: Aabb, p: Vec3): boolean => p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;

/** Triangle centroids (and box face centres) of the members: probe seeds. */
function seedsOf(members: readonly StaticMember[], cap = 6000): Vec3[] {
  const out: Vec3[] = [];
  for (const m of members) {
    if (m.kind === "shape") for (let t = 0; t < m.triangles; t++) {
      const a = m.indices[t * 3]! * 3, b = m.indices[t * 3 + 1]! * 3, c = m.indices[t * 3 + 2]! * 3, P = m.positions;
      out.push({ x: (P[a]! + P[b]! + P[c]!) / 3, y: (P[a + 1]! + P[b + 1]! + P[c + 1]!) / 3, z: (P[a + 2]! + P[b + 2]! + P[c + 2]!) / 3 });
    } else if (m.kind === "boxes") for (let i = 0; i < m.ids.length; i++) {
      const B = m.boxes, o = i * 6;
      out.push({ x: (B[o]! + B[o + 3]!) / 2, y: B[o + 4]!, z: (B[o + 2]! + B[o + 5]!) / 2 });
    }
  }
  if (out.length <= cap) return out;
  const step = out.length / cap;
  return Array.from({ length: cap }, (_, i) => out[Math.floor(i * step)]!);
}

/** Routes, rescue tethers and site poses that reach the regions. */
function protectedNear(regions: readonly Aabb[], pad: number): { paths: ProtectedPath[]; poses: ProtectedPose[] } {
  const near = regions.map(r => grow(r, pad));
  const touches = (a: Vec3, b: Vec3): boolean => near.some(r => meets(r, a, b));
  const paths: ProtectedPath[] = [], poses: ProtectedPose[] = [];
  for (const r of ROUTES) {
    if (r.role === "walk" || !r.path.some((p, i) => i > 0 && touches(r.path[i - 1]!, p))) continue;
    paths.push({ id: r.id, shape: shapeOf(r.profile), path: r.path.map(p => ({ ...p })) });
  }
  for (const plan of RESCUE_PLANS) plan.tethers.forEach((t, i) => {
    if (t.some((p, k) => k > 0 && touches(t[k - 1]!, p))) paths.push({ id: `${plan.id}.tether${i}`, shape: DIVER, path: t.map(p => ({ ...p })) });
  });
  for (const s of SITES) {
    const w = workPose(s, worldFloor), k = parkPose(s, worldFloor);
    if (near.some(r => inside(r, w))) poses.push({ id: `${s.id}.work`, shape: DIVER, pose: w });
    if (near.some(r => inside(r, k))) poses.push({ id: `${s.id}.park`, shape: MEDIUM, pose: k });
  }
  return { paths, poses };
}

let production: WorldQueries | null = null;
/** The production exterior world, as the game queries it today. */
export const productionWorld = (): WorldQueries => production ??= createWorldQueries(SOLIDS, surfaceHeight);

function structureScene(id: string, label: string, replaced: (s: Solid) => boolean, members: StaticMember[], regions: Aabb[], note: string): OracleScene {
  const rest = SOLIDS.filter(s => !replaced(s)), oldSolids = SOLIDS.filter(replaced);
  const collider = createStaticCollider(id, members);
  const neo = composeStaticWorld({ exterior: createWorldQueries(rest, surfaceHeight), solids: rest, collider, guards: [LEGACY_PRESERVE] });
  const { paths, poses } = protectedNear(regions, 12);
  return {
    id, label, regions, old: productionWorld(), neo, art: collider, seeds: seedsOf(members),
    shapes: [{ id: "diver", shape: DIVER }, { id: "small", shape: SMALL }, { id: "medium", shape: MEDIUM }],
    paths, poses, before: { boxes: oldSolids.length, note }, after: collider, oldSolids,
    illegalEnd: (p, shape) => { const { c, e } = boxOf(p, shape); return collider.overlaps(c, e); },
  };
}

const membersBounds = (ms: readonly StaticMember[]): Aabb => {
  const b = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  for (const m of ms) for (const k of ["x", "y", "z"] as const) {
    b.min[k] = Math.min(b.min[k], k === "y" && m.kind === "heightfield" ? m.bounds.max.y - 5 : m.bounds.min[k]);
    b.max[k] = Math.max(b.max[k], m.bounds.max[k]);
  }
  return b;
};

/** DISH-1's three Basin dishes: today's frame and bowl boxes against the
 * dish art itself (rim, tripod and horn prisms, the bowl's panels, the hub
 * and fins as the boxes they are drawn as). */
export function dishScene(): OracleScene {
  const dishes = STRUCTURES.filter(s => s.kind === "dish");
  const members = dishes.flatMap(d => artMembers(d.id, d.dish!.blocks, d.dish!.pieces, d.dish!.bowl));
  const regions = dishes.map(d => grow(membersBounds(members.filter(m => m.id.startsWith(`${d.id}.`))), 4));
  return structureScene("dishes", "DISH-1 Basin dishes", s => /\.dish\.\d+$/.test(s.id), members, regions,
    "frame within 0.35 m and bowl within 1 m (BOWL_STANDOFF) box covers");
}

/** A1's set pieces (the wreck, arch, works and ring; POI-1's deep sets are
 * the same kit and are left to their own stream). */
export function vistaScene(): OracleScene {
  const poi = new Set(POI_SETS.map(s => s.id)), sets = VISTA_SETS.filter(s => !poi.has(s.id));
  const members = sets.flatMap(s => artMembers(`vista.${s.id}`, s.blocks, s.pieces));
  const regions = sets.map(s => grow(membersBounds(members.filter(m => m.id.startsWith(`vista.${s.id}.`))), 4));
  const ids = sets.map(s => `vista.${s.id}.`);
  return structureScene("a1", "A1 set pieces", s => ids.some(p => s.id.startsWith(p)), members, regions, "slab boxes within 0.35 m of the art");
}

// --- Caves (CA-1) ------------------------------------------------------------------

/** The old collar: world.ts's columns, each 0.5 m cell outside every
 * footprint topped at the highest of nine floor samples plus 2 cm (copied
 * from `generateCollarColumns`, which is private). */
export function collarColumns(def: CaveDef, floor: (x: number, z: number) => number, band: number, all: readonly CaveDef[]): Solid[] {
  const f = def.replacementFootprints[0]!, out: Solid[] = [], C = 0.5;
  const owned = (x: number, z: number): boolean => all.some(c => { const r = c.replacementFootprints[0]!; return x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ; });
  for (let x = f.minX - band; x < f.maxX + band - 1e-9; x += C)
    for (let z = f.minZ - band; z < f.maxZ + band - 1e-9; z += C) {
      if (owned(x + C / 2, z + C / 2)) continue;
      let top = -Infinity, low = Infinity;
      for (let i = 0; i <= 2; i++) for (let k = 0; k <= 2; k++) { const h = floor(x + i * C / 2, z + k * C / 2); top = Math.max(top, h); low = Math.min(low, h); }
      out.push({ id: `${def.id}.collar.${out.length}`, min: { x, y: Math.min(def.source.baseY, low - 4), z }, max: { x: x + C, y: top + 0.02, z: z + C } });
    }
  return out;
}
/** createCaveWorldQueries' band: the widest hull touching a footprint plus a sub-sweep. */
export const CAVE_BAND = 2 * 4.5 + 0.5 + 0.5;

export type CaveVariant = "columns" | "heightfield" | "shell";
export interface CaveScenes { readonly production: WorldQueries; readonly variants: Record<CaveVariant, OracleScene> }
/** CA-1's colonnade network (Archlet, Bellhole, Wrackhollow: two linked
 * crawls). `production` is today's game path (`createCaveWorldQueries`).
 * Each variant runs through LC's composer (`composeCaveWorld`, the one
 * C4 named authoritative), so variants differ only in their collider:
 * - `columns`: today's rock boxes and collar columns, as static boxes (the
 *   composer control);
 * - `heightfield`: the same rock boxes, the collar as a heightfield;
 * - `shell`: the fine shell (the art) as rock, the collar as a heightfield. */
export function caveScenes(ids: readonly string[] = ["reef_archlet", "reef_bellhole", "reef_wrackhollow"]): CaveScenes {
  const defs = ids.map(id => caveDef(id, worldFloor));
  const production = createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight, caves: defs.map(caveOwner) });
  const exterior = productionWorld(), feet = defs.map(d => d.replacementFootprints[0]!);
  const shellMembers = (d: CaveDef): StaticMember[] => {
    const sh = caveShell(d, "fine"), mesh = { positions: sh.positions, indices: Uint32Array.from(sh.indices) };
    return meshShapes(`${d.id}.shell`, mesh, { interior: "solid", facing: shellFacing(d, mesh), shared: true });
  };
  const collarOf = (d: CaveDef) => collarHeightfield(`${d.id}.collar`, d.replacementFootprints[0]!, CAVE_BAND, surfaceHeight, feet);
  const membersFor: Record<CaveVariant, (d: CaveDef) => StaticMember[]> = {
    columns: d => [buildBoxes(`${d.id}.rock`, [...d.rock, ...collarColumns(d, surfaceHeight, CAVE_BAND, defs)])],
    heightfield: d => [buildBoxes(`${d.id}.rock`, d.rock), collarOf(d)],
    shell: d => [...shellMembers(d), collarOf(d)],
  };
  const shellArt = defs.map(d => ({ d, members: [...shellMembers(d), collarOf(d)] }));
  const art = createStaticCollider("colonnade.art", shellArt.flatMap(a => a.members));
  const regions = defs.map(d => {
    const f = d.replacementFootprints[0]!;
    return { min: { x: f.minX - 4, y: d.source.baseY, z: f.minZ - 4 }, max: { x: f.maxX + 4, y: d.bounds.max.y + 4, z: f.maxZ + 4 } };
  });
  const caveProtected = (): { paths: ProtectedPath[]; poses: ProtectedPose[] } => {
    const near = protectedNear(regions, 12);
    for (const d of defs) {
      for (const r of d.routes) near.paths.push({ id: r.id, shape: shapeOf(r.profile), path: r.path.map(p => ({ ...p })) });
      for (const s of d.staging) for (const p of s.profiles) near.poses.push({ id: `${s.id}.${p}`, shape: shapeOf(p), pose: { ...s.position } });
    }
    return near;
  };
  const prot = caveProtected();
  const oldBoxes = defs.reduce((n, d) => n + d.rock.length + collarColumns(d, surfaceHeight, CAVE_BAND, defs).length, 0);
  const variant = (v: CaveVariant): OracleScene => {
    const caves: CaveCollider[] = [], members: StaticMember[] = [];
    for (const d of defs) {
      const ms = membersFor[v](d), collider = createStaticCollider(`${d.id}.${v}`, ms);
      members.push(...ms);
      caves.push(staticCaveCollider({ id: d.id, footprint: d.replacementFootprints[0]!, baseY: d.source.baseY, collider }));
    }
    const neo = composeCaveWorld({ exterior, solids: SOLIDS, floor: surfaceHeight, caves });
    return {
      id: `colonnade.${v}`, label: `CA-1 colonnade, ${v}`, regions, old: production, neo, art, seeds: seedsOf(shellArt.flatMap(a => a.members)),
      shapes: [{ id: "diver", shape: DIVER }, { id: "small", shape: SMALL }], paths: prot.paths, poses: prot.poses,
      before: { boxes: oldBoxes, note: "rock boxes plus 0.5 m collar columns" }, after: createStaticCollider(`colonnade.${v}`, members),
      oldSolids: defs.flatMap(d => [...d.rock, ...collarColumns(d, surfaceHeight, CAVE_BAND, defs)]),
      illegalEnd: (p, shape) => ownedIllegal(caves, p, shape),
    };
  };
  return { production, variants: { columns: variant("columns"), heightfield: variant("heightfield"), shell: variant("shell") } };
}
/** Which way the shell winds, read against the cave's own rock occupancy. */
function shellFacing(d: CaveDef, mesh: { positions: Float32Array; indices: Uint32Array }): 1 | -1 {
  // The opened rock of the definition's own boxes is the occupancy that
  // built the shell: rock is inside some box (they cover it exactly).
  const rockAt = (p: Vec3): boolean => d.rock.some(b => p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z);
  return meshFacing(d.id, mesh, rockAt);
}

// --- Cave biome (LC) ----------------------------------------------------------------

let canopy: LargeCave | null = null;
/** The Canopy root caves with collision for every chunk: probes near two
 * routes still reach neighbouring chunks, and a missing collider there
 * would read as open water (or, through a ray to the cap, as rock). */
export function canopyCave(): LargeCave {
  if (canopy) return canopy;
  canopy = createLargeCave(CANOPY_ROOT_CAVES, worldFloor);
  buildCollision(canopy);
  return canopy;
}
/** The chunks round the squeeze and the craft loop, where probes go. */
const canopyProbeChunks = (cave: LargeCave) => chunksNear(cave,
  CANOPY_ROOT_CAVES.routes.filter(r => r.id === "canopy_roots.route.squeeze" || r.id === "canopy_roots.route.craft_loop").flatMap(r => r.path), 8);
/** LC's chunk colliders against the same triangles in the compact format. */
export function biomeScene(): OracleScene & { readonly lcBytes: number; readonly chunks: number; readonly lc: CaveCollider; readonly compact: CaveCollider } {
  const cave = canopyCave(), col = cave.collision;
  const built = cave.chunks.filter(c => col.colliders[c.cx + col.nx * (c.cy + col.ny * c.cz)] !== undefined);
  const biome = compactBiome(cave.id, col.ownership, built.map(c => {
    const m = cave.mesh(c, "fine");
    return { key: m.key, art: { positions: m.positions, indices: m.indices }, band: m.band };
  }));
  const exterior = productionWorld(), lc = largeCaveCollider(col), compact = compactBiomeCollider(biome);
  const old = composeCaveWorld({ exterior, solids: SOLIDS, floor: surfaceHeight, caves: [lc] });
  const neo = composeCaveWorld({ exterior, solids: SOLIDS, floor: surfaceHeight, caves: [compact] });
  const o = col.origin, C = col.chunk;
  const regions = canopyProbeChunks(cave).map(c => ({ min: { x: o.x + c.cx * C, y: o.y + c.cy * C, z: o.z + c.cz * C }, max: { x: o.x + (c.cx + 1) * C, y: o.y + (c.cy + 1) * C, z: o.z + (c.cz + 1) * C } }));
  const routes = CANOPY_ROOT_CAVES.routes.filter(r => r.id === "canopy_roots.route.squeeze" || r.id === "canopy_roots.route.craft_loop");
  let lcBytes = 0;
  for (const k of col.colliders) if (k) lcBytes += k.bytes;
  return {
    id: "canopy", label: "LC Canopy root caves (all chunks; probes round two routes)", regions, old, neo, art: biome.collider,
    seeds: seedsOf(biome.collider.members), shapes: [{ id: "diver", shape: DIVER }, { id: "medium", shape: MEDIUM }],
    paths: routes.map(r => ({ id: r.id, shape: shapeOf(r.profile as CraftProfileId), path: r.path.map(p => ({ ...p })) })), poses: [],
    before: { boxes: 0, note: "LC chunk colliders (triangles, Uint32 indices, 32-byte nodes, copied positions)" },
    after: biome.collider, oldSolids: [], lcBytes, chunks: built.length, lc, compact,
    illegalEnd: (p, shape) => ownedIllegal([compact], p, shape),
  };
}

/** Blocked by a cave whose owned space the pose's box reaches. */
function ownedIllegal(caves: readonly CaveCollider[], p: Vec3, shape: Capsule): boolean {
  const { c, e } = boxOf(p, shape), box = { min: { x: c.x - e.x, y: c.y - e.y, z: c.z - e.z }, max: { x: c.x + e.x, y: c.y + e.y, z: c.z + e.z } };
  return caves.some(cv => cv.touches(box) && cv.blocked(c, e));
}

// --- Probes ------------------------------------------------------------------------

export interface ProbeOptions { readonly poses: number; readonly moves: number; readonly columns: number; readonly sights: number; readonly seed: number }
export interface Disagreement { readonly kind: string; readonly shape: string; readonly at: Vec3; readonly detail?: string }
export interface ProbeResult {
  readonly scene: string;
  clearance: { tried: number; agree: number; oldClearNewBlocked: number; artInsideOldCover: number; newClearOldBlocked: number; standOffMax: number; standOffMean: number; spurious: number };
  /** freed: the new move went free where the old hit; oldThroughArt: the old
   * went free through the art and the new stops at it; spurious: the new
   * stops with no art on the old straight path; both hit: slides differ. */
  moves: { tried: number; agree: number; freed: number; freedMax: number; oldThroughArt: number; spurious: number; bothHitSlideDiffers: number; slideDiffMax: number; endIllegal: number; endIllegalAsOld: number };
  support: { tried: number; agree: number; oldHigher: number; newHigher: number; floatMax: number; floatMean: number; newHigherMax: number };
  sight: { tried: number; agree: number; oldOnlyBlocked: number; newOnlyBlocked: number; newOnlyBlockedOutsideArt: number };
  protected: { paths: number; poses: number; newlyBlocked: string[]; newlyCleared: string[] };
  readonly examples: Disagreement[];
}

/** Sample a pose (feet datum): half near art surfaces, half anywhere in the regions. */
function samplePose(scene: OracleScene, rnd: () => number, shape: Capsule): Vec3 {
  if (rnd() < 0.6 && scene.seeds.length) {
    const s = scene.seeds[Math.floor(rnd() * scene.seeds.length)]!, r = 0.2 + 2.5 * rnd(), u = rnd() * Math.PI * 2, w = Math.acos(2 * rnd() - 1);
    return { x: s.x + r * Math.sin(w) * Math.cos(u), y: s.y + r * Math.cos(w) - shape.height / 2, z: s.z + r * Math.sin(w) * Math.sin(u) };
  }
  const b = scene.regions[Math.floor(rnd() * scene.regions.length)]!;
  return { x: b.min.x + (b.max.x - b.min.x) * rnd(), y: b.min.y + (b.max.y - b.min.y) * rnd(), z: b.min.z + (b.max.z - b.min.z) * rnd() };
}

/** How far the old cover stands off the art at a pose the new world lets
 * stand: the smallest box growth (to 2 m) at which the art is met. */
function standOff(art: StaticCollider, c: Vec3, e: Vec3): number {
  let lo = 0, hi = 2;
  if (!art.overlaps(c, { x: e.x + hi, y: e.y + hi, z: e.z + hi })) return hi;
  for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (art.overlaps(c, { x: e.x + m, y: e.y + m, z: e.z + m })) hi = m; else lo = m; }
  return hi;
}

export function probe(scene: OracleScene, o: ProbeOptions): ProbeResult {
  const rnd = random(o.seed), ex: Disagreement[] = [];
  const note = (d: Disagreement): void => { if (ex.length < 40) ex.push(d); };
  const r: ProbeResult = {
    scene: scene.id,
    clearance: { tried: 0, agree: 0, oldClearNewBlocked: 0, artInsideOldCover: 0, newClearOldBlocked: 0, standOffMax: 0, standOffMean: 0, spurious: 0 },
    moves: { tried: 0, agree: 0, freed: 0, freedMax: 0, oldThroughArt: 0, spurious: 0, bothHitSlideDiffers: 0, slideDiffMax: 0, endIllegal: 0, endIllegalAsOld: 0 },
    support: { tried: 0, agree: 0, oldHigher: 0, newHigher: 0, floatMax: 0, floatMean: 0, newHigherMax: 0 },
    sight: { tried: 0, agree: 0, oldOnlyBlocked: 0, newOnlyBlocked: 0, newOnlyBlockedOutsideArt: 0 },
    protected: { paths: 0, poses: 0, newlyBlocked: [], newlyCleared: [] },
    examples: ex,
  };
  let standSum = 0;
  for (const { id, shape } of scene.shapes) {
    const clearStarts: Vec3[] = [];
    for (let i = 0; i < o.poses; i++) {
      const p = samplePose(scene, rnd, shape), a = scene.old.clearance(p, shape), b = scene.neo.clearance(p, shape), { c, e } = boxOf(p, shape);
      r.clearance.tried++;
      if (a === b) { r.clearance.agree++; if (a) clearStarts.push(p); continue; }
      if (a) {
        r.clearance.oldClearNewBlocked++;
        if (scene.art.overlaps(c, e)) r.clearance.artInsideOldCover++;
        else { r.clearance.spurious++; note({ kind: "new blocks without art", shape: id, at: p }); }
      } else {
        r.clearance.newClearOldBlocked++;
        const s = standOff(scene.art, c, e);
        standSum += s; r.clearance.standOffMax = Math.max(r.clearance.standOffMax, s);
      }
    }
    for (let i = 0; i < o.moves && clearStarts.length; i++) {
      const p = clearStarts[Math.floor(rnd() * clearStarts.length)]!, len = 0.5 + 6 * rnd(), u = rnd() * Math.PI * 2, w = Math.acos(2 * rnd() - 1);
      const d = { x: len * Math.sin(w) * Math.cos(u), y: len * Math.cos(w) * 0.6, z: len * Math.sin(w) * Math.sin(u) };
      const ma = scene.old.moveCapsule(p, d, shape), mb = scene.neo.moveCapsule(p, d, shape), a = ma.position, b = mb.position;
      r.moves.tried++;
      // Every move from a clear start ends legal by the new collider, unless
      // today's world ends the same move in a rejected pose too (existing
      // debt, kept apart and counted: `endIllegalAsOld`).
      if (scene.illegalEnd(b, shape)) {
        if (!scene.old.clearance(a, shape)) {
          r.moves.endIllegalAsOld++;
          if (r.moves.endIllegalAsOld <= 3) note({ kind: "ends illegal as today's world does", shape: id, at: p, detail: `d ${JSON.stringify(d)} end ${JSON.stringify(b)}` });
        }
        else { r.moves.endIllegal++; note({ kind: "new move ends illegal", shape: id, at: p, detail: `d ${JSON.stringify(d)} end ${JSON.stringify(b)}` }); }
      }
      const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (gap < 0.02) { r.moves.agree++; continue; }
      if (!mb.hitSolid) { r.moves.freed++; r.moves.freedMax = Math.max(r.moves.freedMax, gap); continue; }
      if (ma.hitSolid) { r.moves.bothHitSlideDiffers++; r.moves.slideDiffMax = Math.max(r.moves.slideDiffMax, gap); continue; }
      // The old move went straight to p + d; the new one met something on
      // that straight path, which must be the art.
      const n = Math.ceil(Math.hypot(d.x, d.y, d.z) / 0.02);
      let through = false;
      for (let k = 1; k <= n && !through; k++) {
        const q = { x: p.x + d.x * k / n, y: p.y + d.y * k / n, z: p.z + d.z * k / n }, bx = boxOf(q, shape);
        through = scene.art.overlaps(bx.c, { x: bx.e.x + 0.01, y: bx.e.y + 0.01, z: bx.e.z + 0.01 });
      }
      if (through) r.moves.oldThroughArt++;
      else { r.moves.spurious++; note({ kind: "new stops where the old went free, no art on the path", shape: id, at: p, detail: `d ${JSON.stringify(d)} new ${JSON.stringify(b)}` }); }
    }
  }
  r.clearance.standOffMean = r.clearance.newClearOldBlocked ? standSum / r.clearance.newClearOldBlocked : 0;
  let floatSum = 0;
  for (let i = 0; i < o.columns; i++) {
    // Support under a diver standing clear in both worlds (inside rock it means nothing).
    const s = samplePose(scene, rnd, DIVER), fromY = s.y;
    if (!scene.old.clearance(s, DIVER) || !scene.neo.clearance(s, DIVER)) continue;
    const a = scene.old.supportHeight(s.x, s.z, fromY), b = scene.neo.supportHeight(s.x, s.z, fromY);
    r.support.tried++;
    if (!Number.isFinite(a) || !Number.isFinite(b)) { if (a === b) r.support.agree++; continue; }
    if (Math.abs(a - b) <= 0.02) { r.support.agree++; continue; }
    if (a > b) { r.support.oldHigher++; floatSum += a - b; r.support.floatMax = Math.max(r.support.floatMax, a - b); }
    else { r.support.newHigher++; r.support.newHigherMax = Math.max(r.support.newHigherMax, b - a); }
  }
  r.support.floatMean = r.support.oldHigher ? floatSum / r.support.oldHigher : 0;
  for (let i = 0; i < o.sights; i++) {
    const a0 = samplePose(scene, rnd, DIVER), b0 = samplePose(scene, rnd, DIVER);
    const a = { ...a0, y: a0.y + 0.5 }, b = { ...b0, y: b0.y + 0.5 };
    const x = scene.old.lineOfSight(a, b), y = scene.neo.lineOfSight(a, b);
    r.sight.tried++;
    if (x === y) { r.sight.agree++; continue; }
    if (!x) r.sight.oldOnlyBlocked++;
    else { r.sight.newOnlyBlocked++; if (scene.art.segmentClear(a, b)) { r.sight.newOnlyBlockedOutsideArt++; note({ kind: "sight blocked without art", shape: "ray", at: a, detail: JSON.stringify(b) }); } }
  }
  for (const p of scene.paths) {
    r.protected.paths++;
    const a = pathClear(scene.old, p), b = pathClear(scene.neo, p);
    if (a && !b) r.protected.newlyBlocked.push(p.id);
    if (!a && b) r.protected.newlyCleared.push(p.id);
  }
  for (const p of scene.poses) {
    r.protected.poses++;
    const a = scene.old.clearance(p.pose, p.shape), b = scene.neo.clearance(p.pose, p.shape);
    if (a && !b) r.protected.newlyBlocked.push(p.id);
    if (!a && b) r.protected.newlyCleared.push(p.id);
  }
  return r;
}

/** A path is clear when every leg's move reaches its end without a contact. */
export function pathClear(world: WorldQueries, p: ProtectedPath): boolean {
  for (let i = 1; i < p.path.length; i++) {
    const a = p.path[i - 1]!, b = p.path[i]!, m = world.moveCapsule(a, { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, p.shape);
    if (m.hitSolid || Math.hypot(m.position.x - b.x, m.position.y - b.y, m.position.z - b.z) > 0.001) return false;
  }
  return true;
}
