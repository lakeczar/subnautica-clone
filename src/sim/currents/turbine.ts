/** Current turbine: a sandbox stub, not in the catalogue. SYS-1's rule
 * (sim/power/charging.ts TURBINE): 0.06 × flow speed, battery percent per
 * second of a stock battery, only while the hull is stopped and held by the
 * grapple or the mooring anchor in at least 0.4 m/s. Its catches: it is
 * loud (0.2, about a cruising Hush), it needs a hold, and holding in a strong
 * current costs winch power. Two limits are added here so it can never be a
 * perpetual generator: the useful flow saturates at 1.5 m/s and it stops
 * charging at 80%. See docs/build/streams/CY.md for the keep-or-cut call. */
import { respondToFlow } from "./motion.js";
import type { CurrentActor, HoldMode } from "./types.js";
import type { Vec3 } from "../types.js";

export const TURBINE = { minFlow: 0.4, rate: 0.06, loudness: 0.2, saturates: 1.5, stopsAt: 80 } as const;

export interface TurbineContext {
  readonly fitted: boolean;
  readonly hold: HoldMode;
  /** Drive speed, m/s. */
  readonly speed: number;
  /** Flow at the hull, m/s (water moving past it, before authority). */
  readonly flow: Vec3;
  readonly charge: number;
  /** Battery size as a multiple of stock (SYS-1 `capacity`). */
  readonly capacity: number;
}
/** Gross charge, percent per second; 0 whenever a catch applies. */
export function turbineRate(c: TurbineContext): number {
  const flow = Math.hypot(c.flow.x, c.flow.y, c.flow.z);
  if (!c.fitted || (c.hold !== "grapple" && c.hold !== "anchor") || c.speed > 0.05 || flow < TURBINE.minFlow || c.charge >= TURBINE.stopsAt) return 0;
  return (TURBINE.rate * Math.min(flow, TURBINE.saturates)) / c.capacity;
}
/** Net percent per second while held: turbine minus the hold's own drain. */
export function turbineNet(actor: CurrentActor, c: TurbineContext): number {
  return turbineRate(c) - respondToFlow(c.flow, actor, { x: 0, y: 0, z: 0 }, c.hold).extraDrain;
}
