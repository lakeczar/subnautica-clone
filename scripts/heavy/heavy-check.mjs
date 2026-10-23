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
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASS_NAMES, MACHINE_LABELS, classInfo, classifyCommand, coalesceKey, parseMiB, plan, resolveRequest, tokensFor } from "./policy.mjs";
import { makeSnapshot, snapshotStatus } from "./snapshot.mjs";
import { boostWeight } from "./contention.mjs";
import { builtOutputs, externalPaths, readHealth, remoteConfig } from "./remote.mjs";
import {
  alive, ensureDirs, flockFd, gitTree, gpuUsers, hostFor, jobDir, ledger, loadConfig, readJson, readMode, readState,
  reconcile, scopePopulated, sliceCheck, systemctl, transaction, worktreeOf, writeJsonAtomic,
} from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
const SUBCOMMANDS = new Set(["run", "submit", "wait", "status", "log", "cancel", "release-remote", "help", "--help", "-h"]);
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
  const cgroup = readFileSync("/proc/self/cgroup", "utf8");
  const cls = classInfo(opts.class ?? classifyCommand(command));
  if (ticket) {
    const grant = readJson(join(jobDir(cfg, ticket), "grant.json"));
    if (!grant || !cgroup.includes(`/${grant.unit}.scope`))
      fail(`SILTWAKE_JOB_TICKET=${ticket}, but this process is not inside that ticket's scope; refusing. Unset it, or run inside the job.`);
    if (cls.gpu && !grant.gpu) fail(`nested ${opts.class ?? "exclusive"} call inside ${grant.class} ticket ${ticket}, which has no GPU lease; submit the GPU work as its own --class gpu job`);
    if (cls.exclusive && !grant.exclusive) fail(`nested exclusive call inside ${grant.class} ticket ${ticket}; submit it as its own --class exclusive job`);
  } else if (!/\/siltwake-heavy-[^/]*\.scope$/m.test(cgroup) && !cgroup.includes(`/${cfg.unitPrefix}-`)) {
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
  // outputs. An `any` or `soak` job that can't go runs here; a `4070` job is refused.
  const machine = req.goal.machine, lane = remoteConfig(cfg);
  const external = externalPaths(command, worktree, opts.artifacts ?? []), built = builtOutputs(command);
  const why = !lane.enabled ? `the remote lane is off (${readHealth(cfg).detail})` : !tree.head ? "not a git tree"
    : tree.dirty !== "clean" ? "uncommitted changes (alickers runs a commit)" : external.length ? `it names local paths alickers lacks: ${external.slice(0, 3).join(", ")} (declare outputs with --artifact)`
    : built.length ? `it reads build output a commit lacks (${built.join(", ")}); compile inside the job, e.g. npm run playthrough, or npm run build && …` : null;
  req.goal.remoteOk = machine !== "3090" && !why;
  if (machine === "4070" && why) fail(`refused: --machine 4070 runs on alickers, but ${why}`);
  if (why && machine !== "3090" && !(machine === "any" && !opts.machine)) say(`runs here (factory-worker), not on alickers: ${why}`);
  for (const a of opts.artifacts ?? []) if (machine === "3090" || !req.goal.remoteOk) { if (!a.startsWith("/")) fail(`--artifact ${a}: a job running here needs an absolute path`); }
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
    id, key, worktree, cwd, argv: command, opts: { ...opts, class: cls }, req, tree, snapshot, testBuild,
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
    if (line && (line !== lastLine || Date.now() - lastPrinted > 300000) && !(stream && line.startsWith("running"))) {
      say(`${id} ${line}`); lastLine = line; lastPrinted = Date.now();
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
  parts.push(`on ${e.machine ?? MACHINE_LABELS.local}`);
  if (e.artifacts?.length) parts.push(`artifacts: ${e.artifacts.map((a) => a.local ?? `${a.remote ?? a.path} (${a.error ?? "here"})`).join(", ")}`);
  if (e.gpuShared) parts.push(`GPU shared outside the lease with pid ${e.gpuShared.map((u) => u.pid).join(", ")}`);
  if (e.context?.v === 2) {
    const c = e.context, j = c.job;
    parts.push(`exclusive context: ${j ? `job CPU wait ${j.cpuSomePct}% (worst ${j.cpuSomeWorstPct}%), memory stall ${j.memSomePct}% (worst ${j.memSomeWorstPct}%), ${j.majorFaults} major faults, ${j.swapIns} swap-ins` : "job contention unmeasured"}` +
      (c.host ? `, steal ${c.host.stealWorstPct ?? "?"}% worst, other CPU ${c.host.otherCpuPct ?? "?"}%, host swap-in ${c.host.swapInPages ?? "?"} pages` : "") +
      (c.boost ? `, ${c.boost.slice} CPU weight ${c.boost.applied ? c.boost.weight : "not raised"}` : "") +
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
  const mach = (t) => (t.state === "running" ? (t.remote ? "alickers" : "here") : t.goal?.machine ?? "3090") + (t.fellBack ? "*" : "");
  for (const t of running) rows.push([t.id, wt(t), cls(t), mach(t), t.express ? "running*" : "running", dur(now - t.admittedAt), "", cmd(t)]);
  for (const id of p.order) {
    const t = state.tickets[id];
    rows.push([id, wt(t), cls(t), mach(t), "queued", dur(now - t.submittedAt), p.admit.some((a) => a.id === id) ? "(starting)" : p.blocked[id] ?? "", cmd(t)]);
  }
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  for (const r of rows) process.stdout.write(`${r.map((v, c) => (c === r.length - 1 ? v : v.padEnd(widths[c]))).join("  ")}\n`);
  if (running.some((t) => t.express)) process.stdout.write("* express slot\n");
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
    writeJsonAtomic(join(jobDir(cfg, id), "exit.json"), { ticket: id, code: 75, label: "cancelled while queued", endedAt: Date.now() });
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
    const result = {
      ticket: id, code: 75, stopReason: "released", class: t.req.class, remote: true, machine: MACHINE_LABELS.remote, machineTag: t.goal?.machine, attempts: t.attempts,
      label: `released by the coordinator: ${reason}. The attempt on alickers was never confirmed stopped; the job was not run here`,
      released: { reason, by, at: Date.now() }, submittedAt: t.submittedAt, admittedAt: t.admittedAt, endedAt: Date.now(), head: request?.tree?.head ?? null,
      evidence: { commit: request?.tree?.head ?? null, bound: false, why: `released by the coordinator: ${reason}`, snapshot: false },
    };
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
  const s = readState(cfg);
  // An exclusive boost record (TST-16) is reconciled too, with no tickets left: a reset may be pending.
  // So is a raised weight with no record (the backstop; a cheap cgroup read).
  const raised = cfg.boostSlice && !s.boost && boostWeight(cfg.boostSlice, { cheapOnly: true }).value != null;
  if (!s.boost && !raised && Object.values(s.tickets).every((t) => alive(owner(t)))) return;
  transaction(cfg, (state) => ({ changed: reconcile(cfg, state) }));
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
  default: process.stdout.write(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1).filter((l, i, all) => all.slice(0, i + 1).every((x) => x.startsWith("//"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n") + "\n");
}
