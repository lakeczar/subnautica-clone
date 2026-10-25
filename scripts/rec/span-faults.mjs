#!/usr/bin/env node
// REC-1 R3b duet ruling: do a ticket's major faults fall inside its measured span? Reads only timing, never a
// window's value: fault times from heavy-check's contention log (seconds from its first sample, at or after the job's
// admission) and window ends from the job's output log ("[Ns] window k", seconds from run.mjs's start, which is
// after the admission). The span runs from window 1's start (its end minus the window) to the last window's end.
//   node scripts/rec/span-faults.mjs JOB_DIR [WINDOW_S]
// run.mjs's start is not logged against the admission, so the span is placed by bounds: it starts no earlier than
// window 1's start in run.mjs time (run.mjs starts at or after the admission), and ends no later than the job's end.
// A fault is "before" only if it precedes that earliest possible start, "inside" otherwise unless it follows the
// latest possible end: a conservative test that can only label more, never less.
import { readFileSync } from "node:fs";
import path from "node:path";

const [dir, winArg] = process.argv.slice(2), win = Number(winArg ?? 10);
if (!dir) { console.error("usage: span-faults.mjs JOB_DIR [WINDOW_S]"); process.exit(2); }
const L = readFileSync(path.join(dir, "contention.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const t0 = L[0].t, faults = [];
for (let i = 1; i < L.length; i++) {
  const a = L[i - 1], b = L[i];
  if (a.jobMajflt != null && b.jobMajflt != null && b.jobMajflt > a.jobMajflt) faults.push({ s: (b.t - t0) / 1000, count: b.jobMajflt - a.jobMajflt });
}
// Only the window's index and its time are taken from each line; the value after them is never parsed.
const ends = [...readFileSync(path.join(dir, "output.log"), "utf8").matchAll(/^\[(\d+)s\] window (\d+) /gm)].map((m) => ({ s: +m[1], k: +m[2] }));
const jobS = (L.at(-1).t - t0) / 1000;
const spanFrom = ends.length ? ends[0].s - win : null;
const at = (f) => spanFrom === null ? "no windows" : f.s < spanFrom ? "before the span" : f.s > jobS ? "after the job" : "inside or possibly inside the span";
const inside = faults.filter((f) => at(f) === "inside or possibly inside the span");
console.log(JSON.stringify({ job: path.basename(dir), windows: ends.length, spanStartsNoEarlierThanS: spanFrom, jobS: +jobS.toFixed(0),
  faults: faults.map((f) => ({ ...f, s: +f.s.toFixed(1), where: at(f) })), insideSpan: inside.reduce((a, f) => a + f.count, 0),
  labelForFaults: inside.length ? "DISTURBED" : "clean (faults outside the measured span only)" }));
