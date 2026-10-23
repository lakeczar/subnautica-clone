import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// The architecture guard (scripts/guard-architecture.mjs, STEW-1): the real repository
// passes; a copy of it with one of every violation planted fails on each; small synthetic
// stores pin the contracts (lazy imports, every source extension, the cycle ratchet, the
// delegation shape); and tsconfig.headless.json keeps the DOM out of sim and content.
interface Allow { cycles: string[][]; drivers: string[]; recipeBuilders: string[]; regionLookups: string[] }
interface Guard {
  ALLOW: Allow;
  analyse(files: Map<string, string>, allow?: Allow): { failures: string[]; report: { groups: string[][]; forks: { id: string }[]; forkIds: string[] } };
  repositoryFiles(root?: string): Map<string, string>;
}
/** Planted sources spell their imports through these, so the fast tier's static import scan doesn't read them as this file's. */
const from = (spec: string): string => `fr` + `om "${spec}"`;
const lazy = (spec: string): string => `imp` + `ort("${spec}")`;
const G = await import(pathToFileURL(resolve("scripts/guard-architecture.mjs")).href) as Guard;
const files = G.repositoryFiles();
const none: Allow = { cycles: [], drivers: [], recipeBuilders: [], regionLookups: [] };
const failuresOf = (store: Record<string, string>, allow: Allow = none): string[] => G.analyse(new Map(Object.entries(store)), allow).failures;

test("the repository passes: every cycle is exactly an allowance, and every registered fork has a marker", () => {
  const { failures, report } = G.analyse(files);
  assert.deepEqual(failures, []);
  // The ratchet's contract, not a historical count: allowances and cycles are the same sets.
  const key = (g: readonly string[]): string => [...g].sort().join(" ");
  assert.deepEqual(report.groups.map(key).sort(), G.ALLOW.cycles.map(key).sort());
  const register = fs.readFileSync("docs/build/CORE-HELPERS.md", "utf8").split("## Open forks")[1]!;
  const ids = [...register.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]!).sort();
  assert.deepEqual(report.forkIds, ids, "each register row has a FORK marker, and each marker a row");
});

test("every planted violation in a copy of the repository fails, and the near misses beside them pass", () => {
  const planted = new Map(files);
  const add = (path: string, text: string): void => { planted.set(path, text); };
  add("src/sim/stewPlantUp.ts", `import { RESIDENT_REGION_LIMIT } ${from("../render/regions.js")};\nimport type { RegionArt } ${from("../render/regions.js")};\nexport const up = RESIDENT_REGION_LIMIT;\nexport type A = RegionArt;\n`);
  add("src/sim/stewPlantTypeOnly.ts", `import type { RegionArt } ${from("../render/regions.js")};\nexport type B = RegionArt;\n`);
  add("src/render/stewPlantA.ts", `import { b } ${from("./stewPlantB.js")};\nexport const a = (): number => b() + 1;\n`);
  add("src/render/stewPlantB.ts", `import { a } ${from("./stewPlantA.js")};\nexport const b = (): number => 1;\nexport const c = (): number => a();\n`);
  add("src/sim/stewPlantMember.ts", `import { completeOpening } ${from("./progression.js")};\nexport const member = completeOpening;\n`);
  planted.set("src/sim/progression.ts", `import { member } ${from("./stewPlantMember.js")};\nvoid member;\n${files.get("src/sim/progression.ts")}`);
  add("docs/build/streams/stew-plant/play.mjs", `import { chromium } ${from("playwright-core")};\nconst b = await chromium.launch({ headless: true });\n`);
  add("docs/build/streams/stew-plant/serve.mjs", `import { createServer } ${from("node:http")};\ncreateServer(() => {}).listen(0);\n`);
  add("tools/stew-plant.mjs", `const pw = require("/work/tmp/gpu-prep/pw/");\n`);
  add("scripts/rec/stew-plant.mjs", `import { chromium } ${from("playwright-core")};\nawait chromium.launch();\n`);
  add("src/render/stewPlantRecipe.ts", `export class RecipeBuilder {}\n`);
  add("src/render/stewPlantRegion.ts", `import type { RegionId } ${from("../content/registry.js")};\nexport function regionOf(x: number): RegionId | null { return x > 0 ? "silt_basin" : null; }\n` +
    `import { regionAtPoint } ${from("../content/regions/layout.js")};\nexport const hudRegionAt = (x: number, z: number) => regionAtPoint(x, z);\n`);
  const { failures } = G.analyse(planted);
  const expect = (re: RegExp, what: string): void => assert.ok(failures.some((f) => re.test(f)), `${what}:\n${failures.join("\n")}`);
  expect(/layering: src\/sim\/stewPlantUp\.ts imports src\/render\/regions\.ts/, "a value import up from sim");
  expect(/cycle: a new value-import cycle: src\/render\/stewPlantA\.ts → src\/render\/stewPlantB\.ts/, "a new cycle");
  expect(/cycle: new members join an allowlisted import cycle: src\/sim\/stewPlantMember\.ts/, "a new cycle member");
  expect(/driver: docs\/build\/streams\/stew-plant\/play\.mjs has chromium\.launch/, "chromium.launch in a stream driver");
  expect(/driver: docs\/build\/streams\/stew-plant\/serve\.mjs has createServer/, "createServer in a stream driver");
  expect(/driver: tools\/stew-plant\.mjs has gpu-prep/, "a gpu-prep require");
  expect(/builder: src\/render\/stewPlantRecipe\.ts exports another class RecipeBuilder/, "a third RecipeBuilder");
  expect(/region: src\/render\/stewPlantRegion\.ts declares a region lookup regionOf/, "a region lookup outside layout.ts");
  for (const fine of [/stewPlantTypeOnly/, /scripts\/rec\/stew-plant/, /hudRegionAt/])
    assert.ok(!failures.some((f) => fine.test(f)), `${fine} must pass:\n${failures.join("\n")}`);
  assert.equal(failures.length, 8, failures.join("\n"));
});

