import { SUIT_RATINGS } from "../content/registry.js";
import type { GameState, Vec3 } from "./types.js";

const fittedSuit = (kind: string): kind is keyof typeof SUIT_RATINGS => Object.hasOwn(SUIT_RATINGS, kind);
/** Sole personal pressure authority. Hull protection and render residency are separate. */
export function personalLimit(s: Readonly<GameState>): number {
  const suit = s.inventory.items.find(i => i.containerId === "equipment" && i.fitted === "suit" && i.quantity === 1);
  return suit && fittedSuit(suit.kind) ? SUIT_RATINGS[suit.kind] : 60;
}
/** Same fixed pressure datum as survival and safe exit, never the camera. */
export const personalDepth = (position: Readonly<Vec3>): number => Math.max(0, -(position.y + 0.4));
export const safePersonalDepth = (s: Readonly<GameState>, position: Readonly<Vec3> = s.player.pose.position): boolean =>
  personalDepth(position) <= personalLimit(s);
