/** The S6 audio graph. Owns buses, the master limiter, continuous layers and
 * one-shot voices on any BaseAudioContext (live or offline). It never reads
 * GameState: it is driven by AudioScene and CueRequest values. */
import { CUES, cueDuration, soundLength, START_LEAD, type Bus, type CueId } from "./cues.js";
import { BobbinLayer, AmbienceSlot, DepthLayer, HullSlot, RefugeBed, ThreatLayer } from "./beds.js";
import type { CueRequest } from "./mapping.js";
import { duckLevels, PENDING_LIMIT, requestFor, VoiceAllocator, type Admission, type Voice } from "./mixer.js";
import { HULL_LAYERS, REGION_AMBIENCE, SURFACE_AMBIENCE, type Detail } from "./profiles.js";
import type { AudioScene } from "./scene.js";
import { ceilingCurve, dbToGain, detailRecipe, disconnectAll, fadeOut, impulseResponse, NoiseBank, renderSound, rng, type Built } from "./synth.js";

const BUSES: readonly Bus[] = ["ambience", "vehicle", "sfx", "alert", "music"];
/** Deferred body alarms are dropped if they cannot sound within this window. */
const PENDING_SECONDS = 4;
/** A new region or medium must hold this long before ambience crossfades. */
export const AMBIENCE_HOLD = 0.75;
/** Fading ambience slots kept for revival; older ones are cut with a short fade. */
export const FADING_SLOT_LIMIT = 2;
const REVERB_RETURN = 0.55;

/** One category: dry and wet (reverb send) inputs, each behind the same
 * trim × duck control, so pause, ducking and solos govern both. */
interface BusPath { dry: GainNode; wet: GainNode; dryCtl: GainNode; wetCtl: GainNode; trim: number }

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
  /** Longest time any graph no longer owned by a voice keeps sounding; a fade is at most 0.05 s. */
  unownedTail: number;
  /** Ambience slots currently fading out (revivable). */
  fadingSlots: number;
  ambience: string | null;
  hull: string | null;
}

interface Retiring { dispose(): void; readonly nodeCount: number; at: number }

