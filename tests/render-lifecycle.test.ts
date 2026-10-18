import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createExpeditionArt } from "../src/render/expedition.js";
import { createCelMaterial, createGlassMaterial } from "../src/render/materials.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { addItem } from "../src/sim/inventory.js";
import { incapacitate } from "../src/sim/recovery.js";
import { completeOpening } from "../src/sim/progression.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";

test("production expedition art reconciles cache ownership, contents and replacement without disposing shared materials", () => {
  // NullEngine does not rasterize labels. Stub only their bounded 2D text canvas.
  const previous = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  class TextCanvas {
    width = 512;
    height = 128;
    getContext() {
      return {
        fillStyle: "", font: "", textAlign: "", textBaseline: "",
        clearRect() {}, fillRect() {}, fillText() {},
        measureText(text: string) { return { width: text.length * 24 }; },
      };
    }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: TextCanvas });
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    scene.useRightHandedSystem = true;
    const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
    let celDisposed = false, glassDisposed = false;
    cel.onDisposeObservable.add(() => { celDisposed = true; });
    glass.onDisposeObservable.add(() => { glassDisposed = true; });
    const art = createExpeditionArt(scene, cel, glass);
    const baselineMeshes = scene.meshes.length;
    const baselineMaterials = scene.materials.length;
    // Synthetic loss uses the actual inventory/recovery rules to make valid records.
    const loss = createGame();
    completeOpening(loss);
    loss.player.pose.position = { x: 30, y: -4, z: 10 };
    addItem(loss, "silica_glass", 2, "diver");
    incapacitate(loss, "Renderer lifecycle fixture.");
    const cache = loss.recovery.caches[0]!;
    assert.ok(cache);
    const valid = encodeSave(createEnvelope(loss, {
      sessionId: "render-lifecycle", createdAt: "2026-10-17T12:00:00.000Z",
      savedAt: "2026-10-17T12:00:00.000Z",
    }));
    assert.ok(valid.ok, valid.ok ? "" : valid.error);
    const decoded = decodeSave(valid.value);
    assert.ok(decoded.ok);
    const freeSave = encodeSave(createEnvelope(createGame(), {
      sessionId: "cache-free-import", createdAt: "2026-10-17T12:00:00.000Z",
      savedAt: "2026-10-17T12:00:00.000Z",
    }));
    assert.ok(freeSave.ok);
    const cacheFreeImport = decodeSave(freeSave.value);
    assert.ok(cacheFreeImport.ok);
    const inputSnapshot = structuredClone(loss);
    for (const replacement of [createGame(), cacheFreeImport.value.state, null]) {
      art.update(loss);
      const mesh = scene.getMeshByName(cache.id)!;
      assert.ok(mesh?.isEnabled());
      assert.equal(mesh.material, cel);
      assert.deepEqual(mesh.position.asArray(), [30, -4, 10]);
      art.update(replacement);
      assert.equal(mesh.isDisposed(), true, "absent cache geometry must be disposed");
      assert.equal(scene.getMeshByName(cache.id), null);
      assert.equal(scene.meshes.length, baselineMeshes);
    }
    art.update(decoded.value.state);
    const retained = scene.getMeshByName(cache.id)!;
    const moved = structuredClone(loss);
    moved.recovery.caches[0]!.position = { x: 45, y: -6, z: -10 };
    art.update(moved);
    assert.strictEqual(scene.getMeshByName(cache.id), retained);
    assert.deepEqual(retained.position.asArray(), [45, -6, -10]);
    moved.inventory.items = moved.inventory.items.filter(i => i.containerId !== cache.containerId);
    art.update(moved);
    assert.equal(retained.isEnabled(), false, "empty cache has no recoverable cargo art");
    addItem(moved, "flex_membrane", 1, cache.containerId);
    art.update(moved);
    assert.ok(retained.isEnabled(), "retained ID reflects replacement cargo");
    art.update(null);
    assert.equal(retained.isDisposed(), true);
    art.update(loss);
    const reused = scene.getMeshByName(cache.id)!;
    assert.notStrictEqual(reused, retained);
    assert.ok(reused.isEnabled());
    assert.deepEqual(reused.position.asArray(), [30, -4, 10]);
    const otherLoss = createGame();
    completeOpening(otherLoss);
    addItem(otherLoss, "silica_glass", 1, "pod_locker");
    addItem(otherLoss, "meal", 1, "diver");
    incapacitate(otherLoss, "A different synthetic cache identity.");
    const otherId = otherLoss.recovery.caches[0]!.id;
    assert.notEqual(otherId, cache.id);
    for (let i = 0; i < 20; i++) {
      art.update(i % 2 ? loss : otherLoss);
      assert.equal(scene.meshes.length, baselineMeshes + 1);
      assert.ok(scene.getMeshByName(i % 2 ? cache.id : otherId)?.isEnabled());
      assert.equal(scene.getMeshByName(i % 2 ? otherId : cache.id), null);
      assert.equal(scene.materials.length, baselineMaterials);
    }
    assert.equal(celDisposed, false);
    assert.equal(glassDisposed, false);
    assert.ok(scene.materials.includes(cel) && scene.materials.includes(glass));
    assert.deepEqual(loss, inputSnapshot, "art never changes physical records or inventory");

    // The helm's real charge/hull bars belong to the craft/cockpit hierarchy.
    // Replacing a save must remove the complete hierarchy and retain shared
    // glazing/cel resources, including when that same craft ID is later reused.
    art.update(null);
    const piloting = createGame();
    const dart = makeVehicle("render-dart", "dart", { x: 20, y: -4, z: -12 }, "render-hold");
    piloting.fleet.vehicles.push(dart);
    piloting.player.controlledVehicleId = dart.id;
    piloting.player.mode = "piloting";
    piloting.player.pose = structuredClone(dart.pose);
    dart.charge = 42; dart.health = 73;
    const pilotSnapshot = structuredClone(piloting);
    art.update(piloting);
    const bars = [scene.getMeshByName(`${dart.id}.instrument.charge`)!, scene.getMeshByName(`${dart.id}.instrument.health`)!];
    assert.deepEqual(bars.map(b => b.scaling.x), [.42, .73]);
    assert.ok(bars.every(b => b.isEnabled()));
    dart.charge = 18; dart.health = 34;
    art.update(piloting);
    assert.deepEqual(bars.map(b => b.scaling.x), [.18, .34], "gauges track replaced physical values");
    piloting.player.controlledVehicleId = null;
    piloting.player.mode = "swimming";
    art.update(piloting);
    assert.ok(bars.every(b => !b.isEnabled()), "interior instruments are hidden outside the helm");
    for (const replacement of [null, createGame(), null]) {
      art.update(pilotSnapshot);
      const oldHull = scene.getMeshByName(dart.id)!;
      const oldChildren = oldHull.getChildMeshes();
      assert.deepEqual([scene.getMeshByName(`${dart.id}.instrument.charge`)!.scaling.x, scene.getMeshByName(`${dart.id}.instrument.health`)!.scaling.x], [.42, .73]);
      art.update(replacement);
      assert.ok(oldHull.isDisposed() && oldChildren.every(m => m.isDisposed()));
      assert.equal(scene.meshes.length, baselineMeshes);
      assert.equal(scene.materials.length, baselineMaterials);
      assert.equal(celDisposed || glassDisposed, false);
    }
  } finally {
    scene.dispose();
    engine.dispose();
    if (previous) Object.defineProperty(globalThis, "OffscreenCanvas", previous);
    else Reflect.deleteProperty(globalThis, "OffscreenCanvas");
  }
});

