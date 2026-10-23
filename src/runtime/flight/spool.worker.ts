/** REC-1 playtest spool: writes the recording to the Origin Private File
 * System from a worker, with synchronous access handles, so every flush is
 * durable (a crashed tab keeps what was written) and the main thread never
 * waits on disk. It also encodes the in-game video (R2-7). Messages are
 * handled strictly in order, so a message is a barrier for everything posted
 * before it. Local only: nothing leaves the computer.
 *
 *   { op: "append" | "put" (replace), dir, file, data: ArrayBuffer }  → { ack: bytes } or { failed: file, bytes, quota, error }
 *   { op: "remove", dir, file | null (the whole directory), id } → { removed: id }
 *   { op: "export", dir, out, id } → { exported: id, bytes } : `out` is a ZIP of every
 *     file in `dir` as it stands at this point in the queue (nothing appended later
 *     is in it, and nothing modifies `out` afterwards).
 *   { op: "barrier", id } → { barrier: id } once everything before it has been acknowledged or refused.
 *
 * Video (WebCodecs, one segment file at a time, see webm.ts):
 *   { op: "video-open", dir, file, width, height, fps, bitrate } → { videoOpened: file, codec } or { videoError }
 *   { op: "video-frame", t, bitmap? } → { videoFrame: 1, kept }: the picture (or, without one,
 *     the last picture again) encoded with page time `t` (ms); kept false when the encoder is behind
 *   { op: "video-flush", id } → { videoFlushed: id }: everything encoded so far is in the file
 *   { op: "video-close", id, final } → { videoClosed: id, file, frames, firstMs, lastMs }
 *   unprompted: { wrote: file, bytes } after each cluster; { failed: file, ... } as above. */
import { crc32, zipLayout, type ZipLayoutEntry } from "./zip.js";
import { WebmClusters, webmHead, type WebmCodec } from "./webm.js";

