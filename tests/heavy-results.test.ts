// test-tier: allow-escape runs scripts/heavy-results.mjs and scripts/gate.mjs against private queue and results roots and a stand-in queue client (a small node script); nothing loads Babylon.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Stored per-file heavy results (STEW-3): the tier prints one record per run; the
// queue keeps every job's output on factory-worker; `ingest` copies the records, with
// the job's receipt, into a store that outlives the job logs. A stored row is used only
// when `eligibility` passes (the record agrees with its receipt, at canonical budgets);
// a control arm also needs the intended clean commit, the same file and harness, and
// equal conditions (R1). The gate's heavy step needs an eligible record of every heavy
// file at its commit, each at its canonical budget.
interface Cache { hits: number; misses: number; fills: number; fillMs: number }
interface Row { file: string; status: string; phase: string; seconds: number; cpuS: number | null; cpuScope: string | null; peakMiB: number;
  budgetMiB: number; budgetPct: number | null; oomKillsOwn: number | null; oomKillsNested: number | null; cache: Cache | null; cacheUse: string | null; closure: string | null }
interface Run { v: number; at: string; commit: string | null; dirty: boolean | null; machine: string; ticket: string | null; containment: string; jobMemoryMiB: number | null;
  poolMiB: number; concurrency: number; jobCpus: number | null; node: string; cache: { state: string; entries: number }; selection: { kind: string; files: number };
  override: { budgetMiB: number | null; budgetsFile: string | null } | null; budgetEvidence: boolean; lockHash: string; harnessHash: string; files: Row[] }
interface Receipt { ticket?: string | null; code: number; stopReason?: string | null; label?: string | null; machine: string | null; evidence: { commit: string | null; bound: boolean; why?: string | null } | null; disturbed?: boolean | null }
interface Stored { ticket: string; receipt: Receipt | null; runs: Run[] }
interface Canonical { files: string[]; budgetOf(js: string): number }
interface R {
  recordsIn(text: string): Run[];
  recordLine(run: Run): string;
  cacheState(dir: string, env?: Record<string, string>): { state: string; entries: number };
  cacheUse(cache: Cache | null): string | null;
  identityOf(run: Run, row: Row): Record<string, unknown>;
  conditionsOf(run: Run, row: Row): Record<string, unknown>;
  eligibility(stored: Stored | null, run: Run, row?: Row | null): string[];
  fullTierProblems(stored: Stored | null, commit: string, canonical?: Canonical | null): string[];
  canonicalAt(root: string, commit: string): Canonical | null;
  nearBudget(rows: { stored: Stored; run: Run; row: Row }[], pct?: number): { row: Row }[];
  controlProblems(candidate: { run: Run; row: Row }, control: { stored: Stored; run: Run; row: Row }, commit: string): string[];
  machineLabel(host: string): string;
  NEAR_PCT: number;
}
const H = await import(pathToFileURL(resolve("scripts/heavy-results.mjs")).href) as R;
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const other = "f".repeat(40);
const dirs: string[] = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const temp = (p: string) => { const d = fs.mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };

const F3090 = "RTX 3090 (factory-worker)", A4070 = "RTX 4070 Laptop (alickers, shared desktop host)";
const row = (over: Partial<Row> = {}): Row => ({ file: "a.heavy.test.js", status: "ok", phase: "pool", seconds: 4.2, cpuS: 9.1, cpuScope: "tree", peakMiB: 512,
  budgetMiB: 1024, budgetPct: 50, oomKillsOwn: 0, oomKillsNested: 0, cache: { hits: 3, misses: 0, fills: 0, fillMs: 0 }, cacheUse: "hit", closure: "c0ffee", ...over });
const runOf = (over: Partial<Run> = {}, files: Row[] = [row()]): Run => ({ v: 2, at: "2026-10-25T00:00:00.000Z", commit: head, dirty: false, machine: F3090, ticket: "261025-000000-aaaa",
  containment: "cgroup", jobMemoryMiB: 3072, poolMiB: 2560, concurrency: 3, jobCpus: 3, node: "v24.21.0", cache: { state: "warm", entries: 12 }, selection: { kind: "full", files: 67 },
  override: null, budgetEvidence: true, lockHash: "l0ck", harnessHash: "h4rn", files, ...over });
