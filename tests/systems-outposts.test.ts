import test from "node:test";
import assert from "node:assert/strict";
import { OUTPOST_TIERS } from "../src/content/systems/hosts.js";
import { decodeViews, discoverSite, startDecode } from "../src/sim/systems/decoder.js";
import { harvest, plant } from "../src/sim/systems/cultivation.js";
import { hostById, installModule, moduleLockerId, outpostLockerId, removeModule } from "../src/sim/systems/hosts.js";
import { usedCapacity } from "../src/sim/inventory.js";
import { validSystems } from "../src/sim/systems/state.js";
import { conservedTotals, deployOutpost, deployPreview, packOutpost, packPreview, sitePower, upgradeOutpost, upgradePreview } from "../src/sim/systems/outposts.js";
import { advanceSystems } from "../src/sim/systems/step.js";
import type { GameState, Vec3 } from "../src/sim/types.js";
import type { SystemsState } from "../src/sim/systems/state.js";
import { diverCapacity, give, LEDGE, ledger, opened, siteTable, snapshot, SPOTS, swimTo } from "./systems-support.js";

const world = siteTable();
function deployAt(s: GameState, sys: SystemsState, spot: Vec3, kind = "outpost_kit_basic"): string {
  const kit = give(s, kind);
  swimTo(s, spot);
  assert.equal(deployOutpost(s, sys, kit, spot, world), null);
  return kit;
}
/** Totals after paying `cost`, without zero rows. */
function minus(totals: Record<string, number>, cost: Record<string, number>): Record<string, number> {
  const out = { ...totals };
  for (const [k, n] of Object.entries(cost)) { out[k] = (out[k] ?? 0) - n; if (!out[k]) delete out[k]; }
  return out;
}
/** Runs `seconds` of active steps of every SYS-2 background rule. */
function play(s: GameState, sys: SystemsState, seconds: number): void {
  for (let n = 0; n < seconds; n++) advanceSystems(s, sys, {}, 1);
}

test("a basic kit deploys at a ledge: charger, locker and one socket, power from the location", () => {
  const { s, sys } = opened();
  const kit = deployAt(s, sys, SPOTS.a);
  assert.ok(!s.inventory.items.some((i) => i.id === kit), "the kit becomes the outpost");
  assert.equal(sys.outposts.length, 1);
  const o = sys.outposts[0]!;
  assert.equal(o.id, kit);
  assert.equal(o.tier, "basic");
  assert.equal(o.power, "cells");
  assert.equal(o.name, "Outpost 1");
  const host = hostById(s, sys, kit)!;
  assert.deepEqual(host.builtIn, ["charger", "locker"]);
  assert.equal(host.sockets.length, 1);
  assert.equal(s.inventory.containers.find((c) => c.id === outpostLockerId(kit))?.capacity, OUTPOST_TIERS.basic.lockerCu);
});

test("power follows the location: thermal at a vent, solar in bright open water, cells in caves and deep water", () => {
  assert.equal(sitePower({ ...LEDGE, ventDistance: 10 }), "thermal");
  assert.equal(sitePower({ ...LEDGE, depth: 10, ventDistance: 10 }), "thermal");
  assert.equal(sitePower({ ...LEDGE, depth: 12 }), "solar");
  assert.equal(sitePower({ ...LEDGE, depth: 12, covered: true, ground: "cave_floor" }), "cells");
  assert.equal(sitePower({ ...LEDGE, depth: 120 }), "cells");
});

test("siting refusals name the problem and change nothing", () => {
  const { s, sys } = opened();
  const kit = give(s, "outpost_kit_basic");
  swimTo(s, SPOTS.a);
  const cases: [Partial<typeof LEDGE>, RegExp][] = [
    [{ ground: "open_water" }, /nothing to anchor/],
    [{ ground: "seabed" }, /ledge, a cave floor, or firm ground near a vent/],
    [{ ground: "slope", ventDistance: 5 }, /ledge, a cave floor, or firm ground near a vent/],
    [{ slope: 35 }, /Too steep/],
    [{ clear: false }, /clear footprint/],
  ];
  for (const [sample, message] of cases) {
    const before = snapshot(s, sys);
    assert.match(deployOutpost(s, sys, kit, SPOTS.a, siteTable(sample)) ?? "", message);
    assert.equal(snapshot(s, sys), before);
  }
  assert.equal(deployPreview(s, sys, kit, SPOTS.a, siteTable({ ground: "seabed", ventDistance: 20 })).refusal, null, "firm ground near a vent holds");
  assert.equal(deployPreview(s, sys, kit, SPOTS.a, siteTable({ ground: "cave_floor", covered: true })).refusal, null);
  assert.match(deployPreview(s, sys, kit, { ...SPOTS.a, x: SPOTS.a.x + 10 }, world).refusal ?? "", /within reach/);
  s.player.controlledVehicleId = "dart_1";
  assert.match(deployPreview(s, sys, kit, SPOTS.a, world).refusal ?? "", /Leave the craft/);
  swimTo(s, SPOTS.a);
  s.inventory.items.find((i) => i.id === kit)!.containerId = "pod_locker";
  assert.match(deployPreview(s, sys, kit, SPOTS.a, world).refusal ?? "", /Carry the kit/);
  assert.match(deployPreview(s, sys, "nope", SPOTS.a, world).refusal ?? "", /Choose an outpost kit/);
  swimTo(s, { x: 0, y: -5, z: 0 });
  s.inventory.items.find((i) => i.id === kit)!.containerId = "diver";
  assert.match(deployPreview(s, sys, kit, { x: 0, y: -5, z: 0 }, world).refusal ?? "", /Too close to Home pod/);
});

