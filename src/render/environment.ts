import type { GeometryCache } from "./geometryCache.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Scene } from "@babylonjs/core";
import { fractureDepth, terrainHeight, WORLD_BOUNDS } from "../sim/world.js";
import { INTERACTION_HOSTS, renewable, SOURCES } from "../content/registry.js";
import { BASIN_SOURCE_IDS } from "../content/routes.js";
import { type RenderRegion } from "./regions.js";
import { ArtBatch, seeded, type Point } from "./geometry.js";
import { PALETTE as P } from "./palette.js";
import { createTerrainSurface } from "./terrainSurface.js";

/** Broken service runners rest on the slope instead of bridging the pit.
 * Pale edge metal and small surviving tags also identify the empty work site. */
function salvageHost(b: ArtBatch, id: string, x: number, z: number): void {
  const at = (dx: number, dz: number, lift = .075): Point => [x + dx, terrainHeight(x + dx, z + dz) + lift, z + dz];
  const rail = (dx: number, dz: number, radius = .065): Point => {
    const px = x + dx, pz = z + dz;
    const gx = (terrainHeight(px + .02, pz) - terrainHeight(px - .02, pz)) / .04;
    const gz = (terrainHeight(px, pz + .02) - terrainHeight(px, pz - .02)) / .04;
    // A round runner touches the inclined plane along its underside. A mere
    // radius of vertical lift would bury its uphill half on a steep slope.
    return at(dx, dz, radius * Math.hypot(1, gx, gz) + .01);
  };
  for (const side of [-1, 1]) {
    b.tube(Array.from({ length: 13 }, (_, i) => rail(side * 1.04, -.8 + i * .1333333333)), .065, P.steelLight, 5);
    b.tube(Array.from({ length: 15 }, (_, i) => rail(-1.04 + i * 2.08 / 14, side * .8)), .065, side < 0 ? P.ochre : P.steelLight, 5);
    b.tube([rail(side * 1.04, -.61, .072), rail(side * 1.04, -.39, .072)], .072, P.petrol, 5);
  }
  const offset = INTERACTION_HOSTS[id]?.offset;
  const dx = offset?.x ?? 0, dz = offset?.z ?? 0;
  b.face([at(dx + .22, dz - .13, .105), at(dx + .22, dz + .13, .105), at(dx - .22, dz + .13, .105), at(dx - .22, dz - .13, .105)], P.porcelain);
  for (let i = 0; i < 3; i++) {
    const cx = dx - .12 + i * .1;
    b.face([at(cx + .018, dz - .07, .112), at(cx + .018, dz + .07, .112), at(cx - .018, dz + .07, .112), at(cx - .018, dz - .07, .112)], P.petrol);
  }
}

/** Abraded mineral seams, with small scalloped grazing scars. This remains
 * geological relief after loose nodules are collected, never a human frame. */
function westernGlassHost(b: ArtBatch, x: number, z: number): void {
  for (let band = 0; band < 3; band++) {
    const path: Point[] = [];
    for (let i = 0; i <= 18; i++) {
      const px = x - 1.3 + i * 2.6 / 18, pz = z - .6 + band * .55 + Math.sin(i * .65 + band) * .09;
      path.push([px, terrainHeight(px, pz) + .065, pz]);
    }
    const at = (p: Point, across: number, lift: number): Point => [p[0], terrainHeight(p[0], p[2] + across) + lift, p[2] + across];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!, c = path[i + 1]!;
      b.face([at(c, -.15, .008), at(c, 0, .15), at(a, 0, .15), at(a, -.15, .008)], P.basalt);
      b.face([at(c, 0, .15), at(c, .15, .008), at(a, .15, .008), at(a, 0, .15)], P.metal);
      b.face([at(c, -.026, .158), at(c, .026, .158), at(a, .026, .158), at(a, -.026, .158)], band === 1 ? P.reflection : P.steelLight);
    }
  }
  for (let scar = 0; scar < 3; scar++) {
    const path: Point[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = i / 8 * Math.PI, px = x - .75 + scar * .7 + Math.cos(a) * .23, pz = z + Math.sin(a) * .2;
      path.push([px, terrainHeight(px, pz) + .055, pz]);
    }
    b.tube(path, .025, P.shell, 4);
  }
}

