/** Later phases, written ahead of C3 against S2's routes and sites, S5's story IDs
 * and works rules, and S9's recipes, sources and service sites. Each phase lists
 * the declared IDs it needs; until the build has all of them it reports
 * "pending C3" with that list. Once C3 lands they play like the live phases.
 *
 * Assumptions C3 should confirm (or adapt here) are marked ASSUME. */
import { HULL_BUILD, HULL_COLLIDERS, ITEMS, RECIPES, SOURCES } from "../../src/content/registry.js";
import type { ItemKind, RecipeId, SourceId } from "../../src/content/registry.js";
import { isOptional, STORY_RECIPES } from "../../src/content/story/evidence.js";
import type { DiscoveryId, StorySiteId } from "../../src/content/story/evidence.js";
import { WORKS_TEXT } from "../../src/content/story/works.js";
import type { WorksAction } from "../../src/content/story/works.js";
import { createStory } from "../../src/sim/story/state.js";
import { worksAction } from "../../src/sim/story/works.js";
import { interactions } from "../../src/sim/progression.js";
import { hullClearance, sweptHullClearance } from "../../src/sim/world.js";
import { CARRIER_LAYOUT, carrierInteriorSolids, localToWorld } from "../../src/sim/carrier.js";
import { createWorldQueries } from "../../src/sim/world.js";
import type { GameCommand, Vec3, VehicleState } from "../../src/sim/types.js";
import { board, craft, gather, interact, leaveCraft, move, procure, reach, unload, eatIfHungry } from "./actions.js";
import { campaignSite, need, s2Route, worksFace, worksFaceId } from "./content.js";
import type { Missing } from "./content.js";
import { Blocked, Driver, where } from "./driver.js";
import { carry, dockAndService, make, stowHold } from "./live.js";
import type { Phase, PlayOptions } from "./live.js";
import { enter, gridPath } from "./nav.js";
import { fly, pilotTo } from "./routes.js";
import { route, travel } from "./travel.js";

const ISLES = ["island_chain", "refuge_reef"];
const recipes = (...ids: string[]): Missing[] => ids.flatMap(need.recipe);
const sources = (...ids: string[]): Missing[] => ids.flatMap(need.source);
const stories = (o: PlayOptions, ...ids: string[]): Missing[] =>
  ids.filter((id) => o.readOptional || !isOptional(id as DiscoveryId)).flatMap(need.story);
const routes = (...ids: string[]): Missing[] => ids.flatMap(need.route);
/** A plan known now, or a placed story host that grants it. */
const plans = (d: Driver, bp: string, ...hosts: string[]): Missing[] =>
  (d.state.knowledge.blueprints as readonly string[]).includes(bp) || hosts.some((h) => need.story(h).length === 0) ? []
    : [{ key: `plans:${bp}`, text: `plans ${bp}: none of its sources (${hosts.join(", ")}) is placed` }, ...hosts.flatMap(need.story)];
/** A phase that only reads story hosts has nothing to play until one is placed. */
const anyPlaced = (...ids: string[]): Missing[] =>
  ids.some((id) => need.story(id).length === 0) ? [] : ids.flatMap(need.story);
const sites = (...ids: string[]): Missing[] => ids.flatMap(need.site);

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
/** Beside the parked craft: swap the diver hold for exactly `cost` from the craft hold. */
function loadDiver(d: Driver, cost: Readonly<Record<string, number>>): void {
  const v = d.state.fleet.vehicles.find((x) => !x.berth && x.hull !== "hearthline" &&
    Math.hypot(x.pose.position.x - d.state.player.pose.position.x, x.pose.position.y - d.state.player.pose.position.y,
      x.pose.position.z - d.state.player.pose.position.z) < 12);
  if (!v) throw new Blocked("No craft alongside to load the diver from", where(d.state));
  reach(d, v.id);
  for (const i of [...d.state.inventory.items].filter((x) => x.containerId === "diver" && !x.fitted && !(x.kind in cost)))
    d.command({ type: "transfer", itemId: i.id, to: v.cargoId, quantity: i.quantity });
  for (const [kind, n] of Object.entries(cost)) {
    const short = n - d.count(kind as ItemKind, ["diver"]);
    if (short > 0 && move(d, kind as ItemKind, short, v.cargoId, "diver") < short)
      throw new Blocked(`The ${v.hull} hold lacks ${short} ${kind} for this diver load`, where(d.state));
  }
}
/** A mooring spot inside the stop's service radius but outside every hull build
 * envelope, so a supply craft never blocks construction it is lending stock to. */
