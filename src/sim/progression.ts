import { LOST_SITES, WORLD_LOST_SITES } from "../content/systems/decodes.js";
import { isSeed, SEEDS } from "../content/systems/cultivation.js";
import type { FabricationSite } from "../content/registry.js";
import { HOST_REACH, moduleOfItem } from "../content/systems/hosts.js";
import { HOST_UPGRADES } from "../content/upgrades/hosts.js";
import { upgradeId } from "../content/upgrades/catalogue.js";
import {
  EVIDENCE,
  FRAME_ALLOY,
  HULL_BUILD,
  HULL_HOLD_CU,
  HULLS,
  ITEMS,
  HULL_COLLIDERS,
  OPTIONAL_RECORD,
  PLACES,
  RECIPES,
  RECOVERY_STAGE,
  REFIT_TIERS,
  SOURCES,
  SUIT_REFITS,
  TECH_RECORDS,
} from "../content/registry.js";
import { CAMPAIGN_PENDING, CAMPAIGN_SITES } from "../content/campaign/index.js";
import { STOP_RESTORATIONS, stopForSite, WORKING_STOPS, type WorkingStopId } from "../content/stops.js";
import { launchCarrier } from "./carrier.js";
import { isSuitProtection } from "./ecologyLink.js";
import type {
  EvidenceId,
  HullOutput,
  ItemKind,
  Recipe,
  RecipeId,
  SourceId,
  TechRecordId,
} from "../content/registry.js";
import { CANOPY_STOP } from "../content/routes.js";
import { CREEL_BOARDING, CREEL_CABIN, cabinHull, fittedCabin, hullToWorld, DIVER_LIFT_SECONDS } from "./fleet.js";
import type { GameState, Vec3, WorldQueries } from "./types.js";
import { hullClearance } from "./world.js";
import {
  addItem,
  available,
  containerAccessible,
  distance,
  equipped,
  fabricationContainers,
  facility,
  hasRoom,
  nearCanopyStop,
  nearPod,
  nearStop,
  stopWorks,
  nearWorkshop,
  nextId,
  spend,
  supportedServiceSite,
} from "./inventory.js";
import { makeVehicle } from "./state.js";
import { personalLimit as personalPressureLimit, safePersonalDepth } from "./capabilities.js";
import { RECOVERY_SURFACE_OPERATOR } from "../content/routes.js";
import { recordStory, storyInteractions } from "./storyLink.js";
export interface Interaction {
  id: string;
  label: string;
  position: Vec3;
  kind: "source" | "evidence" | "record" | "vehicle" | "cache" | "service";
}
/** Fixtures of the cabin the player stands in. Nothing outside is reachable. */
function cabinInteractions(s: GameState): Interaction[] {
  const v = cabinHull(s)!, f = CREEL_CABIN.fixtures;
  return ([["cabin:bunk", "Cabin bunk", f.bunk], ["cabin:cooker", "Galley cooker", f.cooker],
    ["cabin:locker", "Cabin locker", f.locker], ["cabin:helm", "Helm door", f.helm], ["cabin:hatch", "Aft hatch", f.hatch]] as const)
    .map(([id, label, local]) => ({ id, label, position: hullToWorld(local, v), kind: "service" as const }));
}
export function interactions(s: GameState): Interaction[] {
  if (cabinHull(s)) return cabinInteractions(s);
  const targets: Interaction[] = [
    ...Object.entries(SOURCES).map(([id, a]) => ({
      id,
      label: a.label,
      position: a.position,
      kind: "source" as const,
    })),
    ...Object.entries(EVIDENCE).map(([id, e]) => ({
      id,
      label: e.label,
      position: e.position,
      kind: "evidence" as const,
    })),
    {
      id: OPTIONAL_RECORD.id,
      label: OPTIONAL_RECORD.label,
      position: OPTIONAL_RECORD.position,
      kind: "record",
    },
    ...Object.entries(TECH_RECORDS).map(([id, r]) => ({
      id, label: r.label, position: r.position, kind: "record" as const,
    })),
    ...storyInteractions(s),
  ];
  targets.push(
    {
      id: "pod_services",
      label: "Pod locker / repair bench",
      position: { x: 1.5, y: 1, z: 20.5 },
      kind: "service",
    },
    {
      id: "workshop_services",
      label: "Workshop bench / berth",
      position: { x: 11, y: 2, z: -35 },
      kind: "service",
    },
    {
      id: "canopy_stop_services",
      label: "Outer-crown mooring / service mast",
      position: { ...CANOPY_STOP.work },
      kind: "service",
    },
    {
      id: "rescue_staging",
      label: "Shallow rescue staging / tether guides",
      // One local station has two real work faces. Keep the old submerged datum
      // and expose its surface operator through the same existing panel/action.
      position: { ...(distance(s.player.pose.position, RECOVERY_SURFACE_OPERATOR) < distance(s.player.pose.position, RECOVERY_STAGE)
        ? RECOVERY_SURFACE_OPERATOR : RECOVERY_STAGE) },
      kind: "service",
    },
  );
  for (const v of s.fleet.vehicles)
    if (!v.berth && v.hull !== "hearthline")
      targets.push({
        id: v.id,
        label: v.disabled || v.charge <= 0
          ? `${HULLS[v.hull].label} · disabled`
          : HULLS[v.hull].label,
        // A Creel boards at its raised pilot compartment, reachable from beside
        // the hull; the scout keeps its accepted low canopy datum.
        position: v.hull === "creel" ? hullToWorld(CREEL_BOARDING, v) : { ...v.pose.position, y: v.pose.position.y + 0.6 },
        kind: "vehicle",
      });
  for (const v of s.fleet.vehicles)
    if (!v.berth && v.hull === "creel" && fittedCabin(s, v))
      targets.push({ id: `${v.id}:hatch`, label: "Creel cabin hatch", position: hullToWorld(CREEL_CABIN.hatchOutside, v), kind: "service" });
  // C4: lost sites, field outposts and placed beacons.
  for (const id of WORLD_LOST_SITES)
    targets.push({ id: `lost:${id}`, label: LOST_SITES[id].label, position: LOST_SITES[id].position, kind: "record" });
  for (const o of s.systems.outposts)
    targets.push({ id: `outpost:${o.id}`, label: o.name, position: { ...o.position, y: o.position.y + 1 }, kind: "service" });
  for (const b of s.systems.beacons.filter((x) => x.source === "player"))
    targets.push({ id: `beacon:${b.id}`, label: `Beacon · ${b.name}`, position: b.position, kind: "service" });
  for (const c of s.recovery.caches)
    if (s.inventory.items.some((i) => i.containerId === c.containerId))
      targets.push({
        id: c.id,
        label: c.id.startsWith("canister_") ? "Salvage canister" : "Identified cargo cache",
        position: c.position,
        kind: "cache",
      });
  return targets;
}
/** C01–C06 discovery: the story adapter keeps their saved record and side effects. */
export function discover(s: GameState, id: EvidenceId): string {
  return recordStory(s, id);
}
/** Inspecting an ordinary technical record keeps it and grants its plans, once. */
export function readTechRecord(s: GameState, id: TechRecordId): string {
  if (!s.knowledge.scans.includes(id)) s.knowledge.scans.push(id);
  for (const bp of TECH_RECORDS[id].blueprints)
    if (!s.knowledge.blueprints.includes(bp)) s.knowledge.blueprints.push(bp);
  return `${TECH_RECORDS[id].label} · ${TECH_RECORDS[id].text}`;
}
export function completeOpening(s: GameState): void {
  if (s.opening.phase === 4) return;
  s.opening = { phase: 4, phaseTicks: 0 };
  s.player.pose = {
    frame: "world",
    position: { x: 0, y: 0.18, z: 21.2 },
    yaw: 0,
    pitch: -0.05,
  };
  s.player.velocity = { x: 0, y: 0, z: 0 };
  discover(s, "C01");
  s.feedback =
    "The pod is safe to breathe in. Repair the regulator with alloy, glass and shed membrane. Choose the reef ribs or Splitspine shore.";
}
export interface CollectionOutcome {
  refusal: string | null;
  pickup: { item: ItemKind; quantity: number; destination: string } | null;
}
/** The sole collection mutation path; tending starts have no pickup receipt. */
export function collectWithOutcome(s: GameState, id: SourceId): CollectionOutcome {
  const refused = (refusal: string): CollectionOutcome => ({ refusal, pickup: null });
  const def = SOURCES[id],
    node = s.world.resources.find((n) => n.id === id);
  if (!node) return refused("This source is not available.");
  if (
    s.player.controlledVehicleId ||
    distance(s.player.pose.position, def.position) > 4
  )
    return refused("Exit with adequate personal protection and approach the source.");
  if (!safePersonalDepth(s)) return refused(`This work exceeds your ${personalPressureLimit(s)} m personal suit. Return to safe depth and refit before collecting.`);
  if (def.item === "tagged_frame") {
    if (node.stock === 0) return refused("Every tagged frame here has been lifted. Frames do not return.");
    if (!equipped(s, "essential_tools")) return refused("Cut the frame straps with the service tool. Fabricate it at the pod.");
    if (!frameDestination(s)) return refused("A tagged frame needs 10 CU: clear your hold, deploy the buoy, or bring a Creel alongside. Nothing lifted.");
    s.world.action = { sourceId: id, seconds: DIVER_LIFT_SECONDS, kind: "lift" };
    return { refusal: null, pickup: null };
  }
  // Specimen seeds tear by hand; only a Hush specimen bay takes them intact.
  if (isSeed(def.item) && SEEDS[def.item].sampling === "specimen")
    return refused("These spores tear when handled. A Hush with a specimen bay samples them intact.");
  if (node.stock === 0) {
    if (def.item === "meal") {
      s.world.action = { sourceId: id, seconds: 20, kind: "food" };
      return { refusal: null, pickup: null };
    }
    return refused("Exposed stock is exhausted. Survey the matching second patch, or sort this host’s finite reserve.");
  }
  const n = Math.min(def.bundle, node.stock);
  const destination = hasRoom(s, "diver", ITEMS[def.item].cu * n)
    ? "diver"
    : containerAccessible(s, "buoy_hold") &&
        hasRoom(s, "buoy_hold", ITEMS[def.item].cu * n)
      ? "buoy_hold"
      : null;
  if (!destination)
    return refused("No room for this bundle. Stow cargo, or deploy the 24 CU salvage buoy. Nothing collected.");
  addItem(s, def.item, n, destination);
  node.stock -= n;
  s.metrics.collections++;
  if (!s.knowledge.scans.includes(id)) s.knowledge.scans.push(id);
  s.feedback = `${n} × ${ITEMS[def.item].label} → ${destination === "diver" ? "diver hold" : "buoy"}. ${def.context}`;
  return { refusal: null, pickup: { item: def.item, quantity: n, destination } };
}
export function collect(s: GameState, id: SourceId): string | null {
  return collectWithOutcome(s, id).refusal;
}
/** Where a diver-lifted frame lands: an alongside powered Creel's arms take it,
 * otherwise the diver hold, otherwise a nearby deployed buoy. */
