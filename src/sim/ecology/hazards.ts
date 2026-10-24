import { EXPOSURE, HAZARD_FIELDS, HULL_TOLERANCE, PRESSURE_BANDS, PRESSURE_REFITS, PROTECTION, UNPROTECTED } from "../../content/ecology/hazards.js";
import type { HazardCycle, HazardFieldDefinition, HazardFieldId, HazardShape, ProtectionId } from "../../content/ecology/hazards.js";
import { sitePosition } from "../../content/ecology/sites.js";
import type { HullId } from "../../content/registry.js";
import type { Vec3 } from "../types.js";
import { ECOLOGY_DT, MAX_WARNING_AGE, WARNING_LEAD } from "./types.js";
import type { EcologyEvent, Exposure, Protection } from "./types.js";
import { clamp01 } from "./vector.js";
import { cycleLevel as frameworkLevel, fromHazardCycle, secondsAt, secondsUntil } from "../cycles/cycle.js";
import type { CycleDef } from "../cycles/cycle.js";
import { WORLD_CYCLES } from "../../content/currents/cycles.js";
import { registerCache } from "../caches.js";

const FIELD_IDS = Object.keys(HAZARD_FIELDS) as HazardFieldId[];
const field = (id: HazardFieldId): HazardFieldDefinition => HAZARD_FIELDS[id];

/** C4: S4's hazard clocks run on the cycle framework (`sim/cycles`). Each
 * field's `cycle` numbers are the same object as its framework cycle
 * (`cycleId`), so the trapezoid below is the framework's, tick for tick. */
const FRAMEWORK = new Map<HazardCycle, CycleDef>(WORLD_CYCLES.map(c => [hazardShapeOf(c), c] as const).filter(([s]) => s !== null) as [HazardCycle, CycleDef][]);
function hazardShapeOf(c: CycleDef): HazardCycle | null {
  for (const id of FIELD_IDS) if (field(id).cycleId === c.id) return field(id).cycle ?? null;
  return null;
}
const adHoc = new WeakMap<HazardCycle, CycleDef>();
/** The framework cycle running `cycle`: the field's named one, or (for a
 * shape not in the world table) one built from the same numbers. */
export function frameworkCycle(cycle: HazardCycle): CycleDef {
  let c = FRAMEWORK.get(cycle) ?? adHoc.get(cycle);
  if (!c) adHoc.set(cycle, c = fromHazardCycle("cycle.hazard", "Hazard cycle", cycle, { active: "active", quiet: "quiet" }));
  return c;
}
/** 0..1 activity of a cycled field at a tick: a trapezoid with linear ramps. */
export function cycleLevel(cycle: HazardCycle, tick: number): number {
  return frameworkLevel(frameworkCycle(cycle), secondsAt(tick));
}
/** Seconds until the active window next begins; 0 while it is active. */
export function secondsUntilActive(cycle: HazardCycle, tick: number): number {
  return secondsUntil(frameworkCycle(cycle), secondsAt(tick), "active");
}
/** Seconds until the field starts rising out of its quiet baseline (the
 * hazardous onset); 0 while it is rising, active or falling. */
export function secondsUntilRise(cycle: HazardCycle, tick: number): number {
  if (cycleLevel(cycle, tick) > 0) return 0;
  return secondsUntil(frameworkCycle(cycle), secondsAt(tick), cycle.ramp > 0 ? "rise" : "active");
}
/** Field strength as a fraction of its peak, including the quiet baseline. */
export function fieldLevel(id: HazardFieldId, tick: number): number {
  const f = field(id);
  if (!f.cycle) return 1;
  const base = f.baseline ?? 0;
  return base + (1 - base) * cycleLevel(f.cycle, tick);
}
/** Each world field's absolute centre, resolved once at load (SIM-PERF-1: every field's
 * centre was rebuilt on every sample, several samples a step). A fixed table of the content's
 * fields: one entry a field, about 80 bytes each (a Map entry and a frozen point), never
 * evicted, in the sim's cache ledger (`sim/caches.ts`). A shape that isn't a world field's
 * (a test's, or a cave field until it joins the table) is resolved on each call, uncached. */
const CENTERS = new Map<HazardShape, Readonly<Vec3>>(FIELD_IDS.map((id) => [field(id).shape, Object.freeze(sitePosition(field(id).shape.center))]));
const CENTER_BYTES = 80;
registerCache(() => ({ owner: "sim/ecology/hazards field centres", eviction: "none: a fixed table of the world's fields, built at load",
  entries: CENTERS.size, maxEntries: CENTERS.size, bytes: CENTERS.size * CENTER_BYTES, maxBytes: CENTERS.size * CENTER_BYTES,
  hits: 0, misses: 0, evictions: 0, declined: 0 }));
