/** ENV-1 stage 1: the air proof, the round trip and configuration space, on
 * fixtures that must fail, each beside a passing control. Exteriors are built
 * here (a floor and box solids); the validator, the air line and the exit and
 * boarding rules are the sim's own. */
import test from "node:test";
import assert from "node:assert/strict";
import type { AirRoom } from "../src/content/airRooms.js";
import { boxToWorld } from "../src/content/interiors/geometry.js";
import { slab, v, wall } from "../src/content/interiors/build.js";
import { OUTSIDE, type FirstAccess, type InteriorDef, type InteriorStaging, type ShellPiece } from "../src/content/interiors/types.js";
import { RETURN_BUDGET_M, SWIM, validateInterior, type Problem } from "../src/sim/interiors/validate.js";
import { interiorWorld, type InteriorExterior } from "../src/sim/interiors/world.js";
import type { Solid } from "../src/sim/world.js";
import { codes, fixtureState, flatExterior } from "./interiors-support.js";

const at = (problems: readonly Problem[], code: string): Problem[] => problems.filter((p) => p.code === code);
const solid = (id: string, min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }): Solid => ({ id, min, max });

// --- Long tunnels: the one craft, and the unrestored station ---------------------------

/** A straight tunnel of length L along +X at 205 m, with doors at either end
 * (or only the west one) and an optional raised dry platform at the far end. */
function tunnel(L: number, o: { eastDoor?: boolean; platform?: boolean; staging?: InteriorStaging[]; access?: FirstAccess[] } = {}): InteriorDef {
  const H = o.platform ? 3.2 : 1.6, east = o.eastDoor ?? true;
  const shell = [
    ...slab("floor", "floor", -0.2, L + 0.2, -1, 1, -0.3, 0), ...slab("roof", "roof", -0.2, L + 0.2, -1, 1, H, H + 0.2),
    ...wall("s", "x", -0.2, L + 0.2, -1, -0.8, 0, H), ...wall("n", "x", -0.2, L + 0.2, 0.8, 1, 0, H),
    ...wall("w", "z", -0.8, 0.8, -0.2, 0, 0, H, [{ a: -0.8, b: 0.8, y0: 0, y1: 1.6 }]),
    ...wall("e", "z", -0.8, 0.8, L, L + 0.2, 0, H, east ? [{ a: -0.8, b: 0.8, y0: 0, y1: 1.6 }] : []),
    ...(o.platform ? [{ id: "platform", module: "plinth" as const, min: v(L - 6, 0, -0.8), max: v(L, 0.95, 0.8) }] : []),
  ];
  return {
    id: "fixture_tunnel", label: "Tunnel", region: "silt_basin", site: "fixture", anchor: v(0, -205, 0), quarter: 0,
    rooms: [{ id: "tunnel", role: "passage", label: "Tunnel", falloff: 4, bounds: { min: v(0, 0, -0.8), max: v(L, 1.6, 0.8) } },
      ...(o.platform ? [{ id: "far", role: "chamber" as const, label: "Far room", falloff: 4, bounds: { min: v(L - 6, 0.95, -0.8), max: v(L, H, 0.8) } }] : [])],
    portals: [
      { id: "west", kind: "door", label: "West", between: ["tunnel", OUTSIDE], center: v(-0.1, 0.8, 0), normal: v(-1, 0, 0), clear: { width: 1.6, height: 1.6 }, admits: ["diver"] },
      ...(east ? [{ id: "east", kind: "door" as const, label: "East", between: ["tunnel", OUTSIDE] as const, center: v(L + 0.1, 0.8, 0), normal: v(1, 0, 0), clear: { width: 1.6, height: 1.6 }, admits: ["diver" as const] }] : []),
    ],
    staging: o.staging ?? [
      { id: "park_west", role: "craft_parking", label: "West", position: v(-4, 4, 0), radius: 1, profiles: ["small"], yaw: 0, approach: v(-4, 20, 0) },
      ...(east ? [{ id: "park_east", role: "craft_parking" as const, label: "East", position: v(L + 4, 4, 0), radius: 1, profiles: ["small" as const], yaw: Math.PI, approach: v(L + 4, 20, 0) }] : []),
    ],
    shell, dressing: [], stacks: [], lights: [], sounds: [], hosts: [],
    firstAccess: o.access ?? [{ route: "fixture", milestone: "west", craft: "dart", staging: "park_west" }], replaces: [],
  };
}
const deep = flatExterior(-230);
const dart = fixtureState("suit_350", "dart");

