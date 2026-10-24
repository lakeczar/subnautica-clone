import type { KitCaveStream } from "../../sim/world.js";
import type { Rect, Vec3 } from "../types.js";

/** Predictive cave streaming (CW-1, owner rule "streaming without pauses"),
 * Babylon-free. Each frame it decides, from the viewer and its velocity:
 * - **prefetch:** cave clusters within `prefetch` metres of the viewer now,
 *   or of where its heading puts it in `lookAhead` seconds, are wanted,
 *   nearest first; their collision composites are built in slices within
 *   `budgetMs` per frame. About 360 m ahead is 20–30 s even at Dart speed.
 * - **eviction:** resident clusters past `evict` metres, behind the viewer
 *   first, then anything past `evictFar`; and, over `maxBoxes`, the farthest
 *   behind first until the rest fits. The viewer's own and wanted clusters
 *   are never dropped.
 * - **light:** the caves whose light fields should be fetched (`lightRange`)
 *   and uploaded (`uploadRange`), for the renderer.
 * Eviction only drops a derived composite: a query that needs it again
 * rebuilds the same thing (counted as a synchronous build). */
export interface KitStreamOptions {
  readonly prefetch: number;
  readonly lookAhead: number;
  readonly evict: number;
  readonly evictFar: number;
  readonly budgetMs: number;
  readonly maxBoxes: number;
  readonly lightRange: number;
  readonly uploadRange: number;
}
export const KIT_STREAM: KitStreamOptions = {
  prefetch: 360, lookAhead: 12, evict: 520, evictFar: 900, budgetMs: 2, maxBoxes: 220_000, lightRange: 260, uploadRange: 140,
};

export interface KitStreamFrame {
  /** Wanted clusters, nearest first. */
  readonly wanted: readonly number[];
  /** Clusters evicted this frame. */
  readonly evicted: readonly number[];
  /** Caves whose light field to fetch (nearest first), and the nearest few
   * (`UPLOAD_WISHES`) to have uploaded. */
  readonly light: readonly string[];
  readonly upload: readonly string[];
  /** Wanted clusters not yet built. */
  readonly pending: number;
  readonly buildMs: number;
  /** Measurement: the update's own passes, ms (the wanted list, eviction, ranking the caves' light). */
  readonly passMs: { readonly score: number; readonly evict: number; readonly light: number };
}
/** Upload wishes kept per frame (the cave view fills at most a few ahead). */
export const UPLOAD_WISHES = 3;

const rectDistance = (r: Rect, x: number, z: number): number => {
  const dx = Math.max(r.minX - x, 0, x - r.maxX), dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.sqrt(dx * dx + dz * dz);
};
/** Cave footprint grid cell, metres. */
const CAVE_CELL = 128;

/** The streamer. Its per-frame work is proportional to the caves near the
 * viewer and its heading, not to the roster (R2-4): clusters and caves come
 * from grid queries into buffers it owns, the short candidate lists are
 * ranked by insertion, and the frame it returns is one reused object, valid
 * until the next update. */