function clearOfBuilds(d: Driver, site: string, mooring: Vec3): Vec3 {
  const v = d.occupied()!, shape = HULL_COLLIDERS[v.hull];
  const builds = Object.entries(HULL_BUILD) as [keyof typeof HULL_COLLIDERS, { pose: Vec3 }][];
  const blocks = (q: Vec3) => builds.some(([hull, b]) => Math.abs(q.x - b.pose.x) < shape.radius + HULL_COLLIDERS[hull].radius &&
    Math.abs(q.z - b.pose.z) < shape.radius + HULL_COLLIDERS[hull].radius && Math.abs(q.y - b.pose.y) < Math.max(shape.height, HULL_COLLIDERS[hull].height));
  if (!blocks(mooring)) return mooring;
  for (const r of [10, 16, 22, 26]) for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, q = { x: mooring.x + Math.cos(a) * r, y: mooring.y, z: mooring.z + Math.sin(a) * r };
    if (!blocks(q) && hullClearance(d.world, q, shape)) {
      const note = `${site}: the composed mooring (${mooring.x}, ${mooring.y}, ${mooring.z}) lies inside a hull build envelope; ` +
        `a craft moored there blocks construction ("Construction clearance is blocked" does not say why). Moored ${r} m off instead.`;
      if (!d.run.notes.includes(note)) d.run.notes.push(note);
      return q;
    }
  }
  throw new Blocked(`No mooring near ${site} clear of every build envelope`, where(d.state));
}
/** The diver to a site's work pose: a swim, or ashore onto a dry deck. */
function toWorkPose(d: Driver, site: string, work: Vec3): void {
  const dry = work.y > -0.5;
  travel(d, route(`to the ${site} work pose`, "diver", "local swim to the composed work pose, played",
    dry ? [{ x: work.x, y: -0.5, z: work.z, tolerance: 6 }, { ...work, land: true, tolerance: 0.8 }] : [{ ...work, tolerance: 0.8 }]));
}
/** Park by an interaction host (or at a composed mooring), exit, run `work`, swim back and board. */
function sortie(d: Driver, at: Vec3, label: string, work: () => void): void {
  const v = d.occupied()!;
  // A host ashore: the craft stays afloat where the route ended; the diver walks in.
  if (at.y <= 0.5) {
    const s2park = hullClearance(d.world, at, HULL_COLLIDERS[v.hull]) ? at : parkNear(d, at);
    // Never take a hull below its rating: that is a choice of craft, not a route.
    if (-s2park.y > v.rating) throw new Blocked(`The ${v.hull} (rated ${v.rating} m) would park at ${(-s2park.y).toFixed(0)} m for ${label}`, where(d.state));
    pilotTo(d, `park for ${label}`, s2park);
  }
  leaveCraft(d);
  work();
  const craftNow = d.state.fleet.vehicles.find((x) => x.id === v.id)!;
  reach(d, craftNow.id);
  unload(d, "diver", craftNow.cargoId);
  // At a restored stop the socket charges and repairs; elsewhere it simply refuses.
  if (craftNow.charge < 99 || craftNow.health < 99) d.command({ type: "service", vehicleId: craftNow.id }, { allowRefusal: true });
  board(d, craftNow.id);
}
const hostAt = (d: Driver, id: string): Vec3 => {
  const t = interactions(d.state).find((x) => x.id === id);
  if (!t) throw new Blocked(`No interaction ${id} in this state`, where(d.state));
  return t.position;
};
/** Discover a story host from the craft, skipping optional logs unless reading them.
 * A host the build has not placed is deferred: recorded, and the run stays pending. */
function story(d: Driver, id: string, o: PlayOptions): void {
  if (d.knows(id) || (isOptional(id as DiscoveryId) && !o.readOptional)) return;
  if (need.story(id).length) { d.deferred.push(id); return; }
  sortie(d, hostAt(d, id), id, () => { interact(d, id); });
  if (!d.knows(id)) throw new Blocked(`Interacting with ${id} recorded nothing: ${d.state.feedback}`, where(d.state));
}
/** Gather a source from the craft into its hold, a diver load per sortie. */
function harvest(d: Driver, id: string, want: number): void {
  const def = SOURCES[id as SourceId];
  let got = 0;
  for (let trip = 0; trip < 6 && got < want; trip++) {
    const stock = d.state.world.resources.find((n) => n.id === id)!.stock;
    const hold = d.occupied()!.cargoId;
    if (stock <= 0 || d.freeCu(hold) < ITEMS[def.item].cu * def.bundle) break;
    sortie(d, def.position, id, () => { got += gather(d, id as SourceId, want - got); });
  }
}
/** Restore or fabricate at an S9 site: park, swim to S2's work pose, open the craft
 * panel (K, a UI-only key) and fabricate from what the diver and the moored hold
 * carry; then service the craft if the stop now offers it. */
