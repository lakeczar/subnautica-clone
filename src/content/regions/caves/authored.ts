import type { MaterialId, RegionId } from "../../registry.js";
import { assertDisjointFootprints, AUTHORED_CAVE_SOURCES, EXTERIOR, type CarveSource, type CaveDef, type CavePortal, type CaveRoomSource,
  type CaveRoute, type CaveSource, type TerraceSource } from "../caves.js";
import { floorIdentity, nameFloor } from "../../buildCache.js";
import { buildCave } from "../caveGeometry.js";
import type { CraftProfileId } from "../passages.js";
import type { FloorFunction } from "../terrain.js";
import type { Vec3 } from "../../../world/types.js";

/** Small and medium caves authored from the content bible with the W1 kit
 * (CA-2: Lantern Canopy and Pale Basin). Babylon-free.
 *
 * A `CaveGroup` is one kit `CaveSource` (one owned footprint, one rock and
 * shell) plus the bible caves it holds. Most groups hold one cave. Where the
 * bible links small caves by a crawlway, the linked caves share one source
 * whose footprint owns every column the crawl crosses: the kit has no
 * union of footprints, and two sources cannot carve one passage across a
 * shared edge (each samples the other's columns as plain seabed). That is
 * the bible's "explicit union" of rock ownership.
 *
 * Everything here references the bible by ID (`docs/content/regions/*.md`,
 * `src/content/proposals/*`). The game may not import the proposals, so the
 * IDs are strings and `tests/caves-canopy*` / `tests/caves-basin*` resolve
 * every one against them. */

/** One bible cave inside a group. */
export interface BibleCave {
  /** The bible's `CaveProposal.id`. */
  readonly id: string;
  readonly size: "small" | "medium";
  /** Source rooms that make up this cave. */
  readonly rooms: readonly string[];
  /** Each bible exit name and the mouth portal that is it. */
  readonly exits: readonly { readonly exit: string; readonly portal: string }[];
  /** Medium caves: each bible chamber and its room. */
  readonly chambers?: readonly { readonly name: string; readonly room: string }[];
  /** Medium caves: each bible passage and the portal (mouth or throat) it is.
   * A passage between two chambers through a passage room names the portal
   * at its far chamber; `via` names the passage room. */
  readonly passages?: readonly { readonly id: string; readonly portal: string; readonly via?: string }[];
  /** Medium caves: the bible's closing passage. */
  readonly loopCloser?: string;
  /** Medium caves: the main hall and the largest profile it takes. */
  readonly hall?: { readonly rooms: readonly string[]; readonly admits: CraftProfileId };
}

/** A crawlway or back entrance between bible caves, with its rock owner. */
export interface CaveLink {
  readonly id: string;
  /** Bible cave IDs, or a cave-biome ID for a back entrance. */
  readonly between: readonly [string, string];
  readonly kind: "crawlway" | "back_entrance";
  /** The source that owns every column of the link's rock. */
  readonly owner: string;
  /** The crawl's room(s). */
  readonly rooms: readonly string[];
  /** Diver routes through or out of the link: a through swim, a turn-back,
   * or an exit from its deepest point. */
  readonly rescue: readonly string[];
  readonly note: string;
}

/** Where a back-entrance crawl stops at a cave biome's boundary. The biome
 * (built on the large-cave technology) opens the face; until it does, the
 * crawl ends in rock with a turning bay. */
export interface BiomeHandoff {
  readonly id: string;
  /** Bible biome and its entrance ID. */
  readonly biome: string;
  readonly entrance: string;
  readonly room: string;
  /** The face the biome must meet: centre, outward unit normal (towards the
   * biome) and the clear rectangle the biome keeps open. */
  readonly center: Vec3;
  readonly normal: Vec3;
  readonly clear: { readonly width: number; readonly height: number };
}

export type CaveSpecies = "resin_weaver" | "wakeglow_drift" | "basin_scavengers";

/** A material source inside a cave. `bible` pockets are the bible's
 * `ResourceProposal`s (stock lives there); `proposed` ones are new IDs for
 * contents the bible names in prose, with a proposed stock. */
