// HEAVY TIER (expensive, no Babylon). Run through scripts/heavy-check.sh
// with --test-concurrency=1; each CA-1 heavy file is its own process (this
// one is split from the retreat file to keep each under the heap budget).
import test from "node:test";
import assert from "node:assert/strict";
import { REEF } from "../src/content/proposals/reef.js";
import { ISLES } from "../src/content/proposals/isles.js";
import { CAVE_NETWORKS } from "../src/content/regions/caves/networks.js";
import { AIR_SECONDS, groups, SWIM_SPEED } from "./caves-reef-isles-heavy.js";
import { clearRetreatCache, frame, kit, retreat, roomAt, roomPoses } from "./caves-reef-isles-support.js";

test("adverse: the deepest small-cave network, lamp off with 20% air: every room has a swept way out in time", () => {
  // The bible counts the accepted Fanvault with the small caves (it lists it as built, not as a proposal).
  const small = new Set(["fanvault", ...[...REEF.caves, ...ISLES.caves].filter(c => c.size === "small").map(c => c.id)]);
  const nets = CAVE_NETWORKS.filter(n => n.links.length && n.caves.every(id => small.has(id)));
  const deepest = (ids: readonly string[]): number => Math.min(...ids.map(id => Math.min(...kit(id).def.rooms.map(r => r.bounds.min.y))));
  const net = [...nets].sort((a, b) => deepest(a.caves) - deepest(b.caves))[0]!;
  assert.equal(net.id, "fanvault", "the Fanvault network (to the Shelf lip at 44 m) is the deepest");
  const fr = frame(net.caves), budget = AIR_SECONDS * SWIM_SPEED;
  console.log(`  ${net.id}: deepest room floor ${deepest(net.caves)} m; ${AIR_SECONDS.toFixed(0)} s of air at ${SWIM_SPEED} m/s = ${budget.toFixed(0)} m`);
  let worst = 0;
  for (const id of net.caves) for (const start of roomPoses(id)) {
    const r = retreat(fr, [start]);
    assert.deepEqual(r.failures, [], `${id}: ${roomAt(start)}`);
    const path = r.paths[0]!, seconds = path.length / SWIM_SPEED;
    worst = Math.max(worst, seconds);
    console.log(`  ${roomAt({ ...start, y: start.y + 0.6 }).padEnd(30)} ${path.length.toFixed(1).padStart(5)} m  ${seconds.toFixed(1).padStart(4)} s  via ${path.exit}`);
    assert.ok(seconds < AIR_SECONDS, `${roomAt(start)}: ${seconds.toFixed(1)} s of swimming with ${AIR_SECONDS} s of air`);
  }
  // And every room of every other small cave.
  for (const ids of groups.filter(g => g.every(id => small.has(id)))) {
    clearRetreatCache();
    const fg = frame(ids);
    for (const id of ids) for (const start of roomPoses(id)) {
      const r = retreat(fg, [start]);
      assert.deepEqual(r.failures, [], `${id}`);
      worst = Math.max(worst, r.paths[0]!.length / SWIM_SPEED);
    }
  }
  console.log(`  slowest way out of any small-cave room: ${worst.toFixed(1)} s (budget ${AIR_SECONDS.toFixed(0)} s)`);
  assert.ok(worst < AIR_SECONDS);
});
