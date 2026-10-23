import test from "node:test";
import assert from "node:assert/strict";
import { EXPOSURE, FIRST_DEPOSITS, HAZARD_FIELDS, PROTECTION, UNPROTECTED } from "../src/content/ecology/hazards.js";
import type { HazardFieldId, ProtectionId } from "../src/content/ecology/hazards.js";
import { DETERRENT_KITS } from "../src/content/ecology/equipment.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { HULLS, SOURCES } from "../src/content/registry.js";
import type { HullId, MaterialId } from "../src/content/registry.js";
import { cycleLevel, driftFrom, emptyExposure, fieldLevel, pressureBand, pressureWarning, protectionFor, sampleHazards, secondsUntilActive, stepExposure } from "../src/sim/ecology/hazards.js";
import { miteScatter, sailPositions, scavengerRetreat } from "../src/sim/ecology/cues.js";
import { layerY } from "../src/sim/ecology/agents.js";
import { createEcology, resumeEcology, stepEcology } from "../src/sim/ecology/ecology.js";
import { openWater } from "../src/sim/ecology/adapter.js";
import { WARNING_LEAD } from "../src/sim/ecology/types.js";
import type { EcologyEvent, Exposure } from "../src/sim/ecology/types.js";
import { offset, stimulus } from "./ecology-support.js";

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
  const load: Exposure = emptyExposure(), events: EcologyEvent[] = [];
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
  const hullWarn = stepExposure({ ...emptyExposure(), heat: 39.99 }, sampleHazards(inside, ventTick(1)), protectionFor("dart", []), false, false);
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
    if (s.item !== "meal" && s.item !== "tagged_frame" && !s.item.startsWith("seed_")) early.set(s.item as MaterialId, Math.min(early.get(s.item as MaterialId) ?? Infinity, -s.position.y));
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

test("ember mites leave the lip, and scavengers retreat, at least five seconds before each field starts rising", () => {
  /** First tick at which a field rises above its quiet baseline (its hazardous onset). */
  const onset = (id: "rift_split_plume" | "basin_sediment_lane", from: number): number => {
    const base = HAZARD_FIELDS[id].baseline ?? 0;
    let t = from;
    while (fieldLevel(id, t) <= base + 1e-9) t++;
    return t;
  };
  for (const [id, cue, period] of [["rift_split_plume", (t: number) => miteScatter(t).scatter, plume.cycle.period],
    ["basin_sediment_lane", (t: number) => scavengerRetreat(t, null).retreat, HAZARD_FIELDS.basin_sediment_lane.cycle.period]] as const) {
    let from = 0;
    for (let n = 0; n < 5; n++) {
      // Start each search while the field is quiet and the animals are back.
      while (fieldLevel(id, from) > (HAZARD_FIELDS[id].baseline ?? 0) + 1e-9 || cue(from) > 0) from++;
      const rise = onset(id, from);
      let signalled = from;
      while (cue(signalled) < 0.5) signalled++;
      assert.ok((rise - signalled) / 60 >= WARNING_LEAD, `${id} cycle ${n}: cue ${((rise - signalled) / 60).toFixed(2)} s before onset`);
      from = rise + Math.round(period * 30);
    }
  }
  const surge = Math.round((HAZARD_FIELDS.basin_sediment_lane.cycle.start + HAZARD_FIELDS.basin_sediment_lane.cycle.period) * 60);
  assert.equal(scavengerRetreat(surge - 60 * 30, null).retreat, 0, "they feed again between surges");
  const loudCreel = stimulus(sitePosition({ site: "basin_wreck_ridge", offset: { x: 4, y: 2, z: -6 } }), { hull: "creel", noise: 0.62, radius: 4.5 });
  assert.equal(scavengerRetreat(surge - 60 * 30, loudCreel).retreat, 1, "loud machinery sends them in too");
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
  const f = HAZARD_FIELDS.divide_downwelling, c = sitePosition(f.shape.center);
  const p = { x: c.x + (f.shape.min.x + f.shape.max.x) / 2, y: c.y + (f.shape.min.y + f.shape.max.y) / 2, z: c.z + (f.shape.min.z + f.shape.max.z) / 2 };
  // C4: the downwelling slackens on a cycle; sample it running, then slack.
  const running = Math.round((f.cycle.start + 1) * 60), slack = Math.round((f.cycle.start + f.cycle.duration + f.cycle.ramp + 2) * 60);
  assert.ok(Math.hypot(sampleHazards(p, slack).flow.x, sampleHazards(p, slack).flow.y, sampleHazards(p, slack).flow.z) <
    0.2 * Math.hypot(sampleHazards(p, running).flow.x, sampleHazards(p, running).flow.y, sampleHazards(p, running).flow.z), "slack water is weak");
  const s = sampleHazards(p, running), speed = (v: { x: number; y: number; z: number }): number => Math.hypot(v.x, v.y, v.z);
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
  assert.ok(state.diver.heat < 100 && state.hulls.find(h => h.id === "dart-1")!.heat > 0 && r.effects.diverHealth === 0);
  const box = HAZARD_FIELDS.basin_sediment_lane.shape, anchor = sitePosition(box.center);
  const lane = { x: anchor.x + (box.min.x + box.max.x) / 2, y: anchor.y + (box.min.y + box.max.y) / 2, z: anchor.z + (box.min.z + box.max.z) / 2 };
  const surging = stepEcology(createEcology(), { tick: Math.round(HAZARD_FIELDS.basin_sediment_lane.cycle.start * 60 + 120), stimulus: stimulus(lane, { light: 0, noise: 0 }), protection: protectionFor(null, []), vehicleId: null }, openWater());
  assert.ok(surging.effects.visibility < 0.5 && surging.effects.drift.z > 0);
  const fieldIds = Object.keys(HAZARD_FIELDS) as HazardFieldId[];
  assert.ok(fieldIds.every(id => HAZARD_FIELDS[id].cue.length > 40), "every field has an observable cue");
});

