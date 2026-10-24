/** CR-1: catching, cooking, bait and planter feed. Every rule moves items
 * between containers in one transaction and refuses before changing anything,
 * so totals are conserved: a catch moves fish out of a ground's stock, cooking
 * turns raw food into meals at the COOKING ratios, bait spends one fish. */
import { BAIT, COOKABLE, COOKING, FERTILISER, MAX_PORTIONS, NET_BONUS } from "../../content/fauna/items.js";
import type { CookableKind } from "../../content/fauna/items.js";
import { GROUNDS, isFaunaSource } from "../../content/fauna/grounds.js";
import { SEEDS } from "../../content/systems/cultivation.js";
import { SOURCES } from "../../content/registry.js";
import type { SourceId } from "../../content/registry.js";
import { placeDeterrent } from "../ecologyLink.js";
import { cabinHull, cabinPowered, fittedCabin, nearFixture } from "../fleet.js";
import { addItem, applySpend, cabinLockerId, containerAccepts, containerLabel, distance, facility, freeCapacity, nearPod, nearWorkshop, planSpend, removeQuantity } from "../inventory.js";
import type { GameState, Vec3 } from "../types.js";
import { WORLD_BOUNDS } from "../world.js";
import { cropReady } from "../systems/cultivation.js";
import { hostById, hostLocal, workContainers } from "../systems/hosts.js";
import type { SystemsState } from "../systems/state.js";
import { windowBusy } from "./windows.js";

// ---------------------------------------------------------------- catching
const carriesNet = (s: GameState): boolean => s.inventory.items.some((i) => i.kind === "hand_net" && i.containerId === "diver");
/** How many a catch takes from this ground: one by hand, one more with a net. */
export function catchBundle(s: GameState, id: SourceId): number {
  return SOURCES[id].bundle + (isFaunaSource(id) && GROUNDS[id].kind === "fish" && carriesNet(s) ? NET_BONUS : 0);
}
/** What an emptied ground says, in place of the generic exhausted message. */
export function emptyGround(id: SourceId): string | null {
  if (!isFaunaSource(id)) return null;
  const kind = GROUNDS[id].kind;
  return kind === "fish" ? "The school has scattered. It regathers one fish every few minutes."
    : kind === "roe" ? "No roe is laid here now. New clusters appear over the next while."
    : kind === "shed" ? "Nothing shed here now. The residents leave more over time."
    : kind === "fall" ? "This fall has nothing left to salvage."
    : "Protected. Look, don't take.";
}

// ---------------------------------------------------------------- cooking
export interface Cooker { label: string; raw: string[]; to: string }
/** Where the player can cook now: the Creel cabin cooker (powered), the
 * Hearthline galley, or the galley ring at the pod and the restored workshop,
 * the refuges that already issue meals. Raw food is taken from `raw`; meals go
 * to `to`. */
export function cookerHere(s: GameState): Cooker | { refusal: string } {
  const cabin = cabinHull(s);
  if (cabin) {
    if (!nearFixture(s, "cooker", 1.5)) return { refusal: "Step to the galley cooker." };
    if (!cabinPowered(cabin)) return { refusal: "The cooker needs hull power." };
    const locker = fittedCabin(s, cabin) ? cabinLockerId(fittedCabin(s, cabin)!.id) : null;
    return { label: "Creel cabin cooker", raw: ["diver", ...(locker ? [locker] : []), cabin.cargoId], to: locker ?? cabin.cargoId };
  }
  const carrier = s.fleet.vehicles.find((v) => v.hull === "hearthline" && v.id === s.player.interiorId);
  if (carrier) return { label: "Hearthline galley", raw: ["diver", `${carrier.id}_pantry`, carrier.cargoId], to: `${carrier.id}_pantry` };
  if (nearPod(s)) return { label: "Pod galley ring", raw: ["diver", "pod_locker"], to: "pod_locker" };
  if (nearWorkshop(s) && facility(s, "island_workshop")) return { label: "Workshop galley", raw: ["diver", "workshop_locker"], to: "workshop_locker" };
  return { refusal: "Cook your catch at a cooker: the pod or workshop galley, a Creel cabin or the Hearthline galley." };
}
export interface CookPlan {
  refusal: string | null;
  cooker: string;
  /** Raw counts within reach, and the most portions they make. */
  available: Readonly<Record<CookableKind, number>>;
  maxPortions: number;
  /** For the requested portions: raw used and meals made. */
  use: Readonly<Record<CookableKind, number>>;
  meals: number;
  to: string | null;
}
const count = (s: GameState, kind: string, containers: readonly string[]): number =>
  s.inventory.items.filter((i) => i.kind === kind && containers.includes(i.containerId) && !i.fitted && i.provenance === "public").reduce((n, i) => n + i.quantity, 0);
