/** SAVE-1: the phases that earn the save library's adverse, gear and tour kinds
 * (see kinds.ts). Each is ordinary play through real commands, like every other
 * phase: a diver who overstays on suit air, a Dart flown until its battery is
 * empty and brought home on its reserve cells, and late gear taken back to an
 * early region. Nothing writes the state. */
import { HULL_COLLIDERS, SOURCES } from "../../src/content/registry.js";
import type { ItemKind } from "../../src/content/registry.js";
import { HULL_SLOTS } from "../../src/content/upgrades/catalogue.js";
import { slotOf } from "../../src/sim/upgrades/fitting.js";
import type { UpgradeId } from "../../src/content/upgrades/catalogue.js";
import { airSupply } from "../../src/sim/survival.js";
import { sweptHullClearance } from "../../src/sim/world.js";
import { board, move, reach } from "./actions.js";
import { Blocked, where } from "./driver.js";
import type { Driver } from "./driver.js";
import { KINDS, LOW_AIR_PERCENT } from "./kinds.js";
import { boardCraft, followS2, harvest, homeAndUnload } from "./later.js";
import { dockAndService, ISLES, make, PUMPHOUSE_RUN } from "./live.js";
import type { Phase } from "./live.js";
import { breathe, enter, surface, surfaceTo } from "./nav.js";
import { all, custom } from "./outcomes.js";
import type { Outcome } from "./outcomes.js";
import { fly } from "./routes.js";
import { route, travel } from "./travel.js";

/** A kind's own facts as a phase outcome, so the phase cannot pass without them. */
const kindFacts = (kind: string): Outcome => (d) => KINDS.find((k) => k.kind === kind)!.facts!(d.state);

// ------------------------------------------------------------------------- low air

/** Over the reef's north glass ridge, a few metres off the bottom: no refuge, craft or air line near. */
const OVERSTAY = SOURCES.reef_glass_ridge_north.position;

export const lowAir: Phase = {
  id: "low-air", title: `Adverse: the diver overstays at the reef ridge until the ${LOW_AIR_PERCENT}% oxygen warning`,
  verify: kindFacts("low-air"),
  missing: () => [],
  play(d) {
    const top = { x: OVERSTAY.x + 3, y: -0.5, z: OVERSTAY.z };
    surfaceTo(d, top);
    const floor = d.world.groundHeight(top.x, top.z);
    travel(d, route("down to the ridge", "diver", "vertical dive, played", [{ ...top, y: Math.max(floor + 2.5, -40) }]));
    d.legOf("overstay on suit air", "work", () => {
      d.waitFor(`the ${LOW_AIR_PERCENT}% oxygen warning`, 400, (s) => s.player.vitals.oxygen <= LOW_AIR_PERCENT);
    });
    const warned = d.run.hazardLog.some((h) => h.phase === "low-air" && h.message.startsWith(`Oxygen ${LOW_AIR_PERCENT}%`));
    d.run.checks.push({ name: `the game warned at ${LOW_AIR_PERCENT}% oxygen`, ok: warned,
      detail: `oxygen ${d.state.player.vitals.oxygen.toFixed(1)}% at ${(-d.state.player.pose.position.y).toFixed(0)} m, ${airSupply(d.state).kind} air` });
  },
};

export const airReturn: Phase = {
  id: "air-return", title: "Straight up to the surface from the low-air save, then home to the pod",
  verify: all(custom("oxygen not restored", (d) => d.state.player.vitals.oxygen >= 99), custom("incapacitated", (d) => d.state.metrics.failures === 0)),
  missing: () => [],
  play(d) {
    surface(d);
    breathe(d);
    enter(d, "pod");
  },
};

// ------------------------------------------------------------------------- the tour Dart and a natural depletion

/** The core cell bank (capacity ×2) and core drive controller (drain ×0.65): the
 * Dart's best range, its two sockets. Both need the bp_rift_pressure plan (C06). */
const TOUR_UPGRADES = ["cell_bank_2", "drive_tuning_2"] as const;
/** CW-1's cave tour, one lap (plan.json totalMetres at 7dc9cc9). */
export const TOUR_LAP_METRES = 27_215;
/** The pump-house run: 400 m of the Dart's swept western water, flown out and back. */
const LAP_OUT = [...PUMPHOUSE_RUN.slice(1)].map((p) => ({ ...p }));
const LAP_BACK = [...PUMPHOUSE_RUN].reverse().slice(1).map((p) => ({ ...p }));

