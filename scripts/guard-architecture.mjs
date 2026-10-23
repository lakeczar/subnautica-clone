#!/usr/bin/env node
// The architecture guard (STEW-1; the steward verdict's "What the guard rails are").
// Runs in `npm run test:fast`, in about a second, with the TypeScript compiler API
// already in devDependencies. It FAILS on:
//   1. layering: a value import from src/sim/** or src/content/** into src/render/**,
//      src/ui/**, src/audio/** or Babylon, or a DOM global used as a value there;
//   2. a value-import cycle that isn't one of today's allowlisted groups, or a new
//      member joining one (a ratchet: groups may shrink, never grow);
//   3. browser, server or GPU-prep plumbing (`chromium.launch(`, `createServer(`,
//      `gpu-prep`) outside scripts/rec, scripts/heavy and scripts/soak, except the
//      allowlisted archive (REC-2 retires it);
//   4. an exported `class RecipeBuilder` beyond today's two (WK-1 makes them one);
//   5. a region lookup (a function or method named like `regionAt`, `regionOf`,
//      `regionFor`) declared outside src/content/regions/layout.ts, except the
//      allowlisted legacy art lookup and the WorldMap interface.
// It PRINTS, without failing: the FORK markers, the shared roots' line counts and
// exported names nothing else references, for the per-wave architecture review.
//
//   node scripts/guard-architecture.mjs [--quiet]
// Allowlists only shrink. To retire an entry, remove it here in the change that removes the code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ALLOW = {
  /** Today's value-import cycles (Sol's audit, F14), by membership. */
  cycles: [
    ["src/render/biomes/scatter.ts", "src/render/biomes/vistas.ts", "src/render/poi/landmarks.ts"],
    ["src/sim/carrier.ts", "src/sim/carrierStations.ts", "src/sim/ecology/stimulus.ts", "src/sim/ecologyLink.ts", "src/sim/fauna/catch.ts",
      "src/sim/fittings.ts", "src/sim/hunter.ts", "src/sim/hunterEncounter.ts", "src/sim/hunterQueries.ts", "src/sim/progression.ts",
      "src/sim/recovery.ts", "src/sim/survival.ts", "src/sim/vehicles.ts"],
  ],
  /** Archived per-stream evidence drivers (and two in flight on CW-1 and COL-1). REC-2 moves them onto scripts/rec. */
  drivers: [
    "docs/build/gpu-enablement/webgl-probe.mjs",
    "docs/build/streams/atm1/server.mjs", "docs/build/streams/c3/play.mjs", "docs/build/streams/c4/play-a.mjs",
    "docs/build/streams/c4b/play-b.mjs", "docs/build/streams/c4b/play-c.mjs", "docs/build/streams/ca-2/shots.mjs",
    "docs/build/streams/col1/r6-shots.mjs", "docs/build/streams/cr1/play.mjs", "docs/build/streams/cw1/traverse.mjs",
    "docs/build/streams/enc1/play.mjs", "docs/build/streams/hub2/play.mjs", "docs/build/streams/poi1/server.mjs",
    "docs/build/streams/ux1/before.mjs", "docs/build/streams/ux1/drive.mjs", "docs/build/streams/ux1/play.mjs",
    "docs/build/streams/ux1/run-gpu.sh", "docs/build/streams/w2/server.mjs",
    "tools/cave-deep-shots.mjs", "tools/cave-gpu-check.mjs", "tools/large-cave-lab.gpu.mjs",
  ],
  /** The kit builder and the biome builder: FORK(biome-recipe-builder), retired by WK-1. */
  recipeBuilders: ["src/render/kit/recipe.ts", "src/render/biomes/recipe.ts"],
  /** file#name: the WorldMap interface and its implementation, and the legacy art map's lookup (art residency only). */
  regionLookups: ["src/world/types.ts#regionAt", "src/world/map.ts#regionAt", "src/render/regions.ts#legacyArtRegionAt"],
};

