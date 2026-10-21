import type { RegionId } from "../../registry.js";

/** How the CA-1 caves join up (data only). A `link` is a crawl crossing the
 * shared edge between two caves' footprints: both sources list its carve, and
 * the rock on each side is owned by its own cave. Every link has a swept link
 * route and rescue routes (exit routes from inside the crawl to open water).
 * `apron` joins are through a few metres of open water; `pending` joins wait
 * for a cave biome; `omitted` were judged unsafe and left out. */

export interface CaveLink {
  readonly id: string;
  readonly between: readonly [string, string];
  /** The shared footprint edge the crawl crosses: X = at for "x", Z = at for "z". */
  readonly seam: { readonly axis: "x" | "z"; readonly at: number };
  /** Rooms of the crawl on each side (not counted toward a small cave's size). */
  readonly rooms: readonly string[];
  readonly route: string;
  readonly rescue: readonly string[];
  readonly note: string;
}
export interface CaveJoin { readonly kind: "apron" | "pending" | "omitted"; readonly ref: string; readonly note: string }
export interface CaveNetwork {
  readonly id: string;
  readonly region: RegionId;
  readonly caves: readonly string[];
  readonly links: readonly CaveLink[];
  readonly joins: readonly CaveJoin[];
}

export const CAVE_NETWORKS: readonly CaveNetwork[] = [
  { id: "colonnade", region: "refuge_reef", caves: ["reef_archlet", "reef_bellhole", "reef_wrackhollow"], links: [
    { id: "colonnade.wrack", between: ["reef_archlet", "reef_wrackhollow"], seam: { axis: "x", at: -487 },
      rooms: ["reef_archlet.west_crawl", "reef_archlet.sinkhole", "reef_wrackhollow.crawl"], route: "reef_archlet.route.wrack",
      rescue: ["reef_archlet.route.sinkhole", "reef_wrackhollow.route.crawl_rescue"],
      note: "40 m crawl under a rubble spine; the Sinkhole halfway is its daylight and its way up." },
    { id: "colonnade.bell", between: ["reef_bellhole", "reef_archlet"], seam: { axis: "z", at: 84 },
      rooms: ["reef_bellhole.crawl", "reef_archlet.east_crawl"], route: "reef_bellhole.route.archlet",
      rescue: ["reef_bellhole.route.crawl_rescue"], note: "28 m crawl under the open shelf between two arch feet." },
  ], joins: [] },
  { id: "fanvault", region: "refuge_reef", caves: ["fanvault", "reef_fan_crawl", "reef_shelf_lip"], links: [
    { id: "fanvault.lip", between: ["reef_fan_crawl", "reef_shelf_lip"], seam: { axis: "x", at: -326 },
      rooms: ["reef_fan_crawl.lip_crawl", "reef_shelf_lip.crawl"], route: "reef_fan_crawl.route.lip",
      rescue: ["reef_fan_crawl.route.squeeze_back", "reef_shelf_lip.route.crawl_rescue"],
      note: "From the squeeze's foot down the shelf break into the Shelf lip." },
  ], joins: [
    { kind: "apron", ref: "fanvault.mouth.south", note: "The Fan crawl's apron mouth faces the Fanvault's south mouth across 4 m of open apron; the accepted Fanvault is not rebuilt." },
  ] },
  { id: "gully", region: "refuge_reef", caves: ["reef_drop_cathedral", "reef_gully_window"], links: [], joins: [
    { kind: "omitted", ref: "reef_drop_cathedral->reef_gully_window",
      note: "The bible's diver crawl east from the gully chamber would climb some 30 m under the gully floor at 90 m and cross the " +
        "Basin route corridor; the open gully already joins the two mouths, 25 m apart. Left out as unsafe." },
  ] },
  { id: "scar", region: "island_chain", caves: ["isles_scar_crawl"], links: [], joins: [
    { kind: "pending", ref: "isles_undercroft.scar_mouth", note: "The upper pocket's mouth opens toward the Undercroft's scar-mouth zone: its back entrance once the Undercroft is built." },
  ] },
  { id: "cove", region: "island_chain", caves: ["isles_cove_undercut", "isles_cove_crawl", "isles_headland_root"], links: [
    { id: "cove.undercut", between: ["isles_cove_undercut", "isles_cove_crawl"], seam: { axis: "x", at: 980 },
      rooms: ["isles_cove_undercut.crawl", "isles_cove_crawl.crawl"], route: "isles_cove_crawl.route.slope",
      rescue: ["isles_cove_crawl.route.rescue"], note: "Under the cove's south rim to the slope mouth." },
    { id: "cove.root", between: ["isles_cove_crawl", "isles_headland_root"], seam: { axis: "x", at: 1004 },
      rooms: ["isles_cove_crawl.root_crawl", "isles_headland_root.crawl"], route: "isles_headland_root.route.cove",
      rescue: ["isles_headland_root.route.crack", "isles_cove_crawl.route.rescue"], note: "Down under the saddle into the root stair." },
  ], joins: [
    { kind: "pending", ref: "canopy_rootways.back_stair", note: "The root stair's foot is the back stair into the Canopy rootways (LC builds the rootways)." },
  ] },
];

