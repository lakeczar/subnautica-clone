/** CR-1: threat windows as pure functions of the tick. Nothing here is saved:
 * a window is a creature cycle (content/currents/cycles.ts), so it resumes
 * exactly from a save and never depends on frame rate. */
import { sitePosition } from "../../content/ecology/sites.js";
import type { ThreatAgentId } from "../../content/ecology/species.js";
import { THREAT_HOME } from "../../content/registry.js";
import {
  HUNTER_FEEDING_CIRCLE, HUNTER_FEEDING_SPOT, SKATE_LAYING_AWAY, SKATE_LAYING_RADIUS, SKATE_LAYING_SITE, SKATE_REST_UNDER_MIRROR,
  THREAT_WINDOWS, WINDOW_IDS, WINDOW_SPOTS,
} from "../../content/fauna/windows.js";
import type { ThreatWindow, WindowId, WindowSpecies } from "../../content/fauna/windows.js";
import { sampleCycleAt, secondsAt } from "../cycles/cycle.js";
import type { CycleSample } from "../cycles/cycle.js";
import type { Vec3 } from "../types.js";
import { HAZARD_FIELDS } from "../../content/ecology/hazards.js";
/** The dense layer's mirror height (as ecology/agents.ts `layerY`, without importing it). */
const MIRROR_Y = sitePosition(HAZARD_FIELDS.divide_dense_layer.shape.center).y + HAZARD_FIELDS.divide_dense_layer.shape.y;

export const windowSample = (id: WindowId, tick: number): CycleSample => sampleCycleAt(THREAT_WINDOWS[id].cycle, tick);
/** That window keeps its animal busy now. */
export const windowOpen = (id: WindowId, tick: number): boolean => THREAT_WINDOWS[id].busy.includes(windowSample(id, tick).phase);
/** The window keeping this species busy now (the first, if two overlap), or null. */
export function busyWindow(species: WindowSpecies, tick: number): (ThreatWindow & { id: WindowId }) | null {
  for (const id of WINDOW_IDS) if (THREAT_WINDOWS[id].species === species && windowOpen(id, tick)) return { ...THREAT_WINDOWS[id], id };
  return null;
}
/** The animal is away, feeding or resting: it perceives nothing and never escalates. */
export const windowBusy = (species: WindowSpecies, tick: number): boolean => busyWindow(species, tick) !== null;

/** Where an ecology threat goes while busy: its feeding spot, just under the
 * mirror above its home for a resting skate, north and down toward the lee shelf for a laying one,
 * or nowhere for the sessile choir. */
export function windowSpot(id: ThreatAgentId, home: Vec3, tick: number): Vec3 | null {
  const spot = WINDOW_SPOTS[id];
  if (spot === "under" && windowOpen("layer_skate_laying", tick))
    return { x: home.x + SKATE_LAYING_AWAY.x, y: home.y + SKATE_LAYING_AWAY.y, z: home.z + SKATE_LAYING_AWAY.z };
  if (spot === "stay") return null;
  if (spot === "under") return { x: home.x, y: MIRROR_Y - SKATE_REST_UNDER_MIRROR, z: home.z };
  return sitePosition(spot);
}
/** The laying skates at the lee shelf (presentation and watching): arriving
 * low over the shelf from the brine side, circling the egg cases, leaving again. */
export function layingSkates(tick: number): { position: Vec3; yaw: number }[] {
  const s = windowSample("layer_skate_laying", tick);
  if (!THREAT_WINDOWS.layer_skate_laying.busy.includes(s.phase)) return [];
  const span = s.elapsed + s.remaining;
  const arrive = s.phase === "leaving" ? s.elapsed / span : s.phase === "returning" ? s.remaining / span : 1;
  return [0, Math.PI].map((phase) => {
    const a = secondsAt(tick) * 0.35 + phase, away = 1 - arrive;
    const position = { x: SKATE_LAYING_SITE.x + Math.cos(a) * SKATE_LAYING_RADIUS,
      y: SKATE_LAYING_SITE.y + 1 - away * 6, z: SKATE_LAYING_SITE.z + Math.sin(a) * SKATE_LAYING_RADIUS - away * 45 };
    return { position, yaw: Math.atan2(-Math.sin(a), -Math.cos(a)) };
  });
}

