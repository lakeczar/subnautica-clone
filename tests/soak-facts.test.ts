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
const T = { tour: { ...G.DEFAULTS.tour, laps: 3 }, dwell: { ...G.DEFAULTS.dwell, autosaves: 3, warmupS: 0, leakMinWindowS: 300 } };
const RULES = { tour: ["streaming-frame", "loading-hold", "save-reload", "renderer", "providers"], dwell: ["autosave-hitch", "save-reload", "renderer", "providers", "autosave"] };

/** Values: valid, invalid (outside the domain), or missing. */
function value(r: () => number, base: number, swing = 0.2): unknown {
  const x = r();
  if (x < 0.08) return [NaN, Infinity, -1, 0, "12", null, undefined][Math.floor(r() * 7)];
  return base * (1 + (r() - 0.45) * (r() < swing ? 0.3 : 0.02));
}
function randomFacts(kind: "tour" | "dwell", r: () => number, n: number): Fact[] {
  const out: Fact[] = [];
  let at = 0, lap = 0, ended = false;
  const swing = kind === "dwell" ? 0.03 : 0.2; // dwell judges every settled sample against the first
  const mem = () => ({ rendererRssMiB: value(r, 400, swing), gpuRssMiB: value(r, 230, swing), jsHeapAfterGcMiB: value(r, 90, swing) });
  const gfx = () => ({ meshes: r() < 0.9 ? Math.round(900 * (1 + (r() - 0.5) * 0.04)) : [NaN, -1, 1.5][Math.floor(r() * 3)], materials: 80, textures: 60, geometries: 700 });
  if (kind === "dwell" && r() < 0.9) out.push({ t: "start", at }, { t: "daynight", at, cycles: r() < 0.7 ? 1 : 0 });
  for (let i = 0; i < n; i++) {
    // Time: mostly forward; sometimes backwards or infinite (invalid evidence).
    at += r() < 0.03 ? -50 : r() < 0.01 ? Infinity : Math.round(r() * 120);
    const x = r();
    const rule = RULES[kind][Math.floor(r() * RULES[kind].length)];
    if (x < 0.02) out.push({ t: "violation", rule, at, detail: "random violation" });
    else if (x < 0.25) out.push({ t: "covered", rule, at });
    else if (x < 0.32) out.push({ t: "unavailable", rule, at, reason: "random gap" });
    else if (x < 0.35) out.push({ t: "recorded", rule: kind === "tour" ? "streaming-frame" : "autosave-hitch", ms: 20 + r() * 40, limit: 33, at });
    else if (x < 0.55) out.push(kind === "tour" ? { t: "lap", lap: ++lap, at, memory: mem(), graphics: gfx() } : { t: "sample", at, settled: r() < 0.7, memory: mem(), graphics: gfx() });
    else if (x < 0.7) out.push({ t: "autosave", at });
    else if (x < 0.78) out.push({ t: "save", at, ok: r() < 0.95, label: "s" });
    else if (x < 0.8) out.push({ t: r() < 0.5 ? "blocked" : "yielded", at, reason: "random" });
    else if (x < 0.83 && !ended) { out.push({ t: "end", at }); ended = true; }
    else if (x < 0.85) out.push({ t: "daynight", at, cycles: Math.floor(r() * 2) });
  }
  if (!ended && r() < 0.7) out.push({ t: "end", at });
  if (r() < 0.15) out.push({ t: "violation", rule: RULES[kind][0], at: at + 1, detail: "at the very end" });
  return out;
}

