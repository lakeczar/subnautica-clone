import { terrainHeight } from "../sim/world.js";
import { BASIN_GEOMETRY, ROUTE_TERRAIN_SOURCE_IDS } from "../content/routes.js";
import { SOURCES } from "../content/registry.js";

/** Render sampling only. The controller, saves and targeting still use the
 * unchanged physical heightfield. Unaffected coarse cells keep the original grid. */
export const TERRAIN_GRID = { nx: 190, nz: 178, minX: -95, minZ: -202, sizeX: 300, sizeZ: 290 } as const;
export const RESOURCE_TERRAIN_BOUNDS = { minX: -24, maxX: 40, minZ: -46, maxZ: -18 } as const;
export const WORKSHOP_DECK = { minX: 3, maxX: 16, minZ: -40, maxZ: -31, top: 1.2 } as const;
/** Keep the original coordinates above: extending a grid must not move its
 * already inspected island, reef or Canopy samples. Remote extension cells
 * are coarse; only work faces need sub-metre samples. */
export const TERRAIN_EXTENT = {
  minX: -95, maxX: 205 + 40 * 300 / 190,
  minZ: -202 - 80 * 290 / 178, maxZ: 88,
} as const;
/** M2-B1 fracture rows, appended south of the M2-A extension rows. */
const FRACTURE_ROWS = [60, 70, 80] as const;

export interface TerrainSurface {
  positions: number[];
  indices: number[];
}

// The rescue bench is an override (including where it lowers the old surface),
// whereas the three shared Basin pads raise it. These are physical boundaries,
// not a camera/contact sample list. Only the legacy bench lacks a shared datum.
const discontinuities = [
  { minX: 38, maxX: 54, minZ: -60, maxZ: -48 },
  ...BASIN_GEOMETRY.terrainPads,
] as const;
const CONFORMITY_BOUNDS = { minX: 36, maxX: 250, minZ: -334, maxZ: -38 } as const;
const SMOOTH_ERROR = .095; // Margin below the .1 m submitted-float32 target.
const LIMIT_STEP = 1e-7;
type Point = readonly [number, number, number];
interface Cell { a: number; b: number; c: number; d: number; conform: boolean; side: number }

/** The surface's base grid lines (before local refinement), ascending: an
 * extent edge on one of these clips the terrain along a straight line. */
export function terrainGridLines(): { x: number[]; z: number[] } {
  const g = TERRAIN_GRID;
  const x = Array.from({ length: g.nx + 1 }, (_, i) => g.minX + i / g.nx * g.sizeX);
  const z = Array.from({ length: g.nz + 1 }, (_, i) => g.minZ + i / g.nz * g.sizeZ);
  for (let i = 10; i <= 40; i += 10) x.push(205 + i * g.sizeX / g.nx);
  for (let i = 50; i >= 10; i -= 10) z.unshift(g.minZ - i * g.sizeZ / g.nz);
  for (const i of FRACTURE_ROWS) z.unshift(g.minZ - i * g.sizeZ / g.nz);
  return { x, z: z.sort((a, b) => a - b) };
}

