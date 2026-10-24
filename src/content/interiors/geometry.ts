/** ENV-1: interior-local to world. A quarter turn maps local +X to world +Z
 * and local +Z to world −X; `anchor` is the world position of the local origin. */
import type { Aabb, Vec3 } from "../../world/types.js";
import { TEMPLATES, type TemplateId } from "./templates.js";
import type { InteriorDef, InteriorPortal, Placement, Quarter } from "./types.js";

/** Rotate a local vector by quarter turns about +Y (no translation). */
export function turn(q: Quarter, p: Vec3): Vec3 {
  switch (q) {
    case 0: return { x: p.x, y: p.y, z: p.z };
    case 1: return { x: -p.z, y: p.y, z: p.x };
    case 2: return { x: -p.x, y: p.y, z: -p.z };
    case 3: return { x: p.z, y: p.y, z: -p.x };
  }
}
export const toWorld = (def: Pick<InteriorDef, "anchor" | "quarter">, p: Vec3): Vec3 => {
  const r = turn(def.quarter, p);
  return { x: def.anchor.x + r.x, y: def.anchor.y + r.y, z: def.anchor.z + r.z };
};
/** The world box of a local box. */
export function boxToWorld(def: Pick<InteriorDef, "anchor" | "quarter">, min: Vec3, max: Vec3): Aabb {
  const a = toWorld(def, min), b = toWorld(def, max);
  return { min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) } };
}
/** A placement's local box: its template's size about its base centre, turned. */
export function placementLocalBox(p: Placement): Aabb {
  const [sx, sy, sz] = TEMPLATES[p.template as TemplateId].size, odd = p.quarter % 2 === 1;
  const hx = (odd ? sz : sx) / 2, hz = (odd ? sx : sz) / 2;
  return { min: { x: p.at.x - hx, y: p.at.y, z: p.at.z - hz }, max: { x: p.at.x + hx, y: p.at.y + sy, z: p.at.z + hz } };
}
export function placementBox(def: InteriorDef, p: Placement): Aabb {
  const b = placementLocalBox(p);
  return boxToWorld(def, b.min, b.max);
}
/** A portal in world terms: centre, unit normal and the clear rectangle as a thin world box. */
export function portalWorld(def: InteriorDef, portal: InteriorPortal): { center: Vec3; normal: Vec3; box: Aabb } {
  const c = portal.center, n = portal.normal, w = portal.clear.width / 2, h = portal.clear.height / 2;
  // In-plane half extents, local: an up-facing portal spans X (width) and Z (height).
  const up = Math.abs(n.y) > 0.5;
  const half: Vec3 = up ? { x: w, y: 0, z: h } : Math.abs(n.x) > 0.5 ? { x: 0, y: h, z: w } : { x: w, y: h, z: 0 };
  return { center: toWorld(def, c), normal: turn(def.quarter, n),
    box: boxToWorld(def, { x: c.x - half.x, y: c.y - half.y, z: c.z - half.z }, { x: c.x + half.x, y: c.y + half.y, z: c.z + half.z }) };
}
/** Everything the interior draws or collides with, world. */
export function interiorBounds(def: InteriorDef): Aabb {
  const boxes = [...def.rooms.map((r) => boxToWorld(def, r.bounds.min, r.bounds.max)), ...def.shell.map((s) => boxToWorld(def, s.min, s.max))];
  return {
    min: { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)), z: Math.min(...boxes.map((b) => b.min.z)) },
    max: { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)), z: Math.max(...boxes.map((b) => b.max.z)) },
  };
}
export const boxesMeet = (a: Aabb, b: Aabb, tolerance = 0): boolean =>
  a.min.x < b.max.x - tolerance && a.max.x > b.min.x + tolerance && a.min.y < b.max.y - tolerance &&
  a.max.y > b.min.y + tolerance && a.min.z < b.max.z - tolerance && a.max.z > b.min.z + tolerance;
