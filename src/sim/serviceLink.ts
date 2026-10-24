/** C4: the composed craft service, one read-only preview shared by the command,
 * the Cargo and Base panels and the HUD. A supported site (pod waters, the
 * workshop cradle, a restored stop, a charging mooring) services in full; beside
 * a field outpost that is not one, the outpost's charger charges the battery and
 * pays from its own power. Locality and the disabled-hull rule apply to both. */
import { serviceRefusal, serviceState, service } from "./vehicles.js";
import { outpostCharge, outpostChargePlan } from "./systemsLink.js";
import type { OutpostChargePlan } from "./systemsLink.js";
import type { GameState } from "./types.js";

export type ServicePreview =
  | { readonly kind: "service"; readonly refusal: string | null }
  | { readonly kind: "outpost"; readonly refusal: string | null; readonly plan: OutpostChargePlan };
export function servicePreview(s: GameState, vehicleId: string): ServicePreview {
  const state = serviceState(s, vehicleId);
  // Away (or berthed) and supported-site answers keep the original precedence.
  if (state === "unsupported") {
    const plan = outpostChargePlan(s, vehicleId);
    if (plan) return { kind: "outpost", refusal: plan.refusal, plan };
  }
  return { kind: "service", refusal: serviceRefusal(s, vehicleId) };
}
export function serviceCommand(s: GameState, vehicleId: string): string | null {
  const p = servicePreview(s, vehicleId);
  if (p.refusal) return p.refusal;
  return p.kind === "outpost" ? outpostCharge(s, vehicleId) : service(s, vehicleId);
}
/** The button label for a preview the player can press. */
export const serviceLabel = (p: ServicePreview): string =>
  p.kind === "outpost" ? `Charge at ${p.plan.host.label} · ${Math.round(p.plan.from)}% → ${Math.round(p.plan.to)}%` : "Service";
