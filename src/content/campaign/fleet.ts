/** S9 campaign roles for the four later hulls. Geometry, colliders, mounts and
 * berth envelopes are S3's (`src/content/fleet/hulls.ts`); this module says how each
 * hull is earned, where it works and the one mission that shows its benefit.
 * Numbers are tuning proposals for C3 to wire, not measured play. */
import type { HullId } from "../registry.js";

/** Hearthline: earned in two stages at the stack-yard berth from the Basin frame
 * survey and the workshop plans, then refitted to 550 m from earlier-tier stock. */
export const HEARTHLINE_CAMPAIGN = {
  construction: { site: "stack_yard", stages: ["hearthline_keel", "hearthline_base"], refit: "hearthline_550" },
  /** Dry, pressure-isolated berths: two compact or one medium, reconfigured only
   * while empty at a supported dock. One launch lock floods for one craft at a time. */
  berths: {
    compact: { slots: 2, hulls: ["dart", "hush", "spindle"] },
    medium: { slots: 1, hulls: ["creel", "mantle"] },
    reconfigure: "empty berths, moored at a mooring with repair service",
    launch: "station keeping first; the lock validates exit volume and water; Spindle deploys only at the surface",
  },
  /** Services aboard while station keeping or moored. Fabrication covers the
   * workshop recipes that need no slip: S5's service assemblies and S4's kits. */
  services: {
    air: true, rest: "cabin bunk", meals: "galley cooker and planter socket", charge: "berthed craft and cells",
    repair: "field patches for berthed craft", fabrication: ["service_power_assembly", "service_air_assembly", "glow_lures", "startle_ink"],
    stores: { holdCu: 192, pantryCu: 32, fabricationCu: 32 },
  },
  /** S2 moorings. The district shelf needs the 550 m refit. */
  moorings: [
    { site: "canopy.east_mooring", depth: 160, rating: 400 },
    { site: "basin.anchorage", depth: 240, rating: 400 },
    { site: "rift.cool_mooring", depth: 300, rating: 400 },
    { site: "divide.lee_mooring", depth: 390, rating: 400 },
    { site: "meridian.staging_shelf", depth: 520, rating: 550 },
  ],
} as const;

export interface HullRole {
  /** Recipe that builds it, and its build site. */
  readonly recipe: string;
  readonly site: "stack_yard";
  readonly hold: number;
  /** Hazards the hull itself tolerates without a fitted protection module. */
  readonly tolerates: readonly ("heat" | "brine")[];
  readonly mission: { readonly name: string; readonly where: string; readonly benefit: string; readonly measure: string };
}

/** The Hush coasts below the sound hunter's interest threshold. Interest builds
 * only above loudness 0.35 inside its 72 m territory (sim/survival.ts). */
export const HUSH_HANDLING = {
  quiet: 4, cruise: 6, boost: 7.5, response: 1.2, turnRate: 1.4, drain: 100 / 1200,
  loudness: { quiet: 0.03, cruise: 0.2, boost: 0.7 },
} as const;
/** Today's Dart quiet and cruise (sim/step.ts) and the hunter's threshold. */
export const DART_QUIET = { speed: 3, trimmedSpeed: 4.2, loudness: 0.08, cruise: 8, cruiseLoudness: 0.48 } as const;
export const HUNTER_INTEREST_LOUDNESS = 0.35;
export const HUNTER_TERRITORY_M = 72;

export const CAMPAIGN_HULL_ROLES = {
  mantle: {
    recipe: "mantle_base", site: "stack_yard", hold: 32, tolerates: ["heat"],
    mission: {
      name: "District works sortie",
      where: "Hearthline at the 520 m staging shelf → the 768 m gate hall and its works",
      benefit: "Protected, precise work at the deepest works: rated 800 m, tolerates the plume heat that an adapted Creel must time, and holds station in the saddle downwelling (under 0.2 m/s drift).",
      measure: "Carries the two 6 CU service assemblies with the hall and food stock in two 32 CU sorties from the shelf.",
    },
  },
  hearthline: {
    recipe: "hearthline_base", site: "stack_yard", hold: 192, tolerates: [],
    mission: {
      name: "Staged home",
      where: "Canopy, Basin, Rift and Divide moorings, then the 520 m district shelf after the refit",
      benefit: "A moving refuge with air, bunk, galley and fabrication that carries a berthed sortie craft and the whole works cargo.",
      measure: "The 42 CU of works stock and assemblies ride in one carrier trip instead of separate hauls from the islands.",
    },
  },
  hush: {
    recipe: "hush_base", site: "stack_yard", hold: 32, tolerates: [],
    mission: {
      name: "Quiet crossing of the hunter's fins",
      where: "Lantern Canopy lower grounding fins inside the sound hunter's territory",
      benefit: "Cruises at 6 m/s at loudness 0.2, under the 0.35 the hunter reacts to; a Dart must crawl at 3 m/s (4.2 with trim) to stay unnoticed.",
      measure: "The 72 m territory takes 24 s instead of 48 s (34 s trimmed), with no warning call.",
    },
  },
  spindle: {
    recipe: "spindle_base", site: "stack_yard", hold: 96, tolerates: [],
    mission: {
      name: "Yard supply run",
      where: "Splitspine workshop landing → stack-yard berth → headland field shelter, on the surface",
      benefit: "Solar endurance and a 96 CU dry hold: a surface journey replaces repeated short dives while the carrier is fitted out.",
      measure: "The 40 CU carrier fit-out stock moves in one Spindle trip, against three diver loads or two Dart holds.",
    },
  },
} as const satisfies Partial<Record<HullId, HullRole>>;
