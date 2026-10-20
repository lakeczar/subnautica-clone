/** Live phases: New Game through the Basin, the Creel and C1's story, played
 * against today's world. Both fleet strategies share them. */
import { RECIPES, SOURCES } from "../../src/content/registry.js";
import type { ItemKind, RecipeId, SourceId } from "../../src/content/registry.js";
import { BASIN_GEOMETRY, CANOPY_BASIN_ROUTE, CANOPY_STOP, RECOVERY_SURFACE_OPERATOR } from "../../src/content/routes.js";
import { available } from "../../src/sim/inventory.js";
import { isOptional } from "../../src/content/story/evidence.js";
import type { DiscoveryId } from "../../src/content/story/evidence.js";
import type { VehicleState } from "../../src/sim/types.js";
import { board, craft, gather, interact, leaveCraft, move, openPanel, procure, reach, unload } from "./actions.js";
import { Blocked, Driver, where } from "./driver.js";
import { breathe, enter, surface, surfaceTo } from "./nav.js";
import type { Refuge } from "./nav.js";
import { fly, pilotTo } from "./routes.js";
import { dist, route, travel } from "./travel.js";

export interface PlayOptions {
  /** Read optional personal logs when passing them (the main runs do). */
  readOptional: boolean;
  /** Find the story in reverse order wherever capability allows. */
  reverse: boolean;
}

export interface Phase {
  id: string;
  title: string;
  /** Content IDs this phase needs that the build lacks; empty when it can be played. */
  missing(d: Driver): string[];
  play(d: Driver, o: PlayOptions): void;
}

const REEF = ["refuge_reef"], ISLES = ["island_chain", "refuge_reef"];

/** Containers a bench can draw on that the harness tracks for shortfalls. */
function benchStock(d: Driver, refuge: Refuge, kind: ItemKind | "tagged_frame"): number {
  const bins = ["diver", ...(refuge === "pod" ? ["pod_locker"] : d.facility("island_workshop") ? ["workshop_locker"] : [])];
  for (const v of d.state.fleet.vehicles)
    if (refuge === "workshop" && d.facility("island_workshop") && !v.berth &&
        (dist(v.pose.position, { x: 20, y: -1.6, z: -22 }) < 12 || dist(v.pose.position, { x: -6, y: -3.2, z: -26 }) < 12)) bins.push(v.cargoId);
  return available(d.state, kind as ItemKind, bins);
}
/** What a recipe still needs beyond the stock at its bench. */
function shortfall(d: Driver, id: RecipeId, refuge: Refuge, extra: Partial<Record<string, number>> = {}): Partial<Record<ItemKind, number>> {
  const need: Partial<Record<ItemKind, number>> = {};
  const cost: Record<string, number> = { ...(RECIPES[id].maintenance ? {} : RECIPES[id].cost) };
  for (const [k, n] of Object.entries(extra)) cost[k] = (cost[k] ?? 0) + n!;
  for (const [k, n] of Object.entries(cost)) {
    const short = n - benchStock(d, refuge, k as ItemKind);
    if (short > 0) need[k as ItemKind] = short;
  }
  return need;
}
const benchHost = (refuge: Refuge): string => refuge === "pod" ? "pod_services" : "workshop_services";

/** Gather what a recipe lacks from `regions`, go to its bench, open it and fabricate. */
export function make(d: Driver, id: RecipeId, refuge: Refuge, regions: readonly string[]): void {
  d.legOf(`make ${id}`, "work", () => {
    const need = shortfall(d, id, refuge);
    if (Object.keys(need).length) procure(d, need, refuge, regions, { stow: refuge === "pod" || d.facility("island_workshop") });
    enter(d, refuge);
    openPanel(d, benchHost(refuge));
    craft(d, id);
  });
}

/** Read a story host when the options say so; optional logs only when reading them. */
function discover(d: Driver, id: DiscoveryId | string, o: PlayOptions): void {
  if (isOptional(id as DiscoveryId) && !o.readOptional) return;
  if (d.knows(id)) return;
  d.legOf(`discover ${id}`, "work", () => { interact(d, id); });
  if (!d.knows(id)) throw new Blocked(`Interacting with ${id} recorded nothing: ${d.state.feedback}`, where(d.state));
}

/** Keep two meals carried; staple cups at the reef, shore crops at the isles. */
function provision(d: Driver, region: "reef" | "isles"): void {
  const have = d.count("meal", ["diver"]);
  if (have >= 2) return;
  const ids: SourceId[] = region === "reef" ? ["reef_edible_school_north", "reef_edible_school_south"]
    : ["island_shore_crop_east", "island_shore_crop_west"];
  for (const id of ids) {
    if (d.count("meal", ["diver"]) >= 4) break;
    if (d.state.world.resources.find((n) => n.id === id)!.stock > 0) gather(d, id, 4 - d.count("meal", ["diver"]));
  }
}

// --------------------------------------------------------------------------------- phases

const opening: Phase = {
  id: "opening", title: "New Game and the pod opening",
  missing: () => [],
  play(d) {
    for (let i = 0; i < 4 && d.state.opening.phase < 4; i++) d.command({ type: "interact" });
    if (d.state.opening.phase !== 4 || !d.knows("C01")) throw new Blocked("The opening did not complete with C01");
  },
};

