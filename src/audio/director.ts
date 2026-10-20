/** SiltwakeAudio: the S6 replacement for `Soundscape`, with the same lifecycle
 * surface so app.ts swaps one import. Owns the live AudioContext; everything
 * it plays goes through the pure mapper and the engine. */
import { worldRegionAt } from "../render/regions.js";
import type { GameEvent, GameState } from "../sim/types.js";
import { CaptionGate, type Caption } from "./captions.js";
import { AudioEngine, type EngineStats } from "./engine.js";
import { CueMapper, type CueRequest, type Moment } from "./mapping.js";
import { sceneFromState, type AudioScene, type RegionResolver } from "./scene.js";

export interface AudioSettings {
  volume: number;
  muted: boolean;
  subtitles: boolean;
}
export interface AudioOptions {
  /** Region at a world position. Defaults to today's render-region bounds; S1's
   * spatial query replaces it once the full world is composed. */
  regionAt?: RegionResolver;
  /** Visual equivalent of each captioned cue, emitted even when muted. */
  onCaption?: (caption: Caption) => void;
  /** Injected for tests; defaults to `new AudioContext()` when available. */
  createContext?: () => AudioContext | null;
  /** Seconds, for caption and homecoming timing before a context exists. */
  clock?: () => number;
  seed?: number;
}

const defaultContext = (): AudioContext | null => typeof AudioContext === "undefined" ? null : new AudioContext();

export class SiltwakeAudio {
  settings: AudioSettings = { volume: 0.55, muted: false, subtitles: true };
  private context: AudioContext | null = null;
  private engine: AudioEngine | null = null;
  private disposed = false;
  private readonly mapper = new CueMapper();
  private readonly captions = new CaptionGate();
  private readonly regionAt: RegionResolver;
  private readonly clock: () => number;
  private scene: AudioScene;

  constructor(private readonly options: AudioOptions = {}) {
    this.regionAt = options.regionAt ?? worldRegionAt;
    this.clock = options.clock ?? (() => performance.now() / 1000);
    this.scene = sceneFromState(null, false, this.regionAt);
  }

  /** Call from a deliberate user gesture. Creates the context once, then resumes it. */
  activate(): void {
    if (this.disposed) return;
    if (!this.context) {
      const c = (this.options.createContext ?? defaultContext)();
      if (!c) return;
      this.context = c;
      this.engine = new AudioEngine(c, this.options.seed);
      this.engine.setVolume(this.gain());
    }
    if (this.context.state !== "running") void this.context.resume().catch(() => {});
  }

  /** Once per frame, after the step's events. Inactive (paused, menu, panel)
   * updates still observe state, so nothing replays on resume, but drop the
   * state-derived cues they would start: pause stays silent. Deliberate
   * panel-action feedback arrives through events(), not here. */
  update(s: GameState | null, active: boolean): void {
    if (this.disposed) return;
    this.scene = sceneFromState(s, active, this.regionAt, this.scene.region);
    const derived = this.mapper.observe(s, this.scene, this.clock());
    this.engine?.setVolume(this.gain());
    this.engine?.update(this.scene);
    if (active) for (const r of derived) this.play(r);
  }

  /** One simulation event. Pass every event of a batch in order. */
  event(e: GameEvent, s: GameState | null): void {
    if (this.disposed) return;
    this.listen(s);
    for (const r of this.mapper.event(e, s, this.scene)) this.play(r);
  }

  /** A whole step batch (preferred): duplicate injury events collapse into one
   * hit that keeps the batch's emission origin. */
  events(batch: readonly GameEvent[], s: GameState | null): void {
    if (this.disposed) return;
    this.listen(s);
    for (const r of this.mapper.events(batch, s, this.scene)) this.play(r);
  }

  /** Pan against the listener at emission, not the previous frame. */
  private listen(s: GameState | null): void {
    if (s) this.scene = sceneFromState(s, this.scene.active, this.regionAt, this.scene.region);
  }

  /** Story-owned moments without a simulation event, e.g. the ending. */
  moment(m: Moment): void {
    if (!this.disposed) this.play(this.mapper.moment(m));
  }

  /** New/Continue/import: forget mapped history so a loaded save does not replay it. */
  reset(): void {
    this.mapper.reset();
    this.captions.reset();
    this.engine?.reset();
  }

  stats(): EngineStats | null { return this.engine?.stats() ?? null; }

  private gain(): number {
    const v = this.settings.volume;
    return this.settings.muted ? 0 : Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  }

  private play(r: CueRequest): void {
    const caption = this.captions.caption(r, this.clock());
    if (caption) this.options.onCaption?.(caption);
    if (!this.engine || this.gain() <= 0) return;
    this.engine.setVolume(this.gain());
    this.engine.play(r);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.engine?.dispose();
    this.engine = null;
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
