#!/usr/bin/env node
// One remote ticket's holder (SCHED-2b): runs an admitted ticket on the second
// worker and owns its life, as holder.mjs does for a local one.
//
//   node remote-holder.mjs TICKET            (started by its supervisor, in its own scope)
//   node remote-holder.mjs --recover TICKET  (recovery, after this holder died: R1-F3)
//
// Control never comes from output (R1-F2). Each launch is a new attempt with
// its own directories on the sandbox (R1-F4): LANE/jobs/TICKET/aN for the job
// (PID, cgroup, heartbeat, staged outputs) and LANE/receipts/TICKET/aN for the
// transport's receipt, claim and scope, which the job is never told about.
// Every receipt line carries this attempt's random nonce, given to the
// transport on stdin, and the phases must come in their one order
// (remote.mjs parseReceipt); anything else makes the receipt invalid, and an
// invalid receipt binds nothing (R2-F1). The holder reads it out of band, with
// the heartbeat, memory.high and the wrapper's liveness, every tickS.
//
// - Goals: the stall clock starts when the receipt says "started"; before
//   that the job waits for the sandbox's lock or sets up, which is not its
//   silence. Continuous memory.high throttling is reported after
//   throttleNoticeS and stopped at the stall window ("throttled"); the class
//   ceiling bounds the whole job.
// - Admission: any and soak jobs never wait for alickers (R2-F4). The
//   transport runs with --no-wait (a held lock gives "busy" at once), and if
//   the sandbox still hasn't admitted the attempt admitGraceS after hand-over,
//   the holder takes its claim as "abandon": it can then never start, and the
//   job runs here. 4070 jobs wait for the lock.
// - Without "admitted", the sandbox never ran the job: busy, paused, its lock
//   wait expired (75), unreachable (255), or the transport failed before it.
//   An any or soak ticket then runs here, keeping its place; a 4070 ticket
//   waits for alickers again, backing off, until its queue timeout (R1-F5). A
//   setup failure (checkout, npm ci, an unclean tree) is not an outage: any and
//   soak run here, a 4070 job fails with it. After "started", the result is the
//   job's own.
// - Nothing runs elsewhere while this attempt might still run on alickers
//   (R2-F3): once the job command was handed over, a requeue or result first
//   waits until the sandbox confirms the attempt can't start or its scope is
//   empty (remote.mjs remoteStop, escalating to the scope's cgroup.kill). An
//   unreachable sandbox keeps the ticket and its place on alickers.
// - Evidence is bound only if the receipt is valid and complete, its exit
//   matches the transport's own exit status, and the checkout was exactly the
//   commit before and after the job (R2-F2: dirtyAtAdmit, changedDuringRun).
// - Outputs: the wrapper staged them inside the sandbox's lock (R1-F1); only
//   that immutable stage is fetched afterwards, bounded and cancellable
//   (R1-F7), while the cancel and backstop watch stays on.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, closeSync, existsSync, openSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { MACHINE_LABELS, plan } from "./policy.mjs";
import { attemptDir, fetchStage, parseReceipt, receiptDir, refreshHealth, remoteAbandon, remoteConfig, remoteRead, remoteStop, remoteYield, removeAttempt, setCurrent, uploadWrapper, writeHealth } from "./remote.mjs";
import { alive, hostFor, jobDir, ledger, loadConfig, readJson, readState, self, systemctl, transaction } from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const recover = process.argv[2] === "--recover";
const id = process.argv[recover ? 3 : 2];
const cfg = loadConfig();
const dir = jobDir(cfg, id);
const request = readJson(join(dir, "request.json"));
const outPath = join(dir, "output.log");
const note = (msg) => { appendFileSync(outPath, `heavy-check: ${msg}\n`); };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const fmt = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, "0")}m`; };
const me = self();

if (recover) await recoverTicket();

// 1. Claim, as holder.mjs does.
const t = transaction(cfg, (state) => {
  const ticket = state.tickets[id];
  if (!ticket || ticket.state !== "running" || !ticket.remote || ticket.holder) return { result: null };
  ticket.holder = me;
  ticket.attempts = (ticket.attempts ?? 0) + 1;
  return { changed: true, result: structuredClone(ticket) };
});
if (!t || !request) process.exit(0);

const r = remoteConfig(cfg);
const req = t.req, goal = t.goal, sha = request.tree.head, attempt = t.attempts;
const cwdRel = relative(t.worktree, t.cwd) || ".";
const artifacts = request.opts?.artifacts ?? [];
// The lane and attempt this job is sent to, for recovery (--recover) and stops.
writeFileSync(join(dir, "remote-config.json"), JSON.stringify(r));
// This attempt's nonce: only the transport's stdin and this private file carry it.
const nonce = randomBytes(16).toString("hex");
writeFileSync(join(dir, "attempt.json"), JSON.stringify({ attempt, dir: attemptDir(r, id, attempt), receipts: receiptDir(r, id, attempt), sha, nonce }), { mode: 0o600 });
note(`${id} admitted after ${fmt(t.admittedAt - t.submittedAt)} as ${req.class}${req.review ? " (review)" : ""} on ${MACHINE_LABELS.remote} ` +
  `(machine ${goal.machine}, attempt ${attempt}): commit ${sha.slice(0, 10)}; runs to its end; stops if silent for ${fmt(goal.stallS * 1000)} ` +
  `(or touch $SILTWAKE_JOB_HEARTBEAT) once it starts, at the ${fmt(goal.limitS * 1000)} ${goal.explicitDeadline ? "deadline" : "runaway ceiling"}`);

let stopping = null, child = null, phase = { admitted: false, started: false }, lastActivity = Date.now(), stalledS = null, ended = false;
// handedOverAt: when the transport sent the job command (its fd 3); before that nothing reached the sandbox.
let handedOverAt = null, abandoned = false, abandoning = false;
const noWait = goal.machine !== "4070";
let lastHigh = null, lastHighAt = 0, throttleSince = null, throttleNoticed = false, yieldAt = null, yieldedTo = null, lastBeat = null, lastLook = 0, lastSeenAlive = Date.now();
const started = Date.now();
const memoryG = Math.min(12, Math.max(r.memoryG, Math.ceil(req.memMiB / 1024)));
const cancelled = () => existsSync(join(dir, "cancelled"));

/** Stops this attempt: retired (or the ticket cancelled) on the sandbox, retried
 * until the sandbox confirms it can't start or its scope is empty. One that
 * never started never will; then the local transport is ended too. */
const stopJob = (why) => {
  if (stopping) return;
  stopping = why;
  (async () => {
    for (let i = 0; !ended; i++) {
      const s = handedOverAt == null ? { reached: true, stopped: true, started: false } : await remoteStop(cfg, id, { attempt, cancel: why === "cancelled", r });
      if (s.reached && s.stopped && !s.started) { endTransport(); }
      if (ended || (s.reached && s.stopped)) break;
      await sleep(Math.min(30000, 2000 * 2 ** i));
    }
  })();
};
/** Ends the local transport and its ssh (its own process group): only once the
 * attempt can't start on the sandbox, so nothing is left unsupervised there. */
function endTransport() {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  const sig = (x) => { try { process.kill(-child.pid, x); } catch { /* gone */ } };
  sig("SIGTERM");
  setTimeout(() => { if (child.exitCode == null && child.signalCode == null) sig("SIGKILL"); }, 2000).unref();
}
process.on("SIGTERM", () => stopJob("holder stopped"));
process.on("SIGINT", () => {}); process.on("SIGHUP", () => {});

/** The out-of-band watch: receipt phases, heartbeat, memory.high, liveness;
 * then the goal rules. Runs from launch until the result is written. */
async function look() {
  const w = await remoteRead(r, id, attempt, nonce);
  if (!w) return;
  if (w.receipt.admitted && !phase.admitted) { phase.admitted = true; writeHealth(cfg, "busy", `running ${id}`); }
  if (w.receipt.started && !phase.started) { phase.started = true; lastActivity = Date.now(); }
  if (w.alive) lastSeenAlive = Date.now();
  if (w.beat != null && w.beat !== lastBeat) { if (lastBeat != null) lastActivity = Date.now(); lastBeat = w.beat; }
  if (w.high != null) {
    if (lastHigh != null && w.high > lastHigh) { lastHighAt = Date.now(); throttleSince ??= Date.now(); }
    lastHigh = w.high;
  }
}
let busyDog = false, outBytes = 0;
async function watchdog() {
  if (busyDog || ended) return;
  busyDog = true;
  try {
    if (!stopping && cancelled()) { stopJob("cancelled"); return; }
    if (Date.now() - lastLook >= r.tickS * 1000) { lastLook = Date.now(); await look(); }
    // An any or soak job never waits for alickers: not admitted within the grace, it is given up.
    if (noWait && handedOverAt != null && !phase.admitted && !stopping && !abandoned && !abandoning && Date.now() - handedOverAt >= (r.admitGraceS ?? 20) * 1000) {
      abandoning = true;
      const a = await remoteAbandon(r, id, attempt);
      abandoning = false;
      if (a.abandoned) {
        abandoned = true;
        endTransport();
      }
    }
    if (stopping || !phase.started || child?.exitCode != null) return;
    const now = Date.now();
    if (throttleSince && now - lastHighAt > r.tickS * 2500) throttleSince = null; // the count stopped rising
    if (throttleSince && !throttleNoticed && now - throttleSince >= r.throttleNoticeS * 1000) {
      throttleNoticed = true;
      note(`throttled: the sandbox's MemoryHigh (85% of its ${memoryG} GiB MemoryMax, no swap) has been throttling this job for ${fmt(now - throttleSince)}; ` +
        `it is stopped if that lasts the ${fmt(goal.stallS * 1000)} stall window. Ask for more with --mem.`);
    }
    if (throttleSince && now - throttleSince >= goal.stallS * 1000) { stalledS = Math.round((now - throttleSince) / 1000); stopJob("throttled"); return; }
    if (now - lastActivity >= goal.stallS * 1000) {
      stalledS = Math.round((now - lastActivity) / 1000);
      if (throttleSince) { note(`throttled and silent for ${fmt(stalledS * 1000)}`); stopJob("throttled"); return; }
      note(`stalled: no output and no heartbeat from the sandbox for ${fmt(stalledS * 1000)} (window ${fmt(goal.stallS * 1000)})`);
      stopJob("stalled");
      return;
    }
    if (goal.soak) {
      const p = transaction(cfg, (state) => ({ result: plan(state, Date.now(), hostFor(cfg, state), cfg) }));
      const needed = p.preempt.includes(id);
      if (needed && yieldAt == null) {
        yieldAt = Date.now(); yieldedTo = p.order.find((q) => p.blocked[q] === "remote") ?? null;
        await remoteYield(r, id, attempt, true);
        note(`yield notice: a 4070 job is waiting for alickers; this soak is stopped in ${fmt(cfg.soakYieldS * 1000)} unless it finishes first ($SILTWAKE_JOB_YIELD)`);
        ledger(cfg, { event: "soak-yield", ticket: id, for: yieldedTo, machine: "4070" });
      } else if (!needed && yieldAt != null) { yieldAt = null; await remoteYield(r, id, attempt, false); note("yield notice withdrawn"); }
      else if (needed && Date.now() - yieldAt >= cfg.soakYieldS * 1000) stopJob("preempted");
    }
  } finally { busyDog = false; }
}
const dog = setInterval(watchdog, Math.min(1000, goal.stallS * 250));
// The ceiling bounds everything after launch, the fetch included.
const backstop = setTimeout(() => stopJob("ceiling"), (goal.limitS + 300) * 1000);

