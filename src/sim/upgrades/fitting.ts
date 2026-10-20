/** Install and remove rules for upgrades: one read-only preview per change that
 * shows the benefit, what you give up and the exact refusal. Nothing moves
 * unless the preview has no refusal. Removal always returns the module intact.
 *
 * Pure: composition builds a FitTarget from the vehicle, its dock and the hazard
 * sample at the hull, and applies `fittedAfter` plus the hold move itself. */
import { HULLS } from "../../content/registry.js";
import type { CostKind, HullId } from "../../content/registry.js";
import { DOCK_LABELS, DOCK_SLOTS, HULL_SLOTS, UPGRADES, upgradeId } from "../../content/upgrades/catalogue.js";
import type { DockKind, SlotKind, UpgradeDefinition, UpgradeEffect, UpgradeId } from "../../content/upgrades/catalogue.js";
import { craftProfile, heatExposure, motion } from "./effects.js";
import type { CraftProfile, HeatContribution } from "./effects.js";

export interface Hazards { readonly heat: readonly HeatContribution[]; readonly brine: number }
/** One fitted module instance: the intact item and its upgrade kind. */
export interface Fitted { readonly itemId: string; readonly kind: UpgradeId }
export type BerthConfiguration = "compact" | "medium" | "mixed";
export interface FitTarget {
  readonly hull: HullId;
  /** Paid rating (VehicleState.rating). */
  readonly rating: number;
  readonly fitted: readonly Fitted[];
  /** The supported dock the hull is at, from the composed world; null away from one. */
  readonly dock: DockKind | null;
  /** Hull depth, metres. */
  readonly depth: number;
  /** In a dry carrier berth the hull feels no pressure or water. It launches at
   * `carrierDepth` into `exterior`: the hazard sample at the carrier's launch lock.
   * Required: an unknown exterior must never read as safe water. Changes stay
   * allowed there, with a warning per hazard the new fit could not launch into. */
  readonly berth: { readonly carrierDepth: number; readonly exterior: Hazards } | null;
  /** Hazard sample at the hull (unused while berthed: see `berth.exterior`). */
  readonly hazards: Hazards;
  /** CU used in this hull's hold now, and its base hold (HULL_HOLD_CU). */
  readonly hold: { readonly usedCu: number; readonly baseCu: number };
  /** The carrier's own berth and system state, for Hearthline structure changes. */
  readonly carrier?: { readonly configuration: BerthConfiguration; readonly berthsEmpty: boolean; readonly systemOccupied: number };
  /** Tools in use in the world: their module cannot come off until they are recovered. */
  readonly inUse?: { readonly pod?: boolean; readonly grapple?: boolean; readonly anchored?: boolean };
}
export interface FitPreview {
  readonly action: "install" | "remove";
  readonly kind: UpgradeId | null;
  readonly refusal: string | null;
  /** Allowed, but the player must know (e.g. launch depth from a dry berth). */
  readonly warnings: readonly string[];
  readonly slot: SlotKind | null;
  /** Slot use after the change. */
  readonly slotUse: { readonly used: number; readonly capacity: number } | null;
  /** The module that comes off, returned intact to the hold. */
  readonly displaced: Fitted | null;
  readonly before: CraftProfile;
  readonly after: CraftProfile;
  readonly gains: readonly string[];
  readonly losses: readonly string[];
  readonly fittedAfter: readonly Fitted[];
  /** Hold capacity and use after the change. */
  readonly hold: { readonly capacityCu: number; readonly usedCu: number };
}

const SLOT_WORDS: Readonly<Record<SlotKind, [string, string]>> = {
  socket: ["socket", "sockets"], hull: ["hull bay", "hull bays"], major: ["major mount", "major mounts"],
  tool: ["tool hardpoint", "tool hardpoints"], system: ["system socket", "system sockets"],
  structure: ["structural retrofit", "structural retrofits"], refit: ["refit", "refits"],
};
const label = (hull: HullId): string => HULLS[hull].label;
const def = (kind: UpgradeId): UpgradeDefinition => UPGRADES[kind];
const kinds = (fitted: readonly Fitted[]): UpgradeId[] => fitted.map((f) => f.kind);
export const slotOf = (hull: HullId, kind: UpgradeId): SlotKind | null => def(kind).fits[hull] ?? null;
export const profileOf = (t: Pick<FitTarget, "hull" | "rating" | "fitted">): CraftProfile => craftProfile(t.hull, t.rating, kinds(t.fitted));
const holdCapacity = (t: FitTarget, p: CraftProfile): number => t.hold.baseCu + p.holdDeltaCu;
/** Hold items: socket modules stay in cargo; every other slot sits outside it. */
const inCargo = (hull: HullId, kind: UpgradeId): boolean => slotOf(hull, kind) === "socket";

