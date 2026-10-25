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
// The record (v4), with every number's context (WORKER_RESOURCE_LIMITS.md, "Measurement hygiene"):
// - run: commit and dirty state, machine, ticket and the attempt of it (`local`, or
//   `alickers:a<N>`), Node, containment, the job's memory limit, pool, concurrency and
//   CPU grant, the build cache at the start, the selection (full tier or a subset), the
//   lockfile's and the harness's hashes, the caller's workload settings (`settings`), the
//   runtime settings (`runtime`: TZ, locale, UV_THREADPOOL_SIZE, CI), and the budget
//   source: canonical (tests/heavy-budgets.json), or an override (SILTWAKE_HEAVY_BUDGET_MIB
//   or SILTWAKE_HEAVY_BUDGETS), which is `budgetEvidence: false`.
// - per file: status, phase (pool or timing), wall s, CPU s (`cpuScope`: the tree, or
//   the file's own process), peak MiB against its budget, OOM kills (own budget, nested
//   cgroups), the build cache's use over all its processes (`cacheUse`: hit, fill, mixed,
//   none, or unknown when a descendant never reported), its compiled import closure, and
//   whether it may serve as an A/B control (`control`, fileFacts). Timing files add the CPU wait.
//
// Using a stored row (STEW-3 R1–R3):
// - `eligibility`: the record agrees with its job's normalised receipt (the same ticket,
//   the receipt's terminal attempt, a clean commit the receipt binds, the same machine, a
//   job that ended on its own work) at canonical budgets, and the file passed. Budget
//   alerts and the gate's full-tier check read eligible rows only; the gate also needs the
//   canonical workload (no settings).
// - a control arm (`controlProblems`): fails closed. Only a file that opts in through
//   tests/heavy-inputs.json, after review, and whose observed inputs pass the tripwire;
//   at exactly the intended clean control commit, the same file, harness and declared
//   untracked inputs, under equal conditions (`conditionsOf`), with a cache use of hit,
//   fill or none.
//
//   node scripts/heavy-results.mjs ingest [TICKET...]   copy new records from the queue's job logs
//   node scripts/heavy-results.mjs show [--commit SHA] [--machine LABEL] [--file NAME] [--eligible] [--json]
//   node scripts/heavy-results.mjs near [--pct 85] [--commit SHA]   eligible files at or over pct of budget
//   node scripts/heavy-results.mjs sweep [--max 200]        the daily sweep (scripts/heavy-results-timer.sh installs it)
//   node scripts/heavy-results.mjs sweep-status              exit 1 if no sweep succeeded in the last 36 h
//   node scripts/heavy-results.mjs control --commit SHA --file NAME [--like TICKET]
//       eligible control rows at that exact commit; with --like, only those comparable to
//       that stored run's row for the file
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, globSync, linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RECORD_LINE = "heavy-results: ";
export const RECORD_VERSION = 4;
/** The share of a file's budget its peak may reach before it is reported as near. */
export const NEAR_PCT = 85;
/** The canonical budgets, relative to the repository root. */
export const CANONICAL_BUDGETS = "tests/heavy-budgets.json";
/** The harness: the entry points whose module closure shapes every number a run records (the tier, and the per-file preload). */
export const HARNESS = ["scripts/test-tier.mjs", "scripts/test-heavy-file.mjs"];
const MACHINES = { "factory-worker": "RTX 3090 (factory-worker)", "siltwake-alickers": "RTX 4070 Laptop (alickers, shared desktop host)" };
export const machineLabel = (host = hostname()) => MACHINES[host] ?? host;
/**
 * Environment that isn't a workload setting: the queue's grants and job variables, the
 * guard's, the tier's own plumbing and the results store. Budget overrides are their own
 * thing (`override`). Every other SILTWAKE_* variable, NODE_OPTIONS and the few others a
 * heavy test reads can change what a file tests (SILTWAKE_TIMELINE_SEQUENCES=0 runs no
 * sequence at all), so it is a workload setting: recorded, labelled, and part of a
 * row's conditions (STEW-3 R2-2).
 */
