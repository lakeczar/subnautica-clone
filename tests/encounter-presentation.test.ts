import test from "node:test";
import assert from "node:assert/strict";
import { EncounterPresentation, type PresentedNotice } from "../src/ui/notices.js";
import { createGame, eyeHeight } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";

function encounter() {
  const state = createGame(); completeOpening(state);
  state.player.mode = "swimming";
  state.player.pose.position = { x: 100, y: -30, z: -100 };
  state.player.pose.yaw = state.player.pose.pitch = 0;
  return state;
}

test("notice priority drops suppressed results, keeps body alarms distinct, and expires wall-clock surfaces without steps", () => {
  const p = new EncounterPresentation(), s = encounter();
  p.observe(s, false);
  p.notify("collected", false, {}, 0);
  p.notify("refused", true, {}, 1);
  p.notify("collected later", false, {}, 2);
  assert.equal(p.central?.message, "refused");
  s.player.vitals.oxygen = 20;
  p.notify("oxygen", true, { channel: "hazard", context: "oxygen" }, 3);
  p.observe(s, true);
  assert.equal(p.central?.channel, "hazard");
  p.notify("saved", false, { channel: "persistence" }, 4);
  p.notify("another action", true, {}, 5);
  assert.equal(p.central?.message, "oxygen");
  assert.equal(p.status?.message, "saved");
  p.notify("storage refused", true, { channel: "persistence" }, 6);
  p.notify("body warning", true, { channel: "hazard", context: "food" }, 7);
  assert.equal(p.central?.message, "storage refused");
  p.expire(3004);
  assert.equal(p.status, null);
  assert.equal(p.central?.message, "storage refused");
  p.expire(12005); assert.ok(p.central);
  p.expire(12006); assert.equal(p.central, null);
  s.player.vitals.oxygen = 100; p.observe(s, false);
  assert.equal(p.central, null, "no queued action or hazard replays");
});

test("action lifetime advances only on completed fixed steps; errors and status still clear while paused", () => {
  const p = new EncounterPresentation(), s = encounter();
  p.observe(s, false); p.notify("gathered", false, {}, 0);
  for (let i = 0; i < 1000; i++) p.observe(s, false);
  p.expire(60000); assert.equal(p.central?.message, "gathered");
  for (let i = 0; i < 239; i++) p.step(s, false);
  assert.ok(p.central); p.step(s, false); assert.equal(p.central, null);
  p.notify("invalid import", true, { channel: "system" }, 60000);
  p.expire(71999); assert.equal((p.central as PresentedNotice | null)?.channel, "system");
  p.expire(72000); assert.equal(p.central, null);
});

test("paused import validation remains readable over the hidden gameplay hazard without claiming persistence failure", () => {
  const p = new EncounterPresentation(), s = encounter(); s.world.threat.mode = "warn";
  p.observe(s, true); p.notify("calls", true, { channel: "hazard", context: "threat" }, 0);
  p.setMenu(true);
  p.notify("invalid import; progress unchanged", true, { channel: "system" }, 1);
  for (let i = 0; i < 100; i++) p.observe(s, true);
  assert.equal(p.central?.message, "invalid import; progress unchanged");
  assert.equal((p.central as PresentedNotice | null)?.channel, "system");
  p.notify("saving failed", true, { channel: "persistence" }, 2);
  p.notify("another invalid import", true, { channel: "system" }, 3);
  assert.equal(p.central?.message, "saving failed");
});

