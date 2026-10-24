/** SIG-1: the field kit's art follows state. An outpost and its socketed modules
 * build near the camera and rebuild only when what they show changes; signature
 * tools out in the world show and hide with their runtime; everything disposes. */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createCelMaterial } from "../src/render/materials.js";
import { createFieldKit } from "../src/render/fieldKit.js";
import { busyOutpost } from "./c4-systems-support.js";
import { stagedHull } from "./sig-1-support.js";

test("field kit: outposts and their modules build near the camera, rebuild on change only; tools show while out; dispose clean", () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const cel = createCelMaterial(scene);
    const before = [scene.meshes.length, scene.geometries.length, scene.materials.length], materials = scene.materials.length;
    const kit = createFieldKit(scene, cel);
    const { s, outpost } = busyOutpost();
    const o = s.systems.outposts.find((x) => x.id === outpost)!, near = { x: o.position.x + 5, y: o.position.y + 2, z: o.position.z };
    kit.update(s, { x: 1500, y: -10, z: 1500 });
    assert.ok(!kit.built.includes(`outpost.${outpost}`), "far away: nothing built");
    kit.update(s, near);
    assert.ok(kit.built.includes(`outpost.${outpost}`), "the outpost builds as the camera arrives");
    const mesh = scene.getMeshByName(`outpost.${outpost}`)!;
    kit.update(s, near);
    assert.equal(scene.getMeshByName(`outpost.${outpost}`), mesh, "unchanged state: not rebuilt");
    // A decode finishing changes what the decoder shows: the outpost rebuilds once.
    s.systems.decodes = [];
    kit.update(s, near);
    assert.notEqual(scene.getMeshByName(`outpost.${outpost}`), mesh, "the decoder's look changed: rebuilt");
    assert.ok(mesh.isDisposed(), "the old art is released");
    // A Mantle's drone, a Creel's dropped pod and line: shown while out, hidden after.
    const m = stagedHull(s, "mantle", { ...near, y: near.y - 1 }, ["mantle_drone_bay"], false);
    m.upgrades = { ...m.upgrades, drone: { position: { ...near }, yaw: 0, pitch: 0, launchedAt: s.tick } };
    kit.update(s, near);
    assert.ok(scene.getMeshByName("fieldkit.drone")!.isEnabled(), "the drone shows while it is out (seen from outside)");
    assert.equal(kit.lineMeshes, 1, "with its tether");
    m.upgrades = { ...m.upgrades, drone: null };
    kit.update(s, near);
    assert.equal(scene.getMeshByName("fieldkit.drone")!.isEnabled(), false);
    assert.equal(kit.lineMeshes, 0, "its tether released");
    // R5: replacement hulls reuse the line pool; unloading releases it.
    for (let n = 0; n < 40; n++) {
      const c = stagedHull(s, "creel", { ...near, x: near.x + 20 }, [], false);
      c.id = `creel_replaced_${n}`;
      c.upgrades = { ...c.upgrades, grapple: { anchor: { ...near }, length: 10, reeling: false, load: null } };
      kit.update(s, near);
      assert.ok(kit.lineMeshes <= 16, `bounded (${kit.lineMeshes})`);
      s.fleet.vehicles = s.fleet.vehicles.filter((v) => v !== c);
    }
    kit.update(s, near);
    assert.equal(kit.lineMeshes, 0, "no line kept for hulls that are gone");
    m.upgrades = { ...m.upgrades, drone: { position: { ...near }, yaw: 0, pitch: 0, launchedAt: s.tick } };
    kit.update(s, near);
    assert.equal(kit.lineMeshes, 1);
    kit.update(null, near);
    assert.equal(kit.lineMeshes, 0, "unloading releases every line");
    assert.equal(scene.materials.length, materials + 8, "the cel material and eight flares' (no per-frame materials)");
    kit.dispose();
    assert.deepEqual([scene.meshes.length, scene.geometries.length, scene.materials.length], before, "disposed clean");
  } finally { engine.dispose(); }
});
