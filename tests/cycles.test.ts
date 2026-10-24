import test from "node:test";
import assert from "node:assert/strict";
import { cycleLevel, cycleProblems, cycleTime, fromHazardCycle, period, sampleCycle, sampleCycleAt, secondsAt, secondsUntil,
  TICKS_PER_SECOND, windows } from "../src/sim/cycles/cycle.js";
import type { CycleDef } from "../src/sim/cycles/cycle.js";
import { journalEntry, observeCycle, validObservation } from "../src/sim/cycles/observe.js";
import type { CycleObservation } from "../src/sim/cycles/observe.js";
import { FIXED_SECONDS } from "../src/sim/clock.js";
import { CHIMNEY_PULSE, CYCLE_BY_ID, CYCLES, LANTERN_BLOOM, S4_SEDIMENT_LANE, S4_SPLIT_PLUME, SEDIMENT_SURGE, SPILL_SLACK,
  WARDEN_ROUND } from "../src/content/currents/cycles.js";
import { CANDIDATES, candidateOpen } from "../src/content/currents/lab.js";

// S4's hazard clock, verbatim from src/sim/ecology/hazards.ts at 854fdf1 (as
// composed by C3), so the migration is proven against the running behaviour.
interface HazardCycle { readonly period: number; readonly start: number; readonly duration: number; readonly ramp: number }
function s4CycleLevel(cycle: HazardCycle, tick: number): number {
  const t = (((tick / 60 - cycle.start) % cycle.period) + cycle.period) % cycle.period;
  if (t < cycle.duration) return 1;
  if (t < cycle.duration + cycle.ramp) return 1 - (t - cycle.duration) / cycle.ramp;
  if (t > cycle.period - cycle.ramp) return (t - (cycle.period - cycle.ramp)) / cycle.ramp;
  return 0;
}
function s4SecondsUntilActive(cycle: HazardCycle, tick: number): number {
  const t = (((tick / 60 - cycle.start) % cycle.period) + cycle.period) % cycle.period;
  return t < cycle.duration ? 0 : cycle.period - t;
}
function s4SecondsUntilRise(cycle: HazardCycle, tick: number): number {
  if (s4CycleLevel(cycle, tick) > 0) return 0;
  const t = (((tick / 60 - cycle.start) % cycle.period) + cycle.period) % cycle.period;
  return cycle.period - cycle.ramp - t;
}

test("cycles: seconds are tick / 60, the fixed step's rate", () => {
  assert.equal(TICKS_PER_SECOND * FIXED_SECONDS, 1);
  assert.equal(secondsAt(4500), 75);
});

test("cycles: every authored cycle is sound", () => {
  for (const c of CYCLES) assert.deepEqual(cycleProblems(c), [], c.id);
  assert.equal(new Set(CYCLES.map(c => c.id)).size, CYCLES.length);
});

test("cycles: problems are reported, not silently accepted", () => {
  const bad: CycleDef = { id: "bad", label: "Bad", offset: 0, phases: [
    { id: "a", seconds: 0.1, level: 1, label: "a" }, { id: "r", seconds: 2, label: "r" }, { id: "a", seconds: 2, level: 2, label: "dup" },
  ], warnings: [{ phase: "zzz", leadS: 1, cue: "" }] };
  const problems = cycleProblems(bad).join("\n");
  for (const fragment of ["shorter than", "duplicate phase a", "level outside", "unknown phase zzz", "no cue"]) assert.match(problems, new RegExp(fragment));
  const ramps: CycleDef = { id: "ramps", label: "R", offset: 0, phases: [{ id: "x", seconds: 1, label: "x" }, { id: "y", seconds: 1, level: 0, label: "y" }] };
  assert.match(cycleProblems(ramps).join(), /held phases on both sides/);
});

test("cycles: held levels, linear ramps between neighbours, and wrap-around", () => {
  const c = SPILL_SLACK; // surge 30 @1, ease 6, lull 18 @0.1, build 6
  assert.equal(period(c), 60);
  assert.equal(cycleLevel(c, 10), 1);
  assert.equal(cycleLevel(c, 33), 1 + (0.1 - 1) * 3 / 6);
  assert.equal(cycleLevel(c, 40), 0.1);
  assert.ok(Math.abs(cycleLevel(c, 57) - (0.1 + 0.9 * 3 / 6)) < 1e-12);
  assert.equal(cycleLevel(c, 60 + 10), cycleLevel(c, 10));
  assert.equal(cycleLevel(c, -50), cycleLevel(c, 10));
  // Continuous at every phase edge.
  for (const edge of [0, 30, 36, 54, 60]) assert.ok(Math.abs(cycleLevel(c, edge - 1e-9) - cycleLevel(c, edge + 1e-9)) < 1e-6, `edge ${edge}`);
  const s = sampleCycle(c, 31);
  assert.equal(s.phase, "ease"); assert.ok(Math.abs(s.elapsed - 1) < 1e-12); assert.ok(Math.abs(s.remaining - 5) < 1e-12);
  assert.equal(sampleCycle(c, 59.9).round, 0); assert.equal(sampleCycle(c, 60).round, 1); assert.equal(sampleCycle(c, -0.1).round, -1);
  assert.ok(Object.is(sampleCycle(c, 0).round, 0), "round is never -0 (it is saved)");
});

