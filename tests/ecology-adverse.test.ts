import test from "node:test";
import assert from "node:assert/strict";
import { DIVER_ESCAPE_SPEED } from "../src/content/ecology/species.js";
import type { ThreatAgentId } from "../src/content/ecology/species.js";
import { canReach, definitionOf, homeOf, layerY, speciesOf } from "../src/sim/ecology/agents.js";
import { windowBusy } from "../src/sim/fauna/windows.js";
import { openWater } from "../src/sim/ecology/adapter.js";
import { createEcology, stepEcology } from "../src/sim/ecology/ecology.js";
import { emptyExposure, protectionFor, sampleHazards, stepExposure } from "../src/sim/ecology/hazards.js";
import { UNPROTECTED } from "../src/content/ecology/hazards.js";
import type { EcologyEvent, EcologyState, EcologyWorld } from "../src/sim/ecology/types.js";
import type { Vec3 } from "../src/sim/types.js";
import { offset, stimulus } from "./ecology-support.js";

/** The adverse case with nothing removed: the same rock throughout, every
 * source of ecology health loss (strikes and field exposure), current drift,
 * truthful stimulus velocity, and a diver whose movement is swept against the
 * rock inflated by its own radius (a swept sphere against boxes), sliding
 * along a face rather than passing through it. */
interface Box { min: Vec3; max: Vec3 }
const DIVER_RADIUS = 0.4, DT = 1 / 60;
const inflate = (b: Box, r: number): Box => ({ min: offset(b.min, -r, -r, -r), max: offset(b.max, r, r, r) });

interface Fixture { id: ThreatAgentId; at: Vec3; loud: { light: number; noise: number }; route: Vec3[] }
/** A dead-end crevice: rock behind and on both sides, open toward the animal
 * and open above. Every route leaves through an opening, never through rock. */
const crevice = (p: Vec3): Box[] => [
  { min: offset(p, 1.2, -3, -3), max: offset(p, 3, 3, 3) },
  { min: offset(p, -3, -3, 1.2), max: offset(p, 1.2, 3, 3) },
  { min: offset(p, -3, -3, -3), max: offset(p, 1.2, 3, -1.2) },
];
function fixture(id: ThreatAgentId, variant = ""): Fixture {
  const home = homeOf(id);
  if (id === "divide_skate_saddle") {
    const at = { ...home, x: home.x + 6, y: layerY("divide_dense_layer") };
    return { id, at, loud: { light: 0.6, noise: 0.6 }, route: [offset(at, 0, 12, 0)] };
  }
  if (id === "district_choir_gallery") {
    const at = offset(home, 12, 4, 0);
    return { id, at, loud: { light: 0.6, noise: 0.6 }, route: [offset(at, 0, 22, 0)] };
  }
  const at = offset(home, 12, 0, 0);
  // The reviewer's route: straight out of the mouth along the whole warm passage into cool water.
  if (variant === "passage") return { id, at, loud: { light: 0.6, noise: 0.6 }, route: [offset(at, -60, 0, 0)] };
  // Rift: out through the open mouth toward the animal, then up out of the warm passage.
  return { id, at, loud: { light: 0.6, noise: 0.6 }, route: [offset(at, -4, 0, 0), offset(at, -4, 26, 0)] };
}

/** Safe: no field load accumulates and no animal can reach the diver. */
function safe(p: Vec3, world: EcologyWorld, tick: number): boolean {
  const h = sampleHazards(p, tick);
  if (h.heat > UNPROTECTED.heat || h.brine > UNPROTECTED.brine) return false;
  const s = stimulus(p);
  return (["rift_stalker_passage", "rift_stalker_chimney", "divide_skate_saddle", "divide_skate_east", "district_choir_gallery", "district_choir_terrace"] as const)
    .every(id => definitionOf(id).strike.kind === "pulse"
      ? Math.hypot(p.x - homeOf(id).x, p.y - homeOf(id).y, p.z - homeOf(id).z) > definitionOf(id).reach + DIVER_RADIUS
      : !canReach(id, s, world, tick));
}

