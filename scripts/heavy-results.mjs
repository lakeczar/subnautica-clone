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
// The record, with every number's context (WORKER_RESOURCE_LIMITS.md, "Measurement hygiene"):
// - run: commit and dirty state, machine, ticket, Node, containment, the job's memory
//   limit, the pool and concurrency, the build cache at the start (cold/warm/off),
//   the selection (full tier or a subset), and the budget override if any. A run with
//   SILTWAKE_HEAVY_BUDGET_MIB set is `budgetEvidence: false`: not budget evidence.
// - per file: status, phase (pool or timing), wall s, CPU s (the whole tree, or the
//   file's own process where there is no per-file cgroup: `cpuScope`), peak MiB (the
//   whole tree) against its budget and as a percentage, the processes the OOM killer
//   took (at the file's own budget, and in nested cgroups below it), the build cache's
//   hits, misses and fills, and for timing files the CPU wait seen.
//
// A row can stand in for another run's only when `matchKey` agrees: the same machine,
// containment, budget, cache state and Node, and a budget-evidence run.
//
//   node scripts/heavy-results.mjs ingest [TICKET...]   copy new records from the queue's job logs
//   node scripts/heavy-results.mjs show [--commit SHA] [--machine LABEL] [--file NAME] [--json]
//   node scripts/heavy-results.mjs near [--pct 85] [--commit SHA]   files at or over pct of budget
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RECORD_LINE = "heavy-results: ";
export const RECORD_VERSION = 1;
/** The share of a file's budget its peak may reach before it is reported as near. */
export const NEAR_PCT = 85;
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

/** The build cache at the start of a run: off, cold (no entries) or warm, with its entry count. */
export function cacheState(dir, env = process.env) {
  if (env.SILTWAKE_BUILD_CACHE === "off") return { state: "off", entries: 0 };
  let entries = 0;
  try { for (const d of readdirSync(dir, { withFileTypes: true })) if (d.isDirectory()) entries += readdirSync(join(dir, d.name)).filter((f) => f.endsWith(".bin")).length; }
  catch { /* no cache directory yet: cold */ }
  return { state: entries ? "warm" : "cold", entries };
}

/** The row's comparability key: rows stand in for each other only when it agrees. */
export const matchKey = (run, row) => [run.machine, run.containment, row.budgetMiB, run.cache.state, run.node].join("|");

/** The record's text line. */
export const recordLine = (record) => `${RECORD_LINE}${JSON.stringify(record)}`;

/** Records in a job's output, oldest first. */
export function recordsIn(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    if (!line.startsWith(RECORD_LINE)) continue;
    try { const r = JSON.parse(line.slice(RECORD_LINE.length)); if (r?.v === RECORD_VERSION && Array.isArray(r.files)) out.push(r); } catch { /* a cut line */ }
  }
  return out;
}

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

/** The queue receipt's facts a stored run keeps. */
function receiptOf(exit) {
  if (!exit) return null;
  return { code: exit.code, stopReason: exit.stopReason ?? null, label: exit.label ?? null, class: exit.class ?? null, memMiB: exit.memMiB ?? null,
    machine: exit.machine ?? null, machineTag: exit.machineTag ?? null, remote: Boolean(exit.remote), evidence: exit.evidence ?? null,
    disturbed: exit.context?.disturbed ?? null, endedAt: exit.endedAt ?? null };
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
    const stored = { v: RECORD_VERSION, ticket: id, ingestedAt: new Date().toISOString(), receipt: receiptOf(exit), runs: records };
    writeFileSync(`${target}.tmp`, JSON.stringify(stored));
    renameSync(`${target}.tmp`, target);
    out.push({ ticket: id, stored: true, runs: records.length, files: records.reduce((n, r) => n + r.files.length, 0) });
  }
  return out;
}

/** A stored run file (as ingest wrote it), or null. */
export const storedRun = (ticket, env = process.env) => readJson(join(resultsDir(env), "runs", `${ticket}.json`));

