// Reads the compiled production registry. The proposal JSON is compared, never loaded by the game.
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  RECIPES,
  SOURCES,
  ITEMS,
} from "../.test-build/src/content/registry.js";
const candidate = JSON.parse(
  fs.readFileSync(
    new URL("../docs/build/design/economy-candidate.json", import.meta.url),
    "utf8",
  ),
);
for (const [id, r] of Object.entries(RECIPES)) {
  assert.deepEqual(
    r.cost,
    candidate.recipes[id].cost,
    `${id}: reconcile material changes`,
  );
}
const spend = {},
  stock = {},
  patches = {};
for (const r of Object.values(RECIPES))
  if (!r.maintenance)
    for (const [k, n] of Object.entries(r.cost)) spend[k] = (spend[k] ?? 0) + n;
for (const s of Object.values(SOURCES)) {
  stock[s.item] = (stock[s.item] ?? 0) + s.stock;
  (patches[s.item] ??= []).push(s.label);
}
for (const [m, n] of Object.entries(spend)) {
  assert.ok(stock[m] >= n);
  assert.ok(patches[m].length >= 2);
}
const cu = Object.entries(spend).reduce((n, [k, q]) => n + ITEMS[k].cu * q, 0);
console.log(
  JSON.stringify(
    {
      scope:
        "Implemented M1 subset; arithmetic only, not physical/ordinary-input acceptance",
      publicSpend: spend,
      rawCu: cu,
      stock,
      remaining: Object.fromEntries(
        Object.entries(spend).map(([k, n]) => [k, stock[k] - n]),
      ),
      maintenanceKitSpend: RECIPES.bobbin_kit.cost,
      meals: stock.meal,
      reserveCells: 2,
      buoyCu: 24,
      dartHoldCu: 32,
    },
    null,
    2,
  ),
);
