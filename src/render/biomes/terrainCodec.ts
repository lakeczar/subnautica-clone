import type { MeshRecipe } from "../kit/types.js";
import type { LodLevel, Rect } from "../../world/types.js";

/** Compact binary form of one chunk's terrain recipes (fine and coarse), as
 * written by `scripts/bake-terrain.mjs` and read by `s2.terrain` at runtime.
 * Deterministic: the same recipes always give the same bytes.
 *
 * Quantization, all from absolute or chunk-cell coordinates so that two
 * chunks sharing an edge decode identical edge vertices:
 * - X/Z: uint16 across the 128 m cell (<= 1 mm);
 * - Y: uint16 at 1/64 m from Y -800 (<= 8 mm);
 * - normals: octahedral, int8 pairs;
 * - colour: uint8 rgb at 1/200 (to 1.275), alpha as an int8 integer
 *   (the cel meanings 0 ground, 1 plain, -1 unlit).
 * Arrays are 4-byte aligned so decoding uses typed-array views. */
export const CODEC_VERSION = 1;
const MAGIC = 0x53325442; // "S2TB"
const Y0 = -800, YS = 64, CS = 200;
const LODS: readonly LodLevel[] = ["fine", "coarse"];

const pad4 = (n: number): number => (n + 3) & ~3;
const quant = (v: number, lo: number, span: number): number => Math.max(0, Math.min(65535, Math.round((v - lo) / span * 65535)));
const dequant = (q: number, lo: number, span: number): number => lo + q * span / 65535;

function octEncode(x: number, y: number, z: number): [number, number] {
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let u = x / l, v = z / l;
  if (y < 0) { const pu = u; u = (1 - Math.abs(v)) * Math.sign(pu || 1); v = (1 - Math.abs(pu)) * Math.sign(v || 1); }
  return [Math.round(Math.max(-1, Math.min(1, u)) * 127), Math.round(Math.max(-1, Math.min(1, v)) * 127)];
}
function octDecode(a: number, b: number, out: Float32Array, at: number): void {
  let u = a / 127, v = b / 127;
  const y = 1 - Math.abs(u) - Math.abs(v);
  if (y < 0) { const pu = u; u = (1 - Math.abs(v)) * Math.sign(pu || 1); v = (1 - Math.abs(pu)) * Math.sign(v || 1); }
  const l = Math.hypot(u, y, v) || 1;
  out[at] = u / l; out[at + 1] = y / l; out[at + 2] = v / l;
}

/** Bytes for one mesh's arrays, after the header fields. */
function meshSize(n: number, indices: number, wide: boolean): number {
  return pad4(n * 2) * 3 + pad4(n * 2) + pad4(n * 3) + pad4(n) + pad4(indices * (wide ? 4 : 2));
}

/** Encode one chunk's terrain: `lods.fine` and `lods.coarse` mesh lists. */
export function encodeTerrain(rect: Rect, lods: Readonly<Record<LodLevel, readonly MeshRecipe[]>>): Uint8Array {
  const span = rect.maxX - rect.minX;
  const sections = LODS.map(lod => lods[lod].map(m => {
    const n = m.positions.length / 3, wide = n > 65535, suffix = new TextEncoder().encode(m.name.slice(m.name.lastIndexOf(".") + 1));
    return { m, n, wide, suffix, size: pad4(1 + suffix.length) + 12 + meshSize(n, m.indices.length, wide) };
  }));
  const header = 8 + LODS.length * 8;
  const lodSize = sections.map(ms => 4 + ms.reduce((t, x) => t + x.size, 0));
  const total = header + lodSize.reduce((a, b) => a + b, 0);
  const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint32(0, MAGIC, true); dv.setUint16(4, CODEC_VERSION, true); dv.setUint16(6, LODS.length, true);
  let at = header;
  sections.forEach((ms, li) => {
    dv.setUint32(8 + li * 8, at, true); dv.setUint32(12 + li * 8, lodSize[li]!, true);
    dv.setUint32(at, ms.length, true); at += 4;
    for (const { m, n, wide, suffix } of ms) {
      u8[at] = suffix.length; u8.set(suffix, at + 1); at += pad4(1 + suffix.length);
      dv.setUint32(at, n, true); dv.setUint32(at + 4, m.indices.length, true); dv.setUint32(at + 8, wide ? 1 : 0, true); at += 12;
      const P = m.positions, N = m.normals, C = m.colors;
      for (const [axis, lo, s] of [[0, rect.minX, span], [1, Y0, 65535 / YS], [2, rect.minZ, span]] as const) {
        const q = new Uint16Array(buf, at, n);
        for (let i = 0; i < n; i++) q[i] = quant(P[i * 3 + axis]!, lo, s);
        at += pad4(n * 2);
      }
      const nrm = new Int8Array(buf, at, n * 2);
      for (let i = 0; i < n; i++) { const [a, b] = octEncode(N[i * 3]!, N[i * 3 + 1]!, N[i * 3 + 2]!); nrm[i * 2] = a; nrm[i * 2 + 1] = b; }
      at += pad4(n * 2);
      const rgb = new Uint8Array(buf, at, n * 3);
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rgb[i * 3 + k] = Math.max(0, Math.min(255, Math.round(C[i * 4 + k]! * CS)));
      at += pad4(n * 3);
      const alpha = new Int8Array(buf, at, n);
      for (let i = 0; i < n; i++) {
        const a = C[i * 4 + 3]!;
        if (a !== Math.round(a) || a < -128 || a > 127) throw new Error(`terrain codec: non-integer cel alpha ${a} in ${m.name}`);
        alpha[i] = a;
      }
      at += pad4(n);
      if (wide) new Uint32Array(buf, at, m.indices.length).set(m.indices); else new Uint16Array(buf, at, m.indices.length).set(m.indices);
      at += pad4(m.indices.length * (wide ? 4 : 2));
    }
  });
  if (at !== total) throw new Error("terrain codec: size mismatch");
  return u8;
}

