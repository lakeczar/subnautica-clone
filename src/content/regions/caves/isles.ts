import type { CaveSource, CaveStyle, TerraceSource } from "../caves.js";
import { asRoom, chamber, n, OUT, p, parking, portal, room, route, shaft, terrace, tube } from "./author.js";

/** Splitspine Isles small and medium caves (CA-1), authored with the W1 kit
 * from the content bible (`docs/content/regions/splitspine-isles.md`). Tidal
 * undercuts: wave-cut basalt galleries with flat wet floors, ceilings polished
 * by surge and light coming sideways from the sea; tide clappers band the walls. */

const ISLES_STYLE: CaveStyle = { rock: "basalt", resident: "tide_clapper" };

// --- Scar crawl ----------------------------------------------------------------
// A fresh slump block on the scar's steep west face. Two pockets joined by a
// squeeze: the lower holds the scar mouth; the upper opens west onto the
// scar at its north end, toward the Undercroft's scar-mouth zone (its back
// entrance, wired when the Undercroft is built).

const SCAR_CRAWL: CaveSource = {
  id: "isles_scar_crawl",
  label: "Scar crawl",
  region: "island_chain",
  footprint: { minX: 350, maxX: 378, minZ: 30, maxZ: 61 },
  baseY: -48,
  topY: -13,
  terraces: [
    terrace("isles_scar_crawl.block", -16.5, [366, 46], [6, 11], { exponent: 4, batter: 0.1, wobble: 0.3, wavelength: 6 }),
  ],
  carves: [
    tube("isles_scar_crawl.carve.lower_mouth", "isles_scar_crawl.lower_pocket", 0.2, [n(358.8, 41.6, -28.3, 3.2, 3), n(361, 41.6, -28.2, 3.2, 3)]),
    chamber("isles_scar_crawl.carve.lower", "isles_scar_crawl.lower_pocket", 0.35, p(362.8, -26.5, 41.6), { x: 3.6, z: 3.4, up: 2.4, down: 1.8 }, -28.2),
    tube("isles_scar_crawl.carve.squeeze", "isles_scar_crawl.squeeze", 0.1, [
      n(363.4, 44.2, -27.4, 2.3, 2.6), n(364, 47.5, -25.6, 2.1, 2.5), n(364, 50.5, -24.2, 2.4, 2.6),
    ]),
    chamber("isles_scar_crawl.carve.upper", "isles_scar_crawl.upper_pocket", 0.3, p(364, -22, 53), { x: 3.4, z: 3.2, up: 2.2, down: 1.6 }, -23.6),
    tube("isles_scar_crawl.carve.upper_mouth", "isles_scar_crawl.upper_pocket", 0.2, [n(361.5, 53.5, -23.6, 3, 2.8), n(359.6, 53.8, -23.8, 3, 2.8)]),
  ],
  blend: 1.1,
  rooms: [
    room("isles_scar_crawl.lower_pocket", "chamber", "Lower pocket", 6),
    room("isles_scar_crawl.squeeze", "passage", "Scar squeeze", 6),
    room("isles_scar_crawl.upper_pocket", "chamber", "Upper pocket", 6),
  ],
  portals: [
    portal("isles_scar_crawl.mouth.scar", "mouth", "Scar mouth", ["isles_scar_crawl.lower_pocket", OUT], p(359.4, -26.9, 41.6), "-x", 2.6, 2.6),
    portal("isles_scar_crawl.mouth.upper", "mouth", "Upper scar mouth", ["isles_scar_crawl.upper_pocket", OUT], p(360.1, -22.3, 53.7), "-x", 2.6, 2.6),
    portal("isles_scar_crawl.throat.low", "throat", "Squeeze foot", ["isles_scar_crawl.lower_pocket", "isles_scar_crawl.squeeze"], p(363.4, -26.2, 44.4), "+z", 1.6, 1.6),
    portal("isles_scar_crawl.throat.high", "throat", "Squeeze head", ["isles_scar_crawl.squeeze", "isles_scar_crawl.upper_pocket"], p(364, -23.2, 50.5), "+z", 1.6, 1.6),
  ],
  routes: [
    route("isles_scar_crawl.route.through", "loop", [
      p(355, -27.6, 41.6), p(358.8, -27.6, 41.6), p(361, -27.5, 41.6), p(362.8, -27.5, 41.8), p(363.4, -26.7, 44.2), p(364, -25, 47.5),
      p(364, -23.6, 50.5), p(364, -23, 53), p(361.5, -23, 53.5), p(359.6, -23.1, 53.8), p(356, -23.1, 54),
    ]),
    route("isles_scar_crawl.route.squeeze_back", "exit", [p(364, -25, 47.5), p(363.4, -26.7, 44.2), p(362.8, -27.5, 41.8), p(361, -27.5, 41.6),
      p(358.8, -27.6, 41.6), p(355, -27.6, 41.6)]),
  ],
  staging: [],
  note: "Two 8 m pockets in a fresh slump block on the scar, joined by a squeeze: raw basalt, no growth yet. " +
    "The upper pocket opens toward the Undercroft's scar mouth: the quiet back way in.",
  style: ISLES_STYLE,
};

// --- Surf cave -------------------------------------------------------------------