/** The sound hunter's round: feeding (circling the east shoal) while it leaves
 * and feeds, and home again from its return. */
export function hunterRoundPoint(tick: number): Vec3 {
  const phase = windowSample("canopy_sound_hunter", tick).phase;
  if (phase !== "leaving" && phase !== "away") return { ...THREAT_HOME };
  const a = (secondsAt(tick) / HUNTER_FEEDING_CIRCLE.period) * Math.PI * 2, r = HUNTER_FEEDING_CIRCLE.radius;
  return { x: HUNTER_FEEDING_SPOT.x + Math.cos(a) * r, y: HUNTER_FEEDING_SPOT.y + Math.sin(a * 2) * 0.8, z: HUNTER_FEEDING_SPOT.z + Math.sin(a) * r };
}

/** With no diver or craft within this many metres of it, the idle hunter's
 * round follows the authored path below without a swept move. */
export const HUNTER_ROUND_UNSWEPT = 30;
/** The round's authored path as a pure function of the tick: home while
 * resident, the straight east leg out and back, and the feeding circle. The
 * leg and circle are open water (tests/cr-1-creatures.heavy.test.ts sweeps them). */
export function hunterRoundPath(tick: number): Vec3 {
  const s = windowSample("canopy_sound_hunter", tick), span = s.elapsed + s.remaining;
  if (s.phase === "resident") return { ...THREAT_HOME };
  if (s.phase === "away") return hunterRoundPoint(tick);
  // Out to (or back from) where the circle will be (or was) at the phase edge.
  const edge = s.phase === "leaving" ? tick + Math.round(s.remaining * 60) : tick - Math.round(s.elapsed * 60);
  const circle = s.phase === "leaving" ? hunterRoundPoint(edge) : (() => {
    const a = (secondsAt(edge) / HUNTER_FEEDING_CIRCLE.period) * Math.PI * 2, r = HUNTER_FEEDING_CIRCLE.radius;
    return { x: HUNTER_FEEDING_SPOT.x + Math.cos(a) * r, y: HUNTER_FEEDING_SPOT.y + Math.sin(a * 2) * 0.8, z: HUNTER_FEEDING_SPOT.z + Math.sin(a) * r };
  })();
  const f = s.phase === "leaving" ? s.elapsed / span : s.remaining / span;
  return { x: THREAT_HOME.x + (circle.x - THREAT_HOME.x) * f, y: THREAT_HOME.y + (circle.y - THREAT_HOME.y) * f, z: THREAT_HOME.z + (circle.z - THREAT_HOME.z) * f };
}

/** CRE-04 (interim, until NAV-1's migration lanes): the stand-in laying skates
 * only appear or leave while the player cannot see where they are, so no one
 * watches one pop in or out. Shown when wanted, but never switched in view. */
export const swapWhileUnseen = (present: boolean, wanted: boolean, inView: boolean): boolean => inView ? present : wanted;
/** A laying skate's pose: on its visit path, or (kept after the visit while
 * still in view) circling the egg cases until it can leave unseen. */
export function layingPose(tick: number, i: number): { position: Vec3; yaw: number } {
  const k = layingSkates(tick)[i];
  if (k) return k;
  const a = secondsAt(tick) * 0.35 + (i ? Math.PI : 0);
  return { position: { x: SKATE_LAYING_SITE.x + Math.cos(a) * SKATE_LAYING_RADIUS, y: SKATE_LAYING_SITE.y + 1, z: SKATE_LAYING_SITE.z + Math.sin(a) * SKATE_LAYING_RADIUS },
    yaw: Math.atan2(-Math.sin(a), -Math.cos(a)) };
}
/** Whether a point is in the view: inside a cone around the camera's forward
 * (wider than the screen) and nearer than the water lets anyone see. */
export function inCameraView(camera: Vec3, forward: Vec3, p: Vec3, halfAngle = 1.0, range = 140): boolean {
  const d = { x: p.x - camera.x, y: p.y - camera.y, z: p.z - camera.z }, n = Math.hypot(d.x, d.y, d.z);
  if (n > range) return false;
  if (n < 1e-6) return true;
  return (d.x * forward.x + d.y * forward.y + d.z * forward.z) / n >= Math.cos(halfAngle);
}
