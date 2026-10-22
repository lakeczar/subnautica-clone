import { EXTERIOR, type CaveSource } from "../caves.js";
import { chamber, heatBox, heatVent, portal, room, route, shaft, terrace, tube, v, type CaveHazard, type DeepCave } from "./deepKit.js";

/** CA-3, Ember Rift: lava tubes that breathe heat.
 *
 * Round black-glass tubes with ropy floors. Cool tubes on the shoulders are
 * silent; warm ones glow through their cracks and breathe heat on the
 * `KILN_BREATH` clock, and kiln crawlers file into the cracks before each
 * breath. Heat lives in named fields over a warm end only, never over a
 * whole cave, and every warm cave keeps a cool way out. */

const EMBER: readonly [number, number, number] = [1, 0.48, 0.16];
const CRAWLER: readonly [number, number, number] = [0.93, 0.86, 0.72];
const TEAL: readonly [number, number, number] = [0.38, 0.9, 0.82];
const AMBER: readonly [number, number, number] = [1, 0.71, 0.37];

// --- North shoulder network (rift_tube_north + rift_shoulder_crawl) ---------------

/** One footprint owns the whole network, crawl and tube (the bible's two
 * footprints were 26 m apart across the shoulder cliff, and the root kit has
 * no seam policy). The crawl leaves a low mound on the 287 m shoulder, drops
 * down a 28 m shaft inside the cliff and runs east as the cool north tube
 * under a lava ridge to its own mouth on the 314 m bench. Two exits: the
 * diver can always turn back the way they came. */
