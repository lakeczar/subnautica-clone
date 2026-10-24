// test-tier: allow-escape spawns scripts/gate.mjs against a stand-in queue (a small node script); neither loads Babylon or submits real work.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The merge gate (scripts/gate.mjs, STEW-1 R1): a queued step counts only on a
// terminal receipt that exited 0, has no stop reason, isn't DISTURBED and is evidence
// bound to the commit the gate pinned.
interface Receipt { code: number; stopReason?: string | null; label?: string | null; pending?: boolean;
  context?: { disturbed?: boolean } | null; evidence?: { commit: string | null; bound: boolean; why?: string | null } }
interface Gate {
  GATE: { id: string; queue?: string[]; run: string[] }[];
  receiptProblems(receipt: Receipt | null, commit: string): string[];
}
const G = await import(pathToFileURL(resolve("scripts/gate.mjs")).href) as Gate;
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const good = (over: Partial<Receipt> = {}): Receipt => ({ code: 0, stopReason: null, label: null, context: null, evidence: { commit: head, bound: true, why: null }, ...over });

test("a queued step's receipt counts only when it succeeded, undisturbed, as evidence for the pinned commit", () => {
  assert.deepEqual(G.receiptProblems(good(), head), []);
  const cases: [string, Receipt | null, RegExp][] = [
    ["nonzero", good({ code: 7 }), /^exit 7$/],
    ["cancelled", good({ code: 75, stopReason: "cancelled" }), /stopped: cancelled/],
    ["stopped with exit 0", good({ stopReason: "stalled" }), /stopped: stalled/],
    ["disturbed", good({ context: { disturbed: true } }), /DISTURBED/],
    ["unbound", good({ evidence: { commit: head, bound: false, why: "the worktree changed during the run" } }), /not evidence for a commit: the worktree changed/],
    ["wrong commit", good({ evidence: { commit: "0".repeat(40), bound: true } }), new RegExp(`tested 000000000000, not the gate's ${head.slice(0, 12)}`)],
    ["pending", { code: 99, pending: true }, /still pending/],
    ["no receipt", null, /no structured result/],
  ];
  for (const [name, receipt, re] of cases) {
    const problems = G.receiptProblems(receipt, head);
    assert.ok(problems.some((p) => re.test(p)), `${name}: ${problems.join("; ")}`);
  }
});

test("every heavy step of the manifest is queued with --review, so the gate judges its receipt", () => {
  const queued = G.GATE.filter((s) => s.queue).map((s) => s.id);
  assert.deepEqual(queued, ["bake", "playthrough"]);
  const list = spawnSync(process.execPath, ["scripts/gate.mjs", "--list"], { encoding: "utf8" }).stdout;
  for (const id of queued) assert.match(list, new RegExp(`${id}[\\s\\S]*?heavy-check\\.sh submit .*--review --`), id);
});

