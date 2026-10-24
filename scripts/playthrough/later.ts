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
import { interactions, recipeSites } from "../../src/sim/progression.js";
import { available, containerAccessible } from "../../src/sim/inventory.js";
import { hullClearance, sweptHullClearance } from "../../src/sim/world.js";
import { CARRIER_LAYOUT, LAUNCH_LOCAL, launchPoint, localToWorld } from "../../src/sim/carrier.js";
import { SERVICE_MOORINGS, WORKING_STOPS } from "../../src/content/stops.js";
import type { GameCommand, Vec3, VehicleState } from "../../src/sim/types.js";
import { board, craft, gather, interact, leaveCraft, move, procure, reach, unload, eatIfHungry } from "./actions.js";
import { campaignSite, need, s2Route, worksFace, worksFaceId } from "./content.js";
import type { Missing } from "./content.js";
import { Blocked, Driver, where } from "./driver.js";
import { carry, dockAndService, make, stowHold } from "./live.js";
import type { Phase, PlayOptions } from "./live.js";
import { atWorkshop, enter, inPod } from "./nav.js";
import { pressButton } from "./ui.js";
import { fly, pilotTo } from "./routes.js";
import { dist, route, travel } from "./travel.js";
import { addStock, costOf, describe, isEmpty, planExpedition, shortfall } from "./stock.js";
import type { Plannable, Reservation, Stock } from "./stock.js";
import { carrier, carrierIn, carrierOut, enterCarrier, exitCarrier, walkAboard } from "./carrierplay.js";
import { cargoCu, ferryFromCarrier, ferryToCarrier, loads, moveCargo } from "./cargo.js";
import type { Cargo } from "./cargo.js";
import { all, berthed, crafted, custom, facility, hull, known, suit } from "./outcomes.js";

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
/** At home: ashore near the workshop or the pod, or aboard the carrier moored at the yard. */
function atHome(d: Driver): boolean {
  const h = d.vehicle("hearthline"), p = d.state.player.pose.position;
  if (h && (d.state.player.controlledVehicleId === h.id || d.state.player.interiorId === h.id))
    return Math.hypot(h.pose.position.x - WORKING_STOPS.stack_yard.work.x, h.pose.position.z - WORKING_STOPS.stack_yard.work.z) < 120;
  return atWorkshop(d) || inPod(d) || Math.hypot(p.x - 10, p.z + 35) < 120;
}
/** PACE-1 R1: eat where you are, and carry `meals`. At home that is the workshop and its
 * crops, as before; away it is the diver hold, the craft piloted and the carrier's
 * stores when aboard. A phase never begins with a trip home to eat; followS2 eats
 * between legs. */
export function provision(d: Driver, meals = 3): void {
  if (atHome(d)) {
    ashoreFromCarrier(d);
    enter(d, "workshop");
    eatIfHungry(d, 70);
    procure(d, { meal: 3 }, "workshop", ISLES);
    carry(d, { meal: 3 });
    return;
  }
  eatIfHungry(d, 70);
  const h = d.vehicle("hearthline"), v = d.state.player.controlledVehicleId ? d.occupied() : null;
  const from = [...(v ? [v.cargoId] : []), ...(h && d.state.player.interiorId === h.id ? [h.cargoId] : [])];
  for (const c of from) {
    const short = meals - d.count("meal", ["diver"]);
    if (short > 0 && containerAccessible(d.state, c)) move(d, "meal", Math.min(short, d.count("meal", [c])), c, "diver");
  }
}

/** PACE-1 R2: what an expedition will consume of `items`, from the recipes the bot
 * knows it will make and the clues it has read (never a plan it doesn't hold). */
function planned(d: Driver, make: readonly Plannable[], items?: readonly string[], extra?: readonly Reservation[]): Stock {
  return planExpedition({ recipes: make, blueprints: d.state.knowledge.blueprints, seen: d.state.knowledge.scans,
    ...(items ? { items } : {}), ...(extra ? { extra } : {}) }).needs;
}
/** The recipes of `ids` not yet made: a plan stops reserving for work already done. */
const toMake = <T extends Plannable>(d: Driver, ids: readonly T[]): T[] => ids.filter((id) => !d.crafted(id));
/** Materials found only beyond the Basin: gathered where they lie, never stocked at home. */
const FRONTIER = ["pressure_ceramic", "thermal_core", "brine_lattice"];
const COMMONS = (s: Stock): string[] => Object.keys(s).filter((k) => !FRONTIER.includes(k));

/** The facility a fabrication site needs restored before its bench runs. */
const SITE_FACILITY: Readonly<Record<string, string | null>> = {
  island_workshop: "island_workshop", crown_station: "crown_dock", rift_station: "rift_station", divide_dock: "divide_dock",
  canopy_stop: "canopy_stop", pod_fabricator: "pod_fabricator", home_pod: null, stack_yard: null, meridian_office: null,
};
/** The nearest source of `item` with exposed stock, and how far it is. */
function nearestStock(d: Driver, item: string): string {
  const p = d.state.player.pose.position;
  const best = (Object.keys(SOURCES) as SourceId[])
    .filter((id) => SOURCES[id].item === item && (d.state.world.resources.find((n) => n.id === id)?.stock ?? 0) > 0)
    .map((id) => ({ id, m: dist(p, SOURCES[id].position) })).sort((a, b) => a.m - b.m)[0];
  return best ? `${best.id} ${Math.round(best.m)} m` : "none with exposed stock";
}
/** PACE-1 R9: log why the bot travels back, from the game's own authorities: where each
 * recipe runs (`recipeSites`, and whether that site is restored) and, per material,
 * what the holds in reach (`available` over `bins`) hold against the nearest source
 * with stock. `kind`: forced (only behind), chosen (a purposeful trip) or pending (a
 * coordinator-deferred change). The run notes keep every line. */
function logReturn(d: Driver, kind: "forced" | "chosen" | "pending", label: string, make: readonly Plannable[], bins: readonly string[]): void {
  const lines = make.map((id) => {
    const at = Object.hasOwn(RECIPES, id)
      ? recipeSites(id as RecipeId).map((s) => `${s}${SITE_FACILITY[s] && !d.facility(SITE_FACILITY[s]!) ? " (not restored)" : ""}`).join(" or ")
      : `its own site (${STORY_RECIPES[id as keyof typeof STORY_RECIPES].site})`;
    const lacking = Object.entries(costOf(id)).flatMap(([k, n]) => {
      const have = available(d.state, k as ItemKind, [...bins]);
      return have >= (n ?? 0) ? [] : [`${k} ${have}/${n} in reach, nearest ${nearestStock(d, k)}`];
    });
    return `${id}: made at ${at}${lacking.length ? `; ${lacking.join("; ")}` : ""}`;
  });
  d.run.notes.push(`return ${kind} (${d.phase}, tick ${d.state.tick}): ${label}${lines.length ? `. ${lines.join(" | ")}` : ""}`);
}
/** The holds the diver can draw on from here: the diver, the craft piloted or moored
 * close by, and the carrier's stores when aboard or beside it. */
