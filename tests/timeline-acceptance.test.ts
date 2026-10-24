/** LS-1 pacing acceptance over the one analyser: the six fixture cases from the
 * plan (docs/build/streams/LS-1.md §3), rotation keeping declared causes, the
 * validator holding the two new fields, and the recorder opening a declared wait
 * from its first tick. */
import test from "node:test";
import assert from "node:assert/strict";
import { pacingAcceptance } from "../src/sim/timeline/acceptance.js";
import { createRecorder, exportTimeline, observe } from "../src/sim/timeline/recorder.js";
import { analyseTimeline, newContent, summarizeChunk, validTimeline } from "../src/sim/timeline/report.js";
import type { TimelineEvent, TimelineExport } from "../src/sim/timeline/report.js";
import { createGame } from "../src/sim/state.js";

const MIN = 60;
const timeline = (events: TimelineEvent[], endPlay: number, rotated?: TimelineExport["rotated"]): TimelineExport => ({
  format: "siltwake.timeline", version: 2, dropped: 0,
  session: { id: "fixture", started: "2026-10-24T00:00:00.000Z", end: { tick: endPlay * 60, play: endPlay, idle: 0 } },
  events: [...events].sort((a, b) => a.tick - b.tick), ...(rotated ? { rotated } : {}),
});
const fresh = (play: number, what: string, id: string, extra: Partial<TimelineEvent> = {}): TimelineEvent =>
  ({ kind: "new", tick: play * 60, play, what, id, ...extra });
const idle = (play: number, seconds: number, extra: Partial<TimelineEvent> = {}): TimelineEvent =>
  ({ kind: "idle", tick: play * 60, play, seconds, waiting: [], ...extra });
/** New content every 10 minutes for an hour: a clean baseline. */
const steady = (): TimelineEvent[] => Array.from({ length: 7 }, (_, i) => fresh(i * 10 * MIN, "discovery", `d${i}`));
const verdict = (t: TimelineExport) => pacingAcceptance(analyseTimeline(t));

test("a 30-minute empty leg fails", () => {
  const v = verdict(timeline([fresh(MIN, "discovery", "a"), fresh(31 * MIN, "discovery", "b")], 32 * MIN));
  assert.equal(v.ok, false);
  assert.match(v.failures.join(), /longest gap .*30\.0 min > 20/);
  assert.ok(verdict(timeline(steady(), 60 * MIN)).ok, "the steady baseline passes");
});

test("a long empty-travel leg is reported for judgement, never failed (owner, 2026-10-24)", () => {
  const leg: TimelineEvent = { kind: "travel", tick: 12 * MIN * 60, play: 12 * MIN, seconds: 120, stationary: 0, hull: "creel" };
  const v = verdict(timeline([...steady(), leg], 60 * MIN));
  assert.ok(v.ok, v.failures.join("; "));
  assert.equal(v.emptyStretches, 1);
  assert.match(v.reported.join(), /1 empty-travel stretch over 90 s, for judgement \(longest 120 s by creel\)/);
});

test("a 20 s decode wait fails; a growth wait does not", () => {
  const v = verdict(timeline([...steady(), idle(25 * MIN, 20, { cause: "decode:reef_pumphouse_log" })], 60 * MIN));
  assert.equal(v.ok, false);
  assert.equal(v.decodeWaitSeconds, 20);
  assert.match(v.failures.join(), /idle waiting on a decode: decode:reef_pumphouse_log 1× 20 s/);
  assert.ok(verdict(timeline([...steady(), idle(25 * MIN, 200, { cause: "growth:seed_staple_cup" })], 60 * MIN)).ok);
});

test("a decode wait beside an unrelated ripe or packed planter fails: the cause is the decode, not what else exists", () => {
  const v = verdict(timeline([...steady(), idle(25 * MIN, 45, { cause: "decode:canopy_basket_log", waiting: ["decode", "growth"] })], 60 * MIN));
  assert.equal(v.ok, false);
  // Presence tags alone never make a decode wait (and never excuse one).
  assert.ok(verdict(timeline([...steady(), idle(25 * MIN, 45, { waiting: ["decode", "growth"] })], 60 * MIN)).ok);
});

