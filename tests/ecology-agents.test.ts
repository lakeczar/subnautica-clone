import test from "node:test";
import assert from "node:assert/strict";
import { THREATS, THREAT_AGENT_IDS, DIVER_ESCAPE_SPEED, MAX_ACTIVE_THREATS, ACTIVATION_RADIUS } from "../src/content/ecology/species.js";
import type { ThreatAgentId } from "../src/content/ecology/species.js";
import { FIRST_DEPOSITS } from "../src/content/ecology/hazards.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { activeThreats, canOccupy, canReach, definitionOf, layerY, perceive, stepAgent } from "../src/sim/ecology/agents.js";
import { WARNING_LEAD } from "../src/sim/ecology/types.js";
import { CURRENT_REFUGES, openWater } from "../src/sim/ecology/adapter.js";
import { sampleHazards } from "../src/sim/ecology/hazards.js";
import { parseEcology, serializeEcology } from "../src/sim/ecology/persist.js";
import { stepEcology } from "../src/sim/ecology/ecology.js";
import { protectionFor } from "../src/sim/ecology/hazards.js";
import type { EcologyState, Stimulus } from "../src/sim/ecology/types.js";
import { agent, createEcology, cues, homeOf, offset, run, stimulus, strikes } from "./ecology-support.js";

const STALKER = "rift_stalker_passage", SKATE = "divide_skate_saddle", CHOIR = "district_choir_gallery";
const firstTick = (log: ReturnType<typeof run>, id: ThreatAgentId, cue: string): number | undefined => cues(log, id).find(c => c.cue === cue)?.tick;

test("every roster animal starts inside its habitat, away from refuges, deposits and the escape budget", () => {
  for (const id of THREAT_AGENT_IDS) {
    const def = definitionOf(id), home = homeOf(id);
    assert.ok(canOccupy(id, home, openWater({ refuges: CURRENT_REFUGES }), 0), `${id} home is occupiable`);
    for (const r of CURRENT_REFUGES)
      assert.ok(Math.hypot(home.x - r.position.x, home.y - r.position.y, home.z - r.position.z) > def.territory + def.reach + r.radius, `${id} territory clear of refuge`);
    // A quiet diver crosses the whole territory and strike reach during one refractory window.
    assert.ok(def.timing.refractory * DIVER_ESCAPE_SPEED >= 2 * (def.territory + def.reach), `${id} refractory covers escape`);
    // Every warning stage lasts long enough to read and react to.
    assert.ok(def.timing.alert + def.timing.investigate >= 5, `${id} warns at least 5 s before a lunge`);
    assert.ok(def.maxCycles * Math.max(def.strike.diver, def.strike.hull) <= 30, `${id} engagement damage is bounded`);
  }
  for (const [material, deposit] of Object.entries(FIRST_DEPOSITS)) {
    const p = sitePosition(deposit.at);
    for (const id of THREAT_AGENT_IDS)
      for (let tick = 0; tick < 60 * 120; tick += 60)
        assert.equal(canReach(id, stimulus(p), openWater(), tick), false, `${id} cannot reach the first ${material}`);
  }
});

test("glare stalker warns, investigates and only then lunges at a lit, noisy craft; each stage is captioned", () => {
  const state = createEcology(), p = offset(homeOf(STALKER), 18, 0, 0);
  const log = run(state, 60 * 40, () => stimulus(p, { light: 0.9, hull: "dart", radius: 3.6, noise: 0.48 }));
  const seen = cues(log, STALKER);
  assert.deepEqual(seen.slice(0, 4).map(c => c.cue), ["alert", "investigate", "commit", "withdraw"]);
  assert.match(seen[0]!.caption, /seen your lamp/);
  const alert = firstTick(log, STALKER, "alert")!, commit = firstTick(log, STALKER, "commit")!;
  const def = THREATS.glare_stalker;
  assert.ok(commit - alert >= (def.timing.alert + def.timing.investigate) * 60, "warning precedes the lunge");
  const own = strikes(log, STALKER);
  assert.ok(own.length >= 1 && own.length <= def.maxCycles, "at most one strike per cycle");
  assert.ok(own.every(s => s.tick > commit), "no strike before the commit cue");
  assert.equal(agent(state, STALKER).refractory > 0 || agent(state, STALKER).mode !== "rest", true);
});

