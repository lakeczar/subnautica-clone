import type { LargeCaveSource } from "./largeCave.js";
import { EXTERIOR } from "./largeCave.js";

/** The Canopy root caves: the first cave biome, the large-cave proof.
 *
 * Proposed under the Lantern Canopy's east crowns, where the shelf falls
 * from about 85 m in the north to 165 m on the lower terrace. Long-dead
 * crown roots left hollows in the shelf; the cave follows the slope down.
 * Story-neutral and optional: every find here is a cave-only extra.
 *
 * Zones, north to south:
 * - **Root hall** (entry): a long low hall under the shelf, reached down the
 *   Crown hollow, a craft-wide sinkhole. Root columns line both sides and
 *   leave a 12 m craft lane; amber root tips glow overhead.
 * - **Collapsed gallery**: the hall's west arm, half-choked by fallen roof.
 *   A work sub weaves through; a diver can take the squeeze beside it.
 * - **Glow garden**: a broad chamber of teal and violet fronds, the
 *   brightest place inside, with a diver-only grotto.
 * - **Hub**: the central chamber round one great root, ringed with glowing
 *   tips: the landmark you steer by. Exits to every zone, the Scarp mouth on
 *   the lower terrace and a diver crawlway up to the knoll.
 * - **Deep pool**: a steep drop east of the hub to a cold, rose-lit pool at
 *   about 190 m, below the Canopy's rating: a soft depth gate.
 *
 * The main circuit (Crown hollow, hall, east run, hub, low run, garden,
 * gallery, hall) is 13-16 m wide and 10-12 m high: a Creel or Mantle fits,
 * except the gallery, which only the Creel threads. Side passages are 3 m. */

