/** C4: sources composed with the systems stage.
 * - CB's frontier deposits (docs/content/BIBLE.md, "The tier rule"): the
 *   shallowest workable frames at 150 m, core at 350 m and lattice at 450 m,
 *   each exactly at the previous tier's limit.
 * - SYS-2's seed patches for planters, on the composed floor.
 * Additive content: New Game stock, loaded once into older saves. Each frontier
 * datum is exactly at its tier limit (150, 350, 450 m), 0.3–1.5 m above the
 * composed floor; CB marks the 350 m ledges for a terrain pad later (W3). */
import type { SourceDefinition } from "./registry.js";
import { SYS2_SOURCES } from "./systems/items.js";

export const FRONTIER_SOURCES = {
  canopy_rim_frames: {
    label: "Tether-anchor frames", region: "suspended_garden", position: { x: 374, y: -150, z: -193 },
    item: "tagged_frame", stock: 4, reserve: 0, bundle: 1,
    context: "Tagged anchor frames dropped from a crown tether onto the Canopy's south rim, right at the 150 m suit's limit.",
    scan: "The shallowest tagged frames in the basin. Each still carries its tag and its full alloy.",
    asset: "scraps",
  },
  // C4: a second first-access frame patch on the same rim. With one, losing it
  // would leave no frame a 150 m suit can work before the 350 m refit; the
  // campaign ledger requires every first need to survive the loss of one deposit.
  canopy_rim_frames_east: {
    label: "East rim anchor frames", region: "suspended_garden", position: { x: 488, y: -150, z: -188 },
    item: "tagged_frame", stock: 3, reserve: 0, bundle: 1,
    context: "More anchor frames from the same fallen tether, further east along the 150 m rim.",
    scan: "The tether ran east along the rim; its frames lie where they fell.",
    asset: "scraps",
  },
  rift_core_lower_north: {
    label: "North lower ledge", region: "thermal_rift", position: { x: 12, y: -350, z: -744 },
    item: "thermal_core", stock: 8, reserve: 6, bundle: 1,
    context: "The shoulder's thin inclusions thicken down the cool wall; at the 350 m ledge they are workable. Fans stay open: no heat.",
    scan: "Thick core nodes in still, cool water. This is the first ledge where core can be cut.",
    asset: "core",
  },
  rift_core_lower_west: {
    label: "West lower ledge", region: "thermal_rift", position: { x: -264, y: -350, z: -1130 },
    item: "thermal_core", stock: 8, reserve: 6, bundle: 1,
    context: "A cut ledge on the west wall at 350 m, well outside the warm passage; dark nodes thick in still water.",
    scan: "A second workable core ledge, independent of the north one.",
    asset: "core",
  },
  divide_lattice_flank_north: {
    label: "North flank ledge", region: "brine_divide", position: { x: 958, y: -450, z: -1128 },
    item: "brine_lattice", stock: 12, reserve: 8, bundle: 2,
    context: "Clear water falls past the ridge's east end into the deep; thick crystal fans line the 450 m ledge. No brine field this far north.",
    scan: "Workable lattice at the edge of a 450 m rating. No chemical protection is needed in this clear water.",
    asset: "lattice",
  },
  divide_lattice_flank_south: {
    label: "South flank ledge", region: "brine_divide", position: { x: 914, y: -450, z: -1244 },
    item: "brine_lattice", stock: 12, reserve: 8, bundle: 2,
    context: "A second 450 m flank ledge, north of the brine field's edge; sails cross above it.",
    scan: "A second lattice ledge in clear water above the brine field.",
    asset: "lattice",
  },
} as const satisfies Record<string, SourceDefinition>;

/** SYS-2's seed patches, each datum lowered to 0.8 m above the composed floor
 * like the other sources, so the patch sits on the bed in reach. The floor is the
 * support surface: on the spur's second step that is the glimmer crack's kit (LS-1). */
const SEED_FLOOR = {
  reef_staple_cuttings: -8.09, reef_ribbon_cuttings: -10.36, island_salve_fronds: -5.58,
  canopy_lumen_bulbs: -133.25, basin_pale_spores: -180.08,
  hub_racks_cups: -38.5, hub_racks_fans: -48, hub_racks_fronds: -48.5, rift_kiln_tubers: -251.4,
} as const satisfies Record<keyof typeof SYS2_SOURCES, number>;
export const SEED_SOURCES = Object.fromEntries((Object.keys(SYS2_SOURCES) as (keyof typeof SYS2_SOURCES)[]).map((id) => {
  const s = SYS2_SOURCES[id];
  return [id, { ...s, position: { ...s.position, y: Math.round((SEED_FLOOR[id] + 0.8) * 100) / 100 } }];
})) as { readonly [K in keyof typeof SYS2_SOURCES]: (typeof SYS2_SOURCES)[K] & SourceDefinition };

export const C4_SOURCES = { ...FRONTIER_SOURCES, ...SEED_SOURCES } as const;

/** CB's first workable deposits of each late material (the tier rule's frontier):
 * the lips for ceramic, the 350 m lower ledges for core, the 450 m flank for lattice. */
export const FIRST_WORKABLE = {
  pressure_ceramic: ["rift_ceramic_lip_north", "rift_ceramic_lip_south"],
  thermal_core: ["rift_core_lower_north", "rift_core_lower_west"],
  brine_lattice: ["divide_lattice_flank_north", "divide_lattice_flank_south"],
} as const;
