// test-tier: allow-escape spawns scripts/gate.mjs against a stand-in queue (a small node script); routed, nothing runs locally, and nothing loads Babylon.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The gate's local steps (STEW-2): on factory-worker (anywhere the local-run guard
// doesn't admit local CPU work) the gate runs no local step here. Every local step
// goes to the queue as one `--machine any` job (`gate.mjs --batch`), after the
// queued steps they follow, and each is reported from that job's per-step results
// and judged on its receipt. Where it is admitted (a job, alickers, the override)
// they run directly.

test("routing: the batch follows the queued steps a batched step comes after; the rest keep their order", () => {
  const economy = G.GATE.filter((s) => s.id.startsWith("economy:")).map((s) => s.id);
  assert.deepEqual(shape(G.routeSteps(G.GATE, true)), ["bake", `[fast,build,${economy.join(",")}]`, "playthrough"]);
  assert.deepEqual(shape(G.routeSteps(G.GATE, false)), G.GATE.map((s) => s.id), "not batched: the manifest's own order");
  assert.deepEqual(shape(G.routeSteps(ids(["bake", "build"]), true)), ["bake", "[build]"]);
  assert.deepEqual(shape(G.routeSteps(ids(["fast", "playthrough"]), true)), ["[fast]", "playthrough"]);
  assert.deepEqual(shape(G.routeSteps(ids(["bake", "playthrough"]), true)), ["bake", "playthrough"], "queued steps only: nothing to batch");
  assert.deepEqual(G.BATCH_QUEUE, ["--class", "standard", "--machine", "any"]);
});

test("a batched step's verdict is its own, plus every problem with the job's receipt", () => {
  const two = ["build", "economy:m1"];
  const pass = [{ id: "build", problems: [], s: 40 }, { id: "economy:m1", problems: [], s: 1 }];
  const oneFails = [{ id: "build", problems: [], s: 40 }, { id: "economy:m1", problems: ["exit 1"], s: 1 }];
  assert.deepEqual(G.batchResults(two, pass, good(), head), pass);
  assert.deepEqual(G.batchResults(two, oneFails, good({ code: 1 }), head), oneFails, "the job's exit 1 is that step's failure, not everyone's");
  const odd = G.batchResults(two, pass, good({ code: 1 }), head);
  assert.ok(odd.every((r) => r.problems.includes("exit 1")), "an exit 1 with every step passing is the job's problem");
  for (const [receipt, re] of [[good({ evidence: { commit: head, bound: false, why: "uncommitted changes" } }), /not evidence for a commit/],
    [good({ evidence: { commit: "f".repeat(40), bound: true } }), /tested ffffffffffff/], [good({ code: 124, stopReason: "stalled" }), /stopped: stalled/],
    [{ code: 99, pending: true }, /still pending/]] as const) {
    for (const r of G.batchResults(two, pass, receipt, head)) assert.ok(r.problems.some((p) => re.test(p)), `${r.id}: ${r.problems.join("; ")}`);
  }
  assert.ok(G.batchResults(two, null, good(), head).every((r) => r.problems[0] === "the queued job reported no per-step results"));
  assert.deepEqual(G.batchResults(two, [pass[0]!], good(), head)[1]!.problems, ["the queued job didn't run this step"]);
  assert.deepEqual(G.parseBatch(["noise", `gate-batch: ${JSON.stringify(pass)}`, "alickers-job: tested x exit 0"]), pass);
  assert.equal(G.parseBatch(["gate-batch: {broken"]), null);
});

const dirs: string[] = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
/** A stand-in heavy-check: records each submit's argv, and answers each wait with the job output and receipt GATE_JOBS gives for its kind. */
function standIn(): { queue: string; submitted: () => string[][] } {
  const dir = fs.mkdtempSync(join(tmpdir(), "siltwake-gate-route-"));
  dirs.push(dir);
  const queue = join(dir, "heavy-check");
  fs.writeFileSync(queue, `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const dir = ${JSON.stringify(dir)};
if (process.argv[2] === "submit") {
  const n = fs.readdirSync(dir).filter((f) => f.endsWith(".argv")).length;
  const ticket = "261024-000000-" + String(n).padStart(4, "0");
  fs.writeFileSync(path.join(dir, ticket + ".argv"), JSON.stringify(process.argv.slice(3)));
  console.log(ticket); process.exit(0);
}
const argv = JSON.parse(fs.readFileSync(path.join(dir, process.argv[3] + ".argv"), "utf8"));
const jobs = JSON.parse(process.env.GATE_JOBS), kind = argv.includes("--batch") ? "batch" : argv[argv.indexOf("--class") + 1];
const { lines = [], receipt } = jobs[kind];
for (const l of lines) console.log(l);
console.log(JSON.stringify(receipt));
process.exit(receipt.code);
`, { mode: 0o755 });
  const submitted = () => fs.readdirSync(dir).filter((f) => f.endsWith(".argv")).sort()
    .map((f) => JSON.parse(fs.readFileSync(join(dir, f), "utf8")) as string[]);
  return { queue, submitted };
}
/** The gate as an agent on factory-worker starts it: not in a job, not on the sandbox (strict), no override unless given. */
function gate(queue: string, jobs: object, args: string[], extra: Record<string, string> = {}) {
  const sched = fs.mkdtempSync(join(tmpdir(), "siltwake-gate-sched-"));
  dirs.push(sched);
  const env: NodeJS.ProcessEnv = { ...process.env, SILTWAKE_HEAVY_CHECK: queue, SILTWAKE_SCHED_DIR: sched, SILTWAKE_GUARD_STRICT: "1", GATE_JOBS: JSON.stringify(jobs), ...extra };
  for (const k of ["SILTWAKE_JOB_TICKET", "SILTWAKE_HEAVY_LOCK_HELD", "SILTWAKE_LOCAL_OVERRIDE", "SILTWAKE_LOCAL_OVERRIDE_LOGGED", "NODE_TEST_CONTEXT"]) if (!(k in extra)) delete env[k];
  return { ...spawnSync(process.execPath, ["scripts/gate.mjs", ...args], { encoding: "utf8", env }), sched };
}

