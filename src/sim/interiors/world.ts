/** ENV-1: an interior's collision as COL-1's static collider, composed over an
 * explicit exterior. Every shell piece is a box (architecture is box-exact on the
 * quarter-turn grid), and so is every `box`-class prop until stage 2 bakes props'
 * shapes from their art. Other classes never collide (`templates.ts`).
 *
 * **The exterior contract** (until stage 2 composes the game's own world, caves
 * included, through COL-1 B): terrain (a floor function) and box solids. Near the
 * interior, `composeStaticWorld` sweeps only its collider and the solids it is
 * given, never the exterior's own move, so both go into that one sweep: the
 * solids as the composer's roster, and the terrain as a conservative heightfield
 * member of the collider over the area the validator samples. A move, an
 * approach or a rise that meets any of them stops there. */
import { placementBox, boxToWorld } from "../../content/interiors/geometry.js";
import { TEMPLATES, type TemplateId } from "../../content/interiors/templates.js";
import type { InteriorDef } from "../../content/interiors/types.js";
import { buildBoxes, createStaticCollider } from "../../world/collision/collider.js";
import { sampleHeightfield } from "../../world/collision/heightfield.js";
import { composeStaticWorld } from "../../world/collision/world.js";
import type { Aabb, Rect } from "../../world/types.js";
import type { WorldQueries } from "../types.js";
import { createWorldQueries, type Solid } from "../world.js";

export interface IdBox { readonly id: string; readonly min: Aabb["min"]; readonly max: Aabb["max"] }

/** The world around an interior: terrain and box solids (see the contract above). */
export interface InteriorExterior {
  readonly floor: (x: number, z: number) => number;
  readonly solids: readonly Solid[];
}
/** The terrain heightfield's cell, metres: the validator's lattice pitch. */
export const TERRAIN_CELL = 0.5;

/** The interior's colliding boxes, world. */
export function interiorBoxes(def: InteriorDef): IdBox[] {
  return [
    ...def.shell.map((s) => ({ id: `${def.id}.${s.id}`, ...boxToWorld(def, s.min, s.max) })),
    ...def.dressing.filter((p) => TEMPLATES[p.template as TemplateId]?.collision === "box")
      .map((p) => ({ id: `${def.id}.${p.id}`, ...placementBox(def, p) })),
  ];
}

/** The exterior with the interior (and any extra boxes, such as a parked hull) in it.
 * `area` is where terrain joins the continuous sweep: everything the validator samples. */
export function interiorWorld(def: InteriorDef, exterior: InteriorExterior, area: Rect, extra: readonly IdBox[] = []): WorldQueries {
  const terrain = sampleHeightfield(`${def.id}.terrain`, area, TERRAIN_CELL, exterior.floor, { conservative: true });
  const collider = createStaticCollider(def.id, [buildBoxes(def.id, [...interiorBoxes(def), ...extra]), terrain]);
  return composeStaticWorld({ exterior: createWorldQueries(exterior.solids, exterior.floor), solids: exterior.solids, collider });
}
