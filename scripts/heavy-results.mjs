#!/usr/bin/env node
// Stored per-file heavy results (STEW-3). Every heavy-tier run prints one record,
// a line `heavy-results: {json}` after its summary (and writes it to
// <build>/heavy-results.json): the run's context, then one row per file. Because the
// queue keeps every job's output on factory-worker, alickers' runs included, the
// records land here wherever the tier ran; `ingest` copies them, with the job's queue
// receipt, into a store that outlives the queue's 7-day job logs:
//
//   $SILTWAKE_RESULTS_DIR/heavy/runs/<ticket>.json   (default /work/tmp/siltwake-results)
//
// so an A/B or a review reads root's numbers instead of re-running the control arm,
// and a later nightly run can alert on files near their budget.
//
// The record (v2), with every number's context (WORKER_RESOURCE_LIMITS.md, "Measurement hygiene"):
// - run: commit and dirty state, machine, ticket, Node, containment, the job's memory
//   limit, pool, concurrency and CPU grant, the build cache at the start, the
//   selection (full tier or a subset), the lockfile's and the harness's hashes, and
//   the budget source: canonical (tests/heavy-budgets.json), or an override
//   (SILTWAKE_HEAVY_BUDGET_MIB or SILTWAKE_HEAVY_BUDGETS), which is `budgetEvidence: false`.
// - per file: status, phase (pool or timing), wall s, CPU s (`cpuScope`: the tree, or
//   the file's own process), peak MiB against its budget, OOM kills (own budget, nested
//   cgroups), the build cache's hits, misses and fills and the cache use they make
//   (`cacheUse`: hit, fill, mixed or none), the file's compiled import closure, and
//   for timing files the CPU wait.
//
// Using a stored row (STEW-3 R1):
// - `eligibility`: the record agrees with its job's receipt (the same ticket, a clean
//   commit the receipt binds, the same machine, a job that ended on its own work) at
//   canonical budgets, and the file passed. Budget alerts and the gate's full-tier
//   check read eligible rows only.
// - a control arm (`controlProblems`): an eligible row at exactly the intended clean
//   control commit, for the same file, measured by the same harness under the same
//   conditions (`conditionsOf`: machine, containment, limits, pool, concurrency, CPUs,
//   budget, phase, Node, and the file's own cache use, never "mixed").
//
//   node scripts/heavy-results.mjs ingest [TICKET...]   copy new records from the queue's job logs
//   node scripts/heavy-results.mjs show [--commit SHA] [--machine LABEL] [--file NAME] [--eligible] [--json]
//   node scripts/heavy-results.mjs near [--pct 85] [--commit SHA]   eligible files at or over pct of budget
//   node scripts/heavy-results.mjs control --commit SHA --file NAME [--like TICKET]
//       eligible control rows at that exact commit; with --like, only those comparable to
//       that stored run's row for the file
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RECORD_LINE = "heavy-results: ";
export const RECORD_VERSION = 2;
/** The share of a file's budget its peak may reach before it is reported as near. */
export const NEAR_PCT = 85;
/** The canonical budgets, relative to the repository root. */
export const CANONICAL_BUDGETS = "tests/heavy-budgets.json";
/** The harness: the scripts whose behaviour shapes every number a run records. */
export const HARNESS = ["scripts/test-tier.mjs", "scripts/heavy-containment.mjs", "scripts/test-build-cache.mjs", "scripts/test-heavy-file.mjs"];
const MACHINES = { "factory-worker": "RTX 3090 (factory-worker)", "siltwake-alickers": "RTX 4070 Laptop (alickers, shared desktop host)" };
export const machineLabel = (host = hostname()) => MACHINES[host] ?? host;
export const resultsDir = (env = process.env) => join(env.SILTWAKE_RESULTS_DIR || "/work/tmp/siltwake-results", "heavy");
const schedDir = (env = process.env) => env.SILTWAKE_SCHED_DIR || "/work/tmp/siltwake-sched";