export function frameDestination(s: GameState): string | null {
  const cu = ITEMS.tagged_frame.cu;
  const creel = s.fleet.vehicles.filter((v) => v.hull === "creel" && !v.berth && !v.disabled && v.charge >= 4 &&
    distance(v.pose.position, s.player.pose.position) < 8 && hasRoom(s, v.cargoId, cu))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (creel) return creel.cargoId;
  if (hasRoom(s, "diver", cu)) return "diver";
  return containerAccessible(s, "buoy_hold") && hasRoom(s, "buoy_hold", cu) ? "buoy_hold" : null;
}
export type CraftingBlockCode = "opening" | "blueprint" | "completed" | "needs" | "site" |
  "restore" | "duplicate-hull" | "clearance" | "materials" | "rescue-low" | "space" | "equipment" | "refit" | "unplaced";
const HULL_OUTPUTS: readonly string[] = ["dart", "creel", "hush", "spindle", "mantle", "hearthline"];
export const hullOutput = (r: Recipe): HullOutput | null =>
  HULL_OUTPUTS.includes(r.output) ? r.output as HullOutput : null;
/** A paid hull refit tier, if the recipe is one. */
export const refitTier = (id: RecipeId) => Object.hasOwn(REFIT_TIERS, id) ? REFIT_TIERS[id as keyof typeof REFIT_TIERS] : null;
/** The refit recipe's hull. */
export const refitHull = (id: RecipeId): HullOutput | null => refitTier(id)?.hull ?? null;
/** An in-place suit refit tier, if the recipe is one. */
export const suitRefit = (id: RecipeId) => Object.hasOwn(SUIT_REFITS, id) ? SUIT_REFITS[id as keyof typeof SUIT_REFITS] : null;
/** Why a registered campaign recipe cannot run yet: its site, hull or fitting is
 * composed with the later world (S9 handoff). Null when it is executable. */
