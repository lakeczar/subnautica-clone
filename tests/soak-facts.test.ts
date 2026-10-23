import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The soak's one verdict (scripts/soak/facts.mjs): properties over random,
// append-only fact sequences, then the R6 reproductions at the reducer.
//   monotonicity: appending any fact never turns fail into partial or pass,
//     nor partial into pass (and pass/partial only exist once the run ended);
//   soundness: pass implies every rule was fully covered with no violation,
//     checked by an oracle written independently of the reducer.
const F = await import(pathToFileURL(resolve("scripts/soak/facts.mjs")).href);
const G = await import(pathToFileURL(resolve("scripts/soak/goals.mjs")).href);

/** A small seeded PRNG (mulberry32), so a failing case can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Fact = Record<string, unknown> & { t: string; at: number };
type Thresholds = { laps: number; memoryMetrics: string[]; graphicsMetrics: string[]; memoryGrowthPct: number; graphicsGrowthPct: number; autosaves: number; dayNightCycles: number;
  memoryFlatPct: number; leakMinWindowS: number; leakMiBPerHour: number; warmupS: number };
// Two dwell configurations, so warm-up and window boundaries vary.
const CONFIGS: { tour: Thresholds[]; dwell: Thresholds[] } = {
  tour: [{ ...G.DEFAULTS.tour, laps: 3 }],
  dwell: [{ ...G.DEFAULTS.dwell, autosaves: 3, warmupS: 0, leakMinWindowS: 300 }, { ...G.DEFAULTS.dwell, autosaves: 3, warmupS: 120, leakMinWindowS: 600 }],
};
const T = { tour: CONFIGS.tour[0]!, dwell: CONFIGS.dwell[0]! };
// Violations and gaps name any rule of either kind, or none of them (cross-kind IDs, R7-F1).
const ALL_RULES = [...new Set([...F.rulesOf("tour", T.tour), ...F.rulesOf("dwell", T.dwell), "made-up-rule"])] as string[];
const FRAME_RULES = { tour: ["streaming-frame", "loading-hold"], dwell: ["autosave-hitch"] };

// The oracle's own value domains and arithmetic: nothing from the reducer.
const isMem = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isSec = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const growthPct = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : b > a ? Infinity : 0);
/** Least squares by the closed sums (a different formula from the reducer's centred one), MiB per hour. */
function ownSlope(pts: [number, number][]) {
  const n = pts.length; let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const den = n * sxx - sx * sx;
  return den > 0 ? ((n * sxy - sx * sy) / den) * 3600 : 0;
}

