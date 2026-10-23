import test from "node:test";
import assert from "node:assert/strict";
import { HAZARD_FIELDS, type HazardFieldId } from "../src/content/ecology/hazards.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { CHIMNEY_PULSE, CREATURE_CYCLES, CREST_SLACK, SEDIMENT_SURGE, WORLD_CYCLES } from "../src/content/currents/cycles.js";
import { REEF_SHELF_RACE, WORLD_CURRENTS } from "../src/content/currents/world.js";
import { CAVE_SOURCES, caveDef } from "../src/content/regions/caves.js";
import { ROUTES } from "../src/content/regions/passages.js";
import { RESCUE_PLANS } from "../src/content/regions/rescue.js";
import { SITES } from "../src/content/regions/sites.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { HULL_COLLIDERS, PLACES, SOURCES } from "../src/content/registry.js";
import { cycleLevel as frameworkLevel, secondsAt } from "../src/sim/cycles/cycle.js";
import { volumeWeight } from "../src/sim/currents/flow.js";
import { respondToFlow } from "../src/sim/currents/motion.js";
import { flowAt, worldCurrents } from "../src/sim/currents/world.js";
import { protectionFor, sampleHazards } from "../src/sim/ecology/hazards.js";
import { FIXED_SECONDS as DT } from "../src/sim/clock.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { stepGame } from "../src/sim/step.js";
import type { GameCommand, GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { CAVE_INDEX_CELL, createCaveWorldQueries, createWorldQueries, gameWorld, hullClearance, hullFloor, SOLIDS, surfaceHeight, caveOwner,
  type Solid } from "../src/sim/world.js";
import { at, creelFirst, parkCreel, pilotCreel } from "./b1-support.js";
import { drive } from "./journey-support.js";
import { play } from "./step-support.js";

const world = gameWorld();
const fanvault = caveDef("fanvault", worldFloor), footprint = fanvault.replacementFootprints[0]!;
const DIVER = { radius: 0.34, height: 0.95 };
const inFootprint = (p: Vec3, pad = 0): boolean => p.x >= footprint.minX - pad && p.x <= footprint.maxX + pad &&
  p.z >= footprint.minZ - pad && p.z <= footprint.maxZ + pad;

function diverAt(p: Vec3): GameState {
  const s = createGame(); completeOpening(s);
  at(s, p, "swimming");
  return s;
}
/** A keyboard swimmer: turn and pitch toward the next waypoint, W, and
 * Space or C for the vertical part (journey-support's driver leaves vertical
 * input to pilots, which strands a swimmer under a straight-up exit). */
function swim(s: GameState, path: readonly Vec3[], reach = 1.2): { state: GameState; steps: number } {
  let steps = 0;
  for (let i = 1; i < path.length; i++) {
    for (let best = Infinity, since = 0; ;) {
      const p = s.player.pose.position, t = path[i]!, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
      const flat = Math.hypot(dx, dz), d = Math.hypot(flat, dy);
      if (d < reach) break;
      if (d < best - 0.2) { best = d; since = 0; } else if (++since > 60 * 8) assert.fail(`stalled at ${JSON.stringify(p)} toward ${JSON.stringify(t)}`);
      const yaw = Math.atan2(Math.sin(Math.atan2(dx, -dz) - s.player.pose.yaw), Math.cos(Math.atan2(dx, -dz) - s.player.pose.yaw));
      const pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.max(flat, 1e-6)))) - s.player.pose.pitch;
      s = stepGame(s, [{ type: "look", yawDelta: Math.max(-0.8, Math.min(0.8, yaw)), pitchDelta: Math.max(-0.8, Math.min(0.8, pitch)) },
        { type: "move", forward: flat > 0.5 && Math.abs(yaw) < 0.6 ? 1 : 0, right: 0, vertical: Math.max(-1, Math.min(1, dy / 1.5)), sprint: false }], world).state;
      steps++;
      assert.ok(s.player.vitals.health > 0 && s.metrics.failures === 0, `alive at ${JSON.stringify(s.player.pose.position)}`);
    }
  }
  return { state: s, steps };
}
const idle = (): GameCommand[] => [{ type: "look", yawDelta: 0, pitchDelta: 0 }, { type: "move", forward: 0, right: 0, vertical: 0, sprint: false }];