test("control: a 60 m tunnel passes with its one craft at one end (covered near it, a timed return beyond)", () => {
  const def = tunnel(60);
  assert.deepEqual(validateInterior({ def, exterior: deep, scenarios: [{ access: def.firstAccess[0]!, state: dart }], airRooms: [] }), []);
});

test("ADVERSE: two parking places, one craft: a 300 m tunnel fails from either end, though the two together would cover it", () => {
  assert.ok(2 * (300 - 27) > RETURN_BUDGET_M && 300 - 54 < RETURN_BUDGET_M, "the fixture straddles the budget as intended");
  const def = tunnel(300, { access: [
    { route: "fixture", milestone: "west", craft: "dart", staging: "park_west" },
    { route: "fixture", milestone: "east", craft: "dart", staging: "park_east" },
  ] });
  const problems = validateInterior({ def, exterior: deep, scenarios: def.firstAccess.map((access) => ({ access, state: dart })), airRooms: [] });
  assert.deepEqual(codes(problems), ["air"], JSON.stringify(problems));
  const air = at(problems, "air");
  assert.ok(air.some((p) => p.message.startsWith("fixture@west") && p.at!.x > 250), "from the west, the east end is beyond air");
  assert.ok(air.some((p) => p.message.startsWith("fixture@east") && p.at!.x < 50), "from the east, the west end is beyond air");
});

/** The far end's dry room, active once the Rift station is restored (a fixture row). */
const farRoom = (def: InteriorDef): AirRoom => ({
  id: "fixture_far", interior: def.id, room: "far", bounds: [boxToWorld(def, v(294, 0.9, -0.8), v(300, 3.2, 0.8))],
  waterline: -205 + 0.9, activeWhen: { facility: "rift_station" }, restBase: "rift_station", wake: { x: 297, y: -205 + 0.95, z: 0 },
});

test("ADVERSE: an unrestored station: its far room is beyond air until restoration drains it", () => {
  const def = tunnel(300, { eastDoor: false, platform: true }), rooms = [farRoom(def)];
  const unrestored = validateInterior({ def, exterior: deep, scenarios: [{ access: def.firstAccess[0]!, state: dart }], airRooms: rooms });
  assert.deepEqual(codes(unrestored), ["air"], `before restoration: ${JSON.stringify(unrestored)}`);
  const restored = structuredClone(dart);
  restored.world.facilities.push({ id: "rift_station", repaired: true } as never);
  const after = validateInterior({ def, exterior: deep, scenarios: [{ access: def.firstAccess[0]!, state: restored }], airRooms: rooms });
  assert.deepEqual(after, [], "after restoration the dry room covers the far end, and the middle is a timed return from either air");
});

// --- A hut on land: traps inside and outside, headroom, and doorways --------------------------

