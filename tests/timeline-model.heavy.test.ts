/** SIM-1b: the play-timeline journal's model-based fault harness, thousands of
 * seeded sequences. Rerun one with SILTWAKE_TIMELINE_SEED=<seed> on the fast file. */
import test from "node:test";
import assert from "node:assert/strict";
import { runModel } from "./timeline-model-support.js";

const COUNT = Number(process.env.SILTWAKE_TIMELINE_SEQUENCES ?? 2000);

test(`the timeline journal keeps its invariants over ${COUNT} seeded fault sequences`, async () => {
  const failures: string[] = [];
  for (let i = 0; i < COUNT && failures.length < 5; i++) {
    const r = await runModel(1_000_003 + i * 104_729, 40);
    if (!r.ok) failures.push(`seed ${r.seed}: ${r.failure}\n${r.log.slice(-25).join("\n")}`);
  }
  assert.deepEqual(failures, []);
});
