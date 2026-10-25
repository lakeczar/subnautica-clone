/** ENV-1: the validator's timed return uses the step's ordinary swim speed and
 * jump height, copied as constants until the step exports them (FORK
 * interior-swim-speed). These measure the real step, so the copies can't drift. */
import test from "node:test";
import assert from "node:assert/strict";
import { JUMP, ORDINARY_SWIM_SPEED } from "../src/sim/interiors/validate.js";
import { FIXED_SECONDS as DT } from "../src/sim/clock.js";
import { at } from "./b1-support.js";
import { fixtureState, openWater } from "./interiors-support.js";
import { play } from "./step-support.js";

test("the ordinary swim speed is the step's: a level, unsprinted swim covers 3.4 m/s", () => {
  const world = openWater(-400), s = fixtureState("suit_350");
  at(s, { x: 0, y: -100, z: 0 }, "swimming");
  s.player.pose.yaw = 0; s.player.pose.pitch = 0;
  const warm = play(s, 30, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], world);
  const from = { ...warm.player.pose.position }, ticks = 120;
  const end = play(warm, ticks, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], world).player.pose.position;
  const speed = Math.hypot(end.x - from.x, end.y - from.y, end.z - from.z) / (ticks * DT);
  assert.ok(Math.abs(speed - ORDINARY_SWIM_SPEED) < 0.05, `measured ${speed.toFixed(3)} m/s`);
});

test("a walker's jump clears the validator's jump height, and not by much", () => {
  const world = openWater(5), s = fixtureState("suit_150");
  at(s, { x: 0, y: 5, z: 0 }, "walking");
  let top = 5;
  play(s, 60, [{ type: "move", forward: 0, right: 0, vertical: 1, sprint: false }], world, (_e, st) => { top = Math.max(top, st.player.pose.position.y); });
  assert.ok(top - 5 >= JUMP && top - 5 < JUMP + 0.3, `jump apex ${(top - 5).toFixed(3)} m`);
});
