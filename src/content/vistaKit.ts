import type { RegionId } from "./registry.js";
import type { Aabb, Vec3 } from "../world/types.js";

/** The shape kit behind composed set pieces (`vistas.ts` and the deep-leg
 * points of interest in `poi/`): blocks, faceted prisms and the slab
 * collision that hugs them. Babylon-free and free of set data, so any set
 * module can build from it without importing the sets themselves. */
export type VistaTone = "rust" | "rustDark" | "metal" | "steel" | "petrol" | "ochre" | "stone" | "stoneDark" | "coral"
  | "amber" | "concrete" | "concrete2" | "glow" | "warm" | "cyan"
  // POI-1: pale bone, and lit ember, mint and lilac lamps.
  | "bone" | "ember" | "mint" | "lilac";
export interface VistaBlock { readonly min: Vec3; readonly max: Vec3; readonly tone: VistaTone; readonly top?: VistaTone }
/** A flat convex polygon of the art, drawn exactly as given (outward
 * winding for closed pieces). */
export interface VistaFacet { readonly pts: readonly Vec3[]; readonly tone: VistaTone }
/** Faceted art collided by slabs across `axis` of width `step`. `closed`
 * pieces are convex solids (one prism); open ones are skin. */
export interface VistaPiece { readonly facets: readonly VistaFacet[]; readonly closed: boolean; readonly axis: Axis; readonly step: number }
export type Axis = "x" | "y" | "z";
export interface VistaSet {
  readonly id: string;
  readonly region: RegionId;
  /** The chunk containing this point builds the set's art. */
  readonly anchor: { readonly x: number; readonly z: number };
  readonly blocks: readonly VistaBlock[];
  readonly pieces: readonly VistaPiece[];
}


export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const block = (min: Vec3, max: Vec3, tone: VistaTone, top?: VistaTone): VistaBlock => ({ min, max, tone, ...(top ? { top } : {}) });
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
export const AXES = ["x", "y", "z"] as const;
export const dominant = (d: Vec3): Axis => AXES.reduce((m, k) => Math.abs(d[k]) > Math.abs(d[m]) ? k : m, "x" as Axis);
/** Slab width for a run along `d`: a slanted slice leaves an empty corner of
 * about step * slope / sqrt(1 + slope^2); keep that near 0.12 m. */
export function slabStep(d: Vec3): number {
  const k = dominant(d), slope = Math.hypot(...AXES.filter(a => a !== k).map(a => d[a])) / Math.abs(d[k]);
  return Math.min(3, Math.max(0.2, 0.12 * Math.sqrt(1 + slope * slope) / Math.max(slope, 1e-3)));
}

/** One straight prism from `a` to `b` with a rounded-rectangle section:
 * half-depth `d` along U (the world axis most nearly perpendicular to the
 * run, made exactly perpendicular), half-width `w` along V, corner radius
 * `e`. Closed and convex: side faces, then caps facing out along the run. */
export function prism(a: Vec3, b: Vec3, w: number, d: number, e: number, tone: (up: number) => VistaTone): VistaPiece {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), W = v((b.x - a.x) / len, (b.y - a.y) / len, (b.z - a.z) / len);
  const n = AXES.reduce((m, k) => Math.abs(W[k]) < Math.abs(W[m]) ? k : m, "x" as Axis), N = v(n === "x" ? 1 : 0, n === "y" ? 1 : 0, n === "z" ? 1 : 0);
  const dn = N.x * W.x + N.y * W.y + N.z * W.z, u0 = v(N.x - dn * W.x, N.y - dn * W.y, N.z - dn * W.z), ul = Math.hypot(u0.x, u0.y, u0.z);
  const U = v(u0.x / ul, u0.y / ul, u0.z / ul), V = v(W.y * U.z - W.z * U.y, W.z * U.x - W.x * U.z, W.x * U.y - W.y * U.x);
  const sec: [number, number][] = [];
  for (const [cu, cv, t0] of [[d - e, w - e, 0], [-(d - e), w - e, 90], [-(d - e), -(w - e), 180], [d - e, -(w - e), 270]] as const)
    for (const t of [t0, t0 + 45, t0 + 90]) { const r = t * Math.PI / 180; sec.push([cu + Math.cos(r) * e, cv + Math.sin(r) * e]); }
  const ring = (o: Vec3): Vec3[] => sec.map(([su, sv]) => v(o.x + U.x * su + V.x * sv, o.y + U.y * su + V.y * sv, o.z + U.z * su + V.z * sv));
  const A = ring(a), B = ring(b), facets: VistaFacet[] = [];
  for (let i = 0; i < sec.length; i++) {
    const j = (i + 1) % sec.length, mu = (sec[i]![0] + sec[j]![0]) / 2, mv = (sec[i]![1] + sec[j]![1]) / 2, ml = Math.hypot(mu, mv) || 1;
    // Corner arcs repeat their end points along the flat sides; skip the
    // zero-length side those leave.
    if (Math.hypot(sec[i]![0] - sec[j]![0], sec[i]![1] - sec[j]![1]) < 1e-6) continue;
    facets.push({ pts: [A[i]!, A[j]!, B[j]!, B[i]!], tone: tone((U.y * mu + V.y * mv) / ml) });
  }
  const dedupe = (r: Vec3[]): Vec3[] => r.filter((p, i) => Math.hypot(p.x - r[(i + 1) % r.length]!.x, p.y - r[(i + 1) % r.length]!.y, p.z - r[(i + 1) % r.length]!.z) > 1e-6);
  facets.push({ pts: dedupe(B), tone: tone(W.y) }, { pts: dedupe([...A].reverse()), tone: tone(-W.y) });
  return { facets, closed: true, axis: dominant(W), step: slabStep(W) };
}
/** A run of prisms along a polyline. `size(i)` gives segment i's half
 * width, half depth and corner radius. */
