/** REC-1 flight recorder: what each frame cost, where the player was and what
 * happened, kept local. This module is DOM-free (tests run it in Node); the
 * browser half (`capture.ts`) adds snapshots, video, spooling and the test
 * hook. Every consumer (a test driver, the soak probe, the playtest spool)
 * reads through its own cursor, so none of them takes data from another.
 *
 * Costs: a frame row is a few typed-array writes; samples are taken a few
 * times a second; events are rare. The recorder times its own work into each
 * row's `rec` column so its overhead is always on the record. */

export const FLIGHT_FORMAT = "siltwake.flight";
export const FLIGHT_VERSION = 1;

/** One row per frame, in this order. Times are ms on the page clock. */
export const FRAME_COLUMNS = [
  "t", // rAF timestamp at the frame's start
  "gap", // rAF interval ending at this frame (the frame time a player sees)
  "work", // the game's own frame callback
  "sim", "steps", // fixed simulation steps (incl. autosave), and how many
  "chunks", "caves", "regions", "lights", // streaming: terrain, caves, legacy regions, the lights' scan of new meshes
  "actors", "render", "hud", "save", // creatures and hosts, scene.render, HUD update, autosave (inside sim)
  "rec", // the recorder's own time in this frame
  "heapDrop", // MiB the JS heap shrank since the previous frame (a collection), when the browser exposes it; -1 unknown
  "hold", // cave admission state, HOLD_CODES index
] as const;
export type FrameColumn = (typeof FRAME_COLUMNS)[number];
const COLS = FRAME_COLUMNS.length;
const COL = Object.fromEntries(FRAME_COLUMNS.map((c, i) => [c, i])) as Record<FrameColumn, number>;
/** The parts a frame is "streaming's" by (CW-1's rule, the soak's STREAMING_PARTS). */
export const STREAMING_PARTS = ["chunks", "caves", "regions", "lights"] as const;

/** Cave admission states (world/caves/admission.ts CaveHold.state, LC's biome
 * states). Index 0: admission was not evaluated this frame. */
export const HOLD_CODES = [null, "clear", "loading", "rescue", "refuge", "waiting", "away", "admitted"] as const;
export const HOLDING = new Set(["loading", "rescue", "refuge", "waiting"]);
export const holdCode = (state: string | null | undefined): number => {
  const i = HOLD_CODES.indexOf((state ?? null) as (typeof HOLD_CODES)[number]);
  return i < 0 ? 0 : i;
};

export type FrameInput = Partial<Record<Exclude<FrameColumn, "t" | "gap" | "hold">, number>> & {
  t: number; gap: number; hold?: string | null;
};

/** A few-times-a-second reading of the player and the renderer. */
export interface FlightSample {
  t: number;
  tick: number;
  /** Camera position, metres. */
  pos: [number, number, number];
  depth: number;
  region: string | null;
  cave: string | null;
  hold: string | null;
  oxygen: number | null;
  health: number | null;
  food: number | null;
  /** Controlled actor's speed, m/s. */
  speed: number;
  mode: string;
  craft: { id: string; hull: string; charge: number; health: number } | null;
  /** Play advancing (not paused, not in a menu). */
  active: boolean;
  draws?: number; triangles?: number; meshes?: number; textures?: number; materials?: number; geometries?: number;
  /** The renderer's own accounting of streamed world bytes (an estimate: browsers expose no VRAM figure). */
  residentCpuMiB?: number; residentGpuMiB?: number;
  /** performance.memory (Chrome only; coarse unless --enable-precise-memory-info). */
  heapMiB?: number; heapTotalMiB?: number;
  /** CW-1 unsliced cave builds so far (the safety net; any rise is on the attention list). */
  unsliced?: number;
  /** Frames presented since the previous sample. */
  frames?: number;
}

export type FlightEventKind =
  | "milestone" | "damage" | "threat" | "hold" | "load" | "save" | "refusal" | "error" | "warning"
  | "note" | "long-frame" | "long-task" | "action" | "mark" | "settle" | "notice" | "session";
export interface FlightEvent {
  seq: number;
  t: number;
  tick?: number;
  kind: FlightEventKind;
  /** One line a person can read. */
  text: string;
  detail?: Record<string, unknown>;
  /** The snapshot taken for it (seq of the snapshot), once captured. */
  snap?: number;
}
export interface SnapshotRequest { reasons: number[]; frameT: number }
export interface FlightSnapshot { seq: number; t: number; reasons: number[]; /** File name in the recording. */ file: string }

/** Which kinds take a snapshot by default: every event except the very frequent or the invisible. */
const NO_SNAPSHOT: ReadonlySet<FlightEventKind> = new Set(["action", "long-task", "session", "notice", "save"]);

