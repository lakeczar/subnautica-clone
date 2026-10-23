// The soak's facts and its one verdict (SCHED-2a, after R6).
//
// Every observation becomes an immutable fact, appended to a log; nothing
// removes or rewrites one. The verdict is a pure function of the log, called
// at every early-stop check and once at the end; no other code decides a
// verdict, so a later step can never mask an earlier measured failure.
//
// Facts ({ t, at, … }, frozen):
//   violation   { rule, value?, limit?, detail }        a rule broke, measured
//   covered     { rule }                                 an interval that positively covers a rule
//   unavailable { rule, reason }                         an interval a rule could not be judged in
//   recorded    { rule, ms, limit, where }               a frame time on a run whose frames aren't judged
//   sample      { settled, memory, graphics }            a full probe sample (settled: after a GC)
//   lap         { lap, memory, graphics }                a tour lap's settled sample
//   autosave    { }                                      the game saved
//   save        { ok, label, error? }                    a save checked in a separate browser
//   start       { }                                      the dwell arrived (warm-up counts from here)
//   blocked     { reason }   yielded { }                 the run could not go on
//   end         { }                                      the run's declared end
//
// The verdict, in strict order:
//   fail     any violation, explicit or derived (growth, flatness, leak), in any
//            prefix of the log: once proven, a failure stays;
//   running  no `end` yet;
//   incomplete / yielded   ended before its goal (travel blocked, yielded);
//   partial  a rule lacks full coverage up to `end` (unavailable, recorded, or
//            never covered), or the goal was not reached;
//   pass     otherwise.
// Monotone by construction: violations in any prefix count; coverage and the
// goal are judged only on the facts up to `end`, so facts appended after it
// can add a failure and nothing else.
import { valid } from "./measure.mjs";

/** An append-only log of frozen facts. */
export function factLog() {
  const list = [];
  return {
    list,
    add(fact) { list.push(Object.freeze({ ...fact, ...(fact.memory ? { memory: Object.freeze({ ...fact.memory }) } : {}), ...(fact.graphics ? { graphics: Object.freeze({ ...fact.graphics }) } : {}) })); return list.length; },
  };
}

const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : a > b ? Infinity : 0);
const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 10 ** d) / 10 ** d);
/** Least-squares slope of [seconds, MiB] points, in MiB per hour. */
export function slopePerHour(points) {
  const n = points.length, mx = points.reduce((a, p) => a + p[0], 0) / n, my = points.reduce((a, p) => a + p[1], 0) / n;
  const num = points.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0), den = points.reduce((a, [x]) => a + (x - mx) ** 2, 0);
  return den > 0 ? (num / den) * 3600 : 0;
}

/** The rules a soak kind judges (each must be covered to pass). */
export function rulesOf(kind, t) {
  return kind === "tour"
    ? ["renderer", "providers", "save-reload", ...t.memoryMetrics.map((m) => `memory-growth:${m}`), ...t.graphicsMetrics.map((m) => `graphics-growth:${m}`), "streaming-frame", "loading-hold"]
    : ["renderer", "providers", "save-reload", ...t.memoryMetrics.flatMap((m) => [`memory-flat:${m}`, `leak:${m}`]), "autosave-hitch", "autosave", "day-night"];
}

/** Violations a sequence of measurement facts derives, checked at each fact (every prefix). */
function derivedViolations(facts, kind, t) {
  const out = [];
  if (kind === "tour") {
    const laps = facts.filter((f) => f.t === "lap");
    const first = laps[0];
    for (const l of laps.slice(1)) {
      for (const [group, metrics, limit, type, unit] of [["memory", t.memoryMetrics, t.memoryGrowthPct, "memoryMiB", "MiB"], ["graphics", t.graphicsMetrics, t.graphicsGrowthPct, "count", ""]]) {
        for (const m of metrics) {
          const a = first[group]?.[m], b = l[group]?.[m];
          if (!valid(type, a) || !valid(type, b)) continue;
          const g = pct(b, a);
          if (g > limit) out.push({ rule: `${group === "memory" ? "memory" : "graphics"}-growth:${m}`, value: round(g), limit, at: l.at, detail: `lap 1 ${round(a)}${unit && ` ${unit}`} → lap ${l.lap} ${round(b)}${unit && ` ${unit}`} (${round(g)}%)` });
        }
      }
    }
    return out;
  }
  // Dwell: settled samples after the warm-up from arrival; each against the
  // first (flatness), and the trend over every prefix spanning the window (leak).
  const start = facts.find((f) => f.t === "start");
  if (!start) return out;
  const from = start.at + t.warmupS;
  const settled = facts.filter((f) => f.t === "sample" && f.settled && valid("seconds", f.at) && f.at >= from);
  for (const m of t.memoryMetrics) {
    const xs = settled.filter((f) => valid("memoryMiB", f.memory?.[m])).map((f) => ({ at: f.at, v: f.memory[m] }));
    if (xs.length < 2) continue;
    for (let i = 1; i < xs.length; i++) {
      if (xs[i].at < xs[i - 1].at) break; // not monotonic: nothing beyond this is judged
      const g = pct(xs[i].v, xs[0].v);
      if (Math.abs(g) > t.memoryFlatPct) { out.push({ rule: `memory-flat:${m}`, value: round(g), limit: t.memoryFlatPct, at: xs[i].at, detail: `first settled sample ${round(xs[0].v)} MiB, ${round(xs[i].v)} MiB at ${Math.round(xs[i].at)} s (${round(g)}%)` }); break; }
    }
    for (let i = 2; i < xs.length; i++) {
      if (xs[i].at < xs[i - 1].at) break;
      const span = xs[i].at - xs[0].at;
      if (span < t.leakMinWindowS) continue;
      const slope = slopePerHour(xs.slice(0, i + 1).map((x) => [x.at, x.v]));
      if (Number.isFinite(slope) && slope > t.leakMiBPerHour) { out.push({ rule: `leak:${m}`, value: round(slope), limit: t.leakMiBPerHour, at: xs[i].at, detail: `trend ${round(slope)} MiB/h over ${Math.round(span / 60)} min, ${i + 1} settled samples` }); break; }
    }
  }
  return out;
}

