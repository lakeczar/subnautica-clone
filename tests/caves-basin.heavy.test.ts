// HEAVY TIER (by cost, no Babylon): the Pale Basin's small and medium caves,
// generated and swum in the composed world, plus the wakeglow adverse case.
// Run through scripts/heavy-check.sh.
import test from "node:test";
import assert from "node:assert/strict";
import { BASIN_CAVES } from "../src/content/regions/caves/index.js";
import { oldestVisible, swimWake, wakeTrail, layWake, WAKE_STRENGTH, type WakeTrail } from "../src/content/regions/caves/wakeglow.js";
import { SUIT_OXYGEN_DRAIN_PER_SECOND } from "../src/sim/survival.js";
import type { Vec3 } from "../src/sim/types.js";
import { clearSight, deepestPose, defOf, dist, distanceOut, exteriorPose, frameOf, glow, head, lightRetreat, reaches, roomAt } from "./caves-canopy-basin-support.js";
import { registerCaveTests } from "./caves-canopy-basin-suite.js";

registerCaveTests(BASIN_CAVES);

/** Plain swim speed (sim/step.ts, no sprint, no quiet). */
const SWIM = 3.4;
/** Seconds of air at 20%. */
const AIR_20 = 20 / SUIT_OXYGEN_DRAIN_PER_SECOND;

/** Every Basin cave room's deepest diver pose, ranked by its distance out
 * through the water. */
const rooms = BASIN_CAVES.flatMap(g => g.source.rooms.map(r => ({ g, room: r.id }))).map(({ g, room }) => {
  const def = defOf(g), pose = deepestPose(def, room);
  return { g, def, room, pose, out: pose ? distanceOut(def, pose) : NaN };
});

test("adverse: from every Basin vault room, lamp off at 20% air, a swept way out shorter than the air allows", t => {
  for (const r of rooms) {
    assert.ok(r.pose, `${r.room}: no diver pose`);
    const out = lightRetreat(r.def, frameOf(r.def), [r.pose!]);
    assert.deepEqual(out.failures, [], `${r.room}`);
    const seconds = out.longest / SWIM;
    assert.ok(seconds < AIR_20, `${r.room}: ${out.longest.toFixed(1)} m out takes ${seconds.toFixed(1)} s, air lasts ${AIR_20.toFixed(1)} s`);
  }
  const worst = rooms.reduce((a, b) => b.out > a.out ? b : a);
  t.diagnostic(`deepest room by water distance: ${worst.room}, ${worst.out.toFixed(1)} m out at ${JSON.stringify(worst.pose)}; air at 20% ${AIR_20.toFixed(0)} s`);
});

/** Follow the wake, lamp off. The rule: the oldest glowing wake in clear
 * sight within 7 m that is older than the wake the diver is at, reached by a
 * swept hop; the diver lays fresh wake as it goes. The oldest point of all is
 * where the diver came in, at the mouth: from there the daylight retreat
 * takes it the last metres into open water. `wrong` follows the newest
 * glowing wake instead (the control). Returns the swim and the time. */
function followWake(def: ReturnType<typeof defOf>, trail: WakeTrail, from: Vec3, now: number, wrong = false) {
  const fr = frameOf(def), still = (p: Vec3): boolean => roomAt(def, p) !== "";
  let at = from, t = now, swum = 0, hops = 0, age = Infinity;
  const path = [from];
  while (hops < 120) {
    const sees = (p: Vec3): boolean => clearSight(def, head(at), head(p));
    if (!oldestVisible(trail, at, t, sees)) break;
    const options = trail.points.filter(p => (wrong ? p.t < t - 2 : p.t < age) && dist(p.at, at) <= 7 && dist(p.at, at) > 0.4 && sees(p.at))
      .sort((a, b) => wrong ? b.t - a.t : a.t - b.t);
    const lead = options.find(o => reaches(fr, at, o.at));
    if (!lead) break;
    const d = dist(at, lead.at);
    t += d / SWIM; swum += d; hops++; age = lead.t;
    layWake(trail, lead.at, t, WAKE_STRENGTH.diver, still);
    at = lead.at; path.push(lead.at);
  }
  // The wake ends at the mouth: the last metres are daylight.
  let exited = false;
  if (!wrong) {
    const last = lightRetreat(def, fr, [at]);
    if (!last.failures.length) {
      exited = true;
      const out = last.paths[0]!;
      for (let i = 1; i < out.length; i++) { const d = dist(out[i - 1]!, out[i]!); swum += d; t += d / SWIM; path.push(out[i]!); }
    }
    at = path[path.length - 1]!;
  }
  return { exited: exited && exteriorPose(def, at) && glow(def, head(at)) === 1, at, swum, seconds: t - now, hops, path };
}

const worst = rooms.reduce((a, b) => b.out > a.out ? b : a);
/** Deepest by depth below the surface, too (the pale floor's buried hut). */
const lowest = rooms.reduce((a, b) => b.pose!.y < a.pose!.y ? b : a);
type Room = typeof worst;
/** The swim in: the lamp-off way out from the room's deepest pose, reversed, laying wake. */
function swimIn(r: Room, dwell: number): { trail: WakeTrail; now: number } {
  const def = r.def, out = lightRetreat(def, frameOf(def), [r.pose!]).paths[0]!, trail = wakeTrail();
  const still = (p: Vec3): boolean => roomAt(def, p) !== "";
  const end = swimWake(trail, [...out].reverse(), SWIM, 0, WAKE_STRENGTH.diver, still);
  return { trail, now: end + dwell };
}

for (const [what, r] of [["farthest by water", worst], ["deepest below the surface", lowest]] as const)
  test(`adverse: the ${what} Basin vault room (${r.room}), lamp off at 20% air: the glowing wake leads out in time`, t => {
    const def = r.def;
    for (const dwell of [10, 20]) {
      const { trail, now } = swimIn(r, dwell);
      const out = followWake(def, trail, r.pose!, now);
      assert.ok(out.exited, `dwell ${dwell} s: the wake stopped leading at ${JSON.stringify(out.at)} after ${out.hops} hops`);
      assert.ok(out.hops >= 1, `dwell ${dwell} s: the wake was never followed`);
      assert.ok(out.seconds < AIR_20, `dwell ${dwell} s: ${out.seconds.toFixed(1)} s out, air lasts ${AIR_20.toFixed(1)} s`);
      // It points the way out: no hop takes the diver further from open water.
      const outs = out.path.map(p => distanceOut(def, p));
      for (let i = 1; i < outs.length; i++) assert.ok(outs[i]! <= outs[i - 1]! + 1, `dwell ${dwell} s: hop ${i} turns back in (${outs[i - 1]} -> ${outs[i]} m)`);
      t.diagnostic(`dwell ${dwell} s: ${out.hops} wake hops, ${out.swum.toFixed(1)} m, ${out.seconds.toFixed(1)} s of ${AIR_20.toFixed(0)} s air`);
    }
  });

test("negative controls: the wrong reading of the wake, and a faded wake, do not lead out", () => {
  const def = worst.def;
  {
    const { trail, now } = swimIn(worst, 20);
    const r = followWake(def, trail, worst.pose!, now, true);
    const reached = Math.min(...r.path.map(p => distanceOut(def, p)));
    assert.ok(reached > 5, `following the newest wake got within ${reached} m of open water`);
  }
  {
    // After more than a minute of waiting, nothing glows: the cue is gone and
    // only the daylight retreat (tested above) is left.
    const { trail, now } = swimIn(worst, 90);
    assert.equal(oldestVisible(trail, worst.pose!, now, () => true), null);
  }
});
