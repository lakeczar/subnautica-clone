import assert from "node:assert/strict";
import { RECIPES, SOURCES, type ItemKind } from "../src/content/registry.js";
import { BASIN_GEOMETRY, BASIN_SOURCE_IDS, RECOVERY_SURFACE_OPERATOR } from "../src/content/routes.js";
import { createGame, eyeHeight } from "../src/sim/state.js";
import { completeOpening, craft, discover, interactions } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { createWorldQueries } from "../src/sim/world.js";
import { validState } from "../src/save/validation.js";
import { interactionHost } from "../src/sim/targeting.js";
import type { GameState, MovementMode, Vec3 } from "../src/sim/types.js";

export function readyState(): GameState {
  const s = createGame(); completeOpening(s); return s;
}
/** Explicit funded diagnostic, not earned traversal. Uses real paid prerequisites
 * and an in-place refit, with valid receipts/IDs. readyState() stays unequipped. */
export function protectedReadyState(limit: 150 | 350): GameState {
  const s = readyState(), pose = structuredClone(s.player.pose), world = createWorldQueries();
  discover(s, "C02");
  const ids = limit === 150 ? ["pod_repair", "essential_tools", "suit_150"] as const
    : ["pod_repair", "essential_tools", "suit_150", "restore_workshop", "suit_350"] as const;
  if (limit === 350) { discover(s, "C03"); discover(s, "C04"); }
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
  { id: "pod_checklist", position: { x: 0.6, y: 0.18, z: 22.4 }, mode: "walking" },
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
];
