// test-tier: allow-escape runs scripts/heavy-results.mjs and scripts/gate.mjs against private queue and results roots and a stand-in queue client (a small node script); nothing loads Babylon.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Stored per-file heavy results (STEW-3): the tier prints one record per run; the
// queue keeps every job's output on factory-worker; `ingest` copies the records,
// with the job's receipt, into a store that outlives the job logs. The gate's heavy
// step counts only with a stored record of the full tier at its commit, at real budgets.
interface Row { file: string; status: string; phase: string; seconds: number; cpuS: number | null; cpuScope: string | null; peakMiB: number;
  budgetMiB: number; budgetPct: number | null; oomKillsOwn: number | null; oomKillsNested: number | null; cache: { hits: number; misses: number; fills: number; fillMs: number } | null }
interface Run { v: number; at: string; commit: string | null; dirty: boolean | null; machine: string; containment: string; jobMemoryMiB: number | null;
  node: string; cache: { state: string; entries: number }; selection: { kind: string; files: number }; override: number | null; budgetEvidence: boolean; files: Row[] }
interface R {
  recordsIn(text: string): Run[];
  recordLine(run: Run): string;
  cacheState(dir: string, env?: Record<string, string>): { state: string; entries: number };
  matchKey(run: Run, row: Row): string;
  fullTierProblems(stored: { runs: Run[] } | null, commit: string): string[];
  nearBudget(rows: { run: Run; row: Row }[], pct?: number): { run: Run; row: Row }[];
  machineLabel(host: string): string;
  NEAR_PCT: number;
}
const H = await import(pathToFileURL(resolve("scripts/heavy-results.mjs")).href) as R;
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirs: string[] = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const temp = (p: string) => { const d = fs.mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };

const row = (over: Partial<Row> = {}): Row => ({ file: "a.heavy.test.js", status: "ok", phase: "pool", seconds: 4.2, cpuS: 9.1, cpuScope: "tree", peakMiB: 512,
  budgetMiB: 1024, budgetPct: 50, oomKillsOwn: 0, oomKillsNested: 0, cache: { hits: 3, misses: 0, fills: 0, fillMs: 0 }, ...over });
const runOf = (over: Partial<Run> = {}, files: Row[] = [row()]): Run => ({ v: 1, at: "2026-10-25T00:00:00.000Z", commit: head, dirty: false, machine: "RTX 3090 (factory-worker)",
  containment: "cgroup", jobMemoryMiB: 3072, node: "v24.21.0", cache: { state: "warm", entries: 12 }, selection: { kind: "full", files: 67 }, override: null, budgetEvidence: true, files, ...over });

test("a record is one line; a cut or foreign line isn't a record", () => {
  const r = runOf();
  assert.deepEqual(H.recordsIn(`noise\n${H.recordLine(r)}\nheavy-results: {cut\nheavy-results: {"v":9,"files":[]}\n`), [r]);
  assert.equal(H.machineLabel("factory-worker"), "RTX 3090 (factory-worker)");
  assert.equal(H.machineLabel("siltwake-alickers"), "RTX 4070 Laptop (alickers, shared desktop host)");
});

test("the cache state is read from the store as the run found it: off, cold or warm", () => {
  const dir = temp("siltwake-cache-state-");
  assert.deepEqual(H.cacheState(join(dir, "missing")), { state: "cold", entries: 0 });
  fs.mkdirSync(join(dir, "abc")); fs.writeFileSync(join(dir, "abc", "1.bin"), ""); fs.writeFileSync(join(dir, "abc", "2.bin.tmp"), "");
  assert.deepEqual(H.cacheState(dir), { state: "warm", entries: 1 });
  assert.deepEqual(H.cacheState(dir, { SILTWAKE_BUILD_CACHE: "off" }), { state: "off", entries: 0 });
});

test("rows stand in for each other only with the same machine, containment, budget, cache state and Node", () => {
  const base = H.matchKey(runOf(), row());
  assert.equal(H.matchKey(runOf({ at: "later", commit: "x" }), row({ peakMiB: 700 })), base, "commit and numbers aren't part of the key");
  for (const [what, r, w] of [["machine", runOf({ machine: "RTX 4070 Laptop (alickers, shared desktop host)" }), row()], ["containment", runOf({ containment: "process group" }), row()],
    ["budget", runOf(), row({ budgetMiB: 2048 })], ["cache", runOf({ cache: { state: "cold", entries: 0 } }), row()], ["node", runOf({ node: "v24.22.1" }), row()]] as const)
    assert.notEqual(H.matchKey(r, w), base, what);
});