test("about three outposts at once; SYS-1's bonus raises the limit; spacing applies between outposts", () => {
  const { s, sys } = opened();
  deployAt(s, sys, SPOTS.a);
  deployAt(s, sys, SPOTS.b);
  deployAt(s, sys, SPOTS.c);
  const kit = give(s, "outpost_kit_basic");
  swimTo(s, SPOTS.d);
  assert.match(deployPreview(s, sys, kit, SPOTS.d, world).refusal ?? "", /3 outposts are already active/);
  assert.equal(deployPreview(s, sys, kit, SPOTS.d, world, { limitBonus: 1 }).refusal, null);
  swimTo(s, { ...SPOTS.a, x: SPOTS.a.x + 20 });
  assert.match(deployPreview(s, sys, kit, s.player.pose.position, world, { limitBonus: 1 }).refusal ?? "", /Too close to Outpost 1/);
});

test("modules install into sockets that accept them and return under the same ID", () => {
  const { s, sys } = opened();
  const id = deployAt(s, sys, SPOTS.a);
  const decoder = give(s, "mod_decoder"), planter = give(s, "mod_planter");
  assert.match(installModule(s, sys, id, "s0", give(s, "meal")) ?? "", /Choose a module/);
  assert.equal(installModule(s, sys, id, "s0", decoder), null);
  assert.ok(!s.inventory.items.some((i) => i.id === decoder));
  assert.match(installModule(s, sys, id, "s0", planter) ?? "", /already holds the decoder/);
  assert.match(installModule(s, sys, id, "s1", planter) ?? "", /no socket s1/);
  swimTo(s, SPOTS.b);
  assert.match(removeModule(s, sys, id, "s0") ?? "", /Work at Outpost 1/);
  swimTo(s, SPOTS.a);
  assert.equal(removeModule(s, sys, id, "s0"), null);
  assert.equal(s.inventory.items.find((i) => i.id === decoder)?.containerId, "diver");
  assert.match(removeModule(s, sys, id, "s0") ?? "", /empty/);
});

test("restored stops are larger fixed hosts with a unique service, usable once restored; the pod works from the start", () => {
  const { s, sys } = opened();
  const stop = hostById(s, sys, "canopy_stop")!;
  assert.equal(stop.kind, "stop");
  assert.ok(stop.sockets.length > OUTPOST_TIERS.basic.sockets);
  assert.ok(stop.unique);
  assert.equal(stop.available, false);
  const pod = hostById(s, sys, "home_pod")!;
  assert.ok(pod.available && pod.unique);
  const relay = give(s, "mod_relay");
  // completeOpening leaves the diver at the pod bench.
  assert.equal(installModule(s, sys, "home_pod", "s0", relay), null);
  swimTo(s, { x: 10, y: 2, z: -36 });
  const planter = give(s, "mod_planter");
  assert.match(installModule(s, sys, "island_workshop", "s0", planter) ?? "", /Restore Splitspine workshop/);
  s.world.facilities.find((f) => f.id === "island_workshop")!.repaired = true;
  assert.equal(installModule(s, sys, "island_workshop", "s0", planter), null);
});

test("a locker module adds a container, refuses removal while it holds anything", () => {
  const { s, sys } = opened();
  const id = deployAt(s, sys, SPOTS.a);
  const locker = give(s, "mod_locker");
  assert.equal(installModule(s, sys, id, "s0", locker), null);
  give(s, "structural_alloy", 2, moduleLockerId(locker));
  assert.match(removeModule(s, sys, id, "s0") ?? "", /Empty the locker module first/);
  assert.ok(hostById(s, sys, id)!.lockers.includes(moduleLockerId(locker)));
});

