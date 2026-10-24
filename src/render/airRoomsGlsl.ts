/** ENV-1: the shader's dry-room terms, written from the one air-room table
 * (`content/airRooms.ts`) so the optics and the sim's air rule read the same
 * coordinates. Babylon-free, so tests can pin the generated source. */
import type { AirRoom } from "../content/airRooms.js";
import type { Aabb } from "../world/types.js";

/** A GLSL float literal: always with a decimal point. */
export const glslFloat = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const vec3 = (x: number, y: number, z: number): string => `vec3(${glslFloat(x)},${glslFloat(y)},${glslFloat(z)})`;

/** `boxInterval` over a room's (single) air box, for `waterPath`. */
export function airIntervalGlsl(room: AirRoom): string {
  if (room.bounds.length !== 1) throw new Error(`air room ${room.id}: the optical interval takes one box`);
  const b = room.bounds[0]!;
  return `boxInterval(a,b,${vec3(b.min.x, b.min.y, b.min.z)},${vec3(b.max.x, b.max.y, b.max.z)},span)`;
}

/** 1 inside the room's lit mask (its `lightMask`, else its air box), else 0, on `vWorld`. */
export function roomMaskGlsl(room: AirRoom): string {
  const m: Aabb = room.lightMask ?? room.bounds[0]!;
  return `step(${glslFloat(m.min.x)},vWorld.x)*step(vWorld.x,${glslFloat(m.max.x)})*` +
    `step(${glslFloat(m.min.z)},vWorld.z)*step(vWorld.z,${glslFloat(m.max.z)})*` +
    `step(${glslFloat(m.min.y)},vWorld.y)*step(vWorld.y,${glslFloat(m.max.y)})`;
}
