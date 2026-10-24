/** SIM-1b: the play-timeline journal's model-based fault harness, thousands of
 * seeded sequences, and the harness's own check: each known defect (the R1 and
 * R2 review mutants) is caught by the fast tier's scripts and seeds. Replay one
 * sequence with SILTWAKE_TIMELINE_SEED=<seed> on the fast file. */
import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { MODEL_STEPS, runModel } from "./timeline-model-support.js";
import type * as Support from "./timeline-model-support.js";

const COUNT = Number(process.env.SILTWAKE_TIMELINE_SEQUENCES ?? 2000);
/** Another seed range, for exploratory runs. */
const BASE = Number(process.env.SILTWAKE_TIMELINE_SEED_BASE ?? 1_000_003);

test(`the timeline journal keeps its invariants over ${COUNT} seeded fault sequences`, async () => {
  const failures: string[] = [];
  for (let i = 0; i < COUNT && failures.length < 5; i++) {
    const r = await runModel(BASE + i * 104_729, MODEL_STEPS);
    if (!r.ok) failures.push(`${r.name}: ${r.failure}\n${r.log.slice(-25).join("\n")}`);
  }
  assert.deepEqual(failures, []);
});

// ---- Mutants: each patches the real sources by text anchor (a missing anchor fails loudly).
type Sources = { store: string; report: string };
const replace = (s: string, a: string, b: string): string => { if (!s.includes(a)) throw new Error(`missing mutation anchor: ${a}`); return s.replace(a, b); };
const removeBetween = (s: string, a: string, b: string): string => {
  const i = s.indexOf(a), j = s.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error(`missing mutation block: ${a}`);
  return s.slice(0, i) + s.slice(j);
};
const MUTANTS: Record<string, (x: Sources) => Sources> = {
  // A protected read writes (and catches a refusal).
  load_mutates: ({ store, report }) => ({ report, store: replace(store, "private protect(reason: string): TimelineLoad {",
    'private protect(reason: string): TimelineLoad { try { this.storage?.setItem("review.unrelated.setting", "overwritten during a protected read"); } catch {}') }),
  // A protected read rewrites the journal's own bytes: no byte changes, one mutating call.
  load_rewrites_same_bytes: ({ store, report }) => ({ report, store: replace(store, "private protect(reason: string): TimelineLoad {",
    "private protect(reason: string): TimelineLoad { try { const v = this.storage?.getItem(TIMELINE_JOURNAL_KEY); if (v) this.storage?.setItem(TIMELINE_JOURNAL_KEY, v); } catch {}") }),
  // R1-F1: repair reuses its recorder's numbers, and cleanup collects against the proposed state.
  F1: ({ store, report }) => {
    let s = replace(store, "renumber(rec, keys, chunkKey(this.session, 0).slice(0, -1), named);", "/* R1: repair reuses its recorder numbers. */");
    s = removeBetween(s, "      const live = liveKeys(committed);", "      written.clear();");
    return { report, store: replace(s, "      written.clear();", "      this.collect(committed ?? base, [...written]);\n      written.clear();") };
  },
  // R1-F2: unsafe version coercion, no totality or depth wrappers.
  F2_version: ({ store, report }) => {
    let r = replace(report, 'try { return validate(v); } catch { return { ok: false, error: "Malformed timeline." }; }', "return validate(v);");
    r = replace(r, '  if (tooDeep(v)) return { ok: false, error: "Nested too deeply." };', "");
    r = replace(r, '`Unsupported timeline version${typeof v.version === "number" ? ` ${v.version}` : ""}.`', "`Unsupported timeline version ${String(v.version)}.`");
    return { report: r, store: replace(store, 'try { return this.loadWhole(options); } catch { return this.protect("the stored timeline is malformed"); }', "return this.loadWhole(options);") };
  },
  // R1-F2: finite-only counters, no restored-partition validation.
  F2_counters: ({ store, report }) => {
    let s = replace(store, "const safe = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;", 'const safe = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);');
    s = replace(s, "function partitionProblem(rec: TimelineRecorder): string | null {", "function partitionProblem(rec: TimelineRecorder): string | null { return null; /* R1 */");
    return { report, store: s };
  },
  // R1-F3: a shallow `kept` discriminator bypasses the fold validator, treating the chunk as folded, or overwriting it.
  ...Object.fromEntries((["summary", "events"] as const).map((kind) => [`F3_${kind}`, ({ store, report }: Sources): Sources => ({ report, store: replace(store,
    "      const c = this.chunk(this.session, r.n!);", `      const rawFold = this.read(chunkKey(this.session, r.n!));
      let c: Chunk | string;
      try {
        const v = rawFold.kind === "present" ? JSON.parse(rawFold.value) : null;
        c = v && Array.isArray(v.kept) ? ${kind === "summary" ? "{ kind: \"summary\", summary: v }" : "{ kind: \"events\", events: [] }"} : this.chunk(this.session, r.n!);
      } catch { c = this.chunk(this.session, r.n!); }`) })])),
  // R1-F4: folds precede the journal, and later quota fold targets are validated lazily.
  F4: ({ store, report }) => {
    const a = store.indexOf("    for (const r of rec.rotated) {", store.indexOf("const stored =")), b = store.indexOf("    // Another expedition", a);
    if (a < 0 || b < 0) throw new Error("missing mutation block: the fold check");
    const checkBlock = store.slice(a, b);
    let s = store.slice(0, a) + store.slice(b);
    s = replace(s, "    for (;;) {\n      try {", `    for (;;) {\n${checkBlock}      try {`);
    s = replace(s, "if (quotaMode) for (const r of folds())", "if (true) for (const r of folds())");
    return { report, store: removeBetween(s, "        for (const n of own?.chunks ?? []) {", "        if (rec.rotated.some(") };
  },
  // R1 (seed 66769815): repair staging avoids existing keys but not the absent ones the old journal names.
  seed66769815: ({ store, report }) => ({ report, store: replace(store, "renumber(rec, keys, chunkKey(this.session, 0).slice(0, -1), named);",
    "renumber(rec, keys, chunkKey(this.session, 0).slice(0, -1), []);") }),
  // A repair claims success without writing anything.
  oracle_saved_protected: ({ store, report }) => ({ report, store: replace(store, "    const storage = this.storage!;",
    "    const storage = this.storage!;\n    if (replacing) return { ok: true, seq: rec.seq, rotated: false, dropped: [] };") }),
  // R2-F1: known optional event fields and stretch members unchecked again.
  R2_F1_fields: ({ store, report }) => {
    let r = replace(report, "&& r.travel.long.every(travelStretch)", "");
    r = replace(r, "&& r.idle.long.every(idleStretch)", "");
    r = replace(r, "opt(e.what, str) && opt(e.id, str) && opt(e.label, str) && opt(e.quantity, num) && regionOk(e.region) &&", "");
    return { store, report: r };
  },
};

