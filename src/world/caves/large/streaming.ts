import type { ChunkDescriptor, ChunkId, LodBands, LodLevel, Vec3, WorldLayout, WorldMap } from "../../types.js";
import { boxDistance, chunkId } from "../../frame.js";
import { createWorldMap } from "../../map.js";
import type { UnitView } from "../../residency.js";
import { EXTERIOR } from "../../../content/caves/largeCave.js";
import type { LargeCave } from "./build.js";
import { chunkBox, type ChunkCoord } from "./mesh.js";

/** Cave-biome streaming through S1's residency (Babylon-free).
 *
 * - **Map.** `caveWorldMap` lays the cave's surface chunks out as an S1
 *   layout of its own: 32 m columns, one layer per occupied 32 m slab
 *   (ranked bottom up, so every column has a layer 0). A second residency
 *   runs over it under the same byte budget (`setExternalBytes` both ways).
 * - **Pins.** `CavePins` wraps the map's `chunksWithin`, which is all the
 *   residency reads: while the viewer is within `activation` metres of the
 *   domain, every cave chunk is wanted at least coarse (the coarse floor:
 *   no room is ever undrawn), and the chunks of the viewer's zone and of
 *   every zone one portal away are wanted fine (the next room is ready
 *   before the craft gets there). Elsewhere the usual distance bands apply.
 * - **Coverage.** `coverageProblems` is the adverse-case invariant: every
 *   chunk a moving box touches must be drawn fine (so every contact is
 *   against drawn rock: art and collision are one mesh at fine), and every
 *   chunk of its zone must be drawn at some LOD.
 * Collision is not here: it is resident for as long as the cave is active,
 * whatever the art residency does. */

export const CAVE_LOD: LodBands = { fine: 48, coarse: 176, hysteresis: 8 };
export const CAVE_FACTORY = "lc.cave";

export interface CaveChunkRef {
  readonly id: ChunkId;
  readonly coord: ChunkCoord;
  /** Zone indices whose carves reach this chunk. */
  readonly zones: readonly number[];
}

export interface CaveMap {
  readonly map: WorldMap;
  readonly cave: LargeCave;
  readonly refs: readonly CaveChunkRef[];
  byCoord(c: ChunkCoord): CaveChunkRef | undefined;
  byId(id: ChunkId): CaveChunkRef | undefined;
  /** Zone indices one portal away from a zone (both directions). */
  neighbours(zone: number): readonly number[];
}

export function caveWorldMap(cave: LargeCave, lod: LodBands = CAVE_LOD): CaveMap {
  const s = cave.source, l = cave.lattice, d = s.domain;
  const zoneIndex = new Map(s.zones.map((z, i) => [z.id, i]));
  // Zones per chunk from the carves' own reach (source data, no mesh needed).
  const carveZones = s.carves.map(c => zoneIndex.get(c.zone)!);
  const carveBoxes = s.carves.map(c => carveExtent(c));
  const byColumn = new Map<string, ChunkCoord[]>();
  for (const c of cave.chunks) {
    const k = `${c.cx}:${c.cz}`;
    byColumn.set(k, [...(byColumn.get(k) ?? []), c]);
  }
  const refs: CaveChunkRef[] = [], chunks: ChunkDescriptor[] = [];
  for (const [, column] of [...byColumn].sort(([a], [b]) => (a < b ? -1 : 1))) {
    column.sort((a, b) => a.cy - b.cy);
    column.forEach((c, layer) => {
      const box = chunkBox(l, c), cell = { ix: c.cx, iz: c.cz, layer }, id = chunkId(cell);
      const zones = [...new Set(carveBoxes.flatMap((b, i) => b.min.x <= box.max.x && b.max.x >= box.min.x &&
        b.min.y <= box.max.y && b.max.y >= box.min.y && b.min.z <= box.max.z && b.max.z >= box.min.z ? [carveZones[i]!] : []))].sort((a, b) => a - b);
      refs.push({ id, coord: c, zones });
      chunks.push({ id, cell, bounds: box, region: s.region, biome: `cave:${s.id}`, lod,
        art: [{ factory: CAVE_FACTORY, params: { cave: s.id, cx: c.cx, cy: c.cy, cz: c.cz } }] });
    });
  }
  const layout: WorldLayout = {
    envelope: d, chunkSize: s.chunk, biomes: [{ id: `cave:${s.id}`, label: s.label, lod }],
    regions: [{ id: s.region, bounds: d, footprint: [{ minX: d.min.x, maxX: d.max.x, minZ: d.min.z, maxZ: d.max.z }],
      biomes: [`cave:${s.id}`], adjacency: [], access: { depthRatingM: Math.ceil(-d.min.y), entrances: [] } }],
    chunks,
  };
  const map = createWorldMap(layout);
  const coordKey = (c: ChunkCoord): string => `${c.cx}:${c.cy}:${c.cz}`;
  const byCoord = new Map(refs.map(r => [coordKey(r.coord), r]));
  const byId = new Map(refs.map(r => [r.id, r]));
  const links = s.zones.map(() => new Set<number>());
  for (const p of s.portals) {
    const [a, b] = p.between.map(z => (z === EXTERIOR ? -1 : zoneIndex.get(z) ?? -1));
    if (a! >= 0 && b! >= 0) { links[a!]!.add(b!); links[b!]!.add(a!); }
  }
  return { map, cave, refs, byCoord: c => byCoord.get(coordKey(c)), byId: id => byId.get(id), neighbours: z => [...(links[z] ?? [])].sort((a, b) => a - b) };
}

