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
    const before = [scene.meshes.length, scene.geometries.length, scene.materials.length];
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
    assert.ok(scene.getMeshByName(`fieldkit.line.tether.${m.id}`)!.isEnabled(), "with its tether");
    m.upgrades = { ...m.upgrades, drone: null };
    kit.update(s, near);
    assert.equal(scene.getMeshByName("fieldkit.drone")!.isEnabled(), false);
    assert.equal(scene.getMeshByName(`fieldkit.line.tether.${m.id}`)!.isEnabled(), false);
    assert.equal(scene.materials.length, before[2] + 1 + 8, "the cel material, the pulse's and eight flares' (no per-frame materials)");
    kit.dispose();
    assert.deepEqual([scene.meshes.length, scene.geometries.length, scene.materials.length], before, "disposed clean");
  } finally { engine.dispose(); }
});
