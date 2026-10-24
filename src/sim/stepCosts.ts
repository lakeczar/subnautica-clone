/** Where each fixed step's time goes (SIM-PERF-1). Off unless a meter is
 * installed in `stepMeter.active`; then pulled, never pushed (performance
 * convention 6). The owner of a step (the app's frame loop, a harness, or the
 * guard when nobody else is) opens and closes it; the guard, the step and the
 * app mark their phases in between; `snapshot()` reads the totals, the
 * histograms and the worst steps on demand.
 *
 * A mark charges the time since the previous mark to its phase, so marks sit at
 * the end of each phase. Recording allocates nothing per step: phase vectors,
 * histograms and the worst-step table are typed arrays sized at construction. */

/** The phases of one fixed step, in order. `input` to `autosave` are the app's
 * own work around the step (`frame` in `runtime/app.ts`). */
export const STEP_PHASES = [
  "input", "checkpoint", "commands", "movement", "cues", "action", "upgrades", "signatures", "systems", "fauna",
  "cycles", "renewal", "story", "berth", "recovery", "threat", "ecology", "survival", "journal",
  "events", "timeline", "timelineSave", "presentation", "autosave",
] as const;
export type StepPhase = (typeof STEP_PHASES)[number];
export const PHASE = Object.fromEntries(STEP_PHASES.map((p, i) => [p, i])) as { readonly [K in StepPhase]: number };

export interface StepMeter {
  /** Starts a step unless one is open; true when this call started it (the caller closes it). */
  open(): boolean;
  /** Charges the time since the last mark (or the open) to `phase`. */
  mark(phase: number): void;
  /** Ends the open step (anything unmarked since the last mark is the step's `other`). */
  close(tick: number): void;
}
/** The installed meter, or null (the default: the step then pays one null check per phase). */
export const stepMeter: { active: StepMeter | null } = { active: null };

/** Half a 60 Hz frame: a step over this is a spike (SIM-PERF-1's threshold). */
export const SLOW_STEP_MS = 8;

const PHASES = STEP_PHASES.length, OTHER = PHASES, COLUMNS = PHASES + 1;
/** Histogram: 8 buckets per octave from 1 µs (upper bounds within 9%). */
const PER_OCTAVE = 8, BUCKETS = 8 * 24;
const bucketOf = (ms: number): number => ms <= 0.001 ? 0 : Math.min(BUCKETS - 1, Math.floor(Math.log2(ms * 1000) * PER_OCTAVE));
const bucketTop = (b: number): number => 2 ** ((b + 1) / PER_OCTAVE) / 1000;

export interface StepRecord {
  tick: number;
  /** Clock time at the step's open, ms (to match GC or frame records). */
  at: number;
  ms: number;
  /** Time by phase, ms; `other` is unmarked time. */
  phases: Partial<Record<StepPhase | "other", number>>;
  /** Heap growth by phase, bytes, when the meter reads the heap (negative across a collection). */
  heap?: Partial<Record<StepPhase | "other", number>>;
}
export interface StepCostSnapshot {
  steps: number;
  slow: number;
  slowMs: number;
  /** Whole steps: quantiles from the histogram (bucket upper bounds) and the exact maximum, ms. */
  step: { mean: number; p50: number; p99: number; p999: number; max: number };
  /** Each phase that ran: mean, p99 and maximum ms per step, how many steps it took over 1 and over 4 ms (by
   * histogram bucket, within 9%), and mean heap growth per step when read (bytes, over steps without a collection). */
  phases: Partial<Record<StepPhase | "other", { mean: number; p99: number; max: number; over1: number; over4: number; heap?: number }>>;
  /** The slowest steps, slowest first. */
  worst: StepRecord[];
}

export interface StepCostOptions {
  clock?: () => number;
  /** The heap's used bytes (Node: `v8.getHeapStatistics().used_heap_size`), read at every mark. */
  heap?: () => number;
  /** Worst steps kept (default 32). */
  keep?: number;
  slowMs?: number;
}