interface Outcome { loss: number; clear: number; safeAt: number; strikes: { tick: number; loss: number }[]; minHealth: number;
  events: { tick: number; e: EcologyEvent }[]; path: { tick: number; pos: Vec3 }[]; body: EcologyWorld }
/** The three closed faces of the crevice, as unit directions from the diver. */
const CLOSED: readonly Vec3[] = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }];
/** Swept diver body movement must be stopped by each closed face. */
function assertClosed(body: EcologyWorld, at: Vec3, label: string): void {
  for (const d of CLOSED) assert.equal(body.clearLine(at, offset(at, d.x * 2, d.y * 2, d.z * 2)), false, `${label}: the face toward ${JSON.stringify(d)} blocks the diver`);
}
/** When the cornered diver sets off. `legacy`: once every engaged animal rests
 * in its refractory (S4's policy, from tick 0). `windows` (CR-1): also while
 * the fixture's animal is plainly busy in its natural window, feeding or
 * resting, as a player watching it would see, engaged before or not. */
type Escape = "legacy" | "windows";
function cornered(f: Fixture, start = 0, escape: Escape = "legacy"): Outcome {
  const solids = crevice(f.at), world = openWater({ solids }), body = openWater({ solids: solids.map(b => inflate(b, DIVER_RADIUS)) });
  assertClosed(body, f.at, "before the encounter");
  assert.equal(world.clearLine(f.at, offset(f.at, 3, 0, 0)), false, "the back wall also blocks sight and contact");
  const state: EcologyState = createEcology();
  let pos = { ...f.at }, drift: Vec3 = { x: 0, y: 0, z: 0 }, loss = 0, minHealth = 100, clear = -1, safeAt = -1, leg = 0;
  const engaged = new Set<string>(), strikes: Outcome["strikes"] = [], events: Outcome["events"] = [], path: Outcome["path"] = [];
  const settled = (a: EcologyState["agents"][number], tick: number): boolean =>
    (a.mode === "rest" && a.refractory > 0) || (escape === "windows" && windowBusy(speciesOf(a.id), tick));
  for (let tick = start; tick < start + 60 * 180 && safeAt < 0; tick++) {
    for (const a of state.agents) if (a.mode !== "rest") engaged.add(a.id);
    const open = escape === "windows" && windowBusy(speciesOf(f.id), tick);
    if (clear < 0 && (engaged.size || open) && state.agents.every(a => !engaged.has(a.id) || settled(a, tick))) clear = tick;
    let velocity: Vec3 = { x: 0, y: 0, z: 0 };
    if (clear >= 0) {
      // Escape: quiet swim at the slowest unaided speed, lamp still on, with drift.
      const target = f.route[Math.min(leg, f.route.length - 1)]!;
      const d = { x: target.x - pos.x, y: target.y - pos.y, z: target.z - pos.z }, n = Math.hypot(d.x, d.y, d.z);
      if (n < 0.05 && leg < f.route.length - 1) leg++;
      const swim = n < 1e-6 ? { x: 0, y: 0, z: 0 } : { x: d.x / n * Math.min(DIVER_ESCAPE_SPEED, n * 60), y: d.y / n * Math.min(DIVER_ESCAPE_SPEED, n * 60), z: d.z / n * Math.min(DIVER_ESCAPE_SPEED, n * 60) };
      const wanted = { x: swim.x + drift.x, y: swim.y + drift.y, z: swim.z + drift.z };
      // Swept against the inflated rock; slide by dropping a blocked axis.
      for (const v of [wanted, { ...wanted, x: 0 }, { ...wanted, z: 0 }, { ...wanted, y: 0 }, { x: 0, y: 0, z: 0 }]) {
        const next = { x: pos.x + v.x * DT, y: pos.y + v.y * DT, z: pos.z + v.z * DT };
        if (body.clearLine(pos, next)) { velocity = v; pos = next; break; }
      }
    }
    // While cornered the diver holds station against any current (net velocity zero).
    const r = stepEcology(state, {
      tick, stimulus: stimulus(pos, clear < 0 ? { ...f.loud, velocity } : { light: 0.6, noise: 0.03, velocity }),
      protection: protectionFor(null, []), vehicleId: null,
    }, world);
    path.push({ tick, pos: { ...pos } });
    drift = r.effects.drift;
    loss += r.effects.diverHealth;
    minHealth = Math.min(minHealth, 100 - loss);
    for (const e of r.events) {
      events.push({ tick, e });
      if (e.type === "ecology-strike") strikes.push({ tick, loss: e.loss });
    }
    assert.ok(body.clearLine(pos, pos), "the diver never ends a step inside rock");
    if (clear >= 0 && leg === f.route.length - 1 && safe(pos, world, tick)) safeAt = tick;
  }
  return { loss, clear, safeAt, strikes, minHealth, events, path, body };
}

