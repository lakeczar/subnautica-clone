#!/usr/bin/env node
// The local-run guard (STEW-2). factory-worker's 3090 exclusive runs are our
// performance evidence, and the same machine is where every agent works. So on
// factory-worker the repo's CPU-heavy entry points never run outside the
// heavy-check queue: started anywhere else, each runs itself again through it,
// `heavy-check run --class <its class> --machine <any|3090> -- <the same command>`,
// in the foreground, so it reads like a local run. The queue then knows every
// sanctioned CPU job, and an exclusive run drains them like any other job.
//
// A command runs directly only when it is admitted:
// - inside a heavy-check job: SILTWAKE_JOB_TICKET, and this process in that
//   ticket's own cgroup (scripts/cgroup-scope.mjs: whole path components);
// - on the alickers sandbox, positively identified: its hostname and its
//   siltwake-job tool, and no queue state there;
// - with SILTWAKE_LOCAL_OVERRIDE="<why>": run here anyway, logged (who, what, why,
//   when) to /work/tmp/siltwake-sched/local-overrides.jsonl. If the log can't be
//   written, it is refused.
// Anything else is routed. If heavy-check can't be run, the command is refused
// (exit 75) with the reason: the guard never fails open. It reads no queue state;
// the queue decides when the job starts.
//
// Not covered, by convention only: bare `npx tsc`, `npx vite build`, `vite dev`,
// `node --test <file>`, compiled runners started directly (`node .test-build/…`)
// and SCHED's acceptance suites run directly.
//
//   node scripts/local-guard.mjs [--class C] [--machine any|3090] -- COMMAND...
//       run COMMAND if admitted, else run this same line through the queue
//   node scripts/local-guard.mjs --require [--quiet] HINT
//       exit 0 if admitted, else 75 telling the caller to use HINT
//   node scripts/local-guard.mjs --status [--json]
//
// In a node script, before anything expensive loads: `guardLocalRun({ cls, machine })`.
// SILTWAKE_GUARD_STRICT=1 turns off admission by machine identity (tests on alickers;
// it can only make the guard stricter).
// SILTWAKE_HEAVY_CHECK names another queue client (tests), and says so when used.
import { spawnSync } from "node:child_process";
import { accessSync, appendFileSync, constants, existsSync, readFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasComponentMatching, hasScopeComponent, ownCgroupPath, withinCgroup } from "./cgroup-scope.mjs";

export const PRODUCTION_SCHED_DIR = "/work/tmp/siltwake-sched";
export const PRODUCTION_QUEUE = "/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh";
export const SANDBOX = Object.freeze({ host: "siltwake-alickers", tool: "/usr/local/bin/siltwake-job" });
export const REFUSED_EXIT = 75;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGGED = "SILTWAKE_LOCAL_OVERRIDE_LOGGED";
/** Not settings: the guard's own variables, and those every heavy-check job sets afresh. */
const ROUTING_ENV = new Set(["SILTWAKE_HEAVY_CHECK", "SILTWAKE_GUARD_STRICT", "SILTWAKE_LOCAL_OVERRIDE", LOGGED, "SILTWAKE_LANE_TICKET", "SILTWAKE_GPU_LEASE",
  "SILTWAKE_SOAK_MACHINE", "SILTWAKE_SCHED_DIR"]);
const JOB_ENV = /^SILTWAKE_(JOB_|HEAVY_(LOCK_HELD|CGROUP|CONCURRENCY|POOL_MIB)$)/;

/**
 * Whether a command may run directly here, from plain facts (testable):
 *   env; cgroup: this process's cgroup path; job: { cgroup, unit } of
 *   SILTWAKE_JOB_TICKET's ticket (null if unknown); host; sandboxTool: the
 *   sandbox's siltwake-job exists; queueState: the production queue directory exists.
 * Returns { admitted, why, override? }.
 */
