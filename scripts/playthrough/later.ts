/** Later phases, written ahead of C3 against S2's routes and sites, S5's story IDs
 * and works rules, and S9's recipes, sources and service sites. Each phase lists
 * the declared IDs it needs; until the build has all of them it reports
 * "pending C3" with that list. Once C3 lands they play like the live phases.
 *
 * Assumptions C3 should confirm (or adapt here) are marked ASSUME. */
import { HULL_COLLIDERS, RECIPES, SOURCES } from "../../src/content/registry.js";
import type { ItemKind, RecipeId, SourceId } from "../../src/content/registry.js";
import { isOptional } from "../../src/content/story/evidence.js";
import type { DiscoveryId } from "../../src/content/story/evidence.js";
import { interactions } from "../../src/sim/progression.js";
import { hullClearance, sweptHullClearance } from "../../src/sim/world.js";
import type { GameCommand, Vec3, VehicleState } from "../../src/sim/types.js";
import { board, craft, interact, leaveCraft, move, openPanel, reach, unload } from "./actions.js";
import { campaignSites, need, s2Route } from "./content.js";
import { Blocked, Driver, where } from "./driver.js";
import { dockAndService, make } from "./live.js";
import type { Phase, PlayOptions } from "./live.js";
import { enter } from "./nav.js";
import { fly, pilotTo } from "./routes.js";
import { dist } from "./travel.js";

const ISLES = ["island_chain", "refuge_reef"];
const recipes = (...ids: string[]): string[] => ids.flatMap(need.recipe);
const sources = (...ids: string[]): string[] => ids.flatMap(need.source);
const stories = (o: PlayOptions, ...ids: string[]): string[] =>
  ids.filter((id) => o.readOptional || !isOptional(id as DiscoveryId)).flatMap(need.story);
const routes = (...ids: string[]): string[] => ids.flatMap(need.route);
const sites = (...ids: string[]): string[] => ids.flatMap(need.site);

// ------------------------------------------------------------------------ helpers

/** Fly an S2 route (validated by S2's swept corridor tests, and again here by the
 * game's own hull sweep). Reversed for return journeys. */
function followS2(d: Driver, id: string, reverse = false): void {
  const r = s2Route(id);
  const path = reverse ? [...r.path].reverse() : [...r.path];
  fly(d, { id: `${id}${reverse ? " (back)" : ""}`, source: `S2 ${id}, ${r.profile} profile`, points: path.map((p) => ({ ...p })) });
}
/** A keel pose near `point` the occupied hull can hold, reached from above. */
function parkNear(d: Driver, point: Vec3): Vec3 {
  const v = d.occupied()!, shape = HULL_COLLIDERS[v.hull];
  for (const up of [5, 8, 12]) for (const r of [0, 5, 9]) for (let k = 0; k < (r ? 8 : 1); k++) {
    const a = (k / 8) * Math.PI * 2;
    const q = { x: point.x + Math.cos(a) * r, y: point.y + up, z: point.z + Math.sin(a) * r };
    if (hullClearance(d.world, q, shape) && sweptHullClearance(d.world, [{ ...q, y: q.y + 20 }, q], shape)) return q;
  }
  throw new Blocked(`No clear parking for the ${v.hull} near (${point.x.toFixed(0)}, ${point.y.toFixed(0)}, ${point.z.toFixed(0)})`, where(d.state));
}
/** Park by an interaction host, exit, run `work`, swim back and board. */
function sortie(d: Driver, at: Vec3, label: string, work: () => void): void {
  const v = d.occupied()!;
  const s2park = parkNear(d, at);
  pilotTo(d, `park for ${label}`, s2park);
  leaveCraft(d);
  work();
  const craftNow = d.state.fleet.vehicles.find((x) => x.id === v.id)!;
  reach(d, craftNow.id);
  unload(d, "diver", craftNow.cargoId);
  board(d, craftNow.id);
}
const hostAt = (d: Driver, id: string): Vec3 => {
  const t = interactions(d.state).find((x) => x.id === id);
  if (!t) throw new Blocked(`No interaction ${id} in this state`, where(d.state));
  return t.position;
};
/** Discover a story host from the craft, skipping optional logs unless reading them. */
function story(d: Driver, id: string, o: PlayOptions): void {
  if (d.knows(id) || (isOptional(id as DiscoveryId) && !o.readOptional)) return;
  sortie(d, hostAt(d, id), id, () => { interact(d, id); });
  if (!d.knows(id)) throw new Blocked(`Interacting with ${id} recorded nothing: ${d.state.feedback}`, where(d.state));
}
/** Gather a source from the craft into its hold. */
function harvest(d: Driver, id: string, want: number): void {
  const def = SOURCES[id as SourceId];
  sortie(d, def.position, id, () => {
    let got = 0;
    while (got < want && d.state.world.resources.find((n) => n.id === id)!.stock > 0) {
      const before = d.count(def.item as ItemKind, ["diver"]);
      reach(d, id);
      d.command({ type: "interact" });
      got += d.count(def.item as ItemKind, ["diver"]) - before;
      if (d.freeCu("diver") < 4) break;
    }
  });
}
/** The service interaction (bench, mast or panel) at an S9 campaign site. ASSUME:
 * C3 adds one service host within 6 m of the site's work pose. */
