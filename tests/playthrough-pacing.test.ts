/** LS-1 stage 1a: the playthrough's timeline harness. Declared waits through the real
 * driver and observer, the decode-free guard, branch history, and the recorded pacing
 * debt as an identified two-way ratchet, end to end through the analyser. */
import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/sim/state.js";
import { analyseTimeline, summarizeChunk } from "../src/sim/timeline/report.js";
import type { TimelineEvent, TimelineExport } from "../src/sim/timeline/report.js";
import { Blocked, Driver, driverHooks } from "../scripts/playthrough/driver.js";
import { judgePacing, measuredDebt, PacingTimelines } from "../scripts/playthrough/pacing.js";
import type { RouteDebt } from "../scripts/playthrough/pacing-debt.js";

// ---------------------------------------------------------------- the ratchet, end to end
const MIN = 60;
const beat = (minute: number, id: string): TimelineEvent => ({ kind: "new", tick: minute * 3600, play: minute * MIN, what: "discovery", id });
const leg = (minute: number, seconds: number): TimelineEvent =>
  ({ kind: "travel", tick: minute * 3600, play: minute * MIN, seconds, stationary: 0, hull: "creel", region: "deep_district" });
/** A route like the measured late game: a 50-minute drought and two long legs. */
function route(o: { beats?: string[]; legs?: [number, number][]; idle?: TimelineEvent[] } = {}): TimelineExport {
  const at: Record<string, number> = { a: 0, b: 10, c: 20, d: 30, e: 80, f: 90 };
  const events = [...(o.beats ?? Object.keys(at)).map((id) => beat(at[id]!, id)), ...(o.legs ?? [[31, 850], [50, 100]]).map(([m, s]) => leg(m, s)), ...(o.idle ?? [])];
  return { format: "siltwake.timeline", version: 2, dropped: 0, events: events.sort((x, y) => x.tick - y.tick),
    session: { id: "ratchet", started: "2026-10-24T00:00:00.000Z", end: { tick: 90 * 3600, play: 90 * MIN, idle: 0 } } };
}
const debtOf = (t: TimelineExport, owner = "PACE-1"): RouteDebt => {
  const m = measuredDebt(analyseTimeline(t));
  const rows = (x: Record<string, number[]>) => Object.fromEntries(Object.entries(x).map(([id, bounds]) => [id, { bounds, owner }]));
  return { gaps: rows(m.gaps), legs: rows(m.legs) };
};
const judge = (t: TimelineExport, debt: RouteDebt) => judgePacing("creel", analyseTimeline(t), { creel: debt });

test("the recorded debt holds exactly the measured, identified violations, with owners", () => {
  const debt = debtOf(route());
  assert.deepEqual(Object.keys(debt.gaps), ["discovery: d → discovery: e"]);
  assert.deepEqual(debt.legs["creel in deep_district"]!.bounds, [850, 100]);
  const v = judge(route(), debt);
  assert.ok(v.ok, v.detail);
  assert.match(v.detail, /exactly the recorded pacing debt/);
});

test("a new gap shorter than the old maximum fails", () => {
  const v = judge(route({ beats: ["a", "d", "e", "f"] }), debtOf(route()));
  assert.equal(v.ok, false);
  assert.match(v.detail, /new gap discovery: a → discovery: d: 30 min/);
});

