/** Field outposts: deploy a kit at a suitable spot, upgrade it in place, pack it
 * up and redeploy it toward the frontier. Every mutation runs the same detached
 * preview the player sees, so the preview and the result can't disagree. */
import type { RegionId } from "../../content/registry.js";
import { DECODABLES, DECODE_MINUTES } from "../../content/systems/decodes.js";
import { SEEDS } from "../../content/systems/cultivation.js";
import { FIXED_HOSTS, moduleOfItem, OUTPOST_LIMIT, OUTPOST_SITING, OUTPOST_TIER_ORDER, OUTPOST_TIERS, tierOfKit } from "../../content/systems/hosts.js";
import type { OutpostTier } from "../../content/systems/hosts.js";
import { applySpend, containerAccepts, containerLabel, costText, cuOf, distance, freeCapacity, labelOf, planSpend, restoreInstance } from "../inventory.js";
import type { GameState, Vec3 } from "../types.js";
import { accessible, forgetRemembered, outpostHost, outpostLockerId, workContainers } from "./hosts.js";
import type { SpendLine } from "../inventory.js";
import { layoutProblem } from "./state.js";
import type { OutpostState, PowerSource, SystemsState } from "./state.js";

export type Ground = "ledge" | "cave_floor" | "seabed" | "slope" | "structure" | "open_water";
/** What the world says about one candidate point. */
export interface SiteSample {
  ground: Ground;
  /** Degrees from level. */
  slope: number;
  /** Room for the outpost's footprint, clear of solids. */
  clear: boolean;
  /** Metres below the water surface; negative above it. */
  depth: number;
  /** Distance to the nearest active vent, or null. */
  ventDistance: number | null;
  /** Inside a cave or overhang: no sunlight. */
  covered: boolean;
  region: RegionId | null;
}
/** The small world-query seam. The runtime builds it from terrain, the cave kit
 * and hazard data; tests pass a table. */
export interface OutpostSiteQuery { sample(position: Vec3): SiteSample }

export interface OutpostRules {
  /** SYS-1's upgrade adds to the active limit. */
  limitBonus?: number;
}

/** Thermal at a vent, solar in bright open water, cells otherwise. */
export function sitePower(site: SiteSample): PowerSource {
  if (site.ventDistance !== null && site.ventDistance <= OUTPOST_SITING.thermalRange) return "thermal";
  if (!site.covered && site.depth <= OUTPOST_SITING.solarDepth) return "solar";
  return "cells";
}
/** Null when the ground holds an outpost, else the reason it doesn't. */
export function siteProblem(site: SiteSample): string | null {
  if (site.ground === "open_water") return "There's nothing to anchor to here. Find a ledge, a cave floor or ground near a vent.";
  const vent = site.ventDistance !== null && site.ventDistance <= OUTPOST_SITING.ventSiteRange;
  if (!(OUTPOST_SITING.grounds as readonly string[]).includes(site.ground) && !(vent && (site.ground === "seabed" || site.ground === "structure")))
    return "The anchor needs a ledge, a cave floor, or firm ground near a vent.";
  if (site.slope > OUTPOST_SITING.maxSlope) return `Too steep to anchor (${Math.round(site.slope)}°; ${OUTPOST_SITING.maxSlope}° at most).`;
  if (!site.clear) return "Something is in the way. The outpost needs a clear footprint.";
  return null;
}
export const outpostLimit = (rules: OutpostRules = {}): number => OUTPOST_LIMIT + Math.max(0, rules.limitBonus ?? 0);

