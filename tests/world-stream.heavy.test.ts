// HEAVY TIER: real NullEngine scene with the production regional art and
// streamed world chunks. Assertions compare names, counts and numbers only.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createRegionalArt, NEAR_WORLD } from "../src/render/renderer.js";
import { createCelMaterial, createGlassMaterial } from "../src/render/materials.js";
import { REGION_OWNER_BYTES } from "../src/render/regions.js";
import { composeWorldArt, LEGACY_ART } from "../src/render/worldArt.js";
import { CANOPY_BASIN_ROUTE } from "../src/content/routes.js";
import { protectedReadyState } from "./targeting-support.js";
import type { Vec3 } from "../src/sim/types.js";

const MiB = 1024 * 1024;
function sceneTest(run: (scene: Scene) => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  class TextCanvas {
    width = 512; height = 128;
    getContext() { return { fillStyle: "", font: "", textAlign: "", textBaseline: "", clearRect() {}, fillRect() {}, fillText() {}, measureText(t: string) { return { width: t.length * 24 }; } }; }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: TextCanvas });
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try { run(scene); } finally {
    scene.dispose(); engine.dispose();
    if (previous) Object.defineProperty(globalThis, "OffscreenCanvas", previous); else Reflect.deleteProperty(globalThis, "OffscreenCanvas");
  }
}
/** Vertex and index bytes actually held by chunk meshes in the scene. */
function chunkBytes(scene: Scene): number {
  let bytes = 0;
  for (const mesh of scene.meshes) {
    if (!mesh.name.startsWith("chunk:")) continue;
    const m = mesh as Mesh;
    for (const kind of m.getVerticesDataKinds()) bytes += (m.getVerticesData(kind, false, false) as Float32Array).byteLength;
    bytes += (m.getIndices(false, true) as Uint32Array).byteLength;
  }
  return bytes;
}
const chunkMeshes = (scene: Scene) => scene.meshes.filter(m => m.name.startsWith("chunk:"));

/** A work clock: every read advances 0.01 ms, so each frame's construction
 * budget is a fixed amount of work whatever the host load (these tests failed
 * once under machine load with the wall clock). Streaming, budgets and
 * settlement are asserted exactly as before. */
function workClock(): () => number { let t = 0; return () => (t += 0.01); }

test("the terrain streams in chunks: nearby ground first, the rest within budget, regions and chunks under one budget", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
  // Today's refined terrain alone (the legacy pack): S2's composed regions
  // stream through the same path in regions-stream.heavy.test.ts.
  const art = createRegionalArt(scene, cel, glass, { world: composeWorldArt([LEGACY_ART]), now: workClock() });
  const state = protectedReadyState(350);
  const pod: Vec3 = { x: 0, y: 1.2, z: 22 };
  state.player.pose.position = { ...pod };
  art.update(state);
  assert.ok(art.regionBytes > 1 * MiB && art.regionBytes <= REGION_OWNER_BYTES, `legacy owners hold ${art.regionBytes} B`);
  const first = art.stream(pod, { nearRadius: NEAR_WORLD })!;
  assert.ok(art.residency.isReady(NEAR_WORLD), "the first frame after a load has the nearby ground");
  assert.ok(first.shown >= 1 && first.shown < 16, `only nearby chunks are built first (${first.shown})`);
  assert.ok(chunkMeshes(scene).some(m => m.name.includes("legacy.terrain") && m.isEnabled()));
  let stats = first;
  for (let frame = 0; frame < 4000 && !stats.settled; frame++) {
    stats = art.stream(pod)!;
    const budget = art.residency.budget;
    assert.ok(chunkBytes(scene) <= stats.gpuBytes - art.regionBytes + 1, "scene chunk buffers never exceed what is accounted");
    assert.ok(stats.gpuBytes <= budget.gpuBytes && !stats.overBudget);
    assert.ok(stats.buildMs < 60, `frame ${frame} build slice ${stats.buildMs.toFixed(1)} ms`);
  }
  assert.ok(stats.settled && art.residency.isReady(), "every terrain chunk within the far plane is drawn");
  assert.equal(stats.shown, 16, "the whole route terrain, in 16 chunks");
  const vertices = chunkMeshes(scene).reduce((n, m) => n + m.getTotalIndices(), 0) / 3;
  assert.ok(vertices >= 200_595, `all ${vertices} terrain triangles (split parts share border vertices)`);
  art.dispose();
  assert.equal(scene.meshes.length, 0); assert.equal(scene.geometries.length, 0);
}));

