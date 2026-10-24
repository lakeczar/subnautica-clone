import type { Aabb, ChunkCell, ChunkId, LodBands, Rect, Vec3 } from "./types.js";

/** Proposed full-world envelope: 2048 x 1792 m (the planned 2.0 x 1.8 km basin
 * on a whole number of 128 m chunks) from 100 m above water to 800 m below.
 * It contains today's route bounds (X -76..248, Z -320..66) unchanged, so no
 * existing coordinate moves. The coordinator ratifies it at composition. */
export const CHUNK_SIZE = 128;
export const WORLD_ENVELOPE: Aabb = {
  min: { x: -576, y: -800, z: -1632 },
  max: { x: 1472, y: 100, z: 160 },
};
export const GRID_COLUMNS = (WORLD_ENVELOPE.max.x - WORLD_ENVELOPE.min.x) / CHUNK_SIZE;
export const GRID_ROWS = (WORLD_ENVELOPE.max.z - WORLD_ENVELOPE.min.z) / CHUNK_SIZE;

/** Measured starting point, not a contract: fine within ~1.5 chunks, coarse
 * out to the 450 m camera far plane less fog. */
export const DEFAULT_LOD: LodBands = { fine: 112, coarse: 400, hysteresis: 16 };

export function chunkId(cell: ChunkCell): ChunkId {
  return `chunk:${cell.ix}:${cell.iz}:${cell.layer}`;
}
export function parseChunkId(id: ChunkId): ChunkCell | null {
  const m = /^chunk:(-?\d+):(-?\d+):(\d+)$/.exec(id);
  return m ? { ix: Number(m[1]), iz: Number(m[2]), layer: Number(m[3]) } : null;
}

/** Column containing (x, z). Cells are half-open [min, min + size) so every
 * point has exactly one column; the envelope's far edges belong to the last. */
export function columnAt(x: number, z: number, envelope: Aabb = WORLD_ENVELOPE,
  size = CHUNK_SIZE): { ix: number; iz: number } | null {
  if (!(x >= envelope.min.x && x <= envelope.max.x && z >= envelope.min.z && z <= envelope.max.z)) return null;
  const columns = Math.round((envelope.max.x - envelope.min.x) / size);
  const rows = Math.round((envelope.max.z - envelope.min.z) / size);
  return {
    ix: Math.min(columns - 1, Math.floor((x - envelope.min.x) / size)),
    iz: Math.min(rows - 1, Math.floor((z - envelope.min.z) / size)),
  };
}
export function columnRect(ix: number, iz: number, envelope: Aabb = WORLD_ENVELOPE, size = CHUNK_SIZE): Rect {
  const minX = envelope.min.x + ix * size, minZ = envelope.min.z + iz * size;
  return { minX, maxX: minX + size, minZ, maxZ: minZ + size };
}

export function resolveLod(...layers: (Partial<LodBands> | undefined)[]): LodBands {
  const out = { ...DEFAULT_LOD };
  // Later arguments are more specific and win.
  for (const layer of layers) if (layer) Object.assign(out, layer);
  return out;
}

export function boxDistance(box: Aabb, p: Readonly<Vec3>): number {
  const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x);
  const dy = Math.max(box.min.y - p.y, 0, p.y - box.max.y);
  const dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
  return Math.hypot(dx, dy, dz);
}
export function boxesIntersect(a: Aabb, b: Aabb): boolean {
  return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z;
}
export function boxContains(box: Aabb, p: Readonly<Vec3>): boolean {
  return p.x >= box.min.x && p.x <= box.max.x && p.y >= box.min.y && p.y <= box.max.y &&
    p.z >= box.min.z && p.z <= box.max.z;
}
export function inflate(box: Aabb, by: number): Aabb {
  return {
    min: { x: box.min.x - by, y: box.min.y - by, z: box.min.z - by },
    max: { x: box.max.x + by, y: box.max.y + by, z: box.max.z + by },
  };
}
export function rectContains(r: Rect, x: number, z: number): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}
