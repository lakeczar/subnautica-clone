/** S9 campaign material sources: the three late materials and the district's
 * finite repair cache, lifted from S2's source sites under S2's IDs. Positions are
 * S2's datums (S1 world frame). C3 re-reads them from S2's composed `SITES` when it
 * places the world; until then they lie outside today's playable extent.
 * Context is S2's observable condition; scans explain the habitat rule. */
import type { SourceDefinition } from "../registry.js";

export const CAMPAIGN_SOURCES = {
  // Ember Rift: ceramic on cooled chimney lips, core on inactive shoulders.
  rift_ceramic_lip_north: {
    label: "Cool chimney lip layers",
    region: "thermal_rift",
    position: { x: 95.6, y: -258, z: -965.9 },
    item: "pressure_ceramic",
    stock: 12, reserve: 8, bundle: 2,
    context: "Pale fans stay open on cooled chimney lips; the pale ceramic layers sit where they open.",
    scan: "Open fans mean the lip has cooled. Ceramic layers here need no heat protection to work.",
    asset: "ceramic",
  },
  rift_ceramic_lip_south: {
    label: "Southern lip layers",
    region: "thermal_rift",
    position: { x: -6.8, y: -266, z: -1090.2 },
    item: "pressure_ceramic",
    stock: 12, reserve: 8, bundle: 2,
    context: "A second cooled stub, its lip ringed with open fans and exposed pale layers.",
    scan: "A second cooled lip: independent ceramic stock inside the 350 m envelope.",
    asset: "ceramic",
  },
  rift_ceramic_deep_seam: {
    label: "Deep wall seam",
    region: "thermal_rift",
    position: { x: -232, y: -398, z: -1150 },
    item: "pressure_ceramic",
    stock: 16, reserve: 0, bundle: 2,
    context: "Thick pale strata in the trench wall below the shoulders. Better yield, not first access.",
    scan: "Deeper strata yield more per visit. The lips above already cover the first refit.",
    asset: "ceramic",
  },
  rift_core_shoulder_north: {
    label: "Inactive shoulder inclusions",
    region: "thermal_rift",
    position: { x: -97.6, y: -290, z: -747.7 },
    item: "thermal_core",
    stock: 0, reserve: 0, bundle: 1,
    // CB (C4): scan-only. Too thin to work here; workable core is on the 350 m lower ledge.
    context: "On the quiet north-west shoulder no shimmer rises; thin core inclusions show as dark nodes in the rock.",
    scan: "Core inclusions, too thin to cut here. Followed down the cool wall, the seam thickens at the 350 m lower ledge.",
    asset: "core",
  },
  rift_core_shoulder_west: {
    label: "West shoulder inclusions",
    region: "thermal_rift",
    position: { x: -307.1, y: -289, z: -1043.2 },
    item: "thermal_core",
    stock: 0, reserve: 0, bundle: 1,
    context: "A second inactive shoulder; fans open and the water is still. The inclusions are thin threads.",
    scan: "Too thin to work. The west wall's ledge at 350 m holds the thick nodes.",
    asset: "core",
  },
  rift_core_plume_seam: {
    label: "Plume-side seam",
    region: "thermal_rift",
    position: { x: -126, y: -430, z: -1084 },
    item: "thermal_core",
    stock: 16, reserve: 0, bundle: 2,
    context: "Richer core beside the active chimney. Work it between plume pulses or with thermal protection.",
    scan: "Mites leave the lip before every vent. Read them, or wear heat protection, to work this richer seam.",
    asset: "core",
  },
  // Mirror Divide: rinsed lattice on flushed ledges above the dense layer.
  divide_lattice_ledge_west: {
    label: "West flushed ledge",
    region: "brine_divide",
    position: { x: 336.5, y: -366, z: -1188.5 },
    item: "brine_lattice",
    // CB (C4): one rinsed crystal, a taste. Thick fans grow on the 450 m east flank.
    stock: 1, reserve: 0, bundle: 1,
    context: "One rinsed crystal on the north ledge where the water stays clear above the dense layer.",
    scan: "Brine lattice, rinsed by clear water. Thick fans of it line the 450 m ledges on the Divide's east flank.",
    asset: "lattice",
  },
  divide_lattice_ledge_east: {
    label: "East flushed ledge",
    region: "brine_divide",
    position: { x: 749, y: -375, z: -1191 },
    item: "brine_lattice",
    stock: 1, reserve: 0, bundle: 1,
    context: "Sail animals trace the clear lane over this ledge; a single crystal grows where the flow is steady.",
    scan: "A rinsed crystal, a taste of lattice. The workable ledges are on the 450 m east flank.",
    asset: "lattice",
  },
  divide_lattice_fissure: {
    label: "Protected fissure",
    region: "brine_divide",
    position: { x: 520, y: -480, z: -1360 },
    item: "brine_lattice",
    stock: 20, reserve: 0, bundle: 2,
    context: "Richer crystals deep in a fissure below the mirror. Needs chemical protection; never first access.",
    scan: "Below the mirror the dense water etches seals. Brine seals or a protected hull make this stock workable.",
    asset: "lattice",
  },
  // Meridian District: secondary repair stock with a declared purpose.
  meridian_cut_ceramic: {
    label: "Terrace cut strata",
    region: "deep_district",
    position: { x: 1170, y: -604, z: -1396 },
    item: "pressure_ceramic",
    stock: 16, reserve: 0, bundle: 2,
    context: "Terrace cuts expose pale ceramic strata wherever the old work lamps still burn.",
    scan: "Cut terraces keep repair ceramic near the works. The finale needs nothing found only here.",
    asset: "ceramic",
  },
  meridian_service_cache: {
    label: "Staging service cache",
    region: "deep_district",
    position: { x: 1150, y: -520, z: -1104 },
    item: "structural_alloy",
    stock: 12, reserve: 12, bundle: 4,
    context: "A sealed maintenance cage beside the office; tagged for terrace repairs.",
    scan: "A finite cage of terrace repair stock. It never refills; it exists to save a long haul.",
    asset: "scraps",
  },
} as const satisfies Record<string, SourceDefinition>;
export type CampaignSourceId = keyof typeof CAMPAIGN_SOURCES;

