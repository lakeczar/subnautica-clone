import assert from "node:assert/strict";
import test from "node:test";
import { CANOPY_BASIN_GROUPS } from "../src/content/regions/caves/index.js";
import { shellOrders } from "./col1-r6-floor-support.js";

/** COL-1 R6: every Canopy and Basin group cave's shells, at both LODs, are
 * the same in every build order (fine then coarse, coarse then fine, coarse
 * alone). Heavy for its size: three fresh builds of 12 caves. */
test("R6: all 12 group caves' shells are the same whatever the build order, at both LODs", () => {
  assert.equal(CANOPY_BASIN_GROUPS.length, 12);
  assert.deepEqual(CANOPY_BASIN_GROUPS.flatMap(g => shellOrders(g.source)), []);
});
