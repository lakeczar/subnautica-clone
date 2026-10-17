import test from "node:test";
import assert from "node:assert/strict";
import { Soundscape } from "../src/audio/sound.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { updateSurvival, updateThreat } from "../src/sim/survival.js";
import type { GameEvent } from "../src/sim/types.js";

function parameter() {
  return { value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
}
class AudioProbe {
  static pans: { value: number }[] = [];
  currentTime = 0;
  sampleRate = 1;
  destination = {};
  createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
  createOscillator() { return { frequency: parameter(), connect() {}, disconnect() {}, start() {}, stop() {} }; }
  createBuffer() { return { getChannelData: () => new Float32Array(4) }; }
  createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
  createBiquadFilter() { return { frequency: parameter(), connect() {} }; }
  createStereoPanner() {
    const pan = parameter();
    AudioProbe.pans.push(pan);
    return { pan, connect() {}, disconnect() {} };
  }
  async resume() {}
  async close() {}
}

test("body/equipment warnings stay centred while a threat warning pans to its detached event origin", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: AudioProbe });
  const audio = new Soundscape();
  t.after(() => {
    audio.dispose();
    if (previous) Object.defineProperty(globalThis, "AudioContext", previous);
    else Reflect.deleteProperty(globalThis, "AudioContext");
  });
  audio.activate();
  const s = createGame();
  completeOpening(s);
  s.player.mode = "swimming";
  s.player.pose.position = { x: 123, y: -110, z: -105 };
  s.player.vitals.oxygen = 35.001;
  s.world.threat.position = { x: 145, y: -110, z: -105 };
  const body: GameEvent[] = [];
  updateSurvival(s, body);
  const alarm = body.find((e) => e.type === "sound" && e.cue === "warning");
  assert.ok(alarm);
  audio.event(alarm, s);
  assert.equal(AudioProbe.pans.at(-1)!.value, 0, "low-air/body alarm must not imply the hunter's bearing");
  s.player.vitals.food = 20.0001;
  s.player.graceSeconds = 0;
  const food: GameEvent[] = [];
  updateSurvival(s, food);
  const v = makeVehicle("alarm-dart", "dart", { x: 123, y: -170, z: -105 }, "alarm-hold");
  v.charge = 20;
  const equipment = structuredClone(s);
  equipment.fleet.vehicles.push(v);
  equipment.player.controlledVehicleId = v.id;
  equipment.player.mode = "piloting";
  equipment.player.pose.position = { ...v.pose.position };
  const systems: GameEvent[] = [];
  updateSurvival(equipment, systems);
  assert.ok(food.filter((e) => e.type === "sound" && e.cue === "warning").length >= 2, "food and personal-pressure alarms");
  assert.equal(systems.filter((e) => e.type === "sound" && e.cue === "warning").length, 2, "power and hull-pressure alarms");
  for (const event of [...body, ...food, ...systems]) if (event.type === "sound" && event.cue === "warning") {
    assert.equal(event.origin, undefined);
    audio.event(event, s);
    assert.equal(AudioProbe.pans.at(-1)!.value, 0);
  }

  s.world.threat.interest = 1;
  const threat: GameEvent[] = [];
  updateThreat(s, 1, threat);
  const call = threat.find((e) => e.type === "sound" && e.cue === "warning");
  assert.ok(call && "origin" in call);
  const origin = structuredClone(call.origin);
  s.world.threat.position.x = 90;
  assert.deepEqual(call.origin, origin, "queued event must retain the actual call position");
  audio.event(call, s);
  assert.ok(AudioProbe.pans.at(-1)!.value > 0);
  s.player.pose.yaw = Math.PI;
  audio.event(call, s);
  assert.ok(AudioProbe.pans.at(-1)!.value < 0);
});