export function pendingCampaignWork(id: RecipeId): string | null {
  const why = CAMPAIGN_PENDING[id as keyof typeof CAMPAIGN_PENDING];
  if (!why) return null;
  const site = RECIPES[id].site;
  const place = Object.hasOwn(CAMPAIGN_SITES, site) ? CAMPAIGN_SITES[site as keyof typeof CAMPAIGN_SITES].label : null;
  return why === "fitting" ? "Plans recorded. This fitting is not available to fabricate yet."
    : `Plans recorded. This work is done at the ${place ?? "yard"}, which is not reachable yet.`;
}
/** The owned hull a refit would modify: at the workshop cradle/slip, empty of crew. */
export function refitTarget(s: GameState, hull: HullOutput) {
  return s.fleet.vehicles.find((v) => v.hull === hull && !v.berth) ?? null;
}
const restorationOf = (stop: WorkingStopId): string | null =>
  (Object.keys(STOP_RESTORATIONS) as (keyof typeof STOP_RESTORATIONS)[]).find((r) => STOP_RESTORATIONS[r] === stop) ?? null;
/** C4 (M2 audit #3): restored stops do the refits for their own tier, so the
 * deep refits no longer send every player back to the island workshop. */
export const REFIT_STOP_SITES: Readonly<Partial<Record<RecipeId, readonly FabricationSite[]>>> = {
  suit_350: ["canopy_stop"], dart_350: ["canopy_stop"], creel_350: ["canopy_stop"], hush_350: ["canopy_stop"],
  suit_450: ["rift_station"], creel_450: ["rift_station"], dart_450: ["rift_station"], hush_450: ["rift_station"],
  suit_800: ["divide_dock"], creel_800: ["divide_dock"],
};
/** Every site a recipe runs at: its bench, then the stops that share its work. */
export const recipeSites = (id: RecipeId): readonly FabricationSite[] => [RECIPES[id].site, ...(REFIT_STOP_SITES[id] ?? [])];
/** A field outpost with a powered small-fabricator module the diver is at (C4):
 * it runs the pod bench's recipes, paid from the diver hold and its lockers. */
