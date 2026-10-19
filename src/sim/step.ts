import { EVIDENCE, HULLS, HULL_COLLIDERS, ITEMS, OPTIONAL_RECORD, SOURCES } from "../content/registry.js";
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
} from "./inventory.js";
import {
  collectWithOutcome,
  completeOpening,
  craft,
  discover,
  hint,
  toggleBuoy,
} from "./progression.js";
import { aimedInteraction } from "./targeting.js";
import { board, distraction, eat, exit, exitBlock, rechargeCells, reserve, service } from "./vehicles.js";
import { dartPerformance, installModule, removeModule } from "./modules.js";
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
const clamp = (v: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, Number.isFinite(v) ? v : 0));
const TAU = Math.PI * 2;
/** Explicit receipts also own their one existing originless action sound. */
function actionResult(s: GameState, events: GameEvent[], summary: string, cue: "collect" | "craft" = "collect"): void {
  events.push({ type: "notice", channel: "action", message: s.feedback, summary }, { type: "sound", cue });
}
function exitAction(s: GameState, w: WorldQueries, events: GameEvent[]): string | null {
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
      const no = installModule(s, c.vehicleId, c.itemId);
      if (!no) actionResult(s, events, "Dart acoustic trim fitted");
      return no;
    }
    case "remove-module": {
      const no = removeModule(s, c.vehicleId, c.itemId, w);
      if (!no) actionResult(s, events, "Dart acoustic trim removed · Dart hold");
      return no;
    }
    case "eat":
      return eat(s);
    case "buoy":
      return toggleBuoy(s);
    case "exit":
      return exitAction(s, w, events);
    case "service": {
      const no = service(s, c.vehicleId);
      if (!no) actionResult(s, events, `${HULLS[s.fleet.vehicles.find(v => v.id === c.vehicleId)!.hull].label} serviced`);
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
    case "hint":
      s.feedback = hint(s);
      return null;
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
    case "distraction":
      return distraction(s);
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
        if (target.verb === "empty") {
          events.push({ type: "notice", channel: "action", message: `${target.label} · Empty.` });
          return null;
        }
        if (target.verb === "sort" && SOURCES[id].item !== "meal")
          return action(s, { type: "sort", sourceId: id,
            maintenance: s.world.resources.find(n => n.id === id)!.reserve === 0 }, w, events);
        const { refusal, pickup } = collectWithOutcome(s, id);
        if (pickup) {
          const capacity = s.inventory.containers.find(c => c.id === pickup.destination)!.capacity;
          actionResult(s, events, `+${pickup.quantity} ${ITEMS[pickup.item].label} · ${containerLabel(s, pickup.destination)} ${usedCapacity(s, pickup.destination)}/${capacity} CU`);
        } else if (!refusal && target.verb === "sort")
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
      if (target.id === OPTIONAL_RECORD.id) {
        if (!s.knowledge.journals.includes(target.id))
          s.knowledge.journals.push(target.id);
        s.feedback = OPTIONAL_RECORD.text;
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
      events.push({ type: "interaction-panel", panel: target.id === "rescue_staging" ? "inventory" : "craft", targetId: target.id });
      return null;
    }
  }
}
function updateAction(s: GameState): void {
  const a = s.world.action;
  if (!a) return;
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
  if (a.kind === "sort") {
    const n = Math.min(2, node.reserve);
    node.reserve -= n;
    node.stock += n;
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
/** Menu transactions use the same rules without advancing survival or world time. */
export function executeCommand(
  state: GameState,
  command: GameCommand,
  world: WorldQueries,
): { state: GameState; events: GameEvent[] } {
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  const no = action(draft, command, world, events);
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
    const performance = dartPerformance(s, v.id);
    const speed =
      v.disabled || v.charge <= 0 || station
        ? 0
        : v.hull === "hearthline"
          ? 3
          : v.hull === "creel"
            ? 4
            : v.hull === "spindle"
              ? 7
              : quiet
                ? performance?.quietSpeed ?? 3
                : sprint
                  ? performance?.boostSpeed ?? 11
                  : 8;
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
    const previousSpeed = Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z);
    for (const a of ["x", "y", "z"] as const)
      v.velocity[a] += (target[a] - v.velocity[a]) * Math.min(1, DT * 2.8);
    const delta = {
      x: v.velocity.x * DT,
      y: v.velocity.y * DT,
      z: v.velocity.z * DT,
    };
    if (speed > 0 && v.hull !== "spindle" && target.y > 0 && delta.y > 0)
      ascent = { type: "ascent-sample", actorId: v.id, requestedRise: delta.y,
        actualRise: 0, solidLimitedRise: 0, surfaceLimitedRise: 0 };
    const requested = Math.hypot(delta.x, delta.z);
    if (v.hull === "dart" && speed > 0 && forwardIntent && Number.isFinite(requested) && requested > 1e-5 &&
        delta.x * Math.sin(yaw) - delta.z * Math.cos(yaw) > 0)
      thrust = { type: "thrust-sample", actorId: v.id, requested, actual: 0, solidLimited: 0 };
    // Observe the existing sweeps before moveHull's separate terrain correction.
    // Its aggregate hitSolid also includes floor support and cannot classify a ceiling.
    const attempt = ascent;
    const forwardAttempt = thrust;
    const shape = HULL_COLLIDERS[v.hull], hullOrigin = { ...v.pose.position };
    const constrained = surfaceMove(world, hullOrigin, delta, shape, d => {
      let solidRise = 0, solidThrust = 0, forwardBoundary = false;
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
      return { ...moveHull(measuredWorld, hullOrigin, d, shape,
        v.hull === "hearthline" ? carrierTravelBounds() : undefined), solidRise, solidThrust, forwardBoundary };
    }, move => v.hull === "spindle" ? -0.4 : Math.min(-0.9, move.position.y), true);
    const move = constrained.move;
    if (ascent) {
      ascent.solidLimitedRise = constrained.rolledBack ? Math.max(0, delta.y) : move.solidRise;
      ascent.surfaceLimitedRise = constrained.surfaceLimitedRise;
    }
    if (thrust) thrust.solidLimited = constrained.rolledBack ? requested : move.solidThrust;
    if (move.hitSolid && previousSpeed > 4) {
      const before = v.health;
      v.health = Math.max(0, v.health - (previousSpeed - 4) * DT * 10);
      const hullLoss = before - v.health;
      if (hullLoss > 0) events.push({ type: "impact", speed: previousSpeed, hullLoss, origin: { ...move.position } });
    }
    if (move.hitSolid) {
      v.velocity.x *= 0.5;
      v.velocity.z *= 0.5;
    }
    v.pose.position = move.position;
    v.pose.yaw = yaw;
    v.pose.pitch = pitch;
    s.player.pose.position = { ...v.pose.position };
    s.player.velocity = { ...v.velocity };
    s.player.mode = "piloting";
    const d = distance(old, s.player.pose.position);
    s.metrics.pilotMetres += d;
    const drain =
      !v.disabled && v.charge > 0
        ? (d > 0.003
            ? (100 / 900) * (sprint ? 1.7 : quiet ? 0.65 : 1)
            : 0.015) * DT
        : 0;
    v.charge = Math.max(0, v.charge - drain);
    s.metrics.powerUsed += drain;
    loudness = quiet ? 0.08 : sprint ? 1 : d > 0.003 ? 0.48 : 0.08;
    if (move.hitBoundary) events.push({ type: "foundation-boundary" });
    if (move.hitBoundary || move.forwardBoundary) thrust = null;
    else if (thrust) thrust.actual = Math.hypot(move.position.x - old.x, move.position.z - old.z);
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
    if (mode === "swimming" && vertical * 2.8 + Math.sin(pitch) * forward * speed > 0 && vy > 0)
      ascent = { type: "ascent-sample", actorId: null, requestedRise: 0,
        actualRise: 0, solidLimitedRise: 0, surfaceLimitedRise: 0 };
    let position = { ...old },
      hitBoundary = false;
    const slices = Math.max(1, Math.ceil((magnitude * DT) / 0.12)),
      capsule = { radius: 0.34, height: mode === "walking" ? 1.75 : 0.95 };
    for (let i = 0; i < slices; i++) {
      const delta = {
        x: (vx * DT) / slices,
        y: (vy * DT) / slices,
        z: (vz * DT) / slices,
      };
      const requestedRise = Math.max(0, delta.y);
      if (ascent) ascent.requestedRise += requestedRise;
      const nextFloor = world.groundHeight(
          position.x + delta.x,
          position.z + delta.z,
        ),
        currentFloor = world.groundHeight(position.x, position.z);
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
        const move = world.moveCapsule(sliceOrigin, d, capsule);
        const solidRise = move.hitSolid && requestedRise > 0
          ? Math.max(0, sliceOrigin.y + Math.max(0, d.y) - move.position.y) : 0;
        const floor = world.supportHeight(move.position.x, move.position.z, move.position.y);
        const supported = move.position.y < floor;
        return { ...move, solidRise, floor, supported };
      }, move => {
        // Support is another vertical correction, just like the water cap.
        // Validate its whole path before accepting it near a cliff/adjacent solid.
        const y = Math.max(move.position.y, move.floor);
        return mode === "swimming" && old.y <= -0.5 && move.floor < -0.55 ? Math.min(-0.5, y) : y;
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
  updateBerth(s, world);
  const recoveryEvent = updateRecovery(s, world);
  if (recoveryEvent) events.push(recoveryEvent.type === "notice"
    ? { ...recoveryEvent, channel: recoveryEvent.error ? "hazard" : "action", context: "recovery" }
    : recoveryEvent);
  updateThreat(s, loudness, events, world);
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