export class StepCosts implements StepMeter {
  private readonly clock: () => number;
  private readonly heap: (() => number) | null;
  private readonly slowMs: number;
  private readonly keep: number;
  private opened = false;
  private started = 0;
  private last = 0;
  private lastHeap = 0;
  private readonly cur = new Float64Array(COLUMNS);
  private readonly curHeap = new Float64Array(COLUMNS);
  private readonly sum = new Float64Array(COLUMNS);
  private readonly heapSum = new Float64Array(COLUMNS);
  private readonly max = new Float64Array(COLUMNS);
  private readonly hist = new Float64Array(COLUMNS * BUCKETS);
  private readonly stepHist = new Float64Array(BUCKETS);
  private steps = 0;
  /** Steps whose heap growth counts (no collection inside them). */
  private heapSteps = 0;
  private slow = 0;
  private stepSum = 0;
  private stepMax = 0;
  // The worst-step table: `keep` rows, the smallest one replaced (bounded selection).
  private readonly worstMs: Float64Array;
  private readonly worstTick: Float64Array;
  private readonly worstAt: Float64Array;
  private readonly worstPhases: Float64Array;
  private readonly worstHeap: Float64Array;
  private worstCount = 0;
  /** The last closed step's total, ms (harnesses attach their own context to slow steps). */
  lastMs = 0;

  constructor(options: StepCostOptions = {}) {
    this.clock = options.clock ?? (() => performance.now());
    this.heap = options.heap ?? null;
    this.slowMs = options.slowMs ?? SLOW_STEP_MS;
    this.keep = Math.max(1, options.keep ?? 32);
    this.worstMs = new Float64Array(this.keep);
    this.worstTick = new Float64Array(this.keep);
    this.worstAt = new Float64Array(this.keep);
    this.worstPhases = new Float64Array(this.keep * COLUMNS);
    this.worstHeap = new Float64Array(this.keep * COLUMNS);
  }

  open(): boolean {
    if (this.opened) return false;
    this.opened = true;
    this.cur.fill(0);
    if (this.heap) { this.curHeap.fill(0); this.lastHeap = this.heap(); }
    this.started = this.last = this.clock();
    return true;
  }

  mark(phase: number): void {
    if (!this.opened) return;
    const now = this.clock();
    this.cur[phase]! += now - this.last;
    this.last = now;
    if (this.heap) { const h = this.heap(); this.curHeap[phase]! += h - this.lastHeap; this.lastHeap = h; }
  }

  /** Drops the time since the last mark (a harness's own bookkeeping inside a step). */
  skip(): void {
    if (!this.opened) return;
    this.last = this.clock();
    if (this.heap) this.lastHeap = this.heap();
  }

  close(tick: number): void {
    if (!this.opened) return;
    const now = this.clock();
    this.opened = false;
    this.cur[OTHER]! += now - this.last;
    if (this.heap) this.curHeap[OTHER]! += this.heap() - this.lastHeap;
    const ms = now - this.started;
    this.lastMs = ms;
    this.steps++;
    this.stepSum += ms;
    if (ms > this.stepMax) this.stepMax = ms;
    if (ms > this.slowMs) this.slow++;
    this.stepHist[bucketOf(ms)]!++;
    // A collection inside the step shrinks the heap: its growth by phase isn't allocation.
    let collected = false;
    if (this.heap) for (let p = 0; p < COLUMNS; p++) if (this.curHeap[p]! < 0) collected = true;
    if (this.heap && !collected) this.heapSteps++;
    for (let p = 0; p < COLUMNS; p++) {
      const v = this.cur[p]!;
      this.sum[p]! += v;
      if (this.heap && !collected) this.heapSum[p]! += this.curHeap[p]!;
      if (v > this.max[p]!) this.max[p] = v;
      this.hist[p * BUCKETS + bucketOf(v)]!++;
    }
    this.remember(tick, ms);
  }

