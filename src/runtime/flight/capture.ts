/** REC-1, the browser half of the flight recorder: snapshots of the game
 * canvas at events, the in-game 12 fps video (MediaRecorder, playtests), the
 * durable local spool (OPFS, playtests), errors and long animation frames,
 * and the export. Everything stays on this computer.
 *
 * Modes:
 * - `off`: nothing is recorded.
 * - `driver`: a test driver reads the recorder through the test hook
 *   (`hooks.ts`) and records video itself (CDP screencast); no spool.
 * - `playtest`: the default for the owner's play. Spooled to disk as it goes,
 *   with the in-game video unless turned off in Settings. */
import { FlightRecorder, FLIGHT_FORMAT, FLIGHT_VERSION, FRAME_COLUMNS } from "./recorder.js";
import type { FlightEvent, FlightSample, FlightSnapshot, SnapshotRequest } from "./recorder.js";
import { zipBlob, type ZipEntry } from "./zip.js";

export type FlightMode = "off" | "driver" | "playtest";
export interface FlightSettings { enabled: boolean; video: boolean }
export const DEFAULT_FLIGHT_SETTINGS: FlightSettings = { enabled: true, video: true };

/** `?rec=off|driver|playtest` overrides Settings; `?recvideo=0|1` the in-game video.
 * An automated browser (`navigator.webdriver`: every test driver, soak and
 * evidence run) that names no mode gets `driver`: bounded memory, readable
 * through the test hook, no spool and no in-game video. A person's browser
 * gets the playtest default (Settings can turn it off). */
export function flightMode(settings: FlightSettings, search = globalThis.location?.search ?? "",
  automated = globalThis.navigator?.webdriver === true): { mode: FlightMode; video: boolean } {
  const q = new URLSearchParams(search), rec = q.get("rec"), video = q.get("recvideo");
  const mode: FlightMode = rec === "off" || rec === "0" ? "off" : rec === "driver" ? "driver" : rec === "playtest" ? "playtest"
    : automated ? "driver" : settings.enabled ? "playtest" : "off";
  return { mode, video: mode !== "off" && (video === null ? mode === "playtest" && settings.video : video === "1") };
}

export const VIDEO_FPS = 12;
export const VIDEO_SIZE = { width: 1280, height: 720 } as const;
const SNAPSHOT_SIZE = { width: 480, height: 270 } as const;
/** Snapshots kept in memory for a driver that has not read them. */
const SNAPSHOT_MEMORY = 600;
const SPOOL_EVERY_MS = 5000;
const SPOOL_ROOT = "flight";
/** Recordings kept on disk: the newest few, within a byte budget. */
const KEEP_SESSIONS = 4, KEEP_BYTES = 6 * 1024 ** 3;
const VIDEO_BITS = 900_000;

export interface FlightBuild { content: string; bake: string; commit: string }

