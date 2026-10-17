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
  private noise: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private warmth: OscillatorNode | null = null;
  private warmthGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private disposed = false;
  private wasActive = false;
  private readonly voices = new Set<{ key: string; priority: number; stop(): void }>();
  private readonly lastCue = new Map<string, number>();
  settings: AudioSettings = { volume: 0.55, muted: false, subtitles: true };
  activate(): void {
    if (this.disposed || typeof AudioContext === "undefined") return;
    if (!this.context) {
      const c = (this.context = new AudioContext());
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.master.connect(c.destination);
      this.bed = c.createOscillator();
      this.bed.type = "sine";
      this.bed.frequency.value = 74;
      this.bedGain = c.createGain();
      this.bedGain.gain.value = 0;
      this.bed.connect(this.bedGain);
      this.bedGain.connect(this.master);
      this.bed.start();
      // Original deterministic filtered water texture. Generated locally once,
      // then looped; sanctuary brings in a quiet fifth above the service hum.
      const buffer = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
      const channel = buffer.getChannelData(0);
      let seed = 8317, smooth = 0;
      for (let i = 0; i < channel.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        smooth = smooth * 0.97 + ((seed / 4294967296) * 2 - 1) * 0.03;
        channel[i] = smooth;
      }
      this.noise = c.createBufferSource();
      this.noise.buffer = buffer;
      this.noise.loop = true;
      const filter = this.filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 460;
      this.noiseGain = c.createGain();
      this.noiseGain.gain.value = 0;
      this.noise.connect(filter);
      filter.connect(this.noiseGain);
      this.noiseGain.connect(this.master);
      this.noise.start();
      this.warmth = c.createOscillator();
      this.warmth.frequency.value = 165;
      this.warmthGain = c.createGain();
      this.warmthGain.gain.value = 0;
      this.warmth.connect(this.warmthGain);
      this.warmthGain.connect(this.master);
      this.warmth.start();
    }
    if (this.context.state !== "running") void this.context.resume().catch(() => {});
  }
  private volume(): void {
    const c = this.context;
    if (!c || !this.master) return;
    this.master.gain.setTargetAtTime(
      this.settings.muted ? 0 : Math.max(0, Math.min(1, Number.isFinite(this.settings.volume) ? this.settings.volume : 0)),
      c.currentTime, 0.025,
    );
  }
  update(s: GameState | null, active: boolean): void {
    const c = this.context;
    if (!c || !this.master || !this.bedGain || !this.bed) return;
    if (this.wasActive && !active) for (const voice of [...this.voices]) voice.stop();
    this.wasActive = active;
    this.volume();
    const refuge = s ? exposure(s).refuge : false;
    const underwater = s ? s.player.pose.position.y < -0.85 : false;
    const duck = [...this.voices].some((v) => v.priority > 1) ? 0.35 : 1;
    this.bed.frequency.setTargetAtTime(refuge ? 110 : 58, c.currentTime, 0.7);
    this.bedGain.gain.setTargetAtTime(
      active ? (refuge ? 0.018 : 0.012) * duck : 0,
      c.currentTime,
      0.15,
    );
    this.noiseGain?.gain.setTargetAtTime(active ? (refuge ? 0.04 : underwater ? 0.19 : 0.08) * duck : 0, c.currentTime, 0.2);
    this.warmthGain?.gain.setTargetAtTime(active && refuge ? 0.012 * duck : 0, c.currentTime, 0.3);
  }
  event(e: GameEvent, s: GameState | null): void {
    if (e.type !== "sound" || !this.context || !this.master) return;
    const c = this.context;
    this.volume();
    if (this.settings.muted || this.settings.volume <= 0) return;
    const key = `${e.cue}/${e.origin ? "spatial" : "centred"}`;
    const priority = e.cue === "recovery" ? 4 : e.cue === "damage" ? 3 : e.cue === "warning" ? 2 : 1;
    // Collapse simultaneous body alarms and repeated calls without inventing a
    // spatial origin. A body alarm and a real threat can still sound together.
    if (c.currentTime - (this.lastCue.get(key) ?? -Infinity) < (e.cue === "warning" ? 1.2 : 0.09)) return;
    if (priority === 1 && [...this.voices].some((v) => v.priority > 1)) return;
    for (const voice of [...this.voices])
      if (voice.key === key || voice.priority < priority) voice.stop();
    if (this.voices.size >= 4) return;
    this.lastCue.set(key, c.currentTime);
    const
      o = c.createOscillator(),
      g = c.createGain(),
      pan = c.createStereoPanner();
    const notes = {
      collect: 520,
      craft: 330,
      warning: e.origin ? 145 : 280,
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
    pan.pan.value = 0;
    if (e.origin && s && [e.origin.x, e.origin.y, e.origin.z].every(Number.isFinite)) {
      const p = s.player.pose,
        t = e.origin;
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
    const duration = e.cue === "warning" ? 0.82 : 0.24;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(
      e.cue === "damage" ? 0.035 : 0.06,
      c.currentTime + 0.02,
    );
    if (e.cue === "warning") {
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
      g.gain.setValueAtTime(0.001, c.currentTime + 0.4);
      g.gain.linearRampToValueAtTime(0.045, c.currentTime + 0.44);
      o.frequency.setValueAtTime(e.origin ? 112 : 220, c.currentTime + 0.4);
    }
    if (e.cue === "craft" || e.cue === "recovery")
      o.frequency.setValueAtTime(notes[e.cue] * 1.5, c.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(g);
    g.connect(pan);
    pan.connect(this.master);
    const voice = { key, priority, stop: () => { o.stop(); release(); } };
    const release = (): void => {
      if (!this.voices.delete(voice)) return;
      o.disconnect();
      g.disconnect();
      pan.disconnect();
    };
    this.voices.add(voice);
    o.onended = release;
    o.start();
    o.stop(c.currentTime + duration);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const voice of [...this.voices]) voice.stop();
    this.bed?.stop();
    this.noise?.stop();
    this.warmth?.stop();
    for (const node of [this.bed, this.bedGain, this.noise, this.filter, this.noiseGain, this.warmth, this.warmthGain, this.master]) node?.disconnect();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.lastCue.clear();
  }
}
