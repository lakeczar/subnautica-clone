/** CB content-bible proposals: typed, Babylon-free data that region, cave and
 * systems builders can lift. Nothing in the game imports this directory
 * (tests/content-proposals.test.ts enforces that). Prose lives in
 * docs/content/; every ID here appears in its area's document.
 *
 * Metres, +Y up, water at Y = 0, +X east, +Z north, as everywhere else.
 * IDs follow the existing schemes: sites and landmarks `<area>.<name>`,
 * sources and caves snake_case. Labels are working names, not player text,
 * unless a field says otherwise. */
import type { MaterialId, RegionId } from "../registry.js";
import type { AccessTierId, CraftProfileId } from "../regions/passages.js";
import type { Rect } from "../../world/types.js";

/** The seven regions plus the central hub spur (part of Hearth Reef by
 * scope, kept as its own area so builders can own it separately). */
export type AreaId = RegionId | "hub_spur";

export interface Point { readonly x: number; readonly y: number; readonly z: number }

/** How `at.y` relates to today's world.
 * - `floor`: on the current `worldFloor` (the test holds it within 4 m).
 * - `land`: on the current floor above the waterline (an island walk).
 * - `water`: free water; the test only checks it is above the floor.
 * - `reshape`: needs new W2 terrain or cave rock first; not checked against today's floor. */
export type Anchor = "floor" | "land" | "water" | "reshape";

/** A reference to something that already exists, or to another proposal.
 * The test resolves every one. */
export type Ref =
  | { readonly kind: "site"; readonly id: string }        // regions/sites.ts SITES
  | { readonly kind: "source"; readonly id: string }      // registry SOURCES
  | { readonly kind: "place"; readonly id: string }       // registry PLACES
  | { readonly kind: "story_site"; readonly id: string }  // story/sites.ts STORY_SITES
  | { readonly kind: "tech_record"; readonly id: string } // registry TECH_RECORDS
  | { readonly kind: "vista"; readonly id: string }       // vistas.ts VISTA_SETS
  | { readonly kind: "cave"; readonly id: string }        // regions/caves.ts CAVE_SOURCES
  | { readonly kind: "proposal"; readonly id: string };   // any ID in this directory

/** `existing`: already in the game data (named in `ref`). `extend`: an existing
 * thing given new dressing or purpose. `new`: proposed here. */
export type Status = "existing" | "extend" | "new";

export interface LandmarkProposal {
  readonly id: string;
  readonly area: AreaId;
  /** Anchors are the 2–3 distant silhouettes; clusters are places to go. Anchors count as clusters. */
  readonly role: "anchor" | "cluster";
  readonly status: Status;
  readonly label: string;
  readonly at: Point;
  readonly anchor: Anchor;
  /** Existing things this merges with or sits beside. */
  readonly near: readonly Ref[];
  readonly see: string;
  readonly why: string;
}

export type CaveSize = "small" | "medium";
export interface CaveProposal {
  readonly id: string;
  readonly area: AreaId;
  readonly size: CaveSize;
  readonly status: Status;
  readonly label: string;
  /** Main mouth datum, on the exterior floor. */
  readonly mouth: Point;
  readonly anchor: Anchor;
  /** Proposed replacement-rock footprint (W1 kit): the columns the cave owns, collar
   * included. Separate from the water it carves (`water`). */
  readonly footprint: Rect;
  /** Shallowest and deepest water inside, metres below the surface (positive). */
  readonly depth: readonly [top: number, bottom: number];
  /** Largest profile the main hall admits. Small caves are always `diver`. */
  readonly admits: CraftProfileId;
  /** Extent of the carved water, metres: length along the main passage, width
   * across it, height = the depth span. Small: every extent 25 m or less, the
   * longest 10–25 m. Medium: every extent 80 m or less, the longest 30–80 m. */
  readonly water: { readonly length: number; readonly width: number; readonly height: number };
  /** Named openings to open water. Small caves have one or more; medium caves two or more. */
  readonly exits: readonly string[];
  /** Medium caves: 2–5 named chambers, distinct from each other and from the exits. */
  readonly chambers?: readonly string[];
  /** Medium caves: the chamber graph. Each passage joins two chambers, or an exit to
   * its chamber. The chambers alone must contain a cycle (GAME-DIRECTION's loop):
   * a way round inside the cave, not just a way through it. */
  readonly passages?: readonly CavePassage[];
  /** The passage that closes the loop; without it the chambers would only chain. */
  readonly loopCloser?: string;
  /** Small caves joined by crawlways share a network ID. */
  readonly network?: string;
  readonly layout: string;
  readonly contents: readonly string[];
  /** Crawlways, shared mouths and back entrances. */
  readonly links: readonly Ref[];
  /** Set when this cave is a back entrance into a cave biome. */
  readonly backEntranceTo?: CaveBiomeId;
  /** The region's own cave resident, where it lives here. */
  readonly resident?: SpeciesId;
  readonly near: readonly Ref[];
}

