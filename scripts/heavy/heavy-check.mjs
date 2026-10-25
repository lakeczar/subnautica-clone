#!/usr/bin/env node
// heavy-check v2: admission queue for heavy jobs on the shared factory-worker.
// scripts/heavy-check.sh runs the installed copy of this file. Usage is in
// docs/build/WORKER_RESOURCE_LIMITS.md; the design is in SCHED-1.md.
//
//   heavy-check [run] [OPTIONS] [--] CMD...   submit, then follow to the end (v1-compatible)
//   heavy-check submit [OPTIONS] [--] CMD...  print a ticket at once; the job runs detached
//   heavy-check wait TICKET [--max S] [--json] block up to S s; the job's exit code, or 99 if pending
//   heavy-check status [TICKET]               the queue, or one ticket
//   heavy-check log TICKET [-f]               the job's output
//   heavy-check cancel TICKET                 remove a queued ticket or stop a running one
//   heavy-check release-remote TICKET --reason "…"   coordinator only: free a remote
//                                             ticket whose sandbox is confirmed gone
//   heavy-check maintenance set --by WHO --reason "…"     coordinator only: pause admission
//   heavy-check maintenance clear --op OP --by WHO --reason "…"   resume it
//   heavy-check maintenance status            the mark, its age and owner
//
// OPTIONS: --class quick|standard|heavy-suite|gpu|playthrough|bake|soak|exclusive
//          --review  --stall S  --deadline S  --cpus N  --mem 3G  --gpu (soak)
//          --snapshot  --no-test-build  --queue-timeout S
//          --machine any|3090|4070|soak  --artifact PATH (repeatable)
// A job runs until its command ends. It is stopped if it stalls (no output and
// no touch of $SILTWAKE_JOB_HEARTBEAT for --stall S), at --deadline S if
// given, or at its class's runaway ceiling (exclusive: a 30-minute cap).
// Exit codes: the job's own; 123 stalled; 124 deadline or ceiling; 137 OOM or
// killed; 75 cancelled, expired or a preempted soak; 3 rejected (the worktree
// changed before admission); 99 still pending (wait only); 2 usage or a
// request that can never fit.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASS_NAMES, MACHINE_LABELS, classInfo, classifyCommand, coalesceKey, intentEnv, parseMiB, plan, portableCommand, resolveMachine, resolveRequest, tokensFor } from "./policy.mjs";
import { resolveScript, stepBoundary } from "./portable-run.mjs";
import { hasScopeComponent, ownCgroupPath } from "./cgroup-scope.mjs";
import { makeSnapshot, snapshotStatus } from "./snapshot.mjs";
import { buildOnly, builtOutputs, externalPaths, readHealth, remoteConfig } from "./remote.mjs";
import {
  alive, ensureDirs, flockFd, gitTree, v1Scope, gpuUsers, hostFor, jobDir, ledger, loadConfig, readJson, readMode, readState, terminalRecord,
  reconcile, scopePopulated, sliceCheck, systemctl, transaction, worktreeOf, writeJsonAtomic,
} from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
const SUBCOMMANDS = new Set(["run", "submit", "wait", "status", "log", "cancel", "release-remote", "maintenance", "help", "--help", "-h"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (msg) => process.stderr.write(`heavy-check: ${msg}\n`);
const fail = (msg, code = 2) => { say(msg); process.exit(code); };

function parseJob(args) {
  const opts = {};
  let i = 0;
  const value = (flag) => { if (i + 1 >= args.length) fail(`${flag} needs a value`); return args[++i]; };
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === "--") { i++; break; }
    if (!a.startsWith("--")) break;
    if (a === "--class") opts.class = value(a);
    else if (a === "--review") opts.review = true;
    else if (a === "--deadline") opts.deadline = Number(value(a));
    else if (a === "--stall") opts.stallS = Number(value(a));
    else if (a === "--snapshot") opts.snapshot = true;
    else if (a === "--no-test-build") opts.noTestBuild = true;
    else if (a === "--gpu") opts.gpu = true;
    else if (a === "--machine") opts.machine = value(a);
    else if (a === "--artifact") (opts.artifacts ??= []).push(value(a));
    else if (a === "--cpus") opts.cpus = Number(value(a));
    else if (a === "--mem") { const v = value(a); opts.memMiB = parseMiB(v); if (!Number.isFinite(opts.memMiB)) fail(`--mem ${v}: use 3G or 2048M`); }
    else if (a === "--queue-timeout") opts.queueTimeoutS = Number(value(a));
    else fail(`unknown option ${a} (see: heavy-check help)`);
  }
  const command = args.slice(i);
  if (!command.length) fail("no command given. usage: heavy-check [run|submit] [--class C] [--review] [--deadline S] [--cpus N] [--mem 3G] -- CMD...");
  // v1 environment, kept for old briefs.
  if (opts.memMiB == null && process.env.HEAVY_MEMORY_MAX) opts.memMiB = parseMiB(process.env.HEAVY_MEMORY_MAX);
  if (opts.queueTimeoutS == null && process.env.HEAVY_LOCK_WAIT) opts.queueTimeoutS = Number(process.env.HEAVY_LOCK_WAIT);
  // For package scripts that call heavy-check themselves (test:heavy).
  if (!opts.snapshot && process.env.HEAVY_SNAPSHOT === "1") opts.snapshot = true;
  if (opts.class && !CLASS_NAMES.includes(opts.class)) fail(`unknown class ${opts.class} (${CLASS_NAMES.join(", ")})`);
  return { opts, command };
}

