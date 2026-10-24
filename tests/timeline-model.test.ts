/** SIM-1b: the play-timeline journal's model-based fault harness, a small fixed
 * seed set (the heavy tier runs thousands: `timeline-model.heavy.test.ts`).
 * Rerun one sequence with SILTWAKE_TIMELINE_SEED=<seed>. */
import test from "node:test";
import assert from "node:assert/strict";
import { runModel } from "./timeline-model-support.js";

const only = process.env.SILTWAKE_TIMELINE_SEED;
const seeds = only ? [Number(only)] : Array.from({ length: 24 }, (_, i) => 101 + i * 7919);

test(`the timeline journal keeps its invariants over ${seeds.length} seeded fault sequences`, async () => {
  for (const seed of seeds) {
    const r = await runModel(seed, 30);
    assert.ok(r.ok, `seed ${r.seed}: ${r.failure}\n${r.log.slice(-25).join("\n")}`);
  }
});
