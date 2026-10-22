import type { CaveSource, CaveStyle, TerraceSource } from "../caves.js";
import { asRoom, chamber, n, OUT, p, parking, portal, room, route, shaft, terrace, tube } from "./author.js";

/** Hearth Reef small and medium caves (CA-1), authored with the W1 kit from
 * the content bible (`docs/content/regions/hearth-reef.md`). Limestone
 * arches: pale banded rock, rounded vaults, skylights and ceiling mats of
 * vault glimmers whose streaks lean toward the nearest mouth. Nothing dark
 * is more than one turn from daylight. */

const REEF_STYLE: CaveStyle = { rock: "limestone", resident: "vault_glimmer" };

// --- The Colonnade network: Archlet, Bellhole, Wrackhollow -------------------
// Three caves in the feet of the Colonnade arches on the west shelf (18–27
// m), joined by two crawls. Footprints share edges where the crawls cross:
// Archlet | Wrackhollow at x = -487, Bellhole | Archlet at z = 84. Each crawl
// is authored once and listed in both sources, so both builds sample it.
const COLONNADE = { baseY: -34, topY: -10 } as const;

/** Archlet ↔ Wrackhollow: a 40 m crawl under a low rubble spine, with the
 * Sinkhole (a blue hole in the spine) as its mid-way daylight and rescue. */
const WRACK_SPINE: readonly TerraceSource[] = [
  terrace("colonnade.spine.1", -21, [-462, 103.5], [5, 3.6], { exponent: 2.2, batter: 0.3, wobble: 0.4, wavelength: 7 }),
  terrace("colonnade.spine.2", -21, [-470, 106], [6, 4.2], { exponent: 2.2, batter: 0.3, wobble: 0.4, wavelength: 7 }),
  terrace("colonnade.spine.3", -21.5, [-478, 108.5], [6, 3.8], { exponent: 2.2, batter: 0.3, wobble: 0.4, wavelength: 7 }),
  terrace("colonnade.spine.4", -21.5, [-486, 111.5], [6, 3.8], { exponent: 2.2, batter: 0.3, wobble: 0.4, wavelength: 7 }),
  terrace("colonnade.spine.5", -21, [-490, 114.5], [4.5, 3.6], { exponent: 2.2, batter: 0.3, wobble: 0.4, wavelength: 7 }),
];
const WRACK_CRAWL = tube("colonnade.crawl.wrack", "", 0.18, [
  n(-454.6, 101, -21.4, 2.6, 2.6), n(-458, 102, -23.4, 2.4, 2.6), n(-462, 103.5, -26.2, 2.4, 2.5),
  n(-470, 106, -26.8, 3, 2.6), n(-478, 108.5, -26.8, 2.4, 2.4), n(-486, 111.5, -26.6, 2.4, 2.4),
  n(-491, 114.5, -25.4, 2.4, 2.6), n(-494, 117, -24.2, 2.8, 2.6),
]);
/** The Wrackhollow's mound reaches across the seam into the Archlet's
 * columns, so both sources list it. */
const WRACK_MOUND: readonly TerraceSource[] = [
  terrace("reef_wrackhollow.mound", -15.5, [-500, 119], [11, 8], { exponent: 2.7, batter: 0.26, wobble: 0.5, wavelength: 9 }),
  terrace("reef_wrackhollow.crown", -13, [-500, 119], [7, 5.5], { exponent: 2.4, batter: 0.25, wobble: 0.45, wavelength: 8 }),
];

/** Bellhole ↔ Archlet: a 28 m crawl under the open shelf between the two
 * arch feet, climbing into the Archlet tunnel's east wall. */
const BELL_CRAWL = tube("colonnade.crawl.bell", "", 0.18, [
  n(-447, 72.5, -24, 2.6, 2.6), n(-446.5, 77, -25.8, 2.4, 2.6), n(-446.5, 84, -27.2, 2.4, 2.4),
  n(-447.5, 89, -27, 2.4, 2.4), n(-447.2, 94, -26.6, 2.4, 2.6), n(-445.8, 97, -24.6, 2.4, 2.6), n(-446.2, 100, -22.2, 2.4, 2.6), n(-450.3, 101, -21.2, 2.6, 2.6),
]);

