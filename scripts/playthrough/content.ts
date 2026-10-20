/** What the build under test contains, for phases written ahead of their content.
 * Each check names one declared ID (S2 route, S5 story host, S9 recipe/source/site)
 * and reports it missing until C3 composes it. Nothing here changes the game. */
import { EVIDENCE, HULLS, OPTIONAL_RECORD, RECIPES, SOURCES } from "../../src/content/registry.js";
import { WORLD_VERTICAL_BOUNDS } from "../../src/content/routes.js";
import { ROUTES } from "../../src/content/regions/passages.js";
import type { RouteDef } from "../../src/content/regions/passages.js";
import { SITES } from "../../src/content/regions/sites.js";
import { placedSite } from "../../src/content/story/sites.js";
import { siteOf, DISCOVERY_IDS } from "../../src/content/story/evidence.js";
import type { DiscoveryId } from "../../src/content/story/evidence.js";
import { storyHost } from "../../src/sim/storyLink.js";
import { createGame } from "../../src/sim/state.js";
import { withinWorldBounds } from "../../src/sim/world.js";
import type { Vec3 } from "../../src/sim/types.js";

/** S9's campaign module, if this build has it (it lands with C3). */
interface Campaign {
  CAMPAIGN_PENDING?: Readonly<Record<string, string>>;
  CAMPAIGN_SITES?: Readonly<Record<string, { s2: string; work: Vec3; depth: number }>>;
}
let campaign: Campaign | null = null;
export async function loadCampaign(): Promise<void> {
  const spec = "../../src/content/campaign/index.js";
  try { campaign = await import(spec) as Campaign; } catch { campaign = null; }
}
export const campaignSites = (): Readonly<Record<string, { s2: string; work: Vec3; depth: number }>> => campaign?.CAMPAIGN_SITES ?? {};

/** A point the simulation lets the player occupy. */
export const simReaches = (p: Vec3): boolean => withinWorldBounds(p) && p.y >= WORLD_VERTICAL_BOUNDS.minY;

export const need = {
  recipe(id: string): string[] {
    if (!Object.hasOwn(RECIPES, id)) return [`recipe ${id} (S9)`];
    const pending = campaign?.CAMPAIGN_PENDING?.[id];
    return pending ? [`recipe ${id}: S9 marks its ${pending} unplaced (C3 wiring)`] : [];
  },
  source(id: string): string[] {
    if (!Object.hasOwn(SOURCES, id)) return [`source ${id} (S9)`];
    const p = SOURCES[id as keyof typeof SOURCES].position;
    return simReaches(p) ? [] : [`source ${id} at (${p.x}, ${p.y}, ${p.z}) is outside the simulation bounds`];
  },
  /** A story discovery whose site exists and which has a host to interact with. */
  story(id: string): string[] {
    if (!(DISCOVERY_IDS as readonly string[]).includes(id)) return [`story ID ${id} (S5)`];
    const out: string[] = [];
    if (!placedSite(siteOf(id as DiscoveryId))) out.push(`story site ${siteOf(id as DiscoveryId)} not placed (${id})`);
    // A host: C01–C06 and the reef note are registry interactions; later records are story hosts.
    if (!Object.hasOwn(EVIDENCE, id) && id !== OPTIONAL_RECORD.id && !storyHost(id)) out.push(`story host for ${id}`);
    return out;
  },
  /** An S2 route the simulation can follow end to end. */
  route(id: string): string[] {
    const r = ROUTES.find((x) => x.id === id);
    if (!r) return [`S2 route ${id}`];
    const outside = r.path.filter((p) => !simReaches(p));
    return outside.length ? [`S2 route ${id}: ${outside.length}/${r.path.length} points outside the simulation bounds (first at ` +
      `(${outside[0]!.x.toFixed(0)}, ${outside[0]!.y.toFixed(0)}, ${outside[0]!.z.toFixed(0)}))`] : [];
  },
  /** An S2 site the simulation can reach. */
  site(id: string): string[] {
    const s = SITES.find((x) => x.id === id);
    if (!s) return [`S2 site ${id}`];
    const at = { x: s.work?.x ?? s.at.x, y: s.work?.y ?? (typeof s.at.y === "number" ? s.at.y : -1), z: s.work?.z ?? s.at.z };
    return simReaches(at) ? [] : [`S2 site ${id} at (${at.x.toFixed(0)}, ${at.y.toFixed(0)}, ${at.z.toFixed(0)}) is outside the simulation bounds`];
  },
  facility(id: string): string[] {
    return createGame().world.facilities.some((f) => f.id === id) ? [] : [`facility ${id} in New Game (C3)`];
  },
  /** A hull the game can build and save. */
  hull(id: string): string[] {
    if (!Object.hasOwn(HULLS, id)) return [`hull ${id}`];
    const builder = Object.entries(RECIPES).find(([, r]) => r.output === id);
    return builder ? need.recipe(builder[0]) : [`a recipe that builds the ${id}`];
  },
};
export const s2Route = (id: string): RouteDef => {
  const r = ROUTES.find((x) => x.id === id);
  if (!r) throw new Error(`S2 route ${id} is missing`);
  return r;
};
export const s2Site = (id: string) => SITES.find((x) => x.id === id);
