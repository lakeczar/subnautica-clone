import test from "node:test";
import assert from "node:assert/strict";
import { HOST_UPGRADES } from "../src/content/upgrades/hosts.js";
import { craftProfile } from "../src/sim/upgrades/effects.js";
import {
  decoderSpeed, knowledgeUpgradeRefusal, livePosition, mastNearby, moduleUpgradePreview, outpostLimitBonus,
  specimenBayAvailable, surveyTier,
} from "../src/sim/upgrades/hosts.js";
import { HOST_POWER, hostDrainStep, hostPowerState } from "../src/sim/power/hosts.js";
import type { HostPowerInput } from "../src/sim/power/hosts.js";

const near = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const PLANS = ["bp_rift_pressure", "bp_deep_service", "bp_canopy_reinforcement", "bp_island_workshop"];
const RICH = { structural_alloy: 9, silica_glass: 9, conductive_crust: 9, thermal_core: 9, brine_lattice: 9, pressure_ceramic: 9, tagged_frame: 9 };

test("decoder speed and survey tier follow the module's own upgrade (SYS-2 hooks)", () => {
  const mods = { "dec-1": "decoder_lattice_2", "sur-1": "survey_range_1" } as const;
  assert.deepEqual([decoderSpeed(mods)("dec-1"), decoderSpeed(mods)("dec-2"), decoderSpeed(mods)("sur-1")], [2.25, 1, 1]);
  assert.deepEqual([surveyTier(mods, "sur-1"), surveyTier(mods, "sur-2"), surveyTier(mods, "sur-1", true)], [1, 0, 2]);
  assert.equal(surveyTier({ s: "survey_range_3" }, "s", true), 3);
  const mast = craftProfile("spindle", 0, ["spindle_radio_mast"]);
  assert.deepEqual([mastNearby(mast, true, 60), mastNearby(mast, false, 60), mastNearby(mast, true, 200),
    mastNearby(craftProfile("spindle", 0, []), true, 10)], [true, false, false, false]);
});

test("module upgrades: right module, upward only, planned and paid; the record travels with the item ID", () => {
  const dec = { itemId: "dec-1", kind: "decoder" };
  const ok = moduleUpgradePreview({}, dec, "decoder_lattice_1", RICH, PLANS);
  assert.deepEqual([ok.refusal, ok.after], [null, { "dec-1": "decoder_lattice_1" }]);
  assert.match(moduleUpgradePreview({}, { itemId: "p", kind: "planter" }, "decoder_lattice_1", RICH, PLANS).refusal!, /fits a decoder module/);
  assert.match(moduleUpgradePreview({ "dec-1": "decoder_lattice_2" }, dec, "decoder_lattice_1", RICH, PLANS).refusal!, /already has Brine decoder lattice/);
  assert.match(moduleUpgradePreview({}, dec, "decoder_lattice_1", RICH, []).refusal!, /needs its plans/);
  const poor = moduleUpgradePreview({}, dec, "decoder_lattice_1", { silica_glass: 2, conductive_crust: 1, structural_alloy: 1 }, PLANS);
  assert.match(poor.refusal!, /1 more thermal core\. Nothing was used/);
  assert.deepEqual(poor.after, {});
  assert.match(moduleUpgradePreview({}, dec, "outpost_network_1", RICH, PLANS).refusal!, /crafted once/);
});

test("outpost limit bonus and live position are crafted once; tiers do not stack", () => {
  assert.equal(outpostLimitBonus([]), 0);
  assert.equal(outpostLimitBonus(["outpost_network_1", "pod_repair"]), 1);
  assert.equal(outpostLimitBonus(["outpost_network_1", "outpost_network_2"]), 2);
  assert.deepEqual([livePosition([]), livePosition(["chart_live_position"])], [false, true]);
  assert.equal(knowledgeUpgradeRefusal([], "outpost_network_1", RICH, PLANS), null);
  assert.match(knowledgeUpgradeRefusal(["outpost_network_1"], "outpost_network_1", RICH, PLANS)!, /already built/);
  assert.match(knowledgeUpgradeRefusal(["outpost_network_2"], "outpost_network_1", RICH, PLANS)!, /already does more/);
  assert.match(knowledgeUpgradeRefusal([], "outpost_network_1", { structural_alloy: 4, conductive_crust: 1 }, PLANS)!, /1 more tagged frame/);
  assert.match(knowledgeUpgradeRefusal([], "survey_range_1", RICH, PLANS)!, /fitted to a module/);
  assert.equal(Object.values(HOST_UPGRADES).filter((d) => "outpostBonus" in d).length, 2);
});

