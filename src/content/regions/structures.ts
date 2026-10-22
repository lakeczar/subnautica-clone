import type { RegionId } from "../registry.js";
import type { Aabb } from "../../world/types.js";
import { hash2 } from "./noise.js";
import { ROUTES } from "./passages.js";
import { RESCUE_PLANS } from "./rescue.js";
import { SITES } from "./sites.js";
import { MERIDIAN_CENTRE } from "./terrain.js";
import { worldFloor } from "./worldFloor.js";

/** Authored structures: one record drives both collision (axis-aligned solid
 * boxes for `sim/world` and the spatial index) and art (`render/biomes`
 * draws each kind inside the same dimensions). A structure's `base` is the
 * lowest floor under its footprint, so it never floats. */
export type StructureKind =
  | "mast" | "pier" | "cradle" | "shelter" | "pylon" | "dish" | "girder" | "hut" | "post"
  | "split_chimney" | "chimney_stub" | "station" | "tower" | "lintel" | "dock" | "building"
  | "spire" | "gallery" | "works" | "hall" | "beacon";

export interface StructureDef {
  readonly id: string;
  readonly region: RegionId;
  readonly kind: StructureKind;
  /** Footprint centre (X/Z) and base height. */
  readonly x: number;
  readonly z: number;
  readonly base: number;
  /** Kind-specific dimensions, metres / radians. */
  readonly p: Readonly<Record<string, number>>;
  readonly solids: readonly Aabb[];
  /** Site this structure dresses, when any. */
  readonly site?: string;
}

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Aabb =>
  ({ min: { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) },
    max: { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) } });
/** Lowest floor under a footprint (corners, edges and centre). */
export function footprintBase(x: number, z: number, hx: number, hz: number): number {
  let lo = Infinity;
  for (const u of [-1, -0.5, 0, 0.5, 1]) for (const w of [-1, -0.5, 0, 0.5, 1]) lo = Math.min(lo, worldFloor(x + u * hx, z + w * hz));
  return lo;
}

type Make = (id: string, region: RegionId, x: number, z: number, p: Record<string, number>, site?: string, base?: number) => StructureDef;
/** Solids for a box `w x h x d` (X x Y x Z) resting on its base. */
const block = (kind: StructureKind): Make => (id, region, x, z, p, site, base) => {
  const w = p.w!, h = p.h!, d = p.d!;
  const b = base ?? footprintBase(x, z, w / 2, d / 2) - (p.sink ?? 0.4);
  return { id, region, kind, x, z, base: b, p, solids: [box(x - w / 2, b, z - d / 2, x + w / 2, b + h, z + d / 2)], ...(site ? { site } : {}) };
};

/** A ring of rim blocks plus a hub: the visible dish shell is open inside. */
function dish(id: string, x: number, z: number, radius: number, tilt: number, facing: number, site: string): StructureDef {
  const base = footprintBase(x, z, radius * 0.7, radius * 0.7) - 0.6;
  const solids: Aabb[] = [];
  const n = 12, seg = 2 * Math.PI * radius / n;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2;
    const rise = radius * Math.sin(tilt) * (1 + Math.cos(a - facing)) / 2;
    const cx = x + Math.cos(a) * radius, cz = z + Math.sin(a) * radius;
    const lo = footprintBase(cx, cz, 1, 1) - 0.4;
    const top = base + 2.2 + rise;
    const half = Math.max(1.2, seg * 0.36);
    solids.push(box(cx - half, Math.min(lo, top - 2), cz - half, cx + half, top, cz + half));
  }
  solids.push(box(x - radius * 0.14, base, z - radius * 0.14, x + radius * 0.14, base + 3.2, z + radius * 0.14));
  return { id, region: "silt_basin", kind: "dish", x, z, base, p: { radius, tilt, facing }, solids, site };
}

/** A straight facade along `yaw` built from short axis-aligned pieces with a
 * central doorway. `yaw` 0 runs along +X. */
function gallery(id: string, x: number, z: number, yaw: number, site: string): StructureDef {
  const length = 36, depth = 4, h = 12, door = 4;
  const base = footprintBase(x, z, 6, 6) - 0.3;
  const ux = Math.cos(yaw), uz = Math.sin(yaw), solids: Aabb[] = [];
  for (let s = -length / 2 + 3; s <= length / 2 - 3; s += 6) {
    if (Math.abs(s) < door / 2 + 2.5) continue;
    const cx = x + ux * s, cz = z + uz * s;
    solids.push(box(cx - 3, base, cz - 3, cx + 3, base + h, cz + 3));
  }
  // Lintel above the door, kept clear of a diver's path.
  solids.push(box(x - 3, base + 5, z - 3, x + 3, base + h, z + 3));
  return { id, region: "deep_district", kind: "gallery", x, z, base, p: { yaw, length, depth, h, door }, solids, site };
}

