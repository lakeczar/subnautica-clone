#!/usr/bin/env node
// REC-1 R3b: the recorder's budget verdict from a duet (DIRECTION convention 9: both arms in one job, interleaved,
// a fixed run count, a margin declared in advance, and an "inconclusive" outcome).
//   node scripts/rec/duet.mjs RUN_JSON DECLARATION_JSON
// RUN_JSON: run.mjs's within-run alternation (the recorder on and paused in place, on/off/off/on windows, adjacent
// windows paired). DECLARATION_JSON, committed before the run:
//   { "budgetMs": 0.167, "pairs": N, "windowS": 10, "confidence": 0.95,
//     "exclusion": { "kind": "none" }
//              | { "kind": "level", "overMs": X }   a pair is dropped when either window's time per frame is more than
//                                                  X ms above the median of every window (both arms pooled)
//   }
// Exactly the first N pairs are judged; fewer is "incomplete". The exclusion is applied to the pair as a whole, so
// both arms lose the same windows. Verdict on the recorder-on minus paused difference, ms of main-thread task time
// per frame, paired t interval: "met" if its upper end is under the budget, "not met" if its lower end is over it,
// otherwise "inconclusive". The unexcluded interval is printed beside it.
import { readFileSync, writeFileSync } from "node:fs";

const [runFile, declFile] = process.argv.slice(2);
if (!runFile || !declFile) { console.error("usage: duet.mjs RUN_JSON DECLARATION_JSON"); process.exit(2); }
const decl = JSON.parse(readFileSync(declFile, "utf8")), alt = JSON.parse(readFileSync(runFile, "utf8")).probe.alternation;
const T95 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228];
// Two-sided 95% t quantile: the table for small n, then the Cornish-Fisher expansion (exact to 3 decimals from 10 on).
const t95 = (df) => df < T95.length ? T95[df] : 1.96 + 2.3815 / df + 3.0814 / df ** 2;
if (decl.confidence !== 0.95) throw new Error("only a 95% interval is implemented");
if (alt?.windowS !== decl.windowS) throw new Error(`the run's window is ${alt?.windowS} s; the declaration says ${decl.windowS} s`);

const w = alt.windows, pairs = [];
for (let i = 0; i + 1 < w.length; i += 2) if (w[i].on !== w[i + 1].on) pairs.push(w[i].on ? [w[i], w[i + 1]] : [w[i + 1], w[i]]);
const judged = pairs.slice(0, decl.pairs);
const med = [...w.slice(0, 2 * decl.pairs).map((x) => x.msPerFrame)].sort((a, b) => a - b)[Math.min(2 * decl.pairs, w.length) >> 1];
const ex = decl.exclusion ?? { kind: "none" };
const dropped = (p) => ex.kind === "level" ? p.some((x) => x.msPerFrame > med + ex.overMs) : ex.kind === "none" ? false : (() => { throw new Error(`unknown exclusion ${ex.kind}`); })();
const stats = (d) => {
  const n = d.length; if (n < 2) return { n };
  const mean = d.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(d.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)), half = (t95(n - 1) * sd) / Math.sqrt(n);
  const r = (x) => +x.toFixed(4);
  return { n, mean: r(mean), sd: r(sd), ci95: [r(mean - half), r(mean + half)] };
};
const all = stats(judged.map(([on, off]) => on.msPerFrame - off.msPerFrame));
const kept = judged.filter((p) => !dropped(p)), s = stats(kept.map(([on, off]) => on.msPerFrame - off.msPerFrame));
const verdict = judged.length < decl.pairs ? "incomplete" : !s.ci95 ? "inconclusive"
  : s.ci95[1] < decl.budgetMs ? "met" : s.ci95[0] > decl.budgetMs ? "not met" : "inconclusive";
const report = { verdict, budgetMs: decl.budgetMs, declared: decl, judgedPairs: judged.length, excludedPairs: judged.length - kept.length,
  pooledMedianMs: +med.toFixed(4), result: s, unexcluded: all,
  excluded: judged.map((p, i) => (dropped(p) ? { pair: i, on: p[0].msPerFrame, off: p[1].msPerFrame, end: p[1].end ?? null } : null)).filter(Boolean) };
writeFileSync(runFile.replace(/run\.json$/, "duet.json"), JSON.stringify(report, null, 1));
console.log(`duet: ${verdict.toUpperCase()}: on minus paused ${s.mean} ms/frame, 95% [${s.ci95?.join(", ")}], n = ${s.n} of ${decl.pairs} declared` +
  ` (${report.excludedPairs} excluded by ${ex.kind}); budget ${decl.budgetMs}; unexcluded ${all.mean} [${all.ci95?.join(", ")}]`);
