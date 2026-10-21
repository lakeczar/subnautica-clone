/** Power sources as rules. Every source has a catch, so none is a perpetual
 * generator that erases power decisions:
 *
 * | Source | Catch |
 * | --- | --- |
 * | restored stops | fixed places you travel to; instant full service only there |
 * | carrier charging dock | instant for berthed craft, but drains the carrier and keeps its reserve |
 * | reserve cells | finite charge; recharged only at a bench or dock |
 * | solar | surface only, daylight only, a quarter while moving; best on the Spindle |
 * | thermal exchanger | warm water near vents, which loads the hull unless protected |
 * | bio-cells | grown over minutes, consumed, one feed at a time, released slowly |
 * | current turbine (stub) | stopped and held in a current, noisy; sandbox prototype |
 *
 * Rates are percent of the craft's own battery per second (VehicleState.charge),
 * already divided by its capacity. Pure: nothing here reads GameState. */
import type { HullId } from "../../content/registry.js";
import type { CraftProfile } from "../upgrades/effects.js";

export type PowerSourceId = "service_stop" | "carrier_dock" | "reserve_cell" | "solar" | "thermal" | "bio_cell" | "turbine";
/** Panels feather under way (spray and heel), so moving yields a quarter. */
export const SOLAR = { surfaceDepth: 1.5, movingFactor: 0.25 } as const;
/** Exchanger output above the heat where vents start to warm the water. */
export const THERMAL = { minHeat: 0.2, rate: 0.6 } as const;
export const TURBINE = { minCurrent: 0.4, rate: 0.06, loudness: 0.2, prototype: true } as const;

export interface TrickleContext {
  readonly profile: CraftProfile;
  /** Hull depth, metres. */
  readonly depth: number;
  readonly moving: boolean;
  /** 0..1 heat at the hull from the hazard fields. */
  readonly heat: number;
  /** 0..1 daylight; 1 until a day cycle exists. */
  readonly daylight?: number;
  /** Current speed through the hull, m/s (turbine stub only). */
  readonly current?: number;
  /** Held in place by the mooring anchor or grapple (turbine stub only). */
  readonly held?: boolean;
  /** The turbine prototype is fitted (stub; not in the catalogue). */
  readonly turbine?: boolean;
}
export interface ChargeRate { readonly source: PowerSourceId; readonly rate: number }
/** Continuous sources this step. Composition adds their sum × dt to the charge,
 * capped at 100, and never while the hull is disabled. */
export function trickleRates(c: TrickleContext): ChargeRate[] {
  const out: ChargeRate[] = [], cap = c.profile.capacity;
  if (c.profile.solar > 0 && c.depth <= SOLAR.surfaceDepth)
    out.push({ source: "solar", rate: (c.profile.solar * (c.daylight ?? 1) * (c.moving ? SOLAR.movingFactor : 1)) / cap });
  if (c.profile.thermalCharge && c.heat > THERMAL.minHeat)
    out.push({ source: "thermal", rate: (THERMAL.rate * (c.heat - THERMAL.minHeat)) / cap });
  if (c.turbine && c.held && !c.moving && (c.current ?? 0) >= TURBINE.minCurrent)
    out.push({ source: "turbine", rate: (TURBINE.rate * (c.current ?? 0)) / cap });
  return out.filter((r) => r.rate > 0);
}
export const totalRate = (rates: readonly ChargeRate[]): number => rates.reduce((n, r) => n + r.rate, 0);

// ---------------------------------------------------------------- reserve cells
/** One full reserve cell restores 35% of a stock battery (vehicles.ts `reserve`);
 * a bigger bank gains proportionally less of its own percentage. */
export const CELL_STOCK_PERCENT = 35;
export function cellTransfer(cellCharge: number, craftCharge: number, capacity: number): { craftCharge: number; cellCharge: number } {
  const available = (CELL_STOCK_PERCENT * Math.max(0, cellCharge)) / 100 / capacity;
  const amount = Math.max(0, Math.min(available, 100 - craftCharge));
  return { craftCharge: craftCharge + amount, cellCharge: available > 0 ? Math.max(0, cellCharge - (cellCharge * amount) / available) : cellCharge };
}

