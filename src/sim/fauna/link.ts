/** CR-1: creatures composed into the fixed step. One command hook (cooking,
 * bait, planter feed, the trap) and one per-step hook (trap catch and watching
 * the threats' natural windows). Each refusal changes nothing. */
import { SKATE_LAYING_SITE, THREAT_WINDOWS, WINDOW_IDS } from "../../content/fauna/windows.js";
import type { WindowId } from "../../content/fauna/windows.js";
import { speciesOf } from "../ecology/agents.js";
import { observeCycle } from "../cycles/observe.js";
import { eyeHeight } from "../state.js";
import { hostById } from "../systems/hosts.js";
import type { GameCommand, GameEvent, GameState, Vec3, WorldQueries } from "../types.js";
import { cookCatch, feedPlanter, releaseBait } from "./catch.js";
import { advanceTraps, emptyTrap, TRAP_ITEM, wetHost } from "./trap.js";
import { layingSkates } from "./windows.js";
import { TRAP } from "../../content/fauna/items.js";

/** `undefined`: not a creature command. */
export function faunaCommand(s: GameState, c: GameCommand): string | null | undefined {
  switch (c.type) {
    case "cook-catch": return cookCatch(s, c.portions);
    case "release-bait": return releaseBait(s);
    case "feed-planter": return feedPlanter(s, s.systems, c.hostId, c.socket);
    case "empty-trap": return emptyTrap(s, s.systems, c.hostId, c.socket, c.to);
    case "install-host-module": {
      // A trap needs water: refuse it at a dry host before SYS-2 installs it.
      const item = s.inventory.items.find((i) => i.id === c.itemId), host = hostById(s, s.systems, c.hostId);
      if (item?.kind === TRAP_ITEM && host && !wetHost(host)) return `${host.label} stands on dry land: a fish trap needs water. Nothing installed.`;
      return undefined;
    }
    default: return undefined;
  }
}

/** Where each window's animal is now, for watching it. The laying visit is
 * watched at the lee shelf: the laying skates, or their egg cases between visits. */
function animals(s: GameState, id: WindowId): Vec3[] {
  const species = THREAT_WINDOWS[id].species;
  if (species === "canopy_sound_hunter") return [s.world.threat.position];
  if (id === "layer_skate_laying") { const k = layingSkates(s.tick); return k.length ? k.map((x) => x.position) : [{ ...SKATE_LAYING_SITE }]; }
  return s.world.ecology.agents.filter((a) => speciesOf(a.id) === species).map((a) => a.position);
}
/** One active step: trap catch, then watch each threat's natural window. The
 * first sight names it with a short caption; the journal's cycles tab times it. */
export function stepFauna(s: GameState, world: WorldQueries, events: GameEvent[]): void {
  if (s.scenario !== "expedition" || s.opening.phase < 4) return;
  const before = new Map(s.systems.traps.map((t) => [t.moduleId, t.held]));
  if (advanceTraps(s, s.systems, 1 / 60) > 0)
    for (const t of s.systems.traps) if (t.held >= TRAP.cap && (before.get(t.moduleId) ?? 0) < t.held && s.systems.sockets.some((e) => e.itemId === t.moduleId))
      events.push({ type: "notice", channel: "action", message: "A fish trap is full. Empty it at its host's Base panel." });
  const eye = { ...s.player.pose.position, y: s.player.pose.position.y + eyeHeight(s) };
  for (const id of WINDOW_IDS) {
    const w = THREAT_WINDOWS[id];
    const near = animals(s, id).filter((p) => Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) <= w.sight);
    const i = s.knowledge.cycles.findIndex((r) => r.cycleId === w.cycle.id), prev = i >= 0 ? s.knowledge.cycles[i]! : null;
    // Out of range, a record that is not being watched never needs a sight line.
    if (!near.length && (!prev || prev.watching === null)) continue;
    const inView = near.some((p) => world.lineOfSight(eye, { ...p, y: p.y + 0.7 }));
    const { record, event } = observeCycle(w.cycle, prev, s.tick, inView);
    if (record !== prev && record) {
      if (i >= 0) s.knowledge.cycles[i] = record; else s.knowledge.cycles.push(record);
    }
    if (event?.type === "cycle-seen")
      events.push({ type: "notice", channel: "hazard", context: "ecology", message: w.busy.includes(record!.watching!.phase) ? w.seenBusy : w.seenIdle });
    else if (event?.type === "cycle-measured")
      events.push({ type: "notice", channel: "action", message: `${w.cycle.label} · ${event.complete ? "full timing logged in the journal" : "one phase timed in the journal"}.` });
  }
}