/** Thermal cores the two upgrades need, from the Rift's lower ledge by Creel if home has too few. */
function coresForUpgrades(d: Driver): void {
  const need = 3, have = d.count("thermal_core", ["diver", "workshop_locker", "pod_locker"]);
  if (have >= need) return;
  boardCraft(d, "creel");
  fly(d, "creel_out");
  fly(d, "basin_outbound");
  followS2(d, "route.basin.legacy_anchorage");
  followS2(d, "route.basin.rift");
  harvest(d, "rift_core_lower_north", need - have, { sort: true });
  followS2(d, "route.basin.rift", true);
  homeAndUnload(d, [["route.basin.legacy_anchorage", true]]);
}

export const tourFit: Phase = {
  id: "tour-fit", title: "The tour Dart: core cell bank and drive controller fitted, two charged reserve cells aboard, serviced",
  verify: kindFacts("tour-ready"),
  missing: () => [],
  play(d) {
    coresForUpgrades(d);
    const dart = d.vehicle("dart")!;
    // Free both sockets: whatever is socketed goes back to the workshop locker.
    enter(d, "workshop");
    for (const id of [...dart.modules]) {
      const item = d.state.inventory.items.find((i) => i.id === id)!;
      if (slotOf("dart", item.kind as UpgradeId) !== "socket") continue;
      d.command({ type: "remove-module", vehicleId: dart.id, itemId: id });
      d.run.notes.push(`tour Dart: ${item.kind} taken out of its socket for the tour upgrades`);
    }
    if (HULL_SLOTS.dart.socket < TOUR_UPGRADES.length) throw new Blocked(`The Dart has ${HULL_SLOTS.dart.socket} sockets`);
    for (const kind of TOUR_UPGRADES) {
      make(d, kind, "workshop", ISLES);
      enter(d, "workshop");
      const item = d.state.inventory.items.find((i) => i.kind === kind && !i.fitted && !d.vehicle("dart")!.modules.includes(i.id))!;
      d.command({ type: "install-module", vehicleId: dart.id, itemId: item.id });
    }
    // The two reserve cells, wherever the campaign left them, recharged at the bench.
    const cells = d.state.inventory.items.filter((i) => i.kind === "reserve_cell");
    if (cells.length < 2) throw new Blocked(`${cells.length} reserve cells exist`, where(d.state));
    for (const c of cells) if (c.containerId !== "workshop_locker" && c.containerId !== dart.cargoId) {
      if (c.containerId === "pod_locker") { enter(d, "pod"); move(d, "reserve_cell", 1, "pod_locker", "diver"); enter(d, "workshop"); }
      else move(d, "reserve_cell", 1, c.containerId, "workshop_locker");
    }
    enter(d, "workshop");
    if (d.count("reserve_cell", ["diver"])) move(d, "reserve_cell", d.count("reserve_cell", ["diver"]), "diver", "workshop_locker");
    if (d.state.inventory.items.some((i) => i.kind === "reserve_cell" && (i.charge ?? 0) < 100)) d.command({ type: "recharge-cells" });
    move(d, "reserve_cell" as ItemKind, d.count("reserve_cell", ["workshop_locker"]), "workshop_locker", dart.cargoId);
    reach(d, dart.id);
    d.command({ type: "service", vehicleId: dart.id }, { allowRefusal: true });
    board(d, dart.id);
  },
};

/** Fly the pump-house laps on the battery alone (no reserve cell) until it is empty. */
export const depleted: Phase = {
  id: "depleted", title: "Adverse (TST-23): the tour Dart flown on its battery alone until the helm dies",
  verify: kindFacts("battery-depleted"),
  missing: () => [],
  play(d) {
    const v = () => d.occupied()!;
    if (v().charge < 99) throw new Blocked(`The depletion run starts from a full battery, not ${v().charge.toFixed(1)}%`, where(d.state));
    const shape = HULL_COLLIDERS.dart;
    for (const leg of [[PUMPHOUSE_RUN[0], ...LAP_OUT], [LAP_OUT.at(-1)!, ...LAP_BACK]])
      for (let i = 0; i < leg.length - 1; i++)
        if (!sweptHullClearance(d.world, [leg[i]!, leg[i + 1]!], shape)) throw new Blocked(`The lap does not sweep clear at point ${i + 1}`);
    let warnings = 0, warnedAt: number | null = null;
    const listen = (x: Driver): void => {
      if (x.lastEvents.some((e) => e.type === "sound" && e.cue === "warning" && e.cause === "power")) { warnings++; warnedAt ??= v().charge; }
    };
    d.watchers.push(listen);
    const metres0 = d.state.metrics.pilotMetres, tick0 = d.state.tick;
    let laps = 0;
    try {
      d.legOf("pump-house laps until the battery is empty", "travel", () => {
        for (let guard = 0; v().charge > 0 && guard < 200; guard++) {
          const out = guard % 2 === 0;
          try {
            travel(d, route(out ? "lap out" : "lap back", "craft", "harness: pump-house run, swept", out ? LAP_OUT : LAP_BACK));
            if (!out) laps++;
          } catch (e) {
            // A dead helm stalls the travel helper: that is this phase's outcome, not a finding.
            if (!(e instanceof Blocked) || v().charge > 0) throw e;
          }
        }
        d.waitFor("the dead Dart to coast to a stop", 30, () => Math.hypot(v().velocity.x, v().velocity.y, v().velocity.z) < 0.05);
      });
    } finally { d.watchers.splice(d.watchers.indexOf(listen), 1); }
    const metres = d.state.metrics.pilotMetres - metres0;
    Object.assign(d.run.measurements, {
      dartFullChargeMetres: Math.round(metres), dartFullChargeSeconds: Math.round((d.state.tick - tick0) / 60), depletionLaps: laps,
      powerWarningCues: warnings, firstPowerWarningCharge: Math.round(warnedAt ?? -1), lampLit: d.state.player.lamp ? 1 : 0,
    });
    d.run.checks.push({ name: "the battery ran out in ordinary flight", ok: v().charge === 0,
      detail: `${(metres / 1000).toFixed(2)} km over ${laps} laps; ${warnings} power warning cues from ${Math.round(warnedAt ?? -1)}%; lamp ${d.state.player.lamp ? "lit" : "off"}` });
    d.run.checks.push({ name: "the game warned before the battery was empty", ok: warnings > 0 && (warnedAt ?? 0) > 0, detail: "" });
  },
};

