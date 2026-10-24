/** SIG-1 rule staging: a hull with signature upgrades fitted, as if each had been
 * paid at its bench. Saves require every fitted upgrade's recipe in
 * `knowledge.crafted`, with its plan known and its own needs paid, so the staging
 * records that chain (the fitted suit follows the highest suit refit recorded).
 * Diagnostic only: earned play goes through the benches. */
import { EVIDENCE_BLUEPRINTS, RECIPES, TECH_RECORDS } from "../src/content/registry.js";
import type { EvidenceId, HullId, ItemKind, RecipeId, TechRecordId } from "../src/content/registry.js";
import { discover, readTechRecord } from "../src/sim/progression.js";
import { STORY_GRANTS } from "../src/content/story/evidence.js";
import type { UpgradeId } from "../src/content/upgrades/catalogue.js";
import { SUIT_REFITS } from "../src/content/registry.js";
import { addItem } from "../src/sim/inventory.js";
import { makeVehicle } from "../src/sim/state.js";
import { vehicleHoldCapacity } from "../src/sim/fittings.js";
import { slotOf } from "../src/sim/upgrades/fitting.js";
import type { GameState, Vec3, VehicleState } from "../src/sim/types.js";

/** Earns a plan through its real source: a technical record read, else a clue found. */
export function earnPlan(s: GameState, bp: string): void {
  if ((s.knowledge.blueprints as readonly string[]).includes(bp)) return;
  const record = (Object.keys(TECH_RECORDS) as TechRecordId[]).find((id) => (TECH_RECORDS[id].blueprints as readonly string[]).includes(bp));
  if (record) { readTechRecord(s, record); return; }
  const clue = (Object.keys(EVIDENCE_BLUEPRINTS) as EvidenceId[]).find((id) => (EVIDENCE_BLUEPRINTS[id] as readonly string[]).includes(bp)) ??
    (Object.keys(STORY_GRANTS) as (keyof typeof STORY_GRANTS)[]).find((id) => (STORY_GRANTS[id] as readonly string[]).includes(bp));
  if (!clue) throw new Error(`no record or clue grants ${bp}`);
  discover(s, clue as EvidenceId);
  if (!(s.knowledge.blueprints as readonly string[]).includes(bp)) throw new Error(`finding ${clue} did not grant ${bp}`);
}
/** Records `id` as paid, with its plan and every recipe it needs (depth first). */
export function stagePaid(s: GameState, id: string): void {
  if (!Object.hasOwn(RECIPES, id) || s.knowledge.crafted.includes(id as RecipeId)) return;
  const r = RECIPES[id as RecipeId];
  for (const need of r.needs) stagePaid(s, need);
  earnPlan(s, r.bp);
  s.knowledge.crafted.push(id as RecipeId);
  // The one fitted suit is the highest refit tier recorded.
  const suit = s.inventory.items.find((i) => i.fitted === "suit");
  const best = (Object.keys(SUIT_REFITS) as (keyof typeof SUIT_REFITS)[]).filter((k) => s.knowledge.crafted.includes(k)).at(-1);
  if (suit && best) suit.kind = best as ItemKind;
}
/** Fit `kinds` to `v`, each as a paid module in its slot, and resize its hold. */
export function fitPaid(s: GameState, v: VehicleState, kinds: readonly UpgradeId[]): void {
  for (const k of kinds) {
    stagePaid(s, k);
    v.modules.push(addItem(s, k as ItemKind, 1, v.cargoId, slotOf(v.hull, k) === "socket" ? null : "mount").id);
  }
  s.inventory.containers.find((c) => c.id === v.cargoId)!.capacity = vehicleHoldCapacity(s, v);
}
/** A staged hull of `hull` at `p`, paid at its build cost, optionally piloted. */
export function stagedHull(s: GameState, hull: Exclude<HullId, "hearthline">, p: Vec3, kinds: readonly UpgradeId[] = [], pilot = true, yaw = 0): VehicleState {
  // A campaign fleet holds one hull of each kind: reuse the earned one when it exists.
  const earned = s.fleet.vehicles.find((x) => x.hull === hull);
  const v = earned ?? makeVehicle(`${hull}_sig`, hull, { ...p }, `${hull}_sig_hold`);
  v.pose.position = { ...p }; v.pose.yaw = yaw; v.velocity = { x: 0, y: 0, z: 0 };
  if (!earned) {
    v.investment = { ...RECIPES[`${hull}_base` as RecipeId].cost };
    stagePaid(s, `${hull}_base`);
    s.fleet.vehicles.push(v);
    s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", capacity: 0, ownerId: v.id });
  }
  fitPaid(s, v, kinds);
  if (pilot) {
    s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.interiorId = null; s.player.interiorPose = null;
    s.player.pose = structuredClone(v.pose);
  }
  return v;
}
