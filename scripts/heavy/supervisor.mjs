#!/usr/bin/env node
// One heavy-check v2 ticket's detached supervisor:
//
//   node supervisor.mjs TICKET      (config comes from the SILTWAKE_SCHED_* env)
//
// Started by `submit` in its own session (and its own systemd scope, so the
// agent's tool call ending does not take it down). It enqueues the ticket,
// admits it when the plan says so, takes the legacy lock in shared mode and
// passes it into the job's scope (so the payload itself holds it for its whole
// life, even if this supervisor dies), runs the command in a capped scope
// in the heavy slice, records the result and the ledger line, and frees the
// reservation. If it dies, the next transaction stops its scope and frees it.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jobEnv, plan, resolveRequest, sliceLimits, tokensFor } from "./policy.mjs";
import {
  cgroupRead, cpuContext, flockFd, gitTree, jobDir, ledger, legacyLockInfo, loadConfig, readFileSafe, readJson,
  readMode, reconcile, sampleHost, scopePopulated, self, stopScope, systemctl, transaction, writeJsonAtomic,
} from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
const cfg = loadConfig();
const dir = jobDir(cfg, id);
const request = readJson(join(dir, "request.json"));
if (!request) { console.error(`supervisor: no request for ${id}`); process.exit(2); }
const me = self();
// Held for the ticket's whole life and inherited by the scope launcher, the
// in-scope wrapper and the payload: while any of them lives, reconcile keeps
// the reservation (state.mjs ticketHeld).
const aliveFd = flockFd(join(dir, "alive.lock"));
if (aliveFd == null) { console.error(`supervisor: ${id} already has a live owner`); process.exit(70); }
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
// A v1 job releasing the old lock changes no state file, so while blocked by
// it, re-check every 2 s.
let lastSeen = -1, lastTry = 0, every = 15000;
for (;;) {
  const m = mtime(cfg.paths.state);
  if (m !== lastSeen || Date.now() - lastTry >= every) {
    const out = tryAdmit();
    lastSeen = mtime(cfg.paths.state); lastTry = Date.now();
    if (out === "admitted") break;
    if (out === "gone") process.exit(0);
    every = out === "legacy" ? 2000 : 15000;
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
    // Always shared, exclusive jobs included: shared already shuts v1 out, the
    // plan keeps an exclusive job alone, and an exclusive (WRITE) holder of the
    // old lock then always means a v1 caller, which the ledger records.
    bridgeFd = flockFd(cfg.legacyLock, { shared: true });
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
  // No MemoryHigh: with no swap, a job past memory.high is throttled, not
  // killed, and crawls to its deadline holding its reservation (measured in
  // SCHED-1). At MemoryMax the kernel still reclaims page cache before it
  // OOM-kills, so the job gets an explicit OOM instead.
  "-p", `MemoryMax=${req.memMiB}M`, "-p", "MemoryHigh=infinity", "-p", "MemorySwapMax=0",
  "-p", `CPUWeight=${Math.min(10000, req.tokens * 100)}`, "-p", "TimeoutStopSec=10s", "-p", "Delegate=yes",
  "sh", join(here, "scope-run.sh"), dir, String(req.deadline), String(memBytes), ...t.argv,
];
const context = req.exclusive ? { samples: 0, load1Max: 0, cpuSomeMax: 0, memFullMax: 0 } : null;
const sampler = context && setInterval(() => sampleContext(context), 15000);
if (context) sampleContext(context);
const started = Date.now();
// fd 3: the legacy bridge (shared); fd 4: the ticket's alive lock. Both stay
// open in the wrapper and the payload, so v1 stays out and the reservation
// stays held for as long as the payload runs, whatever happens to this process.
// A cancel that landed before launch is honoured here and, under the launch
// gate, again inside the scope before the command starts (scope-run.sh).
const cancelledEarly = existsSync(join(dir, "cancelled"));
if (cancelledEarly) writeFileSync(join(dir, "not-started"), "");
const child = cancelledEarly ? null
  : spawn("systemd-run", args, { cwd: t.cwd, env: { ...process.env, ...jobEnv(t, req, cfg) }, stdio: ["ignore", out, out, bridgeFd, aliveFd] });
const [rawCode, signal] = !child ? [75, null] : await new Promise((done) => {
  child.on("exit", (code, sig) => done([code, sig]));
  child.on("error", (err) => { appendFileSync(outPath, `heavy-check: could not start systemd-run: ${err.message}\n`); done([70, null]); });
});
if (sampler) { clearInterval(sampler); sampleContext(context); }
closeSync(out);

// 4. Account, label, free.
const stats = Object.fromEntries((readFileSafe(join(dir, "stats")) ?? "").split("\n").filter(Boolean).map((l) => l.split("=")));
// Descendants that outlived the command: stop the scope and keep the
// reservation until its cgroup is conclusively empty (a stopping scope is not).
const leftovers = scopePopulated(unit);
for (let tries = 0; !stopScope(unit, { waitS: 30 }); tries++)
  if (tries === 0) note(`${unit} still has processes after stopping; keeping the reservation until it is empty`);
const ranS = (Date.now() - started) / 1000;
let code = rawCode ?? 128 + (signal === "SIGKILL" ? 9 : 15), label = null;
// oom_kill counts kills anywhere in the scope, including a sub-limit such as a
// heavy test file's own budget cgroup; only an OOM at the scope's own limit
// (memory.events.local) means the job outgrew its reservation.
const oomKills = Number(stats.oom_kill ?? 0), reservationOom = Number(stats.oom_local ?? 0) > 0;
if (existsSync(join(dir, "not-started"))) { code = 75; label = "cancelled before start; the command did not run"; }
else if (cancelRequested || existsSync(join(dir, "cancelled"))) { code = 75; label = "cancelled"; }
else if (existsSync(join(dir, "refused"))) label = "refused: scope limits not applied";
else if (reservationOom && code !== 0) {
  code = 137;
  label = `oom: class ${req.class} reservation ${req.memMiB} MiB; rerun with --class exclusive or --mem <more> (up to the class maximum)`;
} else if ((code === 124 || code === 137) && ranS >= req.deadline - 1) { code = 124; label = `deadline ${req.deadline}s exceeded`; }
else if (code === 137 || signal) label = "killed";
if (oomKills > 0 && !label) note(`${oomKills} process(es) were OOM-killed inside the job by a sub-limit (for example a heavy test file's budget), not by its ${req.memMiB} MiB reservation`);
if (context && (context.cpuSomeMax >= 10 || context.memFullMax >= 1)) context.disturbed = true;

const result = {
  ticket: id, code, label, class: req.class, review: req.review, tokens: req.tokens, memMiB: req.memMiB, gpu: req.gpu,
  express: t.express, exclusive: req.exclusive, mode: t.mode, worktree: t.worktree, cwd: t.cwd, argv: t.argv,
  submittedAt: t.submittedAt, admittedAt: t.admittedAt, endedAt: Date.now(), ranS: Math.round(ranS * 10) / 10,
  peakMiB: stats.peak ? Math.ceil(Number(stats.peak) / 1048576) : null,
  cpuS: stats.usage_usec ? Math.round(Number(stats.usage_usec) / 1e5) / 10 : null,
  oomKills, reservationOom, leftovers, head: tree.head, dirty: tree.dirty, headAtAdmit: treeAtAdmit.head, dirtyAtAdmit: treeAtAdmit.dirty,
  changedTree, context,
};
// The scope is empty: release the worktree's .test-build before anyone can see the result.
if (writesMarker && readJson(marker)?.ticket === id) rmSync(marker, { force: true });
writeJsonAtomic(join(dir, "exit.json"), result);
transaction(cfg, (state) => {
  delete state.tickets[id];
  ledger(cfg, { event: "job", ...result });
  return { changed: true };
});
if (bridgeFd != null) closeSync(bridgeFd);
closeSync(aliveFd);
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