/** A medium cave's chamber graph as the bible's `ac40de9` passages, each
 * realised by the portals it runs through. */
export interface MediumCaveGraph {
  readonly cave: string;
  /** Bible chamber name -> this cave's rooms. */
  readonly chambers: Readonly<Record<string, readonly string[]>>;
  /** Bible exit name -> portal id. */
  readonly exits: Readonly<Record<string, string>>;
  /** Bible passage id -> the portals along it, from `from` to `to`. */
  readonly passages: Readonly<Record<string, readonly string[]>>;
  readonly loopCloser: string;
  /** The swept diver route around the loop, and the small-craft route through the hall. */
  readonly loopRoute: string;
  readonly hullRoute: string;
}

export const MEDIUM_CAVE_GRAPHS: readonly MediumCaveGraph[] = [
  { cave: "reef_lantern_grotto", loopCloser: "gallery_climb", loopRoute: "reef_lantern_grotto.route.gallery_loop", hullRoute: "reef_lantern_grotto.route.dart",
    chambers: { "shelf hall": ["reef_lantern_grotto.shelf_hall"], "glimmer hall": ["reef_lantern_grotto.glimmer_hall"], "glass gallery": ["reef_lantern_grotto.gallery"] },
    exits: { "shelf mouth": "reef_lantern_grotto.mouth.shelf", "slope mouth": "reef_lantern_grotto.mouth.slope" },
    passages: {
      shelf_mouth: ["reef_lantern_grotto.mouth.shelf"],
      slope_mouth: ["reef_lantern_grotto.mouth.slope", "reef_lantern_grotto.throat.slope"],
      bend: ["reef_lantern_grotto.throat.bend"],
      gallery_low: ["reef_lantern_grotto.throat.gallery"],
      gallery_climb: ["reef_lantern_grotto.throat.climb", "reef_lantern_grotto.throat.squeeze"],
    } },
  { cave: "reef_drop_cathedral", loopCloser: "chimney", loopRoute: "reef_drop_cathedral.route.chimney_loop", hullRoute: "reef_drop_cathedral.route.dart",
    chambers: { "arch hall": ["reef_drop_cathedral.arch_hall"], "spiral ramp": ["reef_drop_cathedral.spiral"], "gully chamber": ["reef_drop_cathedral.gully_chamber"] },
    exits: { "arch mouth": "reef_drop_cathedral.mouth.arch", "gully mouth": "reef_drop_cathedral.mouth.gully" },
    passages: {
      arch_mouth: ["reef_drop_cathedral.mouth.arch"],
      gully_mouth: ["reef_drop_cathedral.mouth.gully", "reef_drop_cathedral.throat.gully"],
      ramp_top: ["reef_drop_cathedral.throat.ramp_top"],
      ramp_foot: ["reef_drop_cathedral.throat.ramp_foot"],
      chimney: ["reef_drop_cathedral.throat.chimney_foot", "reef_drop_cathedral.throat.chimney_head"],
    } },
  { cave: "isles_storm_arch", loopCloser: "gallery_back", loopRoute: "isles_storm_arch.route.gallery_loop", hullRoute: "isles_storm_arch.route.dart",
    chambers: { "north hall": ["isles_storm_arch.north_hall"], "skylight hall": ["isles_storm_arch.skylight_hall"], "glass gallery": ["isles_storm_arch.gallery"] },
    exits: { "cliff-foot mouth": "isles_storm_arch.mouth.cliff", "east mouth": "isles_storm_arch.mouth.east", "skylight crack": "isles_storm_arch.skylight.crack" },
    passages: {
      cliff_mouth: ["isles_storm_arch.mouth.cliff"],
      east_mouth: ["isles_storm_arch.mouth.east", "isles_storm_arch.throat.east"],
      skylight: ["isles_storm_arch.skylight.crack", "isles_storm_arch.throat.crack"],
      main_hall: ["isles_storm_arch.throat.main"],
      gallery_in: ["isles_storm_arch.throat.gallery_in"],
      gallery_back: ["isles_storm_arch.throat.gallery_back", "isles_storm_arch.throat.back_slot"],
    } },
  { cave: "isles_headland_west", loopCloser: "drip_back", loopRoute: "isles_headland_west.route.drip_loop", hullRoute: "isles_headland_west.route.dart",
    chambers: { "waterline hall": ["isles_headland_west.waterline_hall"], "shingle chamber": ["isles_headland_west.shingle"], "drip room": ["isles_headland_west.drip_room"] },
    exits: { "waterline mouth": "isles_headland_west.mouth.waterline", "south-beach mouth": "isles_headland_west.mouth.beach" },
    passages: {
      waterline_mouth: ["isles_headland_west.mouth.waterline"],
      beach_mouth: ["isles_headland_west.mouth.beach", "isles_headland_west.throat.beach"],
      hall_to_shingle: ["isles_headland_west.throat.hall"],
      shingle_to_drip: ["isles_headland_west.throat.drip_climb", "isles_headland_west.throat.drip"],
      drip_back: ["isles_headland_west.throat.drip_arch", "isles_headland_west.throat.arch"],
    } },
];
