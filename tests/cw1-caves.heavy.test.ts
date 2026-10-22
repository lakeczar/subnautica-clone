// CW-1, heavy (no Babylon; expensive): the game's whole kit-cave world and
// the sheltered-cave adverse case through `stepGame`.
import test from "node:test";
import assert from "node:assert/strict";
import { CAVE_SOURCES } from "../src/content/regions/caves.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { flowHere, stepGame } from "../src/sim/step.js";
import { flowAt } from "../src/sim/currents/world.js";
import { gameWorld } from "../src/sim/world.js";
import type { GameState, Vec3, WorldQueries } from "../src/sim/types.js";

const world = gameWorld();
/** The same world without its caves' shelter: the currents' field alone. */
const unmasked: WorldQueries = (() => { const w: Record<string, unknown> = { ...world }; delete w.kitCaves; return w as unknown as WorldQueries; })();

/** An unprotected diver (pressure suit only, full air) left idle at `p` from
 * `tick` for `seconds`. */
function idle(p: Vec3, tick: number, seconds: number, w: WorldQueries): GameState {
  let s = createGame();
  completeOpening(s);
  s.tick = tick; s.player.mode = "swimming"; s.player.pose.position = { ...p }; s.player.lamp = false;
  s.player.vitals.oxygen = 100; s.player.vitals.health = 100;
  s.inventory.items.push({ id: "cw1.suit", kind: "suit_800", quantity: 1, containerId: "equipment", fitted: "suit", charge: null, provenance: "public" });
  for (let i = 0; i < seconds * 60; i++) s = stepGame(s, [], w).state;
  return s;
}
const moved = (s: GameState, p: Vec3): number => Math.hypot(s.player.pose.position.x - p.x, s.player.pose.position.y - p.y, s.player.pose.position.z - p.z);

test("sheltered caves are still water: a diver resting in the crest hollow or the lintel galleries stays put; unmasked, the downwelling carries them", () => {
  // Sol's CA-3 R1 repro: the crest hollow's shelter at cycle time 40 s, 15 s idle.
  const cases: { id: string; at: Vec3 }[] = [
    { id: "divide_crest_hollow shelter", at: { x: 690, y: -366.3, z: -1212 } },
    { id: "divide_lintel_galleries crawl", at: { x: 705, y: -356.86, z: -1240 } },
  ];
  for (const c of cases) {
    assert.ok(world.kitCaves.inside(c.at), `${c.id}: the datum is cave water`);
    assert.equal(flowHere(world, c.at, 40 * 60).speed, 0);
    assert.ok(flowAt(c.at, 40 * 60).speed > 0.3, `${c.id}: the crest current reaches here unmasked (${flowAt(c.at, 40 * 60).speed.toFixed(2)} m/s)`);
    const rest = idle(c.at, 40 * 60, 15, world);
    assert.ok(moved(rest, c.at) < 0.6, `${c.id}: drifted ${moved(rest, c.at).toFixed(2)} m`);
    assert.equal(rest.player.vitals.health, 100, `${c.id}: health ${rest.player.vitals.health}`);
    assert.equal(rest.world.ecology.diver.brine, 0, `${c.id}: brine load ${rest.world.ecology.diver.brine}`);
    const control = idle(c.at, 40 * 60, 15, unmasked);
    assert.ok(moved(control, c.at) > 2, `control ${c.id}: unmasked, the current moved the diver ${moved(control, c.at).toFixed(2)} m`);
  }
  // Exterior flow is untouched: just outside the hollow's mouth, the crest current still runs.
  const outside = { x: 690, y: -362, z: -1196 };
  if (!world.kitCaves.inside(outside)) assert.equal(flowHere(world, outside, 40 * 60).speed, flowAt(outside, 40 * 60).speed);
});

test("every kit cave cluster of the game builds from its records; their size is what the streamer budgets", () => {
  const k = world.kitCaves, before = process.memoryUsage().heapUsed;
  const started = performance.now();
  k.step(k.clusters.map(c => c.index), Infinity, () => performance.now());
  const ms = performance.now() - started;
  assert.ok(k.clusters.every(c => k.ready(c.index)));
  assert.equal(k.clusters.flatMap(c => c.caves).length, CAVE_SOURCES.length);
  console.log(`cw1: ${CAVE_SOURCES.length} caves in ${k.clusters.length} clusters, ${k.stats.residentBoxes} boxes, ` +
    `built in ${(ms / 1000).toFixed(1)} s from live records, heap +${((process.memoryUsage().heapUsed - before) / 1048576).toFixed(0)} MiB`);
  for (const c of k.clusters) k.evict(c.index);
  assert.equal(k.stats.residentBoxes, 0);
});
