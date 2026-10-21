import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS, RECIPES, type ItemKind, type RecipeId } from "../src/content/registry.js";
import { STRUCTURE_SOLIDS } from "../src/content/regions/structures.js";
import { VISTA_SOLIDS } from "../src/content/vistas.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import { forgetEcologyHull } from "../src/sim/ecologyLink.js";
import { addItem, usedCapacity } from "../src/sim/inventory.js";
import { outputPlacement } from "../src/sim/progression.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { recordStory } from "../src/sim/storyLink.js";
import type { GameState } from "../src/sim/types.js";
import { createWorldQueries } from "../src/sim/world.js";
import { at, creelFirst, fund, parkCreel, pilotCreel, POD_BENCH, WORKSHOP_BENCH, world } from "./b1-support.js";

const meta = { sessionId: "c3-r1-save-integrity", createdAt: "2026-10-20T00:00:00.000Z", savedAt: "2026-10-20T00:00:00.000Z" };
/** Encodes, decodes and matches: the state can be written and read back. */
function roundTrips(s: GameState): boolean {
  const e = encodeSave(createEnvelope(s, meta));
  if (!e.ok) return false;
  const d = decodeSave(e.value);
  return d.ok && JSON.stringify(d.value.state) === JSON.stringify(s);
}
// C3's new carried outputs, which the old fixed guard omitted (Sol C3-R1-1).
const NEW_CARRIED = ["glow_lures", "startle_ink", "bobbin_deep_tether", "hull_heat_lining", "hull_brine_seals", "trim_vanes"] as const;

function bench(recipeId: RecipeId): { s: GameState; locker: string } {
  const s = creelFirst(), r = RECIPES[recipeId], island = r.site === "island_workshop";
  if (island) recordStory(s, "C07");
  if ((r.needs as readonly string[]).includes("suit_450")) fund(s, "suit_450");
  at(s, island ? WORKSHOP_BENCH : POD_BENCH);
  return { s, locker: island ? "workshop_locker" : "pod_locker" };
}
/** Fill the diver hold with meals until `free` CU remain. */
const fillTo = (s: GameState, free: number): void => {
  const n = 16 - free - usedCapacity(s, "diver");
  if (n > 0) addItem(s, "meal", n, "diver");
};
const craft = (s: GameState, recipeId: RecipeId) => {
  const r = executeCommand(s, { type: "craft", recipeId }, world);
  const notice = r.events.find((e) => e.type === "notice" && e.error);
  return { state: r.state, refused: !!notice, message: notice?.type === "notice" ? notice.message : r.state.feedback };
};

test("C3-R1-1: every carried output is checked against the real hold after the ingredients are spent", () => {
  for (const id of NEW_CARRIED) assert.equal(outputPlacement(id), "diver", id);
  for (const recipeId of NEW_CARRIED) {
    const r = RECIPES[recipeId], out = ITEMS[r.output as ItemKind].cu * r.quantity;
    // Ingredients in the bench locker: refused one CU short (and when full), unchanged; paid when it just fits.
    for (const free of [0, out - 1]) {
      const { s, locker } = bench(recipeId);
      fillTo(s, free);
      for (const [k, q] of Object.entries(r.cost)) addItem(s, k as ItemKind, q as number, locker);
      assert.ok(roundTrips(s), `${recipeId}: the fixture saves`);
      const before = JSON.stringify(s.inventory), crafted = [...s.knowledge.crafted];
      const res = craft(s, recipeId);
      assert.equal(res.refused, true, `${recipeId} with ${free} CU free`);
      assert.match(res.message, /Nothing consumed/);
      assert.equal(JSON.stringify(res.state.inventory), before, `${recipeId}: nothing spent or added on refusal`);
      assert.deepEqual(res.state.knowledge.crafted, crafted);
      assert.ok(roundTrips(res.state));
    }
    {
      const { s, locker } = bench(recipeId);
      fillTo(s, out);
      for (const [k, q] of Object.entries(r.cost)) addItem(s, k as ItemKind, q as number, locker);
      const res = craft(s, recipeId);
      assert.equal(res.refused, false, `${recipeId} fits exactly: ${res.message}`);
      assert.equal(usedCapacity(res.state, "diver"), 16);
      assert.ok(validState(res.state) && roundTrips(res.state), `${recipeId}: saves after crafting`);
    }
    // Ingredients carried in a full hold: spending them first frees room, so the
    // result depends on the real volumes, and the state always stays saveable.
    {
      const { s } = bench(recipeId);
      for (const [k, q] of Object.entries(r.cost)) addItem(s, k as ItemKind, q as number, "diver");
      const carried = usedCapacity(s, "diver");
      if (carried > 16) continue;
      fillTo(s, 0);
      const ingredients = Object.entries(r.cost).reduce((n, [k, q]) => n + ITEMS[k as ItemKind].cu * (q as number), 0);
      const res = craft(s, recipeId);
      assert.equal(res.refused, out > ingredients, `${recipeId}: ${out} CU out for ${ingredients} CU in`);
      assert.ok(usedCapacity(res.state, "diver") <= 16 && validState(res.state) && roundTrips(res.state), recipeId);
    }
  }
});

