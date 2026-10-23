import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONTENT_VERSION } from "../src/content/registry.js";
import { createEnvelope, encodeSave, SAVE_SCHEMA_VERSION } from "../src/save/codec.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";
import { Driver } from "../scripts/playthrough/driver.js";
import { KINDS, kindsOf } from "../scripts/playthrough/kinds.js";
import { buildManifest, importCommitDir, LibraryRefusal, pickSave, publish, readLibrary, stagingDir, verifyCommitDir } from "../scripts/playthrough/library.js";
import type { GitPort, Manifest } from "../scripts/playthrough/library.js";
import { SaveSlot, stateHash } from "../scripts/playthrough/persistence.js";
import { playScenarios } from "../scripts/playthrough/scenarios.js";
import { emptyRun } from "../scripts/playthrough/timeline.js";
import type { RunRecord } from "../scripts/playthrough/timeline.js";

// SAVE-1's library logic on small, real saves. The exhaustive generation (every
// kind earned by the bot, its facts and reloads) is `npm run playthrough -- --export`.

/** A linear root history a → b → c → head, plus x on another branch. */
const SHAS = Object.fromEntries(["a", "b", "c", "head", "x"].map((k, i) => [k, String(i + 1).repeat(40)])) as Record<string, string>;
const ORDER = ["a", "b", "c", "head"].map((k) => SHAS[k]!);
const git: GitPort = {
  resolve: (ref) => { const sha = SHAS[ref] ?? (Object.values(SHAS).includes(ref) ? ref : null); if (!sha) throw new Error(`bad ref ${ref}`); return sha; },
  isAncestor: (a, b) => ORDER.includes(a) && ORDER.includes(b) && ORDER.indexOf(a) <= ORDER.indexOf(b),
  distance: (a, b) => ORDER.indexOf(b) - ORDER.indexOf(a),
};

/** In-process decoding: these tests' saves come from this build. */
const decode = (dir: string): string[] => verifyCommitDir(dir, true);
const saveText = (s: GameState): string => {
  const e = encodeSave(createEnvelope(s, { sessionId: "library-test", createdAt: "2026-10-23T00:00:00.000Z", savedAt: "2026-10-23T00:00:00.000Z" }));
  assert.ok(e.ok, e.ok ? "" : e.error);
  return e.value;
};
/** One run whose own saves are the given texts, labelled as milestones. */
function runWith(scenario: string, saves: [string, string][]): RunRecord {
  const run = emptyRun(scenario, "creel");
  for (const [label, text] of saves) {
    const state = JSON.parse(text).state as GameState;
    run.saves.push({ phase: label, label, tick: state.tick, bytes: text.length, hash: stateHash(state), equal: true, commands: 7, journalBytes: text.length + 80 });
  }
  return run;
}
function library(): { root: string; text: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "siltwake-library-test-"));
  const text = saveText(createGame());
  for (const commit of [SHAS.a!, SHAS.b!, SHAS.x!]) {
    const run = runWith("creel", [["opening", text]]);
    const { manifest, problems } = buildManifest(commit, [run], [{ scenario: "creel", label: "opening", text }], () => null);
    // Only the creel scenario was played; the kinds it sources must all be there, and only pod-start is.
    assert.ok(problems.every((p) => /was not produced/.test(p)), problems.join("; "));
    const staging = stagingDir(root, commit);
    fs.writeFileSync(path.join(staging, "creel@opening.json"), text);
    assert.equal(publish(root, staging, manifest, decode), "published");
  }
  return { root, text };
}

