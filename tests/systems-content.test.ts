import test from "node:test";
import assert from "node:assert/strict";
import { BLUEPRINTS, ITEMS, MATERIALS, RECIPES, SOURCES, TECH_RECORDS } from "../src/content/registry.js";
import { regionAtPoint } from "../src/content/regions/index.js";
import { HEARTHLINE_SOCKETS } from "../src/content/fleet/hearthlineInterior.js";
import { SEEDS } from "../src/content/systems/cultivation.js";
import { MODULE_KINDS, MODULES, OUTPOST_TIER_ORDER, OUTPOST_TIERS } from "../src/content/systems/hosts.js";
import { SYS2_BLUEPRINTS, SYS2_ITEMS, SYS2_RECIPES, SYS2_SOURCES, SYS2_TECH_RECORDS } from "../src/content/systems/items.js";
import { carrierHost, carrierHostId, carrierOccupants, installModule, listHosts, removeModule } from "../src/sim/systems/hosts.js";
import { createSystems, validSystems } from "../src/sim/systems/state.js";
import { instanceProblems } from "../src/sim/systems/instances.js";
import { advanceDecodes, discoverSite, startDecode } from "../src/sim/systems/decoder.js";
import { makeVehicle } from "../src/sim/state.js";
import { carrierInteriorSolids, fixtureGame } from "../src/sim/carrier.js";
import { give, opened } from "./systems-support.js";

test("proposed IDs don't collide with the registry and every reference resolves", () => {
  for (const k of Object.keys(SYS2_ITEMS)) assert.ok(!Object.hasOwn(ITEMS, k), `item ${k}`);
  for (const k of Object.keys(SYS2_RECIPES)) assert.ok(!Object.hasOwn(RECIPES, k), `recipe ${k}`);
  for (const k of Object.keys(SYS2_SOURCES)) assert.ok(!Object.hasOwn(SOURCES, k), `source ${k}`);
  for (const k of Object.keys(SYS2_TECH_RECORDS)) assert.ok(!Object.hasOwn(TECH_RECORDS, k), `record ${k}`);
  for (const k of Object.keys(SYS2_BLUEPRINTS)) assert.ok(!(BLUEPRINTS as readonly string[]).includes(k), `blueprint ${k}`);
  for (const [id, r] of Object.entries(SYS2_RECIPES)) {
    assert.ok(Object.hasOwn(SYS2_ITEMS, r.output), `${id} output`);
    for (const k of Object.keys(r.cost)) assert.ok(Object.hasOwn(MATERIALS, k) || k === "tagged_frame", `${id} cost ${k}`);
    for (const n of r.needs) assert.ok(Object.hasOwn(RECIPES, n), `${id} needs ${n}`);
  }
  for (const m of MODULE_KINDS) assert.ok(Object.hasOwn(SYS2_ITEMS, MODULES[m].item), m);
  for (const t of OUTPOST_TIER_ORDER) {
    assert.ok(Object.hasOwn(SYS2_ITEMS, OUTPOST_TIERS[t].kit));
    assert.ok(Object.hasOwn(SYS2_BLUEPRINTS, OUTPOST_TIERS[t].bp));
  }
  for (const seed of Object.keys(SEEDS)) assert.ok(Object.hasOwn(SYS2_ITEMS, seed), seed);
  for (const seed of Object.values(SEEDS)) assert.ok(Object.hasOwn(ITEMS, seed.produce) || Object.hasOwn(SYS2_ITEMS, seed.produce), seed.produce);
  for (const src of Object.values(SYS2_SOURCES)) {
    assert.ok(Object.hasOwn(SEEDS, src.item), src.item);
    assert.equal(regionAtPoint(src.position.x, src.position.z) ?? src.region, src.region, `${src.label} lies in ${src.region}`);
  }
});

test("the basic kit is early and each tier needs one material from beyond the last", () => {
  const early = new Set(["structural_alloy", "silica_glass", "flex_membrane"]);
  assert.ok(Object.keys(SYS2_RECIPES.outpost_kit_basic.cost).every((k) => early.has(k)));
  assert.equal(SYS2_RECIPES.outpost_kit_basic.site, "pod_fabricator");
  assert.deepEqual(OUTPOST_TIER_ORDER.map((t) => OUTPOST_TIERS[t].sockets), [1, 3, 5]);
  assert.ok("conductive_crust" in OUTPOST_TIERS.standard.upgrade!);
  assert.ok("pressure_ceramic" in OUTPOST_TIERS.advanced.upgrade!);
  for (const t of OUTPOST_TIER_ORDER) {
    const loss = Object.values(OUTPOST_TIERS[t].packLoss).reduce((n, q) => n + q, 0);
    assert.ok(loss >= 1 && loss <= 2, `${t} packing loses a small amount`);
  }
  const plans = SYS2_TECH_RECORDS.workshop_decoder_rack.blueprints as readonly string[];
  assert.ok(plans.includes("bp_decoder") && plans.includes("bp_signal_relay"));
});