test("a worsened secondary leg fails, though the count and the maximum are unchanged", () => {
  const v = judge(route({ legs: [[31, 850], [50, 500]] }), debtOf(route()));
  assert.equal(v.ok, false);
  assert.match(v.detail, /leg creel in deep_district #2: 500 s > recorded 100/);
});

test("an improvement fails until the debt is lowered, printing the figures; then a regression fails", () => {
  const better = route({ legs: [[31, 700], [50, 100]] });
  const v = judge(better, debtOf(route()));
  assert.equal(v.ok, false);
  assert.match(v.detail, /better than the recorded pacing debt .*lower pacing-debt\.ts\["creel"\] to \{/);
  assert.match(v.detail, /"bounds":\[700,100\],"owner":"PACE-1"/, "the figures to write keep the owner");
  const lowered = debtOf(better);
  assert.ok(judge(better, lowered).ok);
  const back = judge(route(), lowered);
  assert.equal(back.ok, false);
  assert.match(back.detail, /850 s > recorded 700/);
  assert.equal(judge(route({ legs: [[31, 850]] }), debtOf(route())).ok, false, "a leg gone is better too: lower the entry");
});

test("a one-tick decode wait fails before any debt is considered", () => {
  const tick: TimelineEvent = { kind: "idle", tick: 40 * 3600, play: 40 * MIN, seconds: 1 / 60, waiting: [], cause: "decode:reef_pumphouse_log" };
  const v = judge(route({ idle: [tick] }), debtOf(route()));
  assert.equal(v.ok, false);
  assert.match(v.detail, /decode waits are never debt/);
  const zero = judge(route({ idle: [{ ...tick, seconds: 0 }] }), debtOf(route()));
  assert.equal(zero.ok, false, "even a span that rounds to nothing");
});

test("a route with no recorded debt is judged strictly and prints what it would record", () => {
  const v = judgePacing("reverse", analyseTimeline(route()), {});
  assert.equal(v.ok, false);
  assert.match(v.detail, /measured: \{"gaps":/);
  assert.ok(judgePacing("reverse", analyseTimeline(route({ beats: ["a", "b", "c", "d"], legs: [] })), {}).ok === false, "a long tail to the end is a gap too");
});

// ---------------------------------------------------------------- declared waits, through the real driver
function recorded(t: test.TestContext): { pacing: PacingTimelines; driver: (scenario: string) => Driver } {
  const pacing = new PacingTimelines(), before = driverHooks.attach;
  driverHooks.attach = (d) => pacing.attach(d);
  t.after(() => { driverHooks.attach = before; });
  return { pacing, driver: (scenario) => new Driver(scenario, "creel", createGame()) };
}
const MOVE = { type: "move", forward: 1, right: 0, vertical: 0, sprint: false } as const;

test("every declared wait is idle from its first tick, short or long, with its own cause", (t) => {
  const { pacing, driver } = recorded(t), d = driver("waits");
  d.tick([MOVE]);
  d.waitFor("a short tool action", 1, () => false, "action:tool-arms", true);
  d.tick([MOVE]);
  d.waitFor("a long sort", 30, () => false, "action:sort", true);
  d.waitFor("then the air", 2, () => false, "vitals:air", true);
  d.tick([MOVE]);
  const a = analyseTimeline(pacing.timeline("waits")!);
  assert.deepEqual(Object.keys(a.idle.byCause).sort(), ["action:sort", "action:tool-arms", "vitals:air"]);
  assert.equal(a.idle.byCause["action:tool-arms"]!.count, 1);
  assert.ok(Math.abs(a.idle.byCause["action:tool-arms"]!.seconds - 1) < 0.05, "a one-second wait is one second of idle, not play");
  assert.ok(Math.abs(a.idle.byCause["action:sort"]!.seconds - 30) < 0.05);
  assert.ok(Math.abs(a.idle.byCause["vitals:air"]!.seconds - 2) < 0.05, "a cause change starts a new span");
  assert.ok(a.playMinutes * 60 < 1, "only the active ticks are play");
  // The same spans survive rotation into a chunk summary.
  const chunk = summarizeChunk(pacing.timeline("waits")!.events);
  assert.deepEqual(Object.keys(chunk.idle.byCause ?? {}).sort(), Object.keys(a.idle.byCause).sort());
});

test("a wait must declare a cause; a timed-out wait still clears it", (t) => {
  const { driver } = recorded(t), d = driver("throws");
  assert.throws(() => d.waitFor("no cause", 1, () => true, ""), /must declare its cause/);
  assert.throws(() => d.waitFor("never", 0.1, () => false, "action:sort"), Blocked);
  assert.equal(d.waitCause, null);
});

test("a decode-free driver refuses start-decode", () => {
  const d = new Driver("t", "creel", createGame());
  d.decodesAllowed = false;
  assert.throws(() => d.command({ type: "start-decode", hostId: "island_workshop", socket: "s0", decodable: "reef_pumphouse_log" } as never), Blocked);
});

test("a branch's timeline resumes from its parent's milestone, so it carries the shared history", (t) => {
  const { pacing, driver } = recorded(t), parent = driver("creel");
  parent.waitFor("the pump-house decode", 1.5, () => false, "decode:reef_pumphouse_log", true);
  for (const m of parent.milestones) m(parent, "refits");
  pacing.branch("carrier", "creel", "refits");
  const child = new Driver("carrier", "carrier", structuredClone(parent.state));
  for (let i = 0; i < 10; i++) child.tick([MOVE]);
  const tl = pacing.timeline("carrier")!;
  assert.ok(tl.events.some((e) => e.kind === "idle" && e.cause === "decode:reef_pumphouse_log"), "the parent's decode wait is in the branch's history");
  assert.equal(pacing.accept({ scenario: "carrier" } as never).ok, false, "and the branch inherits its failure");
});
