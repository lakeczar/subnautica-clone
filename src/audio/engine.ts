/** The S6 audio graph. Owns buses, the master limiter, continuous layers and
 * one-shot voices on any BaseAudioContext (live or offline). It never reads
 * GameState: it is driven by AudioScene and CueRequest values. */
import { CUES, cueDuration, type Bus, type CueId } from "./cues.js";
import { BobbinLayer, AmbienceSlot, DepthLayer, HullSlot, RefugeBed, ThreatLayer } from "./beds.js";
import type { CueRequest } from "./mapping.js";
import { duckLevels, PENDING_LIMIT, requestFor, VoiceAllocator, type Admission } from "./mixer.js";
import { HULL_LAYERS, REGION_AMBIENCE, SURFACE_AMBIENCE, type Detail } from "./profiles.js";
import type { AudioScene } from "./scene.js";
import { ceilingCurve, dbToGain, detailRecipe, disconnectAll, fadeOut, impulseResponse, NoiseBank, renderSound, rng, type Built } from "./synth.js";

const BUSES: readonly Bus[] = ["ambience", "vehicle", "sfx", "alert", "music"];
/** Deferred body alarms are dropped if they cannot sound within this window. */
const PENDING_SECONDS = 4;

export interface EngineStats {
  voices: number;
  bus: Record<Bus, number>;
  peakVoices: number;
  peakBus: Record<Bus, number>;
  started: number;
  merged: number;
  masked: number;
  full: number;
  deferred: number;
  stolen: number;
  pending: number;
  /** Nodes this engine currently holds, including continuous layers. */
  liveNodes: number;
  /** Of those, nodes held by sounding or fading one-shot voices. */
  voiceNodes: number;
  ambience: string | null;
  hull: string | null;
}

interface Retiring { dispose(): void; readonly nodeCount: number; at: number }

export class AudioEngine {
  private readonly bank: NoiseBank;
  private readonly random: () => number;
  private readonly buses = {} as Record<Bus, GainNode>;
  private readonly ducks = {} as Record<Bus, GainNode>;
  private readonly fixed: AudioNode[] = [];
  readonly volume: GainNode;
  private readonly reverb: GainNode;
  private readonly depth: DepthLayer;
  private readonly refuge: RefugeBed;
  private readonly threat: ThreatLayer;
  private readonly bobbin: BobbinLayer;
  private ambience: AmbienceSlot | null = null;
  private hull: HullSlot | null = null;
  private readonly retiring: Retiring[] = [];
  private readonly allocator = new VoiceAllocator();
  private readonly built = new Map<number, Built>();
  private readonly releasing: { b: Built; at: number }[] = [];
  private pending: { req: CueRequest; until: number }[] = [];
  private readonly nextDetail = new Map<Detail["kind"], number>();
  private scene: AudioScene | null = null;
  private wasActive = false;
  private disposed = false;

  constructor(readonly ctx: BaseAudioContext, seed = 20261019) {
    const now = ctx.currentTime;
    this.bank = new NoiseBank(ctx, seed);
    this.random = rng(seed ^ 0x5bd1e995);
    const mix = this.node(ctx.createGain());
    this.volume = this.node(ctx.createGain());
    this.volume.gain.value = 0;
    const limiter = this.node(ctx.createDynamicsCompressor());
    limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 12;
    limiter.attack.value = 0.003; limiter.release.value = 0.25;
    const ceiling = this.node(ctx.createWaveShaper());
    ceiling.curve = ceilingCurve();
    mix.connect(this.volume); this.volume.connect(limiter); limiter.connect(ceiling); ceiling.connect(ctx.destination);
    for (const b of BUSES) {
      const bus = this.buses[b] = this.node(ctx.createGain()), duck = this.ducks[b] = this.node(ctx.createGain());
      bus.connect(duck); duck.connect(mix);
    }
    this.reverb = this.node(ctx.createGain());
    const conv = this.node(ctx.createConvolver()), ret = this.node(ctx.createGain());
    conv.buffer = impulseResponse(ctx);
    ret.gain.value = 0.55;
    this.reverb.connect(conv); conv.connect(ret); ret.connect(mix);
    this.depth = new DepthLayer(ctx, this.buses.ambience, this.bank, now);
    this.refuge = new RefugeBed(ctx, this.buses.ambience, this.reverb, this.bank, now);
    this.threat = new ThreatLayer(ctx, this.buses.alert, this.bank, now);
    this.bobbin = new BobbinLayer(ctx, this.buses.vehicle, now);
  }

  private node<T extends AudioNode>(n: T): T { this.fixed.push(n); return n; }