/** Horizontal window, half-open: [minX, maxX) x [minZ, maxZ). */
export interface TerrainWindow { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
/** Metres of surrounding cells a window refines with it, so every triangle it
 * keeps sees exactly the neighbours the whole surface would. Proven per chunk
 * by tests/terrain-chunks.test.ts against the whole surface. */
export const TERRAIN_WINDOW_HALO = 6;

/** The whole surface (no window), or exactly the whole surface's triangles
 * whose XZ centroid lies in `window`, with the closed walls of their seams. */
export function createTerrainSurface(window?: TerrainWindow): TerrainSurface {
  const steps = terrainSurfaceSteps(window ? { window } : {});
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

let benchCrossingCache: number[] | null = null;

/** Preserve the island/deck extraction and untouched coarse diagonals. Within
 * the adjoining route, refine by measured triangle error, including transition
 * fans. Physical jumps have coincident XZ edges, separate one-sided heights and
 * closed vertical faces: increasing sampling alone cannot represent a jump.
 * A window refines only its own cells plus a halo (refinement is local), and
 * yields whenever `due()` is true, so a chunk builds in bounded steps. */
export function* terrainSurfaceSteps(options: {
  window?: TerrainWindow; halo?: number; due?: () => boolean;
} = {}): Generator<void, TerrainSurface> {
  const { window, due = () => false } = options, halo = options.halo ?? TERRAIN_WINDOW_HALO;
  const keep = (x: number, z: number): boolean => !window ||
    (x >= window.minX && x < window.maxX && z >= window.minZ && z < window.maxZ);
  const g = TERRAIN_GRID, patch = RESOURCE_TERRAIN_BOUNDS, deck = WORKSHOP_DECK;
  const positions: number[] = [], indices: number[] = [], vertices = new Map<string, number>();
  const { x: xAxis, z: zAxis } = terrainGridLines();
  const axis = (a: number, b: number, divisions: number, cuts: readonly number[]): number[] => {
    const values = Array.from({ length: divisions + 1 }, (_, i) => a + (b - a) * i / divisions);
    for (const cut of cuts) if (cut > a && cut < b) values.push(cut);
    return [...new Set(values)].sort((x, y) => x - y);
  };
  const nx = xAxis.length - 1, nz = zAxis.length - 1;
  const onBoundary = (x: number, z: number, p: typeof discontinuities[number]): boolean =>
    x >= p.minX - 1e-9 && x <= p.maxX + 1e-9 && z >= p.minZ - 1e-9 && z <= p.maxZ + 1e-9 &&
    (Math.abs(x - p.minX) < 1e-9 || Math.abs(x - p.maxX) < 1e-9 ||
      Math.abs(z - p.minZ) < 1e-9 || Math.abs(z - p.maxZ) < 1e-9);
  const region = (x: number, z: number): number => discontinuities.findIndex(p =>
    x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ);
  const height = (x: number, z: number, side: number): number => {
    // Closed tops own the exact boundary, just as terrainHeight does. Exterior
    // vertices evaluate its outward limit without moving their XZ coordinates.
    let qx = x, qz = z;
    for (let i = 0; i < discontinuities.length; i++) {
      const p = discontinuities[i]!;
      if (i === side || !onBoundary(x, z, p)) continue;
      if (Math.abs(x - p.minX) < 1e-9) qx -= LIMIT_STEP;
      if (Math.abs(x - p.maxX) < 1e-9) qx += LIMIT_STEP;
      if (Math.abs(z - p.minZ) < 1e-9) qz -= LIMIT_STEP;
      if (Math.abs(z - p.maxZ) < 1e-9) qz += LIMIT_STEP;
    }
    if (qx === x && qz === z) return terrainHeight(x, z);
    const h = terrainHeight(qx, qz), closed = terrainHeight(x, z);
    // Weld a continuous pad endpoint / bench crossing. This is far below both
    // float32 height precision and the error budget, and avoids zero-area walls.
    return Math.abs(h - closed) < 1e-5 ? closed : h;
  };
  // Where the bench cuts down into the island, its perimeter changes which
  // side is higher. Split at those geometric crossings before making walls;
  // otherwise a quad would fold through itself. No source formula is copied.
  const bench = discontinuities[0];
  const benchCrossings: number[] = benchCrossingCache ?? [];
  if (!benchCrossingCache) for (const z of [bench.minZ, bench.maxZ]) {
    const delta = (x: number): number => height(x, z, -1) - terrainHeight(x, z);
    for (let a = bench.minX; a < bench.maxX; a += .25) {
      if (due()) yield;
      let lo: number = a, hi = a + .25, flo = delta(lo);
      if (flo * delta(hi) >= 0) continue;
      for (let n = 0; n < 45; n++) {
        const mid = (lo + hi) / 2, f = delta(mid);
        if (flo * f > 0) { lo = mid; flo = f; } else hi = mid;
      }
      benchCrossings.push((lo + hi) / 2);
    }
  }
  benchCrossingCache = benchCrossings;
  let cells: Cell[] = [];
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const x0 = xAxis[x]!, x1 = xAxis[x + 1]!, z0 = zAxis[z]!, z1 = zAxis[z + 1]!;
    if (window && (x1 <= window.minX - halo || x0 >= window.maxX + halo ||
      z1 <= window.minZ - halo || z0 >= window.maxZ + halo)) continue;
    if (due()) yield;
    const island = x0 < patch.maxX && x1 > patch.minX && z0 < patch.maxZ && z1 > patch.minZ;
    const cutsX: number[] = island ? [deck.minX, deck.maxX] : [];
    const cutsZ: number[] = island ? [deck.minZ, deck.maxZ] : [];
    const crease = (x0 < 42 && x1 > 42) || (x0 < 102 && x1 > 102);
    const extension = x0 >= g.minX + g.sizeX || z1 <= g.minZ;
    const conform = crease || extension || (x0 < CONFORMITY_BOUNDS.maxX && x1 > CONFORMITY_BOUNDS.minX &&
      z0 < CONFORMITY_BOUNDS.maxZ && z1 > CONFORMITY_BOUNDS.minZ);
    if (conform) cutsX.push(42, 102); // Actual canopy slope derivative breaks.
    // Centre the work-face cells on their physical source datum. The old .7 m
    // grid had arbitrary phase inside a much larger extension cell. Preserve
    // the stock/host support with bounded local sampling, then apply the same
    // geometric error criterion as the surrounding ledge.
    for (const id of ROUTE_TERRAIN_SOURCE_IDS) {
      const p = SOURCES[id].position;
      if (x0 >= p.x + 4.6 || x1 <= p.x - 4.6 || z0 >= p.z + 4.6 || z1 <= p.z - 4.6) continue;
      for (let n = -11; n <= 11; n++) {
        cutsX.push(p.x + (n + .5) * .4);
        cutsZ.push(p.z + (n + .5) * .4);
      }
    }
    for (const p of discontinuities) if (x0 < p.maxX && x1 > p.minX && z0 < p.maxZ && z1 > p.minZ) {
      cutsX.push(p.minX, p.maxX);
      cutsZ.push(p.minZ, p.maxZ);
      if (p === bench) cutsX.push(...benchCrossings);
    }
    const dx = island ? 8 : 1, dz = island ? 8 : 1;
    const xs = axis(x0, x1, dx, cutsX), zs = axis(z0, z1, dz, cutsZ);
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i]!, b = xs[i + 1]!, c = zs[j]!, d = zs[j + 1]!;
      if (a >= deck.minX && b <= deck.maxX && c >= deck.minZ && d <= deck.maxZ) continue;
      cells.push({ a, b, c, d, conform, side: region((a + b) / 2, (c + d) / 2) });
    }
  }
  // Shared corners are the same Point objects (see `point`), so most lookups
  // hit by identity; the 9-decimal key still decides which vertices merge.
  const known = new WeakMap<Point, number>();
  const vertex = (p: Point): number => {
    let index = known.get(p);
    if (index !== undefined) return index;
    const [x, y, z] = p;
    const key = `${x.toFixed(9)},${y.toFixed(9)},${z.toFixed(9)}`;
    index = vertices.get(key);
    if (index === undefined) {
      index = positions.length / 3;
      vertices.set(key, index);
      positions.push(x, y, z);
    }
    known.set(p, index);
    return index;
  };
  /** One Point per exact (x, z, side): the floor is sampled once per corner. */
  const points = new Map<number, Map<number, Map<number, Point>>>();
  const sample = (x: number, z: number, side: number): Point => {
    let bySide = points.get(side);
    if (!bySide) points.set(side, bySide = new Map());
    let column = bySide.get(x);
    if (!column) bySide.set(x, column = new Map());
    let p = column.get(z);
    if (!p) column.set(z, p = [x, height(x, z, side), z]);
    return p;
  };
  let vertical = new Map<string, number[]>(), horizontal = new Map<string, number[]>();
  /** The original rule: rebuild every line from all cells each pass, then
   * keep one double per 9-decimal key. Used only after a collision (two
   * different doubles with one key), where the rebuild order decides which
   * double represents the key. */
  const lines = function* (): Generator<void, void> {
    const v = new Map<string, Set<number>>(), h = new Map<string, Set<number>>();
    const add = (map: Map<string, Set<number>>, at: number, values: number[]): void => {
      const key = at.toFixed(9);
      if (!map.has(key)) map.set(key, new Set());
      for (const value of values) map.get(key)!.add(value);
    };
    let n = 0;
    for (const { a, b, c, d } of cells) {
      add(v, a, [c, d]); add(v, b, [c, d]);
      add(h, c, [a, b]); add(h, d, [a, b]);
      if ((++n & 255) === 0 && due()) yield;
    }
    const sorted = function* (map: Map<string, Set<number>>): Generator<void, Map<string, number[]>> {
      const out = new Map<string, number[]>();
      for (const [k, vs] of map) {
        out.set(k, [...new Map([...vs].map(n => [n.toFixed(9), n])).values()].sort((a, b) => a - b));
        if (due()) yield;
      }
      return out;
    };
    vertical = yield* sorted(v); horizontal = yield* sorted(h);
  };
  // Cells only ever split, so every line only gains values: the lines can be
  // maintained as cells appear instead of rebuilt per pass. Without a key
  // collision this is exactly the rebuild's result (sorted distinct values).
  const changedV = new Set<string>(), changedH = new Set<string>();
  let rebuild = false;
  const insert = (map: Map<string, number[]>, changed: Set<string>, at: number, values: readonly number[]): void => {
    const key = at.toFixed(9);
    let line = map.get(key);
    if (!line) map.set(key, line = []);
    for (const value of values) {
      let lo = 0, hi = line.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (line[mid]! < value) lo = mid + 1; else hi = mid; }
      if (line[lo] === value) continue;
      const k = value.toFixed(9);
      if (line[lo]?.toFixed(9) === k || (lo > 0 && line[lo - 1]!.toFixed(9) === k)) rebuild = true;
      line.splice(lo, 0, value);
      changed.add(key);
    }
  };
  const addCell = ({ a, b, c, d }: Cell): void => {
    insert(vertical, changedV, a, [c, d]); insert(vertical, changedV, b, [c, d]);
    insert(horizontal, changedH, c, [a, b]); insert(horizontal, changedH, d, [a, b]);
  };
  const keys = new WeakMap<Cell, readonly [string, string, string, string]>();
  /** A line along one of the cell's edges gained values since the last pass. */
  const touched = (cell: Cell): boolean => {
    let k = keys.get(cell);
    if (!k) keys.set(cell, k = [cell.a.toFixed(9), cell.b.toFixed(9), cell.c.toFixed(9), cell.d.toFixed(9)]);
    return changedV.has(k[0]) || changedV.has(k[1]) || changedH.has(k[2]) || changedH.has(k[3]);
  };
  const between = (values: readonly number[] = [], a: number, b: number): number[] => {
    let lo = 0, hi = values.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid]! <= a + 1e-9) lo = mid + 1; else hi = mid; }
    const result: number[] = [];
    while (lo < values.length && values[lo]! < b - 1e-9) result.push(values[lo++]!);
    return result;
  };
  const triangles = ({ a, b, c, d, side, conform }: Cell, emit: (a: Point, b: Point, c: Point, side: number) => void): void => {
  const point = (x: number, z: number): Point => sample(x, z, side);
  // Neighbours share every edge vertex even where their resolutions
  // differ. Only a boundary subcell needs a fan; untouched cells retain
  // their exact original two control triangles and diagonal.
  const left = between(vertical.get(a.toFixed(9))!, c, d);
  const right = between(vertical.get(b.toFixed(9))!, c, d);
  const bottom = between(horizontal.get(c.toFixed(9))!, a, b);
  const top = between(horizontal.get(d.toFixed(9))!, a, b);
  if (!left.length && !right.length && !bottom.length && !top.length) {
    emit(point(a, c), point(a, d), point(b, c), side);
    emit(point(b, c), point(a, d), point(b, d), side);
  } else {
    const edge = [point(a, c), ...left.map(v => point(a, v)), point(a, d),
      ...top.map(v => point(v, d)), point(b, d), ...right.reverse().map(v => point(b, v)),
      point(b, c), ...bottom.reverse().map(v => point(v, c))];
    if (!conform) {
      const center = point((a + b) / 2, (c + d) / 2);
      for (let k = 0; k < edge.length; k++) emit(center, edge[k]!, edge[(k + 1) % edge.length]!, side);
    } else {
      // Triangulate the convex boundary without introducing an extra
      // height sample in its centre. Preserve every collinear edge point;
      // removing one would make a T-junction in the adjoining surface.
      while (edge.length > 3) {
        let ear = -1, shortest = Infinity;
        for (let i = 0; i < edge.length; i++) {
          const prev = edge[(i + edge.length - 1) % edge.length]!, cur = edge[i]!, next = edge[(i + 1) % edge.length]!;
          const cross = (cur[0] - prev[0]) * (next[2] - cur[2]) - (cur[2] - prev[2]) * (next[0] - cur[0]);
          const diagonal = (prev[0] - next[0]) ** 2 + (prev[2] - next[2]) ** 2;
          if (cross < -1e-12 && diagonal < shortest) { ear = i; shortest = diagonal; }
        }
        if (ear < 0) throw new Error("Degenerate terrain boundary");
        emit(edge[(ear + edge.length - 1) % edge.length]!, edge[ear]!, edge[(ear + 1) % edge.length]!, side);
        edge.splice(ear, 1);
      }
      emit(edge[0]!, edge[1]!, edge[2]!, side);
    }
  }
  };
  // Check the actual float32 triangles, not a curvature heuristic at the cell
  // centre. Recheck after neighbours change: their new shared vertices can
  // replace a coarse diagonal with a transition fan.
  const probes: [number, number, number][] = [[1 / 3, 1 / 3, 1 / 3]];
  for (let u = 0; u <= 4; u++) for (let v = 0; v <= 4 - u; v++)
    if (u !== 4 && v !== 4 && u + v !== 0) probes.push([u / 4, v / 4, 1 - (u + v) / 4]);
  const errors = new WeakMap<Cell, { border: string; maximum: number }>();
  const error = (cell: Cell): number => {
    const border = [between(vertical.get(cell.a.toFixed(9)), cell.c, cell.d),
      between(vertical.get(cell.b.toFixed(9)), cell.c, cell.d),
      between(horizontal.get(cell.c.toFixed(9)), cell.a, cell.b),
      between(horizontal.get(cell.d.toFixed(9)), cell.a, cell.b)].map(v => v.join(",")).join("/");
    const cached = errors.get(cell);
    if (cached?.border === border) return cached.maximum;
    let maximum = 0;
    triangles(cell, (a, b, c, side) => {
      const p = [a, b, c].map(v => v.map(Math.fround));
      for (const weights of probes) {
        const at = (axis: number): number => weights.reduce((n, w, i) => n + w * p[i]![axis]!, 0);
        maximum = Math.max(maximum, Math.abs(at(1) - height(at(0), at(2), side)));
      }
    });
    errors.set(cell, { border, maximum });
    return maximum;
  };
  const split = (cell: Cell, alongX: boolean): Cell[] => alongX ?
    [{ ...cell, b: (cell.a + cell.b) / 2 }, { ...cell, a: (cell.a + cell.b) / 2 }] :
    [{ ...cell, d: (cell.c + cell.d) / 2 }, { ...cell, c: (cell.c + cell.d) / 2 }];
  for (let i = 0; i < cells.length; i++) {
    addCell(cells[i]!);
    if ((i & 255) === 255 && due()) yield;
  }
  // A cell whose edges and lines are unchanged since it was last checked and
  // kept makes the same decision again: only new and touched cells are checked.
  let fresh: Set<Cell> | null = null;
  for (;;) {
    if (rebuild) { yield* lines(); fresh = null; }
    const refine = new Map<Cell, Cell[]>();
    let checked = 0;
    for (const cell of cells) {
      if ((++checked & 255) === 0 && due()) yield;
      if (fresh && !fresh.has(cell) && !touched(cell)) continue;
      if (due()) yield;
      // A refined edge can change a neighbour outside the primary patch too.
      // Validate that complete transition, rather than declaring the bounded
      // patch accurate while leaving its new border fan unchecked.
      if (!cell.conform && !between(vertical.get(cell.a.toFixed(9)), cell.c, cell.d).length &&
        !between(vertical.get(cell.b.toFixed(9)), cell.c, cell.d).length &&
        !between(horizontal.get(cell.c.toFixed(9)), cell.a, cell.b).length &&
        !between(horizontal.get(cell.d.toFixed(9)), cell.a, cell.b).length) continue;
      if (error(cell) <= SMOOTH_ERROR) continue;
      // Split only the direction that improves the submitted geometry most.
      // A steep but nearly linear slope needs no unnecessary cross-slope grid.
      const x = split({ ...cell, conform: true }, true), z = split({ ...cell, conform: true }, false);
      const width = cell.b - cell.a, depth = cell.d - cell.c;
      refine.set(cell, width > depth * 4 ? x : depth > width * 4 ? z :
        Math.max(...x.map(error)) < Math.max(...z.map(error)) ? x : z);
    }
    if (!refine.size) break;
    const next: Cell[] = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!, parts = refine.get(cell);
      if (parts) next.push(...parts); else next.push(cell);
      if ((i & 1023) === 1023 && due()) yield;
    }
    cells = next;
    changedV.clear(); changedH.clear();
    fresh = new Set();
    for (const children of refine.values()) for (const child of children) {
      addCell(child); fresh.add(child);
      if (due()) yield;
    }
  }
  const tops: number[] = [], outer: number[] = [];
  const seams = new Map<string, { a: Point; b: Point }[]>();
  const kept = (...points: Point[]): boolean =>
    keep(points.reduce((n, p) => n + p[0], 0) / points.length, points.reduce((n, p) => n + p[2], 0) / points.length);
  let emitted = 0;
  for (const cell of cells) {
    if ((++emitted & 15) === 0 && due()) yield;
    triangles(cell, (a, b, c, side) => {
      const points = [a, b, c];
      if (kept(a, b, c)) (side < 0 ? outer : tops).push(...points.map(vertex));
      for (let j = 0; j < 3; j++) {
        const p = points[j]!, q = points[(j + 1) % 3]!;
        if (!discontinuities.some(d => onBoundary(p[0], p[2], d) && onBoundary(q[0], q[2], d) &&
          (Math.abs(p[0] - q[0]) < 1e-9 || Math.abs(p[2] - q[2]) < 1e-9))) continue;
        const keys = [p, q].map(v => `${v[0].toFixed(9)},${v[2].toFixed(9)}`).sort();
        const key = keys.join("/");
        if (!seams.has(key)) seams.set(key, []);
        seams.get(key)!.push({ a: p, b: q });
      }
    });
  }
  // Closed-boundary triangles precede exterior ones for deterministic height
  // queries at the discontinuity itself. Rasterized walls close both limits.
  for (let i = 0; i < tops.length; i++) { indices.push(tops[i]!); if ((i & 4095) === 4095 && due()) yield; }
  for (let i = 0; i < outer.length; i++) { indices.push(outer[i]!); if ((i & 4095) === 4095 && due()) yield; }
  const same = (p: Point, q: Point): boolean => p.every((n, i) => n.toFixed(9) === q[i]!.toFixed(9));
  for (const pair of seams.values()) {
    if (pair.length !== 2) {
      // A window's halo can cut a seam's far side. A kept seam never is.
      if (window && !kept(pair[0]!.a, pair[0]!.b)) continue;
      throw new Error("Unmatched terrain discontinuity");
    }
    const [one, two] = pair as [{ a: Point; b: Point }, { a: Point; b: Point }];
    const high = one.a[1] + one.b[1] >= two.a[1] + two.b[1] ? one : two;
    const low = high === one ? two : one;
    // The adjacent top edges have opposite winding. Reuse their actual vertices.
    if (!same(high.a, low.b) && kept(high.b, high.a, low.b)) indices.push(vertex(high.b), vertex(high.a), vertex(low.b));
    if (!same(high.b, low.a) && kept(high.b, low.b, low.a)) indices.push(vertex(high.b), vertex(low.b), vertex(low.a));
  }
  return { positions, indices };
}