test("on factory-worker the local steps run as one queued job after the bake, reported step by step", () => {
  const { queue, submitted } = standIn();
  const inner = [{ id: "build", problems: [], s: 41 }, { id: "economy:m1", problems: ["exit 1"], s: 2 }];
  const r = gate(queue, {
    bake: { receipt: good() },
    batch: { lines: ["…", `gate-batch: ${JSON.stringify(inner)}`, "alickers-job: tested x exit 1"], receipt: good({ code: 1 }) },
  }, ["--only", "build,bake,economy:m1", "--allow-dirty"]);
  const [bake, batch] = submitted();
  assert.deepEqual(bake!.slice(0, 2), ["--class", "bake"], "the bake first: the build expects it current");
  assert.deepEqual(batch, ["--class", "standard", "--machine", "any", "--review", "--", "node", "scripts/gate.mjs", "--batch", "build,economy:m1", "--allow-dirty"]);
  assert.equal(submitted().length, 2, "nothing else, and nothing ran here");
  assert.match(r.stdout, /local steps, as one queued job \(not inside a heavy-check job\)/);
  const table = r.stdout.slice(r.stdout.lastIndexOf("\ngate at "));
  assert.match(table, /pass {2}bake[\s\S]*pass {2}build {16}\s+41 s\n {2}FAIL {2}economy:m1 +2 s {2}exit 1\n/, table);
  assert.match(r.stdout, /gate FAILED: economy:m1/);
  assert.equal(r.status, 1);
});

test("--machine moves the batch too; --list shows it", () => {
  const { queue, submitted } = standIn();
  const r = gate(queue, { batch: { lines: [`gate-batch: ${JSON.stringify([{ id: "economy:m2-a", problems: [], s: 1 }])}`], receipt: good() } },
    ["--only", "economy:m2-a", "--machine", "4070"]);
  assert.deepEqual(submitted()[0]!.slice(0, 5), ["--class", "standard", "--machine", "4070", "--review"]);
  assert.match(r.stdout, /^ {2}pass {2}economy:m2-a /m, r.stdout + r.stderr);
  assert.equal(r.status, 0, r.stdout);
  const list = spawnSync(process.execPath, ["scripts/gate.mjs", "--list"], { encoding: "utf8" }).stdout;
  assert.match(list, /local steps, on factory-worker \(anywhere the local-run guard doesn't admit them\), all in one job:\n.*submit --class standard --machine any --review -- node scripts\/gate\.mjs --batch/);
});

test("admitted (here, the logged override) the local steps run directly, and nothing is queued", () => {
  const { queue, submitted } = standIn();
  const r = gate(queue, {}, ["--only", "economy:m2-a"], { SILTWAKE_LOCAL_OVERRIDE: "gate-routing test: one economy step" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(submitted().length, 0);
  assert.match(r.stdout, /── gate: economy:m2-a · .* \(directly: override: gate-routing test: one economy step\)/);
  assert.match(r.stdout, /^ {2}pass {2}economy:m2-a /m);
  assert.equal(fs.readFileSync(join(r.sched, "local-overrides.jsonl"), "utf8").trim().split("\n").length, 1, "logged once");
});

test("a batch job that prints no per-step results fails every batched step; --batch takes local steps only", () => {
  const { queue } = standIn();
  const r = gate(queue, { batch: { lines: ["crashed early"], receipt: good({ code: 2 }) } }, ["--only", "fast,economy:m1"]);
  assert.match(r.stdout, /FAIL {2}fast .*the queued job reported no per-step results; exit 2/);
  assert.match(r.stdout, /FAIL {2}economy:m1 .*the queued job reported no per-step results/);
  const bad = spawnSync(process.execPath, ["scripts/gate.mjs", "--batch", "build,bake"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--batch takes local steps only: bake/);
});
