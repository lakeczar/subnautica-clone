import type { RegionId } from "./registry.js";
import type { Aabb, Vec3 } from "../world/types.js";
import { hash2 } from "./regions/noise.js";
import { ROUTES } from "./regions/passages.js";
import { worldFloor } from "./regions/worldFloor.js";

/** Composed set pieces' solid parts (A1). Babylon-free: `render/biomes/vistas.ts`
 * draws every solid-looking piece from exactly these shapes, and
 * `VISTA_SOLIDS` is their collision, so art and collision cannot drift.
 *
 * - A `VistaBlock` is an axis-aligned box: drawn as that box and collided as
 *   that box (beams of the gantry, markers, saddles, lanterns).
 * - A `VistaPiece` is faceted art: a rounded-rectangle prism (a segment of a
 *   rib, the arch's rock, a pipe, the ring) or a patch of hull skin. Its
 *   collision is thin slabs across its dominant axis, each the exact bounds
 *   of the facets inside it. Prisms keep their flat faces square to the world
 *   axis most nearly perpendicular to them (Z for the arch, ring and ribs,
 *   which lie in constant-Z planes), and slab steps shrink with slope, so
 *   no part of any box stands more than about 0.35 m off the art: a diver
 *   bumps just before contact and never swims through (tests/vistas.test.ts
 *   checks every box on a 0.25 m grid).
 *
 * Thin dressing (kelp, bulbs, lattice masts, lamps, cables, floor debris)
 * stays visual-only in the render module and is drawn to look permeable.
 *
 * Wiring: `VISTA_SOLIDS` has the `STRUCTURE_SOLIDS` shape. The coordinator
 * appends it to the indexed broad phase as `{ id, min: bounds.min, max:
 * bounds.max }`; tests/vistas.test.ts proves the solids leave every passage,
 * tether, mooring, park and work pose clear. */
export type VistaTone = "rust" | "rustDark" | "metal" | "steel" | "petrol" | "ochre" | "stone" | "stoneDark" | "coral"
  | "amber" | "concrete" | "concrete2" | "glow" | "warm" | "cyan";
export interface VistaBlock { readonly min: Vec3; readonly max: Vec3; readonly tone: VistaTone; readonly top?: VistaTone }
/** A flat convex polygon of the art, drawn exactly as given (outward
 * winding for closed pieces). */
export interface VistaFacet { readonly pts: readonly Vec3[]; readonly tone: VistaTone }
/** Faceted art collided by slabs across `axis` of width `step`. `closed`
 * pieces are convex solids (one prism); open ones are skin. */
export interface VistaPiece { readonly facets: readonly VistaFacet[]; readonly closed: boolean; readonly axis: Axis; readonly step: number }
type Axis = "x" | "y" | "z";
export interface VistaSet {
  readonly id: string;
  readonly region: RegionId;
  /** The chunk containing this point builds the set's art. */
  readonly anchor: { readonly x: number; readonly z: number };
  readonly blocks: readonly VistaBlock[];
  readonly pieces: readonly VistaPiece[];
}

const floor = worldFloor;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const block = (min: Vec3, max: Vec3, tone: VistaTone, top?: VistaTone): VistaBlock => ({ min, max, tone, ...(top ? { top } : {}) });
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
const AXES = ["x", "y", "z"] as const;
const dominant = (d: Vec3): Axis => AXES.reduce((m, k) => Math.abs(d[k]) > Math.abs(d[m]) ? k : m, "x" as Axis);
/** Slab width for a run along `d`: a slanted slice leaves an empty corner of
 * about step * slope / sqrt(1 + slope^2); keep that near 0.12 m. */
function slabStep(d: Vec3): number {
  const k = dominant(d), slope = Math.hypot(...AXES.filter(a => a !== k).map(a => d[a])) / Math.abs(d[k]);
  return Math.min(3, Math.max(0.2, 0.12 * Math.sqrt(1 + slope * slope) / Math.max(slope, 1e-3)));
}

