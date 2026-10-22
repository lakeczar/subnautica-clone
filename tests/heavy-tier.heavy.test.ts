// The heavy tier's per-file containment (TT-1 R1-1, R2-1): a file's budget
// covers its whole process tree, and the tree is torn down when the file's
// process exits. Runs the real heavy runner, nested in this heavy job, on probe
// files whose child processes allocate memory or outlive them, under both
// adapters: per-file cgroups (when this job is delegated) and process groups.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const probes = mkdtempSync(join(root, ".test-build", "heavy-probes-"));
after(() => rmSync(probes, { recursive: true, force: true }));
const delegated = process.env.SILTWAKE_HEAVY_CGROUP === "delegated";
const modes = [...(delegated ? ["cgroup"] : []), "process group"] as const;

/** A probe test file in the probe directory. */
const write = (name: string, body: string): string => {
  const file = join(probes, `${name}.heavy.test.js`);
  writeFileSync(file, `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { spawn, spawnSync } from "node:child_process";\nimport { writeFileSync } from "node:fs";\n${body}\n`);
  return file;
};
/** A probe test whose child process holds `mib` MiB of touched memory for a moment. */
const allocating = (name: string, mib: number): string => write(name, `test("${name}", () => {
  const r = spawnSync(process.execPath, ["-e", "const a = []; for (let i = 0; i < ${mib}; i++) a.push(Buffer.alloc(1 << 20, 1)); setTimeout(() => {}, 600);"]);
  assert.equal(r.status, 0, "the child finished");
});`);

/** The nested heavy runner over `files` with one adapter; its summary rows by probe name. */
function tier(files: readonly string[], mode: (typeof modes)[number], budgetMiB: number) {
  const env: NodeJS.ProcessEnv = { ...process.env, SILTWAKE_HEAVY_BUDGET_MIB: String(budgetMiB) };
  if (mode === "process group") env.SILTWAKE_HEAVY_CGROUP = "";
  delete env.NODE_TEST_CONTEXT;
  const started = Date.now();
  const out = spawnSync(process.execPath, ["scripts/test-tier.mjs", "heavy", ...files], { cwd: root, encoding: "utf8", env, timeout: 120_000 });
  assert.match(out.stdout, new RegExp(`${mode} containment`), `the runner used ${mode} containment`);
  const row = (name: string) => out.stdout.split("\n").find((l) => l.trimStart().startsWith(`${name}.heavy.test.js `)) ?? "";
  return { out, row, seconds: (Date.now() - started) / 1000 };
}

for (const mode of modes) {
  test(`${mode}: a child over the file's budget fails that file only; a file under it passes and is measured with its child`, () => {
    const hog = allocating(`hog-${mode.replace(" ", "-")}`, 400), light = allocating(`light-${mode.replace(" ", "-")}`, 48);
    const { out, row } = tier([hog, light], mode, 192);
    const name = (f: string) => f.split("/").pop()!.replace(".heavy.test.js", "");
    assert.equal(out.status, 1, out.stdout + out.stderr);
    assert.match(row(name(hog)), /KILLED \(over budget\)|FAIL/, out.stdout);
    assert.match(row(name(light)), /\bok$/, out.stdout);
    const peak = Number(/peak\s+(\d+) MiB/.exec(row(name(light)))?.[1]);
    assert.ok(peak >= 48, `the light file's peak (${peak} MiB) includes its child's 48 MiB`);
  });

  test(`${mode}: a child left holding the file's stdout and stderr is removed when the file exits; a sibling's child is untouched`, () => {
    const tag = mode.replace(" ", "-"), pidFile = join(probes, `straggler-${tag}.pid`);
    // The straggler would hold both pipes for 60 s; the sibling's own child must live its 2 s and exit 0.
    const straggler = write(`straggler-${tag}`, `test("leaves a child holding stdout and stderr", () => {
  const c = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "inherit" });
  writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));
  c.unref();
});`);
    const sibling = write(`sibling-${tag}`, `test("its own child runs to the end", async () => {
  const c = spawn(process.execPath, ["-e", "setTimeout(() => {}, 2000)"], { stdio: "ignore" });
  const end = await new Promise((done) => c.on("exit", (code, signal) => done(signal ?? code)));
  assert.equal(end, 0, "the sibling's child was not killed");
});`);
    const { out, row, seconds } = tier([straggler, sibling], mode, 256);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(row(`straggler-${tag}`), /\bok$/, out.stdout);
    assert.match(row(`sibling-${tag}`), /\bok$/, out.stdout);
    assert.ok(seconds < 30, `the runner finished in ${seconds.toFixed(1)} s, not after the straggler's 60 s`);
    const pid = readFileSync(pidFile, "utf8").trim();
    assert.ok(!existsSync(`/proc/${pid}`) || /^State:\s+Z/m.test(readFileSync(`/proc/${pid}/status`, "utf8")), `straggler ${pid} was removed`);
  });
}
