import assert from "node:assert/strict";
import test from "node:test";
import { SOLIDS } from "../src/sim/world.js";
import { corridorProblems, sweepHull, FINAL_SWIM, firstAccess, firstAccessProblems, inside, lossCapable, parkPose, pathLength, rescue, rescueProblems,
  siteDatum, workPose, type CheckContext } from "../src/content/regions/access.js";
import type { Vec3 } from "../src/world/types.js";
import { HAZARDS } from "../src/content/regions/hazards.js";
import { ROUTES } from "../src/content/regions/passages.js";
import { RESCUE_PLANS } from "../src/content/regions/rescue.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURE_SOLIDS } from "../src/content/regions/structures.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";

// The whole-world first-access and rescue proofs (heavy tier, TT-1): each sweeps
// every site. tests/regions-world.test.ts keeps the rest and a fast smoke.

/** The simulation roster now includes S2's structures; "today's" solids are the rest. */
const S2_SOLID_IDS = new Set(STRUCTURE_SOLIDS.map(s => s.id));
const LEGACY_SOLIDS = SOLIDS.filter(s => !S2_SOLID_IDS.has(s.id));
const ctx: CheckContext = {
  floor: worldFloor, hazards: HAZARDS,
  solids: [...STRUCTURE_SOLIDS, ...LEGACY_SOLIDS.map(s => ({ id: s.id, bounds: { min: s.min, max: s.max } }))],
};
const none = (problems: readonly string[], what: string): void =>
  assert.equal(problems.length, 0, `${what}:\n- ${problems.slice(0, 20).join("\n- ")}`);

/** The reviewer's control: a 3 m-half solid cube sealing a first-access deposit. */
function sealed(id: string): CheckContext {
  const at = siteDatum(SITES.find(s => s.id === id)!, worldFloor), h = 3;
  return { ...ctx, solids: [...ctx.solids, { id: "control.sealed-deposit",
    bounds: { min: { x: at.x - h, y: at.y - h, z: at.z - h }, max: { x: at.x + h, y: at.y + h, z: at.z + h } } }] };
}

test("ADVERSE: first-access deposits are reachable without the protection they unlock", () => {
  const { problems, legs } = firstAccess(ctx);
  none(problems, "first access");
  for (const m of ["pressure_ceramic", "thermal_core", "brine_lattice"])
    assert.ok(SITES.filter(s => s.material === m && s.firstAccess).length >= 2, `${m}: two first-access patches`);
  // Every first-access deposit has an explicit final swim ending at its work pose.
  for (const d of SITES.filter(s => s.firstAccess)) {
    const leg = legs.find(l => l.site === d.id);
    assert.ok(leg, `${d.id}: no final swim`);
    const w = workPose(d, worldFloor), end = leg.leg.at(-1)!;
    assert.ok(Math.hypot(end.x - w.x, end.y - w.y, end.z - w.z) < 1e-9 && pathLength(leg.leg) <= FINAL_SWIM, `${d.id}: final swim`);
  }
  // The checker is not vacuous: the same lattice line fails at the 350 m tier,
  // and a dive into the brine fissure is refused without chemical protection.
  const flank = ROUTES.find(r => r.id === "route.rift.divide_flank")!;
  assert.ok(corridorProblems("probe", flank.path, ctx, { profile: "medium", maxDepth: 340 }).some(p => p.includes("exceeds")));
  const fissure = SITES.find(s => s.id === "divide_lattice_fissure")!;
  assert.ok(corridorProblems("probe", [{ x: 520, y: -430, z: -1340 }, { x: 520, y: -478, z: -1360 }].map(p => p), ctx,
    { profile: "diver", protections: [] }).some(p => p.includes("hazard.divide.brine_south")), fissure.id);
});

test("ADVERSE control: a sealed deposit fails both first access and rescue", () => {
  const blocked = sealed("rift_core_shoulder_west");
  assert.ok(firstAccessProblems(blocked).some(p => p.startsWith("rift_core_shoulder_west")), "first access must report the sealed deposit");
  assert.ok(rescueProblems(blocked).some(p => p.startsWith("rift_core_shoulder_west")), "rescue must report the sealed deposit");
});

