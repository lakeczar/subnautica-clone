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
import { interactions } from "../../src/sim/progression.js";
import { withinWorldBounds } from "../../src/sim/world.js";
import type { Vec3 } from "../../src/sim/types.js";

/** S9's campaign module, if this build has it (it lands with C3). */
interface Campaign {
  CAMPAIGN_PENDING?: Readonly<Record<string, string>>;
  CAMPAIGN_SITES?: Readonly<Record<string, { s2: string; work: Vec3; depth: number }>>;
}
let campaign: Campaign | null = null;
/** C3's composed stops (work pose and craft mooring per site), once C3 lands. */
let stops: Readonly<Record<string, { work: Vec3; mooring: Vec3; fabrication: string | null }>> = {};
/** Import a module the build may not have yet. Only its own absence is tolerated;
 * an error raised inside an existing module propagates. */
async function optional<T>(spec: string): Promise<T | null> {
  try { return await import(spec) as T; } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "ERR_MODULE_NOT_FOUND" && err.message?.includes(spec.replace(/^(\.\.\/)+/, ""))) return null;
    throw e;
  }
}
export async function loadCampaign(): Promise<void> {
  campaign = await optional<Campaign>("../../src/content/campaign/index.js");
  stops = (await optional<{ WORKING_STOPS: typeof stops }>("../../src/content/stops.js"))?.WORKING_STOPS ?? {};
}
export interface CampaignSite { work: Vec3; mooring: Vec3 | null }
/** An S9 site's diver work pose and craft mooring: C3's composed stop when the
 * build has one, otherwise S9's provisional work pose. */
export const campaignSite = (site: string): CampaignSite | null => {
  const stop = Object.values(stops).find((x) => x.fabrication === site);
  if (stop) return { work: stop.work, mooring: stop.mooring };
  const s9 = campaign?.CAMPAIGN_SITES?.[site];
  return s9 ? { work: s9.work, mooring: null } : null;
};

/** A point the simulation lets the player occupy. */
export const simReaches = (p: Vec3): boolean => withinWorldBounds(p) && p.y >= WORLD_VERTICAL_BOUNDS.minY;

/** One missing capability: a stable key (kind:id) checked against the expected-pending
 * list, and a readable line. */
export interface Missing { key: string; text: string }
const miss = (key: string, text: string): Missing[] => [{ key, text }];

export const need = {
  recipe(id: string): Missing[] {
    if (!Object.hasOwn(RECIPES, id)) return miss(`recipe:${id}`, `recipe ${id} is not in this build`);
    const pending = campaign?.CAMPAIGN_PENDING?.[id];
    return pending ? miss(`recipe:${id}`, `recipe ${id}: S9 marks its ${pending} unplaced (C3 wiring)`) : [];
  },
  source(id: string): Missing[] {
    if (!Object.hasOwn(SOURCES, id)) return miss(`source:${id}`, `source ${id} is not in this build`);
    const p = SOURCES[id as keyof typeof SOURCES].position;
    return simReaches(p) ? [] : miss(`source:${id}`, `source ${id} at (${p.x}, ${p.y}, ${p.z}) is outside the simulation bounds`);
  },
  /** A story discovery whose site exists and which has a host to interact with. */
  story(id: string): Missing[] {
    if (!(DISCOVERY_IDS as readonly string[]).includes(id)) return miss(`story:${id}`, `story ID ${id} is not in this build`);
    const out: Missing[] = [];
    const site = siteOf(id as DiscoveryId);
    if (!placedSite(site)) out.push({ key: `story-site:${site}`, text: `story site ${site} not placed (${id})` });
    // A host: C01–C06 and the reef note are registry interactions; later records are story hosts.
    if (!Object.hasOwn(EVIDENCE, id) && id !== OPTIONAL_RECORD.id && !storyHost(id)) out.push({ key: `story-host:${id}`, text: `story host for ${id}` });
    return out;
  },
  /** An S2 route the simulation can follow end to end. */
  route(id: string): Missing[] {
    const r = ROUTES.find((x) => x.id === id);
    if (!r) return miss(`route:${id}`, `S2 route ${id} is not in this build`);
    const outside = r.path.filter((p) => !simReaches(p));
    return outside.length ? miss(`route:${id}`, `S2 route ${id}: ${outside.length}/${r.path.length} points outside the simulation bounds (first at ` +
      `(${outside[0]!.x.toFixed(0)}, ${outside[0]!.y.toFixed(0)}, ${outside[0]!.z.toFixed(0)}))`) : [];
  },
  /** An S2 site the simulation can reach. */
  site(id: string): Missing[] {
    const s = SITES.find((x) => x.id === id);
    if (!s) return miss(`site:${id}`, `S2 site ${id} is not in this build`);
    const at = { x: s.work?.x ?? s.at.x, y: s.work?.y ?? (typeof s.at.y === "number" ? s.at.y : -1), z: s.work?.z ?? s.at.z };
    return simReaches(at) ? [] : miss(`site:${id}`, `S2 site ${id} at (${at.x.toFixed(0)}, ${at.y.toFixed(0)}, ${at.z.toFixed(0)}) is outside the simulation bounds`);
  },
  facility(id: string): Missing[] {
    return createGame().world.facilities.some((f) => f.id === id) ? [] : miss(`facility:${id}`, `facility ${id} is not in New Game`);
  },
  /** A hull the game can build and save. */
  hull(id: string): Missing[] {
    if (!Object.hasOwn(HULLS, id)) return miss(`hull:${id}`, `hull ${id} is not in this build`);
    const builder = Object.entries(RECIPES).find(([, r]) => r.output === id);
    return builder ? need.recipe(builder[0]) : miss(`hull:${id}`, `no recipe builds the ${id}`);
  },
};
/** C3's real hosts: the upper hall's restoration bay faces are `works:hall` and
 * `works:food` ({type:"works"} restores either from either); the gate hall's
 * works use the `gate_panel` host. */
export const worksFaceId = (site: string): string => site === "meridian_upper_hall" ? "works:hall" : `works:${site}`;
export function worksFace(site: string): Missing[] {
  return interactions(createGame()).some((t) => t.id === worksFaceId(site)) ? []
    : miss(`works-face:${site}`, `no works face host ${worksFaceId(site)} for S5's ${site}`);
}
/** Re-evaluate one missing key against this build (for the stale-list check). */
export function stillMissing(key: string): boolean {
  const [kind, ...rest] = key.split(":"), id = rest.join(":");
  switch (kind) {
    case "recipe": return need.recipe(id).length > 0;
    case "source": return need.source(id).length > 0;
    case "story": return need.story(id).some((m) => m.key === key);
    case "story-site": return !placedSite(id as Parameters<typeof placedSite>[0]);
    case "story-host": return need.story(id).some((m) => m.key === key);
    case "route": return need.route(id).length > 0;
    case "site": return need.site(id).length > 0;
    case "facility": return need.facility(id).length > 0;
    case "hull": return need.hull(id).length > 0;
    case "works-face": return worksFace(id).length > 0;
    default: return true;
  }
}
export const s2Route = (id: string): RouteDef => {
  const r = ROUTES.find((x) => x.id === id);
  if (!r) throw new Error(`S2 route ${id} is missing`);
  return r;
};
export const s2Site = (id: string) => SITES.find((x) => x.id === id);
