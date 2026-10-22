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
  /** Caves whose light field to fetch, and to have uploaded, nearest first. */
  readonly light: readonly string[];
  readonly upload: readonly string[];
  /** Wanted clusters not yet built. */
  readonly pending: number;
  readonly buildMs: number;
}

const rectDistance = (r: Rect, x: number, z: number): number =>
  Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

export function createKitStreamer(stream: KitCaveStream, footprints: ReadonlyMap<string, Rect>, options: Partial<KitStreamOptions> = {},
  now: () => number = () => performance.now()) {
  const o = { ...KIT_STREAM, ...options };
  return {
    options: o,
    update(viewer: Readonly<Vec3>, velocity: Readonly<Vec3>): KitStreamFrame {
      const ahead = { x: viewer.x + velocity.x * o.lookAhead, z: viewer.z + velocity.z * o.lookAhead };
      const speed = Math.hypot(velocity.x, velocity.z);
      const scored = stream.clusters.map(c => {
        const here = rectDistance(c.rect, viewer.x, viewer.z), there = rectDistance(c.rect, ahead.x, ahead.z);
        const cx = (c.rect.minX + c.rect.maxX) / 2 - viewer.x, cz = (c.rect.minZ + c.rect.maxZ) / 2 - viewer.z;
        const behind = speed > 0.5 && (cx * velocity.x + cz * velocity.z) < 0;
        return { index: c.index, here, rank: Math.min(here, there), behind };
      });
      const wanted = scored.filter(s => s.rank <= o.prefetch).sort((a, b) => a.rank - b.rank || a.index - b.index).map(s => s.index);
      const start = now();
      stream.step(wanted, o.budgetMs, now);
      const buildMs = now() - start;
      const keep = new Set(wanted), evicted: number[] = [];
      for (const s of scored) if (stream.ready(s.index) && !keep.has(s.index) && ((s.here > o.evict && s.behind) || s.here > o.evictFar)) {
        stream.evict(s.index); evicted.push(s.index);
      }
      if (stream.stats.residentBoxes > o.maxBoxes) {
        const order = scored.filter(s => stream.ready(s.index) && !keep.has(s.index))
          .sort((a, b) => Number(b.behind) - Number(a.behind) || b.here - a.here);
        for (const s of order) {
          if (stream.stats.residentBoxes <= o.maxBoxes) break;
          stream.evict(s.index); evicted.push(s.index);
        }
      }
      const caves = [...footprints].map(([id, r]) => ({ id, d: Math.min(rectDistance(r, viewer.x, viewer.z), rectDistance(r, ahead.x, ahead.z)) }))
        .sort((a, b) => a.d - b.d);
      return {
        wanted, evicted, buildMs,
        pending: wanted.filter(i => !stream.ready(i)).length,
        light: caves.filter(c => c.d <= o.lightRange).map(c => c.id),
        upload: caves.filter(c => c.d <= o.uploadRange).map(c => c.id),
      };
    },
  };
}
export type KitStreamer = ReturnType<typeof createKitStreamer>;
