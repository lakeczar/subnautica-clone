/** SIM-1: the in-place step and its exception atomicity. A throw is injected at
 * every world query the faulting step makes, so it lands all through the step
 * (movement, threat, ecology, berth) after earlier parts have already mutated
 * the live state. The guard must restore the exact pre-step state, in the same
 * object, and say so loudly. */
import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/sim/state.js";
import { stepGame, stepGameInPlace } from "../src/sim/step.js";
import { StepFault, StepGuard, StepGuardDrift } from "../src/sim/stepGuard.js";
import { firstDifference } from "../src/sim/stateDiff.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameCommand, GameState, WorldQueries } from "../src/sim/types.js";

const flat = createWorldQueries();
const look = (yaw: number): GameCommand => ({ type: "look", yawDelta: yaw, pitchDelta: 0 });
const move = (forward: number, vertical = 0): GameCommand => ({ type: "move", forward, right: 0, vertical, sprint: false });
/** A varied held-control script: turns, swims, dives, rests, with a scan now and then. */
const script = (t: number): GameCommand[] => [look(t % 97 < 20 ? 0.03 : 0), move(t % 50 < 35 ? 1 : 0, t % 120 < 30 ? -1 : 0),
  ...(t % 181 === 0 ? [{ type: "scan" } as const] : [])];

/** A world that throws at its `failAt`th query once armed; `calls` counts queries. */
function faulty(base: WorldQueries): WorldQueries & { arm(at: number): void; disarm(): void; calls: number } {
  let failAt = -1;
  const w = {
    calls: 0, waterHeight: base.waterHeight,
    arm(at: number) { failAt = at; w.calls = 0; }, disarm() { failAt = -1; },
  } as WorldQueries & { arm(at: number): void; disarm(): void; calls: number };
  const hit = (): void => { if (failAt >= 0 && w.calls++ === failAt) throw new Error(`injected at query ${failAt}`); };
  w.groundHeight = (x, z) => { hit(); return base.groundHeight(x, z); };
  w.supportHeight = (x, z, y) => { hit(); return base.supportHeight(x, z, y); };
  w.moveCapsule = (o, d, c, opt) => { hit(); return base.moveCapsule(o, d, c, opt); };
  w.clearance = (o, c) => { hit(); return base.clearance(o, c); };
  w.lineOfSight = (a, b, i) => { hit(); return base.lineOfSight(a, b, i); };
  return w;
}

/** New game, opening skipped, then `ticks` scripted steps through `guard`. */
function played(guard: StepGuard, world: WorldQueries, ticks: number): GameState {
  const s = createGame();
  guard.step(s, [{ type: "skip-opening" }], world);
  for (let t = 0; t < ticks; t++) guard.step(s, script(t), world);
  return s;
}

test("the in-place step equals the detached step, state and events, tick by tick", () => {
  let detached = createGame();
  const live = structuredClone(detached);
  for (let t = 0; t < 900; t++) {
    const commands = t === 0 ? [{ type: "skip-opening" } as const] : script(t);
    const pure = stepGame(detached, commands, flat);
    const events = stepGameInPlace(live, commands, flat);
    assert.deepEqual(events, pure.events, `events at tick ${t}`);
    assert.equal(firstDifference(live, pure.state), null, `tick ${t}`);
    detached = pure.state;
  }
});

test("stepGame leaves its input untouched", () => {
  const s = played(new StepGuard(), flat, 30), before = structuredClone(s);
  stepGame(s, script(7), flat);
  assert.equal(firstDifference(s, before), null);
});

/** A throwing accessor on a nested field: the step throws when it first touches it. */
function poison(s: GameState, path: string): void {
  const keys = path.split("."), last = keys.pop()!;
  const parent = keys.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, s as unknown as Record<string, unknown>);
  assert.ok(Object.hasOwn(parent, last), path);
  Object.defineProperty(parent, last, { configurable: true, enumerable: true, get() { throw new Error(`injected at ${path}`); },
    set() { throw new Error(`injected at ${path}`); } });
}
/** Fields read only by later parts of the step (after movement has mutated the state). */
const LATE = ["world.renewal.0.progress", "story.works.gate", "systems.decodes", "world.ecology",
  "world.threat.interest", "recovery.operation", "player.vitals.food", "player.vitals.oxygen"];

