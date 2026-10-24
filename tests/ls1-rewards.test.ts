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
import { installModule } from "../src/sim/systems/hosts.js";
import { deployOutpost, packOutpost } from "../src/sim/systems/outposts.js";
import { handheldPing } from "../src/sim/systems/survey.js";
import { SITE_CACHE_IDS, siteCacheOf } from "../src/sim/systems/siteCaches.js";
import { interactions } from "../src/sim/progression.js";
import { stepSystems } from "../src/sim/systemsLink.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameEvent, GameState } from "../src/sim/types.js";
import { KeypadPanel, keypadKey, keypadModel, renderKeypad } from "../src/ui/keypad.js";
import type { KeypadState } from "../src/ui/keypad.js";
import { give, opened, siteTable, SPOTS, swimTo } from "./systems-support.js";

const world = createWorldQueries();
const meta = { sessionId: "ls1-rewards-test-01", createdAt: "2026-10-24T00:00:00.000Z", savedAt: "2026-10-24T00:00:01.000Z" };
const reload = (s: GameState) => {
  const text = encodeSave(createEnvelope(s, meta));
  assert.ok(text.ok, text.ok ? "" : text.error);
  return decodeSave(text.value);
};
/** The receipts a reloadable fixture needs for what `opened()` and `give` hand over:
 * strict validation keeps equipment and modules to what was made. */
const made = (s: GameState, ...recipes: string[]) => { for (const r of recipes) if (!s.knowledge.crafted.includes(r as never)) s.knowledge.crafted.push(r as never); };
/** A deployed outpost at SPOTS.a: thermal (beside a vent) or cell-powered. */
function outpost(power: "thermal" | "cells"): { s: GameState; id: string } {
  const { s } = opened();
  made(s, "essential_tools", "outpost_kit_standard", "mod_locker", "mod_planter");
  const id = give(s, "outpost_kit_standard");
  swimTo(s, SPOTS.a);
  assert.equal(deployOutpost(s, s.systems, id, SPOTS.a, siteTable(power === "thermal" ? { ventDistance: 5 } : {})), null);
  assert.equal(s.systems.outposts[0]!.power, power);
  return { s, id };
}
const plans = (s: GameState, ...bps: string[]) => { for (const bp of bps) s.knowledge.blueprints.push(bp as never); };

test("locker extension: only the chosen locker module grows, through pack and reload; a stale capacity is refused", () => {
  const { s, id } = outpost("thermal");
  const a = give(s, "mod_locker"), b = give(s, "mod_locker");
  assert.equal(installModule(s, s.systems, id, "s0", a), null);
  assert.equal(installModule(s, s.systems, id, "s1", b), null);
  plans(s, "bp_locker_extension");
  give(s, "structural_alloy", 3); give(s, "buoyant_resin", 2);
  const r = upgradeHostModule(s, id, "s0", "locker_extension_1");
  assert.ok(r.ok, r.ok ? "" : r.message);
  const cap = (item: string) => s.inventory.containers.find((c) => c.id === `${item}_locker`)!.capacity;
  assert.equal(cap(a), 48, "32 CU × 1.5");
  assert.equal(cap(b), 32, "the other locker module is unchanged");
  give(s, "structural_alloy", 1); give(s, "flex_membrane", 1); // packing breaks the anchor seals
  assert.equal(packOutpost(s, s.systems, id), null);
  assert.equal(cap(a), 48, "the capacity travels with the module item");
  const back = reload(s);
  assert.ok(back.ok, back.ok ? "" : back.error);
  const stale = structuredClone(s);
  stale.inventory.containers.find((c) => c.id === `${a}_locker`)!.capacity = 32;
  assert.equal(reload(stale).ok, false, "validation recomputes the capacity from the upgrade");
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
  const { s } = opened();
  made(s, "essential_tools");
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
  const { s } = opened(), hatch = CODED_DOORS["island.cold_store_hatch"];
  made(s, "essential_tools");
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
    const log: string[] = [], seam = { dispatch: () => { log.push("dispatch"); return { feedback: "The keypad blinks red." }; },
      close: () => log.push("close"), render: () => log.push("render"), focusField: () => log.push("focus") };
    const panel = new KeypadPanel(seam);
    panel.open(s, "basin.vault_door");
    assert.deepEqual(log, ["render", "focus"], "opening renders and focuses the code field");
    for (const k of ["F5", "e", "1"]) assert.ok(panel.key(s, k), `${k} is the keypad's while it is open`);
    panel.key(s, "Enter");
    assert.ok(log.includes("dispatch"));
    panel.key(s, "Escape");
    assert.equal(log.at(-1), "close");
    assert.equal(panel.key(s, "e"), false, "closed: keys go back to the game");
  } finally { vault.placed = false; }
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
