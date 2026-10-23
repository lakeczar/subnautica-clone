/** The save library's CLI (SAVE-1). Build first: npx tsc -p scripts/playthrough/tsconfig.json
 *
 *   node .test-build/scripts/playthrough/saves.js pick KIND [--commit REF] [--exact] [--json]
 *       Print the path of the newest save of KIND compatible with REF (default HEAD);
 *       what was chosen goes to stderr. Exit 3, naming every candidate's reason, if none is.
 *   ... list                      commits in the library and the kinds each holds
 *   ... kinds                     the standard kinds and where each comes from
 *   ... verify [REF]              re-check a commit's files; decode them too when REF is HEAD
 *   ... import DIR                bring in a commit directory exported elsewhere (the second worker)
 *   ... index                     rewrite index.json from the manifests
 * Every command takes --root DIR (default $SILTWAKE_SAVES or /work/tmp/siltwake-saves). */
import fs from "node:fs";
import path from "node:path";
import { KINDS } from "./kinds.js";
import { describePick, gitPort, importCommitDir, LibraryRefusal, libraryRoot, pickSave, readLibrary, verifyCommitDir, writeIndex } from "./library.js";

const [command, ...rest] = process.argv.slice(2);
const value = (flag: string): string | undefined => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };
const positional = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--root", "--commit"].includes(rest[i - 1]!)));
const root = libraryRoot(value("--root"));
const git = gitPort();

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
    const commit = git.resolve(positional[0] ?? "HEAD"), head = git.resolve("HEAD");
    const problems = verifyCommitDir(path.join(root, commit), commit === head);
    console.log(problems.length ? `${commit.slice(0, 12)}: ${problems.length} problems\n  ${problems.join("\n  ")}`
      : `${commit.slice(0, 12)}: every file matches its manifest${commit === head ? ", loads to its hash and holds its kind's facts" : " (decoding needs a checkout at that commit)"}`);
    process.exit(problems.length ? 1 : 0);
    break;
  }
  case "import": {
    const dir = positional[0];
    if (!dir || !fs.existsSync(path.join(dir, "manifest.json"))) { console.error("usage: saves.js import DIR (a commit directory with manifest.json)"); process.exit(2); }
    const commit = path.basename(path.resolve(dir));
    try { git.resolve(commit); } catch { console.error(`${commit} is not a commit in this repository`); process.exit(2); }
    const decode = git.resolve("HEAD") === commit;
    const r = importCommitDir(dir, root, decode);
    console.log(`${r.commit.slice(0, 12)}: ${r.status} at ${path.join(root, r.commit)}${decode ? " (decoded and checked here)" : " (files checked; decode with `verify` from a checkout at that commit)"}`);
    break;
  }
  case "index":
    writeIndex(root);
    console.log(`${path.join(root, "index.json")} rewritten`);
    break;
  default:
    console.error("usage: saves.js pick|list|kinds|verify|import|index [--root DIR] ...");
    process.exit(2);
}
