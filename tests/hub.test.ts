import test from "node:test";
import assert from "node:assert/strict";
import { HULL_COLLIDERS, PLACES, RECIPES, type MaterialId, type RecipeId } from "../src/content/registry.js";
import { sweepHull } from "../src/content/regions/access.js";
import { caves, CAVE_SOURCES } from "../src/content/regions/caves.js";
import { drape } from "../src/content/regions/drape.js";
import { CRAFT_PROFILES, RAW_ROUTES, ROUTES } from "../src/content/regions/passages.js";
import { RESCUE_PLANS } from "../src/content/regions/rescue.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURES } from "../src/content/regions/structures.js";
import { HUB_LEDGES, HUB_PINNACLES, hubRelief, LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening, craft, discover } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { stepGameInPlace } from "../src/sim/step.js";
import type { GameCommand, GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { gameWorld, hullClearance } from "../src/sim/world.js";
import { BEACON, BEACON_PERIOD, beaconGlow, CROWN_RAY_LAP, CROWN_RAY_SPAN, crownRayPoses, MAST_LAMP, MAST_LAMP_PERIOD, mastLampGlow } from "../src/render/hubView.js";
import { ISLAND_LOOKOUT } from "../src/content/hub/crownStation.js";

// W2: the central pinnacle hub in the world. The spur's terrain, the routes
// it touches, the crown as a landmark, and the two adverse cases: a craft
// at speed along the spur, and a diver without power on the summit.

const world = gameWorld();
const crown = HUB_PINNACLES.find(p => p.id === "hub.crown")!;
const summit = (id: string): Vec3 => { const p = HUB_PINNACLES.find(q => q.id === id)!; return { x: p.x, y: worldFloor(p.x, p.z), z: p.z }; };
const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

test("the spur: reef heads, two stepping stones and a crown that rises about 240 m from the Basin floor", () => {
  const want: Record<string, number> = { "hub.step_one": -38.5, "hub.step_two": -43.5, "hub.crown": -46.5 };
  for (const [id, y] of Object.entries(want)) assert.ok(Math.abs(summit(id).y - y) < 1.5, `${id} summit at ${summit(id).y.toFixed(1)}`);
  // The owner's coordinates, within a few metres.
  assert.ok(dist2(summit("hub.crown"), { x: 330, z: -560 }) < 1 && dist2(summit("hub.step_one"), { x: 80, z: -400 }) < 1 &&
    dist2(summit("hub.step_two"), { x: 190, z: -470 }) < 8);
  // The crown's foot: the Basin floor round it, 70-80 m out, lies 220+ m below the summit.
  let foot = 0;
  for (let a = 0; a < 360; a += 15) {
    const r = 80, x = crown.x + r * Math.cos(a * Math.PI / 180), z = crown.z + r * Math.sin(a * Math.PI / 180);
    foot = Math.min(foot, worldFloor(x, z));
  }
  assert.ok(summit("hub.crown").y - foot >= 220, `the crown rises ${(summit("hub.crown").y - foot).toFixed(0)} m`);
  // A pinnacle, not a mesa: 120 m down it is under 50 m in radius; the cliff to 250 m stays within 62 m.
  for (let a = 0; a < 360; a += 10) {
    const at = (r: number): number => worldFloor(crown.x + r * Math.cos(a * Math.PI / 180), crown.z + r * Math.sin(a * Math.PI / 180));
    assert.ok(at(50) < -120 || HUB_LEDGES.some(l => dist2({ x: crown.x + 50 * Math.cos(a * Math.PI / 180), z: crown.z + 50 * Math.sin(a * Math.PI / 180) }, l) < l.radius),
      `crown at 50 m, bearing ${a}: ${at(50).toFixed(0)}`);
    assert.ok(at(66) < -250, `crown at 66 m, bearing ${a}: ${at(66).toFixed(0)}`);
  }
  // The rim balcony is a ledge about 120 m down on the north lip, over the anchorage.
  const balcony = SITES.find(s => s.id === "hub.rim_balcony")!;
  const ledge = worldFloor(balcony.at.x, balcony.at.z);
  assert.ok(Math.abs(ledge + 120) < 5 && dist2(balcony.at, { x: 350, z: -520 }) < 10, `balcony at ${ledge.toFixed(1)}`);
  assert.ok(worldFloor(balcony.at.x, balcony.at.z + 30) < -200, "the balcony overlooks the cliff, not more ledge");
});

test("the legacy preserve is untouched: the spur never reaches into it", () => {
  // regions-world holds the preserve bit-exact; this says why it stays so.
  const P = LEGACY_PRESERVE;
  for (let x = P.minX; x <= P.maxX; x += 2) for (let z = P.minZ; z <= P.maxZ; z += 2)
    assert.equal(hubRelief(x, z, null), -Infinity, `hub relief reaches ${x}, ${z}`);
  // And no pinnacle reaches a CA-2 Basin cave footprint known at authoring time.
  const culvert = { minX: 398, maxX: 422, minZ: -507, maxZ: -483 };
  for (let x = culvert.minX; x <= culvert.maxX; x += 1) for (let z = culvert.minZ; z <= culvert.maxZ; z += 1)
    assert.equal(hubRelief(x, z, null), -Infinity, `crown reaches CA-2's culvert at ${x}, ${z}`);
});

test("carrier lanes pass between the pinnacles at depth: no route or tether is lifted over the spur", () => {
  const raw = (path: readonly Vec3[], radius: number): Vec3[] => drape(path, radius, 0, () => -1e9);
  const reach = (p: Vec3): boolean => hubRelief(p.x, p.z, null) > -Infinity;
  const check = (id: string, original: readonly Vec3[], draped: readonly Vec3[], radius: number): void => {
    const base = raw(original, radius);
    assert.equal(base.length, draped.length, id);
    for (let i = 0; i < base.length; i++)
      if (reach(base[i]!)) assert.ok(draped[i]!.y - base[i]!.y < 0.5, `${id} is lifted ${(draped[i]!.y - base[i]!.y).toFixed(1)} m over the spur at ${JSON.stringify(base[i])}`);
  };
  // Hub routes run over the summits by design; every other line keeps its authored depth there.
  for (const r of ROUTES) if (!r.legacy && r.role !== "walk" && r.role !== "surface" && !r.id.startsWith("route.hub.")) {
    const c = CRAFT_PROFILES[r.profile], radius = Math.max(c.radius, r.kind === "passage" || r.kind === "ledge" ? c.radius : r.minHalfWidth);
    const authored = RAW_PATHS.get(r.id)!;
    check(r.id, authored, r.path, radius);
  }
  // The two carrier lines leave the anchorage through the step-two/crown gap.
  for (const id of ["route.basin.rift", "route.basin.divide"]) {
    const path = ROUTES.find(r => r.id === id)!.path;
    const gap = path.find(p => dist2(p, { x: 250, z: -505 }) < 10);
    assert.ok(gap && gap.y < -240, `${id} crosses the gap at depth`);
    for (const p of path) for (const c of CAVE_SOURCES) {
      const f = c.footprint, d = Math.hypot(Math.max(f.minX - p.x, 0, p.x - f.maxX), Math.max(f.minZ - p.z, 0, p.z - f.maxZ));
      assert.ok(d > HULL_COLLIDERS.hearthline.radius + 12, `${id} passes ${d.toFixed(0)} m from ${c.id} (the carrier is refused at caves)`);
    }
  }
});

const RAW_PATHS = new Map(RAW_ROUTES.map(r => [r.id, r.path] as const));

test("nothing passes through the pinnacles' cave rock: every route, tether and parked hull is clear of it", () => {
  const rock = caves(worldFloor).filter(d => d.id !== "fanvault").flatMap(d => d.rock.map(s => ({ id: s.id, bounds: { min: s.min, max: s.max } })));
  const lines: [string, readonly Vec3[], keyof typeof CRAFT_PROFILES][] = [
    ...ROUTES.filter(r => r.role !== "walk").map(r => [r.id, r.path, r.profile] as [string, readonly Vec3[], keyof typeof CRAFT_PROFILES]),
    ...RESCUE_PLANS.flatMap(p => p.tethers.map((t, i) => [`${p.id}#${i}`, t, "medium"] as [string, readonly Vec3[], keyof typeof CRAFT_PROFILES])),
  ];
  for (const [id, path, profile] of lines) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const lo = { x: Math.min(a.x, b.x) - 20, z: Math.min(a.z, b.z) - 20 }, hi = { x: Math.max(a.x, b.x) + 20, z: Math.max(a.z, b.z) + 20 };
    for (const s of rock) {
      if (s.bounds.max.x < lo.x || s.bounds.min.x > hi.x || s.bounds.max.z < lo.z || s.bounds.min.z > hi.z) continue;
      assert.equal(sweepHull(a, b, profile, s.bounds), null, `${id} (${profile}) crosses ${s.id}`);
    }
  }
  // The hub routes fly clear in the game world, caves composed.
  for (const r of ROUTES.filter(r => r.id.startsWith("route.hub."))) {
    const shape = HULL_COLLIDERS[r.profile === "small" ? "dart" : "creel"];
    for (const p of r.path) assert.ok(hullClearance(world, p, shape), `${r.id}: no room at ${JSON.stringify(p)}`);
  }
});

