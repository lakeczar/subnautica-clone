/** Continuous layers: one fixed set of nodes per layer, retargeted each frame.
 * Region and hull changes build a new slot and crossfade; the old one is
 * disposed after its fade, so node count stays bounded. */
import type { AmbienceProfile, HullLayer } from "./profiles.js";
import { BOBBIN_LAYER, DEPTH_LAYER, INTERIOR_BED, REFUGE_BED, THREAT_LAYER } from "./profiles.js";
import type { AudioScene } from "./scene.js";
import { dbToGain, type NoiseBank } from "./synth.js";

const TAU_FAST = 0.08, TAU = 0.4;
/** Noise buffers have RMS 0.25; this brings them to unit RMS before filtering. */
const UNIT = 4;
const set = (p: AudioParam, v: number, now: number, tau = TAU): void => { p.setTargetAtTime(v, now, tau); };

abstract class Layer {
  protected readonly nodes: AudioNode[] = [];
  protected readonly sources: AudioScheduledSourceNode[] = [];
  constructor(protected readonly ctx: BaseAudioContext) {}
  get nodeCount(): number { return this.nodes.length; }
  protected osc(type: OscillatorType, hz: number, now: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = hz; o.start(now);
    this.nodes.push(o); this.sources.push(o);
    return o;
  }
  protected loop(bank: NoiseBank, color: "white" | "pink" | "brown", now: number, offset: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = bank.get(color); s.loop = true; s.start(now, offset);
    this.nodes.push(s); this.sources.push(s);
    return s;
  }
  protected gain(value = 0): GainNode {
    const g = this.ctx.createGain(); g.gain.value = value; this.nodes.push(g); return g;
  }
  protected filter(type: BiquadFilterType, hz: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; this.nodes.push(f); return f;
  }
  protected panner(): StereoPannerNode { const p = this.ctx.createStereoPanner(); this.nodes.push(p); return p; }
  dispose(): void {
    for (const s of this.sources) try { s.stop(); } catch { /* not started or already stopped */ }
    for (const n of this.nodes) try { n.disconnect(); } catch { /* already disconnected */ }
    this.nodes.length = 0; this.sources.length = 0;
  }
}

/** One region's (or the surface's) bed, drones and swell, behind a crossfade gain. */
export class AmbienceSlot extends Layer {
  readonly fade: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly level: GainNode;
  private readonly send: GainNode;
  constructor(ctx: BaseAudioContext, readonly profile: AmbienceProfile, readonly key: string, out: AudioNode, reverb: AudioNode, bank: NoiseBank, offset: number, now: number) {
    super(ctx);
    const p = profile;
    this.fade = this.gain(0);
    this.level = this.gain(1);
    this.send = this.gain(p.wet);
    const bed = this.loop(bank, p.bed.color, now, offset);
    this.lp = this.filter("lowpass", p.bed.cutoff);
    const swell = this.gain(1 - p.swell.depth / 2), lfo = this.osc("sine", p.swell.rate, now), lfoDepth = this.gain(p.swell.depth / 2);
    const bedLevel = this.gain(dbToGain(p.bed.level) * UNIT);
    bed.connect(this.lp); this.lp.connect(swell); lfo.connect(lfoDepth); lfoDepth.connect(swell.gain);
    swell.connect(bedLevel); bedLevel.connect(this.level);
    if (p.drone.hz.length) {
      const drone = this.gain(dbToGain(p.drone.level) / p.drone.hz.length);
      for (const hz of p.drone.hz) this.osc(p.drone.wave, hz, now).connect(drone);
      drone.connect(this.level);
    }
    this.level.connect(this.fade);
    this.fade.connect(out);
    this.fade.connect(this.send);
    this.send.connect(reverb);
    set(this.fade.gain, 1, now, 0.8);
  }
  /** depth: metres; shelter muffles and lowers what is heard through a hull. */
  update(scene: AudioScene, now: number): void {
    const close = 1 - (1 - DEPTH_LAYER.closeBedTo) * Math.min(1, Math.max(0, scene.depth) / 780);
    const sheltered = scene.shelter !== "open";
    set(this.lp.frequency, Math.min(this.profile.bed.cutoff * close, sheltered ? REFUGE_BED.outsideCutoff : 20000), now);
    set(this.level.gain, sheltered ? REFUGE_BED.outsideDuck : 1, now, 0.6);
  }
  fadeOut(now: number, seconds = 2.5): number {
    this.fade.gain.cancelScheduledValues(now);
    this.fade.gain.setValueAtTime(this.fade.gain.value, now);
    this.fade.gain.linearRampToValueAtTime(0, now + seconds);
    return now + seconds + 0.05;
  }
}

/** Pressure rumble that grows with depth, independent of region. */
export class DepthLayer extends Layer {
  private readonly out: GainNode;
  constructor(ctx: BaseAudioContext, dest: AudioNode, bank: NoiseBank, now: number) {
    super(ctx);
    const src = this.loop(bank, "brown", now, 1.3), lp = this.filter("lowpass", DEPTH_LAYER.cutoff);
    this.out = this.gain(0);
    src.connect(lp); lp.connect(this.out); this.out.connect(dest);
  }
  update(scene: AudioScene, now: number): void {
    const x = scene.active ? Math.min(1, Math.max(0, scene.depth) / 780) : 0;
    set(this.out.gain, x <= 0.02 ? 0 : dbToGain(DEPTH_LAYER.levelAt780) * x * (scene.shelter === "open" ? 1 : 0.4), now, 1);
  }
}

