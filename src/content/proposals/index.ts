/** CB proposals, gathered. Not imported by the game. */
import { BASIN } from "./basin.js";
import { CANOPY } from "./canopy.js";
import { DIVIDE } from "./divide.js";
import { HUB } from "./hub.js";
import { ISLES } from "./isles.js";
import { MERIDIAN } from "./meridian.js";
import { REEF } from "./reef.js";
import { RIFT } from "./rift.js";
import type { AreaId, AreaProposal, CaveBiomeId } from "./types.js";

export const AREAS: readonly AreaProposal[] = [REEF, ISLES, CANOPY, HUB, BASIN, RIFT, DIVIDE, MERIDIAN];
export const areaOf = (id: AreaId): AreaProposal | undefined => AREAS.find(a => a.area === id);

/** Where each area and cave biome is written up. */
export const DOCS: { readonly areas: Readonly<Record<AreaId, string>>; readonly biomes: Readonly<Record<CaveBiomeId, string>> } = {
  areas: {
    refuge_reef: "docs/content/regions/hearth-reef.md",
    island_chain: "docs/content/regions/splitspine-isles.md",
    suspended_garden: "docs/content/regions/lantern-canopy.md",
    silt_basin: "docs/content/regions/pale-basin.md",
    thermal_rift: "docs/content/regions/ember-rift.md",
    brine_divide: "docs/content/regions/mirror-divide.md",
    deep_district: "docs/content/regions/meridian.md",
    hub_spur: "docs/content/regions/hub-spur.md",
  },
  biomes: {
    isles_undercroft: "docs/content/caves/isles-tidal-caves.md",
    canopy_rootways: "docs/content/caves/canopy-root-caves.md",
    basin_ridge_vaults: "docs/content/caves/basin-vault-complex.md",
    rift_divide_seam: "docs/content/caves/rift-divide-seam.md",
  },
};

export { CAVE_BIOMES } from "./caveBiomes.js";
export { RECIPE_SNAPSHOTS, REQUIRED_CLUES, REQUIRED_SOURCES, SOURCE_CHANGES, STORY_SITE_PLACEMENTS, TIER_STEPS, TRANSITIONS } from "./progression.js";
export type { RequiredClue, RequiredSource, SourceChange, TierStep, Transition } from "./progression.js";
export { SPECIES, SPECIES_IDS } from "./species.js";
export { ELSEWHERE_PLANS, NEW_PLANS, PROPOSED_PLAN_IDS, REJECTED_MATERIALS, SEEDS } from "./blueprints.js";
export type * from "./types.js";
