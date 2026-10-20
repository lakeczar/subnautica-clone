/** Effect verification. A command the game accepted is not proof that it did what
 * it says; after every accepted command the driver checks the effect on the real
 * state (before → after). A missing or wrong effect is a Blocked finding. */
import * as registry from "../../src/content/registry.js";
import { HULLS, ITEMS, MATERIALS, RECIPES } from "../../src/content/registry.js";
import type { RecipeId } from "../../src/content/registry.js";
import { personalLimit } from "../../src/sim/capabilities.js";
import type { GameCommand, GameState } from "../../src/sim/types.js";

const total = (s: GameState, kind: string): number =>
  s.inventory.items.filter((i) => i.kind === kind).reduce((n, i) => n + i.quantity, 0);
const inside = (s: GameState, kind: string, container: string): number =>
  s.inventory.items.filter((i) => i.kind === kind && i.containerId === container).reduce((n, i) => n + i.quantity, 0);
const vehicle = (s: GameState, id: string | undefined) => s.fleet.vehicles.find((v) => v.id === id);

/** Hull refits by recipe: C3's REFIT_TIERS when present, else root's HULL_REFITS. */
export function refitOf(id: string): { hull: string; rating: number } | null {
  const tiers = (registry as Record<string, unknown>).REFIT_TIERS as Record<string, { hull: string; rating: number }> | undefined;
  if (tiers?.[id]) return tiers[id]!;
  const first = Object.entries(registry.HULL_REFITS).find(([, r]) => r.recipe === id);
  return first ? { hull: first[0], rating: first[1].rating } : null;
}
/** Personal suit rating a recipe sets: C3's SUIT_REFITS when present, else root's two suits. */
export function suitOf(id: string): number | null {
  const refits = (registry as Record<string, unknown>).SUIT_REFITS as Record<string, { rating: number }> | undefined;
  if (refits?.[id]) return refits[id]!.rating;
  return id === "suit_150" ? 150 : id === "suit_350" ? 350 : null;
}

/** Everything a craft must have done. Returns problems; empty means verified. */
export function craftEffect(before: GameState, after: GameState, id: RecipeId): string[] {
  const r = RECIPES[id] as (typeof RECIPES)[RecipeId] & { output: string };
  const out: string[] = [];
  if (!(after.knowledge.crafted as string[]).includes(id)) out.push(`${id} is not recorded as crafted`);
  // Materials: exactly the cost leaves the inventory (or the rescue stock pays).
  if (r.maintenance) {
    const m0 = before.world.maintenance, m1 = after.world.maintenance;
    if (m0.alloy - m1.alloy !== 2 || m0.glass - m1.glass !== 1 || m0.membrane - m1.membrane !== 3)
      out.push(`${id} did not draw 2/1/3 rescue stock (alloy ${m0.alloy}→${m1.alloy}, glass ${m0.glass}→${m1.glass}, membrane ${m0.membrane}→${m1.membrane})`);
  } else for (const [kind, n] of Object.entries(r.cost)) {
    if (kind === r.output) continue;
    const used = total(before, kind) - total(after, kind);
    if (used !== n) out.push(`${id} consumed ${used} ${kind}, not ${n}`);
  }
  // Output.
  const refit = refitOf(id), suit = suitOf(id);
  if (refit) {
    const raised = after.fleet.vehicles.filter((v) => v.hull === refit.hull && v.rating === refit.rating &&
      (vehicle(before, v.id)?.rating ?? 0) < refit.rating);
    if (raised.length !== 1) out.push(`${id} left no ${refit.hull} newly rated ${refit.rating} m (ratings: ${after.fleet.vehicles
      .filter((v) => v.hull === refit.hull).map((v) => v.rating).join(", ") || "none"})`);
  } else if (suit) {
    if (personalLimit(after) !== suit) out.push(`${id} left the personal suit at ${personalLimit(after)} m, not ${suit} m`);
  } else if (Object.hasOwn(HULLS, r.output)) {
    const n0 = before.fleet.vehicles.filter((v) => v.hull === r.output).length, n1 = after.fleet.vehicles.filter((v) => v.hull === r.output).length;
    if (n1 !== n0 + 1) out.push(`${id} built ${n1 - n0} ${r.output} hulls, not 1`);
  } else if (Object.hasOwn(ITEMS, r.output)) {
    const made = total(after, r.output) - total(before, r.output) + (Object.hasOwn(r.cost, r.output) ? (r.cost as Record<string, number>)[r.output]! : 0);
    if (made !== r.quantity) out.push(`${id} produced ${made} ${r.output}, not ${r.quantity}`);
  } else if (r.output === "pod_buffer") {
    if (!after.story.works.repairs.includes("pod_buffer")) out.push("pod_buffer repair not recorded");
  } else if (r.output === "pod_repair" || r.output.startsWith("restore_")) {
    const restored = after.world.facilities.filter((f) => f.repaired && !before.world.facilities.find((g) => g.id === f.id)?.repaired);
    if (restored.length !== 1) out.push(`${id} restored ${restored.length} facilities, not 1`);
  } else if (Object.values(RECIPES).some((x) => (x.needs as readonly string[]).includes(id))) {
    // A construction stage (e.g. a keel): its effect is the recorded stage that the
    // next recipe needs, so it must be newly recorded, not merely present.
    if ((before.knowledge.crafted as string[]).includes(id)) out.push(`${id} was already recorded; this craft added no stage`);
  } else {
    // An output this harness has no specific rule for: something beyond inventory
    // and the crafted list must have changed.
    const rest = (s: GameState) => JSON.stringify({ ...s, inventory: null, knowledge: { ...s.knowledge, crafted: null }, feedback: null, sequence: null });
    if (rest(before) === rest(after)) out.push(`${id} (output ${r.output}) changed nothing beyond spending materials`);
  }
  return out;
}

