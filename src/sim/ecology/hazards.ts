import { EXPOSURE, HAZARD_FIELDS, HULL_TOLERANCE, PRESSURE_BANDS, PRESSURE_REFITS, PROTECTION, UNPROTECTED } from "../../content/ecology/hazards.js";
import type { HazardCycle, HazardFieldDefinition, HazardFieldId, HazardKind, HazardShape, ProtectionId } from "../../content/ecology/hazards.js";
import { sitePosition } from "../../content/ecology/sites.js";
import type { HullId } from "../../content/registry.js";
import type { Vec3 } from "../types.js";
import { ECOLOGY_DT, WARNING_LEAD } from "./types.js";
import type { EcologyEvent, Exposure, Protection } from "./types.js";
import { clamp01, v } from "./vector.js";

const FIELD_IDS = Object.keys(HAZARD_FIELDS) as HazardFieldId[];
const field = (id: HazardFieldId): HazardFieldDefinition => HAZARD_FIELDS[id];

/** 0..1 activity of a cycled field at a tick: a trapezoid with linear ramps. */
export function cycleLevel(cycle: HazardCycle, tick: number): number {
  const t = (((tick / 60 - cycle.start) % cycle.period) + cycle.period) % cycle.period;
  if (t < cycle.duration) return 1;
  if (t < cycle.duration + cycle.ramp) return 1 - (t - cycle.duration) / cycle.ramp;
  if (t > cycle.period - cycle.ramp) return (t - (cycle.period - cycle.ramp)) / cycle.ramp;
  return 0;
}
/** Seconds until the active window next begins; 0 while it is active. */
export function secondsUntilActive(cycle: HazardCycle, tick: number): number {
  const t = (((tick / 60 - cycle.start) % cycle.period) + cycle.period) % cycle.period;
  return t < cycle.duration ? 0 : cycle.period - t;
}
/** Seconds until the field starts rising out of its quiet baseline (the
 * hazardous onset); 0 while it is rising, active or falling. */
export function secondsUntilRise(cycle: HazardCycle, tick: number): number {
  if (cycleLevel(cycle, tick) > 0) return 0;
  const t = (((tick / 60 - cycle.start) % cycle.period) + cycle.period) % cycle.period;
  return cycle.period - cycle.ramp - t;
}
/** Field strength as a fraction of its peak, including the quiet baseline. */
export function fieldLevel(id: HazardFieldId, tick: number): number {
  const f = field(id);
  if (!f.cycle) return 1;
  const base = f.baseline ?? 0;
  return base + (1 - base) * cycleLevel(f.cycle, tick);
}
/** 1 inside the shape, falling linearly to 0 over `edge` metres outside it. */
export function shapeWeight(shape: HazardShape, edge: number, p: Vec3): number {
  const c = sitePosition(shape.center);
  let outside: number;
  if (shape.kind === "cylinder") {
    const radial = Math.max(0, Math.hypot(p.x - c.x, p.z - c.z) - shape.radius);
    const vertical = Math.max(0, c.y + shape.bottom - p.y, p.y - (c.y + shape.top));
    outside = Math.hypot(radial, vertical);
  } else {
    const ox = Math.max(0, c.x + shape.min.x - p.x, p.x - (c.x + shape.max.x));
    const oz = Math.max(0, c.z + shape.min.z - p.z, p.z - (c.z + shape.max.z));
    const oy = shape.kind === "box"
      ? Math.max(0, c.y + shape.min.y - p.y, p.y - (c.y + shape.max.y))
      : Math.max(0, p.y - (c.y + shape.y));
    outside = Math.hypot(ox, oy, oz);
  }
  return edge > 0 ? clamp01(1 - outside / edge) : outside > 0 ? 0 : 1;
}
/** Daylight through the water column, before darkness fields. */
export const ambientLight = (y: number): number => clamp01(Math.exp(Math.min(0, y) / 160));

export interface HazardSample {
  heat: number;
  brine: number;
  sediment: number;
  darkness: number;
  /** m/s before the actor's authority. */
  flow: Vec3;
  /** 0..1 light available to eyes at this point. */
  ambient: number;
  /** 0..1 clarity of the water (sediment and brine shimmer). */
  visibility: number;
  /** Fields contributing at this point, in table order. */
  fields: HazardFieldId[];
}
export function sampleHazards(p: Vec3, tick: number): HazardSample {
  const out: Record<HazardKind, number> = { heat: 0, brine: 0, current: 0, sediment: 0, darkness: 0 };
  let flow = v(); const fields: HazardFieldId[] = [];
  for (const id of FIELD_IDS) {
    const f = field(id), w = shapeWeight(f.shape, f.edge, p);
    if (w <= 0) continue;
    const level = w * fieldLevel(id, tick) * f.intensity;
    if (level <= 1e-9) continue;
    fields.push(id);
    out[f.kind] = f.kind === "current" ? out[f.kind] + level : Math.max(out[f.kind], level);
    if (f.flow) {
      const k = f.kind === "sediment" ? level * 0.45 : level;
      flow = { x: flow.x + f.flow.x * k, y: flow.y + f.flow.y * k, z: flow.z + f.flow.z * k };
    }
  }
  return {
    heat: out.heat, brine: out.brine, sediment: out.sediment, darkness: out.darkness, flow,
    ambient: ambientLight(p.y) * (1 - out.darkness),
    visibility: clamp01(1 - out.sediment * 0.85 - out.brine * 0.3),
    fields,
  };
}