test("packing previews the exact loss and moves, then returns the kit under its ID with its layout remembered", () => {
  const { s, sys } = opened();
  diverCapacity(s, 40);
  const id = deployAt(s, sys, SPOTS.a);
  const charger = give(s, "mod_charger");
  installModule(s, sys, id, "s0", charger);
  give(s, "structural_alloy", 2, outpostLockerId(id));
  give(s, "silica_glass", 1, outpostLockerId(id));
  const totals = conservedTotals(s, sys);
  const p = packPreview(s, sys, id);
  assert.equal(p.refusal, null);
  assert.deepEqual(p.loss.lines.map((l) => [l.kind, l.quantity, l.from]), [["structural_alloy", 1, outpostLockerId(id)]]);
  assert.deepEqual(p.locker.map((m) => [m.kind, m.quantity]).sort(), [["silica_glass", 1], ["structural_alloy", 1]]);
  assert.deepEqual(p.modules.map((m) => m.itemId), [charger]);
  assert.equal(p.needCu, 6 + 2 + 2 + 1);
  assert.equal(packOutpost(s, sys, id), null);
  assert.equal(sys.outposts.length, 0);
  assert.equal(s.inventory.items.find((i) => i.id === id)?.kind, "outpost_kit_basic");
  assert.equal(s.inventory.items.find((i) => i.id === charger)?.containerId, "diver");
  assert.ok(!s.inventory.containers.some((c) => c.id === outpostLockerId(id)));
  assert.deepEqual(sys.packed, [{ itemId: id, tier: "basic", name: "Outpost 1", layout: [{ socket: "s0", itemId: charger }] }]);
  const after = conservedTotals(s, sys);
  assert.deepEqual(after, minus(totals, { structural_alloy: 1 }));
  // Redeploy elsewhere: same name, the carried module is refitted.
  swimTo(s, SPOTS.b);
  const pre = deployPreview(s, sys, id, SPOTS.b, world);
  assert.deepEqual(pre.refit.map((r) => r.itemId), [charger]);
  assert.equal(deployOutpost(s, sys, id, SPOTS.b, world), null);
  assert.equal(sys.outposts[0]!.name, "Outpost 1");
  assert.equal(hostById(s, sys, id)!.sockets[0]!.occupant?.itemId, charger);
  assert.equal(sys.packed.length, 0);
});

test("packing is refused, with nothing changed, without anchor material or room", () => {
  const { s, sys } = opened();
  const id = deployAt(s, sys, SPOTS.a);
  let before = snapshot(s, sys);
  assert.match(packOutpost(s, sys, id) ?? "", /spends 1 × Structural alloy.*Nothing packed/);
  assert.equal(snapshot(s, sys), before);
  give(s, "structural_alloy", 1);
  give(s, "flex_membrane", 10, outpostLockerId(id));
  // The alloy paid from the hold frees its room: 6 CU kit + 10 CU membrane fit 16 exactly.
  assert.equal(packPreview(s, sys, id).refusal, null);
  diverCapacity(s, 15);
  before = snapshot(s, sys);
  assert.match(packOutpost(s, sys, id) ?? "", /and the locker contents need 16 CU in diver hold; it has 15 free.*Nothing packed/);
  assert.equal(snapshot(s, sys), before);
  swimTo(s, SPOTS.b);
  assert.match(packPreview(s, sys, id).refusal ?? "", /Work at Outpost 1/);
});

