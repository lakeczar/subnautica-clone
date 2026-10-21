/** What the build under test contains, for phases written ahead of their content.
 * Each check names one declared ID (S2 route, S5 story host, S9 recipe/source/site)
 * and reports it missing until C3 composes it. Nothing here changes the game. */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
import { WORLD_BOUNDS, withinWorldBounds } from "../../src/sim/world.js";
import type { Vec3 } from "../../src/sim/types.js";

/** S9's campaign module, if this build has it (it lands with C3). */
interface Campaign {
  CAMPAIGN_PENDING?: Readonly<Record<string, string>>;
  CAMPAIGN_SITES?: Readonly<Record<string, { s2: string; work: Vec3; depth: number }>>;
}
let campaign: Campaign | null = null;
/** C3's composed stops (work pose and craft mooring per site), once C3 lands. */
let stops: Readonly<Record<string, { work: Vec3; mooring: Vec3; fabrication: string | null }>> = {};
/** Import a module the build may not have yet. Absence is decided before importing,
 * from the module's own file; once it exists, every error propagates, including a
 * missing dependency inside it. `spec` is relative to this file, or an absolute URL. */
export async function optionalModule<T>(spec: string): Promise<T | null> {
  const url = new URL(spec, import.meta.url);
  if (!existsSync(fileURLToPath(url))) return null;
  return await import(url.href) as T;
}
export async function loadCampaign(): Promise<void> {
  campaign = await optionalModule<Campaign>("../../src/content/campaign/index.js");
  stops = (await optionalModule<{ WORKING_STOPS: typeof stops }>("../../src/content/stops.js"))?.WORKING_STOPS ?? {};
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
/** B1's simulation bounds, which C3 lifts to S1's world frame (STREAMS "S1 world frame"). */
const B1_BOUNDS = { minX: -76, maxX: 248, minZ: -320, maxZ: 66, minY: -300 } as const;
const S1_FRAME = { minX: -576, maxX: 1472, minZ: -1632, maxZ: 160, minY: -800, maxY: 100 } as const;
export const simBoundsAreB1 = (): boolean => {
  // Widened: each build declares its bounds as literal types.
  const w: Record<"minX" | "maxX" | "minZ" | "maxZ", number> = WORLD_BOUNDS, minY: number = WORLD_VERTICAL_BOUNDS.minY;
  return w.minX === B1_BOUNDS.minX && w.maxX === B1_BOUNDS.maxX && w.minZ === B1_BOUNDS.minZ && w.maxZ === B1_BOUNDS.maxZ &&
    minY === B1_BOUNDS.minY;
};
const inS1Frame = (p: Vec3): boolean => p.x >= S1_FRAME.minX && p.x <= S1_FRAME.maxX && p.z >= S1_FRAME.minZ &&
  p.z <= S1_FRAME.maxZ && p.y >= S1_FRAME.minY && p.y <= S1_FRAME.maxY;
/** A present ID the simulation cannot reach. Pending only for the one uncomposed
 * condition (B1's bounds, a point inside S1's frame); otherwise it is broken. */
function unreachable(kind: string, id: string, at: Vec3, text: string): Missing[] {
  if (simBoundsAreB1() && inS1Frame(at)) return miss("bounds:b1-simulation", `${text}: the simulation still uses B1's bounds`);
  return miss(`broken:${kind}:${id}`, `${text}: ${inS1Frame(at) ? "outside the composed simulation bounds" : "outside S1's world frame"}`);
}

/** One missing capability: a stable key checked against the expected-pending list,
 * and a readable line. `kind:id` means the ID is absent; `bounds:b1-simulation` means
 * the simulation has not lifted B1's bounds yet; `broken:…` and `refused:…` mean the
 * ID exists but cannot be used, and are never listable as pending. */
export interface Missing { key: string; text: string }
const miss = (key: string, text: string): Missing[] => [{ key, text }];

export const need = {
  recipe(id: string): Missing[] {
    if (!Object.hasOwn(RECIPES, id)) return miss(`recipe:${id}`, `recipe ${id} is not in this build`);
    // Present but refused by the game: never pending.
    const pending = campaign?.CAMPAIGN_PENDING?.[id];
    return pending ? miss(`refused:recipe:${id}`, `recipe ${id} is in the build but S9 marks its ${pending} unplaced`) : [];
  },
  source(id: string): Missing[] {
    if (!Object.hasOwn(SOURCES, id)) return miss(`source:${id}`, `source ${id} is not in this build`);
    const p = SOURCES[id as keyof typeof SOURCES].position;
    return simReaches(p) ? [] : unreachable("source", id, p, `source ${id} at (${p.x}, ${p.y}, ${p.z})`);
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
    if (!outside.length) return [];
    if (outside.some((p) => !Number.isFinite(p.x + p.y + p.z))) return miss(`broken:route:${id}`, `S2 route ${id} has non-finite points`);
    const worst = outside.find((p) => !inS1Frame(p)) ?? outside[0]!;
    return unreachable("route", id, worst, `S2 route ${id}: ${outside.length}/${r.path.length} points unreachable, e.g. ` +
      `(${worst.x.toFixed(0)}, ${worst.y.toFixed(0)}, ${worst.z.toFixed(0)})`);
  },
  /** An S2 site the simulation can reach. */
  site(id: string): Missing[] {
    const s = SITES.find((x) => x.id === id);
    if (!s) return miss(`site:${id}`, `S2 site ${id} is not in this build`);
    const at = { x: s.work?.x ?? s.at.x, y: s.work?.y ?? (typeof s.at.y === "number" ? s.at.y : -1), z: s.work?.z ?? s.at.z };
    return simReaches(at) ? [] : unreachable("site", id, at, `S2 site ${id} at (${at.x.toFixed(0)}, ${at.y.toFixed(0)}, ${at.z.toFixed(0)})`);
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
  if (key === "bounds:b1-simulation") return simBoundsAreB1();
  switch (kind) {
    case "recipe": return need.recipe(id).some((m) => m.key === key);
    case "source": return need.source(id).some((m) => m.key === key);
    case "story": return need.story(id).some((m) => m.key === key);
    case "story-site": return !placedSite(id as Parameters<typeof placedSite>[0]);
    case "story-host": return need.story(id).some((m) => m.key === key);
    case "route": return need.route(id).some((m) => m.key === key);
    case "site": return need.site(id).some((m) => m.key === key);
    case "facility": return need.facility(id).length > 0;
    case "hull": return need.hull(id).some((m) => m.key === key);
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