/**
 * A heavy-check call from inside a running job runs inline, inside the job's
 * own scope and reservation. The environment alone is not proof: the process
 * must sit in that ticket's scope, and a nested call cannot add the GPU or
 * exclusive use its job was not granted. Returns an exit code, or null when
 * this is not a nested call.
 */
async function nested(opts, command) {
  const ticket = process.env.SILTWAKE_JOB_TICKET, legacy = process.env.SILTWAKE_HEAVY_LOCK_HELD;
  if (!ticket && !legacy) return null;
  const cgroup = ownCgroupPath() ?? "";
  const cls = classInfo(opts.class ?? classifyCommand(command));
  if (ticket) {
    const grant = readJson(join(jobDir(cfg, ticket), "grant.json"));
    if (!grant || !hasScopeComponent(cgroup, grant.unit))
      fail(`SILTWAKE_JOB_TICKET=${ticket}, but this process is not inside that ticket's scope; refusing. Unset it, or run inside the job.`);
    if (cls.gpu && !grant.gpu) fail(`nested ${opts.class ?? "exclusive"} call inside ${grant.class} ticket ${ticket}, which has no GPU lease; submit the GPU work as its own --class gpu job`);
    if (cls.exclusive && !grant.exclusive) fail(`nested exclusive call inside ${grant.class} ticket ${ticket}; submit it as its own --class exclusive job`);
  } else if (!v1Scope(cgroup, cfg.unitPrefix)) {
    fail("SILTWAKE_HEAVY_LOCK_HELD is set, but this process is not inside a heavy-check scope; refusing");
  }
  // The outer job's own stall window and limit govern; this only bounds a runaway.
  const deadline = Math.min(opts.deadline ?? cls.ceilingS, cls.ceilingS);
  const child = spawn("timeout", ["--kill-after=10s", `${deadline}s`, ...command], { stdio: "inherit" });
  return await new Promise((done) => child.on("exit", (code, sig) => done(code ?? (sig === "SIGKILL" ? 137 : 143))));
}

const hostNow = (state = readState(cfg)) => hostFor(cfg, state);

