// The heavy tier's per-file containment (TT-1 R1-1, R2-1): a file's budget
// covers its whole process tree, and the tree is torn down when the file's
// process exits. Runs the real heavy runner, nested in this heavy job, on probe
// files whose child processes allocate memory or outlive them, under both
// adapters: per-file cgroups (when this job is delegated) and process groups.
// STEW-2: files that assert elapsed time run last, one at a time, in a timing
// phase that reports the CPU wait each saw; a heavy file that reads a clock
// unclassified is refused.
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

/** The nested heavy runner over `files` with one adapter, as it ran; `budgets` replaces tests/heavy-budgets.json. */
function runTier(files: readonly string[], mode: (typeof modes)[number], budgetMiB: number, budgets?: object) {
  const env: NodeJS.ProcessEnv = { ...process.env, SILTWAKE_HEAVY_BUDGET_MIB: String(budgetMiB) };
  if (budgets) {
    env.SILTWAKE_HEAVY_BUDGETS = join(probes, `budgets-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(env.SILTWAKE_HEAVY_BUDGETS, JSON.stringify({ defaultMiB: budgetMiB, ...budgets }));
  }
  if (mode === "process group") env.SILTWAKE_HEAVY_CGROUP = "";
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ["scripts/test-tier.mjs", "heavy", ...files], { cwd: root, encoding: "utf8", env, timeout: 120_000 });
}
/** The same, required to have run; its summary rows by probe name. */
function tier(files: readonly string[], mode: (typeof modes)[number], budgetMiB: number, budgets?: object) {
  const started = Date.now();
  const out = runTier(files, mode, budgetMiB, budgets);
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

// The probes' clock call, built at run time: the tier scans each heavy file's text for
// clock reads, and this file only writes them into probes.
const NOW = ["performance", "now"].join(".");
for (const mode of modes) {
  const tag = mode.replace(" ", "-");
  test(`${mode}: files asserting elapsed time run last, one at a time, and report the CPU wait they saw`, () => {
    const log = join(probes, `timing-${tag}.log`);
    /** A probe that records when it ran: "<name> start|end <ms>". */
    const span = (name: string, ms: number, clock = false) => write(name, `test("${name}", async () => {
  ${clock ? `const t0 = ${NOW}();` : ""}
  writeFileSync(${JSON.stringify(log)}, "${name} start " + Date.now() + "\\n", { flag: "a" });
  await new Promise((done) => setTimeout(done, ${ms}));
  writeFileSync(${JSON.stringify(log)}, "${name} end " + Date.now() + "\\n", { flag: "a" });
  ${clock ? `assert.ok(${NOW}() - t0 < 60000);` : ""}
});`);
    const files = [span(`timed-a-${tag}`, 300, true), span(`pooled-b-${tag}`, 1500), span(`timed-c-${tag}`, 300, true), span(`pooled-d-${tag}`, 1500)];
    const { out, row } = tier(files, mode, 256, { exclusive: [`timed-a-${tag}.heavy.test.ts`, `timed-c-${tag}.heavy.test.ts`] });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /=== timing phase: 2 file\(s\)/);
    const at = new Map(readFileSync(log, "utf8").trim().split("\n").map((l) => { const [n, e, t] = l.split(" "); return [`${n} ${e}`, Number(t)]; }));
    const pooledEnd = Math.max(at.get(`pooled-b-${tag} end`)!, at.get(`pooled-d-${tag} end`)!);
    for (const n of [`timed-a-${tag}`, `timed-c-${tag}`]) {
      assert.ok(at.get(`${n} start`)! >= pooledEnd, `${n} started after every pooled file ended`);
      assert.match(row(n), /ok {2}\[timing; CPU wait: job [\d.?]+%, host [\d.]+%\]$/, out.stdout);
    }
    const span2 = (n: string): [number, number] => [at.get(`${n} start`)!, at.get(`${n} end`)!];
    const [a, c] = [span2(`timed-a-${tag}`), span2(`timed-c-${tag}`)];
    assert.ok(a[1] <= c[0] || c[1] <= a[0], "the two timing files never overlapped");
    assert.match(row(`pooled-b-${tag}`), /\bok$/, "a pooled file's row is unchanged");
  });

  test(`${mode}: a heavy file that reads a clock but is in neither list is refused before anything runs`, () => {
    const file = write(`unlisted-clock-${tag}`, `test("times something", () => { assert.ok(${NOW}() >= 0); });`);
    const out = runTier([file], mode, 256, { exclusive: [] });
    assert.equal(out.status, 2, out.stdout + out.stderr);
    assert.match(out.stderr, new RegExp(`unlisted-clock-${tag}\\.heavy\\.test\\.ts read a clock.*clockWithoutBound`));
    assert.doesNotMatch(out.stdout, /test:heavy summary/);
    const listed = tier([file], mode, 256, { clockWithoutBound: [`unlisted-clock-${tag}.heavy.test.ts`] });
    assert.equal(listed.out.status, 0, listed.out.stdout + listed.out.stderr);
  });
}