test("running dark and quiet, the same diver is never noticed by the stalker", () => {
  const state = createEcology(), p = offset(homeOf(STALKER), 10, 0, 0);
  const log = run(state, 60 * 60, () => stimulus(p, { light: 0, noise: 0.03 }));
  assert.equal(cues(log, STALKER).length, 0);
  assert.equal(strikes(log).length, 0);
});

test("dimming the lamp at the first warning prevents the lunge", () => {
  const state = createEcology(), p = offset(homeOf(STALKER), 12, 0, 0);
  let dark = false;
  const log = run(state, 60 * 40, (_t, s) => {
    if (s.agents.some(a => a.mode !== "rest")) dark = true;
    return stimulus(p, dark ? { light: 0, noise: 0.03 } : { light: 0.6 });
  });
  const rift = ["rift_stalker_passage", "rift_stalker_chimney"] as const;
  assert.ok(rift.some(id => firstTick(log, id, "alert") !== undefined), "a stalker did warn");
  assert.equal(rift.some(id => cues(log, id).some(c => c.cue === "commit")), false);
  assert.equal(strikes(log).length, 0);
  assert.ok(rift.every(id => agent(state, id).mode === "rest"));
});

test("the stalker never enters cool water, and a diver in cool water beside the passage is unreachable", () => {
  const world = openWater(), state = createEcology();
  const passageEdgeX = homeOf(STALKER).x - 19 - 8; // 8 m beyond the warm passage's west face
  const p = { ...homeOf(STALKER), x: passageEdgeX };
  assert.ok(sampleHazards(p, 0).heat < 0.05, "test diver is in cool water");
  const log = run(state, 60 * 60, (tick, s) => {
    for (const a of s.agents.filter(a => a.id.startsWith("rift_")))
      assert.ok(sampleHazards(a.position, tick).heat >= THREATS.glare_stalker.habitat.minHeat, `${a.id} stays warm`);
    return stimulus(p, { light: 1, noise: 0.6 });
  }, { world });
  assert.equal(strikes(log).length, 0);
  assert.equal(cues(log, STALKER).some(c => c.cue === "commit"), false);
});

test("fleeing to cool water mid-approach breaks the engagement with a leash caption", () => {
  const state = createEcology(), inside = offset(homeOf(STALKER), 12, 0, 0), cool = { ...homeOf(STALKER), x: homeOf(STALKER).x - 30 };
  let fled = false;
  const log = run(state, 60 * 40, (_t, s) => {
    if (agent(s, STALKER).mode === "investigate") fled = true;
    return stimulus(fled ? cool : inside, { light: 0.9, noise: 0.48 });
  });
  assert.ok(cues(log, STALKER).some(c => c.cue === "leash" && /will not follow/.test(c.caption)));
  assert.equal(strikes(log, STALKER).length, 0);
});

test("layer skate cannot reach a diver above the layer, and never rises above it", () => {
  const state = createEcology(), top = layerY("divide_dense_layer");
  const p = { ...homeOf(SKATE), y: top + 5 };
  const log = run(state, 60 * 60, (_t, s) => {
    for (const a of s.agents.filter(a => a.id.startsWith("divide_"))) assert.ok(a.position.y <= top + THREATS.layer_skate.habitat.above + 1e-9, `${a.id} below layer`);
    return stimulus(p, { noise: 0.6, velocity: { x: 3, y: -1, z: 0 } });
  });
  assert.equal(strikes(log).length, 0);
});

