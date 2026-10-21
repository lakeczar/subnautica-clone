import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createCelMaterial } from "../src/render/materials.js";
import { createCreatureLayer } from "../src/render/creatures/layer.js";
import { createEcology, ecologyView } from "../src/sim/ecology/ecology.js";
import { homeOf } from "../src/sim/ecology/agents.js";
import type { AgentMode } from "../src/sim/ecology/types.js";

/** Names only: never deep-compare live Babylon objects (B1 render-assert rule). */
const names = (meshes: readonly { name: string }[]): string[] => meshes.map(m => m.name).sort();

test("creature layer: bounded build/dispose, read-only updates, and distinct warning displays", () => {
  const engine = new NullEngine();
  try {
    let baseline: number[] | undefined, expectedNames: string[] | undefined;
    for (let rebuild = 0; rebuild < 3; rebuild++) {
      const scene = new Scene(engine);
      scene.useRightHandedSystem = true;
      const cel = createCelMaterial(scene);
      const before = [scene.meshes.length, scene.materials.length, scene.geometries.length, scene.transformNodes.length];
      const layer = createCreatureLayer(scene, cel);
      expectedNames ??= names(layer.meshes);
      assert.deepEqual(names(layer.meshes), expectedNames, "same owned meshes on every rebuild");
      assert.equal(scene.materials.length, before[1], "layer creates no materials; it shares the cel");
      baseline ??= [scene.meshes.length, scene.geometries.length];
      assert.deepEqual([scene.meshes.length, scene.geometries.length], baseline, "bounded scene resources per build");

      const state = createEcology(), view = ecologyView(state, 0, null);
      const frozen = structuredClone(state);
      const stalker = layer.meshes.find(m => m.name === "creature.glare_stalker.rift_stalker_passage.segment.3")! as Mesh;
      const colors = (mode: AgentMode, seconds: number): number[] => {
        const v = structuredClone(view);
        for (const t of v.threats) t.mode = mode;
        // Settle the eased postures exactly as playback would.
        for (let k = 0; k < 40; k++) layer.update(v, seconds + k * 0.05, homeOf("rift_stalker_passage"));
        return Array.from(stalker.getVerticesData("color")!);
      };
      const rest = colors("rest", 0), commit = colors("commit", 10);
      assert.deepEqual(state, frozen, "rendering never writes ecology state");
      const lit = (c: number[]): number => c.filter((x, i) => i % 4 === 3 && x < 0).length;
      assert.ok(lit(rest) > 0 && lit(commit) === 0, "rest shows lit photophores; a lunge turns every light dark");

      // Measured, not asserted: per-update cost of the full layer under NullEngine.
      const v = structuredClone(view);
      const t0 = performance.now();
      for (let k = 0; k < 120; k++) layer.update(v, 20 + k / 60, homeOf("district_choir_gallery"));
      if (rebuild === 0) console.log(`creature layer update: ${((performance.now() - t0) / 120).toFixed(2)} ms/frame, ${layer.meshes.length} meshes`);

      layer.dispose();
      assert.deepEqual([scene.meshes.length, scene.materials.length, scene.geometries.length, scene.transformNodes.length], before,
        "dispose releases every mesh, geometry and node and keeps the shared cel");
      assert.ok(scene.materials.includes(cel), "the shared cel survives the layer");
      scene.dispose();
    }
  } finally {
    engine.dispose();
  }
});
