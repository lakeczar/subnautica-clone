// The heavy tier's per-file containment (TT-1 R1-1): a file's budget covers its
// whole process tree. Runs the real heavy runner, nested in this heavy job, on
// two probe files whose child processes allocate memory.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const probes = mkdtempSync(join(root, ".test-build", "heavy-probes-"));
after(() => rmSync(probes, { recursive: true, force: true }));
/** A probe test whose child process holds `mib` MiB of touched memory for a moment. */
const probe = (name: string, mib: number): string => {
  const file = join(probes, `${name}.heavy.test.js`);
  writeFileSync(file, `import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("${name}", () => {
  const r = spawnSync(process.execPath, ["-e", "const a = []; for (let i = 0; i < ${mib}; i++) a.push(Buffer.alloc(1 << 20, 1)); setTimeout(() => {}, 600);"]);
  assert.equal(r.status, 0, "the child finished");
});
`);
  return file;
};

test("a child process over the file's budget fails that file only; a file under it passes and is measured with its child", () => {
  const hog = probe("child-hog", 400), light = probe("child-light", 48);
  const env: NodeJS.ProcessEnv = { ...process.env, SILTWAKE_HEAVY_BUDGET_MIB: "192" };
  delete env.NODE_TEST_CONTEXT;
  const out = spawnSync(process.execPath, ["scripts/test-tier.mjs", "heavy", hog, light], { cwd: root, encoding: "utf8", env, timeout: 120_000 });
  const row = (name: string) => out.stdout.split("\n").find((l) => l.trimStart().startsWith(`${name}.heavy.test.js `)) ?? "";
  assert.equal(out.status, 1, out.stdout + out.stderr);
  assert.match(row("child-hog"), /KILLED \(over budget\)|FAIL/, out.stdout);
  assert.match(row("child-light"), /\bok$/, out.stdout);
  const peak = Number(/peak\s+(\d+) MiB/.exec(row("child-light"))?.[1]);
  assert.ok(peak >= 48, `the light file's peak (${peak} MiB) includes its child's 48 MiB`);
});
