import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { SaveRepository } from "../src/save/repository.js";
import { GameView, TestRenderer, browserFixture } from "./app-browser-support.js";
import { encoded, sample, settled } from "./persistence-support.js";
import { completeOpening } from "../src/sim/progression.js";
import { CAVE_SOURCES } from "../src/content/regions/caves.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { REST_BASES } from "../src/content/bases.js";
import { setKitCaveRecords, surfaceHeight } from "../src/sim/world.js";
import { liveKitCave, type KitCaveCollision } from "../src/world/caves/kitCollision.js";
import { setGameCaveStore, type CaveStore } from "../src/render/caves/caveStore.js";
import type { SaveEnvelope } from "../src/save/codec.js";
import type { GameState, Vec3 } from "../src/sim/types.js";

// CW-1 R1 and R2 at the app boundary: an entered expedition waits for its
// caves behind the menu's loading presentation (never in play), and recovery
// state never crosses from one expedition into another. The real app,
// session, repository, codec and cave runtime; presentation doubles. Each
// test uses its own caves: built clusters and generated records are
// process-wide, and a cave already built would never hold.

register("./app-loader.js", import.meta.url);
const { SiltwakeApp } = await import("../src/runtime/app.js");
const LOADING = "Loading the caves near your expedition…";

/** A cave store whose collision pack is in flight until `land` (or `fail`). */
function pendingStore() {
  const store = {
    collision: null as ReadonlyMap<string, KitCaveCollision> | null, settled: false, refused: null,
    light: () => null, lightSettled: () => false, retainLight: () => {},
    stats: { fetches: 0, failures: 0, lightBytes: 0, collisionMs: 0 },
  };
  return {
    store: store as CaveStore,
    land(ids: readonly string[]) {
      store.collision = new Map(ids.map(id => [id, liveKitCave(CAVE_SOURCES.find(s => s.id === id)!, worldFloor, surfaceHeight)]));
      store.settled = true;
    },
  };
}
/** Open water 2 m outside a cave's footprint, within admission reach. */
function beside(id: string): Vec3 {
  const f = CAVE_SOURCES.find(s => s.id === id)!.footprint, x = f.minX - 2, z = (f.minZ + f.maxZ) / 2;
  const y = Math.min(-1.5, worldFloor(x, z) + 2);
  assert.ok(worldFloor(x, z) < y - 1, `${id}: water beside it`);
  return { x, y, z };
}
function swimmingAt(p: Vec3, tick = 300): SaveEnvelope {
  const save = sample(tick);
  completeOpening(save.state);
  save.state.player.mode = "swimming";
  save.state.player.pose.position = { ...p };
  return save;
}
async function app(t: test.TestContext, seed: SaveEnvelope | null, store: CaveStore) {
  setGameCaveStore(store);
  const browser = browserFixture();
  if (seed) {
    const repo = new SaveRepository(browser.storage, browser.lock);
    repo.load();
    assert.equal((await repo.commit(seed)).ok, true);
  }
  const instance = new SiltwakeApp({} as HTMLElement);
  const view = GameView.current;
  t.after(() => { instance.dispose(); browser.restore(); setGameCaveStore(undefined); setKitCaveRecords(null); });
  browser.frames(2);
  const state = (): GameState => (instance as unknown as { state: GameState }).state;
  return { ...browser, view, state };
}
const near = (a: Vec3, b: Vec3): boolean => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6;

