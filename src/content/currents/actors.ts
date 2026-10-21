/** Who the current acts on. Today's numbers, mirrored so this stream can run
 * without SYS-1; at composition each hull row comes from SYS-1's
 * `craftProfile` (`speed.cruise`, `drain`, `current`), which folds in fitted
 * upgrades such as S4's resin trim vanes. */
import { HULL_COLLIDERS } from "../registry.js";
import type { HullId } from "../registry.js";
import type { Capsule } from "../../sim/types.js";
import type { CurrentActor } from "../../sim/currents/types.js";

export type ActorId = "diver" | HullId;

/** Speeds the sandbox drives with. `quiet`/`boost` follow step.ts. */
export interface ActorDrive extends CurrentActor {
  readonly id: ActorId;
  readonly quiet: number;
  readonly boost: number;
  /** step.ts velocity response (per second); the diver sets velocity directly. */
  readonly response: number;
  readonly shape: Capsule;
  /** S4 heat tolerance (UNPROTECTED / HULL_TOLERANCE), for the lab's vent gauge. */
  readonly heat: number;
}

export const DIVER_CAPSULE: Capsule = { radius: 0.34, height: 0.95 };

export const ACTORS: Readonly<Record<ActorId, ActorDrive>> = {
  // step.ts swim: quiet 2, cruise 3.4, sprint 5.2; S4 UNPROTECTED.current 0.15.
  diver: { id: "diver", authority: 0.15, cruise: 3.4, quiet: 2, boost: 5.2, drain: 0, response: Infinity, shape: DIVER_CAPSULE, heat: 0.3 },
  // SYS-1 HULL_BASE / S4 HULL_TOLERANCE.
  dart: { id: "dart", authority: 0.5, cruise: 8, quiet: 3, boost: 11, drain: 100 / 900, response: 2.8, shape: HULL_COLLIDERS.dart, heat: 0.3 },
  creel: { id: "creel", authority: 0.6, cruise: 5, quiet: 2.5, boost: 6.5, drain: 100 / 700, response: 1.7, shape: HULL_COLLIDERS.creel, heat: 0.35 },
  hush: { id: "hush", authority: 0.25, cruise: 6, quiet: 4, boost: 7.5, drain: 100 / 1200, response: 2.8, shape: HULL_COLLIDERS.hush, heat: 0.3 },
  spindle: { id: "spindle", authority: 0.4, cruise: 7, quiet: 7, boost: 7, drain: 100 / 900, response: 2.8, shape: HULL_COLLIDERS.spindle, heat: 0.3 },
  mantle: { id: "mantle", authority: 0.85, cruise: 4, quiet: 2, boost: 5, drain: 100 / 600, response: 2.8, shape: HULL_COLLIDERS.mantle, heat: 0.8 },
  hearthline: { id: "hearthline", authority: 0.9, cruise: 3, quiet: 3, boost: 3, drain: 100 / 900, response: 2.8, shape: HULL_COLLIDERS.hearthline, heat: 0.4 },
};
