import type { RegionId } from "../registry.js";
import type { Solid } from "../../sim/world.js";
import type { Aabb, LodLevel, Rect, Vec3 } from "../../world/types.js";
import type { CraftProfileId } from "./passages.js";
import type { FloorFunction } from "./terrain.js";
import type { MeshRecipe } from "../../render/kit/types.js";
import { assertDisjointFootprints, buildCave, caveShell, sharesEdge } from "./caveGeometry.js";
import { ISLES_CAVES } from "./caves/isles.js";
import { REEF_CAVES } from "./caves/reef.js";
import { CANOPY_BASIN_GROUPS, groupDef, type CaveGroup } from "./caves/index.js";
import { styledShell } from "./caves/style.js";
import { DEEP_CAVE_SOURCES } from "./caves/deepCaves.js";
import { HUB_CAVE_SOURCES } from "./hubCaves.js";

/** W1 cave replacement volumes (Babylon-free).
 *
 * A cave owns its replacement footprints outright: inside them the base
 * heightfield is neither collision nor art, and the cave supplies every rock
 * surface from `baseY` to the exterior top, including the seabed collar, the
 * roof and the terrace above it. Outside them the heightfield is unchanged.
 *
 * One authored `CaveSource` (terraces of rock plus carved open water, both as
 * signed distances) is sampled once on a voxel grid. That single occupancy
 * yields the thick-box `rock` solids AND the shell meshes, so collision and
 * art cannot drift apart (see `caveGeometry.ts`). Rooms, portals, routes and
 * staging carry stable IDs for navigation, optics, wildlife and rescue; they
 * are checked against the generated rock, never trusted.
 *
 * Metres, +Y up, water at Y = 0, +X east, +Z north. */

// --- Authored source --------------------------------------------------------

/** A flat-topped rock prism: a superellipse outline whose walls batter
 * outwards below `level`. Stacked terraces make the stepped exterior. */
export interface TerraceSource {
  readonly id: string;
  /** Top, metres. Keep it on the voxel lattice for flat collision tops. */
  readonly level: number;
  readonly center: readonly [x: number, z: number];
  readonly radii: readonly [x: number, z: number];
  /** Superellipse exponent: 2 is an ellipse, higher is squarer. */
  readonly exponent: number;
  /** Horizontal spread per metre below the top (a leaning wall). */
  readonly batter: number;
  /** Outline wobble, metres, and its wavelength. */
  readonly wobble: number;
  readonly wavelength: number;
}

/** One cross-section along a tube: a flat floor and a rounded vault. */
export interface TubeNode {
  readonly x: number;
  readonly z: number;
  /** Water floor, metres. */
  readonly floor: number;
  /** Clear width at mid-height and clear height above the floor. */
  readonly width: number;
  readonly height: number;
}
interface CarveBase {
  readonly id: string;
  /** Room this water belongs to. */
  readonly room: string;
  /** Wall wobble, metres. */
  readonly wobble: number;
}
export interface TubeCarve extends CarveBase { readonly kind: "tube"; readonly nodes: readonly TubeNode[] }
export interface ChamberCarve extends CarveBase {
  readonly kind: "chamber";
  readonly center: Vec3;
  readonly radii: { readonly x: number; readonly z: number; readonly up: number; readonly down: number };
  /** Flat water floor, metres (clips the lower half). */
  readonly floor: number;
}
export interface ShaftCarve extends CarveBase {
  readonly kind: "shaft";
  readonly center: readonly [x: number, z: number];
  readonly radius: number;
  /** Extra radius reached at `top` (a funnel rim). */
  readonly flare: number;
  readonly bottom: number;
  readonly top: number;
}
export type CarveSource = TubeCarve | ChamberCarve | ShaftCarve;

