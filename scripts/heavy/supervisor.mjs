#!/usr/bin/env node
// One heavy-check v2 ticket's detached supervisor:
//
//   node supervisor.mjs TICKET      (config comes from the SILTWAKE_SCHED_* env)
//
// Started by `submit` in its own session (and its own systemd scope, so the
// agent's tool call ending does not take it down). It enqueues the ticket,
// admits it when the plan says so, holds the legacy lock in shared mode for
// the run (exclusive for an exclusive job), runs the command in a capped scope
// in the heavy slice, records the result and the ledger line, and frees the
// reservation. If it dies, the next transaction stops its scope and frees it.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jobEnv, plan, resolveRequest, sliceLimits, tokensFor } from "./policy.mjs";
import {
  cgroupRead, cpuContext, flockFd, gitTree, jobDir, ledger, legacyLockInfo, loadConfig, readFileSafe, readJson,
  readMode, reconcile, sampleHost, scopeActive, self, systemctl, transaction, writeJsonAtomic,
} from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
const cfg = loadConfig();
const dir = jobDir(cfg, id);
const request = readJson(join(dir, "request.json"));
if (!request) { console.error(`supervisor: no request for ${id}`); process.exit(2); }
const me = self();
const outPath = join(dir, "output.log");
const note = (msg) => appendFileSync(outPath, `heavy-check: ${msg}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } };

let phase = "queued", bridgeFd = null, cancelRequested = false, unit = null;
process.on("SIGTERM", () => {
  if (phase === "queued") process.exit(0); // cancelled while queued; `cancel` already cleaned up
  cancelRequested = true;
  if (unit) systemctl("stop", `${unit}.scope`);
});
process.on("SIGINT", () => {}); process.on("SIGHUP", () => {});

/** Re-resolves every queued request with the current mode and machine, so a
 * mode switch or a vCPU change applies to tickets already waiting. */
function refreshRequests(state, T, mode) {
  for (const t of Object.values(state.tickets)) {
    if (t.state !== "queued") continue;
    const r = resolveRequest(t.opts, { T, M: cfg.poolMiB, mode });
    if (!r.error) t.req = r;
  }
}

// 1. Enqueue, or join a matching ticket that is already queued or running.
const ack = transaction(cfg, (state) => {
  const changed = reconcile(cfg, state);
  const match = Object.values(state.tickets).find((t) => t.key === request.key);
  if (match) return { changed, result: { joined: match.id } };
  state.seq += 1;
  state.tickets[id] = {
    id, seq: state.seq, key: request.key, worktree: request.worktree, cwd: request.cwd, argv: request.argv,
    opts: request.opts, req: request.req, state: "queued", submittedAt: request.submittedAt,
    queueTimeoutS: request.queueTimeoutS, supervisor: me,
  };
  return { changed: true, result: { ticket: id } };
});
writeJsonAtomic(join(dir, "ack.json"), ack);
if (ack.joined) process.exit(0);

// 2. Wait for admission: re-plan when the state file changes, or every 15 s.
let lastSeen = -1, lastTry = 0;
for (;;) {
  const m = mtime(cfg.paths.state);
  if (m !== lastSeen || Date.now() - lastTry >= 15000) {
    const out = tryAdmit();
    lastSeen = mtime(cfg.paths.state); lastTry = Date.now();
    if (out === "admitted") break;
    if (out === "gone") process.exit(0);
  }
  await sleep(1000);
}

function tryAdmit() {
  return transaction(cfg, (state) => {
    let changed = reconcile(cfg, state);
    const t = state.tickets[id];
    if (!t) return { changed, result: "gone" };
    const now = Date.now();
    if (now - t.submittedAt > t.queueTimeoutS * 1000) {
      delete state.tickets[id];
      const waited = Math.round((now - t.submittedAt) / 1000);
      writeJsonAtomic(join(dir, "exit.json"), { ticket: id, code: 75, label: `expired: not admitted within ${t.queueTimeoutS}s`, endedAt: now });
      ledger(cfg, { event: "expired", ticket: id, worktree: t.worktree, class: t.req.class, waitedS: waited });
      return { changed: true, result: "gone" };
    }
    const host = sampleHost(cfg, state);
    host.legacy = legacyLockInfo(cfg.legacyLock);
    const seen = new Set(state.legacySeen ?? []);
    const fresh = host.legacy.holders.filter((pid) => !seen.has(pid));
    if (fresh.length) {
      // A v1 acquisition: an exclusive holder of the old lock without a ticket.
      ledger(cfg, { event: "legacy-holder", pids: fresh, owner: readFileSafe(`${cfg.legacyLock}.owner`) });
      state.legacySeen = [...seen, ...fresh].slice(-50);
      changed = true;
    }
    const mode = readMode(cfg);
    refreshRequests(state, tokensFor(host.nproc), mode);
    const p = plan(state, now, host, cfg);
    const mine = p.admit.find((a) => a.id === id);
    if (!mine) return { changed, result: p.blocked[id] ?? "queued" };
    bridgeFd = flockFd(cfg.legacyLock, { shared: !t.req.exclusive });
    if (bridgeFd == null) return { changed, result: "legacy" };
    unit = `${cfg.unitPrefix}-${basename(t.worktree).replace(/[^A-Za-z0-9_.-]/g, "_")}-${id}`;
    Object.assign(t, { state: "running", admittedAt: now, express: mine.express, unit, mode, hostAtAdmit: { nproc: host.nproc, memAvailableMiB: host.memAvailableMiB } });
    writeJsonAtomic(join(dir, "grant.json"), { ticket: id, unit, class: t.req.class, gpu: t.req.gpu, exclusive: t.req.exclusive, tokens: t.req.tokens, memMiB: t.req.memMiB, express: mine.express });
    return { changed: true, result: "admitted" };
  });
}

// 3. Run in the job's scope.
phase = "running";
const state0 = JSON.parse(readFileSync(cfg.paths.state, "utf8"));
const t = state0.tickets[id];
const req = t.req;
const treeAtAdmit = gitTree(t.cwd);
const tree = request.tree;
note(`${id} admitted after ${fmt(t.admittedAt - t.submittedAt)} as ${req.class}${req.review ? " (review)" : ""}: ` +
  `${req.tokens} cpu, ${req.memMiB} MiB${req.gpu ? ", GPU" : ""}${t.express ? ", express slot" : ""}${req.serial ? ", serial mode" : ""}; deadline ${req.deadline}s`);
const changedTree = tree.head !== treeAtAdmit.head || tree.dirty !== treeAtAdmit.dirty;
if (changedTree) note(`warning: the worktree changed between submit and admission; this job tests ${short(treeAtAdmit)}, not ${short(tree)}`);

const marker = join(t.worktree, ".test-build", ".heavy-job");
const writesMarker = existsSync(join(t.worktree, "package.json"));
if (writesMarker) {
  mkdirSync(dirname(marker), { recursive: true });
  writeJsonAtomic(marker, { ticket: id, pid: me.pid, start: me.start });
}

if (cfg.manageSlice) ensureSlice(tokensFor(t.hostAtAdmit.nproc));

const out = openSync(outPath, "a");
const memBytes = req.memMiB * 1048576;
const args = [
  "--user", "--scope", "--quiet", "--collect", `--unit=${unit}`, `--slice=${cfg.slice}`,
  "-p", `MemoryMax=${req.memMiB}M`, "-p", `MemoryHigh=${Math.floor(req.memMiB * 0.9)}M`, "-p", "MemorySwapMax=0",
  "-p", `CPUWeight=${Math.min(10000, req.tokens * 100)}`, "-p", "TimeoutStopSec=10s",
  "sh", join(here, "scope-run.sh"), dir, String(req.deadline), String(memBytes), ...t.argv,
];
const context = req.exclusive ? { samples: 0, load1Max: 0, cpuSomeMax: 0, memFullMax: 0 } : null;
const sampler = context && setInterval(() => sampleContext(context), 15000);
if (context) sampleContext(context);
const started = Date.now();
const child = spawn("systemd-run", args, { cwd: t.cwd, env: { ...process.env, ...jobEnv(t, req, cfg) }, stdio: ["ignore", out, out] });
const [rawCode, signal] = await new Promise((done) => {
  child.on("exit", (code, sig) => done([code, sig]));
  child.on("error", (err) => { appendFileSync(outPath, `heavy-check: could not start systemd-run: ${err.message}\n`); done([70, null]); });
});
if (sampler) { clearInterval(sampler); sampleContext(context); }
closeSync(out);

// 4. Account, label, free.
const stats = Object.fromEntries((readFileSafe(join(dir, "stats")) ?? "").split("\n").filter(Boolean).map((l) => l.split("=")));
const leftovers = scopeActive(unit);
if (leftovers) systemctl("stop", `${unit}.scope`); // descendants that outlived the command
const ranS = (Date.now() - started) / 1000;
let code = rawCode ?? 128 + (signal === "SIGKILL" ? 9 : 15), label = null;
const oomKills = Number(stats.oom_kill ?? 0);
if (cancelRequested || existsSync(join(dir, "cancelled"))) { code = 75; label = "cancelled"; }
else if (existsSync(join(dir, "refused"))) label = "refused: scope limits not applied";
else if (oomKills > 0 && code !== 0) {
  code = 137;
  label = `oom: class ${req.class} reservation ${req.memMiB} MiB; rerun with --class exclusive or --mem <more> (up to the class maximum)`;
} else if ((code === 124 || code === 137) && ranS >= req.deadline - 1) { code = 124; label = `deadline ${req.deadline}s exceeded`; }
else if (code === 137 || signal) label = "killed";
if (oomKills > 0 && code === 0) note(`warning: ${oomKills} process(es) in the job were OOM-killed, but the command exited 0`);
if (context && (context.cpuSomeMax >= 10 || context.memFullMax >= 1)) context.disturbed = true;

const result = {
  ticket: id, code, label, class: req.class, review: req.review, tokens: req.tokens, memMiB: req.memMiB, gpu: req.gpu,
  express: t.express, exclusive: req.exclusive, mode: t.mode, worktree: t.worktree, cwd: t.cwd, argv: t.argv,
  submittedAt: t.submittedAt, admittedAt: t.admittedAt, endedAt: Date.now(), ranS: Math.round(ranS * 10) / 10,
  peakMiB: stats.peak ? Math.ceil(Number(stats.peak) / 1048576) : null,
  cpuS: stats.usage_usec ? Math.round(Number(stats.usage_usec) / 1e5) / 10 : null,
  oomKills, leftovers, head: tree.head, dirty: tree.dirty, headAtAdmit: treeAtAdmit.head, dirtyAtAdmit: treeAtAdmit.dirty,
  changedTree, context,
};
writeJsonAtomic(join(dir, "exit.json"), result);
transaction(cfg, (state) => {
  delete state.tickets[id];
  ledger(cfg, { event: "job", ...result });
  return { changed: true };
});
if (writesMarker && readJson(marker)?.ticket === id) rmSync(marker, { force: true });
if (bridgeFd != null) closeSync(bridgeFd);
process.exit(0);

function sampleContext(c) {
  const s = cpuContext();
  c.samples++;
  c.load1Max = Math.max(c.load1Max, s.load1);
  c.cpuSomeMax = Math.max(c.cpuSomeMax, s.cpuSomeAvg10);
  c.memFullMax = Math.max(c.memFullMax, s.memFullAvg10);
}

/** Keeps the slice's CPU quota and memory cap in step with the machine, so a
 * vCPU change needs no redeploy. Runtime properties only; the unit file
 * (install.sh --slice) makes the slice persistent. */
function ensureSlice(nproc) {
  const want = sliceLimits(nproc, cfg);
  const cg = readFileSync("/proc/self/cgroup", "utf8").trim().replace(/^0::/, "");
  const root = /^(.*\/user@\d+\.service)/.exec(cg)?.[1];
  if (!root) return;
  const sliceCg = `/sys/fs/cgroup${root}/${cfg.slice}`;
  const cpuMax = cgroupRead(sliceCg, "cpu.max"), memMax = cgroupRead(sliceCg, "memory.max");
  if (cpuMax === `${want.cpuQuotaPct * 1000} 100000` && memMax === String(want.memoryMaxMiB * 1048576)) return;
  spawnSync("systemctl", ["--user", "set-property", "--runtime", cfg.slice,
    `CPUQuota=${want.cpuQuotaPct}%`, `MemoryMax=${want.memoryMaxMiB}M`, "MemorySwapMax=0"], { stdio: "ignore" });
}

function fmt(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}
function short(tr) { return tr.head ? `${tr.head.slice(0, 10)}${tr.dirty === "clean" ? "" : `+${tr.dirty}`}` : "(not git)"; }
