/** ENV-1: the opening island's field station and its cold store (OP-1's island).
 * Both are dry, on land: you walk them. Their anchors are the island blockout's
 * places (docs/research/STARTING-ISLAND-DESIGN.md §5, island centre at world
 * (-205, 0, -5)): OP-1 builds the island and places these by id, moving an
 * anchor if its terrain lands elsewhere. Until then nothing in the world uses them.
 *
 * The station: two whitewashed huts left mid-day. Hut A (west) is the study
 * and bunk room, with the door note, the kettle on its hook and the deckchair
 * outside facing west; hut B (east, windward) has its window blown in and a
 * tongue of sand across the floor. The cold store: a keypad door into the
 * hillside below the station (LS-1's coded door), a short passage, racks of
 * spare gauges, and at the back the kerbed shaft down into OP-1's Under-Stair. */
import { OUTSIDE, type InteriorDef } from "./types.js";
import { place, slab, v, wall } from "./build.js";

const door = (a: number, b: number) => ({ a, b, y0: 0, y1: 2.1 });

export const FIELD_STATION: InteriorDef = {
  id: "island_field_station", label: "Field station", region: "island_chain", site: "island.field_station",
  anchor: v(-250, 28, 20), quarter: 0,
  rooms: [
    { id: "hut_a", role: "chamber", label: "Study and bunk room", falloff: 8, bounds: { min: v(-3, 0, -2.25), max: v(3, 2.6, 2.25) } },
    { id: "hut_b", role: "chamber", label: "Windward hut", falloff: 8, bounds: { min: v(5.2, 0, -2), max: v(9.6, 2.4, 2) } },
  ],
  portals: [
    { id: "hut_a_west", kind: "door", label: "West door", between: ["hut_a", OUTSIDE], center: v(-3.1, 1.05, 0), normal: v(-1, 0, 0), clear: { width: 1.2, height: 2.1 }, admits: ["diver"] },
    { id: "hut_a_east", kind: "door", label: "East door", between: ["hut_a", OUTSIDE], center: v(3.1, 1.05, 0), normal: v(1, 0, 0), clear: { width: 1.2, height: 2.1 }, admits: ["diver"] },
    { id: "hut_b_west", kind: "door", label: "Door", between: ["hut_b", OUTSIDE], center: v(5.1, 1.05, 0), normal: v(-1, 0, 0), clear: { width: 1.2, height: 2.1 }, admits: ["diver"] },
    { id: "hut_b_south", kind: "door", label: "Side door", between: ["hut_b", OUTSIDE], center: v(6.2, 1.05, -2.1), normal: v(0, 0, -1), clear: { width: 1.2, height: 2.1 }, admits: ["diver"] },
    // Daylight only: the blown-in window is too high and small to climb through.
    { id: "hut_b_window", kind: "window", label: "Blown-in window", between: ["hut_b", OUTSIDE], center: v(9.7, 1.5, 0), normal: v(1, 0, 0), clear: { width: 1.2, height: 1.0 }, admits: [] },
  ],
  staging: [],
  shell: [
    ...slab("a.floor", "floor", -3.2, 3.2, -2.45, 2.45, -0.3, 0),
    ...slab("a.roof", "roof", -3.2, 3.2, -2.45, 2.45, 2.6, 2.8),
    ...wall("a.west", "z", -2.25, 2.25, -3.2, -3, 0, 2.6, [door(-0.6, 0.6)]),
    ...wall("a.east", "z", -2.25, 2.25, 3, 3.2, 0, 2.6, [door(-0.6, 0.6)]),
    ...wall("a.south", "x", -3.2, 3.2, -2.45, -2.25, 0, 2.6),
    ...wall("a.north", "x", -3.2, 3.2, 2.25, 2.45, 0, 2.6),
    ...slab("b.floor", "floor", 5, 9.8, -2.2, 2.2, -0.3, 0),
    ...slab("b.roof", "roof", 5, 9.8, -2.2, 2.2, 2.4, 2.6),
    ...wall("b.west", "z", -2, 2, 5, 5.2, 0, 2.4, [door(-0.6, 0.6)]),
    ...wall("b.east", "z", -2, 2, 9.6, 9.8, 0, 2.4, [{ a: -0.6, b: 0.6, y0: 1, y1: 2 }]),
    ...wall("b.south", "x", 5, 9.8, -2.2, -2, 0, 2.4, [door(5.6, 6.8)]),
    ...wall("b.north", "x", 5, 9.8, 2, 2.2, 0, 2.4),
  ],
  dressing: [
    place("desk", "desk", v(0.5, 0, -1.9), 0, "structure"),
    place("paperweight", "paperweight", v(0.3, 0.76, -1.9), 0, "clutter"),
    place("chair", "chair", v(0.5, 0, -1.2), 2),
    place("bunk", "bunk_single", v(-1.5, 0, 1.8), 1, "structure"),
    place("sun_hat", "sun_hat", v(-1.2, 0.7, 1.8), 0, "clutter"),
    place("shelf", "shelf", v(1.5, 0, 2.1), 0, "structure"),
    ...[[1.2, 0.8], [1.5, 0.8], [1.8, 0.8], [1.35, 1.25]].map(([x, y], i) => place(`jar${i}`, "jar", v(x!, y!, 2.1), 0, "clutter")),
    place("kettle", "kettle", v(-2.85, 1.4, -1.2), 0, "clutter"),
    place("mug", "mug", v(-2.85, 1, 1)),
    place("chart", "chart", v(2.99, 1.4, 1.2), 1),
    place("door_note", "note", v(-2.99, 1.5, 0.85), 1),
    place("oilskins", "oilskins", v(2.98, 1.2, -1.2), 1),
    place("deckchair", "deckchair", v(-5, 0, 0), 3),
    place("paperback", "paperback", v(-5, 0.45, 0.2), 0, "clutter"),
    place("vane_parts", "crate", v(6.2, 0, 1.4)),
    place("bench", "bench", v(8.6, 0, -1.75), 0, "structure"),
    place("sand", "silt_fan", v(8, 0, 0.2), 0, "clutter"),
  ],
  stacks: [],
  lights: [],
  sounds: [{ id: "shutter", at: v(9.7, 1.5, 0), cue: "station_shutter_knock", caption: "A loose shutter knocking in the wind, to the east" }],
  hosts: [],
  // On foot from the beach path: the ground outside hut A's west door.
  firstAccess: [{ route: "creel", milestone: "opening", craft: null, staging: null, origin: v(-5, 0, 1.6) }],
  replaces: [],
};

