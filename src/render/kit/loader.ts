import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Geometry } from "@babylonjs/core/Meshes/geometry.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import type { ChunkLoader, PreparedArt, ResidentArt } from "../../world/residency.js";
import type { ChunkDescriptor, LodLevel } from "../../world/types.js";
import { instanceBytes, meshBytes } from "./recipe.js";
import type { ChunkArtFactory, ChunkBuildContext, ChunkRecipe, MeshRecipe, TemplateRecipe } from "./types.js";

/** Kit meshes draw in the production scene's opaque group. */
export const KIT_RENDERING_GROUP = 1;

export function uploadMesh(recipe: MeshRecipe, name: string, scene: Scene, material: ShaderMaterial): Mesh {
  const mesh = new Mesh(name, scene);
  // Typed arrays are handed over, not copied: Babylon keeps them as its CPU
  // copy for context restoration, which is exactly what `cpuBytes` counts.
  mesh.setVerticesData("position", recipe.positions, false, 3);
  mesh.setVerticesData("normal", recipe.normals, false, 3);
  mesh.setVerticesData("color", recipe.colors, false, 4);
  mesh.setIndices(recipe.indices);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.renderingGroupId = KIT_RENDERING_GROUP;
  mesh.freezeWorldMatrix();
  return mesh;
}

/** Shared template geometry, one disabled source mesh per template and LOD.
 * Chunk batches share the source geometry's GPU buffers; only their
 * per-instance matrices and tints are per chunk. */
export class TemplateLibrary {
  private readonly sources = new Map<string, Mesh>();
  readonly bytes: number;
  constructor(scene: Scene, material: ShaderMaterial, templates: readonly TemplateRecipe[]) {
    let bytes = 0;
    for (const t of templates) for (const lod of ["fine", "coarse"] as const) {
      const mesh = uploadMesh(t[lod], `kit.template.${t.id}.${lod}`, scene, material);
      mesh.setEnabled(false);
      this.sources.set(`${t.id}@${lod}`, mesh);
      bytes += meshBytes(t[lod]);
    }
    this.bytes = bytes;
  }
  geometry(id: string, lod: LodLevel): Geometry {
    const g = this.sources.get(`${id}@${lod}`)?.geometry;
    if (!g) throw new Error(`Unknown kit template ${id}@${lod}`);
    return g;
  }
  has(id: string): boolean { return this.sources.has(`${id}@fine`); }
  dispose(): void { for (const m of this.sources.values()) m.dispose(); this.sources.clear(); }
}

export interface KitLoaderStats { live: number; meshes: number }

/** Residency loader over registered factories. Building delegates to each
 * referenced factory's generator (cancellation propagates through `yield*`);
 * uploading creates meshes and thin-instance batches and nothing else. */
export function createKitLoader(options: {
  scene: Scene;
  material: ShaderMaterial;
  templates: TemplateLibrary;
  factories: readonly ChunkArtFactory[];
  context: ChunkBuildContext;
}): ChunkLoader & { readonly stats: KitLoaderStats } {
  const { scene, material, templates, context } = options;
  const factories = new Map(options.factories.map(f => [f.id, f] as const));
  const stats = { live: 0, meshes: 0 };
  const upload = (chunk: ChunkDescriptor, lod: LodLevel, recipe: ChunkRecipe, bytes: number): ResidentArt => {
    const meshes: Mesh[] = [];
    for (const m of recipe.meshes) meshes.push(uploadMesh(m, `${chunk.id}.${lod}.${m.name}`, scene, material));
    for (const batch of recipe.instances) {
      if (!batch.matrices.length) continue;
      const mesh = new Mesh(`${chunk.id}.${lod}.${batch.template}`, scene);
      templates.geometry(batch.template, lod).applyToMesh(mesh);
      mesh.thinInstanceSetBuffer("matrix", batch.matrices, 16, true);
      if (batch.tints) mesh.thinInstanceSetBuffer("instanceColor", batch.tints, 4, true);
      mesh.thinInstanceRefreshBoundingInfo();
      mesh.material = material;
      mesh.isPickable = false;
      mesh.renderingGroupId = KIT_RENDERING_GROUP;
      mesh.freezeWorldMatrix();
      meshes.push(mesh);
    }
    for (const m of meshes) m.metadata = { chunk: chunk.id, region: chunk.region, lod };
    stats.live++; stats.meshes += meshes.length;
    let disposed = false;
    return {
      cpuBytes: bytes,
      gpuBytes: bytes,
      setVisible(visible) { for (const m of meshes) m.setEnabled(visible); },
      dispose() {
        if (disposed) return;
        disposed = true;
        // Shared template geometry survives: its source mesh still holds it.
        for (const m of meshes) m.dispose(false, false);
        stats.live--; stats.meshes -= meshes.length;
      },
    };
  };
  return {
    stats,
    *build(chunk, lod) {
      const meshes: MeshRecipe[] = [], instances: ChunkRecipe["instances"][number][] = [];
      for (const ref of chunk.art) {
        const factory = factories.get(ref.factory);
        if (!factory) throw new Error(`No kit factory "${ref.factory}" for ${chunk.id}`);
        const recipe = yield* factory.build(context, chunk, ref, lod);
        meshes.push(...recipe.meshes);
        for (const i of recipe.instances) {
          if (!templates.has(i.template)) throw new Error(`Unknown kit template ${i.template} in ${chunk.id}`);
          instances.push(i);
        }
      }
      const recipe: ChunkRecipe = { meshes, instances };
      const bytes = meshes.reduce((n, m) => n + meshBytes(m), 0) + instances.reduce((n, i) => n + instanceBytes(i), 0);
      const prepared: PreparedArt = {
        cpuBytes: bytes,
        gpuBytes: bytes,
        upload: () => upload(chunk, lod, recipe, bytes),
        discard() { /* plain arrays: dropping the reference frees them */ },
      };
      return prepared;
    },
  };
}
