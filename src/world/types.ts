import type { RegionId } from "../content/registry.js";
import type { Vec3 } from "../sim/types.js";

/** World runtime descriptors. Metres, right-handed, Y up, water at Y = 0, so
 * depth below the surface is -Y. Every ID is a stable string. Nothing here is
 * Babylon, saved state or simulation truth: descriptors say where content is
 * and how it may be presented, and the composed registry says what it means. */
export type { RegionId, Vec3 };

/** Inclusive axis-aligned box. `min` <= `max` on every axis. */
export interface Aabb {
  readonly min: Readonly<Vec3>;
  readonly max: Readonly<Vec3>;
}
/** Inclusive horizontal rectangle (X/Z). */
export interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Presentation distances, metres from the viewer to a chunk's 3D box.
 * Closer than `fine` draws the fine representation; up to `coarse` draws the
 * coarse one; beyond `coarse` nothing of the chunk is drawn. `hysteresis` is
 * the extra distance a chunk keeps its current band before it is downgraded,
 * so an orbiting camera does not rebuild across a boundary every frame. */
export interface LodBands {
  readonly fine: number;
  readonly coarse: number;
  readonly hysteresis: number;
}
export type LodLevel = "fine" | "coarse";

/** Named biome, used for palette, scatter and LOD defaults. IDs are free
 * strings validated against the layout's biome list, so authoring a new biome
 * never edits this file. */
export type BiomeId = string;
export interface BiomeDescriptor {
  readonly id: BiomeId;
  readonly label: string;
  /** Defaults for chunks of this biome; a region or chunk may override. */
  readonly lod?: Partial<LodBands>;
}

/** How one region connects to another. `portal` is the box the route passes
 * through; residency may prefetch across it and S2/S5 can cite it in leads. */
export type RegionLinkKind = "open" | "passage" | "ledge" | "shaft" | "land";
export interface RegionLink {
  readonly to: RegionId;
  readonly kind: RegionLinkKind;
  readonly portal: Aabb;
  /** Narrowest half-width along the link, metres, for hull clearance. */
  readonly minHalfWidth?: number;
  /** True when the inhabited carrier can make this crossing. */
  readonly carrier?: boolean;
  /** Render hysteresis: a viewer inside this box who was last in `to` is
   * still treated as in `to`, so a swimmer on the handover line does not swap
   * detailed region art every step. Presentation only. */
  readonly hold?: Aabb;
}

/** Where and how the player gets in. Hulls are hull-role IDs, capabilities are
 * registry capability IDs; both are validated by the composed registry. */
export type AccessKind = "diver" | "hull" | "carrier" | "land";
export interface AccessPoint {
  readonly id: string;
  readonly kind: AccessKind;
  readonly position: Readonly<Vec3>;
  /** Free radius around `position` that authored art must keep open, metres. */
  readonly clearance?: number;
}
export interface RegionAccess {
  /** Pressure rating needed to work the region's deepest required site. */
  readonly depthRatingM: number;
  readonly capabilities?: readonly string[];
  readonly entrances: readonly AccessPoint[];
}

export interface RegionDescriptor {
  readonly id: RegionId;
  /** Envelope: horizontal extent plus vertical extent (deepest floor to
   * highest land or structure). Region envelopes may overlap. */
  readonly bounds: Aabb;
  /** Horizontal membership as a union of rectangles. Where footprints of
   * different regions overlap, the earlier region in the layout wins. */
  readonly footprint: readonly Rect[];
  /** Primary biome first. */
  readonly biomes: readonly BiomeId[];
  readonly adjacency: readonly RegionLink[];
  readonly access: RegionAccess;
  readonly lod?: Partial<LodBands>;
}

/** A chunk is one grid column cell, optionally split into vertical layers
 * (layer 0 carries the terrain). It is the unit of residency, culling, LOD
 * and byte accounting. */
export interface ChunkCell {
  readonly ix: number;
  readonly iz: number;
  readonly layer: number;
}
/** `chunk:<ix>:<iz>:<layer>`, see `chunkId`. */
export type ChunkId = string;