export type CaveRoomRole = "passage" | "chamber" | "shaft" | "pocket";
export interface CaveRoomSource {
  readonly id: string;
  readonly role: CaveRoomRole;
  readonly label: string;
  /** Daylight falloff length in this room, metres. Shorter reads darker. */
  readonly falloff: number;
}

export type CavePortalKind = "mouth" | "skylight" | "throat";
/** An aperture. `normal` is a unit axis from `between[0]` to `between[1]`;
 * `clear` is the open rectangle the rock must keep, centred on `center` in
 * the portal plane: width along the horizontal in-plane axis (X for a
 * skylight) and height along Y (Z for a skylight). */
export interface CavePortal {
  readonly id: string;
  readonly kind: CavePortalKind;
  readonly label: string;
  readonly between: readonly [string, string];
  readonly center: Vec3;
  readonly normal: Vec3;
  readonly clear: { readonly width: number; readonly height: number };
  /** Profiles that fit. A diver-only mouth is narrower than every hull. */
  readonly admits: readonly CraftProfileId[];
}

export interface CaveRoute {
  readonly id: string;
  readonly profile: CraftProfileId;
  /** `loop`: in one mouth, out the other. `exit`: from deep inside to open
   * water. `link`: through a crawl into an edge-neighbour cave and on out of
   * it (CA-1); its path may leave this cave's footprint. */
  readonly role: "loop" | "exit" | "link";
  /** Pose datums (diver feet), outside to outside for a loop. */
  readonly path: readonly Readonly<Vec3>[];
}

export interface CaveStaging {
  readonly id: string;
  readonly role: "craft_parking";
  readonly label: string;
  /** Keel datum of a parked craft. */
  readonly position: Vec3;
  /** Clear radius for parking and turning. */
  readonly radius: number;
  readonly profiles: readonly CraftProfileId[];
}

/** Regional dressing of the shell (CA-1). Without one a cave draws in the
 * W1-pre Fanvault colours. */
export interface CaveStyle {
  /** Pale banded limestone with warm rims (Reef), or black-green wave-cut
   * basalt with polished ceilings and pale wet floors (Isles). The deep
   * regions' palettes (CW-1) are their defaults: black lava glass with ember
   * rims (Rift), lavender brine stone over pale mirror floors (Divide) and
   * grey cut masonry with lamp-gold rims (Meridian). */
  readonly rock: "limestone" | "basalt" | "lava_glass" | "brine_stone" | "cut_masonry";
  /** The resident drawn on the shell: unlit glimmer mats on ceilings whose
   * streaks run toward the nearest mouth, or pale clapper shells in bands
   * along the walls and lips. None for the deep regions' defaults. */
  readonly resident?: "vault_glimmer" | "tide_clapper";
}

export interface CaveSource {
  readonly id: string;
  readonly label: string;
  readonly region: RegionId;
  /** Owned columns. Edges sit on the voxel lattice. */
  readonly footprint: Rect;
  /** Replacement envelope: rock fills every owned column from `baseY` up to
   * the exterior top, which stays below `topY`. */
  readonly baseY: number;
  readonly topY: number;
  readonly terraces: readonly TerraceSource[];
  readonly carves: readonly CarveSource[];
  /** Smooth-union radius between carves, metres. */
  readonly blend: number;
  readonly rooms: readonly CaveRoomSource[];
  readonly portals: readonly CavePortal[];
  readonly routes: readonly CaveRoute[];
  readonly staging: readonly CaveStaging[];
  /** Short design note. Not player text. */
  readonly note: string;
  readonly style?: CaveStyle;
}

// --- Derived definition -------------------------------------------------------

export interface CaveRoom extends CaveRoomSource {
  /** Bound of this room's carved water, from the generated voxels. */
  readonly bounds: Aabb;
  /** Portals touching this room. */
  readonly portals: readonly string[];
}

/** A shell mesh recipe. Meshes come from `caveShell(def, lod)`; this records
 * how, so a bake can hash it and a test can hold it to the rock. */
