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
import {
  flockFd, jobDir, ledger, legacyLockInfo, loadConfig, readFileSafe, readJson,
  readMode, reconcile, sampleHost, self, transaction, writeJsonAtomic,
} from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
const cfg = loadConfig();
const dir = jobDir(cfg, id);
const request = readJson(join(dir, "request.json"));
if (!request) { console.error(`supervisor: no request for ${id}`); process.exit(2); }
const me = self();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } };

let bridgeFd = null, holderUnit = null;
process.on("SIGTERM", () => process.exit(0)); // cancelled while queued; `cancel` already cleaned up
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
    const unit = `${cfg.unitPrefix}-${basename(t.worktree).replace(/[^A-Za-z0-9_.-]/g, "_")}-${id}`;
    holderUnit = `${cfg.supervisorPrefix}-hold-${id}`;
    Object.assign(t, { state: "running", admittedAt: now, express: mine.express, unit, holderUnit, supervisorUnit: `${cfg.supervisorPrefix}-${id}`, mode, hostAtAdmit: { nproc: host.nproc, memAvailableMiB: host.memAvailableMiB } });
    writeJsonAtomic(join(dir, "grant.json"), { ticket: id, unit, class: t.req.class, gpu: t.req.gpu, exclusive: t.req.exclusive, tokens: t.req.tokens, memMiB: t.req.memMiB, express: mine.express });
    return { changed: true, result: "admitted" };
  });
}

// 3. Hand the admitted ticket to its holder, in its own scope, with the bridge
// lock inherited as fd 3 so it is held without a gap; the holder claims the
// ticket and owns the job's lifetime from here (holder.mjs).
const log = openSync(join(dir, "holder.log"), "a");
spawn("systemd-run", ["--user", "--scope", "--quiet", "--collect", `--unit=${holderUnit}`, "-p", "TimeoutStopSec=60s",
  process.execPath, join(here, "holder.mjs"), id], { detached: true, stdio: ["ignore", log, log, bridgeFd], env: process.env }).unref();
process.exit(0);
