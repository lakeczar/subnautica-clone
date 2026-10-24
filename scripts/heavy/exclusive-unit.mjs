#!/usr/bin/env node
// The exclusive slice's unit file (TST-16), for install.sh.
//
//   exclusive-unit.mjs write  SLICE DIR   make systemd's slice match the unit
//   exclusive-unit.mjs remove SLICE DIR   remove the unit
//
// One operation at a time, and nothing external under the admission lock:
// 1. The installer lock (<state>/install.lock, flock): install.sh takes it for
//    its whole run, publication included, and hands it down as an open fd
//    (SILTWAKE_INSTALL_LOCK_FD). This checks that the fd is that file and that
//    it holds the lock; it takes no lock of its own. The lock ends with the
//    last process holding the fd, so a dead installer releases it.
// 2. A short transaction: refuse while a ticket runs (nothing paused); else set
//    state.maintenance with this operation's identity (pid and a nonce). Then
//    nothing is admitted (policy.mjs plan), queued tickets wait, and status
//    shows it. A mark left by a dead operation is taken over: rerunning is the
//    recovery.
// 3. Outside the admission lock: read the file (only ENOENT is absent), refuse
//    if the slice holds processes, write or remove the file, daemon-reload
//    (skipped only when the file is unchanged and systemd already matches),
//    and verify systemd's own properties (CPUWeight, CPUQuotaPerSecUSec,
//    MemoryMax, MemorySwapMax). Every call has a hard deadline: queries are
//    killed at 10 s; the reload gets TERM at 120 s, KILL 5 s later, and is
//    waited for.
// 4. Only this operation's own verified result clears its own mark. Any
//    failure after step 2 keeps it, with the reason and the recovery command;
//    nothing can run on stale settings, and rerunning install.sh recovers.
// Exit 0 done, 3 refused (busy; nothing paused), 4 incomplete (maintenance kept).
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fstatSync, readFileSync, renameSync, rmSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { sliceLimits } from "./policy.mjs";
import { alive, ensureDirs, loadConfig, self, systemctlBounded, transaction, unitPopulation } from "./state.mjs";

const QUERY_MS = 10000, GRACE_MS = 5000, RECOVER = "Recover: rerun scripts/heavy/install.sh";
const [action, slice, dir] = process.argv.slice(2);
if (!["write", "remove"].includes(action) || !slice || !dir) { console.error("usage: exclusive-unit.mjs write|remove SLICE DIR"); process.exit(2); }
const cfg = loadConfig(), file = `${dir}/${slice}`, verb = action === "write" ? "installed" : "removed";
// The reload's deadline; private state (tests) may shorten it.
const RELOAD_MS = !cfg.production && process.env.SILTWAKE_EXCLUSIVE_RELOAD_MS ? Number(process.env.SILTWAKE_EXCLUSIVE_RELOAD_MS) : 120000;

const w = sliceLimits(availableParallelism(), cfg);
const want = action === "remove" ? null : ["[Unit]", "Description=Siltwake heavy-check exclusive jobs (TST-16): CPU priority while one runs", "",
  "[Slice]", "CPUAccounting=yes", "CPUWeight=10000", `CPUQuota=${w.cpuQuotaPct}%`, "MemoryAccounting=yes", `MemoryMax=${w.memoryMaxMiB}M`, "MemorySwapMax=0", ""].join("\n");
const expected = action === "remove"
  ? { CPUWeight: "[not set]", CPUQuotaPerSecUSec: "infinity", MemoryMax: "infinity", MemorySwapMax: "infinity" }
  : { CPUWeight: "10000", CPUQuotaPerSecUSec: `${w.cpuQuotaPct / 100}s`, MemoryMax: String(w.memoryMaxMiB * 1048576), MemorySwapMax: "0" };

// 1. One installer at a time: install.sh's lock, checked, never a second one.
ensureDirs(cfg);
const lockFd = Number(process.env.SILTWAKE_INSTALL_LOCK_FD), lockPath = join(cfg.dir, "install.lock");
const holdsLock = () => {
  try { const a = fstatSync(lockFd), b = statSync(lockPath); if (a.dev !== b.dev || a.ino !== b.ino) return false; } catch { return false; }
  return spawnSync("flock", ["-n", "3"], { stdio: ["ignore", "ignore", "inherit", lockFd] }).status === 0; // our own open file: succeeds only if no one else holds it
};
if (!Number.isInteger(lockFd) || !holdsLock()) { console.error(`not ${verb}: exclusive-unit.mjs runs only under install.sh's installer lock (${lockPath})`); process.exit(2); }

