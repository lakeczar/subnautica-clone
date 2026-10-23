import assert from "node:assert/strict";
import test from "node:test";
import { buildCave, caveNeighbours, caveShell, sharedSpans } from "../src/content/regions/caveGeometry.js";
import { DEEP_CAVES } from "../src/content/regions/caves/deep.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { createHit } from "../src/world/collision/boxTriangle.js";
import { kitShellShapes } from "../src/world/collision/caveShapes.js";
import { createStaticCollider } from "../src/world/collision/collider.js";
import { columnCrossings, parityContradictions, random, seamGaps } from "./col1-support.js";

/** COL-1 stage A, Sol R6 (`docs/build/reviews/COL-1A-SOL-XHIGH-R6.md`): the
 * kit shell's floor snap no longer folds or flips the seam band, so the
 * mesher's outward winding holds for the final mesh. The sweep over all 55
 * shells is `col1-art.heavy.test.ts`. */

const def = buildCave(DEEP_CAVES.find(c => c.source.id === "meridian_culvert_north")!.source, worldFloor);
const sh = caveShell(def, "fine"), mesh = { positions: sh.positions, indices: Uint32Array.from(sh.indices) };
const col = createStaticCollider("culvert", kitShellShapes(def)), f = def.replacementFootprints[0]!;

/** At (x, z): support from just above the top boundary is that boundary,
 * and a tiny box falling onto it from water is stopped by the escape sweep. */
function columnAgrees(x: number, z: number): string | null {
  const hits = columnCrossings(mesh, x, z);
  if (!hits.length) return null;
  const top = hits[0]!;
  if (!(top.ny > 0)) return `top crossing at ${top.y} (triangle ${top.t}) faces down`;
  const above = { x, y: top.y + 0.01, z }, below = { x, y: top.y - 0.01, z };
  if (col.solidAt(above) || !col.solidAt(below)) return `occupancy at the top crossing ${top.y}: above ${!!col.solidAt(above)}, below ${!!col.solidAt(below)}`;
  const s = col.support(x, z, top.y + 0.05);
  if (Math.abs(s - top.y) > 1e-4) return `support ${s} against the top boundary ${top.y}`;
  const e = { x: 1e-5, y: 1e-5, z: 1e-5 }, hit = createHit();
  if (!col.escapeSweep(above, e, { x: 0, y: -0.02, z: 0 }, 0, hit)) return `escape sweep enters the solid at ${top.y}`;
  return null;
}

test("R6-1: at the reviewer's column, support agrees with the final top boundary and the escape sweep rejects entry from water", () => {
  assert.equal(columnAgrees(1224.0591227213542, -1158.9440511067708), null);
});

test("R6-1: along the snapped edge, every column's crossings agree with the volume's own parity, and support and escape agree with its top", () => {
  assert.deepEqual(parityContradictions(mesh, 4000), []);
  const rnd = random(81), bad: string[] = [];
  let tried = 0;
  for (let i = 0; i < 300; i++) {
    // Within a metre of the footprint's west edge (x = 1224), where today's snap folded.
    const x = f.minX + 1.37e-6 + rnd(), z = f.minZ + (f.maxZ - f.minZ) * rnd() + 2.91e-6;
    const r = columnAgrees(x, z);
    tried++;
    if (r) bad.push(`(${x.toFixed(4)}, ${z.toFixed(4)}): ${r}`);
  }
  assert.ok(tried === 300);
  assert.deepEqual(bad.slice(0, 5), []);
});

test("R6-1: the seam still meets the floor: every boundary vertex on an unshared side is on it", () => {
  const spans = sharedSpans(f, caveNeighbours(def));
  const shared = (x: number, z: number): boolean => spans.some(s => s.axis === "x" ? x === s.at && z >= s.lo && z <= s.hi : z === s.at && x >= s.lo && x <= s.hi);
  assert.deepEqual(seamGaps(mesh, f, shared, worldFloor).slice(0, 5), []);
});
