import type { LargeCaveSource } from "../../../content/caves/largeCave.js";
import { buildCollision, createLargeCave, type BakedLayout, type LargeCave } from "../../../world/caves/large/build.js";
import { bakeChunk, bakeGround, encodeBake, readBake, type Bake, type BakedChunk, type BakeInput } from "../../../world/caves/large/bake.js";
import { buildCollider, chunkIndex, createCollision, type CaveCollision } from "../../../world/caves/large/collision.js";
import type { FloorFunction } from "../../../world/caves/large/field.js";
import { placeLife, type LifePlacement } from "../../../world/caves/large/life.js";
import { buildLightGrid, type LightGrid } from "../../../world/caves/large/light.js";
import type { CaveOwnership } from "../../../world/caves/large/ownership.js";
import { caveArt, type CaveChunkArt } from "./art.js";

/** The cave-biome pipeline (Babylon-free): build everything from source
 * (`prepareCave`, about half a minute for the Canopy biome), write it as a
 * bake (`toBake`), or load a bake (`loadCaveBake`) into resident collision
 * plus per-chunk art decoded on demand. */

export interface PreparedCave {
  readonly cave: LargeCave;
  readonly life: readonly LifePlacement[];
  readonly grid: LightGrid;
  readonly art: readonly CaveChunkArt[];
  readonly ms: { readonly meshes: number; readonly collision: number; readonly life: number; readonly light: number; readonly art: number };
}

