/** CR-1: creatures as resources. Item kinds, the hand net's recipe and every
 * tuning number for catching, cooking, bait, fertiliser and the fish trap.
 * None of these is a material: the bible keeps the eight. Catches and roe are
 * food that becomes ordinary meals at a cooker; feed is a planter consumable.
 * Tuning hypotheses for the owner's playtests; the tested promises are the
 * caps, the conservation of every conversion and that nothing loops. */
import type { Recipe } from "../registry.js";

export const FAUNA_ITEMS = {
  small_fish: { label: "Small fish", cu: 1 },
  roe_cluster: { label: "Roe cluster", cu: 1 },
  planter_feed: { label: "Shell-and-cast feed", cu: 1 },
  hand_net: { label: "Hand net", cu: 1 },
} as const;
export type FaunaItemKind = keyof typeof FAUNA_ITEMS;
export const isFaunaItem = (kind: unknown): kind is FaunaItemKind =>
  typeof kind === "string" && Object.hasOwn(FAUNA_ITEMS, kind);
/** Kinds that stack like materials. The net is one tool. */
export const FAUNA_STACKABLE: readonly FaunaItemKind[] = ["small_fish", "roe_cluster", "planter_feed"];

/** The hand net: reef and isles materials at the pod bench, from the start. */
export const FAUNA_RECIPES = {
  hand_net: {
    label: "Hand net",
    // Membrane mesh on a resin hoop.
    cost: { flex_membrane: 1, buoyant_resin: 1 },
    bp: "bp_reef_recovery", needs: ["essential_tools"], site: "pod_fabricator",
    output: "hand_net", quantity: 1, once: false, maintenance: false,
  },
} as const satisfies Record<string, Recipe>;

/** By hand a catch takes one fish; a carried net takes one more (still capped
 * by what the school holds). */
export const NET_BONUS = 1;

/** Cooking is one interaction: choose how many portions (meals) to make.
 * Two small fish make one meal; one roe cluster makes two. Meals never decay. */
export const COOKING = {
  small_fish: { raw: 2, meals: 1 },
  roe_cluster: { raw: 1, meals: 2 },
} as const satisfies Partial<Record<FaunaItemKind, { raw: number; meals: number }>>;
export type CookableKind = keyof typeof COOKING;
export const COOKABLE: readonly CookableKind[] = ["roe_cluster", "small_fish"];
/** Most portions one cooking interaction offers. */
export const MAX_PORTIONS = 8;

/** A released small fish is bait: it sinks and struggles, and a threat feeds on
 * it instead of hunting you. It works through each animal's own appetite. */
export const BAIT = {
  seconds: 20,
  /** Metres per second it sinks, stopping just above the floor. */
  sink: 0.4,
  /** The sound hunter turns to bait released within this distance of it. */
  hunterRange: 60,
} as const;

/** One feed on a young crop grows it by this share of its grow time at once.
 * Only a crop under `before` of its growth takes feed, so a crop is fed once. */
export const FERTILISER = { boost: 0.4, before: 0.4 } as const;

/** The fish trap: a socket module that catches one fish every `seconds` of
 * active play while socketed in water near fish (twice as long elsewhere),
 * and holds at most `cap`. A full trap
 * stops catching; nothing is lost, and nothing needs tending in between. */
export const TRAP = {
  seconds: 240,
  cap: 4,
  /** CB-2: full rate within this many metres of a fish ground or trap spot;
   * elsewhere one fish takes `farFactor` times as long. */
  nearRange: 45,
  farFactor: 2,
  /** A host whose socket sits above this height (a dry workshop) catches nothing. */
  wetBelow: 0.5,
} as const;
