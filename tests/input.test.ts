import test from "node:test";
import assert from "node:assert/strict";
import { PlayerInput, deliberateExit } from "../src/runtime/input.js";
import { createGame, makeVehicle } from "../src/sim/state.js";

function inputFixture(t: test.TestContext) {
  const previous = ["window", "document"].map(k => Object.getOwnPropertyDescriptor(globalThis, k));
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { pointerLockElement: null as unknown, hidden: false });
  const canvas = Object.assign(new EventTarget(), { focus() {}, setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} });
  Object.defineProperty(globalThis, "window", { configurable: true, value: window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  let active = true, consume = false, interrupts = 0;
  const input = new PlayerInput(canvas as unknown as HTMLCanvasElement, () => active, () => consume, () => { interrupts++; });
  t.after(() => { input.dispose(); ["window", "document"].forEach((k, i) => previous[i] ? Object.defineProperty(globalThis, k, previous[i]!) : Reflect.deleteProperty(globalThis, k)); });
  return { input, window, document, canvas, setActive: (value: boolean) => { active = value; }, consume: () => { consume = true; }, interrupts: () => interrupts,
    key: (code: string, repeat = false) => window.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { code, repeat })),
    pointer: (target: EventTarget, type: string, id = 1) => target.dispatchEvent(Object.assign(new Event(type), { button: 0, pointerId: id, movementX: 12, movementY: -4 })),
  };
}

test("input: owned drag/relative motion, sensitivity and keyboard rates; clear cannot be revived by repeat", (t) => {
  const f = inputFixture(t);
  f.pointer(f.window, "pointermove");
  assert.equal((f.input.sample()[0] as { yawDelta: number }).yawDelta, 0);
  f.pointer(f.canvas, "pointerdown");
  f.pointer(f.window, "pointermove", 2);
  assert.equal((f.input.sample()[0] as { yawDelta: number }).yawDelta, 0, "another pointer is not our drag");
  f.input.settings = { sensitivity: 2, invertY: false, keyTurnSpeed: 2 };
  f.pointer(f.window, "pointermove"); f.key("ArrowRight");
  const look = f.input.sample()[0]; assert.ok(look?.type === "look");
  assert.equal(look.yawDelta, 0.06 + 0.05); assert.equal(look.pitchDelta, 0.02);
  f.key("KeyW"); f.key("KeyR"); f.window.dispatchEvent(new Event("blur"));
  assert.equal(f.interrupts(), 1);
  f.key("KeyW", true); f.key("ArrowRight", true);
  assert.deepEqual(f.input.sample(), [{ type: "look", yawDelta: 0, pitchDelta: 0 }, { type: "move", forward: 0, right: 0, vertical: 0, sprint: false, quiet: false }]);
  f.document.pointerLockElement = f.canvas;
  f.pointer(f.window, "pointermove", 2);
  assert.equal((f.input.sample()[0] as { yawDelta: number }).yawDelta, 0.06);
  f.setActive(false); f.pointer(f.window, "pointermove");
  assert.deepEqual(f.input.sample(), []);
});

test("input: deliberate capture consumes its first canvas click; pointer cancellation clears held cruise/look", (t) => {
  const f = inputFixture(t); f.consume();
  f.pointer(f.canvas, "pointerdown"); f.pointer(f.window, "pointermove");
  assert.equal((f.input.sample()[0] as { yawDelta: number }).yawDelta, 0);
  f.key("KeyR"); f.key("ArrowUp"); f.pointer(f.canvas, "pointercancel");
  assert.equal(f.input.cruise, false); assert.equal(f.interrupts(), 1);
  assert.equal((f.input.sample()[0] as { pitchDelta: number }).pitchDelta, 0);
});

test("exit trial: moving healthy craft holds; all emergency conditions bypass without changing saved state", () => {
  const s = createGame(), v = makeVehicle("test", "dart", { x: 0, y: -4, z: 0 }, "hold");
  s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id; v.velocity.z = 3;
  const before = structuredClone(s);
  assert.equal(deliberateExit(s), true); assert.deepEqual(s, before);
  for (const emergency of [() => { v.disabled = true; }, () => { v.charge = 0; }, () => { v.health = 25; }, () => { v.emergencyAir = 15; }, () => { s.world.threat.mode = "pursue"; }]) {
    v.disabled = false; v.charge = 100; v.health = 100; v.emergencyAir = 90; s.world.threat.mode = "idle";
    emergency(); assert.equal(deliberateExit(s), false);
  }
  v.velocity.z = 1.49; assert.equal(deliberateExit(s), false);
});
