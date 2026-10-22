#!/usr/bin/env node
// heavy-check v2: admission queue for heavy jobs on the shared factory-worker.
// scripts/heavy-check.sh runs the installed copy of this file. Usage is in
// docs/build/WORKER_RESOURCE_LIMITS.md; the design is in SCHED-1.md.
//
//   heavy-check [run] [OPTIONS] [--] CMD...   submit, then follow to the end (v1-compatible)
//   heavy-check submit [OPTIONS] [--] CMD...  print a ticket at once; the job runs detached
//   heavy-check wait TICKET [--max S]         block up to S s; the job's exit code, or 99 if pending
//   heavy-check status [TICKET]               the queue, or one ticket
//   heavy-check log TICKET [-f]               the job's output
//   heavy-check cancel TICKET                 remove a queued ticket or stop a running one
//
// OPTIONS: --class quick|standard|heavy-suite|gpu|playthrough|bake|exclusive
//          --review  --deadline S  --cpus N  --mem 3G  --queue-timeout S
// Exit codes: the job's own; 124 deadline; 137 OOM or killed; 75 cancelled or
// expired; 99 still pending (wait only); 2 usage or a request that can never fit.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASS_NAMES, classInfo, classifyCommand, coalesceKey, parseMiB, plan, resolveRequest, tokensFor } from "./policy.mjs";
import {
  alive, ensureDirs, gitTree, jobDir, ledger, legacyLockInfo, loadConfig, readJson, readMode, readState,
  sampleHost, systemctl, transaction, worktreeOf, writeJsonAtomic,
} from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
const SUBCOMMANDS = new Set(["run", "submit", "wait", "status", "log", "cancel", "help", "--help", "-h"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (msg) => process.stderr.write(`heavy-check: ${msg}\n`);
const fail = (msg, code = 2) => { say(msg); process.exit(code); };

const argv = process.argv.slice(2);
const sub = SUBCOMMANDS.has(argv[0]) ? argv.shift() : "run";
switch (sub) {
  case "run": process.exit(await runCmd(argv));
  case "submit": process.exit(await submitCmd(argv));
  case "wait": process.exit(await waitCmd(argv));
  case "status": process.exit(statusCmd(argv));
  case "log": process.exit(await logCmd(argv));
  case "cancel": process.exit(await cancelCmd(argv));
  default: process.stdout.write(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 18).map((l) => l.replace(/^\/\/ ?/, "")).join("\n") + "\n");
}

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
  const deadline = Math.min(opts.deadline ?? cls.maxRunS, cls.maxRunS);
  const child = spawn("timeout", ["--kill-after=10s", `${deadline}s`, ...command], { stdio: "inherit" });
  return await new Promise((done) => child.on("exit", (code, sig) => done(code ?? (sig === "SIGKILL" ? 137 : 143))));
}

function hostNow(state = readState(cfg)) {
  const host = sampleHost(cfg, state);
  host.legacy = legacyLockInfo(cfg.legacyLock);
  return host;
}

async function submit(opts, command, { quiet = false } = {}) {
  ensureDirs(cfg);
  pruneOldJobs();
  const mode = readMode(cfg), T = tokensFor(hostNow().nproc);
  const cls = opts.class ?? classifyCommand(command);
  const req = resolveRequest({ ...opts, class: cls }, { T, M: cfg.poolMiB, mode });
  if (req.error) fail(`refused: ${req.error}`);
  for (const n of req.notes) say(n);
  if (!opts.class && cls !== "standard") say(`class ${cls} chosen from the command; pass --class to override`);
  const cwd = process.cwd(), worktree = worktreeOf(cwd), tree = gitTree(cwd);
  const id = newTicket();
  const key = coalesceKey({ worktree, cwd, argv: command, class: cls, cpus: opts.cpus, memMiB: opts.memMiB, review: opts.review, head: tree.head, dirty: tree.dirty });
  const dir = jobDir(cfg, id);
  mkdirSync(dir, { recursive: true });
  writeJsonAtomic(join(dir, "request.json"), {
    id, key, worktree, cwd, argv: command, opts: { ...opts, class: cls }, req, tree,
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
  if (!quiet) say(`submitted ${id} (${req.class}${req.review ? ", review" : ""}: ${req.tokens} cpu, ${req.memMiB} MiB${req.gpu ? ", GPU" : ""}${req.serial ? ", serial mode" : ""})`);
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
  return await follow(id, { stream: false, maxS: max });
}

/** Follows a ticket until it ends (or maxS passes: 99). The run form streams
 * the job's output as it is written; wait prints the last lines at the end. */
async function follow(id, { stream, maxS = null }) {
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
  for (;;) {
    pump();
    const exit = readJson(exitPath);
    if (exit) {
      pump();
      if (!stream) printTail(outPath, 40);
      say(finalLine(exit));
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
  if (e.admittedAt) parts.push(`queued ${dur(e.admittedAt - e.submittedAt)}, ran ${dur(e.ranS * 1000)}`);
  if (e.peakMiB != null) parts.push(`peak ${e.peakMiB} of ${e.memMiB} MiB, ${e.cpuS} CPU-s`);
  if (e.head !== undefined) {
    const tr = (h, d) => (h ? `${h.slice(0, 10)}${d === "clean" ? "" : `+dirty:${d}`}` : "not git");
    parts.push(e.changedTree
      ? `WARNING tree changed: submitted ${tr(e.head, e.dirty)}, tested ${tr(e.headAtAdmit, e.dirtyAtAdmit)}`
      : `tested ${tr(e.headAtAdmit, e.dirtyAtAdmit)}`);
  }
  if (e.context) parts.push(`exclusive context: load ≤${e.context.load1Max}, cpu PSI some ≤${e.context.cpuSomeMax}%${e.context.disturbed ? " — DISTURBED by work outside the lane" : ""}`);
  return parts.join("; ");
}

function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, "0")}m`;
}

function statusCmd(args) {
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
  const rows = [["TICKET", "WORKTREE", "CLASS", "STATE", "TIME", "BLOCKED-BY", "COMMAND"]];
  for (const t of running) rows.push([t.id, wt(t), cls(t), t.express ? "running*" : "running", dur(now - t.admittedAt), "", cmd(t)]);
  for (const id of p.order) {
    const t = state.tickets[id];
    rows.push([id, wt(t), cls(t), "queued", dur(now - t.submittedAt), p.admit.some((a) => a.id === id) ? "(starting)" : p.blocked[id] ?? "", cmd(t)]);
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
  systemctl("stop", `${r.running}.scope`); // only this ticket's scope
  for (let i = 0; i < 300 && !existsSync(join(jobDir(cfg, id), "exit.json")); i++) await sleep(100);
  say(`${id} stopped`);
  return 0;
}
