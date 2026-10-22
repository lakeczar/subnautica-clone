import type { Vec3 } from "../../world/types.js";
import type { CaveSource, CarveSource, TubeNode } from "./caves.js";

/** W2 hub spur caves (content bible `hub-spur.md` §3), on the W1 cave kit.
 *
 * Hearth Reef limestone carried out along the spur: a hollow under a reef
 * head on the apron's lip, an arch through the first step's shoulder, a
 * crack through the second step, and the crown shaft, a medium cave whose
 * loop spirals down through the crown to a flank mouth on the rim balcony.
 * The pinnacles themselves are the shared floor (`terrain.ts` HUB_PINNACLES);
 * these sources only add the knobs the openings need and carve the water.
 *
 * Footprints keep 10 m clear of the legacy preserve (the adapter's collar
 * band) and every footprint edge rests on floor above `baseY`, so the collar
 * meets the heightfield. Coordinates as everywhere: metres, +Y up, water at
 * Y = 0, +X east, +Z north. */

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
/** `caves.ts` EXTERIOR, spelled out: `caves.ts` imports this module. */
const EXTERIOR = "exterior";

// --- Apron hollow -------------------------------------------------------------

/** A low hollow in the reef head on the apron's south lip, the first arch
 * of the spur. One narrow mouth opens down its south flank toward the first
 * step. Diver only. */
const APRON_HOLLOW: CaveSource = {
  id: "hub_apron_hollow",
  label: "Apron hollow",
  region: "silt_basin",
  footprint: { minX: 30, maxX: 48, minZ: -394, maxZ: -374 },
  baseY: -100,
  topY: -18,
  terraces: [],
  carves: [
    { kind: "chamber", id: "hub_apron_hollow.carve.hollow", room: "hub_apron_hollow.hollow", wobble: 0.4,
      center: { x: 39.5, y: -31, z: -379.5 }, radii: { x: 5, z: 3.4, up: 2.4, down: 2.4 }, floor: -33.4 },
    { kind: "tube", id: "hub_apron_hollow.carve.mouth", room: "hub_apron_hollow.mouth", wobble: 0.2, nodes: [
      { x: 39.5, z: -382.5, floor: -33, width: 4.2, height: 3.6 },
      { x: 40, z: -387, floor: -33, width: 4.2, height: 3.6 },
      { x: 40.5, z: -392, floor: -33, width: 4.4, height: 3.6 },
      { x: 41, z: -396, floor: -33.5, width: 4.6, height: 3.8 },
    ] },
  ],
  blend: 1.4,
  rooms: [
    { id: "hub_apron_hollow.hollow", role: "chamber", label: "Apron hollow", falloff: 6 },
    { id: "hub_apron_hollow.mouth", role: "passage", label: "Apron mouth", falloff: 6 },
  ],
  portals: [
    { id: "hub_apron_hollow.mouth.south", kind: "mouth", label: "Apron mouth", between: ["hub_apron_hollow.mouth", EXTERIOR],
      center: { x: 40.2, y: -31.2, z: -389.5 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 3, height: 2.4 }, admits: ["diver"] },
    { id: "hub_apron_hollow.throat", kind: "throat", label: "Hollow throat", between: ["hub_apron_hollow.hollow", "hub_apron_hollow.mouth"],
      center: { x: 39.5, y: -31.2, z: -382.5 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 3.2, height: 2.6 }, admits: ["diver"] },
  ],
  routes: [
    { id: "hub_apron_hollow.route.exit", profile: "diver", role: "exit", path: [
      v(36, -33, -379.5), v(39.5, -33, -379.5), v(39.5, -32.6, -382.5), v(40, -32.6, -387), v(40.5, -32.6, -392), v(41, -33.1, -397),
    ] },
  ],
  staging: [
    { id: "hub_apron_hollow.parking", role: "craft_parking", label: "Apron shelf parking",
      position: { x: 40, y: -16, z: -364 }, radius: 7, profiles: ["small", "medium"] },
  ],
  note: "Hub cave 1. The spur's first arch: a hollow in the apron lip's reef head, its one mouth facing down the " +
    "slope toward the first step. Optional; no first-access stock.",
};