test("layering sees lazy imports, require, import = require and every source extension; a computed load is refused; types stay exempt", () => {
  const store = {
    "src/render/art.ts": "export const art = 1;\n",
    "src/sim/lazy.ts": `export const later = () => ${lazy("../render/art.js")};\n`,
    "src/sim/required.ts": `export const later = () => require("../ui/hud.js");\n`,
    "src/content/equals.ts": `import art = require("../audio/director.js");\nexport const x = art;\n`,
    "src/sim/module.mts": `import { art } ${from("../render/art.js")};\nexport const y = art;\n`,
    "src/sim/common.cts": `import { art } ${from("../render/art.js")};\nexport const z = art;\n`,
    "src/sim/computed.ts": `const where = "../render/art.js";\nexport const later = () => ${"imp" + "ort"}(where);\n`,
    "src/sim/babylon.ts": `export const engine = () => ${lazy("@babylonjs/core")};\n`,
    "src/sim/typeOnly.ts": `export type Art = typeof ${lazy("../render/art.js")};\nimport type { art } ${from("../render/art.js")};\nexport type T = typeof art;\n`,
    "src/render/up.ts": `export const sim = () => ${lazy("../sim/lazy.js")};\n`,
  };
  const failures = failuresOf(store);
  for (const [file, target] of [["src/sim/lazy.ts", "src/render/art.ts"], ["src/sim/required.ts", "src/ui/hud.js"], ["src/content/equals.ts", "src/audio/director.js"],
    ["src/sim/module.mts", "src/render/art.ts"], ["src/sim/common.cts", "src/render/art.ts"], ["src/sim/babylon.ts", "@babylonjs/core"]] as [string, string][])
    assert.ok(failures.some((f) => f.startsWith(`layering: ${file} `) && f.includes(target)), `${file} → ${target}:\n${failures.join("\n")}`);
  assert.ok(failures.some((f) => /layering: src\/sim\/computed\.ts loads a computed module/.test(f)));
  assert.ok(!failures.some((f) => /typeOnly|src\/render\/up/.test(f)), failures.join("\n"));
  assert.equal(failures.length, 7, failures.join("\n"));
});

