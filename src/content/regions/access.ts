import { SOURCES, type MaterialId } from "../registry.js";
import type { Aabb, Vec3 } from "../../world/types.js";
import type { HazardDef } from "./hazards.js";
import { footprintFloor } from "./drape.js";
import { ACCESS_TIERS, CRAFT_PROFILES, ROUTES, type AccessTierId, type CraftProfileId, type RouteDef } from "./passages.js";
import { RESCUE_PLANS, type RescuePlan } from "./rescue.js";
import { SITES, type SiteDef } from "./sites.js";
import type { FloorFunction } from "./terrain.js";

/** Pure checks over S2 spatial data. Tests and the region viewer call these;
 * every problem is a short readable string naming the place. */

export interface CheckContext {
  readonly floor: FloorFunction;
  readonly solids: readonly { readonly id: string; readonly bounds: Aabb }[];
  readonly hazards?: readonly HazardDef[];
}

const fmt = (p: Readonly<Vec3>): string => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;

export { footprintFloor };

/** Points every `step` metres along a polyline, including both ends. */
export function samplePath(path: readonly Readonly<Vec3>[], step = 1): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!, b = path[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  if (path.length) out.push({ ...path.at(-1)! });
  return out;
}
export const pathLength = (path: readonly Readonly<Vec3>[]): number =>
  path.slice(1).reduce((n, b, i) => n + Math.hypot(b.x - path[i]!.x, b.y - path[i]!.y, b.z - path[i]!.z), 0);

export const inside = (b: Aabb, p: Readonly<Vec3>, pad = 0): boolean =>
  p.x >= b.min.x - pad && p.x <= b.max.x + pad && p.y >= b.min.y - pad && p.y <= b.max.y + pad &&
  p.z >= b.min.z - pad && p.z <= b.max.z + pad;

export interface CorridorOptions {
  profile: CraftProfileId;
  /** Lateral half-width the floor must stay below keel level. */
  halfWidth?: number;
  /** Deepest allowed keel depth (positive metres). */
  maxDepth?: number;
  /** Protections available; hazards needing others are forbidden. */
  protections?: readonly string[];
  /** Extra vertical margin above the swept floor. */
  margin?: number;
  step?: number;
}
/** Problems with sweeping `profile` along `path`. Reports the first failure
 * of each kind only, so one bad leg yields a readable message. */
export function corridorProblems(name: string, path: readonly Readonly<Vec3>[], ctx: CheckContext, o: CorridorOptions): string[] {
  const c = CRAFT_PROFILES[o.profile], out: string[] = [], seen = new Set<string>();
  const once = (key: string, msg: string): void => { if (!seen.has(key)) { seen.add(key); out.push(`${name}: ${msg}`); } };
  const margin = o.margin ?? 0.05;
  const pts = samplePath(path, o.step ?? 1);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const keel = p.y + c.bottom, ground = footprintFloor(ctx.floor, p.x, p.z, c.radius);
    if (keel < ground + margin) once("ground", `grounds at ${fmt(p)}; floor ${ground.toFixed(1)}`);
    if (o.maxDepth !== undefined && -keel > o.maxDepth) once("depth", `keel ${(-keel).toFixed(0)} m exceeds ${o.maxDepth} m at ${fmt(p)}`);
    if (o.halfWidth && o.halfWidth > c.radius) {
      const q = pts[Math.min(pts.length - 1, i + 1)]!, r = pts[Math.max(0, i - 1)]!;
      const dx = q.x - r.x, dz = q.z - r.z, len = Math.hypot(dx, dz);
      if (len > 1e-6) {
        const nx = -dz / len, nz = dx / len;
        for (const s of [-1, 1]) {
          const x = p.x + nx * s * o.halfWidth, z = p.z + nz * s * o.halfWidth;
          if (ctx.floor(x, z) > keel) once("width", `narrower than ${o.halfWidth} m at ${fmt(p)}`);
        }
      }
    }
  }
  // Solids and hazards: exact, continuous sweeps of every path segment, so
  // no sample spacing can step over a corner.
  const forbidden = (ctx.hazards ?? []).filter(h => h.protection && !o.protections?.includes(h.protection));
  for (let i = 0; i < Math.max(1, path.length - 1); i++) {
    const a = path[i]!, b = path[Math.min(i + 1, path.length - 1)]!;
    for (const s of ctx.solids) {
      const t = sweepHull(a, b, o.profile, s.bounds);
      if (t !== null) once(`solid:${s.id}`, `hits ${s.id} at ${fmt(lerp3(a, b, t))}`);
    }
    for (const h of forbidden) {
      const t = sweepHull(a, b, o.profile, h.bounds);
      if (t !== null) once(`hazard:${h.id}`, `enters ${h.id} (needs ${h.protection}) at ${fmt(lerp3(a, b, t))}`);
    }
  }
  return out;
}

