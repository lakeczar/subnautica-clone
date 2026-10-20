import type { ChunkArtRef, ChunkDescriptor, LodLevel } from "../../world/types.js";

/** Chunk art is produced in two steps. A factory BUILDS a recipe: plain typed
 * arrays, no Babylon objects, time-sliced and safe to run in a worker. The kit
 * UPLOADS a recipe into Babylon meshes within a per-frame byte budget. The
 * same descriptor, reference and LOD always yield the same recipe, so evicted
 * or context-lost art is rebuilt rather than cached forever. */

/** One merged, cel-shaded mesh in chunk-local or world coordinates. */
export interface MeshRecipe {
  readonly name: string;
  /** xyz per vertex, world metres. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** rgba per vertex. Alpha keeps the cel shader's meaning: 0 ground,
   * 1 plain, >1 contour ink, -1 unlit. */
  readonly colors: Float32Array;
  readonly indices: Uint32Array | Uint16Array;
}

/** Many copies of one shared template in one draw. */
export interface InstanceRecipe {
  /** Template ID in the kit's template library, e.g. "frond.tall". */
  readonly template: string;
  /** 16 floats per instance, column-major world matrices (Babylon layout). */
  readonly matrices: Float32Array;
  /** Optional rgba multiplier per instance. */
  readonly tints?: Float32Array;
}

export interface ChunkRecipe {
  readonly meshes: readonly MeshRecipe[];
  readonly instances: readonly InstanceRecipe[];
}

export interface ChunkBuildContext {
  /** Physical floor height, the same function simulation uses. */
  floor(x: number, z: number): number;
  /** Deterministic per-chunk random stream. */
  random(seed: number): () => number;
}

/** A render factory, registered under `id` and referenced from descriptors.
 * `build` yields between bounded units of work (aim for <= 1 ms each) and
 * returns the recipe. Returning early through `Iterator.return` cancels it. */
export interface ChunkArtFactory {
  readonly id: string;
  build(ctx: ChunkBuildContext, chunk: ChunkDescriptor, ref: ChunkArtRef, lod: LodLevel): Generator<void, ChunkRecipe>;
}

/** A shared immutable template with fine and coarse geometry. */
export interface TemplateRecipe {
  readonly id: string;
  readonly fine: MeshRecipe;
  readonly coarse: MeshRecipe;
}