test("specimen bay flag for SYS-2's seedCollectable: a Hush with the bay and room", () => {
  const bay = craftProfile("hush", 220, ["hush_specimen_bay"]);
  assert.deepEqual([specimenBayAvailable(bay, 0), specimenBayAvailable(bay, 4), specimenBayAvailable(null, 0),
    specimenBayAvailable(craftProfile("hush", 220, []), 0)], [true, false, false, false]);
});

test("host power: plant, solar, thermal, cells and the carrier battery, each with its catch", () => {
  const host = (over: Partial<HostPowerInput>): HostPowerInput => ({ available: true, power: "plant", poweredModules: 1, ...over });
  assert.equal(hostPowerState(host({})).powered, true);
  assert.match(hostPowerState(host({ available: false })).reason!, /not restored or deployed/);
  assert.equal(hostPowerState(host({ power: "thermal" })).powered, true);
  assert.match(hostPowerState(host({ power: "solar", daylight: 0 })).reason!, /daylight/);
  assert.match(hostPowerState(host({ power: "cells", cells: [{ id: "c", kind: "reserve_cell", charge: 0 }] })).reason!, /charged reserve cell or bio-cell/);
  assert.equal(hostPowerState(host({ power: "cells", cells: [{ id: "b", kind: "bio_cell", charge: 100 }] })).powered, true);
  assert.equal(hostPowerState(host({ power: "carrier", carrier: { charge: 60, disabled: false } })).powered, true);
  assert.match(hostPowerState(host({ power: "carrier", carrier: { charge: 20, disabled: false } })).reason!, /last 20%/);
  assert.match(hostPowerState(host({ power: "carrier", carrier: { charge: 90, disabled: true } })).reason!, /disabled/);
});

test("host drain: cells run down bio-cells first, then the emptiest reserve; the carrier pays per occupant", () => {
  const cells = [{ id: "r-full", kind: "reserve_cell" as const, charge: 100 }, { id: "r-low", kind: "reserve_cell" as const, charge: 1 },
    { id: "bio", kind: "bio_cell" as const, charge: 1 }];
  const step = hostDrainStep({ available: true, power: "cells", poweredModules: 2, cells }, 30);
  // 2 modules × 30 s × 100/1800 = 3.33 points: the bio-cell's 1, the low reserve's 1, then 1.33 of the full one.
  assert.deepEqual(step.cells.map((c) => c.id), ["r-full", "r-low", "bio"]);
  near(step.cells[2]!.charge, 0);
  near(step.cells[1]!.charge, 0);
  near(step.cells[0]!.charge, 100 - (2 * 30 * HOST_POWER.moduleDrain - 2));
  // One full cell runs one decoder for 30 minutes.
  let run = [{ id: "c", kind: "reserve_cell" as const, charge: 100 }], seconds = 0;
  while (hostPowerState({ available: true, power: "cells", poweredModules: 1, cells: run }).powered) {
    run = hostDrainStep({ available: true, power: "cells", poweredModules: 1, cells: run }, 1).cells as typeof run; seconds++;
  }
  near(seconds, 1800, 1);
  near(hostDrainStep({ available: true, power: "carrier", poweredModules: 3, carrier: { charge: 80, disabled: false } }, 10).carrierDrain, 0.12);
  assert.equal(hostDrainStep({ available: true, power: "thermal", poweredModules: 3 }, 10).carrierDrain, 0);
  assert.equal(hostDrainStep({ available: true, power: "cells", poweredModules: 0, cells }, 10).cells[0]!.charge, 100);
});
