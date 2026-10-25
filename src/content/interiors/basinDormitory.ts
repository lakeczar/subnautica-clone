/** ENV-1: the Basin dormitory (C05) on the first shelf. A long, low block:
 * a common room facing the open-water landing (north), a corridor to the rear
 * service door, and a bunk room either side. The landing doors are shut and
 * lashed; you come in through the broken landing window or the end door.
 * Local origin: the floor at S2's dormitory datum (178, -166, -218). */
import { OUTSIDE, type InteriorDef, type Placement } from "./types.js";
import { place, slab, v, wall } from "./build.js";

const H = 3.2, ROOF = 3.5;
const door = (a: number, b: number, y1 = 2.1) => ({ a, b, y0: 0, y1 });

const shell = [
  ...slab("floor", "floor", -9, 9, -6, 6, -0.4, 0),
  // The east bunk room's collapsed ceiling panel lets a shaft of light in.
  ...slab("roof", "roof", -9, 9, -6, 6, H, ROOF, [{ x0: 4, x1: 6, z0: -3, z1: -1 }]),
  ...wall("north", "x", -9, 9, 5.7, 6, 0, H, [{ a: -6, b: -3.5, y0: 0.6, y1: 2.4 }]),
  ...wall("south", "x", -9, 9, -6, -5.7, 0, H, [door(-0.6, 0.6)]),
  ...wall("west", "z", -5.7, 5.7, -9, -8.7, 0, H, [door(2.8, 4.6, 2.2)]),
  ...wall("east", "z", -5.7, 5.7, 8.7, 9, 0, H),
  ...wall("partition", "x", -8.7, 8.7, 1.875, 2.125, 0, H, [door(-1.25, 1.25, 2.4)]),
  ...wall("corridor_w", "z", -5.7, 1.875, -1.5, -1.25, 0, H, [door(-1, 0.2)]),
  ...wall("corridor_e", "z", -5.7, 1.875, 1.25, 1.5, 0, H, [door(-1, 0.2)]),
];

/** Bunks against a wall at x, with the pale marks where pictures hung above each. */
const bunks = (side: string, x: number, zs: readonly number[], wallX: number): Placement[] => zs.flatMap((z, i) => [
  place(`${side}.bunk${i}`, "bunk_double", v(x, 0, z), 0, "structure"),
  place(`${side}.mark${i}`, "picture_mark", v(wallX, 1.9, z), 1),
]);
/** A neat column of bundles against the inner (rear) wall. */
const bundles = (stack: string, x: number, high: number, z = -5.4): Placement[] =>
  Array.from({ length: high }, (_, k) => place(`${stack}.${k}`, "bundle", v(x, k * 0.45, z), 0, "dressing", stack));

const westStacks = ["w_a", "w_b", "w_c", "w_d"], eastStacks = ["e_a", "e_b", "e_c", "e_d"];
const dressing: Placement[] = [
  ...bunks("west", -8.25, [-4.6, -2.3, 0], -8.69), ...bunks("west_in", -1.95, [-4.6, -2.3], -1.51),
  ...bunks("east", 8.25, [-4.6, -2.3, 0], 8.69), ...bunks("east_in", 1.95, [-4.6, -2.3], 1.51),
  ...westStacks.flatMap((s, i) => bundles(s, -6.9 + i * 0.8, i % 2 ? 2 : 3)),
  ...eastStacks.flatMap((s, i) => bundles(s, 3.3 + i * 0.8, i % 2 ? 3 : 2)),
  // The keepsake: a small stringed instrument tied to the top of one bundle.
  place("instrument", "instrument", v(-6.1, 0.9, -5.4), 0, "dressing", "w_b"),
  place("scarf", "scarf", v(4.1, 1.35, -5.4), 0, "clutter", "e_b"),
  // The bundles the transfer tags are read on (C05's host stands on top), up the corridor.
  ...bundles("tagged", 0, 2, -4.2),
  // Common room: a game left mid-play, mugs, the duty board, the lashed landing doors, the silt fan.
  place("table", "table", v(4, 0, 4)),
  place("chair_a", "chair", v(3.4, 0, 3.3)),
  place("chair_b", "chair", v(4.6, 0, 4.7), 2),
  place("game", "game_board", v(4.1, 0.75, 4.1), 0, "clutter"),
  place("mug_a", "mug", v(3.6, 0.75, 4.15), 0, "clutter"),
  place("mug_b", "mug", v(4.55, 0.75, 3.85), 0, "clutter"),
  place("duty_board", "duty_board", v(-3, 1.4, 2.14)),
  place("lashing", "lashing", v(1.8, 0.9, 5.68)),
  place("silt", "silt_fan", v(-4.75, 0, 4.3), 0, "clutter"),
  ...[-7.3, -6.7, -6.1].map((x, i) => place(`locker${i}`, "locker", v(x, 0, 2.4), 0, "structure")),
];

