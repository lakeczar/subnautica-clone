#!/usr/bin/env node
// The local-run guard (STEW-2). factory-worker's 3090 exclusive runs are our
// performance evidence, and the same machine is where every agent compiles and
// tests. Every CPU-heavy entry point of the repo (npm test, test:build, build,
// typecheck, the tiers, the playthrough, the bake, the benches, the economy
// scripts, the saves build) asks this guard first:
//
// - **inside a heavy-check job** (SILTWAKE_JOB_TICKET, and this process really
//   sits in that ticket's scope, judged as heavy-check's own nested calls judge
//   it), or on a machine with no queue (the alickers sandbox): it runs;
// - **outside the queue, while a 3090 `exclusive` ticket is running or queued**
//   (a queued one can start at any moment): it refuses, in one line naming the
//   ticket and the queued form of the same command (exit 75);
// - **override:** SILTWAKE_LOCAL_OVERRIDE="<why>" runs it anyway, and logs who,
//   what, why and which exclusive tickets it may disturb;
// - **otherwise** it runs, and leaves a local-run lease (below).
//
// Cheap: one read of the queue's state.json (no heavy-check call, no systemd,
// no process-tree scan; liveness is a /proc/<pid>/stat read per ticket). It
// fails open, with a warning, when the state can't be read or understood: a
// broken queue admits nothing either, and blocking every agent's tests on a
// queue fault would stop all work to protect runs that aren't happening.
//
// **Local-run leases.** A run the guard lets through leaves
// <state dir>/local-runs/<pid>.json ({ pid, start, at, what, cwd }) for the life
// of the process that runs the work: the guarded node process itself, or with
// --lease-parent the package script's or shell script's own shell. A check made
// once at start can't see an exclusive submitted a minute later; the lease is
// what lets the queue see the run. With the proposed SCHED patch
// (docs/build/streams/stew2/), an exclusive at the head of the queue waits for
// live leases (blocked reason `local`) before it starts, and leases older than
// LEASE_MAX_S stop counting. A guarded command run by a process that already
// holds a live lease (a later step of the same `npm test`) is covered by it:
// it takes no lease of its own and runs, unless an exclusive is already running.
//
//   node scripts/local-guard.mjs [--lease-parent] WHAT   exit 0: go ahead; 75: refused
//   node scripts/local-guard.mjs --status [--json]        what the guard sees now
//
// In a script: `guardLocalRun("what")` at the top (exits 75 on refusal).
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCTION_SCHED_DIR = "/work/tmp/siltwake-sched";
/** A lease older than this stops holding an exclusive back (and is reported). */
export const LEASE_MAX_S = 20 * 60;
export const REFUSED_EXIT = 75;
const QUEUE = "scripts/heavy-check.sh";
const LOG_MAX_BYTES = 4 * 1024 * 1024;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const schedDir = (env = process.env) => env.SILTWAKE_SCHED_DIR || PRODUCTION_SCHED_DIR;
export const leasesDir = (env = process.env) => join(schedDir(env), "local-runs");
const logPath = (env) => join(schedDir(env), "local-runs.jsonl");

/** Process start time in clock ticks, or null if the pid is gone (as state.mjs's procStart). */
export function procStart(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]);
  } catch { return null; }
}
const procParent = (pid) => {
  try { const stat = readFileSync(`/proc/${pid}/stat`, "utf8"); return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]); } catch { return 0; }
};
const alive = (p) => Boolean(p?.pid) && p.start != null && procStart(p.pid) === p.start;

/** The ticket's class, read the way every protocol so far has written it. */
const classOf = (t) => t?.req?.class ?? t?.opts?.class ?? t?.class ?? null;

/**
 * What the queue's state says about 3090 exclusive tickets, from the raw text of
 * state.json (null: the file doesn't exist). Pure but for `isAlive`.
 * Returns { queue: "none" | "ok" | "unreadable", why?, running: [ids], queued: [ids], unknownShape: n }.
 * A queued ticket counts only while its supervisor lives: one whose supervisor
 * died can never be admitted (the queue drops it at its next reconcile). A
 * running one counts regardless: its job may outlive its holder.
 */
export function readExclusives(text, isAlive = alive) {
  if (text == null) return { queue: "none", running: [], queued: [], unknownShape: 0 };
  let state;
  try { state = JSON.parse(text); } catch (e) { return { queue: "unreadable", why: `state.json does not parse (${e.message})`, running: [], queued: [], unknownShape: 0 }; }
  if (!state || typeof state.tickets !== "object" || state.tickets === null)
    return { queue: "unreadable", why: `state.json has no tickets (protocol ${state?.protocol ?? "?"})`, running: [], queued: [], unknownShape: 0 };
  const out = { queue: "ok", running: [], queued: [], unknownShape: 0 };
  for (const [id, t] of Object.entries(state.tickets)) {
    const cls = classOf(t);
    if (!cls || (t.state !== "running" && t.state !== "queued")) { out.unknownShape++; continue; }
    if (cls !== "exclusive" || t.remote) continue;
    if (t.state === "running") out.running.push(id);
    else if (!t.supervisor || isAlive(t.supervisor)) out.queued.push(id);
  }
  return out;
}

