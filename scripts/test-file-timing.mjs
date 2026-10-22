// Preloaded into each fast test process: appends one JSON line with the file's
// wall time since process start, its CPU time (user + system, all threads), its
// main-thread CPU time, the time it spent building build-cache misses
// (scripts/test-build-cache.mjs), all in ms, and its peak RSS in MiB, so
// scripts/test-tier.mjs can hold every fast file to the per-file budget. The
// budget reads the main thread: GC and compiler threads inflate most when the
// shared VM is busy.
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const log = process.env.SILTWAKE_FILE_TIMING_LOG;
if (log && process.env.NODE_TEST_CONTEXT && process.argv[1]) {
  process.on("exit", () => {
    const all = process.cpuUsage(), main = process.threadCpuUsage?.() ?? all;
    appendFileSync(log, JSON.stringify({
      file: process.argv[1], wallMs: Math.round(performance.now()), cpuMs: Math.round((all.user + all.system) / 1000),
      threadMs: Math.round((main.user + main.system) / 1000), missMs: Math.round(globalThis.__siltwakeBuildCacheMissMs ?? 0),
      maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
    }) + "\n");
  });
}