test("R1: Continue beside a cave whose pack is still downloading waits behind the loading presentation, then plays from the saved pose", async (t) => {
  const id = "reef_pumphouse_undercut", at = beside(id), pack = pendingStore();
  const f = await app(t, swimmingAt(at), pack.store);
  f.view.actions.continueGame();
  for (let i = 0; i < 120; i++) {
    f.frames(1);
    assert.equal(f.view.screen, "menu", "no HUD while the cave loads");
    assert.equal(f.view.reason, LOADING);
    assert.equal(f.view.busy, true, "the menu shows the loading state, its entry buttons disabled");
    assert.equal(f.state().tick, 300, "no simulation progress");
    assert.ok(near(f.state().player.pose.position, at), "the saved pose is untouched");
  }
  pack.land([id]);
  f.frames(1);
  assert.equal(f.view.screen, "playing", "the request's resume permission holds through the wait");
  assert.equal(f.view.busy, false);
  assert.ok(near(f.state().player.pose.position, at));
  for (let i = 0; i < 60; i++) {
    f.frames(1);
    assert.notEqual(f.view.canvas.dataset.caveHold, "loading", "play never holds for this cave");
  }
  assert.ok(f.state().tick > 300);
  assert.ok(!f.view.notices.some(n => /Loading cave|could not load/.test(n)), f.view.notices.join(" | "));
});

test("R1: an imported save beside a cave waits the same way; the pack landing admits it without moving the player", async (t) => {
  const id = "reef_gully_window", at = beside(id), pack = pendingStore();
  const f = await app(t, null, pack.store);
  const text = encoded(swimmingAt(at, 900));
  f.view.actions.importFile({ size: text.length, text: async () => text } as unknown as File);
  await settled();
  f.view.actions.confirm();
  await settled();
  f.frames(90);
  assert.equal(f.view.screen, "menu");
  assert.equal(f.view.reason, LOADING);
  assert.equal(f.state().tick, 900);
  pack.land([id]);
  f.frames(1);
  assert.equal(f.view.screen, "playing");
  assert.ok(near(f.state().player.pose.position, at));
  assert.equal(f.state().tick, 900, "admitted before the first tick");
});

test("R1: a pack that never lands ends the wait at the refuge (LC-07), still behind the loading presentation, then plays", async (t) => {
  const id = "hub_apron_hollow", at = beside(id), pack = pendingStore();
  const f = await app(t, swimmingAt(at), pack.store);
  f.view.actions.continueGame();
  let frames = 0;
  while (f.view.screen === "menu" && frames < 60 * 20) { f.frames(1); frames++; assert.equal(f.state().tick, 300); }
  assert.ok(frames >= 60 * 12 - 2 && frames < 60 * 13, `refuge after the 12 s timeout (${frames} frames)`);
  assert.equal(f.view.screen, "playing");
  const s = f.state(), wake = REST_BASES[s.player.refugeId].wake;
  assert.ok(near(s.player.pose.position, wake) || near(s.player.pose.position, REST_BASES.home_pod.wake), "woke at the refuge");
  assert.ok(f.view.notices.some(n => /returned to your refuge/.test(n)));
});

test("R1: cancelling while the expedition waits withdraws the automatic resume; it opens paused, and Resume plays it", async (t) => {
  const id = "isles_scar_crawl", at = beside(id), pack = pendingStore();
  const f = await app(t, swimmingAt(at), pack.store);
  f.view.actions.continueGame();
  f.frames(10);
  assert.equal(f.view.reason, LOADING);
  f.view.actions.cancelConfirm();
  f.frames(10);
  assert.equal(f.view.screen, "menu", "still loading");
  f.view.actions.resume();
  assert.equal(f.view.screen, "menu", "Resume is refused until the caves are admitted");
  pack.land([id]);
  f.frames(2);
  assert.equal(f.view.screen, "menu");
  assert.match(f.view.reason, /Expedition ready/);
  assert.equal(f.state().tick, 300);
  assert.ok(near(f.state().player.pose.position, at));
  f.view.actions.resume();
  f.frames(30);
  assert.equal(f.view.screen, "playing");
  assert.ok(f.state().tick > 300);
});

