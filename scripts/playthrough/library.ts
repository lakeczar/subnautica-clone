/** SAVE-1: the shared save library. After each root merge the playthrough exports
 * its bot-earned saves (`scripts/saves-export.sh`: `run.js --export` from an archive build of the commit) into an immutable
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
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
/** The directory this code was compiled in (…/.test-build/scripts/playthrough/library.js → …). */
export const CODE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const SOURCE_MARKER = ".siltwake-source-commit";
/** The commit this code was built from, when it was built by scripts/saves-build-at.sh
 * (an archive of exactly that commit); null for code compiled in a worktree, whose
 * compiled output may lag its source. Only marked code exports, or decodes an import. */
export function codeCommit(root = CODE_ROOT): string | null {
  try {
    const sha = fs.readFileSync(path.join(root, SOURCE_MARKER), "utf8").trim();
    return SHA.test(sha) ? sha : null;
  } catch { return null; }
}

// ----------------------------------------------------------------------------- reading

export interface Rejected { commit: string; reason: string }
const SHA = /^[0-9a-f]{40}$/;

function readManifest(dir: string): Manifest {
  const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;
  if (m.format !== LIBRARY_FORMAT || m.version !== 1) throw new Error(`not a ${LIBRARY_FORMAT} v1 manifest`);
  // A commit directory is named by its commit, in staging too (`.staging-…/<sha>`).
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
  // An export whose manifest can't be read may hold a nearer save of this kind: it is a
  // candidate too, and one at least as near as the best readable save refuses the pick.
  const hidden = unreadable.filter((u) => !o.exact || u.commit === target).flatMap((u) =>
    git.isAncestor(u.commit, target) ? [{ ...u, distance: git.distance(u.commit, target) }] : []);
  const blocking = hidden.filter((u) => !best || u.distance <= best.distance).sort((a, b) => a.distance - b.distance);
  if (blocking.length) {
    const older = ok.map((c) => ({ commit: c.m.commit, reason: `compatible (${c.compatibility}, ${c.distance} commits back) but not tried: a nearer export is unreadable` }));
    throw new LibraryRefusal(`The export at ${blocking[0]!.commit.slice(0, 12)} (${blocking[0]!.distance} commits back) is unreadable and could hold a nearer save of kind "${kind}"; repair or remove it by hand.`,
      [...blocking.map((u) => ({ commit: u.commit, reason: u.reason })), ...older, ...rejected.filter((r) => !unreadable.includes(r))]);
  }
  if (!best) throw new LibraryRefusal(`No library save of kind "${kind}" is compatible with ${target.slice(0, 12)}. Export the library at this commit (scripts/saves-export.sh).`, rejected);
  const entry = best.m.saves.find((e) => e.kinds.includes(kind))!;
  const file = path.join(root, best.m.commit, entry.file);
  // The nearest compatible save must load. A failure here is loud: an older one is never tried instead.
  const refuse = (why: string): never => {
    const older = ok.slice(1).map((c) => ({ commit: c.m.commit,
      reason: `compatible (${c.compatibility}, ${c.distance} commits back) but not tried: only the nearest compatible save may serve; repair or re-export ${best.m.commit.slice(0, 12)}` }));
    throw new LibraryRefusal(`The nearest compatible save of kind "${kind}" (${best.m.commit.slice(0, 12)}, ${best.distance} commits back, ${file}) ${why}`,
      [{ commit: best.m.commit, reason: why }, ...older, ...rejected]);
  };
  let text: string;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { return refuse(`cannot be read: ${(e as Error).message}`); }
  if (sha256(text) !== entry.sha256) refuse("does not match its manifest (SHA-256 differs): the library copy is damaged");
  // The recorded hash is of the state as saved: check it before any migration.
  const raw = rawStateHash(text);
  if (!raw.ok) return refuse(raw.error);
  if (raw.hash !== entry.hash) refuse(`holds a state hashing to ${raw.hash}, not its recorded ${entry.hash}: the manifest or file is damaged`);
  let decoded: ReturnType<typeof decodeSave>;
  try { decoded = decodeSave(text); } catch (e) { return refuse(`breaks this build's decoder: ${(e as Error).message}`); }
  if (!decoded.ok) return refuse(`does not load in this build: ${decoded.error}`);
  // Migrated only when this build's decoder actually changed the state (the schema 5 bridge, additive content).
  const migrated = stateHash(decoded.value.state) !== entry.hash;
  if (o.exact && migrated) refuse("loads to a different hash than it was saved with (it needs migration in this build)");
  return { kind, path: file, text, state: decoded.value.state, manifest: best.m, entry, compatibility: best.compatibility, distance: best.distance, migrated,
    passed: [...rejected.filter((r) => holding.some((m) => m.commit === r.commit)),
      ...hidden.map((u) => ({ commit: u.commit, reason: `${u.reason} (${u.distance} commits back, farther than the save used)` }))] };
}
/** The stateHash of a save file's raw `state`, before any decoding, or why there is none. */
function rawStateHash(text: string): { ok: true; hash: string } | { ok: false; error: string } {
  let envelope: unknown;
  try { envelope = JSON.parse(text); } catch { return { ok: false, error: "is not JSON" }; }
  const state = typeof envelope === "object" && envelope !== null ? (envelope as { state?: unknown }).state : undefined;
  if (typeof state !== "object" || state === null || Array.isArray(state)) return { ok: false, error: "has no state object in its envelope" };
  try { return { ok: true, hash: stateHash(state as GameState) }; } catch (e) { return { ok: false, error: `holds a state that cannot be hashed: ${(e as Error).message}` }; }
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
    const hash = stateHash((JSON.parse(p.text) as { state: GameState }).state);
    if (stateHash(decoded.value.state) !== hash) problems.push(`${p.scenario}@${p.label} changes when its own build loads it (an export never needs a migration)`);
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
const files = (m: Manifest): string => m.saves.map((e) => `${e.file} ${e.sha256}`).sort().join("\n");

// ----------------------------------------------------------------------------- locks and staging

/** An exclusive kernel lock (flock(1)) on `file`, held by a child process for as long
 * as this process wants it. The lock file is never unlinked, so the lock always lives
 * on one inode; if this process dies, the child's stdin closes and the kernel drops
 * the lock. Nothing ever removes another owner's lock. */
export interface HeldLock { release(): Promise<void> }
export function holdLock(file: string, timeoutS = 120): Promise<HeldLock> {
  return new Promise((resolve, reject) => {
    const child = spawn("flock", ["-x", "-w", String(timeoutS), file, "-c", "echo held; exec cat >/dev/null"], { stdio: ["pipe", "pipe", "inherit"] });
    let held = false;
    const exited = new Promise<void>((done) => child.once("exit", () => done()));
    child.once("error", (e) => reject(new Error(`flock(1) is needed for the save library's locks: ${e.message}`)));
    child.stdout.once("data", () => {
      held = true;
      resolve({ release: () => { child.stdin.end(); return exited; } });
    });
    child.once("exit", (code) => { if (!held) reject(new Error(`Could not lock ${file} within ${timeoutS} s (flock exit ${code})${holderOf(file)}`)); });
  });
}
const holderOf = (file: string): string => { try { return `; last holder: ${fs.readFileSync(`${file}.owner`, "utf8").trim()}`; } catch { return ""; } };
/** Is anyone holding `file`'s lock? (A free lock is taken and released at once.) */
const lockFree = (file: string): boolean => spawnSync("flock", ["-n", file, "true"]).status === 0;

/** Publication and index rebuilds run one at a time per root, under `<root>/.publish.lock`. */
export async function withLibraryLock<T>(root: string, fn: () => T | Promise<T>): Promise<T> {
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, ".publish.lock"), lock = await holdLock(file);
  try {
    fs.writeFileSync(`${file}.owner`, `${os.hostname()} pid ${process.pid} since ${new Date().toISOString()}\n`);
    return await fn();
  } finally { await lock.release(); }
}
/** Fault injection for the lock regression test only: with SILTWAKE_LIBRARY_PAUSE set,
 * an index rebuild that has read the manifests writes `<file>.in` and waits for `<file>`.
 * Never set in normal use. */
