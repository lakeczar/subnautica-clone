/** SIM-1b: the play-timeline journal's model-based fault harness: the fixed
 * regression scripts, each the smallest found to catch one known defect (the
 * heavy tier checks they do: `timeline-model.heavy.test.ts`). */
import test from "node:test";
import assert from "node:assert/strict";
import { REGRESSIONS, runScript } from "./timeline-model-support.js";

test(`the timeline journal keeps its invariants over ${REGRESSIONS.length} regression scripts`, async () => {
  for (const script of REGRESSIONS) {
    const r = await runScript(script);
    assert.ok(r.ok, `${r.name}: ${r.failure}\n${r.log.slice(-25).join("\n")}`);
  }
});
