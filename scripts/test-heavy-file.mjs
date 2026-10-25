// Preloaded into each heavy test file's process, and through NODE_OPTIONS into every
// node process it starts (scripts/test-tier.mjs). On exit each writes
// $SILTWAKE_HEAVY_FILE_STATS.<pid>.<thread>: its CPU time, peak RSS and build-cache use,
// and a tripwire for control reuse (STEW-3 R3): the modules it loaded, the files it read
// or copied from, the files and directories it newly created, the processes and worker
// threads it started, and any access this can't follow (a FileHandle, a native addon, a
// module that isn't a file). It sees only these JavaScript paths, so it can only ever
// make a row ineligible as a control, never prove its inputs complete; a file is a control
// only by the audited opt-in in tests/heavy-inputs.json. Worker threads don't run
// NODE_OPTIONS preloads, so a worker never reports and its file's cache use stays unknown.
import cp from "node:child_process";
import fs from "node:fs";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import wt, { Worker, threadId } from "node:worker_threads";

const out = process.env.SILTWAKE_HEAVY_FILE_STATS;
if (out && !globalThis.__siltwakeHeavyFileStats) {
  const seen = globalThis.__siltwakeHeavyFileStats = { loads: new Set(), reads: new Set(), created: new Set(), spawned: [], workers: [], untraced: new Set() };
  const abs = (p) => { try { return resolve(String(p instanceof URL ? fileURLToPath(p) : p)); } catch { return null; } };
  const isPath = (p) => typeof p === "string" || p instanceof URL || Buffer.isBuffer(p);
  const read = (p) => { if (isPath(p)) { const a = abs(p); if (a) seen.reads.add(a); } };

  registerHooks({ load(url, context, next) {
    if (url.startsWith("file:")) seen.loads.add(fileURLToPath(url));
    else if (!url.startsWith("node:")) seen.untraced.add(`a module from a ${url.slice(0, url.indexOf(":") + 1)} URL`);
    return next(url, context);
  } });

  // Reads, and copy and rename sources, are inputs, whatever happens to the path later.
  const before = (obj, name, f) => { const g = obj[name]; if (typeof g === "function") obj[name] = function (...a) { f(a); return g.apply(this, a); }; };
  for (const n of ["readFileSync", "readFile", "createReadStream"]) before(fs, n, (a) => read(a[0]));
  before(fs.promises, "readFile", (a) => read(a[0]));
  for (const n of ["copyFileSync", "copyFile", "cpSync", "cp", "renameSync", "rename", "linkSync", "link"]) before(fs, n, (a) => read(a[0]));
  for (const n of ["copyFile", "cp", "rename", "link"]) before(fs.promises, n, (a) => read(a[0]));
  // A path counts as created only when this call made it new and succeeded: a file that
  // existed before is never the test's own, and a failed (or wx-refused) write marks nothing.
  const creating = (obj, name, argIndex) => {
    const g = obj[name];
    if (typeof g !== "function") return;
    obj[name] = function (...a) {
      const p = isPath(a[argIndex]) ? abs(a[argIndex]) : null, fresh = p && !fs.existsSync(p);
      const r = g.apply(this, a);
      const mark = () => { if (fresh && fs.existsSync(p)) seen.created.add(p); };
      if (r && typeof r.then === "function") return r.then((v) => { mark(); return v; });
      if (typeof a.at(-1) === "function") return r; // callback form: never marks (conservative)
      mark();
      return r;
    };
  };
  for (const n of ["writeFileSync", "appendFileSync", "mkdirSync"]) creating(fs, n, 0);
  for (const n of ["copyFileSync", "cpSync", "renameSync", "symlinkSync", "linkSync"]) creating(fs, n, 1);
  for (const n of ["writeFile", "appendFile", "mkdir"]) creating(fs.promises, n, 0);
  const temp = fs.mkdtempSync;
  fs.mkdtempSync = function (...a) { const dir = temp.apply(this, a); seen.created.add(abs(dir)); return dir; };
  // Opened descriptors: a read-only open is a read; FileHandles and opens for writing aren't followed.
  before(fs, "openSync", (a) => { const flags = a[1] ?? "r"; if (flags === "r" || flags === 0) read(a[0]); else seen.untraced.add("a file opened for writing by descriptor"); });
  before(fs, "open", () => seen.untraced.add("fs.open (a callback descriptor)"));
  before(fs.promises, "open", () => seen.untraced.add("a FileHandle (fs.promises.open)"));
  before(process, "dlopen", () => seen.untraced.add("a native addon"));

  // Children: each started process, by pid and program, to match against the reports.
  const child = (cmd, r) => { seen.spawned.push({ pid: r?.pid ?? null, cmd: String(cmd).split("/").pop() }); return r; };
  for (const n of ["spawn", "execFile", "fork"]) { const g = cp[n]; cp[n] = function (cmd, ...a) { return child(n === "fork" ? process.execPath : cmd, g.call(this, cmd, ...a)); }; }
  for (const n of ["spawnSync", "execFileSync"]) {
    const g = cp[n];
    cp[n] = function (cmd, ...a) {
      try { const r = g.call(this, cmd, ...a); child(cmd, r && typeof r === "object" ? r : null); return r; }
      catch (e) { child(cmd, e); throw e; }
    };
  }
  for (const n of ["exec", "execSync"]) before(cp, n, () => seen.spawned.push({ pid: null, cmd: "sh" })); // a shell: never observed
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
        loads: [...seen.loads], reads: [...seen.reads], created: [...seen.created], spawned: seen.spawned, workers: seen.workers, untraced: [...seen.untraced],
      }));
    } catch { /* the stats are a report, never a reason to fail the file */ }
  });
}
