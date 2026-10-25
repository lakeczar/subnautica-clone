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
  budgetMiB: number; budgetPct: number | null; oomKillsOwn: number | null; oomKillsNested: number | null; cache: Cache | null; cacheUse: string | null; closure: string | null;
  provenance: Provenance }
interface Provenance { complete: boolean; why: string[]; inputs: number; inputsHash: string; unobserved?: string[] }
interface Run { v: number; at: string; commit: string | null; dirty: boolean | null; machine: string; ticket: string | null; containment: string; jobMemoryMiB: number | null;
  poolMiB: number; concurrency: number; jobCpus: number | null; node: string; cache: { state: string; entries: number }; selection: { kind: string; files: number };
  override: { budgetMiB: number | null; budgetsFile: string | null } | null; budgetEvidence: boolean; lockHash: string; harnessHash: string; attempt: string | null;
  settings: Record<string, string>; files: Row[] }
interface Receipt { ticket?: string | null; remote?: boolean; attempts?: number; code: number; stopReason?: string | null; label?: string | null; machine: string | null; evidence: { commit: string | null; bound: boolean; why?: string | null } | null; disturbed?: boolean | null }
interface Stored { ticket: string; receipt: Receipt | null; runs: Run[] }
interface Report { pid: number; ppid?: number; threadId: number; store?: boolean; cache?: Cache | null; loads?: string[]; reads?: string[]; produced?: string[];
  spawned?: { pid: number | null; cmd: string }[]; workers?: number[]; cpuMs?: number }
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
  controlProblems(candidate: { run: Run; row: Row }, control: { stored: Stored; run: Run; row: Row }, commit: string, peers?: { ticket: string; run: Run; row: Row }[]): string[];
  schemaProblems(r: unknown): string[];
  workloadSettings(env: Record<string, string | undefined>): Record<string, string>;
  canonicalEnv(env: Record<string, string | undefined>): Record<string, string | undefined>;
  isWorkloadKey(k: string): boolean;
  attemptOf(env: Record<string, string | undefined>): string | null;
  terminalAttempt(rc: Receipt | null): string;
  fileFacts(reports: Report[], rootPid: number, ctx: object): { cache: Cache | null; cacheUse: string | null; provenance: Provenance };
  publish(target: string, value: unknown): boolean;
  sweep(o: { max?: number; maxLogBytes?: number; env?: Record<string, string>; now?: number }): { scanned: number; stored: number; noRecord: number; running: number; tooLarge: string[]; failures: string[]; remaining: number };
  sweepStatus(env: Record<string, string>, now?: number): { ok: boolean; why: string };
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
  budgetMiB: 1024, budgetPct: 50, oomKillsOwn: 0, oomKillsNested: 0, cache: { hits: 3, misses: 0, fills: 0, fillMs: 0 }, cacheUse: "hit", closure: "c0ffee",
  provenance: { complete: true, why: [], inputs: 3, inputsHash: "1npu7" }, ...over });
