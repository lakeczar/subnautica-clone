/** C4 stage B, Sol R1 fixes: each finding pinned through the path a player uses. */
import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_CYCLES } from "../src/content/currents/cycles.js";
import { at as siteAt, sitePosition } from "../src/content/ecology/sites.js";
import { validState } from "../src/save/validation.js";
import { launchPoint, fixtureGame } from "../src/sim/carrier.js";
import { observeWorldCycles } from "../src/sim/cyclesLink.js";
import { sampleCycleAt } from "../src/sim/cycles/cycle.js";
import { updateEcology } from "../src/sim/ecologyLink.js";
import { fitTarget, hazardsAt, launchLockPosition, upgradeRemovePreview, vehicleProfile } from "../src/sim/fittings.js";
import { addItem } from "../src/sim/inventory.js";
import { cellTransfer } from "../src/sim/power/charging.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { createRecorder, observe } from "../src/sim/timeline/recorder.js";
import { controlsActive } from "../src/sim/timeline/activity.js";
import type { GameCommand, GameEvent, GameState } from "../src/sim/types.js";
import { createWorldQueries } from "../src/sim/world.js";
import { PanelProbe } from "../src/ui/panelProbe.js";
import { PlayerInput } from "../src/runtime/input.js";
import { at, creelFirst, creelOf, fund, meta, parkCreel, pilotCreel } from "./b1-support.js";
import { faceTarget, NORMAL_VIEWS } from "./targeting-support.js";
import { roundTrip, world } from "./c4b-fixes-support.js";

const LEDGE = { x: -44, y: -8.09, z: 8 } as const;
const run = (s: GameState, c: GameCommand): GameState => {
  const out = executeCommand(s, c, world), no = out.events.find((e) => e.type === "notice" && e.error);
  assert.equal(no && "message" in no ? no.message : null, null, `${c.type} refused`);
  return out.state;
};

// --- C4B-01: outpost charging is a player action ---------------------------------

/** A basic outpost on the west ledge, a half-charged Creel moored above it, the diver between. */
function outpostWithCreel(): { s: GameState; outpost: string } {
  let s = creelFirst();
  const v = NORMAL_VIEWS.find((x) => x.id === "workshop_outpost_sheet")!;
  at(s, v.position, v.mode); faceTarget(s, v.id); s = run(s, { type: "interact" });
  for (const i of s.inventory.items.filter((i) => i.containerId === "diver")) i.containerId = "pod_locker";
  fund(s, "outpost_kit_basic");
  const kit = s.inventory.items.find((i) => i.kind === "outpost_kit_basic")!.id;
  at(s, { ...LEDGE, y: LEDGE.y + 0.8 }, "swimming");
  s = run(s, { type: "deploy-outpost", itemId: kit });
  parkCreel(s, { x: LEDGE.x, y: -4.5, z: LEDGE.z + 4 }, 0);
  creelOf(s).charge = 50;
  return { s, outpost: kit };
}

test("C4B-01: beside a powered outpost, Cargo and Base both offer an enabled charge; pressing it charges", () => {
  const { s } = outpostWithCreel(), probe = new PanelProbe(world), v = creelOf(s);
  const cargo = probe.buttons("inventory", s).find((b) => /^Charge at /.test(b.label));
  assert.ok(cargo && !cargo.disabled, `Cargo shows ${probe.buttons("inventory", s).map((b) => b.label).join(" | ")}`);
  assert.match(cargo.label, /50% → 100%/);
  const base = probe.buttons("systems", s).find((b) => /^Charge at /.test(b.label));
  assert.ok(base && !base.disabled, "Base offers the same charge");
  assert.match(probe.text("systems", s), /Pays solar power, no cells spent/);
  const after = run(s, probe.press("inventory", s, /^Charge at /));
  assert.equal(creelOf(after).charge, 100);
  assert.equal(creelOf(after).health, v.health, "a charger charges; it does not repair");
  // The pod's full service is unchanged; a full battery shows nothing to charge.
  assert.match(probe.buttons("inventory", after).find((b) => /^Charge at /.test(b.label))?.reason ?? "", /already full/);
  roundTrip(after);
});