function siteCraft(d: Driver, site: string, recipe: string): void {
  const at = campaignSite(site);
  if (!at) throw new Blocked(`S9 site ${site} is not in this build`, where(d.state));
  sortie(d, at.mooring ? clearOfBuilds(d, site, at.mooring) : at.work, `${recipe} at ${site}`, () => {
    // A stop's own restoration is paid from one diver load (its locker is shut until then).
    if (recipe.startsWith("restore_")) loadDiver(d, RECIPES[recipe as RecipeId].cost as Record<string, number>);
    toWorkPose(d, site, at.work);
    craft(d, recipe as RecipeId);
  });
}
/** Put `needs` in the diver hold at the workshop, gathering any shortfall. */
const carryFromWorkshop = (d: Driver, needs: Readonly<Record<string, number>>): void => carry(d, needs as Partial<Record<ItemKind, number>>);
function boardCraft(d: Driver, hull: VehicleState["hull"]): void {
  const v = d.vehicle(hull);
  if (!v) throw new Blocked(`No ${hull} owned`, where(d.state));
  if (d.state.player.controlledVehicleId === v.id) return;
  if (hull === "hearthline") return boardHearthline(d);
  reach(d, v.id);
  board(d, v.id);
}
/** The carrier has no canopy handle: reach its exterior vestibule (by Creel when it
 * waits far away), enter the dry interior and take the helm. */
function boardHearthline(d: Driver): void {
  const h = carrier(d);
  if (d.state.player.interiorId === h.id) {
    walkAboard(d, CARRIER_LAYOUT.helm, "to the helm");
    d.command({ type: "carrier", action: "helm" });
    return;
  }
  const vestibule = localToWorld(CARRIER_LAYOUT.exteriorVestibule, h);
  const p = d.state.player.pose.position;
  if (Math.hypot(p.x - vestibule.x, p.z - vestibule.z) > 60) {
    // Ride the Creel to the yard and moor clear of the carrier.
    boardCraft(d, "creel");
    fly(d, "creel_out");
    followS2(d, "route.isles.workshop_stack");
    pilotTo(d, "beside the carrier", clearOfBuilds(d, "stack_yard", parkNear(d, { ...vestibule, y: vestibule.y - 6 })));
    leaveCraft(d);
  }
  d.command({ type: "carrier", action: "station-keep" }, { allowRefusal: true });
  carrierIn(d);
}
function homeAndUnload(d: Driver, legs: readonly [string, boolean][]): void {
  for (const [id, reverse] of legs) followS2(d, id, reverse);
  fly(d, "basin_return");
  fly(d, "creel_home");
  dockAndService(d, d.vehicle("creel")!);
  stowHold(d, d.vehicle("creel")!);
}

// --------------------------------------------------------------- Creel route (independent)

/** Rift: restore the materials station, read its ledger, take ceramic and core;
 * then the 450 m suit and Creel refits. */
const rift = (strategy: "creel" | "carrier"): Phase => ({
  id: "rift", title: "Ember Rift: station restored, ledger, ceramic and core; 450 m suit" + (strategy === "creel" ? " and Creel" : ""),
  missing: (d) => [
    ...recipes("suit_450", "restore_rift_station", ...(strategy === "creel" ? ["creel_450"] : [])),
    ...sources("rift_ceramic_lip_north", "rift_ceramic_lip_south", "rift_core_shoulder_north", "rift_core_shoulder_west"),
    ...routes("route.basin.legacy_anchorage", "route.basin.rift", "route.rift.ceramic", "route.rift.west_return", "route.basin.reef_west"),
    ...sites("rift.materials_station"),
    ...(d.vehicle("creel") ? [] : [{ key: "owned:creel", text: "an owned Creel" }]),
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
    // Core: Creel 450 K2, Creel 800 K3, suit 800 K1, power assembly K2 (carrier: Mantle K4),
    // on the shoulder where S2's western return leaves for the reef.
    harvest(d, "rift_core_shoulder_north", 8);
    followS2(d, "route.rift.west_return");
    followS2(d, "route.basin.reef_west");
    fly(d, "reef_to_slip");
    dockAndService(d, d.vehicle("creel")!);
    stowHold(d, d.vehicle("creel")!);
    make(d, "suit_450" as RecipeId, "workshop", ISLES);
    if (strategy === "creel") make(d, "creel_450" as RecipeId, "workshop", ISLES);
  },
});

