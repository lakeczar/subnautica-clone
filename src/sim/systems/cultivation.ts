/** Planters on any host. A crop grows only while its planter module sits in a
 * socket; packed or carried, it waits. Harvests return the cutting, and by
 * default replant it, so a crop keeps going between expeditions. */
import { isSeed, SEEDS } from "../../content/systems/cultivation.js";
import type { SeedKind } from "../../content/systems/cultivation.js";
import { addItem, applySpend, containerAccepts, containerLabel, cuOf, freeCapacity, labelOf, planSpend } from "../inventory.js";
import type { ItemKind } from "../../content/registry.js";
import type { GameState } from "../types.js";
import { accessible, hostById, hostLocal, locationPower, workContainers } from "./hosts.js";
import type { HostPower } from "./hosts.js";
import { growBedFitted } from "../upgrades/hosts.js";
import type { PlanterState, SystemsState } from "./state.js";

export const cropReady = (p: PlanterState): boolean => p.progress >= SEEDS[p.seed].growSeconds;
/** LS-1: what a heated grow bed does for this seed: nothing for power crops. */
const bedHelps = (seed: SeedKind): boolean => SEEDS[seed].role !== "power";
/** LS-1: produce per harvest; a grow bed adds one for food, medicine and material crops. */
export const harvestQuantity = (sys: SystemsState, moduleId: string, seed: SeedKind): number =>
  SEEDS[seed].quantity + (growBedFitted(sys.moduleUpgrades, moduleId) && bedHelps(seed) ? 1 : 0);
/** Whether one host has power now, read from a freshly built host view: for views and
 * commands. The fixed step passes its own per-host answer instead (`growthRateFor`). */
export const hostPoweredNow = (s: GameState, sys: SystemsState, hostId: string, power: HostPower = locationPower): boolean => {
  const host = hostById(s, sys, hostId);
  return !!host && power(host, s);
};
/** LS-1: growth per second of play: twice as fast with a grow bed on a powered host, for
 * non-power crops; otherwise the base rate, never slower. `hostPowered` answers for the
 * planter's host; only a bed crop asks. */
export function growthRateFor(sys: SystemsState, p: PlanterState, hostPowered: (hostId: string) => boolean): number {
  if (!growBedFitted(sys.moduleUpgrades, p.moduleId) || !bedHelps(p.seed)) return 1;
  const entry = sys.sockets.find((e) => e.itemId === p.moduleId);
  return entry && hostPowered(entry.hostId) ? 2 : 1;
}
/** The same rate, for views and tests (a host view built for the one crop). */
export const growthRate = (s: GameState, sys: SystemsState, p: PlanterState, power: HostPower = locationPower): number =>
  growthRateFor(sys, p, (hostId) => hostPoweredNow(s, sys, hostId, power));
/** LS-1: what a heated grow bed is doing for a crop now: none fitted; speeding it on a
 * powered host; waiting for power (speed only; the extra produce stays); or nothing,
 * because power crops take no benefit. */
export type BedEffect = "none" | "active" | "unpowered" | "no-effect";
export interface CropView {
  moduleId: string; seed: SeedKind; label: string; produce: string; progress: number; growSeconds: number; ready: boolean; growing: boolean;
  /** Growth multiplier now (`growthRate`; 1 without a state to ask). */
  rate: number;
  /** Produce per harvest (`harvestQuantity`). */
  quantity: number;
  bed: BedEffect;
}
/** One view per crop. With the state, the bed's effect and the rate are the step's own
 * answers (`growthRate`, `harvestQuantity`); without it, the base rate. */
