/** LS-1 stage 1b: the reward contracts (docs/build/streams/LS-1.md): the locker
 * extension, the heated grow bed with its heater, the ping lens, kiln tubers, the
 * lost sites' caches, and coded doors with their keypad. */
import test from "node:test";
import assert from "node:assert/strict";
import { CODED_DOORS } from "../src/content/systems/decodes.js";
import { LOST_SITE_CACHES, siteCacheContainerId } from "../src/content/systems/lostSites.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { upgradeHostModule } from "../src/sim/hostUpgrades.js";
import { addItem } from "../src/sim/inventory.js";
import { executeCommand } from "../src/sim/step.js";
import { growthRate, harvestQuantity, plant } from "../src/sim/systems/cultivation.js";
import { enterCode } from "../src/sim/systems/doors.js";
import { carrierHostId, installModule } from "../src/sim/systems/hosts.js";
import { fixtureGame } from "../src/sim/carrier.js";
import { deployOutpost, packOutpost } from "../src/sim/systems/outposts.js";
import { handheldPing } from "../src/sim/systems/survey.js";
import { SITE_CACHE_IDS, siteCacheCandidates, siteCacheOf, useSiteCacheTable } from "../src/sim/systems/siteCaches.js";
import { countWork } from "../src/sim/workCounts.js";
import { interactions } from "../src/sim/progression.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameCommand, GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { PanelProbe } from "../src/ui/panelProbe.js";
import { buildJournal } from "../src/sim/systems/journal.js";
import { stepSystems, systemsContext } from "../src/sim/systemsLink.js";
import { KeypadPanel, keypadKey, keypadModel, renderKeypad } from "../src/ui/keypad.js";
import type { KeypadSeam, KeypadState } from "../src/ui/keypad.js";
import { give, opened, siteTable, SPOTS, swimTo } from "./systems-support.js";
import { at, fund } from "./b1-support.js";
import { kitId, LEDGE, run, systemsGame } from "./c4-systems-support.js";
import { readyState } from "./targeting-support.js";
import { TECH_RECORDS } from "../src/content/registry.js";
import type { RecipeId } from "../src/content/registry.js";

const world = createWorldQueries();
const meta = { sessionId: "ls1-rewards-test-01", createdAt: "2026-10-24T00:00:00.000Z", savedAt: "2026-10-24T00:00:01.000Z" };
/** Save and load again; strict validation refuses an invalid state at either end. */
const reload = (s: GameState) => {
  const text = encodeSave(createEnvelope(s, meta));
  return text.ok ? decodeSave(text.value) : text;
};
/** A deployed outpost at SPOTS.a: thermal (beside a vent) or cell-powered. */
function outpost(power: "thermal" | "cells"): { s: GameState; id: string } {
  const { s } = opened();
  const id = give(s, "outpost_kit_standard");
  swimTo(s, SPOTS.a);
  assert.equal(deployOutpost(s, s.systems, id, SPOTS.a, siteTable(power === "thermal" ? { ventDistance: 5 } : {})), null);
  assert.equal(s.systems.outposts[0]!.power, power);
  return { s, id };
}
const plans = (s: GameState, ...bps: string[]) => { for (const bp of bps) s.knowledge.blueprints.push(bp as never); };

