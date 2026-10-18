import {
  DART_BUILD_POSE,
  DART_BUILD_YAW,
  EVIDENCE,
  HULLS,
  ITEMS,
  HULL_COLLIDERS,
  OPTIONAL_RECORD,
  PLACES,
  RECIPES,
  SOURCES,
} from "../content/registry.js";
import type {
  EvidenceId,
  ItemKind,
  Recipe,
  RecipeId,
  SourceId,
} from "../content/registry.js";
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
  nearPod,
  nearWorkshop,
  nextId,
  spend,
} from "./inventory.js";
import { makeVehicle } from "./state.js";
export interface Interaction {
  id: string;
  label: string;
  position: Vec3;
  kind: "source" | "evidence" | "record" | "vehicle" | "cache" | "service";
}
export function interactions(s: GameState): Interaction[] {
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
      id: "rescue_staging",
      label: "Shallow rescue staging / tether guides",
      position: { x: 46, y: -12, z: -54 },
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
  for (const c of s.recovery.caches)
    if (s.inventory.items.some((i) => i.containerId === c.containerId))
      targets.push({
        id: c.id,
        label: "Identified cargo cache",
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
  if (id === "C01") add("bp_pod_checklist");
  if (id === "C02") {
    add("bp_reef_recovery");
    if (!s.knowledge.scans.includes("filter_flow"))
      s.knowledge.scans.push("filter_flow");
  }
  if (id === "C03") {
    add("bp_island_workshop");
    add("bp_carrier_workshop");
  }
  if (id === "C04") {
    add("bp_canopy_reinforcement");
    s.world.facilities.find((f) => f.id === "canopy_lab")!.repaired = true;
  }
  const place = def.place;
  if (!s.knowledge.markers.includes(place)) s.knowledge.markers.push(place);
  return `${def.label} recorded. ${def.lead}`;
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
export type CraftingBlockCode = "opening" | "blueprint" | "completed" | "needs" | "site" |
  "restore" | "duplicate-hull" | "clearance" | "materials" | "rescue-low" | "space";
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
  if (r.site === "island_workshop" ? !nearWorkshop(s) || !!s.player.interiorId : !nearPod(s))
    return block("site", "Use the fabrication bench at the required refuge.");
  if (
    (r.site === "pod_fabricator" && !facility(s, "pod_fabricator")) ||
    (r.site === "island_workshop" && id !== "restore_workshop" && !facility(s, "island_workshop"))
  )
    return block("restore", "Restore these fabrication services first.");
  if (id === "dart_base" && s.fleet.vehicles.some((v) => v.hull === "dart"))
    return block("duplicate-hull", "A Dart already exists. Recover its frame or cargo instead of duplicating it.");
  if (
    id === "dart_base" &&
    !hullClearance(world, DART_BUILD_POSE, HULL_COLLIDERS.dart)
  )
    return block("clearance", "Construction clearance is blocked. Nothing consumed.");
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
  if (r.output === "reserve_cell" || r.output === "salvage_buoy" || r.output === "dart_acoustic_trim") {
    const after = structuredClone(s);
    spend(after, r.cost, bins);
    if (!hasRoom(after, "diver", ITEMS[r.output].cu * r.quantity))
      return block("space", "Output would not fit your hold. Nothing consumed.");
  }
  return null;
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
  if (r.maintenance) {
    s.world.maintenance.alloy -= 2;
    s.world.maintenance.glass--;
    s.world.maintenance.membrane -= 3;
  } else spend(s, r.cost, fabricationContainers(s, r.site));
  if (r.output === "pod_repair")
    s.world.facilities.find((f) => f.id === "pod_fabricator")!.repaired = true;
  else if (r.output === "restore_workshop")
    s.world.facilities.find((f) => f.id === "island_workshop")!.repaired = true;
  else if (r.output === "dart") {
    const vid = nextId(s, "dart"),
      cargoId = `${vid}_hold`,
      v = makeVehicle(vid, "dart", DART_BUILD_POSE, cargoId);
    v.pose.yaw = DART_BUILD_YAW;
    v.investment = { ...r.cost };
    s.fleet.vehicles.push(v);
    s.inventory.containers.push({
      id: cargoId,
      kind: "vehicle",
      capacity: 32,
      ownerId: vid,
    });
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
        r.output,
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
    : `${r.label} complete. ${id === "restore_workshop" ? "Air, healing, locker, charging and hull fabrication are now available." : id === "dart_base" ? "Dart is in the yellow launch cradle. Approach the cockpit side and board deliberately." : ""}`;
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
  return "The field sheet points toward Basin survey dishes, a future expedition in this build. For now, bring two crust and two resin back to the workshop for optional Dart acoustic trim. Fit it at the cradle for faster quiet travel, with less boost speed.";
}
export const personalLimit = (s: GameState): number =>
  equipped(s, "suit_150") ? 150 : 60;
export const discoveredPlace = (s: GameState, id: string): boolean =>
  s.knowledge.markers.includes(id as keyof typeof PLACES);
