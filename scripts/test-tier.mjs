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
// watched. Files listed under `exclusive` there assert elapsed time: they run
// last, one at a time, in a timing phase of their own. The heavy tier runs only
// inside scripts/heavy-check.sh (which sets SILTWAKE_HEAVY_LOCK_HELD); `npm run
// test:heavy` does that.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, hostname, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { grantedMemoryMiB, heavyContainment } from "./heavy-containment.mjs";
import { guardLocalRun } from "./local-guard.mjs";
import { cacheRoot, closureHash, pruneBuildCache } from "./test-build-cache.mjs";
import { HARNESS, NEAR_PCT, RECORD_VERSION, attemptOf, cacheState, fileFacts, filesHash, machineLabel, recordLine, runtimeEnv, treeState, workloadSettings } from "./heavy-results.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(root, process.env.SILTWAKE_TEST_BUILD || ".test-build"); // test-build.mjs checks the name
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
// On factory-worker, only inside a heavy-check job (STEW-2). Routed, the job compiles
// first: on alickers there is no .test-build until it does.
guardLocalRun({ cls: tier === "heavy" ? "heavy-suite" : "standard", before: "node scripts/test-build.mjs" });
if (!existsSync(testDir)) {
  console.error(`test-tier: ${relative(root, testDir)} is missing; run \`node scripts/test-build.mjs\` first`);
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
  // The context every number below is read in (Measurement hygiene): recorded in the
  // summary and in fast-timing.json.
  const context = { at: new Date().toISOString(), ...treeState(root), machine: machineLabel(), node: process.version, heapMiBPerFile: FAST_HEAP_MIB,
    jobMemoryMiB: Number.isFinite(grantedMemoryMiB()) ? grantedMemoryMiB() : null, concurrency: FAST_CONCURRENCY, cache: cacheState(cacheRoot) };
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
  writeFileSync(process.env.SILTWAKE_FAST_TIMING_JSON || join(build, "fast-timing.json"),
    JSON.stringify({ context, files: timings.map((t) => ({ ...t, file: basename(t.file) })) }, null, 1));
  const charged = (t) => Math.max(0, (t.threadMs ?? t.cpuMs) - t.fillMs) / 1000;
  timings.sort((a, b) => charged(b) - charged(a));
  console.log(`\ntest:fast slowest files (main-thread CPU s, less build-cache fills; warn ${FAST_FILE_WARN_S || "off"} s, ` +
    `fail ${FAST_FILE_BUDGET_S || "off"} s; every file in .test-build/fast-timing.json)\n` +
    `  at ${String(context.commit).slice(0, 12)}${context.dirty ? " (uncommitted changes)" : ""} on ${context.machine}; V8 heap ${FAST_HEAP_MIB} MiB per file, ` +
    `job memory limit ${context.jobMemoryMiB ?? "none"} MiB, concurrency ${FAST_CONCURRENCY}; build cache ${context.cache.state} at the start (${context.cache.entries} entries)`);
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
// Budgets come from tests/heavy-budgets.json. Two variables replace them:
// SILTWAKE_HEAVY_BUDGETS names another budgets file (the tier's own tests classify probe
// files with it), and SILTWAKE_HEAVY_BUDGET_MIB overrides every budget (e.g. to check
// that containment fires). Either one is an override, and a run with an override is not
// budget evidence (WORKER_RESOURCE_LIMITS.md, "Measurement hygiene"; STEW-3 R1-1): a
// raised limit lets V8 grow its heap, so peaks inflate, and a budget over the pool runs
// every file alone. Its output and stored results say so.
const budgetsFile = process.env.SILTWAKE_HEAVY_BUDGETS || null;
const budgets = JSON.parse(readFileSync(budgetsFile || join(root, "tests", "heavy-budgets.json"), "utf8"));
const overrideMiB = Number(process.env.SILTWAKE_HEAVY_BUDGET_MIB) || null;
const override = overrideMiB || budgetsFile ? { budgetMiB: overrideMiB, budgetsFile } : null;
const NOT_EVIDENCE = override ? `NOT BUDGET EVIDENCE: ${[overrideMiB && `SILTWAKE_HEAVY_BUDGET_MIB=${overrideMiB} replaced every file's budget`,
  budgetsFile && `SILTWAKE_HEAVY_BUDGETS=${budgetsFile} replaced tests/heavy-budgets.json`].filter(Boolean).join(", and ")}, ` +
  "so these peaks aren't measured at the real budgets (V8 sizes its heap from the limit, and files may have run alone); measure at the real budgets." : null;
if (NOT_EVIDENCE) console.log(`test-tier: ${NOT_EVIDENCE}`);
const budgetMiB = (file) => overrideMiB || (budgets.files?.[basename(file).replace(/\.js$/, ".ts")] ?? budgets.defaultMiB);
// Files whose tests assert elapsed time (`exclusive` in heavy-budgets.json) run in a
// phase of their own after every other file, one at a time (STEW-2). A heavy file
// that reads a clock must say which kind it is, listed under `exclusive` or under
// `clockWithoutBound` (it only reports a time, or polls with a timeout), so a new
// timing bound can't run beside other files unnoticed. The scan covers the file and
// the test helpers it imports from its own directory, and these clock reads, aliased
// or imported forms included: Date.now, Date(), new Date with no argument,
// performance (perf_hooks), hrtime, CPU-usage clocks and console.time.
const tsName = (file) => basename(file).replace(/\.js$/, ".ts");
const timingFiles = new Set(budgets.exclusive ?? []), clockOnly = new Set(budgets.clockWithoutBound ?? []);
const isTiming = (file) => timingFiles.has(tsName(file));
const CLOCK_RE = new RegExp([
  String.raw`\bDate\s*\.\s*now\b`, String.raw`\bDate\s*\[`, String.raw`\bnew\s+Date\b(?!\s*\(\s*[^\s)])`, String.raw`(?<![\w.])Date\s*\(\s*\)`,
  String.raw`[=:(,]\s*Date\s*[;,)}]`, String.raw`\bperformance\s*[.\[]`, String.raw`\}\s*=\s*performance\b`, String.raw`=\s*performance\s*[;,]`,
  String.raw`\bperf_hooks\b`, String.raw`\bhrtime\b`, String.raw`\b(?:thread)?[cC]puUsage\b`, String.raw`\bresourceUsage\b`, String.raw`\bconsole\s*\.\s*time(?:End|Log)?\s*\(`,
].join("|"));
/** Whether `file`, or a helper it imports from its own directory (transitively), reads a clock. */
function readsClock(file, seen = new Set()) {
  if (seen.has(file)) return false;
  seen.add(file);
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return false; }
  if (CLOCK_RE.test(text)) return true;
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.\/[^"'/]+\.js)["']/g))
    if (readsClock(join(dirname(file), m[1]), seen)) return true;
  return false;
}
const unclassified = files.filter((f) => !isTiming(f) && !clockOnly.has(tsName(f)) && readsClock(f));
if (unclassified.length) {
  console.error(`test-tier: ${unclassified.map(tsName).join(", ")} read a clock (itself or through a helper). In tests/heavy-budgets.json, list each under ` +
    "`exclusive` if it asserts elapsed time (it then runs in the timing phase, alone), or under `clockWithoutBound` if it only reports one or polls with a timeout.");
  process.exit(2);
}
const containment = heavyContainment();
// The pool follows the job's grant: SCHED-1 exports SILTWAKE_JOB_CPUS, and the
// scope's memory.max bounds the budgets reserved at once (three quarters of it,
// at most 4.5 GiB). Without per-file cgroups files never share (see heavy-containment.mjs).
const jobCpus = Number(process.env.SILTWAKE_JOB_CPUS) || 0;
const concurrency = !containment.shares ? 1 : Number(process.env.SILTWAKE_HEAVY_CONCURRENCY) || (jobCpus ? Math.max(1, Math.min(3, jobCpus)) : 3);
const poolMiB = Number(process.env.SILTWAKE_HEAVY_POOL_MIB) || Math.min(4608, Math.floor(grantedMemoryMiB() * 0.75));
const scratch = mkdtempSync(join(tmpdir(), "siltwake-heavy-"));
const cacheModule = pathToFileURL(join(root, "scripts", "test-build-cache.mjs")).href;
const fileStatsModule = pathToFileURL(join(root, "scripts", "test-heavy-file.mjs")).href;
// The run's context, recorded with every number (STEW-3): the tree, the machine, the
// limits and the build cache as this run found them.
const heavyRun = {
  v: RECORD_VERSION, at: new Date().toISOString(), ...treeState(root), machine: machineLabel(), host: hostname(),
  ticket: process.env.SILTWAKE_JOB_TICKET || process.env.SILTWAKE_LANE_TICKET || null, node: process.version,
  containment: containment.kind, jobMemoryMiB: Number.isFinite(grantedMemoryMiB()) ? grantedMemoryMiB() : null, poolMiB, concurrency, jobCpus: jobCpus || null,
  cache: cacheState(cacheRoot), selection: requested.length ? { kind: "subset", files: files.length } : { kind: "full", files: files.length },
  override, budgetEvidence: !override,
  // Identity beyond each file's own closure: the dependencies, and the harness that measures.
  lockHash: filesHash(root, ["package-lock.json"]), harnessHash: closureHash(HARNESS.map((f) => pathToFileURL(join(root, f)).href), undefined, root),
  // The attempt of the queue ticket this run is (R2-5), and the caller's workload settings (R2-2).
  attempt: attemptOf(), settings: workloadSettings(), runtime: runtimeEnv(),
};
const WORKLOAD = Object.keys(heavyRun.settings).length
  ? `workload settings: ${Object.entries(heavyRun.settings).map(([k, v]) => `${k}=${v}`).join(" ")}; these files may not test what they test by default` : null;
if (WORKLOAD) console.log(`test-tier: ${WORKLOAD}`);
// What a file's control eligibility is judged against (R3-1): the files tracked at the
// commit, and the file's audited opt-in in tests/heavy-inputs.json.
const tracked = new Set(spawnSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout?.split("\0").filter(Boolean) ?? []);
const declaredInputs = (() => { try { return JSON.parse(readFileSync(join(root, "tests", "heavy-inputs.json"), "utf8")).files ?? {}; } catch { return {}; } })();
/** The file's compiled import closure, named relative to the build (the same in any checkout), with the runtime. */
const closureOf = (file) => { try { return closureHash([pathToFileURL(file).href], undefined, build); } catch { return null; } };
let fileSeq = 0;
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
function runHeavy(file, phase = "pool") {
  const budget = budgetMiB(file), started = Date.now(), statsFile = join(scratch, `file-stats-${fileSeq++}`);
  const job = containment.start(process.execPath,
    ["--import", cacheModule, "--import", fileStatsModule, "--test", "--test-isolation=none", "--test-reporter=spec", file],
    // NODE_OPTIONS carries the reporting preload to every node process the file starts (R2-1, R2-3).
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, SILTWAKE_HEAVY_FILE_STATS: statsFile,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${fileStatsModule}`.trim() } }, budget);
  const output = [];
  job.child.stdout.on("data", (d) => { output.push(d); heartbeat(); });
  job.child.stderr.on("data", (d) => { output.push(d); heartbeat(); });
  return new Promise((done) => {
    let exited = null, result = null;
    // Teardown starts when the file's process exits, not when its pipes close: a
    // straggler that inherited stdout or stderr would hold them open, and only
    // tearing down the file's tree (which kills it) lets them close.
    job.child.once("exit", (code, signal) => {
      exited = { code, signal, seconds: (Date.now() - started) / 1000 };
      result = job.finish();
      // A descendant outside the tree (one that left the fallback's process group)
      // can still hold a pipe: stop waiting for it.
      setTimeout(() => { job.child.stdout.destroy(); job.child.stderr.destroy(); }, 5000).unref();
    });
    job.child.once("close", () => {
      process.stdout.write(`\n--- ${basename(file)}\n${Buffer.concat(output).toString()}`);
      const { code, signal, seconds } = exited, { peakMiB, killed, cpuS, oomKillsOwn, oomKillsNested } = result;
      const status = killed ? "KILLED (over budget)" : code === 0 ? "ok" : `FAIL (exit ${code ?? signal})`;
      if (status !== "ok") failed = true;
      // Every report from this file's processes and workers (its own prefix).
      const prefix = `${basename(statsFile)}.`, reports = [];
      for (const n of readdirSync(scratch)) if (n.startsWith(prefix)) try { reports.push(JSON.parse(readFileSync(join(scratch, n), "utf8"))); } catch { /* cut */ }
      const own = reports.find((r) => r.pid === job.child.pid && r.threadId === 0) ?? null;
      const facts = fileFacts(reports, job.child.pid, { root, build, cacheRoot, tracked, contract: declaredInputs[tsName(file)]?.control });
      rows.push({ file: basename(file), phase, status, seconds, cpuS: cpuS ?? (own ? own.cpuMs / 1000 : null), cpuScope: cpuS != null ? "tree" : own ? "process" : null,
        peakMiB, budgetMiB: budget, budgetPct: budget ? Math.round((peakMiB / budget) * 1000) / 10 : null, oomKillsOwn, oomKillsNested,
        cache: facts.cache, cacheUse: facts.cacheUse, closure: closureOf(file), control: facts.control });
      if (killed) console.error(`test-tier: ${basename(file)} went over its ${budget} MiB budget (whole process tree).`);
      done();
    });
  });
}
// Files run side by side while their budgets together fit the pool (largest
// first; a file larger than the pool runs alone).
const started = Date.now(), queue = files.filter((f) => !isTiming(f)).sort((a, b) => budgetMiB(b) - budgetMiB(a)), running = new Map();
let reserved = 0;
while (queue.length || running.size) {
  const next = queue.findIndex((f) => running.size === 0 || (running.size < concurrency && reserved + budgetMiB(f) <= poolMiB));
  if (next >= 0) {
    const [file] = queue.splice(next, 1), budget = budgetMiB(file);
    reserved += budget;
    const job = runHeavy(file).then(() => { running.delete(job); reserved -= budget; });
    running.set(job, file);
    continue;
  }
  await Promise.race(running.keys());
}
// The timing phase: nothing else of this tier runs. Other jobs on the machine still
// may, so each file's row reports how long this job and the host waited for a CPU
// while it ran (PSI "some"): a bound missed under contention says so.
const timed = files.filter(isTiming);
if (timed.length) console.log(`\n=== timing phase: ${timed.length} file(s) asserting elapsed time, one at a time, nothing else of this tier beside them`);
const jobCgroup = (() => {
  try {
    const dir = join("/sys/fs/cgroup", readFileSync("/proc/self/cgroup", "utf8").trim().split(":").pop());
    return basename(dir) === "tt1-runner" ? dirname(dir) : dir; // the runner's leaf (heavy-containment.mjs)
  } catch { return null; }
})();
const cpuSomeUs = (path) => { try { return Number(/^some .*total=(\d+)/m.exec(readFileSync(path, "utf8"))?.[1]); } catch { return NaN; } };
const cpuWait = () => ({ at: process.hrtime.bigint(), job: jobCgroup ? cpuSomeUs(join(jobCgroup, "cpu.pressure")) : NaN, host: cpuSomeUs("/proc/pressure/cpu") });
for (const file of timed) {
  const before = cpuWait();
  await runHeavy(file, "timing");
  const after = cpuWait(), us = Number(after.at - before.at) / 1000;
  const pct = (k) => Number.isFinite(after[k] - before[k]) ? Math.round(((after[k] - before[k]) / us) * 1000) / 10 : null;
  const row = rows.at(-1);
  row.wait = { job: pct("job"), host: pct("host") };
  if (row.status !== "ok" && row.wait.job != null && row.wait.job >= 5)
    console.error(`test-tier: ${row.file} failed while this job waited for a CPU ${row.wait.job}% of the time (host: ${row.wait.host ?? "?"}%): ` +
      "its time was measured under contention from other work on the machine. The bound stands; a run on a quiet machine decides.");
}
rmSync(scratch, { recursive: true, force: true });
const fmt = (n, d = 1) => (n == null ? "?" : n.toFixed(d));
console.log(`\ntest:heavy summary at ${String(heavyRun.commit).slice(0, 12)}${heavyRun.dirty ? " (uncommitted changes)" : ""} on ${heavyRun.machine}: ` +
  `peak = the file's whole process tree (${containment.kind} containment), against its budget; job memory limit ${heavyRun.jobMemoryMiB ?? "none"} MiB, ` +
  `pool ${poolMiB} MiB, up to ${concurrency} files at once; build cache ${heavyRun.cache.state} at the start (${heavyRun.cache.entries} entries)`);
