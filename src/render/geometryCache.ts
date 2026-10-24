import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene, Material } from "@babylonjs/core";

type Vertices = NonNullable<ReturnType<Mesh["getVerticesData"]>>;
type Indices = NonNullable<ReturnType<Mesh["getIndices"]>>;
interface BakedArt {
  readonly attributes: readonly { kind: string; data: Vertices; stride: number; updatable: boolean }[];
  readonly indices: Indices;
  readonly contour: number;
}
export interface ArtCacheKey { readonly owner: GeometryCache; readonly key: string }

/** One renderer's immutable authored batches, never live Babylon objects or
 * gameplay state. Only deterministic regional factories opt in with a complete
 * generation namespace. Dart-local immutable batches also opt in; live hulls,
 * lock configurations, state and animated/world poses never do.
 * Admission is bounded; exceeding either limit falls back to ordinary baking. */
export class GeometryCache {
  private readonly entries = new Map<string, BakedArt>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private disposed = false;
  constructor(private readonly maxEntries = 256, private readonly maxBytes = 32 * 1024 * 1024) {}

  get stats() { return { entries: this.entries.size, bytes: this.bytes, hits: this.hits, misses: this.misses,
    maxEntries: this.maxEntries, maxBytes: this.maxBytes, disposed: this.disposed }; }

  read(key: string, name: string, scene: Scene, material: Material): { mesh: Mesh; contour: number } | null {
    const data = this.disposed ? undefined : this.entries.get(key);
    if (!data) { this.misses++; return null; }
    this.hits++;
    const mesh = new Mesh(name, scene);
    // Babylon retains CPU buffer data. Give each live geometry a detached copy:
    // updates/disposal/context restoration cannot mutate the immutable recipe.
    for (const a of data.attributes) mesh.setVerticesData(a.kind, a.data.slice(), a.updatable, a.stride);
    mesh.setIndices(data.indices.slice());
    mesh.material = material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return { mesh, contour: data.contour };
  }

  store(key: string, mesh: Mesh, contour: number): void {
    if (this.disposed || this.entries.has(key) || this.entries.size >= this.maxEntries) return;
    const attributes = mesh.getVerticesDataKinds().map(kind => {
      const buffer = mesh.getVertexBuffer(kind)!;
      return { kind, data: mesh.getVerticesData(kind)!, stride: buffer.getSize(), updatable: buffer.isUpdatable() };
    });
    const indices = mesh.getIndices()!;
    // Exact numeric payload size, excluding JS object/array overhead and driver
    // allocations. Preserve array types/precision as well as authored values.
    const size = (data: Vertices | Indices): number => Array.isArray(data) ? data.length * 8 : data.byteLength;
    const bytes = attributes.reduce((n, a) => n + size(a.data), size(indices));
    if (this.bytes + bytes > this.maxBytes) return;
    this.entries.set(key, { attributes: attributes.map(a => ({ ...a, data: a.data.slice() })), indices: indices.slice(), contour });
    this.bytes += bytes;
  }

  dispose(): void { this.disposed = true; this.entries.clear(); this.bytes = 0; }
}