/**
 * The verdict. facts: the log's list. opts: { judged, machine }.
 * Returns { status, progress, rules: [{ id, status, value, limit, detail, warning }],
 *   broken, unproven, unavailable, warnings, reason }.
 */
export function verdict(facts, kind, t, { judged = false, machine = null } = {}) {
  const endAt = facts.findIndex((f) => f.t === "end");
  const ended = endAt >= 0;
  const upToEnd = ended ? facts.slice(0, endAt + 1) : facts;
  const violations = [...facts.filter((f) => f.t === "violation"), ...derivedViolations(facts, kind, t)];
  const byRule = new Map();
  for (const v of violations) if (!byRule.has(v.rule)) byRule.set(v.rule, v);
  const of = (rule, type) => upToEnd.filter((f) => f.t === type && f.rule === rule);

  // Goal and coverage, from the facts up to the end.
  const laps = upToEnd.filter((f) => f.t === "lap"), saves = upToEnd.filter((f) => f.t === "save"), autosaves = upToEnd.filter((f) => f.t === "autosave");
  const start = upToEnd.find((f) => f.t === "start");
  // Settled samples after the warm-up, as a time series: every time must be
  // monotonic seconds, or no window is established at all (R3-F3).
  const settled = start ? upToEnd.filter((f) => f.t === "sample" && f.settled && !(valid("seconds", f.at) && f.at < start.at + t.warmupS)) : [];
  const timesOk = settled.every((f, i) => valid("seconds", f.at) && (i === 0 || f.at >= settled[i - 1].at));
  const seriesOf = (m) => (timesOk ? settled.filter((f) => valid("memoryMiB", f.memory?.[m])) : []);
  const settledSpan = timesOk && settled.length >= 2 ? settled.at(-1).at - settled[0].at : 0;
  const dn = upToEnd.filter((f) => f.t === "daynight").at(-1);
  const goalMet = kind === "tour" ? laps.length >= t.laps : autosaves.length >= t.autosaves && settledSpan >= t.leakMinWindowS && (!dn || dn.cycles >= t.dayNightCycles);
  const rules = rulesOf(kind, t).map((id) => {
    const v = byRule.get(id);
    if (v && (id === "streaming-frame" || id === "autosave-hitch") && v.ms != null) {
      const all = violations.filter((x) => x.rule === id), worst = all.reduce((w, x) => Math.max(w, x.ms), 0);
      return { id, status: "fail", value: round(worst), limit: v.limit, detail: `${all.length} ${id === "streaming-frame" ? "streaming" : "autosave"} frames over ${v.limit} ms, worst ${round(worst)} ms at ${v.where ?? "?"}` };
    }
    if (v) return { id, status: "fail", value: v.value, limit: v.limit, detail: v.detail };
    const gaps = of(id, "unavailable"), recs = of(id, "recorded");
    // Any gap for any rule leaves it unproven, whatever else covers it.
    if (gaps.length && !recs.length) return { id, status: "unavailable", detail: summarize(gaps) };
    if (id === "renderer" || id === "providers") return { id, status: "pass" };
    if (id === "save-reload") return saves.length ? { id, status: "pass", value: saves.length, detail: `${saves.length} saves reloaded` } : { id, status: "unavailable", detail: "no save was checked" };
    if (id.startsWith("memory-growth:") || id.startsWith("graphics-growth:")) {
      const [group, m] = [id.startsWith("memory") ? "memory" : "graphics", id.split(":")[1]], type = group === "memory" ? "memoryMiB" : "count";
      const a = laps[0]?.[group]?.[m], b = laps.at(-1)?.[group]?.[m];
      if (laps.length < 2 || !valid(type, a) || !valid(type, b)) return { id, status: "unavailable", detail: `${m} not validly measured at lap 1 and the last lap` };
      return { id, status: "pass", value: round(pct(b, a)), limit: group === "memory" ? t.memoryGrowthPct : t.graphicsGrowthPct, detail: `lap 1 ${round(a)} → lap ${laps.at(-1).lap} ${round(b)}` };
    }
    if (id.startsWith("memory-flat:") || id.startsWith("leak:")) {
      const m = id.split(":")[1], xs = seriesOf(m), span = xs.length >= 2 ? xs.at(-1).at - xs[0].at : 0;
      if (!timesOk) return { id, status: "unavailable", detail: "settled sample times are not monotonic seconds; no window is established" };
      if (id.startsWith("memory-flat:")) return xs.length >= 2 ? { id, status: "pass", detail: `${xs.length} settled samples within ${t.memoryFlatPct}%` } : { id, status: "unavailable", detail: `${xs.length} settled post-GC sample(s) of ${m} after warm-up; two are needed` };
      return span >= t.leakMinWindowS && xs.length >= 3 ? { id, status: "pass", detail: `trend within ${t.leakMiBPerHour} MiB/h over ${Math.round(span / 60)} min` }
        : { id, status: "unavailable", detail: `settled samples of ${m} span ${Math.round(span)} s of the ${t.leakMinWindowS} s the trend needs` };
    }
    if (id === "day-night") {
      const dn = upToEnd.filter((f) => f.t === "daynight").at(-1);
      return dn && dn.cycles >= t.dayNightCycles ? { id, status: "pass", value: dn.cycles } : { id, status: "unavailable", detail: dn ? `${dn.cycles} of ${t.dayNightCycles} day–night cycles` : "the game has no day–night cycle yet; the dwell goal counts autosaves only" };
    }
    if (id === "autosave") return autosaves.length ? { id, status: "pass", value: autosaves.length } : { id, status: "unavailable", detail: "no autosave was seen" };
    // Frame and hold rules: judged runs need coverage and no gap; others are recorded.
    const covered = of(id, "covered").length > 0;
    if (recs.length || ((id === "streaming-frame" || id === "autosave-hitch") && !judged)) {
      const over = recs.filter((r) => r.ms > r.limit), worst = recs.reduce((w, r) => Math.max(w, r.ms), 0);
      return { id, status: "recorded", value: round(worst) || null, warning: over.length > 0,
        detail: `${over.length} over the limit${over.length ? `, worst ${round(worst)} ms at ${over[0].where ?? "?"}` : ""}; ${machine ?? "a shared run"}: recorded, not frame-time evidence` };
    }
    if (gaps.length) return { id, status: "unavailable", detail: summarize(gaps) };
    if (!covered) return { id, status: "unavailable", detail: id === "loading-hold" ? "no per-frame hold record covered the run" : "no frames were measured (the frame provider failed or saw none)" };
    return { id, status: "pass" };
  });

  // Gaps and recordings for a rule this kind doesn't list are reported too, never dropped.
  const listed = new Set(rules.map((r) => r.id));
  for (const f of upToEnd) if ((f.t === "unavailable" || f.t === "recorded") && !listed.has(f.rule)) {
    listed.add(f.rule);
    rules.push({ id: f.rule, status: f.t === "recorded" ? "recorded" : "unavailable", detail: summarize(upToEnd.filter((x) => x.rule === f.rule && x.t === f.t).map((x) => ({ reason: x.reason ?? "recorded" }))) });
  }
  for (const v of violations) if (!listed.has(v.rule)) { listed.add(v.rule); rules.push({ id: v.rule, status: "fail", value: v.value, limit: v.limit, detail: v.detail }); }
  const failed = rules.filter((r) => r.status === "fail");
  const unproven = rules.filter((r) => r.status === "unavailable" || r.status === "recorded");
  const blocked = upToEnd.find((f) => f.t === "blocked"), yielded = upToEnd.find((f) => f.t === "yielded");
  const status = failed.length ? "fail" : !ended ? "running" : blocked ? "incomplete" : yielded ? "yielded" : !goalMet ? "incomplete" : unproven.length ? "partial" : "pass";
  return {
    status, rules,
    progress: kind === "tour" ? { laps: laps.length, goal: t.laps } : { autosaves: autosaves.length, goal: t.autosaves, settledSpanS: Math.round(settledSpan) },
    broken: failed.map((r) => r.id),
    unproven: unproven.map((r) => r.id),
    unavailable: rules.filter((r) => r.status === "unavailable").map((r) => `${r.id}: ${r.detail}`),
    warnings: rules.filter((r) => r.warning).map((r) => `${r.id}: would have failed (${r.detail})`),
    reason: failed.length ? `${failed[0].id}: ${failed[0].detail}` : blocked ? `travel blocked: ${blocked.reason}` : yielded ? "yielded to waiting work" : ended && !goalMet ? "ended before its goal" : null,
  };
}

function summarize(gaps) {
  const reasons = [...new Set(gaps.map((g) => g.reason))];
  return `${gaps.length} interval(s): ${reasons.slice(0, 3).join("; ")}${reasons.length > 3 ? "; …" : ""}`;
}
