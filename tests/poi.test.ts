import assert from "node:assert/strict";
import test from "node:test";
import { DEEP_LEGS, EMPTY_TRAVEL_LIMIT, legRoute, longestEmpty, type Noticeable } from "../src/content/poi/legs.js";
import { POI_SETS, POIS } from "../src/content/poi/sets.js";
import { AREAS, CAVE_BIOMES } from "../src/content/proposals/index.js";
import { CAVE_SOURCES } from "../src/content/regions/caves.js";
import { ROUTES } from "../src/content/regions/passages.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURE_SOLIDS, STRUCTURES } from "../src/content/regions/structures.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { VISTA_SETS, VISTA_SOLIDS } from "../src/content/vistas.js";
import type { Aabb, Vec3 } from "../src/world/types.js";
import { RecipeBuilder } from "../src/render/biomes/recipe.js";
import { blocked, prewarmScatter } from "../src/render/biomes/scatter.js";
import { drawSolidSet, VISTA_DRESSING, vistaMesh, type VistaPart } from "../src/render/biomes/vistas.js";
import { worldLayout } from "../src/content/regions/layout.js";
import { clusterEmissive } from "../src/render/lighting/localLights.js";
import { POI_DRESSING } from "../src/render/poi/dressing.js";
import { CARRIER_CLEAR, LANDMARK_LIGHTS, ROUTE_CLEAR, seamPoint } from "../src/render/poi/landmarks.js";

/** POI-1: the deep legs' points of interest and the landmark lights. The
 * generic vista suites (tests/vistas.test.ts, vistas-envelope.heavy) already
 * hold every POI set to its collision and to the passages, tethers, moorings,
 * park and work poses; this file adds what POI-1 promises on top: clear of
 * carrier lanes and routes (root's and W2's), off every cave footprint (root,
 * the CA and W2 branches, the bible's proposals), lamps that only hug what is
 * already there, lights that read from the route, and the empty stretches. */

// --- Sibling branches (snapshot) ----------------------------------------------
/** Cave footprints on in-flight branches, read from their sources:
 * CA-3 `t3/rift-divide-meridian-caves` ddbe957, W2 `t3/central-pinnacle-hub`
 * 2d09dc0, CA-2 `t3/canopy-basin-caves` ff18178 (Basin only; the Canopy is
 * far from every deep leg), CA-1 cfe64a8 has none near a deep leg. */
const SIBLING_CAVES: readonly { id: string; minX: number; maxX: number; minZ: number; maxZ: number }[] = [
  ["ca3.divide_mirror_pocket", 388, 412, -1252, -1228], ["ca3.divide_crest_hollow", 678, 702, -1222, -1198],
  ["ca3.divide_east_pocket", 782, 822, -1247, -1223], ["ca3.divide_lee_burrow", 456, 482, -1097, -1073],
  ["ca3.divide_fissure_window", 533, 557, -1336, -1316], ["ca3.divide_lintel_galleries", 686, 754, -1300, -1228],
  ["ca3.divide_brine_cistern", 886, 924, -1233, -1192], ["ca3.meridian_footing_void", 1038, 1062, -1237, -1213],
  ["ca3.meridian_culvert_north", 1224, 1240, -1164, -1136], ["ca3.meridian_spire_footing", 1170, 1194, -1370, -1346],
  ["ca3.meridian_escarp_pocket", 1378, 1396, -944, -920], ["ca3.meridian_terrace_crack", 1113, 1131, -1487, -1469],
  ["ca3.meridian_window_gallery", 1014, 1052, -1326, -1288], ["ca3.meridian_escarp_culvert", 1320, 1352, -990, -952],
  ["ca3.rift_north_shoulder", -124, -54, -808, -784], ["ca3.rift_tube_mites", -128, -107, -1136, -1112],
  ["ca3.rift_stub_hollow", -4, 20, -1148, -1124], ["ca3.rift_west_blister", -414, -386, -974, -946],
  ["ca3.rift_west_tube", -346, -302, -1010, -956], ["ca3.rift_kiln_tube", 140, 180, -856, -798],
  ["w2.hub_apron_hollow", 30, 48, -394, -374], ["w2.hub_step_arch", 76, 100, -418, -382],
  ["w2.hub_glimmer_crack", 172, 204, -486, -442], ["w2.hub_crown_shaft", 313, 358, -590, -516],
  ["ca2.basin_culvert", 398, 422, -507, -483], ["ca2.basin_burrow", 776, 812, -702, -672], ["ca2.basin_door_slot", 548, 572, -782, -758],
  ["ca2.basin_fracture", 322, 346, -376, -352], ["ca2.basin_rim_cut", 198, 286, -848, -798], ["ca2.basin_dish_lee_hall", 524, 574, -682, -629],
].map(([id, minX, maxX, minZ, maxZ]) => ({ id: id as string, minX: minX as number, maxX: maxX as number, minZ: minZ as number, maxZ: maxZ as number }));
/** W2's re-routed Basin carrier lanes (raw keel lines) and its pinnacles
 * (centre, reach of the outermost profile knot plus wobble). */
