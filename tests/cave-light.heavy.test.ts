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
import { CEL_FRAGMENT, LIGHT_DIRECTION } from "../src/render/materials.js";
import { CAVE_CEL_FRAGMENT, CaveLighting, createCaveCelMaterial } from "../src/render/caves/caveMaterial.js";
import { CAVE_ANCHORS, CAVE_SAMPLERS, CAVE_UNIFORMS } from "../src/render/caves/caveLight.js";
import { caveLightField, SUN_DIRECTION } from "../src/render/caves/lightField.js";
import { caveDef } from "../src/content/regions/caves.js";
import { caveShell } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";

test("the cave splice finds every anchor in the production cel fragment, once", () => {
  for (const anchor of CAVE_ANCHORS) assert.equal(CEL_FRAGMENT.split(anchor).length, 2, `anchor: ${anchor}`);
  assert.ok(CAVE_CEL_FRAGMENT.includes("caveFog(shade,vWorld,cave)"));
  assert.ok(!CAVE_CEL_FRAGMENT.includes("gl_FragColor=vec4(opticalFog(shade,vWorld),1.0);"));
  // Everything the production pass computes is still there, in order.
  const kept = CEL_FRAGMENT.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("gl_FragColor"));
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
    assert.equal(scene.textures.filter(t => t.is3D).length, 2, "the empty field and the Fanvault field");
    lighting.setField(null);
    assert.equal(scene.textures.filter(t => t.is3D).length, 1, "switching caves frees the old field");
    lighting.dispose();
    assert.equal(scene.textures.filter(t => t.is3D).length, 0);
  } finally { scene.dispose(); engine.dispose(); }
});
