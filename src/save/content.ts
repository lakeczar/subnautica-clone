import type { GameState } from "../sim/types.js";
import { createGame } from "../sim/state.js";
import { createStory } from "../sim/story/index.js";
import { createEcology } from "../sim/ecology/ecology.js";
import { BERTH_LOCAL, carrierCompartmentContainers, emptySockets, localToWorld } from "../sim/carrier.js";
import { ITEMS } from "../content/registry.js";
import { usedCapacity } from "../sim/inventory.js";
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
  const fields = addNewFields({ ...state, world, inventory } as GameState, template);
  return fields.ok ? { ok: true, value: fields.value } : fields;
}

const SCHEMA5_CARRIER_HOLD_CU = 256;
/** The starboard compact berth's x before C3 widened the carrier walkway. */
const OLD_STARBOARD_X = 3;
/** Fields added since schema 5 whose absence means exactly their first state:
 * no schema 5 build could record a later story discovery, hint, works step,
 * resolution or carrier socket occupant. `story` and `docking.sockets` start at
 * New Game's value. A carrier's single 256 CU hold becomes its 192 CU stores
 * plus empty pantry and fabrication compartments, refused if its contents do
 * not fit the stores. `world.ecology` and `player.lamp` start at New Game's
 * value. Anything present is left for strict validation. */
function addNewFields(state: GameState, template: GameState): { ok: true; value: GameState } | { ok: false; error: string } {
  const out = { ...state } as GameState & Record<string, unknown>;
  if (!Object.hasOwn(out, "story")) out.story = createStory();
  // C3: S4's ecology and lamp switch. No earlier build could hold an encounter,
  // deterrent or exposure, so their absence is exactly New Game's state.
  if (record(out.world) && !Object.hasOwn(out.world, "ecology"))
    out.world = newGameOrder({ ...out.world, ecology: createEcology() }, template.world);
  // CR-1: fish traps. No earlier build could hold one, so none is New Game's state.
  if (record(out.systems) && !Object.hasOwn(out.systems, "traps"))
    out.systems = newGameOrder({ ...out.systems, traps: [] }, template.systems) as GameState["systems"];
  if (record(out.player) && !Object.hasOwn(out.player, "lamp"))
    out.player = newGameOrder({ ...out.player, lamp: true }, template.player);
  const fleet = out.fleet as unknown;
  if (record(fleet) && record(fleet.docking) && !Object.hasOwn(fleet.docking, "sockets"))
    out.fleet = { ...out.fleet, docking: { ...out.fleet.docking!, sockets: emptySockets() } };
  // C3 widened the compact walkway: the starboard berth datum moved from x 3 to
  // its current value. A berth saved at the old datum is that same berth.
  const docked = out.fleet as unknown;
  if (record(docked) && record(docked.docking) && Array.isArray(docked.vehicles)) {
    const h = (docked.vehicles as GameState["fleet"]["vehicles"]).find((v) => record(v) && v.id === (docked.docking as { vehicleId?: unknown }).vehicleId);
    if (h && record(h.pose)) out.fleet = { ...out.fleet, vehicles: out.fleet.vehicles.map((v) =>
      record(v) && record(v.berth) && v.berth.slot === 1 && record(v.berth.pose) && record(v.berth.pose.position) && v.berth.pose.position.x === OLD_STARBOARD_X
        ? { ...v, berth: { ...v.berth, pose: { ...v.berth.pose, position: { ...BERTH_LOCAL[1]! } } },
            pose: { ...v.pose, position: localToWorld(BERTH_LOCAL[1]!, h) } }
        : v) };
  }
  const inv = out.inventory as unknown;
  if (!record(inv) || !Array.isArray(inv.containers) || !Array.isArray(inv.items) || !record(fleet) || !Array.isArray(fleet.vehicles))
    return { ok: true, value: out };
  let containers = inv.containers as GameState["inventory"]["containers"];
  for (const v of fleet.vehicles as GameState["fleet"]["vehicles"]) {
    if (!record(v) || v.hull !== "hearthline") continue;
    const hold = containers.find((c) => record(c) && c.id === v.cargoId);
    if (!hold || hold.capacity !== SCHEMA5_CARRIER_HOLD_CU) continue;
    // The authority's total over the known items (strict validation refuses the rest after).
    const known = (inv.items as unknown[]).filter((i) => record(i) && typeof i.kind === "string" && Object.hasOwn(ITEMS, i.kind));
    const used = usedCapacity({ inventory: { items: known } } as unknown as GameState, hold.id);
    const split = carrierCompartmentContainers(v), stores = SCHEMA5_CARRIER_HOLD_CU - split.reduce((n, c) => n + c.capacity, 0);
    if (used > stores)
      return { ok: false, error: `This carrier hold holds ${used} CU, more than its ${stores} CU stores. Move cargo out in the build that wrote it. Nothing was loaded.` };
    containers = [...containers.map((c) => c === hold ? { ...c, capacity: stores } : c),
      ...split.filter((c) => !containers.some((k) => record(k) && k.id === c.id))];
  }
  out.inventory = { ...out.inventory, containers };
  return { ok: true, value: newGameOrder(out, template) };
}
/** New Game's key order, so a completed old save writes the same bytes as a new one.
 * Unknown keys stay, last, for strict validation to refuse. */
function newGameOrder<T extends object>(value: T, template: object): T {
  const keys = [...Object.keys(template).filter((k) => Object.hasOwn(value, k)), ...Object.keys(value).filter((k) => !Object.hasOwn(template, k))];
  return Object.fromEntries(keys.map((k) => [k, (value as Record<string, unknown>)[k]])) as T;
}
const pick = (o: Partial<Record<Roster, unknown[]>>, keys: Roster[]) =>
  Object.fromEntries(keys.filter((k) => o[k]).map((k) => [k, o[k]]));
