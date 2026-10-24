import type { MaterialId } from "../registry.js";
import type { Deterrent } from "./species.js";

/** Proposed nonlethal kit. None harms an animal; each works on one sense, so
 * choosing the right one is part of reading the animal. Quantities are
 * untested tuning; every material is reachable from the reef, isles or upper
 * Canopy, long before any animal it counters. */
export const DETERRENT_KITS: Readonly<Record<Exclude<Deterrent, "acoustic" | "bait">, {
  label: string; cost: Partial<Record<MaterialId, number>>; quantity: number; site: "pod_fabricator" | "island_workshop"; works: string;
}>> = {
  lure: {
    label: "Glow lures (2)", cost: { silica_glass: 1, buoyant_resin: 1 }, quantity: 2, site: "pod_fabricator",
    works: "A slowly rising light that sight hunters follow instead of your lamp. Sound hunters ignore it.",
  },
  ink: {
    label: "Startle ink canisters (2)", cost: { flex_membrane: 1, buoyant_resin: 1 }, quantity: 2, site: "pod_fabricator",
    works: "A dark bitter cloud around you. Any animal in or looking through it breaks off.",
  },
};
/** CR-1: bait is no kit; it is a caught small fish, released (sim/fauna/catch.ts). */
/** The existing service-tool acoustic pulse (`distraction` command) is the
 * sound deterrent; it already costs reserve-cell charge in vehicles.ts. */
export const ACOUSTIC_DETERRENT = "distraction" as const;
