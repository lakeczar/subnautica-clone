/** Regressions for the S6 Sol R2 findings (docs/build/reviews/S6-SOL-XHIGH-R2.md). */
import test from "node:test";
import assert from "node:assert/strict";
import { AudioEngine } from "../src/audio/engine.js";
import { CueMapper } from "../src/audio/mapping.js";
import { sceneFromState, type AudioScene } from "../src/audio/scene.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { updateSurvival } from "../src/sim/survival.js";
import type { GameEvent, GameState } from "../src/sim/types.js";
import { FakeContext, asContext, type FakeParam } from "./audio-fake-context.js";

const reef = () => "refuge_reef" as const;
const sceneOf = (s: GameState, active = true): AudioScene => sceneFromState(s, active, reef);

test("S6-06: ten minutes of ambient grains never orphan a graph; pause and reset return to the layer baseline", () => {
  const ctx = new FakeContext(), e = new AudioEngine(asContext(ctx));
  const s = createGame(); completeOpening(s);
  s.player.mode = "swimming"; s.player.pose.position = { x: -17, y: -30, z: -8 };
  const step = (active: boolean) => { ctx.currentTime += 1 / 60; e.update(sceneOf(s, active)); };
  e.update(sceneOf(s));
  const baseline = e.stats().liveNodes - e.stats().voiceNodes;
  let stolen = 0;
  for (let f = 0; f < 10 * 60 * 60; f++) {
    step(true);
    if (f % 60 === 0) {
      const st = e.stats();
      assert.equal(st.orphans, 0, `orphaned graph at ${ctx.currentTime.toFixed(2)} s`);
      stolen = st.stolen;
    }
  }
  assert.ok(stolen > 0, "the run really saturated the grain pool (R2 first orphan at 66.8 s)");
  for (let f = 0; f < 5 * 60; f++) step(false);
  e.reset();
  for (let f = 0; f < 60; f++) step(false);
  const end = e.stats();
  assert.equal(end.voices, 0);
  assert.equal(end.voiceNodes, 0, "every grain graph released");
  assert.equal(end.orphans, 0);
  assert.equal(end.liveNodes, baseline, "back to the continuous-layer baseline");
  assert.equal(end.liveNodes, ctx.live, "engine accounting matches the context");
  e.dispose();
});

test("S6-07: an explicit cause spends its notice; the next unannotated warning keeps its own cause", () => {
  const s = createGame(); completeOpening(s);
  s.player.mode = "swimming"; s.player.pose.position = { x: -17, y: -100, z: -8 };
  s.player.vitals.oxygen = 35.001; s.tick = 300;
  const batch: GameEvent[] = [];
  updateSurvival(s, batch);
  const first = batch.findIndex(e => e.type === "sound" && e.cue === "warning");
  const mixed = batch.map((e, i) => (i === first ? { ...e, cause: "oxygen" } as unknown as GameEvent : e));
  const cues = (b: GameEvent[]) => new CueMapper().events(b, s, sceneOf(s)).map(r => r.cue).filter(c => c.startsWith("alert."));
  assert.deepEqual(cues(mixed), ["alert.oxygen", "alert.pressure"]);
  assert.deepEqual(cues(batch), ["alert.oxygen", "alert.pressure"], "unannotated");
});

test("S6-07: a notice from one batch never names a warning in a later batch", () => {
  const s = createGame(); completeOpening(s);
  s.player.mode = "swimming"; s.player.pose.position = { x: -17, y: -100, z: -8 };
  const m = new CueMapper();
  m.events([{ type: "notice", channel: "hazard", context: "oxygen", message: "Oxygen 35%.", error: true }], s, sceneOf(s));
  const later = m.events([{ type: "sound", cue: "warning" }], s, sceneOf(s)).map(r => r.cue);
  assert.deepEqual(later, ["alert.pressure"], "the stale oxygen notice is not reused");
});

test("S6-08: leaving a pursuit or pausing cancels the pulse and brings its gain to zero", () => {
  const ctx = new FakeContext(), e = new AudioEngine(asContext(ctx));
  const s = createGame(); completeOpening(s);
  s.player.mode = "swimming"; s.player.pose.position = { x: -17, y: -30, z: -8 };
  const pursuit = (active: boolean): AudioScene => ({ ...sceneOf(s, active), threat: { mode: "pursue", interest: 4, pan: 0, distance: 10, dir: "ahead" } });
  for (let f = 0; f < 180; f++) { ctx.currentTime += 1 / 60; e.update(pursuit(true)); }
  const pulse = ctx.created.filter(n => n.kind === "gain").map(n => (n as unknown as { gain: FakeParam }).gain)
    .find(g => g.targets.includes(0.0001))!;
  assert.ok(pulse, "pulse gain found");
  const cancels = pulse.cancelled;
  ctx.currentTime += 1 / 60; e.update(pursuit(false));
  assert.equal(pulse.cancelled, cancels + 1, "scheduled beats are cancelled");
  assert.equal(pulse.last, 0, "and the floor is replaced by a ramp to zero");
  e.dispose();
});
