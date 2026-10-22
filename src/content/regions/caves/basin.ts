import { chamber, mouth, room, route, shaft, terrace, throat, tube, v3, type CaveGroup } from "./authored.js";

/** Pale Basin small and medium caves: silt-buried vaults (CA-2).
 *
 * Half-natural, half-cut chambers in sediment-cemented rock: silt mounds and
 * spoil heaps outside, squared tubes and still vaults inside, soft floors.
 * Resident: wakeglow drift. Anything moving through still vault water leaves
 * a glowing wake that fades over about a minute (`wakeglow.ts`), so a diver's
 * own trail lights the way back out. No threat, on purpose.
 * Bible: docs/content/regions/pale-basin.md section 3. */

// --- North culvert ---------------------------------------------------------------
const CULVERT = "basin_culvert_north";
const CULVERT_NORTH: CaveGroup = {
  style: "silt_vault",
  source: {
    id: CULVERT, label: "North culvert", region: "silt_basin",
    footprint: { minX: 398, maxX: 422, minZ: -507, maxZ: -483 },
    baseY: -282, topY: -252,
    terraces: [
      terrace(`${CULVERT}.terrace.mound`, -258.5, [410, -496], [6.5, 7], 3, 0.15, 0.5, 8),
      terrace(`${CULVERT}.terrace.cap`, -256.5, [410.5, -497], [4, 4.5], 2.4, 0.2, 0.4, 6),
    ],
    carves: [
      tube(`${CULVERT}.carve.culvert`, `${CULVERT}.culvert`, [[410, -486.5, -271.4, 4.2, 4.6], [410, -492, -271.6, 4, 4.6], [410, -497, -271.8, 4, 4.6]], 0.15),
      chamber(`${CULVERT}.carve.well`, `${CULVERT}.well`, v3(410, -269.6, -499.4), [3.2, 2.8, 2.6, 2.4], -272.6, 0.3),
    ],
    blend: 1.1,
    rooms: [room(`${CULVERT}.culvert`, "passage", "Culvert"), room(`${CULVERT}.well`, "pocket", "Intake well", 4)],
    portals: [
      mouth(`${CULVERT}.mouth`, "Culvert mouth", `${CULVERT}.culvert`, v3(410, -269.6, -488.5), "+z", [3.6, 3.4]),
      throat(`${CULVERT}.throat`, "Intake well", `${CULVERT}.culvert`, `${CULVERT}.well`, v3(410, -270, -497), "-z", [2.8, 2.8]),
    ],
    routes: [
      route(`${CULVERT}.route.exit`, "diver", "exit", [[410, -271.6, -500], [410, -271.4, -497.5], [410, -271.2, -493], [410, -271, -488], [410, -270.8, -484]]),
    ],
    staging: [],
    note: "A buried intake culvert near the north dish: square, silted, fins on its walls; one mouth facing the lower ground.",
  },
  caves: [{ id: CULVERT, size: "small", rooms: [`${CULVERT}.culvert`, `${CULVERT}.well`], exits: [{ exit: "culvert mouth", portal: `${CULVERT}.mouth` }] }],
  links: [], handoffs: [],
  pockets: [
    { id: "basin_culvert_crust", status: "bible", item: "conductive_crust", cave: CULVERT, room: `${CULVERT}.culvert`,
      at: v3(411.4, -270.8, -495), renewable: false, note: "Grounding fins on the culvert walls stay clean of silt." },
  ],
  residents: [
    { id: `${CULVERT}.wakeglow`, species: "wakeglow_drift", cave: CULVERT, room: `${CULVERT}.culvert`, at: v3(410, -269.6, -494), count: 40, radius: 1.6,
      note: "Still culvert water: the drift lights a diver's wake back to the mouth." },
  ],
  finds: [],
};