test("C4B-01: a cells outpost pays from its locker's cells at the craft's capacity; spent cells refuse with the reason", () => {
  const { s, outpost } = outpostWithCreel(), probe = new PanelProbe(world);
  s.systems.outposts.find((o) => o.id === outpost)!.power = "cells";
  const cell = s.inventory.items.find((i) => i.kind === "reserve_cell")!;
  cell.containerId = `${outpost}_locker`; cell.charge = 100;
  const want = cellTransfer(100, 50, vehicleProfile(s, creelOf(s)).capacity);
  const b = probe.buttons("inventory", s).find((x) => /^Charge at /.test(x.label))!;
  assert.ok(!b.disabled, b.reason ?? "");
  assert.match(probe.text("inventory", s), /Pays 100% of the locker's reserve-cell charge/);
  const after = run(s, b.command);
  assert.ok(Math.abs(creelOf(after).charge - want.craftCharge) < 1e-9);
  assert.equal(after.inventory.items.find((i) => i.id === cell.id)!.charge, want.cellCharge);
  creelOf(after).charge = 50;
  const spent = probe.buttons("inventory", after).find((x) => /^Charge at /.test(x.label))!;
  assert.ok(spent.disabled); assert.match(spent.reason ?? "", /no power|cells are spent/);
  roundTrip(after);
});

// --- C4B-02: the carrier charger charges its berths ------------------------------------

test("C4B-02: a socketed charger fills berthed craft from the carrier, keeping its 20%; Base offers it", () => {
  let s = fixtureGame();
  assert.ok(validState(s), "the carrier fixture is a valid save");
  const h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!, host = `carrier:${h.id}`, probe = new PanelProbe(world);
  const charger = addItem(s, "mod_charger" as never, 1, "diver");
  s = run(s, { type: "install-host-module", hostId: host, socket: "hl.socket.fab.bench.1", itemId: charger.id });
  const before = s.fleet.vehicles.filter((v) => v.berth).map((v) => v.charge);
  assert.deepEqual(before, [63, 82]);
  const b = probe.buttons("systems", s).find((x) => x.label === "Charge berthed craft");
  assert.ok(b && !b.disabled, probe.buttons("systems", s).map((x) => `${x.label}${x.disabled ? ` (${x.reason})` : ""}`).join(" | "));
  const after = run(s, b.command);
  assert.deepEqual(after.fleet.vehicles.filter((v) => v.berth).map((v) => v.charge), [100, 100]);
  const carrier = after.fleet.vehicles.find((v) => v.id === h.id)!;
  assert.ok(carrier.charge < 100 && carrier.charge > 90, `the carrier paid ${100 - carrier.charge}%`);
  roundTrip(after);
  // At the reserve, nothing moves and the reason says why.
  const low = structuredClone(s); low.fleet.vehicles.find((v) => v.id === h.id)!.charge = 20;
  const refused = executeCommand(low, { type: "charge-berths", carrierId: h.id }, world);
  assert.equal(refused.state, low); assert.ok(refused.events.some((e) => e.type === "notice" && e.error));
});

// --- C4B-03: the thermal exchanger slows heat load in survival ----------------------------

test("C4B-03: the thermal exchanger slows the hull's real heat load in the chimney burst", () => {
  const chimney = sitePosition(siteAt("rift_split_chimney"));
  const load = (exchanger: boolean): number => {
    const s = creelFirst(), v = creelOf(s);
    if (exchanger) v.modules.push(addItem(s, "thermal_exchanger" as never, 1, v.cargoId).id);
    parkCreel(s, { x: chimney.x, y: -265, z: chimney.z }, 0); pilotCreel(s);
    s.tick = 35 * 60;
    for (let i = 0; i < 60; i++) { updateEcology(s, 0, false, [] as GameEvent[], world); s.tick++; }
    return s.world.ecology.hulls.find((x) => x.id === v.id)?.heat ?? 0;
  };
  const bare = load(false), fitted = load(true);
  assert.ok(bare > 5, `the burst loads a bare hull (${bare})`);
  assert.ok(Math.abs(fitted - bare * 0.6) < 1e-6, `exchanger ${fitted} vs bare ${bare}`);
});

// --- C4B-04: reserve cells respect battery capacity ---------------------------------------

test("C4B-04: a reserve cell adds the same energy to a bigger bank: full, partial and near-full, across reload", () => {
  const cases: [number, number][] = [[100, 40], [50, 40], [100, 95]];
  for (const [cellCharge, battery] of cases) {
    let s = creelFirst(); fund(s, "cell_bank_1");
    const v = creelOf(s), bank = s.inventory.items.find((i) => i.kind === "cell_bank_1")!;
    at(s, { x: -6, y: -1, z: -21 });
    s = run(s, { type: "install-module", vehicleId: v.id, itemId: bank.id });
    assert.equal(vehicleProfile(s, creelOf(s)).capacity, 1.5);
    // The two cells Creel-first made: one carried, the other stowed.
    const [cell, other] = s.inventory.items.filter((i) => i.kind === "reserve_cell");
    cell!.containerId = "diver"; cell!.charge = cellCharge; other!.containerId = "pod_locker";
    creelOf(s).charge = battery;
    s = roundTrip(s);
    const want = cellTransfer(cellCharge, battery, 1.5);
    s = run(s, { type: "reserve", vehicleId: v.id });
    assert.ok(Math.abs(creelOf(s).charge - want.craftCharge) < 1e-9, `${cellCharge}% cell into ${battery}%: ${creelOf(s).charge}`);
    assert.ok(Math.abs(s.inventory.items.find((i) => i.id === cell!.id)!.charge! - want.cellCharge) < 1e-9);
    roundTrip(s);
  }
  assert.ok(Math.abs(cellTransfer(100, 40, 1.5).craftCharge - (40 + 35 / 1.5)) < 1e-9, "63⅓%, not 75%");
});

// --- C4B-05: dry-berth warnings sample the launch exit -------------------------------------

test("C4B-05: the berth exterior is the carrier's real launch point; removing brine seals there warns", () => {
  const s = fixtureGame(), h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!, dart = s.fleet.vehicles.find((v) => v.hull === "dart")!;
  h.pose.position = { x: 565, y: -438, z: -1456 }; h.pose.yaw = 0; h.rating = 550; dart.rating = 450;
  const seals = addItem(s, "hull_brine_seals", 1, dart.cargoId); dart.modules.push(seals.id);
  assert.deepEqual(launchLockPosition(h, dart), launchPoint(h, dart));
  const exit = launchPoint(h, dart);
  assert.ok(hazardsAt(exit, s.tick).brine > 0, "the real exit lies in the brine field");
  assert.deepEqual(fitTarget(s, dart).berth?.exterior, hazardsAt(exit, s.tick));
  const p = upgradeRemovePreview(s, dart, seals.id);
  assert.ok(p.warnings.some((w) => /brine/i.test(w)), `warns: ${p.warnings.join(" | ") || "nothing"}`);
});

// --- C4B-06: idle is not play ----------------------------------------------------------------

function inputFixture(t: test.TestContext) {
  const previous = ["window", "document"].map((k) => Object.getOwnPropertyDescriptor(globalThis, k));
  const window = new EventTarget(), document = Object.assign(new EventTarget(), { pointerLockElement: null as unknown, hidden: false });
  const canvas = Object.assign(new EventTarget(), { focus() {}, setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} });
  Object.defineProperty(globalThis, "window", { configurable: true, value: window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  const input = new PlayerInput(canvas as unknown as HTMLCanvasElement, () => true);
  t.after(() => { input.dispose(); ["window", "document"].forEach((k, i) => previous[i] ? Object.defineProperty(globalThis, k, previous[i]!) : Reflect.deleteProperty(globalThis, k)); });
  return { input, down: (code: string) => window.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { code })),
    up: (code: string) => window.dispatchEvent(Object.assign(new Event("keyup", { cancelable: true }), { code })) };
}

