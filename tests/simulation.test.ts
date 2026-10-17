import test from "node:test";
import assert from "node:assert/strict";
import {
  FixedStepClock,
  FIXED_SECONDS,
  MAX_STEPS_PER_FRAME,
} from "../src/sim/clock.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame as openingGame } from "../src/sim/state.js";
import { stepGame } from "../src/sim/step.js";
import {
  createWorldQueries,
  POD_DECK,
  surfaceHeight,
  terrainHeight,
} from "../src/sim/world.js";
import type { GameCommand, GameState, WorldQueries } from "../src/sim/types.js";

const createGame = (): GameState => {
  const s = openingGame();
  completeOpening(s);
  s.player.pose.position = { x: 0, y: 0.18, z: 14 };
  return s;
};
const world = createWorldQueries();
const move = (forward: number, vertical = 0): GameCommand => ({
  type: "move",
  forward,
  right: 0,
  vertical,
  sprint: false,
});
function run(
  state: GameState,
  commands: readonly GameCommand[],
  seconds: number,
  query = world,
): GameState {
  for (let i = 0; i < Math.round(seconds / FIXED_SECONDS); i++)
    state = stepGame(state, commands, query).state;
  return state;
}

test("fixed updates are deterministic across normal display frame schedules", () => {
  function schedule(ms: number): GameState {
    const clock = new FixedStepClock();
    let state = createGame();
    clock.advance(0, true, () => {});
    for (let time = ms; time < 1000; time += ms)
      clock.advance(time, true, () => {
        state = stepGame(state, [move(1)], world).state;
      });
    clock.advance(1000, true, () => {
      state = stepGame(state, [move(1)], world).state;
    });
    return state;
  }
  const slow = schedule(1000 / 30),
    fast = schedule(1000 / 144);
  assert.equal(slow.tick, 60);
  assert.deepEqual(slow, fast);
});

test("pause / focus boundary advances no ticks or vitals, then resumes without catch-up", () => {
  const clock = new FixedStepClock();
  let state = createGame();
  const update = (): void => {
    state = stepGame(state, [move(1)], world).state;
  };
  clock.advance(0, true, update);
  clock.advance(100, true, update);
  const before = structuredClone(state);
  clock.advance(10000, false, update);
  clock.advance(30000, false, update);
  assert.deepEqual(state, before);
  clock.reset();
  clock.advance(90000, true, update);
  assert.deepEqual(state, before);
  clock.advance(90000 + 1000 / 60, true, update);
  assert.equal(state.tick, before.tick + 1);
});

test("a long stall has a strict update budget; invalid / backward time never drains the world", () => {
  const clock = new FixedStepClock();
  let ticks = 0;
  const update = (): void => {
    ticks++;
  };
  clock.advance(0, true, update);
  assert.equal(clock.advance(5000, true, update), MAX_STEPS_PER_FRAME);
  assert.equal(ticks, MAX_STEPS_PER_FRAME);
  assert.equal(clock.advance(NaN, true, update), 0);
  assert.equal(clock.advance(4000, true, update), 0);
});

test("commands keep immutable state and clamp diagonal speed / unsafe look values", () => {
  const flat: WorldQueries = {
    ...world,
    groundHeight: () => -8,
    supportHeight: () => -8,
    moveCapsule: (origin, delta) => ({
      position: {
        x: origin.x + delta.x,
        y: origin.y + delta.y,
        z: origin.z + delta.z,
      },
      hitSolid: false,
      hitBoundary: false,
    }),
  };
  const state = createGame();
  state.player.pose.position = { x: 0, y: -4, z: 0 };
  state.player.mode = "swimming";
  const snapshot = structuredClone(state);
  const straight = stepGame(state, [move(1)], flat).state;
  const diagonal = stepGame(
    state,
    [{ type: "move", forward: 1, right: 1, vertical: 0, sprint: false }],
    flat,
  ).state;
  assert.ok(
    Math.hypot(
      diagonal.player.velocity.x,
      diagonal.player.velocity.y,
      diagonal.player.velocity.z,
    ) <=
      Math.hypot(
        straight.player.velocity.x,
        straight.player.velocity.y,
        straight.player.velocity.z,
      ) +
        1e-10,
  );
  const bad = stepGame(
    state,
    [{ type: "look", yawDelta: Infinity, pitchDelta: NaN }],
    flat,
  ).state;
  assert.ok(Number.isFinite(bad.player.pose.yaw));
  assert.deepEqual(state, snapshot);
});