/** Directories that own browser, server and GPU plumbing. */
const DRIVER_HOMES = ["scripts/rec/", "scripts/heavy/", "scripts/soak/"];
const DRIVER_PATTERNS = [
  ["chromium.launch", /\bchromium\s*\.\s*launch\s*\(/],
  ["createServer", /\bcreateServer\s*\(/],
  ["gpu-prep", /gpu-prep/],
];
const LOWER = /^src\/(sim|content)\//, UPPER = /^src\/(render|ui|audio)\//;
const DOM_GLOBALS = new Set(["document", "window", "navigator", "localStorage", "sessionStorage", "location", "HTMLElement",
  "HTMLCanvasElement", "requestAnimationFrame", "cancelAnimationFrame", "AudioContext", "getComputedStyle"]);
const REGION_LOOKUP = /^\w*region(At|Of|For)(Point|Position)?$/i;
const REGION_OWNER = "src/content/regions/layout.ts";
const SELF = ["scripts/guard-architecture.mjs", "tests/guard-architecture.test.ts"];
export const SHARED_ROOTS = ["src/runtime/app.ts", "src/sim/step.ts", "src/sim/world.ts", "src/ui/panels.ts", "src/render/renderer.ts",
  "src/content/regions/caveGeometry.ts", "src/content/registry.ts"];

// ----------------------------------------------------------------------------- source analysis

/** Value imports of one TS source, resolved to repository paths (bare specifiers kept). Type-only imports are skipped. */
function analyseSource(file, text, exists) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const imports = [], declared = new Set(), dom = new Set(), lookups = [], builders = [], exports = [];
  const resolve = (spec) => {
    if (!spec.startsWith(".")) return spec;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    for (const c of [base.replace(/\.js$/, ".ts"), base.replace(/\.mjs$/, ".mts"), `${base}.ts`, `${base}/index.ts`, base]) if (exists(c)) return c;
    return base;
  };
  const exported = (n) => (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export) !== 0;
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const c = st.importClause;
      const typeOnly = c && (c.isTypeOnly || (!c.name && c.namedBindings && ts.isNamedImports(c.namedBindings) &&
        c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly)));
      if (!typeOnly) imports.push(resolve(st.moduleSpecifier.text));
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const typeOnly = st.isTypeOnly || (st.exportClause && ts.isNamedExports(st.exportClause) &&
        st.exportClause.elements.length > 0 && st.exportClause.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) imports.push(resolve(st.moduleSpecifier.text));
    } else if (exported(st)) {
      // Value exports only (functions, constants, classes, enums): what a dead-code pass can delete.
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) exports.push(d.name.text); }
      else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) exports.push(st.name.text);
    }
  }
  const nameOf = (n) => n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) ? n.name.text : null;
  const visit = (n) => {
    if (ts.isTypeNode(n) && !ts.isExpressionWithTypeArguments(n)) return;
    if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) {
      for (const m of ts.isInterfaceDeclaration(n) ? n.members : []) {
        const name = nameOf(m);
        // A method is a lookup an implementation must provide; a function-typed option is an injected resolver, not one.
        if (name && REGION_LOOKUP.test(name) && ts.isMethodSignature(m)) lookups.push(name);
      }
      return;
    }
    const name = nameOf(n);
    if (name && (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isBindingElement(n))) declared.add(name);
    // A lookup implementation; one that only delegates to the owner's regionAtPoint/regionAtPosition is wiring, not a second lookup.
    const fn = ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) ? n
      : (ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n)) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) ? n.initializer : null;
    if (name && fn && REGION_LOOKUP.test(name) && !/\bregionAtPo(int|sition)\b/.test(fn.getText(sf))) lookups.push(name);
    if (ts.isClassDeclaration(n) && name === "RecipeBuilder" && exported(n)) builders.push(name);
    if (ts.isIdentifier(n) && DOM_GLOBALS.has(n.text)) {
      const p = n.parent;
      const isName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isPropertyDeclaration(p) && p.name === n) || (ts.isMethodDeclaration(p) && p.name === n) || ts.isImportSpecifier(p) ||
        (ts.isShorthandPropertyAssignment(p) && false);
      if (!isName) dom.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const d of declared) dom.delete(d);
  return { imports, dom: [...dom], lookups, builders, exports };
}