function binsHere(d: Driver): string[] {
  const p = d.state.player.pose.position;
  return ["diver", ...d.state.fleet.vehicles.filter((v) => !v.berth && dist(v.pose.position, p) < 40).map((v) => v.cargoId)];
}
/** PACE-1 scenario A/B measurement: ticks from the last district record to the first
 * works step, by the bot's clock (active and idle). The timeline gives the play time. */
const marks = new WeakMap<Driver, Record<string, number>>();
function mark(d: Driver, label: string): void {
  const m = marks.get(d) ?? {};
  marks.set(d, m);
  if (m[label] !== undefined) return;
  m[label] = d.state.tick;
  if (label === "first works step" && m["last district record"] !== undefined)
    d.run.notes.push(`scenario A (workshop return${d.run.strategy === "creel" ? "" : ", by carrier"}): ` +
      `${((d.state.tick - m["last district record"]!) / 3600).toFixed(1)} min from the last district record to the first works step`);
}
/** The charge (%) below which the craft tops up at the shelf before the district's deep
 * legs: the terraces, the gate hall and the far records can take 60% of a charge. */
const DISTRICT_CHARGE = 85;
/** PACE-1 R7: charge when the next legs need it, not at every stop passed. */
function topUp(d: Driver, site: string, below = 60): void {
  if ((d.occupied()?.charge ?? 100) < below) chargeCraftAt(d, site);
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
/** `composed`: the point is the site's composed mooring (a finding when it blocks a
 * build), not a harness park beside the carrier. */
function clearOfBuilds(d: Driver, site: string, mooring: Vec3, composed = true): Vec3 {
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
      if (composed && !d.run.notes.includes(note)) d.run.notes.push(note);
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
function harvest(d: Driver, id: string, want: number, options: { sort?: boolean } = {}): void {
  const def = SOURCES[id as SourceId];
  let got = 0;
  for (let trip = 0; trip < 6 && got < want; trip++) {
    const node = d.state.world.resources.find((n) => n.id === id)!;
    const hold = d.occupied()!.cargoId;
    if ((node.stock <= 0 && !(options.sort && node.reserve > 0)) || d.freeCu(hold) < ITEMS[def.item].cu * def.bundle) break;
    // Never more than the craft's hold takes when the diver ferries it back.
    const room = Math.floor(d.freeCu(hold) / ITEMS[def.item].cu);
    sortie(d, def.position, id, () => { got += gather(d, id as SourceId, Math.min(want - got, room), options); });
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
export function boardCraft(d: Driver, hull: VehicleState["hull"]): void {
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
    pilotTo(d, "beside the carrier", clearOfBuilds(d, "stack_yard", parkNear(d, { ...vestibule, y: vestibule.y - 6 }), false));
    leaveCraft(d);
  }
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

/** C4: the Divide's east-ledge route end and a hold over the 450 m north flank.
 * (HUB-2: the carrier route now returns from the Rift by the crown, not the
 * western return.) */
const DIVIDE_EAST_LEDGE = { x: 749, y: -368, z: -1191 } as const;
const DIVIDE_LEE = { x: 560, y: -390, z: -1120 } as const;
const DIVIDE_FLANK_PARK = { x: 958, y: -438, z: -1128 } as const;

/** Rift: restore the materials station, read its ledger, take ceramic and core;
 * then the 450 m suit and Creel refits. */
const rift = (strategy: "creel" | "carrier"): Phase => ({
  id: "rift", title: "Ember Rift: station restored, ledger, ceramic and core; 450 m suit" + (strategy === "creel" ? " and Creel" : ""),
  verify: all(crafted("restore_rift_station", "suit_450"), facility("rift_station"), suit(450), strategy === "creel" ? hull("creel", 450) : hull("creel"),
    // HUB-2: the carrier route restores the crown station on the way and refits the suit there.
    ...(strategy === "carrier" ? [crafted("restore_crown_power", "restore_crown_dock"), facility("crown_dock")] : [])),
  missing: (d) => [
    ...recipes("suit_450", "restore_rift_station", ...(strategy === "creel" ? ["creel_450"] : ["restore_crown_power", "restore_crown_dock"])),
    ...(strategy === "carrier" ? [...routes("route.hub.balcony"), ...sites("hub.crown_station")] : []),
    ...sources("rift_ceramic_lip_north", "rift_ceramic_lip_south", "rift_core_lower_north", "rift_core_lower_west"),
    ...routes("route.basin.legacy_anchorage", "route.basin.rift", "route.rift.ceramic"),
    ...sites("rift.materials_station"),
    ...(d.vehicle("creel") ? [] : [{ key: "owned:creel", text: "an owned Creel" }]),
  ],
  play(d, o) {
    // The independent route stages the station's restoration in the Creel hold with the rest.
    if (strategy === "creel") stageForwardBase(d);
    else stageCrown(d);
    boardCraft(d, "creel");
    fly(d, "creel_out");
    fly(d, "basin_outbound");
    followS2(d, "route.basin.legacy_anchorage");
    if (strategy === "creel") deployForwardBase(d);
    else {
      // HUB-2: up the crown's north cliff from the anchorage to restore power and air,
      // then the dock and fabricator, each a diver load from the hold; back down.
      followS2(d, "route.hub.balcony");
      for (const stage of ["restore_crown_power", "restore_crown_dock"] as const) siteCraft(d, "crown_station", stage);
      followS2(d, "route.hub.balcony", true);
    }
    followS2(d, "route.basin.rift");
    siteCraft(d, "rift_station", "restore_rift_station");
    story(d, "rift_station_ledger", o);
    // PACE-1 R2: ceramic for the refits the ledger and earlier plans have shown (Creel:
    // suits and Creel to 450 and 800; carrier: suits, the 550 m refit and the Mantle),
    // never for a plan not read. R6: sort a lip's reserve before looking farther.
    const ceramic = planned(d, strategy === "creel" ? ["suit_450", "creel_450", "creel_800", "suit_800"]
      : ["suit_450", "hearthline_550", "mantle_base", "suit_800"], ["pressure_ceramic"]).pressure_ceramic ?? 0;
    const lip = (id: SourceId): void => {
      const want = ceramic - d.count("pressure_ceramic");
      if (want > 0) harvest(d, id, want, { sort: true });
    };
    const exposed = (id: SourceId): number => d.state.world.resources.find((n) => n.id === id)?.stock ?? 0;
    // Exposed stock first on both lips; the sorted reserve only for what is still short.
    if (ceramic - d.count("pressure_ceramic") > 0) harvest(d, "rift_ceramic_lip_north", Math.min(exposed("rift_ceramic_lip_north"), ceramic - d.count("pressure_ceramic")));
    followS2(d, "route.rift.ceramic");
    lip("rift_ceramic_lip_south");
    followS2(d, "route.rift.ceramic", true);
    lip("rift_ceramic_lip_north");
    // Core: suit 450 K1, Creel 450 K2, Creel 800 K3, suit 800 K1 (carrier: keel K2,
    // suit 450 K1, Mantle K4, suit 800 K1). C4 (CB): the shoulder's inclusions are too
    // thin; the first workable core is the 350 m lower ledge below it. PACE-1 R2: not the
    // power assembly's, whose plan is read only at the Divide (Sol R1 F1's twin).
    const core = (planned(d, toMake(d, strategy === "creel" ? ["suit_450", "creel_450", "creel_800", "suit_800"]
      : ["hearthline_keel", "suit_450", "mantle_base", "suit_800"]), ["thermal_core"]).thermal_core ?? 0) - d.count("thermal_core");
    if (core > 0) harvest(d, "rift_core_lower_north", core, { sort: true });
    if (strategy === "creel") {
      // C4: the restored station does the 450 m refits; the forward outpost at the
      // anchorage charges the Creel.
      for (const recipe of ["suit_450", "creel_450"] as const) siteCraft(d, "rift_station", recipe);
      followS2(d, "route.basin.rift", true);
      // PACE-1 R2 and R9: the ledger has just shown the Divide dock's restoration. Its
      // common materials were not stocked before the plan was read, and lattice aside
      // they don't lie this side of home: back for them, saying why.
      const dock = planned(d, ["restore_divide_stop"]);
      const short = shortfall(Object.fromEntries(COMMONS(dock).map((k) => [k, dock[k]])), (k) => available(d.state, k as ItemKind, binsHere(d)));
      atForwardBase(d, "charge", () => {});
      if (!isEmpty(short)) {
        logReturn(d, "forced", `the Divide dock's restoration, read at the Rift ledger, needs ${describe(short)} from behind`, ["restore_divide_stop"], binsHere(d));
        homeAndUnload(d, [["route.basin.legacy_anchorage", true]]);
      }
      return;
    }
    // HUB-2: the crown's bench refits the suit from the moored Creel's hold, and its
    // dock charges the Creel, instead of the long way home to the island workshop.
    followS2(d, "route.basin.rift", true);
    followS2(d, "route.hub.balcony");
    siteCraft(d, "crown_station", "suit_450");
    homeAndUnload(d, [["route.hub.balcony", true], ["route.basin.legacy_anchorage", true]]);
  },
});

/** HUB-2, carrier route: the Rift station's and the crown station's first two
 * restorations, and the 450 m suit's common materials, into the Creel's hold at
 * the workshop (ceramic and core come from the Rift itself). */
function stageCrown(d: Driver): void {
  const creel = d.vehicle("creel")!, needs: Record<string, number> = {};
  for (const r of ["restore_rift_station", "restore_crown_power", "restore_crown_dock", "suit_450"] as const)
    for (const [k, n] of Object.entries(RECIPES[r].cost as Record<string, number>))
      if (k !== "pressure_ceramic" && k !== "thermal_core") needs[k] = (needs[k] ?? 0) + n;
  stockUp(d, needs);
  enter(d, "workshop");
  for (const [k, n] of Object.entries(needs)) {
    const left = n - d.count(k as ItemKind, [creel.cargoId]);
    if (left > 0) move(d, k as ItemKind, left, "workshop_locker", creel.cargoId);
  }
}

/** The forward base (C4, independent route): a basic outpost on the Basin
 * anchorage ledge where the Rift and Divide routes part. */
const FORWARD_BASE = { x: 360, y: -245.4, z: -430 } as const;
/** Packing a basic outpost spends one alloy on its anchor seals; it waits in the locker. */
const PACK_SEAL = { structural_alloy: 1 } as const;
const forwardBase = (d: Driver): string | null => d.state.systems.outposts.find((o) => Math.hypot(o.position.x - FORWARD_BASE.x, o.position.z - FORWARD_BASE.z) < 6)?.id ?? null;
/** At the workshop: the kit, two charged cells, the anchor seal, and the common
 * materials of the Rift work the bot holds plans for (the station's restoration and
 * the 450 m refits) go into the moored Creel's hold. PACE-1 R2: no Divide stock; its
 * plan is read at the Rift. */
function stageForwardBase(d: Driver): void {
  const creel = d.vehicle("creel")!;
  if (d.count("reserve_cell", [creel.cargoId, "pod_locker", "diver"]) < 2) make(d, "reserve_cells", "pod", ISLES);
  enter(d, "pod");
  unload(d, "pod_locker", "diver", ["outpost_kit_basic", "reserve_cell"]);
  const plan = planned(d, ["restore_rift_station", "suit_450", "creel_450"], undefined,
    [{ why: "the forward outpost's anchor seal", item: "structural_alloy", quantity: PACK_SEAL.structural_alloy }]);
  const refits = Object.fromEntries(COMMONS(plan).map((k) => [k, plan[k]!])) as Record<string, number>;
  stockUp(d, refits);
  enter(d, "workshop");
  unload(d, "diver", creel.cargoId, ["outpost_kit_basic", "reserve_cell"]);
  for (const [k, n] of Object.entries(refits)) {
    const left = n - d.count(k as ItemKind, [creel.cargoId]);
    if (left > 0) move(d, k as ItemKind, left, "workshop_locker", creel.cargoId);
  }
}
/** Park by the forward base's ledge, swim to it, act, swim back and board. */
function atForwardBase(d: Driver, label: string, work: (outpostId: string) => void): void {
  sortie(d, FORWARD_BASE, `forward base: ${label}`, () => {
    const id = forwardBase(d);
    if (!id) throw new Blocked("No forward outpost on the anchorage ledge", where(d.state));
    travel(d, route("to the forward outpost", "diver", "local swim, played", [{ ...FORWARD_BASE, y: FORWARD_BASE.y + 1, tolerance: 1.5 }]));
    work(id);
  });
  // Charged from the outpost's cells, not a stop: the Cargo panel's charge button,
  // as a player presses it beside the moored Creel.
  const v = d.occupied()!;
  if (v.charge < 99) { leaveCraft(d); reach(d, v.id); pressButton(d, "inventory", /^Charge at /); board(d, v.id); }
}
function deployForwardBase(d: Driver): void {
  sortie(d, FORWARD_BASE, "deploy the forward outpost", () => {
    loadDiver(d, { outpost_kit_basic: 1 });
    travel(d, route("to the anchorage ledge", "diver", "local swim, played", [{ ...FORWARD_BASE, y: FORWARD_BASE.y + 1, tolerance: 1 }]));
    const kit = d.state.inventory.items.find((i) => i.kind === "outpost_kit_basic" && i.containerId === "diver")!;
    d.command({ type: "deploy-outpost", itemId: kit.id, name: "Anchorage" });
    // The Creel holds 5 m above: its hold hands the cells and the anchor seal to the locker.
    const hold = d.vehicle("creel")!.cargoId;
    for (const [kind, n] of [["reserve_cell", 2], ...Object.entries(PACK_SEAL)] as [ItemKind, number][])
      if (move(d, kind, n, hold, `${kit.id}_locker`) < n) throw new Blocked(`The Creel hold lacks ${kind} for the forward outpost`, where(d.state));
  });
}

const divide: Phase = {
  id: "divide", title: "Mirror Divide: lattice, the upper dock restored, C07; Creel and suit to 800 m",
  verify: all(crafted("restore_divide_stop", "creel_800", "suit_800"), facility("divide_dock"), hull("creel", 800), suit(800),
    custom("the forward outpost was never deployed and packed", (d) => d.run.strategy !== "creel" || (d.state.systems.outposts.length === 0 && d.state.inventory.items.some((i) => i.kind === "outpost_kit_basic")))),
  missing: (d) => [
    ...recipes("restore_divide_stop", "creel_800", "suit_800"),
    ...sources("divide_lattice_ledge_west", "divide_lattice_ledge_east", "divide_lattice_flank_north"),
    ...routes("route.basin.divide", "route.divide.lattice_west", "route.divide.lattice_east"),
    ...sites("divide.service_dock"),
    // The deep-service plans (the dock, Creel 800, suit 800) come only from these records.
    ...plans(d, "bp_deep_service", "C07", "rift_station_ledger"),
  ],
  play(d, o) {
    // PACE-1 R2: the plans read at the Rift ledger (the dock, Creel 800, suit 800), stocked
    // at home: the dock's restoration in the diver hold (one diver load), the refits' stock
    // in the Creel's hold for the dock's bench. Lattice is the Divide's own.
    const dock = planned(d, ["restore_divide_stop"]), dockCommons = Object.fromEntries(COMMONS(dock).map((k) => [k, dock[k]!]));
    const refit = planned(d, toMake(d, ["creel_800", "suit_800"]));
    const refitStock = Object.fromEntries(Object.keys(refit).filter((k) => k !== "brine_lattice").map((k) => [k, refit[k]!])) as Record<string, number>;
    provision(d);
    stockUp(d, addStock({ ...dockCommons }, refitStock) as Record<string, number>);
    carryFromWorkshop(d, dockCommons);
    packMeals(d, 3);
    enter(d, "workshop");
    const hold = d.vehicle("creel")!.cargoId;
    for (const [k, n] of Object.entries(refitStock)) {
      const left = n - d.count(k as ItemKind, [hold]);
      if (left > 0) move(d, k as ItemKind, left, "workshop_locker", hold);
    }
    boardCraft(d, "creel");
    fly(d, "creel_out");
    fly(d, "basin_outbound");
    followS2(d, "route.basin.legacy_anchorage");
    // The forward outpost charges the Creel on its way past, then packs: the kit keeps its
    // identity for the next frontier, and nothing brings the Creel back this way.
    if (forwardBase(d)) {
      atForwardBase(d, "charge", () => {});
      atForwardBase(d, "pack it", (id) => { d.command({ type: "pack-outpost", outpostId: id, to: "diver" }); });
    }
    followS2(d, "route.basin.divide");
    // PACE-1 R2: lattice for the plans held (the dock, Creel 800, suit 800), not for
    // the air assembly, whose plan is read only in the district (Sol R1 F1).
    const lattice = (): number => (planned(d, toMake(d, ["restore_divide_stop", "creel_800", "suit_800"]), ["brine_lattice"]).brine_lattice ?? 0) - d.count("brine_lattice");
    followS2(d, "route.divide.lattice_west");
    if (lattice() > 0) harvest(d, "divide_lattice_ledge_west", lattice());
    followS2(d, "route.divide.lattice_west", true);
    followS2(d, "route.divide.lattice_east");
    if (lattice() > 0) harvest(d, "divide_lattice_ledge_east", lattice());
    followS2(d, "route.divide.lattice_east", true);
    story(d, "C07", o);
    story(d, "ren_access_log", o);
    // The ledges' two crystals restore the dock first: its stock leaves the hold and
    // the dock services the Creel before the flank.
    siteCraft(d, "divide_dock", "restore_divide_stop");
    // PACE-1 R3: the turbine hall's recorder is about 70 m from the dock.
    story(d, "C12", o);
    // C4 (CB): the ledges hold one rinsed crystal each; workable lattice lines the
    // 450 m east flank, north of the brine field. From the dock, back to the lee first.
    pilotTo(d, "back to the lee", DIVIDE_LEE);
    followS2(d, "route.divide.lattice_east");
    pilotTo(d, "over the north flank", DIVIDE_FLANK_PARK);
    if (lattice() > 0) harvest(d, "divide_lattice_flank_north", lattice(), { sort: true });
    pilotTo(d, "back to the east ledge", DIVIDE_EAST_LEDGE);
    followS2(d, "route.divide.lattice_east", true);
    // PACE-1 B4 (R3): the restored dock's bench does both 800 m refits; no trip home.
    for (const recipe of ["creel_800", "suit_800"] as const) siteCraft(d, "divide_dock", recipe);
  },
};

/** The isles field shelter (C11) and the Divide turbine hall (C12).
 * - Creel (PACE-1): after the district's records, the forced return home for the works
 *   (scenario A): lattice from the Divide's east flank and core from the Rift on the way
 *   (their plans read only past them), the assemblies and the stock at the workshop, the
 *   pod buffer fitted and C11 read while home. C12 was read at the Divide dock. Ends home,
 *   with the 800 m Creel: the library's `tour` and `over-geared` branch here.
 * - Carrier: the Mantle launched from the 550 m Hearthline at the Divide lee mooring reads
 *   C12, and the carrier stays forward. C11 was read on the yard visit. */
const deepRecords = (strategy: Strategy): Phase => ({
  id: "deep-records", title: strategy === "creel" ? "Home for the works: assemblies and stock; the pod record and the field shelter (C11)"
    : "The Divide turbine hall (C12) by Mantle from the carrier",
  verify: (d) => ["C11", "C12"].filter((id) => !d.knows(id) && !d.deferred.includes(id)).map((id) => `${id} was neither found nor deferred`),
  missing: (d) => [
    ...anyPlaced("C11", "C12", "mara_last_page"),
    ...routes("route.isles.workshop_stack", "route.isles.stack_headland", "route.basin.divide",
      ...(strategy === "carrier" ? ["route.isles.canopy_east", "route.canopy_east.basin"] : [])),
    ...(d.vehicle("dart") ? [] : [{ key: "owned:dart", text: "an owned Dart" }]),
  ],
  play(d, o) {
    provision(d);
    if (strategy === "creel" && d.knows("district_controller")) { worksReturn(d, o); return; }
    // PACE-1: the carrier route reads the shelter on its yard visit; the Dart goes only while it's unread.
    if (!d.knows("C11")) headlandRun(d, o);
    // PACE-1 R3: the Creel route reads C12 at the Divide dock, 70 m from the recorder.
    if (d.knows("C12")) return;
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
      rideAboard(d);
      carrierTo(d, legsFrom(d, CARRIER_TO_DIVIDE));
      launchMantle(d);
      story(d, "C12", o);
      mantleHome(d);
      // PACE-1 R4: the carrier stays forward; the district is its next group of sorties.
    }
  },
});
/** `n` thermal core from the Rift's lower ledges by the Creel, from home and back (sorting
 * their reserve when the exposed stock is out). The library's tour fits its own upgrades
 * with it: no late phase leaves spare core at home (PACE-1 R2). */
export function coreFromRift(d: Driver, n: number): void {
  const short = (): number => n - d.count("thermal_core", ["diver", "workshop_locker", d.vehicle("creel")!.cargoId]);
  if (short() <= 0) return;
  provision(d);
  boardCraft(d, "creel");
  fly(d, "creel_out");
  fly(d, "basin_outbound");
  followS2(d, "route.basin.legacy_anchorage");
  followS2(d, "route.basin.rift");
  for (const id of ["rift_core_lower_north", "rift_core_lower_west"] as const) if (short() > 0) harvest(d, id, short(), { sort: true });
  followS2(d, "route.basin.rift", true);
  homeAndUnload(d, [["route.basin.legacy_anchorage", true]]);
}
/** PACE-1 R1: `n` more meals in the Creel's hold for a long expedition away from home. */
function packMeals(d: Driver, n: number): void {
  const creel = d.vehicle("creel")!;
  enter(d, "workshop");
  const wild = (Object.keys(SOURCES) as SourceId[]).filter((id) => SOURCES[id].item === "meal" && ISLES.includes(SOURCES[id].region))
    .reduce((m, id) => m + (d.state.world.resources.find((r) => r.id === id)?.stock ?? 0), 0);
  const want = Math.min(n, wild) - d.count("meal", ["workshop_locker"]);
  if (want > 0) procure(d, { meal: want }, "workshop", ISLES);
  enter(d, "workshop");
  move(d, "meal", Math.min(n, d.count("meal", ["workshop_locker"])), "workshop_locker", creel.cargoId);
}
/** PACE-1 R1: the carrier leaves home for the district, so meals ride in its stores and
 * no phase begins with a trip home to eat. */
function rideAboard(d: Driver): void {
  const creel = d.vehicle("creel")!;
  enter(d, "workshop");
  const wild = (Object.keys(SOURCES) as SourceId[]).filter((id) => SOURCES[id].item === "meal" && ISLES.includes(SOURCES[id].region))
    .reduce((n, id) => n + (d.state.world.resources.find((r) => r.id === id)?.stock ?? 0), 0);
  const want = Math.min(6, wild) - d.count("meal", ["workshop_locker"]);
  if (want > 0) procure(d, { meal: want }, "workshop", ISLES);
  enter(d, "workshop");
  const meals = Math.min(6, d.count("meal", ["workshop_locker"]));
  move(d, "meal", meals, "workshop_locker", creel.cargoId);
  boardHearthlineWith(d, { ids: [], stock: { meal: meals } });
}
/** Surface run to the headland shelter in the Dart (C11 and the optional last page). */
function headlandRun(d: Driver, o: PlayOptions): void {
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
}

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
/** The legs of `legs` still ahead of the carrier: from the one passing nearest it.
 * `reverse`: the same for the way back. */
function legsFrom(d: Driver, legs: readonly string[], reverse = false): string[] {
  const at = carrier(d).pose.position, order = reverse ? [...legs].reverse() : [...legs];
  let best = 0, near = Infinity;
  order.forEach((id, i) => {
    const m = Math.min(...s2Route(id).path.map((q) => dist(q, at)));
    if (m < near) { near = m; best = i; }
  });
  return order.slice(best);
}
function carrierTo(d: Driver, legs: readonly string[]): void {
  boardCraft(d, "hearthline");
  for (const id of legs) followS2(d, id);
  d.command({ type: "carrier", action: "station-keep" });
  d.command({ type: "carrier", action: "leave-helm" });
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
  }, "docking:settle");
  // Capture from the interface inside the vestibule: taking the helm would turn the
  // carrier and swing the corridor off the waiting craft.
  enterCarrier(d);
  unload(d, "diver", h.cargoId);
  d.command({ type: "carrier", action: "station-keep" }, { allowRefusal: true });
  d.command({ type: "carrier", action: "capture", vehicleId: d.vehicle("mantle")!.id });
  d.waitFor("the Mantle capture", 60, (s) => !s.fleet.docking?.transaction, "docking:capture");
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
  mark(d, "first works step");
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
    // PACE-1 B4: after the Divide's refits the Creel goes straight down the service ledge.
    const p = d.state.player.pose.position;
    if (Math.hypot(p.x - DIVIDE_LEE.x, p.z - DIVIDE_LEE.z) > 500) {
      fly(d, "creel_out");
      fly(d, "basin_outbound");
      followS2(d, "route.basin.legacy_anchorage");
      followS2(d, "route.basin.divide");
    }
    // C3: S2's moorings charge; top up before the service ledge and the terraces
    // (PACE-1 R7: when the charge is short of the district's legs).
    topUp(d, "divide.lee_mooring", 75);
    followS2(d, "route.divide.service_ledge");
    return;
  }
  carrierTo(d, legsFrom(d, CARRIER_TO_SHELF));
  launchMantle(d);
}
function launchMantle(d: Driver): void {
  d.command({ type: "carrier", action: "launch", vehicleId: d.vehicle("mantle")!.id });
  d.waitFor("the Mantle launch", 60, (s) => !s.fleet.docking?.transaction, "docking:launch");
  walkAboard(d, CARRIER_LAYOUT.vestibule, "to the vestibule");
  d.command({ type: "carrier", action: "leave-interior" });
  boardCraft(d, "mantle");
}