const ARCHLET: CaveSource = {
  id: "reef_archlet",
  label: "Archlet",
  region: "refuge_reef",
  footprint: { minX: -487, maxX: -438, minZ: 84, maxZ: 124 },
  ...COLONNADE,
  terraces: [
    terrace("reef_archlet.foot", -12.5, [-452, 100], [8, 6.5], { exponent: 2.6, batter: 0.25, wobble: 0.5, wavelength: 9 }),
    terrace("reef_archlet.shoulder", -16.5, [-452, 100], [12, 5], { exponent: 2.8, batter: 0.25, wobble: 0.4, wavelength: 8 }),
    ...WRACK_SPINE,
    ...WRACK_MOUND,
  ],
  carves: [
    tube("reef_archlet.carve.tunnel", "reef_archlet.tunnel", 0.25, [
      n(-452, 108.5, -20.1, 4.6, 4.2), n(-452.4, 104, -20.9, 4.3, 4.1), n(-452.2, 98, -21.2, 4.4, 4.2), n(-451.7, 92.6, -21.4, 4.8, 4.5),
    ]),
    asRoom(WRACK_CRAWL, "reef_archlet.west_crawl"),
    shaft("reef_archlet.carve.sinkhole", "reef_archlet.sinkhole", 0.15, [-470, 106], 1.3, 0.8, -25.5, -20.4),
    asRoom(BELL_CRAWL, "reef_archlet.east_crawl"),
  ],
  blend: 1.2,
  rooms: [
    room("reef_archlet.tunnel", "passage", "Archlet tunnel", 7),
    room("reef_archlet.west_crawl", "passage", "Wrack crawl", 6),
    room("reef_archlet.sinkhole", "shaft", "Sinkhole", 10),
    room("reef_archlet.east_crawl", "passage", "Bell crawl", 6),
  ],
  portals: [
    portal("reef_archlet.mouth.north", "mouth", "North foot mouth", ["reef_archlet.tunnel", OUT], p(-452.3, -18.8, 106.6), "+z", 3.2, 3.2),
    portal("reef_archlet.mouth.south", "mouth", "South foot mouth", ["reef_archlet.tunnel", OUT], p(-451.8, -19.5, 92.6), "-z", 3.4, 3.2),
    portal("reef_archlet.throat.west", "throat", "Wrack crawl", ["reef_archlet.tunnel", "reef_archlet.west_crawl"], p(-456, -21.1, 101.4), "-x", 1.8, 1.6),
    portal("reef_archlet.throat.east", "throat", "Bell crawl", ["reef_archlet.tunnel", "reef_archlet.east_crawl"], p(-450, -20, 101), "+x", 1.8, 1.6),
    portal("reef_archlet.throat.sinkhole", "throat", "Sinkhole foot", ["reef_archlet.west_crawl", "reef_archlet.sinkhole"], p(-470, -24.4, 106), "+y", 1.8, 1.8),
    portal("reef_archlet.skylight.sinkhole", "skylight", "Sinkhole", ["reef_archlet.sinkhole", OUT], p(-470, -21.4, 106), "+y", 1.8, 1.8),
  ],
  routes: [
    route("reef_archlet.route.through", "loop", [
      p(-452, -19.4, 113), p(-452.2, -19.9, 106), p(-452.3, -20.4, 100), p(-452, -20.6, 94), p(-451.6, -20.8, 89), p(-451.5, -21.2, 85.5),
    ]),
    route("reef_archlet.route.wrack", "link", [
      p(-452, -19.4, 113), p(-452.2, -20.2, 104), p(-452.6, -20.4, 101.2), p(-454.6, -20.7, 101), p(-458, -22.7, 102), p(-462, -25.5, 103.5),
      p(-470, -26.1, 106), p(-478, -26.1, 108.5), p(-486, -25.9, 111.5), p(-491, -24.7, 114.5), p(-494, -23.5, 117), p(-500, -23.5, 119),
      p(-507.5, -23.2, 118.8), p(-517, -22.8, 118.5),
    ]),
    route("reef_archlet.route.sinkhole", "exit", [p(-466, -25.8, 104.8), p(-470, -26.1, 106), p(-470, -24, 106), p(-470, -21.6, 106), p(-470, -19.5, 106)]),
  ],
  staging: [parking("reef_archlet.parking", "Colonnade shelf parking", p(-428, -19, 100))],
  note: "Colonnade network hub: a 14 m tunnel through the north arch's foot, low glimmer ceiling. " +
    "Crawls leave its west wall (to the Wrackhollow, under the Sinkhole) and east wall (to the Bellhole).",
  style: REEF_STYLE,
};

const BELLHOLE: CaveSource = {
  id: "reef_bellhole",
  label: "Bellhole",
  region: "refuge_reef",
  footprint: { minX: -462, maxX: -430, minZ: 44, maxZ: 84 },
  ...COLONNADE,
  terraces: [
    terrace("reef_bellhole.foot", -14, [-447, 68], [12, 9.5], { exponent: 2.6, batter: 0.26, wobble: 0.5, wavelength: 9 }),
    terrace("reef_bellhole.crown", -11, [-447.5, 68.5], [7, 6], { exponent: 2.3, batter: 0.25, wobble: 0.45, wavelength: 8 }),
  ],
  carves: [
    tube("reef_bellhole.carve.mouth", "reef_bellhole.mouth", 0.25, [n(-446, 56, -23.9, 4.6, 3.6), n(-446.2, 58.5, -24.5, 4.6, 4), n(-446.5, 61.5, -24.4, 4.4, 4)]),
    chamber("reef_bellhole.carve.dome", "reef_bellhole.dome", 0.45, p(-447, -21, 68), { x: 9, z: 6, up: 6, down: 3.5 }, -24.5),
    asRoom(BELL_CRAWL, "reef_bellhole.crawl"),
  ],
  blend: 1.4,
  rooms: [
    room("reef_bellhole.mouth", "passage", "Shelf mouth", 7),
    room("reef_bellhole.dome", "chamber", "Bell dome", 6),
    room("reef_bellhole.crawl", "passage", "Bell crawl", 6),
  ],
  portals: [
    portal("reef_bellhole.mouth.shelf", "mouth", "Shelf mouth", ["reef_bellhole.mouth", OUT], p(-446.2, -22.4, 57.6), "-z", 3.4, 3.2),
    portal("reef_bellhole.throat.dome", "throat", "Dome arch", ["reef_bellhole.mouth", "reef_bellhole.dome"], p(-446.5, -22.4, 62), "+z", 3.4, 3.2),
    portal("reef_bellhole.throat.crawl", "throat", "Bell crawl", ["reef_bellhole.dome", "reef_bellhole.crawl"], p(-446.8, -23.9, 75), "+z", 1.8, 1.5),
  ],
  routes: [
    route("reef_bellhole.route.archlet", "link", [
      p(-446, -24, 52), p(-446.1, -23.6, 57), p(-446.5, -23.9, 62), p(-447, -23.9, 68), p(-447, -23.3, 72.5), p(-446.5, -25.1, 77),
      p(-446.5, -26.5, 84), p(-447.5, -26.3, 89), p(-447.2, -25.9, 94), p(-445.8, -23.9, 97), p(-446.2, -21.5, 100), p(-450.3, -20.5, 101), p(-452.3, -20.4, 101.5),
      p(-452.3, -19.9, 106), p(-452, -19.4, 113),
    ]),
    route("reef_bellhole.route.dome", "exit", [p(-450.5, -23.9, 69), p(-447, -23.9, 68), p(-446.5, -23.9, 62), p(-446.1, -23.6, 57), p(-446, -24, 52)]),
    route("reef_bellhole.route.crawl_rescue", "exit", [p(-446.5, -26.5, 84), p(-446.5, -25.1, 77), p(-447, -23.3, 72.5), p(-447, -23.9, 68),
      p(-446.5, -23.9, 62), p(-446.1, -23.6, 57), p(-446, -24, 52)]),
  ],
  staging: [],
  note: "An 18 m dome under the middle arch with one shelf mouth and a high bell ceiling: the reef's densest glimmer mats. " +
    "The dive-school locker sits on the dome floor. A crawl in the north wall climbs to the Archlet.",
  style: REEF_STYLE,
};

