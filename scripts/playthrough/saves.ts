/** The save library's CLI (SAVE-1). Build first: npx tsc -p scripts/playthrough/tsconfig.json
 *
 *   node .test-build/scripts/playthrough/saves.js pick KIND [--commit REF] [--exact] [--json]
 *       Print the path of the newest save of KIND compatible with REF (default HEAD);
 *       what was chosen goes to stderr. Exit 3, naming every candidate's reason, if none is.
 *   ... list                      commits in the library and the kinds each holds
 *   ... kinds                     the standard kinds and where each comes from
 *   ... verify [REF]              re-check a commit's files, and decode each with a build of REF
 *   ... import DIR                bring in a commit directory exported elsewhere (the second worker):
 *                                 staged, decoded by a build of its commit, then published
 * Decoding uses this code when it was built from that commit (scripts/saves-build-at.sh),
 * else a fresh build of the commit in a scratch directory.
 *   ... index                     rewrite index.json from the manifests
 * Every command takes --root DIR (default $SILTWAKE_SAVES or /work/tmp/siltwake-saves). */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { KINDS } from "./kinds.js";
import { codeCommit, describePick, gitPort, importCommitDir, LibraryRefusal, libraryRoot, pickSave, readLibrary, verifyCommitDir, writeIndex } from "./library.js";

const [command, ...rest] = process.argv.slice(2);
const value = (flag: string): string | undefined => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };
const positional = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--root", "--commit"].includes(rest[i - 1]!)));
const root = libraryRoot(value("--root"));
const git = gitPort();

/** A verifier that decodes with a build of `commit`: this code if it was built from
 * it, else a scratch build (scripts/saves-build-at.sh) of that commit. The scratch
 * build is called through `verifyCommitDir(dir, true)` from its own library.js, the
 * interface every export since the first has had, so its own decoder and kind facts
 * judge it, whatever CLI commands that commit lacks. */
function decoderFor(commit: string): { verify: (dir: string) => string[]; done: () => void } {
  if (codeCommit() === commit) return { verify: (dir) => verifyCommitDir(dir, true), done: () => {} };
  const scratch = fs.existsSync("/work/tmp") ? "/work/tmp" : os.tmpdir();
  const build = fs.mkdtempSync(path.join(scratch, `siltwake-decoder-${commit.slice(0, 12)}-`));
  const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  execFileSync("bash", [path.join(repo, "scripts/saves-build-at.sh"), commit, build], { stdio: ["ignore", process.stderr, "inherit"] });
  return {
    verify: (dir) => {
      const lib = pathToFileURL(path.join(build, ".test-build/scripts/playthrough/library.js")).href;
      const r = spawnSync(process.execPath, ["--input-type=module", "-e",
        `const L = await import(${JSON.stringify(lib)}); process.stdout.write(JSON.stringify(L.verifyCommitDir(${JSON.stringify(dir)}, true)));`],
        { encoding: "utf8", cwd: build });
      let problems: unknown = null;
      try { problems = JSON.parse(r.stdout); } catch { /* reported below */ }
      if (r.status === 0 && Array.isArray(problems)) return problems.map((p) => `the ${commit.slice(0, 12)} build: ${String(p)}`);
      return [`the ${commit.slice(0, 12)} build's verifyCommitDir failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().slice(0, 2000)}`];
    },
    done: () => fs.rmSync(build, { recursive: true, force: true }),
  };
}

switch (command) {
  case "pick": {
    const kind = positional[0];
    if (!kind) { console.error("usage: saves.js pick KIND [--commit REF] [--exact] [--json]"); process.exit(2); }
    try {
      const p = pickSave(kind, { root, commit: value("--commit"), exact: rest.includes("--exact"), git });
      console.error(describePick(p));
      for (const r of p.passed) console.error(`  passed over ${r.commit.slice(0, 12)}: ${r.reason}`);
      if (rest.includes("--json")) console.log(JSON.stringify({ path: p.path, commit: p.manifest.commit, compatibility: p.compatibility,
        distance: p.distance, migrated: p.migrated, entry: p.entry }, null, 1));
      else console.log(p.path);
    } catch (e) {
      if (!(e instanceof LibraryRefusal)) throw e;
      console.error(`REFUSED: ${e.message}`);
      process.exit(3);
    }
    break;
  }
  case "list": {
    const { manifests, rejected } = readLibrary(root);
    if (!manifests.length) console.log(`No library at ${root}.`);
    for (const m of manifests.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))) {
      const named = [...new Set(m.saves.flatMap((e) => e.kinds.filter((k) => !k.includes("@"))))];
      console.log(`${m.commit.slice(0, 12)}  schema ${m.schemaVersion} / ${m.contentVersion}  ${m.generatedAt}  ${m.machine}  ${m.saves.length} saves`);
      console.log(`  ${named.join(", ")}`);
    }
    for (const r of rejected) console.log(`${r.commit.slice(0, 12)}  unreadable: ${r.reason}`);
    break;
  }
  case "kinds":
    for (const k of KINDS) console.log(`${k.kind.padEnd(20)} ${k.group.padEnd(9)} ${k.source.padEnd(26)} ${k.description}`);
    console.log("Every save is also its own kind, scenario@label (for example creel@refits).");
    break;
  case "verify": {
    const commit = git.resolve(positional[0] ?? "HEAD"), dir = path.join(root, commit);
    const decoder = decoderFor(commit);
    let problems: string[];
    try { problems = decoder.verify(dir); } finally { decoder.done(); }
    console.log(problems.length ? `${commit.slice(0, 12)}: ${problems.length} problems\n  ${problems.join("\n  ")}`
      : `${commit.slice(0, 12)}: every file matches its manifest and, decoded by a build of ${commit.slice(0, 12)}, loads unchanged and holds its kind's facts`);
    process.exit(problems.length ? 1 : 0);
    break;
  }
  case "import": {
    const dir = positional[0];
    if (!dir || !fs.existsSync(path.join(dir, "manifest.json"))) { console.error("usage: saves.js import DIR (a commit directory with manifest.json)"); process.exit(2); }
    const commit = (JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { commit: string }).commit;
    try { git.resolve(commit); } catch { console.error(`${commit} is not a commit in this repository`); process.exit(2); }
    const decoder = decoderFor(commit);
    try {
      const r = await importCommitDir(dir, root, decoder.verify);
      console.log(`${r.commit.slice(0, 12)}: ${r.status} at ${path.join(root, r.commit)}, decoded by a build of ${r.commit.slice(0, 12)} before publishing`);
    } catch (e) {
      console.error(`REFUSED: ${(e as Error).message}`);
      process.exit(1);
    } finally { decoder.done(); }
    break;
  }
  case "index": {
    const removed = await writeIndex(root);
    if (removed.length) console.log(`collected ${removed.length} orphaned staging directories: ${removed.join(", ")}`);
    console.log(`${path.join(root, "index.json")} rewritten`);
    break;
  }
  default:
    console.error("usage: saves.js pick|list|kinds|verify|import|index [--root DIR] ...");
    process.exit(2);
}
