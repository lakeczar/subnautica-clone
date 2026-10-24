/** Regressions for the S6 Sol R1 findings (docs/build/reviews/S6-SOL-XHIGH-R1.md). */
import test from "node:test";
import assert from "node:assert/strict";
import { CUES, CUE_IDS, cueDuration, START_LEAD } from "../src/audio/cues.js";
import { AMBIENCE_HOLD, AudioEngine, FADING_SLOT_LIMIT } from "../src/audio/engine.js";
import { CueMapper } from "../src/audio/mapping.js";
import { relate, sceneFromState, type AudioScene } from "../src/audio/scene.js";
import { NoiseBank, renderSound, rng } from "../src/audio/synth.js";
import { SiltwakeAudio } from "../src/audio/director.js";
import type { Caption } from "../src/audio/captions.js";
import type { RegionId } from "../src/content/registry.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { updateSurvival, updateThreat } from "../src/sim/survival.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameEvent, GameState } from "../src/sim/types.js";
import { FakeContext, asContext, type FakeParam } from "./audio-fake-context.js";

const reef = () => "refuge_reef" as const;
const sceneOf = (s: GameState | null, active = true): AudioScene => sceneFromState(s, active, reef);
const gainOf = (n: unknown): FakeParam => (n as { gain: FakeParam }).gain;

/** The reviewer's diver: opening complete, swimming at 100 m (beyond the 60 m suit), survival tick 300. */
function deepDiver(oxygen: number): GameState {
  const s = createGame();
  completeOpening(s);
  s.player.mode = "swimming";
  s.player.pose.position = { x: -17, y: -100, z: -8 };
  s.player.vitals.oxygen = oxygen;
  s.tick = 300;
  return s;
}
const alarms = (rs: { cue: string }[]) => rs.map(r => r.cue).filter(c => c.startsWith("alert."));

test("S6-02: a lone pressure warning stays pressure even while oxygen is low", () => {
  const s = deepDiver(30), batch: GameEvent[] = [];
  updateSurvival(s, batch);
  assert.equal(batch.filter(e => e.type === "sound" && e.cue === "warning").length, 1, "producer emits one warning");
  assert.deepEqual(alarms(new CueMapper().events(batch, s, sceneOf(s))), ["alert.pressure"]);
  const perEvent = new CueMapper();
  assert.deepEqual(alarms(batch.flatMap(e => perEvent.event(e, s, sceneOf(s)))), ["alert.pressure"]);
});

test("S6-02: an oxygen threshold and a pressure warning in one batch keep both causes and both captions", () => {
  const s = deepDiver(35.001), batch: GameEvent[] = [];
  updateSurvival(s, batch);
  assert.equal(batch.filter(e => e.type === "sound" && e.cue === "warning").length, 2);
  assert.deepEqual(alarms(new CueMapper().events(batch, s, sceneOf(s))), ["alert.oxygen", "alert.pressure"]);
  const captions: Caption[] = [];
  const ctx = new FakeContext();
  const audio = new SiltwakeAudio({ createContext: () => asContext(ctx), regionAt: reef, onCaption: c => captions.push(c), clock: () => 0 });
  audio.activate();
  audio.update(s, true);
  audio.events(batch, s);
  assert.deepEqual(captions.map(c => c.cue), ["alert.oxygen", "alert.pressure"]);
  assert.equal(audio.stats()!.pending, 1, "the second body alarm waits its turn instead of being merged away");
  ctx.currentTime += 2;
  audio.update(s, true);
  assert.equal(audio.stats()!.pending, 0);
  assert.equal(audio.stats()!.bus.alert, 1, "and then sounds");
  audio.dispose();
});

test("S6-02: an explicit cause on the warning event wins (proposed contract)", () => {
  const s = deepDiver(80), m = new CueMapper();
  const e = { type: "sound", cue: "warning", cause: "power" } as unknown as GameEvent;
  assert.deepEqual(alarms(m.event(e, s, sceneOf(s))), ["alert.power"]);
});

function biteBatch(): { s: GameState; batch: GameEvent[] } {
  const empty = createWorldQueries([], () => -250);
  const s = createGame(); s.opening.phase = 4; s.player.mode = "swimming";
  s.player.pose.position = { x: 132, y: -110, z: -112 };
  Object.assign(s.world.threat, { mode: "pursue", interest: 12, modeSeconds: 0, position: { x: 160, y: -110, z: -112 } });
  for (let i = 0; i < 2400; i++) {
    s.tick++;
    const batch: GameEvent[] = [];
    updateThreat(s, 1, batch, empty);
    if (batch.some(e => e.type === "threat-damage") && batch.some(e => e.type === "sound" && e.cue === "damage")) return { s, batch };
  }
  throw new Error("no real bite batch with both injury events");
}

