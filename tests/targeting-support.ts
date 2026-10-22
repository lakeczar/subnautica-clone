import assert from "node:assert/strict";
import { RECIPES, SOURCES, type ItemKind } from "../src/content/registry.js";
import { BASIN_GEOMETRY, BASIN_SOURCE_IDS, RECOVERY_SURFACE_OPERATOR } from "../src/content/routes.js";
import { createGame, eyeHeight } from "../src/sim/state.js";
import { completeOpening, craft, discover, interactions } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { createWorldQueries } from "../src/sim/world.js";
import { validState } from "../src/save/validation.js";
import { interactionHost } from "../src/sim/targeting.js";
import { recordStory } from "../src/sim/storyLink.js";
import type { GameState, MovementMode, Vec3 } from "../src/sim/types.js";

export function readyState(): GameState {
  const s = createGame(); completeOpening(s); return s;
}
/** Explicit funded diagnostic, not earned traversal. Uses real paid prerequisites
 * and an in-place refit, with valid receipts/IDs. readyState() stays unequipped. */
export function protectedReadyState(limit: 150 | 350 | 800): GameState {
  const s = readyState(), pose = structuredClone(s.player.pose), world = createWorldQueries();
  discover(s, "C02");
  const ids = limit === 150 ? ["pod_repair", "essential_tools", "suit_150"] as const
    : limit === 350 ? ["pod_repair", "essential_tools", "suit_150", "restore_workshop", "suit_350"] as const
    : ["pod_repair", "essential_tools", "suit_150", "restore_workshop", "suit_350", "suit_450", "suit_800"] as const;
  if (limit !== 150) { discover(s, "C03"); discover(s, "C04"); }
  // The 450/800 m refits: the cool-flank and deep-service plans (S9).
  if (limit === 800) { discover(s, "C06"); recordStory(s, "C07"); }
  for (const id of ids) {
    const recipe = RECIPES[id];
    if (recipe.site === "island_workshop") s.player.pose.position = { x: 10, y: 1.2, z: -34 };
    for (const [kind, quantity] of Object.entries(recipe.cost))
      addItem(s, kind as ItemKind, quantity, id === "restore_workshop" ? "diver"
        : recipe.site === "island_workshop" ? "workshop_locker" : "pod_locker");
    assert.equal(craft(s, id, world), null, id);
  }
  s.player.pose = pose;
  assert.ok(validState(s), "protected targeting fixture has real equipment and matching receipts");
  return s;
}
/** Real look limits, from the instantaneous eye to the actual host. */
export function faceTarget(s: GameState, id: string): void {
  const t = interactions(s).find(t => t.id === id);
  if (!t) throw new Error(`Unknown test host ${id}`);
  const h = interactionHost(s, t), p = s.player.pose.position;
  const x = h.center.x - p.x, y = h.center.y - p.y - eyeHeight(s), z = h.center.z - p.z;
  s.player.pose.yaw = (Math.atan2(x, -z) + 2 * Math.PI) % (2 * Math.PI);
  s.player.pose.pitch = Math.max(-1.35, Math.min(1.35, Math.atan2(y, Math.hypot(x, z))));
}

