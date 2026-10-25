/** The diver's air line: unlimited air near a parked, powered craft. Every craft
 * feeds the basic line; the Mantle's hull air line is the long-reach signature
 * that also bridges a short power loss from the hull's emergency air.
 *
 * The hose follows the diver, so range is straight-line distance from the
 * craft's keel datum, not line of sight. Pure: survival composes the result. */
import type { Vec3 } from "../types.js";
import type { CraftProfile } from "../upgrades/effects.js";

export const AIR_LINE = {
  basic: { range: 27, drain: 0.01 },
  hull: { range: 60, drain: 0.02 },
  /** A craft below this speed is parked or holding station. */
  parkedBelow: 0.6,
} as const;
export interface AirLineCraft {
  readonly id: string;
  readonly profile: CraftProfile;
  readonly position: Vec3;
  readonly speed: number;
  readonly charge: number;
  readonly disabled: boolean;
  readonly emergencyAir: number;
  /** Berthed craft sit in a dry, sealed berth: no line. */
  readonly berthed: boolean;
}
export interface AirLineSupply {
  readonly craftId: string;
  readonly kind: "basic" | "hull";
  /** Stock-battery percent per second the feed costs the craft, after capacity. */
  readonly drain: number;
  /** The Mantle line is running on the hull's emergency air: seconds left. */
  readonly emergencySeconds: number | null;
}
/** Why a nearby craft gives no air, nearest first; null when one does. For the HUD. */
export function airLineBlock(diver: Vec3, craft: AirLineCraft): string | null {
  const line = craft.profile.airLine, range = AIR_LINE[line].range;
  if (craft.berthed) return "Berthed craft cannot feed an air line.";
  if (craft.disabled) return "A disabled hull feeds no air line.";
  if (craft.speed >= AIR_LINE.parkedBelow) return "The craft must be parked or holding station to feed the line.";
  if (craft.charge <= 0 && !(line === "hull" && craft.emergencyAir > 0)) return "The craft has no power for the air line.";
  const d = Math.hypot(diver.x - craft.position.x, diver.y - craft.position.y, diver.z - craft.position.z);
  return d > range ? `Out of air-line reach: ${Math.round(d)} m of ${range} m.` : null;
}
/** The best supply among the diver's craft: a powered line first, then the
 * Mantle's emergency bridge; ties by craft id for determinism. */
export function airLineSupply(diver: Vec3, crafts: readonly AirLineCraft[]): AirLineSupply | null {
  const ok = crafts.filter((c) => airLineBlock(diver, c) === null)
    .sort((a, b) => Number(a.charge <= 0) - Number(b.charge <= 0) || a.id.localeCompare(b.id));
  const c = ok[0];
  if (!c) return null;
  const kind = c.profile.airLine, powered = c.charge > 0;
  return { craftId: c.id, kind, drain: powered ? AIR_LINE[kind].drain / c.profile.capacity : 0,
    emergencySeconds: powered ? null : c.emergencyAir };
}