test("R2: a replaced expedition never inherits the old one's remembered open water or its running hold", async (t) => {
  // Save A in open water far from every cave (admission remembers it); then,
  // during a hold at save B (its pack pending), save C replaces B. C's
  // recovery uses only its own poses or its refuge, on a fresh timeout.
  const open: Vec3 = { x: 1200, y: -100, z: -600 };
  assert.ok(!CAVE_SOURCES.some(c => open.x > c.footprint.minX - 30 && open.x < c.footprint.maxX + 30 && open.z > c.footprint.minZ - 30 && open.z < c.footprint.maxZ + 30));
  const pack = pendingStore();
  const f = await app(t, swimmingAt(open), pack.store);
  f.view.actions.continueGame();
  f.frames(30);
  assert.equal(f.view.screen, "playing", "A: no cave near, admitted at once");
  f.view.actions.pause();
  const enter = async (save: SaveEnvelope) => {
    const text = encoded(save);
    f.view.actions.importFile({ size: text.length, text: async () => text } as unknown as File);
    await settled();
    f.view.actions.confirm();
    await settled();
  };
  const b = beside("isles_headland_west"), c = beside("reef_lantern_grotto");
  await enter(swimmingAt(b, 600));
  f.frames(60 * 6);
  assert.equal(f.view.reason, LOADING, "B waits");
  await enter(swimmingAt(c, 900));
  // C must wait its own full 12 s (B's 6 s do not count) and must not go to A's open water.
  f.frames(60 * 8);
  assert.equal(f.view.reason, LOADING, "a fresh timeout for C");
  assert.ok(near(f.state().player.pose.position, c));
  f.frames(60 * 6);
  assert.equal(f.view.screen, "playing");
  const p = f.state().player.pose.position;
  assert.ok(Math.hypot(p.x - open.x, p.z - open.z) > 100, `C was not sent to A's open water (${p.x}, ${p.z})`);
  assert.ok(f.view.notices.some(n => /returned to your refuge/.test(n)), "C's own refuge");
  assert.ok(!f.view.notices.some(n => /open water you passed/.test(n)));
});

test("R1 (REC-1): an expedition loaded in a cave whose light has not landed waits for it behind the loading presentation, bounded", async (t) => {
  // Open water, no cave hold: only the view's cave light is pending.
  const open: Vec3 = { x: 1180, y: -100, z: -620 };
  const pack = pendingStore();
  pack.land([]);
  const f = await app(t, swimmingAt(open), pack.store);
  TestRenderer.current.caveLightPending = true;
  f.view.actions.continueGame();
  f.frames(60);
  assert.equal(f.view.screen, "menu", "no HUD while the cave there draws as open water");
  assert.equal(f.state().tick, 300);
  TestRenderer.current.caveLightPending = false;
  f.frames(1);
  assert.equal(f.view.screen, "playing", "shown once the light lands");
});

// CW-1 R3-3: readiness is the entered pose's, and an unlit cave is never revealed.
const FAILED = "This cave's light could not be loaded, even at a safe pose. Load another save or try again.";
const atPose = (st: unknown, p: Vec3): boolean => near((st as GameState).player.pose.position, p);

test("R3-3: a ready previous pose, then a cold cave: entry waits for the entered pose's own readiness", async (t) => {
  const open: Vec3 = { x: 1150, y: -100, z: -650 };
  const pack = pendingStore();
  pack.land([]);
  const f = await app(t, swimmingAt(open), pack.store);
  const r = TestRenderer.current;
  r.caveLightPending = false; // the title's (previous) pose was ready
  // The real renderer learns the entered pose is a cold cave when it presents it.
  let entered = 0;
  r.onPresent = (st) => { if (st && atPose(st, open)) { entered++; if (entered < 40) r.caveLightPending = true; else r.caveLightPending = false; } };
  f.view.actions.continueGame();
  for (let i = 0; i < 38; i++) {
    f.frames(1);
    assert.equal(f.view.screen, "menu", `frame ${i}: not revealed on the previous pose's readiness`);
    assert.equal(f.state().tick, 300);
  }
  f.frames(4);
  assert.equal(f.view.screen, "playing", "revealed once this pose is lit");
  assert.equal(r.caveLightPending, false);
});

