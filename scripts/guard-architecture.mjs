#!/usr/bin/env node
// The architecture guard (STEW-1; the steward verdict's "What the guard rails are").
// Runs in `npm run test:fast`, in about a second, with the TypeScript compiler API
// already in devDependencies. It FAILS on:
//   1. layering, failing closed: sim and content's runtime closure (value edges, static and
//      lazy, followed through modules in any directory) may end only in JSON data, a package on
//      PORTABLE_PACKAGES, or TypeScript the guard analyses. It fails at render, UI, audio or
//      Babylon, any other package or builtin, JavaScript (which the headless typecheck doesn't
//      check), a module it can't find, and a computed import()/require() anywhere on the path.
//      Only statement-level `import type`/`export type` are erased (verbatimModuleSyntax:
//      `import { type X }` still runs its target). DOM globals fail tsconfig.headless.json.
//   2. a value-import cycle (static edges) that isn't exactly an allowlisted group: a
//      new cycle, a new member, or a group that shrank or vanished while its allowance
//      didn't (the ratchet: shrink the allowance in the change that shrinks the cycle);
//   3. browser, server or GPU-prep plumbing (`chromium.launch(`, `createServer(`,
//      `gpu-prep`) outside scripts/rec, scripts/heavy and scripts/soak, except the
//      allowlisted archive (REC-2 retires it);
//   4. an exported `class RecipeBuilder` beyond today's two (WK-1 makes them one);
//   5. a region lookup (a function or method named like `regionAt`, `regionOf`,
//      `regionFor`) declared outside src/content/regions/layout.ts, except the
//      allowlisted legacy art lookup and the WorldMap interface.
// Sources are every .ts, .mts, .cts and .tsx under src (not .d.ts).
// It PRINTS, without failing: the FORK markers, the shared roots' line counts and
// exported names nothing else references, for the per-wave architecture review.
//
//   node scripts/guard-architecture.mjs [--quiet]
// Allowlists only shrink. To retire an entry, remove it here in the change that removes the code.
//
// Scope: a fail-closed regression rail over honest repository code. Every rule reads real
// paths and source text (it also refuses symlinks under src, and JSON leaves that don't
// exist). It is not a sandbox against deliberately adversarial constructions; the headless
// typecheck and review cover those.
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
  // FORK(stream-drivers): per-stream browser drivers, servers and save-derive scripts, each a copy of the last; retire in REC-2.
  drivers: [
    "docs/build/gpu-enablement/webgl-probe.mjs",
    "docs/build/streams/atm1/server.mjs", "docs/build/streams/c3/play.mjs", "docs/build/streams/c4/play-a.mjs",
    "docs/build/streams/c4b/play-b.mjs", "docs/build/streams/c4b/play-c.mjs", "docs/build/streams/ca-2/shots.mjs",
    "docs/build/streams/col1/r6-shots.mjs", "docs/build/streams/cr1/play.mjs", "docs/build/streams/cw1/traverse.mjs",
    "docs/build/streams/enc1/play.mjs", "docs/build/streams/hub2/play.mjs", "docs/build/streams/poi1/server.mjs",
    "docs/build/streams/ux1/before.mjs", "docs/build/streams/ux1/drive.mjs", "docs/build/streams/ux1/play.mjs",
    "docs/build/streams/ux1/run-gpu.sh", "docs/build/streams/w2/server.mjs",
    // SIG-1's browser check, written before REC-1 merged (its brief: the existing drivers until then).
    "docs/build/streams/sig1/play.mjs",
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
/** TypeScript's own source extensions (declaration files excluded), and the script ones the
 * driver rule scans: one set, shared by collection and analysis (tsconfig.headless.json's
 * recursive include roots use the compiler's own discovery for the same set). */
export const TS_EXTENSIONS = [ts.Extension.Ts, ts.Extension.Tsx, ts.Extension.Mts, ts.Extension.Cts];
const DECLARATION = [ts.Extension.Dts, ts.Extension.Dmts, ts.Extension.Dcts];
const SCRIPT_EXTENSIONS = [...TS_EXTENSIONS, ".js", ".mjs", ".cjs", ".sh"];
const hasExt = (f, exts) => exts.some((e) => f.endsWith(e)) && !DECLARATION.some((d) => f.endsWith(d));
/** Is `f` a source the guard analyses? */
export const isSource = (f) => f.startsWith("src/") && hasExt(f, TS_EXTENSIONS);
/** The owner's lookups: a function whose whole body is one call to these delegates, it is no second lookup. */
const REGION_DELEGATES = new Set(["regionAtPoint", "regionAtPosition"]);
/** A bare specifier (a package, a Node builtin, an absolute path) as a graph target. */
const PACKAGE = "package:";
/** Packages sim and content may reach at runtime, each with why it is portable (Node, workers and
 * the browser alike). Today they reach none; add one only with its reason. */
export const PORTABLE_PACKAGES = new Map([]);
const REGION_LOOKUP = /^\w*region(At|Of|For)(Point|Position)?$/i;
const REGION_OWNER = "src/content/regions/layout.ts";
const SELF = ["scripts/guard-architecture.mjs", "tests/guard-architecture.test.ts"];
export const SHARED_ROOTS = ["src/runtime/app.ts", "src/sim/step.ts", "src/sim/world.ts", "src/ui/panels.ts", "src/render/renderer.ts",
  "src/content/regions/caveGeometry.ts", "src/content/registry.ts"];

// ----------------------------------------------------------------------------- source analysis

/** One source's value imports (resolved to repository paths, bare specifiers kept), split into
 * static edges (which can form initialization cycles) and lazy ones (`import()`, `require()`);
 * type-only imports are skipped. Plus its region lookups, RecipeBuilder classes and value exports. */
function analyseSource(file, text, exists) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : /\.[mc]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, kind);
  const imports = [], lazy = [], computed = [], lookups = [], builders = [], exports = [];
  const resolve = (spec) => {
    if (!spec.startsWith(".")) return `${PACKAGE}${spec}`;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    const swap = [[/\.js$/, [".ts", ".tsx"]], [/\.mjs$/, [".mts"]], [/\.cjs$/, [".cts"]]].flatMap(([re, exts]) => re.test(base) ? exts.map((e) => base.replace(re, e)) : []);
    for (const c of [...swap, `${base}.ts`, `${base}.mts`, `${base}.tsx`, `${base}/index.ts`, base]) if (exists(c)) return c;
    return base;
  };
  const exported = (n) => (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export) !== 0;
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      // Under verbatimModuleSyntax only a statement-level `import type` is erased: `import { type X }`
      // still emits `import {} from …` and runs its target.
      if (!st.importClause?.isTypeOnly) imports.push(resolve(st.moduleSpecifier.text));
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      // Likewise only `export type { … } from` is erased; `export { type X } from` emits `export {} from …`.
      if (!st.isTypeOnly) imports.push(resolve(st.moduleSpecifier.text));
    } else if (ts.isImportEqualsDeclaration(st) && !st.isTypeOnly && ts.isExternalModuleReference(st.moduleReference)) {
      const e = st.moduleReference.expression;
      if (ts.isStringLiteral(e)) imports.push(resolve(e.text)); else computed.push(e.getText(sf));
    } else if (exported(st)) {
      // Value exports only (functions, constants, classes, enums): what a dead-code pass can delete.
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) exports.push(d.name.text); }
      else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) exports.push(st.name.text);
    }
  }
  const nameOf = (n) => n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) ? n.name.text : null;
  /** The function's whole body is one call to the owner's lookup (with any arguments). */
  const delegates = (fn) => {
    let body = fn.body;
    if (body && ts.isBlock(body)) body = body.statements.length === 1 && ts.isReturnStatement(body.statements[0]) ? body.statements[0].expression : undefined;
    while (body && ts.isParenthesizedExpression(body)) body = body.expression;
    return !!body && ts.isCallExpression(body) && ts.isIdentifier(body.expression) && REGION_DELEGATES.has(body.expression.text);
  };
  const visit = (n) => {
    // Lazy loads: import("…") and require("…") (a type position's import("…") is a type, skipped below).
    if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) {
      const arg = n.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) lazy.push(resolve(arg.text));
      else computed.push(n.getText(sf).slice(0, 80));
    }
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
    // A lookup implementation; one whose whole body calls the owner's regionAtPoint/regionAtPosition is wiring.
    const fn = ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) ? n
      : (ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n)) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) ? n.initializer : null;
    if (name && fn && REGION_LOOKUP.test(name) && !delegates(fn)) lookups.push(name);
    if (ts.isClassDeclaration(n) && name === "RecipeBuilder" && exported(n)) builders.push(name);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { imports, lazy, computed, lookups, builders, exports };
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
  // A symlink under src would let one file stand for another: every rule here reads paths.
  for (const link of files.symlinks ?? []) failures.push(`symlink: ${link} is a symlink; src holds real files only, so every rule sees the module it names`);
  const exists = (p) => files.has(p);
  const sources = [...files.keys()].filter(isSource).sort();
  const info = new Map(sources.map((f) => [f, analyseSource(f, files.get(f), exists)]));
  // 1. Layering, failing closed. Sim and content's runtime closure is every module they reach
  // by value edges (static and lazy: not statement-level `import type`/`export type`, which are
  // erased), in any directory. Each path must end in something the guard can vouch for: JSON
  // data, a portable package, or TypeScript it analyses. Anything else fails, naming the chain.
  const forbidden = (t) => UPPER.test(t) || t.startsWith(`${PACKAGE}@babylonjs/`);
  const shown = (t) => t.startsWith(PACKAGE) ? t.slice(PACKAGE.length) : t;
  const edges = (i) => [...i.imports.map((t) => [t, "imports"]), ...i.lazy.map((t) => [t, "lazily imports"])];
  const parsed = new Map(info);
  const nodeOf = (t) => { if (!parsed.has(t)) parsed.set(t, analyseSource(t, files.get(t), exists)); return parsed.get(t); };
  /** "ok" for a leaf the guard vouches for, a reason for one it can't, or null for TypeScript it follows. */
  const verdict = (t) => {
    if (forbidden(t)) return "render, UI, audio or Babylon";
    if (t.startsWith(PACKAGE)) {
      const spec = shown(t), name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      return PORTABLE_PACKAGES.has(name) ? "ok" : `the package or builtin ${spec}, not on the guard's PORTABLE_PACKAGES list`;
    }
    if (t.endsWith(".json")) return files.has(t) ? "ok" : "a JSON file the guard can't find or read"; // data, not code, if it is there
    if (!files.has(t)) return "a module the guard can't find or read";
    if (hasExt(t, [".js", ".mjs", ".cjs"])) return "JavaScript, which the headless typecheck doesn't check";
    if (!hasExt(t, TS_EXTENSIONS)) return "a file type the guard can't analyse";
    const c = nodeOf(t).computed;
    return c.length ? `a computed load (${c[0]}), which no rule can see through` : null;
  };
  // The followed modules: TypeScript outside sim and content reachable from them.
  const followed = new Set(), queue = [];
  const enqueue = (t) => { if (!(LOWER.test(t) && info.has(t)) && !followed.has(t) && verdict(t) === null) { followed.add(t); queue.push(t); } };
  for (const [f, i] of info) if (LOWER.test(f)) for (const [t] of edges(i)) enqueue(t);
  for (let k = 0; k < queue.length; k++) for (const [t] of edges(nodeOf(queue[k]))) enqueue(t);
  // Each followed module that reaches a leaf the guard can't vouch for, with its next hop toward
  // it, grown to a fixed point (cycles included).
  const hop = new Map(), bad = (t) => { const v = verdict(t); return v !== null && v !== "ok"; };
  for (const m of followed) { const e = edges(nodeOf(m)).find(([t]) => bad(t)); if (e) hop.set(m, e[0]); }
  for (let grew = true; grew;) {
    grew = false;
    for (const m of followed) {
      if (hop.has(m)) continue;
      const e = edges(nodeOf(m)).find(([t]) => hop.has(t));
      if (e) { hop.set(m, e[0]); grew = true; }
    }
  }
  const chainFrom = (m) => { const out = [m]; while (hop.has(out.at(-1))) out.push(hop.get(out.at(-1))); return out; };
  for (const [f, i] of info) {
    if (!LOWER.test(f)) continue;
    for (const [target, how] of edges(i)) {
      // An analysed TypeScript source in sim or content is checked as its own entry; anything else
      // there (JavaScript, a missing or unsupported file) gets the same fail-closed verdict as elsewhere.
      if (LOWER.test(target) && info.has(target)) continue;
      const v = verdict(target);
      if (v !== null && v !== "ok") failures.push(`layering: ${f} ${how} ${shown(target)} (${v}; sim and content stay below render, UI, audio and Babylon, on code the guard can check)`);
      else if (v === null && hop.has(target)) {
        const chain = chainFrom(target), end = chain.at(-1);
        failures.push(`layering: ${f} reaches ${shown(end)} through ${chain.slice(0, -1).map(shown).join(" → ")} (${verdict(end)})`);
      }
    }
    for (const c of i.computed) failures.push(`layering: ${f} loads a computed module (${c}); sim and content import by literal path only, so the rule can see it`);
  }
  // 2. Cycles, ratcheted by membership.
  const graph = new Map([...info].map(([f, i]) => [f, i.imports.filter((t) => info.has(t))]));
  const groups = cycles(graph);
  // Every cycle must be exactly an allowance, and every allowance exactly a cycle.
  for (const g of groups) {
    const home = allow.cycles.find((a) => g.every((m) => a.includes(m)));
    if (!home) {
      const known = allow.cycles.find((a) => g.some((m) => a.includes(m)));
      failures.push(known
        ? `cycle: new members join an allowlisted import cycle: ${g.filter((m) => !known.includes(m)).join(", ")} (group: ${g.join(" → ")})`
        : `cycle: a new value-import cycle: ${g.join(" → ")}`);
    }
  }
  for (const a of allow.cycles) {
    const now = groups.filter((g) => g.some((m) => a.includes(m)));
    const left = a.filter((m) => !now.some((g) => g.includes(m)));
    if (!now.length) failures.push(`cycle: the allowlisted cycle ${a.join(" → ")} is gone: remove it from ALLOW.cycles in this change, so it can't regrow`);
    else if (left.length || now.length > 1) failures.push(`cycle: an allowlisted cycle shrank or split (${left.join(", ") || "split"} left it): set ALLOW.cycles to ${now.map((g) => `[${g.join(", ")}]`).join(" and ")} in this change, so it can't regrow`);
  }
  // 3. Driver plumbing.
  for (const [f, text] of files) {
    if (!hasExt(f, SCRIPT_EXTENSIONS) || SELF.includes(f) || DRIVER_HOMES.some((d) => f.startsWith(d))) continue;
    const found = DRIVER_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
    if (found.length && !allow.drivers.includes(f))
      failures.push(`driver: ${f} has ${found.join(", ")}; browser, server and GPU plumbing lives in scripts/rec (write a scenario), scripts/heavy or scripts/soak`);
  }
  // The same ratchet: an allowlisted file that lost its plumbing leaves the list in that change. (Files not on
  // this branch, such as another stream's in-flight driver, are skipped.)
  for (const f of allow.drivers) if (files.has(f) && !DRIVER_PATTERNS.some(([, re]) => re.test(files.get(f))))
    failures.push(`driver: ${f} no longer has driver plumbing: remove it from ALLOW.drivers in this change, so it can't regrow`);
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
  // The guard's own drivers marker counts; its test's planted text doesn't.
  const forks = [];
  for (const [f, text] of files) for (const m of text.matchAll(/^\s*\/\/\s*FORK\(([^)]+)\)/gm)) if (f !== SELF[1]) forks.push({ id: m[1], file: f });
  const roots = SHARED_ROOTS.filter((f) => files.has(f)).map((f) => [f, files.get(f).split("\n").length]);
  const words = new Map();
  for (const [f, text] of files) if (!SELF.includes(f) && !f.endsWith(".json")) words.set(f, new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? []));
  // An exported value no other file names and its own file uses only where it declares it.
  const unused = [];
  for (const [f, i] of info) for (const name of new Set(i.exports)) {
    if ([...words].some(([g, set]) => g !== f && set.has(name))) continue;
    const own = files.get(f).match(new RegExp(`(?<![\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])`, "g"))?.length ?? 0;
    if (own <= 1) unused.push(`${f}: ${name}`);
  }
  return { failures, notes, report: { forks, forkIds: [...new Set(forks.map((k) => k.id))].sort(), roots, unused, groups, sources: sources.length } };
}

