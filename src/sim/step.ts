import { EVIDENCE, HULL_COLLIDERS, HULLS, ITEMS, OPTIONAL_RECORD, SOURCES } from "../content/registry.js";
import type { EvidenceId, SourceId } from "../content/registry.js";
import { createWorldQueries, moveHull } from "./world.js";
import { FIXED_SECONDS as DT } from "./clock.js";
import type {
  GameCommand,
  GameEvent,
  GameState,
  WorldQueries,
} from "./types.js";
import {
  addItem,
  distance,
  equipped,
  hasRoom,
  inCanopyAir,
  nearPod,
  nearWorkshop,
  transfer,
} from "./inventory.js";
import {
  collect,
  completeOpening,
  craft,
  discover,
  hint,
  nearestInteraction,
  toggleBuoy,
} from "./progression.js";
import { board, eat, exit, reserve, service } from "./vehicles.js";
import {
  carrierCommand,
  carrierHull,
  carrierInteriorSolids,
  CARRIER_LAYOUT,
  localToWorld,
  updateBerth,
} from "./carrier.js";
import { incapacitate, recoveryCommand, updateRecovery } from "./recovery.js";
import { updateSurvival, updateThreat } from "./survival.js";
const clamp = (v: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, Number.isFinite(v) ? v : 0));
const TAU = Math.PI * 2;
/** Mutates only the detached fixed-step draft; every refusal precedes gameplay mutations. */
function action(s: GameState, c: GameCommand, w: WorldQueries): string | null {
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
    case "craft":
      return craft(s, c.recipeId, w);
    case "transfer": {
      const item = s.inventory.items.find((i) => i.id === c.itemId);
      const no = transfer(s, c.itemId, c.to, c.quantity);
      if (no) return no;
      const container = s.inventory.containers.find((a) => a.id === c.to)!;
      const vehicle = s.fleet.vehicles.find((v) => v.cargoId === c.to);
      const destination = vehicle
        ? `${HULLS[vehicle.hull].label} hold`
        : container.kind === "cache"
          ? "cargo cache"
          : c.to === "diver"
            ? "diver hold"
            : c.to.replaceAll("_", " ");
      s.feedback = `Transferred ${c.quantity} × ${ITEMS[item!.kind].label} to ${destination}.`;
      return null;
    }
    case "eat":
      return eat(s);
    case "buoy":
      return toggleBuoy(s);
    case "exit":
      return exit(s, w);
    case "service":
      return service(s, c.vehicleId);
    case "reserve":
      return reserve(s, c.vehicleId);
    case "recover":
      return recoveryCommand(s, c.vehicleId, c.method);
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
    case "distraction": {
      if (!equipped(s, "essential_tools"))
        return "The service tool supplies the reusable acoustic distraction.";
      const t = s.world.threat;
      if (t.distractionSeconds > 0) return "Distraction is already active.";
      const p = s.player.pose;
      t.distraction = {
        x: p.position.x + Math.sin(p.yaw) * 16,
        y: p.position.y,
        z: p.position.z - Math.cos(p.yaw) * 16,
      };
      t.distractionSeconds = 12;
      s.feedback =
        "Service-tool resonator released a directional pulse. Move quietly away from it.";
      return null;
    }
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
      if (c.maintenance) {
        if (d.region !== "refuge_reef")
          return "Recovery allocation is sorted only at the shallow reef service habitats.";
        if (s.world.maintenance.alloy >= 2 && s.world.maintenance.membrane >= 1)
          return "A bound field patch is still available. General purchases cannot use this allocation.";
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
      const t = nearestInteraction(s);
      if (!t) return "Approach a source, animal habitat or record to scan.";
      if (t.kind === "evidence") s.feedback = discover(s, t.id as EvidenceId);
      else if (t.id in SOURCES) {
        const id = t.id as SourceId;
        if (!s.knowledge.scans.includes(id)) s.knowledge.scans.push(id);
        s.feedback = SOURCES[id].scan;
      } else
        s.feedback =
          "Scan retained. The notebook distinguishes observed facts from hypotheses.";
      s.world.threat.interest = Math.min(12, s.world.threat.interest + 2);
      return null;
    }
    case "interact": {
      if (s.player.controlledVehicleId) return exit(s, w);
      const target = c.target
        ? nearestTarget(s, c.target)
        : nearestInteraction(s);
      if (!target) return "Approach a readable handle, source patch or record.";
      if (target.id in SOURCES) return collect(s, target.id as SourceId);
      if (target.id in EVIDENCE) {
        s.feedback = discover(s, target.id as EvidenceId);
        return null;
      }
      if (target.id === OPTIONAL_RECORD.id) {
        if (!s.knowledge.journals.includes(target.id))
          s.knowledge.journals.push(target.id);
        s.feedback = OPTIONAL_RECORD.text;
        return null;
      }
      if (target.kind === "vehicle") return board(s, target.id);
      if (target.kind === "cache") {
        s.feedback =
          "Cargo cache reached. Open the hold to transfer its identified contents.";
        return null;
      }
      s.feedback =
        target.id === "rescue_staging"
          ? "Local recovery bench. Deploy Bobbin toward a disabled Dart, attach its collar, then guide it back along the shallow flank."
          : "Refuge services. Open the hold or fabrication panel to prepare.";
      return null;
    }
  }
}
function nearestTarget(s: GameState, id: string) {
  const t = nearestInteraction(s);
  return t?.id === id ? t : null;
}
function updateAction(s: GameState): void {
  const a = s.world.action;
  if (!a) return;
  if (
    distance(s.player.pose.position, SOURCES[a.sourceId].position) > 4 ||
    s.player.controlledVehicleId
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
  const no = action(draft, command, world);
  if (no)
    return { state, events: [{ type: "notice", message: no, error: true }] };
  return {
    state: draft,
    events: draft.feedback
      ? [
          { type: "notice", message: draft.feedback },
          {
            type: "sound",
            cue: command.type === "craft" ? "craft" : "collect",
          },
        ]
      : [],
  };
}
export function stepGame(
  state: GameState,
  commands: readonly GameCommand[],
  world: WorldQueries,
): { state: GameState; events: GameEvent[] } {
  const s = structuredClone(state),
    events: GameEvent[] = [];
  s.tick++;
  for (const c of commands) {
    const previous = s.feedback;
    const no = action(s, c, world);
    if (no) events.push({ type: "notice", message: no, error: true });
    else if (s.feedback && s.feedback !== previous)
      events.push(
        { type: "notice", message: s.feedback },
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
  s.player.pose.yaw = yaw;
  s.player.pose.pitch = pitch;
  const old = { ...s.player.pose.position };
  let loudness = 0;
  const v = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);
  if (v) {
    const dock = s.fleet.docking,
      station = v.hull === "hearthline" && dock?.stationKeeping;
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
                ? 3
                : sprint
                  ? 11
                  : 8;
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
    const move = moveHull(world, v.pose.position, delta, HULL_COLLIDERS[v.hull]);
    move.position.y = Math.min(
      v.hull === "spindle" ? -0.4 : -0.9,
      move.position.y,
    );
    if (v.hull === "spindle") move.position.y = -0.4;
    if (move.hitSolid && previousSpeed > 4)
      v.health = Math.max(0, v.health - (previousSpeed - 4) * DT * 10);
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
      local.position.x = clamp(moved.position.x, CARRIER_LAYOUT.interior.minX, CARRIER_LAYOUT.interior.maxX);
      local.position.z = clamp(moved.position.z, CARRIER_LAYOUT.interior.minZ, CARRIER_LAYOUT.interior.maxZ);
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
      const move = world.moveCapsule(position, delta, capsule);
      position = move.position;
      hitBoundary ||= move.hitBoundary;
      const floor = world.supportHeight(position.x, position.z, position.y);
      if (position.y < floor) {
        position.y = floor;
        vy = 0;
      }
      if (
        mode === "swimming" &&
        position.y > -0.5 &&
        old.y <= -0.5 &&
        floor < -0.55
      ) {
        position.y = -0.5;
        vy = 0;
      }
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
  if (recoveryEvent) events.push(recoveryEvent);
  updateThreat(s, loudness, events, world);
  updateSurvival(s, events);
  return { state: s, events };
}
