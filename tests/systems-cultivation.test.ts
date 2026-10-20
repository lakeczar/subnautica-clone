import test from "node:test";
import assert from "node:assert/strict";
import { SEED_KINDS, SEEDS, seedCollectable } from "../src/content/systems/cultivation.js";
import { advanceGrowth, cropViews, harvest, harvestPreview, plant } from "../src/sim/systems/cultivation.js";
import { carrierCompartment } from "../src/sim/inventory.js";
import { fixtureGame } from "../src/sim/carrier.js";
import { createSystems } from "../src/sim/systems/state.js";
import { carrierHostId, installModule, outpostLockerId, removeModule } from "../src/sim/systems/hosts.js";
import { deployOutpost } from "../src/sim/systems/outposts.js";
import type { GameState } from "../src/sim/types.js";
import type { SystemsState } from "../src/sim/systems/state.js";
import { diverCapacity, give, opened, siteTable, snapshot, SPOTS, swimTo } from "./systems-support.js";

function planterOutpost(): { s: GameState; sys: SystemsState; id: string; planter: string } {
  const { s, sys } = opened();
  const id = give(s, "outpost_kit_basic");
  swimTo(s, SPOTS.a);
  deployOutpost(s, sys, id, SPOTS.a, siteTable());
  const planter = give(s, "mod_planter");
  assert.equal(installModule(s, sys, id, "s0", planter), null);
  return { s, sys, id, planter };
}
const grow = (sys: SystemsState, seconds: number) => { for (let n = 0; n < seconds; n++) advanceGrowth(sys, 1); };

test("crops cover food, medicine, a recipe material and bio-cells; several minutes; regional; one needs the specimen bay", () => {
  const roles = new Set(SEED_KINDS.map((k) => SEEDS[k].role));
  for (const role of ["food", "medicine", "material", "power"]) assert.ok(roles.has(role as never), role);
  assert.ok(SEED_KINDS.some((k) => SEEDS[k].produce === "bio_cell"));
  assert.ok(SEED_KINDS.some((k) => SEEDS[k].produce === "flex_membrane" || SEEDS[k].produce === "conductive_crust"));
  for (const k of SEED_KINDS) assert.ok(SEEDS[k].growSeconds >= 300 && SEEDS[k].growSeconds <= 900, `${k} ${SEEDS[k].growSeconds}`);
  assert.ok(new Set(SEED_KINDS.map((k) => SEEDS[k].region)).size >= 3);
  assert.equal(seedCollectable("seed_pale_spore", false), false);
  assert.equal(seedCollectable("seed_pale_spore", true), true);
  assert.equal(seedCollectable("seed_staple_cup", false), true);
});

test("plant before an expedition, harvest after: growth, refusals, harvest and replant", () => {
  const { s, sys, id } = planterOutpost();
  assert.match(plant(s, sys, id, "s0", "seed_staple_cup") ?? "", /Carry a staple cup cutting/);
  give(s, "seed_staple_cup", 2);
  assert.equal(plant(s, sys, id, "s0", "seed_staple_cup"), null);
  assert.match(plant(s, sys, id, "s0", "seed_staple_cup") ?? "", /growing staple cups/);
  grow(sys, SEEDS.seed_staple_cup.growSeconds - 1);
  const before = snapshot(s, sys);
  assert.match(harvest(s, sys, id, "s0") ?? "", /99% grown/);
  assert.equal(snapshot(s, sys), before);
  assert.deepEqual(advanceGrowth(sys, 1), ["seed_staple_cup"]);
  assert.equal(cropViews(sys)[0]!.ready, true);
  assert.match(plant(s, sys, id, "s0", "seed_staple_cup") ?? "", /Harvest the ready crop first/);
  const p = harvestPreview(s, sys, id, "s0");
  assert.deepEqual([p.refusal, p.produce, p.quantity, p.to, p.cutting], [null, "meal", 2, outpostLockerId(id), "replanted"]);
  assert.equal(harvest(s, sys, id, "s0"), null);
  assert.equal(s.inventory.items.find((i) => i.kind === "meal" && i.containerId === outpostLockerId(id))?.quantity, 2);
  assert.equal(sys.planters[0]!.progress, 0, "replanted from the same cutting");
  grow(sys, SEEDS.seed_staple_cup.growSeconds);
  assert.equal(harvest(s, sys, id, "s0", { to: "diver", replant: false }), null);
  assert.equal(sys.planters.length, 0);
  assert.equal(s.inventory.items.find((i) => (i.kind as string) === "seed_staple_cup" && i.containerId === "diver")?.quantity, 2, "the cutting returns");
});

