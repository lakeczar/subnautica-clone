/** Each hull's unfitted handling, emission and tolerance: the base that upgrade
 * effects fold onto. One table so composition can read every craft from the
 * same place. Values mirror today's sources, named per row; tests pin the
 * mirrors that this checkout can import. Mantle handling is a new proposal
 * (today step.ts drives it with the Dart's constants). */
import type { HullId } from "../registry.js";

export interface HullBase {
  /** m/s. */
  readonly speed: { readonly quiet: number; readonly cruise: number; readonly boost: number };
  /** 0..1 loudness per mode; `idle` is a stopped, powered hull. */
  readonly loudness: { readonly idle: number; readonly quiet: number; readonly cruise: number; readonly boost: number };
  /** Stock-battery percent per second at cruise. */
  readonly drain: number;
  /** Drain factor in quiet and boost; idle drain is a flat percent per second. */
  readonly drainMode: { readonly quiet: number; readonly boost: number; readonly idle: number };
  /** Lamp output while lit (ecology LAMP_OUTPUT). */
  readonly lamp: number;
  /** S4 HULL_TOLERANCE. */
  readonly heat: number;
  readonly brine: number;
  readonly current: number;
  /** Solar charge at the surface in full light, stock-battery percent per second. */
  readonly solar: number;
}

const DART_LIKE = { idle: 0.08, quiet: 0.08, cruise: 0.48, boost: 1 } as const;
const DEFAULT_DRAIN = { quiet: 0.65, boost: 1.7, idle: 0.015 } as const;

export const HULL_BASE = {
  // step.ts: quiet 3, cruise 8, boost 11; drain 100/900 with ×0.65 / ×1.7.
  dart: { speed: { quiet: 3, cruise: 8, boost: 11 }, loudness: DART_LIKE, drain: 100 / 900, drainMode: DEFAULT_DRAIN,
    lamp: 0.9, heat: 0.3, brine: 0, current: 0.5, solar: 0 },
  // sim/fleet.ts CREEL_HANDLING; step.ts idle loudness 0.08 and drain ×0.6 / ×1.6.
  creel: { speed: { quiet: 2.5, cruise: 5, boost: 6.5 }, loudness: { idle: 0.08, quiet: 0.12, cruise: 0.62, boost: 1 },
    drain: 100 / 700, drainMode: { quiet: 0.6, boost: 1.6, idle: 0.015 }, lamp: 1, heat: 0.35, brine: 0.1, current: 0.6, solar: 0 },
  // S9 HUSH_HANDLING.
  hush: { speed: { quiet: 4, cruise: 6, boost: 7.5 }, loudness: { idle: 0.03, quiet: 0.03, cruise: 0.2, boost: 0.7 },
    drain: 100 / 1200, drainMode: { quiet: 0.6, boost: 1.6, idle: 0.015 }, lamp: 0.5, heat: 0.3, brine: 0, current: 0.25, solar: 0 },
  // step.ts: 7 m/s in every mode. The solar canopy is the Spindle's own (proposal):
  // it nearly covers cruise drain, so only the array makes a surfaced Spindle gain while moving slowly.
  spindle: { speed: { quiet: 7, cruise: 7, boost: 7 }, loudness: DART_LIKE, drain: 100 / 900, drainMode: DEFAULT_DRAIN,
    lamp: 0.4, heat: 0.3, brine: 0, current: 0.4, solar: 0.05 },
  // C3's composed MANTLE_HANDLING (sim/fleet.ts); C4 aligned this row so an unfitted Mantle is unchanged.
  mantle: { speed: { quiet: 2, cruise: 4, boost: 5 }, loudness: { idle: 0.08, quiet: 0.1, cruise: 0.5, boost: 0.85 },
    drain: 100 / 800, drainMode: { quiet: 0.6, boost: 1.6, idle: 0.015 }, lamp: 1, heat: 0.8, brine: 0.7, current: 0.85, solar: 0 },
  // step.ts: 3 m/s in every mode; C3's CARRIER_DRAIN (100/2400). Dorsal panels give a token surfaced trickle (proposal).
  hearthline: { speed: { quiet: 3, cruise: 3, boost: 3 }, loudness: DART_LIKE, drain: 100 / 2400, drainMode: DEFAULT_DRAIN,
    lamp: 1, heat: 0.4, brine: 0.2, current: 0.9, solar: 0.01 },
} as const satisfies Record<HullId, HullBase>;