test("the hub's places: sites on the spur, the beacon house and station on the summit, structures on rock", () => {
  for (const id of ["hub.crown", "hub.step_one", "hub.step_two", "hub.apron_heads", "hub.rim_balcony", "hub.beacon_house", "hub.crown_station"])
    assert.ok(SITES.some(s => s.id === id), id);
  for (const id of ["hub.beacon_house.house", "hub.crown_station.hull", "hub.crown_station.mast"]) {
    const s = STRUCTURES.find(x => x.id === id)!;
    assert.ok(s, id);
    const b = s.solids[0]!;
    assert.ok(b.min.y <= worldFloor(s.x, s.z) + 0.01, `${id} floats`);
    assert.ok(b.max.y > -60, `${id} stands on the summit`);
  }
  // The beacon house tops everything at the hub, under 45 m of water.
  const beacon = STRUCTURES.find(x => x.id === "hub.beacon_house.house")!.solids[0]!;
  assert.ok(beacon.max.y > -42 && beacon.max.y < -30, `beacon top ${beacon.max.y.toFixed(1)}`);
});

/** Open water between two points: the floor stays below the sight line. */
function sightClear(a: Vec3, b: Vec3): string | null {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
  for (let i = 1; i < n - 2; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    if (worldFloor(x, z) > y) return `blocked at ${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}`;
  }
  return null;
}
test("the crown is the hub's landmark: its beacon in plain sight from the Canopy edge and the Rift head, its cliff over the anchorage", () => {
  const beacon = STRUCTURES.find(x => x.id === "hub.beacon_house.house")!.solids[0]!;
  const light = { x: (beacon.min.x + beacon.max.x) / 2, y: beacon.max.y - 1, z: (beacon.min.z + beacon.max.z) / 2 };
  // The lamp itself from the Canopy edge and the spur; from the Rift head,
  // 180 m below the summit, the crown's terraces hide the lamp and its light
  // shaft rising over the summit is what shows.
  const shaft = { ...light, y: light.y + 20 };
  const views: [string, Vec3, Vec3][] = [
    ["Canopy south edge", { x: 400, y: -150, z: -350 }, light],
    ["first step", { x: 80, y: -34, z: -400 }, light],
    ["Rift head", { x: 172, y: -220, z: -606 }, shaft],
  ];
  for (const [name, at, target] of views) {
    const d = Math.hypot(target.x - at.x, target.y - at.y, target.z - at.z);
    assert.ok(d < 320, `${name} is ${d.toFixed(0)} m from the beacon`);
    assert.equal(sightClear(at, target), null, `${name} -> beacon`);
  }
  // From the anchorage the crown fills the view: the balcony lip 120 m overhead, in sight.
  const anchorage = { x: 360, y: -232, z: -430 }, lip = { x: 350, y: -118, z: -512 };
  assert.equal(sightClear(anchorage, lip), null, "anchorage -> balcony");
  const rise = Math.atan2(-46.5 - anchorage.y, dist2(anchorage, crown)) * 180 / Math.PI;
  assert.ok(rise > 45, `the summit stands ${rise.toFixed(0)}° above the anchorage's horizon`);
});

