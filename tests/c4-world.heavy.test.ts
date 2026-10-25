// C4 world, heavy tier (TT-1): the powerless-diver escape from sixteen shelf-race starts.
// tests/c4-world.test.ts keeps the rest and a fast smoke.
import test from "node:test";
import assert from "node:assert/strict";
import { REEF_SHELF_RACE } from "../src/content/currents/world.js";
import { volumeWeight } from "../src/sim/currents/flow.js";
import { flowAt } from "../src/sim/currents/world.js";
import { FIXED_SECONDS as DT } from "../src/sim/clock.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { stepGame } from "../src/sim/step.js";
import type { GameCommand, GameState, Vec3 } from "../src/sim/types.js";
import { gameWorld } from "../src/sim/world.js";
import { at } from "./b1-support.js";

const world = gameWorld();
const DIVER = { radius: 0.34, height: 0.95 };
function diverAt(p: Vec3): GameState {
  const s = createGame(); completeOpening(s);
  at(s, p, "swimming");
  return s;
}
const idle = (): GameCommand[] => [{ type: "look", yawDelta: 0, pitchDelta: 0 }, { type: "move", forward: 0, right: 0, vertical: 0, sprint: false }];
const race = REEF_SHELF_RACE;
const raceShape = race.shape.kind === "tube" ? race.shape : (() => { throw new Error("tube"); })();
const along = (t: number, lift = 0): Vec3 => ({ x: raceShape.a.x + (raceShape.b.x - raceShape.a.x) * t,
  y: raceShape.a.y + (raceShape.b.y - raceShape.a.y) * t + lift, z: raceShape.a.z + (raceShape.b.z - raceShape.a.z) * t });

test("a powerless diver anywhere in the shelf race reaches still water within 25 s, unharmed", () => {
  const still = (p: Vec3, tick: number): boolean => flowAt(p, tick).speed < 0.1;
  for (const t of [0.05, 0.3, 0.55, 0.8]) for (const [side, lift] of [[0, 1.5], [3.5, 1], [-3.5, 1], [0, 4]] as const) {
    const p0 = along(t, lift), p = { ...p0, x: p0.x + side };
    if (!world.clearance(p, DIVER) || volumeWeight(race, p) < 0.3) continue;
    let s = diverAt(p);
    const health = s.player.vitals.health;
    let seconds = 0;
    while (!still(s.player.pose.position, s.tick) && seconds < 25) { s = stepGame(s, idle(), world).state; seconds += DT; }
    assert.ok(seconds < 25, `stuck in the race from ${JSON.stringify(p)} at ${JSON.stringify(s.player.pose.position)}`);
    assert.equal(s.player.vitals.health, health, "a current never harms a diver");
  }
});
