/** Deterministic, allocation-free noise for authored terrain and art. Pure
 * math: the same input always gives the same value on every machine, so the
 * floor, its collision and its art agree without any cached state. */

export const clamp01 = (v: number): number => v < 0 ? 0 : v > 1 ? 1 : v;
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Hermite smoothstep from a to b (a may exceed b for a falling edge). */
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Integer lattice hash in [-1, 1]. */
export function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483647.5 - 1;
}

/** Smooth value noise in [-1, 1] at unit lattice spacing. */
export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal sum, normalised to roughly [-1, 1]. `scale` is the first octave's
 * wavelength in metres. */
export function fbm(x: number, z: number, scale: number, octaves: number, seed: number): number {
  let sum = 0, amp = 1, norm = 0, f = 1 / scale;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * f, z * f, seed + i * 101) * amp;
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}

/** Ridged fractal in [0, 1]: sharp crests read as fractured rock. */
export function ridged(x: number, z: number, scale: number, octaves: number, seed: number): number {
  let sum = 0, amp = 1, norm = 0, f = 1 / scale;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * f, z * f, seed + i * 131));
    sum += n * n * amp;
    norm += amp; amp *= 0.5; f *= 2.11;
  }
  return sum / norm;
}

/** Deterministic stream for art placement (same LCG family as render/geometry). */
export function seededStream(initial: number): () => number {
  let seed = initial >>> 0;
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Nearest point on a polyline (XZ). `s` is arc length from the first point,
 * `side` is +1 left of travel (looking down +Y, +X east, +Z north), -1 right.
 * `side` uses the vertex pseudo-normal where the nearest feature is an inner
 * vertex, so it only changes sign across the line itself. `s` can still jump
 * on the inner side of a bend: callers that need continuity use `along`. */
export interface PolylineHit { d: number; s: number; length: number; side: number; tx: number; tz: number }
export function nearestOnPolyline(x: number, z: number, pts: readonly (readonly [number, number])[], out: PolylineHit): PolylineHit {
  let best = Infinity, bestS = 0, side = 0, run = 0, tx = 1, tz = 0;
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i]!, [bx, bz] = pts[i + 1]!;
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const t = clamp01(((x - ax) * dx + (z - az) * dz) / (len * len));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d; bestS = run + t * len; tx = dx / len; tz = dz / len;
      // Left normal of this segment, or the averaged normal at an inner vertex.
      let nx = -dz / len, nz = dx / len;
      const j = t <= 0 && i > 0 ? i - 1 : t >= 1 && i < n - 1 ? i + 1 : -1;
      if (j >= 0) {
        const [cx, cz] = pts[j]!, [ex, ez] = pts[j + 1]!, l2 = Math.hypot(ex - cx, ez - cz);
        nx += -(ez - cz) / l2; nz += (ex - cx) / l2;
      }
      side = nx * (x - px) + nz * (z - pz);
    }
    run += len;
  }
  out.d = best; out.s = bestS; out.length = run; out.side = side >= 0 ? 1 : -1; out.tx = tx; out.tz = tz;
  return out;
}

/** Continuous fraction along a polyline's overall chord (0 first, 1 last). */
export function along(x: number, z: number, pts: readonly (readonly [number, number])[]): number {
  const [ax, az] = pts[0]!, [bx, bz] = pts[pts.length - 1]!, dx = bx - ax, dz = bz - az;
  return clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
}