// --- Adverse cases ----------------------------------------------------------------

const idleMove = (forward: number, sprint: boolean, vertical = 0): GameCommand => ({ type: "move", forward, right: 0, vertical, sprint });
const wrap = (a: number): number => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

/** A paid Dart (rule fixture; the earned chain is the playthrough's job). */
function dartAt(p: Vec3, yaw: number): GameState {
  const s = createGame(); completeOpening(s);
  for (const id of ["C02", "C03", "C04"] as const) discover(s, id);
  for (const id of ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit", "restore_workshop", "dart_base"] as RecipeId[]) {
    const r = RECIPES[id];
    s.player.pose.position = { ...PLACES[r.site === "island_workshop" ? "island_workshop" : "home_pod"].position };
    if (!r.maintenance) for (const [kind, q] of Object.entries(r.cost)) addItem(s, kind as MaterialId, q, "diver");
    assert.equal(craft(s, id, world), null, id);
  }
  const v = s.fleet.vehicles.find(x => x.hull === "dart")!;
  v.pose.position = { ...p }; v.pose.yaw = yaw; v.velocity = { x: 0, y: 0, z: 0 }; v.charge = 100;
  s.player.controlledVehicleId = v.id; s.player.interiorId = null; s.player.interiorPose = null;
  s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose); s.player.velocity = { x: 0, y: 0, z: 0 };
  return s;
}

