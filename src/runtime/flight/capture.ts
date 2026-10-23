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
import { FlightRecorder, FLIGHT_FORMAT, FLIGHT_VERSION, FRAME_COLUMNS, HOLD_CODES } from "./recorder.js";
import type { FlightEvent, FlightSample, FlightSnapshot, SnapshotRequest } from "./recorder.js";
import { zipBlob, type ZipEntry } from "./zip.js";
import { budgetFor, DEFAULT_BUDGET_BYTES, MIN_VIDEO_BUDGET_BYTES, planRetention, videoAllowed, type StoredFile, type StoredKind } from "./retention.js";

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
/** A picture not encoded by then is recorded as missing (R1-S4). */
const SNAPSHOT_TIMEOUT_MS = 10_000;
const SPOOL_EVERY_MS = 5000;
const SPOOL_ROOT = "flight", EXPORT_ROOT = "flight-exports";
const VIDEO_BITS = 900_000;
/** A new, independently decodable video file this often (R1-S2); `?recsegment=ms` for tests. */
const SEGMENT_MS = 10 * 60_000;
/** Writes posted but not yet on disk: above HIGH the video pauses until LOW. */
const BACKLOG_HIGH = 32 * 1024 ** 2, BACKLOG_LOW = 8 * 1024 ** 2;
/** In-game video kept in memory (driver mode, no spool): beyond this it stops. */
const VIDEO_MEMORY_CAP = 64 * 1024 ** 2;

export interface FlightBuild { content: string; bake: string; commit: string }
type Video = {
  canvas: HTMLCanvasElement; context: ImageBitmapRenderingContext; track: CanvasCaptureMediaStreamTrack; stream: MediaStream; mimeType: string;
  recorder: MediaRecorder; segment: { file: string; index: number; start: number | null; began: number }; next: number; frames: number; pending: number;
  paused: boolean; onData: (() => void)[];
};

export class FlightCapture {
  readonly recorder: FlightRecorder;
  readonly header: Record<string, unknown>;
  readonly session: string;
  private readonly blobs = new Map<number, Blob>();
  /** Each picture's state (R1-S4): taken pictures are pending until encoded, then ok or failed. */
  private readonly snapState = new Map<number, { state: "pending" | "ok" | "failed"; t: number; why?: string }>();
  private readonly abort = new AbortController();
  private video: Video | null = null;
  private spool: { worker: Worker; cursors: { frames: number; samples: number; events: number; snapshots: number }; last: number;
    waiters: Map<number, (m: { bytes?: number; error?: string }) => void>; seq: number; backlog: number } | null = null;
  /** Everything posted or encoding that an export must wait for (R1-F7). */
  private readonly inflight = new Set<Promise<unknown>>();
  /** What this recording keeps on disk, file by file (R1-S2), and what it lost. */
  private readonly stored = new Map<string, StoredFile>();
  private older: StoredFile[] = [];
  private budget = DEFAULT_BUDGET_BYTES;
  private readonly lost: { file: string | null; bytes: number; why: string }[] = [];
  private readonly segmentMs: number;
  private minVideo = MIN_VIDEO_BUDGET_BYTES;
  private videoMemory = 0;
  private readonly restoreConsole: (() => void) | null = null;
  private disposed = false;
  /** Off (R1-F8): nothing more is recorded; the recording stays exportable. */
  stopped = false;

