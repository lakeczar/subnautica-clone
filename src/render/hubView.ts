import { STRUCTURES } from "../content/regions/structures.js";
import { CROWN_MAST } from "../content/hub/crownStation.js";
import { HUB_PINNACLES } from "../content/regions/terrain.js";
import type { Vec3 } from "../sim/types.js";

/** The hub's landmark presentation (W2), Babylon-free: where the summit
 * beacon is, how far its light carries through the murk, and where the
 * crown rays are at any moment. Presentation only: nothing here is saved or
 * simulated, and every pose is a pure function of time. */

const house = STRUCTURES.find(s => s.id === "hub.beacon_house.house")!.solids[0]!;
/** The beacon house's lamp room, world space. */
export const BEACON: Vec3 = { x: (house.min.x + house.max.x) / 2, y: house.max.y - 1.35, z: (house.min.z + house.max.z) / 2 };

/** A bright point source scatters through the murk: its glow fades over
 * `BEACON_REACH` metres per e-fold, where a lit surface (cel fog, about
 * 95 m per e-fold) is gone by 300 m. Past `BEACON_RANGE` it is culled. */
export const BEACON_REACH = 230;
export const BEACON_RANGE = 900;
/** Seconds per beacon pulse: a slow sweep, so it reads as a beacon, not a lamp. */
export const BEACON_PERIOD = 4;

/** Glow strength of the beacon seen from `distance` metres at `seconds`
 * (0..~1.6). Near it is held down so it never blinds a diver beside it. */
export function beaconGlow(distance: number, seconds: number): number {
  if (!(distance < BEACON_RANGE)) return 0;
  const phase = (seconds % BEACON_PERIOD) / BEACON_PERIOD;
  const pulse = 0.72 + 0.28 * Math.exp(-((phase - 0.5) ** 2) / 0.012);
  const near = Math.min(1, 0.35 + distance / 60);
  return pulse * near * Math.exp(-distance / BEACON_REACH) * 1.6;
}
/** Apparent flare size in metres: wider with distance (light scattered by
 * the water), so it keeps a few pixels at 600 m. */
export function beaconSize(distance: number): number {
  return 3 + distance * 0.035;
}

// --- The crown's surface lamp (HUB-2) ------------------------------------------

/** The mast's lamp, just above the waterline over the crown. */
export const MAST_LAMP: Vec3 = { ...CROWN_MAST.lamp };
/** Seconds per sweep: slower than the summit beacon, so the two read apart. */
export const MAST_LAMP_PERIOD = 7;
/** Glow e-fold through air and through water, metres. The cel haze in air
 * clears over about 555 m per e-fold; a lamp carries further. */
export const MAST_LAMP_AIR_REACH = 900;
/** Past this the lamp is culled (the whole basin is about 2 km). */
export const MAST_LAMP_RANGE = 2200;
/** Glow of the surface lamp seen from `distance` metres at `seconds`, by an
 * eye above or below the waterline (0..~1.5). Underwater it fades as the
 * summit beacon does; above, it carries across the basin to the island. */
export function mastLampGlow(distance: number, seconds: number, underwater: boolean): number {
  if (!(distance < MAST_LAMP_RANGE)) return 0;
  const phase = (seconds % MAST_LAMP_PERIOD) / MAST_LAMP_PERIOD;
  // A slow lighthouse sweep: a dim glow between bright passes.
  const pulse = 0.25 + 0.75 * Math.exp(-((phase - 0.5) ** 2) / 0.02);
  const near = Math.min(1, 0.35 + distance / 60);
  return pulse * near * Math.exp(-distance / (underwater ? BEACON_REACH : MAST_LAMP_AIR_REACH)) * 1.6;
}

// --- Crown rays ---------------------------------------------------------------

const crown = HUB_PINNACLES.find(p => p.id === "hub.crown")!;
export const CROWN_RAY_COUNT = 6;
/** Ring radius, metres from the crown's axis, and its depth band. */
export const CROWN_RAY_RING = { x: crown.x, z: crown.z, radius: 96, y: -78, sway: 9 } as const;
/** Seconds per full circuit: big and slow. */
export const CROWN_RAY_LAP = 170;
/** Wingspan of the largest ray, metres. */
export const CROWN_RAY_SPAN = 13;

export interface RayPose {
  readonly position: Vec3;
  /** Heading (render yaw: 0 faces -Z, as the creatures use). */
  readonly yaw: number;
  /** Bank into the turn, radians. */
  readonly roll: number;
  /** 0..1 wingbeat phase angle source. */
  readonly beat: number;
  readonly scale: number;
}

/** The ring's poses at `seconds`. Each ray keeps its own radius, depth and
 * size; the ring turns counter-clockwise seen from above. */
export function crownRayPoses(seconds: number): RayPose[] {
  const out: RayPose[] = [];
  const R = CROWN_RAY_RING, w = (Math.PI * 2) / CROWN_RAY_LAP;
  for (let i = 0; i < CROWN_RAY_COUNT; i++) {
    const a = w * seconds + (i / CROWN_RAY_COUNT) * Math.PI * 2 + 0.25 * Math.sin(i * 1.7);
    const r = R.radius + 10 * Math.sin(i * 2.3) + 6 * Math.sin(seconds * 0.05 + i);
    const y = R.y + R.sway * Math.sin(seconds * 0.04 + i * 1.3) - 6 * (i % 3);
    const x = R.x + r * Math.cos(a), z = R.z + r * Math.sin(a);
    // Tangent of a counter-clockwise circle: (-sin a, cos a); render yaw atan2(dx, -dz).
    const dx = -Math.sin(a), dz = Math.cos(a);
    out.push({ position: { x, y, z }, yaw: Math.atan2(dx, -dz), roll: -0.18, beat: seconds * 0.55 + i * 0.9,
      scale: 0.8 + 0.2 * ((i * 7) % 5) / 4 });
  }
  return out;
}
