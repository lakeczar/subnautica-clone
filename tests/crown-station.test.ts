/** HUB-2: the crown station composed into C4's stops, hosts, rest bases and
 * recipes, pinned through the paths a player uses (Fabricate, Cargo and Base
 * through `PanelProbe`, commands through `executeCommand`), and Sol R1's
 * W2-02, W2-03 and W2-04 as regressions. */
import test from "node:test";
import assert from "node:assert/strict";
import { CROWN_FACILITIES, CROWN_RESTORATIONS, CROWN_STATION } from "../src/content/hub/crownStation.js";
import { RECIPES, type ItemKind, type RecipeId } from "../src/content/registry.js";
import { REST_BASES } from "../src/content/bases.js";
import { WORKING_STOPS } from "../src/content/stops.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import { bunkHealRate, crownStage } from "../src/sim/hub/crownStation.js";
import { addItem, containerAccessible, facility, supportedServiceSite } from "../src/sim/inventory.js";
import { crownBenchRecipe, recipeSites } from "../src/sim/progression.js";
import { incapacitate } from "../src/sim/recovery.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import type { GameCommand, GameState } from "../src/sim/types.js";
import { gameWorld } from "../src/sim/world.js";
import { PanelProbe, type PanelButton } from "../src/ui/panelProbe.js";
import { at, creelFirst, creelOf, meta, parkCreel, pilotCreel } from "./b1-support.js";

const world = gameWorld(), probe = new PanelProbe(world);
const STAGES = Object.keys(CROWN_RESTORATIONS) as (keyof typeof CROWN_RESTORATIONS)[];

function roundTrip(s: GameState): GameState {
  assert.ok(validState(s), "valid before saving");
  const e = encodeSave(createEnvelope(s, meta)); assert.ok(e.ok, e.ok ? "" : e.error);
  const d = decodeSave(e.value); assert.ok(d.ok, d.ok ? "" : d.error);
  assert.deepEqual(d.value.state, JSON.parse(JSON.stringify(s)));
  return d.value.state;
}
const run = (s: GameState, c: GameCommand): GameState => {
  const out = executeCommand(s, c, world), no = out.events.find((e) => e.type === "notice" && e.error);
  assert.equal(no && "message" in no ? no.message : null, null, `${c.type} refused`);
  return out.state;
};
const refused = (s: GameState, c: GameCommand): string => {
  const out = executeCommand(s, c, world), no = out.events.find((e) => e.type === "notice" && e.error);
  assert.ok(no && "message" in no, `${c.type} was accepted`);
  assert.equal(out.state, s, "a refusal leaves the state untouched");
  return (no as { message: string }).message;
};
/** Creel-first fixture (B1's paid rule staging), the diver at the crown's door
 * with an empty hold, plans for every stage known. */
function atCrown(): GameState {
  const s = creelFirst();
  for (const i of s.inventory.items.filter((i) => i.containerId === "diver")) i.containerId = "pod_locker";
  for (const bp of ["bp_canopy_reinforcement", "bp_rift_pressure"] as const) if (!s.knowledge.blueprints.includes(bp)) s.knowledge.blueprints.push(bp);
  at(s, { ...CROWN_STATION.work }, "swimming");
  return s;
}
/** The 450 m suit refit as paid (rule staging): the fitted suit and the record agree. */
function suit450(s: GameState): void {
  s.inventory.items.find((i) => i.fitted === "suit")!.kind = "suit_450";
  s.knowledge.crafted.push("suit_450");
}
const fundDiver = (s: GameState, id: RecipeId): void => {
  for (const [k, q] of Object.entries(RECIPES[id].cost)) addItem(s, k as ItemKind, q!, "diver");
};
const totals = (s: GameState): Record<string, number> => {
  const t: Record<string, number> = {};
  for (const i of s.inventory.items) t[i.kind] = (t[i.kind] ?? 0) + i.quantity;
  return t;
};
/** The Fabricate panel's button for one recipe (buttons read as their verb). */
const craftButton = (s: GameState, id: RecipeId): PanelButton | undefined =>
  probe.buttons("craft", s).find((b) => b.command.type === "craft" && b.command.recipeId === id);
const press = (s: GameState, id: RecipeId): GameCommand => {
  const b = craftButton(s, id);
  if (!b) throw new Error(`No ${id} button on Fabricate`);
  if (b.disabled) throw new Error(`${id} is disabled: ${b.reason ?? "no reason shown"}`);
  return b.command;
};
/** Restore stages 1..n through the Fabricate panel. */
function restored(n: number): GameState {
  let s = atCrown();
  if (n >= 3) suit450(s);
  for (const id of STAGES.slice(0, n)) { fundDiver(s, id); s = run(s, press(s, id)); }
  return s;
}