test("locker extension: only the chosen locker module grows, through pack and reload; a stale capacity is refused", () => {
  // An earned fixture, so the reload is strict: the workshop's records read and two
  // locker modules made at the pod bench. The plan's source (the tide store) is not
  // in the world yet, so the workshop's outpost sheet carries it for this test.
  const sheet = TECH_RECORDS.workshop_outpost_sheet.blueprints as unknown as string[];
  sheet.push("bp_locker_extension");
  try {
    let s = systemsGame();
    // Stow the hold in the pod locker before each make, as a player would; the kit stays.
    const stow = () => { for (const i of s.inventory.items.filter((i) => i.containerId === "diver" && i.kind !== "outpost_kit_basic" && i.kind !== "mod_locker")) i.containerId = "pod_locker"; };
    for (const k of ["mod_locker", "mod_locker"] as RecipeId[]) { stow(); fund(s, k); }
    const kit = kitId(s), [a, b] = s.inventory.items.filter((i) => i.kind === "mod_locker").map((i) => i.id) as [string, string];
    at(s, { ...LEDGE, y: LEDGE.y + 0.6 }, "swimming");
    s = run(s, { type: "deploy-outpost", itemId: kit, name: "West ledge" }).state;
    for (const [k, q] of [["structural_alloy", 3], ["silica_glass", 2], ["conductive_crust", 2]] as const) addItem(s, k, q, "diver");
    s = run(s, { type: "upgrade-outpost", outpostId: kit }).state;
    s = run(s, { type: "install-host-module", hostId: kit, socket: "s0", itemId: a }).state;
    s = run(s, { type: "install-host-module", hostId: kit, socket: "s1", itemId: b }).state;
    give(s, "structural_alloy", 3); give(s, "buoyant_resin", 2);
    const r = upgradeHostModule(s, kit, "s0", "locker_extension_1");
    assert.ok(r.ok, r.ok ? "" : r.message);
    const cap = (item: string) => s.inventory.containers.find((c) => c.id === `${item}_locker`)!.capacity;
    assert.equal(cap(a), 48, "32 CU × 1.5");
    assert.equal(cap(b), 32, "the other locker module is unchanged");
    give(s, "structural_alloy", 1); give(s, "flex_membrane", 1); // packing breaks the anchor seals
    assert.equal(packOutpost(s, s.systems, kit), null);
    assert.equal(cap(a), 48, "the capacity travels with the module item");
    const back = reload(s);
    assert.ok(back.ok, back.ok ? "" : back.error);
    const stale = structuredClone(s);
    stale.inventory.containers.find((c) => c.id === `${a}_locker`)!.capacity = 32;
    assert.equal(reload(stale).ok, false, "validation recomputes the capacity from the upgrade");
  } finally { sheet.pop(); }
});

test("heated grow bed: twice as fast and one more produce for food on a powered host; nothing for power crops; the heater draws power", () => {
  const { s, id } = outpost("cells");
  const planter = give(s, "mod_planter");
  assert.equal(installModule(s, s.systems, id, "s0", planter), null);
  plans(s, "bp_heated_grow_bed");
  give(s, "thermal_core", 1); give(s, "silica_glass", 2); give(s, "conductive_crust", 2); give(s, "flex_membrane", 1);
  const r = upgradeHostModule(s, id, "s0", "grow_bed_1");
  assert.ok(r.ok, r.ok ? "" : r.message);
  give(s, "seed_staple_cup", 1);
  assert.equal(plant(s, s.systems, id, "s0", "seed_staple_cup"), null);
  const crop = s.systems.planters[0]!;
  assert.equal(growthRate(s, s.systems, crop), 1, "a cell outpost without a charged cell: no acceleration");
  assert.equal(harvestQuantity(s.systems, planter, "seed_staple_cup"), 3, "the extra produce is per harvest, powered or not");
  const cell = give(s, "reserve_cell", 1, `${id}_locker`);
  assert.equal(growthRate(s, s.systems, crop), 2, "powered: twice as fast");
  assert.equal(harvestQuantity(s.systems, planter, "seed_staple_cup"), 3, "staple cups 2 → 3");
  assert.equal(harvestQuantity(s.systems, planter, "seed_lumen_bulb"), 1, "power crops gain no yield");
  assert.equal(growthRate(s, s.systems, { ...crop, seed: "seed_lumen_bulb" }), 1, "power crops gain no speed");
  // The heater is a powered module: the host drain bills it.
  const charge = () => s.inventory.items.find((i) => i.id === cell)!.charge!;
  const before = charge(), events: GameEvent[] = [];
  for (let n = 0; n < 600; n++) stepSystems(s, events);
  assert.ok(charge() < before, "the bed's heater drains the outpost's cell");
});