const WRACKHOLLOW: CaveSource = {
  id: "reef_wrackhollow",
  label: "Wrackhollow",
  region: "refuge_reef",
  footprint: { minX: -522, maxX: -487, minZ: 100, maxZ: 134 },
  ...COLONNADE,
  terraces: [
    ...WRACK_MOUND,
    ...WRACK_SPINE,
  ],
  carves: [
    tube("reef_wrackhollow.carve.mouth", "reef_wrackhollow.mouth", 0.25, [n(-511.6, 118.5, -23.4, 5.2, 4.3), n(-510.5, 118.6, -23.6, 5.2, 4.4), n(-507.5, 118.8, -23.6, 5, 4.4)]),
    chamber("reef_wrackhollow.carve.catch", "reef_wrackhollow.catch", 0.4, p(-500.5, -21.2, 119), { x: 9.5, z: 4.6, up: 3.8, down: 3.2 }, -24.2),
    asRoom(WRACK_CRAWL, "reef_wrackhollow.crawl"),
  ],
  blend: 1.4,
  rooms: [
    room("reef_wrackhollow.mouth", "passage", "Current mouth", 7),
    room("reef_wrackhollow.catch", "chamber", "Catch", 6),
    room("reef_wrackhollow.crawl", "passage", "Wrack crawl", 6),
  ],
  portals: [
    portal("reef_wrackhollow.mouth.current", "mouth", "Current mouth", ["reef_wrackhollow.mouth", OUT], p(-512, -21.4, 118.6), "-x", 3.6, 3.4),
    portal("reef_wrackhollow.throat.catch", "throat", "Catch", ["reef_wrackhollow.catch", "reef_wrackhollow.mouth"], p(-508.5, -21.4, 118.8), "-x", 3.6, 3.4),
    portal("reef_wrackhollow.throat.crawl", "throat", "Wrack crawl", ["reef_wrackhollow.catch", "reef_wrackhollow.crawl"], p(-488.5, -25, 113.2), "+x", 1.8, 1.5),
  ],
  routes: [
    route("reef_wrackhollow.route.catch", "exit", [p(-494, -23.5, 119.3), p(-500, -23.8, 119), p(-507.5, -23.2, 118.8), p(-517, -22.8, 118.5)]),
    route("reef_wrackhollow.route.crawl_rescue", "exit", [p(-482, -26, 110), p(-486, -25.9, 111.5), p(-491, -24.7, 114.5), p(-494, -23.5, 117),
      p(-500, -23.5, 119), p(-507.5, -23.2, 118.8), p(-517, -22.8, 118.5)]),
  ],
  staging: [],
  note: "A 22 m catch cave whose west mouth faces the wrack garden's current: sheds pile against the back wall. " +
    "The crawl leaves the back wall east under the rubble spine to the Archlet.",
  style: REEF_STYLE,
};


// --- Pump house undercut ------------------------------------------------------

const PUMPHOUSE: CaveSource = {
  id: "reef_pumphouse_undercut",
  label: "Pump house undercut",
  region: "refuge_reef",
  footprint: { minX: -378, maxX: -350, minZ: -46, maxZ: -22 },
  baseY: -30,
  topY: -14,
  terraces: [
    // The pump house's foundation: a squat, square-edged footing slab the
    // sea has undercut. The building itself (the lost site) stands north-west.
    terrace("reef_pumphouse_undercut.slab", -17.5, [-366, -32], [8, 6], { exponent: 5, batter: 0.06, wobble: 0.15, wavelength: 6 }),
  ],
  carves: [
    chamber("reef_pumphouse_undercut.carve.undercut", "reef_pumphouse_undercut.undercut", 0.25, p(-366, -21.4, -32),
      { x: 6, z: 3.6, up: 1.6, down: 1.8 }, -23),
    tube("reef_pumphouse_undercut.carve.slab_mouth", "reef_pumphouse_undercut.slab_mouth", 0.2, [
      n(-366, -34.5, -23, 4.4, 3), n(-366, -38.6, -22.6, 4.4, 3), n(-366, -39.6, -22.2, 4.4, 2.8),
    ]),
    tube("reef_pumphouse_undercut.carve.pipe_gap", "reef_pumphouse_undercut.pipe_gap", 0.15, [
      n(-361, -31.5, -22.9, 3, 2.7), n(-357.6, -31, -22.5, 3, 2.7),
    ]),
  ],
  blend: 1.2,
  rooms: [
    room("reef_pumphouse_undercut.undercut", "chamber", "Undercut", 6),
    room("reef_pumphouse_undercut.slab_mouth", "passage", "Slab mouth", 7),
    room("reef_pumphouse_undercut.pipe_gap", "passage", "Pipe gap", 6),
  ],
  portals: [
    portal("reef_pumphouse_undercut.mouth.slab", "mouth", "Slab mouth", ["reef_pumphouse_undercut.slab_mouth", OUT], p(-366, -21.3, -38.1), "-z", 3.2, 2.2),
    portal("reef_pumphouse_undercut.mouth.pipe", "mouth", "Pipe gap", ["reef_pumphouse_undercut.pipe_gap", OUT], p(-357.9, -21.4, -31.1), "+x", 2.5, 2),
    portal("reef_pumphouse_undercut.throat.slab", "throat", "Under the slab", ["reef_pumphouse_undercut.undercut", "reef_pumphouse_undercut.slab_mouth"],
      p(-366, -21.4, -35.2), "-z", 3.2, 2.2),
    portal("reef_pumphouse_undercut.throat.pipe", "throat", "Grating", ["reef_pumphouse_undercut.undercut", "reef_pumphouse_undercut.pipe_gap"],
      p(-360.6, -21.4, -31.5), "+x", 2.5, 2),
  ],
  routes: [
    route("reef_pumphouse_undercut.route.through", "loop", [
      p(-366, -21.8, -43), p(-366, -22, -38.6), p(-366, -22.3, -34.5), p(-364, -22.4, -32), p(-361, -22.2, -31.5), p(-357.4, -21.9, -31), p(-353, -21.6, -31),
    ]),
    route("reef_pumphouse_undercut.route.west_end", "exit", [p(-371, -22.4, -32), p(-366, -22.4, -33), p(-366, -22, -38.6), p(-366, -21.8, -43)]),
  ],
  staging: [parking("reef_pumphouse_undercut.parking", "Pump house parking", p(-366, -22.6, -58))],
  note: "A 12 m undercut beneath the pump house's foundation slab, low and flat, lit from the slab mouth (south) " +
    "and the narrow pipe gap (east) where the old intake pipe ran out; crust fins on the grating by the gap.",
  style: REEF_STYLE,
};