test("a background decode running while the bot keeps playing passes", () => {
  const events = [...steady(), fresh(33 * MIN, "decode", "reef_pumphouse_log", { yields: ["plan:bp_small_fabricator", "record:reef_pumphouse_terminal"] })];
  const v = verdict(timeline(events, 60 * MIN));
  assert.ok(v.ok, v.failures.join("; "));
  assert.equal(v.decodeWaitSeconds, 0);
});

test("a genuinely new later payoff keeps its own time; a duplicate notice of the same accomplishment does not fill a gap", () => {
  const payoff = timeline([fresh(0, "site", "reef_pumphouse_site"), fresh(15 * MIN, "decode", "reef_pumphouse_log", { yields: ["plan:bp_small_fabricator"] }),
    fresh(30 * MIN, "discovery", "C02")], 30 * MIN);
  const a = verdict(payoff);
  assert.ok(a.ok, a.failures.join("; "));
  assert.equal(a.longestGapMinutes, 15);
  const duplicate = timeline([fresh(0, "site", "reef_pumphouse_site"), fresh(15 * MIN, "site", "reef_pumphouse_site"),
    fresh(30 * MIN, "discovery", "C02")], 30 * MIN);
  const b = verdict(duplicate);
  assert.equal(b.ok, false);
  assert.equal(b.longestGapMinutes, 30);
  // A decode that yielded nothing new is presentation only; an older producer's (no `yields`) still counts.
  assert.equal(newContent([fresh(10, "decode", "x", { yields: [] })]).length, 0);
  assert.equal(newContent([fresh(10, "decode", "x")]).length, 1);
});

test("declared causes survive rotation into summaries, and the validator holds the new fields", () => {
  const chunk = [fresh(0, "discovery", "a"), idle(60, 12, { cause: "decode:x" }), idle(200, 8, { cause: "decode:x" }), idle(400, 30, { cause: "growth:y" })];
  const summary = { n: 0, ...summarizeChunk(chunk) };
  assert.deepEqual(summary.idle.byCause, { "decode:x": { count: 2, seconds: 20, longest: 12 }, "growth:y": { count: 1, seconds: 30, longest: 30 } });
  const t = timeline([fresh(600, "discovery", "b")], 900, [summary]);
  assert.ok(validTimeline(JSON.parse(JSON.stringify(t))).ok);
  assert.deepEqual(analyseTimeline(t).idle.byCause["decode:x"], { count: 2, seconds: 20, longest: 12 });
  assert.equal(verdict(t).ok, false, "a rotated decode wait still fails");
  const bad = (e: Record<string, unknown>) => validTimeline({ ...timeline([], 10), events: [{ kind: "idle", tick: 0, play: 0, ...e }] }).ok;
  assert.equal(bad({ cause: 3 }), false);
  assert.equal(bad({ yields: "plan:x" }), false);
  assert.equal(bad({ yields: ["plan:x", 2] }), false);
  assert.equal(bad({ cause: "decode:x", yields: ["plan:x"] }), true);
});

test("the recorder opens a declared wait from its first tick, with no grace window", () => {
  const s = createGame(), rec = createRecorder({ id: "t", started: "2026-10-24T00:00:00.000Z" });
  const step = (ctx: Parameters<typeof observe>[2]) => { s.tick++; observe(rec, s, ctx); };
  step({ input: true });
  for (let i = 0; i < 120; i++) step({ input: false, cause: "decode:reef_pumphouse_log" });
  step({ input: true });
  const idles = exportTimeline(rec, s).events.filter((e) => e.kind === "idle");
  assert.equal(idles.length, 1);
  assert.equal(idles[0]!.cause, "decode:reef_pumphouse_log");
  assert.ok(Math.abs(idles[0]!.seconds! - 2) < 0.05, `two seconds of declared wait, got ${idles[0]!.seconds}`);
});
