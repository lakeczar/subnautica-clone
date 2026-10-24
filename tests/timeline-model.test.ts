/** SIM-1b: the play-timeline journal's model-based fault harness: the fixed
 * regression scripts and a small seed set (the heavy tier runs thousands, and
 * checks the harness against known mutants: `timeline-model.heavy.test.ts`).
 * Replay one sequence, at its full step count, with SILTWAKE_TIMELINE_SEED=<seed>. */
import test from "node:test";
import assert from "node:assert/strict";
import { FAST_SEEDS, MODEL_STEPS, REGRESSIONS, runModel, runScript } from "./timeline-model-support.js";

const only = process.env.SILTWAKE_TIMELINE_SEED;

if (!only) test(`the timeline journal keeps its invariants over ${REGRESSIONS.length} regression scripts`, async () => {
  for (const script of REGRESSIONS) {
    const r = await runScript(script);
    assert.ok(r.ok, `${r.name}: ${r.failure}\n${r.log.slice(-25).join("\n")}`);
  }
});

const seeds = only ? [Number(only)] : FAST_SEEDS;
test(`the timeline journal keeps its invariants over ${seeds.length} seeded fault sequences of ${MODEL_STEPS} steps`, async () => {
  for (const seed of seeds) {
    const r = await runModel(seed, MODEL_STEPS);
    assert.ok(r.ok, `${r.name}: ${r.failure}\n${r.log.slice(-25).join("\n")}`);
  }
});
