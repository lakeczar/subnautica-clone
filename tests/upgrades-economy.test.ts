import test from "node:test";
import assert from "node:assert/strict";
import { BLUEPRINTS } from "../src/content/registry.js";
import { UPGRADE_IDS, upgrade } from "../src/content/upgrades/catalogue.js";
import { HOST_UPGRADE_IDS } from "../src/content/upgrades/hosts.js";
import {
  checkUpgradeEconomy, commonBase, firstDepth, frontierMaterials, inCave, registrySources, upgradeRow,
} from "../src/sim/upgrades/economy.js";
import type { SourceView } from "../src/sim/upgrades/economy.js";
import { CAVE_SOURCES } from "../src/content/regions/caves.js";

test("every SYS-1 upgrade is payable at its tier, depth tiers reach the frontier, and nothing is cave-only", () => {
  const report = checkUpgradeEconomy();
  assert.deepEqual(report.failures, []);
  assert.ok(report.ok);
  assert.equal(report.rows.length, UPGRADE_IDS.length + HOST_UPGRADE_IDS.length);
  // The tier ladder this catalogue assumes: crust opens tier 1, frames/ceramic/core tier 2, lattice tier 3.
  const sources = registrySources();
  assert.deepEqual(frontierMaterials(sources, 1), ["conductive_crust"]);
  assert.deepEqual(frontierMaterials(sources, 2).sort(), ["pressure_ceramic", "tagged_frame", "thermal_core"]);
  assert.deepEqual(frontierMaterials(sources, 3), ["brine_lattice"]);
  assert.deepEqual(commonBase(sources).sort(), ["buoyant_resin", "conductive_crust", "flex_membrane", "silica_glass", "structural_alloy"]);
});

test("higher tiers need more common base plus a rare new material", () => {
  const report = checkUpgradeEconomy();
  const own = report.lines.filter((l) => l.owner === "SYS-1");
  assert.ok(own.length >= 9);
  for (const l of own) assert.ok(l.ok && l.commonAfter >= l.commonBefore && l.newRare.length > 0, `${l.from} → ${l.to}`);
  // S9's Creel refit costs miss the rule; they are reported for their owner, never silently passed.
  assert.deepEqual(report.advisories.map((a) => a.split(":")[0]), ["creel_350 → creel_450", "creel_450 → creel_800"]);
});

test("the check refuses what it should: unreachable, cave-only and missing-frontier costs", () => {
  const sources = registrySources();
  // Without the canopy fins, crust (and so every tier-1 upgrade using it) is unpayable at 150 m.
  const noCrust = sources.filter((s) => s.item !== "conductive_crust" || s.depth > 150);
  const row = upgradeRow(noCrust, "plating_alloy");
  assert.deepEqual(row.shortfalls.map((s) => s.kind), ["conductive_crust"]);
  // Crust only in a cave fails both the cave rule and payability.
  const caveOnly: SourceView[] = sources.map((s) => s.item === "conductive_crust" ? { ...s, cave: true } : s);
  const r = upgradeRow(caveOnly, "plating_alloy");
  assert.deepEqual([r.caveOnly, r.shortfalls.map((s) => s.kind)], [["conductive_crust"], ["conductive_crust"]]);
  // A depth refit with no frontier material fails; frames moved shallow lose their frontier status.
  const shallowFrames = sources.map((s) => s.item === "tagged_frame" ? { ...s, depth: 40 } : s);
  assert.equal(upgradeRow(shallowFrames, "hush_350").frontier?.ok, false);
  assert.equal(upgradeRow(sources, "hush_350").frontier?.ok, true);
  assert.equal(upgradeRow(sources, "plating_alloy").frontier, null);
  const report = checkUpgradeEconomy(caveOnly);
  assert.ok(!report.ok);
  assert.ok(report.failures.some((f) => /plating_alloy: conductive_crust is found only in caves/.test(f)));
});

test("protected deposits never count as ordinary supply", () => {
  const sources = registrySources({ canopy_grounding_fins_upper: { protection: "heat" }, canopy_grounding_fins_lower: { protection: "heat" } });
  // The deeper Basin fins become the first ordinary crust, beyond tier 1's reach.
  assert.ok(firstDepth(sources, "conductive_crust") > 150);
  assert.ok(upgradeRow(sources, "plating_alloy").shortfalls.length > 0);
});

test("cave detection uses the W1 cave envelopes and the authored flag", () => {
  const cave = CAVE_SOURCES[0]!, f = cave.footprint;
  const inside = { x: (f.minX + f.maxX) / 2, y: cave.topY - 2, z: (f.minZ + f.maxZ) / 2 };
  assert.equal(inCave({ position: inside }), true);
  assert.equal(inCave({ position: { ...inside, y: cave.topY + 5 } }), false);
  assert.equal(inCave({ position: { x: f.maxX + 50, y: -10, z: f.maxZ + 50 } }), false);
  assert.equal(inCave({ position: { x: f.maxX + 50, y: -10, z: f.maxZ + 50 }, cave: true }), true);
  // Nothing placed today is in a cave.
  assert.ok(registrySources().every((s) => !s.cave));
});

test("every upgrade unlocks from an existing plan", () => {
  // S9's two specialist-hull plans arrive with C3; every other plan exists today.
  const pending = new Set(["bp_hush_survey", "bp_spindle_tender"]);
  for (const id of UPGRADE_IDS) {
    const plan = upgrade(id).plan;
    assert.ok((BLUEPRINTS as readonly string[]).includes(plan) || pending.has(plan), `${id}: ${plan}`);
  }
});