test("threat release is transition-bound, immediate and replaceable; refuge and real air changes invalidate notices", () => {
  const p = new EncounterPresentation(), s = encounter(); s.world.threat.mode = "warn";
  p.observe(s, true); p.notify("warning", true, { channel: "hazard", context: "threat" }, 0);
  s.world.threat.mode = "disengage"; p.observe(s, false);
  assert.equal(p.central?.message, "Calls fading");
  for (let i = 0; i < 149; i++) p.step(s, false);
  assert.ok(p.central); p.step(s, false); assert.equal(p.central, null);
  const loaded = new EncounterPresentation(); loaded.observe(s, false);
  assert.equal(loaded.central, null, "loaded disengage does not invent a transition");
  s.world.threat.mode = "pursue"; p.observe(s, true);
  p.notify("pursuing", true, { channel: "hazard", context: "threat" }, 1);
  s.world.threat.mode = "disengage"; p.observe(s, false);
  s.world.threat.mode = "warn"; p.observe(s, true);
  assert.equal(p.central, null, "new warning immediately removes release");
  p.notify("warning", true, { channel: "hazard", context: "threat" }, 2);
  s.player.pose.position = { x: 0, y: 0.6, z: 14 }; p.observe(s, false);
  assert.equal(p.central, null);
  s.player.pose.position = { x: 100, y: -20, z: -100 }; s.player.vitals.oxygen = 20;
  p.notify("oxygen", true, { channel: "hazard", context: "oxygen" }, 3); p.observe(s, true);
  s.player.pose.position.y = -0.8; p.observe(s, false); assert.equal(p.central, null);
});

test("call directions use a detached emission and current listener yaw/pitch, including audible on-screen and vertical sectors", () => {
  const p = new EncounterPresentation(), s = encounter(); s.world.threat.mode = "warn";
  const at = { ...s.player.pose.position, y: s.player.pose.position.y + eyeHeight(s) };
  const origins = [
    ["ahead", { ...at, z: at.z - 20 }], ["behind", { ...at, z: at.z + 20 }],
    ["left", { ...at, x: at.x - 20 }], ["right", { ...at, x: at.x + 20 }],
    ["above", { ...at, y: at.y + 20 }], ["below", { ...at, y: at.y - 20 }],
  ] as const;
  for (const [sector, origin] of origins) { p.threatCall(origin, s); assert.equal(p.callDirection(s)?.sector, sector); }
  const origin = { ...at, z: at.z - 20 }; p.threatCall(origin, s);
  origin.x += 100; s.world.threat.position.x += 500;
  assert.equal(p.callDirection(s)?.sector, "ahead", "neither source mutation nor live animal position changes the emission");
  s.player.pose.yaw = Math.PI / 2; assert.equal(p.callDirection(s)?.sector, "left");
  s.player.pose.yaw = 0; s.player.pose.position.x += 40;
  assert.equal(p.callDirection(s)?.sector, "ahead-left", "listener translation changes bearing to the fixed origin");
  s.player.pose.position.x -= 40; s.player.pose.pitch = Math.PI / 2;
  assert.equal(p.callDirection(s)?.sector, "below", "camera pitch changes acoustic direction");
});

test("call lifetime freezes without steps, new emissions replace, and context/reset/invalid origins never retain tracking", () => {
  const p = new EncounterPresentation(), s = encounter(); s.world.threat.mode = "pursue";
  const origin = { x: 110, y: -30, z: -100 };
  p.threatCall(origin, s); p.expire(1e9); assert.ok(p.callDirection(s));
  for (let i = 0; i < 179; i++) p.step(s, true);
  assert.ok(p.callDirection(s)); p.step(s, true); assert.equal(p.callDirection(s), null);
  p.threatCall(origin, s); p.reset(); assert.equal(p.callDirection(s), null);
  p.threatCall({ ...origin, x: NaN }, s); assert.equal(p.callDirection(s), null);
  p.threatCall(origin, s); s.world.threat.mode = "disengage"; p.observe(s, false);
  assert.equal(p.callDirection(s), null); s.world.threat.mode = "warn"; p.observe(s, true);
  assert.equal(p.callDirection(s), null, "a later threat cannot revive an old call");
  p.threatCall(origin, s); s.player.pose.position = { x: 0, y: 0.6, z: 14 }; p.observe(s, false);
  s.player.pose.position = { x: 100, y: -30, z: -100 }; p.observe(s, true);
  assert.equal(p.callDirection(s), null, "refuge entry clears the origin");
});