interface HutOptions {
  /** A low ceiling over part of the room (headroom). */
  loft?: boolean;
  /** A 1.6 m pit under a hole in the floor, walled by the shell. */
  shellPit?: boolean;
  /** The floor hole only: the terrain under it is the pit. */
  holeOnly?: boolean;
  /** Doorway width and height (both doors). */
  door?: { width: number; height: number };
}
const HOLE = { x0: 0.5, x1: 2.5, z0: -1, z1: 1 };
/** A small dry building on ground at +5 (flush with its floor), walked from outside its west door. */
function hut(o: HutOptions = {}): InteriorDef {
  const H = 2.6, w = o.door?.width ?? 1.2, h = o.door?.height ?? 2.1, holes = o.shellPit || o.holeOnly ? [HOLE] : [];
  const pit: ShellPiece[] = o.shellPit ? [...slab("pit_floor", "floor", 0.5, 2.5, -1, 1, -1.9, -1.6),
    ...wall("pit_s", "x", 0.3, 2.7, -1.2, -1, -1.9, 0), ...wall("pit_n", "x", 0.3, 2.7, 1, 1.2, -1.9, 0),
    ...wall("pit_w", "z", -1, 1, 0.3, 0.5, -1.9, 0), ...wall("pit_e", "z", -1, 1, 2.5, 2.7, -1.9, 0)] : [];
  const door = { a: -w / 2, b: w / 2, y0: 0, y1: h };
  return {
    id: "fixture_hut", label: "Hut", region: "island_chain", site: "fixture", anchor: v(0, 5, 0), quarter: 0,
    rooms: [{ id: "r", role: "chamber", label: "Room", falloff: 6, bounds: { min: v(-3, 0, -2), max: v(3, H, 2) } }],
    portals: [
      { id: "west", kind: "door", label: "West", between: ["r", OUTSIDE], center: v(-3.1, h / 2, 0), normal: v(-1, 0, 0), clear: { width: w, height: h }, admits: ["diver"] },
      { id: "east", kind: "door", label: "East", between: ["r", OUTSIDE], center: v(3.1, h / 2, 0), normal: v(1, 0, 0), clear: { width: w, height: h }, admits: ["diver"] },
    ],
    staging: [],
    shell: [
      ...slab("floor", "floor", -3.2, 3.2, -2.2, 2.2, -0.3, 0, holes), ...slab("roof", "roof", -3.2, 3.2, -2.2, 2.2, H, H + 0.2),
      ...wall("w", "z", -2, 2, -3.2, -3, 0, H, [door]), ...wall("e", "z", -2, 2, 3, 3.2, 0, H, [door]),
      ...wall("s", "x", -3.2, 3.2, -2.2, -2, 0, H), ...wall("n", "x", -3.2, 3.2, 2, 2.2, 0, H),
      // A low loft over the south side only, leaving a walkway to the east door along the north.
      ...(o.loft ? [{ id: "loft", module: "ceiling" as const, min: v(0.5, 1.5, -1.9), max: v(2.9, 1.7, -0.5) }] : []),
      ...pit,
    ],
    dressing: [], stacks: [], lights: [], sounds: [], hosts: [],
    firstAccess: [{ route: "fixture", milestone: "land", craft: null, staging: null, origin: v(-5, 0, 0) }], replaces: [],
  };
}
/** Ground at +5, dipping to `dip` inside the given world rectangles. */
const ground = (dips: readonly { x0: number; x1: number; z0: number; z1: number; y: number }[] = []): InteriorExterior =>
  flatExterior((x, z) => dips.find((d) => x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1)?.y ?? 5);
const walker = fixtureState("suit_150");
const onLand = (def: InteriorDef, exterior = ground()): Problem[] =>
  validateInterior({ def, exterior, scenarios: [{ access: def.firstAccess[0]!, state: walker }], airRooms: [] });

test("control: a hut on ordinary ground passes, walked with the 1.75 m capsule from outside its door", () => {
  assert.deepEqual(onLand(hut()), []);
});

test("ADVERSE: walking headroom: a low ceiling over part of the floor admits a swimmer, not a walker", () => {
  assert.deepEqual(codes(onLand(hut({ loft: true }))), ["headroom"]);
});

test("ADVERSE: a one-way drop inside the shell: a 1.6 m pit with no way back up is a trap", () => {
  // The terrain dips well below under the pit, so the shell alone makes it.
  const problems = onLand(hut({ shellPit: true }), ground([{ x0: 0.2, x1: 2.8, z0: -1.3, z1: 1.3, y: 0 }]));
  assert.deepEqual(codes(problems), ["trap"], JSON.stringify(problems));
  assert.ok(at(problems, "trap")[0]!.at!.y < 4, "the trapped poses are in the pit");
});

test("ADVERSE: a one-way drop the terrain owns, under a hole in the floor, is a trap too", () => {
  const problems = onLand(hut({ holeOnly: true }), ground([{ x0: 0.5, x1: 2.5, z0: -1, z1: 1, y: 3.4 }]));
  assert.deepEqual(codes(problems), ["trap"], JSON.stringify(problems));
});

