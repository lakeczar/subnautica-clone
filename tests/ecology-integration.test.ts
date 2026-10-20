import test from "node:test";
import assert from "node:assert/strict";
import { parseEcology, serializeEcology } from "../src/sim/ecology/persist.js";
import { createEcology, resumeEcology, stepEcology } from "../src/sim/ecology/ecology.js";
import { DIVER_ACTOR } from "../src/sim/ecology/types.js";
import type { EcologyState } from "../src/sim/ecology/types.js";
import { layerY } from "../src/sim/ecology/agents.js";
import { EXPOSURE, HAZARD_FIELDS } from "../src/content/ecology/hazards.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { MAX_WARNING_AGE, WARNING_LEAD } from "../src/sim/ecology/types.js";
import { ecologyWorldFrom } from "../src/sim/ecology/adapter.js";
import { stimulusFrom } from "../src/sim/ecology/stimulus.js";
import { protectionFor } from "../src/sim/ecology/hazards.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { createWorldQueries, SOLIDS } from "../src/sim/world.js";
import { THREAT_AGENT_IDS } from "../src/content/ecology/species.js";
import { HULLS } from "../src/content/registry.js";
import type { HullId } from "../src/content/registry.js";
import { openWater } from "../src/sim/ecology/adapter.js";
import { stimulus } from "./ecology-support.js";

test("the proposed ecology save block round-trips and rejects malformed data", () => {
  const state = createEcology();
  state.deterrents.push({ kind: "lure", position: { x: 1, y: -300, z: 2 }, seconds: 4 });
  state.hulls.push({ id: "dart-1", heat: 12, brine: 0, heatWarned: 0, brineWarned: 0 });
  const json = JSON.parse(JSON.stringify(serializeEcology(state)));
  assert.deepEqual(parseEcology(json), state);
  const bad: [string, (x: any) => void][] = [
    ["missing roster entry", x => x.agents.pop()],
    ["reordered roster", x => x.agents.reverse()],
    ["unknown mode", x => { x.agents[0].mode = "hunt"; }],
    ["non-finite position", x => { x.agents[1].position.x = null; }],
    ["extra key", x => { x.agents[2].extra = 1; }],
    ["awareness out of range", x => { x.agents[0].awareness = 99; }],
    ["fractional cycles", x => { x.agents[0].cycles = 0.5; }],
    ["foreign deterrent", x => { x.deterrents[0].kind = "harpoon"; }],
    ["overlong deterrent", x => { x.deterrents[0].seconds = 999; }],
    ["exposure over 100", x => { x.diver.heat = 101; }],
    ["legacy exposure shape", x => { delete x.diver.heatWarned; }],
    ["bad hull key", x => { x.hulls[0].id = "../x"; }],
    ["missing block", x => { delete x.hulls; }],
    ["controlled not an actor", x => { x.controlled = "../x"; }],
    ["controlled missing", x => { delete x.controlled; }],
  ];
  for (const [label, mutate] of bad) {
    const copy = structuredClone(json);
    mutate(copy);
    assert.equal(typeof parseEcology(copy), "string", label);
  }
  assert.equal(THREAT_AGENT_IDS.length, state.agents.length);
});

test("the stimulus is derived from today's GameState and the adapter wraps today's world queries", () => {
  const s = createGame();
  completeOpening(s);
  const lit = stimulusFrom(s, 0.14, { lamp: true }), dark = stimulusFrom(s, 0.14, { lamp: false });
  assert.equal(lit.light, 0.6);
  assert.equal(dark.light, 0);
  assert.equal(lit.hull, null);
  assert.deepEqual(lit.position, s.player.pose.position);
  assert.equal(stimulusFrom(s, 0, { lamp: true, scanned: true }).disturbance, 0.9);
  const world = ecologyWorldFrom(createWorldQueries());
  assert.ok(Number.isFinite(world.floor(0, 0)) && world.refuges.length === 3);
  const solid = SOLIDS[0]!, centre = { x: (solid.min.x + solid.max.x) / 2, y: (solid.min.y + solid.max.y) / 2, z: (solid.min.z + solid.max.z) / 2 };
  assert.equal(world.clearLine({ ...centre, x: solid.min.x - 3 }, { ...centre, x: solid.max.x + 3 }), false);
  // In today's compact world no later-region animal is within activation range.
  const before = structuredClone(createEcology());
  const after = createEcology();
  const r = stepEcology(after, { tick: s.tick, stimulus: lit, protection: protectionFor(null, []), vehicleId: null }, world);
  assert.deepEqual({ ...after, controlled: before.controlled }, before);
  assert.equal(after.controlled, DIVER_ACTOR);
  assert.equal(r.events.length, 0);
});