test("W2-02: each stage restores at the door through Fabricate, paid exactly once, atomically, and saves", () => {
  let s = atCrown();
  suit450(s);
  assert.ok(validState(s), "fixture");
  assert.equal(crownStage(s), 0);
  for (const [n, id] of STAGES.entries()) {
    // Unpaid: the button shows why, and pressing it anyway changes nothing.
    const unpaid = craftButton(s, id);
    assert.ok(unpaid?.disabled, `${id}: shown and disabled before payment`);
    refused(s, unpaid!.command);
    // A later stage waits for this one, even fully paid for with its other needs
    // met (HUB-2-01: unfunded, missing materials alone would keep it disabled, so
    // the order check must fund it; it fails when the stage's prerequisite is removed).
    if (n < 2) {
      const ahead = structuredClone(s), next = STAGES[n + 1]!;
      fundDiver(ahead, next);
      const later = craftButton(ahead, next);
      assert.ok(later?.disabled, `${next} before ${id}: disabled even when paid for`);
      assert.match(later!.reason ?? "", /earlier work/, `${next} names the order, not the materials`);
      assert.match(refused(ahead, { type: "craft", recipeId: next }), /earlier work/, `${next} refused before ${id}, nothing spent`);
    }
    // One unit short: still refused, nothing moves.
    fundDiver(s, id);
    const short = Object.keys(RECIPES[id].cost)[0] as ItemKind;
    const spare = s.inventory.items.find((i) => i.kind === short && i.containerId === "diver")!;
    spare.quantity -= 1;
    if (!spare.quantity) s.inventory.items.splice(s.inventory.items.indexOf(spare), 1);
    assert.match(refused(s, unpaid!.command), /Missing materials/);
    addItem(s, short, 1, "diver");
    // Paid: exactly the cost leaves, the stage's facility is restored, once.
    const before = totals(s);
    s = run(s, press(s, id));
    const after = totals(s);
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)]))
      assert.equal((before[k] ?? 0) - (after[k] ?? 0), (RECIPES[id].cost as Record<string, number>)[k] ?? 0, `${id}: ${k} conserved`);
    assert.ok(facility(s, CROWN_RESTORATIONS[id]) && s.knowledge.crafted.includes(id));
    assert.equal(crownStage(s), n + 1);
    fundDiver(s, id);
    const again = craftButton(s, id);
    assert.ok(!again || again.disabled, `${id}: a paid stage cannot be paid again`);
    if (again) refused(s, again.command);
    for (const i of s.inventory.items.filter((i) => i.containerId === "diver")) i.containerId = "pod_locker";
    s = roundTrip(s);
  }
});

test("W2-03: the dock serves through Cargo's Service only from the dock stage; stage 1 gives air, bunk and locker, not service", () => {
  for (const n of [1, 2]) {
    const s = restored(n), v = creelOf(s);
    parkCreel(s, { ...CROWN_STATION.dock }, Math.PI / 2);
    v.charge = 12; v.health = 20;
    pilotCreel(s);
    const service = probe.buttons("inventory", s).find((b) => b.command.type === "service" && (b.command as { vehicleId?: string }).vehicleId === v.id);
    assert.ok(service, "Cargo shows the craft's service button");
    if (n === 1) {
      assert.ok(service.disabled, "stage 1: no dock service");
      assert.equal(supportedServiceSite(s, v), null);
      refused(s, service.command);
    } else {
      assert.ok(!service.disabled, `stage 2: ${service.reason}`);
      assert.equal(supportedServiceSite(s, v), "crown_station");
      const after = run(s, service.command), w = after.fleet.vehicles.find((x) => x.id === v.id)!;
      assert.equal(w.charge, 100); assert.equal(w.health, 100);
    }
  }
  // Out of the dock's reach, never.
  const s = restored(2), v = creelOf(s);
  parkCreel(s, { ...CROWN_STATION.dock, x: CROWN_STATION.dock.x - CROWN_STATION.dockRadius - 1 });
  assert.equal(supportedServiceSite(s, v), null);
  // Stage 1 opens the locker and the refuge; the stores wait for the dock.
  const one = restored(1);
  assert.match(probe.text("craft", one), /Crown station bench · restored/, "Fabricate names the crown's bench");
  assert.ok(containerAccessible(one, CROWN_STATION.locker));
  for (const c of CROWN_STATION.stores) assert.ok(!containerAccessible(one, c) && containerAccessible(restored(2), c), c);
  const cu = [CROWN_STATION.locker, ...CROWN_STATION.stores].reduce((n, id) => n + one.inventory.containers.find((c) => c.id === id)!.capacity, 0);
  assert.equal(cu, 144, "large lockers once the dock is restored");
});

