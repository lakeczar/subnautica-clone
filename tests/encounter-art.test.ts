import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createExpeditionArt } from "../src/render/expedition.js";
import { createCelMaterial, createGlassMaterial } from "../src/render/materials.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";

test("hunter warning colors follow simulation state without moving geometry, leaking buffers or owning shared materials", () => {
  // Only the label canvas is stubbed; production meshes/materials run on NullEngine.
  const previous = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  class TextCanvas {
    width = 512;
    height = 128;
    getContext() {
      return { fillStyle: "", font: "", textAlign: "", textBaseline: "",
        clearRect() {}, fillRect() {}, fillText() {},
        measureText(text: string) { return { width: text.length * 24 }; } };
    }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: TextCanvas });
  const engine = new NullEngine();
  let expectedCounts: number[] | undefined;
  try {
    for (let rebuild = 0; rebuild < 4; rebuild++) {
      const scene = new Scene(engine);
      try {
        scene.useRightHandedSystem = true;
        const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
        let celDisposed = false;
        cel.onDisposeObservable.add(() => { celDisposed = true; });
        const art = createExpeditionArt(scene, cel, glass);
        const state = createGame(); completeOpening(state);
        state.tick = 9600;
        art.update(state);
        const hunter = scene.getMeshByName("ecology.sound-hunter")! as Mesh;
        const fins = [-1, 1].map(side => scene.getMeshByName(`ecology.hunter-warning-fin.${side}`)! as Mesh);
        const owned = [hunter, ...fins];
        const colors = (): number[][] => owned.map(m => Array.from(m.getVerticesData("color")!));
        const resting = colors();
        const buffers = owned.map(m => m.getVertexBuffer("color")!.getBuffer());
        const geometry = owned.map(m => [Array.from(m.getVerticesData("position")!), Array.from(m.getVerticesData("normal")!), Array.from(m.getIndices()!)]);
        const otherColors = scene.meshes.filter(m => !owned.includes(m as Mesh)).map(m => [m, Array.from(m.getVerticesData("color") ?? [])] as const);
        const counts = (): number[] => [scene.meshes.length, scene.materials.length, scene.geometries.length, scene.textures.length];
        expectedCounts ??= counts();
        assert.deepEqual(counts(), expectedCounts, "rebuild starts with bounded scene resources");

        state.world.threat.mode = "warn";
        const input = structuredClone(state);
        art.update(state);
        assert.deepEqual(state, input, "rendering cannot change encounter/save state");
        const warning = colors();
        for (let mesh = 0; mesh < owned.length; mesh++) {
          assert.notDeepEqual(warning[mesh], resting[mesh]);
          let changed = 0, unchanged = 0;
          for (let i = 0; i < warning[mesh]!.length; i += 4) {
            if (warning[mesh]![i] !== resting[mesh]![i]) {
              changed++;
              assert.equal(warning[mesh]![i + 3], -1, "selected colors use the existing emission convention");
              for (let c = 0; c < 3; c++) {
                assert.ok(warning[mesh]![i + c]! >= resting[mesh]![i + c]!);
                assert.ok(warning[mesh]![i + c]! < resting[mesh]![i + c]! * 1.5);
              }
            } else unchanged++;
          }
          assert.ok(changed > 0 && unchanged > 0, "body and inner fin retain ordinary cel colors");
        }
        for (const mode of ["investigate", "pursue"] as const) {
          state.world.threat.mode = mode; art.update(state);
          assert.deepEqual(colors(), warning, "alert modes share a continuous simulation-time display");
        }
        for (let frame = 0; frame < 20; frame++) art.update(structuredClone(state));
        assert.deepEqual(colors(), warning, "paused repeated presentations cannot advance the pulse");
        state.tick += 20; art.update(state);
        assert.notDeepEqual(colors(), warning, "advancing simulation time changes brightness");
        assert.deepEqual(owned.map(m => m.getVertexBuffer("color")!.getBuffer()), buffers);
        for (const replacement of ["disengage", "idle", null] as const) {
          state.world.threat.mode = "warn"; art.update(state);
          if (replacement) { state.world.threat.mode = replacement; art.update(state); }
          else art.update(null);
          assert.deepEqual(colors(), resting, "release/null restores exact authored colors and alpha");
        }
        assert.equal(hunter.isEnabled(), false);
        art.update(input);
        assert.deepEqual(colors(), warning, "replacing state/tick restores its deterministic display");
        for (let update = 0; update < 2000; update++) {
          state.tick = 10000 + update; state.world.threat.mode = update % 2 ? "pursue" : "warn";
          art.update(state);
        }
        assert.deepEqual(counts(), expectedCounts);
        owned.forEach((mesh, i) => {
          assert.equal(mesh.material, cel);
          assert.equal(mesh.getVertexBuffer("color")!.getBuffer(), buffers[i]);
          assert.deepEqual([Array.from(mesh.getVerticesData("position")!), Array.from(mesh.getVerticesData("normal")!), Array.from(mesh.getIndices()!)], geometry[i]);
          assert.ok([...mesh.position.asArray(), ...mesh.rotation.asArray(), ...mesh.scaling.asArray(), ...mesh.getVerticesData("color")!].every(Number.isFinite));
        });
        for (const [mesh, original] of otherColors)
          assert.deepEqual(Array.from(mesh.getVerticesData("color") ?? []), original, "other art never brightens");
        assert.ok(fins.every(m => m.parent === hunter));
        hunter.dispose(); // Includes authored child fins, never the shared material.
        assert.ok(owned.every(m => m.isDisposed()));
        assert.equal(celDisposed, false);
        assert.ok(scene.materials.includes(cel));
        art.update(null); art.update(input); // Disposed display buffers are no longer updated.
        assert.equal(celDisposed, false);
      } finally { scene.dispose(); }
      assert.equal(engine.scenes.length, 0);
      assert.deepEqual([scene.meshes.length, scene.materials.length, scene.geometries.length, scene.textures.length], [0, 0, 0, 0]);
    }
  } finally {
    engine.dispose();
    if (previous) Object.defineProperty(globalThis, "OffscreenCanvas", previous);
    else Reflect.deleteProperty(globalThis, "OffscreenCanvas");
  }
});
