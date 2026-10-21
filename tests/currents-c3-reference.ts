/** C3's moving hazard fields and S4's flow sampling, verbatim from C3
 * `3200cc7` (src/content/ecology/hazards.ts, src/sim/ecology/hazards.ts),
 * with sites resolved from src/content/ecology/sites.ts. CY-04: the
 * migrated volumes must reproduce this flow exactly. Only the flow path is
 * copied; heat, brine, visibility and cues stay S4's and are not migrated. */
import type { Vec3 } from "../src/sim/types.js";

interface HazardCycle { readonly period: number; readonly start: number; readonly duration: number; readonly ramp: number }
type Shape = { readonly kind: "box"; readonly center: Vec3; readonly min: Vec3; readonly max: Vec3 }
  | { readonly kind: "cylinder"; readonly center: Vec3; readonly radius: number; readonly bottom: number; readonly top: number };
export interface ReferenceField {
  readonly label: string; readonly kind: string; readonly shape: Shape; readonly intensity: number; readonly edge: number;
  readonly baseline?: number; readonly cycle?: HazardCycle; readonly flow?: Vec3; readonly cue: string;
}

/** sites.ts: `divide_saddle` and `basin_wreck_ridge`, and the chimney for a non-flow control. */
export const SITES = { divide_saddle: { x: 565, y: -450, z: -1456 }, basin_wreck_ridge: { x: 783, y: -256, z: -612 },
  rift_split_chimney: { x: -165, y: -300, z: -1065 } } as const;

export const C3_FIELDS = {
  rift_split_plume: {
    label: "Split chimney plume", kind: "heat",
    shape: { kind: "cylinder", center: SITES.rift_split_chimney, radius: 10, bottom: -2, top: 72 },
    intensity: 1, edge: 6, baseline: 0.3,
    cycle: { period: 75, start: 30, duration: 18, ramp: 3 },
    cue: "Ember mites leave the chimney lip, the water above it shimmers and a low roar builds before each vent.",
  },
  divide_downwelling: {
    label: "Saddle downwelling", kind: "current",
    shape: { kind: "box", center: SITES.divide_saddle, min: { x: -365, y: 78, z: 174 }, max: { x: 395, y: 120, z: 241 } },
    intensity: 1.1, edge: 6, flow: { x: 0, y: -0.6, z: -0.8 },
    cue: "Filter ribbons on the crest all lean south and down toward the mirror layer; suspended grains streak past.",
  },
  basin_sediment_lane: {
    label: "Basin plume lane", kind: "sediment",
    shape: { kind: "box", center: SITES.basin_wreck_ridge, min: { x: -163, y: -136, z: -328 }, max: { x: 117, y: -64, z: -88 } },
    intensity: 0.8, edge: 4, baseline: 0.08, flow: { x: 0, y: 0, z: 1 },
    cycle: { period: 100, start: 50, duration: 16, ramp: 4 },
    cue: "Scavengers back into their burrows and the lane's floor lifts in a slow grey wall.",
  },
} as const satisfies Record<string, ReferenceField>;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
function cycleLevel(cycle: HazardCycle, tick: number): number {
  const t = (((tick / 60 - cycle.start) % cycle.period) + cycle.period) % cycle.period;
  if (t < cycle.duration) return 1;
  if (t < cycle.duration + cycle.ramp) return 1 - (t - cycle.duration) / cycle.ramp;
  if (t > cycle.period - cycle.ramp) return (t - (cycle.period - cycle.ramp)) / cycle.ramp;
  return 0;
}
function fieldLevel(f: ReferenceField, tick: number): number {
  if (!f.cycle) return 1;
  const base = f.baseline ?? 0;
  return base + (1 - base) * cycleLevel(f.cycle, tick);
}
function shapeWeight(shape: Shape, edge: number, p: Vec3): number {
  const c = shape.center;
  let outside: number;
  if (shape.kind === "cylinder") {
    const radial = Math.max(0, Math.hypot(p.x - c.x, p.z - c.z) - shape.radius);
    const vertical = Math.max(0, c.y + shape.bottom - p.y, p.y - (c.y + shape.top));
    outside = Math.hypot(radial, vertical);
  } else {
    const ox = Math.max(0, c.x + shape.min.x - p.x, p.x - (c.x + shape.max.x));
    const oz = Math.max(0, c.z + shape.min.z - p.z, p.z - (c.z + shape.max.z));
    const oy = Math.max(0, c.y + shape.min.y - p.y, p.y - (c.y + shape.max.y));
    outside = Math.hypot(ox, oy, oz);
  }
  return edge > 0 ? clamp01(1 - outside / edge) : outside > 0 ? 0 : 1;
}
/** `sampleHazards(p, tick).flow`, for the given fields. */
export function s4Flow(fields: readonly ReferenceField[], p: Vec3, tick: number): Vec3 {
  let flow = { x: 0, y: 0, z: 0 };
  for (const f of fields) {
    const w = shapeWeight(f.shape, f.edge, p);
    if (w <= 0) continue;
    const level = w * fieldLevel(f, tick) * f.intensity;
    if (level <= 1e-9) continue;
    if (f.flow) {
      const k = f.kind === "sediment" ? level * 0.45 : level;
      flow = { x: flow.x + f.flow.x * k, y: flow.y + f.flow.y * k, z: flow.z + f.flow.z * k };
    }
  }
  return flow;
}
