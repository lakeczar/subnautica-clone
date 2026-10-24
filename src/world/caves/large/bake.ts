import type { ChunkCoord } from "./mesh.js";
import { POSITION_SNAP } from "./mesh.js";

/** The cave-biome bake container (Babylon-free, deterministic).
 *
 * One binary per cave: a JSON header, the seabed lattice (ownership), then
 * per chunk its fine and coarse art, life, collision band and occupancy.
 * Positions are stored as uint16 offsets from (chunk min - pad) in 1/1024 m.
 * Rock and band vertices are already snapped to that grid when generated, so
 * they decode to the SAME Float32 values the live build makes: a baked
 * collider equals the live one bit for bit. Life is not snapped (1 mm).
 * Normals are int8, colours and light uint8; alpha keeps the cel meaning. */

export interface ArtArrays {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly light: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
}
/** Bytes the renderer keeps of one art set (each array once on CPU and GPU). */
export const artBytes = (a: ArtArrays): number =>
  a.positions.byteLength + a.normals.byteLength + a.colors.byteLength + a.light.byteLength + a.indices.byteLength;

export interface BakedChunk {
  readonly coord: ChunkCoord;
  readonly fine: ArtArrays;
  readonly coarse: ArtArrays;
  readonly life: ArtArrays | null;
  readonly band: { readonly positions: Float32Array; readonly indices: Uint32Array } | null;
  readonly occupancy: Uint8Array;
}
export interface BakeHeader {
  readonly format: "lc.cave.1";
  readonly cave: string;
  readonly sourceHash: string;
  readonly domain: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  readonly chunk: number;
  readonly ground: { readonly gx: number; readonly gz: number; readonly voxel: number; readonly offset: number; readonly bytes: number };
  readonly chunks: readonly { readonly cx: number; readonly cy: number; readonly cz: number; readonly offset: number; readonly bytes: number }[];
}

const ROCK_PAD = 2, LIFE_PAD = 6;

class Writer {
  private parts: Uint8Array[] = []; length = 0;
  bytes(b: Uint8Array): void { this.parts.push(b); this.length += b.byteLength; }
  u32(v: number): void { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); this.bytes(b); }
  align(): void { const pad = (4 - (this.length % 4)) % 4; if (pad) this.bytes(new Uint8Array(pad)); }
  typed(a: ArrayBufferView): void { this.u32(a.byteLength); this.align(); this.bytes(new Uint8Array(a.buffer, a.byteOffset, a.byteLength).slice()); this.align(); }
  join(): Uint8Array { const out = new Uint8Array(this.length); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.byteLength; } return out; }
}
class Reader {
  private o: number;
  constructor(private readonly buf: Uint8Array, offset: number) { this.o = offset; }
  u32(): number { const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.o, 4).getUint32(0, true); this.o += 4; return v; }
  align(): void { this.o += (4 - (this.o % 4)) % 4; }
  /** A view into the bake, never a copy (the same in Node and browsers):
   * occupancy, ground and indices live inside the retained bake buffer. */
  raw(): Uint8Array { const n = this.u32(); this.align(); const out = this.buf.subarray(this.o, this.o + n); this.o += n; this.align(); return out; }
}

function quantise(p: Float32Array, base: readonly number[], snap: boolean): Uint16Array {
  const out = new Uint16Array(p.length);
  for (let i = 0; i < p.length; i++) {
    const q = (p[i]! - base[i % 3]!) * POSITION_SNAP;
    const r = Math.round(q);
    if (r < 0 || r > 65535) throw new Error(`bake: position ${p[i]} outside its chunk's range`);
    if (snap && Math.abs(q - r) > 1e-3) throw new Error(`bake: position ${p[i]} is not on the 1/${POSITION_SNAP} m grid`);
    out[i] = r;
  }
  return out;
}
const dequantise = (q: Uint16Array, base: readonly number[]): Float32Array => {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = base[i % 3]! + q[i]! / POSITION_SNAP;
  return out;
};
const toI8 = (a: Float32Array): Int8Array => { const o = new Int8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.max(-127, Math.min(127, Math.round(a[i]! * 127))); return o; };
const fromI8 = (a: Int8Array): Float32Array => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i]! / 127; return o; };
/** Colour channels 0..2 in steps of 1/127.5; alpha as int8 (cel codes). */
const colorsTo = (c: Float32Array): Uint8Array => {
  const o = new Uint8Array(c.length);
  for (let i = 0; i < c.length; i++) o[i] = i % 4 === 3 ? (Math.round(c[i]!) + 128) & 255 : Math.max(0, Math.min(255, Math.round(c[i]! * 127.5)));
  return o;
};
const colorsFrom = (b: Uint8Array): Float32Array => {
  const o = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) o[i] = i % 4 === 3 ? b[i]! - 128 : b[i]! / 127.5;
  return o;
};
const lightTo = (l: Float32Array): Uint8Array => { const o = new Uint8Array(l.length); for (let i = 0; i < l.length; i++) o[i] = Math.max(0, Math.min(255, Math.round(l[i]! * 127.5))); return o; };
const lightFrom = (b: Uint8Array): Float32Array => { const o = new Float32Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b[i]! / 127.5; return o; };
const view = <T>(b: Uint8Array, make: (buf: ArrayBuffer, off: number, len: number) => T, size: number): T => make(b.buffer as ArrayBuffer, b.byteOffset, b.byteLength / size);

