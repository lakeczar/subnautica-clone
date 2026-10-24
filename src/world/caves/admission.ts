import type { CaveWorld } from "../../sim/world.js";
import type { Aabb, Vec3 } from "../types.js";
import type { AdmissionUpdate, CaveAdmission } from "./large/streaming.js";

/** Cave admission in the running game (CW-1): one contract for app.ts over
 * every cave, Babylon-free. The owner's rule is that ordinary play never
 * holds: the streamer builds caves 300–400 m ahead, so this only ever acts
 * in pathological cases (a reload inside a cave before its data arrived, a
 * budget too small for a cave biome), and then as a safety net:
 *
 * - **Kit caves** (small and medium). Before a frame steps, a player within
 *   reach of a cluster whose collision is not built gets it built now from
 *   its decoded records (a few milliseconds; counted and logged through the
 *   stream's `finishNow`, never expected in ordinary travel). If the
 *   records have not arrived yet (the pack is still downloading), the frame
 *   holds instead: the clock pauses and "Loading cave…" shows.
 * - **Cave biomes** run LC's `CaveAdmission` (away, waiting, loading, rescue,
 *   admitted): while it holds the clock pauses; a rescue relocates the player
 *   to its verified point.
 * - **Guaranteed refuge (LC-07).** A hold that outlasts `refugeAfterMs`
 *   without a rescue relocates the player to the last safe exterior pose they
 *   held (checked clear again), else to their refuge base (the last restored
 *   base rested at, the pod at worst). Nothing pauses forever.
 *
 * Composition: call `update` every frame before stepping, with the
 * controlled actor's box; keep the clock paused while `holding`; apply
 * `relocate` through the simulation (`relocateForCave`). On entering a save
 * (New, import, Continue) call `reset`, then run it behind the load screen
 * until it no longer holds, before the first tick or the HUD. */

export type CaveRelocation = { readonly kind: "point"; readonly position: Vec3 } | { readonly kind: "refuge" };
export interface CaveHold {
  readonly holding: boolean;
  /** Why, for the HUD; empty when not holding and nothing happened. */
  readonly message: string;
  /** Relocate the player, through the simulation, before anything steps. */
  readonly relocate: CaveRelocation | null;
  readonly state: "clear" | "loading" | "rescue" | "refuge";
}
/** One placed cave biome: its admission (LC) and owned-space test. */
export interface BiomeRuntime {
  readonly id: string;
  readonly admission: Pick<CaveAdmission, "update" | "reset">;
}
export interface CaveRuntimeOptions {
  readonly world: CaveWorld;
  /** Whether a cluster may be built from live generation (Node, tools, or a
   * browser whose bake is absent). False in the browser while the collision
   * pack downloads: the player is held instead. */
  readonly canGenerate: () => boolean;
  readonly biomes?: readonly BiomeRuntime[];
  /** The exterior world accepts the actor at these feet (rescue and refuge). */
  readonly clear: (feet: Vec3) => boolean;
  readonly refugeAfterMs?: number;
  /** Metres round the actor box a cluster must be built within. */
  readonly reach?: number;
}

export function createCaveRuntime(o: CaveRuntimeOptions) {
  const stream = o.world.kitCaves, reach = o.reach ?? 3, refugeAfter = o.refugeAfterMs ?? 12000;
  let holdingSince = -1, lastSafe: Vec3 | null = null;
  /** Lifetime diagnostics of this runtime (not reset with a session). */
  const stats = { holdFrames: 0, admissionBuilds: 0, rescues: 0, refuges: 0 };
  // Clusters within reach of the actor: a grid query into a reused buffer (R2-4).
  const nearBuffer: number[] = [];
  const near = (box: Aabb): number => stream.clustersNear(box.min.x - reach, box.min.z - reach, box.max.x + reach, box.max.z + reach, nearBuffer);
  return {
    stats,
    get lastSafe(): Vec3 | null { return lastSafe; },
    /** A new expedition replaced the old one (New, import, Continue; not a
     * pause): forget the remembered safe pose and any running hold, so a
     * recovery only ever uses the new expedition's own poses or its refuge,
     * on a fresh timeout. The built collision is world data and stays. */
    reset(): void {
      lastSafe = null; holdingSince = -1;
      for (const b of o.biomes ?? []) b.admission.reset();
    },
    /** `actor`: the controlled actor's box; `feet` its pose; `eye` the camera. */
    update(actor: Aabb, feet: Vec3, eye: Vec3, now: number): CaveHold {
      let holding = false, message = "", relocate: CaveRelocation | null = null;
      // Kit caves: build what the actor reaches, or hold until its data lands.
      const count = near(actor);
      for (let k = 0; k < count; k++) {
        const i = nearBuffer[k]!;
        if (stream.ready(i)) continue;
        if (stream.available(i) || o.canGenerate()) { stream.finishNow(i, "admission"); stats.admissionBuilds++; }
        else { holding = true; message = "Loading cave…"; }
      }
      // Cave biomes (LC's contract).
      let biomeWorst: AdmissionUpdate | null = null, outsideBiomes = true;
      for (const b of o.biomes ?? []) {
        const u = b.admission.update(actor, eye, now);
        if (u.state !== "away" && u.state !== "waiting") outsideBiomes = false;
        if (u.rescue && !relocate) { relocate = { kind: "point", position: u.rescue }; message = u.message; stats.rescues++; }
        if (u.holding) { holding = true; biomeWorst ??= u; }
      }
      if (biomeWorst && !relocate) message = biomeWorst.message;
      if (relocate) { holdingSince = -1; return { holding: true, message, relocate, state: "rescue" }; }
      if (!holding) {
        holdingSince = -1;
        // A safe exterior pose: no cave near, open water, clear.
        if (count === 0 && outsideBiomes && feet.y < -0.5 && o.clear(feet)) lastSafe = { ...feet };
        return { holding: false, message: "", relocate: null, state: "clear" };
      }
      stats.holdFrames++;
      if (holdingSince < 0) holdingSince = now;
      if (now - holdingSince >= refugeAfter) {
        holdingSince = -1; stats.refuges++;
        const back = lastSafe && o.clear(lastSafe) ? { kind: "point" as const, position: { ...lastSafe } } : { kind: "refuge" as const };
        return { holding: true, relocate: back, state: "refuge",
          message: back.kind === "point" ? "This cave could not load: you were returned to open water you passed."
            : "This cave could not load: you were returned to your refuge." };
      }
      return { holding: true, message, relocate: null, state: "loading" };
    },
  };
}
export type CaveRuntime = ReturnType<typeof createCaveRuntime>;
