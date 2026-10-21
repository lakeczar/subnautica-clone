import type { Rect } from "../../world/types.js";

/** Error-bounded terrain tessellation over one chunk cell, sampled only from
 * the physical floor. Babylon-free and deterministic.
 *
 * - **Conformance.** An adaptive quadtree refines every cell whose triangles
 *   stray from the floor by more than the LOD's tolerance, measured as the
 *   distance from floor samples inside each triangle to that triangle's
 *   plane (a vertical miss on flat ground, a horizontal miss on a cliff).
 *   Ramps, cliffs and terrace walls therefore get small cells exactly where
 *   they are; flat sediment keeps large ones.
 * - **Shared borders.** Each chunk edge is refined from the edge alone (the
 *   floor along it and in the two squares either side of each interval), so
 *   both neighbours, at either LOD, emit the identical edge polyline: no
 *   cracks or skirts between ordinary chunks. Cells touching an edge may
 *   only split where the edge has a point.
 * - **Hole.** Cells inside `hole` (today's terrain mesh) are omitted; a short
 *   skirt hangs from every edge facing it, as before.
 * - **Pits.** Cells inside any of `pits` (W1 cave replacement footprints) are
 *   omitted the same way, skirt included. A pit's edges cut the base lattice,
 *   and cut a chunk border only where the pit reaches that border line, so a
 *   neighbour given the same pit emits the identical edge. */
export interface TessellationOptions {
  /** Base cell size, metres (a power of two times the border step). */
  base: number;
  /** Bound on floor-to-triangle-plane distance, metres. */
  tolerance: number;
  /** Smallest cell, metres. */
  min: number;
  hole?: Rect;
  pits?: readonly Rect[];
  /** Called between units of work; return true to yield. */
  due?: () => boolean;
}
export interface Tessellation {
  /** xyz per vertex. Vertex heights are the floor itself. */
  positions: number[];
  triangles: number[];
  /** Pairs of vertex indices along edges facing the hole (top of a skirt). */
  skirtEdges: number[];
}

/** Border sampling step and the shared border tolerance (every LOD). */
export const BORDER_STEP = 4;
export const BORDER_TOLERANCE = 0.14;
export const FINE = { base: 4, tolerance: 0.2, min: 0.25 } as const;
export const COARSE = { base: 16, tolerance: 1.0, min: 0.5 } as const;
/** Border refinement is LOD-independent: every LOD shares one edge. */
export const BORDER_MIN = FINE.min;

type P3 = [number, number, number];
const EPS = 1e-7;
const key = (v: number): string => v.toFixed(6);
/** Numeric point key on a 1/64 m lattice; cells are never smaller than 1/4 m. */
const pkey = (x: number, z: number): number => Math.round((x + 1000) * 64) * 1e7 + Math.round((z + 2000) * 64);
/** Barycentric probes inside each triangle: centroid, edge midpoints, inner thirds. */
const PROBES: readonly (readonly [number, number, number])[] = [
  [1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6],
];

/** Distance from (x, fy, z) to the plane through three points. */
export function planeDistance(ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number, x: number, fy: number, z: number): number {
  const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return 0;
  return Math.abs(nx * (x - ax) + ny * (fy - ay) + nz * (z - az)) / len;
}

/** Points along one chunk edge, refined from the floor along and beside the
 * edge only. `axis` "x" means the edge runs along X at fixed z = `at`. */
