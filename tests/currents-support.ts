/** Shared drivers for the current and cycle sandbox tests. */
import type { SandboxInput, SandboxReadout, SandboxState, Sandbox } from "../src/sim/currents/sandbox.js";
import { stepSandbox } from "../src/sim/currents/sandbox.js";
import type { Vec3 } from "../src/sim/types.js";

/** Input that points the actor at `target` (yaw 0 is −Z, step.ts's sense). */
export function toward(s: SandboxState, target: Vec3, extra: SandboxInput = {}): SandboxInput {
  const dx = target.x - s.position.x, dy = target.y - s.position.y, dz = target.z - s.position.z;
  return { forward: 1, yaw: Math.atan2(dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), ...extra };
}
/** Run `seconds` of fixed steps; `input` may depend on the state. Returns
 * every readout and whether `stop` became true (and when). */
export function run(s: SandboxState, lab: Sandbox, seconds: number, input: (s: SandboxState) => SandboxInput,
  stop?: (s: SandboxState, r: SandboxReadout) => boolean): { readouts: SandboxReadout[]; stoppedAt: number | null } {
  const readouts: SandboxReadout[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const r = stepSandbox(s, input(s), lab);
    readouts.push(r);
    if (stop?.(s, r)) return { readouts, stoppedAt: (i + 1) / 60 };
  }
  return { readouts, stoppedAt: null };
}
export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A skilled pilot: heads so that drive + drift points at `target` (crabbing
 * into a cross-current), using the field's own drift at the actor. Falls back
 * to pointing straight at it when the drift is too strong to cancel. */
export function crab(s: SandboxState, target: Vec3, drift: Vec3, speed: number, extra: SandboxInput = {}): SandboxInput {
  const g0 = { x: target.x - s.position.x, y: target.y - s.position.y, z: target.z - s.position.z };
  const gl = Math.hypot(g0.x, g0.y, g0.z) || 1, g = { x: g0.x / gl, y: g0.y / gl, z: g0.z / gl };
  const along = drift.x * g.x + drift.y * g.y + drift.z * g.z;
  const perp = { x: drift.x - g.x * along, y: drift.y - g.y * along, z: drift.z - g.z * along };
  const p2 = perp.x ** 2 + perp.y ** 2 + perp.z ** 2;
  if (p2 >= speed * speed) return toward(s, target, extra);
  const k = Math.sqrt(speed * speed - p2);
  const u = { x: -perp.x + g.x * k, y: -perp.y + g.y * k, z: -perp.z + g.z * k };
  return { forward: 1, yaw: Math.atan2(u.x, -u.z), pitch: Math.atan2(u.y, Math.hypot(u.x, u.z)), ...extra };
}
