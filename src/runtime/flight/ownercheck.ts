/** REC-1 R3b: the owner-PC check, in the game itself (`?rec=playtest&recmeasure=1&reccheck=SECONDS`).
 * On the owner's own browser and GPU, with the diver held still:
 * - the browser's video-encoder grid (isConfigSupported for the ladder's codecs, each preference, VBR and CBR);
 * - the encoder the recording actually chose (the export's summary names it too);
 * - a within-run A/B: the recorder paused and resumed in place every 10 s, on/off/off/on, each window's
 *   main-thread frame work measured in the page (the frame callback, with the recorder's frame work when
 *   on), as paired differences;
 * then one JSON file is downloaded. A page cannot read the media log: the owner copies
 * chrome://media-internals' kVideoEncoderName and kIsPlatformVideoEncoder by hand.
 * In-page frame work is not the inclusive main-thread task time the factory-worker A/B
 * measures (collection and other tasks between frames are outside it); it is labelled so. */
import { ENCODER_LADDER, encoderConfig, BITRATE_MODES } from "./encoders.js";

export const CHECK_WINDOW_S = 10;
const ORDER = [true, false, false, true];

export interface OwnerCheckWindow { on: boolean; frames: number; frameMs: number }

export class OwnerCheck {
  readonly windows: OwnerCheckWindow[] = [];
  private window: { on: boolean; start: number; frames: number; work: number } | null = null;
  private index = 0;
  private done = false;
  grid: unknown[] | null = null;

  constructor(private readonly seconds: number, private readonly pause: (on: boolean) => void, private readonly finish: (report: unknown) => void) {}

  /** The encoder grid, asked once at the start. */
  async askGrid(): Promise<void> {
    const rows: unknown[] = [];
    const ve = (globalThis as { VideoEncoder?: { isConfigSupported(c: unknown): Promise<{ supported?: boolean }> } }).VideoEncoder;
    if (!ve) { this.grid = [{ error: "no VideoEncoder" }]; return; }
    for (const r of ENCODER_LADDER) for (const [w, h] of [[1280, 720], [960, 540]] as const) for (const mode of BITRATE_MODES) {
      const row: Record<string, unknown> = { rung: r.key, codec: r.codec, size: `${w}x${h}`, bitrateMode: mode };
      for (const pref of ["prefer-hardware", "no-preference", "prefer-software"]) {
        try { row[pref] = (await ve.isConfigSupported({ ...encoderConfig(r, w, h, 900_000, 12, mode), hardwareAcceleration: pref })).supported === true; }
        catch (e) { row[pref] = `error: ${e instanceof Error ? e.message : String(e)}`; }
      }
      rows.push(row);
    }
    this.grid = rows;
  }

  /** Called once per frame with the frame's own duration (ms). */
  frame(now: number, frameMs: number): void {
    if (this.done) return;
    if (!this.window) { this.open(now); return; }
    this.window.frames++;
    this.window.work += frameMs;
    if (now - this.window.start < CHECK_WINDOW_S * 1000) return;
    const w = this.window;
    this.windows.push({ on: w.on, frames: w.frames, frameMs: +(w.work / Math.max(1, w.frames)).toFixed(4) });
    this.index++;
    if (this.index * CHECK_WINDOW_S >= this.seconds) { this.done = true; this.pause(false); this.finish(this.report()); return; }
    this.open(now);
  }
  private open(now: number): void {
    const on = ORDER[this.index % 4]!;
    this.pause(!on);
    this.window = { on, start: now, frames: 0, work: 0 };
  }
  /** On minus off, adjacent windows paired, with a paired t 95% interval. */
  report(): Record<string, unknown> {
    const d: number[] = [];
    for (let i = 0; i + 1 < this.windows.length; i += 2) {
      const a = this.windows[i]!, b = this.windows[i + 1]!;
      if (a.on !== b.on) { const on = a.on ? a : b, off = a.on ? b : a; d.push(on.frameMs - off.frameMs); }
    }
    const n = d.length, mean = n ? d.reduce((x, y) => x + y, 0) / n : null;
    const sd = n > 1 && mean !== null ? Math.sqrt(d.reduce((x, v) => x + (v - mean) ** 2, 0) / (n - 1)) : null;
    const t = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131][n - 1] ?? 2.05;
    const half = sd !== null ? (t * sd) / Math.sqrt(n) : null;
    return { measure: "in-page frame work per frame: the frame callback, with the recorder's frame work when on (contention slowing the game shows here); the recorder's later tasks (worker replies, about 0.03 ms/frame by self-time) and collections between frames are outside it: not the inclusive task time",
      pairs: n, diffs: d.map((x) => +x.toFixed(4)), meanMs: mean === null ? null : +mean.toFixed(4),
      ci95: half === null || mean === null ? null : [+(mean - half).toFixed(4), +(mean + half).toFixed(4)], windows: this.windows };
  }
}
