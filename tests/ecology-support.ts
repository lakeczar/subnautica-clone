import { createEcology, stepEcology } from "../src/sim/ecology/ecology.js";
import { homeOf } from "../src/sim/ecology/agents.js";
import { openWater } from "../src/sim/ecology/adapter.js";
import { protectionFor } from "../src/sim/ecology/hazards.js";
import type { EcologyEvent, EcologyState, EcologyWorld, Stimulus, EcologyCommand } from "../src/sim/ecology/types.js";
import type { ThreatAgentId } from "../src/content/ecology/species.js";
import type { HullId } from "../src/content/registry.js";
import type { Vec3 } from "../src/sim/types.js";

export function stimulus(position: Vec3, over: Partial<Stimulus> = {}): Stimulus {
  return { position, velocity: { x: 0, y: 0, z: 0 }, noise: 0.14, light: 0.6, disturbance: 0, hull: null, radius: 0.4, inRefuge: false, ...over };
}
export const offset = (p: Vec3, x = 0, y = 0, z = 0): Vec3 => ({ x: p.x + x, y: p.y + y, z: p.z + z });

export interface RunLog {
  events: { tick: number; event: EcologyEvent }[];
  diverLoss: number;
  hullLoss: number;
  ticks: number;
}
/** Steps ecology with a stimulus chosen per tick; returns all events and losses. */
export function run(state: EcologyState, ticks: number, at: (tick: number, state: EcologyState) => Stimulus, options: {
  start?: number; world?: EcologyWorld; hull?: HullId | null; commands?: (tick: number) => EcologyCommand[];
} = {}): RunLog {
  const world = options.world ?? openWater(), start = options.start ?? 0, log: RunLog = { events: [], diverLoss: 0, hullLoss: 0, ticks };
  for (let i = 0; i < ticks; i++) {
    const tick = start + i, s = at(tick, state);
    const r = stepEcology(state, {
      tick, stimulus: s, protection: protectionFor(s.hull, []), vehicleId: s.hull ? "test-hull" : null,
      commands: options.commands?.(tick) ?? [],
    }, world);
    for (const event of r.events) log.events.push({ tick, event });
    log.diverLoss += r.effects.diverHealth;
    log.hullLoss += r.effects.vehicleHealth;
  }
  return log;
}
export const cues = (log: RunLog, id: ThreatAgentId): { tick: number; cue: string; caption: string }[] =>
  log.events.flatMap(({ tick, event }) => event.type === "ecology-cue" && event.agentId === id ? [{ tick, cue: event.cue, caption: event.caption }] : []);
export const strikes = (log: RunLog, id?: ThreatAgentId): { tick: number; loss: number }[] =>
  log.events.flatMap(({ tick, event }) => event.type === "ecology-strike" && (!id || event.agentId === id) ? [{ tick, loss: event.loss }] : []);
export const agent = (s: EcologyState, id: ThreatAgentId) => s.agents.find(a => a.id === id)!;
export { createEcology, homeOf };