// --- Step arch ------------------------------------------------------------------

/** A limestone knob on the first step's east shoulder, cut north to south by
 * a tall, narrow arch tunnel. Diver only; shelter on the spur crossing. */
const STEP_ARCH: CaveSource = {
  id: "hub_step_arch",
  label: "Step arch",
  region: "silt_basin",
  footprint: { minX: 76, maxX: 100, minZ: -418, maxZ: -382 },
  baseY: -116,
  topY: -30,
  terraces: [
    { id: "hub_step_arch.terrace.knob", level: -33, center: [88, -400], radii: [6.5, 10.5], exponent: 2.6, batter: 0.06, wobble: 0.5, wavelength: 8 },
    { id: "hub_step_arch.terrace.fan", level: -36.5, center: [87, -400.5], radii: [8.5, 12], exponent: 2.3, batter: 0.06, wobble: 0.5, wavelength: 9 },
  ],
  carves: [
    { kind: "tube", id: "hub_step_arch.carve.arch", room: "hub_step_arch.arch", wobble: 0.25, nodes: [
      { x: 88.5, z: -417, floor: -49, width: 4.2, height: 8 },
      { x: 88, z: -409, floor: -48.5, width: 4, height: 9.5 },
      { x: 87.5, z: -400, floor: -48, width: 4, height: 10.5 },
      { x: 88, z: -391, floor: -48.5, width: 4, height: 9.5 },
      { x: 88.5, z: -383, floor: -49, width: 4.2, height: 8 },
    ] },
  ],
  blend: 1.4,
  rooms: [{ id: "hub_step_arch.arch", role: "passage", label: "Step arch", falloff: 7 }],
  portals: [
    { id: "hub_step_arch.mouth.north", kind: "mouth", label: "North mouth", between: ["hub_step_arch.arch", EXTERIOR],
      center: { x: 88, y: -44.2, z: -388 }, normal: { x: 0, y: 0, z: 1 }, clear: { width: 3, height: 6.5 }, admits: ["diver"] },
    { id: "hub_step_arch.mouth.south", kind: "mouth", label: "South mouth", between: ["hub_step_arch.arch", EXTERIOR],
      center: { x: 88, y: -44.2, z: -412 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 3, height: 6.5 }, admits: ["diver"] },
  ],
  routes: [
    { id: "hub_step_arch.route.loop", profile: "diver", role: "loop", path: [
      v(88.5, -48.4, -385), v(88, -47.9, -391), v(87.5, -47.6, -400), v(88, -47.9, -409), v(88.5, -48.4, -415),
    ] },
  ],
  staging: [
    { id: "hub_step_arch.parking", role: "craft_parking", label: "First step summit",
      position: { x: 72, y: -34, z: -400 }, radius: 7, profiles: ["small"] },
  ],
  note: "Hub cave 2. A tall slot arch through a knob on the first step's shoulder. Links to the glimmer crack across the gap " +
    "by sight, not rock. Optional.",
};

// --- Glimmer crack ----------------------------------------------------------------

/** A narrow crack through the second step, from its north face to the
 * crown-side face, under a limestone knob. Diver only. Its crown-side
 * mouth frames the crown. */