test("a slow quiet layer crossing goes unnoticed; a fast one is warned, then struck once", () => {
  const top = layerY("divide_dense_layer"), p = { ...homeOf(SKATE), x: homeOf(SKATE).x + 6, y: top };
  const slow = createEcology(), fast = createEcology();
  const quiet = run(slow, 60 * 40, () => stimulus(p, { noise: 0.03, velocity: { x: 0, y: -0.25, z: 0 } }));
  assert.equal(cues(quiet, SKATE).length, 0);
  const loud = run(fast, 60 * 40, () => stimulus(p, { noise: 0.14, velocity: { x: 0, y: -1.2, z: 0 } }));
  assert.match(cues(loud, SKATE)[0]!.caption, /mirror layer dimples/);
  assert.equal(strikes(loud, SKATE).length, THREATS.layer_skate.maxCycles);
});

test("hollow choir answers sustained Creel cruise noise with a pulse but ignores quiet coasting", () => {
  const p = offset(homeOf(CHOIR), 12, 4, 0);
  const cruise = run(createEcology(), 60 * 40, () => stimulus(p, { noise: 0.62, hull: "creel", radius: 4.5, light: 0 }));
  assert.ok(strikes(cruise, CHOIR).length >= 1);
  assert.match(cues(cruise, CHOIR)[0]!.caption, /hum with your noise/);
  const quiet = run(createEcology(), 60 * 40, () => stimulus(p, { noise: 0.12, hull: "creel", radius: 4.5, light: 0 }));
  assert.equal(cues(quiet, CHOIR).length, 0);
});

test("an acoustic pulse elsewhere spends the choir; a glow lure leads the stalker away; ink breaks a lunge", () => {
  const choirAt = offset(homeOf(CHOIR), 12, 4, 0);
  let decoyed = false;
  const choir = run(createEcology(), 60 * 30, () => stimulus(choirAt, { noise: 0.62, hull: "creel", radius: 4.5, light: 0 }), {
    commands: () => {
      if (decoyed) return [];
      decoyed = true;
      return [{ type: "deploy", kind: "acoustic", position: offset(homeOf(CHOIR), -20, 0, 10) }];
    },
  });
  assert.ok(cues(choir, CHOIR).some(c => c.cue === "lure"));
  assert.equal(strikes(choir, CHOIR).length, 0);

  const lit = offset(homeOf(STALKER), 12, 0, 0);
  let lured = false;
  const lureState = createEcology();
  const lure = run(lureState, 60 * 18, () => stimulus(lit, { light: 0.6 }), {
    commands: () => {
      if (lured || !lureState.agents.some(a => a.mode === "alert")) return [];
      lured = true;
      return [{ type: "deploy", kind: "lure", position: offset(homeOf(STALKER), -10, 0, 4) }];
    },
  });
  assert.ok(lured && cues(lure, STALKER).some(c => c.cue === "lure"));
  assert.equal(strikes(lure).length, 0);

  const inkState = createEcology();
  let inked = false;
  const ink = run(inkState, 60 * 30, () => stimulus(offset(homeOf(STALKER), 18, 0, 0), { light: 0.9, hull: "dart", radius: 3.6, noise: 0.48 }), {
    commands: () => {
      const lunging = inkState.agents.find(a => a.mode === "commit");
      if (inked || !lunging) return [];
      inked = true;
      return [{ type: "deploy", kind: "ink", position: offset(homeOf(STALKER), 18, 0, 0) }];
    },
  });
  assert.ok(cues(ink, STALKER).some(c => c.cue === "ink") || cues(ink, "rift_stalker_chimney").some(c => c.cue === "ink"));
  assert.ok(strikes(ink).length < strikes(run(createEcology(), 60 * 30, () => stimulus(offset(homeOf(STALKER), 18, 0, 0), { light: 0.9, hull: "dart", radius: 3.6, noise: 0.48 }))).length);
});

test("no animal notices or strikes a player inside a refuge, and an engaged animal withdraws", () => {
  const state = createEcology(), p = offset(homeOf(STALKER), 12, 0, 0);
  let safe = false;
  const log = run(state, 60 * 30, (_t, s) => {
    if (agent(s, STALKER).mode === "investigate") safe = true;
    return stimulus(p, { light: 0.9, noise: 0.6, inRefuge: safe });
  });
  assert.ok(safe);
  assert.equal(strikes(log).length, 0);
  assert.ok(cues(log, STALKER).some(c => c.cue === "leash"));
});