// 2. Launch.
let rawCode = null;
const wrapper = cancelled() ? null : await uploadWrapper(cfg);
if (cancelled()) stopping = "cancelled";
else if (!wrapper) { rawCode = 255; note("could not reach the sandbox to upload the lane wrapper"); }
else {
  // This attempt becomes the current one first, then earlier ones are retired
  // (a lost session may have left one starting late): only this one can run.
  if (!(await setCurrent(r, id, attempt))) { rawCode = 255; note("could not reach the sandbox to record the attempt"); }
  for (let a = 1; a < attempt; a++) await remoteAbandon(r, id, a); // each was settled before its requeue; this is a backstop
  const b64 = (xs) => Buffer.from(xs.map((x) => `${x}\0`).join("")).toString("base64");
  const args = ["--sha", sha, "--deadline", String(goal.limitS), "--memory", `${memoryG}G`, "--receipt", receiptDir(r, id, attempt), ...(noWait ? ["--no-wait"] : []), "--",
    "bash", wrapper, r.laneDir, id, String(attempt), cwdRel, b64(t.argv), goal.soak ? "1" : "0", b64(artifacts)];
  if (rawCode == null) {
    // The nonce goes on stdin; fd 3 says when the job command is handed over.
    child = spawn(r.transport, args, { cwd: t.worktree, stdio: ["pipe", "pipe", "pipe", "pipe"], env: transportEnv(), detached: true });
    child.stdin.on("error", () => {}); child.stdin.end(`${nonce}\n`);
    child.stdio[3].on("data", (d) => { if (String(d).includes("handover")) handedOverAt ??= Date.now(); });
    // Output is the job's log, nothing more; heartbeat-free jobs still count it as activity.
    const out = openSync(outPath, "a");
    const onData = (d) => { appendFileSync(out, d); outBytes += d.length; if (phase.started) lastActivity = Date.now(); };
    child.stdout.on("data", onData); child.stderr.on("data", onData);
    rawCode = await new Promise((done) => {
      child.on("error", (e) => { note(`could not start the transport: ${e.message}`); });
      child.on("close", (code, sig) => { closeSync(out); done(code ?? (sig ? 128 + (sig === "SIGKILL" ? 9 : 15) : 255)); });
    });
  }
}