type Thresholds = { laps: number; memoryMetrics: string[]; graphicsMetrics: string[]; memoryGrowthPct: number; autosaves: number; dayNightCycles: number; memoryFlatPct: number; leakMinWindowS: number; leakMiBPerHour: number };
/** The independent oracle: what a pass must mean, from the raw facts. */
function oracleAllowsPass(kind: "tour" | "dwell", facts: Fact[], t: Thresholds): string | null {
  const e = facts.findIndex((f) => f.t === "end");
  if (e < 0) return "no end";
  const pre = facts.slice(0, e + 1);
  if (facts.some((f) => f.t === "violation")) return "a violation exists";
  if (pre.some((f) => f.t === "unavailable" || f.t === "recorded" || f.t === "blocked" || f.t === "yielded")) return "a gap before the end";
  if (!pre.some((f) => f.t === "save")) return "no save checked";
  if (pre.some((f) => f.t === "save" && !f.ok)) return "a failed save";
  const num = (v: unknown, z = false) => typeof v === "number" && Number.isFinite(v) && (z ? v >= 0 : v > 0);
  if (kind === "tour") {
    const laps = pre.filter((f) => f.t === "lap");
    if (laps.length < t.laps) return "too few laps";
    for (const f of ["streaming-frame", "loading-hold"]) if (!pre.some((x) => x.t === "covered" && x.rule === f)) return `${f} never covered`;
    type Lap = Fact & { memory: Record<string, unknown>; graphics: Record<string, unknown> };
    const all = facts.filter((f) => f.t === "lap") as Lap[], ls = laps as Lap[];
    for (const m of t.memoryMetrics) {
      if (!num(ls[0]!.memory?.[m]) || !num(ls.at(-1)!.memory?.[m])) return `${m} unmeasured`;
      for (const l of all.slice(1)) if (num(all[0]!.memory?.[m]) && num(l.memory?.[m]) && ((l.memory[m] as number) - (all[0]!.memory[m] as number)) / (all[0]!.memory[m] as number) * 100 > t.memoryGrowthPct) return `${m} grew`;
    }
    for (const m of t.graphicsMetrics) {
      const ok = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
      if (!ok(ls[0]!.graphics?.[m]) || !ok(ls.at(-1)!.graphics?.[m])) return `${m} uncounted`;
    }
  } else {
    const start = pre.find((f) => f.t === "start");
    if (!start) return "never arrived";
    if (pre.filter((f) => f.t === "autosave").length < t.autosaves) return "too few autosaves";
    if (!pre.some((x) => x.t === "covered" && x.rule === "autosave-hitch")) return "hitch never covered";
    if (!pre.some((x) => x.t === "daynight" && (x.cycles as number) >= t.dayNightCycles)) return "no day–night";
    const settled = facts.filter((f) => f.t === "sample" && f.settled) as (Fact & { memory: Record<string, unknown> })[];
    for (let i = 1; i < settled.length; i++) if (!(settled[i]!.at >= settled[i - 1]!.at) || !Number.isFinite(settled[i]!.at)) return "times not monotonic";
    for (const m of t.memoryMetrics) {
      const xs = settled.filter((f) => num(f.memory?.[m]));
      if (xs.length < 3) return `${m}: too few settled samples`;
      for (const x of xs) if (Math.abs(((x.memory[m] as number) - (xs[0]!.memory[m] as number)) / (xs[0]!.memory[m] as number) * 100) > t.memoryFlatPct) return `${m} not flat`;
      for (let i = 2; i < xs.length; i++) {
        const pts = xs.slice(0, i + 1).map((x) => [x.at, x.memory[m] as number] as [number, number]);
        if (pts.at(-1)![0] - pts[0]![0] >= t.leakMinWindowS && F.slopePerHour(pts) > t.leakMiBPerHour) return `${m} leaks`;
      }
    }
  }
  return null;
}

