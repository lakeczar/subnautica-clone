import type { ChunkDescriptor, ChunkId, LodBands, LodLevel, Vec3, WorldLayout, WorldMap } from "../../types.js";
import { boxDistance, chunkId } from "../../frame.js";
import { createWorldMap } from "../../map.js";
import type { ChunkLoader, PreparedArt, ResidentArt, UnitView } from "../../residency.js";
import { EXTERIOR } from "../../../content/caves/largeCave.js";
import type { LargeCave } from "./build.js";
import { chunkBox, type ChunkCoord } from "./mesh.js";
import { boxTouchesOwned } from "./ownership.js";

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

/** Pins for a viewer, and a map view the FINE residency reads them through.
 * While active, exactly the pinned chunks are wanted fine (the viewer's zone,
 * every zone one portal away, and the chunks round the actor's look-ahead
 * envelope); nothing else is wanted. Fine art is opportunistic: other owners
 * may squeeze it out. Coarse art is the `CaveSafetySet`'s, held for as long
 * as the biome is admitted. */
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
          if (!this.state.fine.has(chunk.id)) continue;
          distance = Math.min(distance, b.fine - 1);
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

/** The safety reservation's art bytes: every chunk of the biome at coarse
 * (mouths and collars included: they are surface chunks). Exact, from the
 * bake's per-chunk costs. */
export function caveSafetyBytes(cm: CaveMap, cost: CaveArtCost): number {
  return cm.refs.reduce((n, r) => n + cost(r.id).coarse, 0);
}

/** The fine share that keeps every pin fine (recommended, not required):
 * the costliest pinned zone set, plus `LOCAL_CHUNKS` of the costliest units
 * for the look-ahead, plus S1's probe reservations, capped at every chunk
 * fine. Below it the player sees coarse rock somewhere, never undrawn rock. */
export function caveFineShare(cm: CaveMap, cost: CaveArtCost, residency: { inFlight?: number; estimate?: number } = {}): number {
  const fine = new Map<ChunkId, number>();
  for (const r of cm.refs) fine.set(r.id, cost(r.id).fine);
  let zoneSet = 0;
  for (let z = 0; z < cm.cave.source.zones.length; z++) {
    const zones = new Set([z, ...cm.neighbours(z)]);
    let sum = 0;
    for (const r of cm.refs) if (r.zones.some(q => zones.has(q))) sum += fine.get(r.id)!;
    zoneSet = Math.max(zoneSet, sum);
  }
  const sorted = [...fine.values()].sort((a, b) => b - a);
  const local = sorted.slice(0, LOCAL_CHUNKS).reduce((n, v) => n + v, 0);
  const probes = (residency.inFlight ?? 2) * Math.max(residency.estimate ?? 1048576, sorted[0] ?? 0);
  return Math.min(zoneSet + local, sorted.reduce((n, v) => n + v, 0)) + probes;
}

/** Shared-budget arbiter. Reservations (`reserve`) are all-or-nothing and
 * NON-REVOCABLE until their owner releases them; requests (`request`) are
 * granted only from what reservations and earlier grants leave. A cave's
 * fixed bytes and its coarse safety set are reservations, so no other owner
 * can take them; opportunistic art (a cave's fine residency) uses whatever
 * no grant holds and shrinks when one arrives. */
export class CaveArbiter {
  private readonly held = new Map<string, { cpu: number; gpu: number; fixed: boolean }>();
  constructor(readonly total: { readonly cpu: number; readonly gpu: number }) {}
  private sum(except?: string): { cpu: number; gpu: number } {
    let cpu = 0, gpu = 0;
    for (const [k, v] of this.held) if (k !== except) { cpu += v.cpu; gpu += v.gpu; }
    return { cpu, gpu };
  }
  /** Reserve exactly `bytes`, or nothing. True when held (already or now). */
  reserve(owner: string, bytes: { cpu: number; gpu: number }): boolean {
    const h = this.held.get(owner);
    if (h?.fixed) return h.cpu >= bytes.cpu && h.gpu >= bytes.gpu;
    const used = this.sum(owner);
    if (used.cpu + bytes.cpu > this.total.cpu || used.gpu + bytes.gpu > this.total.gpu) return false;
    this.held.set(owner, { ...bytes, fixed: true });
    return true;
  }
  /** Ask for up to `bytes`; returns what is granted (replacing the last grant). */
  request(owner: string, bytes: { cpu: number; gpu: number }): { cpu: number; gpu: number } {
    if (this.held.get(owner)?.fixed) throw new Error(`arbiter: ${owner} holds a reservation`);
    const used = this.sum(owner);
    const g = { cpu: Math.max(0, Math.min(bytes.cpu, this.total.cpu - used.cpu)), gpu: Math.max(0, Math.min(bytes.gpu, this.total.gpu - used.gpu)) };
    this.held.set(owner, { ...g, fixed: false });
    return g;
  }
  release(owner: string): void { this.held.delete(owner); }
  holds(owner: string): boolean { return this.held.get(owner)?.fixed === true; }
  /** Everything held: the external bytes an opportunistic residency must leave. */
  committed(): { cpu: number; gpu: number } { return this.sum(); }
}

/** The coarse safety set: every chunk of a biome built at coarse and kept
 * resident, outside S1's residency, for as long as the biome is admitted.
 * Nothing evicts it; `release` (the player has left) disposes it. A chunk's
 * coarse is hidden while the fine residency shows that chunk fine. Built
 * nearest-first from the admission point, in time slices. */
