import test from "node:test";
import assert from "node:assert/strict";
import { HULLS, MODULES } from "../src/content/registry.js";
import { HULL_BASE } from "../src/content/upgrades/base.js";
import { CREEL_HANDLING, ARM_CHARGE, ARM_LIFT_SECONDS } from "../src/sim/fleet.js";
import { dartPerformance } from "../src/sim/modules.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { createWorldQueries } from "../src/sim/world.js";
import { craftProfile, emission, heatExposure, hullDamage, motion, brineTolerated, driftScale } from "../src/sim/upgrades/effects.js";
import {
  anchoredDrift, anchorRefusal, armWork, ballastRefusal, ballastStep, blowBallast, clampFrames, collectPodRefusal,
  craneLiftRefusal, droneLaunchRefusal, droneRecall, dropPodRefusal, fireFlare, fireGrapple, flareLight, flarePosition,
  grappleStep, initialRuntime, landable, listen, mastRangeFactor, overdriveMotion, overdriveRefusal, patchRefusal,
  rearm, sampleRefusal, serviceHeadDock, sonarSweep, startOverdrive, tagCandidate, FLARE, OVERDRIVE, TICKS_PER_SECOND,
} from "../src/sim/upgrades/tools.js";

const near = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("base profiles mirror today's handling constants", () => {
  const c = craftProfile("creel", 240, []);
  assert.deepEqual(c.speed, { quiet: CREEL_HANDLING.quiet, cruise: CREEL_HANDLING.cruise, boost: CREEL_HANDLING.boost });
  assert.equal(c.loudness.cruise, CREEL_HANDLING.loudness.cruise);
  near(c.drain, CREEL_HANDLING.drain);
  // The Dart's untrimmed and trimmed speeds are the M1 values modules.ts reports.
  const s = createGame(), dart = makeVehicle("dart-1", "dart", { x: 0, y: -2, z: 0 }, "dart-1_hold");
  s.fleet.vehicles.push(dart);
  const base = dartPerformance(s, dart.id)!, d = craftProfile("dart", 180, []), trim = craftProfile("dart", 180, ["dart_acoustic_trim"]);
  assert.deepEqual([d.speed.quiet, d.speed.cruise, d.speed.boost], [base.quietSpeed, base.normalSpeed, base.boostSpeed]);
  assert.deepEqual([trim.speed.quiet, trim.speed.boost], [MODULES.dart_acoustic_trim.quietSpeed, MODULES.dart_acoustic_trim.boostSpeed]);
  for (const hull of Object.keys(HULL_BASE) as (keyof typeof HULL_BASE)[])
    assert.equal(craftProfile(hull, HULLS[hull].initialDepth, []).rating, hull === "spindle" ? 0 : HULLS[hull].initialDepth);
});

test("speed, noise and light: silent running, floodlights and emission for wildlife", () => {
  const quiet = craftProfile("dart", 180, ["silent_running"]);
  near(quiet.loudness.cruise, 0.48 * 0.55);
  assert.equal(quiet.speed.boost, quiet.speed.cruise);
  near(quiet.speed.cruise, 7.2);
  const lit = craftProfile("dart", 180, ["floodlights_2"]);
  near(lit.lamp, 0.9 * 2.2);
  assert.deepEqual(emission(lit, 0.48, true, true), { noise: 0.48, light: lit.lamp });
  assert.deepEqual(emission(lit, 1.4, true, false), { noise: 1, light: 0 });
  assert.deepEqual(emission(lit, 0.2, false, true), { noise: 0.2, light: 0 });
  // Lamps cost power only while lit.
  assert.ok(motion(lit, "cruise", { lamp: true }).drain > motion(lit, "cruise").drain);
  assert.equal(motion(lit, "idle").speed, 0);
});

test("drain, capacity and rating", () => {
  const stock = craftProfile("creel", 350, []), big = craftProfile("creel", 350, ["cell_bank_2", "drive_tuning_1"]);
  near(motion(big, "cruise").drain, (CREEL_HANDLING.drain * 0.8) / 2);
  near(motion(stock, "boost").drain, CREEL_HANDLING.drain * 1.6);
  near(motion(stock, "idle").drain, 0.015);
  assert.equal(big.speed.boost, 5.5);
  const plated = craftProfile("dart", 350, ["plating_ceramic"]);
  assert.equal(plated.rating, 400);
  near(hullDamage(plated, 10), 6);
  assert.equal(craftProfile("spindle", 0, ["plating_alloy"]).rating, 0);
  near(craftProfile("spindle", 0, ["plating_alloy"]).damage, 0.75);
  const rack = craftProfile("creel", 240, ["creel_cargo_rack"]);
  assert.equal(64 + rack.holdDeltaCu, 96);
});