test("a throw anywhere in the step restores the exact pre-step state, in the same object", () => {
  // 150 scripted ticks: checkpoints before the 1st, 61st and 121st steps, then a 31-step journal to replay.
  const probe = faulty(flat);
  const reference = played(new StepGuard(), probe, 150);
  probe.arm(Infinity);
  stepGameInPlace(structuredClone(reference), script(150), probe);
  const queries = probe.calls;
  probe.disarm();
  assert.ok(queries >= 5, `the faulting step makes ${queries} world queries`);
  const after = stepGame(reference, script(150), flat).state;
  const faults: { label: string; inject(live: GameState, w: ReturnType<typeof faulty>): void; message: RegExp }[] = [
    ...Array.from({ length: queries }, (_, at) => ({ label: `world query ${at}`, inject: (_s: GameState, w: ReturnType<typeof faulty>) => w.arm(at),
      message: new RegExp(`injected at query ${at}$`) })),
    ...LATE.map((path) => ({ label: path, inject: (s: GameState) => poison(s, path), message: new RegExp(`injected at ${path.replace(/\./g, "\\.")}$`) })),
  ];
  for (const fault of faults) {
    const w = faulty(flat), guard = new StepGuard();
    const live = played(guard, w, 150);
    fault.inject(live, w);
    assert.throws(() => guard.step(live, script(150), w), (e: unknown) => {
      assert.ok(e instanceof StepFault, `${fault.label}: ${String(e)}`);
      assert.equal(e.restored, "exact", fault.label);
      assert.equal(e.tick, reference.tick, fault.label);
      assert.match(String((e.cause as Error).message), fault.message);
      return true;
    }, `the step touches ${fault.label}`);
    assert.equal(firstDifference(live, reference), null, `restored after a throw at ${fault.label}`);
    // Play resumes from the restored state as if the fault never happened.
    w.disarm();
    guard.step(live, script(150), w);
    assert.equal(firstDifference(live, after), null, `resumed after a throw at ${fault.label}`);
  }
});

test("when the replay cannot run, the state rolls back to the last checkpoint", () => {
  const w = faulty(flat), guard = new StepGuard();
  const live = played(guard, w, 119);
  const checkpoint = structuredClone(live);    // the next step takes its checkpoint here
  for (let t = 119; t < 140; t++) guard.step(live, script(t), w);
  const tick = live.tick;
  // Every query fails from now on, in the step and in the journal's replay alike
  // (entries replay with the world they ran with).
  const fail = (): never => { throw new Error("always"); };
  Object.assign(w, { groundHeight: fail, supportHeight: fail, moveCapsule: fail, clearance: fail, lineOfSight: fail });
  assert.throws(() => guard.step(live, script(140), w), (e: unknown) =>
    e instanceof StepFault && e.restored === "checkpoint" && e.tick === tick);
  assert.equal(firstDifference(live, checkpoint), null);
});

test("accepted commands are journaled; a refused command journals nothing", () => {
  const w = faulty(flat), guard = new StepGuard();
  let live = played(guard, w, 70);
  const lit = guard.command(live, { type: "lamp" }, w);
  assert.notEqual(lit.state, live);
  assert.equal(lit.state.player.lamp, !live.player.lamp);
  live = lit.state;
  const refused = guard.command(live, { type: "mark", placeId: "nowhere" as never }, w);
  assert.equal(refused.state, live);
  for (let t = 70; t < 80; t++) guard.step(live, script(t), w);
  const reference = structuredClone(live);
  w.arm(3);
  assert.throws(() => guard.step(live, script(80), w), (e: unknown) => e instanceof StepFault && e.restored === "exact");
  assert.equal(firstDifference(live, reference), null);
});

test("a new state object starts a fresh checkpoint; nothing replays across saves", () => {
  const w = faulty(flat), guard = new StepGuard();
  played(guard, w, 90);
  const loaded = played(new StepGuard(), flat, 40), reference = structuredClone(loaded);
  w.arm(2);
  assert.throws(() => guard.step(loaded, script(40), w), (e: unknown) => e instanceof StepFault && e.restored === "exact");
  assert.equal(firstDifference(loaded, reference), null);
});

test("a write outside the guard is caught at the next verified checkpoint, before stepping", () => {
  const guard = new StepGuard({ verifyEvery: 1 });
  const live = played(guard, flat, 59);
  live.player.vitals.oxygen = 3;
  const before = structuredClone(live);
  assert.throws(() => guard.step(live, script(59), flat), (e: unknown) =>
    e instanceof StepGuardDrift && /player\.vitals\.oxygen/.test(e.difference));
  assert.equal(firstDifference(live, before), null);
  // A guarded run with verification on never drifts.
  const clean = new StepGuard({ verifyEvery: 1 });
  played(clean, flat, 400);
});
