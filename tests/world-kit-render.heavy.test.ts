// HEAVY TIER: real NullEngine scene. Run through scripts/heavy-check.sh with
// --test-concurrency=1. Assertions compare names, counts and numbers only.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
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
import { drain } from "./shared-support.js";

const layout = createSliceLayout({ setPieces: 0.25, parts: 120 });
const map = createWorldMap(layout);
const ctx = defaultContext(sliceFloor);
const MiB = 1024 * 1024;

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

test("kit batches own geometry over shared template arrays and dispose back to the baseline", () => withScene(scene => {
  const kit = createKitMaterial(scene, createCelMaterial(scene));
  const templates = new TemplateLibrary(templateRecipes());
  const baseline = { meshes: scene.meshes.length, geometries: scene.geometries.length };
  const loader = createKitLoader({ scene, material: kit, templates, factories: KIT_FACTORIES, context: ctx });
  const chunk = map.chunkAt({ x: 0, y: -10, z: 14 })!;
  const prepared = drain(loader.build(chunk, "fine"));
  assert.ok(prepared.gpuBytes > 100_000);
  const art = prepared.upload();
  const own = scene.meshes.filter(m => m.name.startsWith(`${chunk.id}.fine.`));
  assert.ok(own.some(m => m.name.endsWith(".terrain.fine")), "terrain mesh");
  const batches = own.filter(m => m.hasThinInstances) as Mesh[];
  assert.ok(batches.length >= 3, `instance batches ${batches.length}`);
  // Babylon keeps thin-instance buffers on the geometry: each batch owns one,
  // built over the template's shared CPU arrays.
  assert.equal(new Set(batches.map(b => b.geometry)).size, batches.length, "one geometry per batch");
  for (const b of batches) {
    const template = templates.recipe(b.name.slice(`${chunk.id}.fine.`.length), "fine");
    assert.equal(b.getVerticesData("position", false, false) === template.positions, true, `${b.name} shares template positions`);
    assert.equal(b.thinInstanceCount > 0, true);
  }
  assert.equal(scene.geometries.length - baseline.geometries, own.length, "one geometry per mesh");
  assert.equal(art.gpuBytes > prepared.cpuBytes, true, "per-batch template buffers are counted on the GPU");
  art.setVisible(false);
  assert.equal(own.every(m => !m.isEnabled()), true);
  art.dispose();
  assert.deepEqual({ meshes: scene.meshes.length, geometries: scene.geometries.length }, baseline);
  assert.equal(loader.stats.live, 0);
}));