export interface CaveSurface {
  readonly id: string;
  readonly lod: LodLevel;
  /** Sampling voxel, metres. Fine samples the collision grid itself. */
  readonly voxel: number;
  /** Largest offset of any shell vertex from the voxel corner it stands
   * for, per axis. Bounds the art-to-collision gap (fine only). */
  readonly clamp: number;
}

export interface CaveDef {
  readonly id: string;
  readonly label: string;
  readonly region: RegionId;
  /** Base-terrain ownership, not empty space. */
  readonly replacementFootprints: readonly Rect[];
  /** Everything the cave draws or collides with, roof and collar included. */
  readonly bounds: Aabb;
  /** Thick boxes, every side >= `MIN_ROCK` m, in the shared `Solid` form. */
  readonly rock: readonly Solid[];
  readonly rooms: readonly CaveRoom[];
  readonly portals: readonly CavePortal[];
  readonly surfaces: readonly CaveSurface[];
  readonly routes: readonly CaveRoute[];
  readonly staging: readonly CaveStaging[];
  readonly source: CaveSource;
  /** Generation facts for diagnostics and tests. */
  readonly stats: { readonly voxels: number; readonly rockVoxels: number; readonly droppedVoxels: number; readonly ms: number };
}

/** Smallest side of any rock solid, metres. */
export const MIN_ROCK = 2;
/** Collision voxel, metres. Footprints, terrace levels and floors sit on it. */
export const CAVE_VOXEL = 0.5;
export const EXTERIOR = "exterior";

// --- Fanvault loop, Hearth Reef ---------------------------------------------

/** Stepped limestone fan terraces on the west reef's shelf break, beside the
 * Hearth drop overlook. A tall north mouth opens onto the shelf at 18 m; a
 * broad, low south mouth opens down the slope at 26 m. Between them a
 * sunken vault sits under a 4.5 m roof pierced by a central skylight, with a
 * dark side pocket where drifting membrane collects. Diver only: both mouths
 * are narrower than any hull, and small craft park on the open shelf to the
 * north-east. Placed outside the legacy preserve and the route corridor.
 * Collar heights come from the shared `worldFloor` at generation. */
