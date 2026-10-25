import type { SpatialEntry, SpatialKind } from "../../world/types.js";
import { siteBox } from "./access.js";
import { HAZARDS, type HazardDef } from "./hazards.js";
import { RESCUE_PLANS, type RescuePlan } from "./rescue.js";
import { SITES, type SiteDef, type SiteRole } from "./sites.js";
import { STRUCTURE_SOLIDS } from "./structures.js";
import { worldFloor } from "./worldFloor.js";

/** Every S2 place as S1 spatial entries, in a stable order: sites, solids,
 * hazards, rescue stages. `data` carries the original record. Story and
 * volume sites use kind "volume" with `data.role` telling them apart (see
 * the interface note: a dedicated "site" kind is proposed). */
export type S2EntryData =
  | { readonly type: "site"; readonly site: SiteDef }
  | { readonly type: "solid"; readonly structure: string }
  | { readonly type: "hazard"; readonly hazard: HazardDef }
  | { readonly type: "rescue"; readonly plan: RescuePlan };

const SITE_KIND: Readonly<Record<SiteRole, SpatialKind>> = {
  source: "source", landmark: "landmark", refuge: "refuge", mooring: "refuge", story: "volume",
  entrance: "access", rescue_stage: "access", volume: "volume",
};

let cache: SpatialEntry<S2EntryData>[] | null = null;
export function spatialEntries(): readonly SpatialEntry<S2EntryData>[] {
  if (cache) return cache;
  const out: SpatialEntry<S2EntryData>[] = [];
  for (const s of SITES) out.push({ id: s.id, kind: SITE_KIND[s.role], region: s.region, bounds: siteBox(s, worldFloor), data: { type: "site", site: s } });
  for (const s of STRUCTURE_SOLIDS) out.push({ id: `solid:${s.id}`, kind: "solid", region: s.region, bounds: s.bounds,
    data: { type: "solid", structure: s.id } });
  for (const h of HAZARDS) out.push({ id: h.id, kind: "hazard", region: h.region, bounds: h.bounds, data: { type: "hazard", hazard: h } });
  for (const p of RESCUE_PLANS) out.push({ id: p.id, kind: "access", region: p.region,
    bounds: { min: { x: p.stage.x - 2, y: -1.5, z: p.stage.z - 2 }, max: { x: p.stage.x + 2, y: 1.5, z: p.stage.z + 2 } },
    data: { type: "rescue", plan: p } });
  cache = out;
  return out;
}