test("R3-3: delayed success: the light lands at 4 s and entry reveals then, lit", async (t) => {
  const open: Vec3 = { x: 1145, y: -100, z: -655 };
  const pack = pendingStore();
  pack.land([]);
  const f = await app(t, swimmingAt(open), pack.store);
  const r = TestRenderer.current;
  let presented = 0;
  r.onPresent = (st) => { if (st && atPose(st, open)) r.caveLightPending = ++presented < 240; };
  f.view.actions.continueGame();
  let frames = 0;
  while (f.view.screen === "menu" && frames < 60 * 10) { f.frames(1); frames++; assert.ok(f.view.screen === "menu" || !r.caveLightPending); }
  assert.equal(f.view.screen, "playing");
  assert.ok(frames >= 239 && frames < 250, `${frames} frames`);
  assert.ok(near(f.state().player.pose.position, open), "no move: the light landed in time");
});

test("R3-3: never ready at the cave: at the bound the expedition moves to safe water, lit there, and plays (never revealed unlit)", async (t) => {
  // Beside a real cave (admission never remembers open water there).
  const id = "canopy_root_arch", cave = beside(id), pack = pendingStore();
  pack.land([id]);
  const f = await app(t, swimmingAt(cave), pack.store);
  const r = TestRenderer.current;
  // Unlit at the cave's pose, lit anywhere else (the refuge).
  r.onPresent = (st) => { if (st) r.caveLightPending = atPose(st, cave); };
  f.view.actions.continueGame();
  let frames = 0;
  while (f.view.screen === "menu" && frames < 60 * 20) {
    f.frames(1); frames++;
    assert.ok(f.view.screen === "menu" || !atPose(f.state(), cave), "never playing at the unlit cave");
  }
  assert.equal(f.view.screen, "playing");
  assert.ok(frames >= 60 * 8 - 2 && frames < 60 * 9 + 10, `moved at the 8 s bound (${frames} frames)`);
  const s1 = f.state(), wake = REST_BASES[s1.player.refugeId].wake;
  assert.ok(near(s1.player.pose.position, wake) || near(s1.player.pose.position, REST_BASES.home_pod.wake), "at the refuge");
  assert.ok(f.view.notices.some(n => /light could not be loaded in time/.test(n)), f.view.notices.join(" | "));
  assert.equal(r.caveLightPending, false);
});

test("R3-3: never ready anywhere: entry keeps the loading cover with a message and never plays; the menu is free again", async (t) => {
  const id = "canopy_fin_cleft", cave = beside(id), pack = pendingStore();
  pack.land([id]);
  const f = await app(t, swimmingAt(cave), pack.store);
  const r = TestRenderer.current;
  r.onPresent = (st) => { if (st) r.caveLightPending = true; };
  f.view.actions.continueGame();
  for (let i = 0; i < 60 * 20; i++) { f.frames(1); assert.equal(f.view.screen, "menu", `frame ${i}`); }
  assert.equal(f.view.reason, FAILED);
  assert.equal(f.view.busy, false, "load another save or try again");
  f.view.actions.resume();
  assert.equal(f.view.screen, "menu", "Resume is refused: never revealed unlit");
  assert.equal(f.state().tick, 300);
});

test("R3-3: a settle that reaches its bound unlit moves back to the remembered open water once, then settles there", async (t) => {
  // Open water A is remembered; the player then stands beside cave B, whose settle fails unlit.
  const open: Vec3 = { x: 1130, y: -100, z: -670 }, id = "reef_wrackhollow", cave = beside(id);
  const pack = pendingStore();
  pack.land([id]);
  const f = await app(t, swimmingAt(open), pack.store);
  f.view.actions.continueGame();
  f.frames(10);
  assert.equal(f.view.screen, "playing");
  f.state().player.pose.position = { ...cave }; // a jump into the cave (as a respawn or rescue would)
  f.frames(2);
  const r = TestRenderer.current;
  r.settling = true; r.caveLightFailed = true;
  f.frames(1);
  assert.ok(near(f.state().player.pose.position, open), `back at the remembered open water (${JSON.stringify(f.state().player.pose.position)})`);
  assert.ok(f.view.notices.some(n => /light could not be loaded in time/.test(n)));
  f.frames(5);
  assert.ok(near(f.state().player.pose.position, open), "once, not every frame");
  r.settling = false; r.caveLightFailed = false;
  f.frames(5);
  assert.equal(f.view.screen, "playing");
});