test("hull exposure follows the fleet ID contract, is bounded, cross-checked, and never touches inherited properties", () => {
  const roundTrip = (state: ReturnType<typeof createEcology>, vehicleIds?: string[]) =>
    parseEcology(JSON.parse(JSON.stringify(serializeEcology(state))), vehicleIds ? { vehicleIds } : {});
  const plume = { x: 90, y: -310, z: -500 };
  // Every hull type, mixed-case and 80-character IDs: parse -> step -> parse.
  for (const [hull, id] of [...(Object.keys(HULLS) as HullId[]).map(h => [h, `${h}_Hull-A`] as const), ["dart", "D".repeat(80)] as const]) {
    let state = roundTrip(createEcology()) as ReturnType<typeof createEcology>;
    for (let t = 0; t < 120; t++)
      stepEcology(state, { tick: 2400 + t, stimulus: stimulus(plume, { hull, radius: 4, light: 0, noise: 0 }), protection: protectionFor(hull, []), vehicleId: id }, openWater());
    const parsed = roundTrip(state, [id, "other"]);
    assert.notEqual(typeof parsed, "string", `${hull} ${id}: ${String(parsed)}`);
    state = parsed as typeof state;
    assert.ok(state.hulls.some(h => h.id === id && h.heat > 0));
  }
  // Reserved and inherited names are ordinary array entries, never prototype lookups.
  for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    const state = roundTrip(createEcology()) as ReturnType<typeof createEcology>;
    stepEcology(state, { tick: 2400, stimulus: stimulus(plume, { hull: "dart", radius: 3.6 }), protection: protectionFor("dart", []), vehicleId: id }, openWater());
    assert.equal(Object.hasOwn(Object.prototype, "heat"), false, `${id} cannot pollute Object.prototype`);
    assert.ok(state.hulls.some(h => h.id === id), `${id} is tracked as its own entry`);
    assert.notEqual(typeof roundTrip(state), "string", `${id} round-trips`);
  }
  // An ID outside the contract takes no hull exposure at all.
  const bad = createEcology();
  stepEcology(bad, { tick: 2400, stimulus: stimulus(plume, { hull: "dart" }), protection: protectionFor("dart", []), vehicleId: "D".repeat(81) }, openWater());
  assert.equal(bad.hulls.length, 0);
  // Parser rejections: length, count, duplicates, orphans against the fleet, inherited-key objects.
  const base = JSON.parse(JSON.stringify(serializeEcology(createEcology())));
  const entry = (id: string) => ({ id, heat: 1, brine: 0, heatWarned: 0, brineWarned: 0 });
  const reject = (label: string, hulls: unknown, vehicleIds?: string[]): void =>
    assert.equal(typeof parseEcology({ ...base, hulls }, vehicleIds ? { vehicleIds } : {}), "string", label);
  reject("81 characters", [entry("a".repeat(81))]);
  reject("bounded count", Array.from({ length: 9 }, (_, i) => entry(`h${i}`)));
  reject("ten thousand orphans", Array.from({ length: 10000 }, (_, i) => entry(`orphan_${i}`)));
  reject("duplicate", [entry("dart-1"), entry("dart-1")]);
  reject("not in this save's fleet", [entry("dart-1")], ["creel-1"]);
  reject("object map from an older draft", { "dart-1": { heat: 1, brine: 0 } });
  reject("inherited-key exposure", [JSON.parse('{"__proto__":{"id":"x"},"heat":1,"brine":0,"heatWarned":0,"brineWarned":0}')]);
  assert.notEqual(typeof parseEcology({ ...base, hulls: [entry("dart-1")] }, { vehicleIds: ["dart-1"] }), "string");
});