test("Base offers each new module upgrade through the shared authority, shows it fitted, and the crop row says what the bed does", () => {
  const probe = new PanelProbe(world), run = (s: GameState, c: GameCommand) => {
    const out = executeCommand(s, c, world);
    assert.ok(!out.events.some((e) => e.type === "notice" && e.error), JSON.stringify(out.events));
    return out.state;
  };
  // A planter: the grow bed's offer is a live Fit command, the fitted bed is named.
  const o = outpost("cells"), id = o.id;
  let s = o.s;
  const planter = give(s, "mod_planter"), locker = give(s, "mod_locker");
  assert.equal(installModule(s, s.systems, id, "s0", planter), null);
  assert.equal(installModule(s, s.systems, id, "s1", locker), null);
  plans(s, "bp_heated_grow_bed", "bp_locker_extension");
  give(s, "thermal_core", 1); give(s, "silica_glass", 2); give(s, "conductive_crust", 2); give(s, "flex_membrane", 1);
  give(s, "structural_alloy", 3); give(s, "buoyant_resin", 2);
  const fits = probe.buttons("systems", s).filter((b) => b.command.type === "upgrade-host-module");
  assert.deepEqual(fits.map((b) => [b.label, b.disabled, (b.command as { socket: string }).socket]),
    [["Fit Heated grow bed", false, "s0"], ["Fit Locker extension", false, "s1"]], "both offers, payable, from the shared authority");
  s = run(s, probe.press("systems", s, /^Fit Heated grow bed/));
  s = run(s, probe.press("systems", s, /^Fit Locker extension/));
  const text = probe.text("systems", s);
  assert.ok(text.includes("Heated grow bed") && text.includes("Locker extension"), "the fitted upgrades are named");
  assert.ok(!probe.buttons("systems", s).some((b) => b.command.type === "upgrade-host-module"), "nothing more to fit");
  // The crop row and the planting feedback quote the bed's own answers.
  give(s, "seed_staple_cup", 1);
  s = run(s, { type: "plant", hostId: id, socket: "s0", seed: "seed_staple_cup" });
  assert.match(s.feedback, /ready in about 6 min of play · 3 per harvest/, "no power yet: the base time, the bed's yield");
  assert.match(probe.text("systems", s), /Staple cups · 0% · about 6 min left · 3 × [^·]+ per harvest · heated grow bed: needs host power to speed growth/);
  give(s, "reserve_cell", 1, `${id}_locker`);
  assert.match(probe.text("systems", s), /Staple cups · 0% · about 3 min left · 3 × [^·]+ per harvest · heated grow bed: twice as fast/);
  // A power crop: the bed does nothing, and says so; the feedback quotes the base time.
  s.systems.planters = [];
  give(s, "seed_lumen_bulb", 1);
  s = run(s, { type: "plant", hostId: id, socket: "s0", seed: "seed_lumen_bulb" });
  assert.match(s.feedback, /ready in about 10 min of play · 1 per harvest/);
  assert.match(probe.text("systems", s), /Lumen bulb · 0% · about 10 min left · 1 × [^·]+ per harvest · heated grow bed: no effect on power crops/);
  const journal = buildJournal(s, s.systems, { decoder: systemsContext(s) });
  assert.ok(JSON.stringify(journal).includes("Heated grow bed: no effect on power crops"), "the journal says the same");
});