test("a library save is picked from the nearest ancestor commit, with its provenance and loads strictly", () => {
  const { root } = library();
  const p = pickSave("pod-start", { root, commit: "head", git });
  assert.equal(p.manifest.commit, SHAS.b);
  assert.equal(p.compatibility, "same-version");
  assert.equal(p.distance, 2);
  assert.equal(p.migrated, false);
  assert.deepEqual(p.entry.kinds, ["pod-start", "creel@opening"]);
  assert.equal(p.entry.commands, 7);
  assert.equal(p.entry.scenario, "creel");
  assert.equal(stateHash(p.state), p.entry.hash);
  assert.equal(p.manifest.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(p.manifest.contentVersion, CONTENT_VERSION);
  // The other branch's export is passed over, by name.
  assert.ok(p.passed.some((r) => r.commit === SHAS.x && /history/.test(r.reason)));
  // At its own commit it is the same commit; the scenario@label kind names the same file.
  const own = pickSave("creel@opening", { root, commit: "b", git });
  assert.equal(own.compatibility, "same-commit");
  assert.equal(own.path, p.path);
});

test("incompatible, missing, exact-only and damaged requests are refused loudly, never answered by another save", () => {
  const { root } = library();
  const refused = (f: () => unknown, re: RegExp): void => assert.throws(f, (e) => e instanceof LibraryRefusal && re.test(e.message));
  refused(() => pickSave("no-such-kind", { root, commit: "head", git }), /No save of kind "no-such-kind".*Known kinds: .*pod-start/s);
  refused(() => pickSave("pod-start", { root, commit: "head", exact: true, git }), /compatible with 4444.*not the exact commit/s);
  // Nothing at or before a: an export from a later commit never serves an earlier one.
  refused(() => pickSave("pod-start", { root, commit: SHAS.a!.replace(/1/g, "9"), git: { ...git, resolve: (r) => r } }), /No library save of kind "pod-start" is compatible/);
  // A newer schema at the nearest commit is refused with its versions.
  const bDir = path.join(root, SHAS.b!), m = JSON.parse(fs.readFileSync(path.join(bDir, "manifest.json"), "utf8")) as Manifest;
  fs.chmodSync(bDir, 0o755);
  fs.chmodSync(path.join(bDir, "manifest.json"), 0o644);
  fs.writeFileSync(path.join(bDir, "manifest.json"), JSON.stringify({ ...m, schemaVersion: SAVE_SCHEMA_VERSION + 1 }));
  const p = pickSave("pod-start", { root, commit: "head", git });
  assert.equal(p.manifest.commit, SHAS.a, "the schema-7 export is skipped");
  assert.ok(p.passed.some((r) => r.commit === SHAS.b && new RegExp(`schema ${SAVE_SCHEMA_VERSION + 1}`).test(r.reason)));
  // A damaged file at the nearest compatible commit is refused outright: the older a is not tried.
  fs.writeFileSync(path.join(bDir, "manifest.json"), JSON.stringify(m));
  const file = path.join(bDir, "creel@opening.json");
  fs.chmodSync(file, 0o644);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('"tick": 0', '"tick": 1'));
  refused(() => pickSave("pod-start", { root, commit: "head", git }), /does not match its manifest/);
  assert.ok(verifyCommitDir(bDir, false).some((x) => /SHA-256 differs/.test(x)));
  // An import of a damaged directory is refused, and a clean one lands read-only.
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "siltwake-library-import-"));
  assert.throws(() => importCommitDir(bDir, other, decode), /does not verify/);
  assert.equal(importCommitDir(path.join(root, SHAS.a!), other, decode).status, "published");
  assert.equal(fs.statSync(path.join(other, SHAS.a!, "creel@opening.json")).mode & 0o222, 0);
  assert.equal(readLibrary(other).manifests.length, 1);
});

test("a commit's library is immutable: an identical re-export is recognised, a different one refused", () => {
  const { root, text } = library();
  const run = runWith("creel", [["opening", text]]);
  const again = (t: string) => {
    const { manifest } = buildManifest(SHAS.a!, [run], [{ scenario: "creel", label: "opening", text: t }], () => null);
    const staging = stagingDir(root, SHAS.a!);
    fs.writeFileSync(path.join(staging, "creel@opening.json"), t);
    return publish(root, staging, manifest, decode);
  };
  assert.equal(again(text), "identical");
  assert.throws(() => again(text.replace('"tick": 0', '"tick": 0 ')), /already holds a different export/);
});