const divide: Phase = {
  id: "divide", title: "Mirror Divide: lattice, the upper dock restored, C07; Creel and suit to 800 m",
  missing: (d) => [
    ...recipes("restore_divide_stop", "creel_800", "suit_800"),
    ...sources("divide_lattice_ledge_west", "divide_lattice_ledge_east"),
    ...routes("route.basin.divide", "route.divide.lattice_west", "route.divide.lattice_east"),
    ...sites("divide.service_dock"),
    // The deep-service plans (the dock, Creel 800, suit 800) come only from these records.
    ...plans(d, "bp_deep_service", "C07", "rift_station_ledger"),
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
    story(d, "C07", o);
    story(d, "ren_access_log", o);
    siteCraft(d, "divide_dock", "restore_divide_stop");
    homeAndUnload(d, [["route.basin.divide", true], ["route.basin.legacy_anchorage", true]]);
    make(d, "creel_800" as RecipeId, "workshop", ISLES);
    make(d, "suit_800" as RecipeId, "workshop", ISLES);
  },
};

/** The isles field shelter (C11, reachable early, read here) and the Divide
 * turbine hall (C12, about 600 m): the 800 m Creel on its route, or the Mantle
 * launched from the 550 m Hearthline at the Divide lee mooring on the carrier route. */
const deepRecords = (strategy: Strategy): Phase => ({
  id: "deep-records", title: "Field shelter (C11) and the Divide turbine hall (C12)",
  missing: (d) => [
    ...anyPlaced("C11", "C12", "mara_last_page"),
    ...routes("route.isles.workshop_stack", "route.isles.stack_headland", "route.basin.divide",
      ...(strategy === "carrier" ? ["route.isles.canopy_east", "route.canopy_east.basin"] : [])),
    ...(d.vehicle("dart") ? [] : [{ key: "owned:dart", text: "an owned Dart" }]),
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
    if (need.story("C12").length) { d.deferred.push("C12"); return; }
    const depth = -hostAt(d, "C12").y;
    const hull = sortieHull(d, strategy, depth);
    if (hull === "creel") {
      boardCraft(d, "creel");
      fly(d, "creel_out");
      fly(d, "basin_outbound");
      followS2(d, "route.basin.legacy_anchorage");
      followS2(d, "route.basin.divide");
      story(d, "C12", o);
      homeAndUnload(d, [["route.basin.divide", true], ["route.basin.legacy_anchorage", true]]);
    } else {
      carrierTo(d, CARRIER_TO_DIVIDE);
      launchMantle(d);
      story(d, "C12", o);
      mantleHome(d);
      carrierHome(d, CARRIER_TO_DIVIDE);
    }
  },
});

/** The hull a strategy sends to work at `depth`: the Creel on its route, the Mantle
 * (from the carrier) on the carrier route; each must be rated for the depth. */
export function sortieHull(d: Driver, strategy: Strategy, depth: number): "creel" | "mantle" {
  const hull = strategy === "creel" ? "creel" : "mantle";
  const v = d.vehicle(hull);
  if (!v) throw new Blocked(`The ${strategy} route has no ${hull} for a ${depth.toFixed(0)} m site`, where(d.state));
  if (v.rating < depth + 5) throw new Blocked(`The ${hull} is rated ${v.rating} m; the site is at ${depth.toFixed(0)} m`, where(d.state));
  return hull;
}
const CARRIER_TO_DIVIDE = ["route.isles.canopy_east", "route.canopy_east.basin", "route.basin.divide"] as const;
const CARRIER_TO_SHELF = [...CARRIER_TO_DIVIDE, "route.divide.meridian_broad"] as const;
function carrierTo(d: Driver, legs: readonly string[]): void {
  boardCraft(d, "hearthline");
  for (const id of legs) followS2(d, id);
  d.command({ type: "carrier", action: "station-keep" });
  d.command({ type: "carrier", action: "leave-helm" });
}
function carrierHome(d: Driver, legs: readonly string[]): void {
  boardCraft(d, "hearthline");
  for (const id of [...legs].reverse()) followS2(d, id, true);
}
/** The Mantle back into its medium berth from the vestibule side. */
function mantleHome(d: Driver): void {
  leaveCraft(d);
  carrierIn(d);
  d.command({ type: "carrier", action: "station-keep" });
  d.command({ type: "carrier", action: "capture", vehicleId: d.vehicle("mantle")!.id });
  d.waitFor("the Mantle capture", 60, (s) => !s.fleet.docking?.transaction);
  d.command({ type: "carrier", action: "leave-helm" }, { allowRefusal: true });
}

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