test("the cycle ratchet: a shrunk or retired cycle fails until its allowance shrinks with it, and then it can't regrow", () => {
  const ring = (names: string[]): Record<string, string> => Object.fromEntries(names.map((n, i) =>
    [`src/sim/${n}.ts`, `import { v as next } ${from(`./${names[(i + 1) % names.length]}.js`)};\nexport const v = () => next;\n`]));
  const three = ["a", "b", "c"].map((n) => `src/sim/${n}.ts`), two = three.slice(0, 2);
  // As allowed: passes.
  assert.deepEqual(failuresOf(ring(["a", "b", "c"]), { ...none, cycles: [three] }), []);
  // c leaves the cycle, the allowance still names it: fails, naming the allowance to set.
  const shrunk = { ...ring(["a", "b"]), "src/sim/c.ts": "export const v = 1;\n" };
  const f1 = failuresOf(shrunk, { ...none, cycles: [three] });
  assert.ok(f1.length === 1 && /shrank or split \(src\/sim\/c\.ts left it\): set ALLOW\.cycles to \[src\/sim\/a\.ts, src\/sim\/b\.ts\]/.test(f1[0]!), f1.join("\n"));
  // With the allowance lowered it passes, and c rejoining is a new member.
  assert.deepEqual(failuresOf(shrunk, { ...none, cycles: [two] }), []);
  assert.ok(failuresOf(ring(["a", "b", "c"]), { ...none, cycles: [two] }).some((f) => /new members join an allowlisted import cycle: src\/sim\/c\.ts/.test(f)));
  // The whole cycle gone: fails until its allowance goes, after which a recreated cycle is new.
  const acyclic = Object.fromEntries(three.map((f) => [f, "export const v = 1;\n"]));
  assert.ok(failuresOf(acyclic, { ...none, cycles: [three] }).some((f) => /allowlisted cycle src\/sim\/a\.ts → .* is gone: remove it/.test(f)));
  assert.deepEqual(failuresOf(acyclic), []);
  assert.ok(failuresOf(ring(["a", "b"])).some((f) => /a new value-import cycle: src\/sim\/a\.ts → src\/sim\/b\.ts/.test(f)));
  // A driver allowance that lost its plumbing is the same ratchet.
  assert.ok(failuresOf({ "tools/old.mjs": "export {};\n" }, { ...none, drivers: ["tools/old.mjs"] }).some((f) => /no longer has driver plumbing/.test(f)));
});

test("a region lookup is exempt only when its whole body calls the owner's lookup, not when it merely mentions it", () => {
  const failures = failuresOf({
    "src/render/a.ts": `import { regionAtPoint } ${from("../content/regions/layout.js")};\nexport const regionAt = (x: number, z: number) => regionAtPoint(x, z);\n` +
      `export function regionFor(x: number, z: number) { return regionAtPoint(x, z); }\n`,
    "src/render/b.ts": `// not regionAtPoint, really\nexport const regionOf = (x: number) => (x > 0 ? "silt_basin" : null);\n`,
    "src/render/c.ts": `import { regionAtPoint } ${from("../content/regions/layout.js")};\nexport const guessRegionAt = (x: number, z: number) => regionAtPoint(x, z) ?? (x > 0 ? "silt_basin" : null);\n`,
  });
  assert.deepEqual(failures.map((f) => f.match(/^region: (\S+) declares a region lookup (\w+)/)?.slice(1).join("#")).sort(), ["src/render/b.ts#regionOf", "src/render/c.ts#guessRegionAt"]);
});