export function cropViews(sys: SystemsState, s?: GameState, power: HostPower = locationPower): CropView[] {
  return sys.planters.map((p) => {
    const seed = SEEDS[p.seed], fitted = growBedFitted(sys.moduleUpgrades, p.moduleId);
    const rate = s ? growthRate(s, sys, p, power) : 1;
    const bed: BedEffect = !fitted ? "none" : !bedHelps(p.seed) ? "no-effect" : rate > 1 ? "active" : "unpowered";
    return { moduleId: p.moduleId, seed: p.seed, label: seed.label, produce: seed.produce, progress: p.progress,
      growSeconds: seed.growSeconds, ready: cropReady(p), growing: !cropReady(p) && sys.sockets.some((e) => e.itemId === p.moduleId),
      rate, quantity: harvestQuantity(sys, p.moduleId, p.seed), bed };
  });
}
/** The crop's line for the planter panel: progress, time left at the current rate, the
 * yield, and what the bed is doing. */
export function cropLine(c: CropView): string {
  const left = Math.max(0, c.growSeconds - c.progress) / c.rate;
  const state = c.ready ? "ready" : `${Math.round(c.progress / c.growSeconds * 100)}% · about ${Math.max(1, Math.round(left / 60))} min left${c.growing ? "" : " once socketed"}`;
  const bed = c.bed === "active" ? " · heated grow bed: twice as fast"
    : c.bed === "unpowered" ? " · heated grow bed: needs host power to speed growth"
    : c.bed === "no-effect" ? " · heated grow bed: no effect on power crops" : "";
  return `${c.label} · ${state} · ${c.quantity} × ${labelOf(c.produce)} per harvest${bed}`;
}

function planterAt(s: GameState, sys: SystemsState, hostId: string, socketId: string): { refusal: string } | { moduleId: string; containers: string[]; lockers: string[] } {
  const host = hostById(s, sys, hostId);
  if (!host) return { refusal: "That host doesn't exist." };
  if (!host.available) return { refusal: `${host.label} isn't working.` };
  if (!hostLocal(s, host)) return { refusal: `Tend planters at ${host.label}.` };
  const slot = host.sockets.find((k) => k.id === socketId);
  if (!slot?.occupant || slot.occupant.module !== "planter" || !slot.occupant.itemId) return { refusal: "That socket holds no planter." };
  return { moduleId: slot.occupant.itemId, containers: workContainers(s, sys, host), lockers: host.lockers };
}

/** Plants one seed from the diver hold or this host's lockers. */
export function plant(s: GameState, sys: SystemsState, hostId: string, socketId: string, seed: SeedKind): string | null {
  if (!isSeed(seed)) return "Choose a seed or cutting.";
  const at = planterAt(s, sys, hostId, socketId);
  if ("refusal" in at) return at.refusal;
  const crop = sys.planters.find((p) => p.moduleId === at.moduleId);
  if (crop) return cropReady(crop) ? "Harvest the ready crop first." : `The planter is growing ${SEEDS[crop.seed].label.toLowerCase()}.`;
  // LS-1: a warmth crop takes a heated grow bed, or a planter on a thermal host.
  if ("heat" in SEEDS[seed] && !growBedFitted(sys.moduleUpgrades, at.moduleId) && hostById(s, sys, hostId)?.power !== "thermal")
    return `${SEEDS[seed].label} needs warmth: a heated grow bed, or a planter at a thermal outpost.`;
  const pay = planSpend(s, { [seed]: 1 }, at.containers);
  if (Object.keys(pay.missing).length) return `Carry a ${labelOf(seed).toLowerCase()} to plant it.`;
  applySpend(s, pay);
  sys.planters.push({ moduleId: at.moduleId, seed, progress: 0 });
  // LS-1: the quoted time and yield are the bed's modified ones, from the same authorities.
  const planted = sys.planters.at(-1)!, rate = growthRate(s, sys, planted), quantity = harvestQuantity(sys, at.moduleId, seed);
  s.feedback = `${SEEDS[seed].label} planted · ready in about ${Math.max(1, Math.round(SEEDS[seed].growSeconds / rate / 60))} min of play` +
    `${rate > 1 ? " (heated grow bed, while the host has power)" : ""} · ${quantity} per harvest.`;
  return null;
}

/** Growth for `seconds` of active play, for crops whose planter is socketed. `rate` is
 * the planter's growth multiplier (`growthRate`; 1 without a grow bed). */
