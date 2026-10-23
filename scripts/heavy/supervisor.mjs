#!/usr/bin/env node
// One heavy-check v2 ticket's detached supervisor:
//
//   node supervisor.mjs TICKET      (config comes from the SILTWAKE_SCHED_* env)
//
// Started by `submit` in its own session (and its own systemd scope, so the
// agent's tool call ending does not take it down). It enqueues the ticket and
// admits it when the plan says so, taking the legacy lock in shared mode. Then
// it hands the ticket and that lock to the ticket's holder (holder.mjs), which
// owns the job's lifetime, and exits. If it dies while queued, the next
// transaction drops the ticket.
import { spawn } from "node:child_process";
import { openSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plan, resolveRequest, tokensFor } from "./policy.mjs";
import { refreshHealth } from "./remote.mjs";
import {
  flockFd, gpuUsers, hostFor, jobDir, ledger, loadConfig, readFileSafe, readJson, readState,
  readMode, reconcile, self, transaction, writeJsonAtomic,
} from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// --resume TICKET: a remote ticket sent back to the queue by its remote
// holder (remote-holder.mjs requeue) gets a new supervisor, which takes the
// ticket over instead of enqueueing it.
const resume = process.argv[2] === "--resume";
const id = process.argv[resume ? 3 : 2];
const cfg = loadConfig();
const dir = jobDir(cfg, id);
const request = readJson(join(dir, "request.json"));
if (!request) { console.error(`supervisor: no request for ${id}`); process.exit(2); }
const me = self();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } };

let bridgeFd = null, holderUnit = null, remote = false;
process.on("SIGTERM", () => process.exit(0)); // cancelled while queued; `cancel` already cleaned up
process.on("SIGINT", () => {}); process.on("SIGHUP", () => {});

/** Re-resolves queued requests with the current mode and machine, so a mode
 * switch or a vCPU change applies to tickets already waiting. Only this
 * version's tickets (goal v2): a SCHED-1 ticket keeps the request its own
 * code resolved, and the goal is never re-resolved. */
function refreshRequests(state, T, mode) {
  for (const t of Object.values(state.tickets)) {
    if (t.state !== "queued" || t.goal?.v !== 2) continue;
    const { goal, ...r } = resolveRequest(t.opts, { T, M: cfg.poolMiB, mode, minStallS: cfg.minStallS, ceilings: cfg.ceilings });
    if (!r.error) t.req = r;
  }
}

// 1. Enqueue, or join a matching ticket that is already queued or running.
const ack = resume ? transaction(cfg, (state) => {
  const t = state.tickets[id];
  if (!t || t.state !== "queued") return { result: { gone: true } };
  t.supervisor = me;
  return { changed: true, result: { ticket: id, resumed: true } };
}) : transaction(cfg, (state) => {
  const changed = reconcile(cfg, state);
  const match = Object.values(state.tickets).find((t) => t.key === request.key);
  if (match) return { changed, result: { joined: match.id } };
  state.seq += 1;
  // The goal lives beside req, not in it: a SCHED-1 supervisor still queued
  // during a migration re-resolves every queued req with its own code.
  const { goal, ...req } = request.req;
  state.tickets[id] = {
    id, seq: state.seq, key: request.key, worktree: request.worktree, cwd: request.cwd, argv: request.argv,
    opts: request.opts, req, goal, testBuild: request.testBuild ?? ".test-build", state: "queued", submittedAt: request.submittedAt,
    queueTimeoutS: request.queueTimeoutS, supervisor: me,
  };
  return { changed: true, result: { ticket: id } };
});
if (!resume) writeJsonAtomic(join(dir, "ack.json"), ack);
if (ack.joined || ack.gone) process.exit(0);
// Whether this ticket may go to the second worker: then its health is kept
// fresh (remote.mjs, outside the state lock) while it waits.
const remoteBound = Boolean(request.req.goal?.remoteOk) && ["any", "4070", "soak"].includes(request.req.goal?.machine);

