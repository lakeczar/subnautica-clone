// Preloaded into every test process (both tiers): installs the disk store behind
// src/content/buildCache.ts, so expensive deterministic world data (cave
// volumes, cave collars, draped keel lines) is built once per change to the
// code it depends on, instead of once per test process.
//
// An entry is filed under .test-build/build-cache/<code hash>/<key hash>.bin.
// The code hash covers the compiled text of the static import closure of every
// module the entry names (the module that builds it and the module defining its
// floor), so editing that code or any content it imports misses, while edits
// elsewhere keep the cache warm. Each entry stores its full key and is used only
// when the key matches. Writes go through a temporary file and a rename, so
// concurrent test processes never read a partial entry. The CPU a fill spends
// building is counted on the thread that runs it, the clock the fast-file budget
// reads, once even when fills nest, and reported to scripts/test-file-timing.mjs
// so a cold cache does not count against a fast file's budget.
// SILTWAKE_BUILD_CACHE=off disables the store; SILTWAKE_BUILD_CACHE_DIR moves it.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deserialize, serialize } from "node:v8";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const cacheRoot = process.env.SILTWAKE_BUILD_CACHE_DIR || join(root, ".test-build", "build-cache");
const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|[\s;])import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

// Bump when the entry format changes. The runtime is part of every namespace:
// entries are V8-serialized, and cached geometry uses engine math functions.
const NAMESPACE = ["siltwake-build-cache/1", process.versions.node, process.versions.v8, process.platform, process.arch].join("\0");

/** Hash of the runtime and of the compiled text of the relative-import closure of `modules` (file URLs). */
export function closureHash(modules, runtime = NAMESPACE) {
  const seen = new Set(), queue = modules.map((m) => fileURLToPath(m));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith(".js")) continue;
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT_RE)) {
      const specifier = m[1] ?? m[2] ?? m[3];
      if (specifier.startsWith(".")) queue.push(fileURLToPath(new URL(specifier, pathToFileURL(file))));
    }
  }
  const hash = createHash("sha256").update(runtime).update("\0");
  for (const file of [...seen].sort()) hash.update(file).update("\0").update(readFileSync(file)).update("\0");
  return hash.digest("hex").slice(0, 16);
}

/** Removes code-hash directories untouched for `maxAgeHours`, then all but the newest `keep`. */
export function pruneBuildCache({ maxAgeHours = 24, keep = 24 } = {}) {
  let dirs;
  try {
    dirs = readdirSync(cacheRoot).map((name) => ({ path: join(cacheRoot, name), mtime: statSync(join(cacheRoot, name)).mtimeMs }));
  } catch { return; }
  dirs.sort((a, b) => b.mtime - a.mtime);
  dirs.forEach((d, i) => {
    if (i >= keep || Date.now() - d.mtime > maxAgeHours * 3600e3) rmSync(d.path, { recursive: true, force: true });
  });
}

/** Main-thread CPU ms (the process's where per-thread time is unavailable), as test-file-timing.mjs reads it. */
const threadCpuMs = () => { const u = process.threadCpuUsage?.() ?? process.cpuUsage(); return (u.user + u.system) / 1000; };

/** A store over `root`: entries filed under the closure hash of their modules. */
export function createStore(root) {
  const dirs = new Map();
  let depth = 0;
  const fileOf = (key, modules) => {
    const scope = [...modules].sort().join("\n");
    let dir = dirs.get(scope);
    if (!dir) {
      dirs.set(scope, dir = join(root, closureHash(modules)));
      // Mark the directory used, so pruning by age drops only unused ones.
      try { const now = new Date(); utimesSync(dir, now, now); } catch { /* not created yet */ }
    }
    return join(dir, `${createHash("sha256").update(key).digest("hex").slice(0, 32)}.bin`);
  };
  return {
    get(key, modules) {
      try {
        const entry = deserialize(readFileSync(fileOf(key, modules)));
        return entry.key === key ? entry.value : undefined;
      } catch { return undefined; }
    },
    fill(build) {
      if (depth++) try { return build(); } finally { depth--; }
      const before = threadCpuMs();
      try { return build(); } finally {
        depth--;
        globalThis.__siltwakeBuildCacheFillCpuMs = (globalThis.__siltwakeBuildCacheFillCpuMs ?? 0) + threadCpuMs() - before;
      }
    },
    set(key, modules, value) {
      const file = fileOf(key, modules), temp = `${file}.${process.pid}.tmp`;
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(temp, serialize({ key, value }));
        renameSync(temp, file);
      } catch { rmSync(temp, { force: true }); }
    },
  };
}

if (process.env.SILTWAKE_BUILD_CACHE !== "off") globalThis.__siltwakeBuildCache = createStore(cacheRoot);
