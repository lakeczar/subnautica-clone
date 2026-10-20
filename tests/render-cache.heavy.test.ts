import test from "node:test";
import assert from "node:assert/strict";
import { digest, same } from "./render-assert.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createRegionalArt } from "../src/render/renderer.js";
import { createCelMaterial, createGlassMaterial, updateOpticalUniforms } from "../src/render/materials.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { createGame } from "../src/sim/state.js";
import { carrierCommand, fixtureGame, updateBerth } from "../src/sim/carrier.js";
import { createWorldQueries } from "../src/sim/world.js";
import { createAtmosphere } from "../src/render/atmosphere.js";
import { createTargetCue } from "../src/render/targetCue.js";
import { ArtBatch } from "../src/render/geometry.js";
import { GeometryCache } from "../src/render/geometryCache.js";
import { LabelMaterials, label } from "../src/render/landmarks.js";
import { createEcology } from "../src/render/ecology.js";
import { createExpeditionActors } from "../src/render/expedition.js";
import { makeVehicle } from "../src/sim/state.js";
import type { RenderRegion } from "../src/render/regions.js";

function identity(scene: Scene): unknown {
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

function dartIdentity(scene: Scene, id: string): unknown {
  const hull = scene.getMeshByName(id) as Mesh;
  hull.computeWorldMatrix(true);
  return [hull, ...hull.getChildMeshes()].filter((mesh): mesh is Mesh => mesh instanceof Mesh).map(mesh => {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    return {
      name: mesh.name.replace(id, "dart"), parent: mesh.parent?.name.replace(id, "dart"),
      position: mesh.position.asArray(), rotation: mesh.rotation.asArray(), scaling: mesh.scaling.asArray(),
      world: Array.from(mesh.getWorldMatrix().m), enabled: mesh.isEnabled(), visible: mesh.isVisible,
      group: mesh.renderingGroupId, material: mesh.material?.name, pickable: mesh.isPickable,
      bounds: [box.minimum, box.maximum, box.minimumWorld, box.maximumWorld].map(v => v.asArray()),
      vertices: mesh.getVerticesDataKinds().sort().map(kind => ({ kind,
        data: digest(mesh.getVerticesData(kind)),
        stride: mesh.getVertexBuffer(kind)!.getSize(), updatable: mesh.getVertexBuffer(kind)!.isUpdatable() })),
      indices: digest(mesh.getIndices()),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

test("Dart recipes preserve exact body, cockpit, gauges and fresh panes across identities and detached live buffers", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene), cache = new GeometryCache();
  const state = createGame(), dart = makeVehicle("first-dart", "dart", { x: 20, y: -4, z: -12 }, "hold");
  dart.pose.yaw = 1.23; dart.pose.pitch = -.34; dart.charge = 42; dart.health = 73;
  state.fleet.vehicles.push(dart); state.player.controlledVehicleId = dart.id;
  const before = structuredClone(state);
  const plain = createExpeditionActors(scene, cel, glass);
  plain.update(state);
  const expected = dartIdentity(scene, dart.id);
  plain.dispose();
  const art = createExpeditionActors(scene, cel, glass, undefined, undefined, cache);
  art.update(state);
  assert.deepEqual(dartIdentity(scene, dart.id), expected, "cold admission preserves every numeric attribute, bounds and hierarchy");
  const coldHull = scene.getMeshByName(dart.id)!;
  const cold = [coldHull, ...coldHull.getChildMeshes()];
  const retained = cache.stats;
  assert.equal(retained.entries, 4, "only body, cockpit and the two differently colored gauge recipes are admitted");
  assert.equal(cold.filter(m => m.name.includes(".pane.")).length, 8, "each of four panes retains its separate inside and outside faces");
  art.update(null);
  assert.ok(cold.every(m => m.isDisposed()));
  let created = 0, paneCreated = 0;
  const addMesh = scene.addMesh;
  scene.addMesh = function (...args) { created++; if (args[0].name.includes(".pane.")) paneCreated++; return addMesh.apply(this, args); };
  art.update(state);
  scene.addMesh = addMesh;
  assert.equal(created - paneCreated, 4, "cached body/cockpit/gauges create only four live meshes and no temporary primitives");
  assert.equal(paneCreated, 16, "each of eight uncached pane faces still gets its ordinary temporary and merged mesh");
  assert.deepEqual(dartIdentity(scene, dart.id), expected, "warm reconstruction preserves exact geometry and all four panes");
  assert.equal(cache.stats.hits - retained.hits, 4);
  assert.equal(cache.stats.bytes, retained.bytes);
  const first = scene.getMeshByName(dart.id) as Mesh;
  const other = structuredClone(dart); other.id = "second-dart";
  state.fleet.vehicles.push(other); state.player.controlledVehicleId = other.id;
  art.update(state);
  const second = scene.getMeshByName(other.id) as Mesh;
  for (const a of [first, ...first.getChildMeshes()].filter((mesh): mesh is Mesh => mesh instanceof Mesh)) {
    const b = [second, ...second.getChildMeshes()].find(m => m.name === a.name.replace(dart.id, other.id))!;
    assert.notStrictEqual(a.geometry, b.geometry);
    for (const kind of a.getVerticesDataKinds()) {
      const x = a.getVerticesData(kind)!, y = b.getVerticesData(kind)!;
      assert.notStrictEqual(x, y, `${a.name} ${kind} buffers are detached`);
      if (ArrayBuffer.isView(x) && ArrayBuffer.isView(y)) assert.notStrictEqual(x.buffer, y.buffer);
    }
    assert.notStrictEqual(a.getIndices(), b.getIndices());
  }
  assert.deepEqual(dartIdentity(scene, other.id), expected, "identity and controlled visibility are read from the current state");
  same(scene.getMeshByName(`${dart.id}.cockpit`)!.isEnabled(), false);
  first.setVerticesData("color", new Float32Array(first.getTotalVertices() * 4));
  first.setIndices([0, 1, 2]);
  scene.getMeshByName(`${dart.id}.instrument.charge`)!.setVerticesData("position", new Float32Array(72));
  assert.deepEqual(dartIdentity(scene, other.id), expected, "mutating one live hierarchy cannot poison another");
  art.update(null); art.update(before);
  assert.deepEqual(dartIdentity(scene, dart.id), expected, "mutated buffers and disposal cannot poison later reconstruction");
  assert.deepEqual(before.fleet.vehicles[0], dart, "rendering never writes current vehicle state");
  art.dispose(); art.dispose();
  assert.equal(scene.meshes.length, 0); assert.equal(scene.geometries.length, 0);
  assert.ok(scene.materials.includes(cel) && scene.materials.includes(glass));
  assert.equal(cache.stats.bytes, retained.bytes, "borrowed numeric recipes live until their explicit owner disposes");
  cache.dispose();
  assert.equal(cache.stats.entries, 0); assert.equal(cache.stats.bytes, 0);
  for (const limited of [new GeometryCache(1), new GeometryCache(256, 1)]) {
    const fallback = createExpeditionActors(scene, cel, glass, undefined, undefined, limited);
    for (let pass = 0; pass < 2; pass++) {
      fallback.update(before);
      assert.deepEqual(dartIdentity(scene, dart.id), expected, "partial or refused admission keeps exact uncached output");
      assert.ok(limited.stats.entries <= limited.stats.maxEntries && limited.stats.bytes <= limited.stats.maxBytes);
      fallback.update(null);
    }
    fallback.dispose(); limited.dispose();
  }
}));

test("a production regional revisit re-attaches retained art; after context loss it reconstructs from recipes", () => sceneTest(scene => {
  const art = createRegionalArt(scene, createCelMaterial(scene), createGlassMaterial(scene)), state = createGame();
  art.update(state);
  const expected = identity(scene);
  const old = scene.getMeshByName("reef.ribbon-colonies")!;
  state.player.pose.position = { x: 178, y: -160, z: -208 }; art.update(state);
  assert.ok(!old.isDisposed() && !scene.meshes.includes(old), "a retained owner leaves the scene without releasing buffers");
  assert.ok(old.geometry && !scene.geometries.includes(old.geometry));
  assert.deepEqual(new Set(art.retained), new Set(["refuge_reef", "island_chain"]));
  let created = 0;
  const addMesh = scene.addMesh;
  scene.addMesh = function (...args) { created++; return addMesh.apply(this, args); };
  const hits = art.cacheStats.hits;
  state.player.pose.position = { x: 0, y: .18, z: 22 }; art.update(state);
  same(scene.getMeshByName(old.name), old, "a warm return re-attaches the same live handles");
  assert.equal(art.cacheStats.hits, hits, "re-attachment reads no recipes");
  assert.deepEqual(identity(scene), expected, "re-attached art equals its first construction exactly");
  state.player.pose.position = { x: 178, y: -160, z: -208 }; art.update(state);
  // Detached buffers are not rebuilt by the engine, so loss releases retention.
  scene.getEngine().onContextLostObservable.notifyObservers(scene.getEngine() as never);
  assert.ok(old.isDisposed() && art.retained.length === 0);
  created = 0;
  state.player.pose.position = { x: 0, y: .18, z: 22 }; art.update(state);
  scene.addMesh = addMesh;
  assert.notStrictEqual(scene.getMeshByName(old.name), old, "reconstruction after loss creates fresh live geometry handles");
  assert.ok(created < 128, `recipe reconstruction created ${created} meshes, including temporary primitives`);
  assert.ok(art.cacheStats.hits > hits);
  assert.deepEqual(identity(scene), expected, "recipe reconstruction equals the first construction");
  assert.ok(art.cacheStats.bytes > 0 && art.cacheStats.bytes <= art.cacheStats.maxBytes);
  art.dispose();
  assert.equal(art.cacheStats.bytes, 0);
  assert.equal(art.cacheStats.entries, 0);
  assert.equal(art.cacheStats.disposed, true);
  assert.equal(scene.meshes.length, 0); assert.equal(scene.geometries.length, 0);
}));

test("the pinned carrier keeps every sign while compatible display materials fit the original trial", () => sceneTest(scene => {
  const art = createRegionalArt(scene, createCelMaterial(scene), createGlassMaterial(scene));
  createAtmosphere(scene);
  const cue = createTargetCue(scene);
  const state = fixtureGame(); art.update(state);
  assert.ok(scene.meshes.filter(m => m.name.startsWith("label.")).length >= 20, "required signs remain present");
  // C1: S3's Hearthline names its seven rooms and its hull and drops the three old
  // carrier signs; one shared material per sign text keeps the carrier at 26.
  assert.ok(scene.materials.length <= 26, `carrier retains ${scene.materials.length} materials`);
  const signs = scene.meshes.filter(m => m.name === "label.DRY / ISOLATED");
  assert.equal(signs.length, 4);
  assert.ok(signs.every(m => m.material === signs[0]!.material), "fore/aft and berth signs share exactly the same raster/optics");
  const world = createWorldQueries();
  for (let i = 0; i < 3; i++) {
    const shell = scene.getMeshByName("fixture_hearthline.shell")!;
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
    assert.equal(scene.materials.length, 26, "interruption/rebuild releases obsolete sign material and texture ownership");
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
  same(a.material, b.material); assert.equal(scene.textures.length, 1);
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

test("Pale Basin water is silt-pale at depth, unchanged on the Canopy route and continuous across its edge", () => sceneTest(scene => {
  const cel = createCelMaterial(scene);
  const fog = (x: number, y: number, z: number) => {
    updateOpticalUniforms([cel], new Vector3(x, y, z), null);
    const c = (cel as unknown as { _colors3: Record<string, Color3> })._colors3.waterFogColor!;
    return { c, luminance: .2126 * c.r + .7152 * c.g + .0722 * c.b, density: (cel as unknown as { _floats: Record<string, number> })._floats.fogDensity! };
  };
  const deep = (depth: number) => Color3.Lerp(Color3.FromHexString("#237e89"), Color3.FromHexString("#0b3048"),
    ((t: number) => t * t * (3 - 2 * t))(Math.max(0, Math.min(1, (depth - 15) / 175))));
  for (const [x, y, z] of [[57, -10, -65], [126, -118, -120], [146, -142, -166], [0, -4, 10]] as const)
    assert.ok(fog(x, y, z).c.equalsWithEpsilon(deep(-y), 1e-6), `route pose ${x},${y},${z} keeps its existing water`);
  const parking = fog(172, -153, -196), site = fog(216, -166, -232);
  assert.ok(parking.luminance > deep(153).toLuminance() * 2 && site.luminance > deep(166).toLuminance() * 2, "Basin water reads pale");
  const blend = (low: number, high: number, v: number) => { const t = Math.max(0, Math.min(1, (v - low) / (high - low))); return t * t * (3 - 2 * t); };
  assert.ok(Math.abs(parking.density - (.009 + blend(98, 175, 153) * .014)) < 1e-9, "haze density is unchanged");
  let previous = fog(162, -152, -160).luminance;
  for (let z = -161; z >= -200; z--) {
    const next = fog(162, -152, z).luminance;
    assert.ok(Math.abs(next - previous) < .02, `no visible step at z=${z}`);
    previous = next;
  }
}));