async function submit(opts, command, { quiet = false } = {}) {
  ensureDirs(cfg);
  pruneOldJobs();
  const held = readState(cfg).maintenance;
  if (held) say(maintenanceNotice(held));
  const mode = readMode(cfg), T = tokensFor(hostNow().nproc);
  const cls = opts.class ?? classifyCommand(command);
  const req = resolveRequest({ ...opts, class: cls }, { T, M: cfg.poolMiB, mode, minStallS: cfg.minStallS, ceilings: cfg.ceilings, stalls: cfg.stalls });
  if (req.error) fail(`refused: ${req.error}`);
  for (const n of req.notes) say(n);
  if (!opts.class && cls !== "standard") say(`class ${cls} chosen from the command; pass --class to override`);
  if (req.exclusive && !req.serial && /(^|[\s;&|(])(for|while|until)\s|;\s*do\b/.test(command.join(" ")))
    say("exclusive is one measurement per ticket (30-minute cap). Submit each segment of a series as its own ticket; " +
      "the queue then runs waiting work between them (exclusive turns)");
  if (req.goal.soak && Object.values(readState(cfg).tickets).some((t) => t.state === "queued" && !t.goal))
    fail("refused for now: SCHED-1 tickets are still queued, and their code would let a waiting soak hold the pools; retry when they have started", 75);
  const cwd = process.cwd(), worktree = worktreeOf(cwd), tree = gitTree(cwd);
  if (opts.snapshot && !tree.head) fail("--snapshot needs a git worktree");
  // The second worker runs a commit (SCHED-2b): only a clean tree can go, and
  // only a command that names nothing outside it but its declared --artifact
  // outputs, and doesn't only build an output that wouldn't come back. Then
  // (SCHED-3) an `any` job goes there only if it's declared portable: a
  // registered command, or the caller's own --machine. Otherwise it is routed
  // to the 3090 with the reason (a --snapshot is a clean tree's commit, so it
  // needs no rule of its own); a `soak` job runs here; a `4070` job is refused.
  const lane = remoteConfig(cfg);
  const external = externalPaths(command, worktree, opts.artifacts ?? []), built = builtOutputs(command), builds = buildOnly(command, opts.artifacts ?? []);
  const why = !lane.enabled ? `the remote lane is off (${readHealth(cfg).detail})` : !tree.head ? "not a git tree"
    : tree.dirty !== "clean" ? "uncommitted changes (alickers runs a commit)" : external.length ? `it names local paths alickers lacks: ${external.slice(0, 3).join(", ")} (declare outputs with --artifact)`
    : built.length ? `it reads build output a commit lacks (${built.join(", ")}); compile inside the job, e.g. npm run playthrough, or npm run build && …`
    : builds ? `it only builds (${builds.command}) and declares no --artifact ${builds.output ?? "for its output"}: build output must stay here` : null;
  const portable = portableCommand(command);
  const routed = resolveMachine(req.goal.machine, why, { explicit: opts.machine != null, portable, intent: intentEnv(process.env) });
  if (routed.error) fail(`refused: ${routed.error}`);
  // A registered command placed by default runs through this commit's portable
  // runner (R3), on whichever machine takes it: the same command line and
  // environment on both, and never npm. A commit without one runs here as submitted.
  let run = command;
  if (routed.machine === "any" && opts.machine == null && portable) {
    const show = (path) => spawnSync("git", ["-C", worktree, "show", `${tree.head}:${path}`], { encoding: "utf8", maxBuffer: 16 * 1048576 });
    let r = show("scripts/heavy/portable-run.mjs").status !== 0 ? { error: "this commit has no portable runner (scripts/heavy/portable-run.mjs)" } : {};
    if (!r.error) {
      try { r = resolveScript(JSON.parse(show("package.json").stdout).scripts, portable.run[1], portable.run.slice(2), 0, worktree); } catch { r = { error: "its package.json can't be read" }; }
    }
    // Every step's file, through its symlinks, inside the repository or its node_modules (R5-F1); the tree is clean, so this is the commit.
    if (!r.error) { const outside = r.steps.map(([, path]) => stepBoundary(worktree, path)).find(Boolean); if (outside) r = { error: outside }; }
    if (r.error) Object.assign(routed, { machine: "3090", routed: { from: "any", reason: `${r.error}; pass --machine any to declare it portable` } });
    else { run = ["node", relative(cwd, join(worktree, "scripts", "heavy", "portable-run.mjs")), ...portable.run]; req.goal.portable = { name: portable.name, command }; }
  }
  const machine = req.goal.machine = routed.machine;
  if (routed.routed) req.goal.routed = routed.routed;
  req.goal.remoteOk = machine !== "3090" && !why;
  if (routed.routed || (why && machine === "soak")) say(`runs here (factory-worker), not on alickers: ${routed.routed?.reason ?? why}`);
  // A routed job's relative --artifact is where it writes it here, as for an `any` job run here.
  for (const a of opts.artifacts ?? []) if ((machine === "3090" && !routed.routed) || (machine !== "3090" && !req.goal.remoteOk)) { if (!a.startsWith("/")) fail(`--artifact ${a}: a job running here needs an absolute path`); }
  const id = newTicket();
  const key = coalesceKey({ worktree, cwd, argv: command, class: cls, cpus: opts.cpus, memMiB: opts.memMiB, review: opts.review, head: tree.head, dirty: tree.dirty, snapshot: opts.snapshot, gpu: opts.gpu, machine: opts.machine, artifacts: opts.artifacts });
  const dir = jobDir(cfg, id);
  mkdirSync(dir, { recursive: true });
  // --snapshot: the job runs on a copy of the tree as it is now (snapshot.mjs).
  let snapshot;
  if (opts.snapshot) {
    const s = makeSnapshot(worktree, cwd, join(dir, "tree"), tree.head);
    if (s.error) { rmSync(dir, { recursive: true, force: true }); fail(`--snapshot: ${s.error}`, 1); }
    snapshot = { ...s, status: snapshotStatus(s.root) };
  }
  // The job inherits this environment, so its tests read this build directory (R1-F4).
  const testBuild = process.env.SILTWAKE_TEST_BUILD || ".test-build";
  if (!/^\.test-build(-[A-Za-z0-9_.]+)?$/.test(testBuild)) fail(`SILTWAKE_TEST_BUILD=${testBuild}: use .test-build-<name>`);
  writeJsonAtomic(join(dir, "request.json"), {
    id, key, worktree, cwd, argv: run, opts: { ...opts, class: cls }, req, tree, snapshot, testBuild,
    submittedAt: Date.now(), queueTimeoutS: opts.queueTimeoutS ?? cfg.queueTimeoutS,
  });
  writeFileSync(join(dir, "output.log"), "");
  startSupervisor(id);
  let ack = null;
  for (let i = 0; i < 400 && !(ack = readJson(join(dir, "ack.json"))); i++) await sleep(50);
  if (!ack) fail(`the supervisor for ${id} did not start; see ${join(dir, "supervisor.log")}`, 70);
  if (ack.joined) {
    rmSync(dir, { recursive: true, force: true });
    if (!quiet) say(`same command and tree already queued or running: joined ticket ${ack.joined}`);
    return ack.joined;
  }
  if (!quiet) say(`submitted ${id} (${req.class}${req.review ? ", review" : ""}: ${req.tokens} cpu, ${req.memMiB} MiB${req.gpu ? ", GPU" : ""}${req.serial ? ", serial mode" : ""}${snapshot ? ", snapshot" : ""})`);
  return id;
}

/** Detached: own session, and its own systemd scope when it can have one, so
 * neither the caller's process group nor its cgroup ending stops the job. */
function startSupervisor(id) {
  const log = openSync(join(jobDir(cfg, id), "supervisor.log"), "a");
  const script = join(here, "supervisor.mjs");
  const viaScope = ["--user", "--scope", "--quiet", "--collect", `--unit=${cfg.supervisorPrefix}-${id}`, process.execPath, script, id];
  const probe = spawnSync("systemd-run", ["--user", "--version"], { stdio: "ignore" });
  const [cmd, args] = probe.status === 0 ? ["systemd-run", viaScope] : [process.execPath, [script, id]];
  spawn(cmd, args, { detached: true, stdio: ["ignore", log, log], env: process.env }).unref();
  closeSync(log);
}

function newTicket() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${String(d.getUTCFullYear()).slice(2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}-${Math.random().toString(16).slice(2, 6)}`;
}

function pruneOldJobs() {
  const cutoff = Date.now() - 7 * 86400000;
  let names = [];
  try { names = readdirSync(cfg.paths.jobs); } catch { return; }
  for (const name of names) {
    const exit = join(cfg.paths.jobs, name, "exit.json");
    try { if (statSync(exit).mtimeMs < cutoff) rmSync(join(cfg.paths.jobs, name), { recursive: true, force: true }); } catch { /* live or partial */ }
  }
}

async function runCmd(args) {
  const { opts, command } = parseJob(args);
  const inline = await nested(opts, command);
  if (inline != null) return inline;
  const id = await submit(opts, command, { quiet: true });
  say(`ticket ${id}; the job keeps running if this call ends: wait with \`heavy-check wait ${id}\`, stop with \`heavy-check cancel ${id}\``);
  return await follow(id, { stream: true });
}