test("bio-cells are grown as separate charged instances; SYS-1 decides how they power craft", () => {
  const { s, sys, id } = planterOutpost();
  give(s, "seed_lumen_bulb", 1);
  plant(s, sys, id, "s0", "seed_lumen_bulb");
  grow(sys, SEEDS.seed_lumen_bulb.growSeconds);
  assert.equal(harvest(s, sys, id, "s0", { to: "diver" }), null);
  const cells = s.inventory.items.filter((i) => (i.kind as string) === "bio_cell");
  assert.equal(cells.length, 1);
  assert.equal(cells[0]!.charge, 100);
});

test("harvest refuses without room, and growth pauses while the planter is out of its socket", () => {
  const { s, sys, id } = planterOutpost();
  give(s, "seed_ribbon_fan", 1);
  plant(s, sys, id, "s0", "seed_ribbon_fan");
  grow(sys, 100);
  assert.equal(removeModule(s, sys, id, "s0"), null);
  grow(sys, 100);
  assert.equal(sys.planters[0]!.progress, 100);
  assert.equal(cropViews(sys)[0]!.growing, false);
  installModule(s, sys, id, "s0", sys.planters[0]!.moduleId);
  grow(sys, 320);
  diverCapacity(s, 0);
  s.inventory.containers.find((c) => c.id === outpostLockerId(id))!.capacity = 2;
  const before = snapshot(s, sys);
  assert.match(harvest(s, sys, id, "s0") ?? "", /needs 3 CU free in a locker here or your hold/);
  assert.match(harvest(s, sys, id, "s0", { to: "diver" }) ?? "", /needs 3 CU free in diver hold/);
  assert.equal(snapshot(s, sys), before);
  swimTo(s, SPOTS.b);
  assert.match(harvest(s, sys, id, "s0") ?? "", /Tend planters at Outpost 1/);
  assert.match(plant(s, sys, "home_pod", "s0", "seed_ribbon_fan") ?? "", /Tend planters at Home pod/);
});

test("a restricted container must take every output: the pantry takes meals but not the returned cutting", () => {
  const s = fixtureGame(), sys = createSystems(), h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!;
  s.player.interiorId = h.id;
  s.player.controlledVehicleId = null;
  const hostId = carrierHostId(h.id), socket = "hl.socket.galley.wall";
  assert.equal(installModule(s, sys, hostId, socket, give(s, "mod_planter")), null);
  give(s, "seed_staple_cup", 1);
  assert.equal(plant(s, sys, hostId, socket, "seed_staple_cup"), null);
  grow(sys, SEEDS.seed_staple_cup.growSeconds);
  const pantry = s.inventory.containers.find((c) => carrierCompartment(s, c.id)?.accepts === "food")!.id;
  const before = snapshot(s, sys);
  assert.equal(harvestPreview(s, sys, hostId, socket, { to: pantry, replant: false }).refusal,
    "Hearthline pantry doesn't take staple cup cutting. Harvest elsewhere, or replant the cutting. Nothing harvested.");
  assert.match(harvest(s, sys, hostId, socket, { to: pantry, replant: false }) ?? "", /doesn't take staple cup cutting/);
  assert.equal(snapshot(s, sys), before);
  assert.equal(harvest(s, sys, hostId, socket, { to: pantry }), null, "replanting keeps the cutting, so meals alone go to the pantry");
  assert.deepEqual(s.inventory.items.filter((i) => i.containerId === pantry).map((i) => [i.kind, i.quantity]), [["meal", 2]]);
});
