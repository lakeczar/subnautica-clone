/** Power and drain for SYS-2's socket hosts (pod, restored stops, field outposts,
 * the Hearthline). SYS-2's `HostPower` seam asks "is this host powered now";
 * `hostPowerState` answers it, and `hostDrainStep` is the drain that seam does
 * not model. The catches match the craft sources:
 * - `plant` (the pod, restored stops): fixed places, always on once restored;
 * - `solar` outposts: daylight only;
 * - `thermal` outposts: always on, but only vents qualify for siting (SYS-2);
 * - `cells` outposts: run down reserve and bio-cells in their lockers;
 * - the carrier: its own battery, which its powered occupants drain.
 *
 * Pure and structural: the inputs mirror SYS-2's `SocketHost` without importing it. */

/** SYS-2's `PowerSource`, plus the carrier's battery. */
export type HostPowerKind = "plant" | "solar" | "thermal" | "cells" | "carrier";
export const HOST_POWER = {
  /** Cell charge points per powered module per second: one full cell runs a decoder for 30 min. */
  moduleDrain: 100 / 1800,
  /** Carrier battery percent per powered occupant per second. */
  carrierDrain: 0.004,
  /** The carrier keeps this charge for itself; occupants stop below it. */
  carrierReserve: 20,
} as const;
export interface HostCell { readonly id: string; readonly kind: "reserve_cell" | "bio_cell"; readonly charge: number }
export interface HostPowerInput {
  readonly available: boolean;
  readonly power: HostPowerKind;
  /** Installed modules that need power (SYS-2 `MODULES[...].needsPower`) plus built-in chargers in use. */
  readonly poweredModules: number;
  /** 0..1; 1 until a day cycle exists. */
  readonly daylight?: number;
  /** Charged cells in the host's lockers (cells hosts). */
  readonly cells?: readonly HostCell[];
  /** The Hearthline's battery (carrier hosts). */
  readonly carrier?: { readonly charge: number; readonly disabled: boolean };
}
export interface HostPowerState { readonly powered: boolean; readonly reason: string | null }
export function hostPowerState(h: HostPowerInput): HostPowerState {
  const off = (reason: string): HostPowerState => ({ powered: false, reason });
  if (!h.available) return off("The host is not restored or deployed.");
  switch (h.power) {
    case "plant": case "thermal": return { powered: true, reason: null };
    case "solar": return (h.daylight ?? 1) > 0 ? { powered: true, reason: null } : off("Solar panels need daylight.");
    case "cells": return (h.cells ?? []).some((c) => c.charge > 0) ? { powered: true, reason: null }
      : off("Put a charged reserve cell or bio-cell in the locker.");
    case "carrier": {
      const c = h.carrier;
      if (!c || c.disabled) return off("The carrier is disabled.");
      return c.charge > HOST_POWER.carrierReserve ? { powered: true, reason: null }
        : off(`The carrier keeps its last ${HOST_POWER.carrierReserve}% for itself.`);
    }
  }
}
/** One step of drain while powered. Cells hosts draw bio-cells first (they cannot
 * be recharged), then the emptiest reserve cell, so full cells stay portable. */
export function hostDrainStep(h: HostPowerInput, dt: number): { cells: HostCell[]; carrierDrain: number } {
  const cells = [...(h.cells ?? [])];
  if (!hostPowerState(h).powered || h.poweredModules <= 0) return { cells, carrierDrain: 0 };
  if (h.power === "carrier") return { cells, carrierDrain: HOST_POWER.carrierDrain * h.poweredModules * dt };
  if (h.power !== "cells") return { cells, carrierDrain: 0 };
  let need = HOST_POWER.moduleDrain * h.poweredModules * dt;
  const order = cells.map((c, i) => ({ c, i })).filter(({ c }) => c.charge > 0)
    .sort((a, b) => Number(a.c.kind === "reserve_cell") - Number(b.c.kind === "reserve_cell") || a.c.charge - b.c.charge || a.c.id.localeCompare(b.c.id));
  for (const { c, i } of order) {
    if (need <= 0) break;
    const take = Math.min(need, c.charge);
    cells[i] = { ...c, charge: c.charge - take };
    need -= take;
  }
  return { cells, carrierDrain: 0 };
}
