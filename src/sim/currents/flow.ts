/** The flow at a point and time: a pure function of authored volumes and the
 * saved tick. Each volume contributes `direction × strength × level × weight`,
 * where `weight` rises smoothly from 0 at the boundary to 1 at `edge` metres
 * inside and lees subtract their share. Contributions add, and the total is
 * capped at MAX_FLOW. */
import { cycleLevel, secondsAt } from "../cycles/cycle.js";
import type { CycleDef } from "../cycles/cycle.js";
import type { Vec3 } from "../types.js";
import type { CurrentShape, CurrentVolumeDef } from "./types.js";

/** No authored flow exceeds this, whatever overlaps. */
export const MAX_FLOW = 8;

export interface FlowSample {
  /** m/s. */
  readonly flow: Vec3;
  readonly speed: number;
  /** Contributing volumes, in table order. */
  readonly volumes: readonly { readonly id: string; readonly weight: number; readonly level: number }[];
}
export interface CurrentField {
  readonly volumes: readonly CurrentVolumeDef[];
  sample(p: Vec3, tick: number): FlowSample;
  /** Peak flow ignoring cycles (every level 1): the worst case for content checks. */
  peak(p: Vec3): FlowSample;
}

const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const scale = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const unit = (v: Vec3): Vec3 => { const n = length(v); return n > 0 ? scale(v, 1 / n) : { x: 0, y: 0, z: 0 }; };

/** Metres from `p` inward to the shape's boundary; negative outside. */
export function insideDepth(shape: CurrentShape, p: Vec3): number {
  if (shape.kind === "tube") {
    const ab = { x: shape.b.x - shape.a.x, y: shape.b.y - shape.a.y, z: shape.b.z - shape.a.z };
    const len2 = ab.x ** 2 + ab.y ** 2 + ab.z ** 2;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - shape.a.x) * ab.x + (p.y - shape.a.y) * ab.y + (p.z - shape.a.z) * ab.z) / len2)) : 0;
    return shape.radius - Math.hypot(p.x - shape.a.x - ab.x * t, p.y - shape.a.y - ab.y * t, p.z - shape.a.z - ab.z * t);
  }
  const l = toLocal(shape, p), h = shape.half;
  const d = { x: Math.abs(l.x) - h.x, y: Math.abs(l.y) - h.y, z: Math.abs(l.z) - h.z };
  const outside = Math.hypot(Math.max(0, d.x), Math.max(0, d.y), Math.max(0, d.z));
  return outside > 0 ? -outside : -Math.max(d.x, d.y, d.z);
}
/** World → box-local offset (yaw about +Y). */
export function toLocal(shape: Extract<CurrentShape, { kind: "box" }>, p: Vec3): Vec3 {
  const dx = p.x - shape.center.x, dz = p.z - shape.center.z, a = shape.yaw ?? 0;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: dx * c - dz * s, y: p.y - shape.center.y, z: dx * s + dz * c };
}

/** World-space unit direction of a volume's flow. */
export function directionOf(v: CurrentVolumeDef): Vec3 {
  if (v.direction) return unit(v.direction);
  if (v.shape.kind === "tube") return unit({ x: v.shape.b.x - v.shape.a.x, y: v.shape.b.y - v.shape.a.y, z: v.shape.b.z - v.shape.a.z });
  throw new Error(`${v.id}: a box current needs a direction`);
}

/** 0..1 share of the volume's flow at `p`, lees included. */
export function volumeWeight(v: CurrentVolumeDef, p: Vec3): number {
  const depth = insideDepth(v.shape, p);
  if (depth <= 0) return 0;
  let w = v.edge > 0 ? smooth(depth / v.edge) : 1;
  for (const lee of v.lees ?? []) {
    const ins = Math.min(p.x - lee.min.x, lee.max.x - p.x, p.y - lee.min.y, lee.max.y - p.y, p.z - lee.min.z, lee.max.z - p.z);
    if (ins > 0) w *= 1 - (v.edge > 0 ? smooth(ins / v.edge) : 1);
  }
  return w;
}

