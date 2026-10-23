/** SAVE-1: the shared save library. After each root merge the playthrough exports
 * its bot-earned saves (`npm run playthrough -- --export`) into an immutable
 * directory per commit:
 *
 *   <root>/<commit>/manifest.json   provenance, sizes, measurements
 *   <root>/<commit>/<scenario>@<label>.json   each save, exactly as the codec wrote it
 *   <root>/index.json               a convenience list; the manifests are the truth
 *
 * `<root>` is $SILTWAKE_SAVES, else /work/tmp/siltwake-saves (shared by every
 * factory-worker worktree). Consumers ask for "the newest save of kind X
 * compatible with this commit" (`pickSave`, `librarySave`, or the `saves.js pick`
 * CLI). Compatible means: the library's commit is this commit or one of its
 * ancestors, its schema and content versions are this build's (or schema 5,
 * which this build bridges), and this build's own decoder accepts the file. The
 * nearest such commit wins. Anything else is refused with every candidate's
 * reason; nothing falls back silently. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONTENT_VERSION } from "../../src/content/registry.js";
import { decodeSave, MAX_SAVE_BYTES, SAVE_SCHEMA_VERSION } from "../../src/save/codec.js";
import type { GameState } from "../../src/sim/types.js";
import { KINDS, kindsOf, summarize } from "./kinds.js";
import { stateHash } from "./persistence.js";
import type { RunRecord } from "./timeline.js";

export const LIBRARY_FORMAT = "siltwake.save-library";
export const DEFAULT_LIBRARY_ROOT = "/work/tmp/siltwake-saves";
export const libraryRoot = (root?: string): string => path.resolve(root ?? process.env.SILTWAKE_SAVES ?? DEFAULT_LIBRARY_ROOT);
/** The repository's journal ceiling (repository.ts: 8 × the save limit). */
export const MAX_JOURNAL_BYTES = MAX_SAVE_BYTES * 8;
/** Chromium's and Firefox's localStorage quota per origin, key plus value, in UTF-16 characters (documented, not measured here). */
export const LOCAL_STORAGE_CHARS = 5 * 1024 * 1024;

export interface LibraryEntry {
  /** File name inside the commit directory. */
  file: string;
  scenario: string;
  /** Phase ID for a milestone, the capture's name for a capture. */
  label: string;
  /** The phase being played when it was saved. */
  phase: string;
  capture: boolean;
  /** Named kinds this save provides, then its own `scenario@label`. */
  kinds: string[];
  /** The branch point the scenario started from (`creel@refits`), or null for New Game. */
  from: string | null;
  tick: number;
  minutes: number;
  /** Accepted commands since New Game, parents included: how it was earned. */
  commands: number;
  bytes: number;
  journalBytes: number;
  /** stateHash of the state, as saved and as reloaded on the exporting machine. */
  hash: string;
  /** SHA-256 of the file, so a copy between machines can be checked. */
  sha256: string;
  facts: Record<string, string | number | boolean | null>;
}
export interface Manifest {
  format: typeof LIBRARY_FORMAT;
  version: 1;
  commit: string;
  schemaVersion: number;
  contentVersion: string;
  machine: string;
  generatedAt: string;
  scenarios: { id: string; outcome: RunRecord["outcome"]; minutes: number; wallMs: number; from: string | null }[];
  saves: LibraryEntry[];
  sizes: {
    largest: { file: string; bytes: number };
    maxSaveBytes: number;
    /** Largest journal record seen after a commit (current + previous generations). */
    largestJournalBytes: number;
    /** Current, previous and preserved generations all at the largest save, as the journal escapes them. */
    worstJournalBytes: number;
    maxJournalBytes: number;
    localStorageChars: number;
  };
  measurements: Record<string, Record<string, number>>;
  notes: string[];
}

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const utf8 = (text: string): number => Buffer.byteLength(text, "utf8");

// ----------------------------------------------------------------------------- git