async function submitCmd(args) {
  const { opts, command } = parseJob(args);
  if (process.env.SILTWAKE_JOB_TICKET || process.env.SILTWAKE_HEAVY_LOCK_HELD)
    fail("submit inside a running heavy job would queue behind itself; use the plain run form, which runs nested calls inline");
  const id = await submit(opts, command);
  process.stdout.write(`${id}\n`);
  return 0;
}

async function waitCmd(args) {
  const id = args[0];
  if (!id) fail("usage: heavy-check wait TICKET [--max SECONDS]");
  const i = args.indexOf("--max");
  const max = i >= 0 ? Number(args[i + 1]) : null;
  if (i >= 0 && !(max >= 0)) fail("--max needs seconds");
  return await follow(id, { stream: false, maxS: max, json: args.includes("--json") });
}

/** Follows a ticket until it ends (or maxS passes: 99). The run form streams
 * the job's output as it is written; wait prints the last lines at the end. */
async function follow(id, { stream, maxS = null, json = false }) {
  const dir = jobDir(cfg, id), exitPath = join(dir, "exit.json"), outPath = join(dir, "output.log");
  if (!existsSync(dir)) fail(`unknown ticket ${id}`);
  const started = Date.now();
  let offset = 0, lastLine = "", lastPrinted = 0, missing = 0;
  const pump = () => {
    if (!stream) return;
    let fd;
    try { fd = openSync(outPath, "r"); } catch { return; }
    const buf = Buffer.alloc(65536);
    for (let n; (n = readSync(fd, buf, 0, buf.length, offset)) > 0; offset += n) process.stdout.write(buf.subarray(0, n));
    closeSync(fd);
  };
  let lastRecover = 0;
  for (;;) {
    pump();
    if (Date.now() - lastRecover > 5000) { recover(); lastRecover = Date.now(); }
    const exit = readJson(exitPath);
    if (exit) {
      pump();
      if (!stream) printTail(outPath, 40);
      say(finalLine(exit));
      // --json: the result record as the last stdout line, so a caller never
      // has to tell a pending 99 from a job's own 99 by its code (TST-22).
      if (json) process.stdout.write(`\n${JSON.stringify({ pending: false, ...exit })}\n`);
      return exit.code;
    }
    const line = positionLine(id);
    if (line == null) { if (++missing > 4) fail(`ticket ${id} is not queued or running and has no result`); }
    else missing = 0;
    // Printed when the position or blocker changes (not the clock), and every 5 minutes (SCHED-3 R5).
    const key = line?.replace(/(, waited| for) \S+$/, "");
    if (line && (key !== lastLine || Date.now() - lastPrinted > 300000) && !(stream && line.startsWith("running"))) {
      say(`${id} ${line}`); lastLine = key; lastPrinted = Date.now();
    }
    if (maxS != null && Date.now() - started >= maxS * 1000) {
      say(`${id} still pending (${line ?? "unknown"}); call wait again`);
      if (json) process.stdout.write(`${JSON.stringify({ pending: true, ticket: id, position: line ?? null })}\n`);
      return 99;
    }
    await sleep(500);
  }
}

function printTail(path, n) {
  let text = "";
  try { text = readFileSync(path, "utf8"); } catch { return; }
  const lines = text.split("\n");
  if (lines.length > n + 1) process.stdout.write(`… (${lines.length - n - 1} earlier lines: heavy-check log ${basenameOf(path)})\n`);
  process.stdout.write(lines.slice(-n - 1).join("\n"));
}
const basenameOf = (p) => p.split("/").at(-2);

function positionLine(id) {
  const state = readState(cfg);
  const t = state.tickets[id];
  if (!t) return null;
  if (t.state === "running") return `running for ${dur(Date.now() - t.admittedAt)}`;
  const p = plan(state, Date.now(), hostNow(state), cfg);
  const pos = p.order.indexOf(id) + 1;
  const why = p.admit.some((a) => a.id === id) ? "starting" : `blocked by ${p.blocked[id] ?? "queue"}`;
  return `queued, position ${pos} of ${p.order.length}, ${why}, waited ${dur(Date.now() - t.submittedAt)}`;
}