function testPause(): void {
  const file = process.env.SILTWAKE_LIBRARY_PAUSE;
  if (!file) return;
  fs.writeFileSync(`${file}.in`, String(process.pid));
  while (!fs.existsSync(file)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
}
/** Under the lock: rewrite index.json (atomically) from the manifests, and collect
 * orphaned staging. Returns the staging directories removed. */
export async function writeIndex(root: string): Promise<string[]> {
  return withLibraryLock(root, () => { writeIndexLocked(root); return collectStaging(root); });
}
function writeIndexLocked(root: string): void {
  const { manifests } = readLibrary(root);
  testPause();
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

/** A staging directory: `<root>/.staging-<sha12>-XXXXXX/<sha>`, named by its commit so
 * any build's verifier accepts it, and leased: its owner holds the kernel lock on
 * `.lease` beside it for its whole life, so an orphan (owner gone) is told from a live
 * export by the lock alone, never by age. */
export interface Staging { dir: string; discard(): Promise<void> }
export async function stagingDir(root: string, commit: string): Promise<Staging> {
  fs.mkdirSync(root, { recursive: true });
  // Created under a name collection ignores until the lease is held, then renamed.
  const fresh = fs.mkdtempSync(path.join(root, `.new-staging-${commit.slice(0, 12)}-`));
  const lease = await holdLock(path.join(fresh, ".lease"), 10);
  const outer = path.join(root, `.${path.basename(fresh).slice(".new-".length)}`);
  fs.renameSync(fresh, outer);
  const dir = path.join(outer, commit);
  fs.mkdirSync(dir);
  let gone = false;
  return { dir, discard: async () => {
    if (gone) return;
    gone = true;
    removeTree(outer);
    await lease.release();
  } };
}
const removeTree = (dir: string): void => {
  if (!fs.existsSync(dir)) return;
  spawnSync("chmod", ["-R", "u+w", dir]);
  fs.rmSync(dir, { recursive: true, force: true });
};
/** Remove staging directories whose owner is gone: its lease is free. One without a
 * lease (an older build's, or a crash before the lease) is left alone unless it is a
 * `.new-staging-` more than ten minutes old. Returns what it removed. */
export function collectStaging(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const removed: string[] = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name), lease = path.join(dir, ".lease");
    const leased = name.startsWith(".staging-"), creating = name.startsWith(".new-staging-");
    if (!leased && !creating) continue;
    let age = 0;
    try { age = Date.now() - fs.statSync(dir).mtimeMs; } catch { continue; }
    if (leased ? (fs.existsSync(lease) && lockFree(lease)) : (age > 600_000 && (!fs.existsSync(lease) || lockFree(lease)))) {
      removeTree(dir);
      removed.push(name);
    }
  }
  return removed;
}