/** One straight prism from `a` to `b` with a rounded-rectangle section:
 * half-depth `d` along U (the world axis most nearly perpendicular to the
 * run, made exactly perpendicular), half-width `w` along V, corner radius
 * `e`. Closed and convex: side faces, then caps facing out along the run. */
function prism(a: Vec3, b: Vec3, w: number, d: number, e: number, tone: (up: number) => VistaTone): VistaPiece {
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
function beam(points: readonly Vec3[], size: (i: number) => readonly [number, number, number], tone: (i: number, up: number) => VistaTone): VistaPiece[] {
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

// --- Wreck ridge: capsized hulls lying along Z on the ridge flanks ---------

/** A capsized hull along +Z: arched ribs in constant-Z planes, rising along
 * the floor's normal (projected into the rib plane) so the hull lies against
 * a flank; a keel over the crowns, stringers, and surviving curved plates. */
interface Hull { x: number; z: number; length: number; beam: number; height: number; ribs: number; seed: number; plates: number; stringers: boolean }
const SEGS = 12;
function hull(h: Hull): { blocks: VistaBlock[]; pieces: VistaPiece[] } {
  const blocks: VistaBlock[] = [], pieces: VistaPiece[] = [], arcs: (Vec3[] | null)[] = [];
  for (let i = 0; i < h.ribs; i++) {
    const t = i / (h.ribs - 1) - 0.5, taper = 1 - Math.pow(Math.abs(t) * 2, 3) * 0.55;
    const cx = h.x, cz = h.z + t * h.length, half = h.beam / 2 * taper;
    const P = v(cx + half, floor(cx + half, cz) - 1.4, cz), S = v(cx - half, floor(cx - half, cz) - 1.4, cz);
    const gx = (floor(cx + 1, cz) - floor(cx - 1, cz)) / 2, nl = Math.hypot(gx, 1), ux = -gx / nl, uy = 1 / nl, H = h.height * taper;
    const mid = lerp(P, S, 0.5), ax = (P.x - S.x) / 2, ay = (P.y - S.y) / 2, pts: Vec3[] = [];
    for (let j = 0; j <= SEGS; j++) {
      const a = Math.PI * j / SEGS, c = Math.cos(a) * (1 + 0.14 * Math.sin(a)), lift = H * Math.pow(Math.sin(a), 0.65);
      pts.push(v(mid.x + ax * c + ux * lift, mid.y + ay * c + uy * lift, cz));
    }
    const k = hash2(i, h.seed, 3), whole = k >= -0.45;
    arcs.push(whole ? pts : null);
    // Broken ribs keep one side up to a jagged end.
    const keep = whole ? SEGS : Math.floor(SEGS * (0.35 + 0.3 * (k + 1)));
    if (keep < 2) continue;
    const drawn = whole || hash2(i, h.seed, 4) <= 0 ? pts.slice(0, keep + 1) : pts.slice(SEGS - keep);
    pieces.push(...beam(drawn, () => [0.38, 0.38, 0.16], () => k > 0.4 ? "rustDark" : "rust"));
  }
  // A short broken section's ribs taper and lean too fast for straight
  // members between them: ribs and plates only.
  for (const j of h.stringers ? [2, 4, SEGS / 2, SEGS - 4, SEGS - 2] : []) {
    const keel = j === SEGS / 2;
    for (let i = 0; i < h.ribs - 1; i++) {
      const a = arcs[i], c = arcs[i + 1];
      if (a && c) pieces.push(...beam([a[j]!, c[j]!], () => keel ? [0.55, 0.55, 0.24] : [0.22, 0.22, 0.1], () => keel ? "petrol" : "metal"));
    }
  }
  for (let i = 0; i < h.ribs - 1; i++) for (let j = 0; j < SEGS; j++) {
    const a = arcs[i], c = arcs[i + 1];
    if (!a || !c || hash2(i * 7 + j, h.seed, 9) * 0.5 + 0.5 > h.plates) continue;
    // A surviving plate: rib i's skin segment carried straight along Z to the
    // next rib, so it is flat and its slabs across the run stay thin.
    const tone: VistaTone = hash2(i, j, h.seed) > 0.2 ? "metal" : "rust", run = v(a[j + 1]!.x - a[j]!.x, a[j + 1]!.y - a[j]!.y, 0);
    const dz = c[j]!.z - a[j]!.z, far = (p: Vec3): Vec3 => v(p.x, p.y, p.z + dz);
    pieces.push({ closed: false, axis: dominant(run), step: slabStep(run), facets: [{ pts: [a[j]!, a[j + 1]!, far(a[j + 1]!), far(a[j]!)], tone }] });
  }
  return { blocks, pieces };
}

const westHull = hull({ x: 752, z: -588, length: 62, beam: 17, height: 12, ribs: 16, seed: 41, plates: 0.42, stringers: true });
const bowHull = hull({ x: 812, z: -636, length: 26, beam: 12, height: 10, ribs: 7, seed: 77, plates: 0.6, stringers: false });
const beaconBase = v(806, floor(806, -628) - 2, -628), beaconTop = v(801, floor(806, -628) + 19, -626);
const boomA = v(762, floor(762, -598) + 2.5, -598), boomB = v(731, floor(731, -612) + 0.4, -612);

// --- Hearth drop: a faceted rock arch over the descent ----------------------

/** A rock arch between two feet in the plane Z = `z`: a chain of rounded
 * stone prisms along a jittered centreline, thickest at the feet, with
 * varied depth and coral and amber crust on the crown's upper faces. */
function arch(x0: number, x1: number, z: number, apex: number, n: number, r0: number, r1: number, seed: number): VistaPiece[] {
  const a = v(x0, floor(x0, z) - 3, z), c = v(x1, floor(x1, z) - 3, z), top = Math.max(a.y, c.y) + 3 + apex, pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, b = lerp(a, c, u), lift = Math.pow(Math.sin(Math.PI * u), 0.55), edge = i === 0 || i === n ? 0 : 1;
    pts.push(v(b.x + hash2(i, seed, 1) * 0.8 * edge, b.y + (top - b.y) * lift + hash2(i, seed, 2) * 0.6 * edge, z));
  }
  const width = (i: number): number => (r0 + (r1 - r0) * Math.sin(Math.PI * (i + 0.5) / n)) * (1 + 0.1 * hash2(i, seed, 6));
  return beam(pts, i => [width(i), 2.4 + 0.5 * (0.5 + 0.5 * hash2(i, seed, 7)), 0.35], (i, up) => {
    const crown = i >= 2 && i < n - 2;
    return crown && up > 0.55 ? (hash2(i, Math.round(up * 10), seed + 5) > 0 ? "coral" : "amber") : up < -0.6 ? "stoneDark" : hash2(i, seed, 3) > 0 ? "stone" : "stoneDark";
  });
}

// --- Meridian deep works ----------------------------------------------------

const GANTRY_TOP = -735, LEGS = [[1413, -1558], [1467, -1558], [1413, -1606], [1467, -1606]] as const;
function pipe(from: [number, number], to: [number, number], r: number, lift: number): { blocks: VistaBlock[]; pieces: VistaPiece[] } {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]), n = Math.max(2, Math.ceil(len / 6)), pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const x = from[0] + (to[0] - from[0]) * i / n, z = from[1] + (to[1] - from[1]) * i / n, y = floor(x, z) + lift;
    // Level runs between saddles so the pipe never dips into a hollow.
    pts.push(v(x, i ? Math.max(y, pts[i - 1]!.y - 0.6) : y, z));
  }
  const alongX = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]), blocks: VistaBlock[] = [];
  for (const p of pts) {
    const f = floor(p.x, p.z) - 0.6, w = alongX ? 0.3 : r * 1.3, d = alongX ? r * 1.3 : 0.3;
    blocks.push(block(v(p.x - w, f, p.z - d), v(p.x + w, p.y, p.z + d), "petrol"));
  }
  return { blocks, pieces: beam(pts, () => [r, r, 0.3], () => "metal") };
}
const pipes = [pipe([1419, -1601], [1419, -1648], 1.1, 1.8), pipe([1466, -1566], [1466, -1544], 0.9, 1.5),
  pipe([1462, -1590], [1515, -1590], 1.1, 1.8), pipe([1451, -1602], [1451, -1650], 0.8, 1.3)];

