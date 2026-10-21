/** C3: S2's rescue plans in the `RECOVERY_ROUTES` shape (S2 wiring step 5).
 *
 * Each S2 tether branch is one route. The operator stands at the plan's
 * breathable surface stage; Bobbin descends the branch to the hull's collar
 * and the hull is towed back up the same corridor to just below the stage,
 * where any diver can patch it. S2 proves each branch clear of the floor,
 * every solid and every protective hazard for a towed medium hull
 * (`regions-world.test.ts`). A loss more than `DEEP_ATTACH_REACH` from every
 * branch end is outside the surveyed corridors: patch or salvage it locally.
 * Saved as `recovery.operation.routeId` (additive IDs, no schema change). */
import { RESCUE_PLANS } from "./regions/rescue.js";
import { ATTACH_REACH } from "./regions/access.js";
import { LEGACY_PRESERVE } from "./regions/terrain.js";
import { RECOVERY_ROUTES as B1_ROUTES } from "./routes.js";

interface Point { readonly x: number; readonly y: number; readonly z: number }
export interface DeepRecoveryRoute {
  /** The S2 plan this branch belongs to, e.g. `rescue.rift`. */
  readonly plan: string;
  /** Surface operating position. */
  readonly stage: Point;
  /** Bobbin's path from the stage down the branch; the hull collar follows. */
  readonly approach: readonly Point[];
  /** Tow keel line: index 0 sits under the stage, the last index is the branch end. */
  readonly tow: readonly Point[];
  /** Index of the hull collar in `approach` + collar, as in B1's routes. */
  readonly attachmentIndex: number;
  readonly maximumTether: number;
}
/** The tow ends this far below the surface stage: floating clear of swimmers. */
export const DEEP_TOW_SURFACE_Y = -4;
export const DEEP_ATTACH_REACH = ATTACH_REACH;
/** The standard Bobbin reel; S2's deep plans need the 950 m deep tether reel. */
export const STANDARD_TETHER = 650;

export const DEEP_RECOVERY_ROUTES: Readonly<Record<string, DeepRecoveryRoute>> = Object.fromEntries(
  RESCUE_PLANS.flatMap((plan) => plan.tethers.map((branch, i): [string, DeepRecoveryRoute] => {
    const down = branch.slice(1).map((p) => ({ x: p.x, y: p.y, z: p.z }));
    return [`${plan.id.slice("rescue.".length)}.${i}`, {
      plan: plan.id, stage: { ...plan.stage }, maximumTether: plan.maximumTether,
      approach: [{ ...plan.stage }, ...down],
      tow: [{ ...plan.stage, y: DEEP_TOW_SURFACE_Y }, ...down],
      attachmentIndex: down.length + 1,
    }];
  })),
);
export type LegacyRecoveryRouteId = keyof typeof B1_ROUTES;
export type RecoveryRouteId = LegacyRecoveryRouteId | (string & {});
export const recoveryRouteIds = (): string[] => [...Object.keys(B1_ROUTES), ...Object.keys(DEEP_RECOVERY_ROUTES)];
export const isLegacyRoute = (id: string): id is LegacyRecoveryRouteId => Object.hasOwn(B1_ROUTES, id);
export const deepRoute = (id: string): DeepRecoveryRoute | null =>
  Object.hasOwn(DEEP_RECOVERY_ROUTES, id) ? DEEP_RECOVERY_ROUTES[id]! : null;
/** A position inside B1's area keeps B1's two routes. */
export const insideB1Recovery = (p: Readonly<Point>): boolean =>
  p.x >= LEGACY_PRESERVE.minX && p.x <= LEGACY_PRESERVE.maxX && p.z >= LEGACY_PRESERVE.minZ && p.z <= LEGACY_PRESERVE.maxZ;
/** The deep branch whose end is nearest the loss, within reach; null if none. */
export function deepRouteFor(p: Readonly<Point>): string | null {
  let best: string | null = null, bestD = DEEP_ATTACH_REACH;
  for (const [id, r] of Object.entries(DEEP_RECOVERY_ROUTES)) {
    const end = r.tow[r.tow.length - 1]!, d = Math.hypot(end.x - p.x, end.y - p.y, end.z - p.z);
    if (d <= bestD) { bestD = d; best = id; }
  }
  return best;
}
export const routeLabel = (id: string): string =>
  id === "basin" ? "Pale Basin overhead lift" : id === "canopy" ? "Upper-Canopy corridor"
    : `${deepRoute(id)?.plan.slice("rescue.".length).replace("_", " ") ?? id} tether`;
