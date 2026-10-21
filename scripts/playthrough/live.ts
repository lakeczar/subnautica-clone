/** Live phases: New Game through the Basin, the Creel and C1's story, played
 * against today's world. Both fleet strategies share them. */
import { HULL_COLLIDERS, MATERIALS, RECIPES, SOURCES } from "../../src/content/registry.js";
import type { ItemKind, RecipeId, SourceId } from "../../src/content/registry.js";
import { BASIN_GEOMETRY, CANOPY_BASIN_ROUTE } from "../../src/content/routes.js";
import { isOptional } from "../../src/content/story/evidence.js";
import type { DiscoveryId } from "../../src/content/story/evidence.js";
import { armTarget } from "../../src/sim/fleet.js";
import { available, supportedServiceSite } from "../../src/sim/inventory.js";
import type { VehicleState } from "../../src/sim/types.js";
import { sweptHullClearance } from "../../src/sim/world.js";
import { board, craft, eatIfHungry, gather, interact, leaveCraft, move, openPanel, procure, reach, unload } from "./actions.js";
import { Blocked, Driver, where } from "./driver.js";
import { enter } from "./nav.js";
import type { Refuge } from "./nav.js";
import type { Missing } from "./content.js";
import { all, crafted, custom, facility, hull, known, mounted, suit } from "./outcomes.js";
import type { Outcome } from "./outcomes.js";
import { fly, pilotTo, turnTo } from "./routes.js";
import { dist, route, travel, yawTo } from "./travel.js";

export interface PlayOptions {
  /** Read optional personal logs when passing them (the main runs do). */
  readOptional: boolean;
  /** Find the story in reverse order wherever capability allows. */
  reverse: boolean;
}

export interface Phase {
  id: string;
  title: string;
  /** Content this phase needs that the build lacks; empty when it can be played. */
  missing(d: Driver): Missing[];
  /** What the phase must have achieved in the real state; any problem blocks it. */
  verify: Outcome;
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
  verify: known("C01"),
  missing: () => [],
  play(d) {
    for (let i = 0; i < 4 && d.state.opening.phase < 4; i++) d.command({ type: "interact" });
    if (d.state.opening.phase !== 4 || !d.knows("C01")) throw new Blocked("The opening did not complete with C01");
  },
};

const reef: Phase = {
  id: "reef", title: "Reef gathering, pod repair, tools, 150 m suit, rescue kit",
  verify: all(crafted("pod_repair", "essential_tools", "suit_150", "reserve_cells"), facility("pod_fabricator"), suit(150), known("pod_checklist"), (d) => d.knows("C02") || d.crafted("salvage_buoy") ? crafted("salvage_buoy", "bobbin_kit")(d) : []),
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
  verify: all(crafted("restore_workshop", "dart_base", "salvage_buoy", "bobbin_kit"), facility("island_workshop"), hull("dart", 180), known("C02", "C03")),
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
/** At the workshop bench: the moored craft's materials into the locker (one panel action). */
export function stowHold(d: Driver, v: VehicleState): void {
  if (supportedServiceSite(d.state, v) !== "island_workshop") return;
  enter(d, "workshop");
  if (d.state.inventory.items.some((i) => i.containerId === v.cargoId && Object.hasOwn(MATERIALS, i.kind)))
    d.command({ type: "store-materials", from: v.cargoId, to: "workshop_locker" });
}
/** Moored at home: leave the helm and service the craft from its socket. */
export function dockAndService(d: Driver, v: VehicleState): void {
  leaveCraft(d);
  d.command({ type: "service", vehicleId: v.id });
}

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
  verify: all(crafted("suit_350"), suit(350), known("C04"), hull("dart")),
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
    // Crust and resin on the quiet lee fins and pockets, within the 150 m suit. The
    // whole campaign needs about 33 crust and 26 resin; the Basin fins and island
    // coves supply the rest.
    const want = { conductive_crust: 16, buoyant_resin: 16 };
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
    dockAndService(d, d.vehicle("dart")!);
    // The Dart's hold counts at the workshop bench while it sits in its cradle.
    make(d, "suit_350", "workshop", ISLES);
    stowHold(d, d.vehicle("dart")!);
  },
};

