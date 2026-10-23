// C4B fixes, heavy tier (TT-1): C4B-07 watches the chimney through two whole periods.
// tests/c4b-fixes.test.ts keeps the rest and a fast smoke.
import test from "node:test";
import assert from "node:assert/strict";
import { WORLD_CYCLES } from "../src/content/currents/cycles.js";
import { at as siteAt, sitePosition } from "../src/content/ecology/sites.js";
import { validState } from "../src/save/validation.js";
import { observeWorldCycles, CYCLE_VIEW_RANGE } from "../src/sim/cyclesLink.js";
import { period, sampleCycleAt } from "../src/sim/cycles/cycle.js";
import { stepGame } from "../src/sim/step.js";
import type { GameState } from "../src/sim/types.js";
import { PanelProbe } from "../src/ui/panelProbe.js";
import { at, creelFirst } from "./b1-support.js";
import { roundTrip, world } from "./c4b-fixes-support.js";

test("C4B-07: watching the chimney logs it without gathering; timings only after a phase start and end were seen; reload continues", () => {
  const chimney = sitePosition(siteAt("rift_split_chimney")), cycle = WORLD_CYCLES.find((c) => c.id === "cycle.rift.chimney_pulse")!;
  let s: GameState = creelFirst();
  const scans = s.knowledge.scans.length;
  assert.deepEqual(s.knowledge.cycles, []);
  const watch = { x: chimney.x + 30, y: -280, z: chimney.z }, away = { x: chimney.x + 30 + CYCLE_VIEW_RANGE + 40, y: -280, z: chimney.z };
  const phaseAt = (tick: number) => sampleCycleAt(cycle, tick).phase;
  const record = () => s.knowledge.cycles.find((r) => r.cycleId === cycle.id);
  const step = (n: number, p = watch) => { for (let i = 0; i < n; i++) { at(s, p, "swimming"); observeWorldCycles(s, world, []); s.tick++; } };
  /** Steps until the phase changes (the next edge has just been observed). */
  const toEdge = (p = watch) => { const from = phaseAt(s.tick); let n = 0; while (phaseAt(s.tick) === from) { step(1, p); assert.ok(++n < 60 * 120); } step(1, p); };
  // Seen part-way through a phase: that phase is never timed.
  s.tick = 41 * 60;
  const first = phaseAt(s.tick);
  step(1);
  assert.ok(record(), "seen without any scan"); assert.deepEqual(record()!.measured, []);
  assert.equal(s.knowledge.scans.length, scans, "nothing gathered or scanned");
  toEdge();
  assert.deepEqual(record()!.measured, [], `${first} began out of view: untimed`);
  // The next phase, watched from its start to its end, is timed.
  const second = phaseAt(s.tick - 1);
  toEdge();
  assert.deepEqual(record()!.measured, [second]);
  // Interrupted: looking away mid-phase forgets the watch; that phase stays untimed.
  const third = phaseAt(s.tick - 1);
  step(30, away);
  assert.equal(record()!.watching, null);
  toEdge();
  assert.ok(!record()!.measured.includes(third), `${third} was interrupted`);
  // Reload mid-watch, then watch two whole periods: every phase timed.
  s = roundTrip(s);
  step(Math.round(period(cycle) * 2 * 60));
  assert.deepEqual([...record()!.measured].sort(), cycle.phases.map((p) => p.id).sort());
  // The journal's cycles tab states the watched timings.
  const probe = new PanelProbe(world);
  probe.journalTab("cycles");
  const journal = probe.text("notebook", s);
  assert.match(journal, /Split chimney pulse/);
  assert.match(journal, /every 75 s|every 1 min/);
  assert.match(journal, /venting: 18 s/);
  roundTrip(s);
  // Through the real step too: a diver watching for a moment logs it.
  let live = creelFirst(); at(live, watch, "swimming");
  live = stepGame(live, [], world).state;
  assert.equal(live.knowledge.cycles.length, 1);
  // A tampered record is refused, not repaired.
  const bad = structuredClone(s); (bad.knowledge.cycles[0] as unknown as { measured: string[] }).measured = ["boiling"];
  assert.equal(validState(bad), false);
});