export interface DeployPreview {
  refusal: string | null;
  tier: OutpostTier | null;
  power: PowerSource | null;
  region: RegionId | null;
  /** Remembered modules that will be refitted from the diver hold, and those not carried. */
  refit: { socket: string; itemId: string; kind: string }[];
  missing: { socket: string; itemId: string }[];
}
/** Deploys the kit `kitItemId` at `position`, within reach of the diver. */
export function deployPreview(s: GameState, sys: SystemsState, kitItemId: string, position: Vec3,
  world: OutpostSiteQuery, rules: OutpostRules = {}): DeployPreview {
  const none = (refusal: string, tier: OutpostTier | null = null): DeployPreview =>
    ({ refusal, tier, power: null, region: null, refit: [], missing: [] });
  const kit = s.inventory.items.find((i) => i.id === kitItemId);
  const tier = kit ? tierOfKit(kit.kind) : null;
  if (!kit || !tier) return none("Choose an outpost kit.");
  if (kit.containerId !== "diver") return none("Carry the kit in your hold to deploy it.", tier);
  if (s.player.controlledVehicleId || s.player.interiorId) return none("Leave the craft to plant the anchor.", tier);
  if (distance(s.player.pose.position, position) > OUTPOST_SITING.reach) return none("Plant the kit within reach.", tier);
  if (sys.outposts.length >= outpostLimit(rules))
    return none(`${sys.outposts.length} outposts are already active, the most you can run. Pack one up first.`, tier);
  const near = [...sys.outposts.map((o) => ({ label: o.name, position: o.position })), ...Object.values(FIXED_HOSTS)]
    .find((h) => distance(h.position, position) < OUTPOST_SITING.spacing);
  if (near) return none(`Too close to ${near.label}. Outposts need ${OUTPOST_SITING.spacing} m of space.`, tier);
  const site = world.sample(position), problem = siteProblem(site);
  if (problem) return none(problem, tier);
  if (sys.outposts.some((o) => o.id === kitItemId)) return none("That kit is already deployed.", tier);
  const packed = sys.packed.find((p) => p.itemId === kitItemId);
  const broken = packed && (packed.tier !== tier ? "its tier doesn't match the kit" : layoutProblem(packed));
  if (broken) return none(`This kit's remembered layout is inconsistent (${broken}). Nothing deployed.`, tier);
  const layout = packed?.layout ?? [];
  // Only a loose module in the diver hold refits; an installed one stays where it is.
  const refit = layout.flatMap((l) => {
    const m = s.inventory.items.find((i) => i.id === l.itemId && i.containerId === "diver" && i.quantity === 1 && moduleOfItem(i.kind));
    return m && !sys.sockets.some((e) => e.itemId === l.itemId) ? [{ socket: l.socket, itemId: l.itemId, kind: m.kind }] : [];
  });
  return {
    refusal: null, tier, power: sitePower(site), region: site.region, refit,
    missing: layout.filter((l) => !refit.some((r) => r.itemId === l.itemId)),
  };
}
export function deployOutpost(s: GameState, sys: SystemsState, kitItemId: string, position: Vec3,
  world: OutpostSiteQuery, rules: OutpostRules = {}): string | null {
  const p = deployPreview(s, sys, kitItemId, position, world, rules);
  if (p.refusal) return p.refusal;
  const packed = sys.packed.find((k) => k.itemId === kitItemId);
  const outpost: OutpostState = {
    id: kitItemId, tier: p.tier!, name: packed?.name ?? nextName(sys),
    position: { ...position }, region: p.region, power: p.power!,
  };
  s.inventory.items = s.inventory.items.filter((i) => i.id !== kitItemId);
  sys.packed = sys.packed.filter((k) => k !== packed);
  sys.outposts.push(outpost);
  s.inventory.containers.push({ id: outpostLockerId(outpost.id), kind: "locker", capacity: OUTPOST_TIERS[outpost.tier].lockerCu, ownerId: outpost.id });
  for (const r of p.refit) {
    s.inventory.items = s.inventory.items.filter((i) => i.id !== r.itemId);
    sys.sockets.push({ hostId: outpost.id, socket: r.socket, itemId: r.itemId, kind: r.kind });
    forgetRemembered(sys, r.itemId);
  }
  s.feedback = `${outpost.name} deployed · ${p.power} power${p.refit.length ? ` · ${p.refit.length} module${p.refit.length === 1 ? "" : "s"} refitted` : ""}${p.missing.length ? ` · ${p.missing.length} remembered module${p.missing.length === 1 ? " isn't" : "s aren't"} in your hold` : ""}.`;
  return null;
}
function nextName(sys: SystemsState): string {
  const used = new Set([...sys.outposts.map((o) => o.name), ...sys.packed.map((p) => p.name)]);
  for (let n = 1; ; n++) if (!used.has(`Outpost ${n}`)) return `Outpost ${n}`;
}
export function renameOutpost(sys: SystemsState, outpostId: string, name: string): string | null {
  const o = sys.outposts.find((o) => o.id === outpostId), clean = name.trim();
  if (!o) return "That outpost isn't deployed.";
  if (!clean || clean.length > 24) return "Names need 1–24 characters.";
  o.name = clean;
  return null;
}

