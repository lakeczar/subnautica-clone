import { chamber, mouth, moved, room, route, shaft, terrace, throat, tube, v3, type CaveGroup } from "./authored.js";

/** Lantern Canopy small and medium caves: root hollows (CA-2).
 *
 * Holdfast roots braided over mineral ribs: the exterior is stacked root
 * knots and rib prisms, the water is carved hollows and crawls. Warm at the
 * mouths, black inside, the root tips the only landmarks (`style.ts`).
 * Resident: resin weavers, whose empty ceiling nests are cured resin.
 * Bible: docs/content/regions/lantern-canopy.md section 3. Every cave is on
 * the east shelf; the legacy Canopy is untouched. */

// --- Knot hollow ---------------------------------------------------------------
const KNOT = "canopy_knot_hollow";
const KNOT_HOLLOW: CaveGroup = {
  style: "root_hollow",
  source: {
    id: KNOT, label: "Knot hollow", region: "suspended_garden",
    footprint: { minX: 708, maxX: 732, minZ: -134, maxZ: -110 },
    baseY: -134, topY: -100,
    terraces: [
      terrace(`${KNOT}.terrace.root`, -110, [720, -119.5], [9, 7], 2.4, 0.12, 0.7, 6),
      terrace(`${KNOT}.terrace.crown`, -106.5, [720.5, -118.5], [6.5, 5], 2.2, 0.18, 0.5, 5),
    ],
    carves: [
      tube(`${KNOT}.carve.mouth`, `${KNOT}.throat`, [[720, -131, -123, 5, 4.4], [720, -123.5, -123, 4.6, 4.2]], 0.2),
      chamber(`${KNOT}.carve.hollow`, `${KNOT}.hollow`, v3(720, -120, -118.5), [7.5, 4, 4, 3.5], -124, 0.45),
    ],
    blend: 1.4,
    rooms: [room(`${KNOT}.throat`, "passage", "Knot throat"), room(`${KNOT}.hollow`, "chamber", "Knot hollow")],
    portals: [
      mouth(`${KNOT}.mouth`, "Knot mouth", `${KNOT}.throat`, v3(720, -121, -127), "-z", [4, 3.4]),
      throat(`${KNOT}.throat`, "Knot throat", `${KNOT}.throat`, `${KNOT}.hollow`, v3(720, -121.2, -122.5), "+z", [3.6, 3.2]),
    ],
    routes: [
      route(`${KNOT}.route.exit`, "diver", "exit", [[725, -122.6, -117.5], [720, -123.4, -118.5], [720, -122.8, -123], [720, -122.8, -128], [720, -122.6, -134.5]]),
    ],
    staging: [],
    note: "Single-mouth hollow in a holdfast knot on the east-crown slope: a dead end whose one mouth glows.",
  },
  caves: [{ id: KNOT, size: "small", rooms: [`${KNOT}.throat`, `${KNOT}.hollow`], exits: [{ exit: "knot mouth", portal: `${KNOT}.mouth` }] }],
  links: [], handoffs: [],
  pockets: [
    { id: "canopy_knot_hollow_crust", status: "bible", item: "conductive_crust", cave: KNOT, room: `${KNOT}.hollow`,
      at: v3(722, -123, -115.6), renewable: false, note: "Root fins grounded to the rib along the back wall, out of drifting silt." },
  ],
  residents: [
    { id: `${KNOT}.weavers`, species: "resin_weaver", cave: KNOT, room: `${KNOT}.hollow`, at: v3(717, -118, -118.5), count: 3, radius: 2,
      note: "Ceiling nests over the fins; they freeze at machinery noise and back in under a direct lamp." },
  ],
  finds: [],
};