/** Warm refuge chord and ventilation; interiors add a room hum. */
export class RefugeBed extends Layer {
  private readonly bed: GainNode;
  private readonly chord: GainNode;
  private readonly vent: GainNode;
  private readonly hum: GainNode;
  constructor(ctx: BaseAudioContext, dest: AudioNode, reverb: AudioNode, bank: NoiseBank, now: number) {
    super(ctx);
    this.bed = this.gain(0);
    this.chord = this.gain(0);
    const lp = this.filter("lowpass", 1200), trem = this.gain(0.8), lfo = this.osc("sine", REFUGE_BED.tremolo, now), depth = this.gain(0.2);
    for (const hz of REFUGE_BED.chord) this.osc("triangle", hz, now).connect(lp);
    lp.connect(trem); lfo.connect(depth); depth.connect(trem.gain); trem.connect(this.chord); this.chord.connect(this.bed);
    const air = this.loop(bank, "pink", now, 0.7), vlp = this.filter("lowpass", REFUGE_BED.vent.cutoff);
    this.vent = this.gain(0);
    air.connect(vlp); vlp.connect(this.vent); this.vent.connect(this.bed);
    this.hum = this.gain(0);
    for (const hz of INTERIOR_BED.hum) this.osc("sine", hz, now).connect(this.hum);
    this.hum.connect(this.bed);
    const send = this.gain(0.2);
    this.bed.connect(dest); this.bed.connect(send); send.connect(reverb);
  }
  update(scene: AudioScene, now: number): void {
    const on = scene.active && scene.shelter !== "open", interior = scene.shelter === "interior";
    const b = interior ? INTERIOR_BED : REFUGE_BED;
    set(this.bed.gain, on ? 1 : 0, now, on ? 1.2 : 0.5);
    set(this.chord.gain, dbToGain(b.level) / REFUGE_BED.chord.length, now);
    set(this.vent.gain, dbToGain(b.vent.level) * UNIT, now);
    set(this.hum.gain, interior ? dbToGain(INTERIOR_BED.humLevel) / 2 : 0, now);
  }
}

/** One hull's engine: motor, wash, hum, flutter and optional boost whine. */
export class HullSlot extends Layer {
  readonly fade: GainNode;
  private readonly motor: OscillatorNode;
  private readonly motorGain: GainNode;
  private readonly wash: BiquadFilterNode;
  private readonly washGain: GainNode;
  private readonly humGain: GainNode;
  private readonly whine: OscillatorNode | null = null;
  private readonly whineGain: GainNode | null = null;
  constructor(ctx: BaseAudioContext, readonly layer: HullLayer, readonly key: string, dest: AudioNode, bank: NoiseBank, offset: number, now: number) {
    super(ctx);
    const L = layer;
    this.fade = this.gain(0);
    this.motor = this.osc(L.motor.wave, L.motor.idle, now);
    const lp = this.filter("lowpass", L.motor.lowpass);
    const flutter = this.gain(1 - L.flutter.depth / 2);
    this.motorGain = this.gain(0);
    this.motor.connect(lp); lp.connect(flutter); flutter.connect(this.motorGain); this.motorGain.connect(this.fade);
    if (L.flutter.rate > 0) {
      const lfo = this.osc("sine", L.flutter.rate, now), d = this.gain(L.flutter.depth / 2);
      lfo.connect(d); d.connect(flutter.gain);
    }
    const water = this.loop(bank, "pink", now, offset);
    this.wash = this.filter("bandpass", L.wash.idle, L.wash.q);
    this.washGain = this.gain(0);
    water.connect(this.wash); this.wash.connect(this.washGain); this.washGain.connect(this.fade);
    this.humGain = this.gain(0);
    this.osc("sine", L.hum.hz, now).connect(this.humGain); this.humGain.connect(this.fade);
    if (L.boostWhine) {
      this.whine = this.osc("sawtooth", L.boostWhine.from, now);
      const bp = this.filter("bandpass", L.boostWhine.from * 1.5, 4);
      this.whineGain = this.gain(0);
      this.whine.connect(bp); bp.connect(this.whineGain); this.whineGain.connect(this.fade);
    }
    this.fade.connect(dest);
    set(this.fade.gain, 1, now, 0.25);
  }
  update(scene: AudioScene, now: number): void {
    const L = this.layer, th = scene.disabled ? 0 : scene.throttle, sag = scene.power < 0.25 ? 0.94 : 1;
    const live = scene.active && !scene.disabled && scene.power > 0;
    // Boost lifts the motor and doubles the wash on top of its own whine.
    const lift = live && L.boost ? scene.boost : 0;
    set(this.motor.frequency, (L.motor.idle + (L.motor.full - L.motor.idle) * th) * sag * (1 + 0.15 * lift), now, TAU_FAST * 2);
    set(this.motorGain.gain, live ? dbToGain(L.motor.level - 8 * (1 - th)) * (sag < 1 ? 0.7 : 1) : 0, now, 0.15);
    set(this.wash.frequency, L.wash.idle + (L.wash.full - L.wash.idle) * th, now, 0.2);
    set(this.washGain.gain, scene.active ? dbToGain(L.wash.level) * UNIT * Math.max(0.12, th ** 1.5) * (1 + lift) : 0, now, 0.2);
    set(this.humGain.gain, live ? dbToGain(L.hum.level) : 0, now, 0.3);
    if (this.whine && this.whineGain && L.boostWhine) {
      const b = live ? scene.boost : 0;
      set(this.whine.frequency, L.boostWhine.from + (L.boostWhine.to - L.boostWhine.from) * b, now, 0.15);
      set(this.whineGain.gain, b > 0.02 ? dbToGain(L.boostWhine.level) * b : 0, now, 0.12);
    }
  }
  fadeOut(now: number, seconds = 0.6): number {
    this.fade.gain.cancelScheduledValues(now);
    this.fade.gain.setValueAtTime(this.fade.gain.value, now);
    this.fade.gain.linearRampToValueAtTime(0, now + seconds);
    return now + seconds + 0.05;
  }
}