// --- Burrow warren ---------------------------------------------------------------
// Back entrance to the ridge vaults (`basin_ridge_vaults`, a cave biome on the
// large-cave technology). The crawl stops in a turning bay short of the
// footprint edge; the biome opens the face recorded in `handoffs`.
const WARREN = "basin_burrow_warren";
const BURROW_WARREN: CaveGroup = {
  style: "silt_vault",
  source: {
    id: WARREN, label: "Burrow warren", region: "silt_basin",
    footprint: { minX: 776, maxX: 812, minZ: -702, maxZ: -672 },
    baseY: -336, topY: -256,
    terraces: [],
    carves: [
      tube(`${WARREN}.carve.burrow`, `${WARREN}.crawl`, [[800, -691.5, -296.4, 4.6, 3.8], [800.4, -687, -298, 4, 3.2], [801.5, -683, -298.8, 3, 3],
        [803, -679.5, -299.2, 3, 3], [805.5, -676.8, -299.4, 3, 3]], 0.3),
      chamber(`${WARREN}.carve.den`, `${WARREN}.crawl`, v3(797.6, -296.8, -684.5), [2.2, 1.8, 1.6, 1.2], -298, 0.3),
      chamber(`${WARREN}.carve.bay`, `${WARREN}.bay`, v3(807.4, -297.6, -676.4), [2.1, 2.2, 2, 1.6], -299.4, 0.25),
    ],
    blend: 1,
    rooms: [room(`${WARREN}.crawl`, "passage", "Burrow crawl", 4), room(`${WARREN}.bay`, "pocket", "Breakthrough bay", 4)],
    portals: [
      mouth(`${WARREN}.mouth`, "Burrow mouth", `${WARREN}.crawl`, v3(800, -294.8, -689), "-z", [3.5, 3]),
      throat(`${WARREN}.throat.bay`, "Bay", `${WARREN}.crawl`, `${WARREN}.bay`, v3(805.6, -297.6, -676.6), "+x", [2.2, 2.2]),
    ],
    routes: [
      route(`${WARREN}.route.exit`, "diver", "exit", [[808, -298.6, -676.4], [805.5, -298.6, -676.8], [803, -298.4, -679.5], [801.5, -298.2, -683], [800.6, -297.4, -686.5],
        [800, -296, -690.5], [800, -296, -695]]),
      route(`${WARREN}.route.den`, "diver", "exit", [[797.6, -297.6, -684.5], [800.4, -297.6, -685.5], [800.6, -297.4, -686.5], [800, -296, -690.5], [800, -296, -695]]),
    ],
    staging: [],
    note: "Scavenger burrows widened into a crawl up into the wreck ridge's south nose; it stops in a turning bay where the ridge vaults will break through.",
  },
  caves: [{ id: WARREN, size: "small", rooms: [`${WARREN}.crawl`, `${WARREN}.bay`], exits: [{ exit: "burrow mouth", portal: `${WARREN}.mouth` }] }],
  links: [
    { id: `${WARREN}.back_entrance`, between: [WARREN, "basin_ridge_vaults"], kind: "back_entrance", owner: WARREN, rooms: [`${WARREN}.crawl`, `${WARREN}.bay`],
      rescue: [`${WARREN}.route.exit`, `${WARREN}.route.den`],
      note: "Bible entrance basin_ridge_vaults.burrow_entry. Until the biome is built the bay is a dead end with room to turn; its exit route is the rescue." },
  ],
  handoffs: [
    { id: `${WARREN}.handoff`, biome: "basin_ridge_vaults", entrance: "basin_ridge_vaults.burrow_entry", room: `${WARREN}.bay`,
      center: v3(809.5, -297.8, -676.4), normal: v3(1, 0, 0), clear: { width: 2.2, height: 2.2 } },
  ],
  pockets: [],
  residents: [
    { id: `${WARREN}.scavengers`, species: "basin_scavengers", cave: WARREN, room: `${WARREN}.crawl`, at: v3(797.4, -297, -684.5), count: 3, radius: 0.8, den: true,
      note: "A scavenger den in the side burrow; they back away from a diver." },
    { id: `${WARREN}.wakeglow`, species: "wakeglow_drift", cave: WARREN, room: `${WARREN}.crawl`, at: v3(802, -297.4, -681.5), count: 30, radius: 1.2,
      note: "Still burrow water." },
  ],
  finds: [],
};