// --- East-crown network: bladder pocket and quiet crawl ----------------------------
// One footprint owns both caves and the crawlway between them, so the crawl's
// rock has a single owner (the bible's explicit union).
const EC = "canopy_eastcrown";
const POCKET = "canopy_bladder_pocket", CRAWL = "canopy_quiet_crawl";
const EASTCROWN: CaveGroup = {
  style: "root_hollow",
  source: {
    id: EC, label: "East-crown root network", region: "suspended_garden",
    footprint: { minX: 748, maxX: 813, minZ: -92, maxZ: -44 },
    baseY: -112, topY: -68,
    terraces: [
      terrace(`${EC}.terrace.rim_knot`, -74, [800, -62], [9, 6], 2.3, 0.25, 0.6, 6),
      terrace(`${EC}.terrace.rim_root`, -77, [785, -64.5], [7, 4], 2.6, 0.2, 0.5, 5),
    ],
    carves: [
      tube(`${EC}.carve.rim_mouth`, `${POCKET}.rim`, [[800, -52.5, -87.9, 4.6, 4.2], [800, -57.5, -88.6, 4.4, 4]], 0.2),
      chamber(`${EC}.carve.pocket`, `${POCKET}.pocket`, v3(800, -86, -61.5), [6.5, 4.5, 3.6, 3.6], -89, 0.4),
      tube(`${EC}.carve.crawl`, `${CRAWL}.crawl`, [[760, -88.5, -93.2, 4.2, 3.6], [760.5, -83, -93, 3.8, 3.4], [761.5, -78, -92.4, 3.2, 3.2],
        [764.5, -74.5, -91.8, 3.2, 3.2], [769, -71, -91.2, 3.2, 3.2]], 0.25),
      tube(`${EC}.carve.link`, `${EC}.link`, [[771.5, -69.5, -90.9, 3.2, 3.2], [778, -67, -90.2, 3.2, 3.2], [785, -64.5, -89.6, 3.2, 3.2],
        [791.5, -62.5, -89.2, 3.2, 3.2]], 0.25),
    ],
    blend: 1.2,
    rooms: [
      room(`${POCKET}.rim`, "passage", "Rim mouth passage"), room(`${POCKET}.pocket`, "chamber", "Bladder pocket"),
      room(`${CRAWL}.crawl`, "passage", "Quiet crawl", 7), room(`${EC}.link`, "passage", "East-crown crawlway", 8),
    ],
    portals: [
      mouth(`${POCKET}.mouth.rim`, "Rim mouth", `${POCKET}.rim`, v3(800, -86.1, -54.5), "+z", [3.8, 3.2]),
      throat(`${POCKET}.throat.rim`, "Rim throat", `${POCKET}.rim`, `${POCKET}.pocket`, v3(800, -86.6, -57), "-z", [3.4, 3]),
      mouth(`${CRAWL}.mouth.slope`, "Slope mouth", `${CRAWL}.crawl`, v3(760.4, -91.4, -84), "-z", [3.5, 3]),
      throat(`${CRAWL}.throat.pocket_end`, "Pocket end", `${CRAWL}.crawl`, `${EC}.link`, v3(770.2, -89.6, -70.3), "+x", [2.2, 2.2]),
      throat(`${EC}.throat.pocket`, "Crawlway to the pocket", `${EC}.link`, `${POCKET}.pocket`, v3(793, -87.2, -62), "+x", [2.2, 2.2]),
    ],
    routes: [
      route(`${EC}.route.through`, "diver", "loop", [[760, -91.6, -95], [760, -92.4, -86], [760.6, -92.2, -82], [761.5, -91.6, -78], [764.5, -91, -74.5],
        [769, -90.4, -71], [771.5, -90.1, -69.5], [778, -89.4, -67], [785, -88.8, -64.5], [791.5, -88.2, -62.5], [796, -87.8, -61.5],
        [800, -87.8, -60], [800, -87.6, -56], [800, -87, -51], [800, -85, -45.5]]),
      route(`${EC}.route.crawl_back`, "diver", "exit", [[778, -89.4, -67], [771.5, -90.1, -69.5], [769, -90.4, -71], [764.5, -91, -74.5],
        [761.5, -91.6, -78], [760.6, -92.2, -82], [760, -92.4, -86], [760, -91.6, -95]]),
      route(`${EC}.route.pocket_exit`, "diver", "exit", [[804, -87.8, -62], [800, -87.8, -60], [800, -87.6, -56], [800, -87, -51], [800, -85, -45.5]]),
    ],
    staging: [],
    note: "Two small caves joined by a 24 m crawlway under the nursery rim: the quiet diver's path past the open crowns.",
  },
  caves: [
    { id: POCKET, size: "small", rooms: [`${POCKET}.rim`, `${POCKET}.pocket`], exits: [{ exit: "rim mouth", portal: `${POCKET}.mouth.rim` }] },
    { id: CRAWL, size: "small", rooms: [`${CRAWL}.crawl`],
      exits: [{ exit: "slope mouth", portal: `${CRAWL}.mouth.slope` }, { exit: "pocket end", portal: `${CRAWL}.throat.pocket_end` }] },
  ],
  links: [
    { id: `${EC}.crawlway`, between: [CRAWL, POCKET], kind: "crawlway", owner: EC, rooms: [`${EC}.link`],
      rescue: [`${EC}.route.through`, `${EC}.route.crawl_back`, `${EC}.route.pocket_exit`],
      note: "Owned by one footprint with both caves. Lamp off from its middle, either end glows (the rim mouth 14 m on, the slope mouth 18 m back)." },
  ],
  handoffs: [],
  pockets: [
    { id: "canopy_bladder_ceiling_resin", status: "bible", item: "buoyant_resin", cave: POCKET, room: `${POCKET}.pocket`,
      at: v3(801, -83.6, -62.5), renewable: true, note: "Cured resin floats up and lodges in the pocket's ceiling; it regrows." },
  ],
  residents: [
    { id: `${POCKET}.weavers`, species: "resin_weaver", cave: POCKET, room: `${POCKET}.pocket`, at: v3(797, -84.5, -62), count: 4, radius: 2.5,
      note: "Weaver nests in the ceiling resin." },
  ],
  finds: [],
};