const GLIMMER_CRACK: CaveSource = {
  id: "hub_glimmer_crack",
  label: "Glimmer crack",
  region: "silt_basin",
  footprint: { minX: 172, maxX: 204, minZ: -486, maxZ: -442 },
  baseY: -146,
  topY: -34,
  terraces: [
    { id: "hub_glimmer_crack.terrace.knob", level: -38.5, center: [187.5, -465], radii: [10, 14], exponent: 2.3, batter: 0.06, wobble: 0.5, wavelength: 8 },
  ],
  carves: [
    { kind: "tube", id: "hub_glimmer_crack.carve.crack", room: "hub_glimmer_crack.crack", wobble: 0.2, nodes: [
      { x: 178.5, z: -445.5, floor: -61, width: 3.4, height: 5.5 },
      { x: 181.5, z: -452, floor: -60.5, width: 3.2, height: 7 },
      { x: 185, z: -459, floor: -60, width: 3.2, height: 10.5 },
      { x: 189, z: -466, floor: -60, width: 3.2, height: 12 },
      { x: 194, z: -473, floor: -60.5, width: 3.2, height: 7.5 },
      { x: 198.5, z: -479.5, floor: -61, width: 3.4, height: 5 },
    ] },
  ],
  blend: 1.2,
  rooms: [{ id: "hub_glimmer_crack.crack", role: "passage", label: "Glimmer crack", falloff: 6 }],
  portals: [
    { id: "hub_glimmer_crack.mouth.north", kind: "mouth", label: "North mouth", between: ["hub_glimmer_crack.crack", EXTERIOR],
      center: { x: 180.8, y: -57, z: -450.5 }, normal: { x: 0, y: 0, z: 1 }, clear: { width: 2.4, height: 4.5 }, admits: ["diver"] },
    { id: "hub_glimmer_crack.mouth.crown", kind: "mouth", label: "Crown-side mouth", between: ["hub_glimmer_crack.crack", EXTERIOR],
      center: { x: 196, y: -57, z: -476.5 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 2.4, height: 4.5 }, admits: ["diver"] },
  ],
  routes: [
    { id: "hub_glimmer_crack.route.loop", profile: "diver", role: "loop", path: [
      v(178.5, -60.6, -445.5), v(181.5, -60.1, -452), v(185, -59.6, -459), v(189, -59.6, -466), v(194, -60.1, -473), v(198.5, -60.6, -479.5),
    ] },
  ],
  staging: [
    { id: "hub_glimmer_crack.parking", role: "craft_parking", label: "Second step summit",
      position: { x: 166, y: -46, z: -462 }, radius: 7, profiles: ["small"] },
  ],
  note: "Hub cave 3. An 18 m crack through the second step; its crown-side mouth frames the crown across the lane. Optional.",
};

// --- Crown shaft ----------------------------------------------------------------

/** The helix of the crown shaft: a Dart-wide tube winding two turns down
 * round a 6 m rock newel under the summit, from the bowl at 60 m to 104 m. */
const HELIX = { x: 331, z: -570, radius: 9, top: -60, pitch: 22, turns: 2, width: 13, height: 6.5 } as const;
function helixNodes(): TubeNode[] {
  const out: TubeNode[] = [];
  const steps = HELIX.turns * 12;
  for (let i = 0; i <= steps; i++) {
    const a = i / 12 * Math.PI * 2;
    out.push({ x: HELIX.x + HELIX.radius * Math.sin(a), z: HELIX.z + HELIX.radius * Math.cos(a),
      floor: HELIX.top - HELIX.pitch * i / 12, width: HELIX.width, height: HELIX.height });
  }
  return out;
}
/** The helix as four half-turn tubes sharing end nodes, so each voxel only
 * evaluates the coil near it (carves are pruned by their bounds). */
function helixCarves(): CarveSource[] {
  const nodes = helixNodes(), out: CarveSource[] = [];
  for (let i = 0; i + 1 < nodes.length; i += 6)
    out.push({ kind: "tube", id: `hub_crown_shaft.carve.spiral_${i / 6}`, room: "hub_crown_shaft.spiral", wobble: 0.3, nodes: nodes.slice(i, i + 7) });
  return out;
}
/** Keel datums a small craft follows down the helix, 1.5 m off its floor. */
function helixPath(lift: number): Vec3[] {
  return helixNodes().map(n => v(n.x, n.floor + lift, n.z));
}

