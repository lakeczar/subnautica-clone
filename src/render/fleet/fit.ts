import type { AbstractMesh, Mesh } from "@babylonjs/core";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { contactParts, type Box, type ContactPose, type HullSpec, type S3HullId } from "../../content/fleet/hulls.js";

/** Visible-geometry versus collider mismatch check. Pure over mesh vertex data;
 * reports mesh names only, never Babylon objects (tests/render-assert.ts). */
export interface FitIssue { readonly mesh: string; readonly check: string; readonly detail: string }
export interface FitReport {
  readonly hull: string;
  readonly state: string;
  readonly vertices: number;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** Largest horizontal distance from the hull origin: the yaw-free extent. */
  readonly reach: number;
  readonly issues: readonly FitIssue[];
  /** Art extent inside each contact part, for tuning and the handoff. */
  readonly parts: readonly { readonly id: string; readonly min: readonly number[]; readonly max: readonly number[] }[];
}
export interface FitOptions {
  /** Check the berth envelope too (hull stowed and aligned for a carrier rail). */
  readonly berth?: boolean;
  /** Pose the art was set to; contact parts come from contactParts(hull, pose),
   * the same selector the viewer and the sim adapter use. No overrides. */
  readonly pose?: ContactPose;
  readonly tolerance?: number;
  /** Allowed gap between the art and each envelope face before it is "loose". */
  readonly slack?: { readonly radius: number; readonly top: number; readonly bottom: number; readonly berth: number };
  /** Minimum share of each contact part's extent, per axis, filled by art. */
  readonly fill?: number;
}

/** Enabled descendant meshes of `roots`, in the first root's local frame.
 * Labels (text planes) are presentation, not hull, and are excluded. */
export function localVertices(roots: readonly Mesh[]): { mesh: string; points: number[] }[] {
  const frame = roots[0]!.computeWorldMatrix(true).clone().invert(), result: { mesh: string; points: number[] }[] = [];
  const seen = new Set<AbstractMesh>();
  for (const root of roots)
    for (const m of [root, ...root.getChildMeshes(false)]) {
      if (seen.has(m) || !m.isEnabled() || m.name.startsWith("label.")) continue;
      seen.add(m);
      const data = m.getVerticesData("position");
      if (!data) continue;
      const to = m.computeWorldMatrix(true).multiply(frame), points: number[] = [], v = new Vector3();
      for (let i = 0; i < data.length; i += 3) {
        Vector3.TransformCoordinatesFromFloatsToRef(data[i]!, data[i + 1]!, data[i + 2]!, to as Matrix, v);
        points.push(v.x, v.y, v.z);
      }
      result.push({ mesh: m.name, points });
    }
  return result;
}

const inside = (b: Box, x: number, y: number, z: number, t: number): boolean =>
  x >= b.min[0] - t && x <= b.max[0] + t && y >= b.min[1] - t && y <= b.max[1] + t && z >= b.min[2] - t && z <= b.max[2] + t;

export function hullFit(roots: readonly Mesh[], spec: HullSpec, state: string, options: FitOptions = {}): FitReport {
  const t = options.tolerance ?? .005, slack = options.slack ?? { radius: .35, top: .2, bottom: .12, berth: .3 };
  const fill = options.fill ?? .8, contact = contactParts(spec.id as S3HullId, options.pose ?? {}), c = spec.collider;
  const issues: FitIssue[] = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const parts = contact.map(() => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
  let reach = 0, vertices = 0;
  for (const { mesh, points } of localVertices(roots)) {
    const worst = new Map<string, { amount: number; at: string }>();
    const note = (check: string, amount: number, x: number, y: number, z: number): void => {
      if (amount > (worst.get(check)?.amount ?? 0)) worst.set(check, { amount, at: `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})` });
    };
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i]!, y = points[i + 1]!, z = points[i + 2]!, r = Math.hypot(x, z);
      vertices++; reach = Math.max(reach, r);
      for (const [k, value] of [x, y, z].entries()) { min[k] = Math.min(min[k]!, value); max[k] = Math.max(max[k]!, value); }
      if (r > c.radius + t) note("piloting radius", r - c.radius, x, y, z);
      if (y > c.height + t) note("piloting top", y - c.height, x, y, z);
      if (y < (c.bottom ?? 0) - t) note("piloting bottom", (c.bottom ?? 0) - y, x, y, z);
      if (options.berth && spec.berth) {
        const e = spec.berth.envelope;
        const out = Math.max(Math.abs(x) - e.halfWidth, Math.abs(z) - e.halfLength, y - e.height, -y);
        if (out > t) note("berth envelope", out, x, y, z);
      }
      let contained = false;
      for (const [k, part] of contact.entries())
        if (inside(part, x, y, z, t)) {
          contained = true;
          const p = parts[k]!;
          for (const [a, value] of [x, y, z].entries()) { p.min[a] = Math.min(p.min[a]!, value); p.max[a] = Math.max(p.max[a]!, value); }
        }
      if (!contained) note("outside contact parts", 1, x, y, z);
    }
    for (const [check, w] of worst)
      issues.push({ mesh, check, detail: check === "outside contact parts" ? `vertex at ${w.at}` : `${w.amount.toFixed(3)} m beyond at ${w.at}` });
  }
  // Envelopes must also hug the art: a loose proxy is an invisible wall.
  if (c.radius - reach > slack.radius) issues.push({ mesh: spec.id, check: "loose piloting radius", detail: `${(c.radius - reach).toFixed(3)} m of empty margin` });
  if (c.height - max[1]! > slack.top) issues.push({ mesh: spec.id, check: "loose piloting top", detail: `${(c.height - max[1]!).toFixed(3)} m above the art` });
  if (min[1]! - (c.bottom ?? 0) > slack.bottom) issues.push({ mesh: spec.id, check: "loose piloting bottom", detail: `${(min[1]! - (c.bottom ?? 0)).toFixed(3)} m below the art` });
  if (options.berth && spec.berth) {
    const e = spec.berth.envelope;
    for (const [axis, gap] of [["half width", e.halfWidth - Math.max(-min[0]!, max[0]!)], ["half length", e.halfLength - Math.max(-min[2]!, max[2]!)],
      ["height", e.height - max[1]!]] as const)
      if (gap > slack.berth) issues.push({ mesh: spec.id, check: `loose berth ${axis}`, detail: `${gap.toFixed(3)} m of empty margin` });
  }
  for (const [k, part] of contact.entries()) {
    const p = parts[k]!;
    for (const a of [0, 1, 2]) {
      const covered = Math.max(0, p.max[a]! - p.min[a]!) / (part.max[a]! - part.min[a]!);
      if (!(covered >= fill)) { issues.push({ mesh: part.id, check: "unfilled contact part", detail: `axis ${"xyz"[a]} ${(covered * 100).toFixed(0)}% filled by art` }); break; }
    }
  }
  return { hull: spec.id, state, vertices, min: min as unknown as [number, number, number], max: max as unknown as [number, number, number], reach, issues,
    parts: contact.map((part, k) => ({ id: part.id, min: parts[k]!.min, max: parts[k]!.max })) };
}

