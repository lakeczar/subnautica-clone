// HEAVY TIER (expensive, no Babylon). Run through scripts/heavy-check.sh
// with --test-concurrency=1; each CA-1 heavy file is its own process.
import test from "node:test";
import assert from "node:assert/strict";
import { AUTHORED_CAVE_SOURCES, caves, CAVE_SOURCES } from "../src/content/regions/caves.js";
import { CAVE_CONTENTS } from "../src/content/regions/caves/contents.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { CRAFT_PROFILES, ROUTES } from "../src/content/regions/passages.js";
import { RESCUE_PLANS } from "../src/content/regions/rescue.js";
import { SITES } from "../src/content/regions/sites.js";
import { PLACES, SOURCES } from "../src/content/registry.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { stepGame } from "../src/sim/step.js";
import type { GameCommand, GameState, Vec3, WorldQueries } from "../src/sim/types.js";
import { CAVE_SUB_SWEEP, caveOwner, createCaveWorldQueries, createWorldQueries, SOLIDS, surfaceHeight } from "../src/sim/world.js";
import type { Rect } from "../src/world/types.js";
import { at } from "./b1-support.js";
import { AIR_SECONDS, NEW_CAVES } from "./caves-reef-isles-heavy.js";
import { kit, roomAt } from "./caves-reef-isles-support.js";

/** C4's path for the CA-1 caves: `gameWorld()` as it composes itself once
 * every authored cave is in CAVE_SOURCES (the same call, all solids, the
 * shared floor, every cave owner), and the game's own step swimming through
 * it with ordinary controls. */
const t0 = performance.now();
const defs = AUTHORED_CAVE_SOURCES.map(s => kit(s.id).def);
const t1 = performance.now();
const owners = defs.map(caveOwner);
const world: WorldQueries = createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight, caves: owners });
const t2 = performance.now();
const raw = createWorldQueries(SOLIDS, surfaceHeight);
const DIVER = CRAFT_PROFILES.diver;
/** step.ts: a walking diver's capsule. */
const STANDING = { radius: 0.34, height: 1.75 };
const inRect = (r: Rect, p: { x: number; z: number }, pad = 0): boolean =>
  p.x >= r.minX - pad && p.x <= r.maxX + pad && p.z >= r.minZ - pad && p.z <= r.maxZ + pad;

function diverAt(p: Vec3, deep: boolean): GameState {
  const s = createGame(); completeOpening(s);
  // The Cathedral and the Gully window lie below the bare suit's 60 m.
  if (deep) addItem(s, "suit_150", 1, "equipment").fitted = "suit";
  at(s, p, "swimming");
  return s;
}
/** A keyboard swimmer, as in tests/c4-world.test.ts: turn and pitch toward
 * the next waypoint, W, and Space or C for the vertical part. A walker uses
 * the same keys on land: W, and Space to jump up onto a step just ahead.
 * Targets are never clamped: a waypoint above the water is reached only by
 * the game's own walking transition. */
function swim(s: GameState, path: readonly Vec3[], reach = 1.2, w: WorldQueries = world): { state: GameState; steps: number; stalled: string | null } {
  let steps = 0;
  for (let i = 1; i < path.length; i++) {
    for (let best = Infinity, since = 0; ;) {
      const p = s.player.pose.position, t = path[i]!, dx = t.x - p.x, dz = t.z - p.z, rise = t.y - p.y;
      const walking = s.player.mode === "walking", dy = walking ? 0 : rise, flat = Math.hypot(dx, dz), d = Math.hypot(flat, rise);
      // Space: a walker jumps up onto a step just ahead; a swimmer making for
      // the waterline or a shelf holds it to ride the surface (feet at -0.5,
      // where the walking transition reads its support).
      const jump = (walking && rise > 0.2 && flat < 2) || (!walking && t.y >= -0.5);
      if (d < reach) break;
      if (d < best - 0.2) { best = d; since = 0; } else if (++since > 60 * 8)
        return { state: s, steps, stalled: `waypoint ${i}/${path.length - 1} ${JSON.stringify(t)} at ${JSON.stringify(p)} (${d.toFixed(1)} m)` };
      const yaw = Math.atan2(Math.sin(Math.atan2(dx, -dz) - s.player.pose.yaw), Math.cos(Math.atan2(dx, -dz) - s.player.pose.yaw));
      const pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.max(flat, 1e-6)))) - s.player.pose.pitch;
      s = stepGame(s, [{ type: "look", yawDelta: Math.max(-0.8, Math.min(0.8, yaw)), pitchDelta: Math.max(-0.8, Math.min(0.8, pitch)) },
        { type: "move", forward: flat > 0.5 && Math.abs(yaw) < 0.6 ? 1 : 0, right: 0, vertical: jump ? 1 : Math.max(-1, Math.min(1, dy / 1.5)), sprint: false }] as GameCommand[],
      w).state;
      steps++;
      if (s.player.vitals.health <= 0 || s.metrics.failures > 0) return { state: s, steps, stalled: `incapacitated at ${JSON.stringify(s.player.pose.position)}` };
    }
  }
  return { state: s, steps, stalled: null };
}