const meridianMissing = (): Missing[] => [
  ...anyPlaced("C08", "C10", "C09", "gate_panel", "C13", "district_controller", "iona_ledger_note"),
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
  carrierTo(d, CARRIER_TO_SHELF);
  launchMantle(d);
}
function launchMantle(d: Driver): void {
  d.command({ type: "carrier", action: "launch", vehicleId: d.vehicle("mantle")!.id });
  d.waitFor("the Mantle launch", 60, (s) => !s.fleet.docking?.transaction);
  walkAboard(d, CARRIER_LAYOUT.vestibule, "to the vestibule");
  d.command({ type: "carrier", action: "leave-interior" });
  boardCraft(d, "mantle");
}
function fromMeridian(d: Driver, strategy: Strategy): void {
  if (strategy === "creel") {
    followS2(d, "route.divide.service_ledge", true);
    homeAndUnload(d, [["route.basin.divide", true], ["route.basin.legacy_anchorage", true]]);
    return;
  }
  mantleHome(d);
  carrierHome(d, CARRIER_TO_SHELF);
}

const meridian = (strategy: Strategy): Phase => ({
  id: "meridian", title: strategy === "creel" ? "Meridian District by the 800 m Creel: transfer hall, annex, gate hall, service window"
    : "Meridian by carrier: the 550 m Hearthline at the shelf, Mantle sorties",
  missing: () => [...meridianMissing(),
    ...(strategy === "carrier" ? [...routes("route.divide.meridian_broad"), ...sites("meridian.staging_shelf")] : [])],
  play(d, o) {
    toMeridian(d, strategy);
    const order = ["C08", "C10", "iona_ledger_note", "C09", "gate_panel", "C13", "district_controller"];
    for (const id of o.reverse ? [...order].reverse() : order) story(d, id, o);
    fromMeridian(d, strategy);
  },
});

/** S5's own site for each works action, read from its rules: the one site where
 * worksAction does not refuse with "the right part of the works". */
export function worksSite(action: WorksAction): StorySiteId {
  for (const site of ["meridian_gate_hall", "meridian_upper_hall"] as const) {
    const story = createStory();
    const out = worksAction(story, action, { site, carries: () => false, canPay: () => false, blueprints: new Set() });
    if (out.message !== WORKS_TEXT.site) return site;
  }
  throw new Error(`S5 accepts works action ${action} at neither hall`);
}
/** The interaction host the diver works at for a works site. */
const worksHost = (site: StorySiteId): string => site === "meridian_gate_hall" ? "gate_panel" : worksFaceId(site);

const ASSEMBLIES = { service_power_assembly: 1, service_air_assembly: 1 } as const;
/** Hall and food restorations, from S5's recipe costs (22 + 8 CU). */
const HALL_STOCK: Readonly<Record<string, number>> = (() => {
  const out: Record<string, number> = {};
  for (const r of ["restore_upper_hall", "restore_food_module"] as const)
    for (const [k, n] of Object.entries(STORY_RECIPES[r].cost)) out[k] = (out[k] ?? 0) + (n as number);
  return out;
})();
const cuOf = (items: Readonly<Record<string, number>>): number =>
  Object.entries(items).reduce((n, [k, q]) => n + ITEMS[k as ItemKind].cu * q, 0);

/** Run works actions at one site: park by its host, carry what the diver can (16 CU)
 * from the sortie hold, act. ASSUME: like S9's stops, a craft moored at the work face
 * lends its hold to the works' `canPay`; the harness never exceeds a real capacity. */
function worksVisit(d: Driver, actions: readonly WorksAction[], carryKinds: Readonly<Record<string, number>>): void {
  const site = worksSite(actions[0]!);
  if (actions.some((a) => worksSite(a) !== site)) throw new Error(`works actions ${actions.join(", ")} span two sites`);
  const host = worksHost(site), craftId = d.occupied()!.id;
  sortie(d, hostAt(d, host), `${site} works`, () => {
    const v = d.state.fleet.vehicles.find((x) => x.id === craftId)!;
    reach(d, v.id);
    for (const [kind, n] of Object.entries(carryKinds)) {
      const want = Math.min(n, Math.floor(d.freeCu("diver") / ITEMS[kind as ItemKind].cu));
      if (want > 0) move(d, kind as ItemKind, want, v.cargoId, "diver");
    }
    reach(d, host);
    for (const action of actions) {
      worksStep(d, action);
      // 5,400 active steps; the panel shows progress while the diver waits in reach.
      if (action === "equalize") d.waitFor("the gate to equalize", 100, (s) => s.story.works.gate === "equalized");
    }
  });
}
const worksMissing = (): Missing[] => [
  ...recipes("service_power_assembly", "service_air_assembly"),
  ...stories({ readOptional: true, reverse: false }, "gate_panel"),
  ...worksFace("meridian_upper_hall"),
  ...sites("meridian.gate_hall_panel"),
];
/** Two loads: the assemblies (12 CU) for the gate procedure, then the hall and food
 * stock (30 CU) for the upper hall and the turbine routing. They ride together when
 * the sortie hold has room (Creel rack, 96 CU), else in two trips (Mantle, 32 CU),
 * reloading from the carrier stores between them. ASSUME: a berthed craft's hold is
 * reachable from the carrier interior. */