const W2_LANES: readonly (readonly Vec3[])[] = [
  [[360, -240, -430], [306, -244, -458], [250, -249, -505], [228, -252, -560], [205, -254, -590], [140, -262, -680], [105, -282, -800], [91.4, -300, -887.5]],
  [[360, -240, -430], [306, -244, -458], [250, -249, -505], [228, -252, -560], [242, -262, -620], [262, -280, -690], [330, -330, -760], [430, -360, -900], [520, -378, -1020], [560, -390, -1120]],
].map(l => l.map(([x, y, z]) => ({ x: x!, y: y!, z: z! })));
const W2_PINNACLES: readonly [number, number, number][] = [[8, -392, 24], [40, -376, 35], [80, -400, 50], [186, -464, 48], [330, -560, 77], [350, -522, 17]];

/** Every cave column a POI must keep off, padded by a margin for the kit's collar. */
const CAVE_PAD = 8;
prewarmScatter();
const CAVE_RECTS = [
  ...CAVE_SOURCES.map(c => ({ id: `root.${c.id}`, ...c.footprint })),
  ...SIBLING_CAVES,
  ...AREAS.flatMap(a => a.caves.map(c => ({ id: `proposal.${c.id}`, ...c.footprint }))),
  ...CAVE_BIOMES.map(b => ({ id: `biome.${b.id}`, minX: b.domain.min.x, maxX: b.domain.max.x, minZ: b.domain.min.z, maxZ: b.domain.max.z })),
];

// --- Geometry ------------------------------------------------------------------
const segDist = (p: Vec3, a: Vec3, c: Vec3): number => {
  const d = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }, l = d.x * d.x + d.y * d.y + d.z * d.z;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) / l)) : 0;
  return Math.hypot(p.x - a.x - d.x * t, p.y - a.y - d.y * t, p.z - a.z - d.z * t);
};
const lineDist = (p: Vec3, path: readonly Vec3[]): number => {
  let m = Infinity;
  for (let i = 1; i < path.length; i++) m = Math.min(m, segDist(p, path[i - 1]!, path[i]!));
  return m;
};
const LANES = [...ROUTES.filter(r => r.role !== "walk").map(r => ({ id: r.id, path: r.path, clear: r.carrier ? CARRIER_CLEAR : ROUTE_CLEAR })),
  ...W2_LANES.map((path, i) => ({ id: `w2.lane${i}`, path, clear: CARRIER_CLEAR }))];
/** What a point of a POI's art crowds, or null. */
function crowds(p: Vec3): string | null {
  for (const l of LANES) { const d = lineDist(p, l.path); if (d < l.clear) return `${l.id} (${d.toFixed(1)} m < ${l.clear})`; }
  for (const [x, z, r] of W2_PINNACLES) if (Math.hypot(p.x - x, p.z - z) < r + 10) return `W2 pinnacle at ${x}, ${z}`;
  for (const c of CAVE_RECTS)
    if (p.x > c.minX - CAVE_PAD && p.x < c.maxX + CAVE_PAD && p.z > c.minZ - CAVE_PAD && p.z < c.maxZ + CAVE_PAD) return `cave ${c.id}`;
  return null;
}
/** Seams lie on the rock like scatter: scatter's open-water keep-out (root's
 * routes, tethers, moorings, structures), the same columns over W2's lanes
 * (lane half-width plus a metre, from just under the keel to the hull's
 * height plus 4 m), and the caves. */
