/** The labelled travel helper: the only movement the harness does not spell out
 * key by key. It follows a route's waypoints with real `look` and `move` steps,
 * as a player holding the stick would, so collisions, depth, oxygen, power and
 * hull rules all apply. It never moves the player or a craft directly. A route
 * the actor cannot follow (stuck, refused, out of air) is reported as Blocked. */
import { HULLS } from "../../src/content/registry.js";
import { eyeHeight } from "../../src/sim/state.js";
import type { GameCommand, Vec3 } from "../../src/sim/types.js";
import { Blocked, Driver, IDLE, STEPS_PER_SECOND, where } from "./driver.js";

export interface Waypoint extends Vec3 {
  /** Steer horizontally only; terrain sets the height (walking ashore). */
  land?: boolean;
  /** Arrival radius for this point, metres. */
  tolerance?: number;
}
export interface Route {
  id: string;
  /** Who follows it: a diver on foot or swimming, or the piloted craft. */
  actor: "diver" | "craft";
  /** How the route was validated: an S2 swept-clearance route, an authored
   * sweep in the harness, or a surface/land path checked only by playing it. */
  validation: string;
  points: readonly Waypoint[];
  quiet?: boolean;
  sprint?: boolean;
}

const TAU = Math.PI * 2;
const wrap = (a: number): number => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const yawTo = (from: Vec3, to: Vec3): number => Math.atan2(to.x - from.x, -(to.z - from.z));
export const horizontal = (a: Vec3, b: Vec3): number => Math.hypot(b.x - a.x, b.z - a.z);
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

/** A look command turning toward the given yaw and pitch (the game clamps each step). */
export function lookToward(d: Driver, yaw: number, pitch: number): GameCommand {
  const pose = d.state.player.pose;
  return { type: "look", yawDelta: clamp(wrap(yaw - pose.yaw), -0.8, 0.8), pitchDelta: clamp(pitch - pose.pitch, -0.8, 0.8) };
}

/** Turn the view onto a world point from the current eye, with real look steps. */
export function faceEye(d: Driver, point: Vec3, maxSteps = 30): void {
  for (let i = 0; i < maxSteps; i++) {
    const p = d.state.player.pose.position;
    const eye = { ...p, y: p.y + eyeHeight(d.state) };
    const yaw = yawTo(eye, point), pitch = Math.atan2(point.y - eye.y, horizontal(eye, point));
    const pose = d.state.player.pose;
    if (Math.abs(wrap(yaw - pose.yaw)) < 1e-4 && Math.abs(pitch - pose.pitch) < 1e-4) return;
    d.tick([lookToward(d, yaw, clamp(pitch, -1.35, 1.35)), IDLE]);
  }
}

interface Steer { controls: GameCommand[]; distance: number }

function steerDiver(d: Driver, target: Waypoint, route: Route, final: boolean, jump: boolean): Steer {
  const s = d.state, p = s.player.pose.position;
  const h = horizontal(p, target);
  const swimming = s.player.mode === "swimming";
  // A diver cannot rise above the swimming surface; surface points mean "at the top".
  const ty = target.land ? p.y : Math.min(target.y, -0.5);
  const dy = ty - p.y;
  const yaw = h > 0.05 ? yawTo(p, target) : s.player.pose.yaw;
  const pitch = swimming ? clamp(Math.atan2(dy, Math.max(h, 1e-3)), -1.3, 1.3) : 0;
  const distance = target.land ? h : Math.hypot(h, dy);
  const close = final ? (target.tolerance ?? 0.5) : (target.tolerance ?? 1.2);
  const forward = distance <= close ? 0 : 1;
  const vertical = swimming && !target.land && Math.abs(dy) > 0.6 && h < 2 ? Math.sign(dy) : jump ? 1 : 0;
  return {
    distance,
    controls: [lookToward(d, yaw, pitch), {
      type: "move", forward, right: 0, vertical, sprint: route.sprint ?? false, ...(route.quiet ? { quiet: true } : {}),
    }],
  };
}

