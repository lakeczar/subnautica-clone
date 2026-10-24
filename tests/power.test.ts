import test from "node:test";
import assert from "node:assert/strict";
import type { HullId } from "../src/content/registry.js";
import { HULL_BASE } from "../src/content/upgrades/base.js";
import { UPGRADE_IDS, upgrade } from "../src/content/upgrades/catalogue.js";
import type { UpgradeId } from "../src/content/upgrades/catalogue.js";
import { craftProfile, motion } from "../src/sim/upgrades/effects.js";
import {
  AIR_LINE, BIO_CELL, CELL_STOCK_PERCENT, airLineBlock, airLineSupply, bioFeedStep, cellTransfer, dockCharge,
  insertBioCellRefusal, rechargeable, startBioFeed, stopCharge, totalRate, trickleRates,
} from "../src/sim/power/index.js";
import type { AirLineCraft } from "../src/sim/power/index.js";

const near = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const HULLS = Object.keys(HULL_BASE) as HullId[];
/** Every fitting a hull can take at once, one per line: the most generous power build. */
const allFits = (hull: HullId): UpgradeId[] => {
  const byLine = new Map<string, UpgradeId>();
  for (const id of UPGRADE_IDS) if (Object.hasOwn(upgrade(id).fits, hull) && !upgrade(id).refit) {
    const prev = byLine.get(upgrade(id).line);
    if (!prev || upgrade(prev).tier < upgrade(id).tier) byLine.set(upgrade(id).line, id);
  }
  return [...byLine.values()];
};

test("solar: surface only, best on the Spindle, a quarter while moving, divided by capacity", () => {
  const spindle = craftProfile("spindle", 0, []), array = craftProfile("spindle", 0, ["spindle_solar_array"]);
  const at = { depth: 0.5, moving: false, heat: 0 };
  assert.deepEqual(trickleRates({ profile: spindle, ...at }), [{ source: "solar", rate: 0.05 }]);
  near(totalRate(trickleRates({ profile: array, ...at })), 0.1);
  near(totalRate(trickleRates({ profile: array, ...at, moving: true })), 0.025);
  assert.deepEqual(trickleRates({ profile: array, ...at, depth: 3 }), []);
  assert.deepEqual(trickleRates({ profile: array, ...at, daylight: 0 }), []);
  near(totalRate(trickleRates({ profile: craftProfile("spindle", 0, ["spindle_solar_array", "cell_bank_2"]), ...at })), 0.05);
  // Every other craft gains at most a token trickle on the surface.
  for (const hull of HULLS.filter((h) => h !== "spindle"))
    assert.ok(totalRate(trickleRates({ profile: craftProfile(hull, 400, allFits(hull)), ...at })) < 0.02, hull);
});

test("thermal exchanger: charges only in warm water near vents", () => {
  const ex = craftProfile("creel", 450, ["thermal_exchanger"]);
  near(totalRate(trickleRates({ profile: ex, depth: 300, moving: true, heat: 0.36 })), 0.6 * 0.16);
  assert.deepEqual(trickleRates({ profile: ex, depth: 300, moving: false, heat: 0.15 }), []);
  assert.deepEqual(trickleRates({ profile: craftProfile("creel", 450, []), depth: 300, moving: false, heat: 0.9 }), []);
});

test("no perpetual generator: in open water nothing charges, and moving on the surface always loses", () => {
  for (const hull of HULLS) {
    const p = craftProfile(hull, 800, allFits(hull));
    assert.deepEqual(trickleRates({ profile: p, depth: 100, moving: false, heat: 0, current: 2, held: false, turbine: true }), [], hull);
    const surface = totalRate(trickleRates({ profile: p, depth: 0.5, moving: true, heat: 0 }));
    for (const mode of ["quiet", "cruise", "boost"] as const)
      assert.ok(surface < motion(p, mode).drain, `${hull} ${mode}: ${surface} vs ${motion(p, mode).drain}`);
  }
});

test("current turbine stub: only stopped and held in a current", () => {
  const p = craftProfile("creel", 450, []);
  const base = { profile: p, depth: 300, heat: 0, turbine: true };
  near(totalRate(trickleRates({ ...base, moving: false, held: true, current: 1 })), 0.06);
  assert.deepEqual(trickleRates({ ...base, moving: true, held: true, current: 1 }), []);
  assert.deepEqual(trickleRates({ ...base, moving: false, held: false, current: 1 }), []);
  assert.deepEqual(trickleRates({ ...base, moving: false, held: true, current: 0.3 }), []);
  assert.deepEqual(trickleRates({ ...base, turbine: false, moving: false, held: true, current: 1 }), []);
});

test("reserve cells: a full cell restores 35% of a stock battery, proportionally less of a bigger bank", () => {
  assert.deepEqual(cellTransfer(100, 20, 1), { craftCharge: 20 + CELL_STOCK_PERCENT, cellCharge: 0 });
  const big = cellTransfer(100, 20, 2);
  near(big.craftCharge, 37.5);
  near(big.cellCharge, 0);
  const top = cellTransfer(100, 90, 1);
  near(top.craftCharge, 100);
  near(top.cellCharge, 100 - (10 / 35) * 100);
  assert.deepEqual(cellTransfer(0, 20, 1), { craftCharge: 20, cellCharge: 0 });
});