test("smoke: hazard harm always follows an observable warning by at least five seconds (every field and protection at phase 0, fresh and resumed at 99.9)", () => {
  // Every phase and resumed load: tests/ecology-hazards.heavy.test.ts (TT-1).
  type Case = { field: "rift_split_plume" | "rift_warm_passage" | "divide_dense_layer"; at: { x: number; y: number; z: number } };
  const saddle = sitePosition(HAZARD_FIELDS.divide_dense_layer.shape.center);
  const cases: Case[] = [
    { field: "rift_split_plume", at: { ...chimney, y: chimney.y + 20 } },
    { field: "rift_warm_passage", at: offset(chimney, -26, 6, 0) },
    { field: "divide_dense_layer", at: { ...saddle, x: saddle.x - 70, y: layerY("divide_dense_layer") - 4 } },
  ];
  const actors: [HullId | null, ProtectionId[]][] = [[null, []], [null, ["heat_shroud"]], [null, ["brine_seals"]],
    ...(Object.keys(HULLS) as HullId[]).map((h): [HullId, ProtectionId[]] => [h, []]), ["dart", ["hull_heat_lining"]]];
  let checked = 0;
  // Resumed loads use a pending (never delivered, age 0) warning: that is the
  // only post-load case entitled to grace. A delivered episode is checked below.
  for (const c of cases) for (const [hull, fitted] of actors) for (let phase = 0; phase < 1; phase++) for (const resumed of [0, 99.9]) {
    const state = createEcology(), vehicleId = hull ? "Fleet_Hull-1" : null;
    if (resumed > 0) {
      const load = { heat: resumed, brine: resumed, heatWarned: 0, brineWarned: 0 };
      if (vehicleId) state.hulls.push({ id: vehicleId, ...load }); else state.diver = load;
      resumeEcology(state);
    }
    const start = Math.round(phase / 4 * plume.cycle.period * 60);
    let firstWarning: number | null = null, firstHarm: number | null = null;
    for (let i = 0; i < 60 * 25 && firstHarm === null; i++) {
      const r = stepEcology(state, { tick: start + i, stimulus: stimulus(c.at, { hull, radius: hull ? 3.6 : 0.4, light: 0, noise: 0 }),
        protection: protectionFor(hull, fitted), vehicleId }, openWater());
      if (firstWarning === null && r.events.some(e => e.type === "hazard-warning" && e.level >= 40)) firstWarning = i;
      if (r.effects.diverHealth + r.effects.vehicleHealth > 0) firstHarm = i;
    }
    if (firstHarm !== null) {
      checked++;
      assert.ok(firstWarning !== null && (firstHarm - firstWarning) / 60 >= WARNING_LEAD - 1e-9,
        `${c.field} ${hull ?? "diver"} ${fitted.join("+")} phase ${phase} resumed ${resumed}: warning ${firstWarning}, harm ${firstHarm}`);
    }
  }
  assert.ok(checked > 3, `harmful cases exercised: ${checked}`);
  // A delivered episode resumed from a save gets a reminder, not fresh grace.
  const plumeAt = { ...chimney, y: chimney.y + 20 }, state = createEcology();
  state.diver = { heat: 100, brine: 0, heatWarned: 30, brineWarned: 0 };
  resumeEcology(state);
  const r = stepEcology(state, { tick: ventTick(1), stimulus: stimulus(plumeAt, { light: 0, noise: 0 }), protection: protectionFor(null, []), vehicleId: null }, openWater());
  assert.ok(r.events.some(e => e.type === "hazard-warning" && e.hazard === "heat"), "the load re-shows the current caption");
  assert.ok(r.effects.diverHealth > 0, "harm continues: the saved episode's grace was already spent");
});