/**
 * Whether this process runs inside a heavy-check job. The environment alone is
 * not proof (heavy-check's nested() rule): the process must sit in that
 * ticket's scope. `grant` is the ticket's grant.json (its scope unit), `cgroup`
 * the text of /proc/self/cgroup.
 */
export function insideJob(env, cgroup, grant) {
  const ticket = env.SILTWAKE_JOB_TICKET;
  if (ticket) {
    if (grant?.unit && cgroup.includes(`/${grant.unit}.scope`)) return { inside: true, ticket };
    return { inside: false, why: `SILTWAKE_JOB_TICKET=${ticket} is set, but this process is not inside that ticket's scope` };
  }
  // v1's lock (and its nested calls) runs jobs in siltwake-heavy-* scopes too.
  if (env.SILTWAKE_HEAVY_LOCK_HELD && /\/siltwake-heavy-[^/]*\.scope(\/|$)/m.test(cgroup)) return { inside: true, ticket: "v1" };
  return { inside: false };
}

/**
 * The guard's decision. Inputs are plain data so every case is testable:
 *   exclusives: readExclusives(...);  job: insideJob(...);
 *   override: SILTWAKE_LOCAL_OVERRIDE (a reason, or empty);
 *   coveredBy: the pid of an ancestor holding a live lease, or null.
 * Returns { verdict: "run" | "refuse" | "override", why, lease: boolean, warn? }.
 */
export function decide({ exclusives, job, override = "", coveredBy = null }) {
  const reason = String(override ?? "").trim();
  if (job.inside) return { verdict: "run", why: `inside heavy-check job ${job.ticket}`, lease: false };
  if (exclusives.queue === "none") return { verdict: "run", why: "no heavy-check queue on this machine", lease: false };
  if (exclusives.queue === "unreadable")
    return { verdict: "run", why: "the queue's state is unreadable", lease: false,
      warn: `local-guard: warning: ${exclusives.why}; running unguarded (fail open). Check \`${QUEUE} status\` before long local work.` };
  const warn = exclusives.unknownShape ? `local-guard: warning: ${exclusives.unknownShape} queue ticket(s) have a shape this guard doesn't know (a newer queue protocol?); update scripts/local-guard.mjs` : undefined;
  const { running, queued } = exclusives;
  // A later step of a run already in progress: its lease holds the queued exclusive back.
  const blocking = coveredBy ? running : [...running, ...queued];
  if (!blocking.length) return { verdict: "run", why: coveredBy ? `covered by the lease of pid ${coveredBy}` : "no 3090 exclusive is running or queued", lease: !coveredBy, warn };
  const why = running.length
    ? `3090 exclusive ${running[0]} is running${running.length + queued.length > 1 ? ` (${running.length + queued.length - 1} more running or queued)` : ""}`
    : `3090 exclusive ${queued[0]} is queued and can start at any moment${queued.length > 1 ? ` (${queued.length - 1} more queued)` : ""}`;
  if (reason) return { verdict: "override", why, lease: !coveredBy, warn };
  return { verdict: "refuse", why, lease: false, warn };
}

/** The pid of the nearest ancestor (or this process) holding a live lease, or null. A few /proc reads. */
export function coveringLease(env = process.env, from = process.pid) {
  const dir = leasesDir(env);
  if (!existsSync(dir)) return null;
  for (let pid = from, i = 0; pid > 1 && i < 16; pid = procParent(pid), i++) {
    const lease = readJson(join(dir, `${pid}.json`));
    if (lease && alive(lease) && Date.now() - lease.at < LEASE_MAX_S * 1000) return pid;
  }
  return null;
}

/** Live leases (pid alive, younger than LEASE_MAX_S); prunes the dead ones. For --status and the queue's view. */
export function liveLeases(env = process.env, now = Date.now()) {
  const dir = leasesDir(env), live = [], stale = [];
  let names = [];
  try { names = readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)); } catch { return { live, stale }; }
  for (const n of names) {
    const lease = readJson(join(dir, n));
    if (!lease || !alive(lease)) { rmSync(join(dir, n), { force: true }); continue; }
    (now - lease.at < LEASE_MAX_S * 1000 ? live : stale).push(lease);
  }
  return { live, stale };
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function readText(path) {
  try { return readFileSync(path, "utf8"); } catch (e) { return e.code === "ENOENT" ? null : `\u0000${e.message}`; }
}

/** Everything the decision needs, read from this machine now. */
export function localRunCheck(env = process.env) {
  const text = readText(join(schedDir(env), "state.json"));
  const exclusives = text?.startsWith("\u0000")
    ? { queue: existsSync(schedDir(env)) ? "unreadable" : "none", why: `state.json can't be read (${text.slice(1)})`, running: [], queued: [], unknownShape: 0 }
    : readExclusives(text);
  let cgroup = "";
  try { cgroup = readFileSync("/proc/self/cgroup", "utf8"); } catch { /* not Linux: never inside a job */ }
  const grant = env.SILTWAKE_JOB_TICKET ? readJson(join(schedDir(env), "jobs", env.SILTWAKE_JOB_TICKET, "grant.json")) : null;
  const job = insideJob(env, cgroup, grant);
  const coveredBy = job.inside || exclusives.queue !== "ok" ? null : coveringLease(env);
  return { exclusives, job, coveredBy, ...decide({ exclusives, job, override: env.SILTWAKE_LOCAL_OVERRIDE, coveredBy }) };
}