// 3. What happened. Once the job command was handed over, nothing else is
// decided until the sandbox confirms this attempt is stopped (R2-F3); then the
// receipt, read out of band, says how far it got.
if (handedOverAt != null) await settle("the transport ended");
let w = null;
if (handedOverAt != null) for (let i = 0; !(w = await remoteRead(r, id, attempt, nonce)); i++) await sleep(Math.min(30000, 2000 * 2 ** i));
const rc = w?.receipt ?? parseReceipt("", nonce);
if (rc.admitted) phase.admitted = true;
if (rc.started) phase.started = true;
const ranS = (Date.now() - started) / 1000;

if (stopping === "cancelled" && !phase.started) await finish({ code: 75, label: "cancelled before start; the command did not run", stopReason: "cancelled" }, null);
// An invalid receipt (another nonce or none, phases out of order or repeated,
// a truncated record) or one contradicting the transport's exit binds nothing.
const contradiction = !rc.valid ? rc.problem
  : rc.exit != null && rawCode !== rc.exit && rawCode !== 255 && !stopping ? `the receipt says exit ${rc.exit}, the transport exited ${rawCode}` : null;
if (contradiction) {
  const why = `the receipt from alickers is not valid (${contradiction}); nothing from this attempt is evidence`;
  // A 4070 job can't rerun elsewhere: it fails (70, never a success code), with both exits recorded.
  if (goal.machine === "4070") await finish({ code: 70, label: why, stopReason: "receipt" }, { commit: sha, bound: false, why, snapshot: false, machine: MACHINE_LABELS.remote, transportExit: rawCode, receiptExit: rc.exit });
  await requeue(why, { outage: false });
}
if (!phase.admitted && !stopping) {
  // The sandbox never ran it.
  if (rc.busy || abandoned) {
    writeHealth(cfg, "busy", rc.busy ? "its job lock was held" : "it did not admit the job in time");
    await requeue(rc.busy ? "alickers was busy (another job holds its lock)" : `alickers did not admit the job within ${r.admitGraceS ?? 20}s (given up there)`, { outage: false });
  }
  const why = rawCode === 75 ? "alickers is paused, or its job lock wait expired" : rawCode === 255 ? "alickers is unreachable" : `the transport failed before the sandbox admitted the job (exit ${rawCode})`;
  if (rawCode === 75) writeHealth(cfg, "paused", why); else if (rawCode === 255) writeHealth(cfg, "unreachable", why);
  await requeue(why, { outage: true });
}
if (rc.setup === "failed" && !phase.started) {
  const why = `setup failed on alickers: ${rc.setupFailed.step} exit ${rc.setupFailed.code}`;
  if (goal.machine === "4070") await finish({ code: 70, label: why, stopReason: "setup" }, null);
  await requeue(why, { outage: false });
}
if (phase.admitted && !phase.started && !stopping) await requeue("the session with alickers ended during setup", { outage: true });
if (phase.started && rc.exit == null && !stopping && rawCode !== 124) await requeue("the connection to alickers was lost while the job ran", { outage: true });
if (rc.exit != null && rc.exit !== 255 && rawCode === 255 && !stopping) await requeue("the connection to alickers was lost as the job ended; its exit can't be checked against the transport's", { outage: true });