/** Brine just below the layer, and the "other actor" position just above it. */
const brineAt = () => {
  const saddle = sitePosition(HAZARD_FIELDS.divide_dense_layer.shape.center);
  return { ...saddle, x: saddle.x - 70, y: layerY("divide_dense_layer") - 1 };
};
type Target = "hull" | "diver";
function transferInput(target: Target, t: number, controlled: boolean) {
  const p = brineAt(), hull = controlled === (target === "hull") ? "dart" as const : null;
  return { tick: t, stimulus: stimulus(controlled ? p : { ...p, y: p.y + 2.2 }, { hull, light: 0, noise: 0 }),
    protection: protectionFor(hull, []), vehicleId: hull ? "Dart_1" : null };
}
const roundTripResume = (state: EcologyState): EcologyState => {
  const parsed = parseEcology(JSON.parse(JSON.stringify(serializeEcology(state))), { vehicleIds: ["Dart_1"] });
  assert.notEqual(typeof parsed, "string", String(parsed));
  resumeEcology(parsed as EcologyState);
  return parsed as EcologyState;
};
/** Tracks the target actor's warnings and harm across a whole run. */
function tracker(target: Target) {
  const t = { firstDelivered: null as number | null, firstHarm: null as number | null, harm: 0 };
  return Object.assign(t, {
    see(tick: number, controlled: boolean, r: ReturnType<typeof stepEcology>) {
      const warned = r.events.some(e => e.type === "hazard-warning" && e.hazard === "brine");
      if (!controlled) assert.equal(warned, false, "nothing is warned for an actor nobody controls");
      if (controlled && warned && t.firstDelivered === null) t.firstDelivered = tick;
      const h = target === "hull" ? r.effects.vehicleHealth : r.effects.diverHealth;
      if (h > 0) { t.harm += h; t.firstHarm ??= tick; }
    },
  });
}

test("control transfer: an uncontrolled actor recovers silently; harm still comes five seconds after the episode's delivered warning", () => {
  for (const target of ["hull", "diver"] as const) for (const viaSave of [true, false]) {
    let state = createEcology(), tick = 0;
    const tr = tracker(target), world = openWater();
    for (; tick < 600; tick++) tr.see(tick, true, stepEcology(state, transferInput(target, tick, true), world));
    tr.see(tick, false, stepEcology(state, transferInput(target, tick, false), world)); tick++;
    if (viaSave) state = roundTripResume(state);
    for (let i = 0; i < 60; i++, tick++) tr.see(tick, false, stepEcology(state, transferInput(target, tick, false), world));
    const back = stepEcology(state, transferInput(target, tick, true), world);
    assert.ok(back.events.some(e => e.type === "hazard-warning" && e.hazard === "brine"), "a reminder is shown on return");
    tr.see(tick++, true, back);
    for (let i = 0; i < 600 && tr.firstHarm === null; i++, tick++) tr.see(tick, true, stepEcology(state, transferInput(target, tick, true), world));
    const label = `${target}${viaSave ? " via save" : ""}`;
    assert.ok(tr.firstDelivered !== null && tr.firstHarm !== null, `${label}: a delivered warning and harm both occur`);
    assert.ok((tr.firstHarm - tr.firstDelivered) / 60 >= WARNING_LEAD, `${label}: delivered ${tr.firstDelivered}, harm ${tr.firstHarm}`);
  }
});

test("a warning never delivered (load pending while uncontrolled) is delivered on first control, and grace starts then", () => {
  for (const target of ["hull", "diver"] as const) for (const viaSave of [true, false]) {
    let state = createEcology();
    const pending = { heat: 0, brine: 95, heatWarned: 0, brineWarned: 0 };
    if (target === "hull") state.hulls.push({ id: "Dart_1", ...pending }); else state.diver = { ...pending };
    if (viaSave) state = roundTripResume(state);
    const tr = tracker(target), world = openWater();
    let tick = 0;
    for (let i = 0; i < 30; i++, tick++) tr.see(tick, false, stepEcology(state, transferInput(target, tick, false), world));
    const start = tick;
    for (let i = 0; i < 900 && tr.firstHarm === null; i++, tick++) tr.see(tick, true, stepEcology(state, transferInput(target, tick, true), world));
    assert.equal(tr.firstDelivered, start, `${target}: delivered on the first controlled step`);
    assert.ok(tr.firstHarm !== null && (tr.firstHarm - start) / 60 >= WARNING_LEAD, `${target}: harm ${tr.firstHarm}`);
  }
});