test("simulation is deterministic and survives a save/load in the middle of an encounter", () => {
  const path = (tick: number): Stimulus => stimulus(offset(homeOf(STALKER), 14 + Math.sin(tick / 90) * 6, Math.cos(tick / 140) * 3, Math.sin(tick / 70) * 5),
    { light: tick % 900 < 600 ? 0.9 : 0, noise: 0.48, hull: "dart", radius: 3.6 });
  const a = createEcology(), b = createEcology();
  const logA = run(a, 1500, path), logB = run(b, 700, path);
  const loaded = parseEcology(JSON.parse(JSON.stringify(serializeEcology(b))));
  assert.notEqual(typeof loaded, "string", String(loaded));
  const resumed = loaded as EcologyState;
  const rest = run(resumed, 800, path, { start: 700 });
  assert.deepEqual(resumed, a);
  assert.deepEqual([...logB.events, ...rest.events], logA.events);
  assert.ok(logA.events.some(e => e.event.type === "ecology-strike"), "the window includes an actual strike");
});

test("only nearby animals simulate; distant ones rest unchanged at home", () => {
  assert.ok(activeThreats(homeOf(STALKER)).length <= MAX_ACTIVE_THREATS);
  assert.deepEqual(activeThreats(homeOf(STALKER)), ["rift_stalker_passage", "rift_stalker_chimney"]);
  const state = createEcology(), before = structuredClone(state.agents.filter(a => !a.id.startsWith("rift_")));
  run(state, 600, () => stimulus(offset(homeOf(STALKER), 10, 0, 0), { light: 1, noise: 1 }));
  assert.deepEqual(state.agents.filter(a => !a.id.startsWith("rift_")), before);
  for (const id of THREAT_AGENT_IDS)
    assert.ok(activeThreats(homeOf(id)).includes(id) && ACTIVATION_RADIUS > definitionOf(id).territory);
  // Leaving the region far behind returns an engaged animal to rest.
  const away = { x: 0, y: -10, z: 0 };
  const r = stepEcology(state, { tick: 600, stimulus: stimulus(away), protection: protectionFor(null, []), vehicleId: null }, openWater());
  assert.equal(r.events.length, 0);
  assert.ok(state.agents.every(a => a.mode === "rest" && a.awareness === 0));
});

test("cover: a wall between animal and diver blocks contact and pulses; engagements end without harm", () => {
  // Reviewer repro: a static wall beside the skate's home, diver at the layer just past it.
  const home = homeOf(SKATE), top = layerY("divide_dense_layer");
  const wall = openWater({ solids: [{ min: { x: home.x + 0.9, y: home.y - 10, z: home.z - 10 }, max: { x: home.x + 1.1, y: home.y + 20, z: home.z + 10 } }] });
  const skate = run(createEcology(), 60 * 60, () => stimulus({ ...home, x: home.x + 2, y: top }, { noise: 0.6 }), { world: wall });
  assert.equal(strikes(skate).length, 0, "no skate strike through the wall");
  // Stalker: a commit already under way when cover comes between.
  const p = offset(homeOf(STALKER), 12, 0, 0), state = createEcology();
  let tick = 0;
  while (!state.agents.some(a => a.id === STALKER && a.mode === "commit") && tick < 2400)
    stepEcology(state, { tick: tick++, stimulus: stimulus(p, { light: 1, noise: 1 }), protection: protectionFor(null, []), vehicleId: null }, openWater());
  const a = agent(state, STALKER), d = { x: p.x - a.position.x, y: p.y - a.position.y, z: p.z - a.position.z }, n = Math.hypot(d.x, d.y, d.z);
  const q = { x: a.position.x + d.x / n * 2, y: a.position.y + d.y / n * 2, z: a.position.z + d.z / n * 2 };
  const mid = { x: (a.position.x + q.x) / 2, y: (a.position.y + q.y) / 2, z: (a.position.z + q.z) / 2 };
  const cover = openWater({ solids: [{ min: offset(mid, -0.1, -3, -3), max: offset(mid, 0.1, 3, 3) }] });
  assert.equal(cover.clearLine(a.position, q), false);
  const out = stepAgent(a, stimulus(q, { light: 1, noise: 1 }), cover, tick, []);
  assert.equal(out.diverLoss, 0, "a lunge in reach still cannot bite through rock");
  // Choir: shelter behind a wall inside the pulse radius takes nothing; in the open it does.
  const ch = homeOf(CHOIR), at = offset(ch, 10, 4, 0);
  const shelter = openWater({ solids: [{ min: offset(ch, 6, -2, -6), max: offset(ch, 7, 12, 6) }] });
  // A boosting Creel: noise still carries (muffled) through cover, light does not.
  const sheltered = run(createEcology(), 60 * 60, () => stimulus(at, { noise: 1, hull: "creel", radius: 4.5, light: 0 }), { world: shelter });
  assert.ok(cues(sheltered, CHOIR).some(c => c.cue === "commit"), "the choir still builds and releases its pulse");
  assert.equal(strikes(sheltered, CHOIR).length, 0, "cover between the bells and the diver shelters from the pulse");
  const open = run(createEcology(), 60 * 40, () => stimulus(at, { noise: 0.62, hull: "creel", radius: 4.5, light: 0 }));
  assert.ok(strikes(open, CHOIR).length >= 1);
});