// --- Lee hollow ------------------------------------------------------------------
const LEE = "canopy_lee_hollow";
const LEE_HOLLOW: CaveGroup = {
  style: "root_hollow",
  source: {
    id: LEE, label: "Lee hollow", region: "suspended_garden",
    footprint: { minX: 678, maxX: 702, minZ: -267, maxZ: -243 },
    baseY: -204, topY: -176,
    terraces: [
      terrace(`${LEE}.terrace.rib`, -183.5, [687.5, -255], [4.5, 8.5], 3.2, 0.12, 0.4, 6),
      terrace(`${LEE}.terrace.roots`, -184.5, [694.5, -255.5], [6, 7.5], 2.3, 0.05, 0.6, 5),
    ],
    carves: [
      tube(`${LEE}.carve.mouth`, `${LEE}.passage`, [[682.5, -255, -191.9, 5, 4.4], [688, -255, -193, 4.6, 4.2]], 0.2),
      chamber(`${LEE}.carve.hollow`, `${LEE}.hollow`, v3(693.5, -192.2, -255), [4.2, 3.6, 4, 3.8], -196, 0.4),
    ],
    blend: 1.3,
    rooms: [room(`${LEE}.passage`, "passage", "Lee passage"), room(`${LEE}.hollow`, "chamber", "Lee hollow", 5)],
    portals: [
      mouth(`${LEE}.mouth`, "Lee mouth", `${LEE}.passage`, v3(682.5, -190.1, -255), "-x", [4, 3.4]),
      throat(`${LEE}.throat`, "Lee throat", `${LEE}.passage`, `${LEE}.hollow`, v3(689.3, -191.4, -255), "+x", [3, 2.6]),
    ],
    routes: [
      route(`${LEE}.route.exit`, "diver", "exit", [[695.5, -195.2, -255], [693.5, -195.4, -255], [690, -192.6, -255], [685, -191.8, -255], [680, -191.2, -255], [674, -191, -255]]),
    ],
    staging: [],
    note: "A hollow behind the mooring lee's rib, its floor sunk below the sill so resin rolls to the back.",
  },
  caves: [{ id: LEE, size: "small", rooms: [`${LEE}.passage`, `${LEE}.hollow`], exits: [{ exit: "lee mouth", portal: `${LEE}.mouth` }] }],
  links: [], handoffs: [],
  pockets: [
    { id: "canopy_lee_hollow_resin", status: "proposed", item: "buoyant_resin", cave: LEE, room: `${LEE}.hollow`, at: v3(696.5, -195, -255),
      stock: [8, 2, 0], renewable: false, note: "Resin piled at the hollow's back, beside the mooring's own lee patch (bible prose: extra resin)." },
  ],
  residents: [
    { id: `${LEE}.weavers`, species: "resin_weaver", cave: LEE, room: `${LEE}.hollow`, at: v3(694, -189.5, -255), count: 2, radius: 2,
      note: "A pair over the resin pile." },
  ],
  finds: [],
};

