import type { WorldArtPack } from "../worldArt.js";
import { S2_TERRAIN_SKIP, biomeAt, worldLayout } from "../../content/regions/layout.js";
import { spatialEntries } from "../../content/regions/spatial.js";
import { worldFloor } from "../../content/regions/worldFloor.js";
import { S2_FACTORIES, S2_TEMPLATE_LIBRARY } from "./index.js";
import { prewarmScatter } from "./scatter.js";

/** S2's world art for `WORLD_ART`: the seven-region layout, its factories and
 * templates, place entries and the shared floor. Today's refined terrain is
 * drawn by the legacy factory over exactly `S2_TERRAIN_SKIP` (accepted B1's
 * `TERRAIN_EXTENT`), the extent `s2.terrain` leaves out. */
export const S2_ART: WorldArtPack = {
  id: "s2",
  factories: S2_FACTORIES,
  templates: S2_TEMPLATE_LIBRARY,
  layout: () => { prewarmScatter(); return worldLayout(); },
  entries: spatialEntries,
  floor: worldFloor,
  biomeAt,
  legacyExtent: S2_TERRAIN_SKIP,
};
