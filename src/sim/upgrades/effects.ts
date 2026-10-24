/** Pure upgrade effects: a hull's base folded with its fitted upgrades into one
 * CraftProfile, and the per-step values the simulation reads from it. No game
 * state is touched; composition passes the hull, its paid rating and the kinds
 * of its fitted upgrades. */
import { HULL_BASE } from "../../content/upgrades/base.js";
import { UPGRADES } from "../../content/upgrades/catalogue.js";
import type { ContractKind, ToolKind, UpgradeEffect, UpgradeId } from "../../content/upgrades/catalogue.js";
import type { HullId } from "../../content/registry.js";
import { BoundedMemo } from "../caches.js";

export type MotionMode = "idle" | "quiet" | "cruise" | "boost";
export interface CraftProfile {
  readonly hull: HullId;
  /** Paid rating plus any plating margin, metres. 0 for the surface-only Spindle. */
  readonly rating: number;
  readonly speed: { readonly quiet: number; readonly cruise: number; readonly boost: number };
  readonly loudness: { readonly idle: number; readonly quiet: number; readonly cruise: number; readonly boost: number };
  /** Stock-battery percent per second at cruise, after efficiency. */
  readonly drain: number;
  readonly drainMode: { readonly quiet: number; readonly boost: number; readonly idle: number };
  /** Battery capacity relative to the stock battery. */
  readonly capacity: number;
  readonly lamp: number;
  readonly lampDrain: number;
  /** × incoming hull damage. */
  readonly damage: number;
  readonly heat: number;
  readonly heatLoad: number;
  readonly ambientHeatImmune: boolean;
  readonly brine: number;
  readonly current: number;
  readonly holdDeltaCu: number;
  readonly solar: number;
  readonly thermalCharge: boolean;
  readonly airLine: "basic" | "hull";
  readonly systemSockets: number;
  readonly mixedBerths: boolean;
  readonly tools: readonly ToolKind[];
  readonly contracts: readonly ContractKind[];
}
/** Current authority never reaches 1: a hull always feels a strong current. */
export const MAX_CURRENT_AUTHORITY = 0.95;
const BASE_SYSTEM_SOCKETS = 2;

/** Profiles by their inputs (SIM-PERF-1): the fold ran several times a step, the step's
 * largest allocation (about 17 KiB). The key is the inputs' values, so a hit is exactly the
 * fold's answer; profiles are frozen. A profile retains about 400 bytes (one object of 24
 * fields, two four-number objects, two small arrays at 16 bytes an entry; `drainMode` is the
 * hull base's own), plus its key at two bytes a character: at most 128 entries and 96 KiB,
 * the oldest dropped first, in the sim's cache ledger (`sim/caches.ts`). */
const profiles = new BoundedMemo<CraftProfile>("sim/upgrades/effects craftProfile", 128, 96 * 1024,
  (key, p) => 400 + 16 * (p.tools.length + p.contracts.length) + 2 * key.length);

/** Fold fitted upgrades onto the hull base. `rating` is the paid hull rating
 * (VehicleState.rating); refits are already in it, so refit entries add nothing. */
export function craftProfile(hull: HullId, rating: number, fitted: readonly UpgradeId[]): CraftProfile {
  return profiles.get(`${hull}|${rating}|${fitted.join(",")}`, () => foldProfile(hull, rating, fitted));
}

