// HEAVY TIER (by cost, no Babylon): the Pale Basin's small and medium caves,
// generated and swum in the composed world, plus the wakeglow adverse case.
// Run through scripts/heavy-check.sh.
import test from "node:test";
import assert from "node:assert/strict";
import { BASIN_CAVES } from "../src/content/regions/caves/index.js";
import { oldestVisible, swimWake, wakeGlow, wakeTrail, layWake, WAKE_STRENGTH, type WakePoint, type WakeTrail } from "../src/content/regions/caves/wakeglow.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { stepGame } from "../src/sim/step.js";
import { SUIT_OXYGEN_DRAIN_PER_SECOND } from "../src/sim/survival.js";
import type { GameState, Vec3, WorldQueries } from "../src/sim/types.js";
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

/** A diver in the game at `p`: lamp off, a 450 m suit fitted, `air` %. */
function diverAt(p: Vec3, air: number): GameState {
  const s = createGame();
  completeOpening(s);
  s.player.pose.position = { ...p }; s.player.mode = "swimming"; s.player.lamp = false;
  s.player.vitals.health = 100; s.player.vitals.oxygen = air;
  s.inventory.items.push({ id: "test.suit", kind: "suit_450", quantity: 1, containerId: "equipment", fitted: "suit" } as never);
  return s;
}
/** Swim to `target` through `stepGame` with ordinary look and move commands
 * (no sprint). Stops within 0.18 m, or fails on a stall, a timeout or incapacity. */
function swimTo(s0: GameState, target: Vec3, world: WorldQueries): { state: GameState; seconds: number; ok: boolean; reason?: string } {
  let s = s0, steps = 0, best = Infinity, since = 0;
  for (;;) {
    const p = s.player.pose.position, dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z, flat = Math.hypot(dx, dz);
    const d = Math.hypot(flat, dy);
    if (d < 0.18) return { state: s, seconds: steps / 60, ok: true };
    if (d < best - 0.08) { best = d; since = 0; } else if (++since > 480) return { state: s, seconds: steps / 60, ok: false, reason: "stall" };
    if (steps > 60 * 60) return { state: s, seconds: steps / 60, ok: false, reason: "time" };
    const want = Math.atan2(dx, -dz), yaw = Math.atan2(Math.sin(want - s.player.pose.yaw), Math.cos(want - s.player.pose.yaw));
    const pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.max(flat, 1e-6)))) - s.player.pose.pitch;
    const clamp = (v: number, m: number): number => Math.max(-m, Math.min(m, v));
    s = stepGame(s, [{ type: "look", yawDelta: clamp(yaw, 0.8), pitchDelta: clamp(pitch, 0.8) },
      { type: "move", forward: flat > 0.08 && Math.abs(yaw) < 0.6 ? Math.min(1, flat * 2) : 0, right: 0, vertical: clamp(dy * 2, 1), sprint: false }], world).state;
    steps++;
    if (s.player.vitals.health <= 0) return { state: s, seconds: steps / 60, ok: false, reason: "incapacitated" };
  }
}

type Selector = (trail: WakeTrail, from: Vec3, now: number, visible: (p: Vec3) => boolean) => WakePoint | null;
/** The control's wrong reading: the newest glowing wake in sight within 7 m. */
const newestVisible: Selector = (trail, from, now, visible) => trail.points
  .filter(p => wakeGlow(p, now) >= 0.05 && dist(p.at, from) <= 7 && visible(p.at)).sort((a, b) => b.t - a.t)[0] ?? null;

/** Follow the wake, lamp off, through the game step. Each hop asks the
 * production selector (`oldestVisible`, or the control's `select`) for its
 * point among the eligible wake: glowing, more than 0.4 m away, reachable by
 * a swept hop and, reading it right, older than the wake the diver is at. The
 * diver swims to that point with `stepGame` and lays fresh wake. The oldest
 * point of all is where it came in, by the mouth; the daylight retreat swims
 * the last metres into open water. Air starts at `air` % and drains in the
 * step. */
