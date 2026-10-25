// Preloaded into each heavy test file's process, and through NODE_OPTIONS into every
// node process and worker it starts (scripts/test-tier.mjs). On exit each one writes
// $SILTWAKE_HEAVY_FILE_STATS.<pid>.<thread>: its CPU time, peak RSS and build-cache
// use, and what the file's stored identity needs (STEW-3 R2):
// - the modules it loaded and the files it read (absolute paths), as observed;
// - the paths it created or wrote (a test's own scratch: not inputs);
// - the child processes and worker threads it started, so a descendant that never
//   reported (not node, or started without this preload) is known to be unobserved.
// The tier aggregates every report with the file's prefix; the prefix is per file, so
// concurrent files never mix. It records; it never changes what the test does.
import cp from "node:child_process";
import fs from "node:fs";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import wt, { Worker, threadId } from "node:worker_threads";

const out = process.env.SILTWAKE_HEAVY_FILE_STATS;
if (out && !globalThis.__siltwakeHeavyFileStats) {
  const seen = globalThis.__siltwakeHeavyFileStats = { loads: new Set(), reads: new Set(), produced: new Set(), spawned: [], workers: [] };
  const abs = (p) => { try { return resolve(String(p instanceof URL ? fileURLToPath(p) : p)); } catch { return null; } };
  const note = (set, p) => { if (typeof p === "string" || p instanceof URL || Buffer.isBuffer(p)) { const a = abs(p); if (a) set.add(a); } };

  registerHooks({ load(url, context, next) { if (url.startsWith("file:")) seen.loads.add(fileURLToPath(url)); return next(url, context); } });

  const wrap = (obj, name, before) => { const f = obj[name]; if (typeof f !== "function") return; obj[name] = function (...a) { before(a); return f.apply(this, a); }; };
  const read = (a) => note(seen.reads, a[0]), wrote = (a) => note(seen.produced, a[0]), dest = (a) => note(seen.produced, a[1]);
  const writeFlag = (flags) => typeof flags === "string" ? /[wa+]/.test(flags) : typeof flags === "number" && (flags & 3) !== 0;
  for (const n of ["readFileSync", "readFile", "createReadStream"]) wrap(fs, n, read);
  wrap(fs.promises, "readFile", read);
  for (const n of ["writeFileSync", "writeFile", "appendFileSync", "appendFile", "createWriteStream"]) wrap(fs, n, wrote);
  for (const n of ["writeFile", "appendFile"]) wrap(fs.promises, n, wrote);
  // A directory counts as the test's own only if this call made it: mkdir of an existing
  // directory (the repository's public/terrain, say) mustn't hide what was already in it.
  const made = (a) => { if (!fs.existsSync(a[0])) note(seen.produced, a[0]); };
  for (const n of ["mkdirSync", "mkdir"]) wrap(fs, n, made);
  wrap(fs.promises, "mkdir", made);
  for (const n of ["copyFileSync", "copyFile", "cpSync", "cp", "renameSync", "rename", "symlinkSync", "linkSync"]) wrap(fs, n, dest);
  for (const n of ["cpSync", "cp"]) wrap(fs, n, read); // the copy's source is read
  wrap(fs, "openSync", (a) => note(writeFlag(a[1]) ? seen.produced : seen.reads, a[0]));
  for (const n of ["mkdtempSync"]) { const f = fs[n]; fs[n] = function (...a) { const dir = f.apply(this, a); note(seen.produced, dir); return dir; }; }

  // Children: each started process, by pid and program, to match against the reports.
  const child = (cmd, r) => { if (r && r.pid) seen.spawned.push({ pid: r.pid, cmd: String(cmd).split("/").pop() }); return r; };
  for (const n of ["spawn", "execFile", "fork"]) { const f = cp[n]; cp[n] = function (cmd, ...a) { return child(n === "fork" ? process.execPath : cmd, f.call(this, cmd, ...a)); }; }
  for (const n of ["spawnSync", "execFileSync"]) {
    const f = cp[n];
    cp[n] = function (cmd, ...a) {
      // A sync child's pid is known only once it has ended, so it's noted even when it throws.
      try { const r = f.call(this, cmd, ...a); if (r && typeof r === "object" && r.pid) child(cmd, r); else seen.spawned.push({ pid: null, cmd: String(cmd).split("/").pop() }); return r; }
      catch (e) { seen.spawned.push({ pid: e?.pid ?? null, cmd: String(cmd).split("/").pop() }); throw e; }
    };
  }
  for (const n of ["exec", "execSync"]) wrap(cp, n, () => seen.spawned.push({ pid: null, cmd: "sh" })); // a shell: never observed
  // Workers: counted by thread id; a worker that loads this preload reports itself.
  wt.Worker = class extends Worker { constructor(...a) { super(...a); seen.workers.push(this.threadId); } };
  syncBuiltinESMExports();

  process.on("exit", () => {
    const u = process.cpuUsage(), cache = globalThis.__siltwakeBuildCacheStats ?? null;
    try {
      fs.writeFileSync(`${out}.${process.pid}.${threadId}`, JSON.stringify({
        pid: process.pid, ppid: process.ppid, threadId,
        cpuMs: Math.round((u.user + u.system) / 1000), maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
        // `store: false`: this process has no build-cache store, so its work never depends on the cache.
        store: Boolean(globalThis.__siltwakeBuildCache), cache: cache && { ...cache, fillMs: Math.round(globalThis.__siltwakeBuildCacheFillCpuMs ?? 0) },
        loads: [...seen.loads], reads: [...seen.reads], produced: [...seen.produced], spawned: seen.spawned, workers: seen.workers,
      }));
    } catch { /* the stats are a report, never a reason to fail the file */ }
  });
}
