import test from "node:test";
import assert from "node:assert/strict";
import { HULLS, REGIONS, type HullId, type RegionId } from "../src/content/registry.js";
import { CUES, CUE_IDS, cueDuration } from "../src/audio/cues.js";
import { CueMapper, HOMECOMING_AFTER } from "../src/audio/mapping.js";
import { HULL_LAYERS, REGION_AMBIENCE } from "../src/audio/profiles.js";
import { sceneFromState, type RegionResolver } from "../src/audio/scene.js";
import { CaptionGate } from "../src/audio/captions.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { updateSurvival, updateThreat } from "../src/sim/survival.js";
import type { GameEvent, GameState } from "../src/sim/types.js";

const reef: RegionResolver = () => "refuge_reef";
const sceneOf = (s: GameState | null, regionAt = reef) => sceneFromState(s, true, regionAt);
const SIM_CUES = ["collect", "craft", "warning", "refuge", "damage", "impact", "scan", "opening", "recovery"] as const;

test("catalog covers every sim cue, region and hull, and every essential cue has a caption", () => {
  const m = new CueMapper(), s = createGame();
  for (const cue of SIM_CUES) {
    const out = m.event({ type: "sound", cue }, s, sceneOf(s));
    assert.equal(out.length, 1, cue);
    assert.ok(CUES[out[0]!.cue], `${cue} → ${out[0]!.cue}`);
  }
  for (const r of Object.keys(REGIONS) as RegionId[]) assert.ok(REGION_AMBIENCE[r], r);
  for (const h of Object.keys(HULLS) as HullId[]) assert.ok(HULL_LAYERS[h], h);
  for (const id of CUE_IDS) {
    const d = cueDuration(CUES[id]);
    assert.ok(d > 0.03 && d < 60, `${id} lasts ${d}s`);
    if (CUES[id].essential) assert.ok(CUES[id].caption, `${id} is essential but has no caption`);
    assert.ok(CUES[id].level <= -10, `${id} peaks above the -10 dBFS cue ceiling`);
  }
});

test("body and equipment alarms stay centred and name their cause; a threat call pans to its detached origin", () => {
  const m = new CueMapper();
  const s = createGame();
  completeOpening(s);
  s.player.mode = "swimming";
  s.player.pose.position = { x: 123, y: -110, z: -105 };
  s.player.vitals.oxygen = 35.001;
  s.world.threat.position = { x: 145, y: -110, z: -105 };
  m.observe(s, sceneOf(s), 0);
  const body: GameEvent[] = [];
  updateSurvival(s, body);
  const mapped = body.flatMap(e => m.event(e, s, sceneOf(s)));
  const alarm = mapped.find(r => r.cue.startsWith("alert."));
  assert.equal(alarm?.cue, "alert.oxygen", "the oxygen notice names the alarm beside it");
  assert.equal(alarm.pan, 0, "low air must not imply the hunter's bearing");
  assert.equal(alarm.dir, null);

  s.world.threat.interest = 1;
  const threat: GameEvent[] = [];
  updateThreat(s, 1, threat);
  const call = threat.find(e => e.type === "sound" && e.cue === "warning");
  assert.ok(call);
  s.world.threat.position.x = 90; // the queued event keeps the actual call position
  const right = m.event(call, s, sceneOf(s))[0]!;
  assert.equal(right.cue, "alert.threat-call");
  assert.ok(right.pan > 0);
  assert.equal(right.dir, "right");
  s.player.pose.yaw = Math.PI;
  const left = m.event(call, s, sceneOf(s))[0]!;
  assert.ok(left.pan < 0);
  assert.equal(left.dir, "left");
  const gate = new CaptionGate();
  assert.equal(gate.caption(left, 0)?.text, "[Paired hunter calls, left]");
  assert.equal(gate.caption(left, 0.5), null, "repeated captions collapse");
});

test("two simultaneous hull alarms stay distinct; a third cause falls back to the generic tone", () => {
  const m = new CueMapper(), s = createGame();
  completeOpening(s);
  const v = makeVehicle("alarm-dart", "dart", { x: 123, y: -175, z: -105 }, "alarm-hold");
  v.charge = 20;
  s.fleet.vehicles.push(v);
  s.player.controlledVehicleId = v.id;
  s.player.mode = "piloting";
  s.player.pose.position = { ...v.pose.position };
  m.observe(s, sceneOf(s), 0);
  const warning: GameEvent = { type: "sound", cue: "warning" };
  const cues = [warning, warning, warning].flatMap(e => m.event(e, s, sceneOf(s))).map(r => r.cue);
  assert.deepEqual(cues, ["alert.hull-stress", "alert.power", "alert.body"]);
  m.observe(s, sceneOf(s), 1);
  assert.equal(m.event(warning, s, sceneOf(s))[0]!.cue, "alert.hull-stress", "causes reset each frame");
});