function foldProfile(hull: HullId, rating: number, fitted: readonly UpgradeId[]): CraftProfile {
  const b = HULL_BASE[hull];
  const effects: UpgradeEffect[] = fitted.map((id) => UPGRADES[id].effect);
  const product = (key: "speed" | "noise" | "lamp" | "drain" | "capacity" | "damage" | "heatLoad" | "solar"): number =>
    effects.reduce((n, e) => n * (e[key] ?? 1), 1);
  const sum = (key: "quietAdd" | "boostAdd" | "lampDrain" | "ratingAdd" | "heat" | "brine" | "current" | "holdCu" | "systemSockets"): number =>
    effects.reduce((n, e) => n + (e[key] ?? 0), 0);
  const has = (key: "noBoost" | "ambientHeatImmune" | "thermalCharge" | "mixedBerths" | "airLine"): boolean =>
    effects.some((e) => e[key] !== undefined);
  const k = product("speed");
  const quiet = Math.max(0, b.speed.quiet * k + sum("quietAdd"));
  const cruise = b.speed.cruise * k;
  let boost = Math.max(cruise, b.speed.boost * k + sum("boostAdd"));
  if (has("noBoost")) boost = cruise;
  const n = product("noise");
  return Object.freeze({
    hull,
    rating: hull === "spindle" ? 0 : rating + sum("ratingAdd"),
    speed: Object.freeze({ quiet: Math.min(quiet, cruise), cruise, boost }),
    loudness: Object.freeze({ idle: b.loudness.idle * n, quiet: b.loudness.quiet * n, cruise: b.loudness.cruise * n, boost: b.loudness.boost * n }),
    drain: b.drain * product("drain"),
    drainMode: b.drainMode,
    capacity: product("capacity"),
    lamp: b.lamp * product("lamp"),
    lampDrain: sum("lampDrain"),
    damage: product("damage"),
    heat: b.heat + sum("heat"),
    heatLoad: product("heatLoad"),
    ambientHeatImmune: has("ambientHeatImmune"),
    brine: b.brine + sum("brine"),
    current: Math.min(MAX_CURRENT_AUTHORITY, b.current + sum("current")),
    holdDeltaCu: sum("holdCu"),
    solar: b.solar * product("solar"),
    thermalCharge: has("thermalCharge"),
    airLine: has("airLine") ? "hull" : "basic",
    systemSockets: hull === "hearthline" ? BASE_SYSTEM_SOCKETS + sum("systemSockets") : 0,
    mixedBerths: has("mixedBerths"),
    tools: Object.freeze(fitted.flatMap((id) => { const t = (UPGRADES[id].effect as UpgradeEffect).tool; return t ? [t] : []; })),
    contracts: Object.freeze(fitted.flatMap((id) => { const c = (UPGRADES[id].effect as UpgradeEffect).contract; return c ? [c] : []; })),
  });
}

export interface Motion {
  speed: number;
  /** 0..1, the value wildlife reads as `noise`. */
  loudness: number;
  /** Percent of this craft's own battery per second. */
  drain: number;
}
/** Speed, loudness and drain for one step in a mode. Drain is divided by the
 * capacity, so a bigger battery empties more slowly at the same draw. */
export function motion(p: CraftProfile, mode: MotionMode, options: { lamp?: boolean } = {}): Motion {
  const drive = mode === "idle" ? p.drainMode.idle
    : p.drain * (mode === "quiet" ? p.drainMode.quiet : mode === "boost" ? p.drainMode.boost : 1);
  return {
    speed: mode === "idle" ? 0 : p.speed[mode],
    loudness: Math.min(1, p.loudness[mode]),
    drain: (drive + (options.lamp ? p.lampDrain : 0)) / p.capacity,
  };
}
/** What the player emits for ecology (`Stimulus.noise` and `Stimulus.light`).
 * An unpowered or disabled hull shows no lamp. */
export function emission(p: CraftProfile, loudness: number, lamp: boolean, powered: boolean): { noise: number; light: number } {
  return { noise: Math.max(0, Math.min(1, loudness)), light: lamp && powered ? p.lamp : 0 };
}
/** Hull damage after plating. */
export const hullDamage = (p: CraftProfile, raw: number): number => Math.max(0, raw) * p.damage;

/** One contribution to the heat at the hull, classified by the hazard fields:
 * `core` inside a plume's shape, `burst` while a cycled plume is active, else ambient. */
export interface HeatContribution {
  readonly level: number;
  readonly kind: "ambient" | "core" | "burst";
}
export interface HeatExposure {
  /** Heat the hull feels after the shroud. */
  effective: number;
  /** True while the effective heat is within tolerance. */
  tolerated: boolean;
  /** × S4's heat-load rate while not tolerated. */
  loadRate: number;
  /** The shroud is fitted but this heat comes from a core or burst. */
  shroudBypassed: boolean;
}
/** Heat against tolerance. The thermal shroud ignores ambient heat only; a
 * plume core or an active burst always counts in full. */
export function heatExposure(p: CraftProfile, heat: readonly HeatContribution[], selfHeat = 0): HeatExposure {
  const counted = heat.filter((h) => !p.ambientHeatImmune || h.kind !== "ambient");
  const effective = Math.max(0, ...counted.map((h) => h.level)) + Math.max(0, selfHeat);
  return {
    effective,
    tolerated: effective <= p.heat,
    loadRate: p.heatLoad,
    shroudBypassed: p.ambientHeatImmune && counted.some((h) => h.level > p.heat),
  };
}
export const brineTolerated = (p: CraftProfile, brine: number): boolean => brine <= p.brine;
/** Drift felt from a current after the hull's authority (S4's driftFrom rule). */
export const driftScale = (p: CraftProfile): number => 1 - p.current;