/** Roe first (two portions a cluster), then fish in pairs; an odd last portion
 * with only roe left cooks a whole cluster (one extra meal, never less). */
export function cookPlan(s: GameState, portions: number): CookPlan {
  const where = cookerHere(s);
  const empty = { small_fish: 0, roe_cluster: 0 } as Record<CookableKind, number>;
  if ("refusal" in where) return { refusal: where.refusal, cooker: "", available: empty, maxPortions: 0, use: empty, meals: 0, to: null };
  const available = { small_fish: count(s, "small_fish", where.raw), roe_cluster: count(s, "roe_cluster", where.raw) };
  const maxPortions = Math.min(MAX_PORTIONS, available.roe_cluster * COOKING.roe_cluster.meals + Math.floor(available.small_fish / COOKING.small_fish.raw));
  const base = { cooker: where.label, available, maxPortions };
  if (maxPortions === 0) return { ...base, refusal: "Nothing to cook: catch two small fish, or bring a roe cluster.", use: empty, meals: 0, to: null };
  const n = Math.max(1, Math.min(maxPortions, Math.floor(portions)));
  let roe = Math.min(available.roe_cluster, Math.floor(n / 2)), left = n - roe * 2;
  const pairs = Math.min(Math.floor(available.small_fish / 2), left);
  left -= pairs;
  if (left > 0 && roe < available.roe_cluster) roe++;
  const use = { roe_cluster: roe, small_fish: pairs * COOKING.small_fish.raw };
  const meals = roe * COOKING.roe_cluster.meals + pairs * COOKING.small_fish.meals;
  // Raw from the destination frees its space first.
  const order = [where.to, ...where.raw.filter((c) => c !== where.to)];
  const pay = planSpend(s, use, order.filter((c) => s.inventory.containers.some((k) => k.id === c)));
  const freed = pay.lines.filter((l) => l.from === where.to).reduce((k, l) => k + l.quantity, 0);
  const to = [where.to, "diver"].find((c) => s.inventory.containers.some((k) => k.id === c) && containerAccepts(s, c, "meal") &&
    freeCapacity(s, c) + (c === where.to ? freed : pay.lines.filter((l) => l.from === c).reduce((k, l) => k + l.quantity, 0)) >= meals) ?? null;
  if (!to) return { ...base, refusal: `${meals} meals need ${meals} CU free in ${containerLabel(s, where.to)} or your hold. Nothing cooked.`, use, meals, to: null };
  return { ...base, refusal: null, use, meals, to };
}
export function cookCatch(s: GameState, portions: number): string | null {
  const p = cookPlan(s, portions);
  if (p.refusal) return p.refusal;
  const where = cookerHere(s) as Cooker, order = [where.to, ...where.raw.filter((c) => c !== where.to)];
  applySpend(s, planSpend(s, p.use, order.filter((c) => s.inventory.containers.some((k) => k.id === c))));
  addItem(s, "meal", p.meals, p.to!);
  const raw = (COOKABLE).filter((k) => p.use[k] > 0).map((k) => `${p.use[k]} ${k === "small_fish" ? "fish" : "roe"}`).join(" and ");
  s.feedback = `Cooked ${raw} at the ${p.cooker} · ${p.meals} ${p.meals === 1 ? "meal" : "meals"} → ${containerLabel(s, p.to!)}. Meals keep; eat with F.`;
  return null;
}

