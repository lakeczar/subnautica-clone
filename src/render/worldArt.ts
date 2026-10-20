import { terrainHeight } from "../sim/world.js";
import { createWorldMap } from "../world/map.js";
import type { Rect, SpatialEntry, WorldLayout, WorldMap } from "../world/types.js";
import { TERRAIN_EXTENT } from "./terrainSurface.js";
import type { ChunkArtFactory, TemplateRecipe } from "./kit/types.js";
import { legacyTerrainFactory } from "./legacyTerrain.js";
import { legacyLayout, withLegacyTerrain } from "./legacyWorld.js";
import { S2_ART } from "./biomes/pack.js";

/** One stream's chunk art: factories registered by ID, the templates they
 * instance, and optionally the authored world layout they draw. */
export interface WorldArtPack {
  readonly id: string;
  readonly factories: readonly ChunkArtFactory[];
  readonly templates?: readonly TemplateRecipe[];
  /** The authored layout. At most one pack supplies it; today's refined
   * terrain is added to the columns it covers (`withLegacyTerrain`). */
  readonly layout?: () => WorldLayout;
  /** Place entries for the map's index. */
  readonly entries?: () => readonly SpatialEntry[];
  /** Physical floor for factories, until `terrainHeight` is the composed floor. */
  readonly floor?: (x: number, z: number) => number;
  readonly biomeAt?: (x: number, z: number) => string;
  /** Where today's refined terrain is drawn (default `TERRAIN_EXTENT`): the
   * pack that owns the layout draws everything outside it. */
  readonly legacyExtent?: Rect;
}

export const LEGACY_ART: WorldArtPack = { id: "legacy", factories: [legacyTerrainFactory] };

/** The composition list. A region stream plugs in by adding its pack here,
 * e.g. `{ id: "s2", factories: S2_FACTORIES, templates: S2_TEMPLATE_LIBRARY,
 * layout: worldLayout, entries: spatialEntries, floor: worldFloor, biomeAt,
 * legacyExtent: <its exact preserve> }`.
 * The renderer reads only the composed result. */
export const WORLD_ART: readonly WorldArtPack[] = [LEGACY_ART, S2_ART];

export interface ComposedWorld {
  readonly map: WorldMap;
  readonly factories: readonly ChunkArtFactory[];
  readonly templates: readonly TemplateRecipe[];
  readonly floor: (x: number, z: number) => number;
  readonly biomeAt?: (x: number, z: number) => string;
}

/** Compose packs into one validated map plus its factories. Fails at
 * composition, not in play: two layouts or floors, a duplicate factory or
 * template, or a chunk naming an unregistered factory. */
export function composeWorldArt(packs: readonly WorldArtPack[] = WORLD_ART): ComposedWorld {
  const one = <K extends "layout" | "floor" | "biomeAt" | "legacyExtent">(key: K): WorldArtPack[K] | undefined => {
    const given = packs.filter(p => p[key]);
    if (given.length > 1) throw new Error(`World art: ${given.map(p => p.id).join(", ")} all supply ${key}.`);
    return given[0]?.[key];
  };
  const authored = one("layout"), extent = one("legacyExtent") ?? TERRAIN_EXTENT;
  const layout = authored ? withLegacyTerrain(authored(), extent) : legacyLayout(extent);
  const factories = packs.flatMap(p => p.factories), templates = packs.flatMap(p => p.templates ?? []);
  const unique = (kind: string, ids: readonly string[]): void => {
    const seen = new Set<string>();
    for (const id of ids) { if (seen.has(id)) throw new Error(`World art: duplicate ${kind} ${id}.`); seen.add(id); }
  };
  unique("factory", factories.map(f => f.id));
  unique("template", templates.map(t => t.id));
  const registered = new Set(factories.map(f => f.id));
  const missing = [...new Set(layout.chunks.flatMap(c => c.art.map(a => a.factory)).filter(id => !registered.has(id)))];
  if (missing.length) throw new Error(`World art: no factory registered for ${missing.join(", ")}.`);
  const biomeAt = one("biomeAt");
  return {
    map: createWorldMap(layout, packs.flatMap(p => p.entries?.() ?? [])),
    factories, templates, floor: one("floor") ?? terrainHeight, ...(biomeAt ? { biomeAt } : {}),
  };
}
