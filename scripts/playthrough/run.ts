/** npm run playthrough [-- --scenario creel,carrier,...] [--json out.json] [--quiet]
 *   [--export --commit SHA [--library-root DIR]] [--from-library [--library-root DIR]]
 * Plays the scenarios through real simulation commands and prints the timeline.
 * Exit 0 when nothing is blocked, every check holds and the expected-pending list
 * is current (pending C3 phases are expected today); exit 1 otherwise, including any
 * crashed, killed or timed-out --jobs child. No Babylon.
 * --export (SAVE-1): also publish every save the scenarios made to the shared save
 * library at SHA (library.ts). It runs only from code built by scripts/saves-build-at.sh
 * from an archive of exactly SHA, so the saves and their label always come from the
 * same source; it publishes nothing unless every scenario completes and every kind
 * holds its facts. scripts/saves-export.sh is the way to run it.
 * --from-library (TST-21): a branch scenario whose parent is not requested starts
 * from the library's compatible milestone save instead of replaying its parent. */
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
import type { PlayHooks } from "./scenarios.js";
import { buildManifest, codeCommit, CODE_ROOT, libraryRoot, librarySave, publish, SOURCE_MARKER, stagingDir, verifyCommitDir } from "./library.js";
import type { Produced, Staging } from "./library.js";

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const ids = (value("--scenario")?.split(",") ?? SCENARIOS.map((s) => s.id));
for (const id of ids) if (!SCENARIOS.some((s) => s.id === id)) { console.error(`unknown scenario ${id}; known: ${SCENARIOS.map((s) => s.id).join(", ")}`); process.exit(2); }
const quiet = args.includes("--quiet");
/** Fault injection for the parallel-runner regression test, honoured only in a
 * --child process: `stub` writes pending stub results instead of playing (fast);
 * `stub-crash-after-json` then throws after writing them. Never set in normal use. */
const fault = args.includes("--child") ? process.env.SILTWAKE_PLAYTHROUGH_FAULT ?? "" : "";
const exporting = args.includes("--export"), fromLibrary = args.includes("--from-library"), privateRoot = value("--library-root");
if (exporting && fromLibrary) { console.error("--export earns every save from New Game; it cannot start from the library"); process.exit(2); }
if (exporting && !privateRoot && ids.length !== SCENARIOS.length) {
  console.error("A partial export goes to a private --library-root, never the shared library");
  process.exit(2);
}
const fromOf = (id: string): string | null => { const f = SCENARIOS.find((s) => s.id === id)?.from; return f ? `${f.scenario}@${f.milestone}` : null; };
const libraryParent = (id: string): boolean => { const f = SCENARIOS.find((s) => s.id === id)?.from; return fromLibrary && !!f && !ids.includes(f.scenario); };
let commit = "", staging: Staging | null = null;
if (exporting) {
  const built = codeCommit(), asked = value("--commit");
  if (!built) { console.error(`--export runs only from code built by scripts/saves-build-at.sh (no ${SOURCE_MARKER} in ${CODE_ROOT}); use scripts/saves-export.sh`); process.exit(2); }
  if (asked !== built) { console.error(`--export --commit ${asked ?? "(missing)"}: this code was built from ${built}`); process.exit(2); }
  commit = built;
  staging = await stagingDir(libraryRoot(privateRoot), commit);
}
const savesDir = value("--saves-dir") ?? staging?.dir;
const hooks: PlayHooks = {
  sink: savesDir ? (scenario, label, text) => fs.writeFileSync(path.join(savesDir, `${scenario}@${label}.json`), text) : undefined,
  fromLibrary: fromLibrary ? (scenario, milestone) => {
    const p = librarySave(`${scenario}@${milestone}`, { root: privateRoot });
    return { text: p.text, commands: p.entry.commands, detail: p.describe };
  } : undefined,
};

