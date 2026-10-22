/** C4 stage B: SYS-1 upgrades and power, SYS-2 bases and knowledge, and CB's
 * recipe deltas composed into the real game. Each test plays through the
 * composed commands on an earned state; the adverse case dies mid-work. */
import test from "node:test";
import assert from "node:assert/strict";
import { REST_BASES } from "../src/content/bases.js";
import { C4_SOURCES, FRONTIER_SOURCES } from "../src/content/c4Sources.js";
import { HEARTHLINE_SOCKETS } from "../src/content/fleet/hearthlineInterior.js";
import { RECIPES, SOURCES, type ItemKind, type RecipeId } from "../src/content/registry.js";
import { WORKING_STOPS } from "../src/content/stops.js";
import { LOST_SITES } from "../src/content/systems/decodes.js";
import { CARRIER_OCCUPANTS } from "../src/content/systems/hosts.js";
import { decodeSave, encodeSave, createEnvelope } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import { DECK_CHARGE_RATE, stepUpgrades, vehicleHoldCapacity, vehicleProfile } from "../src/sim/fittings.js";
import { addItem, containerAccessible } from "../src/sim/inventory.js";
import { fixtureGame } from "../src/sim/carrier.js";
import { FIXED_SECONDS as DT } from "../src/sim/clock.js";
import { makeVehicle } from "../src/sim/state.js";
import { listHosts } from "../src/sim/systems/hosts.js";
import { currentObjective } from "../src/sim/objective.js";
import { craft, craftingBlock } from "../src/sim/progression.js";
import { incapacitate, disableVehicle } from "../src/sim/recovery.js";
import { kitPlanProblems, kitPlanRoute } from "../src/sim/storyCampaign.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { airSupply } from "../src/sim/survival.js";
import { conservedTotals } from "../src/sim/systems/outposts.js";
import { carrierSocketRefusal, systemsContext } from "../src/sim/systemsLink.js";
import type { GameCommand, GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { gameWorld } from "../src/sim/world.js";
import { at, creelFirst, creelOf, fund, meta, parkCreel } from "./b1-support.js";
import { faceTarget, NORMAL_VIEWS } from "./targeting-support.js";

const world = gameWorld();
/** A real ledge 45 m west of the pod (siteQuery: level, clear, open sky). */
const LEDGE = { x: -44, y: -8.09, z: 8 } as const;

function run(s: GameState, c: GameCommand): { state: GameState; events: GameEvent[] } {
  const out = executeCommand(s, c, world);
  const error = out.events.find((e) => e.type === "notice" && e.error);
  assert.equal(error && "message" in error ? error.message : null, null, `${c.type} refused`);
  return out;
}
function refused(s: GameState, c: GameCommand, pattern: RegExp): void {
  const before = structuredClone(s), out = executeCommand(s, c, world);
  assert.ok(out.events.some((e) => e.type === "notice" && e.error && pattern.test(e.message)),
    `${c.type}: ${JSON.stringify(out.events.filter((e) => e.type === "notice"))}`);
  assert.deepEqual(s, before, `${c.type}: a refusal changes nothing`);
}
/** Read a host the way a player does: from its collision-checked view, aimed. */
function read(s: GameState, id: string): GameState {
  const v = NORMAL_VIEWS.find((x) => x.id === id)!;
  at(s, v.position, v.mode); faceTarget(s, id);
  return run(s, { type: "interact" }).state;
}
function roundTrip(s: GameState): GameState {
  assert.ok(validState(s), "valid before saving");
  const e = encodeSave(createEnvelope(s, meta)); assert.ok(e.ok, e.ok ? "" : e.error);
  const d = decodeSave(e.value); assert.ok(d.ok, d.ok ? "" : d.error);
  assert.deepEqual(d.value.state, JSON.parse(JSON.stringify(s)));
  return d.value.state;
}
const idle = (seconds: number, s: GameState): GameState => {
  for (let i = 0; i < seconds * 60; i++) s = stepGame(s, [], world).state;
  return s;
};

/** Creel-first (B1) with the workshop's outpost and signal records read and a
 * basic outpost kit, a decoder and a planter made at their benches. */
function systemsGame(): GameState {
  let s = creelFirst();
  for (const id of ["workshop_outpost_sheet", "workshop_decoder_rack", "canopy_lab_outpost_sheet"]) s = read(s, id);
  // Stow everything else from the diver hold in the pod locker, as a player would.
  const stow = () => { for (const i of s.inventory.items.filter((i) => i.containerId === "diver" && !/^(outpost_kit_basic|mod_)/.test(i.kind))) i.containerId = "pod_locker"; };
  for (const id of ["outpost_kit_basic", "mod_decoder", "mod_planter"] as RecipeId[]) { stow(); fund(s, id); }
  stow();
  return s;
}
const kitId = (s: GameState): string => s.inventory.items.find((i) => i.kind === "outpost_kit_basic")!.id;
const item = (s: GameState, kind: string): string => s.inventory.items.find((i) => i.kind === kind)!.id;

// --- Content and route ---------------------------------------------------------

test("CB's frontier sits exactly at each tier limit, 0.3–1.5 m above the composed bed; seed patches rest 0.8 m above it", () => {
  const limit = { tagged_frame: 150, thermal_core: 350, brine_lattice: 450 } as const;
  for (const [id, src] of Object.entries(FRONTIER_SOURCES)) {
    assert.equal(-src.position.y, limit[src.item], id);
    const above = src.position.y - world.groundHeight(src.position.x, src.position.z);
    assert.ok(above >= 0.3 && above <= 1.5, `${id}: ${above.toFixed(2)} m above the bed`);
  }
  for (const id of Object.keys(C4_SOURCES).filter((k) => !Object.hasOwn(FRONTIER_SOURCES, k))) {
    const p = SOURCES[id as keyof typeof SOURCES].position;
    assert.ok(Math.abs(p.y - world.groundHeight(p.x, p.z) - 0.8) < 0.02, id);
  }
});

test("the main-path outpost kit plans are reachable in tier order on both fleet routes", () => {
  for (const strategy of ["independent", "carrier"] as const) {
    assert.deepEqual(kitPlanProblems(strategy), [], strategy);
    const route = kitPlanRoute(strategy);
    assert.deepEqual(route.map((k) => k.record), ["workshop_outpost_sheet", "canopy_lab_outpost_sheet", "basin_station_outpost_frame"]);
    assert.equal(route[0]!.after, -1, "the basic kit plan is at the workshop before any dive");
  }
});

// --- Waking where you rested ------------------------------------------------------

test("waking after incapacity: the last restored base you rested at, the pod when that base is not working", () => {
  let s = creelFirst();
  at(s, REST_BASES.island_workshop.wake, "walking");
  s = run(s, { type: "rest" }).state;
  assert.equal(s.player.refugeId, "island_workshop");
  at(s, { x: -40, y: -20, z: 0 }, "swimming");
  incapacitate(s, "Test.", world);
  assert.deepEqual(s.player.pose.position, REST_BASES.island_workshop.wake, "woke at the workshop bunk");
  roundTrip(s);
  // A base that stops working (a broken save edit cannot fake it): the pod is the fallback.
  const lost = creelFirst();
  lost.player.refugeId = "rift_station";
  at(lost, { x: -40, y: -20, z: 0 }, "swimming");
  incapacitate(lost, "Test.", world);
  assert.deepEqual(lost.player.pose.position, REST_BASES.home_pod.wake);
  assert.equal(lost.player.refugeId, "home_pod");
  // Resting needs a working base bunk.
  const away = creelFirst(); at(away, { x: -40, y: -20, z: 0 }, "swimming");
  refused(away, { type: "rest" }, /restored base/);
});

// --- Outposts, decodes and planters ------------------------------------------

/** A standard outpost on the west ledge running a decode and growing staple cups. */
function busyOutpost(): { s: GameState; outpost: string; decoder: string; planter: string } {
  let s = systemsGame();
  s = read(s, "lost:reef_pumphouse_site");
  assert.ok(s.systems.found.includes("reef_pumphouse_log"), "reading the site finds its log");
  s = read(s, "reef_staple_cuttings");
  const outpost = kitId(s), decoder = item(s, "mod_decoder"), planter = item(s, "mod_planter");
  at(s, { ...LEDGE, y: LEDGE.y + 0.6 }, "swimming");
  s = run(s, { type: "deploy-outpost", itemId: outpost, name: "West ledge" }).state;
  for (const [k, q] of [["structural_alloy", 3], ["silica_glass", 2], ["conductive_crust", 2]] as const) addItem(s, k, q, "diver");
  s = run(s, { type: "upgrade-outpost", outpostId: outpost }).state;
  s = run(s, { type: "install-host-module", hostId: outpost, socket: "s0", itemId: decoder }).state;
  s = run(s, { type: "install-host-module", hostId: outpost, socket: "s1", itemId: planter }).state;
  s = run(s, { type: "start-decode", hostId: outpost, socket: "s0", decodable: "reef_pumphouse_log" }).state;
  s = run(s, { type: "plant", hostId: outpost, socket: "s1", seed: "seed_staple_cup" }).state;
  s = idle(30, s);
  assert.equal(s.systems.decodes.length, 1); assert.ok(s.systems.decodes[0]!.progress > 0, "the decode runs");
  assert.ok(s.systems.planters[0]!.progress > 0, "the crop grows");
  return { s: roundTrip(s), outpost, decoder, planter };
}

test("ADVERSE: dying while an outpost runs a decode and grows a crop loses and duplicates nothing; the save round-trips", () => {
  const { s, outpost, decoder, planter } = busyOutpost();
  const totals = conservedTotals(s, s.systems), decode = structuredClone(s.systems.decodes), crop = structuredClone(s.systems.planters);
  const sockets = structuredClone(s.systems.sockets);
  at(s, { x: LEDGE.x + 3, y: LEDGE.y + 2, z: LEDGE.z }, "swimming");
  incapacitate(s, "Test: drowned beside the outpost.", world);
  assert.deepEqual(conservedTotals(s, s.systems), totals, "every item, module and kit counted once");
  assert.deepEqual(s.systems.sockets, sockets, "both modules stay socketed");
  assert.deepEqual(s.systems.decodes, decode, "the decode is kept where it stood");
  assert.deepEqual(s.systems.planters, crop, "the crop is kept");
  assert.equal(s.systems.outposts.find((o) => o.id === outpost)?.tier, "standard");
  for (const id of [decoder, planter]) assert.equal(s.inventory.items.filter((i) => i.id === id).length, 0, "socketed modules are not inventory");
  let after = roundTrip(s);
  // Back at the ledge, both resume and finish: the decode pays its plan, the crop harvests.
  at(after, { ...LEDGE, y: LEDGE.y + 0.6 }, "swimming");
  for (let n = 0; n < 12 && !after.systems.decoded.includes("reef_pumphouse_log"); n++) after = idle(60, after);
  assert.ok(after.systems.decoded.includes("reef_pumphouse_log"), "the decode finished");
  assert.ok(after.knowledge.blueprints.includes("bp_small_fabricator"), "and granted the field fabricator plan");
  after = idle(Math.max(0, 360 - after.systems.planters[0]!.progress) + 1, after);
  at(after, { ...LEDGE, y: LEDGE.y + 0.6 }, "swimming");
  const meals = after.inventory.items.filter((i) => i.kind === "meal").reduce((n, i) => n + i.quantity, 0);
  after = run(after, { type: "harvest", hostId: outpost, socket: "s1" }).state;
  assert.equal(after.inventory.items.filter((i) => i.kind === "meal").reduce((n, i) => n + i.quantity, 0), meals + 2);
  roundTrip(after);
});

// --- Signatures: each has a real use -------------------------------------------

/** A hull of `hull` at `pose` with `kinds` socketed (rule-level: no build chain). */
function withHull(s: GameState, hull: "hush" | "spindle", p: Vec3, kinds: readonly string[], pilot = false) {
  const v = makeVehicle(`${hull}_t`, hull, { ...p }, `${hull}_t_hold`);
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", capacity: vehicleHoldCapacity(s, v), ownerId: v.id });
  for (const k of kinds) v.modules.push(addItem(s, k as ItemKind, 1, v.cargoId).id);
  if (pilot) { s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose.position = { ...p }; }
  return v;
}
const upgrade = (s: GameState, action: Extract<GameCommand, { type: "upgrade" }>["action"]) => executeCommand(s, { type: "upgrade", action }, world);

test("Hush listening array: quiet, it hears a lost site's bearing and marks it on the chart", () => {
  const site = LOST_SITES.reef_pumphouse_site.position;
  const s = creelFirst(), v = withHull(s, "hush", { x: site.x + 120, y: -30, z: site.z }, ["hush_listening_array"], true);
  const out = upgrade(s, "listen");
  assert.ok(out.state.systems.beacons.some((b) => b.id === "listen:reef_pumphouse_site"), "the site is marked on the chart");
  assert.match(out.state.feedback, /Old intake pump house 270° · 120 m/);
  const bare = structuredClone(s), hull = bare.fleet.vehicles.find((x) => x.id === v.id)!;
  bare.inventory.items = bare.inventory.items.filter((i) => !hull.modules.includes(i.id)); hull.modules = [];
  assert.ok(upgrade(bare, "listen").events.some((e) => e.type === "notice" && e.error && /No listening array/.test(e.message)));
});

test("Hush specimen bay: spores that tear by hand come aboard intact", () => {
  const p = SOURCES.basin_pale_spores.position;
  const s = creelFirst(), v = withHull(s, "hush", { x: p.x + 4, y: p.y + 2, z: p.z }, ["hush_specimen_bay"], true);
  const out = upgrade(s, "sample");
  assert.equal(out.state.inventory.items.filter((i) => i.containerId === v.cargoId && i.kind === "seed_pale_spore").length, 1);
  assert.equal(out.state.world.resources.find((r) => r.id === "basin_pale_spores")!.stock, SOURCES.basin_pale_spores.stock - 1);
});

test("Spindle solar array charges hold cells while surfaced and parked; its radio mast relays a remote decoder", () => {
  const { s, outpost } = busyOutpost();
  const v = withHull(s, "spindle", { x: 600, y: -0.5, z: 60 }, ["spindle_solar_array", "spindle_radio_mast"]);
  const cell = addItem(s, "reserve_cell", 1, v.cargoId); cell.charge = 50;
  stepUpgrades(s, new Set());
  assert.ok(Math.abs(cell.charge! - (50 + DECK_CHARGE_RATE * DT)) < 1e-9, "the deck array tops up the cell");
  stepUpgrades(s, new Set([v.id]));
  assert.ok(Math.abs(cell.charge! - (50 + DECK_CHARGE_RATE * DT)) < 1e-9, "not while under way");
  const host = listHosts(s, s.systems).find((h) => h.id === outpost)!;
  assert.equal(systemsContext(s).relayed!(host), false, "far out, beyond the mast's reach");
  v.pose.position = { x: LEDGE.x + 30, y: -0.5, z: LEDGE.z };
  assert.equal(systemsContext(s).relayed!(host), true, "within reach, the mast relays the outpost's decoder");
});

test("Spindle shore ramp: a beached Spindle loads from the shore", () => {
  // A beach on the island's south side, away from every bench.
  const s = creelFirst(), shore = { x: 20, y: 0.47, z: -78 };
  const v = withHull(s, "spindle", { x: 28, y: -0.5, z: -78 }, []);
  at(s, shore, "walking");
  assert.equal(containerAccessible(s, v.cargoId), false, "8 m off the beach, no ramp: out of reach");
  v.modules.push(addItem(s, "spindle_shore_ramp", 1, v.cargoId).id);
  assert.equal(containerAccessible(s, v.cargoId), true, "the ramp reaches up the shore");
});

// --- Fitting, refits, power ---------------------------------------------------------

test("a common upgrade is made at the workshop and fitted to the Creel; its line takes one", () => {
  let s = creelFirst();
  fund(s, "plating_alloy");
  // The Creel sits in the workshop's medium slip; fit from its cradle.
  const v = creelOf(s), plate = item(s, "plating_alloy"), before = vehicleProfile(s, v);
  at(s, { x: -6, y: -1, z: -21 });
  s = run(s, { type: "install-module", vehicleId: v.id, itemId: plate }).state;
  const fitted = creelOf(s);
  assert.ok(fitted.modules.includes(plate));
  assert.notDeepEqual(vehicleProfile(s, fitted), before, "the plating changes the hull's profile");
  roundTrip(s);
  fund(s, "plating_alloy");
  at(s, { x: -6, y: -1, z: -21 });
  const second = s.inventory.items.find((i) => i.kind === "plating_alloy" && i.id !== plate)!;
  refused(s, { type: "install-module", vehicleId: v.id, itemId: second.id }, /plating|line|already/i);
});

test("refits run at the restored stop of their tier: the 450 m suit at the Rift materials station", () => {
  const s = creelFirst(), stop = WORKING_STOPS.rift_station.work;
  at(s, stop, "swimming");
  for (const [k, q] of Object.entries(RECIPES.restore_rift_station.cost)) addItem(s, k as ItemKind, q, "diver");
  assert.equal(craft(s, "restore_rift_station", world), null);
  for (const [k, q] of Object.entries(RECIPES.suit_450.cost)) addItem(s, k as ItemKind, q, "diver");
  assert.equal(craft(s, "suit_450", world), null, "the station does the 450 m refit");
  assert.ok(s.inventory.items.some((i) => i.kind === "suit_450" && i.fitted === "suit"));
  roundTrip(s);
  // Away from both the workshop and the station, the refusal names both.
  const away = creelFirst(); at(away, { x: -40, y: -20, z: 0 }, "swimming");
  assert.match(craftingBlock(away, "suit_450", world)?.message ?? "", /island workshop bench or the Ember Rift materials station/);
});

test("the air line: a parked, powered Creel feeds a diver beside it and pays from its battery", () => {
  let s = creelFirst();
  const v = parkCreel(s, { x: -40, y: -20, z: 0 }, 0); at(s, { x: -40, y: -20, z: 6 }, "swimming");
  assert.equal(airSupply(s).kind, "line");
  const oxygen = s.player.vitals.oxygen, charge = v.charge;
  s = idle(20, s);
  assert.ok(s.player.vitals.oxygen >= oxygen, "no suit oxygen spent on the line");
  assert.ok(creelOf(s).charge < charge, "the craft pays for the line");
  creelOf(s).charge = 0;
  assert.equal(airSupply(s).kind, "suit", "a flat Creel feeds no air");
});

// --- The current objective ------------------------------------------------------------

test("the objective puts recovery first while a craft is disabled, and H says the practical step first", () => {
  let s = creelFirst();
  assert.equal(currentObjective(s).kind, "progress");
  parkCreel(s, { x: -40, y: -20, z: 0 }, 0); disableVehicle(s, creelOf(s).id);
  const o = currentObjective(s);
  assert.equal(o.kind, "recovery");
  assert.match(o.step, /Creel is disabled .* m .*Bobbin kit/);
  s = executeCommand(s, { type: "hint" }, world).state;
  assert.ok(s.feedback.startsWith(o.step), "H leads with the practical step");
});

test("the carrier bridge takes a decoder; the Hearthline powers 2 system sockets, 4 with the system bay", () => {
  const bridge = HEARTHLINE_SOCKETS.find((k) => k.id === "hl.socket.bridge.survey")!;
  assert.ok(bridge.accepts.some((a) => CARRIER_OCCUPANTS[a] === "decoder"));
  const s = fixtureGame(), h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!, host = `carrier:${h.id}`;
  for (const [n, socket] of ["hl.socket.bridge.survey", "hl.socket.fab.bench.1"].entries())
    s.systems.sockets.push({ hostId: host, socket, itemId: `mod_${n}`, kind: "mod_decoder" } as never);
  assert.match(carrierSocketRefusal(s, host) ?? "", /2 system sockets \(4 with the system bay\)/);
  h.modules.push(addItem(s, "hearthline_system_bay", 1, h.cargoId).id);
  assert.equal(carrierSocketRefusal(s, host), null, "the bay powers two more");
});