export const BASIN_DORMITORY: InteriorDef = {
  id: "basin_dormitory", label: "Basin dormitory", region: "silt_basin", site: "basin_dormitory",
  anchor: v(178, -166, -218), quarter: 0,
  rooms: [
    { id: "common", role: "chamber", label: "Common room", falloff: 6, bounds: { min: v(-8.7, 0, 2.125), max: v(8.7, H, 5.7) } },
    { id: "corridor", role: "passage", label: "Corridor", falloff: 4, bounds: { min: v(-1.25, 0, -5.7), max: v(1.25, H, 1.875) } },
    { id: "bunks_west", role: "chamber", label: "West bunk room", falloff: 4, bounds: { min: v(-8.7, 0, -5.7), max: v(-1.5, H, 1.875) } },
    { id: "bunks_east", role: "chamber", label: "East bunk room", falloff: 5, bounds: { min: v(1.5, 0, -5.7), max: v(8.7, H, 1.875) } },
  ],
  portals: [
    { id: "landing_window", kind: "window", label: "Broken landing window", between: ["common", OUTSIDE], center: v(-4.75, 1.5, 5.85), normal: v(0, 0, 1), clear: { width: 2.5, height: 1.8 }, admits: ["diver"] },
    { id: "end_door", kind: "door", label: "End door", between: ["common", OUTSIDE], center: v(-8.85, 1.1, 3.7), normal: v(-1, 0, 0), clear: { width: 1.8, height: 2.2 }, admits: ["diver"] },
    { id: "service_door", kind: "door", label: "Rear service door", between: ["corridor", OUTSIDE], center: v(0, 1.05, -5.85), normal: v(0, 0, -1), clear: { width: 1.2, height: 2.1 }, admits: ["diver"] },
    { id: "roof_breach", kind: "breach", label: "Collapsed ceiling panel", between: ["bunks_east", OUTSIDE], center: v(5, ROOF, -2), normal: v(0, 1, 0), clear: { width: 2, height: 2 }, admits: ["diver"] },
    { id: "corridor_arch", kind: "door", label: "Corridor", between: ["common", "corridor"], center: v(0, 1.2, 2), normal: v(0, 0, -1), clear: { width: 2.5, height: 2.4 }, admits: ["diver"] },
    { id: "west_doorway", kind: "door", label: "West bunk room", between: ["corridor", "bunks_west"], center: v(-1.375, 1.05, -0.4), normal: v(-1, 0, 0), clear: { width: 1.2, height: 2.1 }, admits: ["diver"] },
    { id: "east_doorway", kind: "door", label: "East bunk room", between: ["corridor", "bunks_east"], center: v(1.375, 1.05, -0.4), normal: v(1, 0, 0), clear: { width: 1.2, height: 2.1 }, admits: ["diver"] },
  ],
  // S2's dormitory parking, above the landing: craft park by coming straight down.
  staging: [{ id: "landing", role: "craft_parking", label: "Above the landing", position: v(0, 6, 10), radius: 6, profiles: ["small", "medium"], yaw: 0, approach: v(0, 26, 10) }],
  shell, dressing,
  stacks: [...westStacks, ...eastStacks, "tagged"].map((id) => ({ id, kind: "bundle_stack" as const })),
  lights: [],
  sounds: [{ id: "door_creak", at: v(1.8, 1.5, 5.6), cue: "dormitory_door_creak", caption: "A slow creak of a lashed door, ahead, as the water shifts" }],
  hosts: [{ kind: "evidence", id: "C05" }],
  // Both routes first read C05 on this shelf from the Dart; the carrier route
  // branches later (creel@refits) and shares this visit.
  firstAccess: [
    { route: "creel", milestone: "basin-survey", craft: "dart", staging: "landing" },
    { route: "no-optional", milestone: "basin-survey", craft: "dart", staging: "landing" },
  ],
  // S2's five placeholder boxes for the dormitory (content/routes.ts BASIN_GEOMETRY); stage 2 retires them.
  replaces: ["basin.dormitory.floor", "basin.dormitory.back", "basin.dormitory.beds.west", "basin.dormitory.beds.east", "basin.dormitory.bundles"],
};
