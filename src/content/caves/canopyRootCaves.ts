import type { BlockRock, LargeCaveSource, TunnelNode } from "./largeCave.js";
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
 *   A Dart or Creel weaves through; a diver can take the squeeze beside it.
 * - **Glow garden**: a broad chamber of teal and violet fronds, the
 *   brightest place inside, with a diver-only grotto.
 * - **Hub**: the central chamber round one great root, ringed with glowing
 *   colonies: the landmark you steer by. Exits to every zone, the Scarp
 *   mouth on the lower terrace and a diver crawl up to the knoll.
 * - **Deep pool**: a steep drop east of the hub to a cold, rose-lit pool at
 *   about 190 m, below the Canopy's rating: a soft depth gate.
 *
 * The main circuit (Crown hollow, hall, east run, hub, low run, garden) is
 * 14-16 m wide and 10-12 m high: a Creel or Mantle fits. The gallery's fallen
 * roof leaves a 9.5 m lane (small craft only). Side passages are 3 m. Craft
 * routes ride the tunnels' own centrelines, so they move with the tunnels. */

/** Keel datum a craft rides at: `lift` metres over a tunnel node's floor. */
const ride = (n: TunnelNode, lift: number): { x: number; y: number; z: number } => ({ x: n.x, y: n.y + lift, z: n.z });
/** A portal centred in a tunnel's section at node `n`. */
const section = (n: TunnelNode): { x: number; y: number; z: number } => ({ x: n.x, y: n.y + n.height * 0.42, z: n.z });

const EAST_RUN: readonly TunnelNode[] = [
  { x: 768, y: -130.5, z: -104, width: 15, height: 11 },
  { x: 790, y: -133, z: -112, width: 15, height: 11 },
  { x: 806, y: -139, z: -124, width: 15, height: 11 },
  { x: 816, y: -144.5, z: -134, width: 16, height: 11 },
];
const SCARP_RUN: readonly TunnelNode[] = [
  { x: 812, y: -150, z: -158, width: 15, height: 11.5 },
  { x: 804, y: -151.5, z: -170, width: 15, height: 11.5 },
  { x: 797, y: -153, z: -180, width: 16, height: 11.5 },
  { x: 793, y: -154, z: -192, width: 16, height: 12 },
];
const LOW_RUN: readonly TunnelNode[] = [
  { x: 800, y: -150.5, z: -150, width: 15, height: 10.5 },
  { x: 768, y: -152.5, z: -153, width: 15, height: 10.5 },
  { x: 736, y: -153.5, z: -152, width: 15, height: 10.5 },
  { x: 700, y: -153.5, z: -146, width: 15, height: 10.5 },
];
const GALLERY: readonly TunnelNode[] = [
  { x: 718, y: -130, z: -101, width: 15, height: 10 },
  { x: 696, y: -133, z: -108, width: 15, height: 10 },
  { x: 680, y: -138, z: -117, width: 15, height: 10 },
  { x: 671, y: -146, z: -128, width: 15, height: 10 },
];
const POOL_DROP: readonly TunnelNode[] = [
  { x: 836, y: -150, z: -150, width: 14, height: 11 },
  { x: 846, y: -159, z: -154, width: 14, height: 11 },
  { x: 853, y: -171, z: -158, width: 14, height: 11 },
  { x: 858, y: -180, z: -160, width: 14, height: 11 },
];
const SQUEEZE: readonly TunnelNode[] = [
  { x: 724, y: -130, z: -110, width: 3.4, height: 3 },
  { x: 708, y: -132, z: -118, width: 3.2, height: 3 },
  { x: 694, y: -137, z: -128, width: 3.2, height: 3 },
  { x: 684, y: -144, z: -132, width: 3.4, height: 3 },
];
const CRAWL: readonly TunnelNode[] = [
  { x: 834, y: -143, z: -130, width: 3.4, height: 3 },
  { x: 841, y: -134, z: -118, width: 3.2, height: 3 },
  { x: 845, y: -124, z: -106, width: 3.2, height: 3 },
  { x: 844, y: -113, z: -94, width: 3.2, height: 3 },
  { x: 847, y: -102, z: -82, width: 3.4, height: 3.2 },
  { x: 849, y: -96, z: -74, width: 3.6, height: 3.4 },
];
const TANGLE: readonly TunnelNode[] = [
  { x: 732, y: -128.5, z: -92, width: 3.4, height: 3 },
  { x: 728, y: -127.5, z: -82, width: 3.4, height: 3 },
];
const GROTTO: readonly TunnelNode[] = [
  { x: 684, y: -154.5, z: -153, width: 3.4, height: 3 },
  { x: 690, y: -156, z: -159, width: 3.4, height: 3 },
];