function siteHost(d: Driver, site: string): string {
  const work = campaignSites()[site]?.work;
  if (!work) throw new Blocked(`S9 site ${site} is not in this build`, where(d.state));
  const t = interactions(d.state).filter((x) => x.kind === "service" && dist(x.position, work) < 6)
    .sort((a, b) => dist(a.position, work) - dist(b.position, work))[0];
  if (!t) throw new Blocked(`No service host at S9 site ${site} (${work.x}, ${work.y}, ${work.z})`, where(d.state));
  return t.id;
}
/** Restore or fabricate at an S9 site from what the diver carries. */
function siteCraft(d: Driver, site: string, recipe: string): void {
  const work = campaignSites()[site]!.work;
  sortie(d, work, `${recipe} at ${site}`, () => {
    openPanel(d, siteHost(d, site));
    craft(d, recipe as RecipeId);
    const v = d.state.fleet.vehicles.find((x) => dist(x.pose.position, d.state.player.pose.position) < 20);
    if (v) d.command({ type: "service", vehicleId: v.id }, { allowRefusal: true });
  });
}
/** Put `needs` in the diver hold at the workshop from the locker and moored holds. */
function carryFromWorkshop(d: Driver, needs: Readonly<Record<string, number>>): void {
  enter(d, "workshop");
  for (const [kind, n] of Object.entries(needs))
    for (const from of ["workshop_locker", ...d.state.fleet.vehicles.map((v) => v.cargoId)]) {
      const short = n - d.count(kind as ItemKind, ["diver"]);
      if (short > 0 && d.count(kind as ItemKind, [from]) > 0) move(d, kind as ItemKind, Math.min(short, d.count(kind as ItemKind, [from])), from, "diver");
    }
  for (const [kind, n] of Object.entries(needs))
    if (d.count(kind as ItemKind, ["diver"]) < n) throw new Blocked(`Workshop stock lacks ${n} ${kind} to carry`, where(d.state));
}
function boardCraft(d: Driver, hull: VehicleState["hull"]): void {
  const v = d.vehicle(hull);
  if (!v) throw new Blocked(`No ${hull} owned`, where(d.state));
  if (d.state.player.controlledVehicleId === v.id) return;
  reach(d, v.id);
  board(d, v.id);
}
function homeAndUnload(d: Driver, legs: readonly [string, boolean][]): void {
  for (const [id, reverse] of legs) followS2(d, id, reverse);
  fly(d, "basin_return");
  fly(d, "creel_home");
  dockAndService(d, d.vehicle("creel")!);
  enter(d, "workshop");
  const hold = d.vehicle("creel")!.cargoId;
  d.command({ type: "store-materials", from: hold, to: "workshop_locker" }, { allowRefusal: true });
}

// --------------------------------------------------------------- Creel route (independent)

/** Rift: restore the materials station, read its ledger, take ceramic and core;
 * then the 450 m suit and Creel refits. */