/**
 * Why a stored heavy run can't count as the full heavy tier at `commit` (empty: it
 * counts). The gate's heavy step requires it: a record, for its commit, of the full
 * tier at the real budgets.
 */
export function fullTierProblems(stored, commit) {
  const runs = stored?.runs ?? [];
  if (!runs.length) return ["its per-file heavy results weren't recorded (no heavy-results record in the job's output)"];
  const problems = [];
  for (const r of runs) {
    if (!r.budgetEvidence) problems.push(`run with SILTWAKE_HEAVY_BUDGET_MIB=${r.override}: not budget evidence`);
    if (r.selection?.kind !== "full") problems.push(`ran ${r.selection?.files ?? "?"} chosen files, not the full heavy tier`);
    if (r.commit !== commit) problems.push(`its results are for ${String(r.commit).slice(0, 12)}${r.dirty ? " with uncommitted changes" : ""}, not ${commit.slice(0, 12)}`);
    else if (r.dirty) problems.push("its results are for a tree with uncommitted changes");
  }
  return [...new Set(problems)];
}

/** Every stored row, flattened with its run's context and receipt: [{ ticket, run, receipt, row }]. */
export function storedRows(env = process.env) {
  const runs = join(resultsDir(env), "runs"), out = [];
  let names = [];
  try { names = readdirSync(runs).filter((n) => n.endsWith(".json")); } catch { return out; }
  for (const n of names) {
    const s = readJson(join(runs, n));
    for (const run of s?.runs ?? []) for (const row of run.files) out.push({ ticket: s.ticket, run, receipt: s.receipt, row });
  }
  return out.sort((a, b) => String(a.run.at).localeCompare(String(b.run.at)));
}

/** Rows at or over `pct` of their budget, from budget-evidence runs only. */
export const nearBudget = (rows, pct = NEAR_PCT) => rows.filter((r) => r.run.budgetEvidence && r.row.budgetPct != null && r.row.budgetPct >= pct);

function describe({ ticket, run, receipt, row }) {
  const oom = row.oomKillsOwn == null ? "oom ?" : `oom ${row.oomKillsOwn}+${row.oomKillsNested ?? "?"}`;
  return `${String(run.commit).slice(0, 12)}${run.dirty ? "+dirty" : ""} ${run.machine} ${ticket} ${row.file} ${row.status} ` +
    `${row.seconds.toFixed(1)} s, cpu ${row.cpuS == null ? "?" : row.cpuS.toFixed(1)} s (${row.cpuScope}), peak ${row.peakMiB}/${row.budgetMiB} MiB (${row.budgetPct}%), ` +
    `${oom}; cache ${run.cache.state} at start, ${row.cache ? `${row.cache.hits} hits ${row.cache.fills} fills` : "unreported"}; ` +
    `job limit ${run.jobMemoryMiB} MiB${run.budgetEvidence ? "" : "; NOT BUDGET EVIDENCE"}${receipt?.evidence?.bound === false ? "; not bound to a commit" : ""}`;
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
  if (cmd === "show" || cmd === "near") {
    let rows = storedRows();
    const commit = value("--commit"), machine = value("--machine"), file = value("--file");
    if (commit) rows = rows.filter((r) => String(r.run.commit).startsWith(commit));
    if (machine) rows = rows.filter((r) => r.run.machine.includes(machine));
    if (file) rows = rows.filter((r) => r.row.file.startsWith(file));
    if (cmd === "near") rows = nearBudget(rows, Number(value("--pct") ?? NEAR_PCT));
    if (args.includes("--json")) for (const r of rows) console.log(JSON.stringify({ ticket: r.ticket, ...r.row, run: r.run, receipt: r.receipt, matchKey: matchKey(r.run, r.row) }));
    else for (const r of rows) console.log(describe(r));
    process.exit(0);
  }
  console.error("usage: heavy-results.mjs ingest [TICKET...] | show [--commit SHA] [--machine LABEL] [--file NAME] [--json] | near [--pct 85] [--commit SHA]");
  process.exit(2);
}