// --- The Fanvault network: Fan crawl, Shelf lip -------------------------------
// The accepted Fanvault loop carries on down the shelf break. The Fan crawl's
// upper mouth faces the Fanvault's south mouth across 4 m of open apron (its
// footprint stays 1 m clear of the Fanvault's, which is not rebuilt); one
// squeeze leads down to the shelf-edge mouth, and a crawl crosses the shared
// edge at x = -326 into the Shelf lip under the shelf-break overhang.
const SHELF = { baseY: -56, topY: -20 } as const;
const FAN_LEDGE: readonly TerraceSource[] = [
  terrace("reef_fan_crawl.ledge.upper", -23.5, [-305, -102], [10, 5.5], { exponent: 2.6, batter: 0.25, wobble: 0.5, wavelength: 9 }),
  terrace("reef_fan_crawl.ledge.lower", -27.5, [-315, -108.5], [17, 8.5], { exponent: 2.4, batter: 0.25, wobble: 0.55, wavelength: 10 }),
];
const LIP_MOUND: readonly TerraceSource[] = [
  terrace("reef_shelf_lip.overhang", -34, [-342.5, -118], [15, 9], { exponent: 2.5, batter: 0.25, wobble: 0.55, wavelength: 10 }),
  // Bridges the two ledges over the lip crawl where it crosses the seam.
  terrace("fanvault.ledge.bridge", -30.5, [-327, -114.5], [6.5, 5], { exponent: 2.2, batter: 0.25, wobble: 0.4, wavelength: 8 }),
];
const LIP_CRAWL = tube("fanvault.crawl.lip", "", 0.18, [
  n(-316.5, -109.5, -33.8, 2.6, 2.6), n(-321, -112, -35.6, 2.4, 2.6), n(-326, -114.5, -38, 2.4, 2.6),
  n(-331.5, -116.5, -40.4, 2.4, 2.6), n(-337, -118.2, -41.6, 2.6, 2.6),
]);

const FAN_CRAWL: CaveSource = {
  id: "reef_fan_crawl",
  label: "Fan crawl",
  region: "refuge_reef",
  footprint: { minX: -326, maxX: -290, minZ: -124, maxZ: -93 },
  ...SHELF,
  terraces: [...FAN_LEDGE, ...LIP_MOUND],
  carves: [
    tube("reef_fan_crawl.carve.crawl", "reef_fan_crawl.crawl", 0.18, [
      n(-300, -95.6, -28.6, 3.4, 3), n(-300.8, -99, -29.3, 2.8, 2.6), n(-305.5, -104.5, -31.4, 2.6, 2.6), n(-310.5, -108.5, -33, 2.6, 2.6),
    ]),
    tube("reef_fan_crawl.carve.squeeze", "reef_fan_crawl.squeeze", 0.1, [
      n(-310.5, -108.5, -33, 2.6, 2.6), n(-313.5, -108.5, -33.4, 1.9, 2.1), n(-316.5, -109.5, -33.8, 2.8, 2.6),
    ]),
    tube("reef_fan_crawl.carve.edge", "reef_fan_crawl.edge", 0.2, [
      n(-316.5, -109.5, -33.8, 2.8, 2.6), n(-316.8, -113, -35.4, 3, 2.8), n(-317, -118.6, -36.4, 3.2, 3),
    ]),
    asRoom(LIP_CRAWL, "reef_fan_crawl.lip_crawl"),
  ],
  blend: 1.1,
  rooms: [
    room("reef_fan_crawl.crawl", "passage", "Fan crawl", 6),
    room("reef_fan_crawl.squeeze", "passage", "The squeeze", 6),
    room("reef_fan_crawl.edge", "passage", "Shelf-edge passage", 6),
    room("reef_fan_crawl.lip_crawl", "passage", "Lip crawl", 6),
  ],
  portals: [
    portal("reef_fan_crawl.mouth.apron", "mouth", "Apron mouth", ["reef_fan_crawl.crawl", OUT], p(-300.3, -27.4, -96.4), "+z", 2.8, 2.4),
    portal("reef_fan_crawl.mouth.edge", "mouth", "Shelf-edge mouth", ["reef_fan_crawl.edge", OUT], p(-317, -34.9, -118), "-z", 2.6, 2.4),
    portal("reef_fan_crawl.throat.squeeze", "throat", "The squeeze", ["reef_fan_crawl.crawl", "reef_fan_crawl.squeeze"], p(-312.5, -32.25, -108.5), "-x", 1.6, 1.5),
    portal("reef_fan_crawl.throat.edge", "throat", "Shelf-edge passage", ["reef_fan_crawl.squeeze", "reef_fan_crawl.edge"], p(-316.6, -33.3, -111), "-z", 1.8, 1.6),
    portal("reef_fan_crawl.throat.lip", "throat", "Lip crawl", ["reef_fan_crawl.squeeze", "reef_fan_crawl.lip_crawl"], p(-318.5, -32.9, -110.6), "-x", 1.6, 1.6),
  ],
  routes: [
    route("reef_fan_crawl.route.down", "loop", [
      p(-300, -27.9, -93.5), p(-300, -28.1, -95.6), p(-300.8, -28.7, -99), p(-305.5, -30.8, -104.5), p(-310.5, -32.4, -108.5),
      p(-313.5, -32.9, -108.5), p(-316.5, -33.2, -109.5), p(-316.8, -34.8, -113), p(-317, -35.8, -118.6), p(-317, -36.2, -123),
    ]),
    route("reef_fan_crawl.route.lip", "link", [
      p(-300, -27.9, -93.5), p(-300, -28.1, -95.6), p(-300.8, -28.7, -99), p(-305.5, -30.8, -104.5), p(-310.5, -32.4, -108.5),
      p(-313.5, -32.9, -108.5), p(-316.5, -33.2, -109.5), p(-321, -35, -112), p(-326, -37.4, -114.5), p(-331.5, -39.8, -116.5),
      p(-337, -41, -118.2), p(-344, -42.6, -120), p(-344, -42.8, -123), p(-344.5, -43.3, -127.5), p(-344.5, -43.3, -133),
    ]),
    route("reef_fan_crawl.route.squeeze_back", "exit", [
      p(-313.5, -32.9, -108.5), p(-310.5, -32.4, -108.5), p(-305.5, -30.8, -104.5), p(-300.8, -28.7, -99), p(-300, -28.1, -95.6), p(-300, -27.9, -93.5),
    ]),
  ],
  staging: [],
  note: "A 20 m crawl down the shelf break from the Fanvault's south apron: one squeeze, then the shelf-edge mouth; " +
    "lit at both ends. A side crawl continues west to the Shelf lip. Practice for the lamp-off retreat.",
  style: REEF_STYLE,
};