test("alternating control cannot renew grace: 4 s on, 0.25 s away, ×30, with and without a save mid-alternation", () => {
  for (const target of ["hull", "diver"] as const) for (const saveAt of [-1, 12]) {
    let state = createEcology(), tick = 0;
    const tr = tracker(target), world = openWater();
    // Build the load to 100 through real controlled steps; the warnings are delivered.
    for (let i = 0; i < 60 * 10; i++, tick++) tr.see(tick, true, stepEcology(state, transferInput(target, tick, true), world));
    for (let cycle = 0; cycle < 30; cycle++) {
      if (cycle === saveAt) state = roundTripResume(state);
      for (let i = 0; i < 240; i++, tick++) tr.see(tick, true, stepEcology(state, transferInput(target, tick, true), world));
      for (let i = 0; i < 15; i++, tick++) tr.see(tick, false, stepEcology(state, transferInput(target, tick, false), world));
    }
    const label = `${target}${saveAt >= 0 ? " with save" : ""}`;
    assert.ok(tr.firstDelivered !== null && tr.firstHarm !== null, `${label}: harm occurs`);
    assert.ok((tr.firstHarm - tr.firstDelivered) / 60 >= WARNING_LEAD, `${label}: no harm inside the grace`);
    // Harm starts at the first controlled step that is both 5 s past delivery and at full load:
    // load reaches 100 inside the first 10 s of exposure, so that is delivery + 5 s.
    assert.ok((tr.firstHarm - tr.firstDelivered) / 60 <= WARNING_LEAD + 1 / 60 + 1e-9, `${label}: harm at most 5 s after delivery (${(tr.firstHarm - tr.firstDelivered) / 60} s)`);
    // Hazard harm continues through the alternation: ~4 s of every 4.25 s at the brine rate.
    const rate = target === "hull" ? EXPOSURE.brine.hullHarm : EXPOSURE.brine.diverHarm;
    assert.ok(tr.harm > rate * 30 * 4 * 0.9, `${label}: sustained harm ${tr.harm.toFixed(1)}`);
  }
});

test("warning ages: a state at the maximum stays loadable after stepping; a stale age below the threshold is rejected and never shortens grace", () => {
  const plume = { x: 90, y: -310, z: -500 }, world = openWater();
  // S4-09: max age, controlled and uncontrolled, step -> save -> parse.
  for (const controlledHull of [true, false]) {
    const state = createEcology();
    state.diver = { heat: 100, brine: 50, heatWarned: MAX_WARNING_AGE, brineWarned: MAX_WARNING_AGE };
    state.hulls.push({ id: "Dart_1", heat: 100, brine: 50, heatWarned: MAX_WARNING_AGE, brineWarned: MAX_WARNING_AGE });
    assert.notEqual(typeof parseEcology(JSON.parse(JSON.stringify(serializeEcology(state))), { vehicleIds: ["Dart_1"] }), "string", "max age parses");
    for (let i = 0; i < 3; i++)
      stepEcology(state, { tick: 2400 + i, stimulus: stimulus(plume, controlledHull ? { hull: "dart", radius: 3.6 } : {}),
        protection: protectionFor(controlledHull ? "dart" : null, []), vehicleId: controlledHull ? "Dart_1" : null }, world);
    const parsed = parseEcology(JSON.parse(JSON.stringify(serializeEcology(state))), { vehicleIds: ["Dart_1"] });
    assert.notEqual(typeof parsed, "string", `stepped max-age state stays valid (${String(parsed)})`);
    assert.ok([state.diver, ...state.hulls].every(e => e.heatWarned <= MAX_WARNING_AGE && e.brineWarned <= MAX_WARNING_AGE));
  }
  // S4-10: a non-zero age below 40% is rejected by the parser...
  const base = JSON.parse(JSON.stringify(serializeEcology(createEcology())));
  for (const [heat, heatWarned, ok] of [[39.9, 30, false], [0, 0.01, false], [39.9, 0, true], [40, 30, true]] as const)
    assert.equal(typeof parseEcology({ ...base, diver: { heat, brine: 0, heatWarned, brineWarned: 0 } }) !== "string", ok, `heat ${heat} age ${heatWarned}`);
  // ...and even an in-memory stale age is discarded when a new episode opens: full grace.
  const stale = createEcology();
  stale.diver = { heat: 39.9, brine: 0, heatWarned: 4.9, brineWarned: 0 };
  let warning: number | null = null, harm: number | null = null;
  for (let i = 0; i < 60 * 20 && harm === null; i++) {
    const r = stepEcology(stale, { tick: 2400 + i, stimulus: stimulus({ x: 90, y: -310, z: -500 }, { light: 0, noise: 0 }), protection: protectionFor(null, []), vehicleId: null }, world);
    if (warning === null && r.events.some(e => e.type === "hazard-warning" && e.hazard === "heat")) warning = i;
    if (r.effects.diverHealth > 0) harm = i;
  }
  assert.ok(warning !== null && harm !== null && (harm - warning) / 60 >= WARNING_LEAD, `fresh grace: warning ${warning}, harm ${harm}`);
});