/** Fallen roof in the gallery: one block per segment, on alternating sides
 * of the centreline, reaching 3 m into the 15 m tunnel. The 12 m lane
 * left takes a Dart's fixed-axis 7.2 m proxy even where the gallery runs
 * diagonally (it needs up to 7.2 x (|cos| + |sin|) = 10.2 m). */
const FALLS: BlockRock[] = GALLERY.slice(0, 3).map((a, i) => {
  const b = GALLERY[i + 1]!, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), side = i % 2 ? -1 : 1;
  const lx = -dz / l * side, lz = dx / l * side, floor = (a.y + b.y) / 2;
  return { kind: "block", id: `canopy_roots.fall.${i + 1}`, center: { x: (a.x + b.x) / 2 + lx * 6.9, y: floor + 2.2, z: (a.z + b.z) / 2 + lz * 6.9 },
    half: { x: 3.6, y: 2.6, z: 2.4 }, yaw: Math.atan2(-dz / l, dx / l), round: 0.8 };
});
/** The lane past each block: its segment's midpoint, 1.4 m to the open
 * side, where the Dart's square proxy clears block and wall on a diagonal. */
const WEAVE = GALLERY.slice(0, 3).map((a, i) => {
  const b = GALLERY[i + 1]!, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), side = i % 2 ? -1 : 1;
  return { x: (a.x + b.x) / 2 + dz / l * side * 1.4, y: (a.y + b.y) / 2 + 2.2, z: (a.z + b.z) / 2 - dx / l * side * 1.4 };
});