function seamCrowds(p: Vec3): string | null {
  if (blocked(p.x, p.z, p.y, 0)) return "a root keep-out";
  for (const [i, lane] of W2_LANES.entries()) for (let k = 1; k < lane.length; k++) {
    const a = lane[k - 1]!, c = lane[k]!, dx = c.x - a.x, dz = c.z - a.z, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)), y = a.y + (c.y - a.y) * t;
    if (Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t) < 31 && p.y > y - 0.5 && p.y < y + 13.2) return `w2.lane${i}`;
  }
  for (const c of CAVE_RECTS) if (p.x > c.minX - CAVE_PAD && p.x < c.maxX + CAVE_PAD && p.z > c.minZ - CAVE_PAD && p.z < c.maxZ + CAVE_PAD) return `cave ${c.id}`;
  return null;
}
type Mesh = { positions: readonly number[] | Float32Array; colors: readonly number[] | Float32Array };
const points = (m: Mesh): Vec3[] => Array.from({ length: m.positions.length / 3 }, (_, i) => ({ x: m.positions[i * 3]!, y: m.positions[i * 3 + 1]!, z: m.positions[i * 3 + 2]! }));
const drawPart = (p: VistaPart, fine: boolean): RecipeBuilder => { const b = new RecipeBuilder(); p.draw(b, worldFloor, fine); return b; };
const drawSet = (id: string, fine: boolean): RecipeBuilder => { const b = new RecipeBuilder(); drawSolidSet(b, VISTA_SETS.find(s => s.id === id)!, fine); return b; };
/** A POI's art: its solid sets and its dressing parts. */
const poiArt = (id: string, fine: boolean): RecipeBuilder[] => [
  ...POI_SETS.filter(s => s.id === id || s.id.startsWith(`${id}.`)).map(s => drawSet(s.id, fine)),
  ...POI_DRESSING.filter(p => p.id.startsWith(`${id}.`)).map(p => drawPart(p, fine)),
];
const lights = (b: RecipeBuilder): number => clusterEmissive(b.positions, b.colors).length;
const inBox = (p: Vec3, k: Aabb, tol: number): boolean =>
  p.x >= k.min.x - tol && p.x <= k.max.x + tol && p.y >= k.min.y - tol && p.y <= k.max.y + tol && p.z >= k.min.z - tol && p.z <= k.max.z + tol;
/** True where the terrain surface passes within 0.8 m (vertically) of `p`
 * somewhere within 1.2 m of it in plan: a lamp on a cliff face (the seams'
 * ribbons stand 0.7 m either side of the rock's contour). The floor is
 * continuous, so it does if it spans the band [y - 0.8, y + 0.8] there. */
const onTerrain = (p: Vec3): boolean => {
  let lo = Infinity, hi = -Infinity;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    if (Math.hypot(i, j) > 3) continue;
    const f = worldFloor(p.x + i * 0.4, p.z + j * 0.4); lo = Math.min(lo, f); hi = Math.max(hi, f);
  }
  return lo <= p.y + 0.8 && hi >= p.y - 0.8;
};
/** Distance from `p` to a mesh's nearest triangle (closest point by sampling
 * each triangle on a 0.1 m lattice; triangles further than 3 m are skipped). */
function meshDistance(p: Vec3, m: Mesh & { indices: ArrayLike<number> }): number {
  const at = (i: number): Vec3 => ({ x: m.positions[i * 3]!, y: m.positions[i * 3 + 1]!, z: m.positions[i * 3 + 2]! });
  let best = Infinity;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = at(m.indices[t]!), b = at(m.indices[t + 1]!), c = at(m.indices[t + 2]!);
    const span = Math.max(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z), Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z));
    if (Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) > span + 3) continue;
    const n = Math.max(1, Math.ceil(span / 0.15));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      best = Math.min(best, Math.hypot(a.x * w + b.x * u + c.x * v - p.x, a.y * w + b.y * u + c.y * v - p.y, a.z * w + b.z * u + c.z * v - p.z));
    }
  }
  return best;
}

// --- Tests ------------------------------------------------------------------------

