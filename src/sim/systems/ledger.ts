// FORK(ledger): a second inventory arithmetic beside sim/inventory.ts (used
// capacity, stack merging, and container-order spending where inventory.ts spends
// in inventory order); retire in SIG-1 stage 0 (docs/build/CORE-HELPERS.md).
/** Inventory arithmetic that knows SYS-2 item sizes, written when inventory.ts read
 * ITEMS only. SYS2_ITEMS are composed into the registry now; SIG-1 stage 0 makes
 * inventory.ts the one authority, with planSpend/applySpend as the single spend path. */
import { ITEMS, MATERIALS } from "../../content/registry.js";
import type { ItemKind } from "../../content/registry.js";
import { isSys2Item, stackable, SYS2_ITEMS } from "../../content/systems/items.js";
import { containerAccepts, nextId } from "../inventory.js";
import type { GameState, ItemStack } from "../types.js";

/** Unknown kinds weigh Infinity so any room check fails closed. */
export function cuOf(kind: string): number {
  if (Object.hasOwn(ITEMS, kind)) return ITEMS[kind as ItemKind].cu;
  return isSys2Item(kind) ? SYS2_ITEMS[kind].cu : Infinity;
}
export function labelOf(kind: string): string {
  if (Object.hasOwn(ITEMS, kind)) return ITEMS[kind as ItemKind].label;
  return isSys2Item(kind) ? SYS2_ITEMS[kind].label : kind;
}
export const itemCu = (i: Pick<ItemStack, "kind" | "quantity">): number => cuOf(i.kind) * i.quantity;

export function usedCu(s: GameState, containerId: string): number {
  return s.inventory.items.filter((i) => i.containerId === containerId && !i.fitted)
    .reduce((n, i) => n + itemCu(i), 0);
}
export function freeCu(s: GameState, containerId: string): number {
  const c = s.inventory.containers.find((c) => c.id === containerId);
  return c ? c.capacity - usedCu(s, containerId) : 0;
}
export const accepts = (s: GameState, containerId: string, kind: string): boolean =>
  containerAccepts(s, containerId, kind as ItemKind);

/** Adds to a matching stack for stackable kinds, otherwise a new instance.
 * Cells (reserve and bio) start charged. */
export function addStack(s: GameState, kind: string, quantity: number, containerId: string): ItemStack {
  const merge = stackable(kind, MATERIALS) && s.inventory.items.find((i) =>
    i.kind === kind && i.containerId === containerId && i.fitted === null && i.provenance === "public" && i.charge === null);
  if (merge) { merge.quantity += quantity; return merge; }
  const item = {
    id: nextId(s, "item"), kind: kind as ItemKind, quantity, containerId, fitted: null,
    charge: kind === "reserve_cell" || kind === "bio_cell" ? 100 : null, provenance: "public",
  } satisfies ItemStack;
  s.inventory.items.push(item);
  return item;
}
/** Puts back one single-instance item (a module or kit) under its original ID. */
export function restoreInstance(s: GameState, itemId: string, kind: string, containerId: string): ItemStack {
  const item = { id: itemId, kind: kind as ItemKind, quantity: 1, containerId, fitted: null, charge: null, provenance: "public" } satisfies ItemStack;
  s.inventory.items.push(item);
  return item;
}
export function removeFrom(s: GameState, item: ItemStack, n: number): void {
  item.quantity -= n;
  if (item.quantity <= 0) s.inventory.items = s.inventory.items.filter((i) => i !== item);
}

export interface SpendLine { itemId: string; kind: string; quantity: number; from: string }
/** A detached plan to pay `cost` from `containers` in order; `missing` lists any shortfall. */
export function planSpend(s: GameState, cost: Readonly<Record<string, number | undefined>>,
  containers: readonly string[]): { lines: SpendLine[]; missing: Record<string, number> } {
  const lines: SpendLine[] = [], missing: Record<string, number> = {};
  for (const [kind, need] of Object.entries(cost)) {
    let left = need ?? 0;
    for (const c of containers)
      for (const i of s.inventory.items)
        if (left > 0 && i.kind === kind && i.containerId === c && !i.fitted && i.provenance === "public") {
          const use = Math.min(left, i.quantity);
          lines.push({ itemId: i.id, kind, quantity: use, from: c });
          left -= use;
        }
    if (left > 0) missing[kind] = left;
  }
  return { lines, missing };
}
export function applySpend(s: GameState, lines: readonly SpendLine[]): void {
  for (const l of lines) removeFrom(s, s.inventory.items.find((i) => i.id === l.itemId)!, l.quantity);
}
export const costText = (cost: Readonly<Record<string, number | undefined>>): string =>
  Object.entries(cost).map(([k, n]) => `${n} × ${labelOf(k)}`).join(", ");
