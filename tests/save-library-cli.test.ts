// test-tier: allow-escape spawns the save library CLI, the playthrough runner, flock(1) and plain publisher processes (scripts/playthrough/*), which load no Babylon: only sim, content and save modules.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEnvelope, encodeSave } from "../src/save/codec.js";
import { createGame } from "../src/sim/state.js";
import { buildManifest, codeCommit, publish, readLibrary, sha256, stagingDir } from "../scripts/playthrough/library.js";
import type { Manifest } from "../scripts/playthrough/library.js";
import { stateHash } from "../scripts/playthrough/persistence.js";
import { emptyRun } from "../scripts/playthrough/timeline.js";
import type { GameState } from "../src/sim/types.js";
// Compiled into the test build for the spawns below (entry points no test imports).
import type {} from "../scripts/playthrough/saves.js";
import type {} from "../scripts/playthrough/run.js";

// SAVE-1 R1/R2: the real CLI's exit codes and diagnostics, against real commits of
// this repository, and publication by several processes at once.

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
async function addCommit(root: string, commit: string, hash?: string): Promise<void> {
  const run = emptyRun("creel", "creel"), state = JSON.parse(text).state as GameState;
  run.saves.push({ phase: "opening", label: "opening", tick: 0, bytes: text.length, hash: stateHash(state), equal: true, commands: 4, journalBytes: 0 });
  const { manifest } = buildManifest(commit, [run], [{ scenario: "creel", label: "opening", text }], () => null);
  if (hash) manifest.saves[0]!.hash = hash;
  const staging = await stagingDir(root, commit);
  fs.writeFileSync(path.join(staging.dir, "creel@opening.json"), text);
  await publish(root, staging, manifest, () => []);
}
/** Make a published commit directory writable again, to damage it on purpose. */
const unlock = (dir: string): void => { spawnSync("chmod", ["-R", "u+w", dir]); };
const cli = (...a: string[]) => spawnSync(process.execPath, [CLI, ...a], { encoding: "utf8" });
const root = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "siltwake-library-cli-"));
const staged = (r: string): string[] => fs.readdirSync(r).filter((f) => /staging/.test(f));

test("pick: the nearest ancestor's path on stdout, exit 0; a missing file or a damaged recorded hash is exit 3 with every candidate", async () => {
  const r = root();
  await addCommit(r, grand);
  await addCommit(r, parent);
  const ok = cli("pick", "pod-start", "--root", r, "--commit", head);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), path.join(r, parent, "creel@opening.json"));
  assert.match(ok.stderr, new RegExp(`from ${parent.slice(0, 12)} \\(same-version, \\d+ commits back`));
  // The nearest file gone: a refusal, not a stack trace, naming the older compatible one it did not use.
  unlock(path.join(r, parent));
  fs.rmSync(path.join(r, parent, "creel@opening.json"));
  const gone = cli("pick", "pod-start", "--root", r, "--commit", head);
  assert.equal(gone.status, 3, gone.stderr);
  assert.match(gone.stderr, /^REFUSED: .*cannot be read: ENOENT/m);
  assert.match(gone.stderr, new RegExp(`${grand.slice(0, 12)}: compatible \\(same-version, \\d+ commits back\\) but not tried`));
  assert.doesNotMatch(gone.stderr, /at .*library\.js/, "no stack trace");
  // A recorded hash that no longer matches the saved state is refused, not reported as a migration.
  const r2 = root();
  await addCommit(r2, head, "0".repeat(16));
  const bad = cli("pick", "pod-start", "--root", r2, "--commit", head);
  assert.equal(bad.status, 3, bad.stdout);
  assert.match(bad.stderr, /not its recorded 0000000000000000/);
  assert.equal(bad.stdout, "");
});