  /** Linear master volume, already resolved from mute. */
  setVolume(v: number): void {
    if (this.disposed) return;
    this.volume.gain.setTargetAtTime(Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)), this.ctx.currentTime, 0.025);
  }

  /** Static bus trim, for measurement solos in the audio lab. */
  setBusTrim(bus: Bus, gain: number): void {
    if (!this.disposed) this.buses[bus].gain.value = gain;
  }

  update(scene: AudioScene): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    this.scene = scene;
    if (this.wasActive && !scene.active) this.silence();
    this.wasActive = scene.active;
    this.reap(now);
    const listening = scene.hull ? HULL_LAYERS[scene.hull].listening ?? 0 : 0;
    // Ambience: one slot per region or the surface, crossfaded on change.
    const key = scene.medium === "air" ? "surface" : scene.region;
    if (this.ambience?.key !== key) {
      if (this.ambience) this.retire(this.ambience, this.ambience.fadeOut(now));
      const profile = key === "surface" ? SURFACE_AMBIENCE : REGION_AMBIENCE[scene.region];
      this.ambience = new AmbienceSlot(this.ctx, profile, key, this.buses.ambience, this.reverb, this.bank, this.random() * 2.5, now);
      this.nextDetail.clear();
    }
    this.ambience.update(scene, now);
    this.depth.update(scene, now);
    this.refuge.update(scene, now);
    this.threat.update(scene, listening, now);
    this.bobbin.update(scene, now);
    // Vehicle: one slot for the controlled hull.
    if ((this.hull?.key ?? null) !== scene.hull) {
      if (this.hull) this.retire(this.hull, this.hull.fadeOut(now));
      this.hull = scene.hull ? new HullSlot(this.ctx, HULL_LAYERS[scene.hull], scene.hull, this.buses.vehicle, this.bank, this.random() * 2.5, now) : null;
    }
    this.hull?.update(scene, now);
    if (scene.active) this.details(scene, listening, now);
    // Retry deferred body alarms in arrival order.
    if (this.pending.length) {
      const waiting = this.pending;
      this.pending = [];
      for (const p of waiting) if (p.until > now) {
        const a = this.start(p.req, now);
        if (!a.play && a.reason === "deferred") this.pending.push(p);
      }
    }
    const d = duckLevels(this.allocator.voices, scene);
    if (!scene.active) { d.ambience = 0; d.vehicle = 0; }
    for (const b of BUSES) {
      const g = this.ducks[b].gain, target = d[b];
      g.setTargetAtTime(target, now, target < g.value ? 0.06 : 0.5);
    }
  }

  /** Start one cue. Muting is the caller's decision; this always tries to sound. */
  play(req: CueRequest): Admission {
    if (this.disposed) return { play: false, reason: "full" };
    const now = this.ctx.currentTime;
    this.reap(now);
    const a = this.start(req, now);
    if (!a.play && a.reason === "deferred" && this.pending.length < PENDING_LIMIT && !this.pending.some(p => p.req.cue === req.cue))
      this.pending.push({ req, until: now + PENDING_SECONDS });
    return a;
  }

  private start(req: CueRequest, now: number): Admission {
    const spec = CUES[req.cue];
    const a = this.allocator.admit(requestFor(req.cue, cueDuration(spec)), now);
    if (!a.play) return a;
    for (const v of a.steal) this.stop(v.id, now);
    const scene = this.scene;
    const listening = scene?.hull ? HULL_LAYERS[scene.hull].listening ?? 0 : 0;
    const intensityDb = (Math.max(0, Math.min(1, req.intensity)) - 1) * 9;
    let dest: AudioNode = this.buses[spec.bus];
    const extra: AudioNode[] = [];
    let distanceGain = 1;
    if (spec.spatial) {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, req.pan || 0));
      pan.connect(dest); dest = pan; extra.push(pan);
      if (req.distance > 0) {
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = Math.max(500, Math.min(16000, 9000 * Math.exp(-req.distance / 50)));
        lp.connect(dest); dest = lp; extra.push(lp);
        distanceGain = 1 / (1 + Math.max(0, req.distance - 10) / 25);
      }
    }
    const b = renderSound(this.ctx, spec.sound, now + 0.005, dest, this.bank, this.random);
    b.out.gain.value = dbToGain(spec.level + intensityDb + (spec.spatial ? listening : 0)) * distanceGain;
    if (spec.wet > 0) {
      const send = this.ctx.createGain();
      send.gain.value = spec.wet;
      b.out.connect(send); send.connect(this.reverb); extra.push(send);
    }
    b.nodes.push(...extra);
    this.built.set(a.voice.id, b);
    return a;
  }

  private details(scene: AudioScene, listening: number, now: number): void {
    const slot = this.ambience;
    if (!slot) return;
    for (const d of slot.profile.details) {
      const due = this.nextDetail.get(d.kind);
      const gap = (): number => -Math.log(1 - this.random()) * 60 / d.perMinute;
      if (due === undefined) { this.nextDetail.set(d.kind, now + gap()); continue; }
      if (due > now) continue;
      this.nextDetail.set(d.kind, now + gap());
      const parts = detailRecipe(d.kind, this.random);
      const duration = Math.max(...parts.map(p => p.at + p.dur)) + 0.05;
      const a = this.allocator.admit({ cue: "detail", bus: "ambience", priority: 0, cooldown: 0, maxInstances: 4, duration }, now);
      if (!a.play) continue;
      const pan = this.ctx.createStereoPanner(), send = this.ctx.createGain();
      pan.pan.value = (this.random() * 2 - 1) * 0.8;
      pan.connect(this.buses.ambience);
      const b = renderSound(this.ctx, parts, now + 0.005, pan, this.bank, this.random);
      b.out.gain.value = dbToGain(d.level + listening - (scene.shelter === "open" ? 0 : 12));
      send.gain.value = Math.min(1, slot.profile.wet + 0.2);
      b.out.connect(send); send.connect(this.reverb);
      b.nodes.push(pan, send);
      this.built.set(a.voice.id, b);
    }
  }

  /** Stop every one-shot voice, e.g. when play pauses. Beds follow the scene. */
  silence(): void {
    const now = this.ctx.currentTime;
    for (const v of [...this.allocator.voices]) this.stop(v.id, now);
    this.pending = [];
  }

  private stop(id: number, now: number): void {
    this.allocator.release(id);
    const b = this.built.get(id);
    if (!b) return;
    this.built.delete(id);
    this.releasing.push({ b, at: fadeOut(b, now) + 0.05 });
  }

  private retire(layer: { dispose(): void; readonly nodeCount: number }, at: number): void {
    this.retiring.push({ dispose: () => layer.dispose(), get nodeCount() { return layer.nodeCount; }, at });
  }

  /** Release ended voices, faded voices and retired layers whose time has passed. */
  private reap(now: number): void {
    for (const v of this.allocator.prune(now)) {
      const b = this.built.get(v.id);
      if (b) { this.built.delete(v.id); this.releasing.push({ b, at: b.end + 0.05 }); }
    }
    for (let i = this.releasing.length - 1; i >= 0; i--)
      if (this.releasing[i]!.at <= now) disconnectAll(this.releasing.splice(i, 1)[0]!.b);
    for (let i = this.retiring.length - 1; i >= 0; i--)
      if (this.retiring[i]!.at <= now) this.retiring.splice(i, 1)[0]!.dispose();
  }

  stats(): EngineStats {
    const s = this.allocator.stats;
    const bus = Object.fromEntries(BUSES.map(b => [b, this.allocator.count(b)])) as Record<Bus, number>;
    let liveNodes = this.fixed.length + this.depth.nodeCount + this.refuge.nodeCount + this.threat.nodeCount + this.bobbin.nodeCount
      + (this.ambience?.nodeCount ?? 0) + (this.hull?.nodeCount ?? 0);
    for (const r of this.retiring) liveNodes += r.nodeCount;
    let voiceNodes = 0;
    for (const b of this.built.values()) voiceNodes += b.nodes.length;
    for (const r of this.releasing) voiceNodes += r.b.nodes.length;
    liveNodes += voiceNodes;
    return {
      voices: this.allocator.count(), bus, peakVoices: s.peak, peakBus: { ...s.peakBus },
      started: s.started, merged: s.merged, masked: s.masked, full: s.full, deferred: s.deferred, stolen: s.stolen,
      pending: this.pending.length, liveNodes, voiceNodes, ambience: this.ambience?.key ?? null, hull: this.hull?.key ?? null,
    };
  }

  /** Active one-shot cue IDs, oldest first, excluding ambient grains. */
  activeCues(): CueId[] {
    return this.allocator.voices.filter(v => v.cue !== "detail").map(v => v.cue as CueId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const b of this.built.values()) { fadeOut(b, this.ctx.currentTime, 0.005); disconnectAll(b); }
    for (const r of this.releasing) disconnectAll(r.b);
    for (const r of this.retiring) r.dispose();
    this.built.clear(); this.releasing.length = 0; this.retiring.length = 0; this.pending = [];
    for (const l of [this.ambience, this.hull, this.depth, this.refuge, this.threat, this.bobbin]) l?.dispose();
    this.ambience = null; this.hull = null;
    for (const n of this.fixed) try { n.disconnect(); } catch { /* already disconnected */ }
  }
}
