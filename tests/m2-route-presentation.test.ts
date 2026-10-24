import test from "node:test";
import assert from "node:assert/strict";
import { EncounterPresentation, DAMAGE_SECONDS, type DamageFeedback, type DamageTarget } from "../src/ui/notices.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { incapacitate } from "../src/sim/recovery.js";
import { FIXED_SECONDS } from "../src/sim/clock.js";

function encounter() {
  const s = createGame(); completeOpening(s);
  const v = makeVehicle("episode-dart", "dart", { x: 130, y: -112, z: -110 }, "episode-hold");
  s.fleet.vehicles.push(v); s.player.mode = "piloting"; s.player.controlledVehicleId = v.id;
  s.player.pose = structuredClone(v.pose); s.world.threat.mode = "pursue";
  return { s, v, p: new EncounterPresentation(), target: { kind: "vehicle", vehicleId: v.id } as DamageTarget };
}

test("injury episodes retain raw positive event loss and a detached target, ignoring zero and non-finite loss", () => {
  const { s, p, target } = encounter(); p.observe(s);
  for (const loss of [0, -0.2, NaN, Infinity]) assert.equal(p.recordDamage(target, loss), false);
  assert.equal(p.damage, null);
  assert.equal(p.recordDamage(target, 0.0167), true);
  assert.notStrictEqual((p.damage as DamageFeedback | null)?.target, target);
  for (let i = 0; i < 19; i++) assert.equal(p.recordDamage(target, 0.0167), false);
  assert.ok(Math.abs(p.damage!.total - 0.334) < 1e-12, "rounding never feeds back into accumulation");
  assert.equal(s.fleet.vehicles[0]!.health, 100, "presentation cannot apply damage");
});

test("40 bite steps are two-thirds of a second, total eight hull points and exactly one flash", () => {
  const { s, p, target } = encounter(); p.observe(s);
  let onsets = 0, pulses = 0;
  for (let i = 0; i < 40; i++) {
    if (p.recordDamage(target, 0.2)) onsets++;
    if (p.damage!.pulse) { pulses++; p.damage!.pulse = false; }
    s.tick++; p.step(s);
  }
  assert.equal(onsets, 1); assert.equal(pulses, 1);
  assert.ok(Math.abs(p.damage!.total - 8) < 1e-12);
  assert.ok(Math.abs(p.damage!.sincePulse - 2 / 3) < 1e-12);
  assert.equal(p.damage!.sinceLast, 0);
});

test("121 sustained bite steps flash at onset, one and two active seconds with one episode", () => {
  const { s, p, target } = encounter(); p.observe(s);
  const pulses: number[] = [];
  for (let i = 0; i < 121; i++) {
    assert.equal(p.recordDamage(target, 0.2), i === 0);
    if (p.damage!.pulse) { pulses.push(i); p.damage!.pulse = false; }
    s.tick++; p.step(s);
  }
  assert.deepEqual(pulses, [0, 60, 120]);
  assert.ok(Math.abs(p.damage!.total - 24.2) < 1e-10);
  for (let i = 0; i < 179; i++) { s.tick++; p.step(s); }
  assert.ok(p.damage, "aftermath survives until three full active seconds after the last bite");
  s.tick++; p.step(s); assert.equal(p.damage, null);
  assert.equal(DAMAGE_SECONDS.aftermath, 180 * FIXED_SECONDS);
  assert.equal(p.recordDamage(target, 0.2), true, "the same target after expiry starts a fresh episode");
});

test("observations and wall expiry cannot age injury, and calls fading reflects real disengagement", () => {
  const { s, p, target } = encounter(); p.observe(s); p.recordDamage(target, 0.2); p.step(s);
  const damage = structuredClone(p.damage);
  for (let i = 0; i < 1000; i++) { p.observe(s); p.expire(1e9); }
  assert.deepEqual(p.damage, damage);
  s.world.threat.mode = "disengage"; p.observe(s);
  assert.equal(p.central?.message, "Calls fading"); assert.ok(p.damage);
  assert.equal(s.world.threat.mode, "disengage", "aftermath cannot extend actual pursuit");
});

test("a disabled controlled hull keeps its bite identity; replacement, exit and invalid targets clear it", () => {
  const { s, v, p, target } = encounter(); p.observe(s); p.recordDamage(target, 0.1);
  v.disabled = true; v.health = 0; p.observe(s);
  assert.equal(p.damageTargetValid(target, s), true); assert.equal(p.damage?.total, 0.1);
  const other = makeVehicle("replacement", "dart", { ...v.pose.position }, "other-hold");
  s.fleet.vehicles.push(other); s.player.controlledVehicleId = other.id; p.observe(s);
  assert.equal(p.damage, null); assert.equal(p.damageTargetValid(target, s), false);
  const next: DamageTarget = { kind: "vehicle", vehicleId: other.id };
  assert.equal(p.recordDamage(next, 0.2), true);
  s.player.controlledVehicleId = null; s.player.mode = "swimming"; p.observe(s);
  assert.equal(p.damage, null); assert.equal(p.damageTargetValid(next, s), false);
  assert.equal(p.damageTargetValid({ kind: "diver" }, s), true);
});

test("same-step diver incapacity, refuge, opening and reset invalidate injury without saved fields", () => {
  for (const boundary of ["incapacity", "refuge", "opening", "reset", "menu"] as const) {
    const { s, p } = encounter(); s.player.controlledVehicleId = null; s.player.mode = "swimming";
    p.observe(s); const before = structuredClone(s);
    p.recordDamage({ kind: "diver" }, 1 / 6); p.step(s);
    assert.deepEqual(s, before);
    if (boundary === "incapacity") incapacitate(s, "Exposure or injury.");
    if (boundary === "refuge") { s.player.mode = "walking"; s.player.pose.position = { x: 0, y: 0.6, z: 14 }; }
    if (boundary === "opening") s.opening.phase = 0;
    if (boundary === "reset") p.reset();
    if (boundary === "menu") p.setMenu(true);
    p.observe(s); assert.equal(p.damage, null, boundary);
    if (boundary !== "reset") assert.equal(p.damageTargetValid({ kind: "diver" }, s), false, boundary);
    assert.equal("damage" in s, false);
  }
});