/** Values: valid, invalid (outside the domain), or missing. */
function value(r: () => number, base: number): unknown {
  if (r() < 0.08) return [NaN, Infinity, -1, 0, "12", null, undefined][Math.floor(r() * 7)];
  return base;
}
function randomFacts(kind: "tour" | "dwell", r: () => number, n: number): Fact[] {
  const out: Fact[] = [];
  let at = 0, lap = 0, ended = false;
  // Per sequence: a memory drift (some leak, some don't) and a graphics growth per lap.
  const driftPerH = [0, 0, 10, 25, 45, 120][Math.floor(r() * 6)]!, gfxGrowth = [0, 0, 0.01, 0.03, 0.08][Math.floor(r() * 5)]!;
  const noise = (sd: number) => (r() - 0.5) * 2 * sd;
  const mem = (t: number) => ({ rendererRssMiB: value(r, 400 + (driftPerH * t) / 3600 + noise(kind === "dwell" ? 2 : 15)), gpuRssMiB: value(r, 230 + noise(2)), jsHeapAfterGcMiB: value(r, 90 + noise(1)) });
  const gfx = (l: number) => ({ meshes: r() < 0.9 ? Math.round(900 * (1 + gfxGrowth) ** (l - 1)) : [NaN, -1, 1.5, 0][Math.floor(r() * 4)], materials: 80, textures: 60, geometries: 700 });
  const anyRule = () => (r() < 0.5 ? (kind === "tour" ? ["streaming-frame", "loading-hold", "save-reload"] : ["autosave-hitch", "autosave", "save-reload"])[Math.floor(r() * 3)]! : ALL_RULES[Math.floor(r() * ALL_RULES.length)]!);
  const companion = (rule: string): Fact => (r() < 0.5 ? { t: "unavailable", rule, at, reason: "companion gap" } : { t: "recorded", rule, ms: 20 + r() * 40, limit: 33, at });
  if (kind === "dwell" && r() < 0.9) out.push({ t: "start", at }, { t: "daynight", at, cycles: r() < 0.7 ? 1 : 0 });
  for (let i = 0; i < n; i++) {
    // Time: mostly forward; sometimes backwards or infinite (invalid evidence).
    const step = r();
    at = step < 0.03 ? at - 50 - Math.round(r() * 300) : step < 0.04 ? Infinity : (Number.isFinite(at) ? at : 0) + Math.round(r() * 120);
    const x = r();
    if (x < 0.03) {
      // A violation, often with a gap or recording for the same rule before or after it.
      const rule = anyRule(), v: Fact = { t: "violation", rule, at, detail: "random violation" };
      if (r() < 0.5) out.push(r() < 0.5 ? companion(rule) : v, ...(r() < 0.5 ? [] : []));
      out.push(v);
      if (r() < 0.5) out.push(companion(rule));
    } else if (x < 0.25) out.push({ t: "covered", rule: r() < 0.9 ? FRAME_RULES[kind][Math.floor(r() * FRAME_RULES[kind].length)]! : anyRule(), at });
    else if (x < 0.31) out.push({ t: "unavailable", rule: anyRule(), at, reason: "random gap" });
    else if (x < 0.34) out.push({ t: "recorded", rule: anyRule(), ms: 20 + r() * 40, limit: 33, at });
    else if (x < 0.56) out.push(kind === "tour" ? { t: "lap", lap: ++lap, at, memory: mem(at), graphics: gfx(lap) } : { t: "sample", at, settled: r() < 0.7, memory: mem(Number.isFinite(at) ? at : 0), graphics: {} });
    else if (x < 0.7) out.push({ t: "autosave", at });
    else if (x < 0.78) out.push({ t: "save", at, ok: r() < 0.95 ? true : r() < 0.5 ? false : "yes", label: "s" });
    else if (x < 0.8) out.push({ t: r() < 0.5 ? "blocked" : "yielded", at, reason: "random" });
    else if (x < 0.83 && !ended) { out.push({ t: "end", at }); ended = true; }
    else if (x < 0.85) out.push({ t: "daynight", at, cycles: Math.floor(r() * 2) });
  }
  // A later positive reading after a backward step (R7-F2): flat, back, then 12% up.
  if (kind === "dwell" && r() < 0.15) {
    const t0 = (Number.isFinite(at) ? Math.max(at, 0) : 0) + 200, m = (v: number) => ({ rendererRssMiB: v, gpuRssMiB: 230, jsHeapAfterGcMiB: 90 });
    out.push({ t: "sample", at: t0, settled: true, memory: m(400), graphics: {} }, { t: "sample", at: t0 - 100, settled: true, memory: m(400), graphics: {} },
      { t: "sample", at: t0 + 300, settled: true, memory: m(448), graphics: {} });
  }
  if (!ended && r() < 0.7) out.push({ t: "end", at });
  // Facts on the far side of the end: a violation, a gap, a recording.
  const tail = r();
  if (tail < 0.15) out.push({ t: "violation", rule: anyRule(), at: 1e6, detail: "after the end" });
  else if (tail < 0.3) out.push(companion(anyRule()));
  return out;
}

