/** SIG-1: SYS-1's module-scope host upgrades in play. A decoder lattice or a
 * survey array is fitted in place to one installed decoder or survey module,
 * at its host, paid from the host's work containers (the diver hold first).
 * The record is keyed by the module's item ID (`SystemsState.moduleUpgrades`),
 * so it travels with the module when it is removed or its outpost is packed.
 *
 * The panel's offer and the command read one plan (`hostUpgradeOffer`), so a
 * preview never re-derives the rule (performance convention 10). The command
 * returns a typed outcome (steward F17) and never sets `GameState.feedback`. */
import { HOST_UPGRADE_IDS, hostUpgrade } from "../content/upgrades/hosts.js";
import type { HostUpgradeId } from "../content/upgrades/hosts.js";
import { moduleOfItem } from "../content/systems/hosts.js";
import { applySpend, available, costText, labelOf, planSpend } from "./inventory.js";
import type { SpendPlan } from "./inventory.js";
import { hostById, hostLocal, workContainers } from "./systems/hosts.js";
import { lockerModuleCapacity, moduleUpgradePreview, surveyTier } from "./upgrades/hosts.js";
import { MODULES as SYS2_MODULES } from "../content/systems/hosts.js";
import { moduleLockerId } from "./systems/hosts.js";
import type { GameCommand, GameEvent, GameState } from "./types.js";

export interface HostUpgradeOffer {
  readonly upgrade: HostUpgradeId;
  readonly label: string;
  readonly benefit: string;
  readonly cost: string;
  readonly refusal: string | null;
  readonly plan: SpendPlan;
}
export type HostUpgradeOutcome =
  | { ok: true; hostId: string; itemId: string; upgrade: HostUpgradeId; message: string }
  | { ok: false; message: string };

type UpgradableModule = "decoder" | "survey" | "locker" | "planter";
const UPGRADABLE: readonly string[] = ["decoder", "survey", "locker", "planter"];
/** The installed module in one socket, if it takes a module upgrade (LS-1 adds lockers and planters). */
function moduleIn(s: GameState, hostId: string, socket: string): { itemId: string; kind: UpgradableModule } | null {
  const entry = s.systems.sockets.find((e) => e.hostId === hostId && e.socket === socket);
  const kind = entry ? moduleOfItem(entry.kind) : null;
  return entry && kind && UPGRADABLE.includes(kind) ? { itemId: entry.itemId, kind: kind as UpgradableModule } : null;
}
/** One upgrade for one socket's module: the exact payment and the refusal, if any. */
export function hostUpgradeOffer(s: GameState, hostId: string, socket: string, upgrade: HostUpgradeId): HostUpgradeOffer {
  const d = hostUpgrade(upgrade), host = hostById(s, s.systems, hostId), module = moduleIn(s, hostId, socket);
  const base = { upgrade, label: d.label, benefit: d.benefit, cost: costText(d.cost) };
  const empty: SpendPlan = { lines: [], missing: {} };
  if (!host || !module) return { ...base, refusal: "Install a decoder, survey, locker or planter module in this socket first.", plan: empty };
  if (!hostLocal(s, host)) return { ...base, refusal: `Work at ${host.label} to fit it.`, plan: empty };
  const bins = workContainers(s, s.systems, host);
  const plan = planSpend(s, d.cost, bins, "listed");
  const stock = Object.fromEntries(Object.keys(d.cost).map((k) => [k, available(s, k as never, bins)]));
  const preview = moduleUpgradePreview(s.systems.moduleUpgrades, module, upgrade, stock, s.knowledge.blueprints);
  return { ...base, refusal: preview.refusal, plan };
}
/** Every upgrade line that fits this socket's module, best tier last. */
export function hostUpgradeOffers(s: GameState, hostId: string, socket: string): HostUpgradeOffer[] {
  const module = moduleIn(s, hostId, socket);
  if (!module) return [];
  const current = s.systems.moduleUpgrades[module.itemId];
  return HOST_UPGRADE_IDS.filter((id) => hostUpgrade(id).scope === "module" && hostUpgrade(id).module === module.kind &&
    (!current || hostUpgrade(id).tier > hostUpgrade(current).tier) && (s.knowledge.blueprints as readonly string[]).includes(hostUpgrade(id).plan))
    .map((id) => hostUpgradeOffer(s, hostId, socket, id));
}
/** Fit the upgrade: spend the plan, record the module's new tier. Refusals change nothing. */
export function upgradeHostModule(s: GameState, hostId: string, socket: string, upgrade: HostUpgradeId): HostUpgradeOutcome {
  const offer = hostUpgradeOffer(s, hostId, socket, upgrade);
  if (offer.refusal) return { ok: false, message: offer.refusal };
  const module = moduleIn(s, hostId, socket)!;
  applySpend(s, offer.plan);
  s.systems.moduleUpgrades = { ...s.systems.moduleUpgrades, [module.itemId]: upgrade };
  // LS-1: a locker extension grows that module's own container, in place (one capacity authority).
  if (module.kind === "locker") {
    const box = s.inventory.containers.find((c) => c.id === moduleLockerId(module.itemId));
    if (box) box.capacity = lockerModuleCapacity(s.systems.moduleUpgrades, module.itemId, SYS2_MODULES.locker.lockerCu);
  }
  return { ok: true, hostId, itemId: module.itemId, upgrade,
    message: `${offer.label} fitted · ${offer.benefit} Spent ${offer.plan.lines.map((l) => `${l.quantity} × ${labelOf(l.kind)}`).join(", ")}.` };
}
/** The step's dispatch for `upgrade-host-module`; undefined for any other command. */
export function hostUpgradeCommand(s: GameState, c: GameCommand, events: GameEvent[]): string | null | undefined {
  if (c.type !== "upgrade-host-module") return undefined;
  const r = upgradeHostModule(s, c.hostId, c.socket, c.upgrade);
  if (!r.ok) return r.message;
  events.push({ type: "notice", channel: "action", message: r.message, summary: `${hostUpgrade(r.upgrade).label} fitted` },
    { type: "sound", cue: "craft" },
    { type: "signature", event: { kind: "host-upgrade", hostId: r.hostId, itemId: r.itemId, upgrade: r.upgrade } });
  return null;
}
/** The best survey tier among a host's installed survey modules. */
export function surveyModuleTier(s: Readonly<GameState>, hostId: string): number {
  let best = 0;
  for (const e of s.systems.sockets)
    if (e.hostId === hostId && moduleOfItem(e.kind) === "survey") best = Math.max(best, surveyTier(s.systems.moduleUpgrades, e.itemId));
  return best;
}