test("cycles: time until a phase and warning lead windows", () => {
  const c = SPILL_SLACK;
  assert.equal(secondsUntil(c, 0, "surge"), 0);
  assert.equal(secondsUntil(c, 10, "lull"), 26);
  assert.equal(secondsUntil(c, 40, "surge"), 20);
  assert.throws(() => secondsUntil(c, 0, "nope"), /no phase nope/);
  assert.deepEqual(sampleCycle(c, 30).warnings, []);
  const w = sampleCycle(c, 32).warnings;
  assert.equal(w.length, 1); assert.equal(w[0]!.phase, "lull"); assert.ok(Math.abs(w[0]!.inS - 4) < 1e-12);
  assert.equal(sampleCycle(c, 50).warnings[0]!.phase, "build");
  assert.deepEqual(sampleCycle(c, 40).warnings, []);
});

test("cycles: the chimney pulse and plume lane match S4's clock at every tick", () => {
  for (const [def, s4] of [[CHIMNEY_PULSE, S4_SPLIT_PLUME], [SEDIMENT_SURGE, S4_SEDIMENT_LANE]] as const) {
    // Three periods from tick 0, then a later stretch, at every tick.
    for (const from of [0, 1_234_567]) for (let tick = from; tick < from + s4.period * 60 * 3; tick++) {
      const level = cycleLevel(def, secondsAt(tick));
      assert.equal(level, s4CycleLevel(s4, tick), `${def.id} level at ${tick}`);
      assert.equal(secondsUntil(def, secondsAt(tick), "active"), s4SecondsUntilActive(s4, tick), `${def.id} until active at ${tick}`);
      assert.equal(level > 0 ? 0 : secondsUntil(def, secondsAt(tick), "rise"), s4SecondsUntilRise(s4, tick), `${def.id} until rise at ${tick}`);
    }
  }
  // The pulse keeps S4's shape: 18 s venting every 75 s, 3 s ramps.
  assert.deepEqual(CHIMNEY_PULSE.phases.map(p => [p.id, p.seconds]), [["active", 18], ["fall", 3], ["quiet", 51], ["rise", 3]]);
  assert.equal(CHIMNEY_PULSE.offset, 30);
  assert.throws(() => fromHazardCycle("x", "x", { period: 10, start: 0, duration: 9, ramp: 1 }, { active: "a", quiet: "q" }), /no quiet window/);
  const noRamp = fromHazardCycle("y", "y", { period: 10, start: 0, duration: 4, ramp: 0 }, { active: "a", quiet: "q" });
  for (let tick = 0; tick < 1200; tick++) assert.equal(cycleLevel(noRamp, secondsAt(tick)), s4CycleLevel({ period: 10, start: 0, duration: 4, ramp: 0 }, tick));
});

test("cycles: window maths measures the worst wait tick by tick", () => {
  const w = windows(SPILL_SLACK, s => s.phase === "lull");
  assert.ok(Math.abs(w.longestClosed - 42) < 1e-9, `${w.longestClosed}`);
  assert.ok(Math.abs(w.shortestOpen - 18) < 1e-9);
  assert.ok(Math.abs(w.openFraction - 18 / 60) < 1e-9);
  assert.equal(windows(SPILL_SLACK, () => true).longestClosed, 0);
  assert.equal(windows(SPILL_SLACK, () => false).longestClosed, Infinity);
});

test("cycles: no gated candidate forces a wait over a minute, and each window is long enough to use", () => {
  // The crossing each gate needs, at diver cruise (3.4 m/s), with margin.
  const needs: Record<string, number> = { vent_pulse: 14 / 3.4, slack_current: 16 / 3.4, migration: 2 * 45 / 3.4 };
  for (const c of CANDIDATES) {
    const def = CYCLE_BY_ID.get(c.cycle)!, w = windows(def, s => candidateOpen(c, s.level));
    if (c.kind === "bonus") { assert.ok(w.openFraction > 0 && w.openFraction < 1, c.id); continue; }
    assert.ok(w.longestClosed <= 60, `${c.id} can make a player wait ${w.longestClosed} s`);
    assert.ok(w.shortestOpen >= 1.5 * needs[c.id]!, `${c.id} opens for only ${w.shortestOpen} s`);
    assert.ok((def.warnings ?? []).length > 0, `${c.id} needs a readable warning`);
  }
});