test("C4B-06: the runtime's sampled controls: an untouched span becomes idle, real input resumes play", (t) => {
  const f = inputFixture(t);
  assert.equal(controlsActive(f.input.sample()), false, "a zero look and a zero move are no activity");
  let s = creelFirst();
  const rec = createRecorder({ id: "c4b-idle", started: meta.createdAt, build: "test" });
  const stepWith = (controls: GameCommand[]) => { s = stepGame(s, controls, world).state; observe(rec, s, { input: controlsActive(controls) }); };
  for (let i = 0; i < 60 * 40; i++) stepWith(f.input.sample());
  assert.ok(rec.idleTicks > 60 * 5, `idle counted: ${rec.idleTicks} steps`);
  const play = rec.playTicks;
  f.down("KeyW");
  for (let i = 0; i < 60; i++) stepWith(f.input.sample());
  f.up("KeyW");
  assert.equal(rec.playTicks, play + 60, "input resumes play at once");
  assert.equal(rec.idle, null);
  assert.equal(controlsActive([{ type: "look", yawDelta: 0.01, pitchDelta: 0 }]), true);
  assert.equal(controlsActive([{ type: "eat" }]), true, "any command is activity");
});

// --- C4B-07: cycles are learned by watching -------------------------------------------------------

// --- CA-1 P3: the swim step-up at the surface ------------------------------------------------