function followWake(def: ReturnType<typeof defOf>, trail: WakeTrail, from: Vec3, now: number, air: number, select: Selector = oldestVisible) {
  const fr = frameOf(def), still = (p: Vec3): boolean => roomAt(def, p) !== "";
  let s = diverAt(from, air), t = now, seconds = 0, hops = 0, age = Infinity, stopped: string | null = null;
  const path = [from];
  const at = (): Vec3 => ({ ...s.player.pose.position });
  while (hops < 120) {
    const here = at(), sees = (p: Vec3): boolean => clearSight(def, head(here), head(p));
    const eligible = trail.points.filter(p => (select === oldestVisible ? p.t < age : p.t < t - 2) && dist(p.at, here) > 0.4 && reaches(fr, here, p.at));
    const lead = select({ points: eligible }, here, t, sees);
    if (!lead) break;
    const run = swimTo(s, lead.at, fr.world);
    s = run.state; t += run.seconds; seconds += run.seconds;
    if (!run.ok) { stopped = `${run.reason} on the way to ${JSON.stringify(lead.at)}`; break; }
    age = lead.t; hops++;
    layWake(trail, at(), t, WAKE_STRENGTH.diver, still);
    path.push(at());
  }
  const wakeEnd = at();
  if (!stopped && select === oldestVisible) {
    const last = lightRetreat(def, fr, [wakeEnd]);
    if (last.failures.length) stopped = last.failures[0]!;
    else for (const p of last.paths[0]!.slice(1)) {
      const run = swimTo(s, p, fr.world);
      s = run.state; seconds += run.seconds;
      if (!run.ok) { stopped = `${run.reason} on the daylight leg at ${JSON.stringify(p)}`; break; }
      path.push(at());
    }
  }
  const end = at();
  return { exited: !stopped && exteriorPose(def, end) && glow(def, head(end)) === 1 && s.player.vitals.health > 0,
    stopped, end, wakeEnd, seconds, hops, path, air: s.player.vitals.oxygen, health: s.player.vitals.health };
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
      const out = followWake(def, trail, r.pose!, now, 20);
      assert.ok(out.exited, `dwell ${dwell} s: ${out.stopped ?? `ended at ${JSON.stringify(out.end)}`} after ${out.hops} hops`);
      assert.ok(out.hops >= 1, `dwell ${dwell} s: the wake was never followed`);
      assert.ok(out.seconds < AIR_20 && out.air > 0 && out.health === 100, `dwell ${dwell} s: ${out.seconds.toFixed(1)} s, ${out.air.toFixed(1)}% air, health ${out.health}`);
      // The oldest wake in sight is a long lead: hops average at least 3 m
      // (a selector preferring newer wake creeps back point by point).
      const along = out.path.slice(1, out.hops + 1).reduce((d, p, i) => d + dist(out.path[i]!, p), 0);
      assert.ok(along / out.hops >= 3, `dwell ${dwell} s: wake hops average ${(along / out.hops).toFixed(2)} m`);
      // It points the way out: no hop takes the diver further from open water.
      const outs = out.path.map(p => distanceOut(def, p));
      for (let i = 1; i < outs.length; i++) assert.ok(outs[i]! <= outs[i - 1]! + 1, `dwell ${dwell} s: hop ${i} turns back in (${outs[i - 1]} -> ${outs[i]} m)`);
      t.diagnostic(`dwell ${dwell} s: ${out.hops} wake hops (${along.toFixed(1)} m), out in ${out.seconds.toFixed(1)} s of game step, ${out.air.toFixed(1)}% air left`);
    }
  });

test("negative controls: the wrong reading of the wake, and a faded wake, do not lead out", () => {
  const def = worst.def;
  {
    const { trail, now } = swimIn(worst, 20);
    const r = followWake(def, trail, worst.pose!, now, 100, newestVisible);
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