const FANVAULT_SOURCE: CaveSource = {
  id: "fanvault",
  label: "Fanvault loop",
  region: "refuge_reef",
  footprint: { minX: -316, maxX: -264, minZ: -92, maxZ: -40 },
  baseY: -36,
  topY: -8,
  terraces: [
    { id: "fanvault.terrace.lower", level: -19, center: [-290, -68], radii: [22, 20.5], exponent: 2.6, batter: 0.22, wobble: 0.6, wavelength: 11 },
    { id: "fanvault.terrace.middle", level: -15.5, center: [-290, -64.5], radii: [19.5, 18.5], exponent: 2.4, batter: 0.22, wobble: 0.55, wavelength: 10 },
    { id: "fanvault.terrace.upper", level: -11, center: [-290, -61], radii: [15.5, 15], exponent: 2.2, batter: 0.22, wobble: 0.5, wavelength: 9 },
  ],
  carves: [
    { kind: "tube", id: "fanvault.carve.north", room: "fanvault.north_passage", wobble: 0.25, nodes: [
      { x: -282.5, z: -41.5, floor: -18.5, width: 6.2, height: 5.2 },
      { x: -283, z: -47, floor: -18.5, width: 6.2, height: 5.2 },
      { x: -284.5, z: -51.5, floor: -20, width: 5, height: 4.8 },
      { x: -286.5, z: -55.5, floor: -22.5, width: 4.6, height: 4.8 },
      { x: -288, z: -59, floor: -24.5, width: 4.6, height: 5 },
    ] },
    { kind: "chamber", id: "fanvault.carve.vault", room: "fanvault.vault", wobble: 0.5,
      center: { x: -290, y: -21.5, z: -65.5 }, radii: { x: 8.5, z: 8, up: 6, down: 5.5 }, floor: -26 },
    { kind: "shaft", id: "fanvault.carve.skylight", room: "fanvault.skylight", wobble: 0.3,
      center: [-289.5, -64], radius: 3.2, flare: 1.6, bottom: -18, top: -9 },
    { kind: "tube", id: "fanvault.carve.south", room: "fanvault.south_passage", wobble: 0.25, nodes: [
      { x: -292.5, z: -71, floor: -25.5, width: 5, height: 4.6 },
      { x: -293.5, z: -77, floor: -26, width: 5.4, height: 4.5 },
      { x: -296, z: -83, floor: -26, width: 6.4, height: 4.6 },
      { x: -297, z: -88.5, floor: -26, width: 7, height: 4.8 },
      { x: -297.5, z: -92.5, floor: -26, width: 7, height: 4.8 },
    ] },
    { kind: "tube", id: "fanvault.carve.pocket_throat", room: "fanvault.pocket", wobble: 0.25, nodes: [
      { x: -297, z: -65.5, floor: -25, width: 3.4, height: 3.2 },
      { x: -302, z: -65, floor: -24.5, width: 3.4, height: 3 },
    ] },
    { kind: "chamber", id: "fanvault.carve.pocket", room: "fanvault.pocket", wobble: 0.35,
      center: { x: -304, y: -23, z: -64.5 }, radii: { x: 3.8, z: 3.6, up: 2.4, down: 2.2 }, floor: -24.5 },
  ],
  blend: 1.6,
  rooms: [
    { id: "fanvault.north_passage", role: "passage", label: "North passage", falloff: 6 },
    { id: "fanvault.vault", role: "chamber", label: "Fanvault", falloff: 8 },
    { id: "fanvault.skylight", role: "shaft", label: "Skylight", falloff: 12 },
    { id: "fanvault.south_passage", role: "passage", label: "South passage", falloff: 6 },
    { id: "fanvault.pocket", role: "pocket", label: "Catch pocket", falloff: 4 },
  ],
  portals: [
    { id: "fanvault.mouth.north", kind: "mouth", label: "North mouth", between: ["fanvault.north_passage", EXTERIOR],
      center: { x: -283, y: -16.1, z: -47 }, normal: { x: 0, y: 0, z: 1 }, clear: { width: 4.6, height: 4.2 }, admits: ["diver"] },
    { id: "fanvault.mouth.south", kind: "mouth", label: "South mouth", between: ["fanvault.south_passage", EXTERIOR],
      center: { x: -297, y: -24, z: -88 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 5.6, height: 3.8 }, admits: ["diver"] },
    { id: "fanvault.skylight", kind: "skylight", label: "Skylight", between: ["fanvault.skylight", EXTERIOR],
      center: { x: -289.5, y: -12.5, z: -64 }, normal: { x: 0, y: 1, z: 0 }, clear: { width: 3.6, height: 3.6 }, admits: ["diver"] },
    { id: "fanvault.throat.north", kind: "throat", label: "North throat", between: ["fanvault.north_passage", "fanvault.vault"],
      center: { x: -287.5, y: -22.2, z: -58 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 3.6, height: 3.6 }, admits: ["diver"] },
    { id: "fanvault.throat.south", kind: "throat", label: "South throat", between: ["fanvault.vault", "fanvault.south_passage"],
      center: { x: -293, y: -23.6, z: -74 }, normal: { x: 0, y: 0, z: -1 }, clear: { width: 4, height: 3.6 }, admits: ["diver"] },
    { id: "fanvault.throat.pocket", kind: "throat", label: "Pocket throat", between: ["fanvault.vault", "fanvault.pocket"],
      center: { x: -300, y: -23.4, z: -65.2 }, normal: { x: -1, y: 0, z: 0 }, clear: { width: 2.6, height: 2.4 }, admits: ["diver"] },
    { id: "fanvault.shaft", kind: "throat", label: "Skylight shaft", between: ["fanvault.vault", "fanvault.skylight"],
      center: { x: -289.5, y: -16.5, z: -64 }, normal: { x: 0, y: 1, z: 0 }, clear: { width: 3.6, height: 3.6 }, admits: ["diver"] },
  ],
  routes: [
    { id: "fanvault.route.loop", profile: "diver", role: "loop", path: [
      { x: -282.5, y: -16.5, z: -36 }, { x: -282.8, y: -17.3, z: -44 }, { x: -283.2, y: -17.4, z: -48 },
      { x: -284.5, y: -18.8, z: -51.5 }, { x: -286.5, y: -21.2, z: -55.5 }, { x: -288, y: -23.2, z: -59.5 },
      { x: -289.5, y: -24.3, z: -64.5 }, { x: -292.5, y: -24.3, z: -71 }, { x: -293.5, y: -24.7, z: -77 },
      { x: -296, y: -24.7, z: -83 }, { x: -297, y: -24.7, z: -88.5 }, { x: -297.5, y: -24.7, z: -97 },
    ] },
    { id: "fanvault.route.pocket_exit", profile: "diver", role: "exit", path: [
      { x: -304.5, y: -23.4, z: -64.5 }, { x: -300, y: -23.6, z: -65.2 }, { x: -296, y: -23.8, z: -65.4 },
      { x: -291, y: -23.8, z: -65 }, { x: -289.5, y: -20, z: -64 }, { x: -289.5, y: -14, z: -64 },
      { x: -289.5, y: -9.5, z: -64 },
    ] },
  ],
  staging: [
    { id: "fanvault.parking", role: "craft_parking", label: "Fanvault shelf parking",
      position: { x: -263, y: -16.4, z: -31 }, radius: 9, profiles: ["small", "medium"] },
  ],
  note: "Cave 1 of W1. Teaches roof contact and exit recognition: the skylight beam marks the vault, " +
    "the north mouth glows amber and the south mouth teal from inside. Optional; no first-access stock.",
};

