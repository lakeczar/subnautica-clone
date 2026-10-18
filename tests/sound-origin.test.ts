import test from "node:test";
import assert from "node:assert/strict";
import { Soundscape } from "../src/audio/sound.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { updateSurvival, updateThreat } from "../src/sim/survival.js";
import type { GameEvent } from "../src/sim/types.js";

function parameter() {
  return {
    value: 0,
    targets: [] as number[],
    setValueAtTime(value: number) { this.value = value; },
    setTargetAtTime(value: number) { this.targets.push(value); },
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
  };
}
class AudioProbe {
  static current: AudioProbe;
  static pans: { value: number }[] = [];
  gains: ReturnType<typeof parameter>[] = [];
  oscillators: ReturnType<AudioProbe["oscillator"]>[] = [];
  disconnected = 0;
  resumed = 0;
  closed = 0;
  state = "suspended";
  constructor() { AudioProbe.current = this; AudioProbe.pans = []; }
  currentTime = 0;
  sampleRate = 1;
  destination = {};
  node() { return { connect() {}, disconnect: () => { this.disconnected++; } }; }
  createGain() { const gain = parameter(); this.gains.push(gain); return { gain, ...this.node() }; }
  oscillator() {
    return { frequency: parameter(), ...this.node(), start() {}, stops: [] as (number | undefined)[], stop(time?: number) { this.stops.push(time); }, onended: null as (() => void) | null };
  }
  createOscillator() { const o = this.oscillator(); this.oscillators.push(o); return o; }
  createBuffer() { return { getChannelData: () => new Float32Array(4) }; }
  createBufferSource() { return { ...this.node(), start() {}, stop() {} }; }
  createBiquadFilter() { return { frequency: parameter(), ...this.node() }; }
  createStereoPanner() {
    const pan = parameter();
    AudioProbe.pans.push(pan);
    return { pan, ...this.node() };
  }
  async resume() { this.resumed++; this.state = "running"; }
  async close() { this.closed++; this.state = "closed"; }
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
  AudioProbe.current.currentTime += 1.3;
  audio.event(call, s);
  assert.ok(AudioProbe.pans.at(-1)!.value < 0);
});

function soundFixture(t: test.TestContext): { audio: Soundscape; probe: AudioProbe } {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: AudioProbe });
  const audio = new Soundscape();
  t.after(() => {
    audio.dispose();
    if (previous) Object.defineProperty(globalThis, "AudioContext", previous);
    else Reflect.deleteProperty(globalThis, "AudioContext");
  });
  audio.activate();
  return { audio, probe: AudioProbe.current };
}

test("alarms collapse repeated body cues, preserve a spatial call, preempt actions, and stop on pause", (t) => {
  const { audio, probe } = soundFixture(t);
  const s = createGame();
  completeOpening(s);
  audio.update(s, true);
  const ambienceCount = probe.oscillators.length;
  audio.event({ type: "sound", cue: "collect" }, s);
  audio.event({ type: "sound", cue: "scan" }, s);
  const actions = probe.oscillators.slice(ambienceCount);
  audio.event({ type: "sound", cue: "warning" }, s);
  assert.ok(actions.every((o) => o.stops.includes(undefined)), "alarm must stop the quieter actions");
  const count = probe.oscillators.length;
  for (let i = 0; i < 20; i++) audio.event({ type: "sound", cue: "warning" }, s);
  assert.equal(probe.oscillators.length, count, "simultaneous pressure/power/body warnings do not stack");
  audio.event({ type: "sound", cue: "warning", origin: { x: 20, y: 0, z: 14 } }, s);
  assert.equal(probe.oscillators.length, count + 1, "real threat and centred warning remain distinct");
  audio.event({ type: "sound", cue: "craft" }, s);
  assert.equal(probe.oscillators.length, count + 1, "action cannot mask an active alarm");
  audio.update(s, true);
  assert.ok(probe.gains[1]!.targets.at(-1)! < 0.018, "ambience ducks for warning cues");
  audio.update(s, false);
  assert.ok(probe.oscillators.slice(ambienceCount).every((o) => o.stops.includes(undefined)));
  assert.equal(probe.gains[1]!.targets.at(-1), 0, "pause silences ambience");
  audio.event({ type: "sound", cue: "craft" }, s);
  assert.equal(probe.oscillators.length, count + 2, "deliberate paused-panel command still has feedback");
  const feedback = probe.oscillators.at(-1)!;
  const disconnected = probe.disconnected;
  feedback.onended?.();
  assert.equal(probe.disconnected, disconnected + 3, "finished transient graph is released");
});

test("activation, mute, volume, pause and disposal keep one owned audio graph", (t) => {
  const { audio, probe } = soundFixture(t);
  const s = createGame();
  audio.activate();
  assert.equal(probe.resumed, 1, "running context is not resumed on every command");
  audio.settings = { volume: 0.25, muted: false, subtitles: false };
  audio.update(s, true);
  assert.equal(probe.gains[0]!.targets.at(-1), 0.25);
  audio.settings.muted = true;
  audio.update(s, true);
  assert.equal(probe.gains[0]!.targets.at(-1), 0);
  const count = probe.oscillators.length;
  audio.event({ type: "sound", cue: "damage" }, s);
  assert.equal(probe.oscillators.length, count, "muted events allocate no transient voices");
  audio.settings.muted = false;
  audio.settings.volume = 0;
  audio.event({ type: "sound", cue: "warning" }, s);
  assert.equal(probe.oscillators.length, count);
  audio.settings.volume = 0.7;
  audio.event({ type: "sound", cue: "damage" }, s);
  assert.equal(probe.gains[0]!.targets.at(-1), 0.7, "events apply the latest gain before starting");
  assert.equal(AudioProbe.pans.at(-1)!.value, 0, "damage without origin is also centred");
  audio.dispose();
  const disconnected = probe.disconnected;
  audio.dispose();
  audio.activate();
  audio.event({ type: "sound", cue: "warning" }, s);
  assert.equal(probe.closed, 1);
  assert.equal(probe.disconnected, disconnected, "disposal is idempotent and cannot reactivate");
});

test("impact equipment thud stays centred even with an accidental origin and coalesces bursts", (t) => {
  const { audio, probe } = soundFixture(t);
  const s = createGame(); audio.update(s, true);
  audio.event({ type: "sound", cue: "impact", origin: { x: 90, y: 0, z: 0 } }, s);
  assert.equal(AudioProbe.pans.at(-1)!.value, 0);
  const count = probe.oscillators.length;
  for (let i = 0; i < 30; i++) audio.event({ type: "sound", cue: "impact" }, s);
  assert.equal(probe.oscillators.length, count);
  audio.update(s, false);
  assert.ok(probe.oscillators.at(-1)!.stops.includes(undefined));
});