const works = (strategy: Strategy): Phase => ({
  id: "works", title: "The return-gate works: power, air, isolate, equalize, open; hall, food, turbine power",
  missing: worksMissing,
  play(d) {
    make(d, "service_power_assembly", "workshop", ISLES);
    make(d, "service_air_assembly", "workshop", ISLES);
    enter(d, "workshop");
    const sortieHold = d.vehicle(strategy === "creel" ? "creel" : "mantle")!;
    const base = strategy === "creel" ? sortieHold : carrier(d);
    // Everything goes to the base hold (Creel rack, or the carrier stores) first.
    const load = (items: Readonly<Record<string, number>>, from: string, to: string): void => {
      if (d.freeCu(to) < cuOf(items)) throw new Blocked(`${to} has ${d.freeCu(to)} CU free; the load needs ${cuOf(items)} CU`, where(d.state));
      for (const [kind, n] of Object.entries(items)) {
        const short = n - d.count(kind as ItemKind, [to]);
        if (short > 0 && move(d, kind as ItemKind, short, from, to) < short) throw new Blocked(`${from} lacks ${short} ${kind} for the works`, where(d.state));
      }
    };
    carry(d, {});
    load(ASSEMBLIES, "diver", base.cargoId);
    load(HALL_STOCK, "workshop_locker", base.cargoId);
    const gate: WorksAction[] = ["install_power", "install_air", "isolate", "equalize", "open"];
    const hall: WorksAction[] = ["restore_hall", "restore_food"];
    if (strategy === "creel") {
      toMeridian(d, "creel");
      worksVisit(d, gate, ASSEMBLIES);
      worksVisit(d, hall, HALL_STOCK);
      worksVisit(d, ["route_power"], {});
      fromMeridian(d, "creel");
      return;
    }
    carrierTo(d, CARRIER_TO_SHELF);
    // The Mantle's free hold decides one trip or two (32 CU today: two).
    const together = cuOf(ASSEMBLIES) + cuOf(HALL_STOCK) <= d.freeCu(sortieHold.cargoId);
    const trips: [Readonly<Record<string, number>>, () => void][] = together
      ? [[{ ...ASSEMBLIES, ...HALL_STOCK }, () => { worksVisit(d, gate, ASSEMBLIES); worksVisit(d, hall, HALL_STOCK); worksVisit(d, ["route_power"], {}); }]]
      : [[ASSEMBLIES, () => worksVisit(d, gate, ASSEMBLIES)],
        [HALL_STOCK, () => { worksVisit(d, hall, HALL_STOCK); worksVisit(d, ["route_power"], {}); }]];
    for (const [items, visit] of trips) {
      load(items, base.cargoId, sortieHold.cargoId);
      launchMantle(d);
      visit();
      mantleHome(d);
    }
    carrierHome(d, CARRIER_TO_SHELF);
  },
});
const ending = (strategy: Strategy): Phase => ({
  id: "ending", title: "Pod buffer and C14, then the district controller's resolution",
  missing: () => [
    ...recipes("pod_buffer"),
    ...stories({ readOptional: true, reverse: false }, "C14", "district_controller"),
  ],
  play(d, o) {
    // The buffer's crust comes from the workshop stock; the pod bench takes the diver load.
    carryFromWorkshop(d, RECIPES.pod_buffer.cost as Record<string, number>);
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
    // Keel F2 A16 R6 (58 CU) and fit-out A6 G8 M8 C8 R4 (46 CU): one Creel rack load each.
    for (const recipe of ["hearthline_keel", "hearthline_base"]) {
      const cost = RECIPES[recipe as RecipeId].cost as Record<string, number>;
      stockUp(d, cost);
      const hold = d.vehicle("creel")!.cargoId;
      for (const [kind, n] of Object.entries(cost)) move(d, kind as ItemKind, n - d.count(kind as ItemKind, [hold]), "workshop_locker", hold);
      boardCraft(d, "creel");
      fly(d, "creel_out");
      followS2(d, "route.isles.workshop_stack");
      // The moored Creel's hold lends its stock to the yard's fabrication.
      siteCraft(d, "stack_yard", recipe);
      followS2(d, "route.isles.workshop_stack", true);
      fly(d, "creel_home");
      dockAndService(d, d.vehicle("creel")!);
    }
    if (!d.vehicle("hearthline")) throw new Blocked("The fit-out did not produce a Hearthline", where(d.state));
  },
};

/** Bring the workshop locker up to `cost`, gathering what it lacks from the isles and reef. */
function stockUp(d: Driver, cost: Readonly<Record<string, number>>): void {
  enter(d, "workshop");
  const bins = ["workshop_locker", "diver", ...d.state.fleet.vehicles.map((v) => v.cargoId)];
  const short: Partial<Record<ItemKind, number>> = {};
  for (const [kind, n] of Object.entries(cost)) {
    const left = n - d.count(kind as ItemKind, bins);
    if (left > 0) short[kind as ItemKind] = left;
  }
  if (Object.keys(short).length) procure(d, short, "workshop", ISLES);
  for (const v of d.state.fleet.vehicles) stowHold(d, v);
}

// ASSUME (carrier): the Hearthline is piloted like any hull, station keeping frees the
// helm, the diver walks the dry interior to the aft vestibule and leaves through it,
// and re-enters within 5 m of the exterior vestibule (sim/carrier.ts today).
const carrier = (d: Driver): VehicleState => {
  const h = d.vehicle("hearthline");
  if (!h) throw new Blocked("No Hearthline owned", where(d.state));
  return h;
};
/** Compact berths leave one walkway between bow and stern: the 0.84 m strip between
 * the berth-room walls, passable only on centre lines near x 0.0–0.1 (game movement). */
const COMPACT_LANE = { x: 0.05, aft: 5.6, fore: -3.4 } as const;
/** Walk the dry interior in the carrier frame, routed around its rooms, fixtures and
 * berthed craft (the game's own interior solids, queried read-only). */
function walkAboard(d: Driver, local: Vec3, label: string): void {
  const h = carrier(d), here = d.state.player.interiorPose?.position;
  if (!here) throw new Blocked(`Not inside the carrier to walk ${label}`, where(d.state));
  const solids = createWorldQueries(carrierInteriorSolids(d.state), () => -200), b = CARRIER_LAYOUT.interior;
  const open = (x: number, z: number): boolean => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ &&
    solids.clearance({ x, y: here.y + 0.02, z }, { radius: 0.36, height: 1.75 });
  const leg = (from: Vec3, to: Vec3): Vec3[] => gridPath(from, to, here.y, 0.25, 2, open, "interior");
  const crosses = d.state.fleet.docking?.configuration === "compact" &&
    ((here.z > COMPACT_LANE.aft && local.z < COMPACT_LANE.fore) || (here.z < COMPACT_LANE.fore && local.z > COMPACT_LANE.aft));
  let path: Vec3[];
  if (crosses) {
    const [near, far] = here.z > local.z ? [COMPACT_LANE.aft, COMPACT_LANE.fore] : [COMPACT_LANE.fore, COMPACT_LANE.aft];
    const a = { x: COMPACT_LANE.x, y: here.y, z: near }, z = { x: COMPACT_LANE.x, y: here.y, z: far };
    path = [...leg(here, a), z, ...leg(z, local)];
  } else path = leg(here, local);
  travel(d, route(`carrier ${label}`, "diver", "dry interior walk, A* over the interior solids, played",
    path.map((q, i) => ({ ...localToWorld(q, h), land: true, tolerance: i === path.length - 1 ? 0.5 : 0.08 }))));
}
/** From the helm: hold station, walk aft and swim out of the vestibule. */
function carrierOut(d: Driver): void {
  d.command({ type: "carrier", action: "station-keep" });
  d.command({ type: "carrier", action: "leave-helm" });
  walkAboard(d, CARRIER_LAYOUT.vestibule, "to the vestibule");
  d.command({ type: "carrier", action: "leave-interior" });
}
/** Back through the exterior vestibule, stow the diver hold in the stores, take the helm. */
function carrierIn(d: Driver): void {
  const h = carrier(d);
  // Within 1 m: the interface also refuses beyond 15 m of the keel datum, and the
  // vestibule sits 13.8 m out, so much of its 5 m entry radius is refused.
  travel(d, route("to the carrier vestibule", "diver", "local swim, played", [{ ...localToWorld(CARRIER_LAYOUT.exteriorVestibule, h), tolerance: 1 }]));
  d.command({ type: "carrier", action: "enter-interior" });
  unload(d, "diver", h.cargoId);
  walkAboard(d, CARRIER_LAYOUT.helm, "to the helm");
  d.command({ type: "carrier", action: "helm" });
}
/** At an S2 carrier mooring that lists "charge": hold station and ask for service. A
 * refusal is recorded; the run goes on with whatever charge the carrier has. */
function chargeAtMooring(d: Driver, site: string): void {
  const h = carrier(d);
  d.command({ type: "carrier", action: "station-keep" });
  const r = d.command({ type: "service", vehicleId: h.id }, { allowRefusal: true });
  if (!r.ok) {
    const note = `${site}: S2 lists charge here, but the Hearthline cannot be serviced (${r.message}); it arrived at ${h.charge.toFixed(0)}% power.`;
    if (!d.run.notes.includes(note)) d.run.notes.push(note);
  }
  d.command({ type: "carrier", action: "helm" }); // releases station keeping
}
/** Lattice from the 400 m carrier: hold station above the ledge and work it by suit. */
function carrierHarvest(d: Driver, id: string, want: number): void {
  pilotTo(d, `carrier above ${id}`, parkNear(d, SOURCES[id as SourceId].position));
  carrierOut(d);
  gather(d, id as SourceId, want);
  carrierIn(d);
}

const carrierDeep: Phase = {
  id: "carrier-deep", title: "Hearthline to the Divide lee mooring: lattice from the 400 m carrier; 550 m refit, Mantle, 800 m suit",
  missing: (d) => [
    ...recipes("hearthline_550", "mantle_base", "suit_800"),
    ...plans(d, "bp_deep_service", "C07", "rift_station_ledger"),
    ...need.hull("mantle"),
    ...sources("divide_lattice_ledge_west", "divide_lattice_ledge_east"),
    ...routes("route.isles.canopy_east", "route.canopy_east.basin", "route.basin.divide"),
    ...sites("divide.lee_mooring", "isles.stack_yard"),
  ],
  play(d) {
    boardCraft(d, "hearthline");
    // A long carrier phase: eat from the galley pantry between legs (C3: eat() reaches it aboard).
    for (const id of ["route.isles.canopy_east", "route.canopy_east.basin", "route.basin.divide"]) { eatIfHungry(d); followS2(d, id); }
    // Lattice: Hearthline 550 L6, Mantle L5, suit 800 L4, air assembly L2. S2's ledge
    // routes are medium-profile; the carrier flies swept local legs from the lee mooring
    // to hold station above each ledge.
    const lee = { x: 560, y: -390, z: -1120 };
    chargeAtMooring(d, "divide.lee_mooring");
    carrierHarvest(d, "divide_lattice_ledge_west", 10);
    pilotTo(d, "back to the lee mooring", lee);
    carrierHarvest(d, "divide_lattice_ledge_east", 10);
    pilotTo(d, "back to the lee mooring", lee);
    if (need.story("C07").length) d.deferred.push("C07");
    else {
      pilotTo(d, "carrier by C07", parkNear(d, hostAt(d, "C07")));
      carrierOut(d);
      interact(d, "C07");
      carrierIn(d);
    }
    for (const id of ["route.basin.divide", "route.canopy_east.basin", "route.isles.canopy_east"]) { eatIfHungry(d); followS2(d, id, true); }
    // At the yard: the 550 m refit and the Mantle, paid from the carrier stores.
    for (const recipe of ["hearthline_550", "mantle_base"]) {
      carrierOut(d);
      toWorkPose(d, "stack_yard", campaignSite("stack_yard")!.work);
      craft(d, recipe as RecipeId);
      carrierIn(d);
    }
    // ASSUME: the new Mantle is captured into the medium berth from the carrier interface.
    d.command({ type: "carrier", action: "station-keep" });
    d.command({ type: "carrier", action: "capture", vehicleId: d.vehicle("mantle")!.id });
    d.waitFor("the Mantle capture", 60, (s) => !s.fleet.docking?.transaction);
    if (!d.vehicle("mantle")!.berth) throw new Blocked("The Mantle is not berthed in the Hearthline", where(d.state));
    make(d, "suit_800" as RecipeId, "workshop", ISLES);
  },
};

export const CREEL_LATER: readonly Phase[] = [rift("creel"), divide, deepRecords("creel"), meridian("creel"), works("creel"), ending("creel")];
export const CARRIER_LATER: readonly Phase[] = [rift("carrier"), hearthline, carrierDeep, deepRecords("carrier"), meridian("carrier"), works("carrier"), ending("carrier")];
