#!/usr/bin/env node
// One admitted heavy-check v2 ticket's holder:
//
//   node holder.mjs TICKET      (fd 3: the legacy bridge lock, shared, inherited
//                                from the supervisor's admission)
//
// The supervisor starts it in its own systemd scope (<supervisorPrefix>-hold-<ticket>)
// right after admission and exits. The holder owns the job's whole lifetime,
// independently of the supervisor and of whatever file descriptors the job's
// processes keep or close:
// - it claims the ticket under the state lock before launching (a ticket that
//   recovery already finished is never launched);
// - it holds the v1 bridge (fd 3) for as long as it lives, and passes no lock
//   to the job;
// - it launches the job scope with BindsTo= its own scope, so if the holder is
//   killed, systemd stops the job too;
// - when the foreground command completes, or at the whole-job deadline, it
//   stops the job scope, then waits until the job's cgroup reports
//   `populated 0` (or the unit is gone), failing closed on query errors;
// - only then does it release the worktree marker, write the result and free
//   the reservation, and exit, which releases the bridge.
// Liveness for recovery is cgroup-based: while this scope or the job scope
// holds processes, the ticket is alive (state.mjs reconcile).
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jobEnv, sliceLimits, tokensFor } from "./policy.mjs";
import {
  cgroupRead, cpuContext, gitTree, jobDir, ledger, loadConfig, readFileSafe, readJson, scopePopulated, self, systemctl,
  transaction, writeJsonAtomic,
} from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
const cfg = loadConfig();
const dir = jobDir(cfg, id);
const request = readJson(join(dir, "request.json"));
const outPath = join(dir, "output.log");
const note = (msg) => appendFileSync(outPath, `heavy-check: ${msg}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Claim. Recovery and this claim are serialized by the state lock.
const me = self();
const t = transaction(cfg, (state) => {
  const ticket = state.tickets[id];
  if (!ticket || ticket.state !== "running" || ticket.holder) return { result: null };
  ticket.holder = me;
  return { changed: true, result: structuredClone(ticket) };
});
if (!t || !request) process.exit(0);

let stopping = null; // why the job scope is being stopped, once it is
const unit = t.unit, holderUnit = t.holderUnit;
const stopJob = (why) => {
  if (!stopping) stopping = why;
  systemctl("stop", "--no-block", `${unit}.scope`);
};
// Stopping this holder (or its scope) stops the job, and the holder still waits
// for the job's cgroup to empty before it releases anything.
process.on("SIGTERM", () => stopJob("holder stopped"));
process.on("SIGINT", () => {}); process.on("SIGHUP", () => {});

const req = t.req;
const treeAtAdmit = gitTree(t.cwd);
const tree = request.tree;
note(`${id} admitted after ${fmt(t.admittedAt - t.submittedAt)} as ${req.class}${req.review ? " (review)" : ""}: ` +
  `${req.tokens} cpu, ${req.memMiB} MiB${req.gpu ? ", GPU" : ""}${t.express ? ", express slot" : ""}${req.serial ? ", serial mode" : ""}; deadline ${req.deadline}s`);
const changedTree = tree.head !== treeAtAdmit.head || tree.dirty !== treeAtAdmit.dirty;
if (changedTree) note(`warning: the worktree changed between submit and admission; this job tests ${short(treeAtAdmit)}, not ${short(tree)}`);

// The marker names the units whose cgroups decide whether the job is alive
// (build-guard.mjs), not a process ID.
const marker = join(t.worktree, ".test-build", ".heavy-job");
const writesMarker = existsSync(join(t.worktree, "package.json"));
if (writesMarker) {
  mkdirSync(dirname(marker), { recursive: true });
  writeJsonAtomic(marker, { ticket: id, units: [holderUnit, unit] });
}

if (cfg.manageSlice) ensureSlice(tokensFor(t.hostAtAdmit.nproc));

// 2. Launch. No lock is passed to the job: its lifetime is its cgroup.
const out = openSync(outPath, "a");
const memBytes = req.memMiB * 1048576;
const inOwnScope = readFileSync("/proc/self/cgroup", "utf8").includes(`/${holderUnit}.scope`);
const args = [
  "--user", "--scope", "--quiet", "--collect", `--unit=${unit}`, `--slice=${cfg.slice}`,
  // No MemoryHigh: with no swap, a job past memory.high is throttled, not
  // killed, and crawls to its deadline holding its reservation (measured in
  // SCHED-1). At MemoryMax the kernel still reclaims page cache before it
  // OOM-kills, so the job gets an explicit OOM instead.
  "-p", `MemoryMax=${req.memMiB}M`, "-p", "MemoryHigh=infinity", "-p", "MemorySwapMax=0",
  "-p", `CPUWeight=${Math.min(10000, req.tokens * 100)}`, "-p", "TimeoutStopSec=10s", "-p", "Delegate=yes",
  ...(inOwnScope ? ["-p", `BindsTo=${holderUnit}.scope`, "-p", `After=${holderUnit}.scope`] : []),
  "sh", join(here, "scope-run.sh"), dir, String(req.deadline), String(memBytes), ...t.argv,
];
const context = req.exclusive ? { samples: 0, load1Max: 0, cpuSomeMax: 0, memFullMax: 0 } : null;
const sampler = context && setInterval(() => sampleContext(context), 15000);
if (context) sampleContext(context);
const started = Date.now();
// Whole-job deadline: the in-scope `timeout` ends the foreground at the
// deadline (plus 10 s to kill); this backstop stops everything in the scope if
// the foreground has not ended a few seconds after that.
const backstop = setTimeout(() => stopJob(`deadline ${req.deadline}s exceeded`), (req.deadline + 15) * 1000);
// A cancel that landed before launch is honoured here and, under the launch
// gate, again inside the scope before the command starts (scope-run.sh).
const cancelledEarly = existsSync(join(dir, "cancelled"));
if (cancelledEarly) writeFileSync(join(dir, "not-started"), "");
const child = cancelledEarly ? null
  : spawn("systemd-run", args, { cwd: t.cwd, env: { ...process.env, ...jobEnv(t, req, cfg) }, stdio: ["ignore", out, out] });
const [rawCode, signal] = !child ? [75, null] : await new Promise((done) => {
  child.on("exit", (code, sig) => done([code, sig]));
  child.on("error", (err) => { appendFileSync(outPath, `heavy-check: could not start systemd-run: ${err.message}\n`); done([70, null]); });
});
closeSync(out);

// 3. The foreground has ended: anything left in the scope is stopped, and the
// reservation, marker and bridge are kept until the cgroup is conclusively
// empty (scopePopulated fails closed). The backstop stays armed meanwhile.
const leftovers = child ? scopePopulated(unit) : false;
if (leftovers) stopJob("leftovers");
for (let i = 1; scopePopulated(unit); i++) {
  if (i === 150) note(`${unit} still has processes 30 s after stopping; keeping the reservation until it is empty`);
  if (i % 50 === 0) stopJob(stopping ?? "leftovers");
  await sleep(200);
}
clearTimeout(backstop);
if (sampler) { clearInterval(sampler); sampleContext(context); }

// 4. Account, label, free.
const stats = Object.fromEntries((readFileSafe(join(dir, "stats")) ?? "").split("\n").filter(Boolean).map((l) => l.split("=")));
const ranS = (Date.now() - started) / 1000;
let code = rawCode ?? 128 + (signal === "SIGKILL" ? 9 : 15), label = null;
// oom_kill counts kills anywhere in the scope, including a sub-limit such as a
// heavy test file's own budget cgroup; only an OOM at the scope's own limit
// (memory.events.local) means the job outgrew its reservation.
const oomKills = Number(stats.oom_kill ?? 0), reservationOom = Number(stats.oom_local ?? 0) > 0;
if (existsSync(join(dir, "not-started"))) { code = 75; label = "cancelled before start; the command did not run"; }
else if (existsSync(join(dir, "cancelled"))) { code = 75; label = "cancelled"; }
else if (existsSync(join(dir, "refused"))) label = "refused: scope limits not applied";
else if (reservationOom && code !== 0) {
  code = 137;
  label = `oom: class ${req.class} reservation ${req.memMiB} MiB; rerun with --class exclusive or --mem <more> (up to the class maximum)`;
} else if (stopping?.startsWith("deadline") || ((code === 124 || code === 137) && ranS >= req.deadline - 1)) { code = 124; label = `deadline ${req.deadline}s exceeded`; }
else if (stopping === "holder stopped") { code = 137; label = "killed: holder stopped"; }
else if (code === 137 || signal) label = "killed";
if (oomKills > 0 && !label) note(`${oomKills} process(es) were OOM-killed inside the job by a sub-limit (for example a heavy test file's budget), not by its ${req.memMiB} MiB reservation`);
if (leftovers) note("processes left behind by the command were stopped");
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
// Result, ledger and release in one transaction. If this process dies before
// it, reconcile finishes the ticket from the wrapper's stats.
transaction(cfg, (state) => {
  writeJsonAtomic(join(dir, "exit.json"), result);
  delete state.tickets[id];
  ledger(cfg, { event: "job", ...result });
  return { changed: true };
});
process.exit(0); // releases the bridge (fd 3)

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
