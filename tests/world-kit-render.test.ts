// HEAVY TIER: real NullEngine scene. Run through scripts/heavy-check.sh with
// --test-concurrency=1. Assertions compare names, counts and numbers only.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createCelMaterial } from "../src/render/materials.js";
import { createKitMaterial } from "../src/render/kit/material.js";
import { createKitLoader, TemplateLibrary } from "../src/render/kit/loader.js";
import { defaultContext, KIT_FACTORIES, scatterFactory, terrainFactory } from "../src/render/kit/factories.js";
import { recipeBytes } from "../src/render/kit/recipe.js";
import { templateRecipes } from "../src/render/kit/templates.js";
import { createWorldMap } from "../src/world/map.js";
import { createResidency } from "../src/world/residency.js";
import { createSliceLayout, sliceFloor } from "../src/world/sliceLayout.js";
import type { ChunkRecipe } from "../src/render/kit/types.js";

const layout = createSliceLayout({ setPieces: 0.25, parts: 120 });
const map = createWorldMap(layout);
const ctx = defaultContext(sliceFloor);
const MiB = 1024 * 1024;

function drain<T>(g: Generator<void, T>): T {
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}
function withScene(run: (scene: Scene) => void): void {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try { run(scene); } finally { scene.dispose(); engine.dispose(); }
}

test("factories are deterministic and coarse scatter is a subset of fine", () => {
  const chunk = map.chunkAt({ x: 0, y: -10, z: 14 })!;
  const scatter = chunk.art.find(a => a.factory === "scatter")!;
  const a = drain(scatterFactory.build(ctx, chunk, scatter, "fine"));
  const b = drain(scatterFactory.build(ctx, chunk, scatter, "fine"));
  const c = drain(scatterFactory.build(ctx, chunk, scatter, "coarse"));
  assert.equal(recipeBytes(a), recipeBytes(b));
  const key = (r: ChunkRecipe) => r.instances.flatMap(i => Array.from({ length: i.matrices.length / 16 },
    (_, k) => `${i.template}:${i.matrices[k * 16 + 12]!.toFixed(3)},${i.matrices[k * 16 + 14]!.toFixed(3)}`));
  const fine = new Set(key(a)), coarse = key(c);
  assert.ok(fine.size > 300, `fine instances ${fine.size}`);
  assert.ok(coarse.length > 0 && coarse.length < fine.size * 0.6, `coarse instances ${coarse.length}`);
  for (const k of coarse) assert.ok(fine.has(k), `coarse ${k} is not a fine instance`);
  assert.deepEqual(key(a), key(b));
  const t = drain(terrainFactory.build(ctx, chunk, { factory: "terrain" }, "fine")).meshes[0]!;
  // The terrain samples the physical floor exactly at its grid vertices.
  for (let v = 0; v < 65 * 65; v += 97)
    assert.equal(t.positions[v * 3 + 1], Math.fround(sliceFloor(t.positions[v * 3]!, t.positions[v * 3 + 2]!)));
});

test("kit uploads share template geometry and dispose back to the baseline", () => withScene(scene => {
  const kit = createKitMaterial(scene, createCelMaterial(scene));
  const templates = new TemplateLibrary(scene, kit, templateRecipes());
  const baseline = { meshes: scene.meshes.length, geometries: scene.geometries.length };
  const loader = createKitLoader({ scene, material: kit, templates, factories: KIT_FACTORIES, context: ctx });
  const chunk = map.chunkAt({ x: 0, y: -10, z: 14 })!;
  const prepared = drain(loader.build(chunk, "fine"));
  assert.ok(prepared.gpuBytes > 100_000);
  const art = prepared.upload();
  const own = scene.meshes.filter(m => m.name.startsWith(`${chunk.id}.fine.`));
  assert.ok(own.some(m => m.name.endsWith(".terrain.fine")), "terrain mesh");
  const batches = own.filter(m => m.hasThinInstances);
  assert.ok(batches.length >= 3, `instance batches ${batches.length}`);
  for (const b of batches) {
    const template = scene.getMeshByName(`kit.template.${b.name.slice(`${chunk.id}.fine.`.length)}.fine`)!;
    assert.equal(b.geometry === template.geometry, true, `${b.name} shares its template geometry`);
  }
  assert.equal(scene.geometries.length - baseline.geometries, own.length - batches.length, "only merged meshes add geometry");
  art.setVisible(false);
  assert.equal(own.every(m => !m.isEnabled()), true);
  art.dispose();
  assert.deepEqual({ meshes: scene.meshes.length, geometries: scene.geometries.length }, baseline);
  assert.equal(templates.geometry("frond.tall", "fine").isDisposed(), false, "templates survive chunk disposal");
  assert.equal(loader.stats.live, 0);
}));

test("ADVERSE (real kit): fast traversal with pending construction leaves no stray meshes", () => withScene(scene => {
  const kit = createKitMaterial(scene, createCelMaterial(scene));
  const templates = new TemplateLibrary(scene, kit, templateRecipes());
  const baseline = { meshes: scene.meshes.length, geometries: scene.geometries.length };
  const loader = createKitLoader({ scene, material: kit, templates, factories: KIT_FACTORIES, context: ctx });
  const residency = createResidency({ map, loader,
    budget: { cpuBytes: 48 * MiB, gpuBytes: 48 * MiB, uploadBytesPerFrame: 2 * MiB, buildMsPerFrame: 3, maxInFlight: 2, retainedUnits: 16 } });
  const start = { x: 0, y: -3, z: 14 }, end = { x: 780, y: -420, z: -1000 };
  for (let i = 0; i < 3; i++) residency.update(start);
  for (let i = 1; i <= 30; i++) {
    const t = i / 30;
    const s = residency.update({ x: end.x * t, y: start.y + (end.y - start.y) * t, z: start.z + (end.z - start.z) * t });
    assert.ok(s.building <= 2);
    // Every live mesh belongs to a tracked unit.
    const units = residency.units().filter(u => u.state === "shown" || u.state === "hidden");
    assert.equal(loader.stats.live, units.length, `frame ${i}: live art equals tracked units`);
  }
  for (let i = 0; i < 400 && !residency.isReady(); i++) residency.update(end);
  assert.equal(residency.isReady(), true);
  const s = residency.stats!;
  assert.ok(s.totals.cancelled > 0, "abandoned builds cancelled");
  assert.ok(s.gpuBytes <= 48 * MiB);
  const chunkMeshes = scene.meshes.filter(m => m.name.startsWith("chunk:"));
  assert.equal(chunkMeshes.length, loader.stats.meshes);
  residency.dispose();
  assert.deepEqual({ meshes: scene.meshes.length, geometries: scene.geometries.length }, baseline);
}));
