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
 *   { op: "remove", ... } also answers { absent } (already gone) or { refused, error } (another tab or worker holds it: nothing was freed).
 *   { op: "release", dir, id } → { released: id }: the directory's open handles closed (a stopped recording; export reopens them).
 *   Any operation that throws is answered { opFailed: op, error } (with its request's reply key when it has one); the queue goes on.
 *
 * Video (WebCodecs, one segment file at a time, see webm.ts):
 *   { op: "video-open", dir, file, width, height, fps, bitrate, rungs } → { videoOpened: file, codec, hardware, rung } or { videoError }:
 *     the first rung of the ladder (encoders.ts) the browser accepts for the file's container (.mkv Matroska, else WebM)
 *   { op: "video-frame", t, bitmap? } → { videoFrame: 1, kept }: the picture (or, without one,
 *     the last picture again) encoded with page time `t` (ms); kept false when the encoder is behind
 *   { op: "video-flush", id } → { videoFlushed: id }: everything encoded so far is in the file
 *   { op: "video-close", id, final } → { videoClosed: id, file, frames, firstMs, lastMs }
 *   unprompted: { wrote: file, bytes } after each cluster; { failed: file, ... } as above. */
import { crc32, zipLayout, type ZipLayoutEntry } from "./zip.js";
import { WebmClusters, webmHead, type WebmCodec } from "./webm.js";
import { ladder, supportedConfig, type Container } from "./encoders.js";

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
  | { op: "release"; dir: string; id: number }
  | { op: "video-open"; dir: string; file: string; width: number; height: number; fps: number; bitrate: number; rungs: string[]; encode?: boolean }
  | { op: "video-frame"; t: number; bitmap?: ImageBitmap | VideoFrame }
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
type Segment = { dir: string; file: string; h: SyncHandle; clusters: WebmClusters; origin: number | null; frames: number; broken: boolean; headWritten: boolean };
let encoder: VideoEncoder | null = null, encoderSize = "", codec: WebmCodec = "V_VP9", lastPicture: ImageBitmap | VideoFrame | null = null, lastT = -Infinity;
/** Measurement only (`?recencode=0`, R3b's decomposition): pictures arrive and are released, nothing is encoded. */
let encodeOff = false;
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
let hardware = false, rungKey = "", head: { width: number; height: number; container: Container } | null = null;
/** The encoder's decoder configuration (H.264's avcC, AV1's av1C), kept: a reused encoder gives it only once, and every segment's head needs it. */
let description: Uint8Array | undefined;
/** Opens the first rung of `keys` the browser accepts for this container and size (the ladder: encoders.ts). */
async function openEncoder(width: number, height: number, fps: number, bitrate: number, keys: readonly string[], container: Container): Promise<void> {
  const want = `${width}x${height}:${container}:${keys.join(",")}`;
  head = { width, height, container };
  if (encoder && encoder.state === "configured" && encoderSize === want) return;
  try { encoder?.close(); } catch { /* closed */ }
  encoder = null; description = undefined;
  if (typeof VideoEncoder === "undefined") throw new Error("this browser has no WebCodecs video encoder");
  // A rung's container must be this file's: Matroska carries every codec, WebM no H.264.
  for (const r of ladder(keys).filter((x) => container === "matroska" || x.container === "webm")) {
    const config = await supportedConfig(r, width, height, bitrate, fps, (c) => VideoEncoder.isConfigSupported(c));
    if (!config) continue;
    codec = r.codecId; hardware = r.hardware; rungKey = r.key;
    encoderSize = want;
    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const seg = segment;
        if (!seg || seg.origin === null) return;
        const given = meta?.decoderConfig?.description;
        if (given) description = new Uint8Array(given instanceof ArrayBuffer ? given.slice(0) : (given as ArrayBufferView).buffer.slice(0));
        // A segment's head waits for its first chunk: it carries the encoder's configuration.
        if (!seg.headWritten && head) {
          writeVideo(seg, webmHead(codec, head.width, head.height, description, head.container));
          seg.headWritten = true;
        }
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        seg.clusters.add(bytes, chunk.timestamp / 1000 - seg.origin, chunk.type === "key");
      },
      error: (error) => { scope.postMessage({ videoError: error.message }); },
    });
    encoder.configure(config);
    return;
  }
  throw new Error(`no encoder on the ladder (${keys.join(", ")}) for ${width}x${height} in ${container}`);
}
async function videoOpen(m: Extract<Message, { op: "video-open" }>): Promise<void> {
  try {
    encodeOff = m.encode === false;
    if (!encodeOff) await openEncoder(m.width, m.height, m.fps, m.bitrate, m.rungs, m.file.endsWith(".mkv") ? "matroska" : "webm");
    const h = await handle(m.dir, m.file);
    h.truncate(0);
    const seg: Segment = { dir: m.dir, file: m.file, h, clusters: null as unknown as WebmClusters, origin: null, frames: 0, broken: false, headWritten: false };
    seg.clusters = new WebmClusters((b) => writeVideo(seg, b));
    segment = seg;
    scope.postMessage({ videoOpened: m.file, codec, hardware, rung: rungKey });
  } catch (error) { scope.postMessage({ videoError: error instanceof Error ? error.message : String(error) }); }
}
function videoFrame(m: Extract<Message, { op: "video-frame" }>): void {
  const seg = segment;
  if (m.bitmap) { lastPicture?.close(); lastPicture = m.bitmap; }
  const picture = lastPicture;
  // Times only go forward; a segment's first picture is always kept (its key frame and its origin).
  const behind = encoder !== null && encoder.encodeQueueSize > ENCODE_QUEUE_MAX && seg !== null && seg.frames > 0;
  // A refused picture is reported with its time and why: the main thread keeps it as a gap in the video (R3-3).
  if (encodeOff && seg) {
    // The decomposition's capture-only control: the picture was taken and handed over, and is released here.
    if (seg.origin === null) seg.origin = m.t;
    lastT = Math.max(lastT, m.t); seg.frames++;
    scope.postMessage({ videoFrame: 1, kept: true, t: m.t });
    return;
  }
  const why = !encoder || encoder.state !== "configured" ? "no encoder" : !seg || seg.broken ? "no segment to write" : !picture ? "no picture yet"
    : m.t <= lastT ? "out of order" : behind ? "the encoder was behind" : null;
  if (why || !encoder || !seg) { scope.postMessage({ videoFrame: 1, kept: false, t: m.t, why }); return; }
  lastT = m.t;
  // The segment's origin is its first encoded picture's page time: the main thread dates the file by it.
  if (seg.origin === null) { seg.origin = m.t; scope.postMessage({ videoOrigin: seg.file, t: m.t }); }
  const frame = new VideoFrame(picture!, { timestamp: Math.round(m.t * 1000) });
  try { encoder.encode(frame, { keyFrame: seg.frames % KEY_EVERY === 0 }); } finally { frame.close(); }
  seg.frames++;
  scope.postMessage({ videoFrame: 1, kept: true, t: m.t });
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

/** The reply each request expects: a failed operation still answers it, with the error, so nothing waits forever (R3-1). */
const REPLY_KEY: Partial<Record<Message["op"], string>> = { barrier: "barrier", export: "exported", remove: "removed", release: "released", "video-flush": "videoFlushed", "video-close": "videoClosed" };
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A video operation threw: its input and the encoder are closed, the segment
 * written so far is kept, and the main thread is told (it ends the video). */
function videoFailed(error: unknown): void {
  const seg = segment;
  if (seg) { seg.broken = true; try { seg.clusters.flush(); } catch { /* the file keeps what it has */ } }
  try { encoder?.close(); } catch { /* closed */ }
  encoder = null; encoderSize = "";
  lastPicture?.close(); lastPicture = null;
  scope.postMessage({ videoError: errorText(error) });
}

async function handleMessage(m: Message): Promise<void> {
  if (m.op === "video-frame") videoFrame(m);
  else if (m.op === "append" || m.op === "put") {
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
      scope.postMessage({ failed: m.file, bytes: bytes.length, quota: name === "QuotaExceededError", error: errorText(error) });
    }
  } else if (m.op === "barrier") scope.postMessage({ barrier: m.id });
  else if (m.op === "release") { release(m.dir); scope.postMessage({ released: m.id }); }
  else if (m.op === "video-open") await videoOpen(m);
  else if (m.op === "video-flush") { await drain(); segment?.clusters.flush(); scope.postMessage({ videoFlushed: m.id }); }
  else if (m.op === "video-close") await videoClose(m);
  else if (m.op === "remove") {
    // Space is only credited for a deletion that happened (R3-2): an absent file is fine; a refused one (another tab or worker holds it) is reported as refused.
    const target = m.file ? `${m.dir}/${m.file}` : m.dir;
    release(target);
    try {
      const parts = target.split("/"), parent = await directory(parts.slice(0, -1).join("/"), false);
      await parent.removeEntry(parts.at(-1)!, { recursive: true });
      scope.postMessage({ removed: m.id });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
      if (name === "NotFoundError") scope.postMessage({ removed: m.id, absent: true });
      else scope.postMessage({ removed: m.id, refused: name || "Error", error: errorText(error) });
    }
  } else {
    try { scope.postMessage({ exported: m.id, bytes: await exportZip(m.dir, m.out) }); }
    catch (error) { scope.postMessage({ exported: m.id, error: errorText(error) }); }
  }
}

scope.onmessage = (e) => {
  const m = e.data;
  // One queue, strictly in order (a frame after a segment's close and the next
  // one's open belongs to the new one). A failing operation is contained: it is
  // reported, its request answered with the error, and the queue goes on (R3-1).
  queue = queue.then(() => handleMessage(m)).catch((error) => {
    if (m.op.startsWith("video")) videoFailed(error);
    const key = REPLY_KEY[m.op];
    scope.postMessage({ opFailed: m.op, error: errorText(error), ...(key && "id" in m ? { [key]: m.id } : {}) });
  });
};
