import { caveDef, CAVE_SOURCES, type CaveDef, type CaveSource } from "../../content/regions/caves.js";
import { caveVolume } from "../../content/regions/caveGeometry.js";
import type { FloorFunction } from "../../content/regions/terrain.js";
import type { Solid } from "../../sim/world.js";
import type { Rect, Vec3 } from "../types.js";

/** A kit cave's collision as the world composes it (CW-1), Babylon-free.
 *
 * The W1 world-query contract (`sim/world.ts`) needs three things per cave:
 * its rock boxes, the exterior ground round its footprint as 0.5 m collar
 * columns, and (for current masking) where its carved water is. Generating
 * them from source means building the cave (0.05–5 s each) and sampling the
 * floor nine times per collar cell, which with 35 caves cost about 50 s. So
 * the bake stores this record per cave (`public/caves/collision.bin`), and the
 * browser decodes it; Node tests and tools build it live (`liveKitCave`),
 * which is also the bake's source and `--verify`'s oracle. Both give the
 * same numbers bit for bit.
 *
 * Collar heights are rounded outward to 1/1024 m (tops up, bottoms down),
 * so they are exact in the record and never lower the ground. */

/** Collar column side, metres. */
export const COLLAR_CELL = 0.5;
/** The collar band round a footprint: twice the largest admitted
 * half-extent (a medium hull, 4.5 m), plus one 0.5 m sub-sweep and 0.5 m. */
export const KIT_CAVE_MAX_HALF = 4.5;
export const KIT_CAVE_BAND = 2 * KIT_CAVE_MAX_HALF + 0.5 + 0.5;
/** Collar heights are stored in 1/QUANTUM m. */
export const COLLAR_QUANTUM = 1024;
/** A collar cell some cave owns: no column. */
export const COLLAR_SKIP = -0x7fffffff;
/** Inside-water grid cell, metres. */
export const INSIDE_CELL = 1;

export interface KitCaveCollision {
  readonly id: string;
  readonly footprint: Rect;
  /** The heightfield steps aside below this inside the footprint. */
  readonly baseY: number;
  /** The source's `topY`. Nothing the cave owns (its rock, the ground it
   * replaced) reaches it, so a shape wholly above it over the footprint is the
   * exterior's (CA-2's vertical test; a fast test pins the margin). */
  readonly ceiling: number;
  /** Rock boxes, six numbers each: min x, y, z then max x, y, z. */
  readonly rock: Float32Array;
  /** Collar cells over the footprint grown by `KIT_CAVE_BAND`, X outer then
   * Z, from (minX, minZ): column top and bottom in 1/1024 m, or `COLLAR_SKIP`. */
  readonly collar: { readonly minX: number; readonly minZ: number; readonly nx: number; readonly nz: number;
    readonly top: Int32Array; readonly bottom: Int32Array };
  /** Cave-inside water (carved water under the exterior top): one bit per
   * `INSIDE_CELL` cell, set when any 0.5 m voxel in it is. */
  readonly inside: { readonly min: Vec3; readonly nx: number; readonly ny: number; readonly nz: number; readonly bits: Uint8Array };
}

const owns = (r: Rect, x: number, z: number): boolean => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ;

/** The record built from source: the cave's generated rock and volume, and
 * the collar sampled from `exteriorFloor` (the world's original floor). Cells
 * owned by any cave in `owners` get no column. */
export function liveKitCave(source: CaveSource, caveFloor: FloorFunction, exteriorFloor: (x: number, z: number) => number,
  owners: readonly Rect[] = CAVE_SOURCES.map(s => s.footprint)): KitCaveCollision {
  return kitCaveRecord(caveDef(source.id, caveFloor), exteriorFloor, owners);
}
/** The record of a generated definition (see `liveKitCave`). */
export function kitCaveRecord(def: CaveDef, exteriorFloor: (x: number, z: number) => number, owners: readonly Rect[],
  band = KIT_CAVE_BAND): KitCaveCollision {
  const source = def.source;
  const { rock, collar } = rockAndCollar(source.id, source.footprint, source.baseY, def.rock, exteriorFloor, owners, band);
  // Inside water at 1 m from the 0.5 m volume.
  const v = caveVolume(def), g = v.grid, s = Math.round(INSIDE_CELL / g.voxel);
  const ix = Math.ceil(g.nx / s), iy = Math.ceil(g.ny / s), iz = Math.ceil(g.nz / s);
  const bits = new Uint8Array(Math.ceil(ix * iy * iz / 8));
  for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const at = i + g.nx * (j + g.ny * k);
    if (!v.room[at] || v.solid[at] || !v.owned[at]) continue;
    const c = Math.floor(i / s) + ix * (Math.floor(j / s) + iy * Math.floor(k / s));
    bits[c >> 3] = bits[c >> 3]! | (1 << (c & 7));
  }
  return { id: source.id, footprint: { ...source.footprint }, baseY: source.baseY, ceiling: source.topY, rock, collar,
    inside: { min: { ...g.origin }, nx: ix, ny: iy, nz: iz, bits } };
}

