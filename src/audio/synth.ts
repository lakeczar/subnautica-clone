/** WebAudio rendering of cue recipes. Works on any BaseAudioContext, so the
 * same graphs render live and in OfflineAudioContext analysis. */
import { midiHz, type NoisePart, type Part, type Phrase, type TonePart } from "./cues.js";
import type { DetailKind } from "./profiles.js";

export const dbToGain = (db: number): number => 10 ** (db / 20);
const SILENT = 0.0001;

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type NoiseColor = "white" | "pink" | "brown";
/** Three looped noise colours generated once per context, normalized to equal RMS. */
export class NoiseBank {
  private readonly buffers = new Map<NoiseColor, AudioBuffer>();
  constructor(private readonly ctx: BaseAudioContext, private readonly seed = 8317) {}
  get(color: NoiseColor): AudioBuffer {
    let b = this.buffers.get(color);
    if (!b) this.buffers.set(color, b = this.make(color));
    return b;
  }
  private make(color: NoiseColor): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * 3);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const d = buffer.getChannelData(0);
    const r = rng(this.seed + color.length * 101);
    let b0 = 0, b1 = 0, b2 = 0, brown = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1;
      if (color === "white") d[i] = w;
      else if (color === "pink") {
        // Paul Kellet's economy pink filter.
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = b0 + b1 + b2 + w * 0.1848;
      } else { brown = (brown + 0.02 * w) / 1.02; d[i] = brown; }
    }
    // Remove DC, normalize to RMS 0.25, then crossfade the loop seam.
    let mean = 0; for (const v of d) mean += v; mean /= d.length;
    let sq = 0; for (let i = 0; i < d.length; i++) { d[i]! -= mean; sq += d[i]! ** 2; }
    const k = 0.25 / Math.sqrt(sq / d.length || 1);
    for (let i = 0; i < d.length; i++) d[i] = Math.max(-1, Math.min(1, d[i]! * k));
    const fade = Math.min(2048, d.length >> 4);
    for (let i = 0; i < fade; i++) {
      const a = i / fade, j = d.length - fade + i;
      d[i] = d[i]! * a + d[j]! * (1 - a);
    }
    return buffer;
  }
}

/** One built transient voice: everything it created, its output and end time. */
export interface Built {
  out: GainNode;
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  end: number;
}

function envelope(param: AudioParam, t0: number, attack: number, hold: number, dur: number, peak: number): void {
  const a = Math.max(0.001, attack), h = Math.max(0, hold ?? 0), end = Math.max(t0 + a + h + 0.01, t0 + dur);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, t0 + a);
  param.setValueAtTime(peak, t0 + a + h);
  param.exponentialRampToValueAtTime(Math.max(SILENT, peak * SILENT), end);
}

function tone(ctx: BaseAudioContext, p: TonePart, when: number, dest: AudioNode, b: Built, pitch = 1): void {
  const t0 = when + p.at, o = ctx.createOscillator(), env = ctx.createGain();
  o.type = p.wave;
  const f0 = p.freq * pitch;
  o.frequency.setValueAtTime(f0, t0);
  if (p.to) o.frequency.exponentialRampToValueAtTime(p.to * pitch, t0 + (p.glide ?? p.dur));
  if (p.detune) o.detune.value = p.detune;
  envelope(env.gain, t0, p.attack, p.hold ?? 0, p.dur, p.gain);
  let head: AudioNode = o;
  if (p.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = p.lowpass; f.Q.value = 0.7;
    head.connect(f); head = f; b.nodes.push(f);
  }
  head.connect(env);
  env.connect(dest);
  if (p.fm) {
    const m = ctx.createOscillator(), mg = ctx.createGain();
    m.frequency.setValueAtTime(f0 * p.fm.ratio, t0);
    if (p.to) m.frequency.exponentialRampToValueAtTime(p.to * pitch * p.fm.ratio, t0 + (p.glide ?? p.dur));
    mg.gain.setValueAtTime(p.fm.index * f0, t0);
    if (p.fm.indexTo !== undefined) mg.gain.linearRampToValueAtTime(p.fm.indexTo * f0, t0 + p.dur);
    m.connect(mg); mg.connect(o.frequency);
    m.start(t0); m.stop(t0 + p.dur + 0.02);
    b.nodes.push(m, mg); b.sources.push(m);
  }
  o.start(t0); o.stop(t0 + p.dur + 0.02);
  b.nodes.push(o, env); b.sources.push(o);
  b.end = Math.max(b.end, t0 + p.dur + 0.02);
}

