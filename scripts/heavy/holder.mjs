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
// - it holds the v1 bridge (fd 3) for as long as it lives, and passes it to the
//   job's launcher, whose in-scope wrapper hands it to the scope's anchor
//   (anchor.sh) before the command starts. The anchor ignores TERM and dies
//   only with the scope's last processes, so v1 stays out until the job's
//   cgroup is gone even if this holder is SIGKILLed. The command never holds it;
// - it launches the job scope with BindsTo= its own scope, so if the holder is
//   killed, systemd stops the job too;
// - a job has a goal, not a time limit (SCHED-2): it runs until its command
//   ends. The holder stops it only when it stalls (no output and no heartbeat
//   for the stall window), at a deadline the caller chose, at the class's
//   runaway ceiling, or, for a soak, when it must yield;
// - when the foreground command completes, or at one of those stops, it
//   stops the job scope, retrying failed stops with backoff, then waits until
//   the job's cgroup reports `populated 0` (or the unit is gone), failing
//   closed on query errors;
// - only then does it release the worktree marker, write the result and free
//   the reservation, and exit, which releases the bridge.
// Liveness for recovery is cgroup-based: while this scope or the job scope
// holds processes, the ticket is alive (state.mjs reconcile).
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jobEnv, plan, sliceLimits } from "./policy.mjs";
import { dropSnapshot } from "./snapshot.mjs";
import {
  cgroupRead, cpuContext, gitTree, gpuUsers, hostFor, jobDir, jobProcs, ledger, loadConfig, readFileSafe, readJson, readState, readStats,
  releaseAnchorIfAlone, scopePopulated, self, systemctl, transaction, unitFacts, writeJsonAtomic,
} from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
const cfg = loadConfig();
const dir = jobDir(cfg, id);
const request = readJson(join(dir, "request.json"));
const outPath = join(dir, "output.log");
// The holder's own lines in the job log are not the job's output, so they never
// reset the stall window.
let ownBytes = 0;
const note = (msg) => { const line = `heavy-check: ${msg}\n`; appendFileSync(outPath, line); ownBytes += Buffer.byteLength(line); };
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
let child = null, launched = false, foregroundDone = false;
const unit = t.unit, holderUnit = t.holderUnit;
/** Stops the job and keeps at it until its cgroup is empty: a failed or
 * ineffective stop is retried with backoff, whether or not the foreground has
 * ended, and a launcher that has not registered the scope yet is killed. */
const stopJob = (why) => {
  if (stopping) return;
  stopping = why;
  (async () => {
    let delay = 500, reported = false;
    while (!foregroundDone || scopePopulated(unit)) {
      if (releaseAnchorIfAlone(cfg, id)) { await sleep(200); continue; }
      if (!scopePopulated(unit) && child && !foregroundDone) { child.kill("SIGKILL"); await sleep(200); continue; } // not yet registered
      const r = systemctl("stop", "--no-block", `${unit}.scope`);
      if (r.status === 0) { delay = 500; await sleep(1000); continue; }
      if (!reported) { note(`stopping ${unit} failed (${(r.stderr ?? "").trim() || `exit ${r.status}`}); retrying until it is empty`); reported = true; }
      await sleep(delay);
      delay = Math.min(delay * 2, 10000);
    }
  })();
};
// Stopping this holder (or its scope) stops the job, and the holder still waits
// for the job's cgroup to empty before it releases anything.
process.on("SIGTERM", () => stopJob("holder stopped"));
process.on("SIGINT", () => {}); process.on("SIGHUP", () => {});

const req = t.req;
// SCHED-1 tickets carry no goal: their deadline is a hard limit, as before.
const goal = t.goal ?? { v: 1, limitS: req.deadline, explicitDeadline: true, ceilingS: req.deadline, stallS: null, soak: false, snapshot: false };
const tree = request.tree, snap = request.snapshot ?? null;
const runCwd = snap ? snap.cwd : t.cwd;
const treeAtAdmit = gitTree(runCwd);
note(`${id} admitted after ${fmt(t.admittedAt - t.submittedAt)} as ${req.class}${req.review ? " (review)" : ""}: ` +
  `${req.tokens} cpu, ${req.memMiB} MiB${req.gpu ? ", GPU" : ""}${t.express ? ", express slot" : ""}${req.serial ? ", serial mode" : ""}; ` +
  (goal.v === 1 ? `deadline ${req.deadline}s` : `runs to its end; stops if silent for ${fmt(goal.stallS * 1000)} (or touch $SILTWAKE_JOB_HEARTBEAT), ` +
    (goal.explicitDeadline ? `at its ${fmt(goal.limitS * 1000)} deadline` : `at the ${fmt(goal.limitS * 1000)} ${req.exclusive ? "exclusive cap" : "runaway ceiling"}`)) +
  (snap ? `; on a snapshot of the tree as submitted (${snap.root})` : ""));
