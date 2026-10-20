import { BERTH_ENVELOPES, HULL_COLLIDERS } from "../src/content/registry.js";
import { BERTH_LOCAL, carrierCommand, fixtureGame, launchPoint, localToWorld } from "../src/sim/carrier.js";
import { makeVehicle } from "../src/sim/state.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { Vec3 } from "../src/sim/types.js";

/** Launch/capture matrix through the real carrierCommand, for adoption at
 * composition. Every compact hull runs in both slots; medium hulls run in the
 * single medium room. Capture into slot 1 stages a Dart in slot 0 so the
 * starboard room is the only free one. Open, empty water: any refusal comes
 * from the carrier's own structure and envelopes.
 *
 * `patch` applies proposed geometry in memory for the duration of the call and
 * always restores it (registry envelopes and colliders, BERTH_LOCAL). */
export type TransferHull = "dart" | "hush" | "spindle" | "creel" | "mantle";
export interface TransferResult { hull: TransferHull; slot: 0 | 1; type: "launch" | "capture"; refusal: string | null }
export interface TransferPatch {
  envelopes?: Partial<Record<TransferHull, Partial<{ halfWidth: number; halfLength: number; height: number }>>>;
  colliders?: Partial<Record<TransferHull, Partial<{ radius: number; height: number }>>>;
  berthLocal?: Partial<Record<0 | 1, Vec3>>;
}
const COMPACT: readonly TransferHull[] = ["dart", "hush", "spindle"];
const MEDIUM: readonly TransferHull[] = ["creel", "mantle"];

export function transferMatrix(patch: TransferPatch = {}): TransferResult[] {
  const envelopes = BERTH_ENVELOPES as unknown as Record<TransferHull, Record<string, number>>;
  const colliders = HULL_COLLIDERS as unknown as Record<TransferHull, Record<string, number>>;
  const berths = BERTH_LOCAL as unknown as Vec3[];
  const saved = { envelopes: structuredClone(envelopes), colliders: structuredClone(colliders), berths: structuredClone(berths) };
  try {
    for (const [hull, e] of Object.entries(patch.envelopes ?? {})) Object.assign(envelopes[hull as TransferHull], e);
    for (const [hull, c] of Object.entries(patch.colliders ?? {})) Object.assign(colliders[hull as TransferHull], c);
    for (const [slot, p] of Object.entries(patch.berthLocal ?? {})) Object.assign(berths[Number(slot)]!, p);
    const results: TransferResult[] = [], water = createWorldQueries([], () => -200);
    for (const hull of [...COMPACT, ...MEDIUM]) for (const slot of (MEDIUM.includes(hull) ? [0] : [0, 1]) as (0 | 1)[])
      for (const type of ["launch", "capture"] as const) {
        const s = fixtureGame(), h = s.fleet.vehicles[0]!, v = s.fleet.vehicles[1]!;
        // Spindle transfers only at the surface; the others at depth.
        h.pose.position = { x: 0, y: hull === "spindle" ? -.9 : -24, z: 0 };
        s.fleet.vehicles = [h, v];
        v.hull = hull;
        s.fleet.docking!.configuration = MEDIUM.includes(hull) ? "medium" : "compact";
        const berth = (n: 0 | 1) => ({ carrierId: h.id, slot: n, pose: { frame: "carrier-local" as const, position: { ...BERTH_LOCAL[n]! }, yaw: 0 } });
        v.berth = berth(slot);
        v.pose.position = localToWorld(BERTH_LOCAL[slot]!, h);
        s.player.pose.position = localToWorld(s.player.interiorPose!.position, h);
        if (type === "capture") {
          v.berth = null;
          v.pose.position = launchPoint(h, v);
          if (slot === 1) {
            const other = makeVehicle("port_occupant", "dart", localToWorld(BERTH_LOCAL[0]!, h), "port_occupant_hold");
            other.berth = berth(0);
            s.fleet.vehicles.push(other);
          }
        }
        results.push({ hull, slot, type, refusal: carrierCommand(s, type, v.id, water) });
      }
    return results;
  } finally {
    for (const hull of Object.keys(saved.envelopes) as TransferHull[]) Object.assign(envelopes[hull], saved.envelopes[hull]);
    for (const hull of Object.keys(saved.colliders) as TransferHull[]) Object.assign(colliders[hull], saved.colliders[hull]);
    saved.berths.forEach((p, i) => Object.assign(berths[i]!, p));
  }
}

export const refused = (results: readonly TransferResult[]): string[] =>
  results.filter((r) => r.refusal).map((r) => `${r.hull} slot ${r.slot} ${r.type}: ${r.refusal}`);