// ------------------------------------------------------------------------- Creel

const creel: Phase = {
  id: "creel", title: "Creel built in the medium slip, cargo rack fitted",
  verify: all(crafted("creel_base", "creel_cargo_rack"), hull("creel", 240), mounted("creel", "creel_cargo_rack")),
  missing: () => [],
  play(d) {
    make(d, "creel_base", "workshop", ISLES);
    make(d, "creel_cargo_rack", "workshop", ISLES);
    const v = d.vehicle("creel")!, rack = d.state.inventory.items.find((i) => i.kind === "creel_cargo_rack")!;
    d.command({ type: "install-module", vehicleId: v.id, itemId: rack.id });
    // Departure power: the reserve cells come along in the Creel hold.
    enter(d, "pod");
    unload(d, "pod_locker", "diver", ["reserve_cell"]);
    provision(d, "reef");
    enter(d, "workshop");
    unload(d, "diver", v.cargoId, ["reserve_cell"]);
  },
};

// ------------------------------------------------------------------------- Basin

/** Bring the Creel's bow over an arm host and let its tool arms lift until empty or full. */
function armLift(d: Driver, id: SourceId, times: number): number {
  const host = SOURCES[id].position, shape = HULL_COLLIDERS.creel;
  // Park beside the host on whichever side has open water, bow toward it.
  const park = ([[0, 5.5], [0, -5.5], [5.5, 0], [-5.5, 0]] as const)
    .map(([dx, dz]) => ({ x: host.x + dx, y: host.y + 4.5, z: host.z + dz }))
    .find((q) => sweptHullClearance(d.world, [{ ...q, y: q.y + 30 }, q], shape));
  if (!park) throw new Blocked(`No open water beside ${id} for the Creel's bow`, where(d.state));
  pilotTo(d, `bow over ${id}`, park);
  turnTo(d, yawTo(park, host));
  let lifted = 0;
  for (let i = 0; i < times; i++) {
    const t = armTarget(d.state);
    if (!t || t.sourceId !== id || t.refusal) break;
    d.command({ type: "arm-lift" });
    d.waitFor(`tool arms on ${id}`, 8, (s) => !s.world.action);
    lifted++;
  }
  return lifted;
}

const survey: Phase = {
  id: "basin-survey", title: "Dart to the Pale Basin: C05, C06, the keel plate, Basin crust",
  verify: all(known("C05", "C06", "basin_keel_plate"), hull("dart")),
  missing: () => [],
  play(d, o) {
    const dart = (): VehicleState => d.vehicle("dart")!;
    reach(d, dart().id);
    board(d, dart().id);
    fly(d, "dart_out");
    fly(d, "basin_outbound");
    // Story order: the dormitory then the station, or the station first when reversed.
    const sites = [["C05", BASIN_GEOMETRY.dormitory.parking], ["C06", BASIN_GEOMETRY.station.parking]] as const;
    for (const [id, park] of o.reverse ? [...sites].reverse() : sites) {
      pilotTo(d, `park for ${id}`, park);
      leaveCraft(d);
      discover(d, id, o);
      returnToCraft(d, dart());
    }
    // The 180 m Dart waits above the terrace; the 350 m suit reads the plate below it.
    pilotTo(d, "park above the keel plate", { x: 172, y: -176, z: -250 });
    leaveCraft(d);
    d.legOf("read basin_keel_plate", "work", () => { interact(d, "basin_keel_plate"); });
    returnToCraft(d, dart());
    pilotTo(d, "park by the eastern survey fins", { x: 216, y: -160, z: -218 });
    workFrom(d, dart(), ["basin_survey_fins_east"], { conductive_crust: 14 });
    pilotTo(d, "back to the station lane", { x: 216, y: -160, z: -232 });
    fly(d, "basin_return");
    fly(d, "dart_home");
    dockAndService(d, dart());
    stowHold(d, dart());
  },
};

