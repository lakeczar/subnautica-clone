import { EVIDENCE, HULLS, HULL_COLLIDERS, ITEMS, OPTIONAL_RECORD, renewable, SOURCES, techRecord } from "../content/registry.js";
import type { EvidenceId, SourceId } from "../content/registry.js";
import { createWorldQueries, hullFloor, moveHull, withinWorldBounds } from "./world.js";
import { FIXED_SECONDS as DT } from "./clock.js";
import type {
  GameCommand,
  GameEvent,
  GameState,
  Capsule,
  Vec3,
  WorldQueries,
} from "./types.js";
import {
  addItem,
  containerLabel,
  distance,
  equipped,
  hasRoom,
  inCanopyAir,
  nearPod,
  nearWorkshop,
  storeMaterials,
  transfer,
  usedCapacity,
  facility as facilityRestored,
} from "./inventory.js";
import {
  collectWithOutcome,
  completeOpening,
  craft,
  discover,
  frameDestination,
  readTechRecord,
  toggleBuoy,
} from "./progression.js";
import {
  ARM_CHARGE, ARM_LIFT_SECONDS, armTarget, cabinHull, cabinWorld, cook, CREEL_CABIN, hullHandling,
  enterCabinFromHatch, enterCabinFromHelm, hullToWorld, leaveByHatch, registerRefuge, takeHelmFromCabin,
} from "./fleet.js";
import { aimedInteraction } from "./targeting.js";
import { board, distraction, eat, exit, exitBlock, rechargeCells, reserve } from "./vehicles.js";
import { installModule, removeModule } from "./modules.js";
import {
  carrierCommand,
  carrierHull,
  carrierInteriorSolids,
  carrierTravelBounds,
  constrainCarrierYaw,
  CARRIER_LAYOUT,
  localToWorld,
  updateBerth,
} from "./carrier.js";

/** A caller correction is another continuous move, including from a legacy rib
 * overlap. Require the straight vertical path, its intended endpoint and floor;
 * accepting a slid/stopped correction would let an actor climb above the water.
 * No fixed displacement/thickness assumption, and no clearance-false bypass. */
function verticalCorrection(world: WorldQueries, position: Vec3, y: number, shape: Capsule, hull: boolean): Vec3 | null {
  if (y === position.y) return position;
  const target = { ...position, y };
  const floor = hull ? hullFloor(world, target, shape) + 0.05
    : world.groundHeight(target.x, target.z) - (shape.bottom ?? 0) - 0.02;
  if (!Number.isFinite(y) || !Number.isFinite(floor) || y < floor) return null;
  const correction = world.moveCapsule(position, { x: 0, y: y - position.y, z: 0 }, shape);
  return !correction.hitSolid && !correction.hitBoundary && distance(correction.position, target) <= 1e-10
    ? target : null;
}

/** One ordinary attempt, at most one surface-capped retry, then the retained
 * origin. Only the chosen attempt's collision/measurement data reaches callers.
 * surfaceLimitedRise records the constraint that rejected the ordinary rise;
 * correction probes never become additional propulsion/impact measurements. */
