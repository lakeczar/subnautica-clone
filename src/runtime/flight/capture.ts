/** REC-1, the browser half of the flight recorder: snapshots of the game
 * canvas at events, the in-game 12 fps video (WebCodecs in the spool worker,
 * playtests), the durable local spool (OPFS, playtests), errors and long
 * animation frames, and the export. Everything stays on this computer.
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
import { budgetFor, DEFAULT_BUDGET_BYTES, MIN_VIDEO_BUDGET_BYTES, planRetention, videoAllowed, type RetentionPlan, type StoredFile, type StoredKind } from "./retention.js";

export type FlightMode = "off" | "driver" | "playtest";
export interface FlightSettings { enabled: boolean; video: boolean }
export const DEFAULT_FLIGHT_SETTINGS: FlightSettings = { enabled: true, video: true };

/** `?rec=off|driver|playtest` overrides Settings; `?recvideo=0|1` the in-game video.
 * An automated browser (`navigator.webdriver`: every test driver, soak and
 * evidence run) that names no mode gets `driver`: bounded memory, readable
 * through the test hook, no spool and no in-game video (a driver records its
 * own). A person's browser gets the playtest default (Settings can turn it
 * off). The in-game video needs the playtest spool: it is encoded there. */
export function flightMode(settings: FlightSettings, search = globalThis.location?.search ?? "",
  automated = globalThis.navigator?.webdriver === true): { mode: FlightMode; video: boolean } {
  const q = new URLSearchParams(search), rec = q.get("rec"), video = q.get("recvideo");
  const mode: FlightMode = rec === "off" || rec === "0" ? "off" : rec === "driver" ? "driver" : rec === "playtest" ? "playtest"
    : automated ? "driver" : settings.enabled ? "playtest" : "off";
  return { mode, video: mode === "playtest" && (video === null ? settings.video : video === "1") };
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
/** Pictures captured or on their way to the encoder: beyond this the video skips a frame, never the game. */
const VIDEO_INFLIGHT_MAX = 3;
/** Writes posted but not yet on disk: above HIGH the video pauses until LOW. */
const BACKLOG_HIGH = 32 * 1024 ** 2, BACKLOG_LOW = 8 * 1024 ** 2;
/** An export stays out of the budget's reach this long after it is written: the download reads it (R2-1). */
const EXPORT_GRACE_MS = 120_000;
/** A worker request (a flush, a barrier, a segment's close) answered by then, or given up as failed. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface FlightBuild { content: string; bake: string; commit: string }
type Video = {
  segment: { file: string; index: number; start: number | null; began: number; width: number; height: number };
  next: number; frames: number; inflight: number; capturing: number; skipped: number; lastSent: number; paused: boolean;
};
type SegmentRecord = { file: string; start: number | null; end: number | null; width: number; height: number };
/** What a recording knows it lost, persisted in its header (R2-2). */
interface Ledger {
  budgetBytes: number;
  /** This recording's own data that is gone: budget removals, refused writes, an early stop. */
  lost: { file: string | null; bytes: number; why: string }[];
  /** Cumulative entries each in-memory ring overwrote before they were written. */
  ringLost: { frames: number; samples: number; events: number; snapshots: number };
  /** Older recordings' files the budget removed (their history, not this recording's evidence). */
  removedOlder: { session: string; file: string | null; bytes: number; why: string }[];
  /** The recording stopped itself (its own telemetry filled the budget). */
  stopped: { t: number; why: string } | null;
  /** An export copy written over the budget, and by how much (it is transient: EXPORT_GRACE_MS). */
  exportOver: { at: string; bytes: number }[];
}
type WorkerReply = {
  ack?: number; file?: string; failed?: string; bytes?: number; quota?: boolean; error?: string; video?: boolean;
  removed?: number; exported?: number; barrier?: number; videoFlushed?: number; videoClosed?: number;
  videoFrame?: number; kept?: boolean; videoOpened?: string; codec?: string; videoError?: string; wrote?: string; videoOrigin?: string; t?: number;
  frames?: number; firstMs?: number; lastMs?: number;
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
    waiters: Map<number, (m: WorkerReply) => void>; seq: number; backlog: number } | null = null;
  /** Everything posted or encoding that an export must wait for (R1-F7). */
  private readonly inflight = new Set<Promise<unknown>>();
  /** What this recording keeps on disk, file by file (R1-S2). */
  private readonly stored = new Map<string, StoredFile>();
  private older: StoredFile[] = [];
  private budget = DEFAULT_BUDGET_BYTES;
  private readonly ledger: Ledger;
  private readonly segmentMs: number;
  private minVideo = MIN_VIDEO_BUDGET_BYTES;
  private readonly restoreConsole: (() => void) | null = null;
  private readonly encoder = new TextEncoder();
  /** The latest export, out of the budget's reach until `until`. */
  private latestExport: { file: string; until: number } | null = null;
  /** The finalization Off started (R2-3): every picture encoded and written. */
  private finished: Promise<void> = Promise.resolve();
  /** The export in progress, if any: retiring waits for it (R2-5). */
  private exporting: Promise<unknown> = Promise.resolve();
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
    this.ledger = { budgetBytes: this.budget, lost: [], ringLost: { frames: 0, samples: 0, events: 0, snapshots: 0 }, removedOlder: [], stopped: null, exportOver: [] };
    this.header = {
      format: FLIGHT_FORMAT, version: FLIGHT_VERSION, mode, session: this.session, startedAt: started.toISOString(),
      pageOrigin: performance.timeOrigin, frameColumns: FRAME_COLUMNS, holdCodes: HOLD_CODES,
      build: { ...build, bundle: script.split("/").pop() ?? "" },
      browser: navigator.userAgent, platform: navigator.platform,
      gpu: info && gl ? { vendor: gl.getParameter(info.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL) } : null,
      screen: { width: screen.width, height: screen.height, dpr: devicePixelRatio, canvas: [canvas.width, canvas.height] },
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
      video: null, snapshots: { size: SNAPSHOT_SIZE, format: "jpeg" },
      retention: this.ledger,
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
  /** Waits for in-flight work, at most `limitMs`; false when some is still running. */
  private async settleInflight(limitMs = Infinity): Promise<boolean> {
    const end = performance.now() + limitMs;
    while (this.inflight.size) {
      const left = end - performance.now();
      if (left <= 0) return false;
      await Promise.race([Promise.allSettled([...this.inflight]), sleep(Math.min(left, 2 ** 31 - 1))]);
    }
    return true;
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
    if (v && !v.paused) {
      const size = this.scaled(VIDEO_SIZE.width);
      if (size.width !== v.segment.width || size.height !== v.segment.height) this.rotateVideo(now, "the picture's size changed");
      else if (now - v.segment.began >= this.segmentMs) this.rotateVideo(now, "rotation");
      // The picture is copied and scaled on the GPU now (this frame's drawing
      // buffer) and handed to the worker's encoder with this frame's time.
      // Under load the video skips frames, never the game.
      if (now >= v.next) {
        v.next = Math.max(v.next + 1000 / VIDEO_FPS, now - 1000 / VIDEO_FPS);
        if (v.inflight + v.capturing >= VIDEO_INFLIGHT_MAX) v.skipped++;
        else {
          const seg = v.segment;
          v.capturing++;
          void createImageBitmap(this.canvas, { resizeWidth: seg.width, resizeHeight: seg.height, resizeQuality: "low" }).then((bitmap) => {
            // A later task: its time is the recorder's too.
            const t0 = performance.now();
            v.capturing--;
            if (this.video !== v || v.paused || this.stopped || v.segment !== seg) bitmap.close();
            else this.sendFrame(v, now, bitmap);
            r.charge(performance.now() - t0, "video");
          }, () => { v.capturing--; });
        }
      }
    }
    at = performance.now();
    r.charge(at - start, "video");
    start = at;
    if (this.spool && now - this.spool.last >= SPOOL_EVERY_MS) this.flush(now);
    r.charge(performance.now() - start, "spool");
  }

  /** A frame with nothing drawn (paused, a menu, the note being typed): the
   * video repeats its last picture at 12 fps with this frame's time, so it
   * covers every moment up to an export (R1-F7). The spool still flushes. */
  idle(now: number): void {
    if (this.disposed || this.stopped) return;
    const start = performance.now();
    const v = this.video;
    if (v && !v.paused && v.frames > 0 && v.capturing === 0 && now >= v.next) {
      v.next = Math.max(v.next + 1000 / VIDEO_FPS, now - 1000 / VIDEO_FPS);
      if (v.inflight >= VIDEO_INFLIGHT_MAX) v.skipped++; else this.sendFrame(v, now);
    }
    const at = performance.now();
    this.recorder.charge(at - start, "video");
    if (this.spool && now - this.spool.last >= SPOOL_EVERY_MS) this.flush(now);
    this.recorder.charge(performance.now() - at, "spool");
  }

  /** One picture (or, without one, the last again) to the encoder, stamped with
   * the page time it shows. Times only go forward. */
  private sendFrame(v: Video, t: number, bitmap?: ImageBitmap): void {
    const s = this.spool;
    if (!s || t <= v.lastSent) { bitmap?.close(); return; }
    v.lastSent = t;
    v.inflight++;
    v.frames++;
    s.worker.postMessage({ op: "video-frame", t, ...(bitmap ? { bitmap } : {}) }, bitmap ? [bitmap] : []);
  }

  /** The game canvas scaled to `width`, keeping its aspect (both even, as encoders want). */
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
      const t0 = performance.now();
      this.blobs.set(snap.seq, blob);
      this.snapState.set(snap.seq, { state: "ok", t: now });
      for (const old of this.blobs.keys()) {
        if (this.blobs.size <= SNAPSHOT_MEMORY) break;
        this.blobs.delete(old);
        this.snapState.set(old, { state: "failed", t: now, why: "evicted from memory before it was written" });
      }
      this.recorder.charge(performance.now() - t0, "snapshot");
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
  setVideo(on: boolean, why = "video turned off"): void {
    if (!on) {
      const v = this.video;
      if (v) { this.video = null; this.finishSegment(v, why, true); }
      return;
    }
    if (this.stopped || this.video) return;
    const allowed = videoAllowed(this.mode, this.spool !== null, this.budget, this.minVideo);
    if (!allowed.ok) { this.recorder.event("warning", `warning: recording without video: ${allowed.why}`, { snapshot: false }); return; }
    // The video is encoded and written in the spool's worker: without it (a driver), the driver records its own.
    if (!this.spool) { this.recorder.event("warning", "warning: the in-game video needs the playtest spool; recording without it", { snapshot: false }); return; }
    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
      this.recorder.event("warning", "warning: this browser has no WebCodecs video encoder; recording without video", { snapshot: false });
      return;
    }
    const v: Video = { segment: this.newSegment(performance.now()), next: 0, frames: 0, inflight: 0, capturing: 0, skipped: 0, lastSent: -Infinity, paused: false };
    this.video = v;
    this.recorder.event("session", `video started (WebCodecs, ${VIDEO_FPS} fps, ${v.segment.width}x${v.segment.height}, ${v.segment.file})`, { snapshot: false });
  }
  private segmentIndex = 0;
  private readonly segments: SegmentRecord[] = [];
  private readonly finishing = new Set<string>();

  /** A new segment file in the worker: a whole WebM, decodable alone, at the canvas's current aspect. */
  private newSegment(now: number): Video["segment"] {
    const s = this.spool!, index = this.segmentIndex++, size = this.scaled(VIDEO_SIZE.width);
    const file = `video/${String(index).padStart(3, "0")}.webm`;
    this.segments.push({ file, start: null, end: null, ...size });
    this.stored.set(file, { session: this.session, file, kind: "video", bytes: 0 });
    s.worker.postMessage({ op: "video-open", dir: `${SPOOL_ROOT}/${this.session}`, file, ...size, fps: VIDEO_FPS, bitrate: VIDEO_BITS });
    return { file, index, start: null, began: now, ...size };
  }
  private videoHeader(): void {
    const v = this.video;
    this.header.video = { source: "game", encoder: "webcodecs", codec: this.codec, fps: VIDEO_FPS, size: v ? { width: v.segment.width, height: v.segment.height } : VIDEO_SIZE,
      bitsPerSecond: VIDEO_BITS, segments: this.segments.filter((x) => x.start !== null),
      ...(this.segments[0]?.start != null ? { file: this.segments[0].file, start: this.segments[0].start } : {}) };
    this.putHeader();
  }
  private codec: string | null = null;
  /** Ends a segment: the encoder drains into its file (tracked), its end time recorded. */
  private finishSegment(v: Video, why: string, final: boolean): void {
    const seg = this.segments.find((x) => x.file === v.segment.file);
    if (seg) seg.end = Math.round(performance.now());
    const file = v.segment.file;
    // Until its last data is written the segment counts as active: retention never removes it under its own tail.
    this.finishing.add(file);
    void this.track(this.request({ op: "video-close", final }).then(() => { this.finishing.delete(file); }));
    this.recorder.event("session", `video segment ${file} ended (${why})`, { snapshot: false });
    this.videoHeader();
  }
  private rotateVideo(now: number, why: string): void {
    const v = this.video!;
    this.finishSegment(v, why, false);
    v.segment = this.newSegment(now);
    this.retain();
  }

  // --- the playtest spool and its budget --------------------------------------

  private startSpool(): void {
    if (typeof Worker === "undefined" || !navigator.storage?.getDirectory) {
      this.recorder.event("warning", "warning: this browser has no private file storage; telemetry is kept in memory only (bounded), without video", { snapshot: false });
      return;
    }
    let worker: Worker;
    try { worker = new Worker(new URL("./spool.worker.ts", import.meta.url), { type: "module" }); }
    catch { this.recorder.event("warning", "warning: the flight spool could not start; telemetry is kept in memory only (bounded), without video", { snapshot: false }); return; }
    const waiters = new Map<number, (m: WorkerReply) => void>();
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const t0 = performance.now();
      this.received(e.data);
      this.recorder.charge(performance.now() - t0, "spool");
    };
    this.spool = { worker, cursors: { frames: 0, samples: 0, events: 0, snapshots: 0 }, last: performance.now(), waiters, seq: 0, backlog: 0 };
    this.putHeader();
    void this.track(this.survey());
  }
  /** The worker's replies: acknowledgements, refusals, the encoder's progress. */
  private received(m: WorkerReply): void {
    const s = this.spool;
    if (!s) return;
    if (m.ack !== undefined) s.backlog -= m.ack;
    if (m.failed !== undefined) this.writeFailed(m.failed, m.bytes ?? 0, m.quota === true, m.error ?? "", m.video === true);
    if (m.wrote !== undefined) { const f = this.stored.get(m.wrote); if (f) f.bytes += m.bytes ?? 0; }
    if (m.videoFrame !== undefined && this.video) this.video.inflight = Math.max(0, this.video.inflight - 1);
    if (m.videoOrigin !== undefined) {
      // The segment's time 0 is its first encoded picture's page time, as the worker stamped it (R2-7).
      const seg = this.segments.find((x) => x.file === m.videoOrigin);
      if (seg && seg.start === null) { seg.start = Math.round((m.t ?? 0) * 1000) / 1000; if (this.video?.segment.file === seg.file) this.video.segment.start = seg.start; this.videoHeader(); }
    }
    if (m.videoOpened !== undefined && m.codec && this.codec !== m.codec) { this.codec = m.codec; this.videoHeader(); }
    if (m.videoError !== undefined && this.video) {
      this.recorder.event("warning", `warning: the video encoder failed (${m.videoError.slice(0, 120)}); recording without video`, { snapshot: false });
      this.setVideo(false, "the encoder failed");
    }
    const id = m.removed ?? m.exported ?? m.barrier ?? m.videoFlushed ?? m.videoClosed;
    if (id !== undefined) { s.waiters.get(id)?.(m); s.waiters.delete(id); }
    this.backpressure();
  }
  /** One worker request, answered or given up after REQUEST_TIMEOUT_MS. */
  private request(msg: Record<string, unknown>): Promise<WorkerReply> {
    const s = this.spool;
    if (!s) return Promise.resolve({ error: "no spool" });
    const id = ++s.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { s.waiters.delete(id); resolve({ error: "the spool did not answer" }); }, REQUEST_TIMEOUT_MS);
      s.waiters.set(id, (m) => { clearTimeout(timer); resolve(m); });
      s.worker.postMessage({ ...msg, id });
    });
  }
  /** The other recordings on disk and the budget the browser's quota allows. */
  private async survey(): Promise<void> {
    try {
      const est = await navigator.storage.estimate?.();
      const q = new URLSearchParams(globalThis.location?.search ?? "");
      this.budget = budgetFor(est?.quota, Number(q.get("recbudget")) > 0 ? Number(q.get("recbudget")) * 1048576 : DEFAULT_BUDGET_BYTES);
      this.ledger.budgetBytes = this.budget;
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
      if (!videoAllowed(this.mode, true, this.budget, this.minVideo).ok && this.video) this.setVideo(false, "the storage budget leaves no room for video");
      this.retain();
    } catch { /* storage is best effort; the live recording is unaffected */ }
  }
  /** Telemetry and pictures to the worker as UTF-8 bytes, counted exactly (R2-2). */
  private post(file: string, data: string | ArrayBuffer, op: "append" | "put" = "append", kind?: StoredKind): void {
    const s = this.spool;
    if (!s) return;
    const buffer = typeof data === "string" ? this.encoder.encode(data).buffer as ArrayBuffer : data;
    const bytes = buffer.byteLength;
    s.backlog += bytes;
    const known = this.stored.get(file);
    this.stored.set(file, { session: this.session, file, kind: kind ?? known?.kind ?? (file.startsWith("snapshots/") ? "snapshot" : "telemetry"),
      bytes: op === "put" ? bytes : (known?.bytes ?? 0) + bytes });
    s.worker.postMessage({ op, dir: `${SPOOL_ROOT}/${this.session}`, file, data: buffer }, [buffer]);
  }
  /** Video pauses while the disk falls behind, and resumes when it catches up. */
  private backpressure(): void {
    const s = this.spool, v = this.video;
    if (!s || !v) return;
    if (!v.paused && s.backlog > BACKLOG_HIGH) { v.paused = true; this.recorder.event("warning", "warning: storage is falling behind; video paused", { snapshot: false }); }
    else if (v.paused && s.backlog < BACKLOG_LOW) { v.paused = false; this.recorder.event("session", "video resumed", { snapshot: false }); }
  }
  /** A write the browser refused: recorded in the ledger; a full quota frees space by the budget's rules, a refused video write ends the video. */
  private writeFailed(file: string, bytes: number, quota: boolean, error: string, video: boolean): void {
    const s = this.spool;
    if (s && !video) s.backlog -= bytes;
    this.ledger.lost.push({ file, bytes, why: quota ? "the browser's storage quota was full" : `the write failed: ${error.slice(0, 120)}` });
    const known = this.stored.get(file);
    if (known && !video) known.bytes = Math.max(0, known.bytes - bytes);
    const failures = this.ledger.lost.filter((l) => l.why.startsWith("the write failed") || l.why.startsWith("the browser's storage quota")).length;
    if (failures === 1 || failures % 50 === 0)
      this.recorder.event("warning", `warning: ${quota ? "storage full" : "a write failed"}: ${file} (${bytes} bytes lost)`, { snapshot: false, detail: { file, bytes, quota } });
    if (video && this.video) this.setVideo(false, "its file could not be written");
    if (!quota) return;
    this.budget = Math.min(this.budget, Math.floor(this.total() * 0.8));
    this.ledger.budgetBytes = this.budget;
    this.retain();
    if (this.video && !videoAllowed(this.mode, true, this.budget, this.minVideo).ok) this.setVideo(false, "the storage quota is full");
  }
  private total(): number { return [...this.stored.values(), ...this.older].reduce((a, f) => a + f.bytes, 0); }

  /** Keeps every recording within the budget (retention.ts), reporting what went (R1-S2, R2-1). */
  private retain(): void {
    const s = this.spool;
    if (!s || this.disposed) return;
    // The latest export is out of reach for its grace period (its download reads it); after that it is the first to go.
    const grace = this.latestExport && performance.now() < this.latestExport.until ? this.latestExport.file : null;
    const files = [...this.stored.values(), ...this.older.filter((x) => !(x.kind === "export" && x.file === grace))];
    const active = [this.video?.segment.file ?? "", ...this.finishing, "header.json", "frames.ndjson", "samples.ndjson", "events.ndjson", "snapshots.ndjson"];
    const plan = planRetention(files, this.session, active, this.budget);
    this.apply(plan);
    if (!plan.overAfter) return;
    if (this.video) {
      this.recorder.event("warning", "warning: the recording's own telemetry and pictures fill the storage budget; video stopped", { snapshot: false });
      this.setVideo(false, "the storage budget is full");
    } else if (!this.finishing.size && !this.stopped) {
      // Nothing left to remove but this recording's telemetry (R2-1): stop
      // here, with a durable fact, rather than grow past the budget.
      const why = `this recording's telemetry fills the storage budget (${Math.round(this.budget / 1048576)} MiB); recording stopped`;
      this.ledger.stopped = { t: Math.round(performance.now()), why };
      this.ledger.lost.push({ file: null, bytes: 0, why: `nothing after this moment was recorded: ${why}` });
      this.recorder.event("warning", `warning: ${why}`, { snapshot: false });
      this.stop("recording stopped: the storage budget is full");
    }
  }
  /** Carries out a plan; every removal is in the ledger and the event log (R2-2). */
  private apply(plan: RetentionPlan): void {
    const s = this.spool!;
    for (const r of plan.remove) {
      const exported = r.session.startsWith("export:");
      s.worker.postMessage({ op: "remove", id: ++s.seq, ...(exported ? { dir: EXPORT_ROOT, file: r.file } : { dir: `${SPOOL_ROOT}/${r.session}`, file: r.file }) });
      if (r.session === this.session && r.file) {
        this.stored.delete(r.file);
        this.ledger.lost.push({ file: r.file, bytes: r.bytes, why: r.why });
        this.recorder.event("warning", `warning: ${r.why}: ${r.file} removed`, { snapshot: false, detail: { ...r } });
      } else {
        this.older = this.older.filter((f) => !(f.session === r.session && (r.file === null || f.file === r.file)));
        if (this.latestExport && exported && r.file === this.latestExport.file) this.latestExport = null;
        this.ledger.removedOlder.push({ session: r.session, file: r.file, bytes: r.bytes, why: r.why });
        this.recorder.event("session", `${r.why}: ${r.session}${r.file ? `/${r.file}` : ""} removed (${Math.round(r.bytes / 1024)} KiB)`, { snapshot: false, detail: { ...r } });
      }
    }
  }
  /** The header as it stands (it learns the video's segments and the ledger as they change). */
  private putHeader(): void { this.post("header.json", JSON.stringify(this.header, null, 1), "put", "telemetry"); }

  /**
   * Appends everything recorded since the last flush. Pictures go in order: an
   * encoded one is written; a failed one is listed as missing with why (R1-S4);
   * a pending one waits for a later flush, unless it has been pending for
   * SNAPSHOT_TIMEOUT_MS or `expire` says the recording is over (R2-3: never
   * because an export or Off came while it was encoding).
   */
  flush(now = performance.now(), final = false, expire = false): void {
    const s = this.spool;
    if (!s) return;
    if (final) this.recorder.settle();
    s.last = now;
    const r = this.recorder, c = s.cursors, ring = this.ledger.ringLost;
    const frames = r.frames.since(c.frames), samples = r.samples.since(c.samples), events = r.events.since(c.events), snaps = r.snapshots.since(c.snapshots);
    c.frames = frames.next; c.samples = samples.next; c.events = events.next;
    // Every ring's overwritten entries are counted and kept (R2-2), not only the frames'.
    const lostNow = { frames: frames.lost, samples: samples.lost, events: events.lost, snapshots: snaps.lost };
    let anyLost = false;
    for (const [k, n] of Object.entries(lostNow) as [keyof typeof lostNow, number][]) if (n > 0) { ring[k] += n; anyLost = true; }
    if (frames.rows.length) this.post("frames.ndjson", frames.rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    if (samples.items.length) this.post("samples.ndjson", samples.items.map((x) => JSON.stringify(x)).join("\n") + "\n");
    if (events.items.length) this.post("events.ndjson", events.items.map((x) => JSON.stringify(x)).join("\n") + "\n");
    if (anyLost) {
      const text = Object.entries(lostNow).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ");
      this.post("events.ndjson", `${JSON.stringify({ seq: 0, t: now, kind: "warning", text: `warning: ${text} were overwritten in memory before the spool read them`, detail: { lost: lostNow } })}\n`);
      this.putHeader();
    }
    let n = snaps.next - snaps.items.length;
    for (const snap of snaps.items) {
      const st = this.snapState.get(snap.seq), blob = this.blobs.get(snap.seq);
      if (st?.state === "pending" && !expire && now - st.t < SNAPSHOT_TIMEOUT_MS) break;
      n++;
      this.blobs.delete(snap.seq);
      this.snapState.delete(snap.seq);
      if (st?.state === "ok" && blob) {
        void this.track(blob.arrayBuffer().then((b) => this.post(snap.file, b, "append", "snapshot")));
        this.post("snapshots.ndjson", `${JSON.stringify(snap)}\n`);
      } else this.post("snapshots.ndjson", `${JSON.stringify({ ...snap, missing: st?.why ?? (st?.state === "pending" ? (expire ? "still encoding when the recording ended" : "not encoded in time") : "not kept") })}\n`);
    }
    c.snapshots = n;
    this.retain();
  }

  /**
   * The whole recording as one ZIP (R1-F7, R2-2): an export cutoff; the video
   * given a picture at the cutoff and drained into its file; every picture
   * taken before the cutoff encoded and written; the worker's barrier (every
   * write before it acknowledged or refused, so the ledger is final); then the
   * header, and the worker writes the ZIP into its own file as everything
   * stands. Recording carries on meanwhile.
   */
  async exportZip(): Promise<{ blob: Blob; name: string }> {
    const job = this.exportNow();
    this.exporting = job.catch(() => {});
    return job;
  }
  private async exportNow(): Promise<{ blob: Blob; name: string }> {
    const cutoff = performance.now();
    this.recorder.event("session", "export: recording up to here", { t: cutoff, snapshot: false });
    const name = `siltwake-flight-${this.session}.zip`;
    await this.finished;
    const v = this.video;
    if (v && !v.paused && this.spool) { this.sendFrame(v, cutoff); await this.request({ op: "video-flush" }); }
    await this.settleInflight(SNAPSHOT_TIMEOUT_MS);
    this.recorder.settle();
    if (!this.spool) return { blob: await this.memoryZip(cutoff), name };
    this.flush(performance.now(), true);
    await this.settleInflight(SNAPSHOT_TIMEOUT_MS);
    await this.request({ op: "barrier" });
    // Room for the copy (R2-1): older recordings and exports make way first;
    // this recording's own data never does. What is still over is recorded.
    const s = this.spool, sessionBytes = [...this.stored.values()].reduce((a, f) => a + f.bytes, 0);
    for (const f of this.older.filter((x) => x.kind === "export")) {
      s.worker.postMessage({ op: "remove", id: ++s.seq, dir: EXPORT_ROOT, file: f.file });
      this.ledger.removedOlder.push({ session: f.session, file: f.file, bytes: f.bytes, why: "an earlier export (a copy), replaced by this one" });
    }
    this.older = this.older.filter((x) => x.kind !== "export");
    const room = planRetention([...this.stored.values(), ...this.older], this.session, [...this.stored.keys()], this.budget - sessionBytes);
    this.apply(room);
    const over = room.totalAfter + sessionBytes - this.budget;
    if (over > 0) {
      this.ledger.exportOver.push({ at: new Date().toISOString(), bytes: over });
      this.recorder.event("warning", `warning: the export copy goes ${Math.round(over / 1048576)} MiB over the storage budget until it is downloaded`, { snapshot: false });
    }
    this.header.exported = { at: new Date().toISOString(), cutoff: Math.round(cutoff), overhead: this.recorder.overhead(), videoFrames: this.video?.frames ?? 0, videoSkipped: this.video?.skipped ?? 0 };
    const lostBefore = this.ledger.lost.length;
    this.putHeader();
    const out = `${EXPORT_ROOT}/${name}`;
    const result = await this.request({ op: "export", dir: `${SPOOL_ROOT}/${this.session}`, out });
    if (result.error) throw new Error(result.error);
    // The header in the ZIP must be the ledger as it stood: a refused header write makes the export untrustworthy.
    await this.request({ op: "barrier" });
    if (this.ledger.lost.slice(lostBefore).some((l) => l.file === "header.json")) throw new Error("the recording's header could not be written; export again");
    this.older.push({ session: `export:${name}`, file: name, bytes: result.bytes ?? 0, kind: "export" });
    this.latestExport = { file: name, until: performance.now() + EXPORT_GRACE_MS };
    const file = await (await (await navigator.storage.getDirectory()).getDirectoryHandle(EXPORT_ROOT)).getFileHandle(name);
    return { blob: await file.getFile(), name };
  }
  /** No private storage: the recording from memory, with what the rings overwrote in its ledger (R2-2). */
  private async memoryZip(cutoff: number): Promise<Blob> {
    const r = this.recorder, lines = <T>(xs: T[]) => new Blob([xs.map((x) => JSON.stringify(x)).join("\n") + "\n"]);
    const frames = r.frames.since(0), samples = r.samples.since(0), events = r.events.since(0), snaps = r.snapshots.since(0);
    Object.assign(this.ledger.ringLost, { frames: frames.lost, samples: samples.lost, events: events.lost, snapshots: snaps.lost });
    this.header.exported = { at: new Date().toISOString(), cutoff: Math.round(cutoff), overhead: r.overhead(), videoFrames: 0 };
    const kept = snaps.items.filter((x) => this.blobs.has(x.seq));
    const entries: ZipEntry[] = [
      { name: "header.json", data: new Blob([JSON.stringify(this.header, null, 1)]) },
      { name: "frames.ndjson", data: lines(frames.rows) },
      { name: "samples.ndjson", data: lines(samples.items) },
      { name: "events.ndjson", data: lines(events.items) },
      { name: "snapshots.ndjson", data: lines(snaps.items.map((x) => (this.blobs.has(x.seq) ? x : { ...x, missing: this.snapState.get(x.seq)?.why ?? "released" }))) },
      ...kept.map((x) => ({ name: x.file, data: this.blobs.get(x.seq)! })),
    ];
    return zipBlob(entries);
  }

  /** For the hook: a snapshot's JPEG as base64 (drivers write it to disk). */
  async snapshotData(seq: number): Promise<string | null> {
    const blob = this.blobs.get(seq);
    if (!blob) return null;
    return base64(new Uint8Array(await blob.arrayBuffer()));
  }
  /** Releases snapshots a driver has written (it never needs them again). */
  release(upTo: number): void { for (const k of [...this.blobs.keys()]) if (k <= upTo) { this.blobs.delete(k); this.snapState.delete(k); } }

  /** Off (R1-F8): nothing new is admitted from now; what is already encoding
   * or being written is finished (R2-3), and the recording stays exportable. */
  stop(why = "recording turned off"): void {
    if (this.stopped || this.disposed) return;
    this.recorder.event("session", why, { snapshot: false });
    this.setVideo(false, why);
    this.stopped = true;
    this.abort.abort();
    this.restoreConsole?.();
    this.finished = this.finish();
  }
  private async finish(): Promise<void> {
    await this.settleInflight(SNAPSHOT_TIMEOUT_MS);
    this.flush(performance.now(), true, true);
    await this.settleInflight(SNAPSHOT_TIMEOUT_MS);
    this.putHeader();
  }

  /** A superseded recording (R2-5): once it is finished and no export is
   * reading it, its worker and file handles are closed. */
  async retire(): Promise<void> {
    this.stop();
    await this.finished;
    await this.exporting;
    await this.settleInflight(REQUEST_TIMEOUT_MS);
    this.disposed = true;
    const s = this.spool;
    this.spool = null;
    for (const resolve of s?.waiters.values() ?? []) resolve({ error: "retired" });
    s?.worker.terminate();
  }
  dispose(): void { void this.retire(); }
}

const round = (v: number): number => Math.round(v * 10) / 10;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
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