test("ADVERSE: a Dart driven at boost along the whole spur, both ways, never clips a pinnacle", () => {
  const spur = ROUTES.find(r => r.id === "route.hub.spur")!.path;
  for (const path of [spur, [...spur].reverse()]) {
    const first = path[0]!, next = path[1]!;
    let s = dartAt(first, Math.atan2(next.x - first.x, -(next.z - first.z)));
    const events: GameEvent[] = [];
    let steps = 0;
    for (let i = 1; i < path.length; i++) {
      const target = path[i]!;
      for (let best = Infinity, since = 0; ;) {
        const v = s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId)!, p = v.pose.position;
        const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z, flat = Math.hypot(dx, dz);
        if (Math.hypot(flat, dy) < 6) break;
        if (flat < best - 0.5) { best = flat; since = 0; } else assert.ok(++since < 60 * 20, `stalled at ${JSON.stringify(p)} toward ${JSON.stringify(target)}`);
        const yaw = wrap(Math.atan2(dx, -dz) - v.pose.yaw);
        events.push(...stepGameInPlace(s, [{ type: "look", yawDelta: Math.max(-0.8, Math.min(0.8, yaw)), pitchDelta: -s.player.pose.pitch },
          idleMove(Math.abs(yaw) < 0.5 ? 1 : 0.3, true, Math.max(-1, Math.min(1, dy / 4)))], world)); steps++;
      }
    }
    const v = s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId)!;
    assert.equal(events.filter(e => e.type === "impact").length, 0, `impacts: ${JSON.stringify(events.filter(e => e.type === "impact").slice(0, 2))}`);
    assert.equal(v.health, 100, "the hull is untouched");
    assert.ok(dist2(v.pose.position, path.at(-1)!) < 8, "arrived");
    assert.ok(steps / 60 < 240, `${(steps / 60).toFixed(0)} s along ${path.length} waypoints`);
  }
});