function finalLine(e) {
  const parts = [`${e.ticket} exit ${e.code}${e.label ? ` (${e.label})` : ""}`];
  if (e.admittedAt) parts.push(`queued ${dur(e.admittedAt - e.submittedAt)}${e.ranS != null ? `, ran ${dur(e.ranS * 1000)}` : ""}`);
  if (e.peakMiB != null) parts.push(`peak ${e.peakMiB} of ${e.memMiB} MiB, ${e.cpuS} CPU-s`);
  if (e.unavailable) parts.push(`unavailable: ${Object.keys(e.unavailable).join(", ")} (${Object.values(e.unavailable)[0]})`);
  if (e.evidence) {
    const tr = `${e.evidence.commit?.slice(0, 10) ?? "not git"}${e.dirtyAtAdmit && e.dirtyAtAdmit !== "clean" ? `+dirty:${e.dirtyAtAdmit}` : ""}`;
    parts.push(e.evidence.bound ? `evidence for ${tr}${e.evidence.snapshot ? " (snapshot)" : ""}` : `tested ${tr}; NOT evidence for a commit: ${e.evidence.why}`);
  } else if (e.head !== undefined && e.stopReason !== "rejected") {
    const tr = (h, d) => (h ? `${h.slice(0, 10)}${d === "clean" ? "" : `+dirty:${d}`}` : "not git");
    parts.push(e.changedTree
      ? `WARNING tree changed: submitted ${tr(e.head, e.dirty)}, tested ${tr(e.headAtAdmit, e.dirtyAtAdmit)}`
      : `tested ${tr(e.headAtAdmit, e.dirtyAtAdmit)}`);
  }
  const route = e.goal?.routed ? ` (any, routed here: ${e.goal.routed.reason})` : "";
  parts.push(e.ran === false ? `never ran; planned for ${e.planned}${route}`
    : `on ${e.machine ?? MACHINE_LABELS.local}${e.ran === "unknown" ? " (whether its command started there is unknown)" : ""}${route}`);
  if (e.artifacts?.length) parts.push(`artifacts: ${e.artifacts.map((a) => a.local ?? `${a.remote ?? a.path} (${a.error ?? "here"})`).join(", ")}`);
  if (e.gpuShared) parts.push(`GPU shared outside the lease with pid ${e.gpuShared.map((u) => u.pid).join(", ")}`);
  if (e.context?.v === 2) {
    const c = e.context, j = c.job;
    parts.push(`exclusive context: ${j ? `job CPU wait ${j.cpuSomePct}% (worst ${j.cpuSomeWorstPct}%), memory stall ${j.memSomePct}% (worst ${j.memSomeWorstPct}%), ${j.majorFaults} major faults, ${j.swapIns} swap-ins` : "job contention unmeasured"}` +
      (c.host ? `, steal ${c.host.stealWorstPct ?? "?"}% worst, other CPU ${c.host.otherCpuPct ?? "?"}%, host swap-in ${c.host.swapInPages ?? "?"} pages` : "") +
      (c.boost ? `, ${c.boost.status === "applied" ? `CPU priority in ${c.boost.slice} (weight ${c.boost.weight})` : `no CPU priority (${c.boost.status})`}` : "") +
      (c.disturbed ? ` — DISTURBED: ${c.reasons.join("; ")}` : ""));
  } else if (e.context) parts.push(`exclusive context: load ≤${e.context.load1Max}, cpu PSI some ≤${e.context.cpuSomeMax}%${e.context.disturbed ? " — DISTURBED by work outside the lane" : ""}`);
  return parts.join("; ");
}

