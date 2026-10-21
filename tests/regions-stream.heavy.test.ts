// HEAVY TIER: the production regional art with S2 composed in (WORLD_ART),
// on a NullEngine scene. Assertions compare names, counts and numbers only.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createRegionalArt, NEAR_WORLD } from "../src/render/renderer.js";
import { createCelMaterial, createGlassMaterial } from "../src/render/materials.js";
import { composeWorldArt, WORLD_ART } from "../src/render/worldArt.js";
import { S2_TERRAIN_SKIP } from "../src/content/regions/layout.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { TERRAIN_EXTENT } from "../src/render/terrainSurface.js";
import { protectedReadyState } from "./targeting-support.js";
import type { Vec3 } from "../src/sim/types.js";

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
/** Vertex, index and thin-instance bytes held by chunk meshes. */
function chunkBytes(scene: Scene): number {
  let bytes = 0;
  for (const mesh of scene.meshes) {
    if (!mesh.name.startsWith("chunk:")) continue;
    const m = mesh as Mesh;
    for (const kind of ["position", "normal", "color"]) bytes += (m.getVerticesData(kind, false, false) as Float32Array | null)?.byteLength ?? 0;
    bytes += (m.getIndices(false, true) as Uint32Array | null)?.byteLength ?? 0;
    if (m.hasThinInstances) bytes += m.thinInstanceCount * (16 + 4) * 4;
  }
  return bytes;
}

/** A work clock: every read advances 0.01 ms, so each frame's construction
 * budget is a fixed amount of work whatever the host load (these tests failed
 * once under machine load with the wall clock). Streaming, budgets and
 * settlement are asserted exactly as before. */
function workClock(): () => number { let t = 0; return () => (t += 0.01); }

test("WORLD_ART composes S2 with legacy terrain over exactly the shared skip extent", () => {
  assert.equal(S2_TERRAIN_SKIP, TERRAIN_EXTENT, "S2 skips exactly what the legacy pack draws");
  assert.deepEqual(WORLD_ART.map(p => p.id), ["legacy", "s2"]);
  const world = composeWorldArt();
  assert.equal(world.floor, worldFloor);
  const ids = world.map.layout.chunks.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, "one descriptor per column");
  assert.equal(ids.length, 224);
  const legacy = world.map.layout.chunks.filter(c => c.art.some(a => a.factory === "legacy.terrain"));
  const s2 = world.map.layout.chunks.filter(c => c.art.some(a => a.factory === "s2.terrain"));
  assert.equal(legacy.length, 16, "legacy terrain on the 16 columns of B1's extent");
  assert.equal(s2.length, 220, "S2 terrain everywhere outside the 4 fully legacy columns");
});

test("S2 regions stream through the real renderer within budget, then settle", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
  const art = createRegionalArt(scene, cel, glass, { now: workClock() });
  const state = protectedReadyState(350);
  // The pod (legacy and S2 columns side by side), the stack yard, the Rift.
  for (const p of [{ x: 0, y: 1.2, z: 22 }, { x: 470, y: -12, z: -6 }, { x: 91, y: -300, z: -888 }] as Vec3[]) {
    state.player.pose.position = { ...p };
    art.update(state);
    let stats = art.stream(p, { nearRadius: NEAR_WORLD })!;
    assert.ok(art.residency.isReady(NEAR_WORLD), `nearby ground drawn at ${p.x}, ${p.z}`);
    for (let frame = 0; frame < 6000 && !stats.settled; frame++) {
      stats = art.stream(p)!;
      assert.ok(stats.gpuBytes <= art.residency.budget.gpuBytes && !stats.overBudget, "never over budget");
      assert.ok(chunkBytes(scene) <= stats.gpuBytes - art.regionBytes + 1, "chunk buffers within what is accounted");
    }
    assert.ok(stats.settled, `settles at ${p.x}, ${p.z}`);
    const s2 = scene.meshes.filter(m => m.name.startsWith("chunk:") && m.isEnabled() && /terrain$|s2\.|structures/.test(m.name));
    assert.ok(s2.length > 0, `S2 art drawn at ${p.x}, ${p.z}`);
  }
  art.dispose();
  assert.equal(scene.meshes.length, 0); assert.equal(scene.geometries.length, 0);
}));
