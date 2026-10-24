/** ENV-1: an explorable interior as data (Babylon-free). An interior speaks the
 * cave vocabulary (rooms, portals, routes, staging; `content/regions/caves.ts`),
 * built from an architectural kit instead of voxel rock. Every coordinate here
 * is interior-local: X east, Y up from the floor datum, Z north at quarter 0;
 * `anchor` and `quarter` place it in the world (see `geometry.ts`).
 *
 * Templates are named, never built here: `templates.ts` holds each template's
 * size and collision class, and the recipes live with the renderer
 * (`render/interiors/`), so content never reaches render code. */
import type { CavePortalKind, CaveRoomRole, CaveStaging } from "../regions/caves.js";
import type { CraftProfileId } from "../regions/passages.js";
import type { HullId, RegionId } from "../registry.js";
import type { Aabb, Vec3 } from "../../world/types.js";

/** Quarter turns about +Y. Architecture stays box-exact on this grid. */
export type Quarter = 0 | 1 | 2 | 3;
/** The room id portals use for the world outside the building. */
export const OUTSIDE = "outside";

/** Cave aperture kinds, extended by the built ones. */
export type InteriorPortalKind = CavePortalKind | "door" | "window" | "hatch" | "breach" | "lock" | "sump";

export interface InteriorRoom {
  readonly id: string;
  readonly role: CaveRoomRole;
  readonly label: string;
  /** Daylight falloff length, metres (as `CaveRoomSource`). */
  readonly falloff: number;
  /** The room's open volume, local. */
  readonly bounds: Aabb;
}

/** An aperture, local. `normal` is a unit axis from `between[0]` to
 * `between[1]`; `clear` is the open rectangle centred on `center`, width
 * along the horizontal in-plane axis (X for an up-facing hatch) and height
 * along Y (Z for an up-facing hatch), as `CavePortal`. A portal to `OUTSIDE`
 * is a way out, except a sump, which leads on into a cave. */
export interface InteriorPortal {
  readonly id: string;
  readonly kind: InteriorPortalKind;
  readonly label: string;
  readonly between: readonly [string, string];
  readonly center: Vec3;
  readonly normal: Vec3;
  readonly clear: { readonly width: number; readonly height: number };
  readonly admits: readonly CraftProfileId[];
}

/** Shell modules. Each piece is one axis-aligned box: what it draws, it collides. */
export type ShellModule = "floor" | "wall" | "ceiling" | "column" | "roof" | "plinth";
export interface ShellPiece {
  readonly id: string;
  readonly module: ShellModule;
  readonly min: Vec3;
  readonly max: Vec3;
}

export type DetailTier = "structure" | "dressing" | "clutter";
/** One prop: a template at a local base point (the template's base centre), turned by quarters. */
export interface Placement {
  readonly id: string;
  readonly template: string;
  readonly at: Vec3;
  readonly quarter: Quarter;
  readonly tier: DetailTier;
  /** A neat stack the placement belongs to (bundles on bundles, bags on hooks). */
  readonly stack?: string;
}
export type StackKind = "bundle_stack" | "rack" | "hooks";
export interface DressingStack { readonly id: string; readonly kind: StackKind }

/** An emissive cluster: at most `MAX_INTERIOR_LIGHTS` per interior. */
export interface InteriorLight { readonly id: string; readonly room: string; readonly at: Vec3; readonly color: string }
/** A sound tell. Its caption describes the sound and its direction, never the site's secret. */
export interface SoundTell { readonly id: string; readonly at: Vec3; readonly cue: string; readonly caption: string }

/** A host the interior is built around. Its position belongs to its own authority. */
export type HostRef =
  | { readonly kind: "evidence"; readonly id: string }
  | { readonly kind: "story"; readonly id: string }
  | { readonly kind: "lost_site"; readonly id: string };

/** Where a craft parks for this interior: a cave staging, plus the heading it
 * parks at and the open-water point it approaches from (local). */
export interface InteriorStaging extends CaveStaging {
  readonly yaw: number;
  readonly approach: Vec3;
}

/** One route's first visit, for the air proof: the SAVE-1 milestone whose fleet
 * and suit the route has here, the one craft it brings (null: swimming from
 * shore or the surface) and where that craft parks. */
export interface FirstAccess {
  readonly route: string;
  readonly milestone: string;
  readonly craft: HullId | null;
  readonly staging: string | null;
}

export interface InteriorDef {
  readonly id: string;
  readonly label: string;
  readonly region: RegionId;
  /** The S2 site, story place or lost site this interior belongs to. */
  readonly site: string;
  /** World position of the local origin (the floor datum). */
  readonly anchor: Vec3;
  readonly quarter: Quarter;
  readonly rooms: readonly InteriorRoom[];
  readonly portals: readonly InteriorPortal[];
  readonly staging: readonly InteriorStaging[];
  readonly shell: readonly ShellPiece[];
  readonly dressing: readonly Placement[];
  readonly stacks: readonly DressingStack[];
  readonly lights: readonly InteriorLight[];
  readonly sounds: readonly SoundTell[];
  readonly hosts: readonly HostRef[];
  readonly firstAccess: readonly FirstAccess[];
  /** Structure ids this interior takes over (ENV-1 §3.7). */
  readonly replaces: readonly string[];
}

export const MAX_INTERIOR_LIGHTS = 6;
