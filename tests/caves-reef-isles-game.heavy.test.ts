// HEAVY TIER (expensive, no Babylon). Run through scripts/heavy-check.sh
// with --test-concurrency=1; each CA-1 heavy file is its own process.
import test from "node:test";
import assert from "node:assert/strict";
import { AUTHORED_CAVE_SOURCES, caves, CAVE_SOURCES } from "../src/content/regions/caves.js";
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
 * the same keys on land. */
function swim(s: GameState, path: readonly Vec3[], reach = 1.2, w: WorldQueries = world): { state: GameState; steps: number; stalled: string | null } {
  let steps = 0;
  for (let i = 1; i < path.length; i++) {
    for (let best = Infinity, since = 0; ;) {
      const p = s.player.pose.position, t = path[i]!, dx = t.x - p.x, dz = t.z - p.z;
      const dy = s.player.mode === "walking" ? 0 : t.y - p.y, flat = Math.hypot(dx, dz), d = Math.hypot(flat, dy);
      if (d < reach) break;
      if (d < best - 0.2) { best = d; since = 0; } else if (++since > 60 * 8)
        return { state: s, steps, stalled: `waypoint ${i}/${path.length - 1} ${JSON.stringify(t)} at ${JSON.stringify(p)} (${d.toFixed(1)} m)` };
      const yaw = Math.atan2(Math.sin(Math.atan2(dx, -dz) - s.player.pose.yaw), Math.cos(Math.atan2(dx, -dz) - s.player.pose.yaw));
      const pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.max(flat, 1e-6)))) - s.player.pose.pitch;
      s = stepGame(s, [{ type: "look", yawDelta: Math.max(-0.8, Math.min(0.8, yaw)), pitchDelta: Math.max(-0.8, Math.min(0.8, pitch)) },
        { type: "move", forward: flat > 0.5 && Math.abs(yaw) < 0.6 ? 1 : 0, right: 0, vertical: Math.max(-1, Math.min(1, dy / 1.5)), sprint: false }] as GameCommand[],
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
    // A swimmer reaches a waypoint in the air (a chimney top, a dry ledge) by
    // surfacing under it; leaving the water is the waterline's job (not validated).
    const path = r.path.map(p => ({ ...p, y: Math.min(p.y, -0.5) }));
    const run = swim(diverAt(path[0]!, deep), path);
    routes++; seconds += run.steps / 60;
    const end = run.state.player.pose.position;
    if (run.stalled) failures.push(`${r.id}: ${run.stalled}`);
    else if (!world.clearance(end, DIVER) && run.state.player.mode === "swimming") failures.push(`${r.id}: ends in rock at ${JSON.stringify(end)}`);
  }
  console.log(`  ${routes} diver routes swum, ${seconds.toFixed(0)} s of game time in ${((performance.now() - t) / 1000).toFixed(1)} s`);
  assert.deepEqual(failures, []);
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
