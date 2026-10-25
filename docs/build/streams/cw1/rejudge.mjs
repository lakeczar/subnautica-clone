// CW-1 R5: re-derive a recorded run's per-frame diagnostics with the current method, from the raw
// inputs it retained: each long frame's renderer state summary (time in each state, observed time
// only, the rest as "?"; R5-4) and its class (frame-class.mjs; R5-2 disabled GPU-vCPU credit).
// Raw rows, canary, thread states and the run's own gate outcome are left as recorded.
//   usage: node rejudge.mjs <segment.json> [--write]
import { readFileSync, writeFileSync } from "node:fs";
import { classify } from "./frame-class.mjs";

const [file, flag] = process.argv.slice(2), d = JSON.parse(readFileSync(file, "utf8")), changes = [];
const round = (x) => +x.toFixed(1);
/** The traversal's own summary (traverse.mjs `hostIn`), from the retained states and coverage. */
function stateSummary(obs, t0, t1) {
  const states = {}, rs = obs.states, cover = obs.cover;
  const observedIn = (a, b) => cover.reduce((n, [s, e]) => n + Math.max(0, Math.min(e, b) - Math.max(s, a)), 0);
  for (let k = 0; k < rs.length; k++) {
    const [, seen, st, w] = rs[k], next = rs[k + 1]?.[1] ?? t1, a = Math.max(seen, t0), b = Math.min(next, t1);
    const ms = b > a ? observedIn(a, b) : 0;
    if (ms > 0) { const key = w ? `${st}:${w}` : st; states[key] = round((states[key] ?? 0) + ms); }
  }
  const observed = observedIn(t0, t1);
  if (t1 - t0 - observed > 0.05) states["?"] = round(t1 - t0 - observed);
  return states;
}
const CLASS_FIELDS = ["cause", "rule", "gpu", "provableStolenMs", "canaryMs", "excusedMs", "remainderMs", "coveredMs", "vmProvableMs", "ourCpuMs", "migrations", "gaps", "unknownState", "gpuCandidateMs"];
for (const l of d.long ?? []) {
  if (!l.raw) continue;
  const before = Object.fromEntries(CLASS_FIELDS.filter(k => k in l).map(k => [k, l[k]]));
  for (const k of CLASS_FIELDS) delete l[k];
  Object.assign(l, classify(l, d.ncpu ?? 8));
  const after = Object.fromEntries(CLASS_FIELDS.filter(k => k in l).map(k => [k, l[k]]));
  const diff = CLASS_FIELDS.filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (diff.length) changes.push({ at: l.at, class: Object.fromEntries(diff.map(k => [k, [before[k], after[k]]])) });
  const r = l.raw.threads?.renderer;
  if (l.host && r) {
    const { e0, e1 } = l.raw.window, states = stateSummary(r, e0, e1);
    if (JSON.stringify(states) !== JSON.stringify(l.host.states)) changes.push({ at: l.at, states: [l.host.states, states] });
    l.host.states = states;
  }
}
d.rejudged = { by: "rejudge.mjs (CW-1 R5: state summaries observed-only, GPU-vCPU credit off)", changes: changes.length };
console.log(JSON.stringify({ file, frames: (d.long ?? []).length, changes }, null, 1));
if (flag === "--write") writeFileSync(file, JSON.stringify(d, null, 1));