function surfaceMove<T extends ReturnType<WorldQueries["moveCapsule"]>>(
  world: WorldQueries, origin: Vec3, delta: Vec3, shape: Capsule,
  attempt: (d: Vec3) => T, targetY: (move: T) => number, hull = false,
): { move: T; surfaceLimitedRise: number; limited: boolean; rolledBack: boolean } {
  const first = attempt(delta), y = targetY(first);
  const limited = y !== first.position.y;
  const surfaceLimitedRise = Math.max(0, first.position.y - y);
  const corrected = verticalCorrection(world, first.position, y, shape, hull);
  if (corrected) return { move: { ...first, position: corrected }, surfaceLimitedRise, limited, rolledBack: false };
  const retry = attempt({ ...delta, y: Math.min(delta.y, y - origin.y) });
  const retryY = targetY(retry);
  const retryCorrected = verticalCorrection(world, retry.position, retryY, shape, hull);
  return {
    move: { ...retry, position: retryCorrected ?? { ...origin }, hitSolid: retry.hitSolid || !retryCorrected },
    surfaceLimitedRise: Math.max(surfaceLimitedRise, retry.position.y - retryY), limited, rolledBack: !retryCorrected,
  };
}
import { incapacitate, recoveryCommand, updateRecovery } from "./recovery.js";
import { updateSurvival, updateThreat } from "./survival.js";
import { safePersonalDepth } from "./capabilities.js";
import { advanceRenewal, settleRenewal } from "./renewal.js";
import { advanceStory, recordStory, resolutionCommand, storyHint, storyHost, useController, useGatePanel, useWorksFace, worksCommand } from "./storyLink.js";
import type { WorksFaceId } from "../content/story/placements.js";
import { fittedProtections, placeDeterrent, releaseKit, toggleLamp, updateEcology } from "./ecologyLink.js";
import { protectionFor } from "./ecology/hazards.js";
import { MOTION, respondToFlow } from "./currents/motion.js";
import { dampIntoFace, impactLoss, supportedDrift } from "./currents/move.js";
import { flowAt, worldCurrents } from "./currents/world.js";
import { stepUpgrades, upgradeAction } from "./fittings.js";
import { stepSystems, systemsCommand } from "./systemsLink.js";
import { serviceCommand, servicePreview } from "./serviceLink.js";
import { observeWorldCycles } from "./cyclesLink.js";
import { REST_BASES } from "../content/bases.js";
import { currentObjective } from "./objective.js";
import { DECODABLES } from "../content/systems/decodes.js";
import { readLostSite } from "./systemsLink.js";
import { restBaseHere } from "./survival.js";
import { vehicleProfile } from "./fittings.js";
import { hullDamage, motion } from "./upgrades/effects.js";
import { BALLAST, ballastStep, overdriveMotion } from "./upgrades/tools.js";
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
/** Highest rock lip a swimmer glides up onto, metres (one cave voxel, plus margin). */
const SWIM_LIP = 0.6;
/** How far under the surface cap a swimmer still counts as at the surface. */
const SURFACE_STEP = 0.005;
const clamp = (v: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, Number.isFinite(v) ? v : 0));
const TAU = Math.PI * 2;
/** Explicit receipts also own their one existing originless action sound. */
/** Field receipts name the actual module, not a fixed Dart example. */
function moduleName(s: GameState, itemId: string): string {
  const kind = s.inventory.items.find((i) => i.id === itemId)?.kind;
  return kind ? ITEMS[kind].label : "Module";
}
function actionResult(s: GameState, events: GameEvent[], summary: string, cue: "collect" | "craft" = "collect"): void {
  events.push({ type: "notice", channel: "action", message: s.feedback, summary }, { type: "sound", cue });
}
function exitAction(s: GameState, w: WorldQueries, events: GameEvent[]): string | null {
  if (cabinHull(s)) {
    const no = leaveByHatch(s, w);
    if (!no) actionResult(s, events, "Left the cabin");
    return no;
  }
  const block = exitBlock(s, w);
  if (block) {
    const v = s.fleet.vehicles.find(v => v.id === s.player.controlledVehicleId);
    if (s.player.mode === "piloting" && v) events.push({ type: "notice", channel: "action",
      message: block.message, error: true, refusal: { kind: "exit", vehicleId: v.id, code: block.code } });
    return block.message;
  }
  const no = exit(s, w);
  if (!no) actionResult(s, events, "Left the craft");
  return no;
}
/** Mutates only the detached fixed-step draft; every refusal precedes gameplay mutations. */
function action(s: GameState, c: GameCommand, w: WorldQueries, events: GameEvent[]): string | null {
  if (c.type === "look" || c.type === "move") return null;
  if (c.type === "skip-opening") {
    completeOpening(s);
    return null;
  }
  if (s.opening.phase < 4) {
    if (c.type === "interact") {
      if (s.opening.phase === 3) completeOpening(s);
      else {
        s.opening.phase = (s.opening.phase + 1) as 1 | 2 | 3;
        s.opening.phaseTicks = 0;
      }
    }
    return null;
  }
  const systems = systemsCommand(s, c, w);
  if (systems !== undefined) {
    if (systems === null && s.feedback) actionResult(s, events, s.feedback);
    return systems;
  }
  switch (c.type) {
    case "craft": {
      const no = craft(s, c.recipeId, w);
      if (!no && (c.recipeId === "dart_base" || c.recipeId === "dart_acoustic_trim"))
        actionResult(s, events, c.recipeId === "dart_base" ? "Dart scout built" : "Acoustic trim made", "craft");
      return no;
    }
    case "transfer": {
      const item = s.inventory.items.find((i) => i.id === c.itemId);
      const no = transfer(s, c.itemId, c.to, c.quantity);
      if (no) return no;
      const destination = containerLabel(s, c.to);
      s.feedback = `Transferred ${c.quantity} × ${ITEMS[item!.kind].label} to ${destination}.`;
      actionResult(s, events, `${c.quantity} × ${ITEMS[item!.kind].label} → ${destination}`);
      return null;
    }
    case "store-materials": {
      const before = usedCapacity(s, c.to);
      const no = storeMaterials(s, c.from, c.to);
      if (!no) actionResult(s, events, `Stored ${usedCapacity(s, c.to) - before} CU → ${containerLabel(s, c.to)}`);
      return no;
    }
    case "recharge-cells": {
      const no = rechargeCells(s);
      if (!no) actionResult(s, events, s.feedback);
      return no;
    }
    case "install-module": {
      const no = installModule(s, c.vehicleId, c.itemId, c.replace);
      if (!no) actionResult(s, events, `${moduleName(s, c.itemId)} fitted`);
      return no;
    }
    case "remove-module": {
      const no = removeModule(s, c.vehicleId, c.itemId, w);
      const item = s.inventory.items.find((i) => i.id === c.itemId);
      if (!no) actionResult(s, events, `${moduleName(s, c.itemId)} removed${item ? ` · ${containerLabel(s, item.containerId)}` : ""}`);
      return no;
    }
    case "eat":
      return eat(s);
    case "buoy":
      return toggleBuoy(s);
    case "exit":
      return exitAction(s, w, events);
    case "service": {
      // C4: the composed service; beside a field outpost its charger charges the craft.
      const charging = servicePreview(s, c.vehicleId).kind === "outpost";
      const no = serviceCommand(s, c.vehicleId);
      if (!no) actionResult(s, events, `${HULLS[s.fleet.vehicles.find(v => v.id === c.vehicleId)!.hull].label} ${charging ? "charged" : "serviced"}`);
      return no;
    }
    case "reserve": {
      const v = s.fleet.vehicles.find(v => v.id === c.vehicleId), before = v?.charge ?? 0;
      const no = reserve(s, c.vehicleId);
      if (!no) actionResult(s, events, `+${Number((v!.charge - before).toFixed(2))}% hull power`);
      return no;
    }
    case "recover":
      return recoveryCommand(s, c.vehicleId, c.method, w);
    case "cabin": {
      const no = c.action === "enter" ? enterCabinFromHelm(s) : c.action === "helm" ? takeHelmFromCabin(s)
        : c.action === "hatch" ? leaveByHatch(s, w) : cook(s);
      if (!no) actionResult(s, events, c.action === "enter" ? "Station held · cabin" : c.action === "helm" ? "Piloting Creel"
        : c.action === "hatch" ? "Left the cabin" : "Hot meal cooked");
      return no;
    }
    case "register-refuge": {
      const no = registerRefuge(s, c.vehicleId);
      if (!no) actionResult(s, events, c.vehicleId ? "Cabin registered as refuge" : "Cabin registration cleared");
      return no;
    }
    case "arm-lift": {
      const target = armTarget(s);
      if (!target) return "No salvage host within reach of the tool arms. Bring the bow within a few metres.";
      if (target.refusal) return target.refusal;
      s.world.action = { sourceId: target.sourceId, seconds: ARM_LIFT_SECONDS, kind: "arm" };
      events.push({ type: "notice", channel: "action", message: `Tool arms on ${SOURCES[target.sourceId].label} · ${ARM_LIFT_SECONDS} s · hold position.` });
      return null;
    }
    case "hint": {
      // Practical step first, the story's graduated hint second; while a craft is
      // disabled or cargo is cached, the recovery steps (M2 audit #5).
      const objective = currentObjective(s), flavour = storyHint(s);
      s.feedback = objective.kind === "recovery" ? objective.step
        : objective.kind === "story" ? flavour : `${objective.step} ${flavour === objective.step ? "" : `· ${flavour}`}`.trim();
      return null;
    }
    case "mark":
      if (!s.knowledge.markers.includes(c.placeId))
        return "Only visited places can be marked.";
      s.feedback = "Visited place retained in the notebook.";
      return null;
    case "carrier":
      if (c.action === "failure-drill" && s.scenario === "carrier-fixture") {
        incapacitate(s, "Fixture incapacity inside the carrier.");
        return null;
      }
      return carrierCommand(s, c.action, c.vehicleId, w);
    case "distraction": {
      const no = distraction(s);
      // S4: the paid pulse is also the acoustic deterrent, at its real target.
      if (!no && s.world.threat.distraction) placeDeterrent(s, "acoustic", s.world.threat.distraction);
      return no;
    }
    case "works":
      return worksCommand(s, c.action);
    case "resolution":
      return resolutionCommand(s, c.action, c.roster);
    case "lamp":
      return toggleLamp(s);
    case "upgrade": {
      const no = upgradeAction(s, c.action, w, c.itemId);
      // A flare is a bright light that sight hunters turn to: S4's lure, at the flare.
      if (!no && c.action === "flare") placeDeterrent(s, "lure", s.world.flares.at(-1)!.position);
      if (!no) actionResult(s, events, s.feedback);
      return no;
    }
    case "rest": {
      const base = restBaseHere(s);
      if (!base) return "Rest at a restored base's bunk: the pod, the workshop or a restored stop with air.";
      s.player.refugeId = base;
      s.feedback = `Resting at ${REST_BASES[base].label}. You will wake here if you are incapacitated.`;
      return null;
    }
    case "deploy-lure":
      return releaseKit(s, "lure");
    case "release-ink":
      return releaseKit(s, "ink");
    case "emergency-meal":
      if (!nearPod(s) && !nearWorkshop(s))
        return "Emergency portions are issued at a refuge.";
      if (
        s.inventory.items
          .filter((i) => i.kind === "meal" && i.containerId === "diver")
          .reduce((n, i) => n + i.quantity, 0) >= 2 ||
        s.player.vitals.food >= 70
      )
        return "Reserve issue is for a low-food restart with fewer than two carried meals.";
      if (!hasRoom(s, "diver", 1))
        return "Make 1 CU room for an emergency meal.";
      addItem(s, "meal", 1, "diver");
      s.feedback =
        "Emergency refuge meal issued. Shallow staple patches are also available without tools.";
      return null;
    case "sort": {
      const d = SOURCES[c.sourceId],
        node = s.world.resources.find((n) => n.id === c.sourceId)!;
      if (
        distance(s.player.pose.position, d.position) > 4 ||
        s.player.controlledVehicleId
      )
        return "Approach this source by hand.";
      if (!safePersonalDepth(s)) return "Refit personal pressure protection before working at this depth.";
      if (c.maintenance) {
        if (d.region !== "refuge_reef")
          return "Sort rescue stock at the shallow reef service habitats.";
        if (s.world.maintenance.alloy >= 2 && s.world.maintenance.membrane >= 1)
          return "Rescue stock still covers a field patch. It is reserved for recovery, not other purchases.";
        s.world.action = {
          sourceId: c.sourceId,
          seconds: 20,
          kind: "maintenance",
        };
      } else {
        if (node.reserve === 0) return "This host has no finite reserve left.";
        s.world.action = { sourceId: c.sourceId, seconds: 20, kind: "sort" };
      }
      s.feedback =
        "Active sorting started. Movement away cancels; pause freezes the action. Reserves do not reset on reload.";
      return null;
    }
    case "scan": {
      if (!equipped(s, "essential_tools"))
        return "Fabricate the scanner, or directly inspect the nearby physical records.";
      const t = aimedInteraction(s, w);
      if (!t) {
        events.push({ type: "notice", channel: "action", message: "Nothing within reach." });
        return null;
      }
      let message: string;
      if (t.kind === "evidence") {
        message = t.known ? `${t.label} · in notebook.` : discover(s, t.id as EvidenceId);
        if (!t.known) s.feedback = message;
      } else if (t.id in SOURCES) {
        const id = t.id as SourceId;
        if (!s.knowledge.scans.includes(id)) s.knowledge.scans.push(id);
        message = `${t.known ? `${t.label} · scan retained. ` : ""}${SOURCES[id].scan}`;
      } else message = `${t.label} · scan retained. The notebook distinguishes observed facts from hypotheses.`;
      s.world.threat.interest = Math.min(12, s.world.threat.interest + 2);
      events.push({ type: "notice", channel: "action", message }, { type: "sound", cue: "scan" });
      return null;
    }
    case "interact": {
      if (s.player.controlledVehicleId) return exitAction(s, w, events);
      const target = aimedInteraction(s, w);
      if (c.target !== undefined && target?.id !== c.target)
        return "Aim at a visible host within reach.";
      if (!target) {
        events.push({ type: "notice", channel: "action", message: "Nothing within reach." });
        return null;
      }
      if (target.kind === "source") {
        const id = target.id as SourceId;
        if (target.verb === "empty" || target.verb === "inspect") {
          // A scan-only site (C4, CB: never stocked) reads its scan instead of "Empty".
          events.push({ type: "notice", channel: "action", message: target.verb === "inspect" ? `${target.label} · ${SOURCES[id].scan}`
            : `${target.label} · Empty${renewable(id) ? " · regrowing" : ""}.` });
          return null;
        }
        if (target.verb === "sort" && SOURCES[id].item !== "meal")
          return action(s, { type: "sort", sourceId: id,
            maintenance: s.world.resources.find(n => n.id === id)!.reserve === 0 }, w, events);
        const { refusal, pickup } = collectWithOutcome(s, id);
        if (pickup) {
          const capacity = s.inventory.containers.find(c => c.id === pickup.destination)!.capacity;
          actionResult(s, events, `+${pickup.quantity} ${ITEMS[pickup.item].label} · ${containerLabel(s, pickup.destination)} ${usedCapacity(s, pickup.destination)}/${capacity} CU`);
        } else if (!refusal && SOURCES[id].item === "tagged_frame")
          events.push({ type: "notice", channel: "action", message: "Lifting tagged frame · 10 seconds. Movement away cancels; pause freezes the lift." });
        else if (!refusal && target.verb === "sort")
          events.push({ type: "notice", channel: "action", message: "Active tending started · 20 seconds. Movement away cancels; pause freezes tending." });
        return refusal;
      }
      if (target.id in EVIDENCE) {
        if (target.known) {
          events.push({ type: "interaction-panel", panel: "notebook", targetId: target.id });
          return null;
        }
        s.feedback = discover(s, target.id as EvidenceId);
        return null;
      }
      // C4: a lost site's records stay unreadable until decoded; outposts and
      // placed beacons open the base panel.
      if (target.id.startsWith("lost:")) {
        s.feedback = readLostSite(s, target.id.slice(5));
        if (s.systems.decoded.some((d) => DECODABLES[d].site === target.id.slice(5)))
          events.push({ type: "interaction-panel", panel: "journal", targetId: target.id });
        return null;
      }
      if (target.id.startsWith("outpost:") || target.id.startsWith("beacon:")) {
        events.push({ type: "interaction-panel", panel: "systems", targetId: target.id });
        return null;
      }
      if (techRecord(target.id)) {
        s.feedback = readTechRecord(s, target.id);
        return null;
      }
      if (target.id.startsWith("cabin:")) {
        const fixture = target.id.slice(6);
        if (fixture === "locker") {
          events.push({ type: "interaction-panel", panel: "inventory", targetId: target.id });
          return null;
        }
        if (fixture === "bunk") {
          const v = cabinHull(s)!;
          return action(s, { type: "register-refuge", vehicleId: s.player.mobileRefuge?.vehicleId === v.id ? null : v.id }, w, events);
        }
        return action(s, { type: "cabin", action: fixture === "helm" ? "helm" : fixture === "hatch" ? "hatch" : "cook" }, w, events);
      }
      if (target.id.endsWith(":hatch")) {
        const no = enterCabinFromHatch(s, target.id.slice(0, -6));
        if (!no) actionResult(s, events, "Entered the cabin");
        return no;
      }
      if (target.id.startsWith("works:")) return useWorksFace(s, target.id as WorksFaceId);
      // Once read, the live gate panel works the procedure and the controller the ending.
      if (target.known && target.id === "gate_panel") return useGatePanel(s);
      if (target.known && target.id === "district_controller") return useController(s);
      if (target.id === OPTIONAL_RECORD.id || storyHost(target.id)) {
        if (target.known && target.kind === "evidence") {
          events.push({ type: "interaction-panel", panel: "notebook", targetId: target.id });
          return null;
        }
        s.feedback = recordStory(s, target.id as typeof OPTIONAL_RECORD.id);
        return null;
      }
      if (target.kind === "vehicle" && target.verb === "board") {
        const no = board(s, target.id);
        if (!no) actionResult(s, events, `Piloting ${HULLS[s.fleet.vehicles.find(v => v.id === target.id)!.hull].label}`);
        return no;
      }
      if (target.kind === "vehicle") {
        events.push({ type: "interaction-panel", panel: "inventory", targetId: target.id });
        return null;
      }
      if (target.kind === "cache") {
        events.push({ type: "interaction-panel", panel: "inventory", targetId: target.id });
        return null;
      }
      events.push({ type: "interaction-panel", panel: target.id === "rescue_staging" ||
        (target.id === "canopy_stop_services" && s.world.facilities.some(f => f.id === "canopy_stop" && f.repaired)) ? "inventory" : "craft", targetId: target.id });
      return null;
    }
    default:
      return "That command is not available here.";
  }
}
function updateAction(s: GameState): void {
  const a = s.world.action;
  if (!a) return;
  if (a.kind === "arm") {
    const target = armTarget(s);
    if (!target || target.sourceId !== a.sourceId || target.refusal) {
      s.world.action = null;
      s.feedback = "Tool arms released · the bow left the host or the hold/power changed. Nothing lifted.";
      return;
    }
    a.seconds -= DT;
    if (a.seconds > 0) return;
    const v = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId)!;
    const def = SOURCES[a.sourceId], node = s.world.resources.find((n) => n.id === a.sourceId)!;
    const n = Math.min(def.bundle, node.stock);
    addItem(s, def.item, n, v.cargoId);
    node.stock -= n;
    v.charge = Math.max(0, v.charge - ARM_CHARGE);
    s.metrics.powerUsed += ARM_CHARGE;
    s.metrics.collections++;
    if (!s.knowledge.scans.includes(a.sourceId)) s.knowledge.scans.push(a.sourceId);
    s.feedback = `Tool arms · ${n} × ${ITEMS[def.item].label} → Creel hold · −${ARM_CHARGE}% power.`;
    s.world.action = null;
    return;
  }
  if (
    distance(s.player.pose.position, SOURCES[a.sourceId].position) > 4 ||
    s.player.controlledVehicleId || !safePersonalDepth(s)
  ) {
    s.world.action = null;
    return;
  }
  a.seconds -= DT;
  if (a.seconds > 0) return;
  const node = s.world.resources.find((n) => n.id === a.sourceId)!;
  if (a.kind === "lift") {
    const to = frameDestination(s);
    if (!to || node.stock < 1) {
      s.feedback = "No room for the frame now. Nothing lifted.";
      s.world.action = null;
      return;
    }
    addItem(s, "tagged_frame", 1, to);
    node.stock--;
    s.metrics.collections++;
    if (!s.knowledge.scans.includes(a.sourceId)) s.knowledge.scans.push(a.sourceId);
    const creel = s.fleet.vehicles.find((v) => v.cargoId === to);
    if (creel) {
      creel.charge = Math.max(0, creel.charge - ARM_CHARGE);
      s.metrics.powerUsed += ARM_CHARGE;
    }
    s.feedback = `Tagged frame lifted → ${creel ? `Creel hold by its arms · −${ARM_CHARGE}% power` : to === "diver" ? "diver hold" : "buoy"}.`;
    s.world.action = null;
    return;
  }
  if (a.kind === "sort") {
    const n = Math.min(2, node.reserve);
    node.reserve -= n;
    node.stock += n;
    settleRenewal(s, a.sourceId);
    s.feedback = `Sorted ${n} units from the finite reserve into exposed stock.`;
  } else if (a.kind === "food") {
    node.stock += 2;
    s.feedback =
      "Two new staple portions prepared by active tending. No respawn wait or equipment prerequisite.";
  } else {
    s.world.maintenance.alloy = Math.max(s.world.maintenance.alloy, 2);
    s.world.maintenance.membrane = Math.max(s.world.maintenance.membrane, 1);
    s.feedback =
      "Recovery-only shallow allocation sorted: one bound field patch. It cannot fund general crafting or optional purchases.";
  }
  s.world.action = null;
}
/** Tool arms belong to the piloted Creel: leaving the helm by any command releases them. */
function settleArm(s: GameState): void {
  if (s.world.action?.kind === "arm" &&
      s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId)?.hull !== "creel") s.world.action = null;
}
/** Menu transactions use the same rules without advancing survival or world time. */
export function executeCommand(
  state: GameState,
  command: GameCommand,
  world: WorldQueries,
): { state: GameState; events: GameEvent[] } {
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  const no = action(draft, command, world, events);
  settleArm(draft);
  if (no)
    return { state, events: events.some(e => e.type === "notice" && e.refusal)
      ? events : [{ type: "notice", channel: "action", message: no, error: true }] };
  if (draft.feedback && !events.some(e => e.type === "notice" || e.type === "interaction-panel"))
    events.push(
      { type: "notice", channel: "action", message: draft.feedback },
      { type: "sound", cue: command.type === "craft" ? "craft" : "collect" },
    );
  return { state: draft, events };
}
export function stepGame(
  state: GameState,
  commands: readonly GameCommand[],
  world: WorldQueries,
): { state: GameState; events: GameEvent[] } {
  const s = structuredClone(state),
    events: GameEvent[] = [];
  s.tick++;
  let movementActorStable = true;
  for (const c of commands) {
    const previous = s.feedback;
    const actionEvents: GameEvent[] = [];
    const no = action(s, c, world, actionEvents);
    settleArm(s);
    if (s.player.controlledVehicleId !== state.player.controlledVehicleId ||
        s.player.mode !== state.player.mode || s.player.interiorId !== state.player.interiorId)
      movementActorStable = false;
    if (no) events.push(...(actionEvents.some(e => e.type === "notice" && e.refusal)
      ? actionEvents : [{ type: "notice" as const, channel: "action" as const, message: no, error: true }]));
    else {
      events.push(...actionEvents);
      if (s.feedback && s.feedback !== previous && !actionEvents.some(e => e.type === "notice" || e.type === "interaction-panel")) events.push(
        { type: "notice", channel: "action", message: s.feedback },
        {
          type: "sound",
          cue:
            c.type === "craft"
              ? "craft"
              : c.type === "scan"
                ? "scan"
                : c.type === "recover"
                  ? "recovery"
                  : "collect",
        },
      );
    }
  }
  if (s.opening.phase < 4) {
    s.opening.phaseTicks++;
    return { state: s, events };
  }
  let forward = 0,
    right = 0,
    vertical = 0,
    sprint = false,
    quiet = false;
  let yaw = s.player.pose.yaw,
    pitch = s.player.pose.pitch;
  for (const c of commands) {
    if (c.type === "look") {
      yaw += clamp(c.yawDelta, -0.8, 0.8);
      pitch = clamp(pitch + clamp(c.pitchDelta, -0.8, 0.8), -1.35, 1.35);
    } else if (c.type === "move") {
      forward = clamp(c.forward, -1, 1);
      right = clamp(c.right, -1, 1);
      vertical = clamp(c.vertical, -1, 1);
      sprint = c.sprint;
      quiet = c.quiet ?? false;
    }
  }
  yaw = ((yaw % TAU) + TAU) % TAU;
  const v = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);
  const handling = v ? hullHandling(v.hull) : null;
  if (v && handling) {
    // A workboat turns deliberately: the hull and view follow a bounded heading rate.
    const turn = ((yaw - v.pose.yaw + Math.PI * 3) % TAU) - Math.PI, limit = handling.turnRate * DT;
    yaw = ((v.pose.yaw + clamp(turn, -limit, limit)) % TAU + TAU) % TAU;
  }
  if (v?.hull === "hearthline") {
    const requestedYaw = yaw;
    yaw = constrainCarrierYaw(s, yaw);
    if (yaw !== requestedYaw) events.push({ type: "foundation-boundary" });
  }
  s.player.pose.yaw = yaw;
  s.player.pose.pitch = pitch;
  const old = { ...s.player.pose.position };
  let loudness = 0;
  let ascent: Extract<GameEvent, { type: "ascent-sample" }> | null = null;
  let thrust: Extract<GameEvent, { type: "thrust-sample" }> | null = null;
  if (v) {
    const dock = s.fleet.docking,
      station = v.hull === "hearthline" && dock?.stationKeeping;
    // SYS-1 (C4): every hull's speed, loudness and drain come from its profile:
    // the hull base plus fitted upgrades, wrapped by a running overdrive.
    const profile = vehicleProfile(s, v), lampLit = s.player.lamp && v.charge > 0 && !v.disabled;
    const modeName = quiet ? "quiet" as const : sprint ? "boost" as const : "cruise" as const;
    const pilot = overdriveMotion(profile, v.upgrades, s.tick, motion(profile, modeName, { lamp: lampLit }));
    const speed = v.disabled || v.charge <= 0 || station ? 0 : pilot.speed;
    const forwardIntent = forward > 0.5 && Math.abs(right) <= 0.1;
    const n = Math.max(1, Math.hypot(forward, right, vertical));
    forward /= n;
    right /= n;
    vertical /= n;
    const target = {
      x:
        (Math.sin(yaw) * forward * Math.cos(pitch) + Math.cos(yaw) * right) *
        speed,
      y: (vertical + Math.sin(pitch) * forward) * speed * 0.75,
      z:
        (-Math.cos(yaw) * forward * Math.cos(pitch) + Math.sin(yaw) * right) *
        speed,
    };
    const response = handling ? handling.response : 2.8;
    for (const a of ["x", "y", "z"] as const)
      v.velocity[a] += (target[a] - v.velocity[a]) * Math.min(1, DT * response);
    const delta = {
      x: v.velocity.x * DT,
      y: v.velocity.y * DT,
      z: v.velocity.z * DT,
    };
    // CY currents: one flow sample before the move. The drift joins the drive
    // inside the hull's own sweep; `v.velocity` stays the drive alone.
    const powered = !v.disabled && v.charge > 0, drive = { ...v.velocity };
    const cruiseDrain = profile.drain / profile.capacity;
    const stopped = Math.hypot(target.x, target.y, target.z) < MOTION.stopped;
    const current = v.berth ? null : respondToFlow(flowAt(v.pose.position, s.tick).flow, {
      id: v.hull, authority: profile.current, cruise: profile.speed.cruise, drain: cruiseDrain,
    }, drive, v.upgrades.anchored && stopped ? "anchor" : powered && stopped ? "station" : "none", powered);
    const driftDelta = current ? { x: current.drift.x * DT, y: current.drift.y * DT, z: current.drift.z * DT } : ZERO;
    // Emergency ballast: a mechanical rise through the same sweep, power or not.
    const ballast = ballastStep(v.upgrades, Math.max(0, -(v.pose.position.y + 0.5)), DT);
    v.upgrades = ballast.runtime;
    // Ascent and thrust samples measure still-water propulsion only.
    const drifting = driftDelta.x !== 0 || driftDelta.y !== 0 || driftDelta.z !== 0;
    if (!drifting && speed > 0 && v.hull !== "spindle" && target.y > 0 && delta.y > 0)
      ascent = { type: "ascent-sample", actorId: v.id, requestedRise: delta.y,
        actualRise: 0, solidLimitedRise: 0, surfaceLimitedRise: 0 };
    const requested = Math.hypot(delta.x, delta.z);
    if (!drifting && v.hull === "dart" && speed > 0 && forwardIntent && Number.isFinite(requested) && requested > 1e-5 &&
        delta.x * Math.sin(yaw) - delta.z * Math.cos(yaw) > 0)
      thrust = { type: "thrust-sample", actorId: v.id, requested, actual: 0, solidLimited: 0, supportLimited: 0 };
    // Observe the existing sweeps before moveHull's separate terrain correction.
    // Its aggregate hitSolid also includes floor support and cannot classify a ceiling.
    const attempt = ascent;
    const forwardAttempt = thrust;
    const shape = HULL_COLLIDERS[v.hull], hullOrigin = { ...v.pose.position };
    let requestedTravel = delta, floorRefused = false;
    const constrained = surfaceMove(world, hullOrigin, delta, shape, d => {
      floorRefused = false;
      // Drift may descend only to the floor margin (move.ts `supportedDrift`).
      const drifted = drifting ? supportedDrift(world, hullOrigin, d, driftDelta, shape) : ZERO;
      const travel = { x: d.x + drifted.x, y: d.y + drifted.y + ballast.rise, z: d.z + drifted.z };
      requestedTravel = travel;
      let solidRise = 0, solidThrust = 0, supportThrust = 0, forwardBoundary = false;
      const measuredWorld: WorldQueries = attempt || forwardAttempt ? { ...world, moveCapsule(origin, slice, proxy) {
        const result = world.moveCapsule(origin, slice, proxy);
        if (attempt && result.hitSolid && slice.y > 0)
          solidRise += Math.max(0, origin.y + slice.y - result.position.y);
        if (forwardAttempt && result.hitSolid)
          solidThrust += Math.max(0, Math.hypot(slice.x, slice.z) -
            Math.hypot(result.position.x - origin.x, result.position.z - origin.z));
        if (forwardAttempt && result.hitBoundary) forwardBoundary = true;
        return result;
      } } : world;
      const moved = moveHull(measuredWorld, hullOrigin, travel, shape,
        v.hull === "hearthline" ? carrierTravelBounds() : undefined,
        rejected => { floorRefused = true; if (forwardAttempt) supportThrust += rejected; });
      return { ...moved, solidRise, solidThrust, supportThrust, forwardBoundary };
    }, move => v.hull === "spindle" ? -0.4 : Math.min(-0.9, move.position.y), true);
    const move = constrained.move;
    if (ascent) {
      ascent.solidLimitedRise = constrained.rolledBack ? Math.max(0, delta.y) : move.solidRise;
      ascent.surfaceLimitedRise = constrained.surfaceLimitedRise;
    }
    if (thrust) {
      thrust.solidLimited = constrained.rolledBack ? requested : move.solidThrust;
      // A final surface rollback already attributes all refused travel above.
      // Discarded ordinary attempts never contribute support from their retry.
      thrust.supportLimited = constrained.rolledBack ? 0 : move.supportThrust;
    }
    // CY contact rules: the refused travel is the face's direction. Only the
    // drive closing into it is an impact, and only that part is damped, so a
    // hull pressed along rock by a current keeps its slide and its health.
    // When the floor guard refuses a slice it discards the slice's rise too,
    // but the face is the floor: rising is never travel into it.
    const lostY = requestedTravel.y - (move.position.y - hullOrigin.y);
    const lost = { x: requestedTravel.x - (move.position.x - hullOrigin.x),
      y: constrained.limited ? 0 : floorRefused ? Math.min(0, lostY) : lostY,
      z: requestedTravel.z - (move.position.z - hullOrigin.z) };
    const lostLength = Math.hypot(lost.x, lost.y, lost.z);
    const refused = move.hitSolid && lostLength > 1e-9
      ? { x: lost.x / lostLength, y: lost.y / lostLength, z: lost.z / lostLength } : null;
    const closing = refused ? Math.max(0, drive.x * refused.x + drive.y * refused.y + drive.z * refused.z) : 0;
    const impact = hullDamage(profile, impactLoss(closing, DT));
    if (impact > 0) {
      const before = v.health;
      v.health = Math.max(0, v.health - impact);
      const hullLoss = before - v.health;
      if (hullLoss > 0) events.push({ type: "impact", speed: closing, hullLoss, origin: { ...move.position } });
    }
    v.velocity = dampIntoFace(v.velocity, refused);
    v.pose.position = move.position;
    v.pose.yaw = yaw;
    v.pose.pitch = pitch;
    s.player.pose.position = { ...v.pose.position };
    s.player.velocity = { ...v.velocity };
    s.player.mode = "piloting";
    const d = distance(old, s.player.pose.position);
    s.metrics.pilotMetres += d;
    // "Moving" is the drive, not displacement: drifting is not cruising.
    const moving = Math.hypot(drive.x, drive.y, drive.z) * DT > 0.003;
    const idle = motion(profile, "idle", { lamp: lampLit });
    const drain = powered ? ((moving ? pilot.drain : idle.drain) + (current?.extraDrain ?? 0)) * DT : 0;
    v.charge = Math.max(0, v.charge - drain);
    s.metrics.powerUsed += drain;
    loudness = Math.max(quiet ? pilot.loudness : sprint || moving ? pilot.loudness : idle.loudness,
      ballast.rise > 0 ? BALLAST.loudness : 0);
    if (move.hitBoundary) events.push({ type: "foundation-boundary" });
    if (move.hitBoundary || move.forwardBoundary) thrust = null;
    else if (thrust) thrust.actual = Math.hypot(move.position.x - old.x, move.position.z - old.z);
  } else if (cabinHull(s)) {
    // A fixed dry room on a stationary hull: walk in hull-local metres.
    const h = cabinHull(s)!, local = s.player.interiorPose!;
    const x = (Math.sin(yaw - h.pose.yaw) * forward + Math.cos(yaw - h.pose.yaw) * right) * 2.2 * DT,
      z = (-Math.cos(yaw - h.pose.yaw) * forward + Math.sin(yaw - h.pose.yaw) * right) * 2.2 * DT;
    const moved = cabinWorld().moveCapsule(local.position, { x, y: 0, z }, { radius: 0.34, height: 1.75 });
    const walk = CREEL_CABIN.walk;
    local.position = { x: clamp(moved.position.x, walk.minX, walk.maxX), y: CREEL_CABIN.floorY,
      z: clamp(moved.position.z, walk.minZ, walk.maxZ) };
    s.player.pose.position = hullToWorld(local.position, h);
    s.player.mode = "interior";
  } else if (s.player.interiorId) {
    const h = carrierHull(s),
      local = s.player.interiorPose;
    if (h && local && s.fleet.docking?.stationKeeping) {
      const x =
          (Math.sin(yaw - h.pose.yaw) * forward +
            Math.cos(yaw - h.pose.yaw) * right) *
          3 *
          DT,
        z =
          (-Math.cos(yaw - h.pose.yaw) * forward +
            Math.sin(yaw - h.pose.yaw) * right) *
          3 *
          DT;
      const moved = createWorldQueries(carrierInteriorSolids(s), () => -200).moveCapsule(local.position, { x, y: 0, z }, { radius: 0.34, height: 1.75 });
      const position = { x: clamp(moved.position.x, CARRIER_LAYOUT.interior.minX, CARRIER_LAYOUT.interior.maxX),
        y: local.position.y, z: clamp(moved.position.z, CARRIER_LAYOUT.interior.minZ, CARRIER_LAYOUT.interior.maxZ) };
      // Old saves may overhang the new carrier travel envelope. Refuse only the
      // out-of-world walking step, retaining its swept local pose and ownership.
      if (withinWorldBounds(localToWorld(position, h))) local.position = position;
      else events.push({ type: "foundation-boundary" });
      s.player.pose.position = localToWorld(local.position, h);
      s.player.mode = "interior";
    }
  } else {
    const support = world.supportHeight(old.x, old.z, old.y),
      dry = inCanopyAir(s);
    let mode =
      (support >= world.waterHeight - 0.55 && old.y >= support - 0.25) || dry
        ? ("walking" as const)
        : ("swimming" as const);
    const speed = quiet
        ? 2
        : mode === "walking"
          ? sprint
            ? 5.5
            : 3.6
          : sprint
            ? 5.2
            : 3.4,
      n = Math.max(1, Math.hypot(forward, right));
    forward /= n;
    right /= n;
    let vx =
        (Math.sin(yaw) * forward * (mode === "swimming" ? Math.cos(pitch) : 1) +
          Math.cos(yaw) * right) *
        speed,
      vz =
        (-Math.cos(yaw) *
          forward *
          (mode === "swimming" ? Math.cos(pitch) : 1) +
          Math.sin(yaw) * right) *
        speed;
    let vy =
      mode === "walking"
        ? old.y <= support + 0.025
          ? vertical > 0.5
            ? 5.4
            : -0.2
          : s.player.velocity.y - 13 * DT
        : old.y > world.waterHeight - 0.5
          ? s.player.velocity.y - 12 * DT
          : vertical * 2.8 + Math.sin(pitch) * forward * speed;
    if (
      mode === "swimming" &&
      old.y <= -0.5 &&
      Math.abs(vertical) < 0.01 &&
      Math.abs(Math.sin(pitch) * forward) < 0.04
    )
      vy = 0;
    const magnitude = Math.hypot(vx, vy, vz);
    if (mode === "swimming" && magnitude > speed) {
      vx *= speed / magnitude;
      vy *= speed / magnitude;
      vz *= speed / magnitude;
    }
    // CY currents, swimming only: the drift joins the swim inside each slice,
    // so support, the cliff guard and the surface cap still apply to it. The
    // diver holds nothing and pays only time and position, never health.
    const swimCurrent = mode === "swimming" ? respondToFlow(flowAt(old, s.tick).flow,
      { id: "diver", authority: protectionFor(null, fittedProtections(s)).current, cruise: speed, drain: 0 },
      { x: vx, y: vy, z: vz }, "none") : null;
    const drift = swimCurrent?.drift ?? ZERO;
    const drifting = drift.x !== 0 || drift.y !== 0 || drift.z !== 0;
    if (!drifting && mode === "swimming" && vertical * 2.8 + Math.sin(pitch) * forward * speed > 0 && vy > 0)
      ascent = { type: "ascent-sample", actorId: null, requestedRise: 0,
        actualRise: 0, solidLimitedRise: 0, surfaceLimitedRise: 0 };
    let position = { ...old },
      hitBoundary = false;
    const slices = Math.max(1, Math.ceil((Math.hypot(vx + drift.x, vy + drift.y, vz + drift.z) * DT) / 0.12)),
      capsule = { radius: 0.34, height: mode === "walking" ? 1.75 : 0.95 };
    for (let i = 0; i < slices; i++) {
      const delta = {
        x: ((vx + drift.x) * DT) / slices,
        y: ((vy + drift.y) * DT) / slices,
        z: ((vz + drift.z) * DT) / slices,
      };
      const requestedRise = Math.max(0, delta.y);
      if (ascent) ascent.requestedRise += requestedRise;
      // The cliff guard reads support from below, never the raw heightfield:
      // inside a cave footprint the heightfield steps aside, and a mouth
      // threshold must not read as a 17 m wall.
      const nextFloor = world.supportHeight(
          position.x + delta.x,
          position.z + delta.z,
          position.y,
        ),
        currentFloor = world.supportHeight(position.x, position.z, position.y);
      if (
        nextFloor > position.y + 0.22 &&
        nextFloor - currentFloor > Math.hypot(delta.x, delta.z) * 1.15 + 0.015
      ) {
        delta.x = 0;
        delta.z = 0;
        vx = 0;
        vz = 0;
      }
      const nextSupport = world.supportHeight(
        position.x + delta.x,
        position.z + delta.z,
        position.y,
      );
      if (
        nextSupport <= position.y + 0.22 &&
        position.y + delta.y < nextSupport
      )
        delta.y = nextSupport - position.y;
      const sliceOrigin = { ...position };
      const constrained = surfaceMove(world, sliceOrigin, delta, capsule, d => {
        let move = world.moveCapsule(sliceOrigin, d, capsule), waded = false;
        // A swimmer gliding along a floor of rock boxes (a cave's 0.5 m
        // terraces) meets each riser as a face. When the joint sweep is
        // stopped and a lip at most SWIM_LIP above lies just ahead, rise onto
        // it first, then travel on; kept only if it gets further.
        if (mode === "swimming" && move.hitSolid && (d.x !== 0 || d.z !== 0)) {
          // The lip is under the box's leading edge: read the whole footprint.
          let lip = -Infinity;
          for (const [ox, oz] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]] as const)
            lip = Math.max(lip, world.supportHeight(sliceOrigin.x + d.x + ox * capsule.radius, sliceOrigin.z + d.z + oz * capsule.radius,
              sliceOrigin.y + SWIM_LIP));
          const rise = lip + 0.01 - sliceOrigin.y;
          // Only under water: never a climb onto a float or out at the surface.
          // At the surface too (CA-1 P3): a diver at or just under the cap steps onto
          // a lip that is itself at or under the waterline (a wading shelf), never
          // onto dry rock or a float.
          const submerged = sliceOrigin.y + rise + capsule.height < -0.5;
          // A shelf, not a rib's edge: one body width ahead is still standable floor.
          const dl = Math.hypot(d.x, d.z), ahead = (k: number) => world.supportHeight(
            sliceOrigin.x + d.x / dl * k, sliceOrigin.z + d.z / dl * k, sliceOrigin.y + SWIM_LIP);
          const wading = sliceOrigin.y >= -0.5 - SURFACE_STEP && lip <= -0.5 + 1e-6 &&
            ahead(capsule.radius * 3) >= -0.55 && ahead(capsule.radius * 3) <= -0.5 + 1e-6;
          if (rise > Math.max(0, d.y) && rise <= SWIM_LIP && (submerged || wading)) {
            const up = world.moveCapsule(sliceOrigin, { x: 0, y: rise, z: 0 }, capsule);
            if (!up.hitSolid && !up.hitBoundary) {
              const across = world.moveCapsule(up.position, { x: d.x, y: 0, z: d.z }, capsule);
              const progress = (q: Vec3): number => Math.hypot(q.x - sliceOrigin.x, q.z - sliceOrigin.z);
              if (progress(across.position) > progress(move.position) + 1e-6) { move = across; waded = !submerged; }
            }
          }
        }
        const solidRise = move.hitSolid && requestedRise > 0
          ? Math.max(0, sliceOrigin.y + Math.max(0, d.y) - move.position.y) : 0;
        const floor = world.supportHeight(move.position.x, move.position.z, move.position.y);
        const supported = move.position.y < floor;
        return { ...move, solidRise, floor, supported, waded };
      }, move => {
        // Support is another vertical correction, just like the water cap.
        // Validate its whole path before accepting it near a cliff/adjacent solid.
        // A surface step onto a wading shelf stands on its edge: the cap does not
        // push the body back into the lip it just rose onto.
        const y = Math.max(move.position.y, move.floor);
        return mode === "swimming" && old.y <= -0.5 && move.floor < -0.55 && !move.waded ? Math.min(-0.5, y) : y;
      });
      if (ascent) {
        ascent.solidLimitedRise += constrained.rolledBack ? requestedRise : constrained.move.solidRise;
        ascent.surfaceLimitedRise += constrained.surfaceLimitedRise;
      }
      position = constrained.move.position;
      hitBoundary ||= constrained.move.hitBoundary;
      if (constrained.move.supported || constrained.limited) vy = 0;
    }
    const finalSupport = world.supportHeight(
      position.x,
      position.z,
      position.y,
    );
    s.player.pose.position = position;
    s.player.velocity = { x: vx, y: vy, z: vz };
    mode =
      (finalSupport >= -0.55 || inCanopyAir(s)) &&
      position.y >= finalSupport - 0.25
        ? "walking"
        : "swimming";
    s.player.mode = mode;
    const d = distance(old, position);
    if (mode === "swimming") s.metrics.swimMetres += d;
    loudness = quiet ? 0.03 : sprint ? 0.6 : d > 0.001 ? 0.14 : 0;
    if (hitBoundary) events.push({ type: "foundation-boundary" });
  }
  if (s.player.mode !== state.player.mode)
    events.push({ type: "movement-mode-changed", mode: s.player.mode });
  // A current's readable cue, once, as the swimmer or craft enters its flow.
  if (s.player.mode === "swimming" || s.player.mode === "piloting") {
    const felt = (c: { weight: number; level: number }): boolean => c.weight * c.level > 0.05;
    const was = new Set(flowAt(old, state.tick).volumes.filter(felt).map(c => c.id));
    for (const c of flowAt(s.player.pose.position, s.tick).volumes)
      if (!was.has(c.id) && felt(c)) {
        const def = worldCurrents().volumes.find(volume => volume.id === c.id);
        if (def) events.push({ type: "notice", channel: "hazard", context: "ecology", message: `${def.label} · ${def.cue}` });
      }
  }
  const buoy = s.inventory.buoy;
  if (
    buoy.deployed &&
    distance(buoy.position, s.player.pose.position) < 12 &&
    distance(buoy.position, s.player.pose.position) > 3
  ) {
    for (const a of ["x", "y", "z"] as const)
      buoy.position[a] +=
        (s.player.pose.position[a] - buoy.position[a]) * DT * 2;
  }
  updateAction(s);
  stepUpgrades(s, new Set(s.fleet.vehicles.filter((a) => distance(a.pose.position,
    state.fleet.vehicles.find((b) => b.id === a.id)?.pose.position ?? a.pose.position) > 0.003).map((a) => a.id)));
  stepSystems(s, events);
  observeWorldCycles(s, world, events);
  advanceRenewal(s);
  advanceStory(s);
  updateBerth(s, world);
  const recoveryEvent = updateRecovery(s, world);
  if (recoveryEvent) events.push(recoveryEvent.type === "notice"
    ? { ...recoveryEvent, channel: recoveryEvent.error ? "hazard" : "action", context: "recovery" }
    : recoveryEvent);
  updateThreat(s, loudness, events, world);
  // S4 ecology beside the hunter, with the same loudness; a scan pulse disturbs.
  updateEcology(s, loudness, commands.some((c) => c.type === "scan"), events, world);
  updateSurvival(s, events);
  // A command/berth transition or incapacity can replace the moving actor this step.
  // Emit only a measurement that still describes the original active actor and mode.
  if (ascent && state.opening.phase === 4 && s.player.mode === state.player.mode &&
      s.player.mode === (ascent.actorId === null ? "swimming" : "piloting") &&
      s.player.controlledVehicleId === ascent.actorId && state.player.controlledVehicleId === ascent.actorId &&
      !s.player.interiorId && s.metrics.failures === state.metrics.failures &&
      (!v || (!v.disabled && v.charge > 0))) {
    ascent.actualRise = s.player.pose.position.y - old.y;
    events.push(ascent);
  }
  if (thrust && movementActorStable && state.opening.phase === 4 &&
      s.player.mode === "piloting" && state.player.mode === "piloting" &&
      s.player.controlledVehicleId === thrust.actorId && state.player.controlledVehicleId === thrust.actorId &&
      !s.player.interiorId && s.metrics.failures === state.metrics.failures &&
      v && !v.disabled && v.charge > 0)
    events.push(thrust);
  return { state: s, events };
}