/** S2 site per source (`src/content/regions/sites.ts`), and what working it needs
 * beyond pressure. `first` marks the mandatory first-access deposits (C4: CB moved
 * core's and lattice's to `c4Sources.ts` FIRST_WORKABLE; shoulders and ledges are tastes). */
export const CAMPAIGN_SOURCE_SITES: Readonly<Record<CampaignSourceId, {
  site: string; first: boolean; protection: "heat" | "brine" | null;
}>> = {
  rift_ceramic_lip_north: { site: "rift_ceramic_lip_north", first: true, protection: null },
  rift_ceramic_lip_south: { site: "rift_ceramic_lip_south", first: true, protection: null },
  rift_ceramic_deep_seam: { site: "rift_ceramic_deep_seam", first: false, protection: null },
  rift_core_shoulder_north: { site: "rift_core_shoulder_north", first: false, protection: null },
  rift_core_shoulder_west: { site: "rift_core_shoulder_west", first: false, protection: null },
  // Workable by plume timing too; the ledger counts it only with protection.
  rift_core_plume_seam: { site: "rift_core_plume_seam", first: false, protection: "heat" },
  divide_lattice_ledge_west: { site: "divide_lattice_ledge_west", first: false, protection: null },
  divide_lattice_ledge_east: { site: "divide_lattice_ledge_east", first: false, protection: null },
  divide_lattice_fissure: { site: "divide_lattice_fissure", first: false, protection: "brine" },
  meridian_cut_ceramic: { site: "meridian_cut_ceramic", first: false, protection: null },
  meridian_service_cache: { site: "meridian_service_cache", first: false, protection: null },
};