export class FlightCapture {
  readonly recorder: FlightRecorder;
  readonly header: Record<string, unknown>;
  readonly session: string;
  private readonly blobs = new Map<number, Blob>();
  private readonly abort = new AbortController();
  private video: { canvas: HTMLCanvasElement; context: ImageBitmapRenderingContext; track: CanvasCaptureMediaStreamTrack; recorder: MediaRecorder; next: number; frames: number; pending: number } | null = null;
  private spool: { worker: Worker; cursors: { frames: number; samples: number; events: number; snapshots: number }; last: number; closing: Map<number, () => void>; seq: number } | null = null;
  private readonly restoreConsole: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement, readonly mode: Exclude<FlightMode, "off">, videoOn: boolean, build: FlightBuild) {
    this.recorder = new FlightRecorder();
    const started = new Date();
    this.session = started.toISOString().replace(/[:.]/g, "-");
    const gl = canvas.getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const script = document.querySelector<HTMLScriptElement>("script[type=module][src]")?.src ?? "";
    this.header = {
      format: FLIGHT_FORMAT, version: FLIGHT_VERSION, mode, session: this.session, startedAt: started.toISOString(),
      pageOrigin: performance.timeOrigin, frameColumns: FRAME_COLUMNS,
      build: { ...build, bundle: script.split("/").pop() ?? "" },
      browser: navigator.userAgent, platform: navigator.platform,
      gpu: info && gl ? { vendor: gl.getParameter(info.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL) } : null,
      screen: { width: screen.width, height: screen.height, dpr: devicePixelRatio, canvas: [canvas.width, canvas.height] },
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
      video: videoOn ? { source: "game", fps: VIDEO_FPS, size: VIDEO_SIZE, file: "video.webm" } : null,
      snapshots: { size: SNAPSHOT_SIZE, format: "jpeg" },
    };
    this.restoreConsole = this.observeErrors();
    this.observeLongFrames();
    if (mode === "playtest") this.startSpool();
    if (videoOn) this.startVideo();
    this.recorder.event("session", `recording started (${mode}${videoOn ? ", video" : ""})`, { snapshot: false });
  }

  /** After the frame's render, in the same task (the drawing buffer is still
   * the frame's): the snapshot the recorder asked for, the video frame if due,
   * and the spool. Returns the ms spent, which the caller charges to the recorder. */
  afterRender(now: number): number {
    if (this.disposed) return 0;
    const start = performance.now();
    const frame = this.frameWaiters.splice(0);
    if (frame.length) {
      // The whole canvas, full size, lossless (fixed-view captures).
      const job = createImageBitmap(this.canvas).then((bitmap) => {
        const out = new OffscreenCanvas(bitmap.width, bitmap.height);
        out.getContext("bitmaprenderer")!.transferFromImageBitmap(bitmap);
        return out.convertToBlob({ type: "image/png" });
      });
      for (const w of frame) job.then(w.resolve, w.reject);
    }
    const want = this.recorder.wantSnapshot(now);
    if (want) this.snapshot(want, now);
    const v = this.video;
    // A frame still being copied is not overtaken: under load the video drops frames, never the game.
    if (v && now >= v.next && v.pending < 2) {
      v.next = Math.max(v.next + 1000 / VIDEO_FPS, now - 1000 / VIDEO_FPS);
      const size = this.scaled(VIDEO_SIZE.width);
      v.pending++;
      const captured = now;
      void createImageBitmap(this.canvas, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: "low" }).then((bitmap) => {
        v.pending--;
        if (this.disposed) { bitmap.close(); return; }
        if (v.canvas.width !== bitmap.width || v.canvas.height !== bitmap.height) { v.canvas.width = bitmap.width; v.canvas.height = bitmap.height; }
        v.context.transferFromImageBitmap(bitmap);
        v.track.requestFrame();
        if (v.frames++ === 0) {
          // The video's time 0 on the page clock: the pack lines video and frames up by it.
          this.header.video = { ...(this.header.video as object), start: Math.round(captured) };
          this.putHeader();
        }
      }, () => { v.pending--; });
    }
    if (this.spool && now - this.spool.last >= SPOOL_EVERY_MS) this.flush(now);
    return performance.now() - start;
  }

  /** The game canvas scaled to `width`, keeping its aspect. */
  private scaled(width: number): { width: number; height: number } {
    const w = Math.max(1, this.canvas.width), h = Math.max(1, this.canvas.height);
    return { width, height: Math.max(2, Math.round((width * h) / w / 2) * 2) };
  }

  /** The picture is copied and scaled on the GPU (createImageBitmap snapshots
   * the drawing buffer now, in this frame's task), then encoded off the main
   * thread. Never a 2D drawImage of the WebGL canvas: that reads the frame
   * back synchronously (40–75 ms per picture on ANGLE/D3D12, REC-1's first run). */
  private snapshot(req: SnapshotRequest, now: number): void {
    if (!this.canvas.width || typeof createImageBitmap === "undefined" || typeof OffscreenCanvas === "undefined") return;
    const size = this.scaled(SNAPSHOT_SIZE.width);
    const snap = this.recorder.snapshotTaken(req, now);
    void createImageBitmap(this.canvas, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: "low" }).then((bitmap) => {
      const out = new OffscreenCanvas(bitmap.width, bitmap.height);
      out.getContext("bitmaprenderer")!.transferFromImageBitmap(bitmap);
      return out.convertToBlob({ type: "image/jpeg", quality: 0.72 });
    }).then((blob) => {
      this.blobs.set(snap.seq, blob);
      for (const old of this.blobs.keys()) { if (this.blobs.size <= SNAPSHOT_MEMORY) break; this.blobs.delete(old); }
    }, () => {});
  }

  private readonly frameWaiters: { resolve: (b: Blob) => void; reject: (e: unknown) => void }[] = [];
  /** The next drawn frame's canvas as base64 PNG (no DOM, no HUD). */
  async frameData(): Promise<string> {
    const blob = await new Promise<Blob>((resolve, reject) => this.frameWaiters.push({ resolve, reject }));
    return base64(new Uint8Array(await blob.arrayBuffer()));
  }

  /** A snapshot's JPEG, while it is still held in memory. */
  snapshotBlob(seq: number): Blob | undefined { return this.blobs.get(seq); }

  /** Samples are taken by the runtime (it owns the state); this adds the browser's memory figures. */
  sample(s: FlightSample): void {
    const mem = (performance as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    if (mem) { s.heapMiB = round(mem.usedJSHeapSize / 1048576); s.heapTotalMiB = round(mem.totalJSHeapSize / 1048576); }
    this.recorder.sample(s);
  }

  /** The JS heap now, MiB (for the per-frame collection check), when the browser exposes it. */
  heapNow(): number | null {
    const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory;
    return mem ? mem.usedJSHeapSize / 1048576 : null;
  }

  private observeErrors(): (() => void) | null {
    const opts = { signal: this.abort.signal };
    const stack = (x: unknown) => (x instanceof Error && x.stack ? { stack: x.stack.split("\n").slice(0, 6).join("\n") } : {});
    addEventListener("error", (e) => this.recorder.event("error", `error: ${e.message}`, { detail: { source: `${e.filename}:${e.lineno}:${e.colno}`, ...stack(e.error) } }), opts);
    addEventListener("unhandledrejection", (e) => this.recorder.event("error", `unhandled rejection: ${String((e.reason as Error)?.message ?? e.reason)}`, { detail: stack(e.reason) }), opts);
    const original = { error: console.error, warn: console.warn };
    let inside = false;
    const wrap = (kind: "error" | "warning", fn: (...a: unknown[]) => void) => (...args: unknown[]) => {
      fn.apply(console, args);
      if (inside) return;
      inside = true;
      try {
        const text = args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : safeJson(a))).join(" ");
        // CW-1's safety net: a cave built in one go. Always on the attention list.
        const unsliced = text.startsWith("unsliced cave build");
        this.recorder.event(kind, `${kind}: ${text}`, unsliced ? { detail: { unsliced: true } } : {});
      } finally { inside = false; }
    };
    console.error = wrap("error", original.error);
    console.warn = wrap("warning", original.warn);
    return () => { console.error = original.error; console.warn = original.warn; };
  }

  /** Long animation frames (Chrome) or long tasks: the browser's own view of a stall, with script attribution. */
  private observeLongFrames(): void {
    const types = typeof PerformanceObserver !== "undefined" ? PerformanceObserver.supportedEntryTypes ?? [] : [];
    const type = types.includes("long-animation-frame") ? "long-animation-frame" : types.includes("longtask") ? "longtask" : null;
    if (!type) return;
    const observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const loaf = e as PerformanceEntry & { blockingDuration?: number; scripts?: { sourceURL?: string; sourceFunctionName?: string; invoker?: string; duration: number }[] };
        // `scripts` is a frozen array: sort a copy.
        const scripts = [...(loaf.scripts ?? [])].sort((a, b) => b.duration - a.duration).slice(0, 3)
          .map((s) => `${Math.round(s.duration)} ms ${s.invoker ?? ""} ${s.sourceFunctionName ?? ""} ${(s.sourceURL ?? "").split("/").pop()}`.trim());
        this.recorder.event("long-task", `${type} ${Math.round(e.duration)} ms`, { t: e.startTime, snapshot: false,
          detail: { type, duration: Math.round(e.duration), ...(loaf.blockingDuration !== undefined ? { blocking: Math.round(loaf.blockingDuration) } : {}), ...(scripts.length ? { scripts } : {}) } });
      }
    });
    try { observer.observe({ type, buffered: false }); } catch { return; }
    this.abort.signal.addEventListener("abort", () => observer.disconnect());
  }

  private startVideo(): void {
    if (typeof MediaRecorder === "undefined") { this.recorder.event("warning", "warning: no MediaRecorder in this browser; recording without video", { snapshot: false }); return; }
    const canvas = document.createElement("canvas");
    canvas.width = VIDEO_SIZE.width; canvas.height = VIDEO_SIZE.height;
    const context = canvas.getContext("bitmaprenderer");
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!context || !track || !mimeType) return;
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITS });
    recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      if (this.spool) void e.data.arrayBuffer().then((b) => this.post("video.webm", b));
      else this.videoChunks.push(e.data);
    };
    recorder.start(SPOOL_EVERY_MS);
    this.video = { canvas, context, track, recorder, next: 0, frames: 0, pending: 0 };
    this.header.video = { ...(this.header.video as object), mimeType, bitsPerSecond: VIDEO_BITS };
    this.recorder.event("session", `video started (${mimeType}, ${VIDEO_FPS} fps, ${VIDEO_SIZE.width}x${VIDEO_SIZE.height})`, { snapshot: false });
  }
  /** Video kept in memory when nothing spools (driver mode with in-game video, for its overhead). */
  private readonly videoChunks: Blob[] = [];

  // --- the playtest spool ---------------------------------------------------

  private startSpool(): void {
    if (typeof Worker === "undefined" || !navigator.storage?.getDirectory) {
      this.recorder.event("warning", "warning: this browser has no private file storage; the recording is kept in memory only", { snapshot: false });
      return;
    }
    let worker: Worker;
    try { worker = new Worker(new URL("./spool.worker.ts", import.meta.url), { type: "module" }); } catch { return; }
    const closing = new Map<number, () => void>();
    worker.onmessage = (e: MessageEvent<{ closed?: number; error?: string }>) => {
      if (e.data.closed !== undefined) { closing.get(e.data.closed)?.(); closing.delete(e.data.closed); }
      if (e.data.error) this.recorder.event("warning", `warning: flight spool: ${e.data.error}`, { snapshot: false });
    };
    this.spool = { worker, cursors: { frames: 0, samples: 0, events: 0, snapshots: 0 }, last: performance.now(), closing, seq: 0 };
    this.putHeader();
    void prune(this.session);
  }
  private post(file: string, data: string | ArrayBuffer, op: "append" | "put" = "append"): void {
    const transfer = typeof data === "string" ? [] : [data];
    this.spool?.worker.postMessage({ op, dir: `${SPOOL_ROOT}/${this.session}`, file, data }, transfer);
  }
  /** The header as it stands (it learns the video's start once the first frame is taken). */
  private putHeader(): void { this.post("header.json", JSON.stringify(this.header, null, 1), "put"); }
  /** Appends everything recorded since the last flush. */
  flush(now = performance.now(), final = false): void {
    const s = this.spool;
    if (!s) return;
    if (final) this.recorder.settle();
    s.last = now;
    const r = this.recorder, c = s.cursors;
    const frames = r.frames.since(c.frames), samples = r.samples.since(c.samples), events = r.events.since(c.events), snaps = r.snapshots.since(c.snapshots);
    c.frames = frames.next; c.samples = samples.next; c.events = events.next;
    if (frames.lost) this.post("events.ndjson", `${JSON.stringify({ seq: 0, t: now, kind: "warning", text: `warning: ${frames.lost} frame rows were lost before the spool read them` })}\n`);
    if (frames.rows.length) this.post("frames.ndjson", frames.rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    if (samples.items.length) this.post("samples.ndjson", samples.items.map((x) => JSON.stringify(x)).join("\n") + "\n");
    // Events are written once their snapshot (if any) has been taken, so the file names it.
    if (events.items.length) this.post("events.ndjson", events.items.map((x) => JSON.stringify(x)).join("\n") + "\n");
    // A snapshot is written once its JPEG is encoded; later flushes pick up the
    // rest. (Events name their snapshot; snapshots.ndjson also lists the events
    // each one was taken for, so an event flushed before its picture still finds it.)
    let n = snaps.next - snaps.items.length;
    for (const snap of snaps.items) {
      const blob = this.blobs.get(snap.seq);
      if (!blob) break;
      n++;
      this.blobs.delete(snap.seq);
      this.post("snapshots.ndjson", `${JSON.stringify(snap)}\n`);
      void blob.arrayBuffer().then((b) => this.post(snap.file, b));
    }
    c.snapshots = n;
  }

  /** The whole recording as one ZIP (spooled files, or memory in driver mode). */
  async exportZip(): Promise<{ blob: Blob; name: string }> {
    const end = { seq: 0, t: performance.now(), kind: "session", text: "recording exported", detail: { overhead: this.recorder.overhead(), videoFrames: this.video?.frames ?? 0 } };
    const name = `siltwake-flight-${this.session}.zip`;
    this.recorder.settle();
    if (!this.spool) {
      const r = this.recorder, lines = <T>(xs: T[]) => new Blob([xs.map((x) => JSON.stringify(x)).join("\n") + "\n"]);
      const snaps = r.snapshots.since(0).items.filter((x) => this.blobs.has(x.seq));
      const entries: ZipEntry[] = [
        { name: "header.json", data: new Blob([JSON.stringify(this.header, null, 1)]) },
        { name: "frames.ndjson", data: lines(r.frames.since(0).rows) },
        { name: "samples.ndjson", data: lines(r.samples.since(0).items) },
        { name: "events.ndjson", data: lines([...r.events.since(0).items, end]) },
        { name: "snapshots.ndjson", data: lines(snaps) },
        ...snaps.map((x) => ({ name: x.file, data: this.blobs.get(x.seq)! })),
        ...(this.videoChunks.length ? [{ name: "video.webm", data: new Blob(this.videoChunks, { type: "video/webm" }) }] : []),
      ];
      return { blob: await zipBlob(entries), name };
    }
    this.flush();
    this.post("events.ndjson", `${JSON.stringify(end)}\n`);
    this.header.exported = { at: new Date().toISOString(), overhead: this.recorder.overhead(), videoFrames: this.video?.frames ?? 0 };
    this.putHeader();
    // Release the worker's handles so the files can be read, then gather them.
    const s = this.spool, id = ++s.seq;
    await new Promise<void>((resolve) => { s.closing.set(id, resolve); s.worker.postMessage({ op: "close", id }); });
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle(SPOOL_ROOT)).getDirectoryHandle(this.session);
    const entries: ZipEntry[] = [];
    await gather(dir, "", entries);
    return { blob: await zipBlob(entries), name };
  }

  /** For the hook: events newer than `since`, and a snapshot's JPEG as base64 (drivers write it to disk). */
  async snapshotData(seq: number): Promise<string | null> {
    const blob = this.blobs.get(seq);
    if (!blob) return null;
    return base64(new Uint8Array(await blob.arrayBuffer()));
  }
  /** Releases snapshots a driver has written (it never needs them again). */
  release(upTo: number): void { for (const k of [...this.blobs.keys()]) if (k <= upTo) this.blobs.delete(k); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.restoreConsole?.();
    try { this.video?.recorder.stop(); } catch { /* already stopped */ }
    this.flush(performance.now(), true);
    const s = this.spool;
    if (s) setTimeout(() => s.worker.terminate(), 2000);
  }
}