const SURF_CAVE: CaveSource = {
  id: "isles_surf_cave",
  label: "Surf cave",
  region: "island_chain",
  footprint: { minX: 528, maxX: 558, minZ: 102, maxZ: 126 },
  baseY: -18,
  topY: 7,
  terraces: [
    // The stack's east surf ledge, just under the surface where the swell breaks.
    terrace("isles_surf_cave.ledge", -2.5, [543, 112], [6, 7], { exponent: 3, batter: 0.15, wobble: 0.4, wavelength: 7 }),
  ],
  carves: [
    tube("isles_surf_cave.carve.surge", "isles_surf_cave.surge", 0.25, [n(549.6, 112, -12.4, 5, 5.6), n(544, 112, -12.2, 5.4, 6)]),
    chamber("isles_surf_cave.carve.back", "isles_surf_cave.back", 0.35, p(539.5, -9.5, 112), { x: 4, z: 4, up: 3, down: 2.5 }, -12),
  ],
  blend: 1.3,
  rooms: [
    room("isles_surf_cave.surge", "passage", "Surge run", 9),
    room("isles_surf_cave.back", "chamber", "Back wall", 7),
  ],
  portals: [
    portal("isles_surf_cave.mouth.surf", "mouth", "Surf mouth", ["isles_surf_cave.surge", OUT], p(549.1, -10.2, 112), "+x", 3.6, 4),
    portal("isles_surf_cave.throat.back", "throat", "Back wall", ["isles_surf_cave.surge", "isles_surf_cave.back"], p(543.5, -9.6, 112), "-x", 3.6, 4),
  ],
  routes: [
    route("isles_surf_cave.route.back", "exit", [p(538, -11.3, 112), p(544, -11.5, 112), p(549.6, -11.6, 112), p(554, -11.8, 112)]),
  ],
  staging: [],
  note: "A 12 m wave cave under the stack's east surf ledge: surge washes in and out over a pale floor scoured clean, " +
    "a clapper colony bands the polished ceiling.",
  style: ISLES_STYLE,
};

// --- The cove network: Cove undercut, Cove crawl, Headland root stair -----------
// Under the south cove's basalt rim and down the slope toward the Canopy. The
// footprints share edges at x = 980 and x = 1004; every terrace that reaches
// across a seam is listed in both sources. The root stair's lower end is the
// back stair into the Canopy rootways (wired when the rootways are built).
const COVE = { baseY: -52, topY: -4 } as const;
const COVE_RIM: readonly TerraceSource[] = [
  terrace("isles_cove.rim", -8, [968, -56], [11, 5.5], { exponent: 2.8, batter: 0.2, wobble: 0.45, wavelength: 8 }),
  terrace("isles_cove.rim.east", -11, [988, -59], [9, 5], { exponent: 2.8, batter: 0.2, wobble: 0.45, wavelength: 8 }),
];
const ROOT_BUTTRESS: readonly TerraceSource[] = [
  terrace("isles_headland_root.buttress", -20, [1015, -70], [11, 6], { exponent: 3, batter: 0.12, wobble: 0.5, wavelength: 8 }),
  // A saddle of fallen blocks roofing the root crawl between the rim and the buttress.
  terrace("isles_cove.saddle", -17, [999, -65.5], [6.5, 4], { exponent: 2.6, batter: 0.2, wobble: 0.4, wavelength: 7 }),
];
const UNDERCUT_CRAWL = tube("isles_cove.crawl.undercut", "", 0.15, [
  n(974.5, -56.5, -15.6, 2.6, 2.6), n(980, -58, -17.2, 2.4, 2.6), n(986, -61, -19.5, 2.4, 2.6), n(991, -63.5, -21.4, 2.6, 2.6),
]);
const ROOT_CRAWL = tube("isles_cove.crawl.root", "", 0.15, [
  n(991, -63.5, -21.4, 2.6, 2.6), n(998, -65.5, -24, 2.4, 2.6), n(1004, -67, -26.6, 2.4, 2.8), n(1007, -68.2, -28, 2.4, 3.2),
]);

const COVE_UNDERCUT: CaveSource = {
  id: "isles_cove_undercut",
  label: "Cove undercut",
  region: "island_chain",
  footprint: { minX: 950, maxX: 980, minZ: -66, maxZ: -46 },
  ...COVE,
  terraces: [...COVE_RIM, ...ROOT_BUTTRESS],
  carves: [
    tube("isles_cove_undercut.carve.mouth", "isles_cove_undercut.mouth", 0.2, [n(968, -50.8, -14.9, 6, 3.4), n(968, -52, -15.6, 6, 3.4)]),
    chamber("isles_cove_undercut.carve.undercut", "isles_cove_undercut.undercut", 0.3, p(968, -13.8, -56), { x: 7.5, z: 3.6, up: 1.9, down: 1.9 }, -15.8),
    chamber("isles_cove_undercut.carve.pocket.1", "isles_cove_undercut.undercut", 0.15, p(963, -12, -56.3), { x: 1.4, z: 1.3, up: 1.1, down: 0.6 }, -13),
    chamber("isles_cove_undercut.carve.pocket.2", "isles_cove_undercut.undercut", 0.15, p(968.2, -11.8, -57), { x: 1.5, z: 1.3, up: 1.1, down: 0.6 }, -13),
    chamber("isles_cove_undercut.carve.pocket.3", "isles_cove_undercut.undercut", 0.15, p(972.8, -12, -55.6), { x: 1.4, z: 1.3, up: 1.1, down: 0.6 }, -13),
    asRoom(UNDERCUT_CRAWL, "isles_cove_undercut.crawl"),
  ],
  blend: 1,
  rooms: [
    room("isles_cove_undercut.mouth", "passage", "Cove mouth", 8),
    room("isles_cove_undercut.undercut", "chamber", "Undercut", 6),
    room("isles_cove_undercut.crawl", "passage", "Cove crawl", 6),
  ],
  portals: [
    portal("isles_cove_undercut.mouth.cove", "mouth", "Cove mouth", ["isles_cove_undercut.mouth", OUT], p(968, -13.6, -50.4), "+z", 4.6, 2.4),
    portal("isles_cove_undercut.throat.undercut", "throat", "Undercut", ["isles_cove_undercut.mouth", "isles_cove_undercut.undercut"], p(968, -14, -52.5), "-z", 4.6, 2.6),
    portal("isles_cove_undercut.throat.crawl", "throat", "Cove crawl", ["isles_cove_undercut.undercut", "isles_cove_undercut.crawl"], p(975, -14.3, -56.7), "+x", 1.8, 1.6),
  ],
  routes: [
    route("isles_cove_undercut.route.undercut", "exit", [p(962.5, -14.7, -56), p(968, -15.1, -56), p(968, -14.8, -52.5), p(968, -14.2, -49.5), p(968, -13.8, -46)]),
  ],
  staging: [],
  note: "A 14 m undercut under the cove's south rim, low and wide: drift resin floats up and lodges in its ceiling pockets " +
    "(resin floats: look up). A crawl leaves its east end under the rim.",
  style: ISLES_STYLE,
};

