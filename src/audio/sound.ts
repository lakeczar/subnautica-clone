import type { GameState, GameEvent } from "../sim/types.js";
import { exposure } from "../sim/survival.js";
export interface AudioSettings {
  volume: number;
  muted: boolean;
  subtitles: boolean;
}
/** Original local oscillators and deterministic noise. No network audio or autoplay. */
export class Soundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: OscillatorNode | null = null;
  private bedGain: GainNode | null = null;
  settings: AudioSettings = { volume: 0.55, muted: false, subtitles: true };
  activate(): void {
    if (typeof AudioContext === "undefined") return;
    if (!this.context) {
      const c = (this.context = new AudioContext());
      this.master = c.createGain();
      this.master.connect(c.destination);
      this.bed = c.createOscillator();
      this.bed.type = "sine";
      this.bed.frequency.value = 74;
      this.bedGain = c.createGain();
      this.bedGain.gain.value = 0;
      this.bed.connect(this.bedGain);
      this.bedGain.connect(this.master);
      this.bed.start();
    }
    void this.context.resume().catch(() => {});
  }
  update(s: GameState | null, active: boolean): void {
    const c = this.context;
    if (!c || !this.master || !this.bedGain || !this.bed) return;
    this.master.gain.setTargetAtTime(
      this.settings.muted ? 0 : this.settings.volume,
      c.currentTime,
      0.08,
    );
    const refuge = s ? exposure(s).refuge : false;
    this.bed.frequency.setTargetAtTime(refuge ? 110 : 58, c.currentTime, 0.7);
    this.bedGain.gain.setTargetAtTime(
      active ? (refuge ? 0.018 : 0.012) : 0,
      c.currentTime,
      0.15,
    );
  }
  event(e: GameEvent, s: GameState | null): void {
    if (e.type !== "sound" || !this.context || !this.master) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain(),
      pan = c.createStereoPanner();
    const notes = {
      collect: 520,
      craft: 330,
      warning: 145,
      refuge: 220,
      damage: 65,
      scan: 700,
      opening: 90,
      recovery: 196,
    };
    o.frequency.value = notes[e.cue];
    o.type =
      e.cue === "damage"
        ? "sawtooth"
        : e.cue === "warning"
          ? "triangle"
          : "sine";
    if (e.cue === "warning" && s) {
      const p = s.player.pose,
        t = s.world.threat.position;
      pan.pan.value = Math.max(
        -1,
        Math.min(
          1,
          ((t.x - p.position.x) * Math.cos(p.yaw) +
            (t.z - p.position.z) * Math.sin(p.yaw)) /
            30,
        ),
      );
    }
    const duration = e.cue === "warning" ? 0.65 : 0.24;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(
      e.cue === "damage" ? 0.035 : 0.06,
      c.currentTime + 0.02,
    );
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(g);
    g.connect(pan);
    pan.connect(this.master);
    o.start();
    o.stop(c.currentTime + duration);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
      pan.disconnect();
    };
  }
  dispose(): void {
    this.bed?.stop();
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