test("CA-1 P3: a diver 5 mm under the surface swims forward onto a wading shelf, but never climbs onto dry rock", () => {
  const shelf = (top: number) => createWorldQueries([{ id: "test.shelf", min: { x: -3, y: -4, z: -30 }, max: { x: 3, y: top, z: -10 } }], () => -20);
  const swimAt = (w: ReturnType<typeof shelf>) => {
    let s: GameState = creelFirst();
    at(s, { x: 0, y: -0.505, z: -8 }, "swimming"); s.player.pose.yaw = 0; s.player.pose.pitch = 0; // facing -Z, at the shelf
    for (let i = 0; i < 120; i++) s = stepGame(s, [{ type: "look", yawDelta: 0, pitchDelta: 0 }, { type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], w).state;
    return s;
  };
  const wading = swimAt(shelf(-0.5));
  assert.ok(wading.player.pose.position.z < -11, `onto the wading shelf: ${JSON.stringify(wading.player.pose.position)}`);
  assert.ok(wading.player.pose.position.y >= -0.5 - 1e-6);
  // A ledge whose top is dry (0, one voxel up) is the jump's, not the swim step-up's.
  const dry = swimAt(shelf(0));
  assert.ok(dry.player.pose.position.z > -10.5, `stopped at the dry ledge's face: ${JSON.stringify(dry.player.pose.position)}`);
});

test("smoke: watching the chimney logs it without gathering, a phase begun out of view stays untimed, and a reload keeps the record", () => {
  // Timed phases and two whole watched periods: tests/c4b-fixes.heavy.test.ts (TT-1).
  const chimney = sitePosition(siteAt("rift_split_chimney")), cycle = WORLD_CYCLES.find((c) => c.id === "cycle.rift.chimney_pulse")!;
  let s: GameState = creelFirst();
  const scans = s.knowledge.scans.length;
  const watch = { x: chimney.x + 30, y: -280, z: chimney.z };
  const phaseAt = (tick: number) => sampleCycleAt(cycle, tick).phase;
  const record = () => s.knowledge.cycles.find((r) => r.cycleId === cycle.id);
  const step = (n: number) => { for (let i = 0; i < n; i++) { at(s, watch, "swimming"); observeWorldCycles(s, world, []); s.tick++; } };
  s.tick = 41 * 60;
  const first = phaseAt(s.tick);
  step(1);
  assert.ok(record(), "seen without any scan"); assert.deepEqual(record()!.measured, []);
  assert.equal(s.knowledge.scans.length, scans, "nothing gathered or scanned");
  for (let n = 0; phaseAt(s.tick) === first; n++) { step(1); assert.ok(n < 60 * 120); }
  step(1);
  assert.deepEqual(record()!.measured, [], `${first} began out of view: untimed`);
  s = roundTrip(s);
  assert.ok(record(), "the record survives a reload");
  let live = creelFirst(); at(live, watch, "swimming");
  live = stepGame(live, [], world).state;
  // (CR-1: the stalkers' vent feeding is watched from here too, as its own record.)
  assert.ok(live.knowledge.cycles.some((r) => r.cycleId === cycle.id), "a diver watching for a moment through the real step logs it");
  const bad = structuredClone(s); (bad.knowledge.cycles[0] as unknown as { measured: string[] }).measured = ["boiling"];
  assert.equal(validState(bad), false, "a tampered record is refused");
});
