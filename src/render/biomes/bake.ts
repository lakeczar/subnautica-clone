import type { ChunkDescriptor } from "../../world/types.js";
import { worldLayout } from "../../content/regions/layout.js";
import { seededStream } from "../../content/regions/noise.js";
import { worldFloor } from "../../content/regions/worldFloor.js";
import { caveDef, CAVE_SOURCES } from "../../content/regions/caves.js";
import { surfaceHeight } from "../../sim/world.js";
import { encodeKitCave, liveKitCave } from "../../world/caves/kitCollision.js";
export { packKitCaves } from "../../world/caves/kitCollision.js";
import { caveLightField, encodeLightField } from "../caves/lightField.js";
import { liveTerrain } from "./terrain.js";
import { encodeTerrain } from "./terrainCodec.js";
import { terrainFileName } from "./terrainAssets.js";

/** Offline terrain bake (run by `scripts/bake-terrain.mjs`): every chunk with
 * S2 terrain, both LODs, encoded with `terrainCodec`. Pure and deterministic,
 * so the same sources always give the same bytes. */
export function bakeTargets(): ChunkDescriptor[] {
  return worldLayout().chunks.filter(c => c.art.some(a => a.factory === "s2.terrain"));
}
export function bakeChunkBytes(chunk: ChunkDescriptor): Uint8Array {
  const ctx = { floor: worldFloor, random: seededStream, due: () => false };
  const run = (lod: "fine" | "coarse") => {
    const g = liveTerrain(ctx, chunk, lod);
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value.meshes;
  };
  const { min, max } = chunk.bounds;
  return encodeTerrain({ minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z }, { fine: run("fine"), coarse: run("coarse") });
}
export { terrainFileName };

/** CW-1's cave bake, beside the terrain: per kit cave, its collision record
 * (rock, collar, inside water: `world/caves/kitCollision.ts`) and its light
 * field (`render/caves/lightField.ts`), exactly what the game would generate
 * live. The browser loads these; it never builds a cave. */
export function bakeCaveTargets(): string[] {
  return CAVE_SOURCES.map(s => s.id);
}
export function bakeCaveBytes(id: string): { collision: Uint8Array; light: Uint8Array } {
  const source = CAVE_SOURCES.find(s => s.id === id);
  if (!source) throw new Error(`Unknown cave: ${id}`);
  return {
    collision: encodeKitCave(liveKitCave(source, worldFloor, surfaceHeight)),
    light: encodeLightField(caveLightField(caveDef(id, worldFloor), worldFloor)),
  };
}