export { assertDisjointFootprints };

/** CA-2's Canopy and Basin groups by source ID: they build on their
 * edge-shelf floor (`groupDef`) and draw in their region's style. */
const GROUPS: ReadonlyMap<string, CaveGroup> = new Map(CANOPY_BASIN_GROUPS.map(g => [g.source.id, g]));
/** CA-3 caves built with edge rock (`buildCave` `edgeRock`). Two keep their
 * accepted build: in the kiln tube the ceramic lining's host would sit in the
 * new edge rock, and in culvert north a lamp-off start would lose its way to
 * brighter water; both need their author's re-placement first. */
const EDGE_ROCK: ReadonlySet<string> = new Set(DEEP_CAVE_SOURCES.map(s => s.id)
  .filter(id => id !== "rift_kiln_tube" && id !== "meridian_culvert_north"));

/** The caves in the game: `gameWorld()`, the terrain and cave bakes, pits,
 * shells, scatter, chunk bounds and the cave view all follow this list.
 * - the Fanvault (W1) and W2's hub caves;
 * - CA-1's Reef and Isles caves (linked networks whole: a cave's shell stops
 *   at a shared seam where its neighbour's begins);
 * - CA-2's Canopy and Basin groups;
 * - CA-3's Rift, Divide and Meridian caves: plain kit sources in their
 *   region's shell palette (`caveGeometry.ts`), whose hazard fields S4's
 *   sampler reads (`DEEP_CAVE_HAZARDS`).
 *
 * The bake, streaming, admission and current masking follow from this list. */
export const CAVE_SOURCES: readonly CaveSource[] = [
  FANVAULT_SOURCE, ...HUB_CAVE_SOURCES, ...REEF_CAVES, ...ISLES_CAVES, ...CANOPY_BASIN_GROUPS.map(g => g.source), ...DEEP_CAVE_SOURCES,
];
/** Every authored kit cave. Every one is in the game now; the name stays for
 * the authoring tests and labs that resolve any authored cave. */