function noise(ctx: BaseAudioContext, p: NoisePart, when: number, dest: AudioNode, b: Built, bank: NoiseBank, r: () => number): void {
  const t0 = when + p.at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), env = ctx.createGain();
  src.buffer = bank.get(p.color);
  src.loop = true;
  f.type = p.filter; f.Q.value = p.q;
  f.frequency.setValueAtTime(p.freq, t0);
  if (p.to) f.frequency.exponentialRampToValueAtTime(p.to, t0 + p.dur);
  envelope(env.gain, t0, p.attack, p.hold ?? 0, p.dur, p.gain);
  src.connect(f); f.connect(env); env.connect(dest);
  src.start(t0, r() * 2.5); src.stop(t0 + p.dur + 0.02);
  b.nodes.push(src, f, env); b.sources.push(src);
  b.end = Math.max(b.end, t0 + p.dur + 0.02);
}

/** Soft FM bells over a slow pad. One voice regardless of note count. */
function phrase(ctx: BaseAudioContext, ph: Phrase, when: number, dest: AudioNode, b: Built): void {
  const beat = ph.beat;
  for (const chord of ph.pad ?? []) {
    const t0 = when + chord.at * beat, dur = chord.beats * beat + 1.5;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 900; f.Q.value = 0.5;
    const env = ctx.createGain();
    // Two detuned triangles per chord tone share the envelope.
    const g = chord.gain / Math.max(1, chord.midi.length) / 2;
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(g, t0 + Math.min(1.6, dur * 0.3));
    env.gain.setValueAtTime(g, t0 + dur - 1.5);
    env.gain.linearRampToValueAtTime(0, t0 + dur);
    f.connect(env); env.connect(dest);
    b.nodes.push(f, env);
    for (const m of chord.midi) for (const cents of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "triangle"; o.frequency.value = midiHz(m); o.detune.value = cents;
      o.connect(f);
      o.start(t0); o.stop(t0 + dur + 0.02);
      b.nodes.push(o); b.sources.push(o);
    }
    b.end = Math.max(b.end, t0 + dur + 0.02);
  }
  for (const note of ph.notes) {
    const t0 = when + note.at * beat, hz = midiHz(note.midi), dur = note.beats * beat + 2.2;
    tone(ctx, { kind: "tone", wave: "sine", freq: hz, at: 0, dur, attack: 0.008, gain: note.gain, fm: { ratio: 2, index: 1.1, indexTo: 0.05 } }, t0, dest, b);
    tone(ctx, { kind: "tone", wave: "sine", freq: hz * 2, at: 0, dur: dur * 0.5, attack: 0.004, gain: note.gain * 0.12 }, t0, dest, b);
  }
}

export function renderSound(
  ctx: BaseAudioContext, sound: readonly Part[] | Phrase, when: number, dest: AudioNode,
  bank: NoiseBank, r: () => number, pitch = 1,
): Built {
  const out = ctx.createGain();
  out.connect(dest);
  const b: Built = { out, nodes: [out], sources: [], end: when };
  if ("kind" in sound && sound.kind === "phrase") phrase(ctx, sound, when, out, b);
  else for (const p of sound as readonly Part[]) p.kind === "tone" ? tone(ctx, p, when, out, b, pitch) : noise(ctx, p, when, out, b, bank, r);
  return b;
}

/** Fade a built voice out quickly and stop its sources, without a click. */
export function fadeOut(b: Built, now: number, seconds = 0.03): number {
  const g = b.out.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0, now + seconds);
  const end = now + seconds + 0.01;
  for (const s of b.sources) try { s.stop(end); } catch { /* already stopped */ }
  b.end = Math.min(b.end, end);
  return end;
}

export function disconnectAll(b: Built): void {
  for (const n of b.nodes) try { n.disconnect(); } catch { /* already disconnected */ }
}

const t = (p: Omit<TonePart, "kind">): TonePart => ({ kind: "tone", ...p });
const nz = (p: Omit<NoisePart, "kind">): NoisePart => ({ kind: "noise", ...p });

