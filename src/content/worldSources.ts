/** C3: S2's remaining source sites lifted into the registry under S2's IDs
 * (S9 lifted the late deposits; see `campaign/sources.ts`). Positions are S2's
 * datums; `context` is S2's observable condition and `scan` names the habitat
 * rule it teaches. `tests/world-sources.test.ts` checks every field against S2's
 * `SITES`, and each datum against the composed floor. Additive content: no
 * save schema change (S7). */
import type { SourceDefinition } from "./registry.js";
import { CAMPAIGN_SOURCES } from "./campaign/sources.js";
import { C4_SOURCES } from "./c4Sources.js";

export const WORLD_SOURCES = {
  // Splitspine Isles: the split stack and the storm-cut headland.
  isles_stack_glass_east: {
    label: "Stack surf ledge glass", region: "island_chain", position: { x: 538, y: -1.5, z: 100 },
    item: "silica_glass", stock: 8, reserve: 8, bundle: 2,
    context: "Grazers scrape the wave-washed east ledge; clear nodules sit in the fresh scars.",
    scan: "Fresh grazer scars expose clean glass. Wave-washed ledges keep the nodules from silting over.",
    asset: "glass",
  },
  isles_stack_resin_cove: {
    label: "Stack lee drift", region: "island_chain", position: { x: 408, y: -3.5, z: 48 },
    item: "buoyant_resin", stock: 6, reserve: 4, bundle: 2,
    context: "Cured resin drifting north off the Canopy fetches up in this sheltered cove.",
    scan: "Still water in a lee collects drifting resin. Coves out of the swell hold the most.",
    asset: "resin",
  },
  isles_headland_crops: {
    label: "Headland shore pods", region: "island_chain", position: { x: 1002.3, y: 13.94, z: -4.7 },
    item: "meal", stock: 8, reserve: 0, bundle: 2,
    context: "Low pod plants grow in the shelter's lee; cut stems regrow without waiting at the plot.",
    scan: "Edible shore pods in the shelter's lee. Tending cut stems brings more on.",
    asset: "food",
  },
  isles_headland_resin_cove: {
    label: "Headland cove drift", region: "island_chain", position: { x: 964.4, y: -3, z: -37.9 },
    item: "buoyant_resin", stock: 6, reserve: 4, bundle: 2,
    context: "The south cove's eddy holds cured resin washed up from the Canopy lee.",
    scan: "An eddy behind the headland traps resin the same way the stack's lee does.",
    asset: "resin",
  },
  isles_headland_glass_ledge: {
    label: "Cliff-foot glass", region: "island_chain", position: { x: 1120.3, y: -1.5, z: 117 },
    item: "silica_glass", stock: 8, reserve: 8, bundle: 2,
    context: "Surf below the storm cliff keeps glass nodules scoured clean.",
    scan: "Surf-scoured glass under the cliff. Like the stack ledge, moving water keeps it clean.",
    asset: "glass",
  },
  // Lantern Canopy, east shelf: the mooring bowl's rib and its lee.
  canopy_east_resin_lee: {
    label: "Mooring lee resin", region: "suspended_garden", position: { x: 668, y: -168, z: -232 },
    item: "buoyant_resin", stock: 8, reserve: 4, bundle: 2,
    context: "Mature float bladders above shed cured nodules into the still pocket behind the rib.",
    scan: "Float bladders shed cured resin into still pockets, as on the upper Canopy.",
    asset: "resin",
  },
  canopy_east_fins: {
    label: "Mooring rib fins", region: "suspended_garden", position: { x: 588, y: -164, z: -168 },
    item: "conductive_crust", stock: 8, reserve: 4, bundle: 2,
    context: "Grounding fins under the holdfasts crust over where the rib stands clear of drifting silt.",
    scan: "Crust grows where grounding fins stand clear of silt, as on the upper Canopy's fins.",
    asset: "crust",
  },
  // Pale Basin: the dish field and the wreck ridge.
  basin_dish_fins: {
    label: "Dish frame fins", region: "silt_basin", position: { x: 462, y: -268, z: -544 },
    item: "conductive_crust", stock: 10, reserve: 6, bundle: 2,
    context: "Crust grows on grounding fins of the dish frames that stand above the silt line.",
    scan: "Dish frames above the silt line carry crust; buried frames carry none.",
    asset: "crust",
  },
  basin_wreck_frames_north: {
    label: "Bulk wreck frames", region: "silt_basin", position: { x: 780, y: -254, z: -444 },
    item: "structural_alloy", stock: 30, reserve: 12, bundle: 6,
    context: "Scavengers emerge beside frames that stay clear of the silt; heavy frames reward powered handling.",
    scan: "Scavengers feed only beside stable wreckage. Where they emerge, the frames stay clear of surges.",
    asset: "scraps",
  },
  basin_wreck_panels_south: {
    label: "Ridge loose panels", region: "silt_basin", position: { x: 783, y: -256, z: -612 },
    item: "structural_alloy", stock: 20, reserve: 8, bundle: 4,
    context: "Loose tagged panels lie where the ridge shields them from sediment surges.",
    scan: "The ridge shields loose panels from the plume lanes on either side.",
    asset: "scraps",
  },
} as const satisfies Record<string, SourceDefinition>;
export type WorldSourceId = keyof typeof WORLD_SOURCES;
/** Every source standing at an S2 site (S9's and C3's lifts). Their art is the
 * proximity-streamed placed-host layer (render/placedHosts.ts), never a legacy
 * region owner's. */
export const PLACED_SOURCE_IDS: ReadonlySet<string> = new Set([...Object.keys(CAMPAIGN_SOURCES), ...Object.keys(WORLD_SOURCES),
  ...Object.keys(C4_SOURCES)]);