export function outpostBench(s: GameState): { id: string; lockers: string[] } | null {
  if (s.player.controlledVehicleId || s.player.interiorId) return null;
  for (const o of s.systems.outposts) {
    if (distance(o.position, s.player.pose.position) > HOST_REACH) continue;
    const mods = s.systems.sockets.filter((e) => e.hostId === o.id);
    if (!mods.some((e) => moduleOfItem(e.kind) === "fabricator")) continue;
    const lockers = [`${o.id}_locker`, ...mods.filter((e) => moduleOfItem(e.kind) === "locker").map((e) => `${e.itemId}_locker`)];
    const powered = o.power !== "cells" || s.inventory.items.some((i) => lockers.includes(i.containerId) &&
      (i.kind === "reserve_cell" || i.kind === "bio_cell") && (i.charge ?? 0) > 0);
    if (powered) return { id: o.id, lockers };
  }
  return null;
}
/** The site the diver is working this recipe at now: the first listed site in
 * reach, else the recipe's own bench (whose refusal names it). */
export function craftSite(s: GameState, id: RecipeId): FabricationSite {
  return recipeSites(id).find((site) => atSite(s, site)) ?? RECIPES[id].site;
}
const usesOutpostBench = (s: GameState, id: RecipeId): boolean =>
  RECIPES[id].site === "pod_fabricator" && !atSite(s, "pod_fabricator") && outpostBench(s) !== null;
const benchBins = (s: GameState, id: RecipeId): string[] =>
  usesOutpostBench(s, id) ? ["diver", ...outpostBench(s)!.lockers] : fabricationContainers(s, craftSite(s, id));
