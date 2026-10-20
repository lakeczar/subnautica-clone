/** Milestone outcomes: what each phase must have achieved in the real state before
 * it can pass. Command-level effects are checked in effects.ts; these check the
 * phase's purpose (a refit left a hull at the wrong rating, a mount never fitted). */
import type { Driver } from "./driver.js";
import { personalLimit } from "../../src/sim/capabilities.js";
import type { HullId } from "../../src/content/registry.js";

export type Outcome = (d: Driver) => string[];

export const crafted = (...ids: string[]): Outcome => (d) =>
  ids.filter((id) => !d.crafted(id)).map((id) => `${id} was never crafted`);
export const suit = (rating: number): Outcome => (d) =>
  personalLimit(d.state) >= rating ? [] : [`personal suit is ${personalLimit(d.state)} m, not ${rating} m`];
export const hull = (h: HullId, rating?: number): Outcome => (d) => {
  const v = d.vehicle(h);
  if (!v) return [`no ${h} owned`];
  if (v.disabled) return [`the ${h} is disabled`];
  return rating !== undefined && v.rating < rating ? [`the ${h} is rated ${v.rating} m, not ${rating} m`] : [];
};
export const facility = (...ids: string[]): Outcome => (d) =>
  ids.filter((id) => !d.facility(id)).map((id) => `facility ${id} is not restored`);
export const known = (...ids: string[]): Outcome => (d) =>
  ids.filter((id) => !d.knows(id)).map((id) => `${id} was never found`);
export const mounted = (h: HullId, kind: string): Outcome => (d) => {
  const v = d.vehicle(h);
  return v && d.state.inventory.items.some((i) => v.modules.includes(i.id) && i.kind === kind) ? [] : [`the ${h} has no ${kind} fitted`];
};
export const berthed = (h: HullId): Outcome => (d) => d.vehicle(h)?.berth ? [] : [`the ${h} is not berthed in the carrier`];
export const custom = (label: string, ok: (d: Driver) => boolean): Outcome => (d) => ok(d) ? [] : [label];
export const all = (...checks: Outcome[]): Outcome => (d) => checks.flatMap((c) => c(d));
