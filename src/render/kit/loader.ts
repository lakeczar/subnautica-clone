import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
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

/** Shared template recipes. Babylon stores thin-instance buffers on the
 * GEOMETRY, so two batches can never share one Geometry: each batch gets its
 * own geometry built from the template's same typed arrays. Babylon keeps a
 * reference, not a copy, so CPU memory is shared and only the template's
 * small vertex buffers repeat on the GPU (counted in each unit's gpuBytes). */
export class TemplateLibrary {
  private readonly recipes = new Map<string, MeshRecipe>();
  /** CPU bytes of every template recipe, held once. */
  readonly bytes: number;
  constructor(templates: readonly TemplateRecipe[]) {
    let bytes = 0;
    for (const t of templates) for (const lod of ["fine", "coarse"] as const) {
      this.recipes.set(`${t.id}@${lod}`, t[lod]);
      bytes += meshBytes(t[lod]);
    }
    this.bytes = bytes;
  }
  recipe(id: string, lod: LodLevel): MeshRecipe {
    const r = this.recipes.get(`${id}@${lod}`);
    if (!r) throw new Error(`Unknown kit template ${id}@${lod}`);
    return r;
  }
  has(id: string): boolean { return this.recipes.has(`${id}@fine`); }
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
  /** `startStep` (see `defaultContext`) is called before every factory step. */
  context: ChunkBuildContext & { startStep?(): void };
}): ChunkLoader & { readonly stats: KitLoaderStats } {
  const { scene, material, templates, context } = options;
  const factories = new Map(options.factories.map(f => [f.id, f] as const));
  const stats = { live: 0, meshes: 0 };
  const upload = (chunk: ChunkDescriptor, lod: LodLevel, recipe: ChunkRecipe, bytes: number): ResidentArt => {
    const meshes: Mesh[] = [];
    for (const m of recipe.meshes) meshes.push(uploadMesh(m, `${chunk.id}.${lod}.${m.name}`, scene, material));
    for (const batch of recipe.instances) {
      if (!batch.matrices.length) continue;
      const mesh = uploadMesh(templates.recipe(batch.template, lod), `${chunk.id}.${lod}.${batch.template}`, scene, material);
      mesh.unfreezeWorldMatrix();
      mesh.thinInstanceSetBuffer("matrix", batch.matrices, 16, true);
      if (batch.tints) mesh.thinInstanceSetBuffer("instanceColor", batch.tints, 4, true);
      mesh.thinInstanceRefreshBoundingInfo();
      mesh.freezeWorldMatrix();
      meshes.push(mesh);
    }
    for (const m of meshes) m.metadata = { chunk: chunk.id, region: chunk.region, lod };
    stats.live++; stats.meshes += meshes.length;
    let disposed = false;
    // Template vertex buffers are per batch on the GPU, shared on the CPU.
    const templateGpu = recipe.instances.reduce((n, i) => n + (i.matrices.length ? meshBytes(templates.recipe(i.template, lod)) : 0), 0);
    return {
      cpuBytes: bytes,
      gpuBytes: bytes + templateGpu,
      setVisible(visible) { for (const m of meshes) m.setEnabled(visible); },
      dispose() {
        if (disposed) return;
        disposed = true;
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
        // Step the factory by hand so each resume starts its time slice;
        // `finally` forwards cancellation to the factory's own cleanup.
        const steps = factory.build(context, chunk, ref, lod);
        let recipe: ChunkRecipe;
        try {
          for (;;) {
            context.startStep?.();
            const r = steps.next();
            if (r.done) { recipe = r.value; break; }
            yield;
          }
        } finally { steps.return(undefined as never); }
        meshes.push(...recipe.meshes);
        for (const i of recipe.instances) {
          if (!templates.has(i.template)) throw new Error(`Unknown kit template ${i.template} in ${chunk.id}`);
          instances.push(i);
        }
      }
      const recipe: ChunkRecipe = { meshes, instances };
      const bytes = meshes.reduce((n, m) => n + meshBytes(m), 0) + instances.reduce((n, i) => n + instanceBytes(i), 0);
      const templateGpu = instances.reduce((n, i) => n + (i.matrices.length ? meshBytes(templates.recipe(i.template, lod)) : 0), 0);
      const prepared: PreparedArt = {
        cpuBytes: bytes,
        gpuBytes: bytes + templateGpu,
        upload: () => upload(chunk, lod, recipe, bytes),
        discard() { /* plain arrays: dropping the reference frees them */ },
      };
      return prepared;
    },
  };
}