const SHELF_LIP: CaveSource = {
  id: "reef_shelf_lip",
  label: "Shelf lip",
  region: "refuge_reef",
  footprint: { minX: -364, maxX: -326, minZ: -141, maxZ: -96 },
  ...SHELF,
  terraces: [...LIP_MOUND, ...FAN_LEDGE],
  carves: [
    chamber("reef_shelf_lip.carve.room", "reef_shelf_lip.room", 0.45, p(-344, -40.6, -119), { x: 7.5, z: 5, up: 3.2, down: 3 }, -43.2),
    tube("reef_shelf_lip.carve.overhang", "reef_shelf_lip.overhang", 0.3, [
      n(-344, -123, -43.4, 6.5, 4.2), n(-344.5, -127.5, -43.9, 6.5, 4), n(-344.5, -129.4, -44, 6.5, 3.8),
    ]),
    asRoom(LIP_CRAWL, "reef_shelf_lip.crawl"),
  ],
  blend: 1.4,
  rooms: [
    room("reef_shelf_lip.room", "chamber", "Lip room", 7),
    room("reef_shelf_lip.overhang", "passage", "Overhang mouth", 8),
    room("reef_shelf_lip.crawl", "passage", "Lip crawl", 6),
  ],
  portals: [
    portal("reef_shelf_lip.mouth.overhang", "mouth", "Overhang mouth", ["reef_shelf_lip.overhang", OUT], p(-344.5, -42, -127.9), "-z", 5.2, 3.4),
    portal("reef_shelf_lip.throat.overhang", "throat", "Lip", ["reef_shelf_lip.room", "reef_shelf_lip.overhang"], p(-344, -41.5, -123.2), "-z", 5, 3),
    portal("reef_shelf_lip.throat.crawl", "throat", "Lip crawl", ["reef_shelf_lip.room", "reef_shelf_lip.crawl"], p(-335.5, -40.1, -117.7), "+x", 1.8, 1.6),
  ],
  routes: [
    route("reef_shelf_lip.route.room", "exit", [p(-349.5, -42.6, -119), p(-344, -42.6, -120), p(-344, -42.8, -123), p(-344.5, -43.3, -127.5), p(-344.5, -43.3, -133)]),
    route("reef_shelf_lip.route.crawl_rescue", "exit", [p(-331.5, -39.8, -116.5), p(-337, -41, -118.2), p(-344, -42.6, -120), p(-344, -42.8, -123),
      p(-344.5, -43.3, -127.5), p(-344.5, -43.3, -133)]),
  ],
  staging: [parking("reef_shelf_lip.parking", "Shelf-lip parking", p(-374, -33.3, -106))],
  note: "A 15 m room under the shelf-break overhang: its wide, low mouth opens south onto blue water and the first framed " +
    "view of the slope. Glass nodules lie scoured on the floor by the down-slope current.",
  style: REEF_STYLE,
};

// --- Gully window ------------------------------------------------------------

const GULLY_WINDOW: CaveSource = {
  id: "reef_gully_window",
  label: "Gully window",
  region: "refuge_reef",
  footprint: { minX: -222, maxX: -190, minZ: -180, maxZ: -150 },
  baseY: -80,
  topY: -46,
  terraces: [
    terrace("reef_gully_window.buttress", -50, [-206, -163], [9, 8], { exponent: 2.6, batter: 0.25, wobble: 0.6, wavelength: 10 }),
  ],
  carves: [
    chamber("reef_gully_window.carve.room", "reef_gully_window.room", 0.5, p(-206, -60, -163), { x: 7, z: 4.5, up: 6, down: 3 }, -63),
    tube("reef_gully_window.carve.mouth", "reef_gully_window.mouth", 0.25, [
      n(-211.5, -164, -62.6, 3.8, 3.8), n(-215.5, -164.8, -62.6, 3.8, 3.8), n(-216.8, -165, -62.4, 3.8, 3.6),
    ]),
    tube("reef_gully_window.carve.window", "reef_gully_window.window", 0.15, [
      n(-205, -167.5, -61.6, 3.4, 3.4), n(-205, -172.2, -61.6, 3.4, 3.4),
    ]),
  ],
  blend: 1.4,
  rooms: [
    room("reef_gully_window.room", "chamber", "Window room", 7),
    room("reef_gully_window.mouth", "passage", "Gully mouth", 7),
    room("reef_gully_window.window", "passage", "The window", 8),
  ],
  portals: [
    portal("reef_gully_window.mouth.gully", "mouth", "Gully mouth", ["reef_gully_window.mouth", OUT], p(-216.2, -61, -165), "-x", 3, 2.8),
    portal("reef_gully_window.mouth.window", "mouth", "The window", ["reef_gully_window.window", OUT], p(-205, -59.9, -172.4), "-z", 2.6, 2.6),
    portal("reef_gully_window.throat.mouth", "throat", "Gully passage", ["reef_gully_window.room", "reef_gully_window.mouth"], p(-211.6, -61, -164), "-x", 3, 2.8),
    portal("reef_gully_window.throat.window", "throat", "Window passage", ["reef_gully_window.room", "reef_gully_window.window"], p(-205, -59.9, -167.8), "-z", 2.6, 2.6),
  ],
  routes: [
    route("reef_gully_window.route.through", "loop", [
      p(-221, -62, -165), p(-216.8, -62, -165), p(-211.5, -62, -164), p(-206, -62.3, -163), p(-205, -61, -167.5), p(-205, -61, -172.2), p(-205, -61, -177),
    ]),
    route("reef_gully_window.route.room", "exit", [p(-202, -61.5, -163), p(-206, -62.3, -163), p(-211.5, -62, -164), p(-216.8, -62, -165), p(-221, -62, -165)]),
  ],
  staging: [parking("reef_gully_window.parking", "Gully plateau parking", p(-200, -43.5, -140))],
  note: "A tall room in a buttress on the gully's east lip: the west mouth opens onto the gully and the Drop Cathedral's " +
    "lower mouth across it; a round south window frames the slope falling into the Basin's dark. A survey bolt line points south.",
  style: REEF_STYLE,
};