// --- Caves in the game world ---------------------------------------------------

test("the game world is the cave-composed world: Fanvault rock collides, the exterior is unchanged elsewhere", () => {
  const raw = createWorldQueries(SOLIDS, surfaceHeight);
  // Inside the footprint the heightfield steps aside and the vault floor is rock.
  const vault = fanvault.rooms.find(r => r.id === "fanvault.vault")!;
  const centre = { x: (vault.bounds.min.x + vault.bounds.max.x) / 2, z: (vault.bounds.min.z + vault.bounds.max.z) / 2 };
  assert.equal(world.groundHeight(centre.x, centre.z), fanvault.source.baseY - 1);
  const floor = world.supportHeight(centre.x, centre.z, vault.bounds.min.y + 1);
  assert.ok(floor > fanvault.source.baseY && floor <= vault.bounds.min.y + 0.5, `vault floor ${floor}`);
  // A diver dropped in the vault lands on its floor and never inside rock.
  const drop = world.moveCapsule({ x: centre.x, y: vault.bounds.min.y + 2, z: centre.z }, { x: 0, y: -5, z: 0 }, DIVER);
  assert.ok(drop.hitSolid && drop.position.y >= floor - 1e-6, JSON.stringify(drop.position));
  // The roof is above the vault: from inside, a rise is stopped by rock.
  const rise = world.moveCapsule({ x: centre.x + 4, y: vault.bounds.min.y + 1, z: centre.z + 3 }, { x: 0, y: 12, z: 0 }, DIVER);
  assert.ok(rise.hitSolid && rise.position.y < -12, `roof holds: ${rise.position.y}`);
  // Away from caves the composed world answers exactly as the raw world.
  for (const p of [{ x: 0, y: 0.5, z: 20 }, { x: 216, y: -160, z: -232 }, { x: -200, y: -30, z: -60 }, { x: 600, y: -340, z: -1240 }]) {
    const d = { x: 3, y: -2, z: -4 };
    assert.deepEqual(world.moveCapsule(p, d, DIVER), raw.moveCapsule(p, d, DIVER));
    assert.equal(world.clearance(p, DIVER), raw.clearance(p, DIVER));
    assert.equal(world.supportHeight(p.x, p.z, p.y), raw.supportHeight(p.x, p.z, p.y));
  }
  assert.equal(CAVE_INDEX_CELL, 8, "W1-PRE-06: the cave composite uses the finer 8 m index");
});

test("no route, rescue tether, site, source or place sits inside a cave footprint and its collar band", () => {
  const band = 10;
  for (const r of ROUTES) for (const p of r.path) assert.ok(!inFootprint(p, band), `${r.id} at ${JSON.stringify(p)}`);
  for (const plan of Object.values(RESCUE_PLANS) as { id?: string; path?: readonly Vec3[] }[])
    for (const p of plan.path ?? []) assert.ok(!inFootprint(p, band), `rescue ${plan.id} at ${JSON.stringify(p)}`);
  for (const s of SITES) assert.ok(!inFootprint({ x: s.at.x, y: 0, z: s.at.z }), `site ${s.id}`);
  for (const [id, s] of Object.entries(SOURCES)) assert.ok(!inFootprint(s.position), `source ${id}`);
  for (const [id, p] of Object.entries(PLACES)) assert.ok(!inFootprint(p.position), `place ${id}`);
  assert.ok(CAVE_SOURCES.some(c => c.id === "fanvault"), "the Fanvault is a cave source (W2 adds the hub caves beside it)");
});