// The job ran (or was stopped by us after starting): its own result, and its staged outputs.
let code = rc.exit ?? rawCode ?? 137, label = null, stopReason = null;
if (stopping === "cancelled") { code = 75; label = "cancelled"; stopReason = "cancelled"; }
else if (stopping === "stalled") { code = 123; label = `stalled: no output for ${fmt(stalledS * 1000)}`; stopReason = "stalled"; }
else if (stopping === "throttled") { code = 123; label = `throttled: held at the sandbox's MemoryHigh for ${fmt(stalledS * 1000)}; rerun with more --mem`; stopReason = "throttled"; }
else if (stopping === "preempted") { code = 75; label = `preempted: the soak yielded alickers to ${yieldedTo ?? "a 4070 job"}`; stopReason = "preempted"; }
else if (stopping === "ceiling" || (code === 124 && ranS >= goal.limitS - 1)) { code = 124; label = goal.explicitDeadline ? `deadline ${goal.limitS}s exceeded` : `runaway ceiling: ran ${fmt(goal.limitS * 1000)}, the ${req.class} class's ceiling`; stopReason = goal.explicitDeadline ? "deadline" : "ceiling"; }
else if (stopping === "holder stopped") { code = 137; label = "killed: holder stopped"; stopReason = "killed"; }
else if (rc.refused) { code = 75; label = `refused on alickers: ${rc.refused}`; stopReason = "refused"; }