const COVE_CRAWL: CaveSource = {
  id: "isles_cove_crawl",
  label: "Cove crawl",
  region: "island_chain",
  footprint: { minX: 980, maxX: 1004, minZ: -78, maxZ: -48 },
  ...COVE,
  terraces: [...COVE_RIM, ...ROOT_BUTTRESS],
  carves: [
    asRoom(UNDERCUT_CRAWL, "isles_cove_crawl.crawl"),
    tube("isles_cove_crawl.carve.slope", "isles_cove_crawl.slope", 0.2, [n(991, -63.5, -21.4, 2.8, 2.8), n(991.5, -66.4, -22.4, 3.2, 3)]),
    asRoom(ROOT_CRAWL, "isles_cove_crawl.root_crawl"),
  ],
  blend: 1,
  rooms: [
    room("isles_cove_crawl.crawl", "passage", "Cove crawl", 6),
    room("isles_cove_crawl.slope", "passage", "Slope mouth", 8),
    room("isles_cove_crawl.root_crawl", "passage", "Root crawl", 6),
  ],
  portals: [
    portal("isles_cove_crawl.mouth.slope", "mouth", "Slope mouth", ["isles_cove_crawl.slope", OUT], p(991.4, -20.8, -66.2), "-z", 2.6, 2.2),
  ],
  routes: [
    route("isles_cove_crawl.route.slope", "link", [
      p(968, -13.8, -46), p(968, -14.2, -49.5), p(968, -14.8, -52.5), p(968, -15.1, -56), p(972, -15.1, -56), p(974.5, -15, -56.5), p(980, -16.6, -58),
      p(986, -18.9, -61), p(991, -20.8, -63.5), p(991.5, -21.8, -66.4), p(991.5, -22, -70),
    ]),
    route("isles_cove_crawl.route.rescue", "exit", [p(984, -18.3, -60), p(986, -18.9, -61), p(991, -20.8, -63.5), p(991.5, -21.8, -66.4), p(991.5, -22, -70)]),
  ],
  staging: [],
  note: "A 16 m crawl from the undercut under the rim, emerging on the slope; a sealed float tin with two nav beacons " +
    "is wedged at the bend. A second crawl continues down to the root stair.",
  style: ISLES_STYLE,
};

const HEADLAND_ROOT: CaveSource = {
  id: "isles_headland_root",
  label: "Headland root stair",
  region: "island_chain",
  footprint: { minX: 1004, maxX: 1030, minZ: -80, maxZ: -56 },
  ...COVE,
  terraces: [...ROOT_BUTTRESS, ...COVE_RIM],
  carves: [
    asRoom(ROOT_CRAWL, "isles_headland_root.crawl"),
    tube("isles_headland_root.carve.crack", "isles_headland_root.crack", 0.2, [
      n(1007, -68.2, -28, 2.4, 4), n(1010, -69.5, -30, 2.4, 6), n(1016, -71, -33, 2.4, 6.5), n(1022, -72, -34.6, 2.8, 6),
      n(1027.6, -72, -34.9, 3, 5.4),
    ]),
  ],
  blend: 1,
  rooms: [
    room("isles_headland_root.crawl", "passage", "Root crawl", 6),
    room("isles_headland_root.crack", "passage", "Root stair", 7),
  ],
  portals: [
    portal("isles_headland_root.mouth.slope", "mouth", "Slope mouth", ["isles_headland_root.crack", OUT], p(1027.4, -32.8, -72), "+x", 2.6, 3.6),
  ],
  routes: [
    route("isles_headland_root.route.cove", "link", [
      p(968, -13.8, -46), p(968, -14.2, -49.5), p(968, -14.8, -52.5), p(968, -15.1, -56), p(972, -15.1, -56), p(974.5, -15, -56.5), p(980, -16.6, -58),
      p(986, -18.9, -61), p(991, -20.8, -63.5), p(998, -23.4, -65.5), p(1004, -26, -67), p(1007, -27.4, -68.2), p(1010, -29.4, -69.5),
      p(1016, -32.4, -71), p(1022, -34, -72), p(1027.6, -34.2, -72), p(1032, -34, -72),
    ]),
    route("isles_headland_root.route.crack", "exit", [p(1010, -29.4, -69.5), p(1016, -32.4, -71), p(1022, -34, -72), p(1027.6, -34.2, -72), p(1032, -34, -72)]),
  ],
  staging: [],
  note: "A 20 m sloping crack where Canopy root ends break through the basalt, root tips glowing with rootglow buds. " +
    "It drops to a slope mouth; its foot is the back stair into the Canopy rootways.",
  style: ISLES_STYLE,
};

