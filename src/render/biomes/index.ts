import type { ChunkArtFactory, ChunkBuildContext, TemplateRecipe } from "../kit/types.js";
import { defaultContext } from "../kit/factories.js";
import { biomeAt } from "../../content/regions/layout.js";
import { worldFloor } from "../../content/regions/worldFloor.js";
import { scatterFactory } from "./scatter.js";
import { structuresFactory } from "./structures.js";
import { terrainFactory } from "./terrain.js";
import { S2_TEMPLATES } from "./templates.js";

/** S2 chunk art, registered by factory ID next to the kit's own factories;
 * descriptors in content/regions reference them by ID. */
export const S2_FACTORIES: readonly ChunkArtFactory[] = [terrainFactory, scatterFactory, structuresFactory];
export const S2_TEMPLATE_LIBRARY: readonly TemplateRecipe[] = S2_TEMPLATES;
/** The kit's build context over the shared floor, with S2 biomes. */
export function s2BuildContext(stepMs = 0.75): ChunkBuildContext & { startStep(): void } {
  return defaultContext(worldFloor, stepMs, undefined, biomeAt);
}
export { REGION_OPTICS, opticsAt } from "./optics.js";
