#!/usr/bin/env node
// Runs one test tier from the compiled `.test-build/tests`.
//
//   node scripts/test-tier.mjs fast  [files...]   every *.test.js except *.heavy.test.js
//   node scripts/test-tier.mjs heavy [files...]   every *.heavy.test.js, one at a time
//
// Classification rule: a test file that reaches `@babylonjs` through its imports
// is heavy and must be named `*.heavy.test.ts`. The fast tier refuses to run if a
// fast-named file reaches Babylon, naming the import chain. Other expensive suites
// may opt into the heavy tier by name.
//
// Heavy files run sequentially, each in its own `node --test --test-isolation=none`
// process. A watchdog samples the process's peak RSS (VmHWM) and kills it at the
// budget; the process also reports its exact `maxRSS` on exit. Budgets come from
// tests/heavy-budgets.json (MiB per file, with a default). Run the heavy tier
// through scripts/heavy-check.sh so only one heavy job uses the VM at a time.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(root, ".test-build");
const testDir = join(build, "tests");
const FAST_CONCURRENCY = 4;
const FAST_HEAP_MIB = 1024;

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

/** Static import graph of the compiled JS, applying the app-loader substitution
 * that app tests register, so a mocked renderer does not count as Babylon. */
async function babylonChains(entries) {
  const loader = existsSync(join(testDir, "app-loader.js"))
    ? (await import(pathToFileURL(join(testDir, "app-loader.js")).href)).resolve : null;
  const next = (specifier, context) => ({ url: specifier.startsWith(".") ? new URL(specifier, context.parentURL).href : `bare:${specifier}` });
  const edge = (specifier, parentURL) => (loader ? loader(specifier, { parentURL }, next) : next(specifier, { parentURL })).url;
  const importRe = /(?:^|[\s;])(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|[\s;])import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  const graph = new Map();
  const imports = (url) => {
    if (!graph.has(url)) {
      const text = readFileSync(fileURLToPath(url), "utf8");
      graph.set(url, [...text.matchAll(importRe)].map((m) => edge(m[1] ?? m[2] ?? m[3], url)));
    }
    return graph.get(url);
  };
  const found = new Map();
  for (const entry of entries) {
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
      for (const child of imports(url)) if (!parent.has(child)) { parent.set(child, url); queue.push(child); }
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
  const misplaced = await babylonChains(files.filter((f) => !isHeavy(f)));
  if (misplaced.size) {
    for (const [file, chain] of misplaced) {
      const name = basename(file).replace(/\.test\.js$/, "");
      console.error(`test-tier: ${relative(build, file)} reaches Babylon (${chain.join(" -> ")}).`);
      console.error(`  Rename tests/${name}.test.ts to tests/${name}.heavy.test.ts, or remove the Babylon import.`);
    }
    process.exit(1);
  }
  const started = Date.now();
  // Each fast test process gets a 1 GiB V8 heap: a runaway assertion diff fails
  // that file quickly instead of exhausting the shared VM. Fast tests hold no
  // Babylon buffers, so the heap is their memory.
  const { code } = await run(process.execPath, ["--test", `--test-concurrency=${FAST_CONCURRENCY}`, ...files],
    { env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=${FAST_HEAP_MIB}`.trim() } });
  console.log(`test:fast ${files.length} files in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  process.exit(code ?? 1);
}

// Heavy tier.
const budgets = JSON.parse(readFileSync(join(root, "tests", "heavy-budgets.json"), "utf8"));
// SILTWAKE_HEAVY_BUDGET_MIB overrides every budget, e.g. to check that the watchdog fires.
const budgetMiB = (file) => Number(process.env.SILTWAKE_HEAVY_BUDGET_MIB) ||
  (budgets.files?.[basename(file).replace(/\.js$/, ".ts")] ?? budgets.defaultMiB);
const vmHwmKiB = (pid) => {
  try { return Number(/VmHWM:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1] ?? 0); } catch { return 0; }
};
const scratch = mkdtempSync(join(tmpdir(), "siltwake-heavy-"));
const peakModule = pathToFileURL(join(root, "scripts", "test-peak-rss.mjs")).href;
const rows = [];
let failed = false;
for (const file of files) {
  const budget = budgetMiB(file), report = join(scratch, `${basename(file)}.peak`), started = Date.now();
  let sampled = 0, killed = false, timer;
  const { code, signal } = await run(process.execPath,
    ["--import", peakModule, "--test", "--test-isolation=none", "--test-reporter=spec", file],
    { env: { ...process.env, SILTWAKE_PEAK_RSS_FILE: report },
      onSpawn(child) {
        timer = setInterval(() => {
          sampled = Math.max(sampled, vmHwmKiB(child.pid));
          if (sampled > budget * 1024 && !killed) { killed = true; child.kill("SIGKILL"); }
        }, 100);
      } });
  clearInterval(timer);
  const exact = existsSync(report) ? Number(readFileSync(report, "utf8")) : 0;
  const peakMiB = Math.round(Math.max(sampled, exact) / 1024), seconds = (Date.now() - started) / 1000;
  const over = peakMiB > budget;
  const status = killed ? "KILLED (over budget)" : over ? "FAIL (over budget)" : code === 0 ? "ok" : `FAIL (exit ${code ?? signal})`;
  if (status !== "ok") failed = true;
  rows.push({ file: basename(file), seconds, peakMiB, budget, status });
  if (killed || over) console.error(`test-tier: ${basename(file)} peaked at ${peakMiB} MiB, over its ${budget} MiB budget.`);
}
rmSync(scratch, { recursive: true, force: true });
console.log("\ntest:heavy summary");
for (const r of rows)
  console.log(`  ${r.file.padEnd(36)} ${r.seconds.toFixed(1).padStart(6)} s  peak ${String(r.peakMiB).padStart(5)} MiB / ${r.budget} MiB  ${r.status}`);
console.log(`  total ${rows.reduce((t, r) => t + r.seconds, 0).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
