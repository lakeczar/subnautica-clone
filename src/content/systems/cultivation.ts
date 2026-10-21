/** SYS-2 crops. Growth counts active play seconds while the planter sits in a host's
 * socket: plant before an expedition, harvest after. Each harvest returns the
 * cutting, so one seed keeps a planter productive. Proposed balance. */
import type { RegionId } from "../registry.js";
import type { Sys2ItemKind } from "./items.js";

export type CropRole = "food" | "medicine" | "material" | "power";
/** `hand`: any diver collects it. `specimen`: only the Hush specimen bay (SYS-1)
 * samples it without tearing; the later Hush specimen bay reads this flag. */
export type Sampling = "hand" | "specimen";
export interface SeedDefinition {
  label: string;
  role: CropRole;
  /** Produce item kind: a registry ItemKind or a SYS-2 kind. */
  produce: string;
  quantity: number;
  growSeconds: number;
  region: RegionId;
  sampling: Sampling;
}
export const SEEDS = {
  seed_staple_cup: { label: "Staple cups", role: "food", produce: "meal", quantity: 2, growSeconds: 360, region: "refuge_reef", sampling: "hand" },
  seed_salve_frond: { label: "Salve frond", role: "medicine", produce: "field_salve", quantity: 1, growSeconds: 480, region: "island_chain", sampling: "hand" },
  seed_ribbon_fan: { label: "Ribbon fan", role: "material", produce: "flex_membrane", quantity: 3, growSeconds: 420, region: "refuge_reef", sampling: "hand" },
  seed_lumen_bulb: { label: "Lumen bulb", role: "power", produce: "bio_cell", quantity: 1, growSeconds: 600, region: "suspended_garden", sampling: "hand" },
  seed_pale_spore: { label: "Pale crust", role: "material", produce: "conductive_crust", quantity: 2, growSeconds: 540, region: "silt_basin", sampling: "specimen" },
} as const satisfies Partial<Record<Sys2ItemKind, SeedDefinition>>;
export type SeedKind = keyof typeof SEEDS;
export const SEED_KINDS = Object.keys(SEEDS) as SeedKind[];
export const isSeed = (kind: unknown): kind is SeedKind =>
  typeof kind === "string" && Object.hasOwn(SEEDS, kind);
/** Seeds whose collection needs the specimen bay. */
export const seedCollectable = (seed: SeedKind, specimenBay: boolean): boolean =>
  SEEDS[seed].sampling === "hand" || specimenBay;
