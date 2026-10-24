import { boxDistance } from "./frame.js";
import type { Aabb, SpatialEntry, SpatialKind, SpatialQuery, Vec3 } from "./types.js";

/** Uniform X/Z grid broad phase. Entries are boxes; Y is tested exactly per
 * candidate. A box spanning more than `oversizeCells` cells is kept in one
 * always-tested list instead of being written into every cell. Results are
 * sorted by insertion index so scans over a subset keep roster order. */
export function createSpatialIndex<T = unknown>(
  entries: readonly SpatialEntry<T>[],
  cellSize = 32,
  oversizeCells = 256,
): SpatialQuery<T> {
  const build = buildSpatialIndex(entries, cellSize, oversizeCells, Infinity);
  for (let r = build.next(); ; r = build.next()) if (r.done) return r.value;
}

/** `createSpatialIndex` in slices: yields after every `slice` entries, so a
 * large roster (a cave cluster's 10k+ boxes) indexes inside a frame budget.
 * The finished index is identical. */
export function* buildSpatialIndex<T = unknown>(
  entries: readonly SpatialEntry<T>[],
  cellSize = 32,
  oversizeCells = 256,
  slice = 2048,
): Generator<void, SpatialQuery<T>> {
  const list = [...entries];
  const byId = new Map<string, SpatialEntry<T>>();
  for (const [i, entry] of list.entries()) {
    if (byId.has(entry.id)) throw new Error(`Duplicate spatial entry id: ${entry.id}`);
    const { min, max } = entry.bounds;
    if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) ||
      min.x > max.x || min.y > max.y || min.z > max.z) throw new Error(`Invalid bounds for spatial entry: ${entry.id}`);
    byId.set(entry.id, entry);
    if ((i + 1) % slice === 0) yield;
  }
  const cells = new Map<number, number[]>(), oversize: number[] = [];
  // Cell keys pack signed indices; +/-2^15 cells of 32 m covers +/-1000 km.
  const key = (ix: number, iz: number): number => (ix + 32768) * 65536 + (iz + 32768);
  const cell = (v: number): number => Math.floor(v / cellSize);
  for (const [i, entry] of list.entries()) {
    const { min, max } = entry.bounds;
    const x0 = cell(min.x), x1 = cell(max.x), z0 = cell(min.z), z1 = cell(max.z);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > oversizeCells) { oversize.push(i); continue; }
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = key(ix, iz), bucket = cells.get(k);
      if (bucket) bucket.push(i); else cells.set(k, [i]);
    }
    if ((i + 1) % slice === 0) yield;
  }
  const seen = new Uint32Array(list.length);
  let stamp = 0;

  /** Every entry whose cells overlap the X/Z rectangle and that passes `keep`. */
  const gather = (minX: number, maxX: number, minZ: number, maxZ: number,
    keep: (entry: SpatialEntry<T>) => boolean): SpatialEntry<T>[] => {
    if (++stamp === 0xffffffff) { seen.fill(0); stamp = 1; }
    const hits: number[] = [];
    const visit = (i: number): void => {
      if (seen[i] === stamp) return;
      seen[i] = stamp;
      if (keep(list[i]!)) hits.push(i);
    };
    for (const i of oversize) visit(i);
    const x0 = cell(minX), x1 = cell(maxX), z0 = cell(minZ), z1 = cell(maxZ);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > cells.size) {
      // A query wider than the populated grid: scanning buckets is cheaper.
      for (const bucket of cells.values()) for (const i of bucket) visit(i);
    } else {
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const bucket = cells.get(key(ix, iz));
        if (bucket) for (const i of bucket) visit(i);
      }
    }
    return hits.sort((a, b) => a - b).map(i => list[i]!);
  };
  const kindFilter = (kinds?: readonly SpatialKind[]) =>
    kinds && kinds.length ? (e: SpatialEntry<T>) => kinds.includes(e.kind) : () => true;

  const near = (p: Readonly<Vec3>, radius: number, kinds?: readonly SpatialKind[]): SpatialEntry<T>[] => {
    const ok = kindFilter(kinds);
    return gather(p.x - radius, p.x + radius, p.z - radius, p.z + radius,
      e => ok(e) && boxDistance(e.bounds, p) <= radius);
  };

  // dataInBox's query and hit buffer (indices), reused; they never outlive a call.
  let hits = new Int32Array(64), hitCount = 0;
  let qKind: SpatialKind = "solid", qMinX = 0, qMaxX = 0, qMinY = 0, qMaxY = 0, qMinZ = 0, qMaxZ = 0;
  const test = (i: number): void => {
    if (seen[i] === stamp) return;
    seen[i] = stamp;
    const e = list[i]!, b = e.bounds;
    if (e.kind === qKind && b.min.x <= qMaxX && b.max.x >= qMinX && b.min.y <= qMaxY && b.max.y >= qMinY && b.min.z <= qMaxZ && b.max.z >= qMinZ) {
      if (hitCount === hits.length) { const grown = new Int32Array(hits.length * 2); grown.set(hits); hits = grown; }
      hits[hitCount++] = i;
    }
  };
  return {
    dataInBox(box, kind, out) {
      if (++stamp === 0xffffffff) { seen.fill(0); stamp = 1; }
      hitCount = 0;
      qKind = kind; qMinX = box.min.x; qMaxX = box.max.x; qMinY = box.min.y; qMaxY = box.max.y; qMinZ = box.min.z; qMaxZ = box.max.z;
      const minX = qMinX, maxX = qMaxX, minZ = qMinZ, maxZ = qMaxZ;
      for (let k = 0; k < oversize.length; k++) test(oversize[k]!);
      const x0 = cell(minX), x1 = cell(maxX), z0 = cell(minZ), z1 = cell(maxZ);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > cells.size) {
        for (const bucket of cells.values()) for (let k = 0; k < bucket.length; k++) test(bucket[k]!);
      } else {
        for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
          const bucket = cells.get(key(ix, iz));
          if (bucket) for (let k = 0; k < bucket.length; k++) test(bucket[k]!);
        }
      }
      // Ascending index order, as inBox: insertion sort for a few hits (no
      // allocation), the native numeric sort beyond (hits gathered from many
      // cells arrive out of order, and insertion sort is quadratic).
      if (hitCount > 24) hits.subarray(0, hitCount).sort();
      else for (let k = 1; k < hitCount; k++) {
        const v = hits[k]!;
        let j = k - 1;
        for (; j >= 0 && hits[j]! > v; j--) hits[j + 1] = hits[j]!;
        hits[j + 1] = v;
      }
      for (let k = 0; k < hitCount; k++) out[k] = list[hits[k]!]!.data as T;
      return hitCount;
    },
    get size() { return list.length; },
    get(id) { return byId.get(id); },
    inBox(box: Aabb, kinds) {
      const ok = kindFilter(kinds);
      return gather(box.min.x, box.max.x, box.min.z, box.max.z, e => ok(e) &&
        e.bounds.min.x <= box.max.x && e.bounds.max.x >= box.min.x &&
        e.bounds.min.y <= box.max.y && e.bounds.max.y >= box.min.y &&
        e.bounds.min.z <= box.max.z && e.bounds.max.z >= box.min.z);
    },
    near,
    alongSegment(a, b, pad = 0, kinds) {
      const ok = kindFilter(kinds);
      return gather(Math.min(a.x, b.x) - pad, Math.max(a.x, b.x) + pad,
        Math.min(a.z, b.z) - pad, Math.max(a.z, b.z) + pad, e => ok(e) && segmentTouches(a, b, e.bounds, pad));
    },
    nearest(p, kinds, maxDistance = Infinity) {
      // near() returns everything within r, so the first non-empty ring holds
      // the global nearest. Double r until found or past maxDistance.
      for (let r = cellSize; ; r *= 2) {
        const radius = Math.min(r, maxDistance);
        const found = near(p, radius, kinds);
        if (found.length) {
          let best = found[0]!, bestDistance = boxDistance(best.bounds, p);
          for (const e of found) {
            const d = boxDistance(e.bounds, p);
            if (d < bestDistance) { best = e; bestDistance = d; }
          }
          return best;
        }
        if (radius >= maxDistance || r > 1e7) return null;
      }
    },
  };
}

/** Slab test of segment a→b against `box` inflated by `pad`. */
export function segmentTouches(a: Readonly<Vec3>, b: Readonly<Vec3>, box: Aabb, pad = 0): boolean {
  let enter = 0, exit = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const lo = box.min[axis] - pad, hi = box.max[axis] + pad, d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-12) {
      if (a[axis] < lo || a[axis] > hi) return false;
      continue;
    }
    const t1 = (lo - a[axis]) / d, t2 = (hi - a[axis]) / d;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (enter > exit) return false;
  }
  return true;
}
