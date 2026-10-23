#!/usr/bin/env node
// One remote ticket's holder (SCHED-2b): runs an admitted ticket on the second
// worker and owns its life, as holder.mjs does for a local one.
//
//   node remote-holder.mjs TICKET          (started by its supervisor, in its own scope)
//   node remote-holder.mjs --stop TICKET   (recovery: stop a ticket's job on the sandbox)
//
// - Runs scripts/alickers-job.sh --sha <the submitted commit> -- lane-run.sh …:
//   the transport pins the commit, waits for the sandbox's job lock, runs
//   `npm ci` if the lockfile changed, prints "alickers-job: testing <sha>",
//   runs the command, prints "tested <sha> exit N".
// - Goals, as for a local job: the stall clock starts at the "testing" line
//   (before it, the job is waiting for the sandbox or installing), and counts
//   output and relayed heartbeats. Continuous memory.high throttling in the
//   sandbox's scope is reported after throttleNoticeS and stopped at the
//   stall window ("throttled"). The class ceiling bounds the whole job.
// - A 75 or 255 *before* the "testing" line is the sandbox's (paused, its
//   lock wait expired, unreachable), never the job's. Then an `any` or `soak`
//   ticket is queued again here (fellBack, keeping its place), and a `4070`
//   ticket waits for alickers again. After it, the code is the job's own.
// - Artifacts (--artifact) are fetched whole into <artifactsDir>/<ticket>/,
//   also when the job failed, and recorded in the result and the ledger with
//   the machine and the tested commit.
import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, openSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { MACHINE_LABELS, plan } from "./policy.mjs";
import { fetchArtifacts, refreshHealth, remoteConfig, remoteStop, remoteYield, uploadWrapper, writeHealth } from "./remote.mjs";
import { hostFor, jobDir, ledger, loadConfig, readJson, readState, self, transaction, alive } from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const stopOnly = process.argv[2] === "--stop";
const id = process.argv[stopOnly ? 3 : 2];
const cfg = loadConfig();
const r = remoteConfig(cfg);
const dir = jobDir(cfg, id);
if (stopOnly) { await remoteStop(cfg, id); process.exit(0); }

