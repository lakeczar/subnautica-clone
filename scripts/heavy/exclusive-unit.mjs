#!/usr/bin/env node
// The exclusive slice's unit file (TST-16), for install.sh.
//
//   exclusive-unit.mjs write  SLICE DIR   make systemd's slice match the unit
//   exclusive-unit.mjs remove SLICE DIR   remove the unit
//
// Nothing external runs under the state lock (R9). When the file and systemd's
// own view of the slice already match, there is nothing to do. Otherwise:
// 1. Short transaction: refuse while a ticket runs, else set state.maintenance:
//    nothing is admitted (policy.mjs plan), queued tickets wait, status shows it.
// 2. Outside the lock: refuse if the slice holds processes (then clear the
//    mark), write or remove the file, daemon-reload, and verify that systemd's
//    properties (CPUWeight, CPUQuotaPerSecUSec, MemoryMax, MemorySwapMax) are
//    the unit's. Every systemctl call is bounded and checked.
// 3. Success: clear maintenance. Failure: leave it, with the reason; nothing
//    can run on stale settings, and rerunning install.sh is the recovery (it
//    verifies from scratch). No rollback.
// Reading the old file: only ENOENT means absent; any other error stops here.
// Exit 0 done (or nothing to do), 3 refused (busy), 4 incomplete (maintenance kept).
import { readFileSync, renameSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { sliceLimits } from "./policy.mjs";
import { loadConfig, self, systemctlBounded, transaction, unitPopulated } from "./state.mjs";

// Bounds: queries 10 s; the reload 120 s (outside the lock, with admission paused, so a slow
// manager costs only waiting time, never a failed submission).
const BOUND_MS = 10000, RELOAD_MS = 120000, RECOVER = "Recover: rerun scripts/heavy/install.sh";
const [action, slice, dir] = process.argv.slice(2);
if (!["write", "remove"].includes(action) || !slice || !dir) { console.error("usage: exclusive-unit.mjs write|remove SLICE DIR"); process.exit(2); }
const cfg = loadConfig(), file = `${dir}/${slice}`, verb = action === "write" ? "installed" : "removed";

const w = sliceLimits(availableParallelism(), cfg);
const want = action === "remove" ? null : ["[Unit]", "Description=Siltwake heavy-check exclusive jobs (TST-16): CPU priority while one runs", "",
  "[Slice]", "CPUAccounting=yes", "CPUWeight=10000", `CPUQuota=${w.cpuQuotaPct}%`, "MemoryAccounting=yes", `MemoryMax=${w.memoryMaxMiB}M`, "MemorySwapMax=0", ""].join("\n");
// systemd's view of the slice once the unit is in force (or gone).
const expected = action === "remove"
  ? { CPUWeight: "[not set]", CPUQuotaPerSecUSec: "infinity", MemoryMax: "infinity", MemorySwapMax: "infinity" }
  : { CPUWeight: "10000", CPUQuotaPerSecUSec: `${w.cpuQuotaPct / 100}s`, MemoryMax: String(w.memoryMaxMiB * 1048576), MemorySwapMax: "0" };

/** Whether systemd's own properties for the slice are the expected ones: { ok, why }. */
function managerMatches() {
  const r = systemctlBounded(BOUND_MS, "show", ...Object.keys(expected).flatMap((k) => ["-p", k]), slice);
  if (!r.ok) return { ok: false, why: `systemd could not be asked (${r.error})` };
  const got = Object.fromEntries(r.out.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  const off = Object.keys(expected).filter((k) => got[k] !== expected[k]).map((k) => `${k} ${got[k] ?? "?"} (wants ${expected[k]})`);
  return off.length ? { ok: false, why: `systemd's slice has ${off.join(", ")}` } : { ok: true };
}
const maintenance = (reason) => transaction(cfg, (state) => { state.maintenance = { since: state.maintenance?.since ?? Date.now(), by: self(), reason, recover: RECOVER }; return { changed: true }; });
const clear = () => transaction(cfg, (state) => { if (!state.maintenance) return {}; delete state.maintenance; return { changed: true }; });
const incomplete = (why) => {
  maintenance(`unit update incomplete: ${why}; rerun install.sh`);
  console.error(`not ${verb}: ${why}. The queue admits nothing until this is done (heavy-check status shows it); ${RECOVER}`);
  process.exit(4);
};

let current;
try { current = readFileSync(file, "utf8"); } catch (e) {
  if (e.code === "ENOENT") current = null; else incomplete(`could not read ${file} (${e.code ?? e.message})`);
}
const now = managerMatches();
if (current === want && now.ok) { clear(); process.exit(0); } // already in force (a rerun after a failure clears the mark)

// 1. Pause admission (a short transaction), unless a ticket runs.
const why = unitPopulated(slice, { timeoutMs: BOUND_MS }) ? `${slice} holds processes, or that could not be established` : transaction(cfg, (state) => {
  const running = Object.entries(state.tickets ?? {}).filter(([, t]) => t.state === "running").map(([id]) => id);
  if (running.length) return { result: `tickets ${running.join(", ")} are running` };
  state.maintenance = { since: state.maintenance?.since ?? Date.now(), by: self(), reason: `exclusive unit update (${action})`, recover: RECOVER };
  return { changed: true, result: null };
});
if (why) { console.error(`not ${verb}: ${slice} would change while ${why}; rerun when the queue is idle`); process.exit(3); }
// Nothing can be admitted now: the slice must still be empty.
if (unitPopulated(slice, { timeoutMs: BOUND_MS })) { clear(); console.error(`not ${verb}: ${slice} holds processes, or that could not be established; rerun when the queue is idle`); process.exit(3); }

// 2. The update, outside the lock.
try {
  if (want == null) rmSync(file, { force: true });
  else if (current !== want) { mkdirSync(dir, { recursive: true }); writeFileSync(`${file}.tmp`, want); renameSync(`${file}.tmp`, file); }
} catch (e) { incomplete(`could not write ${file} (${e.code ?? e.message})`); }
const reload = systemctlBounded(RELOAD_MS, "daemon-reload");
if (!reload.ok) incomplete(`systemd's reload failed (${reload.error})`);
const after = managerMatches();
if (!after.ok) incomplete(after.why);

// 3. Done: admission resumes.
clear();
console.log(`${verb} ${slice} (${dir})`);
