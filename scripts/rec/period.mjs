#!/usr/bin/env node
// REC-1 R3b: do a hold's slow windows come on a fixed wall-clock period, and which period?
//   node scripts/rec/period.mjs RUN_JSON [RUN_JSON...] [--periods 285,300] [--over MS]
// Reads each run's windows with their wall-clock ends (run.mjs's plain hold `probe.windows`, or an
// alternation's `probe.alternation.windows`). A window is slow when its main-thread time per frame is
// more than --over ms (default 0.6) above the run's median. Adjacent slow windows are one event, dated
// at the middle of its first window. For each candidate period: every event's phase (wall time modulo
// the period) and the phases' spread, the smallest arc that holds all of them; the fitting period
// keeps them together across runs. Also the gaps between consecutive events.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2), files = args.filter((a) => !a.startsWith("--") && !/^[\d.,]+$/.test(a));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const periods = String(opt("periods", "285,300")).split(",").map(Number), over = Number(opt("over", 0.6));

const events = [];
for (const f of files) {
  const p = JSON.parse(readFileSync(f, "utf8")).probe;
  const ws = p.windows?.ends ? p.windows.taskMsPerFrame.map((ms, i) => ({ ms, end: p.windows.ends[i], s: p.windows.seconds }))
    : (p.alternation?.windows ?? []).filter((w) => w.end).map((w) => ({ ms: w.msPerFrame, end: w.end, s: p.alternation.windowS }));
  if (!ws.length) { console.log(`${f}: no windows with wall-clock ends`); continue; }
  const med = [...ws.map((w) => w.ms)].sort((a, b) => a - b)[ws.length >> 1];
  let last = -1;
  ws.forEach((w, i) => {
    if (w.ms <= med + over) return;
    if (last === i - 1 && events.length) { events.at(-1).windows++; events.at(-1).peak = Math.max(events.at(-1).peak, w.ms); }
    else events.push({ run: f, at: (w.end - w.s * 500) / 1000, windows: 1, peak: w.ms, median: med });
    last = i;
  });
}
const iso = (s) => new Date(s * 1000).toISOString().slice(11, 19);
console.log(`${events.length} events (windows over the run's median by more than ${over} ms)`);
for (const e of events) console.log(`  ${iso(e.at)}Z  ${e.windows} window(s), peak ${e.peak.toFixed(2)} ms against ${e.median.toFixed(2)}  ${e.run}`);
const gaps = events.slice(1).map((e, i) => (e.run === events[i].run ? +(e.at - events[i].at).toFixed(0) : null)).filter((g) => g !== null);
console.log(`gaps within a run (s): ${gaps.join(", ") || "-"}`);
for (const P of periods) {
  const ph = events.map((e) => ((e.at % P) + P) % P).sort((a, b) => a - b);
  // the smallest arc holding every phase: the period minus the largest gap between neighbours on the circle
  let gap = ph.length ? P - ph.at(-1) + ph[0] : 0;
  for (let i = 1; i < ph.length; i++) gap = Math.max(gap, ph[i] - ph[i - 1]);
  console.log(`period ${P} s: phases ${ph.map((x) => x.toFixed(0)).join(", ")}; spread ${(P - gap).toFixed(0)} s`);
}
