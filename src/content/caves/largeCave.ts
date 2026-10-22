import type { RegionId } from "../registry.js";
import type { CraftProfileId } from "../regions/passages.js";
import type { Aabb, Rect, Vec3 } from "../../world/types.js";

/** Authored source for a cave BIOME (150-300 m; Babylon-free, plain data).
 *
 * Designers place zones, carved water (chambers, spline tunnels, shafts),
 * rock added back (root pillars, fallen blocks), openings, life and routes by
 * hand. Procedural detail is surface noise only (`wobble`). Everything else a
 * cave biome needs (the field, chunk meshes, the collision mesh, light) is
 * generated from this by `src/world/caves/large/*` and is never hand-edited.
 *
 * Ownership: a cave biome owns its `domain` box below the cap (the seabed
 * less `roofMin`), plus every `collar` rectangle outright, seabed included. Carved water outside collars
 * must stay under the cap, so the exterior heightfield is rock everywhere the
 * cave does not own: the two never disagree about open water.
 *
 * Metres, +Y up, water surface at Y = 0, +X east, +Z north. */

export type LargeCaveZoneRole = "entry" | "garden" | "pool" | "gallery" | "hub" | "passage";

export interface LargeCaveZone {
  readonly id: string;
  readonly label: string;
  readonly role: LargeCaveZoneRole;
  /** Daylight falloff length inside this zone, metres; shorter is darker. */
  readonly falloff: number;
  /** Rock colours (hex): floor, wall, ceiling, and a stain/accent. */
  readonly palette: { readonly floor: string; readonly wall: string; readonly ceiling: string; readonly accent: string };
  /** In-cave fog: tint (hex) and density per metre. */
  readonly fog: { readonly color: string; readonly density: number };
  /** Short design note, not player text. */
  readonly note: string;
}

interface CarveBase {
  readonly id: string;
  readonly zone: string;
  /** Wall wobble amplitude, metres (surface noise). */
  readonly wobble: number;
}
/** A spline tunnel. Nodes give the floor centre, the clear width at mid
 * height and the clear height; a Catmull-Rom curve runs through them. */
export interface TunnelNode { readonly x: number; readonly y: number; readonly z: number; readonly width: number; readonly height: number }
export interface TunnelCarve extends CarveBase { readonly kind: "tunnel"; readonly nodes: readonly TunnelNode[] }
/** A superellipsoid hall with a flat floor, turned by `yaw` (radians). */
export interface ChamberCarve extends CarveBase {
  readonly kind: "chamber";
  readonly center: Vec3;
  readonly radii: { readonly x: number; readonly z: number; readonly up: number; readonly down: number };
  readonly yaw: number;
  /** Flat water floor, metres (clips the lower half). */
  readonly floor: number;
}
/** A round shaft from `bottom` to `top` with rounded ends, widening by
 * `flare` towards the top. */
export interface ShaftCarve extends CarveBase {
  readonly kind: "shaft";
  readonly bottom: Vec3;
  readonly top: Vec3;
  readonly radius: number;
  readonly flare: number;
}
export type LargeCaveCarve = TunnelCarve | ChamberCarve | ShaftCarve;

/** Rock added back after carving. A pillar is a tapered capsule (a root
 * column); a block is a rounded box (fallen roof). */
export interface PillarRock { readonly kind: "pillar"; readonly id: string; readonly a: Vec3; readonly b: Vec3; readonly radiusA: number; readonly radiusB: number; readonly wobble: number }
export interface BlockRock { readonly kind: "block"; readonly id: string; readonly center: Vec3; readonly half: Vec3; readonly yaw: number; readonly round: number }
export type LargeCaveRock = PillarRock | BlockRock;

export type LargeCavePortalKind = "mouth" | "back_entrance" | "throat";
/** An opening. `normal` is a unit vector from `between[0]` towards
 * `between[1]`; `clear` is the open rectangle across it (width horizontal,
 * height vertical) that generation must keep. `admits` lists the profiles
 * whose collision proxies fit through it with margin. */
export interface LargeCavePortal {
  readonly id: string;
  readonly kind: LargeCavePortalKind;
  readonly label: string;
  readonly between: readonly [string, string];
  readonly center: Vec3;
  readonly normal: Vec3;
  readonly clear: { readonly width: number; readonly height: number };
  readonly admits: readonly CraftProfileId[];
}

/** Glowing life, scattered on rock within `radius` of `at` (deterministic).
 * `kind` picks the form; colour is unlit, so it reads in the dark, and its
 * light is baked onto nearby rock through water only. */
export interface LargeCaveLife {
  readonly id: string;
  readonly zone: string;
  readonly kind: "frond" | "colony" | "root_tip" | "silt_glow";
  readonly at: Vec3;
  readonly radius: number;
  readonly count: number;
  readonly color: string;
  /** Light it casts on nearby rock, 0..1, and its reach in metres. */
  readonly light: number;
  readonly reach: number;
}

/** A resource or find socket (a proposal: kinds are not registry items yet). */
export interface LargeCaveSocket { readonly id: string; readonly zone: string; readonly kind: string; readonly at: Vec3; readonly note: string }

export interface LargeCaveRoute {
  readonly id: string;
  readonly profile: CraftProfileId;
  readonly role: "loop" | "spur" | "exit";
  /** Pose datums (feet or keel) from outside to outside for a loop. */
  readonly path: readonly Readonly<Vec3>[];
}

export interface LargeCaveStaging {
  readonly id: string;
  readonly label: string;
  /** Keel datum of a parked craft or the carrier's station. */
  readonly position: Vec3;
  readonly radius: number;
  readonly profiles: readonly CraftProfileId[];
}

export interface LargeCaveSource {
  readonly id: string;
  readonly label: string;
  readonly region: RegionId;
  /** Owned box. X/Z and Y edges sit on the chunk lattice (`chunk` metres). */
  readonly domain: Aabb;
  /** Chunk edge and sampling voxel, metres. */
  readonly chunk: number;
  readonly voxel: number;
  /** Columns the cave owns outright, seabed included (lattice-aligned). */
  readonly collars: readonly Rect[];
  /** Least rock between carved water and the seabed outside collars, metres. */
  readonly roofMin: number;
  /** Smooth-union radius between carves, metres. */
  readonly blend: number;
  readonly zones: readonly LargeCaveZone[];
  readonly carves: readonly LargeCaveCarve[];
  readonly rocks: readonly LargeCaveRock[];
  readonly portals: readonly LargeCavePortal[];
  readonly life: readonly LargeCaveLife[];
  readonly sockets: readonly LargeCaveSocket[];
  readonly routes: readonly LargeCaveRoute[];
  readonly staging: readonly LargeCaveStaging[];
  /** Proposed placement, for the coordinator (not wired into the world). */
  readonly proposal: { readonly location: string; readonly depth: string };
  readonly note: string;
}

export const EXTERIOR = "exterior";
