#!/usr/bin/env node
// Compiles the tests into .test-build incrementally.
//
//   node scripts/test-build.mjs              tsc -p tsconfig.test.json
//   node scripts/test-build.mjs --typecheck  the same, plus `tsc --noEmit` on the
//                                            whole project, in parallel
//   node scripts/test-build.mjs --clean      delete .test-build first
//
// Both compilers keep their build info in .test-build, so an unchanged tree
// rebuilds in seconds. Incremental output is never stale: after compiling, every
// compiled .js, .js.map or .json whose source no longer exists is deleted (a
// renamed or deleted test must not keep running), and if any test lost its
// output the build reruns clean.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { heavyJobGuard, keepHeavyJobMarker } from "./heavy/build-guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(root, ".test-build");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const args = new Set(process.argv.slice(2));

// A heavy-check job running in this worktree is testing these files; don't
// rebuild them under it. The job itself (SILTWAKE_JOB_TICKET) may, and keeps
// its marker across --clean.
const busy = heavyJobGuard(root);
if (busy) { console.error(`test-build: ${busy}`); process.exit(1); }
const restoreMarker = keepHeavyJobMarker(root);

const run = (label, tscArgs) => new Promise((done) => {
  const started = Date.now();
  const child = spawn(process.execPath, [tsc, ...tscArgs], { cwd: root, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    console.log(`test-build: ${label} ${code === 0 ? "ok" : `failed (${code ?? signal})`} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    done(code === 0);
  });
});
const compileTests = () => run("tests", ["-p", "tsconfig.test.json", "--incremental", "--tsBuildInfoFile", join(build, "tests.tsbuildinfo")]);

/** Deletes compiled files whose TypeScript (or JSON) source is gone. */
function prune(dir = build) {
  let removed = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (path !== join(build, "build-cache")) removed += prune(path); continue; }
    const rel = relative(build, path), m = /^(.*)\.(js|js\.map|json)$/.exec(rel);
    if (!m || dir === build) continue; // top-level files are reports and build info, not output
    const sources = m[2] === "json" ? [rel] : [".ts", ".tsx", ".mts"].map((ext) => m[1] + ext);
    if (!sources.some((s) => existsSync(join(root, s)))) { rmSync(path); removed++; }
  }
  return removed;
}
const missingTests = () => readdirSync(join(root, "tests")).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .filter((f) => !existsSync(join(build, "tests", f.replace(/\.ts$/, ".js"))));

if (args.has("--clean")) { rmSync(build, { recursive: true, force: true }); restoreMarker(); }
const jobs = [compileTests()];
if (args.has("--typecheck"))
  jobs.push(run("typecheck", ["--noEmit", "--incremental", "--tsBuildInfoFile", join(build, "typecheck.tsbuildinfo")]));
let ok = (await Promise.all(jobs)).every(Boolean);
if (ok && existsSync(build)) {
  const removed = prune();
  if (removed) console.log(`test-build: removed ${removed} compiled files whose source is gone`);
  const missing = missingTests();
  if (missing.length) {
    console.log(`test-build: ${missing.length} tests have no output (${missing.slice(0, 3).join(", ")}); rebuilding clean`);
    rmSync(join(build, "tests.tsbuildinfo"), { force: true });
    ok = await compileTests() && missingTests().length === 0;
  }
}
process.exit(ok ? 0 : 1);
