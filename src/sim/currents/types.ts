/** Authored current volumes. No fluid simulation: each volume is a shape with
 * a direction, a peak strength, a soft edge and an optional cycle. Currents
 * are obstacles and route texture; they push and cost power, and the player
 * never rides them (see motion.ts). */
import type { Vec3 } from "../types.js";

export type CurrentShape =
  /** A box around `center`, turned `yaw` radians about +Y (0 keeps the axes;
   * positive turns +X toward −Z, the game's yaw sense). */
  | { readonly kind: "box"; readonly center: Vec3; readonly half: Vec3; readonly yaw?: number }
  /** A capsule tube from `a` to `b`; flow runs a→b unless `direction` says otherwise. */
  | { readonly kind: "tube"; readonly a: Vec3; readonly b: Vec3; readonly radius: number };

export interface CurrentVolumeDef {
  readonly id: string;
  readonly label: string;
  readonly shape: CurrentShape;
  /** Flow direction (normalised on use). Required for boxes; tubes default to a→b. */
  readonly direction?: Vec3;
  /** Peak flow speed, m/s. */
  readonly strength: number;
  /** Metres over which the flow fades at the boundary. With the default
   * `inside` falloff it rises from 0 at the boundary to full `edge` metres
   * in (smoothly), so the authored shape is the outer limit of any flow. */
  readonly edge: number;
  /** `outside`: full inside the shape, fading linearly to 0 over `edge`
   * metres beyond it: S4's `shapeWeight`, for migrated hazard fields. */
  readonly falloff?: "inside" | "outside";
  /** A cycle whose 0..1 level scales the strength. */
  readonly cycle?: string;
  /** Share of the strength that stays while the cycle is at 0 (S4's
   * `baseline`): the scale is baseline + (1 − baseline) × level. */
  readonly baseline?: number;
  /** Sheltered pockets (behind a boulder, in a notch) where this volume's flow
   * is stilled, with the same soft edge. */
  readonly lees?: readonly { readonly min: Vec3; readonly max: Vec3 }[];
  /** What the player sees before being pushed (never colour alone). */
  readonly cue: string;
}

/** Who is in the water: the diver, or a hull with its drive. Values come from
 * SYS-1's `craftProfile` at composition (content/currents/actors.ts mirrors
 * today's numbers). */
export interface CurrentActor {
  readonly id: string;
  /** 0..0.95, S4/SYS-1 `current`: how little the flow moves this body.
   * Drift is flow × (1 − authority). */
  readonly authority: number;
  /** Ordinary drive speed, m/s; also the most drift station keeping can cancel. */
  readonly cruise: number;
  /** Cruise drain, battery percent per second; 0 for the diver. */
  readonly drain: number;
}

/** How the actor resists drift while it is not driving.
 * - `none`: it drifts (a diver at rest, an unpowered or disabled hull).
 * - `station`: a powered hull's thrusters cancel drift up to `cruise`.
 * - `grapple`: the Creel's anchor-and-reel line (SYS-1 `grappleStep`) holds.
 * - `anchor`: the Hearthline mooring anchor (SYS-1 `anchoredDrift`). */
export type HoldMode = "none" | "station" | "grapple" | "anchor";
