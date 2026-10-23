/** Planters on any host. A crop grows only while its planter module sits in a
 * socket; packed or carried, it waits. Harvests return the cutting, and by
 * default replant it, so a crop keeps going between expeditions. */
import { isSeed, SEEDS } from "../../content/systems/cultivation.js";
import type { SeedKind } from "../../content/systems/cultivation.js";
import { addItem, applySpend, containerAccepts, containerLabel, cuOf, freeCapacity, labelOf, planSpend } from "../inventory.js";
import type { ItemKind } from "../../content/registry.js";
import type { GameState } from "../types.js";
import { accessible, hostById, hostLocal, workContainers } from "./hosts.js";
import type { PlanterState, SystemsState } from "./state.js";

export const cropReady = (p: PlanterState): boolean => p.progress >= SEEDS[p.seed].growSeconds;
export interface CropView { moduleId: string; seed: SeedKind; label: string; produce: string; progress: number; growSeconds: number; ready: boolean; growing: boolean }
export function cropViews(sys: SystemsState): CropView[] {
  return sys.planters.map((p) => {
    const seed = SEEDS[p.seed];
    return { moduleId: p.moduleId, seed: p.seed, label: seed.label, produce: seed.produce, progress: p.progress,
      growSeconds: seed.growSeconds, ready: cropReady(p), growing: !cropReady(p) && sys.sockets.some((e) => e.itemId === p.moduleId) };
  });
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
  const pay = planSpend(s, { [seed]: 1 }, at.containers);
  if (Object.keys(pay.missing).length) return `Carry a ${labelOf(seed).toLowerCase()} to plant it.`;
  applySpend(s, pay.lines);
  sys.planters.push({ moduleId: at.moduleId, seed, progress: 0 });
  s.feedback = `${SEEDS[seed].label} planted · ready in about ${Math.round(SEEDS[seed].growSeconds / 60)} min of play.`;
  return null;
}

/** Growth for `seconds` of active play, for crops whose planter is socketed. */
export function advanceGrowth(sys: SystemsState, seconds: number): SeedKind[] {
  const ripened: SeedKind[] = [];
  for (const p of sys.planters) {
    if (cropReady(p) || !sys.sockets.some((e) => e.itemId === p.moduleId)) continue;
    p.progress = Math.min(SEEDS[p.seed].growSeconds, p.progress + seconds);
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
  const seed = SEEDS[crop.seed];
  if (!cropReady(crop)) return empty(`${seed.label} is ${Math.floor(100 * crop.progress / seed.growSeconds)}% grown.`);
  const need = cuOf(seed.produce) * seed.quantity + (replant ? 0 : cuOf(crop.seed));
  // Both outputs land together, so the destination must take both: a pantry
  // takes meals but not the cutting that grew them.
  const fits = (c: string): boolean => accessible(s, sys, c) && containerAccepts(s, c, seed.produce) &&
    (replant || containerAccepts(s, c, crop.seed)) && freeCapacity(s, c) >= need;
  const to = options.to !== undefined ? (fits(options.to) ? options.to : null)
    : [...at.lockers, "diver"].find((c) => s.inventory.containers.some((k) => k.id === c) && fits(c)) ?? null;
  if (!to) {
    const refused = options.to !== undefined && accessible(s, sys, options.to) && [seed.produce, ...(replant ? [] : [crop.seed])].find((k) => !containerAccepts(s, options.to!, k));
    return { ...empty(refused ? `${containerLabel(s, options.to!)} doesn't take ${labelOf(refused).toLowerCase()}. Harvest elsewhere, or replant the cutting. Nothing harvested.`
      : `The harvest needs ${need} CU free${options.to ? ` in ${containerLabel(s, options.to)}` : " in a locker here or your hold"}. Nothing harvested.`), produce: seed.produce, quantity: seed.quantity };
  }
  return { refusal: null, produce: seed.produce, quantity: seed.quantity, to, cutting: replant ? "replanted" : "returned" };
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