// --- East ledge cave ----------------------------------------------------------------

const EAST_LEDGE: CaveSource = {
  id: "isles_east_ledge_cave",
  label: "East ledge cave",
  region: "island_chain",
  footprint: { minX: 1138, maxX: 1170, minZ: 28, maxZ: 54 },
  baseY: -46,
  topY: -10,
  terraces: [
    // The button ledges' lip, overhanging the slope above the mouth.
    terrace("isles_east_ledge_cave.lip", -15, [1152, 41], [6, 9], { exponent: 3, batter: 0.2, wobble: 0.4, wavelength: 7 }),
  ],
  carves: [
    tube("isles_east_ledge_cave.carve.mouth", "isles_east_ledge_cave.mouth", 0.2, [n(1159.4, 41, -22.5, 6, 4), n(1155, 41, -22.5, 6, 4)]),
    chamber("isles_east_ledge_cave.carve.undercut", "isles_east_ledge_cave.undercut", 0.3, p(1147, -20.2, 41), { x: 6, z: 4.5, up: 2.4, down: 2.4 }, -22.5),
  ],
  blend: 1.3,
  rooms: [
    room("isles_east_ledge_cave.mouth", "passage", "Ledge mouth", 8),
    room("isles_east_ledge_cave.undercut", "chamber", "Undercut", 6),
  ],
  portals: [
    portal("isles_east_ledge_cave.mouth.ledge", "mouth", "Ledge mouth", ["isles_east_ledge_cave.mouth", OUT], p(1158.8, -20.8, 41), "+x", 4.4, 3.2),
    portal("isles_east_ledge_cave.throat.undercut", "throat", "Undercut", ["isles_east_ledge_cave.mouth", "isles_east_ledge_cave.undercut"], p(1154, -20.8, 41), "-x", 4.4, 3.2),
  ],
  routes: [
    route("isles_east_ledge_cave.route.back", "exit", [p(1143, -21.9, 41), p(1150, -21.9, 41), p(1155, -21.9, 41), p(1159.4, -21.9, 41), p(1164, -22, 41)]),
  ],
  staging: [],
  note: "An 18 m flat-floored undercut below the button ledges; shore buttons line its lip. " +
    "A storm-tossed survey float is wedged at the back.",
  style: ISLES_STYLE,
};

// --- Blowhole -------------------------------------------------------------------------
// A basalt stack fallen against the north cliff foot (the cliff itself stays
// heightfield). A surge cave runs in from the north; a chimney rises from it
// to the waterline and on, open to the sky at the stack's top (daylight and
// air, not a way out: nothing climbs it). At the waterline a wading shelf
// leads to a dry ledge. The game's movement fixes their heights: a swimmer
// floats with its feet at -0.5 and stands where support is at least -0.55,
// and steps up at most 0.22 m without a jump. So the shelf's rock tops out at
// -0.5 (swim on, stand up), and the dry ledge one 0.5 m voxel higher, at 0
// (a walker's jump). The cliff view is from the mouth's apron, not the ledge.

