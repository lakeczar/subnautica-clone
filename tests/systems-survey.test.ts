import test from "node:test";
import assert from "node:assert/strict";
import { SOURCES } from "../src/content/registry.js";
import { PING_RANGE, SURVEY_TIERS } from "../src/content/systems/navigation.js";
import { installModule } from "../src/sim/systems/hosts.js";
import { deployOutpost } from "../src/sim/systems/outposts.js";
import { bearingDegrees, handheldPing, knownMaterials, stationSurvey, surveyQuery, surveyRange } from "../src/sim/systems/survey.js";
import { give, opened, siteTable, swimTo } from "./systems-support.js";

const REEF = { x: -20, y: -15, z: -10 };

test("only materials already scanned are marked, including sources of them not yet visited", () => {
  const { s } = opened();
  const query = () => surveyQuery({ origin: REEF, range: 150, scans: s.knowledge.scans, resources: s.world.resources, renewal: s.world.renewal });
  assert.deepEqual(query(), []);
  s.knowledge.scans.push("reef_service_scraps_east");
  const marks = query();
  assert.ok(marks.length >= 2);
  assert.ok(marks.every((m) => m.item === "structural_alloy"));
  assert.ok(marks.some((m) => m.sourceId === "reef_service_scraps_west" && !m.visited));
  assert.ok(marks.some((m) => m.sourceId === "reef_service_scraps_east" && m.visited));
  assert.deepEqual([...knownMaterials(s.knowledge.scans)], ["structural_alloy"]);
  assert.ok(marks.every((m, n) => n === 0 || marks[n - 1]!.distance <= m.distance), "nearest first");
  assert.ok(!knownMaterials(["filter_flow", "basin_keel_plate"]).size, "records and story scans are not materials");
});

test("renewable stock shows when it has grown back; finite and exhausted stock are distinct", () => {
  const { s } = opened();
  s.knowledge.scans.push("reef_ribbon_catch_north", "reef_glass_ridge_north");
  const node = (id: string) => s.world.resources.find((r) => r.id === id)!;
  const mark = (id: string) => surveyQuery({ origin: REEF, range: 200, scans: s.knowledge.scans, resources: s.world.resources, renewal: s.world.renewal }).find((m) => m.sourceId === id)!;
  assert.equal(mark("reef_ribbon_catch_north").regrowth, "regrown");
  node("reef_ribbon_catch_north").stock = 4;
  s.world.renewal.find((r) => r.id === "reef_ribbon_catch_north")!.progress = 21_600 - 600;
  const growing = mark("reef_ribbon_catch_north");
  assert.equal(growing.regrowth, "regrowing");
  assert.equal(growing.nextRegrowth, 10);
  assert.equal(mark("reef_glass_ridge_south").regrowth, "finite");
  node("reef_glass_ridge_south").stock = 0;
  node("reef_glass_ridge_south").reserve = 0;
  assert.equal(mark("reef_glass_ridge_south").regrowth, "exhausted");
});

test("station range scales by tier; the station needs its module and power; the query never mutates", () => {
  assert.deepEqual(SURVEY_TIERS.map((t) => t.range), [150, 300, 500, 800]);
  assert.equal(surveyRange(-1), 150);
  assert.equal(surveyRange(9), 800);
  const { s, sys } = opened();
  s.knowledge.scans.push("canopy_grounding_fins_upper");
  const spot = { x: 60, y: -60, z: -60 };
  const id = give(s, "outpost_kit_basic");
  swimTo(s, spot);
  deployOutpost(s, sys, id, spot, siteTable({ ventDistance: 4 }));
  assert.match(stationSurvey(s, sys, id).refusal ?? "", /No survey station/);
  installModule(s, sys, id, "s0", give(s, "mod_survey"));
  const before = JSON.stringify({ s, sys });
  const near = stationSurvey(s, sys, id, 0), far = stationSurvey(s, sys, id, 3);
  assert.equal(JSON.stringify({ s, sys }), before);
  assert.equal(near.refusal, null);
  assert.ok(near.marks.every((m) => m.distance <= 150));
  assert.ok(far.marks.length > near.marks.length, "a basin-tier range reaches more fins");
  assert.ok(far.marks.every((m) => m.item === "conductive_crust"));
  assert.match(stationSurvey(s, sys, id, 0, () => false).refusal ?? "", /no power/);
});

test("the handheld ping is short range and needs the scanner", () => {
  const { s } = opened();
  s.knowledge.scans.push("reef_glass_ridge_north");
  swimTo(s, SOURCES.reef_glass_ridge_north.position);
  const ping = handheldPing(s);
  assert.equal(ping.range, PING_RANGE);
  assert.ok(ping.marks.length >= 1 && ping.marks.every((m) => m.distance <= PING_RANGE));
  s.inventory.items = s.inventory.items.filter((i) => i.kind !== "essential_tools");
  assert.match(handheldPing(s).refusal ?? "", /needs the scanner/);
});

test("bearings use the game's yaw zero (-Z) and run clockwise", () => {
  const o = { x: 0, y: 0, z: 0 };
  assert.equal(bearingDegrees(o, { x: 0, y: 0, z: -10 }), 0);
  assert.equal(bearingDegrees(o, { x: 10, y: 0, z: 0 }), 90);
  assert.equal(bearingDegrees(o, { x: 0, y: 0, z: 10 }), 180);
  assert.equal(bearingDegrees(o, { x: -10, y: 0, z: 0 }), 270);
});