export class AudioEngine {
  private readonly bank: NoiseBank;
  private readonly random: () => number;
  private readonly paths = {} as Record<Bus, BusPath>;
  private readonly fixed: AudioNode[] = [];
  readonly volume: GainNode;
  private readonly reverbReturn: GainNode;
  private readonly depth: DepthLayer;
  private readonly refuge: RefugeBed;
  private readonly threat: ThreatLayer;
  private readonly bobbin: BobbinLayer;
  private ambience: AmbienceSlot | null = null;
  private wanted: { key: string; since: number } | null = null;
  private readonly fading: { slot: AmbienceSlot; at: number }[] = [];
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
      const p: BusPath = {
        dry: this.node(ctx.createGain()), wet: this.node(ctx.createGain()),
        dryCtl: this.node(ctx.createGain()), wetCtl: this.node(ctx.createGain()), trim: 1,
      };
      p.dry.connect(p.dryCtl); p.dryCtl.connect(mix);
      this.paths[b] = p;
    }
    const reverbIn = this.node(ctx.createGain());
    const conv = this.node(ctx.createConvolver());
    this.reverbReturn = this.node(ctx.createGain());
    conv.buffer = impulseResponse(ctx);
    this.reverbReturn.gain.value = 0;
    for (const b of BUSES) { this.paths[b].wet.connect(this.paths[b].wetCtl); this.paths[b].wetCtl.connect(reverbIn); }
    reverbIn.connect(conv); conv.connect(this.reverbReturn); this.reverbReturn.connect(mix);
    this.depth = new DepthLayer(ctx, this.paths.ambience.dry, this.bank, now);
    this.refuge = new RefugeBed(ctx, this.paths.ambience.dry, this.paths.ambience.wet, this.bank, now);
    this.threat = new ThreatLayer(ctx, this.paths.alert.dry, this.bank, now);
    this.bobbin = new BobbinLayer(ctx, this.paths.vehicle.dry, now);
  }

  private node<T extends AudioNode>(n: T): T { this.fixed.push(n); return n; }

  /** Linear master volume, already resolved from mute. */
  setVolume(v: number): void {
    if (this.disposed) return;
    this.volume.gain.setTargetAtTime(Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)), this.ctx.currentTime, 0.025);
  }

  /** Static bus trim, for measurement solos in the audio lab. Applies to the
   * bus's dry and wet paths alike; zero isolates the bus completely. */
  setBusTrim(bus: Bus, gain: number): void {
    if (this.disposed) return;
    const p = this.paths[bus], now = this.ctx.currentTime;
    p.trim = gain;
    for (const g of [p.dryCtl.gain, p.wetCtl.gain]) { g.cancelScheduledValues(now); g.setValueAtTime(gain, now); }
  }

  update(scene: AudioScene): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    this.scene = scene;
    if (this.wasActive && !scene.active) this.silence();
    this.wasActive = scene.active;
    this.reap(now);
    const listening = scene.hull ? HULL_LAYERS[scene.hull].listening ?? 0 : 0;
    // Ambience: one slot per region or the surface. A change must hold before
    // it crossfades, so boundary chatter never multiplies graphs.
    const key = scene.medium === "air" ? "surface" : scene.region;
    if (!this.ambience) this.ambience = this.slot(key, now);
    else if (this.ambience.key === key) this.wanted = null;
    else {
      if (this.wanted?.key !== key) this.wanted = { key, since: now };
      if (now - this.wanted.since >= AMBIENCE_HOLD) {
        this.fading.push({ slot: this.ambience, at: this.ambience.fadeOut(now) });
        this.ambience = this.slot(key, now);
        this.wanted = null;
      }
    }
    this.ambience.update(scene, now);
    this.depth.update(scene, now);
    this.refuge.update(scene, now);
    this.threat.update(scene, listening, now);
    this.bobbin.update(scene, now);
    // Vehicle: one slot for the controlled hull.
    if ((this.hull?.key ?? null) !== scene.hull) {
      if (this.hull) this.retire(this.hull, this.hull.fadeOut(now));
      this.hull = scene.hull ? new HullSlot(this.ctx, HULL_LAYERS[scene.hull], scene.hull, this.paths.vehicle.dry, this.bank, this.random() * 2.5, now) : null;
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
    // Paused: beds and the room close; deliberate panel feedback stays dry.
    const d = duckLevels(this.allocator.voices, scene);
    if (!scene.active) { d.ambience = 0; d.vehicle = 0; }
    for (const b of BUSES) {
      const p = this.paths[b], target = p.trim * d[b];
      for (const g of [p.dryCtl.gain, p.wetCtl.gain]) g.setTargetAtTime(target, now, target < g.value ? 0.06 : 0.5);
    }
    this.reverbReturn.gain.setTargetAtTime(scene.active ? REVERB_RETURN : 0, now, scene.active ? 0.3 : 0.06);
  }

  /** The slot for `key`: revive one that is still fading, else build it. Fading
   * slots beyond the limit are cut with a short fade. */
  private slot(key: string, now: number): AmbienceSlot {
    this.nextDetail.clear();
    const i = this.fading.findIndex(f => f.slot.key === key);
    if (i >= 0) {
      const { slot } = this.fading.splice(i, 1)[0]!;
      slot.fadeIn(now);
      return slot;
    }
    while (this.fading.length >= FADING_SLOT_LIMIT) {
      const { slot } = this.fading.shift()!;
      this.retire(slot, slot.fadeOut(now, 0.05));
    }
    const profile = key === "surface" ? SURFACE_AMBIENCE : REGION_AMBIENCE[key as keyof typeof REGION_AMBIENCE];
    return new AmbienceSlot(this.ctx, profile, key, this.paths.ambience.dry, this.paths.ambience.wet, this.bank, this.random() * 2.5, now);
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
    let dest: AudioNode = this.paths[spec.bus].dry;
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
    const b = renderSound(this.ctx, spec.sound, now + START_LEAD, dest, this.bank, this.random);
    b.out.gain.value = dbToGain(spec.level + intensityDb + (spec.spatial ? listening : 0)) * distanceGain;
    if (spec.wet > 0) {
      const send = this.ctx.createGain();
      send.gain.value = spec.wet;
      b.out.connect(send); send.connect(this.paths[spec.bus].wet); extra.push(send);
    }
    b.nodes.push(...extra);
    this.own(a.voice, b);
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
      const duration = START_LEAD + soundLength(parts);
      const a = this.allocator.admit({ cue: "detail", bus: "ambience", priority: 0, cooldown: 0, maxInstances: 4, duration }, now);
      if (!a.play) continue;
      const pan = this.ctx.createStereoPanner(), send = this.ctx.createGain();
      pan.pan.value = (this.random() * 2 - 1) * 0.8;
      pan.connect(this.paths.ambience.dry);
      const b = renderSound(this.ctx, parts, now + START_LEAD, pan, this.bank, this.random);
      b.out.gain.value = dbToGain(d.level + listening - (scene.shelter === "open" ? 0 : 12));
      send.gain.value = Math.min(1, slot.profile.wet + 0.2);
      b.out.connect(send); send.connect(this.paths.ambience.wet);
      b.nodes.push(pan, send);
      this.own(a.voice, b);
    }
  }

  /** The voice owns its graph until the graph's last source stops, whatever
   * the estimate said, so limits, pause and reset always reach it. */
  private own(voice: Voice, b: Built): void {
    voice.end = Math.max(voice.end, b.end);
    this.built.set(voice.id, b);
  }

  /** Stop every one-shot voice, e.g. when play pauses. Beds follow the scene. */
  silence(): void {
    const now = this.ctx.currentTime;
    for (const v of [...this.allocator.voices]) this.stop(v.id, now);
    this.pending = [];
  }

  /** New/Continue/import: stop voices and forget cooldowns so nothing replays or stays suppressed. */
  reset(): void {
    if (this.disposed) return;
    this.silence();
    this.allocator.clearHistory();
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
    for (let i = this.fading.length - 1; i >= 0; i--)
      if (this.fading[i]!.at <= now) this.fading.splice(i, 1)[0]!.slot.dispose();
  }

  stats(): EngineStats {
    const s = this.allocator.stats;
    const bus = Object.fromEntries(BUSES.map(b => [b, this.allocator.count(b)])) as Record<Bus, number>;
    let liveNodes = this.fixed.length + this.depth.nodeCount + this.refuge.nodeCount + this.threat.nodeCount + this.bobbin.nodeCount
      + (this.ambience?.nodeCount ?? 0) + (this.hull?.nodeCount ?? 0);
    for (const r of this.retiring) liveNodes += r.nodeCount;
    for (const f of this.fading) liveNodes += f.slot.nodeCount;
    let voiceNodes = 0;
    for (const b of this.built.values()) voiceNodes += b.nodes.length;
    for (const r of this.releasing) voiceNodes += r.b.nodes.length;
    liveNodes += voiceNodes;
    return {
      voices: this.allocator.count(), bus, peakVoices: s.peak, peakBus: { ...s.peakBus },
      started: s.started, merged: s.merged, masked: s.masked, full: s.full, deferred: s.deferred, stolen: s.stolen,
      pending: this.pending.length, liveNodes, voiceNodes,
      unownedTail: Math.max(0, ...this.releasing.map(r => r.b.end - this.ctx.currentTime)), fadingSlots: this.fading.length, ambience: this.ambience?.key ?? null, hull: this.hull?.key ?? null,
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
    for (const f of this.fading) f.slot.dispose();
    this.built.clear(); this.releasing.length = 0; this.retiring.length = 0; this.fading.length = 0; this.pending = [];
    for (const l of [this.ambience, this.hull, this.depth, this.refuge, this.threat, this.bobbin]) l?.dispose();
    this.ambience = null; this.hull = null;
    for (const n of this.fixed) try { n.disconnect(); } catch { /* already disconnected */ }
  }
}
