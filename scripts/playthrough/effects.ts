/** Effect verification. A command the game accepted is not proof that it did what
 * it says; after every accepted command the driver checks the effect on the real
 * state (before → after). Inventory effects are conservation checks over the whole
 * inventory ledger: exactly the requested quantities move, from the requested
 * place, to the required place, and nothing else changes. Every command kind has a
 * rule; an unknown kind fails closed. A missing or wrong effect is a Blocked finding. */
import * as registry from "../../src/content/registry.js";
import { HULLS, ITEMS, MATERIALS, RECIPES, SOURCES } from "../../src/content/registry.js";
import type { RecipeId, SourceId } from "../../src/content/registry.js";
import { personalLimit } from "../../src/sim/capabilities.js";
import { fabricationContainers } from "../../src/sim/inventory.js";
import { aimedInteraction } from "../../src/sim/targeting.js";
import { craftSite } from "../../src/sim/progression.js";
import { outpostChargerFor } from "../../src/sim/systemsLink.js";
import type { GameCommand, GameEvent, GameState, ItemStack, WorldQueries } from "../../src/sim/types.js";

const vehicle = (s: GameState, id: string | undefined) => s.fleet.vehicles.find((v) => v.id === id);

/** Quantity per (container, kind, fitting, provenance): the conserved ledger. */
const keyOf = (i: Pick<ItemStack, "containerId" | "kind" | "fitted" | "provenance">): string =>
  `${i.containerId}|${i.kind}|${i.fitted ?? "-"}|${i.provenance}`;
function ledger(s: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of s.inventory.items) m.set(keyOf(i), (m.get(keyOf(i)) ?? 0) + i.quantity);
  return m;
}
/** Nonzero ledger changes, before → after. */
function changes(before: GameState, after: GameState): Map<string, number> {
  const a = ledger(before), b = ledger(after), out = new Map<string, number>();
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const d = (b.get(k) ?? 0) - (a.get(k) ?? 0);
    if (d !== 0) out.set(k, d);
  }
  return out;
}
/** The ledger changed exactly as `expected` (key → delta), and nowhere else. */
function conserved(label: string, actual: Map<string, number>, expected: ReadonlyMap<string, number>): string[] {
  const out: string[] = [];
  for (const k of new Set([...actual.keys(), ...expected.keys()])) {
    const got = actual.get(k) ?? 0, want = expected.get(k) ?? 0;
    if (got !== want) out.push(`${label}: ${k} changed by ${got}, expected ${want}`);
  }
  return out;
}
const add = (m: Map<string, number>, k: string, d: number): void => { m.set(k, (m.get(k) ?? 0) + d); };
const unchangedInventory = (label: string, before: GameState, after: GameState): string[] => conserved(label, changes(before, after), new Map());

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
/** Fitted outputs of the game's craft rule (sim/progression.ts). */
const FITTED_OUTPUTS: Readonly<Record<string, string>> = { essential_tools: "tools", suit_150: "suit", bobbin_kit: "recovery" };

