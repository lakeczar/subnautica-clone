import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import type { ChunkLoader, PreparedArt, ResidentArt, UploadJob } from "../../world/residency.js";
import type { ChunkDescriptor, LodLevel } from "../../world/types.js";
import { meshBytes, splitMeshSteps } from "./recipe.js";
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
const instanceBytesOf = (p: { matrices: Float32Array; tints?: Float32Array | undefined }): number =>
  p.matrices.byteLength + (p.tints?.byteLength ?? 0);

/** One upload part: a merged mesh or one slice of an instance batch. */
type Part =
  | { readonly kind: "mesh"; readonly name: string; readonly mesh: MeshRecipe; readonly gpu: number }
  | { readonly kind: "batch"; readonly name: string; readonly template: string; readonly matrices: Float32Array;
      readonly tints: Float32Array | undefined; readonly gpu: number };

/** Residency loader over registered factories. Building steps each
 * referenced factory by hand (cancellation reaches its `finally`); the recipe
 * is then cut into upload parts of at most `maxPartBytes`, so an upload is
 * bounded per frame however large the chunk. Uploading creates meshes and
 * thin-instance batches and nothing else. */
export function createKitLoader(options: {
  scene: Scene;
  material: ShaderMaterial;
  templates: TemplateLibrary;
  factories: readonly ChunkArtFactory[];
  /** `startStep` (see `defaultContext`) is called before every factory step. */
  context: ChunkBuildContext & { startStep?(): void };
  /** Largest single upload part, GPU bytes. Keep it <= the residency's
   * `uploadBytesPerFrame`. Default 512 KiB. */
  maxPartBytes?: number;
}): ChunkLoader & { readonly stats: KitLoaderStats } {
  const { scene, material, templates, context } = options;
  const maxPartBytes = options.maxPartBytes ?? 512 * 1024;
  const factories = new Map(options.factories.map(f => [f.id, f] as const));
  const stats = { live: 0, meshes: 0 };
  const uploadPart = (chunk: ChunkDescriptor, lod: LodLevel, part: Part): Mesh => {
    const name = `${chunk.id}.${lod}.${part.name}`;
    let mesh: Mesh;
    if (part.kind === "mesh") mesh = uploadMesh(part.mesh, name, scene, material);
    else {
      mesh = uploadMesh(templates.recipe(part.template, lod), name, scene, material);
      mesh.unfreezeWorldMatrix();
      mesh.thinInstanceSetBuffer("matrix", part.matrices, 16, true);
      if (part.tints) mesh.thinInstanceSetBuffer("instanceColor", part.tints, 4, true);
      mesh.thinInstanceRefreshBoundingInfo();
      mesh.freezeWorldMatrix();
    }
    mesh.metadata = { chunk: chunk.id, region: chunk.region, lod };
    mesh.setEnabled(false);
    return mesh;
  };
  const resident = (meshes: Mesh[], cpuBytes: number, gpuBytes: number): ResidentArt => {
    stats.live++; stats.meshes += meshes.length;
    let disposed = false;
    return {
      cpuBytes, gpuBytes,
      setVisible(visible) { for (const m of meshes) m.setEnabled(visible); },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const m of meshes) m.dispose(false, false);
        stats.live--; stats.meshes -= meshes.length;
      },
    };
  };
  /** Cut a recipe into upload parts. Template vertex buffers are per batch
   * slice on the GPU and shared on the CPU, so each slice carries them. */
  /** Run `steps`, starting a fresh time slice before every resume. */
  const stepped = function* <T>(steps: Generator<void, T>): Generator<void, T> {
    for (;;) {
      context.startStep?.();
      const r = steps.next();
      if (r.done) return r.value;
      yield;
    }
  };
  const partsOf = function* (lod: LodLevel, recipe: ChunkRecipe): Generator<void, Part[]> {
    const parts: Part[] = [];
    for (const m of recipe.meshes) {
      for (const piece of yield* stepped(splitMeshSteps(m, maxPartBytes, context.due)))
        parts.push({ kind: "mesh", name: piece.name, mesh: piece, gpu: meshBytes(piece) });
    }
    for (const batch of recipe.instances) {
      const count = batch.matrices.length / 16;
      if (!count) continue;
      const template = meshBytes(templates.recipe(batch.template, lod));
      const each = 64 + (batch.tints ? 16 : 0);
      const per = Math.max(1, Math.floor((maxPartBytes - template) / each));
      for (let first = 0, slice = 0; first < count; first += per, slice++) {
        const last = Math.min(count, first + per);
        parts.push({ kind: "batch", name: count > per ? `${batch.template}.${slice}` : batch.template,
          template: batch.template, matrices: batch.matrices.subarray(first * 16, last * 16),
          tints: batch.tints?.subarray(first * 4, last * 4), gpu: template + (last - first) * each });
      }
    }
    return parts;
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
      yield;
      const parts = yield* partsOf(lod, { meshes, instances });
      // CPU: the split arrays plus instance data (slices share one buffer).
      const cpuBytes = parts.reduce((n, p) => n + (p.kind === "mesh" ? p.gpu : instanceBytesOf(p)), 0);
      const gpuBytes = parts.reduce((n, p) => n + p.gpu, 0);
      const beginUpload = (): UploadJob => {
        const made: Mesh[] = [];
        let next = 0, uploadedBytes = 0, finished = false;
        return {
          get done() { return next >= parts.length; },
          get uploadedBytes() { return uploadedBytes; },
          step(maxBytes, force) {
            let now = 0;
            while (next < parts.length) {
              const part = parts[next]!;
              if (now + part.gpu > maxBytes && !(force && now === 0)) break;
              made.push(uploadPart(chunk, lod, part));
              now += part.gpu; uploadedBytes += part.gpu; next++;
            }
            return now;
          },
          finish() {
            if (next < parts.length || finished) throw new Error(`Upload of ${chunk.id}@${lod} is not complete.`);
            finished = true;
            return resident(made, cpuBytes, gpuBytes);
          },
          cancel() { if (!finished) for (const m of made.splice(0)) m.dispose(false, false); },
        };
      };
      const prepared: PreparedArt = {
        cpuBytes, gpuBytes, beginUpload,
        upload() { const job = beginUpload(); job.step(Infinity, true); return job.finish(); },
        discard() { /* plain arrays: dropping the reference frees them */ },
      };
      return prepared;
    },
  };
}
