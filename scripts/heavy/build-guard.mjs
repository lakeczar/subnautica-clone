// While a heavy-check job runs in a worktree, its tests run from that
// worktree's .test-build. The ticket's holder writes .test-build/.heavy-job
// (the ticket and its holder and job scope units) for the job's life; a
// rebuild elsewhere in the same worktree (an agent's `npm test`) must not
// replace the files under it.
// The job itself (SILTWAKE_JOB_TICKET equal to the marker's) may rebuild.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { jobDir, loadConfig, readJson, scopePopulated } from "./state.mjs";

/** A reason to refuse rebuilding `root`'s .test-build now, or null. The job
 * is alive while its holder's or its own scope holds processes (cgroups, as
 * the scheduler's recovery judges it; a failed query counts as alive), so a
 * job that outlives its supervisor or holder still protects its files. */
export function heavyJobGuard(root, env = process.env, buildName = ".test-build") {
  let marker;
  try { marker = JSON.parse(readFileSync(join(root, buildName, ".heavy-job"), "utf8")); } catch { return null; }
  if (env.SILTWAKE_JOB_TICKET === marker.ticket) return null;
  if (!(marker.units ?? []).some((unit) => scopePopulated(unit))) return null; // finished; recovery removes the marker
  // Only an admitted, running ticket writes the marker; a queued one never blocks.
  const dir = jobDir(loadConfig(env), marker.ticket), grant = readJson(join(dir, "grant.json")), request = readJson(join(dir, "request.json"));
  const what = grant ? ` (${grant.class}, running: ${(request?.argv ?? []).join(" ").slice(0, 80)})` : "";
  return `heavy-check ticket ${marker.ticket}${what} is running from this worktree's ${buildName}; rebuilding now would ` +
    `change files under it. Either wait for it (scripts/heavy-check.sh wait ${marker.ticket}), or compile and test in a ` +
    `sibling directory meanwhile: SILTWAKE_TEST_BUILD=.test-build-2 npm test. Jobs that don't read ${buildName} ` +
    "(GPU play from dist) can be submitted with --no-test-build, or --snapshot, and then never block it.";
}

/** A clean rebuild deletes .test-build, marker included. Call before it; the
 * returned function puts a live job's marker back afterwards. */
export function keepHeavyJobMarker(root, buildName = ".test-build") {
  const path = join(root, buildName, ".heavy-job");
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return () => {}; }
  return () => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
}