test("ADVERSE: packing mid-decode, mid-growth with a full locker loses and duplicates nothing; the work travels and resumes", () => {
  const { s, sys } = opened();
  s.knowledge.blueprints.push("bp_outpost_standard" as never);
  const id = deployAt(s, sys, SPOTS.a, "outpost_kit_standard");
  const decoder = give(s, "mod_decoder"), planter = give(s, "mod_planter");
  installModule(s, sys, id, "s0", decoder);
  installModule(s, sys, id, "s1", planter);
  // A cell-powered outpost: the charged reserve cell in its locker runs the decoder.
  give(s, "reserve_cell", 1, outpostLockerId(id));
  give(s, "structural_alloy", 3, outpostLockerId(id));
  give(s, "meal", 24, outpostLockerId(id));
  assert.equal(usedCapacity(s, outpostLockerId(id)), OUTPOST_TIERS.standard.lockerCu, "the locker is genuinely full");
  give(s, "seed_ribbon_fan", 1);
  assert.equal(plant(s, sys, id, "s1", "seed_ribbon_fan"), null);
  discoverSite(sys, "reef_pumphouse_site");
  assert.equal(startDecode(s, sys, id, "reef_pumphouse_log"), null);
  play(s, sys, 100);
  assert.equal(sys.decodes[0]!.progress, 100);
  assert.equal(sys.planters[0]!.progress, 100);

  // The standard tier's anchors spend alloy and membrane; without membrane it refuses.
  let before = snapshot(s, sys);
  assert.match(packOutpost(s, sys, id) ?? "", /Bring 1 × Flexible membrane.*Nothing packed/);
  assert.equal(snapshot(s, sys), before);
  give(s, "flex_membrane", 1);
  // Not enough room: refused with the numbers, nothing changes.
  before = snapshot(s, sys);
  assert.match(packOutpost(s, sys, id) ?? "", /2 modules and the locker contents need 44 CU in diver hold; it has 16 free/);
  assert.equal(snapshot(s, sys), before);

  diverCapacity(s, 64);
  const totals = conservedTotals(s, sys);
  const p = packPreview(s, sys, id);
  assert.equal(p.refusal, null);
  assert.deepEqual(p.loss.lines.map((l) => [l.kind, l.quantity, l.from]), [["structural_alloy", 1, outpostLockerId(id)], ["flex_membrane", 1, "diver"]]);
  assert.deepEqual(p.locker.map((m) => [m.kind, m.quantity]).sort(), [["meal", 24], ["reserve_cell", 1], ["structural_alloy", 2]]);
  assert.deepEqual(p.work, [
    'Decode "Relay hut fragment" at 55% pauses and travels with its decoder module. It resumes when the module is socketed again.',
    "The ribbon fan crop at 23% stops growing while packed and carries on when the planter is socketed again.",
  ]);
  assert.equal(packOutpost(s, sys, id), null);
  assert.deepEqual(conservedTotals(s, sys), minus(totals, { structural_alloy: 1, flex_membrane: 1 }));
  // Every item is in exactly one place.
  const ids = s.inventory.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!sys.sockets.some((e) => ids.includes(e.itemId)));
  // The work is paused, not lost.
  play(s, sys, 50);
  assert.equal(sys.decodes[0]!.progress, 100);
  assert.equal(sys.planters[0]!.progress, 100);
  assert.equal(decodeViews(s, sys)[0]!.status, "not-installed");

  // Redeploy at a vent: thermal power, both modules refitted, work resumes.
  swimTo(s, SPOTS.c);
  assert.equal(deployOutpost(s, sys, id, SPOTS.c, siteTable({ ventDistance: 8 })), null);
  assert.equal(sys.outposts[0]!.power, "thermal");
  play(s, sys, 260);
  assert.deepEqual(sys.decoded, ["reef_pumphouse_log"]);
  play(s, sys, 240);
  diverCapacity(s, 80);
  assert.equal(harvest(s, sys, id, "s1", { to: "diver" }), null);
  assert.ok(s.inventory.items.some((i) => i.kind === "flex_membrane" && i.containerId === "diver" && i.quantity >= 3));
});

test("an outpost upgrades in place: more sockets and locker, modules kept; it then packs as the higher kit", () => {
  const { s, sys } = opened();
  diverCapacity(s, 40);
  const id = deployAt(s, sys, SPOTS.a);
  const charger = give(s, "mod_charger");
  installModule(s, sys, id, "s0", charger);
  assert.match(upgradePreview(s, sys, id).refusal ?? "", /standard field outpost plans/);
  s.knowledge.blueprints.push("bp_outpost_standard" as never);
  assert.match(upgradePreview(s, sys, id).refusal ?? "", /missing/);
  give(s, "structural_alloy", 4);
  give(s, "silica_glass", 2);
  give(s, "conductive_crust", 2, outpostLockerId(id));
  const ledgerBefore = ledger(s);
  assert.equal(upgradeOutpost(s, sys, id), null);
  assert.notDeepEqual(ledger(s), ledgerBefore);
  assert.equal(sys.outposts[0]!.tier, "standard");
  assert.equal(hostById(s, sys, id)!.sockets.length, 3);
  assert.equal(hostById(s, sys, id)!.sockets[0]!.occupant?.itemId, charger);
  assert.equal(s.inventory.containers.find((c) => c.id === outpostLockerId(id))!.capacity, OUTPOST_TIERS.standard.lockerCu);
  assert.match(upgradePreview(s, sys, id).refusal ?? "", /advanced field outpost plans/);
  give(s, "flex_membrane", 1);
  assert.equal(packOutpost(s, sys, id), null);
  assert.equal(s.inventory.items.find((i) => i.id === id)?.kind, "outpost_kit_standard");
});

