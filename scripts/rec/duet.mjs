#!/usr/bin/env node
// REC-1 R3b: the recorder's budget verdict from a duet (DIRECTION convention 9: both arms in one job, interleaved,
// a fixed run count, a margin declared in advance, and an "inconclusive" outcome), pooled over the declared tickets.
//   node scripts/rec/duet.mjs DECLARATION_JSON OUT_DIR...          the pooled verdict over every ticket
//   node scripts/rec/duet.mjs DECLARATION_JSON --ticket OUT_DIR    one ticket's own estimate (never a verdict)
// OUT_DIR: one ticket's duet.sh output (playtest/run.json: run.mjs's within-run alternation, the recorder on and
// paused in place, on/off/off/on windows, adjacent windows paired; build.json: its commit, build hash and machine).
// DECLARATION_JSON, committed before the runs:
//   { "budgetMs": 0.167, "pairs": N, "tickets": T, "pairsPerTicket": N/T, "windowS": 10, "confidence": 0.95,
//     "exclusion": { "kind": "none" }
//              | { "kind": "level", "overMs": X }   a pair is dropped when either window's time per frame is more than
//                                                  X ms above its ticket's median of every judged window (both arms)
//   }
// Exactly the first pairsPerTicket pairs of each ticket are judged. The pooled verdict needs exactly T tickets, each
// complete, at one commit, one build and one machine; otherwise "no verdict". The exclusion drops whole pairs, so both
// arms lose the same time. Verdict on the recorder-on minus paused difference, ms of main-thread task time per frame,
// paired t interval over the pooled pairs: "met" if its upper end is under the budget, "not met" if its lower end is
// over it, otherwise "inconclusive". Each ticket's own estimate and the unexcluded interval are printed beside it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2), declFile = args[0], single = args[1] === "--ticket", dirs = args.slice(single ? 2 : 1);
if (!declFile || !dirs.length) { console.error("usage: duet.mjs DECLARATION_JSON OUT_DIR... | DECLARATION_JSON --ticket OUT_DIR"); process.exit(2); }
const decl = JSON.parse(readFileSync(declFile, "utf8"));
const per = decl.pairsPerTicket ?? decl.pairs, tickets = decl.tickets ?? 1;
const T95 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228];
// Two-sided 95% t quantile: the table for small n, then the Cornish-Fisher expansion (exact to 3 decimals from 10 on).
const t95 = (df) => df < T95.length ? T95[df] : 1.96 + 2.3815 / df + 3.0814 / df ** 2;
if (decl.confidence !== 0.95) throw new Error("only a 95% interval is implemented");
const r4 = (x) => +x.toFixed(4);
const stats = (d) => {
  const n = d.length; if (n < 2) return { n };
  const mean = d.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(d.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)), half = (t95(n - 1) * sd) / Math.sqrt(n);
  return { n, mean: r4(mean), sd: r4(sd), ci95: [r4(mean - half), r4(mean + half)] };
};
const ex = decl.exclusion ?? { kind: "none" };
if (!["none", "level"].includes(ex.kind)) throw new Error(`unknown exclusion ${ex.kind}`);

/** One ticket: its judged pairs (the first `per`), each marked dropped or kept against the ticket's own median. */
function ticket(dir) {
  const run = path.join(dir, "playtest", "run.json");
  if (!existsSync(run)) return { dir, complete: false, why: "no run.json (the run did not finish)" };
  const alt = JSON.parse(readFileSync(run, "utf8")).probe.alternation;
  const build = existsSync(path.join(dir, "build.json")) ? JSON.parse(readFileSync(path.join(dir, "build.json"), "utf8")) : null;
  if (alt?.windowS !== decl.windowS) throw new Error(`${dir}: the run's window is ${alt?.windowS} s; the declaration says ${decl.windowS} s`);
  const w = alt.windows, pairs = [];
  for (let i = 0; i + 1 < w.length; i += 2) if (w[i].on !== w[i + 1].on) pairs.push(w[i].on ? [w[i], w[i + 1]] : [w[i + 1], w[i]]);
  const judged = pairs.slice(0, per);
  const ms = judged.flat().map((x) => x.msPerFrame).sort((a, b) => a - b), med = ms[ms.length >> 1];
  const rows = judged.map(([on, off]) => ({ on: on.msPerFrame, off: off.msPerFrame, d: on.msPerFrame - off.msPerFrame,
    dropped: ex.kind === "level" && Math.max(on.msPerFrame, off.msPerFrame) > med + ex.overMs,
    high: on.msPerFrame >= off.msPerFrame ? "on" : "off", end: off.end ?? on.end ?? null }));
  const kept = rows.filter((r) => !r.dropped);
  return { dir, complete: judged.length === per, judgedPairs: judged.length, build, medianMs: r4(med), rows,
    estimate: stats(kept.map((r) => r.d)), unexcluded: stats(rows.map((r) => r.d)),
    excluded: rows.map((r, i) => (r.dropped ? { pair: i, on: r.on, off: r.off, highArm: r.high, end: r.end } : null)).filter(Boolean) };
}
const line = (t) => `${t.dir}: ${t.complete ? "complete" : `INCOMPLETE (${t.why ?? `${t.judgedPairs} of ${per} pairs`})`}` +
  (t.estimate ? `, on minus paused ${t.estimate.mean} [${t.estimate.ci95?.join(", ")}], n = ${t.estimate.n} (${t.excluded.length} excluded: high window ${t.excluded.map((e) => e.highArm).join(", ") || "-"}), median ${t.medianMs}, build ${t.build?.build ?? "?"} at ${t.build?.commit?.slice(0, 8) ?? "?"} on ${t.build?.machine ?? "?"}` : "");

const ts = dirs.map(ticket);
if (single) { console.log(`duet ticket (not a verdict): ${line(ts[0])}`); process.exit(0); }
const why = ts.length !== tickets ? `${ts.length} tickets given, ${tickets} declared`
  : ts.some((t) => !t.complete) ? "a ticket is incomplete"
  : new Set(ts.map((t) => JSON.stringify([t.build?.commit, t.build?.build, t.build?.machine]))).size !== 1 || ts.some((t) => !t.build) ? "the tickets differ in commit, build or machine"
  : null;
const rows = ts.flatMap((t) => t.rows ?? []);
const s = stats(rows.filter((r) => !r.dropped).map((r) => r.d)), all = stats(rows.map((r) => r.d));
const verdict = why ? "no verdict" : !s.ci95 ? "inconclusive" : s.ci95[1] < decl.budgetMs ? "met" : s.ci95[0] > decl.budgetMs ? "not met" : "inconclusive";
const report = { verdict, why, budgetMs: decl.budgetMs, declared: decl, pooled: s, unexcluded: all,
  tickets: ts.map(({ rows: _, ...t }) => t) };
writeFileSync(path.join(dirs[0], "..", "duet-verdict.json"), JSON.stringify(report, null, 1));
for (const t of ts) console.log(`  ${line(t)}`);
console.log(`duet: ${verdict.toUpperCase()}${why ? ` (${why})` : ""}: pooled on minus paused ${s.mean} ms/frame, 95% [${s.ci95?.join(", ")}], n = ${s.n} of ${decl.pairs} declared` +
  ` (${rows.length - (s.n ?? 0)} excluded by ${ex.kind}); budget ${decl.budgetMs}; unexcluded ${all.mean} [${all.ci95?.join(", ")}]`);
