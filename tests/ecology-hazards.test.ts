import test from "node:test";
import assert from "node:assert/strict";
import { EXPOSURE, FIRST_DEPOSITS, HAZARD_FIELDS, PROTECTION, UNPROTECTED } from "../src/content/ecology/hazards.js";
import type { HazardFieldId, ProtectionId } from "../src/content/ecology/hazards.js";
import { DETERRENT_KITS } from "../src/content/ecology/equipment.js";
import { CUE_SPECIES } from "../src/content/ecology/species.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { SOURCES } from "../src/content/registry.js";
import type { MaterialId } from "../src/content/registry.js";
import { cycleLevel, driftFrom, pressureBand, pressureWarning, protectionFor, sampleHazards, secondsUntilActive, stepExposure } from "../src/sim/ecology/hazards.js";
import { miteScatter, sailPositions, scavengerRetreat } from "../src/sim/ecology/cues.js";
import { layerY } from "../src/sim/ecology/agents.js";
import { createEcology, stepEcology } from "../src/sim/ecology/ecology.js";
import { openWater } from "../src/sim/ecology/adapter.js";
import type { EcologyEvent, Exposure } from "../src/sim/ecology/types.js";
import { stimulus } from "./ecology-support.js";

const plume = HAZARD_FIELDS.rift_split_plume;
const chimney = sitePosition(plume.shape.center);
const ventTick = (n: number): number => Math.round((plume.cycle.start + n * plume.cycle.period) * 60);

test("cycled fields follow a deterministic trapezoid keyed to the saved tick", () => {
  const c = plume.cycle;
  assert.equal(cycleLevel(c, ventTick(0)), 1);
  assert.equal(cycleLevel(c, ventTick(0) + (c.duration + c.ramp / 2) * 60), 0.5);
  assert.equal(cycleLevel(c, ventTick(0) + (c.duration + c.ramp + 1) * 60), 0);
  assert.equal(secondsUntilActive(c, ventTick(2)), 0);
  assert.ok(Math.abs(secondsUntilActive(c, ventTick(2) - 600) - 10) < 1e-9);
  assert.equal(cycleLevel(c, ventTick(3)), cycleLevel(c, ventTick(0)));
});

/** Steps one exposure load along a path and collects warnings and harm. */
function expose(path: (i: number) => { p: { x: number; y: number; z: number }; tick: number }, steps: number, fitted: ProtectionId[] = [], hull: null | "mantle" | "dart" = null) {
  const load: Exposure = { heat: 0, brine: 0 }, events: EcologyEvent[] = [];
  let harm = 0, peak = 0;
  for (let i = 0; i < steps; i++) {
    const { p, tick } = path(i);
    const r = stepExposure(load, sampleHazards(p, tick), protectionFor(hull, fitted), hull === null, false);
    events.push(...r.events); harm += r.harm; peak = Math.max(peak, load.heat, load.brine);
  }
  return { load, events, harm, peak };
}

test("a vent warns at 40, 70 and 100 naming the heat shroud before it harms; a shroud slows it; timing avoids it", () => {
  const inside = { ...chimney, y: chimney.y + 20 };
  const unprotected = expose(i => ({ p: inside, tick: ventTick(1) + i }), 60 * 12);
  assert.deepEqual(unprotected.events.map(e => e.type === "hazard-warning" && e.level), [40, 70, 100]);
  for (const e of unprotected.events) assert.ok(e.type === "hazard-warning" && e.protection.includes("heat_shroud") && /cool/.test(e.caption));
  assert.ok(unprotected.harm > 0);
  const shroud = expose(i => ({ p: inside, tick: ventTick(1) + i }), 60 * 12, ["heat_shroud"]);
  assert.ok(shroud.peak < unprotected.peak && shroud.harm === 0, "the shroud holds through a 12 s exposure");
  // Between vents the same column is at its quiet baseline: no load at all.
  const quiet = expose(i => ({ p: inside, tick: ventTick(1) + (plume.cycle.duration + plume.cycle.ramp + 2) * 60 + i }), 60 * 20);
  assert.equal(quiet.peak, 0);
  const hullWarn = stepExposure({ heat: 39.99, brine: 0 }, sampleHazards(inside, ventTick(1)), protectionFor("dart", []), false, false);
  assert.ok(hullWarn.events.some(e => e.type === "hazard-warning" && e.protection.includes("hull_heat_lining")));
});

