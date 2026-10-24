/** ENV-1: small helpers for writing interior definitions. */
import { worldFloor } from "../regions/worldFloor.js";
import type { Vec3 } from "../../world/types.js";
import type { Placement, Quarter, ShellModule, ShellPiece } from "./types.js";

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** An opening in a wall: along the wall's run from `a` to `b`, from `y0` to `y1`. */
export interface Opening { readonly a: number; readonly b: number; readonly y0: number; readonly y1: number }

/** A straight wall running along `run` ("x" or "z") from `from` to `to`, its
 * thickness across the other axis from `t0` to `t1`, from `y0` to `y1`, cut by
 * openings: one box per solid span, plus the sill and lintel of each opening. */
export function wall(id: string, run: "x" | "z", from: number, to: number, t0: number, t1: number, y0: number, y1: number,
  openings: readonly Opening[] = [], module: ShellModule = "wall"): ShellPiece[] {
  const piece = (suffix: string, a: number, b: number, lo: number, hi: number): ShellPiece => run === "x"
    ? { id: `${id}.${suffix}`, module, min: v(a, lo, t0), max: v(b, hi, t1) }
    : { id: `${id}.${suffix}`, module, min: v(t0, lo, a), max: v(t1, hi, b) };
  const out: ShellPiece[] = [], cuts = [...openings].sort((p, q) => p.a - q.a);
  let at = from;
  cuts.forEach((o, i) => {
    if (o.a > at) out.push(piece(`span${i}`, at, o.a, y0, y1));
    if (o.y0 > y0) out.push(piece(`sill${i}`, o.a, o.b, y0, o.y0));
    if (o.y1 < y1) out.push(piece(`lintel${i}`, o.a, o.b, o.y1, y1));
    at = o.b;
  });
  if (to > at) out.push(piece(`span${cuts.length}`, at, to, y0, y1));
  return out;
}

/** A horizontal slab (floor, ceiling, roof) over x0..x1 × z0..z1, minus rectangular holes. */
export function slab(id: string, module: ShellModule, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number,
  holes: readonly { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }[] = []): ShellPiece[] {
  if (!holes.length) return [{ id, module, min: v(x0, y0, z0), max: v(x1, y1, z1) }];
  // Strips in X between holes; within a strip a hole leaves the parts before and after it in Z.
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h.x0, h.x1])])].sort((a, b) => a - b), out: ShellPiece[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]!, b = xs[i + 1]!, cut = holes.filter((h) => h.x0 <= a && h.x1 >= b).sort((p, q) => p.z0 - q.z0);
    let at = z0, k = 0;
    for (const h of cut) { if (h.z0 > at) out.push({ id: `${id}.${i}.${k++}`, module, min: v(a, y0, at), max: v(b, y1, h.z0) }); at = h.z1; }
    if (z1 > at) out.push({ id: `${id}.${i}.${k}`, module, min: v(a, y0, at), max: v(b, y1, z1) });
  }
  return out;
}

export const place = (id: string, template: string, at: Vec3, quarter: Quarter = 0, tier: Placement["tier"] = "dressing", stack?: string): Placement =>
  ({ id, template, at, quarter, tier, ...(stack ? { stack } : {}) });

/** The lowest floor under a footprint (as structures do), so a building never floats. */
export function lowestFloor(x: number, z: number, hx: number, hz: number): number {
  let lo = Infinity;
  for (const u of [-1, -0.5, 0, 0.5, 1]) for (const w of [-1, -0.5, 0, 0.5, 1]) lo = Math.min(lo, worldFloor(x + u * hx, z + w * hz));
  return lo;
}