test("heat: the lining raises tolerance, the exchanger slows the load, the shroud ignores only ambient heat", () => {
  const warm = [{ level: 0.36, kind: "ambient" as const }];
  assert.equal(heatExposure(craftProfile("creel", 350, []), warm).tolerated, false);
  assert.equal(heatExposure(craftProfile("creel", 350, ["hull_heat_lining"]), warm).tolerated, true);
  assert.equal(heatExposure(craftProfile("creel", 350, ["thermal_exchanger"]), warm).loadRate, 0.6);
  const shroud = craftProfile("mantle", 800, ["mantle_thermal_shroud"]);
  const ambient = heatExposure(shroud, [{ level: 0.95, kind: "ambient" }]);
  assert.deepEqual([ambient.effective, ambient.tolerated, ambient.shroudBypassed], [0, true, false]);
  for (const kind of ["core", "burst"] as const) {
    const plume = heatExposure(shroud, [{ level: 0.95, kind }, { level: 0.5, kind: "ambient" }]);
    assert.deepEqual([plume.effective, plume.tolerated, plume.shroudBypassed], [0.95, false, true], kind);
  }
  // Overdrive heats the hull itself, even in cold water.
  assert.equal(heatExposure(craftProfile("dart", 180, []), [], OVERDRIVE.selfHeat).tolerated, false);
  assert.equal(brineTolerated(craftProfile("creel", 800, ["hull_brine_seals"]), 0.85), true);
  assert.equal(brineTolerated(craftProfile("creel", 800, []), 0.85), false);
  near(driftScale(craftProfile("hearthline", 400, [])), 0.1);
});

// ---------------------------------------------------------------- tools
test("overdrive: a timed burst with noise, heat and triple drain, then a cooldown", () => {
  const p = craftProfile("dart", 180, ["dart_overdrive"]);
  let rt = initialRuntime();
  assert.match(overdriveRefusal(craftProfile("dart", 180, []), rt, 0, 100)!, /No overdrive/);
  assert.match(overdriveRefusal(p, rt, 0, 2)!, /needs 5% charge/);
  assert.equal(overdriveRefusal(p, rt, 0, 100), null);
  rt = startOverdrive(rt, 0);
  const burst = overdriveMotion(p, rt, 60, motion(p, "boost"));
  assert.deepEqual([burst.speed, burst.loudness, burst.selfHeat], [14, 1, 0.35]);
  near(burst.drain, p.drain * 3);
  assert.match(overdriveRefusal(p, rt, 60, 100)!, /already running/);
  const after = 4 * TICKS_PER_SECOND;
  assert.equal(overdriveMotion(p, rt, after, motion(p, "boost")).speed, 11);
  assert.match(overdriveRefusal(p, rt, after, 100)!, /cooling: 10 s/);
  assert.equal(overdriveRefusal(p, rt, after + 10 * TICKS_PER_SECOND, 100), null);
});

test("flares: four per load, a timed light that fades and sinks, rearmed only at a dock", () => {
  const world = createWorldQueries([{ id: "wall", min: { x: -5, y: -60, z: -20 }, max: { x: 5, y: -40, z: -10 } }], () => -200);
  const p = craftProfile("creel", 240, ["flare_launcher"]);
  let rt = initialRuntime();
  const shot = fireFlare(p, rt, { x: 0, y: -50, z: 0 }, { x: 0, y: 0, z: -1 }, 600, world);
  assert.ok("flare" in shot);
  // It stops against the wall at z = -10, short of its 14 m range.
  assert.ok(shot.flare.position.z > -10.5 && shot.flare.position.z < -9);
  assert.equal(flareLight(shot.flare, 600), FLARE.intensity);
  assert.equal(flareLight(shot.flare, 600 + 18.5 * 60), FLARE.intensity * 0.5);
  assert.equal(flareLight(shot.flare, 600 + 20 * 60), 0);
  near(flarePosition(shot.flare, 600 + 10 * 60).y, shot.flare.position.y - 1.5);
  rt = shot.runtime;
  for (let i = 0; i < 3; i++) { const s = fireFlare(p, rt, { x: 0, y: -50, z: 0 }, { x: 1, y: 0, z: 0 }, 0, world); assert.ok("runtime" in s); rt = s.runtime; }
  const empty = fireFlare(p, rt, { x: 0, y: -50, z: 0 }, { x: 1, y: 0, z: 0 }, 0, world);
  assert.match("refusal" in empty ? empty.refusal : "", /empty\. Rearm at a supported dock/);
  assert.match(rearm(rt, p, false).refusal!, /supported dock/);
  assert.equal(rearm(rt, p, true).runtime.flares, 4);
  assert.match(("refusal" in fireFlare(craftProfile("dart", 180, []), rt, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0, world)
    ? "No flare launcher" : ""), /No flare launcher/);
});