export interface ResourcePocket {
  readonly id: string;
  readonly status: "bible" | "proposed";
  readonly item: MaterialId;
  readonly cave: string;
  readonly room: string;
  /** Harvest datum: in the cave's water, within reach of the wall it grows on. */
  readonly at: Vec3;
  /** Proposed pockets only: stock, bundle, finite reserve (SiteDef convention). */
  readonly stock?: readonly [stock: number, bundle: number, reserve: number];
  readonly renewable: boolean;
  readonly note: string;
}

/** Resident placements: where a species spawns, how many, and its cue. */
export interface ResidentSpawn {
  readonly id: string;
  readonly species: CaveSpecies;
  readonly cave: string;
  readonly room: string;
  readonly at: Vec3;
  readonly count: number;
  /** Spread radius around `at`, metres; every spawn point stays in water. */
  readonly radius: number;
  readonly den?: boolean;
  readonly note: string;
}

/** Small finds: scan targets, caches, spare parts and framed views. */
export interface SmallFind {
  readonly id: string;
  readonly kind: "scan" | "cache" | "part" | "view";
  readonly cave: string;
  readonly room: string;
  readonly at: Vec3;
  readonly label: string;
  /** Caches and parts: what is inside (finite; never a required-only source). */
  readonly contents?: Readonly<Partial<Record<MaterialId, number>>>;
  readonly note: string;
}

export interface CaveGroup {
  readonly source: CaveSource;
  readonly caves: readonly BibleCave[];
  readonly links: readonly CaveLink[];
  readonly handoffs: readonly BiomeHandoff[];
  readonly pockets: readonly ResourcePocket[];
  readonly residents: readonly ResidentSpawn[];
  readonly finds: readonly SmallFind[];
  /** Lamp-off cue the shell paints (`style.ts`): the region's own palette. */
  readonly style: "root_hollow" | "silt_vault";
}

// --- Authoring shorthands -------------------------------------------------------

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
type Axis = "+x" | "-x" | "+z" | "-z" | "+y" | "-y";
const NORMALS: Record<Axis, Vec3> = { "+x": v3(1, 0, 0), "-x": v3(-1, 0, 0), "+z": v3(0, 0, 1), "-z": v3(0, 0, -1), "+y": v3(0, 1, 0), "-y": v3(0, -1, 0) };
/** An opening from `room` to open water; `normal` points outward. */
export function mouth(id: string, label: string, room: string, center: Vec3, normal: Axis,
  clear: readonly [width: number, height: number], admits: readonly CraftProfileId[] = ["diver"]): CavePortal {
  return { id, kind: "mouth", label, between: [room, EXTERIOR], center, normal: NORMALS[normal], clear: { width: clear[0], height: clear[1] }, admits };
}
/** An aperture between two rooms; `normal` points from `from` to `to`. */
export function throat(id: string, label: string, from: string, to: string, center: Vec3, normal: Axis,
  clear: readonly [width: number, height: number], admits: readonly CraftProfileId[] = ["diver"]): CavePortal {
  return { id, kind: "throat", label, between: [from, to], center, normal: NORMALS[normal], clear: { width: clear[0], height: clear[1] }, admits };
}
export function room(id: string, role: CaveRoomSource["role"], label: string, falloff = 6): CaveRoomSource {
  return { id, role, label, falloff };
}
/** A tube from `[x, z, floor, width, height]` nodes. */
export function tube(id: string, roomId: string, nodes: readonly (readonly [number, number, number, number, number])[], wobble = 0.25): CarveSource {
  return { kind: "tube", id, room: roomId, wobble, nodes: nodes.map(([x, z, floor, width, height]) => ({ x, z, floor, width, height })) };
}
export function chamber(id: string, roomId: string, center: Vec3, radii: readonly [x: number, z: number, up: number, down: number],
  floor: number, wobble = 0.4): CarveSource {
  return { kind: "chamber", id, room: roomId, wobble, center, radii: { x: radii[0], z: radii[1], up: radii[2], down: radii[3] }, floor };
}
export function shaft(id: string, roomId: string, center: readonly [number, number], radius: number, bottom: number, top: number,
  flare = 0, wobble = 0.2): CarveSource {
  return { kind: "shaft", id, room: roomId, wobble, center, radius, flare, bottom, top };
}
export function terrace(id: string, level: number, center: readonly [number, number], radii: readonly [number, number],
  exponent: number, batter: number, wobble = 0.5, wavelength = 7): TerraceSource {
  return { id, level, center, radii, exponent, batter, wobble, wavelength };
}
export function route(id: string, profile: CraftProfileId, role: CaveRoute["role"], path: readonly (readonly [number, number, number])[]): CaveRoute {
  return { id, profile, role, path: path.map(([x, y, z]) => ({ x, y, z })) };
}