test("the fast tier's regression scripts and seeds catch every known defect, and pass the unchanged sources", async (t) => {
  const root = fileURLToPath(new URL("../../", import.meta.url)), build = fileURLToPath(new URL("../", import.meta.url));
  const sources: Sources = { store: readFileSync(join(root, "src/sim/timeline/store.ts"), "utf8"), report: readFileSync(join(root, "src/sim/timeline/report.ts"), "utf8") };
  const work = mkdtempSync(join(tmpdir(), "siltwake-timeline-mutants-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const rows: string[] = [];
  for (const [name, mutate] of [["unchanged", (x: Sources) => x] as const, ...Object.entries(MUTANTS)]) {
    const dir = join(work, name), patched = mutate(sources);
    cpSync(join(build, "src"), join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    cpSync(join(build, "tests/timeline-model-support.js"), join(dir, "tests/timeline-model-support.js"));
    writeFileSync(join(dir, "package.json"), '{"type":"module"}');
    for (const [file, text] of [["store", patched.store], ["report", patched.report]] as const)
      writeFileSync(join(dir, `src/sim/timeline/${file}.js`), ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
    const support = await import(pathToFileURL(join(dir, "tests/timeline-model-support.js")).href) as typeof Support;
    let caught: string | null = null;
    const run = async (r: Promise<Support.ModelResult>): Promise<Support.ModelResult> => {
      try { return await r; } catch (error) { return { ok: false, name: "?", steps: 0, failure: `threw ${String(error)}`, log: [] }; }
    };
    for (const script of support.REGRESSIONS) {
      const r = await run(support.runScript(script));
      if (!r.ok) { caught = `${r.name}: ${r.failure?.split("\n")[0]}`; break; }
    }
    if (caught === null || name === "unchanged") for (const seed of support.FAST_SEEDS) {
      const r = await run(support.runModel(seed, MODEL_STEPS));
      if (!r.ok) { caught ??= `${r.name}: ${r.failure?.split("\n")[0]}`; break; }
    }
    rows.push(`${name}: ${caught ?? "not caught"}`);
  }
  t.diagnostic(rows.join("\n"));
  assert.equal(rows[0], "unchanged: not caught", "the unchanged sources pass");
  for (const row of rows.slice(1)) assert.doesNotMatch(row, /: not caught$/, row);
});
