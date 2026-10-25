// DISH-1, heavy tier (TT-1): dish collision against every passage, rescue tether, first access
// and carrier lane. tests/dishes.test.ts keeps the rest and a routes-only smoke.
import assert from "node:assert/strict";
import test from "node:test";
import { firstAccessProblems, rescueProblems, routeProblems, type CheckContext } from "../src/content/regions/access.js";
import { HAZARDS } from "../src/content/regions/hazards.js";
import { ROUTES } from "../src/content/regions/passages.js";
import { STRUCTURES } from "../src/content/regions/structures.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";

/** The Basin's survey dishes collide where they are drawn (P2 from the
 * POI-1 review: the drawn rims stood up to 12.9 m above their rim blocks,
 * and a diver swam straight through). Art and collision now come from one
 * source (`dishGeometry.ts`); the dense art/collision probe is
 * `dishes-envelope.heavy.test.ts`. Here: the production world stops a diver
 * at the rim and the bowl, the old blocks did not, the bowl's hollow stays
 * open for the dish sites, and every passage, tether and lane stays clear. */
const DISHES = STRUCTURES.filter(s => s.kind === "dish");

test("dish collision leaves every passage, rescue tether, first access and carrier lane clear", () => {
  const ctx: CheckContext = { floor: worldFloor, hazards: HAZARDS, solids: DISHES.flatMap(d => d.solids.map((bounds, i) => ({ id: `${d.id}.${i}`, bounds }))) };
  const problems = [...ROUTES.filter(r => r.role !== "walk").flatMap(r => routeProblems(r, ctx)), ...rescueProblems(ctx), ...firstAccessProblems(ctx)];
  assert.deepEqual(problems.filter(p => /dish/.test(p)), []);
});
