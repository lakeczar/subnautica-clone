/** REC-1 R2-7: a minimal live WebM writer for the in-game video. The encoder
 * (WebCodecs, in the spool worker) is given each picture with the page time it
 * shows; this writes its chunks with exactly those times, so a block's time in
 * the file plus the segment's origin is the page time of its picture. A stall,
 * a restart or a hidden tab is a gap in the file, never a compressed interval.
 *
 * Live layout, like a browser's own recorder: the Segment's size is unknown
 * (it is appended to as it goes), every Cluster is written whole with its
 * size, and there are no Cues (a pack's remux adds them). DOM-free. */

export type WebmCodec = "V_VP9" | "V_VP8";

const CLUSTER_MAX_MS = 30_000;

/** EBML variable-size integer for an element's size. */
function size(n: number): Uint8Array {
  for (let len = 1; len <= 8; len++) {
    if (n < 2 ** (7 * len) - 1) {
      const out = new Uint8Array(len);
      let v = n;
      for (let i = len - 1; i >= 0; i--) { out[i] = v & 0xff; v = Math.floor(v / 256); }
      out[0]! |= 1 << (8 - len);
      return out;
    }
  }
  throw new Error(`webm: element too large (${n} bytes)`);
}
function uint(n: number): Uint8Array {
  const bytes: number[] = [];
  let v = n;
  do { bytes.unshift(v & 0xff); v = Math.floor(v / 256); } while (v > 0);
  return Uint8Array.from(bytes);
}
const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
function el(id: readonly number[], ...body: Uint8Array[]): Uint8Array {
  const data = concat(body);
  return concat([Uint8Array.from(id), size(data.length), data]);
}
const UNKNOWN_SIZE = Uint8Array.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

/** The file's start: the EBML header, an unknown-size Segment, Info (1 ms ticks) and the one video track. */
export function webmHead(codec: WebmCodec, width: number, height: number): Uint8Array {
  const ebml = el([0x1a, 0x45, 0xdf, 0xa3],
    el([0x42, 0x86], uint(1)), el([0x42, 0xf7], uint(1)), el([0x42, 0xf2], uint(4)), el([0x42, 0xf3], uint(8)),
    el([0x42, 0x82], ascii("webm")), el([0x42, 0x87], uint(4)), el([0x42, 0x85], uint(2)));
  const info = el([0x15, 0x49, 0xa9, 0x66], el([0x2a, 0xd7, 0xb1], uint(1_000_000)), el([0x4d, 0x80], ascii("siltwake")), el([0x57, 0x41], ascii("siltwake")));
  const track = el([0xae], el([0xd7], uint(1)), el([0x73, 0xc5], uint(1)), el([0x83], uint(1)), el([0x86], ascii(codec)),
    el([0xe0], el([0xb0], uint(width)), el([0xba], uint(height))));
  return concat([ebml, Uint8Array.from([0x18, 0x53, 0x80, 0x67]), UNKNOWN_SIZE, info, el([0x16, 0x54, 0xae, 0x6b], track)]);
}

/**
 * Collects blocks into a Cluster and writes it whole: when a key frame starts
 * the next, when a block's offset would no longer fit, and on `flush()` (an
 * export, a segment's end). `ms` is the block's time from the segment's origin
 * and never goes back.
 */
export class WebmClusters {
  private start = -1;
  private blocks: Uint8Array[] = [];
  private last = -1;
  constructor(private readonly write: (bytes: Uint8Array) => void) {}

  add(frame: Uint8Array, ms: number, key: boolean): void {
    const t = Math.max(0, Math.round(ms), this.last);
    if (this.blocks.length && (key || t - this.start > CLUSTER_MAX_MS)) this.flush();
    if (!this.blocks.length) this.start = t;
    this.last = t;
    const rel = t - this.start, head = Uint8Array.from([0x81, (rel >> 8) & 0xff, rel & 0xff, key ? 0x80 : 0x00]);
    this.blocks.push(el([0xa3], head, frame));
  }
  flush(): void {
    if (!this.blocks.length) return;
    this.write(el([0x1f, 0x43, 0xb6, 0x75], el([0xe7], uint(this.start)), ...this.blocks));
    this.blocks = [];
  }
  /** The last block's time from the origin, ms (−1 before the first). */
  get lastMs(): number { return this.last; }
}
