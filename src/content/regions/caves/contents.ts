import type { Vec3 } from "../../../world/types.js";

/** What the CA-1 Reef and Isles caves hold, as typed placements (Babylon-free,
 * not wired). Every entry names the content-bible proposal it places
 * (`src/content/proposals/reef.ts`, `isles.ts`): a resource, species,
 * side-reward or lost-site id, or the cave's own id for contents the bible
 * gives only as prose. Required materials are never cave-only: each resource
 * item here also has registry sources outside every cave
 * (tests/caves-reef-isles-suite.ts). */

export type CaveContentKind = "resource" | "resident" | "find";
export type CaveContentSurface = "floor" | "wall" | "ceiling" | "water";

export interface CaveContent {
  readonly id: string;
  readonly cave: string;
  readonly room: string;
  readonly kind: CaveContentKind;
  /** The bible proposal id this places. */
  readonly ref: string;
  /** Material for a resource pocket. */
  readonly item?: string;
  /** World point on the surface it sits on, or in the water a resident spawns in. */
  readonly at: Vec3;
  readonly on: CaveContentSurface;
  /** Short design note. Not player text. */
  readonly note: string;
}

const c = (id: string, cave: string, room: string, kind: CaveContentKind, ref: string, on: CaveContentSurface,
  at: readonly [number, number, number], note: string, item?: string): CaveContent =>
  ({ id, cave, room: `${cave}.${room}`, kind, ref, on, at: { x: at[0], y: at[1], z: at[2] }, note, ...(item ? { item } : {}) });

export const REEF_CAVE_CONTENTS: readonly CaveContent[] = [
  c("reef_archlet.glimmers", "reef_archlet", "tunnel", "resident", "vault_glimmer", "ceiling", [-452.25, -17, 99.75],
    "Glimmer mats on the tunnel's low ceiling, leaning toward both foot mouths."),
  c("reef_archlet.slate", "reef_archlet", "tunnel", "find", "reef_archlet", "wall", [-454.25, -20.25, 95.75],
    "A dive-school slate bolted to the wall, depth marks scratched down it."),
  c("reef_bellhole.glimmers", "reef_bellhole", "dome", "resident", "vault_glimmer", "ceiling", [-447.25, -15, 67.75],
    "The reef's densest glimmer mats, crowning the bell."),
  c("reef_bellhole.locker", "reef_bellhole", "dome", "find", "reef.dive_school_locker", "floor", [-446.25, -24.5, 65.75],
    "The dive-school locker (side reward): reserve cells and the cave-signals card."),
  c("reef_wrackhollow.catch", "reef_wrackhollow", "catch", "resource", "reef_wrackhollow_membrane", "floor", [-492.25, -23.5, 119.75],
    "Sheds piled against the back wall by the current through the west mouth.", "flex_membrane"),
  c("reef_wrackhollow.glimmers", "reef_wrackhollow", "catch", "resident", "vault_glimmer", "ceiling", [-499.25, -17.5, 118.75],
    "Mats on the catch's ceiling, leaning west to the current mouth."),
  c("reef_pumphouse_undercut.crust", "reef_pumphouse_undercut", "pipe_gap", "resource", "reef_pumphouse_crust", "wall", [-359.25, -21.75, -32.75],
    "Crust fins on the old intake grating by the pipe gap: a frontier sample.", "conductive_crust"),
  c("fanvault.pocket_catch", "fanvault", "pocket", "resource", "reef_fanvault_pocket_membrane", "floor", [-304.25, -24.5, -64.75],
    "The accepted Fanvault's catch pocket, placed here so every Reef cave resource is typed.", "flex_membrane"),
  c("reef_shelf_lip.glimmers", "reef_shelf_lip", "room", "resident", "vault_glimmer", "ceiling", [-344.25, -37.5, -119.25],
    "Mats under the overhang, leaning to the wide mouth."),
  c("reef_shelf_lip.nodules", "reef_shelf_lip", "room", "find", "reef_shelf_lip", "floor", [-341.25, -43.5, -121.25],
    "Glass nodules scoured clean by the down-slope current: dressing, no stock in the bible."),
  c("reef_shelf_lip.view", "reef_shelf_lip", "overhang", "find", "reef.slope_view", "water", [-344.75, -42.25, -126.25],
    "The framed view: from the overhang the slope falls away blue to black."),
  c("reef_gully_window.bolts", "reef_gully_window", "room", "find", "reef_gully_window", "wall", [-199.25, -60.25, -163.25],
    "A survey bolt line run along the wall, pointing south: the map hint to the hub spur."),
  c("reef_lantern_grotto.glass", "reef_lantern_grotto", "gallery", "resource", "reef_grotto_glass", "wall", [-495.75, -47.75, -116.25],
    "Glass nodules weathering out of the gallery wall.", "silica_glass"),
  c("reef_lantern_grotto.glimmers", "reef_lantern_grotto", "glimmer_hall", "resident", "vault_glimmer", "ceiling", [-469.25, -42, -123.25],
    "The glimmer hall's ceiling: the brightest mats on the reef, over the Dart turning bay."),
  c("reef_drop_cathedral.glimmers", "reef_drop_cathedral", "arch_hall", "resident", "vault_glimmer", "ceiling", [-278.25, -47, -152.25],
    "Mats high in the arch hall. None below the well: the gully chamber is lamp-only."),
];