export function formatFit(r: FitReport): string {
  const f = (n: number): string => n.toFixed(2);
  return [`${r.hull} · ${r.state}: ${r.vertices} vertices, reach ${f(r.reach)} m, ` +
    `x ${f(r.min[0])}..${f(r.max[0])}, y ${f(r.min[1])}..${f(r.max[1])}, z ${f(r.min[2])}..${f(r.max[2])}`,
  ...(r.issues.length ? r.issues.map((i) => `  ✖ ${i.mesh}: ${i.check} — ${i.detail}`) : ["  ✔ no mismatch"]),
  ...r.parts.map((p) => `    ${p.id}: art x ${f(p.min[0]!)}..${f(p.max[0]!)} y ${f(p.min[1]!)}..${f(p.max[1]!)} z ${f(p.min[2]!)}..${f(p.max[2]!)}`)].join("\n");
}

/** Walking volume reachable by the interior capsule (r 0.34 × 1.75 m) inside
 * CARRIER_LAYOUT.interior's clamp, carrier-local. */
export const WALKING_VOLUME = { x: 4.7 + .34, minZ: -11 - .34, maxZ: 10 + .34, floor: 4.015, head: 4 + 1.75 } as const;
export interface SolidBox { readonly id: string; readonly min: { x: number; y: number; z: number }; readonly max: { x: number; y: number; z: number } }

/** Interior mismatch check: any visible vertex inside the walking volume must
 * lie in a walking solid (no ghost geometry the player walks through), and
 * every fixture solid must be filled by art (no invisible walls). */
export function interiorFit(roots: readonly Mesh[], solids: readonly SolidBox[], fixtures: readonly SolidBox[],
  options: { tolerance?: number; fill?: number } = {}): FitIssue[] {
  const t = options.tolerance ?? .025, fill = options.fill ?? .9, w = WALKING_VOLUME, issues: FitIssue[] = [];
  const within = (s: SolidBox, x: number, y: number, z: number): boolean =>
    x >= s.min.x - t && x <= s.max.x + t && y >= s.min.y - t && y <= s.max.y + t && z >= s.min.z - t && z <= s.max.z + t;
  const cover = fixtures.map(() => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
  for (const { mesh, points } of localVertices(roots)) {
    let worst: string | null = null;
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i]!, y = points[i + 1]!, z = points[i + 2]!;
      for (const [k, f] of fixtures.entries())
        if (x >= f.min.x - .001 && x <= f.max.x + .001 && y >= f.min.y - .001 && y <= f.max.y + .001 && z >= f.min.z - .001 && z <= f.max.z + .001) {
          const c = cover[k]!;
          for (const [a, v] of [x, y, z].entries()) { c.min[a] = Math.min(c.min[a]!, v); c.max[a] = Math.max(c.max[a]!, v); }
        }
      const walkable = Math.abs(x) < w.x && z > w.minZ && z < w.maxZ && y > w.floor && y < w.head;
      if (walkable && !solids.some((s) => within(s, x, y, z))) worst ??= `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
    }
    if (worst) issues.push({ mesh, check: "visible in walking space without a solid", detail: `vertex at ${worst}` });
  }
  for (const [k, f] of fixtures.entries()) {
    const c = cover[k]!, size = [f.max.x - f.min.x, f.max.y - f.min.y, f.max.z - f.min.z];
    for (const a of [0, 1, 2]) {
      const covered = Math.max(0, c.max[a]! - c.min[a]!) / size[a]!;
      if (!(covered >= fill)) { issues.push({ mesh: f.id, check: "solid without matching art", detail: `axis ${"xyz"[a]} ${(covered * 100).toFixed(0)}% drawn` }); break; }
    }
  }
  return issues;
}
