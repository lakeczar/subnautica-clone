/** Pure listener scene derived from simulation state once per frame. Audio never
 * writes state; everything here is presentation. */
import { HULLS, type HullId, type RegionId } from "../content/registry.js";
import { exposure } from "../sim/survival.js";
import { personalDepth, personalLimit } from "../sim/capabilities.js";
import { hullDepth } from "../sim/vehicles.js";
import type { GameState, Vec3, VehicleState } from "../sim/types.js";
import { HULL_LAYERS } from "./profiles.js";

export type Direction = "left" | "right" | "ahead" | "behind";
export type Shelter = "open" | "refuge" | "interior";
export type ThreatMode = GameState["world"]["threat"]["mode"];

export interface Listener { position: Vec3; yaw: number }
export interface AudioScene {
  active: boolean;
  region: RegionId;
  /** Metres below the waterline at the listener; negative above it. */
  depth: number;
  medium: "air" | "water";
  shelter: Shelter;
  hull: HullId | null;
  /** 0..1 of the hull's cruise speed. */
  throttle: number;
  /** 0..1 between cruise and boost speed. */
  boost: number;
  /** Hull depth over its current rating; above 0.85 the hull creaks. */
  hullStress: number;
  /** 0..1 charge of the controlled hull; 1 when on foot. */
  power: number;
  disabled: boolean;
  /** Personal pressure beyond the suit's rating outside a hull: survival's own warning condition. */
  overPressure: boolean;
  /** Bobbin is towing a disabled hull. */
  tow: boolean;
  threat: { mode: ThreatMode; interest: number; pan: number; distance: number; dir: Direction };
  listener: Listener;
}

/** Region at a world position, or null outside every authored region (S1's
 * `WorldMap.regionAt`). Outside the world the scene keeps its previous region. */
export type RegionResolver = (position: Readonly<Vec3>) => RegionId | null;
/** Before any region is known, e.g. a first frame outside the authored world. */
export const OUTSIDE_FALLBACK: RegionId = "refuge_reef";

const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

/** Stereo position of a world point, consistent with the original soundscape:
 * yaw=0 faces -Z, so +X is to the right. Full pan at 30 m lateral offset. */
export function relate(listener: Listener, at: Readonly<Vec3>): { pan: number; distance: number; dir: Direction } {
  const dx = at.x - listener.position.x, dy = at.y - listener.position.y, dz = at.z - listener.position.z;
  const right = dx * Math.cos(listener.yaw) + dz * Math.sin(listener.yaw);
  const ahead = dx * Math.sin(listener.yaw) - dz * Math.cos(listener.yaw);
  const distance = Math.hypot(dx, dy, dz);
  const dir: Direction = Math.abs(right) > Math.abs(ahead) ? (right > 0 ? "right" : "left") : ahead >= 0 ? "ahead" : "behind";
  return { pan: clamp(right / 30, -1, 1), distance: Number.isFinite(distance) ? distance : 0, dir };
}

const finite = (v: Readonly<Vec3>): boolean => [v.x, v.y, v.z].every(Number.isFinite);

function rating(v: VehicleState): number {
  // B1 adds a per-hull paid rating; until then the registry's initial depth.
  const paid = (v as VehicleState & { rating?: number }).rating;
  return typeof paid === "number" && paid > 0 ? paid : HULLS[v.hull].initialDepth;
}

export function sceneFromState(s: GameState | null, active: boolean, regionAt: RegionResolver, previous: RegionId = OUTSIDE_FALLBACK): AudioScene {
  if (!s) return {
    active: false, region: previous, depth: 0, medium: "air", shelter: "open", hull: null,
    throttle: 0, boost: 0, hullStress: 0, power: 1, disabled: false, overPressure: false, tow: false,
    threat: { mode: "idle", interest: 0, pan: 0, distance: Infinity, dir: "ahead" },
    listener: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  };
  const p = s.player.pose;
  const listener: Listener = { position: finite(p.position) ? { ...p.position } : { x: 0, y: 0, z: 0 }, yaw: Number.isFinite(p.yaw) ? p.yaw : 0 };
  const e = exposure(s);
  const v = s.fleet.vehicles.find(x => x.id === s.player.controlledVehicleId) ?? null;
  const shelter: Shelter = s.player.mode === "interior" ? "interior" : e.refuge ? "refuge" : "open";
  const speed = v ? Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) : 0;
  const layer = v ? HULL_LAYERS[v.hull] : null;
  const t = s.world.threat;
  const rel = finite(t.position) ? relate(listener, t.position) : { pan: 0, distance: Infinity, dir: "ahead" as const };
  return {
    active,
    region: regionAt(listener.position) ?? previous,
    depth: -listener.position.y,
    medium: e.airwayY >= 0 ? "air" : "water",
    shelter,
    hull: v?.hull ?? null,
    throttle: layer ? clamp(speed / layer.cruise) : 0,
    boost: layer?.boost ? clamp((speed - layer.cruise) / (layer.boost - layer.cruise)) : 0,
    hullStress: v ? (v.hull === "spindle" ? (hullDepth(v) > 1 ? 1 : 0) : clamp(hullDepth(v) / rating(v), 0, 2)) : 0,
    power: v ? clamp(v.charge / 100) : 1,
    disabled: v?.disabled ?? false,
    overPressure: !v && personalDepth(listener.position) > personalLimit(s),
    tow: s.recovery.operation?.phase === "tow",
    threat: { mode: t.mode, interest: Number.isFinite(t.interest) ? t.interest : 0, ...rel },
    listener,
  };
}