test("W2-04: the full bench runs the pod's fabrication and the workshop's refits and upgrades, never hull builds or yard work", () => {
  for (const id of Object.keys(RECIPES) as RecipeId[]) {
    const r = RECIPES[id], crown = recipeSites(id).includes("crown_station") && r.site !== "crown_station";
    if (r.site === "pod_fabricator") assert.ok(crown, `${id}: basic fabrication at the crown`);
    if (r.site === "stack_yard" || r.site === "home_pod") assert.ok(!crown, `${id}: stays at its own site`);
    if (["creel_base", "dart_base", "restore_workshop", "strip_frame"].includes(id)) assert.ok(!crown, `${id}: stays at the workshop`);
    assert.equal(crown, crownBenchRecipe(id));
  }
  for (const id of ["suit_450", "creel_450", "creel_800", "dart_350", "plating_alloy", "mod_survey", "creel_cargo_rack"] as RecipeId[])
    assert.ok(recipeSites(id).includes("crown_station"), id);
  // A paid basic recipe from the crown's store: not before the dock stage.
  const early = restored(1);
  fundDiver(early, "glow_lures");
  const blocked = craftButton(early, "glow_lures");
  assert.ok(blocked?.disabled && /dock and fabricator/.test(blocked.reason ?? ""), `stage 1: ${blocked?.reason}`);
  let s = restored(2);
  for (const [k, q] of Object.entries(RECIPES.glow_lures.cost)) addItem(s, k as ItemKind, q!, CROWN_STATION.stores[0]);
  const before = totals(s);
  s = run(s, press(s, "glow_lures"));
  for (const [k, q] of Object.entries(RECIPES.glow_lures.cost)) assert.equal(before[k]! - (totals(s)[k] ?? 0), q, `glow_lures: ${k} from the store`);
  assert.ok((totals(s).glow_lure ?? 0) > (before.glow_lure ?? 0), "the lures are made");
  // A hull refit: the Creel moored at the dock, paid from its own hold.
  const refit = (): GameState => {
    const t = restored(2), v = creelOf(t);
    v.rating = 350; if (!t.knowledge.crafted.includes("creel_350")) t.knowledge.crafted.push("creel_350");
    parkCreel(t, { ...CROWN_STATION.dock }, Math.PI / 2);
    for (const [k, q] of Object.entries(RECIPES.creel_450.cost)) addItem(t, k as ItemKind, q!, v.cargoId);
    return t;
  };
  const moored = refit(), done = run(moored, press(moored, "creel_450"));
  assert.equal(creelOf(done).rating, 450);
  for (const [k, q] of Object.entries(RECIPES.creel_450.cost)) assert.equal(totals(moored)[k]! - (totals(done)[k] ?? 0), q, `creel_450: ${k}`);
  // Away from the dock: refused, with the reason.
  const away = refit();
  parkCreel(away, { ...CROWN_STATION.dock, x: CROWN_STATION.dock.x - 40 }, Math.PI / 2);
  const b = craftButton(away, "creel_450");
  assert.ok(!b || b.disabled, "a remote hull is not refitted");
});

test("sockets and the survey array work from the third stage, through Base", () => {
  assert.ok(!probe.text("systems", restored(2)).includes(CROWN_STATION.label), "no crown host before the survey stage");
  const s = restored(3), text = probe.text("systems", s);
  assert.ok(text.includes(CROWN_STATION.label), text.slice(0, 200));
  assert.equal((text.match(/\bs\d · empty/g) ?? []).length, CROWN_STATION.sockets, "six sockets");
  const after = run(s, probe.press("systems", s, /^Survey$/));
  assert.match(after.feedback, /Survey \(300 m\)/);
});

test("the bunk heals three times as fast; you wake at the crown once rested there while it works, else the pod", () => {
  let s = restored(1);
  s.player.vitals.health = 30; s.player.vitals.food = 80;
  assert.equal(bunkHealRate(s), 3 * 1.8);
  for (let i = 0; i < 60; i++) s = stepGame(s, [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false }], world).state;
  assert.ok(s.player.vitals.health > 30 + 4.5, `healed ${(s.player.vitals.health - 30).toFixed(1)} in 1 s`);
  assert.equal(s.player.refugeId, "crown_station", "resting here registers the bunk");
  incapacitate(s, "Test.", world);
  assert.deepEqual(s.player.pose.position, REST_BASES.crown_station.wake);
  // Without power the crown is no base: the pod.
  const cold = atCrown();
  cold.player.refugeId = "crown_station";
  incapacitate(cold, "Test.", world);
  assert.equal(cold.player.refugeId, "home_pod");
});

test("saves: crown facilities and stores are additive content; an older save loads with them unrestored", () => {
  const s = atCrown();
  const e = encodeSave(createEnvelope(s, meta)); assert.ok(e.ok);
  const raw = JSON.parse(e.value);
  raw.state.world.facilities = raw.state.world.facilities.filter((f: { id: string }) => !(CROWN_FACILITIES as readonly string[]).includes(f.id));
  raw.state.inventory.containers = raw.state.inventory.containers.filter((c: { id: string }) => !c.id.startsWith("crown_station_"));
  const d = decodeSave(JSON.stringify(raw)); assert.ok(d.ok, d.ok ? "" : d.error);
  for (const id of CROWN_FACILITIES) assert.equal(d.value.state.world.facilities.find((f) => f.id === id)?.repaired, false, id);
  for (const id of [CROWN_STATION.locker, ...CROWN_STATION.stores]) assert.ok(d.value.state.inventory.containers.some((c) => c.id === id), id);
  // A restored stage without its paid recipe is refused as corrupt.
  const forged = structuredClone(s);
  forged.world.facilities.find((f) => f.id === "crown_dock")!.repaired = true;
  assert.equal(validState(forged), false);
  assert.equal(WORKING_STOPS.crown_station.facility, "crown_power");
});
