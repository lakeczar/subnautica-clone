// Soak goals and pass rules (owner, 2026-10-23; DIRECTION "Two test machines").
// Pure: the runner (run.mjs) feeds it what the probe measured and stops the
// soak as soon as a rule breaks. Thresholds are config (thresholds.json),
// because MEM-1 tunes them later.
//
// A soak has a goal, not a duration:
// - tour: `laps` laps of every region and cave by ordinary travel. Passes if
//   memory after the last lap is within memoryGrowthPct of lap 1, graphics
//   objects don't grow, no streaming frame is over streamingFrameMs, there is
//   no loading hold, and every save reloads.
// - dwell: in a heavy place for `autosaves` autosaves (and `dayNightCycles`
//   day–night cycles). Passes if memory stays flat, no leak, and no autosave
//   hitch is over autosaveHitchMs.
//
// Rule results: pass, fail, recorded (measured, but frame times from a shared
// run are not evidence, so not judged) or unavailable (nothing measured it:
// no provider, a provider that failed, or no observations; it is listed as
// missing, never replaced by a proxy or counted as zero violations).
//
// Verdicts: pass (the goal is met and every rule was measured and passed),
// partial (the goal is met and nothing broke, but some rules are unproven:
// recorded or unavailable), fail (a rule broke; the soak stops), incomplete
// (travel blocked), yielded, or running.
import { readFileSync } from "node:fs";

export const DEFAULTS = Object.freeze({
  tour: {
    laps: 3,
    memoryGrowthPct: 5,
    memoryMetrics: ["rendererRssMiB", "gpuRssMiB", "jsHeapAfterGcMiB"],
    graphicsMetrics: ["meshes", "materials", "textures", "geometries"],
    graphicsGrowthPct: 2, // creatures and effects come and go; a leak grows every lap
    streamingFrameMs: 33,
    holds: 0,
  },
  dwell: {
    autosaves: 20, // 30 s of play each
    dayNightCycles: 1,
    warmupS: 60, // load settling: samples before arrival + this are not compared
    memoryFlatPct: 5,
    leakMiBPerHour: 30,
    leakMinWindowS: 600,
    memoryMetrics: ["rendererRssMiB", "gpuRssMiB", "jsHeapAfterGcMiB"],
    autosaveHitchMs: 33,
    autosaveMissingS: 120, // no autosave for this long means saving stopped
  },
});

/** DEFAULTS merged with a thresholds file ({ tour: {...}, dwell: {...} }). */
export function loadThresholds(file) {
  const over = file ? JSON.parse(readFileSync(file, "utf8")) : {};
  return { tour: { ...DEFAULTS.tour, ...over.tour }, dwell: { ...DEFAULTS.dwell, ...over.dwell } };
}

/** A usable measurement: a finite number (defensive; probe.mjs drops the rest). */
const measured = (v) => typeof v === "number" && Number.isFinite(v);
/** Growth in %: from a zero count, any rise is unbounded growth. */
const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : a > b ? Infinity : 0);
const round = (v, d = 1) => (v == null ? v : Math.round(v * 10 ** d) / 10 ** d);

/** Rules every soak shares, from the event record. */
function commonRules(run) {
  const rules = [];
  if (run.crash) rules.push({ id: "renderer", status: "fail", detail: run.crash });
  if (run.saves?.some((s) => !s.ok)) {
    const bad = run.saves.find((s) => !s.ok);
    rules.push({ id: "save-reload", status: "fail", detail: `save at ${bad.label ?? "?"} did not reload: ${bad.error}` });
  } else if (run.saves?.length) rules.push({ id: "save-reload", status: "pass", value: run.saves.length, detail: `${run.saves.length} saves reloaded` });
  return rules;
}

/** Frame-time rule: judged only when frames are evidence (an isolated run).
 * Measured only if frames were actually observed and attributed. */