test("bio-cells: one slow feed at a time, consumed, never recharged", () => {
  assert.equal(BIO_CELL.item, "bio_cell");
  assert.match(insertBioCellRefusal(null, null, false)!, /grown bio-cell/);
  assert.match(insertBioCellRefusal(null, 0, false)!, /spent/);
  assert.match(insertBioCellRefusal(null, 100, true)!, /disabled hull/);
  assert.match(insertBioCellRefusal(startBioFeed(), 100, false)!, /already feeding/);
  assert.equal(insertBioCellRefusal(null, 100, false), null);
  // SYS-2's item charge sets the feed: a half-used cell feeds half.
  assert.equal(startBioFeed(50).remaining, BIO_CELL.units / 2);
  assert.deepEqual([rechargeable("reserve_cell"), rechargeable("bio_cell")], [true, false]);
  let feed: ReturnType<typeof startBioFeed> | null = startBioFeed(), charge = 10, seconds = 0;
  while (feed) { const s = bioFeedStep(feed, 2, charge, 1 / 60); charge += s.gain; feed = s.feed; seconds += 1 / 60; }
  near(charge, 10 + BIO_CELL.units / 2, 1e-6);
  near(seconds, BIO_CELL.seconds, 0.05);
  // A nearly full battery takes only what fits; the rest of that step's feed is lost.
  const full = bioFeedStep(startBioFeed(), 1, 99.9, 1);
  near(full.gain, 0.1);
  near(full.feed!.remaining, BIO_CELL.units - 0.5);
});

test("carrier charging dock: instant for berthed craft, paid from the carrier, never below its reserve", () => {
  const berthed = [{ hull: "dart" as const, charge: 20, capacity: 1 }, { hull: "hush" as const, charge: 50, capacity: 1.5 }];
  assert.match(dockCharge(false, 80, berthed).refusal!, /Socket a charger module/);
  assert.match(dockCharge(true, 80, []).refusal!, /No craft is berthed/);
  const r = dockCharge(true, 80, berthed);
  assert.deepEqual(r.charges, [100, 100]);
  near(r.carrierCharge, 80 - 80 * 0.08 - 50 * 0.08 * 1.5);
  const poor = dockCharge(true, 24, [{ hull: "creel", charge: 0, capacity: 1 }]);
  near(poor.charges[0]!, 4 / 0.12);
  near(poor.carrierCharge, 20);
  assert.match(dockCharge(true, 20, berthed).refusal!, /keeps its last 20%/);
  assert.match(dockCharge(true, 90, [{ hull: "dart", charge: 100, capacity: 1 }]).refusal!, /already full/);
  assert.deepEqual([stopCharge(true, true), stopCharge(false, true), stopCharge(true, false)], [100, null, null]);
});

// ---------------------------------------------------------------- air line
const craft = (over: Partial<AirLineCraft> = {}): AirLineCraft => ({
  id: "dart-1", profile: craftProfile("dart", 180, []), position: { x: 0, y: -20, z: 0 }, speed: 0, charge: 60,
  disabled: false, emergencyAir: 120, berthed: false, ...over,
});

test("basic air line: unlimited air within 27 m of a parked, powered craft", () => {
  assert.ok(AIR_LINE.basic.range >= 25 && AIR_LINE.basic.range <= 30);
  const diver = { x: 0, y: -40, z: 18 };
  assert.deepEqual(airLineSupply(diver, [craft()]), { craftId: "dart-1", kind: "basic", drain: 0.01, emergencySeconds: null });
  assert.match(airLineBlock({ x: 0, y: -20, z: 30 }, craft())!, /30 m of 27 m/);
  assert.match(airLineBlock(diver, craft({ speed: 2 }))!, /parked or holding station/);
  assert.match(airLineBlock(diver, craft({ charge: 0 }))!, /no power/);
  assert.match(airLineBlock(diver, craft({ disabled: true }))!, /disabled/);
  assert.match(airLineBlock(diver, craft({ berthed: true }))!, /Berthed/);
  assert.equal(airLineSupply(diver, [craft({ charge: 0 })]), null);
  near(airLineSupply(diver, [craft({ profile: craftProfile("dart", 180, ["cell_bank_1"]) })])!.drain, 0.01 / 1.5);
});

test("the Mantle's hull air line reaches 60 m and bridges a power loss on emergency air", () => {
  const mantle = craft({ id: "mantle-1", profile: craftProfile("mantle", 800, ["mantle_hull_air_line"]) });
  const diver = { x: 0, y: -20, z: 55 };
  assert.equal(airLineSupply(diver, [craft()]), null);
  assert.deepEqual(airLineSupply(diver, [craft(), mantle]), { craftId: "mantle-1", kind: "hull", drain: 0.02, emergencySeconds: null });
  const dark = airLineSupply(diver, [{ ...mantle, charge: 0, emergencyAir: 40 }]);
  assert.deepEqual(dark, { craftId: "mantle-1", kind: "hull", drain: 0, emergencySeconds: 40 });
  assert.equal(airLineSupply(diver, [{ ...mantle, charge: 0, emergencyAir: 0 }]), null);
  // A powered line wins over an emergency one; otherwise the lowest id, for determinism.
  const close = { x: 0, y: -20, z: 5 };
  assert.equal(airLineSupply(close, [{ ...mantle, charge: 0 }, craft({ id: "z-dart" })])!.craftId, "z-dart");
  assert.equal(airLineSupply(close, [craft({ id: "b" }), craft({ id: "a" })])!.craftId, "a");
});
