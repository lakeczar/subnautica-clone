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
 *   that box (arch voussoirs, hull plates, beams, markers, saddles).
 * - A `VistaTube` is a polyline of radius `radius`: drawn as a faceted tube
 *   and collided as one box per segment, its bounds grown by `reach` (the
 *   radius, or a collar's) — at most a few decimetres beyond the surface,
 *   since every segment is short or axis-aligned.
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
export interface VistaTube { readonly points: readonly Vec3[]; readonly radius: number; readonly reach: number; readonly tone: VistaTone; readonly sides: number }
export interface VistaSet {
  readonly id: string;
  readonly region: RegionId;
  /** The chunk containing this point builds the set's art. */
  readonly anchor: { readonly x: number; readonly z: number };
  readonly blocks: readonly VistaBlock[];
  readonly tubes: readonly VistaTube[];
}

const floor = worldFloor;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const block = (min: Vec3, max: Vec3, tone: VistaTone, top?: VistaTone): VistaBlock => ({ min, max, tone, ...(top ? { top } : {}) });
const tube = (points: readonly Vec3[], radius: number, tone: VistaTone, sides = 5, reach = radius): VistaTube => ({ points, radius, reach, tone, sides });
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
/** Split a polyline so no segment is longer than `step` (tighter boxes). */
function fine(points: readonly Vec3[], step: number): Vec3[] {
  const out: Vec3[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / step));
    for (let k = 1; k <= n; k++) out.push(lerp(a, b, k / n));
  }
  return out;
}

// --- Wreck ridge: capsized hulls lying along Z on the ridge flanks ---------

/** A capsized hull along +Z: arched ribs in constant-Z planes, rising along
 * the floor's normal (projected into the rib plane) so the hull lies against
 * a flank; a keel over the crowns, stringers, and surviving plates as
 * axis-aligned slabs where the skin runs near-vertical or near-flat. */
interface Hull { x: number; z: number; length: number; beam: number; height: number; ribs: number; seed: number; plates: number }
const SEGS = 12;
function hull(h: Hull): { blocks: VistaBlock[]; tubes: VistaTube[] } {
  const blocks: VistaBlock[] = [], tubes: VistaTube[] = [], arcs: (Vec3[] | null)[] = [];
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
    tubes.push(tube(fine(drawn, 1.2), 0.38, k > 0.4 ? "rustDark" : "rust"));
  }
  for (const j of [2, 4, SEGS / 2, SEGS - 4, SEGS - 2]) {
    const keel = j === SEGS / 2;
    for (let i = 0; i < h.ribs - 1; i++) {
      const a = arcs[i], c = arcs[i + 1];
      if (a && c) tubes.push(tube([a[j]!, c[j]!], keel ? 0.55 : 0.22, keel ? "petrol" : "metal", keel ? 5 : 4));
    }
  }
  for (let i = 0; i < h.ribs - 1; i++) for (let j = 0; j < SEGS; j++) {
    const a = arcs[i], c = arcs[i + 1];
    if (!a || !c || hash2(i * 7 + j, h.seed, 9) * 0.5 + 0.5 > h.plates) continue;
    const pts = [a[j]!, a[j + 1]!, c[j]!, c[j + 1]!];
    const lo = v(Math.min(...pts.map(p => p.x)), Math.min(...pts.map(p => p.y)), a[j]!.z), hi = v(Math.max(...pts.map(p => p.x)), Math.max(...pts.map(p => p.y)), c[j]!.z);
    // Only skin that runs close to an axis becomes a slab; a diagonal patch
    // would need a box much bigger than what it shows.
    if (Math.min(hi.x - lo.x, hi.y - lo.y) > 0.9) continue;
    const grow = (lo2: number, hi2: number): [number, number] => hi2 - lo2 < 0.3 ? [(lo2 + hi2) / 2 - 0.15, (lo2 + hi2) / 2 + 0.15] : [lo2, hi2];
    const [x0, x1] = grow(lo.x, hi.x), [y0, y1] = grow(lo.y, hi.y);
    blocks.push(block(v(x0, y0, lo.z + 0.1), v(x1, y1, hi.z - 0.1), hash2(i, j, h.seed) > 0.2 ? "metal" : "rust"));
  }
  return { blocks, tubes };
}