// --- Meridian escarpment ----------------------------------------------------

const ESCARPMENT = ROUTES.find(r => r.id === "route.meridian.escarpment")!.path;
/** The escarpment route's X where it crosses `z` (it runs north-south). */
export function escarpmentRouteX(z: number): number {
  for (let i = 0; i < ESCARPMENT.length - 1; i++) {
    const a = ESCARPMENT[i]!, c = ESCARPMENT[i + 1]!;
    if ((z - a.z) * (z - c.z) <= 0 && a.z !== c.z) return a.x + (c.x - a.x) * (z - a.z) / (c.z - a.z);
  }
  return ESCARPMENT[0]!.x;
}
export const ESCARPMENT_MARKERS: readonly { x: number; z: number; h: number }[] = Array.from({ length: 12 }, (_, i) => {
  const z = -845 + i * 22;
  return { x: escarpmentRouteX(z) - 18, z, h: 2.6 + (i % 3) * 0.6 };
});
/** A broken ring of Meridian stone standing on edge in the plane Z = cz,
 * facing the ledge's north approach, its gap at the top. */
export const RING = { x: 1351, z: -690, r: 9.5, thick: 1.6, gap: 0.42 } as const;
/** The ring's centreline, from one side of the gap round to the other. */
export const RING_PATH: readonly Vec3[] = (() => {
  const base = floor(RING.x, RING.z) + RING.r - 1.5, n = 24, span = Math.PI * 2 - RING.gap * 2, pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + RING.gap + span * i / n;
    pts.push(v(RING.x + Math.cos(a) * RING.r, base + Math.sin(a) * RING.r, RING.z));
  }
  return pts;
})();
const ring = (): VistaPiece[] => beam(RING_PATH, () => [RING.thick, RING.thick, 0.3], () => "concrete2");