/** The tree under test: commit, and whether tracked files differ from it. */
export function treeState(root) {
  const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  const head = git("rev-parse", "HEAD"), status = git("status", "--porcelain", "--untracked-files=no");
  return { commit: head.status === 0 ? head.stdout.trim() : null, dirty: status.status === 0 ? status.stdout.trim() !== "" : null };
}

/** sha256 (16 hex) of the named files' contents, in order; a missing file counts as absent. */
export function filesHash(root, files) {
  const h = createHash("sha256");
  for (const f of files) { h.update(f).update("\0"); try { h.update(readFileSync(join(root, f))); } catch { h.update("<absent>"); } h.update("\0"); }
  return h.digest("hex").slice(0, 16);
}

/** The build cache at the start of a run: off, cold (no entries) or warm, with its entry count. */
export function cacheState(dir, env = process.env) {
  if (env.SILTWAKE_BUILD_CACHE === "off") return { state: "off", entries: 0 };
  let entries = 0;
  try { for (const d of readdirSync(dir, { withFileTypes: true })) if (d.isDirectory()) entries += readdirSync(join(dir, d.name)).filter((f) => f.endsWith(".bin")).length; }
  catch { /* no cache directory yet: cold */ }
  return { state: entries ? "warm" : "cold", entries };
}

/** How the file itself used the build cache: hit (loaded only), fill (built only), mixed, none, or null (unreported). */
export function cacheUse(cache) {
  if (!cache) return null;
  const hit = cache.hits > 0, fill = cache.fills > 0 || cache.misses > 0;
  return hit && fill ? "mixed" : hit ? "hit" : fill ? "fill" : "none";
}

/** What a row measured: the commit and the code under test. Two arms of an A/B differ here by design. */
export const identityOf = (run, row) => ({ commit: run.commit, file: row.file, closure: row.closure ?? null, lock: run.lockHash ?? null, harness: run.harnessHash ?? null });

/** The conditions a row was measured under: equal for any two rows compared. */
export const conditionsOf = (run, row) => ({
  machine: run.machine, containment: run.containment, jobMemoryMiB: run.jobMemoryMiB, poolMiB: run.poolMiB, concurrency: run.concurrency,
  jobCpus: run.jobCpus ?? null, budgetMiB: row.budgetMiB, phase: row.phase, node: run.node, cacheUse: row.cacheUse ?? cacheUse(row.cache),
});

/** The record's text line. */
export const recordLine = (record) => `${RECORD_LINE}${JSON.stringify(record)}`;

/** Records in a job's output, oldest first (v1 records are kept for reading, never eligible). */
export function recordsIn(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    if (!line.startsWith(RECORD_LINE)) continue;
    try { const r = JSON.parse(line.slice(RECORD_LINE.length)); if ((r?.v === 1 || r?.v === RECORD_VERSION) && Array.isArray(r.files)) out.push(r); } catch { /* a cut line */ }
  }
  return out;
}

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

/** The queue receipt's facts a stored run keeps. */
function receiptOf(exit) {
  if (!exit) return null;
  return { ticket: exit.ticket ?? null, code: exit.code, stopReason: exit.stopReason ?? null, label: exit.label ?? null, class: exit.class ?? null, memMiB: exit.memMiB ?? null,
    machine: exit.machine ?? null, machineTag: exit.machineTag ?? null, remote: Boolean(exit.remote), evidence: exit.evidence ?? null,
    disturbed: exit.context?.disturbed ?? null, endedAt: exit.endedAt ?? null };
}

/**
 * Why a stored run (and optionally one of its rows) can't be used as evidence (empty:
 * it can). The one check for budget alerts, the gate's full-tier check and controls:
 * the record agrees with its job's receipt, at canonical budgets, and the file passed.
 */