test("every POI is registered once, built from sets and dressing, and lit at both LODs", () => {
  const ids = new Set(POIS.map(p => p.id));
  assert.equal(ids.size, POIS.length, "POI ids are unique");
  for (const s of POI_SETS) assert.equal(VISTA_SETS.filter(v => v.id === s.id).length, 1, `${s.id} is in VISTA_SETS once`);
  for (const p of POI_DRESSING) assert.equal(VISTA_DRESSING.filter(v => v.id === p.id).length, 1, `${p.id} is in VISTA_DRESSING once`);
  for (const s of POI_SETS) assert.ok(ids.has(s.id) || ids.has(s.id.replace(/\.[^.]+$/, "")), `${s.id} belongs to a POI`);
  for (const p of POI_DRESSING) assert.ok(POIS.some(q => p.id.startsWith(`${q.id}.`)), `${p.id} belongs to a POI`);
  for (const p of POIS) {
    assert.ok(DEEP_LEGS.some(l => l.id === p.leg), `${p.id}: unknown leg ${p.leg}`);
    for (const fine of [true, false]) {
      const n = poiArt(p.id, fine).reduce((k, b) => k + lights(b), 0);
      assert.ok(n >= 1, `${p.id} (${fine ? "fine" : "coarse"}) has a light to be seen by`);
      assert.ok(n <= 40, `${p.id} (${fine ? "fine" : "coarse"}) sends ${n} local lights; keep it under 40`);
    }
  }
});

test("POIs keep clear of carrier lanes (25 m past the hull), routes, W2's lanes and pinnacles, and every cave", () => {
  for (const p of POIS) for (const b of poiArt(p.id, true)) for (const q of points(b)) {
    const why = crowds(q);
    assert.equal(why, null, `${p.id} at ${q.x.toFixed(1)}, ${q.y.toFixed(1)}, ${q.z.toFixed(1)} crowds ${why}`);
  }
});

test("ADVERSE controls: a float on a carrier lane, art in a sibling cave and a lamp off the spire are all caught", () => {
  const path = ROUTES.find(r => r.id === "route.divide.meridian_broad")!.path, lane = path[Math.floor(path.length / 2)]!;
  assert.match(crowds({ x: lane.x, y: lane.y - 20, z: lane.z + 20 }) ?? "", /meridian_broad/, "28 m from a carrier lane's keel line is too close");
  assert.match(crowds({ x: 800, y: worldFloor(800, -1235), z: -1235 }) ?? "", /ca3\.divide_east_pocket/, "CA-3's east pocket is a keep-out");
  assert.match(crowds({ x: 330, y: -100, z: -600 }) ?? "", /pinnacle|w2|hub/, "W2's crown is a keep-out");
  const spire = STRUCTURE_SOLIDS.find(s => s.id === "meridian.spire.shaft")!.bounds;
  assert.ok(!inBox({ x: spire.max.x + 1, y: spire.min.y + 20, z: (spire.min.z + spire.max.z) / 2 }, spire, 0.1), "a lamp 1 m off the spire is not on it");
  assert.ok(!onTerrain({ x: 100, y: worldFloor(100, -700) + 3, z: -700 }), "a seam 3 m off the rock is not on it");
});

test("landmark lights hug what is already there: structure or vista collision, or the rock", () => {
  const solids = [...STRUCTURE_SOLIDS.map(s => s.bounds), ...VISTA_SOLIDS.filter(s => s.id.startsWith("vista.wreck.")).map(s => s.bounds)];
  const counts: Record<string, number> = {};
  for (const part of LANDMARK_LIGHTS) for (const fine of [true, false]) {
    // Dish lamps sit on the drawn rim (next test): S2's dish rims are drawn
    // 2-13 m above their rim-block collision, so the art is the reference.
    const b = drawPart(part, fine), seam = part.id.startsWith("landmark.rift.seams"), dish = part.id.startsWith("landmark.basin.basin.dish_");
    assert.ok(b.vertexCount > 0, `${part.id} (${fine ? "fine" : "coarse"}) draws its lights`);
    for (let i = 3; i < b.colors.length; i += 4) assert.equal(b.colors[i], -1, `${part.id}: every landmark light is unlit (emissive)`);
    for (const q of points(b)) {
      const where = `${part.id} at ${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}`;
      if (seam) {
        assert.ok(onTerrain(q), `${where} floats off the rock`);
        assert.equal(seamCrowds(q), null, `${where} crowds ${seamCrowds(q)}`);
      } else if (!dish) assert.ok(solids.some(k => inBox(q, k, 0.1)), `${where} stands off its landmark's collision`);
    }
    if (fine) counts[part.id] = lights(b);
  }
  // Every named landmark has lights, and the seams line both walls.
  for (const id of ["landmark.meridian.spire", "landmark.divide.gateworks", "landmark.basin.wreck_hulls"]) assert.ok((counts[id] ?? 0) >= 6, `${id}: ${counts[id]} lights`);
  for (const d of STRUCTURES.filter(s => s.kind === "dish")) assert.ok((counts[`landmark.basin.${d.id}`] ?? 0) >= 6, `${d.id} rim lamps`);
  const seams = Object.entries(counts).filter(([id]) => id.startsWith("landmark.rift.seams")).reduce((n, [, k]) => n + k, 0);
  assert.ok(seams >= 60, `Rift seams: ${seams} lights`);
  for (const side of [-1, 1]) assert.ok(seamPoint(worldFloor, 200, side, 0.5), `the ${side < 0 ? "north-west" : "south-east"} wall has a cliff at 200 m`);
});