// --- The sets ---------------------------------------------------------------

export const VISTA_SETS: readonly VistaSet[] = [
  { id: "wreck.hull", region: "silt_basin", anchor: { x: 752, z: -588 }, ...westHull },
  { id: "wreck.bow", region: "silt_basin", anchor: { x: 812, z: -636 }, blocks: [
    ...bowHull.blocks,
    block(v(beaconTop.x - 0.8, beaconTop.y, beaconTop.z - 0.8), v(beaconTop.x + 0.8, beaconTop.y + 1, beaconTop.z + 0.8), "petrol"),
    block(v(beaconTop.x - 0.55, beaconTop.y + 1, beaconTop.z - 0.55), v(beaconTop.x + 0.55, beaconTop.y + 2.1, beaconTop.z + 0.55), "glow"),
  ], pieces: [...bowHull.pieces, ...beam([beaconBase, beaconTop], () => [0.4, 0.4, 0.18], () => "ochre")] },
  { id: "wreck.boom", region: "silt_basin", anchor: { x: 752, z: -605 }, blocks: [
    block(v(boomB.x - 2.5, boomB.y - 0.3, boomB.z - 1.2), v(boomB.x + 0.5, boomB.y + 1.9, boomB.z + 1.2), "rust", "metal"),
  ], pieces: [-1, 1].flatMap(o => beam([v(boomA.x, boomA.y + o * 0.9, boomA.z + o * 0.6), v(boomB.x, boomB.y + o * 0.9, boomB.z + o * 0.6)], () => [0.3, 0.3, 0.13], () => "ochre")) },
  { id: "drop.arch", region: "refuge_reef", anchor: { x: -236, z: -116 }, blocks: [], pieces: arch(-268, -204, -115, 20, 14, 3.0, 2.1, 7) },
  { id: "works.gantry", region: "deep_district", anchor: { x: 1440, z: -1582 }, blocks: [
    ...[-1558, -1606].map(z => block(v(1412, GANTRY_TOP, z - 0.8), v(1468, GANTRY_TOP + 1.6, z + 0.8), "ochre", "steel")),
    ...[1413, 1467].map(x => block(v(x - 0.8, GANTRY_TOP, -1606), v(x + 0.8, GANTRY_TOP + 1.6, -1558), "petrol")),
    block(v(1443.5, GANTRY_TOP - 1.6, -1607), v(1448.5, GANTRY_TOP + 0.4, -1557), "metal"),
    block(v(1445.3, -744.3, -1576.7), v(1446.7, -742.1, -1575.3), "ochre"),
    ...LEGS.map(([x, z]) => block(v(x - 0.45, GANTRY_TOP + 1.6, z - 0.45), v(x + 0.45, GANTRY_TOP + 2.5, z + 0.45), "glow")),
  ], pieces: LEGS.flatMap(([x, z]) => beam([v(x, floor(x, z) - 0.5, z), v(x, GANTRY_TOP, z)], () => [0.7, 0.7, 0.3], () => "ochre")) },
  { id: "works.pipes", region: "deep_district", anchor: { x: 1478, z: -1590 }, blocks: pipes.flatMap(p => p.blocks), pieces: pipes.flatMap(p => p.pieces) },
  ...ESCARPMENT_MARKERS.map((m, i): VistaSet => {
    const y = floor(m.x, m.z) - 0.4;
    return { id: `escarp.marker.${i}`, region: "deep_district", anchor: { x: m.x, z: m.z }, pieces: [], blocks: [
      block(v(m.x - 0.25, y, m.z - 0.25), v(m.x + 0.25, y + m.h, m.z + 0.25), "concrete", "concrete2"),
      block(v(m.x - 0.4, y + m.h, m.z - 0.4), v(m.x + 0.4, y + m.h + 0.25, m.z + 0.4), "ochre"),
      block(v(m.x - 0.15, y + m.h - 0.75, m.z + 0.25), v(m.x + 0.15, y + m.h - 0.25, m.z + 0.31), i % 4 === 3 ? "cyan" : "warm"),
    ] };
  }),
  { id: "escarp.ring", region: "deep_district", anchor: { x: RING.x, z: RING.z }, blocks: [], pieces: ring() },
];