test("S6-05: a real bite batch yields one directional hit, in batch and per-event order", () => {
  const { s, batch } = biteBatch();
  const sound = batch.find((e): e is Extract<GameEvent, { type: "sound" }> => e.type === "sound" && e.cue === "damage")!;
  assert.ok(batch.indexOf(sound) > batch.findIndex(e => e.type === "threat-damage"), "producer order: threat-damage first");
  const expected = relate(sceneOf(s).listener, sound.origin!);
  const hits = new CueMapper().events(batch, s, sceneOf(s)).filter(r => r.cue === "hit.damage");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.pan, expected.pan);
  assert.equal(hits[0]!.dir, expected.dir);
  assert.notEqual(hits[0]!.pan, 0);
  const m = new CueMapper();
  const perEvent = batch.flatMap(e => m.event(e, s, sceneOf(s))).filter(r => r.cue === "hit.damage");
  assert.equal(perEvent.length, 1, "the later copy maps to nothing");
  assert.ok(Math.sign(perEvent[0]!.pan) === Math.sign(expected.pan), "the first copy already carries the hunter's bearing");
  // Through the engine: one alert voice, panned.
  const ctx = new FakeContext();
  const audio = new SiltwakeAudio({ createContext: () => asContext(ctx), regionAt: reef, clock: () => 0 });
  audio.activate();
  audio.update(s, true);
  audio.events(batch, s);
  assert.equal(audio.stats()!.bus.alert, 1);
  assert.ok(Math.sign(ctx.panners().at(-1)!.pan.value) === Math.sign(expected.pan));
  audio.dispose();
});

test("S6-03: allocation lengths equal the built graph's last source stop for every cue", () => {
  const ctx = new FakeContext(), bank = new NoiseBank(asContext(ctx));
  for (const id of CUE_IDS) {
    const b = renderSound(asContext(ctx), CUES[id].sound, START_LEAD, asContext(ctx).createGain(), bank, rng(1));
    assert.ok(Math.abs(b.end - cueDuration(CUES[id])) < 1e-9, `${id}: graph ${b.end} vs allocation ${cueDuration(CUES[id])}`);
  }
  assert.ok(Math.abs(cueDuration(CUES["music.ending"]) - 38.23) < 0.01, "ending lasts 38.2 s");
});

test("S6-03: overlapping phrases, pause and reset never leave an unowned graph sounding", () => {
  const ctx = new FakeContext(), e = new AudioEngine(asContext(ctx));
  const s = createGame(); completeOpening(s);
  const at = (t: number, active = true) => { ctx.currentTime = t; e.update(sceneOf(s, active)); };
  const play = (cue: "music.blueprint" | "music.discovery" | "music.ending") => e.play({ cue, intensity: 1, pan: 0, distance: 0, dir: null });
  at(0);
  assert.ok(play("music.blueprint").play);
  at(2.3);
  assert.equal(e.stats().bus.music, 1, "blueprint is still owned at 2.3 s (its graph ends at 3.43 s)");
  const discovery = play("music.discovery");
  assert.ok(discovery.play && discovery.steal.length === 1, "discovery must take the music voice from blueprint");
  for (let t = 2.3; t < 8; t += 1 / 60) { at(t); assert.ok(e.stats().unownedTail <= 0.05, `unowned tail ${e.stats().unownedTail} at ${t}`); }
  at(10); assert.ok(play("music.ending").play);
  at(12, false);
  assert.equal(e.stats().voices, 0, "pause mid-phrase stops it");
  assert.ok(e.stats().unownedTail <= 0.05);
  at(13); assert.ok(play("music.discovery").play, "the paused phrase no longer holds the music voice");
  at(14);
  e.reset();
  assert.equal(e.stats().voices, 0);
  assert.ok(e.stats().unownedTail <= 0.05);
  assert.ok(play("music.ending").play, "reset clears cooldown history");
  e.dispose();
});