test("ADVERSE: a diver without power on the crown's summit always reaches air: open water straight up, on a quarter tank", () => {
  // Every summit pose on a 4 m grid within 16 m of the crown, the bowl's lip
  // and the beacon house's door: the column above is open to the surface.
  const starts: Vec3[] = [];
  for (let dx = -16; dx <= 16; dx += 4) for (let dz = -16; dz <= 16; dz += 4) {
    const x = crown.x + dx, z = crown.z + dz, top = world.supportHeight(x, z, 0);
    if (Math.hypot(dx, dz) <= 16) starts.push({ x, y: top + 0.6, z });
  }
  const door = SITES.find(s => s.id === "hub.beacon_house")!;
  starts.push({ x: door.at.x, y: worldFloor(door.at.x, door.at.z) + 0.6, z: door.at.z });
  for (const p of starts) {
    if (!world.clearance(p, CRAFT_PROFILES.diver)) continue; // inside a structure's footprint
    const up = world.moveCapsule(p, { x: 0, y: -0.6 - p.y, z: 0 }, CRAFT_PROFILES.diver);
    assert.ok(!up.hitSolid && up.position.y > -0.7, `no clear ascent from ${JSON.stringify(p)}: stopped at ${up.position.y.toFixed(1)}`);
  }
  // The real swim: out of a dead craft on the summit with 25% air, W and Space.
  const s0 = createGame(); completeOpening(s0);
  const start = { x: crown.x - 12, y: world.supportHeight(crown.x - 12, crown.z + 2, 0) + 0.6, z: crown.z + 2 };
  s0.player.pose.position = { ...start }; s0.player.mode = "swimming"; s0.player.velocity = { x: 0, y: 0, z: 0 };
  s0.player.vitals.oxygen = 25; s0.player.lamp = false;
  const s = structuredClone(s0);
  let steps = 0;
  while (s.player.pose.position.y < -1.2 && steps < 60 * 120) {
    stepGameInPlace(s, [{ type: "look", yawDelta: 0, pitchDelta: 0.9 - s.player.pose.pitch }, idleMove(0, false, 1)], world);
    steps++;
  }
  assert.ok(s.player.pose.position.y >= -1.2, `surfaced: ${JSON.stringify(s.player.pose.position)}`);
  assert.ok(s.player.vitals.oxygen > 0 && s.metrics.failures === 0, `air left ${s.player.vitals.oxygen.toFixed(1)}%, never incapacitated`);
  assert.ok(steps / 60 < 45, `${(steps / 60).toFixed(1)} s from the summit to air`);
});

test("the crown rays ring the crown in open water at every moment, and the beacon outlasts lit rock in the murk", () => {
  for (let t = 0; t < CROWN_RAY_LAP; t += 1.7) for (const r of crownRayPoses(t)) {
    const p = r.position, d = dist2(p, crown);
    assert.ok(d > 70 && d < 125, `a ray strays to ${d.toFixed(0)} m from the crown`);
    // Wingtips included: the ray's span clears the floor and the surface.
    for (const [ox, oz] of [[0, 0], [CROWN_RAY_SPAN / 2, 0], [-CROWN_RAY_SPAN / 2, 0], [0, CROWN_RAY_SPAN / 2], [0, -CROWN_RAY_SPAN / 2]] as const)
      assert.ok(p.y - worldFloor(p.x + ox, p.z + oz) > 12, `a ray at ${JSON.stringify(p)} skims the floor`);
    assert.ok(p.y < -40, "rays stay well below the surface");
  }
  // Slow: a full lap takes minutes, and neighbours keep their spacing.
  assert.ok(CROWN_RAY_LAP >= 120);
  const a = crownRayPoses(30);
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++)
    assert.ok(Math.hypot(a[i]!.position.x - a[j]!.position.x, a[i]!.position.y - a[j]!.position.y, a[i]!.position.z - a[j]!.position.z) > CROWN_RAY_SPAN * 2, "rays crowd");
  // The beacon is in the beacon house's lamp room.
  const house = STRUCTURES.find(x => x.id === "hub.beacon_house.house")!.solids[0]!;
  assert.ok(BEACON.y < house.max.y && BEACON.y > house.max.y - 2.4 && Math.abs(BEACON.x - (house.min.x + house.max.x) / 2) < 1e-9);
  // Cel fog leaves lit rock at about e^(-0.0105 d); the beacon keeps several times that.
  for (const d of [300, 450]) {
    let peak = 0;
    for (let t = 0; t < BEACON_PERIOD; t += 0.05) peak = Math.max(peak, beaconGlow(d, t));
    assert.ok(peak > 4 * Math.exp(-0.0105 * d) && peak > 0.1, `beacon at ${d} m: ${peak.toFixed(3)}`);
  }
  assert.ok(beaconGlow(8, 0) < beaconGlow(60, 0), "held down beside it");
  assert.equal(beaconGlow(1e4, 0), 0);
});

