import { PALETTE as P } from "../palette.js";
import { RecipeBuilder, rgba, type P3 } from "./recipe.js";
import type { TemplateRecipe } from "./types.js";

/** Shared vegetation and rubble templates, local space with the base at the
 * origin. Fine and coarse are the same silhouette at different tessellation;
 * coarse keeps the outline and drops interior detail. Placeholders for S2's
 * regional species, sized like today's reef life. */

function frond(fine: boolean): RecipeBuilder {
  const b = new RecipeBuilder(), segs = fine ? 9 : 3, h = 6;
  const stalk: P3[] = Array.from({ length: segs + 1 }, (_, i) => [Math.sin(i * 0.7) * 0.25, (i / segs) * h, Math.cos(i * 0.5) * 0.15]);
  b.tube(stalk, stalk.map((_, i) => 0.09 * (1 - i / (segs + 2))), rgba(P.petrol, 1.4), fine ? 5 : 3);
  for (const a of fine ? [0, 2.1, 4.2] : [0, 3.14]) {
    const left: P3[] = [], right: P3[] = [];
    for (let i = 1; i <= segs; i++) {
      const t = i / segs, s = stalk[i]!, w = 0.55 * Math.sin(t * Math.PI) + 0.08;
      left.push([s[0], s[1], s[2]]);
      right.push([s[0] + Math.cos(a) * w, s[1] - 0.25, s[2] + Math.sin(a) * w]);
    }
    b.ribbon(left, right, Array.from({ length: segs }, (_, i) => rgba(i % 2 ? P.jade : P.lime, 1.3)));
  }
  return b;
}

function fan(fine: boolean): RecipeBuilder {
  const b = new RecipeBuilder(), ribs = fine ? 9 : 4;
  b.tube([[0, 0, 0], [0.05, 0.6, 0], [0, 1.1, 0]], 0.07, rgba(P.amber, 1.2), fine ? 5 : 3);
  // Hub-to-rim triangles in a gently cupped plane facing +Z.
  const hub = b.vertex([0, 1.05, 0], [0, 0, 1], rgba(P.coralRim, 1));
  const rim = Array.from({ length: ribs + 1 }, (_, i) => {
    const a = -1.2 + (i / ribs) * 2.4;
    return b.vertex([Math.sin(a) * 1.4, 1.05 + Math.cos(a) * 1.3, Math.sin(a * 2) * 0.12 - 0.15],
      [Math.sin(a) * 0.2, 0.1, 1], rgba(i % 2 ? P.coral : P.coralRim, 1.5));
  });
  for (let i = 0; i < ribs; i++) b.triangle(hub, rim[i]!, rim[i + 1]!);
  return b;
}

function sponge(fine: boolean): RecipeBuilder {
  const b = new RecipeBuilder(), sides = fine ? 7 : 4;
  for (const [x, z, h] of fine ? [[0, 0, 1.6], [0.35, 0.2, 1.1], [-0.3, 0.25, 0.8]] as const : [[0, 0, 1.6]] as const) {
    const pts: P3[] = fine ? [[x, 0, z], [x, h * 0.5, z + 0.05], [x, h, z]] : [[x, 0, z], [x, h, z]];
    b.tube(pts, fine ? [0.22, 0.26, 0.2] : [0.26, 0.22], rgba(P.violet, 1.3), sides);
    b.ellipsoid([x, h, z], [0.2, 0.05, 0.2], rgba(P.plum, 1), sides);
  }
  return b;
}

function rocks(fine: boolean): RecipeBuilder {
  const b = new RecipeBuilder(), seg = fine ? 8 : 4;
  b.ellipsoid([0, 0.35, 0], [1.1, 0.7, 0.9], rgba(P.basalt, 1.3), seg);
  if (fine) b.ellipsoid([0.9, 0.2, 0.5], [0.6, 0.4, 0.5], rgba(P.stoneLight, 1.2), seg);
  return b;
}

function bulb(fine: boolean): RecipeBuilder {
  const b = new RecipeBuilder();
  b.tube([[0, 0, 0], [0.1, 0.5, 0], [0, 0.9, 0.05]], 0.03, rgba(P.petrol, 1), fine ? 4 : 3);
  // Alpha -1: the cel shader's unlit path, so bulbs read as light in the deep.
  b.ellipsoid([0, 0.98, 0.05], [0.14, 0.16, 0.14], rgba(P.warm, -1), fine ? 8 : 4);
  return b;
}

const MAKERS: Record<string, (fine: boolean) => RecipeBuilder> = {
  "frond.tall": frond, "fan.coral": fan, "sponge.tube": sponge, "rock.cluster": rocks, "bulb.glow": bulb,
};
export const TEMPLATE_IDS = Object.keys(MAKERS);

export function templateRecipes(): TemplateRecipe[] {
  return Object.entries(MAKERS).map(([id, make]) => ({
    id, fine: make(true).build(`${id}.fine`), coarse: make(false).build(`${id}.coarse`),
  }));
}

/** Template mix per biome: [template, weight, min depth, max depth]. */
export const BIOME_MIX: Readonly<Record<string, readonly (readonly [string, number])[]>> = {
  reef_shelf: [["fan.coral", 3], ["frond.tall", 2], ["sponge.tube", 2], ["rock.cluster", 2]],
  island_shoal: [["rock.cluster", 4], ["frond.tall", 2], ["fan.coral", 1]],
  canopy_crown: [["frond.tall", 6], ["bulb.glow", 1], ["rock.cluster", 1]],
  silt_bowl: [["rock.cluster", 3], ["sponge.tube", 2], ["bulb.glow", 1]],
  thermal_fracture: [["rock.cluster", 4], ["sponge.tube", 2], ["bulb.glow", 2]],
  brine_saddle: [["rock.cluster", 3], ["bulb.glow", 3], ["sponge.tube", 1]],
  research_terrace: [["rock.cluster", 2], ["bulb.glow", 3], ["sponge.tube", 1]],
};