test("ADVERSE (real kit): fast traversal with pending construction leaves no stray meshes", () => withScene(scene => {
  const kit = createKitMaterial(scene, createCelMaterial(scene));
  const templates = new TemplateLibrary(templateRecipes());
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

/** Bytes really held by chunk meshes: vertex data, indices, instance buffers. */
function chunkSceneBytes(scene: Scene): number {
  let bytes = 0;
  for (const mesh of scene.meshes) {
    if (!mesh.name.startsWith("chunk:")) continue;
    const m = mesh as Mesh;
    for (const kind of ["position", "normal", "color"]) {
      const data = m.getVerticesData(kind, false, false, true);
      if (data) bytes += (data as Float32Array).byteLength ?? data.length * 4;
    }
    const indices = m.getIndices(false, true);
    if (indices) bytes += (indices as Uint16Array).byteLength ?? indices.length * 4;
    if (m.hasThinInstances) bytes += m.thinInstanceCount * 64 + (m.getVertexBuffer("instanceColor") ? m.thinInstanceCount * 16 : 0);
  }
  return bytes;
}

test("REVIEW S1-01 (real kit): an over-budget fine chunk is shown coarse and never exceeds the budget", () => withScene(scene => {
  const p = { x: 0, y: -3, z: 14 };
  const one = { ...map.chunkAt(p)!, art: [{ factory: "terrain" }] };
  const solo = createWorldMap({ ...layout, chunks: [one] });
  const loader = createKitLoader({ scene, material: createKitMaterial(scene, createCelMaterial(scene)),
    templates: new TemplateLibrary(templateRecipes()), factories: KIT_FACTORIES, context: ctx, maxPartBytes: 32 * 1024 });
  const budget = 64 * 1024;
  const residency = createResidency({ map: solo, loader,
    budget: { cpuBytes: budget, gpuBytes: budget, uploadBytesPerFrame: budget } });
  for (let i = 0; i < 100; i++) {
    const s = residency.update(p);
    const actual = chunkSceneBytes(scene);
    assert.ok(actual <= s.gpuBytes && s.gpuBytes <= budget, `frame ${i}: ${actual} B in scene, ${s.gpuBytes} accounted, budget ${budget}`);
    assert.equal(s.uploadOverrunBytes, 0);
  }
  const s = residency.stats!;
  assert.equal(residency.isReady(), true);
  assert.ok(s.demoted === 1 && s.totals.overBudgetDiscards >= 1, "fine was measured once, dropped, and the chunk demoted");
  assert.deepEqual(residency.units().filter(u => u.state === "shown").map(u => u.key), [`${one.id}@coarse`]);
  residency.dispose();
  assert.equal(scene.meshes.filter(m => m.name.startsWith("chunk:")).length, 0);
}));

test("REVIEW S1-01 (real kit): a coarse chunk that cannot fit is refused, reported, and not ready", () => withScene(scene => {
  const p = { x: 0, y: -3, z: 14 };
  const one = { ...map.chunkAt(p)!, art: [{ factory: "terrain" }] };
  const solo = createWorldMap({ ...layout, chunks: [one] });
  const loader = createKitLoader({ scene, material: createKitMaterial(scene, createCelMaterial(scene)),
    templates: new TemplateLibrary(templateRecipes()), factories: KIT_FACTORIES, context: ctx, maxPartBytes: 4 * 1024 });
  const budget = 8 * 1024;
  const residency = createResidency({ map: solo, loader, budget: { cpuBytes: budget, gpuBytes: budget, uploadBytesPerFrame: budget } });
  for (let i = 0; i < 100; i++) {
    const s = residency.update(p);
    assert.ok(chunkSceneBytes(scene) <= budget && s.gpuBytes <= budget, `frame ${i}`);
  }
  assert.deepEqual(residency.stats!.refused.map(r => `${r.chunk}@${r.lod}`), [`${one.id}@coarse`]);
  assert.equal(residency.isReady(), false);
  residency.dispose();
}));

function soloKit(scene: Scene, cap: number) {
  const home = { x: 0, y: -3, z: 14 };
  const chunk = { ...map.chunkAt(home)!, art: [{ factory: "terrain" }] };
  const solo = createWorldMap({ ...layout, chunks: [chunk] });
  const loader = createKitLoader({ scene, material: createKitMaterial(scene, createCelMaterial(scene)),
    templates: new TemplateLibrary(templateRecipes()), factories: KIT_FACTORIES, context: ctx, maxPartBytes: 32 * 1024 });
  const residency = createResidency({ map: solo, loader, budget: { cpuBytes: cap, gpuBytes: cap, uploadBytesPerFrame: cap } });
  const enabled = (): number => scene.meshes.filter(m => m.name.startsWith("chunk:") && m.isEnabled()).length;
  return { home, chunk, residency, enabled };
}

test("REVIEW S1-04 (real kit): approaching coarse terrain under 256 KiB never leaves the chunk undrawn", () => withScene(scene => {
  const h = soloKit(scene, 256 * 1024);
  for (let i = 0; i < 150; i++) h.residency.update({ x: h.chunk.bounds.max.x + 150, y: -3, z: 14 });
  assert.equal(h.residency.stats!.shown, 1, "coarse is initially shown");
  for (let i = 0; i < 150; i++) {
    const s = h.residency.update(h.home);
    assert.ok(h.enabled() > 0, `frame ${s.frame}: terrain drawn`);
    assert.ok(s.gpuBytes <= 256 * 1024 && !s.overBudget);
  }
  const s = h.residency.stats!;
  // Fine (~239 KB) fits alone but not beside the drawn coarse (~23 KB):
  // the chunk is held at coarse, reported, and settled; never ready.
  assert.equal(s.held, 1);
  assert.equal(s.settled, true);
  assert.equal(h.residency.isReady(), false);
  h.residency.dispose();
}));

test("REVIEW S1-05 (real kit): terrain that fits the share left by external owners is measured and drawn", () => withScene(scene => {
  const h = soloKit(scene, 1024 * 1024);
  h.residency.setExternalBytes({ cpu: 900 * 1024, gpu: 900 * 1024 });
  for (let i = 0; i < 150; i++) {
    const s = h.residency.update(h.home);
    assert.ok(s.gpuBytes <= 1024 * 1024 && !s.overBudget, `frame ${s.frame}`);
  }
  const s = h.residency.stats!;
  assert.equal(s.refused.length, 0);
  assert.equal(s.shown, 1);
  assert.deepEqual(h.residency.units().filter(u => u.state === "shown").map(u => u.lod), ["coarse"], "fine (~239 KB) demoted");
  assert.equal(h.residency.isReady(), true);
  h.residency.dispose();
}));