  private remember(tick: number, ms: number): void {
    let row = this.worstCount;
    if (row === this.keep) {
      row = 0;
      for (let i = 1; i < this.keep; i++) if (this.worstMs[i]! < this.worstMs[row]!) row = i;
      if (this.worstMs[row]! >= ms) return;
    } else this.worstCount++;
    this.worstMs[row] = ms;
    this.worstTick[row] = tick;
    this.worstAt[row] = this.started;
    this.worstPhases.set(this.cur, row * COLUMNS);
    if (this.heap) this.worstHeap.set(this.curHeap, row * COLUMNS);
  }

  /** The step just closed (allocates: read it for slow steps only). */
  lastStep(tick: number): StepRecord {
    const record: StepRecord = { tick, at: this.started, ms: this.lastMs, phases: {} };
    if (this.heap) record.heap = {};
    this.fill(record, this.cur, 0, this.curHeap, 0);
    return record;
  }

  private fill(record: StepRecord, phases: Float64Array, offset: number, heap: Float64Array, heapOffset: number): void {
    for (let p = 0; p < COLUMNS; p++) {
      const name = p === OTHER ? "other" : STEP_PHASES[p]!, v = phases[offset + p]!, h = heap[heapOffset + p]!;
      if (v > 0) record.phases[name] = v;
      if (record.heap && h) record.heap[name] = h;
    }
  }

  reset(): void {
    this.opened = false;
    for (const a of [this.sum, this.heapSum, this.max, this.hist, this.stepHist, this.worstMs]) a.fill(0);
    this.steps = this.heapSteps = this.slow = this.stepSum = this.stepMax = this.worstCount = 0;
  }

  snapshot(): StepCostSnapshot {
    const name = (p: number): StepPhase | "other" => p === OTHER ? "other" : STEP_PHASES[p]!;
    const quantile = (hist: Float64Array, offset: number, q: number, max: number): number => {
      const target = q * this.steps;
      let seen = 0;
      for (let b = 0; b < BUCKETS; b++) {
        seen += hist[offset + b]!;
        if (seen >= target && seen > 0) return Math.min(max, bucketTop(b));
      }
      return max;
    };
    const over = (offset: number, ms: number): number => {
      let n = 0;
      for (let b = bucketOf(ms) + 1; b < BUCKETS; b++) n += this.hist[offset + b]!;
      return n;
    };
    const phases: StepCostSnapshot["phases"] = {};
    for (let p = 0; p < COLUMNS; p++) {
      if (this.sum[p] === 0 && this.max[p] === 0) continue;
      phases[name(p)] = { mean: this.sum[p]! / this.steps, p99: quantile(this.hist, p * BUCKETS, 0.99, this.max[p]!), max: this.max[p]!,
        over1: over(p * BUCKETS, 1), over4: over(p * BUCKETS, 4),
        ...(this.heap ? { heap: this.heapSum[p]! / Math.max(1, this.heapSteps) } : {}) };
    }
    const order = [...Array(this.worstCount).keys()].sort((a, b) => this.worstMs[b]! - this.worstMs[a]!);
    const worst = order.map((row): StepRecord => {
      const record: StepRecord = { tick: this.worstTick[row]!, at: this.worstAt[row]!, ms: this.worstMs[row]!, phases: {} };
      if (this.heap) record.heap = {};
      this.fill(record, this.worstPhases, row * COLUMNS, this.worstHeap, row * COLUMNS);
      return record;
    });
    return {
      steps: this.steps, slow: this.slow, slowMs: this.slowMs,
      step: { mean: this.steps ? this.stepSum / this.steps : 0, p50: quantile(this.stepHist, 0, 0.5, this.stepMax),
        p99: quantile(this.stepHist, 0, 0.99, this.stepMax), p999: quantile(this.stepHist, 0, 0.999, this.stepMax), max: this.stepMax },
      phases, worst,
    };
  }
}
