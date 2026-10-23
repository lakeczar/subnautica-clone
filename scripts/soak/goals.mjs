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
import { factLog, verdict } from "./facts.mjs";
import { valid } from "./measure.mjs";

const round = (v, d = 1) => (v == null ? v : Math.round(v * 10 ** d) / 10 ** d);

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

// The verdict is facts.mjs's reducer, the only code that decides one. These
// adapters turn a run-shaped summary into facts for it (unit tests use them;
// the soak loop appends facts as it observes).
export { slopePerHour } from "./facts.mjs";

/** A run-shaped summary → facts: what a soak loop would have appended. */
export function factsOf(kind, run, t) {
  const log = factLog(), add = (f) => log.add(f);
  if (run.crash) add({ t: "violation", rule: "renderer", at: 0, detail: run.crash });
  for (const [k, v] of Object.entries(run.providerErrors ?? {})) add({ t: "unavailable", rule: "providers", at: 0, reason: `${k} failed ${v.count}× (${v.last})` });
  for (const s of run.saves ?? []) {
    add({ t: "save", at: 0, ok: s.ok, label: s.label, error: s.error });
    if (!s.ok) add({ t: "violation", rule: "save-reload", at: 0, detail: `save at ${s.label ?? "?"} did not reload: ${s.error}` });
  }
  const f = run.frames ?? {}, judged = Boolean(f.judged);
  const frameFacts = (rule, over, limit, coveredWhen, gapReason) => {
    for (const o of over) {
      if (!valid("frameMs", o.ms)) continue;
      add(judged ? { t: "violation", rule, ms: o.ms, value: round(o.ms), limit, where: o.where, at: 0, detail: `${round(o.ms)} ms over ${limit} ms at ${o.where ?? "?"}` }
        : { t: "recorded", rule, ms: o.ms, limit, where: o.where, at: 0 });
    }
    if (coveredWhen) add({ t: "covered", rule, at: 0 }); else if (gapReason) add({ t: "unavailable", rule, at: 0, reason: gapReason });
  };
  if (kind === "tour") {
    for (const l of run.laps ?? []) add({ t: "lap", lap: l.lap, at: l.at ?? l.lap, memory: l.memory, graphics: l.graphics });
    frameFacts("streaming-frame", f.streamingOver ?? [], t.streamingFrameMs, f.attributed === true && f.observed > 0 && !(f.invalid > 0),
      f.attributed === false ? `no streaming attribution (${f.attributionIssue ?? "REC-1 or CW-1's per-frame split is missing"})` : f.invalid > 0 ? `${f.invalid} frame gaps were invalid` : "no frames were measured");
    const h = run.holds ?? {};
    for (const x of h.list ?? []) add({ t: "violation", rule: "loading-hold", at: x.at ?? 0, detail: `hold at ${x.where}${x.frames ? ` (${x.frames} frames recorded)` : ""}` });
    if (h.covered === true) add({ t: "covered", rule: "loading-hold", at: 0 });
    else add({ t: "unavailable", rule: "loading-hold", at: 0, reason: h.covered === false ? `the per-frame hold record did not cover the whole run (${h.issue ?? "some intervals had none"})` : "no per-frame hold record (the provider failed, or the build has none)" });
  } else {
    add({ t: "start", at: run.startedAt ?? 0 });
    for (const s of run.samples ?? []) add({ t: "sample", at: s.at, settled: Boolean(s.afterGc), memory: s.memory, graphics: s.graphics });
    const saves = run.autosaves ?? [];
    for (const a of saves) {
      add({ t: "autosave", at: a.at });
      const timed = valid("gapMs", a.frameMs);
      frameFacts("autosave-hitch", timed && a.frameMs > t.autosaveHitchMs ? [{ ms: a.frameMs, where: `autosave at ${Math.round(a.at)} s` }] : [], t.autosaveHitchMs,
        timed && a.complete !== false, timed ? "an autosave's interval was incomplete" : "an autosave had no frame time");
    }
    const lastSave = saves.at(-1)?.at ?? run.startedAt ?? 0;
    if (run.now != null && run.now - lastSave > t.autosaveMissingS) add({ t: "violation", rule: "autosave", at: run.now, detail: `no autosave for ${Math.round(run.now - lastSave)} s` });
    if (run.dayNight?.available) add({ t: "daynight", at: 0, cycles: run.dayNight.cycles });
  }
  if (run.travel?.blocked) add({ t: "blocked", at: 0, reason: run.travel.blocked });
  if (run.yielded) add({ t: "yielded", at: 0 });
  return log.list;
}

/** Whether a run-shaped summary has reached its goal (the adapters end it then). */
function goalReached(kind, list, t) {
  const v = verdict([...list, { t: "end", at: Infinity }], kind, t);
  return v.status !== "incomplete" || list.some((f) => f.t === "blocked" || f.t === "yielded");
}
const adapt = (kind) => (run, t = DEFAULTS[kind]) => {
  const list = factsOf(kind, run, t);
  const ended = list.some((f) => f.t === "violation") || goalReached(kind, list, t) ? [...list, { t: "end", at: Infinity }] : list;
  return verdict(ended, kind, t, { judged: Boolean(run.frames?.judged), machine: run.frames?.machine ?? null });
};
/** A tour's verdict from a run-shaped summary (tests; the loop keeps facts). */
export const evaluateTour = adapt("tour");
/** A dwell's verdict from a run-shaped summary. */
export const evaluateDwell = adapt("dwell");

/** A Markdown report of a verdict. */
export function reportMarkdown(kind, verdict, meta = {}) {
  const lines = [`# ${kind} soak: ${verdict.status.toUpperCase()}`, ""];
  for (const [k, v] of Object.entries(meta)) lines.push(`- **${k}:** ${v}`);
  lines.push(`- **Progress:** ${JSON.stringify(verdict.progress)}`);
  if (verdict.reason) lines.push(`- **Stopped because:** ${verdict.reason}`);
  lines.push("", "| Rule | Result | Value | Limit | Detail |", "| --- | --- | --- | --- | --- |");
  for (const r of verdict.rules) lines.push(`| ${r.id} | ${r.status} | ${r.value ?? ""} | ${r.limit ?? ""} | ${r.detail ?? ""} |`);
  if (verdict.warnings?.length) lines.push("", "**WARNING: recorded frame rules that would have failed:**", ...verdict.warnings.map((w) => `- ${w}`));
  if (verdict.unavailable.length) lines.push("", "**Missing evidence (not measured, not replaced by a proxy):**", ...verdict.unavailable.map((u) => `- ${u}`));
  return `${lines.join("\n")}\n`;
}