// --- Fin cleft -------------------------------------------------------------------
const FIN = "canopy_fin_cleft";
// Authored on the bible's spot (548..572 x -162..-138), then moved 69 m
// north-east off the carrier corridor (route.isles.canopy_east passes right
// over it, and the world refuses the carrier's 17 m box anywhere over a cave
// footprint), onto the same slope above the east fins.
const FIN_CLEFT: CaveGroup = moved({
  style: "root_hollow",
  source: {
    id: FIN, label: "Fin cleft", region: "suspended_garden",
    footprint: { minX: 548, maxX: 572, minZ: -162, maxZ: -138 },
    baseY: -144, topY: -108,
    terraces: [
      terrace(`${FIN}.terrace.rib`, -114, [560, -150], [9.5, 6.5], 3, 0.06, 0.45, 7),
      terrace(`${FIN}.terrace.crest`, -111.5, [559, -150.5], [6, 3.5], 2.6, 0.1, 0.4, 5),
    ],
    carves: [
      tube(`${FIN}.carve.cleft`, `${FIN}.cleft`, [[560, -158.5, -129.2, 4.8, 7], [560, -154.5, -129, 4.4, 8], [560.4, -150, -128.6, 4.2, 8.2],
        [560, -147, -128, 4.4, 8], [560, -144, -125.5, 4.8, 7]], 0.3),
    ],
    blend: 1.2,
    rooms: [room(`${FIN}.cleft`, "passage", "Fin cleft", 6)],
    portals: [
      mouth(`${FIN}.mouth.north`, "North end", `${FIN}.cleft`, v3(560, -123, -143), "+z", [3.5, 4.5]),
      mouth(`${FIN}.mouth.south`, "South end", `${FIN}.cleft`, v3(560, -125.6, -157), "-z", [3.5, 4.5]),
    ],
    routes: [
      route(`${FIN}.route.through`, "diver", "loop", [[560, -120.6, -138.5], [560, -123.4, -142.5], [560, -125.3, -145.5], [560.3, -127.5, -150], [560, -128, -155.5], [560, -127.4, -163]]),
    ],
    staging: [],
    note: "A split through a mineral rib, both walls crusted with grounding fins: a short, safe crust pocket out of the open water.",
  },
  caves: [{ id: FIN, size: "small", rooms: [`${FIN}.cleft`],
    exits: [{ exit: "north end", portal: `${FIN}.mouth.north` }, { exit: "south end", portal: `${FIN}.mouth.south` }] }],
  links: [], handoffs: [],
  pockets: [
    { id: "canopy_fin_cleft_crust", status: "proposed", item: "conductive_crust", cave: FIN, room: `${FIN}.cleft`, at: v3(561.6, -126.5, -150),
      stock: [8, 2, 0], renewable: false, note: "Fins on both walls of the split, out of drifting silt (bible prose: a sheltered crust pocket)." },
  ],
  residents: [],
  finds: [],
}, v3(66, 9, 20));

