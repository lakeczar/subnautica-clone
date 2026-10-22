import type { HullId } from "../../content/registry.js";
import { HULL_COLLIDERS } from "../../content/registry.js";
import { exposure } from "../survival.js";
import { vehicleProfile } from "../fittings.js";
import type { GameState } from "../types.js";
import type { Stimulus } from "./types.js";

/** Lamp output per actor while lit. Hush runs its observation lamp low. */
export const LAMP_OUTPUT: Readonly<Record<HullId | "diver", number>> = {
  diver: 0.6, dart: 0.9, creel: 1, hush: 0.5, spindle: 0.4, mantle: 1, hearthline: 1,
};
/** Sorting or harvesting disturbs a feeding structure; a scan pulse briefly more. */
export const DISTURBANCE = { action: 0.7, scan: 0.9 } as const;

/** What the player emits this step, from the composed game state. `loudness`
 * is step.ts's value; `lamp` is the proposed persisted lamp switch. */
export function stimulusFrom(s: GameState, loudness: number, options: { lamp: boolean; scanned?: boolean }): Stimulus {
  const v = s.fleet.vehicles.find(v => v.id === s.player.controlledVehicleId) ?? null;
  const hull = v?.hull ?? null, lit = options.lamp && (!v || (v.charge > 0 && !v.disabled));
  return {
    position: { ...(v?.pose.position ?? s.player.pose.position) },
    velocity: { ...(v?.velocity ?? s.player.velocity) },
    noise: Math.max(0, Math.min(1, loudness)),
    // C4: a hull's lamp is its profile's (floodlights raise it).
    light: lit ? (v ? vehicleProfile(s, v).lamp : LAMP_OUTPUT.diver) : 0,
    disturbance: options.scanned ? DISTURBANCE.scan : s.world.action ? DISTURBANCE.action : 0,
    hull,
    radius: hull ? HULL_COLLIDERS[hull].radius : 0.4,
    inRefuge: exposure(s).refuge || s.player.mode === "interior",
  };
}
