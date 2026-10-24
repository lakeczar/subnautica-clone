/** PACE-1 stage 1: what an expedition carries, from what the player has read (rule R2).
 * A sensible player stocks for the recipes they know they will make, and for needs
 * they can infer from evidence they have seen (stage 2's clue fixtures). They never
 * stock for a plan they don't hold yet: a need revealed later is met by going for it,
 * and the trip-reason log (R9) records why. Pure: no driver, no game state. */
import { RECIPES } from "../../src/content/registry.js";
import type { RecipeId } from "../../src/content/registry.js";
import { STORY_RECIPES } from "../../src/content/story/evidence.js";
import type { StoryRecipeId } from "../../src/content/story/evidence.js";

/** A recipe the bot can plan for: a registered recipe or an on-site story restoration. */
export type Plannable = RecipeId | StoryRecipeId;
/** Item quantities by kind. */
export type Stock = Partial<Record<string, number>>;

/** Evidence a player can read a late need from (PACE-1 F4): seeing `id` tells them
 * `for` will need `quantity` of `item`, before they hold its plan. */
export interface Clue { readonly id: string; readonly for: Plannable; readonly item: string; readonly quantity: number; readonly where: string }
/** Stage 2 places the clue fixtures; until then no late need can be inferred early. */
export const CLUES: readonly Clue[] = [];

const registered = (id: string): id is RecipeId => Object.hasOwn(RECIPES, id);

/** What one fabrication of `id` consumes. A maintenance recipe consumes nothing. */
export function costOf(id: Plannable): Stock {
  if (registered(id)) return RECIPES[id].maintenance ? {} : { ...RECIPES[id].cost } as Stock;
  return { ...STORY_RECIPES[id].cost } as Stock;
}
/** The plan `id` needs, or null when it needs none. */
export function planOf(id: Plannable): string | null {
  return registered(id) ? RECIPES[id].bp ?? null : STORY_RECIPES[id].bp;
}
/** Whether a player holding `blueprints` knows how to make `id`. */
export const knows = (blueprints: readonly string[], id: Plannable): boolean => {
  const bp = planOf(id);
  return bp === null || blueprints.includes(bp);
};

export const addStock = (into: Stock, more: Stock, times = 1): Stock => {
  for (const [k, n] of Object.entries(more)) if (n) into[k] = (into[k] ?? 0) + n * times;
  return into;
};

export interface Reservation { readonly why: string; readonly item: string; readonly quantity: number }
export interface StockPlan {
  /** Everything the expedition consumes, by item. */
  needs: Stock;
  /** Each line of `needs` with the recipe, clue or declared extra behind it. */
  reserved: Reservation[];
  /** Recipes the expedition would make but whose plan the player doesn't hold: nothing is reserved for them. */
  unknown: Plannable[];
}

/** The stock an expedition plans to consume.
 * - `recipes`: what it intends to make (a recipe may repeat); only known ones count.
 * - `seen`: clue fixtures already read; a clue counts while its recipe isn't known.
 * - `items`: restrict the plan to these items (e.g. only what is gathered at home).
 * - `extra`: declared non-recipe consumption (an outpost's pack loss), with its reason. */
export function planExpedition(o: {
  recipes: readonly Plannable[]; blueprints: readonly string[]; seen?: readonly string[];
  items?: readonly string[]; extra?: readonly Reservation[]; clues?: readonly Clue[];
}): StockPlan {
  const keep = (item: string): boolean => !o.items || o.items.includes(item);
  const needs: Stock = {}, reserved: Reservation[] = [], unknown: Plannable[] = [];
  for (const id of o.recipes) {
    if (!knows(o.blueprints, id)) { if (!unknown.includes(id)) unknown.push(id); continue; }
    for (const [item, n] of Object.entries(costOf(id)))
      if (n && keep(item)) { addStock(needs, { [item]: n }); reserved.push({ why: `recipe ${id}`, item, quantity: n }); }
  }
  for (const c of o.clues ?? CLUES) {
    if (!(o.seen ?? []).includes(c.id) || knows(o.blueprints, c.for) || !keep(c.item)) continue;
    addStock(needs, { [c.item]: c.quantity });
    reserved.push({ why: `clue ${c.id} (${c.where}) for ${c.for}`, item: c.item, quantity: c.quantity });
  }
  for (const e of o.extra ?? []) if (keep(e.item)) { addStock(needs, { [e.item]: e.quantity }); reserved.push(e); }
  return { needs, reserved, unknown };
}

/** What `needs` still lacks beyond `held(item)`. */
export function shortfall(needs: Stock, held: (item: string) => number): Stock {
  const out: Stock = {};
  for (const [item, n] of Object.entries(needs)) {
    const short = (n ?? 0) - held(item);
    if (short > 0) out[item] = short;
  }
  return out;
}

export const isEmpty = (s: Stock): boolean => !Object.values(s).some((n) => (n ?? 0) > 0);
export const describe = (s: Stock): string => Object.entries(s).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing";