// Evidence is bound to the tree that was submitted (SCHED-2, TST-19): a
// worktree that changed while the ticket waited is rejected, never silently
// tested in its new state. A snapshot is the submitted tree by construction;
// it is checked anyway.
const changedTree = tree.head !== treeAtAdmit.head || tree.dirty !== treeAtAdmit.dirty;
const rejected = !changedTree ? null : snap
  ? `rejected: the snapshot ${snap.root} no longer matches the submitted tree (${short(tree)}, now ${short(treeAtAdmit)}); the command did not run`
  : `rejected: the worktree changed between submit and admission (submitted ${short(tree)}, now ${short(treeAtAdmit)}); ` +
    "the command did not run. Commit and resubmit, or submit with --snapshot to test the tree as submitted while you keep editing";
if (rejected) note(rejected);

// The marker names the units whose cgroups decide whether the job is alive
// (build-guard.mjs), not a process ID. A snapshot job uses its own copy's
// .test-build, so the worktree's stays free.
const marker = join(t.worktree, ".test-build", ".heavy-job");
const writesMarker = !snap && !rejected && existsSync(join(t.worktree, "package.json"));
if (writesMarker) {
  mkdirSync(dirname(marker), { recursive: true });
  writeJsonAtomic(marker, { ticket: id, units: [holderUnit, unit] });
}

if (cfg.manageSlice) ensureSlice(t.hostAtAdmit.nproc);

// 2. Launch. No lock is passed to the job: its lifetime is its cgroup.
const out = openSync(outPath, "a");
const memBytes = req.memMiB * 1048576;
const inOwnScope = readFileSync("/proc/self/cgroup", "utf8").includes(`/${holderUnit}.scope`);
const args = [
  // Not --collect: a failed scope stays loaded until unitFacts() has read its
  // accounting and cleared it.
  "--user", "--scope", "--quiet", `--unit=${unit}`, `--slice=${cfg.slice}`,
  // No MemoryHigh: with no swap, a job past memory.high is throttled, not
  // killed, and crawls to its deadline holding its reservation (measured in
  // SCHED-1). At MemoryMax the kernel still reclaims page cache before it
  // OOM-kills, so the job gets an explicit OOM instead.
  "-p", `MemoryMax=${req.memMiB}M`, "-p", "MemoryHigh=infinity", "-p", "MemorySwapMax=0",
  // A soak takes only idle CPU (cgroup cpu.idle): it never slows a pool job.
  "-p", `CPUWeight=${goal.soak ? "idle" : Math.min(10000, req.tokens * 100)}`, "-p", "TimeoutStopSec=10s", "-p", "Delegate=yes",
  // The OOM group is scope-run.sh's "job" child cgroup, not OOMPolicy=kill:
  // systemd would stop the whole scope on a per-file OOM in a delegated child.
  "-p", "OOMPolicy=continue",
  ...(inOwnScope ? ["-p", `BindsTo=${holderUnit}.scope`, "-p", `After=${holderUnit}.scope`] : []),
  "sh", join(here, "scope-run.sh"), dir, String(goal.limitS), String(memBytes), ...t.argv,
];
const context = req.exclusive ? { samples: 0, load1Max: 0, cpuSomeMax: 0, memFullMax: 0 } : null;
// GPU jobs record any GPU client outside the lease that shared the GPU with
// them (a driver run outside the queue): their screenshots stay functional,
// but an exclusive measurement is then disturbed.
const gpuShared = new Map();
const sampler = (context || req.gpu) && setInterval(() => sample(), 15000);
sample();
const started = Date.now();
// Hard limit: the in-scope `timeout` ends the foreground at the deadline or
// ceiling (plus 10 s to kill); this backstop stops everything in the scope if
// the foreground has not ended a few seconds after that.
const limitWhy = goal.v === 1 || goal.explicitDeadline ? "deadline" : "ceiling";
const backstop = setTimeout(() => stopJob(limitWhy), (goal.limitS + 15) * 1000);
// A cancel that landed before launch is honoured here and, under the launch
// gate, again inside the scope before the command starts (scope-run.sh). A
// rejected ticket never launches.
const cancelledEarly = existsSync(join(dir, "cancelled"));
if (cancelledEarly) writeFileSync(join(dir, "not-started"), "");
const heartbeat = join(dir, "heartbeat"), yieldFile = join(dir, "yield");
const env = { ...process.env, ...jobEnv(t, req, cfg), SILTWAKE_JOB_HEARTBEAT: heartbeat, ...(goal.soak ? { SILTWAKE_JOB_YIELD: yieldFile } : {}) };
// fd 3: the bridge, for the scope's anchor (scope-run.sh closes it for the command).
child = cancelledEarly || rejected ? null
  : spawn("systemd-run", args, { cwd: runCwd, env, stdio: ["ignore", out, out, 3] });