const rift = (strategy: "creel" | "carrier"): Phase => ({
  id: "rift", title: "Ember Rift: station restored, ledger, ceramic and core; 450 m suit" + (strategy === "creel" ? " and Creel" : ""),
  missing: (d) => [
    ...recipes("suit_450", "restore_rift_station", ...(strategy === "creel" ? ["creel_450"] : [])),
    ...sources("rift_ceramic_lip_north", "rift_ceramic_lip_south", "rift_core_shoulder_north", "rift_core_shoulder_west"),
    ...stories({ readOptional: true, reverse: false }, "rift_station_ledger"),
    ...routes("route.basin.legacy_anchorage", "route.basin.rift", "route.rift.ceramic"),
    ...sites("rift.materials_station"),
    ...(d.vehicle("creel") ? [] : ["an owned Creel"]),
  ],
  play(d, o) {
    carryFromWorkshop(d, RECIPES[("restore_rift_station" as RecipeId)].cost as Record<string, number>);
    boardCraft(d, "creel");
    fly(d, "creel_out");
    fly(d, "basin_outbound");
    followS2(d, "route.basin.legacy_anchorage");
    followS2(d, "route.basin.rift");
    siteCraft(d, "rift_station", "restore_rift_station");
    story(d, "rift_station_ledger", o);
    // Ceramic: suit 450 P4, Creel 450 P6, Creel 800 P8, suit 800 P4 (carrier: Hearthline 550 P10, Mantle P8).
    harvest(d, "rift_ceramic_lip_north", 12);
    followS2(d, "route.rift.ceramic");
    harvest(d, "rift_ceramic_lip_south", 12);
    followS2(d, "route.rift.ceramic", true);
    // Core: Creel 450 K2, Creel 800 K3, suit 800 K1, power assembly K2 (carrier: Mantle K4).
    harvest(d, "rift_core_shoulder_north", 8);
    homeAndUnload(d, [["route.basin.rift", true], ["route.basin.legacy_anchorage", true]]);
    make(d, "suit_450" as RecipeId, "workshop", ISLES);
    if (strategy === "creel") make(d, "creel_450" as RecipeId, "workshop", ISLES);
  },
});

const divide: Phase = {
  id: "divide", title: "Mirror Divide: lattice, the upper dock restored, C07; Creel and suit to 800 m",
  missing: () => [
    ...recipes("restore_divide_stop", "creel_800", "suit_800"),
    ...sources("divide_lattice_ledge_west", "divide_lattice_ledge_east"),
    ...stories({ readOptional: true, reverse: false }, "C07"),
    ...routes("route.basin.divide", "route.divide.lattice_west", "route.divide.lattice_east"),
    ...sites("divide.service_dock"),
  ],
  play(d, o) {
    carryFromWorkshop(d, { structural_alloy: 3, silica_glass: 3, conductive_crust: 3 });
    boardCraft(d, "creel");
    fly(d, "creel_out");
    fly(d, "basin_outbound");
    followS2(d, "route.basin.legacy_anchorage");
    followS2(d, "route.basin.divide");
    // Lattice: Creel 800 L5, suit 800 L4, the dock L2, air assembly L2.
    followS2(d, "route.divide.lattice_west");
    harvest(d, "divide_lattice_ledge_west", 8);
    followS2(d, "route.divide.lattice_west", true);
    followS2(d, "route.divide.lattice_east");
    harvest(d, "divide_lattice_ledge_east", 8);
    followS2(d, "route.divide.lattice_east", true);
    // The dock's restoration takes two lattice from the hold into the diver load.
    const hold = d.vehicle("creel")!.cargoId;
    leaveCraft(d);
    move(d, "brine_lattice" as ItemKind, 2, hold, "diver");
    board(d, d.vehicle("creel")!.id);
    siteCraft(d, "divide_dock", "restore_divide_stop");
    story(d, "C07", o);
    story(d, "ren_access_log", o);
    homeAndUnload(d, [["route.basin.divide", true], ["route.basin.legacy_anchorage", true]]);
    make(d, "creel_800" as RecipeId, "workshop", ISLES);
    make(d, "suit_800" as RecipeId, "workshop", ISLES);
  },
};

/** The isles field shelter (C11, reachable early, read here) and the Divide
 * turbine hall (C12, 600 m). */
const deepRecords: Phase = {
  id: "deep-records", title: "Field shelter (C11) and the Divide turbine hall (C12)",
  missing: (d) => [
    ...stories({ readOptional: true, reverse: false }, "C11", "C12"),
    ...routes("route.isles.workshop_stack", "route.isles.stack_headland", "route.basin.divide"),
    ...(d.vehicle("dart") ? [] : ["an owned Dart"]),
  ],
  play(d, o) {
    // Surface run to the headland shelter in the Dart.
    boardCraft(d, "dart");
    fly(d, "dart_out");
    followS2(d, "route.isles.workshop_stack");
    followS2(d, "route.isles.stack_headland");
    story(d, "C11", o);
    story(d, "mara_last_page", o);
    followS2(d, "route.isles.stack_headland", true);
    followS2(d, "route.isles.workshop_stack", true);
    fly(d, "dart_home");
    dockAndService(d, d.vehicle("dart")!);
    // The turbine hall at 600 m needs the 800 m Creel and suit.
    boardCraft(d, "creel");
    fly(d, "creel_out");
    fly(d, "basin_outbound");
    followS2(d, "route.basin.legacy_anchorage");
    followS2(d, "route.basin.divide");
    story(d, "C12", o);
    homeAndUnload(d, [["route.basin.divide", true], ["route.basin.legacy_anchorage", true]]);
  },
};

