/** SIG-1 stage 0 (steward F12): one inventory authority. Spend priority is an
 * explicit choice, a plan is exactly what applying it does, and a room check
 * read from the plan agrees with spending a copy (F05's clone dry run). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  addItem, applySpend, cuOf, freeCapacity, hasRoom, hasRoomAfter, planSpend, usedCapacity,
} from "../src/sim/inventory.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";

function opened(): GameState {
  const s = createGame();
  completeOpening(s);
  s.inventory.items = s.inventory.items.filter((i) => i.containerId !== "diver" && i.containerId !== "pod_locker");
  return s;
}
const left = (s: GameState, container: string): number =>
  s.inventory.items.filter((i) => i.kind === "structural_alloy" && i.containerId === container).reduce((n, i) => n + i.quantity, 0);

test("spend priority is explicit: listed takes container by container, oldest takes the oldest stack anywhere", () => {
  const s = opened();
  addItem(s, "structural_alloy", 3, "pod_locker"); // older stack
  addItem(s, "structural_alloy", 3, "diver");
  const listed = planSpend(s, { structural_alloy: 4 }, ["diver", "pod_locker"], "listed");
  const oldest = planSpend(s, { structural_alloy: 4 }, ["diver", "pod_locker"], "oldest");
  assert.deepEqual(listed.lines.map((l) => [l.from, l.quantity]), [["diver", 3], ["pod_locker", 1]]);
  assert.deepEqual(oldest.lines.map((l) => [l.from, l.quantity]), [["pod_locker", 3], ["diver", 1]]);
  assert.deepEqual(listed.missing, {});
  assert.equal(planSpend(s, { structural_alloy: 4 }, ["diver"]).missing.structural_alloy, 1, "a shortfall is reported, not spent");

  const a = structuredClone(s);
  applySpend(a, oldest.lines);
  assert.deepEqual([left(a, "pod_locker"), left(a, "diver")], [0, 2], "applying the plan does exactly what it says");
  assert.ok(!a.inventory.items.some((i) => i.quantity <= 0), "spent-out stacks are removed");
});

test("fitted, maintenance and out-of-list stacks are never planned", () => {
  const s = opened();
  addItem(s, "structural_alloy", 2, "diver", null, "maintenance");
  addItem(s, "structural_alloy", 2, "workshop_locker");
  const plan = planSpend(s, { structural_alloy: 2 }, ["diver"], "oldest");
  assert.deepEqual(plan.lines, []);
  assert.equal(plan.missing.structural_alloy, 2);
});

test("a room check read from the plan agrees with spending a copy, in every container", () => {
  const s = opened();
  addItem(s, "structural_alloy", 5, "diver");
  addItem(s, "silica_glass", 4, "pod_locker");
  addItem(s, "structural_alloy", 2, "pod_locker");
  for (const cost of [{ structural_alloy: 6 }, { silica_glass: 3, structural_alloy: 1 }, { silica_glass: 4, structural_alloy: 7 }])
    for (const priority of ["listed", "oldest"] as const) {
      const plan = planSpend(s, cost, ["diver", "pod_locker"], priority);
      const after = structuredClone(s);
      applySpend(after, plan.lines);
      for (const c of ["diver", "pod_locker"])
        for (let cu = 0; cu <= 40; cu++)
          assert.equal(hasRoomAfter(s, plan, c, cu), hasRoom(after, c, cu), `${priority} ${JSON.stringify(cost)} ${c} ${cu} CU`);
    }
});

test("stacking and sizes come from the composed registry", () => {
  const s = opened();
  const a = addItem(s, "structural_alloy", 2, "diver"), b = addItem(s, "structural_alloy", 1, "diver");
  assert.equal(a, b, "materials stack");
  const k1 = addItem(s, "outpost_kit_basic", 1, "diver"), k2 = addItem(s, "outpost_kit_basic", 1, "diver");
  assert.notEqual(k1, k2, "kits stay single instances");
  const f1 = addItem(s, "small_fish", 1, "diver"), f2 = addItem(s, "small_fish", 2, "diver");
  assert.equal(f1, f2, "fauna stackables stack");
  assert.equal(usedCapacity(s, "diver"), 3 * cuOf("structural_alloy") + 2 * cuOf("outpost_kit_basic") + 3 * cuOf("small_fish"));
  const diver = s.inventory.containers.find((c) => c.id === "diver")!;
  assert.equal(freeCapacity(s, "diver"), diver.capacity - usedCapacity(s, "diver"));
  assert.equal(freeCapacity(s, "no_such_container"), 0);
  assert.equal(cuOf("not_an_item"), Infinity, "an unknown kind fails any room check closed");
});