const westHull = hull({ x: 752, z: -588, length: 62, beam: 17, height: 12, ribs: 16, seed: 41, plates: 0.55 });
const bowHull = hull({ x: 812, z: -636, length: 26, beam: 12, height: 10, ribs: 7, seed: 77, plates: 0.6 });
const beaconBase = v(806, floor(806, -628) - 2, -628), beaconTop = v(801, floor(806, -628) + 19, -626);
const boomA = v(762, floor(762, -598) + 2.5, -598), boomB = v(731, floor(731, -612) + 0.4, -612);

// --- Hearth drop: a stepped stone arch over the descent ---------------------

/** Voussoirs along an arch in the plane Z = `z`: each block spans its stretch
 * of the arch centreline grown by `thick`, `depth` deep, the crown flatter. */
function arch(x0: number, x1: number, z: number, apex: number, n: number, seed: number): VistaBlock[] {
  const a = v(x0, floor(x0, z) - 3, z), c = v(x1, floor(x1, z) - 3, z), top = Math.max(a.y, c.y) + 3 + apex, out: VistaBlock[] = [];
  const at = (u: number): Vec3 => { const b = lerp(a, c, u); return v(b.x, b.y + (top - b.y) * Math.pow(Math.sin(Math.PI * u), 0.55), z); };
  for (let i = 0; i < n; i++) {
    const p = at(i / n), q = at((i + 1) / n), thick = 2.3 + 0.5 * Math.sin(Math.PI * (i + 0.5) / n), depth = 2.4 + 0.5 * hash2(i, seed, 1);
    const crown = i > n * 0.25 && i < n * 0.75;
    out.push(block(v(Math.min(p.x, q.x) - 0.4, Math.min(p.y, q.y) - thick, z - depth), v(Math.max(p.x, q.x) + 0.4, Math.max(p.y, q.y) + thick * 0.6, z + depth - 0.6 * hash2(i, seed, 2)),
      hash2(i, seed, 3) > 0 ? "stone" : "stoneDark", crown ? (hash2(i, seed, 4) > 0 ? "coral" : "amber") : undefined));
  }
  return out;
}

// --- Meridian deep works ----------------------------------------------------

const GANTRY_TOP = -735, LEGS = [[1413, -1558], [1467, -1558], [1413, -1606], [1467, -1606]] as const;
function pipe(from: [number, number], to: [number, number], r: number, lift: number): { blocks: VistaBlock[]; tubes: VistaTube[] } {
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
  return { blocks, tubes: [tube(fine(pts, 2), r, "metal", 8, r * 1.2)] };
}
const pipes = [pipe([1419, -1601], [1419, -1648], 1.1, 1.8), pipe([1462, -1566], [1472, -1544], 0.9, 1.5),
  pipe([1462, -1590], [1515, -1600], 1.1, 1.8), pipe([1450, -1602], [1452, -1650], 0.8, 1.3)];

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
function ring(): VistaTube[] {
  const base = floor(RING.x, RING.z) + RING.r - 1.5, n = 24, span = Math.PI * 2 - RING.gap * 2, pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + RING.gap + span * i / n;
    pts.push(v(RING.x + Math.cos(a) * RING.r, base + Math.sin(a) * RING.r, RING.z));
  }
  return [tube(pts, RING.thick, "concrete2", 4)];
}

// --- The sets ---------------------------------------------------------------

