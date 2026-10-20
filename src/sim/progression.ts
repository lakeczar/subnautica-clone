import {
  EVIDENCE,
  EVIDENCE_BLUEPRINTS,
  FRAME_ALLOY,
  HULL_BUILD,
  HULL_HOLD_CU,
  HULL_REFITS,
  HULLS,
  ITEMS,
  HULL_COLLIDERS,
  OPTIONAL_RECORD,
  PLACES,
  RECIPES,
  RECOVERY_STAGE,
  SOURCES,
  TECH_RECORDS,
} from "../content/registry.js";
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
import { CREEL_CABIN, cabinHull, fittedCabin, hullToWorld, DIVER_LIFT_SECONDS } from "./fleet.js";
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
  nearWorkshop,
  nextId,
  spend,
  supportedServiceSite,
} from "./inventory.js";
import { makeVehicle } from "./state.js";
import { personalLimit as personalPressureLimit, safePersonalDepth } from "./capabilities.js";
import { RECOVERY_SURFACE_OPERATOR } from "../content/routes.js";
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
        position: { ...v.pose.position, y: v.pose.position.y + 0.6 },
        kind: "vehicle",
      });
  for (const v of s.fleet.vehicles)
    if (!v.berth && v.hull === "creel" && fittedCabin(s, v))
      targets.push({ id: `${v.id}:hatch`, label: "Creel cabin hatch", position: hullToWorld(CREEL_CABIN.hatchOutside, v), kind: "service" });
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
export function discover(s: GameState, id: EvidenceId): string {
  const def = EVIDENCE[id];
  if (!s.knowledge.evidence.some((e) => e.id === id))
    s.knowledge.evidence.push({ id, tick: s.tick, provenance: def.provenance });
  const add = (bp: GameState["knowledge"]["blueprints"][number]): void => {
    if (!s.knowledge.blueprints.includes(bp)) s.knowledge.blueprints.push(bp);
  };
  for (const bp of EVIDENCE_BLUEPRINTS[id]) add(bp);
  if (id === "C02") {
    if (!s.knowledge.scans.includes("filter_flow"))
      s.knowledge.scans.push("filter_flow");
  }
  if (id === "C04") {
    s.world.facilities.find((f) => f.id === "canopy_lab")!.repaired = true;
  }
  const place = def.place;
  if (!s.knowledge.markers.includes(place)) s.knowledge.markers.push(place);
  // The C04 field sheet's service log names the dark mooring: a known place after
  // the laboratory, exactly as migration appends it. Not a pin to new evidence.
  if (id === "C04" && !s.knowledge.markers.includes("canopy_stop")) s.knowledge.markers.push("canopy_stop");
  return `${def.label} recorded. ${def.lead}`;
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
  "restore" | "duplicate-hull" | "clearance" | "materials" | "rescue-low" | "space" | "equipment" | "refit";
const HULL_OUTPUTS: readonly string[] = ["dart", "creel"];
export const hullOutput = (r: Recipe): HullOutput | null =>
  HULL_OUTPUTS.includes(r.output) ? r.output as HullOutput : null;
/** The refit recipe's hull, if it is one. */
export const refitHull = (id: RecipeId): HullOutput | null =>
  id === "dart_350" ? "dart" : id === "creel_350" ? "creel" : null;
/** The owned hull a refit would modify: at the workshop cradle/slip, empty of crew. */
export function refitTarget(s: GameState, hull: HullOutput) {
  return s.fleet.vehicles.find((v) => v.hull === hull && !v.berth) ?? null;
}
export function atSite(s: GameState, site: Recipe["site"]): boolean {
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
    return block("needs", "Earlier service work or equipment is still required.");
  if (id === "suit_350" && (s.inventory.items.filter(i => i.fitted === "suit").length !== 1 ||
      !s.inventory.items.some(i => i.kind === "suit_150" && i.fitted === "suit" && i.containerId === "equipment" && i.quantity === 1)))
    return block("equipment", "Bring the one fitted 150 m suit for its paid refit. Nothing consumed.");
  if (!atSite(s, r.site) || (r.site === "island_workshop" && !!s.player.interiorId))
    return block("site", r.site === "canopy_stop" ? "Work at the outer-crown mooring's service mast." : "Use the fabrication bench at the required refuge.");
  if (
    (r.site === "pod_fabricator" && !facility(s, "pod_fabricator")) ||
    (r.site === "island_workshop" && id !== "restore_workshop" && !facility(s, "island_workshop"))
  )
    return block("restore", "Restore these fabrication services first.");
  const hull = hullOutput(r);
  if (hull && s.fleet.vehicles.some((v) => v.hull === hull))
    return block("duplicate-hull", `A ${HULLS[hull].label} already exists. Recover its frame or cargo instead of duplicating it.`);
  if (hull) {
    const build = HULL_BUILD[hull], shape = HULL_COLLIDERS[hull];
    const occupied = s.fleet.vehicles.some((v) => !v.berth &&
      Math.abs(v.pose.position.x - build.pose.x) < shape.radius + HULL_COLLIDERS[v.hull].radius &&
      Math.abs(v.pose.position.z - build.pose.z) < shape.radius + HULL_COLLIDERS[v.hull].radius &&
      Math.abs(v.pose.position.y - build.pose.y) < Math.max(shape.height, HULL_COLLIDERS[v.hull].height));
    if (occupied || !hullClearance(world, build.pose, shape))
      return block("clearance", hull === "creel" ? "The medium slip is not clear. Move any craft out of it. Nothing consumed."
        : "Construction clearance is blocked. Nothing consumed.");
  }
  const refit = refitHull(id);
  if (refit) {
    const v = refitTarget(s, refit);
    if (!v) return block("refit", `Bring the ${HULLS[refit].label} to the workshop for this hull refit.`);
    if (v.rating >= HULL_REFITS[refit].rating) return block("refit", `This ${HULLS[refit].label} is already rated ${v.rating} m.`);
    if (v.disabled) return block("refit", "Patch the disabled hull before refitting it.");
    if (s.player.controlledVehicleId === v.id || s.player.interiorId === v.id)
      return block("refit", "Leave the hull before its refit.");
    if (supportedServiceSite(s, v) !== "island_workshop")
      return block("refit", `Moor the ${HULLS[refit].label} in its workshop cradle or slip for the refit.`);
  }
  const bins = fabricationContainers(s, r.site);
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
    return block("materials", "Missing public materials. The bench uses your hold, its accessible locker, a nearby deployed buoy and craft at this site's supported cradle.");
  if (id === "strip_frame") {
    const after = structuredClone(s);
    spend(after, r.cost, bins);
    if (!hasRoom(after, "workshop_locker", ITEMS.structural_alloy.cu * FRAME_ALLOY))
      return block("space", `Stripped alloy goes to the workshop locker; it needs ${ITEMS.structural_alloy.cu * FRAME_ALLOY} CU. Nothing consumed.`);
  }
  if (r.output === "reserve_cell" || r.output === "salvage_buoy" || r.output === "dart_acoustic_trim" ||
      r.output === "creel_cargo_rack" || r.output === "creel_cabin") {
    const after = structuredClone(s);
    spend(after, r.cost, bins);
    const to = r.output === "creel_cargo_rack" || r.output === "creel_cabin" ? packageDestination(after) : "diver";
    if (!to || !hasRoom(after, to, ITEMS[r.output].cu * r.quantity))
      return block("space", r.output === "creel_cargo_rack" || r.output === "creel_cabin"
        ? `The ${ITEMS[r.output].cu} CU package needs room in the workshop locker or your hold. Nothing consumed.`
        : "Output would not fit your hold. Nothing consumed.");
  }
  return null;
}
/** Mount packages are bulky: the workshop locker first, then the diver hold. */
function packageDestination(s: GameState): string | null {
  const cu = ITEMS.creel_cabin.cu;
  return hasRoom(s, "workshop_locker", cu) ? "workshop_locker" : hasRoom(s, "diver", cu) ? "diver" : null;
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
  const bins = fabricationContainers(s, r.site);
  if (r.maintenance) {
    s.world.maintenance.alloy -= 2;
    s.world.maintenance.glass--;
    s.world.maintenance.membrane -= 3;
  } else spend(s, r.cost, bins);
  const hull = hullOutput(r), refit = refitHull(id);
  if (r.output === "pod_repair")
    s.world.facilities.find((f) => f.id === "pod_fabricator")!.repaired = true;
  else if (r.output === "restore_workshop")
    s.world.facilities.find((f) => f.id === "island_workshop")!.repaired = true;
  else if (r.output === "restore_canopy_stop")
    s.world.facilities.find((f) => f.id === "canopy_stop")!.repaired = true;
  else if (hull) {
    const vid = nextId(s, hull),
      cargoId = `${vid}_hold`,
      v = makeVehicle(vid, hull, HULL_BUILD[hull].pose, cargoId);
    v.pose.yaw = HULL_BUILD[hull].yaw;
    v.investment = { ...r.cost };
    s.fleet.vehicles.push(v);
    s.inventory.containers.push({
      id: cargoId,
      kind: "vehicle",
      capacity: HULL_HOLD_CU[hull],
      ownerId: vid,
    });
  } else if (refit) {
    // A paid refit is part of the frame: its materials return with any salvage.
    const v = refitTarget(s, refit)!;
    v.rating = HULL_REFITS[refit].rating;
    for (const [k, q] of Object.entries(r.cost) as [keyof typeof v.investment, number][])
      v.investment[k] = (v.investment[k] ?? 0) + q;
  } else if (id === "strip_frame") {
    addItem(s, "structural_alloy", FRAME_ALLOY, "workshop_locker");
  } else if (r.output === "suit_350") {
    // Refit the paid instance in place; its ID, fitting, container and earlier receipt survive.
    s.inventory.items.find(i => i.kind === "suit_150" && i.fitted === "suit")!.kind = "suit_350";
  } else if (r.output === "creel_cargo_rack" || r.output === "creel_cabin") {
    const to = packageDestination(s)!;
    const item = addItem(s, r.output, 1, to);
    // The cabin's own locker exists for as long as the cabin package does.
    if (r.output === "creel_cabin")
      s.inventory.containers.push({ id: `${item.id}_locker`, kind: "locker", capacity: 16, ownerId: item.id });
  } else {
    const fitted =
      r.output === "essential_tools"
        ? "tools"
        : r.output === "suit_150"
          ? "suit"
          : r.output === "bobbin_kit"
            ? "recovery"
            : null;
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
    : refit ? `${HULLS[refit].label} hull refitted · rated 350 m. Your suit limit is separate.`
    : id === "strip_frame" ? "Frame stripped · 8 structural alloy in the workshop locker."
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
export function hint(s: GameState): string {
  s.knowledge.hintLevel = Math.min(3, s.knowledge.hintLevel + 1);
  const has = (id: EvidenceId): boolean =>
    s.knowledge.evidence.some((e) => e.id === id);
  if (!has("C02") && !has("C03"))
    return s.knowledge.hintLevel === 1
      ? "Two visible leads: the twin reef ribs and Splitspine’s broken ridge."
      : "Face north from the pod ramp. The reef ribs lie to your left; the island landing lies ahead.";
  if (!has("C02"))
    return "Inspect the intake pipes beneath the twin curved reef ribs. Follow open fans to their downstream catches.";
  if (!has("C03"))
    return "Find the low workshop platform at the southern foot of the split island ridge. Its ledger is beside unused panels.";
  if (!s.knowledge.crafted.includes("dart_base"))
    return "Prepare at the pod: tools, 150 m suit, buoy, a meal and charged reserve cells. Recharge local cells at its restored bench. Restore the island workshop, then build the Dart in its clear launch cradle.";
  if (!has("C04"))
    return s.knowledge.hintLevel < 3
      ? "Follow the buoyant crowns east from the island. Quiet movement gives time to read the hunter’s warning."
      : "Use the open upper crowns, above 150 m. The laboratory is tucked against the tall cover rib; the clear upper flank leads back to the island.";
  if (!s.knowledge.crafted.includes("suit_350"))
    return "Bring four crust and four cured resin from the Canopy to the restored workshop for a 350 m suit refit, with two alloy and two membrane. Dart's 180 m hull reaches the first Basin shelf; your suit must protect the exit.";
  if (!has("C05") || !has("C06"))
    return "Follow the lower crowns to the fallen Basin dish. The flooded dormitory faces inward; a separate boundary station stands beside the southern dish. Both lie on the first shelf, with an open upper return east of the Canopy.";
  const creel = s.fleet.vehicles.find((v) => v.hull === "creel");
  if (has("C05") && !s.knowledge.crafted.includes("creel_base"))
    return "The dormitory rack's Creel plans are at the workshop bench: ten alloy, four glass, four membrane, four fin crust and two cured resin. It builds in the medium slip west of the landing; no Dart is required.";
  if (creel && !s.inventory.items.some((i) => i.kind === "creel_cargo_rack" || i.kind === "creel_cabin"))
    return "Make a cargo rack for bulk hauling or a refuge cabin for staying out, then fit it from Cargo with the Creel moored in its slip. Only one fits the major mount at a time.";
  if (creel && !facility(s, "canopy_stop"))
    return "Tagged frames rest on the Basin ridge beside the fallen dish. A Creel's tool arms load them without leaving the helm. One frame, two glass and two crust restore the dark mooring on the eastern Canopy margin.";
  return "Both Basin observations are retained. The fracture below the boundary station holds more frames past a 240 m hull; a 350 m refit or a suited lift from the lip reaches them. The upper return and local rescue guides remain available.";
}
export const personalLimit = (s: GameState): number =>
  personalPressureLimit(s);
export const discoveredPlace = (s: GameState, id: string): boolean =>
  s.knowledge.markers.includes(id as keyof typeof PLACES);
