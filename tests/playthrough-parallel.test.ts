// test-tier: allow-escape spawns the playthrough CLI (scripts/playthrough/run.ts), which loads no Babylon: it imports only sim/content/save modules.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Type-only: brings run.ts into the test build so its compiled CLI can be spawned.
import type {} from "../scripts/playthrough/run.js";

const CLI = fileURLToPath(new URL("../scripts/playthrough/run.js", import.meta.url));
const cli = (fault: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-parallel-")), out = path.join(dir, "out.json");
  const r = spawnSync(process.execPath, [CLI, "--jobs", "3", "--scenario", "creel,carrier,reverse,no-optional", "--quiet", "--json", out],
    { env: { ...process.env, SILTWAKE_PLAYTHROUGH_FAULT: fault }, encoding: "utf8", timeout: 120_000 });
  const runs = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, "utf8")) as { runs: { scenario: string; checks: { name: string; ok: boolean }[] }[] }).runs : [];
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, runs, stdout: r.stdout };
};

test("R2: a --jobs child that crashes after writing a complete result fails the run", () => {
  // Control: the same stub children exiting cleanly pass.
  const ok = cli("stub");
  assert.equal(ok.status, 0, ok.stdout);
  assert.deepEqual(ok.runs.map((r) => r.scenario), ["creel", "carrier", "reverse", "no-optional"]);
  // Each child writes its JSON, then throws: the parent must not vouch for it.
  const crash = cli("stub-crash-after-json");
  assert.equal(crash.status, 1, crash.stdout);
  assert.deepEqual(crash.runs.map((r) => r.scenario), ["creel", "carrier", "reverse", "no-optional"]);
  assert.ok(crash.runs.every((r) => r.checks.some((c) => c.name === "child process" && !c.ok)));
});
