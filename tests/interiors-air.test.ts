/** ENV-1 stage 1: the air proof and configuration space, on fixtures that must
 * fail (and their passing controls). Worlds are flat-floored and built here;
 * the validator, the air line, the exit and boarding rules are the sim's own. */
import test from "node:test";
import assert from "node:assert/strict";
import type { AirRoom } from "../src/content/airRooms.js";
import { boxToWorld } from "../src/content/interiors/geometry.js";
import { slab, v, wall } from "../src/content/interiors/build.js";
import { OUTSIDE, type FirstAccess, type InteriorDef, type InteriorStaging } from "../src/content/interiors/types.js";
import { RETURN_BUDGET_M, validateInterior, type Problem } from "../src/sim/interiors/validate.js";
import { codes, fixtureState, flatWorld } from "./interiors-support.js";

const at = (problems: readonly Problem[], code: string): Problem[] => problems.filter((p) => p.code === code);

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
const deep = flatWorld(-230);
const dart = fixtureState("suit_350", "dart");

test("control: a 60 m tunnel passes with its one craft at one end (covered near it, a timed return beyond)", () => {
  const def = tunnel(60);
  assert.deepEqual(validateInterior({ def, exterior: deep, scenarios: [{ access: def.firstAccess[0]!, state: dart }], airRooms: [] }), []);
});

test("ADVERSE: two parking places, one craft: a 300 m tunnel fails from either end, though the two together would cover it", () => {
  // From one end the far end is ~270 m of tunnel past the line's reach: a ~540 m
  // round trip, over the budget. Two craft, one at each end, would leave at most
  // ~125 m to the nearer line (a ~250 m round trip), within it.
  assert.ok(2 * (300 - 27) > RETURN_BUDGET_M && 300 - 54 < RETURN_BUDGET_M, "the fixture straddles the budget as intended");
  const def = tunnel(300, { access: [
    { route: "fixture", milestone: "west", craft: "dart", staging: "park_west" },
    { route: "fixture", milestone: "east", craft: "dart", staging: "park_east" },
  ] });
  const problems = validateInterior({ def, exterior: deep, scenarios: def.firstAccess.map((access) => ({ access, state: dart })), airRooms: [] });
  const air = at(problems, "air");
  assert.equal(air.length, 2, `both single-craft scenarios fail on air: ${JSON.stringify(problems)}`);
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
  assert.ok(at(unrestored, "air").length === 1, `before restoration: ${JSON.stringify(unrestored)}`);
  const restored = structuredClone(dart);
  restored.world.facilities.push({ id: "rift_station", repaired: true } as never);
  const after = validateInterior({ def, exterior: deep, scenarios: [{ access: def.firstAccess[0]!, state: restored }], airRooms: rooms });
  assert.deepEqual(after, [], "after restoration the dry room covers the far end, and the middle is a timed return from either air");
});