test("the carrier is a socket host: Hearthline system sockets take modules and write back their occupants", () => {
  const { s, sys } = opened();
  const h = makeVehicle("hearthline_9", "hearthline", { x: 300, y: -20, z: 0 }, "hearthline_9_hold");
  s.fleet.vehicles.push(h);
  s.inventory.containers.push({ id: "hearthline_9_hold", kind: "vehicle", capacity: 192, ownerId: h.id });
  const host = carrierHost(s, sys, h);
  assert.equal(host.kind, "carrier");
  assert.ok(listHosts(s, sys).some((x) => x.id === carrierHostId(h.id)));
  const kinds = new Set(host.sockets.flatMap((k) => k.accepts));
  for (const m of ["planter", "survey", "relay", "fabricator", "charger", "locker", "decoder"]) assert.ok(kinds.has(m as never), m);
  assert.ok(host.sockets.every((k) => HEARTHLINE_SOCKETS.some((x) => x.id === k.id)));
  const planter = give(s, "mod_planter");
  assert.match(installModule(s, sys, host.id, "hl.socket.galley.planter", planter) ?? "", /Work at Hearthline/);
  s.player.interiorId = h.id;
  assert.equal(installModule(s, sys, host.id, "hl.socket.galley.planter", planter), null);
  assert.deepEqual(carrierOccupants(sys, h.id), { "hl.socket.galley.planter": "galley_planter" });
  const decoder = give(s, "mod_decoder");
  assert.match(installModule(s, sys, host.id, "hl.socket.bridge.survey", decoder) ?? "", /not the decoder/);
  assert.equal(installModule(s, sys, host.id, "hl.socket.fab.bench.1", decoder), null);
  assert.equal(carrierOccupants(sys, h.id)["hl.socket.fab.bench.1"], "sample_analyser");
});

test("validSystems accepts fresh and populated state and rejects malformed rows", () => {
  assert.ok(validSystems(createSystems()));
  const ok = {
    ...createSystems(),
    outposts: [{ id: "item_4", tier: "basic", name: "Outpost 1", position: { x: 1, y: 2, z: 3 }, region: "refuge_reef", power: "cells" }],
    sockets: [{ hostId: "item_4", socket: "s0", itemId: "item_5", kind: "mod_decoder" }],
    found: ["demo_hut_fragment"], decodes: [{ moduleId: "item_5", decodable: "demo_hut_fragment", progress: 12.5 }],
    planters: [{ moduleId: "item_6", seed: "seed_staple_cup", progress: 3 }],
    beacons: [{ id: "beacon_7", name: "Shelf", category: "player", position: { x: 0, y: 0, z: 0 }, source: "player" }],
    beaconsOff: ["beacon_7"], categoriesOff: ["hint"], chart: ["0:0", "-3:12"],
  };
  assert.ok(validSystems(ok));
  const bad: unknown[] = [
    null, { ...ok, extra: 1 }, { ...ok, outposts: [{ ...ok.outposts[0], tier: "mega" }] },
    { ...ok, sockets: [...ok.sockets, { ...ok.sockets[0] }] },
    { ...ok, decodes: [{ ...ok.decodes[0], decodable: "demo_vault_archive" }] },
    { ...ok, decoded: ["demo_cairn_survey"] },
    { ...ok, planters: [{ ...ok.planters[0], progress: -1 }] },
    { ...ok, beacons: [{ ...ok.beacons[0], name: "" }] },
    { ...ok, chart: ["a:b"] },
    { ...ok, categoriesOff: ["nope"] },
  ];
  for (const [n, v] of bad.entries()) assert.equal(validSystems(v), false, `case ${n}`);
});