const runOf = (over: Partial<Run> = {}, files: Row[] = [row()]): Run => ({ v: 3, attempt: "local", settings: {}, at: "2026-10-25T00:00:00.000Z", commit: head, dirty: false, machine: F3090, ticket: "261025-000000-aaaa",
  containment: "cgroup", jobMemoryMiB: 3072, poolMiB: 2560, concurrency: 3, jobCpus: 3, node: "v24.21.0", cache: { state: "warm", entries: 12 }, selection: { kind: "full", files: files.length },
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

test("only complete records are records: a v3 record missing its context or a row's provenance is skipped (never published)", () => {
  assert.deepEqual(H.schemaProblems(runOf()), []);
  const { attempt: _a, ...noAttempt } = runOf();
  const { provenance: _p, ...noProv } = row();
  for (const [what, r] of [["no attempt", noAttempt], ["a row without provenance", runOf({}, [noProv as Row])], ["no settings", { ...runOf(), settings: null }],
    ["fewer rows than its selection", { ...runOf(), selection: { kind: "full", files: 2 } }], ["an unknown version", { ...runOf(), v: 9 }]] as const) {
    assert.notDeepEqual(H.schemaProblems(r), [], what);
    assert.deepEqual(H.recordsIn(H.recordLine(r as Run)), [], what);
  }
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
    // R2-5: only the attempt the receipt reports on is its evidence.
    ["an abandoned alickers attempt", storedOf(runOf({ attempt: "alickers:a1", machine: A4070 })), runOf({ attempt: "alickers:a1", machine: A4070 }), null,
      /from attempt alickers:a1, not the job's terminal attempt \(local\)/],
    ["an earlier alickers attempt", storedOf(runOf({ attempt: "alickers:a1", machine: A4070 }), receipt({ remote: true, attempts: 2, machine: A4070 })),
      runOf({ attempt: "alickers:a1", machine: A4070 }), null, /not the job's terminal attempt \(alickers:a2\)/],
  ];
  for (const [what, stored, run, r, re] of cases) assert.ok(H.eligibility(stored, run, r).some((p) => re.test(p)), `${what}: ${H.eligibility(stored, run, r).join("; ")}`);
  // A file's own failure exits the tier 1: that's the file's verdict; its passing siblings stay eligible.
  const mixed = runOf({}, [row(), row({ file: "b.heavy.test.js", status: "FAIL (exit 1)" })]);
  assert.deepEqual(H.eligibility(storedOf(mixed, receipt({ code: 1 })), mixed, mixed.files[0]), []);
  // Sol's probe: a clean 3090 record stored with a 4070, other-commit, unbound receipt.
  const claim = H.eligibility(storedOf(good, receipt({ machine: A4070, evidence: { commit: other, bound: false, why: "the tree changed" } })), good);
  assert.ok(claim.some((p) => /isn't evidence/.test(p)) && claim.some((p) => /ran on RTX 4070/.test(p)), claim.join("; "));
  const remote = runOf({ attempt: "alickers:a1", machine: A4070 });
  assert.deepEqual(H.eligibility(storedOf(remote, receipt({ remote: true, attempts: 1, machine: A4070 })), remote), [], "a remote terminal attempt");
  assert.deepEqual([H.terminalAttempt(receipt()), H.terminalAttempt(receipt({ remote: true, attempts: 3 }))], ["local", "alickers:a3"]);
  assert.deepEqual([H.attemptOf({ SILTWAKE_JOB_TICKET: "t" }), H.attemptOf({ SILTWAKE_LANE_TICKET: "t", SILTWAKE_JOB_HEARTBEAT: "/lane/jobs/t/a2/heartbeat" }),
    H.attemptOf({ SILTWAKE_LANE_TICKET: "t" }), H.attemptOf({})], ["local", "alickers:a2", "alickers:?", null]);
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
    // R2-2: a curtailed workload isn't the full tier.
    [storedOf(fullRun({ settings: { SILTWAKE_TIMELINE_SEQUENCES: "0" } })), /ran with workload settings \(SILTWAKE_TIMELINE_SEQUENCES\)/],
    // R2-5: no record from the attempt the receipt reports on.
    [storedOf(fullRun({ attempt: "alickers:a1", machine: A4070 })), /no complete v3 record from the job's terminal attempt \(local\); records seen from: alickers:a1/],
  ];
  for (const [stored, re] of cases) assert.ok(H.fullTierProblems(stored, head, canonical).some((p) => re.test(p)), `${re}: ${H.fullTierProblems(stored, head, canonical).join("; ")}`);
  assert.ok(H.fullTierProblems(storedOf(fullRun()), head, null).some((p) => /couldn't be read/.test(p)), "no canonical facts: no pass");
  // R2-5, Sol's probe: alickers finished, its receipt was lost, the job reran here and passed. The
  // abandoned attempt's record stays as a diagnostic; the terminal attempt's decides.
  const retried: Stored = { ticket: "261025-000000-aaaa", receipt: receipt(), runs: [fullRun({ attempt: "alickers:a1", machine: A4070 }), fullRun()] };
  assert.deepEqual(H.fullTierProblems(retried, head, canonical), []);
  const failedHere: Stored = { ...retried, runs: [fullRun({ attempt: "alickers:a1", machine: A4070 }), fullRun({}, [row(), row({ file: "b.heavy.test.js", budgetMiB: 2048, status: "FAIL (exit 1)" })])] };
  assert.equal(H.fullTierProblems(failedHere, head, canonical).length, 0, "a failing file is the receipt's failure, judged by the gate's receipt check");
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
    // R2-1: each arm's inputs must be fully known.
    ["control's inputs unknown", control(runOf(), row({ provenance: { complete: false, why: ["read inputs the commit doesn't determine: x.json"], inputs: 1, inputsHash: "?" } })),
      /control's inputs aren't fully known \(read inputs the commit doesn't determine: x\.json\)/],
    // R2-3: a descendant's cache use unobserved.
    ["unknown cache use", control(runOf(), row({ cacheUse: "unknown" })), /cacheUse: unknown against hit/],
    // R2-2: a different workload.
    ["workload", control(runOf({ settings: { SILTWAKE_TIMELINE_SEQUENCES: "0" } })), /settings: \{"SILTWAKE_TIMELINE_SEQUENCES":"0"\} against \{\}/],
  ];
  for (const [what, c, re] of cases) assert.ok(H.controlProblems(candidate, c, head).some((p) => re.test(p)), `${what}: ${H.controlProblems(candidate, c, head).join("; ")}`);
  const unknownCandidate = { ...candidate, row: row({ closure: "branchclosure", provenance: { complete: false, why: ["started what never reported: sh"], inputs: 0, inputsHash: "?" } }) };
  assert.ok(H.controlProblems(unknownCandidate, control(), head).some((p) => /candidate's inputs aren't fully known/.test(p)), "the candidate's provenance too");
  // Sol's collision: two complete runs of the same commit and closure that read different inputs.
  const peer = { ticket: "261025-000000-peer", run: runOf({ ticket: "261025-000000-peer" }), row: row({ provenance: { complete: true, why: [], inputs: 3, inputsHash: "d1ff" } }) };
  assert.ok(H.controlProblems(candidate, control(), head, [peer]).some((p) => /read different inputs \(261025-000000-peer\): not reproducible/.test(p)));
  assert.deepEqual(H.controlProblems(candidate, control(), head, [{ ...peer, row: row() }]), [], "an agreeing peer is fine");
  assert.deepEqual(Object.keys(H.identityOf(candidate.run, candidate.row)), ["commit", "file", "closure", "inputs", "lock", "harness"]);
  assert.deepEqual(Object.keys(H.conditionsOf(candidate.run, candidate.row)).sort(),
    ["budgetMiB", "cacheUse", "concurrency", "containment", "jobCpus", "jobMemoryMiB", "machine", "node", "phase", "poolMiB", "settings"]);
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

/** The gate's heavy step against a stand-in client: submit records argv and env; wait writes the job's log
 * (GATE_HEAVY_LOG: lines) and receipt (GATE_RECEIPT) where ingest reads them, and with GATE_RACE ingests
 * them itself first, as a sweep running at the same moment would. */
function heavyGate() {
  const sched = temp("siltwake-gate-heavy-sched-"), results = temp("siltwake-gate-heavy-results-"), q = temp("siltwake-gate-heavy-queue-");
  const queue = join(q, "heavy-check"), T = "261025-000000-heav";
  fs.writeFileSync(queue, `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
if (process.argv[2] === "submit") {
  fs.writeFileSync(${JSON.stringify(join(q, "argv.json"))}, JSON.stringify(process.argv.slice(3)));
  fs.writeFileSync(${JSON.stringify(join(q, "env.json"))}, JSON.stringify(process.env));
  console.log(${JSON.stringify(T)}); process.exit(0);
}
const dir = path.join(process.env.SILTWAKE_SCHED_DIR, "jobs", process.argv[3]);
fs.mkdirSync(dir, { recursive: true });
const receipt = { ticket: process.argv[3], code: 0, stopReason: null, evidence: { commit: ${JSON.stringify(head)}, bound: true }, ...JSON.parse(process.env.GATE_RECEIPT) };
fs.writeFileSync(path.join(dir, "output.log"), JSON.parse(process.env.GATE_HEAVY_LOG).join("\\n") + "\\n");
fs.writeFileSync(path.join(dir, "exit.json"), JSON.stringify(receipt));
if (process.env.GATE_RACE) spawnSync(process.execPath, ["scripts/heavy-results.mjs", "ingest", process.argv[3]], { stdio: "ignore" });
console.log("job output"); console.log(JSON.stringify(receipt));
`, { mode: 0o755 });
  const canon = H.canonicalAt(resolve("."), head)!;
  const files = canon.files.map((f) => row({ file: f, budgetMiB: canon.budgetOf(f) }));
  const record = (over: Partial<Run> = {}, fs_ = files) => runOf({ machine: A4070, ticket: T, attempt: "alickers:a1", ...over }, fs_);
  const remote = { machine: A4070, remote: true, attempts: 1 };
  const run = (log: (Run | string)[], rc: object = remote, extra: Record<string, string> = {}) => {
    fs.rmSync(join(results, "heavy"), { recursive: true, force: true });
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith("SILTWAKE_") || k === "NODE_OPTIONS" || k === "NODE_TEST_CONTEXT") delete env[k];
    const r = spawnSync(process.execPath, ["scripts/gate.mjs", "--only", "heavy", "--allow-dirty"], { encoding: "utf8",
      env: { ...env, SILTWAKE_HEAVY_CHECK: queue, SILTWAKE_SCHED_DIR: sched, SILTWAKE_RESULTS_DIR: results, GATE_RECEIPT: JSON.stringify(rc),
        GATE_HEAVY_LOG: JSON.stringify(log.map((l) => (typeof l === "string" ? l : H.recordLine(l)))), ...extra } });
    return { ...r, argv: JSON.parse(fs.readFileSync(join(q, "argv.json"), "utf8")) as string[], env: JSON.parse(fs.readFileSync(join(q, "env.json"), "utf8")) as Record<string, string> };
  };
  return { files, record, remote, run };
}

test("the gate's heavy step: queued on any machine, stored, and judged on its eligible full-tier record at canonical budgets", () => {
  const { files, record, run } = heavyGate();
  const ok = run([record()]);
  assert.deepEqual(ok.argv, ["--class", "heavy-suite", "--machine", "any", "--review", "--", "npm", "run", "test:heavy"]);
  assert.match(ok.stdout, new RegExp(`gate: heavy results: stored ${files.length} file rows`));
  assert.match(ok.stdout, /^ {2}pass {2}heavy .*\[on RTX 4070 Laptop \(alickers, shared desktop host\)\]$/m, ok.stdout);
  const raised = files.map((f) => (f.file === "world-stream.heavy.test.js" ? { ...f, budgetMiB: 4096 } : f));
  for (const [log, re] of [
    [["no record"], /weren't recorded/],
    // R1-1: an alternate budgets file is an override, and is refused.
    [[record({ override: { budgetMiB: null, budgetsFile: "/tmp/raised-budgets.json" }, budgetEvidence: false })], /not budget evidence .*raised-budgets\.json/],
    // …and a record claiming real budgets is checked against the canonical ones.
    [[record({}, raised)], /world-stream\.heavy\.test\.js 4096 MiB, canonical 1536/],
    [[record({}, files.slice(1))], /files aren't the heavy tier .*missing/],
    [[record({ selection: { kind: "subset", files: files.length } })], /not the full heavy tier/],
    // R1-3: the record must agree with the receipt it's stored with.
    [[record({ machine: F3090 })], /receipt ran on RTX 4070 .*the record claims RTX 3090/],
    // R2-2: a curtailed workload.
    [[record({ settings: { SILTWAKE_TIMELINE_SEQUENCES: "0" } })], /ran with workload settings \(SILTWAKE_TIMELINE_SEQUENCES\)/],
  ] as const) {
    const r = run(log as unknown as (Run | string)[]);
    assert.match(r.stdout, new RegExp(`^ {2}FAIL {2}heavy .*${re.source}`, "m"), r.stdout);
    assert.equal(r.status, 1);
  }
});

test("the gate's heavy step runs the canonical workload: the caller's workload settings and budget overrides stay out of its job (R2-2)", () => {
  const { record, run } = heavyGate();
  const r = run([record()], undefined, { SILTWAKE_TIMELINE_SEQUENCES: "0", SILTWAKE_TIMELINE_SEED_BASE: "7", NODE_OPTIONS: "--max-old-space-size=4096",
    SILTWAKE_HEAVY_BUDGETS: "/tmp/raised.json", SILTWAKE_HEAVY_BUDGET_MIB: "8000" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /gate: heavy runs the canonical workload, without NODE_OPTIONS, SILTWAKE_TIMELINE_SEED_BASE, SILTWAKE_TIMELINE_SEQUENCES/);
  for (const k of ["SILTWAKE_TIMELINE_SEQUENCES", "SILTWAKE_TIMELINE_SEED_BASE", "NODE_OPTIONS", "SILTWAKE_HEAVY_BUDGETS", "SILTWAKE_HEAVY_BUDGET_MIB"]) assert.equal(r.env[k], undefined, k);
  assert.ok(r.env.SILTWAKE_SCHED_DIR && r.env.SILTWAKE_RESULTS_DIR && r.env.PATH, "the queue's own settings stay");
  assert.equal(r.argv[r.argv.indexOf("--machine") + 1], "any", "so nothing pins it to the 3090");
});

test("the gate's heavy step after a fallback: alickers finished, its receipt was lost, the rerun here passed (R2-5)", () => {
  const { record, run } = heavyGate();
  const here = { machine: F3090, fellBack: { reason: "the connection to alickers was lost as the job ended", machine: "any", outage: true } };
  const queued = "heavy-check: the connection to alickers was lost as the job ended; its exit can't be checked against the transport's: queued again to run here";
  const ok = run([record(), queued, record({ machine: F3090, attempt: "local" })], here);
  assert.match(ok.stdout, /^ {2}pass {2}heavy .*\[on RTX 3090 \(factory-worker\)\]$/m, ok.stdout);
  // The abandoned attempt alone never passes, and a remote record never stands for the local receipt.
  const lost = run([record(), queued], here);
  assert.match(lost.stdout, /FAIL {2}heavy .*no complete v3 record from the job's terminal attempt \(local\); records seen from: alickers:a1/);
});

test("the gate's heavy step when a sweep stores the same ticket at the same moment: still a pass (R2-4)", () => {
  const { record, run } = heavyGate();
  const r = run([record()], undefined, { GATE_RACE: "1" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /gate: heavy results: already stored/);
  assert.match(r.stdout, /^ {2}pass {2}heavy /m);
});

test("concurrent ingests of one ticket: exactly one publishes, the rest see it stored, none fails (R2-4)", async () => {
  const sched = temp("siltwake-race-sched-"), results = temp("siltwake-race-store-"), go = join(sched, "go"), T = "261025-000000-race";
  job(sched, T, [runOf({ ticket: T })]);
  const worker = join(sched, "worker.mjs");
  fs.writeFileSync(worker, `import { existsSync } from "node:fs";
const { ingest } = await import(${JSON.stringify(pathToFileURL(resolve("scripts/heavy-results.mjs")).href)});
while (!existsSync(${JSON.stringify(go)})) await new Promise((r) => setTimeout(r, 1));
console.log(JSON.stringify(ingest([${JSON.stringify(T)}])[0]));
`);
  const { spawn } = await import("node:child_process");
  const runs = Array.from({ length: 6 }, () => new Promise<{ code: number | null; out: string; err: string }>((done) => {
    const c = spawn(process.execPath, [worker], { env: { ...process.env, SILTWAKE_SCHED_DIR: sched, SILTWAKE_RESULTS_DIR: results } });
    let out = "", err = "";
    c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { err += d; });
    c.on("exit", (code) => done({ code, out, err }));
  }));
  await new Promise((r) => setTimeout(r, 300));
  fs.writeFileSync(go, "");
  const done = await Promise.all(runs);
  assert.ok(done.every((d) => d.code === 0), done.map((d) => d.err).join("\n"));
  const outcomes = done.map((d) => JSON.parse(d.out) as { stored: boolean; already?: boolean });
  assert.equal(outcomes.filter((o) => o.stored).length, 1);
  assert.ok(outcomes.filter((o) => !o.stored).every((o) => o.already));
  const runsDir = join(results, "heavy", "runs");
  assert.deepEqual(fs.readdirSync(runsDir), [`${T}.json`], "no temporary file left behind");
  assert.equal((JSON.parse(fs.readFileSync(join(runsDir, `${T}.json`), "utf8")) as Stored).runs.length, 1);
  assert.equal(H.publish(join(runsDir, `${T}.json`), { other: true }), false, "publishing never replaces a stored run");
});

test("workload settings: recorded and labelled; queue grants and the harness's plumbing aren't settings (R2-2)", () => {
  const env = { SILTWAKE_TIMELINE_SEQUENCES: "0", SILTWAKE_TIMELINE_SEED_BASE: "1", SILTWAKE_BUILD_CACHE: "off", NODE_OPTIONS: "--x", JOURNEY_TRACE: "1",
    SILTWAKE_JOB_TICKET: "t", SILTWAKE_JOB_CPUS: "3", SILTWAKE_HEAVY_CONCURRENCY: "3", SILTWAKE_HEAVY_POOL_MIB: "2560", SILTWAKE_LANE_TICKET: "t", SILTWAKE_SCHED_DIR: "/s",
    SILTWAKE_RESULTS_DIR: "/r", SILTWAKE_HEAVY_BUDGETS: "/b", SILTWAKE_HEAVY_BUDGET_MIB: "9", SILTWAKE_TEST_BUILD: ".test-build-2", PATH: "/bin", SILTWAKE_EMPTY: "" };
  assert.deepEqual(H.workloadSettings({ NODE_OPTIONS: "--import=file:///w/scripts/test-heavy-file.mjs" }), {}, "the tier's own preload isn't a setting");
  assert.deepEqual(H.workloadSettings({ NODE_OPTIONS: "--import=file:///w/scripts/test-heavy-file.mjs --max-old-space-size=4096" }), { NODE_OPTIONS: "--max-old-space-size=4096" });
  assert.deepEqual(H.workloadSettings(env), { JOURNEY_TRACE: "1", NODE_OPTIONS: "--x", SILTWAKE_BUILD_CACHE: "off", SILTWAKE_TIMELINE_SEED_BASE: "1", SILTWAKE_TIMELINE_SEQUENCES: "0" });
  assert.deepEqual(Object.keys(H.canonicalEnv(env)).sort(), ["PATH", "SILTWAKE_EMPTY", "SILTWAKE_HEAVY_CONCURRENCY", "SILTWAKE_HEAVY_POOL_MIB", "SILTWAKE_JOB_CPUS",
    "SILTWAKE_JOB_TICKET", "SILTWAKE_LANE_TICKET", "SILTWAKE_RESULTS_DIR", "SILTWAKE_SCHED_DIR", "SILTWAKE_TEST_BUILD"]);
  // Every variable a heavy test or its helpers reads is either a workload setting or the harness's own.
  const harness = new Set(["SILTWAKE_HEAVY_CGROUP"]);
  const read = new Set<string>();
  for (const f of fs.readdirSync("tests").filter((n) => /(\.heavy\.test|-support|-heavy)\.ts$/.test(n)))
    for (const m of fs.readFileSync(join("tests", f), "utf8").matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) read.add(m[1]!);
  assert.ok(read.has("SILTWAKE_TIMELINE_SEQUENCES"), "the real timeline selector is read");
  for (const k of read) assert.ok(H.isWorkloadKey(k) || harness.has(k), `${k}: classify it (a workload setting, or the harness's own)`);
});

test("a file's facts: cache use and inputs aggregated over its processes; anything not fully known makes the provenance incomplete (R2-1, R2-3)", () => {
  const repo = temp("siltwake-facts-repo-"), build = join(repo, ".test-build"), cacheRoot = join(build, "build-cache"), tmp = temp("siltwake-facts-tmp-");
  for (const [f, text] of [["src/a.ts", "a"], ["tests/x.heavy.test.ts", "x"], [".test-build/src/a.js", "A"], [".test-build/tests/x.heavy.test.js", "X"],
    [".test-build/gen/mod.js", "generated"], ["public/terrain/manifest.json", "{}"], ["fixtures/ignored.json", "1"], [".test-build/build-cache/k/1.bin", "c"]] as const) {
    fs.mkdirSync(join(repo, f, ".."), { recursive: true }); fs.writeFileSync(join(repo, f), text);
  }
  const tracked = new Set(["src/a.ts", "tests/x.heavy.test.ts"]);
  const ctx = (declared = {}) => ({ root: repo, build, cacheRoot, tracked, declared, tmp });
  const base = (over: Partial<Report> = {}): Report => ({ pid: 10, threadId: 0, store: true, cache: { hits: 2, misses: 0, fills: 0, fillMs: 0 },
    loads: [join(build, "tests/x.heavy.test.js"), join(build, "src/a.js"), join(repo, "node_modules/p/i.js"), "/proc/self/status"],
    reads: [join(repo, "src/a.ts"), join(cacheRoot, "k/1.bin")], produced: [], spawned: [], workers: [], ...over });
  const facts = (reports: Report[], declared = {}) => H.fileFacts(reports, 10, ctx(declared));
  const clean = facts([base()]);
  assert.deepEqual([clean.provenance.complete, clean.provenance.inputs, clean.cacheUse], [true, 3, "hit"], JSON.stringify(clean));
  // Sol's computed import of a generated module, and a generated fixture read: the commit doesn't determine them.
  const computed = facts([base({ loads: [...base().loads!, join(build, "gen/mod.js")] })]);
  assert.match(computed.provenance.why.join(), /read inputs the commit doesn't determine: \.test-build\/gen\/mod\.js/);
  const fixture = facts([base({ reads: [...base().reads!, join(repo, "fixtures/ignored.json")] })]);
  assert.match(fixture.provenance.why.join(), /fixtures\/ignored\.json/);
  const outside = facts([base({ reads: ["/work/tmp/some-library/x.json"] })]);
  assert.match(outside.provenance.why.join(), /\/work\/tmp\/some-library\/x\.json/);
  // Declared generated or external inputs are complete, and hashed as the run found them.
  const terrain = base({ reads: [...base().reads!, join(repo, "public/terrain/manifest.json")] });
  const declared = facts([terrain], { generated: ["public/terrain/"] });
  assert.equal(declared.provenance.complete, true);
  fs.writeFileSync(join(repo, "public/terrain/manifest.json"), "{\"changed\":1}");
  assert.notEqual(facts([terrain], { generated: ["public/terrain/"] }).provenance.inputsHash, declared.provenance.inputsHash, "a changed generated input changes the identity");
  // What the file made itself (a mkdtemp, a write) isn't an input; a pre-existing directory it "made" again doesn't hide anything.
  const scratch = join(tmp, "siltwake-x-1");
  assert.equal(facts([base({ produced: [scratch], loads: [...base().loads!, join(scratch, "patched.js")], reads: [...base().reads!, join(scratch, "data.json")] })]).provenance.complete, true);
  // Children: a reporting node child adds its cache use; one that never reports makes it unknown and incomplete.
  const child = { pid: 11, threadId: 0, store: true, cache: { hits: 0, misses: 1, fills: 1, fillMs: 5 }, loads: [], reads: [], produced: [], spawned: [], workers: [] };
  const withChild = facts([base({ cache: { hits: 0, misses: 0, fills: 0, fillMs: 0 }, spawned: [{ pid: 11, cmd: "node" }] }), child]);
  assert.deepEqual([withChild.cacheUse, withChild.cache, withChild.provenance.complete], ["fill", { hits: 0, misses: 1, fills: 1, fillMs: 5 }, true]);
  const silent = facts([base({ spawned: [{ pid: 12, cmd: "node" }, { pid: null, cmd: "sh" }] })]);
  assert.deepEqual([silent.cacheUse, silent.provenance.complete], ["unknown", false]);
  assert.match(silent.provenance.why.join(), /started what never reported: node, sh/);
  const worker = facts([base({ workers: [3] })]);
  assert.deepEqual([worker.cacheUse, worker.provenance.why.join()], ["unknown", "started what never reported: worker thread 3"]);
  assert.equal(facts([base({ spawned: [{ pid: 13, cmd: "esbuild" }], workers: [3] })], { programs: ["esbuild"], workers: true }).cacheUse, "hit", "declared ones are accounted for");
  // A child without a store never touches the cache: its work doesn't depend on it.
  assert.equal(facts([base({ spawned: [{ pid: 11, cmd: "node" }] }), { ...child, store: false, cache: null }]).cacheUse, "hit");
  assert.deepEqual([facts([]).cacheUse, facts([]).provenance.why[0]], [null, "the file's own process didn't report (it died before its exit hook)"]);
  // The tier's declarations: every declared file exists.
  const manifest = JSON.parse(fs.readFileSync("tests/heavy-inputs.json", "utf8")) as { files: Record<string, { why: string }> };
  for (const [f, d] of Object.entries(manifest.files)) { assert.ok(fs.existsSync(join("tests", f)), f); assert.ok(d.why.length > 40, `${f}: says why`); }
});

test("the daily sweep: bounded, checkpointed, publishes terminal complete records only, and says when it's overdue", () => {
  const sched = temp("siltwake-sweep-sched-"), results = temp("siltwake-sweep-store-"), env = { SILTWAKE_SCHED_DIR: sched, SILTWAKE_RESULTS_DIR: results };
  job(sched, "261025-000000-0001", [runOf({ ticket: "261025-000000-0001" })]);
  job(sched, "261025-000000-0002", []);
  job(sched, "261025-000000-0003", [runOf({ ticket: "261025-000000-0003" })]);
  fs.writeFileSync(join(sched, "jobs", "261025-000000-0003", "output.log"), `heavy-results: ${JSON.stringify({ ...runOf(), attempt: undefined })}\n`); // incomplete
  fs.mkdirSync(join(sched, "jobs", "261025-000000-0004")); // still running
  job(sched, "261025-000000-0005", [runOf({ ticket: "261025-000000-0005" })]);
  const first = H.sweep({ max: 3, env });
  assert.deepEqual([first.scanned, first.stored, first.noRecord, first.running, first.remaining, first.failures], [3, 1, 2, 1, 1, []]);
  const second = H.sweep({ max: 3, env });
  assert.deepEqual([second.scanned, second.stored, second.running], [1, 1, 1], "the checkpoint skips what's been read; the rest is picked up");
  assert.deepEqual(fs.readdirSync(join(results, "heavy", "runs")).sort(), ["261025-000000-0001.json", "261025-000000-0005.json"]);
  assert.equal(H.sweep({ env, maxLogBytes: 10 }).tooLarge.length, 0, "nothing new to read");
  const status = H.sweepStatus(env);
  assert.ok(status.ok, status.why);
  assert.match(H.sweepStatus(env, Date.now() + 40 * 3600000).why, /overdue after 36 h/);
  assert.equal(cli(env, "sweep-status").status, 0);
  assert.match(H.sweepStatus({ SILTWAKE_RESULTS_DIR: temp("siltwake-sweep-none-") }).why, /no sweep has succeeded yet/);
  job(sched, "261025-000000-0006", [runOf({ ticket: "261025-000000-0006" })]);
  assert.deepEqual(H.sweep({ env, maxLogBytes: 10 }).tooLarge, ["261025-000000-0006"], "an oversized log is skipped, and noted");
});

test("the sweep's timer: a stable installed copy, one quick queued job a day on the 3090, persistent; not a worktree", () => {
  const dry = temp("siltwake-timer-dry-");
  const r = spawnSync("bash", ["scripts/heavy-results-timer.sh", "install", "--dry-run", dry], { encoding: "utf8", env: { ...process.env, SILTWAKE_SWEEP_QUEUE: "/q/heavy-check.mjs" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /systemctl --user daemon-reload\nsystemctl --user enable --now siltwake-heavy-results\.timer/);
  const share = join(dry, ".local/share/siltwake-results/sweep"), units = join(dry, ".config/systemd/user");
  const service = fs.readFileSync(join(units, "siltwake-heavy-results.service"), "utf8"), timer = fs.readFileSync(join(units, "siltwake-heavy-results.timer"), "utf8");
  assert.match(service, new RegExp(`^ExecStart=\\S+node /q/heavy-check\\.mjs run --class quick --review --machine 3090 --deadline 900 --queue-timeout 5400 -- \\S+node ${share}/current/heavy-results\\.mjs sweep --max 200$`, "m"));
  assert.match(service, /^Slice=siltwake\.slice$/m);
  assert.match(service, new RegExp(`^WorkingDirectory=${share}/current$`, "m"));
  assert.match(timer, /^Persistent=true$/m);
  assert.match(timer, /^OnCalendar=\*-\*-\* 05:30:00$/m);
  const copy = fs.realpathSync(join(share, "current", "heavy-results.mjs"));
  assert.equal(fs.readFileSync(copy, "utf8"), fs.readFileSync("scripts/heavy-results.mjs", "utf8"));
  assert.equal(fs.statSync(copy).mode & 0o222, 0, "the installed copy is read-only");
  const u = spawnSync("bash", ["scripts/heavy-results-timer.sh", "uninstall", "--dry-run", dry], { encoding: "utf8" });
  assert.equal(u.status, 0, u.stderr);
  assert.ok(!fs.existsSync(join(units, "siltwake-heavy-results.timer")));
});

test("no gate step or script it runs chains commands in a way that can hide a failure (Measurement hygiene)", () => {
  const G = spawnSync(process.execPath, ["scripts/gate.mjs", "--list"], { encoding: "utf8" }).stdout;
  assert.doesNotMatch(G.split("\nafter the merge")[0]!, /\s(\||\|\||;)\s/);
  const scripts = (JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  for (const name of ["test:fast", "test:fast:direct", "build", "build:direct", "test:heavy", "playthrough", "playthrough:direct", "typecheck", "typecheck:direct"])
    assert.doesNotMatch(scripts[name]!.replace(/&&/g, ""), /[|;]/, `${name} chains with && only: a pipe, || or ; could hide a failing stage`);
});
