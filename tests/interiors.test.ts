/** ENV-1 stage 1: the air-room table and its consumers, the interior data
 * model and the validator's static checks. */
import test from "node:test";
import assert from "node:assert/strict";
import { AIR_ROOM_LIST, AIR_ROOMS, airRoomProblems, inAirRoomBounds, type AirRoom } from "../src/content/airRooms.js";
import { boxToWorld, placementBox, portalWorld, toWorld, turn } from "../src/content/interiors/geometry.js";
import { slab, wall } from "../src/content/interiors/build.js";
import { INTERIORS } from "../src/content/interiors/index.js";
import { OUTSIDE, type InteriorDef } from "../src/content/interiors/types.js";
import { airIntervalGlsl, roomMaskGlsl } from "../src/render/airRoomsGlsl.js";
import { airRoomAt } from "../src/sim/airRooms.js";
import { staticProblems } from "../src/sim/interiors/validate.js";
import { inCanopyAir } from "../src/sim/inventory.js";
import { fixtureState } from "./interiors-support.js";

// --- The air-room table --------------------------------------------------------

test("the air-room table is valid and holds only the always-dry lab for now", () => {
  assert.deepEqual(airRoomProblems(AIR_ROOM_LIST), []);
  assert.deepEqual(AIR_ROOM_LIST.map((r) => [r.id, r.activeWhen]), [["canopy_lab", "always"]]);
});

test("inCanopyAir answers exactly as its old literal box, boundaries included", () => {
  const old = (p: { x: number; y: number; z: number }): boolean =>
    p.x > 111.4 && p.x < 120.6 && p.z > -129.6 && p.z < -122.4 && p.y >= -118.1 && p.y < -114.5;
  const s = fixtureState("suit_150");
  for (const x of [111.3, 111.4, 111.41, 116, 120.59, 120.6, 120.7])
    for (const y of [-118.2, -118.1, -117, -114.51, -114.5])
      for (const z of [-129.7, -129.6, -129.59, -126, -122.41, -122.4]) {
        s.player.pose.position = { x, y, z };
        assert.equal(inCanopyAir(s), old({ x, y, z }), `(${x}, ${y}, ${z})`);
      }
  s.player.pose.position = { x: 116, y: -117, z: -126 };
  s.player.controlledVehicleId = "a craft";
  assert.equal(inCanopyAir(s), false, "a pilot is not in the hood's air");
});

test("the shader's lab terms are written from the table and match the old source exactly", () => {
  assert.equal(airIntervalGlsl(AIR_ROOMS.canopy_lab), "boxInterval(a,b,vec3(111.4,-118.1,-129.6),vec3(120.6,-114.5,-122.4),span)");
  assert.equal(roomMaskGlsl(AIR_ROOMS.canopy_lab),
    "step(111.28,vWorld.x)*step(vWorld.x,120.61)*step(-129.72,vWorld.z)*step(vWorld.z,-122.39)*step(-118.03,vWorld.y)*step(vWorld.y,-113.97)");
});

/** A restoration row (the Rift station's), with `over` applied. */
const room = (over: Partial<AirRoom>): AirRoom => ({
  id: "fixture", interior: "fixture_interior", room: "dry", bounds: [{ min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 4 } }],
  waterline: 0.5, activeWhen: { facility: "rift_station" }, restBase: "rift_station", wake: { x: 2, y: 0.6, z: 2 }, ...over,
});

/** The upper hall's row: drained by the works, with no bunk of its own. */
const hallRow: AirRoom = { id: "hall", interior: "fixture_interior", room: "hall", bounds: [{ min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 4 } }],
  waterline: 0.5, activeWhen: { works: "hall" } };

