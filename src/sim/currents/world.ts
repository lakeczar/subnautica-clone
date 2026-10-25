/** The game world's one current field (C4): authored volumes plus S4's
 * moving hazard fields migrated with `fromHazardField`, on the world cycles.
 * Sampled once per step at the actor, before movement; `move.ts`'s rules
 * then move the actor in its ordinary sweep. Nothing else moves anyone with
 * a current: ecology's `effects.drift` is presentation-free and ignored. */
import { HAZARD_FIELDS, type HazardFieldId } from "../../content/ecology/hazards.js";
import { sitePosition } from "../../content/ecology/sites.js";
import { WORLD_CYCLE_BY_ID } from "../../content/currents/cycles.js";
import { WORLD_CURRENTS } from "../../content/currents/world.js";
import type { Vec3 } from "../types.js";
import { createCurrentField, type CurrentField, type FlowSample } from "./flow.js";
import { fromHazardField } from "./migrate.js";
import type { CurrentVolumeDef } from "./types.js";

/** S4's fields that carry flow, as current volumes. */
export function migratedHazardCurrents(): CurrentVolumeDef[] {
  const out: CurrentVolumeDef[] = [];
  for (const id of Object.keys(HAZARD_FIELDS) as HazardFieldId[]) {
    const f = HAZARD_FIELDS[id], cycleId = "cycleId" in f ? f.cycleId : undefined;
    const cycle = cycleId ? WORLD_CYCLE_BY_ID.get(cycleId) : undefined;
    if (cycleId && !cycle) throw new Error(`${id}: unknown world cycle ${cycleId}`);
    const volume = fromHazardField(id, f, sitePosition(f.shape.center), cycle);
    if (volume) out.push(volume);
  }
  return out;
}

let field: CurrentField | null = null;
export function worldCurrents(): CurrentField {
  return field ??= createCurrentField([...WORLD_CURRENTS, ...migratedHazardCurrents()], WORLD_CYCLE_BY_ID);
}
/** The flow at a point and tick. */
export const flowAt = (p: Vec3, tick: number): FlowSample => worldCurrents().sample(p, tick);
