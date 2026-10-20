import { parseChunkId } from "../../world/frame.js";
import type { Vec3 } from "../../world/types.js";
import { CHUNK_SIZE, WORLD_ENVELOPE } from "../../world/frame.js";

/** Baked S2 terrain assets: one deflate-compressed file per chunk holding
 * both LODs (`terrainCodec.ts`). The store fetches and decompresses
 * asynchronously and keeps decompressed files in a byte-bounded LRU that
 * outlives render eviction, so a returning chunk decodes without a fetch.
 *
 * Fetches never block a build: requesting a chunk also prefetches its eight
 * neighbours, chunks are first requested at the coarse band (~400 m ahead),
 * and a host may call `prefetch(position)` each frame to look further. A
 * build that still finds its file in flight yields until it arrives. */
export interface TerrainFile { readonly settled: boolean; readonly bytes: Uint8Array | null }
export interface TerrainStore {
  /** Decompressed bytes if cached, else starts (or joins) the fetch. */
  request(chunkId: string): TerrainFile;
  /** Fetch every chunk file within `radius` of `p` that is not cached. */
  prefetch(p: Readonly<Vec3>, radius?: number): void;
  readonly stats: { cachedBytes: number; files: number; fetches: number; misses: number; failures: number };
}

export const terrainFileName = (chunkId: string): string => {
  const c = parseChunkId(chunkId);
  if (!c) throw new Error(`not a chunk id: ${chunkId}`);
  return `t_${c.ix}_${c.iz}.bin`;
};

/** Inflate zlib ("deflate") bytes with the platform's streaming decompressor. */
export async function inflate(compressed: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function createTerrainStore(options: {
  /** Fetch one compressed file by name; resolve null when absent. */
  fetchFile(name: string): Promise<Uint8Array | null>;
  /** Decompressed bytes kept across eviction. Default 48 MiB. */
  cacheBytes?: number;
}): TerrainStore {
  const cap = options.cacheBytes ?? 48 * 1024 * 1024;
  const cache = new Map<string, Uint8Array>(), inFlight = new Map<string, { settled: boolean; bytes: Uint8Array | null }>();
  const stats = { cachedBytes: 0, files: 0, fetches: 0, misses: 0, failures: 0 };
  const remember = (id: string, bytes: Uint8Array): void => {
    const old = cache.get(id);
    if (old) { stats.cachedBytes -= old.byteLength; cache.delete(id); }
    cache.set(id, bytes); stats.cachedBytes += bytes.byteLength;
    for (const [k, v] of cache) {
      if (stats.cachedBytes <= cap || k === id) break;
      cache.delete(k); stats.cachedBytes -= v.byteLength;
    }
    stats.files = cache.size;
  };
  const start = (id: string): { settled: boolean; bytes: Uint8Array | null } => {
    const pending = inFlight.get(id);
    if (pending) return pending;
    const job = { settled: false, bytes: null as Uint8Array | null };
    inFlight.set(id, job); stats.fetches++;
    options.fetchFile(terrainFileName(id)).then(c => c ? inflate(c) : null).then(bytes => {
      job.bytes = bytes; if (bytes) remember(id, bytes); else stats.failures++;
    }, () => { stats.failures++; }).finally(() => { job.settled = true; inFlight.delete(id); });
    return job;
  };
  const neighbours = (id: string): string[] => {
    const c = parseChunkId(id), out: string[] = [];
    if (!c) return out;
    const cols = (WORLD_ENVELOPE.max.x - WORLD_ENVELOPE.min.x) / CHUNK_SIZE, rows = (WORLD_ENVELOPE.max.z - WORLD_ENVELOPE.min.z) / CHUNK_SIZE;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ix = c.ix + dx, iz = c.iz + dz;
      if ((dx || dz) && ix >= 0 && iz >= 0 && ix < cols && iz < rows) out.push(`chunk:${ix}:${iz}:0`);
    }
    return out;
  };
  return {
    stats,
    request(id) {
      const hit = cache.get(id);
      // Touch for LRU order.
      if (hit) { cache.delete(id); cache.set(id, hit); return { settled: true, bytes: hit }; }
      stats.misses++;
      for (const n of neighbours(id)) if (!cache.has(n)) start(n);
      return start(id);
    },
    prefetch(p, radius = 520) {
      const env = WORLD_ENVELOPE;
      const x0 = Math.max(0, Math.floor((p.x - radius - env.min.x) / CHUNK_SIZE)), x1 = Math.min((env.max.x - env.min.x) / CHUNK_SIZE - 1, Math.floor((p.x + radius - env.min.x) / CHUNK_SIZE));
      const z0 = Math.max(0, Math.floor((p.z - radius - env.min.z) / CHUNK_SIZE)), z1 = Math.min((env.max.z - env.min.z) / CHUNK_SIZE - 1, Math.floor((p.z + radius - env.min.z) / CHUNK_SIZE));
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const id = `chunk:${ix}:${iz}:0`;
        if (!cache.has(id)) start(id);
      }
    },
  };
}

/** Store over HTTP: `base` is the URL of the baked `terrain/` directory. */
export function httpTerrainStore(base: string, cacheBytes?: number): TerrainStore {
  return createTerrainStore({
    ...(cacheBytes ? { cacheBytes } : {}),
    async fetchFile(name) {
      const r = await fetch(new URL(name, new URL(base, globalThis.location?.href ?? "http://localhost/")));
      // A dev server answers a missing file with its HTML fallback page.
      if (!r.ok || (r.headers.get("content-type") ?? "").includes("text/html")) return null;
      return new Uint8Array(await r.arrayBuffer());
    },
  });
}