export function createEnvironment(scene: Scene, cel: ShaderMaterial, region?: RenderRegion | "terrain", cache?: GeometryCache): void {
  const batch = (name: string): ArtBatch => new ArtBatch(name, scene, cel, cache && { owner: cache, key: `environment:${region ?? "complete"}:${name}` });
  if (!region || region === "terrain") {
  const terrain = new Mesh("island.terrain", scene),
    data = new VertexData();
  const { positions, indices } = createTerrainSurface();
  const normals: number[] = [], colors: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const px = positions[i]!, py = positions[i + 1]!, pz = positions[i + 2]!;
    const dx =
      (terrainHeight(px + 0.1, pz) - terrainHeight(px - 0.1, pz)) / 0.2;
    const dz =
      (terrainHeight(px, pz + 0.1) - terrainHeight(px, pz - 0.1)) / 0.2;
    const length = Math.hypot(dx, 1, dz);
    normals.push(-dx / length, 1 / length, -dz / length);
    const patch = Math.sin(px * 0.2 + pz * 0.12) * Math.cos(pz * 0.16);
    let hex: string =
      py > 13
        ? P.basalt
        : py > 3.3
          ? patch > 0.1
            ? "#81966e"
            : "#76947b"
          : py > -1.2
            ? P.shore
            : patch > 0.44
              ? "#789c94"
              : P.sand;
    if (Math.hypot(dx, dz) > 1.15) hex = py > 0 ? "#5c7f7e" : "#669894";
    // Upper Canopy sediment is cooler and lower in value than reef sand.
    // Blend on the same physical height field; no extra shelf or false floor.
    const canopy = Math.max(0, Math.min(1, (px - 60) / 30)) * Math.max(0, Math.min(1, (-py - 35) / 40));
    const c = Color3.Lerp(Color3.FromHexString(hex), Color3.FromHexString(patch > .3 ? "#4b807a" : "#2e616c"), canopy);
    const basin = Math.max(0, Math.min(1, (-pz - 180) / 30)) * Math.max(0, Math.min(1, (px - 85) / 25));
    // Two sediment lanes have different widths/values. They are a surface
    // pattern on the real slope, not a current/visibility simulation.
    const lane = Math.sin((px - 170) * .14 + pz * .08 + Math.sin(pz * .07) * 1.2);
    const sediment = Color3.FromHexString(lane > .3 ? "#638d8b" : "#335e70");
    // The boundary fracture darkens with its own extra depth: fresh, unsorted slope.
    const fracture = Math.max(0, Math.min(1, fractureDepth(px, pz) / 30));
    const color = Color3.Lerp(Color3.Lerp(c, sediment, basin), Color3.FromHexString("#203f52"), fracture * .8);
    colors.push(color.r, color.g, color.b, 0); // Terrain-only relief in the shared cel pass.
  }
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(terrain);
  terrain.material = cel;
  terrain.isPickable = false;
  terrain.freezeWorldMatrix();
  if (region === "terrain") return;
  }

  const stones = batch("reef.geology"),
    random = seeded(574);
  if (!region || region === "refuge_reef") {
  // Authored sediment lenses and rubble cluster beside ribs, leaving a clear pod route.
  for (const [cx, cz, count] of [
    [-25, -7, 28],
    [-10, -17, 18],
    [28, -23, 16],
    [29, 7, 15],
    [-40, 19, 14],
  ]) {
    if (cx === undefined || cz === undefined || count === undefined) continue;
    for (let i = 0; i < count; i++) {
      const x = cx + (random() - 0.5) * 13,
        z = cz + (random() - 0.5) * 11,
        s = 0.3 + random() * 1.3;
      stones.ellipsoid(
        [x, terrainHeight(x, z) + s * 0.2, z],
        [s, s * 0.48, s * 0.73],
        i % 3 ? P.stoneLight : P.basalt,
        6,
      );
    }
  }
  // Sparse physical ripple relief, restrained in tone and confined to sand pockets.
  for (let i = 0; i < 14; i++) {
    const z = -7 + i * 0.78;
    const path: [number, number, number][] = [];
    for (let j = 0; j < 10; j++) {
      const x = 8 + j * 0.9;
      path.push([
        x,
        terrainHeight(x, z) + 0.025,
        z + Math.sin(j * 0.6 + i * 0.2) * 0.16,
      ]);
    }
    stones.tube(path, 0.035, "#c2d1ae", 4);
  }
  }
  if (!region || region === "island_chain") {
  // Rock bands follow existing island surfaces: decorative relief is only centimetres.
  for (let i = 0; i < 7; i++) {
    const z = -42 - i * 4.6;
    const path: [number, number, number][] = [];
    for (let x = -10; x <= 29; x += 1.3)
      path.push([x, terrainHeight(x, z) + 0.04, z]);
    stones.tube(path, 0.07, i % 2 ? "#6d8980" : "#9cab89", 5);
  }
  }
  // Exposed glass follows abraded ledges, membrane collects in a lee hollow,
  // and tagged alloy sits on a fallen service frame. Hosts persist after harvest.
  // These skins sample the authoritative height field; they add no art-only shelf.
  for (const [id, source] of Object.entries(SOURCES)) {
    if (region && source.region !== region) continue;
    const { x, z } = source.position;
    if (BASIN_SOURCE_IDS.some(s => s === id)) {
      const host = batch("source-host." + id);
      if (source.asset === "scraps") {
        salvageHost(host, id, x, z);
        const south = id === "basin_ridge_salvage_south";
        // One broken ladder and one curved runner identify different wreck
        // patches. Both follow the floor instead of bridging an invisible pit.
        const runner = (a: readonly [number, number], c: readonly [number, number], color: string): void => {
          const count = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / .1);
          // A bent, broad runner follows both sides of the slope. Straight
          // endpoint tubes would cut through the strongly curved source ledge.
          const at = (t: number, side: number, lift: number): Point => {
            const px = x + a[0] + (c[0] - a[0]) * t + side * .065;
            const pz = z + a[1] + (c[1] - a[1]) * t;
            return [px, terrainHeight(px, pz) + lift, pz];
          };
          for (let i = 0; i < count; i++) {
            const lo = i / count, hi = (i + 1) / count;
            host.face([at(lo, -1, .13), at(hi, -1, .13), at(hi, 1, .13), at(lo, 1, .13)], color);
          }
        };
        if (south) {
          for (const dx of [-1.6, 1.6]) { runner([dx, -1.6], [dx, 0], P.ochre); runner([dx, 0], [dx + .35, 1.5], P.ochre); }
          for (const dz of [-1.4, -.7, 0, .7, 1.4]) runner([-1.6, dz], [1.6, dz], P.steelLight);
        } else {
          runner([-2, -1.3], [-1.65, -.4], P.metal); runner([-1.65, -.4], [-1.7, 1], P.metal);
          runner([-1.7, 1], [-1, 1.5], P.metal); runner([1.9, -1.3], [1.7, 1.2], P.ochre);
        }
      } else {
        // Persistent survey-fin mount; mineral stock is a separate mesh and
        // can vanish without erasing the learned source context.
        const west = id === "basin_survey_fins_west";
        for (let i = 0; i < (west ? 4 : 3); i++) {
          const dx = (i - (west ? 1.5 : 1)) * .58, dz = west ? dx * .3 : 0;
          const at = (t: number, side: number, lift: number): Point => {
            const px = x + dx + side * .065, pz = z + dz + t;
            return [px, terrainHeight(px, pz) + lift, pz];
          };
          for (let j = 0; j < 13; j++) {
            const a = -.65 + j * .1, c = a + .1;
            for (const side of [-1, 1]) host.face([at(a, side, .08), at(c, side, .08), at(c, side, .58), at(a, side, .58)], P.petrol);
            host.face([at(a, -1, .6), at(c, -1, .6), at(c, 1, .6), at(a, 1, .6)], P.steelLight);
          }
          host.face([at(.65, -1, .1), at(.65, 1, .1), at(.65, 1, .58), at(.65, -1, .58)], P.ochre);
        }
        for (let j = 0; j < 25; j++) {
          const a = x - 1.25 + j * .1, c = a + .1;
          const at = (px: number, pz: number): Point => [px, terrainHeight(px, pz) + .1, pz];
          for (const dz of [-.8, .8]) host.face([at(a, z + dz - .04), at(c, z + dz - .04), at(c, z + dz + .04), at(a, z + dz + .04)], P.metal);
        }
      }
      host.finish(.2);
      continue;
    }
    if (id === "island_workshop_scraps" || id === "island_headland_scraps" || id === "island_glass_ledge_west") {
      const host = batch("source-host." + id);
      if (id === "island_glass_ledge_west") westernGlassHost(host, x, z);
      else salvageHost(host, id, x, z);
      host.finish(.1);
      continue;
    }
    if (renewable(id) && source.asset === "resin") {
      // A living pocket remains a place after harvest: a shallow stone cup on
      // its pinnacle, stained by cured resin, under the collectable nodules.
      const host = batch("source-host." + id), y = source.position.y;
      const at = (r: number, i: number, lift: number): Point => {
        const a = i / 10 * Math.PI * 2;
        return [x + Math.cos(a) * 1.3 * r, y + lift, z + Math.sin(a) * .9 * r];
      };
      host.ellipsoid([x, y - .78, z], [1.05, .26, .75], P.basalt, 10);
      for (let i = 0; i < 10; i++)
        host.face([at(.72, i, -.62), at(.72, i + 1, -.62), at(1, i + 1, -.4), at(1, i, -.4)], i % 2 ? P.petrol : P.basalt);
      host.tube(Array.from({ length: 11 }, (_, i) => at(1, i, -.4)), .05, P.stoneLight, 5);
      for (const i of [1.3, 4.3, 7.3]) host.ellipsoid(at(.94, i, -.39), [.12, .035, .09], P.orange, 6);
      host.finish(.2);
      continue;
    }
    if (source.asset === "glass") {
      for (let band = 0; band < 4; band++) {
        const path: [number, number, number][] = [];
        for (let i = 0; i < 7; i++) {
          const px = x - 1.8 + i * 0.6, pz = z - 0.75 + band * 0.5 + Math.sin(i) * 0.1;
          path.push([px, terrainHeight(px, pz) + 0.04, pz]);
        }
        stones.tube(path, 0.04, band % 2 ? P.steelLight : P.basalt, 4);
      }
    } else if (source.asset === "ribbons") {
      for (const side of [-1, 1]) {
        const path: [number, number, number][] = [];
        for (let i = 0; i < 7; i++) {
          const px = x + side * (1.2 + Math.sin(i / 6 * Math.PI) * 0.65), pz = z - 1.8 + i * 0.6;
          path.push([px, terrainHeight(px, pz) + 0.045, pz]);
        }
        stones.tube(path, 0.065, P.stoneLight, 5);
      }
    } else if (source.asset === "scraps") {
      const y = terrainHeight(x, z) + 0.06;
      // A frame deliberately has an empty centre; it reads differently from ore.
      for (const side of [-1, 1]) {
        stones.box([x + side * 1.3, y, z], [0.12, 0.1, 2.3], P.petrol);
        stones.box([x, y, z + side * 1.1], [2.6, 0.1, 0.12], P.metal);
      }
    }
  }
  if (!region || region === "refuge_reef" || region === "island_chain") stones.finish();

  if (region && region !== "refuge_reef") return;
  // Edge buoys are navigation context for this deliberately bounded early build.
  const buoys = batch("foundation.edge-buoys");
  for (const [x, z] of [
    [WORLD_BOUNDS.minX + 2, 12],
    [WORLD_BOUNDS.maxX - 2, 12],
    [-38, WORLD_BOUNDS.maxZ - 2],
    [38, WORLD_BOUNDS.maxZ - 2],
    [-38, WORLD_BOUNDS.minZ + 2],
    [48, WORLD_BOUNDS.minZ + 2],
  ]) {
    if (x === undefined || z === undefined) continue;
    buoys.ellipsoid([x, 0.02, z], [0.45, 0.38, 0.45], P.ochre, 8);
    buoys.tube(
      [
        [x, 0, z],
        [x, 1.7, z],
      ],
      0.045,
      P.petrol,
      5,
    );
    buoys.box([x, 1.55, z], [0.48, 0.23, 0.04], P.porcelain);
  }
  buoys.finish();
}