/** Small and medium caves must live in the right region with stable IDs. */
export function checkGroups(groups: readonly CaveGroup[], region: RegionId): void {
  const ids = new Set<string>();
  for (const g of groups) {
    if (g.source.region !== region) throw new Error(`${g.source.id}: region ${g.source.region}, expected ${region}`);
    const rooms = new Set(g.source.rooms.map(r => r.id)), portals = new Set(g.source.portals.map(p => p.id));
    // A single-cave group's source takes its cave's ID; nothing else repeats.
    const own = new Set([g.source.id, ...g.caves.map(c => c.id)]);
    for (const id of [...own, ...g.pockets.map(p => p.id), ...g.residents.map(r => r.id), ...g.finds.map(f => f.id)]) {
      if (ids.has(id)) throw new Error(`duplicate cave id ${id}`);
      ids.add(id);
    }
    for (const c of g.caves) {
      for (const r of [...c.rooms, ...(c.chambers ?? []).map(k => k.room), ...(c.hall?.rooms ?? [])])
        if (!rooms.has(r)) throw new Error(`${c.id}: unknown room ${r}`);
      for (const p of [...c.exits.map(e => e.portal), ...(c.passages ?? []).map(k => k.portal)])
        if (!portals.has(p)) throw new Error(`${c.id}: unknown portal ${p}`);
    }
    for (const x of [...g.pockets, ...g.residents, ...g.finds]) {
      if (!rooms.has(x.room)) throw new Error(`${x.id}: unknown room ${x.room}`);
      if (!g.caves.some(c => c.id === x.cave)) throw new Error(`${x.id}: cave ${x.cave} is not in ${g.source.id}`);
    }
  }
}

/** Edge band a cave holds level with its edge, metres: one 2 m rock cube
 * plus half a voxel. */
export const EDGE_SHELF = 2.25;
/** Width over which the shelf falls back to the ground, metres. */
export const EDGE_LIP = 2;
const PROFILE_STEP = 0.25;

/** The smallest profile at or above `p` (samples `step` apart) in which
 * every sample lies in some window of `width` metres, inside the profile,
 * that it is the lowest of: what a cube that may not leave the profile
 * keeps of it. Monotone stretches are unchanged; a crest, or an end that is
 * a high point, becomes a level plateau one window wide. */
export function openProfile(p: readonly number[], step: number, width: number): number[] {
  const out = [...p], n = out.length, k = Math.min(n, Math.ceil(width / step) + 1);
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = -1, cost = Infinity;
      for (let a = Math.max(0, i - k + 1); a <= Math.min(i, n - k); a++) {
        let c = 0;
        for (let j = a; j < a + k; j++) c += Math.max(0, out[i]! - out[j]!);
        if (c < cost) { cost = c; best = a; }
      }
      if (cost <= 1e-9) continue;
      for (let j = best; j < best + k; j++) if (out[j]! < out[i]!) { out[j] = out[i]!; changed = true; }
    }
    if (!changed) break;
  }
  return out;
}

/** An exact (x, z) -> height memo. A rounded key would hand a later query
 * the height of whichever nearby point was asked first, so a cave's floor
 * (and its shells) would depend on build order (COL-1 R6). Open addressing
 * over Float64 triples keeps every point's own value at about the memory a
 * numeric-keyed Map took. Queries are never NaN (they are inside the
 * footprint), so NaN marks an empty slot.
 *
 * Owned by its `caveFloor`; at most `POINT_MEMO_ENTRIES` points (a table of
 * 6 MiB at most: the largest cave build asks about 64 thousand); past that
 * it starts empty again, which changes no answer, since every entry is the
 * exact height of its point. (Ledger registration waits on STEW-1's.) */