export interface PackMove { itemId: string; kind: string; quantity: number; cu: number; from: string }
export interface PackPreview {
  refusal: string | null;
  outpostId: string;
  /** Kit kind and destination. */
  kit: string | null;
  to: string;
  /** Anchor and seal material spent by packing. */
  loss: SpendLine[];
  /** Locker contents that move with the pack. */
  locker: PackMove[];
  modules: PackMove[];
  /** In-progress work and what happens to it. */
  work: string[];
  needCu: number;
  freeCu: number;
}
/** Packing takes everything: locker contents, socketed modules and the kit all
 * move to `to`, and packing spends its tier's anchor material. Running decodes
 * and crops pause and travel with their module. Refused, with nothing changed,
 * when the material or the room isn't there. */
export function packPreview(s: GameState, sys: SystemsState, outpostId: string, to = "diver"): PackPreview {
  const base: PackPreview = { refusal: null, outpostId, kit: null, to, loss: [], locker: [], modules: [], work: [], needCu: 0, freeCu: 0 };
  const o = sys.outposts.find((o) => o.id === outpostId);
  if (!o) return { ...base, refusal: "That outpost isn't deployed." };
  const host = outpostHost(sys, o), tier = OUTPOST_TIERS[o.tier];
  base.kit = tier.kit;
  if (s.player.controlledVehicleId || s.player.interiorId || distance(s.player.pose.position, o.position) > OUTPOST_SITING.reach)
    return { ...base, refusal: `Work at ${o.name} to pack it.` };
  if (host.lockers.includes(to) || !accessible(s, sys, to)) return { ...base, refusal: "Pack into your hold or a reachable craft hold." };
  const sources = [...host.lockers, to];
  const loss = planSpend(s, tier.packLoss, sources);
  base.loss = loss.lines;
  const paid = new Map<string, number>();
  for (const l of loss.lines) paid.set(l.itemId, (paid.get(l.itemId) ?? 0) + l.quantity);
  base.locker = s.inventory.items.filter((i) => host.lockers.includes(i.containerId)).flatMap((i) => {
    const quantity = i.quantity - (paid.get(i.id) ?? 0);
    return quantity > 0 ? [{ itemId: i.id, kind: i.kind, quantity, cu: cuOf(i.kind) * quantity, from: i.containerId }] : [];
  });
  base.modules = sys.sockets.filter((e) => e.hostId === o.id)
    .map((e) => ({ itemId: e.itemId, kind: e.kind, quantity: 1, cu: cuOf(e.kind), from: e.socket }));
  base.work = workLines(sys, base.modules.map((m) => m.itemId));
  base.needCu = cuOf(tier.kit) + [...base.locker, ...base.modules].reduce((n, m) => n + m.cu, 0);
  const freedAtTo = loss.lines.filter((l) => l.from === to).reduce((n, l) => n + cuOf(l.kind) * l.quantity, 0);
  base.freeCu = freeCapacity(s, to) + freedAtTo;
  if (Object.keys(loss.missing).length)
    return { ...base, refusal: `Packing breaks the anchor seals: it spends ${costText(tier.packLoss)}. Bring ${costText(loss.missing)} in your hold or the outpost locker. Nothing packed.` };
  const refused = [...base.locker, ...base.modules].find((m) => !containerAccepts(s, to, m.kind));
  if (refused || !containerAccepts(s, to, tier.kit)) return { ...base, refusal: `${containerLabel(s, to)} can't take ${labelOf(refused?.kind ?? tier.kit).toLowerCase()}. Nothing packed.` };
  if (base.needCu > base.freeCu)
    return { ...base, refusal: `The kit, its ${base.modules.length} module${base.modules.length === 1 ? "" : "s"} and the locker contents need ${base.needCu} CU in ${containerLabel(s, to)}; it has ${base.freeCu} free. Empty the locker or pack into a craft hold. Nothing packed.` };
  return base;
}
function workLines(sys: SystemsState, moduleIds: readonly string[]): string[] {
  const lines: string[] = [];
  for (const j of sys.decodes.filter((j) => moduleIds.includes(j.moduleId))) {
    const pct = Math.floor(100 * j.progress / (DECODE_MINUTES[DECODABLES[j.decodable].size] * 60));
    lines.push(`Decode "${DECODABLES[j.decodable].label}" at ${pct}% pauses and travels with its decoder module. It resumes when the module is socketed again.`);
  }
  for (const p of sys.planters.filter((p) => moduleIds.includes(p.moduleId))) {
    const seed = SEEDS[p.seed], ready = p.progress >= seed.growSeconds;
    lines.push(ready ? `The ready ${seed.label.toLowerCase()} crop stays in its planter and can be harvested after redeploying.`
      : `The ${seed.label.toLowerCase()} crop at ${Math.floor(100 * p.progress / seed.growSeconds)}% stops growing while packed and carries on when the planter is socketed again.`);
  }
  return lines;
}
export function packOutpost(s: GameState, sys: SystemsState, outpostId: string, to = "diver"): string | null {
  const p = packPreview(s, sys, outpostId, to);
  if (p.refusal) return p.refusal;
  const o = sys.outposts.find((o) => o.id === outpostId)!;
  applySpend(s, p.loss);
  for (const m of p.locker) {
    const item = s.inventory.items.find((i) => i.id === m.itemId)!;
    item.containerId = to;
  }
  for (const m of p.modules) restoreInstance(s, m.itemId, m.kind, to);
  sys.packed.push({ itemId: o.id, tier: o.tier, name: o.name, layout: p.modules.map((m) => ({ socket: m.from, itemId: m.itemId })) });
  sys.sockets = sys.sockets.filter((e) => e.hostId !== o.id);
  restoreInstance(s, o.id, OUTPOST_TIERS[o.tier].kit, to);
  s.inventory.containers = s.inventory.containers.filter((c) => c.id !== outpostLockerId(o.id));
  sys.outposts = sys.outposts.filter((x) => x !== o);
  s.feedback = `${o.name} packed into ${containerLabel(s, to)} · spent ${p.loss.map((l) => `${l.quantity} × ${labelOf(l.kind)}`).join(", ")}${p.work.length ? ` · ${p.work.length} job${p.work.length === 1 ? "" : "s"} paused` : ""}.`;
  return null;
}

