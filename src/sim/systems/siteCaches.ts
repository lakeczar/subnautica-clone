/** LS-1 1b: finite caches at placed lost sites. A cache is found, not owned: until the
 * diver first comes within reach of its point it is only a place, and no container or
 * item exists for it, so every item in the inventory stays the player's. On first reach
 * (`openSiteCaches`, from the fixed step) its one cache container (`site_cache_<id>`)
 * appears holding its authored contents, and it stays, emptied or not: the container's
 * presence is the "found" record, so nothing refills. Taking moves items out through the
 * ordinary transfer; a site cache is take-only. Item IDs are fixed
 * (`site_cache_<id>_<kind>`, a cell `…_c<n>` so it never reads as a sequence number),
 * never drawn from the instance sequence, so finding a cache changes no other ID. */
import { LOST_SITE_CACHES, siteCacheContainerId } from "../../content/systems/lostSites.js";
import type { CacheItem, LostSiteCacheId } from "../../content/systems/lostSites.js";
import { ITEMS } from "../../content/registry.js";
import { CHART_CELL } from "../../content/systems/navigation.js";
import type { ItemKind } from "../../content/registry.js";
import type { ContainerState, GameState, ItemStack, Vec3 } from "../types.js";

/** Metres from a cache's point within which it is found and its container opens. */
export const SITE_CACHE_REACH = 4;
export const SITE_CACHE_IDS = Object.keys(LOST_SITE_CACHES) as LostSiteCacheId[];
const BY_CONTAINER = new Map(SITE_CACHE_IDS.map((id) => [siteCacheContainerId(id), id]));
/** The site cache a container belongs to, if any. */
export const siteCacheOf = (containerId: string): LostSiteCacheId | null => BY_CONTAINER.get(containerId) ?? null;
const within = (p: Vec3, q: Vec3): boolean => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < SITE_CACHE_REACH;
/** Whether the diver has found this cache (its container exists). */
export const siteCacheFound = (s: GameState, id: LostSiteCacheId): boolean =>
  s.inventory.containers.some((c) => c.id === siteCacheContainerId(id));

// The fixed step looks up only the diver's own chart cell (`CHART_CELL`, the spatial key
// exploration already uses), so its work does not grow with the authored caches.
const cellKey = (i: number, k: number): number => (i + 1000) * 4096 + (k + 1000);
/** An index of `points` by every chart cell their reach touches: a lookup returns the IDs
 * whose reach touches the cell at `p`, in the order given (shared; never mutated). Its
 * cost per lookup is one map read, whatever the number of points. */
export function siteCacheIndex<Id extends string>(points: readonly (readonly [Id, Vec3])[]): (p: Vec3) => readonly Id[] {
  const byCell = new Map<number, Id[]>(), none: readonly Id[] = [];
  for (const [id, { x, z }] of points)
    for (let i = Math.floor((x - SITE_CACHE_REACH) / CHART_CELL); i <= Math.floor((x + SITE_CACHE_REACH) / CHART_CELL); i++)
      for (let k = Math.floor((z - SITE_CACHE_REACH) / CHART_CELL); k <= Math.floor((z + SITE_CACHE_REACH) / CHART_CELL); k++) {
        const key = cellKey(i, k), list = byCell.get(key);
        if (list) list.push(id); else byCell.set(key, [id]);
      }
  return (p) => byCell.get(cellKey(Math.floor(p.x / CHART_CELL), Math.floor(p.z / CHART_CELL))) ?? none;
}
/** The caches whose reach touches the chart cell at `p`: the only ones the step checks. */
export const siteCacheCandidates = siteCacheIndex(SITE_CACHE_IDS.map((id) => [id, LOST_SITE_CACHES[id].position] as const));
const NONE: readonly LostSiteCacheId[] = [];

/** Finds every cache within reach of the diver that is not found yet: its container and
 * authored contents appear. Returns the caches found this step (a shared empty list
 * when none: no allocation on the ordinary step). */
export function openSiteCaches(s: GameState): readonly LostSiteCacheId[] {
  const p = s.player.pose.position, near = siteCacheCandidates(p);
  let found: LostSiteCacheId[] | null = null;
  for (const id of near) {
    if (!within(p, LOST_SITE_CACHES[id].position) || siteCacheFound(s, id)) continue;
    s.inventory.containers.push(siteCacheContainer(id));
    s.inventory.items.push(...siteCacheItems(id));
    (found ??= []).push(id);
  }
  return found ?? NONE;
}
/** Validation: a found cache holds only its authored kinds, never more than authored. */
export function siteCacheContentsValid(s: GameState, id: LostSiteCacheId): boolean {
  const authored = LOST_SITE_CACHES[id].contents as Partial<Record<string, number>>, held: Record<string, number> = {};
  for (const i of s.inventory.items) if (i.containerId === siteCacheContainerId(id)) held[i.kind] = (held[i.kind] ?? 0) + i.quantity;
  return Object.entries(held).every(([kind, n]) => n <= (authored[kind] ?? 0));
}

/** One authored stack per kind; a stackable kind is one stack, a cell one item each. */
export function siteCacheItems(id: LostSiteCacheId): ItemStack[] {
  const out: ItemStack[] = [];
  for (const [kind, n] of Object.entries(LOST_SITE_CACHES[id].contents) as [CacheItem, number][]) {
    if (kind === "bio_cell") for (let k = 0; k < n; k++)
      out.push({ id: `site_cache_${id}_${kind}_c${k}`, kind: kind as ItemKind, quantity: 1, containerId: siteCacheContainerId(id), fitted: null, charge: 100, provenance: "public" });
    else out.push({ id: `site_cache_${id}_${kind}`, kind: kind as ItemKind, quantity: n, containerId: siteCacheContainerId(id), fitted: null, charge: null, provenance: "public" });
  }
  return out;
}
/** A cache's container, sized to exactly its authored contents. */
export function siteCacheContainer(id: LostSiteCacheId): ContainerState {
  const capacity = Object.entries(LOST_SITE_CACHES[id].contents).reduce((n, [kind, q]) => n + ITEMS[kind as ItemKind].cu * (q as number), 0);
  return { id: siteCacheContainerId(id), kind: "cache", capacity, ownerId: `lost_${LOST_SITE_CACHES[id].site}` };
}
