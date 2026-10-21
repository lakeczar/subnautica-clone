import test from "node:test";
import assert from "node:assert/strict";
import { HAZARD_FIELDS } from "../src/content/ecology/hazards.js";
import type { HazardFieldId } from "../src/content/ecology/hazards.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { sampleHazards, driftFrom, protectionFor } from "../src/sim/ecology/hazards.js";
import { CYCLE_BY_ID, SEDIMENT_SURGE } from "../src/content/currents/cycles.js";
import { createCurrentField } from "../src/sim/currents/flow.js";
import { fromHazardField } from "../src/sim/currents/migrate.js";
import { respondToFlow } from "../src/sim/currents/motion.js";

const CYCLES: Partial<Record<HazardFieldId, typeof SEDIMENT_SURGE>> = { basin_sediment_lane: SEDIMENT_SURGE };
test("C3 3200cc7: one composed field equals sampleHazards().flow for every moving field", () => {
  const ids = Object.keys(HAZARD_FIELDS) as HazardFieldId[];
  const volumes = ids.map(id => { const f = HAZARD_FIELDS[id]; return fromHazardField(id, f, sitePosition(f.shape.center), CYCLES[id]); })
    .filter(<T,>(x: T | null): x is T => x !== null);
  assert.deepEqual(volumes.map(v => v.id), ["current.divide_downwelling", "current.basin_sediment_lane"]);
  const field = createCurrentField(volumes, CYCLE_BY_ID);
  let nonzero = 0, n = 0, worst = 0;
  for (const id of ["divide_downwelling", "basin_sediment_lane"] as const) {
    const f = HAZARD_FIELDS[id], c = sitePosition(f.shape.center);
    for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) for (let k = -6; k <= 6; k++) for (const tick of [0, 3000, 3300, 4100, 5400, 8880, 123457]) {
      const p = { x: c.x + (f.shape.min.x + f.shape.max.x) / 2 + i * 17.3, y: c.y + (f.shape.min.y + f.shape.max.y) / 2 + k * 9.1, z: c.z + (f.shape.min.z + f.shape.max.z) / 2 + j * 13.7 };
      const want = sampleHazards(p, tick).flow, got = field.sample(p, tick).flow;
      const e = Math.abs(want.x - got.x) + Math.abs(want.y - got.y) + Math.abs(want.z - got.z);
      worst = Math.max(worst, e); n++; if (want.x || want.y || want.z) nonzero++;
      // Idle drift: S4's driftFrom with the unprotected diver vs the composed response.
      const s4 = driftFrom(sampleHazards(p, tick), protectionFor(null, []));
      const cy = respondToFlow(got, { id: "diver", authority: protectionFor(null, []).current, cruise: 3.4, drain: 0 }, { x: 0, y: 0, z: 0 }, "none").drift;
      worst = Math.max(worst, Math.abs(s4.x - cy.x) + Math.abs(s4.y - cy.y) + Math.abs(s4.z - cy.z));
    }
  }
  console.log(`samples ${n}, moving ${nonzero}, worst difference ${worst}`);
  assert.ok(worst < 1e-12 && nonzero > 1000);
});
