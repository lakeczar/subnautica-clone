import { terrainHeight } from "../sim/world.js";

/** Render sampling only. The controller, saves and targeting still use the
 * unchanged physical heightfield. Outside this patch the original grid stays. */
export const TERRAIN_GRID = { nx: 190, nz: 178, minX: -95, minZ: -202, sizeX: 300, sizeZ: 290 } as const;
export const RESOURCE_TERRAIN_BOUNDS = { minX: -24, maxX: 40, minZ: -46, maxZ: -18 } as const;
export const WORKSHOP_DECK = { minX: 3, maxX: 16, minZ: -40, maxZ: -31, top: 1.2 } as const;

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
  const px = (x: number): number => g.minX + x / g.nx * g.sizeX;
  const pz = (z: number): number => g.minZ + z / g.nz * g.sizeZ;
  const refined = (x: number, z: number): boolean => x >= 0 && x < g.nx && z >= 0 && z < g.nz &&
    px(x) < patch.maxX && px(x + 1) > patch.minX && pz(z) < patch.maxZ && pz(z + 1) > patch.minZ;
  const axis = (a: number, b: number, cuts: readonly number[]): number[] => {
    const values = Array.from({ length: 9 }, (_, i) => a + (b - a) * i / 8);
    for (const cut of cuts) if (cut > a && cut < b) values.push(cut);
    return values.sort((x, y) => x - y);
  };
  const xs = Array.from({ length: g.nx }, (_, x) => axis(px(x), px(x + 1), [deck.minX, deck.maxX]));
  const zs = Array.from({ length: g.nz }, (_, z) => axis(pz(z), pz(z + 1), [deck.minZ, deck.maxZ]));
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
  for (let z = 0; z < g.nz; z++) for (let x = 0; x < g.nx; x++) {
    const x0 = px(x), x1 = px(x + 1), z0 = pz(z), z1 = pz(z + 1);
    if (refined(x, z)) {
      const xx = xs[x]!, zz = zs[z]!;
      for (let j = 0; j < zz.length - 1; j++) for (let i = 0; i < xx.length - 1; i++) {
        const a = xx[i]!, b = xx[i + 1]!, c = zz[j]!, d = zz[j + 1]!;
        // Only the existing opaque deck replaces these faces. Terrain and
        // collision are unmodified on the ramp and beside the deck perimeter.
        if (a >= deck.minX && b <= deck.maxX && c >= deck.minZ && d <= deck.maxZ) continue;
        indices.push(vertex(a, c), vertex(a, d), vertex(b, c), vertex(b, c), vertex(a, d), vertex(b, d));
      }
    } else if (refined(x - 1, z) || refined(x + 1, z) || refined(x, z - 1) || refined(x, z + 1)) {
      const edge: number[] = [vertex(x0, z0)];
      for (const v of (refined(x - 1, z) ? zs[z]! : [z0, z1]).slice(1)) edge.push(vertex(x0, v));
      for (const v of (refined(x, z + 1) ? xs[x]! : [x0, x1]).slice(1)) edge.push(vertex(v, z1));
      for (const v of (refined(x + 1, z) ? zs[z]! : [z0, z1]).slice(0, -1).reverse()) edge.push(vertex(x1, v));
      for (const v of (refined(x, z - 1) ? xs[x]! : [x0, x1]).slice(1, -1).reverse()) edge.push(vertex(v, z0));
      const center = vertex((x0 + x1) / 2, (z0 + z1) / 2);
      for (let i = 0; i < edge.length; i++) indices.push(center, edge[i]!, edge[(i + 1) % edge.length]!);
    } else {
      indices.push(vertex(x0, z0), vertex(x0, z1), vertex(x1, z0), vertex(x1, z0), vertex(x0, z1), vertex(x1, z1));
    }
  }
  return { positions, indices };
}
