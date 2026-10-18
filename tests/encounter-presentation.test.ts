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

test("results replace independently while alert priority and wall expiry retain persistence safety", () => {
  const p = new EncounterPresentation(), s = encounter();
  p.observe(s);
  p.notify("collected", false, {}, 0);
  p.notify("refused", true, {}, 1);
  p.notify("collected later", false, {}, 2);
  assert.equal(p.result?.message, "collected later");
  assert.equal(p.central, null);
  s.player.vitals.oxygen = 20;
  p.notify("oxygen", true, { channel: "hazard", context: "oxygen" }, 3);
  p.observe(s);
  assert.equal((p.central as PresentedNotice | null)?.channel, "hazard");
  p.notify("saved", false, { channel: "persistence" }, 4);
  p.notify("another action", true, {}, 5);
  assert.equal(p.result?.message, "another action");
  assert.equal((p.central as PresentedNotice | null)?.message, "oxygen");
  assert.equal(p.status?.message, "saved");
  p.notify("storage refused", true, { channel: "persistence" }, 6);
  p.notify("body warning", true, { channel: "hazard", context: "food" }, 7);
  assert.equal((p.central as PresentedNotice | null)?.message, "storage refused");
  p.expire(3004);
  assert.equal(p.status, null);
  assert.equal((p.central as PresentedNotice | null)?.message, "storage refused");
  p.expire(12005); assert.ok(p.central);
  p.expire(12006); assert.equal(p.central, null);
  s.player.vitals.oxygen = 100; p.observe(s);
  assert.equal(p.central, null, "no queued action or hazard replays");
});

test("action lifetime advances only on completed fixed steps; errors and status still clear while paused", () => {
  const p = new EncounterPresentation(), s = encounter();
  p.observe(s); p.notify("gathered", false, {}, 0);
  for (let i = 0; i < 1000; i++) p.observe(s);
  p.expire(60000); assert.equal(p.result?.message, "gathered");
  for (let i = 0; i < 149; i++) p.step(s);
  assert.ok(p.result); p.step(s); assert.equal(p.result, null);
  p.notify("invalid import", true, { channel: "system" }, 60000);
  p.expire(71999); assert.equal((p.central as PresentedNotice | null)?.channel, "system");
  p.expire(72000); assert.equal(p.central, null);
});

test("local-write recovery resolves persistence reminders but preserves unrelated errors and emitted calls", () => {
  const p = new EncounterPresentation(), s = encounter(); s.world.threat.mode = "warn";
  p.observe(s); p.threatCall({ x: 120, y: -30, z: -100 }, s);
  const call = p.callDirection(s);
  p.notify("Use without local saving", true, { channel: "persistence" }, 0);
  p.notify("Suppressed warning", true, { channel: "hazard", context: "threat" }, 1);
  p.notify("Independent action", false, { channel: "action" }, 2);
  p.notify("Write still refused", true, { channel: "persistence" }, 1000);
  p.expire(12000);
  assert.equal((p.central as PresentedNotice | null)?.message, "Write still refused", "another failure refreshes its wall lifetime");
  p.notify("Export succeeded", false, { channel: "system" }, 12001);
  assert.equal((p.central as PresentedNotice | null)?.message, "Write still refused");
  p.notify("Local write confirmed", false, { channel: "persistence" }, 12002);
  assert.equal(p.central, null);
  assert.equal(p.status?.message, "Local write confirmed");
  assert.deepEqual(p.callDirection(s), call);
  p.expire(15002); p.observe(s);
  assert.equal(p.central, null); assert.equal(p.status, null);
  assert.deepEqual(p.callDirection(s), call, "wall expiry while paused cannot consume the active call");

  for (const channel of ["action", "system"] as const) {
    const unrelated = new EncounterPresentation();
    if (channel === "system") unrelated.setMenu(true);
    unrelated.notify("Unrelated refusal", true, { channel }, 4000);
    unrelated.notify("Local write confirmed", false, { channel: "persistence" }, 5000);
    assert.equal((channel === "action" ? unrelated.result : unrelated.central)?.message, "Unrelated refusal");
    if (channel === "system") assert.equal(unrelated.central?.channel, channel);
    unrelated.reset(); assert.equal(unrelated.nextExpiry, null);
  }
  p.reset();
  assert.equal(p.nextExpiry, null); assert.equal(p.callDirection(s), null);
});

