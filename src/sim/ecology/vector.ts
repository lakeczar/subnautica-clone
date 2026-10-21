import type { Vec3 } from "../types.js";

export const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const finite = (p: Vec3): boolean => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
/** Move from a toward b by at most `step` metres. */
export function toward(a: Vec3, b: Vec3, step: number): Vec3 {
  const d = sub(b, a), n = length(d);
  return n <= step || n < 1e-9 ? { ...b } : add(a, scale(d, step / n));
}
/** Yaw convention of sim/types and encounterRotation: forward is (sin yaw, 0, -cos yaw). */
export const yawToward = (from: Vec3, to: Vec3, fallback: number): number => {
  const dx = to.x - from.x, dz = to.z - from.z;
  return Math.hypot(dx, dz) < 1e-6 ? fallback : Math.atan2(dx, -dz);
};