export function* borderPoints(floor: (x: number, z: number) => number, axis: "x" | "z", at: number,
  lo: number, hi: number, cuts: readonly number[], min: number, due: () => boolean = () => false): Generator<void, number[]> {
  const p = (u: number, w: number): [number, number] => axis === "x" ? [u, at + w] : [at + w, u];
  const f = (u: number, w: number): number => { const [x, z] = p(u, w); return floor(x, z); };
  const base: number[] = [];
  for (let u = Math.ceil((lo - EPS) / BORDER_STEP) * BORDER_STEP; u < hi - EPS; u += BORDER_STEP) if (u > lo + EPS) base.push(u);
  for (const c of cuts) if (c > lo + EPS && c < hi - EPS) base.push(c);
  base.push(lo, hi);
  base.sort((a, b) => a - b);
  const out: number[] = [];
  const bad = (a: number, b: number): boolean => {
    const s = b - a, fa = f(a, 0), fb = f(b, 0);
    // Along the edge: distance from the floor to the chord.
    for (const t of [0.25, 0.5, 0.75]) {
      const u = a + s * t, y = fa + (fb - fa) * t, g = (fb - fa) / s;
      if (Math.abs(f(u, 0) - y) / Math.hypot(1, g) > BORDER_TOLERANCE) return true;
    }
    // Beside it: each adjoining square, split along the same diagonal and
    // probed the same way as an interior cell.
    for (const side of [-1, 1]) {
      const pa: P3 = [a, fa, 0], pb: P3 = [b, fb, 0], qa: P3 = [a, f(a, side * s), side * s], qb: P3 = [b, f(b, side * s), side * s];
      const tris = Math.abs(fa - qb[1]) <= Math.abs(fb - qa[1]) ? [[pa, pb, qb], [pa, qb, qa]] : [[pa, pb, qa], [pb, qb, qa]];
      for (const [t0, t1, t2] of tris as [P3, P3, P3][]) for (const [wa, wb, wd] of PROBES) {
        const u = t0[0] * wa + t1[0] * wb + t2[0] * wd, w = t0[2] * wa + t1[2] * wb + t2[2] * wd;
        if (planeDistance(t0[0], t0[1], t0[2], t1[0], t1[1], t1[2], t2[0], t2[1], t2[2], u, f(u, w), w) > BORDER_TOLERANCE) return true;
      }
    }
    return false;
  };
  function* refine(a: number, b: number): Generator<void, void> {
    if (due()) yield;
    if (b - a > 2 * min - EPS && bad(a, b)) { const m = (a + b) / 2; yield* refine(a, m); out.push(m); yield* refine(m, b); }
  }
  for (let i = 0; i < base.length - 1; i++) { out.push(base[i]!); yield* refine(base[i]!, base[i + 1]!); }
  out.push(base.at(-1)!);
  return out;
}

interface Cell { x0: number; x1: number; z0: number; z1: number; sig: string; err: number }