test("paused import validation remains readable over the hidden gameplay hazard without claiming persistence failure", () => {
  const p = new EncounterPresentation(), s = encounter(); s.world.threat.mode = "warn";
  p.observe(s); p.notify("calls", true, { channel: "hazard", context: "threat" }, 0);
  p.setMenu(true);
  p.notify("invalid import; progress unchanged", true, { channel: "system" }, 1);
  for (let i = 0; i < 100; i++) p.observe(s);
  assert.equal((p.central as PresentedNotice | null)?.message, "invalid import; progress unchanged");
  assert.equal((p.central as PresentedNotice | null)?.channel, "system");
  p.notify("saving failed", true, { channel: "persistence" }, 2);
  p.notify("another invalid import", true, { channel: "system" }, 3);
  assert.equal((p.central as PresentedNotice | null)?.message, "saving failed");
});

test("threat release is transition-bound, immediate and replaceable; refuge and real air changes invalidate notices", () => {
  const p = new EncounterPresentation(), s = encounter(); s.world.threat.mode = "warn";
  p.observe(s); p.notify("warning", true, { channel: "hazard", context: "threat" }, 0);
  s.world.threat.mode = "disengage"; p.observe(s);
  assert.equal((p.central as PresentedNotice | null)?.message, "Calls fading");
  for (let i = 0; i < 149; i++) p.step(s);
  assert.ok(p.central); p.step(s); assert.equal(p.central, null);
  const loaded = new EncounterPresentation(); loaded.observe(s);
  assert.equal(loaded.central, null, "loaded disengage does not invent a transition");
  s.world.threat.mode = "pursue"; p.observe(s);
  p.notify("pursuing", true, { channel: "hazard", context: "threat" }, 1);
  s.world.threat.mode = "disengage"; p.observe(s);
  s.world.threat.mode = "warn"; p.observe(s);
  assert.equal(p.central, null, "new warning immediately removes release");
  p.notify("warning", true, { channel: "hazard", context: "threat" }, 2);
  s.player.pose.position = { x: 0, y: 0.6, z: 14 }; p.observe(s);
  assert.equal(p.central, null);
  s.player.pose.position = { x: 100, y: -20, z: -100 }; s.player.vitals.oxygen = 20;
  p.notify("oxygen", true, { channel: "hazard", context: "oxygen" }, 3); p.observe(s);
  s.player.pose.position.y = -0.8; p.observe(s); assert.equal(p.central, null);
});

test("call directions use a detached emission and current horizontal listener bearing and separate elevation", () => {
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
  assert.equal(p.callDirection(s)?.sector, "ahead", "a horizontal bearing dial is independent of pitch");
  assert.equal(p.callDirection(s)?.elevation, "level");
});

test("call lifetime freezes without steps, new emissions replace, and context/reset/invalid origins never retain tracking", () => {
  const p = new EncounterPresentation(), s = encounter(); s.world.threat.mode = "pursue";
  const origin = { x: 110, y: -30, z: -100 };
  p.threatCall(origin, s); p.expire(1e9); assert.ok(p.callDirection(s));
  for (let i = 0; i < 179; i++) p.step(s);
  assert.ok(p.callDirection(s)); p.step(s); assert.equal(p.callDirection(s), null);
  p.threatCall(origin, s); p.reset(); assert.equal(p.callDirection(s), null);
  p.threatCall({ ...origin, x: NaN }, s); assert.equal(p.callDirection(s), null);
  p.threatCall(origin, s); s.world.threat.mode = "disengage"; p.observe(s);
  assert.equal(p.callDirection(s), null); s.world.threat.mode = "warn"; p.observe(s);
  assert.equal(p.callDirection(s), null, "a later threat cannot revive an old call");
  p.threatCall(origin, s); s.player.pose.position = { x: 0, y: 0.6, z: 14 }; p.observe(s);
  s.player.pose.position = { x: 100, y: -30, z: -100 }; p.observe(s);
  assert.equal(p.callDirection(s), null, "refuge entry clears the origin");
});