test("C4 path: every authored cave composes into the game world, and the exterior is unchanged away from them", () => {
  // The collar columns the adapter adds (sim/world.ts collarColumns): every
  // 0.5 m cell of each footprint's band that no footprint owns.
  const band = 2 * 4.5 + CAVE_SUB_SWEEP + 0.5, cell = 0.5;
  const owned = (x: number, z: number): boolean => owners.some(o => x >= o.footprint.minX && x < o.footprint.maxX && z >= o.footprint.minZ && z < o.footprint.maxZ);
  let collar = 0;
  for (const o of owners) for (let x = o.footprint.minX - band; x < o.footprint.maxX + band - 1e-9; x += cell)
    for (let z = o.footprint.minZ - band; z < o.footprint.maxZ + band - 1e-9; z += cell) if (!owned(x + cell / 2, z + cell / 2)) collar++;
  const rock = owners.reduce((n, o) => n + o.rock.length, 0);
  console.log(`  caves: ${owners.length} (${NEW_CAVES.length} CA-1; ${CAVE_SOURCES.length} in CAVE_SOURCES today)`);
  console.log(`  boxes: cave rock ${rock}, collar columns ${collar}, exterior SOLIDS ${SOLIDS.length}, total ${rock + collar + SOLIDS.length}`);
  console.log(`  build: every cave definition ${((t1 - t0) / 1000).toFixed(1)} s, the composed world ${((t2 - t1) / 1000).toFixed(1)} s`);
  // `caves()` is what gameWorld() reads; today it is the Fanvault alone.
  assert.deepEqual(caves(worldFloor).map(d => d.id), CAVE_SOURCES.map(s => s.id));
  for (const d of defs) {
    const f = d.replacementFootprints[0]!, c = { x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2 };
    assert.equal(world.groundHeight(c.x, c.z), d.source.baseY - 1, `${d.id}: the heightfield steps aside`);
  }
  // Away from every cave and its band, the composed world answers as the raw one.
  let far = 0;
  for (let x = -560; x <= 1460; x += 97) for (let z = -1620; z <= 150; z += 83) {
    if (owners.some(o => inRect(o.footprint, { x, z }, band + 8))) continue;
    const y = Math.min(-0.5, surfaceHeight(x, z) + 2), p = { x, y, z }, d = { x: 3, y: -2, z: -4 };
    assert.deepEqual(world.moveCapsule(p, d, DIVER), raw.moveCapsule(p, d, DIVER));
    assert.equal(world.supportHeight(x, z, y), raw.supportHeight(x, z, y));
    far++;
  }
  assert.ok(far > 300, `${far} far samples`);
});

/** C4's placement rule (tests/c4-world.test.ts) for CA-1 footprints. One
 * walk passes the West sea cave's band on land; the next test shows what
 * the adapter needs for it to walk as it does without the cave. */
