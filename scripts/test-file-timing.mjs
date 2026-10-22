// Preloaded into each fast test process: appends one JSON line with the file's
// wall time since process start and its CPU time (user + system), both in ms,
// so scripts/test-tier.mjs can hold every fast file to the per-file budget.
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const log = process.env.SILTWAKE_FILE_TIMING_LOG;
if (log && process.env.NODE_TEST_CONTEXT && process.argv[1]) {
  process.on("exit", () => {
    const { user, system } = process.cpuUsage();
    appendFileSync(log, JSON.stringify({
      file: process.argv[1], wallMs: Math.round(performance.now()), cpuMs: Math.round((user + system) / 1000),
    }) + "\n");
  });
}