// 2. Wait for admission: re-plan when the state file changes, or every 15 s.
// A v1 job releasing the old lock changes no state file, so while blocked by
// it, re-check every 2 s.
let lastSeen = -1, lastTry = 0, every = 15000;
const healthFile = join(cfg.dir, "remote.json");
let refreshing = false;
for (;;) {
  // Health is refreshed beside the loop, never awaited before planning: the
  // plan uses the cached reading, so an any ticket with room here is admitted
  // here at once, whatever the network does (R1-F6). A fresh reading changes
  // remote.json, which wakes the loop.
  if (remoteBound && !refreshing && !readState(cfg).tickets[id]?.fellBack) {
    refreshing = true;
    refreshHealth(cfg).catch(() => {}).finally(() => { refreshing = false; });
  }
  const m = mtime(cfg.paths.state) + mtime(healthFile);
  if (m !== lastSeen || Date.now() - lastTry >= every) {
    const out = tryAdmit();
    lastSeen = mtime(cfg.paths.state) + mtime(healthFile); lastTry = Date.now();
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
    const host = hostFor(cfg, state);
    if (now - (state.gpuScanAt ?? 0) >= 60000) changed = scanGpu(state, now) || changed;
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
    if (mine.remote) {
      // The second worker: no local reservation, no bridge (nothing runs here
      // but the transport); its remote holder owns it (remote-holder.mjs).
      holderUnit = `${cfg.supervisorPrefix}-rhold-${id}`;
      remote = true;
      Object.assign(t, { state: "running", admittedAt: now, express: false, remote: true, holderUnit, supervisorUnit: `${cfg.supervisorPrefix}-${id}`, mode });
      writeJsonAtomic(join(dir, "grant.json"), { ticket: id, class: t.req.class, remote: true, machine: t.goal.machine, gpu: false, exclusive: false });
      return { changed: true, result: "admitted" };
    }
    // Always shared, exclusive jobs included: shared already shuts v1 out, the
    // plan keeps an exclusive job alone, and an exclusive (WRITE) holder of the
    // old lock then always means a v1 caller, which the ledger records.
    bridgeFd = flockFd(cfg.legacyLock, { shared: true });
    if (bridgeFd == null) return { changed, result: "legacy" };
    const unit = `${cfg.unitPrefix}-${basename(t.worktree).replace(/[^A-Za-z0-9_.-]/g, "_")}-${id}`;
    holderUnit = `${cfg.supervisorPrefix}-hold-${id}`;
    Object.assign(t, { state: "running", admittedAt: now, express: mine.express, unit, holderUnit, supervisorUnit: `${cfg.supervisorPrefix}-${id}`, mode, hostAtAdmit: { nproc: host.nproc, memAvailableMiB: host.memAvailableMiB } });
    writeJsonAtomic(join(dir, "grant.json"), { ticket: id, unit, class: t.req.class, gpu: t.req.gpu, exclusive: t.req.exclusive, tokens: t.req.tokens, memMiB: t.req.memMiB, express: mine.express });
    return { changed: true, result: "admitted" };
  });
}

/** Records GPU clients outside any lease (a driver run outside the queue) in
 * the ledger, once per process. Every queued supervisor may do it; the state
 * keeps it to once a minute. */
function scanGpu(state, now) {
  state.gpuScanAt = now;
  const seen = new Set((state.gpuSeen ?? []).map((u) => `${u.pid}:${u.cmd}`));
  for (const u of gpuUsers(cfg, state)) {
    if (u.leased || seen.has(`${u.pid}:${u.cmd}`)) continue;
    ledger(cfg, { event: "unleased-gpu", pid: u.pid, cmd: u.cmd });
    seen.add(`${u.pid}:${u.cmd}`);
    state.gpuSeen = [...(state.gpuSeen ?? []), { pid: u.pid, cmd: u.cmd }].slice(-50);
  }
  return true;
}

// 3. Hand the admitted ticket to its holder, in its own scope, with the bridge
// lock inherited as fd 3 so it is held without a gap; the holder claims the
// ticket and owns the job's lifetime from here (holder.mjs).
const log = openSync(join(dir, "holder.log"), "a");
if (remote) {
  spawn("systemd-run", ["--user", "--scope", "--quiet", "--collect", `--unit=${holderUnit}`, "-p", "TimeoutStopSec=90s",
    process.execPath, join(here, "remote-holder.mjs"), id], { detached: true, stdio: ["ignore", log, log], env: process.env }).unref();
  process.exit(0);
}
spawn("systemd-run", ["--user", "--scope", "--quiet", "--collect", `--unit=${holderUnit}`, "-p", "TimeoutStopSec=60s",
  process.execPath, join(here, "holder.mjs"), id], { detached: true, stdio: ["ignore", log, log, bridgeFd], env: process.env }).unref();
process.exit(0);