/** A record for bare rock (a test's own boxes): no volume, so no inside
 * water, and no ceiling (every height over the footprint is the cave's). */
export function rockOnlyRecord(id: string, footprint: Rect, baseY: number, solids: readonly Solid[],
  exteriorFloor: (x: number, z: number) => number, owners: readonly Rect[], band = KIT_CAVE_BAND): KitCaveCollision {
  return { id, footprint: { ...footprint }, baseY, ceiling: Infinity, ...rockAndCollar(id, footprint, baseY, solids, exteriorFloor, owners, band),
    inside: { min: { x: 0, y: 0, z: 0 }, nx: 0, ny: 0, nz: 0, bits: new Uint8Array(0) } };
}

function rockAndCollar(id: string, f: Rect, baseY: number, solids: readonly Solid[], exteriorFloor: (x: number, z: number) => number,
  owners: readonly Rect[], band: number): Pick<KitCaveCollision, "rock" | "collar"> {
  const rock = new Float32Array(solids.length * 6);
  solids.forEach((s, i) => rock.set([s.min.x, s.min.y, s.min.z, s.max.x, s.max.y, s.max.z], i * 6));
  if (solids.some((s, i) => [s.min.x, s.min.y, s.min.z, s.max.x, s.max.y, s.max.z].some((v, k) => rock[i * 6 + k] !== v)))
    throw new Error(`cave ${id}: rock is off the Float32 lattice`);
  // The collar, cell for cell as W1's adapter laid it (X outer, Z inner).
  const nx = Math.round((f.maxX - f.minX + 2 * band) / COLLAR_CELL), nz = Math.round((f.maxZ - f.minZ + 2 * band) / COLLAR_CELL);
  const top = new Int32Array(nx * nz), bottom = new Int32Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = f.minX - band + i * COLLAR_CELL, z = f.minZ - band + k * COLLAR_CELL, at = i * nz + k;
    if (owners.some(r => owns(r, x + COLLAR_CELL / 2, z + COLLAR_CELL / 2))) { top[at] = COLLAR_SKIP; bottom[at] = COLLAR_SKIP; continue; }
    let hi = -Infinity, lo = Infinity;
    for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) {
      const h = exteriorFloor(x + a * COLLAR_CELL / 2, z + b * COLLAR_CELL / 2);
      hi = Math.max(hi, h); lo = Math.min(lo, h);
    }
    top[at] = Math.ceil((hi + 0.02) * COLLAR_QUANTUM);
    bottom[at] = Math.floor(Math.min(baseY, lo - 4) * COLLAR_QUANTUM);
  }
  return { rock, collar: { minX: f.minX - band, minZ: f.minZ - band, nx, nz, top, bottom } };
}

/** Whether the cell holding `p` is cave-inside water. */
export function insideKitCave(r: KitCaveCollision, p: Readonly<Vec3>): boolean {
  const g = r.inside;
  const i = Math.floor((p.x - g.min.x) / INSIDE_CELL), j = Math.floor((p.y - g.min.y) / INSIDE_CELL), k = Math.floor((p.z - g.min.z) / INSIDE_CELL);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return false;
  const c = i + g.nx * (j + g.ny * k);
  return (g.bits[c >> 3]! >> (c & 7) & 1) === 1;
}

// --- Codec ------------------------------------------------------------------------

const MAGIC = 0x3156434b; // "KCV1"
interface Header {
  readonly id: string; readonly footprint: Rect; readonly baseY: number; readonly ceiling: number; readonly boxes: number;
  readonly collar: { readonly minX: number; readonly minZ: number; readonly nx: number; readonly nz: number };
  readonly inside: { readonly min: Vec3; readonly nx: number; readonly ny: number; readonly nz: number };
}

/** One record as bytes: magic, header length, JSON header (padded to 4),
 * rock Float32s, collar top and bottom Int32s, inside bits. */