test("ballast: one mechanical ascent with no power, ending at the surface or its budget; rearm at a dock", () => {
  const p = craftProfile("dart", 180, ["emergency_ballast"]);
  let rt = initialRuntime();
  assert.equal(ballastRefusal(p, rt, 200), null);
  rt = blowBallast(rt);
  assert.match(ballastRefusal(p, rt, 200)!, /already released/);
  let depth = 200, steps = 0;
  while (rt.ascent !== null && steps < 10_000) { const s = ballastStep(rt, depth, 1 / 60); depth -= s.rise; rt = s.runtime; steps++; }
  near(depth, 160, 1e-6);
  near(steps, 600, 1);
  assert.match(ballastRefusal(p, rt, depth)!, /spent\. Rearm it at a supported dock/);
  // Near the surface the ascent stops at the surface.
  let shallow = blowBallast(initialRuntime()), d = 10;
  while (shallow.ascent !== null) { const s = ballastStep(shallow, d, 1 / 60); d -= s.rise; shallow = s.runtime; }
  near(d, 0, 1e-9);
  assert.equal(rearm(rt, p, true).runtime.ballastArmed, true);
  assert.match(ballastRefusal(craftProfile("dart", 180, []), initialRuntime(), 50)!, /No emergency ballast/);
  assert.match(ballastRefusal(p, initialRuntime(), 0.2)!, /Already at the surface/);
});

test("arms: the cutting arm harvests faster and works minerals; living hosts stay hand work", () => {
  const plain = craftProfile("creel", 240, []), cut = craftProfile("creel", 240, ["creel_cutting_arm"]);
  assert.deepEqual(armWork(plain, "structural_alloy", 4), { refusal: null, seconds: ARM_LIFT_SECONDS, charge: ARM_CHARGE, bundle: 4 });
  assert.match(armWork(plain, "conductive_crust", 2).refusal!, /need the cutting arm/);
  assert.deepEqual(armWork(cut, "structural_alloy", 4), { refusal: null, seconds: 4, charge: ARM_CHARGE + 2, bundle: 6 });
  assert.deepEqual(armWork(cut, "pressure_ceramic", 2), { refusal: null, seconds: 4, charge: ARM_CHARGE + 2, bundle: 3 });
  assert.equal(armWork(cut, "tagged_frame", 1).bundle, 1);
  assert.match(armWork(cut, "flex_membrane", 4).refusal!, /Living sources stay hand work/);
  assert.match(armWork(craftProfile("dart", 180, []), "structural_alloy", 4).refusal!, /Only a Creel/);
  assert.equal(clampFrames(craftProfile("mantle", 800, ["mantle_salvage_clamp"]), 3), 2);
  assert.equal(clampFrames(craftProfile("mantle", 800, []), 3), 1);
});