/** Everything a craft must have done. Returns problems; empty means verified. */
export function craftEffect(before: GameState, after: GameState, id: RecipeId): string[] {
  const r = RECIPES[id] as (typeof RECIPES)[RecipeId] & { output: string; site: string };
  const out: string[] = [];
  if (!(after.knowledge.crafted as string[]).includes(id)) out.push(`${id} is not recorded as crafted`);
  const actual = changes(before, after), expected = new Map<string, number>();
  // Cost: exactly the cost leaves, only from the bench's own containers, public stock only.
  if (r.maintenance) {
    const m0 = before.world.maintenance, m1 = after.world.maintenance;
    if (m0.alloy - m1.alloy !== 2 || m0.glass - m1.glass !== 1 || m0.membrane - m1.membrane !== 3)
      out.push(`${id} did not draw 2/1/3 rescue stock (alloy ${m0.alloy}→${m1.alloy}, glass ${m0.glass}→${m1.glass}, membrane ${m0.membrane}→${m1.membrane})`);
  } else {
    // C4: the bench the recipe ran at (a refit at its tier's restored stop pays there).
    const bins = new Set(fabricationContainers(before, craftSite(before, id)));
    for (const [kind, n] of Object.entries(r.cost) as [string, number][]) {
      let taken = 0;
      for (const [k, d] of actual) {
        const [container, k2, fitted, provenance] = k.split("|");
        if (k2 !== kind || d >= 0) continue;
        if (!bins.has(container!) || fitted !== "-" || provenance !== "public")
          out.push(`${id} took ${-d} ${kind} from ${container} (${fitted}, ${provenance}), outside the bench's stock`);
        taken -= d;
        expected.set(k, d);
      }
      if (taken !== n) out.push(`${id} consumed ${taken} ${kind}, not ${n}`);
    }
  }
  // Output: the required place, fitting and quantity.
  const refit = refitOf(id), suit = suitOf(id);
  if (refit) {
    const raised = after.fleet.vehicles.filter((v) => v.hull === refit.hull && v.rating === refit.rating &&
      (vehicle(before, v.id)?.rating ?? 0) < refit.rating);
    if (raised.length !== 1) out.push(`${id} left no ${refit.hull} newly rated ${refit.rating} m (ratings: ${after.fleet.vehicles
      .filter((v) => v.hull === refit.hull).map((v) => v.rating).join(", ") || "none"})`);
  } else if (suit && id !== "suit_150") {
    // An in-place refit: the one fitted suit changes kind in the equipment slot.
    const old = before.inventory.items.find((i) => i.fitted === "suit");
    if (!old) out.push(`${id}: no fitted suit to refit`);
    else {
      add(expected, keyOf(old), -1);
      add(expected, keyOf({ ...old, kind: id as ItemStack["kind"] }), +1);
      if (after.inventory.items.find((i) => i.id === old.id)?.kind !== id) out.push(`${id} did not refit suit ${old.id} in place`);
    }
    if (personalLimit(after) !== suit) out.push(`${id} left the personal suit at ${personalLimit(after)} m, not ${suit} m`);
  } else if (Object.hasOwn(HULLS, r.output)) {
    const n0 = before.fleet.vehicles.filter((v) => v.hull === r.output).length, n1 = after.fleet.vehicles.filter((v) => v.hull === r.output).length;
    if (n1 !== n0 + 1) out.push(`${id} built ${n1 - n0} ${r.output} hulls, not 1`);
  } else if (Object.hasOwn(ITEMS, r.output)) {
    const fitted = FITTED_OUTPUTS[r.output];
    // Mount packages go to the workshop locker when it has room after paying, else the
    // diver hold; stripped frames to the locker; everything else to the diver hold.
    const lockerFree = () => {
      const c = before.inventory.containers.find((x) => x.id === "workshop_locker")!;
      const used = before.inventory.items.filter((i) => i.containerId === c.id && !i.fitted).reduce((n, i) => n + ITEMS[i.kind].cu * i.quantity, 0);
      const freed = [...actual].filter(([k, d]) => k.startsWith("workshop_locker|") && d < 0)
        .reduce((n, [k, d]) => n - d * ITEMS[k.split("|")[1] as keyof typeof ITEMS].cu, 0);
      return c.capacity - used + freed;
    };
    const to = fitted ? "equipment" : id === "strip_frame" ? "workshop_locker"
      : r.output === "creel_cargo_rack" || r.output === "creel_cabin" ? (lockerFree() >= ITEMS[r.output].cu ? "workshop_locker" : "diver") : "diver";
    add(expected, keyOf({ containerId: to, kind: r.output as ItemStack["kind"], fitted: (fitted ?? null) as ItemStack["fitted"],
      provenance: r.maintenance ? "maintenance" : "public" }), r.quantity);
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
  return [...out, ...conserved(id, actual, expected)];
}

/** A transfer: the requested stack loses exactly N, the destination gains exactly N
 * of the same kind and provenance, nothing else moves; a whole stack keeps its ID. */
export function transferEffect(c: Extract<GameCommand, { type: "transfer" }>, before: GameState, after: GameState): string[] {
  const item = before.inventory.items.find((i) => i.id === c.itemId);
  if (!item) return [`transfer of unknown item ${c.itemId}`];
  const expected = new Map<string, number>();
  add(expected, keyOf(item), -c.quantity);
  add(expected, keyOf({ ...item, containerId: c.to, fitted: null }), c.quantity);
  const out = conserved(`transfer ${c.itemId}`, changes(before, after), expected);
  const now = after.inventory.items.find((i) => i.id === c.itemId);
  if (c.quantity === item.quantity ? now?.containerId !== c.to : now?.containerId !== item.containerId || now.quantity !== item.quantity - c.quantity)
    out.push(`transfer ${c.itemId}: the requested stack is not where and how large it should be`);
  return out;
}

/** A bulk store: every selected public material stack in `from` arrives whole in `to`. */
export function storeEffect(c: Extract<GameCommand, { type: "store-materials" }>, before: GameState, after: GameState): string[] {
  const installed = new Set(before.fleet.vehicles.flatMap((v) => v.modules));
  const selected = before.inventory.items.filter((i) => i.containerId === c.from && !i.fitted && i.provenance === "public" &&
    Object.hasOwn(MATERIALS, i.kind) && !installed.has(i.id));
  if (!selected.length) return ["store-materials selected nothing"];
  const expected = new Map<string, number>();
  for (const i of selected) { add(expected, keyOf(i), -i.quantity); add(expected, keyOf({ ...i, containerId: c.to }), i.quantity); }
  return conserved(`store ${c.from} → ${c.to}`, changes(before, after), expected);
}

/** Effects of every command the harness issues. Returns problems. Exhaustive: an
 * unknown kind fails closed. `world` and `events` describe the command's context. */
export function commandEffect(c: GameCommand, before: GameState, after: GameState, world: WorldQueries, events: readonly GameEvent[]): string[] {
  const p = after.player;
  const kind = (c as { type: string }).type;
  switch (kind) {
    case "craft": return craftEffect(before, after, (c as Extract<GameCommand, { type: "craft" }>).recipeId);
    case "transfer": return transferEffect(c as Extract<GameCommand, { type: "transfer" }>, before, after);
    case "store-materials": return storeEffect(c as Extract<GameCommand, { type: "store-materials" }>, before, after);
    case "service": {
      const id = (c as Extract<GameCommand, { type: "service" }>).vehicleId, v = vehicle(after, id), v0 = vehicle(before, id);
      // C4: a field outpost's charger only charges (cells outposts as far as their cells go).
      const charger = !!outpostChargerFor(before, id) && v0 !== undefined && v !== undefined && v.charge > v0.charge && v.health === v0.health;
      return [...(charger || (v && v.charge === 100 && v.health === 100 && !v.disabled) ? [] : [`service left ${id} at power ${v?.charge}, hull ${v?.health}`]),
        ...unchangedInventory("service", before, after)];
    }
    case "reserve": {
      const id = (c as Extract<GameCommand, { type: "reserve" }>).vehicleId, v0 = vehicle(before, id), v1 = vehicle(after, id);
      return [...(v0 && v1 && v1.charge > v0.charge ? [] : [`reserve cell added no power to ${id}`]), ...unchangedInventory("reserve", before, after)];
    }
    case "install-module": {
      const cm = c as Extract<GameCommand, { type: "install-module" }>, v = vehicle(after, cm.vehicleId);
      const item = before.inventory.items.find((i) => i.id === cm.itemId), now = after.inventory.items.find((i) => i.id === cm.itemId);
      if (!v?.modules.includes(cm.itemId) || !item || !now) return [`${cm.itemId} is not installed on ${cm.vehicleId}`];
      // Only the package moves (a swapped-out mount may be stowed); the package keeps its identity.
      const expected = new Map<string, number>();
      add(expected, keyOf(item), -1); add(expected, keyOf(now), +1);
      for (const old of before.fleet.vehicles.find((x) => x.id === cm.vehicleId)?.modules ?? []) {
        const o0 = before.inventory.items.find((i) => i.id === old), o1 = after.inventory.items.find((i) => i.id === old);
        if (o0 && o1 && keyOf(o0) !== keyOf(o1)) { add(expected, keyOf(o0), -1); add(expected, keyOf(o1), +1); }
      }
      return conserved(`install ${cm.itemId}`, changes(before, after), new Map([...expected].filter(([, d]) => d !== 0)));
    }
    case "recover": {
      const cm = c as Extract<GameCommand, { type: "recover" }>, v = vehicle(after, cm.vehicleId);
      if (cm.method === "salvage") return [`salvage is not verified by this harness (it never salvages)`];
      const own = cm.method === "repair" ? (v && !v.disabled && v.health > 0 ? [] : [`repair left ${cm.vehicleId} disabled`])
        : after.recovery.operation?.vehicleId === cm.vehicleId ? [] : [`tow of ${cm.vehicleId} started no recovery operation`];
      return [...own, ...unchangedInventory(`recover ${cm.method}`, before, after)];
    }
    case "arm-lift": return [...(after.world.action?.kind === "arm" ? [] : ["tool arms did not start"]), ...unchangedInventory("arm-lift", before, after)];
    case "eat": {
      const delta = changes(before, after), meals = [...delta].filter(([k]) => k.split("|")[1] === "meal");
      return [...(p.vitals.food > before.player.vitals.food ? [] : ["eating raised no food"]),
        ...(delta.size === 1 && meals.length === 1 && meals[0]![1] === -1 ? [] : [`eating changed the inventory by ${JSON.stringify([...delta])}, not one meal`])];
    }
    case "lamp": return [...(p.lamp !== before.player.lamp ? [] : ["the lamp did not switch"]), ...unchangedInventory("lamp", before, after)];
    case "exit": return [...(p.controlledVehicleId === null && p.interiorId === null ? [] : ["the diver is still aboard after exit"]),
      ...unchangedInventory("exit", before, after)];
    case "carrier": {
      const cm = c as Extract<GameCommand, { type: "carrier" }>, dock = after.fleet.docking;
      const own = (() => {
        switch (cm.action) {
          case "station-keep": return dock?.stationKeeping ? [] : ["station keeping is not engaged"];
          case "helm": return p.mode === "piloting" && p.controlledVehicleId === dock?.vehicleId ? [] : ["not at the carrier helm"];
          case "leave-helm": return p.mode === "interior" && p.interiorId === dock?.vehicleId ? [] : ["not in the carrier interior after leaving the helm"];
          case "enter-interior": return p.mode === "interior" && p.interiorId === dock?.vehicleId ? [] : ["not in the carrier interior after entering"];
          case "leave-interior": return p.mode === "swimming" && p.interiorId === null ? [] : ["still aboard after leaving the interior"];
          case "launch": case "capture": return dock?.transaction?.vehicleId === cm.vehicleId || (cm.action === "launch"
            ? vehicle(after, cm.vehicleId)?.berth === null : !!vehicle(after, cm.vehicleId)?.berth) ? [] : [`${cm.action} of ${cm.vehicleId} did not start`];
          case "reconfigure": return dock && dock.configuration !== before.fleet.docking?.configuration ? [] : ["the berth configuration did not change"];
          default: return [`carrier action ${cm.action} is not verified by this harness`];
        }
      })();
      return [...own, ...unchangedInventory(`carrier ${cm.action}`, before, after)];
    }
    case "interact": return interactEffect(before, after, world, events);
    case "works": {
      // Proposed C3 command: the works state must change; inventory may only lose
      // what the works consume (assemblies, restoration stock), never gain.
      const gains = [...changes(before, after)].filter(([, d]) => d > 0);
      return [...(JSON.stringify(after.story.works) !== JSON.stringify(before.story.works) ? [] : ["the works state did not change"]),
        ...gains.map(([k, d]) => `works added ${d} to ${k}`)];
    }
    case "resolution": return [...(after.story.resolution.phase !== before.story.resolution.phase ? [] : ["the resolution did not advance"]),
      ...unchangedInventory("resolution", before, after)];
    // C4 systems. Modules and kits keep their identity: an installed module leaves
    // the inventory into a socket, a deployed kit into the world, and back.
    case "install-host-module": {
      const cm = c as Extract<GameCommand, { type: "install-host-module" }>, item = before.inventory.items.find((i) => i.id === cm.itemId);
      const socketed = after.systems.sockets.some((e) => e.hostId === cm.hostId && e.socket === cm.socket && e.itemId === cm.itemId);
      if (!item || !socketed) return [`${cm.itemId} is not in ${cm.hostId} ${cm.socket}`];
      return conserved(`install ${cm.itemId}`, changes(before, after), new Map([[keyOf(item), -1]]));
    }
    case "deploy-outpost": {
      const cm = c as Extract<GameCommand, { type: "deploy-outpost" }>, item = before.inventory.items.find((i) => i.id === cm.itemId);
      if (!item || !after.systems.outposts.some((o) => o.id === cm.itemId)) return [`kit ${cm.itemId} was not deployed`];
      return conserved(`deploy ${cm.itemId}`, changes(before, after), new Map([[keyOf(item), -1]]));
    }
    case "pack-outpost": {
      const cm = c as Extract<GameCommand, { type: "pack-outpost" }>;
      const kit = after.inventory.items.find((i) => i.id === cm.outpostId);
      if (after.systems.outposts.some((o) => o.id === cm.outpostId) || !kit) return [`outpost ${cm.outpostId} was not packed into its kit`];
      // The kit returns with its identity; only the pack's anchor and seal material is spent.
      const gains = [...changes(before, after)].filter(([k, d]) => d > 0 && k.split("|")[1] !== kit.kind);
      return gains.map(([k, d]) => `packing added ${d} to ${k}`);
    }
    case "start-decode": {
      const cm = c as Extract<GameCommand, { type: "start-decode" }>;
      return [...(after.systems.decodes.some((j) => j.decodable === cm.decodable) ? [] : [`decode of ${cm.decodable} did not start`]),
        ...unchangedInventory("start-decode", before, after)];
    }
    case "plant": {
      const cm = c as Extract<GameCommand, { type: "plant" }>, delta = [...changes(before, after)];
      return [...(after.systems.planters.length === before.systems.planters.length + 1 ? [] : ["nothing was planted"]),
        ...(delta.length === 1 && delta[0]![0].split("|")[1] === cm.seed && delta[0]![1] === -1 ? [] : [`planting changed the inventory by ${JSON.stringify(delta)}`])];
    }
    case "harvest": {
      const delta = [...changes(before, after)];
      return delta.length && delta.every(([, d]) => d > 0) ? [] : [`harvest changed the inventory by ${JSON.stringify(delta)}`];
    }
    case "rest": return [...(after.player.refugeId !== before.player.refugeId || after.player.refugeId ? [] : ["resting recorded no base"]),
      ...unchangedInventory("rest", before, after)];
    default: return [`command kind "${kind}" has no effect rule; refusing to vouch for it`];
  }
}

/** E: the effect depends on what was aimed at before the press. */
function interactEffect(before: GameState, after: GameState, world: WorldQueries, events: readonly GameEvent[]): string[] {
  if (before.opening.phase < 4)
    return after.opening.phase > before.opening.phase ? unchangedInventory("opening", before, after) : ["the opening did not advance"];
  if (before.player.controlledVehicleId)
    return after.player.controlledVehicleId === null ? unchangedInventory("exit by E", before, after) : ["E at the helm did not exit"];
  const t = aimedInteraction(before, world);
  if (!t) return unchangedInventory("E on nothing", before, after);
  const panel = events.some((e) => e.type === "interaction-panel");
  if (t.kind === "source") {
    const id = t.id as SourceId, def = SOURCES[id];
    const n0 = before.world.resources.find((n) => n.id === id)!.stock, n1 = after.world.resources.find((n) => n.id === id)!.stock;
    if (n1 === n0) {
      // A timed action (frame lift, sorting, tending) starts instead of a pickup.
      return after.world.action?.sourceId === id ? unchangedInventory(`start work at ${id}`, before, after)
        : t.verb === "empty" ? unchangedInventory(`empty ${id}`, before, after) : [`E on ${id} took nothing and started nothing`];
    }
    const taken = n0 - n1, delta = changes(before, after);
    const gains = [...delta].filter(([, d]) => d !== 0);
    const ok = gains.length === 1 && gains[0]![1] === taken && ["diver", "buoy_hold"].includes(gains[0]![0].split("|")[0]!) &&
      gains[0]![0].split("|")[1] === def.item && gains[0]![0].endsWith("|-|public");
    return ok ? [] : [`collecting ${taken} from ${id} changed the inventory by ${JSON.stringify(gains)}`];
  }
  if (t.kind === "vehicle" && t.verb === "board")
    return after.player.controlledVehicleId === t.id ? unchangedInventory(`board ${t.id}`, before, after) : [`E did not board ${t.id}`];
  if (t.kind === "evidence" || t.kind === "record") {
    const grew = JSON.stringify([after.knowledge.evidence, after.knowledge.journals, after.story.discoveries, after.knowledge.scans]) !==
      JSON.stringify([before.knowledge.evidence, before.knowledge.journals, before.story.discoveries, before.knowledge.scans]);
    return t.known && panel ? unchangedInventory(`review ${t.id}`, before, after)
      : grew ? unchangedInventory(`read ${t.id}`, before, after) : [`reading ${t.id} recorded nothing`];
  }
  // Benches, mooring masts, rescue staging, cache and vehicle-hold panels: a panel opens, nothing else.
  return panel ? unchangedInventory(`open ${t.id}`, before, after) : [`E on ${t.id} opened no panel and had no other rule`];
}