/** One collision box per block and per piece slab, `STRUCTURE_SOLIDS` shape. */
export const VISTA_SOLIDS: readonly { id: string; region: RegionId; bounds: Aabb }[] = VISTA_SETS.flatMap(s => [
  ...s.blocks.map((b, i) => ({ id: `vista.${s.id}.block${i}`, region: s.region, bounds: { min: b.min, max: b.max } })),
  ...s.pieces.flatMap((p, i) => pieceSolids(p).map((bounds, k) => ({ id: `vista.${s.id}.piece${i}.${k}`, region: s.region, bounds }))),
]);

/** The legacy Basin works yard's visual-only dressing (render/ecology.ts),
 * listed here so tests can keep it off the Basin lanes and work poses. */
export const BASIN_YARD = {
  /** Lamp posts: two on the pad's back corners (y given), six on the
   * fracture lip standing on the floor. */
  lamps: [{ x: 208.6, y: -172, z: -245.1 }, { x: 223.4, y: -172, z: -245.1 },
    ...Array.from({ length: 6 }, (_, i) => ({ x: 190 + i * 10, z: -279 + (i % 2) * 1.5 }))] as readonly { x: number; y?: number; z: number }[],
  mast: { x: 230, z: -251, h: 50, half: 2.4 },
  conduit: [[207.4, -172.4, -241], [204.5, -176, -241], [202, -186, -238.5], [199.5, -186.5, -229], [198.6, -181.6, -222.4]] as readonly (readonly [number, number, number])[],
  tubes: [[204, -250, 7], [227, -238, 6], [212, -252, 5]] as readonly (readonly [number, number, number])[],
} as const;