const NOT_WORKLOAD = new Set(["SILTWAKE_HEAVY_LOCK_HELD", "SILTWAKE_HEAVY_SCOPE", "SILTWAKE_HEAVY_CGROUP", "SILTWAKE_HEAVY_CONCURRENCY", "SILTWAKE_HEAVY_POOL_MIB",
  "SILTWAKE_GPU_LEASE", "SILTWAKE_LANE_TICKET", "SILTWAKE_SOAK_MACHINE", "SILTWAKE_HEAVY_FILE_STATS", "SILTWAKE_HEAVY_CHECK", "SILTWAKE_RESULTS_DIR",
  "SILTWAKE_LOCAL_OVERRIDE", "SILTWAKE_LOCAL_OVERRIDE_LOGGED", "SILTWAKE_GUARD_STRICT", "SILTWAKE_TEST_BUILD", "SILTWAKE_HEAVY_BUDGET_MIB", "SILTWAKE_HEAVY_BUDGETS"]);
const NOT_WORKLOAD_PREFIX = /^SILTWAKE_(JOB_|SCHED_)/;
/** Workload variables outside SILTWAKE_* that heavy tests read. */
export const OTHER_WORKLOAD = ["NODE_OPTIONS", "JOURNEY_TRACE", "LC_VERBOSE"];
export const isWorkloadKey = (k) => (k.startsWith("SILTWAKE_") && !NOT_WORKLOAD.has(k) && !NOT_WORKLOAD_PREFIX.test(k)) || OTHER_WORKLOAD.includes(k);
/** The caller's workload settings, sorted by name ({} for the canonical workload). */
export function workloadSettings(env = process.env) {
  const out = {};
  for (const k of Object.keys(env).sort()) {
    if (!isWorkloadKey(k) || env[k] == null) continue;
    // The tier's own reporting preload, carried to a nested run's processes, isn't a setting.
    const v = k === "NODE_OPTIONS" ? env[k].split(/\s+/).filter((t) => t && !/^--import=\S*\/scripts\/test-heavy-file\.mjs$/.test(t)).join(" ") : env[k];
    if (v !== "") out[k] = v;
  }
  return out;
}
/** `env` with every workload setting and budget override removed: what the gate's heavy step runs with. */
export const canonicalEnv = (env = process.env) =>
  Object.fromEntries(Object.entries(env).filter(([k]) => !isWorkloadKey(k) && k !== "SILTWAKE_HEAVY_BUDGET_MIB" && k !== "SILTWAKE_HEAVY_BUDGETS"));

/** Runtime settings a row is measured under (R3): recorded, compared for controls, and kept by the gate. */
export const RUNTIME_KEYS = /^(TZ|LANG|LANGUAGE|LC_(?!VERBOSE$)[A-Z_]+|UV_THREADPOOL_SIZE|CI)$/;
export const runtimeEnv = (env = process.env) => Object.fromEntries(Object.keys(env).filter((k) => RUNTIME_KEYS.test(k) && env[k] != null).sort().map((k) => [k, env[k]]));

/**
 * Which attempt of a queue ticket this process runs in (STEW-3 R2-5): `local` inside a
 * job here, `alickers:a<N>` inside attempt N on the second worker (its lane runs the job
 * with that attempt's own directory: …/jobs/<ticket>/a<N>/heartbeat), null outside the queue.
 */
export function attemptOf(env = process.env) {
  if (env.SILTWAKE_JOB_TICKET) return "local";
  if (env.SILTWAKE_LANE_TICKET) { const m = /\/a(\d+)\/heartbeat$/.exec(env.SILTWAKE_JOB_HEARTBEAT ?? ""); return m ? `alickers:a${m[1]}` : "alickers:?"; }
  return null;
}
/**
 * The attempt a queue receipt reports on, its terminal attempt (R3-2): `alickers:a<N>`
 * from a remote receipt's attempt count, `local` for a job that ran here (the queue runs
 * a ticket here at most once: a local run is never retried, only a remote one falls back
 * here), and null when the receipt doesn't establish it (a remote receipt without a valid
 * count). Never a default.
 */
