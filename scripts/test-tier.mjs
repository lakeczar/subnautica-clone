#!/usr/bin/env node
// Runs one test tier from the compiled `.test-build/tests`.
//
//   node scripts/test-tier.mjs fast  [files...]   every *.test.js except *.heavy.test.js
//   node scripts/test-tier.mjs heavy [files...]   every *.heavy.test.js, contained per file
//
// Classification rule: a test file that reaches `@babylonjs` through its imports
// is heavy and must be named `*.heavy.test.ts`. The fast tier enforces it twice:
// before running, a static scan of each fast-named file's import graph refuses
// with the import chain; while running, scripts/fast-guard.mjs fails any fast test
// process that resolves a Babylon module (computed or otherwise hidden imports).
// Other expensive suites may opt into the heavy tier by name.
//
// Every fast file is held to a time budget: its main-thread CPU time, less any
// time spent filling the build cache. Over FAST_FILE_WARN_S (5 s) the tier warns;
// over FAST_FILE_BUDGET_S (10 s) it fails, so the fast tier stays fast. The gap
// is headroom: on the shared VM, CPU time per file inflates up to about 1.8x
// under load. A file over budget gets cheaper (share fixtures, shrink grids or
// durations the assertion does not need) or moves its expensive tests to a
// `*.heavy.test.ts` file and keeps a fast smoke check. SILTWAKE_FAST_FILE_WARN_S
// and SILTWAKE_FAST_FILE_BUDGET_S override them (0 turns a check off). The
// per-file table is written to .test-build/fast-timing.json.
//
// Both tiers preload scripts/test-build-cache.mjs, a disk cache of expensive
// deterministic world data (see src/content/buildCache.ts).
//
// Heavy files run each in its own `node --test --test-isolation=none` process.
// Budgets in tests/heavy-budgets.json (MiB per file, with a default) cover the
// file's whole process tree, children included, and are enforced per file by
// scripts/heavy-containment.mjs: in a delegated scope, a child cgroup per file
// (files share a pool of up to three, within three quarters of the job's
// memory, at most 4.5 GiB); otherwise one file at a time with its process group
// watched. Files listed under `exclusive` there assert elapsed time and run
// alone. The heavy tier runs only inside scripts/heavy-check.sh (which sets
// SILTWAKE_HEAVY_LOCK_HELD); `npm run test:heavy` does that.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { grantedMemoryMiB, heavyContainment } from "./heavy-containment.mjs";
import { pruneBuildCache } from "./test-build-cache.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(root, ".test-build");
const testDir = join(build, "tests");
// One core is left for the runner and the rest of the shared VM. Fast files peak
// at a few hundred MiB (see the timing report), well inside FAST_HEAP_MIB each.
const FAST_CONCURRENCY = Math.max(2, Math.min(5, availableParallelism() - 1));
const FAST_HEAP_MIB = 1024;
const FAST_FILE_WARN_S = Number(process.env.SILTWAKE_FAST_FILE_WARN_S ?? 5);
const FAST_FILE_BUDGET_S = Number(process.env.SILTWAKE_FAST_FILE_BUDGET_S ?? 10);
const ESCAPE_RE = /\bworker_threads\b|\bnew\s+Worker\s*\(|\bchild_process\b|["'](?:node:)?vm["']|(?<![\w.])eval\s*\(|\bnew\s+Function\s*\(/g;

const [tier, ...requested] = process.argv.slice(2);
if (tier !== "fast" && tier !== "heavy") {
  console.error("usage: node scripts/test-tier.mjs fast|heavy [compiled test files...]");
  process.exit(2);
}
if (!existsSync(testDir)) {
  console.error("test-tier: .test-build/tests is missing; run `tsc -p tsconfig.test.json` first");
  process.exit(2);
}
const isHeavy = (file) => file.endsWith(".heavy.test.js");
const all = readdirSync(testDir).filter((f) => f.endsWith(".test.js")).sort().map((f) => join(testDir, f));
const files = requested.length ? requested.map((f) => resolve(f)) : all.filter((f) => isHeavy(f) === (tier === "heavy"));

/** Static import graph of the compiled JS. The app-loader substitution applies
 * only to entries that register it, so only a mocked renderer is exempt. */
async function babylonChains(entries) {
  const loader = existsSync(join(testDir, "app-loader.js"))
    ? (await import(pathToFileURL(join(testDir, "app-loader.js")).href)).resolve : null;
  const next = (specifier, context) => ({ url: specifier.startsWith(".") ? new URL(specifier, context.parentURL).href : `bare:${specifier}` });
  const importRe = /(?:^|[\s;])(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|[\s;])import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  const registersLoader = /register\(\s*["'][^"']*app-loader\.js["']/;
  const graphs = { mocked: new Map(), real: new Map() };
  const imports = (url, mocked) => {
    const graph = graphs[mocked ? "mocked" : "real"];
    if (!graph.has(url)) {
      const text = readFileSync(fileURLToPath(url), "utf8");
      graph.set(url, [...text.matchAll(importRe)].map((m) => {
        const specifier = m[1] ?? m[2] ?? m[3], context = { parentURL: url };
        return (mocked && loader ? loader(specifier, context, next) : next(specifier, context)).url;
      }));
    }
    return graph.get(url);
  };
  const found = new Map();
  for (const entry of entries) {
    const mocked = registersLoader.test(readFileSync(entry, "utf8"));
    const start = pathToFileURL(entry).href, parent = new Map([[start, null]]), queue = [start];
    while (queue.length) {
      const url = queue.shift();
      if (url.startsWith("bare:@babylonjs")) {
        const chain = [];
        for (let u = url; u; u = parent.get(u)) chain.unshift(u.startsWith("bare:") ? u.slice(5) : relative(build, fileURLToPath(u)));
        found.set(entry, chain);
        break;
      }
      if (url.startsWith("bare:") || !url.startsWith("file:") || !url.endsWith(".js")) continue;
      for (const child of imports(url, mocked)) if (!parent.has(child)) { parent.set(child, url); queue.push(child); }
    }
  }
  return found;
}

function run(command, args, options = {}) {
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: "inherit", cwd: root, ...options });
    child.on("exit", (code, signal) => done({ code, signal, child }));
    options.onSpawn?.(child);
  });
}