const meridian = (strategy: Strategy): Phase => ({
  id: "meridian", title: strategy === "creel" ? "Meridian District by the 800 m Creel: transfer hall, annex, gate hall, service window"
    : "Meridian by carrier: the 550 m Hearthline at the shelf, Mantle sorties",
  verify: (d) => ["C08", "C10", "C09", "gate_panel", "C13", "district_controller"].filter((id) => !d.knows(id) && !d.deferred.includes(id)).map((id) => `${id} was neither found nor deferred`),
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
        topUp(d, "meridian.staging_shelf", DISTRICT_CHARGE);
        followS2(d, "route.meridian.terraces");
        down = true;
      } else if (strategy === "creel" && !deep.has(id) && down) {
        followS2(d, "route.meridian.terraces", true);
        down = false;
      }
      story(d, id, o);
    }
    if (down) followS2(d, "route.meridian.terraces", true);
    mark(d, "last district record");
    if (strategy === "creel") topUp(d, "meridian.staging_shelf", DISTRICT_CHARGE);
    // PACE-1: the works follow from here; the Creel stays at the district and the Mantle
    // returns to the carrier at the shelf.
    if (strategy === "carrier") mantleHome(d);
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
    // Room for the assemblies: as many of the diver's meals as that needs wait in
    // the hold for this visit, no more than the hold has room for (W2: a works
    // trip can fill the Mantle's hold, so stowing every meal could be refused).
    const mealCu = ITEMS.meal.cu, short = cargoCu(d, take) - d.freeCu("diver");
    const meals = short > 0 ? Math.min(d.count("meal", ["diver"]), Math.ceil(short / mealCu), Math.floor(d.freeCu(v.cargoId) / mealCu)) : 0;
    if (meals) move(d, "meal", meals, "diver", v.cargoId);
    const first = loads(d, take, d.freeCu("diver"))[0];
    if (take.ids.length && (!first || first.ids.length !== take.ids.length))
      throw new Blocked(`The diver cannot carry the ${take.ids.length} assemblies at once`, where(d.state));
    if (first) moveCargo(d, first, v.cargoId, "diver");
    reach(d, host);
    for (const action of actions) {
      // PACE-1 R5: the galleries drain (5,400 active steps) while the diver restores
      // the hall; only what is left of the drain is waited out before opening.
      if (action === "open" && d.state.story.works.gate === "equalizing")
        d.waitFor("the gate to equalize", 100, (s) => s.story.works.gate === "equalized", "works:equalize");
      worksStep(d, action);
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
 * PACE-1 R2: one gathering pass for the assemblies' common materials and `also` (the pod
 * buffer's), crafted as soon as they are in; then one for the hall and food stock.
 * Returns the tracked cargo: assembly instance IDs and stock quantities. */
export function stageWorksCargo(d: Driver, also: Stock = {}): Cargo {
  const creel = d.vehicle("creel");
  if (!creel) throw new Blocked("No Creel to carry the works cargo", where(d.state));
  const assemblyCost = planned(d, ["service_power_assembly", "service_air_assembly"]);
  const batch = addStock(Object.fromEntries(COMMONS(assemblyCost).map((k) => [k, assemblyCost[k]])), also);
  stockUp(d, batch as Record<string, number>);
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
  // The hall's stock with `also` still reserved, so loading the one never takes the other.
  stockUp(d, addStock({ ...HALL_STOCK }, also) as Record<string, number>);
  enter(d, "workshop");
  const cargo: Cargo = { ids, stock: { ...HALL_STOCK } };
  const stockCu = cargoCu(d, { ids: [], stock: cargo.stock });
  if (d.freeCu(creel.cargoId) < stockCu)
    throw new Blocked(`The Creel hold has ${d.freeCu(creel.cargoId)} CU free; the works stock is ${stockCu} CU more`, where(d.state));
  moveCargo(d, cargo, "workshop_locker", creel.cargoId);
  return cargo;
}
/** PACE-1 B2: the dispatch buffer's plan came at C07; fit it at the pod on the first
 * visit home after it, and read the record it unlocks. */
function fitPodBuffer(d: Driver, gather = true): void {
  if (!d.crafted("pod_buffer")) {
    // Crust grows on the Canopy and Basin fins, not the isles: gathered as any stock is, then
    // carried. `gather` false: the stock is already batched in the locker, and the moored
    // Creel's hold is loaded for the works (stockUp would stow it).
    if (gather) stockUp(d, costOf("pod_buffer") as Record<string, number>);
    carryFromWorkshop(d, costOf("pod_buffer") as Record<string, number>);
    make(d, "pod_buffer", "pod", ["refuge_reef", "island_chain"]);
  }
  enter(d, "pod");
  if (!d.knows("C14")) { interact(d, "C14"); if (!d.knows("C14")) throw new Blocked("C14 recorded nothing", where(d.state)); }
}
/** PACE-1 scenario A, Creel: back from the district for the works. The two assemblies are
 * made only at the workshop or the crown (not restored on this route), from common
 * materials that lie only behind; the air assembly's lattice and the power assembly's
 * core lie only past the bot (their plans were read at C08 and C07), so it takes them on
 * the way: the Divide's east flank, then a detour into the Rift. */
function worksReturn(d: Driver, o: PlayOptions): void {
  const fabricate: Plannable[] = ["service_power_assembly", "service_air_assembly"];
  const short = (item: string): number => (planned(d, fabricate, [item])[item] ?? 0) - d.count(item as ItemKind);
  logReturn(d, "forced", "the works' two assemblies are made only behind the Divide, from common materials that lie only behind", fabricate, binsHere(d));
  if (short("brine_lattice") > 0) { pilotTo(d, "over the north flank", DIVIDE_FLANK_PARK); harvest(d, "divide_lattice_flank_north", short("brine_lattice"), { sort: true }); }
  topUp(d, "meridian.staging_shelf", 90);
  followS2(d, "route.divide.service_ledge", true);
  topUp(d, "divide.lee_mooring", 70);
  followS2(d, "route.basin.divide", true);
  if (short("thermal_core") > 0) {
    logReturn(d, "forced", "the power assembly's core lies only in the Rift, and its plan was read at C07, past it", ["service_power_assembly"], binsHere(d));
    followS2(d, "route.basin.rift");
    for (const id of ["rift_core_lower_north", "rift_core_lower_west"] as const) if (short("thermal_core") > 0) harvest(d, id, short("thermal_core"), { sort: true });
    followS2(d, "route.basin.rift", true);
  }
  homeAndUnload(d, [["route.basin.legacy_anchorage", true]]);
  stageWorksCargo(d, d.crafted("pod_buffer") ? {} : costOf("pod_buffer"));
  fitPodBuffer(d, false);
  if (!d.knows("C11")) headlandRun(d, o);
}
/** The works by strategy, after the district's records (PACE-1):
 * - Both routes return home: the two assemblies are made only at the workshop or the
 *   crown, and their common materials lie only behind. The crown is no nearer in
 *   practice: the 8 glass the works take lie only on the isles by now (scenario B, R9).
 * - Creel (scenario A): lattice from the Divide's east flank on the way, the workshop for
 *   the assemblies and stock, the pod buffer fitted while home; one Creel trip with all 42 CU.
 * - Carrier: lattice from the carrier over the flank, the carrier to the yard (R4: home
 *   is the group of sorties now), the Creel ferries the cargo aboard, back to the shelf,
 *   and each Mantle trip is loaded from the stores.
 * - R5: power, air, isolate and start equalizing; the hall and the food bay while the
 *   galleries drain; then open and route power. The craft waits at the gate hall, by the
 *   service window, for the ending. */
const works = (strategy: Strategy): Phase => ({
  id: "works", title: "The return-gate works: power, air, isolate, equalize, open; hall, food, turbine power",
  verify: custom("the works are incomplete (gate open, hall, food, hall power)", (d) => { const w = d.state.story.works; return w.gate === "open" && w.hall && w.food && w.hallPower; }),
  missing: worksMissing,
  play(d, o) {
    provision(d);
    const fabricate: Plannable[] = ["service_power_assembly", "service_air_assembly"];
    const gate1: WorksAction[] = ["install_power", "install_air", "isolate", "equalize"];
    const hall: WorksAction[] = ["restore_hall", "restore_food"];
    const gate2: WorksAction[] = ["open", "route_power"];
    const none: Cargo = { ids: [], stock: {} };
    // The gate hall lies 170 m below the upper hall: down S2's terrace route for each gate visit.
    const down = (): void => { topUp(d, "meridian.staging_shelf", DISTRICT_CHARGE); followS2(d, "route.meridian.terraces"); };
    const up = (): void => followS2(d, "route.meridian.terraces", true);
    // R2: the air assembly's lattice was not stocked before its plan was read here.
    const lattice = (): number => (planned(d, ["service_air_assembly"], ["brine_lattice"]).brine_lattice ?? 0) - d.count("brine_lattice");
    if (strategy === "creel") {
      // The cargo staged on the visit home (deep-records): the assemblies and the hall stock in the Creel's hold.
      const hold = d.vehicle("creel")!.cargoId;
      const ids = d.state.inventory.items.filter((i) => i.containerId === hold && fabricate.includes(i.kind as Plannable)).map((i) => i.id);
      const assemblies: Cargo = { ids, stock: {} }, stock: Cargo = { ids: [], stock: { ...HALL_STOCK } };
      toMeridian(d, "creel");
      down(); worksVisit(d, gate1, assemblies); up();
      worksVisit(d, hall, stock);
      down(); worksVisit(d, gate2, none);
      return;
    }
    logReturn(d, "forced", "the works' two assemblies are made only behind the Divide (the restored crown is no nearer for the isles' glass), from common materials that lie only behind", fabricate, [...binsHere(d), carrier(d).cargoId]);
    boardCraft(d, "hearthline");
    // Held above the flank at the station carrier-deep used (400 m), and the suit dives the rest.
    if (lattice() > 0) carrierHarvest(d, "divide_lattice_flank_north", lattice(), { sort: true, above: 400 });
    if (lattice() > 0) carrierHarvest(d, "divide_lattice_flank_south", lattice(), { sort: true, above: 400 });
    // Home by the lanes, with a detour from the Basin anchorage into the Rift for the power
    // assembly's core when it is short (its plan was read at C07, past the Rift).
    for (const id of legsFrom(d, ["route.basin.divide", "route.divide.meridian_broad"], true)) followS2(d, id, true);
    const core = (planned(d, ["service_power_assembly"], ["thermal_core"]).thermal_core ?? 0) - d.count("thermal_core");
    if (core > 0) {
      logReturn(d, "forced", "the power assembly's core lies only in the Rift, and its plan was read at C07, past it", ["service_power_assembly"], [...binsHere(d), carrier(d).cargoId]);
      followS2(d, "route.basin.rift");
      carrierHarvest(d, "rift_core_lower_north", core, { sort: true });
      followS2(d, "route.basin.rift", true);
    }
    for (const id of ["route.canopy_east.basin", "route.isles.canopy_east"]) followS2(d, id, true);
    // The lattice and core rode home in the stores: ashore with the diver to the bench.
    const stores = carrier(d).cargoId, aboard = planned(d, fabricate, ["brine_lattice", "thermal_core"]);
    for (const k of ["brine_lattice", "thermal_core"] as const)
      move(d, k, Math.min(aboard[k] ?? 0, d.count(k, [stores])), stores, "diver");
    ashoreFromCarrier(d);
    const cargo = stageWorksCargo(d);
    boardCraft(d, "creel");
    fly(d, "creel_out");
    followS2(d, "route.isles.workshop_stack");
    deliverToCarrier(d, cargo, "stack_yard");
    carrierIn(d);
    carrierTo(d, CARRIER_TO_SHELF);
    const assemblies: Cargo = { ids: cargo.ids, stock: {} }, stock: Cargo = { ids: [], stock: cargo.stock };
    const mantle = d.vehicle("mantle")!;
    const together = cargoCu(d, cargo) <= d.freeCu(mantle.cargoId);
    const trips: [Cargo, () => void][] = together
      ? [[cargo, () => { down(); worksVisit(d, gate1, assemblies); up(); worksVisit(d, hall, stock); down(); worksVisit(d, gate2, none); }]]
      : [[assemblies, () => { down(); worksVisit(d, gate1, assemblies); up(); }],
        [stock, () => { worksVisit(d, hall, stock); down(); worksVisit(d, gate2, none); }]];
    trips.forEach(([items, visit], i) => {
      if (cargoCu(d, items) > d.freeCu(mantle.cargoId))
        throw new Blocked(`The Mantle hold has ${d.freeCu(mantle.cargoId)} CU free; this trip needs ${cargoCu(d, items)} CU`, where(d.state));
      d.command({ type: "carrier", action: "launch", vehicleId: mantle.id });
      d.waitFor("the Mantle launch", 60, (s) => !s.fleet.docking?.transaction, "docking:launch");
      ferryFromCarrier(d, mantle.id, items);
      exitCarrierToBoard(d, mantle.id);
      visit();
      if (i < trips.length - 1) mantleHome(d);
    });
  },
});
/** From the helm of the supply Creel near the carrier: moor beside it, clear of every
 * build envelope, leave the helm, and ferry the cargo into its stores through the
 * vestibule (station keeping engaged there, in range). Ends outside the carrier. */
export function deliverToCarrier(d: Driver, cargo: Cargo, site: string | null): void {
  const creel = d.occupied();
  if (!creel || creel.hull !== "creel") throw new Error("harness: deliverToCarrier starts at the Creel's helm");
  const h = carrier(d), vestibule = localToWorld(CARRIER_LAYOUT.exteriorVestibule, h);
  const park = parkNear(d, { ...vestibule, y: vestibule.y - 6 });
  pilotTo(d, "beside the carrier", site ? clearOfBuilds(d, site, park, false) : park);
  leaveCraft(d);
  ferryToCarrier(d, creel.id, cargo);
}
function exitCarrierToBoard(d: Driver, vehicleId: string): void {
  exitCarrier(d);
  reach(d, vehicleId);
  board(d, vehicleId);
}

const ending = (strategy: Strategy): Phase => ({
  id: "ending", title: "The district controller's resolution, after the works (the pod buffer and C14 on the way)",
  verify: all(crafted("pod_buffer"), known("C14"), custom("the resolution is not complete", (d) => d.state.story.resolution.phase === "complete")),
  missing: () => [
    ...recipes("pod_buffer"),
    ...stories({ readOptional: true, reverse: false }, "C14", "district_controller"),
  ],
  play(d, o) {
    // PACE-1: the ending follows the works in the same visit. The craft waits at the gate
    // hall, beside the service window; a run resumed elsewhere goes down first.
    if (!d.crafted("pod_buffer") || !d.knows("C14")) { ashoreFromCarrier(d); fitPodBuffer(d); }
    const at = hostAt(d, "district_controller"), p = d.state.player.pose.position;
    if (Math.hypot(p.x - at.x, p.z - at.z) > 300) {
      toMeridian(d, strategy);
      topUp(d, "meridian.staging_shelf");
      followS2(d, "route.meridian.terraces");
    }
    if (!d.state.player.controlledVehicleId) { const v = d.vehicle(strategy === "creel" ? "creel" : "mantle")!; reach(d, v.id); board(d, v.id); }
    sortie(d, at, "resolution", () => {
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
  verify: all(crafted("hearthline_keel", "hearthline_base"), hull("hearthline", 400)),
  missing: () => [
    ...recipes("hearthline_keel", "hearthline_base"),
    ...need.hull("hearthline"),
    ...routes("route.isles.workshop_stack"),
    ...sites("isles.stack_yard"),
  ],
  play(d) {
    // Keel F2 A16 R6 (58 CU) and fit-out A6 G8 M8 C8 R4 (46 CU): one Creel rack load each.
    // PACE-1 R2: the two stages' 104 CU don't fit the workshop locker together, so a
    // player gathers one stage at a time here (storage is limited by design).
    for (const recipe of ["hearthline_keel", "hearthline_base"]) {
      const cost = RECIPES[recipe as RecipeId].cost as Record<string, number>;
      stockUp(d, cost);
      enter(d, "workshop");
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
function carrierHarvest(d: Driver, id: string, want: number, options: { sort?: boolean; above?: number } = {}): void {
  // Within the carrier's rating: a deeper deposit is a suit dive from 395 m. `above`: hold
  // no deeper than this station even when the rating allows (the terrain round a ledge).
  const at = SOURCES[id as SourceId].position, rating = Math.min(carrier(d).rating, options.above ?? Infinity);
  pilotTo(d, `carrier above ${id}`, parkNear(d, { ...at, y: Math.max(at.y, -(rating - 5) - 5) }));
  // A diver load per trip out of the vestibule, stowed in the stores between.
  for (let got = 0, trip = 0; trip < 6 && got < want; trip++) {
    carrierOut(d);
    const n = gather(d, id as SourceId, want - got, { sort: options.sort ?? false });
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
  pilotTo(d, "beside the carrier", clearOfBuilds(d, "stack_yard", parkNear(d, { ...vestibule, y: vestibule.y - 6 }), false));
  leaveCraft(d);
  d.command({ type: "carrier", action: "station-keep" }, { allowRefusal: true });
  ferryToCarrier(d, creel.id, cargo);
  carrierIn(d);
}

const carrierDeep: Phase = {
  id: "carrier-deep", title: "Hearthline to the Divide lee mooring: lattice from the 400 m carrier; 550 m refit, Mantle, 800 m suit",
  verify: all(crafted("hearthline_550", "mantle_base", "suit_800"), hull("hearthline", 550), hull("mantle", 800), berthed("mantle"), suit(800)),
  missing: (d) => [
    ...recipes("hearthline_550", "mantle_base", "suit_800"),
    ...plans(d, "bp_deep_service", "C07", "rift_station_ledger"),
    ...need.hull("mantle"),
    ...sources("divide_lattice_ledge_west", "divide_lattice_ledge_east", "divide_lattice_flank_north"),
    ...routes("route.isles.canopy_east", "route.canopy_east.basin", "route.basin.divide"),
    ...sites("divide.lee_mooring", "isles.stack_yard"),
  ],
  play(d, o) {
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
    // R6 falls through: the lips' sortable reserve is spent, so the deep seam, saying why.
    if (held < ceramic) {
      logReturn(d, "forced", `the yard's refit and Mantle need ${ceramic - held} more ceramic than the Rift lips still hold, sorted reserve included`, ["hearthline_550", "mantle_base"], binsHere(d));
      seamTrip(d, ceramic - held);
    }
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
    // Lattice: Hearthline 550 L6, Mantle L5, suit 800 L4 (PACE-1 R2: the plans held;
    // not the air assembly's, read only in the district). S2's ledge routes are
    // medium-profile; the carrier flies swept local legs from the lee mooring to hold
    // station above each ledge.
    const lattice = (): number => (planned(d, toMake(d, ["hearthline_550", "mantle_base", "suit_800"]), ["brine_lattice"]).brine_lattice ?? 0) - d.count("brine_lattice");
    const lee = { x: 560, y: -390, z: -1120 };
    chargeAtMooring(d, "divide.lee_mooring");
    if (lattice() > 0) carrierHarvest(d, "divide_lattice_ledge_west", lattice());
    pilotTo(d, "back to the lee mooring", lee);
    if (lattice() > 0) carrierHarvest(d, "divide_lattice_ledge_east", lattice());
    // C4 (CB): the ledges hold one rinsed crystal each. Workable lattice lines the
    // 450 m east flank, below the carrier's 400 m: the 450 m suit dives to it.
    if (lattice() > 0) carrierHarvest(d, "divide_lattice_flank_north", lattice(), { sort: true });
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
    // and ride the Creel back from beside the carrier. Only its lattice is not at the workshop.
    const stores = carrier(d).cargoId, suitLattice = (RECIPES.suit_800.cost as Record<string, number>).brine_lattice!;
    if (d.freeCu("diver") < suitLattice * ITEMS.brine_lattice.cu) move(d, "meal", d.count("meal", ["diver"]), "diver", stores);
    const room = Math.floor(d.freeCu("diver") / ITEMS.brine_lattice.cu);
    if (room < suitLattice) throw new Blocked(`The diver hold takes ${room} of the ${suitLattice} lattice for the workshop: ${d.state.inventory.items.filter((i) => i.containerId === "diver").map((i) => `${i.kind} ${i.quantity}`).join(", ")}`, where(d.state));
    move(d, "brine_lattice", Math.min(suitLattice, d.count("brine_lattice", [stores])), stores, "diver");
    logReturn(d, "chosen", "the 550 m refit and the Mantle are yard work, and the 800 m suit is a workshop refit", ["hearthline_550", "mantle_base", "suit_800"], [...binsHere(d), stores]);
    ashoreFromCarrier(d);
    make(d, "suit_800" as RecipeId, "workshop", ISLES);
    // PACE-1 B2: the pod buffer's plan came at C07; this is the first visit home since.
    fitPodBuffer(d);
    // The headland shelter, read on this visit home (the Creel route reads it on its own).
    if (!d.knows("C11")) headlandRun(d, o);
  },
};

export const CREEL_LATER: readonly Phase[] = [rift("creel"), divide, meridian("creel"), deepRecords("creel"), works("creel"), ending("creel")];
export const CARRIER_LATER: readonly Phase[] = [rift("carrier"), hearthline, carrierDeep, deepRecords("carrier"), meridian("carrier"), works("carrier"), ending("carrier")];