/** The crown shaft (medium): the crown mouth opens in the summit into the
 * crown bowl; a Dart-wide spiral shaft winds two turns down to a lower
 * passage and the flank chamber, whose mouth opens 120 m deep onto the rim
 * balcony over the carrier anchorage. A diver chimney climbs from the flank
 * chamber back to the bowl and closes the loop. The fastest safe way from
 * the hub down to Basin depth. */
const CROWN_SHAFT: CaveSource = {
  id: "hub_crown_shaft",
  label: "Crown shaft",
  region: "silt_basin",
  footprint: { minX: 313, maxX: 358, minZ: -590, maxZ: -516 },
  baseY: -128,
  topY: -42,
  terraces: [],
  carves: [
    { kind: "shaft", id: "hub_crown_shaft.carve.mouth", room: "hub_crown_shaft.bowl", wobble: 0.4,
      center: [331, -559], radius: 7, flare: 1.5, bottom: -60, top: -43 },
    { kind: "chamber", id: "hub_crown_shaft.carve.bowl", room: "hub_crown_shaft.bowl", wobble: 0.5,
      center: { x: 331, y: -56.5, z: -559 }, radii: { x: 8.5, z: 8.5, up: 5, down: 4.5 }, floor: -61 },
    ...helixCarves(),
    { kind: "tube", id: "hub_crown_shaft.carve.lower", room: "hub_crown_shaft.spiral", wobble: 0.3, nodes: [
      { x: 331, z: -561, floor: -104, width: 13, height: 7.5 },
      { x: 334, z: -552, floor: -106, width: 12, height: 8 },
      { x: 339, z: -542, floor: -108.5, width: 12, height: 8 },
      { x: 343, z: -534, floor: -111.5, width: 12, height: 8 },
      { x: 345, z: -529, floor: -115, width: 11, height: 7.5 },
    ] },
    { kind: "chamber", id: "hub_crown_shaft.carve.flank", room: "hub_crown_shaft.flank", wobble: 0.5,
      center: { x: 344, y: -113, z: -530 }, radii: { x: 7, z: 5.5, up: 6.5, down: 3 }, floor: -116.5 },
    { kind: "tube", id: "hub_crown_shaft.carve.flank_mouth", room: "hub_crown_shaft.flank", wobble: 0.3, nodes: [
      { x: 345, z: -531, floor: -116, width: 11, height: 6.5 },
      { x: 346, z: -526, floor: -116, width: 11, height: 6.5 },
      { x: 347, z: -521, floor: -116, width: 10.5, height: 6.5 },
      { x: 347.5, z: -517.5, floor: -116, width: 10.5, height: 6.5 },
    ] },
    { kind: "tube", id: "hub_crown_shaft.carve.chimney", room: "hub_crown_shaft.chimney", wobble: 0.2, nodes: [
      { x: 350, z: -530, floor: -114, width: 4.2, height: 6 },
      { x: 350.5, z: -536.5, floor: -98, width: 4, height: 6 },
      { x: 346, z: -543, floor: -81, width: 4, height: 6 },
      { x: 341, z: -550, floor: -67, width: 4, height: 6 },
      { x: 337.5, z: -554.5, floor: -59.5, width: 4.2, height: 6 },
    ] },
  ],
  blend: 1.6,
  rooms: [
    { id: "hub_crown_shaft.bowl", role: "chamber", label: "Crown bowl", falloff: 12 },
    { id: "hub_crown_shaft.spiral", role: "shaft", label: "Spiral shaft", falloff: 16 },
    { id: "hub_crown_shaft.flank", role: "chamber", label: "Flank chamber", falloff: 10 },
    { id: "hub_crown_shaft.chimney", role: "passage", label: "Diver chimney", falloff: 10 },
  ],
  portals: [
    { id: "hub_crown_shaft.mouth.crown", kind: "mouth", label: "Crown mouth", between: ["hub_crown_shaft.bowl", EXTERIOR],
      center: { x: 331, y: -46.5, z: -559 }, normal: { x: 0, y: 1, z: 0 }, clear: { width: 9.5, height: 9.5 }, admits: ["diver", "small"] },
    { id: "hub_crown_shaft.mouth.flank", kind: "mouth", label: "Flank mouth", between: ["hub_crown_shaft.flank", EXTERIOR],
      center: { x: 347.5, y: -112.8, z: -520.5 }, normal: { x: 0, y: 0, z: 1 }, clear: { width: 8.5, height: 5 }, admits: ["diver", "small"] },
    { id: "hub_crown_shaft.throat.spiral", kind: "throat", label: "Spiral head", between: ["hub_crown_shaft.bowl", "hub_crown_shaft.spiral"],
      center: { x: 331, y: -58, z: -563.5 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 9, height: 3.5 }, admits: ["diver", "small"] },
    { id: "hub_crown_shaft.throat.flank", kind: "throat", label: "Spiral foot", between: ["hub_crown_shaft.spiral", "hub_crown_shaft.flank"],
      center: { x: 342, y: -107, z: -535 }, normal: { x: 0, y: 0, z: 1 }, clear: { width: 8, height: 4 }, admits: ["diver", "small"] },
    { id: "hub_crown_shaft.throat.chimney_low", kind: "throat", label: "Chimney foot", between: ["hub_crown_shaft.flank", "hub_crown_shaft.chimney"],
      center: { x: 350.25, y: -103, z: -533.5 }, normal: { x: 0, y: 1, z: 0 }, clear: { width: 2, height: 2 }, admits: ["diver"] },
    { id: "hub_crown_shaft.throat.chimney_top", kind: "throat", label: "Chimney head", between: ["hub_crown_shaft.chimney", "hub_crown_shaft.bowl"],
      center: { x: 341, y: -63.5, z: -550 }, normal: { x: 0, y: 1, z: 0 }, clear: { width: 2, height: 2 }, admits: ["diver"] },
  ],
  routes: [
    // The craft loop: in at the crown mouth, down the spiral, out on the balcony.
    { id: "hub_crown_shaft.route.craft", profile: "small", role: "loop", path: [
      v(331, -40, -559), v(331, -50, -559), v(331, -57.5, -560.5), ...helixPath(1.5).slice(1),
      v(334, -103.5, -552), v(339, -106, -542), v(343, -108.5, -534), v(345, -112, -529), v(346.5, -114, -524),
      v(347, -114, -521), v(347.5, -114, -516), v(348, -114, -508),
    ] },
    // The diver loop closes through the chimney: balcony, flank, chimney, bowl, crown.
    { id: "hub_crown_shaft.route.chimney", profile: "diver", role: "loop", path: [
      v(348, -116, -510), v(347.5, -115.6, -517), v(347, -115.6, -523), v(349, -115.5, -528), v(350, -111.5, -530),
      v(350.5, -95.5, -536.5), v(346, -78.5, -543), v(341, -64.5, -550), v(337.5, -57, -554.5), v(334, -58, -557),
      v(331, -55, -559), v(331, -46, -559), v(331, -40, -559),
    ] },
  ],
  staging: [
    { id: "hub_crown_shaft.balcony", role: "craft_parking", label: "Rim balcony mooring",
      position: { x: 352, y: -116, z: -505 }, radius: 7, profiles: ["small", "medium"] },
  ],
  note: "Hub cave 4 (medium). Two exits, a craft loop down the spiral and a diver loop closed by the chimney. " +
    "Lamp off anywhere inside, the nearer mouth's glow leads out. Crust fins on the spiral walls (W3 content).",
};

export const HUB_CAVE_SOURCES: readonly CaveSource[] = [APRON_HOLLOW, STEP_ARCH, GLIMMER_CRACK, CROWN_SHAFT];
