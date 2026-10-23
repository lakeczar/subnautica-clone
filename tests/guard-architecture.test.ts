import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The architecture guard (scripts/guard-architecture.mjs, STEW-1) on the real
// repository, then on a copy of it with one of every violation planted: the
// allowlists must not hide any of them.
interface Guard {
  analyse(files: Map<string, string>): { failures: string[]; notes: string[]; report: { groups: string[][]; forks: string[]; unused: string[] } };
  repositoryFiles(): Map<string, string>;
}
/** Planted sources spell their imports through this, so the fast tier's static import scan doesn't read them as this file's. */
const from = (spec: string): string => `fr` + `om "${spec}"`;
const G = await import(pathToFileURL(resolve("scripts/guard-architecture.mjs")).href) as Guard;
const files = G.repositoryFiles();

test("the repository passes the guard: today's two cycles, no layering, driver, builder or region-lookup breaks", () => {
  const { failures, report } = G.analyse(files);
  assert.deepEqual(failures, []);
  assert.equal(report.groups.length, 2);
  assert.ok(report.groups.some((g) => g.includes("src/sim/progression.ts")) && report.groups.some((g) => g.includes("src/render/poi/landmarks.ts")));
});

test("every planted violation fails, and the near misses beside them pass", () => {
  const planted = new Map(files);
  const add = (path: string, text: string): void => { planted.set(path, text); };
  // 1. Layering: a value import up from sim, and a DOM global in content. (A type-only import is fine.)
  add("src/sim/stewPlantUp.ts", `import { RESIDENT_REGION_LIMIT } ${from("../render/regions.js")};\nimport type { RegionArt } ${from("../render/regions.js")};\nexport const up = RESIDENT_REGION_LIMIT;\nexport type A = RegionArt;\n`);
  add("src/content/stewPlantDom.ts", `export const width = (): number => window.innerWidth;\nexport const fine = (o: { window: number }): number => o.window;\n`);
  add("src/sim/stewPlantTypeOnly.ts", `import type { RegionArt } ${from("../render/regions.js")};\nexport type B = RegionArt;\n`);
  // 2. A brand-new cycle, and a new member joining the sim group.
  add("src/render/stewPlantA.ts", `import { b } ${from("./stewPlantB.js")};\nexport const a = (): number => b() + 1;\n`);
  add("src/render/stewPlantB.ts", `import { a } ${from("./stewPlantA.js")};\nexport const b = (): number => 1;\nexport const c = (): number => a();\n`);
  add("src/sim/stewPlantMember.ts", `import { completeOpening } ${from("./progression.js")};\nexport const member = completeOpening;\n`);
  planted.set("src/sim/progression.ts", `import { member } ${from("./stewPlantMember.js")};\nvoid member;\n${files.get("src/sim/progression.ts")}`);
  // 3. Browser and server plumbing in a new stream driver; the same in scripts/rec is its home.
  add("docs/build/streams/stew-plant/play.mjs", `import { chromium } ${from("playwright-core")};\nconst b = await chromium.launch({ headless: true });\n`);
  add("docs/build/streams/stew-plant/serve.mjs", `import { createServer } ${from("node:http")};\ncreateServer(() => {}).listen(0);\n`);
  add("tools/stew-plant.mjs", `const pw = require("/work/tmp/gpu-prep/pw/");\n`);
  add("scripts/rec/stew-plant.mjs", `import { chromium } ${from("playwright-core")};\nawait chromium.launch();\n`);
  // 4. A third RecipeBuilder.
  add("src/render/stewPlantRecipe.ts", `export class RecipeBuilder {}\n`);
  // 5. A region lookup outside layout.ts; a wrapper that delegates to it is fine.
  add("src/render/stewPlantRegion.ts", `import type { RegionId } ${from("../content/registry.js")};\nexport function regionOf(x: number): RegionId | null { return x > 0 ? "silt_basin" : null; }\n` +
    `import { regionAtPoint } ${from("../content/regions/layout.js")};\nexport const hudRegionAt = (x: number, z: number) => regionAtPoint(x, z);\n`);
  const { failures } = G.analyse(planted);
  const expect = (re: RegExp, what: string): void => assert.ok(failures.some((f) => re.test(f)), `${what}:\n${failures.join("\n")}`);
  expect(/layering: src\/sim\/stewPlantUp\.ts imports src\/render\/regions\.ts/, "a value import up from sim");
  expect(/layering: src\/content\/stewPlantDom\.ts uses the DOM global window/, "a DOM global in content");
  expect(/cycle: a new value-import cycle: src\/render\/stewPlantA\.ts → src\/render\/stewPlantB\.ts/, "a new cycle");
  expect(/cycle: new members join an allowlisted import cycle: src\/sim\/stewPlantMember\.ts/, "a new cycle member");
  expect(/driver: docs\/build\/streams\/stew-plant\/play\.mjs has chromium\.launch/, "chromium.launch in a stream driver");
  expect(/driver: docs\/build\/streams\/stew-plant\/serve\.mjs has createServer/, "createServer in a stream driver");
  expect(/driver: tools\/stew-plant\.mjs has gpu-prep/, "a gpu-prep require");
  expect(/builder: src\/render\/stewPlantRecipe\.ts exports another class RecipeBuilder/, "a third RecipeBuilder");
  expect(/region: src\/render\/stewPlantRegion\.ts declares a region lookup regionOf/, "a region lookup outside layout.ts");
  for (const fine of [/stewPlantTypeOnly/, /scripts\/rec\/stew-plant/, /hudRegionAt/])
    assert.ok(!failures.some((f) => fine.test(f)), `${fine} must pass:\n${failures.join("\n")}`);
  assert.equal(failures.length, 9, failures.join("\n"));
});
