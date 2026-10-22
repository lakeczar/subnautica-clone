/** A cross-process memo for expensive, deterministic world data (cave volumes,
 * draped keel lines, cave collars). The game installs no store, so
 * `cachedBuild` just calls `build`. The test tiers preload a disk store
 * (`scripts/test-build-cache.mjs`) that files each entry under its key and a
 * hash of the code it depends on: the static import closure of every module
 * in its `modules`, so changing that code, or any content it imports,
 * rebuilds the entry.
 *
 * Only data that is a pure function of that code and of the key belongs here.
 * A floor function is cached by a registered name and the module defining it
 * (`nameFloor`); an unnamed floor, such as a test's synthetic one, is never
 * cached. */

export interface BuildCacheStore {
  get(key: string, modules: readonly string[]): unknown;
  set(key: string, modules: readonly string[], value: unknown): void;
  /** Runs a miss's build; a test store measures it here (optional). */
  fill?<T>(build: () => T): T;
}

/** A build-cache key and the modules (URLs) whose code the cached data derives from. */
export interface CacheKey {
  readonly key: string;
  readonly modules: readonly string[];
}

/** A named floor and the modules whose code defines it. */
export interface FloorIdentity {
  readonly name: string;
  readonly modules: readonly string[];
}

const STORE = "__siltwakeBuildCache";
const names = new WeakMap<object, FloorIdentity>();
let bypass = 0;

/** Registers `fn` as a cacheable floor named `name`, defined by the code of
 * `modules` (module URLs, normally `import.meta.url`); returns `fn`. */
export function nameFloor<F extends (...args: never[]) => unknown>(fn: F, name: string, modules: readonly string[]): F {
  names.set(fn, { name, modules });
  return fn;
}

/** The registered identity of `fn`, or undefined if it has none. */
export function floorIdentity(fn: object): FloorIdentity | undefined {
  return names.get(fn);
}

/** A JSON key for plain data, or undefined if it holds a function (uncacheable). */
export function dataKey(value: unknown): string | undefined {
  let plain = true;
  const text = JSON.stringify(value, (_, v: unknown) => {
    if (typeof v === "function") plain = false;
    return typeof v === "number" && !Number.isFinite(v) ? String(v) : v;
  });
  return plain ? text : undefined;
}

/** A cache key for data built on `floor` from `data`, with the modules it
 * depends on, or undefined when the floor is unnamed, the data uncacheable or
 * no store is installed (the game serialises nothing). */
export function floorKey(kind: string, floor: object, data: unknown, module: string): CacheKey | undefined {
  if (!installed()) return undefined;
  const id = names.get(floor), text = id && dataKey(data);
  return id && text !== undefined ? { key: `${kind}:${id.name}:${text}`, modules: [module, ...id.modules] } : undefined;
}

const installed = (): BuildCacheStore | undefined => (globalThis as { [STORE]?: BuildCacheStore })[STORE];

/** `build()`, served from the installed store when there is one and `key` is set. */
export function cachedBuild<T>(key: CacheKey | undefined, build: () => T): T {
  const store = installed();
  if (!store || key === undefined || bypass) return build();
  const hit = store.get(key.key, key.modules);
  if (hit !== undefined) return hit as T;
  const value = store.fill ? store.fill(build) : build();
  store.set(key.key, key.modules, value);
  return value;
}

/** Runs `fn` with the store ignored, for tests that compare a fresh build with a cached one. */
export function withoutBuildCache<T>(fn: () => T): T {
  bypass++;
  try { return fn(); } finally { bypass--; }
}