/** Cave admission's relocation (CW-1; LC's rescue and LC-07's refuge),
 * applied before anything steps. A deterministic teleport, never travel:
 * - **point:** the controlled craft (or the diver) is moved to the verified
 *   exterior point, at rest;
 * - **refuge:** the diver leaves any craft (it stays where it is, hold and
 *   modules intact) and wakes at their refuge base: the last restored base
 *   rested at while it still works, else the pod.
 * Inventory, knowledge, vitals and vessel state are untouched. */
export function relocateForCave(state: GameState, to: { kind: "point"; position: Vec3 } | { kind: "refuge" }): GameState {
  const s = structuredClone(state), p = s.player;
  if (to.kind === "point") {
    const v = s.fleet.vehicles.find(x => x.id === p.controlledVehicleId);
    if (v) { v.pose.position = { ...to.position }; v.velocity = { x: 0, y: 0, z: 0 }; }
    p.pose = { ...p.pose, position: { ...to.position } };
    p.velocity = { x: 0, y: 0, z: 0 };
    if (!v && p.mode !== "interior") p.mode = to.position.y < -0.5 ? "swimming" : p.mode;
    return s;
  }
  const rested = REST_BASES[p.refugeId], base = rested.facility === null || facilityRestored(s, rested.facility) ? p.refugeId : "home_pod";
  const wake = REST_BASES[base].wake;
  p.controlledVehicleId = null; p.interiorId = null; p.interiorPose = null;
  p.pose = { frame: "world", position: { ...wake }, yaw: 0, pitch: -0.05 };
  p.velocity = { x: 0, y: 0, z: 0 };
  p.mode = wake.y >= 0 ? "walking" : "swimming";
  p.refugeId = base;
  s.world.action = null;
  s.feedback = `This cave could not load. You were returned to ${base === "home_pod" ? "the home pod" : REST_BASES[base].label}; your craft waits where you left it.`;
  return s;
}