test("every lunge and pulse follows its animal's first warning of that engagement by at least five seconds", () => {
  let seed = 12345;
  const random = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  let strikesSeen = 0;
  for (const id of [STALKER, SKATE, CHOIR] as const) for (let trial = 0; trial < 6; trial++) {
    const home = homeOf(id), state = createEcology();
    // A wandering, flickering, sometimes-loud player around the home.
    let p = id === SKATE ? { ...home, x: home.x + 8, y: layerY("divide_dense_layer") } : offset(home, 10, id === CHOIR ? 4 : 0, 0);
    const log = run(state, 60 * 90, tick => {
      if (tick % 30 === 0) p = offset(p, (random() - 0.5) * 2, id === SKATE ? 0 : (random() - 0.5), (random() - 0.5) * 2);
      return stimulus(p, { light: random() < 0.7 ? 0.9 : 0, noise: random() < 0.6 ? 0.6 : 0.03, velocity: { x: 0, y: id === SKATE ? -1 : 0, z: 0 } });
    });
    const firstAlert = new Map<string, number>();
    for (const { tick, event: e } of log.events) {
      if (e.type === "ecology-cue") {
        if (e.cue === "alert" && !firstAlert.has(e.agentId)) firstAlert.set(e.agentId, tick);
        if (e.cue === "calm" || e.cue === "leash") firstAlert.delete(e.agentId);
      }
      if (e.type === "ecology-strike") {
        strikesSeen++;
        const warned = firstAlert.get(e.agentId);
        assert.ok(warned !== undefined && (tick - warned) / 60 >= WARNING_LEAD, `${e.agentId} trial ${trial}: strike ${tick}, warned ${warned}`);
      }
    }
  }
  assert.ok(strikesSeen >= 6, `strikes exercised: ${strikesSeen}`);
});

test("layer vibration through rock is muffled by the skate's cover factor, not blocked or passed whole", () => {
  const home = homeOf(SKATE), top = layerY("divide_dense_layer"), s = stimulus({ ...home, x: home.x + 6, y: top }, { noise: 0, light: 0, velocity: { x: 0, y: -1.2, z: 0 } });
  const a = { ...agent(createEcology(), SKATE) };
  const open = perceive(a, s, openWater(), 0, []);
  const wall = openWater({ solids: [{ min: { x: home.x + 2.9, y: home.y - 10, z: home.z - 10 }, max: { x: home.x + 3.1, y: home.y + 20, z: home.z + 10 } }] });
  const covered = perceive(a, s, wall, 0, []);
  assert.equal(open.dominant, "layer");
  assert.ok(open.rate > 0 && Math.abs(covered.rate - open.rate * THREATS.layer_skate.coverPass) < 1e-9,
    `covered ${covered.rate} = open ${open.rate} × ${THREATS.layer_skate.coverPass}`);
});