/** Documented bound for one cornered engagement plus escape, all ecology causes. */
export const CORNERED_LOSS_BOUND = 60;

/** Every assertion of the adverse case, for one cornered run. */
function assertAdverse(id: ThreatAgentId, variant: string, f: Fixture, o: Outcome, start: number, escape: Escape): void {
  const report = { clearSeconds: +(o.clear / 60).toFixed(2), safeSeconds: +(o.safeAt / 60).toFixed(2), loss: +o.loss.toFixed(2),
    strikeLoss: o.strikes.reduce((a, s) => a + s.loss, 0) };
  console.log(`cornered ${id}${variant ? `/${variant}` : ""}${start ? ` from ${start / 60} s (${escape})` : ""}: ${JSON.stringify(report)}`);
  // From tick 0 the fixture always produces contact; at other phases the window may come first.
  if (start === 0) assert.ok(o.strikes.length >= 1, "the fixture does produce contact");
  assert.ok(o.clear > 0, "every engaged animal disengages while the diver stays cornered");
  assert.ok(o.safeAt > o.clear, "the diver reaches safety along the route");
  assert.ok(o.strikes.every(s => s.tick < o.clear), "nothing strikes during the escape");
  assert.ok(o.loss <= CORNERED_LOSS_BOUND, `total ecology loss ${o.loss.toFixed(2)} within ${CORNERED_LOSS_BOUND}`);
  assert.ok(o.minHealth > 0, "alive throughout");
  // The rock is still there after the encounter and the escape never crossed it.
  assertClosed(o.body, f.at, "after the encounter");
  for (let i = 1; i < o.path.length; i++) assert.ok(o.body.clearLine(o.path[i - 1]!.pos, o.path[i]!.pos), `step ${i} stays out of rock`);
  // Independent accounting: replay the recorded path through a fresh exposure
  // load. Total effects loss must equal strike loss plus that hazard harm.
  const exposure = emptyExposure();
  let hazard = 0;
  for (const { tick, pos } of o.path) hazard += stepExposure(exposure, sampleHazards(pos, tick), protectionFor(null, []), true, false).harm;
  assert.ok(Math.abs(o.loss - (report.strikeLoss + hazard)) < 1e-6, `effects loss ${o.loss} = strikes ${report.strikeLoss} + hazard ${hazard}`);
  if (id === "divide_skate_saddle" && start === 0) assert.ok(hazard > 10, `the skate case includes real brine harm (${hazard.toFixed(2)})`);
}

for (const [id, variant] of [["rift_stalker_passage", ""], ["rift_stalker_passage", "passage"], ["divide_skate_saddle", ""], ["district_choir_gallery", ""]] as const) {
  test(`adverse (${id}${variant ? `, ${variant} route` : ""}): cornered with no tool, lamp on and loud, the diver survives contact and hazard, then escapes through the open side`, () => {
    const f = fixture(id, variant);
    assertAdverse(id, variant, f, cornered(f), 0, "legacy");
  });
  // CR-1: the same case arriving at other points of the animals' cycles. A
  // diver who waits for the refractory alone may sit through a whole feeding
  // or rest, so these leave when the animal is plainly busy in its window too.
  test(`adverse (${id}${variant ? `, ${variant} route` : ""}) at other cycle phases, leaving when the animal is busy in its natural window`, () => {
    const f = fixture(id, variant);
    for (const start of [17 * 60, 37 * 60, 67 * 60]) assertAdverse(id, variant, f, cornered(f, start, "windows"), start, "windows");
  });
}