test("the export refuses a save that does not reload to its hash or a kind without its facts", () => {
  const text = saveText(createGame());
  const run = runWith("low-air", [["low-air", text]]);
  const { problems } = buildManifest(SHAS.head!, [run], [{ scenario: "low-air", label: "low-air", text }], () => "creel@reef");
  // New Game at the pod is not low on air: the kind is refused on its facts.
  assert.ok(problems.some((p) => /low-air is not what it claims: oxygen 100\.0% is above 20%/.test(p)), problems.join("; "));
  run.saves[0]!.hash = "0".repeat(16);
  assert.ok(buildManifest(SHAS.head!, [run], [{ scenario: "low-air", label: "low-air", text }], () => null).problems.some((p) => /reloads to/.test(p)));
});

test("every adverse, gear and tour kind rejects a healthy New Game, and accepts the state it describes", () => {
  const healthy = createGame();
  for (const k of KINDS.filter((k) => k.facts)) assert.ok(k.facts!(healthy).length > 0, `${k.kind} accepted New Game`);
  const facts = (kind: string, s: GameState): string[] => KINDS.find((k) => k.kind === kind)!.facts!(s);
  // Low air: swimming at the reef ridge at 15%.
  const low = createGame();
  low.player.mode = "swimming";
  low.player.pose.position = { x: -40, y: -12, z: 30 };
  low.player.vitals.oxygen = 15;
  assert.deepEqual(facts("low-air", low), []);
  // A piloted craft: damaged but running, then empty of charge on its emergency air.
  const flying = createGame();
  const v = makeVehicle("veh_test", "creel", { x: 120, y: -200, z: -300 }, "veh_test_hold");
  flying.fleet.vehicles.push(v);
  flying.player.controlledVehicleId = v.id;
  flying.player.mode = "piloting";
  flying.player.pose.position = { ...v.pose.position };
  v.health = 40;
  assert.deepEqual(facts("hull-damaged", flying), []);
  v.health = 100; v.charge = 0; v.emergencyAir = 90;
  assert.deepEqual(facts("battery-depleted", flying), []);
  v.disabled = true;
  assert.ok(facts("battery-depleted", flying).some((p) => /disabled/.test(p)));
  // Lost: disabled at depth, the diver swimming free of it.
  flying.player.controlledVehicleId = null;
  flying.player.mode = "swimming";
  flying.player.pose.position = { x: 120, y: -0.6, z: -300 };
  assert.deepEqual(facts("craft-lost", flying), []);
  assert.deepEqual(kindsOf("tour", "depleted"), ["battery-depleted", "tour@depleted"]);
});

test("captures save mid-phase through a fresh slot, reload to the identical hash, and count the commands that earned them", async () => {
  const d = new Driver("capture-test", "creel");
  const slot = new SaveSlot("capture-test");
  for (let i = 0; i < 4; i++) d.command({ type: "interact" });
  let taken = false;
  d.watchers.push((x) => { if (!taken && x.state.tick >= 30) { taken = true; slot.capture(x, "half-second"); } });
  d.idle(1);
  assert.equal(d.commands, 4);
  await slot.flushCaptures(d);
  const record = d.run.saves.find((r) => r.label === "half-second")!;
  assert.equal(record.capture, true);
  assert.equal(record.tick, 30);
  assert.equal(record.commands, 4);
  assert.ok(record.equal && record.journalBytes > record.bytes);
  assert.ok(d.state.tick > 30, "play went on from the live state");
  assert.equal(stateHash(JSON.parse(slot.snapshots.get("half-second")!).state), record.hash);
});

test("a branch that cannot get its parent's save from the library is blocked with the library's reason", async () => {
  const [run] = await playScenarios(["carrier"], false, {
    fromLibrary: () => { throw new LibraryRefusal("No library save of kind \"creel@refits\" is compatible with 4444.", []); },
  });
  assert.equal(run!.outcome, "blocked");
  assert.ok(run!.checks.some((c) => !c.ok && /from the save library/.test(c.name) && /compatible with 4444/.test(c.detail)));
  assert.equal(run!.phases.length, 0, "nothing was replayed");
});