interface SyncHandle {
  getSize(): number;
  read(buffer: ArrayBufferView, options?: { at?: number }): number;
  write(buffer: ArrayBufferView | ArrayBuffer, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}
interface SyncFileHandle extends FileSystemFileHandle { createSyncAccessHandle(): Promise<SyncHandle> }
type Message =
  | { op: "append"; dir: string; file: string; data: ArrayBuffer }
  | { op: "put"; dir: string; file: string; data: ArrayBuffer }
  | { op: "remove"; dir: string; file: string | null; id: number }
  | { op: "export"; dir: string; out: string; id: number }
  | { op: "barrier"; id: number }
  | { op: "video-open"; dir: string; file: string; width: number; height: number; fps: number; bitrate: number }
  | { op: "video-frame"; t: number; bitmap?: ImageBitmap }
  | { op: "video-flush"; id: number }
  | { op: "video-close"; id: number; final: boolean };

const handles = new Map<string, SyncHandle>();
let queue: Promise<void> = Promise.resolve();
const scope = globalThis as unknown as { onmessage: ((e: MessageEvent<Message>) => void) | null; postMessage(m: unknown): void };

async function directory(path: string, create = true): Promise<FileSystemDirectoryHandle> {
  let at = await navigator.storage.getDirectory();
  for (const part of path.split("/").filter(Boolean)) at = await at.getDirectoryHandle(part, { create });
  return at;
}
async function handle(dir: string, file: string): Promise<SyncHandle> {
  const key = `${dir}/${file}`;
  const open = handles.get(key);
  if (open) return open;
  const parts = file.split("/");
  const at = await directory([dir, ...parts.slice(0, -1)].join("/"));
  const fh = await at.getFileHandle(parts.at(-1)!, { create: true }) as SyncFileHandle;
  const h = await fh.createSyncAccessHandle();
  handles.set(key, h);
  return h;
}
function release(prefix: string): void {
  for (const [key, h] of handles) if (key === prefix || key.startsWith(`${prefix}/`)) { h.close(); handles.delete(key); }
}
async function files(dir: FileSystemDirectoryHandle, prefix = ""): Promise<{ name: string; handle: FileSystemFileHandle }[]> {
  const out: { name: string; handle: FileSystemFileHandle }[] = [];
  for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (h.kind === "directory") out.push(...await files(h as FileSystemDirectoryHandle, `${prefix}${name}/`));
    else out.push({ name: `${prefix}${name}`, handle: h as FileSystemFileHandle });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

async function exportZip(dir: string, out: string): Promise<number> {
  const root = await directory(dir, false), list = await files(root);
  const STEP = 4 << 20, buffer = new Uint8Array(STEP);
  const read = async (key: string) => handles.get(`${dir}/${key}`) ?? (await (await handle(dir, key)));
  // Pass 1: sizes and CRCs as the files stand now.
  const layout: ZipLayoutEntry[] = [];
  for (const f of list) {
    const h = await read(f.name), size = h.getSize();
    let crc = 0;
    for (let at = 0; at < size; at += STEP) { const n = h.read(buffer.subarray(0, Math.min(STEP, size - at)), { at }); crc = crc32(buffer.subarray(0, n), crc); }
    layout.push({ name: f.name, size, crc });
  }
  // Pass 2: the ZIP, written to its own file.
  const parts = out.split("/"), outDir = await directory(parts.slice(0, -1).join("/"));
  const target = await (await outDir.getFileHandle(parts.at(-1)!, { create: true }) as SyncFileHandle).createSyncAccessHandle();
  try {
    target.truncate(0);
    let pos = 0;
    const put = (b: Uint8Array) => { pos += target.write(b, { at: pos }); };
    const { locals, tail } = zipLayout(layout);
    for (const [i, f] of list.entries()) {
      put(locals[i]!);
      const h = await read(f.name), size = layout[i]!.size;
      for (let at = 0; at < size; at += STEP) { const n = h.read(buffer.subarray(0, Math.min(STEP, size - at)), { at }); put(buffer.subarray(0, n)); }
    }
    for (const b of tail) put(b);
    target.flush();
    return pos;
  } finally { target.close(); }
}

// --- video ----------------------------------------------------------------

/** Encoder input waiting beyond this is dropped at the source: under load the video loses frames, never its clock. */
const ENCODE_QUEUE_MAX = 2;
/** A key frame this often (frames), and at every segment's start: seeking stays cheap. */
const KEY_EVERY = 24;
type Segment = { dir: string; file: string; h: SyncHandle; clusters: WebmClusters; origin: number | null; frames: number; broken: boolean };
let encoder: VideoEncoder | null = null, encoderSize = "", codec: WebmCodec = "V_VP9", lastPicture: ImageBitmap | null = null, lastT = -Infinity;
/** The one segment being written. A close drains the encoder first, so every chunk belongs to it. */
let segment: Segment | null = null;

function writeVideo(seg: Segment, bytes: Uint8Array): void {
  if (seg.broken) return;
  try {
    seg.h.write(bytes, { at: seg.h.getSize() });
    seg.h.flush();
    scope.postMessage({ wrote: seg.file, bytes: bytes.length });
  } catch (error) {
    // A refused video write ends this segment's file here; the main thread decides what follows.
    seg.broken = true;
    const name = error instanceof DOMException ? error.name : "";
    scope.postMessage({ failed: seg.file, bytes: bytes.length, quota: name === "QuotaExceededError", error: error instanceof Error ? error.message : String(error), video: true });
  }
}
async function openEncoder(width: number, height: number, fps: number, bitrate: number): Promise<void> {
  const size = `${width}x${height}`;
  if (encoder && encoder.state === "configured" && encoderSize === size) return;
  try { encoder?.close(); } catch { /* closed */ }
  encoder = null;
  if (typeof VideoEncoder === "undefined") throw new Error("this browser has no WebCodecs video encoder");
  for (const [c, id] of [["vp09.00.10.08", "V_VP9"], ["vp8", "V_VP8"]] as const) {
    const config: VideoEncoderConfig = { codec: c, width, height, bitrate, framerate: fps, latencyMode: "realtime" };
    if (!(await VideoEncoder.isConfigSupported(config)).supported) continue;
    codec = id;
    encoderSize = size;
    encoder = new VideoEncoder({
      output: (chunk) => {
        const seg = segment;
        if (!seg || seg.origin === null) return;
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        seg.clusters.add(bytes, chunk.timestamp / 1000 - seg.origin, chunk.type === "key");
      },
      error: (error) => { scope.postMessage({ videoError: error.message }); },
    });
    encoder.configure(config);
    return;
  }
  throw new Error(`no VP9 or VP8 encoder for ${size}`);
}
async function videoOpen(m: Extract<Message, { op: "video-open" }>): Promise<void> {
  try {
    await openEncoder(m.width, m.height, m.fps, m.bitrate);
    const h = await handle(m.dir, m.file);
    h.truncate(0);
    const seg: Segment = { dir: m.dir, file: m.file, h, clusters: null as unknown as WebmClusters, origin: null, frames: 0, broken: false };
    seg.clusters = new WebmClusters((b) => writeVideo(seg, b));
    writeVideo(seg, webmHead(codec, m.width, m.height));
    segment = seg;
    scope.postMessage({ videoOpened: m.file, codec });
  } catch (error) { scope.postMessage({ videoError: error instanceof Error ? error.message : String(error) }); }
}
function videoFrame(m: Extract<Message, { op: "video-frame" }>): void {
  const seg = segment;
  if (m.bitmap) { lastPicture?.close(); lastPicture = m.bitmap; }
  const picture = lastPicture;
  // Times only go forward; a segment's first picture is always kept (its key frame and its origin).
  const behind = encoder !== null && encoder.encodeQueueSize > ENCODE_QUEUE_MAX && seg !== null && seg.frames > 0;
  if (!encoder || encoder.state !== "configured" || !seg || seg.broken || !picture || m.t <= lastT || behind) { scope.postMessage({ videoFrame: 1, kept: false }); return; }
  lastT = m.t;
  // The segment's origin is its first encoded picture's page time: the main thread dates the file by it.
  if (seg.origin === null) { seg.origin = m.t; scope.postMessage({ videoOrigin: seg.file, t: m.t }); }
  const frame = new VideoFrame(picture, { timestamp: Math.round(m.t * 1000) });
  try { encoder.encode(frame, { keyFrame: seg.frames % KEY_EVERY === 0 }); } finally { frame.close(); }
  seg.frames++;
  scope.postMessage({ videoFrame: 1, kept: true });
}
async function drain(): Promise<void> {
  if (encoder && encoder.state === "configured") { try { await encoder.flush(); } catch { /* reported by its error callback */ } }
}
async function videoClose(m: Extract<Message, { op: "video-close" }>): Promise<void> {
  await drain();
  const seg = segment;
  segment = null;
  if (seg) {
    seg.clusters.flush();
    handles.delete(`${seg.dir}/${seg.file}`);
    try { seg.h.close(); } catch { /* closed */ }
  }
  if (m.final) { try { encoder?.close(); } catch { /* closed */ } encoder = null; encoderSize = ""; lastPicture?.close(); lastPicture = null; }
  scope.postMessage({ videoClosed: m.id, file: seg?.file ?? null, frames: seg?.frames ?? 0,
    firstMs: seg?.origin ?? -1, lastMs: seg && seg.origin !== null ? seg.origin + seg.clusters.lastMs : -1 });
}

scope.onmessage = (e) => {
  const m = e.data;
  // Video frames go through the same queue: a frame after a segment's close and the next one's open belongs to the new one.
  if (m.op === "video-frame") { queue = queue.then(() => videoFrame(m)); return; }
  queue = queue.then(async () => {
    if (m.op === "append" || m.op === "put") {
      const bytes = new Uint8Array(m.data);
      try {
        const h = await handle(m.dir, m.file);
        if (m.op === "put") h.truncate(0);
        h.write(bytes, { at: h.getSize() });
        h.flush();
        // Pictures are written once: release their handles at once.
        if (m.file.startsWith("snapshots/")) { h.close(); handles.delete(`${m.dir}/${m.file}`); }
        scope.postMessage({ ack: bytes.length, file: m.file });
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        scope.postMessage({ failed: m.file, bytes: bytes.length, quota: name === "QuotaExceededError", error: error instanceof Error ? error.message : String(error) });
      }
    } else if (m.op === "barrier") {
      scope.postMessage({ barrier: m.id });
    } else if (m.op === "video-open") {
      await videoOpen(m);
    } else if (m.op === "video-flush") {
      await drain();
      segment?.clusters.flush();
      scope.postMessage({ videoFlushed: m.id });
    } else if (m.op === "video-close") {
      await videoClose(m);
    } else if (m.op === "remove") {
      try {
        const target = m.file ? `${m.dir}/${m.file}` : m.dir;
        release(target);
        const parts = target.split("/"), parent = await directory(parts.slice(0, -1).join("/"), false);
        await parent.removeEntry(parts.at(-1)!, { recursive: true });
      } catch { /* already gone */ }
      scope.postMessage({ removed: m.id });
    } else {
      try { scope.postMessage({ exported: m.id, bytes: await exportZip(m.dir, m.out) }); }
      catch (error) { scope.postMessage({ exported: m.id, error: error instanceof Error ? error.message : String(error) }); }
    }
  });
};
