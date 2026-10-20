import type { ChunkArtFactory, ChunkBuildContext, TemplateRecipe } from "../kit/types.js";
import { seededStream } from "../../content/regions/noise.js";
import { worldFloor } from "../../content/regions/worldFloor.js";
import { scatterFactory } from "./scatter.js";
import { structuresFactory } from "./structures.js";
import { terrainFactory } from "./terrain.js";
import { S2_TEMPLATES } from "./templates.js";

/** S2 chunk art, registered by factory ID. The kit (S1) registers these and
 * the templates; descriptors in content/regions reference them by ID. */
export const S2_FACTORIES: readonly ChunkArtFactory[] = [terrainFactory, scatterFactory, structuresFactory];
export const S2_TEMPLATE_LIBRARY: readonly TemplateRecipe[] = S2_TEMPLATES;
/** The build context S2 factories expect: the shared floor and a seeded stream. */
export const S2_BUILD_CONTEXT: ChunkBuildContext = { floor: worldFloor, random: seededStream };
export { REGION_OPTICS, opticsAt } from "./optics.js";
