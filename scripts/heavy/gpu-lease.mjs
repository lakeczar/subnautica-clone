// The one-GPU lease (SCHED-1, widened in SCHED-2).
//
// heavy-check grants SILTWAKE_GPU_LEASE (the ticket) to `--class gpu`,
// `--class exclusive` and `--class soak --gpu` jobs, and the v1 fallback, which
// is exclusive. The variable alone is not proof: a lease is valid only for a
// process inside that ticket's job scope, whose grant includes the GPU.
//
// Two ways in, so no GPU driver can skip it:
// - drivers call requireGpuLease() before launching Chrome;
// - every Playwright Chrome binary on this machine is wrapped by
//   chrome-guard.sh (install.sh --gpu-guard), which runs `node gpu-lease.mjs
//   check` whenever Chrome is asked for the GPU, so per-stream play scripts
//   are covered without edits.
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { jobDir, loadConfig, readJson } from "./state.mjs";

const HOW = "Run it through scripts/heavy-check.sh --class gpu -- … (functional evidence), or --class exclusive for frame-time or performance numbers.";

/** Why this process holds no valid GPU lease, or null if it does. */
export function leaseProblem(env = process.env, cgroup = ownCgroup()) {
  const lease = env.SILTWAKE_GPU_LEASE;
  if (!lease) return "no GPU lease (SILTWAKE_GPU_LEASE is not set)";
  if (lease.startsWith("v1-")) return /\/siltwake-heavy-[^/]*\.scope/.test(cgroup) ? null : `SILTWAKE_GPU_LEASE=${lease}, but this process is not inside a heavy-check scope`;
  const grant = readJson(join(jobDir(loadConfig(env), lease), "grant.json"));
  if (!grant) return `SILTWAKE_GPU_LEASE=${lease} names no admitted ticket`;
  if (!grant.gpu) return `ticket ${lease} (${grant.class}) was not granted the GPU`;
  if (!cgroup.includes(`/${grant.unit}.scope`)) return `SILTWAKE_GPU_LEASE=${lease}, but this process is not inside that ticket's scope`;
  return null;
}

export function requireGpuLease(what) {
  const problem = leaseProblem();
  if (!problem) return process.env.SILTWAKE_GPU_LEASE;
  console.error(`${what} launches a GPU Chrome, so it needs the GPU lease: ${problem}. ${HOW}`);
  process.exit(2);
}

function ownCgroup() {
  try { return readFileSync("/proc/self/cgroup", "utf8"); } catch { return ""; }
}

// `node gpu-lease.mjs check [WHAT]`: prints "gpu-lease: ok" with a lease, exit
// 2 (and why) without. chrome-guard.sh requires the line, so a check that did
// not run (a path or module problem) fails closed. The installed copy runs
// through the `current` symlink, so the main-module test compares real paths.
const isMain = (() => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (isMain && process.argv[2] === "check") {
  const problem = leaseProblem();
  if (problem) { console.error(`${process.argv[3] ?? "this program"} asked for the GPU without a valid lease: ${problem}. ${HOW}`); process.exit(2); }
  process.stdout.write("gpu-lease: ok\n");
}