test("action summaries, full refusals, replacement and active-time resets never compete with alerts", () => {
  const p = new EncounterPresentation(), s = encounter();
  p.observe(s);
  p.notify("Full collection and notebook detail", false, { summary: "+4 alloy · Diver hold 8/16" }, 0);
  const first = p.result;
  assert.equal(first?.message, "+4 alloy · Diver hold 8/16");
  p.notify("Full collection and notebook detail", false, { summary: "+4 alloy · Diver hold 8/16" }, 0);
  assert.notStrictEqual(p.result, first, "identical inputs are separate accessibility outcomes");
  const refusal = "No room for this bundle. Stow cargo, or deploy the 24 CU salvage buoy. Nothing collected. ".repeat(4);
  p.notify(refusal, true, {}, 0);
  p.expire(1e8);
  assert.equal(p.result?.message, refusal, "there is no wall expiry or arbitrary truncation");
  for (let i = 0; i < 239; i++) p.step(s);
  assert.ok(p.result); p.step(s); assert.equal(p.result, null);
  for (const boundary of ["menu", "actor", "refuge", "opening", "reset"] as const) {
    const state = encounter(); p.reset(); p.setMenu(false); p.observe(state);
    p.notify("picked up", false, {}, 0);
    if (boundary === "menu") { p.setMenu(true); p.setMenu(false); }
    if (boundary === "actor") { state.player.controlledVehicleId = "different"; p.observe(state); }
    if (boundary === "refuge") { state.player.pose.position = { x: 0, y: .6, z: 14 }; p.observe(state); }
    if (boundary === "opening") { state.opening.phase = 0; p.observe(state); }
    if (boundary === "reset") p.reset();
    assert.equal(p.result, null, boundary);
    p.expire(1e9); p.observe(state); assert.equal(p.result, null, "nothing replays");
  }
});

test("hazards are deduplicated only by explicitly supplied current matching banner contexts", () => {
  const p = new EncounterPresentation(), s = encounter(); s.world.threat.mode = "warn"; s.player.vitals.oxygen = 30;
  const covered = new Set<import("../src/sim/types.js").NoticeContext>(["threat", "oxygen"]);
  p.observe(s, covered);
  p.notify("identical prose", true, { channel: "hazard", context: "threat" }, 0, covered);
  assert.equal(p.central, null);
  p.notify("identical prose", true, { channel: "hazard", context: "recovery" }, 0, covered);
  assert.equal((p.central as PresentedNotice | null)?.context, "recovery", "wording cannot classify coverage");
  p.reset();
  p.observe(s, covered);
  p.notify("uncovered current delivery", true, { channel: "hazard", context: "oxygen" }, 0);
  assert.equal((p.central as PresentedNotice | null)?.message, "uncovered current delivery", "a previous set cannot suppress a new delivery");
  p.observe(s, covered); assert.equal(p.central, null, "new current banner removes the matching existing duplicate");
  p.notify("save failed", true, { channel: "persistence", context: "oxygen" }, 0, covered);
  assert.equal((p.central as PresentedNotice | null)?.message, "save failed");
  p.notify("receipt", false, { summary: "short" }, 1, covered); assert.equal(p.result?.message, "short");
});

test("call dial separates bearing and elevation, clears on actor changes, and does not expose a screen arrow", () => {
  const p = new EncounterPresentation(), s = encounter(); s.world.threat.mode = "warn"; p.observe(s);
  p.threatCall({ x: 120, y: -65, z: -120 }, s);
  const direction = p.callDirection(s)!;
  assert.equal(direction.bearingStep, 1); assert.equal(direction.elevation, "below");
  assert.equal("glyph" in direction, false);
  s.player.controlledVehicleId = "new-actor"; p.observe(s); assert.equal(p.callDirection(s), null);
});