// ------------------------------------------------------------------ Meridian, works, ending

/** ASSUME: C3 wires S5's works as a command, `{ type: "works", action }`, issued
 * from the gate-hall panel and the upper-hall work faces, and the controller's
 * resolution as `{ type: "resolution", action: "begin" | "complete", roster? }`.
 * The harness probes for them and reports a missing command as a blocker. */
const worksCommand = (action: string): GameCommand => ({ type: "works", action } as unknown as GameCommand);
const resolutionCommand = (action: "begin" | "complete"): GameCommand => ({ type: "resolution", action } as unknown as GameCommand);
function worksStep(d: Driver, action: string): void {
  const before = JSON.stringify(d.state.story.works);
  const r = d.command(worksCommand(action), { allowRefusal: true });
  if (!r.ok) throw new Blocked(`Works ${action} refused: ${r.message}`, where(d.state));
  if (JSON.stringify(d.state.story.works) === before) throw new Blocked(`Works command "${action}" changed nothing: not wired`, where(d.state));
}

const meridianMissing = (o: PlayOptions): string[] => [
  ...stories(o, "C08", "C10", "C09", "gate_panel", "C13", "district_controller", "iona_ledger_note"),
  ...routes("route.divide.service_ledge", "route.meridian.terraces"),
  ...sites("meridian.gate_hall", "meridian.gate_hall_panel", "meridian.staging_office"),
];

type Strategy = "creel" | "carrier";
/** To the district: the 800 m Creel down the Divide service ledge, or the 550 m
 * Hearthline to the staging shelf with the Mantle launched from its berth. */
function toMeridian(d: Driver, strategy: Strategy): void {
  if (strategy === "creel") {
    boardCraft(d, "creel");
    fly(d, "creel_out");
    fly(d, "basin_outbound");
    for (const id of ["route.basin.legacy_anchorage", "route.basin.divide", "route.divide.service_ledge"]) followS2(d, id);
    return;
  }
  boardCraft(d, "hearthline");
  for (const id of ["route.isles.canopy_east", "route.canopy_east.basin", "route.basin.divide", "route.divide.meridian_broad"]) followS2(d, id);
  d.command({ type: "carrier", action: "station-keep" });
  d.command({ type: "carrier", action: "leave-helm" });
  launchMantle(d);
}
function launchMantle(d: Driver): void {
  d.command({ type: "carrier", action: "launch", vehicleId: d.vehicle("mantle")!.id });
  d.waitFor("the Mantle launch", 60, (s) => !s.fleet.docking?.transaction);
  d.command({ type: "carrier", action: "leave-interior" });
  boardCraft(d, "mantle");
}
function fromMeridian(d: Driver, strategy: Strategy): void {
  if (strategy === "creel") {
    followS2(d, "route.divide.service_ledge", true);
    homeAndUnload(d, [["route.basin.divide", true], ["route.basin.legacy_anchorage", true]]);
    return;
  }
  // Mantle back into its berth, then the carrier home to the yard.
  d.command({ type: "carrier", action: "capture", vehicleId: d.vehicle("mantle")!.id });
  d.waitFor("the Mantle capture", 60, (s) => !s.fleet.docking?.transaction);
  boardCraft(d, "hearthline");
  for (const id of ["route.divide.meridian_broad", "route.basin.divide", "route.canopy_east.basin", "route.isles.canopy_east"]) followS2(d, id, true);
}

const meridian = (strategy: Strategy): Phase => ({
  id: "meridian", title: strategy === "creel" ? "Meridian District by the 800 m Creel: transfer hall, annex, gate hall, service window"
    : "Meridian by carrier: the 550 m Hearthline at the shelf, Mantle sorties",
  missing: () => [...meridianMissing({ readOptional: true, reverse: false }),
    ...(strategy === "carrier" ? [...routes("route.divide.meridian_broad"), ...sites("meridian.staging_shelf")] : [])],
  play(d, o) {
    toMeridian(d, strategy);
    const order = ["C08", "C10", "iona_ledger_note", "C09", "gate_panel", "C13", "district_controller"];
    for (const id of o.reverse ? [...order].reverse() : order) story(d, id, o);
    fromMeridian(d, strategy);
  },
});

