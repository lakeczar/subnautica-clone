/** ENV-1: the architectural kit and the interior's draw and byte accounting
 * (Babylon-free). Shell pieces are drawn exactly as they collide: one box each,
 * walls with a darker skirting band inside the same box, so art and collision
 * never part. Recipes are in the interior's local space; stage 2 places them.
 *
 * Batching (ENV-1 §3.8): per room, one merged mesh holds the shell pieces that
 * meet the room and every prop that is not repeated; a template repeated at
 * least `INSTANCE_MIN` times is one instanced draw for the interior. */
import { placementLocalBox } from "../../content/interiors/geometry.js";
import type { TemplateId } from "../../content/interiors/templates.js";
import type { InteriorDef, ShellModule, ShellPiece } from "../../content/interiors/types.js";
import type { LodLevel } from "../../world/types.js";
import { meshBytes, RecipeBuilder, rgba, type Rgba } from "../kit/recipe.js";
import type { MeshRecipe } from "../kit/types.js";
import { PALETTE as P } from "../palette.js";
import { propRecipe } from "./props.js";

const MODULE_COLOR: Record<ShellModule, Rgba> = {
  wall: rgba(P.porcelain), floor: rgba(P.metal), ceiling: rgba(P.shade), roof: rgba(P.shade), column: rgba(P.steelLight), plinth: rgba(P.ochre),
};
const SKIRT = rgba(P.seam, 1.2), SKIRT_HEIGHT = 0.12;

/** One shell piece into a builder. */
function piece(r: RecipeBuilder, s: ShellPiece, lod: LodLevel): void {
  const box = (y0: number, y1: number, c: Rgba): void =>
    r.box([(s.min.x + s.max.x) / 2, (y0 + y1) / 2, (s.min.z + s.max.z) / 2], [s.max.x - s.min.x, y1 - y0, s.max.z - s.min.z], c);
  const skirt = lod === "fine" && s.module === "wall" && s.max.y - s.min.y > SKIRT_HEIGHT * 2 && s.min.y <= 0;
  if (skirt) { box(s.min.y, s.min.y + SKIRT_HEIGHT, SKIRT); box(s.min.y + SKIRT_HEIGHT, s.max.y, MODULE_COLOR.wall); }
  else box(s.min.y, s.max.y, MODULE_COLOR[s.module]);
}

/** The interior's shell as one mesh, local. */
export function shellRecipe(def: InteriorDef, lod: LodLevel): MeshRecipe {
  const r = new RecipeBuilder();
  for (const s of def.shell) piece(r, s, lod);
  return r.build(`${def.id}.shell.${lod}`);
}

export const INSTANCE_MIN = 4;
/** Draw budget for one resident fine interior (ENV-1 §3.8). */
export const MAX_INTERIOR_DRAWS = 10;
export const MAX_INTERIOR_FINE_BYTES = 6 * 1024 * 1024;

export interface InteriorAccounting {
  /** Merged room meshes plus instanced templates. */
  readonly draws: number;
  readonly instanced: readonly TemplateId[];
  /** Fine geometry: shell, merged props and one copy of each instanced template, plus instance matrices. */
  readonly fineBytes: number;
  readonly coarseBytes: number;
}

/** Draws and bytes under the batching rule, computed from the recipes. */
export function interiorAccounting(def: InteriorDef): InteriorAccounting {
  const counts = new Map<TemplateId, number>();
  for (const p of def.dressing) counts.set(p.template as TemplateId, (counts.get(p.template as TemplateId) ?? 0) + 1);
  const instanced = [...counts].filter(([, n]) => n >= INSTANCE_MIN).map(([id]) => id).sort();
  // Rooms that hold any geometry: a shell piece or a merged prop meeting their bounds.
  const meets = (min: ShellPiece["min"], max: ShellPiece["max"], r: InteriorDef["rooms"][number]): boolean =>
    min.x < r.bounds.max.x && max.x > r.bounds.min.x && min.y < r.bounds.max.y && max.y > r.bounds.min.y && min.z < r.bounds.max.z && max.z > r.bounds.min.z;
  const grown = (s: ShellPiece) => ({ min: { x: s.min.x - 0.01, y: s.min.y - 0.01, z: s.min.z - 0.01 }, max: { x: s.max.x + 0.01, y: s.max.y + 0.01, z: s.max.z + 0.01 } });
  const merged = def.dressing.filter((p) => !instanced.includes(p.template as TemplateId));
  const rooms = def.rooms.filter((r) => def.shell.some((s) => { const g = grown(s); return meets(g.min, g.max, r); }) ||
    merged.some((p) => { const b = placementLocalBox(p); return meets(b.min, b.max, r); }));
  const fineOf = (id: TemplateId): number => meshBytes(propRecipe(id).fine);
  const fineBytes = meshBytes(shellRecipe(def, "fine")) + merged.reduce((a, p) => a + fineOf(p.template as TemplateId), 0) +
    instanced.reduce((a, id) => a + fineOf(id) + counts.get(id)! * 16 * 4, 0);
  const coarseBytes = meshBytes(shellRecipe(def, "coarse"));
  return { draws: rooms.length + instanced.length, instanced, fineBytes, coarseBytes };
}
