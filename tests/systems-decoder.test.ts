import test from "node:test";
import assert from "node:assert/strict";
import { DECODABLE_IDS, DECODABLES, DECODE_MINUTES, DEMO_MAIN_PATH, LOST_SITES } from "../src/content/systems/decodes.js";
import { advanceDecodes, decodeSeconds, decodeViews, decoderPlanProblems, discoverSite, knownSites, recordReadable, startDecode } from "../src/sim/systems/decoder.js";
import { installModule, outpostLockerId, removeModule } from "../src/sim/systems/hosts.js";
import { deployOutpost } from "../src/sim/systems/outposts.js";
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

test("demo decodables are story-neutral placeholders taking 3–15 minutes", () => {
  assert.ok(DECODABLE_IDS.length >= 3);
  for (const id of DECODABLE_IDS) {
    assert.match(id, /^demo_/);
    const d = DECODABLES[id];
    assert.ok(Object.hasOwn(LOST_SITES, d.site), `${id} site`);
    const minutes = DECODE_MINUTES[d.size];
    assert.ok(minutes >= 3 && minutes <= 15, `${id} takes ${minutes} min`);
  }
  assert.deepEqual(Object.values(DECODE_MINUTES), [3, 6, 10, 15]);
});

test("sites are found without decoding; their records stay unreadable until decoded", () => {
  const { s, sys, id } = decoderOutpost();
  assert.equal(recordReadable(sys, "demo_hut_log"), false);
  assert.equal(recordReadable(sys, "some_ungated_record"), true);
  assert.match(startDecode(s, sys, id, "demo_hut_fragment") ?? "", /Find the site first/);
  assert.deepEqual(discoverSite(sys, "demo_relay_hut"), ["demo_hut_fragment"]);
  assert.deepEqual(discoverSite(sys, "demo_relay_hut"), [], "finding twice adds nothing");
  assert.deepEqual(knownSites(sys), ["demo_relay_hut"]);
  assert.equal(recordReadable(sys, "demo_hut_log"), false);
  assert.equal(startDecode(s, sys, id, "demo_hut_fragment"), null);
  const done = run(s, sys, decodeSeconds("demo_hut_fragment"));
  assert.equal(done.length, 1);
  assert.equal(recordReadable(sys, "demo_hut_log"), true);
  assert.match(startDecode(s, sys, id, "demo_hut_fragment") ?? "", /already decoded/);
});

test("a fragment takes 3 minutes; decoded maps add beacons, sites and plans", () => {
  const { s, sys, id } = decoderOutpost();
  discoverSite(sys, "demo_relay_hut");
  startDecode(s, sys, id, "demo_hut_fragment");
  assert.equal(run(s, sys, 179).length, 0);
  const [done] = run(s, sys, 1);
  assert.deepEqual(done, { decodable: "demo_hut_fragment", blueprints: [], readable: ["demo_hut_log"], beacons: ["demo_cairn_hint"] });
  assert.deepEqual(sys.beacons.map((b) => [b.id, b.category, b.source]), [["demo_cairn_hint", "hint", "decode"]]);
  assert.deepEqual(sys.decodes, []);
  discoverSite(sys, "demo_survey_cairn");
  startDecode(s, sys, id, "demo_cairn_survey");
  run(s, sys, 6 * 60);
  assert.ok((s.knowledge.blueprints as string[]).includes("bp_outpost_standard"));
  assert.deepEqual(knownSites(sys).sort(), ["demo_relay_hut", "demo_survey_cairn", "demo_vault"]);
});