export const ISLES_CAVE_CONTENTS: readonly CaveContent[] = [
  c("isles_scar_crawl.clappers", "isles_scar_crawl", "upper_pocket", "resident", "tide_clapper", "wall", [367.25, -22.25, 52.75],
    "A first few clappers on the fresh basalt; nothing else has settled yet."),
  c("isles_surf_cave.glass", "isles_surf_cave", "back", "resource", "isles_surf_cave_glass", "floor", [539.25, -12, 111.75],
    "Nodules lying loose on the pale floor the surge scours.", "silica_glass"),
  c("isles_surf_cave.clappers", "isles_surf_cave", "back", "resident", "tide_clapper", "ceiling", [539.25, -6.5, 111.75],
    "The clapper colony on the polished ceiling."),
  c("isles_cove_undercut.resin", "isles_cove_undercut", "undercut", "resource", "isles_cove_ceiling_resin", "ceiling", [968.25, -10.5, -57.25],
    "Resin floats: it lodges in the ceiling pockets the eddy fills.", "buoyant_resin"),
  c("isles_cove_undercut.clappers", "isles_cove_undercut", "undercut", "resident", "tide_clapper", "wall", [961.25, -13.75, -56.25],
    "Clappers banding the undercut's west end."),
  c("isles_cove_crawl.tin", "isles_cove_crawl", "crawl", "find", "isles_cove_crawl", "floor", [985.75, -19.5, -61.25],
    "A sealed float tin wedged at the bend: two navigation beacons."),
  c("isles_headland_root.rootglow", "isles_headland_root", "crack", "find", "isles_headland_root", "ceiling", [1015.75, -26.5, -71.25],
    "Canopy root tips breaking through the crack's roof, glowing with rootglow buds."),
  c("isles_headland_root.clappers", "isles_headland_root", "crack", "resident", "tide_clapper", "wall", [1015.75, -30.25, -71.75],
    "Clappers on the crack's upper walls, thinning toward the Canopy."),
  c("isles_east_ledge_cave.float", "isles_east_ledge_cave", "undercut", "find", "isles_east_ledge_cave", "floor", [1141.75, -22, 40.75],
    "A storm-tossed survey float wedged at the back of the undercut."),
  c("isles_east_ledge_cave.clappers", "isles_east_ledge_cave", "undercut", "resident", "tide_clapper", "wall", [1149.75, -20.25, 37.25],
    "Clappers along the lip side of the undercut."),
  c("isles_blowhole.stash", "isles_blowhole", "ledge", "find", "isles.blowhole_stash", "floor", [1070.25, 0, 131.25],
    "The dry-ledge stash (side reward): meals and two beacons, above the waterline."),
  c("isles_blowhole.clappers", "isles_blowhole", "surge", "resident", "tide_clapper", "wall", [1071.75, -14.25, 129.75],
    "Clappers ahead of the surge in the blowhole's throat."),
  c("isles_storm_arch.glass", "isles_storm_arch", "gallery", "resource", "isles_arch_glass", "wall", [1158.75, -15.75, 87.75],
    "Large clear nodules weathering out of the gallery wall.", "silica_glass"),
  c("isles_storm_arch.float", "isles_storm_arch", "skylight_hall", "find", "isles.arch_float", "floor", [1159.75, -18, 111.75],
    "The storm-wrecked float (cache) under the skylight crack."),
  c("isles_storm_arch.clappers", "isles_storm_arch", "skylight_hall", "resident", "tide_clapper", "wall", [1150.75, -14.25, 105.75],
    "Clappers banding the skylight hall's west wall."),
  c("isles_headland_west.shelf", "isles_headland_west", "shingle", "find", "isles_headland_west", "floor", [951.25, -1.5, -1.25],
    "The shingle bank: a wave-washed shelf a metre and a half down, outpost-suitable, lit through the beach mouth."),
  c("isles_headland_west.clappers", "isles_headland_west", "waterline_hall", "resident", "tide_clapper", "wall", [938.25, -6.25, 11.75],
    "Clappers along the waterline hall's west wall."),
];

export const CAVE_CONTENTS: readonly CaveContent[] = [...REEF_CAVE_CONTENTS, ...ISLES_CAVE_CONTENTS];