test("an unprotected diver can cross the warm passage at ordinary swim speed without a warning", () => {
  const f = HAZARD_FIELDS.rift_warm_passage, c = sitePosition(f.shape.center);
  const from = c.x + f.shape.min.x - 6, to = c.x + f.shape.max.x + 2, speed = 3.4;
  const steps = Math.ceil((to - from) / speed * 60);
  const crossing = expose(i => ({ p: { x: from + (i * speed) / 60, y: c.y + 5, z: c.z }, tick: ventTick(0) + 60 * 25 + i }), steps);
  assert.ok(crossing.peak < EXPOSURE.warnings[0], `peak ${crossing.peak.toFixed(1)}`);
  assert.equal(crossing.events.length, 0);
});

test("brine below the mirror layer etches an unprotected suit; lattice seals hold; above the layer is clean", () => {
  const top = layerY("divide_dense_layer"), saddle = sitePosition(HAZARD_FIELDS.divide_dense_layer.shape.center);
  const below = { ...saddle, y: top - 4 }, above = { ...saddle, x: saddle.x - 70, y: top + 8 };
  const bare = expose(() => ({ p: below, tick: 0 }), 60 * 12);
  assert.ok(bare.harm > 0 && bare.events.some(e => e.type === "hazard-warning" && e.protection.includes("brine_seals")));
  assert.equal(expose(() => ({ p: below, tick: 0 }), 60 * 30, ["brine_seals"]).harm, 0);
  assert.equal(sampleHazards(above, 0).brine, 0);
});

test("first later deposits lie inside the preceding configuration and outside every field they enable protection against", () => {
  for (const [material, d] of Object.entries(FIRST_DEPOSITS)) {
    const p = sitePosition(d.at), depth = -p.y;
    assert.ok(depth < d.configuration * 0.9, `${material} at ${depth} m leaves margin under ${d.configuration} m`);
    for (let tick = 0; tick < 60 * 200; tick += 30) {
      const h = sampleHazards(p, tick);
      assert.ok(h.heat <= UNPROTECTED.heat && h.brine === 0 && Math.hypot(h.flow.x, h.flow.y, h.flow.z) <= 0.2,
        `${material} deposit is safe unprotected at ${tick}`);
    }
  }
});

test("every protective and deterrent material is reachable before the hazard or animal it counters", () => {
  const early = new Map<MaterialId, number>();
  for (const s of Object.values(SOURCES))
    if (s.item !== "meal") early.set(s.item, Math.min(early.get(s.item) ?? Infinity, -s.position.y));
  const tierOf = (m: MaterialId): number => {
    if (m in FIRST_DEPOSITS) return FIRST_DEPOSITS[m as keyof typeof FIRST_DEPOSITS].configuration;
    const depth = early.get(m);
    assert.ok(depth !== undefined, `${m} has a current source`);
    return depth <= 60 ? 60 : depth <= 150 ? 150 : 350;
  };
  // A heat counter is first needed in the Rift (350 m configuration), a brine
  // counter below the Divide layer (450 m), a current counter at the saddle.
  const needed = { heat: 350, brine: 450, current: 450 } as const;
  for (const [id, p] of Object.entries(PROTECTION))
    for (const m of Object.keys(p.cost) as MaterialId[])
      assert.ok(tierOf(m) <= needed[p.counters as keyof typeof needed], `${id}: ${m} reachable before ${p.counters}`);
  for (const [id, kit] of Object.entries(DETERRENT_KITS))
    for (const m of Object.keys(kit.cost) as MaterialId[])
      assert.ok(tierOf(m) <= 150, `${id}: ${m} reachable from the reef, isles or upper Canopy`);
});

test("ember mites leave the lip several seconds before every vent; scavengers retreat before every surge", () => {
  for (let n = 1; n <= 5; n++) {
    let left: number | null = null;
    for (let t = ventTick(n) - 60 * 20; t <= ventTick(n); t++) if (left === null && miteScatter(t).scatter >= 0.5) left = t;
    assert.ok(left !== null && (ventTick(n) - left) / 60 >= CUE_SPECIES.ember_mites.lead - 2, `vent ${n}: ${left}`);
  }
  const lane = HAZARD_FIELDS.basin_sediment_lane, surge = (n: number): number => Math.round((lane.cycle.start + n * lane.cycle.period) * 60);
  for (let n = 1; n <= 4; n++) {
    let hid: number | null = null;
    for (let t = surge(n) - 60 * 20; t <= surge(n); t++) if (hid === null && scavengerRetreat(t, null).retreat >= 0.5) hid = t;
    assert.ok(hid !== null && (surge(n) - hid) / 60 >= CUE_SPECIES.basin_scavengers.lead - 2);
    assert.equal(scavengerRetreat(surge(n) - 60 * 30, null).retreat, 0, "they feed again between surges");
  }
  const loudCreel = stimulus(sitePosition({ site: "basin_wreck_ridge", offset: { x: 4, y: 2, z: -6 } }), { hull: "creel", noise: 0.62, radius: 4.5 });
  assert.equal(scavengerRetreat(surge(1) - 60 * 30, loudCreel).retreat, 1, "loud machinery sends them in too");
});