/** The same command, as the queue would run it. */
function queuedForm(what, env) {
  const event = env.npm_lifecycle_event;
  const command = event ? (event === "test" ? "npm test" : `npm run ${event}`) : what;
  return `${QUEUE} --machine any -- ${command}`;
}

function appendLog(env, record) {
  const path = logPath(env);
  try {
    if (existsSync(path) && statSync(path).size > LOG_MAX_BYTES) renameSync(path, `${path}.1`);
    const fd = openSync(path, "a");
    try { writeSync(fd, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`); } finally { closeSync(fd); }
  } catch { /* the log is attribution, never a reason to block or crash */ }
}

function writeLease(env, pid, what) {
  const start = procStart(pid);
  if (start == null) return null;
  const dir = leasesDir(env), path = join(dir, `${pid}.json`);
  try {
    mkdirSync(dir, { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`, fd = openSync(tmp, "w");
    try { writeSync(fd, JSON.stringify({ pid, start, at: Date.now(), what, cwd: process.cwd() })); } finally { closeSync(fd); }
    renameSync(tmp, path);
    return path;
  } catch { return null; }
}

/**
 * Asks the guard before CPU-heavy local work; exits REFUSED_EXIT when refused.
 * what: a short label (default: this script and its arguments).
 * leaseParent: the lease is for the parent process (a package script's shell,
 * a bash script), which outlives this call; otherwise for this process, and
 * removed when it exits.
 */
export function guardLocalRun(what = defaultWhat(), { leaseParent = false, env = process.env } = {}) {
  const d = localRunCheck(env);
  if (d.warn) console.error(d.warn);
  if (d.verdict === "refuse") {
    appendLog(env, { event: "refused", what, cwd: process.cwd(), why: d.why, running: d.exclusives.running, queued: d.exclusives.queued });
    console.error(`local-guard: ${what} refused here: ${d.why}. Queue it instead: ${queuedForm(what, env)} ` +
      `(commit first and it can run on alickers; to run here anyway, set SILTWAKE_LOCAL_OVERRIDE="<why>", which is logged)`);
    process.exit(REFUSED_EXIT);
  }
  if (d.verdict === "override") {
    appendLog(env, { event: "override", what, cwd: process.cwd(), reason: String(env.SILTWAKE_LOCAL_OVERRIDE).trim(), why: d.why, running: d.exclusives.running, queued: d.exclusives.queued, pid: process.pid });
    console.error(`local-guard: OVERRIDE (${String(env.SILTWAKE_LOCAL_OVERRIDE).trim()}): running ${what} here although ${d.why}; ` +
      `logged to ${logPath(env)}. ${d.exclusives.running.length ? "Tell the coordinator, with the ticket id and the time: this run can mark it DISTURBED." : ""}`.trim());
  }
  if (d.lease) {
    liveLeases(env); // prunes the leases of ended runs (a package script's shell never removes its own)
    const pid = leaseParent ? process.ppid : process.pid;
    const path = writeLease(env, pid, what);
    if (path && !leaseParent) process.on("exit", () => rmSync(path, { force: true }));
  }
  return d;
}

function defaultWhat() {
  const script = process.argv[1] ? relative(root, process.argv[1]) || basename(process.argv[1]) : "node";
  return ["node", script, ...process.argv.slice(2)].join(" ");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === "--status") {
    const d = localRunCheck(), leases = liveLeases();
    const view = { verdict: d.verdict, why: d.why, queue: d.exclusives.queue, running: d.exclusives.running, queued: d.exclusives.queued, inside: d.job.inside, leases: leases.live, staleLeases: leases.stale };
    if (args.includes("--json")) console.log(JSON.stringify(view));
    else {
      console.log(`local work here: ${d.verdict === "refuse" ? "REFUSED" : d.verdict} (${d.why})`);
      for (const l of leases.live) console.log(`  local run pid ${l.pid}, ${Math.round((Date.now() - l.at) / 1000)} s: ${l.what} (${l.cwd})`);
      for (const l of leases.stale) console.log(`  local run pid ${l.pid}, ${Math.round((Date.now() - l.at) / 1000)} s, past ${LEASE_MAX_S} s (no longer holds an exclusive back): ${l.what}`);
    }
    process.exit(0);
  }
  const leaseParent = args[0] === "--lease-parent";
  const what = args.slice(leaseParent ? 1 : 0).join(" ");
  if (!what) { console.error("usage: node scripts/local-guard.mjs [--lease-parent] WHAT | --status [--json]"); process.exit(2); }
  guardLocalRun(what, { leaseParent });
}