test("a diver swims the Fanvault loop with ordinary controls: in the north mouth, through the vault, out the south", () => {
  const loop = fanvault.routes.find(r => r.role === "loop")!.path;
  const s = diverAt(loop[0]!);
  const run = drive(s, loop, { reach: 1.5, stallSeconds: 10 });
  const end = run.state.player.pose.position;
  assert.ok(!inFootprint(end) && end.z < footprint.minZ, `out the south mouth: ${JSON.stringify(end)}`);
  assert.ok(world.clearance(end, DIVER));
  assert.ok(run.state.player.vitals.health > 0);
});

test("the swim cliff guard reads support: a diver on the north mouth's sill swims straight out", () => {
  // Inside the footprint the masked floor is 17 m below the sill, so the old
  // groundHeight guard saw the exterior shelf as a cliff and zeroed travel.
  const mouth = fanvault.portals.find(p => p.id === "fanvault.mouth.north")!;
  const sill = world.supportHeight(mouth.center.x, mouth.center.z - 3, mouth.center.y);
  // The premise, pinned (C4A-R1 P3): under the sill the heightfield is the masked
  // floor 17 m down, and at the footprint edge the exterior shelf rises from it.
  assert.ok(sill - world.groundHeight(mouth.center.x, mouth.center.z - 3) > 15, "the sill stands on support, not the raw floor");
  const edge = footprint.maxZ + 0.5;
  assert.ok(world.groundHeight(mouth.center.x, edge) - world.groundHeight(mouth.center.x, footprint.maxZ - 0.5) > 15,
    "the raw heightfield steps up at the footprint edge");
  let s = diverAt({ x: mouth.center.x, y: sill + 0.4, z: mouth.center.z - 3 });
  s.player.pose.yaw = Math.PI; // facing +Z: north, out of the mouth
  const start = { ...s.player.pose.position };
  s = play(s, 360, [{ type: "look", yawDelta: 0, pitchDelta: 0 },
    { type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], world);
  const p = s.player.pose.position;
  assert.ok(p.z > footprint.maxZ + 3, `the diver crossed the footprint edge onto the shelf: ${JSON.stringify(start)} → ${JSON.stringify(p)}`);
  assert.ok(world.clearance(p, DIVER));
});

test("the swim cliff guard consults support only: a heightfield that disagrees with support never stops a swimmer", () => {
  // C4A-R1 P3: in today's Fanvault a raw-floor guard happens to agree with
  // support, so pin the rule directly. This world's heightfield rises 14 m
  // above the diver ahead (as a masked footprint's floor disagrees with its
  // cave rock); its support, collision and water are the game world's.
  const start = { x: 60, y: worldFloor(60, -60) + 12, z: -60 }, edge = start.z - 3;
  const disagreeing = { ...world, groundHeight: (x: number, z: number) => z < edge ? start.y + 14 : world.groundHeight(x, z) };
  let s = diverAt(start);
  s.player.pose.yaw = 0; // facing -Z, toward the raised heightfield
  s = play(s, 180, [{ type: "look", yawDelta: 0, pitchDelta: 0 },
    { type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], disagreeing);
  assert.ok(start.z - s.player.pose.position.z > 6, `swam past the heightfield step: ${JSON.stringify(s.player.pose.position)}`);
});

test("ADVERSE: a diver deep in the Fanvault, lamp off and low on air, escapes to the surface through the step", () => {
  // From the catch pocket (the darkest room) along the exit W1 proved an
  // unlit diver can follow by glow alone, then straight up; 15% air is 27 s.
  const exit = fanvault.routes.find(r => r.id === "fanvault.route.pocket_exit")!.path;
  const s = diverAt(exit[0]!);
  s.player.lamp = false;
  s.player.vitals.oxygen = 15;
  const top = exit.at(-1)!;
  const run = swim(s, [...exit, { ...top, y: -0.5 }], 0.6);
  const end = run.state;
  assert.ok(end.player.pose.position.y > -1.15, `surfaced: ${JSON.stringify(end.player.pose.position)}`);
  assert.ok(end.player.vitals.oxygen > 0, `air left: ${end.player.vitals.oxygen.toFixed(1)}%`);
  assert.equal(end.metrics.failures, 0, "never incapacitated");
  assert.equal(end.player.lamp, false);
  assert.ok(run.steps / 60 < 27, `${(run.steps / 60).toFixed(1)} s on 27 s of air`);
});

// --- Currents: one field, one movement owner ------------------------------------

test("the world current field: the shelf race plus S4's two flow fields, equal to S4's flow at every phase", () => {
  const ids = worldCurrents().volumes.map(v => v.id).sort();
  assert.deepEqual(ids, ["current.basin_sediment_lane", "current.divide_downwelling", "current.reef.shelf_race"]);
  for (const id of ["divide_downwelling", "basin_sediment_lane"] as HazardFieldId[]) {
    const f = HAZARD_FIELDS[id], c = sitePosition(f.shape.center);
    if (f.shape.kind !== "box") throw new Error("box");
    const period = (f as { cycle?: { period: number } }).cycle?.period ?? 60;
    for (let i = 0; i < 400; i++) {
      const u = (i * 0.618034) % 1, v = (i * 0.414214) % 1, w = (i * 0.732051) % 1;
      const p = { x: c.x + f.shape.min.x - 6 + (f.shape.max.x - f.shape.min.x + 12) * u,
        y: c.y + f.shape.min.y - 6 + (f.shape.max.y - f.shape.min.y + 12) * v, z: c.z + f.shape.min.z - 6 + (f.shape.max.z - f.shape.min.z + 12) * w };
      const tick = Math.round(i / 400 * period * 60);
      const ours = flowAt(p, tick).flow, s4 = sampleHazards(p, tick).flow;
      // The shelf race is far from both; S4's other fields carry no flow.
      assert.ok(Math.hypot(ours.x - s4.x, ours.y - s4.y, ours.z - s4.z) < 1e-12, `${id} at ${JSON.stringify(p)} tick ${tick}`);
    }
  }
});

test("the chimney pulse, the plume lane and the crest slack run on the cycle framework, tick for tick with S4's trapezoid", () => {
  // S4's original clock (content/ecology/hazards.ts at 854fdf1), verbatim.
  const s4 = (c: { period: number; start: number; duration: number; ramp: number }, tick: number): number => {
    const t = (((tick / 60 - c.start) % c.period) + c.period) % c.period;
    if (t < c.duration) return 1;
    if (t < c.duration + c.ramp) return 1 - (t - c.duration) / c.ramp;
    if (t > c.period - c.ramp) return (t - (c.period - c.ramp)) / c.ramp;
    return 0;
  };
  for (const [field, cycle] of [["rift_split_plume", CHIMNEY_PULSE], ["basin_sediment_lane", SEDIMENT_SURGE],
    ["divide_downwelling", CREST_SLACK]] as const) {
    const f = HAZARD_FIELDS[field] as { cycleId?: string; cycle: { period: number; start: number; duration: number; ramp: number } };
    assert.equal(f.cycleId, cycle.id);
    for (let tick = -60 * 7; tick < f.cycle.period * 60 * 2; tick++)
      assert.equal(frameworkLevel(cycle, secondsAt(tick)), s4(f.cycle, tick), `${field} tick ${tick}`);
  }
  // CR-1's creature windows follow the three field cycles; they are watched at the animal.
  assert.deepEqual(WORLD_CYCLES.map(c => c.id), [CHIMNEY_PULSE.id, SEDIMENT_SURGE.id, CREST_SLACK.id, ...CREATURE_CYCLES.map(c => c.id)]);
});

test("one movement owner: a resting diver in the plume lane drifts exactly once, by the CY response", () => {
  const f = HAZARD_FIELDS.basin_sediment_lane, c = sitePosition(f.shape.center);
  const p = { x: c.x + (f.shape.min.x + f.shape.max.x) / 2, y: c.y + (f.shape.min.y + f.shape.max.y) / 2, z: c.z + (f.shape.min.z + f.shape.max.z) / 2 };
  const s = diverAt(p);
  s.tick = Math.round(f.cycle.start * 60) + 60; // surging
  const flow = flowAt(p, s.tick + 1).flow;
  assert.ok(Math.hypot(flow.x, flow.y, flow.z) > 0.2, "fixture: the lane is surging");
  const expected = respondToFlow(flow, { id: "diver", authority: protectionFor(null, []).current, cruise: 3.4, drain: 0 }, { x: 0, y: 0, z: 0 }, "none").drift;
  const next = stepGame(s, idle(), world).state.player.pose.position;
  for (const a of ["x", "y", "z"] as const)
    assert.ok(Math.abs(next[a] - p[a] - expected[a] * DT) < 1e-9, `${a}: moved ${next[a] - p[a]}, expected ${expected[a] * DT} (not doubled)`);
  assert.deepEqual(stepGame(s, idle(), world).state.player.velocity, { x: 0, y: 0, z: 0 }, "drift never accumulates in velocity");
});

const race = REEF_SHELF_RACE;
const raceShape = race.shape.kind === "tube" ? race.shape : (() => { throw new Error("tube"); })();
const along = (t: number, lift = 0): Vec3 => ({ x: raceShape.a.x + (raceShape.b.x - raceShape.a.x) * t,
  y: raceShape.a.y + (raceShape.b.y - raceShape.a.y) * t + lift, z: raceShape.a.z + (raceShape.b.z - raceShape.a.z) * t });

test("the shelf race is placed by the CY content rules: strong, cued, in water, gating no route", () => {
  assert.ok(race.strength >= 2 && race.cue.length > 20);
  // Its water part is real water above the slope, with the lower half in rock.
  for (const t of [0.15, 0.5, 0.85]) {
    const p = along(t), floor = worldFloor(p.x, p.z);
    assert.ok(p.y + raceShape.radius > floor + 4 && p.y - raceShape.radius < floor - 2, `t=${t}: floor ${floor.toFixed(1)}`);
  }
  for (const v of WORLD_CURRENTS) {
    // Land walks carry no height (y null); they never meet underwater flow.
    for (const r of ROUTES) for (const p of r.path) if (Number.isFinite(p.y)) assert.equal(volumeWeight(v, p), 0, `${v.id} touches ${r.id}`);
    for (const plan of Object.values(RESCUE_PLANS) as { id?: string; path?: readonly Vec3[] }[])
      for (const p of plan.path ?? []) assert.equal(volumeWeight(v, p), 0, `${v.id} touches rescue ${plan.id}`);
    assert.equal(volumeWeight(v, { x: footprint.minX, y: -24, z: footprint.minZ }), 0, "clear of the Fanvault");
  }
});

test("a diver swimming across the shelf race is swept downslope but gets across", () => {
  const mid = along(0.45, 1.5);
  let s = diverAt({ ...mid, x: mid.x + 10 });
  s.player.pose.yaw = -Math.PI / 2; // face -X, straight across the race
  let crossed = false, swept = 0;
  for (let i = 0; i < 60 * 12 && !crossed; i++) {
    s = stepGame(s, [{ type: "look", yawDelta: 0, pitchDelta: 0 }, { type: "move", forward: 1, right: 0, vertical: 0.15, sprint: false }], world).state;
    crossed = s.player.pose.position.x < mid.x - 9;
    swept = Math.max(swept, mid.z - s.player.pose.position.z);
  }
  assert.ok(crossed, `crossed: ${JSON.stringify(s.player.pose.position)}`);
  assert.ok(swept > 2, `swept ${swept.toFixed(1)} m downslope`);
});

// --- Hulls: impact from the closing drive, damping into the face, drain by drive ---

function creelIn(p: Vec3, yaw: number): GameState {
  const s = creelFirst();
  parkCreel(s, p, yaw);
  pilotCreel(s);
  return s;
}
const thrust = (forward: number, sprint = false, vertical = 0): GameCommand[] =>
  [{ type: "look", yawDelta: 0, pitchDelta: 0 }, { type: "move", forward, right: 0, vertical, sprint }];

test("ADVERSE: a Creel driven along rock in the shelf race, the current pressing it onto the face, takes no damage", () => {
  // A rock wall across the race, its north face square to the flow, so the
  // current pins the hull onto it while the pilot drives along it.
  const shape = HULL_COLLIDERS.creel, mid = along(0.5), floor = worldFloor(mid.x, mid.z);
  const wall: Solid = { id: "test.race.wall", min: { x: mid.x - 30, y: floor - 6, z: mid.z - 2 }, max: { x: mid.x + 30, y: floor + 12, z: mid.z } };
  const rocky = createCaveWorldQueries({ solids: [...SOLIDS, wall], floor: surfaceHeight, caves: [caveOwner(fanvault)] });
  const flat = { x: mid.x - 8, y: 0, z: mid.z + shape.radius + 0.4 };
  const start = { ...flat, y: hullFloor(rocky, flat, shape) + 0.3 };
  assert.ok(hullClearance(rocky, start, shape), "fixture: the Creel fits against the wall");
  // Yaw π/2 faces +X: along the wall, the current from the north side.
  for (const sprint of [false, true]) {
    let s = creelIn(start, Math.PI / 2);
    const events: GameEvent[] = [];
    // The pilot holds a little rise so the hull stays off the sloping seabed
    // (driving level into rising ground is a terrain impact, as before).
    for (let i = 0; i < 60 * 4; i++) { const out = stepGame(s, thrust(1, sprint, 0.25), rocky); s = out.state; events.push(...out.events); }
    const v = s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId)!;
    assert.equal(v.health, 100, `${sprint ? "boost" : "cruise"}: no wear from sliding in the current`);
    assert.equal(events.filter(e => e.type === "impact").length, 0);
    assert.ok(v.pose.position.x - start.x > 6, `${sprint ? "boost" : "cruise"}: the slide survives (${(v.pose.position.x - start.x).toFixed(1)} m)`);
    assert.ok(rocky.clearance(v.pose.position, shape), "never inside the wall");
  }
  // Control: a head-on hit at boost still damages.
  const approach = { x: mid.x, y: 0, z: mid.z + 14 };
  let s = creelIn({ ...approach, y: hullFloor(rocky, approach, shape) + 1 }, 0); // yaw 0 faces -Z, at the wall
  let hits = 0;
  for (let i = 0; i < 60 * 4; i++) { const out = stepGame(s, thrust(1, true), rocky); s = out.state; hits += out.events.filter(e => e.type === "impact").length; }
  assert.ok(hits >= 1 && s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId)!.health < 100, "a drive into rock is still an impact");
});

