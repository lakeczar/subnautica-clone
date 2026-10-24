/** SIM-1b: the play-timeline journal's model-based fault harness: a small seed
 * set (the fixed regression scripts are `timeline-model-regressions.test.ts`; the
 * heavy tier runs thousands, and checks the harness against known mutants:
 * `timeline-model.heavy.test.ts`).
 * Replay one sequence, at its full step count, with SILTWAKE_TIMELINE_SEED=<seed>. */
import test from "node:test";
import assert from "node:assert/strict";
import { FAST_SEEDS, MODEL_STEPS, runModel } from "./timeline-model-support.js";

const only = process.env.SILTWAKE_TIMELINE_SEED;

const seeds = only ? [Number(only)] : FAST_SEEDS;
test(`the timeline journal keeps its invariants over ${seeds.length} seeded fault sequences of ${MODEL_STEPS} steps`, async () => {
  for (const seed of seeds) {
    const r = await runModel(seed, MODEL_STEPS);
    assert.ok(r.ok, `${r.name}: ${r.failure}\n${r.log.slice(-25).join("\n")}`);
  }
});