/** The repository questions compatibility needs; tests substitute a fake. */
export interface GitPort {
  /** Full SHA of a ref, or throws. */
  resolve(ref: string): string;
  /** Is `a` the same commit as, or an ancestor of, `b`? */
  isAncestor(a: string, b: string): boolean;
  /** Commits on `b` not on `a` (0 when equal). */
  distance(a: string, b: string): number;
}
export function gitPort(cwd = process.cwd()): GitPort {
  const git = (...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  return {
    resolve: (ref) => git("rev-parse", "--verify", `${ref}^{commit}`),
    isAncestor: (a, b) => { try { git("merge-base", "--is-ancestor", a, b); return true; } catch { return false; } },
    distance: (a, b) => Number(git("rev-list", "--count", `${a}..${b}`)),
  };
}
/** The commit being exported, refusing a tree with uncommitted tracked changes. */
export function exportCommit(git: GitPort, cwd = process.cwd(), allowDirty = false): string {
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd, encoding: "utf8" }).trim();
  if (dirty && !allowDirty) throw new Error(`The tree has uncommitted changes; a library is tagged by commit. Commit first.\n${dirty}`);
  return git.resolve("HEAD");
}

// ----------------------------------------------------------------------------- reading

export interface Rejected { commit: string; reason: string }
const SHA = /^[0-9a-f]{40}$/;

function readManifest(dir: string): Manifest {
  const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;
  if (m.format !== LIBRARY_FORMAT || m.version !== 1) throw new Error(`not a ${LIBRARY_FORMAT} v1 manifest`);
  if (m.commit !== path.basename(dir)) throw new Error(`manifest names commit ${m.commit}`);
  if (!Array.isArray(m.saves) || !m.saves.every((e) => typeof e.file === "string" && Array.isArray(e.kinds) && typeof e.sha256 === "string"))
    throw new Error("malformed save entries");
  return m;
}
/** Every commit directory's manifest; unreadable ones come back as rejected, with the reason. */
export function readLibrary(root = libraryRoot()): { manifests: Manifest[]; rejected: Rejected[] } {
  const manifests: Manifest[] = [], rejected: Rejected[] = [];
  if (!fs.existsSync(root)) return { manifests, rejected };
  for (const name of fs.readdirSync(root).filter((n) => SHA.test(n)).sort()) {
    try { manifests.push(readManifest(path.join(root, name))); } catch (e) { rejected.push({ commit: name, reason: `unreadable manifest: ${(e as Error).message}` }); }
  }
  return { manifests, rejected };
}

// ----------------------------------------------------------------------------- picking

export type Compatibility = "same-commit" | "same-version" | "bridged";
export interface Picked {
  kind: string;
  path: string;
  text: string;
  state: GameState;
  manifest: Manifest;
  entry: LibraryEntry;
  compatibility: Compatibility;
  /** Commits between the library's and the target. */
  distance: number;
  /** The decoded state differs from the saved one: additive content or the schema 5 bridge filled it in on load. */
  migrated: boolean;
  /** Candidates passed over, nearest first, with why. */
  passed: Rejected[];
}
export class LibraryRefusal extends Error {
  constructor(message: string, readonly rejected: readonly Rejected[]) {
    super(rejected.length ? `${message}\n${rejected.map((r) => `  ${r.commit.slice(0, 12)}: ${r.reason}`).join("\n")}` : message);
  }
}
export interface PickOptions {
  root?: string | undefined;
  /** The commit the save must suit (default HEAD). */
  commit?: string | undefined;
  /** Only a save exported at exactly that commit, loading to its recorded hash. */
  exact?: boolean | undefined;
  git?: GitPort | undefined;
}

/** The version this build reads for a library commit, or why it cannot. */
function versionCompatibility(m: Manifest): Compatibility | string {
  if (m.schemaVersion === SAVE_SCHEMA_VERSION && m.contentVersion === CONTENT_VERSION) return "same-version";
  if (m.schemaVersion === 5 && m.contentVersion === "expedition.6") return "bridged";
  return `schema ${m.schemaVersion} / ${m.contentVersion}; this build reads schema ${SAVE_SCHEMA_VERSION} / ${CONTENT_VERSION} (and bridges schema 5 / expedition.6)`;
}