  constructor(private readonly canvas: HTMLCanvasElement, readonly mode: Exclude<FlightMode, "off">, videoOn: boolean, build: FlightBuild) {
    this.recorder = new FlightRecorder();
    const started = new Date();
    this.session = started.toISOString().replace(/[:.]/g, "-");
    const q = new URLSearchParams(globalThis.location?.search ?? "");
    this.segmentMs = Number(q.get("recsegment")) || SEGMENT_MS;
    // Test overrides: a budget in MiB (then no minimum for video), and the segment length.
    if (Number(q.get("recbudget")) > 0) { this.budget = Number(q.get("recbudget")) * 1048576; this.minVideo = 0; }
    const gl = canvas.getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const script = document.querySelector<HTMLScriptElement>("script[type=module][src]")?.src ?? "";
    this.header = {
      format: FLIGHT_FORMAT, version: FLIGHT_VERSION, mode, session: this.session, startedAt: started.toISOString(),
      pageOrigin: performance.timeOrigin, frameColumns: FRAME_COLUMNS, holdCodes: HOLD_CODES,
      build: { ...build, bundle: script.split("/").pop() ?? "" },
      browser: navigator.userAgent, platform: navigator.platform,
      gpu: info && gl ? { vendor: gl.getParameter(info.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL) } : null,
      screen: { width: screen.width, height: screen.height, dpr: devicePixelRatio, canvas: [canvas.width, canvas.height] },
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
      video: null, snapshots: { size: SNAPSHOT_SIZE, format: "jpeg" },
      retention: { budgetBytes: this.budget, lost: this.lost },
    };
    this.restoreConsole = this.observeErrors();
    this.observeLongFrames();
    if (mode === "playtest") this.startSpool();
    this.recorder.event("session", `recording started (${mode})`, { snapshot: false });
    if (videoOn) this.setVideo(true);
  }

  /** In-flight work an export waits for. */
  private track<T>(p: Promise<T>): Promise<T> {
    this.inflight.add(p);
    const done = () => { this.inflight.delete(p); };
    p.then(done, done);
    return p;
  }
  private async settleInflight(): Promise<void> {
    while (this.inflight.size) await Promise.allSettled([...this.inflight]);
  }