// ---------------------------------------------------------------- bio-cells
/** `bio_cell`: SYS-2's grown living cell, an item with `charge` 0..100 (fresh
 * cells start at 100, as reserve cells do). Inserted into a craft, it is consumed
 * and feeds `units × charge / 100` stock-battery percent over up to `seconds`.
 * One feed per craft at a time. No charger ever recharges it. Cell-powered SYS-2
 * hosts draw it down like a reserve cell (`power/hosts.ts`). */
export const BIO_CELL = { item: "bio_cell", units: 50, seconds: 100 } as const;
export interface BioFeed { readonly remaining: number }
/** `cellCharge` is the carried bio-cell's item charge, or null when none is carried. */
export function insertBioCellRefusal(feed: BioFeed | null, cellCharge: number | null, disabled: boolean): string | null {
  if (cellCharge === null) return "Bring a grown bio-cell.";
  if (cellCharge <= 0) return "That bio-cell is spent.";
  if (disabled) return "A disabled hull cannot take a bio-cell feed.";
  return feed && feed.remaining > 0 ? "A bio-cell is already feeding this craft." : null;
}
export const startBioFeed = (cellCharge = 100): BioFeed => ({ remaining: (BIO_CELL.units * Math.max(0, Math.min(100, cellCharge))) / 100 });
/** Only reserve cells take a charge at a bench, dock or SYS-2 charger. */
export const rechargeable = (kind: string): boolean => kind === "reserve_cell";
/** One step of the feed: the craft's gain in its own percent, and what is left. */
export function bioFeedStep(feed: BioFeed, capacity: number, craftCharge: number, dt: number): { feed: BioFeed | null; gain: number } {
  const units = Math.min(feed.remaining, (BIO_CELL.units / BIO_CELL.seconds) * dt);
  const gain = Math.min(units / capacity, Math.max(0, 100 - craftCharge));
  const remaining = feed.remaining - units;
  // A full battery wastes the feed's output: the cell keeps living out its feed regardless.
  return { feed: remaining > 1e-9 ? { remaining } : null, gain };
}

// ---------------------------------------------------------------- carrier charging dock
/** SYS-2's charger module (`mod_charger`) in a Hearthline system socket. It tops
 * up berthed craft at once, paying from the carrier's battery, and never takes
 * the carrier below its reserve. */
export const CHARGING_DOCK = { carrierReserve: 20, cost: { compact: 0.08, medium: 0.12 } } as const;
export const BERTH_SIZE: Readonly<Record<Exclude<HullId, "hearthline">, "compact" | "medium">> = {
  dart: "compact", hush: "compact", spindle: "compact", creel: "medium", mantle: "medium",
};
export interface DockCharge { readonly charges: readonly number[]; readonly carrierCharge: number; readonly refusal: string | null }
/** Charge berthed craft in berth order. Each craft percent costs the carrier
 * `cost[size] × craft capacity` of its own battery. */
export function dockCharge(dockFitted: boolean, carrierCharge: number,
  berthed: readonly { hull: Exclude<HullId, "hearthline">; charge: number; capacity: number }[]): DockCharge {
  if (!dockFitted) return { charges: berthed.map((b) => b.charge), carrierCharge, refusal: "Socket a charger module in a carrier system socket." };
  if (!berthed.length) return { charges: [], carrierCharge, refusal: "No craft is berthed." };
  const budget = Math.max(0, carrierCharge - CHARGING_DOCK.carrierReserve);
  let spent = 0;
  const charges = berthed.map((b) => {
    const per = CHARGING_DOCK.cost[BERTH_SIZE[b.hull]] * b.capacity;
    const gain = Math.max(0, Math.min(100 - b.charge, (budget - spent) / per));
    spent += gain * per;
    return b.charge + gain;
  });
  const refusal = spent > 0 ? null : budget <= 0
    ? `The carrier keeps its last ${CHARGING_DOCK.carrierReserve}% for itself. Charge the carrier first.`
    : "Berthed craft are already full.";
  return { charges, carrierCharge: carrierCharge - spent, refusal };
}

// ---------------------------------------------------------------- restored stops
/** Today's `service` command: a restored stop with a charge service fills the
 * craft at once. The catch is the journey; outposts (SYS-2) follow the same rule. */
export const stopCharge = (restored: boolean, chargeService: boolean): number | null => restored && chargeService ? 100 : null;
