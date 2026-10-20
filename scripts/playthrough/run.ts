/** npm run playthrough [-- --scenario creel,carrier,...] [--json out.json] [--quiet]
 * Plays the scenarios through real simulation commands and prints the timeline.
 * Exit 0 when nothing is blocked, every check holds and the expected-pending list
 * is current (pending C3 phases are expected today); exit 1 otherwise, including any
 * crashed, killed or timed-out --jobs child. No Babylon. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyRun } from "./timeline.js";
import type { RunRecord } from "./timeline.js";
import { runGroups } from "./parallel.js";
import type { ChildOutcome, Launch } from "./parallel.js";
import { loadCampaign } from "./content.js";
import { formatRun } from "./report.js";
import { EXPECTED_PENDING_BASE, malformedExpected, staleExpected } from "./pending.js";
import { playScenarios, SCENARIOS } from "./scenarios.js";

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const ids = (value("--scenario")?.split(",") ?? SCENARIOS.map((s) => s.id));
for (const id of ids) if (!SCENARIOS.some((s) => s.id === id)) { console.error(`unknown scenario ${id}; known: ${SCENARIOS.map((s) => s.id).join(", ")}`); process.exit(2); }
const quiet = args.includes("--quiet");
/** Fault injection for the parallel-runner regression test, honoured only in a
 * --child process: `stub` writes pending stub results instead of playing (fast);
 * `stub-crash-after-json` then throws after writing them. Never set in normal use. */
const fault = args.includes("--child") ? process.env.SILTWAKE_PLAYTHROUGH_FAULT ?? "" : "";

await loadCampaign();
// --jobs N: independent New Game groups (a root and the scenarios branching from it)
// run in separate processes. Light work: no Babylon, a few hundred MiB each.
const jobs = Math.max(1, Number(value("--jobs") ?? 1));
const runs = fault.startsWith("stub")
  ? ids.map((id) => ({ ...emptyRun(id, SCENARIOS.find((s) => s.id === id)!.strategy), outcome: "pending-c3" as const }))
  : jobs > 1 ? await parallel(ids, jobs) : await playScenarios(ids, !quiet);
console.log("");
for (const run of runs) console.log(formatRun(run) + "\n");
const json = value("--json");
if (json) fs.writeFileSync(json, JSON.stringify({ generated: new Date().toISOString(), runs }, null, 2) + "\n");
if (fault === "stub-crash-after-json") throw new Error("injected crash after writing the result");
const stale = [...staleExpected(), ...malformedExpected().map((k) => `${k} (not an absent ID)`)];
if (stale.length) console.log(`Expected-pending list (${EXPECTED_PENDING_BASE}) is stale; remove what this build now has: ${stale.join(", ")}`);
const bad = runs.filter((r) => r.outcome === "blocked" || r.checks.some((c) => !c.ok));
if (runs.length !== ids.length) { console.log(`Expected ${ids.length} results, got ${runs.length}.`); process.exit(1); }
console.log(bad.length ? `BLOCKED or failed: ${bad.map((r) => r.scenario).join(", ")}` : stale.length ? "Expected-pending list stale." :
  `No blockers. ${runs.filter((r) => r.outcome === "pending-c3").length} of ${runs.length} scenarios wait on C3 content.`);
process.exit(bad.length || stale.length ? 1 : 0);

/** Spawn one child per group, with a deadline; report exactly how it ended. */
function spawnGroup(dir: string, deadlineMs: number): Launch {
  const self = fileURLToPath(import.meta.url);
  let n = 0;
  return (group) => new Promise<ChildOutcome>((resolve) => {
    const out = path.join(dir, `${n++}.json`);
    const child = spawn(process.execPath, [self, "--child", "--scenario", group.join(","), "--json", out, "--quiet"], { stdio: ["ignore", "ignore", "inherit"] });
    let error: string | null = null;
    const timer = setTimeout(() => { error = `timed out after ${deadlineMs / 1000} s`; child.kill("SIGKILL"); }, deadlineMs);
    child.on("error", (e) => { error = `spawn failed: ${e.message}`; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, error, json: fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null });
    });
  });
}
async function parallel(selected: readonly string[], limit: number): Promise<RunRecord[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "siltwake-playthrough-"));
  try {
    const deadline = Number(value("--child-timeout") ?? 1800) * 1000;
    return await runGroups(selected, limit, spawnGroup(dir, deadline),
      (id) => SCENARIOS.find((s) => s.id === id)?.from?.scenario, (id) => SCENARIOS.find((s) => s.id === id)?.strategy ?? "?");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