export function* tessellate(floor: (x: number, z: number) => number, rect: Rect, o: TessellationOptions): Generator<void, Tessellation> {
  const due = o.due ?? (() => false), hole = o.hole, pits = o.pits ?? [];
  const holes = [...(hole ? [hole] : []), ...pits];
  const heights = new Map<number, number>();
  const H = (x: number, z: number): number => {
    const k = pkey(x, z);
    let y = heights.get(k);
    if (y === undefined) heights.set(k, y = floor(x, z));
    return y;
  };
  const cutsX = hole ? [hole.minX, hole.maxX] : [], cutsZ = hole ? [hole.minZ, hole.maxZ] : [];
  /** Border cuts on one line: the hole's, plus each pit reaching the line. */
  const lineCuts = (axis: "x" | "z", at: number): number[] => [...(axis === "x" ? cutsX : cutsZ),
    ...pits.filter(p => axis === "x" ? p.minZ <= at + EPS && p.maxZ >= at - EPS : p.minX <= at + EPS && p.maxX >= at - EPS)
      .flatMap(p => axis === "x" ? [p.minX, p.maxX] : [p.minZ, p.maxZ])];
  // Shared border sets, keyed by line.
  // Shared border sets, keyed by line; refinement yields as it goes.
  const border = new Map<string, number[]>();
  border.set(`z:${key(rect.minZ)}`, yield* borderPoints(floor, "x", rect.minZ, rect.minX, rect.maxX, lineCuts("x", rect.minZ), BORDER_MIN, due));
  border.set(`z:${key(rect.maxZ)}`, yield* borderPoints(floor, "x", rect.maxZ, rect.minX, rect.maxX, lineCuts("x", rect.maxZ), BORDER_MIN, due));
  border.set(`x:${key(rect.minX)}`, yield* borderPoints(floor, "z", rect.minX, rect.minZ, rect.maxZ, lineCuts("z", rect.minX), BORDER_MIN, due));
  border.set(`x:${key(rect.maxX)}`, yield* borderPoints(floor, "z", rect.maxX, rect.minZ, rect.maxZ, lineCuts("z", rect.maxX), BORDER_MIN, due));
  if (due()) yield;
  const borderHas = (line: string, u: number): boolean => {
    const pts = border.get(line);
    if (!pts) return true;
    let lo = 0, hi = pts.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1, v = pts[m]!; if (Math.abs(v - u) < 1e-6) return true; if (v < u) lo = m + 1; else hi = m - 1; }
    return false;
  };
  // Base cells: a regular lattice, plus the hole's edges as extra lines.
  const axisOf = (a: number, b: number, cuts: readonly number[]): number[] => {
    const v: number[] = [];
    for (let t = a; t < b - EPS; t += o.base) v.push(t);
    v.push(b);
    for (const c of cuts) if (c > a + EPS && c < b - EPS) v.push(c);
    v.sort((p, q) => p - q);
    return v.filter((n, i) => i === 0 || n - v[i - 1]! > 1e-6);
  };
  const xs = axisOf(rect.minX, rect.maxX, [...cutsX, ...pits.flatMap(p => [p.minX, p.maxX])]);
  const zs = axisOf(rect.minZ, rect.maxZ, [...cutsZ, ...pits.flatMap(p => [p.minZ, p.maxZ])]);
  const within = (c: { x0: number; x1: number; z0: number; z1: number }, h: Rect, e: number): boolean =>
    c.x0 >= h.minX - e && c.x1 <= h.maxX + e && c.z0 >= h.minZ - e && c.z1 <= h.maxZ + e;
  const inHole = (c: { x0: number; x1: number; z0: number; z1: number }): boolean => holes.some(h => within(c, h, EPS));
  let cells: Cell[] = [];
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const c = { x0: xs[i]!, x1: xs[i + 1]!, z0: zs[j]!, z1: zs[j + 1]!, sig: "", err: -1 };
    if (!inHole(c)) cells.push(c);
  }
  // Corner points of all leaves plus the border sets, per line.
  let vertical = new Map<string, number[]>(), horizontal = new Map<string, number[]>();
  const lines = (): void => {
    const v = new Map<string, Set<number>>(), h = new Map<string, Set<number>>();
    const add = (m: Map<string, Set<number>>, at: number, vals: readonly number[]): void => {
      const k = key(at);
      let s = m.get(k);
      if (!s) m.set(k, s = new Set());
      for (const x of vals) s.add(x);
    };
    for (const c of cells) { add(v, c.x0, [c.z0, c.z1]); add(v, c.x1, [c.z0, c.z1]); add(h, c.z0, [c.x0, c.x1]); add(h, c.z1, [c.x0, c.x1]); }
    for (const [line, pts] of border) (line[0] === "x" ? (add(v, Number(line.slice(2)), pts)) : add(h, Number(line.slice(2)), pts));
    const sorted = (m: Map<string, Set<number>>): Map<string, number[]> => new Map([...m].map(([k, s]) => {
      const a = [...s].sort((p, q) => p - q);
      return [k, a.filter((n, i) => i === 0 || n - a[i - 1]! > 1e-6)];
    }));
    vertical = sorted(v); horizontal = sorted(h);
  };
  const between = (vals: readonly number[] | undefined, a: number, b: number): number[] => {
    if (!vals) return [];
    let lo = 0, hi = vals.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m]! <= a + 1e-6) lo = m + 1; else hi = m; }
    const out: number[] = [];
    while (lo < vals.length && vals[lo]! < b - 1e-6) out.push(vals[lo++]!);
    return out;
  };
  /** The cell's boundary polygon (counter-clockwise from x0,z0 seen from +Y
   * downward), as XZ pairs, with every point on its sides. */
  const polygon = (c: Cell): [number, number][] => {
    const left = between(vertical.get(key(c.x0)), c.z0, c.z1), right = between(vertical.get(key(c.x1)), c.z0, c.z1);
    const bottom = between(horizontal.get(key(c.z0)), c.x0, c.x1), top = between(horizontal.get(key(c.z1)), c.x0, c.x1);
    return [[c.x0, c.z0], ...left.map(z => [c.x0, z] as [number, number]), [c.x0, c.z1], ...top.map(x => [x, c.z1] as [number, number]),
      [c.x1, c.z1], ...[...right].reverse().map(z => [c.x1, z] as [number, number]), [c.x1, c.z0],
      ...[...bottom].reverse().map(x => [x, c.z0] as [number, number])];
  };
  /** Triangles of a cell as XZ triples: two for a plain square, otherwise a
   * fan from the cell centre over every boundary segment. */
  const triangles = (c: Cell, poly: [number, number][]): [number, number][][] => {
    if (poly.length === 4) {
      const [a, b, d, e] = poly as [[number, number], [number, number], [number, number], [number, number]];
      // Split along the diagonal whose ends differ least in height.
      return Math.abs(H(...a) - H(...d)) <= Math.abs(H(...b) - H(...e)) ? [[a, b, d], [a, d, e]] : [[a, b, e], [b, d, e]];
    }
    const m: [number, number] = [(c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2];
    return poly.map((p, i) => [m, p, poly[(i + 1) % poly.length]!]);
  };
  const error = (c: Cell, poly: [number, number][]): number => {
    let worst = 0;
    for (const t of triangles(c, poly)) {
      const [a, b, d] = t as [[number, number], [number, number], [number, number]];
      const ya = H(...a), yb = H(...b), yd = H(...d);
      for (const [wa, wb, wd] of PROBES) {
        const x = a[0] * wa + b[0] * wb + d[0] * wd, z = a[1] * wa + b[1] * wb + d[1] * wd;
        worst = Math.max(worst, planeDistance(a[0], ya, a[1], b[0], yb, b[1], d[0], yd, d[1], x, H(x, z), z));
      }
    }
    return worst;
  };
  const onBorder = (c: Cell): string[] => {
    const out: string[] = [];
    if (Math.abs(c.z0 - rect.minZ) < EPS) out.push(`z:${key(rect.minZ)}`);
    if (Math.abs(c.z1 - rect.maxZ) < EPS) out.push(`z:${key(rect.maxZ)}`);
    if (Math.abs(c.x0 - rect.minX) < EPS) out.push(`x:${key(rect.minX)}`);
    if (Math.abs(c.x1 - rect.maxX) < EPS) out.push(`x:${key(rect.maxX)}`);
    return out;
  };
  const canSplit = (c: Cell): boolean => {
    if (Math.min(c.x1 - c.x0, c.z1 - c.z0) < 2 * o.min - EPS) return false;
    const mx = (c.x0 + c.x1) / 2, mz = (c.z0 + c.z1) / 2;
    return onBorder(c).every(line => borderHas(line, line[0] === "z" ? mx : mz));
  };
  for (let pass = 0; ; pass++) {
    lines();
    const next: Cell[] = [];
    let split = false;
    for (const c of cells) {
      // Sides only ever gain points (cells split, never merge), so the
      // point count identifies the polygon.
      const poly = polygon(c), sig = String(poly.length);
      if (c.sig !== sig) { c.sig = sig; c.err = error(c, poly); if (due()) yield; }
      if (c.err > o.tolerance && canSplit(c)) {
        const mx = (c.x0 + c.x1) / 2, mz = (c.z0 + c.z1) / 2;
        for (const q of [{ x0: c.x0, x1: mx, z0: c.z0, z1: mz }, { x0: mx, x1: c.x1, z0: c.z0, z1: mz },
          { x0: c.x0, x1: mx, z0: mz, z1: c.z1 }, { x0: mx, x1: c.x1, z0: mz, z1: c.z1 }])
          if (!inHole(q)) next.push({ ...q, sig: "", err: -1 });
        split = true;
      } else next.push(c);
    }
    cells = next;
    if (!split) break;
    if (pass > 40) throw new Error("terrain tessellation did not converge");
  }
  // Emit.
  const positions: number[] = [], tris: number[] = [], skirtEdges: number[] = [], ids = new Map<number, number>();
  const vertex = (x: number, z: number): number => {
    const k = pkey(x, z);
    let i = ids.get(k);
    if (i === undefined) { i = positions.length / 3; ids.set(k, i); positions.push(x, H(x, z), z); }
    return i;
  };
  for (const c of cells) {
    const poly = polygon(c);
    for (const t of triangles(c, poly)) tris.push(...t.map(p => vertex(p[0], p[1])));
    if (holes.length) {
      // Sides facing a hole: the neighbouring area across that side is inside it.
      const sides: [[number, number], [number, number], { x0: number; x1: number; z0: number; z1: number }][] = [
        [[c.x0, c.z0], [c.x0, c.z1], { x0: c.x0 - EPS * 10, x1: c.x0, z0: c.z0, z1: c.z1 }],
        [[c.x1, c.z0], [c.x1, c.z1], { x0: c.x1, x1: c.x1 + EPS * 10, z0: c.z0, z1: c.z1 }],
        [[c.x0, c.z0], [c.x1, c.z0], { x0: c.x0, x1: c.x1, z0: c.z0 - EPS * 10, z1: c.z0 }],
        [[c.x0, c.z1], [c.x1, c.z1], { x0: c.x0, x1: c.x1, z0: c.z1, z1: c.z1 + EPS * 10 }],
      ];
      for (const [a, b, beyond] of sides) {
        if (!holes.some(h => within(beyond, h, 1e-6))) continue;
        const pts = poly.filter(p => (a[0] === b[0] ? Math.abs(p[0] - a[0]) < EPS : Math.abs(p[1] - a[1]) < EPS))
          .sort((p, q) => a[0] === b[0] ? p[1] - q[1] : p[0] - q[0]);
        for (let i = 0; i < pts.length - 1; i++) skirtEdges.push(vertex(...pts[i]!), vertex(...pts[i + 1]!));
      }
    }
    if (due()) yield;
  }
  return { positions, triangles: tris, skirtEdges };
}
