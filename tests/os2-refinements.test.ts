import test from "node:test";
import assert from "node:assert/strict";
import { makeVehicle, createGame } from "../src/sim/state.js";
import { addItem } from "../src/sim/inventory.js";
import { airSupply } from "../src/sim/survival.js";
import { exit, exitBlock, exitRefusal } from "../src/sim/vehicles.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameCommand, GameEvent, GameState, WorldQueries } from "../src/sim/types.js";
import { readyState } from "./targeting-support.js";
import { fixtureGame } from "../src/sim/carrier.js";

const water = createWorldQueries([], () => -300);
const notices = (events: GameEvent[]) => events.filter(e => e.type === "notice");
function pilot(y = -80, hull: "dart" | "hearthline" = "dart"): GameState {
  const s = readyState(), v = makeVehicle("os2-craft", hull, { x: -55, y, z: 30 }, "os2-hold");
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", capacity: 32, ownerId: v.id });
  s.player.controlledVehicleId = v.id; s.player.mode = "piloting";
  s.player.pose = structuredClone(v.pose);
  return s;
}

test("exitBlock preserves refusal precedence, exact messages and the compatible pure query", () => {
  let calls = 0;
  const blocked: WorldQueries = { ...water, clearance: () => { calls++; return false; } };
  const missing = readyState(); missing.player.controlledVehicleId = "missing";
  const carrier = pilot(-180, "hearthline"), deep = pilot(), obstructed = pilot(-20);
  const cases = [
    [missing, "not-piloting", "You are not piloting a craft."],
    [carrier, "carrier", "Engage station keeping, then leave the helm into the dry interior."],
    [deep, "depth", "Exit exposure 79 m exceeds your 60 m personal suit. The 180 m hull does not protect a diver outside."],
    [obstructed, "obstructed", "Exit side is obstructed. Move the craft to clear water before disembarking."],
  ] as const;
  for (const [s, code, message] of cases) {
    const before = structuredClone(s), priorCalls = calls;
    assert.deepEqual(exitBlock(s, blocked), { code, message });
    assert.equal(exitRefusal(s, blocked), message);
    assert.equal(exit(s, blocked), message); assert.deepEqual(s, before);
    assert.equal(calls - priorCalls, code === "obstructed" ? 3 : 0,
      "carrier and depth refuse before asking about clearance");
  }
  addItem(deep, "suit_150", 1, "equipment").fitted = "suit";
  assert.equal(exitBlock(deep, blocked)?.code, "obstructed", "actual equipment controls the depth gate");
  assert.equal(exitBlock(deep, water), null); assert.equal(exitRefusal(deep, water), null);
});

test("both exit adapters tag explicit and contextual attempts once without action mutation or success cues", () => {
  for (const s of [pilot(), pilot(-20), pilot(-180, "hearthline")]) {
    const w = s.fleet.vehicles[0]!.hull === "dart" && s.player.pose.position.y === -20
      ? { ...water, clearance: () => false } : water;
    for (const command of [{ type: "exit" }, { type: "interact", target: "stale-unused-target" }] as const) {
      const before = structuredClone(s), block = exitBlock(s, w)!;
      for (const stepping of [false, true]) {
        const out = stepping ? stepGame(s, [command], w) : executeCommand(s, command, w);
        assert.deepEqual(out.state, stepping ? stepGame(s, [], w).state : s);
        assert.deepEqual(out.events, [{ type: "notice", channel: "action", message: block.message, error: true,
          refusal: { kind: "exit", vehicleId: "os2-craft", code: block.code } }]);
        assert.deepEqual(s, before);
      }
    }
  }
});