test("ADVERSE: a dead end outside the shell: a depression past the east door you can drop into and not climb out of", () => {
  // Beyond the east threshold (X = 3.2), ground at 3.4 in a 2 m pocket ringed by ground at 5.
  const problems = onLand(hut(), ground([{ x0: 3.4, x1: 5.4, z0: -1.4, z1: 1.4, y: 3.4 }]));
  assert.deepEqual(codes(problems), ["trap"], JSON.stringify(problems));
  assert.ok(at(problems, "trap")[0]!.at!.x > 3.2, "the trapped poses are outside the building");
});

test("ADVERSE: a doorway too narrow for the capsule is not a way out; the 1.2 m control is", () => {
  assert.deepEqual(onLand(hut({ door: { width: 1.2, height: 2.1 } })), []);
  const narrow = onLand(hut({ door: { width: 0.2, height: 2.1 } }));
  assert.equal(at(narrow, "exits").length, 2, JSON.stringify(narrow));
  assert.ok(at(narrow, "room").length === 1, "and the room isn't on any round trip");
});

test("ADVERSE: a lintel too low for a walker is not a way out; the 2.1 m control is", () => {
  const low = onLand(hut({ door: { width: 1.2, height: 1.5 } }));
  assert.equal(at(low, "exits").length, 2, JSON.stringify(low));
  assert.ok(at(low, "room").length === 1);
});

// --- An underwater room with a parked craft ------------------------------------------------------

/** A small underwater room with one door, south, and a parking spot `p` (local). */
function box(p: { x: number; y: number; z: number }): InteriorDef {
  return {
    id: "fixture_box", label: "Box", region: "silt_basin", site: "fixture", anchor: v(0, -50, 0), quarter: 0,
    rooms: [{ id: "r", role: "chamber", label: "Room", falloff: 4, bounds: { min: v(-2, 0, -2), max: v(2, 2.5, 2) } }],
    portals: [{ id: "door", kind: "door", label: "Door", between: ["r", OUTSIDE], center: v(0, 1.05, -2.1), normal: v(0, 0, -1), clear: { width: 1.2, height: 2.1 }, admits: ["diver"] }],
    staging: [{ id: "spot", role: "craft_parking", label: "Spot", position: p, radius: 1, profiles: ["small"], yaw: 0, approach: v(p.x, 25, p.z) }],
    shell: [
      ...slab("floor", "floor", -2.2, 2.2, -2.2, 2.2, -0.2, 0), ...slab("roof", "roof", -2.2, 2.2, -2.2, 2.2, 2.5, 2.7),
      ...wall("s", "x", -2.2, 2.2, -2.2, -2, 0, 2.5, [{ a: -0.6, b: 0.6, y0: 0, y1: 2.1 }]), ...wall("n", "x", -2.2, 2.2, 2, 2.2, 0, 2.5),
      ...wall("w", "z", -2, 2, -2.2, -2, 0, 2.5), ...wall("e", "z", -2, 2, 2, 2.2, 0, 2.5),
    ],
    dressing: [], stacks: [], lights: [], sounds: [], hosts: [], firstAccess: [{ route: "fixture", milestone: "box", craft: "dart", staging: "spot" }], replaces: [],
  };
}
const shelf = (solids: readonly Solid[] = []): InteriorExterior => flatExterior(-60, solids);
const inBox = (def: InteriorDef, state = dart, exterior = shelf()): Problem[] =>
  validateInterior({ def, exterior, scenarios: [{ access: def.firstAccess[0]!, state }], airRooms: [] });

test("control: a room with its craft parked above passes: approach, exit, boarding, the round trip and air", () => {
  assert.deepEqual(inBox(box(v(0, 5, -5))), []);
});

test("ADVERSE: a parked hull across the only door: the door is not a way out, though the craft approaches cleanly", () => {
  // Keel 5.85 m south, hull's authored bow 3.6 m: it stops 5 cm short of the wall, filling the doorway's far side.
  const problems = inBox(box(v(0, 0.2, -5.85)));
  assert.ok(codes(problems).includes("exits"), JSON.stringify(problems));
  assert.ok(!codes(problems).includes("approach"), "the approach itself is clear");
});