const centerOf = (shape: HazardShape): Readonly<Vec3> => CENTERS.get(shape) ?? sitePosition(shape.center);
/** 1 inside the shape, falling linearly to 0 over `edge` metres outside it. */
export function shapeWeight(shape: HazardShape, edge: number, p: Vec3): number {
  const c = centerOf(shape);
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
  // Running maxima and the flow sum as scalars (SIM-PERF-1: no record or vector per field).
  let heat = 0, brine = 0, sediment = 0, darkness = 0, fx = 0, fy = 0, fz = 0;
  const fields: HazardFieldId[] = [];
  for (const id of FIELD_IDS) {
    const f = field(id), w = shapeWeight(f.shape, f.edge, p);
    if (w <= 0) continue;
    const level = w * fieldLevel(id, tick) * f.intensity;
    if (level <= 1e-9) continue;
    fields.push(id);
    if (f.kind === "heat") heat = Math.max(heat, level);
    else if (f.kind === "brine") brine = Math.max(brine, level);
    else if (f.kind === "sediment") sediment = Math.max(sediment, level);
    else if (f.kind === "darkness") darkness = Math.max(darkness, level);
    if (f.flow) {
      const k = f.kind === "sediment" ? level * 0.45 : level;
      fx += f.flow.x * k; fy += f.flow.y * k; fz += f.flow.z * k;
    }
  }
  return {
    heat, brine, sediment, darkness, flow: { x: fx, y: fy, z: fz },
    ambient: ambientLight(p.y) * (1 - darkness),
    visibility: clamp01(1 - sediment * 0.85 - brine * 0.3),
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

/** Advance one exposure load by one fixed step for the controlled actor.
 * Returns harm per step (diver health or hull health) and warnings.
 *
 * Episode rule: an episode begins when the load reaches the first threshold
 * and its warning is delivered (shown) on the first controlled step at or
 * above it; `*Warned` then counts seconds since that delivery, whether or not
 * the actor stays controlled (see recoverExposure). Harm waits until the
 * delivered warning is WARNING_LEAD seconds old: grace is granted once per
 * episode. The episode ends only when the load falls below the first
 * threshold. `remind` re-shows the current caption (after a control transfer
 * or a load) without changing eligibility. */
export function stepExposure(load: Exposure, sample: HazardSample, protection: Protection, diver: boolean, inRefuge: boolean, remind = false): { harm: number; events: EcologyEvent[] } {
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
    const factor = kind === "heat" ? protection.heatLoad ?? 1 : 1;
    load[kind] = over > 0 ? Math.min(100, before + over * rate.rate * factor * ECOLOGY_DT) : Math.max(0, before - rate.recovery * ECOLOGY_DT);
    if (load[kind] < first) { load[warned] = 0; continue; }
    const level = Math.max(first, Math.floor(load[kind] / 10) * 10);
    // Rising across the threshold always opens a fresh episode, whatever age
    // a (hand-edited) state carried below it.
    if (before < first) load[warned] = 0;
    if (load[warned] === 0) {
      // First delivery of this episode: grace starts now.
      warn(level);
      load[warned] = ECOLOGY_DT;
    } else {
      load[warned] = Math.min(MAX_WARNING_AGE, load[warned] + ECOLOGY_DT);
      let crossed = false;
      for (const l of EXPOSURE.warnings.slice(1)) if (before < l && load[kind] >= l) { warn(l); crossed = true; }
      if (remind && !crossed) warn(level);
    }
    if (load[kind] >= 100 && load[warned] >= WARNING_LEAD) harm += (diver ? rate.diverHarm : rate.hullHarm) * ECOLOGY_DT;
  }
  return { harm, events };
}
/** An actor nobody controls (a parked hull, or the diver while piloting)
 * recovers silently. A delivered episode keeps ageing while the load stays at
 * or above the first threshold, so switching away never renews grace; an
 * undelivered one stays pending (0) and is delivered on first control. Only
 * recovery below the threshold ends the episode. */
export function recoverExposure(load: Exposure): void {
  const first = EXPOSURE.warnings[0];
  for (const kind of ["heat", "brine"] as const) {
    const warned = kind === "heat" ? "heatWarned" : "brineWarned";
    load[kind] = Math.max(0, load[kind] - EXPOSURE[kind].recovery * ECOLOGY_DT);
    if (load[kind] < first) load[warned] = 0;
    else if (load[warned] > 0) load[warned] = Math.min(MAX_WARNING_AGE, load[warned] + ECOLOGY_DT);
  }
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
