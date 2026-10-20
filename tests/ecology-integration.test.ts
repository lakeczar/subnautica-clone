import test from "node:test";
import assert from "node:assert/strict";
import { parseEcology, serializeEcology } from "../src/sim/ecology/persist.js";
import { createEcology, resumeEcology, stepEcology } from "../src/sim/ecology/ecology.js";
import { layerY } from "../src/sim/ecology/agents.js";
import { HAZARD_FIELDS } from "../src/content/ecology/hazards.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { WARNING_LEAD } from "../src/sim/ecology/types.js";
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
  assert.deepEqual(after, before);
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

test("control transfer: an uncontrolled actor recovers silently, and on return harm waits five seconds after a delivered warning", () => {
  const saddle = sitePosition(HAZARD_FIELDS.divide_dense_layer.shape.center);
  const p = { ...saddle, x: saddle.x - 70, y: layerY("divide_dense_layer") - 1 };
  // The reviewer's cases: load in brine as one actor, step out (other actor
  // just above the layer), optionally save/load, then return to the exposed actor.
  for (const target of ["hull", "diver"] as const) for (const viaSave of [true, false]) {
    let state = createEcology(), tick = 0;
    const input = (t: number, controlled: boolean) => {
      const hull = controlled === (target === "hull") ? "dart" as const : null;
      return { tick: t, stimulus: stimulus(controlled ? p : { ...p, y: p.y + 2.2 }, { hull, light: 0, noise: 0 }),
        protection: protectionFor(hull, []), vehicleId: hull ? "Dart_1" : null };
    };
    const world = openWater();
    for (; tick < 600; tick++) stepEcology(state, input(tick, true), world);
    stepEcology(state, input(tick++, false), world);
    if (viaSave) {
      const parsed = parseEcology(JSON.parse(JSON.stringify(serializeEcology(state))), { vehicleIds: ["Dart_1"] });
      assert.notEqual(typeof parsed, "string", String(parsed));
      state = parsed as typeof state;
      resumeEcology(state);
    }
    for (let i = 0; i < 60; i++, tick++) {
      const r = stepEcology(state, input(tick, false), world);
      assert.equal(r.events.filter(e => e.type === "hazard-warning" && e.hazard === "brine").length, 0, "nothing is warned for an actor nobody controls");
    }
    let firstWarning: number | null = null, firstHarm: number | null = null;
    for (let i = 0; i < 600 && firstHarm === null; i++, tick++) {
      const r = stepEcology(state, input(tick, true), world);
      if (firstWarning === null && r.events.some(e => e.type === "hazard-warning" && e.hazard === "brine")) firstWarning = i;
      if ((target === "hull" ? r.effects.vehicleHealth : r.effects.diverHealth) > 0) firstHarm = i;
    }
    const label = `${target}${viaSave ? " via save" : ""}`;
    assert.ok(firstWarning !== null && firstHarm !== null, `${label}: a warning and harm both occur`);
    assert.equal(firstWarning, 0, `${label}: the warning is delivered on the first controlled step`);
    assert.ok((firstHarm - firstWarning) / 60 >= WARNING_LEAD, `${label}: warning ${firstWarning}, harm ${firstHarm}`);
  }
});
