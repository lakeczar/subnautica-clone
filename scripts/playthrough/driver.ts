/** The playthrough driver: it plays the real simulation through the same two
 * entry points the app uses. Held controls (move, look) go through `stepGame`,
 * one fixed step at a time; key presses and panel buttons go through
 * `executeCommand`. Nothing here writes game state directly. */
import { ITEMS, RECIPES, SOURCES, techRecord } from "../../src/content/registry.js";
import type { ItemKind, RecipeId } from "../../src/content/registry.js";
import { executeCommand, stepGame } from "../../src/sim/step.js";
import { createGame } from "../../src/sim/state.js";
import { createWorldQueries } from "../../src/sim/world.js";
import { cabinHull } from "../../src/sim/fleet.js";
import type { GameCommand, GameEvent, GameState, VehicleState, WorldQueries } from "../../src/sim/types.js";
import { freshMinima, lowerMinima } from "./timeline.js";
import type { DiscoveryRecord, LegRecord, Minima, RunRecord } from "./timeline.js";

/** The game refused a command or trapped the player. A finding, never something to work around. */
export class Blocked extends Error {
  constructor(message: string, readonly where: string = "") {
    super(where ? `${message} @ ${where}` : message);
  }
}

export const STEPS_PER_SECOND = 60;
export const IDLE: GameCommand = { type: "move", forward: 0, right: 0, vertical: 0, sprint: false };

const fmt = (n: number): string => n.toFixed(1);
export const where = (s: GameState): string => {
  const p = s.player.pose.position, v = s.fleet.vehicles.find((x) => x.id === s.player.controlledVehicleId);
  return `(${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}) ${s.player.mode} tick ${s.tick}` +
    (v ? ` · ${v.hull} power ${fmt(v.charge)} hull ${fmt(v.health)} rating ${v.rating}` : ` · O2 ${fmt(s.player.vitals.oxygen)}`);
};

/** Every story record the game keeps, in one ordered list of IDs. */
export function knownRecords(s: GameState): string[] {
  return [
    ...s.knowledge.evidence.map((e) => e.id),
    ...s.knowledge.journals,
    ...s.story.discoveries.map((d) => d.id),
    ...s.knowledge.scans.filter((id) => techRecord(id)),
  ];
}

export class Driver {
  state: GameState;
  readonly world: WorldQueries = createWorldQueries();
  readonly run: RunRecord;
  phase = "";
  private leg: LegRecord | null = null;
  private phaseMinima: Minima = freshMinima();
  /** Every event of the most recent tick or command. */
  lastEvents: GameEvent[] = [];
  private known = new Set<string>();

  constructor(scenario: string, strategy: string, state: GameState = createGame()) {
    this.state = state;
    this.run = {
      scenario, strategy, outcome: "complete", ticks: 0, minutes: 0, wallMs: 0, phases: [], legs: [], saves: [],
      discoveries: [], gathered: {}, spent: {}, refusals: [], failures: 0, checks: [], notes: [],
    };
    for (const id of knownRecords(state)) this.known.add(id);
  }

  get player(): GameState["player"] { return this.state.player; }
  /** The craft whose air, power and hull the player depends on now. */
  occupied(): VehicleState | null {
    return this.state.fleet.vehicles.find((v) => v.id === this.state.player.controlledVehicleId) ?? cabinHull(this.state) ?? null;
  }
  vehicle(hull: VehicleState["hull"]): VehicleState | null {
    return this.state.fleet.vehicles.find((v) => v.hull === hull) ?? null;
  }

  /** One fixed step with the given held controls, exactly as the app's frame loop. */
  tick(controls: readonly GameCommand[] = [IDLE]): GameEvent[] {
    const before = this.state;
    const failures = before.metrics.failures;
    const result = stepGame(before, controls, this.world);
    this.accept(before, result.state, result.events);
    if (result.state.metrics.failures > failures && !this.expectFailure)
      throw new Blocked(`Incapacitated: ${result.state.feedback}`, where(before));
    return result.events;
  }
  /** Set while an adverse scenario deliberately loses a craft or the diver. */
  expectFailure = false;
  /** Story reads skipped because the build has not placed their hosts (pending C3). */
  deferred: string[] = [];