export function atSite(s: GameState, site: Recipe["site"]): boolean {
  const stop = stopForSite(site);
  if (stop) return nearStop(s, stop);
  return site === "island_workshop" ? nearWorkshop(s) && !s.player.interiorId
    : site === "canopy_stop" ? nearCanopyStop(s) : nearPod(s);
}
export function craftingBlock(
  s: GameState,
  id: RecipeId,
  world: WorldQueries,
): { code: CraftingBlockCode; message: string } | null {
  const block = (code: CraftingBlockCode, message: string): { code: CraftingBlockCode; message: string } => ({ code, message });
  const r: Recipe = RECIPES[id];
  if (s.opening.phase < 4) return block("opening", "Finish the pod checks first.");
  if (!s.knowledge.blueprints.includes(r.bp))
    return block("blueprint", "Blueprint unknown. Investigate the intake and workshop records.");
  if (r.once && s.knowledge.crafted.includes(id))
    return block("completed", "Already completed. The fabricated equipment or restored service is retained.");
  if (!r.needs.every((n) => s.knowledge.crafted.includes(n as RecipeId)))
    return block("needs", "Needs earlier work first.");
  const pending = pendingCampaignWork(id);
  if (pending) return block("unplaced", pending);
  const suit = suitRefit(id);
  if (suit && (s.inventory.items.filter(i => i.fitted === "suit").length !== 1 ||
      !s.inventory.items.some(i => i.kind === suit.from && i.fitted === "suit" && i.containerId === "equipment" && i.quantity === 1)))
    return block("equipment", `Bring the one fitted ${ITEMS[suit.from].label.replace(/ (refitted )?pressure suit$/, "")} suit for its paid refit. Nothing consumed.`);
  const site = craftSite(s, id), outpost = usesOutpostBench(s, id);
  const stop = stopForSite(site);
  if (!outpost && (!atSite(s, site) || (site === "island_workshop" && !!s.player.interiorId))) {
    const alt = (REFIT_STOP_SITES[id] ?? []).map((x) => { const k = stopForSite(x); return x === "canopy_stop" ? "the outer-crown mooring" : k ? `the ${WORKING_STOPS[k].label}` : x; });
    return block("site", site === "canopy_stop" ? "Work at the outer-crown mooring's service mast."
      : stop ? `Work at the ${WORKING_STOPS[stop].label}.`
      : alt.length ? `Use the island workshop bench or ${alt.join(" or ")}.` : "Use this recipe’s bench.");
  }
  // A restored stop's other work waits for its restoration.
  if (stop && !stopWorks(s, stop) && r.output !== restorationOf(stop))
    return block("restore", `Restore the ${WORKING_STOPS[stop].label} first.`);
  if (
    (site === "pod_fabricator" && !outpost && !facility(s, "pod_fabricator")) ||
    (site === "island_workshop" && id !== "restore_workshop" && !facility(s, "island_workshop")) ||
    (site === "canopy_stop" && id !== "restore_canopy_stop" && !facility(s, "canopy_stop"))
  )
    return block("restore", "Restore these fabrication services first.");
  const hull = hullOutput(r);
  if (hull && s.fleet.vehicles.some((v) => v.hull === hull))
    return block("duplicate-hull", `A ${HULLS[hull].label} already exists. Recover its frame or cargo instead of duplicating it.`);
  if (id === "hearthline_keel" && s.knowledge.crafted.includes("hearthline_keel") && !s.fleet.vehicles.some((v) => v.hull === "hearthline"))
    return block("duplicate-hull", "The Hearthline keel is already laid in the yard berth. Fit it out.");
  if (hull) {
    const build = HULL_BUILD[hull], shape = HULL_COLLIDERS[hull];
    const occupant = s.fleet.vehicles.find((v) => !v.berth &&
      Math.abs(v.pose.position.x - build.pose.x) < shape.radius + HULL_COLLIDERS[v.hull].radius &&
      Math.abs(v.pose.position.z - build.pose.z) < shape.radius + HULL_COLLIDERS[v.hull].radius &&
      Math.abs(v.pose.position.y - build.pose.y) < Math.max(shape.height, HULL_COLLIDERS[v.hull].height));
    if (occupant || !hullClearance(world, build.pose, shape))
      return block("clearance", hull === "creel" ? "The medium slip is not clear. Move any craft out of it. Nothing consumed."
        : occupant ? `The ${HULLS[occupant.hull].label} sits in the ${HULLS[hull].label}'s build slip. Move it out (the yard mooring is west of the cradles). Nothing consumed.`
        : "Construction clearance is blocked. Nothing consumed.");
  }
  const refit = refitHull(id), tier = refitTier(id);
  if (refit && tier) {
    const v = refitTarget(s, refit);
    if (!v) return block("refit", `Bring the ${HULLS[refit].label} to the workshop for this hull refit.`);
    if (v.rating >= tier.rating) return block("refit", `This ${HULLS[refit].label} is already rated ${v.rating} m.`);
    if (v.rating !== tier.from) return block("refit", `Refit this ${HULLS[refit].label} to ${tier.from} m first.`);
    if (v.disabled) return block("refit", "Patch the disabled hull before refitting it.");
    if (s.player.controlledVehicleId === v.id || s.player.interiorId === v.id)
      return block("refit", "Leave the hull before its refit.");
    const refitSite = site;
    if (refit === "hearthline" && (s.player.controlledVehicleId === v.id || s.player.interiorId === v.id))
      return block("refit", "Leave the carrier before its refit.");
    if (supportedServiceSite(s, v) !== refitSite)
      return block("refit", refitSite === "stack_yard" ? `Moor the ${HULLS[refit].label} in the yard berth for the refit.`
        : refitSite === "island_workshop" ? `Moor the ${HULLS[refit].label} in its workshop cradle or slip for the refit.`
        : `Moor the ${HULLS[refit].label} at this stop's service mooring for the refit.`);
  }
  const bins = benchBins(s, id);
  if (r.maintenance) {
    if (
      s.world.maintenance.alloy < 2 ||
      s.world.maintenance.glass < 1 ||
      s.world.maintenance.membrane < 3
    )
      return block("rescue-low", "Rescue stock is low. Sort recovery supplies at the shallow intake.");
  } else if (
    Object.entries(r.cost).some(
      ([kind, n]) => available(s, kind as ItemKind, bins) < n,
    )
  )
    return block("materials", "Missing materials at this bench.");
  if (id === "strip_frame") {
    const after = structuredClone(s);
    spend(after, r.cost, bins);
    if (!hasRoom(after, "workshop_locker", ITEMS.structural_alloy.cu * FRAME_ALLOY))
      return block("space", `Stripped alloy goes to the workshop locker; it needs ${ITEMS.structural_alloy.cu * FRAME_ALLOY} CU. Nothing consumed.`);
  }
  // Every carried output (C3-R1-1): after the ingredients are spent, the whole
  // output must fit where craft() puts it, or nothing is consumed.
  const placement = outputPlacement(id);
  if (placement === "package" || placement === "diver") {
    const after = structuredClone(s);
    if (!r.maintenance) spend(after, r.cost, bins);
    const to = placement === "package" ? packageDestination(after, site, ITEMS[r.output as ItemKind].cu) : "diver";
    if (!to || !hasRoom(after, to, ITEMS[r.output as ItemKind].cu * r.quantity))
      return block("space", placement === "package"
        ? `The ${ITEMS[r.output as ItemKind].cu} CU package needs room in ${site === "island_workshop" ? "the workshop" : "this site's"} locker or your hold. Nothing consumed.`
        : "Output would not fit your hold. Nothing consumed.");
  }
  return null;
}
/** The fitting slot of an output that is worn rather than carried. */
function outputFitting(output: string): "tools" | "suit" | "recovery" | "protection" | null {
  return output === "essential_tools" ? "tools" : output === "suit_150" ? "suit" : output === "bobbin_kit" ? "recovery"
    : isSuitProtection(output) ? "protection" : null;
}
/** Where craft() puts a recipe's output: a facility, hull or in-place change
 * ("none"), a fitting ("equipment"), a mount package, or the diver hold. */
