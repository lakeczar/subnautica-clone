/** C4B-07: CY's cycle observer composed into the game. Each world cycle is seen
 * at its hazard field: within CYCLE_VIEW_RANGE of the field's shape with a clear
 * line of sight from the eye (or inside it). `observeCycle` keeps one record per
 * cycle in `knowledge.cycles`; the journal states only timings watched from a
 * phase's start to its end. Records change only at phase edges and when the
 * player looks away, so saves stay small. */
import { WORLD_CYCLES } from "../content/currents/cycles.js";
import { HAZARD_FIELDS } from "../content/ecology/hazards.js";
import type { HazardShape } from "../content/ecology/hazards.js";
import { sitePosition } from "../content/ecology/sites.js";
import { observeCycle } from "./cycles/observe.js";
import type { CycleDef } from "./cycles/cycle.js";
import { eyeHeight } from "./state.js";
import type { GameEvent, GameState, Vec3, WorldQueries } from "./types.js";

/** Metres from a cycle's field within which its cue (ribbons, mites, the lifting
 * floor) can be watched. */
export const CYCLE_VIEW_RANGE = 40;
/** Each world cycle and the hazard field that shows it. */
const VIEWS: readonly { cycle: CycleDef; shape: HazardShape }[] = WORLD_CYCLES.flatMap((cycle) => {
  const f = Object.values(HAZARD_FIELDS).find((x) => "cycleId" in x && x.cycleId === cycle.id);
  return f ? [{ cycle, shape: f.shape }] : [];
});
/** The point of the shape nearest to `p` (p itself when inside). */
export function nearestOnShape(shape: HazardShape, p: Vec3): Vec3 {
  const c = sitePosition(shape.center), clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  if (shape.kind === "cylinder") {
    const dx = p.x - c.x, dz = p.z - c.z, r = Math.hypot(dx, dz), k = r > shape.radius ? shape.radius / r : 1;
    return { x: c.x + dx * k, y: clamp(p.y, c.y + shape.bottom, c.y + shape.top), z: c.z + dz * k };
  }
  const top = shape.kind === "box" ? c.y + shape.max.y : c.y + shape.y, bottom = shape.kind === "box" ? c.y + shape.min.y : -Infinity;
  return { x: clamp(p.x, c.x + shape.min.x, c.x + shape.max.x), y: clamp(p.y, bottom, top), z: clamp(p.z, c.z + shape.min.z, c.z + shape.max.z) };
}
export function cycleInView(s: GameState, world: WorldQueries, shape: HazardShape): boolean {
  const eye = { ...s.player.pose.position, y: s.player.pose.position.y + eyeHeight(s) };
  const q = nearestOnShape(shape, eye), d = Math.hypot(q.x - eye.x, q.y - eye.y, q.z - eye.z);
  return d < 1e-6 || (d <= CYCLE_VIEW_RANGE && world.lineOfSight(eye, q));
}
/** One active step for every world cycle. */
export function observeWorldCycles(s: GameState, world: WorldQueries, events: GameEvent[]): void {
  if (s.scenario !== "expedition" || s.opening.phase < 4) return;
  for (const { cycle, shape } of VIEWS) {
    const i = s.knowledge.cycles.findIndex((r) => r.cycleId === cycle.id), prev = i >= 0 ? s.knowledge.cycles[i]! : null;
    const { record, event } = observeCycle(cycle, prev, s.tick, cycleInView(s, world, shape));
    if (record !== prev && record) {
      if (i >= 0) s.knowledge.cycles[i] = record; else s.knowledge.cycles.push(record);
    }
    if (event?.type === "cycle-seen") events.push({ type: "notice", channel: "action", message: `${cycle.label} · watch it to learn its timing.` });
    else if (event?.type === "cycle-measured")
      events.push({ type: "notice", channel: "action", message: `${cycle.label} · ${event.complete ? "full timing logged in the journal" : "one phase timed in the journal"}.` });
  }
}