/** Ambient grain recipes. Randomized from the engine's seeded generator. */
export function detailRecipe(kind: DetailKind, r: () => number): Part[] {
  const between = (a: number, b: number): number => a + (b - a) * r();
  const out: Part[] = [];
  switch (kind) {
    case "crackle": for (let i = 0, c = 3 + Math.floor(r() * 6); i < c; i++)
      out.push(nz({ color: "white", filter: "highpass", freq: between(3000, 6500), q: 0.7, at: r() * 0.3, dur: between(0.004, 0.009), attack: 0.0008, gain: between(0.4, 1) }));
      break;
    case "bubble": for (let i = 0, c = 1 + Math.floor(r() * 3); i < c; i++) {
      const f = between(300, 700);
      out.push(t({ wave: "sine", freq: f, to: f * 2.2, glide: between(0.04, 0.08), at: i * between(0.06, 0.14), dur: 0.09, attack: 0.003, gain: between(0.4, 0.8) }));
    } break;
    case "pebble": for (let i = 0, c = 2 + Math.floor(r() * 3); i < c; i++)
      out.push(nz({ color: "white", filter: "bandpass", freq: between(1500, 2600), q: 3, at: i * between(0.05, 0.12), dur: 0.018, attack: 0.001, gain: between(0.5, 1) }));
      out.push(t({ wave: "sine", freq: between(180, 240), at: 0, dur: 0.07, attack: 0.002, gain: 0.3 }));
      break;
    case "creak": { const f = between(170, 260);
      out.push(nz({ color: "white", filter: "bandpass", freq: f, to: f * 0.75, q: 18, at: 0, dur: between(0.7, 1.3), attack: 0.25, gain: 1 }));
    } break;
    case "floater": for (let i = 0, c = 3 + Math.floor(r() * 3); i < c; i++)
      out.push(t({ wave: "sine", freq: between(1500, 2200), at: i * 0.075, dur: 0.06, attack: 0.006, gain: between(0.3, 0.6) }));
      break;
    case "silt": out.push(nz({ color: "pink", filter: "bandpass", freq: between(2400, 3600), q: 0.8, at: 0, dur: between(1.8, 2.8), attack: 0.9, gain: 1 })); break;
    case "dish": out.push(t({ wave: "sine", freq: between(128, 160), at: 0, dur: 3.6, attack: 0.01, gain: 0.8, fm: { ratio: 2.41, index: 2, indexTo: 0.2 } })); break;
    case "vent":
      out.push(nz({ color: "brown", filter: "lowpass", freq: 320, q: 0.7, at: 0, dur: 1.1, attack: 0.25, gain: 0.8 }));
      for (let i = 0, c = 6 + Math.floor(r() * 7); i < c; i++) {
        const f = between(200, 520);
        out.push(t({ wave: "sine", freq: f, to: f * 2.5, glide: 0.03, at: 0.1 + r() * 0.8, dur: 0.05, attack: 0.002, gain: between(0.2, 0.5) }));
      } break;
    case "groan":
      out.push(nz({ color: "brown", filter: "bandpass", freq: between(100, 140), to: between(70, 90), q: 6, at: 0, dur: between(1.3, 2), attack: 0.4, gain: 1 }));
      break;
    case "glass": { const f = between(1200, 2800);
      out.push(t({ wave: "sine", freq: f, at: 0, dur: 2.6, attack: 0.01, gain: 0.7 }), t({ wave: "sine", freq: f * 2.76, at: 0, dur: 1.2, attack: 0.01, gain: 0.12 }));
    } break;
    case "knock": for (let i = 0; i < 2; i++)
      out.push(t({ wave: "sine", freq: between(90, 140), at: i * 0.32, dur: 0.8, attack: 0.002, gain: 0.7, fm: { ratio: 1.41, index: 3, indexTo: 0.1 } }),
        nz({ color: "brown", filter: "lowpass", freq: 400, q: 0.8, at: i * 0.32, dur: 0.12, attack: 0.002, gain: 0.5 }));
      break;
    case "mast": out.push(t({ wave: "sine", freq: between(600, 900), at: 0, dur: 2.2, attack: 0.02, gain: 0.6, fm: { ratio: 3.1, index: 0.8, indexTo: 0.05 } })); break;
  }
  return out;
}

/** Stereo decaying-noise impulse response for the shared space reverb. */
export function impulseResponse(ctx: BaseAudioContext, seconds = 2.6, seed = 4421): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c), r = rng(seed + c);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const x = i / length;
      // Darker as it decays: a one-pole lowpass whose coefficient falls with time.
      lp += (r() * 2 - 1 - lp) * (0.6 - 0.5 * x);
      d[i] = lp * (1 - x) ** 2.4 * Math.exp(-3.2 * x) * 0.35;
    }
  }
  return ir;
}

/** Transparent below -2 dBFS, smooth knee to a hard ceiling of -0.3 dBFS. */
export function ceilingCurve(points = 4096): Float32Array<ArrayBuffer> {
  const c = new Float32Array(points), knee = dbToGain(-2), ceil = dbToGain(-0.3);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1, a = Math.abs(x);
    const y = a <= knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}