const BLOWHOLE: CaveSource = {
  id: "isles_blowhole",
  label: "Blowhole",
  region: "island_chain",
  footprint: { minX: 1062, maxX: 1084, minZ: 124, maxZ: 146 },
  baseY: -28,
  topY: 9,
  terraces: [
    terrace("isles_blowhole.stack", 5, [1072, 134], [6.5, 6], { exponent: 2.8, batter: 0.08, wobble: 0.4, wavelength: 7 }),
  ],
  carves: [
    tube("isles_blowhole.carve.surge", "isles_blowhole.surge", 0.2, [n(1072, 141, -14.5, 3.4, 4), n(1072, 137, -15.5, 3.4, 4.2)]),
    chamber("isles_blowhole.carve.chamber", "isles_blowhole.surge", 0.3, p(1072, -14, 133), { x: 3.6, z: 3.4, up: 3, down: 2.4 }, -16.5),
    shaft("isles_blowhole.carve.chimney", "isles_blowhole.chimney", 0.15, [1073, 131.5], 1.5, 0.4, -15, 6.5),
    chamber("isles_blowhole.carve.shelf", "isles_blowhole.ledge", 0.1, p(1071.3, 0.9, 131.5), { x: 1.1, z: 1.4, up: 1.6, down: 1.4 }, -0.45),
    chamber("isles_blowhole.carve.ledge", "isles_blowhole.ledge", 0.1, p(1069.6, 1.2, 131.5), { x: 1.5, z: 1.4, up: 1.3, down: 1 }, 0.2),
  ],
  blend: 1,
  rooms: [
    room("isles_blowhole.surge", "chamber", "Surge cave", 7),
    room("isles_blowhole.chimney", "shaft", "Chimney", 10),
    room("isles_blowhole.ledge", "pocket", "Dry ledge", 8),
  ],
  portals: [
    portal("isles_blowhole.mouth.surge", "mouth", "Cliff-foot mouth", ["isles_blowhole.surge", OUT], p(1072, -12.9, 140.6), "+z", 2.6, 3),
    portal("isles_blowhole.throat.chimney", "throat", "Chimney foot", ["isles_blowhole.surge", "isles_blowhole.chimney"], p(1073, -11, 131.5), "+y", 2, 2),
    portal("isles_blowhole.throat.ledge", "throat", "Wading shelf", ["isles_blowhole.chimney", "isles_blowhole.ledge"], p(1071.6, 0.6, 131.5), "-x", 1.6, 1.6),
    // Daylight and air only: a diver surfaces under it but cannot climb out.
    portal("isles_blowhole.skylight.top", "skylight", "Chimney top (light)", ["isles_blowhole.chimney", OUT], p(1073, 4.5, 131.5), "+y", 2, 2),
  ],
  routes: [
    // The way back from the dry ledge: off the step, off the shelf into the
    // chimney, down it and out the mouth. Reversed, it is the way in.
    route("isles_blowhole.route.ledge", "exit", [
      p(1069.5, 0.01, 131.5), p(1070.84, 0.01, 131.5), p(1070.9, -0.49, 131.5), p(1072.8, -0.5, 131.5), p(1073, -5, 131.5), p(1073, -13, 131.5),
      p(1072, -15.6, 133), p(1072, -14.6, 137), p(1072, -13.9, 141), p(1072, -13.4, 145),
    ]),
    route("isles_blowhole.route.surge", "exit", [p(1072, -15.6, 133), p(1072, -14.6, 137), p(1072, -13.9, 141), p(1072, -13.4, 145)]),
  ],
  staging: [],
  note: "A 15 m surge cave in a stack at the north cliff foot, up a chimney to the waterline: a diver surfaces under the " +
    "open top, swims onto a wading shelf, stands, and jumps up onto a dry ledge stash. One way out, the cliff-foot mouth.",
  style: ISLES_STYLE,
};

// --- Storm arch (medium) -------------------------------------------------------
// A long basalt spur on the shelf off the headland's north-east point (the
// headland cliff stays heightfield, across the channel to the west). Hull
// passages run along an axis. Loop (bible `gallery_back`): north hall ->
// skylight hall -> glass gallery -> back passage under the hall floor -> north hall.
// The north hall turns west to the cliff-foot mouth on the channel shelf: the
// world ends at Z 160, so nothing opens north.