if (NOT_EVIDENCE) console.log(`  ${NOT_EVIDENCE}`);
if (WORKLOAD) console.log(`  ${WORKLOAD}`);
for (const r of rows) {
  const oom = r.oomKillsOwn || r.oomKillsNested ? `  oom-killed ${r.oomKillsOwn ?? "?"} own + ${r.oomKillsNested ?? "?"} nested` : "";
  const cache = r.cache ? `  cache ${r.cache.hits} hit/${r.cache.fills} fill (${r.cacheUse})` : "";
  console.log(`  ${r.file.padEnd(36)} ${r.seconds.toFixed(1).padStart(6)} s  cpu ${fmt(r.cpuS).padStart(6)} s  peak ${String(r.peakMiB).padStart(5)} MiB / ${r.budgetMiB} MiB` +
    `${cache}${oom}${r.control?.eligible ? "  control-eligible" : ""}  ${r.status}` + (r.wait ? `  [timing; CPU wait: job ${r.wait.job ?? "?"}%, host ${r.wait.host ?? "?"}%]` : ""));
}
console.log(`  total ${rows.reduce((t, r) => t + r.seconds, 0).toFixed(1)} s of file time in ${((Date.now() - started) / 1000).toFixed(1)} s ` +
  `(up to ${concurrency} files within ${poolMiB} MiB of budgets at once)`);
// Near a budget: what a nightly full run will alert on (STEW-3). Not judged on an override run.
const near = heavyRun.budgetEvidence ? rows.filter((r) => r.budgetPct != null && r.budgetPct >= NEAR_PCT && r.status === "ok") : [];
for (const r of near) console.warn(`test-tier: near budget: ${r.file} peaked at ${r.peakMiB} of its ${r.budgetMiB} MiB (${r.budgetPct}%, the alert line is ${NEAR_PCT}%)`);
const nested = rows.filter((r) => r.oomKillsNested);
if (nested.length) console.log(`test-tier: OOM kills inside nested cgroups (a file's own sub-limits, not its budget): ${nested.map((r) => `${r.file} ${r.oomKillsNested}`).join(", ")}`);
const record = { ...heavyRun, files: rows };
writeFileSync(join(build, "heavy-results.json"), JSON.stringify(record, null, 1));
console.log(recordLine(record));
process.exit(failed ? 1 : 0);