launched = Boolean(child);
// Reservation OOMs, seen from outside the job's memory domain. The OOM group
// kill also takes the in-scope wrapper, which then records nothing, so the
// scope's memory.events.local is watched here and what it shows is kept in the
// job directory (recovery reads it too).
const oomSeen = { local: 0, peak: null };
const watchOom = async () => {
  let cg = null;
  for (let i = 0; i < 100 && launched && !foregroundDone && !(cg = readFileSafe(join(dir, "cgroup"))); i++) await sleep(50);
  if (!cg) return;
  const look = () => {
    const local = Number(/^oom (\d+)/m.exec(cgroupRead(cg, "memory.events.local") ?? "")?.[1] ?? 0);
    const peak = Number(cgroupRead(cg, "memory.peak"));
    if (Number.isFinite(peak) && peak > 0) oomSeen.peak = peak;
    if (local > oomSeen.local) { oomSeen.local = local; writeFileSync(join(dir, "oom-local"), `${local} ${oomSeen.peak ?? ""}\n`); }
  };
  look();
  try { watch(join(cg, "memory.events.local"), look).on("error", () => {}); } catch { /* no inotify: the exit-time inference below */ }
};
if (child) watchOom();

// Stall detection: the job's output (the log, less the holder's own lines) or
// its heartbeat file must move within the stall window. Before stopping a
// stalled job, the holder writes what its processes were doing and how much
// CPU they used while silent (a hang and a silent busy loop look different).
let lastOut = -1, lastActivity = Date.now(), stalledS = null;
const cpuMarks = [];
const scopeCpuUs = () => Number(/usage_usec (\d+)/.exec(cgroupRead(readFileSafe(join(dir, "cgroup")) ?? "/nonexistent", "cpu.stat") ?? "")?.[1] ?? NaN);
const stallWatch = child && goal.stallS && setInterval(() => {
  if (stopping || foregroundDone) return;
  const now = Date.now(), size = fileSize(outPath) - ownBytes, beat = mtimeMs(heartbeat);
  if (size !== lastOut) { lastOut = size; lastActivity = now; }
  const active = Math.max(lastActivity, beat);
  cpuMarks.push([now, scopeCpuUs()]);
  while (cpuMarks.length > 2 && cpuMarks[1][0] <= active) cpuMarks.shift();
  if (now - active < goal.stallS * 1000) return;
  stalledS = Math.round((now - active) / 1000);
  const cpuS = (cpuMarks.at(-1)[1] - cpuMarks[0][1]) / 1e6;
  note(`stalled: no output${goal.v === 2 ? " and no heartbeat" : ""} for ${fmt(stalledS * 1000)} (window ${fmt(goal.stallS * 1000)}); ` +
    `CPU used meanwhile ${Number.isFinite(cpuS) ? `${cpuS.toFixed(1)} s` : "unknown"}. Its processes:`);
  for (const line of procLines()) note(`  ${line}`);
  stopJob("stalled");
}, Math.min(15000, goal.stallS * 250));