test("target brackets retain one fogged depth-tested mesh through thousands of targets and dispose once", async () => {
  const { createTargetCue } = await import("../src/render/targetCue.js");
  const { Constants } = await import("@babylonjs/core/Engines/constants.js");
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const cue = createTargetCue(scene), mesh = scene.getMeshByName("interaction.cue")!;
    const counts = [scene.meshes.length, scene.materials.length, scene.geometries.length];
    const colors = mesh.getVerticesData("color")!;
    assert.ok(colors.includes(0) && colors.includes(1), "retained bracket buffer has dark edges and light cores");
    assert.equal(mesh.isEnabled(), false);
    assert.equal(cue.material.depthFunction, Constants.LEQUAL);
    assert.equal(cue.material.disableDepthWrite, true);
    for (let i = 0; i < 2000; i++) {
      cue.update(i % 3 ? { center: { x: i, y: -3, z: 2 }, radius: 0.7, solidIds: [] } : null, undefined, i % 2 === 0);
      assert.equal(mesh.isEnabled(), i % 3 !== 0);
      assert.deepEqual([scene.meshes.length, scene.materials.length, scene.geometries.length], counts);
    }
    cue.update({ center: { x: 7, y: -2, z: 4 }, radius: 1, solidIds: [] });
    assert.deepEqual(mesh.position.asArray(), [7, -2, 4]);
    const host = { center: { x: 7, y: -2, z: 4 }, radius: 1, solidIds: [] };
    cue.update(host, { x: 7, y: -2, z: 8 });
    assert.deepEqual(mesh.position.asArray(), [7, -2, 4.9]);
    assert.ok(mesh.scaling.x < 0.3, "near-face cue keeps a modest apparent size");
    cue.update(host, { x: 7, y: -2, z: 4.2 });
    assert.equal(mesh.position.z, 4.1, "an eye inside the host cannot move the cue past the eye");
    assert.deepEqual(host.center, { x: 7, y: -2, z: 4 }, "host metadata stays detached");
    cue.update(null); assert.equal(mesh.isEnabled(), false);
    cue.dispose(); cue.dispose();
    cue.update(host, undefined, false);
    assert.ok(mesh.isDisposed(), "late preview updates cannot revive disposed geometry");
    assert.equal(scene.meshes.length, 0);
    assert.ok(!scene.materials.includes(cue.material));
  } finally { scene.dispose(); engine.dispose(); }
});