// --- Buried survey hut -------------------------------------------------------------
const HUT = "basin_buried_hut";
const BURIED_HUT: CaveGroup = {
  style: "silt_vault",
  source: {
    id: HUT, label: "Buried survey hut", region: "silt_basin",
    footprint: { minX: 548, maxX: 572, minZ: -782, maxZ: -758 },
    baseY: -388, topY: -366,
    terraces: [
      terrace(`${HUT}.terrace.silt`, -372.5, [560, -770], [7, 6.5], 2.6, 0.3, 0.5, 8),
    ],
    carves: [
      chamber(`${HUT}.carve.room`, `${HUT}.room`, v3(559.5, -379, -770), [4.8, 2.8, 3, 3.2], -382, 0.25),
      shaft(`${HUT}.carve.slot`, `${HUT}.slot`, [561.5, -769.5], 2.6, -377.6, -369.5, 0, 0.15),
    ],
    blend: 1,
    rooms: [room(`${HUT}.room`, "chamber", "Survey hut", 4), room(`${HUT}.slot`, "shaft", "Door slot", 8)],
    portals: [
      mouth(`${HUT}.mouth.slot`, "Door slot", `${HUT}.slot`, v3(561.5, -372, -769.5), "+y", [3.5, 3]),
      throat(`${HUT}.throat.slot`, "Door", `${HUT}.slot`, `${HUT}.room`, v3(561.5, -377.4, -769.5), "-y", [2.8, 2.6]),
    ],
    routes: [
      route(`${HUT}.route.exit`, "diver", "exit", [[557, -381.2, -770], [559.5, -381.6, -770], [561.5, -380.6, -769.5], [561.5, -376.5, -769.5],
        [561.5, -372, -769.5], [561.5, -367.5, -769.5]]),
    ],
    staging: [],
    note: "A survey hut swallowed to its roofline by the pale floor's silt; the door is a slot in the roof you swim down through.",
  },
  caves: [{ id: HUT, size: "small", rooms: [`${HUT}.room`, `${HUT}.slot`], exits: [{ exit: "door slot", portal: `${HUT}.mouth.slot` }] }],
  links: [], handoffs: [],
  pockets: [],
  residents: [
    { id: `${HUT}.wakeglow`, species: "wakeglow_drift", cave: HUT, room: `${HUT}.room`, at: v3(559.5, -379.5, -770), count: 40, radius: 2,
      note: "The stillest water in the Basin: the wake lingers longest here." },
  ],
  finds: [
    { id: `${HUT}.survey_lens`, kind: "part", cave: HUT, room: `${HUT}.room`, at: v3(556, -381.4, -771.2), label: "Survey lens spare",
      note: "Bible: survey range +30% for one station (SYS-2 survey station part)." },
  ],
};

// --- Fracture pocket ---------------------------------------------------------------
// Moved east off route.basin.legacy_anchorage, which crosses the bible footprint.
const FRACTURE = "basin_fracture_pocket";
const FRACTURE_POCKET: CaveGroup = {
  style: "silt_vault",
  source: {
    id: FRACTURE, label: "Fracture pocket", region: "silt_basin",
    footprint: { minX: 322, maxX: 346, minZ: -376, maxZ: -352 },
    baseY: -232, topY: -198,
    terraces: [
      terrace(`${FRACTURE}.terrace.upper_slab`, -203, [332, -361], [7, 6.5], 4, 0.05, 0.35, 9),
      terrace(`${FRACTURE}.terrace.lower_slab`, -205, [337.5, -364], [4.5, 4.5], 4, 0.05, 0.3, 7),
    ],
    carves: [
      chamber(`${FRACTURE}.carve.pocket`, `${FRACTURE}.pocket`, v3(332.5, -211.5, -361), [5.5, 2.4, 3.5, 2.8], -214.3, 0.35),
      tube(`${FRACTURE}.carve.mouth`, `${FRACTURE}.pocket`, [[336.5, -361, -214.2, 4, 4], [341.5, -361, -214.4, 4, 4]], 0.2),
    ],
    blend: 1.2,
    rooms: [room(`${FRACTURE}.pocket`, "chamber", "Fracture pocket", 5)],
    portals: [mouth(`${FRACTURE}.mouth`, "Fracture mouth", `${FRACTURE}.pocket`, v3(341, -212.6, -361), "+x", [3.5, 3])],
    routes: [
      route(`${FRACTURE}.route.exit`, "diver", "exit", [[329.5, -213.4, -361], [332.5, -213.9, -361], [337, -213.8, -361], [341.5, -213.8, -361], [345, -213.6, -361]]),
    ],
    staging: [],
    note: "A pocket between two slabs the slope fractures split apart, its faces fresh: the boundary station's sediment record, in rock.",
  },
  caves: [{ id: FRACTURE, size: "small", rooms: [`${FRACTURE}.pocket`], exits: [{ exit: "fracture mouth", portal: `${FRACTURE}.mouth` }] }],
  links: [], handoffs: [],
  pockets: [],
  residents: [],
  finds: [
    { id: `${FRACTURE}.fracture_faces`, kind: "scan", cave: FRACTURE, room: `${FRACTURE}.pocket`, at: v3(330, -212.5, -363), label: "Fresh fracture faces",
      note: "Bible: fresh fracture faces to scan." },
  ],
};