test("repeated region returns stabilize meshes, geometries and accounted bytes", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
  const art = createRegionalArt(scene, cel, glass, { now: workClock() });
  const state = protectedReadyState(350);
  const stops: readonly Vec3[] = [{ x: 0, y: .18, z: 22 }, CANOPY_BASIN_ROUTE.labParking, { x: 178, y: -160, z: -208 },
    { x: 216, y: -166, z: -232 }, { x: 57, y: -10, z: -65 }];
  const seen = new Map<number, string>();
  for (let lap = 0; lap < 4; lap++) for (const [i, p] of stops.entries()) {
    state.player.pose.position = { ...p };
    art.update(state);
    let s = art.stream(p, { nearRadius: NEAR_WORLD })!;
    for (let f = 0; f < 4000 && !s.settled; f++) s = art.stream(p)!;
    assert.ok(s.settled && !s.overBudget);
    const counts = [scene.meshes.length, scene.geometries.length, s.cpuBytes, s.gpuBytes, art.regionBytes].join(",");
    if (lap >= 2) assert.equal(counts, seen.get(i), `lap ${lap} stop ${i} returns to the same resident set`);
    seen.set(i, counts);
  }
  art.dispose();
  assert.equal(scene.meshes.length, 0); assert.equal(scene.geometries.length, 0);
}));

test("ADVERSE: a budget smaller than the regions plus terrain degrades the far terrain, never the budget, and context loss frees hidden art", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
  const state = protectedReadyState(350);
  state.player.pose.position = { x: 0, y: 1.2, z: 22 };
  const probe = createRegionalArt(scene, cel, glass, { now: workClock() });
  probe.update(state);
  const regions = probe.regionBytes;
  probe.dispose();
  // Room for the two detailed owners and 3.5 MiB of chunks: the 2.85 MB pod
  // chunk and its neighbours fit, the whole 5.4 MB route terrain does not.
  const budget = regions + 3.5 * MiB;
  const art = createRegionalArt(scene, cel, glass, { budget: { cpuBytes: budget, gpuBytes: budget }, now: workClock() });
  art.update(state);
  let s = art.stream(state.player.pose.position, { nearRadius: NEAR_WORLD })!;
  for (let f = 0; f < 4000 && !s.settled; f++) {
    s = art.stream(state.player.pose.position)!;
    assert.ok(!s.overBudget && s.gpuBytes <= budget, `frame ${f}: ${s.gpuBytes} > ${budget}`);
  }
  assert.ok(s.settled, "a stable degraded state settles");
  assert.ok(s.cut > 0, "far chunks wait beyond the budget frontier");
  assert.ok(art.residency.isReady(NEAR_WORLD), "the nearby ground is still drawn");
  assert.equal(art.residency.isReady(), false, "and the incomplete view is never reported complete");
  // Leave, so some chunks are hidden, then lose the context.
  state.player.pose.position = { x: 216, y: -166, z: -232 };
  art.update(state);
  for (let f = 0; f < 200; f++) s = art.stream(state.player.pose.position)!;
  scene.getEngine().onContextLostObservable.notifyObservers(scene.getEngine());
  assert.equal(art.residency.units().filter(u => u.state === "hidden").length, 0, "hidden chunks are released on context loss");
  assert.equal(art.retained.length, 0, "retained owners are released on context loss");
  art.dispose();
  assert.equal(scene.meshes.length, 0);
}));
