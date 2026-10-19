import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createRegionalArt } from "../src/render/renderer.js";
import { createCelMaterial, createGlassMaterial } from "../src/render/materials.js";
import { SOURCE_RENEWAL, type RenewableSourceId } from "../src/content/registry.js";
import { stepGame } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import { protectedReadyState } from "./targeting-support.js";
import type { GameState, Vec3 } from "../src/sim/types.js";

const world = createWorldQueries();
const REEF = { x: -15, y: -8, z: 4 }, ISLAND = { x: 10, y: 1.2, z: -34 }, CANOPY = { x: 101, y: -98, z: -99 },
  BASIN = { x: 178, y: -160, z: -208 };
const NORTH = "reef_ribbon_catch_north", SOUTH = "reef_ribbon_catch_south", UPPER = "canopy_resin_lee_upper", LOWER = "canopy_resin_lee_lower";
const node = (s: GameState, id: RenewableSourceId) => s.world.resources.find(n => n.id === id)!;
const renewal = (s: GameState, id: RenewableSourceId) => s.world.renewal.find(r => r.id === id)!;

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

/** Ordinary fixed steps with no input, at the player's current place. */
function idle(s: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) s = stepGame(s, [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false }], world).state;
  return s;
}
const at = (s: GameState, p: Vec3): GameState => { s.player.pose.position = { ...p }; s.player.velocity = { x: 0, y: 0, z: 0 }; return s; };
const continued = (s: GameState): GameState => {
  const text = encodeSave(createEnvelope(s, { sessionId: "renewal-render", createdAt: "2026-10-19T12:00:00.000Z", savedAt: "2026-10-19T12:10:00.000Z" }));
  assert.ok(text.ok, text.ok ? "" : text.error);
  const back = decodeSave(text.value); assert.ok(back.ok, back.ok ? "" : back.error);
  return back.value.state;
};

// Accelerated setup, not ordinary play: progress starts a few steps short of the
// interval so actual stepGame steps cross the boundary while the region is away.
test("living sheds that regrow while their region is retained draw authoritative stock on return, replacement and Continue", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene), art = createRegionalArt(scene, cel, glass);
  const work = (id: RenewableSourceId): Mesh => scene.getMeshByName("source." + id) as Mesh;
  const drawn = (id: RenewableSourceId): boolean => scene.meshes.includes(work(id)) && work(id).isEnabled();
  let s = protectedReadyState(350);
  // Real depletion state; a crossed boundary on one shed and a near-miss on its twin.
  for (const id of [NORTH, SOUTH, UPPER, LOWER] as const) node(s, id).stock = 0;
  const lead = 90;
  renewal(s, NORTH).progress = SOURCE_RENEWAL[NORTH].intervalSteps - lead;
  renewal(s, SOUTH).progress = SOURCE_RENEWAL[SOUTH].intervalSteps - lead - 30;
  renewal(s, UPPER).progress = SOURCE_RENEWAL[UPPER].intervalSteps - lead;
  renewal(s, LOWER).progress = SOURCE_RENEWAL[LOWER].intervalSteps - lead - 30;
  assert.ok(validState(s));

  art.update(at(s, REEF));
  const north = work(NORTH), south = work(SOUTH);
  assert.ok(art.active.includes("refuge_reef"));
  assert.equal(drawn(NORTH) || drawn(SOUTH), false, "depleted catches start without a work face");
  art.update(at(s, CANOPY));
  const upper = work(UPPER), lower = work(LOWER);
  assert.equal(drawn(UPPER) || drawn(LOWER), false, "depleted pockets start without a work face");
  const hosted = (id: RenewableSourceId): boolean => {
    const host = scene.getMeshByName("source-host." + id);
    return !!host && scene.meshes.includes(host) && host.isEnabled();
  };
  assert.ok(hosted(UPPER) && hosted(LOWER), "an empty living pocket stays a recognizable place");

  // Away in the Basin: the reef and its catches are retained, not drawn.
  art.update(at(s, BASIN));
  assert.ok(!art.active.includes("refuge_reef") && art.retained.includes("refuge_reef"));
  s = idle(s, lead);
  assert.deepEqual([node(s, NORTH).stock, renewal(s, NORTH).progress], [2, 0], "regrowth during active steps while undrawn");
  assert.deepEqual([node(s, SOUTH).stock, renewal(s, SOUTH).progress], [0, SOURCE_RENEWAL[SOUTH].intervalSteps - 30]);
  assert.deepEqual([node(s, UPPER).stock, node(s, LOWER).stock], [2, 0]);
  art.update(s);
  assert.ok(!scene.meshes.includes(north), "still retained while the player is away");

  // Return: the same retained mesh re-attaches with the authoritative stock.
  art.update(at(s, REEF));
  assert.strictEqual(work(NORTH), north); assert.strictEqual(work(SOUTH), south);
  assert.equal(drawn(NORTH), true, "regrown catch is visible on return");
  assert.equal(drawn(SOUTH), false, "a catch short of its boundary stays empty");

  // Canopy away: at the island, the Canopy owner is retained.
  art.update(at(s, ISLAND));
  assert.ok(art.retained.includes("suspended_garden"));
  s = idle(s, 30);
  assert.deepEqual([node(s, SOUTH).stock, node(s, LOWER).stock], [2, 2]);
  art.update(at(s, CANOPY));
  assert.strictEqual(work(UPPER), upper); assert.strictEqual(work(LOWER), lower);
  assert.equal(drawn(UPPER) && drawn(LOWER), true, "both resin pockets show their regrown stock on return");
  assert.ok(hosted(UPPER) && hosted(LOWER), "the pocket host returns with its retained owner");

  // Same-page replacement with an older, depleted state: no stale refill.
  const older = structuredClone(s);
  for (const id of [UPPER, LOWER] as const) { node(older, id).stock = 0; renewal(older, id).progress = 0; }
  assert.ok(validState(older));
  art.update(older);
  assert.equal(drawn(UPPER) || drawn(LOWER), false, "replacement hides pockets its stock does not have");
  art.update(null);
  assert.ok(!scene.meshes.includes(upper), "the menu detaches regional art");
  art.update(s);
  assert.equal(drawn(UPPER) && drawn(LOWER), true, "and replacing back restores them");

  // Save → Continue in the same page, then from a fresh renderer, at both habitats.
  const restored = continued(s);
  assert.deepEqual(restored.world, s.world, "Continue keeps stock and progress exactly");
  for (const fresh of [false, true]) {
    const target = fresh ? createRegionalArt(scene, cel, glass) : art;
    if (fresh) art.dispose();
    target.update(null);
    target.update(at(structuredClone(restored), CANOPY));
    assert.equal(drawn(UPPER) && drawn(LOWER), true);
    target.update(at(structuredClone(restored), REEF));
    assert.equal(drawn(NORTH) && drawn(SOUTH), true);
    for (const id of [NORTH, SOUTH, UPPER, LOWER] as const) {
      const empty = structuredClone(restored); node(empty, id).stock = 0; renewal(empty, id).progress = 0;
      target.update(at(empty, id.startsWith("reef") ? REEF : CANOPY));
      assert.equal(drawn(id), false, `${id}: no work face without stock`);
    }
    if (fresh) target.dispose();
  }
}));
