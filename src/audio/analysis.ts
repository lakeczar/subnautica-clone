/** Offline render analysis: levels, loudness and spectra. Pure functions over
 * Float32Array channels, so they run under node tests and in the audio lab. */

export const toDb = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const round = (x: number, d = 1): number => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);

export interface Levels {
  peakDb: number;
  rmsDb: number;
  /** ITU-R BS.1770 K-weighted, gated integrated loudness. */
  lufs: number;
  /** Loudest 400 ms block, K-weighted. */
  momentaryMaxLufs: number;
  crestDb: number;
  dc: number;
  /** Samples at or above 0.999 full scale. */
  clipped: number;
  seconds: number;
}

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** K-weighting filter pair for an arbitrary sample rate (BS.1770-4 design values). */
export function kWeighting(fs: number): [Biquad, Biquad] {
  let K = Math.tan(Math.PI * 1681.974450955533 / fs);
  const Q1 = 0.7071752369554196, Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q1 + K * K;
  const shelf = { b0: (Vh + Vb * K / Q1 + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q1 + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q1 + K * K) / a0 };
  K = Math.tan(Math.PI * 38.13547087602444 / fs);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const hp = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q2 + K * K) / a0 };
  return [shelf, hp];
}

function filter(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!, o = f.b0 * v + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
  }
  return y;
}

/** Mean square per 400 ms block with 75% overlap, summed over channels. */
function blockPowers(weighted: readonly Float32Array[], fs: number): number[] {
  const size = Math.round(0.4 * fs), step = Math.round(0.1 * fs), n = weighted[0]?.length ?? 0, out: number[] = [];
  for (let start = 0; start + size <= n; start += step) {
    let sum = 0;
    for (const ch of weighted) { let s = 0; for (let i = start; i < start + size; i++) s += ch[i]! ** 2; sum += s / size; }
    out.push(sum);
  }
  return out;
}
const lufsOf = (power: number): number => (power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity);

export function levels(channels: readonly Float32Array[], fs: number): Levels {
  let peak = 0, sq = 0, sum = 0, clipped = 0, count = 0;
  for (const ch of channels) for (const v of ch) {
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sq += v * v; sum += v; count++;
  }
  const rms = Math.sqrt(sq / Math.max(1, count));
  const [shelf, hp] = kWeighting(fs);
  const powers = blockPowers(channels.map(ch => filter(filter(ch, shelf), hp)), fs);
  const absolute = powers.filter(p => lufsOf(p) > -70);
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const relativeGate = lufsOf(mean(absolute)) - 10;
  const gated = absolute.filter(p => lufsOf(p) > relativeGate);
  return {
    peakDb: round(toDb(peak), 2), rmsDb: round(toDb(rms), 2),
    lufs: round(gated.length ? lufsOf(mean(gated)) : -Infinity, 2),
    momentaryMaxLufs: round(powers.length ? lufsOf(Math.max(...powers)) : -Infinity, 2),
    crestDb: round(toDb(peak) - toDb(rms), 2), dc: round(sum / Math.max(1, count), 5), clipped,
    seconds: round((channels[0]?.length ?? 0) / fs, 3),
  };
}

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci, ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr; im[b] = im[a]! - ti; re[a] = re[a]! + tr; im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Welch-averaged one-sided power spectrum of the channel mean, Hann window.
 * Bins sum to the signal's mean square (bin width fs/size). */
export function powerSpectrum(channels: readonly Float32Array[], size = 4096): Float64Array {
  const n = channels[0]?.length ?? 0, power = new Float64Array(size / 2);
  const hann = new Float64Array(size).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  const norm = hann.reduce((a, b) => a + b * b, 0);
  let frames = 0;
  for (let start = 0; start + size <= n; start += size / 2) {
    const re = new Float64Array(size), im = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      let v = 0; for (const ch of channels) v += ch[start + i]!;
      re[i] = (v / channels.length) * hann[i]!;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) power[k]! += 2 * (re[k]! ** 2 + im[k]! ** 2) / (norm * size);
    frames++;
  }
  if (frames) for (let k = 0; k < power.length; k++) power[k]! /= frames;
  return power;
}

export const OCTAVES = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export interface Spectrum {
  /** dB power per octave band centred on OCTAVES, relative to full-scale sine. */
  bands: number[];
  centroidHz: number;
  /** Frequency of the strongest bin above 20 Hz. */
  peakHz: number;
}

export function spectrum(channels: readonly Float32Array[], fs: number, size = 4096): Spectrum {
  const p = powerSpectrum(channels, size), bin = fs / size;
  const bands = OCTAVES.map(c => {
    let s = 0;
    for (let k = Math.max(1, Math.floor(c / Math.SQRT2 / bin)); k <= Math.min(p.length - 1, Math.ceil(c * Math.SQRT2 / bin)); k++) s += p[k]!;
    // Relative to a full-scale sine, whose mean square is 0.5.
    return round(10 * Math.log10(s / 0.5 + 1e-15), 1);
  });
  let num = 0, den = 0, best = 0, peakHz = 0;
  for (let k = 1; k < p.length; k++) {
    num += k * bin * p[k]!; den += p[k]!;
    if (k * bin >= 20 && p[k]! > best) { best = p[k]!; peakHz = k * bin; }
  }
  return { bands, centroidHz: Math.round(den > 0 ? num / den : 0), peakHz: Math.round(peakHz) };
}
