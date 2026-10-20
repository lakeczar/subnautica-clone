import type { RegionId } from "../registry.js";

/** Provisional anchors for later regions, in world metres (Y up, water Y=0).
 * Every ecology spawn, hazard field and first deposit below is expressed
 * relative to one of these IDs, so S2's authored layout replaces this single
 * table without touching behavior data. Depths follow WORLD_PROGRESSION:
 * ceramic 250–285 m on the cool flank, core 280–320 m on inactive shoulders,
 * lattice 360–390 m on flushed outer ledges above the dense layer. */
export const ECOLOGY_SITES = {
  canopy_crown: { region: "suspended_garden", position: { x: 112, y: -106, z: -116 } },
  basin_wreck_ridge: { region: "silt_basin", position: { x: 190, y: -168, z: -226 } },
  rift_cool_flank: { region: "thermal_rift", position: { x: -40, y: -262, z: -470 } },
  rift_inactive_shoulder: { region: "thermal_rift", position: { x: 30, y: -300, z: -480 } },
  rift_split_chimney: { region: "thermal_rift", position: { x: 90, y: -330, z: -500 } },
  divide_outer_ledge: { region: "brine_divide", position: { x: 300, y: -376, z: -560 } },
  divide_saddle: { region: "brine_divide", position: { x: 360, y: -420, z: -600 } },
  district_gallery: { region: "deep_district", position: { x: 560, y: -610, z: -700 } },
} as const satisfies Record<string, { region: RegionId; position: { x: number; y: number; z: number } }>;
export type EcologySiteId = keyof typeof ECOLOGY_SITES;

export interface SiteOffset {
  readonly site: EcologySiteId;
  readonly offset: { readonly x: number; readonly y: number; readonly z: number };
}
export const at = (site: EcologySiteId, x = 0, y = 0, z = 0): SiteOffset => ({ site, offset: { x, y, z } });
export function sitePosition(p: SiteOffset): { x: number; y: number; z: number } {
  const o = ECOLOGY_SITES[p.site].position;
  return { x: o.x + p.offset.x, y: o.y + p.offset.y, z: o.z + p.offset.z };
}