const lerp3 = (a: Readonly<Vec3>, b: Readonly<Vec3>, t: number): Vec3 =>
  ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
/** Continuous sweep of a hull profile's box along the keel segment a->b
 * against a box. Returns the first parameter of positive-volume overlap, or
 * null; touching faces do not count. The test is the keel segment against
 * the box expanded by the hull (Minkowski), solved exactly per axis. */
export function sweepHull(a: Readonly<Vec3>, b: Readonly<Vec3>, profile: CraftProfileId, box: Aabb): number | null {
  const c = CRAFT_PROFILES[profile];
  const lo = { x: box.min.x - c.radius, y: box.min.y - c.height, z: box.min.z - c.radius };
  const hi = { x: box.max.x + c.radius, y: box.max.y - c.bottom, z: box.max.z + c.radius };
  let enter = 0, exit = 1;
  for (const k of ["x", "y", "z"] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) { if (a[k] <= lo[k] || a[k] >= hi[k]) return null; continue; }
    let t0 = (lo[k] - a[k]) / d, t1 = (hi[k] - a[k]) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0); exit = Math.min(exit, t1);
    if (exit - enter <= 1e-9) return null;
  }
  return enter;
}

/** Walkable land: the sim refuses a step rising more than 1.15 m per metre;
 * keep a margin. Returns problems for walk routes (y resolved on floor). */
export function walkProblems(route: RouteDef, floor: FloorFunction, maxGradient = 0.9): string[] {
  const pts = samplePath(route.path.map(p => ({ ...p, y: 0 })), 0.5), out: string[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, run = Math.hypot(b.x - a.x, b.z - a.z);
    const ha = floor(a.x, a.z), hb = floor(b.x, b.z);
    if (hb < -0.4) { out.push(`${route.id}: path leaves land at ${fmt({ ...b, y: hb })}`); break; }
    if (run > 1e-6 && Math.abs(hb - ha) / run > maxGradient) {
      out.push(`${route.id}: gradient ${(Math.abs(hb - ha) / run).toFixed(2)} at ${fmt({ ...b, y: hb })}`); break;
    }
  }
  return out;
}

export function routeProblems(route: RouteDef, ctx: CheckContext): string[] {
  if (route.role === "walk") return walkProblems(route, ctx.floor);
  const tier = ACCESS_TIERS[route.tier];
  return corridorProblems(route.id, route.path, ctx, {
    profile: route.profile, halfWidth: route.minHalfWidth, protections: tier.protections,
    maxDepth: route.carrier ? tier.depth : tier.depth - 10, margin: route.profile === "carrier" ? 0.5 : 0.4,
  });
}