export function receiptAttempt(exit) {
  if (!exit) return null;
  if (!exit.remote) return "local";
  return Number.isInteger(exit.attempts) && exit.attempts >= 1 ? `alickers:a${exit.attempts}` : null;
}
/** The stored (normalised) receipt's terminal attempt: what ingest recorded, nothing derived. */
export const terminalAttempt = (rc) => rc?.attempt ?? null;

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

/**
 * One file's facts from the reports of its processes and workers (scripts/test-heavy-file.mjs),
 * for its stored row (STEW-3 R3). `rootPid`: the file's own process. ctx: { root, build,
 * cacheRoot, tracked: Set of repo-relative tracked paths, contract: the file's opt-in
 * from tests/heavy-inputs.json ({ untracked: [globs] }) or undefined }.
 * Returns { cache, cacheUse, control: { eligible, why, untrackedHash } }.
 *
 * - Cache: summed over the processes that had a build-cache store. Any process or worker
 *   the file started that never reported makes it `unknown`.
 * - Control eligibility fails closed: a file is a control only if it opts in, every
 *   descendant reported, nothing untraced was used (a FileHandle, a native addon, a
 *   non-file module), and every input the observer saw is tracked at the commit, compiled
 *   into the build from a tracked file, newly created by the file itself (judged on the
 *   resolved path) or one of its declared untracked inputs. The observer is only a
 *   tripwire: what it can't see, the opt-in's review covers. `untrackedHash` hashes every
 *   file the declared globs match, as found; both arms must agree on it.
 */