test("restoration rows are limited to the bigger restored stops and the upper hall, each with a bunk's wake inside", () => {
  assert.deepEqual(airRoomProblems([room({})]), []);
  assert.deepEqual(airRoomProblems([hallRow]), []);
  const one = (r: Partial<AirRoom>): string[] => airRoomProblems([room(r)]);
  assert.match(one({ activeWhen: { facility: "crown_dock" } }).join(), /not one of the bigger restored stops/);
  assert.match(airRoomProblems([{ ...hallRow, activeWhen: { facility: "rift_station" }, restBase: "rift_station" }]).join(), /needs a wake pose/);
  assert.match(one({ wake: { x: 2, y: 0.2, z: 2 } }).join(), /wake pose is not in the dry room/, "below the waterline");
  assert.match(one({ activeWhen: "always" }).join(), /always-dry room registers no bunk/);
  assert.match(one({ interior: null }).join(), /belongs to an interior's room/);
  assert.match(one({ waterline: 3 }).join(), /waterline at or above/);
});

test("activation reads the saved facts: a facility's repair, or the works' hall", () => {
  const rift = room({}), hall = hallRow;
  const s = fixtureState("suit_150"), p = { x: 2, y: 1, z: 2 };
  assert.equal(airRoomAt(s, p, [rift, hall]), null, "neither is restored in a new game");
  s.world.facilities.push({ id: "rift_station", repaired: true } as never);
  assert.equal(airRoomAt(s, p, [rift, hall])?.id, "fixture");
  assert.equal(airRoomAt(s, { x: 2, y: 0.4, z: 2 }, [rift]), null, "below the waterline is water");
  s.world.facilities = [];
  s.story.works.hall = true;
  assert.equal(airRoomAt(s, p, [rift, hall])?.id, "hall");
  assert.equal(inAirRoomBounds(rift, { x: 0, y: 1, z: 2 }), false, "open in X, as the lab always was");
});

// --- Geometry and helpers --------------------------------------------------------

test("a quarter turn maps local +X to world +Z and local +Z to world -X", () => {
  assert.deepEqual(turn(1, { x: 1, y: 2, z: 0 }), { x: -0, y: 2, z: 1 });
  assert.deepEqual(turn(1, { x: 0, y: 0, z: 1 }), { x: -1, y: 0, z: 0 });
  for (const q of [0, 1, 2, 3] as const) {
    const def = { anchor: { x: 10, y: -5, z: 20 }, quarter: q };
    const b = boxToWorld(def, { x: 1, y: 0, z: 2 }, { x: 3, y: 1, z: 5 }), c = toWorld(def, { x: 2, y: 0.5, z: 3.5 });
    assert.ok(c.x > b.min.x && c.x < b.max.x && c.z > b.min.z && c.z < b.max.z, `q${q}: the box holds its own centre`);
    assert.equal(Math.round((b.max.x - b.min.x) * (b.max.z - b.min.z)), 6, `q${q}: area kept`);
  }
});

test("walls split around openings into spans, sills and lintels; slabs leave their holes open", () => {
  const w = wall("w", "x", 0, 10, 0, 0.2, 0, 3, [{ a: 2, b: 4, y0: 1, y1: 2 }, { a: 6, b: 7, y0: 0, y1: 2.1 }]);
  const vol = w.reduce((a, p) => a + (p.max.x - p.min.x) * (p.max.y - p.min.y) * (p.max.z - p.min.z), 0);
  assert.ok(Math.abs(vol - 0.2 * (30 - 2 - 2.1)) < 1e-9, `solid volume ${vol}`);
  const s = slab("s", "floor", 0, 10, 0, 6, 0, 0.3, [{ x0: 2, x1: 4, z0: 1, z1: 3 }]);
  const area = s.reduce((a, p) => a + (p.max.x - p.min.x) * (p.max.z - p.min.z), 0);
  assert.ok(Math.abs(area - (60 - 4)) < 1e-9, `slab area ${area}`);
  assert.ok(!s.some((p) => p.min.x < 3 && p.max.x > 3 && p.min.z < 2 && p.max.z > 2), "the hole's centre is open");
});

// --- Static checks ---------------------------------------------------------------

test("every interior definition passes the static checks", () => {
  for (const def of INTERIORS) assert.deepEqual(staticProblems(def), [], def.id);
});

/** A small room with one door, for broken copies. */
const box: InteriorDef = {
  id: "fixture_box", label: "Box", region: "silt_basin", site: "fixture", anchor: { x: 0, y: -50, z: 0 }, quarter: 0,
  rooms: [{ id: "r", role: "chamber", label: "Room", falloff: 4, bounds: { min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 2.5, z: 2 } } }],
  portals: [{ id: "door", kind: "door", label: "Door", between: ["r", OUTSIDE], center: { x: 0, y: 1.05, z: -2.1 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 1.2, height: 2.1 }, admits: ["diver"] }],
  staging: [], shell: [
    ...slab("floor", "floor", -2.2, 2.2, -2.2, 2.2, -0.2, 0), ...slab("roof", "roof", -2.2, 2.2, -2.2, 2.2, 2.5, 2.7),
    ...wall("s", "x", -2.2, 2.2, -2.2, -2, 0, 2.5, [{ a: -0.6, b: 0.6, y0: 0, y1: 2.1 }]), ...wall("n", "x", -2.2, 2.2, 2, 2.2, 0, 2.5),
    ...wall("w", "z", -2, 2, -2.2, -2, 0, 2.5), ...wall("e", "z", -2, 2, 2, 2.2, 0, 2.5),
  ],
  dressing: [], stacks: [{ id: "neat", kind: "bundle_stack" }], lights: [], sounds: [], hosts: [], firstAccess: [], replaces: [],
};