export interface CavePassage {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Who fits through it, or how it runs. */
  readonly note?: string;
}

export type CaveBiomeId = "isles_undercroft" | "canopy_rootways" | "basin_ridge_vaults" | "rift_divide_seam";
export interface CaveZone {
  readonly id: string;
  readonly label: string;
  readonly centre: Point;
  readonly depth: readonly [top: number, bottom: number];
  readonly light: string;
  readonly life: string;
  readonly resources: string;
  readonly note: string;
}
export interface CaveEntrance {
  readonly id: string;
  readonly label: string;
  readonly role: "front" | "back" | "exit";
  readonly at: Point;
  readonly anchor: Anchor;
  readonly admits: CraftProfileId;
  /** For a biome that crosses a region boundary: the region this entrance opens into. */
  readonly region?: RegionId;
  readonly note: string;
}
export interface CaveBiomeProposal {
  readonly id: CaveBiomeId;
  readonly area: AreaId;
  readonly label: string;
  /** GAME-DIRECTION: main path or optional. */
  readonly path: "main" | "optional";
  readonly stage: "early" | "mid" | "late";
  /** Coarse bound of all carved water (LC domain). Longest side 150–300 m. */
  readonly domain: { readonly min: Point; readonly max: Point };
  /** Access tier whose craft/suit the main loop is designed for. */
  readonly tier: AccessTierId;
  readonly zones: readonly CaveZone[];
  readonly entrances: readonly CaveEntrance[];
  readonly residents: readonly SpeciesId[];
  readonly resources: readonly string[];
  readonly rewards: readonly string[];
  /** What the intended route does here. Never the only source of a required item. */
  readonly mainPathBeat: string;
  readonly staging: string;
  readonly near: readonly Ref[];
}

/** Creature IDs. Existing ones name their current home in `source`. */
export type SpeciesId =
  // existing (registry/render ecology, sim/hunter.ts, S4 ecology composed in C3)
  | "ledge_grazer" | "filter_ribbon" | "reef_school" | "canopy_sound_hunter"
  | "canopy_school" | "basin_scavengers" | "ember_mites" | "glare_stalker"
  | "brine_sails" | "layer_skate" | "hollow_choir"
  // research-named, not built (LANDMARKS-CREATURES-RESOURCES)
  | "canopy_floaters" | "shore_buttons" | "silt_combs" | "seam_pickers"
  // new here
  | "vault_glimmer" | "tide_clapper" | "resin_weaver" | "knot_eel" | "wakeglow_drift"
  | "kiln_crawler" | "brine_skimmer" | "cable_tender" | "crown_rays"
  // CB-2: the open-water animal whose remains make the carcass falls
  | "pale_drifter";
export type SpeciesRole = "threat" | "den" | "cue" | "benign" | "food";
export interface SpeciesProposal {
  readonly id: SpeciesId;
  readonly status: "existing" | "research" | "new";
  readonly label: string;
  readonly role: SpeciesRole;
  readonly caveDweller: boolean;
  readonly areas: readonly AreaId[];
  readonly behaviour: string;
  /** Reaction to the player's noise (speed, sonar, machinery). */
  readonly noise: string;
  /** Reaction to lamps and flares. */
  readonly light: string;
  /** "cheap": placement of existing art or a template; "art": new mesh; "behaviour": new rules. */
  readonly cost: readonly ("cheap" | "art" | "behaviour")[];
  /** Where an existing species is defined today. */
  readonly source?: string;
}

/** Every area lists its creature types with where they live. */
export interface AreaCreature { readonly species: SpeciesId; readonly where: string; readonly note?: string }

/** Seed IDs: SYS-2's in-progress five plus the optional regional ones proposed here. */
export type SeedId =
  | "seed_staple_cup" | "seed_ribbon_fan" | "seed_salve_frond" | "seed_lumen_bulb" | "seed_pale_spore"
  | "seed_rootglow" | "seed_kiln_tuber" | "seed_mirror_cress";