// --- West rim network: rim pipes and the west rim cut --------------------------------
// The rim pipes' crawl joins the cut's east chamber, so one footprint owns
// both caves under the rim's spoil heap and the pipe bank on the rim slope.
const WR = "basin_west_rim";
const PIPES = "basin_rim_pipes", CUT = "basin_west_rim_cut";
const WEST_RIM: CaveGroup = {
  style: "silt_vault",
  source: {
    id: WR, label: "West rim network", region: "silt_basin",
    footprint: { minX: 198, maxX: 286, minZ: -848, maxZ: -798 },
    baseY: -300, topY: -246,
    terraces: [
      terrace(`${WR}.terrace.spoil`, -250, [230, -818], [23.5, 11.5], 3, 0.1, 0.45, 10),
      terrace(`${WR}.terrace.spoil_crest`, -248, [228, -817.5], [14, 6], 2.6, 0.25, 0.5, 8),
      terrace(`${WR}.terrace.pipe_bank`, -262, [269.5, -828], [9, 7], 2.6, 0.15, 0.4, 6),
    ],
    carves: [
      // The cut: east and west chambers over a collapsed bulkhead, mouths high in the spoil.
      tube(`${WR}.carve.rim_mouth`, `${CUT}.east_cut`, [[240, -818, -261.6, 11, 6], [255, -818, -261.6, 11, 6]], 0.3),
      chamber(`${WR}.carve.east_cut`, `${CUT}.east_cut`, v3(243, -271, -818), [7.5, 8, 14, 13], -284, 0.5),
      tube(`${WR}.carve.bulkhead`, `${CUT}.bulkhead`, [[237.5, -818, -277, 10.5, 7], [222.5, -818, -278, 10.5, 7]], 0.4),
      chamber(`${WR}.carve.west_cut`, `${CUT}.west_cut`, v3(217, -274, -818), [7.5, 8, 16, 17], -291, 0.5),
      tube(`${WR}.carve.rift_mouth`, `${CUT}.west_cut`, [[220, -818, -261.6, 11, 6], [205, -818, -261.6, 11, 6]], 0.3),
      tube(`${WR}.carve.niche_in`, `${CUT}.niche_in`, [[217, -825, -281, 3.2, 3.2], [217, -830.5, -281, 3.2, 3.2]], 0.25),
      chamber(`${WR}.carve.niche`, `${CUT}.niche`, v3(217, -279, -833.5), [3.6, 3, 2.6, 2.2], -281.2, 0.3),
      tube(`${WR}.carve.pipe_gallery`, `${CUT}.pipe_gallery`, [[220.5, -834, -280.6, 3, 3], [230, -835, -280.2, 3, 3], [239, -834, -279.8, 3, 3],
        [243, -828, -279.6, 3, 3]], 0.2),
      // Rim pipes: pipe A from the bank's mouth, broken pipe B north, the crawl to the cut.
      tube(`${WR}.carve.pipe_a`, `${PIPES}.pipes`, [[276.5, -830, -271, 4.4, 3.9], [273, -830, -271, 3.8, 3.5], [267, -830, -271, 3.4, 3.4]], 0.15),
      tube(`${WR}.carve.pipe_b`, `${PIPES}.pipes`, [[268, -829.5, -270.8, 3.2, 3.2], [267.5, -822.5, -270.6, 3.2, 3.2]], 0.15),
      tube(`${WR}.carve.crawl`, `${WR}.crawl`, [[265, -830, -272, 3, 3], [258, -829, -272, 3, 3], [252, -827.5, -271.6, 3, 3], [248.5, -825, -271.2, 3, 3]], 0.25),
    ],
    blend: 1.4,
    rooms: [
      room(`${CUT}.east_cut`, "chamber", "East cut", 8), room(`${CUT}.bulkhead`, "passage", "Collapsed bulkhead", 7), room(`${CUT}.west_cut`, "chamber", "West cut", 8),
      room(`${CUT}.niche_in`, "passage", "Niche crawl", 6), room(`${CUT}.niche`, "pocket", "Pump niche", 6), room(`${CUT}.pipe_gallery`, "passage", "Pipe gallery", 9),
      room(`${PIPES}.pipes`, "passage", "Rim pipes", 4), room(`${WR}.crawl`, "passage", "Rim crawl", 4),
    ],
    portals: [
      mouth(`${CUT}.mouth.rim`, "Rim mouth", `${CUT}.east_cut`, v3(253, -259.4, -818), "+x", [8.5, 4], ["diver", "small"]),
      throat(`${CUT}.throat.bulkhead_east`, "Bulkhead, east", `${CUT}.east_cut`, `${CUT}.bulkhead`, v3(236, -275.2, -818), "-x", [7.5, 3.6], ["diver", "small"]),
      throat(`${CUT}.throat.bulkhead_west`, "Bulkhead, west", `${CUT}.bulkhead`, `${CUT}.west_cut`, v3(224, -276.2, -818), "-x", [7.5, 3.6], ["diver", "small"]),
      mouth(`${CUT}.mouth.rift`, "Rift-side mouth", `${CUT}.west_cut`, v3(207, -259.4, -818), "-x", [8.5, 4], ["diver", "small"]),
      throat(`${CUT}.throat.niche_in`, "Niche crawl", `${CUT}.west_cut`, `${CUT}.niche_in`, v3(217, -279.6, -826.2), "-z", [2.2, 2.2]),
      throat(`${CUT}.throat.niche`, "Pump niche", `${CUT}.niche_in`, `${CUT}.niche`, v3(217, -279.6, -830.6), "-z", [2.2, 2.2]),
      throat(`${CUT}.throat.pipe_gallery`, "Pipe gallery", `${CUT}.niche`, `${CUT}.pipe_gallery`, v3(220.8, -279.4, -834), "+x", [2.2, 2.2]),
      throat(`${CUT}.throat.pipe_gallery_east`, "Pipe gallery, east end", `${CUT}.pipe_gallery`, `${CUT}.east_cut`, v3(242.8, -278.1, -827.6), "+z", [2, 2]),
      mouth(`${PIPES}.mouth`, "Pipe mouth", `${PIPES}.pipes`, v3(277, -269.4, -830), "+x", [3.5, 3]),
      throat(`${WR}.throat.crawl_east`, "Crawl from the pipes", `${PIPES}.pipes`, `${WR}.crawl`, v3(265.8, -270.4, -830), "-x", [2.2, 2.2]),
      throat(`${WR}.throat.crawl_west`, "Crawl into the east cut", `${WR}.crawl`, `${CUT}.east_cut`, v3(249.4, -270.2, -825.4), "-x", [2.2, 2.2]),
    ],
    routes: [
      route(`${WR}.route.cut`, "small", "loop", [[262, -260.4, -818], [253, -260.4, -818], [245, -260.4, -818], [243, -266, -818], [242, -275.6, -818],
        [236, -275.8, -818], [230, -276.2, -818], [224, -276.4, -818], [218, -275.6, -818], [217, -266, -818], [216, -260.4, -818], [207, -260.4, -818],
        [199.5, -260.4, -818]]),
      route(`${WR}.route.pipe_gallery`, "diver", "loop", [[262, -260.8, -818], [253, -260.8, -818], [244, -261, -818], [243, -270, -820], [243, -278.6, -825],
        [243, -278.8, -828], [239, -278.8, -834], [230, -279.2, -835], [222, -279.6, -834], [217, -280.4, -833.5], [217, -280.2, -830], [217, -280.2, -826],
        [217, -280, -821], [217, -268, -818], [214, -261, -818], [207, -260.8, -818], [199.5, -260.8, -818]]),
      route(`${WR}.route.pipes`, "diver", "loop", [[282, -270.4, -830], [277, -270.4, -830], [272, -270.4, -830], [267, -270.4, -830], [262, -271.2, -829.6],
        [258, -271.2, -829], [252, -270.8, -827.5], [248.5, -270.4, -825], [245, -268, -822], [244, -262, -818], [253, -260.8, -818], [262, -260.8, -818]]),
      route(`${WR}.route.pipe_b`, "diver", "exit", [[267.5, -270, -823.5], [268, -270.2, -828.5], [272, -270.4, -830], [277, -270.4, -830], [282, -270.4, -830]]),
    ],
    staging: [
      { id: `${WR}.parking`, role: "craft_parking", label: "Rim plateau parking", position: v3(266, -260.5, -806), radius: 8, profiles: ["small", "medium"] },
    ],
    note: "An extraction cut under the west rim's slumped spoil: a small-craft pass from the rim to the Rift side over a collapsed bulkhead, " +
      "with a diver loop through the pump niche and its pipe gallery, and the rim pipes' crawl in from the slope.",
  },
  caves: [
    { id: PIPES, size: "small", rooms: [`${PIPES}.pipes`], exits: [{ exit: "pipe mouth", portal: `${PIPES}.mouth` }] },
    { id: CUT, size: "medium", rooms: [`${CUT}.east_cut`, `${CUT}.bulkhead`, `${CUT}.west_cut`, `${CUT}.niche_in`, `${CUT}.niche`, `${CUT}.pipe_gallery`],
      exits: [{ exit: "rim mouth", portal: `${CUT}.mouth.rim` }, { exit: "Rift-side mouth", portal: `${CUT}.mouth.rift` }],
      chambers: [{ name: "east cut", room: `${CUT}.east_cut` }, { name: "west cut", room: `${CUT}.west_cut` }, { name: "pump niche", room: `${CUT}.niche` }],
      passages: [
        { id: "rim_mouth", portal: `${CUT}.mouth.rim` }, { id: "rift_mouth", portal: `${CUT}.mouth.rift` },
        { id: "bulkhead", portal: `${CUT}.throat.bulkhead_west`, via: `${CUT}.bulkhead` },
        { id: "niche_in", portal: `${CUT}.throat.niche`, via: `${CUT}.niche_in` },
        { id: "pipe_gallery", portal: `${CUT}.throat.pipe_gallery_east`, via: `${CUT}.pipe_gallery` },
      ],
      loopCloser: "pipe_gallery", hall: { rooms: [`${CUT}.east_cut`, `${CUT}.bulkhead`, `${CUT}.west_cut`], admits: "small" } },
  ],
  links: [
    { id: `${WR}.crawlway`, between: [PIPES, CUT], kind: "crawlway", owner: WR, rooms: [`${WR}.crawl`], rescue: [`${WR}.route.pipes`, `${WR}.route.pipe_b`],
      note: "Seventeen metres from the pipes into the east cut, owned with both caves; lamp off, the cut's rim mouth glows ahead and the pipe mouth behind." },
  ],
  handoffs: [],
  pockets: [
    { id: "basin_rim_pipes_crust", status: "proposed", item: "conductive_crust", cave: PIPES, room: `${PIPES}.pipes`, at: v3(268.6, -270, -825),
      stock: [6, 2, 0], renewable: false, note: "Crust on the broken pipe's walls (bible prose: pipe-wall crust)." },
  ],
  residents: [
    { id: `${CUT}.wakeglow`, species: "wakeglow_drift", cave: CUT, room: `${CUT}.west_cut`, at: v3(217, -278, -818), count: 80, radius: 5,
      note: "The cut's still water below the bulkhead." },
    { id: `${PIPES}.wakeglow`, species: "wakeglow_drift", cave: PIPES, room: `${PIPES}.pipes`, at: v3(270, -269.4, -830), count: 20, radius: 1,
      note: "In the pipes." },
  ],
  finds: [
    { id: `${CUT}.worked_layers`, kind: "scan", cave: CUT, room: `${CUT}.west_cut`, at: v3(210.5, -284, -818), label: "Worked layers",
      note: "Bible: cut walls showing the worked layers." },
  ],
};

