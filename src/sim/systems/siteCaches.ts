/** LS-1 1b: finite caches at placed lost sites. Each is one fixed cache container
 * (`cache:<id>`) holding its authored contents from New Game; taking moves items out
 * through the ordinary transfer, so there is no "opened" flag. The container opens
 * within reach of its point, like a recovery cache. Item IDs are fixed
 * (`cache.<id>.<kind>`), never drawn from the instance sequence, so adding a cache
 * to an older save (`save/content.ts`) changes no other ID. */
import { LOST_SITE_CACHES, siteCacheContainerId } from "../../content/systems/lostSites.js";
import type { CacheItem, LostSiteCacheId } from "../../content/systems/lostSites.js";
import type { ItemKind } from "../../content/registry.js";
import type { ContainerState, ItemStack } from "../types.js";

/** Metres from a cache's point within which its container opens. */
export const SITE_CACHE_REACH = 4;
export const SITE_CACHE_IDS = Object.keys(LOST_SITE_CACHES) as LostSiteCacheId[];
const BY_CONTAINER = new Map(SITE_CACHE_IDS.map((id) => [siteCacheContainerId(id), id]));
/** The site cache a container belongs to, if any. */
export const siteCacheOf = (containerId: string): LostSiteCacheId | null => BY_CONTAINER.get(containerId) ?? null;

/** One authored stack per kind; a stackable kind is one stack, a cell one item each. */
export function siteCacheItems(id: LostSiteCacheId): ItemStack[] {
  const out: ItemStack[] = [];
  for (const [kind, n] of Object.entries(LOST_SITE_CACHES[id].contents) as [CacheItem, number][]) {
    if (kind === "bio_cell") for (let k = 0; k < n; k++)
      out.push({ id: `cache.${id}.${kind}.${k}`, kind: kind as ItemKind, quantity: 1, containerId: siteCacheContainerId(id), fitted: null, charge: 100, provenance: "public" });
    else out.push({ id: `cache.${id}.${kind}`, kind: kind as ItemKind, quantity: n, containerId: siteCacheContainerId(id), fitted: null, charge: null, provenance: "public" });
  }
  return out;
}
/** A cache's container, sized to exactly its authored contents. */
export function siteCacheContainer(id: LostSiteCacheId, cuOf: (kind: string) => number): ContainerState {
  const capacity = Object.entries(LOST_SITE_CACHES[id].contents).reduce((n, [kind, q]) => n + cuOf(kind) * (q as number), 0);
  return { id: siteCacheContainerId(id), kind: "cache", capacity, ownerId: `lost:${LOST_SITE_CACHES[id].site}` };
}