export function slotCapacity(hull: HullId, slot: SlotKind, p: CraftProfile): number {
  if (slot === "refit") return 0;
  return slot === "system" ? p.systemSockets : HULL_SLOTS[hull][slot];
}
/** Which docks may change a slot on this hull. The carrier changes its own
 * fittings only at the yard or a supported mooring; small craft never there. */
export function dockRefusal(t: Pick<FitTarget, "hull" | "dock">, slot: SlotKind): string | null {
  if (!t.dock) return `Change ${label(t.hull)} fittings at a supported dock: the pod, the workshop, a restored stop, a carrier berth or an outpost.`;
  const carrierDock = t.dock === "carrier_mooring" || t.dock === "yard";
  if (t.hull === "hearthline" ? !carrierDock : t.dock === "carrier_mooring")
    return t.hull === "hearthline" ? "Change Hearthline fittings at the yard berth or while station keeping at a supported mooring."
      : `Berth the ${label(t.hull)} in the carrier to change its fittings there.`;
  if (!DOCK_SLOTS[t.dock].includes(slot)) {
    const can = DOCK_SLOTS[t.dock].map((s) => SLOT_WORDS[s][1]).join(", ");
    return `${capital(DOCK_LABELS[t.dock])} can change ${can} only. Change ${SLOT_WORDS[slot][1]} at the workshop, the yard or a restored stop.`;
  }
  return null;
}
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- safety
type Axis = "pressure" | "heat" | "brine";
interface Margin { axis: Axis; before: number; after: number }
/** Heat margin on survival's own scale: spare tolerance while tolerated, else the
 * negative load rate, `(effective − tolerance) × heatLoad`, so a bigger excess or
 * a faster load is always worse and zero is the safe/unsafe boundary. */
export function heatMargin(p: CraftProfile, heat: readonly HeatContribution[]): number {
  const e = heatExposure(p, heat);
  return e.tolerated ? p.heat - e.effective : -(e.effective - p.heat) * e.loadRate;
}
/** Margins in one place (positive is safe). */
function marginsAt(hull: HullId, depth: number, hazards: Hazards, before: CraftProfile, after: CraftProfile): Margin[] {
  const out: Margin[] = [];
  if (hull !== "spindle") out.push({ axis: "pressure", before: before.rating - depth, after: after.rating - depth });
  out.push({ axis: "heat", before: heatMargin(before, hazards.heat), after: heatMargin(after, hazards.heat) });
  out.push({ axis: "brine", before: before.brine - hazards.brine, after: after.brine - hazards.brine });
  return out;
}
/** A change is unsafe on an axis when it leaves the hull exposed there and worse off than before. */
const worsened = (ms: readonly Margin[]): Margin[] => ms.filter((m) => m.after < 0 && m.after < m.before);
/** Refuse any change that makes the hull unsafe where it is now, or less safe
 * where it is already exposed. Never strands: the message says how to recover.
 * A dry berth has no pressure or water; see `launchWarnings`. */
function safetyRefusal(t: FitTarget, before: CraftProfile, after: CraftProfile, what: string): string | null {
  if (t.berth) return null;
  const m = worsened(marginsAt(t.hull, t.depth, t.hazards, before, after))[0];
  if (!m) return null;
  const hull = label(t.hull);
  if (m.axis === "pressure")
    return `${what} leaves the ${hull} rated ${after.rating} m, but it is at ${Math.round(t.depth)} m. Climb above ${after.rating} m first. Nothing changed.`;
  if (m.axis === "heat")
    return `${what} leaves the ${hull} ${m.before >= 0 ? "unprotected in this heat" : "loading heat faster here"}. Move to cooler water first. Nothing changed.`;
  return `${what} leaves the ${hull} unprotected in this brine. Climb above the dense layer first. Nothing changed.`;
}
/** From a dry berth: allowed, but one warning per hazard the new fit could not
 * launch into at the carrier's depth and lock exterior. */
