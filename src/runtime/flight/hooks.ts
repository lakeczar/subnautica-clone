/** REC-1 test hook: one typed, versioned surface for test drivers, soaks and
 * evidence runs, in place of ad hoc DOM attributes (`dataset.tick` and the
 * rest). Read-only for the game, apart from `freeze` (fixed-view captures)
 * and `recorder.mark` (a driver's own event on the recording).
 *
 *   window.__siltwake.read()                → HookRead | null (no expedition)
 *   window.__siltwake.scene()               → RendererStats | null
 *   window.__siltwake.freeze(true|false)    → holds the simulation clock; rendering carries on
 *   window.__siltwake.recorder?.frames(cursor, max) → { next, lost, columns, rows }
 *   …samples / events / snapshots(cursor, max) → { next, lost, items }
 *   …snapshot(seq) → base64 JPEG | null;  release(seq) frees snapshots up to seq
 *   …mark(text, detail?) → event seq;  header(); overhead()
 * Cursors start at 0; each consumer keeps its own, so readers never take data
 * from one another. `lost` counts entries overwritten before they were read. */
import type { RendererStats } from "../../render/renderer.js";
import type { FlightCapture } from "./capture.js";
import { FRAME_COLUMNS } from "./recorder.js";

export const TEST_HOOK_VERSION = 1;

export interface HookRead {
  tick: number;
  /** Opening phase (4: play). */
  phase: number;
  mode: string;
  /** Play advancing: not paused, no menu or panel, graphics available. */
  active: boolean;
  /** The simulation clock is held by `freeze`. */
  frozen: boolean;
  /** The renderer's world around the view is settled and drawn. */
  ready: boolean;
  /** A jump is settling (dark frames, clock paused). */
  settling: boolean;
  /** Camera position, metres. */
  camera: [number, number, number];
  /** The player's feet. */
  feet: [number, number, number];
  /** Degrees: bearing clockwise from north (-Z), pitch up positive (the HUD's). */
  yaw: number;
  pitch: number;
  depth: number;
  region: string | null;
  cave: string | null;
  /** Cave admission (CaveHold.state), or null when not evaluated. */
  hold: string | null;
  vitals: { health: number; oxygen: number; food: number };
  speed: number;
  craft: { id: string; hull: string; charge: number; health: number; disabled: boolean } | null;
  lamp: boolean;
}

export interface HookSource {
  read(): HookRead | null;
  stats(): RendererStats | null;
  freeze(on: boolean): void;
  capture(): FlightCapture | null;
}

export interface SiltwakeTestHook {
  version: number;
  read(): HookRead | null;
  scene(): RendererStats | null;
  freeze(on: boolean): boolean;
  readonly recorder: ReturnType<typeof recorderHook> | null;
}

function recorderHook(c: FlightCapture) {
  const r = c.recorder;
  return {
    mode: c.mode,
    header: () => c.header,
    frames: (cursor = 0, max = 20000) => ({ columns: FRAME_COLUMNS, ...r.frames.since(cursor, max) }),
    samples: (cursor = 0, max = 5000) => r.samples.since(cursor, max),
    events: (cursor = 0, max = 5000) => r.events.since(cursor, max),
    snapshots: (cursor = 0, max = 500) => r.snapshots.since(cursor, max),
    snapshot: (seq: number) => c.snapshotData(seq),
    release: (upTo: number) => c.release(upTo),
    mark: (text: string, detail?: Record<string, unknown>) => r.event("mark", String(text), detail ? { detail } : {}),
    overhead: () => r.overhead(),
  };
}

export function installTestHook(src: HookSource): () => void {
  const hook: SiltwakeTestHook = {
    version: TEST_HOOK_VERSION,
    read: () => src.read(),
    scene: () => src.stats(),
    freeze: (on) => { src.freeze(Boolean(on)); return Boolean(on); },
    get recorder() { const c = src.capture(); return c ? recorderHook(c) : null; },
  };
  (globalThis as { __siltwake?: SiltwakeTestHook }).__siltwake = hook;
  return () => { if ((globalThis as { __siltwake?: SiltwakeTestHook }).__siltwake === hook) delete (globalThis as { __siltwake?: SiltwakeTestHook }).__siltwake; };
}