test("a redeploy with a remembered module left behind lists it and still deploys", () => {
  const { s, sys } = opened();
  diverCapacity(s, 40);
  const id = deployAt(s, sys, SPOTS.a);
  const charger = give(s, "mod_charger");
  installModule(s, sys, id, "s0", charger);
  give(s, "structural_alloy", 1);
  packOutpost(s, sys, id);
  s.inventory.items.find((i) => i.id === charger)!.containerId = "pod_locker";
  swimTo(s, SPOTS.b);
  const p = deployPreview(s, sys, id, SPOTS.b, world);
  assert.deepEqual(p.missing, [{ socket: "s0", itemId: charger }]);
  assert.equal(deployOutpost(s, sys, id, SPOTS.b, world), null);
  assert.equal(hostById(s, sys, id)!.sockets[0]!.occupant, null);
  assert.match(s.feedback, /remembered module isn't in your hold/);
});

test("packed layouts are semantic: duplicates, foreign sockets and shared kit IDs are invalid, and a tampered refit is refused untouched", () => {
  const { s, sys } = opened();
  diverCapacity(s, 40);
  s.knowledge.blueprints.push("bp_outpost_standard" as never);
  const id = deployAt(s, sys, SPOTS.a, "outpost_kit_standard");
  const decoder = give(s, "mod_decoder");
  installModule(s, sys, id, "s0", decoder);
  give(s, "structural_alloy", 1);
  give(s, "flex_membrane", 1);
  assert.equal(packOutpost(s, sys, id), null);
  assert.ok(validSystems(sys));
  const layouts: [string, { socket: string; itemId: string }[]][] = [
    ["a module is listed twice", [{ socket: "s0", itemId: decoder }, { socket: "s1", itemId: decoder }]],
    ["a socket is listed twice", [{ socket: "s0", itemId: decoder }, { socket: "s0", itemId: "item_99" }]],
    ["a socket isn't on this tier", [{ socket: "s3", itemId: decoder }]],
    ["a socket isn't on this tier", [{ socket: "bridge", itemId: decoder }]],
  ];
  swimTo(s, SPOTS.b);
  for (const [why, layout] of layouts) {
    const imported = structuredClone(sys);
    imported.packed[0]!.layout = layout;
    assert.equal(validSystems(imported), false, why);
    const before = snapshot(s, imported);
    assert.equal(deployOutpost(s, imported, id, SPOTS.b, world), `This kit's remembered layout is inconsistent (${why}). Nothing deployed.`);
    assert.equal(snapshot(s, imported), before);
  }
  assert.equal(validSystems({ ...sys, outposts: [{ id, tier: "basic", name: "Twin", position: SPOTS.c, region: null, power: "cells" }] }), false, "a kit and an outpost share an ID");
  assert.equal(validSystems({ ...sys, sockets: [{ hostId: id, socket: "s0", itemId: "item_77", kind: "mod_relay" }] }), false, "a socket entry on a host that isn't deployed");
  assert.equal(validSystems({ ...sys, sockets: [{ hostId: "home_pod", socket: "s0", itemId: decoder, kind: "mod_decoder" }] }), false, "remembered while installed");
  assert.equal(validSystems({ ...sys, sockets: [{ hostId: "home_pod", socket: "s5", itemId: "item_77", kind: "mod_relay" }] }), false, "the pod has two sockets");
  // The valid layout refits exactly once.
  assert.equal(deployOutpost(s, sys, id, SPOTS.b, world), null);
  assert.equal(conservedTotals(s, sys).mod_decoder, 1);
  assert.ok(validSystems(sys));
});

test("installing a remembered module elsewhere drops it from the packed layout, so two places never claim it", () => {
  const { s, sys } = opened();
  diverCapacity(s, 40);
  const id = deployAt(s, sys, SPOTS.a);
  const decoder = give(s, "mod_decoder");
  installModule(s, sys, id, "s0", decoder);
  give(s, "structural_alloy", 1);
  packOutpost(s, sys, id);
  const other = deployAt(s, sys, SPOTS.c);
  assert.equal(installModule(s, sys, other, "s0", decoder), null);
  assert.deepEqual(sys.packed[0]!.layout, []);
  assert.ok(validSystems(sys));
  swimTo(s, SPOTS.b);
  assert.equal(deployOutpost(s, sys, id, SPOTS.b, world), null);
  assert.equal(conservedTotals(s, sys).mod_decoder, 1);
  assert.equal(hostById(s, sys, other)!.sockets[0]!.occupant?.itemId, decoder);
});