function writeArt(w: Writer, a: ArtArrays, base: readonly number[], snap: boolean): void {
  w.typed(quantise(a.positions, base, snap)); w.typed(toI8(a.normals)); w.typed(colorsTo(a.colors)); w.typed(lightTo(a.light));
  w.u32(a.indices instanceof Uint16Array ? 2 : 4); w.typed(a.indices);
}
function readArt(r: Reader, base: readonly number[]): ArtArrays {
  const positions = dequantise(view(r.raw(), (b, o, l) => new Uint16Array(b, o, l), 2), base);
  const normals = fromI8(view(r.raw(), (b, o, l) => new Int8Array(b, o, l), 1));
  const colors = colorsFrom(r.raw()), light = lightFrom(r.raw());
  const size = r.u32(), raw = r.raw();
  const indices = size === 2 ? view(raw, (b, o, l) => new Uint16Array(b, o, l), 2) : view(raw, (b, o, l) => new Uint32Array(b, o, l), 4);
  return { positions, normals, colors, light, indices };
}

export interface BakeInput {
  readonly cave: string;
  readonly sourceHash: string;
  readonly domain: BakeHeader["domain"];
  readonly chunk: number;
  readonly ground: { readonly gx: number; readonly gz: number; readonly voxel: number; readonly data: Float32Array };
  readonly chunks: readonly BakedChunk[];
}

const chunkMin = (h: { domain: BakeHeader["domain"]; chunk: number }, c: ChunkCoord): number[] =>
  [h.domain.min.x + c.cx * h.chunk, h.domain.min.y + c.cy * h.chunk, h.domain.min.z + c.cz * h.chunk];

export function encodeBake(input: BakeInput): Uint8Array {
  const body = new Writer();
  const ground = { gx: input.ground.gx, gz: input.ground.gz, voxel: input.ground.voxel, offset: 0, bytes: 0 };
  body.typed(input.ground.data); ground.bytes = body.length;
  const chunks: { cx: number; cy: number; cz: number; offset: number; bytes: number }[] = [];
  for (const c of input.chunks) {
    const start = body.length, min = chunkMin(input, c.coord);
    const rock = min.map(v => v - ROCK_PAD), life = min.map(v => v - LIFE_PAD);
    writeArt(body, c.fine, rock, true); writeArt(body, c.coarse, rock, true);
    body.u32(c.life ? 1 : 0); if (c.life) writeArt(body, c.life, life, false);
    body.u32(c.band ? 1 : 0); if (c.band) { body.typed(quantise(c.band.positions, rock, true)); body.typed(c.band.indices); }
    body.typed(c.occupancy);
    chunks.push({ cx: c.coord.cx, cy: c.coord.cy, cz: c.coord.cz, offset: start, bytes: body.length - start });
  }
  const header: BakeHeader = { format: "lc.cave.1", cave: input.cave, sourceHash: input.sourceHash, domain: input.domain, chunk: input.chunk, ground, chunks };
  const json = new TextEncoder().encode(JSON.stringify(header)), head = new Writer();
  head.u32(json.byteLength); head.bytes(json); head.align();
  const h = head.join(), b = body.join(), out = new Uint8Array(h.byteLength + b.byteLength);
  out.set(h); out.set(b, h.byteLength);
  return out;
}

export interface Bake { readonly header: BakeHeader; readonly body: number; readonly buffer: Uint8Array }
export function readBake(buffer: Uint8Array): Bake {
  const n = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(buffer.subarray(4, 4 + n))) as BakeHeader;
  if (header.format !== "lc.cave.1") throw new Error(`bake: unknown format ${header.format}`);
  return { header, body: 4 + n + ((4 - ((4 + n) % 4)) % 4), buffer };
}
export function bakeGround(b: Bake): Float32Array {
  const r = new Reader(b.buffer, b.body);
  return view(r.raw(), (x, o, l) => new Float32Array(x, o, l), 4);
}
export function bakeChunk(b: Bake, index: number): BakedChunk {
  const e = b.header.chunks[index]!, coord = { cx: e.cx, cy: e.cy, cz: e.cz }, min = chunkMin(b.header, coord);
  const rock = min.map(v => v - ROCK_PAD), lifeBase = min.map(v => v - LIFE_PAD);
  const r = new Reader(b.buffer, b.body + e.offset);
  const fine = readArt(r, rock), coarse = readArt(r, rock);
  const life = r.u32() ? readArt(r, lifeBase) : null;
  let band: BakedChunk["band"] = null;
  if (r.u32()) {
    const positions = dequantise(view(r.raw(), (x, o, l) => new Uint16Array(x, o, l), 2), rock);
    band = { positions, indices: view(r.raw(), (x, o, l) => new Uint32Array(x, o, l), 4) };
  }
  return { coord, fine, coarse, life, band, occupancy: r.raw() };
}
