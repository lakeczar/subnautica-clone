import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The portable runner's execution (scripts/heavy/portable-run.mjs, SCHED-3 R5):
// its path boundary, signal codes, a stop during the last step, and the v1
// shim's handling of v2-only options. Each case is a throwaway repository in
// tmp with a copy of the runner; nothing here reaches the queue.
const R = await import(pathToFileURL(resolve("scripts/heavy/portable-run.mjs")).href);

/** A repository at a temp root: the runner (and the policy it imports), package.json scripts, files. */
function repo(scripts: Record<string, string>, files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "portable-run-"));
  mkdirSync(join(root, "scripts", "heavy"), { recursive: true });
  for (const f of ["portable-run.mjs", "policy.mjs"]) cpSync(resolve("scripts/heavy", f), join(root, "scripts", "heavy", f));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true, scripts }));
  for (const [p, body] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), body); }
  return root;
}
const runner = (root: string) => join(root, "scripts", "heavy", "portable-run.mjs");

test("the path boundary (R5-F1): a step's file, through its symlinks, stays in the repository or its own node_modules; no list of programs", () => {
  const root = repo({}, { "scripts/a.mjs": "", "tools/b.mjs": "" });
  const store = mkdtempSync(join(tmpdir(), "portable-run-store-"));
  try {
    mkdirSync(join(store, "typescript", "bin"), { recursive: true });
    writeFileSync(join(store, "typescript", "bin", "tsc"), "");
    symlinkSync(store, join(root, "node_modules")); // a worktree's shared install, or a snapshot's link
    symlinkSync("../node_modules/typescript/bin/tsc", join(root, "scripts", "tsc-link.mjs"));
    symlinkSync("../tools/b.mjs", join(root, "scripts", "inside-link.mjs"));
    symlinkSync("/usr/lib/node_modules/npm/bin/npm-cli.js", join(root, "scripts", "npm-alias.mjs"));
    symlinkSync(tmpdir(), join(root, "scripts", "outdir"));
    symlinkSync("/nonexistent-elsewhere/bin/tool.js", join(root, "scripts", "dangling.mjs")); // may exist on the other machine
    for (const p of ["scripts/a.mjs", "node_modules/typescript/bin/tsc", "scripts/tsc-link.mjs", "scripts/inside-link.mjs", ".test-build/not/built/yet.js"])
      assert.equal(R.stepBoundary(root, p), null, p);
    for (const p of ["scripts/npm-alias.mjs", "scripts/outdir/anything.mjs", "scripts/dangling.mjs"])
      assert.match(R.stepBoundary(root, p), /resolves outside the repository and its node_modules/, p);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(store, { recursive: true, force: true }); }
});

test("the runner refuses a step outside the boundary before running anything", () => {
  const root = repo({ test: "node scripts/ok.mjs && node scripts/npm-alias.mjs run inner" }, { "scripts/ok.mjs": "console.log('FIRST-RAN')" });
  try {
    symlinkSync("/usr/lib/node_modules/npm/bin/npm-cli.js", join(root, "scripts", "npm-alias.mjs"));
    const r = spawnSync(process.execPath, [runner(root), "--script", "test"], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /scripts\/npm-alias\.mjs resolves outside the repository/);
    assert.doesNotMatch(r.stdout, /FIRST-RAN/, "nothing ran");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("signals (R5-F2): a step a signal ended gives 128 + the platform's number, as sh does, and the steps after it don't run", () => {
  const root = repo({ test: "node scripts/sig.mjs && node scripts/never.mjs" },
    { "scripts/sig.mjs": "process.kill(process.pid, 'SIGUSR2')", "scripts/never.mjs": "console.log('NEVER')" });
  try {
    const r = spawnSync(process.execPath, [runner(root), "--script", "test"], { encoding: "utf8" });
    assert.equal(r.status, 128 + constants.signals.SIGUSR2);
    assert.equal(r.status, spawnSync("sh", ["-c", "node scripts/sig.mjs && node scripts/never.mjs"], { cwd: root }).status, "what npm's sh reports");
    assert.doesNotMatch(r.stdout, /NEVER/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a stop during the last step is never a success (R5-F2): the step gets it, and the run ends with its code even if the step exits 0", async () => {
  const root = repo({ test: "node scripts/first.mjs && node scripts/last.mjs" }, {
    "scripts/first.mjs": "",
    // Handles TERM by exiting 0; says when it's ready.
    "scripts/last.mjs": "process.on('SIGTERM', () => process.exit(0)); console.log('READY'); setInterval(() => {}, 1000);",
  });
  try {
    const p = spawn(process.execPath, [runner(root), "--script", "test"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    for (let i = 0; i < 200 && !out.includes("READY"); i++) await new Promise((r) => setTimeout(r, 25));
    assert.match(out, /READY/);
    p.kill("SIGTERM");
    const code = await new Promise((done) => p.on("exit", (c) => done(c)));
    assert.equal(code, 128 + constants.signals.SIGTERM);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the v1 fallback (R5-F3) accepts and ignores --machine and --artifact, so package.json's test:heavy line still runs; local-only", () => {
  // The inline branch (inside a job that holds the lane): no lock, no scope, only the option parsing and the command.
  const r = spawnSync("bash", ["scripts/heavy-check.sh", "--class", "heavy-suite", "--machine", "any", "--artifact", "out", "--", "sh", "-c", "echo v1-ran"],
    { encoding: "utf8", env: { ...process.env, SILTWAKE_SCHED_V1: "1", SILTWAKE_HEAVY_LOCK_HELD: "1" } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "v1-ran");
  const heavy = JSON.parse(readFileSync("package.json", "utf8")).scripts["test:heavy"];
  assert.match(heavy, /--machine any/, "the line this covers");
  assert.ok(existsSync("scripts/heavy-check.sh"));
});