test("ADVERSE: every deep loss-capable site has a proved rescue from starter gear", () => {
  const deep = SITES.filter(s => lossCapable(s, worldFloor));
  assert.ok(deep.length >= 40, `only ${deep.length} loss-capable sites`);
  const { problems, outcomes } = rescue(ctx);
  none(problems, "rescue");
  for (const p of RESCUE_PLANS) assert.ok(p.stage.y >= -0.5 && p.approach.every(q => q.y >= -0.5), `${p.id}: stage and approach breathable`);
  const near = (a: Vec3, b: Vec3, d = 1e-6): boolean => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= d;
  const work = deep.filter(s => s.role === "source" || s.role === "story" || s.role === "refuge" || s.role === "mooring");
  for (const s of work) {
    const o = outcomes.find(x => x.site === s.id);
    assert.ok(o, `${s.id}: no rescue outcome`);
    const plan = RESCUE_PLANS.find(p => p.id === o.plan)!, branch = plan.tethers[o.branch]!;
    // Continuous: tether prefix -> attach leg -> hull; Bobbin -> work pose; tow from the hull to the mooring.
    assert.ok(near(o.attach[0]!, branch[o.vertex]!), `${s.id}: attach leaves the tether`);
    const hull = o.attach.at(-1)!;
    assert.ok(pathLength(branch.slice(0, o.vertex + 1)) + pathLength(o.attach) <= plan.maximumTether, `${s.id}: tether too short`);
    if (o.emergency) {
      assert.ok(near(o.emergency.at(-1)!, hull) && near(o.emergency[0]!, workPose(s, worldFloor), 6), `${s.id}: emergency transfer`);
      assert.ok(!HAZARDS.some(h => h.protection && inside(h.bounds, hull, 5)), `${s.id}: emergency shelf in a hazard`);
    } else assert.ok(near(o.bobbin[0]!, hull) && near(o.bobbin.at(-1)!, workPose(s, worldFloor)), `${s.id}: Bobbin leg`);
    assert.ok(near(o.tow[0]!, hull), `${s.id}: tow does not start at the hull`);
    const m = SITES.find(x => x.id === o.mooring)!;
    assert.ok(m.services?.includes("repair") && near(o.tow.at(-1)!, parkPose(m, worldFloor)), `${s.id}: tow does not end at a repair mooring`);
    // Re-validate the whole tow independently: a medium hull, clear of floor,
    // solids and every protective hazard, from the hull to the mooring.
    none(corridorProblems(`${s.id} tow`, o.tow, { ...ctx, hazards: HAZARDS.filter(h => h.protection) }, { profile: "medium", margin: 0.3, step: 2 }), `${s.id} tow`);
  }
  for (const id of ["rift_core_plume_seam", "divide_lattice_fissure"])
    assert.ok(outcomes.find(o => o.site === id)?.emergency, `${id}: hazardous work needs an explicit emergency transfer`);
});

test("ADVERSE controls: a wrong mooring and a missing stage are both refused", () => {
  const wrong = rescueProblems(ctx, RESCUE_PLANS.map(p => ({ ...p, mooring: "isles_stack_glass_east" })));
  assert.ok(wrong.some(m => m.includes("not a repair mooring")), "wrong moorings must be refused");
  assert.ok(RESCUE_PLANS.every(p => wrong.some(m => m.startsWith(`${p.id}: isles_stack_glass_east is not a repair mooring`))), "every plan's mooring is checked");
  const without = rescueProblems(ctx, RESCUE_PLANS.filter(p => p.id !== "rescue.meridian_works"));
  assert.ok(without.some(m => m.startsWith("meridian.works_hatch")), "control: works hatch unrescued without its stage");
});

test("REGRESSION: solid checks are continuous sweeps; the old ceramic-lip tow is refused", () => {
  const stub = STRUCTURE_SOLIDS.find(s => s.id === "rift.cool_chimneys.stub_north")!;
  // R2's tow segment clipped the chimney by 0.27 x 0.34 m between samples.
  const a = { x: 92.0267, y: -253.4667, z: -966.5333 }, b = { x: 95.6, y: -254, z: -962 };
  assert.notEqual(sweepHull(a, b, "medium", stub.bounds), null, "the analytic sweep sees the clip");
  assert.ok(corridorProblems("old tow", [a, b], ctx, { profile: "medium", step: 1.5 }).some(p => p.includes(stub.id)),
    "the corridor check refuses it at any sample spacing");
  // A segment passing a box corner between coarse samples is still caught.
  const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  assert.notEqual(sweepHull({ x: -10, y: -0.5, z: -5.2 }, { x: 10, y: -0.5, z: 4.8 }, "diver", box), null);
  assert.equal(sweepHull({ x: -10, y: 5, z: 0 }, { x: 10, y: 5, z: 0 }, "diver", box), null);
  // The recorded recovery for the lip now clears every solid along every leg.
  const o = rescue(ctx).outcomes.find(x => x.site === "rift_ceramic_lip_north")!;
  for (const path of [o.attach, o.tow, o.bobbin, RESCUE_PLANS.find(p => p.id === o.plan)!.tethers[o.branch]!.slice(0, o.vertex + 1)])
    for (let i = 0; i < path.length - 1; i++) for (const sol of ctx.solids)
      assert.equal(sweepHull(path[i]!, path[i + 1]!, path === o.bobbin ? "diver" : "medium", sol.bounds), null, `${sol.id} on the lip recovery`);
});
