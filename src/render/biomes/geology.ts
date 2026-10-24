import { fbm, hash2, smooth } from "../../content/regions/noise.js";
import type { TerrainMasks } from "../../content/regions/terrain.js";
import { hex, mix, type Rgb } from "./recipe.js";

/** Terrain material breakup for the authored world. Colour follows the same
 * masks that carved the floor (ledges, ridges, terraces, sediment), with
 * irregular strata and patch noise instead of one global sine band, so slopes
 * read as geology rather than a repeated shader pattern. Alpha 0 marks loose
 * sediment (the cel pass adds its fine ripple there); rock and land use 1, so
 * the ripple never stripes cliffs or island slopes. */
const C = {
  reefSand: hex("#b9d7b2"), reefSand2: hex("#a3c7a7"), reefRock: hex("#65958e"), reefAlgae: hex("#8fb38a"),
  grass: hex("#81966e"), grass2: hex("#6c8a60"), moss: hex("#77967c"), basalt: hex("#376b73"), basaltDark: hex("#2c5560"),
  shore: hex("#eed6a0"), wetRock: hex("#4f7a78"), cliffBand: hex("#5c7f7e"), shoal: hex("#c4d9ae"), shoal2: hex("#a5c6a6"),
  canopy: hex("#2e616c"), canopy2: hex("#3a6e72"), canopyRib: hex("#23505a"), lichen: hex("#3f7a6f"),
  pale: hex("#9dbcb4"), pale2: hex("#b2cbc1"), trough: hex("#7fa3a0"), ridge: hex("#4f807c"), ridge2: hex("#628f88"),
  ledge: hex("#c4d2c6"), ledge2: hex("#a9bdb4"), shoulder: hex("#6d878a"), wall: hex("#465c66"), trench: hex("#2c3a45"),
  warm: hex("#6b4a3c"),
  slate: hex("#4d5873"), slate2: hex("#5f6b88"), fracture: hex("#353c55"), crystal: hex("#9aa9cc"),
  brineFloor: hex("#3a3d58"), salt: hex("#c8c6d4"),
  paving: hex("#7e8b8b"), paving2: hex("#939f9a"), worn: hex("#6b7878"), terraceWall: hex("#55636a"), marking: hex("#c99a4a"),
  escarp: hex("#3b5060"), escarp2: hex("#4c6372"),
} as const;

/** Pick one of three shades per irregular stratum (no periodic stripe). */
function stratum(x: number, y: number, z: number, thickness: number, seed: number, a: Rgb, b: Rgb, c: Rgb): Rgb {
  const warped = y + 7 * fbm(x, z, 90, 2, seed) + 2.5 * fbm(x, z, 23, 2, seed + 5);
  const band = Math.floor(warped / thickness), k = hash2(band, 0, seed);
  return k < -0.3 ? a : k < 0.4 ? b : c;
}