await loadCampaign();
// --jobs N: independent New Game groups (a root and the scenarios branching from it)
// run in separate processes. Light work: no Babylon, a few hundred MiB each.
// Without --jobs, a run admitted by heavy-check uses its reservation's CPU
// tokens (SILTWAKE_JOB_CPUS); a --child never fans out again.
const jobs = Math.max(1, Number(value("--jobs") ?? (args.includes("--child") ? 1 : process.env.SILTWAKE_JOB_CPUS ?? 1)));
const runs = fault.startsWith("stub")
  ? ids.map((id) => ({ ...emptyRun(id, SCENARIOS.find((s) => s.id === id)!.strategy), outcome: "pending-c3" as const }))
  : jobs > 1 ? await parallel(ids, jobs) : await playScenarios(ids, !quiet, hooks);
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
const exported = exporting ? await exportLibrary(staging!) : 0;
process.exit(bad.length || stale.length || exported ? 1 : 0);

/** Publish the staged saves as the library at this commit, or nothing at all. */
async function exportLibrary(staging: Staging): Promise<number> {
  const produced: Produced[] = fs.readdirSync(staging.dir).filter((f) => f.endsWith(".json")).map((f) => {
    const [scenario, label] = f.slice(0, -5).split("@") as [string, string];
    return { scenario, label, text: fs.readFileSync(path.join(staging.dir, f), "utf8") };
  });
  const { manifest, problems } = buildManifest(commit, runs, produced, fromOf);
  if (problems.length) {
    console.log(`\nSave library NOT exported for ${commit.slice(0, 12)}:\n  ${problems.join("\n  ")}`);
    await staging.discard();
    return 1;
  }
  const status = await publish(libraryRoot(privateRoot), staging, manifest, (dir) => verifyCommitDir(dir, true)), z = manifest.sizes, k = (n: number): string => `${(n / 1024).toFixed(0)} KiB`;
  console.log(`\nSave library ${status} at ${libraryRoot(privateRoot)}/${commit} (${manifest.saves.length} saves):`);
  for (const e of manifest.saves.filter((e) => e.kinds.length > 1))
    console.log(`  ${e.kinds.slice(0, -1).join(", ").padEnd(22)} ${e.file.padEnd(30)} ${k(e.bytes).padStart(8)}  ${e.minutes} min, ${e.commands} commands`);
  console.log(`  largest save ${z.largest.file} ${k(z.largest.bytes)} of the ${k(z.maxSaveBytes)} import limit (${(100 * z.largest.bytes / z.maxSaveBytes).toFixed(1)}%); ` +
    `journal ${k(z.largestJournalBytes)} seen, ${k(z.worstJournalBytes)} with three such generations, against ${k(z.maxJournalBytes)} and ~${(z.localStorageChars / 1048576).toFixed(0)} M localStorage characters`);
  for (const n of manifest.notes) console.log(`  note: ${n}`);
  return 0;
}

/** Spawn one child per group, with a deadline; report exactly how it ended. */
function spawnGroup(dir: string, deadlineMs: number): Launch {
  const self = fileURLToPath(import.meta.url);
  let n = 0;
  return (group) => new Promise<ChildOutcome>((resolve) => {
    const out = path.join(dir, `${n++}.json`);
    const pass = [...(savesDir ? ["--saves-dir", savesDir] : []), ...(fromLibrary ? ["--from-library"] : []), ...(privateRoot ? ["--library-root", privateRoot] : [])];
    const child = spawn(process.execPath, [self, "--child", "--scenario", group.join(","), "--json", out, "--quiet", ...pass], { stdio: ["ignore", "ignore", "inherit"] });
    let error: string | null = null;
    // Node fires an over-large (or infinite) delay at once: no timer then.
    const timer = Number.isFinite(deadlineMs) ? setTimeout(() => { error = `timed out after ${deadlineMs / 1000} s`; child.kill("SIGKILL"); }, deadlineMs) : undefined;
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
    // A child's wall-clock limit. Inside a heavy-check job the run has a goal,
    // not a time limit (SCHED-2): children beat the job's heartbeat as they
    // simulate, so a hang is caught by the queue's stall detection and the
    // only bound left is the class's runaway ceiling.
    const fallback = process.env.SILTWAKE_JOB_HEARTBEAT ? Infinity : 1800;
    const deadline = Number(value("--child-timeout") ?? fallback) * 1000;
    return await runGroups(selected, limit, spawnGroup(dir, deadline),
      (id) => libraryParent(id) ? undefined : SCENARIOS.find((s) => s.id === id)?.from?.scenario, (id) => SCENARIOS.find((s) => s.id === id)?.strategy ?? "?");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