/** The newest library save of `kind` compatible with the target commit, decoded by this build. Throws LibraryRefusal. */
export function pickSave(kind: string, o: PickOptions = {}): Picked {
  const root = libraryRoot(o.root), git = o.git ?? gitPort();
  const target = git.resolve(o.commit ?? "HEAD");
  const known = KINDS.map((k) => k.kind);
  const { manifests, rejected: unreadable } = readLibrary(root);
  const holding = manifests.filter((m) => m.saves.some((e) => e.kinds.includes(kind)));
  if (!holding.length) {
    const own = new Set(manifests.flatMap((m) => m.saves.map((e) => e.scenario)));
    throw new LibraryRefusal(`No save of kind "${kind}" in the library at ${root}. Known kinds: ${[...known].join(", ")}; ` +
      `and every save as scenario@label (scenarios here: ${[...own].join(", ") || "none"}; saves.js list).`, unreadable);
  }
  const rejected: Rejected[] = [...unreadable], ok: { m: Manifest; distance: number; compatibility: Compatibility }[] = [];
  for (const m of holding) {
    if (o.exact && m.commit !== target) { rejected.push({ commit: m.commit, reason: "not the exact commit asked for" }); continue; }
    if (!git.isAncestor(m.commit, target)) { rejected.push({ commit: m.commit, reason: `not in ${target.slice(0, 12)}'s history (another branch, or newer)` }); continue; }
    const v = versionCompatibility(m);
    if (v !== "same-version" && v !== "bridged") { rejected.push({ commit: m.commit, reason: v }); continue; }
    const distance = git.distance(m.commit, target);
    ok.push({ m, distance, compatibility: distance === 0 ? "same-commit" : v });
  }
  ok.sort((a, b) => a.distance - b.distance);
  const best = ok[0];
  if (!best) throw new LibraryRefusal(`No library save of kind "${kind}" is compatible with ${target.slice(0, 12)}. Export the library at this commit (npm run playthrough -- --export).`, rejected);
  const entry = best.m.saves.find((e) => e.kinds.includes(kind))!;
  const file = path.join(root, best.m.commit, entry.file);
  // The nearest compatible save must load. A failure here is loud: an older one is never tried instead.
  const text = fs.readFileSync(file, "utf8");
  if (sha256(text) !== entry.sha256) throw new LibraryRefusal(`${file} does not match its manifest (SHA-256 differs): the library copy is damaged.`, []);
  const decoded = decodeSave(text);
  if (!decoded.ok) throw new LibraryRefusal(`The nearest compatible save of kind "${kind}" (${best.m.commit.slice(0, 12)}, ${best.distance} commits back) does not load in this build: ${decoded.error}`, []);
  const migrated = stateHash(decoded.value.state) !== entry.hash;
  if (o.exact && migrated) throw new LibraryRefusal(`The save of kind "${kind}" at ${target.slice(0, 12)} loads to a different hash than it was saved with.`, []);
  return { kind, path: file, text, state: decoded.value.state, manifest: best.m, entry, compatibility: best.compatibility, distance: best.distance, migrated,
    passed: rejected.filter((r) => holding.some((m) => m.commit === r.commit)) };
}
/** For tests and GPU drivers: `pickSave`, plus one line saying what was loaded. */
export function librarySave(kind: string, o: PickOptions = {}): Picked & { describe: string } {
  const p = pickSave(kind, o);
  return { ...p, describe: describePick(p) };
}
export const describePick = (p: Picked): string =>
  `${p.kind}: ${p.entry.scenario}@${p.entry.label} from ${p.manifest.commit.slice(0, 12)} (${p.compatibility}, ${p.distance} commits back` +
  `${p.migrated ? ", migrated on load" : ""}); earned in ${p.entry.minutes} min of play by ${p.entry.commands} commands${p.entry.from ? ` after ${p.entry.from}` : ""}`;

/** The browser's local-save journal record holding just this save, for a driver to
 * seed `siltwake.save.journal.v1` (repository.ts) instead of importing a file. */