/** A small building on land at +5 m (walked, not swum), with `dressing`/`shell` changes. */
function hut(o: { ceiling?: number; pit?: boolean } = {}): InteriorDef {
  const H = o.ceiling ?? 2.6, holes = o.pit ? [{ x0: 0.5, x1: 2.5, z0: -1, z1: 1 }] : [];
  return {
    id: "fixture_hut", label: "Hut", region: "island_chain", site: "fixture", anchor: v(0, 5, 0), quarter: 0,
    rooms: [{ id: "r", role: "chamber", label: "Room", falloff: 6, bounds: { min: v(-3, 0, -2), max: v(3, H, 2) } }],
    portals: [
      { id: "west", kind: "door", label: "West", between: ["r", OUTSIDE], center: v(-3.1, 1.05, 0), normal: v(-1, 0, 0), clear: { width: 1.2, height: Math.min(2.1, H) }, admits: ["diver"] },
      { id: "east", kind: "door", label: "East", between: ["r", OUTSIDE], center: v(3.1, 1.05, 0), normal: v(1, 0, 0), clear: { width: 1.2, height: Math.min(2.1, H) }, admits: ["diver"] },
    ],
    staging: [],
    shell: [
      ...slab("floor", "floor", -3.2, 3.2, -2.2, 2.2, -0.3, 0, holes), ...slab("roof", "roof", -3.2, 3.2, -2.2, 2.2, H, H + 0.2),
      ...wall("w", "z", -2, 2, -3.2, -3, 0, H, [{ a: -0.6, b: 0.6, y0: 0, y1: Math.min(2.1, H) }]),
      ...wall("e", "z", -2, 2, 3, 3.2, 0, H, [{ a: -0.6, b: 0.6, y0: 0, y1: Math.min(2.1, H) }]),
      ...wall("s", "x", -3.2, 3.2, -2.2, -2, 0, H), ...wall("n", "x", -3.2, 3.2, 2, 2.2, 0, H),
      // A 1.6 m pit under the hole, with no way back up.
      ...(o.pit ? [...slab("pit_floor", "floor", 0.5, 2.5, -1, 1, -1.9, -1.6),
        ...wall("pit_s", "x", 0.3, 2.7, -1.2, -1, -1.9, 0), ...wall("pit_n", "x", 0.3, 2.7, 1, 1.2, -1.9, 0),
        ...wall("pit_w", "z", -1, 1, 0.3, 0.5, -1.9, 0), ...wall("pit_e", "z", -1, 1, 2.5, 2.7, -1.9, 0)] : []),
    ],
    dressing: [], stacks: [], lights: [], sounds: [], hosts: [], firstAccess: [{ route: "fixture", milestone: "land", craft: null, staging: null }], replaces: [],
  };
}
// The building stands on its floor slab over open ground at +3 (a raised porch: the pit fits under it).
const land = flatWorld(3);
const walker = fixtureState("suit_150");
const onLand = (def: InteriorDef): Problem[] => validateInterior({ def, exterior: land, scenarios: [{ access: def.firstAccess[0]!, state: walker }], airRooms: [] });

test("control: a hut on land passes, walked with the 1.75 m capsule", () => {
  assert.deepEqual(onLand(hut()), []);
});

test("ADVERSE: walking headroom: a 1.5 m room admits a swimmer but not a walker", () => {
  const problems = onLand(hut({ ceiling: 1.5 }));
  assert.ok(codes(problems).includes("headroom"), JSON.stringify(problems));
});

test("ADVERSE: a one-way drop: a walker can fall into a 1.6 m pit and never climb out", () => {
  const problems = onLand(hut({ pit: true })), trap = at(problems, "trap");
  assert.equal(trap.length, 1, JSON.stringify(problems));
  assert.ok(trap[0]!.at!.y < 5 - 1, "the trapped poses are in the pit");
});

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
const shelf = flatWorld(-60);
const inBox = (def: InteriorDef, state = dart): Problem[] => validateInterior({ def, exterior: shelf, scenarios: [{ access: def.firstAccess[0]!, state }], airRooms: [] });

test("control: a room with its craft parked above passes: approach, exit, boarding and air", () => {
  assert.deepEqual(inBox(box(v(0, 5, -5))), []);
});

test("ADVERSE: a parked hull across the only door: no diver pose fits there", () => {
  const problems = inBox(box(v(0, 0.2, -5.5)));
  assert.ok(codes(problems).includes("exits"), JSON.stringify(problems));
});

test("ADVERSE: a first visit whose route has no such craft is refused, not assumed", () => {
  const problems = inBox(box(v(0, 5, -5)), fixtureState("suit_350"));
  assert.deepEqual(codes(problems), ["scenario"]);
});

test("ADVERSE: a suit too shallow for the room is a depth problem", () => {
  const def = { ...box(v(0, 5, -5)), anchor: v(0, -170, 0) };
  const problems = validateInterior({ def, exterior: flatWorld(-180), scenarios: [{ access: def.firstAccess[0]!, state: fixtureState("suit_150", "dart") }], airRooms: [] });
  assert.ok(codes(problems).includes("depth"), JSON.stringify(problems));
});