test("ADVERSE: broken definitions are each refused with their own problem", () => {
  const codesOf = (d: Partial<InteriorDef>): string[] => staticProblems({ ...box, ...d }).map((p) => p.code);
  assert.deepEqual(staticProblems(box), []);
  assert.ok(codesOf({ dressing: [{ id: "x", template: "no_such_prop", at: { x: 0, y: 0, z: 0 }, quarter: 0, tier: "clutter" }] }).includes("template"));
  // A crate in the doorway's clear rectangle.
  assert.ok(codesOf({ dressing: [{ id: "crate", template: "crate", at: { x: 0, y: 0, z: -2.1 }, quarter: 0, tier: "dressing" }] }).includes("portal"));
  assert.ok(codesOf({ sounds: [{ id: "s", at: { x: 0, y: 1, z: 0 }, cue: "x", caption: " " }] }).includes("caption"));
  assert.ok(codesOf({ lights: Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, room: "r", at: { x: 0, y: 2, z: 0 }, color: "#fff" })) }).includes("lights"));
  assert.ok(codesOf({ portals: [{ ...box.portals[0]!, kind: "door", admits: [] }] }).includes("portal"), "only a window may be daylight-only");
  assert.ok(codesOf({ hosts: [{ kind: "story", id: "no_such_host" }] }).includes("host"));
  assert.ok(codesOf({ firstAccess: [{ route: "creel", milestone: "x", craft: "dart", staging: null }] }).includes("scenario"));
});

test("ADVERSE: belongings are never heaped: they touch only inside one neat stack", () => {
  const bundle = (id: string, x: number, y: number, stack?: string) => ({ id, template: "bundle", at: { x, y, z: 1 }, quarter: 0 as const, tier: "dressing" as const, ...(stack ? { stack } : {}) });
  const heap = (dressing: InteriorDef["dressing"]): string[] => staticProblems({ ...box, dressing }).filter((p) => p.code === "heap").map((p) => p.message);
  assert.deepEqual(heap([bundle("a", 0, 0, "neat"), bundle("b", 0, 0.45, "neat")]), [], "a neat column");
  assert.equal(heap([bundle("a", 0, 0), bundle("b", 0.3, 0)]).length, 1, "two loose bundles touching");
  assert.equal(heap([bundle("a", 0, 0, "neat"), bundle("b", 0, 0.9, "neat")]).length, 1, "one floating above the column");
  assert.equal(heap([bundle("a", 0, 0, "neat"), bundle("b", 0.5, 0.45, "neat")]).length, 1, "one off the edge of the one below");
});

test("placements and portals land where their local data says", () => {
  const def = INTERIORS.find((d) => d.id === "basin_dormitory")!;
  const window = portalWorld(def, def.portals.find((p) => p.id === "landing_window")!);
  assert.deepEqual(window.center, { x: 178 - 4.75, y: -166 + 1.5, z: -218 + 5.85 });
  const host = def.dressing.filter((p) => p.stack === "tagged").map((p) => placementBox(def, p)).at(-1)!;
  assert.ok(host.max.y < -164.8 && host.max.y > -165.5, "C05's host stands just above the tagged bundles");
});