function steerCraft(d: Driver, target: Waypoint, route: Route, final: boolean): Steer {
  const v = d.occupied();
  if (!v || d.state.player.controlledVehicleId !== v.id) throw new Blocked(`Route ${route.id} needs a piloted craft`, where(d.state));
  const p = v.pose.position;
  const h = horizontal(p, target), dy = target.y - p.y, distance = Math.hypot(h, dy);
  const yaw = h > 0.5 ? yawTo(p, target) : v.pose.yaw;
  const pitch = clamp(Math.atan2(dy, Math.max(h, 1e-3)), -1.2, 1.2);
  const heading = Math.abs(wrap(yaw - v.pose.yaw));
  const speed = Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z);
  // Turn before thrusting on a big heading change; ease off into the last point.
  let forward = heading > 1 ? 0 : Math.cos(heading) ** 2;
  if (final) forward *= clamp((distance - 0.5) / Math.max(4, speed * 1.6), 0, 1);
  const close = final ? (target.tolerance ?? 1.5) : (target.tolerance ?? 3);
  if (distance <= close) forward = 0;
  return {
    distance,
    controls: [lookToward(d, yaw, pitch), {
      type: "move", forward, right: 0, vertical: 0, sprint: route.sprint ?? false, ...(route.quiet ? { quiet: true } : {}),
    }],
  };
}

/** Follow `route` from the current position. Records one travel leg. */
export function travel(d: Driver, route: Route, label = route.id): void {
  d.legOf(`travel ${label}`, "travel", () => {
    const pilot = route.actor === "craft";
    if (pilot !== (d.state.player.mode === "piloting"))
      throw new Blocked(`Route ${route.id} is for a ${route.actor}, but the player is ${d.state.player.mode}`, where(d.state));
    const hull = pilot ? d.occupied()!.hull : null;
    const speed = hull ? (hull === "creel" ? 5 : hull === "hearthline" ? 3 : 8) : 3.4;
    route.points.forEach((target, index) => {
      const final = index === route.points.length - 1;
      const from = pilot ? d.occupied()!.pose.position : d.state.player.pose.position;
      const budget = Math.round((dist(from, target) / speed * 3 + 20) * STEPS_PER_SECOND);
      let best = Infinity, sinceBest = 0;
      for (let step = 0; ; step++) {
        const jump = !pilot && d.state.player.mode === "walking" && sinceBest > STEPS_PER_SECOND;
        const steer = pilot ? steerCraft(d, target, route, final) : steerDiver(d, target, route, final, jump);
        const close = final ? (target.tolerance ?? (pilot ? 1.5 : 0.5)) : (target.tolerance ?? (pilot ? 3 : 1.2));
        if (steer.distance <= close) break;
        if (steer.distance < best - 0.25) { best = steer.distance; sinceBest = 0; } else sinceBest++;
        if (sinceBest > 6 * STEPS_PER_SECOND || step > budget)
          throw new Blocked(`Route ${route.id} (${route.validation}) stalled ${steer.distance.toFixed(1)} m short of waypoint ${index} ` +
            `(${target.x}, ${target.y}, ${target.z})${hull ? ` in the ${HULLS[hull].label}` : ""}`, where(d.state));
        d.tick(steer.controls);
      }
    });
    // Settle: let a craft coast to a stop so the next command sees a parked hull.
    if (pilot) for (let i = 0; i < 4 * STEPS_PER_SECOND; i++) {
      const v = d.occupied()!;
      if (Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) < 0.15) break;
      d.tick([IDLE]);
    }
  });
}

/** Shorthand for a route built in place by the harness. */
export const route = (id: string, actor: Route["actor"], validation: string, points: readonly Waypoint[],
  extra: Partial<Pick<Route, "quiet" | "sprint">> = {}): Route => ({ id, actor, validation, points, ...extra });
