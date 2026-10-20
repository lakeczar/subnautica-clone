import test from "node:test";
import assert from "node:assert/strict";
import { FIRST_DEPOSITS, HAZARD_FIELDS, UNPROTECTED } from "../src/content/ecology/hazards.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { THREAT_AGENT_IDS } from "../src/content/ecology/species.js";
import { HAZARDS } from "../src/content/regions/hazards.js";
import { SITES } from "../src/content/regions/sites.js";
import { RESCUE_PLANS } from "../src/content/regions/rescue.js";
import { siteDatum } from "../src/content/regions/access.js";
import { BRINE_Y } from "../src/content/regions/terrain.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { canOccupy, canReach, homeOf, layerY } from "../src/sim/ecology/agents.js";
import { ecologyWorldFrom } from "../src/sim/ecology/adapter.js";
import { createEcology } from "../src/sim/ecology/ecology.js";
import { sampleHazards, shapeWeight } from "../src/sim/ecology/hazards.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { Vec3 } from "../src/sim/types.js";
import { run, stimulus } from "./ecology-support.js";

/** S4's deposit, habitat and reach rules re-run against the composed world:
 * S2's floor and solids through the real adapter (C3). */
const world = ecologyWorldFrom(createWorldQueries());
const CYCLE = 60 * 200;
const harmful = (p: Vec3, tick: number): boolean => {
  const h = sampleHazards(p, tick);
  return h.heat > UNPROTECTED.heat || h.brine > 0 || Math.hypot(h.flow.x, h.flow.y, h.flow.z) > 0.2;
};

test("S4's anchors are S2's sites: first deposits, the brine interface and the chimney lip", () => {
  const datum = (id: string) => siteDatum(SITES.find((s) => s.id === id)!, worldFloor);
  assert.deepEqual(sitePosition(FIRST_DEPOSITS.pressure_ceramic.at), datum("rift_ceramic_lip_north"));
  assert.deepEqual(sitePosition(FIRST_DEPOSITS.thermal_core.at), datum("rift_core_shoulder_north"));
  assert.deepEqual(sitePosition(FIRST_DEPOSITS.brine_lattice.at), datum("divide_lattice_ledge_west"));
  assert.equal(layerY("divide_dense_layer"), BRINE_Y);
  // Every harmful S4 field lies within S2's matching protective volume (heat and brine).
  for (const [id, f] of Object.entries(HAZARD_FIELDS)) {
    if (f.kind !== "heat" && f.kind !== "brine") continue;
    const volumes = HAZARDS.filter((h) => h.kind === f.kind);
    const c = sitePosition(f.shape.center);
    const probe = f.shape.kind === "cylinder" ? { ...c, y: c.y + (f.shape.bottom + f.shape.top) / 2 }
      : f.shape.kind === "box" ? { x: c.x + (f.shape.min.x + f.shape.max.x) / 2, y: c.y + (f.shape.min.y + f.shape.max.y) / 2, z: c.z + (f.shape.min.z + f.shape.max.z) / 2 }
      : { x: c.x, y: c.y + f.shape.y - 5, z: c.z };
    assert.ok(shapeWeight(f.shape, f.edge, probe) > 0, `${id} probe`);
    assert.ok(volumes.some((h) => probe.x >= h.bounds.min.x && probe.x <= h.bounds.max.x && probe.y >= h.bounds.min.y &&
      probe.y <= h.bounds.max.y && probe.z >= h.bounds.min.z && probe.z <= h.bounds.max.z), `${id} inside an S2 ${f.kind} volume`);
  }
});

test("REAL WORLD: every S2 first-access deposit is free of fields over a full cycle and out of every animal's reach", () => {
  const firsts = SITES.filter((s) => s.firstAccess);
  assert.ok(firsts.length >= 6);
  for (const site of firsts) {
    const p = siteDatum(site, worldFloor), at = { ...p, y: p.y + 0.3 };
    for (let tick = 0; tick < CYCLE; tick += 30) assert.ok(!harmful(at, tick), `${site.id} unprotected at ${tick}`);
    for (const id of THREAT_AGENT_IDS) for (const tick of [0, 30 * 60, 75 * 60])
      assert.equal(canReach(id, stimulus(at, { light: 1, noise: 1 }), world, tick), false, `${id} reaches ${site.id}`);
  }
});

test("REAL WORLD: every rescue tether vertex stays out of heat and brine at all phases (sediment and current are readable, as in S2)", () => {
  for (const plan of RESCUE_PLANS) for (const [b, branch] of plan.tethers.entries())
    for (const [i, p] of branch.entries()) for (let tick = 0; tick < CYCLE; tick += 60) {
      const h = sampleHazards(p, tick);
      assert.ok(h.heat <= UNPROTECTED.heat && h.brine === 0, `${plan.id} branch ${b} vertex ${i} at ${tick}`);
    }
});

test("REAL WORLD: every animal's home is open water inside its habitat, on S2's floor and clear of its solids", () => {
  const q = createWorldQueries();
  for (const id of THREAT_AGENT_IDS) {
    const h = homeOf(id);
    assert.ok(h.y > worldFloor(h.x, h.z) + 0.6, `${id} above the floor (${(h.y - worldFloor(h.x, h.z)).toFixed(1)} m)`);
    assert.ok(q.clearance(h, { radius: 0.5, height: 0.5 }), `${id} clear of solids`);
    // Hazard cycles change the warm habitat's extent; it must hold at the quiet baseline.
    assert.ok(canOccupy(id, h, world, 0), `${id} habitat at home`);
  }
});

test("REAL WORLD ADVERSE: a diver lit and loud in the stalker's warm passage, then dark and climbing to cool water, escapes within the bound", () => {
  const state = createEcology(), home = homeOf("rift_stalker_passage");
  let p: Vec3 = { ...home, x: home.x + 6 };
  assert.ok(createWorldQueries().clearance(p, { radius: 0.34, height: 0.95 }), "start pose clear");
  // S4's protocol: linger lit and loud until every engaged animal rests in its
  // refractory window, then go dark and climb out at a quiet swim.
  let lingered = 0, linger = { diverLoss: 0 };
  const engaged = () => state.agents.some((a) => a.mode === "alert" || a.mode === "investigate" || a.mode === "commit" || a.mode === "withdraw");
  do {
    const chunk = run(state, 60, () => stimulus(p, { light: 0.6, noise: 0.6 }), { world, start: 600 + lingered });
    linger.diverLoss += chunk.diverLoss; lingered += 60;
  } while ((engaged() || !state.agents.some((a) => a.refractory > 0)) && lingered < 60 * 120);
  assert.ok(state.agents.some((a) => a.refractory > 0), "an animal engaged and spent itself");
  const escape = run(state, 60 * 40, () => {
    if (sampleHazards(p, 0).heat > 0 || p.y < home.y + 40) p = { ...p, y: p.y + 2 / 60 };
    return stimulus(p, { light: 0, noise: 0.03, velocity: { x: 0, y: 2, z: 0 } });
  }, { world, start: 600 + lingered });
  const total = linger.diverLoss + escape.diverLoss;
  assert.ok(total <= 60, `total loss ${total.toFixed(1)} HP within the 60 HP bound`);
  assert.equal(escape.events.filter((e) => e.event.type === "ecology-strike").length, 0, "nothing strikes during the escape");
  assert.ok(THREAT_AGENT_IDS.every((id) => !canReach(id, stimulus(p), world, 600 + 60 * 60)), "safe at the end");
});