export interface UpgradePreview { refusal: string | null; from: OutpostTier | null; to: OutpostTier | null; cost: SpendLine[] }
/** Raises a deployed outpost one tier in place: more sockets, a bigger locker. */
export function upgradePreview(s: GameState, sys: SystemsState, outpostId: string): UpgradePreview {
  const o = sys.outposts.find((o) => o.id === outpostId);
  if (!o) return { refusal: "That outpost isn't deployed.", from: null, to: null, cost: [] };
  const next = OUTPOST_TIER_ORDER[OUTPOST_TIER_ORDER.indexOf(o.tier) + 1];
  if (!next) return { refusal: `${o.name} is already the highest tier.`, from: o.tier, to: null, cost: [] };
  const t = OUTPOST_TIERS[next], host = outpostHost(sys, o), cost = t.upgrade ?? {};
  if (!(s.knowledge.blueprints as readonly string[]).includes(t.bp)) return { refusal: `You need the ${t.label.toLowerCase()} plans.`, from: o.tier, to: next, cost: [] };
  if (s.player.controlledVehicleId || s.player.interiorId || distance(s.player.pose.position, o.position) > OUTPOST_SITING.reach)
    return { refusal: `Work at ${o.name} to upgrade it.`, from: o.tier, to: next, cost: [] };
  const plan = planSpend(s, cost, workContainers(s, sys, host));
  if (Object.keys(plan.missing).length)
    return { refusal: `Upgrading needs ${costText(cost)}; missing ${costText(plan.missing)}.`, from: o.tier, to: next, cost: plan.lines };
  return { refusal: null, from: o.tier, to: next, cost: plan.lines };
}
export function upgradeOutpost(s: GameState, sys: SystemsState, outpostId: string): string | null {
  const p = upgradePreview(s, sys, outpostId);
  if (p.refusal) return p.refusal;
  const o = sys.outposts.find((o) => o.id === outpostId)!;
  applySpend(s, p.cost);
  o.tier = p.to!;
  s.inventory.containers.find((c) => c.id === outpostLockerId(o.id))!.capacity = OUTPOST_TIERS[o.tier].lockerCu;
  s.feedback = `${o.name} upgraded · ${OUTPOST_TIERS[o.tier].sockets} sockets, ${OUTPOST_TIERS[o.tier].lockerCu} CU locker.`;
  return null;
}
/** Total quantity per kind across the inventory, installed modules and kits: a
 * conservation ledger for tests and the composed validator. */
export function conservedTotals(s: GameState, sys: SystemsState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of s.inventory.items) out[i.kind] = (out[i.kind] ?? 0) + i.quantity;
  for (const e of sys.sockets) out[e.kind] = (out[e.kind] ?? 0) + 1;
  for (const o of sys.outposts) out[OUTPOST_TIERS[o.tier].kit] = (out[OUTPOST_TIERS[o.tier].kit] ?? 0) + 1;
  return out;
}