/** Mooring marker pylons at authored bearings (degrees from +X toward +Z),
 * placed between the routes that use the bowl. */
/** Open-fronted gate hall beside the works machinery: back and side walls,
 * a roof, an evidence console on the back wall and a live control panel on
 * the machinery-side wall. The north front stays open for a diver. */
function gateHall(): StructureDef {
  const b = -769, x0 = 1388, x1 = 1404, z0 = -1598, z1 = -1582, h = 7;
  return { id: "meridian.gate_hall.hall", region: "deep_district", kind: "hall", x: 1396, z: -1590, base: b,
    p: { h }, site: "meridian.gate_hall", solids: [
      box(x0, b, z0, x1, b + h, z0 + 0.4), box(x0, b, z0, x0 + 0.4, b + h, z1), box(x1 - 0.4, b, z0, x1, b + h, z1),
      box(x0, b + h, z0, x1, b + h + 0.4, z1), box(1394.5, b, z0 + 0.4, 1397.5, b + 1, z0 + 1.4),
      box(x1 - 1, b + 0.6, -1589.5, x1 - 0.4, b + 2.2, -1586.5),
    ] };
}

const pylons = (prefix: string, region: RegionId, x: number, z: number, r: number, h: number,
  bearings: readonly number[]): StructureDef[] =>
  bearings.map((deg, i) => block("pylon")(`${prefix}.pylon_${i}`, region,
    x + Math.cos(deg * Math.PI / 180) * r, z + Math.sin(deg * Math.PI / 180) * r, { w: 2, h, d: 2 }, prefix));

function splitChimney(): StructureDef {
  const base = -548, s: Aabb[] = [
    box(-196, base, -1093, -168, -420, -1037), box(-191, -420, -1088, -168, -300, -1042),
    box(-162, base, -1093, -134, -420, -1037), box(-162, -420, -1088, -139, -300, -1042),
  ];
  return { id: "rift.split_chimney.columns", region: "thermal_rift", kind: "split_chimney", x: -165, z: -1065, base,
    p: { top: -300, slot: 6 }, solids: s, site: "rift.split_chimney" };
}

function divideGate(): StructureDef[] {
  const base = Math.min(footprintBase(570, -1262, 7, 7), footprintBase(630, -1262, 7, 7)) - 1;
  const tower = (id: string, x: number): StructureDef => ({ id, region: "brine_divide", kind: "tower", x, z: -1262, base,
    p: { w: 14, d: 14, top: -318 }, solids: [box(x - 7, base, -1269, x + 7, -318, -1255)], site: "divide.gateworks" });
  return [
    tower("divide.gate_tower_west", 570), tower("divide.gate_tower_east", 630),
    { id: "divide.gate_lintel", region: "brine_divide", kind: "lintel", x: 600, z: -1262, base: -334,
      p: { w: 74, h: 12, d: 8 }, solids: [box(563, -334, -1266, 637, -322, -1258)], site: "divide.gateworks" },
    { id: "divide.service_dock.platform", region: "brine_divide", kind: "dock", x: 633, z: -1239, base: -366.5,
      p: { w: 14, d: 14 }, solids: [box(626, -366.5, -1246, 640, -365.5, -1232), box(634, -365.5, -1246, 640, -361, -1240)],
      site: "divide.service_dock" },
  ];
}

/** Habitation blocks along Meridian's three terrace arcs: the settlement's
 * silhouette. Generated deterministically, then kept at least 26 m from
 * every passage, rescue tether, padded site and authored structure. */
function meridianBlocks(authored: readonly StructureDef[]): StructureDef[] {
  const lanes = [...ROUTES.map(r => r.path), ...RESCUE_PLANS.flatMap(p => p.tethers)];
  const near = (x: number, z: number, r: number): boolean =>
    lanes.some(path => path.some((p, i) => {
      const q = path[i + 1]; if (!q) return Math.hypot(p.x - x, p.z - z) < r;
      const dx = q.x - p.x, dz = q.z - p.z, len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / len2));
      return Math.hypot(p.x + dx * t - x, p.z + dz * t - z) < r;
    })) ||
    SITES.some(s => s.region === "deep_district" && Math.hypot(s.at.x - x, s.at.z - z) < r + (s.pad?.radius ?? 0)) ||
    authored.some(s => Math.hypot(s.x - x, s.z - z) < r);
  const out: StructureDef[] = [];
  const arcs = [{ r: 640, n: 11 }, { r: 480, n: 9 }, { r: 318, n: 7 }];
  arcs.forEach(({ r, n }, k) => {
    for (let i = 0; i < n; i++) {
      const th = (100 + (i + 0.5) * 75 / n + 4 * hash2(i, k, 3)) * Math.PI / 180;
      const x = MERIDIAN_CENTRE.x + Math.cos(th) * r, z = MERIDIAN_CENTRE.z + Math.sin(th) * r;
      if (x < 960 || z > -1010) continue;
      const w = 10 + 8 * (hash2(i, k, 5) * 0.5 + 0.5), d = 8 + 6 * (hash2(i, k, 6) * 0.5 + 0.5);
      const h = 8 + 14 * (hash2(i, k, 7) * 0.5 + 0.5);
      if (near(x, z, 26 + Math.max(w, d) / 2)) continue;
      out.push(block("building")(`meridian.block_${k}_${i}`, "deep_district", Math.round(x), Math.round(z), { w: Math.round(w), h: Math.round(h), d: Math.round(d) }));
    }
  });
  return out;
}