test("smoke: the dish bands wrap the drawn rim (every 25th band vertex; every 5th in the heavy tier)", async () => {
  const { structureMesh } = await import("../src/render/biomes/structures.js");
  for (const d of STRUCTURES.filter(s => s.kind === "dish")) {
    const dish = structureMesh([d], d.id, true)!, band = points(drawPart(LANDMARK_LIGHTS.find(p => p.id === `landmark.basin.${d.id}`)!, true));
    assert.ok(band.length > 0, `${d.id} has a band`);
    // Every 25th vertex of the band's tubes (0.5 m round the rim's centre line) is on the drawn rim tube.
    for (let k = 0; k < band.length; k += 25) {
      const d0 = meshDistance(band[k]!, dish);
      assert.ok(d0 < 0.6, `${d.id} band at ${band[k]!.x.toFixed(1)}, ${band[k]!.y.toFixed(1)}, ${band[k]!.z.toFixed(1)} is ${d0.toFixed(2)} m off the drawn dish`);
    }
  }
});

/** What a pilot notices on the deep legs. Unlit sites, structures and vista
 * sets show within 60 m; a POI shows from 150 m at its beacon (its brightest
 * light); a landmark from 150 m at any of its actual lights (the cluster
 * centres the renderer lights it by), and counts once however many it has. */
const centre = (boxes: readonly Aabb[]): Vec3 => ({ x: (Math.min(...boxes.map(b => b.min.x)) + Math.max(...boxes.map(b => b.max.x))) / 2,
  y: (Math.min(...boxes.map(b => b.min.y)) + Math.max(...boxes.map(b => b.max.y))) / 2, z: (Math.min(...boxes.map(b => b.min.z)) + Math.max(...boxes.map(b => b.max.z))) / 2 });
const UNLIT: Noticeable[] = [
  ...SITES.map(s => ({ id: s.id, points: [{ x: s.at.x, y: typeof s.at.y === "number" ? s.at.y : worldFloor(s.at.x, s.at.z) + 1, z: s.at.z }], reach: 60 })),
  ...STRUCTURES.map(s => ({ id: s.id, points: [centre(s.solids)], reach: 60 })),
  ...VISTA_SETS.filter(s => !s.id.startsWith("poi.")).map(s => ({ id: s.id, points: [centre(VISTA_SOLIDS.filter(k => k.id.startsWith(`vista.${s.id}.`)).map(k => k.bounds))], reach: 60 })),
];
const LANDMARK_MARKS: Noticeable[] = (() => {
  const by = new Map<string, Vec3[]>();
  for (const part of LANDMARK_LIGHTS) {
    const b = drawPart(part, false), id = part.id.replace(/\.\d+$/, "");
    by.set(id, [...by.get(id) ?? [], ...clusterEmissive(b.positions, b.colors).map(c => ({ x: c.x, y: c.y, z: c.z }))]);
  }
  return [...by].filter(([, points]) => points.length).map(([id, points]) => ({ id, points, reach: 150 }));
})();
const poiMarks = (beacon: (p: (typeof POIS)[number]) => Vec3): Noticeable[] => POIS.map(p => ({ id: p.id, points: [beacon(p)], reach: 150 }));