// ---------------------------------------------------------------- bait
/** Release one small fish as bait a few metres ahead: it sinks and struggles,
 * and threats feed on it instead of hunting you. */
export const BAIT_AHEAD = 8;
export function baitPoint(s: GameState): Vec3 {
  const v = s.fleet.vehicles.find((x) => x.id === s.player.controlledVehicleId);
  const p = v?.pose.position ?? s.player.pose.position, yaw = v?.pose.yaw ?? s.player.pose.yaw;
  return {
    x: Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, p.x + Math.sin(yaw) * BAIT_AHEAD)),
    y: Math.min(-0.5, p.y),
    z: Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, p.z - Math.cos(yaw) * BAIT_AHEAD)),
  };
}
export function releaseBait(s: GameState): string | null {
  if (s.player.mode === "interior" || s.player.mode === "walking") return "Release bait in open water.";
  const v = s.fleet.vehicles.find((x) => x.id === s.player.controlledVehicleId);
  if (v?.berth) return "Launch before releasing bait.";
  const holds = ["diver", ...(v ? [v.cargoId] : [])];
  const fish = s.inventory.items.find((i) => i.kind === "small_fish" && holds.includes(i.containerId));
  if (!fish) return "No small fish carried. Catch one at a school (E) to use as bait.";
  const at = baitPoint(s);
  removeQuantity(s, fish, 1);
  placeDeterrent(s, "bait", at);
  // The sound hunter hears the struggling fish and goes to feed on it, unless
  // it is already away feeding or turned by another distraction.
  const t = s.world.threat;
  const hunter = t.distractionSeconds <= 0 && !windowBusy("canopy_sound_hunter", s.tick) && distance(t.position, at) <= BAIT.hunterRange;
  if (hunter) { t.distraction = { ...at }; t.distractionSeconds = BAIT.seconds; }
  s.feedback = hunter ? "Bait released · the fish struggles ahead; the hunter turns to it. Move quietly away."
    : "Bait released · a small fish sinks ahead of you. Hunting animals nearby feed on it instead of you.";
  return null;
}

// ---------------------------------------------------------------- planter feed
/** One feed on a young crop grows it by FERTILISER.boost of its grow time at once. */
export function feedPlanterRefusal(s: GameState, sys: SystemsState, hostId: string, socketId: string): string | null {
  const host = hostById(s, sys, hostId);
  if (!host) return "That host doesn't exist.";
  if (!hostLocal(s, host)) return `Tend planters at ${host.label}.`;
  const slot = host.sockets.find((k) => k.id === socketId);
  if (slot?.occupant?.module !== "planter" || !slot.occupant.itemId) return "That socket holds no planter.";
  const crop = sys.planters.find((p) => p.moduleId === slot.occupant!.itemId);
  if (!crop) return "Plant a cutting before feeding the planter.";
  if (cropReady(crop)) return "The crop is ready. Harvest it.";
  if (crop.progress >= SEEDS[crop.seed].growSeconds * FERTILISER.before) return "Feed only takes on a young crop; this one is well grown.";
  if (Object.keys(planSpend(s, { planter_feed: 1 }, workContainers(s, sys, host)).missing).length) return "Carry shell-and-cast feed: shed shells, scavenger casts or fall bone.";
  return null;
}
export function feedPlanter(s: GameState, sys: SystemsState, hostId: string, socketId: string): string | null {
  const no = feedPlanterRefusal(s, sys, hostId, socketId);
  if (no) return no;
  const host = hostById(s, sys, hostId)!, moduleId = host.sockets.find((k) => k.id === socketId)!.occupant!.itemId!;
  const crop = sys.planters.find((p) => p.moduleId === moduleId)!, grow = SEEDS[crop.seed].growSeconds;
  applySpend(s, planSpend(s, { planter_feed: 1 }, workContainers(s, sys, host)));
  crop.progress = Math.min(grow, crop.progress + grow * FERTILISER.boost);
  s.feedback = `Planter fed · ${SEEDS[crop.seed].label} jumps to ${Math.floor(100 * crop.progress / grow)}% grown.`;
  return null;
}