export function admission({ env, cgroup, job = null, host = "", sandboxTool = false, queueState = true }) {
  const ticket = env.SILTWAKE_JOB_TICKET;
  let note = "";
  if (ticket) {
    const inside = job?.cgroup ? withinCgroup(cgroup, job.cgroup) : hasScopeComponent(cgroup, job?.unit);
    if (inside) return { admitted: true, why: `inside heavy-check job ${ticket}` };
    note = ` (SILTWAKE_JOB_TICKET=${ticket} is set, but this process isn't in that job's cgroup)`;
  } else if (env.SILTWAKE_HEAVY_LOCK_HELD) {
    // v1's lock runs its jobs in siltwake-heavy-*.scope units too.
    if (hasComponentMatching(cgroup, /^siltwake-heavy-.+\.scope$/)) return { admitted: true, why: "inside a v1 heavy-check scope" };
    note = " (SILTWAKE_HEAVY_LOCK_HELD is set, but this process isn't in a heavy-check scope)";
  }
  if (host === SANDBOX.host && sandboxTool && !queueState && !env.SILTWAKE_GUARD_STRICT) return { admitted: true, why: "on the alickers sandbox" };
  const reason = String(env.SILTWAKE_LOCAL_OVERRIDE ?? "").trim();
  if (reason) return { admitted: true, why: `override: ${reason}`, override: reason };
  return { admitted: false, why: `not inside a heavy-check job${note}` };
}

function readText(path) {
  try { return readFileSync(path, "utf8").trim(); } catch { return null; }
}

/** The facts admission() needs, read from this machine now: a few small files, no queue state. */
export function localFacts(env = process.env) {
  const ticket = env.SILTWAKE_JOB_TICKET;
  let job = null;
  if (ticket && /^[0-9a-z-]+$/.test(ticket)) {
    const dir = join(env.SILTWAKE_SCHED_DIR || PRODUCTION_SCHED_DIR, "jobs", ticket);
    let unit = null;
    try { unit = JSON.parse(readFileSync(join(dir, "grant.json"), "utf8")).unit ?? null; } catch { /* no grant: not admitted */ }
    job = { cgroup: readText(join(dir, "cgroup")), unit };
  }
  return { env, cgroup: ownCgroupPath(), job, host: hostname(), sandboxTool: existsSync(SANDBOX.tool), queueState: existsSync(PRODUCTION_SCHED_DIR) };
}

/** Quotes a word for sh. */
export const shellWord = (w) => (/^[\w@%+=:,./-]+$/.test(w) ? w : `'${String(w).replace(/'/g, `'\\''`)}'`);

/**
 * The queue's command line for `argv`: `run --class C --machine M -- argv`.
 * `machine` any becomes 3090 when the caller's environment carries settings
 * (SILTWAKE_*, NODE_OPTIONS) that only a job here would see.
 */
export function routeArgs(argv, { cls = "standard", machine = "any", env = process.env } = {}) {
  // Settings a routed command keeps only here: the queue sends alickers the command line alone.
  const carried = Object.keys(env).filter((k) => (k.startsWith("SILTWAKE_") && !ROUTING_ENV.has(k) && !JOB_ENV.test(k)) || k === "NODE_OPTIONS");
  const m = machine === "any" && carried.length ? "3090" : machine;
  return { args: ["run", "--class", cls, "--machine", m, "--", ...argv], note: m !== machine ? `on factory-worker, so it keeps ${carried.join(", ")}` : "" };
}

function refuse(what, reason) {
  console.error(`local-guard: ${what} refused: ${reason}. On factory-worker it runs only through the heavy-check queue, and nothing ran. ` +
    "(To run it here anyway: SILTWAKE_LOCAL_OVERRIDE=\"<why>\", which is logged.)");
  process.exit(REFUSED_EXIT);
}

/** Logs an override once per command tree; a log that can't be written refuses. */
function logOverride(what, reason, env) {
  if (env[LOGGED]) return;
  const dir = env.SILTWAKE_SCHED_DIR || PRODUCTION_SCHED_DIR;
  try {
    appendFileSync(join(dir, "local-overrides.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), user: userInfo().username, pid: process.pid, cwd: process.cwd(), what, reason })}\n`);
  } catch (e) { refuse(what, `SILTWAKE_LOCAL_OVERRIDE is set, but the override log can't be written (${e.message})`); }
  console.error(`local-guard: OVERRIDE (${reason}): running ${what} here, outside the queue; logged to ${join(dir, "local-overrides.jsonl")}. ` +
    "If `heavy-check status` shows an exclusive ticket, tell the coordinator its id and the time: this run can mark it DISTURBED.");
  env[LOGGED] = String(process.pid);
}