const AMBIGUOUS = "ambiguous";
/** Whether the facts prove a failure, by the oracle's own reading (null: none; AMBIGUOUS: a value at its limit). */
function oracleFailure(kind: "tour" | "dwell", facts: Fact[], t: Thresholds): string | null {
  const explicit = facts.find((f) => f.t === "violation");
  if (explicit) return `explicit violation of ${explicit.rule}`;
  if (facts.some((f) => f.t === "save" && f.ok === false)) return "a save failed";
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
  let ambiguous = false;
  if (kind === "tour") {
    const laps = facts.filter((f) => f.t === "lap") as (Fact & { memory?: Record<string, unknown>; graphics?: Record<string, unknown> })[];
    for (const l of laps.slice(1)) {
      for (const m of t.memoryMetrics) {
        const a = laps[0]!.memory?.[m], b = l.memory?.[m];
        if (!isMem(a) || !isMem(b)) continue;
        const g = growthPct(a, b);
        if (near(g, t.memoryGrowthPct)) ambiguous = true; else if (g > t.memoryGrowthPct) return `memory growth ${m}`;
      }
      for (const m of t.graphicsMetrics) {
        const a = laps[0]!.graphics?.[m], b = l.graphics?.[m];
        if (!isCount(a) || !isCount(b)) continue;
        const g = growthPct(a, b);
        if (near(g, t.graphicsGrowthPct)) ambiguous = true; else if (g > t.graphicsGrowthPct) return `graphics growth ${m}`;
      }
    }
    return ambiguous ? AMBIGUOUS : null;
  }
  const start = facts.find((f) => f.t === "start");
  if (!start) return null;
  const from = start.at + t.warmupS;
  const settled = facts.filter((f) => f.t === "sample" && f.settled && isSec(f.at) && f.at >= from) as (Fact & { memory?: Record<string, unknown> })[];
  for (const m of t.memoryMetrics) {
    const xs = settled.filter((f) => isMem(f.memory?.[m])).map((f) => [f.at, f.memory![m] as number] as [number, number]);
    // Flatness: every valid reading against the first, whatever the times.
    for (const [, v] of xs.slice(1)) {
      const g = Math.abs(growthPct(xs[0]![1], v));
      if (near(g, t.memoryFlatPct)) ambiguous = true; else if (g > t.memoryFlatPct) return `memory not flat ${m}`;
    }
    // Leak: every prefix spanning the window, up to the first backward time.
    for (let i = 2; i < xs.length; i++) {
      if (xs[i]![0] < xs[i - 1]![0]) break;
      if (xs[i]![0] - xs[0]![0] < t.leakMinWindowS) continue;
      const slope = ownSlope(xs.slice(0, i + 1));
      if (near(slope, t.leakMiBPerHour)) ambiguous = true; else if (slope > t.leakMiBPerHour) return `leak ${m}`;
    }
  }
  return ambiguous ? AMBIGUOUS : null;
}

/** What a pass must mean, from the raw facts (independent of the reducer). */
function oracleAllowsPass(kind: "tour" | "dwell", facts: Fact[], t: Thresholds): string | null {
  const e = facts.findIndex((f) => f.t === "end");
  if (e < 0) return "no end";
  const failure = oracleFailure(kind, facts, t);
  if (failure && failure !== AMBIGUOUS) return failure;
  const pre = facts.slice(0, e + 1);
  if (pre.some((f) => f.t === "unavailable" || f.t === "recorded" || f.t === "blocked" || f.t === "yielded")) return "a gap before the end";
  if (!pre.some((f) => f.t === "save")) return "no save checked";
  if (pre.some((f) => f.t === "save" && f.ok !== true)) return "a save without a valid result";
  for (const rule of FRAME_RULES[kind]) if (!pre.some((x) => x.t === "covered" && x.rule === rule)) return `${rule} never covered`;
  if (kind === "tour") {
    const laps = pre.filter((f) => f.t === "lap") as (Fact & { memory?: Record<string, unknown>; graphics?: Record<string, unknown> })[];
    if (laps.length < t.laps) return "too few laps";
    for (const m of t.memoryMetrics) if (!isMem(laps[0]!.memory?.[m]) || !isMem(laps.at(-1)!.memory?.[m])) return `${m} unmeasured`;
    for (const m of t.graphicsMetrics) if (!isCount(laps[0]!.graphics?.[m]) || !isCount(laps.at(-1)!.graphics?.[m])) return `${m} uncounted`;
    return null;
  }
  const start = pre.find((f) => f.t === "start");
  if (!start) return "never arrived";
  if (pre.filter((f) => f.t === "autosave").length < t.autosaves) return "too few autosaves";
  const dn = pre.filter((f) => f.t === "daynight").at(-1);
  if (!dn || (dn.cycles as number) < t.dayNightCycles) return "no day–night";
  // Settled samples after the warm-up (a sample whose time is invalid can't be placed, so it counts against the series).
  const from = start.at + t.warmupS;
  const post = pre.filter((f) => f.t === "sample" && f.settled && !(isSec(f.at) && f.at < from)) as (Fact & { memory?: Record<string, unknown> })[];
  for (let i = 0; i < post.length; i++) if (!isSec(post[i]!.at) || (i > 0 && post[i]!.at < post[i - 1]!.at)) return "times not monotonic";
  for (const m of t.memoryMetrics) {
    const xs = post.filter((f) => isMem(f.memory?.[m]));
    if (xs.length < 3) return `${m}: too few settled samples`;
    if (xs.at(-1)!.at - xs[0]!.at < t.leakMinWindowS) return `${m}: the window is not spanned`;
  }
  return null;
}