export interface RecorderOptions {
  /** Frame rows kept for consumers that have not read them (a ring). */
  frameCapacity?: number;
  sampleCapacity?: number;
  eventCapacity?: number;
  /** A frame whose gap or work exceeds this is a long frame (event + snapshot). */
  longFrameMs?: number;
  /** Snapshots are at least this far apart; requests in between share one. */
  snapshotSpacingMs?: number;
  snapshots?: boolean;
}

/** A cursor-read ring of fixed-width numeric rows. */
class FrameRing {
  readonly data: Float32Array;
  /** Rows ever written; row n lives at n % capacity. `t` is kept as Float64 apart (it grows past Float32 precision). */
  written = 0;
  readonly times: Float64Array;
  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity * COLS);
    this.times = new Float64Array(capacity);
  }
  push(row: Float32Array, t: number): void {
    const at = this.written % this.capacity;
    this.data.set(row, at * COLS);
    this.times[at] = t;
    this.written++;
  }
  /** Rows from `cursor` on; `lost` rows were overwritten before this read. */
  since(cursor: number, max = Infinity): { next: number; lost: number; rows: number[][] } {
    const first = Math.max(cursor, this.written - this.capacity), end = Math.min(this.written, first + max);
    const rows: number[][] = [];
    for (let n = first; n < end; n++) {
      const at = n % this.capacity, row = Array.from(this.data.subarray(at * COLS, at * COLS + COLS), (v) => Math.round(v * 100) / 100);
      row[0] = Math.round(this.times[at]! * 100) / 100;
      rows.push(row);
    }
    return { next: end, lost: first - cursor, rows };
  }
}
/** A cursor-read ring of objects. */
class Ring<T> {
  private readonly items: (T | undefined)[];
  written = 0;
  constructor(readonly capacity: number) { this.items = new Array(capacity); }
  push(item: T): void { this.items[this.written++ % this.capacity] = item; }
  since(cursor: number, max = Infinity): { next: number; lost: number; items: T[] } {
    const first = Math.max(cursor, this.written - this.capacity), end = Math.min(this.written, first + max);
    const items: T[] = [];
    for (let n = first; n < end; n++) items.push(this.items[n % this.capacity]!);
    return { next: end, lost: first - cursor, items };
  }
  last(): T | undefined { return this.written ? this.items[(this.written - 1) % this.capacity] : undefined; }
}

export class FlightRecorder {
  readonly frames: FrameRing;
  readonly samples: Ring<FlightSample>;
  readonly events: Ring<FlightEvent>;
  readonly snapshots: Ring<FlightSnapshot>;
  readonly longFrameMs: number;
  readonly snapshotSpacingMs: number;
  snapshotsOn: boolean;
  /** Recorder self-time summed over every frame, and the worst frame's. */
  readonly self = { totalMs: 0, worstMs: 0, frames: 0 };
  private readonly row = new Float32Array(COLS);
  private eventSeq = 0;
  private snapSeq = 0;
  private pending: SnapshotRequest | null = null;
  private lastSnapshotT = -Infinity;
  private hold: string | null = null;
  private holdSince = 0;
  /** Self-time accrued in the current frame before its row is written (samples, snapshots). */
  private accrued = 0;

  constructor(opts: RecorderOptions = {}) {
    this.frames = new FrameRing(opts.frameCapacity ?? 1 << 16);
    this.samples = new Ring(opts.sampleCapacity ?? 1 << 13);
    this.events = new Ring(opts.eventCapacity ?? 1 << 14);
    this.snapshots = new Ring(opts.eventCapacity ?? 1 << 14);
    this.longFrameMs = opts.longFrameMs ?? 33;
    this.snapshotSpacingMs = opts.snapshotSpacingMs ?? 250;
    this.snapshotsOn = opts.snapshots ?? true;
  }

  /** Adds recorder self-time spent outside `frame()` (sampling, capture) to the current frame. */
  charge(ms: number): void { this.accrued += ms; }