export function sourceHash(source: LargeCaveSource): string {
  let h = 2166136261;
  const s = JSON.stringify(source) + "|lc.generator.1";
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function prepareCave(source: LargeCaveSource, floor: FloorFunction, progress?: (stage: string) => void): PreparedCave {
  const now = (): number => Date.now();
  const cave = createLargeCave(source, floor);
  let t = now();
  cave.chunks.forEach((c, i) => { cave.mesh(c, "fine"); cave.mesh(c, "coarse"); if (i % 10 === 9) progress?.(`meshes ${i + 1}/${cave.chunks.length}`); });
  const meshes = now() - t; t = now();
  buildCollision(cave);
  const collision = now() - t; t = now();
  const life = placeLife(cave);
  const lifeMs = now() - t; t = now();
  progress?.("light");
  const grid = buildLightGrid(cave, life);
  const light = now() - t; t = now();
  const art = caveArt(cave, grid, life);
  return { cave, life, grid, art, ms: { meshes, collision, life: lifeMs, light, art: now() - t } };
}

export function toBake(p: PreparedCave): BakeInput {
  const s = p.cave.source, o = p.cave.field.ownership;
  const chunks: BakedChunk[] = p.art.map((a, i) => {
    const c = p.cave.chunks[i]!, fine = p.cave.mesh(c, "fine");
    const arrays = (r: CaveChunkArt["fine"]): BakedChunk["fine"] => ({ positions: r.mesh.positions, normals: r.mesh.normals, colors: r.mesh.colors, light: r.light,
      indices: r.mesh.indices as Uint16Array | Uint32Array });
    return { coord: c, fine: arrays(a.fine), coarse: arrays(a.coarse), life: a.life ? arrays(a.life) : null, band: fine.band, occupancy: fine.occupancy! };
  });
  return { cave: s.id, sourceHash: sourceHash(s), domain: s.domain, chunk: s.chunk, ground: { gx: o.gx, gz: o.gz, voxel: o.voxel, data: o.ground }, chunks };
}
export const encodeCave = (p: PreparedCave): Uint8Array => encodeBake(toBake(p));

/** A loaded cave: resident collision, and per-chunk art from the bake. */
export interface LoadedCave {
  readonly source: LargeCaveSource;
  readonly bake: Bake;
  readonly collision: CaveCollision;
  /** Decode one chunk (art + occupancy); the caller time-slices. */
  chunk(index: number): BakedChunk;
  /** Lamp occupancy per collision chunk index, kept from the load. */
  occupancy(collisionIndex: number): Uint8Array | null;
  readonly occupancies: ReadonlyMap<number, Uint8Array>;
  readonly index: ReadonlyMap<string, number>;
  /** The seabed lattice and surface-chunk list, for `createLargeCave`. */
  readonly layout: BakedLayout;
  /** Every buffer this cave keeps for as long as it is loaded (whole
   * ArrayBuffers, each once): the decompressed bake (art is decoded from it
   * on demand), the colliders, the seabed lattice and the lamp occupancy.
   * They are fixed CPU bytes: count them before any art is admitted. */
  readonly retained: readonly { readonly name: string; readonly bytes: number }[];
  readonly retainedBytes: number;
  readonly ms: number;
}

/** Load a bake for `source`: decodes every chunk once for its collider and
 * keeps the collision resident; art is decoded again per chunk on demand.
 * Throws when the bake was made from a different source. */
export function loadCaveBake(source: LargeCaveSource, buffer: Uint8Array): LoadedCave {
  const started = Date.now(), bake = readBake(buffer), h = bake.header;
  if (h.sourceHash !== sourceHash(source)) throw new Error(`bake for ${h.cave} is stale (${h.sourceHash} != ${sourceHash(source)})`);
  const ground = bakeGround(bake);
  const ownership: CaveOwnership = { domain: source.domain, collars: source.collars, roofMin: source.roofMin, voxel: h.ground.voxel, gx: h.ground.gx, gz: h.ground.gz, ground };
  const nx = Math.round((source.domain.max.x - source.domain.min.x) / source.chunk), ny = Math.round((source.domain.max.y - source.domain.min.y) / source.chunk);
  const collision = createCollision(source.id, ownership, source.chunk, 0, h.chunks.map(c => c.cx + nx * (c.cy + ny * c.cz)));
  const index = new Map<string, number>(), occupancy = new Map<number, Uint8Array>();
  h.chunks.forEach((e, i) => {
    index.set(`${e.cx}:${e.cy}:${e.cz}`, i);
    const c = bakeChunk(bake, i), k = chunkIndex(collision, e.cx, e.cy, e.cz);
    const art = { positions: c.fine.positions, indices: c.fine.indices instanceof Uint32Array ? c.fine.indices : new Uint32Array(c.fine.indices) };
    collision.colliders[k] = buildCollider(`${e.cx}:${e.cy}:${e.cz}`, k, art, c.band);
    occupancy.set(k, c.occupancy);
  });
  const retained = retainedBuffers(bake, collision, occupancy);
  return { source, bake, collision, chunk: i => bakeChunk(bake, i), occupancy: k => occupancy.get(k) ?? null, occupancies: occupancy, index,
    layout: { ownership, chunks: h.chunks.map(c => ({ cx: c.cx, cy: c.cy, cz: c.cz })) },
    retained, retainedBytes: retained.reduce((n, r) => n + r.bytes, 0), ms: Date.now() - started };
}

/** Whole ArrayBuffers behind the loaded cave, each counted once. */
function retainedBuffers(bake: Bake, collision: CaveCollision, occupancy: ReadonlyMap<number, Uint8Array>): { name: string; bytes: number }[] {
  const seen = new Set<ArrayBufferLike>(), out: { name: string; bytes: number }[] = [];
  const add = (name: string, a: ArrayBufferView): void => {
    if (seen.has(a.buffer)) return;
    seen.add(a.buffer);
    const last = out[out.length - 1];
    if (last?.name === name) out[out.length - 1] = { name, bytes: last.bytes + a.buffer.byteLength };
    else out.push({ name, bytes: a.buffer.byteLength });
  };
  add("bake", bake.buffer);
  add("ground", collision.ownership.ground);
  for (const k of collision.colliders) if (k) for (const a of [k.positions, k.tris, k.band, k.nodes, k.meta]) add("colliders", a);
  for (const o of occupancy.values()) add("occupancy", o);
  return out;
}