test("carrier sockets stay in step: install → remove → reinstall updates docking.sockets and the interior solids; seeded fittings stay", () => {
  const s = fixtureGame(), sys = createSystems(), h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!;
  s.player.interiorId = h.id;
  s.player.controlledVehicleId = null;
  const hostId = carrierHostId(h.id), socket = "hl.socket.fab.bench.1", decoder = give(s, "mod_decoder");
  const solid = () => carrierInteriorSolids(s).some((x) => x.id === socket);
  const sync = () => Object.assign(s.fleet.docking!.sockets, carrierOccupants(sys, h.id));
  assert.equal(s.fleet.docking!.sockets[socket], null);
  assert.equal(solid(), false);
  assert.equal(installModule(s, sys, hostId, socket, decoder), null);
  assert.equal(s.fleet.docking!.sockets[socket], "sample_analyser");
  assert.equal(solid(), true);
  sync();
  assert.equal(removeModule(s, sys, hostId, socket), null);
  sync();
  assert.equal(s.fleet.docking!.sockets[socket], null, "a removal clears exactly the slot it filled");
  assert.equal(solid(), false);
  assert.equal(carrierHost(s, sys, h).sockets.find((k) => k.id === socket)!.occupant, null);
  assert.equal(installModule(s, sys, hostId, socket, decoder), null, "reinstall works");
  assert.equal(solid(), true);
  // The fixture's seeded planter is a fitting without an item: it stays and refuses installs.
  const planter = give(s, "mod_planter");
  assert.match(installModule(s, sys, hostId, "hl.socket.galley.planter", planter) ?? "", /already holds the galley planter/);
  assert.match(removeModule(s, sys, hostId, "hl.socket.galley.planter") ?? "", /belongs to the carrier fit-out/);
  sync();
  assert.equal(s.fleet.docking!.sockets["hl.socket.galley.planter"], "galley_planter");
});

test("composed validation rejects stranded modules: missing carrier, furniture-only or incompatible socket, non-module kind; a disabled carrier keeps its modules", () => {
  const s = fixtureGame(), sys = createSystems(), h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!;
  s.player.interiorId = h.id;
  s.player.controlledVehicleId = null;
  const hostId = carrierHostId(h.id), socket = "hl.socket.fab.bench.1";
  const decoder = give(s, "mod_decoder"), planter = give(s, "mod_planter");
  assert.equal(installModule(s, sys, hostId, socket, decoder), null);
  assert.equal(installModule(s, sys, hostId, "hl.socket.galley.wall", planter), null);
  discoverSite(sys, "demo_relay_hut");
  assert.equal(startDecode(s, sys, hostId, "demo_hut_fragment"), null);
  advanceDecodes(s, sys, 99);
  const composed = (x: typeof sys) => ({ shape: validSystems(x), cross: instanceProblems(s, x) });
  assert.deepEqual(composed(sys), { shape: true, cross: [] });

  const variant = (edit: (x: typeof sys) => void) => { const x = structuredClone(sys); edit(x); return composed(x); };
  const missing = variant((x) => { x.sockets[0]!.hostId = "carrier:missing"; });
  assert.match(missing.cross.join("\n"), /module .* in carrier:missing\/hl\.socket\.fab\.bench\.1: the host doesn't exist/);
  const furniture = variant((x) => { x.sockets[0]!.socket = "hl.socket.cabin.wall"; });
  assert.equal(furniture.shape, false);
  assert.match(furniture.cross.join("\n"), /Hearthline has no module socket hl\.socket\.cabin\.wall/);
  const wrongKind = variant((x) => { x.sockets[1]!.socket = "hl.socket.fab.bench.2"; });
  assert.equal(wrongKind.shape, false);
  assert.match(wrongKind.cross.join("\n"), /the socket doesn't take the planter/);
  const notModule = variant((x) => { x.sockets.push({ hostId: "home_pod", socket: "s1", itemId: "item_900", kind: "nav_beacon" }); });
  assert.match(notModule.cross.join("\n"), /nav_beacon is not a socket module/);

  // The carrier's own occupant record must agree with the installed module.
  s.fleet.docking!.sockets[socket] = null;
  assert.match(instanceProblems(s, sys).join("\n"), /the carrier records nothing there, not sample_analyser/);
  s.fleet.docking!.sockets[socket] = "sample_analyser";

  // Availability is not existence: a disabled carrier keeps its modules validly.
  h.disabled = true;
  assert.deepEqual(composed(sys), { shape: true, cross: [] });
  assert.match(removeModule(s, sys, hostId, socket) ?? "", /Hearthline is disabled/);
});