let fetched = [];
if (artifacts.length) {
  const res = rc.stageDone ? await fetchStage(r, id, attempt, join(r.artifactsDir, id), { inactivityS: r.fetchInactivityS ?? 60, ceilingS: r.fetchCeilingS ?? 1800, cancelled }) : { ok: false, error: "the wrapper did not stage the outputs" };
  const local = (name) => join(r.artifactsDir, id, name);
  fetched = artifacts.map((p) => {
    const name = p.split("/").filter(Boolean).at(-1);
    if (rc.stageMissing.includes(p)) return { remote: p, error: "not written by the job" };
    if (rc.stageFailed.includes(p)) return { remote: p, error: "could not be staged on the sandbox" };
    if (!res.ok) return { remote: p, error: `${res.error}; staged copy kept at ${attemptDir(r, id, attempt)}/stage/${name} on alickers` };
    if (!existsSync(local(name))) return { remote: p, error: "missing from the fetched stage" };
    return { remote: p, local: local(name), bytes: Number(spawnSync("du", ["-sb", local(name)], { encoding: "utf8" }).stdout.split("\t")[0]) || 0 };
  });
  for (const a of fetched) note(a.error ? `artifact ${a.remote}: not fetched (${a.error})` : `artifact ${a.remote} → ${a.local}`);
  if (res.ok) await removeAttempt(r, id, attempt);
} else await removeAttempt(r, id, attempt);
await refreshHealth(cfg, { force: true }); // the slot is free again, unless a direct caller took it

// Bound only if the receipt is complete and agrees with the transport, and the
// checkout was exactly the commit when the job started and when it ended.
const changedDuringRun = rc.after ? !rc.after.clean || rc.after.head !== sha : null;
const why = rc.sha !== sha ? (rc.sha ? `the sandbox checked out ${rc.sha}` : "the receipt has no verified commit")
  : rc.exit == null ? "the receipt has no exit"
  : rc.exit !== rawCode ? `the transport exited ${rawCode}, the receipt says ${rc.exit}`
  : !rc.after ? "the receipt has no check of the tree after the job"
  : changedDuringRun ? `the job changed the checkout (HEAD ${rc.after.head.slice(0, 10)}, ${rc.after.changed} tracked files; restored afterwards)` : null;