function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, "0")}m`;
}

function statusCmd(args) {
  recover();
  const state = readState(cfg), host = hostNow(state), now = Date.now();
  if (args[0]) {
    const t = state.tickets[args[0]] ?? null, exit = readJson(join(jobDir(cfg, args[0]), "exit.json"));
    if (!t && !exit) fail(`unknown ticket ${args[0]}`);
    process.stdout.write(`${JSON.stringify(t ?? exit, null, 1)}\n`);
    if (t) process.stdout.write(`${positionLine(args[0])}\n`);
    return 0;
  }
  const p = plan(state, now, host, cfg);
  const running = Object.values(state.tickets).filter((t) => t.state === "running");
  const M = cfg.poolMiB;
  process.stdout.write(`mode ${readMode(cfg)}; pool ${p.used.tokens}/${p.T} cpu, ${p.used.memMiB}/${M} MiB, GPU ${p.used.gpu ? "leased" : "free"}; ` +
    `express ${p.used.express ? "busy" : "free"}; MemAvailable ${host.memAvailableMiB} MiB, memory PSI full ${host.memFullAvg10}%` +
    `${host.legacy.holder ? `; v1 lock HELD (pid ${host.legacy.holders.join(",")})` : ""}${host.legacy.waiter ? "; v1 waiter present: v2 admissions paused" : ""}\n`);
  if (state.maintenance) process.stdout.write(`${maintenanceLine(state.maintenance, now)}\n`);
  if (cfg.manageSlice) {
    const sc = sliceCheck(cfg, host.nproc);
    process.stdout.write(`slice ${cfg.slice}: cpu.max ${sc.cpuMax ?? "?"}, memory.max ${sc.memMax ?? "?"}` +
      (sc.ok ? " (as wanted)\n" : `; WANTED ${sc.want.cpuQuotaPct}% and ${sc.want.memoryMaxMiB} MiB (the next admission corrects it)\n`));
  }
  const rh = readHealth(cfg);
  process.stdout.write(`alickers (second worker): ${rh.state}${rh.at ? `, checked ${dur(now - rh.at)} ago` : ""}${rh.detail ? ` (${rh.detail})` : ""}\n`);
  const unleased = gpuUsers(cfg, state).filter((u) => !u.leased);
  if (unleased.length) process.stdout.write(`GPU in use outside the lease: ${unleased.map((u) => `pid ${u.pid} (${u.cmd.slice(0, 60)})`).join("; ")}\n`);
  const rows = [["TICKET", "WORKTREE", "CLASS", "MACHINE", "STATE", "TIME", "BLOCKED-BY", "COMMAND"]];
  // `^`: an `any` job routed to the 3090 at submit (SCHED-3), with why below.
  const mach = (t) => (t.state === "running" ? (t.remote ? "alickers" : "here") : t.goal?.machine ?? "3090") + (t.fellBack ? "*" : "") + (t.goal?.routed ? "^" : "");
  for (const t of running) rows.push([t.id, wt(t), cls(t), mach(t), t.express ? "running*" : "running", dur(now - t.admittedAt), "", cmd(t)]);
  for (const id of p.order) {
    const t = state.tickets[id];
    rows.push([id, wt(t), cls(t), mach(t), "queued", dur(now - t.submittedAt), p.admit.some((a) => a.id === id) ? "(starting)" : p.blocked[id] ?? "", cmd(t)]);
  }
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  for (const r of rows) process.stdout.write(`${r.map((v, c) => (c === r.length - 1 ? v : v.padEnd(widths[c]))).join("  ")}\n`);
  if (running.some((t) => t.express)) process.stdout.write("* express slot\n");
  for (const t of [...running, ...p.order.map((id) => state.tickets[id])].filter((x) => x.goal?.routed))
    process.stdout.write(`^ ${t.id}: any, routed here: ${t.goal.routed.reason}\n`);
  return 0;
}
const wt = (t) => t.worktree.split("/").at(-1);
const cls = (t) => `${t.req.class}${t.req.review ? "/review" : ""}`;
const cmd = (t) => { const s = t.argv.join(" "); return s.length > 60 ? `${s.slice(0, 57)}...` : s; };

async function logCmd(args) {
  const id = args.find((a) => !a.startsWith("-"));
  if (!id) fail("usage: heavy-check log TICKET [-f]");
  const dir = jobDir(cfg, id);
  if (!existsSync(dir)) fail(`unknown ticket ${id}`);
  if (!args.includes("-f")) { process.stdout.write(readFileSync(join(dir, "output.log"), "utf8")); return 0; }
  return await follow(id, { stream: true });
}

async function cancelCmd(args) {
  const id = args[0];
  if (!id) fail("usage: heavy-check cancel TICKET");
  const r = transaction(cfg, (state) => {
    const t = state.tickets[id];
    if (!t) return { result: existsSync(join(jobDir(cfg, id), "exit.json")) ? "finished" : "unknown" };
    if (t.state === "running") { writeFileSync(join(jobDir(cfg, id), "cancelled"), ""); return { result: { running: t.unit } }; }
    delete state.tickets[id];
    writeJsonAtomic(join(jobDir(cfg, id), "exit.json"), terminalRecord(t, { code: 75, label: "cancelled while queued" }));
    ledger(cfg, { event: "cancelled", ticket: id, worktree: t.worktree, class: t.req.class, waitedS: Math.round((Date.now() - t.submittedAt) / 1000) });
    if (alive(t.supervisor)) process.kill(t.supervisor.pid, "SIGTERM");
    return { changed: true, result: "removed" };
  });
  if (r === "unknown") fail(`unknown ticket ${id}`);
  if (r === "finished") { say(`${id} already finished`); return 0; }
  if (r === "removed") { say(`${id} removed from the queue`); return 0; }
  // Running: under the launch gate (shared with scope-run.sh), either the
  // command has not started and never will, or it has and its scope is stopped.
  const dir = jobDir(cfg, id), unit = r.running;
  const gate = flockFd(join(dir, "gate"), { wait: 30 });
  if (gate == null) fail(`${id}: could not take the launch gate; try again`, 1);
  writeFileSync(join(dir, "cancelled"), "");
  const started = existsSync(join(dir, "started"));
  closeSync(gate);
  if (started) systemctl("stop", `${unit}.scope`); // only this ticket's scope
  // Report only once the ticket has a result and its scope is conclusively empty.
  for (let i = 0; ; i++) {
    recover();
    const exit = readJson(join(dir, "exit.json"));
    if (exit && !scopePopulated(unit)) { say(finalLine(exit)); return 0; }
    if (i === 600) fail(`${id}: still stopping after 2 minutes; see heavy-check status`, 1);
    if (started && i % 50 === 49) systemctl("stop", `${unit}.scope`);
    await sleep(200);
  }
}

/**
 * The coordinator's override for a dead sandbox (SCHED-2b R3): a remote
 * ticket waits, by rule, until alickers confirms its attempt stopped, so one
 * whose sandbox never comes back holds its reservation for good. Only when
 * the owner has confirmed the sandbox is gone, this writes a cancelled,
 * unbound terminal record with the reason, frees the reservation and ends the
 * ticket's holder and recovery (checked by PID and start time). The job is not
 * retried here; nothing calls this automatically. Root fix: a sandbox-side
 * lease (fleet's siltwake-job).
 */
function releaseRemoteCmd(args) {
  const id = args[0], at = args.indexOf("--reason"), reason = at >= 0 ? String(args[at + 1] ?? "").trim() : "";
  if (!id || id.startsWith("-") || !reason) fail('usage: heavy-check release-remote TICKET --reason "owner confirmed the sandbox is gone" (coordinator only)');
  const by = `${process.env.USER ?? "?"} (pid ${process.pid})`;
  const r = transaction(cfg, (state) => {
    const t = state.tickets[id];
    if (!t) return { result: existsSync(join(jobDir(cfg, id), "exit.json")) ? "finished" : "unknown" };
    if (!t.remote || t.state !== "running") return { result: "not-remote" };
    const request = readJson(join(jobDir(cfg, id), "request.json"));
    // Whether the attempt on alickers started is exactly what nobody could confirm.
    const result = terminalRecord(t, {
      code: 75, stopReason: "released", attempts: t.attempts,
      label: `released by the coordinator: ${reason}. The attempt on alickers was never confirmed stopped; the job was not run here`,
      released: { reason, by, at: Date.now() }, head: request?.tree?.head ?? null,
      evidence: { commit: request?.tree?.head ?? null, bound: false, why: `released by the coordinator: ${reason}`, snapshot: false },
    }, { ran: "unknown", remote: true });
    writeJsonAtomic(join(jobDir(cfg, id), "exit.json"), result);
    ledger(cfg, { event: "remote-released", ...result, holder: t.holder ?? null, recovering: t.recovering ?? null });
    delete state.tickets[id];
    return { changed: true, result: { holder: t.holder, holderUnit: t.holderUnit, recovering: t.recovering } };
  });
  if (r === "unknown") fail(`unknown ticket ${id}`);
  if (r === "finished") { say(`${id} already finished`); return 0; }
  if (r === "not-remote") fail(`${id} is not a running remote ticket; use heavy-check cancel`);
  // Its holder and any recovery would wait for alickers for good: end them (they also stop by themselves on the record).
  for (const p of [r.holder, r.recovering]) if (alive(p)) { try { process.kill(p.pid, "SIGKILL"); } catch { /* gone */ } }
  if (r.holderUnit) systemctl("stop", "--no-block", `${r.holderUnit}.scope`);
  say(`${id} released: ${reason}. Its reservation on alickers is free; the job was not run here. If alickers comes back, its attempt files stay in the lane directory there`);
  return 0;
}

/** Finishes tickets whose owner died (state.mjs reconcile), so wait, status
 * and cancel reach a result even when nothing else is queued to run a
 * transaction. Takes no lock while every owner process is alive. */
function recover() {
  const owner = (t) => (t.state === "running" && t.holder ? t.holder : t.supervisor);
  if (Object.values(readState(cfg).tickets).every((t) => alive(owner(t)))) return;
  transaction(cfg, (state) => ({ changed: reconcile(cfg, state) }));
}

/** Past this, status calls a maintenance window overdue (a warning; nothing expires it). */
const MAINTENANCE_OVERDUE_MS = 15 * 60000;
const proc = (x) => (x?.by?.pid ? ` (pid ${x.by.pid}${alive(x.by) ? ", still running" : ", ended"})` : "");
const INSTALLER_RECOVERY = "rerun scripts/heavy/install.sh until it verifies (it clears its own mark then)";
/** How to end a mark: a manual window's clear, or an installer's verified rerun. */
const endMark = (m) => (m.manual && !m.under ? `heavy-check maintenance clear --op ${m.op} --by <who> --reason "<why>"` : INSTALLER_RECOVERY);
/** Who holds a mark, for a one-line notice. */
const holderOf = (m) => (m.manual ? `${m.setBy}: ${m.why ?? m.reason} (op ${m.op})` : `the installer${proc(m)}: ${m.reason}`);

/** The status lines for a maintenance mark: a manual one (heavy-check maintenance) or an installer's. */
function maintenanceLine(m, now = Date.now()) {
  const age = now - (m.since ?? now);
  const head = m.manual ? `MAINTENANCE for ${dur(age)}: ${m.reason}, set by ${m.setBy} (op ${m.op})` : `MAINTENANCE for ${dur(age)}: ${m.reason}${proc(m)}`;
  const lines = [`${head}; nothing is admitted on either machine, queued tickets wait (their queue timeouts still run), running ones continue. ${m.recover ?? "Recover: rerun scripts/heavy/install.sh"}`];
  if (m.under) lines.push(/incomplete/.test(m.under.reason)
    ? `INSTALL INCOMPLETE under this window: ${m.under.reason}${proc(m.under)}. The window can't be cleared until ${INSTALLER_RECOVERY}.`
    : `An install runs under this window: ${m.under.reason}${proc(m.under)}.`);
  if (!m.manual && /incomplete/.test(m.reason)) lines.push(`INSTALL INCOMPLETE: ${INSTALLER_RECOVERY}.`);
  if (age > MAINTENANCE_OVERDUE_MS) lines.push(`OVERDUE: held over ${MAINTENANCE_OVERDUE_MS / 60000} min. End it: ${endMark(m)}`);
  return lines.join("\n");
}