const request = readJson(join(dir, "request.json"));
const outPath = join(dir, "output.log");
const note = (msg) => { appendFileSync(outPath, `heavy-check: ${msg}\n`); };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const fmt = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, "0")}m`; };

// 1. Claim, as holder.mjs does.
const me = self();
const t = transaction(cfg, (state) => {
  const ticket = state.tickets[id];
  if (!ticket || ticket.state !== "running" || !ticket.remote || ticket.holder) return { result: null };
  ticket.holder = me;
  return { changed: true, result: structuredClone(ticket) };
});
if (!t || !request) process.exit(0);

const req = t.req, goal = t.goal, sha = request.tree.head;
const cwdRel = relative(t.worktree, t.cwd) || ".";
const artifacts = request.opts?.artifacts ?? [];
const attempt = (t.attempts ?? 0) + 1;
note(`${id} admitted after ${fmt(t.admittedAt - t.submittedAt)} as ${req.class}${req.review ? " (review)" : ""} on ${MACHINE_LABELS.remote} ` +
  `(machine ${goal.machine}${attempt > 1 ? `, attempt ${attempt}` : ""}): commit ${sha.slice(0, 10)}; runs to its end; stops if silent for ${fmt(goal.stallS * 1000)} ` +
  `(or touch $SILTWAKE_JOB_HEARTBEAT) once it starts, at the ${fmt(goal.limitS * 1000)} ${goal.explicitDeadline ? "deadline" : "runaway ceiling"}`);

let stopping = null, child = null, testing = false, testedLine = null, lastActivity = Date.now(), stalledS = null;
let lastHigh = null, lastHighAt = 0, throttleSince = null, throttleNoticed = false, yieldAt = null, yieldedTo = null;
const started = Date.now();

/** Stops the job: on the sandbox (marked cancelled, its wrapper TERMed),
 * retried until the transport ends; if the sandbox can't be reached, or the
 * job never started there, the local transport too. */
const stopJob = (why) => {
  if (stopping) return;
  stopping = why;
  (async () => {
    for (let i = 0; child && child.exitCode == null && child.signalCode == null; i++) {
      const res = await remoteStop(cfg, id);
      if (!testing || (!res.reached && i >= 3) || i >= 6) { child.kill("SIGTERM"); await sleep(2000); if (child.exitCode == null) child.kill("SIGKILL"); break; }
      await sleep(10000);
    }
  })();
};
process.on("SIGTERM", () => stopJob("holder stopped"));
process.on("SIGINT", () => {}); process.on("SIGHUP", () => {});

async function watchdogAsync() {
  if (stopping) return;
  if (existsSync(join(dir, "cancelled"))) { stopJob("cancelled"); return; }
  if (!testing) return; // waiting for the sandbox's lock or installing: not the job's silence
  const now = Date.now();
  if (throttleSince && now - lastHighAt > r.tickS * 2500) throttleSince = null; // the count stopped rising
  if (throttleSince && !throttleNoticed && now - throttleSince >= r.throttleNoticeS * 1000) {
    throttleNoticed = true;
    note(`throttled: the sandbox's MemoryHigh (85% of its ${Math.min(12, Math.max(r.memoryG, Math.ceil(req.memMiB / 1024)))} GiB MemoryMax, no swap) has been throttling this job for ${fmt(now - throttleSince)}; ` +
      `it is stopped if that lasts the ${fmt(goal.stallS * 1000)} stall window. Ask for more with --mem.`);
  }
  if (throttleSince && now - throttleSince >= goal.stallS * 1000) { stalledS = Math.round((now - throttleSince) / 1000); stopJob("throttled"); return; }
  if (now - lastActivity >= goal.stallS * 1000) {
    stalledS = Math.round((now - lastActivity) / 1000);
    note(`stalled: no output and no heartbeat from the sandbox for ${fmt(stalledS * 1000)} (window ${fmt(goal.stallS * 1000)})`);
    stopJob("stalled");
    return;
  }
  if (goal.soak) {
    const p = transaction(cfg, (state) => ({ result: plan(state, Date.now(), hostFor(cfg, state), cfg) }));
    const needed = p.preempt.includes(id);
    if (needed && yieldAt == null) {
      yieldAt = Date.now(); yieldedTo = p.order.find((q) => p.blocked[q] === "remote") ?? null;
      await remoteYield(cfg, id, true);
      note(`yield notice: a 4070 job is waiting for alickers; this soak is stopped in ${fmt(cfg.soakYieldS * 1000)} unless it finishes first ($SILTWAKE_JOB_YIELD)`);
      ledger(cfg, { event: "soak-yield", ticket: id, for: yieldedTo, machine: "4070" });
    } else if (!needed && yieldAt != null) { yieldAt = null; await remoteYield(cfg, id, false); note("yield notice withdrawn"); }
    else if (needed && Date.now() - yieldAt >= cfg.soakYieldS * 1000) stopJob("preempted");
  }
}
let busyDog = false;
function watchdog() { if (busyDog) return; busyDog = true; watchdogAsync().finally(() => { busyDog = false; }); }