test("ADVERSE: the craft parked beyond a barrier: no round trip reaches the room, though the air line reaches through", () => {
  // The control: parked 20 m out, open water between.
  assert.deepEqual(inBox(box(v(0, 5, -20))), []);
  const barrier = solid("fixture.barrier", { x: -50, y: -80, z: -10 }, { x: 50, y: -30, z: -9 });
  const problems = inBox(box(v(0, 5, -20)), dart, shelf([barrier]));
  assert.ok(codes(problems).includes("room"), JSON.stringify(problems));
});

test("ADVERSE: an exterior rock across the craft's approach is an approach problem", () => {
  const rock = solid("fixture.rock", { x: -3, y: -40, z: -8 }, { x: 3, y: -39, z: -2 });
  assert.deepEqual(codes(inBox(box(v(0, 5, -5)), dart, shelf([rock]))), ["approach"]);
});

test("exterior solids join the continuous sweep beside the interior: a crossbar stops a swimmer the endpoints alone would pass", () => {
  // Right beside the south wall, so the move's envelope meets the interior's collider (the static sweep).
  const def = box(v(0, 5, -5)), bar = solid("fixture.bar", { x: -3, y: -49, z: -3 }, { x: 3, y: -48.9, z: -2.3 });
  const world = interiorWorld(def, shelf([bar]), { minX: -10, maxX: 10, minZ: -15, maxZ: 10 });
  const from = { x: 0, y: -50, z: -2.65 };
  assert.ok(world.clearance(from, SWIM) && world.clearance({ x: 0, y: -48.8, z: -2.65 }, SWIM), "both ends are clear");
  const m = world.moveCapsule(from, { x: 0, y: 1.2, z: 0 }, SWIM);
  assert.ok(m.hitSolid && m.position.y + SWIM.height <= -49 + 1e-3, `stopped under the bar: ${JSON.stringify(m)}`);
});

test("terrain joins the sweep too: a swimmer can't pass through a ridge between two clear poses", () => {
  const def = box(v(0, 5, -5)), ridge = flatExterior((_x, z) => (z > -8 && z < -7 ? -47 : -60));
  const world = interiorWorld(def, ridge, { minX: -10, maxX: 10, minZ: -15, maxZ: 10 });
  const m = world.moveCapsule({ x: 0, y: -49, z: -10 }, { x: 0, y: 0, z: 5 }, SWIM);
  assert.ok(m.hitSolid && m.position.z < -8, `stopped at the ridge: ${JSON.stringify(m)}`);
});

// --- First visits without a craft ------------------------------------------------------------------

/** The box room, swum to from open water above its door. */
const swum = (origin: { x: number; y: number; z: number }): InteriorDef => ({
  ...box(v(0, 5, -5)), staging: [], firstAccess: [{ route: "fixture", milestone: "swim", craft: null, staging: null, origin }],
});

test("control: a craftless visit from open water under a clear rise passes", () => {
  assert.deepEqual(inBox(swum(v(0, 6, -6)), fixtureState("suit_350")), []);
});

test("ADVERSE: a craftless water origin under a rock has no proven rise to the surface", () => {
  const lid = solid("fixture.lid", { x: -6, y: -40, z: -12 }, { x: 6, y: -39, z: 0 });
  assert.ok(codes(inBox(swum(v(0, 6, -6)), fixtureState("suit_350"), shelf([lid]))).includes("origin"));
});

test("ADVERSE: a craftless first visit must name its origin", () => {
  const def = { ...swum(v(0, 6, -6)), firstAccess: [{ route: "fixture", milestone: "swim", craft: null, staging: null }] };
  assert.deepEqual(codes(inBox(def, fixtureState("suit_350"))), ["origin"]);
});

test("ADVERSE: a first visit whose route has no such craft is refused, not assumed", () => {
  assert.deepEqual(codes(inBox(box(v(0, 5, -5)), fixtureState("suit_350"))), ["scenario"]);
});

test("ADVERSE: a suit too shallow for the room is a depth problem", () => {
  const def = { ...box(v(0, 5, -5)), anchor: v(0, -170, 0) };
  const problems = validateInterior({ def, exterior: flatExterior(-180), scenarios: [{ access: def.firstAccess[0]!, state: fixtureState("suit_150", "dart") }], airRooms: [] });
  assert.ok(codes(problems).includes("depth"), JSON.stringify(problems));
});
