/** LS-1 stage 1a: the playthrough's timeline harness. Declared waits, the
 * decode-free guard, branch history and the recorded pacing debt. */
import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/sim/state.js";
import type { TimelineAnalysis } from "../src/sim/timeline/report.js";
import { analyseTimeline } from "../src/sim/timeline/report.js";
import { Blocked, Driver } from "../scripts/playthrough/driver.js";
import { judgePacing, PacingTimelines } from "../scripts/playthrough/pacing.js";
import { PACING_DEBT } from "../scripts/playthrough/pacing-debt.js";

const analysis = (gapMinutes: number, empty: number[], decodeWait = 0): TimelineAnalysis => {
  const base = analyseTimeline({ format: "siltwake.timeline", version: 2, dropped: 0, events: [],
    session: { id: "x", started: "2026-10-24T00:00:00.000Z", end: { tick: 0, play: 0, idle: 0 } } });
  return { ...base,
    gaps: [{ fromPlay: 0, toPlay: gapMinutes * 60, minutes: gapMinutes, before: "start", after: "end", flagged: gapMinutes > 20 }],
    longestGapMinutes: gapMinutes,
    travel: { ...base.travel, emptyStretches: empty.map((seconds) => ({ play: 0, seconds, hull: "creel", region: null, flagged: seconds > 90 })).sort((a, b) => b.seconds - a.seconds) },
    idle: { ...base.idle, byCause: decodeWait ? { "decode:reef_pumphouse_log": { count: 1, seconds: decodeWait, longest: decodeWait } } : {} } };
};

test("the recorded pacing debt: within it passes and says so, worse fails, a decode wait never passes, an unrecorded route is strict", () => {
  const debt = PACING_DEBT.creel!;
  const within = judgePacing("creel", analysis(debt.gapMinutes, Array(debt.emptyStretches).fill(debt.longestEmptySeconds)));
  assert.ok(within.ok, within.detail);
  assert.match(within.detail, /within the recorded pacing debt/);
  assert.equal(judgePacing("creel", analysis(debt.gapMinutes + 1, [])).ok, false);
  assert.equal(judgePacing("creel", analysis(10, Array(debt.emptyStretches + 1).fill(100))).ok, false);
  assert.equal(judgePacing("creel", analysis(10, [debt.longestEmptySeconds + 5])).ok, false);
  const wait = judgePacing("creel", analysis(10, [], 20));
  assert.equal(wait.ok, false, "decode waits have no allowance");
  assert.match(wait.detail, /idle waiting on a decode/);
  assert.equal(judgePacing("reverse", analysis(25, [])).ok, false, "a route with no entry is judged strictly");
  assert.ok(judgePacing("reverse", analysis(15, [80])).ok);
  assert.match(judgePacing("creel", analysis(10, Array(debt.emptyStretches).fill(100))).detail, /tighten the entry/);
});

test("a decode-free driver refuses start-decode; waitFor declares its cause only while waiting", () => {
  const d = new Driver("t", "creel", createGame());
  d.decodesAllowed = false;
  assert.throws(() => d.command({ type: "start-decode", hostId: "island_workshop", socket: "s0", decodable: "reef_pumphouse_log" } as never), Blocked);
  const seen: (string | null)[] = [];
  d.watchers.push((x) => seen.push(x.waitCause));
  d.waitFor("two ticks", 1, (s) => s.tick >= 2, "decode:reef_pumphouse_log");
  assert.ok(seen.length >= 1 && seen.every((c) => c === "decode:reef_pumphouse_log"));
  assert.equal(d.waitCause, null);
});

test("a branch's timeline resumes from its parent's milestone, so it carries the shared history", () => {
  const pacing = new PacingTimelines();
  const parent = new Driver("creel", "creel", createGame());
  const obs = pacing.attach(parent);
  // The parent waits on a decode, then reaches a milestone.
  parent.waitCause = "decode:reef_pumphouse_log";
  for (let i = 0; i < 90; i++) { parent.state.tick++; obs.tick(parent, [], []); }
  parent.waitCause = null;
  for (const m of parent.milestones) m(parent, "refits");
  pacing.branch("carrier", "creel", "refits");
  const child = new Driver("carrier", "carrier", structuredClone(parent.state));
  const cobs = pacing.attach(child);
  for (let i = 0; i < 10; i++) { child.state.tick++; cobs.tick(child, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], []); }
  const t = pacing.timeline("carrier")!;
  assert.ok(t.events.some((e) => e.kind === "idle" && e.cause === "decode:reef_pumphouse_log"), "the parent's decode wait is in the branch's history");
  const verdict = pacing.accept({ scenario: "carrier" } as never);
  assert.equal(verdict.ok, false, "and the branch inherits its failure");
});
