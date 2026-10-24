import type { Aabb, Vec3 } from "../types.js";
import type { StaticCollider } from "./collider.js";

/** How well a box cover fits its art (COL-1's interim rule). Until stage B
 * composes static colliders, a builder keeps the intended art, collides it
 * with a conservative box cover that blocks no route, and files the gap as
 * COL-1 debt. This measures that gap from the art itself:
 * - `artOutside`: art surface points no box holds (an actor could swim into
 *   the art there), with the farthest such point's distance to the cover;
 * - `standOff`: how far the cover reaches past the art, sampled over every
 *   box's faces (where the diver bumps water). */

export interface CoverReport {
  readonly boxes: number;
  readonly artPoints: number;
  readonly artOutside: number;
  readonly artOutsideMax: number;
  readonly faceSamples: number;
  readonly standOffMax: number;
  readonly standOffMean: number;
  /** The worst stand-off point, for the debt entry. */
  readonly worst: Vec3 | null;
}

/** `points` are art surface points (vertices, centroids); `reach` caps the
 * stand-off search, metres. */
export function coverReport(art: StaticCollider, boxes: readonly Aabb[], points: readonly Vec3[], reach = 2, spacing = 0.25): CoverReport {
  const pad = 0.002;
  let outside = 0, outsideMax = 0;
  for (const p of points) {
    let best = Infinity;
    for (const b of boxes) {
      const dx = Math.max(b.min.x - pad - p.x, 0, p.x - b.max.x - pad), dy = Math.max(b.min.y - pad - p.y, 0, p.y - b.max.y - pad), dz = Math.max(b.min.z - pad - p.z, 0, p.z - b.max.z - pad);
      best = Math.min(best, Math.hypot(dx, dy, dz));
      if (best === 0) break;
    }
    if (best > 0) { outside++; outsideMax = Math.max(outsideMax, best); }
  }
  // Stand-off: from points on each box face, the distance to the art (by
  // growing a probe cube until the art is met), skipping face points buried
  // inside another box of the cover.
  let samples = 0, sum = 0, most = 0, worst: Vec3 | null = null;
  const insideOther = (p: Vec3, self: Aabb): boolean => boxes.some(b => b !== self && p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z);
  for (const b of boxes) {
    for (const k of ["x", "y", "z"] as const) for (const side of [b.min[k], b.max[k]]) {
      const [u, w] = (["x", "y", "z"] as const).filter(a => a !== k) as ["x" | "y" | "z", "x" | "y" | "z"];
      const nu = Math.max(1, Math.ceil((b.max[u] - b.min[u]) / spacing)), nw = Math.max(1, Math.ceil((b.max[w] - b.min[w]) / spacing));
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nw; j++) {
        const p = { x: 0, y: 0, z: 0 };
        p[k] = side; p[u] = b.min[u] + (b.max[u] - b.min[u]) * i / nu; p[w] = b.min[w] + (b.max[w] - b.min[w]) * j / nw;
        if (insideOther(p, b)) continue;
        let lo = 0, hi = reach;
        if (!art.overlaps(p, { x: hi, y: hi, z: hi }, 0)) { samples++; sum += hi; if (hi > most) { most = hi; worst = p; } continue; }
        for (let s = 0; s < 10; s++) { const m = (lo + hi) / 2; if (art.overlaps(p, { x: m, y: m, z: m }, 0)) hi = m; else lo = m; }
        samples++; sum += hi;
        if (hi > most) { most = hi; worst = p; }
      }
    }
  }
  return { boxes: boxes.length, artPoints: points.length, artOutside: outside, artOutsideMax: outsideMax, faceSamples: samples,
    standOffMax: most, standOffMean: samples ? sum / samples : 0, worst };
}
