/** ENV-1: the one air-room table. A dry room is a row here; the sim's air and
 * movement rules and the shader's optical intervals all read it, so no consumer
 * keeps its own copy of a room's coordinates.
 *
 * A room is dry above its `waterline` inside any of its `bounds` while its
 * activation holds. Activation is derived from saved facts (never saved itself):
 * - `"always"`: a room that has always been dry (the Canopy lab's hood);
 * - `{ facility }`: a restored stop's drained room, active once restored;
 * - `{ works }`: the district upper hall, active once the works restore it.
 *
 * Restoration rows are held until the owner decides on dry rooms (ENV-1 §3.6,
 * stages 3a and 7); `airRoomProblems` already limits them to the bigger
 * restored stops. Bounds use the lab's historic semantics: open in X and Z,
 * half-open [min, max) in Y. */
import type { Aabb, Vec3 } from "../world/types.js";
import type { RestBaseId } from "./bases.js";
import type { StopFacilityId } from "./stops.js";

/** Works flags that can drain a room (the upper hall's restoration). */
export type AirRoomWorksFlag = "hall";
export type AirRoomActivation = "always" | { readonly facility: StopFacilityId } | { readonly works: AirRoomWorksFlag };

export interface AirRoom {
  readonly id: string;
  /** The ENV-1 interior and room it belongs to; null for a dry room older than ENV-1. */
  readonly interior: string | null;
  readonly room: string | null;
  readonly bounds: readonly Aabb[];
  /** World Y of the local air/water surface; at or below every bound's floor for a fully dry room. */
  readonly waterline: number;
  readonly activeWhen: AirRoomActivation;
  /** The bunk this room registers (restoration rows only). */
  readonly restBase?: RestBaseId;
  /** Feet on the dry floor; required with `restBase`. */
  readonly wake?: Vec3;
  /** The shader's lit-room mask, where it reaches past the air box to the drawn faces. */
  readonly lightMask?: Aabb;
}

const box = (min: Vec3, max: Vec3): Aabb => ({ min, max });

export const AIR_ROOMS = {
  /** The Upper Canopy laboratory's open pressure hood (S3), dry from New Game. */
  canopy_lab: {
    id: "canopy_lab", interior: null, room: null,
    bounds: [box({ x: 111.4, y: -118.1, z: -129.6 }, { x: 120.6, y: -114.5, z: -122.4 })],
    waterline: -118.1,
    activeWhen: "always",
    lightMask: box({ x: 111.28, y: -118.03, z: -129.72 }, { x: 120.61, y: -113.97, z: -122.39 }),
  },
} as const satisfies Record<string, AirRoom>;
export type AirRoomId = keyof typeof AIR_ROOMS;
export const AIR_ROOM_LIST: readonly AirRoom[] = Object.values(AIR_ROOMS);

/** Inside one of the room's bounds and at or above its waterline (activation aside). */
export function inAirRoomBounds(room: AirRoom, p: Vec3): boolean {
  if (p.y < room.waterline) return false;
  return room.bounds.some((b) => p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z && p.y >= b.min.y && p.y < b.max.y);
}

/** The stops whose restoration may drain a room: the bigger restored stops
 * (coordinator, 2026-10-24). Small posts, outposts, the pod and the workshop never do. */
export const RESTORATION_ROOM_FACILITIES: readonly StopFacilityId[] = ["rift_station", "crown_power", "divide_dock"];

/** What is wrong with a set of rows, one line each. */
export function airRoomProblems(rows: readonly AirRoom[]): string[] {
  const out: string[] = [], seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) out.push(`${r.id}: duplicate id`);
    seen.add(r.id);
    if (!r.bounds.length) out.push(`${r.id}: no bounds`);
    for (const b of r.bounds)
      if (!(b.min.x < b.max.x && b.min.y < b.max.y && b.min.z < b.max.z)) out.push(`${r.id}: an empty or inverted bound`);
    if (!r.bounds.every((b) => r.waterline < b.max.y)) out.push(`${r.id}: waterline at or above a bound's ceiling`);
    const a = r.activeWhen;
    if (a === "always") {
      if (r.restBase) out.push(`${r.id}: an always-dry room registers no bunk`);
    } else if ("facility" in a) {
      if (!RESTORATION_ROOM_FACILITIES.includes(a.facility)) out.push(`${r.id}: ${a.facility} is not one of the bigger restored stops`);
    } else if (a.works !== "hall") out.push(`${r.id}: only the upper hall's works drain a room`);
    if (r.restBase && !r.wake) out.push(`${r.id}: a bunk needs a wake pose`);
    if (r.wake && !inAirRoomBounds(r, r.wake)) out.push(`${r.id}: the wake pose is not in the dry room`);
    if (a !== "always" && (r.interior === null || r.room === null)) out.push(`${r.id}: a restoration room belongs to an interior's room`);
  }
  return out;
}