test("grapple: a straight line to rock that holds, reels and releases when crossed", () => {
  const wall = { id: "wall", min: { x: -5, y: -60, z: -30 }, max: { x: 5, y: -40, z: -25 } };
  const world = createWorldQueries([wall], () => -200);
  const p = craftProfile("creel", 350, ["creel_grapple"]);
  assert.match(("refusal" in fireGrapple(craftProfile("creel", 350, []), { x: 0, y: -50, z: 0 }, { x: 0, y: 0, z: -1 }, world)
    ? "No grapple" : ""), /No grapple/);
  const miss = fireGrapple(p, { x: 0, y: -50, z: 0 }, { x: 1, y: 0, z: 0 }, world);
  assert.match("refusal" in miss ? miss.refusal : "", /No rock within 30 m/);
  const hit = fireGrapple(p, { x: 0, y: -50, z: 0 }, { x: 0, y: 0, z: -1 }, world);
  assert.ok("line" in hit);
  near(hit.line.length, 25, 0.2);
  // A current pushing the hull away is held at the line's length.
  const held = grappleStep(hit.line, { x: 0, y: -50, z: 3 }, false, 1 / 60, world);
  near(Math.hypot(held.position.x - hit.line.anchor.x, held.position.z - hit.line.anchor.z, held.position.y - hit.line.anchor.y), hit.line.length, 1e-6);
  const reeled = grappleStep(hit.line, { x: 0, y: -50, z: 0 }, true, 1, world);
  near(reeled.line!.length, hit.line.length - 2.5, 1e-9);
  const block = createWorldQueries([wall, { id: "rib", min: { x: -3, y: -52, z: -12 }, max: { x: 3, y: -48, z: -10 } }], () => -200);
  const crossed = grappleStep(hit.line, { x: 0, y: -50, z: 0 }, false, 1 / 60, block);
  assert.equal(crossed.line, null);
  assert.match(crossed.released!, /crossed the line/);
});

test("Spindle crane and ramp, Creel service head and pod, Hearthline anchor, Hush bay", () => {
  const crane = craftProfile("spindle", 0, ["spindle_deck_crane"]);
  const at = { position: { x: 0, y: 0, z: 0 }, charge: 50, holdFreeCu: 40 };
  assert.equal(craneLiftRefusal(crane, at, { position: { x: 3, y: -10, z: 4 }, cu: 10 }), null);
  assert.match(craneLiftRefusal(crane, at, { position: { x: 3, y: -20, z: 4 }, cu: 10 })!, /reaches 12 m/);
  assert.match(craneLiftRefusal(crane, at, { position: { x: 30, y: -5, z: 0 }, cu: 10 })!, /within 8 m/);
  assert.match(craneLiftRefusal(crane, at, { position: { x: 0, y: -5, z: 0 }, cu: 12 })!, /up to 10 CU/);
  assert.match(craneLiftRefusal(crane, { ...at, holdFreeCu: 4 }, { position: { x: 0, y: -5, z: 0 }, cu: 10 })!, /needs 10 CU free/);
  assert.match(craneLiftRefusal(craftProfile("spindle", 0, []), at, { position: { x: 0, y: -5, z: 0 }, cu: 1 })!, /No deck crane/);
  const ramp = craftProfile("spindle", 0, ["spindle_shore_ramp"]), plain = craftProfile("spindle", 0, []);
  assert.deepEqual([landable(plain, { authored: true, slopeDeg: 30 }), landable(plain, { authored: false, slopeDeg: 10 }),
    landable(ramp, { authored: false, slopeDeg: 18 }), landable(ramp, { authored: false, slopeDeg: 25 })], [true, false, true, false]);
  const head = craftProfile("creel", 350, ["creel_service_head"]), o = { x: 0, y: -20, z: 0 };
  assert.equal(patchRefusal(head, { position: o, charge: 50 }, { position: { x: 4, y: -20, z: 0 }, health: 60, disabled: false, same: false }), null);
  assert.match(patchRefusal(head, { position: o, charge: 50 }, { position: o, health: 60, disabled: true, same: false })!, /rescue collar/);
  assert.match(patchRefusal(head, { position: o, charge: 50 }, { position: o, health: 60, disabled: false, same: true })!, /other craft/);
  assert.match(patchRefusal(head, { position: o, charge: 3 }, { position: o, health: 60, disabled: false, same: false })!, /6% Creel charge/);
  assert.equal(serviceHeadDock(head, o, { x: 6, y: -20, z: 0 }, false), true);
  assert.equal(serviceHeadDock(head, o, { x: 9, y: -20, z: 0 }, false), false);
  const pod = craftProfile("creel", 350, ["creel_drop_pod"]), rt = initialRuntime();
  assert.equal(dropPodRefusal(pod, rt), null);
  const out = { ...rt, pod: { position: o } };
  assert.match(dropPodRefusal(pod, out)!, /already out/);
  assert.equal(collectPodRefusal(pod, out, { x: 5, y: -20, z: 0 }), null);
  assert.match(collectPodRefusal(pod, out, { x: 20, y: -20, z: 0 })!, /within 8 m/);
  const anchor = craftProfile("hearthline", 400, ["hearthline_mooring_anchor"]);
  assert.equal(anchorRefusal(anchor, 40, 0.1), null);
  assert.match(anchorRefusal(anchor, 120, 0.1)!, /reaches 80 m/);
  assert.match(anchorRefusal(anchor, 40, 2)!, /Stop before/);
  assert.deepEqual(anchoredDrift({ x: 1.2, y: 0, z: 0 }, true), { x: 0, y: 0, z: 0 });
  near(anchoredDrift({ x: 3, y: 0, z: 0 }, true).x, 1.5);
  assert.deepEqual(anchoredDrift({ x: 1, y: 0, z: 0 }, false), { x: 1, y: 0, z: 0 });
  const bay = craftProfile("hush", 220, ["hush_specimen_bay"]);
  assert.equal(sampleRefusal(bay, 0, true), null);
  assert.match(sampleRefusal(bay, 4, true)!, /holds 4/);
  assert.match(sampleRefusal(bay, 0, false)!, /living samples only/);
});

