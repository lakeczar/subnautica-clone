import type { RegionId } from "../content/registry.js";
import type { GameState, Vec3 } from "../sim/types.js";
import { createWorldMap } from "../world/map.js";
import { boxContains, boxDistance } from "../world/frame.js";
import type { WorldMap } from "../world/types.js";
import { legacyLayout } from "./legacyWorld.js";

/** Presentation residency only. Nothing here writes state or stops simulation. */
export type RenderRegion = "refuge_reef" | "island_chain" | "suspended_garden" | "silt_basin";
export type RenderQuality = "rich" | "light";
export interface RegionArt {
  update(state: GameState | null): void;
  setQuality?(quality: RenderQuality): void;
  /** Optional retention: stop drawing without releasing buffers. A retained
   * owner is always reconciled by update(state) before it draws again. */
  suspend?(): void;
  resume?(): void;
  /** Vertex and index bytes of the meshes this owner created, measured once
   * when it was built (Babylon keeps a CPU copy, so CPU ~ GPU). */
  readonly bytes?: number;
  dispose(): void;
}

const RENDER_REGIONS: ReadonlySet<string> = new Set<RenderRegion>(["refuge_reef", "island_chain", "suspended_garden", "silt_basin"]);
const isRenderRegion = (id: RegionId | null | undefined): id is RenderRegion => !!id && RENDER_REGIONS.has(id);

/** Retention never exceeds this many legacy owners, whatever their bytes. */
export const RESIDENT_REGION_LIMIT = 4;
/** Byte share of all legacy owners (detailed and retained) inside the world
 * budget. Today's four owners fit it, so retention is unchanged; when bytes
 * exceed it, retained owners are released least recently used first. */
export const REGION_OWNER_BYTES = 96 * 1024 * 1024;

let legacyMap: WorldMap | null = null;
/** The legacy map: today's handover lines as footprints, prefetch zones as links. */
export function legacyRegionMap(): WorldMap {
  return legacyMap ??= createWorldMap(legacyLayout());
}

/** The region the viewer is in, except that `previous` is kept while the
 * viewer is inside the `hold` box of the new region's link back to it. */
export function primaryRegion(map: WorldMap, p: Readonly<Vec3>, previous: RegionId | null): RegionId | null {
  const here = map.regionAt(p);
  if (!previous || !here || here === previous) return here;
  const back = map.region(here)?.adjacency.find(l => l.to === previous);
  return back?.hold && boxContains(back.hold, p) ? previous : here;
}
/** The linked region drawn in detail beside `primary`: nearest portal, ties
 * to the earlier link. */
export function adjoiningRegion(map: WorldMap, primary: RegionId, p: Readonly<Vec3>): RegionId | null {
  let best: RegionId | null = null, distance = Infinity;
  for (const link of map.region(primary)?.adjacency ?? []) {
    const d = boxDistance(link.portal, p);
    if (d < distance) { best = link.to; distance = d; }
  }
  return best;
}

/** Two adjoining detailed owners, chosen from the world map. Owners that
 * leave the detailed pair are suspended and retained, least recently used
 * first out, within `limit` owners and `maxBytes`; owners without suspend
 * support are disposed as before. Retained owners never draw, never count as
 * resident for actors and are reconciled against the current state on
 * return. Silhouettes and pinned moving actors have their own lifetimes. */
