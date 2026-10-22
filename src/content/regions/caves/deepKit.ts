import type { HullId, MaterialId } from "../../registry.js";
import type { HazardCycle, HazardFieldDefinition, HazardShape } from "../../ecology/hazards.js";
import { at as siteAt, ECOLOGY_SITES, type EcologySiteId } from "../../ecology/sites.js";
import type { Vec3 } from "../../../world/types.js";
import type { CraftProfileId } from "../passages.js";
import type {
  CavePortal, CavePortalKind, CaveRoomRole, CaveRoomSource, CaveRoute, CaveSource, ChamberCarve, ShaftCarve, TerraceSource, TubeCarve,
} from "../caves.js";

/** CA-3 authoring kit for the deep caves (Ember Rift, Mirror Divide,
 * Meridian): small constructors over the W1 `CaveSource` contract, plus the
 * typed layer the kit has no slot for (Babylon-free, not wired):
 * - **contents** that name the content bible's IDs,
 * - **lamp-off cues** (cave residents and glimmers) that point at exits,
 * - **hazard fields** in S4's own `HazardFieldDefinition` form, so the
 *   existing exposure model (`stepExposure`) runs them unchanged,
 * - the **hall** (which craft the main hall admits, and why).
 *
 * Nothing here imports the bible (`content/proposals`); the tests hold every
 * ID to it. Metres, +Y up, water at Y = 0, +X east, +Z north. */

// --- Constructors -------------------------------------------------------------

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
type Node = readonly [x: number, z: number, floor: number, width: number, height: number];
export const tube = (id: string, room: string, nodes: readonly Node[], wobble = 0.25): TubeCarve =>
  ({ kind: "tube", id, room, wobble, nodes: nodes.map(([x, z, floor, width, height]) => ({ x, z, floor, width, height })) });
export const chamber = (id: string, room: string, center: readonly [number, number, number],
  radii: readonly [x: number, z: number, up: number, down: number], floor: number, wobble = 0.4): ChamberCarve =>
  ({ kind: "chamber", id, room, wobble, center: v(...center), radii: { x: radii[0], z: radii[1], up: radii[2], down: radii[3] }, floor });
export const shaft = (id: string, room: string, center: readonly [number, number], radius: number, flare: number,
  bottom: number, top: number, wobble = 0.3): ShaftCarve =>
  ({ kind: "shaft", id, room, wobble, center, radius, flare, bottom, top });
export const terrace = (id: string, level: number, center: readonly [number, number], radii: readonly [number, number],
  exponent = 2.4, batter = 0.2, wobble = 0.5, wavelength = 10): TerraceSource =>
  ({ id, level, center, radii, exponent, batter, wobble, wavelength });
export const room = (id: string, role: CaveRoomRole, label: string, falloff: number): CaveRoomSource => ({ id, role, label, falloff });

export type Facing = "+x" | "-x" | "+z" | "-z" | "+y" | "-y";
const NORMALS: Readonly<Record<Facing, Vec3>> = {
  "+x": v(1, 0, 0), "-x": v(-1, 0, 0), "+z": v(0, 0, 1), "-z": v(0, 0, -1), "+y": v(0, 1, 0), "-y": v(0, -1, 0),
};
/** An aperture whose normal points from `from` into `to`. */
export const portal = (id: string, kind: CavePortalKind, label: string, from: string, to: string, center: Vec3, facing: Facing,
  width: number, height: number, admits: readonly CraftProfileId[] = ["diver"]): CavePortal =>
  ({ id, kind, label, between: [from, to], center, normal: NORMALS[facing], clear: { width, height }, admits });
export const route = (id: string, profile: CraftProfileId, role: CaveRoute["role"], path: readonly (readonly [number, number, number])[]): CaveRoute =>
  ({ id, profile, role, path: path.map(p => v(...p)) });

// --- Typed layer ---------------------------------------------------------------

export type DeepRegion = "thermal_rift" | "brine_divide" | "deep_district";
export type CaveStyle = "lava_tube" | "brine_pocket" | "cut_void";

/** A content bible reference: a resource, side reward, seed or lost-site
 * proposal ID, or (`line`) one of a cave proposal's `contents` lines. */
export type BibleRef =
  | { readonly kind: "resource"; readonly id: string }
  | { readonly kind: "reward"; readonly id: string }
  | { readonly kind: "line"; readonly cave: string; readonly line: string }
  /** One of a cave proposal's `links` (a crawlway or back entrance). */
  | { readonly kind: "link"; readonly cave: string; readonly id: string };

export type ContentKind = "resource" | "scan" | "cache" | "seed" | "service" | "view" | "shelter" | "shortcut";
export interface CaveContent {
  readonly id: string;
  readonly kind: ContentKind;
  readonly bible: BibleRef;
  /** Room the content sits in (or `exterior` at a mouth). */
  readonly room: string;
  readonly at: Vec3;
  /** Gatherable item and stock for resources, caches and seeds. Scans hold none. */
  readonly item?: MaterialId | `seed_${string}`;
  readonly stock?: number;
  /** What the player reads there, never colour alone. */
  readonly read: string;
}

/** A lamp-off cue: unlit animals or growths a diver can see in the dark.
 * `exit` names the mouth or skylight it marks; `meaning` what it tells. */