  idle(seconds: number): void {
    for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) this.tick([IDLE]);
  }
  /** Idle until `done` holds, up to `seconds`. */
  waitFor(label: string, seconds: number, done: (s: GameState) => boolean): void {
    for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND) && !done(this.state); i++) this.tick([IDLE]);
    if (!done(this.state)) throw new Blocked(`Timed out waiting for ${label}: ${this.state.feedback}`, where(this.state));
  }

  /** A key press or panel button. Throws Blocked on a refusal unless `refusal` is allowed. */
  command(command: GameCommand, options: { allowRefusal?: boolean } = {}): { ok: boolean; message: string; events: GameEvent[] } {
    const before = this.state;
    const result = executeCommand(before, command, this.world);
    const error = result.events.find((e): e is Extract<GameEvent, { type: "notice" }> => e.type === "notice" && e.error === true);
    if (error) {
      this.run.refusals.push({ tick: before.tick, phase: this.phase, message: `${command.type}: ${error.message}` });
      this.lastEvents = result.events;
      if (!options.allowRefusal) throw new Blocked(`${JSON.stringify(command)} refused: ${error.message}`, where(before));
      return { ok: false, message: error.message, events: result.events };
    }
    this.accept(before, result.state, result.events);
    if (command.type === "craft") this.paid(command.recipeId);
    const notice = result.events.find((e): e is Extract<GameEvent, { type: "notice" }> => e.type === "notice");
    return { ok: true, message: notice?.message ?? result.state.feedback, events: result.events };
  }

  private paid(id: RecipeId): void {
    const r = RECIPES[id];
    if (r.maintenance) return;
    for (const [kind, n] of Object.entries(r.cost)) this.bump(this.run.spent, kind, n);
    this.onSpend?.(r.cost);
  }
  onSpend: ((cost: Readonly<Partial<Record<string, number>>>) => void) | null = null;
  onGather: ((kind: string, n: number) => void) | null = null;
  onDiscover: ((id: string) => void) | null = null;

  private bump(into: Record<string, number>, kind: string, n: number): void { into[kind] = (into[kind] ?? 0) + n; }

  private accept(before: GameState, after: GameState, events: GameEvent[]): void {
    this.state = after;
    this.lastEvents = events;
    // Gathered: exposed stock leaves a source only by collection, tool arms or a frame lift.
    for (let i = 0; i < after.world.resources.length; i++) {
      const a = before.world.resources[i]!, b = after.world.resources[i]!;
      if (b.stock < a.stock) {
        const kind = SOURCES[b.id].item;
        this.bump(this.run.gathered, kind, a.stock - b.stock);
        this.onGather?.(kind, a.stock - b.stock);
      }
    }
    for (const id of knownRecords(after)) if (!this.known.has(id)) {
      this.known.add(id);
      const record: DiscoveryRecord = { id, tick: after.tick, phase: this.phase };
      this.run.discoveries.push(record);
      this.onDiscover?.(id);
    }
    this.run.failures = after.metrics.failures;
    this.run.ticks = after.tick;
    const m = this.sample();
    lowerMinima(this.phaseMinima, m);
    if (this.leg) lowerMinima(this.leg.minima, m);
  }

  sample(): Minima {
    const v = this.occupied(), p = this.state.player.vitals;
    return { oxygen: p.oxygen, food: p.food, health: p.health, power: v ? v.charge : null, hull: v ? v.health : null };
  }

  beginPhase(id: string): void { this.phase = id; this.phaseMinima = this.sample(); }
  phaseMinimaSoFar(): Minima { return { ...this.phaseMinima }; }

  /** Run `body` as one recorded leg of the current phase. */
  legOf<T>(label: string, kind: LegRecord["kind"], body: () => T): T {
    const start = this.state.player.pose.position;
    const leg: LegRecord = { phase: this.phase, leg: label, kind, startTick: this.state.tick, ticks: 0, minima: this.sample() };
    const outer = this.leg;
    this.leg = leg;
    try {
      return body();
    } finally {
      leg.ticks = this.state.tick - leg.startTick;
      const end = this.state.player.pose.position;
      if (kind === "travel") leg.metres = Math.round(Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z));
      this.run.legs.push(leg);
      this.leg = outer;
      if (outer) lowerMinima(outer.minima, leg.minima);
    }
  }

  /** Item quantity of one kind in the given containers (all containers by default). */
  count(kind: ItemKind, containers?: readonly string[]): number {
    return this.state.inventory.items.filter((i) => i.kind === kind && (!containers || containers.includes(i.containerId)))
      .reduce((n, i) => n + i.quantity, 0);
  }
  usedCu(container: string): number {
    return this.state.inventory.items.filter((i) => i.containerId === container && !i.fitted)
      .reduce((n, i) => n + ITEMS[i.kind].cu * i.quantity, 0);
  }
  freeCu(container: string): number {
    const c = this.state.inventory.containers.find((c) => c.id === container);
    return c ? c.capacity - this.usedCu(container) : 0;
  }
  facility(id: string): boolean { return this.state.world.facilities.some((f) => f.id === id && f.repaired); }
  crafted(id: string): boolean { return (this.state.knowledge.crafted as readonly string[]).includes(id); }
  knows(id: string): boolean { return this.known.has(id); }
}
