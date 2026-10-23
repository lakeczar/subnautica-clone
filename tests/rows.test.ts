/** SIM-1 (SIM-02): the roster ID index always answers exactly as `find` would. */
import test from "node:test";
import assert from "node:assert/strict";
import { rowById } from "../src/sim/rows.js";

test("rowById matches find through every kind of roster change", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, n: i }));
  const check = (label: string): void => {
    for (const id of [...rows.map((r) => r.id), "absent", "r999"])
      assert.equal(rowById(rows, id), rows.find((r) => r.id === id), `${label}: ${id}`);
  };
  check("fresh");
  rows.push({ id: "r999", n: 999 });
  check("appended");
  rows.splice(10, 3);
  check("spliced");
  rows[4] = { id: "replaced", n: -1 };
  check("replaced in place");
  rows.reverse();
  check("reordered");
  rows.length = 0;
  check("emptied");
});

test("rowById returns the live row, so writes through it land in the roster", () => {
  const rows = [{ id: "a", stock: 1 }, { id: "b", stock: 2 }];
  rowById(rows, "b")!.stock = 7;
  assert.equal(rows[1]!.stock, 7);
});