test("fixed-step work stays bounded: cache discovery looks up the diver's chart cell only; growth asks one power answer per host, with the same outcomes", () => {
  // Caches: candidates only where a cache's reach is; every point within reach (a cell
  // border included) has it as a candidate.
  assert.deepEqual(siteCacheCandidates({ x: 0, y: 0, z: 0 }), [], "home waters: no candidate");
  for (const id of SITE_CACHE_IDS) {
    const c = LOST_SITE_CACHES[id].position;
    for (const [dx, dz] of [[0, 0], [3.9, 0], [-3.9, 0], [0, 3.9], [0, -3.9], [2.7, 2.7], [-2.7, -2.7]] as const)
      assert.ok(siteCacheCandidates({ x: c.x + dx, y: c.y, z: c.z + dz }).includes(id), `${id} at ${dx},${dz}`);
  }
  // Growth: the step's per-host answer gives the same progress as the per-crop view, through a
  // cell draining to empty (the bed's speed stops with the power).
  const { s, id } = outpost("cells");
  const planter = give(s, "mod_planter");
  assert.equal(installModule(s, s.systems, id, "s0", planter), null);
  s.systems.moduleUpgrades[planter] = "grow_bed_1";
  give(s, "seed_staple_cup", 1);
  assert.equal(plant(s, s.systems, id, "s0", "seed_staple_cup"), null);
  const cell = give(s, "reserve_cell", 1, `${id}_locker`);
  s.inventory.items.find((i) => i.id === cell)!.charge = 0.05;
  // Each step's growth reads power after that step's drain, as the per-crop view did.
  let fast = 0;
  for (let n = 0; n < 240; n++) {
    const before = s.systems.planters[0]!.progress;
    stepSystems(s, []);
    const powered = (s.inventory.items.find((i) => i.id === cell)!.charge ?? 0) > 0;
    assert.ok(Math.abs(s.systems.planters[0]!.progress - before - (powered ? 2 : 1) / 60) < 1e-9, `step ${n}`);
    assert.equal(growthRate(s, s.systems, s.systems.planters[0]!), powered ? 2 : 1, `the view agrees at step ${n}`);
    if (powered) fast++;
  }
  assert.ok(fast > 0 && fast < 240, `twice as fast until the cell ran dry (${fast} steps)`);
  assert.equal(s.inventory.items.find((i) => i.id === cell)!.charge, 0, "the heater drained it");
});

test("R2: planting on a carrier quotes the composed host power: the reserve, above it, and across depletion", () => {
  const plantAt = (charge: number): { s: GameState; planter: string; hostId: string; socket: string } => {
    const s = fixtureGame(), h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!;
    s.player.interiorId = h.id; s.player.controlledVehicleId = null;
    const hostId = carrierHostId(h.id), socket = "hl.socket.galley.wall", planter = give(s, "mod_planter");
    assert.equal(installModule(s, s.systems, hostId, socket, planter), null);
    s.systems.moduleUpgrades[planter] = "grow_bed_1";
    h.charge = charge;
    give(s, "seed_staple_cup", 1);
    const out = executeCommand(s, { type: "plant", hostId, socket, seed: "seed_staple_cup" }, world);
    assert.ok(!out.events.some((e) => e.type === "notice" && e.error), JSON.stringify(out.events));
    return { s: out.state, planter, hostId, socket };
  };
  for (const charge of [20, 10]) {
    const { s } = plantAt(charge);
    assert.match(s.feedback, /ready in about 6 min of play · 3 per harvest\.$/, `at ${charge}%: the carrier keeps its reserve, so the base time`);
  }
  const { s } = plantAt(25);
  assert.match(s.feedback, /ready in about 3 min of play \(heated grow bed, while the host has power\) · 3 per harvest\./, "above the reserve");
  // Across depletion: the step's growth, the Base row and a fresh planting all agree.
  s.scenario = "expedition";
  const h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!, probe = new PanelProbe(world);
  h.charge = 20.001;
  let fast = 0;
  for (let n = 0; n < 600 && h.charge > 20; n++) {
    const before = s.systems.planters[0]!.progress;
    stepSystems(s, []);
    if (s.systems.planters[0]!.progress - before > 1.5 / 60) fast++;
  }
  assert.ok(fast > 0 && h.charge <= 20, `fast while above the reserve (${fast} steps), then at the reserve`);
  const before = s.systems.planters[0]!.progress;
  stepSystems(s, []);
  assert.ok(Math.abs(s.systems.planters[0]!.progress - before - 1 / 60) < 1e-9, "at the reserve: the base rate");
  assert.match(probe.text("systems", s), /heated grow bed: needs host power to speed growth/);
});

