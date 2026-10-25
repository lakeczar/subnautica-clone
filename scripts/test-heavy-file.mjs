// Preloaded into each heavy test file's process (scripts/test-tier.mjs): on exit it
// writes that process's CPU time, peak RSS and build-cache use (hits, misses, fills and
// the CPU the fills took) to $SILTWAKE_HEAVY_FILE_STATS.<pid>, for the file's stored
// result. Keyed by pid, so a forked child that inherits this preload never overwrites it.
import { writeFileSync } from "node:fs";

const out = process.env.SILTWAKE_HEAVY_FILE_STATS;
if (out) process.on("exit", () => {
  const u = process.cpuUsage(), cache = globalThis.__siltwakeBuildCacheStats ?? null;
  try {
    writeFileSync(`${out}.${process.pid}`, JSON.stringify({
      cpuMs: Math.round((u.user + u.system) / 1000), maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
      cache: cache && { ...cache, fillMs: Math.round(globalThis.__siltwakeBuildCacheFillCpuMs ?? 0) },
    }));
  } catch { /* the stats are a report, never a reason to fail the file */ }
});