const POINT_MEMO_ENTRIES = 1 << 17;
function pointMemo(): { get(x: number, z: number): number | undefined; set(x: number, z: number, h: number): void } {
  let cap = 1 << 12, size = 0, table = new Float64Array(cap * 3).fill(NaN);
  const find = (t: Float64Array, n: number, x: number, z: number): number => {
    let i = (Math.imul(Math.round(x * 64) | 0, 0x9e3779b1) ^ Math.imul(Math.round(z * 64) | 0, 0x85ebca6b)) & (n - 1);
    while (!Number.isNaN(t[i * 3]!) && (t[i * 3] !== x || t[i * 3 + 1] !== z)) i = (i + 1) & (n - 1);
    return i;
  };
  return {
    get(x, z) {
      const i = find(table, cap, x, z);
      return Number.isNaN(table[i * 3]!) ? undefined : table[i * 3 + 2]!;
    },
    set(x, z, h) {
      if (size >= POINT_MEMO_ENTRIES) { cap = 1 << 12; size = 0; table = new Float64Array(cap * 3).fill(NaN); }
      if ((size + 1) * 2 > cap) {
        const old = table, n = cap;
        cap *= 2; table = new Float64Array(cap * 3).fill(NaN);
        for (let j = 0; j < n; j++) if (!Number.isNaN(old[j * 3]!)) table.set(old.subarray(j * 3, j * 3 + 3), find(table, cap, old[j * 3]!, old[j * 3 + 1]!) * 3);
      }
      const i = find(table, cap, x, z);
      if (Number.isNaN(table[i * 3]!)) size++;
      table[i * 3] = x; table[i * 3 + 1] = z; table[i * 3 + 2] = h;
    },
  };
}

/** The floor a cave is built on: the exterior floor, except in a band
 * `EDGE_SHELF` wide inside each footprint edge, which stands at least at
 * that edge's open profile (`openProfile` of the floor along the edge) and
 * then falls straight back to the ground over `EDGE_LIP` metres.
 *
 * Why: the kit keeps only rock that a 2 m cube inside the footprint fits in
 * (`caveGeometry.ts` thick rock), and snaps the shell's edge to the floor.
 * Inside, a cube can always lean towards higher ground, so slopes keep
 * their rock. At the edge it cannot lean outward: where the ground rises
 * outward, along a crest of the edge, or at a corner that is a high point,
 * the rock top sinks below the snapped shell, up to 2 m x slope (over a
 * metre on these slopes). The band gives the cube room, so rock and shell
 * meet the floor along every edge. Equal to `floor` outside the footprint
 * and exactly on its edge, so the collar, the pad and the adapter's
 * exterior are unchanged.
 *
 * Residual: where a band rises above the ground next to a corner, it stands
 * above the falling side edge there, over a strip half a voxel wide. The
 * tests bound it by the corner's own relief and report each one. */
export function caveFloor(source: CaveSource, floor: FloorFunction): FloorFunction {
  const f = source.footprint, cache = pointMemo();
  type Edge = { d: (x: number, z: number) => number; l: (x: number, z: number) => number; at: (l: number) => [number, number];
    inward: [number, number]; profile: number[] };
  const edge = (d: Edge["d"], l: Edge["l"], at: Edge["at"], inward: [number, number], length: number): Edge => {
    const raw: number[] = [];
    for (let i = 0; i * PROFILE_STEP <= length + 1e-9; i++) { const [x, z] = at(i * PROFILE_STEP); raw.push(floor(x, z)); }
    return { d, l, at, inward, profile: openProfile(raw, PROFILE_STEP, EDGE_SHELF) };
  };
  const w = f.maxX - f.minX, depth = f.maxZ - f.minZ;
  const edges: Edge[] = [
    edge(x => x - f.minX, (_, z) => z - f.minZ, l => [f.minX, f.minZ + l], [1, 0], depth),
    edge(x => f.maxX - x, (_, z) => z - f.minZ, l => [f.maxX, f.minZ + l], [-1, 0], depth),
    edge((_, z) => z - f.minZ, x => x - f.minX, l => [f.minX + l, f.minZ], [0, 1], w),
    edge((_, z) => f.maxZ - z, x => x - f.minX, l => [f.minX + l, f.maxZ], [0, -1], w),
  ];
  return (x, z) => {
    const ground = floor(x, z);
    // Outside, and exactly on every edge line (where the shell is snapped),
    // this is the exterior floor.
    if (!(x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ)) return ground;
    const hit = cache.get(x, z);
    if (hit !== undefined) return hit;
    let h = ground;
    for (const e of edges) {
      const d = e.d(x, z);
      if (d > 24) continue;
      // The profile at this point, between its samples.
      const t = Math.max(0, Math.min(e.profile.length - 1, e.l(x, z) / PROFILE_STEP)), i = Math.min(e.profile.length - 2, Math.floor(t));
      const top = e.profile[i]! + (e.profile[i + 1]! - e.profile[i]!) * (t - i);
      if (top <= ground || d > EDGE_SHELF + EDGE_LIP) continue;
      if (d <= EDGE_SHELF) { h = Math.max(h, top); continue; }
      // The lip: straight down from the shelf to the ground `EDGE_LIP` further in.
      const [qx, qz] = e.at(e.l(x, z)), reach = EDGE_SHELF + EDGE_LIP;
      const below = floor(qx + e.inward[0] * reach, qz + e.inward[1] * reach);
      h = Math.max(h, top + (below - top) * (d - EDGE_SHELF) / EDGE_LIP);
    }
    cache.set(x, z, h);
    return h;
  };
}

