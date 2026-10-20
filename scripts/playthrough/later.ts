/** Later phases, written ahead of C3 against S2's routes and sites, S5's story IDs
 * and works rules, and S9's recipes, sources and service sites. Each phase lists
 * the declared IDs it needs; until the build has all of them it reports
 * "pending C3" with that list. Once C3 lands they play like the live phases.
 *
 * Assumptions C3 should confirm (or adapt here) are marked ASSUME. */
import { HULL_BUILD, HULL_COLLIDERS, ITEMS, RECIPES, SOURCES } from "../../src/content/registry.js";
import type { ItemKind, RecipeId, SourceId } from "../../src/content/registry.js";
import { isOptional, siteOf, STORY_RECIPES } from "../../src/content/story/evidence.js";
import { STORY_PLACEMENTS } from "../../src/content/story/placements.js";
import { SITES } from "../../src/content/regions/sites.js";
import { parkPose } from "../../src/content/regions/access.js";
import { worldFloor } from "../../src/content/regions/worldFloor.js";
import type { DiscoveryId, StorySiteId } from "../../src/content/story/evidence.js";
import { WORKS_TEXT } from "../../src/content/story/works.js";
import type { WorksAction } from "../../src/content/story/works.js";
import { createStory } from "../../src/sim/story/state.js";
import { worksAction } from "../../src/sim/story/works.js";
import { interactions } from "../../src/sim/progression.js";
import { hullClearance, sweptHullClearance } from "../../src/sim/world.js";
import { CARRIER_LAYOUT, LAUNCH_LOCAL, launchPoint, localToWorld } from "../../src/sim/carrier.js";
import { SERVICE_MOORINGS } from "../../src/content/stops.js";
import type { GameCommand, Vec3, VehicleState } from "../../src/sim/types.js";
import { board, craft, gather, interact, leaveCraft, move, procure, reach, unload, eatIfHungry } from "./actions.js";
import { campaignSite, need, s2Route, worksFace, worksFaceId } from "./content.js";
import type { Missing } from "./content.js";
import { Blocked, Driver, where } from "./driver.js";
import { carry, dockAndService, make, stowHold } from "./live.js";
import type { Phase, PlayOptions } from "./live.js";
import { enter } from "./nav.js";
import { fly, pilotTo } from "./routes.js";
import { route, travel } from "./travel.js";
import { carrier, carrierIn, carrierOut, enterCarrier, exitCarrier, walkAboard } from "./carrierplay.js";
import { cargoCu, ferryFromCarrier, ferryToCarrier, loads, moveCargo } from "./cargo.js";
import type { Cargo } from "./cargo.js";

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
  eatIfHungry(d);
  const r = s2Route(id);
  const path = reverse ? [...r.path].reverse() : [...r.path];
  fly(d, { id: `${id}${reverse ? " (back)" : ""}`, source: `S2 ${id}, ${r.profile} profile`, points: path.map((p) => ({ ...p })) });
}
/** Long later phases (C3): eat at the workshop and carry three meals; eat()
 * reaches the diver hold anywhere, and followS2 eats between legs. */
function provision(d: Driver): void {
  ashoreFromCarrier(d);
  enter(d, "workshop");
  eatIfHungry(d, 70);
  procure(d, { meal: 3 }, "workshop", ISLES);
  carry(d, { meal: 3 });
}
/** Home from the carrier at the yard: service it at the stop, then ride the Creel
 * moored beside it back to the workshop slip. */