export type ResourceKind =
  /** Small, finite, early: a later-tier material found before its use is known. */
  | "frontier_sample"
  /** A cave source of an existing material: richer or renewable, never required. */
  | "cave_favoured"
  /** An exterior source added for density or a second patch. */
  | "exterior"
  | "seed"
  /** A finite authored cache with a declared purpose. */
  | "cache";
export interface ResourceProposal {
  readonly id: string;
  readonly area: AreaId;
  readonly kind: ResourceKind;
  readonly item: MaterialId | SeedId | "meal" | "tagged_frame";
  readonly label: string;
  readonly at: Point;
  readonly anchor: Anchor;
  /** Proposed stock, bundle, finite reserve (the SiteDef convention). */
  readonly stock: readonly [stock: number, bundle: number, reserve: number];
  readonly renewable: boolean;
  /** Cave or cave-biome ID when the source is underground. */
  readonly inCave?: string;
  /** A ledge to cut into existing terrain (S2 pad convention): the test checks the
   * floor within `radius` spans the datum, so the pad is cuttable. */
  readonly pad?: { readonly radius: number };
  /** What a player learns to read (never colour alone). */
  readonly condition: string;
  readonly near: readonly Ref[];
}

/** Matches SYS-2's in-progress DecodableDefinition so it lifts unchanged. */
export type DecodeSize = "fragment" | "log" | "archive" | "core";
export interface DecodeReveal {
  readonly id: string;
  readonly label: string;
  readonly category: "stop" | "landmark" | "site" | "hint";
  /** What the decoded map points at. */
  readonly target: Ref;
  readonly radius: number;
}
export interface DecodeProposal {
  readonly id: string;
  readonly label: string;
  readonly size: DecodeSize;
  /** Records that stay unreadable until this decode finishes. */
  readonly gates: readonly string[];
  readonly blueprints: readonly BlueprintRef[];
  readonly reveals: readonly DecodeReveal[];
  /** SYS-2 flag: the story needs it. Always false here: lost sites deepen, never gate. */
  readonly story: false;
  /** Spoiler-safe one-line summaries of the decoded logs. Canon tie-ins live in docs/spoilers/. */
  readonly logs: readonly string[];
}
export interface LostSiteProposal {
  readonly id: string;
  readonly area: AreaId;
  readonly label: string;
  readonly at: Point;
  readonly anchor: Anchor;
  /** Optional sites can sit in caves; a main-path cave biome may host one. */
  readonly inCave?: string;
  readonly see: string;
  readonly decodes: readonly DecodeProposal[];
  readonly near: readonly Ref[];
}

export interface SideRewardProposal {
  readonly id: string;
  readonly area: AreaId;
  readonly kind: "secret" | "cache" | "shortcut" | "view" | "service";
  readonly label: string;
  readonly at: Point;
  readonly anchor: Anchor;
  readonly reward: string;
  /** Caches: the finite materials inside (counted as samples by the tier rule). */
  readonly contents?: Readonly<Partial<Record<MaterialId | "tagged_frame" | "meal", number>>>;
  readonly near: readonly Ref[];
}

export interface CycleCandidate {
  readonly id: string;
  readonly area: AreaId;
  readonly label: string;
  /** Seconds. Active part never forces a wait longer than about a minute. */
  readonly period: number;
  readonly active: number;
  readonly purpose: string;
  readonly alternative: string;
  /** Honest first read before the sandbox prototype. */
  readonly verdict: "promising" | "uncertain" | "likely_cut" | "existing";
  readonly note: string;
}

export interface PacingBeat {
  /** Minutes into this area's skilled first-time play, cumulative across visits. */
  readonly at: number;
  readonly beat: string;
  readonly kind: "tool" | "area" | "craft" | "discovery" | "story";
  readonly ref?: Ref;
}

export interface AreaProposal {
  readonly area: AreaId;
  readonly landmarks: readonly LandmarkProposal[];
  readonly caves: readonly CaveProposal[];
  readonly caveStyle: string;
  readonly caveResident: SpeciesId;
  readonly creatures: readonly AreaCreature[];
  readonly resources: readonly ResourceProposal[];
  readonly sideRewards: readonly SideRewardProposal[];
  readonly lostSites: readonly LostSiteProposal[];
  readonly cycles: readonly CycleCandidate[];
  /** Skilled first-time minutes: main path only, and with the optional content here. */
  readonly minutes: { readonly mainPath: number; readonly full: number };
  readonly pacing: readonly PacingBeat[];
}

/** Plans named by proposals: existing registry/campaign/systems plans, or new ones proposed in blueprints.ts. */
export type BlueprintRef = string;
