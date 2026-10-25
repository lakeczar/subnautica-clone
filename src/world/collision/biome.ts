import type { Vec3 } from "../types.js";
import type { CaveCollider } from "../caves/large/compose.js";
import { boxTouchesOwned, capAt, collarAt, owns, type CaveOwnership } from "../caves/large/ownership.js";
import { orientationProblems, type TriangleMesh } from "./bake.js";
import { createStaticCollider, OVERLAP_TOLERANCE, type StaticCollider } from "./collider.js";
import { buildShape, type StaticShape } from "./shape.js";

/** A cave biome's collision in the compact format (COL-1 for LC-2).
 *
 * The same triangles LC's chunk colliders hold (each chunk's fine art mesh
 * plus its collision-only seabed band), as static shapes: the art's own
 * positions are viewed, not copied, and nodes and indices are compact.
 * `compactBiomeCollider` answers with LC's semantics exactly (its
 * `largeCaveCollider`): the same 13-axis sweep, overlap with a 1 mm
 * tolerance, containment by the parity of a vertical ray to the owned top
 * (the cap is rock, a collar's top is water), support from up-facing
 * surfaces. Only the storage and the hierarchy change. */

export interface BiomeChunk {
  readonly key: string;
  /** The chunk's fine art mesh: its positions are viewed, not copied. */
  readonly art: TriangleMesh;
  /** The collision-only seabed band round collars (owned by collision). */
  readonly band: TriangleMesh | null;
}
export interface CompactBiome {
  readonly id: string;
  readonly ownership: CaveOwnership;
  readonly collider: StaticCollider;
}

/** Orientation of LC chunk meshes, by construction: LC's `surfaceNets`
 * (`caves/large/mesh.ts`) winds each crossing in a fixed order about its axis
 * and flips it when the far node is the rock, so (b - a) x (c - a) faces
 * into water: out of rock. The seabed band is wound the same way (up, out of
 * the ground). */
export const LC_ORIENTATION = { facing: 1, source: "LC surfaceNets: rock to water, outward" } as const;
const LC_FACING = LC_ORIENTATION.facing;

export function compactBiome(id: string, ownership: CaveOwnership, chunks: readonly BiomeChunk[]): CompactBiome {
  const shapes: StaticShape[] = [];
  for (const c of chunks) {
    // The provenance claims a winding; each chunk's art and band must be coherent with it.
    for (const [name, m] of [[c.key, c.art], [`${c.key}.band`, c.band]] as const) {
      const problems = m?.indices.length ? orientationProblems(`${id}.${name}`, m, false) : [];
      if (problems.length) throw new Error(`${id}.${name}: winding is not coherent (${LC_ORIENTATION.source}):\n- ${problems.join("\n- ")}`);
    }
    if (c.art.indices.length) shapes.push(buildShape(`${id}.${c.key}`, c.art.positions, c.art.indices, { facing: LC_FACING, shared: true }));
    if (c.band?.indices.length) shapes.push(buildShape(`${id}.${c.key}.band`, c.band.positions, c.band.indices, { facing: LC_FACING }));
  }
  return { id, ownership, collider: createStaticCollider(id, shapes) };
}

/** Owned cave rock at p: LC's `caveRockAt` on the compact shapes. */
export function compactRockAt(b: CompactBiome, p: Vec3): boolean {
  const o = b.ownership;
  if (!owns(o, p.x, p.y, p.z)) return false;
  const collar = collarAt(o, p.x, p.z) !== null, top = collar ? o.domain.max.y + 1 : capAt(o, p.x, p.z);
  const crossings = b.collider.crossings(p.x, p.y, p.z, top);
  return collar ? crossings % 2 === 1 : crossings % 2 === 0;
}

/** The compact biome as a `CaveCollider`, with `largeCaveCollider`'s answers. */
export function compactBiomeCollider(b: CompactBiome): CaveCollider {
  const o = b.ownership, col = b.collider;
  return {
    id: b.id,
    baseY: o.domain.min.y,
    touches: box => boxTouchesOwned(o, box),
    sweep: (c, e, d, skin, out) => col.sweep(c, e, d, skin, out),
    blocked(c, e) {
      if (col.overlaps(c, e, OVERLAP_TOLERANCE)) return true;
      // No surface crosses the box, so each owned part of it is wholly rock
      // or wholly water: the centre and the (slightly inset) owned corners.
      for (let q = -1; q < 8; q++) {
        const p = q < 0 ? c : { x: c.x + ((q & 1) ? 1 : -1) * (e.x - 0.01), y: c.y + ((q & 2) ? 1 : -1) * (e.y - 0.01), z: c.z + ((q & 4) ? 1 : -1) * (e.z - 0.01) };
        if (owns(o, p.x, p.y, p.z) && compactRockAt(b, p)) return true;
      }
      return false;
    },
    segmentClear: (a, c) => col.segmentClear(a, c),
    support: (x, z, fromY) => col.support(x, z, fromY),
    masksGround: (x, z) => collarAt(o, x, z) !== null,
    ownsPoint: p => owns(o, p.x, p.y, p.z),
    ownedSpan(x, z) {
      const d = o.domain;
      if (x < d.min.x || x > d.max.x || z < d.min.z || z > d.max.z) return null;
      return [d.min.y, capAt(o, x, z)];
    },
  };
}