// A soak yields: when its memory or GPU is what keeps a waiting job out (the
// plan's `preempt`), it gets a notice ($SILTWAKE_JOB_YIELD appears) and is
// stopped soakYieldS later unless the need goes away or it finishes first.
let yieldAt = null, yieldedTo = null;
const soakWatch = child && goal.soak && setInterval(() => {
  if (stopping || foregroundDone) return;
  const p = transaction(cfg, (state) => ({ result: plan(state, Date.now(), hostFor(cfg, state), cfg) }));
  const needed = p.preempt.includes(id);
  if (needed && yieldAt == null) {
    yieldAt = Date.now();
    yieldedTo = p.order.find((q) => p.blocked[q] && p.blocked[q] !== "leftover") ?? null;
    writeFileSync(yieldFile, `${yieldedTo ?? "waiting work"}\n`);
    note(`yield notice: waiting work needs this soak's ${req.gpu ? "GPU or " : ""}memory; it is stopped in ${fmt(cfg.soakYieldS * 1000)} unless it finishes first ($SILTWAKE_JOB_YIELD)`);
    ledger(cfg, { event: "soak-yield", ticket: id, for: yieldedTo });
  } else if (!needed && yieldAt != null) {
    yieldAt = null; rmSync(yieldFile, { force: true });
    note("yield notice withdrawn: nothing is waiting for this soak's resources now");
  } else if (needed && Date.now() - yieldAt >= cfg.soakYieldS * 1000) stopJob("preempted");
}, Math.min(15000, cfg.soakYieldS * 250));

const [rawCode, signal] = !child ? [rejected ? 3 : 75, null] : await new Promise((done) => {
  child.on("exit", (code, sig) => done([code, sig]));
  child.on("error", (err) => { appendFileSync(outPath, `heavy-check: could not start systemd-run: ${err.message}\n`); done([70, null]); });
});
foregroundDone = true;
const stoppingAtExit = stopping; // a stop of ours that preceded the foreground's end
closeSync(out);

// 3. The foreground has ended: anything left in the scope is stopped, and the
// reservation, marker and bridge are kept until the cgroup is conclusively
// empty (scopePopulated fails closed). The backstop stays armed meanwhile.
// Only the anchor left: let it go. Anything else: stop the scope.
const leftovers = launched && scopePopulated(unit) && !releaseAnchorIfAlone(cfg, id);
if (leftovers) stopJob("leftovers");
for (let i = 1; scopePopulated(unit); i++) {
  if (i % 25 === 0 && !releaseAnchorIfAlone(cfg, id)) stopJob("leftovers");
  if (i === 150) note(`${unit} still has processes 30 s after stopping; keeping the reservation until it is empty`);
  await sleep(200);
}
clearTimeout(backstop);
for (const timer of [stallWatch, soakWatch]) if (timer) clearInterval(timer);
if (sampler) clearInterval(sampler);
sample();

// 4. Account, label, free.
const stats = readStats(dir);
const facts = launched ? unitFacts(unit) : {};
const ranS = (Date.now() - started) / 1000;
let code = rawCode ?? 128 + (signal === "SIGKILL" ? 9 : 15), label = null, stopReason = null;
// oom_kill counts kills anywhere in the scope, including a sub-limit such as a
// heavy test file's own budget cgroup; only an OOM at the scope's own limit
// means the job outgrew its reservation. The wrapper records that
// (memory.events.local): since SCHED-2 it sits outside the job's OOM group and
// survives the group kill. Should it die anyway, the holder's watch saw it,
// or, failing that, the wrapper was SIGKILLed with no stop of ours, which
// nothing but an OOM does. Counters nobody read are null, with the reason.
const wrapperOom = Number(stats.oom_local ?? 0) > 0;
const groupOom = stats.rc == null && signal === "SIGKILL" && !stoppingAtExit;
const oomKills = stats.oom_kill != null ? Number(stats.oom_kill) : null, reservationOom = wrapperOom || groupOom;
const oomEvidence = wrapperOom ? "memory.events.local (wrapper)"
  : !groupOom ? null : oomSeen.local > 0 ? "memory.events.local (holder watch); the wrapper was killed too" : "inferred: the wrapper was SIGKILLed, not by a stop";