export function fileFacts(reports, rootPid, ctx) {
  const why = [], contract = ctx.contract;
  const root = reports.find((r) => r.pid === rootPid && r.threadId === 0);
  if (!root) why.push("the file's own process didn't report (it died before its exit hook)");
  const reported = new Set(reports.map((r) => `${r.pid}.${r.threadId}`)), unobserved = [];
  for (const r of reports) {
    for (const c of r.spawned ?? []) if (!(c.pid && reported.has(`${c.pid}.0`))) unobserved.push(c.cmd);
    for (const t of r.workers ?? []) if (!reported.has(`${r.pid}.${t}`)) unobserved.push(`worker thread ${t}`);
  }
  if (unobserved.length) why.push(`started what never reported: ${[...new Set(unobserved)].slice(0, 4).join(", ")}`);
  let cache = null;
  for (const r of reports) if (r.store && r.cache) { cache ??= { hits: 0, misses: 0, fills: 0, fillMs: 0 }; for (const k of Object.keys(cache)) cache[k] += r.cache[k] ?? 0; }
  const use = !root ? null : unobserved.length ? "unknown" : cacheUse(cache ?? { hits: 0, misses: 0, fills: 0, fillMs: 0 });
  if (!contract) why.unshift(`not opted in as a control (${CANONICAL_INPUTS})`);
  const untraced = [...new Set(reports.flatMap((r) => r.untraced ?? []))];
  if (untraced.length) why.push(`used what the tripwire can't follow: ${untraced.join(", ")}`);
  // The tripwire, on resolved paths: a symlink in fresh scratch to an old file reads the old file.
  const real = (p) => { try { return realpathSync(p); } catch { return p; } };
  const under = (p, dir) => dir && (p === dir || p.startsWith(dir.endsWith("/") ? dir : `${dir}/`));
  const created = reports.flatMap((r) => r.created ?? []).map(real);
  const declared = new Set((contract?.untracked ?? []).flatMap((g) => globSync(g, { cwd: ctx.root })).map((f) => join(ctx.root, f)));
  const bound = (p) => {
    const rel = relative(ctx.root, p);
    if (rel.startsWith("..")) return false;
    if (ctx.tracked.has(rel)) return true;
    const b = relative(ctx.build, p), m = /^(.*)\.(js|js\.map|json)$/.exec(b);
    return !b.startsWith("..") && Boolean(m) && (m[2] === "json" ? [b] : [".ts", ".tsx", ".mts"].map((x) => m[1] + x)).some((src) => ctx.tracked.has(src));
  };
  const unknown = new Set();
  const check = (p0) => {
    if (p0.split("/").includes("node_modules") || /^\/(proc|sys|dev)(\/|$)/.test(p0) || under(p0, ctx.cacheRoot)) return;
    const p = real(p0);
    if (created.some((d) => under(p, d))) return;
    // A directory read whole (a cpSync source) is each file in it.
    let dir = false;
    try { dir = statSync(p).isDirectory(); } catch { /* gone: judged by its path */ }
    if (dir) { for (const e of readdirSync(p)) check(join(p, e)); return; }
    if (!bound(p) && !declared.has(p)) unknown.add(relative(ctx.root, p).startsWith("..") ? p : relative(ctx.root, p));
  };
  for (const r of reports) for (const p0 of [...(r.loads ?? []), ...(r.reads ?? [])]) check(p0);
  if (unknown.size) why.push(`read what isn't tracked, compiled from tracked, its own or declared: ${[...unknown].sort().slice(0, 3).join(", ")}${unknown.size > 3 ? ` and ${unknown.size - 3} more` : ""}`);
  const hash = createHash("sha256");
  for (const f of [...declared].sort()) { hash.update(relative(ctx.root, f)).update("\0"); try { hash.update(readFileSync(f)); } catch { hash.update("<absent>"); } hash.update("\0"); }
  return { cache, cacheUse: use, control: { eligible: why.length === 0, why, untrackedHash: hash.digest("hex").slice(0, 16) } };
}

/** The audited control opt-ins, relative to the repository root. */
export const CANONICAL_INPUTS = "tests/heavy-inputs.json";

/** What a row measured: the commit and the code under test. Two arms of an A/B differ here by design. */
export const identityOf = (run, row) => ({ commit: run.commit, file: row.file, closure: row.closure ?? null, untracked: row.control?.untrackedHash ?? null,
  lock: run.lockHash ?? null, harness: run.harnessHash ?? null });

/** The conditions a row was measured under: equal for any two rows compared. */
export const conditionsOf = (run, row) => ({
  machine: run.machine, containment: run.containment, jobMemoryMiB: run.jobMemoryMiB, poolMiB: run.poolMiB, concurrency: run.concurrency,
  jobCpus: run.jobCpus ?? null, budgetMiB: row.budgetMiB, phase: row.phase, node: run.node, cacheUse: row.cacheUse ?? cacheUse(row.cache),
  settings: JSON.stringify(run.settings ?? null), runtime: JSON.stringify(run.runtime ?? null),
});

/** The record's text line. */
export const recordLine = (record) => `${RECORD_LINE}${JSON.stringify(record)}`;