/** Runs `argv` through the queue in the foreground and exits with its code; refuses if the queue can't be run. */
function routeAndExit(what, argv, spec, env) {
  const queue = env.SILTWAKE_HEAVY_CHECK || PRODUCTION_QUEUE;
  try { accessSync(queue, constants.X_OK); } catch { refuse(what, `the heavy-check queue client isn't available (${queue})`); }
  const { args, note } = routeArgs(argv, { ...spec, env });
  console.error(`local-guard: ${what}: through the queue${note ? `, ${note}` : ""}: heavy-check ${args.map(shellWord).join(" ")}` +
    (queue !== PRODUCTION_QUEUE ? ` [queue client: SILTWAKE_HEAVY_CHECK=${queue}]` : ""));
  const r = spawnSync(queue, args, { stdio: "inherit", env });
  if (r.error) refuse(what, `heavy-check could not be run (${r.error.message})`);
  if (r.signal) {
    console.error(`local-guard: the queue client was stopped (${r.signal}); a job it had started keeps running: see heavy-check status`);
    process.exit(REFUSED_EXIT);
  }
  process.exit(r.status ?? REFUSED_EXIT);
}

/**
 * At the top of a node entry point, before anything expensive loads. Returns when
 * admitted; otherwise runs this same command through the queue and exits with its
 * code (or refuses). spec: { cls, machine, before } where `before` is a shell
 * command the routed job runs first (the compile a script's build output needs).
 */
export function guardLocalRun(spec = {}, env = process.env) {
  const argv = ["node", ...process.execArgv, relative(process.cwd(), process.argv[1]) || process.argv[1], ...process.argv.slice(2)];
  const what = argv.join(" ");
  const a = admission(localFacts(env));
  if (a.admitted) { if (a.override) logOverride(what, a.override, env); return a; }
  const command = spec.before ? ["sh", "-c", `${spec.before} && ${argv.map(shellWord).join(" ")}`] : argv;
  routeAndExit(what, command, spec, env);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), env = process.env;
  const a = admission(localFacts(env));
  if (args[0] === "--status") {
    if (args.includes("--json")) console.log(JSON.stringify(a));
    else console.log(`local CPU work here: ${a.admitted ? "runs directly" : "goes through the queue"} (${a.why})`);
    process.exit(0);
  }
  if (args[0] === "--require") {
    const quiet = args[1] === "--quiet", hint = args.slice(quiet ? 2 : 1).join(" ");
    if (a.admitted) { if (a.override) logOverride(hint, a.override, env); process.exit(0); }
    if (!quiet) console.error(`local-guard: this runs only inside a heavy-check job on factory-worker (${a.why}); use \`${hint}\`, which goes through the queue.`);
    process.exit(REFUSED_EXIT);
  }
  const dash = args.indexOf("--");
  const option = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 && (dash < 0 || i < dash) ? args[i + 1] : fallback; };
  const command = dash >= 0 ? args.slice(dash + 1) : [];
  if (!command.length) { console.error("usage: local-guard.mjs [--class C] [--machine any|3090] -- COMMAND... | --require [--quiet] HINT | --status [--json]"); process.exit(2); }
  const what = command.join(" ");
  if (!a.admitted) routeAndExit(what, ["node", relative(process.cwd(), join(root, "scripts", "local-guard.mjs")), ...args], { cls: option("--class", "standard"), machine: option("--machine", "any") }, env);
  if (a.override) logOverride(what, a.override, env);
  const r = spawnSync(command[0], command.slice(1), { stdio: "inherit", env });
  if (r.error) { console.error(`local-guard: ${command[0]}: ${r.error.message}`); process.exit(127); }
  if (r.signal) process.kill(process.pid, r.signal);
  process.exit(r.status ?? 1);
}