const NORTH_SOURCE: CaveSource = {
  id: "rift_north_shoulder",
  label: "North shoulder tube and crawl",
  region: "thermal_rift",
  footprint: { minX: -124, maxX: -54, minZ: -808, maxZ: -782 },
  baseY: -320,
  topY: -279,
  terraces: [
    terrace("rift_north.terrace.mound", -281, [-110, -795], [9.5, 7.5], 2.4, 0.2, 0.4, 8),
    terrace("rift_north.terrace.ridge", -306, [-76, -795], [18, 6.5], 3, 0.15, 0.5, 10),
  ],
  carves: [
    tube("rift_north.carve.crawl", "rift_north.crawl", [[-127, -795, -286.8, 3, 3], [-117, -795, -287.4, 3, 3], [-106.5, -795, -287.5, 3, 3]], 0.2),
    shaft("rift_north.carve.shaft", "rift_north.shaft", [-106.5, -795], 1.5, 0, -316, -285, 0.2),
    tube("rift_north.carve.tube", "rift_north.tube", [
      [-106.5, -795, -316.5, 4, 4], [-92, -796, -318, 5, 4.5], [-82, -796, -317.5, 5, 4.5], [-68, -795, -315.5, 5, 4.5],
      [-60, -794, -314.5, 5.5, 4.5], [-51, -794, -314, 5.5, 4.5],
    ]),
  ],
  blend: 1.2,
  rooms: [
    room("rift_north.crawl", "passage", "Shoulder crawl", 10),
    room("rift_north.shaft", "shaft", "Cliff shaft", 14),
    room("rift_north.tube", "passage", "North tube", 14),
  ],
  portals: [
    portal("rift_north.mouth.ledge", "mouth", "Ledge mouth (shoulder crawl)", "rift_north.crawl", EXTERIOR, v(-118.5, -286.2, -795), "-x", 1.8, 1.9),
    portal("rift_north.mouth.shoulder", "mouth", "Shoulder mouth (north tube)", "rift_north.tube", EXTERIOR, v(-57.5, -312.2, -794), "+x", 3.4, 3),
    portal("rift_north.throat.shaft_top", "throat", "Shaft top", "rift_north.crawl", "rift_north.shaft", v(-106.5, -287.2, -795), "-y", 1.4, 1.4),
    portal("rift_north.throat.shaft_foot", "throat", "Shaft foot", "rift_north.shaft", "rift_north.tube", v(-104, -314.8, -795), "+x", 1.6, 2.2),
  ],
  routes: [
    route("rift_north.route.through", "diver", "loop", [
      [-130, -286.3, -795], [-118, -286.7, -795], [-108, -286.9, -795], [-106.5, -287.2, -795], [-106.5, -300, -795], [-106.5, -315.4, -795],
      [-98, -317, -795.5], [-92, -317.3, -796], [-82, -316.8, -796], [-68, -314.9, -795], [-60, -313.7, -794], [-48, -313.3, -794],
    ]),
    route("rift_north.route.turn_back", "diver", "exit", [
      [-82, -316.8, -796], [-92, -317.3, -796], [-106.5, -315.4, -795], [-106.5, -300, -795], [-106.5, -287.2, -795], [-118, -286.7, -795], [-130, -286.3, -795],
    ]),
  ],
  staging: [
    { id: "rift_north.parking", role: "craft_parking", label: "Bench parking by the north tube", position: v(-40, -313.2, -796), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 network. Diver only. One footprint owns crawl, shaft and tube; the crawl is a real underground link with a mouth at each end.",
};

const NORTH: DeepCave = {
  source: NORTH_SOURCE, bible: ["rift_tube_north", "rift_shoulder_crawl"], size: "small", style: "lava_tube",
  exits: { "shoulder mouth": "rift_north.mouth.shoulder", "ledge mouth": "rift_north.mouth.ledge" },
  contents: [
    { id: "rift_north.ceramic", kind: "resource", bible: { kind: "resource", id: "rift_tube_north_ceramic" }, room: "rift_north.tube",
      at: v(-76, -316, -798.2), item: "pressure_ceramic", stock: 8, read: "Pale laminae in the south wall where the tube cooled slowly." },
    { id: "rift_north.core_nodes", kind: "scan", bible: { kind: "line", cave: "rift_tube_north", line: "Thin core nodes to scan" }, room: "rift_north.tube",
      at: v(-88, -315, -793.8), read: "Dark nodes in the north wall, too thin to work: the workable seam is the 350 m ledge." },
    { id: "rift_north.fin_crate", kind: "cache", bible: { kind: "reward", id: "rift.fin_crate" }, room: "rift_north.crawl",
      at: v(-115, -287.3, -796.2), read: "A crate wedged just inside the crawl, labelled for shipment south: two reserve cells and an exchanger fin." },
  ],
  cues: [
    { id: "rift_north.cue.shoulder", kind: "colony", room: "rift_north.tube", meaning: "exit", exit: "rift_north.mouth.shoulder", color: TEAL,
      points: [v(-62, -312, -791.5), v(-62, -312, -796.5)], read: "Teal colonies frame the bench mouth from inside." },
    { id: "rift_north.cue.ledge", kind: "colony", room: "rift_north.crawl", meaning: "exit", exit: "rift_north.mouth.ledge", color: AMBER,
      points: [v(-114, -286, -793.8), v(-114, -286, -796.2)], read: "Amber colonies line the crawl just inside the ledge mouth." },
    { id: "rift_north.cue.shaft", kind: "glimmer", room: "rift_north.shaft", meaning: "exit", exit: "rift_north.mouth.ledge", color: AMBER,
      points: [v(-106.5, -312, -794), v(-106.5, -290, -794)], read: "A thin amber line of colonies climbs the shaft wall: up is the ledge." },
    { id: "rift_north.cue.crawlers", species: "kiln_crawler", kind: "colony", room: "rift_north.tube", meaning: "resident", color: CRAWLER,
      points: [v(-84, -314, -798), v(-78, -314, -798)], read: "Kiln crawlers sit still on cool rock: no breath here." },
  ],
  hazards: [],
};

// --- Mite tube (small, warm) ------------------------------------------------------

/** A short warm tube under a lava ridge at the shoulder's edge. A cool
 * shoulder mouth to the south, a warm bulge in the middle that breathes, and
 * a narrow split crack at the west end overlooking the drop into the split.
 * Both ends are cool: the bulge's field fades within 2 m of its walls. */
const MITES_SOURCE: CaveSource = {
  id: "rift_tube_mites",
  label: "Mite tube",
  region: "thermal_rift",
  footprint: { minX: -128, maxX: -107, minZ: -1136, maxZ: -1112 },
  baseY: -314,
  topY: -297,
  terraces: [terrace("rift_mites.terrace.ridge", -299, [-118, -1124], [7, 9.5], 2.4, 0.2, 0.4, 8)],
  carves: [
    tube("rift_mites.carve.tube", "rift_mites.tube", [[-113, -1140, -306, 4.5, 4], [-114, -1131, -306.5, 4.5, 4], [-116, -1127.5, -307.2, 5, 4.4]]),
    chamber("rift_mites.carve.bulge", "rift_mites.bulge", [-118, -305, -1124], [3.6, 3.6, 2.8, 2.5], -307.5, 0.3),
    tube("rift_mites.carve.crack", "rift_mites.crack", [[-120.5, -1120.5, -307.5, 3, 3.6], [-124, -1117.5, -307.2, 2.4, 3], [-130, -1115, -306.6, 2.2, 2.8]], 0.15),
  ],
  blend: 1,
  rooms: [
    room("rift_mites.tube", "passage", "Shoulder tube", 8),
    room("rift_mites.bulge", "chamber", "Warm bulge", 8),
    room("rift_mites.crack", "passage", "Split crack", 6),
  ],
  portals: [
    portal("rift_mites.mouth.shoulder", "mouth", "Shoulder mouth", "rift_mites.tube", EXTERIOR, v(-113.8, -304.4, -1133.5), "-z", 2.8, 2.6),
    portal("rift_mites.mouth.crack", "mouth", "Split crack", "rift_mites.crack", EXTERIOR, v(-126, -306, -1116.6), "-x", 1.2, 1.8),
  ],
  routes: [
    route("rift_mites.route.through", "diver", "loop", [
      [-113, -305.4, -1143], [-113.6, -305.6, -1136], [-114, -305.9, -1131], [-116, -306.6, -1127.5], [-118, -306.9, -1124],
      [-120.5, -306.9, -1120.5], [-124, -306.6, -1117.5], [-131, -305.6, -1115],
    ]),
  ],
  staging: [
    { id: "rift_mites.parking", role: "craft_parking", label: "Shoulder parking by the mite tube", position: v(-114, -305.2, -1150), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 small, warm. The safe place to learn the breath: crawlers file in, the bulge warms for 10 s, both ends stay cool.",
};

const MITES: DeepCave = {
  source: MITES_SOURCE, bible: ["rift_tube_mites"], size: "small", style: "lava_tube",
  exits: { "shoulder mouth": "rift_mites.mouth.shoulder", "split crack": "rift_mites.mouth.crack" },
  contents: [
    { id: "rift_mites.breath_lesson", kind: "view", bible: { kind: "line", cave: "rift_tube_mites", line: "Safe practice for the heat-breath cue" },
      room: "rift_mites.tube", at: v(-115, -305.8, -1130), read: "From the cool tube, watch the crawlers file into the bulge's cracks five seconds before each breath." },
    { id: "rift_mites.split_glimpse", kind: "view", bible: { kind: "line", cave: "rift_tube_mites", line: "Glimpse of the split through a crack" },
      room: "rift_mites.crack", at: v(-124, -306.4, -1117.5), read: "The crack frames the split chimney's glow far down to the north-west." },
  ],
  cues: [
    { id: "rift_mites.cue.cracks", kind: "ember_crack", room: "rift_mites.bulge", meaning: "heat_breath", color: EMBER,
      points: [v(-121, -304, -1124), v(-118, -302.6, -1121.5), v(-115, -304, -1124)], read: "Ember cracks round the bulge brighten before each breath." },
    { id: "rift_mites.cue.crawlers", species: "kiln_crawler", kind: "colony", room: "rift_mites.bulge", meaning: "heat_breath", color: CRAWLER,
      points: [v(-120.5, -305, -1126), v(-116, -305, -1126.5)], read: "Pale crawlers file into the cracks five seconds before the breath and come out as it fades." },
    { id: "rift_mites.cue.shoulder", kind: "colony", room: "rift_mites.tube", meaning: "exit", exit: "rift_mites.mouth.shoulder", color: TEAL,
      points: [v(-112, -304.5, -1132), v(-115.6, -304.5, -1132)], read: "Teal colonies inside the shoulder mouth." },
    { id: "rift_mites.cue.crack", kind: "glimmer", room: "rift_mites.crack", meaning: "exit", exit: "rift_mites.mouth.crack", color: AMBER,
      points: [v(-123, -305.5, -1118.6), v(-125, -305.5, -1117.2)], read: "Amber glimmers in the crack: the narrow way out to the split." },
  ],
  hazards: [
    heatBox("rift_tube_mites.heat.bulge", "rift_tube_mites", "rift_split_chimney", v(-120.5, -307.5, -1126.5), v(-115.5, -302.5, -1121.5), 0.55, 1.5,
      "Crawlers file into the bulge's cracks and the cracks brighten five seconds before it breathes."),
  ],
};

// --- Stub hollow (small, cool) ------------------------------------------------------

/** A hollow under a fallen chimney stub lying east-west down the slope south
 * of the flank lane (moved 20 m west and south of the bible footprint, which
 * sat 1.5 m from route.rift.divide_flank). One mouth at the stub's downslope
 * end; pale laminae on the ceiling. */
const STUB_SOURCE: CaveSource = {
  id: "rift_stub_hollow",
  label: "Stub hollow",
  region: "thermal_rift",
  footprint: { minX: -4, maxX: 20, minZ: -1148, maxZ: -1124 },
  baseY: -272,
  topY: -255,
  terraces: [
    terrace("rift_stub.terrace.lower", -259.5, [8, -1136], [9.5, 6], 2.2, 0.15, 0.3, 9),
    terrace("rift_stub.terrace.upper", -257, [7.5, -1136], [8.5, 3.8], 2, 0.12, 0.3, 9),
  ],
  carves: [
    chamber("rift_stub.carve.hollow", "rift_stub.hollow", [6.5, -263, -1136], [5.5, 3.4, 2.4, 2.5], -265.5, 0.35),
    tube("rift_stub.carve.mouth", "rift_stub.mouth_passage", [[10.5, -1136, -265.2, 3.6, 3.4], [16, -1136.5, -265.8, 3.8, 3.4], [22, -1137, -266.6, 3.8, 3.4]], 0.2),
  ],
  blend: 1.2,
  rooms: [
    room("rift_stub.hollow", "chamber", "Stub hollow", 7),
    room("rift_stub.mouth_passage", "passage", "Stub mouth", 7),
  ],
  portals: [
    portal("rift_stub.mouth.stub", "mouth", "Stub mouth", "rift_stub.mouth_passage", EXTERIOR, v(17.4, -264.2, -1136.6), "+x", 2.2, 2.2),
  ],
  routes: [
    route("rift_stub.route.exit", "diver", "exit", [[3, -264.6, -1136], [5.5, -264.8, -1136], [10.5, -264.6, -1136], [16, -265.2, -1136.5], [24, -266.2, -1137]]),
  ],
  staging: [
    { id: "rift_stub.parking", role: "craft_parking", label: "Slope parking below the stub", position: v(26, -265, -1146), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 small, cool. The pale-vs-dark lesson overhead: laminae are ceramic, the dark nodes elsewhere are core.",
};

const STUB: DeepCave = {
  source: STUB_SOURCE, bible: ["rift_stub_hollow"], size: "small", style: "lava_tube",
  exits: { "stub mouth": "rift_stub.mouth.stub" },
  contents: [
    { id: "rift_stub.laminae", kind: "scan", bible: { kind: "line", cave: "rift_stub_hollow", line: "Ceramic laminae to scan (the pale-vs-dark rule)" },
      room: "rift_stub.hollow", at: v(5, -261, -1136), read: "Pale laminae on the ceiling: ceramic is the pale layer, core the dark node." },
  ],
  cues: [
    { id: "rift_stub.cue.mouth", kind: "colony", room: "rift_stub.mouth_passage", meaning: "exit", exit: "rift_stub.mouth.stub", color: TEAL,
      points: [v(14, -264.5, -1134.5), v(14, -264.5, -1138)], read: "Teal colonies by the stub mouth." },
    { id: "rift_stub.cue.crawlers", species: "kiln_crawler", kind: "colony", room: "rift_stub.hollow", meaning: "resident", color: CRAWLER,
      points: [v(1, -263, -1134), v(1, -263, -1138)], read: "A few still crawlers at the back wall: cool rock." },
  ],
  hazards: [],
};

// --- West blister (small, warm floor) -------------------------------------------------

/** A lava blister on the flat west plateau (moved 20 m west onto the
 * plateau; the bible footprint lay across a 17 m slope): a stepped dome over
 * a round chamber, a cracked skylight at the crown and a south mouth. The
 * floor is warm enough to grow kiln tubers and stays below the suit's
 * tolerance. */
const BLISTER_SOURCE: CaveSource = {
  id: "rift_west_blister",
  label: "West blister",
  region: "thermal_rift",
  footprint: { minX: -414, maxX: -386, minZ: -974, maxZ: -946 },
  baseY: -263,
  topY: -242,
  terraces: [
    terrace("rift_blister.terrace.base", -249, [-400, -959], [9.5, 9.5], 2, 0.25, 0.5, 9),
    terrace("rift_blister.terrace.mid", -246.5, [-400, -959.5], [7.5, 7.5], 2, 0.2, 0.4, 8),
    terrace("rift_blister.terrace.crown", -244.5, [-400, -960], [5, 5], 2, 0.2, 0.3, 7),
  ],
  carves: [
    chamber("rift_blister.carve.dome", "rift_blister.dome", [-400, -252.5, -959.5], [6.5, 6.5, 4, 3], -255, 0.4),
    shaft("rift_blister.carve.crack", "rift_blister.crack", [-398.5, -958.5], 1.1, 0.4, -250, -244, 0.2),
    tube("rift_blister.carve.mouth", "rift_blister.mouth_passage", [[-400, -965, -254.5, 3.8, 3.2], [-400, -971, -253.6, 4, 3.2], [-400, -976, -252.8, 4, 3.2]], 0.2),
  ],
  blend: 1.2,
  rooms: [
    room("rift_blister.dome", "chamber", "Blister", 8),
    room("rift_blister.crack", "shaft", "Skylight crack", 10),
    room("rift_blister.mouth_passage", "passage", "Blister mouth", 7),
  ],
  portals: [
    portal("rift_blister.mouth.south", "mouth", "Blister mouth", "rift_blister.mouth_passage", EXTERIOR, v(-400, -252.4, -969), "-z", 2.2, 2),
    portal("rift_blister.skylight", "skylight", "Skylight crack", "rift_blister.crack", EXTERIOR, v(-398.5, -244.5, -958.5), "+y", 1.3, 1.3),
    portal("rift_blister.throat.crack", "throat", "Crack foot", "rift_blister.dome", "rift_blister.crack", v(-398.5, -249.5, -958.5), "+y", 1.4, 1.4),
  ],
  routes: [
    route("rift_blister.route.mouth", "diver", "exit", [[-400, -254.4, -959.5], [-400, -254.2, -965], [-400, -253.2, -971], [-400, -252.2, -978]]),
    route("rift_blister.route.skylight", "diver", "exit", [[-401, -254.4, -961], [-398.5, -252, -958.5], [-398.5, -248, -958.5], [-398.5, -244, -958.5], [-398.5, -241.5, -958.5]]),
  ],
  staging: [
    { id: "rift_blister.parking", role: "craft_parking", label: "Plateau parking by the blister", position: v(-400, -252, -982), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 small. Two ways out: the south mouth and the crown crack. The warm floor never reaches the suit's tolerance.",
};

const BLISTER: DeepCave = {
  source: BLISTER_SOURCE, bible: ["rift_west_blister"], size: "small", style: "lava_tube",
  exits: { "blister mouth": "rift_blister.mouth.south", "skylight crack": "rift_blister.skylight" },
  contents: [
    { id: "rift_blister.tubers", kind: "seed", bible: { kind: "line", cave: "rift_west_blister", line: "Kiln tuber cuttings growing in the warm floor" },
      room: "rift_blister.dome", at: v(-402.5, -254.6, -958), item: "seed_kiln_tuber", stock: 2, read: "Tubers push through the warm floor round the chamber's edge." },
  ],
  cues: [
    { id: "rift_blister.cue.mouth", kind: "colony", room: "rift_blister.mouth_passage", meaning: "exit", exit: "rift_blister.mouth.south", color: TEAL,
      points: [v(-398.3, -253, -966), v(-401.7, -253, -966)], read: "Teal colonies inside the blister mouth." },
    { id: "rift_blister.cue.crawlers", species: "kiln_crawler", kind: "colony", room: "rift_blister.dome", meaning: "resident", color: CRAWLER,
      points: [v(-405, -252, -957), v(-404, -251, -962)], read: "Crawlers bask on the warm wall; they never hide here, so the floor never breathes." },
  ],
  hazards: [
    heatBox("rift_west_blister.heat.floor", "rift_west_blister", "rift_inactive_shoulder", v(-406.5, -255.5, -966), v(-393.5, -253.5, -953), 0.22, 1,
      "The blister floor is warm to the touch; tubers grow in it and the suit reads a mild load that never climbs.", false),
  ],
  safe: "The warm floor's field (0.22) stays below the unprotected suit's heat tolerance (0.3).",
};

// --- West tube (medium) ---------------------------------------------------------------

/** Under a lava ridge on the west shoulder, west of the core lane (moved 20 m
 * west; route.rift.core crossed the bible footprint). A Dart runs north arm,
 * fork chamber and south arm between the two mouths; a diver bypass behind
 * the fork joins the arms and closes the loop. */
const WEST_SOURCE: CaveSource = {
  id: "rift_west_tube",
  label: "West tube",
  region: "thermal_rift",
  footprint: { minX: -346, maxX: -302, minZ: -1010, maxZ: -956 },
  baseY: -294,
  topY: -275,
  terraces: [
    terrace("rift_west.terrace.ridge", -279, [-322, -983], [13, 21], 2.6, 0.2, 0.5, 11),
    terrace("rift_west.terrace.crest", -277, [-325, -983], [8, 15], 2.4, 0.2, 0.4, 9),
  ],
  carves: [
    tube("rift_west.carve.north", "rift_west.north_arm", [
      [-318, -950, -286.8, 10, 5.5], [-318, -959, -286.8, 10, 5.5], [-318, -962, -287.6, 10, 5.5], [-319, -968, -289.5, 10, 5.5], [-320, -976, -290.5, 10, 5.5],
    ]),
    chamber("rift_west.carve.fork", "rift_west.fork", [-320, -287.5, -983], [8, 7, 4, 3.5], -291),
    tube("rift_west.carve.south", "rift_west.south_arm", [
      [-320, -990, -290.5, 10, 5.5], [-319, -998, -289.5, 10, 5.5], [-318, -1004, -287.6, 10, 5.5], [-318, -1007, -286.8, 10, 5.5], [-318, -1016, -286.8, 10, 5.5],
    ]),
    tube("rift_west.carve.bypass", "rift_west.bypass", [
      [-322.5, -971.5, -289, 3, 3], [-330, -975, -288.5, 3, 3], [-332, -983, -288.2, 3, 3], [-330, -991, -288.5, 3, 3], [-322.5, -994.5, -289, 3, 3],
    ], 0.2),
  ],
  blend: 1.4,
  rooms: [
    room("rift_west.north_arm", "passage", "North arm", 12),
    room("rift_west.fork", "chamber", "Fork chamber", 12),
    room("rift_west.south_arm", "passage", "South arm", 12),
    room("rift_west.bypass", "passage", "Outer bypass", 8),
  ],
  portals: [
    portal("rift_west.mouth.north", "mouth", "North mouth", "rift_west.north_arm", EXTERIOR, v(-318, -284.8, -961), "+z", 8.4, 4, ["diver", "small"]),
    portal("rift_west.mouth.south", "mouth", "South mouth", "rift_west.south_arm", EXTERIOR, v(-318, -284.8, -1005), "-z", 8.4, 4, ["diver", "small"]),
  ],
  routes: [
    route("rift_west.route.hall", "small", "loop", [
      [-318, -286, -944], [-318, -286.02, -957.33], [-318, -286.27, -960], [-319, -287.27, -968], [-319.33, -287.78, -970.67], [-319.9, -290.27, -982.9],
      [-319.34, -287.78, -995.34], [-319, -287.28, -998], [-318, -287.28, -1011.33], [-318, -287.4, -1022],
    ]),
    route("rift_west.route.bypass", "diver", "loop", [
      [-318, -286.3, -950], [-318, -286.3, -953], [-319.8, -286.89, -964], [-325, -287.87, -972.67], [-330, -287.87, -975], [-331.33, -287.4, -980.33],
      [-331.33, -287.4, -985.67], [-330, -287.87, -991], [-325, -287.87, -993.33], [-319.7, -286.89, -1001.47], [-318, -286.88, -1008.5], [-318, -287.1, -1016],
    ]),
  ],
  staging: [
    { id: "rift_west.parking", role: "craft_parking", label: "Shoulder parking north of the west tube", position: v(-318, -285.2, -940), radius: 9, profiles: ["small", "medium"] },
  ],
  note: "CA-3 medium. Loop: north arm - fork - south arm - bypass. Hall: Dart (350) and Hush (450); the keel stays above 291 m.",
};

const WEST: DeepCave = {
  source: WEST_SOURCE, bible: ["rift_west_tube"], size: "medium", style: "lava_tube",
  exits: { "north mouth": "rift_west.mouth.north", "south mouth": "rift_west.mouth.south" },
  hall: { profile: "small", craft: ["dart", "hush"], note: "Keel above 291 m: the Dart's 350 m refit and the Hush's 450 m both reach it." },
  graph: {
    chambers: { "north arm": ["rift_west.north_arm"], "fork chamber": ["rift_west.fork"], "south arm": ["rift_west.south_arm"] },
    loopCloser: { passage: "outer_bypass", rooms: ["rift_west.bypass"] },
  },
  contents: [
    { id: "rift_west.shelter", kind: "shelter", bible: { kind: "line", cave: "rift_west_tube", line: "Sheltered approach to the west core patch" },
      room: "rift_west.south_arm", at: v(-318, -287.6, -1004), read: "The south mouth looks down the shoulder toward the west lower ledge." },
  ],
  cues: [
    { id: "rift_west.cue.north", kind: "colony", room: "rift_west.north_arm", meaning: "exit", exit: "rift_west.mouth.north", color: AMBER,
      points: [v(-313.5, -286, -964), v(-322.5, -286, -964)], read: "Amber colonies inside the north mouth." },
    { id: "rift_west.cue.south", kind: "colony", room: "rift_west.south_arm", meaning: "exit", exit: "rift_west.mouth.south", color: TEAL,
      points: [v(-313.5, -286, -1002), v(-322.5, -286, -1002)], read: "Teal colonies inside the south mouth." },
    { id: "rift_west.cue.crawlers", species: "kiln_crawler", kind: "colony", room: "rift_west.bypass", meaning: "resident", color: CRAWLER,
      points: [v(-332.8, -287, -980), v(-332.8, -287, -986)], read: "Crawlers rest in the bypass: cool rock all the way round." },
  ],
  hazards: [],
};

// --- Kiln tube (medium, warm end) ---------------------------------------------------

/** In the plateau cliff 40 m east of the carrier lane (the bible footprint sat
 * 4.7 m from it), just under the plateau lip so the envelope stays short. The
 * plateau mouth opens half-way up the cliff above the 306 m bench; a cool
 * upper tube a Dart can run descends to the vent chamber. A return tube
 * climbs back to the rim mouth near the lip, and a junction under the lip
 * joins it to the upper tube, closing the loop. The chamber breathes heat
 * only at its east end, round the end-vent niche; a diver-only ceramic
 * gallery leaves its cool south-west corner. */
const KILN_SOURCE: CaveSource = {
  id: "rift_kiln_tube",
  label: "Kiln tube",
  region: "thermal_rift",
  footprint: { minX: 140, maxX: 194, minZ: -856, maxZ: -798 },
  baseY: -310,
  topY: -258,
  terraces: [],
  carves: [
    tube("kiln.carve.upper", "kiln.upper_tube", [[134, -823, -284, 11, 7], [150, -823, -284, 11, 7], [161, -823.5, -286, 11, 7]]),
    chamber("kiln.carve.upper_bend", "kiln.upper_tube", [167, -284.5, -825], [6.5, 6.5, 4.5, 3], -287.5),
    tube("kiln.carve.upper_drop", "kiln.upper_tube", [[167, -827, -288, 11, 7], [167, -832, -290, 11, 7]]),
    chamber("kiln.carve.vent", "kiln.vent_chamber", [171, -287, -836.5], [9, 8, 6, 4], -291),
    chamber("kiln.carve.niche", "kiln.vent_niche", [176, -288.8, -845], [2.7, 2.7, 2.2, 1.7], -290.5),
    chamber("kiln.carve.return_foot", "kiln.return_tube", [183, -286, -834], [6.5, 7, 5.5, 4], -290.5),
    tube("kiln.carve.return", "kiln.return_tube", [[184, -830, -290, 11, 7], [184, -818, -287, 11, 7], [184, -813, -285.5, 11, 7]]),
    chamber("kiln.carve.return_bend", "kiln.return_tube", [184, -280.5, -809], [6.5, 6.5, 4.5, 3], -284),
    tube("kiln.carve.return_out", "kiln.return_tube", [[180, -809, -283.5, 11, 7], [168, -809, -281.5, 11, 7], [158, -809, -280, 11, 7], [140, -809, -280, 11, 7]]),
    tube("kiln.carve.junction", "kiln.junction", [[160, -812, -281, 4, 3.6], [160, -816, -283, 4, 3.4], [160, -820.5, -285.2, 4, 3.6]], 0.2),
    tube("kiln.carve.gallery", "kiln.ceramic_gallery", [
      [165, -841.5, -290.5, 3.8, 3.4], [164, -847.5, -290.3, 3.8, 3.4], [167, -851.5, -290.1, 3.8, 3.4], [172, -852, -290, 3.8, 3.4],
    ], 0.2),
  ],
  blend: 1.6,
  rooms: [
    room("kiln.upper_tube", "passage", "Upper tube", 14),
    room("kiln.junction", "passage", "Plateau-lip junction", 12),
    room("kiln.return_tube", "passage", "Return tube", 14),
    room("kiln.vent_chamber", "chamber", "Vent chamber", 12),
    room("kiln.vent_niche", "pocket", "End vent", 8),
    room("kiln.ceramic_gallery", "passage", "Ceramic gallery", 10),
  ],
  portals: [
    portal("kiln.mouth.plateau", "mouth", "Plateau mouth", "kiln.upper_tube", EXTERIOR, v(148.5, -281, -823), "-x", 8.4, 4.4, ["diver", "small"]),
    portal("kiln.mouth.rim", "mouth", "Rim mouth", "kiln.return_tube", EXTERIOR, v(156, -277.3, -809), "-x", 8.4, 4.4, ["diver", "small"]),
    portal("kiln.throat.gallery", "throat", "Gallery throat", "kiln.vent_chamber", "kiln.ceramic_gallery", v(165.2, -289.1, -842), "-z", 2.2, 2),
    portal("kiln.throat.niche", "throat", "End vent", "kiln.vent_chamber", "kiln.vent_niche", v(176, -288.8, -842.8), "-z", 1.4, 1.2),
  ],
  routes: [
    route("kiln.route.loop", "small", "loop", [
      [126, -285.8, -823], [138, -285.8, -823], [141, -283.8, -823], [152.75, -283.8, -823.13], [155.5, -283.8, -823.25], [165, -285.78, -825.17],
      [167, -286.27, -826], [168.33, -288.3, -833.5], [179.63, -289.3, -834.63], [182.5, -289.28, -834], [184, -285.8, -820.5], [184, -283.8, -815],
      [184, -283.3, -812], [178, -281.77, -809], [175.5, -281.3, -809], [165.5, -279.8, -809], [152.18, -279.8, -809], [146.36, -279.8, -809],
      [134.73, -281.8, -809], [126, -281.8, -809],
    ]),
    route("kiln.route.gallery_exit", "diver", "exit", [
      [170.5, -289.4, -852], [165.5, -289.4, -849.5], [164, -289.4, -847.5], [166.5, -289.9, -834], [167, -288.4, -832], [167, -287.4, -829.5],
      [161, -284.9, -823.5], [152.75, -283.4, -823.13], [144, -283.4, -823], [132, -285.8, -823],
    ]),
    route("kiln.route.niche_exit", "diver", "exit", [
      [176, -289.9, -845.5], [174.33, -289.9, -840.17], [167, -287.4, -829.5], [161, -284.9, -823.5], [152.75, -283.4, -823.13], [144, -283.4, -823],
      [132, -285.8, -823],
    ]),
    route("kiln.route.junction", "diver", "loop", [
      [132, -281.4, -809], [146, -281.6, -809], [151.6, -279.4, -809], [160, -279.4, -809], [160, -280.4, -814], [157.5, -284.4, -823.38],
      [152.5, -283.4, -823.13], [144, -283.4, -823], [132, -285.8, -823],
    ]),
  ],
  staging: [
    { id: "kiln.parking", role: "craft_parking", label: "Bench parking below the plateau mouth", position: v(125, -305, -810), radius: 7, profiles: ["small"] },
  ],
  note: "CA-3 medium. Loop: upper tube - vent chamber - return tube - junction; craft legs run along the axes. Hall: Dart (350) and Hush (450); " +
    "keel above 291 m. Heat only round the vent's south-east end and the niche; tubes, junction and gallery are cool.",
};

const KILN_HAZARDS: readonly CaveHazard[] = [
  heatBox("rift_kiln_tube.heat.vent_east", "rift_kiln_tube", "rift_inactive_shoulder", v(172.5, -291, -849), v(181, -283, -837.5), 0.6, 2,
    "Ember cracks brighten along the vent chamber's south-east wall and the crawlers file into them before each breath."),
  heatVent("rift_kiln_tube.heat.end_vent", "rift_kiln_tube", "rift_inactive_shoulder", v(176, -290.5, -846.5), 1.2, 0, 3, 0.95, 2,
    "A steady orange crack at the back of the niche: the end vent never cools."),
];

const KILN: DeepCave = {
  source: KILN_SOURCE, bible: ["rift_kiln_tube"], size: "medium", style: "lava_tube",
  exits: { "plateau mouth": "kiln.mouth.plateau", "rim mouth": "kiln.mouth.rim" },
  hall: { profile: "small", craft: ["dart", "hush"], note: "The hall keel stays above 291 m: inside the Dart's 350 m refit and the Hush's 450 m." },
  graph: {
    chambers: { "upper tube": ["kiln.upper_tube"], "vent chamber": ["kiln.vent_chamber"], "return tube": ["kiln.return_tube"], "ceramic gallery": ["kiln.ceramic_gallery"] },
    loopCloser: { passage: "junction", rooms: ["kiln.junction"] },
  },
  contents: [
    { id: "rift_kiln_tube.ceramic_lining", kind: "resource", bible: { kind: "resource", id: "rift_kiln_tube_ceramic" },
      room: "kiln.ceramic_gallery", at: v(169, -289.7, -853.6), item: "pressure_ceramic", stock: 16,
      read: "Thick pale lining where the gallery cooled slowly; the wall rings when tapped." },
    { id: "rift_kiln_tube.vent_charge", kind: "service", bible: { kind: "reward", id: "rift.kiln_vent_charge" },
      room: "kiln.vent_chamber", at: v(176, -290, -840), read: "A craft holding at the niche charges a tier-1 thermal exchanger from the end vent." },
  ],
  cues: [
    { id: "rift_kiln_tube.cue.vent_cracks", kind: "ember_crack", room: "kiln.vent_chamber", meaning: "heat_breath", color: EMBER,
      points: [v(179, -290, -842), v(180, -286.5, -838.5), v(178.5, -284.5, -840.5)], read: "Orange cracks on the chamber's south-east wall: the warm end." },
    { id: "rift_kiln_tube.cue.crawlers", species: "kiln_crawler", kind: "colony", room: "kiln.vent_chamber", meaning: "heat_breath", color: CRAWLER,
      points: [v(173, -285, -842.5), v(179.5, -285, -839)], read: "Pale crawlers on the warm wall file into the cracks five seconds before a breath." },
    { id: "rift_kiln_tube.cue.plateau_mouth", kind: "colony", room: "kiln.upper_tube", meaning: "exit", exit: "kiln.mouth.plateau", color: TEAL,
      points: [v(152, -281.5, -818), v(152, -281.5, -828)], read: "Teal colonies frame the plateau mouth from inside." },
    { id: "rift_kiln_tube.cue.rim_mouth", kind: "colony", room: "kiln.return_tube", meaning: "exit", exit: "kiln.mouth.rim", color: AMBER,
      points: [v(160, -278, -804), v(160, -278, -814)], read: "Amber colonies inside the rim mouth, near the plateau lip." },
    { id: "rift_kiln_tube.cue.gallery", kind: "glimmer", room: "kiln.ceramic_gallery", meaning: "exit", exit: "kiln.mouth.plateau", color: TEAL,
      points: [v(164.5, -289, -846), v(165.5, -289, -842)], read: "A trail of teal glimmers leads out of the gallery toward the cool upper tube." },
  ],
  hazards: KILN_HAZARDS,
};

export const RIFT_CAVES: readonly DeepCave[] = [NORTH, MITES, STUB, BLISTER, WEST, KILN];