test("held thrust into rock after contact: bounded damage, the slide along the face survives, closing speed is damped", () => {
  // C4A-R1 P3: without dampIntoFace the closing drive re-hits every step and
  // wrecks the hull. Still water (no current), a wall square to -Z.
  const shape = HULL_COLLIDERS.creel, mid = { x: 60, z: -60 }, floor = worldFloor(mid.x, mid.z);
  const wall: Solid = { id: "test.still.wall", min: { x: mid.x - 30, y: floor - 6, z: mid.z - 2 }, max: { x: mid.x + 30, y: floor + 30, z: mid.z } };
  const rocky = createCaveWorldQueries({ solids: [...SOLIDS, wall], floor: surfaceHeight, caves: [caveOwner(fanvault)] });
  const approach = { x: mid.x, y: 0, z: mid.z + 10 };
  const run = (yaw: number) => {
    let s = creelIn({ ...approach, y: Math.max(hullFloor(rocky, approach, shape) + 3, floor + 6) }, yaw);
    let hits = 0, contact = -1, x0 = 0, closing = 0;
    for (let i = 0; i < 60 * 8; i++) {
      const out = stepGame(s, thrust(1, true), rocky); s = out.state;
      const v = s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId)!;
      const n = out.events.filter(e => e.type === "impact").length; hits += n;
      if (n && contact < 0) { contact = i; x0 = v.pose.position.x; }
      if (contact >= 0 && i > contact + 30) closing = Math.max(closing, -v.velocity.z);
      assert.ok(rocky.clearance(v.pose.position, shape), "never inside the wall");
    }
    const v = s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId)!;
    return { health: v.health, hits, contact, slide: v.pose.position.x - x0, closing };
  };
  for (const yaw of [0, 0.5]) {
    const r = run(yaw);
    assert.ok(r.contact >= 0 && r.health < 100, `yaw ${yaw}: the boost into rock is an impact`);
    assert.ok(r.hits <= 3 && r.health > 99, `yaw ${yaw}: held thrust costs one bounded hit (${r.hits} hits, health ${r.health.toFixed(2)})`);
    assert.ok(r.closing < 0.5, `yaw ${yaw}: closing speed damped to ${r.closing.toFixed(2)} m/s`);
  }
  // At an angle, the tangential part of the drive keeps sliding along the face.
  assert.ok(run(0.5).slide > 12, "the slide along the face survives held thrust");
});