export function geologyColor(x: number, y: number, z: number, slope: number, region: string, m: TerrainMasks, out: number[]): void {
  const patch = fbm(x, z, 42, 3, 901), fine = fbm(x, z, 9, 2, 902);
  const steep = smooth(0.55, 1.1, slope);
  let c: Rgb, ground = false;
  switch (region) {
    case "island_chain": {
      if (y > 1.5) {
        const veg = mix(patch > 0.05 ? C.grass : C.grass2, C.moss, smooth(-0.2, 0.4, fine) * 0.5);
        const rock = stratum(x, y, z, 3.2, 11, C.basalt, C.cliffBand, C.basaltDark);
        c = mix(veg, rock, Math.max(steep, smooth(60, 80, y) * 0.4));
      } else if (y > -1.6) c = mix(C.shore, C.wetRock, steep);
      else { c = mix(patch > 0.2 ? C.shoal2 : C.shoal, C.wetRock, steep); ground = steep < 0.3; }
      break;
    }
    case "suspended_garden": {
      c = mix(patch > 0.15 ? C.canopy2 : C.canopy, C.lichen, smooth(0.3, 0.7, fine) * 0.4);
      c = mix(c, stratum(x, y, z, 2.6, 21, C.canopyRib, C.lichen, C.canopy), Math.max(steep, m.rib * 0.8));
      ground = steep < 0.3 && m.rib < 0.3;
      if (m.escarpment > 0.3) c = mix(c, C.escarp, m.escarpment);
      break;
    }
    case "silt_basin": {
      const sed = mix(patch > 0.1 ? C.pale2 : C.pale, C.trough, smooth(0.1, 0.6, fine) * 0.6);
      const rock = stratum(x, y, z, 4, 31, C.ridge, C.ridge2, C.wall);
      c = mix(sed, rock, Math.max(steep, m.ridge * 0.55));
      ground = steep < 0.35 && m.ridge < 0.5;
      if (y > -150) c = mix(C.reefSand2, c, smooth(-60, -150, y));
      if (m.pinnacle > 0) {
        // W2 hub spur: limestone strata on the flanks, jade and shell reef caps.
        const flank = stratum(x, y, z, 3.5, 35, C.reefRock, C.ridge2, C.wall);
        const cap = mix(mix(patch > 0.1 ? C.reefSand : C.reefAlgae, C.reefSand2, smooth(-0.2, 0.5, fine) * 0.5), C.reefRock, steep * 0.6);
        c = mix(c, mix(flank, cap, m.reefCap), m.pinnacle);
        ground = m.reefCap > 0.5 && steep < 0.25;
      }
      break;
    }
    case "thermal_rift": {
      const pale = stratum(x, y, z, 3, 41, C.ledge, C.ledge2, C.shoulder);
      const wall = stratum(x, y, z, 6, 42, C.wall, C.shoulder, C.trench);
      c = mix(pale, wall, Math.max(steep, 1 - m.ledge));
      c = mix(c, C.trench, m.trench * 0.85);
      c = mix(c, C.warm, m.trench * smooth(-470, -530, y) * smooth(0, 0.6, fine + 0.3));
      ground = steep < 0.3 && m.trench < 0.2 && m.ledge < 0.2;
      break;
    }
    case "brine_divide": {
      const rock = stratum(x, y, z, 5, 51, C.slate, C.slate2, C.fracture);
      c = mix(rock, C.crystal, smooth(0.55, 0.9, fine) * (1 - steep) * smooth(-345, -385, y) * (y > -440 ? 1 : 0));
      if (y < -440) { c = mix(C.brineFloor, C.salt, smooth(0.2, 0.7, patch) * 0.6); ground = steep < 0.4; }
      if (m.serviceLedge > 0.5 && steep < 0.35) c = mix(C.worn, C.marking, smooth(0.86, 1, Math.sin(x * 0.5) * 0.5 + 0.5) * 0.7);
      break;
    }
    case "deep_district": {
      if (m.terrace > 0.5 && steep < 0.5) {
        const slabX = Math.floor(x / 14), slabZ = Math.floor(z / 14), k = hash2(slabX, slabZ, 61);
        c = mix(C.paving, C.paving2, 0.35 + 0.25 * k);
        c = mix(c, C.worn, smooth(0.1, 0.7, fine) * 0.55 + smooth(0.3, 0.8, patch) * 0.25);
      } else c = m.escarpment > 0.4 ? stratum(x, y, z, 7, 62, C.escarp, C.escarp2, C.wall) : mix(C.terraceWall, C.worn, smooth(0, 0.6, fine));
      break;
    }
    default: {
      c = mix(patch > 0 ? C.reefSand : C.reefSand2, C.reefAlgae, smooth(0.25, 0.7, fine) * 0.5);
      c = mix(c, C.reefRock, steep);
      ground = steep < 0.3;
    }
  }
  // Small value variation so neighbouring facets never read as one flat sheet.
  const k = 1 + fine * 0.05;
  out.push(c[0] * k, c[1] * k, c[2] * k, ground ? 0 : 1);
}