const AUTHORED: readonly StructureDef[] = [
  // Splitspine Isles.
  block("mast")("isles.stack_mast.mast", "island_chain", 452, 102, { w: 3, h: 26, d: 3 }, "isles.stack_mast", 46),
  block("hut")("isles.stack_mast.cabinet", "island_chain", 457.5, 100, { w: 3, h: 2.4, d: 2.4 }, "isles.stack_mast", 46),
  { id: "isles.stack_yard.pier", region: "island_chain", kind: "pier", x: 470, z: 29, base: 0.8, p: { w: 6, d: 22 },
    solids: [box(467, 0.8, 18, 473, 1.4, 40)], site: "isles.stack_yard" },
  block("cradle")("isles.stack_yard.cradle_west", "island_chain", 447, -6, { w: 2, h: 28, d: 48 }, "isles.stack_yard", -34),
  block("cradle")("isles.stack_yard.cradle_east", "island_chain", 493, -6, { w: 2, h: 28, d: 48 }, "isles.stack_yard", -34),
  { id: "isles.headland_shelter.hut", region: "island_chain", kind: "shelter", x: 983.5, z: -5.6, base: 10,
    p: { w: 8, d: 7, h: 3.3, door: 1.8 }, site: "isles.headland_shelter",
    solids: [box(979.5, 10, -2.4, 987.5, 13.3, -2.1), box(979.5, 10, -9.1, 979.8, 13.3, -2.1),
      box(987.2, 10, -9.1, 987.5, 13.3, -2.1), box(979.5, 13, -9.1, 987.5, 13.3, -2.1),
      box(979.5, 10, -9.1, 982.6, 13.3, -8.8), box(984.4, 10, -9.1, 987.5, 13.3, -8.8)] },
  block("post")("isles.headland_summit.beacon", "island_chain", 1112, 106, { w: 0.6, h: 4, d: 0.6 }, "isles.headland_summit"),

  // Lantern Canopy east mooring.
  ...pylons("canopy.east_mooring", "suspended_garden", 620, -200, 52, 18, [70, 180, 290]),

  // Pale Basin.
  ...pylons("basin.anchorage", "silt_basin", 360, -430, 52, 16, [80, 165, 300]),
  dish("basin.dish_north.dish", 440, -526, 18, 0.42, 2.4, "basin.dish_north"),
  dish("basin.dish_centre.dish", 508, -572, 27, 0.36, -0.6, "basin.dish_centre"),
  dish("basin.dish_south.dish", 578, -612, 14, 0.5, 1.2, "basin.dish_south"),
  block("hut")("basin.dish_hut.hut", "silt_basin", 532, -552, { w: 4, h: 3, d: 4 }, "basin.dish_hut"),
  block("girder")("basin.wreck.frame_0", "silt_basin", 772, -452, { w: 4, h: 5, d: 16 }, "basin.wreck_ridge"),
  block("girder")("basin.wreck.frame_1", "silt_basin", 794, -482, { w: 14, h: 4, d: 3 }, "basin.wreck_ridge"),
  block("girder")("basin.wreck.frame_2", "silt_basin", 774, -540, { w: 3, h: 7, d: 12 }, "basin.wreck_ridge"),
  block("girder")("basin.wreck.frame_3", "silt_basin", 796, -580, { w: 10, h: 3, d: 4 }, "basin.wreck_ridge"),
  block("girder")("basin.wreck.frame_4", "silt_basin", 770, -628, { w: 3, h: 4, d: 14 }, "basin.wreck_ridge"),
  block("post")("basin.wreck_tagboard.post", "silt_basin", 791, -501, { w: 3, h: 2.5, d: 0.5 }, "basin.wreck_tagboard"),
  block("post")("basin.deep_marker.post", "silt_basin", 610.8, -752, { w: 0.6, h: 6, d: 0.6 }, "basin.deep_marker"),

  // Central hub spur (W2): the crown's summit, around the crown shaft's mouth.
  block("beacon")("hub.beacon_house.house", "silt_basin", 343, -569, { w: 5, h: 9, d: 5 }, "hub.beacon_house"),
  block("station")("hub.crown_station.hull", "silt_basin", 312, -544, { w: 12, h: 7, d: 8 }, "hub.crown_station"),
  block("mast")("hub.crown_station.mast", "silt_basin", 321, -537, { w: 3, h: 22, d: 3 }, "hub.crown_station"),

  // Ember Rift.
  splitChimney(),
  block("chimney_stub")("rift.cool_chimneys.stub_north", "thermal_rift", 84.4, -957.6, { w: 8, h: 12, d: 8 }, "rift.cool_chimneys"),
  block("chimney_stub")("rift.cool_chimneys.stub_south", "thermal_rift", -18.1, -1081.9, { w: 8, h: 14, d: 8 }, "rift.cool_chimneys"),
  block("chimney_stub")("rift.cool_chimneys.stub_2", "thermal_rift", 75, -1010, { w: 9, h: 18, d: 9 }, "rift.cool_chimneys"),
  block("chimney_stub")("rift.cool_chimneys.stub_3", "thermal_rift", 60, -1065, { w: 7, h: 10, d: 7 }, "rift.cool_chimneys"),
  block("chimney_stub")("rift.cool_chimneys.stub_4", "thermal_rift", 30, -1075, { w: 6, h: 15, d: 6 }, "rift.cool_chimneys"),
  block("station")("rift.materials_station.hull", "thermal_rift", 135.6, -920, { w: 14, h: 8, d: 10 }, "rift.materials_station", -262),
  ...pylons("rift.cool_mooring", "thermal_rift", 91.4, -887.5, 36, 14, [20, 200, 260]),
  block("post")("rift.chimney_gauge.post", "thermal_rift", -103.2, -1114.4, { w: 0.6, h: 4, d: 0.6 }, "rift.chimney_gauge"),
  block("post")("rift.shoulder_post.post", "thermal_rift", -141.2, -745, { w: 0.6, h: 4, d: 0.6 }, "rift.shoulder_post"),

  // Mirror Divide.
  ...divideGate(),
  ...pylons("divide.lee_mooring", "brine_divide", 560, -1120, 52, 16, [50, 160, 270]),
  block("post")("divide.ledge_sampler.post", "brine_divide", 342.8, -1182, { w: 0.8, h: 3, d: 0.8 }, "divide.ledge_sampler"),

  // Meridian District exterior.
  ...pylons("meridian.staging_shelf", "deep_district", 1080, -1160, 52, 18, [90, 230, 290]),
  block("building")("meridian.staging_office.hull", "deep_district", 1132, -1124, { w: 18, h: 10, d: 12 }, "meridian.staging_office"),
  block("hut")("meridian.service_cache.cage", "deep_district", 1150, -1102, { w: 3, h: 2.6, d: 3 }, "meridian.staging_office"),
  block("spire")("meridian.spire.shaft", "deep_district", 1215, -1319, { w: 10, h: 130, d: 10 }, "meridian.spire"),
  gallery("meridian.gallery_north.facade", 1298, -1131, Math.atan2(0.35, 0.94), "meridian.gallery_north"),
  gallery("meridian.gallery_south.facade", 1000, -1402, Math.atan2(0.896, 0.446), "meridian.gallery_south"),
  block("building")("meridian.archive.hull", "deep_district", 1288, -1405, { w: 14, h: 10, d: 14 }, "meridian.archive_terrace"),
  gateHall(),
  block("works")("meridian.works.block", "deep_district", 1440, -1582, { w: 40, h: 30, d: 36 }, "meridian.deep_works"),

  // Hearth Reef: the drop's marker posts.
  block("post")("reef.hearth_drop.post_west", "refuge_reef", -254, -100, { w: 0.8, h: 10, d: 0.8 }, "reef.hearth_drop"),
  block("post")("reef.hearth_drop.post_east", "refuge_reef", -218, -100, { w: 0.8, h: 10, d: 0.8 }, "reef.hearth_drop"),
];
export const STRUCTURES: readonly StructureDef[] = [...AUTHORED, ...meridianBlocks(AUTHORED)];

export const STRUCTURE_SOLIDS: readonly { id: string; region: RegionId; bounds: Aabb }[] =
  STRUCTURES.flatMap(s => s.solids.map((bounds, i) => ({ id: s.solids.length > 1 ? `${s.id}.${i}` : s.id, region: s.region, bounds })));