test("drain follows the drive: a stopped powered hull keeps station in the race and pays for it; a flat one drifts", () => {
  const p = along(0.4, 2);
  let s = creelIn(p, 0);
  const before = s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId)!.charge;
  s = play(s, 60 * 3, idle(), world);
  const held = s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId)!;
  const moved = Math.hypot(held.pose.position.x - p.x, held.pose.position.z - p.z);
  assert.ok(moved < 0.5, `station keeping holds the Creel (${moved.toFixed(2)} m)`);
  const paid = before - held.charge, idleOnly = 0.015 * 3;
  assert.ok(paid > idleOnly * 1.5, `holding costs more than idling (${paid.toFixed(3)}% vs ${idleOnly}%)`);
  // Flat: nothing holds it, and drifting is not billed as cruising.
  let flat = creelIn(p, 0);
  flat.fleet.vehicles.find(x => x.id === flat.player.controlledVehicleId)!.charge = 0;
  flat = play(flat, 60 * 3, idle(), world);
  const v = flat.fleet.vehicles.find(x => x.id === flat.player.controlledVehicleId)!;
  assert.ok(Math.hypot(v.pose.position.x - p.x, v.pose.position.z - p.z) > 1, "an unpowered hull drifts");
  assert.equal(v.charge, 0);
});

