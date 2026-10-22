import { EXTERIOR, type CaveSource } from "../caves.js";
import { brinePool, chamber, portal, room, route, shaft, terrace, tube, v, type DeepCave } from "./deepKit.js";

/** CA-3, Mirror Divide: brine pockets with mirror floors.
 *
 * Pale fractured cavities where dense water pools inside, each with its own
 * small mirror floor: trapped brine (`brinePool`, S4's layer shape with the
 * Divide's 1 m edge) in a basin a metre or more below every route, so the
 * pool is a lesson to read, never a toll. Brine skimmers skate just above
 * each pool. Every cave stays above the Divide's interface (BRINE_Y, -440)
 * except where a pool is authored, and every way out is clear water. */

const SKIMMER: readonly [number, number, number] = [0.78, 0.86, 1];
const LAVENDER: readonly [number, number, number] = [0.78, 0.63, 0.95];
const TEAL: readonly [number, number, number] = [0.38, 0.9, 0.82];
const AMBER: readonly [number, number, number] = [1, 0.71, 0.37];

// --- Mirror pocket (small, west flank network) ---------------------------------------

/** A pocket under a low pale mound on the crest, west of the gateworks. Its
 * floor dips to a small trapped pool; behind it a narrow crack drops 7 m to
 * a brine-floored choke where the seam's galleries will open (the bible's
 * back entrance: the cave-biome builder opens the choke). One ledge mouth to
 * the north. */