export const AUTHORED_CAVE_SOURCES: readonly CaveSource[] = CAVE_SOURCES;
assertDisjointFootprints(CAVE_SOURCES);

const built = new WeakMap<FloorFunction, Map<string, CaveDef>>();
/** The generated definition, built once per floor function on first use.
 * `floor` is the shared exterior floor (`worldFloor`); taking it as a
 * parameter keeps this module free of a cycle once `sim/world.ts` composes
 * caves, as `composeWorldFloor` does. CA-2's groups are `groupDef`'s own
 * definitions (one memo), so the tests and the game share one build. */
export function caveDef(id: string, floor: FloorFunction): CaveDef {
  const group = GROUPS.get(id);
  if (group) return groupDef(group, floor);
  let byId = built.get(floor);
  if (!byId) built.set(floor, byId = new Map());
  let def = byId.get(id);
  if (!def) {
    const source = CAVE_SOURCES.find(s => s.id === id);
    if (!source) throw new Error(`Unknown cave: ${id}`);
    // CA-3's caves stand against steep terrace and tube walls, where edge rock
    // sank up to 17 m under the snapped shell: most lean on the ground outside
    // (`edgeRock`, `EDGE_ROCK`). CA-2's groups build on their edge-shelf floor instead;
    // CA-1's and the hub's edges sink at most 1.4 m and keep their accepted build.
    def = buildCave(source, floor, CAVE_SOURCES.filter(s => s !== source && sharesEdge(s.footprint, source.footprint)),
      { edgeRock: EDGE_ROCK.has(id) });
    byId.set(id, def);
  }
  return def;
}
export function caves(floor: FloorFunction): readonly CaveDef[] {
  return CAVE_SOURCES.map(s => caveDef(s.id, floor));
}
/** The caves whose footprint touches a closed rectangle (a chunk). */
export function cavesTouching(rect: Rect, floor: FloorFunction): readonly CaveDef[] {
  return CAVE_SOURCES.filter(({ footprint: f }) => f.minX <= rect.maxX && f.maxX >= rect.minX && f.minZ <= rect.maxZ && f.maxZ >= rect.minZ)
    .map(s => caveDef(s.id, floor));
}
/** A cave's shell at one LOD in its region's palette: CA-2's groups through
 * their own style (`styledShell`), every other cave through the kit's
 * (`source.style`, else its region's default palette). */
export function caveShellOf(def: CaveDef, lod: LodLevel): MeshRecipe {
  const group = GROUPS.get(def.id);
  return group ? styledShell(def, lod, group.style) : caveShell(def, lod);
}

/** The cave whose replacement footprint owns (x, z), if any. Footprints are
 * half-open on their max edges so neighbours never both own a point. */
export function caveSourceAt(x: number, z: number): CaveSource | null {
  for (const s of CAVE_SOURCES) {
    const r = s.footprint;
    if (x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ) return s;
  }
  return null;
}

/** The floor the heightfield leaves once caves own their footprints:
 * below the cave's base inside one, the exterior floor elsewhere.
 *
 * NOT an adapter on its own (W1-PRE R1): `createWorldQueries` samples a
 * supplied floor only at an actor's centre in clearance and never in sweeps,
 * so a straddling shape can bury a corner in exterior ground; and replacing
 * the floor function switches off `world.ts`'s identity-keyed legacy terrain
 * guards. Full-shape ownership lives in the adapter prototype
 * `sim/caveWorld.ts`, which uses this only for cave-touching queries. */
export function withCaveFloors(floor: FloorFunction): FloorFunction {
  return (x, z) => {
    const cave = caveSourceAt(x, z);
    return cave ? cave.baseY - 1 : floor(x, z);
  };
}