/** Encounter tension: a slow double pulse plus breathing at the hunter's bearing. */
export class ThreatLayer extends Layer {
  private readonly pulse: GainNode;
  private readonly presence: GainNode;
  private readonly pan: StereoPannerNode;
  private nextBeat = 0;
  constructor(ctx: BaseAudioContext, dest: AudioNode, bank: NoiseBank, now: number) {
    super(ctx);
    const o = this.osc("sine", THREAT_LAYER.pulse.hz, now);
    this.pulse = this.gain(0);
    o.connect(this.pulse); this.pulse.connect(dest);
    const breath = this.loop(bank, "brown", now, 2.1), bp = this.filter("bandpass", THREAT_LAYER.presence.cutoff, THREAT_LAYER.presence.q);
    this.pan = this.panner();
    this.presence = this.gain(0);
    breath.connect(bp); bp.connect(this.pan); this.pan.connect(this.presence); this.presence.connect(dest);
  }
  update(scene: AudioScene, listeningDb: number, now: number): void {
    const t = scene.threat, mode = scene.active ? t.mode : "idle";
    const tense = mode === "warn" || mode === "investigate" || mode === "pursue";
    const bpm = mode === "pursue" ? THREAT_LAYER.pulse.bpmPursue : mode === "investigate" ? (THREAT_LAYER.pulse.bpmIdle + THREAT_LAYER.pulse.bpmPursue) / 2 : THREAT_LAYER.pulse.bpmIdle;
    const peak = dbToGain(THREAT_LAYER.pulse.level - (mode === "warn" ? 6 : mode === "investigate" ? 3 : 0));
    if (!tense) this.nextBeat = 0;
    else {
      if (this.nextBeat < now) this.nextBeat = now + 0.05;
      // Schedule only a short horizon; retargeting stays responsive to mode changes.
      while (this.nextBeat < now + 0.25) {
        const b = this.nextBeat, g = this.pulse.gain;
        for (const [at, k] of [[0, 1], [0.22, 0.6]] as const) {
          g.setValueAtTime(0, b + at);
          g.linearRampToValueAtTime(peak * k, b + at + 0.02);
          g.exponentialRampToValueAtTime(0.0001, b + at + 0.18);
        }
        this.nextBeat += 60 / bpm;
      }
    }
    const near = Math.max(0, 1 - t.distance / THREAT_LAYER.presence.audibleWithin);
    set(this.pan.pan, t.pan, now, 0.15);
    set(this.presence.gain, tense && near > 0 ? dbToGain(THREAT_LAYER.presence.level + listeningDb) * UNIT * near : 0, now, 0.3);
  }
}

/** Bobbin's reel whine while a rescue tow is under way. */
export class BobbinLayer extends Layer {
  private readonly out: GainNode;
  constructor(ctx: BaseAudioContext, dest: AudioNode, now: number) {
    super(ctx);
    this.out = this.gain(0);
    const whine = this.osc("sine", BOBBIN_LAYER.whine.from, now), wg = this.gain(dbToGain(BOBBIN_LAYER.whine.level));
    const wobble = this.osc("sine", 0.35, now), wd = this.gain((BOBBIN_LAYER.whine.to - BOBBIN_LAYER.whine.from) / 2);
    wobble.connect(wd); wd.connect(whine.frequency);
    whine.connect(wg); wg.connect(this.out);
    const motor = this.osc("triangle", BOBBIN_LAYER.motor.hz, now), mg = this.gain(dbToGain(BOBBIN_LAYER.motor.level));
    motor.connect(mg); mg.connect(this.out);
    this.out.connect(dest);
  }
  update(scene: AudioScene, now: number): void { set(this.out.gain, scene.active && scene.tow ? 1 : 0, now, 0.3); }
}
