// test-tier: allow-escape runs scripts/timeline-report.mjs, which imports only src/sim/timeline/report.ts (no Babylon)
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyseTimeline, formatTimelineReport, parseTimeline, serializeTimeline, TIMELINE_FORMAT, TIMELINE_VERSION } from "../src/sim/timeline/report.js";
import type { TimelineEvent, TimelineExport } from "../src/sim/timeline/report.js";

const min = (m: number) => m * 60;
function sample(): TimelineExport {
  const e = (kind: TimelineEvent["kind"], play: number, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({ kind, tick: Math.round(play * 60), play, ...extra });
  return {
    format: TIMELINE_FORMAT, version: TIMELINE_VERSION, dropped: 0,
    session: { id: "owner-01", started: "2026-10-20T10:00:00.000Z", end: { tick: 0, play: min(60), idle: 200 } },
    events: [
      e("new", min(5), { what: "blueprint", id: "bp_pod_checklist" }),
      e("gather", min(8), { what: "silica_glass", id: "reef_glass_ridge_north", quantity: 2 }),
      e("new", min(12), { what: "craft", id: "essential_tools" }),
      // 40 minutes with nothing new.
      e("travel", min(20), { seconds: 300, hull: "dart", region: "refuge_reef" }),
      e("gather", min(22), { what: "buoyant_resin", id: "island_resin_cove_east", quantity: 2 }),
      e("idle", min(30), { seconds: 150, waiting: ["decode"] }),
      e("idle", min(31), { seconds: 50, waiting: [] }),
      e("death", min(40)),
      e("recovery", min(44), { seconds: 240 }),
      e("note", min(45), { text: "Lost the way back", region: "suspended_garden", at: [100, -90, -100] }),
      e("new", min(52), { what: "region", id: "silt_basin" }),
    ],
  };
}

test("the analyser reports gaps between new things, flagging those over 20 minutes", () => {
  const a = analyseTimeline(sample());
  assert.equal(a.newCount, 3);
  assert.deepEqual(a.newByKind, { blueprint: 1, craft: 1, region: 1 });
  assert.deepEqual(a.gaps.map((g) => [Math.round(g.minutes), g.flagged]), [[5, false], [7, false], [40, true], [8, false]]);
  assert.equal(a.longestGapMinutes, 40);
  assert.equal(a.gaps[2]!.before, "craft: essential_tools");
  assert.equal(a.gaps[3]!.after, "end");
});

test("empty travel is split at points of interest; idle waiting and deaths are summed", () => {
  const a = analyseTimeline(sample());
  assert.deepEqual(a.travel.emptyStretches.map((s) => [s.seconds, s.hull]), [[180, "dart"], [120, "dart"]], "the gather at 22 min splits 300 s into 120 + 180, longest first");
  assert.equal(a.travel.count, 1);
  assert.equal(a.travel.byHull.dart, 5);
  assert.equal(a.idle.count, 2);
  assert.ok(Math.abs(a.idle.minutes - 200 / 60) < 1e-9);
  assert.ok(Math.abs(a.idle.waitingMinutes - 2.5) < 1e-9);
  assert.equal(a.idle.longest?.seconds, 150);
  assert.equal(a.idle.listed.length, 1);
  assert.deepEqual(a.deaths, { count: 1, recoverySeconds: [240], unrecovered: 0 });
  assert.deepEqual(a.gathering.byItem, { silica_glass: 2, buoyant_resin: 2 });
  assert.equal(a.notes[0]!.text, "Lost the way back");
  const text = formatTimelineReport(a);
  assert.match(text, /Play 1:00:00 \(idle excluded\)/);
  assert.match(text, /0:12:00 → 0:52:00  40\.0 min/);
  assert.match(text, /Empty travel over 90 s: 2\n {2}0:22:00 {2}180 s {2}dart · refuge_reef\n {2}0:20:00 {2}120 s/);
  assert.match(text, /waiting on decode/);
  assert.match(text, /0:45:00 · suspended_garden · \(100, -90, -100\) {2}Lost the way back/);
});

test("parse rejects other formats, versions and malformed events", () => {
  const good = serializeTimeline(sample());
  assert.ok(parseTimeline(good).ok);
  const cases: [string, RegExp][] = [
    ["not json", /Not JSON/],
    [JSON.stringify({ format: "other" }), /Not a siltwake.timeline/],
    [good.replace('"version":1', '"version":2'), /Unsupported timeline version 2/],
    [good.replace('"kind":"death"', '"kind":"teleport"'), /Malformed event 7/],
    [good.replace('"id":"owner-01"', '"id":1'), /Malformed session/],
  ];
  for (const [text, message] of cases) {
    const r = parseTimeline(text);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, message);
  }
});

test("scripts/timeline-report.mjs prints the report and its JSON, and refuses bad input", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "timeline-report-"));
  try {
    const file = join(dir, "t.json"), bad = join(dir, "bad.json");
    writeFileSync(file, serializeTimeline(sample()));
    writeFileSync(bad, "{}");
    const text = execFileSync(process.execPath, ["scripts/timeline-report.mjs", file], { cwd: root, encoding: "utf8" });
    assert.match(text, /Gaps between new things \(target ≤ 20 min\): longest 40\.0 min, 1 over target/);
    const json = JSON.parse(execFileSync(process.execPath, ["scripts/timeline-report.mjs", "--json", "--gap", "45", file], { cwd: root, encoding: "utf8" }));
    assert.equal(json.gaps.filter((g: { flagged: boolean }) => g.flagged).length, 0);
    const failed = spawnSync(process.execPath, ["scripts/timeline-report.mjs", bad], { cwd: root, encoding: "utf8" });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /Not a siltwake.timeline file/);
    assert.equal(spawnSync(process.execPath, ["scripts/timeline-report.mjs"], { cwd: root }).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