/** Strongly connected groups (size > 1, or a self-import) of a directed graph (Tarjan). */
function cycles(graph) {
  let index = 0;
  const idx = new Map(), low = new Map(), stack = [], on = new Set(), out = [];
  const strong = (v) => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const group = [];
      for (let w; w !== v;) { w = stack.pop(); on.delete(w); group.push(w); }
      if (group.length > 1 || (graph.get(v) ?? []).includes(v)) out.push(group.sort());
    }
  };
  for (const v of [...graph.keys()].sort()) if (!idx.has(v)) strong(v);
  return out;
}

/** The whole analysis over `files` (repository path → text). Pure, so tests can plant violations. */
export function analyse(files, allow = ALLOW) {
  const failures = [], notes = [];
  const exists = (p) => files.has(p);
  const sources = [...files.keys()].filter((f) => f.startsWith("src/") && f.endsWith(".ts") && !f.endsWith(".d.ts")).sort();
  const info = new Map(sources.map((f) => [f, analyseSource(f, files.get(f), exists)]));
  // 1. Layering.
  for (const [f, i] of info) {
    if (!LOWER.test(f)) continue;
    for (const target of i.imports)
      if (UPPER.test(target) || target.startsWith("@babylonjs/")) failures.push(`layering: ${f} imports ${target} (sim and content stay below render, UI, audio and Babylon)`);
    for (const g of i.dom) failures.push(`layering: ${f} uses the DOM global ${g} (sim and content run headless)`);
  }
  // 2. Cycles, ratcheted by membership.
  const graph = new Map([...info].map(([f, i]) => [f, i.imports.filter((t) => info.has(t))]));
  const groups = cycles(graph);
  for (const g of groups) {
    const home = allow.cycles.find((a) => g.every((m) => a.includes(m)));
    if (!home) {
      const known = allow.cycles.find((a) => g.some((m) => a.includes(m)));
      failures.push(known
        ? `cycle: new members join an allowlisted import cycle: ${g.filter((m) => !known.includes(m)).join(", ")} (group: ${g.join(" → ")})`
        : `cycle: a new value-import cycle: ${g.join(" → ")}`);
    } else if (g.length < home.length) notes.push(`cycle shrank to ${g.length} of ${home.length} (${home.filter((m) => !g.includes(m)).join(", ")} left it): ratchet ALLOW.cycles down`);
  }
  for (const a of allow.cycles) if (!groups.some((g) => g.some((m) => a.includes(m)))) notes.push(`an allowlisted cycle is gone (${a[0]} …): remove it from ALLOW.cycles`);
  // 3. Driver plumbing.
  for (const [f, text] of files) {
    if (!/\.(mjs|js|cjs|ts|mts|sh)$/.test(f) || SELF.includes(f) || DRIVER_HOMES.some((d) => f.startsWith(d))) continue;
    const found = DRIVER_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
    if (found.length && !allow.drivers.includes(f))
      failures.push(`driver: ${f} has ${found.join(", ")}; browser, server and GPU plumbing lives in scripts/rec (write a scenario), scripts/heavy or scripts/soak`);
  }
  for (const f of allow.drivers) if (files.has(f) && !DRIVER_PATTERNS.some(([, re]) => re.test(files.get(f)))) notes.push(`${f} no longer has driver plumbing: remove it from ALLOW.drivers`);
  // 4. RecipeBuilder.
  for (const [f, i] of info) if (i.builders.length && !allow.recipeBuilders.includes(f))
    failures.push(`builder: ${f} exports another class RecipeBuilder; use the kit RecipeBuilder (src/render/kit/recipe.ts)`);
  // 5. Region lookups.
  for (const [f, i] of info) {
    if (f === REGION_OWNER) continue;
    for (const name of i.lookups) if (!allow.regionLookups.includes(`${f}#${name}`))
      failures.push(`region: ${f} declares a region lookup ${name}; the semantic region is regionAtPoint/regionAtPosition in ${REGION_OWNER}`);
  }
  // Printed only.
  const forks = [];
  for (const [f, text] of files) for (const m of text.matchAll(/\/\/\s*FORK\(([^)]+)\)/g)) if (!SELF.includes(f)) forks.push(`${m[1]} (${f})`);
  const roots = SHARED_ROOTS.filter((f) => files.has(f)).map((f) => [f, files.get(f).split("\n").length]);
  const words = new Map();
  for (const [f, text] of files) if (!SELF.includes(f)) words.set(f, new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? []));
  // An exported value no other file names and its own file uses only where it declares it.
  const unused = [];
  for (const [f, i] of info) for (const name of new Set(i.exports)) {
    if ([...words].some(([g, set]) => g !== f && set.has(name))) continue;
    const own = files.get(f).match(new RegExp(`(?<![\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])`, "g"))?.length ?? 0;
    if (own <= 1) unused.push(`${f}: ${name}`);
  }
  return { failures, notes, report: { forks, roots, unused, groups, sources: sources.length } };
}