export function beam(points: readonly Vec3[], size: (i: number) => readonly [number, number, number], tone: (i: number, up: number) => VistaTone): VistaPiece[] {
  return points.slice(1).map((b, i) => { const [w, d, e] = size(i); return prism(points[i]!, b, w, d, e, up => tone(i, up)); });
}

/** Exact bounds of `facets` within axis slab [t0, t1] (null when empty). */
function slabBounds(facets: readonly VistaFacet[], axis: Axis, t0: number, t1: number): Aabb | null {
  const lo = v(Infinity, Infinity, Infinity), hi = v(-Infinity, -Infinity, -Infinity);
  const add = (p: Vec3): void => { lo.x = Math.min(lo.x, p.x); lo.y = Math.min(lo.y, p.y); lo.z = Math.min(lo.z, p.z); hi.x = Math.max(hi.x, p.x); hi.y = Math.max(hi.y, p.y); hi.z = Math.max(hi.z, p.z); };
  for (const f of facets) for (let i = 0; i < f.pts.length; i++) {
    const p = f.pts[i]!, q = f.pts[(i + 1) % f.pts.length]!;
    if (p[axis] >= t0 && p[axis] <= t1) add(p);
    for (const t of [t0, t1]) if ((p[axis] - t) * (q[axis] - t) < 0) add(lerp(p, q, (t - p[axis]) / (q[axis] - p[axis])));
  }
  if (lo.x === Infinity) return null;
  // A hair of slack, and a minimum thickness for flat skin.
  const pad = (k: Axis): void => { const m = Math.max(0.005, (0.1 - (hi[k] - lo[k])) / 2); lo[k] -= m; hi[k] += m; };
  pad("x"); pad("y"); pad("z");
  return { min: lo, max: hi };
}
/** Slab boxes covering one piece. A tilted end cap would leave its slab
 * overhanging by the cap's width times the slope, so where a cap spans
 * more than 0.4 m along the axis that stretch is sliced at 0.25 m. */
export function pieceSolids(p: VistaPiece): Aabb[] {
  const ts = p.facets.flatMap(f => f.pts.map(q => q[p.axis])), t0 = Math.min(...ts), t1 = Math.max(...ts), out: Aabb[] = [];
  const n = Math.max(1, Math.ceil((t1 - t0) / p.step)), cuts = Array.from({ length: n + 1 }, (_, i) => t0 + (t1 - t0) * i / n);
  if (p.closed) for (const f of p.facets.slice(-2)) {
    const c0 = Math.min(...f.pts.map(q => q[p.axis])), c1 = Math.max(...f.pts.map(q => q[p.axis])), m = c1 - c0 > 0.4 ? Math.ceil((c1 - c0) / 0.25) : 1;
    for (let i = 1; i < m; i++) cuts.push(c0 + (c1 - c0) * i / m);
  }
  cuts.sort((x, y) => x - y);
  for (let i = 0; i < cuts.length - 1; i++) {
    if (cuts[i + 1]! - cuts[i]! < 1e-4) continue;
    const b = slabBounds(p.facets, p.axis, cuts[i]!, cuts[i + 1]!); if (b) out.push(b);
  }
  return out;
}