export const VISTA_SETS: readonly VistaSet[] = [
  { id: "wreck.hull", region: "silt_basin", anchor: { x: 752, z: -588 }, ...westHull },
  { id: "wreck.bow", region: "silt_basin", anchor: { x: 812, z: -636 }, blocks: [
    ...bowHull.blocks,
    block(v(beaconTop.x - 0.8, beaconTop.y, beaconTop.z - 0.8), v(beaconTop.x + 0.8, beaconTop.y + 1, beaconTop.z + 0.8), "petrol"),
    block(v(beaconTop.x - 0.55, beaconTop.y + 1, beaconTop.z - 0.55), v(beaconTop.x + 0.55, beaconTop.y + 2.1, beaconTop.z + 0.55), "glow"),
  ], tubes: [...bowHull.tubes, tube(fine([beaconBase, beaconTop], 2), 0.4, "ochre")] },
  { id: "wreck.boom", region: "silt_basin", anchor: { x: 752, z: -605 }, blocks: [
    block(v(boomB.x - 2.5, boomB.y - 0.3, boomB.z - 1.2), v(boomB.x + 0.5, boomB.y + 1.9, boomB.z + 1.2), "rust", "metal"),
  ], tubes: [-1, 1].map(o => tube(fine([v(boomA.x, boomA.y + o * 0.9, boomA.z + o * 0.6), v(boomB.x, boomB.y + o * 0.9, boomB.z + o * 0.6)], 2), 0.3, "ochre")) },
  { id: "drop.arch", region: "refuge_reef", anchor: { x: -236, z: -116 }, blocks: arch(-268, -204, -115, 20, 14, 7), tubes: [] },
  { id: "works.gantry", region: "deep_district", anchor: { x: 1440, z: -1582 }, blocks: [
    ...[-1558, -1606].map(z => block(v(1412, GANTRY_TOP, z - 0.8), v(1468, GANTRY_TOP + 1.6, z + 0.8), "ochre", "steel")),
    ...[1413, 1467].map(x => block(v(x - 0.8, GANTRY_TOP, -1606), v(x + 0.8, GANTRY_TOP + 1.6, -1558), "petrol")),
    block(v(1443.5, GANTRY_TOP - 1.6, -1607), v(1448.5, GANTRY_TOP + 0.4, -1557), "metal"),
    block(v(1445.3, -744.3, -1576.7), v(1446.7, -742.1, -1575.3), "ochre"),
    ...LEGS.map(([x, z]) => block(v(x - 0.45, GANTRY_TOP + 1.6, z - 0.45), v(x + 0.45, GANTRY_TOP + 2.5, z + 0.45), "glow")),
  ], tubes: LEGS.map(([x, z]) => tube([v(x, floor(x, z) - 0.5, z), v(x, GANTRY_TOP, z)], 0.7, "ochre", 6, 0.8)) },
  { id: "works.pipes", region: "deep_district", anchor: { x: 1478, z: -1590 }, blocks: pipes.flatMap(p => p.blocks), tubes: pipes.flatMap(p => p.tubes) },
  ...ESCARPMENT_MARKERS.map((m, i): VistaSet => {
    const y = floor(m.x, m.z) - 0.4;
    return { id: `escarp.marker.${i}`, region: "deep_district", anchor: { x: m.x, z: m.z }, tubes: [], blocks: [
      block(v(m.x - 0.25, y, m.z - 0.25), v(m.x + 0.25, y + m.h, m.z + 0.25), "concrete", "concrete2"),
      block(v(m.x - 0.4, y + m.h, m.z - 0.4), v(m.x + 0.4, y + m.h + 0.25, m.z + 0.4), "ochre"),
      block(v(m.x - 0.15, y + m.h - 0.75, m.z + 0.25), v(m.x + 0.15, y + m.h - 0.25, m.z + 0.31), i % 4 === 3 ? "cyan" : "warm"),
    ] };
  }),
  { id: "escarp.ring", region: "deep_district", anchor: { x: RING.x, z: RING.z }, blocks: [], tubes: ring() },
];

/** One collision box per block and per tube segment, `STRUCTURE_SOLIDS` shape. */
export const VISTA_SOLIDS: readonly { id: string; region: RegionId; bounds: Aabb }[] = VISTA_SETS.flatMap(s => [
  ...s.blocks.map((b, i) => ({ id: `vista.${s.id}.block${i}`, region: s.region, bounds: { min: b.min, max: b.max } })),
  ...s.tubes.flatMap((t, i) => t.points.slice(1).map((b, k) => {
    const a = t.points[k]!, r = t.reach;
    return { id: `vista.${s.id}.tube${i}.${k}`, region: s.region, bounds: {
      min: v(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.min(a.z, b.z) - r),
      max: v(Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, Math.max(a.z, b.z) + r) } };
  })),
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