/** Diver suit or controlled hull tolerance from fitted protection IDs. */
export function protectionFor(hull: HullId | null, fitted: readonly ProtectionId[]): Protection {
  const base = hull ? HULL_TOLERANCE[hull] : UNPROTECTED;
  let { heat, brine, current } = base;
  for (const id of fitted) {
    const p = PROTECTION[id];
    if ((p.fits === "hull") !== (hull !== null)) continue;
    heat += p.heat ?? 0; brine += p.brine ?? 0; current += p.current ?? 0;
  }
  return { heat, brine, current: Math.min(0.95, current) };
}
export const driftFrom = (sample: HazardSample, protection: Protection): Vec3 => {
  const k = 1 - protection.current;
  return { x: sample.flow.x * k, y: sample.flow.y * k, z: sample.flow.z * k };
};

const COUNTERS: Readonly<Record<"heat" | "brine", { suit: ProtectionId; hull: ProtectionId; caption: (level: number, diver: boolean) => string }>> = {
  heat: {
    suit: "heat_shroud", hull: "hull_heat_lining",
    caption: (level, diver) => level >= 100
      ? `Heat load critical; ${diver ? "the suit" : "the hull"} will take damage within seconds. Leave the warm water for the pale cool ledges.`
      : `Heat load ${level}%. ${diver ? "A ceramic heat shroud" : "A hull heat lining"} would hold here; the first pressure ceramic lies on the cool flank lip. Pale ledges are cool.`,
  },
  brine: {
    suit: "brine_seals", hull: "hull_brine_seals",
    caption: (level, diver) => level >= 100
      ? `Brine will etch ${diver ? "the suit joints" : "the hull seals"} within seconds. Climb above the mirror layer.`
      : `Brine exposure ${level}%. ${diver ? "Lattice brine seals" : "Hull brine seals"} would hold here; lattice rinses out on the outer ledges above the layer.`,
  },
};

export const emptyExposure = (): Exposure => ({ heat: 0, brine: 0, heatWarned: 0, brineWarned: 0 });

/** Advance one exposure load by one fixed step. Returns harm per step for the
 * actor (diver health or hull health) and warnings. An episode starts with a
 * caption when the load reaches the first threshold (or already sits above it,
 * e.g. after `resumeExposure`); harm waits until that caption is WARNING_LEAD
 * seconds old, however fast the load rose or wherever in a cycle it began. */
export function stepExposure(load: Exposure, sample: HazardSample, protection: Protection, diver: boolean, inRefuge: boolean): { harm: number; events: EcologyEvent[] } {
  const events: EcologyEvent[] = [];
  let harm = 0;
  const first = EXPOSURE.warnings[0];
  for (const kind of ["heat", "brine"] as const) {
    const warned = kind === "heat" ? "heatWarned" : "brineWarned";
    const before = load[kind], over = inRefuge ? 0 : sample[kind] - protection[kind];
    const rate = EXPOSURE[kind], c = COUNTERS[kind];
    const warn = (level: number): void => {
      events.push({ type: "hazard-warning", hazard: kind, level, caption: c.caption(level, diver), protection: [diver ? c.suit : c.hull] });
    };
    load[kind] = over > 0 ? Math.min(100, before + over * rate.rate * ECOLOGY_DT) : Math.max(0, before - rate.recovery * ECOLOGY_DT);
    if (load[kind] < first) { load[warned] = 0; continue; }
    if (load[warned] === 0) {
      warn(Math.max(first, Math.floor(load[kind] / 10) * 10));
      load[warned] = ECOLOGY_DT;
    } else {
      load[warned] += ECOLOGY_DT;
      for (const level of EXPOSURE.warnings.slice(1)) if (before < level && load[kind] >= level) warn(level);
    }
    if (load[kind] >= 100 && load[warned] >= WARNING_LEAD) harm += (diver ? rate.diverHarm : rate.hullHarm) * ECOLOGY_DT;
  }
  return { harm, events };
}
/** An actor nobody controls (a parked hull, or the diver while piloting)
 * only recovers. Any open warning episode is closed, so when control returns
 * above the first threshold the episode restarts with a *delivered* caption
 * and harm again waits WARNING_LEAD seconds after it. */
export function recoverExposure(load: Exposure): void {
  load.heat = Math.max(0, load.heat - EXPOSURE.heat.recovery * ECOLOGY_DT);
  load.brine = Math.max(0, load.brine - EXPOSURE.brine.recovery * ECOLOGY_DT);
  load.heatWarned = 0;
  load.brineWarned = 0;
}
/** Call once after loading a save: an exposure above the first threshold
 * starts a fresh warning episode, so a reload never resumes into silent harm. */
export function resumeExposure(load: Exposure): void {
  load.heatWarned = 0;
  load.brineWarned = 0;
}

export type PressureBand = "clear" | "creak" | "stress" | "limit";
export function pressureBand(depth: number, rating: number): PressureBand {
  if (rating <= 0) return depth > 1 ? "limit" : "clear";
  const r = depth / rating;
  return r > 1 ? "limit" : r > PRESSURE_BANDS.stress ? "stress" : r > PRESSURE_BANDS.creak ? "creak" : "clear";
}
/** Legible caption when a diver's band worsens; null when unchanged or easing. */
export function pressureWarning(previousDepth: number, depth: number, rating: number): string | null {
  const order: PressureBand[] = ["clear", "creak", "stress", "limit"];
  const before = pressureBand(previousDepth, rating), now = pressureBand(depth, rating);
  if (order.indexOf(now) <= order.indexOf(before)) return null;
  const refit = PRESSURE_REFITS.find(r => r.limit >= rating);
  const next = refit ? ` The ${refit.next} uses ${refit.materials} from ${refit.where}.` : "";
  return now === "creak" ? `The suit creaks at ${Math.round(depth)} m of its ${rating} m rating.${next}`
    : now === "stress" ? `Suit stress band: ${Math.round(depth)} m of ${rating} m. Ascend soon.${next}`
    : `Beyond the ${rating} m suit rating. Ascend now.${next}`;
}