export function createKitStreamer(stream: KitCaveStream, footprints: ReadonlyMap<string, Rect>, options: Partial<KitStreamOptions> = {},
  now: () => number = () => performance.now()) {
  const o = { ...KIT_STREAM, ...options };
  const caveIds = [...footprints.keys()], caveRects = [...footprints.values()];
  const caveGrid = new Map<number, number[]>(), caveMark = new Uint32Array(caveIds.length);
  let caveStamp = 0;
  const key = (ix: number, iz: number): number => (ix + 32768) * 65536 + (iz + 32768);
  caveRects.forEach((r, i) => {
    for (let ix = Math.floor(r.minX / CAVE_CELL); ix <= Math.floor(r.maxX / CAVE_CELL); ix++)
      for (let iz = Math.floor(r.minZ / CAVE_CELL); iz <= Math.floor(r.maxZ / CAVE_CELL); iz++) {
        const k = key(ix, iz);
        (caveGrid.get(k) ?? caveGrid.set(k, []).get(k)!).push(i);
      }
  });
  const nClusters = stream.clusters.length;
  // Buffers owned here, reused every frame.
  const candidates: number[] = [], rank = new Float64Array(nClusters), here = new Float64Array(nClusters), behind = new Uint8Array(nClusters);
  const keep = new Uint32Array(nClusters), residentCopy: number[] = [], caveOrder: number[] = [], caveDist = new Float64Array(caveIds.length);
  let keepStamp = 0;
  const wanted: number[] = [], evicted: number[] = [], light: string[] = [], upload: string[] = [];
  const passMs = { score: 0, evict: 0, light: 0 };
  const frame = { wanted, evicted, light, upload, pending: 0, buildMs: 0, passMs };
  /** Insert `i` into `list`, ordered by `by[i]` then index. */
  const insert = (list: number[], i: number, by: Float64Array): void => {
    let j = list.length;
    list.push(i);
    for (; j > 0 && (by[list[j - 1]!]! > by[i]! || (by[list[j - 1]!]! === by[i]! && list[j - 1]! > i)); j--) list[j] = list[j - 1]!;
    list[j] = i;
  };
  const score = (i: number, vx: number, vz: number, ax: number, az: number, speed: number, velocity: Readonly<Vec3>): void => {
    const c = stream.clusters[i]!, d = rectDistance(c.rect, vx, vz), there = rectDistance(c.rect, ax, az);
    const cx = (c.rect.minX + c.rect.maxX) / 2 - vx, cz = (c.rect.minZ + c.rect.maxZ) / 2 - vz;
    here[i] = d; rank[i] = Math.min(d, there); behind[i] = speed > 0.5 && (cx * velocity.x + cz * velocity.z) < 0 ? 1 : 0;
  };
  return {
    options: o,
    update(viewer: Readonly<Vec3>, velocity: Readonly<Vec3>): KitStreamFrame {
      const t0 = now();
      const ax = viewer.x + velocity.x * o.lookAhead, az = viewer.z + velocity.z * o.lookAhead;
      const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
      // The wanted list: clusters within `prefetch` of the viewer or of where its heading puts it.
      const p = o.prefetch;
      const n = stream.clustersNear(Math.min(viewer.x, ax) - p, Math.min(viewer.z, az) - p, Math.max(viewer.x, ax) + p, Math.max(viewer.z, az) + p, candidates);
      wanted.length = 0;
      if (++keepStamp === 0xffffffff) { keep.fill(0); keepStamp = 1; }
      for (let k = 0; k < n; k++) {
        const i = candidates[k]!;
        score(i, viewer.x, viewer.z, ax, az, speed, velocity);
        if (rank[i]! <= p) { insert(wanted, i, rank); keep[i] = keepStamp; }
      }
      const start = now();
      stream.step(wanted, o.budgetMs, now);
      const t1 = now();
      // Eviction: only the resident clusters (a copy: evicting edits the list).
      evicted.length = 0;
      residentCopy.length = 0;
      const res = stream.resident;
      for (let k = 0; k < res.length; k++) residentCopy.push(res[k]!);
      for (let k = 0; k < residentCopy.length; k++) {
        const i = residentCopy[k]!;
        if (keep[i] === keepStamp) continue;
        score(i, viewer.x, viewer.z, ax, az, speed, velocity);
        if ((here[i]! > o.evict && behind[i]) || here[i]! > o.evictFar) { stream.evict(i); evicted.push(i); }
      }
      if (stream.stats.residentBoxes > o.maxBoxes) {
        // Behind first, then farthest first (scores from the pass above).
        residentCopy.length = 0;
        for (const i of stream.resident) if (keep[i] !== keepStamp) residentCopy.push(i);
        residentCopy.sort((a, b) => behind[b]! - behind[a]! || here[b]! - here[a]!);
        for (const i of residentCopy) {
          if (stream.stats.residentBoxes <= o.maxBoxes) break;
          stream.evict(i); evicted.push(i);
        }
      }
      const t2 = now();
      // Light: caves within `lightRange` of the viewer or its heading, nearest first; the nearest few within `uploadRange` to upload.
      if (++caveStamp === 0xffffffff) { caveMark.fill(0); caveStamp = 1; }
      caveOrder.length = 0;
      const r = o.lightRange;
      const x0 = Math.floor((Math.min(viewer.x, ax) - r) / CAVE_CELL), x1 = Math.floor((Math.max(viewer.x, ax) + r) / CAVE_CELL);
      const z0 = Math.floor((Math.min(viewer.z, az) - r) / CAVE_CELL), z1 = Math.floor((Math.max(viewer.z, az) + r) / CAVE_CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const b = caveGrid.get(key(ix, iz));
        if (b) for (let k = 0; k < b.length; k++) {
          const i = b[k]!;
          if (caveMark[i] === caveStamp) continue;
          caveMark[i] = caveStamp;
          const d = Math.min(rectDistance(caveRects[i]!, viewer.x, viewer.z), rectDistance(caveRects[i]!, ax, az));
          if (d <= r) { caveDist[i] = d; insert(caveOrder, i, caveDist); }
        }
      }
      light.length = 0; upload.length = 0;
      for (let k = 0; k < caveOrder.length; k++) {
        const i = caveOrder[k]!;
        light.push(caveIds[i]!);
        if (caveDist[i]! <= o.uploadRange && upload.length < UPLOAD_WISHES) upload.push(caveIds[i]!);
      }
      const t3 = now();
      let pending = 0;
      for (let k = 0; k < wanted.length; k++) if (!stream.ready(wanted[k]!)) pending++;
      frame.pending = pending; frame.buildMs = t1 - start;
      passMs.score = start - t0; passMs.evict = t2 - t1; passMs.light = t3 - t2;
      return frame;
    },
  };
}
export type KitStreamer = ReturnType<typeof createKitStreamer>;