test("brine sails mark a calm lane well above the layer", () => {
  const top = layerY("divide_dense_layer");
  for (let t = 0; t < 60 * 600; t += 120)
    for (const p of sailPositions(t)) {
      const h = sampleHazards(p, t);
      assert.ok(p.y > top + 15 && h.brine === 0 && Math.hypot(h.flow.x, h.flow.y, h.flow.z) < 0.25, `sail at ${t}`);
    }
});

test("the saddle downwelling pushes a Hush hard and a Mantle barely; resin trim vanes help", () => {
  const f = HAZARD_FIELDS.divide_downwelling, c = sitePosition(f.shape.center), p = { ...c, y: c.y + 20 };
  const s = sampleHazards(p, 0), speed = (v: { x: number; y: number; z: number }): number => Math.hypot(v.x, v.y, v.z);
  const hush = speed(driftFrom(s, protectionFor("hush", []))), trimmed = speed(driftFrom(s, protectionFor("hush", ["trim_vanes"])));
  const mantle = speed(driftFrom(s, protectionFor("mantle", [])));
  assert.ok(hush > 0.7 && trimmed < hush && mantle < 0.2 && driftFrom(s, protectionFor("hush", [])).y < 0);
});

test("pressure bands name the next refit and where its material starts", () => {
  assert.equal(pressureBand(120, 150), "clear");
  assert.equal(pressureBand(140, 150), "creak");
  assert.equal(pressureBand(146, 150), "stress");
  assert.equal(pressureBand(151, 150), "limit");
  assert.match(pressureWarning(120, 130, 150)!, /350 m suit refit.*conductive crust.*Lantern Canopy/);
  assert.match(pressureWarning(300, 345, 350)!, /pressure ceramic.*cool Ember Rift flank/);
  assert.equal(pressureWarning(130, 120, 150), null);
});

test("stepEcology reports field exposure, harm, drift and visibility for the controlled actor only", () => {
  const state = createEcology(), inside = { ...chimney, y: chimney.y + 20 };
  let harm = 0; const warnings: number[] = [];
  for (let i = 0; i < 60 * 12; i++) {
    const r = stepEcology(state, { tick: ventTick(1) + i, stimulus: stimulus(inside, { light: 0, noise: 0 }), protection: protectionFor(null, []), vehicleId: null }, openWater());
    harm += r.effects.diverHealth;
    for (const e of r.events) if (e.type === "hazard-warning" && e.level) warnings.push(e.level);
  }
  assert.deepEqual(warnings, [40, 70, 100]);
  assert.ok(harm > 0 && state.diver.heat === 100);
  // Boarding a craft: the diver's load recovers while the hull takes exposure.
  const r = stepEcology(state, { tick: ventTick(1) + 720, stimulus: stimulus(inside, { hull: "dart", radius: 3.6, light: 0, noise: 0 }), protection: protectionFor("dart", []), vehicleId: "dart-1" }, openWater());
  assert.ok(state.diver.heat < 100 && state.hulls["dart-1"]!.heat > 0 && r.effects.diverHealth === 0);
  const lane = sitePosition(HAZARD_FIELDS.basin_sediment_lane.shape.center);
  const surging = stepEcology(createEcology(), { tick: Math.round(HAZARD_FIELDS.basin_sediment_lane.cycle.start * 60 + 120), stimulus: stimulus(lane, { light: 0, noise: 0 }), protection: protectionFor(null, []), vehicleId: null }, openWater());
  assert.ok(surging.effects.visibility < 0.5 && surging.effects.drift.z > 0);
  const fieldIds = Object.keys(HAZARD_FIELDS) as HazardFieldId[];
  assert.ok(fieldIds.every(id => HAZARD_FIELDS[id].cue.length > 40), "every field has an observable cue");
});
