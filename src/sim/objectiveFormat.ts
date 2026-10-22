import type { Vec3 } from "./types.js";

const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;
/** "about 120 m south-east": distance and an 8-point compass word (+Z is north). */
export function bearingWords(from: Vec3, to: Vec3): string {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  if (d < 8) return "right here";
  const deg = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
  return `about ${d < 100 ? Math.round(d / 5) * 5 : Math.round(d / 10) * 10} m ${POINTS[Math.round(deg / 45) % 8]}`;
}
