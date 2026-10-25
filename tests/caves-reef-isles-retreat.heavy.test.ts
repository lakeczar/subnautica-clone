// HEAVY TIER (expensive, no Babylon). Run through scripts/heavy-check.sh
// with --test-concurrency=1; each CA-1 heavy file is its own process.
import test from "node:test";
import assert from "node:assert/strict";
import { groups, NEW_CAVES } from "./caves-reef-isles-heavy.js";
import { clearRetreatCache, frame, plugs, retreat, retreatStarts } from "./caves-reef-isles-support.js";

test("adverse: lamp off, every Reef and Isles cave has a recognisable exit from every route and room", () => {
  let starts = 0, hops = 0;
  const used = new Map<string, number>();
  for (const ids of groups) {
    const fr = frame(ids), from = ids.flatMap(retreatStarts), r = retreat(fr, from);
    starts += from.length; hops += r.hops;
    assert.deepEqual(r.failures, [], `${ids.join(", ")}`);
    for (const [exit, n] of Object.entries(r.exits)) used.set(exit, (used.get(exit) ?? 0) + n);
    clearRetreatCache();
    // A swim of hops, not a jump; every cave's own exits are in use.
    assert.ok(r.hops >= from.length, `${ids}: ${r.hops} hops for ${from.length} starts`);
  }
  console.log(`  ${starts} starts, ${hops} hops; exits used: ${[...used].map(([e, n]) => `${e} ${n}`).join(", ")}`);
  for (const id of NEW_CAVES) assert.ok([...used.keys()].some(e => e.startsWith(`${id}.`) || e.startsWith(`air:${id}.`)), `${id}: no exit of its own was used`);
});

test("negative control: with every opening plugged the same retreat fails", () => {
  for (const ids of [["reef_archlet", "reef_bellhole", "reef_wrackhollow"], ["isles_storm_arch"]]) {
    const from = ids.flatMap(retreatStarts), sealed = frame(ids, plugs(ids));
    const r = retreat(sealed, from, sealed.world);
    assert.ok(r.failures.length >= from.length * 0.9, `${r.failures.length} of ${from.length} escaped sealed ${ids.join(", ")}`);
  }
});