function ashoreFromCarrier(d: Driver): void {
  const h = d.vehicle("hearthline");
  if (!h || (d.state.player.controlledVehicleId !== h.id && d.state.player.interiorId !== h.id)) return;
  d.command({ type: "carrier", action: "station-keep" }, { allowRefusal: true });
  if (h.charge < 99 || h.health < 99) d.command({ type: "service", vehicleId: h.id }, { allowRefusal: true });
  d.command({ type: "carrier", action: "leave-helm" }, { allowRefusal: true });
  exitCarrier(d);
  boardCraft(d, "creel");
  pilotTo(d, "out of the yard", s2Route("route.isles.workshop_stack").path.at(-1)!);
  followS2(d, "route.isles.workshop_stack", true);
  fly(d, "creel_home");
  dockAndService(d, d.vehicle("creel")!);
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
/** C3: the S2 site hosting a placed story discovery has an authored craft park
 * pose with a proven final diver swim; use it when the craft fits there. */
function s2ParkFor(d: Driver, id: string): Vec3 | undefined {
  return s2ParkAt(d, siteOf(id as DiscoveryId));
}
function s2ParkAt(d: Driver, storySite: string): Vec3 | undefined {
  const placed = (STORY_PLACEMENTS as Record<string, { s2: string }>)[storySite];
  const site = placed && SITES.find((x) => x.id === placed.s2);
  const v = d.occupied();
  if (!site || !v) return undefined;
  const p = parkPose(site, worldFloor);
  return hullClearance(d.world, p, HULL_COLLIDERS[v.hull]) && -p.y <= v.rating ? p : undefined;
}
function sortie(d: Driver, at: Vec3, label: string, work: () => void, park?: Vec3): void {
  const v = d.occupied()!;
  // A host ashore: the craft stays afloat where the route ended; the diver walks in.
  if (at.y <= 0.5) {
    const s2park = park ?? (hullClearance(d.world, at, HULL_COLLIDERS[v.hull]) ? at : parkNear(d, at));
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
  sortie(d, hostAt(d, id), id, () => { interact(d, id); }, s2ParkFor(d, id));
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
    provision(d);
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
      chargeCraftAt(d, "divide.lee_mooring");
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
  // Capture takes an idle craft within 13 m of the launch point, under the keel lock.
  const mantle = d.vehicle("mantle")!, h = carrier(d);
  // Line up astern on the corridor axis, then ease in to the launch point.
  pilotTo(d, "astern of the launch corridor", localToWorld({ ...LAUNCH_LOCAL, y: LAUNCH_LOCAL.y - 1, z: LAUNCH_LOCAL.z - 10 }, h));
  fly(d, { id: "into the launch corridor", source: "harness: local leg, swept", points: [{ ...launchPoint(h, mantle), tolerance: 1.5 }] });
  leaveCraft(d);
  d.waitFor("the Mantle to settle", 20, (s) => {
    const v = s.fleet.vehicles.find((x) => x.id === mantle.id)!.velocity;
    return Math.hypot(v.x, v.y, v.z) <= 1;
  });
  // Capture from the interface inside the vestibule: taking the helm would turn the
  // carrier and swing the corridor off the waiting craft.
  enterCarrier(d);
  unload(d, "diver", h.cargoId);
  d.command({ type: "carrier", action: "station-keep" }, { allowRefusal: true });
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
    followS2(d, "route.basin.legacy_anchorage");
    followS2(d, "route.basin.divide");
    // C3: S2's moorings charge; top up before the service ledge and the terraces.
    chargeCraftAt(d, "divide.lee_mooring");
    followS2(d, "route.divide.service_ledge");
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
    chargeCraftAt(d, "meridian.staging_shelf");
    followS2(d, "route.divide.service_ledge", true);
    chargeCraftAt(d, "divide.lee_mooring");
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
    provision(d);
    toMeridian(d, strategy);
    const order = ["C08", "C10", "iona_ledger_note", "C09", "gate_panel", "C13", "district_controller"];
    const deep = new Set(["C09", "gate_panel", "C13", "district_controller"]);
    let down = false;
    for (const id of o.reverse ? [...order].reverse() : order) {
      // The gate hall and service window lie 170 m below the terraces: charge at the
      // shelf, then fly S2's terrace route down (and back up before leaving).
      if (strategy === "creel" && deep.has(id) && !down) {
        chargeCraftAt(d, "meridian.staging_shelf");
        followS2(d, "route.meridian.terraces");
        down = true;
      } else if (strategy === "creel" && !deep.has(id) && down) {
        followS2(d, "route.meridian.terraces", true);
        down = false;
      }
      story(d, id, o);
    }
    if (down) followS2(d, "route.meridian.terraces", true);
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

/** Hall and food restorations, from S5's recipe costs (22 + 8 CU). */
const HALL_STOCK: Readonly<Record<string, number>> = (() => {
  const out: Record<string, number> = {};
  for (const r of ["restore_upper_hall", "restore_food_module"] as const)
    for (const [k, n] of Object.entries(STORY_RECIPES[r].cost)) out[k] = (out[k] ?? 0) + (n as number);
  return out;
})();

/** Run works actions at one site: park by its host, take the tracked cargo (and as
 * much stock as the 16 CU diver can carry) out of the sortie hold beside the craft,
 * then act at the host. ASSUME: like S9's stops, a craft moored at the work face lends
 * its hold to the works' `canPay` for stock the diver cannot carry. */
function worksVisit(d: Driver, actions: readonly WorksAction[], take: Cargo): void {
  const site = worksSite(actions[0]!);
  if (actions.some((a) => worksSite(a) !== site)) throw new Error(`works actions ${actions.join(", ")} span two sites`);
  const host = worksHost(site), craftId = d.occupied()!.id;
  sortie(d, hostAt(d, host), `${site} works`, () => {
    const v = d.state.fleet.vehicles.find((x) => x.id === craftId)!;
    reach(d, v.id);
    // Room for the assemblies: the diver's meals wait in the hold for this visit.
    const meals = cargoCu(d, take) > d.freeCu("diver") ? d.count("meal", ["diver"]) : 0;
    if (meals) move(d, "meal", meals, "diver", v.cargoId);
    const first = loads(d, take, d.freeCu("diver"))[0];
    if (take.ids.length && (!first || first.ids.length !== take.ids.length))
      throw new Blocked(`The diver cannot carry the ${take.ids.length} assemblies at once`, where(d.state));
    if (first) moveCargo(d, first, v.cargoId, "diver");
    reach(d, host);
    for (const action of actions) {
      worksStep(d, action);
      // 5,400 active steps; the panel shows progress while the diver waits in reach.
      if (action === "equalize") d.waitFor("the gate to equalize", 100, (s) => s.story.works.gate === "equalized");
    }
    for (const id of take.ids)
      if (d.state.inventory.items.some((i) => i.id === id)) throw new Blocked(`The works did not consume assembly ${id}`, where(d.state));
    if (meals) { reach(d, v.id); move(d, "meal", meals, v.cargoId, "diver"); }
  }, s2ParkAt(d, site));
}
const worksMissing = (): Missing[] => [
  ...recipes("service_power_assembly", "service_air_assembly"),
  ...stories({ readOptional: true, reverse: false }, "gate_panel"),
  ...worksFace("meridian_upper_hall"),
  ...sites("meridian.gate_hall_panel"),
];
/** Craft the two assemblies and stock the hall and food restorations, then load all
 * of it into the moored Creel's hold at the workshop bench (both containers local).
 * Returns the tracked cargo: assembly instance IDs and stock quantities. */
export function stageWorksCargo(d: Driver): Cargo {
  const creel = d.vehicle("creel");
  if (!creel) throw new Blocked("No Creel to carry the works cargo", where(d.state));
  const ids: string[] = [];
  for (const recipe of ["service_power_assembly", "service_air_assembly"] as const) {
    // The 6 CU output lands in the diver hold: travel light, then stow it in the
    // moored Creel at once (the bench reaches both holds).
    carry(d, {});
    const before = new Set(d.state.inventory.items.map((i) => i.id));
    // Crust for the assemblies grows on the Canopy fins; the 800 m suit swims there (C3).
    make(d, recipe, "workshop", [...ISLES, "suspended_garden", "silt_basin"]);
    const made = d.state.inventory.items.find((i) => i.kind === recipe && !before.has(i.id));
    if (!made) throw new Error(`harness: crafting ${recipe} produced no new item`);
    ids.push(made.id);
    moveCargo(d, { ids: [made.id], stock: {} }, "diver", creel.cargoId);
  }
  stockUp(d, HALL_STOCK);
  enter(d, "workshop");
  const cargo: Cargo = { ids, stock: { ...HALL_STOCK } };
  const stockCu = cargoCu(d, { ids: [], stock: cargo.stock });
  if (d.freeCu(creel.cargoId) < stockCu)
    throw new Blocked(`The Creel hold has ${d.freeCu(creel.cargoId)} CU free; the works stock is ${stockCu} CU more`, where(d.state));
  moveCargo(d, cargo, "workshop_locker", creel.cargoId);
  return cargo;
}
/** The works by strategy. Creel: one trip, the rack holds all 42 CU. Carrier: the Creel
 * ferries the cargo to the carrier at the yard (diver loads through the vestibule into
 * the stores); at the shelf each Mantle trip is loaded from the stores through the
 * vestibule after its launch, and fits the Mantle's free hold. */
const works = (strategy: Strategy): Phase => ({
  id: "works", title: "The return-gate works: power, air, isolate, equalize, open; hall, food, turbine power",
  missing: worksMissing,
  play(d) {
    provision(d);
    const cargo = stageWorksCargo(d);
    const assemblies: Cargo = { ids: cargo.ids, stock: {} }, stock: Cargo = { ids: [], stock: cargo.stock };
    const gate: WorksAction[] = ["install_power", "install_air", "isolate", "equalize", "open"];
    const hall: WorksAction[] = ["restore_hall", "restore_food"];
    if (strategy === "creel") {
      toMeridian(d, "creel");
      // The gate hall lies 170 m below the upper hall: down S2's terrace route and back
      // up for each gate visit (route power needs the hall restored first).
      const atGate = (visit: () => void): void => {
        chargeCraftAt(d, "meridian.staging_shelf");
        followS2(d, "route.meridian.terraces");
        visit();
        followS2(d, "route.meridian.terraces", true);
      };
      atGate(() => worksVisit(d, gate, assemblies));
      worksVisit(d, hall, stock);
      atGate(() => worksVisit(d, ["route_power"], { ids: [], stock: {} }));
      fromMeridian(d, "creel");
      return;
    }
    // Ferry to the carrier at the yard, then sail it to the district shelf.
    const creel = d.vehicle("creel")!;
    boardCraft(d, "creel");
    fly(d, "creel_out");
    followS2(d, "route.isles.workshop_stack");
    const h = carrier(d), vestibule = localToWorld(CARRIER_LAYOUT.exteriorVestibule, h);
    pilotTo(d, "beside the carrier", clearOfBuilds(d, "stack_yard", parkNear(d, { ...vestibule, y: vestibule.y - 6 })));
    leaveCraft(d);
    d.command({ type: "carrier", action: "station-keep" });
    ferryToCarrier(d, creel.id, cargo);
    carrierIn(d);
    carrierTo(d, CARRIER_TO_SHELF);
    const mantle = d.vehicle("mantle")!;
    const together = cargoCu(d, cargo) <= d.freeCu(mantle.cargoId);
    const trips: [Cargo, () => void][] = together
      ? [[cargo, () => { worksVisit(d, gate, assemblies); worksVisit(d, hall, stock); worksVisit(d, ["route_power"], { ids: [], stock: {} }); }]]
      : [[assemblies, () => worksVisit(d, gate, assemblies)],
        [stock, () => { worksVisit(d, hall, stock); worksVisit(d, ["route_power"], { ids: [], stock: {} }); }]];
    for (const [items, visit] of trips) {
      if (cargoCu(d, items) > d.freeCu(mantle.cargoId))
        throw new Blocked(`The Mantle hold has ${d.freeCu(mantle.cargoId)} CU free; this trip needs ${cargoCu(d, items)} CU`, where(d.state));
      d.command({ type: "carrier", action: "launch", vehicleId: mantle.id });
      d.waitFor("the Mantle launch", 60, (s) => !s.fleet.docking?.transaction);
      ferryFromCarrier(d, mantle.id, items);
      exitCarrierToBoard(d, mantle.id);
      visit();
      mantleHome(d);
    }
    carrierHome(d, CARRIER_TO_SHELF);
  },
});
function exitCarrierToBoard(d: Driver, vehicleId: string): void {
  exitCarrier(d);
  reach(d, vehicleId);
  board(d, vehicleId);
}

const ending = (strategy: Strategy): Phase => ({
  id: "ending", title: "Pod buffer and C14, then the district controller's resolution",
  missing: () => [
    ...recipes("pod_buffer"),
    ...stories({ readOptional: true, reverse: false }, "C14", "district_controller"),
  ],
  play(d, o) {
    // The buffer's crust comes from the workshop stock; the pod bench takes the diver load.
    // Crust grows back slowly on the isles; the 800 m suit takes the Canopy fins too (C3).
    stockUp(d, RECIPES.pod_buffer.cost as Record<string, number>);
    carryFromWorkshop(d, RECIPES.pod_buffer.cost as Record<string, number>);
    make(d, "pod_buffer", "pod", ["refuge_reef", "island_chain"]);
    enter(d, "pod");
    if (!d.knows("C14")) { interact(d, "C14"); if (!d.knows("C14")) throw new Blocked("C14 recorded nothing", where(d.state)); }
    toMeridian(d, strategy);
    if (strategy === "creel") {
      chargeCraftAt(d, "meridian.staging_shelf");
      followS2(d, "route.meridian.terraces");
    }
    sortie(d, hostAt(d, "district_controller"), "resolution", () => {
      reach(d, "district_controller");
      for (const a of ["begin", "complete"] as const) {
        const r = d.command(resolutionCommand(a), { allowRefusal: true });
        if (!r.ok) throw new Blocked(`Resolution ${a} refused: ${r.message}`, where(d.state));
      }
    }, s2ParkFor(d, "district_controller"));
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
  if (Object.keys(short).length) procure(d, short, "workshop", [...ISLES, "suspended_garden", "silt_basin"]);
  for (const v of d.state.fleet.vehicles) stowHold(d, v);
}

/** At an S2 carrier mooring that lists "charge": hold station and ask for service. A
 * refusal is recorded; the run goes on with whatever charge the carrier has. */
/** C3: every S2 mooring that lists charge services any craft moored there. */
function chargeCraftAt(d: Driver, site: string): void {
  const m = SERVICE_MOORINGS.find((x) => x.id === site);
  if (!m) throw new Error(`No charging mooring ${site}`);
  pilotTo(d, `moor at ${site} to charge`, m.position);
  const v = d.occupied()!;
  d.command({ type: "service", vehicleId: v.id }, { allowRefusal: true });
}
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
  // A diver load per trip out of the vestibule, stowed in the stores between.
  for (let got = 0, trip = 0; trip < 6 && got < want; trip++) {
    carrierOut(d);
    const n = gather(d, id as SourceId, want - got);
    carrierIn(d);
    if (!n) break;
    got += n;
  }
}

/** The carrier route's suit 450, Hearthline 550, Mantle and suit 800 take 26 ceramic;
 * the two Rift lips hold 24. The deep seam (398 m) is a 450 m suit dive from the
 * 350 m Creel holding at 340 m above it, past the south lip. */
function seamTrip(d: Driver, want: number): void {
  const seam = SOURCES.rift_ceramic_deep_seam.position, lip = s2Route("route.rift.ceramic").path.at(-1)!;
  provision(d);
  boardCraft(d, "creel");
  fly(d, "creel_out");
  fly(d, "basin_outbound");
  followS2(d, "route.basin.legacy_anchorage");
  followS2(d, "route.basin.rift");
  followS2(d, "route.rift.ceramic");
  sortie(d, seam, "rift_ceramic_deep_seam", () => { gather(d, "rift_ceramic_deep_seam", want); }, { x: seam.x, y: -340, z: seam.z });
  pilotTo(d, "back to the south lip", lip);
  followS2(d, "route.rift.ceramic", true);
  followS2(d, "route.basin.rift", true);
  homeAndUnload(d, [["route.basin.legacy_anchorage", true]]);
}
const YARD_RECIPES = ["hearthline_550", "mantle_base"] as const satisfies readonly RecipeId[];
/** At the yard: the bench reaches the moored carrier's stores, like any moored hold. */
function yardCraft(d: Driver, recipe: RecipeId): void {
  carrierOut(d);
  toWorkPose(d, "stack_yard", campaignSite("stack_yard")!.work);
  const stores = carrier(d).cargoId;
  const short = Object.entries(RECIPES[recipe].cost as Record<string, number>)
    .filter(([k, n]) => d.count(k as ItemKind, ["diver", stores]) < n).map(([k, n]) => `${k} ${d.count(k as ItemKind, ["diver", stores])}/${n}`);
  if (short.length) throw new Blocked(`${recipe} at the yard: the stores and diver hold ${short.join(", ")}`, where(d.state));
  craft(d, recipe);
  carrierIn(d);
}
/** Ride the Creel to the carrier at the yard with `cargo` in its hold, ferry it into
 * the stores and step aboard (the Creel stays moored beside the carrier). */
function boardHearthlineWith(d: Driver, cargo: Cargo): void {
  const creel = d.vehicle("creel")!;
  boardCraft(d, "creel");
  fly(d, "creel_out");
  followS2(d, "route.isles.workshop_stack");
  const h = carrier(d), vestibule = localToWorld(CARRIER_LAYOUT.exteriorVestibule, h);
  pilotTo(d, "beside the carrier", clearOfBuilds(d, "stack_yard", parkNear(d, { ...vestibule, y: vestibule.y - 6 })));
  leaveCraft(d);
  d.command({ type: "carrier", action: "station-keep" }, { allowRefusal: true });
  ferryToCarrier(d, creel.id, cargo);
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
    provision(d);
    // The yard's refit and Mantle are paid from the carrier stores, which the yard
    // bench reaches while the carrier is moored there. Stock all but the Divide lattice
    // into the stores now: the Creel brings it to the yard, the diver ferries it aboard.
    const yardCost: Record<string, number> = {};
    for (const recipe of YARD_RECIPES)
      for (const [kind, n] of Object.entries(RECIPES[recipe].cost as Record<string, number>))
        if (kind !== "brine_lattice") yardCost[kind] = (yardCost[kind] ?? 0) + n;
    const ceramic = [...YARD_RECIPES, "suit_800" as const].reduce((n, r) => n + ((RECIPES[r].cost as Record<string, number>).pressure_ceramic ?? 0), 0);
    const held = d.count("pressure_ceramic", ["workshop_locker", "diver", ...d.state.fleet.vehicles.map((v) => v.cargoId)]);
    if (held < ceramic) seamTrip(d, ceramic - held);
    const hold = carrier(d).cargoId, creel = d.vehicle("creel")!;
    const ferry: Record<string, number> = {};
    for (const [kind, n] of Object.entries(yardCost)) {
      const left = n - d.count(kind as ItemKind, [hold]);
      if (left > 0) ferry[kind] = left;
    }
    if (Object.keys(ferry).length) {
      stockUp(d, ferry);
      for (const [kind, n] of Object.entries(ferry)) move(d, kind as ItemKind, n - d.count(kind as ItemKind, [creel.cargoId]), "workshop_locker", creel.cargoId);
      boardHearthlineWith(d, { ids: [], stock: ferry });
    }
    boardCraft(d, "hearthline");
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
    for (const recipe of YARD_RECIPES) yardCraft(d, recipe);
    // The new Mantle is captured into the medium berth from the carrier interface once
    // flown into the launch corridor (C3: capture refuses a craft beyond 13 m of it).
    // The empty carrier is rebuilt from two compact berths to one medium at the yard.
    if (d.state.fleet.docking?.configuration !== "medium") {
      d.command({ type: "carrier", action: "station-keep" });
      d.command({ type: "carrier", action: "reconfigure" });
    }
    carrierOut(d);
    boardCraft(d, "mantle");
    // The Mantle's slip lies east of the cradle wall: round its south end.
    pilotTo(d, "round the east cradle", { x: 503, y: -12, z: 28 });
    pilotTo(d, "round the east cradle", { x: 483, y: -16.4, z: 28 });
    mantleHome(d);
    if (!d.vehicle("mantle")!.berth) throw new Blocked(`The Mantle is not berthed in the Hearthline: ${d.state.feedback}`, where(d.state));
    // The suit refit is a workshop recipe: carry its Divide stock home in the diver hold
    // and ride the Creel back from beside the carrier.
    // Only the lattice is not at the workshop: the suit's and the works' air assembly's.
    const stores = carrier(d).cargoId, lattice = (RECIPES.suit_800.cost as Record<string, number>).brine_lattice! +
      (STORY_RECIPES.service_air_assembly.cost as Record<string, number>).brine_lattice!;
    if (d.freeCu("diver") < lattice * ITEMS.brine_lattice.cu) move(d, "meal", d.count("meal", ["diver"]), "diver", stores);
    const room = Math.floor(d.freeCu("diver") / ITEMS.brine_lattice.cu);
    if (room < lattice) throw new Blocked(`The diver hold takes ${room} of the ${lattice} lattice for the workshop: ${d.state.inventory.items.filter((i) => i.containerId === "diver").map((i) => `${i.kind} ${i.quantity}`).join(", ")}`, where(d.state));
    move(d, "brine_lattice", Math.min(lattice, d.count("brine_lattice", [stores])), stores, "diver");
    ashoreFromCarrier(d);
    make(d, "suit_800" as RecipeId, "workshop", ISLES);
  },
};

export const CREEL_LATER: readonly Phase[] = [rift("creel"), divide, deepRecords("creel"), meridian("creel"), works("creel"), ending("creel")];
export const CARRIER_LATER: readonly Phase[] = [rift("carrier"), hearthline, carrierDeep, deepRecords("carrier"), meridian("carrier"), works("carrier"), ending("carrier")];