test("contracts: sonar, tagger, listening array, scout drone and radio mast", () => {
  const o = { x: 0, y: -100, z: 0 };
  const features = [
    { id: "mouth.far", kind: "cave_mouth", position: { x: 0, y: -100, z: -170 } },
    { id: "mouth.near", kind: "cave_mouth", position: { x: 0, y: -100, z: -40 } },
    { id: "passage", kind: "passage", position: { x: 190, y: -100, z: 0 } },
    { id: "site", kind: "site", position: { x: 10, y: -100, z: 0 } },
  ];
  const sonar = craftProfile("dart", 350, ["dart_wide_sonar"]);
  assert.deepEqual(sonarSweep(sonar, o, features).map((f) => f.id), ["mouth.near", "mouth.far"]);
  assert.deepEqual(sonarSweep(craftProfile("dart", 350, []), o, features), []);
  const tagger = craftProfile("dart", 350, ["dart_range_tagger"]);
  assert.equal(tagCandidate(tagger, o, { x: 0, y: 0, z: -1 }, features)?.id, "mouth.near");
  assert.equal(tagCandidate(tagger, o, { x: 1, y: 0, z: 0 }, features)?.id, "site");
  assert.equal(tagCandidate(tagger, o, { x: 0, y: 1, z: 0 }, features), null);
  const array = craftProfile("hush", 220, ["hush_listening_array"]);
  const sources = [{ id: "whale", kind: "creature", position: { x: 150, y: -100, z: 0 }, loudness: 0.9 },
    { id: "click", kind: "site", position: { x: 0, y: -100, z: -100 }, loudness: 0.2 }];
  const heard = listen(array, o, 0.1, sources);
  assert.deepEqual(heard.map((h) => h.id), ["whale"]);
  near(heard[0]!.bearing, Math.PI / 2, 1e-9);
  assert.deepEqual(listen(array, o, 0.4, sources), []);
  const drone = craftProfile("mantle", 800, ["mantle_drone_bay"]);
  assert.equal(droneLaunchRefusal(drone, { speed: 0.1, berthed: false, charge: 50 }), null);
  assert.match(droneLaunchRefusal(drone, { speed: 2, berthed: false, charge: 50 })!, /Hold station/);
  assert.match(droneLaunchRefusal(craftProfile("mantle", 800, []), { speed: 0, berthed: false, charge: 50 })!, /No drone bay/);
  assert.equal(droneRecall({ x: 0, y: -100, z: -70 }, o, 10), true);
  assert.equal(droneRecall({ x: 0, y: -100, z: -50 }, o, 121), true);
  assert.equal(droneRecall({ x: 0, y: -100, z: -50 }, o, 10), false);
  const mast = craftProfile("spindle", 0, ["spindle_radio_mast"]);
  assert.deepEqual([mastRangeFactor(mast, true), mastRangeFactor(mast, false), mastRangeFactor(craftProfile("spindle", 0, []), true)], [1.5, 1, 1]);
});

test("a fitted contract or tool appears in the profile only while fitted", () => {
  const p = craftProfile("mantle", 800, ["mantle_drone_bay", "mantle_hull_air_line", "mantle_salvage_clamp"]);
  assert.deepEqual(p.contracts, ["scout_drone"]);
  assert.deepEqual(p.tools, ["salvage_clamp"]);
  assert.equal(p.airLine, "hull");
  assert.equal(craftProfile("mantle", 800, []).airLine, "basic");
});
