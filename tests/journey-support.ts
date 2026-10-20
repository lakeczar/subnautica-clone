import assert from "node:assert/strict";
import { ROUTES } from "../src/content/regions/passages.js";
import { stepGame } from "../src/sim/step.js";
import type { GameCommand, GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { world } from "./b1-support.js";

/** A route by S2 ID, optionally reversed, optionally cut where `stop` first holds. */
export function leg(id: string, options: { reverse?: boolean; stop?: (p: Readonly<Vec3>) => boolean } = {}): Vec3[] {
  const route = ROUTES.find((r) => r.id === id);
  assert.ok(route, id);
  const path = route.path.map((p) => ({ ...p }));
  if (options.reverse) path.reverse();
  const cut = options.stop ? path.findIndex(options.stop) : -1;
  return cut >= 0 ? path.slice(0, cut + 1) : path;
}
export const pathLength = (path: readonly Vec3[]): number =>
  path.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y, p.z - path[i]!.z), 0);

const wrap = (a: number): number => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const actor = (s: GameState): Vec3 =>
  s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId)?.pose.position ?? s.player.pose.position;

export interface Drive {
  state: GameState;
  steps: number;
  /** Closest approach to each waypoint, metres. */
  worst: number;
  events: GameEvent[];
  /** Commands issued besides look and move (e.g. reserve), with the step. */
  extra: { step: number; command: GameCommand }[];
}
/** Ordinary controls only: one `look` and one `move` per fixed step, steering at
 * the next waypoint, exactly what a keyboard/mouse player can send. Waypoints
 * advance within `reach` metres (or once passed); a stall of `stallSeconds`
 * without 0.5 m of progress fails with the actor's position. */
export function drive(s: GameState, path: readonly Vec3[], options: {
  reach?: number; stallSeconds?: number; quiet?: boolean; maxSteps?: number;
  between?: (s: GameState, step: number) => GameCommand | null;
} = {}): Drive {
  const reach = options.reach ?? 5, stallSteps = (options.stallSeconds ?? 30) * 60;
  const events: GameEvent[] = [], extra: Drive["extra"] = [];
  let steps = 0, worst = 0;
  for (let i = 1; i < path.length; i++) {
    const target = path[i]!;
    let best = Infinity, since = 0;
    for (;;) {
      const p = actor(s), dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
      const flat = Math.hypot(dx, dz), d = Math.hypot(flat, dy);
      // Passed: the segment's direction now points behind the actor.
      const from = path[i - 1]!, sx = target.x - from.x, sz = target.z - from.z;
      const passed = i < path.length - 1 && (sx * dx + sz * dz) < 0 && flat < reach * 3 && Math.abs(dy) < reach * 2;
      if (d < reach || passed) { worst = Math.max(worst, d); break; }
      if (d < best - 0.5) { best = d; since = 0; } else if (++since > stallSteps)
        assert.fail(`stalled toward waypoint ${i}/${path.length - 1} ${JSON.stringify(target)} at ${JSON.stringify(p)} (${d.toFixed(1)} m)`);
      const piloting = s.player.mode === "piloting";
      const yaw = wrap(Math.atan2(dx, -dz) - s.player.pose.yaw);
      const pitch = piloting ? -s.player.pose.pitch : clamp(Math.atan2(dy, Math.max(flat, 1e-6)), -1.2, 1.2) - s.player.pose.pitch;
      const facing = Math.abs(yaw) < 0.5;
      const commands: GameCommand[] = [
        { type: "look", yawDelta: clamp(yaw, -0.8, 0.8), pitchDelta: clamp(pitch, -0.8, 0.8) },
        { type: "move", forward: facing ? 1 : flat < 8 ? 0 : 0.25, right: 0,
          vertical: piloting ? clamp(dy / 4, -1, 1) : 0, sprint: false, quiet: options.quiet ?? false },
      ];
      const more = options.between?.(s, steps);
      if (more) { commands.push(more); extra.push({ step: steps, command: more }); }
      if (process.env.JOURNEY_TRACE && steps % 3600 === 0)
        console.log(`t=${steps / 60}s wp ${i}/${path.length - 1} d=${d.toFixed(1)} at ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}`);
      assert.ok(steps < (options.maxSteps ?? 60 * 1800), `step cap at waypoint ${i} ${JSON.stringify(p)}`);
      const r = stepGame(s, commands, world);
      s = r.state;
      events.push(...r.events.filter((e) => e.type !== "ascent-sample" && e.type !== "thrust-sample"));
      steps++;
      assert.ok(s.player.vitals.health > 0, `actor alive at ${JSON.stringify(actor(s))}`);
    }
  }
  return { state: s, steps, worst, events, extra };
}