test("R5: an unreadable manifest that could hide a nearer save refuses the pick; a farther one is reported; a stateless envelope is a refusal", async () => {
  const r = root();
  await addCommit(r, grand);
  await addCommit(r, parent);
  await addCommit(r, head);
  unlock(path.join(r, head));
  fs.writeFileSync(path.join(r, head, "manifest.json"), "{");
  const hidden = cli("pick", "pod-start", "--root", r, "--commit", head);
  assert.equal(hidden.status, 3, hidden.stdout + hidden.stderr);
  assert.match(hidden.stderr, new RegExp(`^REFUSED: The export at ${head.slice(0, 12)} \\(0 commits back\\) is unreadable`, "m"));
  assert.match(hidden.stderr, new RegExp(`${head.slice(0, 12)}: unreadable manifest`));
  for (const older of [parent, grand]) assert.match(hidden.stderr, new RegExp(`${older.slice(0, 12)}: compatible .* but not tried: a nearer export is unreadable`));
  assert.equal(hidden.stdout, "");
  // For a commit the damaged one isn't in the history of, the pick goes ahead.
  const before = cli("pick", "pod-start", "--root", r, "--commit", parent);
  assert.equal(before.status, 0, before.stderr);
  assert.equal(before.stdout.trim(), path.join(r, parent, "creel@opening.json"));
  // Damaged but farther than the save used: the pick goes ahead and names it.
  const far = root();
  await addCommit(far, grand);
  await addCommit(far, parent);
  unlock(path.join(far, grand));
  fs.writeFileSync(path.join(far, grand, "manifest.json"), "{");
  const named = cli("pick", "pod-start", "--root", far, "--commit", head);
  assert.equal(named.status, 0, named.stderr);
  assert.match(named.stderr, new RegExp(`passed over ${grand.slice(0, 12)}: unreadable manifest.*farther than the save used`));
  // A file whose envelope has no state, checksummed to match: a refusal with the candidates, not a crash.
  const r3 = root();
  await addCommit(r3, grand);
  await addCommit(r3, parent);
  unlock(path.join(r3, parent));
  const m = JSON.parse(fs.readFileSync(path.join(r3, parent, "manifest.json"), "utf8")) as Manifest;
  fs.writeFileSync(path.join(r3, parent, "creel@opening.json"), "{}");
  m.saves[0]!.sha256 = sha256("{}");
  fs.writeFileSync(path.join(r3, parent, "manifest.json"), JSON.stringify(m));
  const empty = cli("pick", "pod-start", "--root", r3, "--commit", head);
  assert.equal(empty.status, 3, empty.stdout + empty.stderr);
  assert.match(empty.stderr, /^REFUSED: .*has no state object in its envelope/m);
  assert.match(empty.stderr, new RegExp(`${grand.slice(0, 12)}: compatible .* but not tried`));
  assert.doesNotMatch(empty.stderr, /ERR_INVALID_ARG_TYPE|at .*\.js:/);
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

// ------------------------------------------------------------------------------ concurrent writers

const scripts = fs.mkdtempSync(path.join(os.tmpdir(), "siltwake-publishers-"));
const SAVE = path.join(scripts, "save.json");
fs.writeFileSync(SAVE, text);
const PUBLISH = path.join(scripts, "publish.mjs"), HOLD = path.join(scripts, "hold.mjs"), STAGE = path.join(scripts, "stage.mjs");
fs.writeFileSync(PUBLISH, `
  import fs from "node:fs"; import path from "node:path";
  const L = await import(${JSON.stringify(LIBRARY)});
  const [root, commit, save, hash] = process.argv.slice(2), text = fs.readFileSync(save, "utf8");
  const run = { scenario: "creel", outcome: "complete", minutes: 0, wallMs: 0, notes: [], checks: [], measurements: {},
    saves: [{ phase: "opening", label: "opening", tick: 0, bytes: text.length, hash, equal: true, commands: 4, journalBytes: 0 }] };
  const { manifest } = L.buildManifest(commit, [run], [{ scenario: "creel", label: "opening", text }], () => null);
  const staging = await L.stagingDir(root, commit);
  fs.writeFileSync(path.join(staging.dir, "creel@opening.json"), text);
  console.log(await L.publish(root, staging, manifest, () => []));`);
// Holds the library lock until killed; says so once it has it.
fs.writeFileSync(HOLD, `
  const L = await import(${JSON.stringify(LIBRARY)});
  await L.withLibraryLock(process.argv[2], () => new Promise(() => { console.log("held"); }));`);
// Holds a staging directory (and its lease) until killed; prints it.
fs.writeFileSync(STAGE, `
  const L = await import(${JSON.stringify(LIBRARY)});
  const s = await L.stagingDir(process.argv[2], process.argv[3]);
  console.log(s.dir); await new Promise(() => {});`);
const hash = stateHash(JSON.parse(text).state as GameState);
function start(script: string, args: string[], env: Record<string, string> = {}): { child: ChildProcess; ready: Promise<void>; out: Promise<string> } {
  const child = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, ...env } });
  let out = "";
  const ready = new Promise<void>((done) => child.stdout!.once("data", () => done()));
  child.stdout!.on("data", (b: Buffer) => { out += b; });
  return { child, ready, out: new Promise((done, fail) => child.on("close", (code, signal) => code === 0 ? done(out.trim()) : signal ? done(`killed ${signal}`) : fail(new Error(`exit ${code}`)))) };
}
const until = async (ok: () => boolean, ms = 20_000): Promise<void> => {
  for (const t0 = Date.now(); !ok(); await new Promise((r) => setTimeout(r, 25))) if (Date.now() - t0 > ms) throw new Error("timed out");
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test("publishers racing on one root: one publishes each commit, the rest see it identical, the index lists every commit, no staging is left", async () => {
  const r = root();
  const results = await Promise.all([head, head, head, head, parent, parent, grand].map((c) => start(PUBLISH, [r, c, SAVE, hash]).out));
  assert.deepEqual(results.filter((x) => x === "published").length, 3);
  assert.deepEqual(results.filter((x) => x === "identical").length, 4);
  assert.deepEqual(staged(r), [], "no staging left");
  const index = JSON.parse(fs.readFileSync(path.join(r, "index.json"), "utf8")) as { commits: { commit: string }[] };
  assert.deepEqual(index.commits.map((c) => c.commit).sort(), [head, parent, grand].sort());
  assert.equal(readLibrary(r).manifests.length, 3);
});

test("R4: a dead holder's lock passes to exactly one of two waiting publishers; the other waits through its index rebuild; the index keeps both", async () => {
  const r = root(), holder = start(HOLD, [r]);
  await holder.ready;
  const pause = { [head]: path.join(scripts, `pause-${process.pid}-a`), [parent]: path.join(scripts, `pause-${process.pid}-b`) };
  const a = start(PUBLISH, [r, head, SAVE, hash], { SILTWAKE_LIBRARY_PAUSE: pause[head]! });
  const b = start(PUBLISH, [r, parent, SAVE, hash], { SILTWAKE_LIBRARY_PAUSE: pause[parent]! });
  await sleep(500);
  assert.ok(!fs.existsSync(`${pause[head]}.in`) && !fs.existsSync(`${pause[parent]}.in`), "nobody enters while the holder lives");
  holder.child.kill("SIGKILL"); // the holder dies holding the lock: the kernel releases it
  await until(() => fs.existsSync(`${pause[head]}.in`) || fs.existsSync(`${pause[parent]}.in`));
  const first = fs.existsSync(`${pause[head]}.in`) ? head : parent, second = first === head ? parent : head;
  // The first is inside its index rebuild, manifests already read: the second must not get in.
  await sleep(1000);
  assert.equal(fs.existsSync(`${pause[second]}.in`), false, "the second waiter did not take a live lock");
  fs.writeFileSync(pause[first]!, "");
  await until(() => fs.existsSync(`${pause[second]}.in`));
  fs.writeFileSync(pause[second]!, "");
  assert.deepEqual(await Promise.all([a.out, b.out]), ["published", "published"]);
  const index = JSON.parse(fs.readFileSync(path.join(r, "index.json"), "utf8")) as { commits: { commit: string }[] };
  assert.deepEqual(index.commits.map((c) => c.commit).sort(), [head, parent].sort(), "neither rebuild lost the other's commit");
  assert.deepEqual(staged(r), []);
});

test("orphaned staging is collected only once its owner is gone: a live exporter's staging survives any age", async () => {
  const r = root();
  const owner = start(STAGE, [r, head]);
  await owner.ready;
  const old = new Date("2000-01-01T00:00:00Z");
  for (const d of staged(r)) fs.utimesSync(path.join(r, d), old, old);
  assert.equal(staged(r).length, 1);
  const kept = cli("index", "--root", r);
  assert.equal(kept.status, 0, kept.stderr);
  assert.equal(staged(r).length, 1, "the live lease keeps it, however old");
  owner.child.kill("SIGKILL");
  await owner.out;
  // The kernel drops the lease as the dead owner's lock child exits, a moment after the owner.
  let swept = "";
  await until(() => { swept += cli("index", "--root", r).stdout; return staged(r).length === 0; }, 10_000);
  assert.match(swept, /collected 1 orphaned staging/);
  assert.deepEqual(staged(r), [], "collected once the owner died");
  // A publish collects orphans too, under the same lock.
  const crashed = start(STAGE, [r, parent]);
  await crashed.ready;
  crashed.child.kill("SIGKILL");
  await crashed.out;
  const lease = path.join(r, staged(r)[0]!, ".lease");
  await until(() => spawnSync("flock", ["-n", lease, "true"]).status === 0, 10_000);
  assert.equal(await start(PUBLISH, [r, grand, SAVE, hash]).out, "published");
  assert.deepEqual(staged(r), []);
});
