import type { GameState } from "../sim/types.js";
import { createGame } from "../sim/state.js";
import { record } from "./validation.js";

/** Content-roster entries every schema 5 save contains: New Game's rosters when
 * schema 5 was cut. A schema 5 save may lack only content added after this, which
 * loads with New Game's first state. Reset these lists at the next schema bump. */
const SCHEMA5_ROSTERS = {
  resources: ["reef_service_scraps_east", "reef_service_scraps_west", "reef_glass_ridge_north", "reef_glass_ridge_south",
    "reef_ribbon_catch_north", "reef_ribbon_catch_south", "island_workshop_scraps", "island_headland_scraps",
    "island_glass_ledge_east", "island_glass_ledge_west", "island_resin_cove_east", "island_resin_cove_west",
    "canopy_grounding_fins_upper", "canopy_grounding_fins_lower", "canopy_resin_lee_upper", "canopy_resin_lee_lower",
    "reef_edible_school_north", "reef_edible_school_south", "island_shore_crop_east", "island_shore_crop_west",
    "basin_ridge_salvage_north", "basin_ridge_salvage_south", "basin_survey_fins_east", "basin_survey_fins_west",
    "canopy_ribbon_margin_north", "canopy_ribbon_margin_south", "basin_frame_ridge", "basin_frame_terrace", "basin_frame_fracture"],
  renewal: ["reef_ribbon_catch_north", "reef_ribbon_catch_south", "canopy_resin_lee_upper", "canopy_resin_lee_lower"],
  facilities: ["home_pod", "pod_fabricator", "island_workshop", "canopy_lab", "canopy_stop"],
  containers: ["diver", "equipment", "pod_locker", "workshop_locker", "buoy_hold", "canopy_stop_locker"],
} as const;

type Entry = { id: string };
type Roster = keyof typeof SCHEMA5_ROSTERS;

/** Inserts New Game's entry for each roster ID added since schema 5, after the
 * nearest preceding New Game entry the save holds, so a canonical save gains New
 * Game's order. `null`: the roster is malformed or duplicated; strict validation
 * refuses it unchanged. */
function addMissing(saved: unknown, template: readonly Entry[], base: readonly string[]): unknown[] | null {
  if (!Array.isArray(saved) || !saved.every((e) => record(e) && typeof e.id === "string")) return null;
  const out = [...saved] as Entry[], ids = new Set(out.map((e) => e.id));
  if (ids.size !== out.length) return null;
  let at = -1;
  for (const entry of template) {
    const found = out.findIndex((e) => e.id === entry.id);
    if (found >= 0) { at = found; continue; }
    if (base.includes(entry.id)) continue; // Present since schema 5: its absence is corruption.
    out.splice(++at, 0, structuredClone(entry));
  }
  return out;
}

/** Additive content needs no schema bump: content IDs added after a save was
 * written start at New Game's first state, once, on load. IDs this build does not
 * know (never added, or since removed) refuse. Changed meaning needs a bump. */
export function addNewContent(state: GameState): { ok: true; value: GameState } | { ok: false; error: string } {
  if (!record(state)) return { ok: true, value: state };
  const template = createGame();
  const rosters: [Roster, unknown, readonly Entry[], boolean][] = [
    ["resources", state.world?.resources, template.world.resources, true],
    ["renewal", state.world?.renewal, template.world.renewal, true],
    ["facilities", state.world?.facilities, template.world.facilities, true],
    // Vehicle holds, caches and cabin lockers are per-game, not roster content.
    ["containers", state.inventory?.containers, template.inventory.containers, false],
  ];
  const next: Partial<Record<Roster, unknown[]>> = {};
  for (const [name, saved, entries, closed] of rosters) {
    const out = addMissing(saved, entries, SCHEMA5_ROSTERS[name]);
    if (!out) continue;
    const unknown = closed && (out as Entry[]).find((e) => !entries.some((t) => t.id === e.id));
    if (unknown)
      return { ok: false, error: `This save names ${name} content this build does not have (${JSON.stringify(unknown.id).slice(0, 82)}). It may come from a newer or different build. Nothing was loaded.` };
    next[name] = out;
  }
  const world = record(state.world) ? { ...state.world, ...pick(next, ["resources", "renewal", "facilities"]) } : state.world;
  const inventory = record(state.inventory) && next.containers ? { ...state.inventory, containers: next.containers } : state.inventory;
  return { ok: true, value: { ...state, world, inventory } as GameState };
}
const pick = (o: Partial<Record<Roster, unknown[]>>, keys: Roster[]) =>
  Object.fromEntries(keys.filter((k) => o[k]).map((k) => [k, o[k]]));