// --- First access: reachability before protection ---------------------------
export interface FirstAccessPlan {
  readonly material: MaterialId;
  /** The configuration a player holds BEFORE using this material. */
  readonly tier: AccessTierId;
  /** Route chain from a place that tier already reaches. */
  readonly chains: readonly (readonly string[])[];
}
export const FIRST_ACCESS: readonly FirstAccessPlan[] = [
  { material: "pressure_ceramic", tier: "reinforced", chains: [
    ["route.legacy.reef_canopy", "route.legacy.canopy_basin", "route.basin.legacy_anchorage", "route.basin.rift", "route.rift.ceramic"],
  ] },
  { material: "thermal_core", tier: "reinforced", chains: [
    ["route.legacy.reef_canopy", "route.legacy.canopy_basin", "route.basin.legacy_anchorage", "route.basin.rift", "route.rift.core"],
  ] },
  { material: "brine_lattice", tier: "service", chains: [
    ["route.legacy.reef_canopy", "route.legacy.canopy_basin", "route.basin.legacy_anchorage", "route.basin.divide", "route.divide.lattice_west"],
    ["route.legacy.reef_canopy", "route.legacy.canopy_basin", "route.basin.legacy_anchorage", "route.basin.divide", "route.divide.lattice_east"],
    ["route.legacy.reef_canopy", "route.legacy.canopy_basin", "route.basin.legacy_anchorage", "route.basin.rift", "route.rift.ceramic", "route.rift.divide_flank"],
  ] },
];
/** Deposits must sit this far inside the preceding tier's rating, routes 10 m. */
export const DEPOSIT_DEPTH_MARGIN = 25;
/** Longest final swim from where the craft waits on a route to the work pose. */
export const FINAL_SWIM = 40;

/** The final connection to one first-access deposit: the craft waits at a
 * vertex of a validated route chain, and the diver swims `leg` to the work pose. */
export interface FirstAccessLeg { readonly site: string; readonly chain: number; readonly leg: readonly Vec3[] }

/** Every mandatory first-access deposit is reachable with the preceding tier:
 * along a chain that never exceeds its depth or enters a hazard needing
 * protection it lacks, then by a clear diver swim to the deposit's work pose
 * under the same limits. Each material has at least two such deposits. */
export function firstAccessProblems(ctx: CheckContext): string[] {
  return firstAccess(ctx).problems;
}
export function firstAccess(ctx: CheckContext): { problems: string[]; legs: FirstAccessLeg[] } {
  const out: string[] = [], legs: FirstAccessLeg[] = [];
  const routes = new Map(ROUTES.map(r => [r.id, r] as const));
  for (const plan of FIRST_ACCESS) {
    const tier = ACCESS_TIERS[plan.tier];
    const deposits = SITES.filter(s => s.role === "source" && s.material === plan.material && s.firstAccess);
    if (deposits.length < 2) out.push(`${plan.material}: only ${deposits.length} first-access deposits`);
    const reached = new Map<string, string[]>();
    plan.chains.forEach((chain, ci) => {
      const path: Vec3[] = [];
      for (const id of chain) {
        const r = routes.get(id);
        if (!r) { out.push(`${plan.material}: unknown route ${id}`); continue; }
        if (path.length) {
          const a = path.at(-1)!, b = r.path[0]!;
          if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 3) out.push(`${plan.material}: ${id} does not start where the chain ends`);
        }
        path.push(...r.path);
        out.push(...corridorProblems(`${plan.material} via ${id}`, r.path, ctx, {
          profile: r.legacy ? r.profile : "medium", maxDepth: tier.depth - 10, protections: tier.protections, margin: 0.3,
        }).filter(p => !(r.legacy && p.includes("hits"))));
      }
      for (const d of deposits) {
        const work = workPose(d, ctx.floor);
        // Try the waiting points nearest the deposit first; the first clear swim wins.
        const near = path.filter(p => Math.hypot(p.x - work.x, p.y - work.y, p.z - work.z) <= FINAL_SWIM)
          .sort((p, q) => Math.hypot(p.x - work.x, p.y - work.y, p.z - work.z) - Math.hypot(q.x - work.x, q.y - work.y, q.z - work.z));
        const why: string[] = [];
        for (const from of near.slice(0, 8)) {
          const leg = [from, work];
          const p = corridorProblems(`${d.id} final swim`, leg, ctx, { profile: "diver", maxDepth: tier.depth, protections: tier.protections, margin: 0.05, step: 0.25 });
          if (!p.length) { legs.push({ site: d.id, chain: ci, leg }); reached.set(d.id, []); break; }
          why.push(...p);
        }
        if (!reached.has(d.id) && why.length) reached.set(`${d.id}?`, why.slice(0, 2));
      }
    });
    for (const d of deposits) {
      const depth = -siteDatum(d, ctx.floor).y;
      if (depth > tier.depth - DEPOSIT_DEPTH_MARGIN) out.push(`${d.id}: ${depth.toFixed(0)} m is beyond ${plan.tier} (${tier.depth} m) less margin`);
      if (!reached.has(d.id)) out.push(`${d.id}: no clear ${plan.tier} final swim from a route chain${reached.has(`${d.id}?`) ? ` (${reached.get(`${d.id}?`)!.join("; ")})` : ""}`);
      for (const h of ctx.hazards ?? []) if (h.protection && inside(h.bounds, workPose(d, ctx.floor), 2))
        out.push(`${d.id}: lies in ${h.id} (needs ${h.protection})`);
    }
  }
  // Early materials come from the existing registry sources.
  const early: readonly [MaterialId, AccessTierId][] = [
    ["structural_alloy", "starter"], ["silica_glass", "starter"], ["flex_membrane", "starter"],
    ["conductive_crust", "early"], ["buoyant_resin", "early"],
  ];
  for (const [material, tierId] of early) {
    const ok = Object.values(SOURCES).filter(s => s.item === material && -s.position.y <= ACCESS_TIERS[tierId].depth - 10);
    if (ok.length < 2) out.push(`${material}: fewer than two sources within ${tierId}`);
  }
  return { problems: out, legs };
}

