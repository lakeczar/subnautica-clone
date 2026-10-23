/** CR-1 test helpers shared by the fast and heavy creature suites. */
import assert from "node:assert/strict";
import { THREAT_ROSTER } from "../src/content/ecology/species.js";
import type { ThreatSpeciesId } from "../src/content/ecology/species.js";
import type { WindowSpecies } from "../src/content/fauna/windows.js";
import { createEnvelope, decodeSave } from "../src/save/codec.js";
import type { EcologyState, Stimulus } from "../src/sim/ecology/types.js";
import { windowBusy } from "../src/sim/fauna/windows.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState, Vec3 } from "../src/sim/types.js";
import { stimulus } from "./ecology-support.js";
import { encoded } from "./persistence-support.js";

export const meta = { sessionId: "cr-1-creatures-01", createdAt: "2026-10-22T00:00:00.000Z", savedAt: "2026-10-22T00:10:00.000Z" };
export const opened = (): GameState => { const s = createGame(); completeOpening(s); return s; };
export const count = (s: GameState, kind: string, container?: string): number =>
  s.inventory.items.filter((i) => i.kind === kind && (!container || i.containerId === container)).reduce((n, i) => n + i.quantity, 0);
export const stock = (s: GameState, id: string): number => s.world.resources.find((r) => r.id === id)!.stock;
export const roundTrip = (s: GameState): GameState => {
  const out = decodeSave(encoded(createEnvelope(s, meta)));
  assert.ok(out.ok, out.ok ? "" : out.error);
  return out.value.state;
};
/** First tick at or after `from` at which the window opens, and the tick it shuts. */
export function windowAt(species: WindowSpecies, from = 60): { start: number; end: number } {
  let start = from;
  while (!(windowBusy(species, start) && !windowBusy(species, start - 1))) start++;
  let end = start;
  while (windowBusy(species, end)) end++;
  return { start, end };
}
export const towards = (from: Vec3, to: Vec3): Vec3 => {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }, n = Math.hypot(d.x, d.y, d.z) || 1;
  return { x: d.x / n, y: d.y / n, z: d.z / n };
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
/** A path of points walked at `speed` m/s, with an optional dwell (seconds) at each. */
export function walker(points: readonly { p: Vec3; dwell?: number }[], speed: number): (seconds: number) => Vec3 {
  return (t) => {
    let left = t;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]!, b = points[i + 1]!, leg = Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y, b.p.z - a.p.z) / speed;
      if (left <= (a.dwell ?? 0)) return { ...a.p };
      left -= a.dwell ?? 0;
      if (left <= leg) return lerp(a.p, b.p, left / leg);
      left -= leg;
    }
    return { ...points.at(-1)!.p };
  };
}
/** A loud, lit diver looking at the nearest animal of the species: the worst case. */
export function loud(p: Vec3, state: EcologyState, species: ThreatSpeciesId): Stimulus {
  const near = state.agents.filter((a) => THREAT_ROSTER[a.id].species === species)
    .sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0]!;
  return stimulus(p, { noise: 0.6, light: 0.9, facing: towards(p, near.position), velocity: { x: 0.8, y: 0, z: 0 } });
}

