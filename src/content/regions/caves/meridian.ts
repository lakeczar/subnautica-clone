import type { CaveSource } from "../caves.js";
import { chamber, EXTERIOR, portal, room, route, shaft, terrace, tube, v, type DeepCave } from "./deepKit.js";

/** CA-3, Meridian: cut voids.
 *
 * Square foundation galleries and cable culverts where the settlement's
 * builders cut into terrace rock: masonry plinths (high-exponent terraces)
 * on the flat terraces, culverts and ducts cut into the real terrace walls.
 * Dead lamp brackets every few metres; cable tenders gather only on lines
 * that still carry current, so their chains trace live power through the
 * dark (`feeds` names the lit site each line serves).
 *
 * Story-neutral by construction: every footprint stays 30 m or more from
 * every story site and outside the machinery boundary; nothing here holds a
 * clue, a decode or a story prop. Cave halls admit the medium profile: at
 * 520-560 m only the Creel 800 and the Mantle are rated. */

const TENDER: readonly [number, number, number] = [0.55, 1, 0.78];
const AMBER: readonly [number, number, number] = [1, 0.71, 0.37];
const TEAL: readonly [number, number, number] = [0.38, 0.9, 0.82];
const BRACKET: readonly [number, number, number] = [0.86, 0.8, 0.62];

// --- Footing void (small) -----------------------------------------------------------

/** A dry-walled foundation gallery under a masonry plinth at the staging
 * shelf's edge, 13 m south of the shelf's nearest pylon. One shelf-edge mouth
 * to the west and a service alcove off the gallery. */