test("each POI's beacon is one of its own lights", () => {
  for (const p of POIS) {
    const lit = poiArt(p.id, false).flatMap(b => points(b).filter((_, i) => b.colors[i * 4 + 3] === -1));
    const d = Math.min(...lit.map(q => Math.hypot(q.x - p.beacon.x, q.y - p.beacon.y, q.z - p.beacon.z)));
    assert.ok(d <= 3, `${p.id}: its beacon is ${d.toFixed(1)} m from its nearest light`);
  }
});

test("each deep leg's longest empty stretch, seen in 3D over the terrain, stays inside the 90 s rule", () => {
  const rows: string[] = [];
  for (const leg of DEEP_LEGS) {
    const path = legRoute(leg).path, was = longestEmpty(path, UNLIT, worldFloor), now = longestEmpty(path, [...UNLIT, ...poiMarks(p => p.beacon), ...LANDMARK_MARKS], worldFloor);
    rows.push(`${leg.label}: ${was.gap.toFixed(0)} m / ${(was.gap / leg.speed).toFixed(0)} s -> ${now.gap.toFixed(0)} m / ${(now.gap / leg.speed).toFixed(0)} s`);
    assert.ok(now.gap / leg.speed <= EMPTY_TRAVEL_LIMIT, `${leg.label}: ${now.gap.toFixed(0)} m empty from s=${now.from.toFixed(0)}`);
    // Every POI of this leg is seen from it.
    for (const p of POIS.filter(q => q.leg === leg.id)) assert.ok(now.seen.some(s => s.id === p.id), `${p.id} is not seen from ${leg.route}`);
  }
  console.log(`longest empty stretch, at the leg's best craft:\n  ${rows.join("\n  ")}`);
});

test("ADVERSE controls: a beacon 1 km down, or a lamp behind the Divide ridge, is not seen", () => {
  const sunk = poiMarks(p => ({ ...p.beacon, y: p.beacon.y - 1000 }));
  for (const leg of DEEP_LEGS) {
    const seen = longestEmpty(legRoute(leg).path, [...UNLIT, ...sunk], worldFloor).seen;
    for (const p of POIS.filter(q => q.leg === leg.id)) assert.ok(!seen.some(s => s.id === p.id), `${p.id} sunk 1 km is still seen from ${leg.route}`);
  }
  // Within reach, but over the ridge's crest from the Meridian lane.
  const behind = { x: 860, y: worldFloor(860, -1262) + 2, z: -1262 };
  const broad = DEEP_LEGS.find(l => l.id === "divide_meridian")!;
  assert.ok(!longestEmpty(legRoute(broad).path, [{ id: "behind", points: [behind], reach: 400 }], worldFloor).seen.length, "a lamp behind the ridge is seen through it");
  assert.ok(longestEmpty(legRoute(broad).path, [{ id: "lee", points: [{ ...behind, z: -1090, y: worldFloor(860, -1090) + 2 }], reach: 400 }], worldFloor).seen.length, "control: the same lamp in the lee is seen");
});

test("light and vertex budget: per chunk and in total", () => {
  const chunks = worldLayout().chunks.filter(c => c.art.some(a => a.factory === "s2.scatter"));
  let total = 0, worst = { id: "", lights: 0, vertices: 0 };
  for (const c of chunks) {
    const g = vistaMesh(c, "coarse", worldFloor, () => false);
    let r = g.next();
    while (!r.done) r = g.next();
    if (!r.value) continue;
    const n = clusterEmissive(r.value.positions, r.value.colors).length, v = r.value.positions.length / 3;
    total += n;
    if (n > worst.lights) worst = { id: c.id, lights: n, vertices: v };
  }
  const added = [...POI_DRESSING, ...LANDMARK_LIGHTS].reduce((n, p) => n + lights(drawPart(p, true)), 0) + POI_SETS.reduce((n, s) => n + lights(drawSet(s.id, true)), 0);
  console.log(`vista lights (coarse) in the world: ${total}; POI-1 adds ${added} (fine); busiest chunk ${worst.id}: ${worst.lights} lights, ${worst.vertices} vertices`);
  // ATM-1 sends the 12 best lights a frame, so clusters cost only the CPU
  // selection (a score and a sort per resident light), not the GPU. Hold the
  // count near today's so a careless lamp strip (one light per 4 m cell)
  // shows up here.
  assert.ok(worst.lights <= 180, `chunk ${worst.id} carries ${worst.lights} emissive clusters`);
  assert.ok(added <= 850, `POI-1 adds ${added} local lights`);
});
