// While a heavy-check job runs in a worktree, its tests run from that
// worktree's .test-build. The supervisor writes .test-build/.heavy-job (ticket,
// supervisor PID and start time) for the job's run; a rebuild elsewhere in the
// same worktree (an agent's `npm test`) must not replace the files under it.
// The job itself (SILTWAKE_JOB_TICKET equal to the marker's) may rebuild.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** A reason to refuse rebuilding `root`'s .test-build now, or null. */
export function heavyJobGuard(root, env = process.env) {
  let marker;
  try { marker = JSON.parse(readFileSync(join(root, ".test-build", ".heavy-job"), "utf8")); } catch { return null; }
  if (env.SILTWAKE_JOB_TICKET === marker.ticket) return null;
  let start = null;
  try {
    const stat = readFileSync(`/proc/${marker.pid}/stat`, "utf8");
    start = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]);
  } catch { /* gone */ }
  if (start !== marker.start) return null; // stale marker from a supervisor that died
  return `heavy-check ticket ${marker.ticket} is running tests from this worktree's .test-build; rebuilding now would ` +
    `change them under it. Wait for it (scripts/heavy-check.sh wait ${marker.ticket}) or cancel it, then rebuild.`;
}

/** A clean rebuild deletes .test-build, marker included. Call before it; the
 * returned function puts a live job's marker back afterwards. */
export function keepHeavyJobMarker(root) {
  const path = join(root, ".test-build", ".heavy-job");
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return () => {}; }
  return () => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
}