// 2. Pause admission, with this operation's identity.
const op = randomBytes(8).toString("hex"), me = self();
const refused = transaction(cfg, (state) => {
  const running = Object.entries(state.tickets ?? {}).filter(([, t]) => t.state === "running").map(([id]) => id);
  if (running.length) return { result: `tickets ${running.join(", ")} are running` };
  const m = state.maintenance;
  if (m && m.op !== op && alive(m.by)) return { result: `pid ${m.by.pid} holds the queue's maintenance (${m.reason})` };
  state.maintenance = { op, by: me, since: m?.since ?? Date.now(), reason: `exclusive unit update (${action})${m ? `, taking over ${m.reason}` : ""}`, recover: RECOVER };
  return { changed: true, result: null };
});
if (refused) { console.error(`not ${verb}: ${slice} would change while ${refused}; rerun when the queue is idle`); process.exit(3); }

/** Keeps this operation's mark, with why, and exits 4. */
const incomplete = (why) => {
  transaction(cfg, (state) => { if (state.maintenance?.op !== op) return {}; state.maintenance.reason = `unit update incomplete: ${why}; rerun install.sh`; return { changed: true }; });
  console.error(`not ${verb}: ${why}. The queue admits nothing until this is done (heavy-check status shows it); ${RECOVER}`);
  process.exit(4);
};
/** systemd's own properties for the slice against `expected`: { ok, why }. */
function managerMatches() {
  const r = systemctlBounded(QUERY_MS, "show", ...Object.keys(expected).flatMap((k) => ["-p", k]), slice);
  if (!r.ok) return { ok: false, why: `systemd could not be asked (${r.error})` };
  const got = Object.fromEntries(r.out.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  const off = Object.keys(expected).filter((k) => got[k] !== expected[k]).map((k) => `${k} ${got[k] ?? "?"} (wants ${expected[k]})`);
  return off.length ? { ok: false, why: `systemd's slice has ${off.join(", ")}` } : { ok: true };
}
/** The reload with a hard deadline: TERM, then KILL after a grace, waited for. { ok, why }. */
function reload() {
  return new Promise((done) => {
    const child = spawn("systemctl", ["--user", "daemon-reload"], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "", late = null;
    child.stderr.on("data", (x) => { err += x; });
    const term = setTimeout(() => { late = "TERM"; child.kill("SIGTERM"); }, RELOAD_MS);
    const kill = setTimeout(() => { late = "KILL"; child.kill("SIGKILL"); }, RELOAD_MS + GRACE_MS);
    child.on("error", (e) => { clearTimeout(term); clearTimeout(kill); done({ ok: false, why: e.message }); });
    child.on("exit", (code, signal) => {
      clearTimeout(term); clearTimeout(kill);
      if (late) done({ ok: false, why: `systemd's reload overran ${RELOAD_MS / 1000} s and was stopped (${late === "KILL" ? "killed" : "terminated"})` });
      else done(code === 0 && !signal ? { ok: true } : { ok: false, why: `systemd's reload failed (${(err.trim() || `exit ${code ?? signal}`).slice(0, 200)})` });
    });
  });
}

// 3. The update, outside the admission lock.
let current;
try { current = readFileSync(file, "utf8"); } catch (e) { if (e.code === "ENOENT") current = null; else incomplete(`could not read ${file} (${e.code ?? e.message})`); }
const busy = unitPopulation(slice, { timeoutMs: QUERY_MS });
if (busy !== false) incomplete(busy === true ? `${slice} holds processes` : `${slice}: ${busy}`);
const changed = current !== want || !managerMatches().ok;
if (changed) {
  try {
    if (want == null) rmSync(file, { force: true });
    else if (current !== want) { mkdirSync(dir, { recursive: true }); writeFileSync(`${file}.tmp`, want); renameSync(`${file}.tmp`, file); }
  } catch (e) { incomplete(`could not write ${file} (${e.code ?? e.message})`); }
  const r = await reload();
  if (!r.ok) incomplete(r.why);
}
const after = managerMatches();
if (!after.ok) incomplete(after.why);

// 4. This operation's verified result clears its own mark.
transaction(cfg, (state) => { if (state.maintenance?.op !== op) return {}; delete state.maintenance; return { changed: true }; });
console.log(changed ? `${verb} ${slice} (${dir})` : `${slice} unchanged; systemd verified`);