/** Works cargo: the two assemblies (12 CU) plus hall (22 CU) and food (8 CU) stock. */
const WORKS_STOCK: Readonly<Record<string, number>> = {
  structural_alloy: 6, silica_glass: 6, flex_membrane: 7, buoyant_resin: 4, conductive_crust: 1,
};
/** The gate-hall procedure and the upper-hall restorations, from the diver at the panel. */
function gateWorks(d: Driver, hull: VehicleState["hull"]): void {
  sortie(d, hostAt(d, "gate_panel"), "gate hall works", () => {
    const v = d.vehicle(hull)!;
    reach(d, v.id);
    for (const kind of ["service_power_assembly", "service_air_assembly"] as const) move(d, kind, 1, v.cargoId, "diver");
    reach(d, "gate_panel");
    for (const a of ["install_power", "install_air", "isolate", "equalize"]) worksStep(d, a);
    // 5,400 active steps; the panel shows progress while the diver waits in reach.
    d.waitFor("the gate to equalize", 100, (s) => s.story.works.gate === "equalized");
    worksStep(d, "open");
  });
  sortie(d, hostAt(d, "gate_panel"), "upper hall restoration", () => {
    const v = d.vehicle(hull)!;
    reach(d, v.id);
    for (const [kind, n] of Object.entries(WORKS_STOCK)) move(d, kind as ItemKind, n, v.cargoId, "diver");
    worksStep(d, "restore_hall");
    worksStep(d, "restore_food");
    worksStep(d, "route_power");
  });
}
const worksMissing = (): string[] => [
  ...recipes("service_power_assembly", "service_air_assembly"),
  ...stories({ readOptional: true, reverse: false }, "gate_panel"),
  ...sites("meridian.gate_hall_panel"),
];
/** Assemblies and stock ride in the sortie hull's hold (Creel), or in the carrier
 * stores and then the berthed Mantle's hold. ASSUME: a berthed craft's hold is
 * reachable from the carrier interior. */
const works = (strategy: Strategy): Phase => ({
  id: "works", title: "The return-gate works: power, air, isolate, equalize, open; hall, food, turbine power",
  missing: worksMissing,
  play(d) {
    make(d, "service_power_assembly", "workshop", ISLES);
    make(d, "service_air_assembly", "workshop", ISLES);
    enter(d, "workshop");
    const hold = d.vehicle(strategy === "creel" ? "creel" : "hearthline")!.cargoId;
    for (const kind of ["service_power_assembly", "service_air_assembly"] as const) move(d, kind, 1, "diver", hold);
    for (const [kind, n] of Object.entries(WORKS_STOCK)) move(d, kind as ItemKind, n, "workshop_locker", hold);
    if (strategy === "carrier") {
      boardCraft(d, "hearthline");
      for (const id of ["route.isles.canopy_east", "route.canopy_east.basin", "route.basin.divide", "route.divide.meridian_broad"]) followS2(d, id);
      d.command({ type: "carrier", action: "station-keep" });
      d.command({ type: "carrier", action: "leave-helm" });
      const mantle = d.vehicle("mantle")!;
      for (const i of [...d.state.inventory.items].filter((x) => x.containerId === hold))
        d.command({ type: "transfer", itemId: i.id, to: mantle.cargoId, quantity: i.quantity });
      launchMantle(d);
    } else toMeridian(d, "creel");
    gateWorks(d, strategy === "creel" ? "creel" : "mantle");
    fromMeridian(d, strategy);
  },
});

