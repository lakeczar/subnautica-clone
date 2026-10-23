import assert from "node:assert/strict";
import test from "node:test";
import { caveFloor } from "../src/content/regions/caves/authored.js";
import { CANOPY_BASIN_GROUPS } from "../src/content/regions/caves/index.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { random } from "./col1-support.js";
import { shellOrders } from "./col1-r6-floor-support.js";

/** COL-1 R6: a group cave's floor (`caveFloor`) memoized by a rounded key,
 * so a query got the height of whichever nearby point was asked first, and
 * a coarse shell built after its fine shell moved by up to 0.37 m. The
 * floor and the shells are now the same whatever the order. All 12 group
 * caves: `col1-r6-floor.heavy.test.ts`. */

const knot = CANOPY_BASIN_GROUPS.find(g => g.source.id === "canopy_knot_hollow")!.source;

test("R6: caveFloor gives every point its own height whatever was asked before (points sharing a 1/64 m cell included)", () => {
  const f = knot.footprint, rnd = random(64), pts: [number, number][] = [];
  // Within the edge shelf and lip, where the floor changes fastest; each with neighbours in its 1/64 m cell.
  for (let i = 0; i < 6000; i++) {
    const side = i % 4, u = rnd(), d = rnd() * 6;
    const [x, z] = side === 0 ? [f.minX + d, f.minZ + u * (f.maxZ - f.minZ)] : side === 1 ? [f.maxX - d, f.minZ + u * (f.maxZ - f.minZ)]
      : side === 2 ? [f.minX + u * (f.maxX - f.minX), f.minZ + d] : [f.minX + u * (f.maxX - f.minX), f.maxZ - d];
    pts.push([x, z], [x + rnd() / 200, z - rnd() / 200]);
  }
  const forward = caveFloor(knot, worldFloor), backward = caveFloor(knot, worldFloor);
  const a = pts.map(([x, z]) => forward(x, z)), b = new Array<number>(pts.length);
  for (let i = pts.length - 1; i >= 0; i--) b[i] = backward(pts[i]![0], pts[i]![1]);
  // Asked again, after every other point (the memo now full): unchanged.
  assert.deepEqual(pts.map(([x, z]) => forward(x, z)), a);
  assert.deepEqual(b, a);
  // A fresh floor per point is the reference: no memo at all.
  for (let i = 0; i < pts.length; i += 97) assert.equal(caveFloor(knot, worldFloor)(pts[i]![0], pts[i]![1]), a[i], `point ${i}`);
});

test("R6: Knot Hollow's shells are the same in every build order: fine then coarse, coarse then fine, coarse alone", () => {
  assert.deepEqual(shellOrders(knot), []);
});