const round = (v: number): number => Math.round(v * 10) / 10;
function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function safeJson(v: unknown): string { try { return JSON.stringify(v)?.slice(0, 200) ?? String(v); } catch { return String(v); } }

async function gather(dir: FileSystemDirectoryHandle, prefix: string, out: ZipEntry[]): Promise<void> {
  for await (const [name, handle] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (handle.kind === "directory") await gather(handle as FileSystemDirectoryHandle, `${prefix}${name}/`, out);
    else out.push({ name: `${prefix}${name}`, data: await (handle as FileSystemFileHandle).getFile() });
  }
}
/** Drops the oldest recordings beyond the newest few or the byte budget (never the current one). */
async function prune(current: string): Promise<void> {
  try {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(SPOOL_ROOT, { create: true });
    const sessions: { name: string; bytes: number }[] = [];
    for await (const [name, handle] of (root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (handle.kind !== "directory" || name === current) continue;
      const files: ZipEntry[] = [];
      await gather(handle as FileSystemDirectoryHandle, "", files);
      sessions.push({ name, bytes: files.reduce((a, f) => a + f.data.size, 0) });
    }
    sessions.sort((a, b) => (a.name < b.name ? 1 : -1));
    let kept = 0, bytes = 0;
    for (const s of sessions) {
      if (kept < KEEP_SESSIONS - 1 && bytes + s.bytes <= KEEP_BYTES) { kept++; bytes += s.bytes; continue; }
      await root.removeEntry(s.name, { recursive: true });
    }
  } catch { /* storage is best effort; the live recording is unaffected */ }
}

export type { FlightEvent, FlightSample, FlightSnapshot };