export function createRegionResidency(
  create: (region: RenderRegion) => RegionArt,
  limit: number = RESIDENT_REGION_LIMIT,
  options: { map?: WorldMap; maxBytes?: number } = {},
): RegionArt & {
  readonly active: readonly RenderRegion[];
  readonly retained: readonly RenderRegion[];
  /** Bytes of every live and retained owner. */
  readonly bytes: number;
  contains(position: Readonly<Vec3>): boolean;
  /** Construct one nearby non-resident owner directly into retention. Only
   * for idle presentation time; returns the prepared region, if any. */
  prepare(): RenderRegion | null;
  /** Release retained owners whose buffers can no longer be trusted. */
  discardRetained(): void;
} {
  const map = options.map ?? legacyRegionMap(), maxBytes = options.maxBytes ?? REGION_OWNER_BYTES;
  const live = new Map<RenderRegion, RegionArt>(), kept = new Map<RenderRegion, RegionArt>();
  let primary: RegionId | null = null, quality: RenderQuality = "rich", disposed = false;
  const capacity = Math.max(2, limit);
  const bytesOf = (owners: Iterable<RegionArt>): number => { let n = 0; for (const o of owners) n += o.bytes ?? 0; return n; };
  const total = (): number => bytesOf(live.values()) + bytesOf(kept.values());
  /** Release retained owners, oldest first, until `room` more owners of
   * `roomBytes` fit both limits. */
  const trim = (room: number, roomBytes = 0): void => {
    for (const [id, art] of kept) {
      if (live.size + kept.size + room <= capacity && total() + roomBytes <= maxBytes) break;
      kept.delete(id); art.dispose();
    }
  };
  const retire = (id: RenderRegion, art: RegionArt): void => {
    if (!art.suspend || !art.resume) { art.dispose(); return; }
    art.suspend(); kept.set(id, art);
  };
  const wanted = (p: Readonly<Vec3>): Set<RenderRegion> => {
    primary = primaryRegion(map, p, primary);
    const pair = new Set<RenderRegion>();
    if (isRenderRegion(primary)) pair.add(primary);
    const next = primary && adjoiningRegion(map, primary, p);
    if (isRenderRegion(next)) pair.add(next);
    return pair;
  };
  return {
    get active() { return [...live.keys()]; },
    get retained() { return [...kept.keys()]; },
    get bytes() { return total(); },
    contains(position) { const id = map.regionAt(position); return isRenderRegion(id) && live.has(id); },
    update(state) {
      if (disposed) return;
      const want = wanted(state?.player.pose.position ?? { x: 0, y: 0, z: 22 });
      for (const [id, art] of live) if (!want.has(id)) { live.delete(id); retire(id, art); }
      // Re-attach retained owners before any eviction for a cold construction.
      for (const id of want) {
        const art = kept.get(id);
        if (!art || live.has(id)) continue;
        kept.delete(id); art.resume!(); art.setQuality?.(quality); live.set(id, art);
      }
      for (const id of want) if (!live.has(id)) {
        trim(1);
        const art = create(id); art.setQuality?.(quality); live.set(id, art);
      }
      trim(0);
      for (const art of live.values()) art.update(state);
    },
    setQuality(next) { quality = next; for (const art of live.values()) art.setQuality?.(next); },
    prepare() {
      if (disposed || !isRenderRegion(primary) || live.size + kept.size >= capacity || total() >= maxBytes) return null;
      const seen = new Set<RegionId>([primary]), queue: RegionId[] = [primary];
      for (let region = queue.shift(); region; region = queue.shift()) {
        if (isRenderRegion(region) && !live.has(region) && !kept.has(region)) {
          const art = create(region);
          if (!art.suspend || !art.resume) { art.dispose(); return null; }
          art.setQuality?.(quality); art.suspend(); kept.set(region, art);
          // A prepared owner that does not fit the byte share is not kept.
          trim(0);
          return kept.has(region) ? region : null;
        }
        for (const link of map.region(region)?.adjacency ?? [])
          if (!seen.has(link.to)) { seen.add(link.to); queue.push(link.to); }
      }
      return null;
    },
    discardRetained() { for (const art of kept.values()) art.dispose(); kept.clear(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const art of live.values()) art.dispose();
      for (const art of kept.values()) art.dispose();
      live.clear(); kept.clear(); primary = null;
    },
  };
}

/** Only identities that must survive a remote operation are pinned. Parked
 * wrecks otherwise reconstruct from their existing IDs/poses on re-entry. */
export function pinnedVehicleIds(state: GameState | null): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!state) return ids;
  for (const id of [state.player.controlledVehicleId, state.player.interiorId,
    state.recovery.operation?.vehicleId, state.fleet.docking?.transaction?.vehicleId]) if (id) ids.add(id);
  const carrier = state.fleet.docking?.vehicleId;
  if (carrier && (ids.has(carrier) || state.fleet.docking?.transaction ||
    state.fleet.vehicles.some(v => ids.has(v.id) && v.berth?.carrierId === carrier))) {
    ids.add(carrier);
    for (const v of state.fleet.vehicles) if (v.berth?.carrierId === carrier) ids.add(v.id);
  }
  return ids;
}
