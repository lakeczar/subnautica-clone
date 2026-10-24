/** Natural cycles: deterministic schedules keyed to the saved simulation tick.
 * A cycle is a closed loop of phases. A held phase keeps one 0..1 level; a ramp
 * (no `level`) runs linearly from the previous phase's level to the next one's.
 * The level drives whatever the content attaches to it: a current's strength,
 * a hazard's intensity, a bloom's yield or a migrating animal's position.
 *
 * Nothing here is saved. Every value is a pure function of `tick`, so a cycle
 * resumes exactly from a save and never depends on frame rate. */

/** The fixed step runs at 60 Hz (sim/clock.ts FIXED_SECONDS = 1/60). Seconds
 * are `tick / 60`, the same arithmetic S4's hazard clock uses, so migrated
 * cycles agree with it bit for bit. */
export const TICKS_PER_SECOND = 60;
export const secondsAt = (tick: number): number => tick / TICKS_PER_SECOND;

/** Shortest authored phase. Longer than a tick, so a watcher sees every phase. */
export const MIN_PHASE_SECONDS = 0.5;

export interface CyclePhase {
  readonly id: string;
  readonly seconds: number;
  /** Level held through the phase, 0..1. Omit it for a linear ramp between
   * the neighbouring held phases. */
  readonly level?: number;
  /** Journal wording, e.g. "venting" or "lull". */
  readonly label: string;
}
/** A readable cue shown `leadS` seconds before `phase` begins. */
export interface CycleWarning {
  readonly phase: string;
  readonly leadS: number;
  readonly cue: string;
}
export interface CycleDef {
  readonly id: string;
  readonly label: string;
  /** Seconds after tick 0 at which phase 0 begins; any real, it wraps. */
  readonly offset: number;
  readonly phases: readonly CyclePhase[];
  readonly warnings?: readonly CycleWarning[];
}

/** Derived, never saved. */
export interface CycleSample {
  readonly phase: string;
  readonly index: number;
  /** Seconds since the phase began, and until it ends. */
  readonly elapsed: number;
  readonly remaining: number;
  /** 0..1. */
  readonly level: number;
  /** Seconds into the period. */
  readonly t: number;
  /** Whole periods since tick 0's period (negative before `offset`). */
  readonly round: number;
  /** Warnings whose lead window is open now, soonest first. */
  readonly warnings: readonly { readonly phase: string; readonly cue: string; readonly inS: number }[];
}

export const period = (c: CycleDef): number => c.phases.reduce((n, p) => n + p.seconds, 0);

/** Start of each phase within the period. */
function starts(c: CycleDef): number[] {
  const out: number[] = [];
  let at = 0;
  for (const p of c.phases) { out.push(at); at += p.seconds; }
  return out;
}

/** Seconds into the period: `((s - offset) % P + P) % P`, S4's arithmetic. */
export function cycleTime(c: CycleDef, seconds: number): number {
  const P = period(c);
  return (((seconds - c.offset) % P) + P) % P;
}

const heldLevel = (c: CycleDef, i: number): number => {
  const n = c.phases.length, p = c.phases[((i % n) + n) % n]!;
  if (p.level === undefined) throw new Error(`${c.id}: ramp ${p.id} must sit between held phases`);
  return p.level;
};

function phaseAt(c: CycleDef, t: number): { index: number; start: number } {
  const s = starts(c);
  let index = 0;
  for (let i = 1; i < s.length; i++) if (t >= s[i]!) index = i;
  return { index, start: s[index]! };
}

function levelIn(c: CycleDef, index: number, start: number, t: number): number {
  const p = c.phases[index]!;
  if (p.level !== undefined) return p.level;
  const from = heldLevel(c, index - 1), to = heldLevel(c, index + 1);
  return from + (to - from) * (t - start) / p.seconds;
}

/** 0..1 level at a point in time. */
export function cycleLevel(c: CycleDef, seconds: number): number {
  const t = cycleTime(c, seconds), { index, start } = phaseAt(c, t);
  return levelIn(c, index, start, t);
}

/** Seconds until `phase` next begins; 0 while it is under way. */
export function secondsUntil(c: CycleDef, seconds: number, phase: string): number {
  const target = c.phases.findIndex(p => p.id === phase);
  if (target < 0) throw new RangeError(`${c.id} has no phase ${phase}`);
  const t = cycleTime(c, seconds), { index } = phaseAt(c, t);
  if (index === target) return 0;
  const wait = starts(c)[target]! - t;
  return wait > 0 ? wait : wait + period(c);
}

export function sampleCycle(c: CycleDef, seconds: number): CycleSample {
  const t = cycleTime(c, seconds), { index, start } = phaseAt(c, t), p = c.phases[index]!;
  const warnings = [];
  for (const w of c.warnings ?? []) {
    const inS = secondsUntil(c, seconds, w.phase);
    if (inS > 0 && inS <= w.leadS) warnings.push({ phase: w.phase, cue: w.cue, inS });
  }
  warnings.sort((a, b) => a.inS - b.inS);
  return {
    phase: p.id, index, elapsed: t - start, remaining: start + p.seconds - t, level: levelIn(c, index, start, t), t,
    // From the same remainder as `t`, so a period boundary never disagrees with it.
    round: Math.round((seconds - c.offset - t) / period(c)) || 0, warnings,
  };
}
export const sampleCycleAt = (c: CycleDef, tick: number): CycleSample => sampleCycle(c, secondsAt(tick));