export function encodeKitCave(r: KitCaveCollision): Uint8Array {
  const header: Header = { id: r.id, footprint: r.footprint, baseY: r.baseY, ceiling: r.ceiling, boxes: r.rock.length / 6,
    collar: { minX: r.collar.minX, minZ: r.collar.minZ, nx: r.collar.nx, nz: r.collar.nz },
    inside: { min: r.inside.min, nx: r.inside.nx, ny: r.inside.ny, nz: r.inside.nz } };
  const json = new TextEncoder().encode(JSON.stringify(header)), pad = (4 - json.length % 4) % 4;
  const size = 8 + json.length + pad + r.rock.byteLength + r.collar.top.byteLength * 2 + r.inside.bits.byteLength;
  const out = new Uint8Array(size), view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true); view.setUint32(4, json.length + pad, true);
  out.set(json, 8);
  for (let i = 0; i < pad; i++) out[8 + json.length + i] = 0x20;
  let at = 8 + json.length + pad;
  for (const part of [r.rock, r.collar.top, r.collar.bottom, r.inside.bits]) {
    out.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), at); at += part.byteLength;
  }
  return out;
}

export function decodeKitCave(bytes: Uint8Array): KitCaveCollision {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("kit cave record: bad magic");
  const length = view.getUint32(4, true);
  const h = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + length))) as Header;
  let at = 8 + length;
  // Copies, so every array is aligned and owns its bytes.
  const take = <T>(n: number, make: (b: ArrayBuffer) => T): T => {
    const copy = bytes.slice(at, at + n); at += n;
    return make(copy.buffer);
  };
  const cells = h.collar.nx * h.collar.nz;
  const rock = take(h.boxes * 24, b => new Float32Array(b));
  const top = take(cells * 4, b => new Int32Array(b)), bottom = take(cells * 4, b => new Int32Array(b));
  const bits = take(Math.ceil(h.inside.nx * h.inside.ny * h.inside.nz / 8), b => new Uint8Array(b));
  if (at !== bytes.byteLength) throw new Error(`kit cave record ${h.id}: ${bytes.byteLength - at} trailing bytes`);
  return { id: h.id, footprint: h.footprint, baseY: h.baseY, ceiling: h.ceiling, rock,
    collar: { ...h.collar, top, bottom }, inside: { ...h.inside, bits } };
}

const PACK_MAGIC = 0x3150434b; // "KCP1"
/** The bake's source hash: sha-256, hex. */
const SOURCE_BYTES = 32;
/** A pack baked from other sources than the running build's (STR-13). */
export class StaleKitCavePack extends Error {
  constructor(readonly found: string, readonly expected: string) {
    super(`kit cave pack is stale: baked from ${found.slice(0, 12)}…, this build is ${expected.slice(0, 12)}…`);
  }
}

/** Many records in one file: magic, the bake's source hash (the pack's
 * provenance: decoding checks it against the running build's), count, then
 * length-prefixed records. */
export function encodeKitCavePack(records: readonly KitCaveCollision[], sourceHash: string): Uint8Array {
  return packKitCaves(records.map(encodeKitCave), sourceHash);
}
/** The pack of already encoded records (the bake encodes them in workers). */
export function packKitCaves(parts: readonly Uint8Array[], sourceHash: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(sourceHash)) throw new Error(`kit cave pack: source hash must be sha-256 hex, not ${sourceHash}`);
  const head = 8 + SOURCE_BYTES;
  const out = new Uint8Array(head + parts.reduce((n, p) => n + 4 + p.length, 0));
  const view = new DataView(out.buffer);
  view.setUint32(0, PACK_MAGIC, true);
  for (let i = 0; i < SOURCE_BYTES; i++) out[4 + i] = parseInt(sourceHash.slice(i * 2, i * 2 + 2), 16);
  view.setUint32(4 + SOURCE_BYTES, parts.length, true);
  let at = head;
  for (const p of parts) { view.setUint32(at, p.length, true); out.set(p, at + 4); at += 4 + p.length; }
  return out;
}
/** The pack's records, when it was baked from `expectedSource`; a pack from
 * any other sources throws `StaleKitCavePack`, before any record is decoded. */
export function decodeKitCavePack(bytes: Uint8Array, expectedSource: string): KitCaveCollision[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out: KitCaveCollision[] = [];
  if (bytes.byteLength < 8 + SOURCE_BYTES || view.getUint32(0, true) !== PACK_MAGIC) throw new Error("kit cave pack: bad magic");
  const found = [...bytes.subarray(4, 4 + SOURCE_BYTES)].map(b => b.toString(16).padStart(2, "0")).join("");
  if (found !== expectedSource) throw new StaleKitCavePack(found, expectedSource);
  let at = 8 + SOURCE_BYTES;
  for (let i = view.getUint32(4 + SOURCE_BYTES, true); i > 0; i--) {
    const n = view.getUint32(at, true);
    out.push(decodeKitCave(bytes.subarray(at + 4, at + 4 + n))); at += 4 + n;
  }
  if (at !== bytes.byteLength) throw new Error(`kit cave pack: ${bytes.byteLength - at} trailing bytes`);
  return out;
}
