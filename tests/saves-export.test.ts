// test-tier: allow-escape runs scripts/saves-export.sh in a throwaway repository against a stand-in queue (a small node script); nothing is built or played, and nothing loads Babylon.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// saves-export.sh (SAVE-1, STEW-2) compiles and decodes nothing itself: the archive
// build, the playthrough export, the verify and the import each run inside a
// heavy-check job, so the export never competes with a 3090 exclusive run.
const dirs: string[] = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const temp = (prefix: string) => { const d = fs.mkdtempSync(join(tmpdir(), prefix)); dirs.push(d); return d; };

/** A throwaway repository with the real export script and a saves-build-at.sh that only records being called. */
function repo(): { dir: string; sha: string; builds: string } {
  const dir = temp("siltwake-export-repo-"), builds = join(dir, "..", `${dir.split("/").pop()}.builds`);
  dirs.push(builds);
  fs.mkdirSync(join(dir, "scripts"));
  fs.copyFileSync("scripts/saves-export.sh", join(dir, "scripts", "saves-export.sh"));
  fs.writeFileSync(join(dir, "scripts", "saves-build-at.sh"), `#!/usr/bin/env bash\necho "build $*" >> ${JSON.stringify(builds)}\nexit 1\n`, { mode: 0o755 });
  const git = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  git("init", "-q"); git("add", "-A"); git("-c", "user.email=e@test", "-c", "user.name=e", "commit", "-qm", "fixture");
  return { dir, sha: git("rev-parse", "HEAD").trim(), builds };
}
/** A stand-in heavy-check: records each submit; answers the n-th wait with RECEIPTS[n]. */
function standIn(): { queue: string; submitted: () => string[][] } {
  const dir = temp("siltwake-export-queue-"), queue = join(dir, "heavy-check");
  fs.writeFileSync(queue, `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), dir = ${JSON.stringify(dir)};
const n = fs.readdirSync(dir).filter((f) => f.endsWith(".argv")).length;
if (process.argv[2] === "submit") {
  fs.writeFileSync(path.join(dir, String(n).padStart(2, "0") + ".argv"), JSON.stringify(process.argv.slice(3)));
  console.log("261024-000000-" + String(n).padStart(4, "0")); process.exit(0);
}
const receipt = JSON.parse(process.env.RECEIPTS)[n - 1];
console.log("job output");
console.log("");
console.log(JSON.stringify(receipt));
process.exit(receipt.code);
`, { mode: 0o755 });
  return { queue, submitted: () => fs.readdirSync(dir).filter((f) => f.endsWith(".argv")).sort().map((f) => JSON.parse(fs.readFileSync(join(dir, f), "utf8")) as string[]) };
}
function exportAt(dir: string, queue: string, receipts: object[], env: Record<string, string> = {}) {
  return spawnSync("bash", [join(dir, "scripts", "saves-export.sh")], { cwd: dir, encoding: "utf8",
    env: { ...process.env, SILTWAKE_HEAVY_CHECK: queue, RECEIPTS: JSON.stringify(receipts), ...env } });
}

test("on alickers: one --machine any export job brings the commit back, then one job here imports it", () => {
  const { dir, sha, builds } = repo(), { queue, submitted } = standIn();
  const incoming = join(temp("siltwake-export-art-"), sha);
  fs.mkdirSync(incoming); fs.writeFileSync(join(incoming, "manifest.json"), "{}");
  const r = exportAt(dir, queue, [{ code: 0, remote: true, artifacts: [{ remote: `/work/tmp/siltwake-saves/${sha}`, local: incoming }] }, { code: 0 }]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [exp, imp] = submitted();
  assert.deepEqual(exp, ["--class", "playthrough", "--machine", "any", "--snapshot", "--deadline", "5400", "--artifact", `/work/tmp/siltwake-saves/${sha}`,
    "--", "bash", "scripts/saves-export.sh", "--job-export", sha]);
  assert.deepEqual(imp, ["--class", "quick", "--machine", "3090", "--snapshot", "--", "bash", "scripts/saves-export.sh", "--job-import", sha, incoming]);
  assert.match(r.stdout, new RegExp(`${sha} exported on siltwake-alickers and published`));
  assert.ok(!fs.existsSync(builds), "nothing was built outside a job");
});

test("run here: the export job verified it already, so nothing more runs; a failed export is reported with its exit", () => {
  const { dir, sha, builds } = repo(), { queue, submitted } = standIn();
  const r = exportAt(dir, queue, [{ code: 0, artifacts: [{ path: `/work/tmp/siltwake-saves/${sha}`, local: `/work/tmp/siltwake-saves/${sha}` }] }]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(submitted().length, 1);
  assert.match(r.stdout, /exported and verified on factory-worker/);
  const failed = standIn();
  const f = exportAt(dir, failed.queue, [{ code: 4 }]);
  assert.equal(f.status, 4);
  assert.match(f.stderr, /the export failed \(exit 4\)/);
  assert.ok(!fs.existsSync(builds));
});

test("another library root exports on factory-worker, names the root to its jobs, and an existing commit is only verified, in a job", () => {
  const { dir, sha, builds } = repo(), { queue, submitted } = standIn(), root = temp("siltwake-export-root-");
  const r = exportAt(dir, queue, [{ code: 0 }], { SILTWAKE_SAVES: root });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(submitted()[0]!.slice(0, 4), ["--class", "playthrough", "--machine", "3090"]);
  assert.ok(submitted()[0]!.join(" ").endsWith(`-- env SILTWAKE_SAVES=${root} bash scripts/saves-export.sh --job-export ${sha}`));
  fs.mkdirSync(join(root, sha)); fs.writeFileSync(join(root, sha, "manifest.json"), "{}");
  const again = standIn();
  const v = exportAt(dir, again.queue, [{ code: 0 }], { SILTWAKE_SAVES: root });
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.deepEqual(again.submitted(), [["--class", "quick", "--machine", "3090", "--snapshot", "--", "env", `SILTWAKE_SAVES=${root}`, "bash", "scripts/saves-export.sh", "--job-verify", sha]]);
  assert.match(v.stdout, /already exported and verifies/);
  assert.ok(!fs.existsSync(builds));
});

test("it refuses an uncommitted tree before queueing anything", () => {
  const { dir } = repo(), { queue, submitted } = standIn();
  fs.appendFileSync(join(dir, "scripts", "saves-build-at.sh"), "# edit\n");
  const r = exportAt(dir, queue, []);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /commit first/);
  assert.equal(submitted().length, 0);
});