/** One line for submit and run while a mark is held, from its first minute (a warning; it changes nothing). */
const maintenanceNotice = (m, now = Date.now()) =>
  `maintenance held for ${dur(now - (m.since ?? now))} by ${holderOf(m)}; this ticket waits until it ends (its queue timeout still runs)${m.under && /incomplete/.test(m.under.reason) ? "; an install under it is INCOMPLETE" : ""}`;

/**
 * Manual maintenance (coordinator only, by convention and audit; SCHED-3
 * maintenance). `set` pauses admission on both machines with the same mark the
 * installer uses (state.maintenance), owned by an operation (a nonce) and the
 * named person; running tickets continue. `clear` takes that nonce, and only
 * for a manual mark: an installer's mark ends only when a rerun of install.sh
 * verifies (R1-F2). It takes the installer's lock first, without waiting, in
 * the installer's order (install.lock, then the state lock), and refuses while
 * any install holds it or runs or left an incomplete mark under the window
 * (R1-F1). The audit, <state>/maintenance.jsonl, gets an intent row under the
 * state lock before the change is committed (no row, no change), and an
 * outcome row after it, both with the nonce: an intent with no outcome is an
 * operation interrupted at the commit, and the state says which way (R1-F3).
 */
function maintenanceCmd(args) {
  const action = args[0], opt = (f) => { const i = args.indexOf(f); return i > 0 ? String(args[i + 1] ?? "").trim() : ""; };
  if (action === "status") {
    const m = readState(cfg).maintenance;
    process.stdout.write(m ? `${maintenanceLine(m)}\n` : "no maintenance: admission is open\n");
    return 0;
  }
  const by = opt("--by"), reason = opt("--reason");
  if (!["set", "clear"].includes(action) || !by || !reason || (action === "clear" && !opt("--op")))
    fail('usage: heavy-check maintenance set --by WHO --reason "<why>" | clear --op OP --by WHO --reason "<why>" | status');
  const auditPath = join(cfg.dir, "maintenance.jsonl");
  const audit = (row) => appendFileSync(auditPath, `${JSON.stringify({ at: new Date().toISOString(), user: process.env.USER ?? null, pid: process.pid, ...row })}\n`);
  /** The intent row, under the state lock; a failure refuses the change. */
  const intent = (row) => { try { audit({ phase: "intent", ...row }); return null; } catch (e) { return `the audit log ${auditPath} can't be written (${e.code ?? e.message}), so nothing was changed`; } };
  const outcome = (row) => { try { audit({ phase: "done", ...row }); } catch (e) { say(`warning: the change is made, but its outcome row couldn't be written to ${auditPath} (${e.code ?? e.message}); its intent row records it`); } };
  ensureDirs(cfg);
  if (action === "set") {
    const op = randomBytes(8).toString("hex"), since = Date.now();
    const r = transaction(cfg, (state) => {
      if (state.maintenance) return { result: { exists: state.maintenance } };
      const bad = intent({ action: "set", op, by, reason });
      if (bad) return { result: { refused: bad } };
      state.maintenance = { op, manual: true, setBy: by, why: reason, since, reason: `maintenance: ${reason}`,
        recover: `Resume: heavy-check maintenance clear --op ${op} --by <who> --reason "<why>"` };
      return { changed: true, result: { op } };
    });
    if (r.exists) fail(`refused: maintenance is already set\n${maintenanceLine(r.exists)}`, 3);
    if (r.refused) fail(`refused: ${r.refused}`, 3);
    outcome({ action: "set", op, by });
    say(`maintenance set (op ${op}): nothing is admitted on either machine; running tickets continue. Resume: heavy-check maintenance clear --op ${op} --by <who> --reason "<why>"`);
    process.stdout.write(`${op}\n`);
    return 0;
  }
  const op = opt("--op");
  // The installer's lock, then the state lock (its order), held through the transaction.
  const installLock = flockFd(join(cfg.dir, "install.lock"));
  if (installLock == null) fail("refused: an install is running (it holds install.lock); clear the window once it has finished", 3);
  try {
    const r = transaction(cfg, (state) => {
      const m = state.maintenance;
      if (!m) return { result: { refused: "no maintenance is set" } };
      if (m.op !== op) return { result: { refused: `the mark is operation ${m.op}, not ${op}` } };
      if (!m.manual) return { result: { refused: `it's an installer's mark (${m.reason}${proc(m)}); ${INSTALLER_RECOVERY}` } };
      if (m.under) return { result: { refused: `an install runs under it, or left it incomplete (${m.under.reason}${proc(m.under)}); ${alive(m.under.by) ? "wait for it" : INSTALLER_RECOVERY}` } };
      const bad = intent({ action: "clear", op, by, reason });
      if (bad) return { result: { refused: bad } };
      delete state.maintenance;
      return { changed: true, result: { cleared: m } };
    });
    if (r.refused) fail(`refused: ${r.refused}`, 3);
    outcome({ action: "clear", op, by, heldS: Math.round((Date.now() - (r.cleared.since ?? Date.now())) / 1000) });
  } finally { closeSync(installLock); }
  say(`maintenance cleared (op ${op}): admission resumes`);
  return 0;
}

// Dispatch last: commands run during module evaluation, so every helper above
// must already be initialised.
const argv = process.argv.slice(2);
const sub = SUBCOMMANDS.has(argv[0]) ? argv.shift() : "run";
switch (sub) {
  case "run": process.exit(await runCmd(argv));
  case "submit": process.exit(await submitCmd(argv));
  case "wait": process.exit(await waitCmd(argv));
  case "status": process.exit(statusCmd(argv));
  case "log": process.exit(await logCmd(argv));
  case "cancel": process.exit(await cancelCmd(argv));
  case "release-remote": process.exit(releaseRemoteCmd(argv));
  case "maintenance": process.exit(maintenanceCmd(argv));
  default: process.stdout.write(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1).filter((l, i, all) => all.slice(0, i + 1).every((x) => x.startsWith("//"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n") + "\n");
}