// --- Lantern grotto (medium) ----------------------------------------------------
// A crag on the shelf-break slope. Hull passages run along an axis, so the
// small hull's box (7.2 m square) clears a 10 m tube. Loop (bible
// `gallery_climb`): shelf hall -> glimmer hall -> glass gallery -> shelf hall.

const LANTERN: CaveSource = {
  id: "reef_lantern_grotto",
  label: "Lantern grotto",
  region: "refuge_reef",
  footprint: { minX: -510, maxX: -440, minZ: -150, maxZ: -86 },
  baseY: -74,
  topY: -19,
  terraces: [
    terrace("reef_lantern_grotto.crag", -26, [-475, -112], [24, 18], { exponent: 2.7, batter: 0.25, wobble: 0.8, wavelength: 13 }),
    terrace("reef_lantern_grotto.crown", -23.5, [-466, -122], [10, 8], { exponent: 2.4, batter: 0.25, wobble: 0.6, wavelength: 10 }),
  ],
  carves: [
    tube("reef_lantern_grotto.carve.shelf_hall", "reef_lantern_grotto.shelf_hall", 0.3, [
      n(-470, -94.5, -37.8, 11, 8), n(-470, -100, -40, 11, 9), n(-470, -110, -44, 11, 9), n(-470, -114, -46.2, 11, 8.5), n(-470, -118, -48.6, 11, 8),
    ]),
    chamber("reef_lantern_grotto.carve.glimmer_hall", "reef_lantern_grotto.glimmer_hall", 0.6, p(-470, -48.5, -121),
      { x: 12, z: 9, up: 6.5, down: 5.5 }, -53),
    tube("reef_lantern_grotto.carve.slope_mouth", "reef_lantern_grotto.slope_mouth", 0.3, [
      n(-470, -128, -53, 11, 8.5), n(-470, -134.5, -55.2, 11, 7.5),
    ]),
    tube("reef_lantern_grotto.carve.gallery_low", "reef_lantern_grotto.gallery", 0.2, [
      n(-480, -122, -51.6, 3, 3), n(-486.5, -120, -50.6, 3, 3),
    ]),
    chamber("reef_lantern_grotto.carve.gallery", "reef_lantern_grotto.gallery", 0.4, p(-491, -47.5, -116), { x: 5, z: 4.5, up: 2.6, down: 2 }, -49.5),
    tube("reef_lantern_grotto.carve.climb", "reef_lantern_grotto.climb", 0.15, [
      n(-490, -111, -47.4, 2.4, 2.8), n(-485, -106, -44, 2.4, 2.8), n(-478.5, -104, -41.6, 2.4, 2.8), n(-474.5, -104, -41.4, 2.6, 2.8),
    ]),
  ],
  blend: 1.6,
  rooms: [
    room("reef_lantern_grotto.shelf_hall", "chamber", "Shelf hall", 8),
    room("reef_lantern_grotto.glimmer_hall", "chamber", "Glimmer hall", 7),
    room("reef_lantern_grotto.slope_mouth", "passage", "Slope mouth", 9),
    room("reef_lantern_grotto.gallery", "chamber", "Glass gallery", 6),
    room("reef_lantern_grotto.climb", "passage", "Gallery climb", 6),
  ],
  portals: [
    portal("reef_lantern_grotto.mouth.shelf", "mouth", "Shelf mouth", ["reef_lantern_grotto.shelf_hall", OUT], p(-470, -34.6, -93.6), "+z", 8, 5.4, ["diver", "small"]),
    portal("reef_lantern_grotto.mouth.slope", "mouth", "Slope mouth", ["reef_lantern_grotto.slope_mouth", OUT], p(-470, -52, -136.3), "-z", 8, 5.6, ["diver", "small"]),
    portal("reef_lantern_grotto.throat.bend", "throat", "The bend", ["reef_lantern_grotto.shelf_hall", "reef_lantern_grotto.glimmer_hall"],
      p(-470, -43.2, -114), "-z", 8, 3.6, ["diver", "small"]),
    portal("reef_lantern_grotto.throat.slope", "throat", "Slope passage", ["reef_lantern_grotto.glimmer_hall", "reef_lantern_grotto.slope_mouth"],
      p(-470, -50, -128), "-z", 8, 3.6, ["diver", "small"]),
    portal("reef_lantern_grotto.throat.gallery", "throat", "Gallery low", ["reef_lantern_grotto.glimmer_hall", "reef_lantern_grotto.gallery"],
      p(-481, -50.1, -121.7), "-x", 1.8, 1.8),
    portal("reef_lantern_grotto.throat.climb", "throat", "Gallery climb", ["reef_lantern_grotto.gallery", "reef_lantern_grotto.climb"],
      p(-490, -46, -111.2), "+z", 1.6, 1.6),
    portal("reef_lantern_grotto.throat.squeeze", "throat", "Squeeze", ["reef_lantern_grotto.climb", "reef_lantern_grotto.shelf_hall"],
      p(-475.5, -40.2, -104), "+x", 1.8, 1.6),
  ],
  routes: [
    route("reef_lantern_grotto.route.dart", "loop", [
      p(-470, -31, -88), p(-470, -33.6, -92), p(-470, -35.8, -96), p(-470, -37.1, -100), p(-470, -38.3, -104), p(-470, -39.8, -108),
      p(-470, -42.3, -112), p(-470, -44.8, -116), p(-470, -48.1, -119), p(-470, -49.3, -123), p(-470, -50.8, -128), p(-470, -51.1, -131),
      p(-470, -51.3, -134), p(-470, -52, -138), p(-470, -52.8, -142),
    ], "small"),
    route("reef_lantern_grotto.route.gallery_loop", "loop", [
      p(-470, -34.3, -89), p(-470, -36.2, -94), p(-470, -38.8, -98), p(-472, -40.3, -104), p(-474.5, -40.8, -104), p(-478.5, -40.9, -104),
      p(-485, -43.2, -106), p(-490, -46.7, -111), p(-491, -48.3, -116), p(-486.5, -49.7, -120), p(-480, -51.3, -122), p(-470, -51.8, -121),
      p(-470, -52.3, -128), p(-470, -53.8, -134.5), p(-470, -54, -140),
    ]),
    route("reef_lantern_grotto.route.gallery_rescue", "exit", [
      p(-494, -48.2, -117), p(-491, -48.3, -116), p(-486.5, -49.7, -120), p(-480, -51.3, -122), p(-470, -51.8, -121), p(-470, -52.3, -128),
      p(-470, -53.8, -134.5), p(-470, -54, -140),
    ]),
  ],
  staging: [
    parking("reef_lantern_grotto.turning_bay", "Glimmer hall turning bay", p(-470, -52, -121), 6, ["small"]),
    parking("reef_lantern_grotto.parking", "Shelf parking", p(-470, -32.7, -80)),
  ],
  note: "Medium cave: the Dart's first underground hall. The shelf mouth (37 m) opens into a shelf hall that bends down into " +
    "the glimmer hall, a Dart turning bay under the reef's brightest glimmer ceiling, and out the slope mouth (56 m). A diver-only " +
    "glass gallery leaves the glimmer hall and squeezes back up into the shelf hall, closing the loop.",
  style: REEF_STYLE,
};