const MIRROR_SOURCE: CaveSource = {
  id: "divide_mirror_pocket",
  label: "Mirror pocket",
  region: "brine_divide",
  footprint: { minX: 388, maxX: 412, minZ: -1252, maxZ: -1228 },
  baseY: -371,
  topY: -344,
  terraces: [
    terrace("divide_mirror.terrace.lower", -349.5, [400, -1240.5], [8, 8], 2.4, 0.2, 0.4, 8),
    terrace("divide_mirror.terrace.upper", -346.5, [400, -1241], [6, 6], 2.2, 0.2, 0.3, 7),
  ],
  carves: [
    chamber("divide_mirror.carve.pocket", "divide_mirror.pocket", [400, -357.5, -1240], [5.5, 4.5, 3, 2.5], -360.5),
    chamber("divide_mirror.carve.pool", "divide_mirror.pool", [401, -361, -1240.5], [3.2, 2.6, 0.6, 1.8], -362.8, 0.25),
    tube("divide_mirror.carve.mouth", "divide_mirror.ledge", [[400, -1236, -359.5, 3.4, 3.2], [400, -1232, -357, 3.4, 3.2], [400, -1227, -355, 3.4, 3.2]]),
    shaft("divide_mirror.carve.crack", "divide_mirror.crack", [400.5, -1245.4], 1.45, 0, -367.5, -360, 0.15),
  ],
  blend: 1.1,
  rooms: [
    room("divide_mirror.ledge", "passage", "Ledge mouth", 8),
    room("divide_mirror.pocket", "chamber", "Mirror pocket", 8),
    room("divide_mirror.pool", "pocket", "Trapped pool", 6),
    room("divide_mirror.crack", "pocket", "Seam crack (choked)", 6),
  ],
  portals: [
    portal("divide_mirror.mouth.ledge", "mouth", "Ledge mouth", "divide_mirror.ledge", EXTERIOR, v(400, -355.4, -1232), "+z", 2.2, 2.2),
    portal("divide_mirror.throat.crack", "throat", "Seam crack", "divide_mirror.pocket", "divide_mirror.crack", v(400.5, -361, -1245.2), "-y", 1.2, 1.2),
  ],
  routes: [
    route("divide_mirror.route.rim", "diver", "exit", [
      [403.5, -358.4, -1238], [400, -357.4, -1236], [400, -356.4, -1234], [400, -354.87, -1230], [400, -354.5, -1228], [400, -354.5, -1226],
    ]),
    route("divide_mirror.route.crack", "diver", "exit", [
      [400.5, -364.3, -1245.2], [400.5, -361.86, -1245.2], [400, -356.39, -1234], [400, -354.85, -1229], [400, -354.5, -1227], [400, -354.5, -1226],
    ]),
  ],
  staging: [
    { id: "divide_mirror.parking", role: "craft_parking", label: "Crest parking north of the mirror pocket", position: v(400, -353.5, -1218), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 small. The whole boundary lesson in 15 m: a pool to read, skimmers on its edge, and a crack where the seam's brine will open.",
};

const MIRROR: DeepCave = {
  source: MIRROR_SOURCE, bible: ["divide_mirror_pocket"], size: "small", style: "brine_pocket",
  exits: { "ledge mouth": "divide_mirror.mouth.ledge" },
  contents: [
    { id: "divide_mirror.cress", kind: "seed", bible: { kind: "resource", id: "divide_pocket_cress" }, room: "divide_mirror.pocket",
      at: v(404.2, -360.2, -1238.6), item: "seed_mirror_cress", stock: 3, read: "Cress on the pool rim; it tears unless sampled gently." },
    { id: "divide_mirror.rim", kind: "scan", bible: { kind: "line", cave: "divide_mirror_pocket", line: "A pool rim to read" }, room: "divide_mirror.pool",
      at: v(401, -361.3, -1240.5), read: "Lavender crystal on the rim, black water below the sheen: dense water never mixes upward." },
    { id: "divide_mirror.seam_link", kind: "shortcut", bible: { kind: "link", cave: "divide_mirror_pocket", id: "rift_divide_seam.pocket_drop" }, room: "divide_mirror.crack",
      at: v(400.5, -367, -1245.2), read: "The crack's floor is brine and rubble: the seam's galleries lie beyond (back entrance, opened by the cave biome)." },
  ],
  cues: [
    { id: "divide_mirror.cue.skimmers", species: "brine_skimmer", kind: "pool_edge", room: "divide_mirror.pool", meaning: "dense_water", color: SKIMMER,
      points: [v(398.2, -360.9, -1240.5), v(401, -360.9, -1238.2), v(403.8, -360.9, -1240.5)], read: "Skimmers skate just above the pool: dense water lies under them." },
    { id: "divide_mirror.cue.crack", species: "brine_skimmer", kind: "pool_edge", room: "divide_mirror.crack", meaning: "dense_water", color: SKIMMER,
      points: [v(399.6, -366.2, -1245.2), v(401.4, -366.2, -1245.2)], read: "Two skimmers hold over the crack's floor: brine below." },
    { id: "divide_mirror.cue.ledge", kind: "colony", room: "divide_mirror.ledge", meaning: "exit", exit: "divide_mirror.mouth.ledge", color: TEAL,
      points: [v(398.4, -356.5, -1234), v(401.6, -356.5, -1234)], read: "Teal colonies inside the ledge mouth." },
  ],
  hazards: [
    brinePool("divide_mirror_pocket.brine.pool", "divide_mirror_pocket", "divide_saddle", 397.5, 404.5, -1243.5, -1237.5, -361.5,
      "A mirror sheen a metre below the pocket's rim; skimmers skate over it."),
    brinePool("divide_mirror_pocket.brine.crack", "divide_mirror_pocket", "divide_saddle", 398.8, 402.2, -1247.1, -1243.7, -366,
      "The crack's floor shines: the seam's brine has seeped up into the choke."),
  ],
};

// --- Crest hollow (small) -----------------------------------------------------------------

/** Behind the crest on the lee side: a hollow under a low mound, its mouth
 * facing north out of the downwelling. A film of brine in a floor crack at
 * the back. */
const HOLLOW_SOURCE: CaveSource = {
  id: "divide_crest_hollow",
  label: "Crest hollow",
  region: "brine_divide",
  footprint: { minX: 678, maxX: 702, minZ: -1222, maxZ: -1198 },
  baseY: -376,
  topY: -353,
  terraces: [terrace("divide_hollow.terrace.mound", -356, [690, -1211], [7.5, 7], 2.4, 0.2, 0.4, 8)],
  carves: [
    chamber("divide_hollow.carve.hollow", "divide_hollow.hollow", [690, -365, -1212.5], [5, 4, 2.8, 2.2], -367),
    chamber("divide_hollow.carve.film", "divide_hollow.film", [690, -367.6, -1215], [2, 1.2, 0.4, 1], -368.6, 0.2),
    tube("divide_hollow.carve.mouth", "divide_hollow.mouth_passage", [[690, -1208.5, -366.5, 3.2, 3], [690, -1203.5, -367.4, 3.2, 3], [690, -1198, -369.6, 3.2, 3]]),
  ],
  blend: 1.1,
  rooms: [
    room("divide_hollow.hollow", "chamber", "Crest hollow", 8),
    room("divide_hollow.film", "pocket", "Film crack", 6),
    room("divide_hollow.mouth_passage", "passage", "Lee mouth", 8),
  ],
  portals: [
    portal("divide_hollow.mouth.lee", "mouth", "Crest mouth (lee side)", "divide_hollow.mouth_passage", EXTERIOR, v(690, -366, -1203.5), "+z", 2, 1.8),
  ],
  routes: [
    route("divide_hollow.route.exit", "diver", "exit", [
      [690, -366.4, -1214], [690, -366.4, -1203.5], [690, -367.4, -1199.75], [690, -369.9, -1196],
    ]),
  ],
  staging: [
    { id: "divide_hollow.parking", role: "craft_parking", label: "Lee parking below the crest hollow", position: v(690, -370.5, -1190), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 small. Still water a stroke from the crest current; a film of brine in the back crack.",
};

const HOLLOW: DeepCave = {
  source: HOLLOW_SOURCE, bible: ["divide_crest_hollow"], size: "small", style: "brine_pocket",
  exits: { "crest mouth": "divide_hollow.mouth.lee" },
  contents: [
    { id: "divide_hollow.shelter", kind: "shelter", bible: { kind: "reward", id: "divide.crest_shelter" }, room: "divide_hollow.hollow",
      at: v(690, -366.3, -1212), read: "Still water: the ribbons outside lean south, the silt in here hangs." },
  ],
  cues: [
    { id: "divide_hollow.cue.film", species: "brine_skimmer", kind: "pool_edge", room: "divide_hollow.film", meaning: "dense_water", color: SKIMMER,
      points: [v(688.5, -367.3, -1215), v(691.5, -367.3, -1215)], read: "A pair of skimmers over the back crack: a film of brine." },
    { id: "divide_hollow.cue.mouth", kind: "colony", room: "divide_hollow.mouth_passage", meaning: "exit", exit: "divide_hollow.mouth.lee", color: AMBER,
      points: [v(688.6, -366, -1206), v(691.4, -366, -1206)], read: "Amber colonies inside the lee mouth." },
  ],
  hazards: [
    brinePool("divide_crest_hollow.brine.film", "divide_crest_hollow", "divide_saddle", 688, 692, -1216.2, -1213.8, -368,
      "A thin mirror in the floor crack at the back of the hollow."),
  ],
};

// --- East pocket (small): two mirrors, one above the other ---------------------------------

/** In the step wall east of the crest: a lower chamber at the wall foot with
 * its pool, and 8 m up a short shaft an upper chamber with its own pool.
 * Two mirrors, one above the other: brine sits where it is trapped, not at
 * one level. */
const EAST_SOURCE: CaveSource = {
  id: "divide_east_pocket",
  label: "East pocket",
  region: "brine_divide",
  footprint: { minX: 782, maxX: 822, minZ: -1247, maxZ: -1223 },
  baseY: -405,
  topY: -362,
  terraces: [],
  carves: [
    tube("divide_east.carve.mouth", "divide_east.mouth_passage", [[808, -1235, -399.4, 3.4, 3.2], [803, -1235, -399.5, 3.4, 3.2], [800, -1235, -399.5, 3.6, 3.2]]),
    chamber("divide_east.carve.lower", "divide_east.lower", [797, -397.5, -1235], [4.5, 4, 2.6, 2], -399.5),
    chamber("divide_east.carve.lower_pool", "divide_east.lower_pool", [796, -399.8, -1235.5], [2.6, 2.4, 0.5, 1.5], -401.3, 0.2),
    shaft("divide_east.carve.shaft", "divide_east.shaft", [793.5, -1236], 1.4, 0, -398, -389.5, 0.2),
    chamber("divide_east.carve.upper", "divide_east.upper", [790.5, -389, -1235], [3.6, 3.4, 2.4, 1.8], -390.8),
    chamber("divide_east.carve.upper_pool", "divide_east.upper_pool", [789.5, -391.2, -1234.5], [2.2, 2, 0.4, 1.4], -392.6, 0.2),
  ],
  blend: 1,
  rooms: [
    room("divide_east.mouth_passage", "passage", "Flank mouth", 8),
    room("divide_east.lower", "chamber", "Lower pocket", 8),
    room("divide_east.lower_pool", "pocket", "Lower mirror", 6),
    room("divide_east.shaft", "shaft", "Climb", 8),
    room("divide_east.upper", "chamber", "Upper pocket", 8),
    room("divide_east.upper_pool", "pocket", "Upper mirror", 6),
  ],
  portals: [
    portal("divide_east.mouth.flank", "mouth", "Flank mouth", "divide_east.mouth_passage", EXTERIOR, v(805, -398, -1235), "+x", 2.2, 2.2),
    portal("divide_east.throat.shaft", "throat", "Climb", "divide_east.lower", "divide_east.shaft", v(793.5, -394, -1236), "+y", 1.2, 1.2),
  ],
  routes: [
    route("divide_east.route.lower", "diver", "exit", [
      [798.5, -399.4, -1233], [799.75, -398.88, -1234], [809, -398.4, -1235], [811, -398.4, -1235],
    ]),
    route("divide_east.route.upper", "diver", "exit", [
      [791.5, -390.4, -1233.5], [793, -390.4, -1235], [793.5, -393.4, -1236], [795.83, -400.37, -1236], [799.67, -398.9, -1235.33], [808, -398.37, -1235],
      [811, -398.37, -1235],
    ]),
  ],
  staging: [
    { id: "divide_east.parking", role: "craft_parking", label: "Flank parking east of the pocket", position: v(828, -395.4, -1236), radius: 5, profiles: ["small"] },
  ],
  note: "CA-3 small. Two pools at two levels: the scan that explains layering.",
};

const EAST: DeepCave = {
  source: EAST_SOURCE, bible: ["divide_east_pocket"], size: "small", style: "brine_pocket",
  exits: { "flank mouth": "divide_east.mouth.flank" },
  contents: [
    { id: "divide_east.layering", kind: "scan", bible: { kind: "line", cave: "divide_east_pocket", line: "A scan that explains layering" }, room: "divide_east.upper",
      at: v(789.5, -390.5, -1234.5), read: "Two mirrors 8 m apart: brine sits where rock traps it, so a layer's height tells nothing about the next one." },
  ],
  cues: [
    { id: "divide_east.cue.lower", species: "brine_skimmer", kind: "pool_edge", room: "divide_east.lower_pool", meaning: "dense_water", color: SKIMMER,
      points: [v(794, -400.2, -1235.5), v(798, -400.2, -1235.5)], read: "Skimmers over the lower mirror." },
    { id: "divide_east.cue.upper", species: "brine_skimmer", kind: "pool_edge", room: "divide_east.upper_pool", meaning: "dense_water", color: SKIMMER,
      points: [v(788, -391.4, -1234.5), v(791, -391.4, -1234.5)], read: "And skimmers over the upper one." },
    { id: "divide_east.cue.mouth", kind: "colony", room: "divide_east.mouth_passage", meaning: "exit", exit: "divide_east.mouth.flank", color: TEAL,
      points: [v(803, -398, -1233.4), v(803, -398, -1236.6)], read: "Teal colonies inside the flank mouth." },
    { id: "divide_east.cue.shaft", kind: "glimmer", room: "divide_east.shaft", meaning: "exit", exit: "divide_east.mouth.flank", color: TEAL,
      points: [v(794.7, -391, -1236), v(794.7, -397, -1236)], read: "Teal glimmers down the climb: the way out is below." },
  ],
  hazards: [
    brinePool("divide_east_pocket.brine.lower", "divide_east_pocket", "divide_saddle", 793.4, 798.6, -1237.9, -1233.1, -400.6,
      "The lower mirror, a metre under the pocket's floor."),
    brinePool("divide_east_pocket.brine.upper", "divide_east_pocket", "divide_saddle", 787.3, 791.7, -1236.5, -1232.5, -391.8,
      "The upper mirror, eight metres higher, trapped in its own basin."),
  ],
};

// --- Lee burrow (small) ---------------------------------------------------------------------

/** A short burrow into a low mound on the lee shelf, 28 m west of the lee
 * mooring's nearest pylon: a quiet rest pocket with picker tracks. Dry of
 * brine; the shelf is north of the ridge. */
const BURROW_SOURCE: CaveSource = {
  id: "divide_lee_burrow",
  label: "Lee burrow",
  region: "brine_divide",
  footprint: { minX: 456, maxX: 482, minZ: -1097, maxZ: -1073 },
  baseY: -397,
  topY: -383,
  terraces: [terrace("divide_burrow.terrace.mound", -385, [467, -1085.5], [7.5, 7], 2.4, 0.2, 0.4, 8)],
  carves: [
    tube("divide_burrow.carve.burrow", "divide_burrow.burrow", [
      [482, -1085, -391.2, 3.4, 3], [477, -1085, -391.8, 3.4, 3], [472, -1085.5, -393, 3.6, 3.2], [468.5, -1085.5, -393.6, 3.8, 3.2],
    ]),
    chamber("divide_burrow.carve.rest", "divide_burrow.rest", [465.5, -392.4, -1085.5], [3, 3, 2, 1.8], -394),
  ],
  blend: 1.1,
  rooms: [room("divide_burrow.burrow", "passage", "Burrow", 7), room("divide_burrow.rest", "pocket", "Rest pocket", 6)],
  portals: [portal("divide_burrow.mouth.shelf", "mouth", "Shelf mouth", "divide_burrow.burrow", EXTERIOR, v(476.5, -390.1, -1085), "+x", 2.2, 2.2)],
  routes: [route("divide_burrow.route.exit", "diver", "exit", [
      [463.5, -393.4, -1086], [476.38, -390.86, -1085.24], [480, -390.2, -1085], [484, -390.2, -1085],
    ])],
  staging: [
    { id: "divide_burrow.parking", role: "craft_parking", label: "Shelf parking by the lee burrow", position: v(492, -389.5, -1085), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 small. A rest pocket a short swim from the mooring; no hazard inside.",
};

const BURROW: DeepCave = {
  source: BURROW_SOURCE, bible: ["divide_lee_burrow"], size: "small", style: "brine_pocket",
  exits: { "shelf mouth": "divide_burrow.mouth.shelf" },
  contents: [
    { id: "divide_burrow.rest", kind: "shelter", bible: { kind: "line", cave: "divide_lee_burrow", line: "Quiet rest pocket beside the mooring" }, room: "divide_burrow.rest",
      at: v(465.5, -393.4, -1085.5), read: "Picker tracks on the floor and nothing else: a quiet place to wait out a timer." },
  ],
  cues: [
    { id: "divide_burrow.cue.mouth", kind: "colony", room: "divide_burrow.burrow", meaning: "exit", exit: "divide_burrow.mouth.shelf", color: TEAL,
      points: [v(474, -390.6, -1083.4), v(474, -390.6, -1086.6)], read: "Teal colonies inside the shelf mouth." },
    { id: "divide_burrow.cue.skimmer", species: "brine_skimmer", kind: "glimmer", room: "divide_burrow.rest", meaning: "resident", color: SKIMMER,
      points: [v(464.5, -393.2, -1084.5), v(466.5, -393.2, -1086.5)], read: "A lone skimmer rests on the dry floor: no dense water here." },
  ],
  hazards: [],
};

// --- Fissure window (small) -------------------------------------------------------------------

/** In the fissure's north wall, 12 m above the interface: a chamber behind a
 * south-facing mouth, and a narrow window passage that drops to an opening
 * 3.5 m above the mirror, looking down onto the skate's water. */
const WINDOW_SOURCE: CaveSource = {
  id: "divide_fissure_window",
  label: "Fissure window",
  region: "brine_divide",
  footprint: { minX: 533, maxX: 557, minZ: -1336, maxZ: -1316 },
  baseY: -452,
  topY: -397,
  terraces: [],
  carves: [
    chamber("divide_window.carve.room", "divide_window.room", [545, -425.5, -1321.5], [5.5, 4, 2.8, 2.2], -427.7),
    tube("divide_window.carve.mouth", "divide_window.mouth_passage", [[545, -1324.5, -427.5, 3.4, 3.2], [545, -1329, -428, 3.4, 3.2], [545, -1334, -428.5, 3.4, 3.2]]),
    tube("divide_window.carve.window_link", "divide_window.window", [[547, -1323, -427.2, 2.6, 2.6], [550.5, -1325, -427.6, 2.6, 2.6]], 0.15),
    shaft("divide_window.carve.window_drop", "divide_window.window", [550.5, -1325.2], 1.3, 0, -436.5, -426.5, 0.15),
    tube("divide_window.carve.window", "divide_window.window", [[550.5, -1325.2, -436.4, 2.4, 2.4], [550.5, -1330, -436.2, 2.4, 2.4], [550.5, -1335, -436, 2.4, 2.4]], 0.15),
  ],
  blend: 1.1,
  rooms: [
    room("divide_window.room", "chamber", "Window room", 8),
    room("divide_window.mouth_passage", "passage", "Fissure mouth", 8),
    room("divide_window.window", "passage", "Window", 6),
  ],
  portals: [
    portal("divide_window.mouth.fissure", "mouth", "Fissure mouth", "divide_window.mouth_passage", EXTERIOR, v(545, -426.3, -1328.5), "-z", 2.2, 2),
    portal("divide_window.mouth.window", "mouth", "Window", "divide_window.window", EXTERIOR, v(550.5, -435, -1331.8), "-z", 1.4, 1.4),
  ],
  routes: [
    route("divide_window.route.mouth", "diver", "exit", [
      [542, -426.4, -1320], [543.5, -426.4, -1321], [545, -426.9, -1327], [545, -427.4, -1330.75], [545, -429.95, -1336],
    ]),
    route("divide_window.route.window", "diver", "exit", [
      [546, -427.4, -1322], [549.88, -427.4, -1324.78], [550.5, -429.2, -1325.2], [550.5, -435.86, -1326.16], [550.5, -435.37, -1328.08], [550.5, -435.4, -1334],
      [550.5, -435.88, -1335], [550.5, -438, -1336],
    ]),
  ],
  staging: [],
  note: "CA-3 small. A safe view of the skate's water; the window opening is 3.5 m above the mirror and never below it.",
};

const WINDOW: DeepCave = {
  source: WINDOW_SOURCE, bible: ["divide_fissure_window"], size: "small", style: "brine_pocket",
  exits: { "fissure mouth": "divide_window.mouth.fissure", "window": "divide_window.mouth.window" },
  contents: [
    { id: "divide_window.view", kind: "view", bible: { kind: "line", cave: "divide_fissure_window", line: "View of the skate's water from safety" }, room: "divide_window.window",
      at: v(550.5, -435.6, -1330), read: "Through the window: the mirror 3 m below, and the skate's shadow sliding under it." },
  ],
  cues: [
    { id: "divide_window.cue.mouth", kind: "colony", room: "divide_window.mouth_passage", meaning: "exit", exit: "divide_window.mouth.fissure", color: TEAL,
      points: [v(543.4, -426.5, -1326), v(546.6, -426.5, -1326)], read: "Teal colonies inside the fissure mouth." },
    { id: "divide_window.cue.window", kind: "glimmer", room: "divide_window.window", meaning: "exit", exit: "divide_window.mouth.window", color: LAVENDER,
      points: [v(551.6, -429, -1325.2), v(551.6, -435, -1325.2)], read: "Lavender crystal lines the window shaft down to the opening." },
    { id: "divide_window.cue.skimmers", species: "brine_skimmer", kind: "glimmer", room: "divide_window.window", meaning: "dense_water", color: SKIMMER,
      points: [v(549.5, -437.5, -1334.5), v(551.5, -437.5, -1334.5)], read: "Skimmers hold just outside the window, over the interface below." },
  ],
  hazards: [],
};

// --- Lintel galleries (medium) ------------------------------------------------------------------

/** Inside a pale mound on the crest east of the gateworks: the crest mouth
 * opens north into the natural west gallery, which runs south to the cut
 * service bay; the bay opens east into the east gallery and out the
 * south-face mouth. A diver cable crawl behind the bay joins the two
 * galleries and closes the loop. A sheltered crest crossing for a Creel. */
const LINTEL_SOURCE: CaveSource = {
  id: "divide_lintel_galleries",
  label: "Lintel galleries",
  region: "brine_divide",
  footprint: { minX: 686, maxX: 754, minZ: -1300, maxZ: -1228 },
  baseY: -375,
  topY: -339,
  terraces: [
    terrace("divide_lintel.terrace.mound", -345, [720, -1263], [28, 27.5], 5, 0.2, 0.5, 14),
    terrace("divide_lintel.terrace.crown", -341.5, [720, -1263], [21, 21], 3.5, 0.2, 0.4, 12),
  ],
  carves: [
    tube("divide_lintel.carve.west", "divide_lintel.west_gallery", [
      [705, -1224, -355.2, 13, 8], [705, -1236, -357.4, 13, 8], [705, -1250, -359.5, 13, 8], [705, -1266, -361.5, 13, 8], [705, -1274, -362.3, 13, 8],
    ]),
    tube("divide_lintel.carve.bay", "divide_lintel.service_bay", [[703, -1278, -362.5, 15, 9], [737, -1278, -362.5, 15, 9]]),
    tube("divide_lintel.carve.east", "divide_lintel.east_gallery", [
      [735, -1250, -360.5, 13, 8], [735, -1264, -361.5, 13, 8], [735, -1274, -362.3, 13, 8], [735, -1286, -362.6, 13, 8], [735, -1302, -362.8, 13, 8],
    ]),
    tube("divide_lintel.carve.crawl", "divide_lintel.cable_crawl", [[710, -1252, -358.6, 3.2, 3], [720, -1252, -359, 3.2, 3], [730, -1252, -359.6, 3.2, 3]], 0.15),
  ],
  blend: 1.6,
  rooms: [
    room("divide_lintel.west_gallery", "passage", "West gallery", 14),
    room("divide_lintel.service_bay", "chamber", "Service bay", 14),
    room("divide_lintel.east_gallery", "passage", "East gallery", 14),
    room("divide_lintel.cable_crawl", "passage", "Cable crawl", 10),
  ],
  portals: [
    portal("divide_lintel.mouth.crest", "mouth", "Crest mouth", "divide_lintel.west_gallery", EXTERIOR, v(705, -354.4, -1234), "+z", 10, 4.8, ["diver", "medium"]),
    portal("divide_lintel.mouth.south", "mouth", "South-face mouth", "divide_lintel.east_gallery", EXTERIOR, v(735, -359.6, -1292.5), "-z", 10, 4.8, ["diver", "medium"]),
  ],
  routes: [
    route("divide_lintel.route.crossing", "medium", "loop", [
      [705, -357.4, -1218], [705, -356.37, -1221], [705, -356.33, -1233], [705, -357.3, -1244.4], [705, -359.27, -1258], [705, -360.27, -1266],
      [705.6, -361.3, -1273.2], [708.8, -362.28, -1278], [720, -362.26, -1278], [732, -362.28, -1278], [735, -362.27, -1283], [735, -362.26, -1296.57],
      [735, -362.29, -1299.43], [735, -364.27, -1308],
    ]),
    route("divide_lintel.route.crawl", "diver", "loop", [
      [705, -358.9, -1220], [705, -356.9, -1225.71], [705, -356.9, -1237.14], [705, -356.9, -1240], [710, -358.4, -1252], [722.5, -358.4, -1252],
      [725, -358.4, -1252], [730, -358.9, -1252], [735, -360.85, -1264.73], [735, -360.85, -1267.64], [735, -362.36, -1279.27], [735, -361.9, -1285.09],
      [735, -361.87, -1297], [735, -363.87, -1306],
    ]),
  ],
  staging: [
    { id: "divide_lintel.parking", role: "craft_parking", label: "Crest parking north of the lintel galleries", position: v(705, -354, -1216), radius: 9, profiles: ["small", "medium"] },
  ],
  note: "CA-3 medium. Loop: west gallery - service bay - east gallery - cable crawl. Hall: Creel 450/800 and Mantle (medium profile); " +
    "keel above 362 m, below the Dart's 350 m rating, so the Dart is not listed.",
};

const LINTEL: DeepCave = {
  source: LINTEL_SOURCE, bible: ["divide_lintel_galleries"], size: "medium", style: "brine_pocket",
  exits: { "crest mouth": "divide_lintel.mouth.crest", "south-face mouth": "divide_lintel.mouth.south" },
  hall: { profile: "medium", craft: ["creel", "mantle", "hush"],
    note: "Keel 355-362 m: the Creel's 450 m refit, the Mantle and (small, optional) the Hush; the Dart's 350 m limit is too shallow." },
  graph: {
    chambers: { "west gallery": ["divide_lintel.west_gallery"], "service bay": ["divide_lintel.service_bay"], "east gallery": ["divide_lintel.east_gallery"] },
    loopCloser: { passage: "cable_crawl", rooms: ["divide_lintel.cable_crawl"] },
  },
  contents: [
    { id: "divide_lintel.dock_frame", kind: "cache", bible: { kind: "reward", id: "divide.dock_frame" }, room: "divide_lintel.service_bay",
      at: v(726, -361.8, -1284), read: "Tagged repair stock racked against the bay's cut wall: six alloy and two glass." },
    { id: "divide_lintel.crossing", kind: "shortcut", bible: { kind: "line", cave: "divide_lintel_galleries", line: "A sheltered crest crossing" },
      room: "divide_lintel.west_gallery", at: v(705, -358, -1250), read: "Crest to south face without riding the downwelling." },
  ],
  cues: [
    { id: "divide_lintel.cue.crest", kind: "colony", room: "divide_lintel.west_gallery", meaning: "exit", exit: "divide_lintel.mouth.crest", color: AMBER,
      points: [v(699.5, -355, -1238), v(710.5, -355, -1238)], read: "Amber colonies frame the crest mouth from inside." },
    { id: "divide_lintel.cue.south", kind: "colony", room: "divide_lintel.east_gallery", meaning: "exit", exit: "divide_lintel.mouth.south", color: TEAL,
      points: [v(729.5, -360, -1289), v(740.5, -360, -1289)], read: "Teal colonies frame the south-face mouth." },
    { id: "divide_lintel.cue.crawl", species: "brine_skimmer", kind: "glimmer", room: "divide_lintel.cable_crawl", meaning: "resident", color: LAVENDER,
      points: [v(710, -357.5, -1252), v(728, -358, -1252)], read: "Lavender crystal along the old cable run; the crawl is dry of brine." },
  ],
  hazards: [],
};

// --- Brine cistern (medium) ---------------------------------------------------------------------

/** In the east flank north of the brine field, where the 450 m contour runs
 * in clear water (the bible footprint lay across the bench route and its
 * 450 m rim inside the brine field). The crest mouth opens on the flank into
 * the north rim; a Creel runs west along it to the landing, south through
 * the south way and east along the south rim, over a sunken lake whose
 * floor is a trapped brine pool. Rich lattice grows on the lake's rim at
 * 450 m, a metre above the mirror. A diver back gallery leaves the south rim
 * for the south-face mouth. */
const CISTERN_SOURCE: CaveSource = {
  id: "divide_brine_cistern",
  label: "Brine cistern",
  region: "brine_divide",
  footprint: { minX: 882, maxX: 916, minZ: -1270, maxZ: -1228 },
  baseY: -469,
  topY: -359,
  terraces: [],
  carves: [
    tube("divide_cistern.carve.mouth", "divide_cistern.north_rim", [[922, -1238, -446, 11.5, 7.5], [900, -1238, -446.5, 11.5, 7.5]]),
    chamber("divide_cistern.carve.north_rim", "divide_cistern.north_rim", [896, -444.5, -1244], [10, 10, 6.5, 9], -453.5),
    chamber("divide_cistern.carve.south_rim", "divide_cistern.south_rim", [896, -444.5, -1254], [10, 10, 6.5, 9], -453.5),
    chamber("divide_cistern.carve.landing", "divide_cistern.west_landing", [887.5, -447, -1249], [3, 6, 3.5, 3], -450),
    tube("divide_cistern.carve.back", "divide_cistern.back_gallery", [[903, -1261, -447, 3.2, 3], [908, -1263.5, -446, 3.2, 3], [915, -1265, -445.4, 3.2, 3]], 0.15),
  ],
  blend: 1.6,
  rooms: [
    room("divide_cistern.north_rim", "chamber", "North rim", 16),
    room("divide_cistern.south_rim", "chamber", "South rim", 16),
    room("divide_cistern.west_landing", "pocket", "West landing", 14),
    room("divide_cistern.back_gallery", "passage", "Back gallery", 10),
  ],
  portals: [
    portal("divide_cistern.mouth.crest", "mouth", "Crest mouth (flank)", "divide_cistern.north_rim", EXTERIOR, v(913, -443.2, -1238), "+x", 10, 4.8, ["diver", "medium"]),
    portal("divide_cistern.mouth.south", "mouth", "South-face mouth (flank)", "divide_cistern.back_gallery", EXTERIOR, v(909.5, -444.6, -1264), "+x", 1.6, 1.6),
  ],
  routes: [
    route("divide_cistern.route.hall", "medium", "exit", [
      [896, -449.2, -1255], [899, -446.3, -1241.5], [902, -445.78, -1239], [914, -445.76, -1238], [918, -445.8, -1238], [920, -446.29, -1238],
      [926, -448.2, -1238],
    ]),
    route("divide_cistern.route.back", "diver", "exit", [
      [900, -450.04, -1257], [903.5, -445.87, -1260.62], [906.38, -445.38, -1262.43], [911.5, -445.39, -1264.25], [920, -449.24, -1265],
    ]),
    route("divide_cistern.route.lattice", "diver", "exit", [
      [887.5, -449.9, -1249], [888.88, -449.9, -1248.25], [899.99, -450.94, -1241.45], [903.33, -446.37, -1239.33], [905, -445.86, -1239], [910, -445.4, -1238],
      [914, -445.4, -1238], [922, -449.6, -1238],
    ]),
  ],
  staging: [
    { id: "divide_cistern.parking", role: "craft_parking", label: "Flank station-keeping off the crest mouth", position: v(926, -444, -1238), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 medium. A lake inside a cave: the craft ring runs over a brine pool whose rim holds lattice at exactly 450 m. " +
    "Hall: Creel (450/800) and Mantle; keel above 447 m.",
};

const CISTERN: DeepCave = {
  source: CISTERN_SOURCE, bible: ["divide_brine_cistern"], size: "medium", style: "brine_pocket",
  exits: { "crest mouth": "divide_cistern.mouth.crest", "south-face mouth": "divide_cistern.mouth.south" },
  hall: { profile: "medium", craft: ["creel", "mantle", "hush"],
    note: "Keel above 447 m: inside the Creel's 450 m refit; the Mantle (800) and the optional Hush (450) also fit." },
  graph: {
    chambers: { "west landing": ["divide_cistern.west_landing"], "north rim": ["divide_cistern.north_rim"], "south rim": ["divide_cistern.south_rim"],
      "back gallery": ["divide_cistern.back_gallery"] },
    // The bible's ↺ is the south way from the south rim back to the landing:
    // without the landing's contact the rims only meet each other.
    loopCloser: { passage: "south_way", rooms: ["divide_cistern.west_landing"] },
  },
  contents: [
    { id: "divide_cistern.lattice", kind: "resource", bible: { kind: "resource", id: "divide_cistern_lattice" }, room: "divide_cistern.west_landing",
      at: v(887.5, -450, -1249), item: "brine_lattice", stock: 16, read: "Crystal fans round the lake's west rim at 450 m, a metre above the mirror." },
    { id: "divide_cistern.lake_view", kind: "view", bible: { kind: "reward", id: "divide.cistern_lake" }, room: "divide_cistern.north_rim",
      at: v(902, -448, -1246), read: "A mirror lake inside the cave, skimmers fanning over it." },
  ],
  cues: [
    { id: "divide_cistern.cue.skimmers", species: "brine_skimmer", kind: "pool_edge", room: "divide_cistern.north_rim", meaning: "dense_water", color: SKIMMER,
      points: [v(898, -450.4, -1243), v(905, -450.4, -1249), v(898, -450.4, -1255)], read: "Skimmers fan over the lake and resettle on the same pool." },
    { id: "divide_cistern.cue.crest", kind: "colony", room: "divide_cistern.north_rim", meaning: "exit", exit: "divide_cistern.mouth.crest", color: TEAL,
      points: [v(909, -444, -1232), v(909, -444, -1242)], read: "Teal colonies frame the crest mouth from inside." },
    { id: "divide_cistern.cue.south", kind: "glimmer", room: "divide_cistern.back_gallery", meaning: "exit", exit: "divide_cistern.mouth.south", color: AMBER,
      points: [v(904, -445, -1263), v(908.5, -444.5, -1264)], read: "Amber glimmers lead along the back gallery to the south-face mouth." },
  ],
  hazards: [
    brinePool("divide_brine_cistern.brine.lake", "divide_brine_cistern", "divide_saddle", 886, 908.5, -1264.5, -1233.5, -451,
      "The lake's floor is a mirror at 451 m; the rim and the rings above it stay clear."),
  ],
};

export const DIVIDE_CAVES: readonly DeepCave[] = [MIRROR, HOLLOW, EAST, BURROW, WINDOW, LINTEL, CISTERN];