export function outputPlacement(id: RecipeId): "none" | "equipment" | "package" | "diver" {
  const r: Recipe = RECIPES[id];
  if (["pod_repair", "restore_workshop", "restore_canopy_stop", "restore_rift_station", "restore_divide_stop",
    "hearthline_keel", "pod_buffer"].includes(r.output) || hullOutput(r) || refitHull(id) || suitRefit(id) || id === "strip_frame")
    return "none";
  if (Object.hasOwn(HOST_UPGRADES, r.output)) return "none";
  if (r.output === "creel_cargo_rack" || r.output === "creel_cabin") return "package";
  if (upgradeId(r.output) && ITEMS[r.output as ItemKind].cu === 0) return "none";
  return outputFitting(r.output) ? "equipment" : "diver";
}
/** Mount packages are bulky: the workshop locker first, then the diver hold. */
function packageDestination(s: GameState, site: FabricationSite = "island_workshop", cu: number = ITEMS.creel_cabin.cu): string | null {
  const stop = stopForSite(site), locker = site === "island_workshop" ? "workshop_locker" : stop ? WORKING_STOPS[stop].locker : null;
  return locker && hasRoom(s, locker, cu) ? locker : hasRoom(s, "diver", cu) ? "diver" : null;
}
export function craftingRefusal(s: GameState, id: RecipeId, world: WorldQueries): string | null {
  return craftingBlock(s, id, world)?.message ?? null;
}
export function craft(
  s: GameState,
  id: RecipeId,
  world: WorldQueries,
): string | null {
  const no = craftingRefusal(s, id, world);
  if (no) return no;
  const r: Recipe = RECIPES[id];
  const bins = benchBins(s, id), site = craftSite(s, id);
  if (r.maintenance) {
    s.world.maintenance.alloy -= 2;
    s.world.maintenance.glass--;
    s.world.maintenance.membrane -= 3;
  } else spend(s, r.cost, bins);
  const hull = hullOutput(r), refit = refitHull(id), tier = refitTier(id), suit = suitRefit(id);
  if (r.output === "pod_repair")
    s.world.facilities.find((f) => f.id === "pod_fabricator")!.repaired = true;
  else if (r.output === "restore_workshop")
    s.world.facilities.find((f) => f.id === "island_workshop")!.repaired = true;
  else if (r.output === "restore_canopy_stop")
    s.world.facilities.find((f) => f.id === "canopy_stop")!.repaired = true;
  else if (r.output === "restore_rift_station" || r.output === "restore_divide_stop")
    s.world.facilities.find((f) => f.id === STOP_RESTORATIONS[r.output as keyof typeof STOP_RESTORATIONS])!.repaired = true;
  else if (r.output === "hearthline_keel") { /* The laid keel is a recorded stage; the fit-out launches the hull. */ }
  else if (r.output === "pod_buffer") {
    if (!s.story.works.repairs.includes("pod_buffer")) s.story.works.repairs.push("pod_buffer");
  }
  else if (hull) {
    const vid = nextId(s, hull),
      cargoId = `${vid}_hold`,
      v = makeVehicle(vid, hull, HULL_BUILD[hull].pose, cargoId);
    v.pose.yaw = HULL_BUILD[hull].yaw;
    v.investment = { ...r.cost };
    // The carrier's frame is both stages: the laid keel and the fit-out.
    if (hull === "hearthline") for (const [k, q] of Object.entries(RECIPES.hearthline_keel.cost) as [keyof typeof v.investment, number][])
      v.investment[k] = (v.investment[k] ?? 0) + q;
    s.fleet.vehicles.push(v);
    s.inventory.containers.push({
      id: cargoId,
      kind: "vehicle",
      capacity: HULL_HOLD_CU[hull],
      ownerId: vid,
    });
    if (hull === "hearthline") launchCarrier(s, v);
  } else if (refit) {
    // A paid refit is part of the frame: its materials return with any salvage.
    const v = refitTarget(s, refit)!;
    v.rating = tier!.rating;
    for (const [k, q] of Object.entries(r.cost) as [keyof typeof v.investment, number][])
      v.investment[k] = (v.investment[k] ?? 0) + q;
  } else if (id === "strip_frame") {
    addItem(s, "structural_alloy", FRAME_ALLOY, "workshop_locker");
  } else if (suit) {
    // Refit the paid instance in place; its ID, fitting, container and earlier receipt survive.
    s.inventory.items.find(i => i.kind === suit.from && i.fitted === "suit")!.kind = r.output as ItemKind;
  } else if (Object.hasOwn(HOST_UPGRADES, r.output)) {
    // Host knowledge (outpost network, chart fix): held like a plan in `crafted`.
  } else if (upgradeId(r.output) && ITEMS[r.output as ItemKind].cu === 0) {
    // A carrier structure retrofit is built into the hull at the yard.
    const v = s.fleet.vehicles.find((a) => a.hull === "hearthline");
    if (v) { const item = addItem(s, r.output as ItemKind, 1, v.cargoId, "mount"); v.modules.push(item.id); }
  } else if (r.output === "creel_cargo_rack" || r.output === "creel_cabin") {
    const to = packageDestination(s, site, ITEMS[r.output as ItemKind].cu)!;
    const item = addItem(s, r.output as ItemKind, 1, to);
    // The cabin's own locker exists for as long as the cabin package does.
    if (r.output === "creel_cabin")
      s.inventory.containers.push({ id: `${item.id}_locker`, kind: "locker", capacity: 16, ownerId: item.id });
  } else {
    const fitted = outputFitting(r.output);
    for (let q = 0; q < r.quantity; q++) {
      const item = addItem(
        s,
        r.output as ItemKind,
        1,
        fitted ? "equipment" : "diver",
        fitted,
        r.maintenance ? "maintenance" : "public",
      );
      if (r.output === "salvage_buoy") s.inventory.buoy.itemId = item.id;
    }
  }
  if (!s.knowledge.crafted.includes(id)) s.knowledge.crafted.push(id);
  s.feedback = id === "dart_acoustic_trim"
    ? "Acoustic trim made · fit it from Cargo at the pod or workshop cradle."
    : id === "creel_base" ? "Creel built in the medium slip west of the landing. Board it from the cockpit side."
    : id === "creel_cargo_rack" || id === "creel_cabin"
      ? `${ITEMS[r.output as ItemKind].label} made · stowed in ${s.inventory.items.some((i) => i.kind === r.output && i.containerId === "workshop_locker") ? "the workshop locker" : "your hold"}. Fit it from Cargo with the Creel at a supported mooring.`
    : refit ? `${HULLS[refit].label} hull refitted · rated ${tier!.rating} m. Your suit limit is separate.`
    : id === "hearthline_keel" ? "Hearthline keel laid in the yard berth: frame spine and pontoons. Fit it out here to launch the carrier."
    : id === "hearthline_base" ? "Hearthline launched in the yard berth: dry rooms, two berths, galley and fabrication. Take the helm from the bridge."
    : hull && hull !== "dart" && hull !== "creel" ? `${HULLS[hull].label} built on the yard slip · board it from its access side.`
    : id === "restore_rift_station" || id === "restore_divide_stop"
      ? `${WORKING_STOPS[id === "restore_rift_station" ? "rift_station" : "divide_dock"].label} restored · ${WORKING_STOPS[id === "restore_rift_station" ? "rift_station" : "divide_dock"].offers}.`
    : suit && id !== "suit_350" ? `Suit refitted · ${suit.rating} m personal limit. Hull ratings are separate.`
    : id === "strip_frame" ? "Frame stripped · 8 structural alloy in the workshop locker."
    : id === "pod_buffer" ? "Dispatch buffer fitted beside the regulator. Its log is readable now."
    : id === "restore_canopy_stop" ? "Outer-crown mooring restored · hull service, cell charging, a 48 CU locker and mount changes here. No air: the laboratory pocket remains the Canopy's refuge."
    : `${r.label} complete. ${id === "restore_workshop" ? "Air, healing, locker, charging and hull fabrication are now available." : id === "dart_base" ? "Dart is in the yellow launch cradle. Board it from the cockpit side." : ""}`;
  return null;
}
export function toggleBuoy(s: GameState): string | null {
  const b = s.inventory.buoy,
    item = s.inventory.items.find((i) => i.id === b.itemId);
  if (!item) return "Fabricate the reusable buoy at the pod first.";
  if (b.deployed) {
    if (
      distance(s.player.pose.position, b.position) > 6 ||
      s.inventory.items.some((i) => i.containerId === "buoy_hold")
    )
      return "Empty the buoy and approach its collar before packing it.";
    if (!hasRoom(s, "diver", 2))
      return "Make 2 CU room before packing the buoy.";
    item.containerId = "diver";
    item.fitted = null;
    b.deployed = false;
  } else {
    if (item.containerId !== "diver")
      return "Carry the packed buoy before deploying it.";
    b.deployed = true;
    b.position = { ...s.player.pose.position };
    item.containerId = "equipment";
    item.fitted = "buoy";
  }
  s.feedback = b.deployed
    ? "Buoy deployed. Its cargo is a separate 24 CU container; it follows your local tow collar."
    : "Empty buoy packed.";
  return null;
}
export const personalLimit = (s: GameState): number =>
  personalPressureLimit(s);
export const discoveredPlace = (s: GameState, id: string): boolean =>
  s.knowledge.markers.includes(id as keyof typeof PLACES);