/** One more commit directory, from any save text, with the manifest's hash as given. */
function addCommit(root: string, commit: string, text: string, hash?: string): void {
  const { manifest } = buildManifest(commit, [runWith("creel", [["opening", text]])], [{ scenario: "creel", label: "opening", text }], () => null);
  if (hash) manifest.saves[0]!.hash = hash;
  const staging = stagingDir(root, commit);
  fs.writeFileSync(path.join(staging, "creel@opening.json"), text);
  publish(root, staging, manifest, () => []);
}
const emptyRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "siltwake-library-test-"));

test("R3: a recorded hash is checked against the saved state before any migration; real decoder changes still count as migrations", () => {
  const root = emptyRoot(), text = saveText(createGame());
  addCommit(root, SHAS.b!, text, "0".repeat(16));
  // The decoder changes nothing here: the mismatch is damaged metadata, refused even for the same commit.
  assert.throws(() => pickSave("pod-start", { root, commit: "b", git }), (e) => e instanceof LibraryRefusal && /not its recorded 0000000000000000/.test(e.message));
  assert.ok(verifyCommitDir(path.join(root, SHAS.b!), false).some((p) => /not its recorded/.test(p)), "caught without decoding too");
  // A save from a build before CR-1's fish traps: this build adds them on load, a genuine additive migration.
  const old = JSON.parse(text) as { state: GameState };
  delete (old.state.systems as Partial<GameState["systems"]>).traps;
  const root2 = emptyRoot(), oldText = JSON.stringify(old, null, 2);
  addCommit(root2, SHAS.a!, oldText, stateHash(old.state));
  const p = pickSave("pod-start", { root: root2, commit: "head", git });
  assert.equal(p.migrated, true);
  assert.ok(Array.isArray(p.state.systems.traps));
  assert.throws(() => pickSave("pod-start", { root: root2, commit: "a", exact: true, git }), /needs migration/);
});

test("R5: an unreadable nearest save is a refusal naming every candidate, and says why older compatible ones were not used", () => {
  const root = emptyRoot(), text = saveText(createGame());
  for (const c of ["a", "b", "x"]) addCommit(root, SHAS[c]!, text);
  const bDir = path.join(root, SHAS.b!);
  fs.chmodSync(bDir, 0o755);
  fs.rmSync(path.join(bDir, "creel@opening.json"));
  assert.throws(() => pickSave("pod-start", { root, commit: "head", git }), (e) => {
    assert.ok(e instanceof LibraryRefusal);
    assert.match(e.message, /cannot be read: ENOENT/);
    assert.ok(e.rejected.some((r) => r.commit === SHAS.a && /compatible .* but not tried/.test(r.reason)), "the older compatible one is named");
    assert.ok(e.rejected.some((r) => r.commit === SHAS.x && /history/.test(r.reason)), "other candidates keep their reasons");
    return true;
  });
});

test("R2: an import is decoded in staging before it is public; a failed decode leaves no directory, index entry or staging", () => {
  const src = emptyRoot(), root = emptyRoot(), text = saveText(createGame());
  addCommit(src, SHAS.a!, text);
  addCommit(root, SHAS.b!, text);
  const seen: string[] = [];
  assert.throws(() => importCommitDir(path.join(src, SHAS.a!), root, (dir) => { seen.push(dir); return ["not JSON"]; }), /does not decode/);
  assert.ok(seen.length === 1 && path.basename(seen[0]!).startsWith(".staging-") && path.dirname(seen[0]!) === root, "decoded while hidden in staging");
  assert.equal(fs.existsSync(path.join(root, SHAS.a!)), false);
  assert.deepEqual(fs.readdirSync(root).filter((f) => f.startsWith(".")), []);
  const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8")) as { commits: { commit: string }[] };
  assert.deepEqual(index.commits.map((c) => c.commit), [SHAS.b]);
  // An existing directory must itself verify before an identical import is accepted.
  assert.throws(() => importCommitDir(path.join(src, SHAS.a!), src, (dir) => path.basename(dir).startsWith(".staging-") ? [] : ["damaged"]), /already exists and does not verify/);
  assert.equal(importCommitDir(path.join(src, SHAS.a!), root, decode).status, "published");
  assert.equal(importCommitDir(path.join(src, SHAS.a!), root, decode).status, "identical");
});