function launchWarnings(t: FitTarget, before: CraftProfile, after: CraftProfile): string[] {
  if (!t.berth) return [];
  const { carrierDepth, exterior } = t.berth, hull = label(t.hull);
  return worsened(marginsAt(t.hull, carrierDepth, exterior, before, after)).map((m) =>
    m.axis === "pressure"
      ? `Safe in the dry berth, but the carrier is at ${Math.round(carrierDepth)} m: the ${hull} (rated ${after.rating} m) cannot launch until the carrier rises above ${after.rating} m or the fitting is restored.`
      : m.axis === "heat"
        ? `Safe in the dry berth, but the water outside the lock is too hot for the ${hull} without it: launching would load the hull. Move the carrier to cooler water or restore the fitting first.`
        : `Safe in the dry berth, but the carrier sits in brine the ${hull} cannot take without it. Move the carrier above the dense layer or restore the fitting before launching.`);
}

/** A module whose tool is out in the world stays fitted until it is recovered. */
function inUseRefusal(t: FitTarget, kind: UpgradeId): string | null {
  const tool = (def(kind).effect as UpgradeEffect).tool;
  if (tool === "drop_pod" && t.inUse?.pod) return "The cargo pod is still out. Collect it before changing its socket. Nothing changed.";
  if (tool === "grapple" && t.inUse?.grapple) return "The grapple line is attached. Release it before changing the tool. Nothing changed.";
  if (tool === "mooring_anchor" && t.inUse?.anchored) return "The anchor is down. Raise it before changing the bay. Nothing changed.";
  return null;
}

// ---------------------------------------------------------------- benefit and cost
const fmt = (n: number, d = 1): string => Number(n.toFixed(d)).toString();
/** Every observable profile change, sorted into what you gain and what you give
 * up. Hold size needs the hull's base hold; pass it to include the hold. */
export function profileChanges(a: CraftProfile, b: CraftProfile, baseHoldCu?: number): { gains: string[]; losses: string[] } {
  const gains: string[] = [], losses: string[] = [];
  const num = (name: string, x: number, y: number, unit: string, higherIsBetter: boolean, d = 1): void => {
    if (Math.abs(x - y) < 1e-9) return;
    (y > x === higherIsBetter ? gains : losses).push(`${name} ${fmt(x, d)} → ${fmt(y, d)}${unit}`);
  };
  const flag = (name: string, x: boolean, y: boolean): void => {
    if (x !== y) (y ? gains : losses).push(`${y ? "Adds" : "Loses"} ${name}`);
  };
  if (a.hull !== "spindle") num("Rating", a.rating, b.rating, " m", true, 0);
  if (baseHoldCu !== undefined) num("Hold", baseHoldCu + a.holdDeltaCu, baseHoldCu + b.holdDeltaCu, " CU", true, 0);
  num("Quiet speed", a.speed.quiet, b.speed.quiet, " m/s", true);
  num("Cruise speed", a.speed.cruise, b.speed.cruise, " m/s", true);
  num("Boost speed", a.speed.boost, b.speed.boost, " m/s", true);
  num("Cruise loudness", a.loudness.cruise, b.loudness.cruise, "", false, 2);
  num("Lamp output", a.lamp, b.lamp, "", true, 2);
  num("Lamp drain", a.lampDrain, b.lampDrain, " %/s", false, 3);
  num("Cruise drain", motion(a, "cruise").drain, motion(b, "cruise").drain, " %/s", false, 3);
  num("Battery capacity", a.capacity, b.capacity, "×", true, 2);
  num("Hull damage taken", a.damage, b.damage, "×", false, 2);
  num("Heat tolerance", a.heat, b.heat, "", true, 2);
  num("Heat load rate", a.heatLoad, b.heatLoad, "×", false, 2);
  num("Brine tolerance", a.brine, b.brine, "", true, 2);
  num("Current authority", a.current, b.current, "", true, 2);
  num("Solar charge", a.solar, b.solar, " %/s", true, 3);
  num("System sockets", a.systemSockets, b.systemSockets, "", true, 0);
  flag("ambient heat immunity", a.ambientHeatImmune, b.ambientHeatImmune);
  flag("vent charging", a.thermalCharge, b.thermalCharge);
  flag("the long-reach hull air line", a.airLine === "hull", b.airLine === "hull");
  flag("mixed berths", a.mixedBerths, b.mixedBerths);
  for (const t of b.tools) if (!a.tools.includes(t)) gains.push(`Adds ${t.replaceAll("_", " ")}`);
  for (const t of a.tools) if (!b.tools.includes(t)) losses.push(`Loses ${t.replaceAll("_", " ")}`);
  for (const c of b.contracts) if (!a.contracts.includes(c)) gains.push(`Adds ${c.replaceAll("_", " ")}`);
  for (const c of a.contracts) if (!b.contracts.includes(c)) losses.push(`Loses ${c.replaceAll("_", " ")}`);
  return { gains, losses };
}

