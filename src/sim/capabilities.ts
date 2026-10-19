import type { GameState, Vec3 } from "./types.js";

/** Sole personal pressure authority. Hull protection and render residency are separate. */
export function personalLimit(s: Readonly<GameState>): 60 | 150 | 350 {
  const suit = s.inventory.items.find(i => i.containerId === "equipment" && i.fitted === "suit" && i.quantity === 1);
  return suit?.kind === "suit_350" ? 350 : suit?.kind === "suit_150" ? 150 : 60;
}
/** Same fixed pressure datum as survival and safe exit, never the camera. */
export const personalDepth = (position: Readonly<Vec3>): number => Math.max(0, -(position.y + 0.4));
export const safePersonalDepth = (s: Readonly<GameState>, position: Readonly<Vec3> = s.player.pose.position): boolean =>
  personalDepth(position) <= personalLimit(s);