/** Why `r` isn't a complete record of its version (empty: it is). Older versions are kept for reading, never eligible. */
export function schemaProblems(r) {
  if (!r || typeof r !== "object" || !Array.isArray(r.files)) return ["not a record"];
  if (r.v !== RECORD_VERSION) return r.v >= 1 && r.v < RECORD_VERSION ? [] : [`unknown record version ${r.v}`];
  const p = [], str = (k) => typeof r[k] === "string" || r[k] === null, num = (o, k) => typeof o[k] === "number" && Number.isFinite(o[k]);
  for (const k of ["at", "machine", "containment", "node", "lockHash", "harnessHash"]) if (typeof r[k] !== "string") p.push(`run.${k}`);
  for (const k of ["commit", "ticket", "attempt"]) if (!str(k)) p.push(`run.${k}`);
  if (typeof r.dirty !== "boolean" && r.dirty !== null) p.push("run.dirty");
  if (typeof r.budgetEvidence !== "boolean" || !r.cache || !r.selection || typeof r.settings !== "object" || r.settings === null || typeof r.runtime !== "object" || r.runtime === null) p.push("run context");
  if (r.selection && r.selection.files !== r.files.length) p.push(`the selection names ${r.selection.files} files, the record holds ${r.files.length}`);
  for (const f of r.files) {
    if (typeof f?.file !== "string" || typeof f.status !== "string" || !num(f, "seconds") || !num(f, "peakMiB") || !num(f, "budgetMiB") || !f.control || typeof f.control.eligible !== "boolean")
      { p.push(`row ${f?.file ?? "?"}`); break; }
  }
  return p;
}

/** Complete records in a job's output, oldest first; cut, unknown or incomplete lines are skipped. */
export function recordsIn(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    if (!line.startsWith(RECORD_LINE)) continue;
    try { const r = JSON.parse(line.slice(RECORD_LINE.length)); if (schemaProblems(r).length === 0) out.push(r); } catch { /* a cut line */ }
  }
  return out;
}

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