const receipt = (over: Partial<Receipt> = {}): Receipt => ({ ticket: "261025-000000-aaaa", code: 0, stopReason: null, machine: F3090, evidence: { commit: head, bound: true }, disturbed: null, ...over });
const storedOf = (run: Run, rc: Receipt | null = receipt(), ticket = "261025-000000-aaaa"): Stored => ({ ticket, receipt: rc, runs: [run] });

test("a record is one line; a cut or foreign line isn't a record; v1 records are read but never eligible", () => {
  const r = runOf();
  assert.deepEqual(H.recordsIn(`noise\n${H.recordLine(r)}\nheavy-results: {cut\nheavy-results: {"v":9,"files":[]}\n`), [r]);
  const v1 = runOf({ v: 1 });
  assert.equal(H.recordsIn(H.recordLine(v1)).length, 1);
  assert.match(H.eligibility(storedOf(v1), v1).join(), /a v1 record/);
  assert.equal(H.machineLabel("factory-worker"), F3090);
  assert.equal(H.machineLabel("siltwake-alickers"), A4070);
});

test("the cache: the store's state at the start, and each file's own use of it", () => {
  const dir = temp("siltwake-cache-state-");
  assert.deepEqual(H.cacheState(join(dir, "missing")), { state: "cold", entries: 0 });
  fs.mkdirSync(join(dir, "abc")); fs.writeFileSync(join(dir, "abc", "1.bin"), ""); fs.writeFileSync(join(dir, "abc", "2.bin.tmp"), "");
  assert.deepEqual(H.cacheState(dir), { state: "warm", entries: 1 });
  assert.deepEqual(H.cacheState(dir, { SILTWAKE_BUILD_CACHE: "off" }), { state: "off", entries: 0 });
  const c = (hits: number, misses: number, fills: number) => H.cacheUse({ hits, misses, fills, fillMs: 0 });
  assert.deepEqual([c(3, 0, 0), c(0, 1, 1), c(2, 1, 1), c(0, 0, 0), H.cacheUse(null)], ["hit", "fill", "mixed", "none", null]);
});