test("R3 F4: through stepSystems, the work actually done stays constant as caches and crops grow", () => {
  // Caches: 1, 10 and 100 laid 100 m apart, each point counting every read of its
  // coordinates, so a linear lookup or a full scan shows even when it returns the same
  // candidates. The counted operations are the per-cache distance test and the reads.
  type Work = [checks: number, reads: number];
  const cacheWork = (n: number, at: Vec3): Work => {
    let reads = 0;
    const points: Record<string, Vec3> = {};
    for (let i = 0; i < n; i++) {
      const x = 100 * (i % 10) + 25, y = -20, z = 100 * Math.floor(i / 10) + 25;
      points[`c${i}`] = { get x() { reads++; return x; }, get y() { reads++; return y; }, get z() { reads++; return z; } };
    }
    useSiteCacheTable(points);
    try {
      const s = readyState();
      swimTo(s, at);
      reads = 0;
      const counts = countWork(true)!;
      stepSystems(s, []);
      assert.ok(!s.inventory.containers.some((c) => siteCacheOf(c.id) || c.id.startsWith("site_cache_c")), "out of reach: nothing found");
      return [counts.cacheDistanceChecks, reads];
    } finally { countWork(false); useSiteCacheTable(null); }
  };
  const near = { x: 30, y: -20, z: 25 }, away = { x: -500, y: -20, z: -500 };
  assert.deepEqual([1, 10, 100].map((n) => cacheWork(n, near)), [[1, 3], [1, 3], [1, 3]], "5 m from one cache: one distance test, one point read, at any count");
  assert.deepEqual([1, 10, 100].map((n) => cacheWork(n, away)), [[0, 0], [0, 0], [0, 0]], "far from every cache: none");
  // Crops: 1 and 20 grow-bed crops on one thermal host, and on three hosts. The counted
  // operation is SYS-1's host power evaluation, reached through the step's growth.
  const powerWork = (crops: number, hosts: number): number => {
    const s = readyState(), sys = s.systems;
    for (let k = 0; k < hosts; k++) {
      const hostId = `outpost_h${k}`;
      sys.outposts.push({ id: hostId, tier: "basic", name: `H${k}`, position: { x: 10 * k, y: -8, z: 0 }, region: null, power: "thermal" });
      for (let c = 0; c < crops; c++) {
        const itemId = `${hostId}_planter_${c}`;
        sys.sockets.push({ hostId, socket: `s${c}`, kind: "mod_planter", itemId });
        sys.moduleUpgrades[itemId] = "grow_bed_1";
        sys.planters.push({ moduleId: itemId, seed: "seed_staple_cup", progress: 0 });
      }
    }
    try {
      const counts = countWork(true)!;
      stepSystems(s, []);
      assert.ok(sys.planters.every((p) => Math.abs(p.progress - 2 / 60) < 1e-9), "every bed crop grew at the bed's rate");
      return counts.hostPowerEvaluations;
    } finally { countWork(false); }
  };
  assert.deepEqual([powerWork(1, 1), powerWork(20, 1), powerWork(1, 3), powerWork(20, 3)], [1, 1, 3, 3], "one evaluation per host, not per crop");
});
test("kiln tubers need warmth: refused in a plain planter on a cell outpost, grown in a grow bed or on a thermal outpost", () => {
  const cells = outpost("cells");
  const p = give(cells.s, "mod_planter");
  installModule(cells.s, cells.s.systems, cells.id, "s0", p);
  give(cells.s, "seed_kiln_tuber", 1);
  assert.match(plant(cells.s, cells.s.systems, cells.id, "s0", "seed_kiln_tuber") ?? "", /needs warmth/);
  const thermal = outpost("thermal");
  const q = give(thermal.s, "mod_planter");
  installModule(thermal.s, thermal.s.systems, thermal.id, "s0", q);
  give(thermal.s, "seed_kiln_tuber", 1);
  assert.equal(plant(thermal.s, thermal.s.systems, thermal.id, "s0", "seed_kiln_tuber"), null);
  assert.equal(harvestQuantity(thermal.s.systems, q, "seed_kiln_tuber"), 3);
});

test("ping lens: the handheld ping reaches 60 m once crafted", () => {
  const { s } = opened();
  assert.equal(handheldPing(s).range, 35);
  s.knowledge.crafted.push("ping_lens_1" as never);
  assert.equal(handheldPing(s).range, 60);
});