test("decodes need power: a cell-powered outpost pauses without a charged cell", () => {
  const { s, sys } = opened();
  const id = give(s, "outpost_kit_basic");
  swimTo(s, SPOTS.a);
  deployOutpost(s, sys, id, SPOTS.a, siteTable());
  const decoder = give(s, "mod_decoder");
  installModule(s, sys, id, "s0", decoder);
  discoverSite(sys, "demo_relay_hut");
  assert.equal(startDecode(s, sys, id, "demo_hut_fragment"), null);
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
  discoverSite(sys, "demo_relay_hut");
  startDecode(s, sys, id, "demo_hut_fragment");
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
  discoverSite(sys, "demo_relay_hut");
  startDecode(s, sys, id, "demo_hut_fragment");
  const fast = { decoderSpeed: (m: string) => m === decoder ? 2 : 1 };
  assert.equal(decodeViews(s, sys, fast)[0]!.remaining, 90);
  assert.equal(run(s, sys, 90, fast).length, 1);
});

test("start refusals: no decoder, busy decoder, not local, already running", () => {
  const { s, sys, id, decoder } = decoderOutpost();
  discoverSite(sys, "demo_relay_hut");
  discoverSite(sys, "demo_survey_cairn");
  assert.match(startDecode(s, sys, "home_pod", "demo_hut_fragment") ?? "", /no decoder module/);
  assert.equal(startDecode(s, sys, id, "demo_hut_fragment"), null);
  assert.match(startDecode(s, sys, id, "demo_hut_fragment") ?? "", /already decoding/);
  const before = snapshot(s, sys);
  assert.match(startDecode(s, sys, id, "demo_cairn_survey") ?? "", /busy/);
  assert.equal(snapshot(s, sys), before);
  swimTo(s, SPOTS.b);
  assert.match(startDecode(s, sys, id, "demo_cairn_survey") ?? "", /Start decodes at Outpost 1/);
  void decoder;
});

test("decode progress belongs to the decoder module: removed it pauses, socketed elsewhere it resumes", () => {
  const { s, sys, id, decoder } = decoderOutpost();
  discoverSite(sys, "demo_relay_hut");
  startDecode(s, sys, id, "demo_hut_fragment");
  run(s, sys, 50);
  assert.equal(removeModule(s, sys, id, "s0"), null);
  run(s, sys, 50);
  assert.equal(sys.decodes[0]!.progress, 50);
  assert.equal(decodeViews(s, sys)[0]!.status, "not-installed");
  // The pod: its own plant powers it.
  swimTo(s, { x: 0, y: 0.18, z: 21.2 });
  assert.equal(installModule(s, sys, "home_pod", "s0", decoder), null);
  run(s, sys, 130);
  assert.deepEqual(sys.decoded, ["demo_hut_fragment"]);
});

test("the main-path check: decoder plans are granted before any decode the path needs", () => {
  assert.deepEqual(decoderPlanProblems(DEMO_MAIN_PATH), []);
  const late = [...DEMO_MAIN_PATH.filter((p) => p.id !== "workshop_signal_rack"), DEMO_MAIN_PATH[2]!];
  assert.match(decoderPlanProblems(late).join("\n"), /"basin_vault" needs demo_vault_archive before the decoder plans/);
  const gated = DEMO_MAIN_PATH.map((p) => p.id === "workshop_signal_rack" ? { ...p, needsDecoded: ["demo_hut_fragment"] } : p);
  assert.match(decoderPlanProblems(gated).join("\n"), /granted at "workshop_signal_rack", which itself needs a decode/);
  const missing = DEMO_MAIN_PATH.filter((p) => p.id !== "workshop_signal_rack");
  assert.match(decoderPlanProblems(missing).join("\n"), /bp_decoder is not granted anywhere/);
  const unknown = [...DEMO_MAIN_PATH, { id: "x", grants: [], needsDecoded: ["nope"] }];
  assert.match(decoderPlanProblems(unknown).join("\n"), /unknown decodable nope/);
  // Story decodes in the demo data are needed on the path, after the plans.
  for (const id of DECODABLE_IDS.filter((d) => DECODABLES[d].story))
    assert.ok(DEMO_MAIN_PATH.some((p) => (p.needsDecoded as readonly string[]).includes(id)), id);
});