if (changedDuringRun) note(`the job changed tracked files on alickers (${rc.after.changed}, HEAD ${rc.after.head.slice(0, 10)}): the result is not bound to ${sha.slice(0, 10)}`);
await finish({ code, label, stopReason }, {
  commit: sha, bound: why == null, why, snapshot: false, machine: MACHINE_LABELS.remote, dirtyAtAdmit: rc.dirtyAtAdmit, changedDuringRun,
}, fetched);

/** Writes the result and frees the ticket. */
async function finish(outcome, evidence, fetchedArtifacts = []) {
  ended = true;
  clearInterval(dog); clearTimeout(backstop);
  const result = {
    ticket: id, ...outcome, class: req.class, review: req.review, tokens: 0, memMiB: req.memMiB, gpu: req.gpu, express: false, exclusive: false,
    machine: MACHINE_LABELS.remote, machineTag: goal.machine, remote: true, attempts: attempt, mode: t.mode, worktree: t.worktree, cwd: t.cwd, argv: t.argv,
    submittedAt: t.submittedAt, admittedAt: t.admittedAt, endedAt: Date.now(), ranS: Math.round((Date.now() - started) / 100) / 10, peakMiB: null, cpuS: null,
    unavailable: { peakMiB: "measured by the sandbox's siltwake-job, not reported over the lane", cpuS: "the same" },
    goal, head: request.tree.head, dirty: request.tree.dirty, headAtAdmit: sha, dirtyAtAdmit: evidence?.dirtyAtAdmit ?? null, changedTree: false, changedDuringRun: evidence?.changedDuringRun ?? null,
    evidence, artifacts: artifacts.length ? (fetchedArtifacts.length ? fetchedArtifacts : artifacts.map((p) => ({ remote: p, error: "the job did not run" }))) : undefined,
  };
  transaction(cfg, (state) => {
    writeFileSync(join(dir, "exit.json"), JSON.stringify(result, null, 1));
    delete state.tickets[id];
    ledger(cfg, { event: "job", ...result });
    return { changed: true };
  });
  process.exit(0);
}

/**
 * Waits until the sandbox confirms this attempt can't start or has stopped,
 * its whole scope included (remote.mjs remoteStop). Until then the ticket
 * keeps its place on alickers: an unreachable sandbox, or one whose scope is
 * still populated, never lets the job run anywhere else (R2-F3).
 */
async function settle(why) {
  for (let i = 0, noted = false; ; i++) {
    const s = await remoteStop(cfg, id, { attempt, r });
    if (s.reached && s.stopped) return s;
    if (!noted) { noted = true; note(`${why}: waiting until alickers confirms this attempt has stopped (${s.reached ? s.detail : "unreachable"}); the ticket keeps its place there meanwhile`); }
    await sleep(Math.min(30000, 2000 * 2 ** i));
  }
}

/** The transport's environment: test seams only under a private test state (R2-F5). */
function transportEnv() {
  const env = { ...process.env };
  if (cfg.production || env.ALICKERS_TEST_MODE !== "1") for (const k of ["ALICKERS_TEST_MODE", "ALICKERS_SSH", "ALICKERS_REPO", "ALICKERS_TMP", "ALICKERS_LOCK"]) delete env[k];
  return env;
}

/**
 * Back to the queue, keeping its place: here for any and soak, waiting for
 * alickers for 4070 (with backoff, until its queue timeout: never a give-up).
 * A new supervisor waits for its admission; until it has claimed the ticket
 * this holder stays its owner, so recovery never drops it.
 */