test("site caches: found on first reach, full, never a reserve cell; take-only; taken stays taken across reload; nothing refills", () => {
  const s = readyState();
  assert.ok(!s.inventory.containers.some((c) => siteCacheOf(c.id)), "New Game holds no cache, so every item is the player's");
  assert.ok(interactions(s).some((x) => x.id === siteCacheContainerId("canopy_basket_bins")), "an unfound cache is still a place to go");
  for (const id of SITE_CACHE_IDS) {
    swimTo(s, LOST_SITE_CACHES[id].position);
    const events: GameEvent[] = [];
    stepSystems(s, events);
    assert.ok(events.some((e) => e.type === "systems" && e.event.type === "cache-found" && e.event.cache === id), `${id}: found on reach`);
    assert.ok(events.some((e) => e.type === "notice" && e.message.startsWith(`Found · ${LOST_SITE_CACHES[id].label}`)), `${id}: a notice says so`);
    const inside = s.inventory.items.filter((i) => i.containerId === siteCacheContainerId(id));
    for (const [kind, n] of Object.entries(LOST_SITE_CACHES[id].contents))
      assert.equal(inside.filter((i) => i.kind === kind).reduce((t, i) => t + i.quantity, 0), n, `${id}: ${kind}`);
    assert.ok(!inside.some((i) => (i.kind as string) === "reserve_cell"), `${id} never holds a reserve cell`);
    assert.ok(!inside.some((i) => ["pressure_ceramic", "thermal_core", "brine_lattice", "tagged_frame"].includes(i.kind)), `${id}: no frontier material`);
    const again: GameEvent[] = [];
    stepSystems(s, again);
    assert.ok(!again.some((e) => e.type === "systems" && e.event.type === "cache-found"), `${id}: found once`);
  }
  const fresh = reload(s);
  assert.ok(fresh.ok, fresh.ok ? "" : fresh.error);
  // Take the basket bins' resin at the site; nothing goes back in.
  const bins = siteCacheContainerId("canopy_basket_bins"), resin = s.inventory.items.find((i) => i.containerId === bins && i.kind === "buoyant_resin")!;
  swimTo(s, LOST_SITE_CACHES.canopy_basket_bins.position);
  const moved = executeCommand(s, { type: "transfer", itemId: resin.id, to: "diver", quantity: resin.quantity }, world);
  assert.ok(!moved.events.some((e) => e.type === "notice" && e.error), JSON.stringify(moved.events));
  const back = executeCommand(moved.state, { type: "transfer", itemId: resin.id, to: bins, quantity: 1 }, world);
  assert.ok(back.events.some((e) => e.type === "notice" && e.error && /only gives/.test(e.message)), "take-only");
  const after = reload(moved.state);
  assert.ok(after.ok, after.ok ? "" : after.error);
  const left = after.value.state.inventory.items.filter((i) => i.containerId === bins);
  assert.ok(!left.some((i) => i.kind === "buoyant_resin"), "taken stays taken");
  assert.equal(after.value.state.inventory.items.filter((i) => i.kind === "buoyant_resin").reduce((t, i) => t + i.quantity, 0), 6, "no duplicate");
  // Emptied, the cache stays found: its container remains and nothing refills on reach.
  const crust = after.value.state.inventory.items.find((i) => i.containerId === bins)!;
  const emptied = executeCommand(after.value.state, { type: "transfer", itemId: crust.id, to: "diver", quantity: crust.quantity }, world).state;
  assert.ok(emptied.inventory.containers.some((c) => c.id === bins) && !emptied.inventory.items.some((i) => i.containerId === bins));
  const later: GameEvent[] = [];
  stepSystems(emptied, later);
  assert.ok(!emptied.inventory.items.some((i) => i.containerId === bins), "nothing refills");
  assert.ok(!interactions(emptied).some((x) => x.id === bins), "an emptied cache is no longer a target");
  assert.ok(reload(emptied).ok);
  // Strict validation: a found cache keeps its authored capacity and never holds more, or other kinds, than authored.
  const swollen = structuredClone(moved.state);
  swollen.inventory.items.find((i) => i.containerId === bins && i.kind === "conductive_crust")!.quantity = 5;
  assert.equal(reload(swollen).ok, false, "never more than authored");
  const resized = structuredClone(moved.state);
  resized.inventory.containers.find((c) => c.id === bins)!.capacity += 1;
  assert.equal(reload(resized).ok, false, "its authored capacity");
});

