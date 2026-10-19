import { terrainHeight } from "../sim/world.js";
import { BASIN_SOURCE_IDS } from "../content/routes.js";
import { SOURCES } from "../content/registry.js";

/** Render sampling only. The controller, saves and targeting still use the
 * unchanged physical heightfield. Outside this patch the original grid stays. */
export const TERRAIN_GRID = { nx: 190, nz: 178, minX: -95, minZ: -202, sizeX: 300, sizeZ: 290 } as const;
export const RESOURCE_TERRAIN_BOUNDS = { minX: -24, maxX: 40, minZ: -46, maxZ: -18 } as const;
export const WORKSHOP_DECK = { minX: 3, maxX: 16, minZ: -40, maxZ: -31, top: 1.2 } as const;
/** Keep the original coordinates above: extending a grid must not move its
 * already inspected island, reef or Canopy samples. Remote extension cells
 * are coarse; only work faces need sub-metre samples. */
export const TERRAIN_EXTENT = {
  minX: -95, maxX: 205 + 40 * 300 / 190,
  minZ: -202 - 50 * 290 / 178, maxZ: 88,
} as const;

export interface TerrainSurface {
  positions: number[];
  indices: number[];
}

/** Eight samples per original edge in the bounded island approach patch.
 * Coarse neighbours fan to the SAME edge vertices: no skirts, cracks or
 * T-junctions. Exact deck edges cut out the hidden terrain, and the ramp's
 * derivative break at z=-31 is an explicit edge rather than a smeared lip. */
export function createTerrainSurface(): TerrainSurface {
  const g = TERRAIN_GRID, patch = RESOURCE_TERRAIN_BOUNDS, deck = WORKSHOP_DECK;
  const positions: number[] = [], indices: number[] = [], vertices = new Map<string, number>();
  const xAxis = Array.from({ length: g.nx + 1 }, (_, i) => g.minX + i / g.nx * g.sizeX);
  const zAxis = Array.from({ length: g.nz + 1 }, (_, i) => g.minZ + i / g.nz * g.sizeZ);
  for (let i = 10; i <= 40; i += 10) xAxis.push(205 + i * g.sizeX / g.nx);
  for (let i = 50; i >= 10; i -= 10) zAxis.unshift(g.minZ - i * g.sizeZ / g.nz);
  zAxis.sort((a, b) => a - b);
  const axis = (a: number, b: number, divisions: number, cuts: readonly number[]): number[] => {
    const values = Array.from({ length: divisions + 1 }, (_, i) => a + (b - a) * i / divisions);
    for (const cut of cuts) if (cut > a && cut < b) values.push(cut);
    return [...new Set(values)].sort((x, y) => x - y);
  };
  const nx = xAxis.length - 1, nz = zAxis.length - 1;
  const cells = Array.from({ length: nz }, (_, z) => Array.from({ length: nx }, (_, x) => {
    const x0 = xAxis[x]!, x1 = xAxis[x + 1]!, z0 = zAxis[z]!, z1 = zAxis[z + 1]!;
    const island = x0 < patch.maxX && x1 > patch.minX && z0 < patch.maxZ && z1 > patch.minZ;
    const basinFloorContact = x0 < 190 && x1 > 186 && z0 < -228 && z1 > -232;
    const workFace = basinFloorContact || BASIN_SOURCE_IDS.some(id => {
      const p = SOURCES[id].position;
      return x0 < p.x + 4.5 && x1 > p.x - 4.5 && z0 < p.z + 4.5 && z1 > p.z - 4.5;
    });
    const cutsX = island ? [deck.minX, deck.maxX] : [];
    const cutsZ = island ? [deck.minZ, deck.maxZ] : [];
    return {
      xs: axis(x0, x1, island ? 8 : workFace ? Math.ceil((x1 - x0) / .7) : 1, cutsX),
      zs: axis(z0, z1, island ? 8 : workFace ? Math.ceil((z1 - z0) / .7) : 1, cutsZ),
    };
  }));
  const vertex = (x: number, z: number): number => {
    const key = `${x.toFixed(9)},${z.toFixed(9)}`;
    let index = vertices.get(key);
    if (index === undefined) {
      index = positions.length / 3;
      vertices.set(key, index);
      positions.push(x, terrainHeight(x, z), z);
    }
    return index;
  };
  const between = (values: readonly number[] | undefined, a: number, b: number): number[] =>
    values?.filter(v => v > a + 1e-9 && v < b - 1e-9) ?? [];
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const { xs: xx, zs: zz } = cells[z]![x]!;
    for (let j = 0; j < zz.length - 1; j++) for (let i = 0; i < xx.length - 1; i++) {
        const a = xx[i]!, b = xx[i + 1]!, c = zz[j]!, d = zz[j + 1]!;
        // Only the existing opaque deck replaces these faces. Terrain and
        // collision are unmodified on the ramp and beside the deck perimeter.
        if (a >= deck.minX && b <= deck.maxX && c >= deck.minZ && d <= deck.maxZ) continue;
        // Neighbours share every edge vertex even where their resolutions
        // differ. Only a boundary subcell needs a fan; untouched cells retain
        // their exact original two control triangles and diagonal.
        const left = i === 0 ? between(cells[z]?.[x - 1]?.zs, c, d) : [];
        const right = i === xx.length - 2 ? between(cells[z]?.[x + 1]?.zs, c, d) : [];
        const bottom = j === 0 ? between(cells[z - 1]?.[x]?.xs, a, b) : [];
        const top = j === zz.length - 2 ? between(cells[z + 1]?.[x]?.xs, a, b) : [];
        if (!left.length && !right.length && !bottom.length && !top.length) {
          indices.push(vertex(a, c), vertex(a, d), vertex(b, c), vertex(b, c), vertex(a, d), vertex(b, d));
        } else {
          const edge = [vertex(a, c), ...left.map(v => vertex(a, v)), vertex(a, d),
            ...top.map(v => vertex(v, d)), vertex(b, d), ...right.reverse().map(v => vertex(b, v)),
            vertex(b, c), ...bottom.reverse().map(v => vertex(v, c))];
          const center = vertex((a + b) / 2, (c + d) / 2);
          for (let k = 0; k < edge.length; k++) indices.push(center, edge[k]!, edge[(k + 1) % edge.length]!);
        }
    }
  }
  return { positions, indices };
}
