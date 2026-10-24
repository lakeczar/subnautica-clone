import type { RegionId } from "../registry.js";

/** Ecology anchors at S2's authored sites and hazard volumes (C3 composition),
 * in world metres (Y up, water Y=0). Every ecology spawn, hazard field and first
 * deposit is expressed relative to one of these IDs. Each names its S2 source:
 * - `canopy_crown`: the upper Canopy crown over today's sound-hunter grounds
 *   (legacy area; the Lantern school's existing art lives here);
 * - `basin_wreck_ridge`: `basin_wreck_panels_south`, the wreck ridge's south end,
 *   beside S2's `hazard.basin.plume_south` lane;
 * - `rift_cool_flank` / `rift_inactive_shoulder`: the first ceramic and core
 *   deposits `rift_ceramic_lip_north` and `rift_core_shoulder_north`;
 * - `rift_split_chimney`: the lip of S2's split chimney (columns' top, Y -300),
 *   inside `hazard.rift.chimney_plume`;
 * - `divide_outer_ledge`: the first lattice deposit `divide_lattice_ledge_west`;
 * - `divide_saddle`: the centre of S2's `hazard.divide.brine_south`, 10 m under
 *   its mirror interface (`BRINE_Y` -440);
 * - `district_gallery`: the terrace before `meridian.gallery_north`. */
export const ECOLOGY_SITES = {
  canopy_crown: { region: "suspended_garden", position: { x: 112, y: -106, z: -116 } },
  basin_wreck_ridge: { region: "silt_basin", position: { x: 783, y: -256, z: -612 } },
  rift_cool_flank: { region: "thermal_rift", position: { x: 95.6, y: -258, z: -965.9 } },
  rift_inactive_shoulder: { region: "thermal_rift", position: { x: -97.6, y: -290, z: -747.7 } },
  rift_split_chimney: { region: "thermal_rift", position: { x: -165, y: -300, z: -1065 } },
  divide_outer_ledge: { region: "brine_divide", position: { x: 336.5, y: -366, z: -1188.5 } },
  divide_saddle: { region: "brine_divide", position: { x: 565, y: -450, z: -1456 } },
  district_gallery: { region: "deep_district", position: { x: 1298, y: -600, z: -1146 } },
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
