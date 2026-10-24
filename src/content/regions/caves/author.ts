import type { CaveRoute, CavePortal, CavePortalKind, CaveRoomRole, CaveRoomSource, CaveStaging, CarveSource, TerraceSource, TubeNode } from "../caves.js";
import type { CraftProfileId } from "../passages.js";
import type { Vec3 } from "../../../world/types.js";

/** Terse builders for authored cave sources (CA-1). Data only: every value
 * still lands in a plain `CaveSource`, and nothing here generates shape.
 * Types come from `caves.ts`; no value is imported from it, so `caves.ts`
 * can list these caves without an import cycle. */

/** The open-water side of a portal (`caves.ts` `EXTERIOR`). */
export const OUT = "exterior";

export const terrace = (id: string, level: number, center: readonly [number, number], radii: readonly [number, number],
  shape: { exponent?: number; batter?: number; wobble?: number; wavelength?: number } = {}): TerraceSource =>
  ({ id, level, center, radii, exponent: shape.exponent ?? 2.4, batter: shape.batter ?? 0.22, wobble: shape.wobble ?? 0.5, wavelength: shape.wavelength ?? 10 });

/** A tube node: centre line (x, z), flat floor, clear width and height. */
export const n = (x: number, z: number, floor: number, width: number, height: number): TubeNode => ({ x, z, floor, width, height });
export const tube = (id: string, room: string, wobble: number, nodes: readonly TubeNode[]): CarveSource => ({ kind: "tube", id, room, wobble, nodes });
export const chamber = (id: string, room: string, wobble: number, center: Vec3,
  radii: { x: number; z: number; up: number; down: number }, floor: number): CarveSource => ({ kind: "chamber", id, room, wobble, center, radii, floor });
export const shaft = (id: string, room: string, wobble: number, center: readonly [number, number], radius: number, flare: number,
  bottom: number, top: number): CarveSource => ({ kind: "shaft", id, room, wobble, center, radius, flare, bottom, top });

export const room = (id: string, role: CaveRoomRole, label: string, falloff: number): CaveRoomSource => ({ id, role, label, falloff });

const AXIS = { "+x": { x: 1, y: 0, z: 0 }, "-x": { x: -1, y: 0, z: 0 }, "+y": { x: 0, y: 1, z: 0 }, "+z": { x: 0, y: 0, z: 1 }, "-z": { x: 0, y: 0, z: -1 } } as const;
/** A portal; `facing` is its normal, from `between[0]` toward `between[1]`. */
export const portal = (id: string, kind: CavePortalKind, label: string, between: readonly [string, string], center: Vec3,
  facing: keyof typeof AXIS, width: number, height: number, admits: readonly CraftProfileId[] = ["diver"]): CavePortal =>
  ({ id, kind, label, between, center, normal: AXIS[facing], clear: { width, height }, admits });

export const p = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const route = (id: string, role: CaveRoute["role"], path: readonly Vec3[], profile: CraftProfileId = "diver"): CaveRoute =>
  ({ id, profile, role, path });
export const parking = (id: string, label: string, position: Vec3, radius = 9,
  profiles: readonly CraftProfileId[] = ["small", "medium"]): CaveStaging => ({ id, role: "craft_parking", label, position, radius, profiles });

/** Retarget a shared link element (a terrace or carve straddling the seam
 * between two neighbours) at this cave's room. Its id, and so its noise,
 * stays the same on both sides, so both builds sample one shape. */
export const asRoom = (c: CarveSource, roomId: string): CarveSource => ({ ...c, room: roomId });