const ending = (strategy: Strategy): Phase => ({
  id: "ending", title: "Pod buffer and C14, then the district controller's resolution",
  missing: () => [
    ...recipes("pod_buffer"),
    ...stories({ readOptional: true, reverse: false }, "C14", "district_controller"),
  ],
  play(d, o) {
    make(d, "pod_buffer", "pod", ["refuge_reef", "island_chain"]);
    enter(d, "pod");
    if (!d.knows("C14")) { interact(d, "C14"); if (!d.knows("C14")) throw new Blocked("C14 recorded nothing", where(d.state)); }
    toMeridian(d, strategy);
    sortie(d, hostAt(d, "district_controller"), "resolution", () => {
      reach(d, "district_controller");
      for (const a of ["begin", "complete"] as const) {
        const r = d.command(resolutionCommand(a), { allowRefusal: true });
        if (!r.ok) throw new Blocked(`Resolution ${a} refused: ${r.message}`, where(d.state));
      }
    });
    if (d.state.story.resolution.phase !== "complete")
      throw new Blocked(`The resolution ended in phase "${d.state.story.resolution.phase}"`, where(d.state));
    void o;
  },
});

// --------------------------------------------------------------- carrier route (Hearthline + Mantle)

const hearthline: Phase = {
  id: "hearthline", title: "Hearthline keel and fit-out at the stack-yard berth",
  missing: () => [
    ...recipes("hearthline_keel", "hearthline_base"),
    ...need.hull("hearthline"),
    ...routes("route.isles.workshop_stack"),
    ...sites("isles.stack_yard"),
  ],
  play(d) {
    // Keel F2 A16 R6 and fit-out A6 G8 M8 C8 R4 travel in the Creel's rack hold.
    enter(d, "workshop");
    const hold = d.vehicle("creel")!.cargoId;
    const cost: Record<string, number> = {};
    for (const id of ["hearthline_keel", "hearthline_base"])
      for (const [k, n] of Object.entries(RECIPES[id as RecipeId].cost)) cost[k] = (cost[k] ?? 0) + n;
    for (const [kind, n] of Object.entries(cost)) move(d, kind as ItemKind, n, "workshop_locker", hold);
    boardCraft(d, "creel");
    fly(d, "creel_out");
    followS2(d, "route.isles.workshop_stack");
    for (const recipe of ["hearthline_keel", "hearthline_base"]) {
      const work = campaignSites().stack_yard!.work;
      sortie(d, work, recipe, () => {
        const v = d.vehicle("creel")!;
        reach(d, v.id);
        for (const [k, n] of Object.entries(RECIPES[recipe as RecipeId].cost)) move(d, k as ItemKind, n, v.cargoId, "diver");
        openPanel(d, siteHost(d, "stack_yard"));
        craft(d, recipe as RecipeId);
      });
    }
    if (!d.vehicle("hearthline")) throw new Blocked("The fit-out did not produce a Hearthline", where(d.state));
    followS2(d, "route.isles.workshop_stack", true);
    fly(d, "creel_home");
    leaveCraft(d);
  },
};

const carrierDeep: Phase = {
  id: "carrier-deep", title: "Hearthline to the Divide lee mooring: lattice from the 400 m carrier; 550 m refit, Mantle, 800 m suit",
  missing: () => [
    ...recipes("hearthline_550", "mantle_base", "suit_800", "restore_divide_stop"),
    ...need.hull("mantle"),
    ...sources("divide_lattice_ledge_west", "divide_lattice_ledge_east"),
    ...stories({ readOptional: true, reverse: false }, "C07"),
    ...routes("route.isles.canopy_east", "route.canopy_east.basin", "route.basin.divide"),
    ...sites("divide.lee_mooring", "isles.stack_yard"),
  ],
  play(d, o) {
    boardCraft(d, "hearthline");
    followS2(d, "route.isles.canopy_east");
    followS2(d, "route.canopy_east.basin");
    followS2(d, "route.basin.divide");
    d.command({ type: "carrier", action: "station-keep" });
    d.command({ type: "carrier", action: "leave-helm" });
    d.command({ type: "carrier", action: "leave-interior" });
    harvest(d, "divide_lattice_ledge_west", 8);
    harvest(d, "divide_lattice_ledge_east", 8);
    story(d, "C07", o);
    followS2(d, "route.basin.divide", true);
    followS2(d, "route.canopy_east.basin", true);
    followS2(d, "route.isles.canopy_east", true);
    for (const recipe of ["hearthline_550", "mantle_base"]) siteCraft(d, "stack_yard", recipe);
    make(d, "suit_800" as RecipeId, "workshop", ISLES);
  },
};

export const CREEL_LATER: readonly Phase[] = [rift("creel"), divide, deepRecords, meridian("creel"), works("creel"), ending("creel")];
export const CARRIER_LATER: readonly Phase[] = [rift("carrier"), hearthline, carrierDeep, deepRecords, meridian("carrier"), works("carrier"), ending("carrier")];
