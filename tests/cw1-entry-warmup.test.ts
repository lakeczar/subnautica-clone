import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { SaveRepository } from "../src/save/repository.js";
import { GameView, browserFixture } from "./app-browser-support.js";
import { encoded, sample, settled } from "./persistence-support.js";
import { completeOpening } from "../src/sim/progression.js";
import { CAVE_SOURCES } from "../src/content/regions/caves.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { gameWorld, liveKitRecordsMade, setKitCaveRecords, surfaceHeight } from "../src/sim/world.js";
import { liveKitCave, type KitCaveCollision } from "../src/world/caves/kitCollision.js";
import { setGameCaveStore, type CaveStore } from "../src/render/caves/caveStore.js";
import type { SaveEnvelope } from "../src/save/codec.js";
import type { GameState, Vec3 } from "../src/sim/types.js";

// CW-1 R5-1: SIM-PERF-1's entry warm-up runs only after records and admission, once per
// entry, and its discarded copy builds no cave cluster and generates no records, whoever's
// query meets a cave. Its own file, so its own process: built clusters and generated records
// are process-wide, and this file asserts that none were made before the pack landed.

register("./app-loader.js", import.meta.url);
const { SiltwakeApp } = await import("../src/runtime/app.js");
const LOADING = "Loading the caves near your expedition…";
const world = gameWorld();
/** The cluster whose caves include `id`. */
const clusterOf = (id: string) => world.kitCaves.clusters.find(c => c.caves.includes(id))!;

/** A cave store whose collision pack is in flight until `land` (or `fail`). Its records are made
 * here, as the bake makes them, so they never pass through the world's live generation. */