function carveExtent(c: LargeCave["source"]["carves"][number]): { min: Vec3; max: Vec3 } {
  const p = c.wobble + 1;
  if (c.kind === "tunnel") {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const n of c.nodes) {
      minX = Math.min(minX, n.x - n.width / 2); maxX = Math.max(maxX, n.x + n.width / 2);
      minZ = Math.min(minZ, n.z - n.width / 2); maxZ = Math.max(maxZ, n.z + n.width / 2);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.height);
    }
    return { min: { x: minX - p, y: minY - p, z: minZ - p }, max: { x: maxX + p, y: maxY + p, z: maxZ + p } };
  }
  if (c.kind === "chamber") {
    const r = Math.max(c.radii.x, c.radii.z) + p;
    return { min: { x: c.center.x - r, y: c.floor - p, z: c.center.z - r }, max: { x: c.center.x + r, y: c.center.y + c.radii.up + p, z: c.center.z + r } };
  }
  const r = c.radius + c.flare + p;
  return { min: { x: Math.min(c.bottom.x, c.top.x) - r, y: Math.min(c.bottom.y, c.top.y) - p, z: Math.min(c.bottom.z, c.top.z) - r },
    max: { x: Math.max(c.bottom.x, c.top.x) + r, y: Math.max(c.bottom.y, c.top.y) + p, z: Math.max(c.bottom.z, c.top.z) + r } };
}

export interface PinState {
  /** Viewer's zone (index) or -1 outside every carve. */
  readonly zone: number;
  /** Chunk IDs wanted fine regardless of distance. */
  readonly fine: ReadonlySet<ChunkId>;
  /** True when the coarse floor is on (viewer near the domain). */
  readonly active: boolean;
}

/** Longest look-ahead the local pins cover, metres: with a 2 m coverage
 * reach and a craft box up to 9 m, the pinned envelope stays under one 32 m
 * chunk wide, so it spans at most 2 x 2 x 2 chunks (`LOCAL_CHUNKS`). */
export const MAX_LOOKAHEAD = 8;
export const LOCAL_CHUNKS = 8;
export const COVERAGE_REACH = 2;

/** Pins for a viewer, and a map view the residency reads them through.
 * While active, exactly the pinned chunks are wanted fine (the viewer's zone,
 * every zone one portal away, and the chunks round the actor's look-ahead
 * envelope) and every other cave chunk exactly coarse, so the art the cave
 * needs is bounded by `caveArtMinimum`. */