// ----------------------------------------------------------------------------- the repository

const SKIP = new Set(["node_modules", ".git", "dist", "public", ".test-build"]);
/** Every file the guard reads, by repository path. */
export function repositoryFiles(root = ROOT) {
  const files = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (SKIP.has(e.name) || e.name.startsWith(".test-build")) continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|mts|mjs|js|cjs|sh|html)$/.test(e.name) && !e.name.endsWith(".d.ts")) files.set(rel, fs.readFileSync(path.join(root, rel), "utf8"));
    }
  };
  for (const top of ["src", "tests", "scripts", "tools", "docs"]) if (fs.existsSync(path.join(root, top))) walk(top);
  for (const f of ["index.html", "vite.config.ts"]) if (fs.existsSync(path.join(root, f))) files.set(f, fs.readFileSync(path.join(root, f), "utf8"));
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = performance.now(), quiet = process.argv.includes("--quiet");
  const { failures, notes, report } = analyse(repositoryFiles());
  const ms = Math.round(performance.now() - t0);
  if (quiet && !failures.length)
    console.log(`guard-architecture: ok in ${ms} ms (${report.sources} sources; ${report.forks.length} FORK markers, ${report.unused.length} unreferenced exports: node scripts/guard-architecture.mjs for the report)`);
  if (!quiet) {
    console.log(`guard-architecture: ${report.sources} sources, ${report.groups.length} allowlisted import cycles, ${ms} ms`);
    console.log(`  FORK markers: ${report.forks.length}${report.forks.length ? `: ${report.forks.join("; ")}` : ""}`);
    console.log(`  shared roots: ${report.roots.map(([f, n]) => `${path.basename(f)} ${n}`).join(", ")} lines`);
    console.log(`  exports nothing else references: ${report.unused.length}${report.unused.length ? "" : ""}`);
    for (const u of report.unused.slice(0, 40)) console.log(`    ${u}`);
    if (report.unused.length > 40) console.log(`    … and ${report.unused.length - 40} more`);
    for (const n of notes) console.log(`  note: ${n}`);
  }
  for (const f of failures) console.error(`guard-architecture: FAIL ${f}`);
  if (failures.length) console.error(`guard-architecture: ${failures.length} failures (see scripts/guard-architecture.mjs and docs/build/CORE-HELPERS.md)`);
  process.exit(failures.length ? 1 : 0);
}
