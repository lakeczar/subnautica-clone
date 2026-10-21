import type { LargeCaveSource } from "../../../content/caves/largeCave.js";
import type { LodLevel } from "../../types.js";
import { buildCollider, chunkIndex, collisionComplete, createCollision, type CaveCollision } from "./collision.js";
import { CAVE_SUB_SWEEP } from "./compose.js";
import { compileField, validateOwnership, type CaveField, type FloorFunction } from "./field.js";
import { buildChunkMesh, caveLattice, chunkKey, surfaceChunks, type CaveLattice, type ChunkCoord, type ChunkMesh } from "./mesh.js";

/** A cave biome built from its source (Babylon-free).
 *
 * `createLargeCave` compiles the field, validates ownership and lists the
 * chunks that may hold a surface; it builds no geometry. Meshes are built per
 * chunk on demand and cached (the fine mesh serves art and collision alike).
 * `buildCollision` fills the resident collision store from fine meshes; a
 * bake fills it from files instead (`bake.ts`). */

/** Collision band round collars: the widest admitted hull touching a collar
 * reaches 2 x 4.5 m past it, plus one sub-sweep with its slides. */
export const COLLISION_BAND = 2 * 4.5 + CAVE_SUB_SWEEP + 1;

export interface LargeCave {
  readonly id: string;
  readonly source: LargeCaveSource;
  readonly field: CaveField;
  readonly lattice: CaveLattice;
  /** Chunks that may hold a surface, in index order. */
  readonly chunks: readonly ChunkCoord[];
  readonly collision: CaveCollision;
  /** The chunk's mesh at one LOD (cached). */
  mesh(c: ChunkCoord, lod: LodLevel): ChunkMesh;
  /** Forget cached meshes (collision keeps its own arrays). */
  dropMeshes(): void;
}

export function createLargeCave(source: LargeCaveSource, floor: FloorFunction): LargeCave {
  const field = compileField(source, floor);
  const problems = validateOwnership(field);
  if (problems.length) throw new Error(`cave ${source.id}: ownership problems:\n- ${problems.join("\n- ")}`);
  const lattice = caveLattice(field);
  for (const r of source.collars) {
    const d = source.domain;
    if (r.minX - COLLISION_BAND < d.min.x || r.maxX + COLLISION_BAND > d.max.x || r.minZ - COLLISION_BAND < d.min.z || r.maxZ + COLLISION_BAND > d.max.z)
      throw new Error(`cave ${source.id}: collar and its ${COLLISION_BAND} m band must lie inside the domain`);
  }
  const chunks = surfaceChunks(field, lattice, COLLISION_BAND);
  const collision = createCollision(source.id, field.ownership, source.chunk, COLLISION_BAND,
    chunks.map(c => c.cx + lattice.nx * (c.cy + lattice.ny * c.cz)));
  const cache = new Map<string, ChunkMesh>();
  return {
    id: source.id, source, field, lattice, chunks, collision,
    mesh(c, lod) {
      const k = `${chunkKey(c)}@${lod}`;
      let m = cache.get(k);
      if (!m) { m = buildChunkMesh(field, lattice, c, lod, { band: lod === "fine" ? COLLISION_BAND : 0 }); cache.set(k, m); }
      return m;
    },
    dropMeshes() { cache.clear(); },
  };
}

/** Build colliders for `coords` (default: every surface chunk) from fine
 * meshes. Already present colliders are kept. */
export function buildCollision(cave: LargeCave, coords: readonly ChunkCoord[] = cave.chunks): CaveCollision {
  const col = cave.collision;
  for (const c of coords) {
    const i = chunkIndex(col, c.cx, c.cy, c.cz);
    if (col.colliders[i]) continue;
    const m = cave.mesh(c, "fine");
    col.colliders[i] = buildCollider(m.key, i, m, m.band);
  }
  return col;
}

/** Chunks whose box (grown by `pad`) meets a point set: for tests and labs
 * that only need collision near a few places. Whole columns are included,
 * because containment reads a vertical ray to the owned top. */
export function chunksNear(cave: LargeCave, points: readonly { x: number; y: number; z: number }[], pad: number): ChunkCoord[] {
  const o = cave.lattice.origin, C = cave.lattice.chunk;
  const near = cave.chunks.filter(c => points.some(p =>
    p.x >= o.x + c.cx * C - pad && p.x <= o.x + (c.cx + 1) * C + pad &&
    p.y >= o.y + c.cy * C - pad && p.y <= o.y + (c.cy + 1) * C + pad &&
    p.z >= o.z + c.cz * C - pad && p.z <= o.z + (c.cz + 1) * C + pad));
  const columns = new Set(near.map(c => `${c.cx}:${c.cz}`));
  return cave.chunks.filter(c => columns.has(`${c.cx}:${c.cz}`));
}

export { collisionComplete };