export class CavePins {
  private state: PinState = { zone: -1, fine: new Set(), active: false };
  readonly view: WorldMap;
  constructor(private readonly cm: CaveMap, private readonly activation = 160) {
    const inner = cm.map;
    const lod = (c: ChunkDescriptor): LodBands => c.lod;
    this.view = {
      ...inner,
      chunksWithin: (p, radius) => {
        const out: { chunk: ChunkDescriptor; distance: number }[] = [];
        for (const chunk of inner.layout.chunks) {
          const b = lod(chunk);
          let distance = boxDistance(chunk.bounds, p);
          if (this.state.fine.has(chunk.id)) distance = Math.min(distance, b.fine - 1);
          // Unpinned: coarse, never fine (even close by, and past hysteresis).
          else if (this.state.active) distance = Math.max(b.fine + b.hysteresis, Math.min(distance, b.coarse - 1));
          if (distance <= radius) out.push({ chunk, distance });
        }
        return out.sort((a, b) => a.distance - b.distance || (a.chunk.id < b.chunk.id ? -1 : 1));
      },
    };
  }
  get current(): PinState { return this.state; }
  /** Recompute pins for a viewer position, and optionally the actor's box
   * and how far ahead it may move before the next update (clamped to
   * `MAX_LOOKAHEAD`). */
  update(viewer: Vec3, actor?: { min: Vec3; max: Vec3 }, lookahead = 0): PinState {
    const cm = this.cm, d = cm.cave.source.domain;
    const active = boxDistance(d, viewer) <= this.activation;
    let zone = active ? cm.cave.field.zoneAt(viewer.x, viewer.y, viewer.z) : -1;
    // Outside every carve but near a mouth: the zone its nearest mouth opens on.
    if (active && zone < 0) zone = nearestMouthZone(cm, viewer);
    const zones = zone >= 0 ? new Set([zone, ...cm.neighbours(zone)]) : new Set<number>();
    const fine = new Set(cm.refs.filter(r => r.zones.some(z => zones.has(z))).map(r => r.id));
    if (active && actor) for (const id of touchedChunks(cm, actor, COVERAGE_REACH + Math.min(MAX_LOOKAHEAD, lookahead))) fine.add(id);
    this.state = { zone, fine, active };
    return this.state;
  }
}

/** Chunk IDs whose box comes within `reach` of a box. */
export function touchedChunks(cm: CaveMap, box: { min: Vec3; max: Vec3 }, reach: number): ChunkId[] {
  return cm.refs.filter(r => {
    const b = cm.map.chunk(r.id)!.bounds;
    return b.min.x <= box.max.x + reach && b.max.x >= box.min.x - reach && b.min.y <= box.max.y + reach &&
      b.max.y >= box.min.y - reach && b.min.z <= box.max.z + reach && b.max.z >= box.min.z - reach;
  }).map(r => r.id);
}

/** Art bytes of one chunk at each LOD (fine includes its life mesh). */
export type CaveArtCost = (id: ChunkId) => { readonly fine: number; readonly coarse: number };

/** The least art share (bytes, CPU and GPU alike: the loader keeps one copy
 * of each array on each side) under which the pins always fit: every chunk
 * coarse, plus the costliest pinned zone set fine, plus `LOCAL_CHUNKS` of the
 * costliest fine units for the look-ahead, plus S1's probe reservations. The
 * world must give the cave at least this beside its fixed bytes before the
 * player may enter; `CaveGate` enforces safety if it ever does not. */
export function caveArtMinimum(cm: CaveMap, cost: CaveArtCost, residency: { inFlight?: number; estimate?: number } = {}): number {
  let coarse = 0;
  const fine = new Map<ChunkId, number>();
  for (const r of cm.refs) { const c = cost(r.id); coarse += c.coarse; fine.set(r.id, c.fine); }
  // A pinned set's fine units in full: during a coarse-to-fine swap S1 keeps
  // the outgoing coarse drawn, so the coarse copies stay counted beside them.
  let zoneSet = 0;
  for (let z = 0; z < cm.cave.source.zones.length; z++) {
    const zones = new Set([z, ...cm.neighbours(z)]);
    let sum = 0;
    for (const r of cm.refs) if (r.zones.some(q => zones.has(q))) sum += fine.get(r.id)!;
    zoneSet = Math.max(zoneSet, sum);
  }
  const sorted = [...fine.values()].sort((a, b) => b - a);
  const local = sorted.slice(0, LOCAL_CHUNKS).reduce((n, v) => n + v, 0);
  // Units S1 has not measured yet are probed at its per-LOD guess (1 MiB fine
  // by default), up to `inFlight` at once.
  const probes = (residency.inFlight ?? 2) * Math.max(residency.estimate ?? 1048576, sorted[0] ?? 0);
  return coarse + zoneSet + local + probes;
}