export function siteDatum(s: SiteDef, floor: FloorFunction): Vec3 {
  return { x: s.at.x, y: s.at.y === "floor" ? floor(s.at.x, s.at.z) + (s.lift ?? 0) : s.at.y, z: s.at.z };
}
/** Diver work pose (feet) for collection or interaction. */
export function workPose(s: SiteDef, floor: FloorFunction): Vec3 {
  if (s.work) return { ...s.work };
  const d = siteDatum(s, floor);
  return { x: d.x, y: d.y + 0.3, z: d.z };
}
/** Keel pose where a medium craft waits for the diver (and is attached if lost). */
export function parkPose(s: SiteDef, floor: FloorFunction): Vec3 {
  if (s.role === "mooring" && !s.park) return siteDatum(s, floor);
  const w = workPose(s, floor), c = CRAFT_PROFILES.medium, x = s.park?.x ?? w.x, z = s.park?.z ?? w.z;
  return { x, y: s.park?.y ?? Math.max(w.y + 3.5, footprintFloor(floor, x, z, c.radius) + 1.5), z };
}
export function siteBox(s: SiteDef, floor: FloorFunction): Aabb {
  const p = siteDatum(s, floor), h = s.half ?? { x: 1.5, y: 1.5, z: 1.5 };
  return { min: { x: p.x - h.x, y: p.y - h.y, z: p.z - h.z }, max: { x: p.x + h.x, y: p.y + h.y, z: p.z + h.z } };
}

// --- Rescue access -------------------------------------------------------------
/** Loss-capable: a place a hull or diver can be disabled deeper than the
 * basic suit's reach. Story volumes are not places to be lost. */
export const LOSS_DEPTH = 150;
export function lossCapable(s: SiteDef, floor: FloorFunction): boolean {
  return s.role !== "volume" && s.role !== "rescue_stage" && -siteDatum(s, floor).y > LOSS_DEPTH;
}
export const COVER_PAD = 30;
/** Longest last connection from a tether vertex to the attachment pose. */
export const ATTACH_REACH = 40;
/** Longest emergency transfer out of a protective hazard: the plume seam's
 * is a winched lift up the 110 m trench wall to the lip shelf. */
export const EMERGENCY_REACH = 140;
/** Sites a diver works at or a craft waits by; landmarks and entrances are
 * areas, covered by a tether reaching their extent. */
const workSite = (s: SiteDef): boolean => s.role === "source" || s.role === "story" || s.role === "refuge" || s.role === "mooring";

/** One proved recovery: Bobbin follows `plan`'s tether `branch` to `vertex`,
 * then `attach` to the lost hull; Bobbin itself reaches the diver's work pose
 * by `bobbin`; `emergency` (if any) first moves the hull out of a hazard; the
 * hull is then towed along `tow` to `mooring`, which offers repair. */