test("cycles: a bloom round is long, so it is a reason to come back rather than to wait", () => {
  assert.ok(period(LANTERN_BLOOM) >= 180);
  assert.equal(windows(WARDEN_ROUND, s => s.level >= 0.9).longestClosed <= 60, true);
});

// ------------------------------------------------------------------ observation

function watch(c: CycleDef, ticks: Iterable<number>, inView: (tick: number) => boolean, start: CycleObservation | null = null) {
  let record = start; const events: string[] = [];
  for (const tick of ticks) {
    const r = observeCycle(c, record, tick, inView(tick));
    record = r.record;
    if (r.event) events.push(r.event.type === "cycle-seen" ? "seen" : `measured:${r.event.phase}${r.event.complete ? ":complete" : ""}`);
  }
  return { record, events };
}
function* range(a: number, b: number) { for (let i = a; i < b; i++) yield i; }

test("observation: phases are measured only when watched start to end; the journal never guesses", () => {
  const c = SPILL_SLACK, P = 60 * 60;
  // Arrive mid-surge (tick 600 = 10 s) and watch for one and a half periods.
  const { record, events } = watch(c, range(600, 600 + P * 1.5), () => true);
  assert.deepEqual(events, ["seen", "measured:ease", "measured:lull", "measured:build", "measured:surge:complete"]);
  assert.deepEqual(record!.measured, ["surge", "ease", "lull", "build"]);
  const entry = journalEntry(c, record!);
  assert.equal(entry.periodS, 60);
  assert.deepEqual(entry.phases.map(p => p.seconds), [30, 6, 18, 6]);
  assert.equal(entry.cues.length, 2);

  // The first surge was joined part-way: it is not measured until a whole one is seen.
  const partial = watch(c, range(600, 600 + 30 * 60), () => true).record!;
  assert.deepEqual(partial.measured, ["ease"]);
  const pe = journalEntry(c, partial);
  assert.equal(pe.periodS, null);
  assert.deepEqual(pe.phases.map(p => p.seconds), [null, 6, null, null]);
  assert.deepEqual(pe.cues, []);
});

test("observation: looking away breaks the measurement; records change only at edges", () => {
  const c = SPILL_SLACK;
  // Watch the start of the lull, look away for 2 s inside it, come back: the lull is not measured.
  const away = (t: number) => !(t >= 37 * 60 && t < 39 * 60);
  const { record } = watch(c, range(35 * 60, 70 * 60), away);
  assert.ok(!record!.measured.includes("lull"));
  assert.ok(record!.measured.includes("build"));
  // Stable object while nothing changes: no per-frame churn in the save.
  const r0 = observeCycle(c, null, 600, true).record!;
  assert.equal(observeCycle(c, r0, 601, true).record, r0);
  const gone = observeCycle(c, r0, 602, false).record!;
  assert.equal(gone.watching, null);
  assert.equal(observeCycle(c, gone, 603, false).record, gone);
});

test("observation: records survive JSON and reject anything that does not fit the cycle", () => {
  const { record } = watch(CHIMNEY_PULSE, range(0, 200 * 60), t => t % 7000 < 6000);
  const restored: unknown = JSON.parse(JSON.stringify(record));
  assert.ok(validObservation(CHIMNEY_PULSE, restored));
  assert.deepEqual(restored, record);
  for (const bad of [null, 3, { ...record, cycleId: "other" }, { ...record, measured: ["nope"] }, { ...record, measured: ["quiet", "quiet"] },
    { ...record, firstSeen: -1 }, { ...record, watching: { phase: "nope", since: null } }, { ...record, watching: { phase: "quiet", since: 1.5 } }])
    assert.equal(validObservation(CHIMNEY_PULSE, bad), false, JSON.stringify(bad));
});

test("observation: a save mid-watch resumes the same log as an unbroken run", () => {
  const c = WARDEN_ROUND, end = 300 * 60, cut = 97 * 60 + 13;
  const inView = (t: number) => t % 5000 < 4200;
  const whole = watch(c, range(0, end), inView);
  const first = watch(c, range(0, cut), inView);
  const reloaded = JSON.parse(JSON.stringify(first.record)) as CycleObservation;
  const second = watch(c, range(cut, end), inView, reloaded);
  assert.deepEqual(second.record, whole.record);
  assert.deepEqual([...first.events, ...second.events], whole.events);
});

test("cycles: sampling is pure in the tick (no hidden clock)", () => {
  for (const c of CYCLES) for (const tick of [0, 1, 59, 4499, 4500, 99_999]) {
    assert.deepEqual(sampleCycleAt(c, tick), sampleCycleAt(c, tick));
    assert.ok(cycleTime(c, secondsAt(tick)) >= 0 && cycleTime(c, secondsAt(tick)) < period(c));
  }
});
