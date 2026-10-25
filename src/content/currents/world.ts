/** Current volumes authored in the game world (C4). Few and strong: each is
 * a visible obstacle and route texture, never a ride and never a gate without
 * an alternative. Two more flows come from S4's hazard fields (the Divide
 * crest downwelling and the Basin plume lane), migrated in
 * `sim/currents/world.ts`; this file holds only volumes that are not hazards.
 *
 * Content rules (CY): an `inside`-falloff volume meeting rock runs 2 m into
 * it; a powerless diver reaches still water within 25 s from anywhere inside;
 * a gated passage has an always-open alternative. Checked in
 * `tests/c4-currents.test.ts`. */
import type { CurrentVolumeDef } from "../../sim/currents/types.js";

/** Hearth Reef: a fast down-slope race off the shelf break, south-west of
 * the Fanvault, where the bible's down-slope current scours the shelf lip.
 * A 39 m sloping tube whose lower half lies in the slope, so the flow is full
 * against the seabed. It gates nothing: the Fanvault, its parking and the
 * Basin route all lie outside it, and anyone can swim round either end. */
export const REEF_SHELF_RACE: CurrentVolumeDef = {
  id: "current.reef.shelf_race", label: "Shelf-break race",
  shape: { kind: "tube", a: { x: -338, y: -29, z: -98 }, b: { x: -346, y: -46, z: -132 }, radius: 6 },
  strength: 2.6, edge: 2,
  cue: "Silt and torn ribbon race down the shelf break in a fast grey stream; the fans beside it all lean downslope.",
};

export const WORLD_CURRENTS: readonly CurrentVolumeDef[] = [REEF_SHELF_RACE];
