import type { RegionId } from "../../content/registry.js";
import { regionAtPoint } from "../../content/regions/layout.js";
import { smooth } from "../../content/regions/noise.js";

/** PROPOSAL for the coordinator's `updateOpticalUniforms`: per-region water
 * colour and haze for the authored regions, so each reads differently at
 * depth and vistas carry 150-250 m. Today's Reef/Canopy/Basin optics stay as
 * they are inside the legacy area; these take over outside it. */
export const REGION_OPTICS: Readonly<Record<RegionId, { readonly water: string; readonly deep: string; readonly density: number }>> = {
  refuge_reef: { water: "#237e89", deep: "#0b3048", density: 0.0105 },
  island_chain: { water: "#2a8a8f", deep: "#14485a", density: 0.0095 },
  suspended_garden: { water: "#1f6f7a", deep: "#0c2f45", density: 0.0095 },
  silt_basin: { water: "#4f807c", deep: "#3b6a6c", density: 0.0085 },
  thermal_rift: { water: "#2d4f5c", deep: "#3a2f34", density: 0.0075 },
  brine_divide: { water: "#203d5c", deep: "#1a2347", density: 0.0055 },
  deep_district: { water: "#14324f", deep: "#071a2e", density: 0.0062 },
};

/** Water fog colour (hex pair to blend) and density at a camera position. */
export function opticsAt(x: number, y: number, z: number): { water: string; deep: string; density: number; depthMix: number } {
  const o = REGION_OPTICS[regionAtPoint(x, z) ?? "refuge_reef"];
  return { ...o, depthMix: smooth(20, 420, -y) };
}