const built = new WeakMap<FloorFunction, Map<string, CaveDef>>();
/** A group's generated definition on its `caveFloor`, built once per
 * exterior floor function (the same memo `caveDef` keeps for `AUTHORED_CAVE_SOURCES`). */
export function groupDef(group: CaveGroup, floor: FloorFunction): CaveDef {
  let byId = built.get(floor);
  if (!byId) built.set(floor, byId = new Map());
  let def = byId.get(group.source.id);
  if (!def) {
    // `caveFloor` depends only on the source and the exterior floor, and the source is in the cave's cache key.
    const id = floorIdentity(floor), groupFloor = caveFloor(group.source, floor);
    def = buildCave(group.source, id ? nameFloor(groupFloor, `caveFloor(${id.name})`, [import.meta.url, ...id.modules]) : groupFloor);
    byId.set(group.source.id, def);
  }
  return def;
}

/** Throws if any footprint overlaps another, every authored kit cave (CA-1's included) too. */
export function assertGroupsDisjoint(groups: readonly CaveGroup[]): void {
  assertDisjointFootprints([...AUTHORED_CAVE_SOURCES, ...groups.map(g => g.source)]);
}

/** A group moved rigidly by `by` (whole metres, so every lattice edge and
 * level stays on the voxel lattice): used where a bible footprint had to move
 * and the cave keeps its authored shape. */
export function moved(group: CaveGroup, by: Vec3): CaveGroup {
  const p = (q: Vec3): Vec3 => ({ x: q.x + by.x, y: q.y + by.y, z: q.z + by.z });
  const xz = (c: readonly [number, number]): [number, number] => [c[0] + by.x, c[1] + by.z];
  const s = group.source, f = s.footprint;
  const carves = s.carves.map((c): CarveSource => c.kind === "tube"
    ? { ...c, nodes: c.nodes.map(n => ({ ...n, x: n.x + by.x, z: n.z + by.z, floor: n.floor + by.y })) }
    : c.kind === "chamber" ? { ...c, center: p(c.center), floor: c.floor + by.y }
      : { ...c, center: xz(c.center), bottom: c.bottom + by.y, top: c.top + by.y });
  return {
    ...group,
    source: {
      ...s,
      footprint: { minX: f.minX + by.x, maxX: f.maxX + by.x, minZ: f.minZ + by.z, maxZ: f.maxZ + by.z },
      baseY: s.baseY + by.y, topY: s.topY + by.y,
      terraces: s.terraces.map(t => ({ ...t, level: t.level + by.y, center: xz(t.center) })),
      carves,
      portals: s.portals.map(q => ({ ...q, center: p(q.center) })),
      routes: s.routes.map(r => ({ ...r, path: r.path.map(p) })),
      staging: s.staging.map(q => ({ ...q, position: p(q.position) })),
    },
    handoffs: group.handoffs.map(h => ({ ...h, center: p(h.center) })),
    pockets: group.pockets.map(q => ({ ...q, at: p(q.at) })),
    residents: group.residents.map(q => ({ ...q, at: p(q.at) })),
    finds: group.finds.map(q => ({ ...q, at: p(q.at) })),
  };
}