if (tier === "fast") {
  const named = files.filter(isHeavy);
  if (named.length) {
    console.error(`test-tier: heavy files run only in the heavy tier: ${named.map((f) => basename(f)).join(", ")}`);
    process.exit(2);
  }
  // Code that runs outside this process or its module graph escapes both guards,
  // so fast test files may not spawn workers, child processes or evaluated code
  // unless a comment states why: `// test-tier: allow-escape <reason>`.
  const escapes = files.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    if (/\/\/ test-tier: allow-escape \S/.test(text)) return [];
    const found = [...new Set([...text.matchAll(ESCAPE_RE)].map((m) => m[0].replace(/\s+/g, " ")))];
    return found.length ? [[file, found]] : [];
  });
  if (escapes.length) {
    for (const [file, found] of escapes)
      console.error(`test-tier: ${relative(build, file)} uses ${found.join(", ")}, which the fast-tier Babylon guard cannot see into. ` +
        "Move it to a *.heavy.test.ts file, or add `// test-tier: allow-escape <reason>` if it cannot load Babylon.");
    process.exit(1);
  }
  const misplaced = await babylonChains(files.filter((f) => !isHeavy(f)));
  if (misplaced.size) {
    for (const [file, chain] of misplaced) {
      const name = basename(file).replace(/\.test\.js$/, "");
      console.error(`test-tier: ${relative(build, file)} reaches Babylon (${chain.join(" -> ")}).`);
      console.error(`  Rename tests/${name}.test.ts to tests/${name}.heavy.test.ts, or remove the Babylon import.`);
    }
    process.exit(1);
  }
  pruneBuildCache();
  const started = Date.now(), scratch = mkdtempSync(join(tmpdir(), "siltwake-fast-")), timingLog = join(scratch, "timing.jsonl");
  // Each fast test process gets a 1 GiB V8 heap: a runaway assertion diff fails
  // that file quickly instead of exhausting the shared VM. Fast tests hold no
  // Babylon buffers, so the heap is their memory.
  // Every fast test process preloads the Babylon guard, the build cache and the
  // per-file timing report.
  const imports = ["fast-guard.mjs", "test-build-cache.mjs", "test-file-timing.mjs"]
    .map((m) => `--import=${pathToFileURL(join(root, "scripts", m)).href}`).join(" ");
  const { code } = await run(process.execPath, ["--test", `--test-concurrency=${FAST_CONCURRENCY}`, ...files],
    { env: { ...process.env, SILTWAKE_FILE_TIMING_LOG: timingLog,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=${FAST_HEAP_MIB} ${imports}`.trim() } });
  const timings = existsSync(timingLog) ? readFileSync(timingLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .filter((t) => files.includes(t.file)) : [];
  rmSync(scratch, { recursive: true, force: true });
  // The whole table, for finding what to make cheaper.
  writeFileSync(process.env.SILTWAKE_FAST_TIMING_JSON || join(build, "fast-timing.json"), JSON.stringify(timings.map((t) => ({ ...t, file: basename(t.file) })), null, 1));
  const charged = (t) => Math.max(0, (t.threadMs ?? t.cpuMs) - t.fillMs) / 1000;
  timings.sort((a, b) => charged(b) - charged(a));
  console.log(`\ntest:fast slowest files (main-thread CPU s, less build-cache fills; warn ${FAST_FILE_WARN_S || "off"} s, ` +
    `fail ${FAST_FILE_BUDGET_S || "off"} s; every file in .test-build/fast-timing.json)`);
  for (const t of timings.slice(0, 8))
    console.log(`  ${basename(t.file).padEnd(44)} ${charged(t).toFixed(1).padStart(5)} s cpu ${(t.wallMs / 1000).toFixed(1).padStart(6)} s wall` +
      `${t.fillMs ? ` (+${(t.fillMs / 1000).toFixed(1)} s cache fill)` : ""} ${String(t.maxRssMiB).padStart(5)} MiB`);
  const over = FAST_FILE_BUDGET_S > 0 ? timings.filter((t) => charged(t) > FAST_FILE_BUDGET_S) : [];
  const near = FAST_FILE_WARN_S > 0 ? timings.filter((t) => charged(t) > FAST_FILE_WARN_S && !over.includes(t)) : [];
  for (const t of near)
    console.warn(`test-tier: warning: ${basename(t.file)} used ${charged(t).toFixed(1)} s CPU, over the ${FAST_FILE_WARN_S} s fast-file target ` +
      `(it fails at ${FAST_FILE_BUDGET_S} s). Make it cheaper, or move its expensive tests to a *.heavy.test.ts file.`);
  for (const t of over)
    console.error(`test-tier: ${basename(t.file)} used ${charged(t).toFixed(1)} s CPU, over the ${FAST_FILE_BUDGET_S} s fast-file budget. ` +
      "Make it cheaper, or move its expensive tests to a *.heavy.test.ts file and keep a fast smoke check.");
  const cpu = timings.reduce((s, t) => s + t.cpuMs, 0) / 1000;
  console.log(`test:fast ${files.length} files in ${((Date.now() - started) / 1000).toFixed(1)} s (${cpu.toFixed(0)} s CPU, concurrency ${FAST_CONCURRENCY})`);
  process.exit(code !== 0 ? code ?? 1 : over.length ? 1 : 0);
}

// Heavy tier.
if (!process.env.SILTWAKE_HEAVY_LOCK_HELD) {
  console.error("test-tier: the heavy tier runs under the shared lock. Use `npm run test:heavy`, or wrap it in scripts/heavy-check.sh.");
  process.exit(2);
}
const budgets = JSON.parse(readFileSync(join(root, "tests", "heavy-budgets.json"), "utf8"));
// SILTWAKE_HEAVY_BUDGET_MIB overrides every budget, e.g. to check that containment fires.
const budgetMiB = (file) => Number(process.env.SILTWAKE_HEAVY_BUDGET_MIB) ||
  (budgets.files?.[basename(file).replace(/\.js$/, ".ts")] ?? budgets.defaultMiB);
// Files whose tests assert elapsed time run with no other heavy file beside them.
const exclusive = new Set(budgets.exclusive ?? []);
const isExclusive = (file) => exclusive.has(basename(file).replace(/\.js$/, ".ts"));
const containment = heavyContainment();
// The pool follows the job's grant: SCHED-1 exports SILTWAKE_JOB_CPUS, and the
// scope's memory.max bounds the budgets reserved at once (three quarters of it,
// at most 4.5 GiB). Without per-file cgroups files never share (see heavy-containment.mjs).
const jobCpus = Number(process.env.SILTWAKE_JOB_CPUS) || 0;
const concurrency = !containment.shares ? 1 : Number(process.env.SILTWAKE_HEAVY_CONCURRENCY) || (jobCpus ? Math.max(1, Math.min(3, jobCpus)) : 3);
const poolMiB = Number(process.env.SILTWAKE_HEAVY_POOL_MIB) || Math.min(4608, Math.floor(grantedMemoryMiB() * 0.75));
const scratch = mkdtempSync(join(tmpdir(), "siltwake-heavy-"));
const cacheModule = pathToFileURL(join(root, "scripts", "test-build-cache.mjs")).href;
const rows = [];
let failed = false;
/** Inside a heavy-check job: a file's test output, though held back until the
 * file ends, is progress, so it beats the job's stall-detection heartbeat
 * (SCHED-2). A hung file prints nothing and stops beating. */
let lastBeat = 0;
function heartbeat() {
  const file = process.env.SILTWAKE_JOB_HEARTBEAT;
  if (!file || Date.now() - lastBeat < 5000) return;
  lastBeat = Date.now();
  try { writeFileSync(file, ""); } catch { /* the queue's concern, not the tier's */ }
}
/** One heavy file and its whole process tree, contained at its budget; output held until it ends. */
function runHeavy(file) {
  const budget = budgetMiB(file), started = Date.now();
  const run = containment.start(process.execPath,
    ["--import", cacheModule, "--test", "--test-isolation=none", "--test-reporter=spec", file],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: process.env }, budget);
  const output = [];
  run.child.stdout.on("data", (d) => { output.push(d); heartbeat(); });
  run.child.stderr.on("data", (d) => { output.push(d); heartbeat(); });
  return new Promise((done) => {
    let exited = null, result = null;
    // Teardown starts when the file's process exits, not when its pipes close: a
    // straggler that inherited stdout or stderr would hold them open, and only
    // tearing down the file's tree (which kills it) lets them close.
    run.child.once("exit", (code, signal) => {
      exited = { code, signal, seconds: (Date.now() - started) / 1000 };
      result = run.finish();
      // A descendant outside the tree (one that left the fallback's process group)
      // can still hold a pipe: stop waiting for it.
      setTimeout(() => { run.child.stdout.destroy(); run.child.stderr.destroy(); }, 5000).unref();
    });
    run.child.once("close", () => {
      process.stdout.write(`\n--- ${basename(file)}\n${Buffer.concat(output).toString()}`);
      const { code, signal, seconds } = exited, { peakMiB, killed } = result;
      const status = killed ? "KILLED (over budget)" : code === 0 ? "ok" : `FAIL (exit ${code ?? signal})`;
      if (status !== "ok") failed = true;
      rows.push({ file: basename(file), seconds, peakMiB, budget, status });
      if (killed) console.error(`test-tier: ${basename(file)} went over its ${budget} MiB budget (whole process tree).`);
      done();
    });
  });
}
// Files run side by side while their budgets together fit the pool (largest
// first; a file larger than the pool, or an exclusive one, runs alone).
const started = Date.now(), queue = [...files].sort((a, b) => budgetMiB(b) - budgetMiB(a)), running = new Map();
let reserved = 0;
while (queue.length || running.size) {
  const alone = [...running.values()].some(isExclusive);
  const next = alone ? -1 : queue.findIndex((f) => running.size === 0 ||
    (!isExclusive(f) && running.size < concurrency && reserved + budgetMiB(f) <= poolMiB));
  if (next >= 0) {
    const [file] = queue.splice(next, 1), budget = budgetMiB(file);
    reserved += budget;
    const job = runHeavy(file).then(() => { running.delete(job); reserved -= budget; });
    running.set(job, file);
    continue;
  }
  await Promise.race(running.keys());
}
rmSync(scratch, { recursive: true, force: true });
console.log(`\ntest:heavy summary (peak: the file's whole process tree, ${containment.kind} containment)`);
for (const r of rows)
  console.log(`  ${r.file.padEnd(36)} ${r.seconds.toFixed(1).padStart(6)} s  peak ${String(r.peakMiB).padStart(5)} MiB / ${r.budget} MiB  ${r.status}`);
console.log(`  total ${rows.reduce((t, r) => t + r.seconds, 0).toFixed(1)} s of file time in ${((Date.now() - started) / 1000).toFixed(1)} s ` +
  `(up to ${concurrency} files within ${poolMiB} MiB of budgets at once)`);
process.exit(failed ? 1 : 0);
