import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createRegionalArt } from "../src/render/renderer.js";
import { createCelMaterial, createGlassMaterial } from "../src/render/materials.js";
import { createGame } from "../src/sim/state.js";
import { carrierCommand, fixtureGame, updateBerth } from "../src/sim/carrier.js";
import { createWorldQueries } from "../src/sim/world.js";
import { createAtmosphere } from "../src/render/atmosphere.js";
import { createTargetCue } from "../src/render/targetCue.js";
import { ArtBatch } from "../src/render/geometry.js";
import { GeometryCache } from "../src/render/geometryCache.js";
import { LabelMaterials, label } from "../src/render/landmarks.js";
import { createEcology } from "../src/render/ecology.js";
import { createHash } from "node:crypto";
import type { RenderRegion } from "../src/render/regions.js";

function identity(scene: Scene): unknown {
  const digest = (data: ArrayLike<number>): string => createHash("sha256").update(JSON.stringify(Array.from(data))).digest("hex");
  return scene.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh).map(mesh => ({ name: mesh.name, position: mesh.position.asArray(), rotation: mesh.rotation.asArray(),
    scaling: mesh.scaling.asArray(), enabled: mesh.isEnabled(),
    vertices: mesh.getVerticesDataKinds().sort().map(kind => [kind, digest(mesh.getVerticesData(kind)!)]),
    indices: digest(mesh.getIndices()!) })).sort((a, b) => a.name.localeCompare(b.name));
}

function sceneTest(run: (scene: Scene) => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  class TextCanvas {
    width = 512; height = 128;
    getContext() { return { clearRect() {}, fillRect() {}, fillText() {}, measureText(t: string) { return { width: t.length * 24 }; } }; }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: TextCanvas });
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try { run(scene); } finally {
    scene.dispose(); engine.dispose();
    if (previous) Object.defineProperty(globalThis, "OffscreenCanvas", previous); else Reflect.deleteProperty(globalThis, "OffscreenCanvas");
  }
}

test("a production regional revisit reconstructs live art without thousands of temporary primitive meshes", () => sceneTest(scene => {
  const art = createRegionalArt(scene, createCelMaterial(scene), createGlassMaterial(scene)), state = createGame();
  art.update(state);
  const old = scene.getMeshByName("reef.ribbon-colonies")!;
  state.player.pose.position = { x: 178, y: -160, z: -208 }; art.update(state);
  assert.ok(old.isDisposed());
  let created = 0;
  const addMesh = scene.addMesh;
  scene.addMesh = function (...args) { created++; return addMesh.apply(this, args); };
  state.player.pose.position = { x: 0, y: .18, z: 22 }; art.update(state);
  scene.addMesh = addMesh;
  assert.notStrictEqual(scene.getMeshByName(old.name), old, "reuse must create fresh live geometry handles");
  assert.ok(created < 128, `warm refuge activation created ${created} meshes, including temporary primitives`);
  assert.ok(art.cacheStats.hits > 0);
  assert.ok(art.cacheStats.bytes > 0 && art.cacheStats.bytes <= art.cacheStats.maxBytes);
  art.dispose();
  assert.equal(art.cacheStats.bytes, 0);
  assert.equal(art.cacheStats.entries, 0);
  assert.equal(art.cacheStats.disposed, true);
}));

test("the pinned carrier keeps every sign while compatible display materials fit the original trial", () => sceneTest(scene => {
  const art = createRegionalArt(scene, createCelMaterial(scene), createGlassMaterial(scene));
  createAtmosphere(scene);
  const cue = createTargetCue(scene);
  const state = fixtureGame(); art.update(state);
  assert.ok(scene.meshes.filter(m => m.name.startsWith("label.")).length >= 20, "required signs remain present");
  assert.ok(scene.materials.length <= 24, `carrier retains ${scene.materials.length} materials`);
  const signs = scene.meshes.filter(m => m.name === "label.DRY / ISOLATED");
  assert.equal(signs.length, 4);
  assert.ok(signs.every(m => m.material === signs[0]!.material), "fore/aft and berth signs share exactly the same raster/optics");
  const world = createWorldQueries();
  for (let i = 0; i < 3; i++) {
    const shell = scene.getMeshByName("carrier.physical-compartments")!;
    assert.equal(carrierCommand(state, "launch", "fixture_dart", world), null);
    updateBerth(state, world);
    art.update(state);
    assert.ok(shell.isDisposed(), "lock state gets a newly authored shell instead of a label-keyed dynamic cache hit");
    assert.equal(scene.meshes.filter(m => m.name === "label.TRANSFER / KEEP CLEAR").length, 2);
    assert.equal(scene.meshes.filter(m => m.name === "label.DRY / ISOLATED").length, 2);
    assert.equal(carrierCommand(state, "interrupt", undefined, world), null);
    art.update(state);
    assert.equal(scene.meshes.filter(m => m.name === "label.TRANSFER / KEEP CLEAR").length, 0);
    assert.equal(scene.meshes.filter(m => m.name === "label.DRY / ISOLATED").length, 4);
    assert.equal(scene.materials.length, 21, "interruption/rebuild releases obsolete sign material and texture ownership");
  }
  art.dispose();
  cue.dispose();
  assert.equal(scene.textures.length, 0);
  assert.equal(scene.materials.length, 4, "only the scene-owned cel, glass and atmosphere survive art disposal");
  assert.deepEqual(art.labelStats, { entries: 0, references: 0 });
}));