const BAND_EXCEPTIONS = ["isles_headland_west: route walk.isles.headland_crest"];
test("C4 path: no route, rescue tether, site, source or place sits in a CA-1 footprint or its collar band", () => {
  const band = 10, found: string[] = [];
  for (const s of AUTHORED_CAVE_SOURCES) {
    if (!NEW_CAVES.includes(s.id)) continue;
    const f = s.footprint;
    for (const r of ROUTES) if (r.path.some(p => inRect(f, p, band))) found.push(`${s.id}: route ${r.id}`);
    for (const plan of Object.values(RESCUE_PLANS) as { id?: string; path?: readonly Vec3[] }[])
      if ((plan.path ?? []).some(p => inRect(f, p, band))) found.push(`${s.id}: rescue ${plan.id}`);
    for (const site of SITES) if (inRect(f, site.at)) found.push(`${s.id}: site ${site.id}`);
    for (const [id, src] of Object.entries(SOURCES)) if (inRect(f, src.position)) found.push(`${s.id}: source ${id}`);
    for (const [id, p] of Object.entries(PLACES)) if (inRect(f, p.position)) found.push(`${s.id}: place ${id}`);
  }
  assert.deepEqual(found, BAND_EXCEPTIONS);
});

test("C4 path: the headland crest walk, 7 m from the West sea cave, needs exterior support outside footprints", () => {
  const walk = ROUTES.find(r => r.id === "walk.isles.headland_crest")!;
  const f = AUTHORED_CAVE_SOURCES.find(s => s.id === "isles_headland_west")!.footprint;
  // Its first waypoints, through the collar band and 10 m past it.
  const last = walk.path.reduce((n, p, i) => inRect(f, p, 10) ? i : n, 0) + 2;
  const path = walk.path.slice(0, last + 1).map(p => ({ x: p.x, y: surfaceHeight(p.x, p.z), z: p.z }));
  const start = (): GameState => { const s = createGame(); completeOpening(s); at(s, { ...path[0]!, y: path[0]!.y + 0.05 }, "walking"); return s; };
  // Today's adapter answers supportHeight from the composite anywhere in the
  // 10 m band, where collar columns top each 0.5 m cell at its highest floor
  // sample: on this 0.7 gradient, 0.2-0.35 m stairs. Outside every footprint
  // the exterior world's support is exact (cave rock is only inside one), so
  // the proposed rule reads it there.
  const owned = (x: number, z: number): boolean => owners.some(o => x >= o.footprint.minX && x < o.footprint.maxX && z >= o.footprint.minZ && z < o.footprint.maxZ);
  const proposed: WorldQueries = { ...world, supportHeight: (x, z, y) => owned(x, z) ? world.supportHeight(x, z, y) : raw.supportHeight(x, z, y) };
  let stairs = 0;
  for (let i = 1; i < path.length; i++) for (let k = 0; k < 10; k++) {
    const x = path[i - 1]!.x + (path[i]!.x - path[i - 1]!.x) * k / 10, z = path[i - 1]!.z + (path[i]!.z - path[i - 1]!.z) * k / 10;
    stairs = Math.max(stairs, world.supportHeight(x, z, 50) - raw.supportHeight(x, z, 50));
    assert.equal(proposed.supportHeight(x, z, 50), raw.supportHeight(x, z, 50));
  }
  const without = swim(start(), path, 1.2, raw), today = swim(start(), path, 1.2, world), fixed = swim(start(), path, 1.2, proposed);
  console.log(`  ${path.length - 1} legs: ${(without.steps / 60).toFixed(1)} s without the cave; with it today: ${today.stalled ? `stalls (${today.stalled}), collar support up to ${stairs.toFixed(2)} m above the floor` : `${(today.steps / 60).toFixed(1)} s`}; with exterior support outside footprints: ${(fixed.steps / 60).toFixed(1)} s`);
  assert.equal(without.stalled, null);
  assert.equal(fixed.stalled, null);
  assert.equal(fixed.state.player.mode, "walking");
  assert.ok(Math.abs(fixed.steps - without.steps) <= 30, "within half a second of the cave-free walk");
});

