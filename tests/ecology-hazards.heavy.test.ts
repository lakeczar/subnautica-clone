// Ecology hazards, heavy tier (TT-1): every field, actor, phase and resumed load.
// tests/ecology-hazards.test.ts keeps the rest and a smaller smoke.
import test from "node:test";
import assert from "node:assert/strict";
import { HAZARD_FIELDS } from "../src/content/ecology/hazards.js";
import type { ProtectionId } from "../src/content/ecology/hazards.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { HULLS } from "../src/content/registry.js";
import type { HullId } from "../src/content/registry.js";
import { protectionFor } from "../src/sim/ecology/hazards.js";
import { layerY } from "../src/sim/ecology/agents.js";
import { createEcology, resumeEcology, stepEcology } from "../src/sim/ecology/ecology.js";
import { openWater } from "../src/sim/ecology/adapter.js";
import { WARNING_LEAD } from "../src/sim/ecology/types.js";
import { offset, stimulus } from "./ecology-support.js";

const plume = HAZARD_FIELDS.rift_split_plume;
const chimney = sitePosition(plume.shape.center);
const ventTick = (n: number): number => Math.round((plume.cycle.start + n * plume.cycle.period) * 60);

test("hazard harm always follows an observable warning by at least five seconds: every field, phase, protection and resumed load", () => {
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
  for (const c of cases) for (const [hull, fitted] of actors) for (let phase = 0; phase < 4; phase++) for (const resumed of [0, 39, 45, 85, 99.9, 100]) {
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
  assert.ok(checked > 20, `harmful cases exercised: ${checked}`);
  // A delivered episode resumed from a save gets a reminder, not fresh grace.
  const plumeAt = { ...chimney, y: chimney.y + 20 }, state = createEcology();
  state.diver = { heat: 100, brine: 0, heatWarned: 30, brineWarned: 0 };
  resumeEcology(state);
  const r = stepEcology(state, { tick: ventTick(1), stimulus: stimulus(plumeAt, { light: 0, noise: 0 }), protection: protectionFor(null, []), vehicleId: null }, openWater());
  assert.ok(r.events.some(e => e.type === "hazard-warning" && e.hazard === "heat"), "the load re-shows the current caption");
  assert.ok(r.effects.diverHealth > 0, "harm continues: the saved episode's grace was already spent");
});