const frames: Phase = {
  id: "basin-frames", title: "Creel to the Basin: tagged frames and salvage by the tool arms",
  verify: all(hull("creel"), custom("fewer than 4 tagged frames at the workshop", (d) => d.count("tagged_frame", ["workshop_locker"]) >= 4)),
  missing: () => [],
  play(d) {
    const creel = (): VehicleState => d.vehicle("creel")!;
    reach(d, creel().id);
    board(d, creel().id);
    fly(d, "creel_out");
    fly(d, "basin_outbound");
    armLift(d, "basin_frame_ridge", 3);
    armLift(d, "basin_frame_terrace", 3);
    armLift(d, "basin_ridge_salvage_north", 4);
    pilotTo(d, "back to the station lane", { x: 216, y: -160, z: -232 });
    fly(d, "basin_return");
    fly(d, "creel_home");
    dockAndService(d, creel());
    enter(d, "workshop");
    const hold = creel().cargoId;
    d.command({ type: "store-materials", from: hold, to: "workshop_locker" });
    unload(d, hold, "workshop_locker", ["tagged_frame"]);
  },
};

/** At the workshop: put `needs` in the diver hold from the locker and the moored
 * holds, gathering any remainder from the isles and reef. */
export function carry(d: Driver, needs: Readonly<Partial<Record<ItemKind | "tagged_frame", number>>>): void {
  enter(d, "workshop");
  // Travel light: everything but the load and three meals stays in the locker.
  for (const i of [...d.state.inventory.items].filter((x) => x.containerId === "diver" && !x.fitted && !(x.kind in needs) && x.kind !== "meal"))
    d.command({ type: "transfer", itemId: i.id, to: "workshop_locker", quantity: i.quantity });
  if (!("meal" in needs) && d.count("meal", ["diver"]) > 3) move(d, "meal", d.count("meal", ["diver"]) - 3, "diver", "workshop_locker");
  const bins = ["workshop_locker", ...d.state.fleet.vehicles.map((v) => v.cargoId)];
  const short: Partial<Record<ItemKind, number>> = {};
  for (const [kind, n] of Object.entries(needs) as [ItemKind, number][]) {
    for (const from of bins) {
      const left = n - d.count(kind, ["diver"]);
      if (left > 0 && d.count(kind, [from]) > 0) move(d, kind, Math.min(left, d.count(kind, [from])), from, "diver");
    }
    if (n > d.count(kind, ["diver"])) short[kind] = n - d.count(kind, ["diver"]);
  }
  if (Object.keys(short).length) procure(d, short, "workshop", ISLES, { stow: false });
}

// ------------------------------------------------------------------------- refits and the mooring

const refits: Phase = {
  id: "refits", title: "Creel and Dart refits to 350 m, outer-crown mooring restored",
  verify: all(crafted("creel_350", "dart_350", "restore_canopy_stop"), hull("creel", 350), hull("dart", 350), facility("canopy_stop")),
  missing: () => [],
  play(d) {
    make(d, "creel_350", "workshop", ISLES);
    make(d, "dart_350", "workshop", ISLES);
    // One 14 CU diver load restores the dark mooring; its locker is shut until then,
    // so eat first and carry a single meal.
    enter(d, "workshop");
    eatIfHungry(d, 70);
    if (d.count("meal", ["diver"]) > 1) move(d, "meal", d.count("meal", ["diver"]) - 1, "diver", "workshop_locker");
    carry(d, { tagged_frame: 1, silica_glass: 2, conductive_crust: 2 });
    const dart = d.vehicle("dart")!;
    reach(d, dart.id);
    board(d, dart.id);
    fly(d, "dart_out");
    fly(d, "head_to_stop");
    leaveCraft(d);
    openPanel(d, "canopy_stop_services");
    craft(d, "restore_canopy_stop");
    // Back at the Dart's socket, the restored mooring charges and repairs it.
    reach(d, dart.id);
    d.command({ type: "service", vehicleId: dart.id });
    returnToCraft(d, d.vehicle("dart")!);
    fly(d, "stop_to_head");
    fly(d, "dart_home");
    dockAndService(d, d.vehicle("dart")!);
    enter(d, "workshop");
  },
};

export const LIVE_PHASES: readonly Phase[] = [opening, reef, isles, canopy, survey, creel, frames, refits];
export const REFITS_PHASE = refits;