async function requeue(reason, { outage }) {
  // This attempt never runs again, and nothing runs elsewhere while it might (R2-F3).
  if (handedOverAt != null) await settle(reason);
  ended = true;
  clearInterval(dog); clearTimeout(backstop);
  const waits = goal.machine === "4070";
  const backoffS = waits ? Math.min(r.retryMaxS ?? 300, (r.retryBaseS ?? 15) * 2 ** Math.min(5, attempt - 1)) : 0;
  const back = transaction(cfg, (state) => {
    const tk = state.tickets[id];
    if (!tk) return { result: false };
    for (const k of ["admittedAt", "express", "remote", "holder", "holderUnit", "unit", "supervisorUnit", "hostAtAdmit"]) delete tk[k];
    Object.assign(tk, { state: "queued", supervisor: me, attempts: attempt, notBefore: waits ? Date.now() + backoffS * 1000 : undefined,
      fellBack: { reason, at: Date.now(), machine: goal.machine, outage } });
    ledger(cfg, { event: "remote-fallback", ticket: id, machineTag: goal.machine, reason, attempts: attempt, to: waits ? `waits for alickers (retry after ${backoffS}s)` : "here" });
    return { changed: true, result: true };
  });
  if (!back) process.exit(0);
  note(`${reason}: ${waits ? `the 4070 job waits for alickers again (next try in ${backoffS}s, until its queue timeout)` : "queued again to run here (factory-worker), keeping its place"}`);
  const log = openSync(join(dir, "supervisor.log"), "a");
  spawn("systemd-run", ["--user", "--scope", "--quiet", "--collect", `--unit=${cfg.supervisorPrefix}-${id}-r${attempt}`, process.execPath, join(here, "supervisor.mjs"), "--resume", id],
    { detached: true, stdio: ["ignore", log, log], env: process.env }).unref();
  closeSync(log);
  for (let i = 0; i < 300; i++) {
    const tk = readState(cfg).tickets[id];
    if (!tk || tk.state !== "queued" || (tk.supervisor && tk.supervisor.pid !== me.pid && alive(tk.supervisor))) process.exit(0);
    await sleep(100);
  }
  note("the resumed supervisor did not start; the ticket will be recovered as lost");
  process.exit(0);
}

/**
 * Recovery after the holder died (R1-F3), started by reconcile in its own
 * scope. The ticket stays reserved meanwhile. It ends the old holder's scope
 * (its transport), stops the attempt on the sandbox, retrying while the
 * sandbox is unreachable, then finishes the ticket: with the job's own code
 * if the receipt shows it ended, else as killed.
 */
async function recoverTicket() {
  const tk = readState(cfg).tickets[id];
  const lane = readJson(join(dir, "remote-config.json")), at = readJson(join(dir, "attempt.json"));
  // Not waited for: the sandbox stop below is what ends the job; the old
  // scope (its transport) goes when its processes do.
  if (tk?.holderUnit) systemctl("stop", "--no-block", `${tk.holderUnit}.scope`);
  let rc = null;
  if (lane && at) {
    // The receipt first: an exit recorded before our stop is the job's own;
    // one after it would be our TERM's. Then the attempt is stopped, and the
    // ticket kept, until the sandbox confirms it (R2-F3).
    for (let i = 0; ; i++) {
      const before = await remoteRead(lane, id, at.attempt, at.nonce);
      if (before && rc == null && before.receipt.valid && before.receipt.exit != null) rc = before.receipt;
      const s = before ? await remoteStop(cfg, id, { attempt: at.attempt, r: lane }) : { reached: false };
      if (s.reached && s.stopped) break;
      await sleep(Math.min(60000, 2000 * 2 ** i));
    }
  }
  const done = rc?.exit != null;
  const result = done
    ? { code: rc.exit, label: "its remote holder died; the job's own result, from its receipt (outputs not fetched; staged on alickers)", stopReason: null }
    : { code: 137, label: "killed: its remote holder died; the job on alickers was stopped", stopReason: "killed" };
  transaction(cfg, (state) => {
    const tt = state.tickets[id];
    if (!tt) return {};
    const res = { ticket: id, class: tt.req.class, submittedAt: tt.submittedAt, admittedAt: tt.admittedAt, endedAt: Date.now(), remote: true, machine: MACHINE_LABELS.remote,
      machineTag: tt.goal?.machine, attempts: tt.attempts, head: request?.tree?.head ?? null,
      evidence: { commit: request?.tree?.head ?? null, bound: false, why: "recovered: its holder did not see the job end", snapshot: false }, ...result };
    writeFileSync(join(dir, "exit.json"), JSON.stringify(res, null, 1));
    ledger(cfg, { event: "reconciled", ticket: id, state: "running", worktree: tt.worktree, class: tt.req.class, ...res });
    delete state.tickets[id];
    return { changed: true };
  });
  process.exit(0);
}