for (const kind of ["tour", "dwell"] as const) {
  test(`property (${kind}): fail exactly when the facts prove a failure (any explicit violation, whatever its companions; or a derived one); fail and partial never improve; pass is sound`, () => {
    let passes = 0, fails = 0, partials = 0, checked = 0;
    const derived = new Map<string, number>();
    for (const [ci, t] of CONFIGS[kind].entries()) {
      for (let seed = 1; seed <= 1500; seed++) {
        const r = rng(seed * 7919 + (kind === "tour" ? 1 : 2) + ci * 104729);
        const facts = randomFacts(kind, r, 5 + Math.floor(r() * 35));
        let prev: string | null = null;
        for (let i = 1; i <= facts.length; i++) {
          const prefix = facts.slice(0, i);
          const v = F.verdict(prefix, kind, t, { judged: true });
          const st = v.status, at = `config ${ci}, seed ${seed}, fact ${i}`;
          // Violation dominance: an explicit violation fails at every prefix that holds it.
          if (prefix.some((f) => f.t === "violation")) assert.equal(st, "fail", `${at}: a violation, yet ${st}: ${JSON.stringify(v.rules.filter((x: { status: string }) => x.status !== "pass"))}`);
          const why = oracleFailure(kind, prefix, t);
          if (why !== AMBIGUOUS) {
            checked++;
            assert.equal(st === "fail", why != null, `${at}: ${st}, oracle ${why}; ${JSON.stringify(v.broken)}`);
            if (st === "fail" && !why!.startsWith("explicit")) derived.set(why!.split(" ").slice(0, 2).join(" "), (derived.get(why!.split(" ").slice(0, 2).join(" ")) ?? 0) + 1);
          }
          if (prev === "fail") assert.equal(st, "fail", `${at}: fail → ${st}`);
          if (prev === "partial") assert.notEqual(st, "pass", `${at}: partial → pass`);
          if (!prefix.some((f) => f.t === "end")) assert.ok(st === "fail" || st === "running", `${at}: ${st} before the end`);
          if (st === "pass") assert.equal(oracleAllowsPass(kind, prefix, t), null, `${at}: pass, but ${oracleAllowsPass(kind, prefix, t)}: ${JSON.stringify(prefix)}`);
          prev = st;
        }
        if (prev === "pass") passes++; else if (prev === "fail") fails++; else if (prev === "partial") partials++;
      }
    }
    // The generators reach every outcome and every derived failure (otherwise the properties prove little).
    assert.ok(fails > 50 && partials > 15, `fails ${fails}, partials ${partials}, passes ${passes}`);
    const needed = kind === "tour" ? ["memory growth", "graphics growth", "a save"] : ["memory not", "leak rendererRssMiB", "a save"];
    for (const k of needed) assert.ok([...derived.keys()].some((d) => d.startsWith(k.split(" ")[0]!) && d.includes(k.split(" ")[1]!)), `no derived "${k}" failure reached: ${JSON.stringify([...derived])}`);
    assert.ok(checked > 10_000, `${checked} prefixes checked`);
  });
}