test("C4 path: a diver swims every diver route of every CA-1 cave through the game's step with ordinary controls", () => {
  const failures: string[] = [];
  let routes = 0, seconds = 0;
  const t = performance.now();
  for (const id of NEW_CAVES) for (const r of kit(id).def.routes) {
    if (r.profile !== "diver") continue;
    const deep = Math.min(...r.path.map(p => p.y)) < -59;
    const run = swim(diverAt(r.path[0]!, deep), r.path);
    routes++; seconds += run.steps / 60;
    const end = run.state.player.pose.position, last = r.path.at(-1)!;
    if (run.stalled) failures.push(`${r.id}: ${run.stalled}`);
    else if (Math.hypot(end.x - last.x, end.y - last.y, end.z - last.z) > 1.2) failures.push(`${r.id}: ends ${JSON.stringify(end)}, short of ${JSON.stringify(last)}`);
    else if (last.y > -0.5 && run.state.player.mode !== "walking") failures.push(`${r.id}: ends above the water but not standing`);
    else if (!world.clearance(end, run.state.player.mode === "walking" ? STANDING : DIVER)) failures.push(`${r.id}: ends in rock at ${JSON.stringify(end)}`);
  }
  console.log(`  ${routes} diver routes swum, ${seconds.toFixed(0)} s of game time in ${((performance.now() - t) / 1000).toFixed(1)} s`);
  assert.deepEqual(failures, []);
});

test("C4 path: every route waypoint above the water is a standing pose on rock, clear for a walker", () => {
  // A swimmer's feet never rise above -0.5, so anything higher must be stood
  // on: rock under the walker's footprint (its centre or a corner, as at a
  // step's edge; step.ts reads a lip the same way) and room to stand.
  const standing: string[] = [], failures: string[] = [];
  for (const id of NEW_CAVES) for (const r of kit(id).def.routes) for (const p of r.path) {
    if (p.y <= -0.5) continue;
    standing.push(`${r.id} ${p.x},${p.y},${p.z}`);
    const e = STANDING.radius, floor = Math.max(...[[0, 0], [-e, -e], [-e, e], [e, -e], [e, e]].map(([ox, oz]) => world.supportHeight(p.x + ox!, p.z + oz!, p.y + 0.1)));
    if (!(p.y - floor >= -1e-6 && p.y - floor < 0.05)) failures.push(`${r.id}: ${JSON.stringify(p)} floats ${(p.y - floor).toFixed(2)} m over its floor`);
    else if (!world.clearance(p, STANDING)) failures.push(`${r.id}: no room to stand at ${JSON.stringify(p)}`);
  }
  console.log(`  ${standing.length} standing waypoints: ${standing.join("; ")}`);
  assert.deepEqual(failures, []);
});

test("C4 path: Blowhole, by ordinary keys: in the mouth, up the chimney, onto the wading shelf, up onto the dry ledge, and back out", () => {
  const def = kit("isles_blowhole").def;
  const back = def.routes.find(r => r.id === "isles_blowhole.route.ledge")!.path;
  const ledge = back[0]!, mouth = back.at(-1)!;
  // The air the diver has is the ordinary full suit; the check is reach, not air.
  const s0 = diverAt({ ...mouth, z: mouth.z + 3 }, false);
  const approach = swim(s0, [{ ...mouth, z: mouth.z + 3 }, ...[...back].reverse()], 0.5);
  assert.equal(approach.stalled, null, approach.stalled ?? "");
  let s = approach.state;
  const idle = (n: number): void => {
    for (let i = 0; i < n; i++) s = stepGame(s, [{ type: "look", yawDelta: 0, pitchDelta: 0 }, { type: "move", forward: 0, right: 0, vertical: 0, sprint: false }] as GameCommand[], world).state;
  };
  idle(30); // land from the jump
  const on = { ...s.player.pose.position };
  console.log(`  approach: ${(approach.steps / 60).toFixed(1)} s; stands at ${on.x.toFixed(2)}, ${on.y.toFixed(2)}, ${on.z.toFixed(2)}, ${s.player.mode}`);
  assert.equal(s.player.mode, "walking", "the diver stands");
  assert.ok(Math.abs(on.y - ledge.y) < 0.05 && on.y >= -0.01, `on the dry ledge, feet at ${on.y.toFixed(3)}`);
  assert.ok(on.x < 1070.5 && world.supportHeight(on.x, on.z, on.y + 0.1) >= -1e-6, "over the ledge's rock, above the waterline");
  assert.ok(world.clearance(on, STANDING), "room to stand");
  // Standing still for three seconds: it stays put, dry, and walking.
  idle(180);
  const still = s.player.pose.position;
  assert.equal(s.player.mode, "walking");
  assert.ok(Math.hypot(still.x - on.x, still.y - on.y, still.z - on.z) < 0.05, "stands still on the ledge");
  // The stash sits here.
  const stash = CAVE_CONTENTS.find(c => c.id === "isles_blowhole.stash")!;
  assert.ok(Math.hypot(stash.at.x - still.x, stash.at.z - still.z) < 1.5 && Math.abs(stash.at.y - world.supportHeight(stash.at.x, stash.at.z, 1)) < 0.05,
    "the stash lies on the ledge's floor, within reach");
  // And back: off the step, off the shelf into the chimney, down and out the mouth.
  const ret = swim(s, back, 0.8);
  assert.equal(ret.stalled, null, ret.stalled ?? "");
  const out = ret.state.player.pose.position;
  console.log(`  return: ${(ret.steps / 60).toFixed(1)} s to ${out.x.toFixed(2)}, ${out.y.toFixed(2)}, ${out.z.toFixed(2)}, ${ret.state.player.mode}`);
  assert.equal(ret.state.player.mode, "swimming");
  assert.ok(Math.hypot(out.x - mouth.x, out.y - mouth.y, out.z - mouth.z) < 0.8 && world.clearance(out, DIVER), "out at the mouth");
  // The chimney top is light and air, not an exit: no route claims it.
  assert.ok(def.routes.every(r => r.path.every(p => p.y < 1)), "no route climbs the chimney");
  assert.ok(!def.routes.some(r => r.role === "loop"), "one way out: no loop through the chimney");
});