  /** One frame's row. Detects long frames and hold transitions. `selfMs` is the
   * caller's own recording time in this frame (timing reads, stats). */
  frame(input: FrameInput, selfMs = 0): void {
    const r = this.row;
    r.fill(0);
    for (const [k, v] of Object.entries(input)) if (k !== "hold" && typeof v === "number") r[COL[k as FrameColumn]] = v;
    if (input.heapDrop === undefined) r[COL.heapDrop] = -1;
    const hold = input.hold ?? null;
    r[COL.hold] = holdCode(hold);
    const rec = selfMs + this.accrued;
    r[COL.rec] = rec;
    this.accrued = 0;
    this.self.totalMs += rec; this.self.frames++;
    if (rec > this.self.worstMs) this.self.worstMs = rec;
    this.frames.push(r, input.t);
    // Hold transitions (only frames where admission was evaluated).
    if (hold !== null) {
      const was = this.hold, holding = HOLDING.has(hold), wasHolding = was !== null && HOLDING.has(was);
      if (holding && hold !== was) {
        if (!wasHolding) this.holdSince = input.t;
        this.event("hold", `cave hold: ${hold}`, { t: input.t, detail: { state: hold } });
      } else if (!holding && wasHolding)
        this.event("hold", `cave hold ended after ${((input.t - this.holdSince) / 1000).toFixed(1)} s (${hold})`,
          { t: input.t, detail: { state: hold, ms: Math.round(input.t - this.holdSince) } });
      this.hold = hold;
    }
    const work = input.work ?? 0;
    if (input.gap > this.longFrameMs || work > this.longFrameMs) {
      const split: Record<string, number> = {};
      for (const c of ["work", "sim", "chunks", "caves", "regions", "lights", "actors", "render", "hud", "save"] as const) {
        const v = r[COL[c]]!;
        if (v >= 0.05) split[c] = Math.round(v * 100) / 100;
      }
      const streaming = STREAMING_PARTS.reduce((a, p) => a + r[COL[p]]!, 0);
      const cause = longFrameCause(input.gap, work, r[COL.sim]!, streaming, r[COL.render]!, r[COL.heapDrop]!);
      this.event("long-frame", `${input.gap.toFixed(1)} ms frame (${cause})`, {
        t: input.t, detail: { gap: Math.round(input.gap * 10) / 10, ...split, outside: Math.round(Math.max(0, input.gap - work) * 10) / 10, cause, ...(r[COL.heapDrop]! > 0 ? { heapDrop: r[COL.heapDrop] } : {}) },
      });
    }
  }

  sample(s: FlightSample): void { this.samples.push(s); }

  /** Records an event; asks for a snapshot unless its kind is exempt or `snapshot: false`. Returns its seq. */
  event(kind: FlightEventKind, text: string, opts: { t?: number; tick?: number; detail?: Record<string, unknown>; snapshot?: boolean } = {}): number {
    const e: FlightEvent = { seq: ++this.eventSeq, t: opts.t ?? (typeof performance !== "undefined" ? performance.now() : 0), kind, text: text.slice(0, 300),
      ...(opts.tick !== undefined ? { tick: opts.tick } : {}), ...(opts.detail ? { detail: opts.detail } : {}) };
    this.events.push(e);
    if (this.snapshotsOn && (opts.snapshot ?? !NO_SNAPSHOT.has(kind))) {
      if (this.pending) this.pending.reasons.push(e.seq);
      else this.pending = { reasons: [e.seq], frameT: e.t };
    }
    return e.seq;
  }

  /** The capture side asks after each render: take a snapshot now? Spaced so a
   * burst of events shares one picture (each event still names it). */
  wantSnapshot(now: number): SnapshotRequest | null {
    if (!this.pending || now - this.lastSnapshotT < this.snapshotSpacingMs) return null;
    const p = this.pending;
    this.pending = null;
    this.lastSnapshotT = now;
    return p;
  }
  /** A snapshot was captured for these events (the file is the capture side's). */
  snapshotTaken(req: SnapshotRequest, t: number, ext = "jpg"): FlightSnapshot {
    const seq = ++this.snapSeq;
    const snap: FlightSnapshot = { seq, t, reasons: req.reasons, file: `snapshots/${String(seq).padStart(5, "0")}.${ext}` };
    this.snapshots.push(snap);
    // Events still in the ring learn their picture.
    const from = Math.max(1, this.events.written - this.events.capacity + 1);
    for (const r of req.reasons) if (r >= from) { const e = this.events.since(r - 1, 1).items[0]; if (e?.seq === r) e.snap = seq; }
    return snap;
  }

  /** Mean and worst self-time per frame (ms). */
  overhead(): { meanMs: number; worstMs: number; frames: number } {
    return { meanMs: this.self.frames ? this.self.totalMs / this.self.frames : 0, worstMs: this.self.worstMs, frames: this.self.frames };
  }
}

/** Why a long frame was long, from its split (the same rule as CW-1 and the soak:
 * a part that is at least half of the frame's own work owns it). */
export function longFrameCause(gap: number, work: number, sim: number, streaming: number, render: number, heapDrop: number): string {
  if (work < 0.5 * gap) return heapDrop > 2 ? "outside the game's frame: a collection" : "outside the game's frame";
  if (streaming >= 0.5 * work) return "streaming";
  if (sim >= 0.5 * work) return "simulation";
  if (render >= 0.5 * work) return "render";
  return heapDrop > 2 ? "mixed, with a collection" : "mixed";
}

/** Rows (FRAME_COLUMNS order) → objects, for tools and the soak provider. */
export function frameObject(row: readonly number[]): Record<FrameColumn, number> & { holdState: string | null } {
  const o = Object.fromEntries(FRAME_COLUMNS.map((c, i) => [c, row[i]!])) as Record<FrameColumn, number>;
  return { ...o, holdState: HOLD_CODES[o.hold] ?? null };
}