function preview(t: FitTarget, action: FitPreview["action"], kind: UpgradeId | null, fields: Partial<FitPreview>): FitPreview {
  const before = profileOf(t), after = fields.after ?? before;
  return {
    action, kind, refusal: null, warnings: [], slot: null, slotUse: null, displaced: null, before, after,
    gains: [], losses: [], fittedAfter: t.fitted, hold: { capacityCu: holdCapacity(t, before), usedCu: t.hold.usedCu },
    ...fields,
  };
}
const refuse = (t: FitTarget, action: FitPreview["action"], kind: UpgradeId | null, refusal: string,
  extra: Partial<FitPreview> = {}): FitPreview => preview(t, action, kind, { ...extra, refusal });

/** Read-only install preview. `replace` names a fitted module in the same slot to
 * swap out when the slot is full; `fromHold` says the module already sits in this hold. */
export function installPreview(t: FitTarget, item: Fitted, options: { replace?: string; fromHold?: boolean } = {}): FitPreview {
  const act = "install";
  if (!upgradeId(item.kind)) return refuse(t, act, null, "That item is not an upgrade module.");
  const d = def(item.kind), hull = label(t.hull), slot = slotOf(t.hull, item.kind);
  if (d.refit) return refuse(t, act, item.kind, `${d.label} is a paid hull refit at the workshop or yard bench, not a fitted module.`);
  if (!slot) {
    const owner = Object.keys(d.fits)[0] as HullId | undefined;
    return refuse(t, act, item.kind, d.layer === "signature" && owner
      ? `${d.label} is a ${label(owner)} signature upgrade; it fits only the ${label(owner)}.`
      : t.hull === "spindle" ? `${d.label} does not fit the Spindle: it is a surface-only hull.`
      : `${d.label} does not fit the ${hull}.`);
  }
  if (t.fitted.some((f) => f.itemId === item.itemId)) return refuse(t, act, item.kind, "This module is already fitted. Remove it first.");
  const before = profileOf(t);
  const sameLine = t.fitted.find((f) => def(f.kind).line === d.line);
  if (sameLine?.kind === item.kind) return refuse(t, act, item.kind, `The ${hull} already has ${d.label}.`);
  if (sameLine && def(sameLine.kind).tier >= d.tier)
    return refuse(t, act, item.kind, `The ${hull} already has ${def(sameLine.kind).label}, a higher tier. Remove it first to fit this one.`);
  const dock = dockRefusal(t, slot);
  if (dock) return refuse(t, act, item.kind, dock);
  // A lower tier of the same line is replaced in place. A full single slot swaps its
  // occupant; a full multi-slot needs the player to choose which module comes off.
  const capacity = slotCapacity(t.hull, slot, before);
  const used = t.fitted.filter((f) => slotOf(t.hull, f.kind) === slot);
  let displaced: Fitted | null = sameLine ?? null;
  if (!displaced && used.length >= capacity) {
    const swap = capacity === 1 ? used[0] : options.replace ? used.find((f) => f.itemId === options.replace) : undefined;
    if (!swap) {
      const words = SLOT_WORDS[slot];
      return refuse(t, act, item.kind, capacity === 0 ? `The ${hull} has no ${words[0]}.`
        : `No free ${words[0]}: the ${hull}'s ${capacity} ${words[1]} hold ${used.map((f) => def(f.kind).label).join(" and ")}. Choose one to swap out, or remove one first.`);
    }
    displaced = swap;
  }
  const busy = displaced ? inUseRefusal(t, displaced.kind) : null;
  if (busy) return refuse(t, act, item.kind, busy);
  const fittedAfter = [...t.fitted.filter((f) => f.itemId !== displaced?.itemId), item];
  const after = craftProfile(t.hull, t.rating, kinds(fittedAfter));
  const what = displaced ? `Swapping ${def(displaced.kind).label} for ${d.label}` : `Fitting ${d.label}`;
  const safety = safetyRefusal(t, before, after, what);
  const capacityCu = holdCapacity(t, after);
  const usedCu = t.hold.usedCu + (inCargo(t.hull, item.kind) && !options.fromHold ? d.cu : 0)
    - (!inCargo(t.hull, item.kind) && options.fromHold ? d.cu : 0)
    + (displaced && !inCargo(t.hull, displaced.kind) ? def(displaced.kind).cu : 0);
  const usedAfter = used.length - (displaced && slotOf(t.hull, displaced.kind) === slot ? 1 : 0) + 1;
  const base = { slot, displaced, after, fittedAfter, slotUse: { used: usedAfter, capacity }, hold: { capacityCu, usedCu } };
  if (safety) return refuse(t, act, item.kind, safety, base);
  if (usedCu > capacityCu)
    return refuse(t, act, item.kind, `The ${hull} hold would need ${usedCu} CU but holds ${capacityCu} CU after the change. Store ${usedCu - capacityCu} CU first. Nothing changed.`, base);
  const diff = profileChanges(before, after, t.hold.baseCu);
  const losses = [d.tradeoff, ...diff.losses];
  if (displaced) losses.unshift(`Replaces ${def(displaced.kind).label}; it returns intact to the hold.`);
  if (usedAfter >= capacity) losses.push(`Uses the ${capacity === 1 ? "only" : "last free"} ${SLOT_WORDS[slot][0]}.`);
  return preview(t, act, item.kind, { ...base, gains: [d.benefit, ...diff.gains], losses, warnings: launchWarnings(t, before, after) });
}