export interface RescueOutcome {
  readonly site: string;
  readonly plan: string;
  readonly branch: number;
  readonly vertex: number;
  readonly attach: readonly Vec3[];
  readonly bobbin: readonly Vec3[];
  readonly emergency?: readonly Vec3[];
  readonly tow: readonly Vec3[];
  readonly mooring: string;
}

/** Each deep loss-capable site has a surface stage reached by swimming from
 * the pod, a clear tether all the way to the attachment pose, Bobbin access
 * to the work pose, an explicit emergency transfer where the work is inside
 * a protective hazard, and a continuous tow to a repair mooring. */
export function rescueProblems(ctx: CheckContext, plans: readonly RescuePlan[] = RESCUE_PLANS): string[] {
  return rescue(ctx, plans).problems;
}
export function rescue(ctx: CheckContext, plans: readonly RescuePlan[] = RESCUE_PLANS): { problems: string[]; outcomes: RescueOutcome[] } {
  const out: string[] = [], outcomes: RescueOutcome[] = [];
  const protective = (ctx.hazards ?? []).filter(h => h.protection);
  const safe: CheckContext = { ...ctx, hazards: protective };
  const sites = new Map(SITES.map(s => [s.id, s] as const));
  for (const plan of plans) {
    if (plan.stage.y < -1) out.push(`${plan.id}: stage is not at the surface`);
    const a = plan.approach;
    if (Math.hypot(a[0]!.x, a[0]!.z - 6) > 3) out.push(`${plan.id}: approach does not start at the pod`);
    const end = a.at(-1)!;
    if (Math.hypot(end.x - plan.stage.x, end.z - plan.stage.z) > 3) out.push(`${plan.id}: approach does not end at the stage`);
    for (const p of samplePath(a, 2)) {
      if (p.y < -1) { out.push(`${plan.id}: approach leaves the surface at ${fmt(p)}`); break; }
      if (ctx.floor(p.x, p.z) > -1.2) { out.push(`${plan.id}: approach crosses land or shoal at ${fmt(p)}`); break; }
    }
    plan.tethers.forEach((branch, i) => {
      const s0 = branch[0]!;
      if (Math.hypot(s0.x - plan.stage.x, s0.y - plan.stage.y, s0.z - plan.stage.z) > 1) out.push(`${plan.id}#${i}: branch does not start at the stage`);
      const len = pathLength(branch);
      if (len > plan.maximumTether) out.push(`${plan.id}#${i}: tether ${len.toFixed(0)} m exceeds ${plan.maximumTether} m`);
      out.push(...corridorProblems(`${plan.id}#${i}`, branch, safe, { profile: "medium", protections: [], margin: 0.3, step: 1.5 }));
    });
    const m = sites.get(plan.mooring);
    if (!m) out.push(`${plan.id}: mooring ${plan.mooring} is not a site`);
    else if (!(m.role === "mooring" || m.role === "refuge") || !m.services?.includes("repair"))
      out.push(`${plan.id}: ${plan.mooring} is not a repair mooring (role ${m.role}, services ${m.services?.join(",") || "none"})`);
  }
  const tetherVertices = plans.flatMap(p => p.tethers.flatMap(b => b.slice(1)));
  for (const s of SITES) {
    if (!lossCapable(s, ctx.floor)) continue;
    if (!workSite(s)) {
      // An area: some clear tether vertex reaches into its extent.
      const box = siteBox(s, ctx.floor);
      if (!tetherVertices.some(v => inside(box, v, COVER_PAD) && !protective.some(h => inside(h.bounds, v))))
        out.push(`${s.id}: no rescue tether reaches its area`);
      continue;
    }
    const work = workPose(s, ctx.floor), hazard = protective.find(h => inside(h.bounds, work));
    const why: string[] = [];
    // Emergency transfer: explicit, short, clear, ending outside every protective hazard.
    let emergency: readonly Vec3[] | undefined;
    if (hazard) {
      const e = s.emergency;
      if (!e || e.length < 2) { out.push(`${s.id}: work pose in ${hazard.id} without an emergency transfer`); continue; }
      // Cargo or a diver moved by hand: a diver-sized path, allowed through the hazard it leaves.
      const p = [...corridorProblems(`${s.id} emergency`, e, { ...ctx, hazards: [] }, { profile: "diver", margin: 0.05, step: 0.5 })];
      if (Math.hypot(e[0]!.x - work.x, e[0]!.y - work.y, e[0]!.z - work.z) > 6) p.push(`${s.id}: emergency transfer does not start at the work pose`);
      if (pathLength(e) > EMERGENCY_REACH) p.push(`${s.id}: emergency transfer longer than ${EMERGENCY_REACH} m`);
      if (protective.some(h => inside(h.bounds, e.at(-1)!, 5))) p.push(`${s.id}: emergency transfer ends in or beside a protective hazard`);
      if (p.length) { out.push(...p); continue; }
      emergency = e;
    }
    const target = emergency ? emergency.at(-1)! : parkPose(s, ctx.floor);
    // Bobbin reaches the work pose from where the hull waits (diver-sized).
    const bobbin = emergency ? [target] : [target, work];
    if (!emergency) {
      const p = corridorProblems(`${s.id} bobbin`, bobbin, safe, { profile: "diver", margin: 0.05, step: 0.25 });
      if (p.length) { out.push(`${s.id}: Bobbin cannot reach the work pose: ${p[0]}`); continue; }
      const hb = corridorProblems(`${s.id} park`, [target], safe, { profile: "medium", margin: 0.3 });
      if (hb.length) { out.push(`${s.id}: no clear park pose: ${hb[0]}`); continue; }
    }
    // Candidate attachments: tether vertices near the target, nearest first.
    const candidates: { plan: RescuePlan; branch: number; vertex: number; d: number }[] = [];
    for (const plan of plans) plan.tethers.forEach((b, bi) => b.forEach((v, vi) => {
      if (vi === 0) return;
      const d = Math.hypot(v.x - target.x, v.y - target.y, v.z - target.z);
      if (d <= ATTACH_REACH) candidates.push({ plan, branch: bi, vertex: vi, d });
    }));
    candidates.sort((a, b) => a.d - b.d);
    let found: RescueOutcome | null = null;
    for (const c of candidates.slice(0, 12)) {
      const branch = c.plan.tethers[c.branch]!, v = branch[c.vertex]!;
      const attach = [v, target];
      if (pathLength(branch.slice(0, c.vertex + 1)) + c.d > c.plan.maximumTether) { why.push(`${c.plan.id}#${c.branch} too short`); continue; }
      const pa = corridorProblems(`${s.id} attach`, attach, safe, { profile: "medium", margin: 0.3, step: 0.5 });
      if (pa.length) { why.push(pa[0]!); continue; }
      const m = sites.get(c.plan.mooring);
      if (!m) continue;
      const tow = [target, ...branch.slice(1, c.vertex + 1).reverse(), ...(c.plan.towVia ?? []), parkPose(m, ctx.floor)];
      const pt = corridorProblems(`${s.id} tow`, tow, safe, { profile: "medium", margin: 0.3, step: 1.5 });
      if (pt.length) { why.push(pt[0]!); continue; }
      found = { site: s.id, plan: c.plan.id, branch: c.branch, vertex: c.vertex, attach, bobbin,
        ...(emergency ? { emergency } : {}), tow, mooring: c.plan.mooring };
      break;
    }
    if (!found) out.push(`${s.id}: no proved rescue (${candidates.length ? why.slice(0, 2).join("; ") : `no tether within ${ATTACH_REACH} m of ${fmt(target)}`})`);
    else {
      const m = sites.get(found.mooring)!;
      if (!(m.role === "mooring" || m.role === "refuge") || !m.services?.includes("repair")) out.push(`${s.id}: tow ends at ${found.mooring}, not a repair mooring`);
      outcomes.push(found);
    }
  }
  return { problems: out, outcomes };
}
