import { activeDrone } from "../sim/signatures.js";
import type { GameState, Vec3, WorldQueries } from "../sim/types.js";
import { eyeHeight } from "../sim/state.js";
import { CREEL_SEAT } from "../sim/fleet.js";
import { inCanopyAir } from "../sim/inventory.js";
import { localToWorld } from "../sim/carrier.js";
import { atCarrierHelm } from "../sim/carrierStations.js";

/** The player view (ATM-1, Babylon-free): where the eye is, where it looks,
 * and where the lamp sits. Render-only; the simulation's pose, targeting and
 * stimulus are untouched.
 *
 * - **Seats.** Dart and Creel pilots look from their compartment's datum.
 * - **Creel work view.** Pitching down to work the tool arms slides the
 *   pilot's eye forward over the bow, through the forward window's opening,
 *   so the claws and the work below are in view instead of the cockpit
 *   floor (M2 audit #1).
 * - **Hearthline helm** (UX-1). The pilot stands at the bridge console and
 *   looks out of the bow and side windows; a head look turns the view only.
 * - **Eye collision.** The eye never rests inside a solid or under terrain
 *   (audit #6: a diver eye inside the Dart cradle's rail). */

/** Creel arm work eye, hull-local: just ahead of the bow, above the claws. */
export const CREEL_WORK_EYE = { x: 0, y: 2.0, z: -3.3 } as const;
/** Pitch (radians) where the work view starts and where it is complete. */
export const WORK_VIEW_PITCH = { start: -0.4, full: -0.72 } as const;
/** Hearthline helm eye, carrier-local: standing behind the bridge console,
 * high enough to see over it through the bow window band (y 5.0-7.1). */
export const HELM_EYE = { x: 0, y: 5.72, z: -6.95 } as const;
/** Lamp origin ahead of the helm eye, clear of the bow glazing (z -12.45). */
const HELM_LAMP_NEAR = 6.2;
/** Head look relative to the view's own heading and pitch, radians. */
export interface HeadLook { readonly yaw: number; readonly pitch: number }

/** Radius of the eye probe kept clear of solids and terrain, metres. */
export const EYE_RADIUS = 0.14;

const smooth = (low: number, high: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - low) / (high - low)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/** How far into the work view a Creel pilot is at `pitch` (0..1). */
export const workView = (pitch: number): number => smooth(-WORK_VIEW_PITCH.start, -WORK_VIEW_PITCH.full, -pitch);

/** The Creel pilot's hull-local eye at `pitch`. The path runs through the
 * forward window's opening (y 1.71-2.45 at z -2.75), never a wall. */
export function creelEye(pitch: number): Vec3 { return lerp(CREEL_SEAT, CREEL_WORK_EYE, workView(pitch)); }

/** True when a probe of `radius` round `p` is clear of every solid and above
 * the floor. */
export function eyeClear(world: WorldQueries, p: Vec3, radius = EYE_RADIUS): boolean {
  return world.clearance({ x: p.x, y: p.y - radius, z: p.z }, { radius, height: radius * 2 });
}

const OUT_DIRECTIONS: readonly Vec3[] = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
  { x: .7071, y: 0, z: .7071 }, { x: -.7071, y: 0, z: .7071 }, { x: .7071, y: 0, z: -.7071 }, { x: -.7071, y: 0, z: -.7071 },
];

/** The eye kept out of solids and terrain. From a clear `anchor` (the body,
 * or the seat) it stops at the last clear point toward `eye`; with no clear
 * anchor it steps out to the nearest clear point within a metre. */
export function clearEye(world: WorldQueries, eye: Vec3, anchor?: Vec3, radius = EYE_RADIUS): Vec3 {
  if (eyeClear(world, eye, radius)) return eye;
  if (anchor && eyeClear(world, anchor, radius)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (eyeClear(world, lerp(anchor, eye, mid), radius)) lo = mid; else hi = mid;
    }
    return lerp(anchor, eye, lo);
  }
  for (let d = 0.1; d <= 1.001; d += 0.1)
    for (const o of OUT_DIRECTIONS) {
      const p = { x: eye.x + o.x * d, y: eye.y + o.y * d, z: eye.z + o.z * d };
      if (eyeClear(world, p, radius)) return p;
    }
  return eye;
}

export interface PlayerView {
  readonly eye: Vec3;
  /** Unit view direction. */
  readonly forward: Vec3;
  /** The lamp's origin: ahead of the eye far enough to clear the pilot's own
   * compartment (its walls must not glare in the lamp). */
  readonly lamp: Vec3;
  /** Creel work-view blend, 0..1. */
  readonly work: number;
}

/** The exterior view for a playing state (opening done). `toWorld` maps a
 * hull-local point of the piloted Dart or Creel to world space, or is null
 * when the player is not seated in one; `dartSeat` is the Dart's view datum.
 * `world` is the exterior world for eye collision; local rooms (cabins, the
 * carrier, the canopy lab) skip it. */
export function playerView(state: GameState, toWorld: ((local: Vec3) => Vec3) | null, world: WorldQueries | null,
  dartSeat: Vec3, look?: HeadLook): PlayerView {
  const { pose } = state.player;
  const helm = atCarrierHelm(state);
  if (helm) {
    const yaw = pose.yaw + (look?.yaw ?? 0), pitch = Math.max(-1.35, Math.min(1.35, pose.pitch + (look?.pitch ?? 0)));
    const forward = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
    const eye = localToWorld(HELM_EYE, helm);
    return { eye, forward, work: 0, lamp: { x: eye.x + forward.x * HELM_LAMP_NEAR, y: eye.y + forward.y * HELM_LAMP_NEAR, z: eye.z + forward.z * HELM_LAMP_NEAR } };
  }
  // SIG-1: while the Mantle's scout drone is out, the view is the drone's camera.
  const droneHost = activeDrone(state);
  if (droneHost) {
    const d = droneHost.upgrades.drone!, yaw = d.yaw + (look?.yaw ?? 0), pitch = Math.max(-1.35, Math.min(1.35, d.pitch + (look?.pitch ?? 0)));
    const forward = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
    // The drone's own swept capsule (0.35 m) keeps its camera out of rock.
    const eye = d.position;
    return { eye, forward, work: 0, lamp: { x: eye.x + forward.x * 0.3, y: eye.y + forward.y * 0.3, z: eye.z + forward.z * 0.3 } };
  }
  const forward = { x: Math.sin(pose.yaw) * Math.cos(pose.pitch), y: Math.sin(pose.pitch), z: -Math.cos(pose.yaw) * Math.cos(pose.pitch) };
  const seated = toWorld ? state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId) : undefined;
  let eye: Vec3, work = 0, near: number;
  if (seated && toWorld) {
    if (seated.hull === "creel") {
      work = workView(pose.pitch);
      const seat = toWorld(CREEL_SEAT);
      eye = toWorld(creelEye(pose.pitch));
      if (work > 0 && world) eye = clearEye(world, eye, seat);
      near = 1.6 + (0.4 - 1.6) * work;
    } else {
      eye = toWorld(dartSeat);
      near = 1.1;
    }
  } else {
    const p = pose.position;
    eye = { x: p.x, y: p.y + eyeHeight(state), z: p.z };
    const local = state.player.mode === "interior" || inCanopyAir(state) || state.player.mode === "piloting";
    if (world && !local) eye = clearEye(world, eye, { x: p.x, y: p.y + Math.min(eyeHeight(state), 0.4), z: p.z });
    near = 0.2;
  }
  return { eye, forward, work, lamp: { x: eye.x + forward.x * near, y: eye.y + forward.y * near, z: eye.z + forward.z * near } };
}
