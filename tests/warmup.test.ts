import test from "node:test";
import assert from "node:assert/strict";
import { completeOpening } from "../src/sim/progression.js";
import { fixtureGame } from "../src/sim/carrier.js";
import { createGame } from "../src/sim/state.js";
import { stepGameInPlace } from "../src/sim/step.js";
import { warmSimulation } from "../src/sim/warmup.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameCommand, GameEvent, GameState } from "../src/sim/types.js";

// SIM-PERF-1: the entry warm-up steps a copy and builds the contact meshes. It must
// leave no trace: the state it was given is untouched, and play from it is the same.
const world = createWorldQueries();
const script = (t: number): GameCommand[] => [{ type: "look", yawDelta: t % 97 < 20 ? 0.03 : 0, pitchDelta: t % 60 < 30 ? 0.004 : -0.004 },
  { type: "move", forward: t % 50 < 35 ? 1 : 0, right: 0, vertical: t % 120 < 30 ? -1 : 0, sprint: t % 200 < 40 }];
function play(s: GameState, ticks: number): GameEvent[][] {
  const events: GameEvent[][] = [];
  for (let t = 0; t < ticks; t++) events.push(stepGameInPlace(s, script(t), world));
  return events;
}

for (const [name, start] of [["the expedition after the opening", () => { const s = createGame(); completeOpening(s); return s; }],
  ["the carrier fixture", fixtureGame]] as const)
  test(`warming leaves no trace on ${name}`, () => {
    const s = start(), before = structuredClone(s);
    const plain = structuredClone(s), plainEvents = play(plain, 150);
    warmSimulation(s, world);
    assert.deepEqual(s, before, "the warmed state is untouched");
    const warmed = structuredClone(s), warmedEvents = play(warmed, 150);
    assert.deepEqual(warmed, plain, "play after warming is play without it");
    assert.deepEqual(warmedEvents, plainEvents);
  });