/** Collision-checked normal views, not source-datum/inside-solid shortcuts. */
export const NORMAL_VIEWS: readonly { id: string; position: Vec3; mode: MovementMode }[] = [
  { id: "reef_service_scraps_east", position: { x: -7.232233, y: -11.5, z: -7.767767 }, mode: "swimming" },
  { id: "reef_service_scraps_west", position: { x: -30.232233, y: -27.5, z: -18.767767 }, mode: "swimming" },
  { id: "reef_glass_ridge_north", position: { x: -6, y: -8, z: 2.5 }, mode: "swimming" },
  { id: "reef_glass_ridge_south", position: { x: -25, y: -22, z: -19.5 }, mode: "swimming" },
  { id: "reef_ribbon_catch_north", position: { x: -15, y: -10, z: 3.5 }, mode: "swimming" },
  { id: "reef_ribbon_catch_south", position: { x: -33, y: -25, z: -21.5 }, mode: "swimming" },
  { id: "island_workshop_scraps", position: { x: 8, y: 1.2, z: -32.5 }, mode: "walking" },
  { id: "island_headland_scraps", position: { x: 32, y: -17, z: -37.5 }, mode: "swimming" },
  { id: "island_glass_ledge_east", position: { x: 28, y: -9.5, z: -22.5 }, mode: "swimming" },
  { id: "island_glass_ledge_west", position: { x: -14, y: -22.5, z: -40 }, mode: "swimming" },
  { id: "island_resin_cove_east", position: { x: 35, y: -10, z: -29.5 }, mode: "swimming" },
  { id: "island_resin_cove_west", position: { x: -15.834936, y: -20, z: -37.25 }, mode: "swimming" },
  { id: "canopy_grounding_fins_upper", position: { x: 93, y: -90, z: -93.5 }, mode: "swimming" },
  { id: "canopy_grounding_fins_lower", position: { x: 136, y: -130, z: -132.5 }, mode: "swimming" },
  { id: "canopy_resin_lee_upper", position: { x: 101, y: -100, z: -99.5 }, mode: "swimming" },
  { id: "canopy_resin_lee_lower", position: { x: 144, y: -140, z: -140.5 }, mode: "swimming" },
  { id: "reef_edible_school_north", position: { x: 4, y: -2, z: 5.5 }, mode: "swimming" },
  { id: "reef_edible_school_south", position: { x: -4, y: -3, z: 8.5 }, mode: "swimming" },
  { id: "island_shore_crop_east", position: { x: 13, y: 1.2, z: -32.5 }, mode: "walking" },
  { id: "island_shore_crop_west", position: { x: 5, y: 1.2, z: -35.5 }, mode: "walking" },
  { id: "C01", position: { x: 0, y: 0.18, z: 21.2 }, mode: "walking" },
  { id: "C02", position: { x: -17, y: -7, z: -5.5 }, mode: "swimming" },
  { id: "C03", position: { x: 10, y: 1.2, z: -36.3 }, mode: "walking" },
  { id: "C04", position: { x: 116, y: -118, z: -125.3 }, mode: "walking" },
  { id: "mara_reef_note", position: { x: -24, y: -8, z: -6.5 }, mode: "swimming" },
  // C1 story fixtures at existing sites: the pod's back-wall checklist and the lab bench tray.
  { id: "pod_checklist", position: { x: 0.2, y: 0.18, z: 22.6 }, mode: "walking" },
  { id: "mara_specimen_tray", position: { x: 117.3, y: -118, z: -125.5 }, mode: "walking" },
  { id: "pod_services", position: { x: 1.5, y: 0.18, z: 23 }, mode: "walking" },
  { id: "workshop_services", position: { x: 11, y: 1.2, z: -36.5 }, mode: "walking" },
  { id: "rescue_staging", position: { x: 46, y: -12, z: -51.5 }, mode: "swimming" },
  ...BASIN_SOURCE_IDS.map(id => ({ id, position: { ...SOURCES[id].position, z: SOURCES[id].position.z + 2.5 }, mode: "swimming" as const })),
  { id: "C05", position: { ...BASIN_GEOMETRY.dormitory.workPose }, mode: "swimming" },
  { id: "C06", position: { ...BASIN_GEOMETRY.station.workPose }, mode: "swimming" },
  // Additional view of the same stable host; keep the submerged M1 pose above.
  { id: "rescue_staging", position: { ...RECOVERY_SURFACE_OPERATOR, z: RECOVERY_SURFACE_OPERATOR.z + 2.5 }, mode: "swimming" },
  // M2-B1 hosts: margin nets from clear water west of each ledge, frame stacks
  // from just above their ledges, the keel plate and the mooring deck.
  { id: "canopy_ribbon_margin_north", position: { x: 220.6, y: -121.6, z: -130 }, mode: "swimming" },
  { id: "canopy_ribbon_margin_south", position: { x: 234.4, y: -127.6, z: -178 }, mode: "swimming" },
  { id: "basin_frame_ridge", position: { x: 226, y: -169.6, z: -203 }, mode: "swimming" },
  { id: "basin_frame_terrace", position: { x: 190, y: -196.6, z: -249 }, mode: "swimming" },
  { id: "basin_frame_fracture", position: { x: 196, y: -260.6, z: -290 }, mode: "swimming" },
  { id: "basin_keel_plate", position: { x: 172, y: -197.9, z: -253 }, mode: "swimming" },
  { id: "canopy_stop_services", position: { x: 204, y: -137.9, z: -147.2 }, mode: "swimming" },
  // C3: hosts S9 and C3 lifted from S2 sites, found by a collision-checked search
  // and fixed here (clear body, aimed host, clear sight line, successful interact).
  {id: "rift_ceramic_lip_north", position: {x: 98.1, y: -257.4, z: -965.9}, mode: "swimming"},
  {id: "rift_ceramic_lip_south", position: {x: -4.3, y: -265.4, z: -1090.2}, mode: "swimming"},
  {id: "rift_ceramic_deep_seam", position: {x: -229.5, y: -397.4, z: -1150}, mode: "swimming"},
  {id: "rift_core_shoulder_north", position: {x: -95.1, y: -289.4, z: -747.7}, mode: "swimming"},
  {id: "rift_core_shoulder_west", position: {x: -304.6, y: -288.4, z: -1043.2}, mode: "swimming"},
  {id: "rift_core_plume_seam", position: {x: -123.5, y: -429.4, z: -1084}, mode: "swimming"},
  {id: "divide_lattice_ledge_west", position: {x: 339, y: -365.4, z: -1188.5}, mode: "swimming"},
  {id: "divide_lattice_ledge_east", position: {x: 751.5, y: -374.4, z: -1191}, mode: "swimming"},
  {id: "divide_lattice_fissure", position: {x: 522.5, y: -479.4, z: -1360}, mode: "swimming"},
  {id: "meridian_cut_ceramic", position: {x: 1172.5, y: -603.4, z: -1396}, mode: "swimming"},
  {id: "meridian_service_cache", position: {x: 1152.5, y: -519.4, z: -1103.8}, mode: "swimming"},
  {id: "isles_stack_glass_east", position: {x: 540.5, y: -0.9, z: 100}, mode: "swimming"},
  {id: "isles_stack_resin_cove", position: {x: 410.5, y: -2.9, z: 48}, mode: "swimming"},
  {id: "isles_headland_crops", position: {x: 1004.8, y: 15.103, z: -4.7}, mode: "walking"},
  {id: "isles_headland_resin_cove", position: {x: 966.9, y: -2.4, z: -37.9}, mode: "swimming"},
  {id: "isles_headland_glass_ledge", position: {x: 1122.8, y: -0.9, z: 117}, mode: "swimming"},
  {id: "canopy_east_resin_lee", position: {x: 670.5, y: -167.4, z: -232}, mode: "swimming"},
  {id: "canopy_east_fins", position: {x: 590.5, y: -163.4, z: -168}, mode: "swimming"},
  {id: "basin_dish_fins", position: {x: 464.5, y: -267.4, z: -544}, mode: "swimming"},
  {id: "basin_wreck_frames_north", position: {x: 782.5, y: -253.4, z: -444}, mode: "swimming"},
  {id: "basin_wreck_panels_south", position: {x: 785.5, y: -255.4, z: -612}, mode: "swimming"},
  {id: "canopy_glider_log", position: {x: 648.5, y: -165.4, z: -178}, mode: "swimming"},
  {id: "yard_tender_plate", position: {x: 451.5, y: 3.945, z: 62}, mode: "walking"},
  // C3: S5 records and works faces placed at S2 sites, by the same search.
  {id: "gantry_plates", position: {x: 467.5, y: -5.64, z: 102}, mode: "swimming"},
  {id: "fin_survey_post", position: {x: 139.9, y: -134.05, z: -135.8}, mode: "swimming"},
  {id: "basin_service_rack", position: {x: 165.5, y: -165.94, z: -206}, mode: "swimming"},
  {id: "rift_station_ledger", position: {x: 139.5, y: -260.4, z: -913.6}, mode: "swimming"},
  {id: "C07", position: {x: 630.5, y: -364.3, z: -1236}, mode: "swimming"},
  {id: "ren_access_log", position: {x: 633, y: -364.3, z: -1244}, mode: "swimming"},
  {id: "C12", position: {x: 572.5, y: -393.92, z: -1252}, mode: "swimming"},
  {id: "C11", position: {x: 986.81, y: 10, z: -5.443}, mode: "walking"},
  {id: "mara_last_page", position: {x: 985.8, y: 10, z: -6.4}, mode: "walking"},
  {id: "C08", position: {x: 1002.5, y: -598.34, z: -1406}, mode: "swimming"},
  {id: "C10", position: {x: 1281.5, y: -678.47, z: -1396}, mode: "swimming"},
  {id: "iona_ledger_note", position: {x: 1284, y: -678.48, z: -1396}, mode: "swimming"},
  {id: "C09", position: {x: 1398.5, y: -767.2, z: -1595.4}, mode: "swimming"},
  {id: "gate_panel", position: {x: 1402.6, y: -767, z: -1585.5}, mode: "swimming"},
  {id: "C13", position: {x: 1432.5, y: -768.46, z: -1560}, mode: "swimming"},
  {id: "district_controller", position: {x: 1435.5, y: -768.47, z: -1560}, mode: "swimming"},
  {id: "works:hall", position: {x: 1296.5, y: -598.72, z: -1145}, mode: "swimming"},
  {id: "works:food", position: {x: 1304.5, y: -598.7, z: -1146}, mode: "swimming"},
  // C4: CB's frontier deposits, SYS-2's seed patches, main-path plan records and
  // CB's lost sites, found by the same collision-checked search.
  {id: "canopy_rim_frames", position: {x: 375.8, y: -149.7, z: -191.2}, mode: "swimming"},
  {id: "canopy_rim_frames_east", position: {x: 490.3, y: -149.7, z: -187}, mode: "swimming"},
  {id: "rift_core_lower_north", position: {x: 13.8, y: -349.7, z: -742.2}, mode: "swimming"},
  {id: "rift_core_lower_west", position: {x: -262.2, y: -349.7, z: -1128.2}, mode: "swimming"},
  {id: "divide_lattice_flank_north", position: {x: 959.8, y: -449.7, z: -1126.2}, mode: "swimming"},
  {id: "divide_lattice_flank_south", position: {x: 914, y: -449.7, z: -1241.5}, mode: "swimming"},
  {id: "reef_staple_cuttings", position: {x: 6, y: -7, z: 7.5}, mode: "swimming"},
  {id: "reef_ribbon_cuttings", position: {x: -14, y: -9.3, z: 5.5}, mode: "swimming"},
  {id: "island_salve_fronds", position: {x: 22, y: -4.5, z: -25.5}, mode: "swimming"},
  {id: "canopy_lumen_bulbs", position: {x: 105, y: -132.1, z: -101.7}, mode: "swimming"},
  {id: "workshop_outpost_sheet", position: {x: 12, y: 1.2, z: -35}, mode: "walking"},
  {id: "workshop_decoder_rack", position: {x: 14, y: 1.2, z: -34.5}, mode: "walking"},
  {id: "canopy_lab_outpost_sheet", position: {x: 117.5, y: -116.7, z: -122}, mode: "swimming"},
  {id: "basin_station_outpost_frame", position: {x: 217.5, y: -170.5, z: -239.5}, mode: "swimming"},
  {id: "lost:reef_pumphouse_site", position: {x: -380, y: -23, z: -17.5}, mode: "swimming"},
  {id: "lost:isles_strain_gauges", position: {x: 345, y: -44.9, z: 72.5}, mode: "swimming"},
  {id: "lost:canopy_basket_site", position: {x: 762.3, y: -108.1, z: -99}, mode: "swimming"},
  {id: "lost:basin_pump_heads_site", position: {x: 240, y: -259.7, z: -757.5}, mode: "swimming"},
  {id: "lost:rift_borehole_site", position: {x: -420, y: -250.9, z: -897.5}, mode: "swimming"},
  {id: "lost:divide_mixing_site", position: {x: 880, y: -378.7, z: -1147.5}, mode: "swimming"},
  {id: "lost:meridian_allotments_site", position: {x: 1150, y: -599.5, z: -1247.5}, mode: "swimming"},
  {id: "basin_pale_spores", position: {x: 212.5, y: -179, z: -220}, mode: "swimming"},
  // CR-1: creature grounds, residents' shed, protected egg cases and fall salvage,
  // found by the same collision-checked search.
  {id: "reef_fish_ribs", position: {x: -26, y: -6.7, z: 6}, mode: "swimming"},
  {id: "isles_fish_split", position: {x: 472, y: -3.2, z: 88}, mode: "swimming"},
  {id: "basin_fish_ridge", position: {x: 772, y: -254.6, z: -530}, mode: "swimming"},
  {id: "hub_fish_crown", position: {x: 296, y: -59.7, z: -560}, mode: "swimming"},
  {id: "reef_roe_nursery", position: {x: -194, y: -15.5, z: 44}, mode: "swimming"},
  {id: "isles_roe_cove", position: {x: 952, y: -9.4, z: -30}, mode: "swimming"},
  {id: "canopy_roe_crowns", position: {x: 128, y: -103.7, z: -96}, mode: "swimming"},
  {id: "reef_shed_moults", position: {x: -156, y: -12.8, z: -18}, mode: "swimming"},
  {id: "isles_shed_shells", position: {x: 1127, y: -12.9, z: 20}, mode: "swimming"},
  {id: "canopy_weaver_resin", position: {x: 692, y: -122.9, z: -128}, mode: "swimming"},
  {id: "rift_mite_grit", position: {x: -60, y: -305, z: -1046}, mode: "swimming"},
  {id: "basin_scavenger_casts", position: {x: 802, y: -255.4, z: -600}, mode: "swimming"},
  {id: "rift_crawler_moults", position: {x: 132, y: -305.2, z: -800}, mode: "swimming"},
  {id: "divide_picker_moults", position: {x: 428, y: -358.5, z: -1200}, mode: "swimming"},
  {id: "meridian_scavenger_casts", position: {x: 1172, y: -525.9, z: -1080}, mode: "swimming"},
  {id: "divide_skate_eggcases", position: {x: 426, y: -383.3, z: -1146}, mode: "swimming"},
  {id: "hub_ray_eggcases", position: {x: 332, y: -70.2, z: -596}, mode: "swimming"},
  {id: "fall_basin_west_hide", position: {x: 526, y: -294.1, z: -476}, mode: "swimming"},
  {id: "fall_basin_west_bone", position: {x: 518, y: -298.1, z: -485}, mode: "swimming"},
  {id: "fall_basin_east_hide", position: {x: 705, y: -243.6, z: -384}, mode: "swimming"},
  {id: "fall_divide_lee_crust", position: {x: 425, y: -388.3, z: -1126}, mode: "swimming"},
  {id: "fall_divide_lee_bone", position: {x: 418, y: -386.7, z: -1134}, mode: "swimming"},
];