export const journalRecord = (text: string): string =>
  JSON.stringify({ format: "siltwake.local", version: 1, current: text, previous: null, preserved: null });

// ----------------------------------------------------------------------------- building and publishing

export interface Produced { scenario: string; label: string; text: string }
/** Build a commit's manifest from the runs and the saves they made. Problems mean it must not publish. */
export function buildManifest(commit: string, runs: readonly RunRecord[], produced: readonly Produced[],
  fromOf: (scenario: string) => string | null): { manifest: Manifest; problems: string[] } {
  const problems: string[] = [], saves: LibraryEntry[] = [];
  for (const p of produced) {
    const run = runs.find((r) => r.scenario === p.scenario);
    const record = run?.saves.filter((r) => r.label === p.label).at(-1);
    if (!run || !record) { problems.push(`${p.scenario}@${p.label}: no save record`); continue; }
    const decoded = decodeSave(p.text);
    if (!decoded.ok) { problems.push(`${p.scenario}@${p.label} does not load: ${decoded.error}`); continue; }
    const hash = stateHash(decoded.value.state);
    if (hash !== record.hash || !record.equal) problems.push(`${p.scenario}@${p.label} reloads to ${hash}, not its recorded ${record.hash}`);
    const kinds = kindsOf(p.scenario, p.label);
    for (const spec of KINDS.filter((k) => kinds.includes(k.kind) && k.facts))
      for (const f of spec.facts!(decoded.value.state)) problems.push(`${spec.kind} is not what it claims: ${f}`);
    saves.push({
      file: `${p.scenario}@${p.label}.json`, scenario: p.scenario, label: p.label, phase: record.phase, capture: !!record.capture, kinds,
      from: fromOf(p.scenario), tick: record.tick, minutes: Math.round(record.tick / 360) / 10, commands: record.commands,
      bytes: utf8(p.text), journalBytes: record.journalBytes, hash, sha256: sha256(p.text), facts: summarize(decoded.value.state),
    });
  }
  // Every kind whose scenario was played must be there (a partial export, to a private root, plays fewer).
  for (const spec of KINDS)
    if (runs.some((r) => `${r.scenario}@` === spec.source.slice(0, spec.source.indexOf("@") + 1)) && !saves.some((e) => e.kinds.includes(spec.kind)))
      problems.push(`kind ${spec.kind} (${spec.source}) was not produced`);
  const largest = saves.reduce((a, b) => b.bytes > a.bytes ? b : a, saves[0] ?? { file: "", bytes: 0 } as LibraryEntry);
  const largestText = produced.find((p) => `${p.scenario}@${p.label}.json` === largest.file)?.text ?? "";
  const escaped = utf8(JSON.stringify(largestText));
  const manifest: Manifest = {
    format: LIBRARY_FORMAT, version: 1, commit, schemaVersion: SAVE_SCHEMA_VERSION, contentVersion: CONTENT_VERSION,
    machine: os.hostname(), generatedAt: new Date().toISOString(),
    scenarios: runs.map((r) => ({ id: r.scenario, outcome: r.outcome, minutes: r.minutes, wallMs: r.wallMs, from: fromOf(r.scenario) })),
    saves,
    sizes: {
      largest: { file: largest.file, bytes: largest.bytes }, maxSaveBytes: MAX_SAVE_BYTES,
      largestJournalBytes: Math.max(0, ...saves.map((e) => e.journalBytes)),
      worstJournalBytes: 3 * escaped + 96, maxJournalBytes: MAX_JOURNAL_BYTES, localStorageChars: LOCAL_STORAGE_CHARS,
    },
    measurements: Object.fromEntries(runs.filter((r) => Object.keys(r.measurements ?? {}).length).map((r) => [r.scenario, r.measurements])),
    notes: runs.flatMap((r) => r.notes.map((n) => `${r.scenario}: ${n}`)),
  };
  for (const r of runs) {
    if (r.outcome !== "complete") problems.push(`${r.scenario} did not complete (${r.outcome})`);
    for (const c of r.checks) if (!c.ok) problems.push(`${r.scenario}: check failed: ${c.name} ${c.detail}`);
  }
  return { manifest, problems };
}