test("property: a generator biased towards clean tours reaches pass, every pass is sound, and graphics growth or a late violation fails", () => {
  let passes = 0, grown = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed);
    const at = (i: number) => i * 100;
    const growth = r() < 0.3 ? 0.02 + r() * 0.1 : 0; // a graphics leak per lap, in a third of runs
    const facts: Fact[] = [];
    for (let l = 1; l <= 3; l++) facts.push({ t: "lap", lap: l, at: at(l), memory: { rendererRssMiB: 400 + r(), gpuRssMiB: 230, jsHeapAfterGcMiB: 90 }, graphics: { meshes: Math.round(900 * (1 + growth) ** (l - 1)), materials: 80, textures: 60, geometries: 700 } });
    facts.push({ t: "covered", rule: "streaming-frame", at: at(4) }, { t: "covered", rule: "loading-hold", at: at(4) }, { t: "save", ok: true, at: at(4) });
    if (r() < 0.3) facts.splice(Math.floor(r() * facts.length), 0, { t: "unavailable", rule: r() < 0.5 ? "loading-hold" : "autosave-hitch", at: 1, reason: "gap" });
    facts.push({ t: "end", at: at(5) });
    const v = F.verdict(facts, "tour", T.tour, { judged: true });
    const why = oracleFailure("tour", facts, T.tour);
    if (why === AMBIGUOUS) continue;
    assert.equal(v.status === "fail", why != null, `seed ${seed}: ${v.status}, oracle ${why}`);
    if (why) grown++;
    else if (v.status === "pass") { passes++; assert.equal(oracleAllowsPass("tour", facts, T.tour), null); }
    else assert.equal(v.status, "partial");
    const late = F.verdict([...facts, { t: "violation", rule: "loading-hold", at: at(6), detail: "after the end" }, { t: "unavailable", rule: "loading-hold", at: at(6), reason: "a companion" }], "tour", T.tour, { judged: true });
    assert.equal(late.status, "fail", "a violation after the end still fails, whatever comes with it");
  }
  assert.ok(passes > 100 && grown > 50, `${passes} passes, ${grown} graphics failures`);
});

test("property: a generator biased towards clean dwells reaches pass, every pass is sound, and a slow leak inside the flat band fails", () => {
  let passes = 0, leaks = 0;
  for (const [ci, t] of CONFIGS.dwell.entries()) {
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed + 10_000 + ci * 7);
      // A leak within the flat band in a third of runs: 40–90 MiB/h, under 5% over the series.
      const drift = r() < 0.3 ? 40 + r() * 50 : 0, step = 60 + Math.round(r() * 60);
      const facts: Fact[] = [{ t: "start", at: 0 }, { t: "daynight", at: 0, cycles: 1 }];
      for (let i = 0; i <= Math.ceil((t.warmupS + t.leakMinWindowS) / step) + 1; i++) {
        const s = i * step;
        facts.push({ t: "sample", at: s, settled: true, memory: { rendererRssMiB: 400 + r() + (drift * s) / 3600, gpuRssMiB: 230 + r(), jsHeapAfterGcMiB: 90 + r() / 2 }, graphics: {} });
      }
      for (let i = 0; i < 3; i++) facts.push({ t: "autosave", at: 100 + i }, { t: "covered", rule: "autosave-hitch", at: 100 + i });
      facts.push({ t: "save", ok: true, at: 900 });
      if (r() < 0.3) facts.splice(2 + Math.floor(r() * (facts.length - 2)), 0, { t: "unavailable", rule: "autosave-hitch", at: 1, reason: "gap" });
      facts.push({ t: "end", at: 901 });
      const v = F.verdict(facts, "dwell", t, { judged: true });
      const why = oracleFailure("dwell", facts, t);
      if (why === AMBIGUOUS) continue;
      assert.equal(v.status === "fail", why != null, `config ${ci}, seed ${seed}: ${v.status}, oracle ${why}`);
      if (why?.startsWith("leak")) leaks++;
      if (!why && v.status === "pass") { passes++; assert.equal(oracleAllowsPass("dwell", facts, t), null); }
      else if (!why) assert.equal(v.status, "partial", JSON.stringify(v.rules));
    }
  }
  assert.ok(passes > 200 && leaks > 50, `${passes} passes, ${leaks} leak failures`);
});