export function eligibility(stored, run, row = null) {
  const p = [], rc = stored?.receipt;
  if ((run?.v ?? 0) < RECORD_VERSION) p.push(`a v${run?.v ?? "?"} record, from before results carried their identity`);
  if (!rc) p.push("no queue receipt");
  else {
    if (rc.ticket && rc.ticket !== stored.ticket) p.push(`its receipt is ticket ${rc.ticket}'s, stored under ${stored.ticket}`);
    // The tier exits 1 when one of its files failed: that is the files' verdict, not the job's.
    const fileFailure = rc.code === 1 && (run?.files ?? []).some((f) => f.status !== "ok");
    if (rc.code !== 0 && !fileFailure) p.push(`its job exited ${rc.code}${rc.label ? ` (${rc.label})` : ""}`);
    if (rc.stopReason) p.push(`its job was stopped: ${rc.stopReason}`);
    if (rc.disturbed) p.push("its job was DISTURBED");
    if (!rc.evidence?.bound) p.push(`its job isn't evidence for a commit${rc.evidence?.why ? `: ${rc.evidence.why}` : ""}`);
    else if (rc.evidence.commit !== run?.commit) p.push(`its receipt binds ${String(rc.evidence.commit).slice(0, 12)}, the record claims ${String(run?.commit).slice(0, 12)}`);
    if (rc.machine !== run?.machine) p.push(`its receipt ran on ${rc.machine}, the record claims ${run?.machine}`);
  }
  if (run?.ticket !== stored?.ticket) p.push(`the record is from ticket ${run?.ticket}, stored under ${stored?.ticket}`);
  if (run?.dirty !== false) p.push("the tree had uncommitted changes (or its state is unknown)");
  if (!run?.budgetEvidence) p.push(`not budget evidence (${run?.override ? `override: ${JSON.stringify(run.override)}` : "non-canonical budgets"})`);
  if (row && row.status !== "ok") p.push(`${row.file} didn't pass (${row.status})`);
  return p;
}

/**
 * Copies records from finished jobs' logs into the store. tickets: just these (else
 * every finished job not yet stored). Returns [{ ticket, stored, why? }].
 */
export function ingest(tickets = null, env = process.env) {
  const jobs = join(schedDir(env), "jobs"), runs = join(resultsDir(env), "runs");
  let ids = tickets;
  if (!ids) { try { ids = readdirSync(jobs); } catch { ids = []; } }
  const out = [];
  for (const id of ids) {
    const target = join(runs, `${id}.json`);
    if (existsSync(target)) { out.push({ ticket: id, stored: false, why: "already stored" }); continue; }
    const exit = readJson(join(jobs, id, "exit.json"));
    if (!exit) { out.push({ ticket: id, stored: false, why: "not finished" }); continue; }
    let text = "";
    try { text = readFileSync(join(jobs, id, "output.log"), "utf8"); } catch { /* no output */ }
    const records = recordsIn(text);
    if (!records.length) { out.push({ ticket: id, stored: false, why: "no heavy-results record" }); continue; }
    mkdirSync(runs, { recursive: true });
    const stored = { v: RECORD_VERSION, ticket: id, ingestedAt: new Date().toISOString(), receipt: receiptOf({ ticket: id, ...exit }), runs: records };
    writeFileSync(`${target}.tmp`, JSON.stringify(stored));
    renameSync(`${target}.tmp`, target);
    out.push({ ticket: id, stored: true, runs: records.length, files: records.reduce((n, r) => n + r.files.length, 0) });
  }
  return out;
}

/** A stored run file (as ingest wrote it), or null. */
export const storedRun = (ticket, env = process.env) => readJson(join(resultsDir(env), "runs", `${ticket}.json`));

/**
 * The canonical facts at `commit` the gate's full-tier check compares with: every heavy
 * test file there (compiled names) and each one's budget from tests/heavy-budgets.json.
 */