function frameRule(id, over, limitMs, { judged, attributed, observed }, what) {
  // A measured violation is judged first: missing coverage elsewhere in the
  // run never hides one (R2-F3).
  over = over.filter((f) => measured(f.ms));
  const worstOver = over.reduce((m, f) => Math.max(m, f.ms), 0);
  if (judged && over.length) return { id, status: "fail", value: round(worstOver), limit: limitMs, detail: `${over.length} ${what} frames over ${limitMs} ms, worst ${round(worstOver)} ms at ${over[0].where ?? "?"}` };
  if (attributed === false) return { id, status: "unavailable", limit: limitMs, detail: `no ${what} attribution yet (REC-1 or CW-1's per-frame split); long frames are recorded unattributed` };
  if (attributed !== true || !(observed > 0)) return { id, status: "unavailable", limit: limitMs, detail: `no frames were measured (the frame provider failed or saw none)` };
  const worst = over.reduce((m, f) => Math.max(m, f.ms), 0);
  if (!judged) return { id, status: "recorded", value: round(worst), limit: limitMs, detail: `${over.length} over ${limitMs} ms; frame times from a shared run are not evidence` };
  return { id, status: over.length ? "fail" : "pass", value: round(worst), limit: limitMs, detail: over.length ? `${over.length} ${what} frames over ${limitMs} ms, worst ${round(worst)} ms at ${over[0].where ?? "?"}` : null };
}

/**
 * run: { laps: [{ lap, memory: {metric: MiB}, graphics: {metric: n} }],
 *   frames: { judged, attributed, streamingOver: [{ ms, where }] },
 *   holds: { available, list: [{ where, state }] }, saves: [{ ok, label, error }],
 *   crash, travel: { blocked } }
 * Returns { status: pass | fail | running | incomplete, rules, progress }.
 */
export function evaluateTour(run, t = DEFAULTS.tour) {
  const rules = commonRules(run), laps = run.laps ?? [], first = laps[0], last = laps.at(-1);
  if (first && last && last !== first) {
    for (const m of t.memoryMetrics) {
      if (!measured(first.memory?.[m]) || !measured(last.memory?.[m]) || !(first.memory[m] > 0)) { rules.push({ id: `memory-growth:${m}`, status: "unavailable", detail: `${m} not measured at lap 1 and lap ${last.lap}` }); continue; }
      const g = pct(last.memory[m], first.memory[m]);
      rules.push({ id: `memory-growth:${m}`, status: g > t.memoryGrowthPct ? "fail" : "pass", value: round(g), limit: t.memoryGrowthPct,
        detail: `lap 1 ${round(first.memory[m])} MiB → lap ${last.lap} ${round(last.memory[m])} MiB (${round(g)}%)` });
    }
    for (const m of t.graphicsMetrics) {
      if (!measured(first.graphics?.[m]) || !measured(last.graphics?.[m])) { rules.push({ id: `graphics-growth:${m}`, status: "unavailable", detail: `${m} not measured at lap 1 and lap ${last.lap}` }); continue; }
      const g = pct(last.graphics[m], first.graphics[m]);
      rules.push({ id: `graphics-growth:${m}`, status: g > t.graphicsGrowthPct ? "fail" : "pass", value: round(g), limit: t.graphicsGrowthPct,
        detail: `lap 1 ${first.graphics[m]} → lap ${last.lap} ${last.graphics[m]}` });
    }
  }
  rules.push(frameRule("streaming-frame", run.frames?.streamingOver ?? [], t.streamingFrameMs, run.frames ?? {}, "streaming"));
  // Any hold seen fails, by frame record or by state poll (R2-F2). "No hold"
  // needs the per-frame record over the whole run: a once-a-second poll of
  // the current state can miss a short one.
  const holds = run.holds ?? {}, n = holds.list?.length ?? 0;
  if (n > t.holds) rules.push({ id: "loading-hold", status: "fail", value: n, limit: t.holds, detail: `hold at ${holds.list[0].where}${holds.list[0].frames ? ` (${holds.list[0].frames} frames recorded)` : ""}` });
  else if (holds.covered === true) rules.push({ id: "loading-hold", status: "pass", value: n, limit: t.holds, detail: "per-frame hold record over the whole run" });
  else rules.push({ id: "loading-hold", status: "unavailable", detail: holds.available === false && holds.covered == null ? "the build exposes no cave-hold state"
    : holds.covered === false ? "the per-frame hold record did not cover the whole run; polls alone can miss a short hold" : "no per-frame hold record (the provider failed, or the build has none)" });
  const progress = { laps: laps.length, goal: t.laps };
  return finish(rules, progress, laps.length >= t.laps, run);
}