test("continuous sweeps stop high-speed movement at a thin solid and allow sliding", () => {
  const query = createWorldQueries([
    {
      id: "thin-wall",
      min: { x: 2, y: -10, z: -10 },
      max: { x: 2.05, y: 5, z: 10 },
    },
  ]);
  const hit = query.moveCapsule(
    { x: 0, y: -2, z: 0 },
    { x: 30, y: 0, z: 5 },
    { radius: 0.34, height: 1 },
  );
  assert.equal(hit.hitSolid, true);
  assert.ok(hit.position.x < 1.661);
  assert.ok(hit.position.z > 4.9);
});

test("ordinary forward swim can leave the pod; a reverse approach climbs the rendered access ramp back to deck", () => {
  let state = run(createGame(), [move(1)], 5);
  assert.equal(state.player.mode, "swimming");
  assert.ok(state.player.pose.position.z < 1);
  state = stepGame(
    state,
    [{ type: "look", yawDelta: 0.8, pitchDelta: 0 }],
    world,
  ).state;
  // Equivalent bounded look commands to turn south, not a pose teleport.
  state = stepGame(
    state,
    [{ type: "look", yawDelta: 0.8, pitchDelta: 0 }],
    world,
  ).state;
  state = stepGame(
    state,
    [{ type: "look", yawDelta: 0.8, pitchDelta: 0 }],
    world,
  ).state;
  state = stepGame(
    state,
    [{ type: "look", yawDelta: Math.PI - 2.4, pitchDelta: 0.05 }],
    world,
  ).state;
  state = run(state, [move(1)], 5.5);
  assert.equal(state.player.mode, "walking");
  assert.ok(state.player.pose.position.z >= 10);
  assert.ok(state.player.pose.position.z < 19.4);
  assert.ok(Math.abs(state.player.pose.position.y - POD_DECK.max.y) < 0.03);
});

test("island shore supports water → walking → water transitions along the same analytic surface", () => {
  let state = run(createGame(), [move(1)], 15);
  assert.equal(state.player.mode, "walking");
  assert.ok(state.player.pose.position.z < -30);
  assert.ok(
    state.player.pose.position.y >=
      terrainHeight(
        state.player.pose.position.x,
        state.player.pose.position.z,
      ) -
        0.001,
  );
  state = run(state, [move(-1)], 11);
  assert.equal(state.player.mode, "swimming");
  assert.ok(state.player.pose.position.z > -25);
});

test("the workshop's central submerged approach has no lip and can be walked back into the sea", () => {
  let state = createGame();
  // This is the physical approach that exposed the old 3 m apron discontinuity.
  state.player.pose.position = { x: 10.2, y: -2.5, z: -25 };
  state.player.mode = "swimming";
  state = run(state, [move(1)], 4);
  assert.equal(state.player.mode, "walking");
  assert.ok(state.player.pose.position.z < -35, JSON.stringify(state.player.pose));
  assert.ok(Math.abs(state.player.pose.position.y - 1.2) < 0.03);
  state = run(state, [move(-1)], 5);
  assert.equal(state.player.mode, "swimming");
  assert.ok(state.player.pose.position.z > -24);
});

test("diving stays above the sea floor, the foundation boundary is bounded, and the ramp is an actual surface", () => {
  let state = run(createGame(), [move(1)], 5);
  state = run(state, [move(0, -1)], 15);
  const p = state.player.pose.position;
  assert.ok(p.y >= terrainHeight(p.x, p.z) - 0.001);
  assert.ok(p.y < -5);
  const boundary = world.moveCapsule(
    { x: 187, y: -1, z: 0 },
    { x: 50, y: 0, z: 0 },
    { radius: 0.34, height: 1 },
  );
  assert.equal(boundary.hitBoundary, true);
  assert.equal(boundary.position.x, 188);
  assert.ok(surfaceHeight(0, 8) > terrainHeight(0, 8));
  const stationary = run(state, [], 10);
  assert.equal(stationary.player.pose.position.y, p.y);
});
