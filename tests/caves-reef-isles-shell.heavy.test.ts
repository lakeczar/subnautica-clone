// HEAVY TIER (expensive, no Babylon). Run through scripts/heavy-check.sh
// with --test-concurrency=1; each CA-1 heavy file is its own process.
import test from "node:test";
import assert from "node:assert/strict";
import { NEW_CAVES } from "./caves-reef-isles-heavy.js";
import { collarFailures, collarSteps, shellRockFailures, shellStats } from "./caves-reef-isles-support.js";

test("the shell and the rock agree at every shell point of every Reef and Isles cave", () => {
  const failures = NEW_CAVES.flatMap(id => [...shellRockFailures(id), ...collarFailures(id)]);
  for (const id of NEW_CAVES) {
    const s = shellStats.get(id)!;
    console.log(`  ${id}: shell within ${s.worst.toFixed(3)} m of rock (collar ${s.worstCollar.toFixed(2)} m, step ${collarSteps.get(id)!.toFixed(2)} m), ` +
      `${s.buried} of ${s.points} points face rock`);
  }
  assert.deepEqual(failures, []);
});