test("entering a current shows its cue once", () => {
  const inside = along(0.45, 1.5);
  let s = diverAt({ ...inside, x: inside.x + 9 });
  s.player.pose.yaw = -Math.PI / 2;
  const cues: string[] = [];
  for (let i = 0; i < 60 * 4; i++) {
    const out = stepGame(s, [{ type: "look", yawDelta: 0, pitchDelta: 0 }, { type: "move", forward: 1, right: 0, vertical: 0, sprint: false }], world);
    s = out.state;
    for (const e of out.events) if (e.type === "notice" && e.message.startsWith(race.label)) cues.push(e.message);
  }
  assert.equal(cues.length, 1, cues.join(" | "));
});

test("smoke: a powerless diver at two points in the shelf race reaches still water within 25 s, unharmed", () => {
  // Sixteen starts along and across the race: tests/c4-world.heavy.test.ts (TT-1).
  const still = (p: Vec3, tick: number): boolean => flowAt(p, tick).speed < 0.1;
  let checked = 0;
  for (const t of [0.3, 0.8]) {
    const p = along(t, 1.5);
    if (!world.clearance(p, DIVER) || volumeWeight(race, p) < 0.3) continue;
    checked++;
    let s = diverAt(p);
    const health = s.player.vitals.health;
    let seconds = 0;
    while (!still(s.player.pose.position, s.tick) && seconds < 25) { s = stepGame(s, idle(), world).state; seconds += DT; }
    assert.ok(seconds < 25, `stuck in the race from ${JSON.stringify(p)} at ${JSON.stringify(s.player.pose.position)}`);
    assert.equal(s.player.vitals.health, health, "a current never harms a diver");
  }
  assert.ok(checked >= 1, "at least one start lies in the race");
});