export class CaveSafetySet {
  private readonly arts = new Map<ChunkId, ResidentArt>();
  private readonly pending: ChunkDescriptor[];
  private building: { chunk: ChunkDescriptor; gen: Generator<void, PreparedArt> } | null = null;
  bytes = { cpu: 0, gpu: 0 };
  constructor(cm: CaveMap, private readonly loader: ChunkLoader, from: Vec3) {
    this.pending = [...cm.map.layout.chunks].sort((a, b) => boxDistance(a.bounds, from) - boxDistance(b.bounds, from) || (a.id < b.id ? -1 : 1));
  }
  get complete(): boolean { return this.pending.length === 0 && this.building === null; }
  /** Build and upload for up to `budgetMs`. */
  step(budgetMs: number, now: () => number): void {
    const start = now();
    while (!this.complete && now() - start < budgetMs) {
      if (!this.building) { const chunk = this.pending.shift()!; this.building = { chunk, gen: this.loader.build(chunk, "coarse") }; }
      const r = this.building.gen.next();
      if (!r.done) continue;
      const prepared = r.value;
      let art: ResidentArt;
      if (prepared.beginUpload) { const job = prepared.beginUpload(); while (!job.done) job.step(Infinity, true); art = job.finish(); }
      else art = prepared.upload();
      art.setVisible(true);
      this.arts.set(this.building.chunk.id, art);
      this.bytes = { cpu: this.bytes.cpu + art.cpuBytes, gpu: this.bytes.gpu + art.gpuBytes };
      this.building = null;
    }
  }
  /** Hide coarse where the fine residency draws fine. */
  present(fine: ReadonlyMap<ChunkId, LodLevel>): void {
    for (const [id, a] of this.arts) a.setVisible(fine.get(id) !== "fine");
  }
  /** Drawn LOD per chunk: fine where the fine residency shows it, else this set's coarse. */
  drawn(fine: ReadonlyMap<ChunkId, LodLevel>): Map<ChunkId, LodLevel> {
    const out = new Map<ChunkId, LodLevel>();
    for (const id of this.arts.keys()) out.set(id, "coarse");
    for (const [id, l] of fine) if (l === "fine") out.set(id, "fine");
    return out;
  }
  dispose(): void {
    this.building?.gen.return(undefined as never);
    for (const a of this.arts.values()) a.dispose();
    this.arts.clear(); this.building = null; this.pending.length = 0;
  }
}

/** The movement gate.
 * - **Not admitted** (the biome's fixed bytes and coarse safety set are not
 *   reserved and built): any destination whose box, grown by
 *   `COVERAGE_REACH`, reaches the cave's owned space is refused, so the
 *   player waits outside the mouth. (A player already inside, after a
 *   reload, holds in place until admitted.)
 * - **Admitted:** a destination is allowed when every chunk its box (grown
 *   by `COVERAGE_REACH`) touches, and every chunk of its zone, is DRAWN at
 *   some LOD. The safety set keeps every chunk drawn at least coarse and
 *   nobody can revoke it, so an admitted player can always move, in any
 *   direction, under any pressure; fine detail is opportunistic. */
export class CaveGate {
  /** Frames refused, and why the latest refusal happened. */
  readonly stats = { refused: 0, reason: "" };
  constructor(private readonly cm: CaveMap) {}
  allows(drawn: ReadonlyMap<ChunkId, LodLevel>, destination: { min: Vec3; max: Vec3 }, admitted: boolean): boolean {
    const r = COVERAGE_REACH, own = this.cm.cave.field.ownership;
    const grown = { min: { x: destination.min.x - r, y: destination.min.y - r, z: destination.min.z - r },
      max: { x: destination.max.x + r, y: destination.max.y + r, z: destination.max.z + r } };
    if (!boxTouchesOwned(own, grown)) return true;
    if (!admitted) { this.stats.refused++; this.stats.reason = "not admitted: waiting outside the cave"; return false; }
    const c = { x: (destination.min.x + destination.max.x) / 2, y: (destination.min.y + destination.max.y) / 2, z: (destination.min.z + destination.max.z) / 2 };
    let zone = this.cm.cave.field.zoneAt(c.x, c.y, c.z);
    if (zone < 0) zone = nearestMouthZone(this.cm, c);
    const problems = coverageProblems(this.cm, drawn, destination, r, zone, "any");
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
 * a touched chunk (box grown by `reach`) not drawn (at `need`: fine, or any
 * LOD), or a chunk of the box's zone not drawn at all. Empty when the
 * invariant holds. The safety invariant is `need = "any"`. */
export function coverageProblems(cm: CaveMap, shown: ReadonlyMap<ChunkId, LodLevel>, box: { min: Vec3; max: Vec3 }, reach: number, zone: number,
  need: "fine" | "any" = "any"): string[] {
  const out: string[] = [];
  for (const r of cm.refs) {
    const b = cm.map.chunk(r.id)!.bounds;
    const touched = b.min.x <= box.max.x + reach && b.max.x >= box.min.x - reach && b.min.y <= box.max.y + reach &&
      b.max.y >= box.min.y - reach && b.min.z <= box.max.z + reach && b.max.z >= box.min.z - reach;
    if (touched && (need === "fine" ? shown.get(r.id) !== "fine" : !shown.has(r.id))) out.push(`${r.id} touched but ${shown.get(r.id) ?? "undrawn"}`);
    else if (zone >= 0 && r.zones.includes(zone) && !shown.has(r.id)) out.push(`${r.id} in the viewer's zone but undrawn`);
  }
  return out;
}