// --- Drop Cathedral (medium) ---------------------------------------------------
// The sheltered way down the gully's west wall. The Basin route runs along
// the gully floor (route.basin.reef_west, half-width 8), so the footprint stops
// at x = -258 and the gully mouth opens through a buttress on the wall above it.
// Loop (bible `chimney`): arch hall -> spiral well -> gully chamber -> chimney
// -> arch hall. The Dart spirals down the 15 m well; divers can also climb back
// up the chimney inside the west wall.

const CATHEDRAL: CaveSource = {
  id: "reef_drop_cathedral",
  label: "Drop Cathedral",
  region: "refuge_reef",
  footprint: { minX: -309.5, maxX: -258.5, minZ: -209, maxZ: -128 },
  baseY: -106,
  topY: -36,
  terraces: [
    terrace("reef_drop_cathedral.mound", -40, [-283, -167], [16, 30], { exponent: 2.6, batter: 0.1, wobble: 0.9, wavelength: 14 }),
    terrace("reef_drop_cathedral.buttress", -84, [-268, -200], [8.5, 7.5], { exponent: 4, batter: 0.05, wobble: 0.3, wavelength: 6 }),
  ],
  carves: [
    tube("reef_drop_cathedral.carve.arch_mouth", "reef_drop_cathedral.arch_hall", 0.3, [n(-268, -152, -64, 11, 8.5), n(-265, -152, -64, 11, 8)]),
    chamber("reef_drop_cathedral.carve.arch_hall", "reef_drop_cathedral.arch_hall", 0.7, p(-279, -57, -152), { x: 10, z: 9, up: 10.5, down: 7 }, -64),
    tube("reef_drop_cathedral.carve.ramp_top", "reef_drop_cathedral.spiral", 0.3, [n(-279, -159, -63, 11, 8), n(-280.5, -168, -63, 11, 8)]),
    shaft("reef_drop_cathedral.carve.well", "reef_drop_cathedral.spiral", 0.5, [-281, -174], 7.5, 0, -95, -58),
    tube("reef_drop_cathedral.carve.ramp_foot", "reef_drop_cathedral.gully_chamber", 0.3, [n(-280.5, -178, -94, 11, 7.5), n(-280, -187, -94, 11, 7.5)]),
    chamber("reef_drop_cathedral.carve.gully_chamber", "reef_drop_cathedral.gully_chamber", 0.6, p(-278, -90, -192.5), { x: 10, z: 7, up: 5, down: 4 }, -94),
    tube("reef_drop_cathedral.carve.gully_mouth", "reef_drop_cathedral.gully_mouth", 0.3, [n(-278, -198.5, -94, 10, 7), n(-270, -198.5, -94, 10, 7), n(-260.2, -199, -93.8, 10, 7)]),
    tube("reef_drop_cathedral.carve.chimney", "reef_drop_cathedral.chimney", 0.2, [
      n(-286.5, -192, -93, 3.2, 3.4), n(-294, -186, -89.5, 3.2, 3.8), n(-297, -176, -80, 3.2, 4), n(-296, -166, -71, 3.2, 4),
      n(-292, -158, -65, 3.2, 3.6), n(-285, -153, -63.4, 3.2, 3.4),
    ]),
    tube("reef_drop_cathedral.carve.vent_passage", "reef_drop_cathedral.vent", 0.15, [n(-297.5, -176.5, -79.6, 2.6, 3), n(-303.5, -176.5, -79.4, 2.6, 3)]),
    shaft("reef_drop_cathedral.carve.vent", "reef_drop_cathedral.vent", 0.15, [-303.5, -176.5], 1.3, 0.6, -79.5, -68),
  ],
  blend: 1.8,
  rooms: [
    room("reef_drop_cathedral.arch_hall", "chamber", "Arch hall", 9),
    room("reef_drop_cathedral.spiral", "shaft", "Spiral well", 7),
    room("reef_drop_cathedral.gully_chamber", "chamber", "Gully chamber", 5),
    room("reef_drop_cathedral.gully_mouth", "passage", "Gully mouth", 8),
    room("reef_drop_cathedral.chimney", "passage", "Chimney", 6),
    room("reef_drop_cathedral.vent", "shaft", "Chimney vent", 9),
  ],
  portals: [
    portal("reef_drop_cathedral.mouth.arch", "mouth", "Arch mouth", ["reef_drop_cathedral.arch_hall", OUT], p(-266.5, -59.5, -152), "+x", 8, 6, ["diver", "small"]),
    portal("reef_drop_cathedral.mouth.gully", "mouth", "Gully mouth", ["reef_drop_cathedral.gully_mouth", OUT], p(-260, -90.5, -199), "+x", 8, 5.4, ["diver", "small"]),
    portal("reef_drop_cathedral.throat.ramp_top", "throat", "Ramp top", ["reef_drop_cathedral.arch_hall", "reef_drop_cathedral.spiral"],
      p(-279.7, -59.5, -163), "-z", 8, 6, ["diver", "small"]),
    portal("reef_drop_cathedral.throat.ramp_foot", "throat", "Ramp foot", ["reef_drop_cathedral.spiral", "reef_drop_cathedral.gully_chamber"],
      p(-280.3, -90.5, -182.5), "-z", 8, 5.5, ["diver", "small"]),
    portal("reef_drop_cathedral.throat.gully", "throat", "Gully passage", ["reef_drop_cathedral.gully_chamber", "reef_drop_cathedral.gully_mouth"],
      p(-268.5, -90.5, -198.5), "+x", 7.5, 5.4, ["diver", "small"]),
    portal("reef_drop_cathedral.throat.chimney_foot", "throat", "Chimney foot", ["reef_drop_cathedral.gully_chamber", "reef_drop_cathedral.chimney"],
      p(-289, -91, -191.2), "-x", 1.8, 2),
    portal("reef_drop_cathedral.throat.vent", "throat", "Vent passage", ["reef_drop_cathedral.chimney", "reef_drop_cathedral.vent"],
      p(-299, -78.2, -176.5), "-x", 1.8, 1.8),
    portal("reef_drop_cathedral.skylight.vent", "skylight", "Chimney vent", ["reef_drop_cathedral.vent", OUT], p(-303.5, -70.5, -176.5), "+y", 1.8, 1.8),
    portal("reef_drop_cathedral.throat.chimney_head", "throat", "Chimney head", ["reef_drop_cathedral.chimney", "reef_drop_cathedral.arch_hall"],
      p(-288, -61.6, -153.6), "+x", 1.8, 2),
  ],
  routes: [
    route("reef_drop_cathedral.route.dart", "loop", [
      p(-254, -61, -152), p(-262, -61.5, -152), p(-270, -62, -152), p(-276, -62, -153), p(-279, -61.6, -159), p(-280.5, -61.6, -166),
      p(-281, -62, -174), p(-281, -70, -174), p(-281, -80, -174), p(-281, -91.5, -174), p(-280.5, -91.8, -180), p(-280, -91.8, -187),
      p(-277, -91.3, -192), p(-277, -91.6, -198.5), p(-270, -91.6, -198.5), p(-262, -91.8, -199), p(-252, -91.5, -199),
    ], "small"),
    route("reef_drop_cathedral.route.chimney_loop", "loop", [
      p(-256, -61, -152), p(-266, -62, -152), p(-276, -62.5, -152), p(-280, -62, -163), p(-281, -62.5, -172), p(-281, -77, -174),
      p(-281, -92, -174), p(-280, -92.5, -185), p(-284, -92.3, -192), p(-286.5, -92.3, -192), p(-294, -88.3, -186), p(-297, -78.8, -176),
      p(-296, -69.8, -166), p(-292, -64, -158), p(-285, -62.8, -153), p(-276, -62.8, -150), p(-266, -62.8, -150), p(-256, -61, -150),
    ]),
    route("reef_drop_cathedral.route.gully_exit", "exit", [p(-286, -92.5, -192), p(-276, -92.5, -193), p(-270, -92.5, -198.5), p(-262, -92.3, -199), p(-252, -92, -199)]),
    route("reef_drop_cathedral.route.vent", "exit", [p(-297, -78.8, -176), p(-299, -78.7, -176.5), p(-303.5, -78.6, -176.5), p(-303.5, -74, -176.5),
      p(-303.5, -70, -176.5), p(-303.5, -66.5, -176.5)]),
    route("reef_drop_cathedral.route.chimney_rescue", "exit", [
      p(-297, -78.8, -176), p(-296, -69.8, -166), p(-292, -64, -158), p(-285, -62.8, -153), p(-276, -62.8, -150), p(-266, -62.8, -150), p(-256, -61, -150),
    ]),
  ],
  staging: [
    parking("reef_drop_cathedral.turning_bay", "Arch hall turning bay", p(-277, -62, -152), 6, ["small"]),
    parking("reef_drop_cathedral.parking", "Plateau parking", p(-312, -52.3, -150)),
  ],
  note: "Medium cave beside the drop arch: a tall arch hall opens on the gully wall at 64 m; the Dart spirals down a 15 m well " +
    "to a lamp-only gully chamber and out the gully mouth at 94 m, toward the Basin west gate. A diver chimney climbs back up " +
    "inside the west wall into the arch hall. An alternative to the open gully route, never a replacement.",
  style: REEF_STYLE,
};

export const REEF_CAVES: readonly CaveSource[] = [ARCHLET, BELLHOLE, WRACKHOLLOW, PUMPHOUSE, FAN_CRAWL, SHELF_LIP, GULLY_WINDOW, LANTERN, CATHEDRAL];