  /** After the frame's render, in the same task (the drawing buffer is still
   * the frame's): the snapshot the recorder asked for, the video frame if due,
   * and the spool. Each part's time is charged to the recorder by name. */
  afterRender(now: number): void {
    if (this.disposed || this.stopped) return;
    const r = this.recorder;
    let start = performance.now();
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
    let at = performance.now();
    r.charge(at - start, "snapshot");
    start = at;
    const v = this.video;
    if (v && !v.paused && now - v.segment.began >= this.segmentMs) this.rotateVideo(now);
    // A frame still being copied is not overtaken: under load the video drops frames, never the game.
    if (v && !v.paused && now >= v.next && v.pending < 2) {
      v.next = Math.max(v.next + 1000 / VIDEO_FPS, now - 1000 / VIDEO_FPS);
      const size = this.scaled(VIDEO_SIZE.width);
      v.pending++;
      const captured = now;
      void createImageBitmap(this.canvas, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: "low" }).then((bitmap) => {
        // A later task: its time is the recorder's too.
        const t0 = performance.now();
        try { this.videoFrame(v, bitmap, captured); } finally { r.charge(performance.now() - t0, "video"); }
      }, () => { v.pending--; });
    }
    at = performance.now();
    r.charge(at - start, "video");
    start = at;
    if (this.spool && now - this.spool.last >= SPOOL_EVERY_MS) this.flush(now);
    r.charge(performance.now() - start, "spool");
  }

  /** A frame with nothing drawn (paused, a menu, the note being typed): the video
   * repeats its last picture at 12 fps, so its timeline keeps the page's clock and
   * covers every moment up to an export (R1-F7). The spool still flushes. */
  idle(now: number): void {
    if (this.disposed || this.stopped) return;
    const v = this.video;
    if (v && !v.paused && v.frames > 0 && now >= v.next) { v.next = Math.max(v.next + 1000 / VIDEO_FPS, now - 1000 / VIDEO_FPS); v.track.requestFrame(); }
    if (this.spool && now - this.spool.last >= SPOOL_EVERY_MS) this.flush(now);
  }

  private videoFrame(v: Video, bitmap: ImageBitmap, captured: number): void {
    v.pending--;
    if (this.disposed || this.video !== v || v.paused) { bitmap.close(); return; }
    if (v.canvas.width !== bitmap.width || v.canvas.height !== bitmap.height) { v.canvas.width = bitmap.width; v.canvas.height = bitmap.height; }
    v.context.transferFromImageBitmap(bitmap);
    v.track.requestFrame();
    v.frames++;
    if (v.segment.start === null) {
      // This segment's time 0 on the page clock: the pack lines video and frames up by it.
      v.segment.start = Math.round(captured);
      this.videoHeader();
    }
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
    this.snapState.set(snap.seq, { state: "pending", t: now });
    // Bounded when nobody drains it (a driver that never reads): the oldest states go.
    for (const old of this.snapState.keys()) { if (this.snapState.size <= 4 * SNAPSHOT_MEMORY) break; this.snapState.delete(old); }
    void this.track(createImageBitmap(this.canvas, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: "low" }).then((bitmap) => {
      const out = new OffscreenCanvas(bitmap.width, bitmap.height);
      out.getContext("bitmaprenderer")!.transferFromImageBitmap(bitmap);
      return out.convertToBlob({ type: "image/jpeg", quality: 0.72 });
    }).then((blob) => {
      this.blobs.set(snap.seq, blob);
      this.snapState.set(snap.seq, { state: "ok", t: now });
      for (const old of this.blobs.keys()) {
        if (this.blobs.size <= SNAPSHOT_MEMORY) break;
        this.blobs.delete(old);
        this.snapState.set(old, { state: "failed", t: now, why: "evicted from memory before it was written" });
      }
    }, (error: unknown) => {
      this.snapState.set(snap.seq, { state: "failed", t: now, why: `encoding failed: ${error instanceof Error ? error.message : String(error)}` });
    }));
  }
  /** A picture's state, for drivers (they record a failed one as missing at once). */
  snapshotState(seq: number): "pending" | "ok" | "failed" | "released" {
    return this.snapState.get(seq)?.state ?? "released";
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
    if (this.stopped) return;
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

  // --- video: independently decodable segments within the budget -------------

  /** Turns the in-game video on or off for the running recording (R1-F8). Off
   * finishes the current segment; on starts a new one. */
  setVideo(on: boolean): void {
    if (this.stopped && on) return;
    if (!on) { if (this.video) { this.finishSegment(this.video, "video turned off"); this.video = null; } return; }
    if (this.video) return;
    const allowed = videoAllowed(this.mode, this.spool !== null, this.budget, this.minVideo);
    if (!allowed.ok) { this.recorder.event("warning", `warning: recording without video: ${allowed.why}`, { snapshot: false }); return; }
    if (typeof MediaRecorder === "undefined") { this.recorder.event("warning", "warning: no MediaRecorder in this browser; recording without video", { snapshot: false }); return; }
    const canvas = document.createElement("canvas");
    canvas.width = VIDEO_SIZE.width; canvas.height = VIDEO_SIZE.height;
    const context = canvas.getContext("bitmaprenderer");
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!context || !track || !mimeType) return;
    const index = this.segmentIndex++;
    const v: Video = { canvas, context, track, stream, mimeType, recorder: null as unknown as MediaRecorder,
      segment: { file: `video/${String(index).padStart(3, "0")}.webm`, index, start: null, began: performance.now() }, next: 0, frames: 0, pending: 0, paused: false, onData: [] };
    v.recorder = this.segmentRecorder(v);
    this.video = v;
    this.recorder.event("session", `video started (${mimeType}, ${VIDEO_FPS} fps, ${VIDEO_SIZE.width}x${VIDEO_SIZE.height}, ${v.segment.file})`, { snapshot: false });
  }
  private segmentIndex = 0;
  private readonly segments: { file: string; start: number | null; end: number | null }[] = [];
  private readonly finishing = new Set<string>();

  /** One MediaRecorder per segment: each file is a whole WebM, decodable alone. */
  private segmentRecorder(v: Video): MediaRecorder {
    const recorder = new MediaRecorder(v.stream, { mimeType: v.mimeType, videoBitsPerSecond: VIDEO_BITS });
    const file = v.segment.file;
    this.segments.push({ file, start: null, end: null });
    recorder.ondataavailable = (e) => {
      const waiters = v.onData.splice(0);
      const release = () => { for (const w of waiters) w(); };
      if (e.data.size) {
        // Waiters (an export's tail, a finished segment) are released once this chunk is posted to the spool.
        if (this.spool) { void this.track(e.data.arrayBuffer().then((b) => this.post(file, b, "append", "video"))).then(release, release); return; }
        else {
          this.videoMemory += e.data.size;
          this.videoChunks.push(e.data);
          if (this.videoMemory > VIDEO_MEMORY_CAP && this.video === v) {
            this.recorder.event("warning", `warning: in-memory video reached ${Math.round(VIDEO_MEMORY_CAP / 1048576)} MiB; video stopped`, { snapshot: false });
            this.setVideo(false);
          }
        }
      }
      release();
    };
    recorder.start(SPOOL_EVERY_MS);
    return recorder;
  }
  private videoHeader(): void {
    const v = this.video, seg = v && this.segments.find((x) => x.file === v.segment.file);
    if (v && seg) seg.start = v.segment.start;
    this.header.video = { source: "game", fps: VIDEO_FPS, size: VIDEO_SIZE, mimeType: v?.mimeType ?? null, bitsPerSecond: VIDEO_BITS,
      segments: this.segments.filter((x) => x.start !== null), ...(this.segments[0]?.start != null ? { file: this.segments[0].file, start: this.segments[0].start } : {}) };
    this.putHeader();
  }
  /** Ends a segment: its last data is posted (tracked), its end time recorded. */
  private finishSegment(v: Video, why: string): void {
    const seg = this.segments.find((x) => x.file === v.segment.file);
    if (seg) seg.end = Math.round(performance.now());
    if (v.recorder.state !== "inactive") {
      // Until its last data is written the segment counts as active: retention never removes it under its own tail.
      const file = v.segment.file;
      this.finishing.add(file);
      const done = new Promise<void>((r) => v.onData.push(r));
      void this.track(done.then(() => { this.finishing.delete(file); }));
      try { v.recorder.stop(); } catch { /* stopped */ }
    }
    this.recorder.event("session", `video segment ${v.segment.file} ended (${why})`, { snapshot: false });
    this.videoHeader();
  }
  private rotateVideo(now: number): void {
    const v = this.video!;
    this.finishSegment(v, "rotation");
    const index = this.segmentIndex++;
    v.segment = { file: `video/${String(index).padStart(3, "0")}.webm`, index, start: null, began: now };
    v.recorder = this.segmentRecorder(v);
    this.retain();
  }
  /** Video kept in memory when nothing spools (driver mode with in-game video, for its overhead); capped. */
  private readonly videoChunks: Blob[] = [];

  // --- the playtest spool and its budget --------------------------------------

  private startSpool(): void {
    if (typeof Worker === "undefined" || !navigator.storage?.getDirectory) {
      this.recorder.event("warning", "warning: this browser has no private file storage; telemetry is kept in memory only (bounded), without video", { snapshot: false });
      return;
    }
    let worker: Worker;
    try { worker = new Worker(new URL("./spool.worker.ts", import.meta.url), { type: "module" }); }
    catch { this.recorder.event("warning", "warning: the flight spool could not start; telemetry is kept in memory only (bounded), without video", { snapshot: false }); return; }
    const waiters = new Map<number, (m: { bytes?: number; error?: string }) => void>();
    worker.onmessage = (e: MessageEvent<{ ack?: number; file?: string; failed?: string; bytes?: number; quota?: boolean; error?: string; removed?: number; exported?: number }>) => {
      const m = e.data, s = this.spool;
      if (!s) return;
      if (m.ack !== undefined) s.backlog -= m.ack;
      if (m.failed !== undefined) this.writeFailed(m.failed, m.bytes ?? 0, m.quota === true, m.error ?? "");
      const id = m.removed ?? m.exported;
      if (id !== undefined) { waiters.get(id)?.({ ...(m.bytes !== undefined ? { bytes: m.bytes } : {}), ...(m.error ? { error: m.error } : {}) }); waiters.delete(id); }
      this.backpressure();
    };
    this.spool = { worker, cursors: { frames: 0, samples: 0, events: 0, snapshots: 0 }, last: performance.now(), waiters, seq: 0, backlog: 0 };
    this.putHeader();
    void this.track(this.survey());
  }
  /** The other recordings on disk and the budget the browser's quota allows. */
  private async survey(): Promise<void> {
    try {
      const est = await navigator.storage.estimate?.();
      const q = new URLSearchParams(globalThis.location?.search ?? "");
      this.budget = budgetFor(est?.quota, Number(q.get("recbudget")) > 0 ? Number(q.get("recbudget")) * 1048576 : DEFAULT_BUDGET_BYTES);
      (this.header.retention as { budgetBytes: number }).budgetBytes = this.budget;
      const root = await navigator.storage.getDirectory();
      const older: StoredFile[] = [];
      for (const [base, kind] of [[SPOOL_ROOT, null], [EXPORT_ROOT, "export"]] as const) {
        const dir = await root.getDirectoryHandle(base, { create: true });
        const entries: ZipEntry[] = [];
        await gather(dir, "", entries);
        for (const e of entries) {
          const session = e.name.split("/")[0]!, file = e.name.slice(session.length + 1) || e.name;
          if (base === SPOOL_ROOT && session === this.session) continue;
          older.push({ session: base === EXPORT_ROOT ? `export:${e.name}` : session, file: base === EXPORT_ROOT ? e.name : file, bytes: e.data.size,
            kind: kind ?? (file.startsWith("video") ? "video" : file.startsWith("snapshots/") ? "snapshot" : "telemetry") });
        }
      }
      this.older = older;
      if (!videoAllowed(this.mode, true, this.budget, this.minVideo).ok && this.video) this.setVideo(false);
      this.retain();
    } catch { /* storage is best effort; the live recording is unaffected */ }
  }
  private post(file: string, data: string | ArrayBuffer, op: "append" | "put" = "append", kind?: StoredKind): void {
    const s = this.spool;
    if (!s) return;
    const bytes = typeof data === "string" ? data.length : data.byteLength;
    s.backlog += bytes;
    const known = this.stored.get(file);
    this.stored.set(file, { session: this.session, file, kind: kind ?? known?.kind ?? (file.startsWith("snapshots/") ? "snapshot" : "telemetry"),
      bytes: op === "put" ? bytes : (known?.bytes ?? 0) + bytes });
    s.worker.postMessage({ op, dir: `${SPOOL_ROOT}/${this.session}`, file, data }, typeof data === "string" ? [] : [data]);
  }
  /** Video pauses while the disk falls behind, and resumes when it catches up. */
  private backpressure(): void {
    const s = this.spool, v = this.video;
    if (!s || !v) return;
    if (!v.paused && s.backlog > BACKLOG_HIGH) { v.paused = true; this.recorder.event("warning", "warning: storage is falling behind; video paused", { snapshot: false }); }
    else if (v.paused && s.backlog < BACKLOG_LOW) { v.paused = false; this.recorder.event("session", "video resumed", { snapshot: false }); }
  }
  /** A write the browser refused: a full quota frees space by the budget's rules, else the video stops. */
  private writeFailed(file: string, bytes: number, quota: boolean, error: string): void {
    this.lost.push({ file, bytes, why: quota ? "the browser's storage quota was full" : `the write failed: ${error.slice(0, 120)}` });
    const known = this.stored.get(file);
    if (known) known.bytes = Math.max(0, known.bytes - bytes);
    if (this.lost.length === 1 || this.lost.length % 50 === 0)
      this.recorder.event("warning", `warning: ${quota ? "storage full" : "a write failed"}: ${file} (${bytes} bytes lost)`, { snapshot: false, detail: { file, bytes, quota } });
    if (!quota) return;
    this.budget = Math.min(this.budget, Math.floor(this.total() * 0.8));
    this.retain();
    if (this.video && !videoAllowed(this.mode, true, this.budget, this.minVideo).ok) this.setVideo(false);
  }
  private total(): number { return [...this.stored.values(), ...this.older].reduce((a, f) => a + f.bytes, 0); }
  /** Keeps every recording within the budget (retention.ts), reporting what went. */
  private retain(): void {
    const s = this.spool;
    if (!s) return;
    const active = [this.video?.segment.file ?? "", ...this.finishing, "header.json", "frames.ndjson", "samples.ndjson", "events.ndjson", "snapshots.ndjson"];
    const plan = planRetention([...this.stored.values(), ...this.older], this.session, active, this.budget);
    for (const r of plan.remove) {
      const exported = r.session.startsWith("export:");
      const id = ++s.seq;
      s.worker.postMessage({ op: "remove", id, ...(exported ? { dir: EXPORT_ROOT, file: r.file } : r.session === this.session ? { dir: `${SPOOL_ROOT}/${this.session}`, file: r.file } : { dir: `${SPOOL_ROOT}/${r.session}`, file: r.file }) });
      if (r.session === this.session && r.file) { this.stored.delete(r.file); this.lost.push({ file: r.file, bytes: r.bytes, why: r.why }); this.recorder.event("warning", `warning: ${r.why}: ${r.file} removed`, { snapshot: false, detail: { ...r } }); }
      else this.older = this.older.filter((f) => !(f.session === r.session && (r.file === null || f.file === r.file)));
    }
    if (plan.overAfter && this.video) {
      this.recorder.event("warning", "warning: the recording's own telemetry and pictures fill the storage budget; video stopped", { snapshot: false });
      this.setVideo(false);
    }
  }
  /** The header as it stands (it learns the video's segments as they start). */
  private putHeader(): void { this.post("header.json", JSON.stringify(this.header, null, 1), "put", "telemetry"); }

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
    if (events.items.length) this.post("events.ndjson", events.items.map((x) => JSON.stringify(x)).join("\n") + "\n");
    // Pictures in order: an encoded one is written; a failed one, or one still
    // pending after SNAPSHOT_TIMEOUT_MS, is listed as missing with why (R1-S4);
    // a recent pending one waits for the next flush.
    let n = snaps.next - snaps.items.length;
    for (const snap of snaps.items) {
      const st = this.snapState.get(snap.seq), blob = this.blobs.get(snap.seq);
      if (st?.state === "pending" && !final && now - st.t < SNAPSHOT_TIMEOUT_MS) break;
      n++;
      this.blobs.delete(snap.seq);
      this.snapState.delete(snap.seq);
      if (st?.state === "ok" && blob) {
        void this.track(blob.arrayBuffer().then((b) => this.post(snap.file, b, "append", "snapshot")));
        this.post("snapshots.ndjson", `${JSON.stringify(snap)}\n`);
      } else this.post("snapshots.ndjson", `${JSON.stringify({ ...snap, missing: st?.why ?? (st?.state === "pending" ? "not encoded in time" : "not kept") })}\n`);
    }
    c.snapshots = n;
    this.retain();
  }

  /**
   * The whole recording as one ZIP (R1-F7): an export cutoff, then every
   * picture taken before it encoded and written, the video's tail requested
   * and written, and the worker's barrier, after which the worker writes the
   * ZIP into its own file as everything stands. Recording carries on meanwhile.
   */
  async exportZip(): Promise<{ blob: Blob; name: string }> {
    const cutoff = performance.now();
    this.recorder.event("session", "export: recording up to here", { t: cutoff, snapshot: false });
    const name = `siltwake-flight-${this.session}.zip`;
    await this.videoTail();
    await this.settleInflight();
    this.recorder.settle();
    this.header.exported = { at: new Date().toISOString(), cutoff: Math.round(cutoff), overhead: this.recorder.overhead(), videoFrames: this.video?.frames ?? 0 };
    if (!this.spool) {
      const r = this.recorder, lines = <T>(xs: T[]) => new Blob([xs.map((x) => JSON.stringify(x)).join("\n") + "\n"]);
      const snaps = r.snapshots.since(0).items;
      const kept = snaps.filter((x) => this.blobs.has(x.seq));
      const entries: ZipEntry[] = [
        { name: "header.json", data: new Blob([JSON.stringify(this.header, null, 1)]) },
        { name: "frames.ndjson", data: lines(r.frames.since(0).rows) },
        { name: "samples.ndjson", data: lines(r.samples.since(0).items) },
        { name: "events.ndjson", data: lines(r.events.since(0).items) },
        { name: "snapshots.ndjson", data: lines(snaps.map((x) => (this.blobs.has(x.seq) ? x : { ...x, missing: this.snapState.get(x.seq)?.why ?? "released" }))) },
        ...kept.map((x) => ({ name: x.file, data: this.blobs.get(x.seq)! })),
        ...(this.videoChunks.length ? [{ name: this.segments[0]?.file ?? "video/000.webm", data: new Blob(this.videoChunks, { type: "video/webm" }) }] : []),
      ];
      return { blob: await zipBlob(entries), name };
    }
    this.flush(performance.now(), true);
    this.putHeader();
    await this.settleInflight();
    const s = this.spool, id = ++s.seq, out = `${EXPORT_ROOT}/${name}`;
    // Earlier exports are copies: replaced, not kept.
    for (const f of this.older.filter((x) => x.kind === "export")) s.worker.postMessage({ op: "remove", id: ++s.seq, dir: EXPORT_ROOT, file: f.file });
    this.older = this.older.filter((x) => x.kind !== "export");
    const result = await new Promise<{ bytes?: number; error?: string }>((resolve) => { s.waiters.set(id, resolve); s.worker.postMessage({ op: "export", id, dir: `${SPOOL_ROOT}/${this.session}`, out }); });
    if (result.error) throw new Error(result.error);
    this.older.push({ session: `export:${name}`, file: name, bytes: result.bytes ?? 0, kind: "export" });
    const file = await (await (await navigator.storage.getDirectory()).getDirectoryHandle(EXPORT_ROOT)).getFileHandle(name);
    return { blob: await file.getFile(), name };
  }
  /** Asks the video for its buffered data and waits for it (bounded). */
  private async videoTail(): Promise<void> {
    const v = this.video;
    if (!v || v.recorder.state !== "recording") return;
    const got = new Promise<void>((r) => v.onData.push(r));
    try { v.recorder.requestData(); } catch { return; }
    await Promise.race([got, new Promise((r) => setTimeout(r, 3000))]);
  }

  /** For the hook: a snapshot's JPEG as base64 (drivers write it to disk). */
  async snapshotData(seq: number): Promise<string | null> {
    const blob = this.blobs.get(seq);
    if (!blob) return null;
    return base64(new Uint8Array(await blob.arrayBuffer()));
  }
  /** Releases snapshots a driver has written (it never needs them again). */
  release(upTo: number): void { for (const k of [...this.blobs.keys()]) if (k <= upTo) { this.blobs.delete(k); this.snapState.delete(k); } }

  /** Off (R1-F8): stop recording now; what was recorded stays exportable. */
  stop(): void {
    if (this.stopped || this.disposed) return;
    this.recorder.event("session", "recording turned off", { snapshot: false });
    this.setVideo(false);
    this.stopped = true;
    this.abort.abort();
    this.restoreConsole?.();
    this.flush(performance.now(), true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
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
export type { FlightEvent, FlightSample, FlightSnapshot };
