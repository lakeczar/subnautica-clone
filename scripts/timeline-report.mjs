#!/usr/bin/env node
// Reports one or more exported play timelines (siltwake.timeline JSON):
// gaps between new things, empty craft travel, idle waiting, deaths and notes.
//
//   node scripts/timeline-report.mjs [--json] [--gap 20] [--travel 90] file.json [more.json ...]
//
// Exit codes: 0 report printed; 1 a file failed to parse; 2 usage.
// Loads src/sim/timeline/report.ts directly through Node's type stripping
// (Node >= 22.18 / 23.6); that file has no runtime imports by design.
import { readFileSync } from "node:fs";

// package.json allows Node 22.12, but type stripping is on by default only from
// 22.18 / 23.6. Say so plainly instead of failing inside the import.
if (!process.features.typescript) {
  console.error(`timeline-report needs Node 22.18+ or 23.6+ (type stripping); this is ${process.version}. Try: node --experimental-strip-types scripts/timeline-report.mjs ...`);
  process.exit(2);
}
const { analyseTimeline, DEFAULT_THRESHOLDS, formatTimelineReport, parseTimeline } = await import("../src/sim/timeline/report.ts");

const args = process.argv.slice(2);
const files = [];
const thresholds = { ...DEFAULT_THRESHOLDS };
let json = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--json") json = true;
  else if (a === "--gap") thresholds.newGapMinutes = Number(args[++i]);
  else if (a === "--travel") thresholds.emptyTravelSeconds = Number(args[++i]);
  else if (a === "--help" || a === "-h") { console.log("usage: node scripts/timeline-report.mjs [--json] [--gap minutes] [--travel seconds] file.json ..."); process.exit(0); }
  else files.push(a);
}
if (!files.length || !Number.isFinite(thresholds.newGapMinutes) || !Number.isFinite(thresholds.emptyTravelSeconds)) {
  console.error("usage: node scripts/timeline-report.mjs [--json] [--gap minutes] [--travel seconds] file.json ...");
  process.exit(2);
}
let failed = false;
const reports = [];
for (const file of files) {
  const parsed = parseTimeline(readFileSync(file, "utf8"));
  if (!parsed.ok) { console.error(`${file}: ${parsed.error}`); failed = true; continue; }
  const analysis = analyseTimeline(parsed.value, thresholds);
  if (json) reports.push({ file, ...analysis });
  else process.stdout.write(`${files.length > 1 ? `== ${file}\n` : ""}${formatTimelineReport(analysis, thresholds)}${files.length > 1 ? "\n" : ""}`);
}
if (json) process.stdout.write(`${JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2)}\n`);
process.exit(failed ? 1 : 0);
