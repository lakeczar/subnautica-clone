/** ENV-1: which air rooms are dry now. Activation reads only saved facts (a
 * restored facility, the works' hall flag), so a reload recomputes it and no
 * field is saved for it. */
import { AIR_ROOM_LIST, inAirRoomBounds, type AirRoom } from "../content/airRooms.js";
import { facility } from "./inventory.js";
import type { GameState, Vec3 } from "./types.js";

export function airRoomActive(s: Readonly<GameState>, room: AirRoom): boolean {
  const a = room.activeWhen;
  if (a === "always") return true;
  if ("facility" in a) return facility(s as GameState, a.facility);
  return s.story.works[a.works];
}

/** The active dry room holding p, if any. The table holds a handful of rows,
 * so this walks it; stage 3a moves it behind `WorldQueries` when rows grow. */
export function airRoomAt(s: Readonly<GameState>, p: Vec3, rooms: readonly AirRoom[] = AIR_ROOM_LIST): AirRoom | null {
  for (const r of rooms) if (inAirRoomBounds(r, p) && airRoomActive(s, r)) return r;
  return null;
}