export function canonicalAt(root, commit) {
  const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const ls = git("ls-tree", "--name-only", commit, "tests/");
  const budgets = (() => { const r = git("show", `${commit}:${CANONICAL_BUDGETS}`); try { return r.status === 0 ? JSON.parse(r.stdout) : null; } catch { return null; } })();
  if (ls.status !== 0 || !budgets) return null;
  const files = ls.stdout.split("\n").map((f) => f.replace(/^tests\//, "")).filter((f) => f.endsWith(".heavy.test.ts")).map((f) => f.replace(/\.ts$/, ".js")).sort();
  return { files, budgetOf: (js) => budgets.files?.[js.replace(/\.js$/, ".ts")] ?? budgets.defaultMiB };
}

/**
 * Why a stored heavy run can't count as the full heavy tier at `commit` (empty: it
 * counts). The gate's heavy step requires it: an eligible record, for its commit, of
 * every heavy file there, each at its canonical budget.
 */
export function fullTierProblems(stored, commit, canonical = null) {
  const runs = stored?.runs ?? [];
  if (!runs.length) return ["its per-file heavy results weren't recorded (no heavy-results record in the job's output)"];
  const problems = [];
  for (const r of runs) {
    problems.push(...eligibility(stored, r));
    if (r.selection?.kind !== "full") problems.push(`ran ${r.selection?.files ?? "?"} chosen files, not the full heavy tier`);
    if (r.commit !== commit) problems.push(`its results are for ${String(r.commit).slice(0, 12)}, not ${commit.slice(0, 12)}`);
    if (canonical) {
      const ran = r.files.map((f) => f.file).sort();
      const missing = canonical.files.filter((f) => !ran.includes(f)), extra = ran.filter((f) => !canonical.files.includes(f));
      if (missing.length || extra.length) problems.push(`its files aren't the heavy tier at ${commit.slice(0, 12)}${missing.length ? `: missing ${missing.slice(0, 3).join(", ")}` : ""}${extra.length ? `; extra ${extra.slice(0, 3).join(", ")}` : ""}`);
      const off = r.files.filter((f) => f.budgetMiB !== canonical.budgetOf(f.file));
      if (off.length) problems.push(`${off.length} file(s) ran at a budget that isn't canonical (${off.slice(0, 3).map((f) => `${f.file} ${f.budgetMiB} MiB, canonical ${canonical.budgetOf(f.file)}`).join("; ")})`);
    } else problems.push(`the canonical heavy files and budgets at ${commit.slice(0, 12)} couldn't be read`);
  }
  return [...new Set(problems)];
}

/** Every stored row, flattened with its run and stored file: [{ ticket, stored, run, receipt, row }]. */
export function storedRows(env = process.env) {
  const runs = join(resultsDir(env), "runs"), out = [];
  let names = [];
  try { names = readdirSync(runs).filter((n) => n.endsWith(".json")); } catch { return out; }
  for (const n of names) {
    const s = readJson(join(runs, n));
    for (const run of s?.runs ?? []) for (const row of run.files) out.push({ ticket: s.ticket, stored: s, run, receipt: s.receipt, row });
  }
  return out.sort((a, b) => String(a.run.at).localeCompare(String(b.run.at)));
}

/** Eligible rows at or over `pct` of their budget: what a budget alert reads. */
export const nearBudget = (rows, pct = NEAR_PCT) =>
  rows.filter((r) => r.row.budgetPct != null && r.row.budgetPct >= pct && eligibility(r.stored, r.run, r.row).length === 0);

/**
 * Why `control` (a stored row: { stored, run, row }) can't be the control arm for
 * `candidate` ({ run, row }, stored or not) at the intended clean control commit
 * (empty: it can). Identity: exactly that commit, the same file, the same harness.
 * Conditions: all equal, and a cache use that isn't mixed.
 */
export function controlProblems(candidate, control, controlCommit) {
  const p = eligibility(control.stored, control.run, control.row);
  if (control.run.commit !== controlCommit) p.push(`it's for ${String(control.run.commit).slice(0, 12)}, not the intended control ${String(controlCommit).slice(0, 12)}`);
  if (control.row.file !== candidate.row.file) p.push(`it measured ${control.row.file}, not ${candidate.row.file}`);
  if (!control.run.harnessHash || control.run.harnessHash !== candidate.run.harnessHash) p.push("a different measuring harness (or an unknown one)");
  if (!control.row.closure) p.push("its file's import closure wasn't recorded");
  if (candidate.row.status !== "ok") p.push(`the candidate's ${candidate.row.file} didn't pass`);
  const a = conditionsOf(control.run, control.row), b = conditionsOf(candidate.run, candidate.row);
  for (const k of Object.keys(a)) if (a[k] !== b[k]) p.push(`${k}: ${a[k]} against ${b[k]}`);
  if (a.cacheUse === "mixed" || a.cacheUse == null) p.push(`its cache use is ${a.cacheUse ?? "unreported"}: neither a cold nor a warm measurement`);
  return p;
}

function describe({ ticket, stored, run, row }) {
  const oom = row.oomKillsOwn == null ? "oom ?" : `oom ${row.oomKillsOwn}+${row.oomKillsNested ?? "?"}`;
  const problems = eligibility(stored, run, row);
  return `${String(run.commit).slice(0, 12)}${run.dirty ? "+dirty" : ""} ${run.machine} ${ticket} ${row.file} ${row.status} ` +
    `${row.seconds.toFixed(1)} s, cpu ${row.cpuS == null ? "?" : row.cpuS.toFixed(1)} s (${row.cpuScope}), peak ${row.peakMiB}/${row.budgetMiB} MiB (${row.budgetPct}%), ` +
    `${oom}; cache ${run.cache.state} at start, ${row.cache ? `${row.cache.hits} hits ${row.cache.fills} fills (${row.cacheUse ?? cacheUse(row.cache)})` : "unreported"}; ` +
    `job limit ${run.jobMemoryMiB} MiB${run.budgetEvidence ? "" : "; NOT BUDGET EVIDENCE"}${problems.length ? `; NOT ELIGIBLE: ${problems.join("; ")}` : ""}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  if (cmd === "ingest") {
    const results = ingest(args.length ? args : null);
    const stored = results.filter((r) => r.stored);
    for (const r of results) if (args.length || r.stored) console.log(`${r.ticket}: ${r.stored ? `stored ${r.files} file rows from ${r.runs} run(s)` : r.why}`);
    if (!args.length) console.log(`heavy-results: ${stored.length} new run(s) stored in ${join(resultsDir(), "runs")}`);
    process.exit(0);
  }
  const print = (rows) => {
    if (args.includes("--json")) for (const r of rows) console.log(JSON.stringify({ ticket: r.ticket, ...r.row, run: r.run, receipt: r.receipt,
      identity: identityOf(r.run, r.row), conditions: conditionsOf(r.run, r.row), eligibility: eligibility(r.stored, r.run, r.row) }));
    else for (const r of rows) console.log(describe(r));
  };
  if (cmd === "show" || cmd === "near") {
    let rows = storedRows();
    const commit = value("--commit"), machine = value("--machine"), file = value("--file");
    if (commit) rows = rows.filter((r) => String(r.run.commit).startsWith(commit));
    if (machine) rows = rows.filter((r) => r.run.machine.includes(machine));
    if (file) rows = rows.filter((r) => r.row.file.startsWith(file));
    if (cmd === "near") rows = nearBudget(rows, Number(value("--pct") ?? NEAR_PCT));
    else if (args.includes("--eligible")) rows = rows.filter((r) => eligibility(r.stored, r.run, r.row).length === 0);
    print(rows);
    process.exit(0);
  }
  if (cmd === "control") {
    const commit = value("--commit"), file = value("--file"), like = value("--like");
    if (!commit || !/^[0-9a-f]{40}$/.test(commit) || !file) { console.error("control needs --commit <the full 40-hex clean control SHA> and --file NAME"); process.exit(2); }
    const all = storedRows(), candidates = all.filter((r) => r.row.file.startsWith(file) && r.run.commit === commit);
    if (!like) { print(candidates.filter((r) => eligibility(r.stored, r.run, r.row).length === 0)); process.exit(0); }
    const cand = all.find((r) => r.ticket === like && r.row.file.startsWith(file));
    if (!cand) { console.error(`no stored row for ${file} under ticket ${like}`); process.exit(2); }
    for (const c of candidates) {
      const p = controlProblems(cand, c, commit);
      console.log(`${c.ticket} ${c.row.file}: ${p.length ? `not a control: ${p.join("; ")}` : "a control"}`);
    }
    process.exit(0);
  }
  console.error("usage: heavy-results.mjs ingest [TICKET...] | show [--commit SHA] [--machine LABEL] [--file NAME] [--eligible] [--json] | near [--pct 85] [--commit SHA] | control --commit SHA --file NAME [--like TICKET]");
  process.exit(2);
}