test("C3-R1-2: salvaging a heat-disabled Creel drops its ecology exposure, and the save writes at once and after a step", () => {
  let s = creelFirst(["creel_350"]);
  const v = parkCreel(s, { x: -165, y: -280, z: -1065 }); pilotCreel(s); s.tick = 1800;
  let steps = 0;
  while (!s.fleet.vehicles.find((x) => x.id === v.id)!.disabled && steps < 12000) { s = stepGame(s, [], world).state; steps++; }
  assert.ok(s.fleet.vehicles.find((x) => x.id === v.id)!.disabled, "the plume disables the Creel");
  s = executeCommand(s, { type: "exit" }, world).state;
  assert.ok(s.world.ecology.hulls.some((h) => h.id === v.id), "the hull carries heat exposure");
  assert.ok(roundTrips(s), "saveable before salvage");
  const r = executeCommand(s, { type: "recover", vehicleId: v.id, method: "salvage" }, world);
  s = r.state;
  assert.ok(!s.fleet.vehicles.some((x) => x.id === v.id), r.state.feedback);
  assert.ok(!s.world.ecology.hulls.some((h) => h.id === v.id), "exposure leaves with the hull");
  assert.notEqual(s.world.ecology.controlled, v.id);
  assert.ok(roundTrips(s), "saveable immediately after salvage");
  s = stepGame(s, [], world).state;
  assert.ok(roundTrips(s), "saveable after the next step");
});

test("C3-R1-2: forgetting one hull keeps every other hull's exposure and clears only its own sentinel", () => {
  const s = creelFirst();
  const e = { heat: 40, brine: 10, episode: null } as unknown as GameState["world"]["ecology"]["diver"];
  s.world.ecology.hulls = [{ ...e, id: "gone" }, { ...e, id: "kept" }] as GameState["world"]["ecology"]["hulls"];
  s.world.ecology.controlled = "gone";
  forgetEcologyHull(s, "gone");
  assert.deepEqual(s.world.ecology.hulls.map((h) => h.id), ["kept"]);
  assert.equal(JSON.stringify(s.world.ecology.hulls[0]), JSON.stringify({ ...e, id: "kept" }));
  assert.equal(s.world.ecology.controlled, "");
  s.world.ecology.controlled = "kept"; forgetEcologyHull(s, "gone");
  assert.equal(s.world.ecology.controlled, "kept");
});

test("the default world queries collide with and are sighted through composed structures and vistas", () => {
  const q = createWorldQueries();
  for (const solid of [STRUCTURE_SOLIDS.find((x) => x.id === "isles.stack_yard.cradle_east")!, VISTA_SOLIDS[0]!]) {
    assert.ok(solid, "known solid");
    const { min, max } = solid.bounds, c = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
    const half = (max.x - min.x) / 2 + 3;
    const west = { ...c, x: c.x - half }, east = { ...c, x: c.x + half };
    assert.equal(q.lineOfSight(west, east), false, `${solid.id}: sight blocked`);
    const moved = q.moveCapsule(west, { x: 2 * half, y: 0, z: 0 }, { radius: 0.34, height: 0.95 });
    assert.equal(moved.hitSolid, true, `${solid.id}: a swimmer stops at it`);
    assert.ok(moved.position.x < min.x, solid.id);
  }
});