test("the real gate, against a stand-in queue: each receipt's verdict is the step's", () => {
  const dir = fs.mkdtempSync(join(tmpdir(), "siltwake-gate-")), queue = join(dir, "heavy-check");
  fs.writeFileSync(queue, `#!/usr/bin/env node
if (process.argv[2] === "submit") { console.log("261023-000000-test"); process.exit(0); }
console.log("job output");
console.log(process.env.GATE_RECEIPT);
process.exit(JSON.parse(process.env.GATE_RECEIPT).code);
`, { mode: 0o755 });
  const run = (receipt: Receipt) => spawnSync(process.execPath, ["scripts/gate.mjs", "--only", "bake", "--allow-dirty"],
    { encoding: "utf8", env: { ...process.env, SILTWAKE_HEAVY_CHECK: queue, GATE_RECEIPT: JSON.stringify(receipt) } });
  const ok = run(good());
  assert.match(ok.stdout, /gate: bake queued as 261023-000000-test/);
  assert.match(ok.stdout, /^ {2}pass {2}bake /m, ok.stdout);
  assert.match(ok.stdout, /this is a partial gate/);
  for (const [receipt, re] of [[good({ context: { disturbed: true } }), /DISTURBED/], [good({ evidence: { commit: head, bound: false } }), /not evidence/],
    [good({ code: 75, stopReason: "cancelled" }), /exit 75; stopped: cancelled/], [good({ evidence: { commit: "f".repeat(40), bound: true } }), /tested ffffffffffff/]] as const) {
    const r = run(receipt);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, new RegExp(`^ {2}FAIL {2}bake .*${re.source}`, "m"), r.stdout);
    assert.match(r.stdout, /gate FAILED: bake/);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the gate fails when the tree changes under it, and refuses to start on uncommitted changes", () => {
  // A throwaway repository holding just the gate, so its stand-in queue can edit a tracked file.
  const dir = fs.mkdtempSync(join(tmpdir(), "siltwake-gate-tree-")), queue = join(dir, "heavy-check");
  const git = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  fs.mkdirSync(join(dir, "scripts"));
  fs.copyFileSync("scripts/gate.mjs", join(dir, "scripts/gate.mjs"));
  fs.copyFileSync("scripts/local-guard.mjs", join(dir, "scripts/local-guard.mjs"));
  fs.writeFileSync(join(dir, "tracked.txt"), "before\n");
  git("init", "-q"); git("add", "-A"); git("-c", "user.email=gate@test", "-c", "user.name=gate", "commit", "-qm", "gate fixture");
  const pinned = git("rev-parse", "HEAD").trim();
  fs.writeFileSync(queue, `#!/usr/bin/env node
const fs = require("node:fs");
if (process.argv[2] === "submit") { console.log("261023-000000-tree"); process.exit(0); }
fs.appendFileSync(${JSON.stringify(join(dir, "tracked.txt"))}, "edited while the job ran\\n");
console.log(JSON.stringify({ code: 0, stopReason: null, context: null, evidence: { commit: ${JSON.stringify(pinned)}, bound: true } }));
`, { mode: 0o755 });
  const gate = (...a: string[]) => spawnSync(process.execPath, [join(dir, "scripts/gate.mjs"), "--only", "bake", ...a], { encoding: "utf8", env: { ...process.env, SILTWAKE_HEAVY_CHECK: queue } });
  const changed = gate();
  assert.equal(changed.status, 1, changed.stdout + changed.stderr);
  assert.match(changed.stdout, /FAIL {2}bake .*the tree or HEAD changed while this step ran/);
  // Now dirty: it won't start.
  const refused = gate();
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /uncommitted changes; commit first/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a good receipt from a waiter that then fails or is killed doesn't count", () => {
  const dir = fs.mkdtempSync(join(tmpdir(), "siltwake-gate-waiter-")), queue = join(dir, "heavy-check");
  fs.writeFileSync(queue, `#!/usr/bin/env node
if (process.argv[2] === "submit") { console.log("261023-000000-wait"); process.exit(0); }
console.log(process.env.GATE_RECEIPT);
if (process.env.WAITER === "signal") process.kill(process.pid, "SIGTERM");
else process.exit(7);
`, { mode: 0o755 });
  for (const [how, re] of [["exit", /the queue waiter exited 7/], ["signal", /the queue waiter was killed \(SIGTERM\)/]] as const) {
    const r = spawnSync(process.execPath, ["scripts/gate.mjs", "--only", "bake", "--allow-dirty"],
      { encoding: "utf8", env: { ...process.env, SILTWAKE_HEAVY_CHECK: queue, GATE_RECEIPT: JSON.stringify(good()), WAITER: how } });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, new RegExp(`^ {2}FAIL {2}bake .*${re.source}`, "m"), r.stdout);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("--machine sends every queued step to one machine, replacing its own tag", () => {
  const list = spawnSync(process.execPath, ["scripts/gate.mjs", "--machine", "4070", "--list"], { encoding: "utf8" }).stdout;
  for (const id of ["bake", "playthrough"]) {
    const line = list.split("\n").find((_line, i, all) => all[i - 1]?.startsWith(id))!;
    assert.match(line, /submit .*--machine 4070 --review --/, id);
    assert.equal(line.match(/--machine/g)?.length, 1, `${id}: one machine tag`);
  }
  assert.equal(spawnSync(process.execPath, ["scripts/gate.mjs", "--machine", "moon", "--list"], { encoding: "utf8" }).status, 2);
});
