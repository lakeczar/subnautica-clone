import test from "node:test";
import assert from "node:assert/strict";
import { parseEcology, serializeEcology } from "../src/sim/ecology/persist.js";
import { createEcology, stepEcology } from "../src/sim/ecology/ecology.js";
import { ecologyWorldFrom } from "../src/sim/ecology/adapter.js";
import { stimulusFrom } from "../src/sim/ecology/stimulus.js";
import { protectionFor } from "../src/sim/ecology/hazards.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { createWorldQueries, SOLIDS } from "../src/sim/world.js";
import { THREAT_AGENT_IDS } from "../src/content/ecology/species.js";

test("the proposed ecology save block round-trips and rejects malformed data", () => {
  const state = createEcology();
  state.deterrents.push({ kind: "lure", position: { x: 1, y: -300, z: 2 }, seconds: 4 });
  state.hulls["dart-1"] = { heat: 12, brine: 0 };
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
    ["bad hull key", x => { x.hulls["../x"] = { heat: 0, brine: 0 }; }],
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
