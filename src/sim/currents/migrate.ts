/** S4's hazard fields that move actors, as current volumes, so ONE pre-move
 * flow sample drives every current (see the CY handoff). Today two C3 fields
 * carry `flow`: `divide_downwelling` (a current, full intensity) and
 * `basin_sediment_lane` (sediment, at SEDIMENT_FLOW_FACTOR of its level).
 * The volume reproduces S4's `sampleHazards(...).flow` for the field: box
 * shape, linear falloff outside it, intensity, baseline and cycle.
 *
 * The input type is structural (S4's `HazardFieldDefinition` fields that
 * matter), so this module needs nothing from C3's tree; composition passes
 * `HAZARD_FIELDS[id]` and its resolved `sitePosition`. */
import { fromHazardCycle, period } from "../cycles/cycle.js";
import type { CycleDef, HazardCycleShape } from "../cycles/cycle.js";
import type { Vec3 } from "../types.js";
import type { CurrentVolumeDef } from "./types.js";

/** S4 sim/ecology/hazards.ts `sampleHazards`: sediment drifts at 0.45 of its level. */
export const SEDIMENT_FLOW_FACTOR = 0.45;

export interface HazardFlowField {
  readonly label: string;
  readonly kind: string;
  readonly shape: { readonly kind: string; readonly min?: Vec3; readonly max?: Vec3 };
  readonly intensity: number;
  readonly edge: number;
  readonly baseline?: number;
  readonly cycle?: HazardCycleShape;
  readonly flow?: Vec3;
  readonly cue: string;
}

/** Same schedule: phase ids, durations, levels and offset. */
function sameSchedule(a: CycleDef, b: CycleDef): boolean {
  return a.offset === b.offset && period(a) === period(b) && a.phases.length === b.phases.length &&
    a.phases.every((p, i) => p.seconds === b.phases[i]!.seconds && p.level === b.phases[i]!.level);
}

/** The field as a volume, or null when it moves nothing. `center` is the
 * field's resolved site position; `cycle` is the framework cycle that runs
 * its clock, checked against the field's own numbers. */
export function fromHazardField(id: string, f: HazardFlowField, center: Vec3, cycle?: CycleDef): CurrentVolumeDef | null {
  if (!f.flow) return null;
  const magnitude = Math.hypot(f.flow.x, f.flow.y, f.flow.z);
  if (!(magnitude > 0)) return null;
  if (f.shape.kind !== "box" || !f.shape.min || !f.shape.max) throw new Error(`${id}: only box flow fields migrate (${f.shape.kind})`);
  if (!!f.cycle !== !!cycle) throw new Error(`${id}: a cycled field needs its framework cycle, and only then`);
  if (f.cycle && cycle && !sameSchedule(cycle, fromHazardCycle(cycle.id, cycle.label, f.cycle, { active: "", quiet: "" })))
    throw new Error(`${id}: ${cycle.id} does not run the field's own clock`);
  const { min, max } = f.shape, factor = f.kind === "sediment" ? SEDIMENT_FLOW_FACTOR : 1;
  return {
    id: `current.${id}`, label: f.label,
    shape: { kind: "box", center: { x: center.x + (min.x + max.x) / 2, y: center.y + (min.y + max.y) / 2, z: center.z + (min.z + max.z) / 2 },
      half: { x: (max.x - min.x) / 2, y: (max.y - min.y) / 2, z: (max.z - min.z) / 2 } },
    direction: f.flow, strength: f.intensity * factor * magnitude, edge: f.edge, falloff: "outside",
    // S4 ignores a baseline on an uncycled field (its level is always 1).
    ...(cycle ? { cycle: cycle.id } : {}), ...(cycle && f.baseline !== undefined ? { baseline: f.baseline } : {}), cue: f.cue,
  };
}