const STORM_ARCH: CaveSource = {
  id: "isles_storm_arch",
  label: "Storm arch",
  region: "island_chain",
  footprint: { minX: 1147, maxX: 1184, minZ: 55, maxZ: 150 },
  baseY: -48,
  topY: 0,
  terraces: [
    // Three overlapping blocks, not one 10 x 45 m prism: a terrace's batter
    // is scaled by its shorter radius, so a long thin one sprawls at its tips.
    terrace("isles_storm_arch.spur.north", -3, [1158.5, 131], [10, 14], { exponent: 4, batter: 0.04, wobble: 0.7, wavelength: 12 }),
    terrace("isles_storm_arch.spur.middle", -3, [1158.5, 105], [10, 18], { exponent: 4, batter: 0.04, wobble: 0.7, wavelength: 12 }),
    terrace("isles_storm_arch.spur.south", -3, [1158.5, 77], [10, 18], { exponent: 4, batter: 0.04, wobble: 0.7, wavelength: 12 }),
  ],
  carves: [
    tube("isles_storm_arch.carve.north_hall", "isles_storm_arch.north_hall", 0.3, [
      n(1157, 135, -17.8, 11, 8.5), n(1157, 126, -18.2, 11, 8.5), n(1157, 117, -18.4, 11, 8),
    ]),
    tube("isles_storm_arch.carve.cliff_mouth", "isles_storm_arch.north_hall", 0.3, [n(1157, 135, -17.8, 11, 8.5), n(1147, 135, -16.2, 11, 9.5)]),
    chamber("isles_storm_arch.carve.skylight_hall", "isles_storm_arch.skylight_hall", 0.5, p(1157, -12.5, 106), { x: 6.5, z: 10, up: 5.5, down: 6 }, -18),
    shaft("isles_storm_arch.carve.crack", "isles_storm_arch.crack", 0.2, [1155, 108], 1.3, 0.5, -10, -1.5),
    tube("isles_storm_arch.carve.east_mouth", "isles_storm_arch.east_mouth", 0.3, [n(1161, 102, -18, 10, 7), n(1169.6, 101.5, -19.4, 10, 7)]),
    tube("isles_storm_arch.carve.gallery_in", "isles_storm_arch.gallery", 0.2, [n(1155.5, 98, -17, 2.8, 3), n(1155.5, 92, -17.2, 2.8, 3)]),
    chamber("isles_storm_arch.carve.gallery", "isles_storm_arch.gallery", 0.35, p(1155.5, -15.6, 88), { x: 3.4, z: 4, up: 2.4, down: 1.8 }, -17.6),
    tube("isles_storm_arch.carve.back", "isles_storm_arch.back_passage", 0.2, [
      n(1155, 85, -17.6, 2.6, 3), n(1154, 82, -20.5, 2.6, 3.4), n(1153, 86, -24.5, 2.6, 3.2), n(1153.5, 94, -27.5, 2.6, 3),
      n(1154.5, 104, -29, 2.8, 3), n(1154.5, 112, -29.5, 2.8, 3), n(1153, 124, -29.5, 2.6, 2.8),
      n(1154.5, 129, -28.6, 2.6, 3), n(1156.5, 134, -26.4, 2.6, 3.2), n(1157.5, 139.5, -24, 2.6, 3.2),
    ]),
    // The skylight crack carries on down through the hall floor into the back
    // passage: its beam lights the passage midway, and it is a way up.
    shaft("isles_storm_arch.carve.floor_crack", "isles_storm_arch.floor_crack", 0.15, [1154.5, 108], 1.1, 0, -28.6, -17.4),
    // The back passage's end: a slot up through the north hall's floor.
    shaft("isles_storm_arch.carve.back_slot", "isles_storm_arch.back_passage", 0.15, [1157.5, 139.5], 1.1, 0, -24, -17.4),
  ],
  blend: 1.6,
  rooms: [
    room("isles_storm_arch.north_hall", "chamber", "North hall", 9),
    room("isles_storm_arch.skylight_hall", "chamber", "Skylight hall", 8),
    room("isles_storm_arch.crack", "shaft", "Skylight crack", 12),
    room("isles_storm_arch.east_mouth", "passage", "East mouth", 9),
    room("isles_storm_arch.gallery", "chamber", "Glass gallery", 6),
    room("isles_storm_arch.back_passage", "passage", "Back passage", 6),
    room("isles_storm_arch.floor_crack", "shaft", "Floor crack", 10),
  ],
  portals: [
    portal("isles_storm_arch.mouth.cliff", "mouth", "Cliff-foot mouth", ["isles_storm_arch.north_hall", OUT], p(1148.5, -12.7, 135), "-x", 9, 7, ["diver", "small"]),
    portal("isles_storm_arch.mouth.east", "mouth", "East mouth", ["isles_storm_arch.east_mouth", OUT], p(1169, -16, 101.5), "+x", 8, 5, ["diver", "small"]),
    portal("isles_storm_arch.skylight.crack", "skylight", "Skylight crack", ["isles_storm_arch.crack", OUT], p(1155, -4, 108), "+y", 1.8, 1.8),
    portal("isles_storm_arch.throat.main", "throat", "Main hall", ["isles_storm_arch.north_hall", "isles_storm_arch.skylight_hall"],
      p(1157, -15, 117), "-z", 8, 5, ["diver", "small"]),
    portal("isles_storm_arch.throat.crack", "throat", "Crack foot", ["isles_storm_arch.skylight_hall", "isles_storm_arch.crack"], p(1155, -9.5, 108), "+y", 1.8, 1.8),
    portal("isles_storm_arch.throat.east", "throat", "East passage", ["isles_storm_arch.skylight_hall", "isles_storm_arch.east_mouth"],
      p(1162, -15, 102), "+x", 8, 5, ["diver", "small"]),
    portal("isles_storm_arch.throat.gallery_in", "throat", "Gallery in", ["isles_storm_arch.skylight_hall", "isles_storm_arch.gallery"], p(1155.5, -15.6, 96.5), "-z", 1.8, 1.8),
    portal("isles_storm_arch.throat.gallery_back", "throat", "Back passage", ["isles_storm_arch.gallery", "isles_storm_arch.back_passage"], p(1155, -16.3, 84.4), "-z", 1.8, 1.8),
    portal("isles_storm_arch.throat.floor_crack", "throat", "Floor crack", ["isles_storm_arch.back_passage", "isles_storm_arch.floor_crack"],
      p(1154.5, -26.6, 108), "+y", 1.6, 1.6),
    portal("isles_storm_arch.throat.floor_crack_top", "throat", "Floor crack top", ["isles_storm_arch.floor_crack", "isles_storm_arch.skylight_hall"],
      p(1154.5, -18.4, 108), "+y", 1.6, 1.6),
    portal("isles_storm_arch.throat.back_slot", "throat", "Floor slot", ["isles_storm_arch.back_passage", "isles_storm_arch.north_hall"], p(1157.5, -17.6, 139.5), "+y", 1.8, 1.8),
  ],
  routes: [
    route("isles_storm_arch.route.dart", "loop", [
      p(1136, -11, 135), p(1144, -12.9, 135), p(1148, -13.6, 135), p(1153, -15.2, 135), p(1157, -15.6, 135), p(1157, -16, 131), p(1157, -16.2, 125), p(1157, -15.8, 117),
      p(1157, -15, 110), p(1157, -15, 104), p(1157, -15.5, 102), p(1162, -16.3, 102), p(1166, -16.3, 101.7), p(1169.6, -17, 101.5), p(1176, -17.3, 101.5),
    ], "small"),
    route("isles_storm_arch.route.gallery_loop", "loop", [
      p(1140, -14.6, 135), p(1147, -15.6, 135), p(1155, -17.2, 133), p(1157, -17.6, 127), p(1157, -17.3, 112), p(1155.5, -16.8, 100), p(1155.5, -16.2, 96),
      p(1155.5, -16.5, 92), p(1155.5, -16.3, 88), p(1155, -16.8, 85), p(1154, -19.5, 82), p(1153.5, -21.4, 84), p(1153, -23.2, 86), p(1153.5, -26.5, 94), p(1154.5, -28.2, 104),
      p(1154.5, -28.7, 112), p(1153, -28.7, 124), p(1154.5, -27.9, 129), p(1156.5, -25.7, 134), p(1157.5, -23.3, 139.3), p(1157.5, -16.9, 139.5),
      p(1153, -16.9, 137.5), p(1147, -15.6, 135), p(1140, -14.6, 135),
    ]),
    route("isles_storm_arch.route.gallery_exit", "exit", [
      p(1157, -16, 86), p(1155.5, -16.3, 88), p(1155.5, -16.5, 92), p(1155.5, -16.2, 96), p(1155.5, -16.8, 100), p(1158, -17.3, 102), p(1162, -16.8, 102),
      p(1166, -17.8, 101.7), p(1169.6, -18.3, 101.5), p(1176, -19.3, 101.5),
    ]),
    route("isles_storm_arch.route.floor_crack", "exit", [p(1154.5, -28.2, 104), p(1154.5, -28.3, 108), p(1154.5, -24, 108), p(1154.5, -19, 108),
      p(1155, -16.8, 108), p(1155, -9.4, 108), p(1155, -1.8, 108)]),
    route("isles_storm_arch.route.crack", "exit", [p(1155, -16.8, 106), p(1155, -15.8, 108), p(1155, -9.8, 108), p(1155, -5.6, 108), p(1155, -1.8, 108)]),
    route("isles_storm_arch.route.back_rescue", "exit", [
      p(1153.5, -28.7, 120), p(1153, -28.7, 124), p(1154.5, -27.9, 129), p(1156.5, -25.7, 134), p(1157.5, -23.3, 139.3), p(1157.5, -16.9, 139.5),
      p(1153, -16.9, 137.5), p(1147, -15.6, 135), p(1140, -14.6, 135),
    ]),
  ],
  staging: [parking("isles_storm_arch.turning_bay", "Skylight hall turning bay", p(1157, -16.5, 108), 6, ["small"])],
  note: "Medium sea cave through a basalt spur off the headland's north-east point: the cliff-foot mouth on the channel shelf opens into a Dart-wide " +
    "north hall, then a skylight hall under a diver-sized crack, and out the east mouth toward the button ledges. A diver-only " +
    "glass gallery leaves the skylight hall; its back passage runs under the hall floor and climbs into the north hall.",
  style: ISLES_STYLE,
};