export function advanceGrowth(sys: SystemsState, seconds: number, rate: (p: PlanterState) => number = () => 1): SeedKind[] {
  const ripened: SeedKind[] = [];
  for (const p of sys.planters) {
    if (cropReady(p) || !sys.sockets.some((e) => e.itemId === p.moduleId)) continue;
    p.progress = Math.min(SEEDS[p.seed].growSeconds, p.progress + seconds * rate(p));
    if (cropReady(p)) ripened.push(p.seed);
  }
  return ripened;
}

export interface HarvestPreview { refusal: string | null; produce: string; quantity: number; to: string | null; cutting: "replanted" | "returned" }
/** Produce goes to `to`, else the first host locker with room, else the diver hold.
 * With `replant` the cutting stays and growth restarts; otherwise it returns too. */
export function harvestPreview(s: GameState, sys: SystemsState, hostId: string, socketId: string,
  options: { to?: string; replant?: boolean } = {}): HarvestPreview {
  const replant = options.replant ?? true;
  const empty = (refusal: string): HarvestPreview => ({ refusal, produce: "", quantity: 0, to: null, cutting: replant ? "replanted" : "returned" });
  const at = planterAt(s, sys, hostId, socketId);
  if ("refusal" in at) return empty(at.refusal);
  const crop = sys.planters.find((p) => p.moduleId === at.moduleId);
  if (!crop) return empty("The planter is empty.");
  const seed = SEEDS[crop.seed], quantity = harvestQuantity(sys, crop.moduleId, crop.seed);
  if (!cropReady(crop)) return empty(`${seed.label} is ${Math.floor(100 * crop.progress / seed.growSeconds)}% grown.`);
  const need = cuOf(seed.produce) * quantity + (replant ? 0 : cuOf(crop.seed));
  // Both outputs land together, so the destination must take both: a pantry
  // takes meals but not the cutting that grew them.
  const fits = (c: string): boolean => accessible(s, sys, c) && containerAccepts(s, c, seed.produce) &&
    (replant || containerAccepts(s, c, crop.seed)) && freeCapacity(s, c) >= need;
  const to = options.to !== undefined ? (fits(options.to) ? options.to : null)
    : [...at.lockers, "diver"].find((c) => s.inventory.containers.some((k) => k.id === c) && fits(c)) ?? null;
  if (!to) {
    const refused = options.to !== undefined && accessible(s, sys, options.to) && [seed.produce, ...(replant ? [] : [crop.seed])].find((k) => !containerAccepts(s, options.to!, k));
    return { ...empty(refused ? `${containerLabel(s, options.to!)} doesn't take ${labelOf(refused).toLowerCase()}. Harvest elsewhere, or replant the cutting. Nothing harvested.`
      : `The harvest needs ${need} CU free${options.to ? ` in ${containerLabel(s, options.to)}` : " in a locker here or your hold"}. Nothing harvested.`), produce: seed.produce, quantity };
  }
  return { refusal: null, produce: seed.produce, quantity, to, cutting: replant ? "replanted" : "returned" };
}
export function harvest(s: GameState, sys: SystemsState, hostId: string, socketId: string,
  options: { to?: string; replant?: boolean } = {}): string | null {
  const p = harvestPreview(s, sys, hostId, socketId, options);
  if (p.refusal) return p.refusal;
  const at = planterAt(s, sys, hostId, socketId) as { moduleId: string };
  const crop = sys.planters.find((c) => c.moduleId === at.moduleId)!;
  if (p.produce === "bio_cell") for (let n = 0; n < p.quantity; n++) addItem(s, p.produce as ItemKind, 1, p.to!);
  else addItem(s, p.produce as ItemKind, p.quantity, p.to!);
  if (p.cutting === "replanted") crop.progress = 0;
  else {
    addItem(s, crop.seed as ItemKind, 1, p.to!);
    sys.planters = sys.planters.filter((c) => c !== crop);
  }
  s.feedback = `Harvested ${p.quantity} × ${labelOf(p.produce)} → ${containerLabel(s, p.to!)}${p.cutting === "replanted" ? " · replanted" : ""}.`;
  return null;
}