/** Read-only removal preview. The module returns intact to this hold unless
 * `elsewhere` (the caller has a container with room). */
export function removePreview(t: FitTarget, itemId: string, options: { elsewhere?: boolean } = {}): FitPreview {
  const act = "remove", item = t.fitted.find((f) => f.itemId === itemId);
  if (!item) return refuse(t, act, null, `Choose an upgrade fitted to this ${label(t.hull)}.`);
  const d = def(item.kind), slot = slotOf(t.hull, item.kind), hull = label(t.hull);
  if (d.refit) return refuse(t, act, item.kind, "Hull refits are structural; they stay with the hull.");
  if (!slot) return refuse(t, act, item.kind, `${d.label} does not belong on the ${hull}; repair the fitting record before changing it.`);
  const dock = dockRefusal(t, slot);
  if (dock) return refuse(t, act, item.kind, dock);
  const busy = inUseRefusal(t, item.kind);
  if (busy) return refuse(t, act, item.kind, busy);
  const before = profileOf(t);
  const fittedAfter = t.fitted.filter((f) => f.itemId !== itemId);
  const after = craftProfile(t.hull, t.rating, kinds(fittedAfter));
  const capacityCu = holdCapacity(t, after);
  const usedCu = t.hold.usedCu + (!inCargo(t.hull, item.kind) && !options.elsewhere ? d.cu : 0)
    - (inCargo(t.hull, item.kind) && options.elsewhere ? d.cu : 0);
  const used = t.fitted.filter((f) => slotOf(t.hull, f.kind) === slot).length - 1;
  const base = { slot, after, fittedAfter, slotUse: { used, capacity: slotCapacity(t.hull, slot, after) }, hold: { capacityCu, usedCu } };
  if (before.mixedBerths && !after.mixedBerths && t.carrier?.configuration === "mixed")
    return refuse(t, act, item.kind, "Empty both berths and set them to compact or medium before removing the extension. Nothing changed.", base);
  if (t.carrier && t.carrier.systemOccupied > after.systemSockets)
    return refuse(t, act, item.kind, `Clear ${t.carrier.systemOccupied - after.systemSockets} system socket${t.carrier.systemOccupied - after.systemSockets === 1 ? "" : "s"} first; their occupants need a powered socket. Nothing changed.`, base);
  const safety = safetyRefusal(t, before, after, `Removing ${d.label}`);
  if (safety) return refuse(t, act, item.kind, safety, base);
  if (usedCu > capacityCu)
    return refuse(t, act, item.kind, `The ${hull} hold would need ${usedCu} CU but holds ${capacityCu} CU without it. Store ${usedCu - capacityCu} CU first, or take the module to a locker. Nothing changed.`, base);
  const diff = profileChanges(before, after, t.hold.baseCu);
  return preview(t, act, item.kind, {
    ...base, warnings: launchWarnings(t, before, after),
    gains: [`${d.label} returns intact${options.elsewhere ? "" : " to the hold"}.`, `Frees a ${SLOT_WORDS[slot][0]}.`, ...diff.gains],
    losses: [`Gives up: ${d.benefit}`, ...diff.losses],
  });
}
/** The fitted list after an accepted preview; throws on a refused one. */
export function applyFit(p: FitPreview): readonly Fitted[] {
  if (p.refusal) throw new Error(`refused fit change applied: ${p.refusal}`);
  return p.fittedAfter;
}