// ----------------------------------------------------------------------------- the repository

const SKIP = new Set(["node_modules", ".git", "dist", "public", ".test-build"]);
/** Every file the guard reads, by repository path. */
export function repositoryFiles(root = ROOT) {
  const files = new Map(), symlinks = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      // Never followed: under src one is a failure (analyse), whatever its name; elsewhere it is ignored.
      if (e.isSymbolicLink()) { if (rel.startsWith("src/")) symlinks.push(rel); continue; }
      if (SKIP.has(e.name) || e.name.startsWith(".test-build")) continue;
      if (e.isDirectory()) walk(rel);
      // JSON only under src, where sim and content's data lives (a JSON leaf must exist).
      else if (hasExt(e.name, [...SCRIPT_EXTENSIONS, ".html"]) || (rel.startsWith("src/") && e.name.endsWith(".json"))) files.set(rel, fs.readFileSync(path.join(root, rel), "utf8"));
    }
  };
  for (const top of ["src", "tests", "scripts", "tools", "docs"]) if (fs.existsSync(path.join(root, top))) walk(top);
  for (const f of ["index.html", "vite.config.ts"]) if (fs.existsSync(path.join(root, f))) files.set(f, fs.readFileSync(path.join(root, f), "utf8"));
  Object.defineProperty(files, "symlinks", { value: symlinks });
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = performance.now(), quiet = process.argv.includes("--quiet");
  const { failures, notes, report } = analyse(repositoryFiles());
  const ms = Math.round(performance.now() - t0);
  if (quiet && !failures.length)
    console.log(`guard-architecture: ok in ${ms} ms (${report.sources} sources; ${report.forkIds.length} forks in ${report.forks.length} FORK markers, ${report.unused.length} unreferenced exports: node scripts/guard-architecture.mjs for the report)`);
  if (!quiet) {
    console.log(`guard-architecture: ${report.sources} sources, ${report.groups.length} import cycles (each exactly an allowance), ${ms} ms`);
    console.log(`  forks: ${report.forkIds.length} distinct IDs in ${report.forks.length} FORK markers: ${report.forks.map((k) => `${k.id} (${k.file})`).join("; ")}`);
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