export interface CaveCue {
  readonly id: string;
  readonly species?: "kiln_crawler" | "brine_skimmer" | "cable_tender" | "vault_glimmer";
  readonly kind: "colony" | "glimmer" | "ember_crack" | "pool_edge" | "live_line";
  readonly room: string;
  /** Polyline of the cue's extent (a colony patch is a short line). */
  readonly points: readonly Vec3[];
  /** Unlit RGB in 0..1. Two exits of one cave never share a colour. */
  readonly color: readonly [number, number, number];
  readonly meaning: "exit" | "heat_breath" | "dense_water" | "live_line" | "resident";
  readonly exit?: string;
  /** Live lines only: the lit world site (regions/sites.ts) the line feeds.
   * Tenders gather only on powered lines, so integration must keep that
   * site lit while the cue shows (CB Meridian builder note). */
  readonly feeds?: string;
  readonly read: string;
}

/** A cave hazard: one of S4's field definitions, positioned relative to an
 * ecology site like every other field, so `stepExposure` applies as is. */
export interface CaveHazard extends HazardFieldDefinition {
  readonly id: string;
  readonly cave: string;
}

/** The main hall: the profile its loop is swept with, the hulls whose
 * collider fits that profile AND whose rating reaches the hall's deepest
 * keel, and why. Small caves have no hall. */
export interface CaveHall {
  readonly profile: CraftProfileId;
  readonly craft: readonly HullId[];
  readonly note: string;
}

/** A medium cave's chamber plan: bible chamber names mapped to generated
 * rooms, and which room closes the loop. */
export interface CaveGraph {
  readonly chambers: Readonly<Record<string, readonly string[]>>;
  /** The bible's ↺ passage and the room(s) that realise it. */
  readonly loopCloser: { readonly passage: string; readonly rooms: readonly string[] };
}

export interface DeepCave {
  readonly source: CaveSource;
  /** Bible cave proposals this source realises (two for a crawl network). */
  readonly bible: readonly string[];
  readonly size: "small" | "medium";
  readonly style: CaveStyle;
  /** Bible exit names to the portals that realise them. */
  readonly exits: Readonly<Record<string, string>>;
  readonly hall?: CaveHall;
  readonly graph?: CaveGraph;
  readonly contents: readonly CaveContent[];
  readonly cues: readonly CaveCue[];
  readonly hazards: readonly CaveHazard[];
  /** Water the hazard tests must find cool (heat) or clear (brine). */
  readonly safe?: string;
}

// --- Hazard fields ---------------------------------------------------------------

/** The tube heat breath (CB cycle candidate `rift.kiln_breath`, 50 s period,
 * 10 s active): warm tubes exhale a pulse of heat; kiln crawlers file into
 * their cracks `KILN_BREATH_LEAD` seconds before it starts rising. */
export const KILN_BREATH: HazardCycle = { period: 50, start: 20, duration: 10, ramp: 3 };
export const KILN_BREATH_LEAD = 5;
/** Heat that stays in a warm tube between breaths: below the unprotected
 * suit's tolerance (0.3) wherever a breath field is authored. */
export const KILN_BREATH_BASELINE = 0.35;

/** A box field from absolute world corners, centred on `site`. */
export function heatBox(id: string, cave: string, site: EcologySiteId, min: Vec3, max: Vec3, intensity: number, edge: number,
  cue: string, breath = true): CaveHazard {
  const o = ECOLOGY_SITES[site].position;
  const shape: HazardShape = { kind: "box", center: siteAt(site), min: v(min.x - o.x, min.y - o.y, min.z - o.z), max: v(max.x - o.x, max.y - o.y, max.z - o.z) };
  return { id, cave, label: id, kind: "heat", region: ECOLOGY_SITES[site].region, shape, intensity, edge, cue,
    ...(breath ? { baseline: KILN_BREATH_BASELINE, cycle: KILN_BREATH } : {}) };
}
/** A vertical cylinder of heat (a vent) at an absolute centre. */
export function heatVent(id: string, cave: string, site: EcologySiteId, center: Vec3, radius: number, bottom: number, top: number,
  intensity: number, edge: number, cue: string): CaveHazard {
  const o = ECOLOGY_SITES[site].position;
  const shape: HazardShape = { kind: "cylinder", center: siteAt(site, center.x - o.x, center.y - o.y, center.z - o.z), radius, bottom, top };
  return { id, cave, label: id, kind: "heat", region: ECOLOGY_SITES[site].region, shape, intensity, edge, cue };
}
/** A trapped brine pool: everything below `surface` inside the horizontal box. */
export function brinePool(id: string, cave: string, site: EcologySiteId, minX: number, maxX: number, minZ: number, maxZ: number,
  surface: number, cue: string): CaveHazard {
  const o = ECOLOGY_SITES[site].position;
  const shape: HazardShape = { kind: "layer", center: siteAt(site), y: surface - o.y, min: v(minX - o.x, 0, minZ - o.z), max: v(maxX - o.x, 0, maxZ - o.z) };
  // Edge 1 m, as the Divide's own layer: climbing a metre clears it.
  return { id, cave, label: id, kind: "brine", region: ECOLOGY_SITES[site].region, shape, intensity: 1, edge: 1, cue };
}