/** Problems with an authored cycle; empty when it is sound. */
export function cycleProblems(c: CycleDef): string[] {
  const out: string[] = [], ids = new Set<string>();
  if (!c.phases.length) return [`${c.id}: no phases`];
  if (!Number.isFinite(c.offset)) out.push(`${c.id}: offset must be finite`);
  c.phases.forEach((p, i) => {
    if (ids.has(p.id)) out.push(`${c.id}: duplicate phase ${p.id}`);
    ids.add(p.id);
    if (!Number.isFinite(p.seconds) || p.seconds < MIN_PHASE_SECONDS) out.push(`${c.id}.${p.id}: phase shorter than ${MIN_PHASE_SECONDS} s`);
    if (p.level !== undefined && !(p.level >= 0 && p.level <= 1)) out.push(`${c.id}.${p.id}: level outside 0..1`);
    if (p.level === undefined) {
      const n = c.phases.length, prev = c.phases[(i - 1 + n) % n]!, next = c.phases[(i + 1) % n]!;
      if (n < 3 || prev.level === undefined || next.level === undefined) out.push(`${c.id}.${p.id}: a ramp needs held phases on both sides`);
    }
  });
  for (const w of c.warnings ?? []) {
    if (!ids.has(w.phase)) out.push(`${c.id}: warning for unknown phase ${w.phase}`);
    if (!(w.leadS > 0 && w.leadS < period(c))) out.push(`${c.id}: warning lead for ${w.phase} must be inside the period`);
    if (!w.cue.trim()) out.push(`${c.id}: warning for ${w.phase} has no cue`);
  }
  return out;
}

/** Open and closed stretches over one period, measured tick by tick from the
 * same function the simulation uses. `open` decides per tick. Returns the
 * longest closed stretch (the longest a player arriving at the worst moment
 * would wait) and the shortest open window, in seconds. */
export function windows(c: CycleDef, open: (sample: CycleSample) => boolean): { longestClosed: number; shortestOpen: number; openFraction: number } {
  const ticks = Math.round(period(c) * TICKS_PER_SECOND), origin = Math.ceil(c.offset * TICKS_PER_SECOND);
  const states: boolean[] = [];
  for (let i = 0; i < ticks; i++) states.push(open(sampleCycleAt(c, origin + i)));
  const opened = states.filter(Boolean).length;
  if (opened === 0) return { longestClosed: Infinity, shortestOpen: 0, openFraction: 0 };
  if (opened === ticks) return { longestClosed: 0, shortestOpen: Infinity, openFraction: 1 };
  // Rotate so the loop starts at an open→closed edge; then runs never wrap.
  const edge = states.findIndex((s, i) => !s && states[(i - 1 + ticks) % ticks]);
  const run = [...states.slice(edge), ...states.slice(0, edge)];
  let longestClosed = 0, shortestOpen = Infinity, i = 0;
  while (i < ticks) {
    let j = i;
    while (j < ticks && run[j] === run[i]) j++;
    const s = (j - i) / TICKS_PER_SECOND;
    if (run[i]) shortestOpen = Math.min(shortestOpen, s); else longestClosed = Math.max(longestClosed, s);
    i = j;
  }
  return { longestClosed, shortestOpen, openFraction: opened / ticks };
}

/** S4's `HazardCycle` (content/ecology/hazards.ts): active for `duration`
 * seconds from `start`, ramping over `ramp` seconds on each side. As phases:
 * active (1), fall, quiet (0), rise. The ramps straddle the period edges the
 * same way S4's trapezoid does, so `cycleLevel` matches S4's exactly. */
export interface HazardCycleShape { readonly period: number; readonly start: number; readonly duration: number; readonly ramp: number }
export function fromHazardCycle(id: string, label: string, h: HazardCycleShape,
  words: { active: string; quiet: string; rise?: string; fall?: string }, warnings?: readonly CycleWarning[]): CycleDef {
  const quiet = h.period - h.duration - 2 * h.ramp;
  if (!(quiet >= MIN_PHASE_SECONDS)) throw new RangeError(`${id}: no quiet window`);
  const phases: CyclePhase[] = h.ramp > 0
    ? [
      { id: "active", seconds: h.duration, level: 1, label: words.active },
      { id: "fall", seconds: h.ramp, label: words.fall ?? "easing" },
      { id: "quiet", seconds: quiet, level: 0, label: words.quiet },
      { id: "rise", seconds: h.ramp, label: words.rise ?? "building" },
    ]
    : [
      { id: "active", seconds: h.duration, level: 1, label: words.active },
      { id: "quiet", seconds: quiet, level: 0, label: words.quiet },
    ];
  return { id, label, offset: h.start, phases, ...(warnings ? { warnings } : {}) };
}