test("R7-F1: a gap or recording for a rule never keeps its violation from failing: both orders, listed and unlisted, before and after the end", () => {
  const v = (rule: string, at = 1): Fact => ({ t: "violation", rule, at, detail: "measured" });
  const gap = (rule: string, at = 2): Fact => ({ t: "unavailable", rule, at, reason: "unknown companion" });
  const rec = (rule: string, at = 2): Fact => ({ t: "recorded", rule, ms: 50, limit: 33, at });
  for (const kind of ["tour", "dwell"] as const) {
    for (const rule of ["loading-hold", "autosave-hitch", "streaming-frame", "made-up-rule"]) {
      for (const companion of [gap(rule), rec(rule)]) {
        for (const facts of [[v(rule), companion], [companion, v(rule)], [companion, { t: "end", at: 3 }, v(rule, 4)], [v(rule), { t: "end", at: 3 }, companion]]) {
          const r = F.verdict(facts, kind, T[kind], { judged: true });
          assert.equal(r.status, "fail", `${kind} ${rule} ${facts.map((f) => f.t).join(",")}: ${r.status}`);
          assert.ok(r.broken.includes(rule), `${kind} ${rule}: broken ${r.broken}`);
        }
      }
    }
  }
  // The reviewer's case: an ended, otherwise complete dwell with a hold gap, then a late hold.
  const s = (at: number): Fact => ({ t: "sample", at, settled: true, memory: { rendererRssMiB: 1000, gpuRssMiB: 400, jsHeapAfterGcMiB: 120 }, graphics: {} });
  const ready: Fact[] = [{ t: "start", at: 0 }, s(60), s(360), s(660), ...Array.from({ length: 20 }, (_, i) => ({ t: "autosave", at: 30 + i * 30 })),
    { t: "covered", at: 660, rule: "autosave-hitch" }, { t: "daynight", at: 660, cycles: 1 }, { t: "save", at: 660, ok: true }, gap("loading-hold"), { t: "end", at: 661 }];
  assert.equal(F.verdict(ready, "dwell", G.DEFAULTS.dwell).status, "partial");
  const late = F.verdict([...ready, v("loading-hold", 662)], "dwell", G.DEFAULTS.dwell);
  assert.deepEqual([late.status, late.broken], ["fail", ["loading-hold"]]);
});

test("R7-F2: after a backward timestamp, a later valid reading still proves a flatness failure; the trend stays unproven", () => {
  const memory = (v: number) => ({ rendererRssMiB: v, gpuRssMiB: 400, jsHeapAfterGcMiB: 120 });
  const run = { samples: [[60, 1000], [360, 1000], [300, 1000], [660, 1100]].map(([at, rss]) => ({ at, memory: memory(rss!), afterGc: true })),
    autosaves: Array.from({ length: 20 }, (_, i) => ({ at: 30 + i * 30, frameMs: 16, complete: true })), saves: [{ ok: true }], frames: { judged: true }, dayNight: { available: true, cycles: 1 }, now: 660 };
  const r = G.evaluateDwell(run);
  assert.equal(r.status, "fail", JSON.stringify(r.rules));
  assert.ok(r.broken.includes("memory-flat:rendererRssMiB"));
  assert.match(r.rules.find((x: { id: string }) => x.id === "memory-flat:rendererRssMiB").detail, /1000 MiB, 1100 MiB at 660 s \(10%\)/);
  assert.equal(r.rules.find((x: { id: string }) => x.id === "leak:rendererRssMiB").status, "unavailable", "the trend needs monotonic times");
  // With the series flat, nothing fails, and the broken window keeps the goal open.
  const flat = G.evaluateDwell({ ...run, samples: run.samples.map((x) => ({ ...x, memory: memory(1000) })) });
  assert.deepEqual([flat.status, flat.broken], ["running", []], "no window over monotonic times: the goal isn't reached");
});

test("R6-F1 (reducer): a periodic sample's leak failure stays failed when a later terminal sample is flat", () => {
  const t = { ...G.DEFAULTS.dwell, warmupS: 0, autosaves: 2 };
  const s = (at: number, v: number) => ({ t: "sample", at, settled: true, memory: { rendererRssMiB: v, gpuRssMiB: 230, jsHeapAfterGcMiB: 90 }, graphics: {} });
  const facts: Fact[] = [{ t: "start", at: 0 }, s(0, 1000), s(300, 1000), s(600, 1000), s(900, 1000), s(1200, 1018)];
  const failed = F.verdict(facts, "dwell", t, { judged: true });
  assert.equal(failed.status, "fail");
  assert.match(failed.reason, /leak:rendererRssMiB: trend 43\.2 MiB\/h over 20 min, 5 settled samples/);
  const after = F.verdict([...facts, s(1200, 1000), { t: "autosave", at: 1201 }, { t: "autosave", at: 1202 }, { t: "save", ok: true, at: 1203 }, { t: "end", at: 1204 }], "dwell", t, { judged: true });
  assert.equal(after.status, "fail", "the terminal sample can't erase it");
  assert.equal(after.broken[0], "leak:rendererRssMiB");
});