// --- Root arch: arch hollows and escarpment gallery ------------------------------
// The hollows' crawl joins the gallery's arch-foot chamber, so one footprint
// owns both caves in the head's north flank, over the valley to the deep east arm.
const RA = "canopy_root_arch";
const HOLLOWS = "canopy_arch_hollows", GALLERY = "canopy_escarp_gallery";
const ROOT_ARCH: CaveGroup = {
  style: "root_hollow",
  source: {
    id: RA, label: "Root-arch caves", region: "suspended_garden",
    footprint: { minX: 1236, maxX: 1310, minZ: -298, maxZ: -260 },
    baseY: -330, topY: -218,
    terraces: [],
    carves: [
      // Arch hollows: two hollows in the arch's foot, a throat between them.
      tube(`${RA}.carve.hollow_a_mouth`, `${HOLLOWS}.hollow_a`, [[1246, -276.5, -254.8, 4.4, 4], [1246, -280.5, -256.3, 4.4, 4]], 0.2),
      chamber(`${RA}.carve.hollow_a`, `${HOLLOWS}.hollow_a`, v3(1246, -253.6, -282.5), [4.5, 3.5, 3, 2.6], -256.5, 0.35),
      tube(`${RA}.carve.hollows_throat`, `${HOLLOWS}.hollow_b`, [[1249.5, -284, -257, 3, 3], [1253, -284, -257.5, 3, 3]], 0.2),
      chamber(`${RA}.carve.hollow_b`, `${HOLLOWS}.hollow_b`, v3(1257, -255.6, -283.5), [4.5, 3.5, 3, 2.6], -258.5, 0.35),
      tube(`${RA}.carve.window`, `${HOLLOWS}.hollow_b`, [[1257, -277.5, -256.8, 3.8, 4], [1257, -281.5, -258.2, 3.8, 4]], 0.2),
      // The crawl from hollow B down into the arch-foot chamber's west wall.
      tube(`${RA}.carve.crawl`, `${RA}.crawl`, [[1261.5, -284, -259, 3, 3], [1265, -285, -260.4, 3, 3], [1268.5, -286, -261.4, 3, 3]], 0.2),
      // Escarpment gallery: arch-foot chamber, gallery, lip chamber, deep in the head's north flank.
      tube(`${RA}.carve.arch_mouth`, `${GALLERY}.arch_foot`, [[1274.5, -288, -266.6, 11, 5.8], [1275.5, -279, -265.2, 11, 5.8]], 0.3),
      chamber(`${RA}.carve.arch_foot`, `${GALLERY}.arch_foot`, v3(1273.5, -262.6, -287), [6.5, 5.5, 4.8, 4], -266.6, 0.45),
      tube(`${RA}.carve.gallery`, `${GALLERY}.gallery`, [[1281, -287, -267.4, 10.5, 9], [1288, -286.5, -272, 10.5, 9.5], [1295, -285.5, -276.6, 10.5, 9], [1298, -285, -278, 9, 8]], 0.35),
      chamber(`${RA}.carve.lip`, `${GALLERY}.lip`, v3(1300, -275, -284.5), [5.5, 5.5, 5, 4], -279, 0.45),
      tube(`${RA}.carve.lip_mouth`, `${GALLERY}.lip`, [[1300, -284, -279, 11, 5.8], [1300, -276, -279, 11, 5.8]], 0.3),
      // Root chimney: south out of the lip chamber, up a shaft, west above the gallery to the arch foot.
      tube(`${RA}.carve.chimney_low`, `${GALLERY}.chimney`, [[1300.5, -288.5, -278.8, 3, 3], [1300.5, -294, -278.6, 3, 3]], 0.25),
      shaft(`${RA}.carve.chimney_shaft`, `${GALLERY}.chimney`, [1301, -294], 1.5, -278.6, -259.5, 0, 0.2),
      tube(`${RA}.carve.chimney_high`, `${GALLERY}.chimney`, [[1300.5, -294, -261.6, 3, 3], [1290, -292, -257.5, 3, 3], [1282, -291.5, -255, 3, 3],
        [1273, -290.5, -255, 3, 3]], 0.25),
      shaft(`${RA}.carve.chimney_drop`, `${GALLERY}.chimney`, [1272.5, -290.5], 1.6, -259.5, -252.5, 0, 0.2),
    ],
    blend: 1.4,
    rooms: [
      room(`${HOLLOWS}.hollow_a`, "chamber", "Arch hollow", 5), room(`${HOLLOWS}.hollow_b`, "chamber", "Window hollow", 5),
      room(`${RA}.crawl`, "passage", "Arch crawl", 5),
      room(`${GALLERY}.arch_foot`, "chamber", "Arch-foot chamber", 7), room(`${GALLERY}.gallery`, "passage", "Gallery", 7),
      room(`${GALLERY}.lip`, "chamber", "Lip chamber", 8), room(`${GALLERY}.chimney`, "passage", "Root chimney", 9),
    ],
    portals: [
      mouth(`${HOLLOWS}.mouth.arch_foot`, "Arch-foot mouth", `${HOLLOWS}.hollow_a`, v3(1246, -253.4, -277), "+z", [3.6, 3.2]),
      mouth(`${HOLLOWS}.mouth.window`, "Escarpment window", `${HOLLOWS}.hollow_b`, v3(1257, -255.5, -278.7), "+z", [3.5, 3]),
      throat(`${HOLLOWS}.throat`, "Hollow throat", `${HOLLOWS}.hollow_a`, `${HOLLOWS}.hollow_b`, v3(1250.5, -255.6, -284), "+x", [2.2, 2.2]),
      throat(`${RA}.throat.crawl_west`, "Crawl from the hollows", `${HOLLOWS}.hollow_b`, `${RA}.crawl`, v3(1262.2, -257.6, -283.5), "+x", [2.2, 2.2]),
      throat(`${RA}.throat.crawl_east`, "Crawl into the arch foot", `${RA}.crawl`, `${GALLERY}.arch_foot`, v3(1267.6, -260.2, -285.7), "+x", [2.2, 2.2]),
      mouth(`${GALLERY}.mouth.arch`, "Arch mouth", `${GALLERY}.arch_foot`, v3(1275.4, -263, -278.5), "+z", [8.5, 4], ["diver", "small"]),
      throat(`${GALLERY}.throat.down`, "Gallery head", `${GALLERY}.arch_foot`, `${GALLERY}.gallery`, v3(1279.8, -264.4, -287), "+x", [7.5, 3.6], ["diver", "small"]),
      throat(`${GALLERY}.throat.gallery_lip`, "Gallery foot", `${GALLERY}.gallery`, `${GALLERY}.lip`, v3(1295, -273.6, -285.5), "+x", [7.5, 3.6], ["diver", "small"]),
      mouth(`${GALLERY}.mouth.lip`, "Escarpment lip", `${GALLERY}.lip`, v3(1300, -276.8, -277.5), "+z", [8.5, 4], ["diver", "small"]),
      throat(`${GALLERY}.throat.chimney_foot`, "Chimney foot", `${GALLERY}.lip`, `${GALLERY}.chimney`, v3(1300.5, -277.6, -290), "-z", [2.2, 2.2]),
      throat(`${GALLERY}.throat.chimney_head`, "Chimney head", `${GALLERY}.chimney`, `${GALLERY}.arch_foot`, v3(1272.5, -258.4, -290.5), "-y", [2, 2]),
    ],
    routes: [
      route(`${RA}.route.hall`, "small", "loop", [[1275.5, -262.6, -268], [1275.5, -262.6, -276], [1275.5, -263.6, -280], [1275, -264.6, -284], [1276, -265.2, -287], [1280, -265.8, -287],
        [1284, -266.3, -286.8], [1288, -268.8, -286.5], [1292, -271.2, -286], [1295, -272.9, -285], [1298, -275.4, -284.8], [1300, -275.8, -284],
        [1300, -275.8, -279], [1300, -275.8, -268]]),
      route(`${RA}.route.chimney`, "diver", "loop", [[1300, -277.4, -268], [1300, -277.4, -279], [1300, -277.8, -285], [1300.5, -277.8, -290], [1301, -277.6, -294],
        [1301, -270, -294], [1301, -261.6, -294], [1300.5, -260.8, -294], [1290, -256.8, -292], [1282, -254.4, -291.5], [1273, -254.4, -290.5],
        [1272.5, -256, -290.5], [1272.5, -259.5, -290.5], [1273, -262, -289], [1274.5, -265.6, -287], [1275, -265, -283], [1275.5, -264.8, -276], [1275.5, -264.8, -268]]),
      route(`${RA}.route.hollows`, "diver", "loop", [[1246, -253.8, -270], [1246, -254.1, -276], [1246, -255.1, -280], [1246, -255.4, -283], [1250, -256.4, -284], [1253, -256.8, -284],
        [1257, -257.4, -283.5], [1257, -257.4, -280.5], [1257, -256.3, -277.5], [1257, -255.6, -272]]),
      route(`${RA}.route.crawl`, "diver", "exit", [[1272.5, -265.6, -287], [1270, -262.2, -286.5], [1267, -260.4, -285.6], [1264, -259.2, -284.7],
        [1262, -258.2, -284], [1258, -257.6, -283.5], [1257, -257.4, -280.5], [1257, -256.3, -277.5], [1257, -255.6, -272]]),
    ],
    staging: [
      { id: `${RA}.parking`, role: "craft_parking", label: "Arch-foot valley parking", position: v3(1268, -279, -252), radius: 8, profiles: ["small"] },
    ],
    note: "Under the escarpment head's north flank: two diver hollows in the root arch's foot, crawled into a small-craft gallery that " +
      "falls to a lip over the deep east arm. A root chimney climbs back from the lip chamber to the arch foot.",
  },
  caves: [
    { id: HOLLOWS, size: "small", rooms: [`${HOLLOWS}.hollow_a`, `${HOLLOWS}.hollow_b`],
      exits: [{ exit: "arch-foot mouth", portal: `${HOLLOWS}.mouth.arch_foot` }, { exit: "escarpment window", portal: `${HOLLOWS}.mouth.window` }] },
    { id: GALLERY, size: "medium", rooms: [`${GALLERY}.arch_foot`, `${GALLERY}.gallery`, `${GALLERY}.lip`, `${GALLERY}.chimney`],
      exits: [{ exit: "arch mouth", portal: `${GALLERY}.mouth.arch` }, { exit: "escarpment lip", portal: `${GALLERY}.mouth.lip` }],
      chambers: [{ name: "arch-foot chamber", room: `${GALLERY}.arch_foot` }, { name: "gallery", room: `${GALLERY}.gallery` }, { name: "lip chamber", room: `${GALLERY}.lip` }],
      passages: [
        { id: "arch_mouth", portal: `${GALLERY}.mouth.arch` }, { id: "lip", portal: `${GALLERY}.mouth.lip` },
        { id: "down", portal: `${GALLERY}.throat.down` }, { id: "gallery_lip", portal: `${GALLERY}.throat.gallery_lip` },
        { id: "root_chimney", portal: `${GALLERY}.throat.chimney_head`, via: `${GALLERY}.chimney` },
      ],
      loopCloser: "root_chimney", hall: { rooms: [`${GALLERY}.arch_foot`, `${GALLERY}.gallery`, `${GALLERY}.lip`], admits: "small" } },
  ],
  links: [
    { id: `${RA}.crawlway`, between: [HOLLOWS, GALLERY], kind: "crawlway", owner: RA, rooms: [`${RA}.crawl`], rescue: [`${RA}.route.crawl`],
      note: "Six metres from the window hollow into the arch-foot chamber's west wall, high above its floor; owned with both caves." },
  ],
  handoffs: [],
  pockets: [],
  residents: [
    { id: `${HOLLOWS}.weavers`, species: "resin_weaver", cave: HOLLOWS, room: `${HOLLOWS}.hollow_a`, at: v3(1245, -252, -283), count: 2, radius: 1.8,
      note: "Nests in the arch foot's roots." },
    { id: `${GALLERY}.weavers`, species: "resin_weaver", cave: GALLERY, room: `${GALLERY}.chimney`, at: v3(1301, -270, -293.5), count: 2, radius: 1,
      note: "Root-wrapped chimney walls." },
  ],
  finds: [
    { id: `${HOLLOWS}.arch_scan`, kind: "scan", cave: HOLLOWS, room: `${HOLLOWS}.hollow_a`, at: v3(1243, -254.5, -284.5), label: "Root-arch growth rings",
      note: "Bible: root-arch scan, how the arch grew. The hollow's back wall is the root's cut face." },
    { id: "canopy.escarp_window", kind: "view", cave: GALLERY, room: `${GALLERY}.lip`, at: v3(1300, -277, -279), label: "Escarpment window",
      note: "Bible side reward: the escarpment falls away into the dark from the lip mouth." },
  ],
};

