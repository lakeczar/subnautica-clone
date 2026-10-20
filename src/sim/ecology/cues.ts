import { HAZARD_FIELDS } from "../../content/ecology/hazards.js";
import { sitePosition } from "../../content/ecology/sites.js";
import { CUE_ROSTER, CUE_SPECIES } from "../../content/ecology/species.js";
import type { CueAgentId } from "../../content/ecology/species.js";
import type { Vec3 } from "../types.js";
import { cycleLevel, secondsUntilActive, secondsUntilRise } from "./hazards.js";
import type { Stimulus } from "./types.js";
import { clamp01, distance } from "./vector.js";

/** Ecological cues carry no saved state: each is a pure function of the tick,
 * an authored hazard cycle or the player's emissions, so the animal can never
 * disagree with the rule it teaches. */
export const cueHome = (id: CueAgentId): Vec3 => sitePosition(CUE_ROSTER[id].home);

/** 0..1 how far the mites have left the chimney lip; 1 for the whole vent. */
export function miteScatter(tick: number): { scatter: number; secondsToVent: number } {
  const cycle = HAZARD_FIELDS[CUE_ROSTER.rift_mites_lip.hazard].cycle;
  const lead = CUE_SPECIES.ember_mites.lead, rise = secondsUntilRise(cycle, tick);
  // Leave over two seconds starting `lead` before the plume starts rising,
  // stay away through the vent, return as it falls.
  const leaving = rise > 0 ? clamp01((lead - rise) / 2) : 1;
  return { scatter: Math.max(leaving, cycleLevel(cycle, tick)), secondsToVent: secondsUntilActive(cycle, tick) };
}

/** 0..1 how far the scavengers have backed into their burrows. */
export function scavengerRetreat(tick: number, s: Stimulus | null): { retreat: number; machinery: boolean; secondsToSurge: number } {
  const cycle = HAZARD_FIELDS[CUE_ROSTER.basin_scavengers_ridge.hazard].cycle;
  const lead = CUE_SPECIES.basin_scavengers.lead, until = secondsUntilActive(cycle, tick), rise = secondsUntilRise(cycle, tick);
  const surge = Math.max(rise > 0 ? clamp01((lead - rise) / 2) : 1, cycleLevel(cycle, tick));
  const machinery = !!s && s.hull !== null && s.noise >= CUE_SPECIES.basin_scavengers.machinery &&
    distance(s.position, cueHome("basin_scavengers_ridge")) < 14;
  return { retreat: Math.max(surge, machinery ? 1 : 0), machinery, secondsToSurge: until };
}

/** Sail positions along their authored lane; the lane is the calm crossing. */
export function sailPositions(tick: number, count = 3): Vec3[] {
  const lane = CUE_ROSTER.divide_sails_lane.lane.map(sitePosition);
  const lengths = lane.slice(1).map((p, i) => distance(lane[i]!, p));
  const total = lengths.reduce((a, b) => a + b, 0);
  const result: Vec3[] = [];
  for (let n = 0; n < count; n++) {
    // Ping-pong along the lane so sails never leave it at an end.
    const raw = ((tick / 60) * CUE_SPECIES.brine_sails.speed + (n * total) / count) % (2 * total);
    let along = raw > total ? 2 * total - raw : raw;
    let i = 0;
    while (i < lengths.length - 1 && along > lengths[i]!) { along -= lengths[i]!; i++; }
    const a = lane[i]!, b = lane[i + 1]!, t = clamp01(along / lengths[i]!);
    result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + Math.sin(tick / 60 * 0.4 + n) * 0.6, z: a.z + (b.z - a.z) * t });
  }
  return result;
}

/** True while nearby machinery is loud enough to scatter the school. */
export function schoolScattered(s: Stimulus | null): boolean {
  if (!s) return false;
  const c = CUE_SPECIES.canopy_school;
  return s.noise * clamp01(1 - distance(s.position, cueHome("canopy_school_crown")) / c.range) >= c.threshold * 0.5 && s.noise >= c.threshold;
}

/** Caption for the moment a cue animal first signals, near enough to see it. */
export function cueEvents(tick: number, s: Stimulus): { cue: CueAgentId; caption: string }[] {
  const out: { cue: CueAgentId; caption: string }[] = [];
  const crossed = (now: number, before: number): boolean => now >= 0.5 && before < 0.5;
  if (distance(s.position, cueHome("rift_mites_lip")) < 70 && crossed(miteScatter(tick).scatter, miteScatter(tick - 1).scatter))
    out.push({ cue: "rift_mites_lip", caption: "Ember mites are leaving the chimney lip. The plume vents within seconds; stay clear of the column." });
  if (distance(s.position, cueHome("basin_scavengers_ridge")) < 60 &&
      crossed(scavengerRetreat(tick, null).retreat, scavengerRetreat(tick - 1, null).retreat))
    out.push({ cue: "basin_scavengers_ridge", caption: "The scavengers back into their burrows. A sediment surge is coming down the lane; step onto the ridge." });
  return out;
}