const FOOTING_SOURCE: CaveSource = {
  id: "meridian_footing_void",
  label: "Footing void",
  region: "deep_district",
  footprint: { minX: 1038, maxX: 1062, minZ: -1237, maxZ: -1213 },
  baseY: -525,
  topY: -511,
  terraces: [terrace("meridian_footing.terrace.plinth", -513, [1050, -1225], [8.5, 7], 6, 0.2, 0.15, 12)],
  carves: [
    tube("meridian_footing.carve.gallery", "meridian_footing.gallery", [
      [1034, -1225, -519.6, 3.6, 3.4], [1041, -1225, -520.6, 3.6, 3.4], [1052, -1225, -522, 3.8, 3.6], [1055, -1225, -522, 3.8, 3.6],
    ], 0.12),
    chamber("meridian_footing.carve.alcove", "meridian_footing.alcove", [1050, -520.5, -1220.6], [2.2, 2, 1.8, 1.4], -522, 0.12),
  ],
  blend: 0.9,
  rooms: [room("meridian_footing.gallery", "passage", "Foundation gallery", 8), room("meridian_footing.alcove", "pocket", "Service alcove", 6)],
  portals: [portal("meridian_footing.mouth.shelf", "mouth", "Shelf-edge mouth", "meridian_footing.gallery", EXTERIOR, v(1041.5, -519.2, -1225), "-x", 2.2, 2)],
  routes: [route("meridian_footing.route.exit", "diver", "exit", [
      [1050, -520.88, -1221], [1047.5, -520.4, -1225], [1039.5, -519.32, -1225], [1032, -519.37, -1225],
    ])],
  staging: [
    { id: "meridian_footing.parking", role: "craft_parking", label: "Shelf parking west of the footing void", position: v(1028, -519, -1232), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 small. A square gallery under a plinth: the shelf's foundations. Clear of the pylon and the shelf's story placement.",
};

const FOOTING: DeepCave = {
  source: FOOTING_SOURCE, bible: ["meridian_footing_void"], size: "small", style: "cut_void",
  exits: { "shelf-edge mouth": "meridian_footing.mouth.shelf" },
  contents: [
    { id: "meridian_footing.alcove_cache", kind: "cache", bible: { kind: "reward", id: "meridian.service_alcove" },
      room: "meridian_footing.alcove", at: v(1050, -521.6, -1219.6), read: "A service locker in the alcove wall, its seal intact: repair stock." },
  ],
  cues: [
    { id: "meridian_footing.cue.brackets", kind: "glimmer", room: "meridian_footing.gallery", meaning: "exit", exit: "meridian_footing.mouth.shelf", color: BRACKET,
      points: [v(1053, -519, -1226.8), v(1047, -519, -1226.8), v(1043, -519, -1226.8)], read: "Dead lamp brackets every few metres, their reflectors catching the mouth's glow." },
    { id: "meridian_footing.cue.line", species: "cable_tender", kind: "live_line", room: "meridian_footing.gallery", meaning: "live_line", color: TENDER, feeds: "meridian.spire",
      points: [v(1054, -518.9, -1223.3), v(1048, -518.9, -1223.3), v(1043, -518.9, -1223.3)],
      read: "A few tenders on the gallery's one live cable, running out under the shelf toward the spire's feed." },
    { id: "meridian_footing.cue.mouth", kind: "colony", room: "meridian_footing.gallery", meaning: "exit", exit: "meridian_footing.mouth.shelf", color: TEAL,
      points: [v(1043.5, -519.5, -1223.4), v(1043.5, -519.5, -1226.6)], read: "Teal colonies inside the shelf-edge mouth." },
  ],
  hazards: [],
};

// --- North culvert (small, north_terrace network) -------------------------------------

/** A cable culvert cut north into the first terrace's wall from the second
 * terrace's floor (moved 20 m to the wall itself; the bible's footprint lay
 * on open floor 28 m from it). Tenders string one live line along the
 * culvert; a duct climbs from its side to a small opening 22 m up the wall. */
const CULVERT_SOURCE: CaveSource = {
  id: "meridian_culvert_north",
  label: "North culvert",
  region: "deep_district",
  footprint: { minX: 1224, maxX: 1240, minZ: -1164, maxZ: -1136 },
  baseY: -604,
  topY: -518,
  terraces: [],
  carves: [
    tube("meridian_culvert.carve.culvert", "meridian_culvert.culvert", [
      [1232, -1162, -599.8, 3, 4], [1232, -1155, -600, 3, 4], [1232, -1147, -599.6, 3, 4], [1232, -1140, -599.2, 3, 4],
    ], 0.12),
    shaft("meridian_culvert.carve.riser", "meridian_culvert.duct", [1230.5, -1146], 1.45, 0, -598, -577.5, 0.1),
    tube("meridian_culvert.carve.duct", "meridian_culvert.duct", [[1230.5, -1146, -579.2, 2, 2], [1230.5, -1151, -579.2, 2, 2], [1230.5, -1159, -579.2, 2, 2]], 0.1),
  ],
  blend: 0.8,
  rooms: [room("meridian_culvert.culvert", "passage", "Cable culvert", 10), room("meridian_culvert.duct", "passage", "Cable duct", 8)],
  portals: [
    portal("meridian_culvert.mouth.terrace", "mouth", "Terrace mouth", "meridian_culvert.culvert", EXTERIOR, v(1232, -598.4, -1155.5), "-z", 1.8, 2.6),
    portal("meridian_culvert.mouth.duct", "mouth", "Cable duct", "meridian_culvert.duct", EXTERIOR, v(1230.5, -578.2, -1155), "-z", 1, 1),
  ],
  routes: [
    route("meridian_culvert.route.terrace", "diver", "exit", [
      [1232, -598.4, -1141], [1232, -598.4, -1142.4], [1232, -598.87, -1150.8], [1232, -599.28, -1164.63], [1232, -599.28, -1166],
    ]),
    route("meridian_culvert.route.duct", "diver", "exit", [
      [1232, -598.9, -1144], [1231, -597.4, -1145.33], [1230.5, -582, -1146], [1230.5, -578.38, -1147], [1230.5, -578.4, -1156], [1230.5, -581.2, -1160],
    ]),
  ],
  staging: [
    { id: "meridian_culvert.parking", role: "craft_parking", label: "Second-terrace parking below the culvert", position: v(1240, -599, -1174), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 small, network north_terrace. Diver only. One live line along the culvert; the duct is the second way out.",
};

const CULVERT: DeepCave = {
  source: CULVERT_SOURCE, bible: ["meridian_culvert_north"], size: "small", style: "cut_void",
  exits: { "terrace mouth": "meridian_culvert.mouth.terrace", "cable duct": "meridian_culvert.mouth.duct" },
  contents: [
    { id: "meridian_culvert.trays", kind: "resource", bible: { kind: "resource", id: "meridian_culvert_crust" }, room: "meridian_culvert.culvert",
      at: v(1233.3, -598.2, -1145), item: "conductive_crust", stock: 8, read: "Crust grows on trays that still ground a live line." },
  ],
  cues: [
    { id: "meridian_culvert.cue.line", species: "cable_tender", kind: "live_line", room: "meridian_culvert.culvert", meaning: "live_line", color: TENDER, feeds: "meridian.spire",
      points: [v(1233.2, -597, -1141), v(1233.2, -597, -1148), v(1233.2, -597, -1155), v(1233.2, -597.5, -1161)],
      read: "A chain of tenders pulses along one cable: it still carries current, out to the terrace and on toward the spire." },
    { id: "meridian_culvert.cue.duct", species: "cable_tender", kind: "live_line", room: "meridian_culvert.duct", meaning: "live_line", color: TENDER, feeds: "meridian.spire",
      points: [v(1231.5, -597, -1146), v(1231.5, -581, -1146), v(1231.3, -578.6, -1152)], read: "A second strand of tenders climbs the duct to its opening." },
    { id: "meridian_culvert.cue.duct_mouth", kind: "glimmer", room: "meridian_culvert.duct", meaning: "exit", exit: "meridian_culvert.mouth.duct", color: AMBER,
      points: [v(1229.6, -578.4, -1150), v(1229.6, -578.4, -1154)], read: "Amber glimmers at the duct's end, where it opens on the wall." },
    { id: "meridian_culvert.cue.mouth", kind: "colony", room: "meridian_culvert.culvert", meaning: "exit", exit: "meridian_culvert.mouth.terrace", color: TEAL,
      points: [v(1230.8, -598.5, -1153), v(1233.2, -598.5, -1153)], read: "Teal colonies inside the terrace mouth." },
  ],
  hazards: [],
};

// --- Spire footing (small) ----------------------------------------------------------------

/** A void inside a masonry footing block 30 m south-west of the spire's base,
 * off the terraces route. The spire's feed cables run through it in a duct
 * toward the spire; tenders trace them. One footing mouth to the south. */
const SPIRE_SOURCE: CaveSource = {
  id: "meridian_spire_footing",
  label: "Spire footing",
  region: "deep_district",
  footprint: { minX: 1170, maxX: 1194, minZ: -1370, maxZ: -1346 },
  baseY: -604,
  topY: -587,
  terraces: [terrace("meridian_spire.terrace.block", -590, [1182, -1358], [8.5, 8.5], 6, 0.2, 0.15, 12)],
  carves: [
    chamber("meridian_spire.carve.void", "meridian_spire.void", [1182, -598, -1358], [5, 5, 3.5, 2], -601.5, 0.15),
    tube("meridian_spire.carve.mouth", "meridian_spire.mouth_passage", [[1181, -1362, -600.5, 3.4, 3.2], [1181, -1367, -600.2, 3.4, 3.2], [1181, -1373, -599.8, 3.4, 3.2]], 0.12),
    tube("meridian_spire.carve.duct", "meridian_spire.duct", [[1185.5, -1354.5, -599.5, 1.6, 1.6], [1188.5, -1351.5, -599.5, 1.6, 1.6]], 0.08),
  ],
  blend: 0.9,
  rooms: [
    room("meridian_spire.void", "chamber", "Footing void", 8),
    room("meridian_spire.mouth_passage", "passage", "Footing mouth", 8),
    room("meridian_spire.duct", "pocket", "Feed duct", 5),
  ],
  portals: [portal("meridian_spire.mouth.footing", "mouth", "Footing mouth", "meridian_spire.mouth_passage", EXTERIOR, v(1181, -598.9, -1365), "-z", 2.2, 2)],
  routes: [route("meridian_spire.route.exit", "diver", "exit", [
      [1183, -599.39, -1357], [1181, -599.34, -1369.5], [1181, -599.35, -1375],
    ])],
  staging: [
    { id: "meridian_spire.parking", role: "craft_parking", label: "Terrace parking south of the spire footing", position: v(1181, -598.8, -1382), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 small. The spire's live feed, traced by tenders, through a footing beside the spire.",
};

const SPIRE: DeepCave = {
  source: SPIRE_SOURCE, bible: ["meridian_spire_footing"], size: "small", style: "cut_void",
  exits: { "footing mouth": "meridian_spire.mouth.footing" },
  contents: [
    { id: "meridian_spire.feed", kind: "scan", bible: { kind: "line", cave: "meridian_spire_footing", line: "The spire's live feed, traced by tenders" },
      room: "meridian_spire.duct", at: v(1187, -599.4, -1353), read: "Feed cables vanish into the duct toward the spire; they hum." },
  ],
  cues: [
    { id: "meridian_spire.cue.feed", species: "cable_tender", kind: "live_line", room: "meridian_spire.void", meaning: "live_line", color: TENDER, feeds: "meridian.spire",
      points: [v(1178, -597, -1361), v(1182, -596.6, -1358), v(1186, -597.4, -1354.5), v(1188, -599, -1352)],
      read: "Tenders bead the feed across the void and into the duct: the spire's light is this line." },
    { id: "meridian_spire.cue.mouth", kind: "colony", room: "meridian_spire.mouth_passage", meaning: "exit", exit: "meridian_spire.mouth.footing", color: AMBER,
      points: [v(1179.4, -599.5, -1363), v(1182.6, -599.5, -1363)], read: "Amber colonies inside the footing mouth." },
  ],
  hazards: [],
};

// --- Escarpment pocket (small) ------------------------------------------------------------

/** A natural pocket in the escarpment's east wall at the return ledge (moved
 * 50 m east, into the wall; the bible footprint lay on the open ledge): a
 * rest pocket with a survey bolt line along its wall. */
const POCKET_SOURCE: CaveSource = {
  id: "meridian_escarp_pocket",
  label: "Escarpment pocket",
  region: "deep_district",
  footprint: { minX: 1378, maxX: 1396, minZ: -944, maxZ: -920 },
  baseY: -511,
  topY: -461,
  terraces: [],
  carves: [
    tube("meridian_pocket.carve.mouth", "meridian_pocket.mouth_passage", [[1375, -932, -505.6, 3.2, 3], [1381, -932, -505, 3.2, 3], [1386, -932, -504.4, 3.4, 3], [1388, -932, -504, 3.4, 3]], 0.2),
    chamber("meridian_pocket.carve.pocket", "meridian_pocket.pocket", [1391, -501.2, -932], [3.5, 4.5, 2.6, 2.4], -503.6, 0.3),
  ],
  blend: 1.1,
  rooms: [room("meridian_pocket.mouth_passage", "passage", "Ledge mouth", 7), room("meridian_pocket.pocket", "chamber", "Escarpment pocket", 7)],
  portals: [portal("meridian_pocket.mouth.ledge", "mouth", "Ledge mouth", "meridian_pocket.mouth_passage", EXTERIOR, v(1382.6, -503.6, -932), "-x", 2, 1.8)],
  routes: [route("meridian_pocket.route.exit", "diver", "exit", [
      [1391.5, -502.87, -932], [1389.17, -502.87, -932], [1382, -503.87, -932], [1373, -505.9, -932],
    ])],
  staging: [
    { id: "meridian_pocket.parking", role: "craft_parking", label: "Ledge parking by the escarpment pocket", position: v(1374, -503.5, -946), radius: 4, profiles: ["small"] },
  ],
  note: "CA-3 small. A rest pocket on the return ledge, a survey bolt line in its wall.",
};

const POCKET: DeepCave = {
  source: POCKET_SOURCE, bible: ["meridian_escarp_pocket"], size: "small", style: "cut_void",
  exits: { "ledge mouth": "meridian_pocket.mouth.ledge" },
  contents: [
    { id: "meridian_pocket.bolts", kind: "scan", bible: { kind: "line", cave: "meridian_escarp_pocket", line: "A rest pocket on the return ledge" },
      room: "meridian_pocket.pocket", at: v(1393.8, -501, -932), read: "A survey bolt line along the back wall, each bolt stamped with a depth." },
  ],
  cues: [
    { id: "meridian_pocket.cue.mouth", kind: "colony", room: "meridian_pocket.mouth_passage", meaning: "exit", exit: "meridian_pocket.mouth.ledge", color: TEAL,
      points: [v(1383.5, -503.8, -930.5), v(1383.5, -503.8, -933.5)], read: "Teal colonies inside the ledge mouth." },
    { id: "meridian_pocket.cue.bolts", kind: "glimmer", room: "meridian_pocket.pocket", meaning: "exit", exit: "meridian_pocket.mouth.ledge", color: BRACKET,
      points: [v(1393.5, -501, -929.5), v(1390, -501.5, -928.6), v(1386.5, -502.5, -930.6)], read: "The bolt line's reflective tags run back toward the mouth." },
  ],
  hazards: [],
};

// --- Terrace crack (small) --------------------------------------------------------------------

/** A crack where the second terrace's wall split, at the wall itself (moved
 * 30 m south-east from the open terrace): a 22 m cleft drops from the 600 m
 * terrace to a slot in the wall face that looks straight down to the third
 * terrace, a diver's shortcut between terraces. */
const CRACK_SOURCE: CaveSource = {
  id: "meridian_terrace_crack",
  label: "Terrace crack",
  region: "deep_district",
  footprint: { minX: 1113, maxX: 1131, minZ: -1487, maxZ: -1469 },
  baseY: -683,
  topY: -598,
  terraces: [],
  carves: [
    shaft("meridian_crack.carve.cleft", "meridian_crack.cleft", [1119, -1478], 1.9, 1.2, -622.5, -598.5, 0.2),
    tube("meridian_crack.carve.slot", "meridian_crack.slot", [[1119, -1478, -623, 2.8, 2.6], [1125, -1478, -622.6, 2.8, 2.6], [1132, -1478, -622.2, 2.6, 2.4]], 0.15),
  ],
  blend: 0.9,
  rooms: [room("meridian_crack.cleft", "shaft", "Terrace crack", 10), room("meridian_crack.slot", "passage", "Wall slot", 7)],
  portals: [
    portal("meridian_crack.mouth.terrace", "skylight", "Terrace mouth", "meridian_crack.cleft", EXTERIOR, v(1119, -600.3, -1478), "+y", 2, 2),
    portal("meridian_crack.mouth.slot", "mouth", "Wall slot", "meridian_crack.slot", EXTERIOR, v(1127.4, -621.5, -1478), "+x", 1.2, 1.2),
  ],
  routes: [
    route("meridian_crack.route.shortcut", "diver", "loop", [
      [1119, -599.4, -1478], [1119, -599.4, -1478], [1120.25, -622.4, -1478], [1121.5, -621.9, -1478], [1129.6, -621.88, -1478], [1136, -624.2, -1478],
    ]),
  ],
  staging: [],
  note: "CA-3 small. Down the crack, out the slot, and the third terrace is a free descent below.",
};

const CRACK: DeepCave = {
  source: CRACK_SOURCE, bible: ["meridian_terrace_crack"], size: "small", style: "cut_void",
  exits: { "terrace mouth": "meridian_crack.mouth.terrace", "wall slot": "meridian_crack.mouth.slot" },
  contents: [
    { id: "meridian_crack.shortcut", kind: "shortcut", bible: { kind: "line", cave: "meridian_terrace_crack", line: "Shortcut between terraces" },
      room: "meridian_crack.slot", at: v(1126, -622, -1478), read: "The slot looks straight down the wall to the third terrace." },
  ],
  cues: [
    { id: "meridian_crack.cue.line", species: "cable_tender", kind: "live_line", room: "meridian_crack.cleft", meaning: "live_line", color: TENDER, feeds: "meridian_cut_ceramic",
      points: [v(1117.4, -601, -1478.6), v(1117.4, -611, -1478.6), v(1117.4, -621, -1478.6)],
      read: "Tenders climb a live cable down the cleft and out the slot toward the cut strata's work lamps." },
    { id: "meridian_crack.cue.slot", kind: "colony", room: "meridian_crack.slot", meaning: "exit", exit: "meridian_crack.mouth.slot", color: TEAL,
      points: [v(1124, -621.2, -1477), v(1124, -621.2, -1479)], read: "Teal colonies by the wall slot." },
    { id: "meridian_crack.cue.cleft", kind: "glimmer", room: "meridian_crack.cleft", meaning: "exit", exit: "meridian_crack.mouth.terrace", color: AMBER,
      points: [v(1120.4, -620, -1478), v(1120.4, -602, -1478)], read: "Amber colonies climb the cleft wall toward the terrace above." },
  ],
  hazards: [],
};

// --- Window gallery (medium) ----------------------------------------------------------------

/** In the first terrace's wall, 50 m east of the clear lane down to the
 * second terrace. A masonry block on the terrace's edge holds the window
 * room; its wide window mouth faces the lane. The gallery drops 28 m as a
 * cut shaft a Mantle can descend to the sump room, which opens through the
 * wall mouth at 555 m, 45 m above the second terrace. A diver's service
 * stair climbs from the sump room back to the window room. */
const WINDOW_SOURCE: CaveSource = {
  id: "meridian_window_gallery",
  label: "Window gallery",
  region: "deep_district",
  footprint: { minX: 1014, maxX: 1052, minZ: -1326, maxZ: -1288 },
  baseY: -604,
  topY: -506,
  terraces: [terrace("meridian_window.terrace.block", -509, [1031, -1302], [11, 11], 6, 0, 0.15, 14)],
  carves: [
    tube("meridian_window.carve.mouth", "meridian_window.window_room", [[1010, -1302, -519.6, 11.5, 7], [1021, -1302, -520.5, 11.5, 7], [1026, -1302, -522, 11.5, 7]], 0.15),
    chamber("meridian_window.carve.room", "meridian_window.window_room", [1031, -520, -1302], [8, 8.5, 7, 4], -524.5, 0.2),
    shaft("meridian_window.carve.gallery", "meridian_window.gallery", [1033, -1302], 7.6, 0, -553, -521, 0.2),
    chamber("meridian_window.carve.sump", "meridian_window.sump_room", [1033, -551, -1302], [8.5, 8.5, 7, 5], -556, 0.2),
    tube("meridian_window.carve.wall", "meridian_window.sump_room", [[1026, -1309, -556, 11.5, 7.5], [1056, -1309, -555.5, 11.5, 7.5]], 0.15),
    tube("meridian_window.carve.stair_foot", "meridian_window.stair", [[1025, -1309, -554.8, 3.4, 3.2], [1025, -1314.5, -554, 3.4, 3.2]], 0.12),
    shaft("meridian_window.carve.stair", "meridian_window.stair", [1025, -1314.5], 1.8, 0, -554, -526.5, 0.12),
    tube("meridian_window.carve.stair_head", "meridian_window.stair", [[1025, -1314.5, -527.6, 3.4, 3.2], [1025, -1308.5, -524.6, 3.4, 3.2]], 0.12),
  ],
  blend: 1.4,
  rooms: [
    room("meridian_window.window_room", "chamber", "Window room", 14),
    room("meridian_window.gallery", "shaft", "Gallery", 14),
    room("meridian_window.sump_room", "chamber", "Sump room", 14),
    room("meridian_window.stair", "passage", "Service stair", 10),
  ],
  portals: [
    portal("meridian_window.mouth.window", "mouth", "Window mouth", "meridian_window.window_room", EXTERIOR, v(1020.5, -518.2, -1302), "-x", 10, 4.6, ["diver", "medium"]),
    portal("meridian_window.mouth.wall", "mouth", "Wall mouth", "meridian_window.sump_room", EXTERIOR, v(1045, -552.5, -1309), "+x", 10, 4.6, ["diver", "medium"]),
  ],
  routes: [
    route("meridian_window.route.descent", "medium", "loop", [
      [1004, -519.7, -1302], [1012.57, -519.64, -1302], [1024, -519.78, -1302], [1028.67, -520.8, -1302], [1031, -522.3, -1302], [1033, -525.8, -1302],
      [1033, -539.8, -1302], [1033, -555.3, -1304.33], [1035.75, -555.3, -1309], [1049.33, -555.27, -1309], [1054.67, -555.3, -1309], [1060, -557.2, -1309],
    ]),
    route("meridian_window.route.stair", "diver", "loop", [
      [1060, -556.8, -1309], [1047, -554.87, -1309], [1040, -554.87, -1309], [1026, -555.35, -1309], [1025, -554.4, -1313.58], [1025, -529.4, -1314.5],
      [1025, -526.4, -1313.58], [1025, -525.4, -1312.67], [1025, -523.9, -1309.92], [1027.4, -523.88, -1305.8], [1022, -519.88, -1302], [1017, -519.37, -1302],
      [1006, -519.35, -1302],
    ]),
  ],
  staging: [
    { id: "meridian_window.parking", role: "craft_parking", label: "Terrace parking west of the window mouth", position: v(1004, -518.5, -1290), radius: 9, profiles: ["small", "medium"] },
  ],
  note: "CA-3 medium. Loop: window room - gallery - sump room - service stair. Hall: Creel 800 and Mantle (medium profile); keel 520-555 m.",
};

const WINDOW: DeepCave = {
  source: WINDOW_SOURCE, bible: ["meridian_window_gallery"], size: "medium", style: "cut_void",
  exits: { "window mouth": "meridian_window.mouth.window", "wall mouth": "meridian_window.mouth.wall" },
  hall: { profile: "medium", craft: ["creel", "mantle"], note: "Keel 520-555 m: only the Creel's 800 m refit and the Mantle are rated; the 9 m box clears window, gallery shaft and sump." },
  graph: {
    chambers: { "window room": ["meridian_window.window_room"], gallery: ["meridian_window.gallery"], "sump room": ["meridian_window.sump_room"] },
    loopCloser: { passage: "service_stair", rooms: ["meridian_window.stair"] },
  },
  contents: [
    { id: "meridian_window.ceramic", kind: "resource", bible: { kind: "resource", id: "meridian_window_ceramic" }, room: "meridian_window.sump_room",
      at: v(1027, -554.5, -1298), item: "pressure_ceramic", stock: 10, read: "The builders cut through ceramic strata; it shows pale in the sump room's walls." },
    { id: "meridian_window.work_pocket", kind: "view", bible: { kind: "line", cave: "meridian_window_gallery", line: "A protected work pocket with a view" },
      room: "meridian_window.window_room", at: v(1025, -522, -1302), read: "From the window room: the clear lane and the terraces below, out of the choir's water." },
  ],
  cues: [
    { id: "meridian_window.cue.line", species: "cable_tender", kind: "live_line", room: "meridian_window.gallery", meaning: "live_line", color: TENDER, feeds: "meridian_cut_ceramic",
      points: [v(1040.2, -523, -1302), v(1040.2, -538, -1302), v(1040.6, -552, -1302), v(1043, -553.5, -1309)],
      read: "Tenders follow a cable down the gallery wall and out the wall mouth toward the cut strata's burning work lamps." },
    { id: "meridian_window.cue.window", kind: "colony", room: "meridian_window.window_room", meaning: "exit", exit: "meridian_window.mouth.window", color: AMBER,
      points: [v(1023, -519, -1296.5), v(1023, -519, -1307.5)], read: "Amber colonies frame the window mouth." },
    { id: "meridian_window.cue.wall", kind: "colony", room: "meridian_window.sump_room", meaning: "exit", exit: "meridian_window.mouth.wall", color: TEAL,
      points: [v(1041, -553, -1303.5), v(1041, -553, -1314.5)], read: "Teal colonies frame the wall mouth." },
  ],
  hazards: [],
};

// --- Escarpment culvert (medium) ------------------------------------------------------------

/** A drainage culvert through the escarpment's foot, west of the return
 * route (moved 20 m west; the route crossed the bible footprint). The foot
 * mouth opens on the west slope at 530 m; the lower culvert runs east to the
 * upper chamber under the ledge, which drains up through a broad ledge mouth
 * (a sump a Mantle rises through). An overflow tunnel loops from the upper
 * chamber back down into the lower culvert. */
const CULVERT_E_SOURCE: CaveSource = {
  id: "meridian_escarp_culvert",
  label: "Escarpment culvert",
  region: "deep_district",
  footprint: { minX: 1320, maxX: 1352, minZ: -990, maxZ: -946 },
  baseY: -555,
  topY: -506,
  terraces: [],
  carves: [
    tube("meridian_escarp.carve.lower", "meridian_escarp.lower_culvert", [[1314, -974, -536.2, 11.5, 7.5], [1326, -974, -536.2, 11.5, 7.5], [1336, -974, -536, 11.5, 7.5]], 0.2),
    chamber("meridian_escarp.carve.upper", "meridian_escarp.upper_chamber", [1342, -528, -974], [8, 8, 8, 8], -536, 0.25),
    shaft("meridian_escarp.carve.ledge", "meridian_escarp.ledge_sump", [1342, -974], 7.4, 0, -524, -507.5, 0.15),
    tube("meridian_escarp.carve.overflow", "meridian_escarp.overflow", [
      [1342, -965, -527, 3.2, 3], [1342, -951.5, -527.5, 3.2, 3], [1336, -951.5, -529.5, 3.2, 3], [1329, -951.5, -531.5, 3.2, 3], [1328, -962, -534, 3.2, 3], [1328, -969.5, -535.6, 3.2, 3],
    ], 0.15),
  ],
  blend: 1.4,
  rooms: [
    room("meridian_escarp.lower_culvert", "passage", "Lower culvert", 14),
    room("meridian_escarp.upper_chamber", "chamber", "Upper chamber", 14),
    room("meridian_escarp.ledge_sump", "shaft", "Ledge sump", 14),
    room("meridian_escarp.overflow", "passage", "Overflow tunnel", 9),
  ],
  portals: [
    portal("meridian_escarp.mouth.foot", "mouth", "Foot mouth", "meridian_escarp.lower_culvert", EXTERIOR, v(1326.5, -533.4, -974), "-x", 10, 4.6, ["diver", "medium"]),
    portal("meridian_escarp.mouth.ledge", "skylight", "Ledge mouth", "meridian_escarp.ledge_sump", EXTERIOR, v(1342, -515, -974), "+y", 10, 10, ["diver", "medium"]),
  ],
  routes: [
    route("meridian_escarp.route.through", "medium", "loop", [
      [1308, -538.1, -974], [1316, -535.76, -974], [1330, -535.76, -974], [1340, -534.8, -974], [1342, -514.8, -974], [1342, -505.8, -974],
      [1342, -505.8, -974],
    ]),
    route("meridian_escarp.route.overflow", "diver", "loop", [
      [1310, -537.98, -974], [1322.46, -535.4, -973.31], [1328, -533.9, -966.5], [1328.75, -530.88, -954.13], [1329, -530.4, -951.5], [1331.8, -529.4, -951.5],
      [1340.5, -526.9, -951.5], [1342, -526.88, -956], [1342, -526.37, -957.5], [1342, -524.32, -971], [1342, -507.4, -974], [1342, -507.4, -974],
    ]),
  ],
  staging: [
    { id: "meridian_escarp.parking", role: "craft_parking", label: "Slope station-keeping off the foot mouth", position: v(1304, -528, -974), radius: 8, profiles: ["small", "medium"] },
  ],
  note: "CA-3 medium. Loop: lower culvert - upper chamber - overflow tunnel. Hall: Creel 800 and Mantle; keel 503-536 m. The ledge mouth reveals the return ledge.",
};

const CULVERT_E: DeepCave = {
  source: CULVERT_E_SOURCE, bible: ["meridian_escarp_culvert"], size: "medium", style: "cut_void",
  exits: { "foot mouth": "meridian_escarp.mouth.foot", "ledge mouth": "meridian_escarp.mouth.ledge" },
  hall: { profile: "medium", craft: ["creel", "mantle"], note: "Keel 503-536 m: the Creel's 800 m refit and the Mantle; the craft rises through the ledge sump onto the return ledge." },
  graph: {
    chambers: { "lower culvert": ["meridian_escarp.lower_culvert"], "upper chamber": ["meridian_escarp.upper_chamber"], "overflow tunnel": ["meridian_escarp.overflow"] },
    loopCloser: { passage: "overflow_out", rooms: ["meridian_escarp.overflow"] },
  },
  contents: [
    { id: "meridian_escarp.ledge_reveal", kind: "shortcut", bible: { kind: "reward", id: "meridian.return_ledge" },
      room: "meridian_escarp.ledge_sump", at: v(1342, -512, -974), read: "Rising out of the sump: the return ledge runs north along the escarpment toward the Canopy." },
  ],
  cues: [
    { id: "meridian_escarp.cue.foot", kind: "colony", room: "meridian_escarp.lower_culvert", meaning: "exit", exit: "meridian_escarp.mouth.foot", color: TEAL,
      points: [v(1331, -533.2, -969.6), v(1331, -533.2, -978.4)], read: "Teal colonies frame the foot mouth." },
    { id: "meridian_escarp.cue.sump", kind: "glimmer", room: "meridian_escarp.upper_chamber", meaning: "exit", exit: "meridian_escarp.mouth.ledge", color: AMBER,
      points: [v(1336, -530, -969), v(1338, -521, -969)], read: "Amber colonies climb the chamber wall to the ledge sump." },
    { id: "meridian_escarp.cue.overflow", species: "cable_tender", kind: "live_line", room: "meridian_escarp.overflow", meaning: "live_line", color: TENDER, feeds: "meridian.spire",
      points: [v(1342.8, -526, -958), v(1336, -528, -950.2), v(1329, -530, -950.2)], read: "A live line runs the overflow's roof, tenders strung along it." },
  ],
  hazards: [],
};

export const MERIDIAN_CAVES: readonly DeepCave[] = [FOOTING, CULVERT, SPIRE, POCKET, CRACK, WINDOW, CULVERT_E];