const unavailable = launched && stats.rc == null && !existsSync(join(dir, "not-started")) ? { oomKills: "the in-scope wrapper recorded no stats", ...(groupOom || oomSeen.local ? {} : { reservationOom: "no wrapper stats" }) } : undefined;
const limitLabel = () => (limitWhy === "deadline" ? `deadline ${goal.limitS}s exceeded` : `runaway ceiling: ran ${fmt(goal.limitS * 1000)}, the ${req.class} class's ${req.exclusive ? "cap" : "ceiling"}`);
if (rejected) { label = rejected; stopReason = "rejected"; }
else if (existsSync(join(dir, "not-started"))) { code = 75; label = "cancelled before start; the command did not run"; }
else if (existsSync(join(dir, "cancelled"))) { code = 75; label = "cancelled"; stopReason = "cancelled"; }
else if (existsSync(join(dir, "refused"))) label = "refused: scope limits not applied";
else if (reservationOom && code !== 0) {
  code = 137; stopReason = "oom";
  label = `oom: class ${req.class} reservation ${req.memMiB} MiB; rerun with --class exclusive or --mem <more> (up to the class maximum)`;
} else if (stopping === "stalled") { code = 123; stopReason = "stalled"; label = `stalled: no output for ${fmt(stalledS * 1000)}`; }
else if (stopping === "preempted") { code = 75; stopReason = "preempted"; label = `preempted: the soak yielded to ${yieldedTo ?? "waiting work"} after a ${fmt(cfg.soakYieldS * 1000)} notice`; }
else if (stopping === limitWhy || ((code === 124 || code === 137) && ranS >= goal.limitS - 1)) { code = 124; stopReason = limitWhy; label = limitLabel(); }
else if (stopping === "holder stopped") { code = 137; stopReason = "killed"; label = "killed: holder stopped"; }
else if (code === 137 || signal) { stopReason = "killed"; label = "killed"; }
if (oomKills > 0 && !reservationOom) note(`${oomKills} process(es) were OOM-killed inside the job by a sub-limit (for example a heavy test file's budget), not by its ${req.memMiB} MiB reservation`);
if (leftovers) note("processes left behind by the command were stopped");
if (gpuShared.size) note(`the GPU was also used outside the lease by: ${[...gpuShared.values()].map((u) => `pid ${u.pid} (${u.cmd.slice(0, 60)})`).join("; ")}`);
if (context && (context.cpuSomeMax >= 10 || context.memFullMax >= 1 || gpuShared.size)) context.disturbed = true;

// Evidence binding: a result is evidence for a commit only if the tree was
// that clean commit when admitted and stayed so (a snapshot always does).
const treeAtEnd = snap || rejected ? null : gitTree(t.cwd);
const changedDuringRun = Boolean(treeAtEnd) && (treeAtEnd.head !== treeAtAdmit.head || treeAtEnd.tracked !== treeAtAdmit.tracked);
if (changedDuringRun) note(`warning: the worktree changed while the job ran (${short(treeAtAdmit)} → ${short(treeAtEnd)}); this result is not evidence for ${treeAtAdmit.head?.slice(0, 10)}`);
const evidence = rejected ? null : {
  commit: treeAtAdmit.head,
  bound: Boolean(treeAtAdmit.head) && treeAtAdmit.dirty === "clean" && !changedDuringRun,
  why: !treeAtAdmit.head ? "not a git tree" : treeAtAdmit.dirty !== "clean" ? "uncommitted changes" : changedDuringRun ? "the worktree changed while it ran" : null,
  snapshot: Boolean(snap),
};
const keptSnapshot = snap ? dropSnapshot(snap.root, snap.status) : null;
if (keptSnapshot) note(`the job wrote files into its snapshot; kept at ${keptSnapshot}`);