// --- Dish-lee vault ----------------------------------------------------------------
const DL = "basin_dish_lee_vault";
const DISH_LEE_VAULT: CaveGroup = {
  style: "silt_vault",
  source: {
    id: DL, label: "Dish-lee vault", region: "silt_basin",
    footprint: { minX: 524, maxX: 574, minZ: -682, maxZ: -629 },
    baseY: -380, topY: -270,
    terraces: [
      terrace(`${DL}.terrace.cliff`, -284, [550, -649], [15, 15], 3.6, 0.12, 0.8, 10),
      terrace(`${DL}.terrace.crown`, -281.5, [552, -647], [9, 9], 2.6, 0.18, 0.6, 8),
    ],
    carves: [
      tube(`${DL}.carve.cliff_mouth`, `${DL}.mouth_hall`, [[545, -645, -302.4, 12.5, 6.5], [536, -645, -302, 12.5, 6.5]], 0.35),
      chamber(`${DL}.carve.mouth_hall`, `${DL}.mouth_hall`, v3(547, -298.5, -645), [8, 6.5, 6, 4], -302.4, 0.5),
      tube(`${DL}.carve.hall_park`, `${DL}.hall_park`, [[546.5, -648.5, -302.4, 11.5, 7.5], [546.2, -652.5, -303.6, 12.5, 7.5], [546, -658, -304.6, 12.5, 7.5]], 0.4),
      chamber(`${DL}.carve.parking`, `${DL}.parking`, v3(546, -300.5, -658), [8.5, 6.5, 6.5, 4.5], -305, 0.5),
      tube(`${DL}.carve.slope_mouth`, `${DL}.parking`, [[546, -660, -305, 12.5, 6.5], [546, -668.5, -304.8, 12.5, 6.5]], 0.35),
      tube(`${DL}.carve.alcove_in`, `${DL}.alcove_in`, [[554.5, -659, -304.8, 3, 3], [558, -659, -304.8, 3, 3]], 0.2),
      chamber(`${DL}.carve.alcove`, `${DL}.alcove`, v3(560.5, -303, -659), [3, 3, 2.5, 2], -305, 0.3),
      tube(`${DL}.carve.alcove_back`, `${DL}.alcove_back`, [[561, -656.2, -304.6, 3, 3], [561, -650, -302.8, 3, 3], [556.5, -645.5, -302.3, 3, 3], [554.2, -645, -302.3, 3, 3]], 0.2),
    ],
    blend: 1.5,
    rooms: [
      room(`${DL}.mouth_hall`, "chamber", "Mouth hall", 8), room(`${DL}.hall_park`, "passage", "Parking ramp", 8), room(`${DL}.parking`, "chamber", "Parking chamber", 8),
      room(`${DL}.alcove_in`, "passage", "Alcove crawl", 4), room(`${DL}.alcove`, "pocket", "Diver alcove", 4), room(`${DL}.alcove_back`, "passage", "Back crawl", 4),
    ],
    portals: [
      mouth(`${DL}.mouth.cliff`, "Cliff mouth", `${DL}.mouth_hall`, v3(535.5, -299.3, -645), "-x", [10.5, 5], ["diver", "small", "medium"]),
      throat(`${DL}.throat.hall_ramp`, "Parking ramp, top", `${DL}.mouth_hall`, `${DL}.hall_park`, v3(546.4, -299.4, -649.5), "-z", [10, 4.5], ["diver", "small", "medium"]),
      throat(`${DL}.throat.ramp_park`, "Parking ramp, foot", `${DL}.hall_park`, `${DL}.parking`, v3(546.1, -300.8, -655), "-z", [10, 4.5], ["diver", "small", "medium"]),
      mouth(`${DL}.mouth.slope`, "Slope mouth", `${DL}.parking`, v3(546, -302.2, -665.5), "-z", [10.5, 5], ["diver", "small", "medium"]),
      throat(`${DL}.throat.alcove_in`, "Alcove crawl", `${DL}.parking`, `${DL}.alcove_in`, v3(555.4, -303.6, -659), "+x", [2.2, 2.2]),
      throat(`${DL}.throat.alcove`, "Alcove", `${DL}.alcove_in`, `${DL}.alcove`, v3(557.6, -303.6, -659), "+x", [2.2, 2.2]),
      throat(`${DL}.throat.alcove_back`, "Back crawl", `${DL}.alcove`, `${DL}.alcove_back`, v3(561, -303.2, -656.8), "+z", [2.2, 2.2]),
      throat(`${DL}.throat.hall_east`, "Hall, east crawl", `${DL}.alcove_back`, `${DL}.mouth_hall`, v3(555.4, -300.8, -645.4), "-x", [2.2, 2.2]),
    ],
    routes: [
      route(`${DL}.route.creel`, "medium", "loop", [[528, -301.2, -645], [536, -301.2, -645], [544, -301.2, -645], [546.5, -301.2, -648], [546.3, -301.8, -652],
        [546, -302.8, -656], [546, -303.6, -660], [546, -303.6, -665], [546, -303.4, -672]]),
      route(`${DL}.route.alcove`, "diver", "loop", [[530, -301.6, -645], [540, -301.6, -645], [550, -301.6, -645], [555.4, -301.4, -645.4], [557, -301.4, -645.6],
        [561, -302, -650], [561, -303.8, -656.2], [560.5, -304.4, -658.5], [557.6, -304.2, -659], [554.5, -304.2, -659], [546, -304.4, -660],
        [546, -304, -665], [546, -303.8, -672]]),
      route(`${DL}.route.alcove_exit`, "diver", "exit", [[560.5, -304.4, -659], [557.6, -304.2, -659], [554.5, -304.2, -659], [546, -304.4, -660],
        [546, -304, -665], [546, -303.8, -672]]),
    ],
    staging: [
      { id: `${DL}.parking_bay`, role: "craft_parking", label: "Parking chamber", position: v3(546, -303.6, -659), radius: 6, profiles: ["small", "medium"] },
    ],
    note: "An eroded cliff under the south dish's lee: a Creel enters the mouth hall, drops into a parking chamber it can turn in, and leaves " +
      "down the pale-floor slope. A diver alcove crawls back up into the hall.",
  },
  caves: [{ id: DL, size: "medium", rooms: [`${DL}.mouth_hall`, `${DL}.hall_park`, `${DL}.parking`, `${DL}.alcove_in`, `${DL}.alcove`, `${DL}.alcove_back`],
    exits: [{ exit: "cliff mouth", portal: `${DL}.mouth.cliff` }, { exit: "slope mouth", portal: `${DL}.mouth.slope` }],
    chambers: [{ name: "mouth hall", room: `${DL}.mouth_hall` }, { name: "parking chamber", room: `${DL}.parking` }, { name: "diver alcove", room: `${DL}.alcove` }],
    passages: [
      { id: "cliff_mouth", portal: `${DL}.mouth.cliff` }, { id: "slope_mouth", portal: `${DL}.mouth.slope` },
      { id: "hall_park", portal: `${DL}.throat.ramp_park`, via: `${DL}.hall_park` },
      { id: "alcove_in", portal: `${DL}.throat.alcove`, via: `${DL}.alcove_in` },
      { id: "alcove_back", portal: `${DL}.throat.hall_east`, via: `${DL}.alcove_back` },
    ],
    loopCloser: "alcove_back", hall: { rooms: [`${DL}.mouth_hall`, `${DL}.hall_park`, `${DL}.parking`], admits: "medium" } }],
  links: [], handoffs: [],
  pockets: [],
  residents: [
    { id: `${DL}.wakeglow`, species: "wakeglow_drift", cave: DL, room: `${DL}.parking`, at: v3(546, -301, -658), count: 80, radius: 5,
      note: "A Creel's wake glows brighter and wider than a diver's." },
  ],
  finds: [
    { id: `${DL}.salvage_bench`, kind: "cache", cave: DL, room: `${DL}.parking`, at: v3(541, -304, -658), label: "Salvage bench",
      contents: { structural_alloy: 4 }, note: "Bible: silt shelter and salvage workspace. A few cut plates left on a bench; alloy is common." },
    { id: `${DL}.dish_rim_view`, kind: "view", cave: DL, room: `${DL}.mouth_hall`, at: v3(538, -300.5, -645), label: "Dish rim from the mouth",
      note: "Bible: the dish rim seen from inside the mouth." },
  ],
};

export const BASIN_CAVES: readonly CaveGroup[] = [CULVERT_NORTH, BURROW_WARREN, BURIED_HUT, FRACTURE_POCKET, WEST_RIM, DISH_LEE_VAULT];
