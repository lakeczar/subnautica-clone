import test from "node:test";
import assert from "node:assert/strict";
import { TECH_RECORDS } from "../src/content/registry.js";
import { DECODABLE_IDS, DECODABLES, DECODE_MINUTES, LOST_SITES, MAIN_PATH_PLANS, placedReveals } from "../src/content/systems/decodes.js";
import { OUTPOST_TIER_ORDER, OUTPOST_TIERS } from "../src/content/systems/hosts.js";
import { advanceDecodes, decodeSeconds, decodeViews, discoverSite, knownSites, markedSites, recordReadable, startDecode } from "../src/sim/systems/decoder.js";
import { installModule, outpostLockerId, removeModule } from "../src/sim/systems/hosts.js";
import { deployOutpost } from "../src/sim/systems/outposts.js";
import { mainPathPlanProblems, mainPathPlanRoute } from "../src/sim/storyCampaign.js";
import type { GameState } from "../src/sim/types.js";
import type { SystemsState } from "../src/sim/systems/state.js";
import { give, opened, siteTable, snapshot, SPOTS, swimTo } from "./systems-support.js";

/** A thermal outpost at SPOTS.a with a decoder in s0 (standard tier: 3 sockets). */
function decoderOutpost(): { s: GameState; sys: SystemsState; id: string; decoder: string } {
  const { s, sys } = opened();
  const id = give(s, "outpost_kit_standard");
  swimTo(s, SPOTS.a);
  assert.equal(deployOutpost(s, sys, id, SPOTS.a, siteTable({ ventDistance: 5 })), null);
  const decoder = give(s, "mod_decoder");
  assert.equal(installModule(s, sys, id, "s0", decoder), null);
  return { s, sys, id, decoder };
}
const run = (s: GameState, sys: SystemsState, seconds: number, ctx = {}) => {
  const out = [];
  for (let n = 0; n < seconds; n++) out.push(...advanceDecodes(s, sys, 1, ctx));
  return out;
};
// The pump house's log (6 min) and the tether basket's (an early standard-kit copy).
const PUMP = "reef_pumphouse_log", BASKET = "canopy_basket_log";

test("every decodable is a placed lost site's, optional, and takes 3–15 minutes; no placeholder rows remain", () => {
  assert.ok(!DECODABLE_IDS.some((id) => id.startsWith("demo_")), "LS-1 retired SYS-2's demo rows");
  for (const id of DECODABLE_IDS) {
    const d = DECODABLES[id];
    assert.ok(Object.hasOwn(LOST_SITES, d.site), `${id} site`);
    assert.equal(d.story, false, `${id} never gates the story`);
    const minutes = DECODE_MINUTES[d.size];
    assert.ok(minutes >= 3 && minutes <= 15, `${id} takes ${minutes} min`);
  }
  assert.deepEqual(Object.values(DECODE_MINUTES), [3, 6, 10, 15]);
});

test("sites are found without decoding; their records stay unreadable until decoded", () => {
  const { s, sys, id } = decoderOutpost();
  assert.equal(recordReadable(sys, "reef_pumphouse_terminal"), false);
  assert.equal(recordReadable(sys, "some_ungated_record"), true);
  assert.match(startDecode(s, sys, id, PUMP) ?? "", /Find the site first/);
  assert.deepEqual(discoverSite(sys, "reef_pumphouse_site"), [PUMP]);
  assert.deepEqual(discoverSite(sys, "reef_pumphouse_site"), [], "finding twice adds nothing");
  assert.deepEqual(knownSites(sys), ["reef_pumphouse_site"]);
  assert.equal(recordReadable(sys, "reef_pumphouse_terminal"), false);
  assert.equal(startDecode(s, sys, id, PUMP), null);
  const done = run(s, sys, decodeSeconds(PUMP));
  assert.equal(done.length, 1);
  assert.equal(recordReadable(sys, "reef_pumphouse_terminal"), true);
  assert.equal(recordReadable(sys, "note_reef_season"), true, "the site's found note reads with it");
  assert.match(startDecode(s, sys, id, PUMP) ?? "", /already decoding|already decoded/);
});

test("a log takes 6 minutes; decoded maps add only placed reveals, sites and plans, and report what was new", () => {
  const { s, sys, id } = decoderOutpost();
  discoverSite(sys, "reef_pumphouse_site");
  startDecode(s, sys, id, PUMP);
  assert.equal(run(s, sys, 359).length, 0);
  const [done] = run(s, sys, 1);
  const shown = placedReveals(PUMP).map((r) => r.id);
  assert.deepEqual(done, { decodable: PUMP, blueprints: ["bp_small_fabricator"], fresh: ["bp_small_fabricator"],
    readable: [...DECODABLES[PUMP].gates], beacons: shown });
  assert.deepEqual(sys.beacons.map((b) => b.id), shown, "a reveal whose target is not in the world is withheld");
  assert.deepEqual(sys.decodes, []);
  discoverSite(sys, "canopy_basket_site");
  startDecode(s, sys, id, BASKET);
  run(s, sys, 6 * 60);
  assert.ok((s.knowledge.blueprints as string[]).includes("bp_outpost_standard"));
});

test("a decoded map that names a lost site makes it known and marked, not captured", () => {
  const { s, sys, id } = decoderOutpost();
  discoverSite(sys, "hub_beacon_house");
  startDecode(s, sys, id, "hub_beacon_archive");
  run(s, sys, decodeSeconds("hub_beacon_archive"));
  assert.deepEqual(knownSites(sys).sort(), ["divide_mixing_site", "hub_beacon_house", "rift_borehole_site"]);
  assert.deepEqual(markedSites(sys).sort(), ["divide_mixing_site", "rift_borehole_site"], "revealed, data still at the logger");
  assert.ok(!sys.found.some((d) => DECODABLES[d].site === "rift_borehole_site"));
  discoverSite(sys, "rift_borehole_site");
  assert.deepEqual(markedSites(sys), ["divide_mixing_site"]);
});