test("the gate's heavy step needs the full tier, at real budgets, for its own clean commit", () => {
  assert.deepEqual(H.fullTierProblems({ runs: [runOf()] }, head), []);
  const cases: [{ runs: Run[] } | null, RegExp][] = [
    [null, /weren't recorded/], [{ runs: [] }, /weren't recorded/],
    [{ runs: [runOf({ override: 8000, budgetEvidence: false })] }, /SILTWAKE_HEAVY_BUDGET_MIB=8000: not budget evidence/],
    [{ runs: [runOf({ selection: { kind: "subset", files: 3 } })] }, /ran 3 chosen files, not the full heavy tier/],
    [{ runs: [runOf({ commit: "f".repeat(40) })] }, /results are for ffffffffffff, not/],
    [{ runs: [runOf({ dirty: true })] }, /uncommitted changes/],
  ];
  for (const [stored, re] of cases) assert.ok(H.fullTierProblems(stored, head).some((p) => re.test(p)), String(re));
});

test("near budget reads budget-evidence runs only", () => {
  const near = runOf({}, [row({ file: "near.heavy.test.js", peakMiB: 880, budgetPct: 85.9 }), row()]);
  const override = runOf({ override: 8000, budgetEvidence: false }, [row({ file: "inflated.heavy.test.js", peakMiB: 7000, budgetMiB: 8000, budgetPct: 87.5 })]);
  const rows = [near, override].flatMap((run) => run.files.map((r) => ({ run, row: r })));
  assert.deepEqual(H.nearBudget(rows).map((r) => r.row.file), ["near.heavy.test.js"]);
  assert.equal(H.NEAR_PCT, 85);
});

/** A private queue root with one finished job whose output holds `records`. */
function job(sched: string, ticket: string, records: Run[], exit: object = {}) {
  const dir = join(sched, "jobs", ticket);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(join(dir, "output.log"), ["--- a.heavy.test.js", "ok", ...records.map((r) => H.recordLine(r)), "alickers-job: tested x exit 0"].join("\n"));
  fs.writeFileSync(join(dir, "exit.json"), JSON.stringify({ ticket, code: 0, stopReason: null, class: "heavy-suite", memMiB: 3072, machine: "RTX 4070 Laptop (alickers, shared desktop host)",
    machineTag: "any", remote: true, evidence: { commit: head, bound: true }, ...exit }));
}
const cli = (env: Record<string, string>, ...args: string[]) => spawnSync(process.execPath, ["scripts/heavy-results.mjs", ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("ingest copies records with their receipt from the queue's job logs, once; show and near read them back with their context", () => {
  const sched = temp("siltwake-results-sched-"), results = temp("siltwake-results-store-"), env = { SILTWAKE_SCHED_DIR: sched, SILTWAKE_RESULTS_DIR: results };
  job(sched, "261025-000000-aaaa", [runOf({}, [row(), row({ file: "near.heavy.test.js", peakMiB: 900, budgetPct: 87.9, oomKillsNested: 3 })])]);
  job(sched, "261025-000000-bbbb", [runOf({ override: 8000, budgetEvidence: false }, [row({ budgetMiB: 8000, budgetPct: 6.4 })])]);
  job(sched, "261025-000000-cccc", []);
  fs.mkdirSync(join(sched, "jobs", "261025-000000-dddd"));
  const first = cli(env, "ingest");
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /261025-000000-aaaa: stored 2 file rows from 1 run\(s\)/);
  assert.match(first.stdout, /2 new run\(s\) stored/);
  const stored = JSON.parse(fs.readFileSync(join(results, "heavy", "runs", "261025-000000-aaaa.json"), "utf8"));
  assert.deepEqual([stored.receipt.machine, stored.receipt.evidence.bound, stored.runs[0].files.length], ["RTX 4070 Laptop (alickers, shared desktop host)", true, 2]);
  assert.match(cli(env, "ingest", "261025-000000-aaaa", "261025-000000-cccc", "261025-000000-dddd").stdout,
    /aaaa: already stored\n.*cccc: no heavy-results record\n.*dddd: not finished/);
  const show = cli(env, "show", "--file", "near").stdout;
  assert.match(show, /near\.heavy\.test\.js ok 4\.2 s, cpu 9\.1 s \(tree\), peak 900\/1024 MiB \(87\.9%\), oom 0\+3; cache warm at start, 3 hits 0 fills; job limit 3072 MiB/);
  assert.match(cli(env, "show").stdout, /6\.4%\).*NOT BUDGET EVIDENCE/);
  const near = cli(env, "near").stdout.trim().split("\n");
  assert.equal(near.length, 1);
  assert.match(near[0]!, /near\.heavy\.test\.js/);
  const json = JSON.parse(cli(env, "show", "--json", "--file", "near").stdout) as { matchKey: string; receipt: { remote: boolean } };
  assert.equal(json.matchKey, "RTX 3090 (factory-worker)|cgroup|1024|warm|v24.21.0");
});

