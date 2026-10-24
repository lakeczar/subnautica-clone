/** ENV-1: an interior's collision as COL-1's static collider, composed over an
 * exterior world. Every shell piece is a box (architecture is box-exact on the
 * quarter-turn grid), and so is every `box`-class prop until stage 2 bakes
 * props' shapes from their art. Other classes never collide (`templates.ts`). */
import { placementBox, boxToWorld } from "../../content/interiors/geometry.js";
import { TEMPLATES, type TemplateId } from "../../content/interiors/templates.js";
import type { InteriorDef } from "../../content/interiors/types.js";
import { buildBoxes, createStaticCollider } from "../../world/collision/collider.js";
import { composeStaticWorld } from "../../world/collision/world.js";
import type { Aabb } from "../../world/types.js";
import type { WorldQueries } from "../types.js";

export interface IdBox { readonly id: string; readonly min: Aabb["min"]; readonly max: Aabb["max"] }

/** The interior's colliding boxes, world. */
export function interiorBoxes(def: InteriorDef): IdBox[] {
  return [
    ...def.shell.map((s) => ({ id: `${def.id}.${s.id}`, ...boxToWorld(def, s.min, s.max) })),
    ...def.dressing.filter((p) => TEMPLATES[p.template as TemplateId]?.collision === "box")
      .map((p) => ({ id: `${def.id}.${p.id}`, ...placementBox(def, p) })),
  ];
}

/** The exterior with the interior (and any extra boxes, such as a parked hull) in it. */
export function interiorWorld(def: InteriorDef, exterior: WorldQueries, extra: readonly IdBox[] = []): WorldQueries {
  const collider = createStaticCollider(def.id, [buildBoxes(def.id, [...interiorBoxes(def), ...extra])]);
  return composeStaticWorld({ exterior, solids: [], collider });
}