test("decodes need power: a cell-powered outpost pauses without a charged cell", () => {
  const { s, sys } = opened();
  const id = give(s, "outpost_kit_basic");
  swimTo(s, SPOTS.a);
  deployOutpost(s, sys, id, SPOTS.a, siteTable());
  const decoder = give(s, "mod_decoder");
  installModule(s, sys, id, "s0", decoder);
  discoverSite(sys, "reef_pumphouse_site");
  assert.equal(startDecode(s, sys, id, PUMP), null);
  run(s, sys, 60);
  assert.equal(sys.decodes[0]!.progress, 0);
  assert.equal(decodeViews(s, sys)[0]!.status, "unpowered");
  const cell = give(s, "reserve_cell", 1, outpostLockerId(id));
  run(s, sys, 60);
  assert.equal(sys.decodes[0]!.progress, 60);
  s.inventory.items.find((i) => i.id === cell)!.charge = 0;
  run(s, sys, 10);
  assert.equal(sys.decodes[0]!.progress, 60, "a flat cell stops it again");
  // SYS-1's power model replaces the stub through the same seam.
  run(s, sys, 10, { power: () => true });
  assert.equal(sys.decodes[0]!.progress, 70);
});

test("without a relay a decoder only works near its host; a relay keeps a remote one going", () => {
  const { s, sys, id } = decoderOutpost();
  discoverSite(sys, "reef_pumphouse_site");
  startDecode(s, sys, id, PUMP);
  swimTo(s, { x: SPOTS.a.x + 200, y: SPOTS.a.y, z: SPOTS.a.z });
  run(s, sys, 10);
  assert.equal(sys.decodes[0]!.progress, 10, "within 250 m it runs");
  swimTo(s, { x: SPOTS.a.x + 400, y: SPOTS.a.y, z: SPOTS.a.z });
  run(s, sys, 10);
  assert.equal(sys.decodes[0]!.progress, 10);
  assert.equal(decodeViews(s, sys)[0]!.status, "out-of-range");
  swimTo(s, SPOTS.a);
  installModule(s, sys, id, "s1", give(s, "mod_relay"));
  swimTo(s, { x: SPOTS.a.x + 400, y: SPOTS.a.y, z: SPOTS.a.z });
  run(s, sys, 10);
  assert.equal(sys.decodes[0]!.progress, 20);
});

test("SYS-1's decoder upgrade speeds work through the speed seam", () => {
  const { s, sys, id, decoder } = decoderOutpost();
  discoverSite(sys, "reef_pumphouse_site");
  startDecode(s, sys, id, PUMP);
  const fast = { decoderSpeed: (m: string) => m === decoder ? 2 : 1 };
  assert.equal(decodeViews(s, sys, fast)[0]!.remaining, 180);
  assert.equal(run(s, sys, 180, fast).length, 1);
});

test("start refusals: no decoder, busy decoder, not local, already running", () => {
  const { s, sys, id } = decoderOutpost();
  discoverSite(sys, "reef_pumphouse_site");
  discoverSite(sys, "canopy_basket_site");
  assert.match(startDecode(s, sys, "home_pod", PUMP) ?? "", /no decoder module/);
  assert.equal(startDecode(s, sys, id, PUMP), null);
  assert.match(startDecode(s, sys, id, PUMP) ?? "", /already decoding/);
  const before = snapshot(s, sys);
  assert.match(startDecode(s, sys, id, BASKET) ?? "", /busy/);
  assert.equal(snapshot(s, sys), before);
  swimTo(s, SPOTS.b);
  assert.match(startDecode(s, sys, id, BASKET) ?? "", /Start decodes at Outpost 1/);
});

test("decode progress belongs to the decoder module: removed it pauses, socketed elsewhere it resumes", () => {
  const { s, sys, id, decoder } = decoderOutpost();
  discoverSite(sys, "reef_pumphouse_site");
  startDecode(s, sys, id, PUMP);
  run(s, sys, 50);
  assert.equal(removeModule(s, sys, id, "s0"), null);
  run(s, sys, 50);
  assert.equal(sys.decodes[0]!.progress, 50);
  assert.equal(decodeViews(s, sys)[0]!.status, "not-installed");
  // The pod: its own plant powers it.
  swimTo(s, { x: 0, y: 0.18, z: 21.2 });
  assert.equal(installModule(s, sys, "home_pod", "s0", decoder), null);
  run(s, sys, 310);
  assert.deepEqual(sys.decoded, [PUMP]);
});

test("LS-1: the main path grants the decoder, every kit tier and planters from real records on both routes, never only by a decode", () => {
  for (const t of OUTPOST_TIER_ORDER) assert.ok((MAIN_PATH_PLANS as readonly string[]).includes(OUTPOST_TIERS[t].bp), t);
  for (const plan of ["bp_decoder", "bp_cultivation"]) assert.ok((MAIN_PATH_PLANS as readonly string[]).includes(plan), plan);
  for (const strategy of ["creel", "carrier"] as const) {
    assert.deepEqual(mainPathPlanProblems(strategy), [], strategy);
    for (const stop of mainPathPlanRoute(strategy)) {
      assert.ok(stop.record && Object.hasOwn(TECH_RECORDS, stop.record), `${strategy}: ${stop.plan} from a real record`);
      assert.ok(!DECODABLE_IDS.some((d) => (DECODABLES[d].gates as readonly string[]).includes(stop.record!)), `${stop.plan}'s record is not behind a decode`);
    }
  }
});
