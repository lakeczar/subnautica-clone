// HEAVY TIER: real NullEngine scene. Run through scripts/heavy-check.sh with
// --test-concurrency=1. Assertions compare names, counts and numbers only.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { InternalTexture, InternalTextureSource } from "@babylonjs/core/Materials/Textures/internalTexture.js";
import { BASE_CEL_FRAGMENT, CEL_FRAGMENT, CEL_SAMPLERS, CEL_UNIFORMS, LIGHT_DIRECTION } from "../src/render/materials.js";
import { CAVE_CEL_FRAGMENT, CaveLighting, createCaveCelMaterial } from "../src/render/caves/caveMaterial.js";
import { CAVE_ANCHORS, CAVE_SAMPLERS, CAVE_UNIFORMS, injectCaveLight } from "../src/render/caves/caveLight.js";
import { caveLightField, SUN_DIRECTION } from "../src/render/caves/lightField.js";
import { caveDef } from "../src/content/regions/caves.js";
import { caveShell } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";

test("the production cel fragment carries the cave splice exactly once (C4: materials.ts owns it)", () => {
  for (const anchor of CAVE_ANCHORS) assert.equal(BASE_CEL_FRAGMENT.split(anchor).length, 2, `anchor: ${anchor}`);
  assert.equal(CEL_FRAGMENT, injectCaveLight(BASE_CEL_FRAGMENT));
  assert.equal(CAVE_CEL_FRAGMENT, CEL_FRAGMENT, "the cave material uses the production fragment as is");
  assert.throws(() => injectCaveLight(CEL_FRAGMENT), /anchor/, "a second splice is refused");
  assert.ok(CAVE_CEL_FRAGMENT.includes("caveFog(shade,vWorld,cave)"));
  assert.ok(!CAVE_CEL_FRAGMENT.includes("gl_FragColor=vec4(opticalFog(shade,vWorld),1.0);"));
  for (const u of [...CAVE_UNIFORMS]) assert.ok(CEL_UNIFORMS.includes(u), u);
  assert.deepEqual([...CEL_SAMPLERS], [...CAVE_SAMPLERS]);
  // Everything the production pass computes is still there, in order.
  const kept = BASE_CEL_FRAGMENT.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("gl_FragColor"));
  let at = 0;
  for (const line of kept) { const next = CAVE_CEL_FRAGMENT.indexOf(line, at); assert.ok(next >= 0, `lost: ${line}`); at = next; }
});

test("the light field's sun is the cel light direction", () => {
  const d = LIGHT_DIRECTION.clone().normalize();
  assert.ok(Math.abs(d.x - SUN_DIRECTION.x) < 1e-9 && Math.abs(d.y - SUN_DIRECTION.y) < 1e-9 && Math.abs(d.z - SUN_DIRECTION.z) < 1e-9);
});

test("cave material, field texture and shell build and dispose in a scene", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  // NullEngine has no GL context for 3D textures; stand in a raw texture.
  // The shader path itself runs on a GPU in tools/cave-gpu-check.mjs.
  Object.assign(engine, { createRawTexture3D: (_: unknown, w: number, h: number, d: number) =>
    Object.assign(new InternalTexture(engine, InternalTextureSource.Raw3D), { width: w, height: h, depth: d, is3D: true }) });
  try {
    const material = createCaveCelMaterial(scene);
    for (const u of CAVE_UNIFORMS) assert.ok(material.options.uniforms.includes(u), u);
    for (const s of CAVE_SAMPLERS) assert.ok(material.options.samplers.includes(s), s);
    const def = caveDef("fanvault", worldFloor), field = caveLightField(def, worldFloor);
    const lighting = new CaveLighting(scene, [material]);
    lighting.setField(field);
    lighting.apply({ on: true, position: new Vector3(-289, -22, -62), direction: new Vector3(0, -0.2, -1).normalize() });
    const shell = caveShell(def, "fine"), mesh = new Mesh(shell.name, scene), data = new VertexData();
    data.positions = shell.positions; data.normals = shell.normals; data.colors = shell.colors; data.indices = shell.indices;
    data.applyToMesh(mesh);
    mesh.material = material;
    assert.equal(mesh.getTotalVertices(), shell.positions.length / 3);
    assert.equal(scene.textures.filter(t => t.is3D).length, 4, "empty and Fanvault light fields and rock grids");
    lighting.setField(null);
    assert.equal(scene.textures.filter(t => t.is3D).length, 2, "switching caves frees the old field and rock");
    lighting.dispose();
    assert.equal(scene.textures.filter(t => t.is3D).length, 0);
  } finally { scene.dispose(); engine.dispose(); }
});

test("C4: the renderer's cave view activates the nearest cave, feeds the cel material, and frees it", async () => {
  const { createCaveView, CAVE_ACTIVE_RANGE } = await import("../src/render/caves/caveView.js");
  const { createCelMaterial } = await import("../src/render/materials.js");
  const { createCurrentStreaks } = await import("../src/render/currentStreaks.js");
  const engine = new NullEngine(), scene = new Scene(engine);
  Object.assign(engine, { createRawTexture3D: (_: unknown, w: number, h: number, d: number) =>
    Object.assign(new InternalTexture(engine, InternalTextureSource.Raw3D), { width: w, height: h, depth: d, is3D: true }) });
  try {
    const cel = createCelMaterial(scene);
    for (const s of CAVE_SAMPLERS) assert.ok(cel.options.samplers.includes(s), s);
    const view = createCaveView(scene, [cel]);
    // Idle time builds one cave's field per call (W2 added the hub caves).
    const { CAVE_SOURCES } = await import("../src/content/regions/caves.js");
    let built = 0;
    while (view.prepare()) assert.ok(++built <= CAVE_SOURCES.length, "prepare keeps finding work");
    assert.equal(built, CAVE_SOURCES.length, "idle time builds every cave's field, then has nothing left to do");
    view.update(new Vector3(0, -2, 20), new Vector3(0, 0, -1), true);
    assert.equal(view.active, null, "the pod is far from every cave");
    assert.equal(scene.textures.filter(t => t.is3D).length, 2, "only the empty field and rock");
    view.update(new Vector3(-289, -22, -62), new Vector3(0, 0, -1), false);
    assert.equal(view.active, "fanvault");
    assert.equal(scene.textures.filter(t => t.is3D).length, 4);
    view.update(new Vector3(-316 - CAVE_ACTIVE_RANGE - 1, -20, -60), new Vector3(0, 0, -1), false);
    assert.equal(view.active, null, "beyond the active range the cave draws as open water");
    assert.equal(scene.textures.filter(t => t.is3D).length, 2, "and its textures are freed");
    // Current streaks: a cel thin-instance batch, empty far from any current.
    const streaks = createCurrentStreaks(scene, cel);
    streaks.update({ x: 0, y: -2, z: 20 }, 60, true);
    assert.equal(streaks.shown, 0);
    for (let t = 0; t < 10; t++) streaks.update({ x: -342, y: -36, z: -115 }, 60 + t, true);
    assert.ok(streaks.shown > 20, `${streaks.shown} streaks in the shelf race`);
    streaks.update({ x: -342, y: -36, z: -115 }, 80, false);
    assert.equal(streaks.shown, 0, "hidden out of the water");
    streaks.dispose(); view.dispose();
    assert.equal(scene.textures.filter(t => t.is3D).length, 0);
  } finally { scene.dispose(); engine.dispose(); }
});