/** Decode one LOD's meshes, yielding when `due()` is true. */
export function* decodeTerrain(bytes: Uint8Array, rect: Rect, chunkId: string, lod: LodLevel,
  due: () => boolean = () => false): Generator<void, MeshRecipe[]> {
  // Work on an aligned copy-free view when possible.
  const buf = bytes.byteOffset % 4 === 0 ? bytes.buffer : bytes.slice().buffer, base = bytes.byteOffset % 4 === 0 ? bytes.byteOffset : 0;
  const dv = new DataView(buf, base, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC || dv.getUint16(4, true) !== CODEC_VERSION) throw new Error(`terrain asset ${chunkId}: bad header`);
  const li = LODS.indexOf(lod);
  let at = dv.getUint32(8 + li * 8, true);
  const count = dv.getUint32(at, true); at += 4;
  const span = rect.maxX - rect.minX, out: MeshRecipe[] = [];
  for (let k = 0; k < count; k++) {
    const len = dv.getUint8(at), suffix = new TextDecoder().decode(new Uint8Array(buf, base + at + 1, len));
    at += pad4(1 + len);
    const n = dv.getUint32(at, true), ni = dv.getUint32(at + 4, true), wide = dv.getUint32(at + 8, true) === 1;
    at += 12;
    const qx = new Uint16Array(buf, base + at, n); at += pad4(n * 2);
    const qy = new Uint16Array(buf, base + at, n); at += pad4(n * 2);
    const qz = new Uint16Array(buf, base + at, n); at += pad4(n * 2);
    const nrm = new Int8Array(buf, base + at, n * 2); at += pad4(n * 2);
    const rgb = new Uint8Array(buf, base + at, n * 3); at += pad4(n * 3);
    const alpha = new Int8Array(buf, base + at, n); at += pad4(n);
    const indices = wide ? new Uint32Array(buf, base + at, ni).slice() : new Uint16Array(buf, base + at, ni).slice();
    at += pad4(ni * (wide ? 4 : 2));
    const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), colors = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = dequant(qx[i]!, rect.minX, span);
      positions[i * 3 + 1] = Y0 + qy[i]! / YS;
      positions[i * 3 + 2] = dequant(qz[i]!, rect.minZ, span);
      octDecode(nrm[i * 2]!, nrm[i * 2 + 1]!, normals, i * 3);
      colors[i * 4] = rgb[i * 3]! / CS; colors[i * 4 + 1] = rgb[i * 3 + 1]! / CS; colors[i * 4 + 2] = rgb[i * 3 + 2]! / CS; colors[i * 4 + 3] = alpha[i]!;
      if ((i & 1023) === 1023 && due()) yield;
    }
    out.push({ name: `${chunkId}.${suffix}`, positions, normals, colors, indices });
  }
  return out;
}