test("coded doors: an unplaced door takes no code; a wrong code costs nothing; the right one opens it for good", () => {
  const s = readyState(), hatch = CODED_DOORS["island.cold_store_hatch"];
  assert.equal(enterCode(s, "island.cold_store_hatch", "4417").ok, false, "not in the world yet");
  hatch.placed = true; hatch.position = { x: -230, y: 24, z: 3 };
  try {
    swimTo(s, { x: -200, y: 24, z: 3 });
    assert.match((enterCode(s, "island.cold_store_hatch", "4417") as { message: string }).message, /Move to the cold store hatch's keypad/);
    swimTo(s, { x: -231, y: 24, z: 3 });
    const wrong = enterCode(s, "island.cold_store_hatch", "1234");
    assert.deepEqual([wrong.ok, wrong.ok && wrong.outcome], [true, "wrong"]);
    assert.deepEqual(s.systems.opened, [], "no penalty, no lockout");
    const right = executeCommand(s, { type: "enter-code", door: "island.cold_store_hatch", code: "4-4-1-7" }, world);
    assert.ok(!right.events.some((e) => e.type === "notice" && e.error));
    assert.deepEqual(right.state.systems.opened, ["island.cold_store_hatch"], "dashes are how people write it down");
    const again = enterCode(right.state, "island.cold_store_hatch", "4417");
    assert.deepEqual([again.ok, again.ok && again.outcome], [true, "already-open"]);
    const back = reload(right.state);
    assert.ok(back.ok, back.ok ? "" : back.error);
    assert.deepEqual(back.value.state.systems.opened, ["island.cold_store_hatch"], "an open door stays open");
    const bad = structuredClone(right.state); bad.systems.opened = ["island.cold_store_hatch", "island.cold_store_hatch"];
    assert.equal(reload(bad).ok, false, "each door once");
    const unknown = structuredClone(right.state); unknown.systems.opened = ["island.no_such_door" as never];
    assert.equal(reload(unknown).ok, false, "known door IDs only");
  } finally { hatch.placed = false; delete hatch.position; }
});

test("keypad: typed digits edit, Enter submits, Escape closes; F5 and action keys are consumed; a deduction door shows its stencil and the journal's part", () => {
  let st: KeypadState = { door: "basin.vault_door", text: "" };
  for (const k of ["2", "0", "9", "x", "3"]) st = keypadKey(st, k).state;
  assert.equal(st.text, "2093", "only typed digits");
  assert.equal(keypadKey(st, "Backspace").state.text, "209");
  for (const k of ["F5", "e", "E", "q", "j", "k", "w", "ArrowUp", " "]) {
    const r = keypadKey(st, k);
    assert.equal(r.action, "consumed", k); assert.equal(r.command, undefined, k); assert.equal(r.state, st, k);
  }
  assert.equal(keypadKey(st, "Tab").action, "focus", "Tab stays inside the panel");
  assert.deepEqual(keypadKey(st, "Enter").command, { type: "enter-code", door: "basin.vault_door", code: "2093" });
  assert.equal(keypadKey(st, "Escape").action, "cancel");
  const { s } = opened(), vault = CODED_DOORS["basin.vault_door"];
  s.systems.found.push("divide_mixing_log"); s.systems.decoded.push("divide_mixing_log");
  vault.placed = true;
  try {
    const m = keypadModel(s, "basin.vault_door"), html = renderKeypad(m, { door: "basin.vault_door", text: "" });
    assert.ok(html.includes('aria-label="Door code, Ridge vault door"') && html.includes('<label for="keypad-code">'), "a labelled field");
    assert.ok(html.includes("2 0 · ·") && html.includes("9-3"), "the stencil and the journal's part");
    assert.ok(!html.includes("2093") && !html.includes("2-0-9-3"), "the full code is deduced, never shown");
    // Cancelling never dispatches: Escape closes the keypad only.
    const log: string[] = [], seam = { dispatch: () => { log.push("dispatch"); return { state: s, feedback: null }; },
      close: () => log.push("close"), render: () => log.push("render"), focusField: () => log.push("focus") };
    const panel = new KeypadPanel(seam);
    panel.open(s, "basin.vault_door");
    assert.deepEqual(log, ["render", "focus"], "opening renders and focuses the code field");
    for (const k of ["F5", "e", "1"]) assert.ok(panel.key(s, k).handled, `${k} is the keypad's while it is open`);
    assert.deepEqual(panel.key(s, "Escape"), { handled: true, outcome: null });
    assert.ok(!log.includes("dispatch") && log.at(-1) === "close", "cancel closes without a command");
    assert.deepEqual(panel.key(s, "e"), { handled: false }, "closed: keys go back to the game");
  } finally { vault.placed = false; }
});

test("keypad through the real step: a wrong code keeps it open with the step's feedback; the right one opens the door, closes and resets it", () => {
  const hatch = CODED_DOORS["island.cold_store_hatch"];
  hatch.placed = true; hatch.position = { x: -230, y: -10, z: 3 };
  try {
    let state = readyState();
    swimTo(state, { x: -231, y: -10, z: 3 });
    const html: string[] = [], log: string[] = [];
    const seam: KeypadSeam = {
      // The app's transaction: the step replaces the state; the keypad gets the committed one back.
      dispatch: (c) => {
        const out = executeCommand(state, c, world);
        state = out.state;
        const refused = out.events.find((e) => e.type === "notice" && e.error);
        return { state, feedback: refused && "message" in refused ? refused.message : state.feedback };
      },
      close: () => log.push("close"), render: (h) => html.push(h), focusField: () => log.push("focus"),
    };
    const panel = new KeypadPanel(seam), type = (code: string) => { for (const k of code) panel.key(state, k); };
    panel.open(state, "island.cold_store_hatch");
    type("1234");
    const before = state;
    assert.deepEqual(panel.key(state, "Enter"), { handled: true, outcome: "not-open" });
    assert.notEqual(state, before, "the step committed a new state");
    assert.deepEqual(state.systems.opened, [], "a wrong code opens nothing");
    assert.equal(panel.door, "island.cold_store_hatch", "it stays open");
    assert.ok(html.at(-1)!.includes("keypad-feedback") && !html.at(-1)!.includes("disabled"), "the step's feedback, the field still live");
    assert.ok(!log.includes("close"));
    type("4417");
    assert.deepEqual(panel.key(state, "Enter"), { handled: true, outcome: "opened" });
    assert.deepEqual(state.systems.opened, ["island.cold_store_hatch"], "the committed state has the door open");
    assert.equal(log.at(-1), "close", "an opened door closes the keypad");
    assert.equal(panel.door, null, "and resets it");
    // Opening it again at an open door: closes as already open, no change.
    panel.open(state, "island.cold_store_hatch");
    type("4417");
    assert.deepEqual(panel.key(state, "Enter"), { handled: true, outcome: "already-open" });
    assert.equal(panel.door, null);
  } finally { hatch.placed = false; delete hatch.position; }
});

test("the bed's power-crop exception holds per hour too: a lumen bulb's output is the same with and without a bed", () => {
  const { s, id } = outpost("thermal");
  const planter = give(s, "mod_planter");
  installModule(s, s.systems, id, "s0", planter);
  addItem(s, "seed_lumen_bulb", 1, "diver");
  plant(s, s.systems, id, "s0", "seed_lumen_bulb");
  const crop = s.systems.planters[0]!, plain = [growthRate(s, s.systems, crop), harvestQuantity(s.systems, planter, crop.seed)];
  s.systems.moduleUpgrades[planter] = "grow_bed_1";
  assert.deepEqual([growthRate(s, s.systems, crop), harvestQuantity(s.systems, planter, crop.seed)], plain);
});