/** A reference to a render factory by ID with plain parameters. Factories are
 * registered by render code (`src/render/kit`, `src/render/biomes`), so a
 * descriptor stays serialisable and Babylon-free. */
export interface ChunkArtRef {
  readonly factory: string;
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

export interface ChunkDescriptor {
  readonly id: ChunkId;
  readonly cell: ChunkCell;
  /** X/Z exactly the grid cell; Y the content extent of this layer. */
  readonly bounds: Aabb;
  readonly region: RegionId;
  readonly biome: BiomeId;
  /** Resolved bands: chunk override, else region, else biome, else default. */
  readonly lod: LodBands;
  readonly art: readonly ChunkArtRef[];
  /** Residency bias. Higher wins ties and is evicted last; refuges use 1. */
  readonly priority?: number;
}

export interface WorldLayout {
  readonly envelope: Aabb;
  readonly chunkSize: number;
  readonly biomes: readonly BiomeDescriptor[];
  /** Order matters: earlier footprints win overlaps. */
  readonly regions: readonly RegionDescriptor[];
  readonly chunks: readonly ChunkDescriptor[];
}

/** Things simulation, story and ecology look up by place. The index is built
 * from content data and answers identically whether or not any art is
 * resident. `data` carries the original record, e.g. a `Solid`. */
export type SpatialKind =
  | "solid" | "source" | "landmark" | "host" | "access" | "refuge" | "hazard" | "volume";
export interface SpatialEntry<T = unknown> {
  readonly id: string;
  readonly kind: SpatialKind;
  readonly bounds: Aabb;
  readonly region?: RegionId;
  readonly data?: T;
}

/** Broad-phase spatial queries. Every list result is in insertion order, so a
 * caller that used to scan a full roster sees the same relative order and
 * produces bit-identical results from the candidate subset. */
export interface SpatialQuery<T = unknown> {
  readonly size: number;
  get(id: string): SpatialEntry<T> | undefined;
  /** Entries whose bounds intersect `box` (touching counts). */
  inBox(box: Aabb, kinds?: readonly SpatialKind[]): SpatialEntry<T>[];
  /** The data of `kind` entries whose bounds intersect `box`, in `inBox`'s
   * order, written into `out[0 .. count)`; returns the count (entries past it
   * are stale). Allocation-free once `out` has grown, for the simulation's
   * per-tick queries; `out` belongs to the caller. */
  dataInBox(box: Aabb, kind: SpatialKind, out: T[]): number;
  /** Entries whose bounds lie within `radius` of `point`. */
  near(point: Readonly<Vec3>, radius: number, kinds?: readonly SpatialKind[]): SpatialEntry<T>[];
  /** Entries whose bounds, inflated by `pad`, the segment a→b touches. */
  alongSegment(a: Readonly<Vec3>, b: Readonly<Vec3>, pad?: number, kinds?: readonly SpatialKind[]): SpatialEntry<T>[];
  /** Closest entry by box distance; ties go to the earlier entry. */
  nearest(point: Readonly<Vec3>, kinds?: readonly SpatialKind[], maxDistance?: number): SpatialEntry<T> | null;
}

/** The composed, validated world: descriptor lookup plus place queries. */
export interface WorldMap<T = unknown> {
  readonly layout: WorldLayout;
  readonly index: SpatialQuery<T>;
  region(id: RegionId): RegionDescriptor | undefined;
  chunk(id: ChunkId): ChunkDescriptor | undefined;
  /** First region whose footprint contains p's X/Z (layout order), else the
   * primary region of the chunk at `p`, else null. Not chunk-granular:
   * a 128 m chunk may straddle compact regions. */
  regionAt(p: Readonly<Vec3>): RegionId | null;
  /** The layer containing p.y in p's column, else the nearest layer. */
  chunkAt(p: Readonly<Vec3>): ChunkDescriptor | null;
  /** Chunks whose box lies within `radius` of `p`, nearest first. */
  chunksWithin(p: Readonly<Vec3>, radius: number): { chunk: ChunkDescriptor; distance: number }[];
}