test("HUB-2: the crown's surface mast stands from the summit to above the water, clear of every line, its slow lamp seen from the island lookout", () => {
  const mast = STRUCTURES.find(x => x.id === "hub.crown_mast.mast")!;
  assert.ok(mast, "the mast is a structure (collision and art from one record)");
  const box = mast.solids[0]!;
  assert.ok(box.min.y <= worldFloor(mast.x, mast.z) + 0.01, "it stands on the summit");
  assert.ok(box.max.y >= 5, `its top stands ${box.max.y.toFixed(1)} m above the waterline`);
  // CW-1's far layer registers every structure at least 20 m tall (FAR_LANDMARK_HEIGHT).
  assert.ok(box.max.y - box.min.y >= 20, "tall enough for the always-resident far layer");
  // Clear of the crown mouth, the beacon house, the station and the summit's route ends.
  for (const id of ["hub.beacon_house.house", "hub.crown_station.hull", "hub.crown_station.mast"]) {
    const o = STRUCTURES.find(x => x.id === id)!.solids[0]!;
    assert.ok(o.max.x < box.min.x - 4 || o.min.x > box.max.x + 4 || o.max.z < box.min.z - 4 || o.min.z > box.max.z + 4, `clear of ${id}`);
  }
  assert.ok(Math.hypot(mast.x - 331, mast.z + 559) > 7 + 1.5 + 2, "clear of the crown mouth");
  // No route, rescue tether or surface approach sweeps through it (carrier lanes included).
  const lines: [string, readonly Vec3[], keyof typeof CRAFT_PROFILES][] = [
    ...ROUTES.filter(r => r.role !== "walk").map(r => [r.id, r.path, r.profile] as [string, readonly Vec3[], keyof typeof CRAFT_PROFILES]),
    ...RESCUE_PLANS.flatMap(p => [...p.tethers.map((t, i) => [`${p.id}#${i}`, t, "medium"] as [string, readonly Vec3[], keyof typeof CRAFT_PROFILES]),
      [`${p.id} approach`, p.approach, "diver"] as [string, readonly Vec3[], keyof typeof CRAFT_PROFILES]]),
  ];
  for (const [id, path, profile] of lines) for (let i = 1; i < path.length; i++)
    assert.equal(sweepHull(path[i - 1]!, path[i]!, profile, box), null, `${id} crosses the mast`);
  // The lamp above water: from the lookout (765 m, bearing 134°) it stays bright,
  // and no land rises into the sight line today.
  const d = Math.hypot(MAST_LAMP.x - ISLAND_LOOKOUT.x, MAST_LAMP.z - ISLAND_LOOKOUT.z);
  assert.ok(d > 700 && d < 820, `${d.toFixed(0)} m`);
  assert.ok(Math.abs(((Math.atan2(MAST_LAMP.x - ISLAND_LOOKOUT.x, MAST_LAMP.z - ISLAND_LOOKOUT.z) * 180 / Math.PI + 360) % 360) - 134) < 3);
  let peak = 0, low = Infinity;
  for (let t = 0; t < MAST_LAMP_PERIOD; t += 0.05) { const g = mastLampGlow(d, t, false); peak = Math.max(peak, g); low = Math.min(low, g); }
  assert.ok(peak > 0.5 && low > 0.12, `lamp at the lookout: ${low.toFixed(2)}..${peak.toFixed(2)}`);
  assert.ok(peak > 2.5 * low, "a slow pulse, not a steady light");
  assert.ok(mastLampGlow(d, 0, true) < mastLampGlow(d, 0, false) / 10, "it carries through air, not water");
  for (let t = 0.03; t < 0.97; t += 0.002) {
    const x = ISLAND_LOOKOUT.x + (MAST_LAMP.x - ISLAND_LOOKOUT.x) * t, z = ISLAND_LOOKOUT.z + (MAST_LAMP.z - ISLAND_LOOKOUT.z) * t;
    assert.ok(worldFloor(x, z) < MAST_LAMP.y * t, `land in the sight line at ${x.toFixed(0)}, ${z.toFixed(0)}`);
  }
});