for (const kind of ["tour", "dwell"] as const) {
  test(`property (${kind}): appending a fact never turns fail into partial or pass, nor partial into pass; pass is sound`, () => {
    let passes = 0, fails = 0, partials = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const r = rng(seed * 7919 + (kind === "tour" ? 1 : 2));
      const facts = randomFacts(kind, r, 5 + Math.floor(r() * 35));
      let prev: string | null = null;
      for (let i = 1; i <= facts.length; i++) {
        const prefix = facts.slice(0, i);
        const v = F.verdict(prefix, kind, T[kind], { judged: true });
        const st = v.status;
        if (prev === "fail") assert.equal(st, "fail", `seed ${seed}, fact ${i}: fail → ${st}`);
        if (prev === "partial") assert.notEqual(st, "pass", `seed ${seed}, fact ${i}: partial → pass`);
        if (!prefix.some((f) => f.t === "end")) assert.ok(st === "fail" || st === "running", `seed ${seed}: ${st} before the end`);
        if (st === "pass") {
          const why = oracleAllowsPass(kind, prefix, T[kind] as never);
          assert.equal(why, null, `seed ${seed}, fact ${i}: pass, but ${why}; gaps ${JSON.stringify(prefix.filter((f) => ["unavailable", "recorded", "blocked", "yielded"].includes(f.t)))}`);
        }
        prev = st;
      }
      if (prev === "pass") passes++; else if (prev === "fail") fails++; else if (prev === "partial") partials++;
    }
    // The generator reaches every outcome (otherwise the properties prove little).
    assert.ok(fails > 50 && partials > 15, `fails ${fails}, partials ${partials}, passes ${passes}`);
  });
}

test("property: a generator biased towards clean runs reaches pass, and every pass is sound", () => {
  let passes = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed);
    const at = (i: number) => i * 100;
    const facts: Fact[] = [];
    for (let l = 1; l <= 3; l++) facts.push({ t: "lap", lap: l, at: at(l), memory: { rendererRssMiB: 400 + r(), gpuRssMiB: 230, jsHeapAfterGcMiB: 90 }, graphics: { meshes: 900, materials: 80, textures: 60, geometries: 700 } });
    facts.push({ t: "covered", rule: "streaming-frame", at: at(4) }, { t: "covered", rule: "loading-hold", at: at(4) }, { t: "save", ok: true, at: at(4) });
    if (r() < 0.3) facts.splice(Math.floor(r() * facts.length), 0, { t: "unavailable", rule: "loading-hold", at: 1, reason: "gap" });
    facts.push({ t: "end", at: at(5) });
    const v = F.verdict(facts, "tour", T.tour, { judged: true });
    if (v.status === "pass") { passes++; assert.equal(oracleAllowsPass("tour", facts, T.tour as never), null); }
    else assert.equal(v.status, "partial");
    const late = F.verdict([...facts, { t: "violation", rule: "loading-hold", at: at(6), detail: "after the end" }], "tour", T.tour, { judged: true });
    assert.equal(late.status, "fail", "a violation after the end still fails");
  }
  assert.ok(passes > 100, `${passes} passes`);
});

test("property: a generator biased towards clean dwells reaches pass, and every pass is sound", () => {
  let passes = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed + 10_000);
    const facts: Fact[] = [{ t: "start", at: 0 }, { t: "daynight", at: 0, cycles: 1 }];
    for (let i = 0; i <= 6; i++) facts.push({ t: "sample", at: i * 60, settled: true, memory: { rendererRssMiB: 400 + r(), gpuRssMiB: 230 + r(), jsHeapAfterGcMiB: 90 + r() / 2 }, graphics: {} });
    for (let i = 0; i < 3; i++) facts.push({ t: "autosave", at: 100 + i }, { t: "covered", rule: "autosave-hitch", at: 100 + i });
    facts.push({ t: "save", ok: true, at: 400 });
    if (r() < 0.3) facts.splice(2 + Math.floor(r() * (facts.length - 2)), 0, { t: "unavailable", rule: "autosave-hitch", at: 1, reason: "gap" });
    facts.push({ t: "end", at: 401 });
    const v = F.verdict(facts, "dwell", T.dwell, { judged: true });
    if (v.status === "pass") { passes++; assert.equal(oracleAllowsPass("dwell", facts, T.dwell as never), null); }
    else assert.equal(v.status, "partial", JSON.stringify(v.rules));
  }
  assert.ok(passes > 100, `${passes} passes`);
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
