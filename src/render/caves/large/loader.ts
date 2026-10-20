import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ChunkLoader, PreparedArt, ResidentArt, UploadJob } from "../../../world/residency.js";
import type { ChunkDescriptor, LodLevel } from "../../../world/types.js";
import type { ArtArrays } from "../../../world/caves/large/bake.js";
import { KIT_RENDERING_GROUP } from "../../kit/loader.js";
import { LARGE_CAVE_ATTRIBUTE } from "./caveShader.js";

/** Residency loader for cave-biome chunks (S1 `ChunkLoader`).
 *
 * `art(descriptor, lod)` supplies the chunk's arrays: decoded from the bake
 * (production) or taken from a live build (labs, tests). The build step
 * decodes in one bounded unit and yields; the upload is one part per mesh
 * (rock, then life at fine), so a chunk never exceeds the per-frame cap by
 * more than its rock mesh. Bytes: every array Babylon keeps (CPU) and
 * uploads (GPU), the light attribute included. */

export interface CaveArtSource {
  art(chunk: ChunkDescriptor, lod: LodLevel): { rock: ArtArrays; life: ArtArrays | null };
}

export const artBytes = (a: ArtArrays): number =>
  a.positions.byteLength + a.normals.byteLength + a.colors.byteLength + a.light.byteLength + a.indices.byteLength;

function upload(a: ArtArrays, name: string, scene: Scene, material: ShaderMaterial, meta: Record<string, unknown>): Mesh {
  const mesh = new Mesh(name, scene);
  mesh.setVerticesData("position", a.positions, false, 3);
  mesh.setVerticesData("normal", a.normals, false, 3);
  mesh.setVerticesData("color", a.colors, false, 4);
  mesh.setVerticesData(LARGE_CAVE_ATTRIBUTE, a.light, false, 4);
  mesh.setIndices(a.indices);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.renderingGroupId = KIT_RENDERING_GROUP;
  mesh.freezeWorldMatrix();
  mesh.metadata = meta;
  mesh.setEnabled(false);
  return mesh;
}

export function createCaveLoader(options: { scene: Scene; material: ShaderMaterial; source: CaveArtSource }): ChunkLoader & { readonly stats: { live: number; decodeMs: number } } {
  const { scene, material, source } = options;
  const stats = { live: 0, decodeMs: 0 };
  return {
    stats,
    *build(chunk, lod) {
      yield;
      const t = performance.now();
      const { rock, life } = source.art(chunk, lod);
      stats.decodeMs += performance.now() - t;
      const parts = [{ name: "rock", a: rock }, ...(life && lod === "fine" ? [{ name: "life", a: life }] : [])];
      const bytes = parts.reduce((n, p) => n + artBytes(p.a), 0);
      const art: PreparedArt = {
        cpuBytes: bytes, gpuBytes: bytes,
        upload() { const j = this.beginUpload!(); j.step(Infinity, true); return j.finish(); },
        beginUpload(): UploadJob {
          const made: Mesh[] = [];
          let next = 0, uploaded = 0, finished = false;
          return {
            get done() { return next >= parts.length; },
            get uploadedBytes() { return uploaded; },
            step(maxBytes, force) {
              let now = 0;
              while (next < parts.length) {
                const p = parts[next]!, b = artBytes(p.a);
                if (now + b > maxBytes && !(force && now === 0)) break;
                made.push(upload(p.a, `${chunk.id}.${lod}.${p.name}`, scene, material, { chunk: chunk.id, lod }));
                now += b; uploaded += b; next++;
              }
              return now;
            },
            finish(): ResidentArt {
              if (next < parts.length || finished) throw new Error(`cave upload of ${chunk.id}@${lod} is not complete`);
              finished = true; stats.live++;
              let disposed = false;
              return {
                cpuBytes: bytes, gpuBytes: bytes,
                setVisible(v) { for (const m of made) m.setEnabled(v); },
                dispose() { if (disposed) return; disposed = true; stats.live--; for (const m of made) m.dispose(false, false); },
              };
            },
            cancel() { if (!finished) for (const m of made.splice(0)) m.dispose(false, false); },
          };
        },
        discard() { /* plain arrays: nothing to release */ },
      };
      return art;
    },
  };
}