export const CANOPY_ROOT_CAVES: LargeCaveSource = {
  id: "canopy_roots",
  label: "Canopy root caves",
  region: "suspended_garden",
  domain: { min: { x: 624, y: -224, z: -224 }, max: { x: 880, y: -64, z: -32 } },
  chunk: 32,
  voxel: 0.5,
  collars: [
    // Crown hollow (north, craft), Scarp mouth (south, craft), knoll crawl (diver).
    { minX: 728, maxX: 778, minZ: -100, maxZ: -52 },
    { minX: 774, maxX: 826, minZ: -204, maxZ: -160 },
    { minX: 834, maxX: 864, minZ: -94, maxZ: -60 },
  ],
  roofMin: 4,
  blend: 3,
  zones: [
    { id: "canopy_roots.hall", label: "Root hall", role: "entry", falloff: 9,
      palette: { floor: "#7d8a78", wall: "#66706a", ceiling: "#4f5b5a", accent: "#e0a35a" },
      fog: { color: "#123a44", density: 0.03 }, note: "Entry. Faint blue from the hollow; amber root tips." },
    { id: "canopy_roots.gallery", label: "Collapsed gallery", role: "gallery", falloff: 5,
      palette: { floor: "#6c6a62", wall: "#5b5953", ceiling: "#45443f", accent: "#9fb7c4" },
      fog: { color: "#0d2128", density: 0.04 }, note: "Darkest. Fallen roof, silt, pale colonies on the blocks." },
    { id: "canopy_roots.garden", label: "Glow garden", role: "garden", falloff: 7,
      palette: { floor: "#5f7f78", wall: "#4f6d6c", ceiling: "#3d5658", accent: "#62e6d2" },
      fog: { color: "#0f3b40", density: 0.028 }, note: "Brightest inside: teal and violet fronds light the rock." },
    { id: "canopy_roots.hub", label: "Hub", role: "hub", falloff: 7,
      palette: { floor: "#7c8070", wall: "#626a64", ceiling: "#4c5554", accent: "#c9e06a" },
      fog: { color: "#11343a", density: 0.03 }, note: "Landmark: one great root ringed with glowing tips." },
    { id: "canopy_roots.pool", label: "Deep pool", role: "pool", falloff: 5,
      palette: { floor: "#5d5f6e", wall: "#4b4f5e", ceiling: "#383c4a", accent: "#f08aa0" },
      fog: { color: "#0c1a2c", density: 0.036 }, note: "Cold, below the Canopy's rating; rose silt glow." },
    { id: "canopy_roots.passage", label: "Side passages", role: "passage", falloff: 5,
      palette: { floor: "#6f776c", wall: "#5d645e", ceiling: "#4a514f", accent: "#b9a0e8" },
      fog: { color: "#0f2a31", density: 0.035 }, note: "Diver-only crawls and pockets." },
  ],
  carves: [
    // Crown hollow: a sinkhole from the shelf into the hall's east end.
    { kind: "shaft", id: "canopy_roots.crown_hollow", zone: "canopy_roots.hall", wobble: 0.7,
      bottom: { x: 754, y: -124, z: -94 }, top: { x: 756, y: -80, z: -72 }, radius: 7.5, flare: 5 },
    { kind: "chamber", id: "canopy_roots.hall", zone: "canopy_roots.hall", wobble: 0.8,
      center: { x: 742, y: -126, z: -100 }, radii: { x: 30, z: 12.5, up: 7.5, down: 5.5 }, yaw: 0.06, floor: -131 },
    // Hall to hub.
    { kind: "tunnel", id: "canopy_roots.east_run", zone: "canopy_roots.hub", wobble: 0.6, nodes: [
      { x: 766, y: -130.5, z: -104, width: 14, height: 10.5 },
      { x: 790, y: -133, z: -112, width: 14, height: 10.5 },
      { x: 806, y: -138.5, z: -124, width: 14, height: 10.5 },
      { x: 816, y: -144, z: -134, width: 15, height: 10.5 },
    ] },
    { kind: "chamber", id: "canopy_roots.hub", zone: "canopy_roots.hub", wobble: 0.8,
      center: { x: 820, y: -145, z: -146 }, radii: { x: 21, z: 18, up: 9, down: 7 }, yaw: -0.2, floor: -151 },
    // Hub to the Scarp mouth on the lower terrace.
    { kind: "tunnel", id: "canopy_roots.scarp_run", zone: "canopy_roots.hub", wobble: 0.6, nodes: [
      { x: 812, y: -150, z: -158, width: 14, height: 11 },
      { x: 804, y: -151.5, z: -170, width: 14, height: 11 },
      { x: 797, y: -153, z: -180, width: 15, height: 11 },
      { x: 793, y: -154, z: -192, width: 16, height: 12 },
    ] },
    // Hub to the garden.
    { kind: "tunnel", id: "canopy_roots.low_run", zone: "canopy_roots.garden", wobble: 0.6, nodes: [
      { x: 800, y: -150, z: -150, width: 13.5, height: 10 },
      { x: 768, y: -152, z: -153, width: 13.5, height: 10 },
      { x: 736, y: -153, z: -152, width: 13.5, height: 10 },
      { x: 700, y: -153, z: -146, width: 14, height: 10 },
    ] },
    { kind: "chamber", id: "canopy_roots.garden", zone: "canopy_roots.garden", wobble: 0.9,
      center: { x: 676, y: -150, z: -140 }, radii: { x: 22, z: 17, up: 8, down: 6 }, yaw: 0.25, floor: -155 },
    // Hall's west arm to the garden: the collapsed gallery.
    { kind: "tunnel", id: "canopy_roots.gallery", zone: "canopy_roots.gallery", wobble: 0.9, nodes: [
      { x: 716, y: -130, z: -101, width: 13, height: 10 },
      { x: 694, y: -133, z: -108, width: 13, height: 10 },
      { x: 678, y: -138, z: -117, width: 13, height: 10 },
      { x: 671, y: -146, z: -127, width: 13.5, height: 10 },
    ] },
    // Deep pool: a steep drop east of the hub.
    { kind: "tunnel", id: "canopy_roots.pool_drop", zone: "canopy_roots.pool", wobble: 0.6, nodes: [
      { x: 836, y: -150, z: -150, width: 13, height: 11 },
      { x: 846, y: -159, z: -154, width: 13, height: 11 },
      { x: 853, y: -171, z: -158, width: 13, height: 11 },
      { x: 858, y: -180, z: -160, width: 14, height: 11 },
    ] },
    { kind: "chamber", id: "canopy_roots.pool", zone: "canopy_roots.pool", wobble: 0.7,
      center: { x: 862, y: -182, z: -162 }, radii: { x: 13, z: 12, up: 7, down: 5 }, yaw: 0.4, floor: -187 },
    // Diver-only side passages.
    { kind: "tunnel", id: "canopy_roots.squeeze", zone: "canopy_roots.passage", wobble: 0.35, nodes: [
      { x: 724, y: -130, z: -110, width: 3.4, height: 3 },
      { x: 708, y: -132, z: -118, width: 3, height: 2.8 },
      { x: 694, y: -137, z: -128, width: 3.2, height: 2.8 },
      { x: 684, y: -144, z: -132, width: 3.4, height: 3 },
    ] },
    { kind: "tunnel", id: "canopy_roots.tangle_throat", zone: "canopy_roots.passage", wobble: 0.35, nodes: [
      { x: 732, y: -128, z: -90, width: 3.2, height: 3 },
      { x: 728, y: -127.5, z: -82, width: 3, height: 2.8 },
    ] },
    { kind: "chamber", id: "canopy_roots.tangle", zone: "canopy_roots.passage", wobble: 0.45,
      center: { x: 726, y: -125.5, z: -77 }, radii: { x: 4.5, z: 4, up: 3, down: 2.5 }, yaw: 0, floor: -127.5 },
    { kind: "tunnel", id: "canopy_roots.grotto_throat", zone: "canopy_roots.passage", wobble: 0.35, nodes: [
      { x: 684, y: -154.5, z: -153, width: 3.2, height: 3 },
      { x: 690, y: -156, z: -159, width: 3, height: 2.8 },
    ] },
    { kind: "chamber", id: "canopy_roots.grotto", zone: "canopy_roots.passage", wobble: 0.45,
      center: { x: 694, y: -156, z: -164 }, radii: { x: 4.5, z: 4.2, up: 2.8, down: 2.5 }, yaw: 0, floor: -158 },
    { kind: "tunnel", id: "canopy_roots.knoll_crawl", zone: "canopy_roots.passage", wobble: 0.35, nodes: [
      { x: 834, y: -143, z: -130, width: 3.4, height: 3 },
      { x: 841, y: -134, z: -118, width: 3, height: 2.8 },
      { x: 845, y: -124, z: -106, width: 3, height: 2.8 },
      { x: 843, y: -113, z: -94, width: 3, height: 2.8 },
      { x: 847, y: -101, z: -80, width: 3.2, height: 3 },
      { x: 849, y: -93, z: -70, width: 3.6, height: 3.2 },
    ] },
  ],
  rocks: [
    // Root hall: columns along both sides of a 12 m lane (z -106..-94).
    { kind: "pillar", id: "canopy_roots.root.h1", a: { x: 722, y: -118, z: -90 }, b: { x: 726, y: -132, z: -92 }, radiusA: 1.3, radiusB: 2, wobble: 0.3 },
    { kind: "pillar", id: "canopy_roots.root.h2", a: { x: 740, y: -118.5, z: -89.5 }, b: { x: 737, y: -132, z: -91 }, radiusA: 1.2, radiusB: 1.8, wobble: 0.3 },
    { kind: "pillar", id: "canopy_roots.root.h3", a: { x: 716, y: -119, z: -109 }, b: { x: 720, y: -132, z: -108.5 }, radiusA: 1.4, radiusB: 2.1, wobble: 0.3 },
    { kind: "pillar", id: "canopy_roots.root.h4", a: { x: 742, y: -119, z: -110 }, b: { x: 746, y: -132, z: -108.5 }, radiusA: 1.2, radiusB: 1.9, wobble: 0.3 },
    { kind: "pillar", id: "canopy_roots.root.h5", a: { x: 764, y: -120, z: -109 }, b: { x: 760, y: -132, z: -108 }, radiusA: 1.1, radiusB: 1.7, wobble: 0.3 },
    // The hub's great root.
    { kind: "pillar", id: "canopy_roots.root.hub", a: { x: 823, y: -134, z: -143 }, b: { x: 818, y: -152, z: -148 }, radiusA: 2.2, radiusB: 3.4, wobble: 0.4 },
    // Fallen roof in the gallery, from alternate walls (a 10 m lane).
    { kind: "block", id: "canopy_roots.fall.1", center: { x: 708, y: -129.5, z: -98.5 }, half: { x: 4, y: 2.5, z: 3 }, yaw: 0.3, round: 0.8 },
    { kind: "block", id: "canopy_roots.fall.2", center: { x: 692, y: -131, z: -114 }, half: { x: 4.5, y: 3, z: 2.5 }, yaw: -0.5, round: 0.9 },
    { kind: "block", id: "canopy_roots.fall.3", center: { x: 682, y: -135.5, z: -112 }, half: { x: 3, y: 2.5, z: 3 }, yaw: 0.8, round: 0.8 },
  ],
  portals: [
    { id: "canopy_roots.mouth.crown", kind: "mouth", label: "Crown hollow", between: ["canopy_roots.hall", EXTERIOR],
      center: { x: 756, y: -84, z: -74 }, normal: { x: 0, y: 1, z: 0 }, clear: { width: 14, height: 14 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.mouth.scarp", kind: "mouth", label: "Scarp mouth", between: ["canopy_roots.hub", EXTERIOR],
      center: { x: 795, y: -148, z: -186 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 13, height: 10 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.mouth.knoll", kind: "back_entrance", label: "Knoll crawl", between: ["canopy_roots.passage", EXTERIOR],
      center: { x: 849, y: -91.5, z: -70 }, normal: { x: 0, y: 1, z: 0 }, clear: { width: 2.6, height: 2.6 }, admits: ["diver"] },
    { id: "canopy_roots.throat.east", kind: "throat", label: "East run", between: ["canopy_roots.hall", "canopy_roots.hub"],
      center: { x: 790, y: -127.5, z: -112 }, normal: { x: 0.8, y: 0, z: -0.6 }, clear: { width: 12, height: 9 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.throat.low", kind: "throat", label: "Low run", between: ["canopy_roots.hub", "canopy_roots.garden"],
      center: { x: 750, y: -147.5, z: -152.5 }, normal: { x: -1, y: 0, z: 0 }, clear: { width: 12, height: 8.5 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.throat.gallery", kind: "throat", label: "Gallery", between: ["canopy_roots.hall", "canopy_roots.gallery"],
      center: { x: 700, y: -127, z: -106 }, normal: { x: -0.9, y: 0, z: -0.4 }, clear: { width: 10, height: 8 }, admits: ["diver", "small"] },
    { id: "canopy_roots.throat.garden", kind: "throat", label: "Gallery foot", between: ["canopy_roots.gallery", "canopy_roots.garden"],
      center: { x: 672, y: -140, z: -126 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 11, height: 8 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.throat.pool", kind: "throat", label: "Pool drop", between: ["canopy_roots.hub", "canopy_roots.pool"],
      center: { x: 846, y: -153.5, z: -154 }, normal: { x: 0.9, y: -0.3, z: -0.3 }, clear: { width: 11, height: 9 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.throat.squeeze", kind: "throat", label: "Squeeze", between: ["canopy_roots.hall", "canopy_roots.passage"],
      center: { x: 708, y: -130.6, z: -118 }, normal: { x: -0.8, y: 0, z: -0.5 }, clear: { width: 2.2, height: 2 }, admits: ["diver"] },
  ],
  life: [
    { id: "canopy_roots.life.hall_tips", zone: "canopy_roots.hall", kind: "root_tip", at: { x: 742, y: -120, z: -100 }, radius: 26, count: 90, color: "#ffb45e", light: 0.35, reach: 7 },
    { id: "canopy_roots.life.hollow_tips", zone: "canopy_roots.hall", kind: "root_tip", at: { x: 754, y: -118, z: -92 }, radius: 9, count: 30, color: "#ffc978", light: 0.3, reach: 6 },
    { id: "canopy_roots.life.gallery_pale", zone: "canopy_roots.gallery", kind: "colony", at: { x: 693, y: -132, z: -110 }, radius: 14, count: 34, color: "#a9d4ff", light: 0.18, reach: 5 },
    { id: "canopy_roots.life.garden_teal", zone: "canopy_roots.garden", kind: "frond", at: { x: 676, y: -153, z: -140 }, radius: 21, count: 260, color: "#62e6d2", light: 0.8, reach: 11 },
    { id: "canopy_roots.life.garden_violet", zone: "canopy_roots.garden", kind: "frond", at: { x: 666, y: -152, z: -146 }, radius: 13, count: 110, color: "#c6a1f2", light: 0.55, reach: 9 },
    { id: "canopy_roots.life.grotto", zone: "canopy_roots.passage", kind: "colony", at: { x: 694, y: -157, z: -164 }, radius: 4.5, count: 24, color: "#c6a1f2", light: 0.4, reach: 5 },
    { id: "canopy_roots.life.hub_ring", zone: "canopy_roots.hub", kind: "root_tip", at: { x: 820, y: -145, z: -146 }, radius: 9, count: 80, color: "#c9e06a", light: 0.7, reach: 13 },
    { id: "canopy_roots.life.pool_silt", zone: "canopy_roots.pool", kind: "silt_glow", at: { x: 862, y: -186, z: -162 }, radius: 12, count: 120, color: "#f08aa0", light: 0.45, reach: 8 },
    { id: "canopy_roots.life.tangle", zone: "canopy_roots.passage", kind: "colony", at: { x: 726, y: -126, z: -77 }, radius: 4.5, count: 18, color: "#ffb45e", light: 0.35, reach: 5 },
  ],
  sockets: [
    { id: "canopy_roots.find.root_resin", zone: "canopy_roots.hall", kind: "cave_resin", at: { x: 724, y: -130, z: -94 }, note: "Resin weeping from a root column; grows better in the dark." },
    { id: "canopy_roots.find.tangle_cache", zone: "canopy_roots.passage", kind: "cache", at: { x: 725, y: -127, z: -76 }, note: "A small cache in the root tangle pocket." },
    { id: "canopy_roots.find.lumen_spores", zone: "canopy_roots.garden", kind: "seed", at: { x: 670, y: -154.5, z: -138 }, note: "Glow-frond spores for a planter." },
    { id: "canopy_roots.find.grotto_fragment", zone: "canopy_roots.passage", kind: "fragment", at: { x: 695, y: -157.5, z: -165 }, note: "A decodable fragment, diver-only." },
    { id: "canopy_roots.find.fall_salvage", zone: "canopy_roots.gallery", kind: "cache", at: { x: 686, y: -136.5, z: -118 }, note: "Wedged under fallen roof; the Creel's arm frees it." },
    { id: "canopy_roots.find.pool_crystal", zone: "canopy_roots.pool", kind: "cave_crystal", at: { x: 864, y: -186.5, z: -164 }, note: "Cold-grown crystal; needs the depth refit." },
  ],
  routes: [
    { id: "canopy_roots.route.craft_loop", profile: "medium", role: "loop", path: [
      { x: 758, y: -72, z: -66 }, { x: 756, y: -86, z: -74 }, { x: 755, y: -104, z: -84 }, { x: 752, y: -126, z: -96 },
      { x: 770, y: -127.5, z: -104 }, { x: 790, y: -130, z: -112 }, { x: 806, y: -135.5, z: -124 }, { x: 816, y: -141, z: -134 },
      { x: 812, y: -147.5, z: -150 }, { x: 806, y: -148.5, z: -168 }, { x: 797, y: -150, z: -180 }, { x: 793, y: -151, z: -192 },
      { x: 791, y: -151, z: -206 },
    ] },
    { id: "canopy_roots.route.west_loop", profile: "small", role: "loop", path: [
      { x: 812, y: -147.5, z: -150 }, { x: 800, y: -148, z: -150 }, { x: 768, y: -150, z: -153 }, { x: 736, y: -151, z: -152 },
      { x: 700, y: -151, z: -146 }, { x: 680, y: -152, z: -140 }, { x: 671, y: -146, z: -128 }, { x: 678, y: -136, z: -117 },
      { x: 694, y: -131, z: -107 }, { x: 716, y: -128, z: -101 }, { x: 742, y: -128, z: -100 },
    ] },
    { id: "canopy_roots.route.pool_spur", profile: "small", role: "spur", path: [
      { x: 826, y: -148.5, z: -148 }, { x: 836, y: -148, z: -150 }, { x: 846, y: -157, z: -154 }, { x: 853, y: -169, z: -158 },
      { x: 860, y: -184, z: -161 },
    ] },
    { id: "canopy_roots.route.squeeze", profile: "diver", role: "loop", path: [
      { x: 742, y: -129, z: -103 }, { x: 724, y: -129.5, z: -110 }, { x: 708, y: -131.6, z: -118 }, { x: 694, y: -136.6, z: -128 },
      { x: 684, y: -143.5, z: -132 }, { x: 676, y: -150, z: -138 },
    ] },
    { id: "canopy_roots.route.knoll", profile: "diver", role: "exit", path: [
      { x: 826, y: -149, z: -140 }, { x: 834, y: -142.5, z: -130 }, { x: 841, y: -133.5, z: -118 }, { x: 845, y: -123.5, z: -106 },
      { x: 843, y: -112.5, z: -94 }, { x: 847, y: -100.5, z: -80 }, { x: 849, y: -92.5, z: -70 }, { x: 850, y: -85, z: -62 },
    ] },
    { id: "canopy_roots.route.grotto", profile: "diver", role: "spur", path: [
      { x: 680, y: -153.5, z: -148 }, { x: 684, y: -154, z: -153 }, { x: 690, y: -155.5, z: -159 }, { x: 694, y: -157, z: -164 },
    ] },
    { id: "canopy_roots.route.tangle", profile: "diver", role: "spur", path: [
      { x: 734, y: -129, z: -96 }, { x: 732, y: -127.5, z: -90 }, { x: 728, y: -127, z: -82 }, { x: 726, y: -126.5, z: -77 },
    ] },
  ],
  staging: [
    { id: "canopy_roots.stage.crown", label: "Above the Crown hollow", position: { x: 760, y: -66, z: -60 }, radius: 20, profiles: ["small", "medium", "carrier"] },
    { id: "canopy_roots.stage.terrace", label: "Lower terrace by the Scarp mouth", position: { x: 792, y: -150, z: -214 }, radius: 14, profiles: ["small", "medium"] },
    { id: "canopy_roots.stage.hub", label: "Hub floor (outpost spot)", position: { x: 806, y: -150.5, z: -146 }, radius: 7, profiles: ["small"] },
  ],
  proposal: {
    location: "Lantern Canopy east crowns, X 624..880, Z -224..-32 (S2 world frame); clear of route.isles.canopy_east and the east mooring",
    depth: "Crown hollow lip about 85 m; hall 120-131 m; hub and garden 140-155 m; Scarp mouth on the 150 m terrace; deep pool about 187 m",
  },
  note: "LC proof biome. Blockout geometry; finds and life are proposals, not registry content.",
};
