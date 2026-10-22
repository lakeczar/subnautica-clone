/** C4: SYS-1's catalogue as registry rows. Every non-refit upgrade is an item
 * kind (the intact module); recipes exist only for upgrades whose effect the
 * game runs today. The rest stay catalogue data until their behaviour lands
 * (see docs/build/streams/C4.md), so nothing fabricable does nothing.
 *
 * Imports only types from the registry, so the registry can spread these rows. */
import type { CostKind } from "../registry.js";
import { UPGRADES } from "./catalogue.js";
import type { UpgradeId } from "./catalogue.js";
import { HOST_UPGRADES } from "./hosts.js";
import type { HostUpgradeId } from "./hosts.js";

type RefitId = { [K in UpgradeId]: (typeof UPGRADES)[K] extends { readonly refit: object } ? K : never }[UpgradeId];
/** Catalogue entries that already were registry items (M1 trim, Creel mounts, S4 protections). */
type ExistingItem = "dart_acoustic_trim" | "creel_cargo_rack" | "creel_cabin" | "hull_heat_lining" | "hull_brine_seals" | "trim_vanes";
export type UpgradeItemKind = Exclude<UpgradeId, RefitId | ExistingItem>;
export type UpgradeRefitId = Extract<RefitId, "hush_350" | "hush_450" | "dart_450">;

const EXISTING: readonly string[] = ["dart_acoustic_trim", "creel_cargo_rack", "creel_cabin", "hull_heat_lining", "hull_brine_seals", "trim_vanes"];
export const UPGRADE_ITEMS = Object.fromEntries((Object.keys(UPGRADES) as UpgradeId[])
  .filter((id) => !("refit" in UPGRADES[id]) && !EXISTING.includes(id))
  .map((id) => [id, { label: UPGRADES[id].label, cu: UPGRADES[id].cu }])) as
  { readonly [K in UpgradeItemKind]: { readonly label: string; readonly cu: number } };

/** Upgrades whose effects step, survival, power or a command run in this build. */
export const WIRED_UPGRADES = [
  "plating_alloy", "plating_ceramic", "cell_bank_1", "cell_bank_2", "drive_tuning_1", "drive_tuning_2",
  "thermal_exchanger", "floodlights_1", "floodlights_2", "silent_running", "flare_launcher", "emergency_ballast",
  "dart_overdrive", "creel_service_head", "hush_listening_array", "hush_specimen_bay", "hush_extended_glide",
  "spindle_solar_array", "spindle_shore_ramp", "spindle_radio_mast", "mantle_thermal_shroud", "mantle_hull_air_line",
  "hearthline_system_bay", "hearthline_mooring_anchor",
] as const satisfies readonly UpgradeItemKind[];
export type WiredUpgradeId = (typeof WIRED_UPGRADES)[number];
export const wiredUpgrade = (id: unknown): id is WiredUpgradeId => (WIRED_UPGRADES as readonly unknown[]).includes(id);

/** The hull whose base recipe a signature needs; common upgrades need the workshop. */
const SIGNATURE_BASE = { dart: "dart_base", creel: "creel_base", hush: "hush_base", spindle: "spindle_base", mantle: "mantle_base",
  hearthline: "hearthline_base" } as const;
interface Row {
  label: string; cost: Partial<Record<CostKind, number>>; bp: string; needs: readonly string[];
  site: "island_workshop" | "stack_yard"; output: string; quantity: 1; once: boolean; maintenance: false;
}
/** The suit a tier's upgrades assume: they are paid from that tier's reach. */
const TIER_SUIT = { 1: "suit_150", 2: "suit_350", 3: "suit_450" } as const;
function upgradeRecipe(id: UpgradeId, output: string, once: boolean): Row {
  const u = UPGRADES[id], hulls = Object.keys(u.fits) as (keyof typeof SIGNATURE_BASE)[];
  const carrier = hulls.length === 1 && hulls[0] === "hearthline";
  const needs = [u.layer === "signature" ? SIGNATURE_BASE[hulls[0]!] : "restore_workshop", TIER_SUIT[u.tier]];
  return { label: u.label, cost: { ...u.cost }, bp: u.plan, needs, site: carrier ? "stack_yard" : "island_workshop",
    output, quantity: 1, once, maintenance: false };
}
/** One recipe per wired upgrade, at the workshop (carrier fittings at the yard). */
export const UPGRADE_RECIPES = Object.fromEntries(WIRED_UPGRADES.map((id) => [id, upgradeRecipe(id, id, false)])) as
  { readonly [K in WiredUpgradeId]: Row };
/** New pressure refits (the registry already has the Dart 350 and Creel lines). */
export const UPGRADE_REFIT_RECIPES = {
  hush_350: { ...upgradeRecipe("hush_350", "hush_350", true), needs: ["hush_base"] },
  hush_450: { ...upgradeRecipe("hush_450", "hush_450", true), needs: ["hush_350", "suit_350"] },
  dart_450: { ...upgradeRecipe("dart_450", "dart_450", true), needs: ["dart_350", "suit_350"] },
} as const satisfies Record<UpgradeRefitId, Row>;
export const UPGRADE_REFIT_TIERS = {
  hush_350: { hull: "hush", ...UPGRADES.hush_350.refit },
  hush_450: { hull: "hush", ...UPGRADES.hush_450.refit },
  dart_450: { hull: "dart", ...UPGRADES.dart_450.refit },
} as const;

/** SYS-1 host upgrades held as knowledge (crafted once). Module-scope ones
 * (decoder lattice, survey arrays) improve one module item in place; they are
 * fabricated at the workshop with that module in reach (`upgrade-host-module`). */
export type HostKnowledgeId = { [K in HostUpgradeId]: (typeof HOST_UPGRADES)[K]["scope"] extends "knowledge" ? K : never }[HostUpgradeId];
export const HOST_KNOWLEDGE_RECIPES = Object.fromEntries((Object.keys(HOST_UPGRADES) as HostUpgradeId[])
  .filter((id) => HOST_UPGRADES[id].scope === "knowledge")
  .map((id) => [id, { label: HOST_UPGRADES[id].label, cost: { ...HOST_UPGRADES[id].cost }, bp: HOST_UPGRADES[id].plan,
    needs: ["restore_workshop", TIER_SUIT[HOST_UPGRADES[id].tier]], site: "island_workshop", output: id, quantity: 1, once: true, maintenance: false }])) as unknown as
  { readonly [K in HostKnowledgeId]: Omit<Row, "output" | "once"> & { output: K; once: true } };