export const COLD_STORE: InteriorDef = {
  id: "island_cold_store", label: "Cold store", region: "island_chain", site: "island.cold_store_hatch",
  anchor: v(-232, 24, 3), quarter: 0,
  rooms: [
    { id: "passage", role: "passage", label: "Passage", falloff: 3, bounds: { min: v(-0.8, 0, 0), max: v(0.8, 2.4, 4) } },
    { id: "store", role: "chamber", label: "Store", falloff: 3, bounds: { min: v(-2.5, 0, 4), max: v(2.5, 2.4, 9) } },
  ],
  portals: [
    // LS-1's coded door: open once its code is typed on the keypad.
    { id: "keypad_door", kind: "door", label: "Cold store door", between: ["passage", OUTSIDE], center: v(0, 1.05, -0.15), normal: v(0, 0, -1), clear: { width: 1.2, height: 2.1 }, admits: ["diver"] },
    { id: "into_store", kind: "door", label: "Store", between: ["passage", "store"], center: v(0, 1.2, 3.85), normal: v(0, 0, 1), clear: { width: 1.6, height: 2.4 }, admits: ["diver"] },
    // The shaft on into OP-1's Under-Stair: a way on, not a way out.
    { id: "sump", kind: "sump", label: "Shaft", between: ["store", OUTSIDE], center: v(0, -0.3, 8.2), normal: v(0, -1, 0), clear: { width: 1.2, height: 1.2 }, admits: ["diver"] },
  ],
  staging: [],
  shell: [
    ...slab("floor", "floor", -2.8, 2.8, -0.3, 9.3, -0.3, 0, [{ x0: -0.6, x1: 0.6, z0: 7.6, z1: 8.8 }]),
    ...slab("ceiling", "ceiling", -2.8, 2.8, -0.3, 9.3, 2.4, 2.7),
    ...wall("door_wall", "x", -1.1, 1.1, -0.3, 0, 0, 2.4, [door(-0.6, 0.6)]),
    ...wall("passage_w", "z", 0, 4, -1.1, -0.8, 0, 2.4),
    ...wall("passage_e", "z", 0, 4, 0.8, 1.1, 0, 2.4),
    ...wall("store_s", "x", -2.8, 2.8, 3.7, 4, 0, 2.4, [{ a: -0.8, b: 0.8, y0: 0, y1: 2.4 }]),
    ...wall("store_w", "z", 4, 9.3, -2.8, -2.5, 0, 2.4),
    ...wall("store_e", "z", 4, 9.3, 2.5, 2.8, 0, 2.4),
    ...wall("store_n", "x", -2.8, 2.8, 9, 9.3, 0, 2.4),
    // A kerb round the shaft: you step over it on purpose, never fall in.
    { id: "kerb_s", module: "plinth", min: v(-0.75, 0, 7.45), max: v(0.75, 0.9, 7.6) },
    { id: "kerb_n", module: "plinth", min: v(-0.75, 0, 8.8), max: v(0.75, 0.9, 8.95) },
    { id: "kerb_w", module: "plinth", min: v(-0.75, 0, 7.6), max: v(-0.6, 0.9, 8.8) },
    { id: "kerb_e", module: "plinth", min: v(0.6, 0, 7.6), max: v(0.75, 0.9, 8.8) },
  ],
  dressing: [
    place("gauges_a", "gauge_rack", v(-2.3, 0, 5.5), 1, "structure"),
    place("gauges_b", "gauge_rack", v(-2.3, 0, 7.3), 1, "structure"),
    place("tubes", "tube_rack", v(2.3, 0, 5.5), 1, "structure"),
    place("crate_a", "crate", v(2.1, 0, 7.6)),
    place("crate_b", "crate", v(2.1, 0.6, 7.6)),
    place("sign", "sign", v(-0.79, 1.6, 1.5), 1),
  ],
  stacks: [],
  lights: [],
  sounds: [{ id: "breath", at: v(0, 0.4, 8.2), cue: "cold_store_shaft_breath", caption: "A slow, cold breath of air from a shaft ahead" }],
  hosts: [],
  // The code comes from the gauge line, after the Dart.
  firstAccess: [{ route: "creel", milestone: "isles", craft: null, staging: null, origin: v(0, 0, -2) }],
  replaces: [],
};