export const powerRecovery: Phase = {
  id: "power-recovery", title: "From the depleted save: both reserve cells into the dead Dart, then home on them and serviced",
  verify: all(custom("the Dart is not serviced to full", (d) => d.vehicle("dart")!.charge >= 100), custom("incapacitated", (d) => d.state.metrics.failures === 0)),
  missing: () => [],
  play(d) {
    const dart = d.vehicle("dart")!;
    const gains: number[] = [];
    for (let i = 0; i < 2; i++) {
      const before = d.vehicle("dart")!.charge;
      d.command({ type: "reserve", vehicleId: dart.id });
      gains.push(d.vehicle("dart")!.charge - before);
    }
    const perCell = gains.reduce((a, b) => a + b, 0) / gains.length, full = d.run.measurements.dartFullChargeMetres ?? 0;
    const lap = full * (1 + (2 * perCell) / 100);
    Object.assign(d.run.measurements, { reserveCellPercent: Math.round(perCell * 10) / 10, dartLapMetres: Math.round(lap), tourLapMetres: TOUR_LAP_METRES });
    d.run.checks.push({ name: "reserve cells restore a dead helm", ok: airSupply(d.state).kind === "craft" && perCell > 0,
      detail: `+${gains.map((g) => g.toFixed(1)).join("% +")}%; full battery + 2 cells ≈ ${(lap / 1000).toFixed(1)} km against the ${(TOUR_LAP_METRES / 1000).toFixed(1)} km tour lap` });
    d.run.notes.push(`tour range: ${(full / 1000).toFixed(2)} km on a full battery and ${(lap / 1000).toFixed(1)} km with both cells, ` +
      `${lap >= TOUR_LAP_METRES ? "enough" : "NOT enough"} for one ${(TOUR_LAP_METRES / 1000).toFixed(1)} km tour lap at cruise (pump-house laps, lamp ${d.state.player.lamp ? "lit" : "off"})`);
    fly(d, { id: "home on the cells", source: "harness: pump-house run, swept", points: [...LAP_BACK, { x: 20, y: -1.6, z: -21 }] });
    dockAndService(d, d.vehicle("dart")!);
  },
};

// ------------------------------------------------------------------------- late gear in an early region

export const overGeared: Phase = {
  id: "canopy-return", title: "The 800 m Creel and suit back to the Canopy's outer-crown mooring, and home",
  verify: all(custom("the Creel is not home and serviced", (d) => d.vehicle("creel")!.charge >= 100 && !d.state.player.controlledVehicleId)),
  missing: () => [],
  play(d) {
    boardCraft(d, "creel");
    fly(d, "creel_out");
    fly(d, "head_to_stop");
    fly(d, "stop_to_head");
    fly(d, "creel_home");
    dockAndService(d, d.vehicle("creel")!);
  },
};

/** The disabled-but-escaped moment of the creel-loss run: lost at depth, the diver surfaced. */
export const lostAndSurfaced = (d: Driver): boolean => {
  const creel = d.vehicle("creel");
  return !!creel?.disabled && d.state.player.controlledVehicleId !== creel.id && d.state.player.mode === "swimming" &&
    d.state.player.pose.position.y > -1 && !d.state.recovery.operation;
};