/** The movement gate: the safe response whenever coverage cannot be kept
 * (cold entry, a zone change before its chunks arrive, a turn into an
 * unloaded passage, or the art share shrinking after entry). A move is
 * allowed only when the actor's box at the destination, grown by
 * `COVERAGE_REACH`, touches no chunk that is not drawn fine and the
 * destination's zone has every chunk drawn. Otherwise the actor holds
 * (and may still retreat into covered space). */
export class CaveGate {
  /** Frames refused, and why the latest refusal happened. */
  readonly stats = { refused: 0, reason: "" };
  constructor(private readonly cm: CaveMap) {}
  allows(shown: ReadonlyMap<ChunkId, LodLevel>, destination: { min: Vec3; max: Vec3 }): boolean {
    const c = { x: (destination.min.x + destination.max.x) / 2, y: (destination.min.y + destination.max.y) / 2, z: (destination.min.z + destination.max.z) / 2 };
    const near = boxDistance(this.cm.cave.source.domain, c) <= COVERAGE_REACH + 16;
    if (!near) return true;
    let zone = this.cm.cave.field.zoneAt(c.x, c.y, c.z);
    if (zone < 0) zone = nearestMouthZone(this.cm, c);
    const problems = coverageProblems(this.cm, shown, destination, COVERAGE_REACH, zone);
    if (!problems.length) return true;
    this.stats.refused++; this.stats.reason = problems[0]!;
    return false;
  }
}

function nearestMouthZone(cm: CaveMap, p: Vec3): number {
  const s = cm.cave.source, zoneIndex = new Map(s.zones.map((z, i) => [z.id, i]));
  let best = Infinity, zone = -1;
  for (const portal of s.portals) {
    if (!portal.between.includes(EXTERIOR)) continue;
    const dd = Math.hypot(portal.center.x - p.x, portal.center.y - p.y, portal.center.z - p.z);
    if (dd < best && dd < 60) { best = dd; zone = zoneIndex.get(portal.between[0] === EXTERIOR ? portal.between[1] : portal.between[0]) ?? -1; }
  }
  return zone;
}

/** Shown LOD per cave chunk from residency units. */
export function shownLods(units: readonly UnitView[]): Map<ChunkId, LodLevel> {
  const out = new Map<ChunkId, LodLevel>();
  for (const u of units) if (u.state === "shown" && (u.lod === "fine" || !out.has(u.chunk))) out.set(u.chunk, u.lod);
  return out;
}

/** Problems with what is drawn round a moving box, as readable strings:
 * a touched chunk (box grown by `reach`) not drawn fine, or a chunk of the
 * box's zone not drawn at all. Empty when the adverse-case invariant holds. */
export function coverageProblems(cm: CaveMap, shown: ReadonlyMap<ChunkId, LodLevel>, box: { min: Vec3; max: Vec3 }, reach: number, zone: number): string[] {
  const out: string[] = [];
  for (const r of cm.refs) {
    const b = cm.map.chunk(r.id)!.bounds;
    const touched = b.min.x <= box.max.x + reach && b.max.x >= box.min.x - reach && b.min.y <= box.max.y + reach &&
      b.max.y >= box.min.y - reach && b.min.z <= box.max.z + reach && b.max.z >= box.min.z - reach;
    if (touched && shown.get(r.id) !== "fine") out.push(`${r.id} touched but ${shown.get(r.id) ?? "undrawn"}`);
    else if (zone >= 0 && r.zones.includes(zone) && !shown.has(r.id)) out.push(`${r.id} in the viewer's zone but undrawn`);
  }
  return out;
}