test("S6-01: every reverb input passes through a bus control that pause, ducking and solos govern", () => {
  const ctx = new FakeContext(), e = new AudioEngine(asContext(ctx));
  const s = createGame(); completeOpening(s);
  s.player.mode = "swimming"; s.player.pose.position = { x: -17, y: -30, z: -8 };
  e.setVolume(1);
  e.update(sceneOf(s));
  for (const cue of CUE_IDS) { ctx.currentTime += 0.01; e.play({ cue, intensity: 1, pan: 0, distance: 5, dir: null }); }
  for (let i = 0; i < 400; i++) { ctx.currentTime += 0.05; e.update(sceneOf(s)); }
  const conv = ctx.created.find(n => n.kind === "convolver")!;
  const reverbIn = ctx.inbound(conv);
  assert.equal(reverbIn.length, 1);
  const controls = ctx.inbound(reverbIn[0]);
  assert.equal(controls.length, 5, "only the five bus wet controls feed the reverb");
  const fixedEnd = ctx.created.indexOf(conv);
  assert.ok(controls.every(c => ctx.created.indexOf(c) < fixedEnd), "and they belong to the fixed bus graph, not voices or layers");
  const ret = conv.targets[0];
  e.update(sceneOf(s, false));
  assert.equal(gainOf(ret).last, 0, "pause closes the room return");
  assert.equal(controls.filter(c => gainOf(c).last === 0).length, 2, "and the ambience and vehicle wet paths");
  for (const b of ["ambience", "vehicle", "sfx", "alert", "music"] as const) e.setBusTrim(b, 0);
  e.update(sceneOf(s));
  assert.ok(controls.every(c => gainOf(c).value === 0 && gainOf(c).last === 0), "solos mute wet paths too");
  e.dispose();
});

test("S6-04: boundary chatter holds one ambience slot; slow alternation reuses the fading one", () => {
  let region: RegionId = "refuge_reef";
  const ctx = new FakeContext(), e = new AudioEngine(asContext(ctx));
  const s = createGame(); completeOpening(s);
  s.player.mode = "swimming"; s.player.pose.position = { x: -17, y: -30, z: -8 };
  const scene = () => sceneFromState(s, true, () => region);
  e.update(scene());
  for (let i = 0; i < 4 * 60; i++) { ctx.currentTime += 1 / 60; e.update(scene()); }
  const layers = () => e.stats().liveNodes - e.stats().voiceNodes;
  const settled = layers();
  let peak = 0;
  for (let i = 0; i < 3 * 60; i++) {
    region = i % 2 ? "suspended_garden" : "refuge_reef";
    ctx.currentTime += 1 / 60; e.update(scene());
    peak = Math.max(peak, layers());
    assert.equal(e.stats().ambience, "refuge_reef", "60 Hz chatter never crosses the hold");
  }
  assert.equal(peak, settled, "chatter adds no continuous-layer nodes");
  const created = ctx.created.length;
  for (let i = 0; i < 12; i++) {
    region = i % 2 ? "refuge_reef" : "suspended_garden";
    for (let f = 0; f < 60; f++) { ctx.currentTime += 1 / 60; e.update(scene()); }
    assert.equal(e.stats().ambience, region);
    assert.ok(e.stats().fadingSlots <= FADING_SLOT_LIMIT);
  }
  const slotNodes = ctx.created.length - created;
  assert.ok(slotNodes < 2 * 30 + 12 * 40, `alternating revives fading slots: ${slotNodes} nodes created`);
  const regions: RegionId[] = ["silt_basin", "thermal_rift", "brine_divide", "deep_district", "island_chain", "refuge_reef", "suspended_garden"];
  for (const r of regions) {
    region = r;
    for (let f = 0; f < Math.ceil(AMBIENCE_HOLD * 60) + 2; f++) { ctx.currentTime += 1 / 60; e.update(scene()); }
    assert.ok(e.stats().fadingSlots <= FADING_SLOT_LIMIT, "fast tours cap concurrent transition graphs");
  }
  e.dispose();
});

test("nullable regionAt keeps the last known region outside the authored world", () => {
  const s = createGame(); completeOpening(s);
  assert.equal(sceneFromState(s, true, () => null).region, "refuge_reef");
  assert.equal(sceneFromState(s, true, () => null, "silt_basin").region, "silt_basin");
  s.player.mode = "swimming"; s.player.pose.position = { x: -17, y: -30, z: -8 };
  let inside: RegionId | null = "thermal_rift";
  const audio = new SiltwakeAudio({ createContext: () => asContext(new FakeContext()), regionAt: () => inside, clock: () => 0 });
  audio.activate();
  audio.update(s, true);
  inside = null;
  audio.update(s, true);
  for (let i = 0; i < 3; i++) audio.update(s, true);
  assert.equal(audio.stats()!.ambience, "thermal_rift", "leaving the authored world does not switch to a default region");
  audio.dispose();
});
