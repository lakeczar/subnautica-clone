/** UX-1 R1 (R2): replacing the expedition, even with a save of the current tick,
 * inherits no head look or rudder: the first paused render is level and the hull
 * holds its heading once play resumes. Through the real app, input and codec. */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { GameView, PlayerInput, TestRenderer, browserFixture } from "./app-browser-support.js";
import { encoded, settled } from "./persistence-support.js";
import { SaveRepository } from "../src/save/repository.js";
import { createEnvelope, type SaveEnvelope } from "../src/save/codec.js";
import { carrierCommand, carrierHull, fixtureGame } from "../src/sim/carrier.js";
import { createWorldQueries } from "../src/sim/world.js";

register("./app-loader.js", import.meta.url);
const { SiltwakeApp } = await import("../src/runtime/app.js");
const meta = { sessionId: "ux1-helm-session", createdAt: "2026-10-23T00:00:00.000Z", savedAt: "2026-10-23T00:00:00.000Z" };

/** The fixture carrier with the player at its helm, under way control, not holding. */
function helmSave(): SaveEnvelope {
  const s = fixtureGame();
  s.opening.phase = 4;
  assert.equal(carrierCommand(s, "helm", undefined, createWorldQueries()), null);
  return createEnvelope(s, meta);
}

test("a same-tick import clears the helm's head look and rudder before its first frame", async (t) => {
  const browser = browserFixture();
  const seed = new SaveRepository(browser.storage, browser.lock);
  seed.load();
  const committed = await seed.commit(helmSave());
  assert.equal(committed.ok, true, committed.ok ? "" : committed.error);
  const app = new SiltwakeApp({} as HTMLElement);
  t.after(() => { PlayerInput.scripted = null; app.dispose(); browser.restore(); });
  const view = GameView.current, renderer = TestRenderer.current;
  view.actions.continueGame();
  browser.frames();
  view.actions.resume();
  // Full starboard rudder and a head look to port, held for a second.
  PlayerInput.scripted = [{ type: "look", yawDelta: -0.02, pitchDelta: 0.01 }, { type: "move", forward: 0, right: 1, vertical: 0, sprint: false }];
  browser.frames(60);
  PlayerInput.scripted = null;
  assert.ok(renderer.look!.yaw < -0.5, `the head look moved: ${JSON.stringify({ look: renderer.look, screen: view.screen, tick: view.state?.tick, mode: view.state?.player.mode })}`);
  // The view's state refreshes with the HUD (about every 90 ms): step past one.
  const turning = carrierHull(view.state!)!.pose.yaw;
  browser.frames(8);
  assert.ok(carrierHull(view.state!)!.pose.yaw > turning, `the rudder is still easing out: ${turning} -> ${carrierHull(view.state!)!.pose.yaw} holding ${view.state!.fleet.docking!.stationKeeping} tick ${view.state!.tick}`);
  // Export the current state and import it straight back: the same tick.
  view.actions.pause();
  const text = encoded(createEnvelope(view.state!, meta)), tick = view.state!.tick;
  view.actions.importFile({ size: text.length, text: async () => text } as File);
  await settled();
  view.actions.confirm();
  await settled();
  browser.frames(3);
  assert.equal(view.state!.tick, tick, "the imported save is the current tick");
  assert.deepEqual(renderer.look, { yaw: 0, pitch: 0 }, "the first paused render is level");
  const loaded = carrierHull(view.state!)!.pose.yaw;
  view.actions.resume();
  browser.frames(40);
  assert.equal(carrierHull(view.state!)!.pose.yaw, loaded, "no inherited rudder turns the hull");
  assert.deepEqual(renderer.look, { yaw: 0, pitch: 0 });
});