// ---------------------------------------------------------------- refits and fabrication
export type Stock = Partial<Record<CostKind, number>>;
export interface Shortfall { readonly kind: CostKind; readonly need: number; readonly have: number }
export function shortfalls(cost: Stock, stock: Stock): Shortfall[] {
  return (Object.entries(cost) as [CostKind, number][])
    .filter(([k, n]) => (stock[k] ?? 0) < n).map(([k, n]) => ({ kind: k, need: n, have: stock[k] ?? 0 }));
}
const shortText = (s: readonly Shortfall[]): string =>
  s.map((x) => `${x.need - x.have} more ${x.kind.replaceAll("_", " ")}`).join(", ");
/** Fabricating an upgrade module from local stock. Plans are the existing ones. */
export function fabricatePreview(kind: UpgradeId, stock: Stock, plans: readonly string[]): { refusal: string | null; shortfalls: Shortfall[] } {
  const d = def(kind), missing = shortfalls(d.cost, stock);
  if (!plans.includes(d.plan)) return { refusal: `${d.label} needs its plans first.`, shortfalls: missing };
  if (d.refit) return { refusal: `${d.label} is paid at the bench with the hull present; see refitPreview.`, shortfalls: missing };
  return { refusal: missing.length ? `${d.label} needs ${shortText(missing)}. Nothing was used.` : null, shortfalls: missing };
}
/** Paying a pressure refit with the hull at the workshop or yard. Permanent. */
export function refitPreview(t: Pick<FitTarget, "hull" | "rating" | "dock" | "fitted">, kind: UpgradeId, stock: Stock):
  { refusal: string | null; ratingAfter: number; shortfalls: Shortfall[] } {
  const d = def(kind), r = d.refit;
  const result = (refusal: string | null, missing: Shortfall[] = []) => ({ refusal, ratingAfter: refusal ? t.rating : r!.rating, shortfalls: missing });
  if (!r) return { refusal: `${d.label} is a module, not a refit.`, ratingAfter: t.rating, shortfalls: [] };
  if (!d.fits[t.hull]) return result(t.hull === "spindle" ? "The Spindle is a surface hull; it takes no pressure refit." : `${d.label} is for another hull.`);
  if (t.rating !== r.from) return result(t.rating > r.from ? `This ${label(t.hull)} is already rated ${t.rating} m.`
    : `${d.label} refits a ${r.from} m hull; this one is rated ${t.rating} m. Fit the earlier refit first.`);
  if (t.dock !== "workshop" && t.dock !== "yard") return result("Pay hull refits with the hull at the workshop slip or the yard berth.");
  const missing = shortfalls(d.cost, stock);
  return result(missing.length ? `${d.label} needs ${shortText(missing)}. Nothing was used.` : null, missing);
}

// ---------------------------------------------------------------- carrier berths
/** Berth layouts the carrier can take: one size per slot. Mixed needs the extension. */
export function berthLayouts(p: CraftProfile): Partial<Record<BerthConfiguration, readonly ("compact" | "medium")[]>> {
  return { compact: ["compact", "compact"], medium: ["medium"], ...(p.mixedBerths ? { mixed: ["medium", "compact"] as const } : {}) };
}