// --- West sea cave (medium) ----------------------------------------------------
// Through the headland's low west foot, under a basalt knoll. The waterline
// mouth opens on the head of the deep inlet that runs into the headland (the
// Spindle's approach); a Dart-wide passage runs south to the shingle chamber
// and its lower mouth toward the south beach. Loop (bible `drip_back`):
// waterline hall -> shingle chamber -> drip room -> diver arch -> waterline hall.

const HEADLAND_WEST: CaveSource = {
  id: "isles_headland_west",
  label: "West sea cave",
  region: "island_chain",
  footprint: { minX: 930, maxX: 955, minZ: -9, maxZ: 26 },
  baseY: -28,
  topY: 13,
  terraces: [
    terrace("isles_headland_west.knoll", 6, [945, 6.5], [9, 12], { exponent: 3.5, batter: 0.15, wobble: 0.5, wavelength: 9 }),
    terrace("isles_headland_west.beach_rocks", 4.5, [943, -3.5], [8, 4], { exponent: 2.6, batter: 0.08, wobble: 0.35, wavelength: 6 }),
  ],
  carves: [
    tube("isles_headland_west.carve.waterline_mouth", "isles_headland_west.waterline_hall", 0.3, [
      n(942.5, 23.5, -11, 9, 11.5), n(942.5, 18, -10.5, 9.5, 11.5),
    ]),
    chamber("isles_headland_west.carve.waterline_hall", "isles_headland_west.waterline_hall", 0.5, p(943.5, -4.5, 12), { x: 5.5, z: 7, up: 5.5, down: 7.5 }, -11),
    tube("isles_headland_west.carve.hall_to_shingle", "isles_headland_west.shingle", 0.3, [n(943.5, 6, -9.5, 10, 9.5), n(943.5, 2, -8.2, 10, 9)]),
    chamber("isles_headland_west.carve.shingle", "isles_headland_west.shingle", 0.45, p(944.5, -3.5, 0), { x: 5.6, z: 5.2, up: 3, down: 4.5 }, -8),
    // The shingle bank: a wave-washed shelf a metre and a half under the
    // surface, off the basin's south-east side (outpost-suitable).
    chamber("isles_headland_west.carve.bank", "isles_headland_west.shingle", 0.25, p(951.2, -0.4, -1.2), { x: 2, z: 2, up: 1.6, down: 1.2 }, -1.5),
    tube("isles_headland_west.carve.beach_mouth", "isles_headland_west.beach_mouth", 0.25, [n(940, -1, -6.8, 9.5, 6.5), n(934.6, -1, -6.5, 9.5, 6)]),
    tube("isles_headland_west.carve.shingle_to_drip", "isles_headland_west.drip_climb", 0.15, [
      n(948.6, 2.5, -5.4, 2.8, 3.4), n(950.6, 4, -2.8, 2.8, 3.6),
    ]),
    chamber("isles_headland_west.carve.drip", "isles_headland_west.drip_room", 0.3, p(951.5, 0, 5.8), { x: 2.6, z: 2.4, up: 1.8, down: 1.6 }, -1.5),
    tube("isles_headland_west.carve.drip_back", "isles_headland_west.drip_arch", 0.15, [n(951, 7.6, -1.2, 2.6, 3), n(949.3, 12, -1.8, 2.6, 3), n(947.8, 12.3, -2.2, 2.6, 3)]),
  ],
  blend: 1.4,
  rooms: [
    room("isles_headland_west.waterline_hall", "chamber", "Waterline hall", 9),
    room("isles_headland_west.shingle", "chamber", "Shingle chamber", 8),
    room("isles_headland_west.beach_mouth", "passage", "South-beach mouth", 9),
    room("isles_headland_west.drip_climb", "passage", "Drip climb", 6),
    room("isles_headland_west.drip_room", "chamber", "Drip room", 6),
    room("isles_headland_west.drip_arch", "passage", "Diver arch", 7),
  ],
  portals: [
    portal("isles_headland_west.mouth.waterline", "mouth", "Waterline mouth", ["isles_headland_west.waterline_hall", OUT], p(942.5, -5.5, 20.3), "+z", 8, 10,
      ["diver", "small"]),
    portal("isles_headland_west.mouth.beach", "mouth", "South-beach mouth", ["isles_headland_west.beach_mouth", OUT], p(935, -4.3, -1), "-x", 8, 4.4,
      ["diver", "small"]),
    portal("isles_headland_west.throat.hall", "throat", "Hall to shingle", ["isles_headland_west.waterline_hall", "isles_headland_west.shingle"],
      p(943.5, -5, 4.5), "-z", 8, 5, ["diver", "small"]),
    portal("isles_headland_west.throat.beach", "throat", "Beach passage", ["isles_headland_west.shingle", "isles_headland_west.beach_mouth"],
      p(939.5, -4.3, -1), "-x", 7.5, 4.4, ["diver", "small"]),
    portal("isles_headland_west.throat.drip_climb", "throat", "Drip climb", ["isles_headland_west.shingle", "isles_headland_west.drip_climb"],
      p(949.2, -3.6, 2.9), "+x", 1.8, 1.8),
    portal("isles_headland_west.throat.drip", "throat", "Drip room", ["isles_headland_west.drip_climb", "isles_headland_west.drip_room"], p(950.9, -0.9, 3.9), "+z", 1.8, 1.8),
    portal("isles_headland_west.throat.drip_arch", "throat", "Drip arch", ["isles_headland_west.drip_room", "isles_headland_west.drip_arch"],
      p(951, 0.1, 8), "+z", 1.8, 1.8),
    portal("isles_headland_west.throat.arch", "throat", "Diver arch", ["isles_headland_west.drip_arch", "isles_headland_west.waterline_hall"],
      p(949.3, -0.5, 12), "-x", 1.8, 1.8),
  ],
  routes: [
    route("isles_headland_west.route.dart", "loop", [
      p(942.5, -8.5, 30), p(942.5, -6.5, 22), p(942.5, -6.8, 18), p(943.5, -6.8, 12), p(943.5, -5.8, 6), p(943.5, -4.8, 2), p(944, -5.3, -0.5),
      p(940, -5, -1), p(934.6, -4.8, -1), p(928, -4.5, -1),
    ], "small"),
    route("isles_headland_west.route.drip_loop", "loop", [
      p(942.5, -8, 30), p(942.5, -8, 20), p(943.5, -8, 13), p(943.5, -7, 5), p(944.5, -6.5, 1), p(947.5, -6, 2), p(948.6, -4.6, 2.5), p(949.6, -3.4, 3.2), p(950.6, -2, 4),
      p(951.5, -0.9, 5.8), p(951, -0.7, 7.6), p(949.3, -1.2, 12), p(947.8, -1.6, 12.3), p(946, -3.5, 13), p(943.5, -5.5, 16), p(942.5, -7, 20),
      p(942.5, -8, 30),
    ]),
    route("isles_headland_west.route.shingle", "exit", [p(947, -6.5, 0), p(944.5, -6.5, 0), p(940, -5.3, -1), p(934.6, -5.3, -1), p(928, -5.3, -1)]),
    route("isles_headland_west.route.drip", "exit", [p(951.5, -0.9, 5.8), p(951, -0.7, 7.6), p(949.3, -1.2, 12), p(947.8, -1.6, 12.3), p(946, -3.5, 13),
      p(943.5, -5.5, 16), p(942.5, -7, 20), p(942.5, -8, 30)]),
  ],
  staging: [
    parking("isles_headland_west.turning_bay", "Waterline hall turning bay", p(943.5, -8.5, 12), 5, ["small"]),
    parking("isles_headland_west.nose_in", "Inlet nose-in", p(942.5, -2.5, 31), 4, ["small"]),
  ],
  note: "Medium sea cave through the headland's west foot: a waterline mouth a Spindle can nose into from the inlet, a waterline " +
    "hall with air under its roof, a shingle chamber with a dry-looking shingle shelf (outpost-suitable, solar through the mouth) " +
    "and a lower mouth toward the south beach. A diver passage climbs to a half-flooded drip room that arches back into the hall.",
  style: ISLES_STYLE,
};

export const ISLES_CAVES: readonly CaveSource[] = [SCAR_CRAWL, SURF_CAVE, COVE_UNDERCUT, COVE_CRAWL, HEADLAND_ROOT, EAST_LEDGE, BLOWHOLE, STORM_ARCH, HEADLAND_WEST];
void parking;