export type PublishStatus = "published" | "identical";
/** Move a finished staging directory into place as `<root>/<commit>`, read-only.
 * An existing directory is never replaced: an identical re-export is reported as
 * such, and a different one is an error (the bot is meant to be deterministic). */
export function publish(root: string, staging: string, manifest: Manifest): PublishStatus {
  fs.writeFileSync(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  const dir = path.join(root, manifest.commit);
  if (fs.existsSync(dir)) {
    const old = readManifest(dir), files = (m: Manifest) => m.saves.map((e) => `${e.file} ${e.sha256}`).sort().join("\n");
    fs.rmSync(staging, { recursive: true, force: true });
    if (files(old) === files(manifest)) return "identical";
    const diff = manifest.saves.filter((e) => !old.saves.some((x) => x.file === e.file && x.sha256 === e.sha256)).map((e) => e.file);
    throw new Error(`${dir} already holds a different export (${diff.join(", ") || "different file set"}). A library directory is immutable; investigate the nondeterminism.`);
  }
  for (const f of fs.readdirSync(staging)) fs.chmodSync(path.join(staging, f), 0o444);
  fs.renameSync(staging, dir);
  fs.chmodSync(dir, 0o555);
  writeIndex(root);
  return "published";
}
/** Rewrite index.json (atomically) from the manifests. */
export function writeIndex(root: string): void {
  const { manifests } = readLibrary(root);
  const index = {
    format: `${LIBRARY_FORMAT}-index`, generatedAt: new Date().toISOString(),
    commits: manifests.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).map((m) => ({
      commit: m.commit, schemaVersion: m.schemaVersion, contentVersion: m.contentVersion, machine: m.machine, generatedAt: m.generatedAt,
      kinds: [...new Set(m.saves.flatMap((e) => e.kinds.filter((k) => !k.includes("@"))))], saves: m.saves.length,
    })),
  };
  const tmp = path.join(root, `.index-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(index, null, 1) + "\n");
  fs.renameSync(tmp, path.join(root, "index.json"));
}
/** A fresh staging directory inside the root, so publishing is one rename. */
export function stagingDir(root: string, commit: string): string {
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, `.staging-${commit.slice(0, 12)}-`));
}

/** Check a commit directory against its manifest: every file's SHA-256, and, when
 * `decode` (this build is that commit), every save loading to its recorded hash
 * and every kind's facts. */
export function verifyCommitDir(dir: string, decode: boolean): string[] {
  const problems: string[] = [];
  let m: Manifest;
  try { m = readManifest(dir); } catch (e) { return [`${dir}: ${(e as Error).message}`]; }
  for (const e of m.saves) {
    const file = path.join(dir, e.file);
    if (!fs.existsSync(file)) { problems.push(`${e.file} is missing`); continue; }
    const text = fs.readFileSync(file, "utf8");
    if (sha256(text) !== e.sha256) { problems.push(`${e.file}: SHA-256 differs from the manifest`); continue; }
    if (!decode) continue;
    const decoded = decodeSave(text);
    if (!decoded.ok) { problems.push(`${e.file} does not load: ${decoded.error}`); continue; }
    if (stateHash(decoded.value.state) !== e.hash) problems.push(`${e.file} loads to a different hash`);
    for (const spec of KINDS.filter((k) => e.kinds.includes(k.kind) && k.facts))
      for (const f of spec.facts!(decoded.value.state)) problems.push(`${e.file} (${spec.kind}): ${f}`);
  }
  return problems;
}
/** Bring a commit directory exported elsewhere (the second worker) into the root. */
export function importCommitDir(source: string, root: string, decode: boolean): { status: PublishStatus; commit: string } {
  const m = readManifest(source), problems = verifyCommitDir(source, decode);
  if (problems.length) throw new Error(`${source} does not verify:\n  ${problems.join("\n  ")}`);
  const staging = stagingDir(root, m.commit);
  for (const e of m.saves) fs.copyFileSync(path.join(source, e.file), path.join(staging, e.file));
  return { status: publish(root, staging, m), commit: m.commit };
}