export const CANOPY_ROOT_CAVES: LargeCaveSource = {
  id: "canopy_roots",
  label: "Canopy root caves",
  region: "suspended_garden",
  domain: { min: { x: 624, y: -224, z: -224 }, max: { x: 880, y: -64, z: -32 } },
  chunk: 32,
  voxel: 0.5,
  collars: [
    // Crown hollow (north, craft), Scarp mouth (south, craft), knoll crawl (diver).
    { minX: 728, maxX: 782, minZ: -104, maxZ: -48 },
    { minX: 774, maxX: 826, minZ: -204, maxZ: -160 },
    { minX: 834, maxX: 864, minZ: -94, maxZ: -56 },
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
      bottom: { x: 754, y: -124, z: -96 }, top: { x: 757, y: -80, z: -72 }, radius: 9.5, flare: 5 },
    { kind: "chamber", id: "canopy_roots.hall", zone: "canopy_roots.hall", wobble: 0.8,
      center: { x: 742, y: -126, z: -100 }, radii: { x: 31, z: 12.5, up: 7.5, down: 5.5 }, yaw: 0.06, floor: -131 },
    { kind: "tunnel", id: "canopy_roots.east_run", zone: "canopy_roots.hub", wobble: 0.6, nodes: EAST_RUN },
    { kind: "chamber", id: "canopy_roots.hub", zone: "canopy_roots.hub", wobble: 0.8,
      center: { x: 820, y: -145, z: -146 }, radii: { x: 21, z: 18, up: 9, down: 7 }, yaw: -0.2, floor: -151 },
    { kind: "tunnel", id: "canopy_roots.scarp_run", zone: "canopy_roots.hub", wobble: 0.6, nodes: SCARP_RUN },
    { kind: "tunnel", id: "canopy_roots.low_run", zone: "canopy_roots.garden", wobble: 0.6, nodes: LOW_RUN },
    { kind: "chamber", id: "canopy_roots.garden", zone: "canopy_roots.garden", wobble: 0.9,
      center: { x: 676, y: -150, z: -140 }, radii: { x: 22, z: 17, up: 8, down: 6 }, yaw: 0.25, floor: -155 },
    { kind: "tunnel", id: "canopy_roots.gallery", zone: "canopy_roots.gallery", wobble: 0.7, nodes: GALLERY },
    { kind: "tunnel", id: "canopy_roots.pool_drop", zone: "canopy_roots.pool", wobble: 0.6, nodes: POOL_DROP },
    { kind: "chamber", id: "canopy_roots.pool", zone: "canopy_roots.pool", wobble: 0.7,
      center: { x: 862, y: -182, z: -162 }, radii: { x: 13, z: 12, up: 7, down: 5 }, yaw: 0.4, floor: -187 },
    // Diver-only side passages.
    { kind: "tunnel", id: "canopy_roots.squeeze", zone: "canopy_roots.passage", wobble: 0.3, nodes: SQUEEZE },
    { kind: "tunnel", id: "canopy_roots.tangle_throat", zone: "canopy_roots.passage", wobble: 0.3, nodes: TANGLE },
    { kind: "chamber", id: "canopy_roots.tangle", zone: "canopy_roots.passage", wobble: 0.45,
      center: { x: 726, y: -125.5, z: -77 }, radii: { x: 4.5, z: 4, up: 3, down: 2.5 }, yaw: 0, floor: -127.5 },
    { kind: "tunnel", id: "canopy_roots.grotto_throat", zone: "canopy_roots.passage", wobble: 0.3, nodes: GROTTO },
    { kind: "chamber", id: "canopy_roots.grotto", zone: "canopy_roots.passage", wobble: 0.45,
      center: { x: 694, y: -156, z: -164 }, radii: { x: 4.5, z: 4.2, up: 2.8, down: 2.5 }, yaw: 0, floor: -158 },
    { kind: "tunnel", id: "canopy_roots.knoll_crawl", zone: "canopy_roots.passage", wobble: 0.3, nodes: CRAWL },
    // The crawl breaks the knoll's seabed through a short chimney.
    { kind: "shaft", id: "canopy_roots.knoll_chimney", zone: "canopy_roots.passage", wobble: 0.25,
      bottom: { x: 849, y: -95, z: -74 }, top: { x: 850, y: -84, z: -70 }, radius: 1.9, flare: 0.8 },
  ],
  rocks: [
    // Root hall: columns along both sides of a 12 m lane (z -106..-94).
    { kind: "pillar", id: "canopy_roots.root.h1", a: { x: 722, y: -118, z: -90 }, b: { x: 726, y: -132, z: -92 }, radiusA: 1.3, radiusB: 2, wobble: 0.3 },
    { kind: "pillar", id: "canopy_roots.root.h2", a: { x: 740, y: -118.5, z: -89.5 }, b: { x: 737, y: -132, z: -91 }, radiusA: 1.2, radiusB: 1.8, wobble: 0.3 },
    { kind: "pillar", id: "canopy_roots.root.h3", a: { x: 716, y: -119, z: -109.5 }, b: { x: 720, y: -132, z: -109 }, radiusA: 1.4, radiusB: 2.1, wobble: 0.3 },
    { kind: "pillar", id: "canopy_roots.root.h4", a: { x: 742, y: -119, z: -110 }, b: { x: 746, y: -132, z: -109 }, radiusA: 1.2, radiusB: 1.9, wobble: 0.3 },
    // The hub's great root.
    { kind: "pillar", id: "canopy_roots.root.hub", a: { x: 823, y: -134, z: -143 }, b: { x: 818, y: -152, z: -148 }, radiusA: 2.2, radiusB: 3.4, wobble: 0.4 },
    ...FALLS,
  ],
  portals: [
    { id: "canopy_roots.mouth.crown", kind: "mouth", label: "Crown hollow", between: ["canopy_roots.hall", EXTERIOR],
      center: { x: 756.5, y: -86, z: -76 }, normal: { x: 0, y: 1, z: 0 }, clear: { width: 13, height: 13 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.mouth.scarp", kind: "mouth", label: "Scarp mouth", between: ["canopy_roots.hub", EXTERIOR],
      center: section(SCARP_RUN[3]!), normal: { x: -0.3, y: 0, z: -0.95 }, clear: { width: 12, height: 8.5 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.mouth.knoll", kind: "back_entrance", label: "Knoll chimney", between: ["canopy_roots.passage", EXTERIOR],
      center: { x: 849.6, y: -88, z: -71.5 }, normal: { x: 0, y: 1, z: 0 }, clear: { width: 2.2, height: 2.2 }, admits: ["diver"] },
    { id: "canopy_roots.throat.east", kind: "throat", label: "East run", between: ["canopy_roots.hall", "canopy_roots.hub"],
      center: section(EAST_RUN[1]!), normal: { x: 0.8, y: 0, z: -0.6 }, clear: { width: 11, height: 8 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.throat.low", kind: "throat", label: "Low run", between: ["canopy_roots.hub", "canopy_roots.garden"],
      center: section(LOW_RUN[2]!), normal: { x: -1, y: 0, z: 0 }, clear: { width: 11, height: 8 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.throat.gallery", kind: "throat", label: "Gallery", between: ["canopy_roots.hall", "canopy_roots.gallery"],
      center: section(GALLERY[0]!), normal: { x: -0.95, y: 0, z: -0.3 }, clear: { width: 9, height: 7 }, admits: ["diver", "small"] },
    { id: "canopy_roots.throat.garden", kind: "throat", label: "Gallery foot", between: ["canopy_roots.gallery", "canopy_roots.garden"],
      center: section(GALLERY[3]!), normal: { x: -0.6, y: 0, z: -0.8 }, clear: { width: 9, height: 7 }, admits: ["diver", "small"] },
    { id: "canopy_roots.throat.pool", kind: "throat", label: "Pool drop", between: ["canopy_roots.hub", "canopy_roots.pool"],
      center: section(POOL_DROP[1]!), normal: { x: 0.9, y: 0, z: -0.4 }, clear: { width: 11, height: 7 }, admits: ["diver", "small", "medium"] },
    { id: "canopy_roots.throat.crawl", kind: "throat", label: "Knoll crawl foot", between: ["canopy_roots.hub", "canopy_roots.passage"],
      center: section(CRAWL[1]!), normal: { x: 0.5, y: 0, z: 0.87 }, clear: { width: 2, height: 2 }, admits: ["diver"] },
    { id: "canopy_roots.throat.grotto", kind: "throat", label: "Grotto", between: ["canopy_roots.garden", "canopy_roots.passage"],
      center: section(GROTTO[0]!), normal: { x: 0.6, y: 0, z: -0.8 }, clear: { width: 2.2, height: 2 }, admits: ["diver"] },
    { id: "canopy_roots.throat.tangle", kind: "throat", label: "Root tangle", between: ["canopy_roots.hall", "canopy_roots.passage"],
      center: section(TANGLE[0]!), normal: { x: -0.4, y: 0, z: 0.92 }, clear: { width: 2.2, height: 2 }, admits: ["diver"] },
    { id: "canopy_roots.throat.squeeze", kind: "throat", label: "Squeeze", between: ["canopy_roots.hall", "canopy_roots.passage"],
      center: section(SQUEEZE[1]!), normal: { x: -0.9, y: 0, z: -0.45 }, clear: { width: 2.2, height: 2 }, admits: ["diver"] },
  ],
  life: [
    { id: "canopy_roots.life.hall_tips", zone: "canopy_roots.hall", kind: "root_tip", at: { x: 742, y: -120, z: -100 }, radius: 26, count: 55, color: "#ffb45e", light: 0.35, reach: 7 },
    { id: "canopy_roots.life.hollow_tips", zone: "canopy_roots.hall", kind: "root_tip", at: { x: 754, y: -118, z: -92 }, radius: 9, count: 30, color: "#ffc978", light: 0.3, reach: 6 },
    { id: "canopy_roots.life.gallery_pale", zone: "canopy_roots.gallery", kind: "colony", at: { x: 693, y: -132, z: -110 }, radius: 14, count: 34, color: "#a9d4ff", light: 0.18, reach: 5 },
    { id: "canopy_roots.life.garden_teal", zone: "canopy_roots.garden", kind: "frond", at: { x: 676, y: -153, z: -140 }, radius: 21, count: 260, color: "#62e6d2", light: 0.8, reach: 11 },
    { id: "canopy_roots.life.garden_violet", zone: "canopy_roots.garden", kind: "frond", at: { x: 666, y: -152, z: -146 }, radius: 13, count: 110, color: "#c6a1f2", light: 0.55, reach: 9 },
    { id: "canopy_roots.life.grotto", zone: "canopy_roots.passage", kind: "colony", at: { x: 694, y: -157, z: -164 }, radius: 4.5, count: 24, color: "#c6a1f2", light: 0.4, reach: 5 },
    { id: "canopy_roots.life.hub_ring", zone: "canopy_roots.hub", kind: "colony", at: { x: 820, y: -144, z: -146 }, radius: 6.5, count: 70, color: "#c9e06a", light: 0.7, reach: 13 },
    { id: "canopy_roots.life.hub_tips", zone: "canopy_roots.hub", kind: "root_tip", at: { x: 820, y: -137, z: -146 }, radius: 14, count: 40, color: "#d8ea8a", light: 0.3, reach: 7 },
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
    // Outside to outside on the Mantle's own box: down the hollow, hall, east run, hub, Scarp mouth.
    { id: "canopy_roots.route.craft_loop", profile: "medium", role: "loop", path: [
      { x: 757.5, y: -66, z: -69 }, { x: 757, y: -78, z: -72 }, { x: 755.8, y: -98, z: -82.5 }, { x: 754.5, y: -120.5, z: -94 }, { x: 760, y: -128, z: -100 },
      ...EAST_RUN.map(n => ride(n, 3)), { x: 806, y: -147, z: -150 }, ...SCARP_RUN.map(n => ride(n, 3)), { x: 792, y: -150.5, z: -208 },
    ] },
    // Hub, low run, garden, gallery past the fallen roof, hall: the small-craft loop.
    { id: "canopy_roots.route.west_loop", profile: "small", role: "loop", path: [
      { x: 809, y: -147, z: -150 }, ...LOW_RUN.map(n => ride(n, 2.5)), { x: 680, y: -152.5, z: -140 }, { x: 674, y: -150, z: -134 },
      ...[...GALLERY].reverse().flatMap((n, i) => i === 0 ? [ride(n, 2.5)] : [WEAVE[GALLERY.length - 1 - i]!, ride(n, 2.5)]),
      { x: 742, y: -128.5, z: -100 },
    ] },
    { id: "canopy_roots.route.pool_spur", profile: "medium", role: "spur", path: [
      { x: 830, y: -147.5, z: -154 }, ...POOL_DROP.map(n => ride(n, 3)), { x: 862, y: -184, z: -162 },
    ] },
    { id: "canopy_roots.route.squeeze", profile: "diver", role: "loop", path: [
      { x: 736, y: -129.5, z: -104 }, ...SQUEEZE.map(n => ride(n, 0.9)), { x: 678, y: -150, z: -138 },
    ] },
    { id: "canopy_roots.route.knoll", profile: "diver", role: "exit", path: [
      { x: 828, y: -148.5, z: -138 }, ...CRAWL.map(n => ride(n, 0.9)), { x: 849.5, y: -90, z: -72 }, { x: 850, y: -82, z: -70 },
    ] },
    { id: "canopy_roots.route.grotto", profile: "diver", role: "spur", path: [
      { x: 680, y: -153.5, z: -148 }, ...GROTTO.map(n => ride(n, 0.9)), { x: 694, y: -157, z: -164 },
    ] },
    { id: "canopy_roots.route.tangle", profile: "diver", role: "spur", path: [
      { x: 734, y: -129, z: -97 }, ...TANGLE.map(n => ride(n, 0.9)), { x: 726, y: -126.5, z: -77 },
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
