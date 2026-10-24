import test from "node:test";
import assert from "node:assert/strict";
import { SOURCES } from "../src/content/registry.js";
import { CHART_CELL, PLAYER_BEACON_LIMIT } from "../src/content/systems/navigation.js";
import { advanceDecodes, discoverSite, startDecode } from "../src/sim/systems/decoder.js";
import { installModule } from "../src/sim/systems/hosts.js";
import { beaconViews, categoryCounts, cellOf, chartView, collectBeacon, placeBeacon, renameBeacon, setBeaconOn, setCategoryOn, visitChart } from "../src/sim/systems/navigation.js";
import { deployOutpost } from "../src/sim/systems/outposts.js";
import { give, opened, siteTable, snapshot, SPOTS, swimTo } from "./systems-support.js";

test("players place, name, rename and collect beacons; each placement uses a carried beacon", () => {
  const { s, sys } = opened();
  swimTo(s, SPOTS.a);
  assert.match(placeBeacon(s, sys, "Cave mouth") ?? "", /Carry a navigation beacon/);
  give(s, "nav_beacon", 2);
  for (const bad of ["", "   ", "x".repeat(25), "<b>"]) {
    const before = snapshot(s, sys);
    assert.match(placeBeacon(s, sys, bad) ?? "", /Name the beacon/);
    assert.equal(snapshot(s, sys), before);
  }
  assert.equal(placeBeacon(s, sys, "  Cave   mouth "), null);
  const b = sys.beacons[0]!;
  assert.deepEqual([b.name, b.category, b.source, b.position], ["Cave mouth", "player", "player", SPOTS.a]);
  assert.equal(s.inventory.items.find((i) => i.kind === ("nav_beacon" as never))?.quantity, 1);
  assert.equal(renameBeacon(sys, b.id, "Vent shelf"), null);
  assert.equal(sys.beacons[0]!.name, "Vent shelf");
  swimTo(s, SPOTS.b);
  assert.match(collectBeacon(s, sys, b.id) ?? "", /Swim to the beacon/);
  swimTo(s, SPOTS.a);
  assert.equal(collectBeacon(s, sys, b.id), null);
  assert.equal(sys.beacons.length, 0);
  assert.equal(s.inventory.items.find((i) => i.kind === ("nav_beacon" as never))?.quantity, 2);
  s.player.controlledVehicleId = "dart_1";
  assert.match(placeBeacon(s, sys, "x") ?? "", /Leave the craft/);
});

test("the player beacon limit holds", () => {
  const { s, sys } = opened();
  give(s, "nav_beacon", PLAYER_BEACON_LIMIT + 1);
  swimTo(s, SPOTS.a);
  for (let n = 0; n < PLAYER_BEACON_LIMIT; n++) assert.equal(placeBeacon(s, sys, `B${n}`), null);
  assert.match(placeBeacon(s, sys, "one more") ?? "", /16 beacons are already placed/);
});

test("decoded landmarks and hints become beacons, switched individually or by category; outposts and stops are derived", () => {
  const { s, sys } = opened();
  const id = give(s, "outpost_kit_basic");
  swimTo(s, SPOTS.a);
  deployOutpost(s, sys, id, SPOTS.a, siteTable({ ventDistance: 3 }));
  installModule(s, sys, id, "s0", give(s, "mod_decoder"));
  discoverSite(sys, "demo_relay_hut");
  startDecode(s, sys, id, "demo_hut_fragment");
  advanceDecodes(s, sys, 180);
  const views = beaconViews(s, sys);
  assert.deepEqual(views.map((v) => [v.id, v.category, v.on, v.removable]), [
    [`outpost:${id}`, "outpost", true, false],
    ["stop:home_pod", "stop", true, false],
    ["demo_cairn_hint", "hint", true, false],
  ]);
  assert.equal(categoryCounts(views).hint, 1);
  setBeaconOn(sys, "demo_cairn_hint", false);
  assert.equal(beaconViews(s, sys).find((v) => v.id === "demo_cairn_hint")!.on, false);
  setBeaconOn(sys, "demo_cairn_hint", true);
  setCategoryOn(sys, "hint", false);
  assert.equal(beaconViews(s, sys).find((v) => v.id === "demo_cairn_hint")!.on, false);
  setCategoryOn(sys, "hint", true);
  setBeaconOn(sys, `outpost:${id}`, false);
  assert.equal(beaconViews(s, sys).find((v) => v.id === `outpost:${id}`)!.on, false);
  assert.deepEqual(sys.beaconsOff, [`outpost:${id}`]);
  s.knowledge.markers.push("canopy_stop");
  assert.ok(beaconViews(s, sys).some((v) => v.id === "stop:canopy_stop"), "a known stop shows before restoration");
});

test("the chart shows only what was explored, scanned or decoded; live position is an upgrade", () => {
  const { s, sys } = opened();
  assert.deepEqual(chartView(s, sys).cells, []);
  assert.equal(chartView(s, sys).player, null);
  const fresh = visitChart(sys, { x: 25, y: -10, z: 25 });
  assert.ok(fresh.includes(cellOf(25, 25)));
  assert.ok(fresh.length <= 9);
  assert.deepEqual(visitChart(sys, { x: 26, y: -10, z: 24 }), [], "nothing new nearby");
  s.knowledge.scans.push("canopy_grounding_fins_lower");
  const p = SOURCES.canopy_grounding_fins_lower.position;
  const view = chartView(s, sys);
  assert.deepEqual(view.cells.find((c) => c.key === cellOf(p.x, p.z))?.reveal, ["scanned"]);
  assert.ok(view.markers.some((m) => m.id === "canopy_grounding_fins_lower" && m.kind === "source"));
  assert.ok(!view.markers.some((m) => m.id === "canopy_grounding_fins_upper"), "unscanned sources stay off the chart");
  sys.found.push("demo_cairn_survey");
  sys.decoded.push("demo_cairn_survey");
  const decoded = chartView(s, sys).cells.filter((c) => c.reveal.includes("decoded"));
  assert.ok(decoded.length >= 4, "the decoded map reveals an area");
  assert.ok(decoded.every((c) => c.size === CHART_CELL));
  assert.deepEqual(chartView(s, sys, { livePosition: true }).player, s.player.pose.position);
});