test("impact thuds stay centred even with an origin; hunter damage pans", () => {
  const m = new CueMapper(), s = createGame();
  const thud = m.event({ type: "sound", cue: "impact", origin: { x: 90, y: 0, z: 0 } }, s, sceneOf(s))[0]!;
  assert.equal(thud.cue, "hit.impact");
  assert.equal(thud.pan, 0);
  const bite = m.event({ type: "sound", cue: "damage", origin: { x: 60, y: 0, z: 14 } }, s, sceneOf(s))[0]!;
  assert.ok(bite.pan > 0);
  assert.deepEqual(m.event({ type: "impact", speed: 3, hullLoss: 0, origin: { x: 0, y: 0, z: 0 } }, s, sceneOf(s)), [], "no loss, no thud");
});

test("state changes map to one-off cues without replaying a loaded save", () => {
  const m = new CueMapper(), s = createGame();
  completeOpening(s);
  discover(s, "C01");
  assert.deepEqual(m.observe(s, sceneOf(s), 0), [], "baseline: existing evidence does not play");
  discover(s, "C02");
  assert.deepEqual(m.observe(s, sceneOf(s), 1).map(r => r.cue), ["music.discovery"]);
  const v = makeVehicle("lost", "dart", { x: 0, y: -20, z: 0 }, "lost-hold");
  s.fleet.vehicles.push(v);
  m.observe(s, sceneOf(s), 2);
  v.disabled = true;
  assert.deepEqual(m.observe(s, sceneOf(s), 3).map(r => r.cue), ["hull.failure"]);
  // First visit to a new region plays the arrival phrase once per session.
  const canopy: RegionResolver = () => "suspended_garden";
  assert.ok(m.observe(s, sceneOf(s, canopy), 4).some(r => r.cue === "music.arrival"));
  m.observe(s, sceneOf(s), 5);
  assert.ok(!m.observe(s, sceneOf(s, canopy), 6).some(r => r.cue === "music.arrival"));
  m.reset();
  assert.deepEqual(m.observe(s, sceneOf(s, canopy), 7), [], "reset re-baselines");
});

test("returning to refuge chimes; a long expedition earns the homecoming phrase", () => {
  const m = new CueMapper(), s = createGame();
  completeOpening(s);
  const open = { ...sceneOf(s), shelter: "open" as const }, refuge = { ...sceneOf(s), shelter: "refuge" as const };
  m.observe(s, refuge, 0);
  m.observe(s, open, 1);
  assert.deepEqual(m.observe(s, refuge, 20).map(r => r.cue), ["refuge.enter"]);
  m.observe(s, open, 21);
  assert.deepEqual(m.observe(s, refuge, 21 + HOMECOMING_AFTER).map(r => r.cue), ["music.homecoming"]);
});

test("boarding, leaving and interiors have transitions; panels and refusals give soft feedback", () => {
  const m = new CueMapper(), s = createGame();
  completeOpening(s);
  s.player.mode = "swimming";
  m.observe(s, sceneOf(s), 0);
  const step = (e: GameEvent) => m.event(e, s, sceneOf(s)).map(r => r.cue);
  assert.deepEqual(step({ type: "movement-mode-changed", mode: "piloting" }), ["transition.board"]);
  assert.deepEqual(step({ type: "movement-mode-changed", mode: "interior" }), ["transition.interior"]);
  assert.deepEqual(step({ type: "movement-mode-changed", mode: "piloting" }), ["transition.interior"]);
  assert.deepEqual(step({ type: "movement-mode-changed", mode: "swimming" }), ["transition.disembark"]);
  assert.deepEqual(step({ type: "interaction-panel", panel: "craft", targetId: "pod" }), ["action.panel"]);
  assert.deepEqual(step({ type: "notice", channel: "action", message: "No.", error: true }), ["action.refused"]);
  assert.deepEqual(step({ type: "notice", channel: "hazard", context: "threat", message: "Calls.", error: true }), [], "hazards speak through alarms");
});

test("the scene reports hull stress, boost and Hush listening inputs from state", () => {
  const s = createGame();
  completeOpening(s);
  const v = makeVehicle("d", "dart", { x: 0, y: -300, z: 0 }, "h");
  v.velocity = { x: 0, y: 0, z: -11 };
  s.fleet.vehicles.push(v);
  s.player.controlledVehicleId = v.id;
  s.player.mode = "piloting";
  s.player.pose.position = { ...v.pose.position };
  const scene = sceneOf(s);
  assert.equal(scene.hull, "dart");
  assert.equal(scene.throttle, 1);
  assert.equal(scene.boost, 1);
  assert.ok(scene.hullStress > 0.85, `stress ${scene.hullStress}`);
  assert.equal(scene.medium, "water");
  assert.equal(sceneFromState(null, true, reef).active, false);
});
