// test-tier: allow-escape spawns the save library CLI, the playthrough runner and plain publisher processes (scripts/playthrough/*), which load no Babylon: only sim, content and save modules.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEnvelope, encodeSave } from "../src/save/codec.js";
import { createGame } from "../src/sim/state.js";
import { buildManifest, codeCommit, publish, readLibrary, stagingDir } from "../scripts/playthrough/library.js";
import { stateHash } from "../scripts/playthrough/persistence.js";
import { emptyRun } from "../scripts/playthrough/timeline.js";
import type { GameState } from "../src/sim/types.js";

// SAVE-1 R1: the real CLI's exit codes and diagnostics, against real commits of this
// repository, and publication by several processes at once.

const CLI = fileURLToPath(new URL("../scripts/playthrough/saves.js", import.meta.url));
const RUN = fileURLToPath(new URL("../scripts/playthrough/run.js", import.meta.url));
const LIBRARY = new URL("../scripts/playthrough/library.js", import.meta.url).href;
const git = (...a: string[]): string => execFileSync("git", a, { encoding: "utf8" }).trim();
const [head, parent, grand] = ["HEAD", "HEAD~1", "HEAD~2"].map((r) => git("rev-parse", r)) as [string, string, string];

const text = ((): string => {
  const e = encodeSave(createEnvelope(createGame(), { sessionId: "library-cli-test", createdAt: "2026-10-23T00:00:00.000Z", savedAt: "2026-10-23T00:00:00.000Z" }));
  assert.ok(e.ok);
  return e.value;
})();
function addCommit(root: string, commit: string, hash?: string): void {
  const run = emptyRun("creel", "creel"), state = JSON.parse(text).state as GameState;
  run.saves.push({ phase: "opening", label: "opening", tick: 0, bytes: text.length, hash: stateHash(state), equal: true, commands: 4, journalBytes: 0 });
  const { manifest } = buildManifest(commit, [run], [{ scenario: "creel", label: "opening", text }], () => null);
  if (hash) manifest.saves[0]!.hash = hash;
  const staging = stagingDir(root, commit);
  fs.writeFileSync(path.join(staging, "creel@opening.json"), text);
  publish(root, staging, manifest, () => []);
}
const cli = (...a: string[]) => spawnSync(process.execPath, [CLI, ...a], { encoding: "utf8" });
const root = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "siltwake-library-cli-"));

test("pick: the nearest ancestor's path on stdout, exit 0; a missing file or a damaged recorded hash is exit 3 with every candidate", () => {
  const r = root();
  addCommit(r, grand);
  addCommit(r, parent);
  const ok = cli("pick", "pod-start", "--root", r, "--commit", head);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), path.join(r, parent, "creel@opening.json"));
  assert.match(ok.stderr, new RegExp(`from ${parent.slice(0, 12)} \\(same-version, \\d+ commits back`));
  // The nearest file gone: a refusal, not a stack trace, naming the older compatible one it did not use.
  fs.chmodSync(path.join(r, parent), 0o755);
  fs.rmSync(path.join(r, parent, "creel@opening.json"));
  const gone = cli("pick", "pod-start", "--root", r, "--commit", head);
  assert.equal(gone.status, 3, gone.stderr);
  assert.match(gone.stderr, /^REFUSED: .*cannot be read: ENOENT/m);
  assert.match(gone.stderr, new RegExp(`${grand.slice(0, 12)}: compatible \\(same-version, \\d+ commits back\\) but not tried`));
  assert.doesNotMatch(gone.stderr, /at .*library\.js/, "no stack trace");
  // A recorded hash that no longer matches the saved state is refused, not reported as a migration.
  const r2 = root();
  addCommit(r2, head, "0".repeat(16));
  const bad = cli("pick", "pod-start", "--root", r2, "--commit", head);
  assert.equal(bad.status, 3, bad.stdout);
  assert.match(bad.stderr, /not its recorded 0000000000000000/);
  assert.equal(bad.stdout, "");
});

test("--export refuses code that was not built from an archive of the commit it would label", () => {
  assert.equal(codeCommit(), null, "this test build is a worktree build");
  const r = spawnSync(process.execPath, [RUN, "--export", "--commit", head, "--library-root", root(), "--scenario", "low-air"], { encoding: "utf8" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--export runs only from code built by scripts\/saves-build-at\.sh/);
  const marked = fs.mkdtempSync(path.join(os.tmpdir(), "siltwake-marked-"));
  fs.writeFileSync(path.join(marked, ".siltwake-source-commit"), `${parent}\n`);
  assert.equal(codeCommit(marked), parent);
});

test("publishers racing on one root: one publishes each commit, the rest see it identical, the index lists every commit, no staging is left", async () => {
  const r = root(), dir = fs.mkdtempSync(path.join(os.tmpdir(), "siltwake-publishers-"));
  const script = path.join(dir, "publish.mjs");
  const state = JSON.parse(text).state as GameState;
  fs.writeFileSync(path.join(dir, "save.json"), text);
  fs.writeFileSync(script, `
    import fs from "node:fs"; import path from "node:path";
    const L = await import(${JSON.stringify(LIBRARY)});
    const [root, commit, save, hash] = process.argv.slice(2), text = fs.readFileSync(save, "utf8");
    const run = { scenario: "creel", outcome: "complete", minutes: 0, wallMs: 0, notes: [], checks: [], measurements: {},
      saves: [{ phase: "opening", label: "opening", tick: 0, bytes: text.length, hash, equal: true, commands: 4, journalBytes: 0 }] };
    const { manifest } = L.buildManifest(commit, [run], [{ scenario: "creel", label: "opening", text }], () => null);
    const staging = L.stagingDir(root, commit);
    fs.writeFileSync(path.join(staging, "creel@opening.json"), text);
    console.log(L.publish(root, staging, manifest, () => []));`);
  const go = (commit: string) => new Promise<string>((done, fail) => {
    const p = spawn(process.execPath, [script, r, commit, path.join(dir, "save.json"), stateHash(state)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (b: Buffer) => { out += b; });
    p.on("close", (code) => code === 0 ? done(out.trim()) : fail(new Error(`publisher exited ${code}`)));
  });
  const results = await Promise.all([head, head, head, head, parent, parent, grand].map(go));
  assert.deepEqual(results.filter((x) => x === "published").length, 3);
  assert.deepEqual(results.filter((x) => x === "identical").length, 4);
  assert.deepEqual(fs.readdirSync(r).filter((f) => f.startsWith(".")), [], "no staging or lock left");
  const index = JSON.parse(fs.readFileSync(path.join(r, "index.json"), "utf8")) as { commits: { commit: string }[] };
  assert.deepEqual(index.commits.map((c) => c.commit).sort(), [head, parent, grand].sort());
  assert.equal(readLibrary(r).manifests.length, 3);
});
