import { ROUTE_REGIONS } from "../content/routes.js";
import type { GameState, Vec3 } from "../sim/types.js";

/** Presentation residency only. Nothing here writes state or stops simulation. */
export type RenderRegion = "refuge_reef" | "island_chain" | "suspended_garden" | "silt_basin";
export type RenderQuality = "rich" | "light";
export interface RegionArt {
  update(state: GameState | null): void;
  setQuality?(quality: RenderQuality): void;
  dispose(): void;
}

export function renderRegionAt(p: Readonly<Vec3>): RenderRegion {
  const basin = ROUTE_REGIONS.silt_basin.bounds, canopy = ROUTE_REGIONS.suspended_garden.bounds;
  if (p.x >= basin.minX && p.z <= basin.maxZ) return "silt_basin";
  // The outer return lane is east of the Canopy bounds, in the same visible
  // corridor. Do not unload its landmark merely because a return crosses it.
  if (p.x >= canopy.minX && p.z <= canopy.maxZ) return "suspended_garden";
  if (p.z < -22 && p.x > -30 && p.x < 70) return "island_chain";
  return "refuge_reef";
}

function adjoining(region: RenderRegion, p: Readonly<Vec3>): RenderRegion {
  switch (region) {
    case "silt_basin": return "suspended_garden";
    case "suspended_garden": return p.z < -154 ? "silt_basin" : "refuge_reef";
    case "island_chain": return p.x > 42 && p.z < -52 ? "suspended_garden" : "refuge_reef";
    case "refuge_reef": return p.x > 48 && p.z < -48 ? "suspended_garden" : "island_chain";
  }
}

/** Two adjoining detailed owners. Silhouettes and pinned moving actors have
 * their own bounded lifetimes. Discard old owners before constructing new ones
 * so an ordinary transition never temporarily retains four detailed regions. */
export function createRegionResidency(create: (region: RenderRegion) => RegionArt): RegionArt & {
  readonly active: readonly RenderRegion[];
  contains(position: Readonly<Vec3>): boolean;
} {
  const live = new Map<RenderRegion, RegionArt>();
  let primary: RenderRegion | null = null, quality: RenderQuality = "rich", disposed = false;
  return {
    get active() { return [...live.keys()]; },
    contains(position) { return live.has(renderRegionAt(position)); },
    update(state) {
      if (disposed) return;
      const p = state?.player.pose.position ?? { x: 0, y: 0, z: 22 };
      let next = renderRegionAt(p);
      // Eight metres of unsaved hysteresis across the shared southern edge.
      // Save replacement still reconciles every handle against the new state.
      const edge = ROUTE_REGIONS.silt_basin.bounds.maxZ;
      if (primary === "suspended_garden" && next === "silt_basin" && p.z > edge - 8) next = primary;
      if (primary === "silt_basin" && next === "suspended_garden" && p.z < edge + 8) next = primary;
      primary = next;
      const wanted = new Set([primary, adjoining(primary, p)]);
      for (const [id, art] of live) if (!wanted.has(id)) { art.dispose(); live.delete(id); }
      for (const id of wanted) if (!live.has(id)) {
        const art = create(id); art.setQuality?.(quality); live.set(id, art);
      }
      for (const art of live.values()) art.update(state);
    },
    setQuality(next) { quality = next; for (const art of live.values()) art.setQuality?.(next); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const art of live.values()) art.dispose();
      live.clear(); primary = null;
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