const reef: Phase = {
  id: "reef", title: "Reef gathering, pod repair, tools, 150 m suit, rescue kit",
  missing: () => [],
  play(d, o) {
    // First dive: what the regulator needs, carried (the pod locker is open; the bench is not).
    make(d, "pod_repair", "pod", REEF);
    discover(d, "pod_checklist", o);
    make(d, "essential_tools", "pod", REEF);
    make(d, "suit_150", "pod", REEF);
    provision(d, "reef");
    if (!o.reverse) reefRecords(d, o);
    make(d, "reserve_cells", "pod", REEF);
    if (!o.reverse) {
      make(d, "salvage_buoy", "pod", REEF);
      make(d, "bobbin_kit", "pod", REEF);
    }
    // Stock for the isles: the workshop has no membrane, and its locker is shut until
    // restored, so travel light: cells, buoy and spare meals stay in the pod locker.
    enter(d, "pod");
    unload(d, "diver", "pod_locker", ["reserve_cell", "salvage_buoy"]);
    if (d.count("meal", ["diver"]) > 2) move(d, "meal", d.count("meal", ["diver"]) - 2, "diver", "pod_locker");
    procure(d, { flex_membrane: 4 }, "pod", REEF, { stow: false });
  },
};
function reefRecords(d: Driver, o: PlayOptions): void {
  discover(d, "C02", o);
  discover(d, "mara_reef_note", o);
}

const isles: Phase = {
  id: "isles", title: "Splitspine workshop restored and the Dart built",
  missing: () => [],
  play(d, o) {
    enter(d, "workshop");
    discover(d, "C03", o);
    // Carried stock pays for the restoration; the locker opens after it.
    make(d, "restore_workshop", "workshop", ISLES);
    unload(d, "diver", "workshop_locker");
    provision(d, "isles");
    make(d, "dart_base", "workshop", ISLES);
    if (o.reverse) {
      // Reverse order: the reef intake after the workshop ledger, then its rescue plans.
      reefRecords(d, o);
      make(d, "salvage_buoy", "pod", REEF);
      make(d, "bobbin_kit", "pod", REEF);
      enter(d, "workshop");
    }
  },
};

// ------------------------------------------------------------------------- craft helpers

/** Swim from the workshop to a moored craft and take its helm. */
export function boardAt(d: Driver, v: VehicleState): void {
  if (d.state.player.controlledVehicleId === v.id) return;
  board(d, v.id);
}
/** Leave the helm, refusing if the exit is unsafe. */
function exitHere(d: Driver): void { leaveCraft(d); }

/** From the helm: exit, collect from each source while air allows, ferry the diver
 * hold into the craft hold, re-board. The craft stays parked within reach. */
function workFrom(d: Driver, v: VehicleState, sources: readonly SourceId[], want: Partial<Record<string, number>>): void {
  exitHere(d);
  const left: Record<string, number> = { ...want } as Record<string, number>;
  for (const id of sources) {
    const kind = SOURCES[id].item;
    if ((left[kind] ?? 0) <= 0) continue;
    if (d.state.player.vitals.oxygen < 60) { returnToCraft(d, v); exitHere(d); }
    left[kind] = (left[kind] ?? 0) - gather(d, id, left[kind]);
    returnToCraft(d, v);
    exitHere(d);
  }
  returnToCraft(d, v);
}
/** Swim back beside the craft, move the diver hold into its cargo and board. */
function returnToCraft(d: Driver, v: VehicleState): void {
  const craft = d.state.fleet.vehicles.find((x) => x.id === v.id)!;
  reach(d, craft.id);
  unload(d, "diver", craft.cargoId);
  board(d, craft.id);
}

// ------------------------------------------------------------------------- Canopy

const canopy: Phase = {
  id: "canopy", title: "Dart to the Canopy laboratory: C04, crust and resin, 350 m suit",
  missing: () => [],
  play(d, o) {
    const dart = d.vehicle("dart")!;
    reach(d, dart.id);
    boardAt(d, dart);
    fly(d, "dart_out");
    fly(d, "canopy_upper");
    // The laboratory air pocket: exit beside the parked Dart, swim in, read the sheet.
    exitHere(d);
    travel(d, route("lab entry", "diver", "B1 labDiverEntry → labDiverInside, played",
      [{ ...CANOPY_BASIN_ROUTE.labDiverEntry }, { ...CANOPY_BASIN_ROUTE.labDiverInside, tolerance: 0.6 }]));
    discover(d, "C04", o);
    discover(d, "mara_specimen_tray", o);
    returnToCraft(d, d.vehicle("dart")!);
    // Crust and resin on the quiet lee fins and pockets, within the 150 m suit.
    const want = { conductive_crust: 12, buoyant_resin: 12 };
    for (const [id, park] of [
      ["canopy_grounding_fins_lower", { x: 132, y: -120, z: -128 }],
      ["canopy_resin_lee_lower", { x: 138, y: -128, z: -138 }],
      ["canopy_resin_lee_upper", { x: 108, y: -94, z: -100 }],
      ["canopy_grounding_fins_upper", { x: 98, y: -84, z: -92 }],
    ] as const) {
      const kind = SOURCES[id].item;
      const have = d.count(kind, ["diver", d.vehicle("dart")!.cargoId]);
      if (have >= want[kind as keyof typeof want]) continue;
      pilotTo(d, `park by ${id}`, park, { quiet: true });
      workFrom(d, d.vehicle("dart")!, [id], { [kind]: want[kind as keyof typeof want] - have });
    }
    pilotTo(d, "back to the lab parking", CANOPY_BASIN_ROUTE.labParking, { quiet: true });
    fly(d, "canopy_upper_back");
    fly(d, "dart_home");
    exitHere(d);
    // The Dart's hold counts at the workshop bench while it sits in its cradle.
    make(d, "suit_350", "workshop", ISLES);
  },
};

export const LIVE_PHASES: readonly Phase[] = [opening, reef, isles, canopy];
export { BASIN_GEOMETRY, CANOPY_STOP, RECOVERY_SURFACE_OPERATOR, surface, surfaceTo, breathe };