/** Effects of the other commands the harness issues. Returns problems. */
export function commandEffect(c: GameCommand, before: GameState, after: GameState): string[] {
  const p = after.player;
  switch (c.type) {
    case "craft": return craftEffect(before, after, c.recipeId);
    case "transfer": {
      const item = before.inventory.items.find((i) => i.id === c.itemId);
      if (!item) return [`transfer of unknown item ${c.itemId}`];
      const moved = inside(after, item.kind, c.to) - inside(before, item.kind, c.to);
      return moved === c.quantity ? [] : [`transfer moved ${moved} ${item.kind} into ${c.to}, not ${c.quantity}`];
    }
    case "store-materials": {
      const left = after.inventory.items.filter((i) => i.containerId === c.from && Object.hasOwn(MATERIALS, i.kind) && i.provenance === "public" && !i.fitted);
      const cu = (s: GameState, id: string) => s.inventory.items.filter((i) => i.containerId === id && !i.fitted).reduce((n, i) => n + ITEMS[i.kind].cu * i.quantity, 0);
      return left.length ? [`store-materials left ${left.length} material stacks in ${c.from}`]
        : cu(after, c.to) > cu(before, c.to) ? [] : [`store-materials added nothing to ${c.to}`];
    }
    case "service": {
      const v = vehicle(after, c.vehicleId);
      return v && v.charge === 100 && v.health === 100 && !v.disabled ? [] : [`service left ${c.vehicleId} at power ${v?.charge}, hull ${v?.health}`];
    }
    case "reserve": {
      const v0 = vehicle(before, c.vehicleId), v1 = vehicle(after, c.vehicleId);
      return v0 && v1 && v1.charge > v0.charge ? [] : [`reserve cell added no power to ${c.vehicleId}`];
    }
    case "install-module": {
      const v = vehicle(after, c.vehicleId);
      return v?.modules.includes(c.itemId) ? [] : [`${c.itemId} is not installed on ${c.vehicleId}`];
    }
    case "recover": {
      const v = vehicle(after, c.vehicleId);
      if (c.method === "repair") return v && !v.disabled && v.health > 0 ? [] : [`repair left ${c.vehicleId} disabled`];
      if (c.method === "salvage") return v ? [`salvage left ${c.vehicleId} in the fleet`] : [];
      return after.recovery.operation?.vehicleId === c.vehicleId ? [] : [`tow of ${c.vehicleId} started no recovery operation`];
    }
    case "arm-lift": return after.world.action?.kind === "arm" ? [] : ["tool arms did not start"];
    case "eat": return p.vitals.food > before.player.vitals.food ? [] : ["eating raised no food"];
    case "exit": return p.controlledVehicleId === null && p.interiorId === null ? [] : ["the diver is still aboard after exit"];
    case "carrier": {
      const dock = after.fleet.docking;
      switch (c.action) {
        case "station-keep": return dock?.stationKeeping ? [] : ["station keeping is not engaged"];
        case "helm": return p.mode === "piloting" && p.controlledVehicleId === dock?.vehicleId ? [] : ["not at the carrier helm"];
        case "leave-helm": return p.mode === "interior" && p.interiorId === dock?.vehicleId ? [] : ["not in the carrier interior after leaving the helm"];
        case "enter-interior": return p.mode === "interior" && p.interiorId === dock?.vehicleId ? [] : ["not in the carrier interior after entering"];
        case "leave-interior": return p.mode === "swimming" && p.interiorId === null ? [] : ["still aboard after leaving the interior"];
        case "launch": case "capture": return dock?.transaction?.vehicleId === c.vehicleId || (c.action === "launch"
          ? vehicle(after, c.vehicleId)?.berth === null : !!vehicle(after, c.vehicleId)?.berth) ? [] : [`${c.action} of ${c.vehicleId} did not start`];
        default: return [];
      }
    }
    default: return [];
  }
}
