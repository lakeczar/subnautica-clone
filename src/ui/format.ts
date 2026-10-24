import { RECOVERY_NOTICES } from "../sim/recovery.js";
import { distance } from "../sim/inventory.js";
import type { Vec3 } from "../sim/types.js";

export { formatDuration as duration } from "../sim/clock.js";

export const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Compass point and distance only, for compact rows: "NW · 20 m". */
export function heading(from: Vec3, to: Vec3): string {
  const degrees = (Math.atan2(to.x - from.x, from.z - to.z) * 180 / Math.PI + 360) % 360;
  return `${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(degrees / 45) % 8]} · ${Math.round(distance(from, to))} m`;
}

export function bearing(from: Vec3, to: Vec3): string {
  return `${heading(from, to)} away · ${Math.max(0, -to.y).toFixed(0)} m depth`;
}

// Saved recovery notices are compatibility data. Only their display is softened.
export function recoveryDisplay(message: string): string {
  if (message === RECOVERY_NOTICES.completed)
    return "Dart towed to the shallow rescue bench. Cargo, damage and charge are unchanged. Apply a rescue patch and use a reserve cell locally.";
  if (message === RECOVERY_NOTICES.occupied)
    return message.replace("a bound field patch", "a rescue patch");
  return message;
}