test("tsconfig.headless.json: a DOM global in sim or content fails to typecheck; a parameter or an import named window does not", () => {
  const config = ts.readConfigFile("tsconfig.headless.json", ts.sys.readFile).config as { compilerOptions: Record<string, unknown> };
  const base = ts.readConfigFile("tsconfig.json", ts.sys.readFile).config as { compilerOptions: Record<string, unknown> };
  const options = ts.convertCompilerOptionsFromJson({ ...base.compilerOptions, ...config.compilerOptions }, ".").options;
  assert.deepEqual(options.lib, ["lib.es2022.d.ts"], "no DOM library");
  // Real files in a scratch directory, compiled with the headless options.
  const dir = fs.mkdtempSync(join(tmpdir(), "siltwake-headless-"));
  const sources: Record<string, string> = {
    "platform.d.ts": fs.readFileSync("scripts/headless-platform.d.ts", "utf8"),
    "provider.ts": "export const value = 3;\n",
    "dom.ts": "export const width = (): number => window.innerWidth;\nexport const store = (): unknown => localStorage;\n",
    "param.ts": "export const fine = (window: number): number => window + performance.now();\nexport const copy = <T>(x: T): T => structuredClone(x);\n",
    "alias.ts": `import { value as window } ${from("./provider.js")};\nexport const x: number = window;\nexport const here = import.meta.url;\n`,
  };
  for (const [name, text] of Object.entries(sources)) fs.writeFileSync(join(dir, name), text);
  const program = ts.createProgram(Object.keys(sources).map((n) => join(dir, n)), { ...options, noEmit: true, types: [], skipLibCheck: true });
  const errors = ts.getPreEmitDiagnostics(program).filter((d) => d.file)
    .map((d) => `/v/${basename(d.file!.fileName)}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(errors.some((e) => e.startsWith("/v/dom.ts") && /'window'/.test(e)), errors.join("\n"));
  assert.ok(errors.some((e) => e.startsWith("/v/dom.ts") && /'localStorage'/.test(e)), errors.join("\n"));
  assert.deepEqual(errors.filter((e) => !e.startsWith("/v/dom.ts")), [], "the parameter, the alias and the declared platform APIs typecheck");
});

/** A scratch repository on disk, so collection itself is under test. */
function scratchRepo(store: Record<string, string>): string {
  const dir = fs.mkdtempSync(join(tmpdir(), "siltwake-guard-disk-"));
  for (const [rel, text] of Object.entries(store)) { fs.mkdirSync(join(dir, rel, ".."), { recursive: true }); fs.writeFileSync(join(dir, rel), text); }
  return dir;
}

test("collection on disk takes every TypeScript source extension, and each is analysed", () => {
  const dir = scratchRepo({
    "src/render/art.ts": "export const art = 1;\nexport class RecipeBuilder {}\n",
    "src/sim/module.mts": `import { art } ${from("../render/art.js")};\nexport const a = art;\n`,
    "src/content/common.cts": `export const later = () => ${lazy("../render/art.js")};\n`,
    "src/content/view.tsx": `export const later = () => ${lazy("../render/art.js")};\n`,
    "src/render/builder.tsx": "export class RecipeBuilder {}\n",
    "src/sim/types.d.mts": `import { art } ${from("../render/art.js")};\n`,
  });
  try {
    const collected = G.repositoryFiles(dir);
    for (const f of ["src/sim/module.mts", "src/content/common.cts", "src/content/view.tsx", "src/render/builder.tsx"]) assert.ok(collected.has(f), f);
    assert.ok(!collected.has("src/sim/types.d.mts"), "declaration files are not sources");
    const { failures } = G.analyse(collected, { ...none, recipeBuilders: ["src/render/art.ts"] });
    for (const re of [/layering: src\/sim\/module\.mts imports/, /layering: src\/content\/common\.cts lazily imports/, /layering: src\/content\/view\.tsx lazily imports/,
      /builder: src\/render\/builder\.tsx exports another class RecipeBuilder/])
      assert.ok(failures.some((f) => re.test(f)), `${re}:\n${failures.join("\n")}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a barrel outside sim and content can't launder a render or Babylon value; a type-only path stays exempt", () => {
  const failures = failuresOf({
    "src/render/regions.ts": "export const LIMIT = 4;\nexport interface Art { id: string }\n",
    "src/world/barrel/index.ts": `export { LIMIT } ${from("../../render/regions.js")};\n`,
    "src/world/babylon/index.ts": `export { Color3 as LIMIT } ${from("@babylonjs/core/Maths/math.color.js")};\n`,
    "src/world/deep/a.ts": `export * ${from("./b.js")};\n`,
    "src/world/deep/b.ts": `import { LIMIT } ${from("../../render/regions.js")};\nexport const twice = LIMIT * 2;\n`,
    "src/world/types/index.ts": `export type { Art } ${from("../../render/regions.js")};\nexport const plain = 1;\n`,
    "src/sim/viaBarrel.ts": `export { LIMIT } ${from("../world/barrel/index.js")};\n`,
    "src/sim/viaBabylon.ts": `import { LIMIT } ${from("../world/babylon/index.js")};\nexport const c = LIMIT;\n`,
    "src/content/viaDeep.ts": `import { twice } ${from("../world/deep/a.js")};\nexport const d = twice;\n`,
    "src/sim/viaTypes.ts": `import { plain } ${from("../world/types/index.js")};\nimport type { Art } ${from("../world/types/index.js")};\nexport const e = plain;\nexport type F = Art;\n`,
  });
  assert.ok(failures.some((f) => /layering: src\/sim\/viaBarrel\.ts reaches src\/render\/regions\.ts through src\/world\/barrel\/index\.ts/.test(f)), failures.join("\n"));
  assert.ok(failures.some((f) => /layering: src\/sim\/viaBabylon\.ts reaches @babylonjs\/core\/Maths\/math\.color\.js through src\/world\/babylon\/index\.ts/.test(f)), failures.join("\n"));
  assert.ok(failures.some((f) => /layering: src\/content\/viaDeep\.ts reaches src\/render\/regions\.ts through src\/world\/deep\/a\.ts → src\/world\/deep\/b\.ts/.test(f)), failures.join("\n"));
  assert.ok(!failures.some((f) => /viaTypes/.test(f)), failures.join("\n"));
  assert.equal(failures.length, 3, failures.join("\n"));
});

test("the real tsconfig.headless.json roots every sim and content source extension, and rejects the DOM there, imported or not", () => {
  const dir = scratchRepo({
    "tsconfig.json": fs.readFileSync("tsconfig.json", "utf8"),
    "tsconfig.headless.json": fs.readFileSync("tsconfig.headless.json", "utf8"),
    "scripts/headless-platform.d.ts": fs.readFileSync("scripts/headless-platform.d.ts", "utf8"),
    "src/sim/review-dom.mts": "export const width = (): number => window.innerWidth;\n",
    "src/content/review-common.cts": "export const store = (): unknown => localStorage;\n",
    "src/content/review-view.tsx": "export const title = (): string => document.title;\n",
    "src/runtime/app.ts": `import { width } ${from("../sim/review-dom.mjs")};\nexport const w = width;\n`,
  });
  try {
    const parsed = ts.getParsedCommandLineOfConfigFile(join(dir, "tsconfig.headless.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })!;
    for (const f of ["src/sim/review-dom.mts", "src/content/review-common.cts", "src/content/review-view.tsx"])
      assert.ok(parsed.fileNames.includes(join(dir, f)), `${f} is a headless root: ${parsed.fileNames.join(", ")}`);
    const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
    const errors = ts.getPreEmitDiagnostics(program).filter((d) => d.file).map((d) => `${basename(d.file!.fileName)}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
    for (const [file, name] of [["review-dom.mts", "window"], ["review-common.cts", "localStorage"], ["review-view.tsx", "document"]] as [string, string][])
      assert.ok(errors.some((e) => e.startsWith(file) && e.includes(`'${name}'`)), `${file}: ${errors.join("\n")}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the declared platform APIs (TextEncoder, TextDecoder, AbortSignal) typecheck headless and behave so at runtime", () => {
  const dir = scratchRepo({
    "tsconfig.json": fs.readFileSync("tsconfig.json", "utf8"),
    "tsconfig.headless.json": fs.readFileSync("tsconfig.headless.json", "utf8"),
    "scripts/headless-platform.d.ts": fs.readFileSync("scripts/headless-platform.d.ts", "utf8"),
    // CW-1's kit codec and SIM-1's cancellable writes use exactly these.
    "src/sim/codec.ts": [
      "export function roundTrip(header: object): object {",
      "  const json = new TextEncoder().encode(JSON.stringify(header)), bytes = new Uint8Array(8 + json.length);",
      "  bytes.set(json, 8);",
      "  return JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + json.length))) as object;",
      "}",
      "export function cancelled(signal: AbortSignal): boolean { if (signal.aborted) return true; signal.throwIfAborted(); return false; }",
      "export const aborted = (): AbortSignal => AbortSignal.abort(\"replaced\");",
    ].join("\n") + "\n",
  });
  try {
    const parsed = ts.getParsedCommandLineOfConfigFile(join(dir, "tsconfig.headless.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })!;
    const errors = ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true })).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
    assert.deepEqual(errors, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // The runtime has them, with the declared members.
  const header = { magic: "siltwake", n: 3, ü: "ß" };
  assert.deepEqual(JSON.parse(new TextDecoder().decode(new TextEncoder().encode(JSON.stringify(header)))), header);
  assert.equal(new TextEncoder().encoding, "utf-8");
  const signal = AbortSignal.abort("replaced");
  assert.equal(signal.aborted, true);
  assert.equal(signal.reason, "replaced");
  assert.throws(() => signal.throwIfAborted());
  assert.equal(typeof AbortSignal.timeout, "function");
});