// --- Lantern hall ----------------------------------------------------------------
const LH = "canopy_lantern_hall";
// Authored 16 m east of where it stands: moved west so route.canopy_east.basin's
// carrier keeps its 17 m box clear of the footprint (see the fin cleft).
const LANTERN_HALL: CaveGroup = moved({
  style: "root_hollow",
  source: {
    id: LH, label: "Lantern hall", region: "suspended_garden",
    footprint: { minX: 486, maxX: 554, minZ: -260, maxZ: -204 },
    baseY: -192, topY: -144,
    terraces: [
      terrace(`${LH}.terrace.rib`, -150, [519, -226], [27, 12], 3.5, 0.08, 0.7, 9),
      terrace(`${LH}.terrace.crown`, -147, [516, -225.5], [16, 7], 3, 0.15, 0.6, 7),
    ],
    carves: [
      tube(`${LH}.carve.mooring_mouth`, `${LH}.lit_hall`, [[547.5, -227, -173, 11, 5.6], [538, -227, -173, 11, 5.6]], 0.3),
      chamber(`${LH}.carve.lit_hall`, `${LH}.lit_hall`, v3(532, -169, -227), [9, 7, 5, 4], -173.2, 0.5),
      tube(`${LH}.carve.hall_bend`, `${LH}.hall_bend`, [[527, -228.5, -173.2, 10.5, 5.6], [518, -229.5, -173, 10.5, 5.6], [511, -230, -172.8, 10.5, 5.6]], 0.35),
      chamber(`${LH}.carve.root_bend`, `${LH}.root_bend`, v3(508.5, -169, -230.5), [7, 7, 4.5, 3.6], -172.6, 0.5),
      tube(`${LH}.carve.terrace_mouth`, `${LH}.root_bend`, [[511, -233.5, -172.6, 10.5, 5.8], [511, -239.5, -170.3, 10.5, 5.8]], 0.3),
      tube(`${LH}.carve.branch_in`, `${LH}.branch_in`, [[504, -224.5, -171.2, 3.2, 3.2], [505.5, -220, -171, 3.2, 3.2], [509.5, -218.2, -170.8, 3.2, 3.2]], 0.25),
      chamber(`${LH}.carve.weaver_branch`, `${LH}.weaver_branch`, v3(515.5, -169.2, -217.6), [5, 2.6, 2.6, 1.6], -170.8, 0.35),
      tube(`${LH}.carve.branch_back`, `${LH}.branch_back`, [[521.5, -217.4, -170.8, 3.2, 3.2], [527, -217, -171, 3.2, 3.2], [532, -219.5, -171.4, 3.2, 3.2]], 0.25),
    ],
    blend: 1.5,
    rooms: [
      room(`${LH}.lit_hall`, "chamber", "Lit hall", 9), room(`${LH}.hall_bend`, "passage", "Hall bend", 8), room(`${LH}.root_bend`, "chamber", "Root bend", 8),
      room(`${LH}.branch_in`, "passage", "Branch crawl", 4), room(`${LH}.weaver_branch`, "chamber", "Weaver branch", 4), room(`${LH}.branch_back`, "passage", "Nest crawl", 4),
    ],
    portals: [
      mouth(`${LH}.mouth.mooring`, "Mooring mouth", `${LH}.lit_hall`, v3(547.5, -170.8, -227), "+x", [8.5, 4], ["diver", "small"]),
      throat(`${LH}.throat.hall_bend`, "Hall bend", `${LH}.lit_hall`, `${LH}.hall_bend`, v3(523, -170.8, -228.6), "-x", [7.5, 3.6], ["diver", "small"]),
      throat(`${LH}.throat.root_bend`, "Root bend", `${LH}.hall_bend`, `${LH}.root_bend`, v3(513, -171, -230), "-x", [7.5, 3.6], ["diver", "small"]),
      mouth(`${LH}.mouth.terrace`, "Terrace mouth", `${LH}.root_bend`, v3(511, -167.8, -239.5), "-z", [8.5, 4], ["diver", "small"]),
      throat(`${LH}.throat.branch_in`, "Branch crawl", `${LH}.root_bend`, `${LH}.branch_in`, v3(504.4, -169.9, -223.3), "+z", [2.2, 2.2]),
      throat(`${LH}.throat.weaver_branch`, "Branch nests", `${LH}.branch_in`, `${LH}.weaver_branch`, v3(510.2, -169.6, -218), "+x", [2.2, 2.2]),
      throat(`${LH}.throat.branch_back`, "Nest crawl", `${LH}.weaver_branch`, `${LH}.branch_back`, v3(521, -169.6, -217.4), "+x", [2.2, 2.2]),
      throat(`${LH}.throat.hall_north`, "Hall north", `${LH}.branch_back`, `${LH}.lit_hall`, v3(532, -170, -220.6), "-z", [2.2, 2.2]),
    ],
    routes: [
      route(`${LH}.route.hall`, "small", "loop", [[558, -171.6, -227], [546, -172, -227], [535, -172, -227], [523, -172, -229], [514, -171.6, -230],
        [511, -171.4, -230.5], [511, -170.8, -234], [511, -169.4, -238], [511, -168.6, -243], [511, -168.4, -250]]),
      route(`${LH}.route.branch`, "diver", "loop", [[558, -172, -227], [546, -172.4, -227], [533, -172.6, -225], [532, -170.6, -221], [527, -170.4, -217.2],
        [521.5, -170.2, -217.4], [515.5, -170.4, -217.6], [510, -170.2, -218.2], [505.5, -170.4, -220], [504.4, -170.6, -223.6], [507, -172, -228],
        [511, -172, -232], [511, -171, -237], [511, -168.8, -243], [511, -168.2, -250]]),
      route(`${LH}.route.branch_exit`, "diver", "exit", [[515.5, -170.4, -217.6], [521.5, -170.2, -217.4], [527, -170.4, -217.2], [532, -170.6, -221],
        [534, -172.6, -226], [546, -172.4, -227], [558, -172, -227]]),
    ],
    staging: [
      { id: `${LH}.parking`, role: "craft_parking", label: "Mooring-side parking", position: v3(560, -172, -224), radius: 8, profiles: ["small", "medium"] },
    ],
    note: "A sheltered pass through a root-wrapped mineral rib between the mooring bowl and the Basin side: a Dart-wide hall " +
      "with a diver branch along the weaver nests that rejoins it.",
  },
  caves: [{ id: LH, size: "medium", rooms: [`${LH}.lit_hall`, `${LH}.hall_bend`, `${LH}.root_bend`, `${LH}.branch_in`, `${LH}.weaver_branch`, `${LH}.branch_back`],
    exits: [{ exit: "mooring mouth", portal: `${LH}.mouth.mooring` }, { exit: "terrace mouth", portal: `${LH}.mouth.terrace` }],
    chambers: [{ name: "lit hall", room: `${LH}.lit_hall` }, { name: "root bend", room: `${LH}.root_bend` }, { name: "weaver branch", room: `${LH}.weaver_branch` }],
    passages: [
      { id: "mooring_mouth", portal: `${LH}.mouth.mooring` }, { id: "terrace_mouth", portal: `${LH}.mouth.terrace` },
      { id: "hall_bend", portal: `${LH}.throat.root_bend`, via: `${LH}.hall_bend` },
      { id: "branch_in", portal: `${LH}.throat.weaver_branch`, via: `${LH}.branch_in` },
      { id: "branch_back", portal: `${LH}.throat.hall_north`, via: `${LH}.branch_back` },
    ],
    loopCloser: "branch_back", hall: { rooms: [`${LH}.lit_hall`, `${LH}.hall_bend`, `${LH}.root_bend`], admits: "small" } }],
  links: [], handoffs: [],
  pockets: [
    { id: "canopy_lantern_nest_resin", status: "proposed", item: "buoyant_resin", cave: LH, room: `${LH}.weaver_branch`, at: v3(515.5, -167.6, -218),
      stock: [6, 2, 0], renewable: true, note: "Empty weaver nests along the branch ceiling (bible prose: weaver nests)." },
  ],
  residents: [
    { id: `${LH}.weavers`, species: "resin_weaver", cave: LH, room: `${LH}.weaver_branch`, at: v3(515.5, -168.6, -217.6), count: 5, radius: 1.8,
      note: "The branch's nest colony; occupied nests have a weaver at the door." },
  ],
  finds: [
    { id: "canopy.lantern_pass", kind: "view", cave: LH, room: `${LH}.lit_hall`, at: v3(532, -171.5, -227), label: "Lantern hall pass",
      note: "Bible side reward (shortcut): the sheltered pass from the east mooring bowl toward the Basin." },
  ],
}, v3(-16, 0, 0));

export const CANOPY_CAVES: readonly CaveGroup[] = [KNOT_HOLLOW, EASTCROWN, LEE_HOLLOW, FIN_CLEFT, ROOT_ARCH, LANTERN_HALL];