test("the gate's heavy step: queued on any machine, its record stored, and judged on it", () => {
  const sched = temp("siltwake-gate-heavy-sched-"), results = temp("siltwake-gate-heavy-results-"), q = temp("siltwake-gate-heavy-queue-");
  const queue = join(q, "heavy-check");
  // A stand-in client: submit records argv; wait writes the job's log and receipt where ingest reads them.
  fs.writeFileSync(queue, `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
if (process.argv[2] === "submit") { fs.writeFileSync(${JSON.stringify(join(q, "argv.json"))}, JSON.stringify(process.argv.slice(3))); console.log("261025-000000-heav"); process.exit(0); }
const dir = path.join(process.env.SILTWAKE_SCHED_DIR, "jobs", process.argv[3]);
fs.mkdirSync(dir, { recursive: true });
const receipt = { ticket: process.argv[3], code: 0, stopReason: null, machine: "RTX 4070 Laptop (alickers, shared desktop host)", evidence: { commit: ${JSON.stringify(head)}, bound: true } };
fs.writeFileSync(path.join(dir, "output.log"), process.env.GATE_HEAVY_RECORD ? "heavy-results: " + process.env.GATE_HEAVY_RECORD + "\\n" : "no record\\n");
fs.writeFileSync(path.join(dir, "exit.json"), JSON.stringify(receipt));
console.log("job output"); console.log(JSON.stringify(receipt));
`, { mode: 0o755 });
  const gate = (record: Run | null) => {
    fs.rmSync(join(results, "heavy"), { recursive: true, force: true });
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith("SILTWAKE_") || k === "NODE_OPTIONS" || k === "NODE_TEST_CONTEXT") delete env[k];
    return spawnSync(process.execPath, ["scripts/gate.mjs", "--only", "heavy", "--allow-dirty"], { encoding: "utf8",
      env: { ...env, SILTWAKE_HEAVY_CHECK: queue, SILTWAKE_SCHED_DIR: sched, SILTWAKE_RESULTS_DIR: results, ...(record ? { GATE_HEAVY_RECORD: JSON.stringify(record) } : {}) } });
  };
  const ok = gate(runOf());
  assert.deepEqual(JSON.parse(fs.readFileSync(join(q, "argv.json"), "utf8")), ["--class", "heavy-suite", "--machine", "any", "--review", "--", "npm", "run", "test:heavy"]);
  assert.match(ok.stdout, /gate: heavy results: stored 1 file rows/);
  assert.match(ok.stdout, /^ {2}pass {2}heavy .*\[on RTX 4070 Laptop \(alickers, shared desktop host\)\]$/m, ok.stdout);
  for (const [record, re] of [[null, /weren't recorded/], [runOf({ override: 8000, budgetEvidence: false }), /not budget evidence/],
    [runOf({ selection: { kind: "subset", files: 2 } }), /not the full heavy tier/]] as const) {
    const r = gate(record);
    assert.match(r.stdout, new RegExp(`^ {2}FAIL {2}heavy .*${re.source}`, "m"), r.stdout);
    assert.equal(r.status, 1);
  }
});

test("no gate step hides an exit code in a pipeline (Measurement hygiene)", () => {
  const G = spawnSync(process.execPath, ["scripts/gate.mjs", "--list"], { encoding: "utf8" }).stdout;
  assert.doesNotMatch(G.split("\nafter the merge")[0]!, /\s\|\s/);
  const scripts = (JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  for (const name of ["test:fast", "test:fast:direct", "build", "build:direct", "test:heavy", "playthrough", "playthrough:direct"])
    assert.doesNotMatch(scripts[name]!, /(^|[^|])\|([^|]|$)/, `${name} has no pipeline`);
});