function pendingStore() {
  const store = {
    collision: null as ReadonlyMap<string, KitCaveCollision> | null, settled: false, refused: null as string | null,
    light: () => null, lightSettled: () => false, retainLight: () => {},
    stats: { fetches: 0, failures: 0, lightBytes: 0, collisionMs: 0 },
  };
  return {
    store: store as CaveStore,
    land(ids: readonly string[]) {
      store.collision = new Map(ids.map(id => [id, liveKitCave(CAVE_SOURCES.find(s => s.id === id)!, worldFloor, surfaceHeight)]));
      store.settled = true;
    },
    /** The fetch settled without a usable pack (a failure or a refused bake): the live fallback. */
    fail(why: string) { store.refused = why; store.settled = true; },
  };
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
/** Nothing cave-related made while the pack is pending: no cluster built, no record generated. */
function untouched(where: string) {
  assert.equal(world.kitCaves.stats.syncBuilds, 0, `${where}: no unsliced cluster build`);
  assert.deepEqual(world.kitCaves.resident, [], `${where}: no cluster built`);
  assert.equal(liveKitRecordsMade(), 0, `${where}: no record generated live`);
}

test("R5-1: Continue inside a cave with its pack in flight builds nothing until the pack lands; then the pack's records admit it, the warm-up runs and it plays", async (t) => {
  // Sol R5's pose: inside the Reef archlet cluster (the archlet, bellhole and wrackhollow).
  const at: Vec3 = { x: -452.3, y: -20.4, z: 100 }, cluster = clusterOf("reef_archlet"), pack = pendingStore();
  untouched("before Continue");
  const f = await app(t, swimmingAt(at), pack.store);
  f.view.actions.continueGame();
  for (let i = 0; i < 120; i++) {
    f.frames(1);
    assert.equal(f.view.screen, "menu", `frame ${i}: behind the loading presentation`);
    assert.equal(f.state().tick, 300);
  }
  assert.equal(f.view.reason, LOADING);
  untouched("two seconds into the wait");
  // A slow pack: it lands later, with every cave of the cluster.
  pack.land(cluster.caves);
  let frames = 0;
  while (f.view.screen === "menu" && frames < 30) { f.frames(1); frames++; }
  assert.equal(f.view.screen, "playing", "revealed once admitted");
  assert.ok(near(f.state().player.pose.position, at), "played from the saved pose");
  assert.equal(liveKitRecordsMade(), 0, "the pack's records, never live generation");
  assert.ok(world.kitCaves.ready(cluster.index), "the cluster is built");
  assert.deepEqual(world.kitCaves.unsliced.map(u => u.cause), ["admission"], "built once, by admission, from the pack's records");
});

test("R5-1: an imported save in another cave waits the same way; warm-up's queries away from the admitted cluster build and generate nothing", async (t) => {
  const id = "canopy_root_arch", source = CAVE_SOURCES.find(s => s.id === id)!, cluster = clusterOf(id), pack = pendingStore();
  const fp = source.footprint, at: Vec3 = { x: fp.minX - 2, y: Math.min(-1.5, worldFloor(fp.minX - 2, (fp.minZ + fp.maxZ) / 2) + 2), z: (fp.minZ + fp.maxZ) / 2 };
  const before = { builds: world.kitCaves.stats.syncBuilds, made: liveKitRecordsMade(), resident: [...world.kitCaves.resident] };
  const f = await app(t, null, pack.store);
  const text = encoded(swimmingAt(at, 900));
  f.view.actions.importFile({ size: text.length, text: async () => text } as unknown as File);
  await settled();
  f.view.actions.confirm();
  await settled();
  f.frames(300); // a slow pack: five seconds
  assert.equal(f.view.screen, "menu");
  assert.equal(f.state().tick, 900);
  assert.equal(world.kitCaves.stats.syncBuilds, before.builds, "nothing built while pending");
  assert.equal(liveKitRecordsMade(), before.made, "nothing generated while pending");
  pack.land(cluster.caves);
  let frames = 0;
  while (f.view.screen === "menu" && frames < 30) { f.frames(1); frames++; }
  assert.equal(f.view.screen, "playing");
  assert.equal(f.state().tick, 900, "admitted, warmed and revealed before the first tick");
  assert.equal(liveKitRecordsMade(), before.made, "the warm-up generated no record");
  // Only the admitted cluster was added; the warm-up's travel built no other.
  assert.deepEqual(world.kitCaves.resident.filter(i => !before.resident.includes(i)), [cluster.index]);
  assert.deepEqual(world.kitCaves.unsliced.slice(-1).map(u => [u.cluster, u.cause]), [[cluster.index, "admission"]]);
});

test("R5-1: a pack that fails falls back to live records, counted as admission's, and entry completes within its bound", async (t) => {
  const id = "basin_dish_lee_vault", source = CAVE_SOURCES.find(s => s.id === id)!, cluster = clusterOf(id), pack = pendingStore();
  const fp = source.footprint, at: Vec3 = { x: fp.minX - 2, y: Math.min(-1.5, worldFloor(fp.minX - 2, (fp.minZ + fp.maxZ) / 2) + 2), z: (fp.minZ + fp.maxZ) / 2 };
  const madeBefore = liveKitRecordsMade();
  const f = await app(t, swimmingAt(at), pack.store);
  f.view.actions.continueGame();
  f.frames(60);
  assert.equal(f.view.screen, "menu", "held while the pack is in flight");
  assert.equal(liveKitRecordsMade(), madeBefore, "no live generation while the pack is in flight");
  pack.fail("stale provenance");
  let frames = 0;
  while (f.view.screen === "menu" && frames < 60) { f.frames(1); frames++; }
  assert.equal(f.view.screen, "playing", `bounded: plays ${frames} frames after the failure`);
  assert.ok(world.kitCaves.ready(cluster.index));
  assert.equal(world.kitCaves.unsliced.at(-1)?.cause, "admission", "the live fallback is admission's build, counted and logged");
  assert.ok(liveKitRecordsMade() > madeBefore, "now generated live: the fallback for a missing or refused pack");
});

test("R5-1: inside `withoutQueryBuilds`, a query meeting an unbuilt cluster and a current sample in an undecoded cave are answered without building or generating", () => {
  const id = "rift_kiln_tube", source = CAVE_SOURCES.find(s => s.id === id)!, cluster = clusterOf(id);
  assert.ok(!world.kitCaves.ready(cluster.index));
  const fp = source.footprint, mid: Vec3 = { x: (fp.minX + fp.maxX) / 2, y: source.baseY + 4, z: (fp.minZ + fp.maxZ) / 2 };
  const made = liveKitRecordsMade(), builds = world.kitCaves.stats.syncBuilds, deferred = world.kitCaves.stats.deferredQueries;
  world.kitCaves.withoutQueryBuilds(() => {
    world.clearance(mid, { radius: 0.34, height: 0.95 });
    world.supportHeight(mid.x, mid.z, mid.y);
    assert.equal(world.kitCaves.inside(mid), false, "undecoded: not inside, for the discarded copy");
  });
  assert.equal(world.kitCaves.stats.syncBuilds, builds, "no cluster built");
  assert.equal(liveKitRecordsMade(), made, "no record generated");
  assert.ok(world.kitCaves.stats.deferredQueries >= deferred + 2, "each deferred answer counted");
  assert.ok(!world.kitCaves.ready(cluster.index));
});