/**
 * run: { samples: [{ at (s), memory: {metric: MiB} }], autosaves: [{ at, frameMs }],
 *   dayNight: { available, cycles }, frames: { judged, attributed }, saves, crash, now }
 */
export function evaluateDwell(run, t = DEFAULTS.dwell) {
  // Instantaneous memory swings with GC timing (measured on the 3090 idle at
  // the pod: renderer RSS ±5–11% between GCs). Memory compared over time is
  // therefore read the same way each time: only settled post-GC samples
  // (`afterGc`, one every gcEveryS, soak.mjs), after a time-based warm-up from
  // arrival. Flatness is each against the first; the leak is their trend.
  const rules = commonRules(run), from = (run.startedAt ?? 0) + t.warmupS;
  const warm = (run.samples ?? []).filter((s) => s.at >= from);
  const settled = warm.filter((s) => s.afterGc);
  for (const m of t.memoryMetrics) {
    const xs = settled.filter((s) => measured(s.memory?.[m]) && s.memory[m] > 0).map((s) => ({ at: s.at, v: s.memory[m] }));
    if (xs.length < 2) { if (warm.length) rules.push({ id: `memory-flat:${m}`, status: "unavailable", detail: `${m}: ${xs.length} settled post-GC sample(s) after warm-up; two are needed` }); continue; }
    const base = xs[0].v, worst = xs.reduce((w, x) => (Math.abs(pct(x.v, base)) > Math.abs(w) ? pct(x.v, base) : w), 0);
    rules.push({ id: `memory-flat:${m}`, status: Math.abs(worst) > t.memoryFlatPct ? "fail" : "pass", value: round(worst), limit: t.memoryFlatPct,
      detail: `first settled sample ${round(base)} MiB, furthest ${round(worst)}% over ${xs.length} samples` });
    const spanS = xs.at(-1).at - xs[0].at;
    if (spanS >= t.leakMinWindowS && xs.length >= 3) {
      const slope = slopePerHour(xs.map((x) => [x.at, x.v]));
      rules.push({ id: `leak:${m}`, status: slope > t.leakMiBPerHour ? "fail" : "pass", value: round(slope), limit: t.leakMiBPerHour, detail: `trend ${round(slope)} MiB/h over ${Math.round(spanS / 60)} min, ${xs.length} settled samples` });
    } else if (warm.length && warm.at(-1).at - from >= t.leakMinWindowS) {
      rules.push({ id: `leak:${m}`, status: "unavailable", detail: `${m}: the window was observed, but settled samples span only ${Math.round(spanS)} s (${xs.length})` });
    }
  }
  const saves = run.autosaves ?? [], timed = saves.filter((s) => measured(s.frameMs));
  const over = timed.filter((s) => s.frameMs > t.autosaveHitchMs).map((s) => ({ ms: s.frameMs, where: `autosave at ${Math.round(s.at)} s` }));
  // A measured hitch fails even when other autosaves lack a frame time (R2-F3).
  const hitch = frameRule("autosave-hitch", over, t.autosaveHitchMs, { judged: run.frames?.judged, attributed: true, observed: timed.length }, "autosave");
  if (hitch.status === "fail" || !saves.length || timed.length === saves.length) rules.push(hitch);
  else rules.push({ id: "autosave-hitch", status: "unavailable", limit: t.autosaveHitchMs, detail: `no frame time for ${saves.length - timed.length} of ${saves.length} autosaves${over.length ? `; ${over.length} recorded over budget` : ""}` });
  // The leak trend needs its observation window after warm-up (R1-F7): until
  // then the dwell has not met its goal, and if it stops short the rule is
  // listed as unmeasured.
  // The goal includes the leak window, spanned by settled samples, so a dwell
  // cannot finish before its leak rule can be judged.
  const observedS = settled.length >= 2 ? settled.at(-1).at - settled[0].at : 0;
  if (observedS < t.leakMinWindowS) rules.push({ id: "leak", status: "unavailable", limit: t.leakMiBPerHour, detail: `settled samples span ${Math.round(observedS / 60)} of the ${Math.round(t.leakMinWindowS / 60)} min the leak trend needs` });
  const lastSave = saves.at(-1)?.at ?? run.startedAt ?? 0;
  if (run.now != null && run.now - lastSave > t.autosaveMissingS) rules.push({ id: "autosave", status: "fail", detail: `no autosave for ${Math.round(run.now - lastSave)} s` });
  const dayNight = run.dayNight ?? { available: false };
  if (!dayNight.available) rules.push({ id: "day-night", status: "unavailable", detail: "the game has no day–night cycle yet; the dwell goal counts autosaves only" });
  const progress = { autosaves: saves.length, goal: t.autosaves, dayNightCycles: dayNight.available ? dayNight.cycles : null, dayNightGoal: dayNight.available ? t.dayNightCycles : null };
  const met = saves.length >= t.autosaves && observedS >= t.leakMinWindowS && (!dayNight.available || dayNight.cycles >= t.dayNightCycles);
  return finish(rules, progress, met, run);
}

