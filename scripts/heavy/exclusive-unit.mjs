#!/usr/bin/env node
// The exclusive slice's unit file (TST-16), for install.sh: written or removed
// all-or-nothing, never under a measurement.
//
//   exclusive-unit.mjs write  SLICE DIR   write the unit if it differs
//   exclusive-unit.mjs remove SLICE DIR   remove it
//
// Inside one queue transaction (the lock admission takes): refuse while any
// ticket runs or the slice holds processes (or that can't be established;
// state.mjs unitPopulated, fail-closed, also with no unit file). Then the file
// changes and systemd reloads. Every systemctl call is bounded (10 s, well
// under the 30 s queue clients wait for the lock) and checked. If the reload
// fails or times out, the previous file is restored (a new one removed) and
// reloaded before the lock is released, so a retry starts clean and an
// unchanged file never stands for an unfinished reload (R8-F1, F2).
// Exit 0 done (or nothing to do), 3 refused (busy), 4 failed (restored).
import { readFileSync, renameSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { sliceLimits } from "./policy.mjs";
import { loadConfig, systemctlBounded, transaction, unitPopulated } from "./state.mjs";

const BOUND_MS = 10000;
const [action, slice, dir] = process.argv.slice(2);
if (!["write", "remove"].includes(action) || !slice || !dir) { console.error("usage: exclusive-unit.mjs write|remove SLICE DIR"); process.exit(2); }
const cfg = loadConfig(), file = `${dir}/${slice}`;
const read = () => { try { return readFileSync(file, "utf8"); } catch { return null; } };
const put = (text) => { if (text == null) rmSync(file, { force: true }); else { mkdirSync(dir, { recursive: true }); writeFileSync(`${file}.tmp`, text); renameSync(`${file}.tmp`, file); } };

let want = null;
if (action === "write") {
  const w = sliceLimits(availableParallelism(), cfg);
  want = ["[Unit]", "Description=Siltwake heavy-check exclusive jobs (TST-16): CPU priority while one runs", "",
    "[Slice]", "CPUAccounting=yes", "CPUWeight=10000", `CPUQuota=${w.cpuQuotaPct}%`, "MemoryAccounting=yes", `MemoryMax=${w.memoryMaxMiB}M`, "MemorySwapMax=0", ""].join("\n");
}
if (read() === want) process.exit(0); // nothing to change (remove: no file)

const out = transaction(cfg, (state) => {
  const running = Object.entries(state.tickets ?? {}).filter(([, t]) => t.state === "running").map(([id]) => id);
  if (running.length) return { result: { code: 3, why: `tickets ${running.join(", ")} are running` } };
  if (unitPopulated(slice, { timeoutMs: BOUND_MS })) return { result: { code: 3, why: `${slice} holds processes, or that could not be established` } };
  const before = read();
  put(want);
  const r = systemctlBounded(BOUND_MS, "daemon-reload");
  if (r.ok) return { result: { code: 0 } };
  put(before);
  const again = systemctlBounded(BOUND_MS, "daemon-reload");
  return { result: { code: 4, why: `systemd's reload failed (${r.error}); the previous unit file was restored${again.ok ? " and reloaded" : `, but reloading it failed too (${again.error})`}` } };
});
if (out.code === 3) { console.error(`not ${action === "write" ? "installed" : "removed"}: ${slice} would change while ${out.why}; rerun when the queue is idle`); process.exit(3); }
if (out.code === 4) { console.error(`not ${action === "write" ? "installed" : "removed"}: ${out.why}; nothing else was changed, rerun when systemd answers`); process.exit(4); }
console.log(`${action === "write" ? "installed" : "removed"} ${slice} (${dir})`);