/** The one normalised receipt a stored run keeps, its terminal attempt included (R3-2). */
function receiptOf(exit) {
  if (!exit) return null;
  return { ticket: exit.ticket ?? null, attempt: receiptAttempt(exit), attempts: exit.attempts ?? null, code: exit.code, stopReason: exit.stopReason ?? null, label: exit.label ?? null, class: exit.class ?? null, memMiB: exit.memMiB ?? null,
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
  // A ticket can run more than once (an any job whose alickers attempt lost its receipt
  // reruns here); only the attempt the receipt reports on is that receipt's evidence.
  if (rc && !terminalAttempt(rc)) p.push("its receipt doesn't establish the job's terminal attempt");
  else if (rc && run?.attempt !== terminalAttempt(rc)) p.push(`from attempt ${run?.attempt}, not the job's terminal attempt (${terminalAttempt(rc)}): an abandoned attempt`);
  if (run?.dirty !== false) p.push("the tree had uncommitted changes (or its state is unknown)");
  if (!run?.budgetEvidence) p.push(`not budget evidence (${run?.override ? `override: ${JSON.stringify(run.override)}` : "non-canonical budgets"})`);
  if (row && row.status !== "ok") p.push(`${row.file} didn't pass (${row.status})`);
  return p;
}

/**
 * Publishes `value` at `target` once (STEW-3 R2-4): written to a temporary file of this
 * process's own, then hard-linked into place, which fails if `target` exists, so
 * concurrent ingests (the gate's and a sweep's) never clobber or trip over each other.
 * Returns true when this call published it, false when it was already there.
 */
export function publish(target, value) {
  mkdirSync(join(target, ".."), { recursive: true });
  const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  try { linkSync(tmp, target); return true; }
  catch (e) { if (e.code === "EEXIST") return false; throw e; }
  finally { rmSync(tmp, { force: true }); }
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
    if (existsSync(target)) { out.push({ ticket: id, stored: false, already: true, why: "already stored" }); continue; }
    const exit = readJson(join(jobs, id, "exit.json"));
    if (!exit) { out.push({ ticket: id, stored: false, why: "not finished" }); continue; }
    let text = "";
    try { text = readFileSync(join(jobs, id, "output.log"), "utf8"); } catch { /* no output */ }
    const records = recordsIn(text);
    if (!records.length) { out.push({ ticket: id, stored: false, why: "no heavy-results record" }); continue; }
    const stored = { v: RECORD_VERSION, ticket: id, ingestedAt: new Date().toISOString(), receipt: receiptOf({ ticket: id, ...exit }), runs: records };
    out.push(publish(target, stored) ? { ticket: id, stored: true, runs: records.length, files: records.reduce((n, r) => n + r.files.length, 0) }
      : { ticket: id, stored: false, already: true, why: "already stored" });
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
  const all = stored?.runs ?? [];
  if (!all.length) return ["its per-file heavy results weren't recorded (no heavy-results record in the job's output)"];
  // The record from the attempt the receipt reports on (R2-5): an earlier, abandoned
  // attempt's records stay in the store as diagnostics and never decide the gate.
  const terminal = stored.receipt ? terminalAttempt(stored.receipt) : null;
  const runs = all.filter((r) => r.v >= RECORD_VERSION && r.attempt === terminal).slice(-1);
  if (!terminal) return [`its receipt doesn't establish the job's terminal attempt (${stored.receipt ? "a remote receipt without its attempt count" : "no receipt"})`];
  if (!runs.length) return [`no complete v${RECORD_VERSION} record from the job's terminal attempt (${terminal}); records seen from: ${[...new Set(all.map((r) => r.attempt ?? `v${r.v}`))].join(", ")}`];
  const problems = [];
  for (const r of runs) {
    problems.push(...eligibility(stored, r));
    if (Object.keys(r.settings ?? {}).length) problems.push(`ran with workload settings (${Object.keys(r.settings).join(", ")}): not the canonical workload`);
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
 * (empty: it can). Both arms opted in and passed the tripwire, agree on their declared
 * untracked inputs, and were measured by the same harness under equal conditions.
 */
export function controlProblems(candidate, control, controlCommit) {
  const p = eligibility(control.stored, control.run, control.row);
  for (const [arm, r] of [["control", control.row], ["candidate", candidate.row]])
    if (!r.control?.eligible) p.push(`the ${arm} isn't eligible as a control${r.control?.why?.length ? ` (${r.control.why.slice(0, 2).join("; ")})` : ""}`);
  if (control.run.commit !== controlCommit) p.push(`it's for ${String(control.run.commit).slice(0, 12)}, not the intended control ${String(controlCommit).slice(0, 12)}`);
  if (control.row.file !== candidate.row.file) p.push(`it measured ${control.row.file}, not ${candidate.row.file}`);
  if (control.row.control?.untrackedHash !== candidate.row.control?.untrackedHash) p.push("their declared untracked inputs differ");
  if (!control.run.harnessHash || control.run.harnessHash !== candidate.run.harnessHash) p.push("a different measuring harness (or an unknown one)");
  if (!control.row.closure) p.push("its file's import closure wasn't recorded");
  if (candidate.row.status !== "ok") p.push(`the candidate's ${candidate.row.file} didn't pass`);
  const a = conditionsOf(control.run, control.row), b = conditionsOf(candidate.run, candidate.row);
  for (const k of Object.keys(a)) if (a[k] !== b[k]) p.push(`${k}: ${a[k]} against ${b[k]}`);
  if (!["hit", "fill", "none"].includes(a.cacheUse)) p.push(`its cache use is ${a.cacheUse ?? "unreported"}: neither a cold nor a warm measurement`);
  return p;
}

/** How long without a successful sweep before `sweep-status` reports it overdue (the queue prunes logs at 7 days). */
export const SWEEP_OVERDUE_H = 36;

/**
 * The daily sweep (STEW-3, the coordinator's timer): ingests finished jobs not yet
 * stored or checked, at most `max` per run, skipping logs over `maxLogBytes`. A job
 * still running is left for the next sweep; a job checked and holding no record is
 * remembered in the checkpoint, so its log isn't read again. Records are published only
 * when terminal and complete (ingest, recordsIn). Writes the last-success record that
 * `sweepStatus` reads. Returns its summary.
 */
export function sweep({ max = 200, maxLogBytes = 64 * 1024 * 1024, env = process.env, now = Date.now() } = {}) {
  const dir = resultsDir(env), jobs = join(schedDir(env), "jobs"), stateFile = join(dir, "sweep-state.json");
  const state = readJson(stateFile) ?? { checked: {} };
  let ids = [];
  try { ids = readdirSync(jobs).sort(); } catch (e) { throw new Error(`the queue's job logs can't be read (${jobs}): ${e.message}`); }
  const summary = { at: new Date(now).toISOString(), scanned: 0, stored: 0, noRecord: 0, running: 0, tooLarge: [], failures: [], remaining: 0 };
  for (const id of ids) {
    if (state.checked[id] || existsSync(join(dir, "runs", `${id}.json`))) continue;
    if (!existsSync(join(jobs, id, "exit.json"))) { summary.running++; continue; }
    if (summary.scanned >= max) { summary.remaining++; continue; }
    summary.scanned++;
    try {
      const size = statSync(join(jobs, id, "output.log")).size;
      if (size > maxLogBytes) { summary.tooLarge.push(id); state.checked[id] = { at: now, why: `log ${size} bytes` }; continue; }
    } catch { /* no log: ingest says so */ }
    try {
      const [r] = ingest([id], env);
      if (r.stored) summary.stored++;
      else if (!r.already) { summary.noRecord++; state.checked[id] = { at: now, why: r.why }; }
    } catch (e) { summary.failures.push(`${id}: ${e.message}`); }
  }
  // The checkpoint forgets tickets the queue has pruned (7 days).
  for (const id of Object.keys(state.checked)) if (!ids.includes(id)) delete state.checked[id];
  mkdirSync(dir, { recursive: true });
  const write = (file, value) => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(value, null, 1)); renameSync(tmp, file); };
  write(stateFile, state);
  if (!summary.failures.length) write(join(dir, "sweep-last.json"), summary);
  return summary;
}

/** The last successful sweep, and whether it's overdue: { ok, why, last }. */
export function sweepStatus(env = process.env, now = Date.now()) {
  const last = readJson(join(resultsDir(env), "sweep-last.json"));
  if (!last) return { ok: false, why: "no sweep has succeeded yet", last: null };
  const at = typeof last.at === "string" ? Date.parse(last.at) : NaN;
  if (!Number.isFinite(at) || at > now + 60000) return { ok: false, why: `the last-success record has no valid time (${JSON.stringify(last.at ?? null)})`, last };
  const ageH = (now - at) / 3600000;
  return ageH > SWEEP_OVERDUE_H ? { ok: false, why: `the last successful sweep was ${ageH.toFixed(1)} h ago (overdue after ${SWEEP_OVERDUE_H} h; the queue prunes logs at 7 days)`, last }
    : { ok: true, why: `last successful sweep ${ageH.toFixed(1)} h ago: ${last.stored} stored, ${last.scanned} scanned, ${last.remaining} left for the next`, last };
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
  if (cmd === "sweep") {
    const s = sweep({ max: Number(value("--max") ?? 200) });
    console.log(`heavy-results sweep: ${s.scanned} scanned, ${s.stored} stored, ${s.noRecord} without a record, ${s.running} still running, ` +
      `${s.remaining} left for the next sweep${s.tooLarge.length ? `, ${s.tooLarge.length} logs too large` : ""}${s.failures.length ? `; FAILED: ${s.failures.join("; ")}` : ""}`);
    process.exit(s.failures.length ? 1 : 0);
  }
  if (cmd === "sweep-status") {
    const s = sweepStatus();
    console.log(`heavy-results: ${s.ok ? "" : "OVERDUE: "}${s.why}`);
    process.exit(s.ok ? 0 : 1);
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
  console.error("usage: heavy-results.mjs ingest [TICKET...] | sweep [--max N] | sweep-status | show [--commit SHA] [--machine LABEL] [--file NAME] [--eligible] [--json] | near [--pct 85] [--commit SHA] | control --commit SHA --file NAME [--like TICKET]");
  process.exit(2);
}