// 2. Launch.
const wrapper = await uploadWrapper(cfg);
let rawCode, signal;
if (!wrapper) { rawCode = 255; signal = null; note("could not reach the sandbox to upload the lane wrapper"); }
else if (existsSync(join(dir, "cancelled"))) { rawCode = 75; signal = null; stopping = "cancelled"; }
else {
  const argvB64 = Buffer.from(t.argv.map((a) => `${a}\0`).join("")).toString("base64");
  const memoryG = Math.min(12, Math.max(r.memoryG, Math.ceil(req.memMiB / 1024)));
  const args = ["--sha", sha, "--deadline", String(goal.limitS), "--memory", `${memoryG}G`, "--",
    "bash", wrapper, r.laneDir, id, cwdRel, argvB64, goal.soak ? "1" : "0", String(r.tickS)];
  child = spawn(r.transport, args, { cwd: t.worktree, stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const out = openSync(outPath, "a");
  const onLine = (line) => {
    if (/^siltwake-lane: heartbeat$/.test(line)) { lastActivity = Date.now(); return; } // progress, not log
    const high = /^siltwake-lane: memory\.high (\d+)$/.exec(line);
    if (high) {
      const n = Number(high[1]);
      if (lastHigh != null && n > lastHigh) { lastHighAt = Date.now(); throttleSince ??= Date.now(); }
      lastHigh = n;
      return; // being throttled is not progress
    }
    appendFileSync(out, `${line}\n`);
    if (!testing && /^alickers-job: testing [0-9a-f]{40}/.test(line)) { testing = true; writeHealth(cfg, "busy", `running ${id}`); }
    const tested = /^alickers-job: tested ([0-9a-f]{40}) exit (\d+)/.exec(line);
    if (tested) testedLine = { sha: tested[1], code: Number(tested[2]) };
    lastActivity = Date.now();
  };
  createInterface({ input: child.stdout }).on("line", onLine);
  createInterface({ input: child.stderr }).on("line", onLine);
  [rawCode, signal] = await new Promise((done) => {
    const watch = setInterval(watchdog, Math.min(5000, goal.stallS * 250));
    const backstop = setTimeout(() => stopJob("ceiling"), (goal.limitS + 300) * 1000);
    child.on("error", (e) => { note(`could not start the transport: ${e.message}`); });
    child.on("close", (code, sig) => { clearInterval(watch); clearTimeout(backstop); closeSync(out); done([code, sig]); });
  });
}

// 3. What happened.
const ranS = (Date.now() - started) / 1000;
const sandboxLevel = !testing && !stopping && (rawCode === 75 || rawCode === 255 || rawCode == null);
const lostMidRun = testing && !testedLine && rawCode === 255 && !stopping;
if (sandboxLevel || lostMidRun) {
  const reason = rawCode === 75 ? "alickers is paused, or its job lock wait expired" : lostMidRun ? "the connection to alickers was lost while the job ran" : "alickers is unreachable";
  writeHealth(cfg, rawCode === 75 ? "paused" : "unreachable", reason);
  if (lostMidRun) await remoteStop(cfg, id); // best effort: don't leave it running there
  const giveUp = goal.machine === "4070" && rawCode !== 75 && attempt >= r.maxAttempts;
  if (!giveUp) { await requeue(reason); process.exit(0); }
}

let code = rawCode ?? 128 + (signal === "SIGKILL" ? 9 : 15), label = null, stopReason = null;
if (testedLine) code = testedLine.code;
const timeoutHit = testing && code === 124 && ranS >= goal.limitS - 1;
if (!wrapper && !testing) { code = 255; label = "alickers unreachable; gave up after attempts"; stopReason = "unreachable"; }
else if (stopping === "cancelled") { code = 75; label = testing ? "cancelled" : "cancelled before start; the command did not run"; stopReason = "cancelled"; }
else if (stopping === "stalled") { code = 123; label = `stalled: no output for ${fmt(stalledS * 1000)}`; stopReason = "stalled"; }
else if (stopping === "throttled") { code = 123; label = `throttled: held at the sandbox's MemoryHigh for ${fmt(stalledS * 1000)}; rerun with more --mem`; stopReason = "throttled"; }
else if (stopping === "preempted") { code = 75; label = `preempted: the soak yielded alickers to ${yieldedTo ?? "a 4070 job"}`; stopReason = "preempted"; }
else if (stopping === "ceiling" || timeoutHit) { code = 124; label = goal.explicitDeadline ? `deadline ${goal.limitS}s exceeded` : `runaway ceiling: ran ${fmt(goal.limitS * 1000)}, the ${req.class} class's ceiling`; stopReason = goal.explicitDeadline ? "deadline" : "ceiling"; }
else if (stopping === "holder stopped") { code = 137; label = "killed: holder stopped"; stopReason = "killed"; }
else if (!testing) { code = 70; label = `the transport failed before the job started (exit ${rawCode})`; stopReason = "transport"; }
else if (sandboxLevel || lostMidRun) { label = "the connection to alickers was lost; gave up after attempts"; stopReason = "unreachable"; }

const fetched = artifacts.length && testing ? await fetchArtifacts(cfg, id, artifacts, cwdRel) : [];
for (const a of fetched) note(a.error ? `artifact ${a.remote}: not fetched (${a.error})` : `artifact ${a.remote} → ${a.local} (${a.bytes} bytes)`);
if (testing) await refreshHealth(cfg, { force: true }); // the slot is free again, unless a direct caller took it

const result = {
  ticket: id, code, label, class: req.class, review: req.review, tokens: 0, memMiB: req.memMiB, gpu: req.gpu, express: false, exclusive: false,
  machine: MACHINE_LABELS.remote, machineTag: goal.machine, remote: true, attempts: attempt, mode: t.mode, worktree: t.worktree, cwd: t.cwd, argv: t.argv,
  submittedAt: t.submittedAt, admittedAt: t.admittedAt, endedAt: Date.now(), ranS: Math.round(ranS * 10) / 10, peakMiB: null, cpuS: null,
  unavailable: { peakMiB: "measured by the sandbox's siltwake-job, not reported over the lane", cpuS: "the same" },
  stopReason, goal, head: request.tree.head, dirty: request.tree.dirty, headAtAdmit: sha, dirtyAtAdmit: "clean", changedTree: false, changedDuringRun: false,
  evidence: testing ? { commit: sha, bound: testedLine?.sha === sha, why: testedLine ? (testedLine.sha === sha ? null : `the transport tested ${testedLine.sha}`) : "the transport never reported the end", snapshot: false, machine: MACHINE_LABELS.remote } : null,
  artifacts: artifacts.length ? (testing ? fetched : artifacts.map((p) => ({ remote: p, error: "the job did not run" }))) : undefined,
};
transaction(cfg, (state) => {
  writeFileSync(join(dir, "exit.json"), JSON.stringify(result, null, 1));
  delete state.tickets[id];
  ledger(cfg, { event: "job", ...result });
  return { changed: true };
});
process.exit(0);

/** Back to the queue, keeping its place: here for any and soak, waiting for
 * alickers for 4070. A new supervisor waits for its admission; until it has
 * claimed the ticket this holder stays its owner, so recovery never drops it. */
async function requeue(reason) {
  const back = transaction(cfg, (state) => {
    const tk = state.tickets[id];
    if (!tk) return { result: false };
    for (const k of ["admittedAt", "express", "remote", "holder", "holderUnit", "unit", "supervisorUnit", "hostAtAdmit"]) delete tk[k];
    Object.assign(tk, { state: "queued", supervisor: me, attempts: attempt, fellBack: { reason, at: Date.now(), machine: goal.machine } });
    ledger(cfg, { event: "remote-fallback", ticket: id, machineTag: goal.machine, reason, attempts: attempt, to: goal.machine === "4070" ? "waits for alickers" : "here" });
    return { changed: true, result: true };
  });
  if (!back) return;
  note(`${reason}: ${goal.machine === "4070" ? "the 4070 job waits for alickers again" : "queued again to run here (factory-worker), keeping its place"}`);
  const log = openSync(join(dir, "supervisor.log"), "a");
  spawn("systemd-run", ["--user", "--scope", "--quiet", "--collect", `--unit=${cfg.supervisorPrefix}-${id}-r${attempt}`, process.execPath, join(here, "supervisor.mjs"), "--resume", id],
    { detached: true, stdio: ["ignore", log, log], env: process.env }).unref();
  closeSync(log);
  for (let i = 0; i < 300; i++) {
    const tk = readState(cfg).tickets[id];
    if (!tk || (tk.supervisor && tk.supervisor.pid !== me.pid && alive(tk.supervisor))) return;
    await sleep(100);
  }
  note("the resumed supervisor did not start; the ticket will be recovered as lost");
}
