/** A store-only ZIP (no compression: the video and JPEGs are compressed
 * already) built as a Blob from other Blobs, so a multi-gigabyte recording
 * spooled on disk is never copied into memory. ZIP64 records are written
 * when a size or offset needs them. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}
/** CRC-32 of a Blob, read in slices. */
async function blobCrc(blob: Blob): Promise<number> {
  let crc = 0;
  const STEP = 8 << 20;
  for (let at = 0; at < blob.size; at += STEP) crc = crc32(new Uint8Array(await blob.slice(at, at + STEP).arrayBuffer()), crc);
  return crc;
}

const MAX32 = 0xffffffff;
const utf8 = new TextEncoder();
function dosTime(d: Date): { time: number; date: number } {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
class Bytes {
  private readonly view: DataView;
  private at = 0;
  readonly buf: Uint8Array;
  constructor(size: number) { this.buf = new Uint8Array(size); this.view = new DataView(this.buf.buffer); }
  u16(v: number): this { this.view.setUint16(this.at, v, true); this.at += 2; return this; }
  u32(v: number): this { this.view.setUint32(this.at, v >>> 0, true); this.at += 4; return this; }
  u64(v: number): this { this.view.setBigUint64(this.at, BigInt(v), true); this.at += 8; return this; }
  raw(b: Uint8Array): this { this.buf.set(b, this.at); this.at += b.length; return this; }
}

export interface ZipEntry { name: string; data: Blob }

export async function zipBlob(entries: readonly ZipEntry[], when = new Date()): Promise<Blob> {
  const parts: BlobPart[] = [], central: Uint8Array[] = [];
  const { time, date } = dosTime(when);
  let offset = 0;
  for (const e of entries) {
    const name = utf8.encode(e.name), size = e.data.size, crc = await blobCrc(e.data);
    const big = size >= MAX32 || offset >= MAX32;
    const local = new Bytes(30 + name.length + (big ? 20 : 0))
      .u32(0x04034b50).u16(big ? 45 : 20).u16(0x0800).u16(0).u16(time).u16(date).u32(crc)
      .u32(big ? MAX32 : size).u32(big ? MAX32 : size).u16(name.length).u16(big ? 20 : 0).raw(name);
    if (big) local.u16(1).u16(16).u64(size).u64(size);
    parts.push(local.buf as Uint8Array<ArrayBuffer>, e.data);
    const extra = big ? 28 : 0;
    const c = new Bytes(46 + name.length + extra)
      .u32(0x02014b50).u16(45).u16(big ? 45 : 20).u16(0x0800).u16(0).u16(time).u16(date).u32(crc)
      .u32(big ? MAX32 : size).u32(big ? MAX32 : size).u16(name.length).u16(extra).u16(0).u16(0).u16(0).u32(0)
      .u32(big ? MAX32 : offset).raw(name);
    if (big) c.u16(1).u16(24).u64(size).u64(size).u64(offset);
    central.push(c.buf);
    offset += local.buf.length + size;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0), cdOffset = offset;
  const zip64 = entries.length >= 0xffff || cdOffset >= MAX32 || cdSize >= MAX32;
  const tail: Uint8Array[] = [];
  if (zip64) {
    tail.push(new Bytes(56).u32(0x06064b50).u64(44).u16(45).u16(45).u32(0).u32(0)
      .u64(entries.length).u64(entries.length).u64(cdSize).u64(cdOffset).buf);
    tail.push(new Bytes(20).u32(0x07064b50).u32(0).u64(cdOffset + cdSize).u32(1).buf);
  }
  tail.push(new Bytes(22).u32(0x06054b50).u16(0).u16(0)
    .u16(zip64 ? 0xffff : entries.length).u16(zip64 ? 0xffff : entries.length)
    .u32(zip64 ? MAX32 : cdSize).u32(zip64 ? MAX32 : cdOffset).u16(0).buf);
  return new Blob([...parts, ...central as Uint8Array<ArrayBuffer>[], ...tail as Uint8Array<ArrayBuffer>[]], { type: "application/zip" });
}