/** Conservative world box of a shape, for the broad phase. */
export function shapeBounds(shape: CurrentShape): { min: Vec3; max: Vec3 } {
  if (shape.kind === "tube") {
    const r = shape.radius;
    return { min: { x: Math.min(shape.a.x, shape.b.x) - r, y: Math.min(shape.a.y, shape.b.y) - r, z: Math.min(shape.a.z, shape.b.z) - r },
      max: { x: Math.max(shape.a.x, shape.b.x) + r, y: Math.max(shape.a.y, shape.b.y) + r, z: Math.max(shape.a.z, shape.b.z) + r } };
  }
  const a = shape.yaw ?? 0, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), h = shape.half;
  const ex = h.x * c + h.z * s, ez = h.x * s + h.z * c;
  return { min: { x: shape.center.x - ex, y: shape.center.y - h.y, z: shape.center.z - ez },
    max: { x: shape.center.x + ex, y: shape.center.y + h.y, z: shape.center.z + ez } };
}

/** Problems with an authored volume; empty when it is sound. */
export function volumeProblems(v: CurrentVolumeDef, cycles: ReadonlyMap<string, CycleDef>): string[] {
  const out: string[] = [];
  if (!(v.strength > 0 && v.strength <= MAX_FLOW)) out.push(`${v.id}: strength must be in (0, ${MAX_FLOW}] m/s`);
  if (!(v.edge >= 0)) out.push(`${v.id}: edge must be ≥ 0`);
  if (v.shape.kind === "box" && !v.direction) out.push(`${v.id}: a box current needs a direction`);
  if (v.direction && !(length(v.direction) > 0)) out.push(`${v.id}: direction must be non-zero`);
  if (v.shape.kind === "box" && !(v.shape.half.x > 0 && v.shape.half.y > 0 && v.shape.half.z > 0)) out.push(`${v.id}: empty box`);
  if (v.shape.kind === "tube" && !(v.shape.radius > 0)) out.push(`${v.id}: empty tube`);
  if (v.cycle && !cycles.has(v.cycle)) out.push(`${v.id}: unknown cycle ${v.cycle}`);
  if (!v.cue.trim()) out.push(`${v.id}: no cue`);
  return out;
}

export function createCurrentField(volumes: readonly CurrentVolumeDef[], cycles: ReadonlyMap<string, CycleDef>): CurrentField {
  const entries = volumes.map(v => {
    const problems = volumeProblems(v, cycles);
    if (problems.length) throw new Error(problems.join("; "));
    return { v, dir: directionOf(v), box: shapeBounds(v.shape), cycle: v.cycle ? cycles.get(v.cycle)! : null };
  });
  const evaluate = (p: Vec3, level: (cycle: CycleDef | null) => number): FlowSample => {
    let x = 0, y = 0, z = 0;
    const contributing: { id: string; weight: number; level: number }[] = [];
    for (const e of entries) {
      const b = e.box;
      if (p.x < b.min.x || p.x > b.max.x || p.y < b.min.y || p.y > b.max.y || p.z < b.min.z || p.z > b.max.z) continue;
      const weight = volumeWeight(e.v, p);
      if (weight <= 0) continue;
      const l = level(e.cycle), k = e.v.strength * l * weight;
      contributing.push({ id: e.v.id, weight, level: l });
      x += e.dir.x * k; y += e.dir.y * k; z += e.dir.z * k;
    }
    let flow = { x, y, z }, speed = length(flow);
    if (speed > MAX_FLOW) { flow = scale(flow, MAX_FLOW / speed); speed = MAX_FLOW; }
    return { flow, speed, volumes: contributing };
  };
  return {
    volumes,
    sample: (p, tick) => {
      const s = secondsAt(tick);
      return evaluate(p, c => (c ? cycleLevel(c, s) : 1));
    },
    peak: p => evaluate(p, () => 1),
  };
}