/** Move a finished, verified staging directory into place as `<root>/<commit>`,
 * read-only, under the library lock (one publisher and one index rebuild at a time).
 * An existing directory is never replaced: it must itself verify (`verifyExisting`)
 * and hold the same files, which makes a repeated or concurrent identical export
 * "identical"; a different one is an error (the bot is meant to be deterministic).
 * Orphaned staging is collected under the same lock. The staging is gone afterwards. */
export async function publish(root: string, staging: Staging, manifest: Manifest, verifyExisting: (dir: string) => string[]): Promise<PublishStatus> {
  const dir = path.join(root, manifest.commit);
  try {
    if (path.basename(staging.dir) !== manifest.commit) throw new Error(`staging ${staging.dir} is not named by commit ${manifest.commit}`);
    fs.writeFileSync(path.join(staging.dir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
    return await withLibraryLock(root, () => {
      collectStaging(root);
      if (!fs.existsSync(dir)) {
        for (const f of fs.readdirSync(staging.dir)) fs.chmodSync(path.join(staging.dir, f), 0o444);
        try {
          fs.renameSync(staging.dir, dir);
          fs.chmodSync(dir, 0o555);
          writeIndexLocked(root);
          return "published" as const;
        } catch (e) {
          // A writer outside the lock (an older build) created it first: judge the winner below.
          if (!["EEXIST", "ENOTEMPTY"].includes((e as NodeJS.ErrnoException).code ?? "")) throw e;
        }
      }
      const problems = verifyExisting(dir);
      if (problems.length) throw new Error(`${dir} already exists and does not verify:\n  ${problems.join("\n  ")}`);
      const old = readManifest(dir);
      if (files(old) !== files(manifest)) {
        const diff = manifest.saves.filter((e) => !old.saves.some((x) => x.file === e.file && x.sha256 === e.sha256)).map((e) => e.file);
        throw new Error(`${dir} already holds a different export (${diff.join(", ") || "different file set"}). A library directory is immutable; investigate the nondeterminism.`);
      }
      return "identical" as const;
    });
  } finally { await staging.discard(); }
}

/** Check a commit directory against its manifest: every file's SHA-256 and recorded
 * state hash, and, when `decode` (this code was built from that commit), every save
 * loading unchanged and every kind's facts. */
export function verifyCommitDir(dir: string, decode: boolean): string[] {
  const problems: string[] = [];
  let m: Manifest;
  try { m = readManifest(dir); } catch (e) { return [`${dir}: ${(e as Error).message}`]; }
  for (const e of m.saves) {
    const file = path.join(dir, e.file);
    if (!fs.existsSync(file)) { problems.push(`${e.file} is missing`); continue; }
    const text = fs.readFileSync(file, "utf8");
    if (sha256(text) !== e.sha256) { problems.push(`${e.file}: SHA-256 differs from the manifest`); continue; }
    const raw = rawStateHash(text);
    if (!raw.ok) { problems.push(`${e.file} ${raw.error}`); continue; }
    if (raw.hash !== e.hash) { problems.push(`${e.file} holds a state hashing to ${raw.hash}, not its recorded ${e.hash}`); continue; }
    if (!decode) continue;
    const decoded = decodeSave(text);
    if (!decoded.ok) { problems.push(`${e.file} does not load: ${decoded.error}`); continue; }
    if (stateHash(decoded.value.state) !== e.hash) problems.push(`${e.file} loads to a different hash`);
    for (const spec of KINDS.filter((k) => e.kinds.includes(k.kind) && k.facts))
      for (const f of spec.facts!(decoded.value.state)) problems.push(`${e.file} (${spec.kind}): ${f}`);
  }
  return problems;
}
/** Bring a commit directory exported elsewhere (the second worker) into the root:
 * copied into a hidden staging directory, decoded there by `verify` (a build of
 * that commit), and only then published. A failure publishes nothing. */
export async function importCommitDir(source: string, root: string, verify: (dir: string) => string[]): Promise<{ status: PublishStatus; commit: string }> {
  const m = readManifest(source), files = verifyCommitDir(source, false);
  if (files.length) throw new Error(`${source} does not verify:\n  ${files.join("\n  ")}`);
  const staging = await stagingDir(root, m.commit);
  try {
    for (const e of m.saves) fs.copyFileSync(path.join(source, e.file), path.join(staging.dir, e.file));
    fs.writeFileSync(path.join(staging.dir, "manifest.json"), fs.readFileSync(path.join(source, "manifest.json")));
    const problems = verify(staging.dir);
    if (problems.length) throw new Error(`${source} does not decode:\n  ${problems.join("\n  ")}`);
  } catch (e) { await staging.discard(); throw e; }
  return { status: await publish(root, staging, m, verify), commit: m.commit };
}