test("C4 path ADVERSE: from the deepest small-cave room, lamp off with 20% air, a diver swims out and surfaces through the step", () => {
  // The Shelf lip crawl (44 m, the deepest room of the deepest small-cave
  // network) along its rescue route, then straight up.
  const out = kit("reef_shelf_lip").def.routes.find(r => r.id === "reef_shelf_lip.route.crawl_rescue")!.path;
  const s = diverAt(out[0]!, false);
  s.player.lamp = false;
  s.player.vitals.oxygen = 20;
  const top = out.at(-1)!;
  const run = swim(s, [...out, { ...top, y: -0.5 }], 0.6);
  const end = run.state;
  console.log(`  from ${roomAt({ ...out[0]!, y: out[0]!.y + 0.6 })}: surfaced in ${(run.steps / 60).toFixed(1)} s with ${end.player.vitals.oxygen.toFixed(1)}% air left (${AIR_SECONDS.toFixed(0)} s budget)`);
  assert.equal(run.stalled, null);
  assert.ok(end.player.pose.position.y > -1.15, `surfaced: ${JSON.stringify(end.player.pose.position)}`);
  assert.ok(end.player.vitals.oxygen > 0, "air left");
  assert.equal(end.metrics.failures, 0, "never incapacitated");
  assert.equal(end.player.lamp, false);
});

test("C4 path: diver step cost with every authored cave in the game world", () => {
  const steps: { p: Vec3; d: Vec3 }[] = [];
  for (const id of NEW_CAVES) for (const r of kit(id).def.routes) if (r.profile === "diver")
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!, b = r.path[i]!, len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.max(1, Math.ceil(len / 0.25));
      for (let k = 0; k < n; k++) steps.push({ p: { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, z: a.z + (b.z - a.z) * k / n },
        d: { x: (b.x - a.x) / n, y: (b.y - a.y) / n, z: (b.z - a.z) / n } });
    }
  const times: number[] = [];
  for (let rep = 0; rep < 3; rep++) {
    const start = performance.now();
    for (const { p, d } of steps) {
      const m = world.moveCapsule(p, d, DIVER);
      world.supportHeight(m.position.x, m.position.z, m.position.y);
    }
    times.push((performance.now() - start) * 1000 / steps.length);
  }
  const us = times.sort((a, b) => a - b)[1]!;
  console.log(`  diver step (move 0.25 m + support), median of 3 over ${steps.length} steps: ${us.toFixed(1)} us`);
  assert.ok(us < 1000, `${us} us per step`);
});
