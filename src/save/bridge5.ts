/** Schema 5 / expedition.6 → schema 6 / expedition.7 (C4). The one meaning that
 * changed, and the two content facts whose saved values a new build would
 * otherwise refuse:
 * - **Hull protections are fitted.** Under schema 5 a hull heat lining, hull
 *   brine seals or trim vanes protected the hull whose hold carried them. Now
 *   they are SYS-1 upgrades fitted to a slot. Each carried one is fitted to its
 *   hull's free slot, so the save keeps the protection it had; one with no free
 *   slot stays as cargo, and the migration note says so.
 * - **The content bible's tier rule** turned the 290 m core shoulders into
 *   scan-only sites and the Divide flushed ledges into one-crystal samples. A
 *   saved stock above the new size is clamped to it (the frontier ledges, new
 *   in this version, start full).
 * - **Hull frames** keep their paid value: where a build recipe now takes a
 *   tagged frame or core in place of alloy, the hull's recorded investment
 *   becomes the current recipe's, so salvage returns what the build costs now.
 * Additive state (the systems slice, flares, upgrade runtimes, bio feeds)
 * starts at New Game's value. A schema 5 save that already holds any schema 6
 * field is refused: no schema 5 build could write one. */
import { HULLS, RECIPES, REFIT_TIERS, SOURCES } from "../content/registry.js";
import type { HullId, RecipeId } from "../content/registry.js";
import { createSystems } from "../sim/systems/state.js";
import { initialRuntime } from "../sim/upgrades/tools.js";
import { HULL_SLOTS } from "../content/upgrades/catalogue.js";
import type { UpgradeId } from "../content/upgrades/catalogue.js";
import { slotOf } from "../sim/upgrades/fitting.js";
import type { GameState } from "../sim/types.js";
import { record } from "./validation.js";

const HULL_PROTECTIONS = ["hull_heat_lining", "hull_brine_seals", "trim_vanes"] as const;
const BUILD = {
  dart: ["dart_base"], creel: ["creel_base"], hush: ["hush_base"], spindle: ["spindle_base"], mantle: ["mantle_base"],
  hearthline: ["hearthline_keel", "hearthline_base"],
} as const satisfies Record<HullId, readonly RecipeId[]>;

export type BridgeResult = { ok: true; value: GameState } | { ok: false; error: string };

/** Fields only schema 6 writes; their presence in a schema 5 save is corruption. */
function schema6Field(s: Record<string, unknown>): string | null {
  if (Object.hasOwn(s, "systems")) return "systems";
  if (record(s.world) && Object.hasOwn(s.world, "flares")) return "world.flares";
  const fleet = s.fleet;
  if (record(fleet) && Array.isArray(fleet.vehicles))
    for (const v of fleet.vehicles) if (record(v) && (Object.hasOwn(v, "upgrades") || Object.hasOwn(v, "bioFeed"))) return "vehicle upgrades";
  return null;
}

/** Bridge one schema 5 state (already shape-checked as an object). Strict
 * schema 6 validation runs on the result. */
export function bridgeSchema5(input: unknown): BridgeResult {
  if (!record(input)) return { ok: false, error: "This save's state is not an object. Nothing was loaded." };
  const extra = schema6Field(input);
  if (extra) return { ok: false, error: `This schema 5 save holds ${extra}, which only schema 6 writes. Nothing was loaded.` };
  const s = structuredClone(input) as unknown as GameState;
  const notes: string[] = [];
  // Additive state at New Game's value, in New Game's key order (codec re-orders).
  (s as unknown as Record<string, unknown>).systems = createSystems();
  if (record(s.world)) s.world = { ...s.world, flares: [] } as GameState["world"];
  if (!record(s.fleet) || !Array.isArray(s.fleet.vehicles) || !record(s.inventory) || !Array.isArray(s.inventory.items))
    return { ok: true, value: s };
  for (const v of s.fleet.vehicles) {
    if (!record(v)) continue;
    v.upgrades = initialRuntime();
    v.bioFeed = null;
    if (!Array.isArray(v.modules) || typeof v.hull !== "string" || !Object.hasOwn(HULLS, v.hull)) continue;
    // Fit each carried hull protection into a free slot of its hull.
    for (const item of s.inventory.items) {
      if (!record(item) || item.containerId !== v.cargoId || item.fitted !== null ||
          !(HULL_PROTECTIONS as readonly string[]).includes(item.kind)) continue;
      const kind = item.kind as UpgradeId, slot = slotOf(v.hull, kind);
      if (!slot || slot === "refit" || slot === "system") { notes.push(`${item.kind} stays as cargo: it does not fit the ${HULLS[v.hull].label}`); continue; }
      const kinds = v.modules.flatMap((id) => {
        const k = s.inventory.items.find((i) => record(i) && i.id === id)?.kind;
        return k ? [k as UpgradeId] : [];
      });
      const used = kinds.filter((k) => slotOf(v.hull, k) === slot).length;
      const capacity = HULL_SLOTS[v.hull][slot];
      if (used >= capacity) { notes.push(`${item.kind} stays as cargo in the ${HULLS[v.hull].label}: no free ${slot} slot. Fit it at a dock`); continue; }
      v.modules.push(item.id);
      if (slot !== "socket") item.fitted = "mount";
    }
    // The hull's frame at today's build and refit costs (equal or greater value).
    if (s.scenario === "expedition" && typeof v.rating === "number") {
      const investment: Record<string, number> = {};
      const add = (id: RecipeId): void => { for (const [m, q] of Object.entries(RECIPES[id].cost)) investment[m] = (investment[m] ?? 0) + q; };
      for (const id of BUILD[v.hull]) add(id);
      for (let rating: number = HULLS[v.hull].initialDepth, guard = 0; rating < v.rating && guard < 8; guard++) {
        const next = (Object.keys(REFIT_TIERS) as (keyof typeof REFIT_TIERS)[]).find((id) => REFIT_TIERS[id].hull === v.hull && REFIT_TIERS[id].from === rating);
        if (!next) break;
        add(next as RecipeId);
        rating = REFIT_TIERS[next].rating;
      }
      v.investment = investment;
    }
  }
  // Clamp stock to each source's new size.
  if (record(s.world) && Array.isArray(s.world.resources))
    for (const r of s.world.resources) {
      if (!record(r) || typeof r.id !== "string" || !Object.hasOwn(SOURCES, r.id)) continue;
      const def = SOURCES[r.id as keyof typeof SOURCES];
      if (def.item === "meal") continue;
      const reserve = Math.min(r.reserve, def.reserve), stock = Math.min(r.stock, def.stock + def.reserve - reserve);
      if (stock !== r.stock || reserve !== r.reserve) { r.stock = stock; r.reserve = reserve; }
    }
  if (notes.length) s.migration = `Converted from schema 5: ${notes.join("; ")}.`;
  return { ok: true, value: s };
}