function finish(rules, progress, goalMet, run) {
  const failed = rules.filter((r) => r.status === "fail");
  const unproven = rules.filter((r) => r.status === "unavailable" || r.status === "recorded");
  // A measured soak needs measurements: completing the travel is not a pass.
  if (run.providerErrors && Object.keys(run.providerErrors).length) rules.push({ id: "providers", status: "unavailable", detail: Object.entries(run.providerErrors).map(([k, v]) => `${k} failed ${v.count}× (${v.last})`).join("; ") });
  const status = failed.length ? "fail" : run.yielded ? "yielded" : run.travel?.blocked ? "incomplete" : !goalMet ? "running" : unproven.length || rules.some((r) => r.id === "providers") ? "partial" : "pass";
  return {
    status, progress, rules,
    broken: failed.map((r) => r.id),
    unproven: unproven.map((r) => r.id),
    unavailable: rules.filter((r) => r.status === "unavailable").map((r) => `${r.id}: ${r.detail}`),
    reason: failed.length ? `${failed[0].id}: ${failed[0].detail}` : run.yielded ? "yielded to waiting work" : run.travel?.blocked ? `travel blocked: ${run.travel.blocked}` : null,
  };
}

/** Least-squares slope of [seconds, MiB] points, in MiB per hour. */
export function slopePerHour(points) {
  const n = points.length, mx = points.reduce((a, p) => a + p[0], 0) / n, my = points.reduce((a, p) => a + p[1], 0) / n;
  const num = points.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0), den = points.reduce((a, [x]) => a + (x - mx) ** 2, 0);
  return den > 0 ? (num / den) * 3600 : 0;
}

/** A Markdown report of a verdict. */
export function reportMarkdown(kind, verdict, meta = {}) {
  const lines = [`# ${kind} soak: ${verdict.status.toUpperCase()}`, ""];
  for (const [k, v] of Object.entries(meta)) lines.push(`- **${k}:** ${v}`);
  lines.push(`- **Progress:** ${JSON.stringify(verdict.progress)}`);
  if (verdict.reason) lines.push(`- **Stopped because:** ${verdict.reason}`);
  lines.push("", "| Rule | Result | Value | Limit | Detail |", "| --- | --- | --- | --- | --- |");
  for (const r of verdict.rules) lines.push(`| ${r.id} | ${r.status} | ${r.value ?? ""} | ${r.limit ?? ""} | ${r.detail ?? ""} |`);
  if (verdict.unavailable.length) lines.push("", "**Missing evidence (not measured, not replaced by a proxy):**", ...verdict.unavailable.map((u) => `- ${u}`));
  return `${lines.join("\n")}\n`;
}