test("immutable baked data is detached, admission is bounded and disposal cannot revive it", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), cache = new GeometryCache(1);
  const make = (key: string) => {
    const batch = new ArtBatch("same human label", scene, cel, { owner: cache, key });
    batch.box([0, 1, 2], [3, 4, 5], "#123456", [.1, .2, .3]);
    return batch.finish(.25);
  };
  let mesh = make("fixed-first-generation");
  const original = identity(scene), retained = cache.stats.bytes;
  assert.ok(retained > 0); mesh.dispose();
  mesh = make("fixed-first-generation");
  assert.deepEqual(identity(scene), original);
  mesh.setVerticesData("color", new Float32Array(mesh.getTotalVertices() * 4));
  mesh.setIndices([0, 1, 2]); mesh.dispose();
  mesh = make("fixed-first-generation");
  assert.deepEqual(identity(scene), original, "changing a live color/index buffer cannot poison future geometry");
  mesh.dispose(); make("different-generation").dispose();
  assert.equal(cache.stats.entries, 1); assert.equal(cache.stats.bytes, retained);
  const refused = new GeometryCache(256, 1);
  const b = new ArtBatch("too large", scene, cel, { owner: refused, key: "fixed" });
  b.box([0, 0, 0], [1, 1, 1], "#ffffff"); b.finish().dispose();
  assert.equal(refused.stats.bytes, 0); assert.equal(refused.stats.entries, 0);
  cache.dispose(); cache.dispose();
  assert.equal(cache.read("fixed-first-generation", "late", scene, cel), null);
  assert.equal(scene.meshes.length, 0); assert.equal(cache.stats.bytes, 0);
}));

test("full and regional random generation use distinct recipes and retain exact animation poses on warm reconstruction", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), cache = new GeometryCache(), state = createGame();
  state.tick = 12345;
  const variants: readonly (RenderRegion | undefined)[] = [undefined, "refuge_reef", "island_chain", "suspended_garden", "silt_basin"];
  for (const region of variants) {
    const plain = createEcology(scene, cel, region);
    plain.update(state.tick / 60, state);
    const expected = identity(scene); plain.dispose();
    for (let pass = 0; pass < 2; pass++) {
      const cached = createEcology(scene, cel, region, cache);
      cached.setQuality("light"); cached.update(1, null);
      cached.setQuality("rich"); cached.update(state.tick / 60, state);
      assert.deepEqual(identity(scene), expected, `${region ?? "complete"}, ${pass ? "warm" : "cold"}`);
      cached.dispose();
      assert.equal(scene.meshes.length, 0); assert.equal(scene.geometries.length, 0);
    }
  }
  assert.ok(cache.stats.hits > 0 && cache.stats.entries <= cache.stats.maxEntries && cache.stats.bytes <= cache.stats.maxBytes);
  cache.dispose();
}));

test("identical display ownership releases on the last plane and reconstructs after release", () => sceneTest(scene => {
  const pool = new LabelMaterials(scene);
  const a = label(scene, "READABLE", [0, 0, 0], 1, 0, pool), b = label(scene, "READABLE", [1, 2, 3], 2, Math.PI, pool);
  const material = a.material!, texture = scene.textures[0]!;
  assert.strictEqual(a.material, b.material); assert.equal(scene.textures.length, 1);
  let disposed = 0; material.onDisposeObservable.add(() => { disposed++; });
  a.dispose(); assert.equal(disposed, 0); assert.ok(scene.textures.includes(texture));
  b.dispose(); assert.equal(disposed, 1); assert.equal(scene.materials.length, 0); assert.equal(scene.textures.length, 0);
  const c = label(scene, "READABLE", [0, 0, 0], 1, 0, pool);
  assert.notStrictEqual(c.material, material);
  pool.dispose(); pool.dispose(); c.dispose();
  assert.deepEqual(pool.stats, { entries: 0, references: 0 });
  assert.equal(scene.materials.length, 0); assert.equal(scene.textures.length, 0);
  assert.throws(() => pool.acquire("READABLE"), /Disposed/);
}));
