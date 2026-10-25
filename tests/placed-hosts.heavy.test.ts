import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { SOURCES } from "../src/content/registry.js";
import { PLACED_HOSTS } from "../src/content/story/placements.js";
import { createCelMaterial } from "../src/render/materials.js";
import { BUILD_DISTANCE, createPlacedHosts } from "../src/render/placedHosts.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";

test("placed hosts: build only near the camera, release far away, hide spent stock, open the inner hall with the gate, dispose clean", () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const cel = createCelMaterial(scene);
    const before = [scene.meshes.length, scene.geometries.length, scene.materials.length];
    const layer = createPlacedHosts(scene, cel), s = createGame(), built = (): string[] => [...layer.built];
    completeOpening(s);
    layer.update(s, { x: 0, y: 0, z: 0 });
    // C4: SYS-2's seed patches by the pod and the island are its only placed hosts.
    assert.deepEqual(built().sort(), ["island_salve_fronds", "reef_ribbon_cuttings", "reef_staple_cuttings"], "only the seed patches at the pod");
    const lattice = SOURCES.divide_lattice_ledge_west.position;
    layer.update(s, { ...lattice, y: lattice.y + 5 });
    assert.ok(built().includes("divide_lattice_ledge_west"), "the ledge builds as the camera arrives");
    assert.ok(built().length < 8, `only nearby hosts (${built().length})`);
    assert.equal(scene.materials.length, before[2], "shares the cel material");
    const stock = scene.getMeshByName("placed.divide_lattice_ledge_west.stock")!;
    assert.equal(stock.isEnabled(), true);
    s.world.resources.find((r) => r.id === "divide_lattice_ledge_west")!.stock = 0;
    layer.update(s, { ...lattice, y: lattice.y + 5 });
    assert.equal(stock.isEnabled(), false, "spent stock hides; the host stays");
    assert.ok(scene.getMeshByName("placed.divide_lattice_ledge_west")!.isEnabled());
    // The inner hall's finds appear only once the gate is open.
    const inner = { ...PLACED_HOSTS.C15, y: PLACED_HOSTS.C15.y + 3 };
    layer.update(s, inner);
    assert.ok(!built().includes("C15") && built().includes("C13"));
    s.story.works.gate = "open";
    layer.update(s, inner);
    assert.ok(built().includes("C15"));
    layer.update(s, { x: lattice.x + BUILD_DISTANCE * 3, y: 0, z: lattice.z });
    assert.ok(!built().includes("divide_lattice_ledge_west"), "released far away");
    layer.dispose();
    assert.deepEqual([scene.meshes.length, scene.geometries.length], before.slice(0, 2), "dispose returns the scene to baseline");
    scene.dispose();
  } finally { engine.dispose(); }
});