test("eligibility: the record agrees with its job's receipt, at canonical budgets, and the file passed (R1-3)", () => {
  const good = runOf();
  assert.deepEqual(H.eligibility(storedOf(good), good, good.files[0]), []);
  const cases: [string, Stored, Run, Row | null, RegExp][] = [
    ["no receipt", storedOf(good, null), good, null, /no queue receipt/],
    ["another ticket's receipt", storedOf(good, receipt({ ticket: "261025-000000-zzzz" })), good, null, /receipt is ticket 261025-000000-zzzz's/],
    ["the job failed on its own", storedOf(good, receipt({ code: 2, label: "usage" })), good, null, /job exited 2 \(usage\)/],
    ["exit 1 with every file passing", storedOf(good, receipt({ code: 1 })), good, null, /job exited 1/],
    ["stopped", storedOf(good, receipt({ stopReason: "stalled" })), good, null, /stopped: stalled/],
    ["disturbed", storedOf(good, receipt({ disturbed: true })), good, null, /DISTURBED/],
    ["unbound", storedOf(good, receipt({ evidence: { commit: head, bound: false, why: "the worktree changed during the run" } })), good, null, /isn't evidence for a commit: the worktree changed/],
    ["another commit", storedOf(good, receipt({ evidence: { commit: other, bound: true } })), good, null, /receipt binds ffffffffffff, the record claims/],
    ["another machine", storedOf(good, receipt({ machine: A4070 })), good, null, /receipt ran on RTX 4070 .*the record claims RTX 3090/],
    ["the record's ticket", storedOf(runOf({ ticket: "261025-000000-bbbb" })), runOf({ ticket: "261025-000000-bbbb" }), null, /record is from ticket 261025-000000-bbbb/],
    ["dirty", storedOf(runOf({ dirty: true })), runOf({ dirty: true }), null, /uncommitted changes/],
    ["unknown tree", storedOf(runOf({ dirty: null })), runOf({ dirty: null }), null, /uncommitted changes \(or its state is unknown\)/],
    ["a budgets file", storedOf(runOf({ override: { budgetMiB: null, budgetsFile: "/tmp/b.json" }, budgetEvidence: false })),
      runOf({ override: { budgetMiB: null, budgetsFile: "/tmp/b.json" }, budgetEvidence: false }), null, /not budget evidence \(override: .*budgetsFile/],
    ["a failing file", storedOf(good), good, row({ status: "FAIL (exit 1)" }), /a\.heavy\.test\.js didn't pass/],
  ];
  for (const [what, stored, run, r, re] of cases) assert.ok(H.eligibility(stored, run, r).some((p) => re.test(p)), `${what}: ${H.eligibility(stored, run, r).join("; ")}`);
  // A file's own failure exits the tier 1: that's the file's verdict; its passing siblings stay eligible.
  const mixed = runOf({}, [row(), row({ file: "b.heavy.test.js", status: "FAIL (exit 1)" })]);
  assert.deepEqual(H.eligibility(storedOf(mixed, receipt({ code: 1 })), mixed, mixed.files[0]), []);
  // Sol's probe: a clean 3090 record stored with a 4070, other-commit, unbound receipt.
  const claim = H.eligibility(storedOf(good, receipt({ machine: A4070, evidence: { commit: other, bound: false, why: "the tree changed" } })), good);
  assert.ok(claim.some((p) => /isn't evidence/.test(p)) && claim.some((p) => /ran on RTX 4070/.test(p)), claim.join("; "));
});

const canonical: Canonical = { files: ["a.heavy.test.js", "b.heavy.test.js"], budgetOf: (f) => (f === "b.heavy.test.js" ? 2048 : 1024) };
const fullRun = (over: Partial<Run> = {}, files = [row(), row({ file: "b.heavy.test.js", budgetMiB: 2048, budgetPct: 25 })]) => runOf(over, files);

test("the full-tier check: eligible, every heavy file at the gate's commit, each at its canonical budget (R1-1)", () => {
  assert.deepEqual(H.fullTierProblems(storedOf(fullRun()), head, canonical), []);
  const cases: [Stored | null, RegExp][] = [
    [null, /weren't recorded/], [{ ticket: "t", receipt: receipt(), runs: [] }, /weren't recorded/],
    [storedOf(fullRun({ override: { budgetMiB: 8000, budgetsFile: null }, budgetEvidence: false })), /not budget evidence/],
    [storedOf(fullRun({ override: { budgetMiB: null, budgetsFile: "/tmp/raised.json" }, budgetEvidence: false })), /not budget evidence.*raised\.json/],
    // A record that claims budget evidence at a raised budget still fails on the canonical comparison.
    [storedOf(fullRun({}, [row({ budgetMiB: 1536, budgetPct: 33 }), row({ file: "b.heavy.test.js", budgetMiB: 2048 })])), /a\.heavy\.test\.js 1536 MiB, canonical 1024/],
    [storedOf(fullRun({}, [row()])), /files aren't the heavy tier .*missing b\.heavy\.test\.js/],
    [storedOf(fullRun({}, [row(), row({ file: "b.heavy.test.js", budgetMiB: 2048 }), row({ file: "z.heavy.test.js" })])), /extra z\.heavy\.test\.js/],
    [storedOf(fullRun({ selection: { kind: "subset", files: 2 } })), /not the full heavy tier/],
    [storedOf(fullRun({ commit: other }), receipt({ evidence: { commit: other, bound: true } })), /results are for ffffffffffff/],
    [storedOf(fullRun(), receipt({ evidence: { commit: head, bound: false } })), /isn't evidence for a commit/],
  ];
  for (const [stored, re] of cases) assert.ok(H.fullTierProblems(stored, head, canonical).some((p) => re.test(p)), `${re}: ${H.fullTierProblems(stored, head, canonical).join("; ")}`);
  assert.ok(H.fullTierProblems(storedOf(fullRun()), head, null).some((p) => /couldn't be read/.test(p)), "no canonical facts: no pass");
  const real = H.canonicalAt(resolve("."), head)!;
  assert.ok(real.files.includes("heavy-tier.heavy.test.js") && real.files.every((f) => f.endsWith(".heavy.test.js")));
  assert.equal(real.budgetOf("world-stream.heavy.test.js"), 1536);
  assert.equal(H.canonicalAt(resolve("."), other), null);
});

test("budget alerts read eligible rows only", () => {
  const near = runOf({}, [row({ file: "near.heavy.test.js", peakMiB: 880, budgetPct: 85.9 }), row()]);
  const override = runOf({ override: { budgetMiB: 8000, budgetsFile: null }, budgetEvidence: false }, [row({ file: "inflated.heavy.test.js", peakMiB: 7000, budgetMiB: 8000, budgetPct: 87.5 })]);
  const unbound = runOf({}, [row({ file: "unbound.heavy.test.js", budgetPct: 95 })]);
  const rows = [[near, receipt()], [override, receipt()], [unbound, receipt({ evidence: { commit: head, bound: false } })]].flatMap(([run, rc]) =>
    (run as Run).files.map((r) => ({ stored: storedOf(run as Run, rc as Receipt), run: run as Run, row: r })));
  assert.deepEqual(H.nearBudget(rows).map((r) => r.row.file), ["near.heavy.test.js"]);
  assert.equal(H.NEAR_PCT, 85);
});

test("a control arm: an eligible row at exactly the intended clean commit, same file and harness, equal conditions, a clean cache use (R1-2)", () => {
  const candidate = { run: runOf({ commit: other, ticket: "261025-000000-cand" }), row: row({ closure: "branchclosure" }) };
  const control = (run: Run = runOf(), r: Row = row(), rc: Receipt = receipt()) => ({ stored: storedOf(run, rc), run, row: r });
  assert.deepEqual(H.controlProblems(candidate, control(), head), [], "the closure differs between arms by design");
  const cases: [string, ReturnType<typeof control>, RegExp][] = [
    ["another commit", control(runOf({ commit: other }), row(), receipt({ evidence: { commit: other, bound: true } })), /not the intended control/],
    ["another file", control(runOf(), row({ file: "b.heavy.test.js" })), /measured b\.heavy\.test\.js/],
    ["another harness", control(runOf({ harnessHash: "older" })), /different measuring harness/],
    ["no closure", control(runOf(), row({ closure: null })), /closure wasn't recorded/],
    ["machine", control(runOf({ machine: A4070 }), row(), receipt({ machine: A4070 })), /machine: RTX 4070/],
    ["job limit", control(runOf({ jobMemoryMiB: 6144 })), /jobMemoryMiB: 6144 against 3072/],
    ["pool", control(runOf({ poolMiB: 4608 })), /poolMiB/], ["concurrency", control(runOf({ concurrency: 1 })), /concurrency: 1 against 3/],
    ["CPUs", control(runOf({ jobCpus: 6 })), /jobCpus/], ["containment", control(runOf({ containment: "process group" })), /containment/],
    ["budget", control(runOf(), row({ budgetMiB: 2048 })), /budgetMiB: 2048 against 1024/], ["phase", control(runOf(), row({ phase: "timing" })), /phase/],
    ["node", control(runOf({ node: "v24.22.1" })), /node: v24\.22\.1/],
    // Sol's probe: a warm store, but this file built its data (a fill) where the candidate loaded it (a hit).
    ["cache use", control(runOf(), row({ cache: { hits: 0, misses: 1, fills: 1, fillMs: 90 }, cacheUse: "fill" })), /cacheUse: fill against hit/],
    ["mixed cache use", control(runOf(), row({ cache: { hits: 1, misses: 1, fills: 1, fillMs: 9 }, cacheUse: "mixed" })), /neither a cold nor a warm/],
    ["ineligible", control(runOf(), row(), receipt({ evidence: { commit: head, bound: false } })), /isn't evidence/],
  ];
  for (const [what, c, re] of cases) assert.ok(H.controlProblems(candidate, c, head).some((p) => re.test(p)), `${what}: ${H.controlProblems(candidate, c, head).join("; ")}`);
  assert.deepEqual(Object.keys(H.identityOf(candidate.run, candidate.row)), ["commit", "file", "closure", "lock", "harness"]);
  assert.deepEqual(Object.keys(H.conditionsOf(candidate.run, candidate.row)).sort(),
    ["budgetMiB", "cacheUse", "concurrency", "containment", "jobCpus", "jobMemoryMiB", "machine", "node", "phase", "poolMiB"]);
});

/** A private queue root with one finished job whose output holds `records`. */
function job(sched: string, ticket: string, records: Run[], exit: Partial<Receipt> = {}) {
  const dir = join(sched, "jobs", ticket);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(join(dir, "output.log"), ["--- a.heavy.test.js", "ok", ...records.map((r) => H.recordLine(r)), "alickers-job: tested x exit 0"].join("\n"));
  fs.writeFileSync(join(dir, "exit.json"), JSON.stringify({ ticket, code: 0, stopReason: null, class: "heavy-suite", memMiB: 3072, machine: F3090, machineTag: "any",
    evidence: { commit: head, bound: true }, ...exit }));
}
const cli = (env: Record<string, string>, ...args: string[]) => spawnSync(process.execPath, ["scripts/heavy-results.mjs", ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("ingest stores records with their receipt, once; show, near and control read them with their eligibility", () => {
  const sched = temp("siltwake-results-sched-"), results = temp("siltwake-results-store-"), env = { SILTWAKE_SCHED_DIR: sched, SILTWAKE_RESULTS_DIR: results };
  const A = "261025-000000-aaaa", B = "261025-000000-bbbb", C = "261025-000000-cccc", D = "261025-000000-dddd", E = "261025-000000-eeee";
  job(sched, A, [runOf({ ticket: A }, [row(), row({ file: "near.heavy.test.js", peakMiB: 900, budgetPct: 87.9, oomKillsNested: 3 })])]);
  job(sched, B, [runOf({ ticket: B, override: { budgetMiB: 8000, budgetsFile: null }, budgetEvidence: false }, [row({ budgetMiB: 8000, budgetPct: 6.4 })])]);
  job(sched, C, []);
  fs.mkdirSync(join(sched, "jobs", D));
  // Sol's R1-3 probe: a record claiming the clean 3090 run, stored with a 4070, unbound receipt.
  job(sched, E, [runOf({ ticket: E }, [row({ file: "near.heavy.test.js", budgetPct: 99 })])], { machine: A4070, evidence: { commit: other, bound: false, why: "the tree changed" } });
  const first = cli(env, "ingest");
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /261025-000000-aaaa: stored 2 file rows from 1 run\(s\)/);
  assert.match(first.stdout, /3 new run\(s\) stored/);
  const stored = JSON.parse(fs.readFileSync(join(results, "heavy", "runs", `${A}.json`), "utf8")) as Stored;
  assert.deepEqual([stored.receipt!.ticket, stored.receipt!.machine, stored.receipt!.evidence!.bound], [A, F3090, true]);
  assert.match(cli(env, "ingest", A, C, D).stdout, /aaaa: already stored\n.*cccc: no heavy-results record\n.*dddd: not finished/);
  assert.match(cli(env, "show", "--file", "near", "--commit", head.slice(0, 12)).stdout,
    /near\.heavy\.test\.js ok 4\.2 s, cpu 9\.1 s \(tree\), peak 900\/1024 MiB \(87\.9%\), oom 0\+3; cache warm at start, 3 hits 0 fills \(hit\); job limit 3072 MiB\n/);
  assert.match(cli(env, "show").stdout, /6\.4%\).*NOT BUDGET EVIDENCE.*NOT ELIGIBLE/);
  assert.match(cli(env, "show", "--file", "near").stdout, /261025-000000-eeee near\.heavy\.test\.js .*NOT ELIGIBLE: .*isn't evidence for a commit.*ran on RTX 4070/);
  const eligible = cli(env, "show", "--eligible").stdout.trim().split("\n");
  assert.equal(eligible.length, 2, eligible.join("\n"));
  const near = cli(env, "near").stdout.trim().split("\n");
  assert.equal(near.length, 1, "only the eligible near row, not the 99% unbound one nor the override");
  assert.match(near[0]!, /261025-000000-aaaa near\.heavy\.test\.js/);
  const json = JSON.parse(cli(env, "show", "--json", "--file", "a.heavy", "--eligible").stdout) as { identity: { commit: string; file: string }; conditions: { cacheUse: string }; eligibility: string[] };
  assert.deepEqual([json.identity.commit, json.identity.file, json.conditions.cacheUse, json.eligibility], [head, "a.heavy.test.js", "hit", []]);
  assert.equal(cli(env, "control", "--commit", head.slice(0, 12), "--file", "a").status, 2, "a control is named by its full SHA");
  assert.match(cli(env, "control", "--commit", head, "--file", "a.heavy").stdout, /261025-000000-aaaa/);
  assert.match(cli(env, "control", "--commit", head, "--file", "a.heavy", "--like", B).stdout, /aaaa a\.heavy\.test\.js: not a control: .*budgetMiB: 1024 against 8000/);
});

test("the gate's heavy step: queued on any machine, stored, and judged on its eligible full-tier record at canonical budgets", () => {
  const sched = temp("siltwake-gate-heavy-sched-"), results = temp("siltwake-gate-heavy-results-"), q = temp("siltwake-gate-heavy-queue-");
  const queue = join(q, "heavy-check"), T = "261025-000000-heav";
  // A stand-in client: submit records argv; wait writes the job's log and receipt where ingest reads them.
  fs.writeFileSync(queue, `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
if (process.argv[2] === "submit") { fs.writeFileSync(${JSON.stringify(join(q, "argv.json"))}, JSON.stringify(process.argv.slice(3))); console.log(${JSON.stringify(T)}); process.exit(0); }
const dir = path.join(process.env.SILTWAKE_SCHED_DIR, "jobs", process.argv[3]);
fs.mkdirSync(dir, { recursive: true });
const receipt = { ticket: process.argv[3], code: 0, stopReason: null, machine: ${JSON.stringify(A4070)}, evidence: { commit: ${JSON.stringify(head)}, bound: true } };
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
  // Every heavy file at this commit, each at its canonical budget.
  const canon = H.canonicalAt(resolve("."), head)!;
  const files = canon.files.map((f) => row({ file: f, budgetMiB: canon.budgetOf(f) }));
  const good = runOf({ machine: A4070, ticket: T, selection: { kind: "full", files: files.length } }, files);
  const ok = gate(good);
  assert.deepEqual(JSON.parse(fs.readFileSync(join(q, "argv.json"), "utf8")), ["--class", "heavy-suite", "--machine", "any", "--review", "--", "npm", "run", "test:heavy"]);
  assert.match(ok.stdout, new RegExp(`gate: heavy results: stored ${files.length} file rows`));
  assert.match(ok.stdout, /^ {2}pass {2}heavy .*\[on RTX 4070 Laptop \(alickers, shared desktop host\)\]$/m, ok.stdout);
  const raised = files.map((f) => (f.file === "world-stream.heavy.test.js" ? { ...f, budgetMiB: 4096 } : f));
  for (const [record, re] of [
    [null, /weren't recorded/],
    // R1-1: an alternate budgets file is an override, and is refused.
    [{ ...good, override: { budgetMiB: null, budgetsFile: "/tmp/raised-budgets.json" }, budgetEvidence: false }, /not budget evidence .*raised-budgets\.json/],
    // …and a record claiming real budgets is checked against the canonical ones.
    [{ ...good, files: raised }, /world-stream\.heavy\.test\.js 4096 MiB, canonical 1536/],
    [{ ...good, files: files.slice(1) }, /files aren't the heavy tier .*missing/],
    [{ ...good, selection: { kind: "subset", files: 2 } }, /not the full heavy tier/],
    // R1-3: the record must agree with the receipt it's stored with.
    [{ ...good, machine: F3090 }, /receipt ran on RTX 4070 .*the record claims RTX 3090/],
  ] as const) {
    const r = gate(record as Run | null);
    assert.match(r.stdout, new RegExp(`^ {2}FAIL {2}heavy .*${re.source}`, "m"), r.stdout);
    assert.equal(r.status, 1);
  }
});

test("no gate step or script it runs chains commands in a way that can hide a failure (Measurement hygiene)", () => {
  const G = spawnSync(process.execPath, ["scripts/gate.mjs", "--list"], { encoding: "utf8" }).stdout;
  assert.doesNotMatch(G.split("\nafter the merge")[0]!, /\s(\||\|\||;)\s/);
  const scripts = (JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  for (const name of ["test:fast", "test:fast:direct", "build", "build:direct", "test:heavy", "playthrough", "playthrough:direct", "typecheck", "typecheck:direct"])
    assert.doesNotMatch(scripts[name]!.replace(/&&/g, ""), /[|;]/, `${name} chains with && only: a pipe, || or ; could hide a failing stage`);
});
