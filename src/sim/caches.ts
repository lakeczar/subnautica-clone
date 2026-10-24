/** The simulation's caches and their ledger (performance convention 8; SIM-PERF-1 review R1-F2).
 * Every cache the simulation keeps across steps registers here with its owner, its entry and
 * byte ceilings, its retained bytes and its eviction rule, and `simCaches()` reads them all on
 * demand (pulled, never pushed). Render's caches report through the renderer (`geometryCache.ts`
 * is that side's model). Byte figures are estimates of retained V8 heap, documented at each
 * owner; they bound growth, they are not a heap measurement. */
export interface CacheStats {
  owner: string;
  eviction: string;
  entries: number;
  maxEntries: number;
  bytes: number;
  maxBytes: number;
  hits: number;
  misses: number;
  evictions: number;
  /** Values made but not kept: one alone over the byte ceiling (as `GeometryCache` declines admission). */
  declined: number;
}

const ledger: (() => CacheStats)[] = [];
/** Adds a cache to the ledger (once, when its owner module loads). */
export function registerCache(stats: () => CacheStats): void { ledger.push(stats); }
/** Every registered cache, now. */
export function simCaches(): CacheStats[] { return ledger.map((stats) => stats()); }

/** A memo of derived data keyed by its inputs' values (never by object identity), within an
 * entry ceiling and a byte ceiling: a new entry evicts the oldest (FIFO) until both hold. A
 * value that alone exceeds the byte ceiling is returned uncached (declined) and the entries
 * already kept stay. `bytesOf` estimates an entry's retained bytes, key included. */
export class BoundedMemo<V> {
  private readonly entries = new Map<string, { value: V; bytes: number }>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private declined = 0;
  constructor(private readonly owner: string, private readonly maxEntries: number, private readonly maxBytes: number,
    private readonly bytesOf: (key: string, value: V) => number) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new RangeError(`${owner}: maxEntries must be a whole number of at least 1`);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new RangeError(`${owner}: maxBytes must be a finite number above 0`);
    registerCache(() => this.stats());
  }
  get(key: string, make: () => V): V {
    const hit = this.entries.get(key);
    if (hit) { this.hits++; return hit.value; }
    this.misses++;
    const value = make(), bytes = this.bytesOf(key, value);
    if (bytes > this.maxBytes) { this.declined++; return value; }
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    // The new entry fits alone, so this stops before reaching it.
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const [oldest, entry] = this.entries.entries().next().value!;
      this.entries.delete(oldest);
      this.bytes -= entry.bytes;
      this.evictions++;
    }
    return value;
  }
  stats(): CacheStats {
    return { owner: this.owner, eviction: "oldest first (FIFO) past either ceiling", entries: this.entries.size, maxEntries: this.maxEntries,
      bytes: this.bytes, maxBytes: this.maxBytes, hits: this.hits, misses: this.misses, evictions: this.evictions, declined: this.declined };
  }
}