const result = {
  ticket: id, code, label, class: req.class, review: req.review, tokens: req.tokens, memMiB: req.memMiB, gpu: req.gpu,
  express: t.express, exclusive: req.exclusive, mode: t.mode, worktree: t.worktree, cwd: t.cwd, argv: t.argv,
  submittedAt: t.submittedAt, admittedAt: t.admittedAt, endedAt: Date.now(), ranS: Math.round(ranS * 10) / 10,
  peakMiB: stats.peak ? Math.ceil(Number(stats.peak) / 1048576) : oomSeen.peak ? Math.ceil(oomSeen.peak / 1048576)
    : facts.memoryPeak != null ? Math.ceil(facts.memoryPeak / 1048576) : null,
  cpuS: stats.usage_usec ? Math.round(Number(stats.usage_usec) / 1e5) / 10 : facts.cpuNs != null ? Math.round(facts.cpuNs / 1e8) / 10 : null,
  oomKills, reservationOom, oomGroupKill: groupOom, oomEvidence, unavailable, leftovers, stopReason, goal,
  head: tree.head, dirty: tree.dirty, headAtAdmit: treeAtAdmit.head, dirtyAtAdmit: treeAtAdmit.dirty,
  changedTree, changedDuringRun, evidence, snapshot: snap ? { root: snap.root, kept: Boolean(keptSnapshot) } : null,
  gpuShared: gpuShared.size ? [...gpuShared.values()] : undefined, context,
};
// The scope is empty: release the worktree's .test-build before anyone can see the result.
if (writesMarker && readJson(marker)?.ticket === id) rmSync(marker, { force: true });
// Result, ledger and release in one transaction. If this process dies before
// it, reconcile finishes the ticket from the wrapper's stats.
transaction(cfg, (state) => {
  writeJsonAtomic(join(dir, "exit.json"), result);
  delete state.tickets[id];
  if (req.exclusive && launched) state.lastExclusiveEnd = Date.now(); // exclusive turns (policy.mjs)
  ledger(cfg, { event: "job", ...result });
  return { changed: true };
});
process.exit(0); // releases the bridge (fd 3)

function sample() {
  if (context) {
    const s = cpuContext();
    context.samples++;
    context.load1Max = Math.max(context.load1Max, s.load1);
    context.cpuSomeMax = Math.max(context.cpuSomeMax, s.cpuSomeAvg10);
    context.memFullMax = Math.max(context.memFullMax, s.memFullAvg10);
  }
  if (!req.gpu) return;
  for (const u of gpuUsers(cfg, readState(cfg))) {
    if (u.leased || gpuShared.has(u.pid)) continue;
    gpuShared.set(u.pid, { pid: u.pid, cmd: u.cmd });
    ledger(cfg, { event: "unleased-gpu", pid: u.pid, cmd: u.cmd, during: id });
  }
}

/** One line per process in the job's cgroup: PID, state, wait channel, command. */
function procLines() {
  return (jobProcs(cfg, id) ?? []).slice(0, 40).map((pid) => {
    const stat = readFileSafe(`/proc/${pid}/stat`) ?? "";
    const st = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0] ?? "?";
    return `${pid} ${st} ${readFileSafe(`/proc/${pid}/wchan`) ?? "?"} ${(readFileSafe(`/proc/${pid}/cmdline`) ?? "").replace(/\0/g, " ").slice(0, 120)}`;
  });
}
function fileSize(p) { try { return statSync(p).size; } catch { return 0; } }
function mtimeMs(p) { try { return statSync(p).mtimeMs; } catch { return 0; } }

/** Keeps the slice's CPU quota and memory cap in step with the machine, so a
 * vCPU change needs no redeploy. Runtime properties only; the unit file
 * (install.sh --slice) makes the slice persistent. */
function ensureSlice(nproc) {
  const want = sliceLimits(nproc, cfg);
  const cg = readFileSync("/proc/self/cgroup", "utf8").trim().replace(/^0::/, "");
  const root = /^(.*\/user@\d+\.service)/.exec(cg)?.[1];
  if (!root) return;
  // systemd nests "a-b.slice" under "a.slice": siltwake-heavy.slice lives at
  // siltwake.slice/siltwake-heavy.slice. systemd's own ControlGroup is used
  // when it reports one; the derived path otherwise.
  const parts = cfg.slice.replace(/\.slice$/, "").split("-");
  const nested = parts.map((_, i) => `${parts.slice(0, i + 1).join("-")}.slice`).join("/");
  const shown = systemctl("show", "-p", "ControlGroup", "--value", cfg.slice).stdout?.trim();
  const sliceCg = `/sys/fs/cgroup${shown || `${root}/${nested}`}`;
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