test("missing actors, unsupported interactions and opening actions never receive exit identity", () => {
  const missing = pilot(); missing.player.controlledVehicleId = "missing";
  const unsupported = readyState(); unsupported.player.pose.position = { x: -55, y: -20, z: 30 };
  for (const [s, c, message] of [
    [missing, { type: "exit" }, "You are not piloting a craft."],
    [missing, { type: "interact" }, "You are not piloting a craft."],
    [unsupported, { type: "exit" }, "You are not piloting a craft."],
    [unsupported, { type: "interact", target: "missing" }, "Aim at a visible host within reach."],
  ] satisfies [GameState, GameCommand, string][]) {
    for (const out of [executeCommand(s, c, water), stepGame(s, [c], water)]) {
      assert.deepEqual(notices(out.events), [{ type: "notice", channel: "action", message, error: true }]);
      assert.ok(!out.events.some(e => e.type === "sound"), "generic refusals have no success cue");
    }
  }
  for (const type of ["exit", "interact"] as const) {
    const s = createGame();
    for (const out of [executeCommand(s, { type }, water), stepGame(s, [{ type }], water)])
      assert.ok(notices(out.events).every(e => !e.error && !e.refusal), "opening is handled before exit logic");
  }
  const s = pilot();
  const out = stepGame(s, [{ type: "service", vehicleId: "missing" }], water);
  assert.equal(notices(out.events)[0]?.refusal, undefined, "another failed command while piloting remains generic");
});

test("batched exit metadata identifies the attempted craft and reason even when the final actor changes", () => {
  const s = pilot();
  const out = stepGame(s, [{ type: "exit" }, { type: "exit" }, { type: "carrier", action: "failure-drill" }], water);
  assert.equal(notices(out.events).filter(e => e.refusal?.vehicleId === "os2-craft").length, 2,
    "each identical attempt emits one refusal");
  assert.ok(notices(out.events).at(-1)?.refusal === undefined, "a later unrelated refusal has no borrowed identity");
  const fixture = fixtureGame();
  fixture.opening.phase = 4;
  const carrier = fixture.fleet.vehicles.find(v => v.hull === "hearthline")!;
  fixture.player.controlledVehicleId = carrier.id; fixture.player.mode = "piloting";
  fixture.player.pose = structuredClone(carrier.pose);
  const changed = stepGame(fixture, [{ type: "exit" }, { type: "carrier", action: "failure-drill" }], water);
  assert.equal(notices(changed.events)[0]?.refusal?.vehicleId, carrier.id);
  assert.equal(notices(changed.events)[0]?.refusal?.code, "carrier");
  assert.equal(changed.state.player.controlledVehicleId, null, "later batch action changes the final actor");
});

test("successful underwater, surface and dry-refuge exits keep the same transaction and truthful receipt", () => {
  for (const [position, air] of [
    // C4 (SYS-1): the parked, powered craft feeds the basic air line beside it.
    [{ x: -55, y: -20, z: 30 }, "line"],
    [{ x: -55, y: -0.9, z: 30 }, "surface"],
    [{ x: -3.1, y: -0.02, z: 14 }, "refuge"],
  ] as const) {
    const s = pilot(position.y), v = s.fleet.vehicles[0]!;
    v.pose.position = { ...position }; s.player.pose = structuredClone(v.pose);
    v.velocity = s.player.velocity = { x: 0.1, y: 0, z: 0 };
    const expected = structuredClone(s); assert.equal(exit(expected, water), null);
    for (const command of [{ type: "exit" }, { type: "interact" }] as const) {
      const out = executeCommand(s, command, water);
      assert.deepEqual(out.state, expected);
      assert.equal(airSupply(out.state).kind, air);
      assert.deepEqual(out.events, [
        { type: "notice", channel: "action", message: "Clear exit. Your personal oxygen and pressure protection now apply.", summary: "Left the craft" },
        { type: "sound", cue: "collect" },
      ]);
      const stepped = stepGame(s, [command], water);
      assert.deepEqual(notices(stepped.events), notices(out.events));
      assert.equal(stepped.state.player.controlledVehicleId, null);
      assert.deepEqual(stepped.state.fleet.vehicles[0]!.velocity, { x: 0, y: 0, z: 0 });
    }
  }
});
